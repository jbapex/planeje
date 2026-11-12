DO $$
DECLARE
 task uuid; review uuid; action uuid; v_kind text; current_review public.traffic_weekly_reviews; history_count integer;
 payload jsonb := '{"metric_mode":"client","investment":100,"contacts":10,"analysis":"Conferido","action_mode":"none"}';
BEGIN
 FOREACH v_kind IN ARRAY ARRAY['review','optimization'] LOOP
  INSERT INTO public.tarefas(client_id,status,assignee_ids) VALUES(gen_random_uuid(),'pending',ARRAY[auth.uid()]) RETURNING id INTO task;
  INSERT INTO public.traffic_weekly_reviews(client_id,task_id,week_start,kind) SELECT client_id,task,'2026-10-19',v_kind FROM public.tarefas WHERE id=task RETURNING id INTO review;
  INSERT INTO public.traffic_task_details(task_id) VALUES(task);
  PERFORM public.save_traffic_weekly_review(review,0,payload,false);
  IF NOT EXISTS(SELECT 1 FROM public.tarefas WHERE id=task AND status='pending') THEN RAISE EXCEPTION 'Draft completed task'; END IF;
  BEGIN
   PERFORM set_config('fixture.allowed','no',true);
   PERFORM public.save_traffic_weekly_review(review,1,payload,true);
   RAISE EXCEPTION 'Permission denial was bypassed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('fixture.allowed','yes',true);
  BEGIN
   PERFORM public.save_traffic_weekly_review(review,0,payload,true);
   RAISE EXCEPTION 'Revision conflict was bypassed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%Outra pessoa%' THEN RAISE; END IF; END;
  PERFORM public.save_traffic_weekly_review(review,1,payload,true);
  IF NOT EXISTS(SELECT 1 FROM public.tarefas WHERE id=task AND status='completed') THEN RAISE EXCEPTION 'Finalize did not complete task'; END IF;
  SELECT count(*) INTO history_count FROM public.traffic_weekly_history WHERE review_id=review;
  PERFORM public.save_traffic_weekly_review(review,2,payload,true);
  IF (SELECT count(*) FROM public.traffic_weekly_history WHERE review_id=review)<>history_count THEN RAISE EXCEPTION 'Duplicate finalize changed history'; END IF;
  PERFORM public.save_traffic_weekly_review(review,2,payload||'{"analysis":"Correção do texto"}',false);
  SELECT * INTO current_review FROM public.traffic_weekly_reviews WHERE id=review;
  IF current_review.finalized_at IS NOT NULL OR current_review.revision<>3 THEN RAISE EXCEPTION 'Draft did not reopen review'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.tarefas WHERE id=task AND status='pending') THEN RAISE EXCEPTION 'Reopened review left canonical task completed (%)',v_kind; END IF;
  IF (SELECT jsonb_array_length(status_history) FROM public.tarefas WHERE id=task)<>2 THEN RAISE EXCEPTION 'Reopen lost task history'; END IF;
  PERFORM public.save_traffic_weekly_review(review,3,payload||'{"analysis":"Correção do texto"}',true);
  IF NOT EXISTS(SELECT 1 FROM public.tarefas WHERE id=task AND status='completed') THEN RAISE EXCEPTION 'Re-finalize did not complete task'; END IF;
  UPDATE public.task_statuses SET is_initial=false WHERE value='pending';
  BEGIN
   PERFORM public.save_traffic_weekly_review(review,4,payload,false);
   RAISE EXCEPTION 'Missing initial status accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%inicial%' THEN RAISE; END IF; END;
  IF NOT EXISTS(SELECT 1 FROM public.traffic_weekly_reviews WHERE id=review AND finalized_at IS NOT NULL AND revision=4) THEN RAISE EXCEPTION 'Failed reopen committed partial data'; END IF;
  UPDATE public.task_statuses SET is_initial=true WHERE value='pending';
 END LOOP;
END $$;
SELECT 'PASS: review and optimization draft, permission denial, revision conflict, finalize, duplicate finalize, canonical reopen, preserved history, re-finalize and atomic rollback';
