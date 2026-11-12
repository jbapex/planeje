BEGIN;

-- https://developers.openai.com/api/docs/guides/text-to-speech
-- Speech model is fixed in the worker; this contract never accepts a provider/key/model from the browser.
CREATE FUNCTION private.crm_ia_voice_config(p_audio jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  IF p_audio IS NULL OR p_audio='"nunca"'::jsonb THEN
    RETURN '{"enabled":false,"input_enabled":false,"voice":"alloy","speed":1}'::jsonb;
  END IF;
  IF jsonb_typeof(p_audio)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_audio) k WHERE k NOT IN ('enabled','input_enabled','voice','speed')) THEN
    RAISE EXCEPTION 'Configuração de voz inválida.' USING ERRCODE='22023';
  END IF;
  result:='{"enabled":false,"input_enabled":false,"voice":"alloy","speed":1}'::jsonb||p_audio;
  IF jsonb_typeof(result->'enabled')<>'boolean' OR jsonb_typeof(result->'input_enabled')<>'boolean' OR jsonb_typeof(result->'voice')<>'string'
    OR result->>'voice' NOT IN ('alloy','ash','ballad','coral','echo','fable','nova','onyx','sage','shimmer','verse','marin','cedar')
    OR jsonb_typeof(result->'speed')<>'number' THEN RAISE EXCEPTION 'Configuração de voz inválida.' USING ERRCODE='22023'; END IF;
  IF (result->>'speed')::numeric NOT BETWEEN 0.25 AND 4 THEN RAISE EXCEPTION 'Velocidade da voz deve estar entre 0,25 e 4.' USING ERRCODE='22023'; END IF;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION private.crm_ia_voice_config(jsonb) FROM PUBLIC,anon,authenticated;

-- Legacy agent editors cannot authorize a new paid capability merely by writing JSON.
CREATE TABLE planeje_private.crm_ia_voice_authorizations (
  agent_id uuid PRIMARY KEY REFERENCES public.cliente_atend_ia_agentes(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.profiles(id),
  agent_updated_at timestamptz NOT NULL,
  settings jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE planeje_private.crm_ia_voice_deliveries (
  outbox_id uuid PRIMARY KEY REFERENCES public.crm_ia_outbox(id) ON DELETE CASCADE,
  claim_token uuid NOT NULL,
  settings jsonb NOT NULL,
  status text NOT NULL CHECK(status IN ('generating','ready','text_fallback')),
  descriptor jsonb NOT NULL DEFAULT '{}',
  error_code text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK(jsonb_typeof(descriptor)='object' AND octet_length(descriptor::text)<=24000 AND NOT descriptor ? 'file')
);
ALTER TABLE planeje_private.crm_ia_voice_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE planeje_private.crm_ia_voice_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON planeje_private.crm_ia_voice_authorizations,planeje_private.crm_ia_voice_deliveries FROM PUBLIC,anon,authenticated;
GRANT ALL ON planeje_private.crm_ia_voice_authorizations,planeje_private.crm_ia_voice_deliveries TO service_role;
ALTER TABLE public.crm_ia_outbox ADD COLUMN voice_status text NOT NULL DEFAULT 'off' CHECK(voice_status IN ('off','generating','ready','text_fallback')),
  ADD COLUMN voice_error_code text;

ALTER FUNCTION public.crm_ia_workspace(text,uuid,jsonb) RENAME TO crm_ia_workspace_pre_voice;
REVOKE ALL ON FUNCTION public.crm_ia_workspace_pre_voice(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.crm_ia_workspace(p_action text,p_client_id uuid DEFAULT NULL,p_payload jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; current_funil jsonb; funil jsonb; audio jsonb; client_key uuid; revision_key uuid; rows jsonb; source jsonb; descriptor jsonb; synthetic boolean; transcription jsonb;
BEGIN
  IF p_action IS DISTINCT FROM 'save_agent' THEN
    result:=public.crm_ia_workspace_pre_voice(p_action,p_client_id,p_payload);
    IF p_action='queue' THEN
      SELECT coalesce(jsonb_agg(r.value||jsonb_build_object('contact',jsonb_build_object('id',c.id,'nome',coalesce(nullif(c.mini_crm->>'contato_nome',''),nullif(c.sender_name,''),'Contato sem nome'),'phone',c.phone),
        'channel_name',ch.name,'voice_status',o.voice_status,'voice_error_code',o.voice_error_code) ORDER BY r.ordinality),'[]'::jsonb) INTO rows
      FROM jsonb_array_elements(coalesce(result->'rows','[]')) WITH ORDINALITY r(value,ordinality)
        JOIN public.crm_ia_outbox o ON o.id=(r.value->>'id')::uuid AND o.cliente_id=p_client_id
          AND o.contact_id=(r.value->>'contact_id')::uuid AND o.whatsapp_config_id=(r.value->>'whatsapp_config_id')::uuid
        JOIN public.cliente_whatsapp_contact c ON c.id=o.contact_id AND c.cliente_id=o.cliente_id
        JOIN public.cliente_whatsapp_config ch ON ch.id=o.whatsapp_config_id AND ch.cliente_id=o.cliente_id;
      RETURN jsonb_set(result,'{rows}',rows);
    ELSIF p_action='messages' THEN
      rows:='[]';
      FOR source IN SELECT value FROM jsonb_array_elements(coalesce(result->'rows','[]')) LOOP
        descriptor:=NULL;synthetic:=false;transcription:=NULL;
        IF source->>'from_me'='true' AND nullif(source->>'message_id','') IS NOT NULL THEN
          SELECT CASE WHEN o.voice_status='ready' AND v.status='ready' THEN v.descriptor ELSE o.media_descriptor END,
            o.voice_status='ready' AND v.status='ready' INTO descriptor,synthetic
          FROM public.crm_ia_outbox o LEFT JOIN planeje_private.crm_ia_voice_deliveries v ON v.outbox_id=o.id
          WHERE o.cliente_id=p_client_id AND o.contact_id=(p_payload->>'contact_id')::uuid AND o.whatsapp_config_id=(p_payload->>'channel_id')::uuid
            AND o.status='sent' AND o.provider_message_id=source->>'message_id'
          ORDER BY o.sent_at DESC,o.id LIMIT 1;
          IF nullif(descriptor->>'media_type','') IS NOT NULL THEN source:=source||jsonb_build_object('media_type',descriptor->>'media_type','voice_synthetic',coalesce(synthetic,false)); END IF;
        ELSIF source->>'from_me'='false' THEN
          SELECT CASE WHEN a.status='completed' THEN jsonb_build_object('status','ready','text',a.transcript) ELSE '{"status":"failed"}'::jsonb END INTO transcription
          FROM planeje_private.crm_ia_audio_inputs a JOIN public.cliente_whatsapp_inbox i ON i.id=a.inbox_id AND i.cliente_id=a.cliente_id AND i.whatsapp_config_id=a.channel_id
          WHERE i.id=(source->>'id')::uuid AND a.cliente_id=p_client_id AND a.channel_id=(p_payload->>'channel_id')::uuid AND a.contact_id=(p_payload->>'contact_id')::uuid
            AND a.status IN ('completed','failed') AND i.media_purged_at IS NULL AND NOT coalesce(i.is_group,false);
          IF transcription IS NOT NULL THEN source:=source||jsonb_build_object('transcription',transcription); END IF;
        END IF;
        rows:=rows||jsonb_build_array(source);
      END LOOP;
      RETURN jsonb_set(result,'{rows}',rows);
    END IF;
    RETURN result;
  END IF;
  -- Preserve the canonical account/module/role checks before reading or writing agent configuration.
  result:=public.crm_ia_workspace_pre_voice('workspace',p_client_id,'{}');
  client_key:=(result#>>'{client,id}')::uuid;
  IF nullif(p_payload->>'id','') IS NOT NULL THEN
    SELECT a.funil INTO current_funil FROM public.cliente_atend_ia_agentes a WHERE a.id=(p_payload->>'id')::uuid AND a.cliente_id=client_key FOR UPDATE;
  END IF;
  funil:=coalesce(p_payload->'funil',current_funil,'{}');
  audio:=private.crm_ia_voice_config(funil#>'{crm_ia,audio}');
  result:=public.crm_ia_workspace_pre_voice(p_action,p_client_id,p_payload||jsonb_build_object('funil',jsonb_set(funil,'{crm_ia,audio}','"nunca"')));
  UPDATE public.cliente_atend_ia_agentes a SET funil=jsonb_set(a.funil,'{crm_ia,audio}',audio),updated_at=clock_timestamp()
    WHERE a.id=(result->>'id')::uuid AND a.cliente_id=client_key RETURNING to_jsonb(a) INTO result;
  IF (audio->>'enabled')::boolean OR (audio->>'input_enabled')::boolean THEN
    INSERT INTO planeje_private.crm_ia_voice_authorizations(agent_id,actor_id,agent_updated_at,settings)
      VALUES((result->>'id')::uuid,auth.uid(),(result->>'updated_at')::timestamptz,audio)
      ON CONFLICT(agent_id) DO UPDATE SET actor_id=excluded.actor_id,agent_updated_at=excluded.agent_updated_at,settings=excluded.settings,created_at=clock_timestamp();
  ELSE DELETE FROM planeje_private.crm_ia_voice_authorizations WHERE agent_id=(result->>'id')::uuid; END IF;
  UPDATE public.crm_ia_config SET revision=gen_random_uuid(),updated_at=clock_timestamp(),updated_by=auth.uid()
    WHERE cliente_id=client_key RETURNING revision INTO revision_key;
  RETURN result||jsonb_build_object('config_revision',revision_key);
END $$;
REVOKE ALL ON FUNCTION public.crm_ia_workspace(text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_ia_workspace(text,uuid,jsonb) TO authenticated;

CREATE FUNCTION private.crm_ia_voice_settings(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT v.settings FROM public.crm_ia_outbox o
    JOIN planeje_private.crm_ia_agent_runs r ON r.id=o.agent_run_id AND r.cliente_id=o.cliente_id AND r.channel_id=o.whatsapp_config_id AND r.contact_id=o.contact_id AND r.status='queued'
    JOIN public.cliente_atend_ia_agentes a ON a.id=r.agent_id AND a.cliente_id=o.cliente_id AND a.ativo AND a.auto_responder
    JOIN planeje_private.crm_ia_voice_authorizations v ON v.agent_id=a.id AND v.agent_updated_at=a.updated_at AND v.settings=a.funil#>'{crm_ia,audio}'
    JOIN public.profiles p ON p.id=v.actor_id AND p.status='active' AND p.role IN ('admin','superadmin')
    WHERE o.id=p_id AND o.kind IN ('reply','followup','reminder') AND v.settings->>'enabled'='true'
      AND private.crm_ia_agent_actor(o.cliente_id,v.actor_id)
$$;
REVOKE ALL ON FUNCTION private.crm_ia_voice_settings(uuid) FROM PUBLIC,anon,authenticated;

ALTER FUNCTION public.crm_ia_delivery_recheck(uuid,uuid) RENAME TO crm_ia_delivery_recheck_pre_voice;
REVOKE ALL ON FUNCTION public.crm_ia_delivery_recheck_pre_voice(uuid,uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.crm_ia_delivery_recheck(p_id uuid,p_claim_token uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target jsonb; item public.crm_ia_outbox; voice planeje_private.crm_ia_voice_deliveries; audio jsonb; settings jsonb;
BEGIN
  target:=public.crm_ia_delivery_recheck_pre_voice(p_id,p_claim_token);
  IF target->>'allowed' IS DISTINCT FROM 'true' THEN RETURN target; END IF;
  SELECT * INTO item FROM public.crm_ia_outbox WHERE id=p_id;
  IF item.agent_run_id IS NULL THEN RETURN target; END IF;
  SELECT a.funil#>'{crm_ia,audio}' INTO audio FROM planeje_private.crm_ia_agent_runs r JOIN public.cliente_atend_ia_agentes a ON a.id=r.agent_id WHERE r.id=item.agent_run_id;
  SELECT * INTO voice FROM planeje_private.crm_ia_voice_deliveries WHERE outbox_id=p_id;
  IF audio->>'enabled'='true' THEN
    settings:=private.crm_ia_voice_settings(p_id);
    IF settings IS NULL OR (voice.outbox_id IS NOT NULL AND (voice.claim_token IS DISTINCT FROM p_claim_token OR voice.settings IS DISTINCT FROM settings)) THEN
      UPDATE public.crm_ia_outbox SET status='cancelled',error_code='voice_not_authorized' WHERE id=p_id AND status='sending' AND claim_token=p_claim_token;
      RETURN '{"allowed":false,"reason":"voice_not_authorized"}';
    END IF;
    RETURN target||jsonb_build_object('voice',settings,'voice_status',item.voice_status,'voice_error_code',item.voice_error_code,
      'voice_descriptor',CASE WHEN voice.status='ready' THEN voice.descriptor ELSE '{}'::jsonb END);
  END IF;
  IF voice.outbox_id IS NOT NULL THEN
    UPDATE public.crm_ia_outbox SET status='cancelled',error_code='voice_changed' WHERE id=p_id AND status='sending' AND claim_token=p_claim_token;
    RETURN '{"allowed":false,"reason":"voice_changed"}';
  END IF;
  RETURN target;
END $$;

CREATE FUNCTION public.crm_ia_voice_begin(p_id uuid,p_claim_token uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.crm_ia_outbox; target jsonb; settings jsonb; actor jsonb;
BEGIN
  SELECT * INTO item FROM public.crm_ia_outbox WHERE id=p_id AND status='sending' AND claim_token=p_claim_token FOR UPDATE;
  IF item.id IS NULL THEN RETURN '{"allowed":false,"reason":"lease_lost"}'; END IF;
  target:=public.crm_ia_delivery_recheck(p_id,p_claim_token);
  actor:=public.crm_ia_delivery_actor_check(p_id,'outbox');
  settings:=private.crm_ia_voice_settings(p_id);
  IF target->>'allowed' IS DISTINCT FROM 'true' OR settings IS NULL OR actor->>'allowed' IS DISTINCT FROM 'true' OR actor->>'human' IS DISTINCT FROM 'false' THEN
    UPDATE public.crm_ia_outbox SET status='cancelled',error_code='voice_not_authorized' WHERE id=p_id AND status='sending' AND claim_token=p_claim_token;
    RETURN '{"allowed":false,"reason":"voice_not_authorized"}';
  END IF;
  IF EXISTS(SELECT 1 FROM public.crm_ia_transport_claims WHERE kind='outbox' AND source_id=p_id AND claim_token=p_claim_token) THEN RETURN '{"allowed":false,"reason":"transport_started"}'; END IF;
  INSERT INTO planeje_private.crm_ia_voice_deliveries(outbox_id,claim_token,settings,status) VALUES(p_id,p_claim_token,settings,'generating') ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN '{"allowed":false,"reason":"voice_already_requested"}'; END IF;
  UPDATE public.crm_ia_outbox SET voice_status='generating',voice_error_code=NULL WHERE id=p_id;
  RETURN jsonb_build_object('allowed',true,'settings',settings);
END $$;

CREATE FUNCTION public.crm_ia_voice_complete(p_id uuid,p_claim_token uuid,p_descriptor jsonb DEFAULT NULL,p_error_code text DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.crm_ia_outbox; voice planeje_private.crm_ia_voice_deliveries; target jsonb; actor jsonb; next_status text;
BEGIN
  SELECT * INTO item FROM public.crm_ia_outbox WHERE id=p_id AND status='sending' AND claim_token=p_claim_token FOR UPDATE;
  IF item.id IS NULL THEN RETURN false; END IF;
  SELECT * INTO voice FROM planeje_private.crm_ia_voice_deliveries WHERE outbox_id=p_id AND claim_token=p_claim_token FOR UPDATE;
  IF voice.outbox_id IS NULL OR voice.status<>'generating' THEN RETURN false; END IF;
  target:=public.crm_ia_delivery_recheck(p_id,p_claim_token);actor:=public.crm_ia_delivery_actor_check(p_id,'outbox');
  IF target->>'allowed' IS DISTINCT FROM 'true' OR target->'voice' IS DISTINCT FROM voice.settings OR actor->>'allowed' IS DISTINCT FROM 'true' OR actor->>'human' IS DISTINCT FROM 'false'
    OR EXISTS(SELECT 1 FROM public.crm_ia_transport_claims WHERE kind='outbox' AND source_id=p_id AND claim_token=p_claim_token) THEN RETURN false; END IF;
  IF p_descriptor IS NOT NULL THEN
    IF jsonb_typeof(p_descriptor)<>'object' OR p_error_code IS NOT NULL OR (SELECT count(*) FROM jsonb_object_keys(p_descriptor))<>6
      OR p_descriptor->>'hash' !~ '^[0-9a-f]{64}$' OR p_descriptor->>'media_type' IS DISTINCT FROM 'ptt'
      OR p_descriptor->>'mimetype' IS DISTINCT FROM 'audio/ogg' OR p_descriptor->>'file_name' IS DISTINCT FROM 'resposta.ogg'
      OR p_descriptor->>'caption' IS DISTINCT FROM item.body OR jsonb_typeof(p_descriptor->'size') IS DISTINCT FROM 'number'
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_descriptor) k WHERE k NOT IN ('hash','size','media_type','mimetype','file_name','caption')) THEN
      RAISE EXCEPTION 'Descritor de voz inválido.' USING ERRCODE='22023'; END IF;
    IF (p_descriptor->>'size')::numeric NOT BETWEEN 1 AND 4194304 OR (p_descriptor->>'size')::numeric<>trunc((p_descriptor->>'size')::numeric) THEN RAISE EXCEPTION 'Áudio deve ter até 4 MB.' USING ERRCODE='22023'; END IF;
    next_status:='ready';
  ELSE
    IF p_error_code IS NULL OR p_error_code NOT IN ('voice_unavailable','voice_timeout','voice_file_too_large','voice_invalid_config','voice_input_too_long','voice_invalid_file','voice_generation_failed','voice_disabled') THEN RAISE EXCEPTION 'Motivo do fallback de voz inválido.' USING ERRCODE='22023'; END IF;
    next_status:='text_fallback';
  END IF;
  UPDATE planeje_private.crm_ia_voice_deliveries SET status=next_status,descriptor=coalesce(p_descriptor,'{}'),error_code=p_error_code,updated_at=clock_timestamp() WHERE outbox_id=p_id;
  UPDATE public.crm_ia_outbox SET voice_status=next_status,voice_error_code=p_error_code WHERE id=p_id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.crm_ia_delivery_recheck(uuid,uuid),public.crm_ia_voice_begin(uuid,uuid),public.crm_ia_voice_complete(uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_ia_delivery_recheck(uuid,uuid),public.crm_ia_voice_begin(uuid,uuid),public.crm_ia_voice_complete(uuid,uuid,jsonb,text) TO service_role;

-- Input transcription has its own opt-in and one cost reservation per actual inbox message.
CREATE TABLE planeje_private.crm_ia_audio_inputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inbox_id uuid NOT NULL UNIQUE REFERENCES public.cliente_whatsapp_inbox(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id),channel_id uuid NOT NULL REFERENCES public.cliente_whatsapp_config(id),
  contact_id uuid NOT NULL REFERENCES public.cliente_whatsapp_contact(id),agent_id uuid NOT NULL REFERENCES public.cliente_atend_ia_agentes(id),
  message_id text NOT NULL,claim_token uuid NOT NULL DEFAULT gen_random_uuid(),snapshot jsonb NOT NULL,
  status text NOT NULL DEFAULT 'claimed' CHECK(status IN ('claimed','completed','failed','cancelled')),
  transcript text CHECK(length(transcript)<=30000),error_code text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE planeje_private.crm_ia_audio_inputs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON planeje_private.crm_ia_audio_inputs FROM PUBLIC,anon,authenticated;
GRANT ALL ON planeje_private.crm_ia_audio_inputs TO service_role;

CREATE FUNCTION private.crm_ia_audio_target(p_client uuid,p_channel uuid,p_contact uuid,p_message text,p_agent uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.cliente_whatsapp_contact;s public.cliente_atend_conversas;i public.cliente_whatsapp_inbox;l public.leads;
  cfg public.crm_ia_config;a public.cliente_atend_ia_agentes;channel public.cliente_whatsapp_config;ids uuid[];target jsonb;entry jsonb;pipeline_key uuid;stage_key uuid;
BEGIN
  IF p_message IS NULL OR length(p_message) NOT BETWEEN 1 AND 300 THEN RETURN '{"allowed":false,"reason":"audio_message_required"}'; END IF;
  target:=planeje_private.crm_ia_delivery_target(p_client,p_channel,p_contact);
  IF target->>'allowed' IS DISTINCT FROM 'true' THEN RETURN '{"allowed":false,"reason":"audio_scope"}'; END IF;
  SELECT * INTO cfg FROM public.crm_ia_config WHERE cliente_id=p_client;
  SELECT * INTO c FROM public.cliente_whatsapp_contact WHERE id=p_contact AND cliente_id=p_client;
  SELECT * INTO channel FROM public.cliente_whatsapp_config WHERE id=p_channel AND cliente_id=p_client;
  SELECT * INTO s FROM public.cliente_atend_conversas WHERE cliente_id=p_client AND contact_id=p_contact;
  IF cfg.data#>>'{attendance,auto_send}' IS DISTINCT FROM 'true' OR NOT public.cliente_atend_loja_habilitada(p_client)
    OR NOT private.crm_ia_agent_actor(p_client,cfg.updated_by) OR NOT public.atendimento_user_can_send_on_whatsapp_config(cfg.updated_by,p_client,p_channel)
    OR NOT (coalesce((SELECT m.is_enabled FROM public.user_module_permissions m WHERE m.user_id=cfg.updated_by AND m.module_name::text='atendimento'),
        (SELECT m.is_enabled FROM public.module_settings m WHERE m.module_name::text='atendimento'),true)
      OR coalesce((SELECT m.is_enabled FROM public.user_module_permissions m WHERE m.user_id=cfg.updated_by AND m.module_name::text='rastreamento'),
        (SELECT m.is_enabled FROM public.module_settings m WHERE m.module_name::text='rastreamento'),true))
    OR coalesce(s.ia_pausada,false) OR s.status='finalizado'
    OR (s.privado AND s.assigned_to IS DISTINCT FROM cfg.updated_by AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=cfg.updated_by AND role='superadmin'))
    OR (EXISTS(SELECT 1 FROM public.profiles p JOIN public.user_module_access m ON m.user_id=p.id WHERE p.id=cfg.updated_by AND p.role='colaborador' AND m.module_name::text='crm' AND m.access_level::text='responsible') AND s.assigned_to IS DISTINCT FROM cfg.updated_by)
    OR planeje_private.crm_ia_delivery_config(p_client,target->>'phone',cfg.revision,true) IS NOT NULL THEN RETURN '{"allowed":false,"reason":"audio_disabled_or_human"}'; END IF;
  SELECT * INTO i FROM public.cliente_whatsapp_inbox WHERE cliente_id=p_client AND whatsapp_config_id=p_channel AND NOT coalesce(is_group,false)
    AND (from_jid=c.from_jid OR chat_jid=c.from_jid) ORDER BY created_at DESC,id DESC LIMIT 1;
  IF i.id IS NULL OR i.message_id IS DISTINCT FROM p_message OR i.media_purged_at IS NOT NULL OR lower(coalesce(i.type,'')) NOT IN ('audio','ptt','myaudio','voice','voicemessage','voice_message','audiomessage')
    OR jsonb_path_exists(coalesce(i.raw_payload,'{}'),'$.**.fromMe ? (@ == true || @ == "true" || @ == 1)')
    OR jsonb_path_exists(coalesce(i.raw_payload,'{}'),'$.**.from_me ? (@ == true || @ == "true" || @ == 1)') THEN RETURN '{"allowed":false,"reason":"audio_message_changed"}'; END IF;
  SELECT array_agg(id) INTO ids FROM public.leads WHERE cliente_id=p_client AND crm_ia_archived_at IS NULL
    AND (crm_ia_contact_id=p_contact OR (private.crm_ia_phone(whatsapp)<>'' AND private.crm_ia_phone(whatsapp)=private.crm_ia_phone(coalesce(c.phone,c.from_jid))));
  IF coalesce(cardinality(ids),0)>1 THEN RETURN '{"allowed":false,"reason":"ambiguous_lead"}'; END IF;
  SELECT * INTO l FROM public.leads WHERE id=ids[1];
  pipeline_key:=l.pipeline_id;stage_key:=l.stage_id;
  IF l.id IS NULL THEN
    SELECT value INTO entry FROM jsonb_array_elements(coalesce(cfg.data#>'{entry,channels}','[]')) x WHERE x->>'channel_id'=p_channel::text AND x->>'enabled'='true';
    IF cfg.data#>>'{entry,enabled}' IS DISTINCT FROM 'true' OR entry IS NULL OR entry->>'mode' NOT IN ('all','phrase')
      OR (entry->>'mode'='phrase' AND nullif(btrim(entry->>'phrase'),'') IS NULL) THEN RETURN '{"allowed":false,"reason":"entry_disabled"}'; END IF;
    pipeline_key:=(entry->>'pipeline_id')::uuid;stage_key:=(entry->>'stage_id')::uuid;
    IF NOT EXISTS(SELECT 1 FROM public.crm_stages st JOIN public.crm_pipelines p ON p.id=st.pipeline_id WHERE st.id=stage_key AND p.id=pipeline_key AND p.cliente_id=p_client) THEN RETURN '{"allowed":false,"reason":"entry_scope"}'; END IF;
  END IF;
  SELECT ag.* INTO a FROM public.cliente_atend_ia_agentes ag WHERE ag.cliente_id=p_client AND ag.ativo AND ag.auto_responder AND (p_agent IS NULL OR ag.id=p_agent)
      AND ag.funil#>>'{crm_ia,pipeline_id}'=pipeline_key::text AND coalesce(ag.funil#>'{crm_ia,stage_ids}','[]') ? stage_key::text
      AND ag.funil#>>'{crm_ia,tipo}' IN ('qualificacao','agendamento')
      AND private.crm_ia_agent_window(ag.funil->'crm_ia',coalesce(cfg.data#>>'{availability,timezone}','America/Sao_Paulo'))
    ORDER BY CASE WHEN ag.id::text=s.crm_ia_runtime->>'next_agent_id' THEN 0 WHEN ag.id::text=s.crm_ia_runtime->>'agent_id' THEN 1 WHEN ag.funil#>>'{crm_ia,tipo}'='qualificacao' THEN 2 ELSE 3 END,ag.created_at,ag.id LIMIT 1;
  IF a.id IS NULL OR NOT EXISTS(SELECT 1 FROM planeje_private.crm_ia_voice_authorizations v JOIN public.profiles p ON p.id=v.actor_id AND p.status='active' AND p.role IN ('admin','superadmin')
    WHERE v.agent_id=a.id AND v.agent_updated_at=a.updated_at AND v.settings=a.funil#>'{crm_ia,audio}' AND v.settings->>'input_enabled'='true' AND private.crm_ia_agent_actor(p_client,v.actor_id))
    THEN RETURN '{"allowed":false,"reason":"audio_input_disabled"}'; END IF;
  RETURN jsonb_build_object('allowed',true,'inbox_id',i.id,'agent_id',a.id,'actor_id',cfg.updated_by,'config_revision',cfg.revision,
    'agent_updated_at',a.updated_at,'conversation_updated_at',s.updated_at,'lead_id',l.id,'lead_updated_at',l.updated_at,
    'contact_updated_at',c.updated_at,'channel_updated_at',to_jsonb(channel)->'updated_at');
END $$;
REVOKE ALL ON FUNCTION private.crm_ia_audio_target(uuid,uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.crm_ia_audio_begin(p_client uuid,p_channel uuid,p_contact uuid,p_message text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target jsonb;job planeje_private.crm_ia_audio_inputs;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('crm-ia-audio:'||p_client::text||':'||p_channel::text||':'||coalesce(p_message,''),0));
  target:=private.crm_ia_audio_target(p_client,p_channel,p_contact,p_message);
  IF target->>'allowed' IS DISTINCT FROM 'true' THEN RETURN target; END IF;
  SELECT * INTO job FROM planeje_private.crm_ia_audio_inputs WHERE inbox_id=(target->>'inbox_id')::uuid FOR UPDATE;
  IF job.id IS NOT NULL THEN
    IF job.cliente_id<>p_client OR job.channel_id<>p_channel OR job.contact_id<>p_contact OR job.agent_id::text<>target->>'agent_id'
      OR job.snapshot->>'config_revision' IS DISTINCT FROM target->>'config_revision' OR job.snapshot->>'agent_updated_at' IS DISTINCT FROM target->>'agent_updated_at' THEN RETURN '{"allowed":false,"reason":"audio_context_changed"}'; END IF;
    IF job.status='claimed' AND job.created_at<clock_timestamp()-interval '5 minutes' THEN
      UPDATE planeje_private.crm_ia_audio_inputs SET status='failed',error_code='audio_lease_expired',updated_at=clock_timestamp() WHERE id=job.id RETURNING * INTO job;
    END IF;
    IF job.status IN ('completed','failed') THEN RETURN jsonb_build_object('allowed',true,'cached',true,'status',job.status,'transcript',job.transcript,'error_code',job.error_code); END IF;
    RETURN '{"allowed":false,"reason":"audio_already_processing"}';
  END IF;
  INSERT INTO planeje_private.crm_ia_audio_inputs(inbox_id,cliente_id,channel_id,contact_id,agent_id,message_id,snapshot)
    VALUES((target->>'inbox_id')::uuid,p_client,p_channel,p_contact,(target->>'agent_id')::uuid,p_message,target) RETURNING * INTO job;
  RETURN jsonb_build_object('allowed',true,'id',job.id,'claim_token',job.claim_token);
END $$;
CREATE FUNCTION public.crm_ia_audio_recheck(p_id uuid,p_claim_token uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job planeje_private.crm_ia_audio_inputs;target jsonb;config jsonb;inbox jsonb;
BEGIN
  SELECT * INTO job FROM planeje_private.crm_ia_audio_inputs WHERE id=p_id AND claim_token=p_claim_token AND status='claimed' FOR UPDATE;
  IF job.id IS NULL OR job.created_at<clock_timestamp()-interval '5 minutes' THEN RETURN '{"allowed":false,"reason":"audio_lease_lost"}'; END IF;
  target:=private.crm_ia_audio_target(job.cliente_id,job.channel_id,job.contact_id,job.message_id,job.agent_id);
  IF target IS DISTINCT FROM job.snapshot THEN
    UPDATE planeje_private.crm_ia_audio_inputs SET status='cancelled',error_code='audio_context_changed',updated_at=clock_timestamp() WHERE id=p_id;
    RETURN '{"allowed":false,"reason":"audio_context_changed"}';
  END IF;
  SELECT jsonb_build_object('subdomain',c.subdomain,'token',c.token) INTO config FROM public.cliente_whatsapp_config c WHERE c.id=job.channel_id AND c.cliente_id=job.cliente_id;
  SELECT jsonb_build_object('message_id',i.message_id,'raw_payload',i.raw_payload) INTO inbox FROM public.cliente_whatsapp_inbox i WHERE i.id=job.inbox_id;
  RETURN jsonb_build_object('allowed',true,'config',config,'inbox',inbox);
END $$;
CREATE FUNCTION public.crm_ia_audio_complete(p_id uuid,p_claim_token uuid,p_transcript text DEFAULT NULL,p_error_code text DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target jsonb;
BEGIN
  target:=public.crm_ia_audio_recheck(p_id,p_claim_token);
  IF target->>'allowed' IS DISTINCT FROM 'true' THEN RETURN false; END IF;
  IF p_transcript IS NOT NULL THEN
    IF length(btrim(p_transcript)) NOT BETWEEN 1 AND 30000 OR p_error_code IS NOT NULL THEN RAISE EXCEPTION 'Transcrição inválida.' USING ERRCODE='22023'; END IF;
  ELSIF p_error_code IS NULL OR p_error_code NOT IN ('audio_unavailable','audio_timeout','audio_file_too_large') THEN RAISE EXCEPTION 'Falha de transcrição inválida.' USING ERRCODE='22023'; END IF;
  UPDATE planeje_private.crm_ia_audio_inputs SET status=CASE WHEN p_transcript IS NULL THEN 'failed' ELSE 'completed' END,
    transcript=btrim(p_transcript),error_code=p_error_code,updated_at=clock_timestamp() WHERE id=p_id AND claim_token=p_claim_token AND status='claimed';
  RETURN FOUND;
END $$;
CREATE FUNCTION public.crm_ia_audio_context(p_client uuid,p_channel uuid,p_contact uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('inbox_id',i.id,'transcript',a.transcript)),'[]'::jsonb)
    FROM planeje_private.crm_ia_audio_inputs a JOIN public.cliente_whatsapp_inbox i ON i.id=a.inbox_id AND i.cliente_id=a.cliente_id AND i.whatsapp_config_id=a.channel_id
    JOIN public.cliente_whatsapp_contact c ON c.id=a.contact_id AND c.cliente_id=a.cliente_id AND (i.from_jid=c.from_jid OR i.chat_jid=c.from_jid)
    WHERE a.cliente_id=p_client AND a.channel_id=p_channel AND a.contact_id=p_contact AND a.status='completed' AND i.media_purged_at IS NULL AND NOT coalesce(i.is_group,false)
$$;
REVOKE ALL ON FUNCTION public.crm_ia_audio_begin(uuid,uuid,uuid,text),public.crm_ia_audio_recheck(uuid,uuid),public.crm_ia_audio_complete(uuid,uuid,text,text),public.crm_ia_audio_context(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_ia_audio_begin(uuid,uuid,uuid,text),public.crm_ia_audio_recheck(uuid,uuid),public.crm_ia_audio_complete(uuid,uuid,text,text),public.crm_ia_audio_context(uuid,uuid,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
