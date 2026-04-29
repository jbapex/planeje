-- Rode esta migration no SUPABASE DO CRM-APICE (não no Planeje).
-- Guarda o Bearer que o Planeje espera (o mesmo gerado em Canais → secret de status), por cliente.

CREATE TABLE IF NOT EXISTS public.crm_planeje_status_sync (
  cliente_id uuid PRIMARY KEY,
  planeje_bearer_secret text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.crm_planeje_status_sync IS 'Bearer para POST em crm-apice-contact-status-webhook do Planeje; um segredo por cliente_id (mesmo UUID no Apice e no Planeje).';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'clientes'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'crm_planeje_status_sync_cliente_id_fkey'
  ) THEN
    ALTER TABLE public.crm_planeje_status_sync
      ADD CONSTRAINT crm_planeje_status_sync_cliente_id_fkey
      FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE public.crm_planeje_status_sync ENABLE ROW LEVEL SECURITY;

-- Service role bypassa RLS; política mínima para authenticated (admin Apice pode gerir via SQL/painel)
DROP POLICY IF EXISTS "crm_planeje_status_sync_service" ON public.crm_planeje_status_sync;
CREATE POLICY "crm_planeje_status_sync_service"
  ON public.crm_planeje_status_sync FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_crm_planeje_status_sync_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_planeje_status_sync_updated ON public.crm_planeje_status_sync;
CREATE TRIGGER trg_crm_planeje_status_sync_updated
  BEFORE UPDATE ON public.crm_planeje_status_sync
  FOR EACH ROW EXECUTE FUNCTION public.set_crm_planeje_status_sync_updated_at();
