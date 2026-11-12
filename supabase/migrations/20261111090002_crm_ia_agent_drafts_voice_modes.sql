BEGIN;
ALTER TABLE public.cliente_atend_ia_agentes DROP CONSTRAINT IF EXISTS cliente_atend_ia_agentes_tom_check;
ALTER TABLE public.cliente_atend_ia_agentes ADD CONSTRAINT cliente_atend_ia_agentes_tom_check CHECK(tom IN('cordial','formal','descontraido','direto','entusiasmado'));
CREATE TABLE planeje_private.crm_ia_agent_drafts(
 cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,editor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 draft_key text NOT NULL CHECK(length(draft_key) BETWEEN 1 AND 160),agent_id uuid,payload jsonb NOT NULL DEFAULT '{}',has_payload boolean NOT NULL DEFAULT false,
 revision uuid NOT NULL DEFAULT gen_random_uuid(),source_updated_at timestamptz,status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','published','discarded')),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(cliente_id,editor_id,draft_key),
 CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=50000)
);
ALTER TABLE planeje_private.crm_ia_agent_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON planeje_private.crm_ia_agent_drafts FROM PUBLIC,anon,authenticated;
GRANT ALL ON planeje_private.crm_ia_agent_drafts TO service_role;

CREATE OR REPLACE FUNCTION private.crm_ia_voice_config(p_audio jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF p_audio IS NULL OR p_audio='"nunca"'::jsonb THEN RETURN '{"enabled":false,"input_enabled":false,"voice":"alloy","speed":1}';END IF;
 IF jsonb_typeof(p_audio)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_audio) k WHERE k NOT IN('enabled','input_enabled','voice','speed','mode')) THEN RAISE EXCEPTION 'Configuração de voz inválida.' USING ERRCODE='22023';END IF;
 result:='{"enabled":false,"input_enabled":false,"voice":"alloy","speed":1}'::jsonb||p_audio;
 IF jsonb_typeof(result->'enabled')<>'boolean' OR jsonb_typeof(result->'input_enabled')<>'boolean' OR jsonb_typeof(result->'voice')<>'string'
  OR result->>'voice' NOT IN('alloy','ash','ballad','coral','echo','fable','nova','onyx','sage','shimmer','verse','marin','cedar')
  OR jsonb_typeof(result->'speed')<>'number' OR (result->>'speed')::numeric NOT BETWEEN 0.25 AND 4
  OR (result ? 'mode' AND (jsonb_typeof(result->'mode')<>'string' OR result->>'mode' NOT IN('never','always','mirror'))) THEN RAISE EXCEPTION 'Configuração de voz inválida.' USING ERRCODE='22023';END IF;
 IF result->>'mode'='never' THEN result:=result||'{"enabled":false}'::jsonb;END IF;
 RETURN result;
END$$;

CREATE FUNCTION private.crm_ia_voice_source(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.crm_ia_outbox o
  JOIN planeje_private.crm_ia_agent_runs r ON r.id=o.agent_run_id AND r.cliente_id=o.cliente_id AND r.channel_id=o.whatsapp_config_id AND r.contact_id=o.contact_id AND r.status='queued'
  JOIN public.cliente_whatsapp_contact c ON c.id=o.contact_id AND c.cliente_id=o.cliente_id
  JOIN public.cliente_whatsapp_inbox i ON i.id::text=r.snapshot->>'source_inbox_id' AND i.cliente_id=o.cliente_id AND i.whatsapp_config_id=o.whatsapp_config_id
   AND i.message_id=r.snapshot->>'source_message_id' AND coalesce(nullif(i.chat_jid,''),i.from_jid)=c.from_jid
   AND i.type=r.snapshot->>'source_message_type' AND lower(i.type) IN('audio','ptt','myaudio','voice','voicenote','voicemessage','voice_message','audiomessage')
   AND NOT coalesce(i.is_group,false) AND i.media_purged_at IS NULL
   AND NOT jsonb_path_exists(coalesce(i.raw_payload,'{}'),'$.**.fromMe ? (@ == true || @ == "true" || @ == 1)')
   AND NOT jsonb_path_exists(coalesce(i.raw_payload,'{}'),'$.**.from_me ? (@ == true || @ == "true" || @ == 1)')
  WHERE o.id=p_id AND (r.mode='followup' OR r.message_id=i.message_id)
   AND i.id=(SELECT newest.id FROM public.cliente_whatsapp_inbox newest WHERE newest.cliente_id=o.cliente_id AND newest.whatsapp_config_id=o.whatsapp_config_id
    AND coalesce(nullif(newest.chat_jid,''),newest.from_jid)=c.from_jid AND NOT coalesce(newest.is_group,false) ORDER BY newest.created_at DESC,newest.id DESC LIMIT 1)
   AND (r.mode<>'followup' OR EXISTS(SELECT 1 FROM public.cliente_atend_conversas s WHERE s.cliente_id=o.cliente_id AND s.contact_id=o.contact_id
    AND s.crm_ia_runtime->>'source_inbox_id'=r.snapshot->>'source_inbox_id' AND s.crm_ia_runtime->>'source_message_id'=r.snapshot->>'source_message_id'
    AND s.crm_ia_runtime->>'source_message_type'=r.snapshot->>'source_message_type')))
$$;
CREATE OR REPLACE FUNCTION private.crm_ia_voice_settings(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT v.settings FROM public.crm_ia_outbox o
  JOIN planeje_private.crm_ia_agent_runs r ON r.id=o.agent_run_id AND r.cliente_id=o.cliente_id AND r.channel_id=o.whatsapp_config_id AND r.contact_id=o.contact_id AND r.status='queued'
  JOIN public.cliente_atend_ia_agentes a ON a.id=r.agent_id AND a.cliente_id=o.cliente_id AND a.ativo AND a.auto_responder
  JOIN planeje_private.crm_ia_voice_authorizations v ON v.agent_id=a.id AND v.agent_updated_at=a.updated_at AND v.settings=a.funil#>'{crm_ia,audio}'
  JOIN public.profiles p ON p.id=v.actor_id AND p.status='active' AND p.role IN('admin','superadmin')
  WHERE o.id=p_id AND o.kind IN('reply','followup','reminder') AND v.settings->>'enabled'='true'
   AND coalesce(v.settings->>'mode','always') IN('always','mirror')
   AND (coalesce(v.settings->>'mode','always')<>'mirror' OR private.crm_ia_voice_source(o.id))
   AND private.crm_ia_agent_actor(o.cliente_id,v.actor_id)
$$;
-- Keep the existing Calendar/appointments wrapper chain and replace only its voice layer by OID.
CREATE OR REPLACE FUNCTION public.crm_ia_delivery_recheck_pre_calendar(p_id uuid,p_claim_token uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target jsonb;item public.crm_ia_outbox;voice planeje_private.crm_ia_voice_deliveries;audio jsonb;settings jsonb;wants_voice boolean;
BEGIN
 target:=public.crm_ia_delivery_recheck_pre_voice(p_id,p_claim_token);
 IF target->>'allowed' IS DISTINCT FROM 'true' THEN RETURN target;END IF;
 SELECT * INTO item FROM public.crm_ia_outbox WHERE id=p_id;
 IF item.agent_run_id IS NULL THEN RETURN target;END IF;
 SELECT a.funil#>'{crm_ia,audio}' INTO audio FROM planeje_private.crm_ia_agent_runs r JOIN public.cliente_atend_ia_agentes a ON a.id=r.agent_id WHERE r.id=item.agent_run_id;
 SELECT * INTO voice FROM planeje_private.crm_ia_voice_deliveries WHERE outbox_id=p_id;
 wants_voice:=audio->>'enabled'='true' AND coalesce(audio->>'mode','always')<>'never'
  AND (coalesce(audio->>'mode','always')<>'mirror' OR private.crm_ia_voice_source(p_id));
 IF coalesce(wants_voice,false) THEN
  settings:=private.crm_ia_voice_settings(p_id);
  IF settings IS NULL OR (voice.outbox_id IS NOT NULL AND (voice.claim_token IS DISTINCT FROM p_claim_token OR voice.settings IS DISTINCT FROM settings)) THEN
   UPDATE public.crm_ia_outbox SET status='cancelled',error_code='voice_not_authorized' WHERE id=p_id AND status='sending' AND claim_token=p_claim_token;
   RETURN '{"allowed":false,"reason":"voice_not_authorized"}';
  END IF;
  RETURN target||jsonb_build_object('voice',settings,'voice_status',item.voice_status,'voice_error_code',item.voice_error_code,'voice_descriptor',CASE WHEN voice.status='ready' THEN voice.descriptor ELSE '{}'::jsonb END);
 END IF;
 IF voice.outbox_id IS NOT NULL THEN
  UPDATE public.crm_ia_outbox SET status='cancelled',error_code='voice_changed' WHERE id=p_id AND status='sending' AND claim_token=p_claim_token;
  RETURN '{"allowed":false,"reason":"voice_changed"}';
 END IF;
 RETURN target;
END$$;
REVOKE ALL ON FUNCTION private.crm_ia_voice_config(jsonb),private.crm_ia_voice_source(uuid),private.crm_ia_voice_settings(uuid),public.crm_ia_delivery_recheck_pre_calendar(uuid,uuid) FROM PUBLIC,anon,authenticated;

ALTER FUNCTION public.crm_ia_workspace(text,uuid,jsonb) RENAME TO crm_ia_workspace_pre_agent_drafts;
REVOKE ALL ON FUNCTION public.crm_ia_workspace_pre_agent_drafts(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.crm_ia_workspace(p_action text,p_client_id uuid DEFAULT NULL,p_payload jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE editor uuid:=auth.uid();role text;agent_key uuid;pipeline_key uuid;kind text;slot text;d planeje_private.crm_ia_agent_drafts;published jsonb;
 result jsonb;requested_tone text;current_stamp timestamptz;next_payload jsonb;conflict boolean;
BEGIN
 IF p_action IS NULL THEN RAISE EXCEPTION 'Ação do CRM IA inválida.' USING ERRCODE='22023';END IF;
 IF p_action NOT IN('agent_draft','save_agent_draft','publish_agent_draft','discard_agent_draft') THEN
  IF p_action='save_agent' THEN
   requested_tone:=p_payload->>'tom';
   IF requested_tone IS NULL AND nullif(p_payload->>'id','') IS NOT NULL AND private.crm_ia_client(p_client_id) THEN
    SELECT a.tom INTO requested_tone FROM public.cliente_atend_ia_agentes a WHERE a.id=(p_payload->>'id')::uuid AND a.cliente_id=p_client_id;
   END IF;
  END IF;
  IF requested_tone IN('direto','entusiasmado') THEN
   result:=public.crm_ia_workspace_pre_agent_drafts(p_action,p_client_id,p_payload||'{"tom":"cordial"}'::jsonb);
   UPDATE public.cliente_atend_ia_agentes SET tom=requested_tone,updated_at=clock_timestamp() WHERE id=(result->>'id')::uuid AND cliente_id=p_client_id RETURNING to_jsonb(cliente_atend_ia_agentes) INTO published;
   UPDATE planeje_private.crm_ia_voice_authorizations v SET agent_updated_at=(published->>'updated_at')::timestamptz
    WHERE v.agent_id=(result->>'id')::uuid AND v.actor_id=editor AND v.agent_updated_at=(result->>'updated_at')::timestamptz AND v.settings=published#>'{funil,crm_ia,audio}';
   RETURN published||jsonb_build_object('config_revision',result->'config_revision');
  END IF;
  RETURN public.crm_ia_workspace_pre_agent_drafts(p_action,p_client_id,p_payload);
 END IF;
 role:=private.crm_ia_role();
 IF editor IS NULL OR role NOT IN('admin','superadmin') OR NOT coalesce(private.crm_ia_client(p_client_id),false) THEN RAISE EXCEPTION 'Somente a gestão configura o CRM IA.' USING ERRCODE='42501';END IF;
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>60000 THEN RAISE EXCEPTION 'Rascunho inválido.' USING ERRCODE='22023';END IF;
 agent_key:=nullif(p_payload->>'agent_id','')::uuid;
 IF agent_key IS NOT NULL THEN
  SELECT to_jsonb(a),a.updated_at INTO published,current_stamp FROM public.cliente_atend_ia_agentes a WHERE a.id=agent_key AND a.cliente_id=p_client_id;
  IF published IS NULL THEN RAISE EXCEPTION 'Agente indisponível para esta conta.' USING ERRCODE='42501';END IF;
  slot:='agent:'||agent_key::text;
 ELSE
  pipeline_key:=nullif(p_payload->>'pipeline_id','')::uuid;kind:=p_payload->>'tipo';
  IF kind IS NULL OR kind NOT IN('qualificacao','followup','agendamento') OR NOT EXISTS(SELECT 1 FROM public.crm_pipelines p WHERE p.id=pipeline_key AND p.cliente_id=p_client_id) THEN RAISE EXCEPTION 'Funil ou tipo do rascunho indisponível.' USING ERRCODE='42501';END IF;
  slot:='new:'||kind||':'||pipeline_key::text;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('crm-ia-agent-draft:'||p_client_id::text||':'||editor::text||':'||slot,0));
 SELECT * INTO d FROM planeje_private.crm_ia_agent_drafts x WHERE x.cliente_id=p_client_id AND x.editor_id=editor AND x.draft_key=slot FOR UPDATE;
 IF p_action='agent_draft' THEN
  IF d.draft_key IS NULL THEN
   INSERT INTO planeje_private.crm_ia_agent_drafts(cliente_id,editor_id,draft_key,agent_id,source_updated_at) VALUES(p_client_id,editor,slot,agent_key,current_stamp) RETURNING * INTO d;
  ELSIF d.status<>'draft' THEN
   UPDATE planeje_private.crm_ia_agent_drafts SET status='draft',payload='{}',has_payload=false,revision=gen_random_uuid(),source_updated_at=current_stamp,updated_at=clock_timestamp()
    WHERE cliente_id=p_client_id AND editor_id=editor AND draft_key=slot RETURNING * INTO d;
  END IF;
 ELSE
  IF d.draft_key IS NULL OR d.status<>'draft' OR nullif(p_payload->>'revision','')::uuid IS DISTINCT FROM d.revision THEN RAISE EXCEPTION 'O rascunho foi alterado. Reabra a versão atual antes de continuar.' USING ERRCODE='40001';END IF;
  IF p_action='save_agent_draft' THEN
   next_payload:=p_payload->'data';
   IF jsonb_typeof(next_payload) IS DISTINCT FROM 'object' OR octet_length(next_payload::text)>50000 OR EXISTS(SELECT 1 FROM jsonb_object_keys(next_payload) k WHERE k NOT IN('nome','objetivo','instrucoes','tom','modelo','base_ids','setor_ids','ativo','auto_responder','funil')) THEN RAISE EXCEPTION 'Conteúdo do rascunho inválido.' USING ERRCODE='22023';END IF;
   UPDATE planeje_private.crm_ia_agent_drafts SET payload=next_payload,has_payload=true,revision=gen_random_uuid(),updated_at=clock_timestamp() WHERE cliente_id=p_client_id AND editor_id=editor AND draft_key=slot RETURNING * INTO d;
  ELSIF p_action='discard_agent_draft' THEN
   UPDATE planeje_private.crm_ia_agent_drafts SET payload='{}',has_payload=false,status='discarded',revision=gen_random_uuid(),updated_at=clock_timestamp() WHERE cliente_id=p_client_id AND editor_id=editor AND draft_key=slot RETURNING * INTO d;
   RETURN jsonb_build_object('discarded',true,'revision',d.revision,'published',published);
  ELSIF p_action='publish_agent_draft' THEN
   PERFORM pg_advisory_xact_lock(hashtextextended('crm-ia:'||p_client_id::text,0));
   IF NOT d.has_payload THEN RAISE EXCEPTION 'Preencha o rascunho antes de publicar.' USING ERRCODE='22023';END IF;
   IF agent_key IS NOT NULL THEN
    SELECT a.updated_at INTO current_stamp FROM public.cliente_atend_ia_agentes a WHERE a.id=agent_key AND a.cliente_id=p_client_id FOR UPDATE;
    IF current_stamp IS DISTINCT FROM d.source_updated_at THEN RAISE EXCEPTION 'A versão publicada foi alterada. Seu rascunho foi preservado para revisão.' USING ERRCODE='40001';END IF;
   ELSIF EXISTS(SELECT 1 FROM public.cliente_atend_ia_agentes a WHERE a.cliente_id=p_client_id AND a.funil#>>'{crm_ia,tipo}'=kind AND a.funil#>>'{crm_ia,pipeline_id}'=pipeline_key::text)
    OR d.payload#>>'{funil,crm_ia,tipo}' IS DISTINCT FROM kind OR d.payload#>>'{funil,crm_ia,pipeline_id}' IS DISTINCT FROM pipeline_key::text THEN RAISE EXCEPTION 'Já existe agente publicado ou o contexto do rascunho foi alterado. Seu rascunho foi preservado.' USING ERRCODE='40001';END IF;
   next_payload:=d.payload||CASE WHEN agent_key IS NOT NULL THEN jsonb_build_object('id',agent_key,'expected_updated_at',d.source_updated_at) ELSE '{}'::jsonb END;
   result:=public.crm_ia_workspace('save_agent',p_client_id,next_payload);
   UPDATE planeje_private.crm_ia_agent_drafts SET payload='{}',has_payload=false,status='published',revision=gen_random_uuid(),updated_at=clock_timestamp() WHERE cliente_id=p_client_id AND editor_id=editor AND draft_key=slot RETURNING * INTO d;
   RETURN jsonb_build_object('published',true,'agent',result,'revision',d.revision);
  ELSE RAISE EXCEPTION 'Ação de rascunho inválida.' USING ERRCODE='22023';
  END IF;
 END IF;
 conflict:=CASE WHEN agent_key IS NOT NULL THEN d.source_updated_at IS DISTINCT FROM current_stamp ELSE EXISTS(SELECT 1 FROM public.cliente_atend_ia_agentes a WHERE a.cliente_id=p_client_id AND a.funil#>>'{crm_ia,tipo}'=kind AND a.funil#>>'{crm_ia,pipeline_id}'=pipeline_key::text) END;
 RETURN jsonb_build_object('draft',CASE WHEN d.has_payload THEN jsonb_build_object('payload',d.payload,'revision',d.revision,'source_updated_at',d.source_updated_at,'updated_at',d.updated_at) END,
  'revision',d.revision,'source_updated_at',d.source_updated_at,'published',published,'source_conflict',conflict);
END$$;
REVOKE ALL ON FUNCTION public.crm_ia_workspace(text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_ia_workspace(text,uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
