create table public.gestor_ia_metas_campanha (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clientes(id) on delete cascade,
  account_id text not null check (account_id ~ '^act_[0-9]{1,32}$'),
  name text not null check (length(btrim(name)) between 1 and 80),
  objective text not null check (objective in ('leads', 'mensagens', 'compras')),
  scope text not null check (scope in ('objective', 'account', 'campaigns')),
  campaign_ids text[] not null default '{}',
  cost_cents integer not null check (cost_cents > 0),
  budget_cents integer check (budget_cents > 0),
  result_target integer check (result_target > 0),
  is_active boolean not null default true,
  is_primary boolean not null default false,
  updated_at timestamptz not null default now(),
  check (array_position(campaign_ids, null) is null and (
    (scope = 'campaigns' and cardinality(campaign_ids) between 1 and 100
      and array_to_string(campaign_ids, ',') ~ '^[0-9]{1,32}(,[0-9]{1,32})*$')
    or (scope <> 'campaigns' and cardinality(campaign_ids) = 0)
  ))
);

create index gestor_ia_metas_conta on public.gestor_ia_metas_campanha (client_id, account_id);
create unique index gestor_ia_meta_principal on public.gestor_ia_metas_campanha (client_id) where is_primary;

create function public.gestor_ia_pode_usar_metas(p_client_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.planeje_current_account_access()
    and public.central_trafego_can_access_client(p_client_id)
    and exists (select 1 from public.clientes c where c.id = p_client_id and c.etapa = 'closed')
    and exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active' and p.role in ('admin', 'superadmin')
        and not exists (
          select 1 from (values ('paid_traffic'), ('clients')) as m(name)
          where not coalesce(
            (select u.is_enabled from public.user_module_permissions u where u.user_id = p.id and u.module_name::text = m.name),
            (select g.is_enabled from public.module_settings g where g.module_name::text = m.name), true)
        )
        and (p.role = 'superadmin' or not exists (
          select 1 from (values ('meta_resumo'), ('valor')) as f(name)
          where not coalesce(
            (select u.can_view from public.user_client_field_permissions u where u.user_id = p.id and u.field_name::text = f.name),
            (select r.can_view from public.client_field_permissions r where r.role::text = p.role::text and r.field_name::text = f.name), true)
        ))
    );
$$;

revoke all on function public.gestor_ia_pode_usar_metas(uuid) from public, anon, authenticated;
grant execute on function public.gestor_ia_pode_usar_metas(uuid) to authenticated;

alter table public.gestor_ia_metas_campanha enable row level security;
revoke all on public.gestor_ia_metas_campanha from public, anon, authenticated;
grant select on public.gestor_ia_metas_campanha to authenticated;
create policy gestor_ia_metas_campanha_leitura on public.gestor_ia_metas_campanha
  for select to authenticated using (public.gestor_ia_pode_usar_metas(client_id));

create function public.gestor_ia_salvar_meta(
  p_client_id uuid, p_account_id text, p_goal_id uuid, p_name text, p_objective text, p_scope text,
  p_campaign_ids text[], p_cost_cents integer, p_budget_cents integer, p_result_target integer, p_is_active boolean, p_is_primary boolean
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
    raise insufficient_privilege using message = 'Cliente ou conta indisponível para editar metas.';
  end if;

  -- A eleição da meta principal é atômica, inclusive entre contas e abas diferentes.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_client_id::text, 6110904));
  if p_goal_id is not null and not exists (
    select 1 from public.gestor_ia_metas_campanha where id = p_goal_id and client_id = p_client_id and account_id = p_account_id
  ) then
    raise insufficient_privilege using message = 'Meta indisponível para esta conta.';
  end if;
  if p_is_primary then
    update public.gestor_ia_metas_campanha set is_primary = false
      where client_id = p_client_id and is_primary and id is distinct from p_goal_id;
  end if;

  if p_goal_id is null then
    insert into public.gestor_ia_metas_campanha
      (client_id, account_id, name, objective, scope, campaign_ids, cost_cents, budget_cents, result_target, is_active, is_primary)
    values (p_client_id, p_account_id, btrim(p_name), p_objective, p_scope, p_campaign_ids, p_cost_cents,
      p_budget_cents, p_result_target, p_is_active, p_is_primary)
    returning * into saved;
  else
    update public.gestor_ia_metas_campanha set
      name = btrim(p_name), objective = p_objective, scope = p_scope, campaign_ids = p_campaign_ids,
      cost_cents = p_cost_cents, budget_cents = p_budget_cents, result_target = p_result_target,
      is_active = p_is_active, is_primary = p_is_primary, updated_at = now()
    where id = p_goal_id and client_id = p_client_id and account_id = p_account_id
    returning * into saved;
  end if;
  return saved;
end;
$$;

revoke all on function public.gestor_ia_salvar_meta(uuid,text,uuid,text,text,text,text[],integer,integer,integer,boolean,boolean) from public, anon, authenticated;
grant execute on function public.gestor_ia_salvar_meta(uuid,text,uuid,text,text,text,text[],integer,integer,integer,boolean,boolean) to authenticated;
