BEGIN;
CREATE OR REPLACE FUNCTION planeje_private.traffic_routine_campaign_metrics(p_client uuid,p_rows jsonb,p_finalize boolean,p_context_only boolean DEFAULT false) RETURNS jsonb
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
    FOREACH field IN ARRAY ARRAY['account_id','account_name','campaign_id','campaign_name','conversion_label','adset_id','adset_name'] LOOP
      IF length(coalesce(row->>field,''))>200 THEN RAISE EXCEPTION 'Nome ou identificador da campanha muito longo.'; END IF;
    END LOOP;
    identity:=lower(btrim(row->>'platform'))||':'||lower(btrim(row->>'account_id'))||':'||lower(btrim(coalesce(nullif(row->>'campaign_id',''),row->>'campaign_name')));
    identity:=identity||':'||lower(btrim(coalesce(nullif(row->>'adset_id',''),row->>'adset_name','')));
    IF identity=ANY(seen) THEN RAISE EXCEPTION 'Esta campanha já foi incluída na revisão. Não repita o investimento.'; END IF;
    seen:=array_append(seen,identity);
    FOREACH field IN ARRAY ARRAY['spend','conversions','calls','daily_budget','cpc','messages','appointments','target_message_cost','conversion_value'] LOOP
      val:=CASE WHEN p_context_only THEN NULL ELSE nullif(row->>field,'')::numeric END;
      IF val<0 OR val>999999999999.99 OR val::text IN ('NaN','Infinity','-Infinity') OR (field IN ('calls','messages','appointments') AND val<>trunc(val)) THEN RAISE EXCEPTION 'Confira os números da campanha.'; END IF;
      IF p_finalize AND NOT p_context_only AND field IN ('spend','conversions') AND val IS NULL THEN RAISE EXCEPTION 'Confira gasto e conversões de cada campanha. Zero significa conferido.'; END IF;
      row:=jsonb_set(row,ARRAY[field],coalesce(to_jsonb(val),'null'::jsonb));
    END LOOP;
    out_rows:=out_rows||jsonb_build_array(jsonb_build_object('id',row_id,'platform',btrim(row->>'platform'),'account_link_id',nullif(row->>'account_link_id',''),
      'account_id',btrim(row->>'account_id'),'account_name',btrim(row->>'account_name'),'campaign_id',btrim(coalesce(row->>'campaign_id','')),
      'campaign_name',btrim(row->>'campaign_name'),'conversion_label',btrim(row->>'conversion_label'),
      'adset_id',btrim(coalesce(row->>'adset_id','')),'adset_name',btrim(coalesce(row->>'adset_name','')),
      'messages',row->'messages','appointments',row->'appointments','target_message_cost',row->'target_message_cost','conversion_value',row->'conversion_value',
      'spend',row->'spend','conversions',row->'conversions','calls',row->'calls','daily_budget',row->'daily_budget','cpc',row->'cpc'));
  END LOOP;
  IF p_finalize AND jsonb_array_length(out_rows)=0 THEN RAISE EXCEPTION 'Adicione pelo menos uma campanha, ou use o resumo do cliente.'; END IF;
  RETURN out_rows;
END;
$$;

CREATE FUNCTION public.start_traffic_week_record(p_client uuid,p_week date,p_kind text DEFAULT 'review') RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_id uuid; v_task uuid; v_assignee uuid; v_name text; v_label text;
BEGIN
  IF NOT public.can_use_traffic_weekly(p_client) THEN RAISE insufficient_privilege USING MESSAGE='Sem acesso a este cliente.'; END IF;
  IF p_kind NOT IN ('review','optimization') OR p_kind IS NULL OR p_week IS NULL OR extract(isodow FROM p_week)<>1
    OR p_week>public.central_trafego_operational_date() THEN RAISE EXCEPTION 'Escolha uma semana iniciada, de segunda a domingo.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=p_client AND etapa='closed') THEN RAISE EXCEPTION 'Cliente não está ativo para tráfego.'; END IF;
  SELECT primary_assignee_id INTO v_assignee FROM public.traffic_client_ops WHERE client_id=p_client AND coalesce(situation,'active')<>'closed';
  IF NOT planeje_private.traffic_weekly_manager() AND v_assignee IS DISTINCT FROM auth.uid() THEN RAISE insufficient_privilege USING MESSAGE='Somente o gestor de tráfego deste cliente ou administrador pode abrir um registro.'; END IF;
  v_assignee:=coalesce(v_assignee,auth.uid());
  PERFORM pg_advisory_xact_lock(hashtextextended('traffic-weekly:'||p_client::text||':'||p_week::text||':'||p_kind,0));
  SELECT id INTO v_id FROM public.traffic_weekly_reviews WHERE client_id=p_client AND week_start=p_week AND kind=p_kind;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  SELECT empresa INTO STRICT v_name FROM public.clientes WHERE id=p_client;
  SELECT result_label INTO v_label FROM public.traffic_weekly_settings WHERE client_id=p_client;
  v_task:=planeje_private.traffic_weekly_new_task(p_client,'['||v_name||'] '||CASE WHEN p_kind='review' THEN 'Analisar tráfego' ELSE 'Otimizar campanhas' END||' · '||to_char(p_week,'DD/MM')||' a '||to_char(p_week+6,'DD/MM'),public.central_trafego_operational_date(),v_assignee,auth.uid(),
    'Registrar campanhas, resultados e observações em Tráfego → Rotina semanal.',CASE WHEN p_kind='review' THEN 'relatorio' ELSE 'ajuste' END,
    CASE WHEN p_kind='review' THEN 'weekly_review:' ELSE 'weekly_optimization:' END||p_client::text||':'||p_week::text);
  INSERT INTO public.traffic_weekly_reviews(client_id,week_start,task_id,result_label,kind,metric_mode)
    VALUES(p_client,p_week,v_task,coalesce(v_label,'Agendamentos'),p_kind,'campaign') RETURNING id INTO v_id;
  INSERT INTO public.traffic_weekly_history(client_id,review_id,event,actor_id,snapshot)
    VALUES(p_client,v_id,'created',auth.uid(),jsonb_build_object('source','manual','task_id',v_task,'week_start',p_week,'kind',p_kind));
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.start_traffic_week_record(uuid,date,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.start_traffic_week_record(uuid,date,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
