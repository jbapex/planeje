-- Atlas can clarify a request before a task exists. Authority remains separate
-- from client text and staff reports; official tasks require a completed intake.
BEGIN;
CREATE TABLE public.atlas_manager_policy(
 owner_id uuid PRIMARY KEY REFERENCES public.profiles(id),enabled boolean NOT NULL DEFAULT false,
 create_after_clarification boolean NOT NULL DEFAULT false,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.atlas_manager_accounts(
 owner_id uuid NOT NULL REFERENCES public.profiles(id),client_id uuid NOT NULL REFERENCES public.clientes(id),
 person_id uuid NOT NULL REFERENCES public.profiles(id),updated_by uuid NOT NULL REFERENCES public.profiles(id),
 updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(owner_id,client_id));
ALTER TABLE public.atlas_manager_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_manager_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.atlas_manager_policy,public.atlas_manager_accounts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.atlas_manager_policy,public.atlas_manager_accounts TO authenticated;
GRANT ALL ON public.atlas_manager_policy,public.atlas_manager_accounts TO service_role;
CREATE POLICY atlas_manager_policy_read ON public.atlas_manager_policy FOR SELECT TO authenticated USING(private.atlas_team_human() AND owner_id=auth.uid());
CREATE POLICY atlas_manager_accounts_read ON public.atlas_manager_accounts FOR SELECT TO authenticated USING(private.atlas_team_human() AND owner_id=auth.uid());
ALTER TABLE public.atlas_team_threads ADD COLUMN management_kind text CHECK(management_kind IN('intake','owner_context','followup')),
 ADD COLUMN management_data jsonb NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX atlas_manager_one_intake ON public.atlas_team_threads(owner_id,client_id,coalesce(task_id,'00000000-0000-0000-0000-000000000000'::uuid),management_kind,coalesce(management_data->>'parent_thread',''))
 WHERE management_kind IN('intake','owner_context') AND state<>'closed';

CREATE FUNCTION private.atlas_manager_live(p_owner uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT private.atlas_event_enabled(p_owner) AND EXISTS(SELECT 1 FROM public.atlas_manager_policy WHERE owner_id=p_owner AND enabled)
 AND EXISTS(SELECT 1 FROM public.atlas_team_config WHERE owner_id=p_owner AND enabled)
 AND EXISTS(SELECT 1 FROM public.atlas_event_config WHERE owner_id=p_owner AND enabled AND mode='assist');
$$;
CREATE FUNCTION private.atlas_manager_account(p_owner uuid,p_client uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH candidates AS (
 SELECT p.id,0 rank FROM public.atlas_manager_accounts a JOIN public.profiles p ON p.id=a.person_id
 WHERE a.owner_id=p_owner AND a.client_id=p_client AND p.id<>p_owner AND p.status='active' AND p.role IN('admin','superadmin','colaborador')
 UNION ALL SELECT p.id,1 rank FROM public.clientes c JOIN public.profiles p ON (c.responsavel=p.id::text OR lower(btrim(c.responsavel))=lower(btrim(p.full_name)))
 WHERE c.id=p_client AND c.etapa='closed' AND p.id<>p_owner AND p.status='active' AND p.role IN('admin','superadmin','colaborador')),
 preferred AS (SELECT DISTINCT id FROM candidates WHERE rank=(SELECT min(rank) FROM candidates))
 SELECT CASE WHEN count(*)=1 THEN min(id::text)::uuid END FROM preferred;
$$;
CREATE FUNCTION private.atlas_manager_work(p_at timestamptz,p_owner uuid,p_person uuid) RETURNS timestamptz LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE local timestamp:=p_at AT TIME ZONE 'America/Sao_Paulo'; starts time; ends time; day date;
BEGIN
 SELECT start_time,end_time INTO starts,ends FROM public.atlas_team_hours WHERE owner_id=p_owner AND person_id=p_person;
 starts:=coalesce(starts,'08:00');ends:=coalesce(ends,'17:00');day:=local::date;
 FOR i IN 1..15 LOOP
  IF extract(isodow FROM day)<6 AND (day>local::date OR local::time<ends) THEN RETURN (day+greatest(starts,CASE WHEN day=local::date THEN local::time ELSE starts END)) AT TIME ZONE 'America/Sao_Paulo'; END IF;
  day:=day+1;
 END LOOP;
 RAISE EXCEPTION 'Expediente indisponível.';
END $$;
CREATE FUNCTION private.atlas_manager_settings(p_enabled boolean,p_create boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT private.atlas_demand_owner() OR NOT private.atlas_team_human() THEN RAISE EXCEPTION 'Configuração exclusiva do dono.' USING ERRCODE='42501';END IF;
 INSERT INTO public.atlas_manager_policy(owner_id,enabled,create_after_clarification) VALUES(auth.uid(),p_enabled,p_create)
 ON CONFLICT(owner_id) DO UPDATE SET enabled=excluded.enabled,create_after_clarification=excluded.create_after_clarification,updated_at=now();
 PERFORM public.atlas_event_settings(jsonb_build_object('mode',CASE WHEN p_enabled THEN 'assist' ELSE 'observe' END),p_enabled);
 IF p_enabled THEN PERFORM private.atlas_manager_prepare();END IF;
 RETURN jsonb_build_object('enabled',p_enabled,'create_after_clarification',p_create);
END $$;
CREATE FUNCTION public.atlas_manager_settings(p_enabled boolean,p_create boolean DEFAULT true) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.atlas_manager_settings(p_enabled,p_create); $$;

CREATE OR REPLACE FUNCTION public.atlas_team_worker_apply(p_thread uuid,p_revision integer,p_plan jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t public.atlas_team_threads;
BEGIN
 SELECT * INTO t FROM public.atlas_team_threads WHERE id=p_thread FOR UPDATE;
 IF t.revision<>p_revision OR t.state NOT IN('awaiting_reply','waiting_review') OR NOT EXISTS(SELECT 1 FROM public.atlas_team_config WHERE owner_id=t.owner_id AND enabled) THEN RETURN false;END IF;
 IF t.management_kind IS NOT NULL AND NOT private.atlas_manager_live(t.owner_id) THEN RETURN false;END IF;
 INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(t.id,'atlas',left(p_plan->>'text',4000));
 IF p_plan->>'kind' IN('unavailable','delivery_review') THEN
  UPDATE public.atlas_team_threads SET state=CASE WHEN p_plan->>'kind'='delivery_review' THEN 'delivery_review' ELSE 'needs_owner' END,current_person_id=CASE WHEN p_plan->>'kind'='delivery_review' AND management_kind IS NOT NULL THEN account_person_id ELSE owner_id END,next_review_at=NULL,revision=revision+1,updated_at=now() WHERE id=t.id;RETURN true;
 END IF;
 UPDATE public.atlas_team_threads SET state='awaiting_reply',next_review_at=(p_plan->>'next_review_at')::timestamptz,reminder_day=(p_plan->>'reminder_day')::date,reminders_today=(p_plan->>'reminders_today')::integer,revision=revision+1,updated_at=now() WHERE id=t.id;
 RETURN true;
END $$;

-- Service-only reconciliation. No delegation is granted human conversation rights.
CREATE FUNCTION public.atlas_manager_snapshot(p_owner uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('enabled',private.atlas_manager_live(p_owner),
 'accounts',coalesce((SELECT jsonb_agg(jsonb_build_object('client_id',c.id,'person_id',private.atlas_manager_account(p_owner,c.id))) FROM public.clientes c JOIN public.atlas_event_config e ON c.id=ANY(e.client_ids) AND e.owner_id=p_owner WHERE c.etapa='closed'),'[]'),
 'threads',coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'client_id',t.client_id,'task_id',t.task_id,'state',t.state,'next_review_at',t.next_review_at,'summary',t.summary,'evidence_url',t.evidence_url,'updated_at',t.updated_at)) FROM public.atlas_team_threads t JOIN public.atlas_event_config e ON e.owner_id=t.owner_id AND t.client_id=ANY(e.client_ids) WHERE t.owner_id=p_owner),'[]'))
 WHERE private.atlas_event_enabled(p_owner);
$$;
CREATE FUNCTION private.atlas_manager_open(p_finding uuid,p_owner_only boolean DEFAULT false) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE f public.atlas_event_findings;account uuid;thread uuid;kind text;body text;title text;source text;current_thread public.atlas_team_threads;signature text;candidate uuid;
BEGIN
 SELECT * INTO f FROM public.atlas_event_findings WHERE id=p_finding FOR UPDATE;
 IF NOT coalesce(private.atlas_manager_live(f.owner_id),false) OR NOT EXISTS(SELECT 1 FROM public.atlas_event_config WHERE owner_id=f.owner_id AND f.client_id=ANY(client_ids))
 OR private.atlas_event_client(f.conversation_id) IS DISTINCT FROM f.client_id OR f.route='none' OR f.state IN('closed','no_action') THEN RETURN NULL;END IF;
 signature:=md5(jsonb_build_object('summary',f.summary,'question',f.question,'intent',f.intent,'task_id',f.task_id)::text);
 IF f.thread_id IS NOT NULL THEN
  SELECT * INTO current_thread FROM public.atlas_team_threads WHERE id=f.thread_id FOR UPDATE;
  IF current_thread.management_kind IS NULL THEN RETURN f.thread_id;END IF;
  IF current_thread.state<>'closed' THEN
   IF current_thread.management_data->'finding_versions'->>f.id::text IS DISTINCT FROM signature THEN
    IF current_thread.management_kind='owner_context' AND coalesce((current_thread.management_data->>'needs_account')::boolean,false) THEN
     UPDATE public.atlas_team_threads SET management_data=jsonb_set(management_data,'{finding_versions}',coalesce(management_data->'finding_versions','{}')||jsonb_build_object(f.id::text,signature)),revision=revision+1,updated_at=now() WHERE id=current_thread.id;
    ELSIF NOT p_owner_only AND current_thread.state NOT IN('needs_owner','delivery_review') AND private.atlas_manager_work(now(),f.owner_id,current_thread.account_person_id)<=now() THEN
     UPDATE public.atlas_team_threads SET current_person_id=account_person_id,state='awaiting_reply',next_review_at=private.atlas_manager_work(now()+interval '1 hour',owner_id,account_person_id),management_data=management_data||jsonb_build_object('finding_versions',coalesce(management_data->'finding_versions','{}')||jsonb_build_object(f.id::text,signature),'findings',(SELECT coalesce(jsonb_agg(CASE WHEN item->>'id'=f.id::text THEN jsonb_build_object('id',f.id,'title',f.title,'summary',f.summary) ELSE item END),'[]') FROM jsonb_array_elements(coalesce(management_data->'findings','[]')) item)),revision=revision+1,updated_at=now() WHERE id=current_thread.id;
     INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(current_thread.id,'atlas','O cliente trouxe mais um ponto sobre isso: '||left(f.summary,1600)||' Muda alguma coisa no trabalho que estamos acompanhando?');
    ELSE RETURN f.thread_id;END IF;
   END IF;
   UPDATE public.atlas_event_findings SET state='account_contacted' WHERE id=f.id;RETURN f.thread_id;
  END IF;
  UPDATE public.atlas_event_findings SET thread_id=NULL,state='observed',revision=revision+1 WHERE id=f.id RETURNING * INTO f;
 END IF;
 account:=private.atlas_manager_account(f.owner_id,f.client_id);
 kind:=CASE WHEN account IS NULL OR f.intent='cancellation' THEN 'owner_context' ELSE 'intake' END;
 IF p_owner_only AND kind<>'owner_context' THEN RETURN NULL;END IF;
 IF NOT p_owner_only AND private.atlas_manager_work(now(),f.owner_id,coalesce(account,f.owner_id))>now() THEN RETURN NULL;END IF;
 account:=CASE WHEN kind='owner_context' THEN f.owner_id ELSE account END;
 candidate:=f.task_id;
 IF kind='owner_context' AND private.atlas_manager_account(f.owner_id,f.client_id) IS NULL THEN candidate:=NULL;END IF;
 IF EXISTS(SELECT 1 FROM public.tarefas x JOIN public.task_statuses s ON s.value=x.status AND s.is_terminal WHERE x.id=candidate) THEN candidate:=NULL;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('atlas-manager:'||f.owner_id::text||f.client_id::text,0));
 SELECT t.id INTO thread FROM public.atlas_team_threads t WHERE t.owner_id=f.owner_id AND t.client_id=f.client_id AND t.task_id IS NOT DISTINCT FROM candidate AND t.management_kind=kind AND t.state<>'closed' FOR UPDATE;
 SELECT c.empresa INTO title FROM public.clientes c WHERE c.id=f.client_id AND c.etapa='closed';
 SELECT coalesce(string_agg(left(m->>'body',1000),E'\n' ORDER BY m->>'created_at'),'') INTO source
 FROM public.atlas_event_jobs j CROSS JOIN LATERAL jsonb_array_elements(j.input->'messages') m WHERE j.id=f.job_id AND f.sources ? (m->>'id');
 IF source='' THEN RETURN NULL;END IF;
 IF thread IS NULL THEN
  body:=CASE WHEN kind='owner_context' AND private.atlas_manager_account(f.owner_id,f.client_id) IS NULL THEN
   'Preciso de você num ponto da '||title||': quem cuida dessa conta por aqui? Me fala o nome ou escolhe abaixo. Vou guardar e seguir com essa pessoa no expediente.'
   WHEN kind='owner_context' THEN 'Preciso da sua ajuda com uma decisão da '||title||'. '||left(f.summary,1500)
   ELSE 'Oi, '||(SELECT split_part(full_name,' ',1) FROM public.profiles WHERE id=account)||'! Aqui é o Atlas. Chegou um pedido da '||title||': '||left(f.summary,1500)||E'\nConsegue me contar o que precisamos fazer e quem pode cuidar disso? Se já tiver tarefa aberta para esse pedido, me fala qual é para seguirmos nela.' END;
  INSERT INTO public.atlas_team_threads(owner_id,client_id,task_id,account_person_id,current_person_id,title,shared_context,source_key,next_review_at,management_kind,management_data)
  VALUES(f.owner_id,f.client_id,candidate,account,account,left('['||title||'] Alinhar pedidos recebidos',200),jsonb_build_object('text',left(source,3500),'label','Pedido identificado no grupo; esclarecer antes da tarefa','at',now()),'manager-finding:'||f.id||':'||kind||':'||f.revision,private.atlas_manager_work(now()+interval '1 hour',f.owner_id,account),kind,jsonb_build_object('finding_ids',jsonb_build_array(f.id),'finding_versions',jsonb_build_object(f.id::text,signature),'findings',jsonb_build_array(jsonb_build_object('id',f.id,'title',f.title,'summary',f.summary)),'needs_account',private.atlas_manager_account(f.owner_id,f.client_id) IS NULL)) RETURNING id INTO thread;
  INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(thread,'atlas',body);
 ELSE
  UPDATE public.atlas_team_threads SET management_data=management_data||jsonb_build_object('finding_ids',coalesce(management_data->'finding_ids','[]')||jsonb_build_array(f.id),'finding_versions',coalesce(management_data->'finding_versions','{}')||jsonb_build_object(f.id::text,signature),'findings',coalesce(management_data->'findings','[]')||jsonb_build_array(jsonb_build_object('id',f.id,'title',f.title,'summary',f.summary))),revision=revision+1,updated_at=now() WHERE id=thread;
  IF kind<>'owner_context' OR private.atlas_manager_account(f.owner_id,f.client_id) IS NOT NULL THEN INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(thread,'atlas','Tem mais um pedido desse cliente para vermos por aqui: '||left(f.summary,1500));END IF;
 END IF;
 UPDATE public.atlas_event_findings SET thread_id=thread,account_id=account,state='account_contacted',revision=revision+1,updated_at=now() WHERE id=f.id;
 RETURN thread;
END $$;
CREATE FUNCTION public.atlas_manager_open(p_finding uuid) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.atlas_manager_open(p_finding,false); $$;
CREATE FUNCTION public.atlas_manager_resolved(p_owner uuid) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t record;count integer:=0;
BEGIN
 IF NOT coalesce(private.atlas_manager_live(p_owner),false) THEN RETURN 0;END IF;
 FOR t IN SELECT x.id FROM public.atlas_team_threads x WHERE x.owner_id=p_owner AND x.management_kind='intake' AND x.state<>'closed' AND EXISTS(SELECT 1 FROM public.atlas_event_findings f WHERE f.thread_id=x.id) AND NOT EXISTS(SELECT 1 FROM public.atlas_event_findings f WHERE f.thread_id=x.id AND f.route<>'none' AND f.state NOT IN('closed','no_action')) FOR UPDATE LOOP
  UPDATE public.atlas_team_threads SET state='closed',next_review_at=NULL,revision=revision+1,updated_at=now() WHERE id=t.id;
  INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(t.id,'atlas','Não ficou mais nada para esclarecer nesse pedido, pelo histórico atual. Encerrei este assunto aqui; as tarefas continuam com as etapas que já estavam.');count:=count+1;
 END LOOP;
 RETURN count;
END $$;
CREATE FUNCTION private.atlas_manager_prepare() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE finding record;opened integer:=0;
BEGIN
 IF NOT private.atlas_demand_owner() OR NOT private.atlas_team_human() THEN RAISE EXCEPTION 'Preparação exclusiva do dono.' USING ERRCODE='42501';END IF;
 FOR finding IN SELECT id FROM public.atlas_event_findings WHERE owner_id=auth.uid() AND route<>'none' AND thread_id IS NULL AND state NOT IN('closed','no_action') LOOP
  IF private.atlas_manager_open(finding.id,true) IS NOT NULL THEN opened:=opened+1;END IF;
 END LOOP;
 RETURN opened;
END $$;

-- The owner's account definition is stored once. Its private conversation is
-- never reassigned or copied to an employee; a separate intake is reconciled.
CREATE FUNCTION private.atlas_manager_set_account(p_thread uuid,p_person uuid,p_revision integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.atlas_team_threads;previous public.atlas_memories;
BEGIN
 t:=private.atlas_team_assert(p_thread);
 IF auth.uid()<>t.owner_id OR t.management_kind<>'owner_context' OR NOT coalesce((t.management_data->>'needs_account')::boolean,false) OR t.revision<>p_revision OR NOT private.atlas_manager_live(t.owner_id)
 OR p_person=t.owner_id OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_person AND status='active' AND role IN('admin','superadmin','colaborador')) THEN RAISE EXCEPTION 'Responsável indisponível ou conversa alterada.' USING ERRCODE='42501';END IF;
 IF t.state='closed' AND EXISTS(SELECT 1 FROM public.atlas_manager_accounts WHERE owner_id=t.owner_id AND client_id=t.client_id AND person_id=p_person) THEN RETURN '{"ok":true,"replayed":true}';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('atlas-manager-account:'||t.owner_id::text||t.client_id::text,0));
 SELECT * INTO previous FROM public.atlas_memories WHERE owner_id=t.owner_id AND client_id=t.client_id AND topic='gestao_conta' AND state='active' ORDER BY version DESC,created_at DESC LIMIT 1 FOR UPDATE;
 INSERT INTO public.atlas_manager_accounts(owner_id,client_id,person_id,updated_by) VALUES(t.owner_id,t.client_id,p_person,auth.uid())
 ON CONFLICT(owner_id,client_id) DO UPDATE SET person_id=excluded.person_id,updated_by=excluded.updated_by,updated_at=now();
 UPDATE public.atlas_memories SET state='replaced' WHERE owner_id=t.owner_id AND client_id=t.client_id AND topic='gestao_conta' AND state='active';
 INSERT INTO public.atlas_memories(owner_id,client_id,content,source,source_quote,topic,version,replaces_id)
 SELECT t.owner_id,t.client_id,'Responsável interno para esclarecimentos operacionais: '||full_name||' ('||p_person||'). Definido pelo dono no robô.','user_confirmation','Seleção explícita do dono na conversa '||t.id,'gestao_conta',coalesce(previous.version,0)+1,previous.id FROM public.profiles WHERE id=p_person;
 INSERT INTO public.atlas_team_messages(thread_id,role,actor_id,content) SELECT t.id,'human',auth.uid(),'Responsável interno definido: '||full_name FROM public.profiles WHERE id=p_person;
 INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(t.id,'atlas','Fechado, guardei quem cuida dessa conta. No expediente, sigo com essa pessoa e acompanho os próximos passos por aqui.');
 UPDATE public.atlas_team_threads SET state='closed',next_review_at=NULL,management_data=management_data||jsonb_build_object('defined_account_id',p_person),revision=revision+1,updated_at=now() WHERE id=t.id;
 UPDATE public.atlas_team_threads SET account_person_id=p_person,current_person_id=CASE WHEN current_person_id=account_person_id THEN p_person ELSE current_person_id END,revision=revision+1,updated_at=now() WHERE owner_id=t.owner_id AND client_id=t.client_id AND management_kind IN('intake','followup') AND state<>'closed' AND account_person_id<>p_person;
 UPDATE public.atlas_team_requests SET state='completed',applied=true,result=jsonb_build_object('reply','Fechado, guardei quem cuida dessa conta.','decision','account_defined','person_id',p_person),usage='{}' WHERE thread_id=t.id AND actor_id=auth.uid() AND session_id=(auth.jwt()->>'session_id')::uuid AND state='processing' AND thread_revision=t.revision;
 UPDATE public.atlas_event_findings SET thread_id=NULL,account_id=NULL,state='observed',revision=revision+1,updated_at=now() WHERE thread_id=t.id AND state NOT IN('closed','no_action') AND route<>'none';
 INSERT INTO public.atlas_event_signals(owner_id,client_id,kind,source_id,source_version) VALUES(t.owner_id,t.client_id,'manager_account',t.id::text,p_person::text);
 RETURN '{"ok":true}';
END $$;
CREATE FUNCTION public.atlas_manager_set_account(p_thread uuid,p_person uuid,p_revision integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.atlas_manager_set_account(p_thread,p_person,p_revision); $$;

-- Context is read through the existing human membership policy. Intake can list
-- active team members as candidate executors without granting them the thread.
CREATE FUNCTION public.atlas_manager_context(p_thread uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t public.atlas_team_threads;result jsonb;
BEGIN
 SELECT * INTO t FROM public.atlas_team_threads WHERE id=p_thread;
 IF t.id IS NULL OR t.management_kind IS NULL THEN RETURN NULL;END IF;
 result:=public.atlas_team_context(p_thread);
 RETURN result||jsonb_build_object('management',true,
 'people',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',full_name,'hours','{"start_time":"08:00","end_time":"17:00"}'::jsonb)),'[]') FROM public.profiles WHERE status='active' AND role IN('admin','superadmin','colaborador')),
 'tasks',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'title',x.title,'description',left(x.description,1500),'assignee_ids',x.assignee_ids,'due_date',x.due_date,'terminal',coalesce(s.is_terminal,false)) ORDER BY x.created_at DESC),'[]') FROM public.tarefas x LEFT JOIN public.task_statuses s ON s.value=x.status WHERE x.client_id=t.client_id),
 'scope',(SELECT jsonb_build_object('tipo_servico',tipo_servico,'tipo_contrato',tipo_contrato,'entregaveis',entregaveis-ARRAY['whatsapp_grupo'],'objetivo',objetivo_meta,'owner_direction',t.management_data->'owner_direction') FROM public.clientes WHERE id=t.client_id));
END $$;

-- Reuse only the operational briefs produced from the owner's explicit answers.
-- Original private messages and unrelated personal memories are not returned.
CREATE FUNCTION private.atlas_manager_knowledge(p_request uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.atlas_team_requests;t public.atlas_team_threads;
BEGIN
 SELECT * INTO r FROM public.atlas_team_requests WHERE id=p_request;
 SELECT * INTO t FROM public.atlas_team_threads WHERE id=r.thread_id;
 IF r.id IS NULL OR r.state<>'processing' OR NOT coalesce(private.atlas_manager_live(t.owner_id),false)
 OR NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id=r.session_id AND user_id=r.actor_id)
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=r.actor_id AND status='active' AND role IN('admin','superadmin','colaborador'))
 OR r.actor_id NOT IN(t.owner_id,t.current_person_id) THEN RAISE EXCEPTION 'Contexto não autorizado.' USING ERRCODE='42501';END IF;
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(brief) ORDER BY brief.at DESC),'[]') FROM (
 SELECT x.result->>'summary' AS content,s.title AS subject,x.created_at AS at
 FROM public.atlas_team_threads s JOIN public.atlas_team_requests x ON x.thread_id=s.id AND x.actor_id=s.owner_id AND x.applied AND x.result->>'applied_decision'='owner_answered'
 WHERE s.owner_id=t.owner_id AND s.client_id=t.client_id AND s.management_kind='owner_context' ORDER BY x.created_at DESC LIMIT 20) brief);
END $$;
CREATE FUNCTION public.atlas_manager_knowledge(p_request uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT private.atlas_manager_knowledge(p_request); $$;

-- Worker-only result writer: rechecks session, current actor, policy and sources.
-- The provider's JSON never carries SQL, approval flags or arbitrary patches.
CREATE FUNCTION private.atlas_manager_finish(p_id uuid,p_result jsonb,p_usage jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.atlas_team_threads;r public.atlas_team_requests;actor uuid;kind text;selected uuid;task public.tarefas;v_title text;body text;review timestamptz;expected timestamptz;due date;initial text;tasktype text;days integer;existing uuid;name text;owner_thread uuid;parent uuid;resume boolean:=false;basis text;tasks_basis text;question_override text;
BEGIN
 SELECT * INTO r FROM public.atlas_team_requests WHERE id=p_id;
 SELECT * INTO t FROM public.atlas_team_threads WHERE id=r.thread_id FOR UPDATE;
 SELECT * INTO r FROM public.atlas_team_requests WHERE id=p_id FOR UPDATE;
 IF r.state='completed' AND r.applied THEN RETURN jsonb_build_object('saved',true,'replayed',true,'task_id',t.task_id);END IF;
 IF r.state='completed' AND NOT r.applied AND t.management_data->>'pending_request_id'=r.id::text THEN resume:=true;p_result:=r.result;p_usage:=r.usage;END IF;
 IF r.id IS NULL OR r.state<>'processing' AND NOT resume OR t.management_kind IS NULL OR NOT coalesce(private.atlas_manager_live(t.owner_id),false) OR t.revision<>r.thread_revision
 OR NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id=r.session_id AND user_id=r.actor_id)
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=r.actor_id AND status='active' AND role IN('admin','superadmin','colaborador'))
 OR r.actor_id NOT IN(t.owner_id,t.current_person_id) THEN RAISE EXCEPTION 'Sessão, política ou conversa mudou.' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.atlas_event_config WHERE owner_id=t.owner_id AND t.client_id=ANY(client_ids)) OR NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=t.client_id AND etapa='closed') THEN RAISE EXCEPTION 'Cliente fora da carteira autorizada.';END IF;
 kind:=p_result->>'decision';actor:=r.actor_id;
 SELECT md5(to_jsonb(c)::text) INTO basis FROM public.clientes c WHERE c.id=t.client_id;
 SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]')::text) INTO tasks_basis FROM public.tarefas x WHERE x.client_id=t.client_id;
 IF resume AND r.result->>'client_basis' IS DISTINCT FROM basis THEN kind:='ask';p_result:=jsonb_set(p_result,'{reply}','"O cadastro mudou antes da programação. Vamos conferir o escopo novamente antes de criar a tarefa."');END IF;
 IF resume AND r.result->>'tasks_basis' IS DISTINCT FROM tasks_basis THEN kind:='ask';p_result:=jsonb_set(p_result,'{reply}','"A fila mudou enquanto esse pedido aguardava. Vamos conferir se já tem uma tarefa cuidando disso?"');END IF;
 IF kind IS NULL OR kind NOT IN('ask','ready','progress','blocked','delivered','owner_needed','owner_answered','resolved') OR char_length(coalesce(p_result->>'reply','')) NOT BETWEEN 1 AND 4000 OR char_length(coalesce(p_result->>'summary','')) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Resposta incompleta.';END IF;
 selected:=nullif(p_result->>'executor_id','')::uuid;
 IF selected IS NOT NULL AND (selected=t.owner_id OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=selected AND status='active' AND role IN('admin','superadmin','colaborador'))) THEN RAISE EXCEPTION 'Executor indisponível.';END IF;
 expected:=nullif(p_result->>'expected_at','')::timestamptz;
 IF expected IS NOT NULL AND (expected<now()-interval '5 minutes' OR expected>now()+interval '90 days') THEN RAISE EXCEPTION 'Previsão inválida.';END IF;
 IF nullif(p_result->>'evidence_url','') IS NOT NULL AND (p_result->>'evidence_url' !~ '^https?://' OR NOT EXISTS(SELECT 1 FROM public.atlas_team_messages WHERE id=r.message_id AND position(p_result->>'evidence_url' IN content)>0)) THEN RAISE EXCEPTION 'Evidência não veio da resposta.';END IF;
 review:=private.atlas_manager_work(coalesce(nullif(p_result->>'review_at','')::timestamptz,now()+interval '1 hour'),t.owner_id,t.current_person_id);
 IF review<=now() OR review>now()+interval '90 days' THEN RAISE EXCEPTION 'Revisão inválida.';END IF;
 IF kind='delivered' AND nullif(p_result->>'evidence_url','') IS NULL AND NOT EXISTS(SELECT 1 FROM public.tarefas x JOIN public.task_statuses s ON s.value=x.status AND s.is_terminal WHERE x.id=t.task_id AND x.client_id=t.client_id) THEN kind:='ask';END IF;
 IF kind='ready' THEN
  IF t.management_kind<>'intake' OR actor<>t.account_person_id OR private.atlas_manager_account(t.owner_id,t.client_id) IS DISTINCT FROM actor OR coalesce((t.management_data->>'needs_account')::boolean,false) THEN RAISE EXCEPTION 'Alinhe primeiro com o responsável da conta.';END IF;
  IF p_result->>'scope_status' IS DISTINCT FROM 'within_scope' THEN kind:='owner_needed';
  ELSIF nullif(p_result->>'existing_task_id','') IS NULL AND NOT EXISTS(SELECT 1 FROM public.atlas_manager_policy WHERE owner_id=t.owner_id AND create_after_clarification) THEN kind:='owner_needed';p_result:=jsonb_set(p_result,'{reply}','"O trabalho foi alinhado com a conta. A criação automática está desligada: revise o repasse nas Demandas deste cliente para criar a tarefa."');
  ELSIF selected IS NULL OR char_length(btrim(coalesce(p_result->>'task_title',''))) NOT BETWEEN 1 AND 180 OR char_length(btrim(coalesce(p_result->>'task_description',''))) NOT BETWEEN 10 AND 6000 THEN kind:='ask';
  ELSE
   existing:=nullif(p_result->>'existing_task_id','')::uuid;
   IF jsonb_typeof(p_result->'finding_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(p_result->'finding_ids')=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_result->'finding_ids') a(id) WHERE NOT coalesce(t.management_data->'finding_ids','[]') ? a.id) THEN RAISE EXCEPTION 'Selecione somente pedidos deste alinhamento.';END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_result->'finding_ids') a(id) WHERE NOT EXISTS(SELECT 1 FROM public.atlas_event_findings f WHERE f.id::text=a.id AND f.owner_id=t.owner_id AND f.client_id=t.client_id AND f.thread_id=t.id AND f.state NOT IN('closed','no_action') AND f.updated_at<=r.created_at AND private.atlas_event_client(f.conversation_id)=t.client_id)) THEN RAISE EXCEPTION 'O pedido ou o vínculo do grupo mudou. Refaça o alinhamento antes de criar a tarefa.';END IF;
   IF t.task_id IS NOT NULL AND existing IS DISTINCT FROM t.task_id THEN kind:='ask';
   ELSIF existing IS NOT NULL THEN
    SELECT * INTO task FROM public.tarefas WHERE id=existing AND client_id=t.client_id FOR SHARE;
    IF task.id IS NULL OR EXISTS(SELECT 1 FROM public.task_statuses WHERE value=task.status AND is_terminal) THEN RAISE EXCEPTION 'Tarefa existente indisponível.';END IF;
    -- Linking never transfers an existing task or alters its official deadline.
    IF NOT selected=ANY(task.assignee_ids) THEN kind:='ask';question_override:='Essa tarefa está com outra pessoa. Vamos conferir com quem cuida da conta como seguir?';END IF;
    IF EXISTS(SELECT 1 FROM public.atlas_team_threads x WHERE x.owner_id=t.owner_id AND x.task_id=task.id AND x.id<>t.id AND x.state<>'closed') THEN kind:='ask';question_override:='Já estou acompanhando essa tarefa em outra conversa. Vamos seguir por lá para não cobrar duas vezes.';END IF;
   ELSE
    tasktype:=p_result->>'task_type';
    IF tasktype IS NULL OR tasktype NOT IN('interno','paid_traffic','video','arte','carrossel','social_media','post') THEN RAISE EXCEPTION 'Tipo inválido.';END IF;
    SELECT empresa INTO name FROM public.clientes WHERE id=t.client_id;
    v_title:=private.atlas_demand_task_title(name,p_result->>'task_title');
    PERFORM pg_advisory_xact_lock(hashtextextended('atlas-manager-task:'||t.owner_id::text||t.client_id::text,0));
    SELECT * INTO task FROM public.tarefas x WHERE x.client_id=t.client_id AND lower(btrim(x.title))=lower(btrim(v_title)) AND NOT EXISTS(SELECT 1 FROM public.task_statuses WHERE value=x.status AND is_terminal) LIMIT 1 FOR SHARE;
    IF task.id IS NOT NULL THEN kind:='ask';question_override:='Achei uma tarefa aberta com esse título: '||task.title||'. É esse mesmo trabalho? Assim seguimos nela.';
    ELSE
     days:=CASE WHEN tasktype='interno' THEN coalesce((SELECT inquiry_days FROM public.atlas_demand_planning_settings WHERE owner_id=t.owner_id),1) ELSE coalesce((SELECT production_days FROM public.atlas_demand_planning_settings WHERE owner_id=t.owner_id),3) END;
     due:=(now() AT TIME ZONE 'America/Sao_Paulo')::date;
     WHILE days>0 LOOP due:=due+1;IF extract(isodow FROM due)<6 THEN days:=days-1;END IF;END LOOP;
     IF expected IS NOT NULL THEN due:=(expected AT TIME ZONE 'America/Sao_Paulo')::date;END IF;
     WHILE extract(isodow FROM due)>5 LOOP due:=due+1;END LOOP;
     SELECT value INTO initial FROM public.task_statuses WHERE is_initial AND NOT is_terminal ORDER BY sort_order,value LIMIT 1;
     IF initial IS NULL THEN RAISE EXCEPTION 'Etapa inicial indisponível.';END IF;
     -- Automatic execution is deferred outside the recipient's business hours.
     IF private.atlas_manager_work(now(),t.owner_id,selected)>now() THEN kind:='queued';
     ELSE
      INSERT INTO public.tarefas(title,description,status,client_id,owner_id,type,priority,due_date,assignee_ids,status_history)
      VALUES(v_title,left(p_result->>'task_description',6000)||E'\n\nOrigem: alinhamento interno com Atlas. Conversa '||t.id||'. Relato da conta; não comprova execução.',initial,t.client_id,t.owner_id,tasktype,'medium',due,ARRAY[selected],jsonb_build_array(jsonb_build_object('status',initial,'assignee_ids',ARRAY[selected],'user_id',actor,'timestamp',now(),'source','atlas_after_account_clarification','thread_id',t.id,'request_id',r.id))) RETURNING * INTO task;
      IF task.assignee_ids IS DISTINCT FROM ARRAY[selected] OR task.due_date IS DISTINCT FROM due THEN RAISE EXCEPTION 'Fluxo alteraria o repasse; verifique a configuração.';END IF;
     END IF;
    END IF;
   END IF;
  END IF;
 END IF;
 body:=coalesce(question_override,p_result->>'reply');
 IF NOT resume AND t.management_data->>'pending_request_id' IS NOT NULL THEN
  UPDATE public.atlas_team_requests SET applied=true,result=result||jsonb_build_object('superseded_by',r.id) WHERE id=(t.management_data->>'pending_request_id')::uuid AND id<>r.id AND NOT applied;
  UPDATE public.atlas_team_threads SET management_data=management_data-'pending_request_id' WHERE id=t.id;
 END IF;
 IF kind='queued' THEN
  UPDATE public.atlas_team_threads SET state='waiting_review',next_review_at=private.atlas_manager_work(now(),t.owner_id,selected),management_data=jsonb_set(management_data,'{pending_request_id}',to_jsonb(r.id::text)),summary=p_result->>'summary',revision=revision+1,updated_at=now() WHERE id=t.id;
  body:='Fechado. Vou organizar a tarefa no começo do próximo expediente. Ela ainda não foi criada; antes de passar para a equipe, confiro se algo mudou.';
 ELSIF kind='ready' AND task.id IS NOT NULL THEN
  UPDATE public.atlas_team_threads SET task_id=task.id,title=task.title,management_kind='followup',current_person_id=selected,state='awaiting_reply',next_review_at=private.atlas_manager_work(now()+interval '1 hour',t.owner_id,selected),summary=p_result->>'summary',revision=revision+1,updated_at=now() WHERE id=t.id;
  UPDATE public.atlas_event_findings SET task_id=task.id,revision=revision+1,updated_at=now() WHERE thread_id=t.id AND p_result->'finding_ids' ? id::text;
  UPDATE public.atlas_demands d SET task_id=task.id,state='linked',proposal=jsonb_build_object('source','atlas_after_account_clarification','thread_id',t.id,'request_id',r.id),revision=d.revision+1,updated_at=now() FROM public.atlas_event_findings f WHERE f.thread_id=t.id AND f.demand_id=d.id AND p_result->'finding_ids' ? f.id::text AND d.state<>'archived';
  UPDATE public.atlas_event_findings SET thread_id=NULL,state='observed',revision=revision+1,updated_at=now() WHERE thread_id=t.id AND NOT p_result->'finding_ids' ? id::text;
  body:='Tarefa '||CASE WHEN existing IS NOT NULL THEN 'existente vinculada' ELSE 'criada' END||': '||task.title||'. '||(SELECT split_part(full_name,' ',1) FROM public.profiles WHERE id=selected)||', consegue cuidar disso para nós? '||left(task.description,1600)||E'\nMe avisa se está tudo claro ou se falta alguma coisa para começar. Prazo da tarefa: '||coalesce(to_char(task.due_date,'DD/MM/YYYY'),'não cadastrado')||'.';
 ELSIF kind='owner_answered' THEN
  IF actor<>t.owner_id OR t.management_kind<>'owner_context' OR coalesce((t.management_data->>'needs_account')::boolean,false) THEN RAISE EXCEPTION 'Informação exclusiva do dono.';END IF;
  parent:=nullif(t.management_data->>'parent_thread','')::uuid;
  IF parent IS NOT NULL THEN
   UPDATE public.atlas_team_threads SET state='awaiting_reply',current_person_id=account_person_id,next_review_at=private.atlas_manager_work(now()+interval '1 hour',owner_id,account_person_id),management_data=jsonb_set(management_data,'{owner_direction}',jsonb_build_object('summary',p_result->>'summary','request_id',r.id,'at',now())),revision=revision+1,updated_at=now() WHERE id=parent AND owner_id=t.owner_id AND client_id=t.client_id AND state<>'closed';
   IF NOT FOUND THEN RAISE EXCEPTION 'Assunto de origem indisponível.';END IF;
   INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(parent,'atlas','O Josias passou a orientação: '||(p_result->>'summary')||' Com isso, falta alguma coisa para seguirmos?');
  END IF;
  UPDATE public.atlas_team_threads SET state='closed',next_review_at=NULL,summary=p_result->>'summary',revision=revision+1,updated_at=now() WHERE id=t.id;
  INSERT INTO public.atlas_memories(owner_id,client_id,content,source,source_quote,topic)
  SELECT t.owner_id,t.client_id,left(p_result->>'summary',4000),'user_confirmation',left(m.content,2000),'direcao_operacional' FROM public.atlas_team_messages m WHERE m.id=r.message_id;
  body:='Fechado, guardei essa orientação. '||CASE WHEN parent IS NOT NULL THEN 'Vou seguir com quem cuida da conta. Sua conversa comigo fica por aqui.' ELSE 'Vou usar isso nos próximos passos desse cliente.' END;
 ELSIF kind='owner_needed' AND t.management_kind<>'owner_context' THEN
  INSERT INTO public.atlas_team_threads(owner_id,client_id,account_person_id,current_person_id,title,shared_context,source_key,state,management_kind,management_data)
  VALUES(t.owner_id,t.client_id,t.owner_id,t.owner_id,left('Decisão: '||t.title,200),jsonb_build_object('text',p_result->>'summary','label','Decisão que falta ao acompanhamento interno','at',now()),'manager-decision:'||r.id,'needs_owner','owner_context',jsonb_build_object('needs_account',false,'parent_thread',t.id)) RETURNING id INTO owner_thread;
  INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(owner_thread,'atlas',left(p_result->>'reply',4000));
  UPDATE public.atlas_team_threads SET state='waiting_review',next_review_at=NULL,summary=p_result->>'summary',revision=revision+1,updated_at=now() WHERE id=t.id;
  body:='Esse ponto depende de uma decisão do Josias. Já levei a dúvida para ele; quando responder, seguimos por aqui.';
 ELSIF kind IN('owner_needed','delivered') THEN
  UPDATE public.atlas_team_threads SET state=CASE WHEN kind='delivered' THEN 'delivery_review' ELSE 'needs_owner' END,current_person_id=CASE WHEN kind='delivered' THEN account_person_id ELSE owner_id END,next_review_at=NULL,summary=p_result->>'summary',evidence_url=nullif(p_result->>'evidence_url',''),revision=revision+1,updated_at=now() WHERE id=t.id;
 ELSIF kind='resolved' THEN
  UPDATE public.atlas_team_threads SET state='closed',next_review_at=NULL,summary=p_result->>'summary',revision=revision+1,updated_at=now() WHERE id=t.id;
 ELSE
  IF kind IN('progress','blocked') AND selected IS NOT NULL AND selected<>t.current_person_id THEN
   IF actor<>t.account_person_id OR NOT EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id AND selected=ANY(x.assignee_ids)) THEN RAISE EXCEPTION 'A confirmação deve ir a um responsável já vinculado à tarefa.';END IF;
   UPDATE public.atlas_team_threads SET current_person_id=selected,state='awaiting_reply',next_review_at=private.atlas_manager_work(review,owner_id,selected),expected_at=expected,summary=p_result->>'summary',revision=revision+1,reminder_day=NULL,reminders_today=0,updated_at=now() WHERE id=t.id;
   body:='Quem cuida da conta explicou: '||(p_result->>'summary')||' Como está esse trabalho agora? Me conta para eu acompanhar daqui.';
  ELSE
   UPDATE public.atlas_team_threads SET state=CASE WHEN kind='ask' THEN 'awaiting_reply' ELSE 'waiting_review' END,next_review_at=review,expected_at=expected,summary=p_result->>'summary',revision=revision+1,reminder_day=NULL,reminders_today=0,updated_at=now() WHERE id=t.id;
  END IF;
 END IF;
 INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(t.id,'atlas',body);
 UPDATE public.atlas_team_requests SET state='completed',applied=kind<>'queued',thread_revision=(SELECT revision FROM public.atlas_team_threads WHERE id=t.id),result=p_result||jsonb_build_object('applied_decision',kind,'task_id',task.id,'client_basis',basis,'tasks_basis',tasks_basis),usage=p_usage WHERE id=r.id;
 RETURN jsonb_build_object('saved',true,'decision',kind,'task_id',task.id);
END $$;

CREATE FUNCTION private.atlas_manager_review(p_thread uuid,p_revision integer,p_accepted boolean,p_note text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.atlas_team_threads;recipient uuid;
BEGIN
 t:=private.atlas_team_assert(p_thread);
 IF t.management_kind<>'followup' OR t.state<>'delivery_review' OR auth.uid() NOT IN(t.owner_id,t.account_person_id) OR t.revision<>p_revision OR char_length(btrim(coalesce(p_note,''))) NOT BETWEEN 1 AND 2000 OR NOT private.atlas_manager_live(t.owner_id) THEN RAISE EXCEPTION 'Revisão indisponível ou conversa alterada.' USING ERRCODE='42501';END IF;
 recipient:=coalesce((SELECT p.id FROM public.tarefas x JOIN public.profiles p ON p.id=ANY(x.assignee_ids) AND p.status='active' WHERE x.id=t.task_id AND x.client_id=t.client_id ORDER BY p.id LIMIT 1),t.account_person_id);
 UPDATE public.atlas_team_threads SET state=CASE WHEN p_accepted THEN 'closed' ELSE 'awaiting_reply' END,current_person_id=CASE WHEN p_accepted THEN account_person_id ELSE recipient END,next_review_at=CASE WHEN p_accepted THEN NULL ELSE private.atlas_manager_work(now()+interval '1 hour',owner_id,recipient) END,revision=revision+1,updated_at=now() WHERE id=t.id;
 INSERT INTO public.atlas_team_messages(thread_id,role,actor_id,content) VALUES(t.id,'human',auth.uid(),'Conferência interna: '||btrim(p_note));
 INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(t.id,'atlas',CASE WHEN p_accepted THEN 'Show, conferência guardada. Só lembra de manter a etapa da tarefa atualizada também.' ELSE 'Precisamos ajustar um ponto: '||btrim(p_note) END);
 IF p_accepted THEN UPDATE public.atlas_event_findings SET state='closed',revision=revision+1,updated_at=now() WHERE thread_id=t.id;END IF;
 RETURN '{"ok":true,"task_unchanged":true}';
END $$;
CREATE FUNCTION public.atlas_manager_review(p_thread uuid,p_revision integer,p_accepted boolean,p_note text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.atlas_manager_review(p_thread,p_revision,p_accepted,p_note); $$;

CREATE FUNCTION public.atlas_manager_finish(p_id uuid,p_result jsonb,p_usage jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.atlas_manager_finish(p_id,p_result,p_usage); $$;
CREATE FUNCTION public.atlas_manager_resume() RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE row record;count integer:=0;
BEGIN
 FOR row IN SELECT r.id FROM public.atlas_team_requests r JOIN public.atlas_team_threads t ON t.id=r.thread_id WHERE r.state='completed' AND NOT r.applied AND t.management_data->>'pending_request_id'=r.id::text AND t.revision=r.thread_revision AND t.next_review_at<=now() AND private.atlas_manager_live(t.owner_id) LOOP
  BEGIN
   PERFORM public.atlas_manager_finish(row.id,'{}','{}');count:=count+1;
  EXCEPTION WHEN OTHERS THEN
   -- A stale/revoked request cannot block other reviews or create a task.
   UPDATE public.atlas_team_requests SET applied=true,result=result||'{"resume_blocked":true}'::jsonb WHERE id=row.id AND NOT applied;
   UPDATE public.atlas_team_threads SET state='awaiting_reply',management_data=management_data-'pending_request_id',next_review_at=private.atlas_manager_work(now()+interval '1 hour',owner_id,current_person_id),revision=revision+1,updated_at=now() WHERE id=(SELECT thread_id FROM public.atlas_team_requests WHERE id=row.id);
   INSERT INTO public.atlas_team_messages(thread_id,role,content) SELECT thread_id,'atlas','O pedido parou porque o acesso ou os dados mudaram. Não criei uma nova tarefa. Me confirma o que continua valendo para retomarmos?' FROM public.atlas_team_requests WHERE id=row.id;
  END;
 END LOOP;
 RETURN count;
END $$;

REVOKE ALL ON FUNCTION private.atlas_manager_live(uuid),private.atlas_manager_account(uuid,uuid),private.atlas_manager_work(timestamptz,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.atlas_manager_live(uuid),private.atlas_manager_account(uuid,uuid),private.atlas_manager_work(timestamptz,uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION private.atlas_manager_open(uuid,boolean),private.atlas_manager_prepare() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.atlas_manager_open(uuid,boolean) TO service_role;
REVOKE ALL ON FUNCTION private.atlas_manager_settings(boolean,boolean),private.atlas_manager_set_account(uuid,uuid,integer),public.atlas_manager_settings(boolean,boolean),public.atlas_manager_set_account(uuid,uuid,integer),public.atlas_manager_context(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.atlas_manager_settings(boolean,boolean),private.atlas_manager_set_account(uuid,uuid,integer),public.atlas_manager_settings(boolean,boolean),public.atlas_manager_set_account(uuid,uuid,integer),public.atlas_manager_context(uuid) TO authenticated;
REVOKE ALL ON FUNCTION private.atlas_manager_review(uuid,integer,boolean,text),public.atlas_manager_review(uuid,integer,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.atlas_manager_review(uuid,integer,boolean,text),public.atlas_manager_review(uuid,integer,boolean,text) TO authenticated;
REVOKE ALL ON FUNCTION public.atlas_manager_snapshot(uuid),public.atlas_manager_open(uuid),public.atlas_manager_finish(uuid,jsonb,jsonb),public.atlas_manager_resume() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_manager_snapshot(uuid),public.atlas_manager_open(uuid),public.atlas_manager_finish(uuid,jsonb,jsonb),public.atlas_manager_resume() TO service_role;
REVOKE ALL ON FUNCTION private.atlas_manager_finish(uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.atlas_manager_finish(uuid,jsonb,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.atlas_manager_resolved(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_manager_resolved(uuid) TO service_role;
REVOKE ALL ON FUNCTION private.atlas_manager_knowledge(uuid),public.atlas_manager_knowledge(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.atlas_manager_knowledge(uuid),public.atlas_manager_knowledge(uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
