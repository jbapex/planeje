-- Corrige fixar pasta: o POSIX do Postgres rejeita {8,256}.
-- Não reaplicar 20260920020000. Não reaplicar esta após sucesso.

CREATE OR REPLACE FUNCTION public.set_cliente_google_drive_favorite(
  p_cliente_id uuid,
  p_folder_id text DEFAULT NULL,
  p_folder_name text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id text;
  v_name text;
BEGIN
  IF p_cliente_id IS NULL THEN
    RAISE EXCEPTION 'cliente_id é obrigatório';
  END IF;

  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('superadmin', 'admin', 'colaborador')
          OR (p.role = 'cliente' AND p.cliente_id = p_cliente_id)
        )
    ) THEN
      RAISE EXCEPTION 'Sem permissão para fixar pasta deste cliente';
    END IF;
  END IF;

  v_id := NULLIF(btrim(COALESCE(p_folder_id, '')), '');
  IF v_id IS NOT NULL THEN
    IF v_id IN ('root', 'shared', 'recent-videos')
      OR char_length(v_id) < 8
      OR char_length(v_id) > 256
      OR v_id !~ '^[a-zA-Z0-9_-]+$' THEN
      RAISE EXCEPTION 'Pasta inválida para fixar';
    END IF;
    v_name := NULLIF(btrim(COALESCE(p_folder_name, '')), '');
    IF v_name IS NULL THEN
      v_name := 'Pasta favorita';
    ELSIF char_length(v_name) > 120 THEN
      v_name := left(v_name, 120);
    END IF;
  ELSE
    v_name := NULL;
  END IF;

  UPDATE public.cliente_google_drive_connection
  SET
    favorite_folder_id = v_id,
    favorite_folder_name = v_name,
    updated_at = NOW()
  WHERE cliente_id = p_cliente_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conecte o Google Drive desta empresa antes de fixar a pasta';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_cliente_google_drive_favorite(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
