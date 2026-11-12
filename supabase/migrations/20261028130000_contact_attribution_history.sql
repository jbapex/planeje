-- Ingress first touch and attribution evidence commit together. No historical replay.
begin;
create schema if not exists planeje_private;
create table public.contact_attribution_history (
 id uuid primary key default gen_random_uuid(),
 cliente_id uuid not null,
 from_jid text not null,
 event_key text not null check(length(event_key) between 1 and 4096),
 source text not null check(length(source) between 1 and 120),
 message_id text,
 origin_source text not null check(origin_source in ('google_ads','meta_ads','site')),
 clicked_at timestamptz,
 message_at timestamptz,
 received_at timestamptz not null,
 recorded_at timestamptz not null default clock_timestamp(),
 event_at timestamptz generated always as (coalesce(clicked_at,message_at,received_at)) stored,
 attribution jsonb not null check(jsonb_typeof(attribution)='object' and octet_length(attribution::text)<=30000),
 foreign key(cliente_id,from_jid) references public.cliente_whatsapp_contact(cliente_id,from_jid) on delete cascade,
 unique(cliente_id,from_jid,event_key)
);
create index contact_attribution_history_page on public.contact_attribution_history(cliente_id,from_jid,event_at desc,id desc);
alter table public.contact_attribution_history enable row level security;
create policy contact_attribution_history_read on public.contact_attribution_history for select to authenticated using (
 exists(select 1 from public.cliente_whatsapp_contact c where c.cliente_id=contact_attribution_history.cliente_id and c.from_jid=contact_attribution_history.from_jid)
);
revoke all on public.contact_attribution_history from public,anon,authenticated,service_role;
grant select on public.contact_attribution_history to authenticated;
grant select,insert on public.contact_attribution_history to service_role;

-- Same factual signals as hasStoredContactAttribution; operational metadata is not an origin.
create function planeje_private.contact_has_attribution(c jsonb) returns boolean
language sql immutable security invoker set search_path='' as $$
 select coalesce(c->>'origin_source' in ('google_ads','meta_ads','site'),false)
 or exists(select 1 from unnest(array['utm_source','utm_medium','utm_campaign','utm_content','utm_term']) k
   where btrim(coalesce(c->>k,''))<>'' or btrim(coalesce(c->'tracking_data'->>k,''))<>'')
 or exists(select 1 from unnest(array['ctwaClid','ctwa_clid','gclid','fbclid','source_id','ad_id','sourceApp','conversionSource','planeje_link_id','planeje_match_code']) k
   where coalesce(c->'tracking_data'->>k,'') not in ('','false','0'))
 or coalesce(c->'tracking_data'->'meta_ad_details'->'ad'->>'id','') not in ('','false','0');
$$;
revoke all on function planeje_private.contact_has_attribution(jsonb) from public,anon,authenticated;
grant usage on schema planeje_private to service_role;
grant execute on function planeje_private.contact_has_attribution(jsonb) to service_role;

create function public.persist_ingress_contact_attribution(p_cliente_id uuid,p_from_jid text,p_contact jsonb,p_evidences jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare incoming public.cliente_whatsapp_contact%rowtype; saved public.cliente_whatsapp_contact%rowtype; ev jsonb;
begin
 if p_cliente_id is null or length(coalesce(p_from_jid,'')) not between 1 and 200
   or jsonb_typeof(p_contact) is distinct from 'object' or jsonb_typeof(p_evidences) is distinct from 'array'
   or jsonb_array_length(p_evidences)>200
   or (p_contact ? 'cliente_id' and p_contact->>'cliente_id' is distinct from p_cliente_id::text)
   or (p_contact ? 'from_jid' and p_contact->>'from_jid' is distinct from p_from_jid)
 then raise exception 'Invalid ingress contact' using errcode='22023';end if;
 incoming=jsonb_populate_record(null::public.cliente_whatsapp_contact,p_contact);
 if incoming.tracking_data is not null and jsonb_typeof(incoming.tracking_data)<>'object' then
   raise exception 'Invalid attribution metadata' using errcode='22023';end if;

 -- ON CONFLICT locks the current row, including when another transaction is creating it.
 insert into public.cliente_whatsapp_contact as prior
 (cliente_id,from_jid,phone,sender_name,origin_source,utm_source,utm_medium,utm_campaign,utm_content,utm_term,tracking_data,
  profile_pic_url,instance_name,whatsapp_config_id,first_seen_at,last_message_at,updated_at)
 values(p_cliente_id,p_from_jid,incoming.phone,nullif(btrim(incoming.sender_name),''),coalesce(incoming.origin_source,'nao_identificado'),
  incoming.utm_source,incoming.utm_medium,incoming.utm_campaign,incoming.utm_content,incoming.utm_term,incoming.tracking_data,
  incoming.profile_pic_url,incoming.instance_name,incoming.whatsapp_config_id,
  coalesce(incoming.first_seen_at,clock_timestamp()),coalesce(incoming.last_message_at,clock_timestamp()),clock_timestamp())
 on conflict(cliente_id,from_jid) do update set
  phone=coalesce(nullif(excluded.phone,''),prior.phone),
  sender_name=case when p_contact->>'sender_name_is_fallback'='true' then coalesce(nullif(prior.sender_name,''),excluded.sender_name)
    else coalesce(excluded.sender_name,prior.sender_name) end,
  profile_pic_url=coalesce(nullif(excluded.profile_pic_url,''),prior.profile_pic_url),
  instance_name=coalesce(nullif(excluded.instance_name,''),prior.instance_name),
  whatsapp_config_id=coalesce(excluded.whatsapp_config_id,prior.whatsapp_config_id),
  first_seen_at=least(prior.first_seen_at,excluded.first_seen_at),last_message_at=greatest(prior.last_message_at,excluded.last_message_at),
  updated_at=clock_timestamp(),
  origin_source=case when planeje_private.contact_has_attribution(to_jsonb(prior)) then prior.origin_source else excluded.origin_source end,
  utm_source=case when planeje_private.contact_has_attribution(to_jsonb(prior)) then prior.utm_source else excluded.utm_source end,
  utm_medium=case when planeje_private.contact_has_attribution(to_jsonb(prior)) then prior.utm_medium else excluded.utm_medium end,
  utm_campaign=case when planeje_private.contact_has_attribution(to_jsonb(prior)) then prior.utm_campaign else excluded.utm_campaign end,
  utm_content=case when planeje_private.contact_has_attribution(to_jsonb(prior)) then prior.utm_content else excluded.utm_content end,
  utm_term=case when planeje_private.contact_has_attribution(to_jsonb(prior)) then prior.utm_term else excluded.utm_term end,
  tracking_data=case when planeje_private.contact_has_attribution(to_jsonb(prior)) then prior.tracking_data
    else nullif(coalesce(prior.tracking_data,'{}')||coalesce(excluded.tracking_data,'{}'),'{}'::jsonb) end
 returning * into saved;

 for ev in select value from jsonb_array_elements(p_evidences) loop
   if jsonb_typeof(ev) is distinct from 'object' or jsonb_typeof(ev->'attribution') is distinct from 'object'
     or exists(select 1 from jsonb_each(ev->'attribution') a where a.key<>all(array[
       'utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','fbclid','ctwa_clid','source_id','ad_id','source_url',
       'planeje_click_id','planeje_link_id','planeje_match_code','method','campaign_name','adset_name','ad_name'])
       or jsonb_typeof(a.value)<>'string')
   then raise exception 'Invalid attribution snapshot' using errcode='22023';end if;
   insert into public.contact_attribution_history(cliente_id,from_jid,event_key,source,message_id,origin_source,clicked_at,message_at,received_at,attribution)
   values(p_cliente_id,p_from_jid,ev->>'event_key',ev->>'source',ev->>'message_id',ev->>'origin_source',
     (ev->>'clicked_at')::timestamptz,(ev->>'message_at')::timestamptz,(ev->>'received_at')::timestamptz,ev->'attribution')
   on conflict(cliente_id,from_jid,event_key) do nothing;
 end loop;
 return to_jsonb(saved);
end $$;
revoke all on function public.persist_ingress_contact_attribution(uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.persist_ingress_contact_attribution(uuid,text,jsonb,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
