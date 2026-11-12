BEGIN;
ALTER FUNCTION public.crm_ia_workspace(text,uuid,jsonb) RENAME TO crm_ia_workspace_pre_lead_reads;
REVOKE ALL ON FUNCTION public.crm_ia_workspace_pre_lead_reads(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.crm_ia_workspace(p_action text,p_client_id uuid DEFAULT NULL,p_payload jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor_role text;result_data jsonb;since_date date;until_date date;offset_n integer;limit_n integer;search_text text;tag_filter text;
 profile_agent uuid;profile_key uuid;channel_filter uuid;attendance_filter text;has_source boolean;selected_ids uuid[];provided_ids uuid[];owner_key uuid;
 item jsonb;locked_lead public.leads;expected text;selection_count integer;locked_count integer:=0;receipt public.crm_ia_import_receipts;request_key uuid;created_count integer:=0;row_number bigint;error_message text;error_state text;
BEGIN
 IF p_action IS NULL OR p_action NOT IN('leads','bulk_assign','bulk_archive','import_leads') THEN RETURN public.crm_ia_workspace_pre_lead_reads(p_action,p_client_id,p_payload);END IF;
 actor_role:=private.crm_ia_role();
 IF actor_role IS NULL OR NOT coalesce(private.crm_ia_client(p_client_id),false) THEN RAISE EXCEPTION 'Sem acesso a esta conta.' USING ERRCODE='42501';END IF;
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>2000000 THEN RAISE EXCEPTION 'Dados inválidos.' USING ERRCODE='22023';END IF;
 since_date:=coalesce(nullif(p_payload->>'since','')::date,(current_timestamp AT TIME ZONE 'America/Sao_Paulo')::date-6);
 until_date:=coalesce(nullif(p_payload->>'until','')::date,(current_timestamp AT TIME ZONE 'America/Sao_Paulo')::date);
 IF until_date<since_date OR until_date-since_date>366 THEN RAISE EXCEPTION 'Período inválido.' USING ERRCODE='22023';END IF;
 IF p_action='leads' THEN
  offset_n:=greatest(0,least(coalesce((p_payload->>'offset')::integer,0),100000));limit_n:=greatest(1,least(coalesce((p_payload->>'limit')::integer,50),200));
  search_text:=left(btrim(coalesce(p_payload->>'search','')),200);tag_filter:=nullif(p_payload->>'tag','');
  profile_agent:=nullif(p_payload->>'profile_agent_id','')::uuid;profile_key:=nullif(p_payload->>'profile_id','')::uuid;
  IF (profile_agent IS NULL)<>(profile_key IS NULL) THEN RAISE EXCEPTION 'Informe agente e perfil juntos no filtro de perfil.' USING ERRCODE='22023';END IF;
  channel_filter:=nullif(p_payload->>'channel_id','')::uuid;attendance_filter:=nullif(p_payload->>'attendance','');
  IF channel_filter IS NOT NULL AND NOT coalesce(private.crm_ia_channel(p_client_id,channel_filter),false) THEN RAISE EXCEPTION 'Sem acesso a este canal.' USING ERRCODE='42501';END IF;
  IF attendance_filter IS NOT NULL AND attendance_filter NOT IN('all','ai','human','resolved','waiting','followup') THEN RAISE EXCEPTION 'Filtro de atendimento inválido.' USING ERRCODE='22023';END IF;
  SELECT EXISTS(SELECT 1 FROM public.cliente_whatsapp_config c WHERE c.cliente_id=p_client_id AND private.crm_ia_channel(p_client_id,c.id)) INTO has_source;
  WITH authorized AS MATERIALIZED (
   SELECT l.* FROM public.leads l WHERE l.cliente_id=p_client_id AND private.crm_ia_lead(l.id,p_client_id)
    AND CASE WHEN p_payload->>'archived'='true' THEN l.crm_ia_archived_at IS NOT NULL ELSE l.crm_ia_archived_at IS NULL END
    AND (search_text='' OR l.nome ILIKE '%'||search_text||'%' OR l.whatsapp ILIKE '%'||search_text||'%' OR l.email ILIKE '%'||search_text||'%')
    AND (nullif(p_payload->>'pipeline_id','') IS NULL OR l.pipeline_id=(p_payload->>'pipeline_id')::uuid)
    AND (nullif(p_payload->>'stage_id','') IS NULL OR l.stage_id=(p_payload->>'stage_id')::uuid)
    AND (nullif(p_payload->>'owner_id','') IS NULL OR l.responsavel_id=(p_payload->>'owner_id')::uuid)
    AND (nullif(p_payload->>'origin','') IS NULL OR l.origem=p_payload->>'origin')
    AND (nullif(p_payload->>'since','') IS NULL OR coalesce(l.data_entrada,(l.created_at AT TIME ZONE 'America/Sao_Paulo')::date)>=since_date)
    AND (nullif(p_payload->>'until','') IS NULL OR coalesce(l.data_entrada,(l.created_at AT TIME ZONE 'America/Sao_Paulo')::date)<=until_date)
    AND (nullif(p_payload->>'qualified','') IS NULL OR coalesce((to_jsonb(l)->>'qualificado')::boolean,(to_jsonb(l)->>'comercial_qualificado')::boolean,false)=(p_payload->>'qualified'='true'))
    AND (tag_filter IS NULL OR tag_filter=ANY(l.etiquetas))
    AND (profile_agent IS NULL OR l.crm_ia_profile->>'agent_id'=profile_agent::text AND l.crm_ia_profile->>'id'=profile_key::text)
  ), conversations AS MATERIALIZED (
   SELECT DISTINCT ON(c.lead_id) c.* FROM private.crm_ia_conversation_rows(p_client_id) c
   WHERE c.lead_id IN(SELECT id FROM authorized) AND (channel_filter IS NULL OR c.channel_id=channel_filter)
   ORDER BY c.lead_id,c.last_message_at DESC,c.channel_id
  ), filtered AS MATERIALIZED (
   SELECT l.*,c.attendance,c.awaiting_since,c.followup_due_at FROM authorized l LEFT JOIN conversations c ON c.lead_id=l.id
   WHERE (channel_filter IS NULL OR c.channel_id=channel_filter)
    AND (attendance_filter IS NULL OR attendance_filter='all' OR c.attendance=attendance_filter
     OR attendance_filter='waiting' AND c.awaiting_since IS NOT NULL AND NOT c.resolvida
     OR attendance_filter='followup' AND c.followup_due_at IS NOT NULL AND NOT c.resolvida)
  ), page AS (
   SELECT * FROM filtered ORDER BY CASE WHEN p_payload->>'sort'='name' THEN nome END ASC,
    CASE WHEN p_payload->>'sort'='value' THEN valor END DESC NULLS LAST,CASE WHEN p_payload->>'sort'='oldest' THEN created_at END ASC,
    created_at DESC,id DESC LIMIT limit_n OFFSET offset_n
  ), stages AS (SELECT stage_id,count(*) AS count,coalesce(sum(valor),0) AS value FROM filtered GROUP BY stage_id)
  SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(p)-ARRAY['crm_ia_contact_id','followup_due_at']||jsonb_build_object(
     'contact_id',CASE WHEN private.crm_ia_contact(p_client_id,p.crm_ia_contact_id) THEN p.crm_ia_contact_id END,'archived_at',p.crm_ia_archived_at)) FROM page p),'[]'),
   'total',(SELECT count(*) FROM filtered),'summary',jsonb_build_object('value',(SELECT coalesce(sum(valor),0) FROM filtered),
     'ai',CASE WHEN has_source THEN (SELECT count(*) FROM filtered WHERE attendance='ai') END,
     'waiting',CASE WHEN has_source THEN (SELECT count(*) FROM filtered WHERE awaiting_since IS NOT NULL AND attendance<>'resolved') END),
   'stage_totals',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY stage_id NULLS FIRST) FROM stages s),'[]'),
   'coverage',jsonb_build_object('conversations',CASE WHEN has_source THEN 'available' ELSE 'unavailable' END,
     'message',CASE WHEN NOT has_source THEN 'Atendimento sem canal autorizado para consulta nesta conta.' END)) INTO result_data;
  RETURN result_data;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('crm-ia:'||p_client_id::text,0));
 IF p_action='import_leads' THEN
  IF jsonb_typeof(p_payload->'rows') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'rows') NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Importe de 1 a 1.000 linhas por arquivo.' USING ERRCODE='22023';END IF;
  request_key:=nullif(p_payload->>'request_id','')::uuid;
  IF request_key IS NULL THEN RAISE EXCEPTION 'Identificador da importação obrigatório.' USING ERRCODE='22023';END IF;
  SELECT * INTO receipt FROM public.crm_ia_import_receipts r WHERE r.cliente_id=p_client_id AND r.created_by=auth.uid() AND r.request_id=request_key;
  IF receipt.request_id IS NOT NULL THEN
   IF receipt.payload_hash<>md5((p_payload->'rows')::text) THEN RAISE EXCEPTION 'Identificador usado em outra importação.' USING ERRCODE='22023';END IF;
   RETURN receipt.result;
  END IF;
  FOR item,row_number IN SELECT value,ordinality FROM jsonb_array_elements(p_payload->'rows') WITH ORDINALITY LOOP
   BEGIN
    IF jsonb_typeof(item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Linha de importação inválida.' USING ERRCODE='22023';END IF;
    IF EXISTS(SELECT 1 FROM public.leads l WHERE l.cliente_id=p_client_id AND private.crm_ia_phone(l.whatsapp)=private.crm_ia_phone(item->>'whatsapp')) THEN CONTINUE;END IF;
    PERFORM public.crm_ia_workspace('save_lead',p_client_id,item-'id'-'expected_updated_at'-'auto_responder');created_count:=created_count+1;
   EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS error_message=MESSAGE_TEXT,error_state=RETURNED_SQLSTATE;
    RAISE EXCEPTION 'Linha %: %',row_number,error_message USING ERRCODE=error_state;
   END;
  END LOOP;
  result_data:=jsonb_build_object('created',created_count,'preserved',jsonb_array_length(p_payload->'rows')-created_count,'ok',true);
  INSERT INTO public.crm_ia_import_receipts(cliente_id,created_by,request_id,payload_hash,result) VALUES(p_client_id,auth.uid(),request_key,md5((p_payload->'rows')::text),result_data);
  RETURN result_data;
 END IF;
 IF jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'A seleção não contém versão de cada lead. Atualize os leads antes de continuar.' USING ERRCODE='40001';END IF;
 selection_count:=jsonb_array_length(p_payload->'items');
 IF selection_count NOT BETWEEN 1 AND (CASE WHEN p_action='bulk_archive' THEN 100 ELSE 200 END) THEN RAISE EXCEPTION 'Seleção inválida: até % leads por lote.',(CASE WHEN p_action='bulk_archive' THEN 100 ELSE 200 END) USING ERRCODE='22023';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR jsonb_typeof(item->'id') IS DISTINCT FROM 'string' OR jsonb_typeof(item->'expected_updated_at') IS DISTINCT FROM 'string'
   OR nullif(item->>'id','') IS NULL OR nullif(item->>'expected_updated_at','') IS NULL THEN RAISE EXCEPTION 'Cada lead da seleção precisa de identidade e versão.' USING ERRCODE='40001';END IF;
 END LOOP;
 SELECT array_agg((value->>'id')::uuid ORDER BY (value->>'id')::uuid) INTO selected_ids FROM jsonb_array_elements(p_payload->'items');
 IF (SELECT count(DISTINCT x) FROM unnest(selected_ids) x)<>selection_count THEN RAISE EXCEPTION 'A seleção contém leads repetidos.' USING ERRCODE='22023';END IF;
 IF p_action='bulk_assign' THEN
  IF jsonb_typeof(p_payload->'ids') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Seleção de leads inválida.' USING ERRCODE='22023';END IF;
  SELECT array_agg(value::uuid ORDER BY value::uuid) INTO provided_ids FROM jsonb_array_elements_text(p_payload->'ids');
  IF provided_ids IS DISTINCT FROM selected_ids THEN RAISE EXCEPTION 'A seleção e suas versões não correspondem.' USING ERRCODE='40001';END IF;
  owner_key:=nullif(p_payload->>'owner_id','')::uuid;
  IF owner_key IS NOT NULL AND NOT coalesce(private.crm_ia_agent_actor(p_client_id,owner_key),false) THEN RAISE EXCEPTION 'Responsável indisponível nesta conta.' USING ERRCODE='42501';END IF;
  IF actor_role='colaborador' AND owner_key IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Somente a gestão transfere leads.' USING ERRCODE='42501';END IF;
 END IF;
 FOR locked_lead IN SELECT * FROM public.leads WHERE cliente_id=p_client_id AND id=ANY(selected_ids) ORDER BY id FOR UPDATE LOOP
  IF NOT coalesce(private.crm_ia_lead(locked_lead.id,p_client_id),false) THEN RAISE EXCEPTION 'Lead indisponível ou sem acesso na seleção.' USING ERRCODE='42501';END IF;
  SELECT value->>'expected_updated_at' INTO expected FROM jsonb_array_elements(p_payload->'items') WHERE (value->>'id')::uuid=locked_lead.id;
  PERFORM private.crm_ia_version(expected,locked_lead.updated_at);locked_count:=locked_count+1;
 END LOOP;
 IF locked_count<>selection_count THEN RAISE EXCEPTION 'Lead indisponível ou sem acesso na seleção.' USING ERRCODE='42501';END IF;
 -- Permissions may change while any selected lead waits for its row lock.
 actor_role:=private.crm_ia_role();
 IF actor_role IS NULL OR NOT coalesce(private.crm_ia_client(p_client_id),false) OR EXISTS(
  SELECT 1 FROM unnest(selected_ids) selected(lead_id) WHERE NOT coalesce(private.crm_ia_lead(selected.lead_id,p_client_id),false)
 ) THEN RAISE EXCEPTION 'Lead ou ator indisponível ou sem acesso na seleção.' USING ERRCODE='42501';END IF;
 IF p_action='bulk_assign' THEN
  IF owner_key IS NOT NULL AND NOT coalesce(private.crm_ia_agent_actor(p_client_id,owner_key),false) THEN RAISE EXCEPTION 'Responsável indisponível nesta conta.' USING ERRCODE='42501';END IF;
  IF actor_role='colaborador' AND owner_key IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Somente a gestão transfere leads.' USING ERRCODE='42501';END IF;
 END IF;
 IF p_action='bulk_archive' THEN
  UPDATE public.leads SET crm_ia_archived_at=clock_timestamp(),updated_at=clock_timestamp() WHERE cliente_id=p_client_id AND id=ANY(selected_ids);
  UPDATE public.crm_ia_outbox SET status='cancelled',updated_at=clock_timestamp() WHERE cliente_id=p_client_id AND lead_id=ANY(selected_ids) AND kind<>'manual' AND status='pending';
 ELSE UPDATE public.leads SET responsavel_id=owner_key,updated_at=clock_timestamp() WHERE cliente_id=p_client_id AND id=ANY(selected_ids);
 END IF;
 RETURN jsonb_build_object('ok',true,'count',selection_count);
END$$;
REVOKE ALL ON FUNCTION public.crm_ia_workspace(text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_ia_workspace(text,uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
