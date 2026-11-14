BEGIN;

-- The webhook persists inbox before its optimistic conversation update. Invalidate that version atomically.
CREATE FUNCTION private.crm_ia_inbound_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF NEW.is_group IS DISTINCT FROM false OR NEW.cliente_id IS NULL OR nullif(btrim(NEW.message_id),'') IS NULL THEN RETURN NEW; END IF;
  IF current_user<>'service_role' AND NOT pg_has_role(current_user,
    (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='private.crm_ia_inbound_revision()'::regprocedure),'USAGE') THEN RETURN NEW; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.crm_ia_config WHERE cliente_id=NEW.cliente_id) THEN RETURN NEW; END IF;
  IF public.cliente_atend_loja_habilitada(NEW.cliente_id) IS NOT TRUE THEN RETURN NEW; END IF;
  -- Take the CRM lock before INSERT acquires its Atendimento FK lock; replay takes no version update.
  IF TG_WHEN='BEFORE' THEN
    PERFORM 1 FROM public.cliente_atend_conversas c JOIN public.cliente_whatsapp_contact ct ON ct.id=c.contact_id AND ct.cliente_id=c.cliente_id
    WHERE c.cliente_id=NEW.cliente_id AND ct.from_jid=coalesce(nullif(NEW.chat_jid,''),NEW.from_jid) FOR NO KEY UPDATE OF c;
    RETURN NEW;
  END IF;
  UPDATE public.cliente_atend_conversas c SET updated_at=clock_timestamp()
  FROM public.cliente_whatsapp_contact ct
  WHERE c.cliente_id=NEW.cliente_id AND c.contact_id=ct.id AND ct.cliente_id=NEW.cliente_id
    AND ct.from_jid=coalesce(nullif(NEW.chat_jid,''),NEW.from_jid);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.crm_ia_inbound_revision() FROM PUBLIC,anon,authenticated,service_role;
DO $$DECLARE person text;BEGIN
  SELECT pg_get_userbyid(proowner) INTO person FROM pg_proc WHERE oid='public.crm_ia_delivery_start(text,uuid,uuid)'::regprocedure;
  EXECUTE format('ALTER FUNCTION private.crm_ia_inbound_revision() OWNER TO %I',person);
END$$;
CREATE TRIGGER crm_ia_inbound_revision_lock BEFORE INSERT ON public.cliente_whatsapp_inbox
FOR EACH ROW EXECUTE FUNCTION private.crm_ia_inbound_revision();
CREATE TRIGGER crm_ia_inbound_revision AFTER INSERT ON public.cliente_whatsapp_inbox
FOR EACH ROW EXECUTE FUNCTION private.crm_ia_inbound_revision();

CREATE OR REPLACE FUNCTION public.crm_ia_delivery_start(p_kind text,p_id uuid,p_claim_token uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE target jsonb;
BEGIN
  IF p_kind='outbox' THEN target:=public.crm_ia_delivery_recheck(p_id,p_claim_token);
  ELSIF p_kind IN ('reminder','followup') THEN target:=public.crm_ia_legacy_delivery_recheck(p_kind,p_id,p_claim_token);
  ELSE RETURN false; END IF;
  IF target->>'allowed' IS DISTINCT FROM 'true' OR
    (p_kind<>'followup' AND public.crm_ia_delivery_actor_check(p_id,p_kind)->>'allowed' IS DISTINCT FROM 'true') THEN RETURN false; END IF;
  INSERT INTO public.crm_ia_transport_claims(kind,source_id,claim_token) VALUES(p_kind,p_id,p_claim_token) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN false; END IF;
  -- A future/manual draft does not answer the contact; only the first transport records its version.
  IF p_kind='outbox' THEN
    UPDATE public.crm_ia_outbox o SET source_updated_at=c.updated_at
    FROM public.cliente_atend_conversas c
    WHERE o.id=p_id AND o.kind='manual' AND o.agent_run_id IS NULL
      AND c.cliente_id=o.cliente_id AND c.contact_id=o.contact_id;
  END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.crm_ia_delivery_finish_base(p_id uuid,p_claim_token uuid,p_status text,p_message_id text DEFAULT NULL,p_error_code text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE item public.crm_ia_outbox;
BEGIN
  IF p_status NOT IN ('sent','failed','uncertain') THEN RAISE EXCEPTION 'crm_ia_delivery_status';END IF;
  UPDATE public.crm_ia_outbox SET status=p_status,sent_at=CASE WHEN p_status='sent' THEN clock_timestamp() END,
    provider_message_id=left(p_message_id,300),error_code=CASE WHEN p_error_code ~ '^[a-z_]{1,60}$' THEN p_error_code END
  WHERE id=p_id AND status='sending' AND claim_token=p_claim_token AND p_claim_token IS NOT NULL
  RETURNING * INTO item;
  IF NOT FOUND THEN RETURN false; END IF;
  IF item.kind='manual' AND item.agent_run_id IS NULL AND p_status='sent' AND nullif(btrim(p_message_id),'') IS NOT NULL
    AND item.source_updated_at IS NOT NULL
    AND EXISTS(SELECT 1 FROM public.crm_ia_transport_claims WHERE kind='outbox' AND source_id=p_id AND claim_token=p_claim_token) THEN
    -- A newer inbound or human edit must retain its state even while this receipt is being written.
    UPDATE public.cliente_atend_conversas SET status='entrada',status_at=item.sent_at,updated_at=clock_timestamp()
    WHERE cliente_id=item.cliente_id AND contact_id=item.contact_id AND status='esperando' AND updated_at=item.source_updated_at;
  END IF;
  RETURN true;
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;
