-- CRM-APICE: configuração global (uma linha) + URL opcional por cliente.
-- Assim o usuário configura tudo pelo app; secrets do Supabase ficam opcionais (fallback).

ALTER TABLE public.crm_planeje_status_sync
  ADD COLUMN IF NOT EXISTS planeje_status_webhook_url text;

COMMENT ON COLUMN public.crm_planeje_status_sync.planeje_status_webhook_url IS 'Se preenchido, sobrescreve a URL padrão do webhook de status do Planeje para este cliente.';

CREATE TABLE IF NOT EXISTS public.crm_planeje_global_settings (
  id smallint PRIMARY KEY CHECK (id = 1),
  apice_database_webhook_secret text,
  planeje_default_status_webhook_url text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.crm_planeje_global_settings IS 'Configuração única do projeto Ápice para integração Planeje (secret do webhook de banco + URL padrão).';
COMMENT ON COLUMN public.crm_planeje_global_settings.apice_database_webhook_secret IS 'Mesmo Bearer do Database Webhook (Supabase) que chama notify-planeje-lead-status.';
COMMENT ON COLUMN public.crm_planeje_global_settings.planeje_default_status_webhook_url IS 'URL completa da função crm-apice-contact-status-webhook no Planeje, quando o cliente não define URL própria.';

INSERT INTO public.crm_planeje_global_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.crm_planeje_global_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_planeje_global_settings_service" ON public.crm_planeje_global_settings;
CREATE POLICY "crm_planeje_global_settings_service"
  ON public.crm_planeje_global_settings FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
    DROP POLICY IF EXISTS "crm_planeje_global_settings_superadmin" ON public.crm_planeje_global_settings;
    CREATE POLICY "crm_planeje_global_settings_superadmin"
      ON public.crm_planeje_global_settings FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'))
      WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_crm_planeje_global_settings_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_planeje_global_settings_updated ON public.crm_planeje_global_settings;
CREATE TRIGGER trg_crm_planeje_global_settings_updated
  BEFORE UPDATE ON public.crm_planeje_global_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_crm_planeje_global_settings_updated_at();
