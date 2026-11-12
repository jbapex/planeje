-- Upload temporário para publicar na Meta (meta-publish-temp/).
-- Usuário autenticado pode gravar/apagar só neste prefixo; bucket continua público na leitura.
-- Não reaplicar.

DROP POLICY IF EXISTS task_drive_meta_publish_insert ON storage.objects;
CREATE POLICY task_drive_meta_publish_insert
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'task-drive'
    AND name LIKE 'meta-publish-temp/%'
  );

DROP POLICY IF EXISTS task_drive_meta_publish_update ON storage.objects;
CREATE POLICY task_drive_meta_publish_update
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'task-drive'
    AND name LIKE 'meta-publish-temp/%'
  )
  WITH CHECK (
    bucket_id = 'task-drive'
    AND name LIKE 'meta-publish-temp/%'
  );

DROP POLICY IF EXISTS task_drive_meta_publish_delete ON storage.objects;
CREATE POLICY task_drive_meta_publish_delete
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'task-drive'
    AND name LIKE 'meta-publish-temp/%'
  );

DROP POLICY IF EXISTS task_drive_delete_service ON storage.objects;
CREATE POLICY task_drive_delete_service
  ON storage.objects FOR DELETE
  TO service_role
  USING (bucket_id = 'task-drive');
