-- Synthetic schema for the save transaction; ACL and campaign catalog are test boundaries.
CREATE SCHEMA auth;
CREATE SCHEMA planeje_private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-0000-0000-000000000001'::uuid $$;
CREATE FUNCTION public.central_trafego_operational_date() RETURNS date LANGUAGE sql AS $$ SELECT '2026-10-27'::date $$;
CREATE FUNCTION planeje_private.traffic_weekly_can_edit(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('fixture.allowed',true),'yes')='yes' $$;
CREATE FUNCTION public.central_trafego_can_assign_others() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION public.central_trafego_can_see_task(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION planeje_private.traffic_routine_campaign_metrics(uuid,jsonb,boolean,boolean) RETURNS jsonb LANGUAGE sql AS $$ SELECT $2 $$;
CREATE TABLE public.task_statuses(value text PRIMARY KEY, label text, is_terminal boolean, is_initial boolean);
INSERT INTO public.task_statuses VALUES ('pending','Pendente',false,true),('completed','Concluído',true,false);
CREATE TABLE public.profiles(id uuid, status text, role text);
CREATE TABLE public.tarefas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid, title text, type text, status text, assignee_ids uuid[], status_history jsonb DEFAULT '[]');
CREATE TABLE public.traffic_weekly_reviews(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid, task_id uuid REFERENCES public.tarefas,
 week_start date, kind text, revision integer DEFAULT 0, metric_mode text DEFAULT 'client',
 campaign_metrics jsonb DEFAULT '[]', investment numeric, contacts integer, results integer,
 analysis text DEFAULT '', data_note text DEFAULT '', action_mode text DEFAULT 'none',
 action_task_id uuid, action_draft jsonb DEFAULT '{}', updated_at timestamptz,
 finalized_at timestamptz, finalized_by uuid
);
CREATE TABLE public.traffic_task_details(task_id uuid, completion_summary text, next_action_none boolean, updated_at timestamptz);
CREATE TABLE public.traffic_weekly_history(client_id uuid, review_id uuid, event text, actor_id uuid, snapshot jsonb);
CREATE FUNCTION planeje_private.traffic_weekly_new_task(uuid,text,date,uuid,uuid,text,text,text,uuid) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE task uuid;
BEGIN INSERT INTO public.tarefas(client_id,title,status,assignee_ids) VALUES($1,$2,'pending',ARRAY[$4]) RETURNING id INTO task; RETURN task; END $$;
