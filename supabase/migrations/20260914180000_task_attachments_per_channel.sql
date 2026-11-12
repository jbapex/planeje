-- An attachment can belong to the main material or to one channel occurrence.
ALTER TABLE public.task_attachments
  ADD COLUMN IF NOT EXISTS publication_id uuid
  REFERENCES public.task_channel_publications(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS task_attachments_publication_idx
  ON public.task_attachments (publication_id, created_at, id)
  WHERE publication_id IS NOT NULL;

CREATE OR REPLACE FUNCTION planeje_private.validate_task_attachment_publication()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.publication_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.task_channel_publications AS publication
    WHERE publication.id = NEW.publication_id
      AND publication.task_id = NEW.task_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'O anexo precisa pertencer a um canal desta mesma tarefa.';
  END IF;
  RETURN NEW;
END
$$;

ALTER FUNCTION planeje_private.validate_task_attachment_publication() OWNER TO postgres;
REVOKE ALL ON FUNCTION planeje_private.validate_task_attachment_publication()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS task_attachments_validate_publication ON public.task_attachments;
CREATE TRIGGER task_attachments_validate_publication
  BEFORE INSERT OR UPDATE OF task_id, publication_id ON public.task_attachments
  FOR EACH ROW EXECUTE FUNCTION planeje_private.validate_task_attachment_publication();

COMMENT ON COLUMN public.task_attachments.publication_id IS
  'Optional channel occurrence. NULL means the attachment belongs to the main material.';

NOTIFY pgrst, 'reload schema';
