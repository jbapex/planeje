-- Data+hora da postagem e exclusão real do canal na tarefa.
-- scheduled_for continua sendo o dia (índices/filtros existentes).
-- Não reaplicar.

ALTER TABLE public.task_channel_publications
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;

UPDATE public.task_channel_publications
SET scheduled_at = ((scheduled_for::timestamp + TIME '10:00') AT TIME ZONE 'America/Sao_Paulo')
WHERE scheduled_at IS NULL
  AND scheduled_for IS NOT NULL;

COMMENT ON COLUMN public.task_channel_publications.scheduled_at IS
  'Momento da postagem (data e hora). scheduled_for permanece o dia.';

GRANT DELETE ON TABLE public.task_channel_publications TO authenticated;

DROP POLICY IF EXISTS task_channel_publications_delete ON public.task_channel_publications;
CREATE POLICY task_channel_publications_delete
  ON public.task_channel_publications FOR DELETE TO authenticated
  USING ((SELECT public.can_use_task_channel_publications()));

DO $$
DECLARE
  fk_name text;
BEGIN
  SELECT con.conname INTO fk_name
  FROM pg_catalog.pg_constraint AS con
  WHERE con.conrelid = 'public.task_attachments'::regclass
    AND con.confrelid = 'public.task_channel_publications'::regclass
    AND con.contype = 'f'
  LIMIT 1;
  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.task_attachments DROP CONSTRAINT %I', fk_name);
  END IF;
END
$$;

ALTER TABLE public.task_attachments
  ADD CONSTRAINT task_attachments_publication_id_fkey
  FOREIGN KEY (publication_id)
  REFERENCES public.task_channel_publications(id)
  ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION planeje_private.validate_task_channel_publication()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.channel := pg_catalog.btrim(NEW.channel);
  NEW.destination := pg_catalog.btrim(NEW.destination);
  NEW.format := nullif(pg_catalog.btrim(NEW.format), '');
  NEW.evidence_url := nullif(pg_catalog.btrim(NEW.evidence_url), '');
  NEW.asset_url := nullif(pg_catalog.btrim(NEW.asset_url), '');

  IF NEW.scheduled_at IS NULL AND NEW.scheduled_for IS NOT NULL THEN
    NEW.scheduled_at := (NEW.scheduled_for::timestamp + TIME '10:00') AT TIME ZONE 'America/Sao_Paulo';
  ELSIF NEW.scheduled_at IS NOT NULL THEN
    NEW.scheduled_for := (NEW.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date;
  END IF;

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
    OR NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
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

NOTIFY pgrst, 'reload schema';
