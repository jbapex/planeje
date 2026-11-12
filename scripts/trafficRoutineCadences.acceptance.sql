\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE actor uuid; staff uuid; other uuid; client uuid:=gen_random_uuid(); second uuid:=gen_random_uuid(); account uuid:=gen_random_uuid();
BEGIN
  SELECT id INTO STRICT actor FROM public.profiles WHERE role='superadmin' AND status='active' LIMIT 1;
  SELECT id INTO STRICT staff FROM public.profiles WHERE role='colaborador' AND status='active' LIMIT 1;
  SELECT id INTO STRICT other FROM public.profiles WHERE role='colaborador' AND status='active' AND id<>staff LIMIT 1;
  INSERT INTO public.clientes(id,empresa,owner_id,etapa) VALUES(client,'[QA TRANSACIONAL] Cadências de tráfego',actor,'closed'),(second,'[QA TRANSACIONAL] Outra conta',actor,'closed');
  INSERT INTO public.cliente_google_ads_accounts(id,cliente_id,google_customer_id,google_customer_name,is_active) VALUES(account,client,'QA-000-000','Conta fictícia de validação',true);
  PERFORM set_config('dual.actor',actor::text,true); PERFORM set_config('dual.staff',staff::text,true); PERFORM set_config('dual.other',other::text,true);
  PERFORM set_config('dual.client',client::text,true); PERFORM set_config('dual.second',second::text,true); PERFORM set_config('dual.account',account::text,true);
  PERFORM set_config('request.jwt.claim.sub',actor::text,true); PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
END;
$$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE today date:=public.central_trafego_operational_date(); weekday integer:=least(5,extract(isodow FROM today)::integer);
BEGIN
  IF has_function_privilege('anon','public.save_traffic_routine_settings(uuid,boolean,integer,date,text,uuid,boolean,integer)','EXECUTE') THEN RAISE EXCEPTION 'Anonymous settings opened'; END IF;
  PERFORM public.save_traffic_routine_settings(current_setting('dual.client')::uuid,true,weekday,today,'Agendamentos',current_setting('dual.staff')::uuid,true,weekday);
  PERFORM public.save_traffic_routine_settings(current_setting('dual.second')::uuid,false,weekday,today,'Compras',current_setting('dual.staff')::uuid,true,weekday);
END;
$$;
RESET ROLE;
-- Weekend-safe fixture: only transactional QA dates are changed.
UPDATE public.traffic_weekly_settings SET starts_on=public.central_trafego_operational_date()-greatest(0,extract(isodow FROM public.central_trafego_operational_date())::integer-5),
  enabled_since=public.central_trafego_operational_date()-greatest(0,extract(isodow FROM public.central_trafego_operational_date())::integer-5),
  optimization_enabled_since=public.central_trafego_operational_date()-greatest(0,extract(isodow FROM public.central_trafego_operational_date())::integer-5)
  WHERE client_id IN(current_setting('dual.client')::uuid,current_setting('dual.second')::uuid);
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true);
SELECT planeje_private.traffic_weekly_generate(public.central_trafego_operational_date());
SELECT planeje_private.traffic_weekly_generate(public.central_trafego_operational_date());
SELECT set_config('request.jwt.claim.sub',current_setting('dual.actor'),true),set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('dual.actor'),'role','authenticated')::text,true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE client uuid:=current_setting('dual.client')::uuid; review public.traffic_weekly_reviews; optimization public.traffic_weekly_reviews; rows jsonb; payload jsonb; blocked boolean; count_before integer;
BEGIN
  IF (SELECT count(*) FROM public.traffic_weekly_reviews WHERE client_id=client)<>2 OR (SELECT count(*) FROM public.tarefas WHERE client_id=client)<>2 THEN RAISE EXCEPTION 'Two cadences not independent or duplicated'; END IF;
  IF EXISTS(SELECT 1 FROM public.traffic_weekly_reviews WHERE client_id=current_setting('dual.second')::uuid AND kind='review') THEN RAISE EXCEPTION 'Disabled review generated from optimization'; END IF;
  SELECT * INTO STRICT review FROM public.traffic_weekly_reviews WHERE client_id=client AND kind='review';
  SELECT * INTO STRICT optimization FROM public.traffic_weekly_reviews WHERE client_id=client AND kind='optimization';
  IF optimization.week_start<>review.week_start+7 OR review.task_id=optimization.task_id THEN RAISE EXCEPTION 'Wrong reporting/current-week periods'; END IF;
  rows:=jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'account_link_id',current_setting('dual.account'),'platform','meta','account_id','tampered','account_name','Tampered',
    'campaign_name','Campanha fictícia','campaign_id','QA-CAMPAIGN','conversion_label','Lead confirmado no Ads','spend',100,'conversions',12.5,'daily_budget',30,'calls',2,'cpc',2.3));
  payload:=jsonb_build_object('metric_mode','campaign','campaign_metrics',rows,'analysis','Campanhas conferidas; nenhuma alteração necessária.','action_mode','none');
  blocked:=false;
  BEGIN PERFORM public.save_traffic_weekly_review(review.id,0,payload||jsonb_build_object('campaign_metrics',rows||rows),true); EXCEPTION WHEN OTHERS THEN blocked:=true; END;
  IF NOT blocked OR (SELECT revision FROM public.traffic_weekly_reviews WHERE id=review.id)<>0 THEN RAISE EXCEPTION 'Duplicate accepted or partial metrics saved'; END IF;
  blocked:=false;
  BEGIN PERFORM public.save_traffic_weekly_review(review.id,0,payload||jsonb_build_object('campaign_metrics',jsonb_build_array((rows->0)||jsonb_build_object('account_link_id',gen_random_uuid()))),true); EXCEPTION WHEN OTHERS THEN blocked:=position('deste cliente' IN SQLERRM)>0; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Foreign or unknown account accepted'; END IF;
  blocked:=false;
  BEGIN PERFORM public.save_traffic_weekly_review(review.id,0,payload||jsonb_build_object('campaign_metrics',jsonb_build_array((rows->0)||jsonb_build_object('spend','NaN'))),true); EXCEPTION WHEN OTHERS THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Non-finite campaign spend accepted'; END IF;
  PERFORM set_config('request.jwt.claim.sub',current_setting('dual.other'),true); PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('dual.other'),'role','authenticated')::text,true);
  blocked:=false;
  BEGIN PERFORM public.save_traffic_weekly_review(optimization.id,0,jsonb_build_object('analysis','Outro leitor','action_mode','none'),true); EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Reader finalized optimization'; END IF;
  PERFORM set_config('request.jwt.claim.sub',current_setting('dual.staff'),true); PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('dual.staff'),'role','authenticated')::text,true);
  PERFORM public.save_traffic_weekly_review(review.id,0,payload,true); PERFORM public.save_traffic_weekly_review(review.id,0,payload,true);
  IF (SELECT count(*) FROM public.tarefas WHERE client_id=client)<>2 OR NOT EXISTS(SELECT 1 FROM public.tarefas WHERE id=optimization.task_id AND status<>'completed') THEN RAISE EXCEPTION 'Report finalized optimization'; END IF;
  SELECT * INTO review FROM public.traffic_weekly_reviews WHERE id=review.id;
  IF review.investment<>100 OR review.contacts IS NOT NULL OR review.results IS NOT NULL OR review.campaign_metrics->0->>'platform'<>'google'
    OR review.campaign_metrics->0->>'account_id'<>'QA-000-000' OR (review.campaign_metrics->0->>'conversions')::numeric<>12.5 THEN RAISE EXCEPTION 'Snapshots/denominators mixed or link identity not canonical'; END IF;
  blocked:=false; BEGIN UPDATE public.tarefas SET status='completed' WHERE id=optimization.task_id; EXCEPTION WHEN OTHERS THEN blocked:=position('Rotina semanal' IN SQLERRM)>0; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Generic task completion bypassed optimization record'; END IF;
  PERFORM public.save_traffic_weekly_review(optimization.id,0,jsonb_build_object('analysis','Saldo e campanha conferidos. Desempenho estável; nenhuma alteração necessária.','action_mode','none'),true);
  PERFORM public.save_traffic_weekly_review(optimization.id,0,jsonb_build_object('analysis','Retry','action_mode','none'),true);
  IF NOT EXISTS(SELECT 1 FROM public.tarefas WHERE id=optimization.task_id AND status='completed') OR (SELECT count(*) FROM public.traffic_weekly_history WHERE review_id=optimization.id AND event='finalized')<>1 THEN RAISE EXCEPTION 'Optimization completion not idempotent'; END IF;
  IF jsonb_array_length(public.traffic_weekly_client_history(client))<>1 OR jsonb_array_length(public.traffic_routine_client_history(client,'optimization'))<>1 THEN RAISE EXCEPTION 'History kinds mixed'; END IF;
  -- Campaign identity and name remain immutable even after account rename.
  PERFORM set_config('request.jwt.claim.sub',current_setting('dual.actor'),true); PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('dual.actor'),'role','authenticated')::text,true);
  UPDATE public.cliente_google_ads_accounts SET google_customer_name='Novo nome' WHERE id=current_setting('dual.account')::uuid;
  IF (SELECT campaign_metrics->0->>'account_name' FROM public.traffic_weekly_reviews WHERE id=review.id)<>'Conta fictícia de validação' THEN RAISE EXCEPTION 'Historical account name rewritten'; END IF;
  PERFORM public.save_traffic_routine_settings(client,false,1,public.central_trafego_operational_date(),'Agendamentos',current_setting('dual.actor')::uuid,false,3);
  PERFORM public.refresh_traffic_weekly_routine();
  IF (SELECT count(*) FROM public.traffic_weekly_reviews WHERE client_id=client)<>2 THEN RAISE EXCEPTION 'Disable erased/generated historical cycles'; END IF;
  RAISE NOTICE 'PASS: independent cadences/periods, deduplication, opt-in, campaign account ACL/canonical snapshots, fractional conversions, no mixed CRM denominator, two finalizations, generic gate, immutable history and opt-out preservation';
END;
$$;
ROLLBACK;
