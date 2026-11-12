begin;
create table public.mini_crm_message_sources (
 cliente_id uuid not null references public.clientes(id) on delete cascade,
 id text not null check (length(id) between 1 and 100),
 name text not null check (length(name) between 1 and 160),
 phone text check (phone ~ '^[0-9]{8,15}$'),
 primary key (cliente_id,id)
);
alter table public.mini_crm_message_sources enable row level security;
create policy mini_message_sources_read on public.mini_crm_message_sources for select to authenticated
 using(public.mini_crm_rules_access(cliente_id,false));
revoke all on public.mini_crm_message_sources from public,anon,authenticated;
grant select on public.mini_crm_message_sources to authenticated;
grant all on public.mini_crm_message_sources to service_role;

-- Only source metadata is copied. Messages, contacts and automation settings are not replayed.
insert into public.mini_crm_message_sources(cliente_id,id,name,phone)
with metadata as (
 select l.cliente_id,c->'value'->'metadata' m
 from public.cliente_whatsapp_webhook_log l
 cross join lateral jsonb_array_elements(case when jsonb_typeof(l.raw_payload->'entry')='array' then l.raw_payload->'entry' else '[]' end) e
 cross join lateral jsonb_array_elements(case when jsonb_typeof(e->'changes')='array' then e->'changes' else '[]' end) c
 where l.source='ingress' and l.raw_payload->>'object'='whatsapp_business_account'
  and c->>'field' in ('messages','smb_message_echoes')
), normalized as (
 select cliente_id,case when m->>'phone_number_id' ~ '^[a-zA-Z0-9_.-]{1,60}$' then m->>'phone_number_id' end source_key,
  case when regexp_replace(m->>'display_phone_number','[^0-9]','','g') ~ '^[0-9]{8,15}$' then regexp_replace(m->>'display_phone_number','[^0-9]','','g') end phone
 from metadata
)
select distinct cliente_id,'ingress:meta_cloud:' || coalesce(source_key,phone),
 'WhatsApp via webhook · ' || coalesce('+' || phone,source_key),phone
from normalized where coalesce(source_key,phone) is not null
on conflict (cliente_id,id) do nothing;
insert into public.mini_crm_message_sources(cliente_id,id,name)
select distinct cliente_id,'ingress:chatvolt:' || lower(raw_payload->>'channel'),
 case when lower(raw_payload->>'channel')='zapperapi' then 'WhatsApp via Chatvolt (Zapperapi)' else 'WhatsApp via Chatvolt' end
from public.cliente_whatsapp_webhook_log where source='chatvolt' and lower(raw_payload->>'channel') in ('whatsapp','zapperapi')
on conflict (cliente_id,id) do nothing;
notify pgrst,'reload schema';
commit;
