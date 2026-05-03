-- Regras de destinatários por status de tarefa + preferências por usuário (webhook planeje-briefing).

CREATE TABLE IF NOT EXISTS public.notificacao_regras_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status_value text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  destinatarios text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notificacao_regras_status_value_unique UNIQUE (status_value)
);

COMMENT ON TABLE public.notificacao_regras_status IS 'Por cada valor de status em tarefas.status: quem recebe WhatsApp. destinatarios: assignees | owner | josias | gestor.';
COMMENT ON COLUMN public.notificacao_regras_status.destinatarios IS 'Tipos: assignees, owner, josias, gestor';

CREATE TABLE IF NOT EXISTS public.notificacao_preferencias_usuario (
  user_id uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  silenciar_tudo boolean NOT NULL DEFAULT false,
  silenciar_proprias_acoes boolean NOT NULL DEFAULT false,
  statuses_silenciados text[] NOT NULL DEFAULT '{}'::text[],
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.notificacao_preferencias_usuario IS 'Silenciamento de notificações de mudança de status por usuário.';

-- Exemplo (ajuste status_value aos valores reais de task_statuses no seu projeto):
INSERT INTO public.notificacao_regras_status (status_value, ativo, destinatarios)
VALUES ('completed', true, ARRAY['assignees']::text[])
ON CONFLICT (status_value) DO NOTHING;

ALTER TABLE public.notificacao_regras_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacao_preferencias_usuario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notificacao_regras_status_select_equipe" ON public.notificacao_regras_status;
CREATE POLICY "notificacao_regras_status_select_equipe"
  ON public.notificacao_regras_status FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('superadmin', 'admin', 'colaborador')
    )
  );

DROP POLICY IF EXISTS "notificacao_regras_status_write_admin" ON public.notificacao_regras_status;
CREATE POLICY "notificacao_regras_status_write_admin"
  ON public.notificacao_regras_status FOR ALL TO authenticated
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

DROP POLICY IF EXISTS "notificacao_pref_select_own" ON public.notificacao_preferencias_usuario;
CREATE POLICY "notificacao_pref_select_own"
  ON public.notificacao_preferencias_usuario FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'superadmin'
    )
  );

DROP POLICY IF EXISTS "notificacao_pref_insert_own" ON public.notificacao_preferencias_usuario;
CREATE POLICY "notificacao_pref_insert_own"
  ON public.notificacao_preferencias_usuario FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "notificacao_pref_update_own" ON public.notificacao_preferencias_usuario;
CREATE POLICY "notificacao_pref_update_own"
  ON public.notificacao_preferencias_usuario FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "notificacao_pref_delete_own" ON public.notificacao_preferencias_usuario;
CREATE POLICY "notificacao_pref_delete_own"
  ON public.notificacao_preferencias_usuario FOR DELETE TO authenticated
  USING (user_id = auth.uid());
