begin;

create table private.gestor_ia_metricas_portal (
  client_id uuid primary key references public.clientes(id) on delete cascade,
  shared boolean not null,
  objective text check (objective in ('leads','mensagens','compras','trafego','alcance','engajamento','video','perfil_instagram')),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default statement_timestamp(),
  updated_by uuid not null,
  check (not shared or objective is not null)
);
alter table private.gestor_ia_metricas_portal enable row level security;
revoke all on private.gestor_ia_metricas_portal from public,anon,authenticated,service_role;

create function private.gestor_ia_consultar_metricas_portal(p_client_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if private.gestor_ia_pode_arquivar_pdf(p_client_id) is distinct from true then
    raise insufficient_privilege using message = 'Compartilhamento indisponível.';
  end if;
  return coalesce((select jsonb_build_object('shared',m.shared,'objective',m.objective,'revision',m.revision)
    from private.gestor_ia_metricas_portal m where m.client_id=p_client_id),
    jsonb_build_object('shared',false,'objective',null,'revision',0));
end;
$$;

create function private.gestor_ia_configurar_metricas_portal(p_client_id uuid, p_shared boolean, p_objective text, p_revision integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare saved private.gestor_ia_metricas_portal;
begin
  if private.gestor_ia_pode_arquivar_pdf(p_client_id) is distinct from true then
    raise insufficient_privilege using message = 'Compartilhamento indisponível.';
  end if;
  if p_shared is null or p_revision is null or p_revision<0 then
    raise invalid_parameter_value using message = 'Compartilhamento inválido.';
  end if;
  if p_revision=0 then
    insert into private.gestor_ia_metricas_portal(client_id,shared,objective,updated_by)
    values(p_client_id,p_shared,p_objective,auth.uid()) on conflict (client_id) do nothing returning * into saved;
  else
    update private.gestor_ia_metricas_portal set shared=p_shared,objective=p_objective,revision=revision+1,
      updated_at=statement_timestamp(),updated_by=auth.uid()
    where client_id=p_client_id and revision=p_revision returning * into saved;
  end if;
  if saved.client_id is null then raise serialization_failure using message = 'O compartilhamento mudou em outra tela.'; end if;
  return jsonb_build_object('shared',saved.shared,'objective',saved.objective,'revision',saved.revision);
end;
$$;

create function private.gestor_ia_escopo_metricas_portal()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('clientId',m.client_id,'objective',m.objective,'revision',m.revision)
  from private.gestor_ia_metricas_portal m where m.client_id=private.gestor_ia_pdf_cliente_portal() and m.shared;
$$;

create function private.gestor_ia_historicos_metricas_portal(p_client_id uuid, p_revision integer)
returns jsonb language sql stable security definer set search_path = '' as $$
  with links as (
    select distinct 'act_'||regexp_replace(btrim(l.meta_account_id),'^act_','') as account
    from public.cliente_meta_accounts l where l.cliente_id=p_client_id and l.is_active and btrim(l.meta_account_id) ~ '^(act_)?[0-9]{1,32}$'
  ), eligible as (
    select links.account from links where not exists (
      select 1 from public.cliente_meta_accounts other where other.cliente_id<>p_client_id and other.is_active
        and btrim(other.meta_account_id) in (links.account,substring(links.account from 5))
    )
  )
  select jsonb_build_object(
    'accounts',coalesce((select jsonb_agg(jsonb_build_object('days',h.dados->'accountDays','fetchedAt',h.lido_em,'timezone',h.dados->>'timezone') order by e.account)
      from eligible e left join public.gestor_ia_meta_cache h on h.cliente_id=p_client_id and h.conta_id=e.account and h.janela='historico'),'[]'::jsonb),
    'excludedAccounts',(select count(*) from links)-(select count(*) from eligible)
  ) where exists(select 1 from public.clientes c where c.id=p_client_id and c.etapa='closed')
    and (p_revision is null or exists(select 1 from private.gestor_ia_metricas_portal m where m.client_id=p_client_id and m.shared and m.revision=p_revision));
$$;

create function public.gestor_ia_consultar_metricas_portal(p_client_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.gestor_ia_consultar_metricas_portal(p_client_id);
$$;
create function public.gestor_ia_configurar_metricas_portal(p_client_id uuid,p_shared boolean,p_objective text,p_revision integer)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.gestor_ia_configurar_metricas_portal(p_client_id,p_shared,p_objective,p_revision);
$$;
create function public.gestor_ia_escopo_metricas_portal()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.gestor_ia_escopo_metricas_portal();
$$;
create function public.gestor_ia_historicos_metricas_portal(p_client_id uuid,p_revision integer)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.gestor_ia_historicos_metricas_portal(p_client_id,p_revision);
$$;

revoke all on function private.gestor_ia_consultar_metricas_portal(uuid),public.gestor_ia_consultar_metricas_portal(uuid),
  private.gestor_ia_configurar_metricas_portal(uuid,boolean,text,integer),public.gestor_ia_configurar_metricas_portal(uuid,boolean,text,integer),
  private.gestor_ia_escopo_metricas_portal(),public.gestor_ia_escopo_metricas_portal(),
  private.gestor_ia_historicos_metricas_portal(uuid,integer),public.gestor_ia_historicos_metricas_portal(uuid,integer)
  from public,anon,authenticated,service_role;
grant execute on function private.gestor_ia_consultar_metricas_portal(uuid),public.gestor_ia_consultar_metricas_portal(uuid),
  private.gestor_ia_configurar_metricas_portal(uuid,boolean,text,integer),public.gestor_ia_configurar_metricas_portal(uuid,boolean,text,integer),
  private.gestor_ia_escopo_metricas_portal(),public.gestor_ia_escopo_metricas_portal() to authenticated;
grant execute on function private.gestor_ia_historicos_metricas_portal(uuid,integer),public.gestor_ia_historicos_metricas_portal(uuid,integer) to service_role;

notify pgrst,'reload schema';
commit;
