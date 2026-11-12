-- Análise com IA de mensagens em grupos: detectar quando cliente aguarda resposta da equipe.

ALTER TABLE public.atendimento_conversas
  ADD COLUMN IF NOT EXISTS group_ai_analysis jsonb,
  ADD COLUMN IF NOT EXISTS group_ai_analyzed_at timestamptz;

COMMENT ON COLUMN public.atendimento_conversas.group_ai_analysis IS
  'Último resultado da IA para grupos: sender_role, needs_agency_response, confidence, reason.';
COMMENT ON COLUMN public.atendimento_conversas.group_ai_analyzed_at IS
  'Timestamp da última análise IA desta conversa de grupo.';

CREATE TABLE IF NOT EXISTS public.atendimento_grupo_analise_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.atendimento_conversas(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  inbox_message_id uuid REFERENCES public.cliente_whatsapp_inbox(id) ON DELETE SET NULL,
  message_id text,
  sender_jid text,
  sender_name text,
  message_preview text,
  needs_response boolean NOT NULL DEFAULT false,
  sender_role text NOT NULL DEFAULT 'desconhecido'
    CHECK (sender_role IN ('cliente', 'equipe', 'desconhecido')),
  confidence numeric(4, 3),
  reason text,
  model text,
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atendimento_grupo_analise_log_conversation
  ON public.atendimento_grupo_analise_log (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_atendimento_grupo_analise_log_cliente
  ON public.atendimento_grupo_analise_log (cliente_id, created_at DESC);

ALTER TABLE public.atendimento_grupo_analise_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "atendimento_grupo_analise_log_internal" ON public.atendimento_grupo_analise_log;
CREATE POLICY "atendimento_grupo_analise_log_internal"
  ON public.atendimento_grupo_analise_log FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin', 'admin', 'colaborador')));

COMMENT ON TABLE public.atendimento_grupo_analise_log IS
  'Histórico de análises IA por mensagem inbound em grupos WhatsApp.';
