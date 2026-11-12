BEGIN;
ALTER TABLE public.crm_ia_outbox ADD COLUMN calendar_appointment_id uuid REFERENCES public.crm_ia_appointments(id),
  ADD COLUMN calendar_source_updated_at timestamptz,ADD COLUMN calendar_fallback boolean NOT NULL DEFAULT false;

-- The principal reply keeps its conversation version; reminder appointment_id has different semantics.
CREATE FUNCTION private.crm_ia_calendar_link_reply() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.crm_ia_outbox;appointment public.crm_ia_appointments;
BEGIN
  IF NEW.status<>'queued' OR NEW.result->>'action' IS DISTINCT FROM 'book' THEN RETURN NEW; END IF;
  SELECT * INTO item FROM public.crm_ia_outbox WHERE id=(NEW.result->>'outbox_id')::uuid FOR UPDATE;
  SELECT * INTO appointment FROM public.crm_ia_appointments WHERE id=(NEW.result#>>'{appointment,id}')::uuid;
  IF NEW.result->>'queued' IS DISTINCT FROM 'true' OR item.id IS NULL OR appointment.id IS NULL OR item.agent_run_id IS DISTINCT FROM NEW.id OR item.kind NOT IN ('reply','followup')
    OR item.cliente_id IS DISTINCT FROM NEW.cliente_id OR item.contact_id IS DISTINCT FROM NEW.contact_id OR item.lead_id IS DISTINCT FROM NEW.lead_id
    OR item.whatsapp_config_id IS DISTINCT FROM NEW.channel_id OR item.created_by IS DISTINCT FROM NEW.actor_id OR item.request_id IS DISTINCT FROM NEW.id
    OR appointment.cliente_id IS DISTINCT FROM NEW.cliente_id OR appointment.contact_id IS DISTINCT FROM NEW.contact_id OR appointment.lead_id IS DISTINCT FROM NEW.lead_id
    OR appointment.created_by IS DISTINCT FROM NEW.actor_id OR appointment.request_id IS DISTINCT FROM NEW.id
    OR nullif(NEW.result#>>'{appointment,updated_at}','') IS NULL THEN RAISE EXCEPTION 'crm_ia_calendar_reply_scope'; END IF;
  UPDATE public.crm_ia_outbox SET calendar_appointment_id=appointment.id,
    calendar_source_updated_at=(NEW.result#>>'{appointment,updated_at}')::timestamptz
    WHERE id=item.id AND status='pending' AND attempts=0;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.crm_ia_calendar_link_reply() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER crm_ia_calendar_link_reply AFTER INSERT OR UPDATE OF status,result ON planeje_private.crm_ia_agent_runs
  FOR EACH ROW EXECUTE FUNCTION private.crm_ia_calendar_link_reply();

-- Backfill only intact, unsent runs. An unverifiable queued booking must never escape the new gate.
UPDATE public.crm_ia_outbox o SET calendar_appointment_id=a.id,calendar_source_updated_at=(r.result#>>'{appointment,updated_at}')::timestamptz
FROM planeje_private.crm_ia_agent_runs r JOIN public.crm_ia_appointments a ON a.id=(r.result#>>'{appointment,id}')::uuid
WHERE o.agent_run_id=r.id AND r.status='queued' AND r.result->>'action'='book' AND r.result->>'queued'='true'
  AND o.id=(r.result->>'outbox_id')::uuid AND o.status='pending' AND o.attempts=0 AND o.kind IN ('reply','followup')
  AND o.cliente_id=r.cliente_id AND o.contact_id=r.contact_id AND o.lead_id=r.lead_id AND o.whatsapp_config_id=r.channel_id AND o.created_by=r.actor_id AND o.request_id=r.id
  AND a.cliente_id=r.cliente_id AND a.contact_id=r.contact_id AND a.lead_id=r.lead_id AND a.created_by=r.actor_id AND a.request_id=r.id
  AND nullif(r.result#>>'{appointment,updated_at}','') IS NOT NULL;
UPDATE public.crm_ia_outbox o SET status='cancelled',error_code='calendar_link_unverified'
FROM planeje_private.crm_ia_agent_runs r WHERE o.agent_run_id=r.id AND r.status='queued' AND r.result->>'action'='book'
  AND o.kind IN ('reply','followup') AND o.status='pending' AND o.attempts=0 AND o.calendar_appointment_id IS NULL;

CREATE FUNCTION private.crm_ia_calendar_outbox_state(p_item public.crm_ia_outbox) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE appointment public.crm_ia_appointments;r planeje_private.crm_ia_agent_runs;a public.cliente_atend_ia_agentes;l public.leads;
  c public.cliente_atend_conversas;contact public.cliente_whatsapp_contact;target jsonb;confirmation jsonb;reason text;actor_role text;version timestamptz;last_inbound timestamptz;
BEGIN
  IF p_item.calendar_appointment_id IS NULL AND p_item.appointment_id IS NULL THEN
    IF p_item.kind IN ('reply','followup') AND EXISTS(SELECT 1 FROM planeje_private.crm_ia_agent_runs WHERE id=p_item.agent_run_id AND result->>'action'='book') THEN
      RETURN '{"linked":true,"eligible":true,"allowed":false,"reason":"calendar_link_unverified"}';
    END IF;
    RETURN '{"linked":false,"eligible":true,"allowed":true}';
  END IF;
  SELECT * INTO appointment FROM public.crm_ia_appointments WHERE id=coalesce(p_item.calendar_appointment_id,p_item.appointment_id);
  version:=coalesce(p_item.calendar_source_updated_at,p_item.source_updated_at);
  target:=planeje_private.crm_ia_delivery_target(p_item.cliente_id,p_item.whatsapp_config_id,p_item.contact_id);
  SELECT * INTO contact FROM public.cliente_whatsapp_contact WHERE id=p_item.contact_id AND cliente_id=p_item.cliente_id;
  SELECT * INTO c FROM public.cliente_atend_conversas WHERE cliente_id=p_item.cliente_id AND contact_id=p_item.contact_id;
  SELECT p.role::text INTO actor_role FROM public.profiles p WHERE p.id=p_item.created_by AND p.status='active';
  IF appointment.id IS NULL OR appointment.cliente_id IS DISTINCT FROM p_item.cliente_id OR appointment.contact_id IS DISTINCT FROM p_item.contact_id
    OR appointment.lead_id IS DISTINCT FROM p_item.lead_id OR appointment.created_by IS DISTINCT FROM p_item.created_by THEN reason:='calendar_scope';
  ELSIF appointment.updated_at IS DISTINCT FROM version OR appointment.status NOT IN ('scheduled','confirmed') OR appointment.start_at<=clock_timestamp() THEN reason:='calendar_source_changed';
  ELSIF target->>'allowed' IS DISTINCT FROM 'true' OR NOT public.cliente_atend_loja_habilitada(p_item.cliente_id) THEN reason:='channel_or_module_changed';
  ELSIF actor_role IS NULL OR actor_role NOT IN ('superadmin','admin','colaborador') OR NOT private.crm_ia_agent_actor(p_item.cliente_id,p_item.created_by)
    OR NOT private.crm_ia_calendar_owner(p_item.cliente_id,appointment.owner_id,appointment.lead_id,appointment.contact_id)
    OR public.atendimento_user_can_send_on_whatsapp_config(p_item.created_by,p_item.cliente_id,p_item.whatsapp_config_id) IS DISTINCT FROM true
    OR NOT (coalesce((SELECT m.is_enabled FROM public.user_module_permissions m WHERE m.user_id=p_item.created_by AND m.module_name::text='atendimento'),
        (SELECT m.is_enabled FROM public.module_settings m WHERE m.module_name::text='atendimento'),true)
      OR coalesce((SELECT m.is_enabled FROM public.user_module_permissions m WHERE m.user_id=p_item.created_by AND m.module_name::text='rastreamento'),
        (SELECT m.is_enabled FROM public.module_settings m WHERE m.module_name::text='rastreamento'),true))
    OR (c.privado AND c.assigned_to IS DISTINCT FROM p_item.created_by AND actor_role<>'superadmin')
    OR (actor_role='colaborador' AND EXISTS(SELECT 1 FROM public.user_module_access m WHERE m.user_id=p_item.created_by AND m.module_name::text='crm' AND m.access_level::text='responsible') AND c.assigned_to IS DISTINCT FROM p_item.created_by) THEN reason:='actor_changed';
  ELSE reason:=planeje_private.crm_ia_delivery_config(p_item.cliente_id,target->>'phone',p_item.config_revision,p_item.kind<>'manual'); END IF;
  IF reason IS NULL AND p_item.agent_run_id IS NOT NULL THEN
    SELECT * INTO r FROM planeje_private.crm_ia_agent_runs WHERE id=p_item.agent_run_id;
    SELECT * INTO a FROM public.cliente_atend_ia_agentes WHERE id=r.agent_id AND cliente_id=p_item.cliente_id;
    SELECT * INTO l FROM public.leads WHERE id=p_item.lead_id AND cliente_id=p_item.cliente_id;
    IF r.id IS NULL OR r.status<>'queued' OR r.cliente_id IS DISTINCT FROM p_item.cliente_id OR r.channel_id IS DISTINCT FROM p_item.whatsapp_config_id
      OR r.contact_id IS DISTINCT FROM p_item.contact_id OR r.lead_id IS DISTINCT FROM p_item.lead_id OR r.actor_id IS DISTINCT FROM p_item.created_by
      OR appointment.request_id IS DISTINCT FROM r.id OR r.result#>>'{appointment,id}' IS DISTINCT FROM appointment.id::text
      OR (p_item.kind<>'reminder' AND (r.result->>'outbox_id' IS DISTINCT FROM p_item.id::text OR p_item.request_id IS DISTINCT FROM r.id))
      OR a.id IS NULL OR NOT a.ativo OR NOT a.auto_responder OR a.updated_at IS DISTINCT FROM (r.snapshot->>'agent_updated_at')::timestamptz
      OR (p_item.kind<>'reminder' AND l.updated_at IS DISTINCT FROM (r.result->>'lead_updated_at')::timestamptz)
      OR (NOT coalesce((r.snapshot->>'concierge')::boolean,false) AND NOT private.crm_ia_agent_window(a.funil->'crm_ia',coalesce((SELECT data#>>'{availability,timezone}' FROM public.crm_ia_config WHERE cliente_id=p_item.cliente_id),'America/Sao_Paulo'))) THEN reason:='agent_changed'; END IF;
  END IF;
  IF reason IS NULL THEN
    SELECT max(i.created_at) INTO last_inbound FROM public.cliente_whatsapp_inbox i WHERE i.cliente_id=p_item.cliente_id AND i.whatsapp_config_id=p_item.whatsapp_config_id
      AND NOT coalesce(i.is_group,false) AND (i.from_jid=contact.from_jid OR i.chat_jid=contact.from_jid);
    IF c.id IS NULL OR last_inbound>p_item.created_at OR contact.last_message_at>p_item.created_at
      OR nullif(c.crm_ia_runtime->>'last_human_at','')::timestamptz>p_item.created_at
      OR (p_item.kind='reminder' AND (c.ia_pausada OR c.status='finalizado'))
      OR (p_item.kind<>'reminder' AND (c.updated_at IS DISTINCT FROM p_item.source_updated_at OR
        ((c.ia_pausada OR c.status='finalizado') AND c.crm_ia_runtime->>'delivery_run_id' IS DISTINCT FROM p_item.agent_run_id::text))) THEN reason:='source_changed'; END IF;
  END IF;
  IF reason IS NOT NULL THEN RETURN jsonb_build_object('linked',true,'eligible',true,'allowed',false,'reason',reason); END IF;
  confirmation:=private.crm_ia_calendar_confirmation(appointment.id);
  IF (confirmation->>'source_version')::timestamptz IS DISTINCT FROM version THEN RETURN '{"linked":true,"eligible":true,"allowed":false,"reason":"calendar_source_changed"}'; END IF;
  IF p_item.calendar_fallback OR confirmation->>'required'='false' OR (confirmation->>'state'='ready' AND confirmation->>'verified'='true') THEN
    RETURN jsonb_build_object('linked',true,'eligible',true,'allowed',true,'calendar',confirmation);
  END IF;
  IF confirmation->>'state'='failed' OR confirmation->>'status' IN ('failed','conflict','uncertain','error') THEN
    RETURN jsonb_build_object('linked',true,'eligible',true,'allowed',false,'terminal',true,'reason','calendar_confirmation_unavailable','calendar',confirmation);
  END IF;
  RETURN jsonb_build_object('linked',true,'eligible',false,'allowed',false,'reason','calendar_confirmation_pending','calendar',confirmation);
END $$;
REVOKE ALL ON FUNCTION private.crm_ia_calendar_outbox_state(public.crm_ia_outbox) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.crm_ia_calendar_prepare(p_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.crm_ia_outbox;state jsonb;stamp timestamptz;
BEGIN
  SELECT * INTO item FROM public.crm_ia_outbox WHERE id=p_id AND status='pending' AND attempts=0 FOR UPDATE;
  IF item.id IS NULL THEN RETURN false; END IF;
  state:=private.crm_ia_calendar_outbox_state(item);
  IF state->>'linked'='false' THEN RETURN true; END IF;
  IF EXISTS(SELECT 1 FROM public.crm_ia_transport_claims WHERE kind='outbox' AND source_id=p_id) THEN
    UPDATE public.crm_ia_outbox SET status='cancelled',error_code='transport_already_started' WHERE id=p_id;RETURN false; END IF;
  IF state->>'allowed'='true' THEN RETURN true; END IF;
  IF state->>'terminal'='true' AND item.kind IN ('reply','followup') AND NOT item.calendar_fallback THEN
    PERFORM 1 FROM public.cliente_atend_conversas WHERE cliente_id=item.cliente_id AND contact_id=item.contact_id AND updated_at=item.source_updated_at FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN RETURN false; END IF;
    UPDATE public.cliente_atend_conversas SET ia_pausada=true,status='esperando',status_at=clock_timestamp(),ia_followup_due_at=NULL,ia_followup_delivery_state='cancelled',
      crm_ia_runtime=crm_ia_runtime||jsonb_build_object('pending_followup','{}'::jsonb,'next_agent_id',NULL,'delivery_run_id',item.agent_run_id),updated_at=clock_timestamp()
      WHERE cliente_id=item.cliente_id AND contact_id=item.contact_id AND updated_at=item.source_updated_at RETURNING updated_at INTO stamp;
    IF stamp IS NULL THEN UPDATE public.crm_ia_outbox SET status='cancelled',error_code='source_changed' WHERE id=p_id;RETURN false; END IF;
    UPDATE public.crm_ia_outbox SET body='Não consegui confirmar o horário na agenda. A equipe vai conferir e continuar seu atendimento.',
      source_updated_at=stamp,calendar_fallback=true,voice_status='text_fallback',voice_error_code='calendar_confirmation_unavailable'
      WHERE id=p_id AND status='pending' AND attempts=0;
    UPDATE public.crm_ia_outbox SET status='cancelled',error_code='calendar_confirmation_unavailable'
      WHERE cliente_id=item.cliente_id AND contact_id=item.contact_id AND kind='reminder' AND status='pending' AND attempts=0
        AND (appointment_id=item.calendar_appointment_id OR calendar_appointment_id=item.calendar_appointment_id);
    RETURN true;
  END IF;
  IF state->>'eligible'='true' THEN UPDATE public.crm_ia_outbox SET status='cancelled',error_code=coalesce(state->>'reason','calendar_confirmation_unavailable') WHERE id=p_id; END IF;
  RETURN false;
END $$;
REVOKE ALL ON FUNCTION private.crm_ia_calendar_prepare(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.crm_ia_delivery_claim(p_now timestamptz DEFAULT clock_timestamp(),p_ids uuid[] DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE picked public.crm_ia_outbox;claimed public.crm_ia_outbox;result jsonb:='[]';
BEGIN
  UPDATE public.crm_ia_outbox SET status='uncertain',error_code='lease_expired' WHERE status='sending' AND claimed_at<clock_timestamp()-interval '5 minutes';
  UPDATE public.crm_ia_outbox SET status='failed',error_code='file_not_dispatched',updated_at=clock_timestamp()
    WHERE status='pending' AND media_descriptor<>'{}'::jsonb AND created_at<clock_timestamp()-interval '5 minutes';
  FOR picked IN SELECT o.* FROM public.crm_ia_outbox o WHERE o.status='pending' AND o.attempts=0 AND o.scheduled_at<=p_now
    AND (p_ids IS NOT NULL OR o.media_descriptor='{}'::jsonb) AND (p_ids IS NULL OR o.id=ANY(p_ids))
    AND private.crm_ia_calendar_outbox_state(o)->>'eligible'='true'
    ORDER BY o.scheduled_at,o.id LIMIT 25 FOR UPDATE SKIP LOCKED LOOP
    IF NOT private.crm_ia_calendar_prepare(picked.id) THEN CONTINUE; END IF;
    UPDATE public.crm_ia_outbox SET status='sending',claim_token=gen_random_uuid(),claimed_at=clock_timestamp(),attempts=attempts+1
      WHERE id=picked.id AND status='pending' AND attempts=0 RETURNING * INTO claimed;
    IF FOUND THEN result:=result||jsonb_build_array(to_jsonb(claimed)); END IF;
  END LOOP;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.crm_ia_delivery_claim(timestamptz,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_ia_delivery_claim(timestamptz,uuid[]) TO service_role;

ALTER FUNCTION public.crm_ia_delivery_recheck(uuid,uuid) RENAME TO crm_ia_delivery_recheck_pre_calendar;
REVOKE ALL ON FUNCTION public.crm_ia_delivery_recheck_pre_calendar(uuid,uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.crm_ia_delivery_recheck(p_id uuid,p_claim_token uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target jsonb;item public.crm_ia_outbox;state jsonb;
BEGIN
  target:=public.crm_ia_delivery_recheck_pre_calendar(p_id,p_claim_token);
  IF target->>'allowed' IS DISTINCT FROM 'true' THEN RETURN target; END IF;
  SELECT * INTO item FROM public.crm_ia_outbox WHERE id=p_id AND status='sending' AND claim_token=p_claim_token;
  state:=private.crm_ia_calendar_outbox_state(item);
  IF state->>'allowed' IS DISTINCT FROM 'true' THEN
    UPDATE public.crm_ia_outbox SET status='cancelled',error_code=coalesce(state->>'reason','calendar_confirmation_unavailable') WHERE id=p_id AND status='sending' AND claim_token=p_claim_token;
    RETURN jsonb_build_object('allowed',false,'reason',coalesce(state->>'reason','calendar_confirmation_unavailable'));
  END IF;
  IF item.calendar_fallback THEN target:=(target-'voice'-'voice_descriptor')||jsonb_build_object('voice_status','text_fallback','voice_error_code','calendar_confirmation_unavailable'); END IF;
  RETURN target;
END $$;
REVOKE ALL ON FUNCTION public.crm_ia_delivery_recheck(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_ia_delivery_recheck(uuid,uuid) TO service_role;

ALTER FUNCTION public.crm_ia_workspace(text,uuid,jsonb) RENAME TO crm_ia_workspace_pre_calendar_delivery;
REVOKE ALL ON FUNCTION public.crm_ia_workspace_pre_calendar_delivery(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.crm_ia_workspace(p_action text,p_client_id uuid DEFAULT NULL,p_payload jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;rows jsonb:='[]';item jsonb;appointment_key uuid;confirmation jsonb;
BEGIN
  result:=public.crm_ia_workspace_pre_calendar_delivery(p_action,p_client_id,p_payload);
  IF p_action NOT IN ('agenda','queue') THEN RETURN result; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(coalesce(result->'rows','[]')) LOOP
    appointment_key:=NULL;
    IF p_action='agenda' THEN SELECT a.id INTO appointment_key FROM public.crm_ia_appointments a WHERE a.id=(item->>'id')::uuid AND a.cliente_id=p_client_id;
    ELSE
      SELECT a.id,item||jsonb_build_object('calendar_fallback',o.calendar_fallback) INTO appointment_key,item
        FROM public.crm_ia_outbox o LEFT JOIN public.crm_ia_appointments a ON a.id=coalesce(o.calendar_appointment_id,o.appointment_id)
          AND a.cliente_id=o.cliente_id AND a.contact_id IS NOT DISTINCT FROM o.contact_id AND a.lead_id IS NOT DISTINCT FROM o.lead_id
        WHERE o.id=(item->>'id')::uuid AND o.cliente_id=p_client_id;
    END IF;
    IF appointment_key IS NOT NULL THEN
      confirmation:=private.crm_ia_calendar_confirmation(appointment_key);
      item:=item||jsonb_build_object('calendar',jsonb_build_object('required',coalesce((confirmation->>'required')::boolean,true),
        'state',confirmation->>'state','verified',coalesce((confirmation->>'verified')::boolean,false),'reason',confirmation->>'reason'));
    END IF;
    rows:=rows||jsonb_build_array(item);
  END LOOP;
  RETURN jsonb_set(result,'{rows}',rows);
END $$;
REVOKE ALL ON FUNCTION public.crm_ia_workspace(text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_ia_workspace(text,uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
