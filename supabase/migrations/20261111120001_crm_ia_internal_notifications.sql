BEGIN;
ALTER TABLE public.crm_ia_outbox DROP CONSTRAINT crm_ia_outbox_kind_check;
ALTER TABLE public.crm_ia_outbox ADD CONSTRAINT crm_ia_outbox_kind_check CHECK(kind IN('manual','followup','reminder','reply','notification'));

CREATE FUNCTION private.crm_ia_notification_phone(p_value text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE phone text;
BEGIN
 IF coalesce(p_value,'') !~ '^[+0-9 ().-]+$' THEN RETURN NULL;END IF;
 phone:=regexp_replace(p_value,'\D','','g');
 IF length(phone) IN(10,11) THEN phone:='55'||phone;END IF;
 IF phone !~ '^55[1-9][0-9]{9,10}$' THEN RETURN NULL;END IF;
 RETURN phone;
END$$;
CREATE FUNCTION private.crm_ia_notification_config(p_rules jsonb,p_client uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE value jsonb:=coalesce(p_rules->'notification','{}');recipient jsonb;kind text;person uuid;phone text;enabled boolean;
BEGIN
 IF jsonb_typeof(value) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(value) k WHERE k NOT IN('enabled','recipient'))
  OR (value ? 'enabled' AND jsonb_typeof(value->'enabled') IS DISTINCT FROM 'boolean') THEN RAISE EXCEPTION 'Configuração do destinatário inválida.' USING ERRCODE='22023';END IF;
 enabled:=coalesce((value->>'enabled')::boolean,false);recipient:=coalesce(value->'recipient','{}');
 IF jsonb_typeof(recipient) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(recipient) k WHERE k NOT IN('type','person_id','phone'))
  OR (recipient ? 'person_id' AND jsonb_typeof(recipient->'person_id') NOT IN('string','null'))
  OR (recipient ? 'phone' AND jsonb_typeof(recipient->'phone') NOT IN('string','null')) THEN RAISE EXCEPTION 'Destinatário inválido.' USING ERRCODE='22023';END IF;
 kind:=coalesce(recipient->>'type','lead_owner');
 IF kind NOT IN('lead_owner','person','phone') OR (enabled AND p_rules->>'tipo' IS DISTINCT FROM 'qualificacao') THEN RAISE EXCEPTION 'Tipo de destinatário indisponível.' USING ERRCODE='22023';END IF;
 IF kind='person' THEN
  person:=nullif(recipient->>'person_id','')::uuid;
  IF enabled AND (person IS NULL OR NOT coalesce(private.crm_ia_agent_actor(p_client,person),false)) THEN RAISE EXCEPTION 'Pessoa destinatária indisponível nesta conta.' USING ERRCODE='42501';END IF;
 ELSIF kind='phone' THEN
  phone:=private.crm_ia_notification_phone(recipient->>'phone');
  IF enabled AND phone IS NULL THEN RAISE EXCEPTION 'Informe um telefone brasileiro com DDD para o destinatário.' USING ERRCODE='22023';END IF;
 END IF;
 RETURN jsonb_build_object('enabled',enabled,'recipient',jsonb_build_object('type',kind,'person_id',person,'phone',phone));
END$$;
CREATE FUNCTION private.crm_ia_agent_notification_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF jsonb_typeof(NEW.funil->'crm_ia')='object' THEN
  NEW.funil:=jsonb_set(NEW.funil,'{crm_ia,notification}',private.crm_ia_notification_config(NEW.funil->'crm_ia',NEW.cliente_id));
  IF NEW.funil#>'{crm_ia,agendamento}' ? 'notify_owner' AND jsonb_typeof(NEW.funil#>'{crm_ia,agendamento,notify_owner}') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Aviso ao titular do agendamento inválido.' USING ERRCODE='22023';END IF;
  IF NEW.funil#>>'{crm_ia,agendamento,notify_owner}'='true' AND NEW.funil#>>'{crm_ia,tipo}' IS DISTINCT FROM 'agendamento' THEN RAISE EXCEPTION 'Aviso ao titular pertence ao agendamento.' USING ERRCODE='22023';END IF;
 END IF;RETURN NEW;
END$$;
CREATE TRIGGER crm_ia_agent_notification_guard BEFORE INSERT OR UPDATE OF funil ON public.cliente_atend_ia_agentes FOR EACH ROW EXECUTE FUNCTION private.crm_ia_agent_notification_guard();
ALTER FUNCTION private.crm_ia_template(text,jsonb) RENAME TO crm_ia_template_pre_notifications;
REVOKE ALL ON FUNCTION private.crm_ia_template_pre_notifications(text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.crm_ia_template(p_type text,p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 result:=private.crm_ia_template_pre_notifications(p_type,p_data);
 IF p_type='agent' THEN
  result:=jsonb_set(result,'{funil,crm_ia,notification}','{"enabled":false,"recipient":{"type":"lead_owner","person_id":null,"phone":null}}');
  result:=jsonb_set(result,'{funil,crm_ia,agendamento}',coalesce(result#>'{funil,crm_ia,agendamento}','{}')||'{"notify_owner":false}');
 END IF;RETURN result;
END$$;

CREATE TABLE planeje_private.crm_ia_notification_cycles(conversation_id uuid PRIMARY KEY REFERENCES public.cliente_atend_conversas(id) ON DELETE CASCADE,cycle_id uuid NOT NULL DEFAULT gen_random_uuid());
CREATE TABLE planeje_private.crm_ia_notification_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),run_id uuid NOT NULL UNIQUE REFERENCES planeje_private.crm_ia_agent_runs(id),
 cliente_id uuid NOT NULL REFERENCES public.clientes(id),channel_id uuid NOT NULL REFERENCES public.cliente_whatsapp_config(id),contact_id uuid NOT NULL REFERENCES public.cliente_whatsapp_contact(id),
 lead_id uuid NOT NULL REFERENCES public.leads(id),agent_id uuid NOT NULL REFERENCES public.cliente_atend_ia_agentes(id),actor_id uuid NOT NULL REFERENCES public.profiles(id),
 event_kind text NOT NULL CHECK(event_kind IN('qualify','book')),cycle_key text NOT NULL,main_outbox_id uuid NOT NULL REFERENCES public.crm_ia_outbox(id),outbox_id uuid UNIQUE REFERENCES public.crm_ia_outbox(id),
 config_revision uuid NOT NULL,agent_updated_at timestamptz NOT NULL,
 source_jid text NOT NULL,source_phone text,source_inbox_id uuid REFERENCES public.cliente_whatsapp_inbox(id),source_message_id text,source_message_type text,
 source_updated_at timestamptz NOT NULL,lead_updated_at timestamptz NOT NULL,owner_id uuid REFERENCES public.profiles(id),channel_fingerprint text NOT NULL,
 recipient_type text NOT NULL CHECK(recipient_type IN('lead_owner','person','phone')),recipient_person_id uuid REFERENCES public.profiles(id),recipient_phone text,recipient_to text,recipient_label text,
 appointment_id uuid REFERENCES public.crm_ia_appointments(id),appointment_updated_at timestamptz,
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),status text NOT NULL DEFAULT 'awaiting_reply' CHECK(status IN('awaiting_reply','pending','skipped','cancelled','sent','failed','uncertain')),
 error_code text,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(cliente_id,lead_id,agent_id,event_kind,cycle_key)
);
CREATE INDEX crm_ia_notification_main ON planeje_private.crm_ia_notification_events(main_outbox_id) WHERE status='awaiting_reply';
ALTER TABLE planeje_private.crm_ia_notification_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE planeje_private.crm_ia_notification_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON planeje_private.crm_ia_notification_cycles,planeje_private.crm_ia_notification_events FROM PUBLIC,anon,authenticated;
GRANT ALL ON planeje_private.crm_ia_notification_cycles,planeje_private.crm_ia_notification_events TO service_role;

CREATE TABLE planeje_private.crm_ia_notification_receipts(
 outbox_id uuid PRIMARY KEY REFERENCES public.crm_ia_outbox(id),event_id uuid NOT NULL REFERENCES planeje_private.crm_ia_notification_events(id),
 cliente_id uuid NOT NULL REFERENCES public.clientes(id),channel_id uuid NOT NULL REFERENCES public.cliente_whatsapp_config(id),to_jid text NOT NULL,
 claim_token uuid NOT NULL,provider_message_id text NOT NULL CHECK(length(provider_message_id) BETWEEN 1 AND 300),purpose text NOT NULL CHECK(purpose IN('main','notification')),
 received_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(cliente_id,channel_id,to_jid,provider_message_id)
);
CREATE TABLE planeje_private.crm_ia_notification_echoes(
 cliente_id uuid NOT NULL REFERENCES public.clientes(id),channel_id uuid NOT NULL REFERENCES public.cliente_whatsapp_config(id),contact_id uuid NOT NULL REFERENCES public.cliente_whatsapp_contact(id),
 provider_message_id text NOT NULL CHECK(length(provider_message_id) BETWEEN 1 AND 300),conversation_id uuid NOT NULL REFERENCES public.cliente_atend_conversas(id),to_jid text NOT NULL,
 previous_state jsonb NOT NULL,previous_version timestamptz NOT NULL,marked_version timestamptz NOT NULL,restored_version timestamptz,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','reconciled','stale')),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(cliente_id,channel_id,contact_id,provider_message_id)
);
ALTER TABLE planeje_private.crm_ia_notification_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE planeje_private.crm_ia_notification_echoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON planeje_private.crm_ia_notification_receipts,planeje_private.crm_ia_notification_echoes FROM PUBLIC,anon,authenticated;
GRANT ALL ON planeje_private.crm_ia_notification_receipts,planeje_private.crm_ia_notification_echoes TO service_role;


CREATE TABLE planeje_private.crm_ia_notification_sent_archive(
 sent_id uuid PRIMARY KEY,outbox_id uuid NOT NULL REFERENCES public.crm_ia_outbox(id),event_id uuid NOT NULL REFERENCES planeje_private.crm_ia_notification_events(id),
 record jsonb NOT NULL,archived_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE planeje_private.crm_ia_notification_sent_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON planeje_private.crm_ia_notification_sent_archive FROM PUBLIC,anon,authenticated;
GRANT ALL ON planeje_private.crm_ia_notification_sent_archive TO service_role;
CREATE FUNCTION private.crm_ia_notification_webhook_confirmed(p_client uuid,p_channel uuid,p_jid text,p_message text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM planeje_private.crm_ia_notification_receipts receipt
  JOIN public.crm_ia_outbox o ON o.id=receipt.outbox_id JOIN planeje_private.crm_ia_notification_events e ON e.id=receipt.event_id
  JOIN public.crm_ia_transport_claims claim ON claim.kind='outbox' AND claim.source_id=o.id AND claim.claim_token=receipt.claim_token
  WHERE receipt.purpose='notification' AND receipt.cliente_id=p_client AND receipt.channel_id=p_channel AND receipt.to_jid=p_jid AND receipt.provider_message_id=p_message
   AND e.outbox_id=o.id AND o.kind='notification' AND o.cliente_id=p_client AND o.whatsapp_config_id=p_channel AND o.claim_token=receipt.claim_token AND o.attempts=1)
$$;

CREATE TABLE planeje_private.crm_ia_notification_webhook_snapshots(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_id uuid NOT NULL REFERENCES planeje_private.crm_ia_notification_events(id),outbox_id uuid NOT NULL REFERENCES public.crm_ia_outbox(id),claim_token uuid NOT NULL,
 cliente_id uuid NOT NULL,channel_id uuid NOT NULL,to_jid text NOT NULL,provider_message_id text NOT NULL,
 before_state jsonb,after_state jsonb,restored_version timestamptz,status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','restored','stale')),
 error_code text,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(outbox_id,claim_token,provider_message_id)
);
ALTER TABLE planeje_private.crm_ia_notification_webhook_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON planeje_private.crm_ia_notification_webhook_snapshots FROM PUBLIC,anon,authenticated;
GRANT ALL ON planeje_private.crm_ia_notification_webhook_snapshots TO service_role;
CREATE FUNCTION private.crm_ia_notification_restore_webhook(p_snapshot uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE snap planeje_private.crm_ia_notification_webhook_snapshots;current_row public.atendimento_conversas;previous public.atendimento_conversas;stamp timestamptz;
BEGIN
 SELECT * INTO snap FROM planeje_private.crm_ia_notification_webhook_snapshots WHERE id=p_snapshot FOR UPDATE;
 IF snap.id IS NULL OR snap.status<>'pending' OR snap.after_state IS NULL OR NOT EXISTS(SELECT 1 FROM planeje_private.crm_ia_notification_receipts receipt
  WHERE receipt.outbox_id=snap.outbox_id AND receipt.claim_token=snap.claim_token AND receipt.event_id=snap.event_id AND receipt.purpose='notification'
   AND receipt.cliente_id=snap.cliente_id AND receipt.channel_id=snap.channel_id AND receipt.to_jid=snap.to_jid AND receipt.provider_message_id=snap.provider_message_id) THEN RETURN false;END IF;
 SELECT * INTO current_row FROM public.atendimento_conversas WHERE id=(snap.after_state->>'id')::uuid AND cliente_id=snap.cliente_id AND whatsapp_config_id=snap.channel_id AND chat_jid=snap.to_jid FOR UPDATE;
 IF current_row.id IS NULL OR to_jsonb(current_row) IS DISTINCT FROM snap.after_state
  OR EXISTS(SELECT 1 FROM public.cliente_whatsapp_inbox i WHERE i.cliente_id=snap.cliente_id AND i.whatsapp_config_id=snap.channel_id AND coalesce(nullif(i.chat_jid,''),i.from_jid)=snap.to_jid AND i.created_at>snap.created_at)
  OR EXISTS(SELECT 1 FROM public.cliente_whatsapp_sent sent WHERE sent.cliente_id=snap.cliente_id AND sent.whatsapp_config_id=snap.channel_id
   AND coalesce(nullif(sent.chat_jid,''),sent.to_jid)=snap.to_jid AND sent.created_at>snap.created_at AND sent.message_id IS DISTINCT FROM snap.provider_message_id) THEN
  UPDATE planeje_private.crm_ia_notification_webhook_snapshots SET status='stale',error_code='interaction_or_version_changed' WHERE id=snap.id;RETURN false;
 END IF;
 IF snap.before_state IS NULL THEN
  -- Child writes do not advance the parent version; keep new parents and every existing or concurrent reference.
  UPDATE planeje_private.crm_ia_notification_webhook_snapshots SET status='stale',error_code='new_conversation_preserved' WHERE id=snap.id;RETURN false;
 ELSE
  previous:=jsonb_populate_record(NULL::public.atendimento_conversas,snap.before_state);
  UPDATE public.atendimento_conversas SET is_group=previous.is_group,display_name=previous.display_name,status=previous.status,fila_id=previous.fila_id,assigned_to=previous.assigned_to,
   last_message_at=previous.last_message_at,last_customer_message_at=previous.last_customer_message_at,awaiting_response_since=previous.awaiting_response_since,
   unread_count=previous.unread_count,last_message_preview=previous.last_message_preview,profile_pic_url=previous.profile_pic_url,updated_at=clock_timestamp()
   WHERE id=current_row.id RETURNING updated_at INTO stamp;
 END IF;
 UPDATE planeje_private.crm_ia_notification_webhook_snapshots SET status='restored',restored_version=stamp WHERE id=snap.id;
 RETURN true;
END$$;
CREATE FUNCTION public.crm_ia_notification_webhook_receipt(p_client uuid,p_channel uuid,p_jid text,p_message text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.crm_ia_outbox;e planeje_private.crm_ia_notification_events;prior public.atendimento_conversas;snap planeje_private.crm_ia_notification_webhook_snapshots;
BEGIN
 IF length(coalesce(p_message,'')) NOT BETWEEN 1 AND 300 OR p_jid IS NULL THEN RETURN '{"notification":false}';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('crm-ia-notification-echo:'||p_client::text||':'||p_channel::text||':'||p_jid,0));
 IF private.crm_ia_notification_webhook_confirmed(p_client,p_channel,p_jid,p_message) THEN RETURN '{"notification":true}';END IF;
 SELECT box.* INTO o FROM public.crm_ia_outbox box JOIN planeje_private.crm_ia_notification_events event ON event.outbox_id=box.id
  WHERE box.cliente_id=p_client AND box.whatsapp_config_id=p_channel AND box.kind='notification' AND box.status='sending' AND box.claimed_at>=clock_timestamp()-interval '5 minutes'
   AND event.recipient_to=p_jid AND event.status='pending' AND EXISTS(SELECT 1 FROM public.crm_ia_transport_claims claim WHERE claim.kind='outbox' AND claim.source_id=box.id AND claim.claim_token=box.claim_token)
  ORDER BY box.claimed_at,box.id LIMIT 1;
 IF o.id IS NULL THEN RETURN '{"notification":false}';END IF;
 SELECT * INTO e FROM planeje_private.crm_ia_notification_events WHERE outbox_id=o.id;
 SELECT * INTO prior FROM public.atendimento_conversas WHERE cliente_id=p_client AND whatsapp_config_id=p_channel AND chat_jid=p_jid FOR SHARE;
 INSERT INTO planeje_private.crm_ia_notification_webhook_snapshots(event_id,outbox_id,claim_token,cliente_id,channel_id,to_jid,provider_message_id,before_state)
 VALUES(e.id,o.id,o.claim_token,p_client,p_channel,p_jid,p_message,CASE WHEN prior.id IS NOT NULL THEN to_jsonb(prior) END) ON CONFLICT DO NOTHING;
 SELECT * INTO snap FROM planeje_private.crm_ia_notification_webhook_snapshots WHERE outbox_id=o.id AND claim_token=o.claim_token AND provider_message_id=p_message;
 RETURN jsonb_build_object('notification',false,'snapshot_id',snap.id);
END$$;
CREATE FUNCTION public.crm_ia_notification_webhook_write(p_snapshot uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE snap planeje_private.crm_ia_notification_webhook_snapshots;actual public.atendimento_conversas;typed public.atendimento_conversas;known boolean;scope jsonb;
BEGIN
 SELECT * INTO snap FROM planeje_private.crm_ia_notification_webhook_snapshots WHERE id=p_snapshot;
 IF snap.id IS NULL THEN RAISE EXCEPTION 'notification_snapshot_unavailable' USING ERRCODE='42501';END IF;
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>200000 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k
  WHERE k NOT IN('cliente_id','whatsapp_config_id','chat_jid','is_group','display_name','status','fila_id','assigned_to','last_message_at','last_customer_message_at','awaiting_response_since','unread_count','last_message_preview','profile_pic_url','updated_at'))
  OR p_payload->>'cliente_id' IS DISTINCT FROM snap.cliente_id::text OR p_payload->>'whatsapp_config_id' IS DISTINCT FROM snap.channel_id::text OR p_payload->>'chat_jid' IS DISTINCT FROM snap.to_jid THEN RAISE EXCEPTION 'notification_snapshot_payload' USING ERRCODE='22023';END IF;
 scope:=jsonb_build_array(snap.event_id,snap.outbox_id,snap.claim_token,snap.cliente_id,snap.channel_id,snap.to_jid,snap.provider_message_id);
 PERFORM pg_advisory_xact_lock(hashtextextended('crm-ia-notification-echo:'||snap.cliente_id::text||':'||snap.channel_id::text||':'||snap.to_jid,0));
 SELECT * INTO snap FROM planeje_private.crm_ia_notification_webhook_snapshots WHERE id=p_snapshot FOR UPDATE;
 IF scope IS DISTINCT FROM jsonb_build_array(snap.event_id,snap.outbox_id,snap.claim_token,snap.cliente_id,snap.channel_id,snap.to_jid,snap.provider_message_id) THEN RETURN '{"notification":false,"conflict":true,"row":null}';END IF;
 known:=private.crm_ia_notification_webhook_confirmed(snap.cliente_id,snap.channel_id,snap.to_jid,snap.provider_message_id);
 IF known THEN
  IF snap.after_state IS NOT NULL THEN PERFORM private.crm_ia_notification_restore_webhook(snap.id);
  ELSE UPDATE planeje_private.crm_ia_notification_webhook_snapshots SET status='restored' WHERE id=snap.id AND status='pending';END IF;
  RETURN '{"notification":true}';
 END IF;
 IF snap.status<>'pending' OR snap.after_state IS NOT NULL THEN RETURN '{"notification":false,"conflict":true,"row":null}';END IF;
 SELECT * INTO actual FROM public.atendimento_conversas WHERE cliente_id=snap.cliente_id AND whatsapp_config_id=snap.channel_id AND chat_jid=snap.to_jid FOR UPDATE;
 IF (CASE WHEN actual.id IS NOT NULL THEN to_jsonb(actual) END) IS DISTINCT FROM snap.before_state THEN
  UPDATE planeje_private.crm_ia_notification_webhook_snapshots SET status='stale',error_code='write_conflict' WHERE id=snap.id;RETURN '{"notification":false,"conflict":true,"row":null}';
 END IF;
 typed:=jsonb_populate_record(NULL::public.atendimento_conversas,coalesce(snap.before_state,'{}')||p_payload);
 IF actual.id IS NULL THEN
  INSERT INTO public.atendimento_conversas(cliente_id,whatsapp_config_id,chat_jid,is_group,display_name,status,fila_id,assigned_to,last_message_at,last_customer_message_at,awaiting_response_since,unread_count,last_message_preview,profile_pic_url,updated_at)
  VALUES(snap.cliente_id,snap.channel_id,snap.to_jid,typed.is_group,typed.display_name,typed.status,typed.fila_id,typed.assigned_to,typed.last_message_at,typed.last_customer_message_at,typed.awaiting_response_since,typed.unread_count,typed.last_message_preview,typed.profile_pic_url,typed.updated_at)
  ON CONFLICT(cliente_id,whatsapp_config_id,chat_jid) DO NOTHING RETURNING * INTO actual;
  IF actual.id IS NULL THEN UPDATE planeje_private.crm_ia_notification_webhook_snapshots SET status='stale',error_code='write_conflict' WHERE id=snap.id;RETURN '{"notification":false,"conflict":true,"row":null}';END IF;
 ELSE
  UPDATE public.atendimento_conversas SET is_group=typed.is_group,display_name=typed.display_name,status=typed.status,fila_id=typed.fila_id,assigned_to=typed.assigned_to,
   last_message_at=typed.last_message_at,last_customer_message_at=typed.last_customer_message_at,awaiting_response_since=typed.awaiting_response_since,
   unread_count=typed.unread_count,last_message_preview=typed.last_message_preview,profile_pic_url=typed.profile_pic_url,updated_at=typed.updated_at
   WHERE id=actual.id RETURNING * INTO actual;
 END IF;
 UPDATE planeje_private.crm_ia_notification_webhook_snapshots SET after_state=to_jsonb(actual) WHERE id=snap.id;
 RETURN jsonb_build_object('notification',false,'conflict',false,'row',to_jsonb(actual));
END$$;
REVOKE ALL ON FUNCTION private.crm_ia_notification_webhook_confirmed(uuid,uuid,text,text),private.crm_ia_notification_restore_webhook(uuid),public.crm_ia_notification_webhook_write(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_ia_notification_webhook_write(uuid,jsonb) TO service_role;

CREATE FUNCTION private.crm_ia_notification_sent_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF to_jsonb(NEW)->>'sent_by' IS NULL AND coalesce(NEW.sender_kind,'automation')='automation' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('crm-ia-notification-echo:'||NEW.cliente_id::text||':'||NEW.whatsapp_config_id::text||':'||coalesce(nullif(NEW.chat_jid,''),NEW.to_jid),0));
  IF private.crm_ia_notification_webhook_confirmed(NEW.cliente_id,NEW.whatsapp_config_id,coalesce(nullif(NEW.chat_jid,''),NEW.to_jid),NEW.message_id) THEN RETURN NULL;END IF;
 END IF;
 RETURN NEW;
END$$;
CREATE TRIGGER crm_ia_notification_sent_guard BEFORE INSERT ON public.cliente_whatsapp_sent FOR EACH ROW EXECUTE FUNCTION private.crm_ia_notification_sent_guard();
REVOKE ALL ON FUNCTION private.crm_ia_notification_sent_guard(),public.crm_ia_notification_webhook_receipt(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_ia_notification_webhook_receipt(uuid,uuid,text,text) TO service_role;

-- The webhook has no provider receipt yet: keep the human pause until an exact ID proves this echo.
CREATE FUNCTION public.crm_ia_notification_echo(p_client uuid,p_channel uuid,p_contact uuid,p_message text,p_expected timestamptz) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ct public.cliente_whatsapp_contact;c public.cliente_atend_conversas;echo planeje_private.crm_ia_notification_echoes;stamp timestamptz;pause boolean;target text;
BEGIN
 IF length(coalesce(p_message,'')) NOT BETWEEN 1 AND 300 THEN RETURN '{"handled":false}';END IF;
 SELECT * INTO ct FROM public.cliente_whatsapp_contact WHERE id=p_contact AND cliente_id=p_client;
 IF ct.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.cliente_whatsapp_config WHERE id=p_channel AND cliente_id=p_client AND archived_at IS NULL) THEN RETURN '{"handled":false}';END IF;
 target:=ct.from_jid;
 PERFORM pg_advisory_xact_lock(hashtextextended('crm-ia-notification-echo:'||p_client::text||':'||p_channel::text||':'||target,0));
 SELECT * INTO c FROM public.cliente_atend_conversas WHERE cliente_id=p_client AND contact_id=p_contact FOR UPDATE;
 SELECT * INTO ct FROM public.cliente_whatsapp_contact WHERE id=p_contact AND cliente_id=p_client FOR SHARE;
 IF ct.id IS NULL OR ct.from_jid IS DISTINCT FROM target OR NOT EXISTS(SELECT 1 FROM public.cliente_whatsapp_config WHERE id=p_channel AND cliente_id=p_client AND archived_at IS NULL) THEN RETURN '{"handled":false}';END IF;
 IF EXISTS(SELECT 1 FROM planeje_private.crm_ia_notification_receipts receipt JOIN public.crm_ia_outbox o ON o.id=receipt.outbox_id
  JOIN planeje_private.crm_ia_notification_events e ON e.id=receipt.event_id
  WHERE receipt.cliente_id=p_client AND receipt.channel_id=p_channel AND receipt.to_jid=ct.from_jid AND receipt.provider_message_id=p_message
   AND o.claim_token=receipt.claim_token AND o.status IN('sending','sent') AND o.cliente_id=p_client AND o.whatsapp_config_id=p_channel
   AND (receipt.purpose='main' AND e.main_outbox_id=o.id OR receipt.purpose='notification' AND e.outbox_id=o.id)
   AND EXISTS(SELECT 1 FROM public.crm_ia_transport_claims WHERE kind='outbox' AND source_id=o.id AND claim_token=receipt.claim_token)) THEN RETURN '{"handled":true,"confirmed":true}';END IF;
 IF c.id IS NULL OR c.updated_at IS DISTINCT FROM p_expected THEN RETURN '{"handled":false}';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.crm_ia_outbox o JOIN planeje_private.crm_ia_notification_events e ON e.cliente_id=o.cliente_id AND e.channel_id=o.whatsapp_config_id
  WHERE o.cliente_id=p_client AND o.whatsapp_config_id=p_channel AND o.status='sending' AND o.claimed_at>=clock_timestamp()-interval '5 minutes'
   AND (e.outbox_id=o.id AND e.recipient_to=ct.from_jid AND e.status='pending' OR e.main_outbox_id=o.id AND e.source_jid=ct.from_jid AND e.status='awaiting_reply')
   AND EXISTS(SELECT 1 FROM public.crm_ia_transport_claims WHERE kind='outbox' AND source_id=o.id AND claim_token=o.claim_token)) THEN RETURN '{"handled":false}';END IF;
 SELECT * INTO echo FROM planeje_private.crm_ia_notification_echoes WHERE cliente_id=p_client AND channel_id=p_channel AND contact_id=p_contact AND provider_message_id=p_message FOR UPDATE;
 IF echo.conversation_id IS NOT NULL THEN RETURN jsonb_build_object('handled',echo.status='pending' AND echo.marked_version=c.updated_at);END IF;
 SELECT coalesce(data#>>'{attendance,pause_on_human}','true')<>'false' INTO pause FROM public.crm_ia_config WHERE cliente_id=p_client;
 UPDATE public.cliente_atend_conversas SET status=CASE WHEN c.status='finalizado' THEN c.status ELSE 'entrada' END,
 status_at=CASE WHEN c.status='finalizado' THEN c.status_at ELSE clock_timestamp() END,ia_pausada=CASE WHEN coalesce(pause,true) THEN true ELSE c.ia_pausada END,
 ia_followup_due_at=NULL,ia_followup_passo=0,ia_followup_delivery_state='cancelled',crm_ia_runtime=crm_ia_runtime||jsonb_build_object('last_human_at',clock_timestamp()),updated_at=clock_timestamp()
 WHERE id=c.id RETURNING updated_at INTO stamp;
 INSERT INTO planeje_private.crm_ia_notification_echoes(cliente_id,channel_id,contact_id,provider_message_id,conversation_id,to_jid,previous_state,previous_version,marked_version)
 VALUES(p_client,p_channel,p_contact,p_message,c.id,ct.from_jid,to_jsonb(c),c.updated_at,stamp);
 RETURN '{"handled":true,"confirmed":false}';
END$$;

-- Only a successful provider response from the consumed lease can reconcile a provisional pause.
CREATE FUNCTION public.crm_ia_notification_note_receipt(p_id uuid,p_claim_token uuid,p_message text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.crm_ia_outbox;e planeje_private.crm_ia_notification_events;receipt planeje_private.crm_ia_notification_receipts;
 marker planeje_private.crm_ia_notification_echoes;current_marker planeje_private.crm_ia_notification_echoes;c public.cliente_atend_conversas;
 target text;purpose text;stamp timestamptz;previous public.cliente_atend_conversas;snapshot_key uuid;scope jsonb;
BEGIN
 SELECT * INTO e FROM planeje_private.crm_ia_notification_events WHERE main_outbox_id=p_id OR outbox_id=p_id;
 IF e.id IS NULL THEN RETURN '{"handled":false}';END IF;
 purpose:=CASE WHEN e.main_outbox_id=p_id THEN 'main' ELSE 'notification' END;target:=CASE WHEN purpose='main' THEN e.source_jid ELSE e.recipient_to END;
 IF target IS NULL THEN RETURN '{"handled":true,"recorded":false}';END IF;
 scope:=jsonb_build_array(e.id,e.cliente_id,e.channel_id,purpose,target,e.run_id,e.contact_id,e.lead_id,e.actor_id,e.main_outbox_id,e.outbox_id,e.source_jid);
 -- Snapshot inserts acquire FK locks on these parents; every echo path takes the advisory first.
 PERFORM pg_advisory_xact_lock(hashtextextended('crm-ia-notification-echo:'||e.cliente_id::text||':'||e.channel_id::text||':'||target,0));
 SELECT * INTO o FROM public.crm_ia_outbox WHERE id=p_id FOR UPDATE;
 SELECT * INTO e FROM planeje_private.crm_ia_notification_events WHERE id=(scope->>0)::uuid AND (main_outbox_id=p_id OR outbox_id=p_id) FOR UPDATE;
 purpose:=CASE WHEN e.main_outbox_id=p_id THEN 'main' ELSE 'notification' END;target:=CASE WHEN purpose='main' THEN e.source_jid ELSE e.recipient_to END;
 IF o.id IS NULL OR o.claim_token IS DISTINCT FROM p_claim_token OR p_claim_token IS NULL OR o.status NOT IN('sending','sent')
  OR scope IS DISTINCT FROM jsonb_build_array(e.id,e.cliente_id,e.channel_id,purpose,target,e.run_id,e.contact_id,e.lead_id,e.actor_id,e.main_outbox_id,e.outbox_id,e.source_jid)
  OR (o.cliente_id,o.whatsapp_config_id,o.contact_id,o.lead_id,o.created_by,o.agent_run_id) IS DISTINCT FROM (e.cliente_id,e.channel_id,e.contact_id,e.lead_id,e.actor_id,e.run_id)
  OR (purpose='notification' AND o.kind IS DISTINCT FROM 'notification') OR (purpose='main' AND o.kind NOT IN('reply','followup'))
  OR o.claimed_at<clock_timestamp()-interval '5 minutes' OR length(coalesce(p_message,'')) NOT BETWEEN 1 AND 300 OR p_message ~ '^sent_[0-9]+$'
  OR NOT EXISTS(SELECT 1 FROM public.crm_ia_transport_claims WHERE kind='outbox' AND source_id=p_id AND claim_token=p_claim_token) THEN RETURN '{"handled":true,"recorded":false}';END IF;
 SELECT * INTO receipt FROM planeje_private.crm_ia_notification_receipts WHERE outbox_id=p_id;
 IF receipt.outbox_id IS NOT NULL THEN RETURN jsonb_build_object('handled',true,'recorded',receipt.claim_token=p_claim_token AND receipt.provider_message_id=p_message AND receipt.to_jid=target);END IF;
 INSERT INTO planeje_private.crm_ia_notification_receipts(outbox_id,event_id,cliente_id,channel_id,to_jid,claim_token,provider_message_id,purpose)
 VALUES(p_id,e.id,e.cliente_id,e.channel_id,target,p_claim_token,p_message,purpose);
 IF purpose='notification' THEN
  -- Only rows created by this operation are moved; their complete record remains private and linked to the provider receipt.
  WITH moved AS(DELETE FROM public.cliente_whatsapp_sent sent USING public.crm_ia_transport_claims claim
   WHERE claim.kind='outbox' AND claim.source_id=p_id AND claim.claim_token=p_claim_token AND sent.created_at>=claim.started_at
    AND sent.cliente_id=e.cliente_id AND sent.whatsapp_config_id=e.channel_id AND coalesce(nullif(sent.chat_jid,''),sent.to_jid)=target AND sent.message_id=p_message
    AND to_jsonb(sent)->>'sent_by' IS NULL AND coalesce(sent.sender_kind,'automation')='automation' RETURNING sent.*)
  INSERT INTO planeje_private.crm_ia_notification_sent_archive(sent_id,outbox_id,event_id,record)
   SELECT moved.id,p_id,e.id,to_jsonb(moved) FROM moved;
 END IF;

 FOR marker IN SELECT * FROM planeje_private.crm_ia_notification_echoes WHERE cliente_id=e.cliente_id AND channel_id=e.channel_id AND to_jid=target AND provider_message_id=p_message AND status='pending' LOOP
  SELECT * INTO c FROM public.cliente_atend_conversas WHERE id=marker.conversation_id AND cliente_id=e.cliente_id AND contact_id=marker.contact_id FOR UPDATE;
  SELECT * INTO current_marker FROM planeje_private.crm_ia_notification_echoes WHERE cliente_id=marker.cliente_id AND channel_id=marker.channel_id AND contact_id=marker.contact_id AND provider_message_id=marker.provider_message_id FOR UPDATE;
  IF current_marker.status<>'pending' THEN CONTINUE;END IF;
  IF c.id IS NULL OR c.updated_at IS DISTINCT FROM current_marker.marked_version OR NOT EXISTS(SELECT 1 FROM public.cliente_whatsapp_contact WHERE id=c.contact_id AND cliente_id=e.cliente_id AND from_jid=target) THEN
   UPDATE planeje_private.crm_ia_notification_echoes SET status='stale' WHERE cliente_id=marker.cliente_id AND channel_id=marker.channel_id AND contact_id=marker.contact_id AND provider_message_id=p_message;CONTINUE;
  END IF;
  previous:=jsonb_populate_record(NULL::public.cliente_atend_conversas,current_marker.previous_state);
  UPDATE public.cliente_atend_conversas SET status=previous.status,status_at=previous.status_at,ia_pausada=previous.ia_pausada,ia_followup_due_at=previous.ia_followup_due_at,
   ia_followup_passo=previous.ia_followup_passo,ia_followup_delivery_state=previous.ia_followup_delivery_state,crm_ia_runtime=previous.crm_ia_runtime,updated_at=clock_timestamp()
   WHERE id=c.id RETURNING updated_at INTO stamp;
  UPDATE planeje_private.crm_ia_notification_echoes SET status='reconciled',restored_version=stamp WHERE cliente_id=marker.cliente_id AND channel_id=marker.channel_id AND contact_id=marker.contact_id AND provider_message_id=p_message;
  IF e.contact_id=c.contact_id AND e.source_updated_at=current_marker.previous_version THEN
   UPDATE planeje_private.crm_ia_notification_events SET source_updated_at=stamp WHERE id=e.id;
   UPDATE public.crm_ia_outbox SET source_updated_at=stamp WHERE id=p_id AND source_updated_at=current_marker.previous_version;
  END IF;
 END LOOP;
 IF purpose='notification' THEN
  UPDATE planeje_private.crm_ia_notification_webhook_snapshots SET status='stale',error_code='different_provider_message' WHERE outbox_id=p_id AND claim_token=p_claim_token AND provider_message_id<>p_message AND status='pending';
  FOR snapshot_key IN SELECT id FROM planeje_private.crm_ia_notification_webhook_snapshots WHERE outbox_id=p_id AND claim_token=p_claim_token AND provider_message_id=p_message AND status='pending' LOOP
   PERFORM private.crm_ia_notification_restore_webhook(snapshot_key);
  END LOOP;
 END IF;
 RETURN '{"handled":true,"recorded":true}';
END$$;
REVOKE ALL ON FUNCTION public.crm_ia_notification_echo(uuid,uuid,uuid,text,timestamptz),public.crm_ia_notification_note_receipt(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_ia_notification_echo(uuid,uuid,uuid,text,timestamptz),public.crm_ia_notification_note_receipt(uuid,uuid,text) TO service_role;

CREATE FUNCTION private.crm_ia_notification_restart() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF OLD.crm_ia_runtime->>'closed'='true' AND NEW.crm_ia_runtime='{}'::jsonb AND NOT NEW.ia_pausada AND NEW.status='esperando' THEN
  INSERT INTO planeje_private.crm_ia_notification_cycles(conversation_id) VALUES(NEW.id) ON CONFLICT(conversation_id) DO UPDATE SET cycle_id=gen_random_uuid();
 END IF;RETURN NEW;
END$$;
CREATE TRIGGER crm_ia_notification_restart AFTER UPDATE OF crm_ia_runtime ON public.cliente_atend_conversas FOR EACH ROW EXECUTE FUNCTION private.crm_ia_notification_restart();

CREATE FUNCTION private.crm_ia_notification_recipient(p_client uuid,p_channel uuid,p_contact uuid,p_lead uuid,p_kind text,p_person uuid,p_phone text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE person public.profiles;phone text;
BEGIN
 IF p_kind='phone' THEN phone:=private.crm_ia_notification_phone(p_phone);
 ELSE
  SELECT * INTO person FROM public.profiles WHERE id=p_person AND status='active';
  IF person.id IS NULL OR NOT coalesce(private.crm_ia_calendar_owner(p_client,p_person,p_lead,p_contact),false)
   OR NOT coalesce(public.atendimento_user_can_send_on_whatsapp_config(p_person,p_client,p_channel),false) THEN RETURN '{"allowed":false,"reason":"recipient_unavailable"}';END IF;
  phone:=private.crm_ia_notification_phone(person.whatsapp);
 END IF;
 IF phone IS NULL THEN RETURN '{"allowed":false,"reason":"recipient_phone_unavailable"}';END IF;
 RETURN jsonb_build_object('allowed',true,'person_id',person.id,'phone',phone,'to',phone||'@s.whatsapp.net','label',coalesce(person.full_name,phone));
END$$;
ALTER FUNCTION public.crm_ia_apply_agent_action(uuid,jsonb,text,jsonb) RENAME TO crm_ia_apply_agent_action_pre_notifications;
REVOKE ALL ON FUNCTION public.crm_ia_apply_agent_action_pre_notifications(uuid,jsonb,text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.crm_ia_apply_agent_action(p_run uuid,p_action jsonb,p_reply text,p_followup jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r planeje_private.crm_ia_agent_runs;result jsonb;a public.cliente_atend_ia_agentes;l public.leads;c public.cliente_atend_conversas;ct public.cliente_whatsapp_contact;
 app public.crm_ia_appointments;main public.crm_ia_outbox;kind text:=p_action->>'type';settings jsonb;recipient jsonb;recipient_kind text;person uuid;cycle text;summary text;body text;fingerprint text;source_key uuid;
BEGIN
 SELECT * INTO r FROM planeje_private.crm_ia_agent_runs WHERE id=p_run FOR UPDATE;
 IF r.status='queued' THEN RETURN r.result;END IF;
 IF p_action ? 'summary' AND (kind NOT IN('qualify','book') OR jsonb_typeof(p_action->'summary') IS DISTINCT FROM 'string' OR length(p_action->>'summary')>1200) THEN RAISE EXCEPTION 'crm_ia_invalid_summary' USING ERRCODE='22023';END IF;
 result:=public.crm_ia_apply_agent_action_pre_notifications(p_run,p_action,p_reply,p_followup);
 IF r.status IS DISTINCT FROM 'claimed' OR result->>'queued' IS DISTINCT FROM 'true' OR kind NOT IN('qualify','book') THEN RETURN result;END IF;
 SELECT * INTO a FROM public.cliente_atend_ia_agentes WHERE id=r.agent_id;
 IF kind='qualify' AND a.funil#>>'{crm_ia,notification,enabled}' IS DISTINCT FROM 'true' OR kind='book' AND a.funil#>>'{crm_ia,agendamento,notify_owner}' IS DISTINCT FROM 'true' THEN RETURN result;END IF;
 SELECT * INTO l FROM public.leads WHERE id=r.lead_id FOR SHARE;
 SELECT * INTO ct FROM public.cliente_whatsapp_contact WHERE id=r.contact_id FOR SHARE;
 SELECT * INTO c FROM public.cliente_atend_conversas WHERE cliente_id=r.cliente_id AND contact_id=r.contact_id FOR UPDATE;
 SELECT * INTO main FROM public.crm_ia_outbox WHERE id=(result->>'outbox_id')::uuid AND agent_run_id=r.id;
 IF main.id IS NULL OR c.id IS NULL THEN RETURN result;END IF;
 IF kind='qualify' THEN
  INSERT INTO planeje_private.crm_ia_notification_cycles(conversation_id) VALUES(c.id) ON CONFLICT DO NOTHING;
  SELECT cycle_id::text INTO cycle FROM planeje_private.crm_ia_notification_cycles WHERE conversation_id=c.id;
  settings:=a.funil#>'{crm_ia,notification,recipient}';recipient_kind:=settings->>'type';person:=CASE WHEN recipient_kind='lead_owner' THEN l.responsavel_id WHEN recipient_kind='person' THEN nullif(settings->>'person_id','')::uuid END;
 ELSE
  SELECT * INTO app FROM public.crm_ia_appointments WHERE id=(result#>>'{appointment,id}')::uuid AND cliente_id=r.cliente_id AND request_id=r.id AND lead_id=r.lead_id AND contact_id=r.contact_id;
  IF app.id IS NULL OR app.status NOT IN('scheduled','confirmed') THEN RETURN result;END IF;
  cycle:=app.id::text;recipient_kind:='lead_owner';person:=app.owner_id;
 END IF;
 recipient:=private.crm_ia_notification_recipient(r.cliente_id,r.channel_id,r.contact_id,r.lead_id,recipient_kind,person,settings->>'phone');
 SELECT i.id INTO source_key FROM public.cliente_whatsapp_inbox i WHERE i.id::text=r.snapshot->>'source_inbox_id' AND i.cliente_id=r.cliente_id AND i.whatsapp_config_id=r.channel_id
  AND coalesce(nullif(i.chat_jid,''),i.from_jid)=ct.from_jid AND i.message_id=r.snapshot->>'source_message_id' AND i.type IS NOT DISTINCT FROM r.snapshot->>'source_message_type';
 IF source_key IS NULL THEN recipient:=recipient||'{"allowed":false,"reason":"source_unavailable"}';END IF;
 summary:=coalesce(nullif(btrim(p_action->>'summary'),''),CASE WHEN coalesce(l.crm_ia_fields,'{}')<>'{}'::jsonb THEN left(l.crm_ia_fields::text,1200) END,'');
 body:=CASE WHEN kind='qualify' THEN 'Qualificação concluída: ' ELSE 'Agendamento confirmado: ' END||coalesce(l.nome,'Lead')||'.'||CASE WHEN app.id IS NOT NULL THEN ' '||to_char(app.start_at AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY HH24:MI')||'.' ELSE '' END||CASE WHEN summary<>'' THEN E'\n'||summary ELSE '' END;
 SELECT md5(coalesce(token,'')||':'||coalesce(subdomain,'')) INTO fingerprint FROM public.cliente_whatsapp_config WHERE id=r.channel_id;
 INSERT INTO planeje_private.crm_ia_notification_events(run_id,cliente_id,channel_id,contact_id,lead_id,agent_id,actor_id,event_kind,cycle_key,main_outbox_id,config_revision,agent_updated_at,
 source_jid,source_phone,source_inbox_id,source_message_id,source_message_type,source_updated_at,lead_updated_at,owner_id,channel_fingerprint,
 recipient_type,recipient_person_id,recipient_phone,recipient_to,recipient_label,appointment_id,appointment_updated_at,body,status,error_code)
 VALUES(r.id,r.cliente_id,r.channel_id,r.contact_id,r.lead_id,r.agent_id,r.actor_id,kind,cycle,main.id,main.config_revision,a.updated_at,ct.from_jid,ct.phone,source_key,
 r.snapshot->>'source_message_id',r.snapshot->>'source_message_type',c.updated_at,l.updated_at,l.responsavel_id,fingerprint,
 recipient_kind,person,recipient->>'phone',recipient->>'to',recipient->>'label',app.id,app.updated_at,left(body,4000),CASE WHEN recipient->>'allowed'='true' THEN 'awaiting_reply' ELSE 'skipped' END,recipient->>'reason')
 ON CONFLICT DO NOTHING;
 RETURN result;
END$$;

-- Every mutable authorization is checked after the last row lock, including a recipient changed while waiting.
CREATE FUNCTION private.crm_ia_notification_state(p_event uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e planeje_private.crm_ia_notification_events;r planeje_private.crm_ia_agent_runs;cfg public.crm_ia_config;a public.cliente_atend_ia_agentes;l public.leads;
 c public.cliente_atend_conversas;ct public.cliente_whatsapp_contact;ch public.cliente_whatsapp_config;app public.crm_ia_appointments;main public.crm_ia_outbox;recipient jsonb;calendar jsonb;reason text;person uuid;
BEGIN
 SELECT * INTO e FROM planeje_private.crm_ia_notification_events WHERE id=p_event FOR UPDATE;
 SELECT * INTO r FROM planeje_private.crm_ia_agent_runs WHERE id=e.run_id FOR SHARE;
 SELECT * INTO cfg FROM public.crm_ia_config WHERE cliente_id=e.cliente_id FOR SHARE;
 SELECT * INTO a FROM public.cliente_atend_ia_agentes WHERE id=e.agent_id FOR SHARE;
 SELECT * INTO l FROM public.leads WHERE id=e.lead_id FOR SHARE;
 SELECT * INTO ct FROM public.cliente_whatsapp_contact WHERE id=e.contact_id FOR SHARE;
 SELECT * INTO c FROM public.cliente_atend_conversas WHERE cliente_id=e.cliente_id AND contact_id=e.contact_id FOR SHARE;
 SELECT * INTO ch FROM public.cliente_whatsapp_config WHERE id=e.channel_id FOR SHARE;
 SELECT * INTO main FROM public.crm_ia_outbox WHERE id=e.main_outbox_id FOR SHARE;
 IF e.appointment_id IS NOT NULL THEN
  SELECT * INTO app FROM public.crm_ia_appointments WHERE id=e.appointment_id FOR SHARE;
  PERFORM 1 FROM planeje_private.crm_ia_calendar_sync_jobs WHERE appointment_id=e.appointment_id FOR SHARE;
  PERFORM 1 FROM planeje_private.crm_ia_calendar_connections WHERE cliente_id=e.cliente_id AND owner_id=app.owner_id FOR SHARE;
 END IF;
 PERFORM 1 FROM public.profiles WHERE id IN(e.actor_id,e.recipient_person_id) ORDER BY id FOR SHARE;
 PERFORM 1 FROM public.cliente_whatsapp_inbox WHERE id=e.source_inbox_id FOR SHARE;
 IF e.id IS NULL OR r.id IS NULL OR r.status<>'queued' OR r.result->>'outbox_id' IS DISTINCT FROM e.main_outbox_id::text OR main.agent_run_id IS DISTINCT FROM r.id
  OR (r.cliente_id,r.channel_id,r.contact_id,r.lead_id,r.agent_id,r.actor_id) IS DISTINCT FROM(e.cliente_id,e.channel_id,e.contact_id,e.lead_id,e.agent_id,e.actor_id)
  OR (main.cliente_id,main.whatsapp_config_id,main.contact_id,main.lead_id) IS DISTINCT FROM (e.cliente_id,e.channel_id,e.contact_id,e.lead_id)
  OR NOT(main.kind='reply' AND r.mode='responder' OR main.kind='followup' AND r.mode='followup') OR main.request_id IS DISTINCT FROM r.id
  OR main.status<>'sent' OR nullif(main.provider_message_id,'') IS NULL OR main.provider_message_id ~ '^sent_[0-9]+$'
  OR NOT EXISTS(SELECT 1 FROM public.crm_ia_transport_claims WHERE kind='outbox' AND source_id=main.id AND claim_token=main.claim_token) THEN reason:='main_reply_unconfirmed';
 ELSIF NOT coalesce(private.crm_ia_appointment_actor(e.cliente_id,e.channel_id,e.contact_id,e.lead_id,e.actor_id),false) THEN reason:='actor_unavailable';
 ELSIF cfg.revision IS DISTINCT FROM e.config_revision OR main.config_revision IS DISTINCT FROM e.config_revision OR cfg.revision IS DISTINCT FROM (r.snapshot->>'config_revision')::uuid
  OR cfg.data#>>'{attendance,auto_send}' IS DISTINCT FROM 'true' OR a.cliente_id IS DISTINCT FROM e.cliente_id
  OR a.updated_at IS DISTINCT FROM e.agent_updated_at OR a.updated_at IS DISTINCT FROM (r.snapshot->>'agent_updated_at')::timestamptz OR NOT coalesce(a.ativo AND a.auto_responder,false)
  OR (e.event_kind='qualify' AND a.funil#>>'{crm_ia,notification,enabled}' IS DISTINCT FROM 'true') OR (e.event_kind='book' AND a.funil#>>'{crm_ia,agendamento,notify_owner}' IS DISTINCT FROM 'true') THEN reason:='automation_changed';
 ELSIF c.id IS NULL OR c.updated_at IS DISTINCT FROM e.source_updated_at OR c.crm_ia_runtime->>'delivery_run_id' IS DISTINCT FROM r.id::text
  OR ct.from_jid IS DISTINCT FROM e.source_jid OR ct.phone IS DISTINCT FROM e.source_phone OR ct.cliente_id IS DISTINCT FROM e.cliente_id
  OR l.cliente_id IS DISTINCT FROM e.cliente_id OR l.crm_ia_archived_at IS NOT NULL OR l.updated_at IS DISTINCT FROM e.lead_updated_at OR l.responsavel_id IS DISTINCT FROM e.owner_id THEN reason:='source_changed';
 ELSIF ch.cliente_id IS DISTINCT FROM e.cliente_id OR ch.archived_at IS NOT NULL OR ch.provider IS DISTINCT FROM 'uazapi'
  OR md5(coalesce(ch.token,'')||':'||coalesce(ch.subdomain,'')) IS DISTINCT FROM e.channel_fingerprint THEN reason:='channel_changed';
 ELSIF NOT EXISTS(SELECT 1 FROM public.cliente_whatsapp_inbox i WHERE i.id=e.source_inbox_id AND i.cliente_id=e.cliente_id AND i.whatsapp_config_id=e.channel_id
  AND coalesce(nullif(i.chat_jid,''),i.from_jid)=e.source_jid AND i.message_id=e.source_message_id AND i.type IS NOT DISTINCT FROM e.source_message_type
  AND (r.mode='responder' AND r.message_id=i.message_id OR r.mode='followup' AND c.crm_ia_runtime->>'source_inbox_id'=i.id::text AND c.crm_ia_runtime->>'source_message_id'=i.message_id AND c.crm_ia_runtime->>'source_message_type' IS NOT DISTINCT FROM i.type)
  AND NOT coalesce(i.is_group,false) AND i.media_purged_at IS NULL
  AND NOT jsonb_path_exists(coalesce(i.raw_payload,'{}'),'$.**.fromMe ? (@ == true || @ == "true" || @ == 1)')
  AND NOT jsonb_path_exists(coalesce(i.raw_payload,'{}'),'$.**.from_me ? (@ == true || @ == "true" || @ == 1)')
  AND i.id=(SELECT latest.id FROM public.cliente_whatsapp_inbox latest WHERE latest.cliente_id=e.cliente_id AND latest.whatsapp_config_id=e.channel_id
   AND coalesce(nullif(latest.chat_jid,''),latest.from_jid)=e.source_jid AND NOT coalesce(latest.is_group,false) ORDER BY latest.created_at DESC,latest.id DESC LIMIT 1)) THEN reason:='source_changed';
 ELSIF e.appointment_id IS NOT NULL AND (app.id IS NULL OR app.cliente_id IS DISTINCT FROM e.cliente_id OR app.lead_id IS DISTINCT FROM e.lead_id OR app.contact_id IS DISTINCT FROM e.contact_id
  OR app.updated_at IS DISTINCT FROM e.appointment_updated_at OR app.status NOT IN('scheduled','confirmed') OR app.start_at<=clock_timestamp()) THEN reason:='appointment_changed';
 END IF;
 IF reason IS NULL AND e.appointment_id IS NOT NULL THEN
  calendar:=private.crm_ia_calendar_confirmation(e.appointment_id);
  IF (calendar->>'source_version')::timestamptz IS DISTINCT FROM e.appointment_updated_at OR NOT(calendar->>'required'='false' OR calendar->>'state'='ready' AND calendar->>'verified'='true') THEN reason:='calendar_confirmation_unavailable';END IF;
 END IF;
 IF reason IS NULL THEN
  person:=CASE WHEN e.event_kind='book' THEN app.owner_id WHEN e.recipient_type='lead_owner' THEN l.responsavel_id ELSE nullif(a.funil#>>'{crm_ia,notification,recipient,person_id}','')::uuid END;
  recipient:=private.crm_ia_notification_recipient(e.cliente_id,e.channel_id,e.contact_id,e.lead_id,e.recipient_type,person,CASE WHEN e.recipient_type='phone' THEN a.funil#>>'{crm_ia,notification,recipient,phone}' END);
  IF recipient->>'allowed' IS DISTINCT FROM 'true' OR recipient->>'person_id' IS DISTINCT FROM e.recipient_person_id::text OR recipient->>'to' IS DISTINCT FROM e.recipient_to THEN reason:='recipient_changed';
  ELSE reason:=planeje_private.crm_ia_delivery_config(e.cliente_id,e.recipient_phone,cfg.revision,true);END IF;
 END IF;
 RETURN jsonb_build_object('allowed',reason IS NULL,'reason',reason);
END$$;

-- Preserve this base OID so an already cached legacy path can never resolve an internal notice as a contact reply.
CREATE OR REPLACE FUNCTION public.crm_ia_delivery_recheck_base(p_id uuid,p_claim_token uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare row public.crm_ia_outbox%rowtype;target jsonb;reason text;conversation public.cliente_atend_conversas%rowtype;last_message timestamptz;
begin
 select * into row from public.crm_ia_outbox where id=p_id for update;
 if not found or row.status<>'sending' or row.claim_token is distinct from p_claim_token or p_claim_token is null then
  return '{"allowed":false,"reason":"claim_lost"}';end if;
 if row.kind='notification' then return '{"allowed":false,"reason":"notification_requires_receipt"}';end if;
 target=planeje_private.crm_ia_delivery_target(row.cliente_id,row.whatsapp_config_id,row.contact_id);
 if target->>'allowed'<>'true' then reason=target->>'reason';
 elsif not public.cliente_atend_loja_habilitada(row.cliente_id) then reason='module_disabled';
 elsif not exists(select 1 from public.profiles p where p.id=row.created_by and p.status='active'
   and (p.role in ('superadmin','admin','colaborador') or (p.role='cliente' and p.cliente_id=row.cliente_id))) then reason='creator_unavailable';
 else reason=planeje_private.crm_ia_delivery_config(row.cliente_id,target->>'phone',row.config_revision,row.kind<>'manual');end if;
 if reason is null and row.kind<>'manual' and nullif(to_jsonb(row)->>'appointment_id','') is null then
  select * into conversation from public.cliente_atend_conversas where cliente_id=row.cliente_id and contact_id=row.contact_id;
  select last_message_at into last_message from public.cliente_whatsapp_contact where id=row.contact_id and cliente_id=row.cliente_id;
  if not found or conversation.id is null or ((conversation.ia_pausada or conversation.status='finalizado')
    and coalesce(to_jsonb(conversation)#>>'{crm_ia_runtime,delivery_run_id}','')<>coalesce(to_jsonb(row)->>'agent_run_id','no_run'))
    or row.source_updated_at is null or conversation.updated_at is distinct from row.source_updated_at
    or last_message>row.created_at then reason='source_changed';end if;
 end if;
 if reason is not null then
  update public.crm_ia_outbox set status='cancelled',error_code=reason where id=row.id;
  return jsonb_build_object('allowed',false,'reason',reason);
 end if;
 return (target-'phone')||jsonb_build_object('id',row.id,'claim_token',row.claim_token,'body',row.body,
  'media_descriptor',coalesce(to_jsonb(row)->'media_descriptor','{}'::jsonb));
end $$;

ALTER FUNCTION public.crm_ia_delivery_finish(uuid,uuid,text,text,text) RENAME TO crm_ia_delivery_finish_pre_notifications;
REVOKE ALL ON FUNCTION public.crm_ia_delivery_finish_pre_notifications(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.crm_ia_delivery_finish_pre_notifications(p_id uuid,p_claim_token uuid,p_status text,p_message_id text default null,p_error_code text default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare item public.crm_ia_outbox;followup jsonb;ok boolean;c public.cliente_atend_conversas;echo jsonb;stamp timestamptz;
begin
 if exists(select 1 from public.crm_ia_outbox where id=p_id and kind='notification') then
  return public.crm_ia_delivery_finish_base(p_id,p_claim_token,p_status,p_message_id,p_error_code);end if;
 ok=public.crm_ia_delivery_finish_base(p_id,p_claim_token,p_status,p_message_id,p_error_code);
 if not ok then return false;end if;
 select * into item from public.crm_ia_outbox where id=p_id;
 if item.agent_run_id is not null and p_status='sent' and nullif(p_message_id,'') is not null then
  select * into c from public.cliente_atend_conversas where cliente_id=item.cliente_id and contact_id=item.contact_id for update;
  echo=c.crm_ia_runtime->'pending_api_echo';
  if echo->>'message_id'=p_message_id and echo->>'channel_id'=item.whatsapp_config_id::text
    and (echo->>'version')::timestamptz=c.updated_at and echo->>'previous_paused'='false' and c.ia_pausada then
   update public.cliente_atend_conversas set ia_pausada=false,status=coalesce(echo->>'previous_status',status),
    ia_followup_due_at=nullif(echo->>'previous_due_at','')::timestamptz,ia_followup_delivery_state=coalesce(echo->>'previous_delivery_state','pending'),
    crm_ia_runtime=crm_ia_runtime-'pending_api_echo',updated_at=now() where id=c.id returning updated_at into stamp;
   if item.kind<>'reminder' then update public.crm_ia_outbox set source_updated_at=stamp where id=item.id;item.source_updated_at=stamp;end if;
  end if;
 end if;
 if item.agent_run_id is not null and item.kind<>'reminder' then
  select crm_ia_runtime->'pending_followup' into followup from public.cliente_atend_conversas where cliente_id=item.cliente_id and contact_id=item.contact_id and updated_at=item.source_updated_at;
  update public.cliente_atend_conversas set ia_respondeu_em=case when p_status='sent' then clock_timestamp() else ia_respondeu_em end,
   ia_followup_due_at=case when p_status='sent' and not ia_pausada then nullif(followup->>'due_at','')::timestamptz end,
   ia_followup_passo=coalesce((followup->>'passo')::integer,0),ia_followup_delivery_state=case when p_status='sent' and followup->>'due_at' is not null then 'pending' else p_status end,
   crm_ia_runtime=crm_ia_runtime||jsonb_build_object('silence_started_at',followup->>'anchor','followup_agent_id',followup->>'agent_id','followup_agent_updated_at',followup->>'agent_updated_at'),
   updated_at=clock_timestamp() where cliente_id=item.cliente_id and contact_id=item.contact_id and updated_at=item.source_updated_at;
 end if;
 return true;
end $$;
CREATE FUNCTION public.crm_ia_delivery_finish(p_id uuid,p_claim_token uuid,p_status text,p_message_id text DEFAULT NULL,p_error_code text DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.crm_ia_outbox;e planeje_private.crm_ia_notification_events;c public.cliente_atend_conversas;before_version timestamptz;ok boolean;state jsonb;notice uuid;
BEGIN
 SELECT * INTO item FROM public.crm_ia_outbox WHERE id=p_id FOR UPDATE;
 IF item.kind='notification' THEN
  ok:=public.crm_ia_delivery_finish_base(p_id,p_claim_token,p_status,p_message_id,p_error_code);
  IF ok THEN UPDATE planeje_private.crm_ia_notification_events SET status=p_status,error_code=p_error_code WHERE outbox_id=p_id;END IF;RETURN ok;
 END IF;
 SELECT * INTO e FROM planeje_private.crm_ia_notification_events WHERE main_outbox_id=p_id AND status='awaiting_reply' FOR UPDATE;
 IF e.id IS NOT NULL THEN SELECT * INTO c FROM public.cliente_atend_conversas WHERE cliente_id=e.cliente_id AND contact_id=e.contact_id FOR UPDATE;before_version:=c.updated_at;END IF;
 ok:=public.crm_ia_delivery_finish_pre_notifications(p_id,p_claim_token,p_status,p_message_id,p_error_code);
 IF NOT ok OR e.id IS NULL THEN RETURN ok;END IF;
 IF p_status<>'sent' OR nullif(p_message_id,'') IS NULL OR before_version IS DISTINCT FROM item.source_updated_at OR before_version IS DISTINCT FROM e.source_updated_at
  OR NOT EXISTS(SELECT 1 FROM public.crm_ia_transport_claims WHERE kind='outbox' AND source_id=p_id AND claim_token=p_claim_token) THEN
  UPDATE planeje_private.crm_ia_notification_events SET status='cancelled',error_code='main_reply_unconfirmed' WHERE id=e.id;RETURN ok;
 END IF;
 -- Only this receipt's own finish may advance the version while the source row remains locked.
 SELECT updated_at INTO before_version FROM public.cliente_atend_conversas WHERE id=c.id;
 UPDATE planeje_private.crm_ia_notification_events SET source_updated_at=before_version WHERE id=e.id;
 state:=private.crm_ia_notification_state(e.id);
 IF state->>'allowed' IS DISTINCT FROM 'true' THEN UPDATE planeje_private.crm_ia_notification_events SET status='cancelled',error_code=state->>'reason' WHERE id=e.id;RETURN ok;END IF;
 INSERT INTO public.crm_ia_outbox(cliente_id,whatsapp_config_id,contact_id,lead_id,kind,body,scheduled_at,request_id,created_by,source_updated_at,config_revision,agent_run_id)
 VALUES(e.cliente_id,e.channel_id,e.contact_id,e.lead_id,'notification',e.body,clock_timestamp(),e.id,e.actor_id,before_version,item.config_revision,e.run_id) RETURNING id INTO notice;
 UPDATE planeje_private.crm_ia_notification_events SET outbox_id=notice,status='pending' WHERE id=e.id;
 RETURN ok;
END$$;
-- An internal notice shares the existing lease with deliveries to the same canonical destination.
CREATE OR REPLACE FUNCTION public.crm_ia_delivery_claim(p_now timestamptz DEFAULT clock_timestamp(),p_ids uuid[] DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE picked public.crm_ia_outbox;claimed public.crm_ia_outbox;result jsonb:='[]';target_jid text;
BEGIN
  UPDATE public.crm_ia_outbox SET status='uncertain',error_code='lease_expired' WHERE status='sending' AND claimed_at<clock_timestamp()-interval '5 minutes';
  UPDATE public.crm_ia_outbox SET status='failed',error_code='file_not_dispatched',updated_at=clock_timestamp()
    WHERE status='pending' AND media_descriptor<>'{}'::jsonb AND created_at<clock_timestamp()-interval '5 minutes';
  UPDATE planeje_private.crm_ia_notification_webhook_snapshots SET status='stale',error_code='callback_incomplete' WHERE status='pending' AND created_at<clock_timestamp()-interval '5 minutes';
  FOR picked IN SELECT o.* FROM public.crm_ia_outbox o WHERE o.status='pending' AND o.attempts=0 AND o.scheduled_at<=p_now
    AND (p_ids IS NOT NULL OR o.media_descriptor='{}'::jsonb) AND (p_ids IS NULL OR o.id=ANY(p_ids))
    AND private.crm_ia_calendar_outbox_state(o)->>'eligible'='true'
    ORDER BY o.scheduled_at,o.id LIMIT 25 FOR UPDATE SKIP LOCKED LOOP
    SELECT CASE WHEN picked.kind='notification' THEN (SELECT recipient_to FROM planeje_private.crm_ia_notification_events WHERE outbox_id=picked.id)
      ELSE (SELECT from_jid FROM public.cliente_whatsapp_contact WHERE id=picked.contact_id AND cliente_id=picked.cliente_id) END INTO target_jid;
    IF NOT pg_try_advisory_xact_lock(hashtextextended('crm-ia-destination:'||picked.cliente_id::text||':'||picked.whatsapp_config_id::text||':'||coalesce(target_jid,picked.id::text),0)) THEN CONTINUE;END IF;
    IF EXISTS(SELECT 1 FROM public.crm_ia_outbox active LEFT JOIN planeje_private.crm_ia_notification_events e ON e.outbox_id=active.id
      LEFT JOIN public.cliente_whatsapp_contact c ON c.id=active.contact_id AND c.cliente_id=active.cliente_id
      WHERE active.cliente_id=picked.cliente_id AND active.whatsapp_config_id=picked.whatsapp_config_id AND active.status='sending'
       AND (picked.kind='notification' OR active.kind='notification') AND coalesce(e.recipient_to,c.from_jid)=target_jid) THEN CONTINUE;END IF;
    IF EXISTS(SELECT 1 FROM planeje_private.crm_ia_notification_webhook_snapshots snap JOIN planeje_private.crm_ia_notification_receipts receipt
      ON receipt.outbox_id=snap.outbox_id AND receipt.claim_token=snap.claim_token AND receipt.provider_message_id=snap.provider_message_id AND receipt.purpose='notification'
      WHERE snap.cliente_id=picked.cliente_id AND snap.channel_id=picked.whatsapp_config_id AND snap.to_jid=target_jid AND snap.status='pending') THEN CONTINUE;END IF;
    IF NOT private.crm_ia_calendar_prepare(picked.id) THEN CONTINUE; END IF;
    UPDATE public.crm_ia_outbox SET status='sending',claim_token=gen_random_uuid(),claimed_at=clock_timestamp(),attempts=attempts+1
      WHERE id=picked.id AND status='pending' AND attempts=0 RETURNING * INTO claimed;
    IF FOUND THEN result:=result||jsonb_build_array(to_jsonb(claimed)); END IF;
  END LOOP;
  RETURN result;
END $$;

ALTER FUNCTION public.crm_ia_delivery_recheck(uuid,uuid) RENAME TO crm_ia_delivery_recheck_pre_notifications;
REVOKE ALL ON FUNCTION public.crm_ia_delivery_recheck_pre_notifications(uuid,uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.crm_ia_delivery_recheck(p_id uuid,p_claim_token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.crm_ia_outbox;e planeje_private.crm_ia_notification_events;state jsonb;target jsonb;
BEGIN
 SELECT * INTO item FROM public.crm_ia_outbox WHERE id=p_id FOR UPDATE;
 IF item.kind IS DISTINCT FROM 'notification' THEN
  target:=public.crm_ia_delivery_recheck_pre_notifications(p_id,p_claim_token);
  IF target->>'allowed'='true' THEN SELECT * INTO e FROM planeje_private.crm_ia_notification_events WHERE main_outbox_id=p_id AND status='awaiting_reply';
   IF e.id IS NOT NULL THEN target:=target||jsonb_build_object('notification_event',e.id);END IF;
  END IF;RETURN target;
 END IF;
 IF item.status<>'sending' OR item.claim_token IS DISTINCT FROM p_claim_token OR p_claim_token IS NULL OR item.claimed_at<clock_timestamp()-interval '5 minutes' THEN RETURN '{"allowed":false,"reason":"claim_lost"}';END IF;
 SELECT * INTO e FROM planeje_private.crm_ia_notification_events WHERE outbox_id=item.id AND run_id=item.agent_run_id AND status='pending';
 IF e.id IS NULL OR (item.cliente_id,item.whatsapp_config_id,item.contact_id,item.lead_id,item.created_by,item.body,item.source_updated_at)
  IS DISTINCT FROM(e.cliente_id,e.channel_id,e.contact_id,e.lead_id,e.actor_id,e.body,e.source_updated_at) OR item.config_revision IS DISTINCT FROM e.config_revision OR item.media_descriptor<>'{}'::jsonb
  OR EXISTS(SELECT 1 FROM planeje_private.crm_ia_voice_deliveries v WHERE v.outbox_id=item.id) THEN state:='{"allowed":false,"reason":"notification_proof_unavailable"}';
 ELSE state:=private.crm_ia_notification_state(e.id);END IF;
 IF state->>'allowed' IS DISTINCT FROM 'true' THEN
  UPDATE public.crm_ia_outbox SET status='cancelled',error_code=state->>'reason' WHERE id=p_id;
  UPDATE planeje_private.crm_ia_notification_events SET status='cancelled',error_code=state->>'reason' WHERE id=e.id;
  RETURN state;
 END IF;
 RETURN jsonb_build_object('allowed',true,'id',item.id,'claim_token',item.claim_token,'cliente_id',e.cliente_id,'whatsapp_config_id',e.channel_id,'contact_id',e.contact_id,'to',e.recipient_to,'body',e.body,
 'internal_notification',jsonb_build_object('event_id',e.id,'source_contact_id',e.contact_id,'recipient_type',e.recipient_type,'recipient_person_id',e.recipient_person_id,'to',e.recipient_to));
END$$;

ALTER FUNCTION public.crm_ia_workspace(text,uuid,jsonb) RENAME TO crm_ia_workspace_pre_notifications;
REVOKE ALL ON FUNCTION public.crm_ia_workspace_pre_notifications(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.crm_ia_workspace(p_action text,p_client_id uuid DEFAULT NULL,p_payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;limit_n integer:=greatest(1,least(100,coalesce((p_payload->>'limit')::integer,30)));offset_n integer:=greatest(0,coalesce((p_payload->>'offset')::integer,0));
BEGIN
 IF p_action IS DISTINCT FROM 'queue' THEN RETURN public.crm_ia_workspace_pre_notifications(p_action,p_client_id,p_payload);END IF;
 IF NOT coalesce(private.crm_ia_client(p_client_id),false) THEN RAISE EXCEPTION 'Sem acesso a esta conta.' USING ERRCODE='42501';END IF;
 WITH filtered AS(
 SELECT o.id,o.contact_id,o.whatsapp_config_id,o.body,o.scheduled_at,o.status,o.kind,o.created_at,o.updated_at,o.error_code,o.sent_at,o.voice_status,o.voice_error_code,o.calendar_fallback,
 ch.name AS channel_name,jsonb_build_object('id',ct.id,'nome',coalesce(nullif(ct.mini_crm->>'contato_nome',''),nullif(ct.sender_name,''),'Contato sem nome'),'phone',ct.phone) AS contact,
 CASE WHEN l.id IS NOT NULL THEN jsonb_build_object('id',l.id,'nome',l.nome) END AS source_lead,
 CASE WHEN o.kind='notification' THEN e.recipient_label END AS recipient_label,CASE WHEN o.kind='notification' THEN e.recipient_phone END AS recipient_phone,
 CASE WHEN o.kind='notification' THEN e.recipient_type END AS recipient_type,
 CASE WHEN coalesce(o.calendar_appointment_id,o.appointment_id) IS NOT NULL THEN (SELECT jsonb_build_object('required',v->'required','state',v->'state','verified',v->'verified','reason',v->'reason') FROM (SELECT private.crm_ia_calendar_confirmation(coalesce(o.calendar_appointment_id,o.appointment_id)) AS v) confirmation) END AS calendar
 FROM public.crm_ia_outbox o JOIN public.cliente_whatsapp_contact ct ON ct.id=o.contact_id AND ct.cliente_id=o.cliente_id
 JOIN public.cliente_whatsapp_config ch ON ch.id=o.whatsapp_config_id AND ch.cliente_id=o.cliente_id
 LEFT JOIN public.leads l ON l.id=o.lead_id AND l.cliente_id=o.cliente_id LEFT JOIN planeje_private.crm_ia_notification_events e ON e.outbox_id=o.id
 WHERE o.cliente_id=p_client_id AND private.crm_ia_contact(p_client_id,o.contact_id) AND private.crm_ia_channel(p_client_id,o.whatsapp_config_id)
 AND (o.lead_id IS NULL OR private.crm_ia_lead(o.lead_id,p_client_id))
 AND (private.crm_ia_role() IN('admin','superadmin') OR o.created_by=auth.uid()) AND (o.kind<>'notification' OR private.crm_ia_agent_manager(p_client_id))
 AND (nullif(p_payload->>'contact_id','') IS NULL OR o.contact_id=(p_payload->>'contact_id')::uuid)
 AND (nullif(p_payload->>'channel_id','') IS NULL OR o.whatsapp_config_id=(p_payload->>'channel_id')::uuid)
 ),page AS(SELECT * FROM filtered ORDER BY scheduled_at DESC,id DESC LIMIT limit_n OFFSET offset_n)
 SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.scheduled_at DESC,p.id DESC) FROM page p),'[]'),'total',(SELECT count(*) FROM filtered)) INTO result;
 RETURN result;
END$$;
REVOKE ALL ON FUNCTION private.crm_ia_notification_phone(text),private.crm_ia_notification_config(jsonb,uuid),private.crm_ia_agent_notification_guard(),private.crm_ia_template(text,jsonb),private.crm_ia_notification_restart(),
 private.crm_ia_notification_recipient(uuid,uuid,uuid,uuid,text,uuid,text),private.crm_ia_notification_state(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.crm_ia_apply_agent_action(uuid,jsonb,text,jsonb),public.crm_ia_delivery_finish(uuid,uuid,text,text,text),public.crm_ia_delivery_recheck(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_ia_apply_agent_action(uuid,jsonb,text,jsonb),public.crm_ia_delivery_finish(uuid,uuid,text,text,text),public.crm_ia_delivery_recheck(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.crm_ia_workspace(text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_ia_workspace(text,uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
