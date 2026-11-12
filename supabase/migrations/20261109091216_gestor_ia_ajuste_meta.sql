create function public.gestor_ia_ajustar_meta(
  p_client_id uuid, p_account_id text, p_goal_id uuid, p_expected_updated_at timestamptz,
  p_budget_cents integer, p_result_target integer
)
returns public.gestor_ia_metas_campanha language plpgsql security definer set search_path = '' as $$
declare
  saved public.gestor_ia_metas_campanha;
begin
  if public.gestor_ia_pode_usar_metas(p_client_id) is distinct from true or not exists (
    select 1 from public.cliente_meta_accounts a
    where a.cliente_id = p_client_id and a.is_active
      and 'act_' || regexp_replace(a.meta_account_id::text, '^act_', '') = p_account_id
  ) then
    raise insufficient_privilege using message = 'Cliente ou conta indisponível para ajustar metas.';
  end if;
  if (p_budget_cents is null) = (p_result_target is null) or coalesce(p_budget_cents, p_result_target) <= 0
    or p_expected_updated_at is null then
    raise invalid_parameter_value using message = 'Informe apenas um valor positivo e a versão da meta.';
  end if;

  -- Compartilha a trava do editor de metas antes de conferir a versão do rascunho.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_client_id::text, 6110904));
  update public.gestor_ia_metas_campanha set
    budget_cents = coalesce(p_budget_cents, budget_cents), result_target = coalesce(p_result_target, result_target),
    updated_at = pg_catalog.clock_timestamp()
  where id = p_goal_id and client_id = p_client_id and account_id = p_account_id
    and is_active and updated_at = p_expected_updated_at
  returning * into saved;
  if not found then
    raise serialization_failure using message = 'A meta mudou. Abra o cenário novamente.';
  end if;
  return saved;
end;
$$;

revoke all on function public.gestor_ia_ajustar_meta(uuid,text,uuid,timestamptz,integer,integer) from public, anon, authenticated;
grant execute on function public.gestor_ia_ajustar_meta(uuid,text,uuid,timestamptz,integer,integer) to authenticated;
