-- Corrige RPCs que usavam '[]'::jsonb em assignee_ids; a coluna em tarefas é uuid[].

CREATE OR REPLACE FUNCTION public.move_task_to_social_media(task_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.tarefas
  SET
    type = 'social_media',
    status = 'completed',
    assignee_ids = ARRAY[]::uuid[]
  WHERE id = task_id;
END;
$$;

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
