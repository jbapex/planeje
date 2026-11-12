create table public.gestor_ia_decisoes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id uuid not null references public.clientes(id) on delete cascade,
  source_key text not null check (char_length(btrim(source_key)) between 1 and 512),
  origin text not null check (origin in ('signal', 'ai', 'note')),
  title text not null check (char_length(btrim(title)) between 1 and 110),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 12000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'dismissed')),
  task_id uuid references public.tarefas(id) on delete set null,
  verdict text check (verdict in ('improved', 'not_improved', 'inconclusive')),
  verdict_note text,
  history jsonb not null default '[]'::jsonb,
  revision integer not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  unique (owner_id, client_id, source_key),
  check (status = 'approved' or (task_id is null and verdict is null)),
  check ((verdict is null and verdict_note is null) or
    (verdict is not null and verdict_note is not null and char_length(btrim(verdict_note)) between 1 and 800))
);

create index gestor_ia_decisoes_cliente on public.gestor_ia_decisoes (client_id);
create index gestor_ia_decisoes_tarefa on public.gestor_ia_decisoes (task_id) where task_id is not null;

create function private.gestor_ia_modulo_decisao(p_module text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select u.is_enabled from public.user_module_permissions u where u.user_id = auth.uid() and u.module_name::text = p_module),
    (select g.is_enabled from public.module_settings g where g.module_name::text = p_module), true);
$$;

create function private.gestor_ia_pode_registrar_decisao(p_client_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.planeje_current_account_access()
    and public.central_trafego_can_access_client(p_client_id)
    and private.gestor_ia_modulo_decisao('paid_traffic')
    and exists (select 1 from public.clientes where id = p_client_id and etapa = 'closed')
    and staff.role in ('admin', 'superadmin', 'colaborador')
    and (staff.role = 'superadmin' or not exists (
      select 1 from (values ('meta_resumo'), ('valor')) as field(name)
      where not coalesce(
        (select u.can_view from public.user_client_field_permissions u where u.user_id = auth.uid() and u.field_name::text = field.name),
        (select r.can_view from public.client_field_permissions r where r.role::text = staff.role and r.field_name::text = field.name), true)
    ))
  from (select private.planeje_staff_role() as role) staff;
$$;

create function private.gestor_ia_escopo_tarefas()
returns text language sql stable security definer set search_path = '' as $$
  select case
    when not public.planeje_current_account_access() or not private.gestor_ia_modulo_decisao('tasks') then 'none'
    when private.planeje_staff_role() = 'colaborador' and exists (
      select 1 from public.user_module_access a where a.user_id = auth.uid()
        and a.module_name::text = 'tasks' and a.access_level::text = 'responsible'
    ) then 'responsible'
    else 'all'
  end;
$$;

revoke all on function private.gestor_ia_modulo_decisao(text), private.gestor_ia_pode_registrar_decisao(uuid),
  private.gestor_ia_escopo_tarefas() from public, anon, authenticated;
grant execute on function private.gestor_ia_pode_registrar_decisao(uuid), private.gestor_ia_escopo_tarefas() to authenticated;

alter table public.gestor_ia_decisoes enable row level security;
revoke all on public.gestor_ia_decisoes from public, anon, authenticated;
grant select on public.gestor_ia_decisoes to authenticated;
grant insert (client_id, source_key, origin, title, payload), update (status, task_id, verdict, verdict_note)
  on public.gestor_ia_decisoes to authenticated;

create policy gestor_ia_decisoes_privadas on public.gestor_ia_decisoes for all to authenticated
  using (owner_id = (select auth.uid()) and private.gestor_ia_pode_registrar_decisao(client_id))
  with check (owner_id = (select auth.uid()) and private.gestor_ia_pode_registrar_decisao(client_id));

create function private.gestor_ia_registrar_transicao()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  event text;
  task_scope text;
  task_status text;
  terminal boolean;
begin
  if new.status is distinct from old.status then
    if not ((old.status = 'pending' and new.status in ('approved', 'dismissed')) or new.status = 'pending')
      or num_nonnulls(new.task_id, new.verdict, new.verdict_note) > 0 then
      raise check_violation using message = 'Esta decisão não pode mudar para a etapa escolhida.';
    end if;
    event := case when new.status = 'pending' then 'reopened' else new.status end;
  elsif new.task_id is distinct from old.task_id then
    if new.status <> 'approved' or (old.verdict is not null and new.task_id is not null)
      or row(new.verdict, new.verdict_note) is distinct from row(old.verdict, old.verdict_note) then
      raise check_violation using message = 'Aprove a decisão antes de vincular uma tarefa.';
    end if;
    event := case when new.task_id is null then 'unlinked' else 'linked' end;
  elsif row(new.verdict, new.verdict_note) is distinct from row(old.verdict, old.verdict_note) then
    if new.status <> 'approved' or old.verdict is not null or new.verdict is null or new.task_id is null then
      raise check_violation using message = 'Conclua a tarefa antes de registrar o veredito.';
    end if;
    event := 'verdict';
  else
    return old;
  end if;

  if event in ('linked', 'verdict') then
    task_scope := private.gestor_ia_escopo_tarefas();
    -- A leitura usa a RLS de Tarefas da sessão que está operando a decisão.
    select lower(btrim(t.status::text)), s.is_terminal into task_status, terminal
      from public.tarefas t left join public.task_statuses s on s.value = t.status
      where t.id = new.task_id and t.client_id = new.client_id and t.type::text = 'paid_traffic'
        and (task_scope = 'all' or (task_scope = 'responsible' and (select auth.uid()) = any(t.assignee_ids)));
    if not found then raise insufficient_privilege using message = 'Tarefa indisponível para esta decisão.'; end if;
    if event = 'verdict' and (coalesce(task_status, '') in ('canceled', 'cancelled', 'cancelado', 'cancelada', 'archived', 'arquivado', 'arquivada')
      or not (coalesce(terminal, false) or coalesce(task_status, '') in ('completed', 'published', 'done', 'concluida', 'concluída', 'concluido', 'concluído'))) then
      raise check_violation using message = 'Conclua a tarefa antes de registrar o veredito.';
    end if;
  end if;

  new.revision := old.revision + 1;
  new.history := old.history || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
    'event', event, 'at', statement_timestamp(), 'task_id', coalesce(new.task_id, old.task_id),
    'verdict', case when event = 'verdict' then new.verdict end,
    'note', case when event = 'verdict' then btrim(new.verdict_note) end
  )));
  return new;
end;
$$;

revoke all on function private.gestor_ia_registrar_transicao() from public, anon, authenticated;
create trigger gestor_ia_decisao_transicao before update on public.gestor_ia_decisoes
  for each row execute function private.gestor_ia_registrar_transicao();
