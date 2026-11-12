-- Synthetic boundaries extend the existing routine fixture; production functions come from migrations.
ALTER TABLE public.cliente_whatsapp_contact ADD COLUMN updated_at timestamptz DEFAULT clock_timestamp();
ALTER TABLE public.mini_crm_config ADD COLUMN updated_at timestamptz DEFAULT '2026-11-01 00:00Z';
CREATE FUNCTION public.cliente_atend_uid_nao_admin() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE TABLE public.cliente_meta_accounts(cliente_id uuid,meta_account_id text,is_active boolean DEFAULT true);
CREATE TABLE public.gestor_ia_meta_cache(
 cliente_id uuid REFERENCES public.clientes(id),conta_id text,janela text,dados jsonb,lido_em timestamptz,
 PRIMARY KEY(cliente_id,conta_id,janela)
);
ALTER TABLE public.cliente_whatsapp_contact ENABLE ROW LEVEL SECURITY;
CREATE POLICY attribution_contact_scope ON public.cliente_whatsapp_contact FOR ALL TO authenticated
 USING(public.planeje_current_account_access()
   AND EXISTS(SELECT FROM public.clientes c WHERE c.id=cliente_whatsapp_contact.cliente_id AND c.responsavel=auth.uid())
   AND public.atendimento_user_can_access_atendimento_scope(cliente_id,NULL,whatsapp_config_id)
   AND NOT EXISTS(SELECT FROM public.cliente_atend_conversas s WHERE s.cliente_id=cliente_whatsapp_contact.cliente_id
     AND s.contact_id=cliente_whatsapp_contact.id AND s.privado AND s.assigned_to IS DISTINCT FROM auth.uid()))
 WITH CHECK(public.planeje_current_account_access()
   AND EXISTS(SELECT FROM public.clientes c WHERE c.id=cliente_whatsapp_contact.cliente_id AND c.responsavel=auth.uid())
   AND public.atendimento_user_can_access_atendimento_scope(cliente_id,NULL,whatsapp_config_id)
   AND NOT EXISTS(SELECT FROM public.cliente_atend_conversas s WHERE s.cliente_id=cliente_whatsapp_contact.cliente_id
     AND s.contact_id=cliente_whatsapp_contact.id AND s.privado AND s.assigned_to IS DISTINCT FROM auth.uid()));
GRANT SELECT ON public.profiles,public.clientes,public.user_module_permissions,public.module_settings,
 public.mini_crm_config,public.atendimento_usuario_acesso,public.cliente_atend_conversas TO authenticated;
GRANT SELECT,UPDATE ON public.cliente_whatsapp_contact TO authenticated;
GRANT ALL ON public.cliente_meta_accounts,public.gestor_ia_meta_cache TO service_role;

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
CREATE FUNCTION public.fixture_claims(actor uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('request.jwt.claim.sub',coalesce(actor::text,''),true);
 PERFORM set_config('request.jwt.claims',CASE WHEN actor IS NULL THEN '{}' ELSE
   jsonb_build_object('sub',actor,'session_id',actor,'role','authenticated')::text END,true);
END $$;

-- fixture: seed
-- Read-only catalog inspection confirmed these additional grants in the installed release.
GRANT EXECUTE ON FUNCTION public.mini_crm_manual_status_guard() TO service_role;
GRANT EXECUTE ON FUNCTION public.mini_crm_patch_contact(uuid,uuid,jsonb,jsonb,boolean) TO service_role;
INSERT INTO public.module_settings VALUES('mini_crm',true);
INSERT INTO public.cliente_whatsapp_config VALUES
 ('00000000-0000-0000-0000-00000000a001','9196d07f-f0a8-4eb2-9f9a-3dade28d4a69',NULL),
 ('00000000-0000-0000-0000-00000000a002','9196d07f-f0a8-4eb2-9f9a-3dade28d4a69',NULL);
INSERT INTO public.mini_crm_config(cliente_id,statuses,columns) VALUES
 ('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69',
  '[{"key":"Novo Lead","label":"Novo Lead"},{"key":"Agendado","label":"Agendado"},{"key":"visit_reserved","label":"Visita Agendada"},{"key":"negative","label":"Não Agendado"},{"key":"Perdido","label":"Perdido"}]',
  '[{"key":"data_agendamento","label":"Data do Agendamento","kind":"day"}]');
INSERT INTO public.mini_crm_message_rules(cliente_id,settings,updated_at) VALUES
 ('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69',
  '{"enabled":true,"entryStatus":"Novo Lead","appointmentStatus":"Agendado","appointmentField":"data_agendamento"}','2026-11-01 00:00Z');

-- Twenty factual appointments: fourteen new contacts, six old; repeated messages do not add people.
INSERT INTO public.cliente_whatsapp_contact(id,cliente_id,from_jid,phone,sender_name,whatsapp_config_id,
 first_seen_at,last_message_at,origin_source,tracking_data,mini_crm)
SELECT ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 '9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','55110000'||lpad(n::text,5,'0')||'@s.whatsapp.net',
 '55110000'||lpad(n::text,5,'0'),'Pessoa sintética '||n,
 CASE WHEN n=20 THEN '00000000-0000-0000-0000-00000000a002'::uuid ELSE '00000000-0000-0000-0000-00000000a001'::uuid END,
 CASE WHEN n<=14 OR n=21 THEN '2026-11-10 12:00Z'::timestamptz ELSE '2026-11-05 12:00Z' END,
 '2026-11-12 12:00Z','meta_ads',
 '{"meta_ad_details":{"ad":{"account_id":"act_123","name":"Anúncio 5511999990011","campaign":{"id":"cmp_123","name":"Campanha 5511999990011"},"adset":{"id":"set_123","name":"Conjunto 5511999990011"},"raw_secret":"RAW-SYNTHETIC-SECRET"}},"raw_secret":"RAW-SYNTHETIC-SECRET"}',
 CASE WHEN n=21 THEN '{"status":"Agendado","data_agendamento":"2026-11-20","_planeje_message_status":{"manual":true,"manualAt":"2026-11-12T12:00:00Z"}}'::jsonb ELSE '{"status":"Novo Lead"}'::jsonb END
FROM generate_series(1,23) n;
INSERT INTO public.mini_crm_message_history(cliente_id,contact_id,channel_id,message_id,message_at,previous_status,status,reason,appointment_day)
SELECT '9196d07f-f0a8-4eb2-9f9a-3dade28d4a69',('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 'fixture-channel','synthetic-'||n,
 CASE WHEN n=1 THEN '2026-11-09 03:00Z'::timestamptz WHEN n=20 THEN '2026-11-16 02:59:59.999Z'::timestamptz
      WHEN n=22 THEN '2026-11-09 02:59:59.999Z'::timestamptz WHEN n=23 THEN '2026-11-16 03:00Z'::timestamptz
      ELSE '2026-11-12 12:00Z'::timestamptz END,
 'Novo Lead','Agendado','appointment','2026-11-20'
FROM generate_series(1,23) n WHERE n<>21;
INSERT INTO public.mini_crm_message_history(cliente_id,contact_id,channel_id,message_id,message_at,previous_status,status,reason,appointment_day)
VALUES('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','10000000-0000-0000-0000-000000000001',
 'fixture-channel','synthetic-repeat','2026-11-13 12:00Z','Agendado','Agendado','appointment','2026-11-21');
INSERT INTO public.cliente_whatsapp_contact(id,cliente_id,from_jid,first_seen_at,origin_source,mini_crm)
VALUES('10000000-0000-0000-0000-000000000099','00000000-0000-0000-0000-000000000099',
 '5511000000001@s.whatsapp.net','2026-11-10 12:00Z','manual','{"status":"Novo Lead"}');
INSERT INTO public.cliente_whatsapp_inbox(cliente_id,whatsapp_config_id,from_jid,chat_jid,body,msg_timestamp)
VALUES('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','00000000-0000-0000-0000-00000000a001',
 '5511000000001@s.whatsapp.net','5511000000001@s.whatsapp.net','Corpo pessoal RAW-SYNTHETIC-SECRET 5511999990011','2026-11-12 12:00Z');

INSERT INTO public.cliente_meta_accounts VALUES('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','123',true);
-- readings.js stores historical adDays and campaignMeta; campaigns/adsets are reconstructed by history.js.
INSERT INTO public.gestor_ia_meta_cache VALUES
 ('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','act_123','historico',
  '{"period":{"since":"2026-10-01","until":"2026-11-15"},"accountDays":[],"adDays":[{"ad_id":"ad_paused","ad_name":"Anúncio antigo","campaign_id":"cmp_paused","campaign_name":"Campanha antiga 5511999990011","adset_id":"set_paused","adset_name":"Conjunto antigo","date_start":"2026-10-02","spend":"500","raw_secret":"RAW-SYNTHETIC-SECRET"}],"campaignMeta":{"cmp_paused":{"id":"cmp_paused","name":"Campanha antiga 5511999990011","status":"PAUSED","effective_status":"PAUSED"}}}',
  '2026-11-12 12:00Z'),
 ('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','act_999','historico',
  '{"adDays":[{"ad_id":"unlinked_ad","campaign_id":"unlinked_campaign","campaign_name":"UNLINKED-ACCOUNT-SECRET","adset_id":"unlinked_set","adset_name":"Não vinculada"}],"campaignMeta":{}}',
  '2026-11-12 12:00Z');

CREATE TABLE public.fixture_existing_functions AS
 SELECT p.oid,p.prosecdef,p.provolatile,p.proconfig,p.proacl FROM pg_proc p
 WHERE p.oid=ANY(ARRAY[
  'public.mini_crm_manual_status_guard()'::regprocedure,
  'public.mini_crm_patch_contact(uuid,uuid,jsonb,jsonb,boolean)'::regprocedure,
  'public.mini_crm_apply_message(uuid,uuid,timestamptz,timestamptz,jsonb,jsonb,text,text,timestamptz,text,date,text)'::regprocedure,
  'public.gestor_ia_routine_leads_data(uuid,date,uuid)'::regprocedure,
  'public.gestor_ia_routine_mcp(uuid,text,uuid,date,jsonb)'::regprocedure,
  'planeje_private.gestor_ia_routine_origin(public.cliente_whatsapp_contact)'::regprocedure]::oid[]);
