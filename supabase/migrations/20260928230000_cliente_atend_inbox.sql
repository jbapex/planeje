-- Atendimento da loja (prévia só Ápice Noivas): membros por nível, setores, etiquetas,
-- estado da conversa (Entrada/Esperando/Finalizados), notas internas e respostas rápidas.
-- Aplicar UMA vez. Não mexe em atendimento_conversas/filas da agência.
-- Restrição extra (RESTRICTIVE) em cliente_whatsapp_contact/inbox/sent só pesa para
-- usuários da loja com nível atendente ou inativos; os demais papéis não mudam.

begin;

create or replace function public.cliente_atend_loja_habilitada(p_cliente_id uuid)
returns boolean
language sql
immutable
as $$
  select p_cliente_id is not null
     and p_cliente_id = 'a2396b48-2d2f-4b4b-adfd-3a4043b320e6'::uuid
$$;

create or replace function public.cliente_atend_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Setores ---------------------------------------------------------------
create table if not exists public.cliente_atend_setores (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  nome text not null check (length(btrim(nome)) between 1 and 60),
  cor text,
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cliente_id, nome),
  constraint cliente_atend_setores_loja check (public.cliente_atend_loja_habilitada(cliente_id))
);

-- Membros (usuários da loja com nível) ----------------------------------
create table if not exists public.cliente_atend_membros (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  nivel text not null default 'atendente' check (nivel in ('admin', 'supervisor', 'atendente')),
  ativo boolean not null default true,
  setor_ids uuid[] not null default '{}',
  nome text,
  email text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cliente_id, user_id),
  constraint cliente_atend_membros_loja check (public.cliente_atend_loja_habilitada(cliente_id))
);
create index if not exists cliente_atend_membros_user_idx on public.cliente_atend_membros (user_id);

-- Etiquetas -------------------------------------------------------------
create table if not exists public.cliente_atend_etiquetas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  nome text not null check (length(btrim(nome)) between 1 and 40),
  cor text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cliente_id, nome),
  constraint cliente_atend_etiquetas_loja check (public.cliente_atend_loja_habilitada(cliente_id))
);

-- Estado da conversa por contato ----------------------------------------
create table if not exists public.cliente_atend_conversas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  contact_id uuid not null references public.cliente_whatsapp_contact(id) on delete cascade,
  status text not null default 'entrada' check (status in ('entrada', 'esperando', 'finalizado')),
  status_at timestamptz not null default now(),
  finalizado_at timestamptz,
  finalizado_by uuid references public.profiles(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  setor_id uuid references public.cliente_atend_setores(id) on delete set null,
  privado boolean not null default false,
  etiqueta_ids uuid[] not null default '{}',
  contato_email text,
  ia_pausada boolean not null default false,
  ia_respondeu_em timestamptz,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cliente_id, contact_id),
  constraint cliente_atend_conversas_loja check (public.cliente_atend_loja_habilitada(cliente_id))
);
create index if not exists cliente_atend_conversas_assigned_idx on public.cliente_atend_conversas (cliente_id, assigned_to);

-- Notas internas (nunca vão ao contato) ---------------------------------
create table if not exists public.cliente_atend_notas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  contact_id uuid not null references public.cliente_whatsapp_contact(id) on delete cascade,
  autor_id uuid references public.profiles(id) on delete set null,
  autor_nome text,
  texto text not null check (length(btrim(texto)) between 1 and 4000),
  created_at timestamptz not null default now(),
  constraint cliente_atend_notas_loja check (public.cliente_atend_loja_habilitada(cliente_id))
);
create index if not exists cliente_atend_notas_contact_idx on public.cliente_atend_notas (cliente_id, contact_id, created_at);

-- Respostas rápidas -----------------------------------------------------
create table if not exists public.cliente_atend_respostas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  titulo text not null check (length(btrim(titulo)) between 1 and 80),
  atalho text not null check (atalho ~ '^[a-z0-9_-]{1,30}$'),
  texto text not null check (length(btrim(texto)) between 1 and 4000),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cliente_id, atalho),
  constraint cliente_atend_respostas_loja check (public.cliente_atend_loja_habilitada(cliente_id))
);

create trigger cliente_atend_setores_touch before update on public.cliente_atend_setores
  for each row execute function public.cliente_atend_touch_updated_at();
create trigger cliente_atend_membros_touch before update on public.cliente_atend_membros
  for each row execute function public.cliente_atend_touch_updated_at();
create trigger cliente_atend_etiquetas_touch before update on public.cliente_atend_etiquetas
  for each row execute function public.cliente_atend_touch_updated_at();
create trigger cliente_atend_conversas_touch before update on public.cliente_atend_conversas
  for each row execute function public.cliente_atend_touch_updated_at();
create trigger cliente_atend_respostas_touch before update on public.cliente_atend_respostas
  for each row execute function public.cliente_atend_touch_updated_at();

-- Funções de acesso -----------------------------------------------------
create or replace function public.cliente_atend_nivel_de(p_user_id uuid, p_cliente_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
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
$$;

create or replace function public.cliente_atend_nivel(p_cliente_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.cliente_atend_nivel_de(auth.uid(), p_cliente_id)
$$;

create or replace function public.cliente_atend_is_membro(p_cliente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.cliente_atend_nivel(p_cliente_id) is not null
$$;

create or replace function public.cliente_atend_is_gestor(p_cliente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.cliente_atend_nivel(p_cliente_id) in ('admin', 'supervisor'), false)
$$;

create or replace function public.cliente_atend_is_admin(p_cliente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.cliente_atend_nivel(p_cliente_id) = 'admin', false)
$$;

create or replace function public.cliente_atend_is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'superadmin')
$$;

-- uid do usuário cuja leitura de contatos fica restrita (atendente ou inativo da loja).
create or replace function public.cliente_atend_uid_restrito()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id
  from public.cliente_atend_membros m
  where m.user_id = auth.uid()
    and (m.nivel = 'atendente' or not m.ativo)
  limit 1
$$;

create or replace function public.cliente_atend_pode_ver_contato_de(
  p_user_id uuid,
  p_cliente_id uuid,
  p_contact_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_nivel text;
  v_setores uuid[];
begin
  if p_user_id is null or p_cliente_id is null or p_contact_id is null then
    return false;
  end if;
  v_nivel := public.cliente_atend_nivel_de(p_user_id, p_cliente_id);
  if v_nivel is null then
    return false;
  end if;
  if v_nivel = 'admin' then
    return true;
  end if;
  if v_nivel = 'supervisor' then
    return not exists (
      select 1 from public.cliente_atend_conversas c
      where c.cliente_id = p_cliente_id and c.contact_id = p_contact_id
        and c.privado and c.assigned_to is distinct from p_user_id
    );
  end if;
  select m.setor_ids into v_setores
  from public.cliente_atend_membros m
  where m.user_id = p_user_id and m.cliente_id = p_cliente_id;
  return exists (
    select 1 from public.cliente_atend_conversas c
    where c.cliente_id = p_cliente_id
      and c.contact_id = p_contact_id
      and (
        c.assigned_to = p_user_id
        or (not c.privado and c.setor_id is not null and c.setor_id = any(coalesce(v_setores, '{}')))
      )
  );
end;
$$;

create or replace function public.cliente_atend_pode_ver_contato(p_cliente_id uuid, p_contact_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.cliente_atend_pode_ver_contato_de(auth.uid(), p_cliente_id, p_contact_id)
$$;

create or replace function public.cliente_atend_contato_por_jid(p_cliente_id uuid, p_jid text, p_phone text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  with d as (
    select nullif(regexp_replace(split_part(coalesce(nullif(p_jid, ''), p_phone, ''), '@', 1), '\D', '', 'g'), '') as digits
  )
  select c.id
  from public.cliente_whatsapp_contact c, d
  where c.cliente_id = p_cliente_id
    and (
      (p_jid is not null and p_jid <> '' and c.from_jid = p_jid)
      or (d.digits is not null and (
        c.phone = d.digits
        or regexp_replace(split_part(coalesce(c.from_jid, ''), '@', 1), '\D', '', 'g') = d.digits
      ))
    )
  limit 1
$$;

-- Guarda de membros: perfil precisa ser cliente da mesma loja e sempre sobra um admin ativo.
create or replace function public.cliente_atend_membros_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    if tg_op = 'UPDATE' then
      new.user_id := old.user_id;
      new.cliente_id := old.cliente_id;
    end if;
    if not exists (
      select 1 from public.profiles p
      where p.id = new.user_id and p.role = 'cliente' and p.cliente_id = new.cliente_id
    ) then
      raise exception 'Usuário precisa ser login cliente desta loja.';
    end if;
  end if;
  if (tg_op = 'DELETE' and old.nivel = 'admin' and old.ativo)
     or (tg_op = 'UPDATE' and old.nivel = 'admin' and old.ativo and (new.nivel <> 'admin' or not new.ativo)) then
    if not exists (
      select 1 from public.cliente_atend_membros m
      where m.cliente_id = old.cliente_id and m.id <> old.id and m.nivel = 'admin' and m.ativo
    ) then
      raise exception 'A loja precisa de pelo menos um administrador ativo.';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger cliente_atend_membros_guard_trg
  before insert or update or delete on public.cliente_atend_membros
  for each row execute function public.cliente_atend_membros_guard();

-- RLS -------------------------------------------------------------------
alter table public.cliente_atend_setores enable row level security;
alter table public.cliente_atend_membros enable row level security;
alter table public.cliente_atend_etiquetas enable row level security;
alter table public.cliente_atend_conversas enable row level security;
alter table public.cliente_atend_notas enable row level security;
alter table public.cliente_atend_respostas enable row level security;

-- setores / etiquetas / respostas: membro lê, gestor escreve.
create policy cliente_atend_setores_select on public.cliente_atend_setores for select to authenticated
  using (public.cliente_atend_is_membro(cliente_id) or public.cliente_atend_is_superadmin());
create policy cliente_atend_setores_write on public.cliente_atend_setores for all to authenticated
  using (public.cliente_atend_is_gestor(cliente_id))
  with check (public.cliente_atend_is_gestor(cliente_id));

create policy cliente_atend_etiquetas_select on public.cliente_atend_etiquetas for select to authenticated
  using (public.cliente_atend_is_membro(cliente_id) or public.cliente_atend_is_superadmin());
create policy cliente_atend_etiquetas_write on public.cliente_atend_etiquetas for all to authenticated
  using (public.cliente_atend_is_gestor(cliente_id))
  with check (public.cliente_atend_is_gestor(cliente_id));

create policy cliente_atend_respostas_select on public.cliente_atend_respostas for select to authenticated
  using (public.cliente_atend_is_membro(cliente_id) or public.cliente_atend_is_superadmin());
create policy cliente_atend_respostas_write on public.cliente_atend_respostas for all to authenticated
  using (public.cliente_atend_is_gestor(cliente_id))
  with check (public.cliente_atend_is_gestor(cliente_id));

-- membros: membro lê a equipe da loja; só admin escreve.
create policy cliente_atend_membros_select on public.cliente_atend_membros for select to authenticated
  using (
    public.cliente_atend_is_membro(cliente_id)
    or user_id = auth.uid()
    or public.cliente_atend_is_superadmin()
  );
create policy cliente_atend_membros_write on public.cliente_atend_membros for all to authenticated
  using (public.cliente_atend_is_admin(cliente_id))
  with check (public.cliente_atend_is_admin(cliente_id));

-- conversas: vê quem pode ver o contato; membro grava.
create policy cliente_atend_conversas_select on public.cliente_atend_conversas for select to authenticated
  using (
    public.cliente_atend_pode_ver_contato(cliente_id, contact_id)
    or public.cliente_atend_is_superadmin()
  );
create policy cliente_atend_conversas_insert on public.cliente_atend_conversas for insert to authenticated
  with check (
    public.cliente_atend_is_gestor(cliente_id)
    or (
      public.cliente_atend_is_membro(cliente_id)
      and assigned_to = auth.uid()
    )
  );
create policy cliente_atend_conversas_update on public.cliente_atend_conversas for update to authenticated
  using (public.cliente_atend_pode_ver_contato(cliente_id, contact_id))
  with check (public.cliente_atend_is_membro(cliente_id));
create policy cliente_atend_conversas_delete on public.cliente_atend_conversas for delete to authenticated
  using (public.cliente_atend_is_admin(cliente_id));

-- notas: vê quem vê o contato; autor grava; autor ou admin apaga.
create policy cliente_atend_notas_select on public.cliente_atend_notas for select to authenticated
  using (
    public.cliente_atend_pode_ver_contato(cliente_id, contact_id)
    or public.cliente_atend_is_superadmin()
  );
create policy cliente_atend_notas_insert on public.cliente_atend_notas for insert to authenticated
  with check (
    autor_id = auth.uid()
    and public.cliente_atend_pode_ver_contato(cliente_id, contact_id)
  );
create policy cliente_atend_notas_delete on public.cliente_atend_notas for delete to authenticated
  using (
    (autor_id = auth.uid() and public.cliente_atend_is_membro(cliente_id))
    or public.cliente_atend_is_admin(cliente_id)
  );

-- Restrição de leitura dos contatos/mensagens para atendente ou inativo da loja.
create policy cliente_atend_restrito_contact on public.cliente_whatsapp_contact
  as restrictive for all to authenticated
  using ((select public.cliente_atend_uid_restrito()) is null or public.cliente_atend_pode_ver_contato(cliente_id, id))
  with check ((select public.cliente_atend_uid_restrito()) is null or public.cliente_atend_pode_ver_contato(cliente_id, id));

create policy cliente_atend_restrito_inbox on public.cliente_whatsapp_inbox
  as restrictive for all to authenticated
  using (
    (select public.cliente_atend_uid_restrito()) is null
    or public.cliente_atend_pode_ver_contato(
      cliente_id,
      public.cliente_atend_contato_por_jid(cliente_id, coalesce(nullif(chat_jid, ''), from_jid), phone)
    )
  );

create policy cliente_atend_restrito_sent on public.cliente_whatsapp_sent
  as restrictive for all to authenticated
  using (
    (select public.cliente_atend_uid_restrito()) is null
    or public.cliente_atend_pode_ver_contato(
      cliente_id,
      public.cliente_atend_contato_por_jid(cliente_id, coalesce(nullif(chat_jid, ''), to_jid), null)
    )
  );

grant select, insert, update, delete on
  public.cliente_atend_setores,
  public.cliente_atend_membros,
  public.cliente_atend_etiquetas,
  public.cliente_atend_conversas,
  public.cliente_atend_notas,
  public.cliente_atend_respostas
to authenticated;
grant all on
  public.cliente_atend_setores,
  public.cliente_atend_membros,
  public.cliente_atend_etiquetas,
  public.cliente_atend_conversas,
  public.cliente_atend_notas,
  public.cliente_atend_respostas
to service_role;

grant execute on function
  public.cliente_atend_loja_habilitada(uuid),
  public.cliente_atend_nivel(uuid),
  public.cliente_atend_is_membro(uuid),
  public.cliente_atend_is_gestor(uuid),
  public.cliente_atend_is_admin(uuid),
  public.cliente_atend_pode_ver_contato(uuid, uuid)
to authenticated;
revoke execute on function public.cliente_atend_nivel_de(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.cliente_atend_pode_ver_contato_de(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.cliente_atend_nivel_de(uuid, uuid) to service_role;
grant execute on function public.cliente_atend_pode_ver_contato_de(uuid, uuid, uuid) to service_role;

-- Semente: dono atual da loja vira admin; setor Geral.
insert into public.cliente_atend_membros (cliente_id, user_id, nivel, ativo, nome, email)
select p.cliente_id, p.id, 'admin', true, p.full_name, lower(u.email)
from public.profiles p
join auth.users u on u.id = p.id
where lower(u.email) = 'apice@jbapex.com.br'
  and p.role = 'cliente'
  and p.cliente_id = 'a2396b48-2d2f-4b4b-adfd-3a4043b320e6'::uuid
on conflict (cliente_id, user_id) do nothing;

insert into public.cliente_atend_setores (cliente_id, nome, cor, ordem)
values ('a2396b48-2d2f-4b4b-adfd-3a4043b320e6'::uuid, 'Geral', '#3b6ef5', 0)
on conflict (cliente_id, nome) do nothing;

commit;

notify pgrst, 'reload schema';
