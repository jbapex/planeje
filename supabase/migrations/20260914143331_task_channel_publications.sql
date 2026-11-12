-- One approved material can have independent publication occurrences per channel.
-- Existing tasks keep their current behavior when they have no linked occurrences.
CREATE TABLE public.task_channel_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tarefas(id) ON DELETE CASCADE,
  channel text NOT NULL,
  destination text NOT NULL,
  format text,
  assignee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  scheduled_for date NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  published_on date,
  evidence_url text,
  caption text,
  asset_url text,
  notes text,
  material_version integer NOT NULL DEFAULT 1,
  history jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT task_channel_publications_channel_valid
    CHECK (char_length(channel) BETWEEN 1 AND 80 AND channel = btrim(channel)),
  CONSTRAINT task_channel_publications_destination_valid
    CHECK (char_length(destination) BETWEEN 1 AND 160 AND destination = btrim(destination)),
  CONSTRAINT task_channel_publications_format_valid
    CHECK (format IS NULL OR (char_length(format) BETWEEN 1 AND 120 AND format = btrim(format))),
  CONSTRAINT task_channel_publications_status_valid
    CHECK (status IN ('pending', 'scheduled', 'published', 'failed', 'cancelled')),
  CONSTRAINT task_channel_publications_version_valid
    CHECK (material_version > 0),
  CONSTRAINT task_channel_publications_history_array
    CHECK (jsonb_typeof(history) = 'array'),
  CONSTRAINT task_channel_publications_published_evidence
    CHECK (
      status <> 'published'
      OR (
        published_on IS NOT NULL
        AND evidence_url IS NOT NULL
        AND char_length(btrim(evidence_url)) > 0
      )
    )
);

ALTER TABLE public.task_channel_publications OWNER TO postgres;

CREATE INDEX task_channel_publications_task_idx
  ON public.task_channel_publications (task_id, created_at, id);
CREATE INDEX task_channel_publications_queue_idx
  ON public.task_channel_publications (status, scheduled_for, id);
CREATE INDEX task_channel_publications_assignee_idx
  ON public.task_channel_publications (assignee_id, status, scheduled_for);

CREATE FUNCTION public.can_use_task_channel_publications()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = auth.uid()
      AND p.status = 'active'
      AND p.role IN ('admin', 'superadmin', 'colaborador')
  )
$$;
ALTER FUNCTION public.can_use_task_channel_publications() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_use_task_channel_publications()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_use_task_channel_publications()
  TO authenticated, service_role;

ALTER TABLE public.task_channel_publications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.task_channel_publications
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.task_channel_publications TO authenticated;
GRANT ALL ON TABLE public.task_channel_publications TO service_role;

CREATE POLICY task_channel_publications_read
  ON public.task_channel_publications FOR SELECT TO authenticated
  USING ((SELECT public.can_use_task_channel_publications()));
CREATE POLICY task_channel_publications_insert
  ON public.task_channel_publications FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.can_use_task_channel_publications()));
CREATE POLICY task_channel_publications_update
  ON public.task_channel_publications FOR UPDATE TO authenticated
  USING ((SELECT public.can_use_task_channel_publications()))
  WITH CHECK ((SELECT public.can_use_task_channel_publications()));
-- No authenticated DELETE grant or policy: cancelling preserves the occurrence and audit trail.

CREATE FUNCTION planeje_private.validate_task_channel_publication()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.channel := pg_catalog.btrim(NEW.channel);
  NEW.destination := pg_catalog.btrim(NEW.destination);
  NEW.format := pg_catalog.nullif(pg_catalog.btrim(NEW.format), '');
  NEW.evidence_url := pg_catalog.nullif(pg_catalog.btrim(NEW.evidence_url), '');
  NEW.asset_url := pg_catalog.nullif(pg_catalog.btrim(NEW.asset_url), '');

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.task_id IS DISTINCT FROM OLD.task_id THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'A publicação não pode ser movida para outra tarefa.';
    END IF;
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
    NEW.history := OLD.history;
  ELSE
    NEW.created_by := auth.uid();
    NEW.created_at := pg_catalog.clock_timestamp();
    NEW.history := '[]'::jsonb;
  END IF;

  IF TG_OP = 'INSERT' OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE p.id = NEW.assignee_id
        AND p.status = 'active'
        AND p.role IN ('admin', 'superadmin', 'colaborador')
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'Selecione um responsável interno ativo.';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND (
    NEW.channel IS DISTINCT FROM OLD.channel
    OR NEW.destination IS DISTINCT FROM OLD.destination
    OR NEW.format IS DISTINCT FROM OLD.format
    OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id
    OR NEW.scheduled_for IS DISTINCT FROM OLD.scheduled_for
    OR NEW.status IS DISTINCT FROM OLD.status
    OR NEW.published_on IS DISTINCT FROM OLD.published_on
    OR NEW.evidence_url IS DISTINCT FROM OLD.evidence_url
    OR NEW.caption IS DISTINCT FROM OLD.caption
    OR NEW.asset_url IS DISTINCT FROM OLD.asset_url
    OR NEW.notes IS DISTINCT FROM OLD.notes
    OR NEW.material_version IS DISTINCT FROM OLD.material_version
  ) THEN
    NEW.history := OLD.history || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'id', pg_catalog.gen_random_uuid(),
        'at', pg_catalog.clock_timestamp(),
        'actor_id', auth.uid(),
        'from_status', OLD.status,
        'to_status', NEW.status,
        'from_scheduled_for', OLD.scheduled_for,
        'to_scheduled_for', NEW.scheduled_for,
        'from_assignee_id', OLD.assignee_id,
        'to_assignee_id', NEW.assignee_id,
        'from_material_version', OLD.material_version,
        'to_material_version', NEW.material_version
      )
    );
  END IF;

  NEW.updated_at := pg_catalog.clock_timestamp();
  RETURN NEW;
END
$$;
ALTER FUNCTION planeje_private.validate_task_channel_publication() OWNER TO postgres;
REVOKE ALL ON FUNCTION planeje_private.validate_task_channel_publication()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER task_channel_publications_validate
  BEFORE INSERT OR UPDATE ON public.task_channel_publications
  FOR EACH ROW EXECUTE FUNCTION planeje_private.validate_task_channel_publication();

ALTER TABLE public.task_channel_publications REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'task_channel_publications'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.task_channel_publications;
  END IF;
END
$$;

COMMENT ON TABLE public.task_channel_publications IS
  'Independent per-channel distribution occurrences linked to one material task.';
COMMENT ON COLUMN public.task_channel_publications.history IS
  'Server-recorded edits and status transitions. Reposts create a new occurrence.';

NOTIFY pgrst, 'reload schema';
