create function public.gestor_ia_fontes_memoria(p_client_id uuid, p_versions uuid[])
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare sources jsonb;
begin
  if private.gestor_ia_agenda_humana() is distinct from true
    or private.gestor_ia_pode_registrar_decisao(p_client_id) is distinct from true then
    raise insufficient_privilege using message = 'Origem da Memória indisponível para este cliente.';
  end if;
  if p_versions is null or cardinality(p_versions) > 50 or array_position(p_versions, null) is not null then
    raise invalid_parameter_value using message = 'Seleção de versões inválida.';
  end if;

  with recursive versions(picked, id, replaces_id, version) as (
    select m.id, m.id, m.replaces_id, m.version
    from public.atlas_memories m
    where m.id = any(p_versions) and m.owner_id = auth.uid() and m.client_id = p_client_id
    union all
    select child.picked, parent.id, parent.replaces_id, parent.version
    from versions child join public.atlas_memories parent on parent.id = child.replaces_id
    where parent.owner_id = auth.uid() and parent.client_id = p_client_id
      and parent.version::bigint + 1 = child.version::bigint
  )
  select coalesce(jsonb_object_agg(v.picked, jsonb_build_object(
    'decisionId', d.id, 'title', d.title, 'verdictAt', l.verdict_at,
    'verdict', case when state.current then d.verdict end, 'current', state.current,
    'accountId', l.account_id, 'campaignId', l.campaign_id, 'objective', l.objective,
    'adId', case when d.payload#>>'{measurement,adId}' ~ '^[0-9]{1,32}$' then d.payload#>>'{measurement,adId}' end
  )), '{}')
  into sources
  from versions v join private.gestor_ia_aprendizados l on l.memory_id = v.id
  join public.gestor_ia_decisoes d on d.id = l.decision_id
  cross join lateral (
    select d.verdict is not null and private.gestor_ia_veredito_em(d.history) is not distinct from l.verdict_at as current
  ) state
  where d.owner_id = auth.uid() and d.client_id = p_client_id;

  return sources;
end;
$$;

revoke all on function public.gestor_ia_fontes_memoria(uuid,uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.gestor_ia_fontes_memoria(uuid,uuid[]) to authenticated;

notify pgrst, 'reload schema';
