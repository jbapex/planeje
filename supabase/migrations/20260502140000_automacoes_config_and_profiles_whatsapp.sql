-- Automações globais (briefing diário, notificação de tarefa) + WhatsApp da equipe em profiles.
CREATE TABLE IF NOT EXISTS public.automacoes_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT false,
  configuracao jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automacoes_config_nome_unique UNIQUE (nome)
);

CREATE INDEX IF NOT EXISTS idx_automacoes_config_ativo
  ON public.automacoes_config (ativo)
  WHERE ativo = true;

COMMENT ON TABLE public.automacoes_config IS 'Configurações de automações (planeje-briefing, webhooks). nome: briefing_diario | notificacao_tarefa; configuracao: json (ex.: horario, numeros_briefing).';

INSERT INTO public.automacoes_config (nome, ativo, configuracao)
VALUES
  ('briefing_diario', true, jsonb_build_object('horario', '08:00', 'numeros_briefing', '[]'::jsonb)),
  ('notificacao_tarefa', true, '{}'::jsonb)
ON CONFLICT (nome) DO NOTHING;

ALTER TABLE public.automacoes_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "automacoes_config_select_equipe" ON public.automacoes_config;
CREATE POLICY "automacoes_config_select_equipe"
  ON public.automacoes_config FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('superadmin', 'admin', 'colaborador')
    )
  );

DROP POLICY IF EXISTS "automacoes_config_write_admin" ON public.automacoes_config;
CREATE POLICY "automacoes_config_write_admin"
  ON public.automacoes_config FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('superadmin', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('superadmin', 'admin')
    )
  );

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS whatsapp text;

COMMENT ON COLUMN public.profiles.whatsapp IS 'Número WhatsApp (apenas dígitos ou E.164) para notificações e equipe.';

DROP POLICY IF EXISTS "profiles_equipe_update_whatsapp" ON public.profiles;
CREATE POLICY "profiles_equipe_update_whatsapp"
  ON public.profiles FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('superadmin', 'admin')
    )
    AND role IN ('superadmin', 'admin', 'colaborador')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('superadmin', 'admin')
    )
    AND role IN ('superadmin', 'admin', 'colaborador')
  );
