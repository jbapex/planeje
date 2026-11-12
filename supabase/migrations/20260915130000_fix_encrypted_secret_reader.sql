create or replace function public.get_encrypted_secret(p_secret_name text)
returns text
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_secret_value text;
  v_role text := coalesce(auth.role(), '');
begin
  if v_role <> 'service_role' and not exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'superadmin'
  ) then
    raise exception 'Apenas superadmins podem consultar secrets'
      using errcode = '42501';
  end if;

  begin
    select decrypted_secret
      into v_secret_value
    from vault.decrypted_secrets
    where name = p_secret_name
    limit 1;
  exception
    when others then
      v_secret_value := null;
  end;

  if nullif(trim(v_secret_value), '') is not null then
    return v_secret_value;
  end if;

  select secret_value
    into v_secret_value
  from public.app_secrets
  where name = p_secret_name
  limit 1;

  return nullif(trim(v_secret_value), '');
end;
$$;

revoke all on function public.get_encrypted_secret(text) from public;
grant execute on function public.get_encrypted_secret(text) to authenticated, service_role;

comment on function public.get_encrypted_secret(text) is
  'Returns a configured secret only to service_role or a superadmin. Reads Vault first and app_secrets as the compatibility store used by Settings.';
