BEGIN;

ALTER TABLE public.atlas_runs ADD COLUMN source_session_id uuid
  DEFAULT nullif(auth.jwt()->>'session_id','')::uuid;
ALTER TABLE public.atlas_runs ADD COLUMN executor_objective text CHECK(length(executor_objective)<=11900);

CREATE TABLE public.atlas_execution_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id),
  conversation_id uuid NOT NULL REFERENCES public.atlas_conversations(id),
  run_id uuid NOT NULL REFERENCES public.atlas_runs(id),
  client_id uuid REFERENCES public.clientes(id),
  call_id text NOT NULL CHECK(length(call_id) BETWEEN 1 AND 160),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  kind text NOT NULL CHECK(kind IN('question','proposal')),
  app text NOT NULL CHECK(app IN('crm','cs','gestor','atlas')),
  action text,
  title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 160),
  description text,
  fields jsonb NOT NULL DEFAULT'[]' CHECK(jsonb_typeof(fields)='array'),
  payload jsonb NOT NULL DEFAULT'{}' CHECK(jsonb_typeof(payload)='object'),
  before jsonb,
  preview jsonb NOT NULL DEFAULT'{}' CHECK(jsonb_typeof(preview)='object'),
  effect jsonb NOT NULL DEFAULT'{}' CHECK(jsonb_typeof(effect)='object'),
  links jsonb NOT NULL DEFAULT'[]' CHECK(jsonb_typeof(links)='array'),
  state text NOT NULL CHECK(state IN('awaiting_input','proposed','completed','rejected','cancelled','conflict','failed','uncertain')),
  answers jsonb,
  result jsonb,
  error jsonb,
  decision text,
  decision_data jsonb,
  resume_request_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  specification jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_at timestamptz,
  UNIQUE(run_id,call_id)
);
CREATE INDEX atlas_execution_conversation ON public.atlas_execution_items(owner_id,conversation_id,created_at,id);
ALTER TABLE public.atlas_execution_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.atlas_execution_items FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.atlas_execution_items TO authenticated;

CREATE FUNCTION private.atlas_executor_user() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid();
BEGIN
  IF actor IS NULL OR auth.jwt()->>'role' IS DISTINCT FROM 'authenticated'
    OR auth.jwt()->>'planeje_server_delegate' IS NOT NULL
    OR NOT private.planeje_live_session() OR NOT public.planeje_current_account_access()
    OR NOT public.atlas_is_owner()
    OR NOT coalesce((SELECT p.is_enabled FROM public.user_module_permissions p WHERE p.user_id=actor AND p.module_name::text='assistant'),
      (SELECT m.is_enabled FROM public.module_settings m WHERE m.module_name::text='assistant'),true)
  THEN RAISE EXCEPTION 'A sessão atual não pode executar ações do Atlas.' USING ERRCODE='42501'; END IF;
  RETURN actor;
END $$;
REVOKE ALL ON FUNCTION private.atlas_executor_user() FROM PUBLIC,anon,authenticated,service_role;

-- Keep historical session IDs without an Auth FK: logout must not rewrite terminal runs.
CREATE FUNCTION private.atlas_executor_run_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.source_session_id IS DISTINCT FROM OLD.source_session_id
    OR OLD.executor_objective IS NOT NULL AND NEW.executor_objective IS DISTINCT FROM OLD.executor_objective THEN
    RAISE insufficient_privilege USING MESSAGE='A sessão de origem e o objetivo confirmado são imutáveis.';
  END IF;
  IF NEW.executor_objective IS DISTINCT FROM OLD.executor_objective THEN
    IF OLD.status<>'processing' OR OLD.request_message NOT LIKE '[Executor Planeje]%'
      OR private.atlas_executor_user() IS DISTINCT FROM OLD.owner_id
      OR OLD.source_session_id IS DISTINCT FROM nullif(auth.jwt()->>'session_id','')::uuid THEN
      RAISE insufficient_privilege USING MESSAGE='O objetivo pertence à execução e sessão originais.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.atlas_executor_run_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER atlas_executor_run_guard BEFORE UPDATE OF source_session_id,executor_objective ON public.atlas_runs
  FOR EACH ROW EXECUTE FUNCTION private.atlas_executor_run_guard();

CREATE FUNCTION private.atlas_executor_visible(p_app text,p_client uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM private.atlas_executor_user();
  IF p_app='crm' THEN RETURN p_client IS NOT NULL AND private.crm_ia_client(p_client); END IF;
  IF p_app='cs' THEN RETURN private.cs_ia_role() IS NOT NULL AND (p_client IS NULL OR private.cs_ia_client_exists(p_client)); END IF;
  IF p_app='gestor' THEN
    RETURN coalesce((SELECT p.is_enabled FROM public.user_module_permissions p WHERE p.user_id=auth.uid() AND p.module_name::text='paid_traffic'),
      (SELECT m.is_enabled FROM public.module_settings m WHERE m.module_name::text='paid_traffic'),true)
      AND (p_client IS NULL OR public.central_trafego_can_access_client(p_client)
        AND EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=p_client AND c.etapa='closed'));
  END IF;
  RETURN p_app='atlas' AND (p_client IS NULL OR private.crm_ia_client(p_client)
    OR public.central_trafego_can_access_client(p_client) AND EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=p_client AND c.etapa='closed'));
EXCEPTION WHEN insufficient_privilege THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION private.atlas_executor_visible(text,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION private.atlas_executor_visible(text,uuid) TO authenticated;

CREATE FUNCTION private.atlas_executor_item_visible(p_item public.atlas_execution_items) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE staff text;field text;spend boolean;default_value boolean;
BEGIN
  IF p_item.owner_id IS DISTINCT FROM auth.uid() OR NOT private.atlas_executor_visible(p_item.app,p_item.client_id) THEN RETURN false; END IF;
  IF p_item.app<>'gestor' THEN RETURN true; END IF;
  SELECT p.role::text INTO staff FROM public.profiles p WHERE p.id=auth.uid() AND p.status='active';
  IF staff='superadmin' THEN RETURN true; END IF;
  IF p_item.kind='proposal' AND p_item.action IN('save_goal','adjust_goal','save_report_model','set_client_report_model','configure_portal_metrics') AND staff<>'admin' THEN RETURN false; END IF;
  spend:=p_item.kind='proposal' AND (p_item.action<>'update_meta' OR p_item.payload ?| ARRAY['daily_budget','lifetime_budget']);
  FOREACH field IN ARRAY CASE WHEN spend THEN ARRAY['meta_resumo','valor'] ELSE ARRAY['meta_resumo'] END LOOP
    default_value:=NOT (field='valor' AND p_item.action IN('save_report_model','set_client_report_model','configure_portal_metrics'));
    IF NOT coalesce((SELECT u.can_view IS TRUE FROM public.user_client_field_permissions u WHERE u.user_id=auth.uid() AND u.field_name::text=field),
      (SELECT r.can_view IS TRUE FROM public.client_field_permissions r WHERE r.role::text=staff AND r.field_name::text=field),default_value) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION private.atlas_executor_item_visible(public.atlas_execution_items) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION private.atlas_executor_item_visible(public.atlas_execution_items) TO authenticated;
CREATE POLICY atlas_execution_owner_read ON public.atlas_execution_items FOR SELECT TO authenticated
  USING(owner_id=(SELECT auth.uid()) AND private.atlas_executor_item_visible(atlas_execution_items));

CREATE FUNCTION private.atlas_executor_action(p_app text,p_action text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE p_app
    WHEN 'crm' THEN p_action=ANY(ARRAY['save_pipeline','save_stage','reorder_stages','save_base','save_product','save_config','save_agent','save_lead','move_lead','save_appointment','cancel_appointment','save_conversation','send_message'])
    WHEN 'cs' THEN p_action=ANY(ARRAY['set_health','save_settings','save_task_controls','save_analysis_settings','set_channel_following','set_group_binding','configure_reading','configure_task_moves','configure_task_creation','configure_task_context','save_team_label','save_team_person'])
    WHEN 'gestor' THEN p_action=ANY(ARRAY['save_goal','adjust_goal','configure_agenda','save_report_model','set_client_report_model','update_decision','configure_portal_metrics','update_meta','create_meta_campaign'])
    WHEN 'atlas' THEN p_action=ANY(ARRAY['save_memory','revoke_memory'])
    ELSE false END;
$$;
REVOKE ALL ON FUNCTION private.atlas_executor_action(text,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.atlas_executor_store(p_run uuid,p_call_id text,p_item jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=private.atlas_executor_user();r public.atlas_runs;c public.atlas_conversations;
  item public.atlas_execution_items;f jsonb;seen text[]:='{}';
BEGIN
  IF p_item IS NULL OR jsonb_typeof(p_item)<>'object' OR length(p_item::text)>150000
    OR p_call_id IS NULL OR length(p_call_id) NOT BETWEEN 1 AND 160
    OR p_item->>'kind' NOT IN('question','proposal') OR p_item->>'app' NOT IN('crm','cs','gestor','atlas')
    OR coalesce(length(btrim(p_item->>'title')),0) NOT BETWEEN 1 AND 160
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_item) k WHERE k NOT IN('kind','app','action','title','description','fields','payload','before','preview','effect','links','client_id','operation'))
  THEN RAISE EXCEPTION 'Proposta ou pergunta inválida.' USING ERRCODE='22023'; END IF;
  SELECT * INTO r FROM public.atlas_runs WHERE id=p_run AND owner_id=actor FOR UPDATE;
  SELECT * INTO c FROM public.atlas_conversations WHERE id=r.conversation_id AND owner_id=actor FOR UPDATE;
  IF r.id IS NULL OR c.id IS NULL OR r.status<>'processing' OR r.request_message NOT LIKE '[Executor Planeje]%'
    OR r.source_session_id IS NULL OR r.source_session_id IS DISTINCT FROM nullif(auth.jwt()->>'session_id','')::uuid
    OR c.client_id IS DISTINCT FROM r.request_client_id
    OR p_item ? 'client_id' AND nullif(p_item->>'client_id','')::uuid IS DISTINCT FROM c.client_id
    OR NOT private.atlas_executor_visible(p_item->>'app',c.client_id)
  THEN RAISE EXCEPTION 'A execução não pertence à conversa, cliente e sessão atuais.' USING ERRCODE='42501'; END IF;
  IF p_item->>'kind'='proposal' AND (NOT coalesce(private.atlas_executor_action(p_item->>'app',p_item->>'action'),false)
    OR jsonb_typeof(p_item->'payload') IS DISTINCT FROM 'object'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_item->'payload') k WHERE k IN('client_id','cliente_id','clientId','target_client_id'))
    OR p_item->'payload' ? 'p_client_id' AND (p_item->>'app' NOT IN('cs','gestor')
      OR nullif(p_item->'payload'->>'p_client_id','')::uuid IS DISTINCT FROM c.client_id))
  THEN RAISE EXCEPTION 'Ação não permitida no executor.' USING ERRCODE='22023'; END IF;
  IF p_item->>'kind'='question' THEN
    IF jsonb_typeof(p_item->'fields') IS DISTINCT FROM 'array' OR jsonb_array_length(p_item->'fields') NOT BETWEEN 1 AND 12 THEN
      RAISE EXCEPTION 'Campos de pergunta inválidos.' USING ERRCODE='22023'; END IF;
    FOR f IN SELECT * FROM jsonb_array_elements(p_item->'fields') LOOP
      IF jsonb_typeof(f)<>'object' OR coalesce(f->>'id','') !~ '^[a-z][a-z0-9_]{0,63}$'
        OR f->>'id'=ANY(seen) OR f->>'id' IN('constructor','prototype')
        OR coalesce(length(btrim(f->>'label')),0) NOT BETWEEN 1 AND 240
        OR coalesce(f->>'type','') NOT IN('text','textarea','number','date','time','select','multiselect','boolean')
        OR f ? 'required' AND jsonb_typeof(f->'required')<>'boolean'
      THEN RAISE EXCEPTION 'Campo de pergunta inválido.' USING ERRCODE='22023'; END IF;
      seen:=array_append(seen,f->>'id');
      IF f->>'type' IN('select','multiselect') AND (jsonb_typeof(f->'options') IS DISTINCT FROM 'array' OR jsonb_array_length(f->'options') NOT BETWEEN 1 AND 100) THEN
        RAISE EXCEPTION 'Opções de pergunta inválidas.' USING ERRCODE='22023'; END IF;
    END LOOP;
  END IF;
  SELECT * INTO item FROM public.atlas_execution_items WHERE run_id=r.id AND call_id=p_call_id;
  IF item.id IS NOT NULL THEN
    IF NOT private.atlas_executor_item_visible(item) THEN RAISE insufficient_privilege; END IF;
    IF item.specification IS DISTINCT FROM p_item THEN RAISE EXCEPTION 'A chamada já possui outra proposta.' USING ERRCODE='40001'; END IF;
    RETURN to_jsonb(item)-'specification'-'decision_data';
  END IF;
  IF (SELECT count(*) FROM public.atlas_execution_items WHERE conversation_id=c.id AND state IN('proposed','awaiting_input','executing','uncertain'))>=20 THEN
    RAISE EXCEPTION 'Responda ou recuse os itens pendentes antes de abrir outra proposta.' USING ERRCODE='55000';
  END IF;
  INSERT INTO public.atlas_execution_items(owner_id,conversation_id,run_id,client_id,call_id,kind,app,action,title,description,fields,payload,before,preview,effect,links,state,specification)
    VALUES(actor,c.id,r.id,c.client_id,p_call_id,p_item->>'kind',p_item->>'app',p_item->>'action',btrim(p_item->>'title'),p_item->>'description',
      coalesce(p_item->'fields','[]'),coalesce(p_item->'payload','{}'),p_item->'before',coalesce(p_item->'preview','{}'),coalesce(p_item->'effect','{}'),coalesce(p_item->'links','[]'),
      CASE WHEN p_item->>'kind'='question' THEN 'awaiting_input' ELSE 'proposed' END,p_item) RETURNING * INTO item;
  IF NOT private.atlas_executor_item_visible(item) THEN RAISE insufficient_privilege USING MESSAGE='Os campos desta proposta não estão disponíveis no acesso atual.'; END IF;
  RETURN to_jsonb(item)-'specification'-'decision_data';
END $$;
REVOKE ALL ON FUNCTION public.atlas_executor_store(uuid,text,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.atlas_executor_store(uuid,text,jsonb) TO authenticated;

CREATE FUNCTION private.atlas_executor_answers(p_fields jsonb,p_answers jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE f jsonb;v jsonb;key text;choice jsonb;
BEGIN
  IF jsonb_typeof(p_answers) IS DISTINCT FROM 'object' OR length(p_answers::text)>100000 THEN
    RAISE EXCEPTION 'Respostas inválidas.' USING ERRCODE='22023'; END IF;
  FOR key IN SELECT * FROM jsonb_object_keys(p_answers) LOOP
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_fields) field WHERE field->>'id'=key) THEN
      RAISE EXCEPTION 'Resposta contém outro campo.' USING ERRCODE='22023'; END IF;
  END LOOP;
  FOR f IN SELECT * FROM jsonb_array_elements(p_fields) LOOP
    v:=p_answers->(f->>'id');
    IF v IS NULL OR v='null' OR v='""' OR v='[]' THEN
      IF coalesce((f->>'required')::boolean,true) THEN RAISE EXCEPTION 'Responda o campo obrigatório.' USING ERRCODE='22023'; END IF;
      CONTINUE;
    END IF;
    CASE f->>'type'
      WHEN 'text','textarea' THEN
        IF jsonb_typeof(v)<>'string' OR length(btrim(v#>>'{}')) NOT BETWEEN 1 AND coalesce((f->>'maxLength')::integer,CASE WHEN f->>'type'='textarea' THEN 6000 ELSE 2000 END) THEN
          RAISE EXCEPTION 'Resposta de texto inválida.' USING ERRCODE='22023'; END IF;
      WHEN 'boolean' THEN IF jsonb_typeof(v)<>'boolean' THEN RAISE EXCEPTION 'Resposta booleana inválida.' USING ERRCODE='22023'; END IF;
      WHEN 'number' THEN
        IF jsonb_typeof(v)<>'number' OR f ? 'min' AND (v#>>'{}')::numeric<(f->>'min')::numeric OR f ? 'max' AND (v#>>'{}')::numeric>(f->>'max')::numeric THEN
          RAISE EXCEPTION 'Resposta numérica inválida.' USING ERRCODE='22023'; END IF;
      WHEN 'select' THEN
        IF jsonb_typeof(v)<>'string' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(f->'options') o WHERE o->'value'=v) THEN
          RAISE EXCEPTION 'Opção inválida.' USING ERRCODE='22023'; END IF;
      WHEN 'multiselect' THEN
        IF jsonb_typeof(v)<>'array' THEN RAISE EXCEPTION 'Opções inválidas.' USING ERRCODE='22023'; END IF;
        IF (SELECT count(*)<>count(DISTINCT value) FROM jsonb_array_elements(v)) THEN RAISE EXCEPTION 'Opção repetida.' USING ERRCODE='22023'; END IF;
        FOR choice IN SELECT * FROM jsonb_array_elements(v) LOOP
          IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(f->'options') o WHERE o->'value'=choice) THEN RAISE EXCEPTION 'Opção inválida.' USING ERRCODE='22023'; END IF;
        END LOOP;
      WHEN 'date' THEN
        BEGIN
          IF jsonb_typeof(v)<>'string' OR (v#>>'{}') !~ '^\d{4}-\d{2}-\d{2}$' OR to_char((v#>>'{}')::date,'YYYY-MM-DD')<>(v#>>'{}') THEN
            RAISE EXCEPTION 'Data inválida.' USING ERRCODE='22023'; END IF;
        EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
          RAISE EXCEPTION 'Data inválida.' USING ERRCODE='22023';
        END;
      WHEN 'time' THEN
        IF jsonb_typeof(v)<>'string' OR (v#>>'{}') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RAISE EXCEPTION 'Horário inválido.' USING ERRCODE='22023'; END IF;
      ELSE RAISE EXCEPTION 'Tipo de pergunta inválido.' USING ERRCODE='22023';
    END CASE;
  END LOOP;
  RETURN p_answers;
END $$;
REVOKE ALL ON FUNCTION private.atlas_executor_answers(jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.atlas_executor_memory_snapshot(p_client_id uuid,p_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=private.atlas_executor_user();records jsonb;total bigint;
BEGIN
  IF NOT private.atlas_executor_visible('atlas',p_client_id) THEN RAISE insufficient_privilege; END IF;
  SELECT count(*) INTO total FROM public.atlas_memories m WHERE m.owner_id=actor AND m.client_id IS NOT DISTINCT FROM p_client_id
    AND CASE WHEN p_id IS NULL THEN m.state='active' ELSE m.id=p_id END;
  SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO records FROM (
    SELECT m.id,m.client_id,m.content,m.state,m.version,m.source,m.replaces_id,m.created_at
    FROM public.atlas_memories m WHERE m.owner_id=actor AND m.client_id IS NOT DISTINCT FROM p_client_id
      AND CASE WHEN p_id IS NULL THEN m.state='active' ELSE m.id=p_id END
    ORDER BY m.created_at DESC,m.id LIMIT 40
  ) x;
  RETURN jsonb_build_object('rows',records,'total',total);
END $$;
REVOKE ALL ON FUNCTION public.atlas_executor_memory_snapshot(uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.atlas_executor_memory_snapshot(uuid,uuid) TO authenticated;

CREATE FUNCTION private.atlas_executor_memory(p_item public.atlas_execution_items) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE actor uuid:=private.atlas_executor_user();p jsonb:=p_item.payload;previous public.atlas_memories;saved jsonb;memory_id uuid;
BEGIN
  IF p_item.owner_id IS DISTINCT FROM actor OR p_item.app<>'atlas' OR p_item.kind<>'proposal'
    OR NOT private.atlas_executor_visible('atlas',p_item.client_id)
    OR p_item.action NOT IN('save_memory','revoke_memory') THEN RAISE insufficient_privilege; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p) k WHERE k<>ALL(CASE WHEN p_item.action='save_memory'
      THEN ARRAY['content','replaces_id','expected_version'] ELSE ARRAY['id','expected_version'] END)) THEN
    RAISE invalid_parameter_value USING MESSAGE='Campos de conhecimento inválidos.'; END IF;
  memory_id:=nullif(p->>CASE WHEN p_item.action='save_memory' THEN 'replaces_id' ELSE 'id' END,'')::uuid;
  IF memory_id IS NOT NULL THEN
    SELECT * INTO previous FROM public.atlas_memories WHERE id=memory_id AND owner_id=actor FOR UPDATE;
    IF previous.id IS NULL OR previous.client_id IS DISTINCT FROM p_item.client_id THEN RAISE insufficient_privilege; END IF;
    IF previous.state<>'active' OR previous.version IS DISTINCT FROM (p->>'expected_version')::integer THEN
      RAISE serialization_failure USING MESSAGE='A memória mudou; prepare outra revisão.'; END IF;
  ELSIF p_item.action='revoke_memory' OR p->>'expected_version' IS NOT NULL THEN
    RAISE invalid_parameter_value USING MESSAGE='Selecione uma memória ativa.';
  END IF;
  IF p_item.action='save_memory' THEN
    saved:=public.atlas_save_memory(p->>'content',p_item.client_id,true,memory_id);
    RETURN jsonb_build_object('memory_id',saved->'id','version',saved->'version','summary','Conhecimento salvo na Memória Atlas.');
  END IF;
  UPDATE public.atlas_memories SET state='revoked',revoked_at=clock_timestamp() WHERE id=memory_id;
  RETURN jsonb_build_object('memory_id',memory_id,'version',previous.version,'summary','Conhecimento retirado; histórico preservado.');
END $$;
REVOKE ALL ON FUNCTION private.atlas_executor_memory(public.atlas_execution_items) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.atlas_executor_dispatch(p_item public.atlas_execution_items) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF p_item.app='atlas' THEN RETURN private.atlas_executor_memory(p_item); END IF;
  IF p_item.app='crm' AND p_item.action='send_message' THEN RETURN private.atlas_executor_crm_delivery(p_item); END IF;
  IF p_item.app='crm' AND private.atlas_executor_action('crm',p_item.action) THEN
    RETURN public.crm_ia_workspace(p_item.action,p_item.client_id,p_item.payload);
  END IF;
  RAISE EXCEPTION 'Esta ação ainda não possui executor publicado.' USING ERRCODE='0A000';
END $$;
REVOKE ALL ON FUNCTION private.atlas_executor_dispatch(public.atlas_execution_items) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.atlas_executor_decide(p_id uuid,p_revision integer,p_decision text,p_answers jsonb DEFAULT'{}',p_text text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=private.atlas_executor_user();item public.atlas_execution_items;applied jsonb;
  submitted_decision jsonb:=jsonb_build_object('answers',coalesce(p_answers,'{}'),'text',p_text);next_state text;detail jsonb;
BEGIN
  SELECT * INTO item FROM public.atlas_execution_items WHERE id=p_id AND owner_id=actor FOR UPDATE;
  IF item.id IS NULL OR NOT private.atlas_executor_item_visible(item) THEN
    RAISE EXCEPTION 'A decisão não está disponível no escopo atual.' USING ERRCODE='42501'; END IF;
  IF p_decision IS NULL OR p_decision NOT IN('approve','reject','cancel','answer','text') THEN RAISE EXCEPTION 'Decisão inválida.' USING ERRCODE='22023'; END IF;
  IF item.state NOT IN('proposed','awaiting_input') THEN
    IF item.decision=p_decision AND item.decision_data=submitted_decision THEN RETURN to_jsonb(item)-'specification'-'decision_data'; END IF;
    RAISE EXCEPTION 'O item já recebeu outra decisão.' USING ERRCODE='40001';
  END IF;
  IF p_revision IS NULL OR item.revision<>p_revision THEN RAISE EXCEPTION 'A revisão do item mudou.' USING ERRCODE='40001'; END IF;
  IF p_decision='cancel' THEN next_state:='cancelled';
  ELSIF item.kind='question' THEN
    IF p_decision='answer' THEN applied:=private.atlas_executor_answers(item.fields,coalesce(p_answers,'{}'));
    ELSIF p_decision='text' AND p_text IS NOT NULL AND length(btrim(p_text)) BETWEEN 1 AND 12000 THEN applied:=jsonb_build_object('text',btrim(p_text));
    ELSE RAISE EXCEPTION 'Responda a pergunta antes de continuar.' USING ERRCODE='22023'; END IF;
    next_state:='completed';
  ELSIF p_decision='reject' THEN next_state:='rejected';
  ELSIF p_decision='approve' THEN
    BEGIN
      applied:=private.atlas_executor_dispatch(item);
      next_state:='completed';
    EXCEPTION
      WHEN serialization_failure THEN next_state:='conflict';detail:=jsonb_build_object('code','40001','message','O registro mudou. Consulte os valores atuais e prepare uma nova revisão.');
      WHEN insufficient_privilege THEN RAISE;
      WHEN OTHERS THEN next_state:='failed';detail:=jsonb_build_object('code',SQLSTATE,'message','A operação não foi confirmada. Nenhuma gravação desta aprovação foi mantida.');
    END;
  ELSE RAISE EXCEPTION 'Esta decisão não corresponde ao item.' USING ERRCODE='22023'; END IF;
  UPDATE public.atlas_execution_items SET state=next_state,decision=p_decision,decision_data=submitted_decision,
    answers=CASE WHEN kind='question' THEN applied ELSE NULL END,result=CASE WHEN kind='proposal' THEN applied ELSE NULL END,
    error=detail,revision=revision+1,decided_at=clock_timestamp(),updated_at=clock_timestamp()
    WHERE id=item.id RETURNING * INTO item;
  RETURN to_jsonb(item)-'specification'-'decision_data';
END $$;
REVOKE ALL ON FUNCTION public.atlas_executor_decide(uuid,integer,text,jsonb,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.atlas_executor_decide(uuid,integer,text,jsonb,text) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
