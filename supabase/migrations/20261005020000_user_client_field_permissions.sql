-- Exceção por usuário para campos da página de clientes (valor mensal).
-- Sem linha, vale o padrão do papel em client_field_permissions.
-- Aplicar uma vez. Não reaplicar.

CREATE TABLE IF NOT EXISTS public.user_client_field_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  can_view boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_client_field_permissions_user_field_key UNIQUE (user_id, field_name)
);

ALTER TABLE public.user_client_field_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable insert/update/delete for superadmins" ON public.user_client_field_permissions;
CREATE POLICY "Enable insert/update/delete for superadmins"
  ON public.user_client_field_permissions
  FOR ALL
  TO authenticated
  USING (
    (SELECT profiles.role FROM public.profiles WHERE profiles.id = auth.uid()) = 'superadmin'
  )
  WITH CHECK (
    (SELECT profiles.role FROM public.profiles WHERE profiles.id = auth.uid()) = 'superadmin'
  );

DROP POLICY IF EXISTS "Enable read for user or superadmin" ON public.user_client_field_permissions;
CREATE POLICY "Enable read for user or superadmin"
  ON public.user_client_field_permissions
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR (SELECT profiles.role FROM public.profiles WHERE profiles.id = auth.uid()) = 'superadmin'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_client_field_permissions TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
