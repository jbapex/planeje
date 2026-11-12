begin;

create table public.gestor_ia_modelos_relatorio (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  window_key text not null check (window_key in ('last7','lastWeek','month','lastMonth')),
  metrics text[] not null check (cardinality(metrics) between 1 and 10 and array_position(metrics,null) is null
    and metrics <@ array['reach','impressions','clicks','result','cost','spend','messages','leads','ctr','cpc']),
  tone text not null check (char_length(tone) <= 240),
  compare_previous boolean not null,
  include_creatives boolean not null,
  include_routine boolean not null,
  revision integer not null default 1 check (revision > 0),
  updated_by uuid not null,
  updated_at timestamptz not null default statement_timestamp()
);
create unique index gestor_ia_modelos_nome on public.gestor_ia_modelos_relatorio(lower(name));

create table public.gestor_ia_modelos_por_cliente (
  client_id uuid primary key references public.clientes(id) on delete cascade,
  model_id uuid references public.gestor_ia_modelos_relatorio(id) on delete restrict,
  revision integer not null default 1 check (revision > 0),
  updated_by uuid not null,
  updated_at timestamptz not null default statement_timestamp()
);
create index gestor_ia_modelos_vinculo on public.gestor_ia_modelos_por_cliente(model_id) where model_id is not null;

create function private.gestor_ia_modelos_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.planeje_current_account_access() is true and private.planeje_staff_role() in ('admin','superadmin')
    and private.gestor_ia_modulo_decisao('paid_traffic') is true and private.gestor_ia_modulo_decisao('reports') is true;
$$;

alter table public.gestor_ia_modelos_relatorio enable row level security;
alter table public.gestor_ia_modelos_por_cliente enable row level security;
revoke all on public.gestor_ia_modelos_relatorio,public.gestor_ia_modelos_por_cliente from public,anon,authenticated,service_role;
grant select on public.gestor_ia_modelos_relatorio,public.gestor_ia_modelos_por_cliente to authenticated;
create policy gestor_ia_modelos_leitura on public.gestor_ia_modelos_relatorio for select to authenticated
  using ((select private.gestor_ia_modelos_admin()));
create policy gestor_ia_modelos_cliente_leitura on public.gestor_ia_modelos_por_cliente for select to authenticated
  using (private.gestor_ia_pode_arquivar_pdf(client_id));

create function private.gestor_ia_salvar_modelo_relatorio(p_id uuid, p_revision integer, p_config jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare saved public.gestor_ia_modelos_relatorio;
  chosen text[];
  label text;
  wording text;
begin
  if private.gestor_ia_modelos_admin() is distinct from true then
    raise insufficient_privilege using message = 'Modelos de relatório indisponíveis.';
  end if;
  if jsonb_typeof(p_config) is distinct from 'object' or octet_length(p_config::text)>2400
    or jsonb_typeof(p_config->'name') is distinct from 'string'
    or jsonb_typeof(p_config->'window_key') is distinct from 'string'
    or jsonb_typeof(p_config->'tone') is distinct from 'string'
    or jsonb_typeof(p_config->'metrics') is distinct from 'array'
    or jsonb_typeof(p_config->'compare_previous') is distinct from 'boolean'
    or jsonb_typeof(p_config->'include_creatives') is distinct from 'boolean'
    or jsonb_typeof(p_config->'include_routine') is distinct from 'boolean' then
    raise invalid_parameter_value using message = 'Modelo de relatório inválido.';
  end if;
  label := btrim(p_config->>'name');
  wording := btrim(regexp_replace(p_config->>'tone','\s+',' ','g'));
  chosen := array(select jsonb_array_elements_text(p_config->'metrics'));
  if cardinality(chosen) <> (select count(distinct metric) from unnest(chosen) metric) then
    raise invalid_parameter_value using message = 'Indicadores repetidos ou inválidos.';
  end if;
  if p_id is null and p_revision=0 then
    insert into public.gestor_ia_modelos_relatorio(name,window_key,metrics,tone,compare_previous,include_creatives,include_routine,updated_by)
    values(label,p_config->>'window_key',chosen,wording,(p_config->>'compare_previous')::boolean,(p_config->>'include_creatives')::boolean,
      (p_config->>'include_routine')::boolean,auth.uid()) returning * into saved;
  else
    update public.gestor_ia_modelos_relatorio set name=label,window_key=p_config->>'window_key',metrics=chosen,tone=wording,
      compare_previous=(p_config->>'compare_previous')::boolean,include_creatives=(p_config->>'include_creatives')::boolean,
      include_routine=(p_config->>'include_routine')::boolean,revision=revision+1,updated_by=auth.uid(),updated_at=statement_timestamp()
    where id=p_id and revision=p_revision returning * into saved;
  end if;
  if saved.id is null then raise serialization_failure using message = 'O modelo mudou em outra tela.'; end if;
  return to_jsonb(saved);
end;
$$;

create function private.gestor_ia_configurar_modelo_cliente(p_client_id uuid, p_model_id uuid, p_revision integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare saved public.gestor_ia_modelos_por_cliente;
begin
  if private.gestor_ia_pode_arquivar_pdf(p_client_id) is distinct from true then
    raise insufficient_privilege using message = 'Modelo indisponível para este cliente.';
  end if;
  if p_model_id is not null and not exists(select 1 from public.gestor_ia_modelos_relatorio where id=p_model_id) then
    raise invalid_parameter_value using message = 'Modelo de relatório indisponível.';
  end if;
  if p_revision=0 then
    insert into public.gestor_ia_modelos_por_cliente(client_id,model_id,updated_by) values(p_client_id,p_model_id,auth.uid())
    on conflict (client_id) do nothing returning * into saved;
  else
    update public.gestor_ia_modelos_por_cliente set model_id=p_model_id,revision=revision+1,updated_by=auth.uid(),updated_at=statement_timestamp()
    where client_id=p_client_id and revision=p_revision returning * into saved;
  end if;
  if saved.client_id is null then raise serialization_failure using message = 'O modelo do cliente mudou em outra tela.'; end if;
  return jsonb_build_object('model_id',saved.model_id,'revision',saved.revision);
end;
$$;

create function public.gestor_ia_salvar_modelo_relatorio(p_id uuid, p_revision integer, p_config jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.gestor_ia_salvar_modelo_relatorio(p_id,p_revision,p_config);
$$;

create function public.gestor_ia_configurar_modelo_cliente(p_client_id uuid, p_model_id uuid, p_revision integer)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.gestor_ia_configurar_modelo_cliente(p_client_id,p_model_id,p_revision);
$$;

revoke all on function private.gestor_ia_modelos_admin(),private.gestor_ia_salvar_modelo_relatorio(uuid,integer,jsonb),
  private.gestor_ia_configurar_modelo_cliente(uuid,uuid,integer),public.gestor_ia_salvar_modelo_relatorio(uuid,integer,jsonb),
  public.gestor_ia_configurar_modelo_cliente(uuid,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function private.gestor_ia_modelos_admin(),private.gestor_ia_pode_arquivar_pdf(uuid),
  private.gestor_ia_salvar_modelo_relatorio(uuid,integer,jsonb),private.gestor_ia_configurar_modelo_cliente(uuid,uuid,integer),
  public.gestor_ia_salvar_modelo_relatorio(uuid,integer,jsonb),public.gestor_ia_configurar_modelo_cliente(uuid,uuid,integer) to authenticated;

notify pgrst,'reload schema';
commit;
