-- Synthetic base tables; actual ACL, save/start, row normalizer and task guard are loaded by the runner.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE SCHEMA private;
CREATE SCHEMA planeje_private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
$$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}') $$;
CREATE TABLE auth.users(id uuid PRIMARY KEY,banned_until timestamptz);
CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid,not_after timestamptz);
CREATE TABLE public.profiles(id uuid PRIMARY KEY,status text,role text,full_name text,cliente_id uuid);
CREATE TABLE public.clientes(id uuid PRIMARY KEY,empresa text,etapa text,nicho text,responsavel uuid);
CREATE TABLE public.traffic_client_ops(client_id uuid PRIMARY KEY,primary_assignee_id uuid,situation text);
CREATE TABLE public.traffic_client_access(client_id uuid,profile_id uuid);
CREATE TABLE public.user_module_permissions(user_id uuid,module_name text,is_enabled boolean,PRIMARY KEY(user_id,module_name));
CREATE TABLE public.module_settings(module_name text PRIMARY KEY,is_enabled boolean);
CREATE TABLE public.user_module_access(user_id uuid,module_name text,access_level text,PRIMARY KEY(user_id,module_name));
CREATE TABLE public.task_statuses(value text PRIMARY KEY,label text,is_terminal boolean,is_initial boolean);
INSERT INTO public.task_statuses VALUES('pending','Pendente',false,true),('completed','Concluído',true,false);
CREATE TABLE public.tarefas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid,title text,type text,status text DEFAULT 'pending',assignee_ids uuid[],status_history jsonb DEFAULT '[]');
CREATE TABLE public.traffic_task_details(task_id uuid,completion_summary text,next_action_none boolean,updated_at timestamptz);
CREATE TABLE public.traffic_weekly_settings(client_id uuid PRIMARY KEY,result_label text,sheet_metrics jsonb DEFAULT '["spend","appointments"]',enabled boolean DEFAULT false,optimization_enabled boolean DEFAULT false,review_weekday integer DEFAULT 1,optimization_weekday integer DEFAULT 1,starts_on date DEFAULT '2026-11-16',enabled_since date DEFAULT '2026-11-16',optimization_enabled_since date DEFAULT '2026-11-16');
CREATE TABLE public.traffic_weekly_generation_issues(client_id uuid,due_on date,kind text,message text,PRIMARY KEY(client_id,due_on,kind));
CREATE TABLE public.traffic_weekly_reviews(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid,task_id uuid REFERENCES public.tarefas,
 week_start date,kind text DEFAULT 'review',result_label text NOT NULL,revision integer DEFAULT 0,metric_mode text DEFAULT 'client',
 campaign_metrics jsonb DEFAULT '[]',investment numeric,contacts integer,results integer,analysis text DEFAULT '' CHECK(length(analysis)<=10000),
 data_note text DEFAULT '',action_mode text DEFAULT 'undecided',action_task_id uuid,action_draft jsonb DEFAULT '{}',
 updated_at timestamptz DEFAULT now(),created_at timestamptz DEFAULT now(),finalized_at timestamptz,finalized_by uuid,
 UNIQUE(client_id,week_start,kind)
);
CREATE TABLE public.traffic_weekly_history(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,client_id uuid,review_id uuid,event text CHECK(event IN('settings','created','draft','finalized')),actor_id uuid,snapshot jsonb,occurred_at timestamptz DEFAULT clock_timestamp());
CREATE TABLE public.cliente_whatsapp_config(id uuid PRIMARY KEY,cliente_id uuid,archived_at timestamptz);
CREATE TABLE public.cliente_whatsapp_contact(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cliente_id uuid,from_jid text,phone text,sender_name text,profile_pic_url text,instance_name text,
 whatsapp_config_id uuid,first_seen_at timestamptz,last_message_at timestamptz,origin_source text,utm_source text,utm_medium text,utm_campaign text,
 utm_content text,utm_term text,tracking_data jsonb,mini_crm jsonb DEFAULT '{}',qualificado boolean,comprou boolean,valor_venda numeric
);
CREATE TABLE public.mini_crm_config(cliente_id uuid PRIMARY KEY,statuses jsonb,columns jsonb);
CREATE TABLE public.cliente_whatsapp_inbox(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cliente_id uuid,whatsapp_config_id uuid,from_jid text,chat_jid text,is_group boolean DEFAULT false,msg_timestamp timestamptz,created_at timestamptz DEFAULT now(),body text);
CREATE TABLE public.cliente_whatsapp_sent(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cliente_id uuid,whatsapp_config_id uuid,to_jid text,chat_jid text,created_at timestamptz DEFAULT now(),body text);
CREATE TABLE public.cliente_atend_conversas(cliente_id uuid,contact_id uuid,privado boolean,assigned_to uuid);
CREATE TABLE public.atendimento_usuario_acesso(user_id uuid,cliente_id uuid,whatsapp_config_id uuid);
CREATE FUNCTION public.atendimento_user_can_access_atendimento_scope(uuid,uuid,uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT NOT EXISTS(SELECT FROM public.atendimento_usuario_acesso a WHERE a.cliente_id=$1 AND a.user_id=auth.uid())
 OR EXISTS(SELECT FROM public.atendimento_usuario_acesso a WHERE a.cliente_id=$1 AND a.user_id=auth.uid() AND a.whatsapp_config_id=$3)
$$;
CREATE FUNCTION public.central_trafego_operational_date() RETURNS date LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('fixture.today',true),''),'2026-11-16')::date $$;
CREATE FUNCTION public.central_trafego_can_assign_others() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION public.central_trafego_can_see_task(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION planeje_private.traffic_routine_accounts(uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '[]'::jsonb $$;
-- Only task insertion is a boundary; lifecycle updates and its ACL guard use the real SQL.
CREATE FUNCTION planeje_private.traffic_weekly_new_task(uuid,text,date,uuid,uuid,text,text,text,uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE task uuid;
BEGIN
 INSERT INTO public.tarefas(client_id,title,status,assignee_ids,type) VALUES($1,$2,'pending',ARRAY[$4],'paid_traffic') RETURNING id INTO task;
 INSERT INTO public.traffic_task_details(task_id) VALUES(task);
 RETURN task;
END $$;
ALTER TABLE public.traffic_weekly_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traffic_weekly_history ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA public,auth,private,planeje_private TO authenticated,service_role,anon;
GRANT SELECT ON public.traffic_weekly_reviews,public.traffic_weekly_history TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
INSERT INTO public.profiles(id,status,role,full_name) VALUES('00000000-0000-0000-0000-000000000001','active','colaborador','Gestora sintética'),('00000000-0000-0000-0000-000000000002','active','colaborador','Outra pessoa'),('00000000-0000-0000-0000-000000000003','active','admin','Gestor sintético');
INSERT INTO auth.users SELECT id,NULL FROM public.profiles;
INSERT INTO auth.sessions SELECT id,id,NULL FROM public.profiles;
INSERT INTO public.clientes VALUES('9196d07f-f0a8-4eb2-9f9a-3dade28d4a69','Impacto Noivas sintético','closed','noivas','00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000099','Outro cliente sintético','closed','varejo','00000000-0000-0000-0000-000000000002');
INSERT INTO public.traffic_client_ops SELECT id,responsavel,'active' FROM public.clientes;
INSERT INTO public.traffic_weekly_settings(client_id,result_label,sheet_metrics) SELECT id,'Agendamentos','["spend","appointments"]' FROM public.clientes;
INSERT INTO public.module_settings VALUES('paid_traffic',true),('rastreamento',true);
