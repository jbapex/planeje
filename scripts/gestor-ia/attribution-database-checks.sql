-- Each case runs in its own transaction and rolls back; only canonical production SQL is exercised.

-- case: additive schema and API permissions
SELECT public.fixture_assert(to_regclass('public.mini_crm_status_history') IS NOT NULL,'real status changes require an audit ledger');
SELECT public.fixture_assert(to_regprocedure('public.gestor_ia_routine_leads_data(uuid,date,uuid,text)') IS NOT NULL,'explicit cohort mode is available');
SELECT public.fixture_assert(NOT has_function_privilege('anon','public.gestor_ia_routine_leads_data(uuid,date,uuid,text)','EXECUTE')
 AND has_function_privilege('authenticated','public.gestor_ia_routine_leads_data(uuid,date,uuid,text)','EXECUTE')
 AND has_function_privilege('service_role','public.gestor_ia_routine_leads_data(uuid,date,uuid,text)','EXECUTE'),'new reader keeps API roles');
SELECT public.fixture_assert(NOT has_table_privilege('authenticated','public.mini_crm_status_history','INSERT,UPDATE,DELETE')
 AND NOT has_table_privilege('service_role','public.mini_crm_status_history','INSERT,UPDATE,DELETE'),'API cannot forge or rewrite the ledger');
SELECT public.fixture_assert(NOT has_table_privilege('anon','public.mini_crm_status_history','SELECT'),'anonymous role cannot read the audit ledger');
SELECT public.fixture_assert(NOT EXISTS(SELECT FROM public.mini_crm_status_history),'migration does not fabricate pre-existing manual or automatic transitions');
SELECT public.fixture_assert((SELECT bool_and(p.oid IS NOT NULL AND ROW(p.prosecdef,p.provolatile,p.proconfig,p.proacl)
 IS NOT DISTINCT FROM ROW(f.prosecdef,f.provolatile,f.proconfig,f.proacl)) FROM public.fixture_existing_functions f LEFT JOIN pg_proc p ON p.oid=f.oid),'existing OIDs, security attributes, search_path and grants survive');
SELECT public.fixture_assert((SELECT relrowsecurity FROM pg_class WHERE oid='public.mini_crm_status_history'::regclass),'new public ledger has RLS enabled');
SELECT public.fixture_assert((SELECT bool_and(NOT has_function_privilege(role_name,signature,'EXECUTE'))
 FROM unnest(ARRAY['anon','authenticated','service_role']) role_name CROSS JOIN unnest(ARRAY[
 'planeje_private.gestor_ia_routine_tracking(public.cliente_whatsapp_contact)',
 'planeje_private.gestor_ia_routine_origin_catalog(uuid)',
 'planeje_private.mini_crm_capture_status()']) signature),'private helpers and trigger are not direct API entry points');
SELECT public.fixture_assert((SELECT prosecdef AND proconfig=ARRAY['search_path=""'] FROM pg_proc WHERE oid='planeje_private.mini_crm_capture_status()'::regprocedure),'audit writes only through a private definer trigger with a fixed search path');

-- case: links accept missing or explicit optional identity
INSERT INTO public.cliente_rastreamento_links(cliente_id,slug,destination_phone,campaign_id,campaign_name,adset_id,adset_name)
VALUES('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','synthetic-empty','5511000000001',NULL,NULL,NULL,NULL),
 ('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','synthetic-explicit','5511000000001','cmp_123','Campanha sintética','set_123','Conjunto sintético');
SELECT public.fixture_assert((SELECT campaign_id='cmp_123' AND adset_name='Conjunto sintético' FROM public.cliente_rastreamento_links WHERE slug='synthetic-explicit'),'explicit identity round trips without a remote lookup');
SELECT public.fixture_assert(has_table_privilege('authenticated','public.cliente_rastreamento_links','SELECT,INSERT,UPDATE,DELETE')
 AND has_table_privilege('service_role','public.cliente_rastreamento_links','SELECT,INSERT,UPDATE,DELETE'),'link grants survive additive columns');
INSERT INTO public.cliente_rastreamento_link_clicks(link_id,cliente_id,match_code,link_attribution)
SELECT id,cliente_id,'PJ-ABCDEF','{"platform":"meta","campaign_id":"cmp_123","campaign_name":"Campanha sintética","adset_id":"set_123","adset_name":"Conjunto sintético"}'
FROM public.cliente_rastreamento_links WHERE slug='synthetic-explicit';
UPDATE public.cliente_rastreamento_links SET campaign_id='cmp_later',campaign_name='Posterior' WHERE slug='synthetic-explicit';
SELECT public.fixture_assert((SELECT link_attribution->>'campaign_id'='cmp_123' FROM public.cliente_rastreamento_link_clicks WHERE match_code='PJ-ABCDEF'),'click keeps the configured snapshot when its link changes later');
SELECT public.fixture_error($q$UPDATE public.cliente_rastreamento_link_clicks SET link_attribution='[]' WHERE match_code='PJ-ABCDEF'$q$,'23514');

-- case: entry cohort remains compatible and manual legacy does not become a dated event
SELECT public.fixture_claims('00000000-0000-0000-0000-000000000001');
SET ROLE authenticated;
DO $$ DECLARE old_data jsonb; new_data jsonb; BEGIN
 old_data:=public.gestor_ia_routine_leads_data('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','2026-11-09');
 new_data:=public.gestor_ia_routine_leads_data('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','2026-11-09',NULL,'entrada');
 PERFORM public.fixture_assert(old_data=new_data AND jsonb_array_length(new_data->'contacts')=15,'three-argument reader retains fifteen first-entry contacts');
 PERFORM public.fixture_assert(NOT EXISTS(SELECT FROM jsonb_array_elements(new_data->'appointment_events') e WHERE e->>'contact_id'='10000000-0000-0000-0000-000000000021'),'current manual status and manualAt do not invent historical appointment events');
END $$;

-- case: weekly appointments include old contacts and use message timestamp in Brasilia
SELECT public.fixture_claims('00000000-0000-0000-0000-000000000001');
SET ROLE authenticated;
DO $$ DECLARE data jsonb; BEGIN
 data:=public.gestor_ia_routine_leads_data('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','2026-11-09',NULL,'agendados_na_semana');
 PERFORM public.fixture_assert(jsonb_array_length(data->'contacts')=20,'twenty factual scheduled people, deduplicated despite repeated message');
 PERFORM public.fixture_assert((SELECT count(*)=14 FROM jsonb_array_elements(data->'contacts') c WHERE (c->>'first_seen_at')::timestamptz>='2026-11-09 03:00Z'),'fourteen new contacts and six older contacts');
 PERFORM public.fixture_assert(NOT EXISTS(SELECT FROM jsonb_array_elements(data->'contacts') c WHERE c->>'id' IN('10000000-0000-0000-0000-000000000021','10000000-0000-0000-0000-000000000022','10000000-0000-0000-0000-000000000023')),'legacy manual, prior Sunday and next Monday are excluded');
 PERFORM public.fixture_assert(EXISTS(SELECT FROM jsonb_array_elements(data->'appointment_events') e WHERE e->>'contact_id'='10000000-0000-0000-0000-000000000001' AND e->>'source'='automatico' AND (e->>'at')::timestamptz='2026-11-09 03:00Z'),'Monday boundary is included by message_at, not appointment_day');
 PERFORM public.fixture_assert(NOT EXISTS(SELECT FROM jsonb_array_elements(data->'appointment_events') e WHERE e - ARRAY['contact_id','at','source','appointment_day'] <> '{}'::jsonb),'appointment projection contains only its declared safe fields');
END $$;

-- case: existing MCP dispatch forwards the explicit mode and keeps the entry default
SET ROLE service_role;
SELECT public.fixture_claims(NULL);
DO $$ DECLARE data jsonb; BEGIN
 data:=public.gestor_ia_routine_mcp('00000000-0000-0000-0000-000000000001','leads','9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','2026-11-09','{"modo":"agendados_na_semana"}');
 PERFORM public.fixture_assert(jsonb_array_length(data->'contacts')=20,'MCP receives the same twenty factual appointments');
 data:=public.gestor_ia_routine_mcp('00000000-0000-0000-0000-000000000001','leads','9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','2026-11-09');
 PERFORM public.fixture_assert(jsonb_array_length(data->'contacts')=15,'omitting mode keeps the entry cohort for existing MCP callers');
 PERFORM public.fixture_assert(coalesce(current_setting('request.jwt.claim.sub',true),'')='' AND current_setting('request.jwt.claims',true)='{}','nested reader and MCP both restore the service claims');
END $$;

-- case: network names are explicit and masked before frontend or MCP receives them
SELECT public.fixture_claims('00000000-0000-0000-0000-000000000001');
SET ROLE authenticated;
DO $$ DECLARE data jsonb; contact jsonb; BEGIN
 data:=public.gestor_ia_routine_leads_data('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','2026-11-09',NULL,'entrada');
 SELECT c INTO contact FROM jsonb_array_elements(data->'contacts') c WHERE c->>'id'='10000000-0000-0000-0000-000000000001';
 PERFORM public.fixture_assert(contact#>>'{tracking_data,campaign_name}'='Campanha •••• 0011'
  AND contact#>>'{tracking_data,adset_name}'='Conjunto •••• 0011' AND contact#>>'{tracking_data,ad_name}'='Anúncio •••• 0011','targeting names are available with embedded numbers masked');
 PERFORM public.fixture_assert(position('5511999990011' IN data::text)=0 AND position('@s.whatsapp.net' IN data::text)=0
  AND position('RAW-SYNTHETIC-SECRET' IN data::text)=0 AND position('Corpo pessoal' IN data::text)=0,'no raw phone, JID, personal body or payload leaves database');
END $$;

-- case: configured first-touch link snapshot is safe and does not hide contradictory enrichment
UPDATE public.cliente_whatsapp_contact SET tracking_data='{"planeje_link_id":"synthetic-link","planeje_link_origin":"meta_ads","planeje_link_attribution":{"platform":"meta","campaign_id":"cmp_first","campaign_name":"Primeira 5511999990011","adset_id":"set_first","adset_name":"Primeiro conjunto","raw_secret":"RAW-SYNTHETIC-SECRET"},"meta_ad_details":{"ad":{"account_id":"act_123","campaign":{"id":"cmp_later","name":"Posterior"},"adset":{"id":"set_later","name":"Posterior"}}}}'
WHERE id='10000000-0000-0000-0000-000000000001';
UPDATE public.cliente_whatsapp_contact SET tracking_data='{"planeje_link_id":"legacy-link","planeje_link_origin":"site","campaign_id":"cmp_later","adset_id":"set_later"}'
WHERE id='10000000-0000-0000-0000-000000000002';
SELECT public.fixture_claims('00000000-0000-0000-0000-000000000001');
SET ROLE authenticated;
DO $$ DECLARE data jsonb; configured jsonb; legacy jsonb; BEGIN
 data:=public.gestor_ia_routine_leads_data('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','2026-11-09',NULL,'entrada');
 SELECT c INTO configured FROM jsonb_array_elements(data->'contacts') c WHERE c->>'id'='10000000-0000-0000-0000-000000000001';
 SELECT c INTO legacy FROM jsonb_array_elements(data->'contacts') c WHERE c->>'id'='10000000-0000-0000-0000-000000000002';
 PERFORM public.fixture_assert(coalesce((configured#>>'{tracking_data,link_configured}')::boolean,(configured->>'link_configured')::boolean)
  AND configured#>>'{tracking_data,planeje_link_attribution,campaign_id}'='cmp_first'
  AND configured#>>'{tracking_data,planeje_link_attribution,campaign_name}'='Primeira •••• 0011','configured first-touch snapshot survives without a phone or raw payload');
 PERFORM public.fixture_assert(coalesce((configured#>>'{tracking_data,attribution_conflict}')::boolean,(configured->>'attribution_conflict')::boolean,false)
  OR (configured#>>'{tracking_data,campaign_id}'='cmp_later' AND configured#>>'{tracking_data,adset_id}'='set_later'),'conflicting enrichment stays visible or is explicitly marked before projection');
 PERFORM public.fixture_assert(NOT coalesce((legacy#>>'{tracking_data,link_configured}')::boolean,(legacy->>'link_configured')::boolean,false),'legacy link plus later campaign IDs cannot manufacture a configured snapshot');
 PERFORM public.fixture_assert(legacy#>>'{tracking_data,planeje_link_origin}'='site','safe link-origin enum lets the shared model reject enrichment on an unconfigured link');
 PERFORM public.fixture_assert(position('5511999990011' IN data::text)=0 AND position('RAW-SYNTHETIC-SECRET' IN data::text)=0,'snapshot projection preserves network privacy');
END $$;

-- case: contradictory non-link IDs stay visible after projection
UPDATE public.cliente_whatsapp_contact SET tracking_data='{"account_id":"123","campaign_id":"cmp_top","adset_id":"set_top","meta_ad_details":{"ad":{"account_id":"act_123","campaign":{"id":"cmp_nested"},"adset":{"id":"set_nested"}}}}'
WHERE id='10000000-0000-0000-0000-000000000001';
SELECT public.fixture_claims('00000000-0000-0000-0000-000000000001');
SET ROLE authenticated;
DO $$ DECLARE data jsonb; contact jsonb; BEGIN
 data:=public.gestor_ia_routine_leads_data('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','2026-11-09',NULL,'entrada');
 SELECT c INTO contact FROM jsonb_array_elements(data->'contacts') c WHERE c->>'id'='10000000-0000-0000-0000-000000000001';
 PERFORM public.fixture_assert((contact#>>'{tracking_data,attribution_conflict}')::boolean,'nested/top contradictory campaign and adset IDs cannot silently coalesce into a false match');
END $$;

-- case: contradictory ad identities cannot disappear during the safe projection
UPDATE public.cliente_whatsapp_contact SET tracking_data='{"source_id":"ad_source","meta_ad_details":{"ad":{"id":"ad_nested","campaign":{"id":"cmp_123"},"adset":{"id":"set_123"}}}}'
WHERE id='10000000-0000-0000-0000-000000000001';
SELECT public.fixture_claims('00000000-0000-0000-0000-000000000001');
SET ROLE authenticated;
DO $$ DECLARE data jsonb; contact jsonb; BEGIN
 data:=public.gestor_ia_routine_leads_data('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','2026-11-09',NULL,'entrada');
 SELECT c INTO contact FROM jsonb_array_elements(data->'contacts') c WHERE c->>'id'='10000000-0000-0000-0000-000000000001';
 PERFORM public.fixture_assert(contact#>>'{tracking_data,ad_id}'='ad_nested' AND (contact#>>'{tracking_data,attribution_conflict}')::boolean,'safe ad ID projection cannot hide source/ad disagreement');
END $$;

-- case: empty nested labels do not erase an existing explicit top-level name
UPDATE public.cliente_whatsapp_contact SET tracking_data='{"campaign_name":"Campanha preservada","adset_name":"Conjunto preservado","meta_ad_details":{"ad":{"campaign":{"name":" "},"adset":{"name":""}}}}'
WHERE id='10000000-0000-0000-0000-000000000001';
SELECT public.fixture_claims('00000000-0000-0000-0000-000000000001');
SET ROLE authenticated;
DO $$ DECLARE data jsonb; contact jsonb; BEGIN
 data:=public.gestor_ia_routine_leads_data('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','2026-11-09',NULL,'entrada');
 SELECT c INTO contact FROM jsonb_array_elements(data->'contacts') c WHERE c->>'id'='10000000-0000-0000-0000-000000000001';
 PERFORM public.fixture_assert(contact#>>'{tracking_data,campaign_name}'='Campanha preservada' AND contact#>>'{tracking_data,adset_name}'='Conjunto preservado','available explicit names survive incomplete enrichment');
END $$;

-- case: origin catalog uses only saved historical cache of currently linked accounts
SELECT public.fixture_claims('00000000-0000-0000-0000-000000000001');
SET ROLE authenticated;
DO $$ DECLARE data jsonb; BEGIN
 data:=public.gestor_ia_routine_leads_data('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','2026-11-09',NULL,'entrada');
 PERFORM public.fixture_assert(EXISTS(SELECT FROM jsonb_array_elements(data->'origin_catalog') c WHERE c->>'account_id'='act_123'
  AND c->>'campaign_id'='cmp_paused' AND c->>'adset_id'='set_paused' AND c->>'campaign_status'='PAUSED'),'paused historical origin remains identifiable without inventing weekly spend');
 PERFORM public.fixture_assert(position('unlinked_campaign' IN data::text)=0 AND position('UNLINKED-ACCOUNT-SECRET' IN data::text)=0,'unlinked account never enters origin catalog');
 PERFORM public.fixture_assert(NOT EXISTS(SELECT FROM jsonb_array_elements(data->'origin_catalog') c WHERE c - ARRAY['account_id','campaign_id','campaign_name','adset_id','adset_name','campaign_status','ad_id','ad_name']<>'{}'::jsonb),'catalog excludes spend and raw cache fields');
END $$;

-- case: malformed cache status cannot carry a raw object into the network DTO
UPDATE public.gestor_ia_meta_cache SET dados=jsonb_set(dados,'{campaignMeta,cmp_paused,status}','{"raw_secret":"RAW-SYNTHETIC-SECRET"}')
WHERE conta_id='act_123';
SELECT public.fixture_claims('00000000-0000-0000-0000-000000000001');
SET ROLE authenticated;
DO $$ DECLARE data jsonb; BEGIN
 data:=public.gestor_ia_routine_leads_data('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','2026-11-09',NULL,'entrada');
 PERFORM public.fixture_assert(position('RAW-SYNTHETIC-SECRET' IN data::text)=0,'non-string cache values cannot escape through the campaign status label');
 PERFORM public.fixture_assert(EXISTS(SELECT FROM jsonb_array_elements(data->'origin_catalog') c WHERE c->>'campaign_status'='PAUSED'),'valid effective status remains available when configured status is malformed');
END $$;

-- case: manual changes log once and retain actor and appointment semantics after config rename
SELECT public.fixture_claims('00000000-0000-0000-0000-000000000001');
SET ROLE authenticated;
SELECT public.mini_crm_patch_contact('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','10000000-0000-0000-0000-000000000021','{"status":"visit_reserved"}');
SELECT public.mini_crm_patch_contact('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','10000000-0000-0000-0000-000000000021','{"observacao":"Somente uma nota"}');
RESET ROLE;
SELECT public.fixture_assert((SELECT count(*)=1 AND bool_and(reason='manual' AND actor_id='00000000-0000-0000-0000-000000000001'
 AND actor_type='pessoa' AND previous_status='Agendado' AND status='visit_reserved' AND is_appointment AND at>=transaction_timestamp())
 FROM public.mini_crm_status_history WHERE contact_id='10000000-0000-0000-0000-000000000021'),'manual transition is audited once with trusted identity and current change timestamp');
UPDATE public.mini_crm_config SET statuses='[{"key":"visit_reserved","label":"Contato"}]';
SELECT set_config('fixture.today',(current_date+7)::text,true);
SET ROLE authenticated;
DO $$ DECLARE data jsonb; week date:=date_trunc('week',clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date; BEGIN
 data:=public.gestor_ia_routine_leads_data('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69',week,NULL,'agendados_na_semana');
 PERFORM public.fixture_assert(EXISTS(SELECT FROM jsonb_array_elements(data->'appointment_events') e WHERE e->>'contact_id'='10000000-0000-0000-0000-000000000021' AND e->>'source'='manual' AND e->>'appointment_day'='2026-11-20'),'renaming a label cannot erase a factual manual appointment or its saved day');
END $$;

-- case: direct updates, repeated status and status removal follow actual transitions
SELECT public.fixture_claims('00000000-0000-0000-0000-000000000001');
SET ROLE authenticated;
UPDATE public.cliente_whatsapp_contact SET mini_crm=mini_crm||'{"status":"negative"}' WHERE id='10000000-0000-0000-0000-000000000001';
UPDATE public.cliente_whatsapp_contact SET mini_crm=mini_crm||'{"status":"negative","contato_nome":"Outro nome"}' WHERE id='10000000-0000-0000-0000-000000000001';
UPDATE public.cliente_whatsapp_contact SET mini_crm=mini_crm-'status' WHERE id='10000000-0000-0000-0000-000000000001';
RESET ROLE;
SELECT public.fixture_assert((SELECT count(*)=2 AND NOT bool_or(is_appointment) FROM public.mini_crm_status_history WHERE contact_id='10000000-0000-0000-0000-000000000001'),'same status is not a transition; negation and removal are audited without appointment');
SELECT public.fixture_assert(EXISTS(SELECT FROM public.mini_crm_status_history WHERE contact_id='10000000-0000-0000-0000-000000000001' AND previous_status='negative' AND status IS NULL),'removing status records the nullable new value');

-- case: automatic apply preserves manual guard and records one audit row plus message history
SET ROLE service_role;
SELECT public.fixture_claims(NULL);
DO $$ DECLARE result jsonb; expected jsonb; rules_at timestamptz; config_at timestamptz; at_time timestamptz:=clock_timestamp(); BEGIN
 SELECT mini_crm INTO expected FROM public.cliente_whatsapp_contact WHERE id='10000000-0000-0000-0000-000000000021';
 -- Fixture removes a legacy manual stop without changing status, before applying a new confirmed event.
 UPDATE public.cliente_whatsapp_contact SET mini_crm=mini_crm-'_planeje_message_status' WHERE id='10000000-0000-0000-0000-000000000021';
 expected:=expected-'_planeje_message_status';
 SELECT updated_at INTO rules_at FROM public.mini_crm_message_rules;
 SELECT updated_at INTO config_at FROM public.mini_crm_config;
 PERFORM pg_sleep(0.01);
 result:=public.mini_crm_apply_message('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','10000000-0000-0000-0000-000000000021',rules_at,config_at,
  expected,'{"status":"Perdido","_planeje_message_status":{"manual":false}}','fixture-channel','new-rule-message',at_time,'keyword:closed');
 PERFORM public.fixture_assert(result->>'applied'='true','canonical automatic apply remains enabled');
 result:=public.mini_crm_apply_message('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','10000000-0000-0000-0000-000000000021',rules_at,config_at,
  '{"status":"Perdido","data_agendamento":"2026-11-20","_planeje_message_status":{"manual":false}}','{"status":"Perdido"}',
  'fixture-channel','new-rule-message',at_time,'keyword:closed');
 PERFORM public.fixture_assert(result->>'applied'='false','replayed message cannot apply twice');
END $$;
RESET ROLE;
SELECT public.fixture_assert((SELECT count(*)=1 AND bool_and(reason='keyword:closed' AND actor_type='automacao' AND actor_id IS NULL AND at>=transaction_timestamp()
 AND at>(SELECT message_at FROM public.mini_crm_message_history WHERE message_id='new-rule-message')) FROM public.mini_crm_status_history WHERE contact_id='10000000-0000-0000-0000-000000000021'),'automatic transition gets one trusted audit row at change time, not message time');
SELECT public.fixture_assert((SELECT count(*)=1 FROM public.mini_crm_message_history WHERE message_id='new-rule-message'),'existing message ledger remains unique');

-- case: another automatic appointment in the same status creates evidence without a false status transition
SET ROLE service_role;
SELECT public.fixture_claims(NULL);
DO $$ DECLARE result jsonb; expected jsonb; rules_at timestamptz; config_at timestamptz; BEGIN
 UPDATE public.cliente_whatsapp_contact SET mini_crm=mini_crm-'_planeje_message_status' WHERE id='10000000-0000-0000-0000-000000000021';
 SELECT mini_crm INTO expected FROM public.cliente_whatsapp_contact WHERE id='10000000-0000-0000-0000-000000000021';
 SELECT updated_at INTO rules_at FROM public.mini_crm_message_rules;
 SELECT updated_at INTO config_at FROM public.mini_crm_config;
 result:=public.mini_crm_apply_message('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','10000000-0000-0000-0000-000000000021',rules_at,config_at,
  expected,'{"status":"Agendado","_planeje_message_status":{"manual":false}}','fixture-channel','same-status-appointment',clock_timestamp(),'appointment',current_date+1);
 PERFORM public.fixture_assert(result->>'applied'='true','a new confirmed appointment does not require changing the existing status');
END $$;
RESET ROLE;
SELECT public.fixture_assert(NOT EXISTS(SELECT FROM public.mini_crm_status_history)
 AND (SELECT count(*)=1 FROM public.mini_crm_message_history WHERE message_id='same-status-appointment' AND reason='appointment'),'same-status appointment stays factual in the message ledger without duplicating audit transitions');

-- case: forged metadata or GUC cannot turn a person into an automatic actor
SELECT public.fixture_claims('00000000-0000-0000-0000-000000000001');
SET ROLE authenticated;
SELECT set_config('planeje.mini_message_auto','on',true);
SELECT set_config('planeje.mini_status_context','{"reason":"appointment","at":"2000-01-01T00:00:00Z","actor_id":"00000000-0000-0000-0000-000000000002"}',true);
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","session_id":"00000000-0000-0000-0000-000000000001","role":"service_role","user_metadata":{"role":"service_role"}}',true);
UPDATE public.cliente_whatsapp_contact SET mini_crm='{"status":"Perdido","_planeje_message_status":{"manual":false,"reason":"appointment"}}' WHERE id='10000000-0000-0000-0000-000000000001';
RESET ROLE;
SELECT public.fixture_assert((SELECT count(*)=1 AND bool_and(reason='manual' AND actor_type='pessoa' AND actor_id='00000000-0000-0000-0000-000000000001' AND NOT is_appointment AND at>=transaction_timestamp()) FROM public.mini_crm_status_history WHERE contact_id='10000000-0000-0000-0000-000000000001'),'editable metadata and transaction settings never prove service identity');
SELECT public.fixture_assert((SELECT mini_crm#>>'{_planeje_message_status,manual}'='true' FROM public.cliente_whatsapp_contact WHERE id='10000000-0000-0000-0000-000000000001'),'existing manual pause remains effective');

-- case: failed update rolls back both contact and append-only audit
DO $$ DECLARE original jsonb; BEGIN
 SELECT mini_crm INTO original FROM public.cliente_whatsapp_contact WHERE id='10000000-0000-0000-0000-000000000001';
 BEGIN
  PERFORM public.fixture_claims('00000000-0000-0000-0000-000000000001');
  SET LOCAL ROLE authenticated;
  PERFORM public.mini_crm_patch_contact('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','10000000-0000-0000-0000-000000000001','{"status":"Perdido"}');
  RAISE EXCEPTION 'Synthetic transaction failure' USING ERRCODE='P0002';
 EXCEPTION WHEN no_data_found THEN NULL;
 END;
 PERFORM public.fixture_assert((SELECT mini_crm=original FROM public.cliente_whatsapp_contact WHERE id='10000000-0000-0000-0000-000000000001') AND NOT EXISTS(SELECT FROM public.mini_crm_status_history),'rolled-back transaction leaves no phantom status event');
END $$;

-- case: ledger RLS follows contact visibility and denies direct forgery
SELECT public.fixture_claims('00000000-0000-0000-0000-000000000001');
SET ROLE authenticated;
UPDATE public.cliente_whatsapp_contact SET mini_crm='{"status":"Perdido"}' WHERE id='10000000-0000-0000-0000-000000000001';
SELECT public.fixture_assert((SELECT count(*)=1 FROM public.mini_crm_status_history),'contact owner can read its new status audit');
SELECT public.fixture_error($q$INSERT INTO public.mini_crm_status_history(cliente_id,contact_id,status,reason,actor_type,is_appointment) VALUES('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','10000000-0000-0000-0000-000000000001','Agendado','manual','pessoa',true)$q$,'42501');
RESET ROLE;
SELECT public.fixture_claims('00000000-0000-0000-0000-000000000002');
SET ROLE authenticated;
SELECT public.fixture_assert(NOT EXISTS(SELECT FROM public.mini_crm_status_history),'other portfolio cannot read another contact ledger');
RESET ROLE;
INSERT INTO public.atendimento_usuario_acesso VALUES('00000000-0000-0000-0000-000000000001','9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','00000000-0000-0000-0000-00000000a002');
SELECT public.fixture_claims('00000000-0000-0000-0000-000000000001');
SET ROLE authenticated;
SELECT public.fixture_assert(NOT EXISTS(SELECT FROM public.mini_crm_status_history),'channel-restricted contact also restricts ledger');

-- case: both cohort modes preserve channel, private, client and module gates
INSERT INTO public.atendimento_usuario_acesso VALUES('00000000-0000-0000-0000-000000000001','9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','00000000-0000-0000-0000-00000000a001');
INSERT INTO public.cliente_atend_conversas VALUES('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','10000000-0000-0000-0000-000000000019',true,'00000000-0000-0000-0000-000000000002');
SELECT public.fixture_claims(NULL);
SET ROLE service_role;
DO $$ DECLARE data jsonb; BEGIN
 data:=public.gestor_ia_routine_leads_data('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','2026-11-09','00000000-0000-0000-0000-000000000001','agendados_na_semana');
 PERFORM public.fixture_assert(jsonb_array_length(data->'contacts')=18,'private and other-channel appointments are excluded before network');
 PERFORM public.fixture_assert(NOT EXISTS(SELECT FROM jsonb_array_elements(data->'appointment_events') e WHERE e->>'contact_id' IN('10000000-0000-0000-0000-000000000019','10000000-0000-0000-0000-000000000020')),'hidden contact events are absent too');
 PERFORM public.fixture_assert(coalesce(current_setting('request.jwt.claim.sub',true),'')='' AND current_setting('request.jwt.claims',true)='{}','service actor claims are restored');
END $$;
RESET ROLE;
INSERT INTO public.user_module_permissions VALUES('00000000-0000-0000-0000-000000000001','rastreamento',false);
SELECT public.fixture_claims('00000000-0000-0000-0000-000000000001');
SET ROLE authenticated;
SELECT public.fixture_error($q$SELECT public.gestor_ia_routine_leads_data('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','2026-11-09',NULL,'agendados_na_semana')$q$,'42501');
SELECT public.fixture_error($q$SELECT public.gestor_ia_routine_leads_data('00000000-0000-0000-0000-000000000099','2026-11-09',NULL,'entrada')$q$,'42501');
SELECT public.fixture_error($q$SELECT public.gestor_ia_routine_leads_data('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','2026-11-09','00000000-0000-0000-0000-000000000002','entrada')$q$,'42501');

-- case: configured Linktree Meta origin is not forced to site or inferred from a later campaign
DO $$ DECLARE contact public.cliente_whatsapp_contact; BEGIN
 SELECT * INTO contact FROM public.cliente_whatsapp_contact LIMIT 1;
 contact.origin_source:='meta_ads'; contact.utm_source:='Linktree';
 contact.tracking_data:='{"planeje_link_id":"synthetic-link","planeje_link_origin":"meta_ads","campaign_id":"cmp_123"}';
 PERFORM public.fixture_assert(planeje_private.gestor_ia_routine_origin(contact)='meta_ads','configured Meta link snapshot beats legacy Linktree fallback');
 contact.origin_source:='site';
 PERFORM public.fixture_assert(planeje_private.gestor_ia_routine_origin(contact)='meta_ads','explicit Meta link snapshot corrects the legacy Linktree site presentation');
 contact.origin_source:='google_ads';
 PERFORM public.fixture_assert(planeje_private.gestor_ia_routine_origin(contact)='google_ads','explicit Google origin remains Google');
 contact.origin_source:='meta_ads'; contact.tracking_data:='{"planeje_link_id":"legacy-link","planeje_link_origin":"site","campaign_id":"later_campaign"}';
 PERFORM public.fixture_assert(planeje_private.gestor_ia_routine_origin(contact)='site','explicit Linktree site snapshot remains site');
 contact.tracking_data:='{"planeje_link_id":"legacy-link","campaign_id":"later_campaign"}';
 PERFORM public.fixture_assert(planeje_private.gestor_ia_routine_origin(contact)='meta_ads','Linktree UTM alone cannot invent a site classification');
 contact.origin_source:='site'; contact.utm_source:='Outro source'; contact.tracking_data:='{"meta_ad_details":{"ad":{"campaign":{"id":"later_campaign"}}}}';
 PERFORM public.fixture_assert(planeje_private.gestor_ia_routine_origin(contact)='site','non-Linktree first site touch is preserved');
END $$;

-- case: invalid cohort mode is rejected without changing data
SELECT public.fixture_claims('00000000-0000-0000-0000-000000000001');
SET ROLE authenticated;
SELECT public.fixture_error($q$SELECT public.gestor_ia_routine_leads_data('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','2026-11-09',NULL,'anything')$q$,'22023');

-- case: complete weekly appointment cohort exceeds the PostgREST row cap safely
INSERT INTO public.cliente_whatsapp_contact(id,cliente_id,from_jid,first_seen_at,whatsapp_config_id,origin_source)
SELECT ('20000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'9196d07f-f0a8-4eb2-9f9a-3dade28d4a69',
 'synthetic-volume-'||n||'@s.whatsapp.net','2026-10-01 12:00Z','00000000-0000-0000-0000-00000000a001','manual' FROM generate_series(1,1001) n;
INSERT INTO public.mini_crm_message_history(cliente_id,contact_id,channel_id,message_id,message_at,status,reason)
SELECT '9196d07f-f0a8-4eb2-9f9a-3dade28d4a69',('20000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 'volume','volume-'||n,'2026-11-12 12:00Z','Agendado','appointment' FROM generate_series(1,1001) n;
SELECT public.fixture_claims('00000000-0000-0000-0000-000000000001');
SET ROLE authenticated;
SELECT public.fixture_assert(jsonb_array_length(public.gestor_ia_routine_leads_data('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','2026-11-09',NULL,'agendados_na_semana')->'contacts')=1021,'one JSON DTO returns every one of 1021 authorized appointment contacts');
