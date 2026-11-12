alter table public.gestor_ia_agendas
  drop constraint gestor_ia_agendas_categories_check,
  add constraint gestor_ia_agendas_categories_check check (
    cardinality(categories) <= 4 and array_position(categories, null) is null
    and categories <@ array['escala','custo','verba','criativo']
  );

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
  inserted integer;
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
    on conflict (owner_id,client_id,source_key) do nothing;
    get diagnostics inserted = row_count;
    count_saved := count_saved+inserted;
  end loop;
  update public.gestor_ia_agendas set last_day=p_day,last_run_at=now(),last_fetched_at=current_read,last_count=count_saved,
    last_state=case when p_state='no_data' then 'no_data' when count_saved>0 then 'published'
      when p_rows<>'[]'::jsonb then 'unchanged' else 'no_signals' end where id=agenda.id;
  return true;
end;
$$;

create or replace function private.gestor_ia_vincular_aprendizado_agenda()
returns trigger language plpgsql security definer set search_path = '' as $$
declare context jsonb;
begin
  new.payload := new.payload - 'agendaLearningId';
  if starts_with(new.source_key, 'agenda:') then
    if new.origin is distinct from 'signal' or new.owner_id is distinct from auth.uid() or private.gestor_ia_agenda_worker() is distinct from true then
      raise insufficient_privilege using message = 'Aviso reservado à rotina interna.';
    end if;
    context := private.gestor_ia_aprendizado_correspondente(new);
    if context is not null then
      new.payload := jsonb_set(new.payload, '{agendaLearningId}', context->'rootId');
    end if;
  else
    new.payload := new.payload - 'entityEvidence' - 'comparisonPeriod';
  end if;
  return new;
end;
$$;

create or replace trigger gestor_ia_memoria_agenda before insert on public.gestor_ia_decisoes
  for each row when (starts_with(new.source_key, 'agenda:') or new.payload ?| array['agendaLearningId','entityEvidence','comparisonPeriod'])
  execute function private.gestor_ia_vincular_aprendizado_agenda();
