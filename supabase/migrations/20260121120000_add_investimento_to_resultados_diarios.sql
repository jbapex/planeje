-- Migration: adicionar campo investimento em ads diário na tabela cliente_resultados_diarios
-- Data: 2026-01-21

-- =====================================================================
-- Adicionar coluna investimento na tabela cliente_resultados_diarios
-- =====================================================================

-- Adiciona coluna investimento (numeric(12, 2))
-- Permite NULL temporariamente para dados existentes
-- Valor padrão: 0
alter table public.cliente_resultados_diarios
  add column if not exists investimento numeric(12, 2) default 0;

-- Atualiza registros existentes que possam ter NULL para 0
update public.cliente_resultados_diarios
  set investimento = 0
  where investimento is null;

-- Torna a coluna NOT NULL após atualizar dados existentes
-- (comentado por enquanto para permitir migração gradual)
-- alter table public.cliente_resultados_diarios
--   alter column investimento set not null;
