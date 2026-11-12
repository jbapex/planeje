-- Compact traffic inbox reads existing Atlas evidence; it never completes tasks or conversations.
BEGIN;

CREATE FUNCTION private.traffic_registered_actor(p_channel uuid,p_jid text,p_phone text)
RETURNS uuid LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH sender AS (
  SELECT lower(btrim(coalesce(p_jid,''))) AS jid,
   CASE WHEN regexp_replace(coalesce(p_phone,''),'\D','','g')<>'' THEN regexp_replace(p_phone,'\D','','g')
    WHEN lower(btrim(coalesce(p_jid,''))) ~ '^\d+(:\d+)?@(s\.whatsapp\.net|c\.us)$'
    THEN split_part(split_part(p_jid,'@',1),':',1) ELSE '' END AS phone
 ), matches AS (
  SELECT DISTINCT p.id FROM public.atendimento_grupo_remetente_interno r
  JOIN public.profiles p ON p.id=r.profile_id AND p.status='active' AND p.role IN('admin','superadmin','colaborador')
  CROSS JOIN sender s
  WHERE (r.cliente_id IS NULL OR r.cliente_id=p_channel)
   AND ((nullif(lower(btrim(r.sender_jid)),'')=s.jid)
    OR (length(s.phone) BETWEEN 10 AND 15 AND regexp_replace(coalesce(r.phone,''),'\D','','g')=s.phone))
 ) SELECT CASE WHEN count(*)=1 THEN (array_agg(id))[1] END FROM matches;
$$;
REVOKE ALL ON FUNCTION private.traffic_registered_actor(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.traffic_registered_actor(uuid,text,text) TO service_role;

CREATE FUNCTION public.traffic_pending_conversations() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid();admin boolean;result jsonb;
BEGIN
 SELECT p.role IN('admin','superadmin') INTO admin FROM public.profiles p
 WHERE p.id=actor AND p.status='active' AND p.role IN('admin','superadmin','colaborador');
 IF actor IS NULL OR admin IS NULL OR NOT private.planeje_live_session() OR NOT public.central_trafego_ui_allowed() THEN
  RAISE EXCEPTION 'Acesso atual ao Tráfego necessário.' USING ERRCODE='42501';
 END IF;
 WITH scope AS MATERIALIZED (
  SELECT c.id AS client_id,c.empresa,g.id AS conversation_id,g.cliente_id,g.chat_jid,g.display_name,g.status,g.last_message_at,
   p.id AS gestor_id,p.full_name AS gestor_name,cfg.owner_id
  FROM public.clientes c JOIN public.traffic_client_ops ops ON ops.client_id=c.id
  JOIN public.profiles p ON p.id=ops.primary_assignee_id AND p.status='active' AND p.role IN('admin','superadmin','colaborador')
  JOIN public.atendimento_conversas g ON (
   c.entregaveis->'whatsapp_grupo'->>'conversation_id'=g.id::text OR (
    c.entregaveis->'whatsapp_grupo'->>'chat_jid'=g.chat_jid AND
    c.entregaveis->'whatsapp_grupo'->>'wa_cliente_id'=g.cliente_id::text))
   AND private.atlas_event_client(g.id)=c.id
  JOIN public.atlas_event_config cfg ON c.id=ANY(cfg.client_ids) AND private.atlas_event_enabled(cfg.owner_id)
  WHERE c.etapa='closed' AND (admin OR p.id=actor) AND public.central_trafego_can_access_client(c.id)
 ), classified AS MATERIALIZED (
  SELECT s.*,f.id AS finding_id,v.value->'result' AS decision,j.input,j.coverage
  FROM scope s JOIN public.atlas_event_findings f ON f.client_id=s.client_id AND f.conversation_id=s.conversation_id AND f.owner_id=s.owner_id
  -- An uncertain continuation cannot erase the last classified customer request.
  CROSS JOIN LATERAL (SELECT value FROM jsonb_array_elements(f.versions) WITH ORDINALITY x(value,ord)
   WHERE value->'result'->>'topic' IN('traffic','other')
    AND (value->'result'->>'topic'='other' OR value->'result'->>'awaiting_reply_to' IS NOT NULL)
   ORDER BY ord DESC LIMIT 1) v
  JOIN public.atlas_event_jobs j ON j.id::text=v.value->>'job_id' AND j.owner_id=s.owner_id
   AND j.client_id=s.client_id AND j.conversation_id=s.conversation_id AND j.state='completed' AND j.published_at IS NOT NULL
 ), requests AS MATERIALIZED (
  SELECT f.*,i.id AS source_id,coalesce(i.msg_timestamp,i.created_at) AS since
  FROM classified f
  JOIN public.cliente_whatsapp_inbox i ON 'in:'||i.id::text=f.decision->>'awaiting_reply_to'
   AND i.conversation_id=f.conversation_id AND i.cliente_id=f.cliente_id AND i.media_purged_at IS NULL
  CROSS JOIN LATERAL (SELECT value FROM jsonb_array_elements(f.input->'messages') x(value)
   WHERE value->>'id'='in:'||i.id::text LIMIT 1) source
  WHERE f.decision->>'topic'='traffic'
   AND f.decision->'sources' ? ('in:'||i.id::text)
   AND coalesce(i.msg_timestamp,i.created_at)<=now()
   AND private.traffic_registered_actor(f.cliente_id,i.sender_jid,i.phone) IS NULL
   AND (NOT (lower(coalesce(i.type,'')) IN('ptt','audio','audiomessage','voice','myaudio','voicemessage','voice_message')) AND source.value->>'body' IS NOT DISTINCT FROM regexp_replace(i.body,E'[\\x01-\\x08\\x0b\\x0c\\x0e-\\x1f]','','g') OR EXISTS(
    SELECT 1 FROM public.atlas_audio_transcripts a WHERE a.inbox_id=i.id AND a.owner_id=f.owner_id
     AND a.conversation_id=f.conversation_id AND a.status='completed' AND lower(coalesce(i.type,'')) IN('ptt','audio','audiomessage','voice','myaudio','voicemessage','voice_message')
        AND regexp_replace(a.transcript,E'[\\x01-\\x08\\x0b\\x0c\\x0e-\\x1f]','','g')=source.value->>'body'))
 ), pending AS (
  SELECT r.* FROM requests r WHERE NOT EXISTS (
   SELECT 1 FROM jsonb_array_elements(r.input->'messages') response(value)
   WHERE value->>'id'=r.decision->>'answered_by_message' AND r.decision->'sources' ? (value->>'id')
    AND value->>'actor_id'=r.gestor_id::text
    AND (EXISTS(
     SELECT 1 FROM public.cliente_whatsapp_inbox i WHERE 'in:'||i.id::text=value->>'id'
      AND i.conversation_id=r.conversation_id AND i.cliente_id=r.cliente_id AND i.media_purged_at IS NULL
      AND coalesce(i.msg_timestamp,i.created_at)>r.since AND coalesce(i.msg_timestamp,i.created_at)<=now()
      AND private.traffic_registered_actor(r.cliente_id,i.sender_jid,i.phone)=r.gestor_id
      AND (NOT (lower(coalesce(i.type,'')) IN('ptt','audio','audiomessage','voice','myaudio','voicemessage','voice_message')) AND value->>'body' IS NOT DISTINCT FROM regexp_replace(i.body,E'[\\x01-\\x08\\x0b\\x0c\\x0e-\\x1f]','','g') OR EXISTS(
       SELECT 1 FROM public.atlas_audio_transcripts a WHERE a.inbox_id=i.id AND a.owner_id=r.owner_id
        AND a.conversation_id=r.conversation_id AND a.status='completed' AND lower(coalesce(i.type,'')) IN('ptt','audio','audiomessage','voice','myaudio','voicemessage','voice_message')
        AND regexp_replace(a.transcript,E'[\\x01-\\x08\\x0b\\x0c\\x0e-\\x1f]','','g')=value->>'body'))
    ) OR EXISTS(
     SELECT 1 FROM public.cliente_whatsapp_sent m WHERE 'out:'||m.id::text=value->>'id'
      AND m.conversation_id=r.conversation_id AND m.cliente_id=r.cliente_id AND m.sent_by=r.gestor_id
      AND m.created_at>r.since AND m.created_at<=now() AND m.ack_status IN('sent','delivered','read')
      AND m.body IS NOT DISTINCT FROM value->>'body'
    ))
  )
 ), conversations AS (
  SELECT conversation_id,client_id,cliente_id,empresa,display_name,chat_jid,status,gestor_id,gestor_name,min(since) AS since
  FROM pending GROUP BY conversation_id,client_id,cliente_id,empresa,display_name,chat_jid,status,gestor_id,gestor_name
 ) SELECT jsonb_build_object(
  'available',EXISTS(SELECT 1 FROM scope),
  'conversations',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.since,c.conversation_id) FROM conversations c),'[]'::jsonb),
  'pending_analysis',(SELECT count(DISTINCT s.conversation_id) FROM scope s LEFT JOIN public.atlas_event_groups g
   ON g.owner_id=s.owner_id AND g.conversation_id=s.conversation_id AND g.client_id=s.client_id
   WHERE g.checked_at IS NULL OR g.checked_at<s.last_message_at OR coalesce((g.coverage->>'partial')::boolean,false)
    OR EXISTS(SELECT 1 FROM public.atlas_event_jobs j WHERE j.owner_id=s.owner_id AND j.conversation_id=s.conversation_id AND j.state IN('queued','processing','error','blocked','budget_wait'))
    OR EXISTS(SELECT 1 FROM public.atlas_event_findings f WHERE f.owner_id=s.owner_id AND f.conversation_id=s.conversation_id
     AND coalesce(f.versions->-1->'result'->>'topic','unknown')='unknown')
    OR EXISTS(SELECT 1 FROM classified c WHERE c.owner_id=s.owner_id AND c.conversation_id=s.conversation_id
     AND c.decision->>'topic'='traffic' AND NOT EXISTS(SELECT 1 FROM requests r WHERE r.finding_id=c.finding_id))),
  'checked_at',now()
 ) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.traffic_pending_conversations() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.traffic_pending_conversations() TO authenticated;
COMMENT ON FUNCTION public.traffic_pending_conversations() IS 'Metadados de conversas de tráfego da carteira autorizada, a partir das fontes atuais do Atlas. Sem escrita ou exposição de memória privada.';
NOTIFY pgrst,'reload schema';
COMMIT;
