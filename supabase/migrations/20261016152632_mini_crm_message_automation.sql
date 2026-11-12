-- Opt-in, per-client message rules. No historical replay or commercial conversion.
begin;
create function public.mini_crm_rules_access(p_cliente_id uuid,p_write boolean default false)
returns boolean language sql stable security invoker set search_path='' as $$
 select public.planeje_current_account_access()
 and exists(select 1 from public.clientes where id=p_cliente_id)
 and exists(select 1 from public.profiles p where p.id=(select auth.uid())
   and (p.role in ('superadmin','admin','colaborador') or (p.role='cliente' and p.cliente_id=p_cliente_id))
   and coalesce((select u.is_enabled from public.user_module_permissions u where u.user_id=p.id and u.module_name='mini_crm'),
                (select m.is_enabled from public.module_settings m where m.module_name='mini_crm'),true))
 and (not p_write or public.cliente_atend_uid_nao_admin() is null);
$$;
revoke all on function public.mini_crm_rules_access(uuid,boolean) from public,anon;
grant execute on function public.mini_crm_rules_access(uuid,boolean) to authenticated,service_role;
create table public.mini_crm_message_rules(
 cliente_id uuid primary key references public.clientes(id) on delete cascade,
 settings jsonb not null default '{"enabled":false}'::jsonb check(jsonb_typeof(settings)='object' and octet_length(settings::text)<=50000),
 updated_at timestamptz not null default clock_timestamp(),updated_by uuid references auth.users(id) on delete set null
);
alter table public.mini_crm_message_rules enable row level security;
create policy mini_rules_read on public.mini_crm_message_rules for select to authenticated using(public.mini_crm_rules_access(cliente_id,false));
create policy mini_rules_insert on public.mini_crm_message_rules for insert to authenticated with check(public.mini_crm_rules_access(cliente_id,true));
create policy mini_rules_update on public.mini_crm_message_rules for update to authenticated using(public.mini_crm_rules_access(cliente_id,true)) with check(public.mini_crm_rules_access(cliente_id,true));
revoke all on public.mini_crm_message_rules from public,anon,authenticated;
grant select,insert,update on public.mini_crm_message_rules to authenticated;
grant all on public.mini_crm_message_rules to service_role;
create function public.mini_crm_rules_touch() returns trigger language plpgsql security invoker set search_path='' as $$
begin new.updated_at=clock_timestamp();new.updated_by=auth.uid();return new;end $$;
revoke all on function public.mini_crm_rules_touch() from public,anon,authenticated;
create trigger mini_rules_touch before insert or update on public.mini_crm_message_rules for each row execute function public.mini_crm_rules_touch();
create table public.mini_crm_message_history(
 id uuid primary key default gen_random_uuid(),cliente_id uuid not null references public.clientes(id) on delete cascade,
 contact_id uuid not null references public.cliente_whatsapp_contact(id) on delete cascade,
 channel_id text not null,message_id text not null,message_at timestamptz not null,
 previous_status text,status text not null,reason text not null,appointment_day date,appointment_time text,
 created_at timestamptz not null default clock_timestamp(),unique(contact_id,channel_id,message_id)
);
create index mini_message_history_client_created on public.mini_crm_message_history(cliente_id,created_at desc);
alter table public.mini_crm_message_history enable row level security;
create policy mini_history_read on public.mini_crm_message_history for select to authenticated using(
 public.mini_crm_rules_access(cliente_id,false) and exists(select 1 from public.cliente_whatsapp_contact c where c.id=contact_id and c.cliente_id=mini_crm_message_history.cliente_id));
revoke all on public.mini_crm_message_history from public,anon,authenticated;
grant select on public.mini_crm_message_history to authenticated;
grant all on public.mini_crm_message_history to service_role;

-- All existing manual editors pause the automation; UI cannot forge its internal state.
create function public.mini_crm_manual_status_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare prior jsonb:=coalesce(old.mini_crm,'{}');meta jsonb:=coalesce(prior->'_planeje_message_status','{}');entry text;
begin
 if current_user in ('service_role','postgres','supabase_admin') and current_setting('planeje.mini_message_auto',true)='on' then return new;end if;
 if auth.uid() is null then return new;end if;
 if jsonb_typeof(new.mini_crm) is distinct from 'object' then return new;end if;
 new.mini_crm=new.mini_crm-'_planeje_message_status';
 if current_setting('planeje.mini_message_resume',true)='on' then
   meta=meta||jsonb_build_object('manual',false,'lastStatus',new.mini_crm->>'status','lastMessageAt',clock_timestamp());
 elsif (prior->>'status') is distinct from (new.mini_crm->>'status') then
   select coalesce(settings->>'entryStatus','Novo Lead') into entry from public.mini_crm_message_rules where cliente_id=new.cliente_id;
   if coalesce(prior->>'status','')<>'' or coalesce(new.mini_crm->>'status','')<>coalesce(entry,'Novo Lead') then
     meta=meta||jsonb_build_object('manual',true,'lastStatus',new.mini_crm->>'status','manualAt',clock_timestamp());
   end if;
 end if;
 if meta<>'{}' then new.mini_crm=new.mini_crm||jsonb_build_object('_planeje_message_status',meta);end if;
 return new;
end $$;
revoke all on function public.mini_crm_manual_status_guard() from public,anon,authenticated;
create trigger mini_crm_manual_status_guard before update of mini_crm on public.cliente_whatsapp_contact for each row execute function public.mini_crm_manual_status_guard();

-- Merge only fields edited by the person, under the contact's existing RLS.
create function public.mini_crm_patch_contact(p_cliente_id uuid,p_contact_id uuid,p_patch jsonb,p_commercial jsonb default '{}',p_resume boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.cliente_whatsapp_contact%rowtype;m jsonb;k text;v jsonb;
begin
 if not public.mini_crm_rules_access(p_cliente_id,false) then raise exception 'Acesso não autorizado' using errcode='42501';end if;
 if jsonb_typeof(p_patch)<>'object' or octet_length(p_patch::text)>100000 or jsonb_typeof(p_commercial)<>'object' then raise exception 'Campos inválidos';end if;
 select * into c from public.cliente_whatsapp_contact where id=p_contact_id and cliente_id=p_cliente_id for update;
 if not found then raise exception 'Contato indisponível' using errcode='42501';end if;
 m=coalesce(c.mini_crm,'{}');
 for k,v in select * from jsonb_each(p_patch) loop
   if k='_planeje_message_status' then continue;end if;
   if v='null'::jsonb then m=m-k;else m=jsonb_set(m,array[k],v,true);end if;
 end loop;
 if p_resume then perform set_config('planeje.mini_message_resume','on',true);end if;
 update public.cliente_whatsapp_contact set mini_crm=m,updated_at=clock_timestamp(),
 qualificado=case when p_commercial ? 'qualificado' then (p_commercial->>'qualificado')::boolean else qualificado end,
 comprou=case when p_commercial ? 'comprou' then (p_commercial->>'comprou')::boolean else comprou end,
 valor_venda=case when p_commercial ? 'valor' then (p_commercial->>'valor')::numeric else valor_venda end
 where id=c.id returning * into c;
 perform set_config('planeje.mini_message_resume','off',true);
 return to_jsonb(c);
end $$;
revoke all on function public.mini_crm_patch_contact(uuid,uuid,jsonb,jsonb,boolean) from public,anon;
grant execute on function public.mini_crm_patch_contact(uuid,uuid,jsonb,jsonb,boolean) to authenticated;

-- Called only by the authenticated webhook service after its pure rule evaluation.
-- Compare versions and lock rows to avoid overwriting simultaneous manual edits/configuration.
create function public.mini_crm_apply_message(p_cliente_id uuid,p_contact_id uuid,p_rules_at timestamptz,p_config_at timestamptz,p_expected jsonb,p_patch jsonb,p_channel text,p_message text,p_at timestamptz,p_reason text,p_day date default null,p_time text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.mini_crm_message_rules%rowtype;c public.cliente_whatsapp_contact%rowtype;cfg public.mini_crm_config%rowtype;m jsonb;k text;v jsonb;
begin
 select * into r from public.mini_crm_message_rules where cliente_id=p_cliente_id for share;
 if not found or r.settings->>'enabled' is distinct from 'true' or r.updated_at<>p_rules_at then return '{"applied":false,"reason":"rules_changed"}';end if;
 select * into cfg from public.mini_crm_config where cliente_id=p_cliente_id for share;
 if cfg.updated_at is distinct from p_config_at then return '{"applied":false,"reason":"config_changed"}';end if;
 select * into c from public.cliente_whatsapp_contact where id=p_contact_id and cliente_id=p_cliente_id for update;
 if not found then return '{"applied":false,"reason":"contact_missing"}';end if;
 m=coalesce(c.mini_crm,'{}');
 if m<>p_expected then return '{"applied":false,"reason":"contact_changed"}';end if;
 if m#>>'{_planeje_message_status,manual}'='true' or p_at<r.updated_at or p_at>clock_timestamp()+interval '5 minutes' then return '{"applied":false,"reason":"manual_or_old"}';end if;
 if exists(select 1 from public.mini_crm_message_history where contact_id=c.id and channel_id=p_channel and message_id=p_message) then return '{"applied":false,"reason":"duplicate"}';end if;
 if exists(select 1 from jsonb_object_keys(p_patch) t(key) where key<>'status' and key<>'_planeje_message_status' and key<>coalesce(r.settings->>'appointmentField','') and key<>(coalesce(r.settings->>'appointmentField','')||'_hora')) then raise exception 'Campo de automação inválido';end if;
 if p_patch->>'status' in ('Venda Realizada','Lead Qualificado','Follow Up','Repescagem') then raise exception 'Esta etapa exige ação manual';end if;
 for k,v in select * from jsonb_each(p_patch) loop
   if v='null'::jsonb then m=m-k;else m=jsonb_set(m,array[k],v,true);end if;
 end loop;
 perform set_config('planeje.mini_message_auto','on',true);
 update public.cliente_whatsapp_contact set mini_crm=m,updated_at=clock_timestamp() where id=c.id;
 perform set_config('planeje.mini_message_auto','off',true);
 insert into public.mini_crm_message_history(cliente_id,contact_id,channel_id,message_id,message_at,previous_status,status,reason,appointment_day,appointment_time)
 values(p_cliente_id,c.id,p_channel,p_message,p_at,c.mini_crm->>'status',p_patch->>'status',p_reason,p_day,p_time);
 return '{"applied":true}';
end $$;
revoke all on function public.mini_crm_apply_message(uuid,uuid,timestamptz,timestamptz,jsonb,jsonb,text,text,timestamptz,text,date,text) from public,anon,authenticated;
grant execute on function public.mini_crm_apply_message(uuid,uuid,timestamptz,timestamptz,jsonb,jsonb,text,text,timestamptz,text,date,text) to service_role;
notify pgrst,'reload schema';
commit;
