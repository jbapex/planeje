-- Compatibilidade da delegação privada do Atlas, sem dispensar sessões de usuários comuns.
-- A finalidade assinada pelo servidor vale apenas para o proprietário ativo e por até 240 s.
create or replace function private.planeje_live_session()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u
    where u.id = auth.uid()
      and (u.banned_until is null or u.banned_until < now())
      and (
        exists (select 1 from auth.sessions s where s.user_id = u.id
          and s.id::text = auth.jwt()->>'session_id'
          and (s.not_after is null or s.not_after > now()))
        or (
          auth.jwt()->>'planeje_server_delegate' = 'atlas'
          and auth.jwt()->>'iss' = 'supabase'
          and u.id = '07d65b46-dd33-4ce6-a98f-8940374c534c'::uuid
          and (auth.jwt()->>'exp')::numeric - (auth.jwt()->>'iat')::numeric between 1 and 240
          and (auth.jwt()->>'iat')::numeric between extract(epoch from now())-240 and extract(epoch from now())+30
          and (auth.jwt()->>'exp')::numeric > extract(epoch from now())
          and exists (select 1 from public.profiles p where p.id=u.id and p.status='active'
            and p.role in ('superadmin','admin','colaborador'))
          and exists (select 1 from public.atlas_settings a where a.id='atlas' and a.owner_id=u.id and a.enabled)
        )
      )
  );
$$;
revoke all on function private.planeje_live_session() from public,anon;
grant execute on function private.planeje_live_session() to authenticated,service_role;
