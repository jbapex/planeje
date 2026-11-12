BEGIN;

CREATE TABLE planeje_private.crm_ia_notification_snapshots (
 actor_id uuid NOT NULL REFERENCES public.profiles(id),cliente_id uuid NOT NULL REFERENCES public.clientes(id),
 snapshots jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(snapshots)='array' AND jsonb_array_length(snapshots)<=4),
 PRIMARY KEY(actor_id,cliente_id)
);
CREATE TABLE planeje_private.crm_ia_notification_reads (
 actor_id uuid NOT NULL REFERENCES public.profiles(id),cliente_id uuid NOT NULL REFERENCES public.clientes(id),
 lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,read_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(actor_id,cliente_id,lead_id)
);
CREATE TABLE planeje_private.crm_ia_ai_message_flags (
 id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),actor_id uuid NOT NULL REFERENCES public.profiles(id),
 cliente_id uuid NOT NULL REFERENCES public.clientes(id),contact_id uuid NOT NULL REFERENCES public.cliente_whatsapp_contact(id),
 channel_id uuid NOT NULL REFERENCES public.cliente_whatsapp_config(id),sent_id uuid NOT NULL REFERENCES public.cliente_whatsapp_sent(id),
 category text NOT NULL CHECK(category IN('off_topic','missing_information','inappropriate_tone','too_long','incorrect_information','wrong_tool','other')),
 note text NOT NULL DEFAULT '' CHECK(length(note)<=1000),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(actor_id,sent_id)
);
ALTER TABLE planeje_private.crm_ia_notification_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE planeje_private.crm_ia_notification_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE planeje_private.crm_ia_ai_message_flags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON planeje_private.crm_ia_notification_snapshots,planeje_private.crm_ia_notification_reads,planeje_private.crm_ia_ai_message_flags FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.crm_ia_notification_sources(p_client uuid)
RETURNS TABLE(id uuid,created_at timestamptz) LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT l.id,l.created_at FROM public.leads l
 WHERE l.cliente_id=p_client AND l.created_at IS NOT NULL AND private.crm_ia_lead(l.id,p_client)
$$;
REVOKE ALL ON FUNCTION private.crm_ia_notification_sources(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.crm_ia_ai_message_source(p_client uuid,p_contact uuid,p_channel uuid,p_sent uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(private.crm_ia_contact(p_client,p_contact) AND private.crm_ia_channel(p_client,p_channel)
  AND EXISTS(SELECT 1 FROM public.cliente_whatsapp_sent s
   JOIN public.cliente_whatsapp_contact c ON c.id=p_contact AND c.cliente_id=p_client
   JOIN public.crm_ia_outbox o ON o.cliente_id=p_client AND o.contact_id=c.id AND o.whatsapp_config_id=p_channel
    AND o.status='sent' AND nullif(o.provider_message_id,'') IS NOT NULL AND o.provider_message_id=s.message_id
   JOIN planeje_private.crm_ia_agent_runs r ON r.id=o.agent_run_id AND r.cliente_id=o.cliente_id
    AND r.channel_id=o.whatsapp_config_id AND r.contact_id=o.contact_id AND r.lead_id=o.lead_id
   WHERE s.id=p_sent AND s.cliente_id=p_client AND s.whatsapp_config_id=p_channel
    AND (s.to_jid=c.from_jid OR s.chat_jid=c.from_jid)
    AND s.body IS NOT DISTINCT FROM o.body
    -- The legacy sent table is user-writable; a copied provider ID cannot establish a second receipt.
    AND NOT EXISTS(SELECT 1 FROM public.cliente_whatsapp_sent duplicate WHERE duplicate.cliente_id=s.cliente_id
      AND duplicate.whatsapp_config_id=s.whatsapp_config_id AND duplicate.message_id=s.message_id AND duplicate.id<>s.id)
    AND r.status='queued' AND r.result->>'queued'='true' AND r.result->>'outbox_id'=o.id::text
    AND (o.kind='reply' AND r.mode='responder' OR o.kind='followup' AND r.mode='followup')),false)
$$;
REVOKE ALL ON FUNCTION private.crm_ia_ai_message_source(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;

ALTER FUNCTION public.crm_ia_workspace(text,uuid,jsonb) RENAME TO crm_ia_workspace_pre_conversation_controls;
REVOKE ALL ON FUNCTION public.crm_ia_workspace_pre_conversation_controls(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.crm_ia_workspace(p_action text,p_client_id uuid DEFAULT NULL,p_payload jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;rows jsonb;item jsonb;snapshot jsonb;history jsonb;watermark jsonb;membership text;
 contact_key uuid;channel_key uuid;sent_key uuid;lead_key uuid;candidate_count integer;explicit_count integer;
 category_key text;observation text;current_flag planeje_private.crm_ia_ai_message_flags;flag_result jsonb;
 selected_contact public.cliente_whatsapp_contact;existing_outbox public.crm_ia_outbox;matched boolean;marked bigint;
 offset_n integer;limit_n integer;schedule_now timestamptz;requested_at timestamptz;legacy_immediate boolean;
BEGIN
 IF p_action IS NULL OR p_action NOT IN('notifications','mark_notifications_read','flag_ai_message','conversation_context','messages','schedule_message') THEN
  RETURN public.crm_ia_workspace_pre_conversation_controls(p_action,p_client_id,p_payload);
 END IF;
 IF private.crm_ia_role() IS NULL OR NOT coalesce(private.crm_ia_client(p_client_id),false) THEN
  RAISE EXCEPTION 'Sem acesso a esta conta.' USING ERRCODE='42501';
 END IF;
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>2000000 THEN
  RAISE EXCEPTION 'Dados inválidos.' USING ERRCODE='22023';
 END IF;

 IF p_action IN('notifications','mark_notifications_read') THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('crm-ia-notifications:'||auth.uid()::text||':'||p_client_id::text,0));
  IF private.crm_ia_role() IS NULL OR NOT coalesce(private.crm_ia_client(p_client_id),false) THEN
   RAISE EXCEPTION 'Sem acesso a esta conta.' USING ERRCODE='42501';
  END IF;
  INSERT INTO planeje_private.crm_ia_notification_snapshots(actor_id,cliente_id) VALUES(auth.uid(),p_client_id) ON CONFLICT DO NOTHING;
  SELECT s.snapshots INTO history FROM planeje_private.crm_ia_notification_snapshots s
   WHERE s.actor_id=auth.uid() AND s.cliente_id=p_client_id FOR UPDATE;
  IF p_action='notifications' THEN
   offset_n:=greatest(0,coalesce((p_payload->>'offset')::integer,0));
   limit_n:=greatest(1,least(coalesce((p_payload->>'limit')::integer,20),200));
   WITH authorized AS MATERIALIZED(SELECT * FROM private.crm_ia_notification_sources(p_client_id)),
   page AS(SELECT a.*,r.read_at FROM authorized a LEFT JOIN planeje_private.crm_ia_notification_reads r
    ON r.actor_id=auth.uid() AND r.cliente_id=p_client_id AND r.lead_id=a.id
    ORDER BY a.created_at DESC,a.id DESC LIMIT limit_n OFFSET offset_n)
   SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(jsonb_build_object('id','lead_created:'||p.id::text,
     'type','lead_created','lead_id',p.id,'created_at',p.created_at,'read',p.read_at IS NOT NULL) ORDER BY p.created_at DESC,p.id DESC) FROM page p),'[]'),
    'total',(SELECT count(*) FROM authorized),
    'unread_count',(SELECT count(*) FROM authorized a WHERE NOT EXISTS(SELECT 1 FROM planeje_private.crm_ia_notification_reads r
      WHERE r.actor_id=auth.uid() AND r.cliente_id=p_client_id AND r.lead_id=a.id))),
    (SELECT jsonb_build_object('created_at',a.created_at,'lead_id',a.id) FROM authorized a ORDER BY a.created_at DESC,a.id DESC LIMIT 1),
    (SELECT md5(coalesce(string_agg(a.id::text||':'||extract(epoch FROM a.created_at)::text,',' ORDER BY a.id),'')) FROM authorized a)
   INTO result,watermark,membership;
   SELECT value INTO snapshot FROM jsonb_array_elements(history)
    WHERE value->>'membership'=membership AND value->'watermark' IS NOT DISTINCT FROM coalesce(watermark,'null'::jsonb) LIMIT 1;
   IF snapshot IS NULL THEN
    snapshot:=jsonb_build_object('id',gen_random_uuid(),'watermark',watermark,'membership',membership);
    SELECT jsonb_agg(value ORDER BY ordinality) INTO history FROM jsonb_array_elements(jsonb_build_array(snapshot)||history) WITH ORDINALITY WHERE ordinality<=4;
    UPDATE planeje_private.crm_ia_notification_snapshots SET snapshots=history WHERE actor_id=auth.uid() AND cliente_id=p_client_id;
   END IF;
   RETURN result||jsonb_build_object('snapshot',snapshot-'membership');
  END IF;
  SELECT value INTO snapshot FROM jsonb_array_elements(history) WHERE value->>'id'=p_payload->>'snapshot_id';
  IF snapshot IS NULL THEN RAISE EXCEPTION 'Snapshot de leitura indisponível. Atualize as notificações.' USING ERRCODE='40001';END IF;
  -- A bounded snapshot stores a membership digest, never copies lead content or an unbounded ID list.
  WITH authorized AS MATERIALIZED(SELECT * FROM private.crm_ia_notification_sources(p_client_id) a
    WHERE (a.created_at,a.id)<=((snapshot#>>'{watermark,created_at}')::timestamptz,(snapshot#>>'{watermark,lead_id}')::uuid)),
  proof AS(SELECT md5(coalesce(string_agg(a.id::text||':'||extract(epoch FROM a.created_at)::text,',' ORDER BY a.id),''))=snapshot->>'membership' AS valid FROM authorized a),
  inserted AS(INSERT INTO planeje_private.crm_ia_notification_reads(actor_id,cliente_id,lead_id)
    SELECT auth.uid(),p_client_id,a.id FROM authorized a,proof p WHERE p.valid ON CONFLICT DO NOTHING RETURNING 1)
  SELECT (SELECT valid FROM proof),(SELECT count(*) FROM inserted) INTO matched,marked;
  IF NOT coalesce(matched,false) OR private.crm_ia_role() IS NULL OR NOT coalesce(private.crm_ia_client(p_client_id),false) THEN
   RAISE EXCEPTION 'O snapshot de leitura foi alterado. Atualize as notificações.' USING ERRCODE='40001';
  END IF;
  RETURN jsonb_build_object('marked',marked,'snapshot_id',snapshot->>'id');
 END IF;

 contact_key:=nullif(p_payload->>'contact_id','')::uuid;channel_key:=nullif(p_payload->>'channel_id','')::uuid;
 IF NOT coalesce(private.crm_ia_contact(p_client_id,contact_key),false) OR NOT coalesce(private.crm_ia_channel(p_client_id,channel_key),false) THEN
  RAISE EXCEPTION 'Sem acesso ao contato ou canal desta conversa.' USING ERRCODE='42501';
 END IF;
 IF p_action='conversation_context' THEN
  SELECT * INTO selected_contact FROM public.cliente_whatsapp_contact WHERE id=contact_key AND cliente_id=p_client_id;
  WITH candidates AS(SELECT l.* FROM public.leads l WHERE l.cliente_id=p_client_id AND l.crm_ia_archived_at IS NULL
   AND (l.crm_ia_contact_id=contact_key OR l.crm_ia_contact_id IS NULL
    AND private.crm_ia_phone(l.whatsapp)<>'' AND private.crm_ia_phone(l.whatsapp)=private.crm_ia_phone(coalesce(nullif(selected_contact.phone,''),
      CASE WHEN selected_contact.from_jid LIKE '%@s.whatsapp.net' THEN selected_contact.from_jid END))
    AND (SELECT count(*) FROM public.cliente_whatsapp_contact c WHERE c.cliente_id=p_client_id
      AND private.crm_ia_phone(coalesce(nullif(c.phone,''),CASE WHEN c.from_jid LIKE '%@s.whatsapp.net' THEN c.from_jid END))=private.crm_ia_phone(l.whatsapp))=1))
  SELECT count(*),count(*) FILTER(WHERE crm_ia_contact_id IS NOT NULL),
   CASE WHEN count(*) FILTER(WHERE crm_ia_contact_id IS NOT NULL)=1 THEN (array_agg(id ORDER BY id) FILTER(WHERE crm_ia_contact_id IS NOT NULL))[1]
    WHEN count(*) FILTER(WHERE crm_ia_contact_id IS NOT NULL)=0 AND count(*)=1 THEN (array_agg(id))[1] END
   INTO candidate_count,explicit_count,lead_key FROM candidates;
  IF explicit_count>1 OR explicit_count=0 AND candidate_count>1 THEN RETURN '{"status":"ambiguous","lead":null}';END IF;
  IF lead_key IS NULL OR NOT coalesce(private.crm_ia_lead(lead_key,p_client_id),false) THEN RETURN '{"status":"unlinked","lead":null}';END IF;
  result:=public.crm_ia_workspace_pre_conversation_controls('lead',p_client_id,jsonb_build_object('id',lead_key));
  RETURN jsonb_build_object('status','linked','lead',result->'lead');
 ELSIF p_action='messages' THEN
  result:=public.crm_ia_workspace_pre_conversation_controls(p_action,p_client_id,p_payload);rows:='[]';
  FOR item IN SELECT value FROM jsonb_array_elements(coalesce(result->'rows','[]')) LOOP
   matched:=item->>'from_me'='true' AND private.crm_ia_ai_message_source(p_client_id,contact_key,channel_key,(item->>'id')::uuid);
   flag_result:=NULL;
   IF matched THEN SELECT to_jsonb(f)-ARRAY['actor_id','cliente_id','contact_id','channel_id','sent_id'] INTO flag_result
    FROM planeje_private.crm_ia_ai_message_flags f WHERE f.actor_id=auth.uid() AND f.cliente_id=p_client_id AND f.sent_id=(item->>'id')::uuid;END IF;
   rows:=rows||jsonb_build_array(item||jsonb_build_object('can_flag',coalesce(matched,false),'my_flag',flag_result));
  END LOOP;
  RETURN jsonb_set(result,'{rows}',rows);
 END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended('crm-ia:'||p_client_id::text,0));
 IF private.crm_ia_role() IS NULL OR NOT coalesce(private.crm_ia_client(p_client_id),false)
  OR NOT coalesce(private.crm_ia_contact(p_client_id,contact_key),false) OR NOT coalesce(private.crm_ia_channel(p_client_id,channel_key),false) THEN
  RAISE EXCEPTION 'Sem acesso à conversa.' USING ERRCODE='42501';
 END IF;
 IF p_action='schedule_message' THEN
  IF NOT coalesce(private.crm_ia_channel(p_client_id,channel_key,true),false) THEN RAISE EXCEPTION 'Sem acesso de envio para este canal.' USING ERRCODE='42501';END IF;
  SELECT * INTO existing_outbox FROM public.crm_ia_outbox o WHERE o.cliente_id=p_client_id AND o.created_by=auth.uid()
   AND o.request_id=nullif(p_payload->>'request_id','')::uuid FOR UPDATE;
  IF private.crm_ia_role() IS NULL OR NOT coalesce(private.crm_ia_contact(p_client_id,contact_key),false)
   OR NOT coalesce(private.crm_ia_channel(p_client_id,channel_key,true),false)
   OR nullif(p_payload->>'lead_id','') IS NOT NULL AND NOT coalesce(private.crm_ia_lead((p_payload->>'lead_id')::uuid,p_client_id),false) THEN
   RAISE EXCEPTION 'Sem acesso ao contato, canal ou lead deste envio.' USING ERRCODE='42501';END IF;
  schedule_now:=clock_timestamp();requested_at:=(p_payload->>'scheduled_at')::timestamptz;
  -- LIVE04 emits now-1s; any explicit timestamp up to two minutes old means immediate, including manual API payloads.
  legacy_immediate:=requested_at BETWEEN schedule_now-interval '2 minutes' AND schedule_now;
  IF existing_outbox.id IS NOT NULL THEN
   IF existing_outbox.kind<>'manual' OR existing_outbox.body IS DISTINCT FROM btrim(p_payload->>'body')
    OR existing_outbox.contact_id IS DISTINCT FROM contact_key OR existing_outbox.whatsapp_config_id IS DISTINCT FROM channel_key
    OR existing_outbox.lead_id IS DISTINCT FROM nullif(p_payload->>'lead_id','')::uuid
    OR existing_outbox.media_descriptor IS DISTINCT FROM '{}'::jsonb
    OR p_payload ? 'scheduled_at' AND existing_outbox.scheduled_at IS DISTINCT FROM requested_at
      AND NOT coalesce(existing_outbox.scheduled_at<=schedule_now AND legacy_immediate,false) THEN
    RAISE EXCEPTION 'Identificador já usado em outro envio ou horário.' USING ERRCODE='40001';
   END IF;
   RETURN to_jsonb(existing_outbox)-'claim_token';
  END IF;
  IF p_payload ? 'scheduled_at' AND (requested_at IS NULL OR requested_at<schedule_now-interval '2 minutes') THEN
   RAISE EXCEPTION 'Data de envio fora da tolerância legada de dois minutos.' USING ERRCODE='22023';
  END IF;
  RETURN public.crm_ia_workspace_pre_conversation_controls(p_action,p_client_id,p_payload);
 END IF;

 IF p_payload ?| ARRAY['actor_id','user_id','created_by'] THEN RAISE EXCEPTION 'O autor da sinalização vem da sessão.' USING ERRCODE='22023';END IF;
 sent_key:=nullif(p_payload->>'sent_id','')::uuid;category_key:=p_payload->>'category';observation:=btrim(coalesce(p_payload->>'note',''));
 IF category_key IS NULL OR category_key NOT IN('off_topic','missing_information','inappropriate_tone','too_long','incorrect_information','wrong_tool','other') THEN
  RAISE EXCEPTION 'Categoria de sinalização inválida.' USING ERRCODE='22023';END IF;
 IF p_payload ? 'note' AND jsonb_typeof(p_payload->'note') NOT IN('string','null') OR length(observation)>1000 THEN
  RAISE EXCEPTION 'A observação deve ter até 1.000 caracteres.' USING ERRCODE='22023';END IF;
 PERFORM 1 FROM public.cliente_whatsapp_sent s WHERE s.id=sent_key AND s.cliente_id=p_client_id FOR SHARE;
 PERFORM 1 FROM public.crm_ia_outbox o WHERE o.cliente_id=p_client_id AND o.contact_id=contact_key
  AND o.whatsapp_config_id=channel_key AND o.provider_message_id=(SELECT s.message_id FROM public.cliente_whatsapp_sent s WHERE s.id=sent_key) FOR SHARE;
 SELECT * INTO current_flag FROM planeje_private.crm_ia_ai_message_flags f WHERE f.actor_id=auth.uid() AND f.sent_id=sent_key FOR UPDATE;
 IF NOT private.crm_ia_ai_message_source(p_client_id,contact_key,channel_key,sent_key) THEN
  RAISE EXCEPTION 'Somente uma resposta da IA comprovadamente enviada pode ser sinalizada.' USING ERRCODE='42501';END IF;
 IF current_flag.id IS NOT NULL THEN
  IF current_flag.category=category_key AND current_flag.note=observation THEN RETURN to_jsonb(current_flag);END IF;
  PERFORM private.crm_ia_version(p_payload->>'expected_updated_at',current_flag.updated_at);
  UPDATE planeje_private.crm_ia_ai_message_flags SET category=category_key,note=observation,updated_at=clock_timestamp()
   WHERE actor_id=auth.uid() AND sent_id=sent_key RETURNING to_jsonb(crm_ia_ai_message_flags) INTO result;
 ELSE
  IF nullif(p_payload->>'expected_updated_at','') IS NOT NULL THEN RAISE EXCEPTION 'A sinalização foi alterada. Atualize a versão.' USING ERRCODE='40001';END IF;
  INSERT INTO planeje_private.crm_ia_ai_message_flags(actor_id,cliente_id,contact_id,channel_id,sent_id,category,note)
   VALUES(auth.uid(),p_client_id,contact_key,channel_key,sent_key,category_key,observation) RETURNING to_jsonb(crm_ia_ai_message_flags) INTO result;
 END IF;
 RETURN result;
END$$;
REVOKE ALL ON FUNCTION public.crm_ia_workspace(text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_ia_workspace(text,uuid,jsonb) TO authenticated;
COMMIT;
