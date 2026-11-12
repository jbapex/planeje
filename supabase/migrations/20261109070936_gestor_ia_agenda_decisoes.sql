create table public.gestor_ia_agendas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clientes(id) on delete cascade,
  account_id text not null check (account_id ~ '^act_[0-9]{1,32}$'),
  enabled boolean not null default false,
  run_time time not null check (extract(second from run_time) = 0 and run_time < '24:00'),
  weekdays integer[] not null check (cardinality(weekdays) between 1 and 7 and array_position(weekdays, null) is null and weekdays <@ array[1,2,3,4,5,6,7]),
  categories text[] not null check (cardinality(categories) <= 3 and array_position(categories, null) is null and categories <@ array['escala','custo','verba']),
  revision integer not null default 1,
  last_day date,
  last_run_at timestamptz,
  last_fetched_at timestamptz,
  last_state text check (last_state in ('published','unchanged','no_signals','no_data')),
  last_count integer check (last_count between 0 and 3),
  unique (owner_id, client_id, account_id)
);

create function private.gestor_ia_agenda_scope(p_client_id uuid, p_account_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.gestor_ia_pode_registrar_decisao(p_client_id), false)
    and private.planeje_staff_role() in ('admin', 'superadmin') and public.atlas_is_owner()
    and private.gestor_ia_modulo_decisao('assistant')
    and exists (select 1 from public.cliente_meta_accounts a where a.cliente_id = p_client_id and a.is_active
      and 'act_' || regexp_replace(a.meta_account_id::text, '^act_', '') = p_account_id);
$$;
revoke all on function private.gestor_ia_agenda_scope(uuid,text) from public, anon, authenticated;
grant execute on function private.gestor_ia_agenda_scope(uuid,text) to authenticated;

alter table public.gestor_ia_agendas enable row level security;
revoke all on public.gestor_ia_agendas from public, anon, authenticated, service_role;
grant select on public.gestor_ia_agendas to authenticated;
create policy gestor_ia_agenda_propria on public.gestor_ia_agendas for select to authenticated
  using (owner_id = (select auth.uid()) and private.gestor_ia_agenda_scope(client_id, account_id));

create function public.gestor_ia_configurar_agenda(p_client_id uuid, p_account_id text, p_enabled boolean,
  p_run_time time, p_weekdays integer[], p_categories text[], p_revision integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare saved public.gestor_ia_agendas;
begin
  if auth.jwt()->>'planeje_server_delegate' is not null or auth.jwt()->>'session_id' is null
    or private.gestor_ia_agenda_scope(p_client_id, p_account_id) is distinct from true then
    raise insufficient_privilege using message = 'Agenda indisponível para esta conta.';
  end if;
  if p_revision is null then
    insert into public.gestor_ia_agendas (owner_id,client_id,account_id,enabled,run_time,weekdays,categories)
    values (auth.uid(),p_client_id,p_account_id,p_enabled,p_run_time,p_weekdays,p_categories)
    on conflict (owner_id,client_id,account_id) do nothing returning * into saved;
  else
    update public.gestor_ia_agendas set enabled=p_enabled, run_time=p_run_time, weekdays=p_weekdays,
      categories=p_categories, revision=revision+1
    where owner_id=auth.uid() and client_id=p_client_id and account_id=p_account_id and revision=p_revision
    returning * into saved;
  end if;
  if saved.id is null then raise serialization_failure using message = 'A agenda mudou em outra tela. Reabra e confira.'; end if;
  return to_jsonb(saved);
end;
$$;

create function private.gestor_ia_agenda_worker()
returns boolean language sql stable security invoker set search_path = '' as $$
  select auth.jwt()->>'planeje_server_delegate' = 'atlas' and auth.jwt()->>'session_id' is null
    and private.planeje_live_session() and public.atlas_is_owner();
$$;
revoke all on function private.gestor_ia_agenda_worker() from public, anon, authenticated;

create function public.gestor_ia_agenda_pendente()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare agenda public.gestor_ia_agendas;
  local_time timestamp := now() at time zone 'America/Sao_Paulo';
  cached public.gestor_ia_meta_cache;
  account_zone text;
  goals jsonb;
begin
  if private.gestor_ia_agenda_worker() is distinct from true then
    raise insufficient_privilege using message = 'Execução reservada à rotina interna.';
  end if;
  select a.* into agenda from public.gestor_ia_agendas a
  left join public.gestor_ia_meta_cache h on h.cliente_id=a.client_id and h.conta_id=a.account_id and h.janela='historico'
  where a.owner_id=auth.uid() and a.enabled and a.run_time<=local_time::time
    and (a.last_day is null or a.last_day<local_time::date or
      (a.last_day=local_time::date and a.last_state='no_data' and h.lido_em is distinct from a.last_fetched_at))
    and private.gestor_ia_agenda_scope(a.client_id,a.account_id)
  order by a.last_day nulls first, a.run_time, a.id limit 1;
  if agenda.id is null then return null; end if;
  select * into cached from public.gestor_ia_meta_cache
    where cliente_id=agenda.client_id and conta_id=agenda.account_id and janela='historico';
  select z.name into account_zone from public.gestor_ia_meta_cache c
    join pg_catalog.pg_timezone_names z on z.name=c.dados->>'timezone'
    where c.cliente_id=agenda.client_id and c.conta_id=agenda.account_id and c.janela='conta';
  if public.gestor_ia_pode_usar_metas(agenda.client_id) is true then
    select jsonb_agg(jsonb_build_object('name',g.name,'objective',g.objective,'scope',g.scope,'campaign_ids',g.campaign_ids,
      'cost_cents',g.cost_cents,'budget_cents',g.budget_cents) order by g.is_primary desc, g.id) into goals
    from public.gestor_ia_metas_campanha g where g.client_id=agenda.client_id and g.account_id=agenda.account_id and g.is_active;
  end if;
  return jsonb_build_object('id',agenda.id,'revision',agenda.revision,'day',local_time::date,'account_id',agenda.account_id,
    'account_day',(now() at time zone account_zone)::date,'history',cached.dados,'fetched_at',cached.lido_em,
    'categories',case when extract(isodow from local_time)::integer=any(agenda.weekdays) then agenda.categories else array[]::text[] end,
    'goals',coalesce(goals,'[]'::jsonb));
end;
$$;

create function public.gestor_ia_agenda_concluir(p_id uuid, p_revision integer, p_day date,
  p_fetched_at timestamptz, p_state text, p_rows jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare agenda public.gestor_ia_agendas;
  local_time timestamp := now() at time zone 'America/Sao_Paulo';
  current_read timestamptz;
  item jsonb;
  rule text;
  prefix text;
  cutoff text;
  inserted integer;
  count_saved integer := 0;
begin
  if private.gestor_ia_agenda_worker() is distinct from true then
    raise insufficient_privilege using message = 'Execução reservada à rotina interna.';
  end if;
  if p_state is null or p_state not in ('read','no_data') or jsonb_typeof(p_rows) is distinct from 'array' then
    raise invalid_parameter_value using message = 'Resultado da agenda inválido.';
  end if;
  if jsonb_array_length(p_rows)>3 or (p_state='no_data' and p_rows<>'[]'::jsonb) then
    raise invalid_parameter_value using message = 'Resultado da agenda inválido.';
  end if;
  select * into agenda from public.gestor_ia_agendas where id=p_id and owner_id=auth.uid() for update;
  if not found or not agenda.enabled or agenda.revision is distinct from p_revision or p_day is distinct from local_time::date
    or agenda.run_time>local_time::time or private.gestor_ia_agenda_scope(agenda.client_id,agenda.account_id) is distinct from true then
    return false;
  end if;
  perform 1 from public.cliente_meta_accounts a where a.cliente_id=agenda.client_id and a.is_active
    and 'act_' || regexp_replace(a.meta_account_id::text,'^act_','')=agenda.account_id for share;
  if not found then return false; end if;
  select lido_em into current_read from public.gestor_ia_meta_cache
    where cliente_id=agenda.client_id and conta_id=agenda.account_id and janela='historico' for share;
  if current_read is distinct from p_fetched_at or (p_state='read' and current_read is null) then return false; end if;
  if agenda.last_day>=p_day and not (agenda.last_day=p_day and agenda.last_state='no_data' and current_read is distinct from agenda.last_fetched_at) then
    return false;
  end if;

  for item in select value from jsonb_array_elements(p_rows) loop
    rule := split_part(item->>'key',':',1);
    cutoff := item#>>'{payload,period,until}';
    if coalesce(item->>'key','') !~ '^((sem_resultado|escala|custo):[0-9]{1,32}|verba:conta)$'
      or coalesce(cutoff,'') !~ '^\d{4}-\d{2}-\d{2}$'
      or (rule<>'sem_resultado' and not (rule=any(agenda.categories) and extract(isodow from local_time)::integer=any(agenda.weekdays))) then
      raise invalid_parameter_value using message = 'Aviso fora da agenda.';
    end if;
    prefix := 'agenda:'||agenda.account_id||':'||(item->>'key')||':';
    insert into public.gestor_ia_decisoes (owner_id,client_id,source_key,origin,title,payload)
    select agenda.owner_id,agenda.client_id,prefix||cutoff,'signal',item->>'title',
      jsonb_set(item->'payload','{measurement}',coalesce(item#>'{payload,measurement}','{}'::jsonb)||jsonb_build_object('accountId',agenda.account_id))
    where not exists (select 1 from public.gestor_ia_decisoes d where d.owner_id=agenda.owner_id and d.client_id=agenda.client_id
      and d.status<>'dismissed' and d.verdict is null and starts_with(d.source_key,prefix))
    on conflict (owner_id,client_id,source_key) do nothing;
    get diagnostics inserted = row_count;
    count_saved := count_saved+inserted;
  end loop;
  update public.gestor_ia_agendas set last_day=p_day,last_run_at=now(),last_fetched_at=current_read,last_count=count_saved,
    last_state=case when p_state='no_data' then 'no_data' when count_saved>0 then 'published'
      when p_rows<>'[]'::jsonb then 'unchanged' else 'no_signals' end where id=agenda.id;
  return true;
end;
$$;

revoke all on function public.gestor_ia_configurar_agenda(uuid,text,boolean,time,integer[],text[],integer),
  public.gestor_ia_agenda_pendente(), public.gestor_ia_agenda_concluir(uuid,integer,date,timestamptz,text,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.gestor_ia_configurar_agenda(uuid,text,boolean,time,integer[],text[],integer),
  public.gestor_ia_agenda_pendente(), public.gestor_ia_agenda_concluir(uuid,integer,date,timestamptz,text,jsonb) to authenticated;

notify pgrst,'reload schema';
