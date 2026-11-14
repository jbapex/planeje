BEGIN;

-- Definitions bind to native Squad records; this table is neither a queue nor a scheduler.
CREATE TABLE planeje_private.atlas_squad_automations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES public.profiles(id),
 client_id uuid REFERENCES public.clientes(id),app text NOT NULL CHECK(app IN('crm','cs','gestor','atlas')),
 recipe text NOT NULL CHECK(recipe IN('crm_followup','crm_capture','cs_group_tasks','gestor_agenda','squad_manual')),
 config jsonb NOT NULL CHECK(jsonb_typeof(config)='object' AND octet_length(config::text)<=60000),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),state text NOT NULL DEFAULT 'saved' CHECK(state IN('saved','active','paused')),
 native_version text,native_receipt jsonb,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((app='atlas' AND recipe='squad_manual') OR (app='crm' AND recipe IN('crm_followup','crm_capture') AND client_id IS NOT NULL)
  OR (app='cs' AND recipe='cs_group_tasks' AND client_id IS NOT NULL) OR (app='gestor' AND recipe='gestor_agenda' AND client_id IS NOT NULL))
);
CREATE INDEX atlas_squad_automations_owner ON planeje_private.atlas_squad_automations(owner_id,client_id,app,updated_at DESC,id);
CREATE UNIQUE INDEX atlas_squad_automations_native_resource ON planeje_private.atlas_squad_automations(owner_id,client_id,recipe,
 (CASE recipe WHEN 'crm_followup' THEN config->>'pipeline_id' WHEN 'crm_capture' THEN config->>'channel_id'
 WHEN 'cs_group_tasks' THEN config->>'conversation_id' WHEN 'gestor_agenda' THEN config->>'account_id' END)) WHERE recipe<>'squad_manual';
ALTER TABLE planeje_private.atlas_squad_automations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON planeje_private.atlas_squad_automations FROM PUBLIC,anon,authenticated,service_role;

-- An operational proof expires; no browser/model can enable a worker or an environment flag.
CREATE TABLE planeje_private.atlas_squad_automation_runtime(app text PRIMARY KEY CHECK(app IN('cs','gestor')),ready boolean NOT NULL DEFAULT false,valid_until timestamptz NOT NULL DEFAULT '-infinity');
INSERT INTO planeje_private.atlas_squad_automation_runtime(app) VALUES('cs'),('gestor');
ALTER TABLE planeje_private.atlas_squad_automation_runtime ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON planeje_private.atlas_squad_automation_runtime FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.atlas_squad_automation_runtime_status(p_app text,p_ready boolean,p_valid_until timestamptz) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR auth.uid() IS NOT NULL THEN RAISE insufficient_privilege;END IF;
 IF p_app IS NULL OR p_app NOT IN('cs','gestor') OR p_ready IS NULL OR p_valid_until IS NULL
  OR p_valid_until>clock_timestamp()+interval '1 day' OR p_ready AND p_valid_until<=clock_timestamp() THEN RAISE invalid_parameter_value;END IF;
 UPDATE planeje_private.atlas_squad_automation_runtime SET ready=p_ready,valid_until=p_valid_until WHERE app=p_app;RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.atlas_squad_automation_runtime_status(text,boolean,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_squad_automation_runtime_status(text,boolean,timestamptz) TO service_role;

CREATE FUNCTION private.atlas_squad_automation_config(p_app text,p_recipe text,p_config jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE allowed text[];item jsonb;step jsonb;seen text[]:='{}';key text;part jsonb;
BEGIN
 IF p_app IS NULL OR p_recipe IS NULL OR jsonb_typeof(p_config) IS DISTINCT FROM 'object' OR octet_length(p_config::text)>60000
  OR coalesce(length(btrim(p_config->>'name')),0) NOT BETWEEN 1 AND 80 THEN RAISE invalid_parameter_value USING MESSAGE='Definição da automação inválida.';END IF;
 IF EXISTS(WITH RECURSIVE tree(value) AS (
  SELECT p_config UNION ALL SELECT child.value FROM tree t CROSS JOIN LATERAL (
   SELECT value FROM jsonb_each(CASE WHEN jsonb_typeof(t.value)='object' THEN t.value ELSE '{}' END)
   UNION ALL SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(t.value)='array' THEN t.value ELSE '[]' END)
  ) child
 ) SELECT 1 FROM tree t CROSS JOIN LATERAL jsonb_object_keys(CASE WHEN jsonb_typeof(t.value)='object' THEN t.value ELSE '{}' END) k
 WHERE k ~* '^(client_id|cliente_id|clientId|p_client_id|target_client_id|rpc|sql|table|headers|authorization|env|webhook|provider|api_key|access_token|service_role|__proto__|constructor|prototype)$')
 THEN RAISE invalid_parameter_value USING MESSAGE='Campo de escopo ou integração não permitido.';END IF;
 allowed:=CASE WHEN p_app='crm' AND p_recipe='crm_followup' THEN ARRAY['name','agent_id','pipeline_id','stage_ids','cadence','windows','instructions']
 WHEN p_app='crm' AND p_recipe='crm_capture' THEN ARRAY['name','channel_id','pipeline_id','stage_id','mode','phrase','tags']
 WHEN p_app='cs' AND p_recipe='cs_group_tasks' THEN ARRAY['name','conversation_id','include_audio','transcribe_new_audio','moves','creation','context']
 WHEN p_app='gestor' AND p_recipe='gestor_agenda' THEN ARRAY['name','agenda_id','account_id','run_time','weekdays','categories']
 WHEN p_app='atlas' AND p_recipe='squad_manual' THEN ARRAY['version','recipe','name','steps'] END;
 IF allowed IS NULL OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_config) k WHERE NOT k=ANY(allowed)) THEN RAISE invalid_parameter_value USING MESSAGE='Receita fora do aplicativo.';END IF;
 IF p_recipe='crm_followup' THEN
  PERFORM (p_config->>'pipeline_id')::uuid;IF nullif(p_config->>'pipeline_id','') IS NULL THEN RAISE invalid_parameter_value;END IF;
  IF p_config ? 'agent_id' THEN PERFORM (p_config->>'agent_id')::uuid;END IF;
  IF jsonb_typeof(p_config->'stage_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(p_config->'stage_ids') NOT BETWEEN 1 AND 100
   OR jsonb_typeof(p_config->'cadence') IS DISTINCT FROM 'array' OR jsonb_array_length(p_config->'cadence') NOT BETWEEN 1 AND 10 THEN RAISE invalid_parameter_value;END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_config->'stage_ids') LOOP PERFORM (item#>>'{}')::uuid;END LOOP;
  IF (SELECT count(DISTINCT value)<>count(*) FROM jsonb_array_elements(p_config->'stage_ids')) THEN RAISE invalid_parameter_value;END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_config->'cadence') LOOP
   IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR NOT item ?& ARRAY['valor','unidade'] OR EXISTS(SELECT 1 FROM jsonb_object_keys(item) k WHERE k NOT IN('valor','unidade'))
    OR jsonb_typeof(item->'valor') IS DISTINCT FROM 'number' OR (item->>'valor')::numeric<=0 OR (item->>'valor')::numeric>365
    OR item->>'unidade' IS NULL OR item->>'unidade' NOT IN('horas','dias') THEN RAISE invalid_parameter_value;END IF;
  END LOOP;
  IF p_config ? 'instructions' AND (jsonb_typeof(p_config->'instructions')<>'string' OR length(p_config->>'instructions') NOT BETWEEN 1 AND 8000) THEN RAISE invalid_parameter_value;END IF;
  IF p_config ? 'windows' THEN
   IF jsonb_typeof(p_config->'windows') IS DISTINCT FROM 'array' OR jsonb_array_length(p_config->'windows')>14 THEN RAISE invalid_parameter_value;END IF;
   FOR item IN SELECT value FROM jsonb_array_elements(p_config->'windows') LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(item) k WHERE k NOT IN('dias','inicio','fim'))
     OR jsonb_typeof(item->'dias') IS DISTINCT FROM 'array' OR jsonb_array_length(item->'dias') NOT BETWEEN 1 AND 7
     OR coalesce(item->>'inicio','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR coalesce(item->>'fim','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR item->>'inicio'>=item->>'fim'
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(item->'dias') d WHERE jsonb_typeof(d)<>'number' OR d::text !~ '^[0-6]$') THEN RAISE invalid_parameter_value;END IF;
   END LOOP;
  END IF;
 ELSIF p_recipe='crm_capture' THEN
  FOREACH key IN ARRAY ARRAY['channel_id','pipeline_id','stage_id'] LOOP IF nullif(p_config->>key,'') IS NULL THEN RAISE invalid_parameter_value;END IF;PERFORM (p_config->>key)::uuid;END LOOP;
  IF p_config->>'mode' IS NULL OR p_config->>'mode' NOT IN('all','phrase') OR p_config->>'mode'='phrase' AND coalesce(length(btrim(p_config->>'phrase')),0) NOT BETWEEN 1 AND 300 THEN RAISE invalid_parameter_value;END IF;
  IF p_config ? 'tags' AND (jsonb_typeof(p_config->'tags') IS DISTINCT FROM 'array' OR jsonb_array_length(p_config->'tags')>50) THEN RAISE invalid_parameter_value;END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p_config->'tags','[]')) t WHERE jsonb_typeof(t)<>'string' OR length(btrim(t#>>'{}')) NOT BETWEEN 1 AND 100) THEN RAISE invalid_parameter_value;END IF;
 ELSIF p_recipe='cs_group_tasks' THEN
  IF nullif(p_config->>'conversation_id','') IS NULL THEN RAISE invalid_parameter_value;END IF;PERFORM (p_config->>'conversation_id')::uuid;
  FOREACH key IN ARRAY ARRAY['include_audio','transcribe_new_audio','moves','creation','context'] LOOP IF p_config ? key AND jsonb_typeof(p_config->key) IS DISTINCT FROM 'boolean' THEN RAISE invalid_parameter_value;END IF;END LOOP;
  IF p_config->>'transcribe_new_audio'='true' AND p_config->>'include_audio'='false' THEN RAISE invalid_parameter_value;END IF;
 ELSIF p_recipe='gestor_agenda' THEN
  IF p_config ? 'agenda_id' THEN PERFORM (p_config->>'agenda_id')::uuid;IF p_config->>'agenda_id' IS NULL THEN RAISE invalid_parameter_value;END IF;END IF;
  IF coalesce(p_config->>'account_id','') !~ '^act_[0-9]{1,32}$' OR coalesce(p_config->>'run_time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
   OR jsonb_typeof(p_config->'weekdays') IS DISTINCT FROM 'array' OR jsonb_array_length(p_config->'weekdays') NOT BETWEEN 1 AND 7
   OR jsonb_typeof(p_config->'categories') IS DISTINCT FROM 'array' OR jsonb_array_length(p_config->'categories')>6
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_config->'weekdays') d WHERE jsonb_typeof(d)<>'number' OR d::text !~ '^[1-7]$')
   OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_config->'categories') c WHERE c NOT IN('escala','custo','verba','criativo','ia','descoberta'))
   OR (SELECT count(DISTINCT value)<>count(*) FROM jsonb_array_elements(p_config->'weekdays')) OR (SELECT count(DISTINCT value)<>count(*) FROM jsonb_array_elements(p_config->'categories')) THEN RAISE invalid_parameter_value;END IF;
 ELSE
  IF p_config->'version' IS DISTINCT FROM '1'::jsonb OR p_config->>'recipe' IS DISTINCT FROM 'squad_manual'
   OR jsonb_typeof(p_config->'steps') IS DISTINCT FROM 'array' OR jsonb_array_length(p_config->'steps') NOT BETWEEN 1 AND 8 THEN RAISE invalid_parameter_value;END IF;
  FOR step IN SELECT value FROM jsonb_array_elements(p_config->'steps') LOOP
   IF jsonb_typeof(step) IS DISTINCT FROM 'object' OR coalesce(step->>'id','') !~ '^[a-z][a-z0-9_-]{0,31}$' OR step->>'id'=ANY(seen) THEN RAISE invalid_parameter_value;END IF;
   allowed:=CASE step->>'type' WHEN 'read' THEN ARRAY['id','type','app','view','input'] WHEN 'ai' THEN ARRAY['id','type','instruction','input_steps'] WHEN 'condition' THEN ARRAY['id','type','source','operator','value'] WHEN 'result' THEN ARRAY['id','type','source_step','text'] END;
   IF allowed IS NULL OR EXISTS(SELECT 1 FROM jsonb_object_keys(step) k WHERE NOT k=ANY(allowed)) THEN RAISE invalid_parameter_value;END IF;
   IF step->>'type'='read' AND (step->>'app' IS NULL OR step->>'app' NOT IN('crm','cs','gestor') OR nullif(step->>'view','') IS NULL OR jsonb_typeof(coalesce(step->'input','{}'))<>'object') THEN RAISE invalid_parameter_value;END IF;
   IF step->>'type'='read' AND NOT coalesce(step->>'view'=ANY(CASE step->>'app'
    WHEN 'crm' THEN ARRAY['workspace','overview','leads','lead','history','conversations','conversation','agenda','usage','pipelines','stages','agents','knowledge','products','templates','configurations']
    WHEN 'cs' THEN ARRAY['radar','health','history','sources','team','response_times','groups','connections','settings','analysis_settings','reading','reading_signals','group_binding','task_rules','segments','churn']
    WHEN 'gestor' THEN ARRAY['accounts','metrics','goals','agenda','decisions','reports','report_reading','report_models','client_report_model','routine','routine_history','portal','portal_preview'] END),false)
   THEN RAISE invalid_parameter_value USING MESSAGE='Leitura fora do catálogo exclusivo do Squad.';END IF;
   IF step->>'type'='ai' THEN
    IF coalesce(length(btrim(step->>'instruction')),0) NOT BETWEEN 1 AND 4000 OR jsonb_typeof(coalesce(step->'input_steps','[]'))<>'array'
     OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(coalesce(step->'input_steps','[]')) s WHERE NOT s=ANY(seen)) THEN RAISE invalid_parameter_value;END IF;
   ELSIF step->>'type'='condition' THEN
    IF jsonb_typeof(step->'source') IS DISTINCT FROM 'object' OR NOT coalesce(step#>>'{source,step_id}'=ANY(seen),false)
     OR EXISTS(SELECT 1 FROM jsonb_object_keys(step->'source') k WHERE k NOT IN('step_id','path')) OR step->>'operator' IS NULL OR step->>'operator' NOT IN('eq','neq','gt','gte','lt','lte','contains','exists')
     OR step->>'operator'<>'exists' AND NOT step ? 'value' OR jsonb_typeof(step->'value') IN('object','array')
     OR step->>'operator' IN('gt','gte','lt','lte') AND jsonb_typeof(step->'value') IS DISTINCT FROM 'number'
     OR jsonb_typeof(coalesce(step#>'{source,path}','[]'))<>'array' OR jsonb_array_length(coalesce(step#>'{source,path}','[]'))>8 THEN RAISE invalid_parameter_value;END IF;
    FOR part IN SELECT value FROM jsonb_array_elements(coalesce(step#>'{source,path}','[]')) LOOP
     IF jsonb_typeof(part) NOT IN('string','number') OR jsonb_typeof(part)='string' AND (length(part#>>'{}') NOT BETWEEN 1 AND 80 OR part#>>'{}' IN('__proto__','constructor','prototype')) THEN RAISE invalid_parameter_value;END IF;
    END LOOP;
   ELSIF step->>'type'='result' AND (step ? 'source_step' AND NOT coalesce(step->>'source_step'=ANY(seen),false) OR NOT step ? 'source_step' AND coalesce(length(btrim(step->>'text')),0) NOT BETWEEN 1 AND 4000) THEN RAISE invalid_parameter_value;END IF;
   seen:=array_append(seen,step->>'id');
  END LOOP;
 END IF;
END $$;

CREATE FUNCTION private.atlas_squad_automation_scope(p_app text,p_client uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 PERFORM private.atlas_executor_user();
 IF NOT private.atlas_squad_client_access(p_client) OR p_app IS NULL OR p_app NOT IN('crm','cs','gestor','atlas') OR p_app<>'atlas' AND p_client IS NULL THEN RAISE insufficient_privilege;END IF;
 IF p_app='crm' AND (coalesce(private.crm_ia_role(),'') NOT IN('admin','superadmin') OR NOT private.crm_ia_client(p_client))
  OR p_app='cs' AND (coalesce(private.cs_ia_role(),'') NOT IN('admin','superadmin') OR NOT private.cs_ia_client_exists(p_client))
  OR p_app='gestor' AND (coalesce((SELECT p.role::text FROM public.profiles p WHERE p.id=auth.uid() AND p.status='active'),'') NOT IN('admin','superadmin') OR private.gestor_ia_pode_registrar_decisao(p_client) IS DISTINCT FROM true) THEN RAISE insufficient_privilege;END IF;
END $$;
CREATE FUNCTION public.atlas_squad_automation_manual_access(p_client_id uuid DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM private.atlas_squad_automation_scope('atlas',p_client_id);RETURN true;END $$;
REVOKE ALL ON FUNCTION public.atlas_squad_automation_manual_access(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.atlas_squad_automation_manual_access(uuid) TO authenticated;

CREATE FUNCTION private.atlas_squad_automation_source(p_app text,p_client uuid,p_recipe text,p_config jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE w jsonb;a jsonb;c jsonb;s jsonb;g jsonb;channel jsonb;linked jsonb;ready boolean;effective boolean:=false;proof boolean:=false;n integer;
BEGIN
 PERFORM private.atlas_squad_automation_scope(p_app,p_client);PERFORM private.atlas_squad_automation_config(p_app,p_recipe,p_config);
 IF p_recipe='squad_manual' THEN RETURN jsonb_build_object('ready',true,'effective',false);END IF;
 IF p_app='crm' THEN
  w:=public.crm_ia_workspace('workspace',p_client,'{}');
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(w->'pipelines') p WHERE p->>'id'=p_config->>'pipeline_id') THEN RAISE insufficient_privilege USING MESSAGE='Funil indisponível.';END IF;
  IF p_recipe='crm_followup' THEN
   IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_config->'stage_ids') i WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(w->'stages') t WHERE t->>'id'=i AND t->>'pipeline_id'=p_config->>'pipeline_id')) THEN RAISE insufficient_privilege;END IF;
   SELECT count(*),jsonb_agg(x)->0 INTO n,a FROM jsonb_array_elements(w->'agents') x WHERE CASE WHEN p_config ? 'agent_id' THEN x->>'id'=p_config->>'agent_id' ELSE x#>>'{funil,crm_ia,tipo}'='followup' AND x#>>'{funil,crm_ia,pipeline_id}'=p_config->>'pipeline_id' END;
   IF n>1 OR p_config ? 'agent_id' AND n<>1 OR a IS NOT NULL AND (a#>>'{funil,crm_ia,tipo}' IS DISTINCT FROM 'followup' OR a#>>'{funil,crm_ia,pipeline_id}' IS DISTINCT FROM p_config->>'pipeline_id') THEN RAISE serialization_failure USING MESSAGE='Agente de follow-up ambíguo ou alterado.';END IF;
   ready:=w->>'provisioned'='true' AND w#>>'{config,data,attendance,auto_send}'='true' AND EXISTS(SELECT 1 FROM jsonb_array_elements(w->'channels') x WHERE x->>'can_send'='true');
   effective:=ready AND a->>'ativo'='true' AND a->>'auto_responder'='true';
   a:=private.atlas_executor_squad_pick(a,ARRAY['id','nome','objetivo','instrucoes','tom','modelo','base_ids','setor_ids','ativo','auto_responder','funil','updated_at']);
  ELSE
   SELECT x INTO channel FROM jsonb_array_elements(w->'channels') x WHERE x->>'id'=p_config->>'channel_id';
   IF channel IS NULL OR channel->>'can_send' IS DISTINCT FROM 'true' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(w->'stages') x WHERE x->>'id'=p_config->>'stage_id' AND x->>'pipeline_id'=p_config->>'pipeline_id') THEN RAISE insufficient_privilege;END IF;
   SELECT x INTO c FROM jsonb_array_elements(coalesce(w#>'{config,data,entry,channels}','[]')) x WHERE x->>'channel_id'=p_config->>'channel_id';
   ready:=w->>'provisioned'='true';effective:=ready AND w#>>'{config,data,entry,enabled}'='true' AND c->>'enabled'='true';
  END IF;
  RETURN jsonb_build_object('ready',coalesce(ready,false),'effective',coalesce(effective,false),'agent',a,'channel',channel,'entry',coalesce(w#>'{config,data,entry}','{}'),
   'config_revision',w#>'{config,revision}','auto_send',coalesce(w#>>'{config,data,attendance,auto_send}'='true',false),'provisioned',w->'provisioned');
 ELSIF p_app='cs' THEN
  s:=public.atlas_executor_cs_reading_snapshot(p_client,(p_config->>'conversation_id')::uuid);
  SELECT jsonb_build_object('reading_enabled',x.reading_enabled,'transcription_enabled',x.transcription_enabled,'version',x.version) INTO a FROM public.cs_ia_analysis_settings x WHERE id=1;
  SELECT jsonb_build_object('task_board_enabled',x.task_board_enabled,'task_automation_enabled',x.task_automation_enabled,'version',x.task_controls_version) INTO g FROM public.cs_ia_settings x WHERE id=1;
  SELECT r.ready AND r.valid_until>now() INTO proof FROM planeje_private.atlas_squad_automation_runtime r WHERE app='cs';
  ready:=proof AND a->>'reading_enabled'='true' AND s#>>'{reading,can_configure}'='true'
   AND (NOT (coalesce((p_config->>'moves')::boolean,false) OR coalesce((p_config->>'creation')::boolean,false) OR coalesce((p_config->>'context')::boolean,false)) OR g->>'task_board_enabled'='true' AND g->>'task_automation_enabled'='true' AND private.cs_ia_user_task_module(auth.uid(),'tasks'))
   AND (p_config->>'transcribe_new_audio' IS DISTINCT FROM 'true' OR a->>'transcription_enabled'='true');
  effective:=s#>>'{reading,enabled}'='true'
   AND (p_config->>'moves' IS DISTINCT FROM 'true' OR s#>>'{task_moves,enabled}'='true') AND (p_config->>'creation' IS DISTINCT FROM 'true' OR s#>>'{task_creation,enabled}'='true') AND (p_config->>'context' IS DISTINCT FROM 'true' OR s#>>'{task_context,enabled}'='true');
  RETURN jsonb_build_object('snapshot',s,'analysis',a,'controls',g,'runtime_ready',coalesce(proof,false),'ready',coalesce(ready,false),'effective',coalesce(effective,false));
 ELSE
  IF private.gestor_ia_agenda_scope(p_client,p_config->>'account_id') IS DISTINCT FROM true THEN RAISE insufficient_privilege;END IF;
  SELECT to_jsonb(x) INTO a FROM public.gestor_ia_agendas x WHERE owner_id=auth.uid() AND client_id=p_client AND account_id=p_config->>'account_id';
  IF p_config->>'agenda_id' IS NOT NULL AND a->>'id' IS DISTINCT FROM p_config->>'agenda_id' THEN RAISE serialization_failure USING MESSAGE='A agenda nativa vinculada foi removida ou substituída.';END IF;
  SELECT r.ready AND r.valid_until>now() INTO proof FROM planeje_private.atlas_squad_automation_runtime r WHERE app='gestor';
  RETURN jsonb_build_object('agenda',a,'runtime_ready',coalesce(proof,false),'ready',coalesce(proof,false),'effective',coalesce(a->>'enabled'='true',false));
 END IF;
END $$;

CREATE FUNCTION private.atlas_squad_automation_old_inactive(p_app text,p_client uuid,p_recipe text,p_config jsonb) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 PERFORM private.atlas_squad_automation_scope(p_app,p_client);
 IF p_recipe='crm_followup' AND p_config->>'agent_id' IS NOT NULL THEN
  RETURN NOT EXISTS(SELECT 1 FROM public.cliente_atend_ia_agentes a WHERE a.id=(p_config->>'agent_id')::uuid AND a.cliente_id=p_client AND a.auto_responder);
 ELSIF p_recipe='cs_group_tasks' THEN
  RETURN NOT EXISTS(SELECT 1 FROM private.cs_ia_reading_config c WHERE c.client_id=p_client AND c.owner_id=auth.uid() AND c.conversation_id=(p_config->>'conversation_id')::uuid AND c.enabled);
 ELSIF p_recipe='gestor_agenda' AND p_config->>'agenda_id' IS NOT NULL THEN
  RETURN NOT EXISTS(SELECT 1 FROM public.gestor_ia_agendas a WHERE a.id=(p_config->>'agenda_id')::uuid AND a.owner_id=auth.uid() AND a.client_id=p_client AND a.enabled);
 END IF;RETURN false;
END $$;

-- Definitions remain readable when their old native reference disappears. Outer app/client ACLs never fall back.
CREATE FUNCTION private.atlas_squad_automation_read_source(p_app text,p_client uuid,p_recipe text,p_config jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE answer jsonb;
BEGIN
 PERFORM private.atlas_squad_automation_scope(p_app,p_client);
 BEGIN answer:=private.atlas_squad_automation_source(p_app,p_client,p_recipe,p_config);
 EXCEPTION WHEN insufficient_privilege OR serialization_failure THEN
  PERFORM private.atlas_squad_automation_scope(p_app,p_client);
  RETURN jsonb_build_object('available',false,'ready',false,'effective',NULL,'reason','NATIVE_REFERENCE_UNAVAILABLE','can_pause_orphan',private.atlas_squad_automation_old_inactive(p_app,p_client,p_recipe,p_config));
 END;
 RETURN answer||jsonb_build_object('available',true);
END $$;

CREATE FUNCTION private.atlas_squad_automation_matches(p_recipe text,p_config jsonb,p_source jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE a jsonb;key text;rule text;
BEGIN
 IF p_recipe='crm_followup' THEN
  a:=p_source->'agent';RETURN a->>'nome'=p_config->>'name' AND a#>'{funil,crm_ia,stage_ids}'=p_config->'stage_ids' AND a#>'{funil,crm_ia,cadencia}'=p_config->'cadence'
   AND (NOT p_config ? 'windows' OR a#>'{funil,crm_ia,janelas}'=p_config->'windows') AND (NOT p_config ? 'instructions' OR a->>'instrucoes'=p_config->>'instructions');
 ELSIF p_recipe='crm_capture' THEN
  SELECT value INTO a FROM jsonb_array_elements(p_source#>'{entry,channels}') WHERE value->>'channel_id'=p_config->>'channel_id';
  RETURN a->>'pipeline_id'=p_config->>'pipeline_id' AND a->>'stage_id'=p_config->>'stage_id' AND a->>'mode'=p_config->>'mode'
   AND (p_config->>'mode'<>'phrase' OR a->>'phrase'=p_config->>'phrase') AND (NOT p_config ? 'tags' OR a->'tags'=p_config->'tags');
 ELSIF p_recipe='cs_group_tasks' THEN
  IF p_source#>>'{snapshot,reading,conversation_id}' IS DISTINCT FROM p_config->>'conversation_id'
   OR p_config ? 'include_audio' AND p_source#>'{snapshot,reading,include_audio}' IS DISTINCT FROM p_config->'include_audio'
   OR p_config ? 'transcribe_new_audio' AND p_source#>'{snapshot,reading,transcribe_new_audio}' IS DISTINCT FROM p_config->'transcribe_new_audio' THEN RETURN false;END IF;
  FOREACH key IN ARRAY ARRAY['moves','creation','context'] LOOP
   rule:=CASE key WHEN 'moves' THEN 'task_moves' WHEN 'creation' THEN 'task_creation' ELSE 'task_context' END;
   IF p_config ? key AND p_source#>ARRAY['snapshot',rule,'enabled'] IS DISTINCT FROM p_config->key THEN RETURN false;END IF;
  END LOOP;RETURN true;
 ELSIF p_recipe='gestor_agenda' THEN
  a:=p_source->'agenda';RETURN left(a->>'run_time',5)=p_config->>'run_time' AND a->'weekdays'=p_config->'weekdays' AND a->'categories'=p_config->'categories';
 END IF;RETURN false;
END $$;

-- The raw snapshot stays private: CAS includes all native fields, including opaque legacy metadata.
CREATE FUNCTION private.atlas_squad_automation_snapshot_raw(p_app text,p_client_id uuid DEFAULT NULL,p_id uuid DEFAULT NULL,p_recipe text DEFAULT NULL,p_config jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE actor uuid:=private.atlas_executor_user();saved planeje_private.atlas_squad_automations;source jsonb;rows jsonb:='[]';recipe text;configuration jsonb;version text;state text;
BEGIN
 PERFORM private.atlas_squad_automation_scope(p_app,p_client_id);
 IF p_id IS NULL AND p_recipe IS NULL THEN
  FOR saved IN SELECT * FROM planeje_private.atlas_squad_automations WHERE owner_id=actor AND client_id IS NOT DISTINCT FROM p_client_id AND app=p_app ORDER BY updated_at DESC,id LIMIT 50 LOOP
   source:=private.atlas_squad_automation_read_source(p_app,p_client_id,saved.recipe,saved.config);
   state:=CASE WHEN source->>'available'='false' THEN 'blocked' WHEN saved.state='active' AND source->>'ready'<>'true' THEN 'blocked' WHEN saved.native_version IS NOT NULL AND saved.native_version<>md5((source-'ready'-'runtime_ready'-'available')::text) THEN 'drifted' ELSE saved.state END;
   rows:=rows||jsonb_build_array(to_jsonb(saved)||jsonb_build_object('current_state',state,'source',source));
  END LOOP;
  RETURN jsonb_build_object('automations',rows,'limit',50);
 END IF;
 IF p_id IS NOT NULL THEN
  SELECT * INTO saved FROM planeje_private.atlas_squad_automations WHERE id=p_id AND owner_id=actor AND app=p_app AND client_id IS NOT DISTINCT FROM p_client_id;
  IF saved.id IS NULL THEN RAISE insufficient_privilege;END IF;
 END IF;
 recipe:=coalesce(p_recipe,saved.recipe);configuration:=CASE WHEN p_recipe IS NOT NULL THEN p_config ELSE saved.config END;
 IF saved.id IS NOT NULL AND saved.recipe<>recipe THEN RAISE invalid_parameter_value;END IF;
 source:=CASE WHEN saved.id IS NOT NULL THEN private.atlas_squad_automation_read_source(p_app,p_client_id,recipe,configuration) ELSE private.atlas_squad_automation_source(p_app,p_client_id,recipe,configuration)||jsonb_build_object('available',true) END;
 version:=md5(jsonb_build_array(to_jsonb(saved),source)::text);
 state:=CASE WHEN source->>'available'='false' THEN 'blocked' WHEN saved.state='active' AND source->>'ready'<>'true' THEN 'blocked' WHEN saved.native_version IS NOT NULL AND saved.native_version<>md5((source-'ready'-'runtime_ready'-'available')::text) THEN 'drifted' ELSE saved.state END;
 RETURN jsonb_build_object('automation',CASE WHEN saved.id IS NOT NULL THEN to_jsonb(saved)||jsonb_build_object('current_state',state) END,'source',source,'version',version);
END $$;
-- Explicit public projections never copy native configuration, credentials, or native RPC results.
CREATE FUNCTION private.atlas_squad_automation_dto(p_value jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN p_value IS NULL OR p_value='null'::jsonb THEN NULL ELSE private.atlas_executor_squad_pick(p_value,
  ARRAY['id','client_id','app','recipe','config','revision','state','current_state','created_at','updated_at']) END;
$$;
CREATE FUNCTION private.atlas_squad_automation_source_dto(p_value jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE result jsonb;reading jsonb;key text;
BEGIN
 result:=private.atlas_executor_squad_pick(p_value,ARRAY['available','ready','runtime_ready','effective','reason','can_pause_orphan','auto_send','provisioned']);
 IF jsonb_typeof(p_value->'agent')='object' THEN result:=result||jsonb_build_object('agent',private.atlas_executor_squad_pick(p_value->'agent',ARRAY['id','ativo','auto_responder','updated_at']));END IF;
 IF jsonb_typeof(p_value->'channel')='object' THEN result:=result||jsonb_build_object('channel',private.atlas_executor_squad_pick(p_value->'channel',ARRAY['id','can_send','is_active']));END IF;
 IF jsonb_typeof(p_value->'agenda')='object' THEN result:=result||jsonb_build_object('agenda',private.atlas_executor_squad_pick(p_value->'agenda',ARRAY['id','enabled','run_time','weekdays','categories','revision']));END IF;
 IF jsonb_typeof(p_value->'snapshot')='object' THEN
  reading:=jsonb_build_object('reading',private.atlas_executor_squad_pick(p_value#>'{snapshot,reading}',ARRAY['conversation_id','enabled','include_audio','transcribe_new_audio','can_configure','status']));
  FOREACH key IN ARRAY ARRAY['task_moves','task_creation','task_context'] LOOP
   reading:=reading||jsonb_build_object(key,private.atlas_executor_squad_pick(p_value#>ARRAY['snapshot',key],ARRAY['enabled','can_configure','can_revoke','global_paused']));
  END LOOP;
  result:=result||jsonb_build_object('snapshot',reading);
 END IF;
 RETURN result;
END $$;
CREATE FUNCTION public.atlas_squad_automation_snapshot(p_app text,p_client_id uuid DEFAULT NULL,p_id uuid DEFAULT NULL,p_recipe text DEFAULT NULL,p_config jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE raw jsonb;item jsonb;rows jsonb:='[]';
BEGIN
 raw:=private.atlas_squad_automation_snapshot_raw(p_app,p_client_id,p_id,p_recipe,p_config);
 IF raw ? 'automations' THEN
  FOR item IN SELECT value FROM jsonb_array_elements(raw->'automations') LOOP
   rows:=rows||jsonb_build_array(private.atlas_squad_automation_dto(item)||jsonb_build_object('source',private.atlas_squad_automation_source_dto(item->'source')));
  END LOOP;
  RETURN jsonb_build_object('automations',rows,'limit',50);
 END IF;
 -- The opaque version is computed before projection and still detects edits to undisclosed fields.
 RETURN jsonb_build_object('automation',private.atlas_squad_automation_dto(raw->'automation'),'source',private.atlas_squad_automation_source_dto(raw->'source'),'version',raw->'version');
END $$;
REVOKE ALL ON FUNCTION public.atlas_squad_automation_snapshot(text,uuid,uuid,text,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.atlas_squad_automation_snapshot(text,uuid,uuid,text,jsonb) TO authenticated;

CREATE FUNCTION private.atlas_squad_automation_apply(p_item public.atlas_execution_items) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE actor uuid:=private.atlas_executor_user();p jsonb:=p_item.payload;definition planeje_private.atlas_squad_automations;
 cfg jsonb:=p->'config';recipe text:=p->>'recipe';source jsonb;current_snapshot jsonb;after_source jsonb;answer jsonb;native jsonb;entry jsonb;channels jsonb:='[]';one_channel jsonb;found_channel boolean:=false;
 enabled boolean;target_id uuid:=nullif(p->>'id','')::uuid;expected integer:=nullif(p->>'revision','')::integer;key text;rule text;
BEGIN
 IF private.atlas_squad_item_scope(p_item) IS DISTINCT FROM true OR p_item.owner_id IS DISTINCT FROM actor OR p_item.kind<>'proposal'
  OR p_item.action NOT IN('save_automation','activate_automation','pause_automation')
  OR NOT EXISTS(SELECT 1 FROM planeje_private.atlas_squad_runs r WHERE r.run_id=p_item.run_id AND r.mode='automation') THEN RAISE insufficient_privilege;END IF;
 PERFORM private.atlas_executor_squad_fields(p,ARRAY['id','revision','recipe','config'],ARRAY['id','revision','recipe','config']);
 PERFORM private.atlas_squad_automation_scope(p_item.app,p_item.client_id);PERFORM private.atlas_squad_automation_config(p_item.app,recipe,cfg);
 IF recipe='squad_manual' AND p_item.action<>'save_automation' THEN RAISE invalid_parameter_value USING MESSAGE='Fluxo manual usa Executar agora, sem agenda ou ativação.';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||':'||coalesce(p_item.client_id::text,'agency')||':'||recipe,6111208));
 IF target_id IS NOT NULL THEN
  SELECT * INTO definition FROM planeje_private.atlas_squad_automations WHERE id=target_id AND owner_id=actor AND app=p_item.app AND client_id IS NOT DISTINCT FROM p_item.client_id FOR UPDATE;
  IF definition.id IS NULL THEN RAISE insufficient_privilege;END IF;
  IF definition.revision IS DISTINCT FROM expected OR definition.recipe<>recipe THEN RAISE serialization_failure;END IF;
 ELSE
  IF expected IS NOT NULL OR p_item.action<>'save_automation' THEN RAISE invalid_parameter_value;END IF;
 END IF;
 -- Locks precede the final authorization and source comparison, including native consent epochs.
 IF p_item.app='crm' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('crm-ia:'||p_item.client_id::text,0));
  PERFORM 1 FROM public.crm_ia_config WHERE cliente_id=p_item.client_id FOR UPDATE;
  IF recipe='crm_followup' THEN PERFORM 1 FROM public.cliente_atend_ia_agentes WHERE cliente_id=p_item.client_id AND (id=nullif(cfg->>'agent_id','')::uuid OR funil#>>'{crm_ia,pipeline_id}'=cfg->>'pipeline_id') FOR UPDATE;END IF;
 ELSIF p_item.app='cs' THEN
  LOCK TABLE private.cs_ia_reading_config IN SHARE ROW EXCLUSIVE MODE NOWAIT;
  PERFORM 1 FROM public.cs_ia_settings WHERE id=1 FOR SHARE;PERFORM 1 FROM public.cs_ia_analysis_settings WHERE id=1 FOR SHARE;
 ELSIF p_item.app='gestor' THEN
  LOCK TABLE public.gestor_ia_agendas IN SHARE ROW EXCLUSIVE MODE NOWAIT;
  PERFORM 1 FROM public.cliente_meta_accounts WHERE cliente_id=p_item.client_id AND is_active AND 'act_'||regexp_replace(meta_account_id::text,'^act_','')=cfg->>'account_id' FOR SHARE;
 END IF;
 PERFORM private.atlas_squad_automation_scope(p_item.app,p_item.client_id);
 IF private.atlas_squad_item_scope(p_item) IS DISTINCT FROM true THEN RAISE insufficient_privilege;END IF;
 current_snapshot:=private.atlas_squad_automation_snapshot_raw(p_item.app,p_item.client_id,target_id,recipe,cfg);
 IF p_item.before->>'version' IS DISTINCT FROM current_snapshot->>'version' THEN RAISE serialization_failure USING MESSAGE='A automação ou sua fonte nativa mudou. Reabra a revisão.';END IF;
 source:=current_snapshot->'source';
 IF source->>'available' IS DISTINCT FROM 'true' AND NOT (p_item.action='pause_automation' AND source->>'can_pause_orphan'='true') THEN RAISE invalid_parameter_value USING MESSAGE='A referência nativa está indisponível. Selecione uma fonte válida antes de revisar.';END IF;
 IF p_item.action='save_automation' THEN
  IF definition.recipe='crm_followup' AND definition.config->>'agent_id' IS NOT NULL AND cfg->>'agent_id' IS NULL THEN RAISE invalid_parameter_value USING MESSAGE='Preserve ou selecione explicitamente o agente nativo.';END IF;
  IF definition.state='active' THEN RAISE invalid_parameter_value USING MESSAGE='Pause a automação antes de editar sua definição.';END IF;
  IF target_id IS NULL THEN
   INSERT INTO planeje_private.atlas_squad_automations(owner_id,client_id,app,recipe,config) VALUES(actor,p_item.client_id,p_item.app,recipe,cfg) RETURNING * INTO definition;
  ELSE
   UPDATE planeje_private.atlas_squad_automations SET config=cfg,state='saved',revision=revision+1,native_version=NULL,native_receipt=NULL,updated_at=clock_timestamp() WHERE id=target_id RETURNING * INTO definition;
  END IF;
  RETURN jsonb_build_object('automation',private.atlas_squad_automation_dto(to_jsonb(definition)),'native_changed',false);
 END IF;
 IF cfg IS DISTINCT FROM definition.config THEN RAISE serialization_failure USING MESSAGE='A definição aprovada diverge da revisão salva.';END IF;
 IF p_item.action='pause_automation' AND definition.state<>'active' THEN RAISE invalid_parameter_value USING MESSAGE='Somente uma automação ativa pode ser pausada.';END IF;
 enabled:=p_item.action='activate_automation';
 IF NOT enabled AND source->>'available'='false' THEN
  IF NOT private.atlas_squad_automation_old_inactive(p_item.app,p_item.client_id,recipe,cfg) THEN RAISE serialization_failure;END IF;
  UPDATE planeje_private.atlas_squad_automations SET state='paused',revision=revision+1,native_version=md5((source-'ready'-'runtime_ready'-'available')::text),
   native_receipt=jsonb_build_object('action',p_item.action,'verified',true,'native_changed',false,'reason','EXACT_NATIVE_TARGET_INACTIVE'),updated_at=clock_timestamp() WHERE id=definition.id RETURNING * INTO definition;
  RETURN jsonb_build_object('automation',private.atlas_squad_automation_dto(to_jsonb(definition)),'native_changed',false,'verified',true,'proof',jsonb_build_object('reason','EXACT_NATIVE_TARGET_INACTIVE'));
 END IF;
 IF enabled AND source->>'ready' IS DISTINCT FROM 'true' THEN RAISE invalid_parameter_value USING MESSAGE='AUTOMATION_BLOCKED: pré-requisitos ou runtime nativo indisponíveis.';END IF;
 IF recipe='crm_followup' THEN
  native:=coalesce(source->'agent','{}');
  IF enabled THEN
   IF native->>'id' IS NULL THEN native:=jsonb_build_object('nome',cfg->>'name','objetivo','','instrucoes','','tom','cordial','modelo','openai/gpt-4o-mini','base_ids','[]'::jsonb,'setor_ids','[]'::jsonb,'funil','{}'::jsonb);END IF;
   native:=native||jsonb_build_object('nome',cfg->>'name','auto_responder',true,'ativo',true);
   IF cfg ? 'instructions' THEN native:=native||jsonb_build_object('instrucoes',cfg->>'instructions');END IF;
   entry:=coalesce(native#>'{funil,crm_ia}','{}')||jsonb_build_object('tipo','followup','pipeline_id',cfg->>'pipeline_id','stage_ids',cfg->'stage_ids','cadencia',cfg->'cadence');
   IF cfg ? 'windows' THEN entry:=entry||jsonb_build_object('janelas',cfg->'windows');END IF;
   native:=jsonb_set(native,'{funil}',coalesce(native->'funil','{}')||jsonb_build_object('crm_ia',entry));
  ELSE
   IF native->>'id' IS NULL THEN RAISE invalid_parameter_value USING MESSAGE='O agente vinculado está indisponível.';END IF;
   native:=native||jsonb_build_object('auto_responder',false);
  END IF;
  IF native ? 'updated_at' THEN native:=(native-'updated_at')||jsonb_build_object('expected_updated_at',native->'updated_at');END IF;
  answer:=public.crm_ia_workspace('save_agent',p_item.client_id,native);
  IF enabled THEN cfg:=cfg||jsonb_build_object('agent_id',answer->>'id');END IF;
 ELSIF recipe='crm_capture' THEN
  entry:=coalesce(source->'entry','{}');
  IF enabled AND entry->>'enabled' IS DISTINCT FROM 'true' AND EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(entry->'channels','[]')) c WHERE c->>'channel_id'<>cfg->>'channel_id' AND c->>'enabled'='true') THEN RAISE invalid_parameter_value USING MESSAGE='Revise os outros canais antes de habilitar a entrada global.';END IF;
  FOR one_channel IN SELECT value FROM jsonb_array_elements(coalesce(entry->'channels','[]')) LOOP
   IF one_channel->>'channel_id'=cfg->>'channel_id' THEN
    IF enabled THEN
     one_channel:=one_channel||jsonb_build_object('enabled',true,'mode',cfg->>'mode','pipeline_id',cfg->>'pipeline_id','stage_id',cfg->>'stage_id','phrase',coalesce(cfg->>'phrase',''));
     IF cfg ? 'tags' THEN one_channel:=one_channel||jsonb_build_object('tags',cfg->'tags');END IF;
    ELSE one_channel:=one_channel||jsonb_build_object('enabled',false);END IF;found_channel:=true;
   END IF;channels:=channels||jsonb_build_array(one_channel);
  END LOOP;
  IF NOT found_channel AND enabled THEN channels:=channels||jsonb_build_array(jsonb_build_object('channel_id',cfg->>'channel_id','enabled',enabled,'mode',cfg->>'mode','pipeline_id',cfg->>'pipeline_id','stage_id',cfg->>'stage_id','phrase',coalesce(cfg->>'phrase',''),'tags',coalesce(cfg->'tags','[]')));END IF;
  entry:=entry||jsonb_build_object('channels',channels,'enabled',CASE WHEN enabled THEN true ELSE coalesce((entry->>'enabled')::boolean,false) AND EXISTS(SELECT 1 FROM jsonb_array_elements(channels) c WHERE c->>'enabled'='true') END);
  IF enabled OR found_channel THEN answer:=public.crm_ia_workspace('save_config',p_item.client_id,jsonb_build_object('section','entry','data',entry,'revision',source->'config_revision'));ELSE answer:=jsonb_build_object('unchanged',true);END IF;
 ELSIF recipe='cs_group_tasks' THEN
  answer:=public.cs_ia_reading_settings(p_item.client_id,enabled,enabled AND coalesce((cfg->>'include_audio')::boolean,(source#>>'{snapshot,reading,include_audio}')::boolean,false),(cfg->>'conversation_id')::uuid,
   enabled AND coalesce((cfg->>'transcribe_new_audio')::boolean,(source#>>'{snapshot,reading,transcribe_new_audio}')::boolean,false));
  IF enabled THEN
   FOREACH key IN ARRAY ARRAY['moves','creation','context'] LOOP
    rule:=CASE key WHEN 'moves' THEN 'task_moves' WHEN 'creation' THEN 'task_creation' ELSE 'task_context' END;
    IF coalesce((cfg->>key)::boolean,false) OR source#>>ARRAY['snapshot',rule,'enabled']='true' THEN
     IF key='moves' THEN PERFORM public.cs_ia_task_move_options(p_item.client_id,(cfg->>'conversation_id')::uuid,coalesce((cfg->>key)::boolean,false));
     ELSIF key='creation' THEN PERFORM public.cs_ia_task_creation_options(p_item.client_id,(cfg->>'conversation_id')::uuid,coalesce((cfg->>key)::boolean,false));
     ELSE PERFORM public.cs_ia_task_context_options(p_item.client_id,(cfg->>'conversation_id')::uuid,coalesce((cfg->>key)::boolean,false));END IF;
    END IF;
   END LOOP;
  END IF;
 ELSE
  native:=CASE WHEN enabled THEN cfg ELSE source->'agenda' END;
  IF native IS NULL OR native='null'::jsonb THEN answer:=jsonb_build_object('unchanged',true);
  ELSE answer:=public.gestor_ia_configurar_agenda(p_item.client_id,cfg->>'account_id',enabled,(native->>'run_time')::time,
   ARRAY(SELECT value::integer FROM jsonb_array_elements_text(native->'weekdays')),ARRAY(SELECT value FROM jsonb_array_elements_text(native->'categories')),nullif(source#>>'{agenda,revision}','')::integer);END IF;
  IF enabled THEN cfg:=cfg||jsonb_build_object('agenda_id',answer->>'id');END IF;
 END IF;
 PERFORM private.atlas_squad_automation_scope(p_item.app,p_item.client_id);
 after_source:=private.atlas_squad_automation_source(p_item.app,p_item.client_id,recipe,cfg);
 IF enabled AND private.atlas_squad_automation_matches(recipe,cfg,after_source) IS DISTINCT FROM true THEN RAISE serialization_failure USING MESSAGE='A releitura diverge dos campos aprovados.';END IF;
 IF enabled AND (after_source->>'ready' IS DISTINCT FROM 'true' OR after_source->>'effective' IS DISTINCT FROM 'true') OR NOT enabled AND after_source->>'effective' IS DISTINCT FROM 'false' THEN RAISE serialization_failure USING MESSAGE='A releitura nativa não confirmou o estado solicitado.';END IF;
 UPDATE planeje_private.atlas_squad_automations SET config=cfg,state=CASE WHEN enabled THEN 'active' ELSE 'paused' END,revision=revision+1,
  native_version=md5((after_source-'ready'-'runtime_ready'-'available')::text),native_receipt=jsonb_build_object('action',p_item.action,'verified',true,'native_ref',private.atlas_executor_squad_pick(cfg,ARRAY['agent_id','channel_id','conversation_id','account_id','agenda_id'])),updated_at=clock_timestamp() WHERE id=definition.id RETURNING * INTO definition;
 RETURN jsonb_build_object('automation',private.atlas_squad_automation_dto(to_jsonb(definition)),'native_changed',(source-'ready'-'runtime_ready'-'available') IS DISTINCT FROM (after_source-'ready'-'runtime_ready'-'available'),'verified',true,'proof',jsonb_build_object('action',p_item.action,'state',definition.state,'native_ref',private.atlas_executor_squad_pick(cfg,ARRAY['agent_id','channel_id','conversation_id','account_id','agenda_id'])));
EXCEPTION WHEN lock_not_available THEN RAISE serialization_failure USING MESSAGE='A configuração nativa está em uso. Reabra a revisão.';
END $$;

REVOKE ALL ON FUNCTION private.atlas_squad_automation_config(text,text,jsonb),private.atlas_squad_automation_scope(text,uuid),private.atlas_squad_automation_source(text,uuid,text,jsonb),private.atlas_squad_automation_apply(public.atlas_execution_items),private.atlas_squad_automation_matches(text,jsonb,jsonb),private.atlas_squad_automation_read_source(text,uuid,text,jsonb),private.atlas_squad_automation_old_inactive(text,uuid,text,jsonb),private.atlas_squad_automation_snapshot_raw(text,uuid,uuid,text,jsonb),private.atlas_squad_automation_dto(jsonb),private.atlas_squad_automation_source_dto(jsonb) FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
