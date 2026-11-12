-- Atendimento da loja — fase C: agentes de IA e bases de conhecimento (só a loja habilitada, hoje Ápice).
-- A IA só sugere (a pessoa revisa e envia) e testa na área de teste. auto_responder nasce desligado
-- e nenhum processo envia sozinho nesta fase. Aplicar uma vez.
begin;

create table if not exists public.cliente_atend_ia_bases (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  nome text not null check (length(btrim(nome)) between 1 and 80),
  conteudo text not null default '' check (length(conteudo) <= 30000),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cliente_id, nome),
  constraint cliente_atend_ia_bases_loja check (public.cliente_atend_loja_habilitada(cliente_id))
);

create table if not exists public.cliente_atend_ia_agentes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  nome text not null check (length(btrim(nome)) between 1 and 60),
  objetivo text not null default '' check (length(objetivo) <= 500),
  instrucoes text not null default '' check (length(instrucoes) <= 8000),
  tom text not null default 'cordial' check (tom in ('cordial', 'formal', 'descontraido')),
  modelo text not null default 'openai/gpt-4o-mini' check (modelo in ('openai/gpt-4o-mini', 'openai/gpt-4o')),
  base_ids uuid[] not null default '{}',
  setor_ids uuid[] not null default '{}',
  ativo boolean not null default true,
  auto_responder boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cliente_id, nome),
  constraint cliente_atend_ia_agentes_loja check (public.cliente_atend_loja_habilitada(cliente_id))
);

create table if not exists public.cliente_atend_ia_log (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  agente_id uuid references public.cliente_atend_ia_agentes(id) on delete set null,
  contact_id uuid references public.cliente_whatsapp_contact(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  acao text not null check (acao in ('testar', 'sugerir')),
  modelo text,
  tokens integer,
  created_at timestamptz not null default now()
);
create index if not exists cliente_atend_ia_log_cliente_idx on public.cliente_atend_ia_log (cliente_id, created_at desc);

create trigger cliente_atend_ia_bases_touch before update on public.cliente_atend_ia_bases
  for each row execute function public.cliente_atend_touch_updated_at();
create trigger cliente_atend_ia_agentes_touch before update on public.cliente_atend_ia_agentes
  for each row execute function public.cliente_atend_touch_updated_at();

alter table public.cliente_atend_ia_bases enable row level security;
alter table public.cliente_atend_ia_agentes enable row level security;
alter table public.cliente_atend_ia_log enable row level security;

-- Bases: só o administrador da loja lê e grava (a função lê com a chave de serviço).
create policy cliente_atend_ia_bases_admin on public.cliente_atend_ia_bases for all to authenticated
  using (public.cliente_atend_is_admin(cliente_id) or public.cliente_atend_is_superadmin())
  with check (public.cliente_atend_is_admin(cliente_id));

-- Agentes: membro ativo lê (para mostrar Sugerir resposta); só o administrador grava.
create policy cliente_atend_ia_agentes_select on public.cliente_atend_ia_agentes for select to authenticated
  using (public.cliente_atend_is_membro(cliente_id) or public.cliente_atend_is_superadmin());
create policy cliente_atend_ia_agentes_write on public.cliente_atend_ia_agentes for all to authenticated
  using (public.cliente_atend_is_admin(cliente_id))
  with check (public.cliente_atend_is_admin(cliente_id));

-- Log: administrador lê; a função grava com a chave de serviço.
create policy cliente_atend_ia_log_select on public.cliente_atend_ia_log for select to authenticated
  using (public.cliente_atend_is_admin(cliente_id) or public.cliente_atend_is_superadmin());

grant select, insert, update, delete on public.cliente_atend_ia_bases, public.cliente_atend_ia_agentes to authenticated;
grant select on public.cliente_atend_ia_log to authenticated;
grant all on public.cliente_atend_ia_bases, public.cliente_atend_ia_agentes, public.cliente_atend_ia_log to service_role;

commit;

notify pgrst, 'reload schema';
