-- Cópia de vídeo/miniatura do Google Drive para o anexo da tarefa.
-- Não reaplicar. Não importa configuração do staging.

ALTER TABLE public.task_attachments
  ADD COLUMN IF NOT EXISTS source_url text;

COMMENT ON COLUMN public.task_attachments.source_url IS
  'Link original no Drive; url fica o arquivo copiado no Planeje quando a sincronização cabe no limite.';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'task-drive',
  'task-drive',
  true,
  52428800,
  NULL
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS task_drive_select ON storage.objects;
CREATE POLICY task_drive_select
  ON storage.objects FOR SELECT
  USING (bucket_id = 'task-drive');

DROP POLICY IF EXISTS task_drive_insert_service ON storage.objects;
CREATE POLICY task_drive_insert_service
  ON storage.objects FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'task-drive');

DROP POLICY IF EXISTS task_drive_update_service ON storage.objects;
CREATE POLICY task_drive_update_service
  ON storage.objects FOR UPDATE
  TO service_role
  USING (bucket_id = 'task-drive')
  WITH CHECK (bucket_id = 'task-drive');
