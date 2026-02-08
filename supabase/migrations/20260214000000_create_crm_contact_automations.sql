-- =====================================================
-- Migration: Regras de automação (contato novo -> funil/etapa)
-- Tabela crm_contact_automations + RLS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.crm_contact_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  trigger_type text NOT NULL DEFAULT 'new_contact',
  pipeline_id uuid NOT NULL,
  stage_id uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_contact_automations_cliente ON public.crm_contact_automations (cliente_id);
CREATE INDEX IF NOT EXISTS idx_crm_contact_automations_cliente_trigger_active ON public.crm_contact_automations (cliente_id, trigger_type, is_active);

-- Apenas uma regra ativa por cliente para trigger_type 'new_contact'
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_contact_automations_one_active_new_contact
  ON public.crm_contact_automations (cliente_id, trigger_type)
  WHERE is_active = true;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clientes') THEN
    ALTER TABLE public.crm_contact_automations
      DROP CONSTRAINT IF EXISTS fk_crm_contact_automations_cliente;
    ALTER TABLE public.crm_contact_automations
      ADD CONSTRAINT fk_crm_contact_automations_cliente
      FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'crm_pipelines') THEN
    ALTER TABLE public.crm_contact_automations
      DROP CONSTRAINT IF EXISTS fk_crm_contact_automations_pipeline;
    ALTER TABLE public.crm_contact_automations
      ADD CONSTRAINT fk_crm_contact_automations_pipeline
      FOREIGN KEY (pipeline_id) REFERENCES public.crm_pipelines(id) ON DELETE CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'crm_stages') THEN
    ALTER TABLE public.crm_contact_automations
      DROP CONSTRAINT IF EXISTS fk_crm_contact_automations_stage;
    ALTER TABLE public.crm_contact_automations
      ADD CONSTRAINT fk_crm_contact_automations_stage
      FOREIGN KEY (stage_id) REFERENCES public.crm_stages(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.crm_contact_automations_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_crm_contact_automations_updated_at ON public.crm_contact_automations;
CREATE TRIGGER trg_crm_contact_automations_updated_at
  BEFORE UPDATE ON public.crm_contact_automations
  FOR EACH ROW
  EXECUTE FUNCTION public.crm_contact_automations_set_updated_at();

-- RLS
ALTER TABLE public.crm_contact_automations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_contact_automations_superadmin_all" ON public.crm_contact_automations;
CREATE POLICY "crm_contact_automations_superadmin_all"
  ON public.crm_contact_automations FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));

DROP POLICY IF EXISTS "crm_contact_automations_cliente_own" ON public.crm_contact_automations;
CREATE POLICY "crm_contact_automations_cliente_own"
  ON public.crm_contact_automations FOR ALL TO authenticated
  USING (
    cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL)
  )
  WITH CHECK (
    cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL)
  );

DROP POLICY IF EXISTS "crm_contact_automations_admin_colaborador" ON public.crm_contact_automations;
CREATE POLICY "crm_contact_automations_admin_colaborador"
  ON public.crm_contact_automations FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'colaborador')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'colaborador')));
