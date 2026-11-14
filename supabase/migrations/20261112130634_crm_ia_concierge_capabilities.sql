BEGIN;

CREATE FUNCTION private.crm_ia_concierge_config_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE settings jsonb:=NEW.data->'concierge';key text;
BEGIN
 IF TG_OP='UPDATE' AND settings IS NOT DISTINCT FROM OLD.data->'concierge' THEN RETURN NEW; END IF;
 IF settings IS NULL THEN RETURN NEW; END IF;
 IF jsonb_typeof(settings) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Concierge deve ser um objeto.' USING ERRCODE='22023'; END IF;
 FOREACH key IN ARRAY ARRAY['enabled','faq_enabled','handoff_enabled','appointment_confirm','appointment_reschedule','appointment_cancel','no_show_recovery'] LOOP
  IF settings ? key AND jsonb_typeof(settings->key) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Concierge: % deve ser boolean.',key USING ERRCODE='22023'; END IF;
 END LOOP;
 IF settings ? 'mode' AND (jsonb_typeof(settings->'mode') IS DISTINCT FROM 'string' OR settings->>'mode' NOT IN ('always','outside_hours')) THEN
  RAISE EXCEPTION 'Concierge: modo inválido.' USING ERRCODE='22023'; END IF;
 IF settings ? 'human_wait_minutes' AND (jsonb_typeof(settings->'human_wait_minutes') IS DISTINCT FROM 'number'
  OR settings->>'human_wait_minutes' !~ '^[0-9]+$' OR (settings->>'human_wait_minutes')::numeric>10080) THEN
  RAISE EXCEPTION 'Concierge: espera inválida.' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.crm_ia_concierge_config_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER crm_ia_concierge_config_guard BEFORE INSERT OR UPDATE OF data ON public.crm_ia_config
 FOR EACH ROW EXECUTE FUNCTION private.crm_ia_concierge_config_guard();

CREATE FUNCTION private.crm_ia_concierge_available(p_data jsonb,p_owner uuid,p_runtime jsonb,p_now timestamptz) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE settings jsonb:=p_data->'concierge';availability jsonb:=p_data->'availability';windows jsonb;exceptions jsonb;item jsonb;exception jsonb;
 owner_key text;zone text;local_time timestamp;day integer;date_key text;time_key text;mode text;wait_minutes numeric;known boolean:=false;
BEGIN
 IF settings->'enabled' IS DISTINCT FROM 'true'::jsonb OR p_now IS NULL OR NOT isfinite(p_now) THEN RETURN false; END IF;
 mode:=CASE WHEN settings ? 'mode' THEN settings->>'mode' ELSE 'outside_hours' END;
 IF mode IS NULL OR mode NOT IN ('always','outside_hours') THEN RETURN false; END IF;
 IF settings ? 'human_wait_minutes' THEN
  IF jsonb_typeof(settings->'human_wait_minutes') IS DISTINCT FROM 'number' OR settings->>'human_wait_minutes' !~ '^[0-9]+$' THEN RETURN false; END IF;
  wait_minutes:=(settings->>'human_wait_minutes')::numeric;
 ELSE wait_minutes:=10; END IF;
 IF wait_minutes>10080 THEN RETURN false; END IF;
 IF p_runtime->'last_human_at' IS NOT NULL AND p_runtime->'last_human_at'<>'null'::jsonb AND p_runtime->>'last_human_at'<>'' THEN
  IF jsonb_typeof(p_runtime->'last_human_at') IS DISTINCT FROM 'string' OR NOT isfinite((p_runtime->>'last_human_at')::timestamptz)
   OR p_now-(p_runtime->>'last_human_at')::timestamptz<wait_minutes*interval '1 minute' THEN RETURN false; END IF;
 END IF;
 zone:=coalesce(availability->>'timezone','America/Sao_Paulo');
 IF jsonb_typeof(availability->'timezone') NOT IN ('string','null') OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=zone) THEN RETURN false; END IF;
 local_time:=p_now AT TIME ZONE zone;
 IF mode='always' THEN RETURN true; END IF;
 windows:=coalesce(availability->'windows','[]');exceptions:=coalesce(availability->'exceptions','[]');
 IF jsonb_typeof(windows) IS DISTINCT FROM 'array' OR jsonb_typeof(exceptions) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 day:=extract(dow FROM local_time)::integer;date_key:=to_char(local_time,'YYYY-MM-DD');time_key:=to_char(local_time,'HH24:MI');
 FOR owner_key IN SELECT p_owner::text WHERE p_owner IS NOT NULL UNION
  SELECT w->>'owner_id' FROM jsonb_array_elements(windows||coalesce((SELECT jsonb_agg(e) FROM jsonb_array_elements(exceptions) e WHERE e->>'date'=date_key),'[]')) w
   WHERE p_owner IS NULL AND nullif(w->>'owner_id','') IS NOT NULL LOOP
  SELECT e INTO exception FROM jsonb_array_elements(exceptions) e WHERE e->>'owner_id'=owner_key AND e->>'date'=date_key LIMIT 1;
  IF exception IS NOT NULL THEN
   known:=true;
   IF exception->'blocked'='true'::jsonb THEN CONTINUE; END IF;
   IF coalesce(exception->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR coalesce(exception->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    OR exception->>'start'>=exception->>'end' THEN RETURN false; END IF;
   IF exception->>'start'<=time_key AND time_key<exception->>'end' THEN RETURN false; END IF;
  ELSE
   FOR item IN SELECT w FROM jsonb_array_elements(windows) w WHERE w->>'owner_id'=owner_key LOOP
    known:=true;
    IF coalesce(item->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR coalesce(item->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     OR item->>'start'>=item->>'end' OR jsonb_typeof(item->'days') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
    IF jsonb_array_length(item->'days')=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(item->'days') d WHERE jsonb_typeof(d)<>'number' OR d::text !~ '^[0-6]$') THEN RETURN false; END IF;
    IF item->'days' @> jsonb_build_array(day) AND item->>'start'<=time_key AND time_key<item->>'end' THEN RETURN false; END IF;
   END LOOP;
  END IF;
 END LOOP;
 RETURN known;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION private.crm_ia_concierge_available(jsonb,uuid,jsonb,timestamptz) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.crm_ia_agent_window_at(p_rules jsonb,p_zone text,p_now timestamptz) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path='' AS $$
BEGIN
 RETURN coalesce(jsonb_array_length(p_rules->'janelas'),0)=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_rules->'janelas') w
  WHERE w->'dias' @> jsonb_build_array(extract(dow FROM p_now AT TIME ZONE p_zone)::integer)
   AND (p_now AT TIME ZONE p_zone)::time>=(w->>'inicio')::time AND (p_now AT TIME ZONE p_zone)::time<(w->>'fim')::time);
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION private.crm_ia_agent_window_at(jsonb,text,timestamptz) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.crm_ia_inbound_agent(p_client uuid,p_pipeline uuid,p_stage uuid,p_owner uuid,p_runtime jsonb,p_data jsonb,p_now timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE agent_key uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.crm_stages s JOIN public.crm_pipelines p ON p.id=s.pipeline_id WHERE s.id=p_stage AND p.id=p_pipeline AND p.cliente_id=p_client) THEN RETURN NULL; END IF;
 SELECT a.id INTO agent_key FROM public.cliente_atend_ia_agentes a WHERE a.cliente_id=p_client AND a.ativo AND a.auto_responder
  AND a.funil#>>'{crm_ia,pipeline_id}'=p_pipeline::text AND a.funil#>>'{crm_ia,tipo}' IN ('qualificacao','agendamento')
  AND coalesce(a.funil#>'{crm_ia,stage_ids}','[]') ? p_stage::text
  AND private.crm_ia_agent_window_at(a.funil->'crm_ia',coalesce(p_data#>>'{availability,timezone}','America/Sao_Paulo'),p_now)
 ORDER BY CASE WHEN a.id::text=p_runtime->>'next_agent_id' THEN 0 WHEN a.id::text=p_runtime->>'agent_id' THEN 1 WHEN a.funil#>>'{crm_ia,tipo}'='qualificacao' THEN 2 ELSE 3 END,a.created_at,a.id LIMIT 1;
 IF agent_key IS NOT NULL THEN RETURN jsonb_build_object('agent_id',agent_key,'concierge_role',false); END IF;
 IF NOT private.crm_ia_concierge_available(p_data,p_owner,p_runtime,p_now) THEN RETURN NULL; END IF;
 SELECT a.id INTO agent_key FROM public.cliente_atend_ia_agentes a WHERE a.cliente_id=p_client AND a.ativo AND a.auto_responder
  AND a.funil#>>'{crm_ia,pipeline_id}'=p_pipeline::text AND a.funil#>>'{crm_ia,tipo}' IN ('qualificacao','agendamento')
 ORDER BY CASE WHEN a.funil#>>'{crm_ia,tipo}'='qualificacao' THEN 0 ELSE 1 END,a.created_at,a.id LIMIT 1;
 RETURN CASE WHEN agent_key IS NOT NULL THEN jsonb_build_object('agent_id',agent_key,'concierge_role',true) END;
END $$;
REVOKE ALL ON FUNCTION private.crm_ia_inbound_agent(uuid,uuid,uuid,uuid,jsonb,jsonb,timestamptz) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.crm_ia_concierge_role(p_client uuid,p_agent uuid,p_lead public.leads,p_conversation public.cliente_atend_conversas,p_data jsonb,p_snapshot jsonb,p_mode text,p_now timestamptz) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(p_mode='responder' AND p_snapshot->'concierge_role'='true'::jsonb AND p_snapshot->>'purpose' IS DISTINCT FROM 'no_show'
  AND private.crm_ia_inbound_agent(p_client,p_lead.pipeline_id,p_lead.stage_id,p_lead.responsavel_id,p_conversation.crm_ia_runtime,p_data,p_now)
   =jsonb_build_object('agent_id',p_agent,'concierge_role',true),false)
$$;
REVOKE ALL ON FUNCTION private.crm_ia_concierge_role(uuid,uuid,public.leads,public.cliente_atend_conversas,jsonb,jsonb,text,timestamptz) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.crm_ia_concierge_source(p_client uuid,p_channel uuid,p_contact uuid,p_agent uuid,p_message text,p_snapshot jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE source public.cliente_whatsapp_inbox;audio planeje_private.crm_ia_audio_inputs;text_value text;
BEGIN
 SELECT i.* INTO source FROM public.cliente_whatsapp_inbox i JOIN public.cliente_whatsapp_contact c ON c.id=p_contact AND c.cliente_id=p_client
  WHERE i.id::text=p_snapshot->>'source_inbox_id' AND i.cliente_id=p_client AND i.whatsapp_config_id=p_channel AND NOT coalesce(i.is_group,false)
   AND coalesce(nullif(i.chat_jid,''),i.from_jid)=c.from_jid AND i.message_id=p_message AND i.message_id=p_snapshot->>'source_message_id'
   AND i.type IS NOT DISTINCT FROM p_snapshot->>'source_message_type' AND i.media_purged_at IS NULL
   AND NOT jsonb_path_exists(coalesce(i.raw_payload,'{}'),'$.**.fromMe ? (@ == true || @ == "true" || @ == 1)')
   AND NOT jsonb_path_exists(coalesce(i.raw_payload,'{}'),'$.**.from_me ? (@ == true || @ == "true" || @ == 1)')
   AND i.id=(SELECT latest.id FROM public.cliente_whatsapp_inbox latest WHERE latest.cliente_id=p_client AND latest.whatsapp_config_id=p_channel
    AND coalesce(nullif(latest.chat_jid,''),latest.from_jid)=c.from_jid AND NOT coalesce(latest.is_group,false) ORDER BY latest.created_at DESC,latest.id DESC LIMIT 1);
 IF source.id IS NULL THEN RETURN NULL; END IF;
 IF lower(coalesce(source.type,'')) IN ('audio','ptt','myaudio','voice','voicenote','voicemessage','voice_message','audiomessage') THEN
  SELECT * INTO audio FROM planeje_private.crm_ia_audio_inputs WHERE inbox_id=source.id AND cliente_id=p_client AND channel_id=p_channel AND contact_id=p_contact
   AND agent_id=p_agent AND message_id=p_message AND status IN ('completed','failed')
   AND (snapshot->>'agent_updated_at')::timestamptz=(p_snapshot->>'agent_updated_at')::timestamptz
   AND snapshot->>'config_revision'=p_snapshot->>'config_revision' AND snapshot->'concierge_role'=p_snapshot->'concierge_role';
  IF audio.id IS NULL THEN RETURN NULL; END IF;
  IF audio.status='failed' THEN RETURN jsonb_build_object('audio_failed',true); END IF;
  text_value:=audio.transcript;
 ELSIF lower(coalesce(source.type,'text')) IN ('text','chat','conversation','extendedtextmessage') THEN text_value:=source.body;
 ELSE RETURN NULL; END IF;
 RETURN jsonb_build_object('text',text_value);
END $$;
REVOKE ALL ON FUNCTION private.crm_ia_concierge_source(uuid,uuid,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.crm_ia_concierge_deterministic(p_settings jsonb,p_source jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE text_value text;phrase jsonb;needle text;
BEGIN
 text_value:=btrim(lower(regexp_replace(normalize(coalesce(p_source->>'text',''),NFD),U&'[\0300-\036f]','','g')));
 IF text_value ~ '\m(nao tenho interesse|nao quero mais|pare de enviar|parar de enviar|pode parar)\M' THEN RETURN 'close'; END IF;
 IF p_settings ? 'handoff_enabled' AND p_settings->'handoff_enabled' IS DISTINCT FROM 'true'::jsonb THEN RETURN NULL; END IF;
 IF jsonb_typeof(p_settings->'handoff_phrases')='array' THEN
  FOR phrase IN SELECT value FROM jsonb_array_elements(p_settings->'handoff_phrases') LOOP
   IF jsonb_typeof(phrase)<>'string' THEN CONTINUE; END IF;
   needle:=btrim(lower(regexp_replace(normalize(phrase#>>'{}',NFD),U&'[\0300-\036f]','','g')));
   IF length(needle)>=3 AND position(needle IN text_value)>0 THEN RETURN 'handoff'; END IF;
  END LOOP;
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION private.crm_ia_concierge_deterministic(jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.crm_ia_concierge_faq(p_client uuid,p_data jsonb) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce((NOT(p_data->'concierge' ? 'faq_enabled') OR p_data#>'{concierge,faq_enabled}'='true'::jsonb)
  AND EXISTS(SELECT 1 FROM public.cliente_atend_ia_bases b WHERE b.cliente_id=p_client AND b.id::text=coalesce(nullif(p_data#>>'{concierge,base_id}',''),p_data#>>'{knowledge,concierge_base_id}')),false)
$$;
REVOKE ALL ON FUNCTION private.crm_ia_concierge_faq(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- Existing functions retain their identities, privileges and call chain.

CREATE OR REPLACE FUNCTION public.crm_ia_agent_begin_pre_appointments(p_client uuid,p_channel uuid,p_contact uuid,p_lead uuid,p_agent uuid,p_mode text,p_message text,p_expected jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cfg public.crm_ia_config;a public.cliente_atend_ia_agentes;l public.leads;c public.cliente_atend_conversas;r planeje_private.crm_ia_agent_runs;
 key uuid:=md5(p_client::text||':'||p_channel::text||':'||p_mode||':'||p_message)::uuid;rules jsonb;target jsonb;support boolean;source jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('crm-ia:'||p_client::text,0));
 select * into r from planeje_private.crm_ia_agent_runs where id=key;
 if found then return jsonb_build_object('claimed',false,'id',key,'result',r.result);end if;
 if p_mode not in ('responder','followup') or length(p_message) not between 1 and 300 then raise exception 'crm_ia_request';end if;
 select * into cfg from public.crm_ia_config where cliente_id=p_client for share;
 select * into a from public.cliente_atend_ia_agentes where id=p_agent and cliente_id=p_client for share;rules=a.funil->'crm_ia';
 select * into l from public.leads where id=p_lead and cliente_id=p_client and crm_ia_contact_id=p_contact for share;
 select * into c from public.cliente_atend_conversas where cliente_id=p_client and contact_id=p_contact for update;
 if p_mode='followup' and (c.crm_ia_runtime->>'config_revision' is distinct from cfg.revision::text
  or c.crm_ia_runtime->>'followup_agent_id' is distinct from a.id::text
  or (c.crm_ia_runtime->>'followup_agent_updated_at')::timestamptz is distinct from a.updated_at) then
  update public.cliente_atend_conversas set ia_followup_due_at=null,ia_followup_delivery_state='cancelled' where id=c.id;
  return '{"claimed":false,"skipped":"automation_changed"}';end if;
 support:=private.crm_ia_concierge_role(p_client,p_agent,l,c,cfg.data,p_expected,p_mode,clock_timestamp());
 if p_expected ? 'concierge_role' and jsonb_typeof(p_expected->'concierge_role') is distinct from 'boolean' then return '{"claimed":false,"skipped":"snapshot_changed"}';end if;
 if p_expected ? 'concierge_role' and lower(coalesce(p_expected->>'source_message_type','')) in ('audio','ptt','myaudio','voice','voicenote','voicemessage','voice_message','audiomessage') then
  source:=private.crm_ia_concierge_source(p_client,p_channel,p_contact,p_agent,p_message,p_expected);
  if p_mode<>'responder' or source is null or not private.crm_ia_appointment_actor(p_client,p_channel,p_contact,p_lead,(p_expected->>'actor_id')::uuid)
   or private.crm_ia_inbound_agent(p_client,l.pipeline_id,l.stage_id,l.responsavel_id,c.crm_ia_runtime,cfg.data,clock_timestamp())
   is distinct from jsonb_build_object('agent_id',p_agent,'concierge_role',p_expected->'concierge_role') then return '{"claimed":false,"skipped":"audio_context_changed"}';end if;
 end if;
 if p_expected->'concierge_role'='true'::jsonb then
  source:=private.crm_ia_concierge_source(p_client,p_channel,p_contact,p_agent,p_message,p_expected);
  if not support or source is null or not private.crm_ia_appointment_actor(p_client,p_channel,p_contact,p_lead,(p_expected->>'actor_id')::uuid)
   or not coalesce((private.crm_ia_concierge_faq(p_client,cfg.data)
   or cfg.data#>'{concierge,appointment_confirm}'='true'::jsonb or cfg.data#>'{concierge,appointment_reschedule}'='true'::jsonb or cfg.data#>'{concierge,appointment_cancel}'='true'::jsonb
   or source->'audio_failed'='true'::jsonb or private.crm_ia_concierge_deterministic(cfg.data->'concierge',source) is not null),false) then return '{"claimed":false,"skipped":"concierge_unavailable"}';end if;
 end if;
 target=planeje_private.crm_ia_delivery_target(p_client,p_channel,p_contact);
 if target->>'allowed'<>'true' or not private.crm_ia_agent_actor(p_client,(p_expected->>'actor_id')::uuid)
  or cfg.revision is distinct from (p_expected->>'config_revision')::uuid or cfg.data#>>'{attendance,auto_send}' is distinct from 'true'
  or not a.ativo or not a.auto_responder or a.updated_at is distinct from (p_expected->>'agent_updated_at')::timestamptz
  or l.id is null or c.id is null or c.ia_pausada or c.status='finalizado'
  or l.updated_at is distinct from (p_expected->>'lead_updated_at')::timestamptz or c.updated_at is distinct from (p_expected->>'conversation_updated_at')::timestamptz
  or rules->>'pipeline_id' is distinct from l.pipeline_id::text or (not support and not coalesce(rules->'stage_ids','[]') ? l.stage_id::text)
  or (p_mode='followup' and (rules->>'tipo'<>'followup' or c.ia_followup_due_at is null or c.ia_followup_due_at>clock_timestamp()
    or c.crm_ia_runtime->>'config_revision' is distinct from cfg.revision::text))
  or (not support and not coalesce(not(p_expected ? 'concierge_role') and p_expected->'concierge'='true'::jsonb,false) and not private.crm_ia_agent_window(rules,coalesce(cfg.data#>>'{availability,timezone}','America/Sao_Paulo')))
  or planeje_private.crm_ia_delivery_config(p_client,target->>'phone',cfg.revision,true) is not null then return '{"claimed":false,"skipped":"snapshot_changed"}';end if;
 insert into planeje_private.crm_ia_agent_runs(id,cliente_id,channel_id,contact_id,lead_id,agent_id,actor_id,mode,message_id,snapshot)
 values(key,p_client,p_channel,p_contact,p_lead,p_agent,(p_expected->>'actor_id')::uuid,p_mode,p_message,p_expected);
 return jsonb_build_object('claimed',true,'id',key);
end $$;

CREATE OR REPLACE FUNCTION private.crm_ia_appointment_rules(p_agent uuid,p_appointment uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN g.funil#>>'{crm_ia,tipo}'='agendamento' THEN coalesce(g.funil#>'{crm_ia,agendamento}','{}')
  ELSE jsonb_build_object('duration_minutes',trim_scale(extract(epoch FROM a.end_at-a.start_at)/60)) END
 FROM public.cliente_atend_ia_agentes g JOIN public.crm_ia_appointments a ON a.cliente_id=g.cliente_id WHERE g.id=p_agent AND a.id=p_appointment
$$;

CREATE OR REPLACE FUNCTION private.crm_ia_appointment_run(p_run uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r planeje_private.crm_ia_agent_runs;c public.cliente_atend_conversas;l public.leads;a public.cliente_atend_ia_agentes;cfg public.crm_ia_config;target jsonb;
BEGIN
 SELECT * INTO r FROM planeje_private.crm_ia_agent_runs WHERE id=p_run FOR UPDATE;
 PERFORM pg_advisory_xact_lock(hashtextextended('crm-ia:'||r.cliente_id::text,0));
 SELECT * INTO cfg FROM public.crm_ia_config WHERE cliente_id=r.cliente_id FOR SHARE;
 SELECT * INTO a FROM public.cliente_atend_ia_agentes WHERE id=r.agent_id AND cliente_id=r.cliente_id FOR SHARE;
 SELECT * INTO l FROM public.leads WHERE id=r.lead_id AND cliente_id=r.cliente_id FOR UPDATE;
 SELECT * INTO c FROM public.cliente_atend_conversas WHERE cliente_id=r.cliente_id AND contact_id=r.contact_id FOR UPDATE;
 target:=planeje_private.crm_ia_delivery_target(r.cliente_id,r.channel_id,r.contact_id);
 IF r.id IS NULL OR r.status<>'claimed' OR NOT private.crm_ia_appointment_actor(r.cliente_id,r.channel_id,r.contact_id,r.lead_id,r.actor_id)
  OR cfg.revision IS DISTINCT FROM (r.snapshot->>'config_revision')::uuid OR cfg.data#>>'{attendance,auto_send}' IS DISTINCT FROM 'true'
  OR NOT coalesce(a.ativo AND a.auto_responder,false) OR a.updated_at IS DISTINCT FROM (r.snapshot->>'agent_updated_at')::timestamptz
  OR l.updated_at IS DISTINCT FROM (r.snapshot->>'lead_updated_at')::timestamptz OR c.updated_at IS DISTINCT FROM (r.snapshot->>'conversation_updated_at')::timestamptz
  OR c.id IS NULL OR c.ia_pausada OR c.status='finalizado' OR a.funil#>>'{crm_ia,pipeline_id}' IS DISTINCT FROM l.pipeline_id::text
  OR (CASE WHEN r.snapshot->'concierge_role'='true'::jsonb THEN NOT private.crm_ia_concierge_role(r.cliente_id,r.agent_id,l,c,cfg.data,r.snapshot,r.mode,r.created_at) ELSE NOT coalesce(a.funil#>'{crm_ia,stage_ids}','[]') ? l.stage_id::text END)
  OR planeje_private.crm_ia_delivery_config(r.cliente_id,target->>'phone',cfg.revision,true) IS NOT NULL THEN RAISE EXCEPTION 'crm_ia_appointment_scope_or_snapshot' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('run',to_jsonb(r),'conversation',to_jsonb(c),'lead',to_jsonb(l),'agent',to_jsonb(a),'config',to_jsonb(cfg));
END $$;

CREATE FUNCTION public.crm_ia_appointment_slots_for_run(p_run uuid,p_appointment uuid,p_date date,p_expected timestamptz) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE context jsonb;r planeje_private.crm_ia_agent_runs;a public.crm_ia_appointments;
BEGIN
 context:=private.crm_ia_appointment_run(p_run);r:=jsonb_populate_record(NULL::planeje_private.crm_ia_agent_runs,context->'run');
 IF r.snapshot->'concierge_role' IS DISTINCT FROM 'true'::jsonb OR context#>'{config,data,concierge,appointment_reschedule}' IS DISTINCT FROM 'true'::jsonb THEN
  RAISE EXCEPTION 'crm_ia_appointment_slots_scope' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM public.crm_ia_appointments WHERE id=p_appointment AND cliente_id=r.cliente_id AND contact_id=r.contact_id AND lead_id=r.lead_id;
 IF a.id IS NULL OR a.updated_at IS DISTINCT FROM p_expected OR a.status NOT IN ('scheduled','confirmed','no_show')
  OR NOT private.crm_ia_calendar_owner(r.cliente_id,a.owner_id,r.lead_id,r.contact_id) THEN RAISE EXCEPTION 'crm_ia_appointment_slots_scope' USING ERRCODE='42501'; END IF;
 RETURN private.crm_ia_slots(r.cliente_id,a.owner_id,p_date,a.id,private.crm_ia_appointment_rules(r.agent_id,a.id));
END $$;

CREATE OR REPLACE FUNCTION public.crm_ia_apply_agent_action_pre_profiles(p_run uuid,p_action jsonb,p_reply text,p_followup jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
<<worker>>
DECLARE r planeje_private.crm_ia_agent_runs;c public.cliente_atend_conversas;l public.leads;cfg public.crm_ia_config;a public.crm_ia_appointments;before_row public.crm_ia_appointments;
 source public.cliente_whatsapp_inbox;question public.crm_ia_outbox;context jsonb;proposal jsonb;operation text;reply text;answer text;allowed boolean:=false;
 outbox uuid:=gen_random_uuid();confirmation uuid:=gen_random_uuid();stamp timestamptz;result jsonb;rules jsonb;availability jsonb;slots jsonb;reminder jsonb;due timestamptz;amount numeric;was_claimed boolean;
BEGIN
 SELECT * INTO r FROM planeje_private.crm_ia_agent_runs WHERE id=p_run FOR UPDATE;
 IF r.status='queued' THEN RETURN r.result; END IF;
 IF jsonb_typeof(p_action) IS DISTINCT FROM 'object' OR coalesce(p_action->>'type','') NOT IN ('answer','qualify','handoff','close','book','appointment_propose','appointment_apply','no_show_recover') THEN RAISE EXCEPTION 'crm_ia_action' USING ERRCODE='22023'; END IF;
 IF r.snapshot->'concierge_role'='true'::jsonb AND (p_action ?| ARRAY['values','profile_id','summary'] OR p_action->>'type' IN ('qualify','book','no_show_recover')) THEN
  RAISE EXCEPTION 'crm_ia_concierge_action_unavailable' USING ERRCODE='42501'; END IF;
 IF p_action->>'type'='no_show_recover' THEN RETURN private.crm_ia_apply_no_show(p_run); END IF;
 IF r.snapshot->>'purpose'='no_show' THEN RAISE EXCEPTION 'crm_ia_no_show_purpose' USING ERRCODE='22023'; END IF;
 IF p_action->>'type' NOT IN ('appointment_propose','appointment_apply') THEN
  was_claimed:=r.status='claimed';result:=public.crm_ia_apply_agent_action_pre_appointments(p_run,p_action,p_reply,p_followup);
  IF was_claimed AND result->>'queued'='true' THEN
   SELECT i.* INTO source FROM public.cliente_whatsapp_inbox i JOIN public.cliente_whatsapp_contact ct ON ct.id=r.contact_id AND ct.cliente_id=r.cliente_id
    JOIN public.cliente_atend_conversas state ON state.contact_id=ct.id AND state.cliente_id=ct.cliente_id
    WHERE i.id=nullif(r.snapshot->>'source_inbox_id','')::uuid AND i.cliente_id=r.cliente_id AND i.whatsapp_config_id=r.channel_id AND NOT coalesce(i.is_group,false)
     AND coalesce(nullif(i.chat_jid,''),i.from_jid)=ct.from_jid AND i.message_id=r.snapshot->>'source_message_id' AND i.type IS NOT DISTINCT FROM r.snapshot->>'source_message_type'
     AND (r.mode='responder' AND i.message_id=r.message_id OR r.mode='followup' AND state.crm_ia_runtime->>'source_inbox_id'=i.id::text AND state.crm_ia_runtime->>'source_message_id'=i.message_id AND state.crm_ia_runtime->>'source_message_type' IS NOT DISTINCT FROM i.type);
   UPDATE public.cliente_atend_conversas SET crm_ia_runtime=(crm_ia_runtime-'pending_appointment_action'-'no_show')||jsonb_build_object('source_inbox_id',source.id,'source_message_id',source.message_id,'source_message_type',source.type),updated_at=clock_timestamp()
    WHERE cliente_id=r.cliente_id AND contact_id=r.contact_id AND crm_ia_runtime->>'delivery_run_id'=r.id::text RETURNING updated_at INTO stamp;
   IF stamp IS NOT NULL THEN UPDATE public.crm_ia_outbox SET source_updated_at=stamp WHERE id=(result->>'outbox_id')::uuid AND kind<>'reminder'; END IF;
  END IF;
  RETURN result;
 END IF;
 context:=private.crm_ia_appointment_run(p_run);c:=jsonb_populate_record(NULL::public.cliente_atend_conversas,context->'conversation');
 l:=jsonb_populate_record(NULL::public.leads,context->'lead');cfg:=jsonb_populate_record(NULL::public.crm_ia_config,context->'config');
 IF cfg.data#>>'{concierge,enabled}' IS DISTINCT FROM 'true' OR r.snapshot->>'concierge' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'crm_ia_concierge_disabled' USING ERRCODE='42501'; END IF;
 SELECT i.* INTO source FROM public.cliente_whatsapp_inbox i JOIN public.cliente_whatsapp_contact ct ON ct.id=r.contact_id AND ct.cliente_id=r.cliente_id
  WHERE i.id=nullif(r.snapshot->>'source_inbox_id','')::uuid AND i.cliente_id=r.cliente_id AND i.whatsapp_config_id=r.channel_id AND NOT coalesce(i.is_group,false)
   AND coalesce(nullif(i.chat_jid,''),i.from_jid)=ct.from_jid AND i.message_id=r.message_id AND i.message_id=r.snapshot->>'source_message_id'
   AND i.type IS NOT DISTINCT FROM r.snapshot->>'source_message_type' AND i.media_purged_at IS NULL;
 IF source.id IS NULL OR r.mode<>'responder' OR jsonb_path_exists(coalesce(source.raw_payload,'{}'),'$.**.fromMe ? (@ == true || @ == "true" || @ == 1)')
  OR jsonb_path_exists(coalesce(source.raw_payload,'{}'),'$.**.from_me ? (@ == true || @ == "true" || @ == 1)') THEN RAISE EXCEPTION 'crm_ia_appointment_source_required' USING ERRCODE='42501'; END IF;
 proposal:=c.crm_ia_runtime->'pending_appointment_action';
 IF p_action->>'type'='appointment_propose' THEN
  operation:=p_action->>'operation';
  IF operation NOT IN ('confirm','reschedule','cancel') OR cfg.data->'concierge'->>('appointment_'||operation) IS DISTINCT FROM 'true'
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_action) k WHERE k NOT IN ('type','operation','appointment_id','start_at','end_at')) THEN RAISE EXCEPTION 'crm_ia_appointment_operation_disabled' USING ERRCODE='42501'; END IF;
  context:=public.crm_ia_appointment_context(r.cliente_id,r.channel_id,r.contact_id,r.lead_id,r.actor_id);
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(context->'rows') x WHERE x->>'id'=p_action->>'appointment_id') THEN RAISE EXCEPTION 'crm_ia_appointment_unavailable' USING ERRCODE='42501'; END IF;
  SELECT * INTO a FROM public.crm_ia_appointments WHERE id=(p_action->>'appointment_id')::uuid FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.crm_ia_appointments x WHERE x.id<>a.id AND x.cliente_id=r.cliente_id AND x.contact_id=r.contact_id AND x.lead_id=r.lead_id
    AND x.status IN ('scheduled','confirmed','no_show') AND x.title=a.title AND x.start_at=a.start_at AND private.crm_ia_calendar_owner(r.cliente_id,x.owner_id,r.lead_id,r.contact_id)) THEN
   RAISE EXCEPTION 'crm_ia_appointment_ambiguous' USING ERRCODE='22023'; END IF;
  IF (operation='confirm' AND (a.status NOT IN ('scheduled','confirmed') OR a.start_at<=clock_timestamp())) OR (operation='cancel' AND a.status NOT IN ('scheduled','confirmed')) THEN RAISE EXCEPTION 'crm_ia_appointment_state'; END IF;
  IF operation='reschedule' THEN
   IF r.snapshot->'concierge_role'='true'::jsonb THEN
     slots:=public.crm_ia_appointment_slots_for_run(r.id,a.id,((p_action->>'start_at')::timestamptz AT TIME ZONE coalesce(cfg.data#>>'{availability,timezone}','America/Sao_Paulo'))::date,a.updated_at);
    ELSE slots:=public.crm_ia_appointment_slots(r.cliente_id,r.channel_id,r.contact_id,r.lead_id,r.agent_id,r.actor_id,a.id,((p_action->>'start_at')::timestamptz AT TIME ZONE coalesce(cfg.data#>>'{availability,timezone}','America/Sao_Paulo'))::date,a.updated_at); END IF;
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(slots->'rows') s WHERE (s->>'start_at')::timestamptz=(p_action->>'start_at')::timestamptz AND (s->>'end_at')::timestamptz=(p_action->>'end_at')::timestamptz) THEN RAISE EXCEPTION 'crm_ia_appointment_slot_changed' USING ERRCODE='40001'; END IF;
  END IF;
  IF proposal->>'question_outbox_id' IS NOT NULL THEN UPDATE public.crm_ia_outbox SET status='cancelled',error_code='proposal_replaced' WHERE id=(proposal->>'question_outbox_id')::uuid AND status='pending' AND attempts=0; END IF;
  proposal:=jsonb_build_object('id',confirmation,'operation',operation,'appointment_id',a.id,'appointment_updated_at',a.updated_at,'owner_id',a.owner_id,'actor_id',r.actor_id,
   'agent_id',r.agent_id,'agent_updated_at',r.snapshot->'agent_updated_at','config_revision',cfg.revision,'channel_id',r.channel_id,'source_inbox_id',source.id,
   'question_outbox_id',outbox,'created_at',clock_timestamp(),'expires_at',clock_timestamp()+interval '5 minutes','staff_change_at',c.crm_ia_runtime->'last_staff_change_at',
   'start_at',p_action->'start_at','end_at',p_action->'end_at');
  reply:=CASE operation WHEN 'cancel' THEN 'Você confirma que deseja cancelar' WHEN 'reschedule' THEN 'Você confirma que deseja remarcar' ELSE 'Você confirma sua presença em' END||' "'||a.title||'", '||to_char(a.start_at AT TIME ZONE coalesce(cfg.data#>>'{availability,timezone}','America/Sao_Paulo'),'DD/MM/YYYY "às" HH24:MI')||
   CASE WHEN operation='reschedule' THEN ' para '||to_char((p_action->>'start_at')::timestamptz AT TIME ZONE coalesce(cfg.data#>>'{availability,timezone}','America/Sao_Paulo'),'DD/MM/YYYY "às" HH24:MI') ELSE '' END||'? Responda sim para confirmar ou não para manter como está.';
  c.crm_ia_runtime:=c.crm_ia_runtime||jsonb_build_object('pending_appointment_action',proposal);
  result:=jsonb_build_object('action','appointment_propose','confirmation_id',confirmation);
 ELSE
  operation:=proposal->>'operation';
  SELECT * INTO a FROM public.crm_ia_appointments WHERE id=nullif(proposal->>'appointment_id','')::uuid AND cliente_id=r.cliente_id AND contact_id=r.contact_id AND lead_id=r.lead_id FOR UPDATE;
  SELECT * INTO question FROM public.crm_ia_outbox WHERE id=nullif(proposal->>'question_outbox_id','')::uuid AND cliente_id=r.cliente_id AND contact_id=r.contact_id AND whatsapp_config_id=r.channel_id;
  IF proposal->>'id'=p_action->>'confirmation_id' AND (proposal->>'expires_at')::timestamptz>clock_timestamp()
   AND proposal->>'actor_id'=r.actor_id::text AND proposal->>'agent_id'=r.agent_id::text AND proposal->>'channel_id'=r.channel_id::text
   AND proposal->>'config_revision'=cfg.revision::text AND (proposal->>'agent_updated_at')::timestamptz=(r.snapshot->>'agent_updated_at')::timestamptz
   AND proposal->>'staff_change_at' IS NOT DISTINCT FROM c.crm_ia_runtime->>'last_staff_change_at'
   AND a.updated_at=(proposal->>'appointment_updated_at')::timestamptz AND a.owner_id::text=proposal->>'owner_id' AND private.crm_ia_calendar_owner(r.cliente_id,a.owner_id,r.lead_id,r.contact_id)
   AND question.status='sent' AND question.sent_at IS NOT NULL AND source.created_at>question.sent_at
   AND private.crm_ia_original_message_time(source.raw_payload,source.msg_timestamp)>question.sent_at
   AND NOT EXISTS(SELECT 1 FROM public.cliente_whatsapp_inbox i WHERE i.cliente_id=r.cliente_id AND i.whatsapp_config_id=r.channel_id AND NOT coalesce(i.is_group,false)
    AND coalesce(nullif(i.chat_jid,''),i.from_jid)=coalesce(nullif(source.chat_jid,''),source.from_jid) AND i.id<>source.id AND i.created_at>question.sent_at)
   AND NOT EXISTS(SELECT 1 FROM public.cliente_whatsapp_sent s WHERE s.cliente_id=r.cliente_id AND s.whatsapp_config_id=r.channel_id AND coalesce(nullif(s.chat_jid,''),s.to_jid)=coalesce(nullif(source.chat_jid,''),source.from_jid)
    AND s.created_at>question.sent_at AND s.message_id IS DISTINCT FROM question.provider_message_id) THEN
   IF lower(coalesce(source.type,'')) IN ('audio','ptt','myaudio','voice','voicenote','voicemessage','voice_message','audiomessage') THEN
    SELECT transcript INTO answer FROM planeje_private.crm_ia_audio_inputs WHERE inbox_id=source.id AND cliente_id=r.cliente_id AND channel_id=r.channel_id AND contact_id=r.contact_id AND message_id=source.message_id AND status='completed'
     AND (r.snapshot->'concierge_role' IS DISTINCT FROM 'true'::jsonb OR (agent_id=r.agent_id AND snapshot->'concierge_role'='true'::jsonb AND snapshot->>'config_revision'=r.snapshot->>'config_revision' AND (snapshot->>'agent_updated_at')::timestamptz=(r.snapshot->>'agent_updated_at')::timestamptz));
   ELSIF lower(coalesce(source.type,'text')) IN ('text','chat','conversation','extendedtextmessage') THEN answer:=source.body; END IF;
   answer:=btrim(regexp_replace(translate(lower(coalesce(answer,'')),'áàâãéêíóôõúç','aaaaeeiooouc'),'[.!;,]','','g'));
   allowed:=answer IN ('sim','sim confirmo','confirmo','pode confirmar','confirmo presença','confirmo presenca')
    OR (operation='cancel' AND answer IN ('pode cancelar','confirmo cancelar')) OR (operation='reschedule' AND answer IN ('pode remarcar','confirmo remarcar','pode ser'));
  END IF;
  IF operation IS NOT NULL AND cfg.data->'concierge'->>('appointment_'||operation) IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'crm_ia_appointment_operation_revoked' USING ERRCODE='42501'; END IF;
  c.crm_ia_runtime:=c.crm_ia_runtime-'pending_appointment_action';
  IF NOT coalesce(allowed,false) THEN
   reply:='Não consegui confirmar sua resposta com segurança. Peça novamente a alteração para eu conferir e enviar uma nova pergunta.';result:=jsonb_build_object('action','answer');
   UPDATE public.crm_ia_outbox SET status='cancelled',error_code='confirmation_unverified' WHERE id=question.id AND status='pending' AND attempts=0;
  ELSE
   before_row:=a;
   IF operation='confirm' THEN
    IF a.status NOT IN ('scheduled','confirmed') OR a.start_at<=clock_timestamp() THEN RAISE EXCEPTION 'crm_ia_appointment_state'; END IF;
    UPDATE public.crm_ia_appointments SET status='confirmed',updated_at=clock_timestamp() WHERE id=a.id RETURNING * INTO a;
   ELSIF operation='cancel' THEN
    IF a.status NOT IN ('scheduled','confirmed') THEN RAISE EXCEPTION 'crm_ia_appointment_state'; END IF;
    UPDATE public.crm_ia_appointments SET status='cancelled',updated_at=clock_timestamp() WHERE id=a.id RETURNING * INTO a;
    UPDATE public.leads SET agendamento=NULL,proxima_acao=NULL,updated_at=clock_timestamp() WHERE id=l.id AND agendamento=before_row.start_at RETURNING * INTO l;
    IF NOT FOUND THEN SELECT * INTO l FROM public.leads WHERE id=r.lead_id; END IF;
   ELSIF operation='reschedule' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('crm-ia-agenda:'||a.owner_id::text,0));
    rules:=private.crm_ia_appointment_rules(r.agent_id,a.id);availability:=private.crm_ia_availability(r.cliente_id,rules);
    IF r.snapshot->'concierge_role'='true'::jsonb THEN
     slots:=public.crm_ia_appointment_slots_for_run(r.id,a.id,((proposal->>'start_at')::timestamptz AT TIME ZONE coalesce(cfg.data#>>'{availability,timezone}','America/Sao_Paulo'))::date,a.updated_at);
    ELSE slots:=public.crm_ia_appointment_slots(r.cliente_id,r.channel_id,r.contact_id,r.lead_id,r.agent_id,r.actor_id,a.id,((proposal->>'start_at')::timestamptz AT TIME ZONE coalesce(cfg.data#>>'{availability,timezone}','America/Sao_Paulo'))::date,a.updated_at); END IF;
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(slots->'rows') s WHERE (s->>'start_at')::timestamptz=(proposal->>'start_at')::timestamptz AND (s->>'end_at')::timestamptz=(proposal->>'end_at')::timestamptz) THEN RAISE EXCEPTION 'crm_ia_appointment_slot_changed' USING ERRCODE='40001'; END IF;
    UPDATE public.crm_ia_appointments SET start_at=(proposal->>'start_at')::timestamptz,end_at=(proposal->>'end_at')::timestamptz,
     busy_start_at=(proposal->>'start_at')::timestamptz-make_interval(mins=>coalesce((availability->>'buffer_before')::integer,0)),
     busy_end_at=(proposal->>'end_at')::timestamptz+make_interval(mins=>coalesce((availability->>'buffer_after')::integer,0)),status='scheduled',updated_at=clock_timestamp() WHERE id=a.id RETURNING * INTO a;
    UPDATE public.leads SET agendamento=a.start_at,proxima_acao=a.start_at,updated_at=clock_timestamp() WHERE id=l.id AND (agendamento IS NULL OR agendamento=before_row.start_at) RETURNING * INTO l;
    IF NOT FOUND THEN SELECT * INTO l FROM public.leads WHERE id=r.lead_id; END IF;
   ELSE RAISE EXCEPTION 'crm_ia_appointment_operation'; END IF;
   INSERT INTO public.crm_lead_interacoes(lead_id,cliente_id,tipo,descricao,user_id) VALUES(l.id,r.cliente_id,'agendamento',
    'Concierge: '||operation||' — '||before_row.status||' '||before_row.start_at::text||' → '||a.status||' '||a.start_at::text,r.actor_id);
   UPDATE public.crm_ia_outbox SET status='cancelled',error_code='appointment_changed' WHERE cliente_id=r.cliente_id AND status='pending' AND attempts=0
    AND (appointment_id=a.id OR calendar_appointment_id=a.id);
   reply:=CASE operation WHEN 'cancel' THEN 'Seu compromisso foi cancelado.' WHEN 'reschedule' THEN 'Seu compromisso foi remarcado para '||to_char(a.start_at AT TIME ZONE coalesce(cfg.data#>>'{availability,timezone}','America/Sao_Paulo'),'DD/MM/YYYY "às" HH24:MI')||'.' ELSE 'Sua presença foi confirmada.' END;
   result:=jsonb_build_object('action','appointment_'||operation,'appointment',to_jsonb(a),'operation_receipt',jsonb_build_object('operation',operation,'actor_id',r.actor_id,'run_id',r.id,'confirmation_id',proposal->'id','before',to_jsonb(before_row),'after',to_jsonb(a)));
  END IF;
 END IF;
 UPDATE public.cliente_atend_conversas SET status='entrada',ia_followup_due_at=NULL,ia_followup_delivery_state='cancelled',
  crm_ia_runtime=c.crm_ia_runtime||jsonb_build_object('active',true,'agent_id',r.agent_id,'delivery_run_id',r.id,'pending_followup','{}'::jsonb,
   'source_inbox_id',r.snapshot->'source_inbox_id','source_message_id',r.snapshot->'source_message_id','source_message_type',r.snapshot->'source_message_type'),updated_at=clock_timestamp()
  WHERE id=c.id RETURNING updated_at INTO stamp;
 INSERT INTO public.crm_ia_outbox(id,cliente_id,whatsapp_config_id,contact_id,lead_id,kind,body,scheduled_at,request_id,created_by,source_updated_at,config_revision,agent_run_id,calendar_appointment_id,calendar_source_updated_at)
 VALUES(outbox,r.cliente_id,r.channel_id,r.contact_id,r.lead_id,'reply',reply,clock_timestamp(),r.id,r.actor_id,stamp,cfg.revision,r.id,
  CASE WHEN result ? 'operation_receipt' THEN a.id END,CASE WHEN result ? 'operation_receipt' THEN a.updated_at END);
 IF result ? 'operation_receipt' AND operation IN ('confirm','reschedule') THEN
  FOR reminder IN SELECT value FROM jsonb_array_elements(coalesce(context#>'{agent,funil,crm_ia,agendamento,reminders}','[]')) LOOP
   amount:=(reminder->>'valor')::numeric*(CASE WHEN reminder->>'unidade'='dias' THEN 24 ELSE 1 END);due:=a.start_at-amount*interval '1 hour';
   IF due>clock_timestamp() THEN
    INSERT INTO public.crm_ia_outbox(cliente_id,whatsapp_config_id,contact_id,lead_id,kind,body,scheduled_at,request_id,created_by,source_updated_at,config_revision,agent_run_id,appointment_id)
    VALUES(r.cliente_id,r.channel_id,r.contact_id,r.lead_id,'reminder','Lembrete: seu atendimento está reservado para '||to_char(a.start_at AT TIME ZONE coalesce(cfg.data#>>'{availability,timezone}','America/Sao_Paulo'),'DD/MM/YYYY "às" HH24:MI')||'.',due,
     md5(a.id::text||':'||a.updated_at::text||':reminder:'||due::text)::uuid,r.actor_id,a.updated_at,cfg.revision,r.id,a.id) ON CONFLICT(cliente_id,created_by,request_id) DO NOTHING;
   END IF;
  END LOOP;
 END IF;
 result:=result||jsonb_build_object('handled',true,'typed',true,'queued',true,'outbox_id',outbox,'resposta',reply,'lead_updated_at',l.updated_at);
 UPDATE planeje_private.crm_ia_agent_runs SET status='queued',result=worker.result WHERE id=r.id;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.crm_ia_apply_agent_action_pre_appointments(p_run uuid,p_action jsonb,p_reply text,p_followup jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare r planeje_private.crm_ia_agent_runs;cfg public.crm_ia_config;a public.cliente_atend_ia_agentes;l public.leads;c public.cliente_atend_conversas;
 rules jsonb;dest jsonb;target jsonb;fields jsonb;k text;v jsonb;kind text:=p_action->>'type';destination text;stage_key uuid;next_agent uuid;
 appointment jsonb;reply text;outbox uuid;stamp timestamptz;owner_key uuid;reminder jsonb;reminder_at timestamptz;hours_n numeric;source jsonb;deterministic text;
begin
 select * into r from planeje_private.crm_ia_agent_runs where id=p_run for update;
 if r.id is null then raise exception 'crm_ia_run';end if;
 if r.status='queued' then return r.result;elsif r.status<>'claimed' then return '{"queued":false,"skipped":"run_closed"}';end if;
 perform pg_advisory_xact_lock(hashtextextended('crm-ia:'||r.cliente_id::text,0));
 select * into cfg from public.crm_ia_config where cliente_id=r.cliente_id for share;
 select * into a from public.cliente_atend_ia_agentes where id=r.agent_id and cliente_id=r.cliente_id for share;rules=a.funil->'crm_ia';dest=coalesce(rules->'destino','{"tipo":"humano"}');
 select * into l from public.leads where id=r.lead_id and cliente_id=r.cliente_id for update;
 select * into c from public.cliente_atend_conversas where cliente_id=r.cliente_id and contact_id=r.contact_id for update;
 target=planeje_private.crm_ia_delivery_target(r.cliente_id,r.channel_id,r.contact_id);
 if not private.crm_ia_agent_actor(r.cliente_id,r.actor_id) or cfg.revision is distinct from (r.snapshot->>'config_revision')::uuid
  or cfg.data#>>'{attendance,auto_send}' is distinct from 'true' or not a.ativo or not a.auto_responder or target->>'allowed'<>'true'
  or a.updated_at is distinct from (r.snapshot->>'agent_updated_at')::timestamptz or l.updated_at is distinct from (r.snapshot->>'lead_updated_at')::timestamptz
  or c.updated_at is distinct from (r.snapshot->>'conversation_updated_at')::timestamptz or c.ia_pausada or c.status='finalizado'
  or planeje_private.crm_ia_delivery_config(r.cliente_id,target->>'phone',cfg.revision,true) is not null then
  update planeje_private.crm_ia_agent_runs set status='cancelled' where id=r.id;return '{"queued":false,"skipped":"snapshot_changed"}';end if;
 if r.snapshot->'concierge_role'='true'::jsonb then
  if not private.crm_ia_concierge_role(r.cliente_id,r.agent_id,l,c,cfg.data,r.snapshot,r.mode,r.created_at)
   or not private.crm_ia_appointment_actor(r.cliente_id,r.channel_id,r.contact_id,r.lead_id,r.actor_id)
   or p_action ?| array['values','profile_id','summary'] or kind not in ('answer','handoff','close') then raise exception 'crm_ia_concierge_action_unavailable' using errcode='42501';end if;
  source:=private.crm_ia_concierge_source(r.cliente_id,r.channel_id,r.contact_id,r.agent_id,r.message_id,r.snapshot);
  deterministic:=private.crm_ia_concierge_deterministic(cfg.data->'concierge',source);
  if source is null or (deterministic is not null and kind is distinct from deterministic) or (kind='close' and deterministic is distinct from 'close') then raise exception 'crm_ia_concierge_source_changed' using errcode='42501';end if;
  if p_action ? 'server_answer' and not coalesce(kind='answer' and (
   (p_action->>'server_answer'='audio_failure' and source->'audio_failed'='true'::jsonb)
   or (p_action->>'server_answer'='slots' and cfg.data#>'{concierge,appointment_reschedule}'='true'::jsonb)
   or (p_action->>'server_answer'='appointment_question' and (cfg.data#>'{concierge,appointment_confirm}'='true'::jsonb or cfg.data#>'{concierge,appointment_reschedule}'='true'::jsonb or cfg.data#>'{concierge,appointment_cancel}'='true'::jsonb))),false) then raise exception 'crm_ia_concierge_action_unavailable' using errcode='42501';end if;
  if kind='answer' and not private.crm_ia_concierge_faq(r.cliente_id,cfg.data) and not coalesce(
   (p_action->>'server_answer' in ('appointment_question','slots') and (cfg.data#>'{concierge,appointment_confirm}'='true'::jsonb or cfg.data#>'{concierge,appointment_reschedule}'='true'::jsonb or cfg.data#>'{concierge,appointment_cancel}'='true'::jsonb))
   or (p_action->>'server_answer'='audio_failure' and source->'audio_failed'='true'::jsonb),false) then raise exception 'crm_ia_concierge_faq_disabled' using errcode='42501';end if;
  if kind='handoff' and cfg.data->'concierge' ? 'handoff_enabled' and cfg.data#>'{concierge,handoff_enabled}' is distinct from 'true'::jsonb
   and not coalesce(p_action->'system_handoff'='true'::jsonb and p_action->>'reason' in ('calendar_unavailable','appointment_ambiguous'),false) then raise exception 'crm_ia_concierge_handoff_disabled' using errcode='42501';end if;
 end if;
 if kind is null or kind not in ('answer','qualify','handoff','close','book') or jsonb_typeof(p_action)<>'object'
  or length(coalesce(p_reply,''))>4000 then raise exception 'crm_ia_action';end if;
 fields=coalesce(l.crm_ia_fields,'{}');
 if p_action ? 'values' then
  if jsonb_typeof(p_action->'values')<>'object' or octet_length((p_action->'values')::text)>12000 then raise exception 'crm_ia_variables';end if;
  for k,v in select * from jsonb_each(p_action->'values') loop
   if not exists(select 1 from jsonb_array_elements(coalesce(rules->'variaveis','[]')) variable where variable->>'nome'=k)
    or jsonb_typeof(v)<>'string' or length(v#>>'{}')>500 then raise exception 'crm_ia_variables';end if;
   fields=jsonb_set(fields,array[k],v,true);
  end loop;
 end if;
 if kind='qualify' then
  if rules->>'tipo'<>'qualificacao' or exists(select 1 from jsonb_array_elements(coalesce(rules->'variaveis','[]')) variable
   where nullif(btrim(fields->>(variable->>'nome')),'') is null) then raise exception 'crm_ia_qualification_incomplete';end if;
  destination=coalesce(dest->>'tipo','humano');
  update public.leads set qualificado=true,updated_at=clock_timestamp() where id=l.id returning * into l;
  update public.cliente_whatsapp_contact set qualificado=true,mini_crm=coalesce(mini_crm,'{}')||'{"qualificado":"Sim"}'::jsonb,
   updated_at=clock_timestamp() where id=r.contact_id and cliente_id=r.cliente_id;
 elsif kind='handoff' then destination='humano';elsif kind='close' then destination='encerrar';end if;
 if fields is distinct from l.crm_ia_fields then update public.leads set crm_ia_fields=fields,updated_at=clock_timestamp() where id=l.id returning * into l;end if;
 if kind in ('qualify','book') then stage_key=nullif(dest->>'stage_id','')::uuid;end if;
 if kind='book' then
  if rules->>'tipo'<>'agendamento' or coalesce(r.snapshot->>'last_text','') !~* '(agend|marc|confirm|pode ser|quero esse|esse hor)' then raise exception 'crm_ia_booking_confirmation';end if;
  owner_key=coalesce(nullif(rules#>>'{agendamento,owner_id}','')::uuid,l.responsavel_id);
  appointment=private.crm_ia_book(r.cliente_id,jsonb_build_object('owner_id',owner_key,'lead_id',l.id,'contact_id',r.contact_id,
   'start_at',p_action->>'start_at','end_at',p_action->>'end_at','request_id',r.id,'title',coalesce(nullif(rules#>>'{agendamento,title}',''),'Atendimento'),
   'notes',coalesce(rules#>>'{agendamento,instructions}',''),'crm_ia_agent_id',a.id),r.actor_id);
  select * into l from public.leads where id=l.id;
  destination=coalesce(dest->>'tipo','humano');
 end if;
 if r.mode='followup' and c.ia_followup_passo+1>=coalesce(jsonb_array_length(rules->'cadencia'),0) then
  destination=coalesce(dest->>'tipo','humano');stage_key=nullif(dest->>'stage_id','')::uuid;
 end if;
 if stage_key is not null then l=jsonb_populate_record(null::public.leads,private.crm_ia_move(r.cliente_id,l.id,stage_key,coalesce(p_action->>'reason','Conclusão pelo agente CRM IA'),l.updated_at::text,r.actor_id));end if;
 if destination='agente' then
  next_agent=nullif(dest->>'agente_id','')::uuid;
  if not exists(select 1 from public.cliente_atend_ia_agentes where id=next_agent and cliente_id=r.cliente_id and ativo and funil#>>'{crm_ia,pipeline_id}'=l.pipeline_id::text
    and coalesce(funil#>'{crm_ia,stage_ids}','[]') ? l.stage_id::text) then raise exception 'crm_ia_destination';end if;
 end if;
 reply=left(btrim(coalesce(p_reply,'')),4000);
 if r.snapshot->'concierge_role'='true'::jsonb and p_action->>'server_answer'='audio_failure' then reply='Não consegui entender este áudio. Pode escrever sua mensagem ou pedir ajuda à equipe?';end if;
 if kind='book' then reply='Horário reservado para '||to_char((appointment->>'start_at')::timestamptz at time zone coalesce(cfg.data#>>'{availability,timezone}','America/Sao_Paulo'),'DD/MM/YYYY "às" HH24:MI')||'.'||case when nullif(dest->>'message','') is not null then ' '||(dest->>'message') else '' end;
 elsif destination='humano' then reply=case when r.snapshot->'concierge_role'='true'::jsonb then coalesce(nullif(cfg.data#>>'{concierge,handoff_message}',''),'Vou encaminhar seu atendimento para a equipe.') else
  coalesce(case when not(r.snapshot ? 'concierge_role') and r.snapshot->>'concierge'='true' then nullif(cfg.data#>>'{concierge,handoff_message}','') end,
   case when dest->>'tipo'='humano' then nullif(dest->>'message','') end,'Vou encaminhar seu atendimento para a equipe.') end;
 elsif destination='encerrar' then reply='Tudo bem. Este atendimento foi encerrado. Se precisar, envie uma nova mensagem.';
 elsif reply ~* '(agendad|reservad|compromisso.{0,20}confirm|etapa.{0,20}mov)' then reply='Posso conferir os próximos passos com você. Qual é sua preferência?';end if;
 if reply='' then raise exception 'crm_ia_empty_reply';end if;
 update public.cliente_atend_conversas set status=case when destination='encerrar' then 'finalizado' when destination='humano' then 'esperando' else 'entrada' end,
  ia_pausada=coalesce(destination='humano',false),status_at=clock_timestamp(),ia_followup_due_at=null,
  ia_followup_whatsapp_config_id=r.channel_id,ia_followup_claim_token=null,ia_followup_claim_snapshot=null,ia_followup_delivery_state='pending',
  crm_ia_runtime=c.crm_ia_runtime||jsonb_build_object('active',true,'agent_id',a.id,'next_agent_id',next_agent,'delivery_run_id',r.id,'config_revision',cfg.revision,
   'closed',destination='encerrar','channel_id',r.channel_id,'pending_followup',case when destination in ('humano','encerrar') then '{}'::jsonb else p_followup end),
  updated_at=clock_timestamp() where id=c.id returning updated_at into stamp;
 if destination='encerrar' then update public.crm_ia_outbox set status='cancelled',error_code='conversation_closed'
  where cliente_id=r.cliente_id and contact_id=r.contact_id and public.crm_ia_outbox.kind<>'manual' and status='pending';end if;
 insert into public.crm_ia_outbox(cliente_id,whatsapp_config_id,contact_id,lead_id,kind,body,scheduled_at,request_id,created_by,source_updated_at,config_revision,agent_run_id)
 values(r.cliente_id,r.channel_id,r.contact_id,l.id,case when r.mode='followup' then 'followup' else 'reply' end,reply,clock_timestamp(),r.id,r.actor_id,stamp,cfg.revision,r.id) returning id into outbox;
 if appointment is not null then
  for reminder in select value from jsonb_array_elements(coalesce(rules#>'{agendamento,reminders}','[]')) loop
   if reminder->>'unidade' not in ('horas','dias') then raise exception 'crm_ia_reminder_interval';end if;
   hours_n=(reminder->>'valor')::numeric*case when reminder->>'unidade'='dias' then 24 else 1 end;
   if hours_n<=0 or hours_n>8760 then raise exception 'crm_ia_reminder_interval';end if;
   reminder_at=(appointment->>'start_at')::timestamptz-hours_n*interval '1 hour';
   if reminder_at>clock_timestamp() then
    insert into public.crm_ia_outbox(cliente_id,whatsapp_config_id,contact_id,lead_id,kind,body,scheduled_at,request_id,created_by,source_updated_at,config_revision,agent_run_id,appointment_id)
    values(r.cliente_id,r.channel_id,r.contact_id,l.id,'reminder','Lembrete: seu atendimento está reservado para '||to_char((appointment->>'start_at')::timestamptz at time zone coalesce(cfg.data#>>'{availability,timezone}','America/Sao_Paulo'),'DD/MM/YYYY "às" HH24:MI')||'.',
     reminder_at,md5(r.id::text||':reminder:'||reminder_at::text)::uuid,r.actor_id,(appointment->>'updated_at')::timestamptz,cfg.revision,r.id,(appointment->>'id')::uuid)
    on conflict(cliente_id,created_by,request_id) do nothing;
   end if;
  end loop;
 end if;
 update planeje_private.crm_ia_agent_runs set status='queued',result=jsonb_build_object('handled',true,'typed',true,'queued',true,'outbox_id',outbox,'resposta',reply,'action',kind,'lead_updated_at',l.updated_at,'appointment',appointment) where id=r.id returning result into target;
 return target;
end $$;

CREATE OR REPLACE FUNCTION private.crm_ia_calendar_outbox_state(p_item public.crm_ia_outbox) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE r planeje_private.crm_ia_agent_runs;a public.crm_ia_appointments;g public.cliente_atend_ia_agentes;l public.leads;c public.cliente_atend_conversas;
 cfg public.crm_ia_config;receipt jsonb;proposal jsonb;operation text;reason text;confirmation jsonb;version timestamptz;jid text;key text;
BEGIN
 SELECT * INTO r FROM planeje_private.crm_ia_agent_runs WHERE id=p_item.agent_run_id;
 IF coalesce(r.result->>'action','') NOT IN ('appointment_propose','appointment_confirm','appointment_reschedule','appointment_cancel','no_show_recover') THEN
  RETURN private.crm_ia_calendar_outbox_state_pre_appointments(p_item); END IF;
 SELECT * INTO cfg FROM public.crm_ia_config WHERE cliente_id=p_item.cliente_id;
 SELECT * INTO c FROM public.cliente_atend_conversas WHERE cliente_id=p_item.cliente_id AND contact_id=p_item.contact_id;
 SELECT * INTO g FROM public.cliente_atend_ia_agentes WHERE id=r.agent_id AND cliente_id=r.cliente_id;
 SELECT * INTO l FROM public.leads WHERE id=r.lead_id AND cliente_id=r.cliente_id;
 SELECT from_jid INTO jid FROM public.cliente_whatsapp_contact WHERE id=p_item.contact_id AND cliente_id=p_item.cliente_id;
 IF r.status<>'queued' OR r.cliente_id IS DISTINCT FROM p_item.cliente_id OR r.channel_id IS DISTINCT FROM p_item.whatsapp_config_id
  OR r.contact_id IS DISTINCT FROM p_item.contact_id OR r.lead_id IS DISTINCT FROM p_item.lead_id OR r.actor_id IS DISTINCT FROM p_item.created_by
  OR (p_item.kind<>'reminder' AND (r.result->>'outbox_id' IS DISTINCT FROM p_item.id::text OR p_item.request_id IS DISTINCT FROM r.id))
  OR NOT private.crm_ia_appointment_actor(r.cliente_id,r.channel_id,r.contact_id,r.lead_id,r.actor_id) OR NOT private.crm_ia_agent_actor(r.cliente_id,cfg.updated_by)
  OR cfg.data#>>'{concierge,enabled}' IS DISTINCT FROM 'true' OR cfg.revision IS DISTINCT FROM p_item.config_revision
  OR cfg.revision IS DISTINCT FROM (r.snapshot->>'config_revision')::uuid OR NOT coalesce(g.ativo AND g.auto_responder,false)
  OR g.updated_at IS DISTINCT FROM (r.snapshot->>'agent_updated_at')::timestamptz OR g.funil#>>'{crm_ia,pipeline_id}' IS DISTINCT FROM l.pipeline_id::text
  OR (CASE WHEN r.snapshot->'concierge_role'='true'::jsonb THEN NOT private.crm_ia_concierge_role(r.cliente_id,r.agent_id,l,c,cfg.data,r.snapshot,r.mode,r.created_at) ELSE NOT coalesce(g.funil#>'{crm_ia,stage_ids}','[]') ? l.stage_id::text END)
  OR (p_item.kind<>'reminder' AND l.updated_at IS DISTINCT FROM (r.result->>'lead_updated_at')::timestamptz) THEN reason:='appointment_actor_or_config_changed'; END IF;
 IF reason IS NULL THEN reason:=planeje_private.crm_ia_delivery_config(r.cliente_id,planeje_private.crm_ia_delivery_target(r.cliente_id,r.channel_id,r.contact_id)->>'phone',cfg.revision,true); END IF;
 IF reason IS NULL AND (c.id IS NULL OR (p_item.kind<>'reminder' AND c.updated_at IS DISTINCT FROM p_item.source_updated_at)
  OR ((c.ia_pausada OR c.status='finalizado') AND (NOT p_item.calendar_fallback OR c.crm_ia_runtime->>'delivery_run_id' IS DISTINCT FROM r.id::text))
  OR nullif(c.crm_ia_runtime->>'last_human_at','')::timestamptz>p_item.created_at
  OR nullif(c.crm_ia_runtime->>'last_staff_change_at','')::timestamptz>p_item.created_at
  OR EXISTS(SELECT 1 FROM public.cliente_whatsapp_inbox i WHERE i.cliente_id=r.cliente_id AND i.whatsapp_config_id=r.channel_id AND NOT coalesce(i.is_group,false)
   AND coalesce(nullif(i.chat_jid,''),i.from_jid)=jid AND i.created_at>p_item.created_at)) THEN reason:='appointment_source_changed'; END IF;
 IF reason IS NULL AND r.result->>'action'='no_show_recover' THEN
  reason:=private.crm_ia_no_show_reason(r.cliente_id,r.contact_id,r.channel_id,r.agent_id,r.actor_id);
  IF reason IS NULL AND (p_item.kind<>'followup' OR p_item.appointment_id IS NOT NULL OR p_item.calendar_appointment_id IS NOT NULL) THEN reason:='no_show_purpose_changed'; END IF;
 ELSIF reason IS NULL AND r.result->>'action'='appointment_propose' THEN
  proposal:=c.crm_ia_runtime->'pending_appointment_action';
  SELECT * INTO a FROM public.crm_ia_appointments WHERE id=nullif(proposal->>'appointment_id','')::uuid;
  IF proposal->>'question_outbox_id' IS DISTINCT FROM p_item.id::text OR proposal->>'id' IS DISTINCT FROM r.result->>'confirmation_id'
   OR proposal->>'channel_id' IS DISTINCT FROM r.channel_id::text OR (proposal->>'expires_at')::timestamptz<=clock_timestamp()
   OR a.id IS NULL OR a.cliente_id IS DISTINCT FROM r.cliente_id OR a.contact_id IS DISTINCT FROM r.contact_id OR a.lead_id IS DISTINCT FROM r.lead_id
   OR a.updated_at IS DISTINCT FROM (proposal->>'appointment_updated_at')::timestamptz OR a.owner_id::text IS DISTINCT FROM proposal->>'owner_id'
   OR NOT private.crm_ia_calendar_owner(r.cliente_id,a.owner_id,r.lead_id,r.contact_id)
   OR cfg.data->'concierge'->>('appointment_'||(proposal->>'operation')) IS DISTINCT FROM 'true' THEN reason:='appointment_proposal_expired_or_changed'; END IF;
 ELSIF reason IS NULL THEN
  receipt:=r.result->'operation_receipt';operation:=receipt->>'operation';
  SELECT * INTO a FROM public.crm_ia_appointments WHERE id=coalesce(p_item.calendar_appointment_id,p_item.appointment_id);
  version:=coalesce(p_item.calendar_source_updated_at,p_item.source_updated_at);
  IF receipt IS NULL OR operation NOT IN ('confirm','reschedule','cancel') OR r.result->>'action' IS DISTINCT FROM 'appointment_'||operation
   OR receipt->>'run_id' IS DISTINCT FROM r.id::text OR receipt->>'actor_id' IS DISTINCT FROM r.actor_id::text
   OR a.id IS NULL OR a.cliente_id IS DISTINCT FROM r.cliente_id OR a.contact_id IS DISTINCT FROM r.contact_id OR a.lead_id IS DISTINCT FROM r.lead_id
   OR a.id::text IS DISTINCT FROM receipt#>>'{after,id}' OR a.updated_at IS DISTINCT FROM version OR version IS DISTINCT FROM (receipt#>>'{after,updated_at}')::timestamptz
   OR NOT private.crm_ia_calendar_owner(r.cliente_id,a.owner_id,r.lead_id,r.contact_id)
   OR cfg.data->'concierge'->>('appointment_'||operation) IS DISTINCT FROM 'true' THEN reason:='appointment_operation_changed'; END IF;
  FOREACH key IN ARRAY ARRAY['id','cliente_id','contact_id','lead_id','owner_id','created_by','request_id'] LOOP
   IF to_jsonb(a)->key IS DISTINCT FROM receipt->'after'->key OR receipt->'before'->key IS DISTINCT FROM receipt->'after'->key THEN reason:='appointment_identity_changed'; END IF;
  END LOOP;
  IF reason IS NULL AND ((operation='cancel' AND (a.status<>'cancelled' OR p_item.kind='reminder'))
   OR (operation IN ('confirm','reschedule') AND (a.status NOT IN ('scheduled','confirmed') OR a.start_at<=clock_timestamp()))) THEN reason:='appointment_state_changed'; END IF;
  IF reason IS NULL THEN
   confirmation:=private.crm_ia_calendar_confirmation(a.id);
   IF (confirmation->>'source_version')::timestamptz IS DISTINCT FROM version THEN reason:='calendar_source_changed';
   ELSIF p_item.calendar_fallback OR confirmation->>'required'='false' OR (confirmation->>'state'='ready' AND confirmation->>'verified'='true'
    AND CASE WHEN operation='cancel' THEN confirmation->>'cancelled'='true' ELSE confirmation->>'confirmed'='true' END) THEN
    RETURN jsonb_build_object('linked',true,'eligible',true,'allowed',true,'calendar',confirmation);
   ELSIF confirmation->>'state'='failed' OR confirmation->>'status' IN ('failed','conflict','uncertain','error') THEN
    RETURN jsonb_build_object('linked',true,'eligible',true,'allowed',false,'terminal',true,'reason','calendar_confirmation_unavailable','calendar',confirmation);
   ELSE RETURN '{"linked":true,"eligible":false,"allowed":false,"reason":"calendar_confirmation_pending"}'; END IF;
  END IF;
 END IF;
 RETURN jsonb_build_object('linked',true,'eligible',true,'allowed',reason IS NULL,'reason',reason);
END $$;

CREATE OR REPLACE FUNCTION public.crm_ia_delivery_recheck_pre_voice(p_id uuid,p_claim_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item public.crm_ia_outbox;r planeje_private.crm_ia_agent_runs;a public.cliente_atend_ia_agentes;l public.leads;appointment public.crm_ia_appointments;c public.cliente_atend_conversas;cfg public.crm_ia_config;
begin
 select * into item from public.crm_ia_outbox where id=p_id;
 if item.agent_run_id is not null then
  select * into r from planeje_private.crm_ia_agent_runs where id=item.agent_run_id;
  select * into a from public.cliente_atend_ia_agentes where id=r.agent_id;
  select * into l from public.leads where id=r.lead_id;
  select * into cfg from public.crm_ia_config where cliente_id=r.cliente_id;
  select * into c from public.cliente_atend_conversas where cliente_id=r.cliente_id and contact_id=r.contact_id;
  if r.id is null or not private.crm_ia_agent_actor(r.cliente_id,r.actor_id) or not a.ativo or not a.auto_responder
   or a.updated_at is distinct from (r.snapshot->>'agent_updated_at')::timestamptz or (item.kind<>'reminder' and l.updated_at is distinct from (r.result->>'lead_updated_at')::timestamptz)
   or (not coalesce(case when r.snapshot ? 'concierge_role' then r.snapshot->'concierge_role'='true'::jsonb else r.snapshot->'concierge'='true'::jsonb end,false) and not private.crm_ia_agent_window(a.funil->'crm_ia',coalesce((select data#>>'{availability,timezone}' from public.crm_ia_config where cliente_id=item.cliente_id),'America/Sao_Paulo')))
   or (r.snapshot->'concierge_role'='true'::jsonb and (not private.crm_ia_concierge_role(r.cliente_id,r.agent_id,l,c,cfg.data,r.snapshot,r.mode,r.created_at)
    or not private.crm_ia_appointment_actor(r.cliente_id,r.channel_id,r.contact_id,r.lead_id,r.actor_id))) then
   update public.crm_ia_outbox set status='cancelled',error_code='agent_changed' where id=p_id and status='sending' and claim_token=p_claim_token;
   return '{"allowed":false,"reason":"agent_changed"}';end if;
  if item.appointment_id is not null then
   select * into appointment from public.crm_ia_appointments where id=item.appointment_id and cliente_id=item.cliente_id;
   select * into c from public.cliente_atend_conversas where cliente_id=item.cliente_id and contact_id=item.contact_id;
   if appointment.id is null or appointment.status not in ('scheduled','confirmed') or appointment.start_at<=clock_timestamp()
    or appointment.updated_at is distinct from item.source_updated_at or c.ia_pausada or c.status='finalizado' then
    update public.crm_ia_outbox set status='cancelled',error_code='appointment_changed' where id=p_id and status='sending' and claim_token=p_claim_token;
    return '{"allowed":false,"reason":"appointment_changed"}';end if;
  end if;
 end if;
 return public.crm_ia_delivery_recheck_base(p_id,p_claim_token);
end $$;

CREATE OR REPLACE FUNCTION private.crm_ia_audio_target(p_client uuid,p_channel uuid,p_contact uuid,p_message text,p_agent uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.cliente_whatsapp_contact;s public.cliente_atend_conversas;i public.cliente_whatsapp_inbox;l public.leads;
  cfg public.crm_ia_config;a public.cliente_atend_ia_agentes;channel public.cliente_whatsapp_config;ids uuid[];target jsonb;entry jsonb;pipeline_key uuid;stage_key uuid;selection jsonb;
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
  IF l.id IS NOT NULL AND EXISTS(SELECT 1 FROM public.profiles p JOIN public.user_module_access m ON m.user_id=p.id
    WHERE p.id=cfg.updated_by AND p.role='colaborador' AND m.module_name::text='crm' AND m.access_level::text='responsible'
     AND l.responsavel_id IS DISTINCT FROM p.id) THEN RETURN '{"allowed":false,"reason":"audio_lead_scope"}'; END IF;
  pipeline_key:=l.pipeline_id;stage_key:=l.stage_id;
  IF l.id IS NULL THEN
    SELECT value INTO entry FROM jsonb_array_elements(coalesce(cfg.data#>'{entry,channels}','[]')) x WHERE x->>'channel_id'=p_channel::text AND x->>'enabled'='true';
    IF cfg.data#>>'{entry,enabled}' IS DISTINCT FROM 'true' OR entry IS NULL OR entry->>'mode' NOT IN ('all','phrase')
      OR (entry->>'mode'='phrase' AND nullif(btrim(entry->>'phrase'),'') IS NULL) THEN RETURN '{"allowed":false,"reason":"entry_disabled"}'; END IF;
    pipeline_key:=(entry->>'pipeline_id')::uuid;stage_key:=(entry->>'stage_id')::uuid;
    IF NOT EXISTS(SELECT 1 FROM public.crm_stages st JOIN public.crm_pipelines p ON p.id=st.pipeline_id WHERE st.id=stage_key AND p.id=pipeline_key AND p.cliente_id=p_client) THEN RETURN '{"allowed":false,"reason":"entry_scope"}'; END IF;
  END IF;
  selection:=private.crm_ia_inbound_agent(p_client,pipeline_key,stage_key,l.responsavel_id,s.crm_ia_runtime,cfg.data,clock_timestamp());
  IF p_agent IS NOT NULL AND selection->>'agent_id' IS DISTINCT FROM p_agent::text THEN RETURN '{"allowed":false,"reason":"audio_context_changed"}'; END IF;
  SELECT * INTO a FROM public.cliente_atend_ia_agentes WHERE id=(selection->>'agent_id')::uuid AND cliente_id=p_client;
  IF a.id IS NULL OR NOT EXISTS(SELECT 1 FROM planeje_private.crm_ia_voice_authorizations v JOIN public.profiles p ON p.id=v.actor_id AND p.status='active' AND p.role IN ('admin','superadmin')
    WHERE v.agent_id=a.id AND v.agent_updated_at=a.updated_at AND v.settings=a.funil#>'{crm_ia,audio}' AND v.settings->>'input_enabled'='true' AND private.crm_ia_agent_actor(p_client,v.actor_id))
    THEN RETURN '{"allowed":false,"reason":"audio_input_disabled"}'; END IF;
  RETURN jsonb_build_object('allowed',true,'inbox_id',i.id,'agent_id',a.id,'actor_id',cfg.updated_by,'config_revision',cfg.revision,
    'agent_updated_at',a.updated_at,'concierge_role',selection->'concierge_role','conversation_updated_at',s.updated_at,'lead_id',l.id,'lead_updated_at',l.updated_at,
    'contact_updated_at',c.updated_at,'channel_updated_at',to_jsonb(channel)->'updated_at');
END $$;

CREATE OR REPLACE FUNCTION public.crm_ia_audio_begin(p_client uuid,p_channel uuid,p_contact uuid,p_message text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target jsonb;job planeje_private.crm_ia_audio_inputs;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('crm-ia-audio:'||p_client::text||':'||p_channel::text||':'||coalesce(p_message,''),0));
  target:=private.crm_ia_audio_target(p_client,p_channel,p_contact,p_message);
  IF target->>'allowed' IS DISTINCT FROM 'true' THEN RETURN target; END IF;
  SELECT * INTO job FROM planeje_private.crm_ia_audio_inputs WHERE inbox_id=(target->>'inbox_id')::uuid FOR UPDATE;
  IF job.id IS NOT NULL THEN
    IF job.cliente_id<>p_client OR job.channel_id<>p_channel OR job.contact_id<>p_contact OR job.agent_id::text<>target->>'agent_id'
      OR job.snapshot->>'config_revision' IS DISTINCT FROM target->>'config_revision' OR job.snapshot->>'agent_updated_at' IS DISTINCT FROM target->>'agent_updated_at' OR job.snapshot->'concierge_role' IS DISTINCT FROM target->'concierge_role' THEN RETURN '{"allowed":false,"reason":"audio_context_changed"}'; END IF;
    IF job.status='claimed' AND job.created_at<clock_timestamp()-interval '5 minutes' THEN
      UPDATE planeje_private.crm_ia_audio_inputs SET status='failed',error_code='audio_lease_expired',updated_at=clock_timestamp() WHERE id=job.id RETURNING * INTO job;
    END IF;
    IF job.status IN ('completed','failed') THEN RETURN jsonb_build_object('allowed',true,'cached',true,'status',job.status,'transcript',job.transcript,'error_code',job.error_code,'authorization',jsonb_build_object('agent_id',target->'agent_id','agent_updated_at',target->'agent_updated_at','config_revision',target->'config_revision','concierge_role',target->'concierge_role')); END IF;
    RETURN '{"allowed":false,"reason":"audio_already_processing"}';
  END IF;
  INSERT INTO planeje_private.crm_ia_audio_inputs(inbox_id,cliente_id,channel_id,contact_id,agent_id,message_id,snapshot)
    VALUES((target->>'inbox_id')::uuid,p_client,p_channel,p_contact,(target->>'agent_id')::uuid,p_message,target) RETURNING * INTO job;
  RETURN jsonb_build_object('allowed',true,'id',job.id,'claim_token',job.claim_token,'authorization',jsonb_build_object('agent_id',target->'agent_id','agent_updated_at',target->'agent_updated_at','config_revision',target->'config_revision','concierge_role',target->'concierge_role'));
END $$;
-- New entry points inherit no execution grants, including custom default privileges.
DO $$
DECLARE item record;grantee record;owner_name text;
BEGIN
 SELECT pg_get_userbyid(proowner) INTO owner_name FROM pg_catalog.pg_proc WHERE oid='public.crm_ia_agent_begin_pre_appointments(uuid,uuid,uuid,uuid,uuid,text,text,jsonb)'::regprocedure;
 FOR item IN SELECT p.oid,p.oid::regprocedure AS signature FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE
  (n.nspname='private' AND p.proname IN ('crm_ia_concierge_config_guard','crm_ia_concierge_available','crm_ia_agent_window_at','crm_ia_inbound_agent','crm_ia_concierge_role','crm_ia_concierge_source','crm_ia_concierge_deterministic','crm_ia_concierge_faq'))
  OR (n.nspname='public' AND p.proname='crm_ia_appointment_slots_for_run') LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO %I',item.signature,owner_name);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',item.signature);
  FOR grantee IN SELECT DISTINCT r.rolname FROM pg_catalog.pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a JOIN pg_catalog.pg_roles r ON r.oid=a.grantee WHERE p.oid=item.oid AND a.grantee<>p.proowner LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',item.signature,grantee.rolname);
  END LOOP;
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.crm_ia_appointment_slots_for_run(uuid,uuid,date,timestamptz) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
