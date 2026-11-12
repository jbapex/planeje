-- Synthetic read models only. The loader supplies canonical ACL, normalizer, save and MCP SQL.
ALTER TABLE public.tarefas ADD COLUMN due_date date DEFAULT '2026-11-16';
ALTER TABLE public.tarefas ADD COLUMN created_at timestamptz DEFAULT now();
ALTER TABLE public.clientes ADD COLUMN logo_urls jsonb DEFAULT '[]';
CREATE TABLE IF NOT EXISTS public.cliente_meta_accounts(id uuid PRIMARY KEY,cliente_id uuid,meta_account_id text,meta_account_name text,is_active boolean);
ALTER TABLE public.cliente_meta_accounts ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.cliente_meta_accounts ADD COLUMN IF NOT EXISTS meta_account_name text;
CREATE TABLE public.cliente_google_ads_accounts(id uuid PRIMARY KEY,cliente_id uuid,google_customer_id text,google_customer_name text,is_active boolean);
CREATE TABLE public.paid_campaigns(id uuid PRIMARY KEY,client_id uuid);
INSERT INTO public.cliente_meta_accounts(id,cliente_id,meta_account_id,meta_account_name,is_active)
VALUES('00000000-0000-0000-0000-000000000010','9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','act_preview_impacto','Impacto · conta sintética',true);
CREATE OR REPLACE FUNCTION planeje_private.traffic_routine_accounts(uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'platform','meta','account_id',meta_account_id,'account_name',meta_account_name)),'[]')
 FROM public.cliente_meta_accounts WHERE cliente_id=$1 AND is_active
$$;

CREATE FUNCTION public.traffic_weekly_board() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT planeje_private.traffic_weekly_staff() THEN RAISE insufficient_privilege; END IF;
 RETURN jsonb_build_object('today',public.central_trafego_operational_date(),'can_manage',planeje_private.traffic_weekly_manager(),
 'clients',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'empresa',c.empresa,'eligible',c.etapa='closed',
 'manager_id',o.primary_assignee_id,'manager_name',p.full_name,'accounts',planeje_private.traffic_routine_accounts(c.id),'settings',to_jsonb(w)))
 FROM public.clientes c LEFT JOIN public.traffic_client_ops o ON o.client_id=c.id LEFT JOIN public.profiles p ON p.id=o.primary_assignee_id
 LEFT JOIN public.traffic_weekly_settings w ON w.client_id=c.id WHERE public.can_use_traffic_weekly(c.id)),'[]'),
 'reviews',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM public.traffic_weekly_reviews r WHERE public.can_use_traffic_weekly(r.client_id)),'[]'),
 'team',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'full_name',full_name)) FROM public.profiles WHERE status='active'),'[]'));
END $$;
REVOKE ALL ON FUNCTION public.traffic_weekly_board() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.traffic_weekly_board() TO authenticated;

GRANT SELECT ON public.clientes,public.profiles,public.traffic_client_ops,public.cliente_meta_accounts,public.cliente_google_ads_accounts,public.paid_campaigns,public.tarefas,public.cliente_whatsapp_contact TO authenticated;
GRANT SELECT ON public.cliente_meta_accounts,public.cliente_google_ads_accounts,public.paid_campaigns TO service_role;
GRANT SELECT ON auth.users TO service_role;

-- fixture: routine leads
INSERT INTO public.cliente_whatsapp_config VALUES('00000000-0000-0000-0000-000000000020','9196d07f-f0a8-4eb2-9f9a-3dade28d4a69',NULL);
INSERT INTO public.mini_crm_config(cliente_id,statuses,columns) VALUES('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','[{"key":"agendado","label":"Agendado"},{"key":"nao_agendado","label":"Não agendado"}]','[]');
INSERT INTO public.cliente_whatsapp_contact(id,cliente_id,from_jid,phone,sender_name,whatsapp_config_id,first_seen_at,last_message_at,origin_source,tracking_data,mini_crm) VALUES
 ('00000000-0000-0000-0000-000000000101','9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','5511900001001@s.whatsapp.net','5511900001001','Noiva exemplo · CRM agendado','00000000-0000-0000-0000-000000000020','2026-11-09T12:00:00Z','2026-11-12T12:00:00Z','meta','{"source":"meta","account_id":"preview_impacto","campaign_id":"preview_campanha","adset_id":"preview_conjunto_a","ad_id":"preview_anuncio_a"}','{"status":"agendado"}'),
 ('00000000-0000-0000-0000-000000000102','9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','5511900001002@s.whatsapp.net','5511900001002','Noiva exemplo · confirmação na conversa','00000000-0000-0000-0000-000000000020','2026-11-10T12:00:00Z','2026-11-13T12:00:00Z','meta','{"source":"meta","account_id":"preview_impacto","campaign_id":"preview_campanha","adset_id":"preview_conjunto_a","ad_id":"preview_anuncio_a"}','{"status":"nao_agendado"}'),
 ('00000000-0000-0000-0000-000000000103','9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','5511900001003@s.whatsapp.net','5511900001003','Noiva exemplo · não agendada','00000000-0000-0000-0000-000000000020','2026-11-11T12:00:00Z','2026-11-12T12:00:00Z','meta','{"source":"meta","account_id":"preview_impacto","campaign_id":"preview_campanha","adset_id":"preview_conjunto_b","ad_id":"preview_anuncio_b"}','{"status":"nao_agendado"}'),
 ('00000000-0000-0000-0000-000000000104','9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','5511900001004@s.whatsapp.net','5511900001004','Noiva exemplo · origem manual','00000000-0000-0000-0000-000000000020','2026-11-12T12:00:00Z','2026-11-12T12:00:00Z','manual','{}','{}'),
 ('00000000-0000-0000-0000-000000000105','9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','5511900001005@s.whatsapp.net','5511900001005','Noiva exemplo · Google','00000000-0000-0000-0000-000000000020','2026-11-13T12:00:00Z','2026-11-13T12:00:00Z','google_ads','{"source":"google"}','{}'),
 ('00000000-0000-0000-0000-000000000106','9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','5511900001006@s.whatsapp.net','5511900001006','Noiva exemplo · coorte anterior','00000000-0000-0000-0000-000000000020','2026-11-08T12:00:00Z','2026-11-12T12:00:00Z','meta','{"source":"meta","account_id":"preview_impacto","campaign_id":"preview_campanha","adset_id":"preview_conjunto_a","ad_id":"preview_anuncio_a"}','{"status":"agendado"}');
INSERT INTO public.cliente_whatsapp_sent(cliente_id,whatsapp_config_id,to_jid,chat_jid,created_at,body) VALUES
 ('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','00000000-0000-0000-0000-000000000020','5511900001002@s.whatsapp.net','5511900001002@s.whatsapp.net','2026-11-13T12:00:00Z','Confirmado seu agendamento dia 14/11 às 14h.'),
 ('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','00000000-0000-0000-0000-000000000020','5511900001003@s.whatsapp.net','5511900001003@s.whatsapp.net','2026-11-12T12:00:00Z','Ainda não agendou a prova.');
UPDATE public.cliente_whatsapp_contact SET tracking_data=tracking_data||'{"private_debug":"NEURO_PRIVATE_CANARY"}',
  mini_crm=mini_crm||'{"observacao":"NEURO_PRIVATE_CANARY"}';
UPDATE public.cliente_whatsapp_sent SET body=body||' NEURO_PRIVATE_CANARY 5511900001002 5511900001002@s.whatsapp.net';
