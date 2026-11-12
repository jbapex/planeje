-- Keep authentication tables private while validating the mission's exact source session.
BEGIN;

CREATE FUNCTION private.atlas_source_session_exists(p_owner uuid,p_session uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM auth.sessions WHERE id=p_session AND user_id=p_owner);
$$;
REVOKE ALL ON FUNCTION private.atlas_source_session_exists(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.atlas_source_session_exists(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.atlas_manager_consult(p_job uuid,p_lease uuid,p_client uuid,p_task uuid,p_question text,p_person uuid DEFAULT NULL,p_mode text DEFAULT 'consult') RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.atlas_jobs;r public.atlas_runs;task public.tarefas;person public.profiles;account uuid;recipient uuid;people uuid[];basis text;thread uuid;source text;body text;at_work timestamptz;reused boolean:=false;demand uuid;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Acesso exclusivo do worker.' USING ERRCODE='42501';END IF;
 SELECT * INTO j FROM public.atlas_jobs WHERE id=p_job FOR UPDATE;
 SELECT * INTO r FROM public.atlas_runs WHERE id=j.origin_run_id;
 IF j.id IS NULL OR j.status<>'running' OR j.lease_token IS DISTINCT FROM p_lease OR j.lease_until<=now()
 OR NOT coalesce(private.atlas_manager_live(j.owner_id),false)
 OR NOT private.atlas_source_session_exists(j.owner_id,j.source_session_id)
 OR NOT EXISTS(SELECT 1 FROM public.atlas_event_config WHERE owner_id=j.owner_id AND p_client=ANY(client_ids))
 OR NOT EXISTS(SELECT 1 FROM public.clientes WHERE id=p_client AND etapa='closed')
 OR j.client_id IS NOT NULL AND j.client_id<>p_client
 OR r.request_client_id IS NOT NULL AND r.request_client_id<>p_client
 OR EXISTS(SELECT 1 FROM public.atlas_conversations WHERE id=j.conversation_id AND client_id IS NOT NULL AND client_id<>p_client) THEN
  RAISE EXCEPTION 'Sessão, política ou cliente da consulta mudou.' USING ERRCODE='42501';END IF;
 IF p_question IS NULL OR char_length(btrim(p_question)) NOT BETWEEN 10 AND 1200 OR p_question ~* '(senha|password|api.?key|token)[[:space:]]*[:=]|sk-[a-zA-Z0-9_-]{12,}|eyJ[a-zA-Z0-9_-]{30,}' THEN
  RAISE EXCEPTION 'Envie apenas a pergunta operacional, sem conteúdo privado.' USING ERRCODE='22023';END IF;
 IF char_length(btrim(r.request_message))>=10 AND position(lower(btrim(r.request_message)) IN lower(p_question))>0
 OR EXISTS(SELECT 1 FROM public.atlas_memories m WHERE m.owner_id=j.owner_id AND (m.state<>'active' OR NOT m.team_shared OR m.client_id IS DISTINCT FROM p_client) AND char_length(btrim(m.content))>=20 AND position(lower(btrim(m.content)) IN lower(p_question))>0) THEN
  RAISE EXCEPTION 'A pergunta não pode copiar a conversa ou memória privada do dono.' USING ERRCODE='22023';END IF;
 IF p_mode IS NULL OR p_mode NOT IN('consult','organize') THEN RAISE EXCEPTION 'Modo de consulta inválido.' USING ERRCODE='22023';END IF;
 IF p_mode='organize' AND r.request_message !~* '^[[:space:]]*(atlas[, ]*)?(quero|preciso|vamos|pode|crie|criar|organize|organizar|faça|fazer|registre|registrar|combinei|combinamos|defini|aprovado)' THEN
  RETURN jsonb_build_object('available',false,'requires_owner',true,'reason','A mensagem de origem não confirma uma ordem ou combinado. Esclareça a intenção antes de organizar execução.');END IF;
 IF p_task IS NOT NULL THEN
  SELECT * INTO task FROM public.tarefas WHERE id=p_task AND client_id=p_client;
  IF task.id IS NULL THEN RAISE EXCEPTION 'Tarefa fora do cliente.' USING ERRCODE='42501';END IF;
 END IF;
 account:=private.atlas_manager_account(j.owner_id,p_client);
 SELECT array_agg(p.id ORDER BY p.id) INTO people FROM public.profiles p WHERE p.id=ANY(task.assignee_ids) AND p.id<>j.owner_id AND p.status='active' AND p.role IN('admin','superadmin','colaborador');
 recipient:=CASE WHEN p_mode='organize' THEN account ELSE coalesce(p_person,CASE WHEN cardinality(people)=1 THEN people[1] ELSE account END) END;
 IF recipient IS NULL THEN RETURN jsonb_build_object('available',false,'requires_owner',true,'reason','Falta confirmar quem cuida desta conta. Não chamei ninguém.');END IF;
 SELECT * INTO person FROM public.profiles WHERE id=recipient AND id<>j.owner_id AND status='active' AND role IN('admin','superadmin','colaborador');
 basis:=CASE WHEN recipient=ANY(people) THEN 'assignee' WHEN recipient=account THEN 'account' ELSE 'explicit' END;
 IF person.id IS NULL OR basis='explicit' AND NOT (
  position(lower(person.full_name) IN lower(r.request_message))>0 OR
  length(split_part(person.full_name,' ',1))>=3 AND
  position(' '||lower(split_part(person.full_name,' ',1))||' ' IN ' '||regexp_replace(lower(r.request_message),'[^[:alnum:]]+',' ','g')||' ')>0 AND
  (SELECT count(*) FROM public.profiles p WHERE p.status='active' AND p.role IN('admin','superadmin','colaborador') AND lower(split_part(p.full_name,' ',1))=lower(split_part(person.full_name,' ',1)))=1
 ) THEN RAISE EXCEPTION 'Pessoa sem vínculo ou indicação explícita do dono.' USING ERRCODE='42501';END IF;
 source:='manager-consult:'||j.id||':'||md5(p_client::text||coalesce(p_task::text,'')||recipient::text||p_mode);
 SELECT id INTO thread FROM public.atlas_team_threads WHERE owner_id=j.owner_id AND source_key=source;
 reused:=thread IS NOT NULL;
 at_work:=private.atlas_manager_work(now(),j.owner_id,recipient);
 body:='Oi, '||split_part(person.full_name,' ',1)||'! Aqui é o Atlas. '||CASE WHEN p_mode='organize' THEN 'O dono trouxe um combinado para organizarmos. Preciso alinhar a ação e o executor, usando uma tarefa existente quando houver: ' ELSE 'Preciso confirmar um ponto da '||(SELECT empresa FROM public.clientes WHERE id=p_client)||': ' END||btrim(p_question);
 IF thread IS NULL THEN
  INSERT INTO public.atlas_team_threads(owner_id,client_id,task_id,account_person_id,current_person_id,title,shared_context,source_key,state,next_review_at,management_kind,management_data,origin_job_id)
  VALUES(j.owner_id,p_client,p_task,coalesce(account,recipient),recipient,left('Consulta: '||coalesce(task.title,(SELECT empresa FROM public.clientes WHERE id=p_client)),200),jsonb_build_object('label','Informação operacional solicitada pelo dono','text',btrim(p_question),'at',now()),source,
   CASE WHEN at_work>now() THEN 'waiting_review' ELSE 'awaiting_reply' END,private.atlas_manager_work(at_work+interval '1 hour',j.owner_id,recipient),CASE WHEN p_mode='organize' THEN 'intake' ELSE 'consultation' END,jsonb_build_object('recipient_basis',basis,'dispatch_pending',at_work>now(),'question',body,'scheduled_at',at_work),j.id) RETURNING id INTO thread;
  IF p_mode='organize' THEN
   INSERT INTO public.atlas_demands(owner_id,client_id,request_id,title,context,state,proposal)
   VALUES(j.owner_id,p_client,md5(source)::uuid,left('['||(SELECT empresa FROM public.clientes WHERE id=p_client)||'] '||btrim(p_question),180),btrim(p_question),'proposed',jsonb_build_object('source','atlas_owner_intake','thread_id',thread,'job_id',j.id)) RETURNING id INTO demand;
   UPDATE public.atlas_team_threads SET management_data=management_data||jsonb_build_object('demand_ids',jsonb_build_array(demand),'findings',jsonb_build_array(jsonb_build_object('id',demand,'title',left(btrim(p_question),180),'summary',btrim(p_question)))) WHERE id=thread;
  END IF;
  IF at_work<=now() THEN INSERT INTO public.atlas_team_messages(thread_id,role,content) VALUES(thread,'atlas',body);END IF;
 END IF;
 RETURN jsonb_build_object('available',true,'thread_id',thread,'recipient',person.full_name,'state',CASE WHEN at_work>now() THEN 'scheduled' ELSE 'awaiting_reply' END,'scheduled_at',at_work,'reused',reused);
END $$;
REVOKE ALL ON FUNCTION public.atlas_manager_consult(uuid,uuid,uuid,uuid,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_manager_consult(uuid,uuid,uuid,uuid,text,uuid,text) TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
