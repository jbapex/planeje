create table private.gestor_ia_piloto_consumo (
  pilot_id uuid primary key,
  actor_id uuid not null,
  client_id uuid not null,
  reserved_at timestamptz not null default statement_timestamp()
);

alter table private.gestor_ia_piloto_consumo enable row level security;
revoke all on private.gestor_ia_piloto_consumo from public, anon, authenticated, service_role;
grant insert (pilot_id, actor_id, client_id) on private.gestor_ia_piloto_consumo to service_role;

create function public.gestor_ia_reservar_piloto(p_pilot_id uuid, p_actor_id uuid, p_client_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if current_user <> 'service_role' then raise insufficient_privilege; end if;
  insert into private.gestor_ia_piloto_consumo (pilot_id, actor_id, client_id)
    values (p_pilot_id, p_actor_id, p_client_id) on conflict do nothing;
  return found;
end;
$$;

revoke all on function public.gestor_ia_reservar_piloto(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.gestor_ia_reservar_piloto(uuid,uuid,uuid) to service_role;
