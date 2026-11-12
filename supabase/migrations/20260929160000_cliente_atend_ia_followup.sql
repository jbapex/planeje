-- Follow-up da IA da Ápice: se o contato não responder, a conversa ganha um horário.
-- Colunas em cliente_atend_conversas; o texto e as horas ficam no funil jsonb do agente.
-- Aplicar uma vez. Não reaplicar.

alter table public.cliente_atend_conversas
  add column if not exists ia_followup_passo integer not null default 0,
  add column if not exists ia_followup_due_at timestamptz;

create index if not exists cliente_atend_conversas_followup_due_idx
  on public.cliente_atend_conversas (ia_followup_due_at)
  where ia_followup_due_at is not null;
