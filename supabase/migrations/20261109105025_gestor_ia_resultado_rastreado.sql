create function private.gestor_ia_anuncios_do_resultado(
  p_client_id uuid, p_account_id text, p_since date, p_until date, p_history_at timestamptz
)
returns table (timezone text, ad_ids text[], partial boolean)
language plpgsql stable security definer set search_path = '' as $$
declare snapshot jsonb;
  zone_name text;
begin
  if private.gestor_ia_pode_registrar_decisao(p_client_id) is distinct from true
    or coalesce(private.planeje_staff_role(),'') not in ('admin', 'superadmin')
    or private.gestor_ia_modulo_decisao('rastreamento') is distinct from true
    or not exists (select 1 from public.cliente_meta_accounts a where a.cliente_id=p_client_id and a.is_active
      and 'act_'||regexp_replace(a.meta_account_id::text,'^act_','')=p_account_id) then
    raise insufficient_privilege using message = 'Resultado rastreado indisponível para esta conta.';
  end if;
  if p_since is null or p_until is null or not isfinite(p_since) or not isfinite(p_until)
    or p_until - p_since not between 0 and 91 or p_history_at is null or not isfinite(p_history_at) then
    raise invalid_parameter_value using message = 'Recorte rastreado inválido.';
  end if;
  select c.dados,z.name into snapshot,zone_name from public.gestor_ia_meta_cache c
    join pg_catalog.pg_timezone_names z on z.name=c.dados->>'timezone'
    where c.cliente_id=p_client_id and c.conta_id=p_account_id and c.janela='historico' and c.lido_em=p_history_at;
  if not found or jsonb_typeof(snapshot->'adDays') is distinct from 'array'
    or ((snapshot#>>'{period,since}')::date <= p_since and (snapshot#>>'{period,until}')::date >= p_until
      and p_until < (p_history_at at time zone zone_name)::date) is distinct from true then
    return;
  end if;

  return query select zone_name, array(select distinct d.item->>'ad_id' from jsonb_array_elements(snapshot->'adDays') d(item)
      where jsonb_typeof(d.item->'ad_id')='string' and d.item->>'ad_id' ~ '^[0-9]{1,32}$'),
    snapshot->'adsPartial' is distinct from 'false'::jsonb;
end;
$$;

create function public.gestor_ia_resultado_rastreado(
  p_client_id uuid, p_account_id text, p_since date, p_until date, p_history_at timestamptz
)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('total',contacts.total,'matched',contacts.matched,'partial',scope.partial)
  from private.gestor_ia_anuncios_do_resultado(p_client_id,p_account_id,p_since,p_until,p_history_at) scope
  cross join lateral (
    select count(*) as total, count(*) filter (where cardinality(ids)=1 and ids[1]=any(scope.ad_ids)) as matched
    from (
      select array(select distinct btrim(candidate) from unnest(array[c.tracking_data->>'ad_id',c.tracking_data->>'source_id',
          c.tracking_data->>'sourceID',c.tracking_data#>>'{meta_ad_details,ad,id}']) candidate
        where nullif(btrim(candidate),'') is not null) as ids
      from public.cliente_whatsapp_contact c where c.cliente_id=p_client_id and c.origin_source='meta_ads'
        and c.first_seen_at>=(p_since::timestamp at time zone scope.timezone)
        and c.first_seen_at<((p_until+1)::timestamp at time zone scope.timezone)
    ) eligible
  ) contacts;
$$;

revoke all on function private.gestor_ia_anuncios_do_resultado(uuid,text,date,date,timestamptz),
  public.gestor_ia_resultado_rastreado(uuid,text,date,date,timestamptz) from public,anon,authenticated,service_role;
grant execute on function private.gestor_ia_anuncios_do_resultado(uuid,text,date,date,timestamptz),
  public.gestor_ia_resultado_rastreado(uuid,text,date,date,timestamptz) to authenticated;
notify pgrst, 'reload schema';
