begin;

-- Normalized lookup keys keep MCP evidence reads off the raw webhook JSON scan.
create table public.cliente_whatsapp_webhook_message_ids (
  webhook_log_id uuid primary key references public.cliente_whatsapp_webhook_log(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  created_at timestamptz not null,
  message_ids text[] not null check (cardinality(message_ids) > 0)
);

alter table public.cliente_whatsapp_webhook_message_ids enable row level security;
revoke all on public.cliente_whatsapp_webhook_message_ids from public, anon, authenticated;
grant all on public.cliente_whatsapp_webhook_message_ids to service_role;
create index cliente_whatsapp_webhook_message_ids_client_created_idx
  on public.cliente_whatsapp_webhook_message_ids (cliente_id, created_at, webhook_log_id);
create index cliente_whatsapp_webhook_message_ids_values_idx
  on public.cliente_whatsapp_webhook_message_ids using gin (message_ids);

create or replace function private.mcp_webhook_message_ids(payload jsonb)
returns text[]
language sql
immutable
parallel safe
security invoker
set search_path = ''
as $$
  with recursive walk(value, key) as (
    select coalesce(payload, '{}'::jsonb), null::text
    union all
    select child.value, child.key
    from walk
    cross join lateral (
      select entry.value, entry.key
      from pg_catalog.jsonb_each(walk.value) as entry
      where pg_catalog.jsonb_typeof(walk.value) = 'object'
      union all
      select entry.value, null::text
      from pg_catalog.jsonb_array_elements(walk.value) as entry
      where pg_catalog.jsonb_typeof(walk.value) = 'array'
    ) as child(value, key)
  )
  select coalesce(
    array_agg(distinct value #>> '{}') filter (
      where key in ('messageId', 'messageid', 'message_id', 'id')
        and pg_catalog.jsonb_typeof(value) = 'string'
        and char_length(value #>> '{}') between 1 and 512
    ),
    array[]::text[]
  )
  from walk;
$$;
revoke all on function private.mcp_webhook_message_ids(jsonb) from public, anon, authenticated;
grant execute on function private.mcp_webhook_message_ids(jsonb) to service_role;

create or replace function private.mcp_sync_webhook_message_ids()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids text[];
begin
  ids := private.mcp_webhook_message_ids(new.raw_payload);
  if cardinality(ids) = 0 then
    delete from public.cliente_whatsapp_webhook_message_ids where webhook_log_id = new.id;
  else
    insert into public.cliente_whatsapp_webhook_message_ids(webhook_log_id, cliente_id, created_at, message_ids)
    values (new.id, new.cliente_id, new.created_at, ids)
    on conflict (webhook_log_id) do update set
      cliente_id = excluded.cliente_id,
      created_at = excluded.created_at,
      message_ids = excluded.message_ids;
  end if;
  return new;
end;
$$;
revoke all on function private.mcp_sync_webhook_message_ids() from public, anon, authenticated;
grant execute on function private.mcp_sync_webhook_message_ids() to service_role;

create trigger mcp_sync_webhook_message_ids
after insert or update of raw_payload, cliente_id, created_at on public.cliente_whatsapp_webhook_log
for each row execute function private.mcp_sync_webhook_message_ids();

notify pgrst, 'reload schema';
commit;
