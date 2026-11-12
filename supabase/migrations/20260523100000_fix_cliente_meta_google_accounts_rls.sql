-- Corrige RLS em cliente_meta_accounts e cliente_google_ads_accounts
-- (erro: new row violates row-level security policy)

-- ========== cliente_meta_accounts ==========
ALTER TABLE public.cliente_meta_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários autenticados podem ver vinculações" ON public.cliente_meta_accounts;
DROP POLICY IF EXISTS "Usuários autenticados podem inserir vinculações" ON public.cliente_meta_accounts;
DROP POLICY IF EXISTS "Usuários autenticados podem atualizar vinculações" ON public.cliente_meta_accounts;
DROP POLICY IF EXISTS "Usuários autenticados podem deletar vinculações" ON public.cliente_meta_accounts;
DROP POLICY IF EXISTS "cliente_meta_accounts_select" ON public.cliente_meta_accounts;
DROP POLICY IF EXISTS "cliente_meta_accounts_insert" ON public.cliente_meta_accounts;
DROP POLICY IF EXISTS "cliente_meta_accounts_update" ON public.cliente_meta_accounts;
DROP POLICY IF EXISTS "cliente_meta_accounts_delete" ON public.cliente_meta_accounts;
DROP POLICY IF EXISTS "cliente_meta_accounts_superadmin_all" ON public.cliente_meta_accounts;
DROP POLICY IF EXISTS "cliente_meta_accounts_cliente_own" ON public.cliente_meta_accounts;
DROP POLICY IF EXISTS "cliente_meta_accounts_admin_colaborador" ON public.cliente_meta_accounts;

CREATE POLICY "cliente_meta_accounts_superadmin_all"
  ON public.cliente_meta_accounts FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));

CREATE POLICY "cliente_meta_accounts_cliente_own"
  ON public.cliente_meta_accounts FOR ALL TO authenticated
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

CREATE POLICY "cliente_meta_accounts_admin_colaborador"
  ON public.cliente_meta_accounts FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'colaborador')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'colaborador')));

-- ========== cliente_google_ads_accounts ==========
ALTER TABLE public.cliente_google_ads_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cliente_google_ads_accounts_select" ON public.cliente_google_ads_accounts;
DROP POLICY IF EXISTS "cliente_google_ads_accounts_insert" ON public.cliente_google_ads_accounts;
DROP POLICY IF EXISTS "cliente_google_ads_accounts_update" ON public.cliente_google_ads_accounts;
DROP POLICY IF EXISTS "cliente_google_ads_accounts_delete" ON public.cliente_google_ads_accounts;
DROP POLICY IF EXISTS "cliente_google_ads_accounts_superadmin_all" ON public.cliente_google_ads_accounts;
DROP POLICY IF EXISTS "cliente_google_ads_accounts_cliente_own" ON public.cliente_google_ads_accounts;
DROP POLICY IF EXISTS "cliente_google_ads_accounts_admin_colaborador" ON public.cliente_google_ads_accounts;

CREATE POLICY "cliente_google_ads_accounts_superadmin_all"
  ON public.cliente_google_ads_accounts FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));

CREATE POLICY "cliente_google_ads_accounts_cliente_own"
  ON public.cliente_google_ads_accounts FOR ALL TO authenticated
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

CREATE POLICY "cliente_google_ads_accounts_admin_colaborador"
  ON public.cliente_google_ads_accounts FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'colaborador')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'colaborador')));
