alter table public.gestor_ia_agendas
  drop constraint gestor_ia_agendas_categories_check,
  add constraint gestor_ia_agendas_categories_check check (
    cardinality(categories) <= 6 and array_position(categories, null) is null
    and categories <@ array['escala','custo','verba','criativo','ia','descoberta']
  );

alter table private.gestor_ia_aprendizados
  add column agenda_memory_version uuid references public.atlas_memories(id) on delete set null;

create table private.gestor_ia_agenda_planos (
  agenda_id uuid not null references public.gestor_ia_agendas(id) on delete cascade,
  day date not null,
  agenda_revision integer not null,
  fetched_at timestamptz not null,
  decision_ids uuid[] not null check (cardinality(decision_ids) <= 3),
  candidates jsonb not null default '[]' check (jsonb_typeof(candidates)='array'),
  state text not null default 'queued' check (state in ('queued','reserved','ready','empty','failed','limited','account_used','superseded')),
  reserved_at timestamptz,
  completed_at timestamptz,
  memory_versions jsonb not null default '{}',
  plans jsonb not null default '{}',
  discovery_count integer not null default 0 check (discovery_count between 0 and 2),
  primary key (agenda_id,day)
);
alter table private.gestor_ia_agenda_planos enable row level security;
revoke all on private.gestor_ia_agenda_planos from public, anon, authenticated, service_role;
create index gestor_ia_agenda_planos_fila on private.gestor_ia_agenda_planos(day,agenda_id) where state='queued';
create index gestor_ia_agenda_planos_avisos on private.gestor_ia_agenda_planos using gin(decision_ids);

create function private.gestor_ia_agenda_humana()
returns boolean language sql stable security invoker set search_path = '' as $$
  select auth.jwt()->>'session_id' is not null and auth.jwt()->>'planeje_server_delegate' is null
    and public.atlas_is_owner() and private.gestor_ia_modulo_decisao('assistant');
$$;

create function public.gestor_ia_memorias_da_agenda(p_client_id uuid, p_versions uuid[], p_allow boolean default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare versions jsonb;
  root uuid;
begin
  if private.gestor_ia_agenda_humana() is distinct from true or private.gestor_ia_pode_registrar_decisao(p_client_id) is distinct from true then
    raise insufficient_privilege using message = 'Memória da agenda indisponível para este cliente.';
  end if;
  if p_versions is null or cardinality(p_versions)>50 or (p_allow is not null and cardinality(p_versions)<>1) then
    raise invalid_parameter_value using message = 'Seleção de versões inválida.';
  end if;
  select coalesce(jsonb_object_agg(m.id, l.agenda_memory_version is not distinct from m.id),'{}'),
    min(l.memory_id::text)::uuid into versions,root
  from private.gestor_ia_aprendizados l join public.gestor_ia_decisoes d on d.id=l.decision_id
  cross join lateral private.gestor_ia_memoria_ativa(l.memory_id,d.owner_id,d.client_id) m
  where d.owner_id=auth.uid() and d.client_id=p_client_id and m.id=any(p_versions) and m.confirmed_at is not null
    and d.verdict is not null and private.gestor_ia_veredito_em(d.history)=l.verdict_at
    and l.objective is not null and private.gestor_ia_agenda_scope(d.client_id,l.account_id);
  if p_allow is null then return versions; end if;
  if root is null then raise serialization_failure using message = 'A versão do aprendizado mudou. Reabra a Memória.'; end if;
  update private.gestor_ia_aprendizados set agenda_memory_version=case when p_allow then p_versions[1] end
    where memory_id=root and (p_allow or agenda_memory_version=p_versions[1]);
  return jsonb_build_object(p_versions[1],p_allow);
end;
$$;

create function private.gestor_ia_memoria_do_modelo(p_decision public.gestor_ia_decisoes)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('id',m.id,'version',m.version,'state',m.state,'source',m.source,'confirmed_at',m.confirmed_at,'content',m.content)
  from private.gestor_ia_aprendizados l join public.atlas_memories m on m.id=l.agenda_memory_version
  where l.memory_id::text=(p_decision).payload->>'agendaLearningId' and m.confirmed_at is not null
    and private.gestor_ia_aprendizado_correspondente(p_decision,l.memory_id::text)->>'memoryId'=m.id::text;
$$;

create function private.gestor_ia_plano_vigente(a public.gestor_ia_agendas, r private.gestor_ia_agenda_planos)
returns boolean language sql stable security invoker set search_path = '' as $$
  select a.owner_id=auth.uid() and a.enabled and a.revision=r.agenda_revision and a.categories && array['ia','descoberta']
    and r.day=(now() at time zone 'America/Sao_Paulo')::date and extract(isodow from r.day)::integer=any(a.weekdays)
    and private.gestor_ia_agenda_scope(a.client_id,a.account_id)
    and exists (select 1 from public.gestor_ia_meta_cache h where h.cliente_id=a.client_id and h.conta_id=a.account_id
      and h.janela='historico' and h.lido_em=r.fetched_at);
$$;

create function private.gestor_ia_memoria_da_busca(a public.gestor_ia_agendas, c jsonb)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare target public.gestor_ia_decisoes;
  root jsonb;
begin
  target.id := '00000000-0000-0000-0000-000000000000';
  target.owner_id := a.owner_id;
  target.client_id := a.client_id;
  target.payload := jsonb_build_object('measurement',jsonb_build_object('accountId',a.account_id,
    'campaignId',nullif(c->>'id','conta'),'adId',c->>'adId','objective',c->>'objective'));
  root := private.gestor_ia_aprendizado_correspondente(target)->'rootId';
  if root is null then return null; end if;
  target.payload := target.payload||jsonb_build_object('agendaLearningId',root);
  return private.gestor_ia_memoria_do_modelo(target)||jsonb_build_object('rootId',root);
end;
$$;

create function private.gestor_ia_busca_disponivel(a public.gestor_ia_agendas, c jsonb)
returns boolean language sql stable security invoker set search_path = '' as $$
  select not exists (select 1 from public.gestor_ia_decisoes d where d.owner_id=a.owner_id and d.client_id=a.client_id
    and d.status<>'dismissed' and d.verdict is null and starts_with(d.source_key,'agenda:')
    and d.payload#>>'{measurement,accountId}'=a.account_id
    and d.payload#>>'{measurement,campaignId}' is not distinct from nullif(c->>'id','conta'))
    and (c->>'id'<>'conta' or (public.gestor_ia_pode_usar_metas(a.client_id) is true and (
      select count(*)=1 and coalesce(bool_and(g.scope='account' and g.objective=c->>'objective'
        and g.budget_cents=(c#>>'{metrics,budget}')::numeric*100),false)
      from public.gestor_ia_metas_campanha g where g.client_id=a.client_id and g.account_id=a.account_id and g.is_active
    )));
$$;

create function public.gestor_ia_agenda_reservar_plano(p_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare run private.gestor_ia_agenda_planos;
  local_day date := (now() at time zone 'America/Sao_Paulo')::date;
  agenda public.gestor_ia_agendas;
  input jsonb;
  memories jsonb;
  search_input jsonb;
  search_memories jsonb;
begin
  if private.gestor_ia_agenda_worker() is distinct from true then
    raise insufficient_privilege using message = 'Execução reservada à rotina interna.';
  end if;
  if p_limit is null or p_limit not between 1 and 5 then raise invalid_parameter_value using message = 'Teto diário inválido.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||local_day::text,6110924));
  select r.* into run from private.gestor_ia_agenda_planos r join public.gestor_ia_agendas a on a.id=r.agenda_id
    where r.day=local_day and r.state='queued' and private.gestor_ia_plano_vigente(a,r)
    order by a.run_time,r.agenda_id limit 1 for update of r;
  if not found then return null; end if;
  select * into agenda from public.gestor_ia_agendas where id=run.agenda_id;
  if exists (select 1 from private.gestor_ia_agenda_planos r join public.gestor_ia_agendas a on a.id=r.agenda_id
      where a.owner_id=auth.uid() and a.account_id=agenda.account_id and r.day=local_day and r.reserved_at is not null) then
    update private.gestor_ia_agenda_planos set state='account_used',completed_at=now(),candidates='[]' where agenda_id=run.agenda_id and day=run.day;
    return null;
  end if;
  if (select count(*) from private.gestor_ia_agenda_planos r join public.gestor_ia_agendas a on a.id=r.agenda_id
      where a.owner_id=auth.uid() and r.day=local_day and r.reserved_at is not null)>=p_limit then
    update private.gestor_ia_agenda_planos set state='limited',completed_at=now(),candidates='[]' where agenda_id=run.agenda_id and day=run.day;
    return null;
  end if;
  select jsonb_agg(jsonb_build_object('id',d.id,'payload',d.payload,'learning',m.note) order by array_position(run.decision_ids,d.id)),
    coalesce(jsonb_object_agg(d.id,jsonb_build_object('id',m.note->>'id','version',m.note->'version'))
      filter (where m.note is not null),'{}') into input,memories
  from public.gestor_ia_decisoes d cross join lateral (select private.gestor_ia_memoria_do_modelo(d) as note) m
  where d.id=any(run.decision_ids) and d.owner_id=auth.uid() and d.status='pending' and d.revision=1;
  select jsonb_agg(c.item||jsonb_build_object('learning',m.note) order by c.position),
    coalesce(jsonb_object_agg('busca:'||(c.item->>'id'),m.note-'content'-'state'-'source') filter (where m.note is not null),'{}')
    into search_input,search_memories
  from jsonb_array_elements(run.candidates) with ordinality as c(item,position)
  cross join lateral (select private.gestor_ia_memoria_da_busca(agenda,c.item) as note) m
  where private.gestor_ia_busca_disponivel(agenda,c.item);
  if input is null and search_input is null then
    update private.gestor_ia_agenda_planos set state='superseded',completed_at=now(),candidates='[]' where agenda_id=run.agenda_id and day=run.day;
    return null;
  end if;
  update private.gestor_ia_agenda_planos set state='reserved',reserved_at=now(),memory_versions=memories||search_memories,
    candidates=coalesce((select jsonb_agg(c.item-'learning' order by c.position)
      from jsonb_array_elements(search_input) with ordinality as c(item,position)),'[]')
    where agenda_id=run.agenda_id and day=run.day;
  return jsonb_build_object('agenda_id',run.agenda_id,'day',run.day,'rows',coalesce(input,'[]'),'candidates',coalesce(search_input,'[]'));
end;
$$;

create function private.gestor_ia_plano_valido(p_plan jsonb,p_memory boolean)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
begin
  if jsonb_typeof(p_plan) is distinct from 'object'
    or p_plan - array['hypothesis','steps','verification','days','usedMemory'] <> '{}'::jsonb
    or jsonb_typeof(p_plan->'hypothesis') is distinct from 'string' or char_length(btrim(p_plan->>'hypothesis')) not between 1 and 360
    or jsonb_typeof(p_plan->'verification') is distinct from 'string' or char_length(btrim(p_plan->>'verification')) not between 1 and 240
    or jsonb_typeof(p_plan->'days') is distinct from 'number' or p_plan->>'days' not in ('3','7','14')
    or jsonb_typeof(p_plan->'usedMemory') is distinct from 'boolean' or (p_plan->>'usedMemory'='true' and not p_memory)
    or jsonb_typeof(p_plan->'steps') is distinct from 'array' then return false; end if;
  return jsonb_array_length(p_plan->'steps') between 1 and 3 and not exists (
    select 1 from jsonb_array_elements(p_plan->'steps') s(value) where jsonb_typeof(s.value)<>'string'
      or char_length(btrim(s.value#>>'{}')) not between 1 and 180);
end;
$$;

create function public.gestor_ia_agenda_finalizar_plano(p_agenda_id uuid,p_day date,p_plans jsonb,p_findings jsonb default '{}')
returns boolean language plpgsql security definer set search_path = '' as $$
declare run private.gestor_ia_agenda_planos;
  agenda public.gestor_ia_agendas;
  decision_key text;
  plan jsonb;
  found_item jsonb;
  candidate jsonb;
  kind text;
  title text;
  proof jsonb;
  note_version jsonb;
  found_count integer := 0;
begin
  if private.gestor_ia_agenda_worker() is distinct from true then
    raise insufficient_privilege using message = 'Execução reservada à rotina interna.';
  end if;
  select * into agenda from public.gestor_ia_agendas where id=p_agenda_id and owner_id=auth.uid() for share;
  if not found then return false; end if;
  select * into run from private.gestor_ia_agenda_planos where agenda_id=p_agenda_id and day=p_day and state='reserved' for update;
  if not found then return false; end if;
  perform 1 from public.gestor_ia_meta_cache where cliente_id=agenda.client_id and conta_id=agenda.account_id
    and janela='historico' and lido_em=run.fetched_at for share;
  if not found or private.gestor_ia_plano_vigente(agenda,run) is distinct from true or run.reserved_at < now()-interval '3 minutes' or exists (
    select 1 from jsonb_each(run.memory_versions) as v(id,memory)
    left join public.gestor_ia_decisoes d on d.id::text=v.id
    left join lateral (select item from jsonb_array_elements(run.candidates) c(item) where v.id='busca:'||(c.item->>'id')) c on true
    where (case when c.item is null then private.gestor_ia_memoria_do_modelo(d) else private.gestor_ia_memoria_da_busca(agenda,c.item) end)->>'id'
      is distinct from v.memory->>'id'
  ) then
    update private.gestor_ia_agenda_planos set state='superseded',completed_at=now(),candidates='[]' where agenda_id=p_agenda_id and day=p_day;
    return false;
  end if;
  if (p_plans is not null and (jsonb_typeof(p_plans)<>'object' or octet_length(p_plans::text)>12000))
    or jsonb_typeof(p_findings) is distinct from 'object' or octet_length(p_findings::text)>12000
    or (p_plans is null and p_findings<>'{}') then
    raise invalid_parameter_value using message = 'Plano da agenda inválido.';
  end if;
  if (select count(*) from jsonb_object_keys(p_findings))>2 or
    (select count(*) from jsonb_object_keys(p_findings||coalesce(p_plans,'{}')))>3 then
    raise invalid_parameter_value using message = 'Plano da agenda inválido.';
  end if;
  for decision_key,plan in select key,value from jsonb_each(coalesce(p_plans,'{}')) loop
    if not decision_key=any(run.decision_ids::text[]) or not private.gestor_ia_plano_valido(plan,run.memory_versions ? decision_key) then
      raise invalid_parameter_value using message = 'Plano da agenda inválido.';
    end if;
    perform 1 from public.gestor_ia_decisoes d where d.id=decision_key::uuid and d.owner_id=auth.uid() and d.status='pending' and d.revision=1 for share;
    if not found then p_plans:=p_plans-decision_key; end if;
  end loop;
  for decision_key,found_item in select key,value from jsonb_each(p_findings) loop
    select item into candidate from jsonb_array_elements(run.candidates) c(item) where c.item->>'id'=decision_key;
    kind := found_item->>'kind';
    plan := found_item->'plan';
    note_version := run.memory_versions->('busca:'||decision_key);
    title := case kind when 'entrega' then 'Investigar queda de volume' when 'custo' then 'Revisar aumento de custo'
      when 'escala' then 'Avaliar oportunidade de escala' when 'criativo' then 'Investigar sinais de fadiga'
      when 'verba' then case when (candidate#>>'{metrics,projectedSpend}')::numeric>(candidate#>>'{metrics,budget}')::numeric
        then 'Conferir risco de ultrapassar a verba' else 'Avaliar sobra de verba' end end;
    if candidate is null or title is null or not (candidate->'options' ? kind) or jsonb_typeof(found_item) is distinct from 'object'
      or found_item-array['kind','plan']<>'{}' or not private.gestor_ia_plano_valido(plan,note_version is not null) then
      raise invalid_parameter_value using message = 'Plano da agenda inválido.';
    end if;
    if decision_key='conta' then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(agenda.client_id::text,6110904));
    end if;
    if private.gestor_ia_busca_disponivel(agenda,candidate) is distinct from true then continue; end if;
    select jsonb_agg(jsonb_build_object('key',k.name,'value',candidate->'metrics'->k.name) order by k.position) into proof
      from jsonb_array_elements_text(candidate->'options'->kind) with ordinality k(name,position);
    insert into public.gestor_ia_decisoes(owner_id,client_id,source_key,origin,title,payload)
    values(agenda.owner_id,agenda.client_id,'agenda:busca:'||agenda.account_id||':'||kind||':'||decision_key||':'||(candidate#>>'{period,until}'),
      'ai',title,jsonb_build_object('agendaDiscovery',true,'detail',plan->>'hypothesis','source',candidate->>'name','kind',kind,
      'rank',case kind when 'verba' then 1 when 'criativo' then 2 else 3 end,
      'period',candidate->'period','currency',candidate->>'currency','syncedAt',run.fetched_at,
      'measurement',jsonb_strip_nulls(jsonb_build_object('accountId',agenda.account_id,'campaignId',nullif(decision_key,'conta'),
        'adId',candidate->>'adId','objective',candidate->>'objective')),
      'evidence',proof,'steps',plan->'steps','verification',plan->>'verification','days',plan->'days')
      ||case when candidate ? 'comparisonPeriod' then jsonb_build_object('comparisonPeriod',candidate->'comparisonPeriod') else '{}'::jsonb end
      ||case when candidate ? 'adName' then jsonb_build_object('discoveryAd',candidate->>'adName') else '{}'::jsonb end
      ||case when plan->>'usedMemory'='true' then jsonb_build_object('learningVersion',note_version->'version',
        'memoryEvidence',jsonb_build_array(jsonb_build_object('confirmedAt',note_version->'confirmed_at'))) else '{}'::jsonb end)
    on conflict (owner_id,client_id,source_key) do nothing;
    if found then found_count:=found_count+1; end if;
  end loop;
  update private.gestor_ia_agenda_planos set plans=coalesce(p_plans,'{}'),completed_at=now(),discovery_count=found_count,candidates='[]',
    state=case when p_plans is null then 'failed' when p_plans='{}'::jsonb and found_count=0 then 'empty' else 'ready' end
    where agenda_id=p_agenda_id and day=p_day;
  return true;
end;
$$;

create function public.gestor_ia_plano_do_aviso(p_decision_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare run private.gestor_ia_agenda_planos;
  state text;
  plan jsonb;
begin
  if private.gestor_ia_agenda_humana() is distinct from true then
    raise insufficient_privilege using message = 'Plano indisponível para esta sessão.';
  end if;
  select r.* into run from private.gestor_ia_agenda_planos r join public.gestor_ia_agendas a on a.id=r.agenda_id
    join public.gestor_ia_decisoes d on d.id=p_decision_id and d.owner_id=a.owner_id and d.client_id=a.client_id
    where a.owner_id=auth.uid() and r.decision_ids @> array[p_decision_id] and private.gestor_ia_agenda_scope(a.client_id,a.account_id)
    order by r.day desc limit 1;
  if not found then return null; end if;
  plan := run.plans->p_decision_id::text;
  state := case when run.state='ready' and plan is null then 'empty'
    when run.state in ('queued','reserved') and not exists (
      select 1 from public.gestor_ia_agendas a where a.id=run.agenda_id and private.gestor_ia_plano_vigente(a,run)) then 'superseded'
    when run.state='reserved' and run.reserved_at<now()-interval '3 minutes' then 'failed' else run.state end;
  return jsonb_build_object('state',state,'plan',plan,'completedAt',run.completed_at,
    'learningVersion',case when plan->>'usedMemory'='true' then run.memory_versions->p_decision_id::text->'version' end);
end;
$$;

revoke all on function private.gestor_ia_agenda_humana(), private.gestor_ia_memoria_do_modelo(public.gestor_ia_decisoes),
  private.gestor_ia_plano_vigente(public.gestor_ia_agendas,private.gestor_ia_agenda_planos),
  private.gestor_ia_memoria_da_busca(public.gestor_ia_agendas,jsonb),private.gestor_ia_busca_disponivel(public.gestor_ia_agendas,jsonb),
  private.gestor_ia_plano_valido(jsonb,boolean),
  public.gestor_ia_memorias_da_agenda(uuid,uuid[],boolean),public.gestor_ia_agenda_reservar_plano(integer),
  public.gestor_ia_agenda_finalizar_plano(uuid,date,jsonb,jsonb),public.gestor_ia_plano_do_aviso(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.gestor_ia_memorias_da_agenda(uuid,uuid[],boolean),public.gestor_ia_agenda_reservar_plano(integer),
  public.gestor_ia_agenda_finalizar_plano(uuid,date,jsonb,jsonb),public.gestor_ia_plano_do_aviso(uuid) to authenticated;

create or replace function public.gestor_ia_agenda_concluir(p_id uuid, p_revision integer, p_day date,
  p_fetched_at timestamptz, p_state text, p_rows jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare agenda public.gestor_ia_agendas;
  local_time timestamp := now() at time zone 'America/Sao_Paulo';
  current_read timestamptz;
  item jsonb;
  rule text;
  prefix text;
  cutoff text;
  inserted_id uuid;
  decisions uuid[] := array[]::uuid[];
  count_saved integer := 0;
begin
  if private.gestor_ia_agenda_worker() is distinct from true then
    raise insufficient_privilege using message = 'Execução reservada à rotina interna.';
  end if;
  if p_state is null or p_state not in ('read','no_data') or jsonb_typeof(p_rows) is distinct from 'array' then
    raise invalid_parameter_value using message = 'Resultado da agenda inválido.';
  end if;
  if jsonb_array_length(p_rows)>3 or (p_state='no_data' and p_rows<>'[]'::jsonb) then
    raise invalid_parameter_value using message = 'Resultado da agenda inválido.';
  end if;
  select * into agenda from public.gestor_ia_agendas where id=p_id and owner_id=auth.uid() for update;
  if not found or not agenda.enabled or agenda.revision is distinct from p_revision or p_day is distinct from local_time::date
    or agenda.run_time>local_time::time or private.gestor_ia_agenda_scope(agenda.client_id,agenda.account_id) is distinct from true then
    return false;
  end if;
  perform 1 from public.cliente_meta_accounts a where a.cliente_id=agenda.client_id and a.is_active
    and 'act_' || regexp_replace(a.meta_account_id::text,'^act_','')=agenda.account_id for share;
  if not found then return false; end if;
  select lido_em into current_read from public.gestor_ia_meta_cache
    where cliente_id=agenda.client_id and conta_id=agenda.account_id and janela='historico' for share;
  if current_read is distinct from p_fetched_at or (p_state='read' and current_read is null) then return false; end if;
  if agenda.last_day>=p_day and not (agenda.last_day=p_day and agenda.last_state='no_data' and current_read is distinct from agenda.last_fetched_at) then
    return false;
  end if;

  for item in select value from jsonb_array_elements(p_rows) loop
    rule := split_part(item->>'key',':',1);
    cutoff := item#>>'{payload,period,until}';
    if coalesce(item->>'key','') !~ '^((sem_resultado|escala|custo|corte|criativo):[0-9]{1,32}|verba:conta)$'
      or coalesce(cutoff,'') !~ '^\d{4}-\d{2}-\d{2}$'
      or (rule not in ('sem_resultado','corte') and not (rule=any(agenda.categories) and extract(isodow from local_time)::integer=any(agenda.weekdays)))
      or (rule in ('corte','criativo') and (
        item#>>'{payload,kind}' is distinct from rule
        or item#>>'{payload,measurement,campaignId}' is distinct from split_part(item->>'key',':',2))) then
      raise invalid_parameter_value using message = 'Aviso fora da agenda.';
    end if;
    prefix := 'agenda:'||agenda.account_id||':'||(item->>'key')||':';
    insert into public.gestor_ia_decisoes (owner_id,client_id,source_key,origin,title,payload)
    select agenda.owner_id,agenda.client_id,prefix||cutoff,'signal',item->>'title',
      jsonb_set(item->'payload','{measurement}',coalesce(item#>'{payload,measurement}','{}'::jsonb)||jsonb_build_object('accountId',agenda.account_id))
    where not exists (select 1 from public.gestor_ia_decisoes d where d.owner_id=agenda.owner_id and d.client_id=agenda.client_id
      and d.status<>'dismissed' and d.verdict is null and starts_with(d.source_key,prefix))
    on conflict (owner_id,client_id,source_key) do nothing returning id into inserted_id;
    if found then decisions:=array_append(decisions,inserted_id); end if;
  end loop;
  count_saved:=cardinality(decisions);
  if count_saved>0 and 'ia'=any(agenda.categories) and extract(isodow from local_time)::integer=any(agenda.weekdays) then
    insert into private.gestor_ia_agenda_planos(agenda_id,day,agenda_revision,fetched_at,decision_ids)
    values(agenda.id,p_day,agenda.revision,current_read,decisions) on conflict (agenda_id,day) do nothing;
  end if;
  update public.gestor_ia_agendas set last_day=p_day,last_run_at=now(),last_fetched_at=current_read,last_count=count_saved,
    last_state=case when p_state='no_data' then 'no_data' when count_saved>0 then 'published'
      when p_rows<>'[]'::jsonb then 'unchanged' else 'no_signals' end where id=agenda.id;
  return true;
end;
$$;

create function public.gestor_ia_agenda_concluir_com_busca(p_id uuid,p_revision integer,p_day date,
  p_fetched_at timestamptz,p_state text,p_rows jsonb,p_candidates jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare agenda public.gestor_ia_agendas;
  cached jsonb;
  closed_day date;
  captured_day date;
  comparison_end date;
  month_start date;
  month_end date;
  candidate jsonb;
  selected jsonb := '[]';
  id text;
  result_key text;
  metrics jsonb;
  options jsonb;
  ad_id text;
begin
  if private.gestor_ia_agenda_worker() is distinct from true then
    raise insufficient_privilege using message = 'Execução reservada à rotina interna.';
  end if;
  if p_state is distinct from 'read' or jsonb_typeof(p_candidates) is distinct from 'array' then
    raise invalid_parameter_value using message = 'Leitura da busca inválida.';
  end if;
  if jsonb_array_length(p_candidates) not between 1 and 6 or octet_length(p_candidates::text)>16000 then
    raise invalid_parameter_value using message = 'Leitura da busca inválida.';
  end if;
  if not public.gestor_ia_agenda_concluir(p_id,p_revision,p_day,p_fetched_at,p_state,p_rows) then return false; end if;
  select * into agenda from public.gestor_ia_agendas a where a.id=p_id;
  if not ('descoberta'=any(agenda.categories) and extract(isodow from p_day)::integer=any(agenda.weekdays)) then
    raise invalid_parameter_value using message = 'Busca fora dos dias autorizados.';
  end if;
  select dados into cached from public.gestor_ia_meta_cache where cliente_id=agenda.client_id and conta_id=agenda.account_id and janela='historico';
  select least((cached#>>'{period,until}')::date,(now() at time zone z.name)::date-1) into closed_day
    from public.gestor_ia_meta_cache c join pg_catalog.pg_timezone_names z on z.name=c.dados->>'timezone'
    where c.cliente_id=agenda.client_id and c.conta_id=agenda.account_id and c.janela='conta';
  select least(closed_day,(p_fetched_at at time zone z.name)::date-1) into captured_day
    from pg_catalog.pg_timezone_names z where z.name=cached->>'timezone' and closed_day is not null;
  month_start:=date_trunc('month',captured_day)::date;
  month_end:=(month_start+interval '1 month')::date-1;
  for candidate in select item from jsonb_array_elements(p_candidates) as c(item) loop
    id := candidate->>'id';
    ad_id := candidate->>'adId';
    metrics := candidate->'metrics';
    options := candidate->'options';
    result_key := case candidate->>'objective' when 'leads' then 'leads' when 'mensagens' then 'messages' when 'compras' then 'purchases'
      when 'trafego' then 'landingPageViews' when 'engajamento' then 'postEngagements' end;
    if jsonb_typeof(candidate) is distinct from 'object' or candidate-array['id','name','objective','currency','period','comparisonPeriod','metrics','options','adId','adName']<>'{}'
      or coalesce(id,'') !~ '^(conta|[0-9]{1,32})$' or jsonb_typeof(candidate->'id') is distinct from 'string'
      or coalesce(candidate->>'currency','') !~ '^[A-Z]{3}$'
      or jsonb_typeof(candidate->'name') is distinct from 'string' or char_length(btrim(candidate->>'name')) not between 1 and 140
      or jsonb_typeof(metrics) is distinct from 'object' or jsonb_typeof(options) is distinct from 'object' or options='{}' then
      raise invalid_parameter_value using message = 'Leitura da busca inválida.';
    end if;
    if exists (select 1 from jsonb_each(metrics) as v(k,n) where
      case when jsonb_typeof(v.n)='number' then (v.n#>>'{}')::numeric not between 0 and 9007199254740991 else true end) then
      raise invalid_parameter_value using message = 'Medições da busca inválidas.';
    end if;
    if id='conta' then
      if not 'verba'=any(agenda.categories) or candidate->>'currency'<>'BRL' or candidate ?| array['adId','adName','comparisonPeriod']
        or captured_day is null or captured_day<month_start+2 or captured_day>=month_end
        or candidate#>>'{period,since}' is distinct from month_start::text or candidate#>>'{period,until}' is distinct from captured_day::text
        or not metrics ?& array['spend','recentSpend','projectedSpend','budget'] or metrics-array['spend','recentSpend','projectedSpend','budget']<>'{}'
        or options<>jsonb_build_object('verba',jsonb_build_array('spend','recentSpend','projectedSpend','budget'))
        or (metrics->>'budget')::numeric<=0 or (metrics->>'recentSpend')::numeric>(metrics->>'spend')::numeric
        or abs((metrics->>'projectedSpend')::numeric-round((metrics->>'spend')::numeric+(metrics->>'recentSpend')::numeric/3*(month_end-captured_day),2))>0.01
        or abs((metrics->>'projectedSpend')::numeric-(metrics->>'budget')::numeric)<(metrics->>'budget')::numeric*0.05 then
        raise invalid_parameter_value using message = 'Leitura de verba inválida.';
      end if;
    else
      comparison_end:=case when candidate ?| array['adId','adName'] then captured_day else closed_day end;
      if result_key is null or not coalesce(cached->'campaignMeta' ? id,false) or comparison_end is null
        or candidate#>>'{period,until}' is distinct from comparison_end::text or candidate#>>'{period,since}' is distinct from (comparison_end-2)::text
        or candidate#>>'{comparisonPeriod,until}' is distinct from (comparison_end-3)::text or candidate#>>'{comparisonPeriod,since}' is distinct from (comparison_end-5)::text then
        raise invalid_parameter_value using message = 'Recortes da busca inválidos.';
      end if;
      if candidate ?| array['adId','adName'] then
        if not 'criativo'=any(agenda.categories) or coalesce(ad_id,'') !~ '^[0-9]{1,32}$'
          or jsonb_typeof(candidate->'adId') is distinct from 'string' or jsonb_typeof(candidate->'adName') is distinct from 'string'
          or char_length(btrim(candidate->>'adName')) not between 1 and 120
          or not coalesce(cached->'activeAdIds' ? ad_id,false)
          or coalesce(cached->'campaignMeta'->id->>'effective_status',cached->'campaignMeta'->id->>'status') is distinct from 'ACTIVE'
          or not (select count(*)=6 and count(distinct row->>'date_start')=6 from jsonb_array_elements(
              case when jsonb_typeof(cached->'adDays')='array' then cached->'adDays' else '[]'::jsonb end) a(row)
            where row->>'ad_id'=ad_id and row->>'campaign_id'=id and row->>'account_currency'=candidate->>'currency'
              and row->>'date_start' between (comparison_end-5)::text and comparison_end::text)
          or not metrics ?& array['spend','ctr','previousCtr','frequency','previousFrequency']
          or metrics-array['spend','ctr','previousCtr','frequency','previousFrequency']<>'{}'
          or options<>jsonb_build_object('criativo',jsonb_build_array('ctr','previousCtr','frequency','previousFrequency'))
          or (metrics->>'spend')::numeric<=0 or (metrics->>'ctr')::numeric>=(metrics->>'previousCtr')::numeric
          or (metrics->>'frequency')::numeric<2 or (metrics->>'previousFrequency')::numeric<=0
          or (metrics->>'frequency')::numeric<=(metrics->>'previousFrequency')::numeric then
          raise invalid_parameter_value using message = 'Leitura de criativo inválida.';
        end if;
      elsif not metrics ?& array['spend','previousSpend','previousResults',result_key,'previousCost']
      or metrics-array['spend','previousSpend','previousResults',result_key,'cost','previousCost']<>'{}'
      or options-array['entrega','custo','escala']<>'{}'
      or (options ? 'entrega' and (options->'entrega'<>jsonb_build_array(result_key,'previousResults','spend','previousSpend')
        or (metrics->>result_key)::numeric >= (metrics->>'previousResults')::numeric))
      or (options ? 'custo' and (not 'custo'=any(agenda.categories) or options->'custo'<>jsonb_build_array('cost','previousCost',result_key,'previousResults')
        or not coalesce((metrics->>'cost')::numeric > (metrics->>'previousCost')::numeric,false)))
      or (options ? 'escala' and (not 'escala'=any(agenda.categories) or options->'escala'<>jsonb_build_array('cost','previousCost',result_key,'previousResults')
        or not coalesce((metrics->>'cost')::numeric < (metrics->>'previousCost')::numeric,false))) then
        raise invalid_parameter_value using message = 'Leitura da busca inválida.';
      end if;
    end if;
    if private.gestor_ia_busca_disponivel(agenda,candidate) and not exists (select 1 from jsonb_array_elements(selected) c(item) where c.item->>'id'=id) then
      selected:=selected||jsonb_build_array(candidate);
    end if;
  end loop;
  if selected<>'[]' then
    insert into private.gestor_ia_agenda_planos(agenda_id,day,agenda_revision,fetched_at,decision_ids,candidates)
    values(agenda.id,p_day,agenda.revision,p_fetched_at,array[]::uuid[],selected)
    on conflict (agenda_id,day) do update set candidates=excluded.candidates
      where gestor_ia_agenda_planos.state='queued' and gestor_ia_agenda_planos.agenda_revision=excluded.agenda_revision;
  end if;
  return true;
end;
$$;

create or replace function private.gestor_ia_vincular_aprendizado_agenda()
returns trigger language plpgsql security definer set search_path = '' as $$
declare context jsonb;
  discovery boolean := starts_with(new.source_key,'agenda:busca:');
begin
  new.payload:=new.payload-'agendaLearningId';
  if not discovery then
    new.payload:=new.payload-'agendaDiscovery'-'learningVersion'-'discoveryAd';
    if new.payload->'measurement' ? 'adId' then new.payload:=new.payload #- '{measurement,adId}'; end if;
  end if;
  if starts_with(new.source_key,'agenda:') then
    if new.origin is distinct from (case when discovery then 'ai' else 'signal' end)
      or new.owner_id is distinct from auth.uid() or private.gestor_ia_agenda_worker() is distinct from true then
      raise insufficient_privilege using message = 'Aviso reservado à rotina interna.';
    end if;
    context:=private.gestor_ia_aprendizado_correspondente(new);
    if context is not null then new.payload:=jsonb_set(new.payload,'{agendaLearningId}',context->'rootId'); end if;
  else
    new.payload:=new.payload-'entityEvidence'-'comparisonPeriod';
  end if;
  return new;
end;
$$;

create or replace trigger gestor_ia_memoria_agenda before insert on public.gestor_ia_decisoes
  for each row when (starts_with(new.source_key,'agenda:') or new.payload ?| array['agendaLearningId','entityEvidence','comparisonPeriod','agendaDiscovery','learningVersion','discoveryAd']
    or new.payload->'measurement' ? 'adId')
  execute function private.gestor_ia_vincular_aprendizado_agenda();

create or replace function public.gestor_ia_aprendizado_do_aviso(p_decision_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare alert public.gestor_ia_decisoes;
  root text;
begin
  if private.gestor_ia_agenda_humana() is distinct from true then
    raise insufficient_privilege using message = 'Aprendizado indisponível para esta sessão.';
  end if;
  select * into alert from public.gestor_ia_decisoes d where d.id=p_decision_id and d.owner_id=auth.uid()
    and (d.origin='signal' and starts_with(d.source_key,'agenda:') or d.origin='ai' and starts_with(d.source_key,'agenda:busca:'));
  root:=alert.payload->>'agendaLearningId';
  if root is null then return null; end if;
  if private.gestor_ia_agenda_scope(alert.client_id,alert.payload#>>'{measurement,accountId}') is distinct from true then
    raise insufficient_privilege using message = 'Aprendizado indisponível para esta conta.';
  end if;
  return private.gestor_ia_aprendizado_correspondente(alert,root);
end;
$$;

revoke all on function public.gestor_ia_agenda_concluir_com_busca(uuid,integer,date,timestamptz,text,jsonb,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.gestor_ia_agenda_concluir_com_busca(uuid,integer,date,timestamptz,text,jsonb,jsonb) to authenticated;

create function public.gestor_ia_status_agenda_ia(p_agenda_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare agenda public.gestor_ia_agendas;
  run private.gestor_ia_agenda_planos;
  status text;
begin
  if private.gestor_ia_agenda_humana() is distinct from true then
    raise insufficient_privilege using message = 'Agenda indisponível para esta sessão.';
  end if;
  select * into agenda from public.gestor_ia_agendas where id=p_agenda_id and owner_id=auth.uid();
  if not found or private.gestor_ia_agenda_scope(agenda.client_id,agenda.account_id) is distinct from true then return null; end if;
  select * into run from private.gestor_ia_agenda_planos where agenda_id=agenda.id order by day desc limit 1;
  if not found then return null; end if;
  status:=case when run.state in ('queued','reserved') and not private.gestor_ia_plano_vigente(agenda,run) then 'superseded'
    when run.state='reserved' and run.reserved_at<now()-interval '3 minutes' then 'failed' else run.state end;
  return jsonb_build_object('state',status,'day',run.day,'completedAt',run.completed_at,'discoveries',run.discovery_count,
    'plans',(select count(*) from jsonb_object_keys(run.plans)));
end;
$$;
revoke all on function public.gestor_ia_status_agenda_ia(uuid) from public,anon,authenticated,service_role;
grant execute on function public.gestor_ia_status_agenda_ia(uuid) to authenticated;

notify pgrst, 'reload schema';
