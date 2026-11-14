BEGIN;

CREATE TABLE planeje_private.atlas_squad_conversations (
  conversation_id uuid PRIMARY KEY REFERENCES public.atlas_conversations(id),
  owner_id uuid NOT NULL REFERENCES public.profiles(id),
  client_id uuid REFERENCES public.clientes(id),
  mode text NOT NULL CHECK(mode IN('chat','automation')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(conversation_id,owner_id)
);
CREATE INDEX atlas_squad_conversations_owner ON planeje_private.atlas_squad_conversations(owner_id,client_id,created_at DESC,conversation_id);
CREATE TABLE planeje_private.atlas_squad_runs (
  run_id uuid PRIMARY KEY REFERENCES public.atlas_runs(id),
  conversation_id uuid NOT NULL REFERENCES planeje_private.atlas_squad_conversations(conversation_id),
  owner_id uuid NOT NULL REFERENCES public.profiles(id),
  request_id uuid NOT NULL,
  client_id uuid REFERENCES public.clientes(id),
  source_session_id uuid NOT NULL,
  mode text NOT NULL CHECK(mode IN('chat','automation')),
  attachment_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(owner_id,request_id),
  CHECK(cardinality(attachment_ids)<=4 AND array_position(attachment_ids,NULL) IS NULL)
);
CREATE INDEX atlas_squad_runs_conversation ON planeje_private.atlas_squad_runs(conversation_id,created_at DESC,run_id);
CREATE TABLE planeje_private.atlas_squad_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id),
  client_id uuid REFERENCES public.clientes(id),
  content text NOT NULL CHECK(length(btrim(content)) BETWEEN 1 AND 4000),
  version integer NOT NULL CHECK(version>0),
  state text NOT NULL DEFAULT 'active' CHECK(state IN('active','replaced','revoked')),
  replaces_id uuid REFERENCES planeje_private.atlas_squad_knowledge(id),
  source jsonb NOT NULL CHECK(jsonb_typeof(source)='object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at timestamptz
);
CREATE INDEX atlas_squad_knowledge_scope ON planeje_private.atlas_squad_knowledge(owner_id,client_id,created_at DESC,id) WHERE state='active';
CREATE TABLE planeje_private.atlas_squad_preferences (
  owner_id uuid PRIMARY KEY REFERENCES public.profiles(id),
  preferences jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(preferences)='object')
);
ALTER TABLE planeje_private.atlas_squad_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE planeje_private.atlas_squad_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE planeje_private.atlas_squad_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE planeje_private.atlas_squad_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON planeje_private.atlas_squad_conversations,planeje_private.atlas_squad_runs,
  planeje_private.atlas_squad_knowledge,planeje_private.atlas_squad_preferences FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.atlas_squad_client_access(p_client uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM private.atlas_executor_user();
  IF p_client IS NULL THEN RETURN true; END IF;
  IF private.atlas_executor_visible('crm',p_client) THEN RETURN true; END IF;
  IF to_regprocedure('private.cs_ia_role()') IS NOT NULL AND private.atlas_executor_visible('cs',p_client) THEN RETURN true; END IF;
  RETURN to_regprocedure('public.central_trafego_can_access_client(uuid)') IS NOT NULL
    AND private.atlas_executor_visible('gestor',p_client);
EXCEPTION WHEN insufficient_privilege THEN RETURN false;
END $$;

CREATE FUNCTION private.atlas_squad_immutable_map() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD THEN RAISE insufficient_privilege USING MESSAGE='O domínio, marca e identidade do contexto Squad são imutáveis.'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER atlas_squad_conversation_immutable BEFORE UPDATE ON planeje_private.atlas_squad_conversations
  FOR EACH ROW EXECUTE FUNCTION private.atlas_squad_immutable_map();
CREATE TRIGGER atlas_squad_run_immutable BEFORE UPDATE ON planeje_private.atlas_squad_runs
  FOR EACH ROW EXECUTE FUNCTION private.atlas_squad_immutable_map();

CREATE FUNCTION public.atlas_squad_conversation(p_conversation_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=private.atlas_executor_user();m planeje_private.atlas_squad_conversations;c public.atlas_conversations;
BEGIN
  SELECT * INTO m FROM planeje_private.atlas_squad_conversations WHERE conversation_id=p_conversation_id AND owner_id=actor;
  SELECT * INTO c FROM public.atlas_conversations WHERE id=p_conversation_id AND owner_id=actor;
  IF m.conversation_id IS NULL OR c.id IS NULL OR c.client_id IS DISTINCT FROM m.client_id OR NOT private.atlas_squad_client_access(m.client_id) THEN RAISE insufficient_privilege; END IF;
  RETURN to_jsonb(c)||jsonb_build_object('domain','squad','mode',m.mode);
END $$;

CREATE FUNCTION public.atlas_squad_claim_run(p_request_id uuid,p_conversation_id uuid,p_client_id uuid,p_message text,p_mode text DEFAULT 'chat',p_attachment_ids uuid[] DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=private.atlas_executor_user();claimed jsonb;r public.atlas_runs;m planeje_private.atlas_squad_conversations;known planeje_private.atlas_squad_runs;
BEGIN
  IF p_request_id IS NULL OR p_message IS NULL OR length(btrim(p_message)) NOT BETWEEN 1 AND 12000
    OR left(p_message,length(E'[Executor Planeje]\n')) IS DISTINCT FROM E'[Executor Planeje]\n'
    OR p_mode IS NULL OR p_mode NOT IN('chat','automation') OR p_attachment_ids IS NULL
    OR cardinality(p_attachment_ids)>4 OR array_position(p_attachment_ids,NULL) IS NOT NULL
    OR (SELECT count(*)<>count(DISTINCT value) FROM unnest(p_attachment_ids) value)
  THEN RAISE invalid_parameter_value USING MESSAGE='Identidade Squad inválida.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||':'||p_request_id::text,6111206));
  PERFORM private.atlas_executor_user();
  IF NOT private.atlas_squad_client_access(p_client_id) THEN RAISE insufficient_privilege; END IF;
  SELECT * INTO known FROM planeje_private.atlas_squad_runs WHERE owner_id=actor AND request_id=p_request_id FOR UPDATE;
  IF known.run_id IS NOT NULL AND (known.mode<>p_mode OR known.client_id IS DISTINCT FROM p_client_id OR known.attachment_ids IS DISTINCT FROM p_attachment_ids) THEN
    RAISE serialization_failure USING MESSAGE='ATLAS_REQUEST_CONFLICT'; END IF;
  IF p_conversation_id IS NOT NULL THEN
    PERFORM public.atlas_squad_conversation(p_conversation_id);
    SELECT * INTO m FROM planeje_private.atlas_squad_conversations WHERE conversation_id=p_conversation_id AND owner_id=actor FOR UPDATE;
    IF m.client_id IS DISTINCT FROM p_client_id OR m.mode<>p_mode THEN RAISE serialization_failure USING MESSAGE='ATLAS_SCOPE_CONFLICT'; END IF;
  END IF;
  claimed:=private.atlas_claim_run_pre_squad(p_request_id,p_conversation_id,p_client_id,p_message);
  SELECT * INTO r FROM public.atlas_runs WHERE id=(claimed#>>'{run,id}')::uuid AND owner_id=actor FOR UPDATE;
  IF r.id IS NULL OR r.source_session_id IS NULL OR r.request_client_id IS DISTINCT FROM p_client_id THEN RAISE insufficient_privilege; END IF;
  IF known.run_id IS NULL AND (claimed->>'claimed')::boolean IS DISTINCT FROM true THEN RAISE insufficient_privilege USING MESSAGE='A execução pertence ao domínio Office.'; END IF;
  IF known.run_id IS NULL THEN
    IF r.source_session_id IS DISTINCT FROM nullif(auth.jwt()->>'session_id','')::uuid THEN RAISE insufficient_privilege; END IF;
    IF p_conversation_id IS NULL THEN
      INSERT INTO planeje_private.atlas_squad_conversations(conversation_id,owner_id,client_id,mode) VALUES(r.conversation_id,actor,p_client_id,p_mode);
    END IF;
    INSERT INTO planeje_private.atlas_squad_runs(run_id,conversation_id,owner_id,request_id,client_id,source_session_id,mode,attachment_ids)
      VALUES(r.id,r.conversation_id,actor,p_request_id,p_client_id,r.source_session_id,p_mode,p_attachment_ids);
  ELSIF known.run_id<>r.id OR known.conversation_id<>r.conversation_id OR known.source_session_id IS DISTINCT FROM r.source_session_id THEN RAISE insufficient_privilege;
  END IF;
  IF cardinality(p_attachment_ids)>0 THEN
    PERFORM private.atlas_squad_bind_attachments(r.id,p_request_id,r.conversation_id,p_client_id,p_attachment_ids);
  END IF;
  RETURN claimed||jsonb_build_object('conversation',public.atlas_squad_conversation(r.conversation_id));
END $$;

CREATE FUNCTION private.atlas_squad_item_domain(p_item public.atlas_execution_items) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  RETURN p_item.owner_id=private.atlas_executor_user() AND private.atlas_squad_client_access(p_item.client_id) AND EXISTS(
    SELECT 1 FROM planeje_private.atlas_squad_runs s JOIN planeje_private.atlas_squad_conversations c ON c.conversation_id=s.conversation_id
    JOIN public.atlas_runs r ON r.id=s.run_id
    WHERE s.run_id=p_item.run_id AND s.conversation_id=p_item.conversation_id AND c.owner_id=p_item.owner_id AND s.owner_id=p_item.owner_id
      AND s.client_id IS NOT DISTINCT FROM p_item.client_id AND c.client_id IS NOT DISTINCT FROM p_item.client_id
      AND r.owner_id=p_item.owner_id AND r.conversation_id=p_item.conversation_id AND r.request_client_id IS NOT DISTINCT FROM p_item.client_id
      AND s.source_session_id=r.source_session_id AND s.mode=c.mode
  );
END $$;
CREATE FUNCTION private.atlas_squad_item_scope(p_item public.atlas_execution_items) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT private.atlas_squad_item_domain(p_item) AND EXISTS(SELECT 1 FROM public.atlas_runs r WHERE r.id=p_item.run_id
    AND r.source_session_id=nullif(auth.jwt()->>'session_id','')::uuid);
$$;
-- Presentation-only projection. Stored payloads, receipts and native records remain immutable inputs to execution/CAS.
CREATE FUNCTION private.atlas_squad_public_json(p_value jsonb,p_depth integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE answer jsonb;
BEGIN
  IF p_value IS NULL THEN RETURN NULL;END IF;
  IF p_depth>12 THEN RETURN to_jsonb('[conteúdo limitado]'::text);END IF;
  IF jsonb_typeof(p_value)='object' THEN
    SELECT coalesce(jsonb_object_agg(e.key,private.atlas_squad_public_json(e.value,p_depth+1)),'{}') INTO answer
      FROM jsonb_each(p_value) e WHERE e.key !~* '^(.*(secret|password|senha|authorization|(access|api)[_-]?key|service[_-]?role).*|.*token|raw_payload|__proto__|constructor|prototype)$';
    RETURN answer;
  ELSIF jsonb_typeof(p_value)='array' THEN
    SELECT coalesce(jsonb_agg(private.atlas_squad_public_json(e.value,p_depth+1) ORDER BY e.position),'[]') INTO answer
      FROM jsonb_array_elements(p_value) WITH ORDINALITY e(value,position);
    RETURN answer;
  ELSIF jsonb_typeof(p_value)='string' THEN
    RETURN to_jsonb(regexp_replace(p_value#>>'{}','(\m(sk-[a-z0-9_-]{12,}|eyJ[a-z0-9_.-]{30,}|Bearer[[:space:]]+[^[:space:]]+)|\m(senha|password|api.?key|token)[[:space:]]*[:=][[:space:]]*[^[:space:]]+)','[segredo removido]','gi'));
  END IF;
  RETURN p_value;
END $$;
REVOKE ALL ON FUNCTION private.atlas_squad_public_json(jsonb,integer) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.atlas_squad_item(p_id uuid,p_write boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=private.atlas_executor_user();item public.atlas_execution_items;
BEGIN
  SELECT * INTO item FROM public.atlas_execution_items WHERE id=p_id AND owner_id=actor;
  IF item.id IS NULL OR NOT private.atlas_squad_item_domain(item) OR NOT private.atlas_executor_item_visible(item)
    OR p_write IS DISTINCT FROM false AND NOT private.atlas_squad_item_scope(item) THEN RAISE insufficient_privilege; END IF;
  RETURN private.atlas_squad_public_json(to_jsonb(item)-'specification'-'decision_data');
END $$;
CREATE FUNCTION public.atlas_squad_run(p_run_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=private.atlas_executor_user();m planeje_private.atlas_squad_runs;r public.atlas_runs;
BEGIN
  SELECT * INTO m FROM planeje_private.atlas_squad_runs WHERE run_id=p_run_id AND owner_id=actor;
  SELECT * INTO r FROM public.atlas_runs WHERE id=p_run_id AND owner_id=actor;
  IF m.run_id IS NULL OR r.id IS NULL OR m.conversation_id<>r.conversation_id OR m.client_id IS DISTINCT FROM r.request_client_id
    OR m.source_session_id IS DISTINCT FROM r.source_session_id OR NOT private.atlas_squad_client_access(m.client_id) THEN RAISE insufficient_privilege; END IF;
  PERFORM public.atlas_squad_conversation(m.conversation_id);
  RETURN to_jsonb(r)||jsonb_build_object('domain','squad','mode',m.mode,'attachment_ids',to_jsonb(m.attachment_ids));
END $$;

CREATE FUNCTION public.atlas_squad_knowledge_snapshot(p_client_id uuid,p_id uuid DEFAULT NULL,p_limit integer DEFAULT 40,p_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=private.atlas_executor_user();records jsonb;total bigint;
BEGIN
  IF NOT private.atlas_squad_client_access(p_client_id) THEN RAISE insufficient_privilege; END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 1000000 THEN RAISE invalid_parameter_value; END IF;
  SELECT count(*) INTO total FROM planeje_private.atlas_squad_knowledge k WHERE k.owner_id=actor AND k.client_id IS NOT DISTINCT FROM p_client_id
    AND CASE WHEN p_id IS NULL THEN k.state='active' ELSE k.id=p_id END;
  IF p_id IS NOT NULL AND total=0 THEN RAISE insufficient_privilege; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO records FROM (
    SELECT k.id,k.client_id,k.content,k.version,k.state,k.replaces_id,k.source,k.created_at,k.revoked_at FROM planeje_private.atlas_squad_knowledge k
    WHERE k.owner_id=actor AND k.client_id IS NOT DISTINCT FROM p_client_id AND CASE WHEN p_id IS NULL THEN k.state='active' ELSE k.id=p_id END
    ORDER BY k.created_at DESC,k.id LIMIT p_limit OFFSET p_offset
  ) x;
  RETURN jsonb_build_object('rows',records,'total',total,'limit',p_limit,'offset',p_offset);
END $$;

CREATE FUNCTION public.atlas_squad_bootstrap(p_client_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=private.atlas_executor_user();clients jsonb;conversations jsonb;knowledge jsonb;preferences jsonb;budget jsonb;
BEGIN
  IF NOT private.atlas_squad_client_access(p_client_id) THEN RAISE insufficient_privilege; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO clients FROM (
    SELECT c.id,c.empresa FROM public.clientes c WHERE private.atlas_squad_client_access(c.id) ORDER BY c.empresa,c.id LIMIT 200
  ) x;
  SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO conversations FROM (
    SELECT c.id,c.title,c.client_id,c.updated_at,m.mode,'squad'::text AS domain FROM planeje_private.atlas_squad_conversations m
    JOIN public.atlas_conversations c ON c.id=m.conversation_id AND c.owner_id=m.owner_id
    WHERE m.owner_id=actor AND m.client_id IS NOT DISTINCT FROM p_client_id AND c.client_id IS NOT DISTINCT FROM m.client_id
    ORDER BY c.updated_at DESC,c.id LIMIT 40
  ) x;
  knowledge:=public.atlas_squad_knowledge_snapshot(p_client_id,NULL,40,0);
  SELECT p.preferences INTO preferences FROM planeje_private.atlas_squad_preferences p WHERE p.owner_id=actor;
  IF to_regclass('public.atlas_event_config') IS NOT NULL THEN
    SELECT jsonb_build_object('available',true,'max_tokens_per_day',c.max_tokens_per_day,'used_tokens',c.used_tokens,'reserved_tokens',c.reserved_tokens,'usage_day',c.usage_day)
      INTO budget FROM public.atlas_event_config c WHERE c.owner_id=actor;
  END IF;
  RETURN jsonb_build_object('domain','squad','agents',jsonb_build_array(
    jsonb_build_object('id','central','name','Squad','role','Orquestrador do Squad'),jsonb_build_object('id','crm','name','CRM IA','role','Funil e atendimento'),
    jsonb_build_object('id','cs','name','CS IA','role','Relacionamento e saúde'),jsonb_build_object('id','gestor','name','Gestor IA','role','Tráfego e resultados')),
    'clients',clients,'conversations',conversations,'knowledge',knowledge->'rows','knowledge_coverage',knowledge-'rows',
    'preferences',coalesce(preferences,'{}')||jsonb_build_object('learning_requires_confirmation',true),
    'limits',jsonb_build_object('model_calls',10,'tools',24,'milliseconds',65000,'output_tokens',14000),
    'budget',coalesce(budget,jsonb_build_object('available',false)));
END $$;

CREATE FUNCTION public.atlas_squad_history(p_conversation_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=private.atlas_executor_user();conversation jsonb;messages jsonb;runs jsonb;items jsonb;attachments jsonb:='[]';
BEGIN
  conversation:=public.atlas_squad_conversation(p_conversation_id);
  SELECT coalesce(jsonb_agg(private.atlas_squad_public_json(to_jsonb(x)) ORDER BY x.created_at,x.id),'[]') INTO messages FROM (
    SELECT m.id,m.role,CASE WHEN m.role='user' AND s.mode='automation' AND r.executor_objective IS NOT NULL
      AND m.content=r.request_message AND left(m.content,length(E'[Executor Planeje]\n'||r.executor_objective))=E'[Executor Planeje]\n'||r.executor_objective
      AND substring(m.content FROM length(E'[Executor Planeje]\n'||r.executor_objective)+1)~E'^\n\\[Fluxo manual (proposta|salvo):[a-f0-9-]{36}@[1-9][0-9]*\\]$'
      THEN E'[Executor Planeje]\n'||r.executor_objective ELSE m.content END AS content,m.created_at,m.run_id
    FROM public.atlas_messages m JOIN planeje_private.atlas_squad_runs s ON s.run_id=m.run_id JOIN public.atlas_runs r ON r.id=m.run_id
    WHERE s.owner_id=actor AND m.owner_id=actor AND s.conversation_id=p_conversation_id AND m.conversation_id=p_conversation_id
    ORDER BY m.created_at DESC,m.id DESC LIMIT 100
  ) x;
  SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO runs FROM (
    SELECT r.id,r.request_id,r.status,r.steps,r.result,r.error,r.usage,r.created_at FROM public.atlas_runs r JOIN planeje_private.atlas_squad_runs s ON s.run_id=r.id
    WHERE s.owner_id=actor AND r.owner_id=actor AND s.conversation_id=p_conversation_id AND r.conversation_id=p_conversation_id
    ORDER BY r.created_at DESC,r.id DESC LIMIT 30
  ) x;
  SELECT coalesce(jsonb_agg(private.atlas_squad_public_json(to_jsonb(x)-'specification'-'decision_data') ORDER BY x.created_at,x.id),'[]') INTO items FROM (
    SELECT i.* FROM public.atlas_execution_items i WHERE i.owner_id=actor AND i.conversation_id=p_conversation_id
      AND private.atlas_squad_item_domain(i) AND private.atlas_executor_item_visible(i)
      AND (i.state IN('awaiting_input','proposed','executing','uncertain') OR i.id IN(
        SELECT recent.id FROM public.atlas_execution_items recent JOIN planeje_private.atlas_squad_runs s ON s.run_id=recent.run_id
        WHERE recent.owner_id=actor AND s.owner_id=actor AND recent.conversation_id=p_conversation_id ORDER BY recent.created_at DESC,recent.id DESC LIMIT 80))
  ) x;
  IF to_regclass('public.atlas_executor_attachments') IS NOT NULL THEN
    EXECUTE $query$SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (
      SELECT a.id,a.run_id,a.request_id,a.name,a.mime,a.size,a.sha256,a.created_at FROM public.atlas_executor_attachments a
      JOIN planeje_private.atlas_squad_runs s ON s.run_id=a.run_id AND s.owner_id=a.owner_id AND s.conversation_id=a.conversation_id
      WHERE a.owner_id=$1 AND a.conversation_id=$2 AND a.client_id IS NOT DISTINCT FROM $3 AND a.state='uploaded'
      ORDER BY a.created_at DESC,a.id LIMIT 400
    ) x$query$ INTO attachments USING actor,p_conversation_id,(conversation->>'client_id')::uuid;
  END IF;
  SELECT coalesce(jsonb_agg(m.value||jsonb_build_object('attachments',CASE WHEN m.value->>'role'='user' THEN
    (SELECT coalesce(jsonb_agg(a.value),'[]') FROM jsonb_array_elements(attachments) a WHERE a.value->>'run_id'=m.value->>'run_id') ELSE '[]'::jsonb END) ORDER BY m.position),'[]')
    INTO messages FROM jsonb_array_elements(messages) WITH ORDINALITY m(value,position);
  RETURN jsonb_build_object('domain','squad','conversation',conversation,'messages',messages,'runs',runs,'interactions',items,'attachments',attachments,
    'coverage',jsonb_build_object('message_limit',100,'run_limit',30,'recent_item_limit',80,'attachment_limit',400));
END $$;
CREATE FUNCTION public.atlas_squad_progress(p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=private.atlas_executor_user();run_id uuid;
BEGIN
  SELECT s.run_id INTO run_id FROM planeje_private.atlas_squad_runs s WHERE s.owner_id=actor AND s.request_id=p_request_id;
  IF run_id IS NULL THEN
    IF EXISTS(SELECT 1 FROM public.atlas_runs r WHERE r.owner_id=actor AND r.request_id=p_request_id) THEN RAISE insufficient_privilege; END IF;
    RETURN jsonb_build_object('run',NULL);
  END IF;
  RETURN jsonb_build_object('run',public.atlas_squad_run(run_id));
END $$;

CREATE FUNCTION public.atlas_squad_expire_abandoned(p_domain text DEFAULT 'squad') RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=private.atlas_executor_user();affected integer;
BEGIN
  IF p_domain IS NULL OR p_domain NOT IN('squad','office') THEN RAISE invalid_parameter_value; END IF;
  UPDATE public.atlas_runs r SET status='failed',error='Esta consulta foi interrompida. O histórico está preservado.',finished_at=clock_timestamp()
    WHERE r.owner_id=actor AND r.status='processing' AND r.created_at<clock_timestamp()-interval '2 minutes'
      AND ((p_domain='squad')=EXISTS(SELECT 1 FROM planeje_private.atlas_squad_runs s WHERE s.run_id=r.id AND s.owner_id=actor));
  GET DIAGNOSTICS affected=ROW_COUNT;
  RETURN affected;
END $$;

-- Legacy Office keeps its records; these narrow reads prevent crossing the new domain at the Edge.
CREATE FUNCTION public.atlas_squad_office_context(p_conversation uuid DEFAULT NULL,p_request uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=private.atlas_executor_user();
BEGIN
  IF EXISTS(SELECT 1 FROM planeje_private.atlas_squad_conversations s WHERE s.owner_id=actor AND s.conversation_id=p_conversation)
    OR EXISTS(SELECT 1 FROM planeje_private.atlas_squad_runs s WHERE s.owner_id=actor AND s.request_id=p_request)
  THEN RAISE insufficient_privilege USING MESSAGE='O contexto pertence ao Squad.'; END IF;
  RETURN jsonb_build_object('allowed',true);
END $$;
CREATE FUNCTION public.atlas_squad_office_conversations() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=private.atlas_executor_user();records jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO records FROM (
    SELECT c.id,c.title,c.client_id,c.updated_at FROM public.atlas_conversations c WHERE c.owner_id=actor
      AND NOT EXISTS(SELECT 1 FROM planeje_private.atlas_squad_conversations s WHERE s.conversation_id=c.id)
    ORDER BY c.updated_at DESC,c.id DESC LIMIT 40
  ) x;
  RETURN records;
END $$;

-- Preserve the original Office entry point and its RLS, while Squad invokes a guarded private copy.
DO $copy_claim$
DECLARE definition text;owner_name text;private_definition text;
BEGIN
  SELECT pg_get_functiondef(p.oid),pg_get_userbyid(p.proowner) INTO definition,owner_name
    FROM pg_proc p WHERE p.oid='public.atlas_claim_run(uuid,uuid,uuid,text)'::regprocedure;
  IF position(E'\nBEGIN\n' IN definition)=0 THEN RAISE EXCEPTION 'Cabeçalho nativo Atlas inesperado.'; END IF;
  private_definition:=replace(definition,'CREATE OR REPLACE FUNCTION public.atlas_claim_run(',
    'CREATE OR REPLACE FUNCTION private.atlas_claim_run_pre_squad(');
  IF private_definition=definition THEN RAISE EXCEPTION 'Corpo nativo Atlas não foi identificado.'; END IF;
  EXECUTE private_definition;
  EXECUTE format('ALTER FUNCTION private.atlas_claim_run_pre_squad(uuid,uuid,uuid,text) OWNER TO %I',owner_name);
  EXECUTE regexp_replace(definition,E'\nBEGIN\n',E'\nBEGIN\n  -- Office cannot adopt a Squad conversation or request.\n  PERFORM public.atlas_squad_office_context(p_conversation_id,p_request_id);\n');
END $copy_claim$;
REVOKE ALL ON FUNCTION private.atlas_claim_run_pre_squad(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;

-- Keep the existing native Office function's OID, owner, ACL and invoker attributes.
-- One private compatibility copy serves Squad; both paths retain the same native receipt body.
DO $copy_native$
DECLARE definition text;owner_name text;private_definition text;guard text;
BEGIN
  SELECT pg_get_functiondef(p.oid),pg_get_userbyid(p.proowner) INTO definition,owner_name
    FROM pg_proc p WHERE p.oid='public.atlas_finish_run(uuid,text,text,jsonb,jsonb,text)'::regprocedure;
  IF position(E'\nBEGIN\n' IN definition)=0 THEN RAISE EXCEPTION 'Cabeçalho nativo Atlas inesperado.'; END IF;
  private_definition:=replace(definition,'CREATE OR REPLACE FUNCTION public.atlas_finish_run(',
    'CREATE OR REPLACE FUNCTION private.atlas_finish_run_pre_squad(');
  IF private_definition=definition THEN RAISE EXCEPTION 'Corpo nativo Atlas não foi identificado.'; END IF;
  EXECUTE private_definition;
  EXECUTE format('ALTER FUNCTION private.atlas_finish_run_pre_squad(uuid,text,text,jsonb,jsonb,text) OWNER TO %I',owner_name);
  guard:=E'\nBEGIN\n  -- Squad domain boundary; the remainder is the unchanged native Office body.\n'
    ||E'  PERFORM public.atlas_squad_office_context(\n'
    ||E'    (SELECT x.conversation_id FROM public.atlas_runs x WHERE x.id=p_run_id AND x.owner_id=auth.uid()),\n'
    ||E'    (SELECT x.request_id FROM public.atlas_runs x WHERE x.id=p_run_id AND x.owner_id=auth.uid()));\n';
  EXECUTE regexp_replace(definition,E'\nBEGIN\n',guard);
END $copy_native$;
REVOKE ALL ON FUNCTION private.atlas_finish_run_pre_squad(uuid,text,text,jsonb,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.atlas_squad_finish_run(p_run_id uuid,p_status text,p_content text,p_steps jsonb,p_usage jsonb,p_error text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=private.atlas_executor_user();r public.atlas_runs;
BEGIN
  SELECT * INTO r FROM public.atlas_runs WHERE id=p_run_id AND owner_id=actor FOR UPDATE;
  IF r.id IS NULL OR r.source_session_id IS DISTINCT FROM nullif(auth.jwt()->>'session_id','')::uuid THEN RAISE insufficient_privilege; END IF;
  PERFORM public.atlas_squad_run(p_run_id);
  RETURN private.atlas_finish_run_pre_squad(p_run_id,p_status,p_content,p_steps,p_usage,p_error);
END $$;
REVOKE ALL ON FUNCTION public.atlas_squad_finish_run(uuid,text,text,jsonb,jsonb,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.atlas_squad_finish_run(uuid,text,text,jsonb,jsonb,text) TO authenticated;

CREATE FUNCTION private.atlas_squad_office_storage_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row_new jsonb:=to_jsonb(NEW);row_old jsonb:=CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  origin_new uuid;origin_old uuid;conversation_new uuid;conversation_old uuid;
BEGIN
  IF TG_TABLE_NAME='atlas_jobs' THEN
    origin_new:=nullif(row_new->>'origin_run_id','')::uuid;origin_old:=nullif(row_old->>'origin_run_id','')::uuid;
    conversation_new:=nullif(row_new->>'conversation_id','')::uuid;conversation_old:=nullif(row_old->>'conversation_id','')::uuid;
  ELSE
    origin_new:=nullif(row_new->>'source_run_id','')::uuid;origin_old:=nullif(row_old->>'source_run_id','')::uuid;
  END IF;
  IF EXISTS(SELECT 1 FROM planeje_private.atlas_squad_runs s WHERE s.run_id IN(origin_new,origin_old))
    OR EXISTS(SELECT 1 FROM planeje_private.atlas_squad_conversations s WHERE s.conversation_id IN(conversation_new,conversation_old))
  THEN RAISE insufficient_privilege USING MESSAGE='Fontes Squad não podem criar ou alterar memória/missão Office.'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.atlas_squad_office_storage_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER atlas_squad_office_memory_boundary BEFORE INSERT OR UPDATE ON public.atlas_memories
  FOR EACH ROW EXECUTE FUNCTION private.atlas_squad_office_storage_guard();
DO $$ BEGIN
  IF to_regclass('public.atlas_jobs') IS NOT NULL THEN
    EXECUTE 'CREATE TRIGGER atlas_squad_office_job_boundary BEFORE INSERT OR UPDATE ON public.atlas_jobs FOR EACH ROW EXECUTE FUNCTION private.atlas_squad_office_storage_guard()';
  END IF;
END $$;

CREATE FUNCTION private.atlas_squad_knowledge_apply(p_item public.atlas_execution_items) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p jsonb:=p_item.payload;previous planeje_private.atlas_squad_knowledge;saved planeje_private.atlas_squad_knowledge;record_id uuid;origin jsonb;next_version integer:=1;
BEGIN
  IF NOT private.atlas_squad_item_scope(p_item) OR p_item.app<>'atlas' OR p_item.kind<>'proposal'
    OR p_item.action NOT IN('save_knowledge','revoke_knowledge') THEN RAISE insufficient_privilege; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p) k WHERE k<>ALL(CASE WHEN p_item.action='save_knowledge'
    THEN ARRAY['content','replaces_id','expected_version'] ELSE ARRAY['id','expected_version'] END)) THEN RAISE invalid_parameter_value; END IF;
  record_id:=nullif(p->>CASE WHEN p_item.action='save_knowledge' THEN 'replaces_id' ELSE 'id' END,'')::uuid;
  IF record_id IS NOT NULL THEN
    SELECT * INTO previous FROM planeje_private.atlas_squad_knowledge WHERE id=record_id AND owner_id=auth.uid() FOR UPDATE;
    IF NOT private.atlas_squad_item_scope(p_item) THEN RAISE insufficient_privilege; END IF;
    IF previous.id IS NULL OR previous.client_id IS DISTINCT FROM p_item.client_id THEN RAISE insufficient_privilege; END IF;
    IF previous.state<>'active' OR previous.version IS DISTINCT FROM (p->>'expected_version')::integer THEN RAISE serialization_failure USING MESSAGE='O conhecimento do Squad mudou.'; END IF;
    next_version:=previous.version+1;
  ELSIF p_item.action='revoke_knowledge' OR p->>'expected_version' IS NOT NULL THEN RAISE invalid_parameter_value; END IF;
  IF p_item.action='save_knowledge' THEN
    IF jsonb_typeof(p->'content') IS DISTINCT FROM 'string' OR p->>'content' IS NULL OR length(btrim(p->>'content')) NOT BETWEEN 1 AND 4000 THEN RAISE invalid_parameter_value; END IF;
    SELECT jsonb_build_object('kind','confirmed_instruction','execution_item_id',p_item.id,'run_id',p_item.run_id,'conversation_id',p_item.conversation_id,
      'request_id',s.request_id,'attachment_ids',to_jsonb(s.attachment_ids)) INTO origin FROM planeje_private.atlas_squad_runs s WHERE s.run_id=p_item.run_id;
    IF record_id IS NOT NULL THEN UPDATE planeje_private.atlas_squad_knowledge SET state='replaced' WHERE id=record_id; END IF;
    INSERT INTO planeje_private.atlas_squad_knowledge(owner_id,client_id,content,version,replaces_id,source)
      VALUES(auth.uid(),p_item.client_id,btrim(p->>'content'),next_version,record_id,origin) RETURNING * INTO saved;
    RETURN jsonb_build_object('id',saved.id,'version',saved.version,'summary','Conhecimento confirmado no Squad; Office preservado.');
  END IF;
  UPDATE planeje_private.atlas_squad_knowledge SET state='revoked',revoked_at=clock_timestamp() WHERE id=record_id;
  RETURN jsonb_build_object('id',record_id,'version',previous.version,'summary','Conhecimento retirado do Squad; histórico preservado.');
END $$;

ALTER FUNCTION private.atlas_executor_action(text,text) RENAME TO atlas_executor_action_pre_squad;
CREATE FUNCTION private.atlas_executor_action(p_app text,p_action text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT (p_app='atlas' AND p_action IN('save_knowledge','revoke_knowledge')) OR private.atlas_executor_action_pre_squad(p_app,p_action);
$$;
ALTER FUNCTION private.atlas_executor_dispatch(public.atlas_execution_items) RENAME TO atlas_executor_dispatch_pre_squad;
CREATE FUNCTION private.atlas_executor_dispatch(p_item public.atlas_execution_items) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF p_item.app='atlas' AND p_item.action IN('save_knowledge','revoke_knowledge') THEN RETURN private.atlas_squad_knowledge_apply(p_item); END IF;
  RETURN private.atlas_executor_dispatch_pre_squad(p_item);
END $$;

REVOKE ALL ON FUNCTION private.atlas_squad_client_access(uuid),private.atlas_squad_immutable_map(),
  private.atlas_squad_item_domain(public.atlas_execution_items),private.atlas_squad_item_scope(public.atlas_execution_items),private.atlas_squad_knowledge_apply(public.atlas_execution_items),
  private.atlas_executor_action(text,text),private.atlas_executor_dispatch(public.atlas_execution_items),private.atlas_executor_action_pre_squad(text,text),private.atlas_executor_dispatch_pre_squad(public.atlas_execution_items)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.atlas_squad_conversation(uuid),public.atlas_squad_claim_run(uuid,uuid,uuid,text,text,uuid[]),public.atlas_squad_item(uuid,boolean),
  public.atlas_squad_run(uuid),public.atlas_squad_knowledge_snapshot(uuid,uuid,integer,integer),public.atlas_squad_bootstrap(uuid),public.atlas_squad_history(uuid),public.atlas_squad_progress(uuid),public.atlas_squad_office_context(uuid,uuid),public.atlas_squad_office_conversations(),public.atlas_squad_expire_abandoned(text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.atlas_squad_conversation(uuid),public.atlas_squad_claim_run(uuid,uuid,uuid,text,text,uuid[]),public.atlas_squad_item(uuid,boolean),
  public.atlas_squad_run(uuid),public.atlas_squad_knowledge_snapshot(uuid,uuid,integer,integer),public.atlas_squad_bootstrap(uuid),public.atlas_squad_history(uuid),public.atlas_squad_progress(uuid),public.atlas_squad_office_context(uuid,uuid),public.atlas_squad_office_conversations(),public.atlas_squad_expire_abandoned(text)
  TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
