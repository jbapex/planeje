-- Disposable local PostgreSQL only. No transport, credentials or customer data.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE SCHEMA private;
GRANT USAGE ON SCHEMA public,auth,private TO authenticated,service_role;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id));
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(auth.jwt()->>'sub','')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT auth.jwt()->>'role' $$;
CREATE FUNCTION private.planeje_live_session() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM auth.sessions WHERE id=nullif(auth.jwt()->>'session_id','')::uuid AND user_id=auth.uid()) OR auth.jwt()->>'planeje_server_delegate'='atlas';
$$;
CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES auth.users(id),full_name text,role text,status text,avatar_url text);
CREATE TABLE public.clientes(id uuid PRIMARY KEY,owner_id uuid REFERENCES profiles(id),empresa text,etapa text DEFAULT 'closed',responsavel text,tipo_servico text,tipo_contrato text,entregaveis jsonb DEFAULT '{}',objetivo_meta text,etiquetas jsonb DEFAULT '[]');
CREATE TABLE public.task_statuses(value text PRIMARY KEY,label text,is_terminal boolean DEFAULT false,is_initial boolean DEFAULT false,sort_order integer DEFAULT 0);
CREATE TABLE public.tarefas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid REFERENCES clientes(id),owner_id uuid REFERENCES profiles(id),title text,description text DEFAULT '',status text,assignee_ids uuid[] DEFAULT '{}',due_date date,type text,priority text,status_history jsonb DEFAULT '[]',created_at timestamptz DEFAULT now(),production_delivered_at timestamptz,stage_due_at timestamptz);
CREATE TABLE public.task_comments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),task_id uuid REFERENCES tarefas(id),user_id uuid REFERENCES profiles(id),content text,created_at timestamptz DEFAULT now());
CREATE TABLE public.atendimento_conversas(id uuid PRIMARY KEY,cliente_id uuid REFERENCES clientes(id),is_group boolean DEFAULT true,bloqueada boolean DEFAULT false,archived_at timestamptz,chat_jid text);
CREATE TABLE public.atlas_demands(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid,client_id uuid,task_id uuid,request_id uuid DEFAULT gen_random_uuid(),title text,context text,state text DEFAULT 'draft',proposal jsonb DEFAULT '{}',revision integer DEFAULT 1,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE TABLE public.atlas_demand_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),demand_id uuid,actor_id uuid,kind text,body text);
CREATE TABLE public.atlas_demand_planning_settings(owner_id uuid PRIMARY KEY,inquiry_days integer DEFAULT 1,production_days integer DEFAULT 3);
CREATE TABLE public.atlas_task_updates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),task_id uuid,comment_id uuid,actor_id uuid,kind text,reply_to uuid,created_at timestamptz DEFAULT now());
GRANT SELECT ON public.profiles,public.clientes,public.task_statuses,public.tarefas,public.task_comments,public.atendimento_conversas TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- These tables match the existing event pipeline. Its provider/transport is absent.
CREATE TABLE public.atlas_event_config(owner_id uuid PRIMARY KEY,enabled boolean DEFAULT true,mode text DEFAULT 'assist',client_ids uuid[] DEFAULT '{}');
CREATE TABLE public.atlas_event_groups(owner_id uuid,conversation_id uuid,client_id uuid,state text,coverage jsonb DEFAULT '{}',seen jsonb DEFAULT '{}',reason text,PRIMARY KEY(owner_id,conversation_id));
CREATE TABLE public.atlas_event_jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid,client_id uuid,conversation_id uuid,input jsonb DEFAULT '{}',result jsonb DEFAULT '{}',published_at timestamptz,finished_at timestamptz);
CREATE TABLE public.atlas_event_findings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid,client_id uuid,conversation_id uuid,job_id uuid,request_key text,intent text,title text,summary text,task_id uuid,account_id uuid,thread_id uuid,route text,state text DEFAULT 'observed',question text DEFAULT '',sources jsonb DEFAULT '[]',versions jsonb DEFAULT '[]',revision integer DEFAULT 1,demand_id uuid,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
