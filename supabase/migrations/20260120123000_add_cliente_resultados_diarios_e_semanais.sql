-- Migration: criar tabelas de resultados diários e semanais do cliente
-- Data: 2026-01-20

-- Garante extensão para geração de UUIDs (já deve existir no Supabase, mas deixamos idempotente)
create extension if not exists "pgcrypto" with schema public;

-- =====================================================================
-- Tabela: cliente_resultados_diarios
-- =====================================================================

create table if not exists public.cliente_resultados_diarios (
  id uuid primary key default gen_random_uuid(),

  -- Referência ao cliente dono dos resultados
  cliente_id uuid not null
    references public.clientes(id)
    on delete cascade,

  -- Data de referência dos resultados
  data_referencia date not null,

  -- Métricas diárias de funil
  leads integer not null default 0,
  visitas_agendadas integer not null default 0,
  visitas_realizadas integer not null default 0,
  vendas integer not null default 0,

  -- Faturamento do dia
  faturamento numeric(12, 2) not null default 0,

  -- Observações livres
  observacoes text,

  -- Usuário que cadastrou (opcional, pode ser colaborador interno)
  created_by uuid
    references public.profiles(id)
    on delete set null,

  -- Data de criação do registro
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists cliente_resultados_diarios_cliente_id_data_idx
  on public.cliente_resultados_diarios (cliente_id, data_referencia desc);

-- =====================================================================
-- Tabela: cliente_resultados_semanais
-- =====================================================================

create table if not exists public.cliente_resultados_semanais (
  id uuid primary key default gen_random_uuid(),

  -- Referência ao cliente dono dos resultados
  cliente_id uuid not null
    references public.clientes(id)
    on delete cascade,

  -- Intervalo da semana (início e fim)
  semana_inicio date not null,
  semana_fim date not null,

  -- Métricas de tráfego agregadas na semana
  impressoes integer not null default 0,
  cliques integer not null default 0,
  leads integer not null default 0,

  -- Investimento em mídia na semana
  investimento numeric(12, 2) not null default 0,

  -- Observações livres
  observacoes text,

  -- Usuário que cadastrou (opcional)
  created_by uuid
    references public.profiles(id)
    on delete set null,

  -- Data de criação do registro
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists cliente_resultados_semanais_cli_semana_idx
  on public.cliente_resultados_semanais (cliente_id, semana_inicio desc);

