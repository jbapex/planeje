-- Migration: Etiquetas (tags) no CRM
-- 1. cliente_crm_settings: coluna tags (jsonb) para definição das etiquetas por cliente
-- 2. leads: coluna etiquetas (text[]) para as etiquetas atribuídas a cada lead

-- 1. tags em cliente_crm_settings (formato: [{ "name": "quente", "color": "#ef4444" }, ...])
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cliente_crm_settings' AND column_name = 'tags'
  ) THEN
    ALTER TABLE public.cliente_crm_settings
      ADD COLUMN tags jsonb DEFAULT '[]'::jsonb;
    COMMENT ON COLUMN public.cliente_crm_settings.tags IS 'Etiquetas/tags definidas pelo cliente: array de { name, color }. Usadas para classificar leads.';
  END IF;
END $$;

-- 2. etiquetas em leads (array de nomes de tags)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'etiquetas'
  ) THEN
    ALTER TABLE public.leads
      ADD COLUMN etiquetas text[] DEFAULT '{}';
    COMMENT ON COLUMN public.leads.etiquetas IS 'Nomes das etiquetas atribuídas ao lead. Valores devem existir em cliente_crm_settings.tags.';
    CREATE INDEX IF NOT EXISTS idx_leads_etiquetas ON public.leads USING GIN (etiquetas);
  END IF;
END $$;
