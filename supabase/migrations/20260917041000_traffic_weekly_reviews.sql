BEGIN;

-- An opt-in routine. Execution, assignees and deadlines live in tarefas.
CREATE TABLE public.traffic_weekly_settings (
  client_id uuid PRIMARY KEY REFERENCES public.clientes(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT false,
  review_weekday smallint NOT NULL DEFAULT 1 CHECK (review_weekday BETWEEN 1 AND 5),
  starts_on date NOT NULL,
  enabled_since date NOT NULL,
  result_label text NOT NULL DEFAULT 'Agendamentos' CHECK (length(btrim(result_label)) BETWEEN 2 AND 60),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
CREATE TABLE public.traffic_weekly_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  week_start date NOT NULL CHECK (extract(isodow FROM week_start)=1),
  task_id uuid NOT NULL UNIQUE REFERENCES public.tarefas(id) ON DELETE RESTRICT,
  result_label text NOT NULL,
  investment numeric(14,2) CHECK (investment >= 0),
  contacts integer CHECK (contacts >= 0),
  results integer CHECK (results >= 0),
  analysis text NOT NULL DEFAULT '' CHECK (length(analysis)<=10000),
  data_note text NOT NULL DEFAULT '' CHECK (length(data_note)<=2000),
  action_mode text NOT NULL DEFAULT 'undecided' CHECK (action_mode IN ('undecided','none','create','link')),
  action_task_id uuid REFERENCES public.tarefas(id) ON DELETE RESTRICT,
  action_draft jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision integer NOT NULL DEFAULT 0,
  finalized_at timestamptz,
  finalized_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id,week_start),
  CHECK (results IS NULL OR contacts IS NULL OR results<=contacts),
  CHECK (action_task_id IS NULL OR action_task_id<>task_id)
);
CREATE TABLE public.traffic_weekly_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  review_id uuid REFERENCES public.traffic_weekly_reviews(id) ON DELETE RESTRICT,
  event text NOT NULL CHECK (event IN ('settings','created','draft','finalized')),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  snapshot jsonb NOT NULL
);
CREATE TABLE public.traffic_weekly_generation_issues (
  client_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  due_on date NOT NULL,
  message text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(client_id,due_on)
);
CREATE INDEX traffic_weekly_reviews_recent ON public.traffic_weekly_reviews(client_id,week_start DESC);
CREATE INDEX traffic_weekly_history_recent ON public.traffic_weekly_history(client_id,occurred_at DESC);

CREATE FUNCTION planeje_private.traffic_weekly_staff() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND status='active' AND role IN ('superadmin','admin','colaborador'));
$$;
CREATE FUNCTION planeje_private.traffic_weekly_manager() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT planeje_private.traffic_weekly_staff() AND public.central_trafego_is_admin();
$$;
CREATE FUNCTION public.can_use_traffic_weekly(p_client uuid DEFAULT NULL) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT planeje_private.traffic_weekly_staff() AND (p_client IS NULL OR public.central_trafego_can_access_client(p_client)
    OR EXISTS(SELECT 1 FROM public.traffic_weekly_reviews r JOIN public.tarefas t ON t.id=r.task_id
      WHERE r.client_id=p_client AND auth.uid()=ANY(coalesce(t.assignee_ids,'{}'::uuid[]))));
$$;
CREATE FUNCTION planeje_private.traffic_weekly_can_edit(p_task uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT planeje_private.traffic_weekly_manager() OR (planeje_private.traffic_weekly_staff()
    AND EXISTS(SELECT 1 FROM public.tarefas WHERE id=p_task AND auth.uid()=ANY(coalesce(assignee_ids,'{}'::uuid[]))));
$$;
CREATE FUNCTION planeje_private.traffic_weekly_due_on(p_date date,p_weekday integer) RETURNS date
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT p_date + ((p_weekday-extract(isodow FROM p_date)::integer+7)%7);
$$;

ALTER TABLE public.traffic_weekly_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traffic_weekly_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traffic_weekly_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traffic_weekly_generation_issues ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.traffic_weekly_settings,public.traffic_weekly_reviews,public.traffic_weekly_history,public.traffic_weekly_generation_issues FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.traffic_weekly_settings,public.traffic_weekly_reviews,public.traffic_weekly_history,public.traffic_weekly_generation_issues TO authenticated;
CREATE POLICY traffic_weekly_settings_read ON public.traffic_weekly_settings FOR SELECT TO authenticated USING(public.can_use_traffic_weekly(client_id));
CREATE POLICY traffic_weekly_reviews_read ON public.traffic_weekly_reviews FOR SELECT TO authenticated USING(public.can_use_traffic_weekly(client_id));
CREATE POLICY traffic_weekly_history_read ON public.traffic_weekly_history FOR SELECT TO authenticated USING(public.can_use_traffic_weekly(client_id));
CREATE POLICY traffic_weekly_issues_read ON public.traffic_weekly_generation_issues FOR SELECT TO authenticated USING(public.can_use_traffic_weekly(client_id));

CREATE FUNCTION public.save_traffic_weekly_settings(p_client uuid,p_enabled boolean,p_weekday integer,p_starts_on date,p_result_label text,p_assignee uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_old public.traffic_weekly_settings; v_today date:=public.central_trafego_operational_date();
BEGIN
  IF NOT planeje_private.traffic_weekly_manager() THEN RAISE insufficient_privilege USING MESSAGE='Somente gestores podem configurar a rotina.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=p_client AND etapa='closed') THEN RAISE EXCEPTION 'Escolha um cliente ativo.'; END IF;
  IF p_weekday IS NULL OR p_weekday NOT BETWEEN 1 AND 5 OR p_result_label IS NULL OR length(btrim(p_result_label)) NOT BETWEEN 2 AND 60 THEN RAISE EXCEPTION 'Confira o dia e o resultado principal.'; END IF;
  IF p_assignee IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_assignee AND status='active' AND role IN ('superadmin','admin','colaborador')) THEN RAISE EXCEPTION 'Defina um gestor de tráfego ativo.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('traffic-weekly-settings:'||p_client::text,0));
  SELECT * INTO v_old FROM public.traffic_weekly_settings WHERE client_id=p_client FOR UPDATE;
  IF v_old.client_id IS NULL AND (p_starts_on IS NULL OR p_starts_on<v_today OR p_starts_on>v_today+365) THEN RAISE EXCEPTION 'A rotina começa hoje ou em uma data futura, sem cobranças retroativas.'; END IF;
  -- Primary account manager config is reused, not a second execution assignment.
  INSERT INTO public.traffic_client_ops(client_id,primary_assignee_id,updated_by)
    VALUES(p_client,p_assignee,auth.uid()) ON CONFLICT(client_id) DO UPDATE
    SET primary_assignee_id=excluded.primary_assignee_id,updated_by=auth.uid(),updated_at=now();
  INSERT INTO public.traffic_weekly_settings(client_id,enabled,review_weekday,starts_on,enabled_since,result_label,updated_by)
    VALUES(p_client,coalesce(p_enabled,false),p_weekday,coalesce(v_old.starts_on,p_starts_on),
      CASE WHEN v_old.client_id IS NULL THEN p_starts_on WHEN (NOT v_old.enabled AND p_enabled) OR v_old.review_weekday<>p_weekday THEN v_today ELSE v_old.enabled_since END,btrim(p_result_label),auth.uid())
    ON CONFLICT(client_id) DO UPDATE SET enabled=excluded.enabled,review_weekday=excluded.review_weekday,
      enabled_since=excluded.enabled_since,result_label=excluded.result_label,updated_at=now(),updated_by=auth.uid();
  INSERT INTO public.traffic_weekly_history(client_id,event,actor_id,snapshot)
    SELECT p_client,'settings',auth.uid(),jsonb_build_object('before',to_jsonb(v_old),'after',to_jsonb(s),'primary_assignee_id',p_assignee)
    FROM public.traffic_weekly_settings s WHERE client_id=p_client;
END;
$$;

CREATE FUNCTION planeje_private.traffic_weekly_new_task(p_client uuid,p_title text,p_due date,p_assignee uuid,p_actor uuid,p_description text,p_kind text,p_key text,p_parent uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_task uuid; v_status text;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_assignee AND status='active' AND role IN ('superadmin','admin','colaborador')) THEN RAISE EXCEPTION 'Responsável ausente ou inativo.'; END IF;
  SELECT value INTO STRICT v_status FROM public.task_statuses WHERE is_initial;
  INSERT INTO public.tarefas(title,description,client_id,type,status,due_date,priority,owner_id,assignee_ids,status_history)
    VALUES(p_title,p_description,p_client,'paid_traffic',v_status,p_due,'medium',coalesce(p_actor,p_assignee),ARRAY[p_assignee],
      jsonb_build_array(jsonb_build_object('status',v_status,'user_id',coalesce(p_actor,p_assignee),'timestamp',now(),'assignee_ids',jsonb_build_array(p_assignee)))) RETURNING id INTO v_task;
  INSERT INTO public.traffic_task_details(task_id,demand_type,source_type,source_reference,generation_key,generated_from_task_id)
    VALUES(v_task,p_kind,'system',p_key,p_key,p_parent);
  RETURN v_task;
END;
$$;
CREATE FUNCTION planeje_private.traffic_weekly_generate(p_today date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s record; v_due date; v_week date; v_task uuid; v_review uuid; v_count integer:=0; v_errors integer:=0;
BEGIN
  IF p_today IS DISTINCT FROM public.central_trafego_operational_date() THEN RAISE EXCEPTION 'Data de geração inválida.'; END IF;
  FOR s IN SELECT w.*,o.primary_assignee_id,c.empresa FROM public.traffic_weekly_settings w
    JOIN public.clientes c ON c.id=w.client_id LEFT JOIN public.traffic_client_ops o ON o.client_id=w.client_id
    WHERE w.enabled AND c.etapa='closed' AND coalesce(o.situation,'active')<>'closed' FOR UPDATE OF w
  LOOP
    -- Catch up missed active cycles; disabled periods are not backfilled on resume.
    FOR v_due IN SELECT d::date FROM generate_series(
      planeje_private.traffic_weekly_due_on(greatest(s.starts_on,s.enabled_since,p_today-365),s.review_weekday)::timestamp,p_today::timestamp,interval '7 days') d
    LOOP
      BEGIN
        v_week:=date_trunc('week',v_due::timestamp)::date-7;
        PERFORM pg_advisory_xact_lock(hashtextextended('traffic-weekly:'||s.client_id::text||':'||v_week::text,0));
        IF NOT EXISTS(SELECT 1 FROM public.traffic_weekly_reviews WHERE client_id=s.client_id AND week_start=v_week) THEN
          v_task:=planeje_private.traffic_weekly_new_task(s.client_id,'['||s.empresa||'] Revisar tráfego da semana '||to_char(v_week,'DD/MM')||' a '||to_char(v_week+6,'DD/MM'),v_due,s.primary_assignee_id,NULL,
            'Conferir investimento, contatos, resultado principal e análise da semana. Registrar a próxima ação em Tráfego → Rotina semanal.','relatorio','weekly_review:'||s.client_id::text||':'||v_week::text);
          INSERT INTO public.traffic_weekly_reviews(client_id,week_start,task_id,result_label)
            VALUES(s.client_id,v_week,v_task,s.result_label) RETURNING id INTO v_review;
          INSERT INTO public.traffic_weekly_history(client_id,review_id,event,snapshot)
            VALUES(s.client_id,v_review,'created',jsonb_build_object('task_id',v_task,'week_start',v_week,'due_on',v_due,'assignee_id',s.primary_assignee_id));
          v_count:=v_count+1;
        END IF;
        DELETE FROM public.traffic_weekly_generation_issues WHERE client_id=s.client_id AND due_on=v_due;
      EXCEPTION WHEN OTHERS THEN
        v_errors:=v_errors+1;
        INSERT INTO public.traffic_weekly_generation_issues(client_id,due_on,message) VALUES(s.client_id,v_due,
          CASE WHEN s.primary_assignee_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=s.primary_assignee_id AND status='active' AND role IN ('superadmin','admin','colaborador'))
          THEN 'Defina um gestor de tráfego ativo para gerar a revisão.' ELSE 'Não foi possível gerar a revisão. A configuração precisa de conferência técnica.' END)
          ON CONFLICT(client_id,due_on) DO UPDATE SET message=excluded.message,updated_at=now();
      END;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('created',v_count,'errors',v_errors);
END;
$$;
CREATE FUNCTION public.refresh_traffic_weekly_routine() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NOT planeje_private.traffic_weekly_manager() THEN RAISE insufficient_privilege USING MESSAGE='Somente gestores podem atualizar a geração.'; END IF;
  RETURN planeje_private.traffic_weekly_generate(public.central_trafego_operational_date());
END;
$$;

CREATE FUNCTION public.traffic_weekly_board() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NOT planeje_private.traffic_weekly_staff() THEN RAISE insufficient_privilege USING MESSAGE='Acesso restrito à equipe ativa.'; END IF;
  RETURN jsonb_build_object('today',public.central_trafego_operational_date(),'can_manage',planeje_private.traffic_weekly_manager(),
    'clients',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'empresa',c.empresa,'manager_id',o.primary_assignee_id,
      'manager_name',p.full_name,'settings',to_jsonb(w),'next_due_on',CASE WHEN w.enabled THEN planeje_private.traffic_weekly_due_on(greatest(w.starts_on,w.enabled_since,public.central_trafego_operational_date()),w.review_weekday) END,
      'issues',coalesce((SELECT jsonb_agg(jsonb_build_object('due_on',i.due_on,'message',i.message)) FROM public.traffic_weekly_generation_issues i WHERE i.client_id=c.id),'[]'::jsonb)) ORDER BY c.empresa)
      FROM public.clientes c LEFT JOIN public.traffic_client_ops o ON o.client_id=c.id LEFT JOIN public.profiles p ON p.id=o.primary_assignee_id
      LEFT JOIN public.traffic_weekly_settings w ON w.client_id=c.id WHERE c.etapa='closed' AND public.can_use_traffic_weekly(c.id)
        AND (public.central_trafego_checkup_is_operational_client(c.id) OR w.client_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.cliente_google_ads_accounts g WHERE g.cliente_id=c.id))),'[]'::jsonb),
    'reviews',coalesce((SELECT jsonb_agg(to_jsonb(r)||jsonb_build_object('empresa',c.empresa,'task_status',t.status,'task_due_date',t.due_date,
      'assignee_ids',t.assignee_ids,'can_edit',planeje_private.traffic_weekly_can_edit(t.id),'reviewer_name',p.full_name,
      'action_title',a.title,'action_status',a.status,'action_due_date',a.due_date,'action_completed',coalesce(ast.is_terminal,false),
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

CREATE FUNCTION public.traffic_weekly_client_history(p_client uuid,p_before date DEFAULT NULL,p_limit integer DEFAULT 30) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NOT public.can_use_traffic_weekly(p_client) THEN RAISE insufficient_privilege USING MESSAGE='Sem acesso ao histórico deste cliente.'; END IF;
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(r)||jsonb_build_object('empresa',c.empresa,'task_status',t.status,'task_due_date',t.due_date,
    'assignee_ids',t.assignee_ids,'can_edit',planeje_private.traffic_weekly_can_edit(t.id),'reviewer_name',p.full_name,
    'action_title',a.title,'action_status',a.status,'action_due_date',a.due_date,'action_completed',coalesce(ast.is_terminal,false),
    'task_completed',coalesce(ts.is_terminal,false)) ORDER BY r.week_start DESC)
    FROM (SELECT * FROM public.traffic_weekly_reviews WHERE client_id=p_client AND (p_before IS NULL OR week_start<p_before)
      ORDER BY week_start DESC LIMIT greatest(1,least(coalesce(p_limit,30),100))) r JOIN public.tarefas t ON t.id=r.task_id JOIN public.clientes c ON c.id=r.client_id
    LEFT JOIN public.profiles p ON p.id=r.finalized_by LEFT JOIN public.tarefas a ON a.id=r.action_task_id
    LEFT JOIN public.task_statuses ast ON ast.value=a.status LEFT JOIN public.task_statuses ts ON ts.value=t.status),'[]'::jsonb);
END;
$$;

CREATE FUNCTION public.save_traffic_weekly_review(p_review uuid,p_revision integer,p_data jsonb,p_finalize boolean DEFAULT false) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.traffic_weekly_reviews; t public.tarefas; v_before jsonb; v_action uuid;
  v_mode text; v_analysis text; v_spend numeric; v_contacts integer; v_results integer; v_label text;
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
  v_before:=to_jsonb(r); v_mode:=coalesce(p_data->>'action_mode','undecided');
  v_analysis:=btrim(coalesce(p_data->>'analysis',''));
  v_spend:=nullif(p_data->>'investment','')::numeric; v_contacts:=nullif(p_data->>'contacts','')::integer; v_results:=nullif(p_data->>'results','')::integer;
  IF v_spend<0 OR v_spend>999999999999.99 OR v_contacts<0 OR v_results<0 OR (v_contacts IS NOT NULL AND v_results>v_contacts) THEN RAISE EXCEPTION 'Confira os números. Resultados são contatos da semana que atingiram o objetivo.'; END IF;
  IF v_mode NOT IN ('undecided','none','create','link') THEN RAISE EXCEPTION 'Confira a próxima ação.'; END IF;
  IF p_finalize AND (v_analysis='' OR v_spend IS NULL OR v_contacts IS NULL OR v_mode='undecided') THEN RAISE EXCEPTION 'Informe investimento, contatos, análise e próxima ação. Use zero somente quando foi conferido.'; END IF;
  IF p_finalize AND r.week_start+6>=public.central_trafego_operational_date() THEN RAISE EXCEPTION 'A semana precisa estar encerrada antes de finalizar.'; END IF;
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
  UPDATE public.traffic_weekly_reviews SET investment=v_spend,contacts=v_contacts,results=v_results,analysis=v_analysis,
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

CREATE FUNCTION planeje_private.traffic_weekly_guard_task() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.traffic_weekly_reviews; v_terminal boolean;
BEGIN
  SELECT * INTO r FROM public.traffic_weekly_reviews WHERE task_id=OLD.id;
  IF r.id IS NULL THEN RETURN NEW; END IF;
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
CREATE TRIGGER a00_traffic_weekly_guard BEFORE UPDATE ON public.tarefas FOR EACH ROW EXECUTE FUNCTION planeje_private.traffic_weekly_guard_task();

REVOKE ALL ON FUNCTION planeje_private.traffic_weekly_staff(),planeje_private.traffic_weekly_manager(),planeje_private.traffic_weekly_can_edit(uuid),planeje_private.traffic_weekly_due_on(date,integer),planeje_private.traffic_weekly_generate(date),planeje_private.traffic_weekly_new_task(uuid,text,date,uuid,uuid,text,text,text,uuid),planeje_private.traffic_weekly_guard_task() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.can_use_traffic_weekly(uuid),public.save_traffic_weekly_settings(uuid,boolean,integer,date,text,uuid),public.refresh_traffic_weekly_routine(),public.traffic_weekly_board(),public.traffic_weekly_client_history(uuid,date,integer),public.save_traffic_weekly_review(uuid,integer,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.can_use_traffic_weekly(uuid),public.save_traffic_weekly_settings(uuid,boolean,integer,date,text,uuid),public.refresh_traffic_weekly_routine(),public.traffic_weekly_board(),public.traffic_weekly_client_history(uuid,date,integer),public.save_traffic_weekly_review(uuid,integer,jsonb,boolean) TO authenticated;

-- Database-only scheduling: no requests to Ads, WhatsApp, e-mail or other transports.
SELECT cron.schedule('planeje-traffic-weekly-reviews','10 * * * *',$cron$SELECT planeje_private.traffic_weekly_generate(public.central_trafego_operational_date());$cron$);
NOTIFY pgrst,'reload schema';
COMMIT;
