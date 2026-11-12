BEGIN;
CREATE FUNCTION private.crm_ia_agent_manager(p_client uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(private.crm_ia_role() IN('admin','superadmin') AND private.crm_ia_client(p_client),false)
$$;
REVOKE ALL ON FUNCTION private.crm_ia_agent_manager(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.crm_ia_agent_manager(uuid) TO authenticated;
-- Check both row versions so a direct write cannot add or remove the CRM marker to escape the policy.
CREATE POLICY crm_ia_agent_definition_access ON public.cliente_atend_ia_agentes AS RESTRICTIVE FOR ALL TO authenticated
 USING(NOT(funil ? 'crm_ia') OR private.crm_ia_agent_manager(cliente_id))
 WITH CHECK(NOT(funil ? 'crm_ia') OR private.crm_ia_agent_manager(cliente_id));

CREATE FUNCTION public.cliente_atend_ia_agentes_resumo(p_cliente_id uuid)
RETURNS TABLE(id uuid,nome text,ativo boolean,setor_ids uuid[],funil jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_cliente_id IS NULL OR NOT coalesce(public.planeje_current_account_access(),false)
  OR NOT coalesce(public.cliente_atend_is_membro(p_cliente_id) OR public.cliente_atend_is_superadmin() OR private.crm_ia_agent_manager(p_cliente_id),false) THEN
  RAISE EXCEPTION 'Sem acesso aos agentes desta conta.' USING ERRCODE='42501';
 END IF;
 RETURN QUERY SELECT a.id,a.nome,a.ativo,a.setor_ids,a.funil-'crm_ia' FROM public.cliente_atend_ia_agentes a WHERE a.cliente_id=p_cliente_id ORDER BY a.created_at,a.id;
END$$;
REVOKE ALL ON FUNCTION public.cliente_atend_ia_agentes_resumo(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cliente_atend_ia_agentes_resumo(uuid) TO authenticated;

ALTER TABLE public.leads ADD COLUMN crm_ia_profile jsonb;
CREATE INDEX crm_ia_lead_profile ON public.leads(cliente_id,(crm_ia_profile->>'agent_id'),(crm_ia_profile->>'id')) WHERE crm_ia_profile IS NOT NULL;
CREATE TABLE planeje_private.crm_ia_profile_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cliente_id uuid NOT NULL REFERENCES public.clientes(id),lead_id uuid NOT NULL REFERENCES public.leads(id),
 from_profile jsonb,to_profile jsonb,actor_id uuid NOT NULL REFERENCES public.profiles(id),run_id uuid REFERENCES planeje_private.crm_ia_agent_runs(id),
 source text NOT NULL CHECK(source IN('manual','agent')),created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX crm_ia_profile_history_lead ON planeje_private.crm_ia_profile_history(cliente_id,lead_id,created_at DESC,id);
ALTER TABLE planeje_private.crm_ia_profile_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON planeje_private.crm_ia_profile_history FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON planeje_private.crm_ia_profile_history TO service_role;

CREATE FUNCTION private.crm_ia_profile_history_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'O histórico de perfis é somente de acréscimo.' USING ERRCODE='42501';END$$;
REVOKE ALL ON FUNCTION private.crm_ia_profile_history_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER crm_ia_profile_history_guard BEFORE UPDATE OR DELETE ON planeje_private.crm_ia_profile_history FOR EACH ROW EXECUTE FUNCTION private.crm_ia_profile_history_guard();

-- Effective database privileges authorize internal writes; client-controlled settings never do.
CREATE FUNCTION private.crm_ia_profile_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF (TG_OP='INSERT' AND NEW.crm_ia_profile IS NOT NULL OR TG_OP='UPDATE' AND NEW.crm_ia_profile IS DISTINCT FROM OLD.crm_ia_profile)
  AND current_user<>'service_role' AND NOT pg_has_role(current_user,(SELECT pg_get_userbyid(p.proowner) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='private' AND p.proname='crm_ia_profile_guard' AND p.pronargs=0),'USAGE') THEN
  RAISE EXCEPTION 'Altere o perfil pela operação autorizada do CRM IA.' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION private.crm_ia_profile_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER crm_ia_profile_guard BEFORE INSERT OR UPDATE OF crm_ia_profile ON public.leads FOR EACH ROW EXECUTE FUNCTION private.crm_ia_profile_guard();

CREATE FUNCTION private.crm_ia_profiles(p_profiles jsonb,p_kind text,p_client uuid DEFAULT NULL,p_copy boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb:='[]';item jsonb;actions jsonb;clues jsonb;profile_key uuid;owner_key uuid;seen uuid[]:='{}';tags text[];
BEGIN
 IF jsonb_typeof(p_profiles) IS DISTINCT FROM 'array' OR jsonb_array_length(p_profiles)>30 OR (jsonb_array_length(p_profiles)>0 AND p_kind IS DISTINCT FROM 'qualificacao') THEN
  RAISE EXCEPTION 'Informe até 30 perfis no agente de Qualificação.' USING ERRCODE='22023';
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_profiles) LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(item) k WHERE k NOT IN('id','nome','cor','descricao','pistas','actions'))
   OR jsonb_typeof(item->'id') IS DISTINCT FROM 'string' OR coalesce(item->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   OR jsonb_typeof(item->'nome') IS DISTINCT FROM 'string' OR length(btrim(item->>'nome')) NOT BETWEEN 1 AND 100
   OR jsonb_typeof(item->'cor') IS DISTINCT FROM 'string' OR coalesce(item->>'cor','') !~* '^#[0-9a-f]{6}$'
   OR jsonb_typeof(item->'descricao') IS DISTINCT FROM 'string' OR length(btrim(item->>'descricao')) NOT BETWEEN 1 AND 4000 THEN
   RAISE EXCEPTION 'Revise identidade, nome, cor e descrição do perfil.' USING ERRCODE='22023';
  END IF;
  profile_key:=(item->>'id')::uuid;
  IF profile_key=ANY(seen) THEN RAISE EXCEPTION 'A identidade do perfil deve ser única no agente.' USING ERRCODE='22023';END IF;
  seen:=array_append(seen,profile_key);
  clues:=coalesce(item->'pistas','[]');
  IF jsonb_typeof(clues) IS DISTINCT FROM 'array' OR jsonb_array_length(clues)>30 OR EXISTS(SELECT 1 FROM jsonb_array_elements(clues) c
    WHERE jsonb_typeof(c)<>'string' OR length(btrim(c#>>'{}')) NOT BETWEEN 1 AND 500) THEN RAISE EXCEPTION 'Informe até 30 pistas de 1 a 500 caracteres por perfil.' USING ERRCODE='22023';END IF;
  SELECT coalesce(jsonb_agg(clue ORDER BY position),'[]') INTO clues FROM(SELECT btrim(value#>>'{}') AS clue,min(ordinality) AS position FROM jsonb_array_elements(clues) WITH ORDINALITY GROUP BY btrim(value#>>'{}')) c;
  actions:=coalesce(item->'actions','{}');
  IF jsonb_typeof(actions) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(actions) k WHERE k NOT IN('owner_id','tags'))
   OR (actions ? 'owner_id' AND jsonb_typeof(actions->'owner_id') NOT IN('string','null')) THEN RAISE EXCEPTION 'Ações de perfil aceitam somente responsável e etiquetas.' USING ERRCODE='22023';END IF;
  owner_key:=nullif(actions->>'owner_id','')::uuid;
  IF NOT p_copy AND owner_key IS NOT NULL AND NOT coalesce(private.crm_ia_agent_actor(p_client,owner_key),false) THEN RAISE EXCEPTION 'Responsável do perfil indisponível nesta conta.' USING ERRCODE='42501';END IF;
  tags:=private.crm_ia_lead_tags(coalesce(actions->'tags','[]'));
  result:=result||jsonb_build_array(jsonb_build_object('id',CASE WHEN p_copy THEN gen_random_uuid() ELSE profile_key END,'nome',btrim(item->>'nome'),'cor',lower(item->>'cor'),
   'descricao',btrim(item->>'descricao'),'pistas',clues,'actions',jsonb_build_object('owner_id',CASE WHEN NOT p_copy THEN owner_key END,'tags',to_jsonb(tags))));
 END LOOP;
 RETURN result;
END$$;
REVOKE ALL ON FUNCTION private.crm_ia_profiles(jsonb,text,uuid,boolean) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.crm_ia_agent_profiles_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF jsonb_typeof(NEW.funil->'crm_ia')='object' AND NEW.funil->'crm_ia' ? 'profiles' THEN
  NEW.funil:=jsonb_set(NEW.funil,'{crm_ia,profiles}',private.crm_ia_profiles(NEW.funil#>'{crm_ia,profiles}',NEW.funil#>>'{crm_ia,tipo}',NEW.cliente_id));
 END IF;
 RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION private.crm_ia_agent_profiles_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER crm_ia_agent_profiles_guard BEFORE INSERT OR UPDATE OF funil ON public.cliente_atend_ia_agentes FOR EACH ROW EXECUTE FUNCTION private.crm_ia_agent_profiles_guard();

ALTER FUNCTION private.crm_ia_template(text,jsonb) RENAME TO crm_ia_template_pre_profiles;
REVOKE ALL ON FUNCTION private.crm_ia_template_pre_profiles(text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.crm_ia_template(p_type text,p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 result:=private.crm_ia_template_pre_profiles(p_type,p_data);
 IF p_type='agent' THEN result:=jsonb_set(result,'{funil,crm_ia,profiles}',private.crm_ia_profiles(coalesce(p_data#>'{funil,crm_ia,profiles}','[]'),result#>>'{funil,crm_ia,tipo}',NULL,true));END IF;
 RETURN result;
END$$;
REVOKE ALL ON FUNCTION private.crm_ia_template(text,jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.crm_ia_apply_profile(p_client uuid,p_lead uuid,p_profile jsonb,p_expected text,p_actor uuid,p_run uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE l public.leads;a public.cliente_atend_ia_agentes;profile jsonb;snapshot jsonb;owner_key uuid;actor_role text;r planeje_private.crm_ia_agent_runs;tags text[];
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('crm-ia:'||p_client::text,0));
 SELECT * INTO l FROM public.leads WHERE id=p_lead AND cliente_id=p_client FOR UPDATE;
 IF l.id IS NULL OR NOT coalesce(private.crm_ia_agent_actor(p_client,p_actor),false) THEN RAISE EXCEPTION 'Lead ou ator indisponível para o perfil.' USING ERRCODE='42501';END IF;
 IF p_run IS NULL THEN
  IF p_actor IS DISTINCT FROM auth.uid() OR NOT coalesce(private.crm_ia_lead(p_lead,p_client),false) THEN RAISE EXCEPTION 'Lead indisponível para o perfil.' USING ERRCODE='42501';END IF;
 ELSE
  SELECT * INTO r FROM planeje_private.crm_ia_agent_runs WHERE id=p_run AND cliente_id=p_client AND lead_id=p_lead AND actor_id=p_actor FOR UPDATE;
  IF r.id IS NULL OR r.status<>'queued' OR NOT coalesce(private.crm_ia_appointment_actor(p_client,r.channel_id,r.contact_id,p_lead,p_actor),false) THEN RAISE EXCEPTION 'Execução indisponível para o perfil.' USING ERRCODE='42501';END IF;
 END IF;
 PERFORM private.crm_ia_version(p_expected,l.updated_at);
 IF p_profile IS DISTINCT FROM 'null'::jsonb THEN
  IF jsonb_typeof(p_profile) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_profile) k WHERE k NOT IN('agent_id','id','agent_updated_at'))
   OR nullif(p_profile->>'agent_id','') IS NULL OR nullif(p_profile->>'id','') IS NULL OR nullif(p_profile->>'agent_updated_at','') IS NULL THEN RAISE EXCEPTION 'Referência de perfil inválida.' USING ERRCODE='22023';END IF;
  SELECT * INTO a FROM public.cliente_atend_ia_agentes WHERE id=(p_profile->>'agent_id')::uuid AND cliente_id=p_client FOR SHARE;
  IF a.id IS NULL OR a.funil#>>'{crm_ia,tipo}' IS DISTINCT FROM 'qualificacao' OR a.updated_at IS DISTINCT FROM (p_profile->>'agent_updated_at')::timestamptz
   OR (p_run IS NULL AND a.funil#>>'{crm_ia,pipeline_id}' IS DISTINCT FROM l.pipeline_id::text) OR (p_run IS NOT NULL AND a.id IS DISTINCT FROM r.agent_id) THEN RAISE EXCEPTION 'Perfil indisponível ou versão publicada alterada.' USING ERRCODE='40001';END IF;
  SELECT value INTO profile FROM jsonb_array_elements(coalesce(a.funil#>'{crm_ia,profiles}','[]')) WHERE value->>'id'=(p_profile->>'id')::uuid::text;
  IF profile IS NULL THEN RAISE EXCEPTION 'Perfil removido ou indisponível neste agente.' USING ERRCODE='22023';END IF;
 END IF;
 -- The source lock can outlive authorization, including when the profile itself is unchanged.
 SELECT role::text INTO actor_role FROM public.profiles WHERE id=p_actor AND status='active';
 IF actor_role IS NULL OR actor_role NOT IN('admin','superadmin','colaborador') OR NOT coalesce(private.crm_ia_agent_actor(p_client,p_actor),false)
  OR (p_run IS NULL AND (p_actor IS DISTINCT FROM auth.uid() OR NOT coalesce(private.crm_ia_client(p_client),false) OR NOT coalesce(private.crm_ia_lead(p_lead,p_client),false)))
  OR (p_run IS NOT NULL AND NOT coalesce(private.crm_ia_appointment_actor(p_client,r.channel_id,r.contact_id,p_lead,p_actor),false)) THEN
  RAISE EXCEPTION 'Lead ou ator indisponível para o perfil.' USING ERRCODE='42501';
 END IF;
 IF p_profile IS DISTINCT FROM 'null'::jsonb THEN
  IF l.crm_ia_profile->>'agent_id'=a.id::text AND l.crm_ia_profile->>'id'=profile->>'id' THEN RETURN to_jsonb(l);END IF;
  owner_key:=nullif(profile#>>'{actions,owner_id}','')::uuid;
  IF owner_key IS NOT NULL AND NOT coalesce(private.crm_ia_agent_actor(p_client,owner_key),false) THEN RAISE EXCEPTION 'Responsável do perfil perdeu acesso à conta.' USING ERRCODE='42501';END IF;
  IF actor_role='colaborador' AND owner_key IS NOT NULL AND owner_key IS DISTINCT FROM l.responsavel_id AND owner_key IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'Somente a gestão pode transferir o perfil para outra pessoa.' USING ERRCODE='42501';END IF;
  SELECT private.crm_ia_lead_tags(coalesce(jsonb_agg(tag ORDER BY first_position),'[]')) INTO tags FROM(
   SELECT btrim(value#>>'{}') AS tag,min(ordinality) AS first_position FROM jsonb_array_elements(to_jsonb(coalesce(l.etiquetas,ARRAY[]::text[]))||coalesce(profile#>'{actions,tags}','[]')) WITH ORDINALITY GROUP BY btrim(value#>>'{}')
  ) combined;
  snapshot:=jsonb_build_object('agent_id',a.id,'id',profile->'id','nome',profile->'nome','cor',profile->'cor','agent_updated_at',a.updated_at);
 ELSE
  IF l.crm_ia_profile IS NULL THEN RETURN to_jsonb(l);END IF;
  tags:=l.etiquetas;
 END IF;
 INSERT INTO planeje_private.crm_ia_profile_history(cliente_id,lead_id,from_profile,to_profile,actor_id,run_id,source)
 VALUES(p_client,p_lead,l.crm_ia_profile,snapshot,p_actor,p_run,CASE WHEN p_run IS NULL THEN 'manual' ELSE 'agent' END);
 UPDATE public.leads SET crm_ia_profile=snapshot,etiquetas=tags,responsavel_id=coalesce(owner_key,responsavel_id),updated_at=clock_timestamp() WHERE id=l.id RETURNING * INTO l;
 RETURN to_jsonb(l);
END$$;
REVOKE ALL ON FUNCTION private.crm_ia_apply_profile(uuid,uuid,jsonb,text,uuid,uuid) FROM PUBLIC,anon,authenticated;

ALTER FUNCTION public.crm_ia_workspace(text,uuid,jsonb) RENAME TO crm_ia_workspace_pre_profiles;
REVOKE ALL ON FUNCTION public.crm_ia_workspace_pre_profiles(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.crm_ia_workspace(p_action text,p_client_id uuid DEFAULT NULL,p_payload jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;changed jsonb;metadata jsonb;
BEGIN
 IF p_action='save_lead' AND p_payload ? 'crm_ia_profile' THEN RAISE EXCEPTION 'Atribua o perfil pelo campo autorizado.' USING ERRCODE='42501';END IF;
 result:=public.crm_ia_workspace_pre_profiles(p_action,p_client_id,p_payload);
 IF p_action='save_lead' AND p_payload ? 'profile' THEN
  changed:=private.crm_ia_apply_profile(p_client_id,(result->>'id')::uuid,p_payload->'profile',result->>'updated_at',auth.uid());result:=result||changed;
 ELSIF p_action='workspace' THEN
  WITH published AS (
   SELECT a.id AS agent_id,a.funil#>>'{crm_ia,pipeline_id}' AS pipeline_id,p.value->>'id' AS id,p.value->>'nome' AS nome,p.value->>'cor' AS cor,a.updated_at AS agent_updated_at,
    a.created_at,p.ordinality FROM public.cliente_atend_ia_agentes a CROSS JOIN LATERAL jsonb_array_elements(coalesce(a.funil#>'{crm_ia,profiles}','[]')) WITH ORDINALITY p
   WHERE a.cliente_id=p_client_id AND a.funil#>>'{crm_ia,tipo}'='qualificacao'
  ), historical AS (
   SELECT DISTINCT l.crm_ia_profile,l.pipeline_id FROM public.leads l WHERE l.cliente_id=p_client_id AND private.crm_ia_lead(l.id,p_client_id) AND l.crm_ia_profile IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM published p WHERE p.agent_id::text=l.crm_ia_profile->>'agent_id' AND p.id=l.crm_ia_profile->>'id')
  ), combined AS (
   SELECT jsonb_build_object('agent_id',p.agent_id,'pipeline_id',p.pipeline_id,'id',p.id,'nome',p.nome,'cor',p.cor,'agent_updated_at',p.agent_updated_at) AS item,p.created_at,p.ordinality,false AS historical FROM published p
   UNION ALL SELECT h.crm_ia_profile||jsonb_build_object('pipeline_id',h.pipeline_id,'historical',true),NULL::timestamptz,NULL::bigint,true FROM historical h
  ) SELECT coalesce(jsonb_agg(item ORDER BY historical,created_at,ordinality,item->>'agent_id',item->>'id'),'[]') INTO metadata FROM combined;
  result:=result||jsonb_build_object('lead_profiles',metadata);
 ELSIF p_action='lead' THEN
  result:=result||jsonb_build_object('lead',result->'lead'||jsonb_build_object('attendance',result#>'{conversation,attendance}','awaiting_since',result#>'{conversation,awaiting_since}'),
   'profile_history',coalesce((SELECT jsonb_agg(to_jsonb(h)-ARRAY['cliente_id','lead_id','run_id'] ORDER BY h.created_at DESC,h.id)
    FROM planeje_private.crm_ia_profile_history h WHERE h.cliente_id=p_client_id AND h.lead_id=(result#>>'{lead,id}')::uuid AND private.crm_ia_lead(h.lead_id,p_client_id)),'[]'),
   'conversations',coalesce((SELECT jsonb_agg(to_jsonb(c)-ARRAY['phone','pipeline_id','stage_id','origin','followup_due_at','value'] ORDER BY c.last_message_at DESC,c.channel_id)
    FROM private.crm_ia_conversation_rows(p_client_id) c WHERE c.contact_id=nullif(result#>>'{lead,contact_id}','')::uuid),'[]'));
 END IF;
 RETURN result;
END$$;
REVOKE ALL ON FUNCTION public.crm_ia_workspace(text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_ia_workspace(text,uuid,jsonb) TO authenticated;

ALTER FUNCTION public.crm_ia_apply_agent_action(uuid,jsonb,text,jsonb) RENAME TO crm_ia_apply_agent_action_pre_profiles;
REVOKE ALL ON FUNCTION public.crm_ia_apply_agent_action_pre_profiles(uuid,jsonb,text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.crm_ia_apply_agent_action(p_run uuid,p_action jsonb,p_reply text,p_followup jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r planeje_private.crm_ia_agent_runs;a public.cliente_atend_ia_agentes;result_data jsonb;changed jsonb;reference jsonb;source public.cliente_whatsapp_inbox;
BEGIN
 SELECT * INTO r FROM planeje_private.crm_ia_agent_runs WHERE id=p_run FOR UPDATE;
 IF r.status='queued' THEN RETURN r.result;END IF;
 IF p_action ? 'profile_id' THEN
  IF p_action->>'type' NOT IN('answer','qualify') OR jsonb_typeof(p_action->'profile_id') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'crm_ia_profile_action' USING ERRCODE='22023';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('crm-ia:'||r.cliente_id::text,0));
  SELECT * INTO a FROM public.cliente_atend_ia_agentes WHERE id=r.agent_id AND cliente_id=r.cliente_id FOR SHARE;
  IF a.funil#>>'{crm_ia,tipo}' IS DISTINCT FROM 'qualificacao' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(a.funil#>'{crm_ia,profiles}','[]')) p WHERE p->>'id'=p_action->>'profile_id') THEN RAISE EXCEPTION 'crm_ia_profile_unavailable' USING ERRCODE='22023';END IF;
  reference:=jsonb_build_object('agent_id',a.id,'id',p_action->'profile_id','agent_updated_at',a.updated_at);
 END IF;
 result_data:=public.crm_ia_apply_agent_action_pre_profiles(p_run,p_action,p_reply,p_followup);
 IF reference IS NOT NULL AND r.status='claimed' AND result_data->>'queued'='true' THEN
  SELECT i.* INTO source FROM public.cliente_whatsapp_inbox i JOIN public.cliente_whatsapp_contact c ON c.id=r.contact_id AND c.cliente_id=r.cliente_id
   WHERE i.id=nullif(r.snapshot->>'source_inbox_id','')::uuid AND i.cliente_id=r.cliente_id AND i.whatsapp_config_id=r.channel_id
    AND coalesce(nullif(i.chat_jid,''),i.from_jid)=c.from_jid AND i.message_id=r.snapshot->>'source_message_id' AND i.type IS NOT DISTINCT FROM r.snapshot->>'source_message_type'
    AND NOT coalesce(i.is_group,false) AND i.media_purged_at IS NULL AND (r.mode<>'responder' OR i.message_id=r.message_id)
    AND NOT jsonb_path_exists(coalesce(i.raw_payload,'{}'),'$.**.fromMe ? (@ == true || @ == "true" || @ == 1)')
    AND NOT jsonb_path_exists(coalesce(i.raw_payload,'{}'),'$.**.from_me ? (@ == true || @ == "true" || @ == 1)')
    AND i.id=(SELECT latest.id FROM public.cliente_whatsapp_inbox latest WHERE latest.cliente_id=r.cliente_id AND latest.whatsapp_config_id=r.channel_id
      AND coalesce(nullif(latest.chat_jid,''),latest.from_jid)=c.from_jid AND NOT coalesce(latest.is_group,false) ORDER BY latest.created_at DESC,latest.id DESC LIMIT 1) FOR SHARE OF i;
  IF source.id IS NULL THEN RAISE EXCEPTION 'crm_ia_profile_source_changed' USING ERRCODE='40001';END IF;
  changed:=private.crm_ia_apply_profile(r.cliente_id,r.lead_id,reference,result_data->>'lead_updated_at',r.actor_id,r.id);
  result_data:=result_data||jsonb_build_object('lead_updated_at',changed->'updated_at','profile',changed->'crm_ia_profile');
  UPDATE planeje_private.crm_ia_agent_runs SET result=result_data WHERE id=r.id;
 END IF;
 RETURN result_data;
END$$;
REVOKE ALL ON FUNCTION public.crm_ia_apply_agent_action(uuid,jsonb,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_ia_apply_agent_action(uuid,jsonb,text,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
