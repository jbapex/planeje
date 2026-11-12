-- Reprodução sintética dos agregados; nenhum contato ou conteúdo real foi carregado.
DELETE FROM public.cliente_whatsapp_contact;
DELETE FROM public.cliente_whatsapp_inbox;
DELETE FROM public.cliente_whatsapp_sent;
DELETE FROM public.cliente_whatsapp_config;
DELETE FROM public.cliente_meta_accounts;
DELETE FROM public.gestor_ia_meta_cache;
DELETE FROM public.mini_crm_config;
INSERT INTO public.cliente_meta_accounts(id,cliente_id,meta_account_id,meta_account_name,is_active)
VALUES('00000000-0000-0000-0000-000000000010','9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','act_900100','Conta sintética da demonstração',true);
INSERT INTO public.cliente_whatsapp_config VALUES('00000000-0000-0000-0000-000000000020','9196d07f-f0a8-4eb2-9f9a-3dade28d4a69',NULL);
INSERT INTO public.mini_crm_config(cliente_id,statuses,columns)
VALUES('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','[{"key":"agendado","label":"Agendado"},{"key":"novo","label":"Novo Lead"}]',
 '[{"key":"data_agendamento","label":"Data do agendamento","kind":"day"}]');

-- 70 entradas, quinze pares de nomes, nenhum campaign_id/adset_id; seis contatos são anteriores.
INSERT INTO public.cliente_whatsapp_contact(id,cliente_id,from_jid,phone,sender_name,whatsapp_config_id,first_seen_at,last_message_at,origin_source,tracking_data,mini_crm)
SELECT ('30000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'9196d07f-f0a8-4eb2-9f9a-3dade28d4a69',
 '5511988'||lpad(n::text,6,'0')||'@s.whatsapp.net','5511988'||lpad(n::text,6,'0'),'Lead sintético '||lpad(n::text,2,'0'),
 '00000000-0000-0000-0000-000000000020',CASE WHEN n<=70 THEN '2026-11-10 12:00Z'::timestamptz ELSE '2026-11-05 12:00Z' END,
 '2026-11-12 12:00Z','meta_ads',
 jsonb_build_object('source','meta','private_debug','ATTRIBUTION_PRIVATE_CANARY')
 || CASE WHEN n<=14 THEN jsonb_build_object('campaign_name','Campanha sintética '||lpad((((n-1)%9)+1)::text,2,'0'),
      'adset_name','Conjunto sintético '||lpad((((n-1)%9)+1)::text,2,'0'),'source_id','synthetic_ad_'||n)
    WHEN n=15 THEN '{"campaign_name":"Fora da revisão sintética","adset_name":"Conjunto fora da revisão","source_id":"synthetic_ad_15"}'::jsonb ELSE '{}' END,
 jsonb_build_object('observacao','ATTRIBUTION_PRIVATE_CANARY','status',CASE WHEN n<=4 OR n BETWEEN 16 AND 25 OR n>70 THEN 'agendado' ELSE 'novo' END)
 || CASE WHEN n<=4 OR n BETWEEN 16 AND 25 OR n>70 THEN '{"data_agendamento":"2026-11-20"}'::jsonb ELSE '{}' END
FROM generate_series(1,76) n;

-- 20 pessoas marcaram na semana: 14 novas (só quatro com nomes atribuíveis), seis antigas sem vínculo.
INSERT INTO public.mini_crm_message_history(cliente_id,contact_id,channel_id,message_id,message_at,previous_status,status,reason,appointment_day)
SELECT '9196d07f-f0a8-4eb2-9f9a-3dade28d4a69',('30000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 'synthetic-channel','synthetic-appointment-'||n,'2026-11-12 15:00Z','novo','agendado','appointment','2026-11-20'
FROM generate_series(1,76) n WHERE n<=4 OR n BETWEEN 16 AND 25 OR n>70;
INSERT INTO public.cliente_whatsapp_sent(cliente_id,whatsapp_config_id,to_jid,chat_jid,created_at,body)
VALUES('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','00000000-0000-0000-0000-000000000020',
 '5511988000001@s.whatsapp.net','5511988000001@s.whatsapp.net','2026-11-12 15:00Z',
 'Agendamento confirmado para 20/11 às 14h. ClienteSecretoSintetico ATTRIBUTION_PRIVATE_CANARY 5511988000001');

-- A 15ª combinação existe no cache salvo, mas não integra as nove linhas da revisão.
INSERT INTO public.gestor_ia_meta_cache(cliente_id,conta_id,janela,dados,lido_em)
VALUES('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','act_900100','historico',
 '{"period":{"since":"2026-10-01","until":"2026-11-15"},"accountDays":[],"adDays":[{"campaign_id":"synthetic_outside","campaign_name":"Fora da revisão sintética","adset_id":"synthetic_outside_set","adset_name":"Conjunto fora da revisão","date_start":"2026-10-12","spend":"700"}],"campaignMeta":{"synthetic_outside":{"status":"ACTIVE"}}}',
 '2026-11-12 12:00Z');
