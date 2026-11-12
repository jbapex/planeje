-- Lembretes internos: controle de última notificação ao responsável.

ALTER TABLE public.atendimento_conversa_planejamento
  ADD COLUMN IF NOT EXISTS last_notified_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_atendimento_planejamento_assignee_due
  ON public.atendimento_conversa_planejamento (assignee_id, status, scheduled_at)
  WHERE status = 'pendente';

COMMENT ON COLUMN public.atendimento_conversa_planejamento.last_notified_at IS 'Última notificação in-app enviada ao responsável (repete a cada ~10 min enquanto pendente)';
