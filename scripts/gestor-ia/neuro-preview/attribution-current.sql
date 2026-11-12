-- Segundo snapshot agregado informado em 12/11: +8 entradas, +1 agendamento novo e +1 antigo.
INSERT INTO public.cliente_whatsapp_contact(id,cliente_id,from_jid,phone,sender_name,whatsapp_config_id,first_seen_at,last_message_at,origin_source,tracking_data,mini_crm)
SELECT ('30000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'9196d07f-f0a8-4eb2-9f9a-3dade28d4a69',
 '5511988'||lpad(n::text,6,'0')||'@s.whatsapp.net','5511988'||lpad(n::text,6,'0'),'Lead sintético '||n,
 '00000000-0000-0000-0000-000000000020',CASE WHEN n<=84 THEN '2026-11-12 18:00Z'::timestamptz ELSE '2026-11-05 12:00Z' END,
 '2026-11-12 18:30Z','meta_ads','{"source":"meta","private_debug":"ATTRIBUTION_PRIVATE_CANARY"}',
 jsonb_build_object('status',CASE WHEN n IN (77,85) THEN 'agendado' ELSE 'novo' END,'observacao','ATTRIBUTION_PRIVATE_CANARY')
 || CASE WHEN n IN (77,85) THEN '{"data_agendamento":"2026-11-20"}'::jsonb ELSE '{}' END
FROM generate_series(77,85) n;
INSERT INTO public.mini_crm_message_history(cliente_id,contact_id,channel_id,message_id,message_at,previous_status,status,reason,appointment_day)
SELECT '9196d07f-f0a8-4eb2-9f9a-3dade28d4a69',('30000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 'synthetic-channel','synthetic-appointment-'||n,'2026-11-12 18:30Z','novo','agendado','appointment','2026-11-20'
FROM unnest(ARRAY[77,85]) n;
