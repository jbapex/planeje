-- Leituras do CRM IA: escopo antes da agregação, página somente depois da contagem.
CREATE FUNCTION private.crm_ia_conversation_rows(p_client uuid)
RETURNS TABLE(contact_id uuid,channel_id uuid,nome text,phone text,last_message text,last_message_at timestamptz,
  attendance text,awaiting_since timestamptz,lead_id uuid,assigned_to uuid,ia_ativa boolean,resolvida boolean,
  updated_at timestamptz,pipeline_id uuid,stage_id uuid,origin text,followup_due_at timestamptz,value numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  WITH identities AS MATERIALIZED (
    SELECT c.*,private.crm_ia_phone(coalesce(nullif(c.phone,''),CASE WHEN c.from_jid LIKE '%@s.whatsapp.net' THEN c.from_jid END)) AS phone_key
    FROM public.cliente_whatsapp_contact c WHERE c.cliente_id=p_client AND private.crm_ia_client(p_client)
  ), phones AS (
    SELECT phone_key,CASE WHEN count(*)=1 THEN (array_agg(id))[1] END AS contact_id
    FROM identities WHERE phone_key<>'' GROUP BY phone_key
  ), lead_contacts AS (
    SELECT l.id,l.crm_ia_contact_id,coalesce(l.crm_ia_contact_id,p.contact_id) AS contact_id
    FROM public.leads l LEFT JOIN phones p ON p.phone_key=private.crm_ia_phone(l.whatsapp)
    WHERE l.cliente_id=p_client AND l.crm_ia_archived_at IS NULL
  ), links AS (
    SELECT contact_id,CASE
      WHEN count(*) FILTER(WHERE crm_ia_contact_id IS NOT NULL)=1
        THEN (array_agg(id ORDER BY id) FILTER(WHERE crm_ia_contact_id IS NOT NULL))[1]
      WHEN count(*) FILTER(WHERE crm_ia_contact_id IS NOT NULL)=0 AND count(*)=1 THEN (array_agg(id))[1]
    END AS lead_id FROM lead_contacts WHERE contact_id IS NOT NULL GROUP BY contact_id
  ), contacts AS MATERIALIZED (
    SELECT c.* FROM identities c WHERE private.crm_ia_contact(p_client,c.id)
  ), messages AS (
    SELECT c.id AS contact_id,i.whatsapp_config_id AS channel_id,i.id AS message_id,i.body,
      coalesce(i.msg_timestamp,i.created_at) AS message_at,false AS from_me
    FROM contacts c JOIN public.cliente_whatsapp_inbox i ON i.cliente_id=p_client
      AND (i.from_jid=c.from_jid OR i.chat_jid=c.from_jid)
    WHERE NOT coalesce(i.is_group,false) AND private.crm_ia_channel(p_client,i.whatsapp_config_id)
    UNION ALL
    SELECT c.id,s.whatsapp_config_id,s.id,s.body,s.created_at,true
    FROM contacts c JOIN public.cliente_whatsapp_sent s ON s.cliente_id=p_client
      AND (s.to_jid=c.from_jid OR s.chat_jid=c.from_jid)
    WHERE private.crm_ia_channel(p_client,s.whatsapp_config_id)
  ), latest AS (
    SELECT DISTINCT ON(contact_id,channel_id) * FROM messages
    ORDER BY contact_id,channel_id,message_at DESC,message_id DESC,from_me DESC
  )
  SELECT c.id,m.channel_id,coalesce(nullif(btrim(c.mini_crm->>'contato_nome'),''),nullif(btrim(c.sender_name),''),'Contato sem nome'),
    c.phone,m.body,m.message_at,
    CASE WHEN s.status='finalizado' THEN 'resolved' WHEN s.id IS NULL OR coalesce(s.ia_pausada,true) THEN 'human' ELSE 'ai' END,
    CASE WHEN s.status='esperando' THEN s.status_at END,l.id,s.assigned_to,
    s.id IS NOT NULL AND s.status IS DISTINCT FROM 'finalizado' AND NOT coalesce(s.ia_pausada,true),
    coalesce(s.status='finalizado',false),coalesce(s.updated_at,c.updated_at),l.pipeline_id,l.stage_id,l.origem,
    s.ia_followup_due_at,l.valor
  FROM latest m JOIN contacts c ON c.id=m.contact_id
  LEFT JOIN public.cliente_atend_conversas s ON s.cliente_id=p_client AND s.contact_id=c.id
  LEFT JOIN links k ON k.contact_id=c.id
  LEFT JOIN public.leads l ON l.id=k.lead_id AND l.cliente_id=p_client AND private.crm_ia_lead(l.id,p_client)
$$;
REVOKE ALL ON FUNCTION private.crm_ia_conversation_rows(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.crm_ia_read(p_action text,p_client uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  since_date date; until_date date; since_at timestamptz; until_at timestamptz;
  offset_n integer; limit_n integer; search_text text; pipeline_filter uuid; stage_filter uuid; owner_filter uuid;
  channel_filter uuid; contact_filter uuid; origin_filter text; attendance_filter text; result jsonb;
  selected_lead public.leads; selected_contact public.cliente_whatsapp_contact; resolved_contact uuid;
  has_conversation_source boolean;
BEGIN
  IF private.crm_ia_role() IS NULL OR NOT coalesce(private.crm_ia_client(p_client),false) THEN
    RAISE EXCEPTION 'Sem acesso a esta conta.' USING ERRCODE='42501';
  END IF;
  IF coalesce(jsonb_typeof(p_payload),'')<>'object' OR octet_length(p_payload::text)>2000000 THEN
    RAISE EXCEPTION 'Dados inválidos.' USING ERRCODE='22023';
  END IF;
  since_date:=coalesce(nullif(p_payload->>'since','')::date,(current_timestamp AT TIME ZONE 'America/Sao_Paulo')::date-6);
  until_date:=coalesce(nullif(p_payload->>'until','')::date,(current_timestamp AT TIME ZONE 'America/Sao_Paulo')::date);
  IF until_date<since_date OR until_date-since_date>366 THEN RAISE EXCEPTION 'Período inválido.' USING ERRCODE='22023'; END IF;
  since_at:=since_date::timestamp AT TIME ZONE 'America/Sao_Paulo';
  until_at:=(until_date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo';
  offset_n:=greatest(0,least(coalesce((p_payload->>'offset')::integer,0),100000));
  limit_n:=greatest(1,least(coalesce((p_payload->>'limit')::integer,50),200));
  search_text:=left(btrim(coalesce(p_payload->>'search','')),200);
  pipeline_filter:=nullif(p_payload->>'pipeline_id','')::uuid;
  stage_filter:=nullif(p_payload->>'stage_id','')::uuid;
  owner_filter:=nullif(p_payload->>'owner_id','')::uuid;
  channel_filter:=nullif(p_payload->>'channel_id','')::uuid;
  contact_filter:=nullif(p_payload->>'contact_id','')::uuid;
  origin_filter:=nullif(p_payload->>'origin','');
  attendance_filter:=nullif(p_payload->>'attendance','');
  IF channel_filter IS NOT NULL AND NOT coalesce(private.crm_ia_channel(p_client,channel_filter),false) THEN
    RAISE EXCEPTION 'Sem acesso a este canal.' USING ERRCODE='42501';
  END IF;
  IF contact_filter IS NOT NULL AND NOT coalesce(private.crm_ia_contact(p_client,contact_filter),false) THEN
    RAISE EXCEPTION 'Sem acesso a este contato.' USING ERRCODE='42501';
  END IF;
  IF attendance_filter IS NOT NULL AND attendance_filter NOT IN ('all','ai','human','resolved','waiting','followup') THEN
    RAISE EXCEPTION 'Filtro de atendimento inválido.' USING ERRCODE='22023';
  END IF;

  IF p_action='conversations' THEN
    WITH filtered AS MATERIALIZED (
      SELECT c.* FROM private.crm_ia_conversation_rows(p_client) c
      WHERE c.last_message_at>=since_at AND c.last_message_at<until_at
        AND (contact_filter IS NULL OR c.contact_id=contact_filter)
        AND (channel_filter IS NULL OR c.channel_id=channel_filter)
        AND (pipeline_filter IS NULL OR c.pipeline_id=pipeline_filter)
        AND (stage_filter IS NULL OR c.stage_id=stage_filter)
        AND (owner_filter IS NULL OR c.assigned_to=owner_filter)
        AND (origin_filter IS NULL OR c.origin=origin_filter)
        AND (search_text='' OR c.nome ILIKE '%'||search_text||'%' OR c.phone ILIKE '%'||search_text||'%')
        AND (attendance_filter IS NULL OR attendance_filter='all' OR c.attendance=attendance_filter
          OR (attendance_filter='waiting' AND c.awaiting_since IS NOT NULL)
          OR (attendance_filter='followup' AND c.followup_due_at IS NOT NULL AND NOT c.resolvida))
    ), page AS (
      SELECT * FROM filtered ORDER BY
        CASE WHEN p_payload->>'sort'='name' THEN nome END,
        CASE WHEN p_payload->>'sort'='oldest' THEN last_message_at END,
        CASE WHEN p_payload->>'sort'='value' THEN value END DESC NULLS LAST,
        last_message_at DESC,contact_id,channel_id LIMIT limit_n OFFSET offset_n
    )
    SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(p)-ARRAY['phone','pipeline_id','stage_id','origin','followup_due_at','value']) FROM page p),'[]'),
      'total',(SELECT count(*) FROM filtered)) INTO result;
    RETURN result;
  ELSIF p_action='overview' THEN
    SELECT EXISTS(SELECT 1 FROM public.cliente_whatsapp_config c WHERE c.cliente_id=p_client AND private.crm_ia_channel(p_client,c.id))
      INTO has_conversation_source;
    WITH conversations AS MATERIALIZED (
      SELECT c.* FROM private.crm_ia_conversation_rows(p_client) c
      WHERE c.last_message_at>=since_at AND c.last_message_at<until_at
        AND (contact_filter IS NULL OR c.contact_id=contact_filter)
        AND (channel_filter IS NULL OR c.channel_id=channel_filter)
        AND (pipeline_filter IS NULL OR c.pipeline_id=pipeline_filter)
        AND (stage_filter IS NULL OR c.stage_id=stage_filter)
        AND (owner_filter IS NULL OR c.assigned_to=owner_filter)
        AND (origin_filter IS NULL OR c.origin=origin_filter)
        AND (search_text='' OR c.nome ILIKE '%'||search_text||'%' OR c.phone ILIKE '%'||search_text||'%')
        AND (attendance_filter IS NULL OR attendance_filter='all' OR c.attendance=attendance_filter
          OR (attendance_filter='waiting' AND c.awaiting_since IS NOT NULL)
          OR (attendance_filter='followup' AND c.followup_due_at IS NOT NULL AND NOT c.resolvida))
    ), leads AS MATERIALIZED (
      SELECT l.*,coalesce(l.data_entrada,(l.created_at AT TIME ZONE 'America/Sao_Paulo')::date) AS entry_day
      FROM public.leads l WHERE l.cliente_id=p_client AND l.crm_ia_archived_at IS NULL AND private.crm_ia_lead(l.id,p_client)
        AND coalesce(l.data_entrada,(l.created_at AT TIME ZONE 'America/Sao_Paulo')::date) BETWEEN since_date AND until_date
        AND (pipeline_filter IS NULL OR l.pipeline_id=pipeline_filter)
        AND (stage_filter IS NULL OR l.stage_id=stage_filter)
        AND (owner_filter IS NULL OR l.responsavel_id=owner_filter)
        AND (origin_filter IS NULL OR l.origem=origin_filter)
        AND (search_text='' OR l.nome ILIKE '%'||search_text||'%' OR l.whatsapp ILIKE '%'||search_text||'%' OR l.email ILIKE '%'||search_text||'%')
        AND ((channel_filter IS NULL AND contact_filter IS NULL AND (attendance_filter IS NULL OR attendance_filter='all'))
          OR EXISTS(SELECT 1 FROM conversations c WHERE c.lead_id=l.id))
    ), appointments AS (
      SELECT a.id FROM public.crm_ia_appointments a
      WHERE a.cliente_id=p_client AND a.status IN ('scheduled','confirmed') AND a.start_at>=since_at AND a.start_at<until_at
        AND (a.lead_id IS NULL OR private.crm_ia_lead(a.lead_id,p_client))
        AND (a.contact_id IS NULL OR private.crm_ia_contact(p_client,a.contact_id))
        AND (owner_filter IS NULL OR a.owner_id=owner_filter)
        AND (contact_filter IS NULL OR a.contact_id=contact_filter)
        AND ((pipeline_filter IS NULL AND stage_filter IS NULL AND origin_filter IS NULL AND search_text='') OR EXISTS(
          SELECT 1 FROM public.leads l WHERE l.id=a.lead_id AND l.cliente_id=p_client AND private.crm_ia_lead(l.id,p_client)
            AND (pipeline_filter IS NULL OR l.pipeline_id=pipeline_filter) AND (stage_filter IS NULL OR l.stage_id=stage_filter)
            AND (origin_filter IS NULL OR l.origem=origin_filter)
            AND (search_text='' OR l.nome ILIKE '%'||search_text||'%' OR l.whatsapp ILIKE '%'||search_text||'%' OR l.email ILIKE '%'||search_text||'%')))
        AND ((channel_filter IS NULL AND (attendance_filter IS NULL OR attendance_filter='all')) OR EXISTS(
          SELECT 1 FROM conversations c WHERE c.contact_id=a.contact_id OR c.lead_id=a.lead_id))
    ), daily AS (
      SELECT day::date AS day,(SELECT count(*) FROM leads l WHERE l.entry_day=day::date) AS count
      FROM generate_series(since_date::timestamp,until_date::timestamp,interval '1 day') day
    ), stages AS (
      SELECT s.id,s.nome,s.color,s.ordem,count(l.id) AS count,coalesce(sum(l.valor),0) AS value
      FROM public.crm_stages s JOIN public.crm_pipelines p ON p.id=s.pipeline_id AND p.cliente_id=p_client
      LEFT JOIN leads l ON l.stage_id=s.id
      WHERE (pipeline_filter IS NULL OR s.pipeline_id=pipeline_filter) AND (stage_filter IS NULL OR s.id=stage_filter)
      GROUP BY s.id,s.nome,s.color,s.ordem
    ), origins AS (SELECT coalesce(origem,'') AS name,count(*) AS count FROM leads GROUP BY coalesce(origem,''))
    SELECT jsonb_build_object(
      'totals',jsonb_build_object('leads',(SELECT count(*) FROM leads),
        'qualified',(SELECT count(*) FROM leads l WHERE (to_jsonb(l)->>'qualificado')::boolean IS TRUE),
        'conversations',CASE WHEN has_conversation_source THEN (SELECT count(*) FROM conversations WHERE NOT resolvida) END,
        'ai_conversations',CASE WHEN has_conversation_source THEN (SELECT count(*) FROM conversations WHERE attendance='ai') END,
        'human_conversations',CASE WHEN has_conversation_source THEN (SELECT count(*) FROM conversations WHERE attendance='human') END,
        'appointments',(SELECT count(*) FROM appointments),
        'waiting',CASE WHEN has_conversation_source THEN (SELECT count(*) FROM conversations WHERE awaiting_since IS NOT NULL AND NOT resolvida) END),
      'daily',coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.day) FROM daily d),'[]'),
      'stages',coalesce((SELECT jsonb_agg(to_jsonb(s)-'ordem' ORDER BY s.ordem,s.id) FROM stages s),'[]'),
      'origins',coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.count DESC,o.name) FROM origins o),'[]'),
      'waiting',coalesce((SELECT jsonb_agg(jsonb_build_object('contact_id',c.contact_id,'nome',c.nome,'since',c.awaiting_since,'channel_id',c.channel_id)
        ORDER BY c.awaiting_since,c.contact_id,c.channel_id) FROM conversations c WHERE c.awaiting_since IS NOT NULL AND NOT c.resolvida),'[]'),
      'coverage',jsonb_build_object('since',since_date,'until',until_date,
        'conversations',CASE WHEN has_conversation_source THEN 'available' ELSE 'unavailable' END,
        'message',CASE WHEN NOT has_conversation_source THEN 'Atendimento sem canal autorizado para consulta nesta conta.' END)) INTO result;
    RETURN result;
  ELSIF p_action='lead' THEN
    IF NOT coalesce(private.crm_ia_lead(nullif(p_payload->>'id','')::uuid,p_client),false) THEN
      RAISE EXCEPTION 'Lead indisponível ou sem acesso.' USING ERRCODE='42501';
    END IF;
    SELECT * INTO selected_lead FROM public.leads WHERE id=(p_payload->>'id')::uuid AND cliente_id=p_client;
    resolved_contact:=selected_lead.crm_ia_contact_id;
    IF resolved_contact IS NULL AND private.crm_ia_phone(selected_lead.whatsapp)<>'' THEN
      SELECT CASE WHEN count(*)=1 THEN (array_agg(c.id))[1] END INTO resolved_contact
      FROM public.cliente_whatsapp_contact c WHERE c.cliente_id=p_client
        AND private.crm_ia_phone(coalesce(nullif(c.phone,''),CASE WHEN c.from_jid LIKE '%@s.whatsapp.net' THEN c.from_jid END))=private.crm_ia_phone(selected_lead.whatsapp);
    END IF;
    IF coalesce(private.crm_ia_contact(p_client,resolved_contact),false) THEN
      SELECT * INTO selected_contact FROM public.cliente_whatsapp_contact WHERE id=resolved_contact AND cliente_id=p_client;
    ELSE resolved_contact:=NULL;
    END IF;
    SELECT jsonb_build_object(
      'lead',to_jsonb(selected_lead)-'crm_ia_contact_id'||jsonb_build_object('contact_id',resolved_contact,'archived_at',selected_lead.crm_ia_archived_at),
      'contact',CASE WHEN selected_contact.id IS NOT NULL THEN jsonb_build_object('id',selected_contact.id,'cliente_id',p_client,
        'from_jid',selected_contact.from_jid,'phone',selected_contact.phone,'sender_name',selected_contact.sender_name,
        'nome',coalesce(nullif(selected_contact.mini_crm->>'contato_nome',''),selected_contact.sender_name),'updated_at',selected_contact.updated_at) END,
      'conversation',(SELECT to_jsonb(c)-ARRAY['phone','pipeline_id','stage_id','origin','followup_due_at','value']
        FROM private.crm_ia_conversation_rows(p_client) c WHERE c.contact_id=resolved_contact AND (channel_filter IS NULL OR c.channel_id=channel_filter)
        ORDER BY c.last_message_at DESC,c.channel_id LIMIT 1),
      'events',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.realizado_em DESC,e.id) FROM public.crm_funnel_events e WHERE e.lead_id=selected_lead.id),'[]'),
      'appointments',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.start_at,a.id) FROM public.crm_ia_appointments a
        WHERE a.cliente_id=p_client AND (a.lead_id=selected_lead.id OR (a.lead_id IS NULL AND a.contact_id=resolved_contact))
          AND (a.contact_id IS NULL OR private.crm_ia_contact(p_client,a.contact_id))),'[]')) INTO result;
    RETURN result;
  ELSIF p_action='usage' THEN
    WITH conversation_scope AS MATERIALIZED (
      SELECT c.* FROM private.crm_ia_conversation_rows(p_client) c
      WHERE (pipeline_filter IS NULL OR c.pipeline_id=pipeline_filter) AND (stage_filter IS NULL OR c.stage_id=stage_filter)
        AND (origin_filter IS NULL OR c.origin=origin_filter)
        AND (channel_filter IS NULL OR c.channel_id=channel_filter)
        AND (search_text='' OR c.nome ILIKE '%'||search_text||'%' OR c.phone ILIKE '%'||search_text||'%')
        AND (attendance_filter IS NULL OR attendance_filter='all' OR c.attendance=attendance_filter
          OR (attendance_filter='waiting' AND c.awaiting_since IS NOT NULL)
          OR (attendance_filter='followup' AND c.followup_due_at IS NOT NULL AND NOT c.resolvida))
    ), logs AS MATERIALIZED (
      SELECT l.id,l.agente_id,l.tokens,nullif(to_jsonb(l)->>'whatsapp_config_id','')::uuid AS channel_id
      FROM public.cliente_atend_ia_log l WHERE l.cliente_id=p_client AND l.created_at>=since_at AND l.created_at<until_at
        AND l.acao IN ('testar','sugerir','responder')
        AND (owner_filter IS NULL OR l.user_id=owner_filter)
        AND (contact_filter IS NULL OR l.contact_id=contact_filter)
        AND ((pipeline_filter IS NULL AND stage_filter IS NULL AND origin_filter IS NULL AND search_text=''
          AND (attendance_filter IS NULL OR attendance_filter='all')) OR EXISTS(
            SELECT 1 FROM conversation_scope c WHERE c.contact_id=l.contact_id))
        AND ((l.contact_id IS NOT NULL AND private.crm_ia_contact(p_client,l.contact_id))
          OR (l.contact_id IS NULL AND (private.crm_ia_role() IN ('admin','superadmin') OR l.user_id=auth.uid())))
    ), visible AS (
      SELECT l.*,l.channel_id IS NULL AND (channel_filter IS NOT NULL OR EXISTS(
        SELECT 1 FROM public.cliente_whatsapp_config c WHERE c.cliente_id=p_client AND NOT private.crm_ia_channel(p_client,c.id))) AS unattributed
      FROM logs l WHERE l.channel_id IS NULL OR (private.crm_ia_channel(p_client,l.channel_id) AND (channel_filter IS NULL OR l.channel_id=channel_filter))
    ), measured AS MATERIALIZED (SELECT * FROM visible WHERE NOT unattributed),
    agents AS (
      SELECT m.agente_id AS id,coalesce(a.nome,'Agente removido') AS nome,count(*) AS responses,
        CASE WHEN bool_and(m.tokens IS NOT NULL) THEN sum(m.tokens) END AS tokens
      FROM measured m LEFT JOIN public.cliente_atend_ia_agentes a ON a.id=m.agente_id AND a.cliente_id=p_client
      GROUP BY m.agente_id,a.nome
    ), coverage AS (SELECT NOT EXISTS(SELECT 1 FROM visible WHERE unattributed) AS complete)
    SELECT jsonb_build_object(
      'responses',CASE WHEN NOT c.complete AND NOT EXISTS(SELECT 1 FROM measured) THEN NULL ELSE (SELECT count(*) FROM measured) END,
      'tokens',CASE WHEN NOT c.complete AND NOT EXISTS(SELECT 1 FROM measured) THEN NULL
        WHEN EXISTS(SELECT 1 FROM measured WHERE tokens IS NULL) THEN NULL ELSE (SELECT coalesce(sum(tokens),0) FROM measured) END,
      'by_agent',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.responses DESC,a.id) FROM agents a),'[]'),
      'limits',NULL,'coverage',jsonb_build_object('since',since_date,'until',until_date,'complete',c.complete,
        'reason',CASE WHEN NOT c.complete THEN 'channel_not_recorded' END,
        'message',CASE WHEN NOT c.complete THEN 'Uso parcial: registros antigos sem canal não podem ser atribuídos com segurança a este recorte.'
          ELSE 'Gerações de IA registradas no período; testes e sugestões não comprovam envio ao contato.' END)) INTO result FROM coverage c;
    RETURN result;
  END IF;
  RAISE EXCEPTION 'Leitura CRM IA inválida.' USING ERRCODE='22023';
END $$;
REVOKE ALL ON FUNCTION private.crm_ia_read(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
