\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE v_actor uuid; v_staff uuid; v_other uuid; v_client uuid:=gen_random_uuid(); v_client2 uuid:=gen_random_uuid(); v_today date:=public.central_trafego_operational_date();
BEGIN
  SELECT id INTO STRICT v_actor FROM public.profiles WHERE role='superadmin' AND status='active' LIMIT 1;
  SELECT id INTO STRICT v_staff FROM public.profiles WHERE role='colaborador' AND status='active' LIMIT 1;
  SELECT id INTO STRICT v_other FROM public.profiles WHERE role='colaborador' AND status='active' AND id<>v_staff LIMIT 1;
  INSERT INTO public.clientes(id,empresa,owner_id,etapa) VALUES(v_client,'[QA TRANSACIONAL] Tráfego semanal A',v_actor,'closed'),(v_client2,'[QA TRANSACIONAL] Tráfego semanal B',v_actor,'closed');
  PERFORM set_config('request.jwt.claim.sub',v_actor::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_actor,'role','authenticated')::text,true);
  PERFORM set_config('weekly_test.actor',v_actor::text,true); PERFORM set_config('weekly_test.staff',v_staff::text,true);
  PERFORM set_config('weekly_test.other',v_other::text,true); PERFORM set_config('weekly_test.client',v_client::text,true); PERFORM set_config('weekly_test.client2',v_client2::text,true);
END;
$$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_today date:=public.central_trafego_operational_date(); v_blocked boolean:=false;
BEGIN
  IF has_function_privilege('anon','public.traffic_weekly_board()','EXECUTE') OR has_table_privilege('authenticated','public.traffic_weekly_reviews','INSERT') OR has_table_privilege('authenticated','public.traffic_weekly_history','UPDATE')
    OR has_schema_privilege('authenticated','planeje_private','USAGE') THEN RAISE EXCEPTION 'Weekly ACL opened'; END IF;
  BEGIN PERFORM public.save_traffic_weekly_settings(current_setting('weekly_test.client')::uuid,true,1,v_today-365,'Agendamentos',current_setting('weekly_test.staff')::uuid); EXCEPTION WHEN OTHERS THEN v_blocked:=position('retroativas' IN SQLERRM)>0; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Created old obligations without authorization'; END IF;
  PERFORM public.save_traffic_weekly_settings(current_setting('weekly_test.client')::uuid,true,least(5,extract(isodow FROM v_today)::integer),v_today,'Agendamentos',current_setting('weekly_test.staff')::uuid);
  PERFORM public.save_traffic_weekly_settings(current_setting('weekly_test.client2')::uuid,true,least(5,extract(isodow FROM v_today)::integer),v_today,'Orçamentos',current_setting('weekly_test.actor')::uuid);
END;
$$;
RESET ROLE;
-- Simulate activation on the last business day when executed during a weekend.
UPDATE public.traffic_weekly_settings SET starts_on=public.central_trafego_operational_date()-greatest(0,extract(isodow FROM public.central_trafego_operational_date())::integer-5),enabled_since=public.central_trafego_operational_date()-greatest(0,extract(isodow FROM public.central_trafego_operational_date())::integer-5)
  WHERE client_id IN (current_setting('weekly_test.client')::uuid,current_setting('weekly_test.client2')::uuid);
-- Exercise the actual server-job context: no authenticated browser or JWT.
SELECT set_config('request.jwt.claim.sub','',true), set_config('request.jwt.claims','{}',true);
DO $$ BEGIN PERFORM planeje_private.traffic_weekly_generate(public.central_trafego_operational_date()); END; $$;
SELECT set_config('request.jwt.claim.sub',current_setting('weekly_test.actor'),true),
  set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('weekly_test.actor'),'role','authenticated')::text,true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_client uuid:=current_setting('weekly_test.client')::uuid; v_review uuid; v_task uuid; v_action uuid; v_blocked boolean; v_data jsonb; v_before integer; v_day integer;
BEGIN
  PERFORM public.refresh_traffic_weekly_routine(); PERFORM public.refresh_traffic_weekly_routine();
  IF (SELECT count(*) FROM public.traffic_weekly_reviews WHERE client_id IN (v_client,current_setting('weekly_test.client2')::uuid))<>2 THEN RAISE EXCEPTION 'Client cycles missing or duplicated'; END IF;
  SELECT id,task_id INTO STRICT v_review,v_task FROM public.traffic_weekly_reviews WHERE client_id=v_client;
  IF (SELECT count(*) FROM public.tarefas WHERE client_id=v_client)<>1 OR EXISTS(SELECT 1 FROM public.traffic_weekly_reviews WHERE client_id=v_client AND extract(isodow FROM week_start)<>1) THEN RAISE EXCEPTION 'Not one real task or wrong week'; END IF;
  v_blocked:=false; BEGIN UPDATE public.tarefas SET status='completed' WHERE id=v_task; EXCEPTION WHEN OTHERS THEN v_blocked:=position('Rotina semanal' IN SQLERRM)>0; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Task completion bypassed weekly analysis'; END IF;
  v_data:=jsonb_build_object('investment',600,'contacts',30,'results',6,'analysis','Conferidos saldo, site e campanhas. Contatos estáveis; precisamos renovar o criativo.','action_mode','create',
    'action_draft',jsonb_build_object('title','[QA] Renovar criativo','assignee_id',current_setting('weekly_test.staff'),'due_date',public.central_trafego_operational_date()+2));
  PERFORM public.save_traffic_weekly_review(v_review,0,v_data,false);
  IF (SELECT count(*) FROM public.tarefas WHERE client_id=v_client)<>1 OR (SELECT investment FROM public.traffic_weekly_reviews WHERE id=v_review)<>600 THEN RAISE EXCEPTION 'Draft created action or lost metrics'; END IF;
  v_blocked:=false; BEGIN PERFORM public.save_traffic_weekly_review(v_review,0,v_data,false); EXCEPTION WHEN OTHERS THEN v_blocked:=position('Outra pessoa' IN SQLERRM)>0; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Concurrent stale draft overwrote review'; END IF;
  PERFORM set_config('request.jwt.claim.sub',current_setting('weekly_test.other'),true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('weekly_test.other'),'role','authenticated')::text,true);
  v_blocked:=false; BEGIN PERFORM public.save_traffic_weekly_review(v_review,1,v_data,true); EXCEPTION WHEN insufficient_privilege THEN v_blocked:=true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Non-assignee finalized review'; END IF;
  v_blocked:=false;
  BEGIN UPDATE public.tarefas SET assignee_ids=ARRAY[auth.uid()] WHERE id=v_task;
    v_blocked:=NOT FOUND;
  EXCEPTION WHEN insufficient_privilege THEN v_blocked:=true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Read-only staff stole the canonical review assignment'; END IF;
  PERFORM set_config('request.jwt.claim.sub',current_setting('weekly_test.staff'),true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('weekly_test.staff'),'role','authenticated')::text,true);
  v_blocked:=false; BEGIN PERFORM public.save_traffic_weekly_settings(v_client,false,1,public.central_trafego_operational_date(),'Outro',auth.uid()); EXCEPTION WHEN insufficient_privilege THEN v_blocked:=true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Collaborator rewrote agency settings'; END IF;
  PERFORM public.save_traffic_weekly_review(v_review,1,v_data,true);
  PERFORM public.save_traffic_weekly_review(v_review,1,v_data,true);
  SELECT action_task_id INTO STRICT v_action FROM public.traffic_weekly_reviews WHERE id=v_review;
  IF v_action IS NULL OR (SELECT count(*) FROM public.tarefas WHERE client_id=v_client)<>2 OR NOT EXISTS(SELECT 1 FROM public.tarefas WHERE id=v_task AND status='completed')
    OR EXISTS(SELECT 1 FROM public.tarefas a JOIN public.task_statuses s ON s.value=a.status WHERE a.id=v_action AND s.is_terminal) THEN RAISE EXCEPTION 'Finalization not idempotent or closed successor task'; END IF;
  IF (SELECT count(*) FROM public.traffic_weekly_history WHERE review_id=v_review)<>3 THEN RAISE EXCEPTION 'History missing or duplicate completion event'; END IF;
  v_blocked:=false; BEGIN UPDATE public.tarefas SET status='todo' WHERE id=v_task; EXCEPTION WHEN OTHERS THEN v_blocked:=position('histórico' IN SQLERRM)>0; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Reopened immutable weekly history'; END IF;
  IF jsonb_array_length(public.traffic_weekly_client_history(v_client,NULL,30))<>1 THEN RAISE EXCEPTION 'Per-client history missing'; END IF;
  PERFORM set_config('request.jwt.claim.sub',current_setting('weekly_test.actor'),true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('weekly_test.actor'),'role','authenticated')::text,true);
  SELECT review_weekday INTO v_day FROM public.traffic_weekly_settings WHERE client_id=v_client;
  IF extract(isodow FROM public.central_trafego_operational_date())<5 THEN
    PERFORM public.save_traffic_weekly_settings(v_client,true,v_day+1,public.central_trafego_operational_date(),'Agendamentos',current_setting('weekly_test.staff')::uuid);
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.traffic_weekly_board()->'clients') c WHERE c->>'id'=v_client::text
      AND (c->>'next_due_on')::date=public.central_trafego_operational_date()+8) THEN RAISE EXCEPTION 'Changing weekday charged the already reviewed cycle again'; END IF;
    SELECT review_weekday INTO v_day FROM public.traffic_weekly_settings WHERE client_id=v_client;
  END IF;
  PERFORM public.save_traffic_weekly_settings(v_client,false,v_day,public.central_trafego_operational_date(),'Compras',current_setting('weekly_test.actor')::uuid);
  PERFORM public.refresh_traffic_weekly_routine();
  IF (SELECT count(*) FROM public.traffic_weekly_reviews WHERE client_id=v_client)<>1 OR (SELECT result_label FROM public.traffic_weekly_reviews WHERE id=v_review)<>'Agendamentos'
    OR NOT EXISTS(SELECT 1 FROM public.tarefas WHERE id=v_task AND current_setting('weekly_test.staff')::uuid=ANY(assignee_ids)) THEN RAISE EXCEPTION 'Disable/config update erased history or rewrote canonical assignee'; END IF;
  UPDATE public.clientes SET etapa='lead' WHERE id=v_client;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.traffic_weekly_board()->'clients') c WHERE c->>'id'=v_client::text) THEN RAISE EXCEPTION 'Inactive client lost historical access'; END IF;
  -- Other-client task links are rejected and transaction leaves no partial data.
  SELECT id INTO v_review FROM public.traffic_weekly_reviews WHERE client_id=current_setting('weekly_test.client2')::uuid;
  v_blocked:=false; BEGIN PERFORM public.save_traffic_weekly_review(v_review,0,v_data||jsonb_build_object('action_mode','link','action_task_id',v_action),true); EXCEPTION WHEN OTHERS THEN v_blocked:=position('mesmo cliente' IN SQLERRM)>0; END;
  IF NOT v_blocked OR (SELECT revision FROM public.traffic_weekly_reviews WHERE id=v_review)<>0 THEN RAISE EXCEPTION 'Other-client link accepted or partial save persisted'; END IF;
  PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',auth.uid(),'role','authenticated')::text,true);
  IF public.can_use_traffic_weekly() OR EXISTS(SELECT 1 FROM public.traffic_weekly_reviews) OR EXISTS(SELECT 1 FROM public.traffic_weekly_history) THEN RAISE EXCEPTION 'Non-staff read weekly history'; END IF;
  v_blocked:=false; BEGIN PERFORM public.traffic_weekly_board(); EXCEPTION WHEN insufficient_privilege THEN v_blocked:=true; END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Non-staff accessed board RPC'; END IF;
  RAISE NOTICE 'PASS: opt-in cutoff, per-client cycles, idempotent real tasks, draft/version conflict, assignee ACL, immutable final history, successor independence, config preservation, cross-client rejection and non-staff isolation';
END;
$$;
RESET ROLE;
DO $$
DECLARE v_client uuid:=current_setting('weekly_test.client')::uuid; v_client2 uuid:=current_setting('weekly_test.client2')::uuid;
BEGIN
  -- Simulate a missed active cycle, keeping the server's operational date immutable.
  UPDATE public.traffic_weekly_settings SET starts_on=starts_on-7,enabled_since=enabled_since-7 WHERE client_id IN (v_client,v_client2);
  UPDATE public.traffic_client_ops SET primary_assignee_id=NULL WHERE client_id=v_client2;
  PERFORM set_config('request.jwt.claim.sub','',true); PERFORM set_config('request.jwt.claims','{}',true);
  PERFORM planeje_private.traffic_weekly_generate(public.central_trafego_operational_date());
  IF (SELECT count(*) FROM public.traffic_weekly_reviews WHERE client_id=v_client)<>1 THEN RAISE EXCEPTION 'Disabled client generated new review'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.traffic_weekly_generation_issues WHERE client_id=v_client2)
    OR (SELECT count(*) FROM public.traffic_weekly_reviews WHERE client_id=v_client2)<>1 THEN RAISE EXCEPTION 'Missing manager produced partial task or no visible issue'; END IF;
  UPDATE public.traffic_client_ops SET primary_assignee_id=current_setting('weekly_test.actor')::uuid WHERE client_id=v_client2;
  PERFORM planeje_private.traffic_weekly_generate(public.central_trafego_operational_date());
  PERFORM planeje_private.traffic_weekly_generate(public.central_trafego_operational_date());
  IF EXISTS(SELECT 1 FROM public.traffic_weekly_generation_issues WHERE client_id=v_client2)
    OR (SELECT count(*) FROM public.traffic_weekly_reviews WHERE client_id=v_client2)<>2 THEN RAISE EXCEPTION 'Repair failed to create single next week and clear issue'; END IF;
  RAISE NOTICE 'PASS: missed active cycle in job context, disabled period, visible missing-owner failure, repair/retry and idempotent catch-up';
END;
$$;
ROLLBACK;
