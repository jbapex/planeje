\set ON_ERROR_STOP on
BEGIN;

-- Dedicated, transaction-only client: no existing client/task is modified.
DO $$
DECLARE v_actor uuid; v_client uuid := gen_random_uuid();
BEGIN
  SELECT id INTO v_actor FROM public.profiles
    WHERE role IN ('admin', 'superadmin') AND status = 'active' LIMIT 1;
  IF v_actor IS NULL THEN RAISE EXCEPTION 'An active staging administrator is required'; END IF;
  INSERT INTO public.clientes(id,empresa,owner_id,etapa,tipo_servico,entregaveis)
    VALUES (v_client,'[QA TRANSACIONAL] Fluxo completo da agência',v_actor,'closed','execucao_completa','{"artes":1}'::jsonb);
  PERFORM set_config('request.jwt.claim.sub',v_actor::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_actor,'role','authenticated')::text,true);
  PERFORM set_config('planeje_test.client_id',v_client::text,true);
END;
$$;
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_project uuid; v_task uuid; v_attachment uuid; v_publication uuid; v_result jsonb;
  v_blocked boolean; v_delivered timestamptz; v_deadline public.task_deadline_status%ROWTYPE;
  v_month date := (date_trunc('month',current_date) + interval '1 month')::date;
BEGIN
  IF has_schema_privilege(current_user, 'planeje_private', 'USAGE')
    OR has_function_privilege('anon', 'public.calculate_task_stage_deadline(timestamptz,integer)', 'EXECUTE')
    THEN RAISE EXCEPTION 'Deadline calculation opened private schema or anonymous access'; END IF;
  IF public.calculate_task_stage_deadline('2026-09-18T12:00:00Z'::timestamptz, 1)
    IS DISTINCT FROM '2026-09-21T12:00:00Z'::timestamptz
    THEN RAISE EXCEPTION 'Stage deadline did not preserve its hour across the weekend'; END IF;
  v_project := public.start_client_monthly_project(current_setting('planeje_test.client_id')::uuid,v_month);
  IF v_project IS NULL THEN RAISE EXCEPTION 'Project was not created'; END IF;
  INSERT INTO public.campaign_plans(project_id,contexto_ia,materiais)
    VALUES (v_project,'<p>Plano aprovado para apresentar a campanha no próximo mês.</p>',
      ARRAY[jsonb_build_object('id','flow-qa-material','tipo','arte','descricao','Campanha planejada',
        'detalhes','Apresentar a oferta e as condições em uma arte para Instagram.',
        'mes_referencia',v_month,'data_entrega',current_date - 2,'data_postagem',v_month + 2,
        'canais',jsonb_build_array('Instagram'))]);
  UPDATE public.projetos SET status='aprovacao' WHERE id=v_project;
  IF NOT EXISTS (SELECT 1 FROM public.projetos WHERE id=v_project AND plan_ready_at IS NOT NULL AND plan_approved_at IS NULL)
    THEN RAISE EXCEPTION 'Planning readiness and client approval were conflated'; END IF;
  UPDATE public.projetos SET status='execucao' WHERE id=v_project;
  IF NOT EXISTS (SELECT 1 FROM public.projetos WHERE id=v_project AND plan_approved_at IS NOT NULL)
    THEN RAISE EXCEPTION 'Plan approval was not recorded'; END IF;

  v_result := public.create_task_from_plan_material(v_project,'flow-qa-material');
  v_task := (v_result->'task'->>'id')::uuid;
  IF v_task IS NULL OR v_result->>'created' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Planned task was not created'; END IF;
  v_result := public.create_task_from_plan_material(v_project,'flow-qa-material');
  IF v_result->>'created' IS DISTINCT FROM 'false' OR (v_result->'task'->>'id')::uuid IS DISTINCT FROM v_task
    THEN RAISE EXCEPTION 'Material shortcut duplicated the task'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tarefas WHERE id=v_task AND project_id=v_project
      AND plan_material_id='flow-qa-material' AND planned_channels=ARRAY['Instagram'] AND due_date=current_date - 2)
    THEN RAISE EXCEPTION 'Task lost plan, content month, deadline or channel linkage'; END IF;
  UPDATE public.tarefas SET status='production',workflow_stage_key='art_production' WHERE id=v_task;

  v_blocked := false;
  BEGIN UPDATE public.tarefas SET status='review',workflow_stage_key='review' WHERE id=v_task;
  EXCEPTION WHEN OTHERS THEN v_blocked := position('Anexe o conteúdo produzido' IN SQLERRM)>0; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Final review without production proof was accepted'; END IF;
  INSERT INTO public.task_attachments(task_id,name,url)
    VALUES (v_task,'[QA] Conteúdo produzido','https://example.test/qa-material') RETURNING id INTO v_attachment;
  v_blocked := false;
  BEGIN UPDATE public.tarefas SET status='review',workflow_stage_key='review' WHERE id=v_task;
  EXCEPTION WHEN OTHERS THEN v_blocked := position('Justifique o atraso' IN SQLERRM)>0; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Late production without justification was accepted'; END IF;
  INSERT INTO public.task_delay_justifications(task_id,deadline_kind,due_on,workflow_stage_key,reason_code,details,created_by)
    VALUES (v_task,'production',current_date - 2,'art_production','missing_input',
      'O conteúdo necessário chegou depois do prazo combinado.',auth.uid());
  UPDATE public.tarefas SET status='review',workflow_stage_key='review' WHERE id=v_task;
  SELECT production_delivered_at INTO STRICT v_delivered FROM public.tarefas WHERE id=v_task;
  SELECT * INTO STRICT v_deadline FROM public.task_deadline_status WHERE task_id=v_task;
  IF v_delivered IS NULL OR NOT v_deadline.delivery_proof_valid OR NOT v_deadline.production_delay_justified
    OR v_deadline.production_state IS DISTINCT FROM 'delivered_late' OR v_deadline.stage_due_at IS NULL
    THEN RAISE EXCEPTION 'Delivered production and new review deadline were not preserved'; END IF;

  UPDATE public.tarefas SET stage_due_at=clock_timestamp() - interval '1 day' WHERE id=v_task;
  v_blocked := false;
  BEGIN UPDATE public.tarefas SET status='josias',workflow_stage_key='validation' WHERE id=v_task;
  EXCEPTION WHEN OTHERS THEN v_blocked := position('Justifique o atraso da etapa' IN SQLERRM)>0; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Late review without stage justification was accepted'; END IF;
  INSERT INTO public.task_delay_justifications(task_id,deadline_kind,due_on,workflow_stage_key,reason_code,details,created_by)
    VALUES (v_task,'stage',(clock_timestamp() - interval '1 day')::date,'review','rework',
      'A revisão precisou de um ajuste adicional antes do envio.',auth.uid());
  UPDATE public.tarefas SET status='josias',workflow_stage_key='validation' WHERE id=v_task;
  UPDATE public.tarefas SET status='approve',workflow_stage_key='send_client' WHERE id=v_task;
  UPDATE public.tarefas SET status='aguardando_aprovação',workflow_stage_key='waiting_client' WHERE id=v_task;
  IF NOT EXISTS (SELECT 1 FROM public.tarefas WHERE id=v_task AND stage_due_at IS NULL
      AND production_delivered_at=v_delivered AND post_date=v_month + 2)
    THEN RAISE EXCEPTION 'Waiting for client lost delivery or posting date, or kept an internal SLA'; END IF;
  UPDATE public.tarefas SET status='agendar',workflow_stage_key='schedule' WHERE id=v_task;
  INSERT INTO public.task_channel_publications(task_id,channel,destination,assignee_id,scheduled_for)
    VALUES (v_task,'Instagram','[QA] Perfil de teste',auth.uid(),v_month + 2) RETURNING id INTO v_publication;
  v_blocked := false;
  BEGIN UPDATE public.tarefas SET status='published',workflow_stage_key='published' WHERE id=v_task;
  EXCEPTION WHEN OTHERS THEN v_blocked := position('publicações por canal pendentes' IN SQLERRM)>0; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Task finished with a pending channel publication'; END IF;
  v_blocked := false;
  BEGIN UPDATE public.task_channel_publications SET status='published' WHERE id=v_publication;
  EXCEPTION WHEN check_violation THEN v_blocked := true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Publication without evidence was accepted'; END IF;
  UPDATE public.task_channel_publications SET status='published',published_on=current_date,
    evidence_url='https://example.test/qa-post' WHERE id=v_publication;
  UPDATE public.tarefas SET status='published',workflow_stage_key='published' WHERE id=v_task;
  IF NOT EXISTS (SELECT 1 FROM public.tarefas WHERE id=v_task AND status='published'
      AND stage_due_at IS NULL AND production_delivered_at=v_delivered)
    THEN RAISE EXCEPTION 'Published task has an active stage deadline or lost its original delivery'; END IF;
  UPDATE public.projetos SET status='concluido' WHERE id=v_project;
  IF NOT EXISTS (SELECT 1 FROM public.projetos WHERE id=v_project AND status='concluido')
    THEN RAISE EXCEPTION 'Completed project did not reflect the published planned material'; END IF;
  IF (SELECT count(*) FROM public.task_delay_report WHERE task_id=v_task AND deadline_kind IN ('production','stage'))<>2
    THEN RAISE EXCEPTION 'Production and review delay reasons did not survive completion'; END IF;
  RAISE NOTICE 'PASS: plan readiness and approval, unique planned task, proof and delay gates, review SLA, waiting client, evidenced publication, completion and preserved delay report';
END;
$$;
RESET ROLE;
ROLLBACK;
