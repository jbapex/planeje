-- CRM-APICE: permitir que o front (usuário logado) leia/grave o secret do Planeje por cliente.
-- Rode depois de 20260403120000_planeje_status_sync_config.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
    RAISE NOTICE 'Tabela profiles não existe; políticas RLS para UI não criadas.';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "crm_planeje_status_sync_superadmin" ON public.crm_planeje_status_sync;
  CREATE POLICY "crm_planeje_status_sync_superadmin"
    ON public.crm_planeje_status_sync FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));

  DROP POLICY IF EXISTS "crm_planeje_status_sync_cliente" ON public.crm_planeje_status_sync;
  CREATE POLICY "crm_planeje_status_sync_cliente"
    ON public.crm_planeje_status_sync FOR ALL TO authenticated
    USING (
      cliente_id IN (
        SELECT cliente_id FROM public.profiles
        WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL
      )
    )
    WITH CHECK (
      cliente_id IN (
        SELECT cliente_id FROM public.profiles
        WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL
      )
    );

  DROP POLICY IF EXISTS "crm_planeje_status_sync_admin_colab" ON public.crm_planeje_status_sync;
  CREATE POLICY "crm_planeje_status_sync_admin_colab"
    ON public.crm_planeje_status_sync FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'colaborador')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'colaborador')));
END $$;
