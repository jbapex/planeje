-- Caixa Dot: tópicos e mensagens internas da equipe (Entrega A).
-- Aplicar uma vez. Não reaplicar.
-- Sem WhatsApp, sem CAPI, sem motor Dot nesta migração.

BEGIN;

CREATE TABLE IF NOT EXISTS public.caixa_dot_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'demanda'
    CHECK (kind IN ('demanda', 'conversa', 'aviso')),
  origin text NOT NULL DEFAULT 'usuario'
    CHECK (origin IN ('mcp', 'usuario', 'evento')),
  title text NOT NULL,
  status text NOT NULL DEFAULT 'aberta'
    CHECK (status IN ('aberta', 'aguardando_dot', 'respondido', 'feita', 'arquivada')),
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('baixa', 'normal', 'alta')),
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  task_id uuid REFERENCES public.tarefas(id) ON DELETE SET NULL,
  href text,
  created_by_kind text NOT NULL DEFAULT 'usuario'
    CHECK (created_by_kind IN ('usuario', 'mcp', 'sistema')),
  created_by_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by_label text,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  last_message_preview text,
  unread_for_owner boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT caixa_dot_threads_title_len CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT caixa_dot_threads_href_len CHECK (href IS NULL OR char_length(href) <= 500)
);

CREATE TABLE IF NOT EXISTS public.caixa_dot_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.caixa_dot_threads(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'dot', 'system')),
  body text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT caixa_dot_messages_body_len CHECK (char_length(btrim(body)) BETWEEN 1 AND 8000)
);

CREATE INDEX IF NOT EXISTS caixa_dot_threads_owner_active_idx
  ON public.caixa_dot_threads (owner_id, status, last_message_at DESC);

CREATE INDEX IF NOT EXISTS caixa_dot_threads_owner_unread_idx
  ON public.caixa_dot_threads (owner_id)
  WHERE unread_for_owner = true AND status NOT IN ('feita', 'arquivada');

CREATE INDEX IF NOT EXISTS caixa_dot_threads_equipe_idx
  ON public.caixa_dot_threads (status, last_message_at DESC);

CREATE INDEX IF NOT EXISTS caixa_dot_messages_thread_idx
  ON public.caixa_dot_messages (thread_id, created_at ASC);

COMMENT ON TABLE public.caixa_dot_threads IS
  'Tópicos da Caixa Dot por pessoa da equipe. Pendências operacionais ficam em pendencias_caixa.';
COMMENT ON TABLE public.caixa_dot_messages IS
  'Mensagens dos tópicos Dot: user, dot ou system.';

CREATE OR REPLACE FUNCTION public.caixa_dot_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('superadmin', 'admin')
      AND p.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.caixa_dot_touch_thread()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  preview text;
BEGIN
  preview := left(btrim(NEW.body), 160);
  UPDATE public.caixa_dot_threads
  SET
    last_message_at = NEW.created_at,
    last_message_preview = preview,
    updated_at = now(),
    unread_for_owner = CASE
      WHEN NEW.role = 'user' THEN unread_for_owner
      ELSE true
    END,
    status = CASE
      WHEN status IN ('feita', 'arquivada') THEN status
      WHEN NEW.role = 'dot' THEN 'respondido'
      WHEN NEW.role = 'user' AND status = 'respondido' THEN 'aberta'
      ELSE status
    END
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS caixa_dot_messages_touch_thread ON public.caixa_dot_messages;
CREATE TRIGGER caixa_dot_messages_touch_thread
AFTER INSERT ON public.caixa_dot_messages
FOR EACH ROW
EXECUTE FUNCTION public.caixa_dot_touch_thread();

ALTER TABLE public.caixa_dot_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caixa_dot_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS caixa_dot_threads_select ON public.caixa_dot_threads;
CREATE POLICY caixa_dot_threads_select
ON public.caixa_dot_threads
FOR SELECT TO authenticated
USING (
  owner_id = auth.uid()
  OR public.caixa_dot_is_admin()
);

DROP POLICY IF EXISTS caixa_dot_threads_insert ON public.caixa_dot_threads;
CREATE POLICY caixa_dot_threads_insert
ON public.caixa_dot_threads
FOR INSERT TO authenticated
WITH CHECK (
  owner_id = auth.uid()
  OR public.caixa_dot_is_admin()
);

DROP POLICY IF EXISTS caixa_dot_threads_update ON public.caixa_dot_threads;
CREATE POLICY caixa_dot_threads_update
ON public.caixa_dot_threads
FOR UPDATE TO authenticated
USING (
  owner_id = auth.uid()
  OR public.caixa_dot_is_admin()
)
WITH CHECK (
  owner_id = auth.uid()
  OR public.caixa_dot_is_admin()
);

DROP POLICY IF EXISTS caixa_dot_messages_select ON public.caixa_dot_messages;
CREATE POLICY caixa_dot_messages_select
ON public.caixa_dot_messages
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.caixa_dot_threads t
    WHERE t.id = thread_id
      AND (t.owner_id = auth.uid() OR public.caixa_dot_is_admin())
  )
);

DROP POLICY IF EXISTS caixa_dot_messages_insert ON public.caixa_dot_messages;
CREATE POLICY caixa_dot_messages_insert
ON public.caixa_dot_messages
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.caixa_dot_threads t
    WHERE t.id = thread_id
      AND (
        (t.owner_id = auth.uid() AND role = 'user' AND created_by_id = auth.uid())
        OR public.caixa_dot_is_admin()
      )
  )
);

GRANT SELECT, INSERT, UPDATE ON public.caixa_dot_threads TO authenticated;
GRANT SELECT, INSERT ON public.caixa_dot_messages TO authenticated;
GRANT ALL ON public.caixa_dot_threads TO service_role;
GRANT ALL ON public.caixa_dot_messages TO service_role;
GRANT EXECUTE ON FUNCTION public.caixa_dot_is_admin() TO authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'caixa_dot_threads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.caixa_dot_threads;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'caixa_dot_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.caixa_dot_messages;
  END IF;
END $$;

COMMIT;
