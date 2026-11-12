create table private.gestor_ia_aprendizados (
  memory_id uuid primary key references public.atlas_memories(id) on delete cascade,
  decision_id uuid not null references public.gestor_ia_decisoes(id) on delete cascade,
  verdict_at timestamptz not null,
  account_id text check (account_id ~ '^act_[0-9]{1,32}$'),
  campaign_id text check (campaign_id ~ '^[0-9]{1,32}$'),
  objective text,
  unique (decision_id, verdict_at)
);

alter table private.gestor_ia_aprendizados enable row level security;
revoke all on private.gestor_ia_aprendizados from public, anon, authenticated, service_role;

create function private.gestor_ia_veredito_em(p_history jsonb)
returns timestamptz language sql stable security invoker set search_path = '' as $$
  select (item.value->>'at')::timestamptz
  from jsonb_array_elements(p_history) with ordinality as item(value, position)
  where item.value->>'event' = 'verdict' order by item.position desc limit 1;
$$;

create function private.gestor_ia_memoria_ativa(p_root uuid, p_owner uuid, p_client uuid)
returns setof public.atlas_memories language sql stable security invoker set search_path = '' as $$
  with recursive versions(id, state, version) as (
    select m.id, m.state, m.version from public.atlas_memories m
    where m.id = p_root and m.owner_id = p_owner and m.client_id = p_client
    union all
    select child.id, child.state, child.version from versions parent
    cross join lateral (
      select m.id, m.state, m.version, count(*) over () as siblings
      from public.atlas_memories m where m.replaces_id = parent.id and m.owner_id = p_owner and m.client_id = p_client
        and m.version::bigint = parent.version::bigint + 1
    ) child where parent.state = 'replaced' and child.siblings = 1
  )
  select m.* from versions v join public.atlas_memories m on m.id = v.id
  where v.state = 'active' and m.source = 'user_confirmation' and not m.team_shared;
$$;

create function public.gestor_ia_salvar_aprendizado(p_decision_id uuid, p_revision integer, p_content text, p_confirmed boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare source public.gestor_ia_decisoes;
  linked private.gestor_ia_aprendizados;
  current_note public.atlas_memories;
  verdict_time timestamptz;
  account text;
  campaign text;
  metric text;
  note jsonb;
begin
  if auth.jwt()->>'session_id' is null or auth.jwt()->>'planeje_server_delegate' is not null
    or public.atlas_is_owner() is distinct from true or private.gestor_ia_modulo_decisao('assistant') is distinct from true then
    raise insufficient_privilege using message = 'Aprendizado indisponível para esta sessão.';
  end if;
  select * into source from public.gestor_ia_decisoes d where d.id = p_decision_id and d.owner_id = auth.uid() for update;
  if not found or private.gestor_ia_pode_registrar_decisao(source.client_id) is distinct from true then
    raise insufficient_privilege using message = 'Aprendizado indisponível para esta decisão.';
  end if;
  verdict_time := private.gestor_ia_veredito_em(source.history);
  if source.revision is distinct from p_revision or source.verdict is null or verdict_time is null then
    raise serialization_failure using message = 'O veredito mudou. Reabra a decisão antes de confirmar.';
  end if;
  if p_confirmed is distinct from true or char_length(btrim(coalesce(p_content, ''))) not between 1 and 4000 then
    raise invalid_parameter_value using message = 'Confirme a anotação antes de salvar.';
  end if;

  select * into linked from private.gestor_ia_aprendizados l where l.decision_id = source.id and l.verdict_at = verdict_time;
  if found then
    select * into current_note from private.gestor_ia_memoria_ativa(linked.memory_id, source.owner_id, source.client_id);
    if not found then raise invalid_parameter_value using message = 'O aprendizado deste veredito foi retirado do uso privado.'; end if;
    if current_note.content <> btrim(p_content) then
      raise serialization_failure using message = 'O veredito já tem um aprendizado. Corrija a anotação na Memória.';
    end if;
    return to_jsonb(current_note) || jsonb_build_object('agendaEligible', linked.account_id is not null and linked.objective is not null);
  end if;

  campaign := source.payload#>>'{measurement,campaignId}';
  metric := source.payload#>>'{measurement,objective}';
  if campaign is not null and campaign !~ '^[0-9]{1,32}$' then campaign := null; metric := null; end if;
  if metric not in ('leads','mensagens','compras','trafego','engajamento','alcance') then metric := null; end if;
  if source.payload#>>'{measurement,accountId}' is not null then
    select 'act_' || regexp_replace(a.meta_account_id::text, '^act_', '') into account
    from public.cliente_meta_accounts a where a.cliente_id = source.client_id and a.is_active
      and 'act_' || regexp_replace(a.meta_account_id::text, '^act_', '') = source.payload#>>'{measurement,accountId}'
      and source.payload#>>'{measurement,accountId}' ~ '^act_[0-9]{1,32}$' limit 1;
  elsif campaign is not null and metric is not null then
    -- A sugestão legada só ganha conta quando uma leitura salva comprova a campanha sem ambiguidade.
    select case when count(distinct h.conta_id) = 1 then min(h.conta_id) end into account
    from public.cliente_meta_accounts a join public.gestor_ia_meta_cache h on h.cliente_id = a.cliente_id
      and h.conta_id = 'act_' || regexp_replace(a.meta_account_id::text, '^act_', '') and h.janela = 'historico'
    where a.cliente_id = source.client_id and a.is_active and h.conta_id ~ '^act_[0-9]{1,32}$'
      and jsonb_typeof(h.dados->'campaignMeta') = 'object' and (h.dados->'campaignMeta') ? campaign;
  end if;

  note := public.atlas_save_memory(btrim(p_content), source.client_id, true, null);
  insert into private.gestor_ia_aprendizados (memory_id, decision_id, verdict_at, account_id, campaign_id, objective)
    values ((note->>'id')::uuid, source.id, verdict_time, account, campaign, metric);
  return note || jsonb_build_object('agendaEligible', account is not null and metric is not null);
end;
$$;

create function private.gestor_ia_aprendizado_correspondente(p_alert public.gestor_ia_decisoes, p_root text default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select case when p_root is null then jsonb_build_object('rootId', l.memory_id)
    else jsonb_build_object('decisionId', prior.id, 'title', prior.title, 'verdict', prior.verdict, 'verdictAt', l.verdict_at,
      'memoryId', m.id, 'version', m.version, 'content', m.content) end
  from private.gestor_ia_aprendizados l join public.gestor_ia_decisoes prior on prior.id = l.decision_id
  cross join lateral private.gestor_ia_memoria_ativa(l.memory_id, prior.owner_id, prior.client_id) m
  where prior.owner_id = (p_alert).owner_id and prior.client_id = (p_alert).client_id and prior.id <> (p_alert).id
    and prior.verdict is not null and private.gestor_ia_veredito_em(prior.history) = l.verdict_at
    and l.account_id = (p_alert).payload#>>'{measurement,accountId}'
    and l.campaign_id is not distinct from (p_alert).payload#>>'{measurement,campaignId}'
    and prior.payload#>>'{measurement,adId}' is not distinct from (p_alert).payload#>>'{measurement,adId}'
    and l.objective = (p_alert).payload#>>'{measurement,objective}'
    and (p_root is null or l.memory_id::text = p_root)
  order by l.verdict_at desc, l.memory_id limit 1;
$$;

create function private.gestor_ia_vincular_aprendizado_agenda()
returns trigger language plpgsql security definer set search_path = '' as $$
declare context jsonb;
begin
  new.payload := new.payload - 'agendaLearningId';
  if new.origin = 'signal' and starts_with(new.source_key, 'agenda:') and new.owner_id = auth.uid()
    and private.gestor_ia_agenda_worker() is true then
    context := private.gestor_ia_aprendizado_correspondente(new);
    if context is not null then
      new.payload := jsonb_set(new.payload, '{agendaLearningId}', context->'rootId');
    end if;
  end if;
  return new;
end;
$$;

create trigger gestor_ia_memoria_agenda before insert on public.gestor_ia_decisoes
  for each row when (starts_with(new.source_key, 'agenda:') or new.payload ? 'agendaLearningId')
  execute function private.gestor_ia_vincular_aprendizado_agenda();

create function public.gestor_ia_aprendizado_do_aviso(p_decision_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare alert public.gestor_ia_decisoes;
  root text;
begin
  if auth.jwt()->>'session_id' is null or auth.jwt()->>'planeje_server_delegate' is not null
    or public.atlas_is_owner() is distinct from true or private.gestor_ia_modulo_decisao('assistant') is distinct from true then
    raise insufficient_privilege using message = 'Aprendizado indisponível para esta sessão.';
  end if;
  select * into alert from public.gestor_ia_decisoes d where d.id = p_decision_id and d.owner_id = auth.uid()
    and d.origin = 'signal' and starts_with(d.source_key, 'agenda:');
  root := alert.payload->>'agendaLearningId';
  if root is null then return null; end if;
  if private.gestor_ia_agenda_scope(alert.client_id, alert.payload#>>'{measurement,accountId}') is distinct from true then
    raise insufficient_privilege using message = 'Aprendizado indisponível para esta conta.';
  end if;
  return private.gestor_ia_aprendizado_correspondente(alert, root);
end;
$$;

revoke all on function private.gestor_ia_veredito_em(jsonb), private.gestor_ia_memoria_ativa(uuid,uuid,uuid),
  private.gestor_ia_aprendizado_correspondente(public.gestor_ia_decisoes,text), private.gestor_ia_vincular_aprendizado_agenda(),
  public.gestor_ia_salvar_aprendizado(uuid,integer,text,boolean), public.gestor_ia_aprendizado_do_aviso(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.gestor_ia_salvar_aprendizado(uuid,integer,text,boolean),
  public.gestor_ia_aprendizado_do_aviso(uuid) to authenticated;

notify pgrst, 'reload schema';
