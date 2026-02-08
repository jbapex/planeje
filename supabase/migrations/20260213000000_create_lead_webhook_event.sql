-- =====================================================
-- Vínculo lead ↔ evento webhook para histórico no lead
-- Quando contato já cadastrado (Meta Ads), evento é vinculado ao lead.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.lead_webhook_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  webhook_log_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, webhook_log_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_webhook_event_lead
  ON public.lead_webhook_event (lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_webhook_event_webhook_log
  ON public.lead_webhook_event (webhook_log_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'leads')
     AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_schema = 'public' AND table_name = 'lead_webhook_event' AND constraint_name = 'fk_lead_webhook_event_lead') THEN
    ALTER TABLE public.lead_webhook_event
      ADD CONSTRAINT fk_lead_webhook_event_lead
      FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cliente_whatsapp_webhook_log')
     AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_schema = 'public' AND table_name = 'lead_webhook_event' AND constraint_name = 'fk_lead_webhook_event_webhook_log') THEN
    ALTER TABLE public.lead_webhook_event
      ADD CONSTRAINT fk_lead_webhook_event_webhook_log
      FOREIGN KEY (webhook_log_id) REFERENCES public.cliente_whatsapp_webhook_log(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMENT ON TABLE public.lead_webhook_event IS 'Eventos do webhook vinculados ao lead para exibir histórico (data do evento e eventos) na tela do lead';

-- RLS: acesso pelo mesmo critério dos leads (cliente vê só seus leads)
ALTER TABLE public.lead_webhook_event ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lead_webhook_event_superadmin_all" ON public.lead_webhook_event;
CREATE POLICY "lead_webhook_event_superadmin_all"
  ON public.lead_webhook_event FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));

DROP POLICY IF EXISTS "lead_webhook_event_cliente_own" ON public.lead_webhook_event;
CREATE POLICY "lead_webhook_event_cliente_own"
  ON public.lead_webhook_event FOR ALL TO authenticated
  USING (
    lead_id IN (SELECT l.id FROM public.leads l WHERE l.cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL))
  )
  WITH CHECK (
    lead_id IN (SELECT l.id FROM public.leads l WHERE l.cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL))
  );

DROP POLICY IF EXISTS "lead_webhook_event_admin_colaborador" ON public.lead_webhook_event;
CREATE POLICY "lead_webhook_event_admin_colaborador"
  ON public.lead_webhook_event FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'colaborador')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'colaborador')));
