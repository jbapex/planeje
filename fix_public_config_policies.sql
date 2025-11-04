-- Script para corrigir políticas RLS da tabela public_config
-- Execute este SQL no Supabase Dashboard → SQL Editor

-- Dropar políticas antigas se existirem
drop policy if exists public_read on public_config;
drop policy if exists admin_write on public_config;
drop policy if exists admin_update on public_config;
drop policy if exists authenticated_upsert on public_config;

-- Política para leitura pública
create policy public_read on public_config for select using (true);

-- Política para inserir/atualizar apenas para usuários autenticados
create policy authenticated_upsert on public_config 
  for all 
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

