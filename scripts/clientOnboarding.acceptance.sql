\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE v_actor uuid; v_staff uuid; v_client uuid := gen_random_uuid();
BEGIN
  SELECT user_id INTO STRICT v_actor FROM planeje_private.task_operational_function_managers WHERE is_active LIMIT 1;
  SELECT id INTO STRICT v_staff FROM public.profiles WHERE role='colaborador' AND status='active' AND id<>v_actor LIMIT 1;
  INSERT INTO public.clientes(id,empresa,owner_id,etapa) VALUES(v_client,'[QA TRANSACIONAL] Onboarding fase 5',v_actor,'closed');
  PERFORM set_config('request.jwt.claim.sub',v_actor::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_actor,'role','authenticated')::text,true);
  PERFORM set_config('planeje_test.client',v_client::text,true);
  PERFORM set_config('planeje_test.manager',v_actor::text,true);
  PERFORM set_config('planeje_test.staff',v_staff::text,true);
END;
$$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_template uuid; v_run uuid; v_stage uuid; v_task uuid; v_client uuid:=current_setting('planeje_test.client')::uuid;
  v_actor uuid:=auth.uid(); v_blocked boolean; v_data jsonb; v_created integer;
BEGIN
  IF has_function_privilege('anon','public.start_client_onboarding(uuid,uuid,uuid)','EXECUTE')
    OR has_table_privilege('authenticated','public.client_onboardings','INSERT')
    OR has_schema_privilege('authenticated','planeje_private','USAGE') THEN RAISE EXCEPTION 'Onboarding privileges opened'; END IF;
  v_data:=jsonb_build_array(
    jsonb_build_object('title','Alinhar objetivos','pending_side','internal','sla_days',1,'instructions','Conferir escopo e objetivos.'),
    jsonb_build_object('title','Receber acessos','pending_side','client','sla_days',2,'instructions','Receber os acessos do cliente.'),
    jsonb_build_object('title','Organizar operação','pending_side','internal','sla_days',3,'instructions','Preparar a rotina.'));
  v_template:=public.save_client_onboarding_template(null,'[QA] Fluxo de entrada',v_data,true);
  v_run:=public.start_client_onboarding(v_client,v_template,v_actor);
  IF public.start_client_onboarding(v_client,v_template,v_actor)<>v_run THEN RAISE EXCEPTION 'Start duplicated onboarding'; END IF;
  IF (SELECT count(*) FROM public.tarefas WHERE client_id=v_client)<>1 OR (SELECT count(*) FROM public.client_onboarding_stages WHERE onboarding_id=v_run AND state='locked' AND task_id IS NULL AND started_at IS NULL)<>2 THEN
    RAISE EXCEPTION 'Future work already generated tasks or deadlines'; END IF;
  IF (SELECT count(*) FROM public.client_onboarding_stages WHERE onboarding_id=v_run AND state='active')<>1 THEN RAISE EXCEPTION 'Not one current stage'; END IF;
  -- Template changes do not overwrite in-flight client stages.
  PERFORM public.save_client_onboarding_template(v_template,'[QA] Fluxo de entrada',jsonb_build_array(jsonb_build_object('title','Outro início','pending_side','internal','sla_days',5)),true);
  IF (SELECT count(*) FROM public.client_onboarding_stages WHERE onboarding_id=v_run)<>3 THEN RAISE EXCEPTION 'In-flight snapshot changed'; END IF;
  SELECT id INTO v_stage FROM public.client_onboarding_stages WHERE onboarding_id=v_run AND position=3;
  v_blocked:=false;
  BEGIN PERFORM public.complete_client_onboarding_stage(v_stage); EXCEPTION WHEN OTHERS THEN v_blocked:=position('etapa atual' IN SQLERRM)>0; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Future stage completed out of order'; END IF;
  SELECT id,task_id INTO v_stage,v_task FROM public.client_onboarding_stages WHERE onboarding_id=v_run AND position=1;
  PERFORM public.update_client_onboarding_stage(v_stage,v_actor,'client',1,current_date+5,'Aguardando informação do cliente.');
  IF NOT EXISTS(SELECT 1 FROM public.tarefas WHERE id=v_task AND due_date=current_date+5 AND description='Aguardando informação do cliente.') THEN RAISE EXCEPTION 'Stage edit did not update canonical task'; END IF;
  UPDATE public.tarefas SET description='Informação conferida pela tarefa.' WHERE id=v_task;
  IF NOT EXISTS(SELECT 1 FROM public.client_onboarding_stages WHERE id=v_stage AND instructions='Informação conferida pela tarefa.') THEN RAISE EXCEPTION 'Task edit did not sync'; END IF;
  PERFORM set_config('request.jwt.claim.sub',current_setting('planeje_test.staff'),true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('planeje_test.staff'),'role','authenticated')::text,true);
  v_blocked:=false;
  BEGIN PERFORM public.complete_client_onboarding_stage(v_stage); EXCEPTION WHEN insufficient_privilege THEN v_blocked:=true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Non-assignee completed stage'; END IF;
  v_blocked:=false;
  BEGIN UPDATE public.tarefas SET status='completed' WHERE id=v_task; EXCEPTION WHEN insufficient_privilege THEN v_blocked:=true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Non-assignee bypassed through task'; END IF;
  PERFORM set_config('request.jwt.claim.sub',v_actor::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_actor,'role','authenticated')::text,true);
  -- Completing from Tarefas is the same transition as the shortcut.
  UPDATE public.tarefas SET status='completed' WHERE id=v_task;
  PERFORM public.complete_client_onboarding_stage(v_stage);
  IF (SELECT count(*) FROM public.tarefas WHERE client_id=v_client)<>2 THEN RAISE EXCEPTION 'Repeated completion duplicated task'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.client_onboarding_stages s JOIN public.tarefas t ON t.id=s.task_id WHERE s.onboarding_id=v_run AND s.position=2 AND s.state='active' AND s.pending_side='client'
    AND t.due_date=public.calculate_client_onboarding_due_date(s.started_at,2)) THEN RAISE EXCEPTION 'Client stage or activation deadline wrong'; END IF;
  v_blocked:=false;
  BEGIN UPDATE public.tarefas SET status='todo' WHERE id=v_task; EXCEPTION WHEN OTHERS THEN v_blocked:=position('já foi concluída' IN SQLERRM)>0; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Reopened previous stage behind active next stage'; END IF;
  SELECT id INTO v_stage FROM public.client_onboarding_stages WHERE onboarding_id=v_run AND position=2;
  PERFORM public.complete_client_onboarding_stage(v_stage);
  SELECT id INTO v_stage FROM public.client_onboarding_stages WHERE onboarding_id=v_run AND position=3;
  PERFORM public.complete_client_onboarding_stage(v_stage);
  IF NOT EXISTS(SELECT 1 FROM public.client_onboardings WHERE id=v_run AND status='completed' AND completed_at IS NOT NULL)
    OR (SELECT count(*) FROM public.client_onboarding_stages WHERE onboarding_id=v_run AND state='completed')<>3
    OR (SELECT count(*) FROM public.tarefas WHERE client_id=v_client)<>3 THEN RAISE EXCEPTION 'Final completion or task count wrong'; END IF;
  v_blocked:=false;
  BEGIN INSERT INTO public.tarefas(title,type,status,owner_id) VALUES('[QA] Não burlar publicação','arte','completed',v_actor); EXCEPTION WHEN OTHERS THEN v_blocked:=position('use Publicado' IN SQLERRM)>0; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Generic completion bypassed content publication'; END IF;
  IF public.calculate_client_onboarding_due_date('2026-09-19T02:30:00Z',1)<>date '2026-09-21'
    OR public.calculate_client_onboarding_due_date('2026-09-21T02:30:00Z',1)<>date '2026-09-21'
    OR public.calculate_client_onboarding_due_date('2026-09-18T02:30:00Z',1)<>date '2026-09-18' THEN
    RAISE EXCEPTION 'Business-day calculation ignored local calendar near UTC midnight'; END IF;
  -- An unknown/non-staff identity cannot read or operate the new module.
  PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',auth.uid(),'role','authenticated')::text,true);
  IF public.can_use_client_onboarding() OR EXISTS(SELECT 1 FROM public.client_onboardings) OR EXISTS(SELECT 1 FROM public.client_onboarding_templates) OR EXISTS(SELECT 1 FROM public.client_onboarding_stages) THEN
    RAISE EXCEPTION 'Non-staff read onboarding data'; END IF;
  v_blocked:=false;
  BEGIN PERFORM public.start_client_onboarding(v_client,v_template,v_actor); EXCEPTION WHEN insufficient_privilege THEN v_blocked:=true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Non-staff started onboarding'; END IF;
  RAISE NOTICE 'PASS: staff ACL, configurable snapshot, one current task, ordered advancement, independent activation deadlines, canonical edits, idempotence, completion and preserved content gates';
END;
$$;
RESET ROLE;
ROLLBACK;
