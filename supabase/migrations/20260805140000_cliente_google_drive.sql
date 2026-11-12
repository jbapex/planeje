-- Google Drive por cliente: conexão OAuth + metadados em anexos de tarefa

CREATE TABLE IF NOT EXISTS public.cliente_google_drive_connection (
  cliente_id uuid PRIMARY KEY REFERENCES public.clientes(id) ON DELETE CASCADE,
  google_email text,
  google_account_id text,
  scopes text,
  status text NOT NULL DEFAULT 'disconnected'
    CHECK (status IN ('connected', 'disconnected', 'error')),
  connected_at timestamptz,
  connected_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cliente_google_drive_connection IS
  'Metadados da conexão Google Drive por empresa (cliente). Refresh token fica em app_secrets.';

CREATE TABLE IF NOT EXISTS public.google_drive_oauth_state (
  state text PRIMARY KEY,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  return_to text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS google_drive_oauth_state_expires_idx
  ON public.google_drive_oauth_state (expires_at);

ALTER TABLE public.task_attachments
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'link',
  ADD COLUMN IF NOT EXISTS external_file_id text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS size_bytes bigint,
  ADD COLUMN IF NOT EXISTS thumbnail_url text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'task_attachments_provider_check'
  ) THEN
    ALTER TABLE public.task_attachments
      ADD CONSTRAINT task_attachments_provider_check
      CHECK (provider IN ('link', 'google_drive'));
  END IF;
END $$;

COMMENT ON COLUMN public.task_attachments.provider IS 'Origem do anexo: link manual ou google_drive';
COMMENT ON COLUMN public.task_attachments.external_file_id IS 'ID do arquivo no provedor (ex.: Google Drive file id)';

-- Nome do secret: GOOGLE_DRIVE_CLIENT_<uuid_sem_hifens>
CREATE OR REPLACE FUNCTION public.google_drive_secret_name(p_cliente_id uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'GOOGLE_DRIVE_CLIENT_' || replace(p_cliente_id::text, '-', '_');
$$;

CREATE OR REPLACE FUNCTION public.set_cliente_google_drive_token(
  p_cliente_id uuid,
  p_refresh_token text DEFAULT NULL,
  p_google_email text DEFAULT NULL,
  p_google_account_id text DEFAULT NULL,
  p_scopes text DEFAULT NULL,
  p_connected_by uuid DEFAULT NULL,
  p_status text DEFAULT 'connected',
  p_last_error text DEFAULT NULL,
  p_update_token boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret_name text;
  v_trim_token text;
BEGIN
  IF p_cliente_id IS NULL THEN
    RAISE EXCEPTION 'cliente_id é obrigatório';
  END IF;

  v_trim_token := NULLIF(trim(COALESCE(p_refresh_token, '')), '');
  v_secret_name := public.google_drive_secret_name(p_cliente_id);

  IF p_update_token THEN
    IF v_trim_token IS NOT NULL THEN
      INSERT INTO public.app_secrets (name, secret_value)
      VALUES (v_secret_name, v_trim_token)
      ON CONFLICT (name)
      DO UPDATE SET
        secret_value = EXCLUDED.secret_value,
        updated_at = NOW();
    ELSE
      DELETE FROM public.app_secrets WHERE name = v_secret_name;
    END IF;
  END IF;

  INSERT INTO public.cliente_google_drive_connection (
    cliente_id,
    google_email,
    google_account_id,
    scopes,
    status,
    connected_at,
    connected_by,
    last_error,
    updated_at
  )
  VALUES (
    p_cliente_id,
    NULLIF(trim(COALESCE(p_google_email, '')), ''),
    NULLIF(trim(COALESCE(p_google_account_id, '')), ''),
    NULLIF(trim(COALESCE(p_scopes, '')), ''),
    COALESCE(NULLIF(trim(p_status), ''), 'connected'),
    CASE
      WHEN COALESCE(NULLIF(trim(p_status), ''), 'connected') = 'connected' THEN NOW()
      ELSE NULL
    END,
    p_connected_by,
    NULLIF(trim(COALESCE(p_last_error, '')), ''),
    NOW()
  )
  ON CONFLICT (cliente_id) DO UPDATE SET
    google_email = COALESCE(EXCLUDED.google_email, cliente_google_drive_connection.google_email),
    google_account_id = COALESCE(EXCLUDED.google_account_id, cliente_google_drive_connection.google_account_id),
    scopes = COALESCE(EXCLUDED.scopes, cliente_google_drive_connection.scopes),
    status = EXCLUDED.status,
    connected_at = CASE
      WHEN EXCLUDED.status = 'connected' THEN COALESCE(cliente_google_drive_connection.connected_at, NOW())
      ELSE cliente_google_drive_connection.connected_at
    END,
    connected_by = COALESCE(EXCLUDED.connected_by, cliente_google_drive_connection.connected_by),
    last_error = EXCLUDED.last_error,
    updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_cliente_google_drive_connection(p_cliente_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret_name text;
BEGIN
  IF p_cliente_id IS NULL THEN
    RAISE EXCEPTION 'cliente_id é obrigatório';
  END IF;

  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role = 'superadmin'
          OR p.role IN ('admin', 'colaborador')
          OR (p.role = 'cliente' AND p.cliente_id = p_cliente_id)
        )
    ) THEN
      RAISE EXCEPTION 'Sem permissão para desconectar Google Drive deste cliente';
    END IF;
  END IF;

  v_secret_name := public.google_drive_secret_name(p_cliente_id);
  DELETE FROM public.app_secrets WHERE name = v_secret_name;

  INSERT INTO public.cliente_google_drive_connection (
    cliente_id, status, google_email, google_account_id, scopes,
    connected_at, connected_by, last_error, updated_at
  )
  VALUES (p_cliente_id, 'disconnected', NULL, NULL, NULL, NULL, NULL, NULL, NOW())
  ON CONFLICT (cliente_id) DO UPDATE SET
    status = 'disconnected',
    google_email = NULL,
    google_account_id = NULL,
    scopes = NULL,
    connected_at = NULL,
    connected_by = NULL,
    last_error = NULL,
    updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.cliente_has_google_drive_token(p_cliente_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_exists boolean;
BEGIN
  v_name := public.google_drive_secret_name(p_cliente_id);
  SELECT EXISTS (
    SELECT 1 FROM public.app_secrets s
    WHERE s.name = v_name AND length(trim(s.secret_value)) > 10
  ) INTO v_exists;
  RETURN COALESCE(v_exists, false);
END;
$$;

ALTER TABLE public.cliente_google_drive_connection ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_drive_oauth_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cliente_google_drive_connection_select ON public.cliente_google_drive_connection;
CREATE POLICY cliente_google_drive_connection_select
  ON public.cliente_google_drive_connection
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('superadmin', 'admin', 'colaborador')
          OR (p.role = 'cliente' AND p.cliente_id = cliente_google_drive_connection.cliente_id)
        )
    )
  );

-- OAuth state e tokens só via Edge Function (service role) / RPCs SECURITY DEFINER
DROP POLICY IF EXISTS google_drive_oauth_state_deny_all ON public.google_drive_oauth_state;
CREATE POLICY google_drive_oauth_state_deny_all
  ON public.google_drive_oauth_state
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

GRANT SELECT ON public.cliente_google_drive_connection TO authenticated;
GRANT EXECUTE ON FUNCTION public.google_drive_secret_name(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cliente_has_google_drive_token(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_cliente_google_drive_connection(uuid) TO authenticated;
-- set_cliente_google_drive_token: usado pela Edge Function com service role
GRANT EXECUTE ON FUNCTION public.set_cliente_google_drive_token(uuid, text, text, text, text, uuid, text, text, boolean) TO service_role;
