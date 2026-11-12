-- Fila de envio Instagram no Planeje (a Graph não agenda).
-- Não reaplicar.

ALTER TABLE public.task_channel_publications
  ADD COLUMN IF NOT EXISTS meta_dispatch jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.task_channel_publications.meta_dispatch IS
  'Fila de envio à Meta quando o Instagram não agenda na Graph (hold, phase, creation_id, locked_until).';

CREATE INDEX IF NOT EXISTS task_channel_publications_due_idx
  ON public.task_channel_publications (scheduled_at)
  WHERE status = 'scheduled' AND scheduled_at IS NOT NULL;
