CREATE FUNCTION public.fixture_assert(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',message; END IF; END $$;
CREATE FUNCTION public.fixture_error(statement text,code text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE statement;
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE<>code THEN RAISE EXCEPTION 'Expected %, got %: %',code,SQLSTATE,SQLERRM; END IF;
  RETURN;
 END;
 RAISE EXCEPTION 'Expected error %, statement succeeded',code;
END $$;
SELECT public.fixture_assert(NOT has_function_privilege('anon','public.gestor_ia_routine_mcp(uuid,text,uuid,date,jsonb)','EXECUTE') AND NOT has_function_privilege('authenticated','public.gestor_ia_routine_mcp(uuid,text,uuid,date,jsonb)','EXECUTE') AND has_function_privilege('service_role','public.gestor_ia_routine_mcp(uuid,text,uuid,date,jsonb)','EXECUTE'),'only service can execute MCP RPC');
SELECT public.fixture_assert(NOT has_function_privilege('anon','public.gestor_ia_routine_leads_data(uuid,date,uuid)','EXECUTE') AND has_function_privilege('authenticated','public.gestor_ia_routine_leads_data(uuid,date,uuid)','EXECUTE'),'leads RPC requires authenticated team or service');
SET ROLE service_role;
SET request.jwt.claims='{}';
DO $$
DECLARE panel jsonb; saved jsonb; r public.traffic_weekly_reviews; task_count integer; history_count integer;
 client uuid:='9196d07f-f0a8-4eb2-9f9a-3dade28d4a69'; actor uuid:='00000000-0000-0000-0000-000000000001';
 lines jsonb:='[{"platform":"meta","account_id":"123","account_name":"Conta sintética","campaign_name":"Noivas","conversion_label":"Agendamentos","spend":150,"appointments":3}]';
BEGIN
 panel:=public.gestor_ia_routine_mcp(actor,'panel',NULL,'2026-11-09');
 PERFORM public.fixture_assert(jsonb_array_length(panel->'clientes')=1 AND panel->'clientes'->0->>'status'='a_preencher','panel isolates carteira');
 saved:=public.gestor_ia_routine_mcp(actor,'read',client,'2026-11-09');
 PERFORM public.fixture_assert(saved->'review'='null','read missing review does not create');
 saved:=public.gestor_ia_routine_mcp(actor,'save',client,'2026-11-09',jsonb_build_object('linhas',lines,'analise','Análise inicial IA'));
 SELECT * INTO r FROM public.traffic_weekly_reviews WHERE id=(saved->'review'->>'id')::uuid;
 PERFORM public.fixture_assert(r.revision=1 AND r.fill_origin='ia' AND r.validation_state='rascunho_ia' AND r.finalized_at IS NULL AND r.investment=150,'AI always creates draft via canonical save');
 PERFORM public.fixture_assert(r.action_mode='undecided' AND r.action_task_id IS NULL AND (SELECT status='pending' FROM public.tarefas WHERE id=r.task_id),'AI did not finish or create successor');
 PERFORM public.fixture_assert(r.campaign_metrics->0->>'id' IS NOT NULL,'canonical row UUID assigned');
 PERFORM public.fixture_assert((SELECT count(*)=2 AND bool_and(actor_type='ia' AND actor_id=actor) FROM public.traffic_weekly_history WHERE review_id=r.id),'created and saved history identify actor and type');
 PERFORM public.fixture_assert(coalesce(current_setting('request.jwt.claim.sub',true),'')='' AND current_setting('request.jwt.claims',true)='{}','service claims restored');
 PERFORM public.fixture_error(format('SELECT public.gestor_ia_routine_mcp(%L,%L,%L,%L,%L)',actor,'save',client,'2026-11-09',jsonb_build_object('linhas',lines)), '40001');
 PERFORM public.fixture_error(format('SELECT public.gestor_ia_routine_mcp(%L,%L,%L,%L,%L)',actor,'save',client,'2026-11-09',jsonb_build_object('linhas',lines,'revision',0)), '40001');
 PERFORM public.fixture_error(format('SELECT public.gestor_ia_routine_mcp(%L,%L,%L,%L,%L)',actor,'save',client,'2026-11-09',jsonb_build_object('linhas',lines,'revision',1,'finalized_at',now())), '22023');
 saved:=public.gestor_ia_routine_mcp(actor,'suggest',client,'2026-11-09','{"texto":"Conferir conversões antes de validar.","revision":1}');
 PERFORM public.fixture_assert(saved->'review'->>'analysis'='Análise inicial IA' AND saved->'review'->>'ai_suggestion'='Conferir conversões antes de validar.' AND saved->'review'->>'revision'='2','suggestion preserves analysis and increments revision');
 PERFORM public.fixture_assert(EXISTS(SELECT FROM public.traffic_weekly_history WHERE review_id=r.id AND actor_type='ia' AND snapshot->>'change_type'='suggestion' AND snapshot->'changed_fields' ? 'ai_suggestion' AND snapshot->'before'->>'ai_suggestion'='' AND snapshot->'after'->>'ai_suggestion'<>'') ,'suggestions audit before/after');
 SELECT count(*) INTO task_count FROM public.tarefas;
 SELECT count(*) INTO history_count FROM public.traffic_weekly_history;
 PERFORM public.fixture_error(format('SELECT public.gestor_ia_routine_mcp(%L,%L,%L,%L,%L)',actor,'save',client,'2026-10-26','{"linhas":[{"platform":"meta","account_id":"123","account_name":"Conta sintética","campaign_name":"Inválida","conversion_label":"Agendamentos","spend":-1}]}'), 'P0001');
 PERFORM public.fixture_assert((SELECT count(*)=task_count FROM public.tarefas) AND (SELECT count(*)=history_count FROM public.traffic_weekly_history) AND NOT EXISTS(SELECT FROM public.traffic_weekly_reviews WHERE week_start='2026-10-26'),'failed canonical normalization rolls back start, task and history');
END $$;
SELECT 'PASS: panel/read, canonical AI draft, identity, suggestion audit, missing/stale revision, forged payload and rollback';

RESET ROLE;
SELECT public.fixture_assert((SELECT validation_state='validado' AND fill_origin='pessoa' FROM public.traffic_weekly_reviews WHERE week_start='2026-11-02'),'migration backfills pre-existing finalized review');
-- Cohort is first_seen in Brasília; all saved evidence remains isolated by client, exact JID and exact channel.
INSERT INTO public.cliente_whatsapp_config VALUES('00000000-0000-0000-0000-00000000a001','9196d07f-f0a8-4eb2-9f9a-3dade28d4a69',NULL),('00000000-0000-0000-0000-00000000a002','9196d07f-f0a8-4eb2-9f9a-3dade28d4a69',NULL);
INSERT INTO public.cliente_whatsapp_contact(id,cliente_id,from_jid,phone,sender_name,whatsapp_config_id,first_seen_at,last_message_at,origin_source,mini_crm) VALUES
 ('00000000-0000-0000-0000-000000000011','9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','5511999990011@s.whatsapp.net','5511999990011','Lead sintético A','00000000-0000-0000-0000-00000000a001','2026-11-09 03:00Z','2026-11-16 15:00Z','nao_identificado','{"status":"agendado"}'),
 ('00000000-0000-0000-0000-000000000012','9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','5511999990012@s.whatsapp.net','5511999990012','Lead sintético B','00000000-0000-0000-0000-00000000a002','2026-11-15 20:00Z','2026-11-17 15:00Z','meta_ads','{}'),
 ('00000000-0000-0000-0000-000000000013','9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','5511999990013@s.whatsapp.net','5511999990013','Antes da semana','00000000-0000-0000-0000-00000000a001','2026-11-09 02:59:59Z','2026-11-10 10:00Z','meta_ads','{}'),
 ('00000000-0000-0000-0000-000000000014','9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','5511999990014@s.whatsapp.net','5511999990014','Próxima semana','00000000-0000-0000-0000-00000000a001','2026-11-16 03:00Z','2026-11-17 10:00Z','meta_ads','{}'),
 ('00000000-0000-0000-0000-000000000015','9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','grupo@g.us',NULL,'Grupo','00000000-0000-0000-0000-00000000a001','2026-11-10 03:00Z','2026-11-10 10:00Z','nao_identificado','{}'),
 ('00000000-0000-0000-0000-000000000016','00000000-0000-0000-0000-000000000099','5511999990011@s.whatsapp.net','5511999990011','Mesmo número outro cliente','00000000-0000-0000-0000-00000000a001','2026-11-10 03:00Z','2026-11-10 10:00Z','meta_ads','{}');
INSERT INTO public.cliente_whatsapp_inbox(cliente_id,whatsapp_config_id,from_jid,chat_jid,is_group,msg_timestamp,body) VALUES
 ('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','00000000-0000-0000-0000-00000000a001','5511999990011@s.whatsapp.net','5511999990011@s.whatsapp.net',false,'2026-11-16 15:00Z','Confirmo o dia 18/11 às 14h'),
 ('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','00000000-0000-0000-0000-00000000a002','5511999990011@s.whatsapp.net','5511999990011@s.whatsapp.net',false,'2026-11-10 15:00Z','NÃO CANAL'),
 ('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69',NULL,'5511999990011@s.whatsapp.net','5511999990011@s.whatsapp.net',false,'2026-11-10 15:00Z','NÃO SEM CANAL'),
 ('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','00000000-0000-0000-0000-00000000a001','5511999990011@s.whatsapp.net','grupo@g.us',true,'2026-11-10 15:00Z','NÃO GRUPO'),
 ('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','00000000-0000-0000-0000-00000000a001','5511999990011@s.whatsapp.net','outro@s.whatsapp.net',false,'2026-11-10 15:00Z','NÃO CHAT'),
 ('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','00000000-0000-0000-0000-00000000a001','5511999990011@s.whatsapp.net','5511999990011@s.whatsapp.net',false,'2026-11-08 15:00Z','NÃO NÚMERO RECICLADO'),
 ('00000000-0000-0000-0000-000000000099','00000000-0000-0000-0000-00000000a001','5511999990011@s.whatsapp.net','5511999990011@s.whatsapp.net',false,'2026-11-10 15:00Z','NÃO OUTRO CLIENTE');
INSERT INTO public.cliente_whatsapp_sent(cliente_id,whatsapp_config_id,to_jid,chat_jid,created_at,body) VALUES
 ('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','00000000-0000-0000-0000-00000000a001','5511999990011@s.whatsapp.net','5511999990011@s.whatsapp.net','2026-11-16 14:00Z','Pode confirmar 18/11 às 14h?'),
 ('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','00000000-0000-0000-0000-00000000a001','5511999990011@s.whatsapp.net','5511999990011@s.whatsapp.net','2026-11-17 14:00Z','Agendamento cancelado'),
 ('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','00000000-0000-0000-0000-00000000a002','5511999990011@s.whatsapp.net','5511999990011@s.whatsapp.net','2026-11-16 14:00Z','NÃO CANAL ENVIO');
INSERT INTO public.mini_crm_config VALUES('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','[{"value":"agendado","label":"Agendado"}]','[]');
SET ROLE service_role;
SET request.jwt.claims='{}';
DO $$
DECLARE data jsonb;
BEGIN
 data:=public.gestor_ia_routine_leads_data('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','2026-11-09','00000000-0000-0000-0000-000000000001');
 PERFORM public.fixture_assert(jsonb_array_length(data->'contacts')=2 AND data->'contacts'->0->>'origin_source'='nao_identificado','complete cohort includes non-Meta and later appointments');
 PERFORM public.fixture_assert(data->>'niche'='noivas' AND jsonb_typeof(data->'config')='object','leads config and niche');
 PERFORM public.fixture_assert(jsonb_array_length(data->'messages')=3 AND NOT EXISTS(SELECT FROM jsonb_array_elements(data->'messages') m WHERE m->>'text' LIKE 'NÃO %'),'messages exact channel/client/chat and after first_seen only');
 PERFORM public.fixture_assert(EXISTS(SELECT FROM jsonb_array_elements(data->'messages') m WHERE m->>'direction'='lead' AND (m->>'at')::timestamptz>'2026-11-16 03:00Z') AND EXISTS(SELECT FROM jsonb_array_elements(data->'messages') m WHERE lower(m->>'text')='agendamento cancelado'),'post-week confirmation and cancellation preserved');
 PERFORM public.fixture_assert(public.gestor_ia_routine_mcp('00000000-0000-0000-0000-000000000001','leads','9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','2026-11-09')=data,'MCP uses same leads RPC');
END $$;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000001","session_id":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
DO $$
DECLARE data jsonb;
BEGIN
 data:=public.gestor_ia_routine_leads_data('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','2026-11-09');
 PERFORM public.fixture_assert(jsonb_array_length(data->'contacts')=2 AND jsonb_array_length(data->'messages')=3,'frontend shares cohort and evidence');
 PERFORM public.fixture_error($q$SELECT public.gestor_ia_routine_leads_data('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','2026-11-09','00000000-0000-0000-0000-000000000003')$q$,'42501');
 PERFORM public.fixture_error($q$SELECT public.gestor_ia_routine_leads_data('00000000-0000-0000-0000-000000000099','2026-11-09')$q$,'42501');
END $$;
RESET ROLE;
INSERT INTO public.user_module_permissions VALUES('00000000-0000-0000-0000-000000000001','rastreamento',false);
SET ROLE service_role;
SELECT public.fixture_error($q$SELECT public.gestor_ia_routine_leads_data('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','2026-11-09','00000000-0000-0000-0000-000000000001')$q$,'42501');
RESET ROLE;
DELETE FROM public.user_module_permissions;
INSERT INTO public.atendimento_usuario_acesso VALUES('00000000-0000-0000-0000-000000000001','9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','00000000-0000-0000-0000-00000000a002');
SET ROLE service_role;
SELECT public.fixture_assert(jsonb_array_length(public.gestor_ia_routine_leads_data('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','2026-11-09','00000000-0000-0000-0000-000000000001')->'contacts')=1,'channel scope is respected');
RESET ROLE;
DELETE FROM public.atendimento_usuario_acesso;
INSERT INTO public.cliente_atend_conversas VALUES('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','00000000-0000-0000-0000-000000000011',true,'00000000-0000-0000-0000-000000000002');
SET ROLE service_role;
SELECT public.fixture_assert(jsonb_array_length(public.gestor_ia_routine_leads_data('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','2026-11-09','00000000-0000-0000-0000-000000000001')->'messages')=0,'private contact text is protected');
RESET ROLE;
DELETE FROM public.cliente_atend_conversas;
SELECT 'PASS: shared leads cohort, Brasília boundaries, late appointments/cancellations, exact identity, channel/private scope and module ACL';
-- Revocation is verified inside the database, after the service already knows the actor.
UPDATE public.user_module_permissions SET is_enabled=false WHERE false;
INSERT INTO public.user_module_permissions VALUES('00000000-0000-0000-0000-000000000001','paid_traffic',false);
SET ROLE service_role;
SELECT public.fixture_error($q$SELECT public.gestor_ia_routine_mcp('00000000-0000-0000-0000-000000000001','read','9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','2026-11-09')$q$,'42501');
RESET ROLE;
DELETE FROM public.user_module_permissions;
UPDATE auth.users SET banned_until=now()+interval '1 hour' WHERE id='00000000-0000-0000-0000-000000000001';
SET ROLE service_role;
SELECT public.fixture_error($q$SELECT public.gestor_ia_routine_mcp('00000000-0000-0000-0000-000000000001','panel',NULL,'2026-11-09')$q$,'42501');
RESET ROLE;
UPDATE auth.users SET banned_until=NULL;
UPDATE public.profiles SET status='inactive' WHERE id='00000000-0000-0000-0000-000000000001';
SET ROLE service_role;
SELECT public.fixture_error($q$SELECT public.gestor_ia_routine_mcp('00000000-0000-0000-0000-000000000001','panel',NULL,'2026-11-09')$q$,'42501');
RESET ROLE;
UPDATE public.profiles SET status='active';
UPDATE public.module_settings SET is_enabled=false WHERE module_name='paid_traffic';
SET ROLE service_role;
SELECT public.fixture_error($q$SELECT public.gestor_ia_routine_mcp('00000000-0000-0000-0000-000000000001','panel',NULL,'2026-11-09')$q$,'42501');
RESET ROLE;
UPDATE public.module_settings SET is_enabled=true;
UPDATE public.traffic_client_ops SET primary_assignee_id='00000000-0000-0000-0000-000000000002' WHERE client_id='9196d07f-f0a8-4eb2-9f9a-3dade28d4a69';
SET ROLE service_role;
SELECT public.fixture_error($q$SELECT public.gestor_ia_routine_mcp('00000000-0000-0000-0000-000000000001','read','9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','2026-11-09')$q$,'42501');
RESET ROLE;
INSERT INTO public.traffic_client_access VALUES('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','00000000-0000-0000-0000-000000000001');
UPDATE public.clientes SET responsavel='00000000-0000-0000-0000-000000000002' WHERE id='9196d07f-f0a8-4eb2-9f9a-3dade28d4a69';
SET ROLE service_role;
SELECT public.fixture_error($q$SELECT public.gestor_ia_routine_mcp('00000000-0000-0000-0000-000000000001','read','9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','2026-11-09')$q$,'42501');
RESET ROLE;
DELETE FROM public.traffic_client_access;
UPDATE public.clientes SET responsavel='00000000-0000-0000-0000-000000000001' WHERE id='9196d07f-f0a8-4eb2-9f9a-3dade28d4a69';
UPDATE public.traffic_client_ops SET primary_assignee_id='00000000-0000-0000-0000-000000000001' WHERE client_id='9196d07f-f0a8-4eb2-9f9a-3dade28d4a69';
SELECT 'PASS: database module, ban, inactive account, central ACL and carteira revocation';

SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000001","session_id":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
DO $$
DECLARE r public.traffic_weekly_reviews; data jsonb; task uuid;
BEGIN
 PERFORM public.fixture_error($q$SELECT public.gestor_ia_routine_mcp('00000000-0000-0000-0000-000000000001','panel',NULL,'2026-11-09')$q$,'42501');
 SELECT * INTO r FROM public.traffic_weekly_reviews WHERE client_id='9196d07f-f0a8-4eb2-9f9a-3dade28d4a69' AND week_start='2026-11-09';
 PERFORM public.fixture_error(format('UPDATE public.traffic_weekly_reviews SET validation_state=%L WHERE id=%L','validado',r.id),'42501');
 data:=to_jsonb(r)||'{"analysis":"Conferido pela equipe","action_mode":"none"}';
 PERFORM public.save_traffic_weekly_review(r.id,2,data,false);
 SELECT * INTO r FROM public.traffic_weekly_reviews WHERE id=r.id;
 PERFORM public.fixture_assert(r.validation_state='em_revisao' AND r.fill_origin='ia' AND r.revision=3,'human edit enters review and keeps AI provenance');
 PERFORM public.fixture_error(format('SELECT public.save_traffic_weekly_review(%L,3,%L,true)',r.id,data||'{"analysis":""}'),'P0001');
 PERFORM public.fixture_error(format('SELECT public.save_traffic_weekly_review(%L,3,%L,true)',r.id,data||'{"action_mode":"undecided"}'),'P0001');
 PERFORM set_config('fixture.today','2026-11-12',true);
 PERFORM public.fixture_error(format('SELECT public.save_traffic_weekly_review(%L,3,%L,true)',r.id,data),'P0001');
 PERFORM set_config('fixture.today','2026-11-16',true);
 PERFORM public.save_traffic_weekly_review(r.id,3,data,true);
 SELECT * INTO r FROM public.traffic_weekly_reviews WHERE id=r.id;
 PERFORM public.fixture_assert(r.validation_state='validado' AND r.finalized_by=auth.uid() AND r.revision=4,'only human official save validates');
 PERFORM public.fixture_assert(EXISTS(SELECT FROM public.traffic_weekly_history WHERE review_id=r.id AND event='finalized' AND actor_type='pessoa' AND snapshot->>'change_type'='validated'),'human validation audited');
END $$;
SELECT 'PASS: human edit, official validation, legacy analysis/action/closed-week requirements and history';

SET ROLE service_role;
SET request.jwt.claims='{}';
DO $$
DECLARE r public.traffic_weekly_reviews;
BEGIN
 SELECT * INTO r FROM public.traffic_weekly_reviews WHERE client_id='9196d07f-f0a8-4eb2-9f9a-3dade28d4a69' AND week_start='2026-11-09';
 PERFORM public.fixture_error($q$SELECT public.gestor_ia_routine_mcp('00000000-0000-0000-0000-000000000001','save','9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','2026-11-09','{"revision":4,"linhas":[]}')$q$,'55000');
 PERFORM public.fixture_error($q$SELECT public.gestor_ia_routine_mcp('00000000-0000-0000-0000-000000000001','suggest','9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','2026-11-09','{"revision":4,"texto":"Não sobrescrever"}')$q$,'55000');
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
 PERFORM public.fixture_error(format('SELECT public.save_traffic_weekly_review(%L,4,%L,false)',r.id,to_jsonb(r)),'55000');
END $$;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000001","session_id":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
DO $$
DECLARE r public.traffic_weekly_reviews;
BEGIN
 SELECT * INTO r FROM public.traffic_weekly_reviews WHERE client_id='9196d07f-f0a8-4eb2-9f9a-3dade28d4a69' AND week_start='2026-11-09';
 PERFORM public.save_traffic_weekly_review(r.id,4,to_jsonb(r),false);
 SELECT * INTO r FROM public.traffic_weekly_reviews WHERE id=r.id;
 PERFORM public.fixture_assert(r.validation_state='em_revisao' AND r.finalized_at IS NULL AND r.revision=5,'canonical human reopen clears validation');
 PERFORM public.fixture_assert(EXISTS(SELECT FROM public.traffic_weekly_history WHERE review_id=r.id AND actor_type='pessoa' AND snapshot->>'change_type'='reopened'),'reopen audited');
END $$;
SET ROLE service_role;
SET request.jwt.claims='{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000001"}';
DO $$
DECLARE r public.traffic_weekly_reviews; saved jsonb;
BEGIN
 SELECT * INTO r FROM public.traffic_weekly_reviews WHERE client_id='9196d07f-f0a8-4eb2-9f9a-3dade28d4a69' AND week_start='2026-11-09';
 PERFORM public.fixture_error(format('SELECT public.save_traffic_weekly_review(%L,5,%L,true)',r.id,to_jsonb(r)),'42501');
 PERFORM public.fixture_error(format('UPDATE public.traffic_weekly_reviews SET finalized_at=now(),finalized_by=%L,validation_state=%L,fill_origin=%L WHERE id=%L',auth.uid(),'validado','pessoa',r.id),'42501');
 PERFORM public.fixture_assert((SELECT status='pending' FROM public.tarefas WHERE id=r.task_id) AND r.revision=5,'forged authenticated JWT cannot finalize or finish task');
 saved:=public.gestor_ia_routine_mcp('00000000-0000-0000-0000-000000000001','save',r.client_id,r.week_start,'{"revision":5,"linhas":[]}');
 PERFORM public.fixture_assert(saved->'review'->>'analysis'=r.analysis AND saved->'review'->>'action_mode'=r.action_mode AND saved->'review'->>'revision'='6','AI save preserves omitted analysis and human action');
 saved:=public.gestor_ia_routine_mcp('00000000-0000-0000-0000-000000000001','suggest',r.client_id,r.week_start,'{"revision":6,"texto":"Sugestão revisada"}');
 PERFORM public.fixture_assert(saved->'review'->>'revision'='7' AND saved->'review'->>'validation_state'='rascunho_ia','AI can resume only after human reopen');
END $$;
SELECT 'PASS: validated write protection, canonical reopen, service/forged-JWT finalization denial and preserved human fields';
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000001","session_id":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
DO $$
DECLARE r public.traffic_weekly_reviews; data jsonb; history_count bigint; optimization_id uuid;
BEGIN
 SELECT * INTO r FROM public.traffic_weekly_reviews WHERE client_id='9196d07f-f0a8-4eb2-9f9a-3dade28d4a69' AND week_start='2026-11-02';
 data:=to_jsonb(r)||'{"metric_mode":"client","investment":100,"contacts":10,"results":2,"analysis":"Legado conferido","action_mode":"none"}';
 PERFORM public.save_traffic_weekly_review(r.id,0,data,false);
 PERFORM public.fixture_error(format('SELECT public.save_traffic_weekly_review(%L,1,%L,true)',r.id,data||'{"investment":null}'),'P0001');
 PERFORM public.fixture_error(format('SELECT public.save_traffic_weekly_review(%L,1,%L,true)',r.id,data||'{"results":11}'),'P0001');
 PERFORM public.save_traffic_weekly_review(r.id,1,data,true);
 SELECT count(*) INTO history_count FROM public.traffic_weekly_history WHERE review_id=r.id;
 PERFORM public.save_traffic_weekly_review(r.id,2,data,true);
 PERFORM public.fixture_assert((SELECT count(*)=history_count FROM public.traffic_weekly_history WHERE review_id=r.id),'duplicate legacy finalize stays idempotent');
 SELECT * INTO r FROM public.traffic_weekly_reviews WHERE id=r.id;
 PERFORM public.fixture_assert(r.fill_origin='pessoa' AND r.validation_state='validado' AND r.metric_mode='client' AND r.contacts=10 AND r.results=2,'legacy client-mode numbers and human origin preserved');
 optimization_id:=public.start_traffic_week_record('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','2026-11-16','optimization');
 SELECT * INTO r FROM public.traffic_weekly_reviews WHERE id=optimization_id;
 PERFORM public.save_traffic_weekly_review(r.id,0,to_jsonb(r)||'{"analysis":"Otimização conferida","action_mode":"none"}',true);
 PERFORM public.fixture_assert((SELECT validation_state='validado' AND kind='optimization' FROM public.traffic_weekly_reviews WHERE id=r.id),'optimization retains same-week finalization behavior');
END $$;
RESET ROLE;
UPDATE auth.sessions SET not_after=now()-interval '1 minute' WHERE user_id='00000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
SELECT public.fixture_error($q$SELECT public.gestor_ia_routine_leads_data('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','2026-11-09')$q$,'42501');
DO $$
DECLARE r public.traffic_weekly_reviews;
BEGIN
 SELECT * INTO r FROM public.traffic_weekly_reviews WHERE client_id='9196d07f-f0a8-4eb2-9f9a-3dade28d4a69' AND week_start='2026-11-09';
 PERFORM public.fixture_error(format('SELECT public.save_traffic_weekly_review(%L,7,%L,true)',r.id,to_jsonb(r)||'{"campaign_metrics":[{"id":"00000000-0000-0000-0000-000000000055","platform":"meta","account_id":"123","account_name":"Sintética","campaign_name":"Noivas","conversion_label":"Agendamentos","spend":100,"appointments":1}]}'),'42501');
END $$;
RESET ROLE;
UPDATE auth.sessions SET not_after=NULL;
SELECT 'PASS: RPC grants, direct human write denial, legacy client mode/idempotence, optimization and revoked human session';
UPDATE public.clientes SET etapa='inactive' WHERE id='9196d07f-f0a8-4eb2-9f9a-3dade28d4a69';
SET ROLE service_role;
SET request.jwt.claims='{}';
SELECT public.fixture_assert(public.gestor_ia_routine_mcp('00000000-0000-0000-0000-000000000001','read','9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','2026-11-09')->'review'->>'revision'='7','inactive client history remains readable');
SELECT public.fixture_assert(public.gestor_ia_routine_mcp('00000000-0000-0000-0000-000000000001','panel',NULL,'2026-11-09')->'clientes'->0->>'status'='rascunho_ia','inactive client existing review remains in panel');
SELECT public.fixture_assert(jsonb_array_length(public.gestor_ia_routine_leads_data('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','2026-11-09','00000000-0000-0000-0000-000000000001')->'contacts')=2,'inactive client leads remain readable');
SELECT public.fixture_error($q$SELECT public.gestor_ia_routine_mcp('00000000-0000-0000-0000-000000000001','save','9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','2026-11-09','{"revision":7,"linhas":[]}')$q$,'22023');
RESET ROLE;
UPDATE public.clientes SET etapa='closed' WHERE id='9196d07f-f0a8-4eb2-9f9a-3dade28d4a69';
UPDATE public.traffic_weekly_settings SET enabled=true WHERE client_id='00000000-0000-0000-0000-000000000099';
SET ROLE service_role;
SET request.jwt.claim.sub='';
SET request.jwt.claims='{}';
DO $$
DECLARE generated jsonb;
BEGIN
 generated:=planeje_private.traffic_weekly_generate(public.central_trafego_operational_date());
 PERFORM public.fixture_assert(EXISTS(SELECT FROM public.traffic_weekly_reviews WHERE client_id='00000000-0000-0000-0000-000000000099' AND week_start='2026-11-09' AND revision=0 AND analysis='' AND fill_origin='pessoa' AND validation_state='em_revisao' AND finalized_at IS NULL),'canonical generator opens blank record without JWT actor');
 PERFORM public.fixture_assert(NOT EXISTS(SELECT FROM public.traffic_weekly_generation_issues),'canonical generator reports no error');
 PERFORM public.fixture_assert(EXISTS(SELECT FROM public.traffic_weekly_history WHERE client_id='00000000-0000-0000-0000-000000000099' AND event='created' AND actor_id IS NULL AND actor_type='pessoa'),'legacy automatic creation stays distinct from AI fill');
 PERFORM public.fixture_assert(public.gestor_ia_routine_mcp('00000000-0000-0000-0000-000000000002','panel','00000000-0000-0000-0000-000000000099','2026-11-09')->'clientes'->0->>'status'='a_preencher','automatic empty record remains to fill in panel');
 PERFORM public.fixture_error($q$UPDATE public.traffic_weekly_reviews SET analysis='Serviço sem ator' WHERE client_id='00000000-0000-0000-0000-000000000099'$q$,'42501');
END $$;
RESET ROLE;
DO $$
BEGIN
 PERFORM set_config('fixture.today','2026-11-23',true);
 PERFORM planeje_private.traffic_weekly_generate(public.central_trafego_operational_date());
 PERFORM public.fixture_assert(EXISTS(SELECT FROM public.traffic_weekly_reviews WHERE client_id='00000000-0000-0000-0000-000000000099' AND week_start='2026-11-16' AND validation_state='em_revisao' AND fill_origin='pessoa' AND finalized_at IS NULL),'cron owner context still creates blank reviews without JWT');
END $$;
SELECT 'PASS: inactive-client read preservation and canonical generation without JWT, without allowing actorless fill';

-- The network DTO must be safe before either caller's JavaScript receives it.
UPDATE public.cliente_whatsapp_contact SET sender_name='Rótulo de lista +55 (11) 99999-0011 · 5511999990011@s.whatsapp.net',
 tracking_data='{"meta_ad_details":{"ad":{"account_id":"act_123","campaign":{"id":"campaign_123","name":"PRIVATE-CAMPAIGN-NAME"},"adset":{"id":"adset_123"},"raw_secret":"RAW-SECRET-DATABASE"}},"raw_secret":"RAW-SECRET-DATABASE"}',
 utm_source='RAW-SECRET-DATABASE',profile_pic_url='https://private.invalid/RAW-SECRET-DATABASE',instance_name='RAW-SECRET-DATABASE',
 mini_crm='{"status":"agendado","contato_nome":"Rótulo mini 5511999990011","data_agendamento":"2026-11-18T14:00:00 secret","visita_custom":"19/11/2026 RAW-SECRET-DATABASE","visita_custom_hora":"14:30","observacao":"RAW-SECRET-DATABASE","private_payload":{"phone":"5511999990011"}}'
 WHERE id='00000000-0000-0000-0000-000000000011';
UPDATE public.cliente_whatsapp_contact SET mini_crm='{"status":{"secret":"RAW-SECRET-DATABASE"},"contato_nome":{"secret":"RAW-SECRET-DATABASE"}}'
 WHERE id='00000000-0000-0000-0000-000000000012';
UPDATE public.mini_crm_config SET statuses='[{"key":"agendado","label":"Agendado +55 (11) 99999-0011","private_payload":"RAW-SECRET-DATABASE"}]',
 columns='[{"key":"visita_custom","label":"Data da Visita 5511999990011","kind":"day","private_payload":"RAW-SECRET-DATABASE"},{"key":"observacao","label":"Observação","kind":"text"},{"key":{"secret":"RAW-SECRET-DATABASE"},"label":"Visita","kind":"day"}]'
 WHERE cliente_id='9196d07f-f0a8-4eb2-9f9a-3dade28d4a69';
UPDATE public.cliente_whatsapp_inbox SET body='Agendamento confirmado para 18/11 às 14h, meu nome ClienteCorinaSecreta, telefone 5511999990011 e conversa RAW-SECRET-DATABASE.'
 WHERE body='Confirmo o dia 18/11 às 14h';
UPDATE public.cliente_whatsapp_sent SET body=body||' ClienteCorinaSecreta 5511999990011 RAW-SECRET-DATABASE.' WHERE body IN('Pode confirmar 18/11 às 14h?','Agendamento cancelado');
SET ROLE service_role;
SET request.jwt.claims='{}';
DO $$
DECLARE data jsonb; contact jsonb; text_dto text;
BEGIN
 data:=public.gestor_ia_routine_leads_data('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','2026-11-09','00000000-0000-0000-0000-000000000001');
 contact:=data->'contacts'->0;
 text_dto:=data::text;
 PERFORM public.fixture_assert(position('5511999990011' IN text_dto)=0 AND position('@s.whatsapp.net' IN text_dto)=0 AND position('RAW-SECRET-DATABASE' IN text_dto)=0 AND position('ClienteCorinaSecreta' IN text_dto)=0 AND position('PRIVATE-CAMPAIGN-NAME' IN text_dto)=0,'network DTO strips full phone, JID, raw payload and free conversation names');
 PERFORM public.fixture_assert(contact->>'phone'='•••• 0011' AND contact->>'sender_name' LIKE 'Rótulo de lista%' AND contact->'mini_crm'->>'contato_nome'='Rótulo mini •••• 0011','list labels survive with embedded numbers masked');
 PERFORM public.fixture_assert(NOT contact ?| ARRAY['from_jid','profile_pic_url','instance_name','whatsapp_config_id','utm_source','utm_medium','utm_campaign','utm_content','utm_term','valor_venda'],'unneeded contact fields are absent');
 PERFORM public.fixture_assert(contact->'tracking_data'='{"account_id":"act_123","campaign_id":"campaign_123","adset_id":"adset_123"}' AND contact->>'origin_source'='meta_ads','only validated targeting IDs and canonical origin leave database');
 PERFORM public.fixture_assert(contact->'mini_crm'->>'data_agendamento'='2026-11-18' AND contact->'mini_crm'->>'visita_custom'='19/11/2026' AND contact->'mini_crm'->>'visita_custom_hora'='14:30' AND NOT contact->'mini_crm' ? 'observacao','appointment fields project dates instead of raw values');
 PERFORM public.fixture_assert(jsonb_array_length(data->'config'->'columns')=1 AND NOT (data->'config'->'statuses'->0) ? 'private_payload','configuration is projected too');
 PERFORM public.fixture_assert(EXISTS(SELECT FROM jsonb_array_elements(data->'messages') m WHERE m->>'text'='agendamento confirmado para 18/11 14h') AND EXISTS(SELECT FROM jsonb_array_elements(data->'messages') m WHERE m->>'text'='agendamento cancelado'),'appointment/cancellation signals survive text projection');
END $$;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000001","session_id":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
DO $$
DECLARE data jsonb;
BEGIN
 data:=public.gestor_ia_routine_leads_data('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','2026-11-09');
 PERFORM public.fixture_assert(position('5511999990011' IN data::text)=0 AND position('RAW-SECRET-DATABASE' IN data::text)=0 AND position('ClienteCorinaSecreta' IN data::text)=0,'authenticated network DTO is safe too');
END $$;
RESET ROLE;
SELECT public.fixture_assert(planeje_private.gestor_ia_routine_signal_text('O agendamento ainda precisa ser confirmado para 13/11 às 14h, ClienteCorinaSecreta 5511999990011')='agendamento ainda precisa ser confirmado para 13/11 14h','lexer preserves pending modality without personal body');
SELECT public.fixture_assert(planeje_private.gestor_ia_routine_signal_text('Se confirmado o agendamento, será 13/11 às 14h')='se confirmado agendamento 13/11 14h','lexer preserves conditional modality');
SELECT public.fixture_assert(planeje_private.gestor_ia_routine_signal_text('NÃO posso confirmar a visita para amanhã às 14:30?')='nao posso confirmar a visita para amanha 14:30 ?','lexer preserves negation, relative day and question');
SELECT public.fixture_assert(planeje_private.gestor_ia_routine_signal_text('5511999990011@lid 5511131114h x13/11y x14:30z 14h 13/11')='14h 13/11','lexer never extracts dates/times from partial phone or word');
SELECT public.fixture_assert(planeje_private.gestor_ia_routine_signal_text('Marcela ConfirmadoClienteCorina AgendamentoClienteCorina')='','prefix matches cannot carry names or arbitrary suffixes');
SET ROLE service_role;
SET request.jwt.claims='{}';
DO $$
DECLARE original public.cliente_whatsapp_contact; scenario record; result jsonb;
BEGIN
 SELECT * INTO original FROM public.cliente_whatsapp_contact WHERE id='00000000-0000-0000-0000-000000000011';
 FOR scenario IN SELECT * FROM (VALUES
   ('google_ads','{"meta_ad_details":{"ad":{"id":"123"}}}'::jsonb,'facebook','google_ads'),
   ('manual','{"meta_ad_details":{"ad":{"id":"123"}}}'::jsonb,'facebook','manual'),
   ('site','{"meta_ad_details":{"ad":{"id":"123"}}}'::jsonb,'facebook','site'),
   ('nao_identificado','{}'::jsonb,'facebook','meta_ads'),
   ('nao_identificado','{"events_by_date":[{"tracking_data":{"source_id":"123"}}]}'::jsonb,NULL,'meta_ads'),
   ('meta_ads','{"planeje_link_id":"link","source_id":"123","fbclid":"legacy"}'::jsonb,'linktree','site'),
   ('meta_ads','{"planeje_match_code":"code","ctwaClid":"click"}'::jsonb,'linktree','meta_ads')
 ) cases(origin,tracking,utm,expected) LOOP
   UPDATE public.cliente_whatsapp_contact SET origin_source=scenario.origin,tracking_data=scenario.tracking,utm_source=scenario.utm WHERE id=original.id;
   result:=public.gestor_ia_routine_leads_data(original.cliente_id,'2026-11-09','00000000-0000-0000-0000-000000000001');
   PERFORM public.fixture_assert(result->'contacts'->0->>'origin_source'=scenario.expected,'canonical origin preserves explicit provenance, UTM/events and Linktree exception');
 END LOOP;
 UPDATE public.cliente_whatsapp_contact SET origin_source=original.origin_source,tracking_data=original.tracking_data,utm_source=original.utm_source WHERE id=original.id;
END $$;
RESET ROLE;
DELETE FROM public.cliente_whatsapp_contact WHERE cliente_id='00000000-0000-0000-0000-000000000099';
INSERT INTO public.cliente_whatsapp_config VALUES('00000000-0000-0000-0000-00000000a009','00000000-0000-0000-0000-000000000099',NULL);
INSERT INTO public.cliente_whatsapp_contact(cliente_id,from_jid,phone,sender_name,whatsapp_config_id,first_seen_at,last_message_at,origin_source,tracking_data)
 SELECT '00000000-0000-0000-0000-000000000099','55'||lpad(n::text,11,'0')||'@s.whatsapp.net','55'||lpad(n::text,11,'0'),'Lead de volume',
 '00000000-0000-0000-0000-00000000a009','2026-11-10 12:00Z'::timestamptz+n*interval '1 second','2026-11-11 12:00Z','nao_identificado','{"raw_secret":"RAW-SECRET-DATABASE"}' FROM generate_series(1,1001) n;
SET ROLE service_role;
SELECT public.fixture_assert(jsonb_array_length(public.gestor_ia_routine_leads_data('00000000-0000-0000-0000-000000000099','2026-11-09','00000000-0000-0000-0000-000000000002')->'contacts')=1001,'safe DTO keeps all 1001 cohort contacts without truncation');
RESET ROLE;
SELECT 'PASS: safe network DTO for frontend and MCP, projected targeting/CRM, preserved scheduling tokens and complete 1001-contact cohort';
