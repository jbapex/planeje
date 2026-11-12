-- Office manager: private state/proposals, complete RLS-scoped reads in application code.
-- AI has no task-writing tool. Only a current human owner may approve a proposal.
BEGIN;
CREATE TABLE public.atlas_office_config (
  id text PRIMARY KEY CHECK(id='atlas'), owner_id uuid NOT NULL REFERENCES public.profiles(id),
  enabled boolean NOT NULL DEFAULT false,
  scan_interval_seconds integer NOT NULL DEFAULT 600 CHECK(scan_interval_seconds BETWEEN 300 AND 3600),
  max_analyses_per_day integer NOT NULL DEFAULT 12 CHECK(max_analyses_per_day BETWEEN 1 AND 24),
  max_tokens_per_day integer NOT NULL DEFAULT 60000 CHECK(max_tokens_per_day BETWEEN 1000 AND 250000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.atlas_office_state (
  owner_id uuid PRIMARY KEY REFERENCES public.profiles(id), heartbeat_at timestamptz,
  last_scan_at timestamptz, last_error text, totals jsonb NOT NULL DEFAULT '{}',
  usage_day date, calls_today integer NOT NULL DEFAULT 0, tokens_today integer NOT NULL DEFAULT 0,
  analysis_reservation uuid, reservation_tokens integer NOT NULL DEFAULT 0, reservation_until timestamptz
);
CREATE TABLE public.atlas_office_clients (
  owner_id uuid NOT NULL REFERENCES public.profiles(id),client_id uuid NOT NULL REFERENCES public.clientes(id),
  observed_hash text, analyzed_hash text, status text NOT NULL DEFAULT 'idle' CHECK(status IN ('idle','queued','waiting_context','analyzing','ready','error','budget_wait')),
  last_observed_at timestamptz, analyzed_at timestamptz, retry_after timestamptz,
  summary text, usage jsonb NOT NULL DEFAULT '{}', last_error text,requested_at timestamptz,
  PRIMARY KEY(owner_id,client_id)
);
CREATE TABLE public.atlas_office_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES public.profiles(id),
  client_id uuid NOT NULL REFERENCES public.clientes(id),source_key text NOT NULL,
  question text NOT NULL CHECK(char_length(question) BETWEEN 1 AND 1600),
  state text NOT NULL DEFAULT 'open' CHECK(state IN ('open','answered','dismissed')),
  answer text,memory_id uuid REFERENCES public.atlas_memories(id),
  created_at timestamptz NOT NULL DEFAULT now(),answered_at timestamptz,
  UNIQUE(owner_id,client_id,source_key)
);
CREATE TABLE public.atlas_office_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES public.profiles(id),
  client_id uuid NOT NULL REFERENCES public.clientes(id),source_key text NOT NULL,source_hash text NOT NULL,
  title text NOT NULL CHECK(char_length(title) BETWEEN 1 AND 180),description text NOT NULL CHECK(char_length(description) BETWEEN 1 AND 3500),
  task_type text NOT NULL DEFAULT 'social_media',assignee_ids uuid[] NOT NULL DEFAULT '{}',due_date date,
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','approved','rejected','superseded')),
  created_task_id uuid UNIQUE REFERENCES public.tarefas(id),
  created_at timestamptz NOT NULL DEFAULT now(),decided_at timestamptz,
  UNIQUE(owner_id,client_id,source_key),
  CHECK((state='approved')=(created_task_id IS NOT NULL))
);
CREATE INDEX atlas_office_questions_open ON public.atlas_office_questions(owner_id,created_at) WHERE state='open';
CREATE INDEX atlas_office_proposals_pending ON public.atlas_office_proposals(owner_id,created_at) WHERE state='pending';
DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['atlas_office_config','atlas_office_state','atlas_office_clients','atlas_office_questions','atlas_office_proposals'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',tab);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated',tab);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',tab);
    EXECUTE format('CREATE POLICY atlas_office_owner_read ON public.%I FOR SELECT TO authenticated USING(owner_id=(SELECT auth.uid()) AND (SELECT public.atlas_is_owner()) AND (SELECT private.planeje_live_session()))',tab);
  END LOOP;
END $$;
-- Invoker functions retain RLS. The owner can only update decision fields, not AI drafts.
GRANT UPDATE(state,answer,memory_id,answered_at) ON public.atlas_office_questions TO authenticated;
GRANT UPDATE(state,created_task_id,decided_at) ON public.atlas_office_proposals TO authenticated;
CREATE POLICY atlas_office_question_decide ON public.atlas_office_questions FOR UPDATE TO authenticated
  USING(owner_id=(SELECT auth.uid()) AND (SELECT public.atlas_is_owner()) AND (SELECT private.planeje_live_session()) AND auth.jwt()->>'planeje_server_delegate' IS NULL AND auth.jwt()->>'session_id' IS NOT NULL)
  WITH CHECK(owner_id=(SELECT auth.uid()) AND (SELECT public.atlas_is_owner()) AND (SELECT private.planeje_live_session()) AND auth.jwt()->>'planeje_server_delegate' IS NULL AND auth.jwt()->>'session_id' IS NOT NULL);
CREATE POLICY atlas_office_proposal_decide ON public.atlas_office_proposals FOR UPDATE TO authenticated
  USING(owner_id=(SELECT auth.uid()) AND (SELECT public.atlas_is_owner()) AND (SELECT private.planeje_live_session()) AND auth.jwt()->>'planeje_server_delegate' IS NULL AND auth.jwt()->>'session_id' IS NOT NULL)
  WITH CHECK(owner_id=(SELECT auth.uid()) AND (SELECT public.atlas_is_owner()) AND (SELECT private.planeje_live_session()) AND auth.jwt()->>'planeje_server_delegate' IS NULL AND auth.jwt()->>'session_id' IS NOT NULL);

CREATE FUNCTION public.atlas_office_answer(p_question_id uuid,p_answer text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE q public.atlas_office_questions; mem jsonb;
BEGIN
  IF NOT public.atlas_is_owner() OR NOT private.planeje_live_session() OR auth.jwt()->>'planeje_server_delegate' IS NOT NULL OR auth.jwt()->>'session_id' IS NULL THEN
    RAISE EXCEPTION 'OFFICE_HUMAN_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF char_length(btrim(coalesce(p_answer,''))) NOT BETWEEN 1 AND 3000 THEN RAISE EXCEPTION 'OFFICE_ANSWER_INVALID'; END IF;
  SELECT * INTO q FROM public.atlas_office_questions WHERE id=p_question_id AND owner_id=auth.uid() FOR UPDATE;
  IF q.id IS NULL THEN RAISE EXCEPTION 'OFFICE_QUESTION_NOT_FOUND'; END IF;
  IF q.state='answered' THEN
    IF q.answer=btrim(p_answer) THEN RETURN jsonb_build_object('ok',true,'memory_id',q.memory_id,'replayed',true); END IF;
    RAISE EXCEPTION 'OFFICE_QUESTION_ALREADY_ANSWERED';
  END IF;
  IF q.state<>'open' OR NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=q.client_id AND etapa='closed') THEN RAISE EXCEPTION 'OFFICE_QUESTION_CHANGED'; END IF;
  mem:=public.atlas_save_memory('[Direção do cliente — confirmada por Josias] '||btrim(p_answer),q.client_id,true,NULL);
  UPDATE public.atlas_office_questions SET state='answered',answer=btrim(p_answer),memory_id=(mem->>'id')::uuid,answered_at=now() WHERE id=q.id;
  UPDATE public.atlas_inbox SET state='resolved',read_at=now() WHERE owner_id=auth.uid() AND source_key='office:question:'||q.id::text;
  RETURN jsonb_build_object('ok',true,'memory_id',mem->>'id');
END $$;
CREATE FUNCTION public.atlas_office_decide_proposal(p_proposal_id uuid,p_approve boolean,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.atlas_office_proposals; task public.tarefas; initial_status text;
BEGIN
  IF p_confirmed IS DISTINCT FROM true OR NOT public.atlas_is_owner() OR NOT private.planeje_live_session() OR auth.jwt()->>'planeje_server_delegate' IS NOT NULL OR auth.jwt()->>'session_id' IS NULL THEN
    RAISE EXCEPTION 'OFFICE_HUMAN_APPROVAL_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF p_approve IS NULL THEN RAISE EXCEPTION 'OFFICE_DECISION_REQUIRED'; END IF;
  SELECT * INTO p FROM public.atlas_office_proposals WHERE id=p_proposal_id AND owner_id=auth.uid() FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'OFFICE_PROPOSAL_NOT_FOUND'; END IF;
  IF p.state='approved' THEN RETURN jsonb_build_object('ok',true,'task_id',p.created_task_id,'replayed',true); END IF;
  IF p.state='rejected' AND NOT p_approve THEN RETURN jsonb_build_object('ok',true,'state','rejected','replayed',true); END IF;
  IF p.state<>'pending' THEN RAISE EXCEPTION 'OFFICE_PROPOSAL_CHANGED'; END IF;
  IF NOT p_approve THEN
    UPDATE public.atlas_office_proposals SET state='rejected',decided_at=now() WHERE id=p.id;
    UPDATE public.atlas_inbox SET state='resolved',read_at=now() WHERE owner_id=auth.uid() AND source_key='office:proposal:'||p.id::text;
    RETURN jsonb_build_object('ok',true,'state','rejected');
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=p.client_id AND etapa='closed') THEN RAISE EXCEPTION 'OFFICE_CLIENT_NOT_CURRENT'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.atlas_office_clients WHERE owner_id=auth.uid() AND client_id=p.client_id AND observed_hash=p.source_hash) THEN RAISE EXCEPTION 'OFFICE_PROPOSAL_STALE'; END IF;
  IF EXISTS(SELECT 1 FROM public.tarefas t LEFT JOIN public.task_statuses s ON s.value=t.status WHERE t.client_id=p.client_id AND lower(btrim(t.title))=lower(btrim(p.title)) AND NOT coalesce(s.is_terminal,false) AND lower(coalesce(t.status,'')) NOT IN ('completed','published','done','concluido','concluído','concluida','concluída')) THEN RAISE EXCEPTION 'OFFICE_TASK_ALREADY_EXISTS'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(p.assignee_ids) requested(id) WHERE NOT EXISTS(
    SELECT 1 FROM public.profiles pf WHERE pf.id=requested.id AND pf.status='active' AND pf.role IN ('admin','superadmin','colaborador')
  )) THEN RAISE EXCEPTION 'OFFICE_ASSIGNEE_UNAVAILABLE'; END IF;
  SELECT value INTO initial_status FROM public.task_statuses WHERE is_initial=true AND is_terminal=false ORDER BY sort_order,id LIMIT 1;
  IF initial_status IS NULL THEN RAISE EXCEPTION 'OFFICE_INITIAL_STATUS_MISSING'; END IF;
  INSERT INTO public.tarefas(title,description,status,client_id,owner_id,type,priority,due_date,assignee_ids,status_history)
    VALUES(p.title,p.description,initial_status,p.client_id,auth.uid(),p.task_type,'medium',p.due_date,p.assignee_ids,
      jsonb_build_array(jsonb_build_object('status',initial_status,'assignee_ids',p.assignee_ids,'user_id',auth.uid(),'timestamp',now(),'source','atlas_approved_proposal','proposal_id',p.id)))
    RETURNING * INTO task;
  UPDATE public.atlas_office_proposals SET state='approved',created_task_id=task.id,decided_at=now() WHERE id=p.id;
  UPDATE public.atlas_inbox SET state='resolved',read_at=now() WHERE owner_id=auth.uid() AND source_key='office:proposal:'||p.id::text;
  RETURN jsonb_build_object('ok',true,'task_id',task.id,'task',to_jsonb(task),'state','approved','replayed',false);
END $$;
REVOKE ALL ON FUNCTION public.atlas_office_answer(uuid,text) FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION public.atlas_office_decide_proposal(uuid,boolean,boolean) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.atlas_office_answer(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_office_decide_proposal(uuid,boolean,boolean) TO authenticated;

-- A durable, conservative token reservation bounds calls, including crashes/provider errors.
CREATE FUNCTION public.atlas_office_reserve(p_owner_id uuid,p_day date,p_tokens integer) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.atlas_office_state;c public.atlas_office_config;lease uuid;
BEGIN
  SELECT * INTO c FROM public.atlas_office_config WHERE id='atlas' AND owner_id=p_owner_id AND enabled;
  IF c.id IS NULL OR p_day<>(now() AT TIME ZONE 'America/Sao_Paulo')::date OR p_tokens NOT BETWEEN 1 AND 60000 THEN RETURN NULL; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.atlas_settings a JOIN public.profiles p ON p.id=a.owner_id WHERE a.id='atlas' AND a.enabled AND a.owner_id=p_owner_id AND p.status='active' AND p.role IN ('admin','superadmin')) THEN RETURN NULL; END IF;
  INSERT INTO public.atlas_office_state(owner_id,usage_day) VALUES(p_owner_id,p_day) ON CONFLICT(owner_id) DO NOTHING;
  SELECT * INTO s FROM public.atlas_office_state WHERE owner_id=p_owner_id FOR UPDATE;
  IF s.analysis_reservation IS NOT NULL AND s.reservation_until>now() THEN RETURN NULL; END IF;
  IF s.usage_day IS DISTINCT FROM p_day THEN
    s.calls_today:=0;s.tokens_today:=0;s.reservation_tokens:=0;
  ELSIF s.analysis_reservation IS NOT NULL THEN
    s.tokens_today:=s.tokens_today+s.reservation_tokens;
  END IF;
  IF s.calls_today>=c.max_analyses_per_day OR s.tokens_today+p_tokens>c.max_tokens_per_day THEN
    UPDATE public.atlas_office_state SET usage_day=p_day,calls_today=s.calls_today,tokens_today=s.tokens_today,analysis_reservation=NULL,reservation_tokens=0,reservation_until=NULL WHERE owner_id=p_owner_id;
    RETURN NULL;
  END IF;
  lease:=gen_random_uuid();
  UPDATE public.atlas_office_state SET usage_day=p_day,calls_today=s.calls_today+1,tokens_today=s.tokens_today,analysis_reservation=lease,reservation_tokens=p_tokens,reservation_until=now()+interval '150 seconds' WHERE owner_id=p_owner_id;
  RETURN lease;
END $$;
CREATE FUNCTION public.atlas_office_finish_reservation(p_owner_id uuid,p_lease uuid,p_actual_tokens integer DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.atlas_office_state;
BEGIN
  SELECT * INTO s FROM public.atlas_office_state WHERE owner_id=p_owner_id FOR UPDATE;
  IF s.analysis_reservation IS DISTINCT FROM p_lease OR p_lease IS NULL THEN RETURN false; END IF;
  UPDATE public.atlas_office_state SET tokens_today=tokens_today+CASE WHEN p_actual_tokens IS NULL THEN reservation_tokens ELSE greatest(p_actual_tokens,0) END,analysis_reservation=NULL,reservation_tokens=0,reservation_until=NULL WHERE owner_id=p_owner_id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.atlas_office_reserve(uuid,date,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.atlas_office_finish_reservation(uuid,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_office_reserve(uuid,date,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.atlas_office_finish_reservation(uuid,uuid,integer) TO service_role;
COMMIT;
