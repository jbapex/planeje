create table public.gestor_ia_meta_cache (
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  conta_id text not null check (conta_id ~ '^act_[0-9]{1,32}$'),
  janela text not null check (janela in ('conta', 'historico') or janela ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}:[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  dados jsonb not null check (jsonb_typeof(dados) = 'object' and octet_length(dados::text) <= 4000000),
  lido_em timestamptz not null,
  primary key (cliente_id, conta_id, janela)
);
create index gestor_ia_meta_cache_ultima_leitura
  on public.gestor_ia_meta_cache (cliente_id, conta_id, lido_em desc)
  where janela not in ('conta', 'historico');

create table public.gestor_ia_meta_limites (
  chave text primary key check (chave = 'geral' or chave ~ '^act_[0-9]{1,32}$'),
  liberar_em timestamptz not null default '-infinity',
  reserva uuid,
  reserva_ate timestamptz not null default '-infinity',
  cliente_id uuid,
  conta_id text
);
insert into public.gestor_ia_meta_limites (chave) values ('geral');

alter table public.gestor_ia_meta_cache enable row level security;
alter table public.gestor_ia_meta_limites enable row level security;
revoke all on public.gestor_ia_meta_cache, public.gestor_ia_meta_limites from public, anon, authenticated, service_role;
grant select, insert, update on public.gestor_ia_meta_cache, public.gestor_ia_meta_limites to service_role;

create function public.gestor_ia_meta_reservar(p_cliente_id uuid, p_conta_id text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  geral public.gestor_ia_meta_limites%rowtype;
  agora timestamptz;
  disponivel_em timestamptz;
  id uuid;
begin
  if p_cliente_id is null or p_conta_id is null or p_conta_id !~ '^act_[0-9]{1,32}$' then
    raise exception 'Escopo inválido';
  end if;
  select * into strict geral from public.gestor_ia_meta_limites where chave = 'geral' for update;
  agora := clock_timestamp();
  select greatest(geral.liberar_em, geral.reserva_ate, (
    select liberar_em from public.gestor_ia_meta_limites where chave = p_conta_id
  )) into disponivel_em;
  if disponivel_em > agora then
    return jsonb_build_object('lease', null, 'retryAt', disponivel_em);
  end if;
  id := gen_random_uuid();
  update public.gestor_ia_meta_limites
    set reserva = id, cliente_id = p_cliente_id, conta_id = p_conta_id,
      reserva_ate = agora + interval '90 seconds', liberar_em = agora + interval '1 minute'
    where chave = 'geral';
  insert into public.gestor_ia_meta_limites (chave, liberar_em)
    values (p_conta_id, agora + interval '5 minutes')
    on conflict (chave) do update set liberar_em = excluded.liberar_em;
  return jsonb_build_object('lease', id, 'retryAt', agora + interval '5 minutes');
end;
$$;

create function public.gestor_ia_meta_concluir(p_reserva uuid, p_leituras jsonb, p_limitado boolean)
returns timestamptz
language plpgsql
set search_path = ''
as $$
declare
  agora timestamptz;
  cliente uuid;
  conta text;
begin
  if jsonb_typeof(p_leituras) is distinct from 'array' then raise exception 'Leituras inválidas'; end if;
  if jsonb_array_length(p_leituras) > 3 or (p_limitado and jsonb_array_length(p_leituras) > 0) then
    raise exception 'Leituras inválidas';
  end if;
  perform 1 from public.gestor_ia_meta_limites where chave = 'geral' for update;
  agora := clock_timestamp();
  update public.gestor_ia_meta_limites
    set reserva = null, reserva_ate = '-infinity',
      liberar_em = case when p_limitado then greatest(liberar_em, agora + interval '15 minutes') else liberar_em end
    where chave = 'geral' and reserva = p_reserva and reserva_ate > agora
    returning cliente_id, conta_id into cliente, conta;
  if not found then return null; end if;

  insert into public.gestor_ia_meta_cache (cliente_id, conta_id, janela, dados, lido_em)
    select cliente, conta, x.janela, x.dados, agora
    from jsonb_to_recordset(p_leituras) as x(janela text, dados jsonb)
    on conflict (cliente_id, conta_id, janela)
    do update set dados = excluded.dados, lido_em = excluded.lido_em;
  return agora;
end;
$$;

revoke all on function public.gestor_ia_meta_reservar(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.gestor_ia_meta_concluir(uuid, jsonb, boolean) from public, anon, authenticated, service_role;
grant execute on function public.gestor_ia_meta_reservar(uuid, text) to service_role;
grant execute on function public.gestor_ia_meta_concluir(uuid, jsonb, boolean) to service_role;
