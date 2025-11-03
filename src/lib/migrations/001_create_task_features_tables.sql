CREATE TABLE IF NOT EXISTS public.task_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    task_id uuid NOT NULL,
    user_id uuid NOT NULL,
    content text NOT NULL
);

ALTER TABLE public.task_comments OWNER TO postgres;
ALTER TABLE ONLY public.task_comments
    ADD CONSTRAINT task_comments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.task_comments
    ADD CONSTRAINT task_comments_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tarefas(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.task_comments
    ADD CONSTRAINT task_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS public.task_subtasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    task_id uuid NOT NULL,
    title text NOT NULL,
    is_completed boolean DEFAULT false NOT NULL
);

ALTER TABLE public.task_subtasks OWNER TO postgres;
ALTER TABLE ONLY public.task_subtasks
    ADD CONSTRAINT task_subtasks_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.task_subtasks
    ADD CONSTRAINT task_subtasks_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tarefas(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS public.task_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    task_id uuid NOT NULL,
    name text NOT NULL,
    url text NOT NULL
);

ALTER TABLE public.task_attachments OWNER TO postgres;
ALTER TABLE ONLY public.task_attachments
    ADD CONSTRAINT task_attachments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.task_attachments
    ADD CONSTRAINT task_attachments_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tarefas(id) ON DELETE CASCADE;

GRANT ALL ON TABLE public.task_comments TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.task_subtasks TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.task_attachments TO anon, authenticated, service_role;