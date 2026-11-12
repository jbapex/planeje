-- Conteúdo não fica na coluna Concluído de Tarefas.
-- Com cada canal publicado ou cancelado e o link http(s) da publicação,
-- a mesma tarefa pode virar Redes Sociais (type social_media, status completed).

CREATE OR REPLACE FUNCTION planeje_private.content_ready_for_social_archive(p_task uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.task_channel_publications AS p
    WHERE p.task_id = p_task
      AND p.status = 'published'
      AND p.published_on IS NOT NULL
      AND p.evidence_url ~* '^https?://'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.task_channel_publications AS p
    WHERE p.task_id = p_task
      AND p.status NOT IN ('published', 'cancelled')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.task_channel_publications AS p
    WHERE p.task_id = p_task
      AND p.status = 'published'
      AND (
        p.published_on IS NULL
        OR p.evidence_url IS NULL
        OR p.evidence_url !~* '^https?://'
      )
  );
$$;

ALTER FUNCTION planeje_private.content_ready_for_social_archive(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION planeje_private.content_ready_for_social_archive(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION planeje_private.guard_generic_task_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'completed'
     AND lower(coalesce(NEW.type, '')) IN (
       'arte', 'carrossel', 'video', 'reels', 'post', 'posts', 'story', 'stories',
       'design', 'social_media', 'anuncio', 'anuncios'
     )
  THEN
    IF lower(NEW.type) = 'social_media' THEN
      IF TG_OP = 'UPDATE' AND lower(coalesce(OLD.type, '')) <> 'social_media' THEN
        IF NOT planeje_private.content_ready_for_social_archive(NEW.id) THEN
          RAISE EXCEPTION 'Para ir a Redes Sociais (Concluídos), publique cada canal e cole o link da publicação.';
        END IF;
      END IF;
    ELSE
      RAISE EXCEPTION 'Conteúdo não fica na coluna Concluído. Com os canais publicados e o link, ele vai para Redes Sociais (Concluídos).';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION planeje_private.guard_generic_task_completion() OWNER TO postgres;
REVOKE ALL ON FUNCTION planeje_private.guard_generic_task_completion() FROM PUBLIC, anon, authenticated;

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
    AND type IS DISTINCT FROM 'social_media'
    AND (
      lower(coalesce(type, '')) NOT IN (
        'arte', 'carrossel', 'video', 'reels', 'post', 'posts', 'story', 'stories',
        'design', 'anuncio', 'anuncios'
      )
      OR planeje_private.content_ready_for_social_archive(id)
    );

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
