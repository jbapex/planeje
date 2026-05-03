-- Permite superadmin e admin atualizarem linhas em profiles (ex.: coluna whatsapp na página Automações).
-- Idempotente: seguro rodar de novo no SQL Editor.

DROP POLICY IF EXISTS "superadmin e admin podem atualizar whatsapp da equipe" ON public.profiles;
DROP POLICY IF EXISTS "profiles_equipe_update_whatsapp" ON public.profiles;

CREATE POLICY "superadmin e admin podem atualizar whatsapp da equipe"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('superadmin', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('superadmin', 'admin')
    )
  );
