-- Private pilot only until a separately reviewed promotion. Never changes tarefas.
BEGIN;
CREATE TABLE public.atlas_team_config(owner_id uuid PRIMARY KEY REFERENCES public.profiles(id),enabled boolean NOT NULL DEFAULT false);
CREATE TABLE public.atlas_team_hours(
 owner_id uuid NOT NULL REFERENCES public.profiles(id),person_id uuid NOT NULL REFERENCES public.profiles(id),
 start_time time NOT NULL DEFAULT '08:00',end_time time NOT NULL DEFAULT '17:00',PRIMARY KEY(owner_id,person_id),CHECK(start_time<end_time));
CREATE TABLE public.atlas_team_threads(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES public.profiles(id),client_id uuid NOT NULL REFERENCES public.clientes(id),
 task_id uuid REFERENCES public.tarefas(id) ON DELETE SET NULL,account_person_id uuid NOT NULL REFERENCES public.profiles(id),current_person_id uuid NOT NULL REFERENCES public.profiles(id),
 title text NOT NULL CHECK(char_length(title) BETWEEN 1 AND 200),shared_context jsonb NOT NULL DEFAULT '{}',source_key text NOT NULL,
 state text NOT NULL DEFAULT 'awaiting_reply' CHECK(state IN('awaiting_reply','waiting_review','needs_owner','delivery_review','closed')),
 next_review_at timestamptz,expected_at timestamptz,summary text,evidence_url text,
 revision integer NOT NULL DEFAULT 1,reminder_day date,reminders_today integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(owner_id,source_key));
CREATE TABLE public.atlas_team_messages(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),thread_id uuid NOT NULL REFERENCES public.atlas_team_threads(id) ON DELETE CASCADE,
 role text NOT NULL CHECK(role IN('atlas','human')),actor_id uuid REFERENCES public.profiles(id),content text NOT NULL CHECK(char_length(content) BETWEEN 1 AND 6000),
 proposal jsonb,created_at timestamptz NOT NULL DEFAULT now(),CHECK((role='human')=(actor_id IS NOT NULL)));
CREATE INDEX atlas_team_messages_thread ON public.atlas_team_messages(thread_id,created_at,id);
CREATE TABLE public.atlas_team_requests(
 id uuid PRIMARY KEY,thread_id uuid NOT NULL REFERENCES public.atlas_team_threads(id) ON DELETE CASCADE,actor_id uuid NOT NULL REFERENCES public.profiles(id),session_id uuid NOT NULL,
 message_id uuid NOT NULL REFERENCES public.atlas_team_messages(id),thread_revision integer NOT NULL,state text NOT NULL DEFAULT 'processing' CHECK(state IN('processing','completed','failed')),
 result jsonb,usage jsonb,applied boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX atlas_team_request_quota ON public.atlas_team_requests(actor_id,created_at);
CREATE TABLE public.atlas_team_reads(thread_id uuid NOT NULL REFERENCES public.atlas_team_threads(id) ON DELETE CASCADE,person_id uuid NOT NULL REFERENCES public.profiles(id),read_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(thread_id,person_id));

CREATE FUNCTION private.atlas_team_human() RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND private.planeje_live_session() AND auth.jwt()->>'session_id' IS NOT NULL AND auth.jwt()->>'planeje_server_delegate' IS NULL
 AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND status='active' AND role IN('admin','superadmin','colaborador'));
$$;
CREATE FUNCTION private.atlas_team_member(t public.atlas_team_threads) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT private.atlas_team_human() AND (auth.uid() IN(t.owner_id,t.account_person_id) OR EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id AND auth.uid()=ANY(x.assignee_ids)));
$$;
-- Narrow private writers manufacture Atlas messages and guard transitions; direct human writes are never granted.
CREATE FUNCTION private.atlas_team_assert(p_id uuid) RETURNS public.atlas_team_threads LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.atlas_team_threads;
BEGIN
 SELECT * INTO t FROM public.atlas_team_threads WHERE id=p_id FOR UPDATE;
 IF t.id IS NULL OR NOT private.atlas_team_member(t) THEN RAISE EXCEPTION 'Conversa indisponível nesta sessão.' USING ERRCODE='42501'; END IF;
 RETURN t;
END $$;

ALTER TABLE public.atlas_team_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_team_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_team_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_team_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_team_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_team_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.atlas_team_config,public.atlas_team_hours,public.atlas_team_threads,public.atlas_team_messages,public.atlas_team_requests,public.atlas_team_reads FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.atlas_team_config,public.atlas_team_hours,public.atlas_team_threads,public.atlas_team_messages,public.atlas_team_requests,public.atlas_team_reads TO authenticated;
GRANT ALL ON public.atlas_team_config,public.atlas_team_hours,public.atlas_team_threads,public.atlas_team_messages,public.atlas_team_requests,public.atlas_team_reads TO service_role;
CREATE POLICY atlas_team_config_read ON public.atlas_team_config FOR SELECT TO authenticated USING(private.atlas_team_human() AND (owner_id=auth.uid() OR EXISTS(SELECT 1 FROM public.atlas_team_threads t WHERE t.owner_id=atlas_team_config.owner_id)));
CREATE POLICY atlas_team_hours_read ON public.atlas_team_hours FOR SELECT TO authenticated USING(private.atlas_team_human() AND (person_id=auth.uid() OR owner_id=auth.uid() OR EXISTS(SELECT 1 FROM public.atlas_team_threads t WHERE t.owner_id=atlas_team_hours.owner_id AND (t.account_person_id=atlas_team_hours.person_id OR EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id AND atlas_team_hours.person_id=ANY(x.assignee_ids))))));
CREATE POLICY atlas_team_threads_read ON public.atlas_team_threads FOR SELECT TO authenticated USING(private.atlas_team_member(atlas_team_threads));
CREATE POLICY atlas_team_messages_read ON public.atlas_team_messages FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.atlas_team_threads t WHERE t.id=thread_id));
CREATE POLICY atlas_team_requests_read ON public.atlas_team_requests FOR SELECT TO authenticated USING(private.atlas_team_human() AND actor_id=auth.uid() AND EXISTS(SELECT 1 FROM public.atlas_team_threads t WHERE t.id=thread_id));
CREATE POLICY atlas_team_reads_read ON public.atlas_team_reads FOR SELECT TO authenticated USING(private.atlas_team_human() AND person_id=auth.uid());

CREATE FUNCTION public.atlas_team_list() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY updated_at DESC),'[]') FROM (
 SELECT t.*,c.empresa AS client_name,p.full_name AS person_name,
 (SELECT max(m.created_at) FROM public.atlas_team_messages m WHERE m.thread_id=t.id AND m.role='atlas') AS last_atlas_at,
 (SELECT r.read_at FROM public.atlas_team_reads r WHERE r.thread_id=t.id AND r.person_id=auth.uid()) AS read_at
 FROM public.atlas_team_threads t JOIN public.clientes c ON c.id=t.client_id JOIN public.profiles p ON p.id=t.current_person_id
 WHERE t.state<>'closed' ORDER BY t.updated_at DESC LIMIT 100) x;
$$;
CREATE FUNCTION public.atlas_team_context(p_thread uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t public.atlas_team_threads; result jsonb;
BEGIN
 SELECT * INTO t FROM public.atlas_team_threads WHERE id=p_thread;
 IF t.id IS NULL THEN RAISE EXCEPTION 'Conversa indisponível.' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('thread',to_jsonb(t),'client_name',c.empresa,'actor_id',auth.uid(),'is_owner',auth.uid()=t.owner_id,
 'messages',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at,x.id),'[]') FROM(SELECT * FROM public.atlas_team_messages m WHERE m.thread_id=t.id ORDER BY m.created_at DESC,m.id DESC LIMIT 40)x),
 'people',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'hours',coalesce((SELECT jsonb_build_object('start_time',h.start_time,'end_time',h.end_time) FROM public.atlas_team_hours h WHERE h.owner_id=t.owner_id AND h.person_id=p.id),'{"start_time":"08:00","end_time":"17:00"}'::jsonb))),'[]') FROM public.profiles p WHERE p.status='active' AND (p.id IN(t.owner_id,t.account_person_id) OR EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id AND p.id=ANY(x.assignee_ids)))),
 'task',(SELECT jsonb_build_object('id',x.id,'title',x.title,'description',left(x.description,2400),'status',s.label,'terminal',coalesce(s.is_terminal,false),'due_date',x.due_date,'assignee_ids',x.assignee_ids,'production_delivered_at',x.production_delivered_at) FROM public.tarefas x LEFT JOIN public.task_statuses s ON s.value=x.status WHERE x.id=t.task_id),
 'hours',coalesce((SELECT jsonb_build_object('start_time',h.start_time,'end_time',h.end_time) FROM public.atlas_team_hours h WHERE h.owner_id=t.owner_id AND h.person_id=auth.uid()),'{"start_time":"08:00","end_time":"17:00"}'::jsonb),
 'queried_at',now()) INTO result FROM public.clientes c WHERE c.id=t.client_id;
 RETURN result;
END $$;
CREATE FUNCTION private.atlas_team_create(p_client uuid,p_task uuid,p_account uuid,p_source text,p_context jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.tarefas; thread uuid; title text;
BEGIN
 IF NOT private.atlas_demand_owner() OR NOT EXISTS(SELECT 1 FROM public.atlas_team_config WHERE owner_id=auth.uid() AND enabled) THEN RAISE EXCEPTION 'Piloto indisponível.' USING ERRCODE='42501'; END IF;
 SELECT * INTO t FROM public.tarefas WHERE id=p_task AND client_id=p_client;
 IF t.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=p_client AND etapa='closed') OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_account AND status='active' AND role IN('admin','superadmin','colaborador')) THEN RAISE EXCEPTION 'Cliente, tarefa ou responsável indisponível.'; END IF;
 IF char_length(p_source) NOT BETWEEN 1 AND 500 OR octet_length(p_context::text)>10000 THEN RAISE EXCEPTION 'Fonte acima do limite.'; END IF;
 SELECT id INTO thread FROM public.atlas_team_threads WHERE owner_id=auth.uid() AND source_key=p_source;
 IF thread IS NOT NULL THEN RETURN thread; END IF;
 PERFORM public.atlas_task_followup_watch(t.id,md5(to_jsonb(t)::text));
 title:=left(t.title,200);
 INSERT INTO public.atlas_team_threads(owner_id,client_id,task_id,account_person_id,current_person_id,title,shared_context,source_key,next_review_at)
 VALUES(auth.uid(),p_client,p_task,p_account,p_account,title,p_context,p_source,now()+interval '1 hour') RETURNING id INTO thread;
 INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(thread,'atlas','Oi! Preciso de você para conferir: '||title||'. O que já foi apurado e quem está conduzindo? Vamos combinar o próximo retorno.');
 RETURN thread;
END $$;
CREATE FUNCTION public.atlas_team_create(p_client uuid,p_task uuid,p_account uuid,p_source text,p_context jsonb) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.atlas_team_create(p_client,p_task,p_account,p_source,p_context); $$;

CREATE FUNCTION private.atlas_team_reserve(p_thread uuid,p_id uuid,p_text text,p_revision integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.atlas_team_threads;r public.atlas_team_requests; msg uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('atlas-team:'||auth.uid()::text,0));
 t:=private.atlas_team_assert(p_thread);
 IF NOT EXISTS(SELECT 1 FROM public.atlas_team_config WHERE owner_id=t.owner_id AND enabled) THEN RAISE EXCEPTION 'Acompanhamento pausado.'; END IF;
 SELECT * INTO r FROM public.atlas_team_requests WHERE id=p_id;
 IF r.id IS NOT NULL THEN
  IF r.actor_id<>auth.uid() OR r.thread_id<>p_thread OR NOT EXISTS(SELECT 1 FROM public.atlas_team_messages WHERE id=r.message_id AND content=btrim(p_text)) THEN RAISE EXCEPTION 'Identificador já utilizado.'; END IF;
  RETURN jsonb_build_object('claimed',false,'state',r.state,'result',r.result);
 END IF;
 IF auth.uid() NOT IN(t.owner_id,t.current_person_id) OR t.state IN('delivery_review','closed') THEN RAISE EXCEPTION 'Aguarde sua vez ou a revisão da entrega.'; END IF;
 IF t.revision<>p_revision THEN RAISE EXCEPTION 'A conversa mudou. Atualize antes de responder.' USING ERRCODE='40001'; END IF;
 IF char_length(btrim(p_text)) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'Escreva uma mensagem de até 4.000 caracteres.'; END IF;
 IF EXISTS(SELECT 1 FROM public.atlas_team_requests WHERE thread_id=t.id AND state='processing' AND created_at>now()-interval '2 minutes') THEN RAISE EXCEPTION 'Aguarde a resposta em andamento.'; END IF;
 UPDATE public.atlas_team_requests SET state='failed' WHERE thread_id=t.id AND state='processing';
 IF (SELECT count(*) FROM public.atlas_team_requests WHERE actor_id=auth.uid() AND (created_at AT TIME ZONE 'America/Sao_Paulo')::date=(now() AT TIME ZONE 'America/Sao_Paulo')::date)>=20 THEN RAISE EXCEPTION 'Limite de 20 respostas de IA por pessoa/dia no piloto.'; END IF;
 INSERT INTO public.atlas_team_messages(thread_id,role,actor_id,content) VALUES(t.id,'human',auth.uid(),btrim(p_text)) RETURNING id INTO msg;
 UPDATE public.atlas_team_threads SET revision=revision+1,updated_at=now() WHERE id=t.id RETURNING * INTO t;
 INSERT INTO public.atlas_team_requests(id,thread_id,actor_id,session_id,message_id,thread_revision) VALUES(p_id,t.id,auth.uid(),(auth.jwt()->>'session_id')::uuid,msg,t.revision);
 RETURN jsonb_build_object('claimed',true,'state','processing','revision',t.revision);
END $$;
CREATE FUNCTION public.atlas_team_reserve(p_thread uuid,p_id uuid,p_text text,p_revision integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.atlas_team_reserve(p_thread,p_id,p_text,p_revision); $$;

CREATE FUNCTION private.atlas_team_finish(p_id uuid,p_result jsonb,p_usage jsonb,p_error boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.atlas_team_requests;t public.atlas_team_threads; msg uuid; target uuid;
BEGIN
 SELECT * INTO r FROM public.atlas_team_requests WHERE id=p_id;
 SELECT * INTO t FROM public.atlas_team_threads WHERE id=r.thread_id FOR UPDATE;
 SELECT * INTO r FROM public.atlas_team_requests WHERE id=p_id FOR UPDATE;
 IF r.id IS NULL OR r.state<>'processing' THEN RETURN jsonb_build_object('saved',false); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.atlas_team_config WHERE owner_id=t.owner_id AND enabled) OR r.actor_id NOT IN(t.owner_id,t.account_person_id) AND NOT EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id AND r.actor_id=ANY(x.assignee_ids)) THEN RAISE EXCEPTION 'Participação não está mais ativa.' USING ERRCODE='42501'; END IF;
 IF p_error THEN UPDATE public.atlas_team_requests SET state='failed',usage=p_usage WHERE id=r.id; RETURN jsonb_build_object('saved',false); END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id=r.session_id AND user_id=r.actor_id) OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=r.actor_id AND status='active' AND role IN('admin','superadmin','colaborador')) OR t.revision<>r.thread_revision OR t.current_person_id<>r.actor_id AND t.owner_id<>r.actor_id THEN RAISE EXCEPTION 'Sessão ou conversa mudou.' USING ERRCODE='42501'; END IF;
 IF char_length(p_result->>'reply') NOT BETWEEN 1 AND 4000 OR p_result->>'update_kind' NOT IN('clarify','received','progress','blocked','needs_owner','delivered') OR char_length(p_result->>'summary')>2000 THEN RAISE EXCEPTION 'Resposta inválida.'; END IF;
 target:=nullif(p_result->>'next_person_id','')::uuid;
 IF target IS NOT NULL AND target NOT IN(t.account_person_id,t.owner_id) AND NOT EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id AND target=ANY(x.assignee_ids)) THEN RAISE EXCEPTION 'Destinatário fora do acompanhamento.'; END IF;
 IF nullif(p_result->>'evidence_url','') IS NOT NULL AND (p_result->>'evidence_url' !~ '^https?://' OR char_length(p_result->>'evidence_url')>2000) THEN RAISE EXCEPTION 'Link inválido.'; END IF;
 INSERT INTO public.atlas_team_messages(thread_id,role,content,proposal) VALUES(t.id,'atlas',p_result->>'reply',p_result||jsonb_build_object('request_id',r.id)) RETURNING id INTO msg;
 UPDATE public.atlas_team_requests SET state='completed',result=p_result,usage=p_usage WHERE id=r.id;
 UPDATE public.atlas_team_threads SET revision=revision+1,updated_at=now() WHERE id=t.id;
 RETURN jsonb_build_object('saved',true,'message_id',msg);
END $$;
CREATE FUNCTION public.atlas_team_finish(p_id uuid,p_result jsonb,p_usage jsonb,p_error boolean DEFAULT false) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.atlas_team_finish(p_id,p_result,p_usage,p_error); $$;
REVOKE ALL ON FUNCTION private.atlas_team_finish(uuid,jsonb,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.atlas_team_finish(uuid,jsonb,jsonb,boolean) TO service_role;

CREATE FUNCTION private.atlas_team_action(p_thread uuid,p_action text,p_revision integer,p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.atlas_team_threads;r public.atlas_team_requests; target uuid; review timestamptz; expected timestamptz; kind text; body text;
BEGIN
 t:=private.atlas_team_assert(p_thread);
 IF p_action='read' THEN INSERT INTO public.atlas_team_reads(thread_id,person_id) VALUES(t.id,auth.uid()) ON CONFLICT(thread_id,person_id) DO UPDATE SET read_at=now(); RETURN '{"ok":true}'; END IF;
 IF p_action='confirm' AND EXISTS(SELECT 1 FROM public.atlas_team_requests WHERE id=(p_data->>'request_id')::uuid AND thread_id=t.id AND actor_id=auth.uid() AND applied) THEN RETURN '{"ok":true,"replayed":true}'; END IF;
 IF t.revision<>p_revision THEN RAISE EXCEPTION 'A conversa mudou. Atualize antes de confirmar.' USING ERRCODE='40001'; END IF;
 IF p_action='review_delivery' THEN
  IF auth.uid()<>t.owner_id OR t.state<>'delivery_review' THEN RAISE EXCEPTION 'Revisão exclusiva do dono.' USING ERRCODE='42501'; END IF;
  IF NOT coalesce((p_data->>'confirmed')::boolean,false) OR char_length(btrim(coalesce(p_data->>'note','')))=0 THEN RAISE EXCEPTION 'Registre o que conferiu antes de revisar.'; END IF;
  UPDATE public.atlas_team_threads SET state=CASE WHEN (p_data->>'accepted')::boolean THEN 'closed' ELSE 'awaiting_reply' END,current_person_id=CASE WHEN (p_data->>'accepted')::boolean THEN current_person_id ELSE account_person_id END,next_review_at=CASE WHEN (p_data->>'accepted')::boolean THEN NULL ELSE now()+interval '1 hour' END,revision=revision+1,updated_at=now() WHERE id=t.id;
  INSERT INTO public.atlas_team_messages(thread_id,role,actor_id,content) VALUES(t.id,'human',auth.uid(),'Revisão do dono: '||left(p_data->>'note',2000));
  RETURN '{"ok":true,"task_unchanged":true}';
 END IF;
 IF auth.uid() NOT IN(t.owner_id,t.current_person_id) THEN RAISE EXCEPTION 'Ação indisponível para esta pessoa.' USING ERRCODE='42501'; END IF;
 IF p_action='snooze' THEN
  review:=(p_data->>'review_at')::timestamptz;
  IF review<=now() OR review>now()+interval '7 days' THEN RAISE EXCEPTION 'Adiamento inválido.'; END IF;
  UPDATE public.atlas_team_threads SET next_review_at=review,revision=revision+1,updated_at=now() WHERE id=t.id;
  INSERT INTO public.atlas_team_reads(thread_id,person_id) VALUES(t.id,auth.uid()) ON CONFLICT(thread_id,person_id) DO UPDATE SET read_at=now();
  RETURN '{"ok":true}';
 END IF;
 IF p_action<>'confirm' THEN RAISE EXCEPTION 'Ação inválida.'; END IF;
 SELECT * INTO r FROM public.atlas_team_requests WHERE id=(p_data->>'request_id')::uuid AND thread_id=t.id AND actor_id=auth.uid() FOR UPDATE;
 IF r.applied THEN RETURN '{"ok":true,"replayed":true}'; END IF;
 IF r.id IS NULL OR r.state<>'completed' OR NOT EXISTS(SELECT 1 FROM public.atlas_team_messages m WHERE m.thread_id=t.id AND m.proposal->>'request_id'=r.id::text AND m.id=(SELECT id FROM public.atlas_team_messages WHERE thread_id=t.id ORDER BY created_at DESC,id DESC LIMIT 1)) THEN RAISE EXCEPTION 'Sugestão desatualizada.'; END IF;
 kind:=r.result->>'update_kind';
 IF kind='clarify' THEN RAISE EXCEPTION 'Responda à pergunta antes de combinar a revisão.'; END IF;
 target:=coalesce(nullif(r.result->>'next_person_id','')::uuid,t.current_person_id);
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=target AND status='active' AND role IN('superadmin','admin','colaborador')) OR target NOT IN(t.account_person_id,t.owner_id) AND NOT EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id AND target=ANY(x.assignee_ids)) THEN RAISE EXCEPTION 'Destinatário indisponível.'; END IF;
 review:=coalesce(nullif(p_data->>'review_at','')::timestamptz,nullif(r.result->>'review_at','')::timestamptz);
 expected:=nullif(r.result->>'expected_at','')::timestamptz;
 IF review IS NULL AND kind NOT IN('needs_owner','delivered') THEN RAISE EXCEPTION 'Combine uma data para revisar o andamento.'; END IF;
 IF review IS NOT NULL AND (review<=now() OR review>now()+interval '90 days') THEN RAISE EXCEPTION 'Revisão deve estar no futuro, em até 90 dias.'; END IF;
 IF review IS NOT NULL AND (extract(isodow FROM review AT TIME ZONE 'America/Sao_Paulo')>5 OR (review AT TIME ZONE 'America/Sao_Paulo')::time NOT BETWEEN coalesce((SELECT start_time FROM public.atlas_team_hours WHERE owner_id=t.owner_id AND person_id=target),'08:00'::time) AND coalesce((SELECT end_time-interval '1 second' FROM public.atlas_team_hours WHERE owner_id=t.owner_id AND person_id=target),'16:59:59'::time)) THEN RAISE EXCEPTION 'Escolha a revisão dentro do expediente do responsável.'; END IF;
 IF EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id AND auth.uid()=ANY(x.assignee_ids)) AND EXISTS(SELECT 1 FROM public.atlas_demands d WHERE d.task_id=t.task_id AND d.state='linked') THEN
  PERFORM public.atlas_task_followup_update(t.task_id,kind,left(coalesce(r.result->>'summary','Atualização confirmada na conversa.')||CASE WHEN review IS NOT NULL THEN E'\nRevisão de acompanhamento: '||to_char(review AT TIME ZONE 'America/Sao_Paulo','DD/MM HH24:MI') ELSE '' END||CASE WHEN nullif(r.result->>'evidence_url','') IS NOT NULL THEN E'\nEvidência informada: '||(r.result->>'evidence_url') ELSE '' END,4000),r.id,NULL);
 END IF;
 UPDATE public.atlas_team_requests SET applied=true WHERE id=r.id;
 UPDATE public.atlas_team_threads SET current_person_id=CASE WHEN kind IN('needs_owner','delivered') THEN owner_id ELSE target END,state=CASE kind WHEN 'needs_owner' THEN 'needs_owner' WHEN 'delivered' THEN 'delivery_review' ELSE CASE WHEN target<>current_person_id THEN 'awaiting_reply' ELSE 'waiting_review' END END,next_review_at=CASE WHEN kind IN('needs_owner','delivered') THEN NULL ELSE review END,expected_at=expected,summary=r.result->>'summary',evidence_url=nullif(r.result->>'evidence_url',''),revision=revision+1,reminder_day=NULL,reminders_today=0,updated_at=now() WHERE id=t.id;
 body:=CASE WHEN kind='delivered' THEN 'Entrega informada. O dono vai conferir a evidência; a tarefa não foi concluída automaticamente.' WHEN kind='needs_owner' THEN 'Decisão encaminhada ao dono neste acompanhamento.' WHEN target<>t.current_person_id THEN 'Oi! O responsável pela conta pediu sua confirmação. '||coalesce(r.result->>'summary','')||' Você consegue confirmar o andamento e combinar o próximo retorno?' ELSE 'Combinado registrado. Vou voltar na revisão: '||to_char(review AT TIME ZONE 'America/Sao_Paulo','DD/MM HH24:MI')||'. O prazo oficial da tarefa permanece igual.' END;
 INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(t.id,'atlas',body);
 RETURN jsonb_build_object('ok',true,'review_at',review,'task_unchanged',true);
END $$;
CREATE FUNCTION public.atlas_team_action(p_thread uuid,p_action text,p_revision integer,p_data jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.atlas_team_action(p_thread,p_action,p_revision,p_data); $$;

CREATE FUNCTION public.atlas_team_worker_snapshot() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('thread',to_jsonb(t),'task_exists',EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id),'task_terminal',EXISTS(SELECT 1 FROM public.tarefas x JOIN public.task_statuses s ON s.value=x.status AND s.is_terminal WHERE x.id=t.task_id AND x.client_id=t.client_id),'recipient_active',p.status='active' AND p.role IN('admin','superadmin','colaborador'),'recipient_valid',t.current_person_id IN(t.owner_id,t.account_person_id) OR EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id AND t.current_person_id=ANY(x.assignee_ids)),'hours',coalesce((SELECT jsonb_build_object('start_time',h.start_time,'end_time',h.end_time) FROM public.atlas_team_hours h WHERE h.owner_id=t.owner_id AND h.person_id=t.current_person_id),'{"start_time":"08:00","end_time":"17:00"}'::jsonb))),'[]') FROM public.atlas_team_threads t JOIN public.atlas_team_config c ON c.owner_id=t.owner_id AND c.enabled LEFT JOIN public.profiles p ON p.id=t.current_person_id WHERE t.state IN('awaiting_reply','waiting_review') AND NOT EXISTS(SELECT 1 FROM public.atlas_team_requests r WHERE r.thread_id=t.id AND r.state='processing' AND r.created_at>now()-interval '2 minutes');
$$;
CREATE FUNCTION public.atlas_team_worker_apply(p_thread uuid,p_revision integer,p_plan jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t public.atlas_team_threads;
BEGIN
 SELECT * INTO t FROM public.atlas_team_threads WHERE id=p_thread FOR UPDATE;
 IF t.revision<>p_revision OR t.state NOT IN('awaiting_reply','waiting_review') OR NOT EXISTS(SELECT 1 FROM public.atlas_team_config WHERE owner_id=t.owner_id AND enabled) THEN RETURN false; END IF;
 INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(t.id,'atlas',left(p_plan->>'text',4000));
 IF p_plan->>'kind' IN('unavailable','delivery_review') THEN
  UPDATE public.atlas_team_threads SET state=CASE WHEN p_plan->>'kind'='delivery_review' THEN 'delivery_review' ELSE 'needs_owner' END,current_person_id=owner_id,next_review_at=NULL,revision=revision+1,updated_at=now() WHERE id=t.id;RETURN true;
 END IF;
 UPDATE public.atlas_team_threads SET state='awaiting_reply',next_review_at=(p_plan->>'next_review_at')::timestamptz,reminder_day=(p_plan->>'reminder_day')::date,reminders_today=(p_plan->>'reminders_today')::integer,revision=revision+1,updated_at=now() WHERE id=t.id;
 RETURN true;
END $$;

REVOKE ALL ON FUNCTION private.atlas_team_human(),private.atlas_team_member(public.atlas_team_threads),private.atlas_team_assert(uuid),private.atlas_team_create(uuid,uuid,uuid,text,jsonb),private.atlas_team_reserve(uuid,uuid,text,integer),private.atlas_team_action(uuid,text,integer,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.atlas_team_human(),private.atlas_team_member(public.atlas_team_threads),private.atlas_team_assert(uuid),private.atlas_team_create(uuid,uuid,uuid,text,jsonb),private.atlas_team_reserve(uuid,uuid,text,integer),private.atlas_team_action(uuid,text,integer,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.atlas_team_list(),public.atlas_team_context(uuid),public.atlas_team_create(uuid,uuid,uuid,text,jsonb),public.atlas_team_reserve(uuid,uuid,text,integer),public.atlas_team_action(uuid,text,integer,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.atlas_team_list(),public.atlas_team_context(uuid),public.atlas_team_create(uuid,uuid,uuid,text,jsonb),public.atlas_team_reserve(uuid,uuid,text,integer),public.atlas_team_action(uuid,text,integer,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.atlas_team_finish(uuid,jsonb,jsonb,boolean),public.atlas_team_worker_snapshot(),public.atlas_team_worker_apply(uuid,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_team_finish(uuid,jsonb,jsonb,boolean),public.atlas_team_worker_snapshot(),public.atlas_team_worker_apply(uuid,integer,jsonb) TO service_role;

-- Dictation is scoped to the same human participant and never submits a chat message.
CREATE TABLE public.atlas_team_dictations(id uuid PRIMARY KEY,thread_id uuid NOT NULL REFERENCES public.atlas_team_threads(id) ON DELETE CASCADE,actor_id uuid NOT NULL REFERENCES public.profiles(id),session_id uuid NOT NULL,fingerprint text NOT NULL,state text NOT NULL DEFAULT 'processing' CHECK(state IN('processing','completed','failed')),transcript text,usage jsonb,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.atlas_team_dictations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.atlas_team_dictations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.atlas_team_dictations TO authenticated;
GRANT ALL ON public.atlas_team_dictations TO service_role;
CREATE POLICY atlas_team_dictations_read ON public.atlas_team_dictations FOR SELECT TO authenticated USING(private.atlas_team_human() AND actor_id=auth.uid() AND EXISTS(SELECT 1 FROM public.atlas_team_threads t WHERE t.id=thread_id));
CREATE FUNCTION private.atlas_team_dictation_reserve(p_thread uuid,p_id uuid,p_fingerprint text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.atlas_team_threads;r public.atlas_team_dictations;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('atlas-team-audio:'||auth.uid()::text,0));
 t:=private.atlas_team_assert(p_thread);
 IF auth.uid() NOT IN(t.owner_id,t.current_person_id) OR NOT EXISTS(SELECT 1 FROM public.atlas_team_config WHERE owner_id=t.owner_id AND enabled) THEN RAISE EXCEPTION 'Áudio indisponível nesta conversa.' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.atlas_team_dictations WHERE id=p_id;
 IF r.id IS NOT NULL THEN
  IF r.actor_id<>auth.uid() OR r.thread_id<>t.id OR r.fingerprint<>p_fingerprint THEN RAISE EXCEPTION 'Identificador já utilizado.'; END IF;
  RETURN jsonb_build_object('claimed',false,'state',r.state,'transcript',CASE WHEN r.created_at>now()-interval '1 day' THEN r.transcript ELSE NULL END);
 END IF;
 IF char_length(p_fingerprint)<>64 OR (SELECT count(*) FROM public.atlas_team_dictations WHERE actor_id=auth.uid() AND (created_at AT TIME ZONE 'America/Sao_Paulo')::date=(now() AT TIME ZONE 'America/Sao_Paulo')::date)>=40 THEN RAISE EXCEPTION 'Limite de ditados do piloto atingido.'; END IF;
 INSERT INTO public.atlas_team_dictations(id,thread_id,actor_id,session_id,fingerprint) VALUES(p_id,t.id,auth.uid(),(auth.jwt()->>'session_id')::uuid,p_fingerprint);
 UPDATE public.atlas_team_dictations SET transcript=NULL WHERE actor_id=auth.uid() AND created_at<now()-interval '1 day';
 RETURN '{"claimed":true,"state":"processing"}';
END $$;
CREATE FUNCTION public.atlas_team_dictation_reserve(p_thread uuid,p_id uuid,p_fingerprint text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.atlas_team_dictation_reserve(p_thread,p_id,p_fingerprint); $$;
CREATE FUNCTION private.atlas_team_dictation_finish(p_id uuid,p_text text,p_usage jsonb,p_error boolean DEFAULT false) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.atlas_team_dictations;t public.atlas_team_threads;
BEGIN
 SELECT * INTO r FROM public.atlas_team_dictations WHERE id=p_id FOR UPDATE;
 SELECT * INTO t FROM public.atlas_team_threads WHERE id=r.thread_id;
 IF r.id IS NULL OR r.state<>'processing' THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.atlas_team_config WHERE owner_id=t.owner_id AND enabled) OR r.actor_id NOT IN(t.owner_id,t.account_person_id) AND NOT EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id AND r.actor_id=ANY(x.assignee_ids)) THEN RAISE EXCEPTION 'Participação não está mais ativa.' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id=r.session_id AND user_id=r.actor_id) OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=r.actor_id AND status='active' AND role IN('superadmin','admin','colaborador')) OR r.actor_id NOT IN(t.owner_id,t.current_person_id) THEN RAISE EXCEPTION 'Sessão indisponível.' USING ERRCODE='42501'; END IF;
 IF NOT p_error AND char_length(p_text) NOT BETWEEN 1 AND 6000 THEN RAISE EXCEPTION 'Transcrição inválida.'; END IF;
 UPDATE public.atlas_team_dictations SET state=CASE WHEN p_error THEN 'failed' ELSE 'completed' END,transcript=CASE WHEN p_error THEN NULL ELSE p_text END,usage=p_usage WHERE id=p_id;
 RETURN true;
END $$;
CREATE FUNCTION public.atlas_team_dictation_finish(p_id uuid,p_text text,p_usage jsonb,p_error boolean DEFAULT false) RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.atlas_team_dictation_finish(p_id,p_text,p_usage,p_error); $$;
REVOKE ALL ON FUNCTION private.atlas_team_dictation_finish(uuid,text,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.atlas_team_dictation_finish(uuid,text,jsonb,boolean) TO service_role;
REVOKE ALL ON FUNCTION private.atlas_team_dictation_reserve(uuid,uuid,text),public.atlas_team_dictation_reserve(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.atlas_team_dictation_reserve(uuid,uuid,text),public.atlas_team_dictation_reserve(uuid,uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.atlas_team_dictation_finish(uuid,text,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_team_dictation_finish(uuid,text,jsonb,boolean) TO service_role;
COMMIT;
