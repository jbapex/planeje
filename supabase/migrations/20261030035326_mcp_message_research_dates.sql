begin;
set local lock_timeout = '5s';

alter table public.cliente_whatsapp_sent add column sender_kind text
  check (sender_kind in ('human', 'automation'));

create table public.mcp_message_research_state (
  id text primary key check(id='messages-v1'),ready boolean not null default false
);
insert into public.mcp_message_research_state(id) values('messages-v1');
alter table public.mcp_message_research_state enable row level security;
revoke all on public.mcp_message_research_state from public,anon,authenticated;
grant all on public.mcp_message_research_state to service_role;

create table public.mcp_message_research_dates (
  source text not null check (source in ('cliente_whatsapp_inbox','cliente_whatsapp_sent','cliente_whatsapp_webhook_log')),
  row_id uuid not null,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  created_at timestamptz not null,
  event_start timestamptz not null,
  event_end timestamptz not null,
  event_window tstzrange generated always as (tstzrange(event_start,event_end,'[]')) stored,
  primary key (source,row_id),
  check (event_start <= event_end)
);
alter table public.mcp_message_research_dates enable row level security;
revoke all on public.mcp_message_research_dates from public,anon,authenticated;
grant all on public.mcp_message_research_dates to service_role;
create index mcp_message_research_dates_period on public.mcp_message_research_dates
  using gist(event_window);
create index mcp_message_research_dates_order on public.mcp_message_research_dates
  (cliente_id,source,created_at,row_id);

create function private.mcp_message_timestamp(value text) returns timestamptz
language plpgsql immutable security invoker set search_path='' set timezone='UTC' as $$
declare n numeric;
begin
  if value ~ '^-?[0-9]+([.][0-9]+)?$' then
    n:=value::numeric;
    return pg_catalog.to_timestamp((case when n>1000000000000 then n/1000 else n end)::double precision);
  end if;
  if value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ].*(Z|[+-][0-9]{2}(:?[0-9]{2})?)$' then
    return value::timestamptz;
  end if;
  return null;
exception when invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then return null;
end;
$$;

create function private.mcp_message_bounds(payload jsonb, registered_at timestamptz)
returns table(event_start timestamptz,event_end timestamptz)
language sql immutable security invoker set search_path='' as $$
  with recursive walk(value,key) as (
    select payload,null::text
    union all
    select child.value,child.key from walk cross join lateral (
      select e.value,e.key from pg_catalog.jsonb_each(case when jsonb_typeof(walk.value)='object' then walk.value else '{}'::jsonb end) e
      union all
      select e.value,null::text from pg_catalog.jsonb_array_elements(case when jsonb_typeof(walk.value)='array' then walk.value else '[]'::jsonb end) e
    ) child
  ), dates as (
    select registered_at as at
    union all
    select private.mcp_message_timestamp(value #>> '{}') from walk
    where key in ('created_at','msg_timestamp','createdAt','timestamp','messageTimestamp','message_timestamp')
      and jsonb_typeof(value) in ('number','string')
  )
  select min(at),max(at) from dates;
$$;

create function private.mcp_sync_message_dates() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then
    delete from public.mcp_message_research_dates where source=tg_table_name and row_id=old.id;
    return old;
  end if;
  if tg_op='UPDATE' and old.id<>new.id then
    delete from public.mcp_message_research_dates where source=tg_table_name and row_id=old.id;
  end if;
  insert into public.mcp_message_research_dates(source,row_id,cliente_id,created_at,event_start,event_end)
  select tg_table_name,new.id,new.cliente_id,new.created_at,b.event_start,b.event_end
  from private.mcp_message_bounds(to_jsonb(new),new.created_at) b
  on conflict(source,row_id) do update set cliente_id=excluded.cliente_id,created_at=excluded.created_at,
    event_start=excluded.event_start,event_end=excluded.event_end;
  return new;
end;
$$;

create function private.mcp_backfill_message_dates(p_source text,p_after uuid default null,p_size integer default 1000)
returns table(last_id uuid,written bigint)
language plpgsql security invoker set search_path='' as $$
begin
  if p_source not in ('cliente_whatsapp_inbox','cliente_whatsapp_sent','cliente_whatsapp_webhook_log') or p_source is null
    or p_size is null or p_size not between 1 and 1000 then
    raise exception 'Fonte ou lote inválido';
  end if;
  return query execute format($sql$
    with batch as materialized (
      select * from public.%I where ($1 is null or id>$1) order by id limit $2 for share
    ), written as (
      insert into public.mcp_message_research_dates(source,row_id,cliente_id,created_at,event_start,event_end)
      select $3,b.id,b.cliente_id,b.created_at,d.event_start,d.event_end from batch b
      cross join lateral private.mcp_message_bounds(to_jsonb(b),b.created_at) d
      on conflict(source,row_id) do update set cliente_id=excluded.cliente_id,created_at=excluded.created_at,
        event_start=excluded.event_start,event_end=excluded.event_end returning 1
    ) select (select id from batch order by id desc limit 1),count(*) from written
  $sql$,p_source) using p_after,p_size,p_source;
end;
$$;

revoke all on function private.mcp_message_timestamp(text),private.mcp_message_bounds(jsonb,timestamptz),private.mcp_sync_message_dates() from public,anon,authenticated;
grant execute on function private.mcp_message_timestamp(text),private.mcp_message_bounds(jsonb,timestamptz),private.mcp_sync_message_dates() to service_role;
revoke all on function private.mcp_backfill_message_dates(text,uuid,integer) from public,anon,authenticated;
grant execute on function private.mcp_backfill_message_dates(text,uuid,integer) to service_role;
create function private.mcp_finish_message_dates() returns void
language plpgsql security invoker set search_path='' as $$
declare source_name text; missing boolean;
begin
  foreach source_name in array array['cliente_whatsapp_inbox','cliente_whatsapp_sent','cliente_whatsapp_webhook_log'] loop
    execute format($sql$select exists(select 1 from public.%I b left join public.mcp_message_research_dates d
      on d.source=$1 and d.row_id=b.id and d.cliente_id=b.cliente_id and d.created_at=b.created_at where d.row_id is null)$sql$,source_name)
      into missing using source_name;
    if missing then raise exception 'Índice histórico incompleto'; end if;
  end loop;
  update public.mcp_message_research_state set ready=true where id='messages-v1';
end;
$$;
revoke all on function private.mcp_finish_message_dates() from public,anon,authenticated;
grant execute on function private.mcp_finish_message_dates() to service_role;
create trigger mcp_research_dates after insert or update of id,raw_payload,msg_timestamp,cliente_id,created_at or delete
  on public.cliente_whatsapp_inbox for each row execute function private.mcp_sync_message_dates();
create trigger mcp_research_dates after insert or update of id,cliente_id,created_at or delete
  on public.cliente_whatsapp_sent for each row execute function private.mcp_sync_message_dates();
create trigger mcp_research_dates after insert or update of id,raw_payload,cliente_id,created_at or delete
  on public.cliente_whatsapp_webhook_log for each row execute function private.mcp_sync_message_dates();
notify pgrst,'reload schema';
commit;
