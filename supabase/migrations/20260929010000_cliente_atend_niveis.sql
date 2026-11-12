-- Atendimento da loja — fase B: usuários da loja por nível (Administrador, Supervisor, Atendente).
-- Vale só para quem está em cliente_atend_membros (hoje só a Ápice). Aplicar uma vez.
begin;

-- Membro da loja que não é administrador ativo (supervisor, atendente ou desativado).
create or replace function public.cliente_atend_uid_nao_admin()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id
  from public.cliente_atend_membros m
  where m.user_id = auth.uid()
    and (m.nivel <> 'admin' or not m.ativo)
  limit 1
$$;
grant execute on function public.cliente_atend_uid_nao_admin() to authenticated;

-- Cadastro da loja (Meus Dados, cor, logo): só o administrador da loja grava.
drop policy if exists cliente_atend_nao_admin_clientes_update on public.clientes;
create policy cliente_atend_nao_admin_clientes_update on public.clientes
  as restrictive for update to authenticated
  using ((select public.cliente_atend_uid_nao_admin()) is null);
drop policy if exists cliente_atend_nao_admin_clientes_insert on public.clientes;
create policy cliente_atend_nao_admin_clientes_insert on public.clientes
  as restrictive for insert to authenticated
  with check ((select public.cliente_atend_uid_nao_admin()) is null);
drop policy if exists cliente_atend_nao_admin_clientes_delete on public.clientes;
create policy cliente_atend_nao_admin_clientes_delete on public.clientes
  as restrictive for delete to authenticated
  using ((select public.cliente_atend_uid_nao_admin()) is null);

-- Configurar do Mini CRM: atendente (ou desativado) não grava.
drop policy if exists cliente_atend_restrito_mini_crm_config_update on public.mini_crm_config;
create policy cliente_atend_restrito_mini_crm_config_update on public.mini_crm_config
  as restrictive for update to authenticated
  using ((select public.cliente_atend_uid_restrito()) is null);
drop policy if exists cliente_atend_restrito_mini_crm_config_insert on public.mini_crm_config;
create policy cliente_atend_restrito_mini_crm_config_insert on public.mini_crm_config
  as restrictive for insert to authenticated
  with check ((select public.cliente_atend_uid_restrito()) is null);
drop policy if exists cliente_atend_restrito_mini_crm_config_delete on public.mini_crm_config;
create policy cliente_atend_restrito_mini_crm_config_delete on public.mini_crm_config
  as restrictive for delete to authenticated
  using ((select public.cliente_atend_uid_restrito()) is null);

-- Membro da loja não troca o próprio papel, loja ou páginas liberadas pelo perfil.
create or replace function public.cliente_atend_profiles_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or auth.uid() <> old.id then
    return new;
  end if;
  if coalesce(current_setting('planeje.atend_sync', true), '') = '1' then
    return new;
  end if;
  if not exists (select 1 from public.cliente_atend_membros m where m.user_id = old.id) then
    return new;
  end if;
  if new.role is distinct from old.role
     or new.cliente_id is distinct from old.cliente_id
     or new.allowed_pages is distinct from old.allowed_pages then
    raise exception 'Usuário da loja não altera o próprio papel, loja ou páginas.';
  end if;
  return new;
end;
$$;

drop trigger if exists cliente_atend_profiles_guard_trg on public.profiles;
create trigger cliente_atend_profiles_guard_trg
  before update on public.profiles
  for each row execute function public.cliente_atend_profiles_guard();

-- Páginas do perfil acompanham o nível dos usuários criados pela loja (created_by preenchido).
-- Administrador: todas; supervisor/atendente: Atendimento, Mini CRM e Calendário; desativado: só Atendimento (sem acesso).
create or replace function public.cliente_atend_membros_sync_pages()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pages jsonb;
begin
  if new.created_by is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.nivel = old.nivel and new.ativo = old.ativo then
    return new;
  end if;
  if not new.ativo then
    v_pages := '["atendimento"]'::jsonb;
  elsif new.nivel = 'admin' then
    v_pages := null;
  else
    v_pages := '["atendimento", "mini-crm", "calendario"]'::jsonb;
  end if;
  perform set_config('planeje.atend_sync', '1', true);
  update public.profiles
    set allowed_pages = v_pages
  where id = new.user_id and role = 'cliente' and cliente_id = new.cliente_id;
  perform set_config('planeje.atend_sync', '', true);
  return new;
end;
$$;

drop trigger if exists cliente_atend_membros_sync_pages_trg on public.cliente_atend_membros;
create trigger cliente_atend_membros_sync_pages_trg
  after insert or update on public.cliente_atend_membros
  for each row execute function public.cliente_atend_membros_sync_pages();

commit;

notify pgrst, 'reload schema';
