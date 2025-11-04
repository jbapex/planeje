-- Tabela simples de configuração pública chave-valor
create table if not exists public_config (
  key text primary key,
  value text,
  updated_at timestamp with time zone default now()
);

-- Permissões básicas (ajuste conforme sua política)
alter table public_config enable row level security;

-- Dropar políticas antigas se existirem
drop policy if exists public_read on public_config;
drop policy if exists admin_write on public_config;
drop policy if exists admin_update on public_config;
drop policy if exists authenticated_upsert on public_config;

-- Política para leitura pública
create policy public_read on public_config for select using (true);

-- Política para inserir/atualizar apenas para usuários autenticados
-- Verifica se existe um usuário autenticado via auth.uid()
create policy authenticated_upsert on public_config 
  for all 
  using (auth.uid() is not null)
  with check (auth.uid() is not null);


