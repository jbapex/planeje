BEGIN;

-- A saved CRM configuration or a legacy Loja exception is not a CRM license.
CREATE FUNCTION private.crm_ia_enabled(p_client uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(EXISTS(SELECT 1 FROM public.clientes c JOIN public.client_module_permissions m ON m.cliente_id=c.id
  WHERE c.id=p_client AND m.module_name='crm_ia' AND m.is_enabled)
  AND public.cliente_atend_loja_habilitada(p_client),false)
$$;
CREATE FUNCTION private.crm_ia_member(p_client uuid,p_actor uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT m.nivel FROM public.cliente_atend_membros m JOIN public.profiles p ON p.id=m.user_id
 WHERE m.cliente_id=p_client AND m.user_id=p_actor AND m.ativo AND m.nivel IN('admin','supervisor','atendente')
  AND p.role='cliente' AND p.status='active' AND p.cliente_id=p_client
  AND jsonb_typeof(p.allowed_pages)='array' AND p.allowed_pages ? 'crm-ia' AND private.crm_ia_enabled(p_client)
  AND coalesce((SELECT u.is_enabled FROM public.user_module_permissions u WHERE u.user_id=p_actor AND u.module_name::text='crm'),
   (SELECT g.is_enabled FROM public.module_settings g WHERE g.module_name::text='crm'),true)
$$;
ALTER FUNCTION private.crm_ia_agent_actor(uuid,uuid) RENAME TO crm_ia_agent_actor_pre_client_access;
CREATE FUNCTION private.crm_ia_agent_actor(p_client uuid,p_actor uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.crm_ia_enabled(p_client) AND CASE WHEN EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='cliente')
  THEN private.crm_ia_member(p_client,p_actor) IS NOT NULL ELSE private.crm_ia_agent_actor_pre_client_access(p_client,p_actor) END
$$;
CREATE OR REPLACE FUNCTION private.crm_ia_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p.role::text FROM public.profiles p WHERE p.id=auth.uid() AND p.status='active'
  AND p.role IN('superadmin','admin','colaborador','cliente') AND public.planeje_current_account_access()
  AND private.crm_ia_module('crm') AND (p.role<>'cliente' OR private.crm_ia_member(p.cliente_id,p.id) IS NOT NULL)
$$;
ALTER FUNCTION private.crm_ia_client(uuid) RENAME TO crm_ia_client_pre_client_access;
CREATE FUNCTION private.crm_ia_client(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.crm_ia_enabled(p_id) AND CASE WHEN private.crm_ia_role()='cliente'
  THEN private.crm_ia_member(p_id,auth.uid()) IS NOT NULL ELSE private.crm_ia_client_pre_client_access(p_id) END
$$;
CREATE FUNCTION private.crm_ia_actor_contact(p_client uuid,p_contact uuid,p_actor uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.crm_ia_agent_actor(p_client,p_actor) AND EXISTS(SELECT 1 FROM public.cliente_whatsapp_contact c
  JOIN public.profiles p ON p.id=p_actor WHERE c.id=p_contact AND c.cliente_id=p_client AND c.from_jid NOT LIKE '%@g.us'
  AND CASE WHEN p.role='cliente' THEN public.cliente_atend_pode_ver_contato_de(p_actor,p_client,p_contact)
   ELSE NOT EXISTS(SELECT 1 FROM public.cliente_atend_conversas s WHERE s.cliente_id=p_client AND s.contact_id=c.id
     AND s.privado AND s.assigned_to IS DISTINCT FROM p_actor AND p.role<>'superadmin')
    AND (p.role IN('superadmin','admin') OR NOT EXISTS(SELECT 1 FROM public.user_module_access a WHERE a.user_id=p_actor
      AND a.module_name::text='crm' AND a.access_level::text='responsible') OR EXISTS(SELECT 1 FROM public.cliente_atend_conversas s
      WHERE s.cliente_id=p_client AND s.contact_id=c.id AND s.assigned_to=p_actor)) END)
$$;
CREATE OR REPLACE FUNCTION private.crm_ia_contact(p_client uuid,p_contact uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.crm_ia_client(p_client) AND private.crm_ia_actor_contact(p_client,p_contact,auth.uid())
$$;
ALTER FUNCTION private.crm_ia_lead(uuid,uuid) RENAME TO crm_ia_lead_pre_client_access;
CREATE FUNCTION private.crm_ia_lead(p_id uuid,p_client uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.crm_ia_client(p_client) AND CASE WHEN private.crm_ia_role()='cliente' THEN EXISTS(
  SELECT 1 FROM public.leads l WHERE l.id=p_id AND l.cliente_id=p_client
   AND CASE WHEN l.crm_ia_contact_id IS NOT NULL THEN private.crm_ia_contact(p_client,l.crm_ia_contact_id)
    ELSE private.crm_ia_member(p_client,auth.uid()) IN('admin','supervisor') OR l.responsavel_id IS NULL OR l.responsavel_id=auth.uid() END)
  ELSE private.crm_ia_lead_pre_client_access(p_id,p_client) END
$$;
ALTER FUNCTION private.crm_ia_channel(uuid,uuid,boolean) RENAME TO crm_ia_channel_pre_client_access;
CREATE FUNCTION private.crm_ia_channel(p_client uuid,p_channel uuid,p_send boolean DEFAULT false) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.crm_ia_client(p_client) AND CASE WHEN private.crm_ia_role()='cliente' THEN EXISTS(
  SELECT 1 FROM public.cliente_whatsapp_config c WHERE c.id=p_channel AND c.cliente_id=p_client AND c.archived_at IS NULL
   AND (NOT p_send OR c.provider='uazapi' AND nullif(btrim(c.token),'') IS NOT NULL AND nullif(btrim(c.subdomain),'') IS NOT NULL))
  ELSE private.crm_ia_channel_pre_client_access(p_client,p_channel,p_send) END
$$;

CREATE FUNCTION public.crm_ia_client_access() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('enabled',coalesce(private.crm_ia_client(p.cliente_id),false),'client_id',p.cliente_id,
  'nivel',private.crm_ia_member(p.cliente_id,p.id),'revision',md5(jsonb_build_array(p.allowed_pages,m.updated_at,m.nivel,m.ativo,m.setor_ids,permission.updated_at)::text))
 FROM public.profiles p LEFT JOIN public.cliente_atend_membros m ON m.cliente_id=p.cliente_id AND m.user_id=p.id
 LEFT JOIN public.client_module_permissions permission ON permission.cliente_id=p.cliente_id AND permission.module_name='crm_ia'
 WHERE p.id=auth.uid() AND p.role='cliente'
$$;

CREATE FUNCTION public.crm_ia_access_admin(p_action text,p_client_id uuid,p_payload jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.clientes;permission public.client_module_permissions;person public.profiles;member public.cliente_atend_membros;
 target uuid;pages jsonb;level_name text;revision text;enabled boolean;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='superadmin' AND status='active')
  OR NOT public.planeje_current_account_access() THEN RAISE EXCEPTION 'Somente o Super Admin administra o acesso ao CRM IA.' USING ERRCODE='42501';END IF;
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>20000 THEN RAISE EXCEPTION 'Dados de acesso inválidos.';END IF;
 IF p_action NOT IN('status','set_enabled','save_member') OR p_action IS NULL THEN RAISE EXCEPTION 'Ação de acesso inválida.';END IF;
 IF p_action<>'status' THEN PERFORM pg_advisory_xact_lock(hashtextextended('crm-ia:'||p_client_id::text,0));END IF;
 SELECT * INTO c FROM public.clientes WHERE id=p_client_id;
 IF c.id IS NULL THEN RAISE EXCEPTION 'Conta indisponível.' USING ERRCODE='42501';END IF;
 SELECT * INTO permission FROM public.client_module_permissions WHERE cliente_id=c.id AND module_name='crm_ia' FOR UPDATE;
 IF p_action='set_enabled' THEN
  IF jsonb_typeof(p_payload->'enabled') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Informe a liberação do CRM IA.';END IF;
  IF nullif(p_payload->>'expected_updated_at','')::timestamptz IS DISTINCT FROM permission.updated_at THEN RAISE EXCEPTION 'A liberação foi alterada. Atualize a versão.' USING ERRCODE='40001';END IF;
  enabled:=(p_payload->>'enabled')::boolean;
  IF enabled AND coalesce(permission.is_enabled,false)=false THEN
   INSERT INTO public.client_module_permissions(cliente_id,module_name,is_enabled) VALUES(c.id,'atendimento_loja',true)
    ON CONFLICT(cliente_id,module_name) DO UPDATE SET is_enabled=true,updated_at=clock_timestamp();
   INSERT INTO public.crm_ia_config(cliente_id,data,updated_by) VALUES(c.id,'{"attendance":{"auto_send":false,"pause_on_human":true},"entry":{"enabled":false}}',auth.uid())
    ON CONFLICT(cliente_id) DO UPDATE SET data=jsonb_set(jsonb_set(crm_ia_config.data||jsonb_build_object('attendance',coalesce(crm_ia_config.data->'attendance','{}'),'entry',coalesce(crm_ia_config.data->'entry','{}')),
     '{attendance,auto_send}','false'),'{entry,enabled}','false'),revision=gen_random_uuid(),updated_by=auth.uid(),updated_at=clock_timestamp();
  END IF;
  INSERT INTO public.client_module_permissions(cliente_id,module_name,is_enabled,updated_at) VALUES(c.id,'crm_ia',enabled,clock_timestamp())
   ON CONFLICT(cliente_id,module_name) DO UPDATE SET is_enabled=excluded.is_enabled,updated_at=excluded.updated_at;
 ELSIF p_action='save_member' THEN
  target:=nullif(p_payload->>'user_id','')::uuid;
  SELECT * INTO person FROM public.profiles WHERE id=target AND role='cliente' AND cliente_id=c.id FOR UPDATE;
  IF person.id IS NULL THEN RAISE EXCEPTION 'Login indisponível nesta conta.' USING ERRCODE='42501';END IF;
  SELECT * INTO member FROM public.cliente_atend_membros WHERE cliente_id=c.id AND user_id=target FOR UPDATE;
  revision:=md5(jsonb_build_array(person.allowed_pages,member.updated_at,member.nivel,member.ativo,member.setor_ids)::text);
  IF p_payload->>'expected_revision' IS DISTINCT FROM revision THEN RAISE EXCEPTION 'As permissões foram alteradas. Atualize a versão.' USING ERRCODE='40001';END IF;
  pages:=p_payload->'allowed_pages';
  IF pages IS DISTINCT FROM 'null'::jsonb AND (jsonb_typeof(pages) IS DISTINCT FROM 'array' OR jsonb_array_length(pages)>50
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(pages) x WHERE jsonb_typeof(x)<>'string' OR length(x#>>'{}')>80)) THEN RAISE EXCEPTION 'Páginas inválidas.';END IF;
  IF pages ? 'crm-ia' THEN
   IF NOT private.crm_ia_enabled(c.id) OR person.status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'Ative a conta e o login antes de liberar o CRM IA.' USING ERRCODE='42501';END IF;
   level_name:=p_payload->>'nivel';
   IF level_name IS NULL OR level_name NOT IN('admin','supervisor','atendente') THEN RAISE EXCEPTION 'Escolha o nível de acesso da pessoa.';END IF;
   INSERT INTO public.cliente_atend_membros(cliente_id,user_id,nivel,ativo,setor_ids,nome,email,created_by)
    VALUES(c.id,target,level_name,true,coalesce(member.setor_ids,'{}'),person.full_name,(SELECT email FROM auth.users WHERE id=target),auth.uid())
    ON CONFLICT(cliente_id,user_id) DO UPDATE SET nivel=excluded.nivel,ativo=true,nome=excluded.nome,updated_at=clock_timestamp();
  END IF;
  PERFORM set_config('planeje.atend_sync','1',true);
  UPDATE public.profiles SET allowed_pages=nullif(pages,'null'::jsonb) WHERE id=target;
  PERFORM set_config('planeje.atend_sync','',true);
 END IF;
 SELECT * INTO permission FROM public.client_module_permissions WHERE cliente_id=c.id AND module_name='crm_ia';
 RETURN jsonb_build_object('client',jsonb_build_object('id',c.id,'empresa',c.empresa),
  'enabled',coalesce(permission.is_enabled,false),'updated_at',permission.updated_at,'members',coalesce((
   SELECT jsonb_agg(jsonb_build_object('user_id',p.id,'full_name',p.full_name,'status',p.status,'allowed_pages',p.allowed_pages,
    'nivel',m.nivel,'ativo',coalesce(m.ativo,false),'revision',md5(jsonb_build_array(p.allowed_pages,m.updated_at,m.nivel,m.ativo,m.setor_ids)::text)) ORDER BY p.full_name,p.id)
   FROM public.profiles p LEFT JOIN public.cliente_atend_membros m ON m.user_id=p.id AND m.cliente_id=c.id
   WHERE p.role='cliente' AND p.cliente_id=c.id),'[]'));
END $$;

ALTER FUNCTION public.crm_ia_workspace(text,uuid,jsonb) RENAME TO crm_ia_workspace_pre_client_access;
CREATE FUNCTION public.crm_ia_workspace(p_action text,p_client_id uuid DEFAULT NULL,p_payload jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;actor_role text;level_name text;owner_key uuid;old_owner uuid;people jsonb;
BEGIN
 actor_role:=private.crm_ia_role();
 IF actor_role IS NULL OR p_action IS NULL THEN RAISE EXCEPTION 'Acesso ao CRM IA indisponível.' USING ERRCODE='42501';END IF;
 IF p_action<>'bootstrap' THEN
  IF NOT private.crm_ia_client(p_client_id) THEN RAISE EXCEPTION 'Sem acesso a esta conta.' USING ERRCODE='42501';END IF;
  -- Serialize permission changes with every request, and authorize again after waiting.
  IF p_action IN('workspace','overview','leads','lead','conversations','conversation_context','notifications','messages','queue','slots','agenda','usage','authorize_ai','authorize_media') THEN
   PERFORM pg_advisory_xact_lock_shared(hashtextextended('crm-ia:'||p_client_id::text,0));
  ELSE PERFORM pg_advisory_xact_lock(hashtextextended('crm-ia:'||p_client_id::text,0));END IF;
  IF NOT private.crm_ia_client(p_client_id) THEN RAISE EXCEPTION 'Sem acesso a esta conta.' USING ERRCODE='42501';END IF;
  actor_role:=private.crm_ia_role();
 END IF;
 IF actor_role='cliente' THEN
  level_name:=private.crm_ia_member(p_client_id,auth.uid());
  IF p_action NOT IN('bootstrap','workspace','overview','leads','lead','conversations','conversation_context','notifications','mark_notifications_read','flag_ai_message','messages','queue','slots','agenda',
   'save_lead','move_lead','archive_lead','restore_lead','bulk_assign','bulk_archive','import_leads','open_conversation','save_conversation',
   'save_appointment','cancel_appointment','mark_appointment_no_show','schedule_message','prepare_media','cancel_message','authorize_ai','authorize_media')
   OR p_action='authorize_ai' AND p_payload->>'mode' IS DISTINCT FROM 'sugerir'
   OR p_action='save_lead' AND (p_payload ? 'profile' OR p_payload ? 'crm_ia_profile') THEN
   RAISE EXCEPTION 'A configuração do CRM IA pertence à gestão da agência.' USING ERRCODE='42501';END IF;
  IF p_payload ? 'owner_id' AND p_payload ? 'responsavel_id' AND nullif(p_payload->>'owner_id','')::uuid IS DISTINCT FROM nullif(p_payload->>'responsavel_id','')::uuid
   OR p_payload ? 'owner_id' AND p_payload ? 'assigned_to' AND nullif(p_payload->>'owner_id','')::uuid IS DISTINCT FROM nullif(p_payload->>'assigned_to','')::uuid
   OR p_payload ? 'responsavel_id' AND p_payload ? 'assigned_to' AND nullif(p_payload->>'responsavel_id','')::uuid IS DISTINCT FROM nullif(p_payload->>'assigned_to','')::uuid THEN
   RAISE EXCEPTION 'Campos de responsável conflitantes.' USING ERRCODE='22023';END IF;
  owner_key:=nullif(coalesce(p_payload->>'owner_id',p_payload->>'responsavel_id',p_payload->>'assigned_to'),'')::uuid;
  IF owner_key IS NOT NULL AND NOT (private.crm_ia_member(p_client_id,owner_key) IS NOT NULL OR
   p_action IN('slots','agenda','save_appointment') AND EXISTS(SELECT 1 FROM public.crm_ia_config cfg,
    LATERAL jsonb_array_elements(coalesce(cfg.data#>'{availability,windows}','[]')) w WHERE cfg.cliente_id=p_client_id AND w->>'owner_id'=owner_key::text
     AND private.crm_ia_agent_actor(p_client_id,owner_key))) THEN RAISE EXCEPTION 'Responsável indisponível nesta conta.' USING ERRCODE='42501';END IF;
  IF level_name='atendente' AND p_action IN('save_lead','save_conversation','bulk_assign') THEN
   IF p_action='save_lead' THEN SELECT responsavel_id INTO old_owner FROM public.leads WHERE id=nullif(p_payload->>'id','')::uuid AND cliente_id=p_client_id;
   ELSIF p_action='save_conversation' THEN SELECT assigned_to INTO old_owner FROM public.cliente_atend_conversas WHERE contact_id=nullif(p_payload->>'contact_id','')::uuid AND cliente_id=p_client_id;END IF;
   IF owner_key IS DISTINCT FROM old_owner AND owner_key IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Somente a supervisão transfere para outra pessoa.' USING ERRCODE='42501';END IF;
   IF p_action='save_lead' AND nullif(p_payload->>'id','') IS NULL THEN p_payload:=p_payload||jsonb_build_object('responsavel_id',auth.uid());END IF;
  END IF;
 END IF;
 result:=public.crm_ia_workspace_pre_client_access(p_action,p_client_id,p_payload);
 IF p_action='workspace' THEN
  result:=jsonb_set(result,'{permissions}',coalesce(result->'permissions','{}')||jsonb_build_object('operate',true,'configure',actor_role IN('admin','superadmin'),'apply_profile',actor_role IN('admin','superadmin','colaborador')));
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name) ORDER BY p.full_name,p.id),'[]') INTO people FROM public.profiles p
   WHERE p.status='active' AND (private.crm_ia_member(p_client_id,p.id) IS NOT NULL OR actor_role<>'cliente' AND p.role IN('admin','superadmin','colaborador')
    OR actor_role='cliente' AND private.crm_ia_agent_actor(p_client_id,p.id) AND EXISTS(SELECT 1 FROM public.crm_ia_config cfg,
      LATERAL jsonb_array_elements(coalesce(cfg.data#>'{availability,windows}','[]')) w WHERE cfg.cliente_id=p_client_id AND w->>'owner_id'=p.id::text));
  result:=jsonb_set(result,'{people}',people);
  IF actor_role='cliente' THEN
   result:=result||jsonb_build_object('agents','[]'::jsonb,'bases','[]'::jsonb,'templates','[]'::jsonb,'lead_profiles','[]'::jsonb,
    'config',jsonb_build_object('revision',result#>'{config,revision}','data',jsonb_build_object('custom_fields',coalesce(result#>'{config,data,custom_fields}','{}'),
      'availability',coalesce(result#>'{config,data,availability}','{}'),'attendance',jsonb_build_object('auto_send',result#>'{config,data,attendance,auto_send}'))),
    'permissions',result->'permissions'||'{"customer":true,"manage":false,"configure":false,"provision":false,"tracking":false,"conversations":true,"apply_profile":false}'::jsonb);
  END IF;
 END IF;
 RETURN result;
END $$;

CREATE FUNCTION public.crm_ia_runtime_access(p_client uuid,p_actor uuid,p_mode text,p_contact uuid DEFAULT NULL,p_channel uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=p_actor;role_name text;
BEGIN
 IF NOT private.crm_ia_enabled(p_client) OR p_mode IS NULL OR p_mode NOT IN('testar','sugerir','responder','followup') THEN RETURN '{"allowed":false}';END IF;
 IF p_mode IN('responder','followup') THEN
  SELECT updated_by INTO actor FROM public.crm_ia_config WHERE cliente_id=p_client AND data#>>'{attendance,auto_send}'='true';
 END IF;
 IF NOT coalesce(private.crm_ia_agent_actor(p_client,actor),false) THEN RETURN '{"allowed":false}';END IF;
 SELECT role::text INTO role_name FROM public.profiles WHERE id=actor;
 IF p_mode='testar' THEN RETURN jsonb_build_object('allowed',role_name IN('admin','superadmin'));END IF;
 IF NOT private.crm_ia_actor_contact(p_client,p_contact,actor) OR NOT EXISTS(SELECT 1 FROM public.cliente_whatsapp_config c
  WHERE c.id=p_channel AND c.cliente_id=p_client AND c.archived_at IS NULL
   AND (role_name='cliente' OR public.atendimento_user_can_send_on_whatsapp_config(actor,p_client,c.id))) THEN RETURN '{"allowed":false}';END IF;
 RETURN '{"allowed":true}';
END $$;

ALTER FUNCTION public.crm_ia_delivery_actor_check(uuid,text) RENAME TO crm_ia_delivery_actor_check_pre_client_access;
CREATE FUNCTION public.crm_ia_delivery_actor_check(p_id uuid,p_kind text DEFAULT 'outbox') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.crm_ia_outbox;role_name text;
BEGIN
 IF p_kind IS DISTINCT FROM 'outbox' THEN RETURN public.crm_ia_delivery_actor_check_pre_client_access(p_id,p_kind);END IF;
 SELECT * INTO item FROM public.crm_ia_outbox WHERE id=p_id AND status='sending';
 IF item.id IS NULL OR NOT private.crm_ia_enabled(item.cliente_id) THEN RETURN '{"allowed":false}';END IF;
 SELECT role::text INTO role_name FROM public.profiles WHERE id=item.created_by;
 IF role_name='cliente' THEN
  RETURN jsonb_build_object('allowed',item.kind='manual' AND private.crm_ia_actor_contact(item.cliente_id,item.contact_id,item.created_by)
   AND EXISTS(SELECT 1 FROM public.cliente_whatsapp_config c WHERE c.id=item.whatsapp_config_id AND c.cliente_id=item.cliente_id
    AND c.archived_at IS NULL AND c.provider='uazapi' AND nullif(btrim(c.token),'') IS NOT NULL AND nullif(btrim(c.subdomain),'') IS NOT NULL),
   'actor_id',item.created_by,'human',true);
 END IF;
 RETURN public.crm_ia_delivery_actor_check_pre_client_access(p_id,p_kind);
END $$;
ALTER FUNCTION public.crm_ia_delivery_recheck(uuid,uuid) RENAME TO crm_ia_delivery_recheck_pre_client_access;
CREATE FUNCTION public.crm_ia_delivery_recheck(p_id uuid,p_claim_token uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.crm_ia_outbox o WHERE o.id=p_id AND private.crm_ia_enabled(o.cliente_id)) THEN RETURN '{"allowed":false,"reason":"crm_access_revoked"}';END IF;
 RETURN public.crm_ia_delivery_recheck_pre_client_access(p_id,p_claim_token);
END $$;
ALTER FUNCTION public.crm_ia_delivery_start(text,uuid,uuid) RENAME TO crm_ia_delivery_start_pre_client_access;
CREATE FUNCTION public.crm_ia_delivery_start(p_kind text,p_id uuid,p_claim_token uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_kind='outbox' AND public.crm_ia_delivery_actor_check(p_id,p_kind)->>'allowed' IS DISTINCT FROM 'true' THEN RETURN false;END IF;
 RETURN public.crm_ia_delivery_start_pre_client_access(p_kind,p_id,p_claim_token);
END $$;

ALTER FUNCTION private.crm_ia_audio_target(uuid,uuid,uuid,text,uuid) RENAME TO crm_ia_audio_target_pre_client_access;
CREATE FUNCTION private.crm_ia_audio_target(p_client uuid,p_channel uuid,p_contact uuid,p_message text,p_agent uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT private.crm_ia_enabled(p_client) THEN RETURN '{"allowed":false,"reason":"crm_access_revoked"}';END IF;
 RETURN private.crm_ia_audio_target_pre_client_access(p_client,p_channel,p_contact,p_message,p_agent);
END $$;
ALTER FUNCTION private.crm_ia_voice_settings(uuid) RENAME TO crm_ia_voice_settings_pre_client_access;
CREATE FUNCTION private.crm_ia_voice_settings(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.crm_ia_voice_settings_pre_client_access(o.id) FROM public.crm_ia_outbox o WHERE o.id=p_id AND private.crm_ia_enabled(o.cliente_id)
$$;
ALTER FUNCTION private.crm_ia_calendar_owner(uuid,uuid,uuid,uuid) RENAME TO crm_ia_calendar_owner_pre_client_access;
CREATE FUNCTION private.crm_ia_calendar_owner(p_client uuid,p_owner uuid,p_lead uuid DEFAULT NULL,p_contact uuid DEFAULT NULL) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.crm_ia_enabled(p_client) AND CASE WHEN EXISTS(SELECT 1 FROM public.profiles WHERE id=p_owner AND role='cliente')
  THEN private.crm_ia_member(p_client,p_owner) IS NOT NULL
   AND (p_contact IS NULL OR private.crm_ia_actor_contact(p_client,p_contact,p_owner))
   AND (p_lead IS NULL OR EXISTS(SELECT 1 FROM public.leads l WHERE l.id=p_lead AND l.cliente_id=p_client
    AND CASE WHEN l.crm_ia_contact_id IS NOT NULL THEN private.crm_ia_actor_contact(p_client,l.crm_ia_contact_id,p_owner)
     ELSE private.crm_ia_member(p_client,p_owner) IN('admin','supervisor') OR l.responsavel_id IS NULL OR l.responsavel_id=p_owner END))
  ELSE private.crm_ia_calendar_owner_pre_client_access(p_client,p_owner,p_lead,p_contact) END
$$;
ALTER FUNCTION private.crm_ia_appointment_actor(uuid,uuid,uuid,uuid,uuid) RENAME TO crm_ia_appointment_actor_pre_client_access;
CREATE FUNCTION private.crm_ia_appointment_actor(p_client uuid,p_channel uuid,p_contact uuid,p_lead uuid,p_actor uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='cliente') THEN
  private.crm_ia_calendar_owner(p_client,p_actor,p_lead,p_contact) AND EXISTS(SELECT 1 FROM public.leads l
   WHERE l.id=p_lead AND l.cliente_id=p_client AND l.crm_ia_contact_id=p_contact AND l.crm_ia_archived_at IS NULL)
   AND planeje_private.crm_ia_delivery_target(p_client,p_channel,p_contact)->>'allowed'='true'
  ELSE private.crm_ia_appointment_actor_pre_client_access(p_client,p_channel,p_contact,p_lead,p_actor) END
$$;
ALTER FUNCTION public.crm_ia_calendar_workspace(text,jsonb) RENAME TO crm_ia_calendar_workspace_pre_client_access;
CREATE FUNCTION public.crm_ia_calendar_workspace(p_action text,p_payload jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner_key uuid;client_key uuid;
BEGIN
 IF private.crm_ia_role()='cliente' THEN
  owner_key:=coalesce(nullif(p_payload->>'owner_id','')::uuid,auth.uid());client_key:=nullif(p_payload->>'client_id','')::uuid;
  IF p_action IS DISTINCT FROM 'busy' OR NOT private.crm_ia_client(client_key) OR NOT (private.crm_ia_member(client_key,owner_key) IS NOT NULL OR EXISTS(
   SELECT 1 FROM public.crm_ia_config cfg,LATERAL jsonb_array_elements(coalesce(cfg.data#>'{availability,windows}','[]')) w
   WHERE cfg.cliente_id=client_key AND w->>'owner_id'=owner_key::text AND private.crm_ia_agent_actor(client_key,owner_key))) THEN
   RAISE EXCEPTION 'A configuração da agenda pertence à gestão da agência.' USING ERRCODE='42501';END IF;
 END IF;
 RETURN public.crm_ia_calendar_workspace_pre_client_access(p_action,p_payload);
END $$;

-- Revoke pending effects, retaining started transports and all historical receipts.
CREATE FUNCTION private.crm_ia_access_revoked() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE client_key uuid;actor uuid;revoke boolean:=false;
BEGIN
 IF TG_TABLE_NAME='client_module_permissions' THEN
  client_key:=OLD.cliente_id;revoke:=OLD.module_name='crm_ia' AND OLD.is_enabled AND (TG_OP='DELETE' OR NOT NEW.is_enabled);
 ELSIF TG_TABLE_NAME='profiles' THEN
  client_key:=OLD.cliente_id;actor:=OLD.id;
  revoke:=OLD.role='cliente' AND (OLD.allowed_pages ? 'crm-ia') AND (TG_OP='DELETE' OR NEW.role IS DISTINCT FROM 'cliente'
   OR NEW.status IS DISTINCT FROM 'active' OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id OR NOT coalesce(NEW.allowed_pages ? 'crm-ia',false));
 ELSIF TG_TABLE_NAME='cliente_atend_membros' THEN
  client_key:=OLD.cliente_id;actor:=OLD.user_id;
  revoke:=TG_OP='DELETE' OR NOT NEW.ativo OR NEW.nivel IS DISTINCT FROM OLD.nivel OR NEW.setor_ids IS DISTINCT FROM OLD.setor_ids;
 END IF;
 IF coalesce(revoke,false) THEN
  UPDATE public.crm_ia_outbox SET status='cancelled',error_code='crm_access_revoked',updated_at=clock_timestamp()
   WHERE cliente_id=client_key AND status='pending' AND (actor IS NULL OR created_by=actor);
  IF actor IS NULL THEN
   UPDATE public.crm_ia_config SET data=jsonb_set(jsonb_set(data||jsonb_build_object('attendance',coalesce(data->'attendance','{}'),'entry',coalesce(data->'entry','{}')),
     '{attendance,auto_send}','false'),'{entry,enabled}','false'),revision=gen_random_uuid(),updated_at=clock_timestamp() WHERE cliente_id=client_key;
  END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER crm_ia_client_module_revoked AFTER UPDATE OR DELETE ON public.client_module_permissions FOR EACH ROW EXECUTE FUNCTION private.crm_ia_access_revoked();
CREATE TRIGGER crm_ia_profile_revoked AFTER UPDATE OR DELETE ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.crm_ia_access_revoked();
CREATE TRIGGER crm_ia_member_revoked AFTER UPDATE OR DELETE ON public.cliente_atend_membros FOR EACH ROW EXECUTE FUNCTION private.crm_ia_access_revoked();

-- Preserve an explicit CRM opt-in when the existing Atendimento changes an active member's level.
DO $$
DECLARE body text;needle text;
BEGIN
 body:=pg_get_functiondef('public.cliente_atend_membros_sync_pages()'::regprocedure);
 needle:='perform set_config(''planeje.atend_sync'', ''1'', true);';
 IF position(needle IN body)=0 THEN RAISE EXCEPTION 'crm_ia_member_pages_contract';END IF;
 EXECUTE replace(body,needle,'if new.ativo and exists(select 1 from public.profiles where id=new.user_id and role=''cliente'' and cliente_id=new.cliente_id and allowed_pages ? ''crm-ia'') then
   v_pages := coalesce(v_pages,''["dashboard","campaigns-status","apexia","pgm-panel","crm","atendimento"]''::jsonb)||''["crm-ia"]''::jsonb;
  end if;
  '||needle);
END $$;

-- Existing RPC bodies retain their locks, versions and validation; only scoped owner predicates change.
DO $$
DECLARE body text;old text;signature regprocedure;
BEGIN
 signature:='public.crm_ia_workspace_pre_voice(text,uuid,jsonb)'::regprocedure;
 body:=pg_get_functiondef(signature);
 old:='EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=v_owner_id AND p.status=''active'' AND p.role IN (''admin'',''superadmin'',''colaborador''))';
 IF position(old IN body)=0 THEN RAISE EXCEPTION 'crm_ia_owner_contract';END IF;
 body:=replace(body,old,'coalesce(private.crm_ia_agent_actor(client_id,v_owner_id),false)');
 old:='EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(item->>''responsavel_id'')::uuid AND p.status=''active'' AND p.role IN (''admin'',''superadmin'',''colaborador''))';
 IF position(old IN body)=0 THEN RAISE EXCEPTION 'crm_ia_lead_owner_contract';END IF;
 body:=replace(body,old,'coalesce(private.crm_ia_agent_actor(client_id,(item->>''responsavel_id'')::uuid),false)');
 old:='EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(old->>''owner_id'')::uuid AND p.status=''active'' AND p.role IN (''admin'',''superadmin'',''colaborador''))';
 IF position(old IN body)=0 THEN RAISE EXCEPTION 'crm_ia_availability_owner_contract';END IF;
 EXECUTE replace(body,old,'coalesce(private.crm_ia_agent_actor(client_id,(old->>''owner_id'')::uuid),false)');
 body:=pg_get_functiondef('private.crm_ia_slots(uuid,uuid,date,uuid,jsonb)'::regprocedure);
 old:='EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=p_owner AND p.status=''active'' AND p.role IN (''admin'',''superadmin'',''colaborador''))';
 IF position(old IN body)=0 THEN RAISE EXCEPTION 'crm_ia_calendar_owner_contract';END IF;
 EXECUTE replace(body,old,'coalesce(private.crm_ia_agent_actor(p_client,p_owner),false)');
 body:=pg_get_functiondef('private.crm_ia_conversation_rows(uuid)'::regprocedure);
 old:='WHERE c.from_jid NOT LIKE ''%@g.us''';
 IF position(old IN body)=0 THEN RAISE EXCEPTION 'crm_ia_contact_reader_contract';END IF;
 body:=replace(body,old,old||' AND CASE WHEN a.staff_role=''cliente'' THEN public.cliente_atend_pode_ver_contato_de(a.actor_id,p_client,c.id) ELSE true END');
 old:='AND (a.staff_role IN (''superadmin'',''admin'') OR NOT a.crm_responsible OR l.responsavel_id=a.actor_id)';
 IF position(old IN body)=0 THEN RAISE EXCEPTION 'crm_ia_lead_reader_contract';END IF;
 EXECUTE replace(body,old,old||' AND CASE WHEN a.staff_role=''cliente'' THEN private.crm_ia_lead(l.id,p_client) ELSE true END');
END $$;

-- Discard inherited default grants before assigning the explicit public API below.
DO $$
DECLARE f record;g record;recipient text;
BEGIN
 FOR f IN SELECT p.oid,p.proowner,p.proacl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN('public','private') AND (p.proname LIKE '%\_pre\_client\_access' ESCAPE '\'
   OR p.proname=ANY(ARRAY['crm_ia_enabled','crm_ia_member','crm_ia_agent_actor','crm_ia_client','crm_ia_lead','crm_ia_channel','crm_ia_actor_contact',
    'crm_ia_client_access','crm_ia_access_admin','crm_ia_workspace','crm_ia_runtime_access','crm_ia_delivery_actor_check','crm_ia_delivery_recheck',
    'crm_ia_delivery_start','crm_ia_audio_target','crm_ia_voice_settings','crm_ia_calendar_owner','crm_ia_appointment_actor','crm_ia_calendar_workspace','crm_ia_access_revoked'])) LOOP
  FOR g IN SELECT DISTINCT grantee FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) WHERE grantee<>f.proowner LOOP
   recipient:=CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END;
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s',f.oid::regprocedure,recipient);
  END LOOP;
 END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.crm_ia_workspace_pre_client_access(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.crm_ia_workspace(text,uuid,jsonb),public.crm_ia_client_access(),public.crm_ia_access_admin(text,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.crm_ia_workspace(text,uuid,jsonb),public.crm_ia_client_access(),public.crm_ia_access_admin(text,uuid,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION private.crm_ia_enabled(uuid),private.crm_ia_member(uuid,uuid),private.crm_ia_agent_actor(uuid,uuid),
 private.crm_ia_client(uuid),private.crm_ia_lead(uuid,uuid),private.crm_ia_channel(uuid,uuid,boolean),private.crm_ia_actor_contact(uuid,uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.crm_ia_runtime_access(uuid,uuid,text,uuid,uuid),public.crm_ia_delivery_actor_check(uuid,text),
 public.crm_ia_delivery_recheck(uuid,uuid),public.crm_ia_delivery_start(text,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.crm_ia_runtime_access(uuid,uuid,text,uuid,uuid),public.crm_ia_delivery_actor_check(uuid,text),
 public.crm_ia_delivery_recheck(uuid,uuid),public.crm_ia_delivery_start(text,uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.crm_ia_calendar_workspace(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.crm_ia_calendar_workspace(text,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.crm_ia_calendar_workspace_pre_client_access(text,jsonb),private.crm_ia_audio_target(uuid,uuid,uuid,text,uuid),
 private.crm_ia_voice_settings(uuid),private.crm_ia_calendar_owner(uuid,uuid,uuid,uuid),private.crm_ia_access_revoked() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.crm_ia_appointment_actor(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
