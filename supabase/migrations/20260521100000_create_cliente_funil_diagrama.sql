-- Diagramas de funil por cliente (aba Funil em Rastreamento)

CREATE TABLE IF NOT EXISTS public.cliente_funil_diagrama (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Sem título',
  nodes jsonb NOT NULL DEFAULT '[]'::jsonb,
  edges jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cliente_funil_diagrama_cliente
  ON public.cliente_funil_diagrama (cliente_id);

CREATE INDEX IF NOT EXISTS idx_cliente_funil_diagrama_updated
  ON public.cliente_funil_diagrama (cliente_id, updated_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clientes') THEN
    ALTER TABLE public.cliente_funil_diagrama
      ADD CONSTRAINT fk_cliente_funil_diagrama_cliente
      FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMENT ON TABLE public.cliente_funil_diagrama IS 'Diagramas visuais de funil/jornada por cliente (aba Funil em Rastreamento)';

ALTER TABLE public.cliente_funil_diagrama ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cliente_funil_diagrama_superadmin_all" ON public.cliente_funil_diagrama;
CREATE POLICY "cliente_funil_diagrama_superadmin_all"
  ON public.cliente_funil_diagrama FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));

DROP POLICY IF EXISTS "cliente_funil_diagrama_cliente_own" ON public.cliente_funil_diagrama;
CREATE POLICY "cliente_funil_diagrama_cliente_own"
  ON public.cliente_funil_diagrama FOR ALL TO authenticated
  USING (
    cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL)
  )
  WITH CHECK (
    cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL)
  );

DROP POLICY IF EXISTS "cliente_funil_diagrama_admin_colaborador" ON public.cliente_funil_diagrama;
CREATE POLICY "cliente_funil_diagrama_admin_colaborador"
  ON public.cliente_funil_diagrama FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'colaborador')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'colaborador')));
