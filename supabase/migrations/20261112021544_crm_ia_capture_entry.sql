-- Capture composes the existing commercial preparation, independently of AI autonomy.
-- The automatic path retains its gate/cancellation/restart in authorized scopes;
-- both paths now refuse actor/channel/contact/lead scope and conflicting bindings.
BEGIN;

CREATE FUNCTION private.crm_ia_prepare_entry(
 p_client uuid,p_channel uuid,p_contact uuid,p_text text,p_capture_only boolean,p_message text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$
DECLARE cfg public.crm_ia_config;c public.cliente_whatsapp_contact;l public.leads;conversation public.cliente_atend_conversas;i public.cliente_whatsapp_inbox;
 entry jsonb;distribution jsonb;candidate jsonb;target jsonb;people jsonb:='[]';source text;actor uuid;actor_role text;
 owner_key uuid;lead_key uuid;ids uuid[];initial_ids uuid[];turn_n bigint;load_n bigint;phone text;early_auto_disabled boolean:=false;
BEGIN
 IF p_capture_only AND (p_message IS NULL OR nullif(btrim(p_message),'') IS NULL OR length(p_message)>300)
 THEN RETURN '{"handled":true,"skipped":"message_required"}';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('crm-ia:'||p_client::text,0));
 -- Only a negative configuration verdict may precede the lead lock. Legacy
 -- shops with capture disabled must not wait on an editor's unrelated row lock.
 SELECT * INTO cfg FROM public.crm_ia_config WHERE cliente_id=p_client;
 IF p_capture_only AND NOT (coalesce(cfg.data#>>'{entry,enabled}'='true',false)
  OR coalesce(cfg.data#>>'{distribution,enabled}'='true',false))
 THEN RETURN '{"handled":true,"skipped":"capture_disabled"}';END IF;
 early_auto_disabled:=NOT p_capture_only AND (cfg.data#>>'{attendance,auto_send}' IS DISTINCT FROM 'true');
 -- First acquire the only lead row that preparation may mutate. A legacy editor
 -- can hold it without the account lock; no authorization/source snapshot may
 -- survive this wait. Everything below is read again after account -> lead.
 IF NOT early_auto_disabled THEN
  phone:=planeje_private.crm_ia_delivery_target(p_client,p_channel,p_contact)->>'phone';
  SELECT array_agg(id) INTO initial_ids FROM public.leads WHERE cliente_id=p_client AND crm_ia_archived_at IS NULL
   AND (crm_ia_contact_id=p_contact OR (private.crm_ia_phone(whatsapp)<>'' AND private.crm_ia_phone(whatsapp)=phone));
  IF cardinality(initial_ids)=1 THEN
   SELECT * INTO l FROM public.leads WHERE id=initial_ids[1] AND cliente_id=p_client AND crm_ia_archived_at IS NULL
    AND (crm_ia_contact_id=p_contact OR (private.crm_ia_phone(whatsapp)<>'' AND private.crm_ia_phone(whatsapp)=phone)) FOR UPDATE;
  END IF;
 END IF;
 -- Fresh context, gates and current inbox are resolved only after the last
 -- preparation lock, before binding, distribution or any other mutation.
 SELECT * INTO c FROM public.cliente_whatsapp_contact WHERE id=p_contact AND cliente_id=p_client;
 target:=planeje_private.crm_ia_delivery_target(p_client,p_channel,p_contact);
 IF p_capture_only AND target->>'allowed' IS DISTINCT FROM 'true'
 THEN RETURN '{"handled":true,"skipped":"scope"}';END IF;
 IF c.id IS NULL OR coalesce(c.from_jid,'') !~ '^[0-9]+@(s\.whatsapp\.net|c\.us|lid)$' OR NOT EXISTS(
  SELECT 1 FROM public.cliente_whatsapp_config WHERE id=p_channel AND cliente_id=p_client AND archived_at IS NULL AND provider='uazapi'
 ) THEN RAISE EXCEPTION 'crm_ia_scope';END IF;
 SELECT * INTO cfg FROM public.crm_ia_config WHERE cliente_id=p_client;
 distribution:=cfg.data->'distribution';
 IF p_capture_only AND NOT (coalesce(cfg.data#>>'{entry,enabled}'='true',false)
  OR coalesce(distribution->>'enabled'='true',false)) THEN RETURN '{"handled":true,"skipped":"capture_disabled"}';END IF;
 actor:=cfg.updated_by;
 IF actor IS NULL AND NOT p_capture_only THEN
  SELECT created_by INTO actor FROM public.cliente_atend_ia_agentes WHERE cliente_id=p_client AND funil ? 'crm_ia' ORDER BY created_at LIMIT 1;
 END IF;
 IF early_auto_disabled OR (NOT p_capture_only AND cfg.data#>>'{attendance,auto_send}' IS DISTINCT FROM 'true')
  OR NOT public.cliente_atend_loja_habilitada(p_client) OR NOT private.crm_ia_agent_actor(p_client,actor) THEN
  IF NOT p_capture_only THEN
   UPDATE public.cliente_atend_conversas SET ia_followup_due_at=NULL,ia_followup_delivery_state='cancelled'
    WHERE cliente_id=p_client AND contact_id=p_contact AND crm_ia_runtime->>'active'='true' AND ia_followup_due_at IS NOT NULL;
  END IF;
  RETURN '{"handled":true,"skipped":"disabled_or_owner"}';
 END IF;
 SELECT p.role::text INTO actor_role FROM public.profiles p WHERE p.id=actor AND p.status='active';
 -- Explicit actor gates mirror crm_ia_channel/contact/lead; never replace the service JWT.
 IF public.atendimento_user_can_send_on_whatsapp_config(actor,p_client,p_channel) IS DISTINCT FROM true
  OR NOT (coalesce((SELECT m.is_enabled FROM public.user_module_permissions m WHERE m.user_id=actor AND m.module_name::text='atendimento'),
    (SELECT m.is_enabled FROM public.module_settings m WHERE m.module_name::text='atendimento'),true)
   OR coalesce((SELECT m.is_enabled FROM public.user_module_permissions m WHERE m.user_id=actor AND m.module_name::text='rastreamento'),
    (SELECT m.is_enabled FROM public.module_settings m WHERE m.module_name::text='rastreamento'),true))
  OR EXISTS(SELECT 1 FROM public.cliente_atend_conversas s WHERE s.cliente_id=p_client AND s.contact_id=p_contact
   AND s.privado AND s.assigned_to IS DISTINCT FROM actor AND actor_role<>'superadmin')
  OR (actor_role NOT IN('admin','superadmin') AND EXISTS(SELECT 1 FROM public.user_module_access m
   WHERE m.user_id=actor AND m.module_name::text='crm' AND m.access_level::text='responsible')
   AND NOT EXISTS(SELECT 1 FROM public.cliente_atend_conversas s WHERE s.cliente_id=p_client AND s.contact_id=p_contact AND s.assigned_to=actor))
 THEN RETURN '{"handled":true,"skipped":"actor_scope"}';END IF;
 IF target->>'allowed' IS DISTINCT FROM 'true'
  OR planeje_private.crm_ia_delivery_config(p_client,target->>'phone',cfg.revision,NOT p_capture_only) IS NOT NULL
 THEN RETURN '{"handled":true,"skipped":"test_number_not_allowed"}';END IF;
 SELECT value INTO entry FROM jsonb_array_elements(coalesce(cfg.data#>'{entry,channels}','[]')) e
  WHERE e->>'channel_id'=p_channel::text AND e->>'enabled'='true';
 IF p_capture_only AND NOT (coalesce(cfg.data#>>'{entry,enabled}'='true' AND entry IS NOT NULL,false)
  OR coalesce(distribution->>'enabled'='true',false)) THEN RETURN '{"handled":true,"skipped":"capture_disabled"}';END IF;
 IF p_capture_only THEN
  SELECT * INTO i FROM public.cliente_whatsapp_inbox WHERE cliente_id=p_client AND whatsapp_config_id=p_channel
   AND (from_jid=c.from_jid OR chat_jid=c.from_jid) ORDER BY created_at DESC,id DESC LIMIT 1;
  -- The webhook classifies incoming/group once. Quoted raw content is not authority.
  IF i.id IS NULL OR i.message_id IS DISTINCT FROM p_message OR i.is_group IS DISTINCT FROM false
   OR i.from_jid LIKE '%@g.us' OR i.chat_jid LIKE '%@g.us'
  THEN RETURN '{"handled":true,"skipped":"message_changed"}';END IF;
  p_text:=i.body;
 END IF;
 -- delivery_target resolves a registered phone or a telephone JID, never opaque @lid digits.
 phone:=target->>'phone';
 SELECT array_agg(id) INTO ids FROM public.leads WHERE cliente_id=p_client AND crm_ia_archived_at IS NULL
  AND (crm_ia_contact_id=p_contact OR (private.crm_ia_phone(whatsapp)<>'' AND private.crm_ia_phone(whatsapp)=phone));
 IF coalesce(cardinality(ids),0)>1 THEN RETURN '{"handled":true,"skipped":"ambiguous_lead"}';END IF;
 -- A changed/ambiguous candidate must not make us take another lock after the gates.
 IF ids[1] IS DISTINCT FROM initial_ids[1] OR (ids[1] IS NOT NULL AND l.id IS NULL)
 THEN RETURN '{"handled":true,"skipped":"lead_changed"}';END IF;
 IF l.id IS NOT NULL AND actor_role NOT IN('admin','superadmin') AND l.responsavel_id IS DISTINCT FROM actor
  AND EXISTS(SELECT 1 FROM public.user_module_access m WHERE m.user_id=actor AND m.module_name::text='crm' AND m.access_level::text='responsible')
 THEN RETURN '{"handled":true,"skipped":"lead_scope"}';END IF;
 IF l.crm_ia_contact_id IS NOT NULL AND l.crm_ia_contact_id IS DISTINCT FROM p_contact
 THEN RETURN '{"handled":true,"skipped":"lead_contact_conflict"}';END IF;
 -- A new/bound opportunity must remain editable through the canonical lead form.
 -- An explicit existing link with a valid phone survives a contact still known only by @lid.
 IF coalesce(phone,'') !~ '^[0-9]{10,15}$' AND NOT coalesce(l.crm_ia_contact_id=p_contact
  AND private.crm_ia_phone(l.whatsapp) ~ '^[0-9]{10,15}$',false)
 THEN RETURN '{"handled":true,"skipped":"phone_unavailable"}';END IF;
 IF l.id IS NULL THEN
  IF cfg.data#>>'{entry,enabled}' IS DISTINCT FROM 'true' OR entry IS NULL OR (entry->>'mode'='phrase' AND
   (nullif(btrim(entry->>'phrase'),'') IS NULL OR position(lower(entry->>'phrase') IN lower(coalesce(p_text,'')))=0))
  THEN RETURN '{"handled":true,"skipped":"entry_disabled"}';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.crm_stages s JOIN public.crm_pipelines p ON p.id=s.pipeline_id
   WHERE s.id=(entry->>'stage_id')::uuid AND p.id=(entry->>'pipeline_id')::uuid AND p.cliente_id=p_client)
  THEN RAISE EXCEPTION 'crm_ia_entry_scope';END IF;
  INSERT INTO public.leads(cliente_id,nome,whatsapp,pipeline_id,stage_id,status,status_vida,crm_ia_contact_id,etiquetas,origem)
   SELECT p_client,coalesce(nullif(c.sender_name,''),c.phone,c.from_jid),phone,s.pipeline_id,s.id,s.nome,'ativo',p_contact,
    private.crm_ia_lead_tags(coalesce(entry->'tags','[]'::jsonb)),coalesce(nullif(c.origin_source,''),'whatsapp')
    FROM public.crm_stages s WHERE s.id=(entry->>'stage_id')::uuid RETURNING * INTO l;
 ELSE
  UPDATE public.leads SET crm_ia_contact_id=p_contact WHERE id=l.id AND crm_ia_contact_id IS NULL RETURNING * INTO l;
  IF NOT FOUND THEN SELECT * INTO l FROM public.leads WHERE id=ids[1];END IF;
 END IF;
 lead_key:=l.id;
 source:=CASE WHEN c.origin_source='meta_ads' THEN 'meta' WHEN c.origin_source='site' THEN 'site' ELSE 'whatsapp' END;
 IF l.responsavel_id IS NULL AND distribution->>'enabled'='true' AND coalesce(distribution->'sources','[]') ? source
  AND (cardinality(ids) IS NULL OR distribution->>'include_unassigned'='true') THEN
  FOR candidate IN SELECT value FROM jsonb_array_elements(coalesce(distribution->'people','[]')) LOOP
   owner_key:=(candidate->>'owner_id')::uuid;
   IF private.crm_ia_agent_actor(p_client,owner_key) THEN
    SELECT count(*) INTO load_n FROM public.leads WHERE cliente_id=p_client AND responsavel_id=owner_key
     AND crm_ia_archived_at IS NULL AND coalesce(status_vida,'ativo')='ativo';
    IF coalesce((candidate->>'limit')::integer,0)=0 OR load_n<(candidate->>'limit')::integer
    THEN people:=people||jsonb_build_array(candidate||jsonb_build_object('load',load_n));END IF;
   END IF;
  END LOOP;
  IF jsonb_array_length(people)>0 THEN
   INSERT INTO planeje_private.crm_ia_distribution_state(cliente_id,turn) VALUES(p_client,1)
    ON CONFLICT(cliente_id) DO UPDATE SET turn=planeje_private.crm_ia_distribution_state.turn+1 RETURNING turn-1 INTO turn_n;
   IF distribution->>'strategy'='least_loaded' THEN
    SELECT (p->>'owner_id')::uuid INTO owner_key FROM jsonb_array_elements(people) p
     ORDER BY (p->>'load')::numeric/greatest(1,least(5,coalesce((p->>'weight')::integer,1))),p->>'owner_id' LIMIT 1;
   ELSE
    SELECT array_agg((p->>'owner_id')::uuid ORDER BY p->>'owner_id',weight) INTO ids FROM jsonb_array_elements(people) p
     CROSS JOIN LATERAL generate_series(1,greatest(1,least(5,coalesce((p->>'weight')::integer,1)))) weight;
    owner_key:=ids[1+(turn_n%cardinality(ids))::integer];
   END IF;
  ELSE owner_key:=nullif(distribution->>'fallback_owner_id','')::uuid;END IF;
  IF owner_key IS NOT NULL AND private.crm_ia_agent_actor(p_client,owner_key) THEN
   UPDATE public.leads SET responsavel_id=owner_key,updated_at=clock_timestamp()
    WHERE id=lead_key AND cliente_id=p_client AND responsavel_id IS NULL RETURNING * INTO l;
   IF NOT FOUND THEN SELECT * INTO l FROM public.leads WHERE id=lead_key AND cliente_id=p_client;END IF;
  END IF;
 END IF;
 -- Commercial capture ends before any human/AI conversation, restart, run or outbox mutation.
 IF p_capture_only THEN RETURN jsonb_build_object('handled',true,'captured',true,'lead_id',l.id,'skipped',NULL);END IF;
 INSERT INTO public.cliente_atend_conversas(cliente_id,contact_id,status,ia_pausada) VALUES(p_client,p_contact,'esperando',false)
  ON CONFLICT(cliente_id,contact_id) DO NOTHING;
 SELECT * INTO conversation FROM public.cliente_atend_conversas WHERE cliente_id=p_client AND contact_id=p_contact;
 IF conversation.crm_ia_runtime->>'closed'='true' AND NOT conversation.ia_pausada
  AND cfg.data#>>'{attendance,restart_triage}'='true' AND entry IS NOT NULL THEN
  l:=jsonb_populate_record(NULL::public.leads,private.crm_ia_move(p_client,l.id,(entry->>'stage_id')::uuid,'Reinício de triagem autorizado',l.updated_at::text,actor));
  UPDATE public.cliente_atend_conversas SET crm_ia_runtime='{}',status='esperando',ia_pausada=false,updated_at=clock_timestamp()
   WHERE id=conversation.id RETURNING * INTO conversation;
 END IF;
 RETURN jsonb_build_object('handled',true,'lead',to_jsonb(l),'conversation',to_jsonb(conversation),'contact',to_jsonb(c),'config',to_jsonb(cfg),'actor_id',actor);
END $$;
REVOKE ALL ON FUNCTION private.crm_ia_prepare_entry(uuid,uuid,uuid,text,boolean,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.crm_ia_agent_intake(p_client uuid,p_channel uuid,p_contact uuid,p_text text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 RETURN private.crm_ia_prepare_entry(p_client,p_channel,p_contact,p_text,false,NULL);
END $$;

CREATE FUNCTION public.crm_ia_capture_inbound(p_client uuid,p_channel uuid,p_contact uuid,p_message text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 result:=private.crm_ia_prepare_entry(p_client,p_channel,p_contact,NULL,true,p_message);
 RETURN jsonb_build_object('handled',true,'captured',coalesce(result->>'captured'='true',false),
  'lead_id',result->'lead_id','skipped',result->'skipped');
END $$;
REVOKE ALL ON FUNCTION public.crm_ia_capture_inbound(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_ia_capture_inbound(uuid,uuid,uuid,text) TO service_role;

-- Resolve the existing owner, rather than assume a role name or bootstrap OID.
DO $$
DECLARE owner_name text;
BEGIN
 SELECT pg_get_userbyid(proowner) INTO owner_name FROM pg_proc
  WHERE oid='public.crm_ia_agent_intake(uuid,uuid,uuid,text)'::regprocedure;
 EXECUTE format('ALTER FUNCTION private.crm_ia_prepare_entry(uuid,uuid,uuid,text,boolean,text) OWNER TO %I',owner_name);
 EXECUTE format('ALTER FUNCTION public.crm_ia_capture_inbound(uuid,uuid,uuid,text) OWNER TO %I',owner_name);
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
