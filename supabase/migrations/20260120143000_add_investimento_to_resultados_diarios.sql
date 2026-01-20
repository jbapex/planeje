-- Migration: adicionar campo investimento em ads na tabela cliente_resultados_diarios
-- Data: 2026-01-20

-- Adicionar coluna investimento (investimento em ads do dia)
alter table public.cliente_resultados_diarios
  add column if not exists investimento numeric(12, 2) not null default 0;

-- Comentário na coluna para documentação
comment on column public.cliente_resultados_diarios.investimento is 'Investimento em ads do dia em R$';
