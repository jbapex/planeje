-- Configuração de sincronização automática por Form ID (polling a cada 1 minuto).
-- Cada linha associa um form_id do Meta a cliente, funil e etapa; last_synced_at para buscar só leads novos.
CREATE TABLE IF NOT EXISTS public.cliente_meta_leadgen_polling (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  form_id text NOT NULL,
  pipeline_id uuid NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE RESTRICT,
  stage_id uuid NOT NULL REFERENCES public.crm_stages(id) ON DELETE RESTRICT,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(cliente_id, form_id)
);

CREATE INDEX IF NOT EXISTS idx_cliente_meta_leadgen_polling_form_id
  ON public.cliente_meta_leadgen_polling(form_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_cliente_meta_leadgen_polling_cliente_id
  ON public.cliente_meta_leadgen_polling(cliente_id);

CREATE OR REPLACE FUNCTION update_cliente_meta_leadgen_polling_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_cliente_meta_leadgen_polling_updated_at ON public.cliente_meta_leadgen_polling;
CREATE TRIGGER trigger_update_cliente_meta_leadgen_polling_updated_at
  BEFORE UPDATE ON public.cliente_meta_leadgen_polling
  FOR EACH ROW
  EXECUTE FUNCTION update_cliente_meta_leadgen_polling_updated_at();

ALTER TABLE public.cliente_meta_leadgen_polling ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários autenticados podem ver config leadgen polling" ON public.cliente_meta_leadgen_polling;
CREATE POLICY "Usuários autenticados podem ver config leadgen polling"
  ON public.cliente_meta_leadgen_polling FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Usuários autenticados podem inserir config leadgen polling" ON public.cliente_meta_leadgen_polling;
CREATE POLICY "Usuários autenticados podem inserir config leadgen polling"
  ON public.cliente_meta_leadgen_polling FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Usuários autenticados podem atualizar config leadgen polling" ON public.cliente_meta_leadgen_polling;
CREATE POLICY "Usuários autenticados podem atualizar config leadgen polling"
  ON public.cliente_meta_leadgen_polling FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Usuários autenticados podem deletar config leadgen polling" ON public.cliente_meta_leadgen_polling;
CREATE POLICY "Usuários autenticados podem deletar config leadgen polling"
  ON public.cliente_meta_leadgen_polling FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Service role pode ler config leadgen polling" ON public.cliente_meta_leadgen_polling;
CREATE POLICY "Service role pode ler config leadgen polling"
  ON public.cliente_meta_leadgen_polling FOR SELECT TO service_role USING (true);

DROP POLICY IF EXISTS "Service role pode atualizar last_synced_at" ON public.cliente_meta_leadgen_polling;
CREATE POLICY "Service role pode atualizar last_synced_at"
  ON public.cliente_meta_leadgen_polling FOR UPDATE TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.cliente_meta_leadgen_polling IS 'Configuração para sincronização automática de leads do Meta por Form ID (polling a cada 1 min): form_id -> cliente, funil e etapa';
