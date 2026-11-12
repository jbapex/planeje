-- Admin/superadmin podem excluir qualquer solicitação, inclusive ApexIA com owner_id nulo.
-- Sem esta política o DELETE do PostgREST volta 204 vazio e a tela parece não apagar.

ALTER TABLE public.solicitacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS solicitacoes_admin_delete ON public.solicitacoes;
CREATE POLICY solicitacoes_admin_delete
ON public.solicitacoes
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('superadmin', 'admin')
  )
);

DROP POLICY IF EXISTS solicitacoes_owner_delete ON public.solicitacoes;
CREATE POLICY solicitacoes_owner_delete
ON public.solicitacoes
FOR DELETE
TO authenticated
USING (owner_id = auth.uid());
