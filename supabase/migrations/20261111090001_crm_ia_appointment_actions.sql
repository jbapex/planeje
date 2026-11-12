BEGIN;
CREATE FUNCTION private.crm_ia_appointment_actor(p_client uuid,p_channel uuid,p_contact uuid,p_lead uuid,p_actor uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(private.crm_ia_agent_actor(p_client,p_actor) AND public.cliente_atend_loja_habilitada(p_client)
  AND planeje_private.crm_ia_delivery_target(p_client,p_channel,p_contact)->>'allowed'='true'
  AND public.atendimento_user_can_send_on_whatsapp_config(p_actor,p_client,p_channel)
  AND EXISTS(SELECT 1 FROM public.leads l WHERE l.id=p_lead AND l.cliente_id=p_client AND l.crm_ia_contact_id=p_contact AND l.crm_ia_archived_at IS NULL)
  AND NOT EXISTS(SELECT 1 FROM public.profiles p JOIN public.leads l ON l.id=p_lead AND l.cliente_id=p_client WHERE p.id=p_actor AND p.role='colaborador' AND l.responsavel_id IS DISTINCT FROM p_actor
   AND EXISTS(SELECT 1 FROM public.user_module_access m WHERE m.user_id=p_actor AND m.module_name::text='crm' AND m.access_level::text='responsible'))
  AND (coalesce((SELECT m.is_enabled FROM public.user_module_permissions m WHERE m.user_id=p_actor AND m.module_name::text='atendimento'),(SELECT m.is_enabled FROM public.module_settings m WHERE m.module_name::text='atendimento'),true)
   OR coalesce((SELECT m.is_enabled FROM public.user_module_permissions m WHERE m.user_id=p_actor AND m.module_name::text='rastreamento'),(SELECT m.is_enabled FROM public.module_settings m WHERE m.module_name::text='rastreamento'),true))
  AND NOT EXISTS(SELECT 1 FROM public.cliente_atend_conversas c JOIN public.profiles p ON p.id=p_actor WHERE c.cliente_id=p_client AND c.contact_id=p_contact
   AND ((c.privado AND c.assigned_to IS DISTINCT FROM p_actor AND p.role<>'superadmin') OR (p.role='colaborador' AND c.assigned_to IS DISTINCT FROM p_actor
    AND EXISTS(SELECT 1 FROM public.user_module_access m WHERE m.user_id=p_actor AND m.module_name::text='crm' AND m.access_level::text='responsible')))),false)
$$;
REVOKE ALL ON FUNCTION private.crm_ia_appointment_actor(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.crm_ia_appointment_run(p_run uuid) RETURNS jsonb
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
  OR NOT coalesce(a.funil#>'{crm_ia,stage_ids}','[]') ? l.stage_id::text
  OR planeje_private.crm_ia_delivery_config(r.cliente_id,target->>'phone',cfg.revision,true) IS NOT NULL THEN RAISE EXCEPTION 'crm_ia_appointment_scope_or_snapshot' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('run',to_jsonb(r),'conversation',to_jsonb(c),'lead',to_jsonb(l),'agent',to_jsonb(a),'config',to_jsonb(cfg));
END $$;
REVOKE ALL ON FUNCTION private.crm_ia_appointment_run(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.crm_ia_appointment_context(p_client uuid,p_channel uuid,p_contact uuid,p_lead uuid,p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE rows jsonb;proposal jsonb;settings jsonb;
BEGIN
 IF NOT private.crm_ia_appointment_actor(p_client,p_channel,p_contact,p_lead,p_actor) THEN RETURN '{"rows":[],"proposal":null}'; END IF;
 SELECT data INTO settings FROM public.crm_ia_config WHERE cliente_id=p_client;
 IF settings#>>'{concierge,enabled}' IS DISTINCT FROM 'true' THEN RETURN '{"rows":[],"proposal":null}'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') INTO rows FROM(SELECT a.id,a.updated_at,a.title,a.start_at,a.end_at,a.status,a.owner_id,
  coalesce(settings#>>'{availability,timezone}','America/Sao_Paulo') AS timezone FROM public.crm_ia_appointments a
  WHERE a.cliente_id=p_client AND a.contact_id=p_contact AND a.lead_id=p_lead AND private.crm_ia_calendar_owner(p_client,a.owner_id,p_lead,p_contact)
   AND ((a.status IN ('scheduled','confirmed') AND a.end_at>clock_timestamp()-interval '30 days') OR (a.status='no_show' AND a.end_at>clock_timestamp()-interval '30 days'))
  ORDER BY a.start_at DESC,a.id LIMIT 20) q;
 SELECT crm_ia_runtime->'pending_appointment_action' INTO proposal FROM public.cliente_atend_conversas WHERE cliente_id=p_client AND contact_id=p_contact;
 IF proposal->>'channel_id' IS DISTINCT FROM p_channel::text OR (proposal->>'expires_at')::timestamptz<=clock_timestamp() THEN proposal:=NULL; END IF;
 RETURN jsonb_build_object('rows',rows,'proposal',CASE WHEN proposal IS NULL THEN NULL ELSE jsonb_build_object('id',proposal->'id','operation',proposal->'operation','appointment_id',proposal->'appointment_id') END);
END $$;
REVOKE ALL ON FUNCTION public.crm_ia_appointment_context(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_ia_appointment_context(uuid,uuid,uuid,uuid,uuid) TO service_role;

CREATE FUNCTION private.crm_ia_appointment_rules(p_agent uuid,p_appointment uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN g.funil#>>'{crm_ia,tipo}'='agendamento' THEN coalesce(g.funil#>'{crm_ia,agendamento}','{}')
  ELSE jsonb_build_object('duration_minutes',extract(epoch FROM a.end_at-a.start_at)/60) END
 FROM public.cliente_atend_ia_agentes g JOIN public.crm_ia_appointments a ON a.cliente_id=g.cliente_id WHERE g.id=p_agent AND a.id=p_appointment
$$;
REVOKE ALL ON FUNCTION private.crm_ia_appointment_rules(uuid,uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.crm_ia_appointment_slots(p_client uuid,p_channel uuid,p_contact uuid,p_lead uuid,p_agent uuid,p_actor uuid,p_appointment uuid,p_date date,p_expected timestamptz) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.crm_ia_appointments;g public.cliente_atend_ia_agentes;
BEGIN
 SELECT * INTO a FROM public.crm_ia_appointments WHERE id=p_appointment AND cliente_id=p_client AND contact_id=p_contact AND lead_id=p_lead;
 SELECT * INTO g FROM public.cliente_atend_ia_agentes WHERE id=p_agent AND cliente_id=p_client;
 IF a.id IS NULL OR a.updated_at IS DISTINCT FROM p_expected OR a.status NOT IN ('scheduled','confirmed','no_show')
  OR NOT private.crm_ia_appointment_actor(p_client,p_channel,p_contact,p_lead,p_actor) OR NOT private.crm_ia_calendar_owner(p_client,a.owner_id,p_lead,p_contact)
  OR NOT coalesce(g.ativo AND g.auto_responder,false) OR NOT EXISTS(SELECT 1 FROM public.leads l WHERE l.id=p_lead AND g.funil#>>'{crm_ia,pipeline_id}'=l.pipeline_id::text AND coalesce(g.funil#>'{crm_ia,stage_ids}','[]') ? l.stage_id::text) THEN
  RAISE EXCEPTION 'crm_ia_appointment_slots_scope' USING ERRCODE='42501'; END IF;
 RETURN private.crm_ia_slots(p_client,a.owner_id,p_date,a.id,private.crm_ia_appointment_rules(p_agent,a.id));
END $$;
REVOKE ALL ON FUNCTION public.crm_ia_appointment_slots(uuid,uuid,uuid,uuid,uuid,uuid,uuid,date,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_ia_appointment_slots(uuid,uuid,uuid,uuid,uuid,uuid,uuid,date,timestamptz) TO service_role;

-- The webhook substitutes NOW for missing/invalid raw timestamps; that fallback never proves consent.
CREATE FUNCTION private.crm_ia_original_message_time(p_raw jsonb,p_normalized timestamptz) RETURNS timestamptz
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE root jsonb:=coalesce(p_raw,'{}');payload jsonb;value jsonb;number numeric;stamp timestamptz;answer timestamptz;
BEGIN
 payload:=CASE WHEN jsonb_typeof(root->'data')='object' THEN root->'data' ELSE root END;
 FOR value IN SELECT v FROM (VALUES(payload->'messageTimestamp'),(payload->'timestamp'),(root->'messageTimestamp'),(root->'timestamp')) x(v) WHERE v IS NOT NULL AND v<>'null'::jsonb LOOP
  IF jsonb_typeof(value) NOT IN ('number','string') OR value#>>'{}' !~ '^[0-9]+(\.[0-9]+)?$' THEN RETURN NULL; END IF;
  number:=(value#>>'{}')::numeric;stamp:=to_timestamp((number/CASE WHEN number>1000000000000 THEN 1000 ELSE 1 END)::double precision);
  IF stamp<'2000-01-01'::timestamptz OR stamp>clock_timestamp()+interval '2 minutes' OR (answer IS NOT NULL AND abs(extract(epoch FROM stamp-answer))>0.001) THEN RETURN NULL; END IF;
  answer:=stamp;
 END LOOP;
 IF answer IS NULL OR p_normalized IS NULL OR abs(extract(epoch FROM answer-p_normalized))>0.001 THEN RETURN NULL; END IF;
 RETURN answer;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION private.crm_ia_original_message_time(jsonb,timestamptz) FROM PUBLIC,anon,authenticated;

-- Authenticated human writes invalidate pending consent. The existing state guard runs first and
-- strips forged runtime fields; only the trusted mark-no-show RPC can introduce a new recovery marker.
CREATE FUNCTION private.crm_ia_appointment_human_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE stamp timestamptz:=clock_timestamp();
BEGIN
 IF auth.uid() IS NOT NULL THEN
  NEW.crm_ia_runtime:=NEW.crm_ia_runtime-'pending_appointment_action';
  IF NEW.crm_ia_runtime->'no_show' IS DISTINCT FROM OLD.crm_ia_runtime->'no_show' AND NEW.crm_ia_runtime->'no_show' IS NOT NULL THEN
   NEW.crm_ia_runtime:=jsonb_set(NEW.crm_ia_runtime,'{no_show,staff_change_at}',to_jsonb(stamp));
  ELSIF OLD.crm_ia_runtime ? 'no_show' THEN NEW.crm_ia_runtime:=NEW.crm_ia_runtime-'no_show';NEW.ia_followup_due_at:=NULL;NEW.ia_followup_delivery_state:='cancelled'; END IF;
  NEW.crm_ia_runtime:=NEW.crm_ia_runtime||jsonb_build_object('last_staff_change_at',stamp);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.crm_ia_appointment_human_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER crm_ia_appointment_human_guard BEFORE UPDATE ON public.cliente_atend_conversas FOR EACH ROW EXECUTE FUNCTION private.crm_ia_appointment_human_guard();

CREATE FUNCTION private.crm_ia_no_show_reason(p_client uuid,p_contact uuid,p_channel uuid,p_agent uuid,p_actor uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.cliente_atend_conversas;a public.crm_ia_appointments;g public.cliente_atend_ia_agentes;cfg public.crm_ia_config;l public.leads;m jsonb;jid text;reason text;
BEGIN
 SELECT * INTO c FROM public.cliente_atend_conversas WHERE cliente_id=p_client AND contact_id=p_contact;m:=c.crm_ia_runtime->'no_show';
 SELECT * INTO a FROM public.crm_ia_appointments WHERE id=nullif(m->>'appointment_id','')::uuid AND cliente_id=p_client AND contact_id=p_contact;
 SELECT * INTO l FROM public.leads WHERE id=a.lead_id AND cliente_id=p_client;
 SELECT * INTO cfg FROM public.crm_ia_config WHERE cliente_id=p_client;
 SELECT * INTO g FROM public.cliente_atend_ia_agentes WHERE id=p_agent AND cliente_id=p_client;
 SELECT from_jid INTO jid FROM public.cliente_whatsapp_contact WHERE id=p_contact AND cliente_id=p_client;
 IF m IS NULL OR m->>'state' NOT IN ('pending','queued') OR m->>'channel_id' IS DISTINCT FROM p_channel::text OR m->>'agent_id' IS DISTINCT FROM p_agent::text OR m->>'actor_id' IS DISTINCT FROM p_actor::text THEN RETURN 'no_show_marker_changed'; END IF;
 IF a.id IS NULL OR a.status<>'no_show' OR a.updated_at IS DISTINCT FROM (m->>'appointment_updated_at')::timestamptz OR l.crm_ia_archived_at IS NOT NULL
  OR NOT private.crm_ia_calendar_owner(p_client,a.owner_id,a.lead_id,p_contact) THEN RETURN 'no_show_appointment_changed'; END IF;
 IF (m->>'expires_at')::timestamptz<=clock_timestamp() OR c.ia_pausada OR c.status='finalizado'
  OR c.crm_ia_runtime->'last_staff_change_at' IS DISTINCT FROM m->'staff_change_at'
  OR nullif(c.crm_ia_runtime->>'last_human_at','')::timestamptz>(m->>'marked_at')::timestamptz
  OR EXISTS(SELECT 1 FROM public.cliente_whatsapp_inbox i WHERE i.cliente_id=p_client AND i.whatsapp_config_id=p_channel AND NOT coalesce(i.is_group,false)
    AND coalesce(nullif(i.chat_jid,''),i.from_jid)=jid AND i.created_at>(m->>'marked_at')::timestamptz)
  OR EXISTS(SELECT 1 FROM public.cliente_whatsapp_sent s WHERE s.cliente_id=p_client AND s.whatsapp_config_id=p_channel AND coalesce(nullif(s.chat_jid,''),s.to_jid)=jid
    AND coalesce(s.sender_kind,'human')='human' AND s.created_at>(m->>'marked_at')::timestamptz) THEN RETURN 'no_show_source_changed'; END IF;
 IF cfg.revision IS DISTINCT FROM (m->>'config_revision')::uuid OR cfg.data#>>'{attendance,auto_send}' IS DISTINCT FROM 'true'
  OR cfg.data#>>'{concierge,enabled}' IS DISTINCT FROM 'true' OR cfg.data#>>'{concierge,no_show_recovery}' IS DISTINCT FROM 'true'
  OR NOT private.crm_ia_agent_actor(p_client,cfg.updated_by) OR NOT private.crm_ia_appointment_actor(p_client,p_channel,p_contact,a.lead_id,p_actor)
  OR NOT coalesce(g.ativo AND g.auto_responder,false) OR g.updated_at IS DISTINCT FROM (m->>'agent_updated_at')::timestamptz
  OR g.funil#>>'{crm_ia,pipeline_id}' IS DISTINCT FROM l.pipeline_id::text OR NOT coalesce(g.funil#>'{crm_ia,stage_ids}','[]') ? l.stage_id::text
  OR NOT private.crm_ia_agent_window(g.funil->'crm_ia',coalesce(cfg.data#>>'{availability,timezone}','America/Sao_Paulo')) THEN RETURN 'no_show_automation_changed'; END IF;
 reason:=planeje_private.crm_ia_delivery_config(p_client,planeje_private.crm_ia_delivery_target(p_client,p_channel,p_contact)->>'phone',cfg.revision,true);
 RETURN reason;
END $$;
REVOKE ALL ON FUNCTION private.crm_ia_no_show_reason(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;

-- Reuse the existing tick cleanup. A revoked/expired recovery must leave the first-20 due
-- selection even when intake refuses before begin; this never reopens a sending lease.
ALTER FUNCTION public.crm_ia_legacy_delivery_recover() RENAME TO crm_ia_legacy_delivery_recover_pre_appointments;
REVOKE ALL ON FUNCTION public.crm_ia_legacy_delivery_recover_pre_appointments() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.crm_ia_legacy_delivery_recover() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result_data jsonb;cancelled integer:=0;candidate record;changed integer;
BEGIN
 result_data:=public.crm_ia_legacy_delivery_recover_pre_appointments();
 FOR candidate IN SELECT c.id,c.updated_at,c.crm_ia_runtime->'no_show' AS marker FROM public.cliente_atend_conversas c
  WHERE c.ia_followup_due_at IS NOT NULL AND c.ia_followup_delivery_state='pending' AND c.crm_ia_runtime#>>'{no_show,state}'='pending'
   AND private.crm_ia_no_show_reason(c.cliente_id,c.contact_id,(c.crm_ia_runtime#>>'{no_show,channel_id}')::uuid,(c.crm_ia_runtime#>>'{no_show,agent_id}')::uuid,(c.crm_ia_runtime#>>'{no_show,actor_id}')::uuid) IS NOT NULL LOOP
  -- A human may rearm another appointment while this UPDATE waits; never clear its new marker.
  UPDATE public.cliente_atend_conversas c SET ia_followup_due_at=NULL,ia_followup_delivery_state='cancelled'
   WHERE c.id=candidate.id AND c.updated_at IS NOT DISTINCT FROM candidate.updated_at AND c.crm_ia_runtime->'no_show' IS NOT DISTINCT FROM candidate.marker
    AND c.ia_followup_due_at IS NOT NULL AND c.ia_followup_delivery_state='pending';
  GET DIAGNOSTICS changed=ROW_COUNT;cancelled:=cancelled+changed;
 END LOOP;
 RETURN result_data||jsonb_build_object('no_show_cancelled',cancelled);
END $$;
REVOKE ALL ON FUNCTION public.crm_ia_legacy_delivery_recover() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_ia_legacy_delivery_recover() TO service_role;

ALTER FUNCTION public.crm_ia_agent_begin(uuid,uuid,uuid,uuid,uuid,text,text,jsonb) RENAME TO crm_ia_agent_begin_pre_appointments;
REVOKE ALL ON FUNCTION public.crm_ia_agent_begin_pre_appointments(uuid,uuid,uuid,uuid,uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.crm_ia_agent_begin(p_client uuid,p_channel uuid,p_contact uuid,p_lead uuid,p_agent uuid,p_mode text,p_message text,p_expected jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.cliente_atend_conversas;l public.leads;m jsonb;r planeje_private.crm_ia_agent_runs;key uuid;reason text;
BEGIN
 IF p_expected->>'purpose' IS DISTINCT FROM 'no_show' THEN RETURN public.crm_ia_agent_begin_pre_appointments(p_client,p_channel,p_contact,p_lead,p_agent,p_mode,p_message,p_expected); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('crm-ia:'||p_client::text,0));
 SELECT * INTO c FROM public.cliente_atend_conversas WHERE cliente_id=p_client AND contact_id=p_contact FOR UPDATE;m:=c.crm_ia_runtime->'no_show';
 reason:=private.crm_ia_no_show_reason(p_client,p_contact,p_channel,p_agent,(p_expected->>'actor_id')::uuid);
 IF reason IS NOT NULL THEN UPDATE public.cliente_atend_conversas SET ia_followup_due_at=NULL,ia_followup_delivery_state='cancelled' WHERE id=c.id;RETURN jsonb_build_object('claimed',false,'skipped',reason); END IF;
 SELECT * INTO l FROM public.leads WHERE id=p_lead AND cliente_id=p_client AND crm_ia_contact_id=p_contact;
 IF p_mode<>'followup' OR p_message IS DISTINCT FROM 'no-show:'||(m->>'appointment_id')||':'||(m->>'appointment_updated_at')||':1'
  OR l.id IS NULL OR c.ia_followup_due_at IS NULL OR c.ia_followup_due_at>clock_timestamp() OR c.ia_followup_delivery_state<>'pending'
  OR c.updated_at IS DISTINCT FROM (p_expected->>'conversation_updated_at')::timestamptz OR l.updated_at IS DISTINCT FROM (p_expected->>'lead_updated_at')::timestamptz
  OR p_expected->>'config_revision' IS DISTINCT FROM m->>'config_revision' OR (p_expected->>'agent_updated_at')::timestamptz IS DISTINCT FROM (m->>'agent_updated_at')::timestamptz THEN RETURN '{"claimed":false,"skipped":"no_show_snapshot_changed"}'; END IF;
 key:=md5(p_client::text||':'||p_channel::text||':'||p_mode||':'||p_message)::uuid;
 SELECT * INTO r FROM planeje_private.crm_ia_agent_runs WHERE id=key;
 IF FOUND THEN RETURN jsonb_build_object('claimed',false,'id',key,'result',r.result); END IF;
 INSERT INTO planeje_private.crm_ia_agent_runs(id,cliente_id,channel_id,contact_id,lead_id,agent_id,actor_id,mode,message_id,snapshot)
 VALUES(key,p_client,p_channel,p_contact,p_lead,p_agent,(p_expected->>'actor_id')::uuid,p_mode,p_message,p_expected||jsonb_build_object('no_show',m));
 RETURN jsonb_build_object('claimed',true,'id',key);
END $$;
REVOKE ALL ON FUNCTION public.crm_ia_agent_begin(uuid,uuid,uuid,uuid,uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_ia_agent_begin(uuid,uuid,uuid,uuid,uuid,text,text,jsonb) TO service_role;

CREATE FUNCTION private.crm_ia_apply_no_show(p_run uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ctx jsonb;r planeje_private.crm_ia_agent_runs;c public.cliente_atend_conversas;stamp timestamptz;item uuid:=gen_random_uuid();result_data jsonb;
BEGIN
 ctx:=private.crm_ia_appointment_run(p_run);r:=jsonb_populate_record(NULL::planeje_private.crm_ia_agent_runs,ctx->'run');c:=jsonb_populate_record(NULL::public.cliente_atend_conversas,ctx->'conversation');
 IF r.mode<>'followup' OR r.snapshot->>'purpose' IS DISTINCT FROM 'no_show' OR r.snapshot->'no_show' IS DISTINCT FROM c.crm_ia_runtime->'no_show'
  OR private.crm_ia_no_show_reason(r.cliente_id,r.contact_id,r.channel_id,r.agent_id,r.actor_id) IS NOT NULL THEN RAISE EXCEPTION 'crm_ia_no_show_changed' USING ERRCODE='40001'; END IF;
 UPDATE public.cliente_atend_conversas SET ia_followup_due_at=NULL,ia_followup_delivery_state='cancelled',
  crm_ia_runtime=jsonb_set(crm_ia_runtime,'{no_show,state}','"queued"')||jsonb_build_object('delivery_run_id',r.id,'pending_followup','{}'::jsonb),updated_at=clock_timestamp()
  WHERE id=c.id RETURNING updated_at INTO stamp;
 INSERT INTO public.crm_ia_outbox(id,cliente_id,whatsapp_config_id,contact_id,lead_id,kind,body,scheduled_at,request_id,created_by,source_updated_at,config_revision,agent_run_id)
 VALUES(item,r.cliente_id,r.channel_id,r.contact_id,r.lead_id,'followup','Sentimos sua falta no atendimento. Gostaria de conferir um novo horário com a equipe?',clock_timestamp(),r.id,r.actor_id,stamp,(r.snapshot->>'config_revision')::uuid,r.id);
 result_data:=jsonb_build_object('handled',true,'typed',true,'queued',true,'action','no_show_recover','outbox_id',item,'lead_updated_at',ctx#>'{lead,updated_at}');
 UPDATE planeje_private.crm_ia_agent_runs SET status='queued',result=result_data WHERE id=r.id;
 RETURN result_data;
END $$;
REVOKE ALL ON FUNCTION private.crm_ia_apply_no_show(uuid) FROM PUBLIC,anon,authenticated;

ALTER FUNCTION public.crm_ia_apply_agent_action(uuid,jsonb,text,jsonb) RENAME TO crm_ia_apply_agent_action_pre_appointments;
REVOKE ALL ON FUNCTION public.crm_ia_apply_agent_action_pre_appointments(uuid,jsonb,text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.crm_ia_apply_agent_action(p_run uuid,p_action jsonb,p_reply text,p_followup jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
<<worker>>
DECLARE r planeje_private.crm_ia_agent_runs;c public.cliente_atend_conversas;l public.leads;cfg public.crm_ia_config;a public.crm_ia_appointments;before_row public.crm_ia_appointments;
 source public.cliente_whatsapp_inbox;question public.crm_ia_outbox;context jsonb;proposal jsonb;operation text;reply text;answer text;allowed boolean:=false;
 outbox uuid:=gen_random_uuid();confirmation uuid:=gen_random_uuid();stamp timestamptz;result jsonb;rules jsonb;availability jsonb;slots jsonb;reminder jsonb;due timestamptz;amount numeric;was_claimed boolean;
BEGIN
 SELECT * INTO r FROM planeje_private.crm_ia_agent_runs WHERE id=p_run FOR UPDATE;
 IF r.status='queued' THEN RETURN r.result; END IF;
 IF jsonb_typeof(p_action) IS DISTINCT FROM 'object' OR coalesce(p_action->>'type','') NOT IN ('answer','qualify','handoff','close','book','appointment_propose','appointment_apply','no_show_recover') THEN RAISE EXCEPTION 'crm_ia_action' USING ERRCODE='22023'; END IF;
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
   slots:=public.crm_ia_appointment_slots(r.cliente_id,r.channel_id,r.contact_id,r.lead_id,r.agent_id,r.actor_id,a.id,((p_action->>'start_at')::timestamptz AT TIME ZONE coalesce(cfg.data#>>'{availability,timezone}','America/Sao_Paulo'))::date,a.updated_at);
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
    SELECT transcript INTO answer FROM planeje_private.crm_ia_audio_inputs WHERE inbox_id=source.id AND cliente_id=r.cliente_id AND channel_id=r.channel_id AND contact_id=r.contact_id AND message_id=source.message_id AND status='completed';
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
    slots:=public.crm_ia_appointment_slots(r.cliente_id,r.channel_id,r.contact_id,r.lead_id,r.agent_id,r.actor_id,a.id,((proposal->>'start_at')::timestamptz AT TIME ZONE coalesce(cfg.data#>>'{availability,timezone}','America/Sao_Paulo'))::date,a.updated_at);
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
REVOKE ALL ON FUNCTION public.crm_ia_apply_agent_action(uuid,jsonb,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_ia_apply_agent_action(uuid,jsonb,text,jsonb) TO service_role;

-- Creation keeps the strict release-02 identity gate. Existing appointments use an immutable
-- operation receipt: their creator/request/owner must remain the original ones, never this run's.
ALTER FUNCTION private.crm_ia_calendar_outbox_state(public.crm_ia_outbox) RENAME TO crm_ia_calendar_outbox_state_pre_appointments;
CREATE FUNCTION private.crm_ia_calendar_outbox_state(p_item public.crm_ia_outbox) RETURNS jsonb
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
  OR NOT coalesce(g.funil#>'{crm_ia,stage_ids}','[]') ? l.stage_id::text
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
REVOKE ALL ON FUNCTION private.crm_ia_calendar_outbox_state_pre_appointments(public.crm_ia_outbox),private.crm_ia_calendar_outbox_state(public.crm_ia_outbox) FROM PUBLIC,anon,authenticated;

ALTER FUNCTION public.crm_ia_workspace(text,uuid,jsonb) RENAME TO crm_ia_workspace_pre_appointments;
REVOKE ALL ON FUNCTION public.crm_ia_workspace_pre_appointments(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.crm_ia_workspace(p_action text,p_client_id uuid DEFAULT NULL,p_payload jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE role text;cfg public.crm_ia_config;a public.crm_ia_appointments;g public.cliente_atend_ia_agentes;c public.cliente_atend_conversas;l public.leads;
 channel uuid;reason text;marker jsonb;result_data jsonb;key text;value jsonb;timezone text;since_date date;until_date date;
 limit_n integer:=greatest(1,least(coalesce((p_payload->>'limit')::integer,50),200));offset_n integer:=greatest(0,least(coalesce((p_payload->>'offset')::integer,0),100000));
BEGIN
 IF p_action='save_config' AND p_payload->>'section'='concierge' THEN
  FOR key,value IN SELECT k,v FROM jsonb_each(p_payload->'data') e(k,v) WHERE k IN ('appointment_confirm','appointment_reschedule','appointment_cancel','no_show_recovery','no_show_delay_minutes','no_show_expire_hours') LOOP
   IF key IN ('appointment_confirm','appointment_reschedule','appointment_cancel','no_show_recovery') THEN
    IF jsonb_typeof(value)<>'boolean' THEN RAISE EXCEPTION 'Opção de agenda inválida.' USING ERRCODE='22023'; END IF;
   ELSIF jsonb_typeof(value)<>'number' OR (value#>>'{}')::numeric<>trunc((value#>>'{}')::numeric)
    OR (value#>>'{}')::numeric NOT BETWEEN (CASE WHEN key='no_show_delay_minutes' THEN 0 ELSE 1 END) AND (CASE WHEN key='no_show_delay_minutes' THEN 10080 ELSE 720 END) THEN
    RAISE EXCEPTION 'Prazo da recuperação de ausência inválido.' USING ERRCODE='22023'; END IF;
  END LOOP;
 END IF;
 IF p_action NOT IN ('agenda','mark_appointment_no_show') THEN RETURN public.crm_ia_workspace_pre_appointments(p_action,p_client_id,p_payload); END IF;
 role:=private.crm_ia_role();
 IF role IS NULL OR NOT private.crm_ia_client(p_client_id) THEN RAISE EXCEPTION 'Sem acesso a esta conta.' USING ERRCODE='42501'; END IF;
 IF coalesce(jsonb_typeof(p_payload),'')<>'object' OR octet_length(p_payload::text)>2000000 THEN RAISE EXCEPTION 'Dados inválidos.' USING ERRCODE='22023'; END IF;
 SELECT * INTO cfg FROM public.crm_ia_config WHERE cliente_id=p_client_id;
 timezone:=private.crm_ia_availability(p_client_id)->>'timezone';
 IF p_action='agenda' THEN
  since_date:=coalesce(nullif(p_payload->>'since','')::date,(clock_timestamp() AT TIME ZONE timezone)::date-6);
  until_date:=coalesce(nullif(p_payload->>'until','')::date,(clock_timestamp() AT TIME ZONE timezone)::date);
  IF until_date<since_date OR until_date-since_date>366 THEN RAISE EXCEPTION 'Período inválido.' USING ERRCODE='22023'; END IF;
  WITH filtered AS(SELECT x.* FROM public.crm_ia_appointments x WHERE x.cliente_id=p_client_id
   AND (x.lead_id IS NULL OR private.crm_ia_lead(x.lead_id,p_client_id)) AND (x.contact_id IS NULL OR private.crm_ia_contact(p_client_id,x.contact_id))
   AND (nullif(p_payload->>'owner_id','') IS NULL OR x.owner_id=(p_payload->>'owner_id')::uuid)
   AND (x.start_at AT TIME ZONE timezone)::date BETWEEN since_date AND until_date),
  page AS(SELECT * FROM filtered ORDER BY start_at,id LIMIT limit_n OFFSET offset_n),
  enriched AS(SELECT p.*,private.crm_ia_calendar_confirmation(p.id) AS receipt FROM page p)
  SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg((to_jsonb(e)-'receipt')||jsonb_build_object('calendar',jsonb_build_object('required',e.receipt->'required','state',e.receipt->'state','verified',e.receipt->'verified','reason',e.receipt->'reason')) ORDER BY e.start_at,e.id) FROM enriched e),'[]'),
   'total',(SELECT count(*) FROM filtered),'summary',(SELECT jsonb_build_object('scheduled',count(*) FILTER(WHERE status='scheduled'),'confirmed',count(*) FILTER(WHERE status='confirmed'),'cancelled',count(*) FILTER(WHERE status='cancelled'),'no_show',count(*) FILTER(WHERE status='no_show')) FROM filtered),'timezone',timezone) INTO result_data;
  RETURN result_data;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('crm-ia:'||p_client_id::text,0));
 SELECT * INTO a FROM public.crm_ia_appointments WHERE id=(p_payload->>'id')::uuid AND cliente_id=p_client_id FOR UPDATE;
 IF a.id IS NULL OR (a.lead_id IS NOT NULL AND NOT private.crm_ia_lead(a.lead_id,p_client_id)) OR (a.contact_id IS NOT NULL AND NOT private.crm_ia_contact(p_client_id,a.contact_id)) THEN RAISE EXCEPTION 'Compromisso indisponível.' USING ERRCODE='42501'; END IF;
 PERFORM private.crm_ia_version(p_payload->>'expected_updated_at',a.updated_at);
 IF a.status='no_show' THEN RETURN to_jsonb(a)||jsonb_build_object('recovery',jsonb_build_object('armed',false,'reason','already_marked')); END IF;
 IF a.status NOT IN ('scheduled','confirmed') OR a.end_at>clock_timestamp() THEN RAISE EXCEPTION 'A ausência só pode ser marcada após o término do compromisso.' USING ERRCODE='22023'; END IF;
 UPDATE public.crm_ia_appointments SET status='no_show',updated_at=clock_timestamp() WHERE id=a.id RETURNING * INTO a;
 UPDATE public.leads SET agendamento=NULL,proxima_acao=NULL,updated_at=clock_timestamp() WHERE id=a.lead_id AND cliente_id=p_client_id AND agendamento=a.start_at;
 IF a.lead_id IS NOT NULL THEN INSERT INTO public.crm_lead_interacoes(lead_id,cliente_id,tipo,descricao,user_id) VALUES(a.lead_id,p_client_id,'agendamento','Ausência marcada pela equipe após o término do compromisso.',auth.uid()); END IF;
 UPDATE public.crm_ia_outbox SET status='cancelled',error_code='appointment_no_show' WHERE cliente_id=p_client_id AND (appointment_id=a.id OR calendar_appointment_id=a.id) AND status='pending' AND attempts=0;
 SELECT * INTO c FROM public.cliente_atend_conversas WHERE cliente_id=p_client_id AND contact_id=a.contact_id FOR UPDATE;
 SELECT * INTO l FROM public.leads WHERE id=a.lead_id AND cliente_id=p_client_id;
 channel:=nullif(p_payload->>'channel_id','')::uuid;
 IF channel IS NULL THEN SELECT r.channel_id INTO channel FROM planeje_private.crm_ia_agent_runs r WHERE r.id=a.request_id AND r.cliente_id=p_client_id AND r.contact_id=a.contact_id AND r.lead_id=a.lead_id AND r.result->>'action'='book' AND r.result#>>'{appointment,id}'=a.id::text; END IF;
 SELECT * INTO g FROM public.cliente_atend_ia_agentes x WHERE x.cliente_id=p_client_id AND x.ativo AND x.auto_responder AND x.funil#>>'{crm_ia,pipeline_id}'=l.pipeline_id::text AND coalesce(x.funil#>'{crm_ia,stage_ids}','[]') ? l.stage_id::text
  AND x.funil#>>'{crm_ia,tipo}' IN ('qualificacao','agendamento') ORDER BY (x.id::text=c.crm_ia_runtime->>'agent_id') DESC NULLS LAST,x.created_at,x.id LIMIT 1;
 IF cfg.data#>>'{attendance,auto_send}' IS DISTINCT FROM 'true' OR cfg.data#>>'{concierge,enabled}' IS DISTINCT FROM 'true' OR cfg.data#>>'{concierge,no_show_recovery}' IS DISTINCT FROM 'true' THEN reason:='recovery_disabled';
 ELSIF c.id IS NULL OR c.ia_pausada OR c.status='finalizado' THEN reason:='human_or_closed';
 ELSIF channel IS NULL OR NOT private.crm_ia_appointment_actor(p_client_id,channel,a.contact_id,a.lead_id,auth.uid()) OR NOT private.crm_ia_agent_actor(p_client_id,cfg.updated_by) THEN reason:='exact_channel_or_actor_required';
 ELSIF g.id IS NULL OR NOT private.crm_ia_calendar_owner(p_client_id,a.owner_id,a.lead_id,a.contact_id) THEN reason:='agent_or_owner_unavailable'; END IF;
 IF reason IS NULL THEN
  marker:=jsonb_build_object('appointment_id',a.id,'appointment_updated_at',a.updated_at,'channel_id',channel,'actor_id',auth.uid(),'agent_id',g.id,'agent_updated_at',g.updated_at,'config_revision',cfg.revision,
   'marked_at',clock_timestamp(),'due_at',clock_timestamp()+make_interval(mins=>coalesce((cfg.data#>>'{concierge,no_show_delay_minutes}')::integer,60)),
   'expires_at',clock_timestamp()+make_interval(hours=>coalesce((cfg.data#>>'{concierge,no_show_expire_hours}')::integer,168)),'state','pending');
  UPDATE public.cliente_atend_conversas SET ia_followup_due_at=(marker->>'due_at')::timestamptz,ia_followup_passo=0,ia_followup_delivery_state='pending',ia_followup_whatsapp_config_id=channel,
   crm_ia_runtime=(crm_ia_runtime-'pending_appointment_action')||jsonb_build_object('active',true,'no_show',marker),updated_at=clock_timestamp() WHERE id=c.id;
 END IF;
 RETURN to_jsonb(a)||jsonb_build_object('recovery',jsonb_build_object('armed',reason IS NULL,'reason',reason));
END $$;
REVOKE ALL ON FUNCTION public.crm_ia_workspace(text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_ia_workspace(text,uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
