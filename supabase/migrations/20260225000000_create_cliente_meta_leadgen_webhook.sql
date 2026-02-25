-- Configuração de importação automática de leads do Meta (webhook leadgen).
-- Cada linha associa uma página do Facebook (meta_page_id) a um cliente e funil/etapa.
CREATE TABLE IF NOT EXISTS public.cliente_meta_leadgen_webhook (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  meta_page_id text NOT NULL,
  pipeline_id uuid NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE RESTRICT,
  stage_id uuid NOT NULL REFERENCES public.crm_stages(id) ON DELETE RESTRICT,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(cliente_id, meta_page_id)
);

CREATE INDEX IF NOT EXISTS idx_cliente_meta_leadgen_webhook_meta_page_id
  ON public.cliente_meta_leadgen_webhook(meta_page_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_cliente_meta_leadgen_webhook_cliente_id
  ON public.cliente_meta_leadgen_webhook(cliente_id);

CREATE OR REPLACE FUNCTION update_cliente_meta_leadgen_webhook_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_cliente_meta_leadgen_webhook_updated_at ON public.cliente_meta_leadgen_webhook;
CREATE TRIGGER trigger_update_cliente_meta_leadgen_webhook_updated_at
  BEFORE UPDATE ON public.cliente_meta_leadgen_webhook
  FOR EACH ROW
  EXECUTE FUNCTION update_cliente_meta_leadgen_webhook_updated_at();

ALTER TABLE public.cliente_meta_leadgen_webhook ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários autenticados podem ver config leadgen webhook" ON public.cliente_meta_leadgen_webhook;
CREATE POLICY "Usuários autenticados podem ver config leadgen webhook"
  ON public.cliente_meta_leadgen_webhook FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Usuários autenticados podem inserir config leadgen webhook" ON public.cliente_meta_leadgen_webhook;
CREATE POLICY "Usuários autenticados podem inserir config leadgen webhook"
  ON public.cliente_meta_leadgen_webhook FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Usuários autenticados podem atualizar config leadgen webhook" ON public.cliente_meta_leadgen_webhook;
CREATE POLICY "Usuários autenticados podem atualizar config leadgen webhook"
  ON public.cliente_meta_leadgen_webhook FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Usuários autenticados podem deletar config leadgen webhook" ON public.cliente_meta_leadgen_webhook;
CREATE POLICY "Usuários autenticados podem deletar config leadgen webhook"
  ON public.cliente_meta_leadgen_webhook FOR DELETE TO authenticated USING (true);

-- Service role precisa ler para o webhook resolver page_id -> cliente
DROP POLICY IF EXISTS "Service role pode ler config leadgen webhook" ON public.cliente_meta_leadgen_webhook;
CREATE POLICY "Service role pode ler config leadgen webhook"
  ON public.cliente_meta_leadgen_webhook FOR SELECT TO service_role USING (true);

COMMENT ON TABLE public.cliente_meta_leadgen_webhook IS 'Configuração para importação automática de leads do Meta (webhook leadgen): page_id -> cliente, funil e etapa';
