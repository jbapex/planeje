\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE actor uuid; staff uuid; client uuid:=gen_random_uuid();
BEGIN
 SELECT id INTO STRICT actor FROM public.profiles WHERE role='superadmin' AND status='active' LIMIT 1;
 SELECT id INTO STRICT staff FROM public.profiles WHERE role='colaborador' AND status='active' LIMIT 1;
 INSERT INTO public.clientes(id,empresa,owner_id,etapa) VALUES(client,'[QA TRANSACIONAL] Planilha semanal',actor,'closed');
 PERFORM set_config('sheet.client',client::text,true); PERFORM set_config('sheet.actor',actor::text,true); PERFORM set_config('sheet.staff',staff::text,true);
 PERFORM set_config('request.jwt.claim.sub',actor::text,true); PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
END; $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE client uuid:=current_setting('sheet.client')::uuid; week date:=date_trunc('week',public.central_trafego_operational_date()::timestamp)::date-7;
 r uuid; o uuid; rows jsonb; payload jsonb; blocked boolean; current_review uuid;
BEGIN
 IF has_function_privilege('anon','public.start_traffic_week_record(uuid,date,text)','EXECUTE') THEN RAISE EXCEPTION 'Anonymous create enabled'; END IF;
 r:=public.start_traffic_week_record(client,week,'review');
 IF public.start_traffic_week_record(client,week,'review')<>r OR (SELECT count(*) FROM public.tarefas WHERE client_id=client)<>1 THEN RAISE EXCEPTION 'Manual opening duplicated'; END IF;
 IF EXISTS(SELECT 1 FROM public.traffic_weekly_settings WHERE client_id=client) THEN RAISE EXCEPTION 'Manual changed cadence'; END IF;
 rows:=jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'platform','meta','account_id','QA','account_name','Conta QA','campaign_name','Campanha QA','campaign_id','campaign-QA','adset_name','Conjunto 1','adset_id','set1','conversion_label','Lead','spend',400,'messages',30,'appointments',2,'conversions',4),
 jsonb_build_object('id',gen_random_uuid(),'platform','meta','account_id','QA','account_name','Conta QA','campaign_name','Campanha QA','campaign_id','campaign-QA','adset_name','Conjunto 2','adset_id','set2','conversion_label','Lead','spend',350,'messages',12,'appointments',3,'conversions',2));
 payload:=jsonb_build_object('metric_mode','campaign','campaign_metrics',rows,'analysis','Resultados conferidos por conjunto.','action_mode','none');
 PERFORM public.save_traffic_weekly_review(r,0,payload,false);
 IF (SELECT investment FROM public.traffic_weekly_reviews WHERE id=r)<>750 OR (SELECT campaign_metrics->1->>'messages' FROM public.traffic_weekly_reviews WHERE id=r)<>'12' THEN RAISE EXCEPTION 'New fields/sums lost'; END IF;
 blocked:=false; BEGIN PERFORM public.save_traffic_weekly_review(r,1,payload||jsonb_build_object('campaign_metrics',rows||jsonb_build_array((rows->0)||jsonb_build_object('id',gen_random_uuid()))),false); EXCEPTION WHEN OTHERS THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Duplicate set accepted'; END IF;
 blocked:=false; BEGIN PERFORM public.save_traffic_weekly_review(r,1,payload||jsonb_build_object('campaign_metrics',jsonb_build_array((rows->0)||jsonb_build_object('messages',1.5))),false); EXCEPTION WHEN OTHERS THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Fractional messages accepted'; END IF;
 PERFORM public.save_traffic_weekly_review(r,1,payload,true);
 o:=public.start_traffic_week_record(client,week,'optimization');
 IF o=r OR (SELECT count(*) FROM public.tarefas WHERE client_id=client)<>2 THEN RAISE EXCEPTION 'Optimization not independent'; END IF;
 current_review:=public.start_traffic_week_record(client,week+7,'review');
 blocked:=false; BEGIN PERFORM public.save_traffic_weekly_review(current_review,0,payload,true); EXCEPTION WHEN OTHERS THEN blocked:=position('encerrada' IN SQLERRM)>0; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Open week finalized'; END IF;
 PERFORM set_config('request.jwt.claim.sub',current_setting('sheet.staff'),true); PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('sheet.staff'),'role','authenticated')::text,true);
 blocked:=false; BEGIN PERFORM public.start_traffic_week_record(client,week-7,'review'); EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Unassigned reader created routine'; END IF;
 RAISE NOTICE 'PASS: manual opening/idempotence, no schedule mutation, independent types, per-set snapshots/sums, duplicate/integer rejection, open-week gate, reader ACL';
END; $$;
ROLLBACK;
