-- Quem o cliente publica: conteúdo conclui sem link da publicação.
-- Marca no cadastro (postagem_do_cliente) ou no canal (status client_posts).

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS postagem_do_cliente boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clientes.postagem_do_cliente IS
  'Se verdadeiro, a postagem é do cliente. Conteúdo vai a Redes Sociais (Concluídos) sem link.';

ALTER TABLE public.task_channel_publications
  DROP CONSTRAINT IF EXISTS task_channel_publications_status_valid;

ALTER TABLE public.task_channel_publications
  ADD CONSTRAINT task_channel_publications_status_valid
    CHECK (status IN ('pending', 'scheduled', 'published', 'failed', 'cancelled', 'client_posts'));

CREATE OR REPLACE FUNCTION planeje_private.content_ready_for_social_archive(p_task uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.tarefas AS t
      JOIN public.clientes AS c ON c.id = t.client_id
      WHERE t.id = p_task
        AND c.postagem_do_cliente
    )
    OR (
      EXISTS (
        SELECT 1
        FROM public.task_channel_publications AS p
        WHERE p.task_id = p_task
          AND p.status IN ('published', 'client_posts')
          AND (
            p.status = 'client_posts'
            OR (
              p.published_on IS NOT NULL
              AND p.evidence_url ~* '^https?://'
            )
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.task_channel_publications AS p
        WHERE p.task_id = p_task
          AND p.status NOT IN ('published', 'cancelled', 'client_posts')
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
          RAISE EXCEPTION 'Para ir a Redes Sociais (Concluídos), publique cada canal e cole o link — ou marque que o cliente publica.';
        END IF;
      END IF;
    ELSE
      RAISE EXCEPTION 'Conteúdo não fica na coluna Concluído. Com os canais publicados e o link, ou com postagem do cliente, ele vai para Redes Sociais (Concluídos).';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION planeje_private.guard_generic_task_completion() OWNER TO postgres;
REVOKE ALL ON FUNCTION planeje_private.guard_generic_task_completion() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION planeje_private.guard_task_published_with_channel_occurrences()
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
         AND publication.status NOT IN ('published', 'cancelled', 'client_posts')
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Ainda existem publicações por canal pendentes nesta tarefa.';
  END IF;
  RETURN NEW;
END
$$;
