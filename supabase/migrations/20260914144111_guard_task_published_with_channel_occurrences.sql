-- Keep the existing path for tasks without channel occurrences. When occurrences
-- exist, the main task can enter Published only after every one is done/cancelled.
CREATE FUNCTION planeje_private.guard_task_published_with_channel_occurrences()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'published'
     AND NEW.status IS DISTINCT FROM OLD.status
     AND EXISTS (
       SELECT 1
       FROM public.task_channel_publications AS publication
       WHERE publication.task_id = NEW.id
         AND publication.status NOT IN ('published', 'cancelled')
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Ainda existem publicações por canal pendentes nesta tarefa.';
  END IF;
  RETURN NEW;
END
$$;

ALTER FUNCTION planeje_private.guard_task_published_with_channel_occurrences() OWNER TO postgres;
REVOKE ALL ON FUNCTION planeje_private.guard_task_published_with_channel_occurrences()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER tarefas_guard_channel_publications_before_published
  BEFORE UPDATE OF status ON public.tarefas
  FOR EACH ROW
  EXECUTE FUNCTION planeje_private.guard_task_published_with_channel_occurrences();

COMMENT ON FUNCTION planeje_private.guard_task_published_with_channel_occurrences() IS
  'Blocks only transitions to Published when linked channel occurrences remain pending.';
