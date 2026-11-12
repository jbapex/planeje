-- Gatilhos de conversão do Rastreamento (por cliente). Aditivo.

BEGIN;

CREATE TABLE IF NOT EXISTS public.rastreamento_conversion_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  name text NOT NULL,
  trigger_type text NOT NULL,
  trigger_value text NOT NULL,
  match_mode text NOT NULL DEFAULT 'contains',
  event_name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rastreamento_conversion_rules_trigger_type_chk
    CHECK (trigger_type IN ('etiqueta', 'mensagem')),
  CONSTRAINT rastreamento_conversion_rules_match_mode_chk
    CHECK (match_mode IN ('contains', 'exact')),
  CONSTRAINT rastreamento_conversion_rules_event_name_chk
    CHECK (event_name IN ('Lead', 'QualifiedLead', 'Purchase'))
);

CREATE INDEX IF NOT EXISTS idx_rastreamento_conversion_rules_cliente_active
  ON public.rastreamento_conversion_rules (cliente_id, active);

COMMENT ON TABLE public.rastreamento_conversion_rules IS
  'Gatilhos: etiqueta CRM ou frase de mensagem dispara evento Meta (Lead/QualifiedLead/Purchase).';

ALTER TABLE public.rastreamento_conversion_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rastreamento_conversion_rules_staff" ON public.rastreamento_conversion_rules;
CREATE POLICY "rastreamento_conversion_rules_staff"
  ON public.rastreamento_conversion_rules FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin', 'admin', 'colaborador'))
    OR cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin', 'admin', 'colaborador'))
    OR cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rastreamento_conversion_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rastreamento_conversion_rules TO service_role;

COMMIT;
