-- Convites individuais e acesso apenas de contas autorizadas. Aplicar uma vez.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create or replace function private.planeje_live_session()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u join auth.sessions s on s.user_id = u.id
    where u.id = auth.uid()
      and s.id::text = auth.jwt()->>'session_id'
      and (u.banned_until is null or u.banned_until < now())
      and (s.not_after is null or s.not_after > now())
  );
$$;
create or replace function private.planeje_approved_access()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.planeje_live_session() and exists (
    select 1 from public.profiles p where p.id = auth.uid()
      and ((p.role in ('superadmin','admin','colaborador') and p.status = 'active')
        or (p.role = 'cliente' and p.cliente_id is not null and p.status in ('active','pending')))
  );
$$;
create or replace function private.planeje_invite_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.planeje_live_session() and exists (
    select 1 from public.profiles p where p.id = auth.uid()
      and p.id = '07d65b46-dd33-4ce6-a98f-8940374c534c'::uuid
      and p.role = 'superadmin' and p.status = 'active'
  );
$$;
revoke all on function private.planeje_live_session(), private.planeje_approved_access(), private.planeje_invite_owner() from public, anon;
grant execute on function private.planeje_live_session(), private.planeje_approved_access(), private.planeje_invite_owner() to authenticated, service_role;
create or replace function private.planeje_staff_role()
returns text language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id=auth.uid() and p.status='active'
    and private.planeje_live_session();
$$;
revoke all on function private.planeje_staff_role() from public,anon;
grant execute on function private.planeje_staff_role() to authenticated,service_role;
-- Subconsultas sobre profiles nas próprias políticas de UPDATE causavam recursão.
drop policy "Superadmins can update any profile" on public.profiles;
drop policy "superadmin e admin podem atualizar whatsapp da equipe" on public.profiles;
create policy planeje_owner_update_profiles on public.profiles for update to authenticated
  using ((select private.planeje_invite_owner())) with check ((select private.planeje_invite_owner()));
create policy planeje_admin_update_profiles on public.profiles for update to authenticated
  using ((select private.planeje_staff_role()) = 'admin') with check ((select private.planeje_staff_role()) = 'admin');

create or replace function public.planeje_require_approved_request()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_role text := coalesce(auth.jwt()->>'role', 'anon');
  v_path text := coalesce(current_setting('request.path',true),'');
begin
  if v_role = 'service_role' then return; end if;
  if v_role = 'authenticated' then
    if private.planeje_approved_access() then return; end if;
    if v_path = '/profiles' and private.planeje_live_session() then return; end if;
    raise insufficient_privilege using message = 'Acesso somente para usuários convidados e autorizados.';
  end if;
  if v_path = any(array[
    '/module_settings','/public_config','/diagnostic_templates','/diagnostic_template_questions','/diagnostic_submissions',
    '/rpc/get_cliente_briefing_publico','/rpc/submit_cliente_briefing_publico','/rpc/verify_mcp_user_token'
  ]) then return; end if;
  raise insufficient_privilege using message = 'Faça login para acessar esta área.';
end;
$$;
revoke all on function public.planeje_require_approved_request() from public;
grant execute on function public.planeje_require_approved_request() to anon, authenticated, service_role;
create or replace function public.planeje_current_account_access()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.planeje_approved_access();
$$;
revoke all on function public.planeje_current_account_access() from public,anon;
grant execute on function public.planeje_current_account_access() to authenticated,service_role;
alter role authenticator set pgrst.db_pre_request = 'public.planeje_require_approved_request';

-- Políticas restritivas se somam às permissões existentes, sem ampliar carteira.
do $$ declare t record; begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and c.relrowsecurity loop
    if t.relname <> 'profiles' then
      execute format('create policy planeje_approved_account on public.%I as restrictive for all to authenticated using ((select private.planeje_approved_access())) with check ((select private.planeje_approved_access()))', t.relname);
    end if;
    if t.relname <> all(array['module_settings','public_config','diagnostic_templates','diagnostic_template_questions','diagnostic_submissions','cliente_briefings']) then
      execute format('create policy planeje_no_anonymous_account_data on public.%I as restrictive for all to anon using (false) with check (false)', t.relname);
    end if;
  end loop;
end $$;
create policy planeje_profile_read on public.profiles as restrictive for select to authenticated
  using ((select private.planeje_approved_access()) or (id = auth.uid() and (select private.planeje_live_session())));
create policy planeje_profile_insert on public.profiles as restrictive for insert to authenticated
  with check ((select private.planeje_invite_owner()));
create policy planeje_profile_update on public.profiles as restrictive for update to authenticated
  using ((select private.planeje_approved_access())) with check ((select private.planeje_approved_access()));
create policy planeje_profile_delete on public.profiles as restrictive for delete to authenticated
  using ((select private.planeje_invite_owner()));
create policy planeje_storage_approved_account on storage.objects as restrictive for all to authenticated
  using ((select private.planeje_approved_access())) with check ((select private.planeje_approved_access()));

-- O papel e a aprovação nunca vêm de dados editáveis pelo usuário.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,full_name,role,status)
  values(new.id, new.raw_user_meta_data->>'full_name', 'colaborador', 'pending');
  return new;
end;
$$;
create or replace function private.planeje_guard_profile_privileges()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.jwt()->>'role','') = 'authenticated' and (
    new.id is distinct from old.id or new.role is distinct from old.role
    or new.status is distinct from old.status or new.cliente_id is distinct from old.cliente_id
    or new.allowed_pages is distinct from old.allowed_pages
  ) and not private.planeje_invite_owner() then
    raise insufficient_privilege using message = 'Somente Josias pode alterar permissões e aprovação de usuários.';
  end if;
  return new;
end;
$$;
revoke all on function private.planeje_guard_profile_privileges() from public, anon, authenticated;
create trigger planeje_guard_profile_privileges before update on public.profiles
  for each row execute function private.planeje_guard_profile_privileges();

alter table public.invites
  add column recipient_email text,
  add column expires_at timestamptz not null default (now() + interval '7 days'),
  add column consumed_at timestamptz,
  add column used_by uuid references auth.users(id) on delete set null;
-- Links genéricos antigos não autorizam novas contas.
update public.invites set expires_at = now() where recipient_email is null;
alter table public.invites add constraint planeje_invite_role check (role in ('admin','colaborador')) not valid;
create unique index planeje_invite_token_unique on public.invites(token);
create policy planeje_invite_owner_only on public.invites as restrictive for all to authenticated
  using ((select private.planeje_invite_owner()) and created_by = auth.uid())
  with check ((select private.planeje_invite_owner()) and created_by = auth.uid()
    and role in ('admin','colaborador') and recipient_email is not null
    and recipient_email = lower(trim(recipient_email)));

create or replace function public.planeje_claim_team_invite(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.invites; begin
  update public.invites i set consumed_at = now()
  where i.token = p_token and i.recipient_email is not null and i.expires_at > now()
    and i.consumed_at is null and i.role in ('admin','colaborador')
    and exists (select 1 from public.profiles p where p.id=i.created_by
      and p.id='07d65b46-dd33-4ce6-a98f-8940374c534c'::uuid and p.role='superadmin' and p.status='active')
  returning i.* into v;
  if v.id is null then raise exception 'Convite inválido, expirado ou já utilizado.'; end if;
  return jsonb_build_object('id',v.id,'recipient_email',v.recipient_email,'role',v.role);
end;
$$;
create or replace function public.planeje_complete_team_invite(p_invite_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.invites; begin
  select * into v from public.invites where id=p_invite_id for update;
  if v.id is null or v.consumed_at is null or v.used_by is not null or v.expires_at <= now()
    or not exists(select 1 from auth.users where id=p_user_id and lower(email)=v.recipient_email)
    or not exists(select 1 from public.profiles where id=v.created_by and id='07d65b46-dd33-4ce6-a98f-8940374c534c'::uuid and role='superadmin' and status='active') then
    raise exception 'Não foi possível concluir este convite.';
  end if;
  update public.profiles set role=v.role,status='active' where id=p_user_id;
  if not found then raise exception 'Perfil não encontrado.'; end if;
  update public.invites set used_by=p_user_id where id=v.id;
end;
$$;
revoke all on function public.planeje_claim_team_invite(text), public.planeje_complete_team_invite(uuid,uuid) from public,anon,authenticated;
grant execute on function public.planeje_claim_team_invite(text), public.planeje_complete_team_invite(uuid,uuid) to service_role;

-- Esta função de limpeza privilegiada não é uma API de usuários comuns.
revoke all on function public.admin_cleanup_team_user(uuid), public.admin_nullify_profile_references(uuid) from public,anon,authenticated;
grant execute on function public.admin_cleanup_team_user(uuid), public.admin_nullify_profile_references(uuid) to service_role;
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
