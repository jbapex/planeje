\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE v_actor uuid; v_client uuid := gen_random_uuid();
BEGIN
  SELECT id INTO v_actor FROM public.profiles
    WHERE role IN ('admin', 'superadmin') AND status = 'active' LIMIT 1;
  IF v_actor IS NULL THEN RAISE EXCEPTION 'An active administrator is required'; END IF;
  INSERT INTO public.clientes(id,empresa,owner_id,etapa,tipo_servico,entregaveis)
    VALUES (v_client,'[QA TRANSACIONAL] Remoção de anexo da tarefa',v_actor,'closed','execucao_completa','{"artes":1}'::jsonb);
  PERFORM set_config('request.jwt.claim.sub',v_actor::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_actor,'role','authenticated')::text,true);
  PERFORM set_config('planeje_test.client_id',v_client::text,true);
  PERFORM set_config('planeje_test.actor_id',v_actor::text,true);
END;
$$;
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_task uuid;
  v_proof uuid;
  v_extra uuid;
  v_replacement uuid;
  v_delivered timestamptz;
  v_current uuid;
BEGIN
  INSERT INTO public.tarefas(title,status,type,due_date,owner_id,client_id)
    VALUES (
      '[QA] Remover link após entrega',
      'production',
      'arte',
      current_date,
      current_setting('planeje_test.actor_id')::uuid,
      current_setting('planeje_test.client_id')::uuid
    )
    RETURNING id INTO v_task;

  INSERT INTO public.task_attachments(task_id,name,url)
    VALUES (v_task,'[QA] Link errado','https://example.test/qa-wrong-link')
    RETURNING id INTO v_proof;

  UPDATE public.tarefas
     SET status='review', workflow_stage_key='review'
   WHERE id=v_task;

  SELECT production_delivered_at, production_delivery_attachment_id
    INTO STRICT v_delivered, v_current
  FROM public.tarefas WHERE id=v_task;

  IF v_delivered IS NULL OR v_current IS DISTINCT FROM v_proof THEN
    RAISE EXCEPTION 'Delivery proof was not locked on the original attachment';
  END IF;

  INSERT INTO public.task_attachments(task_id,name,url)
    VALUES (v_task,'[QA] Link extra','https://example.test/qa-extra-link')
    RETURNING id INTO v_extra;

  DELETE FROM public.task_attachments WHERE id=v_extra;
  IF EXISTS (SELECT 1 FROM public.task_attachments WHERE id=v_extra) THEN
    RAISE EXCEPTION 'Non-proof attachment was not removed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tarefas
    WHERE id=v_task
      AND production_delivered_at=v_delivered
      AND production_delivery_attachment_id=v_current
  ) THEN
    RAISE EXCEPTION 'Removing an extra attachment changed the preserved delivery';
  END IF;

  INSERT INTO public.task_attachments(task_id,name,url)
    VALUES (v_task,'[QA] Link correto','https://example.test/qa-correct-link')
    RETURNING id INTO v_replacement;

  DELETE FROM public.task_attachments WHERE id=v_proof;
  IF EXISTS (SELECT 1 FROM public.task_attachments WHERE id=v_proof) THEN
    RAISE EXCEPTION 'Proof attachment was not removed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tarefas
    WHERE id=v_task
      AND production_delivered_at=v_delivered
      AND production_delivery_attachment_id=v_replacement
  ) THEN
    RAISE EXCEPTION 'Remaining attachment did not become the delivery proof';
  END IF;

  DELETE FROM public.task_attachments WHERE id=v_replacement;
  IF EXISTS (SELECT 1 FROM public.task_attachments WHERE id=v_replacement) THEN
    RAISE EXCEPTION 'Last remaining attachment was not removed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tarefas
    WHERE id=v_task
      AND production_delivered_at=v_delivered
      AND production_delivery_attachment_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Removing the last proof reopened or lost the original delivery timestamp';
  END IF;

  RAISE NOTICE 'PASS: delivered task keeps its timestamp while attachments and proof links can be removed';
END;
$$;
RESET ROLE;
ROLLBACK;
