BEGIN;
ALTER TABLE public.traffic_weekly_settings ADD COLUMN optimization_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN optimization_weekday smallint NOT NULL DEFAULT 3 CHECK(optimization_weekday BETWEEN 1 AND 5),
  ADD COLUMN optimization_enabled_since date;
ALTER TABLE public.traffic_weekly_reviews ADD COLUMN kind text NOT NULL DEFAULT 'review' CHECK(kind IN ('review','optimization')),
  ADD COLUMN metric_mode text NOT NULL DEFAULT 'client' CHECK(metric_mode IN ('client','campaign')),
  ADD COLUMN campaign_metrics jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(campaign_metrics)='array');
ALTER TABLE public.traffic_weekly_reviews DROP CONSTRAINT traffic_weekly_reviews_client_id_week_start_key,
  ADD CONSTRAINT traffic_weekly_reviews_client_week_kind_key UNIQUE(client_id,week_start,kind);
ALTER TABLE public.traffic_weekly_generation_issues ADD COLUMN kind text NOT NULL DEFAULT 'review' CHECK(kind IN ('review','optimization'));
ALTER TABLE public.traffic_weekly_generation_issues DROP CONSTRAINT traffic_weekly_generation_issues_pkey,
  ADD PRIMARY KEY(client_id,due_on,kind);

CREATE FUNCTION public.save_traffic_routine_settings(p_client uuid,p_enabled boolean,p_weekday integer,p_starts_on date,
  p_result_label text,p_assignee uuid,p_optimization_enabled boolean,p_optimization_weekday integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE old_settings public.traffic_weekly_settings; today date:=public.central_trafego_operational_date();
BEGIN
  IF NOT planeje_private.traffic_weekly_manager() THEN RAISE insufficient_privilege USING MESSAGE='Somente gestores podem configurar a rotina.'; END IF;
  IF p_optimization_weekday IS NULL OR p_optimization_weekday NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Confira o dia da otimização.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('traffic-weekly-settings:'||p_client::text,0));
  SELECT * INTO old_settings FROM public.traffic_weekly_settings WHERE client_id=p_client FOR UPDATE;
  PERFORM public.save_traffic_weekly_settings(p_client,p_enabled,p_weekday,p_starts_on,p_result_label,p_assignee);
  UPDATE public.traffic_weekly_settings SET optimization_enabled=coalesce(p_optimization_enabled,false), optimization_weekday=p_optimization_weekday,
    optimization_enabled_since=CASE WHEN old_settings.client_id IS NULL THEN greatest(today,p_starts_on)
      WHEN (NOT old_settings.optimization_enabled AND p_optimization_enabled) OR old_settings.optimization_weekday<>p_optimization_weekday THEN today
      ELSE old_settings.optimization_enabled_since END
    WHERE client_id=p_client;
  INSERT INTO public.traffic_weekly_history(client_id,event,actor_id,snapshot)
    SELECT p_client,'settings',auth.uid(),jsonb_build_object('before',to_jsonb(old_settings),'after',to_jsonb(s),'primary_assignee_id',p_assignee)
    FROM public.traffic_weekly_settings s WHERE client_id=p_client;
END;
$$;

-- Only identifiers/names are returned: no Ads credentials or account notes.
CREATE FUNCTION planeje_private.traffic_routine_accounts(p_client uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'platform',platform,'account_id',account_id,'account_name',account_name) ORDER BY platform,account_name),'[]'::jsonb)
  FROM (SELECT id,'meta'::text AS platform,meta_account_id AS account_id,meta_account_name AS account_name FROM public.cliente_meta_accounts WHERE cliente_id=p_client AND is_active
    UNION ALL SELECT id,'google',google_customer_id,google_customer_name FROM public.cliente_google_ads_accounts WHERE cliente_id=p_client AND is_active) a;
$$;

CREATE FUNCTION planeje_private.traffic_routine_campaign_metrics(p_client uuid,p_rows jsonb,p_finalize boolean,p_context_only boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE row jsonb; account jsonb; out_rows jsonb:='[]'; identity text; seen text[]:='{}'; ids uuid[]:='{}'; row_id uuid; val numeric; field text;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)>50 THEN RAISE EXCEPTION 'Confira os dados das campanhas (até 50 por revisão).'; END IF;
  FOR row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    IF jsonb_typeof(row)<>'object' THEN RAISE EXCEPTION 'Campanha inválida.'; END IF;
    row_id:=nullif(row->>'id','')::uuid;
    IF row_id IS NULL OR row_id=ANY(ids) THEN RAISE EXCEPTION 'Identificador da linha ausente ou duplicado.'; END IF;
    ids:=array_append(ids,row_id);
    IF nullif(row->>'account_link_id','') IS NOT NULL THEN
      SELECT a INTO account FROM jsonb_array_elements(planeje_private.traffic_routine_accounts(p_client)) a WHERE a->>'id'=row->>'account_link_id';
      IF account IS NULL THEN RAISE EXCEPTION 'Escolha uma conta ativa deste cliente ou registre a conta manualmente.'; END IF;
      row:=row||account||jsonb_build_object('id',row_id,'account_link_id',account->>'id','account_name',coalesce(nullif(account->>'account_name',''),account->>'account_id'));
    ELSE
      IF coalesce(row->>'platform','') NOT IN ('meta','google','other') OR nullif(btrim(row->>'account_id'),'') IS NULL
        OR nullif(btrim(row->>'account_name'),'') IS NULL THEN RAISE EXCEPTION 'Informe plataforma, nome e ID da conta de anúncios.'; END IF;
    END IF;
    IF nullif(btrim(row->>'campaign_name'),'') IS NULL OR (NOT p_context_only AND nullif(btrim(row->>'conversion_label'),'') IS NULL) THEN RAISE EXCEPTION 'Informe campanha e qual conversão está sendo contada.'; END IF;
    FOREACH field IN ARRAY ARRAY['account_id','account_name','campaign_id','campaign_name','conversion_label'] LOOP
      IF length(coalesce(row->>field,''))>200 THEN RAISE EXCEPTION 'Nome ou identificador da campanha muito longo.'; END IF;
    END LOOP;
    identity:=lower(btrim(row->>'platform'))||':'||lower(btrim(row->>'account_id'))||':'||lower(btrim(coalesce(nullif(row->>'campaign_id',''),row->>'campaign_name')));
    IF identity=ANY(seen) THEN RAISE EXCEPTION 'Esta campanha já foi incluída na revisão. Não repita o investimento.'; END IF;
    seen:=array_append(seen,identity);
    FOREACH field IN ARRAY ARRAY['spend','conversions','calls','daily_budget','cpc'] LOOP
      val:=CASE WHEN p_context_only THEN NULL ELSE nullif(row->>field,'')::numeric END;
      IF val<0 OR val>999999999999.99 OR val::text IN ('NaN','Infinity','-Infinity') OR (field='calls' AND val<>trunc(val)) THEN RAISE EXCEPTION 'Confira os números da campanha.'; END IF;
      IF p_finalize AND NOT p_context_only AND field IN ('spend','conversions') AND val IS NULL THEN RAISE EXCEPTION 'Confira gasto e conversões de cada campanha. Zero significa conferido.'; END IF;
      row:=jsonb_set(row,ARRAY[field],coalesce(to_jsonb(val),'null'::jsonb));
    END LOOP;
    out_rows:=out_rows||jsonb_build_array(jsonb_build_object('id',row_id,'platform',btrim(row->>'platform'),'account_link_id',nullif(row->>'account_link_id',''),
      'account_id',btrim(row->>'account_id'),'account_name',btrim(row->>'account_name'),'campaign_id',btrim(coalesce(row->>'campaign_id','')),
      'campaign_name',btrim(row->>'campaign_name'),'conversion_label',btrim(row->>'conversion_label'),
      'spend',row->'spend','conversions',row->'conversions','calls',row->'calls','daily_budget',row->'daily_budget','cpc',row->'cpc'));
  END LOOP;
  IF p_finalize AND jsonb_array_length(out_rows)=0 THEN RAISE EXCEPTION 'Adicione pelo menos uma campanha, ou use o resumo do cliente.'; END IF;
  RETURN out_rows;
END;
$$;
CREATE OR REPLACE FUNCTION planeje_private.traffic_weekly_generate(p_today date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s record; v_due date; v_week date; v_task uuid; v_review uuid; v_count integer:=0; v_errors integer:=0; k record;
BEGIN
  IF p_today IS DISTINCT FROM public.central_trafego_operational_date() THEN RAISE EXCEPTION 'Data de geração inválida.'; END IF;
  FOR s IN SELECT w.*,o.primary_assignee_id,c.empresa FROM public.traffic_weekly_settings w
    JOIN public.clientes c ON c.id=w.client_id LEFT JOIN public.traffic_client_ops o ON o.client_id=w.client_id
    WHERE (w.enabled OR w.optimization_enabled) AND c.etapa='closed' AND coalesce(o.situation,'active')<>'closed' FOR UPDATE OF w
  LOOP
    FOR k IN SELECT 'review'::text AS kind,s.enabled AS enabled,s.review_weekday AS weekday,s.enabled_since AS since
      UNION ALL SELECT 'optimization',s.optimization_enabled,s.optimization_weekday,s.optimization_enabled_since LOOP
    IF NOT k.enabled THEN CONTINUE; END IF;
    -- Catch up missed active cycles; disabled periods are not backfilled on resume.
    FOR v_due IN SELECT d::date FROM generate_series(
      planeje_private.traffic_weekly_due_on(greatest(s.starts_on,k.since,p_today-365),k.weekday)::timestamp,p_today::timestamp,interval '7 days') d
    LOOP
      BEGIN
        v_week:=date_trunc('week',v_due::timestamp)::date-CASE WHEN k.kind='review' THEN 7 ELSE 0 END;
        PERFORM pg_advisory_xact_lock(hashtextextended('traffic-weekly:'||s.client_id::text||':'||v_week::text||':'||k.kind,0));
        IF NOT EXISTS(SELECT 1 FROM public.traffic_weekly_reviews WHERE client_id=s.client_id AND week_start=v_week AND kind=k.kind) THEN
          v_task:=planeje_private.traffic_weekly_new_task(s.client_id,'['||s.empresa||'] '||CASE WHEN k.kind='review' THEN 'Revisar tráfego' ELSE 'Otimizar campanhas' END||' da semana '||to_char(v_week,'DD/MM')||' a '||to_char(v_week+6,'DD/MM'),v_due,s.primary_assignee_id,NULL,
            CASE WHEN k.kind='review' THEN 'Conferir os resultados da semana anterior e registrar análise e próxima ação em Tráfego → Rotina semanal.'
              ELSE 'Conferir campanhas, saldo e desempenho atual. Registrar os ajustes, ou por que nenhuma alteração foi necessária, em Tráfego → Rotina semanal.' END,
            CASE WHEN k.kind='review' THEN 'relatorio' ELSE 'ajuste' END,
            CASE WHEN k.kind='review' THEN 'weekly_review:' ELSE 'weekly_optimization:' END||s.client_id::text||':'||v_week::text);
          INSERT INTO public.traffic_weekly_reviews(client_id,week_start,task_id,result_label,kind,metric_mode)
            VALUES(s.client_id,v_week,v_task,s.result_label,k.kind,CASE WHEN k.kind='optimization' THEN 'campaign' ELSE 'client' END) RETURNING id INTO v_review;
          INSERT INTO public.traffic_weekly_history(client_id,review_id,event,snapshot)
            VALUES(s.client_id,v_review,'created',jsonb_build_object('task_id',v_task,'week_start',v_week,'due_on',v_due,'assignee_id',s.primary_assignee_id,'kind',k.kind));
          v_count:=v_count+1;
        END IF;
        DELETE FROM public.traffic_weekly_generation_issues WHERE client_id=s.client_id AND due_on=v_due AND kind=k.kind;
      EXCEPTION WHEN OTHERS THEN
        v_errors:=v_errors+1;
        INSERT INTO public.traffic_weekly_generation_issues(client_id,due_on,kind,message) VALUES(s.client_id,v_due,k.kind,
          CASE WHEN s.primary_assignee_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=s.primary_assignee_id AND status='active' AND role IN ('superadmin','admin','colaborador'))
          THEN 'Defina um gestor de tráfego ativo para gerar a revisão.' ELSE 'Não foi possível gerar a revisão. A configuração precisa de conferência técnica.' END)
          ON CONFLICT(client_id,due_on,kind) DO UPDATE SET message=excluded.message,updated_at=now();
      END;
    END LOOP;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('created',v_count,'errors',v_errors);
END;
$$;
CREATE OR REPLACE FUNCTION public.save_traffic_weekly_review(p_review uuid,p_revision integer,p_data jsonb,p_finalize boolean DEFAULT false) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.traffic_weekly_reviews; t public.tarefas; v_before jsonb; v_action uuid;
  v_mode text; v_analysis text; v_spend numeric; v_contacts integer; v_results integer; v_label text; v_rows jsonb; v_metric_mode text;
BEGIN
  -- Lock canonical task first, matching direct task transitions (no lock inversion).
  SELECT task_id INTO v_action FROM public.traffic_weekly_reviews WHERE id=p_review;
  SELECT * INTO t FROM public.tarefas WHERE id=v_action FOR UPDATE;
  SELECT * INTO r FROM public.traffic_weekly_reviews WHERE id=p_review FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Revisão não encontrada.'; END IF;
  IF NOT planeje_private.traffic_weekly_can_edit(r.task_id) THEN RAISE insufficient_privilege USING MESSAGE='Somente o responsável ou gestor pode revisar esta semana.'; END IF;
  IF r.finalized_at IS NOT NULL THEN RETURN r.id; END IF;
  IF p_revision IS DISTINCT FROM r.revision THEN RAISE EXCEPTION 'Outra pessoa atualizou esta revisão. Reabra para conferir a versão atual.'; END IF;
  IF jsonb_typeof(p_data)<>'object' OR p_data IS NULL THEN RAISE EXCEPTION 'Dados da revisão inválidos.'; END IF;
  v_metric_mode:=coalesce(p_data->>'metric_mode',r.metric_mode);
  IF v_metric_mode NOT IN ('client','campaign') THEN RAISE EXCEPTION 'Confira o modo dos números.'; END IF;
  v_rows:=planeje_private.traffic_routine_campaign_metrics(r.client_id,coalesce(p_data->'campaign_metrics','[]'::jsonb),p_finalize AND r.kind='review' AND v_metric_mode='campaign',r.kind='optimization');
  IF r.kind='review' AND v_metric_mode='client' THEN v_rows:='[]'::jsonb; END IF;
  v_before:=to_jsonb(r); v_mode:=coalesce(p_data->>'action_mode','undecided');
  v_analysis:=btrim(coalesce(p_data->>'analysis',''));
  v_spend:=nullif(p_data->>'investment','')::numeric; v_contacts:=nullif(p_data->>'contacts','')::integer; v_results:=nullif(p_data->>'results','')::integer;
  IF v_metric_mode='campaign' OR r.kind='optimization' THEN
    SELECT sum((value->>'spend')::numeric) INTO v_spend FROM jsonb_array_elements(v_rows);
    v_contacts:=NULL; v_results:=NULL;
  END IF;
  IF v_spend<0 OR v_spend>999999999999.99 OR v_contacts<0 OR v_results<0 OR (v_contacts IS NOT NULL AND v_results>v_contacts) THEN RAISE EXCEPTION 'Confira os números. Resultados são contatos da semana que atingiram o objetivo.'; END IF;
  IF v_mode NOT IN ('undecided','none','create','link') THEN RAISE EXCEPTION 'Confira a próxima ação.'; END IF;
  IF p_finalize AND (v_analysis='' OR v_mode='undecided' OR (r.kind='review' AND v_metric_mode='client' AND (v_spend IS NULL OR v_contacts IS NULL))) THEN RAISE EXCEPTION 'Informe investimento, contatos, análise e próxima ação. Use zero somente quando foi conferido.'; END IF;
  IF p_finalize AND r.kind='review' AND r.week_start+6>=public.central_trafego_operational_date() THEN RAISE EXCEPTION 'A semana precisa estar encerrada antes de finalizar.'; END IF;
  v_action:=NULL;
  IF v_mode='link' THEN
    v_action:=nullif(p_data->>'action_task_id','')::uuid;
    IF v_action IS NULL OR v_action=r.task_id OR NOT EXISTS(SELECT 1 FROM public.tarefas a WHERE a.id=v_action AND a.client_id=r.client_id AND public.central_trafego_can_see_task(a.id)) THEN RAISE EXCEPTION 'Vincule uma tarefa acessível do mesmo cliente.'; END IF;
  ELSIF v_mode='create' AND p_finalize THEN
    IF nullif(btrim(p_data->'action_draft'->>'title'),'') IS NULL OR nullif(p_data->'action_draft'->>'due_date','') IS NULL OR nullif(p_data->'action_draft'->>'assignee_id','') IS NULL THEN RAISE EXCEPTION 'A próxima ação precisa de título, responsável e prazo.'; END IF;
    IF NOT public.central_trafego_can_assign_others() AND (p_data->'action_draft'->>'assignee_id')::uuid<>auth.uid() THEN RAISE insufficient_privilege USING MESSAGE='Você pode atribuir a próxima ação a si; peça ao gestor para encaminhar a outra pessoa.'; END IF;
    v_action:=planeje_private.traffic_weekly_new_task(r.client_id,btrim(p_data->'action_draft'->>'title'),(p_data->'action_draft'->>'due_date')::date,
      (p_data->'action_draft'->>'assignee_id')::uuid,auth.uid(),v_analysis,'outro','weekly_action:'||r.id::text,r.task_id);
  END IF;
  UPDATE public.traffic_weekly_reviews SET metric_mode=v_metric_mode,campaign_metrics=v_rows,investment=v_spend,contacts=v_contacts,results=v_results,analysis=v_analysis,
    data_note=coalesce(p_data->>'data_note',''),action_mode=v_mode,action_task_id=v_action,
    action_draft=CASE WHEN v_mode='create' THEN coalesce(p_data->'action_draft','{}'::jsonb) ELSE '{}'::jsonb END,
    revision=revision+1,updated_at=now(),finalized_at=CASE WHEN p_finalize THEN clock_timestamp() END,finalized_by=CASE WHEN p_finalize THEN auth.uid() END
    WHERE id=r.id RETURNING * INTO r;
  INSERT INTO public.traffic_weekly_history(client_id,review_id,event,actor_id,snapshot) VALUES(r.client_id,r.id,
    CASE WHEN p_finalize THEN 'finalized' ELSE 'draft' END,auth.uid(),jsonb_build_object('before',v_before,'after',to_jsonb(r)));
  IF p_finalize THEN
    SELECT label INTO v_label FROM public.task_statuses WHERE value='completed' AND is_terminal;
    IF v_label IS NULL THEN RAISE EXCEPTION 'Configure o status Concluído operacional para a revisão.'; END IF;
    UPDATE public.traffic_task_details SET completion_summary=v_analysis,next_action_none=(v_mode='none'),updated_at=now() WHERE task_id=r.task_id;
    UPDATE public.tarefas SET status='completed',status_history=coalesce(status_history,'[]'::jsonb)||jsonb_build_array(
      jsonb_build_object('status','completed','user_id',auth.uid(),'timestamp',now(),'assignee_ids',to_jsonb(t.assignee_ids))) WHERE id=r.task_id;
  END IF;
  RETURN r.id;
END;
$$;
CREATE OR REPLACE FUNCTION public.traffic_weekly_board() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NOT planeje_private.traffic_weekly_staff() THEN RAISE insufficient_privilege USING MESSAGE='Acesso restrito à equipe ativa.'; END IF;
  RETURN jsonb_build_object('today',public.central_trafego_operational_date(),'can_manage',planeje_private.traffic_weekly_manager(),
    'clients',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'empresa',c.empresa,'eligible',c.etapa='closed','manager_id',o.primary_assignee_id,
      'manager_name',p.full_name,'accounts',planeje_private.traffic_routine_accounts(c.id),'settings',to_jsonb(w),'next_due_on',CASE WHEN w.enabled THEN (SELECT d.due + CASE WHEN EXISTS(SELECT 1 FROM public.traffic_weekly_reviews h
      WHERE h.client_id=c.id AND h.kind='review' AND h.week_start=date_trunc('week',d.due::timestamp)::date-7) THEN 7 ELSE 0 END
      FROM (SELECT planeje_private.traffic_weekly_due_on(greatest(w.starts_on,w.enabled_since,public.central_trafego_operational_date()),w.review_weekday) AS due) d) END,
      'next_optimization_due_on',CASE WHEN w.optimization_enabled THEN (SELECT d.due + CASE WHEN EXISTS(SELECT 1 FROM public.traffic_weekly_reviews h
        WHERE h.client_id=c.id AND h.kind='optimization' AND h.week_start=date_trunc('week',d.due::timestamp)::date) THEN 7 ELSE 0 END
        FROM (SELECT planeje_private.traffic_weekly_due_on(greatest(w.starts_on,w.optimization_enabled_since,public.central_trafego_operational_date()),w.optimization_weekday) AS due) d) END,
      'issues',coalesce((SELECT jsonb_agg(jsonb_build_object('due_on',i.due_on,'kind',i.kind,'message',i.message)) FROM public.traffic_weekly_generation_issues i WHERE i.client_id=c.id),'[]'::jsonb)) ORDER BY c.empresa)
      FROM public.clientes c LEFT JOIN public.traffic_client_ops o ON o.client_id=c.id LEFT JOIN public.profiles p ON p.id=o.primary_assignee_id
      LEFT JOIN public.traffic_weekly_settings w ON w.client_id=c.id WHERE public.can_use_traffic_weekly(c.id)
        AND ((c.etapa='closed' AND (public.central_trafego_checkup_is_operational_client(c.id) OR w.client_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.cliente_google_ads_accounts g WHERE g.cliente_id=c.id))) OR EXISTS(SELECT 1 FROM public.traffic_weekly_reviews h WHERE h.client_id=c.id))),'[]'::jsonb),
    'reviews',coalesce((SELECT jsonb_agg(to_jsonb(r)||jsonb_build_object('empresa',c.empresa,'task_status',t.status,'task_due_date',t.due_date,
      'assignee_ids',t.assignee_ids,'can_edit',planeje_private.traffic_weekly_can_edit(t.id),'reviewer_name',p.full_name,
      'action_title',a.title,'action_assignee_ids',a.assignee_ids,'action_status',a.status,'action_due_date',a.due_date,'action_completed',coalesce(ast.is_terminal,false),
      'task_completed',coalesce(ts.is_terminal,false)) ORDER BY r.week_start DESC,r.created_at DESC)
      FROM public.traffic_weekly_reviews r JOIN public.tarefas t ON t.id=r.task_id JOIN public.clientes c ON c.id=r.client_id
      LEFT JOIN public.profiles p ON p.id=r.finalized_by LEFT JOIN public.tarefas a ON a.id=r.action_task_id
      LEFT JOIN public.task_statuses ast ON ast.value=a.status LEFT JOIN public.task_statuses ts ON ts.value=t.status
      WHERE public.can_use_traffic_weekly(r.client_id) AND (r.week_start>=public.central_trafego_operational_date()-56 OR r.finalized_at IS NULL
        OR (r.action_task_id IS NOT NULL AND NOT coalesce(ast.is_terminal,false)))),'[]'::jsonb),
    'team',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'full_name',full_name) ORDER BY full_name) FROM public.profiles
      WHERE status='active' AND role IN ('superadmin','admin','colaborador')),'[]'::jsonb));
END;
$$;
CREATE OR REPLACE FUNCTION public.traffic_weekly_client_history(p_client uuid,p_before date DEFAULT NULL,p_limit integer DEFAULT 30) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NOT public.can_use_traffic_weekly(p_client) THEN RAISE insufficient_privilege USING MESSAGE='Sem acesso ao histórico deste cliente.'; END IF;
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(r)||jsonb_build_object('empresa',c.empresa,'task_status',t.status,'task_due_date',t.due_date,
    'assignee_ids',t.assignee_ids,'can_edit',planeje_private.traffic_weekly_can_edit(t.id),'reviewer_name',p.full_name,
    'action_title',a.title,'action_assignee_ids',a.assignee_ids,'action_status',a.status,'action_due_date',a.due_date,'action_completed',coalesce(ast.is_terminal,false),
    'task_completed',coalesce(ts.is_terminal,false)) ORDER BY r.week_start DESC)
    FROM (SELECT * FROM public.traffic_weekly_reviews WHERE client_id=p_client AND kind='review' AND (p_before IS NULL OR week_start<p_before)
      ORDER BY week_start DESC LIMIT greatest(1,least(coalesce(p_limit,30),100))) r JOIN public.tarefas t ON t.id=r.task_id JOIN public.clientes c ON c.id=r.client_id
    LEFT JOIN public.profiles p ON p.id=r.finalized_by LEFT JOIN public.tarefas a ON a.id=r.action_task_id
    LEFT JOIN public.task_statuses ast ON ast.value=a.status LEFT JOIN public.task_statuses ts ON ts.value=t.status),'[]'::jsonb);
END;
$$;
CREATE OR REPLACE FUNCTION public.traffic_routine_client_history(p_client uuid,p_kind text DEFAULT 'review',p_before date DEFAULT NULL,p_limit integer DEFAULT 30) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NOT public.can_use_traffic_weekly(p_client) THEN RAISE insufficient_privilege USING MESSAGE='Sem acesso ao histórico deste cliente.'; END IF;
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(r)||jsonb_build_object('empresa',c.empresa,'task_status',t.status,'task_due_date',t.due_date,
    'assignee_ids',t.assignee_ids,'can_edit',planeje_private.traffic_weekly_can_edit(t.id),'reviewer_name',p.full_name,
    'action_title',a.title,'action_assignee_ids',a.assignee_ids,'action_status',a.status,'action_due_date',a.due_date,'action_completed',coalesce(ast.is_terminal,false),
    'task_completed',coalesce(ts.is_terminal,false)) ORDER BY r.week_start DESC)
    FROM (SELECT * FROM public.traffic_weekly_reviews WHERE client_id=p_client AND kind=p_kind AND (p_before IS NULL OR week_start<p_before)
      ORDER BY week_start DESC LIMIT greatest(1,least(coalesce(p_limit,30),100))) r JOIN public.tarefas t ON t.id=r.task_id JOIN public.clientes c ON c.id=r.client_id
    LEFT JOIN public.profiles p ON p.id=r.finalized_by LEFT JOIN public.tarefas a ON a.id=r.action_task_id
    LEFT JOIN public.task_statuses ast ON ast.value=a.status LEFT JOIN public.task_statuses ts ON ts.value=t.status),'[]'::jsonb);
END;
$$;
CREATE OR REPLACE FUNCTION planeje_private.traffic_weekly_guard_task() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.traffic_weekly_reviews; v_terminal boolean;
BEGIN
  SELECT * INTO r FROM public.traffic_weekly_reviews WHERE task_id=OLD.id;
  IF r.id IS NULL THEN RETURN NEW; END IF;
  -- Do not let broad legacy task grants turn a reader into the review assignee.
  IF NOT planeje_private.traffic_weekly_can_edit(OLD.id) THEN RAISE insufficient_privilege USING MESSAGE='Somente o responsável ou gestor pode editar esta revisão.'; END IF;
  IF NEW.assignee_ids IS DISTINCT FROM OLD.assignee_ids THEN
    IF NOT public.central_trafego_can_assign_others() THEN RAISE insufficient_privilege USING MESSAGE='Peça ao gestor para trocar os responsáveis desta revisão.'; END IF;
    IF NEW.assignee_ids IS NULL OR cardinality(NEW.assignee_ids)=0 OR EXISTS(
      SELECT 1 FROM unnest(NEW.assignee_ids) u(id) LEFT JOIN public.profiles p ON p.id=u.id
      WHERE p.id IS NULL OR p.status IS DISTINCT FROM 'active' OR p.role NOT IN ('superadmin','admin','colaborador')) THEN RAISE EXCEPTION 'Defina responsáveis internos ativos.'; END IF;
  END IF;
  IF NEW.client_id IS DISTINCT FROM OLD.client_id OR NEW.type IS DISTINCT FROM OLD.type OR NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'Preserve o cliente e o tipo da revisão semanal.'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT planeje_private.traffic_weekly_can_edit(OLD.id) THEN RAISE insufficient_privilege USING MESSAGE='Somente o responsável ou gestor pode mover esta revisão.'; END IF;
    SELECT coalesce(is_terminal,false) INTO v_terminal FROM public.task_statuses WHERE value=NEW.status;
    IF coalesce(v_terminal,false) AND r.finalized_at IS NULL THEN RAISE EXCEPTION 'Abra a Rotina semanal e finalize a análise antes de concluir esta tarefa.'; END IF;
    IF r.finalized_at IS NOT NULL AND EXISTS(SELECT 1 FROM public.task_statuses WHERE value=OLD.status AND is_terminal) THEN RAISE EXCEPTION 'Revisão finalizada. Seu histórico permanece preservado.'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.save_traffic_routine_settings(uuid,boolean,integer,date,text,uuid,boolean,integer),public.traffic_routine_client_history(uuid,text,date,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_traffic_routine_settings(uuid,boolean,integer,date,text,uuid,boolean,integer),public.traffic_routine_client_history(uuid,text,date,integer) TO authenticated;
REVOKE ALL ON FUNCTION planeje_private.traffic_routine_accounts(uuid),planeje_private.traffic_routine_campaign_metrics(uuid,jsonb,boolean,boolean) FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
