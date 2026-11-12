-- Temporary capabilities: never store the bearer link or expose the provider token.
create table public.whatsapp_connection_links (
 id uuid primary key default gen_random_uuid(),
 config_id uuid not null references public.cliente_whatsapp_config(id) on delete cascade,
 cliente_id uuid not null references public.clientes(id) on delete cascade,
 created_by uuid not null references public.profiles(id) on delete cascade,
 token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 revoked_at timestamptz,
 completed_at timestamptz,
 last_checked_at timestamptz,
 last_connect_at timestamptz,
 connect_attempts integer not null default 0 check (connect_attempts between 0 and 12),
 check (expires_at > created_at and expires_at <= created_at + interval '24 hours')
);
alter table public.whatsapp_connection_links enable row level security;
revoke all on public.whatsapp_connection_links from public, anon, authenticated;
grant select, insert, update, delete on public.whatsapp_connection_links to service_role;
create index whatsapp_connection_links_config on public.whatsapp_connection_links(config_id, created_at desc);

create function public.planeje_whatsapp_link_issue(p_config_id uuid, p_token_hash text, p_created_by uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare c public.cliente_whatsapp_config%rowtype; r public.whatsapp_connection_links%rowtype; t timestamptz := clock_timestamp();
begin
 select * into c from public.cliente_whatsapp_config where id=p_config_id and archived_at is null for update;
 if not found or coalesce(c.provider,'uazapi') <> 'uazapi' then raise exception 'Canal indisponível'; end if;
 if not exists(select 1 from public.profiles where id=p_created_by and status='active' and role in ('admin','superadmin')) then raise exception 'Conta não autorizada'; end if;
 update public.whatsapp_connection_links set revoked_at=t where config_id=c.id and revoked_at is null;
 insert into public.whatsapp_connection_links(config_id,cliente_id,created_by,token_hash,created_at,expires_at)
 values(c.id,c.cliente_id,p_created_by,p_token_hash,t,t+interval '24 hours') returning * into r;
 return jsonb_build_object('id',r.id,'expires_at',r.expires_at);
end $$;

create function public.planeje_whatsapp_link_access(p_token_hash text,p_action text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.whatsapp_connection_links%rowtype; c public.cliente_whatsapp_config%rowtype; config_uuid uuid; t timestamptz := clock_timestamp();
begin
 if p_action not in ('info','status','connect','complete') then return jsonb_build_object('error','invalid'); end if;
 select config_id into config_uuid from public.whatsapp_connection_links where token_hash=p_token_hash;
 if not found then return jsonb_build_object('error','invalid'); end if;
 -- Consistent config -> link lock order also serializes issue/rotation/completion.
 select * into c from public.cliente_whatsapp_config where id=config_uuid and archived_at is null for update;
 if not found or coalesce(c.provider,'uazapi') <> 'uazapi' then return jsonb_build_object('error','invalid'); end if;
 select * into r from public.whatsapp_connection_links where token_hash=p_token_hash for update;
 if not found or r.revoked_at is not null or r.expires_at<=t or c.cliente_id<>r.cliente_id
 or not exists(select 1 from public.profiles where id=r.created_by and status='active' and role in ('admin','superadmin'))
 then return jsonb_build_object('error','invalid'); end if;
 if r.completed_at is not null then return jsonb_build_object('state','connected','expires_at',r.expires_at); end if;
 if p_action='status' then
   if r.last_checked_at > t-interval '3 seconds' then return jsonb_build_object('error','rate','retry_after',3); end if;
   update public.whatsapp_connection_links set last_checked_at=t where id=r.id;
 elsif p_action='connect' then
   if r.connect_attempts>=12 or exists(select 1 from public.whatsapp_connection_links where config_id=c.id and last_connect_at>t-interval '60 seconds')
   then return jsonb_build_object('error','rate','retry_after',60); end if;
   update public.whatsapp_connection_links set last_connect_at=t,connect_attempts=connect_attempts+1 where id=r.id;
 elsif p_action='complete' then
   update public.whatsapp_connection_links set completed_at=t where id=r.id;
   update public.cliente_whatsapp_config set instance_status='connected' where id=c.id;
   return jsonb_build_object('state','connected','expires_at',r.expires_at);
 end if;
 return jsonb_build_object('config_id',c.id,'cliente_id',c.cliente_id,'expires_at',r.expires_at);
end $$;
revoke all on function public.planeje_whatsapp_link_issue(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.planeje_whatsapp_link_access(text,text) from public,anon,authenticated;
grant execute on function public.planeje_whatsapp_link_issue(uuid,text,uuid) to service_role;
grant execute on function public.planeje_whatsapp_link_access(text,text) to service_role;
