-- Atendimento da loja vira módulo por cliente (Gerenciar módulos).
-- Padrão: Ápice ligada; demais lojas desligadas até o Super Admin ligar.
-- Não reaplicar. Não mexe no funil/IA da Ápice. Não liga Responder sozinho.

begin;

create table if not exists public.client_module_permissions (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  module_name text not null,
  is_enabled boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cliente_id, module_name)
);

create index if not exists client_module_permissions_module_idx
  on public.client_module_permissions (module_name, is_enabled);

alter table public.client_module_permissions enable row level security;

drop policy if exists client_module_permissions_superadmin on public.client_module_permissions;
create policy client_module_permissions_superadmin
  on public.client_module_permissions for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'superadmin'));

drop policy if exists client_module_permissions_loja_read on public.client_module_permissions;
create policy client_module_permissions_loja_read
  on public.client_module_permissions for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'cliente'
        and p.cliente_id = client_module_permissions.cliente_id
    )
  );

grant select, insert, update, delete on public.client_module_permissions to authenticated, service_role;

drop trigger if exists client_module_permissions_touch on public.client_module_permissions;
create trigger client_module_permissions_touch
  before update on public.client_module_permissions
  for each row execute function public.cliente_atend_touch_updated_at();

-- CHECKs antigos dependem da função IMMUTABLE só-Ápice; recria depois do STABLE.
alter table public.cliente_atend_setores drop constraint if exists cliente_atend_setores_loja;
alter table public.cliente_atend_membros drop constraint if exists cliente_atend_membros_loja;
alter table public.cliente_atend_etiquetas drop constraint if exists cliente_atend_etiquetas_loja;
alter table public.cliente_atend_conversas drop constraint if exists cliente_atend_conversas_loja;
alter table public.cliente_atend_notas drop constraint if exists cliente_atend_notas_loja;
alter table public.cliente_atend_respostas drop constraint if exists cliente_atend_respostas_loja;
alter table public.cliente_atend_ia_bases drop constraint if exists cliente_atend_ia_bases_loja;
alter table public.cliente_atend_ia_agentes drop constraint if exists cliente_atend_ia_agentes_loja;

create or replace function public.cliente_atend_loja_habilitada(p_cliente_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_cliente_id is not null and coalesce(
    (
      select cmp.is_enabled
      from public.client_module_permissions cmp
      where cmp.cliente_id = p_cliente_id
        and cmp.module_name = 'atendimento_loja'
      limit 1
    ),
    p_cliente_id = 'a2396b48-2d2f-4b4b-adfd-3a4043b320e6'::uuid
  );
$$;

alter table public.cliente_atend_setores
  add constraint cliente_atend_setores_loja check (public.cliente_atend_loja_habilitada(cliente_id));
alter table public.cliente_atend_membros
  add constraint cliente_atend_membros_loja check (public.cliente_atend_loja_habilitada(cliente_id));
alter table public.cliente_atend_etiquetas
  add constraint cliente_atend_etiquetas_loja check (public.cliente_atend_loja_habilitada(cliente_id));
alter table public.cliente_atend_conversas
  add constraint cliente_atend_conversas_loja check (public.cliente_atend_loja_habilitada(cliente_id));
alter table public.cliente_atend_notas
  add constraint cliente_atend_notas_loja check (public.cliente_atend_loja_habilitada(cliente_id));
alter table public.cliente_atend_respostas
  add constraint cliente_atend_respostas_loja check (public.cliente_atend_loja_habilitada(cliente_id));
alter table public.cliente_atend_ia_bases
  add constraint cliente_atend_ia_bases_loja check (public.cliente_atend_loja_habilitada(cliente_id));
alter table public.cliente_atend_ia_agentes
  add constraint cliente_atend_ia_agentes_loja check (public.cliente_atend_loja_habilitada(cliente_id));

create or replace function public.cliente_atend_nivel_de(p_user_id uuid, p_cliente_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select m.nivel
      from public.cliente_atend_membros m
      join public.profiles p on p.id = m.user_id
      where m.user_id = p_user_id
        and m.cliente_id = p_cliente_id
        and m.ativo
        and p.role = 'cliente'
        and p.cliente_id = p_cliente_id
        and public.cliente_atend_loja_habilitada(p_cliente_id)
      limit 1
    ),
    (
      select 'admin'::text
      from public.profiles p
      where p.id = p_user_id
        and p.role = 'cliente'
        and p.cliente_id = p_cliente_id
        and public.cliente_atend_loja_habilitada(p_cliente_id)
        and not exists (
          select 1 from public.cliente_atend_membros m where m.cliente_id = p_cliente_id
        )
      limit 1
    )
  );
$$;
-- Admin implícito: loja com módulo ligado e ainda sem linha em cliente_atend_membros.

insert into public.client_module_permissions (cliente_id, module_name, is_enabled)
select c.id, 'atendimento_loja', true
from public.clientes c
where c.id = 'a2396b48-2d2f-4b4b-adfd-3a4043b320e6'::uuid
on conflict (cliente_id, module_name) do nothing;

comment on table public.client_module_permissions is
  'Módulos da loja por cliente. atendimento_loja: inbox Umbler. Sem linha: Ápice ligada, demais desligadas.';

grant execute on function public.cliente_atend_loja_habilitada(uuid) to authenticated, service_role;
grant execute on function public.cliente_atend_nivel_de(uuid, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
