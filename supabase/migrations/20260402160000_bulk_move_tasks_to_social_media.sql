-- Move em massa tarefas (ex.: fila antiga em Publicado) para Redes Sociais / concluído.
-- Mesma ideia de move_task_to_social_media; só admin/superadmin (checado na função).

CREATE OR REPLACE FUNCTION public.bulk_move_tasks_to_social_media(status_values text[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF status_values IS NULL OR cardinality(status_values) = 0 THEN
    RETURN 0;
  END IF;

  UPDATE public.tarefas
  SET
    type = 'social_media',
    status = 'completed',
    assignee_ids = ARRAY[]::uuid[]
  WHERE
    status = ANY (status_values)
    AND type IS DISTINCT FROM 'social_media';

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

COMMENT ON FUNCTION public.bulk_move_tasks_to_social_media(text[]) IS
  'Admin: move tarefas nos status indicados para o módulo Redes Sociais (concluído), como a automação, sem depender de mudança de status.';

GRANT EXECUTE ON FUNCTION public.bulk_move_tasks_to_social_media(text[]) TO authenticated;

-- Se no seu banco assignee_ids for jsonb, use: assignee_ids = '[]'::jsonb
