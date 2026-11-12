BEGIN;
CREATE TABLE planeje_private.crm_ia_calendar_connections(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cliente_id uuid NOT NULL REFERENCES public.clientes(id),owner_id uuid NOT NULL REFERENCES public.profiles(id),
 encrypted_token text,oauth_client_id text,google_subject text,google_email text,scopes jsonb NOT NULL DEFAULT '[]',
 calendar_id text,calendar_name text,time_zone text NOT NULL DEFAULT 'UTC',access_role text,
 status text NOT NULL DEFAULT 'disconnected' CHECK(status IN('disconnected','awaiting_calendar','connected','error')),
 revision uuid NOT NULL DEFAULT gen_random_uuid(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(cliente_id,owner_id)
);
CREATE TABLE planeje_private.crm_ia_calendar_oauth_nonces(
 nonce_hash text PRIMARY KEY CHECK(nonce_hash~'^[a-f0-9]{64}$'),cliente_id uuid NOT NULL REFERENCES public.clientes(id),owner_id uuid NOT NULL REFERENCES public.profiles(id),
 session_id uuid NOT NULL REFERENCES auth.sessions(id) ON DELETE CASCADE,oauth_client_id text NOT NULL,redirect_uri text NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '10 minutes',claimed_at timestamptz,completed_at timestamptz
);
CREATE TABLE planeje_private.crm_ia_calendar_busy(
 connection_id uuid PRIMARY KEY REFERENCES planeje_private.crm_ia_calendar_connections(id) ON DELETE CASCADE,connection_revision uuid NOT NULL,
 since_at timestamptz NOT NULL,until_at timestamptz NOT NULL,busy jsonb NOT NULL CHECK(jsonb_typeof(busy)='array'),
 ignored_appointment_id uuid REFERENCES public.crm_ia_appointments(id),ignored_version timestamptz,
 checked_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '90 seconds',CHECK(until_at>since_at)
);
CREATE TABLE planeje_private.crm_ia_calendar_sync_jobs(
 appointment_id uuid PRIMARY KEY REFERENCES public.crm_ia_appointments(id),connection_id uuid NOT NULL REFERENCES planeje_private.crm_ia_calendar_connections(id),
 desired_version timestamptz NOT NULL,desired_action text NOT NULL CHECK(desired_action IN('upsert','delete')),
 event_id text NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','claimed','synced','cancelled','uncertain','failed','conflict','disconnected')),
 lease uuid,lease_until timestamptz,claimed_version timestamptz,claimed_revision uuid,claimed_calendar_id text,
 attempts integer NOT NULL DEFAULT 0,uncertain_write boolean NOT NULL DEFAULT false,next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 receipt jsonb,receipts jsonb NOT NULL DEFAULT '[]',error_code text,updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX crm_ia_calendar_pending ON planeje_private.crm_ia_calendar_sync_jobs(next_attempt_at) WHERE status IN('pending','claimed','uncertain');
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['crm_ia_calendar_connections','crm_ia_calendar_oauth_nonces','crm_ia_calendar_busy','crm_ia_calendar_sync_jobs'] LOOP
 EXECUTE format('ALTER TABLE planeje_private.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON planeje_private.%I FROM PUBLIC,anon,authenticated',t);
 EXECUTE format('GRANT ALL ON planeje_private.%I TO service_role',t);
END LOOP;END$$;

CREATE FUNCTION private.crm_ia_calendar_owner(p_client uuid,p_owner uuid,p_lead uuid DEFAULT NULL,p_contact uuid DEFAULT NULL) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(private.crm_ia_agent_actor(p_client,p_owner) AND
  (p_lead IS NULL OR EXISTS(SELECT 1 FROM public.leads l JOIN public.profiles p ON p.id=p_owner WHERE l.id=p_lead AND l.cliente_id=p_client
   AND (p.role IN('admin','superadmin') OR NOT EXISTS(SELECT 1 FROM public.user_module_access a WHERE a.user_id=p_owner AND a.module_name::text='crm' AND a.access_level::text='responsible') OR l.responsavel_id=p_owner)))
  AND (p_contact IS NULL OR EXISTS(SELECT 1 FROM public.cliente_whatsapp_contact c WHERE c.id=p_contact AND c.cliente_id=p_client))
  AND NOT EXISTS(SELECT 1 FROM public.cliente_atend_conversas c JOIN public.profiles p ON p.id=p_owner
   WHERE c.cliente_id=p_client AND c.contact_id=p_contact AND c.privado AND c.assigned_to IS DISTINCT FROM p_owner AND p.role<>'superadmin'),false)
$$;
CREATE FUNCTION private.crm_ia_calendar_enqueue() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c planeje_private.crm_ia_calendar_connections;j planeje_private.crm_ia_calendar_sync_jobs;
BEGIN
 SELECT * INTO j FROM planeje_private.crm_ia_calendar_sync_jobs x WHERE x.appointment_id=NEW.id FOR UPDATE;
 IF TG_OP='UPDATE' AND (OLD.owner_id IS DISTINCT FROM NEW.owner_id OR OLD.cliente_id IS DISTINCT FROM NEW.cliente_id) AND j.appointment_id IS NOT NULL AND j.status<>'cancelled' THEN RAISE EXCEPTION 'calendar_owner_change_requires_cancel';END IF;
 SELECT * INTO c FROM planeje_private.crm_ia_calendar_connections x WHERE x.cliente_id=NEW.cliente_id AND x.owner_id=NEW.owner_id AND x.status='connected';
 IF c.id IS NULL THEN RETURN NEW;END IF;
 SELECT * INTO j FROM planeje_private.crm_ia_calendar_sync_jobs x WHERE x.appointment_id=NEW.id FOR UPDATE;
 IF j.connection_id IS NOT NULL AND j.connection_id<>c.id AND j.status<>'cancelled' THEN RAISE EXCEPTION 'calendar_owner_change_requires_cancel';END IF;
 INSERT INTO planeje_private.crm_ia_calendar_sync_jobs(appointment_id,connection_id,desired_version,desired_action,event_id)
 VALUES(NEW.id,c.id,NEW.updated_at,CASE WHEN NEW.status='cancelled' THEN 'delete' ELSE 'upsert' END,replace(NEW.id::text,'-',''))
 ON CONFLICT(appointment_id) DO UPDATE SET connection_id=excluded.connection_id,desired_version=excluded.desired_version,desired_action=excluded.desired_action,
  status=CASE WHEN planeje_private.crm_ia_calendar_sync_jobs.status='claimed' THEN 'claimed' ELSE 'pending' END,
  next_attempt_at=clock_timestamp(),attempts=0,error_code=NULL,updated_at=clock_timestamp();
 RETURN NEW;
END$$;
CREATE TRIGGER crm_ia_calendar_enqueue AFTER INSERT OR UPDATE OF updated_at,status,owner_id,start_at,end_at ON public.crm_ia_appointments
 FOR EACH ROW EXECUTE FUNCTION private.crm_ia_calendar_enqueue();

CREATE FUNCTION private.crm_ia_calendar_slot_guard(p_client uuid,p_owner uuid,p_start timestamptz,p_end timestamptz,p_ignore uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c planeje_private.crm_ia_calendar_connections;b planeje_private.crm_ia_calendar_busy;free_slot boolean;
BEGIN
 SELECT * INTO c FROM planeje_private.crm_ia_calendar_connections x WHERE x.cliente_id=p_client AND x.owner_id=p_owner;
 IF c.id IS NULL OR c.calendar_id IS NULL OR c.status='disconnected' THEN RETURN '{"required":false,"verified":false,"free":null}';END IF;
 SELECT * INTO b FROM planeje_private.crm_ia_calendar_busy x WHERE x.connection_id=c.id AND x.connection_revision=c.revision AND c.status='connected'
  AND x.since_at<=p_start AND x.until_at>=p_end AND x.expires_at>clock_timestamp() AND x.ignored_appointment_id IS NOT DISTINCT FROM p_ignore
  AND (p_ignore IS NULL OR EXISTS(SELECT 1 FROM public.crm_ia_appointments a WHERE a.id=p_ignore AND a.cliente_id=p_client AND a.owner_id=p_owner AND a.updated_at=x.ignored_version));
 IF b.connection_id IS NULL THEN RETURN '{"required":true,"verified":false,"free":null,"reason":"external_busy_not_verified"}';END IF;
 SELECT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(b.busy) v WHERE (v->>'start')::timestamptz<p_end AND (v->>'end')::timestamptz>p_start) INTO free_slot;
 RETURN jsonb_build_object('required',true,'verified',true,'free',free_slot,'checked_at',b.checked_at,'expires_at',b.expires_at,'connection_revision',c.revision);
END$$;

CREATE FUNCTION public.crm_ia_calendar_workspace(p_action text,p_payload jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE client uuid:=nullif(p_payload->>'client_id','')::uuid;owner_key uuid:=auth.uid();c planeje_private.crm_ia_calendar_connections;b planeje_private.crm_ia_calendar_busy;n planeje_private.crm_ia_calendar_oauth_nonces;
 a public.crm_ia_appointments;ignore_event text;
BEGIN
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>30000 OR owner_key IS NULL OR NOT coalesce(private.crm_ia_client(client),false) THEN RAISE EXCEPTION 'calendar_acesso' USING ERRCODE='42501';END IF;
 IF p_action<>'busy' AND nullif(p_payload->>'owner_id','')::uuid IS NOT NULL AND (p_payload->>'owner_id')::uuid<>owner_key THEN RAISE EXCEPTION 'calendar_owner' USING ERRCODE='42501';END IF;
 IF p_action='busy' THEN owner_key=coalesce(nullif(p_payload->>'owner_id','')::uuid,owner_key);END IF;
 SELECT * INTO c FROM planeje_private.crm_ia_calendar_connections x WHERE x.cliente_id=client AND x.owner_id=owner_key;
 IF p_action='status' THEN RETURN jsonb_build_object('connected',coalesce(c.status='connected',false),'status',coalesce(c.status,'disconnected'),'revision',c.revision,'email',c.google_email,'calendar_id',c.calendar_id,'calendar_name',c.calendar_name,'time_zone',c.time_zone,'policy','busy_only_generic_title');
 ELSIF p_action='begin' THEN
  IF nullif(p_payload->>'nonce_hash','') IS NULL OR nullif(p_payload->>'oauth_client_id','') IS NULL OR nullif(p_payload->>'redirect_uri','') IS NULL THEN RAISE EXCEPTION 'calendar_state_invalid';END IF;
  INSERT INTO planeje_private.crm_ia_calendar_oauth_nonces(nonce_hash,cliente_id,owner_id,session_id,oauth_client_id,redirect_uri)
   VALUES(p_payload->>'nonce_hash',client,owner_key,(auth.jwt()->>'session_id')::uuid,p_payload->>'oauth_client_id',p_payload->>'redirect_uri');
  RETURN '{"ok":true}';
 ELSIF p_action='finalize_claim' THEN
  UPDATE planeje_private.crm_ia_calendar_oauth_nonces x SET claimed_at=clock_timestamp()
   WHERE x.nonce_hash=p_payload->>'nonce_hash' AND x.cliente_id=client AND x.owner_id=owner_key
    AND x.session_id=(auth.jwt()->>'session_id')::uuid AND x.claimed_at IS NULL AND x.expires_at>clock_timestamp()
    AND EXISTS(SELECT 1 FROM auth.sessions s WHERE s.id=x.session_id AND s.user_id=owner_key)
    AND private.crm_ia_calendar_owner(client,owner_key) RETURNING * INTO n;
  IF n.nonce_hash IS NULL THEN RAISE EXCEPTION 'calendar_nonce_or_session_invalid' USING ERRCODE='42501';END IF;
  RETURN to_jsonb(n);
 ELSIF p_action='disconnect' THEN
  UPDATE planeje_private.crm_ia_calendar_connections x SET status='disconnected',encrypted_token=NULL,revision=gen_random_uuid(),updated_at=clock_timestamp() WHERE x.id=c.id;
  DELETE FROM planeje_private.crm_ia_calendar_oauth_nonces x WHERE x.cliente_id=client AND x.owner_id=owner_key;
  DELETE FROM planeje_private.crm_ia_calendar_busy WHERE connection_id=c.id;
  UPDATE planeje_private.crm_ia_calendar_sync_jobs SET status='disconnected',error_code='connection_revoked' WHERE connection_id=c.id;
  RETURN '{"ok":true,"connected":false,"status":"disconnected"}';
 ELSIF p_action='busy' THEN
  IF NOT private.crm_ia_calendar_owner(client,owner_key,nullif(p_payload->>'lead_id','')::uuid,NULL) THEN RAISE EXCEPTION 'calendar_owner_acesso' USING ERRCODE='42501';END IF;
  IF p_payload->>'lead_id' IS NOT NULL AND NOT private.crm_ia_lead((p_payload->>'lead_id')::uuid,client) THEN RAISE EXCEPTION 'calendar_lead_acesso' USING ERRCODE='42501';END IF;
  IF nullif(p_payload->>'appointment_id','') IS NOT NULL THEN
   SELECT * INTO a FROM public.crm_ia_appointments x WHERE x.id=(p_payload->>'appointment_id')::uuid AND x.cliente_id=client AND x.owner_id=owner_key;
   IF a.id IS NULL OR (a.lead_id IS NOT NULL AND NOT private.crm_ia_lead(a.lead_id,client)) OR NOT private.crm_ia_calendar_owner(client,owner_key,a.lead_id,a.contact_id) THEN RAISE EXCEPTION 'calendar_appointment_acesso' USING ERRCODE='42501';END IF;
   SELECT q.event_id INTO ignore_event FROM planeje_private.crm_ia_calendar_sync_jobs q WHERE q.appointment_id=a.id AND q.connection_id=c.id AND q.receipt->>'event_id'=q.event_id;
  END IF;
  SELECT * INTO b FROM planeje_private.crm_ia_calendar_busy WHERE connection_id=c.id AND connection_revision=c.revision AND expires_at>clock_timestamp() AND c.status='connected'
   AND ignored_appointment_id IS NOT DISTINCT FROM a.id;
  RETURN jsonb_build_object('required',coalesce(c.calendar_id IS NOT NULL AND c.status<>'disconnected',false),'status',coalesce(c.status,'disconnected'),
   'connected',coalesce(c.status='connected',false),'fresh',b.connection_id IS NOT NULL,'busy',CASE WHEN b.connection_id IS NOT NULL THEN b.busy END,'since',b.since_at,'until',b.until_at,'checked_at',b.checked_at,'expires_at',b.expires_at,'connection_revision',c.revision,'ignore_event_id',ignore_event,'appointment_id',a.id);
 END IF;
 RAISE EXCEPTION 'calendar_action_invalid';
END$$;
REVOKE ALL ON FUNCTION public.crm_ia_calendar_workspace(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_ia_calendar_workspace(text,jsonb) TO authenticated;

CREATE FUNCTION public.crm_ia_calendar_service(p_action text,p_payload jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n planeje_private.crm_ia_calendar_oauth_nonces;c planeje_private.crm_ia_calendar_connections;j planeje_private.crm_ia_calendar_sync_jobs;
 a public.crm_ia_appointments;b planeje_private.crm_ia_calendar_busy;result jsonb:='[]';item jsonb;next_status text;allowed boolean;record_receipt jsonb;ignore_event text;same_calendar boolean;changed_calendar boolean;
BEGIN
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>1000000 THEN RAISE EXCEPTION 'calendar_payload';END IF;
 IF p_action='nonce_info' THEN
  SELECT * INTO n FROM planeje_private.crm_ia_calendar_oauth_nonces x
   WHERE x.nonce_hash=p_payload->>'nonce_hash' AND x.claimed_at IS NULL AND x.expires_at>clock_timestamp()
    AND EXISTS(SELECT 1 FROM auth.sessions s WHERE s.id=x.session_id AND s.user_id=x.owner_id)
    AND private.crm_ia_calendar_owner(x.cliente_id,x.owner_id);
  IF n.nonce_hash IS NULL THEN RAISE EXCEPTION 'calendar_nonce_invalid';END IF;
  RETURN jsonb_build_object('cliente_id',n.cliente_id,'oauth_client_id',n.oauth_client_id,'redirect_uri',n.redirect_uri);
 ELSIF p_action='grant' THEN
  SELECT * INTO n FROM planeje_private.crm_ia_calendar_oauth_nonces x WHERE x.nonce_hash=p_payload->>'nonce_hash' AND x.claimed_at IS NOT NULL AND x.completed_at IS NULL AND x.expires_at>clock_timestamp() FOR UPDATE;
  IF n.nonce_hash IS NULL OR NOT private.crm_ia_calendar_owner(n.cliente_id,n.owner_id) OR NOT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.id=n.session_id AND s.user_id=n.owner_id)
   OR nullif(p_payload->>'encrypted_token','') IS NULL THEN RAISE EXCEPTION 'calendar_nonce_or_owner';END IF;
  INSERT INTO planeje_private.crm_ia_calendar_connections(cliente_id,owner_id,encrypted_token,oauth_client_id,google_subject,google_email,scopes,status)
   VALUES(n.cliente_id,n.owner_id,p_payload->>'encrypted_token',n.oauth_client_id,p_payload->>'google_subject',p_payload->>'google_email',coalesce(p_payload->'scopes','[]'),'awaiting_calendar')
  ON CONFLICT(cliente_id,owner_id) DO UPDATE SET encrypted_token=excluded.encrypted_token,oauth_client_id=excluded.oauth_client_id,google_subject=excluded.google_subject,
   google_email=excluded.google_email,scopes=excluded.scopes,status='awaiting_calendar',revision=gen_random_uuid(),updated_at=clock_timestamp() RETURNING * INTO c;
  UPDATE planeje_private.crm_ia_calendar_oauth_nonces SET completed_at=clock_timestamp() WHERE nonce_hash=n.nonce_hash;
  RETURN jsonb_build_object('status',c.status,'revision',c.revision);
 ELSIF p_action='busy_target' THEN
  IF NOT private.crm_ia_calendar_owner((p_payload->>'client_id')::uuid,(p_payload->>'owner_id')::uuid,nullif(p_payload->>'lead_id','')::uuid,NULL) THEN RAISE EXCEPTION 'calendar_owner_acesso';END IF;
  SELECT * INTO c FROM planeje_private.crm_ia_calendar_connections x WHERE x.cliente_id=(p_payload->>'client_id')::uuid AND x.owner_id=(p_payload->>'owner_id')::uuid;
  IF c.id IS NULL OR c.calendar_id IS NULL OR c.status='disconnected' THEN RETURN '{"required":false,"fresh":false,"status":"disconnected","busy":null}';END IF;
  IF nullif(p_payload->>'appointment_id','') IS NOT NULL THEN
   SELECT * INTO a FROM public.crm_ia_appointments x WHERE x.id=(p_payload->>'appointment_id')::uuid AND x.cliente_id=c.cliente_id AND x.owner_id=c.owner_id;
   IF a.id IS NULL OR NOT private.crm_ia_calendar_owner(c.cliente_id,c.owner_id,a.lead_id,a.contact_id) THEN RAISE EXCEPTION 'calendar_appointment_acesso';END IF;
   SELECT q.event_id INTO ignore_event FROM planeje_private.crm_ia_calendar_sync_jobs q WHERE q.appointment_id=a.id AND q.connection_id=c.id AND q.receipt->>'event_id'=q.event_id;
  END IF;
  RETURN to_jsonb(c)||jsonb_build_object('required',true,'ignore_event_id',ignore_event,'appointment_id',a.id);
 ELSIF p_action IN('connection','select','busy') THEN
  SELECT * INTO c FROM planeje_private.crm_ia_calendar_connections x WHERE x.cliente_id=(p_payload->>'client_id')::uuid AND x.owner_id=(p_payload->>'owner_id')::uuid FOR UPDATE;
  IF c.id IS NULL OR NOT private.crm_ia_calendar_owner(c.cliente_id,c.owner_id) THEN RAISE EXCEPTION 'calendar_connection_unavailable';END IF;
  IF p_action='connection' THEN RETURN to_jsonb(c);END IF;
  IF c.revision IS DISTINCT FROM (p_payload->>'revision')::uuid OR c.status NOT IN('awaiting_calendar','connected') THEN RAISE EXCEPTION 'calendar_connection_version' USING ERRCODE='40001';END IF;
  IF p_action='select' THEN
   IF p_payload->>'access_role' NOT IN('owner','writer') OR length(coalesce(p_payload->>'calendar_id','')) NOT BETWEEN 1 AND 1024
    OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_payload->>'time_zone') THEN RAISE EXCEPTION 'calendar_permission';END IF;
   IF c.calendar_id IS NOT NULL AND c.calendar_id<>p_payload->>'calendar_id' AND EXISTS(SELECT 1 FROM planeje_private.crm_ia_calendar_sync_jobs q WHERE q.connection_id=c.id AND q.status<>'cancelled'
    AND (q.receipt IS NOT NULL OR q.lease IS NOT NULL OR q.uncertain_write OR q.status IN('claimed','uncertain'))) THEN RAISE EXCEPTION 'calendar_existing_events_require_resolution';END IF;
   same_calendar=c.calendar_id IS NOT NULL AND c.calendar_id=p_payload->>'calendar_id';
   changed_calendar=c.calendar_id IS NOT NULL AND c.calendar_id<>p_payload->>'calendar_id';
   UPDATE planeje_private.crm_ia_calendar_connections SET calendar_id=p_payload->>'calendar_id',calendar_name=left(p_payload->>'calendar_name',200),time_zone=p_payload->>'time_zone',
    access_role=p_payload->>'access_role',status='connected',revision=gen_random_uuid(),updated_at=clock_timestamp() WHERE id=c.id RETURNING * INTO c;
   IF same_calendar OR changed_calendar THEN
    -- Renew existing work; only a failed, provably unwritten job may follow a changed destination.
    UPDATE planeje_private.crm_ia_calendar_sync_jobs q SET desired_version=source.updated_at,desired_action=CASE WHEN source.status='cancelled' THEN 'delete' ELSE 'upsert' END,
     status=CASE WHEN q.lease IS NOT NULL THEN 'claimed' WHEN q.uncertain_write OR q.status='uncertain' THEN 'uncertain' ELSE 'pending' END,
     uncertain_write=q.uncertain_write OR q.status='uncertain',attempts=0,next_attempt_at=clock_timestamp(),error_code=NULL,updated_at=clock_timestamp()
     FROM public.crm_ia_appointments source WHERE q.connection_id=c.id AND source.id=q.appointment_id AND source.cliente_id=c.cliente_id AND source.owner_id=c.owner_id
      AND ((same_calendar AND (q.receipt IS NULL OR q.receipt->>'calendar_id'=c.calendar_id) AND (q.claimed_calendar_id IS NULL OR q.claimed_calendar_id=c.calendar_id))
       OR (changed_calendar AND q.status IN('failed','disconnected') AND q.receipt IS NULL AND q.lease IS NULL AND NOT q.uncertain_write))
      AND private.crm_ia_calendar_owner(source.cliente_id,source.owner_id,source.lead_id,source.contact_id);
   END IF;
   RETURN jsonb_build_object('status',c.status,'revision',c.revision,'calendar_id',c.calendar_id,'policy','busy_only_generic_title');
  END IF;
  IF c.status<>'connected' OR jsonb_typeof(p_payload->'busy') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'busy')>20000
   OR (p_payload->>'until')::timestamptz<=(p_payload->>'since')::timestamptz OR (p_payload->>'until')::timestamptz>(p_payload->>'since')::timestamptz+interval '31 days' THEN RAISE EXCEPTION 'calendar_busy_invalid';END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'busy') LOOP
   IF (item->>'end')::timestamptz<=(item->>'start')::timestamptz OR item->>'start' IS NULL OR item->>'end' IS NULL THEN RAISE EXCEPTION 'calendar_busy_invalid';END IF;
  END LOOP;
  IF nullif(p_payload->>'appointment_id','') IS NOT NULL THEN
   SELECT * INTO a FROM public.crm_ia_appointments x WHERE x.id=(p_payload->>'appointment_id')::uuid AND x.cliente_id=c.cliente_id AND x.owner_id=c.owner_id;
   IF a.id IS NULL OR NOT private.crm_ia_calendar_owner(c.cliente_id,c.owner_id,a.lead_id,a.contact_id) THEN RAISE EXCEPTION 'calendar_appointment_acesso';END IF;
  END IF;
  INSERT INTO planeje_private.crm_ia_calendar_busy(connection_id,connection_revision,since_at,until_at,busy,ignored_appointment_id,ignored_version)
   VALUES(c.id,c.revision,(p_payload->>'since')::timestamptz,(p_payload->>'until')::timestamptz,p_payload->'busy',a.id,a.updated_at)
  ON CONFLICT(connection_id) DO UPDATE SET connection_revision=excluded.connection_revision,since_at=excluded.since_at,until_at=excluded.until_at,busy=excluded.busy,ignored_appointment_id=excluded.ignored_appointment_id,ignored_version=excluded.ignored_version,checked_at=clock_timestamp(),expires_at=clock_timestamp()+interval '90 seconds' RETURNING * INTO b;
  RETURN jsonb_build_object('required',true,'status','connected','fresh',true,'busy',b.busy,'since',b.since_at,'until',b.until_at,'checked_at',b.checked_at,'expires_at',b.expires_at,'connection_revision',c.revision);
 ELSIF p_action='claim' THEN
  UPDATE planeje_private.crm_ia_calendar_sync_jobs SET status='uncertain',uncertain_write=true,lease=NULL WHERE status='claimed' AND lease_until<clock_timestamp();
  FOR j IN SELECT q.* FROM planeje_private.crm_ia_calendar_sync_jobs q WHERE q.status IN('pending','uncertain') AND q.attempts<6 AND q.next_attempt_at<=clock_timestamp()
   ORDER BY q.updated_at,q.appointment_id LIMIT greatest(1,least(coalesce((p_payload->>'limit')::integer,10),20)) FOR UPDATE SKIP LOCKED LOOP
   SELECT * INTO a FROM public.crm_ia_appointments x WHERE x.id=j.appointment_id;
   SELECT * INTO c FROM planeje_private.crm_ia_calendar_connections x WHERE x.id=j.connection_id;
   IF c.status<>'connected' OR c.owner_id IS DISTINCT FROM a.owner_id OR c.cliente_id IS DISTINCT FROM a.cliente_id OR NOT private.crm_ia_calendar_owner(a.cliente_id,a.owner_id,a.lead_id,a.contact_id) THEN
    UPDATE planeje_private.crm_ia_calendar_sync_jobs SET status='disconnected',error_code='owner_or_connection_revoked' WHERE appointment_id=j.appointment_id;CONTINUE;
   END IF;
   UPDATE planeje_private.crm_ia_calendar_sync_jobs SET status='claimed',lease=gen_random_uuid(),lease_until=clock_timestamp()+interval '120 seconds',
    claimed_version=a.updated_at,claimed_revision=c.revision,claimed_calendar_id=c.calendar_id,attempts=attempts+1 WHERE appointment_id=j.appointment_id RETURNING * INTO j;
   result=result||jsonb_build_array(jsonb_build_object('id',a.id,'cliente_id',a.cliente_id,'owner_id',a.owner_id,'connection_id',c.id,'connection_revision',c.revision,
    'encrypted_token',c.encrypted_token,'oauth_client_id',c.oauth_client_id,'calendar_id',c.calendar_id,'time_zone',c.time_zone,'lease',j.lease,'source_version',j.claimed_version,
    'event_id',j.event_id,'desired_action',j.desired_action,'start_at',a.start_at,'end_at',a.end_at,'busy_start_at',a.busy_start_at,'busy_end_at',a.busy_end_at,'receipt',j.receipt,'reconcile_only',j.uncertain_write));
  END LOOP;RETURN result;
 ELSIF p_action IN('check','finish') THEN
  SELECT * INTO j FROM planeje_private.crm_ia_calendar_sync_jobs x WHERE x.appointment_id=(p_payload->>'id')::uuid AND x.lease=(p_payload->>'lease')::uuid AND x.status IN('claimed','disconnected') FOR UPDATE;
  IF j.appointment_id IS NULL THEN RETURN '{"allowed":false,"status":"uncertain"}';END IF;
  SELECT * INTO a FROM public.crm_ia_appointments x WHERE x.id=j.appointment_id;
  SELECT * INTO c FROM planeje_private.crm_ia_calendar_connections x WHERE x.id=j.connection_id;
  allowed=c.status='connected' AND c.revision=j.claimed_revision AND a.updated_at=j.claimed_version AND a.updated_at=j.desired_version
   AND a.cliente_id=c.cliente_id AND a.owner_id=c.owner_id AND j.lease_until>clock_timestamp() AND private.crm_ia_calendar_owner(a.cliente_id,a.owner_id,a.lead_id,a.contact_id);
  IF p_action='check' THEN RETURN jsonb_build_object('allowed',coalesce(allowed,false));END IF;
  next_status=p_payload->>'status';IF next_status NOT IN('synced','cancelled','uncertain','failed','conflict') THEN RAISE EXCEPTION 'calendar_result_invalid';END IF;
  record_receipt=p_payload->'receipt';
  IF next_status='synced' AND (jsonb_typeof(record_receipt) IS DISTINCT FROM 'object' OR record_receipt->>'etag' IS NULL) THEN RAISE EXCEPTION 'calendar_receipt_required';END IF;
  IF record_receipt IS NOT NULL AND record_receipt<>'null'::jsonb THEN
   IF record_receipt->>'event_id' IS DISTINCT FROM j.event_id OR record_receipt->>'calendar_id' IS DISTINCT FROM j.claimed_calendar_id THEN RAISE EXCEPTION 'calendar_receipt_scope';END IF;
   record_receipt=jsonb_build_object('event_id',j.event_id,'calendar_id',j.claimed_calendar_id,'etag',record_receipt->>'etag','http_status',record_receipt->'http_status','source_version',j.claimed_version,'observed_at',clock_timestamp());
  ELSE record_receipt=NULL;END IF;
  IF NOT coalesce(allowed,false) THEN next_status=CASE WHEN c.status='connected' AND private.crm_ia_calendar_owner(a.cliente_id,a.owner_id,a.lead_id,a.contact_id) THEN 'pending' ELSE 'disconnected' END;END IF;
  UPDATE planeje_private.crm_ia_calendar_sync_jobs SET status=next_status,receipt=coalesce(record_receipt,receipt),
   receipts=CASE WHEN record_receipt IS NOT NULL THEN receipts||jsonb_build_array(record_receipt) ELSE receipts END,
   uncertain_write=CASE WHEN record_receipt IS NOT NULL THEN false WHEN p_payload->>'status'='uncertain' THEN true ELSE uncertain_write END,
   error_code=left(p_payload->>'error_code',100),lease=NULL,lease_until=NULL,next_attempt_at=clock_timestamp()+CASE WHEN next_status='uncertain' THEN interval '5 minutes' ELSE interval '0 seconds' END,updated_at=clock_timestamp() WHERE appointment_id=j.appointment_id;
  RETURN jsonb_build_object('status',next_status);
 END IF;
 RAISE EXCEPTION 'calendar_service_action';
END$$;
REVOKE ALL ON FUNCTION private.crm_ia_calendar_owner(uuid,uuid,uuid,uuid),private.crm_ia_calendar_enqueue(),private.crm_ia_calendar_slot_guard(uuid,uuid,timestamptz,timestamptz,uuid),public.crm_ia_calendar_service(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_ia_calendar_service(text,jsonb) TO service_role;
CREATE FUNCTION private.crm_ia_calendar_confirmation(p_appointment uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH current_state AS (SELECT coalesce((SELECT jsonb_build_object(
  'required',coalesce(c.calendar_id IS NOT NULL AND c.status<>'disconnected',false),
  'confirmed',coalesce(a.status<>'cancelled' AND c.status='connected' AND q.status='synced' AND q.desired_action='upsert' AND q.desired_version=a.updated_at AND q.claimed_revision=c.revision
   AND (q.receipt->>'source_version')::timestamptz=a.updated_at AND q.receipt->>'event_id'=q.event_id AND q.receipt->>'calendar_id'=c.calendar_id AND q.receipt->>'etag' IS NOT NULL
   AND private.crm_ia_calendar_owner(a.cliente_id,a.owner_id,a.lead_id,a.contact_id),false),
  'cancelled',coalesce(a.status='cancelled' AND c.status='connected' AND q.status='cancelled' AND q.desired_action='delete' AND q.desired_version=a.updated_at AND q.claimed_revision=c.revision
   AND (q.receipt->>'source_version')::timestamptz=a.updated_at AND q.receipt->>'event_id'=q.event_id AND q.receipt->>'calendar_id'=c.calendar_id
   AND (q.receipt->>'http_status')::integer IN(204,404) AND private.crm_ia_calendar_owner(a.cliente_id,a.owner_id,a.lead_id,a.contact_id),false),
  'status',coalesce(q.status,c.status,'not_connected'),'source_version',a.updated_at,'owner_allowed',private.crm_ia_calendar_owner(a.cliente_id,a.owner_id,a.lead_id,a.contact_id))
  FROM public.crm_ia_appointments a LEFT JOIN planeje_private.crm_ia_calendar_connections c ON c.cliente_id=a.cliente_id AND c.owner_id=a.owner_id
  LEFT JOIN planeje_private.crm_ia_calendar_sync_jobs q ON q.appointment_id=a.id AND q.connection_id=c.id WHERE a.id=p_appointment),
  '{"required":true,"confirmed":false,"cancelled":false,"status":"appointment_unavailable","owner_allowed":false}'::jsonb) AS data)
 SELECT data||jsonb_build_object('verified',(data->>'confirmed')::boolean OR (data->>'cancelled')::boolean,'state',CASE
   WHEN (data->>'confirmed')::boolean OR (data->>'cancelled')::boolean THEN 'ready' WHEN NOT (data->>'owner_allowed')::boolean THEN 'failed'
   WHEN NOT (data->>'required')::boolean THEN 'disconnected' WHEN data->>'status' IN('failed','conflict','error','cancelled','disconnected') THEN 'failed' ELSE 'pending' END,
  'reason',CASE WHEN (data->>'confirmed')::boolean THEN 'google_receipt_current' WHEN (data->>'cancelled')::boolean THEN 'google_cancellation_receipt_current' WHEN NOT (data->>'owner_allowed')::boolean THEN 'owner_access_revoked'
   WHEN NOT (data->>'required')::boolean THEN 'local_only_no_google_confirmation' ELSE data->>'status' END) FROM current_state
$$;
REVOKE ALL ON FUNCTION private.crm_ia_calendar_confirmation(uuid) FROM PUBLIC,anon,authenticated;
-- Preserve the slot contract and OID; reject invalid legacy rules before iterating.
CREATE OR REPLACE FUNCTION private.crm_ia_slots(p_client uuid,p_owner uuid,p_date date,p_ignore uuid DEFAULT NULL,p_rules jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE availability jsonb; zone text; duration_n integer; interval_n integer; before_n integer; after_n integer; notice numeric; horizon_n integer; max_n integer;
  windows jsonb; exception jsonb; window_row jsonb; local_start timestamp; local_end timestamp; cursor_at timestamp; from_at timestamptz; to_at timestamptz;
  result jsonb:='[]'; external_calendar jsonb;
BEGIN
  availability:=private.crm_ia_availability(p_client,p_rules);
  zone:=coalesce(availability->>'timezone','America/Sao_Paulo');
  duration_n:=coalesce((availability->>'duration_minutes')::integer,30); interval_n:=coalesce((availability->>'interval_minutes')::integer,30);
  before_n:=coalesce((availability->>'buffer_before')::integer,0); after_n:=coalesce((availability->>'buffer_after')::integer,0);
  notice:=coalesce((availability->>'min_notice_hours')::numeric,1);
  horizon_n:=coalesce((availability->>'horizon_days')::integer,60);max_n:=coalesce((availability->>'max_per_day')::integer,8);
  IF duration_n NOT BETWEEN 5 AND 720 OR interval_n NOT BETWEEN 5 AND 720 OR before_n NOT BETWEEN 0 AND 240 OR after_n NOT BETWEEN 0 AND 240
    OR notice NOT BETWEEN 0 AND 720 OR horizon_n NOT BETWEEN 1 AND 366 OR max_n NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Disponibilidade inválida para consultar horários.' USING ERRCODE='22023',DETAIL='crm_ia_availability_invalid';
  END IF;
  IF p_owner IS NULL OR p_date IS NULL OR p_date<(clock_timestamp() AT TIME ZONE zone)::date
    OR p_date>(clock_timestamp() AT TIME ZONE zone)::date+horizon_n
    OR NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=p_owner AND p.status='active' AND p.role IN ('admin','superadmin','colaborador')) THEN RETURN jsonb_build_object('rows',result,'total',0); END IF;
  IF (SELECT count(*) FROM public.crm_ia_appointments a WHERE a.owner_id=p_owner AND a.id IS DISTINCT FROM p_ignore AND a.status IN ('scheduled','confirmed') AND (a.start_at AT TIME ZONE zone)::date=p_date)
    >=max_n THEN RETURN jsonb_build_object('rows',result,'total',0); END IF;
  SELECT value INTO exception FROM jsonb_array_elements(coalesce(availability->'exceptions','[]')) e
    WHERE e->>'owner_id'=p_owner::text AND e->>'date'=p_date::text LIMIT 1;
  IF coalesce((exception->>'blocked')::boolean,false) THEN RETURN jsonb_build_object('rows',result,'total',0); END IF;
  IF exception IS NOT NULL THEN windows:=jsonb_build_array(exception);
  ELSE
    SELECT coalesce(jsonb_agg(value),'[]') INTO windows FROM jsonb_array_elements(coalesce(availability->'windows','[]')) w
      WHERE w->>'owner_id'=p_owner::text AND (w->'days') @> jsonb_build_array(extract(dow FROM p_date)::integer);
  END IF;
  FOR window_row IN SELECT value FROM jsonb_array_elements(windows) LOOP
    local_start:=p_date+(window_row->>'start')::time; local_end:=p_date+(window_row->>'end')::time;
    cursor_at:=local_start;
    WHILE cursor_at+make_interval(mins=>duration_n)<=local_end LOOP
      from_at:=cursor_at AT TIME ZONE zone; to_at:=(cursor_at+make_interval(mins=>duration_n)) AT TIME ZONE zone;
      external_calendar:=private.crm_ia_calendar_slot_guard(p_client,p_owner,from_at-make_interval(mins=>before_n),to_at+make_interval(mins=>after_n),p_ignore);
      IF from_at>=clock_timestamp()+notice*interval '1 hour' AND to_at>from_at AND (from_at AT TIME ZONE zone)=cursor_at
        AND ((external_calendar->>'required')::boolean=false OR ((external_calendar->>'verified')::boolean AND (external_calendar->>'free')::boolean))
        AND NOT EXISTS(SELECT 1 FROM public.crm_ia_appointments a WHERE a.owner_id=p_owner AND a.id IS DISTINCT FROM p_ignore
          AND a.status IN ('scheduled','confirmed') AND a.busy_start_at<to_at+make_interval(mins=>after_n) AND a.busy_end_at>from_at-make_interval(mins=>before_n)) THEN
        result:=result||jsonb_build_array(jsonb_build_object('start_at',from_at,'end_at',to_at,'owner_id',p_owner));
      END IF;
      cursor_at:=cursor_at+make_interval(mins=>interval_n);
    END LOOP;
  END LOOP;
  SELECT coalesce(jsonb_agg(value ORDER BY value->>'start_at'),'[]') INTO result FROM(SELECT DISTINCT value FROM jsonb_array_elements(result)) s;
  RETURN jsonb_build_object('rows',result,'total',jsonb_array_length(result));
END $$;
REVOKE ALL ON FUNCTION private.crm_ia_slots(uuid,uuid,date,uuid,jsonb) FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
