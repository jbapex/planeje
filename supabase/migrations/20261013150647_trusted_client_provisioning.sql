-- Preserva o provisionamento de clientes já autorizado, usando metadado exclusivo do servidor.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,full_name,role,status)
  values(new.id, new.raw_user_meta_data->>'full_name',
    case when new.raw_app_meta_data->>'planeje_provisioning_role' = 'cliente'
      then 'cliente' else 'colaborador' end,
    'pending');
  return new;
end;
$$;
