grant select (pilot_id) on private.gestor_ia_piloto_consumo to service_role;

create function public.gestor_ia_piloto_disponivel(p_pilot_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select p_pilot_id is not null and not exists (
    select 1 from private.gestor_ia_piloto_consumo where pilot_id = p_pilot_id
  );
$$;

revoke all on function public.gestor_ia_piloto_disponivel(uuid) from public, anon, authenticated;
grant execute on function public.gestor_ia_piloto_disponivel(uuid) to service_role;
