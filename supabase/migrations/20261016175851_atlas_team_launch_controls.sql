-- Production launch controls; also compatible with the existing private pilot.
BEGIN;
CREATE UNIQUE INDEX atlas_team_one_active_task ON public.atlas_team_threads(owner_id,task_id) WHERE task_id IS NOT NULL AND state<>'closed';
CREATE OR REPLACE FUNCTION public.atlas_team_context(p_thread uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t public.atlas_team_threads; result jsonb;
BEGIN
 SELECT * INTO t FROM public.atlas_team_threads WHERE id=p_thread;
 IF t.id IS NULL THEN RAISE EXCEPTION 'Conversa indisponível.' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('thread',to_jsonb(t),'client_name',c.empresa,'actor_id',auth.uid(),'is_owner',auth.uid()=t.owner_id,
 'messages',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at,x.id),'[]') FROM(SELECT * FROM public.atlas_team_messages m WHERE m.thread_id=t.id ORDER BY m.created_at DESC,m.id DESC LIMIT 40)x),
 'people',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'hours',coalesce((SELECT jsonb_build_object('start_time',h.start_time,'end_time',h.end_time) FROM public.atlas_team_hours h WHERE h.owner_id=t.owner_id AND h.person_id=p.id),'{"start_time":"08:00","end_time":"17:00"}'::jsonb))),'[]') FROM public.profiles p WHERE p.status='active' AND (p.id IN(t.owner_id,t.account_person_id) OR EXISTS(SELECT 1 FROM public.tarefas x WHERE x.id=t.task_id AND x.client_id=t.client_id AND p.id=ANY(x.assignee_ids)))),
 'task',(SELECT jsonb_build_object('id',x.id,'title',x.title,'description',left(x.description,2400),'status',s.label,'terminal',coalesce(s.is_terminal,false),'due_date',x.due_date,'assignee_ids',x.assignee_ids,'production_delivered_at',x.production_delivered_at) FROM public.tarefas x LEFT JOIN public.task_statuses s ON s.value=x.status WHERE x.id=t.task_id AND x.client_id=t.client_id),
 'hours',coalesce((SELECT jsonb_build_object('start_time',h.start_time,'end_time',h.end_time) FROM public.atlas_team_hours h WHERE h.owner_id=t.owner_id AND h.person_id=auth.uid()),'{"start_time":"08:00","end_time":"17:00"}'::jsonb),
 'queried_at',now()) INTO result FROM public.clientes c WHERE c.id=t.client_id;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION private.atlas_team_create(p_client uuid,p_task uuid,p_account uuid,p_source text,p_context jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.tarefas; thread uuid; title text; existing public.atlas_team_threads;
BEGIN
 IF NOT private.atlas_demand_owner() OR NOT EXISTS(SELECT 1 FROM public.atlas_team_config WHERE owner_id=auth.uid() AND enabled) THEN RAISE EXCEPTION 'Piloto indisponível.' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('atlas-team-start:'||auth.uid()::text||p_task::text,0));
 SELECT * INTO t FROM public.tarefas WHERE id=p_task AND client_id=p_client FOR SHARE;
 IF t.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=p_client AND etapa='closed') OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_account AND status='active' AND role IN('admin','superadmin','colaborador')) THEN RAISE EXCEPTION 'Cliente, tarefa ou responsável indisponível.'; END IF;
 IF p_source IS NULL OR char_length(p_source) NOT BETWEEN 1 AND 500 OR p_context IS NULL OR jsonb_typeof(p_context)<>'object' OR octet_length(p_context::text)>10000 THEN RAISE EXCEPTION 'Fonte acima do limite.'; END IF;
 SELECT id INTO thread FROM public.atlas_team_threads WHERE owner_id=auth.uid() AND source_key=p_source;
 IF thread IS NOT NULL THEN
  SELECT * INTO existing FROM public.atlas_team_threads WHERE id=thread;
  IF existing.client_id<>p_client OR existing.task_id IS DISTINCT FROM p_task OR existing.account_person_id<>p_account THEN RAISE EXCEPTION 'Identificador usado por outro acompanhamento.'; END IF;
  RETURN thread;
 END IF;
 SELECT * INTO existing FROM public.atlas_team_threads WHERE owner_id=auth.uid() AND task_id=p_task AND state<>'closed' FOR UPDATE;
 IF existing.id IS NOT NULL THEN
  IF existing.account_person_id<>p_account THEN RAISE EXCEPTION 'Esta tarefa já tem acompanhamento com outro responsável da conta. Abra o assunto existente.'; END IF;
  RETURN existing.id;
 END IF;
 IF EXISTS(SELECT 1 FROM public.task_statuses WHERE value=t.status AND is_terminal) THEN RAISE EXCEPTION 'Escolha uma tarefa em aberto.'; END IF;
 PERFORM public.atlas_task_followup_watch(t.id,md5(to_jsonb(t)::text));
 title:=left(t.title,200);
 INSERT INTO public.atlas_team_threads(owner_id,client_id,task_id,account_person_id,current_person_id,title,shared_context,source_key,next_review_at)
 VALUES(auth.uid(),p_client,p_task,p_account,p_account,title,p_context,p_source,now()+interval '1 hour') RETURNING id INTO thread;
 INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(thread,'atlas','Oi! Preciso de você para conferir: '||title||'. '||CASE WHEN nullif(btrim(p_context->>'text'),'') IS NOT NULL THEN 'Orientação para alinharmos: '||left(btrim(p_context->>'text'),2000)||'. ' ELSE '' END||'O que já foi apurado e quem está conduzindo? Vamos combinar o próximo retorno.');
 RETURN thread;
END $$;
COMMIT;
