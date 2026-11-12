begin;
alter table public.cliente_atend_conversas add column crm_ia_runtime jsonb not null default '{}';
create function private.crm_ia_agent_state_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user<>'service_role' and not pg_has_role(current_user,(select pg_get_userbyid(p.proowner) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname='crm_ia_agent_state_guard' and p.pronargs=0),'USAGE') then
  new.crm_ia_runtime=case when tg_op='UPDATE' then old.crm_ia_runtime else '{}'::jsonb end;
 end if;return new;
end $$;
revoke all on function private.crm_ia_agent_state_guard() from public,anon,authenticated;
create trigger crm_ia_agent_state_guard before insert or update on public.cliente_atend_conversas for each row execute function private.crm_ia_agent_state_guard();
alter table public.cliente_atend_ia_log add column if not exists whatsapp_config_id uuid references public.cliente_whatsapp_config(id);
create table planeje_private.crm_ia_agent_runs (
 id uuid primary key,cliente_id uuid not null references public.clientes(id),channel_id uuid not null references public.cliente_whatsapp_config(id),
 contact_id uuid not null references public.cliente_whatsapp_contact(id),lead_id uuid not null references public.leads(id),agent_id uuid not null references public.cliente_atend_ia_agentes(id),
 actor_id uuid not null references public.profiles(id),mode text not null check(mode in ('responder','followup')),
 message_id text not null,snapshot jsonb not null,status text not null default 'claimed' check(status in ('claimed','queued','cancelled','failed')),
 result jsonb,created_at timestamptz not null default clock_timestamp(),unique(cliente_id,channel_id,mode,message_id)
);
create table planeje_private.crm_ia_distribution_state(cliente_id uuid primary key references public.clientes(id),turn bigint not null default 0);
alter table planeje_private.crm_ia_agent_runs enable row level security;
alter table planeje_private.crm_ia_distribution_state enable row level security;
revoke all on planeje_private.crm_ia_agent_runs,planeje_private.crm_ia_distribution_state from public,anon,authenticated;
grant all on planeje_private.crm_ia_agent_runs,planeje_private.crm_ia_distribution_state to service_role;
alter table public.crm_ia_outbox drop constraint if exists crm_ia_outbox_kind_check;
alter table public.crm_ia_outbox add constraint crm_ia_outbox_kind_check check(kind in ('manual','followup','reminder','reply'));
alter table public.crm_ia_outbox add column agent_run_id uuid references planeje_private.crm_ia_agent_runs(id);
alter table public.crm_ia_outbox add column appointment_id uuid references public.crm_ia_appointments(id);

create function private.crm_ia_agent_actor(p_client uuid,p_actor uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(exists(select 1 from public.profiles p join public.clientes c on c.id=p_client where p.id=p_actor and p.status='active'
  and p.role in ('admin','superadmin','colaborador')
  and coalesce((select u.is_enabled from public.user_module_permissions u where u.user_id=p.id and u.module_name::text='crm'),
   (select m.is_enabled from public.module_settings m where m.module_name::text='crm'),true)
  and (p.role in ('admin','superadmin') or (
   (not exists(select 1 from public.user_module_access a where a.user_id=p.id and a.module_name::text='clients' and a.access_level::text='responsible') or c.responsavel::text=p.id::text)
   and (not exists(select 1 from public.user_module_access a where a.user_id=p.id and a.module_name::text='crm' and a.access_level::text='responsible') or c.responsavel::text=p.id::text
     or exists(select 1 from public.leads l where l.cliente_id=p_client and l.responsavel_id=p.id))))),false)
$$;
create function private.crm_ia_agent_window(p_rules jsonb,p_zone text) returns boolean
language sql stable set search_path='' as $$
 select coalesce(jsonb_array_length(p_rules->'janelas'),0)=0 or exists(select 1 from jsonb_array_elements(p_rules->'janelas') w
  where w->'dias' @> jsonb_build_array(extract(dow from clock_timestamp() at time zone p_zone)::integer)
   and (clock_timestamp() at time zone p_zone)::time >= (w->>'inicio')::time and (clock_timestamp() at time zone p_zone)::time < (w->>'fim')::time)
$$;

create function public.crm_ia_agent_intake(p_client uuid,p_channel uuid,p_contact uuid,p_text text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cfg public.crm_ia_config;c public.cliente_whatsapp_contact;l public.leads;conversation public.cliente_atend_conversas;
 entry jsonb;distribution jsonb;candidate jsonb;target jsonb;people jsonb:='[]';source text;actor uuid;owner_key uuid;ids uuid[];turn_n bigint;load_n bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended('crm-ia:'||p_client::text,0));
 select * into c from public.cliente_whatsapp_contact where id=p_contact and cliente_id=p_client;
 target=planeje_private.crm_ia_delivery_target(p_client,p_channel,p_contact);
 if c.id is null or c.from_jid !~ '^[0-9]+@(s\.whatsapp\.net|c\.us|lid)$' or not exists(select 1 from public.cliente_whatsapp_config
  where id=p_channel and cliente_id=p_client and archived_at is null and provider='uazapi') then raise exception 'crm_ia_scope';end if;
 select * into cfg from public.crm_ia_config where cliente_id=p_client;
 actor=cfg.updated_by;
 if actor is null then select created_by into actor from public.cliente_atend_ia_agentes where cliente_id=p_client and funil ? 'crm_ia' order by created_at limit 1;end if;
 if cfg.data#>>'{attendance,auto_send}' is distinct from 'true' or not public.cliente_atend_loja_habilitada(p_client)
  or not private.crm_ia_agent_actor(p_client,actor) then
  update public.cliente_atend_conversas set ia_followup_due_at=null,ia_followup_delivery_state='cancelled' where cliente_id=p_client and contact_id=p_contact and crm_ia_runtime->>'active'='true' and ia_followup_due_at is not null;
  return '{"handled":true,"skipped":"disabled_or_owner"}';end if;
 if target->>'allowed'<>'true' or planeje_private.crm_ia_delivery_config(p_client,target->>'phone',cfg.revision,true) is not null then return '{"handled":true,"skipped":"test_number_not_allowed"}';end if;
 select array_agg(id) into ids from public.leads where cliente_id=p_client and crm_ia_archived_at is null
  and (crm_ia_contact_id=p_contact or (private.crm_ia_phone(whatsapp)<>'' and private.crm_ia_phone(whatsapp)=private.crm_ia_phone(coalesce(c.phone,c.from_jid))));
 if coalesce(cardinality(ids),0)>1 then return '{"handled":true,"skipped":"ambiguous_lead"}';end if;
 select * into l from public.leads where id=ids[1];
 select value into entry from jsonb_array_elements(coalesce(cfg.data#>'{entry,channels}','[]')) e where e->>'channel_id'=p_channel::text and e->>'enabled'='true';
 if l.id is null then
  if cfg.data#>>'{entry,enabled}' is distinct from 'true' or entry is null or (entry->>'mode'='phrase' and
   (nullif(btrim(entry->>'phrase'),'') is null or position(lower(entry->>'phrase') in lower(coalesce(p_text,'')))=0)) then return '{"handled":true,"skipped":"entry_disabled"}';end if;
  if not exists(select 1 from public.crm_stages s join public.crm_pipelines p on p.id=s.pipeline_id where s.id=(entry->>'stage_id')::uuid
   and p.id=(entry->>'pipeline_id')::uuid and p.cliente_id=p_client) then raise exception 'crm_ia_entry_scope';end if;
  insert into public.leads(cliente_id,nome,whatsapp,pipeline_id,stage_id,status,status_vida,crm_ia_contact_id,etiquetas,origem)
   select p_client,coalesce(nullif(c.sender_name,''),c.phone,c.from_jid),private.crm_ia_phone(coalesce(c.phone,c.from_jid)),s.pipeline_id,s.id,s.nome,'ativo',p_contact,
    coalesce(entry->'tags','[]'),coalesce(nullif(c.origin_source,''),'whatsapp') from public.crm_stages s where s.id=(entry->>'stage_id')::uuid returning * into l;
 else update public.leads set crm_ia_contact_id=p_contact where id=l.id and crm_ia_contact_id is null returning * into l; if not found then select * into l from public.leads where id=ids[1];end if;end if;
 distribution=cfg.data->'distribution';source=case when c.origin_source='meta_ads' then 'meta' when c.origin_source='site' then 'site' else 'whatsapp' end;
 if l.responsavel_id is null and distribution->>'enabled'='true' and coalesce(distribution->'sources','[]') ? source
  and (cardinality(ids) is null or distribution->>'include_unassigned'='true') then
  for candidate in select value from jsonb_array_elements(coalesce(distribution->'people','[]')) loop
   owner_key=(candidate->>'owner_id')::uuid;
   if private.crm_ia_agent_actor(p_client,owner_key) then
    select count(*) into load_n from public.leads where cliente_id=p_client and responsavel_id=owner_key and crm_ia_archived_at is null and coalesce(status_vida,'ativo')='ativo';
    if coalesce((candidate->>'limit')::integer,0)=0 or load_n<(candidate->>'limit')::integer then
     people=people||jsonb_build_array(candidate||jsonb_build_object('load',load_n));end if;
   end if;
  end loop;
  if jsonb_array_length(people)>0 then
   insert into planeje_private.crm_ia_distribution_state(cliente_id,turn) values(p_client,1) on conflict(cliente_id) do update set turn=planeje_private.crm_ia_distribution_state.turn+1 returning turn-1 into turn_n;
   if distribution->>'strategy'='least_loaded' then select (p->>'owner_id')::uuid into owner_key from jsonb_array_elements(people) p order by (p->>'load')::numeric/greatest(1,least(5,coalesce((p->>'weight')::integer,1))),p->>'owner_id' limit 1;
   else select array_agg((p->>'owner_id')::uuid order by p->>'owner_id',weight) into ids from jsonb_array_elements(people) p cross join lateral generate_series(1,greatest(1,least(5,coalesce((p->>'weight')::integer,1)))) weight;
    owner_key=ids[1+(turn_n%cardinality(ids))::integer];end if;
  else owner_key=nullif(distribution->>'fallback_owner_id','')::uuid;end if;
  if owner_key is not null and private.crm_ia_agent_actor(p_client,owner_key) then update public.leads set responsavel_id=owner_key,updated_at=clock_timestamp() where id=l.id returning * into l;end if;
 end if;
 insert into public.cliente_atend_conversas(cliente_id,contact_id,status,ia_pausada) values(p_client,p_contact,'esperando',false) on conflict(cliente_id,contact_id) do nothing;
 select * into conversation from public.cliente_atend_conversas where cliente_id=p_client and contact_id=p_contact;
 if conversation.crm_ia_runtime->>'closed'='true' and not conversation.ia_pausada and cfg.data#>>'{attendance,restart_triage}'='true' and entry is not null then
  l=jsonb_populate_record(null::public.leads,private.crm_ia_move(p_client,l.id,(entry->>'stage_id')::uuid,'Reinício de triagem autorizado',l.updated_at::text,actor));
  update public.cliente_atend_conversas set crm_ia_runtime='{}',status='esperando',ia_pausada=false,updated_at=clock_timestamp() where id=conversation.id returning * into conversation;
 end if;
 return jsonb_build_object('handled',true,'lead',to_jsonb(l),'conversation',to_jsonb(conversation),'contact',to_jsonb(c),'config',to_jsonb(cfg),'actor_id',actor);
end $$;

create function public.crm_ia_agent_begin(p_client uuid,p_channel uuid,p_contact uuid,p_lead uuid,p_agent uuid,p_mode text,p_message text,p_expected jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cfg public.crm_ia_config;a public.cliente_atend_ia_agentes;l public.leads;c public.cliente_atend_conversas;r planeje_private.crm_ia_agent_runs;
 key uuid:=md5(p_client::text||':'||p_channel::text||':'||p_mode||':'||p_message)::uuid;rules jsonb;target jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('crm-ia:'||p_client::text,0));
 select * into r from planeje_private.crm_ia_agent_runs where id=key;
 if found then return jsonb_build_object('claimed',false,'id',key,'result',r.result);end if;
 if p_mode not in ('responder','followup') or length(p_message) not between 1 and 300 then raise exception 'crm_ia_request';end if;
 select * into cfg from public.crm_ia_config where cliente_id=p_client for share;
 select * into a from public.cliente_atend_ia_agentes where id=p_agent and cliente_id=p_client for share;rules=a.funil->'crm_ia';
 select * into l from public.leads where id=p_lead and cliente_id=p_client and crm_ia_contact_id=p_contact for share;
 select * into c from public.cliente_atend_conversas where cliente_id=p_client and contact_id=p_contact for update;
 if p_mode='followup' and (c.crm_ia_runtime->>'config_revision' is distinct from cfg.revision::text
  or c.crm_ia_runtime->>'followup_agent_id' is distinct from a.id::text
  or (c.crm_ia_runtime->>'followup_agent_updated_at')::timestamptz is distinct from a.updated_at) then
  update public.cliente_atend_conversas set ia_followup_due_at=null,ia_followup_delivery_state='cancelled' where id=c.id;
  return '{"claimed":false,"skipped":"automation_changed"}';end if;
 target=planeje_private.crm_ia_delivery_target(p_client,p_channel,p_contact);
 if target->>'allowed'<>'true' or not private.crm_ia_agent_actor(p_client,(p_expected->>'actor_id')::uuid)
  or cfg.revision is distinct from (p_expected->>'config_revision')::uuid or cfg.data#>>'{attendance,auto_send}' is distinct from 'true'
  or not a.ativo or not a.auto_responder or a.updated_at is distinct from (p_expected->>'agent_updated_at')::timestamptz
  or l.id is null or c.id is null or c.ia_pausada or c.status='finalizado'
  or l.updated_at is distinct from (p_expected->>'lead_updated_at')::timestamptz or c.updated_at is distinct from (p_expected->>'conversation_updated_at')::timestamptz
  or rules->>'pipeline_id' is distinct from l.pipeline_id::text or not coalesce(rules->'stage_ids','[]') ? l.stage_id::text
  or (p_mode='followup' and (rules->>'tipo'<>'followup' or c.ia_followup_due_at is null or c.ia_followup_due_at>clock_timestamp()
    or c.crm_ia_runtime->>'config_revision' is distinct from cfg.revision::text))
  or (not coalesce((p_expected->>'concierge')::boolean,false) and not private.crm_ia_agent_window(rules,coalesce(cfg.data#>>'{availability,timezone}','America/Sao_Paulo')))
  or planeje_private.crm_ia_delivery_config(p_client,target->>'phone',cfg.revision,true) is not null then return '{"claimed":false,"skipped":"snapshot_changed"}';end if;
 insert into planeje_private.crm_ia_agent_runs(id,cliente_id,channel_id,contact_id,lead_id,agent_id,actor_id,mode,message_id,snapshot)
 values(key,p_client,p_channel,p_contact,p_lead,p_agent,(p_expected->>'actor_id')::uuid,p_mode,p_message,p_expected);
 return jsonb_build_object('claimed',true,'id',key);
end $$;

create function public.crm_ia_agent_fail(p_run uuid) returns void language plpgsql security definer set search_path='' as $$
declare r planeje_private.crm_ia_agent_runs;
begin
 update planeje_private.crm_ia_agent_runs set status='failed' where id=p_run and status='claimed' returning * into r;
 if r.mode='followup' then update public.cliente_atend_conversas set ia_followup_due_at=null,ia_followup_delivery_state='failed'
  where cliente_id=r.cliente_id and contact_id=r.contact_id and updated_at=(r.snapshot->>'conversation_updated_at')::timestamptz;end if;
end $$;

create function public.crm_ia_agent_note_api_echo(p_client uuid,p_channel uuid,p_contact uuid,p_message text,p_expected timestamptz)
returns boolean language plpgsql security definer set search_path='' as $$
declare c public.cliente_atend_conversas;marker jsonb;
begin
 select * into c from public.cliente_atend_conversas where cliente_id=p_client and contact_id=p_contact for update;
 if c.id is null or c.crm_ia_runtime->>'active' is distinct from 'true' or length(coalesce(p_message,'')) not between 1 and 300
  or c.updated_at is distinct from p_expected or not exists(select 1 from public.cliente_whatsapp_config where id=p_channel and cliente_id=p_client and archived_at is null) then return false;end if;
 marker=c.crm_ia_runtime->'pending_api_echo';
 if marker->>'message_id'=p_message and marker->>'channel_id'=p_channel::text and (marker->>'version')::timestamptz=c.updated_at then return true;end if;
 if c.ia_pausada then return false;end if;
 marker=jsonb_build_object('message_id',p_message,'channel_id',p_channel,'version',now(),'previous_status',c.status,
  'previous_paused',c.ia_pausada,'previous_due_at',c.ia_followup_due_at,'previous_delivery_state',c.ia_followup_delivery_state);
 update public.cliente_atend_conversas set ia_pausada=true,ia_followup_due_at=null,ia_followup_delivery_state='cancelled',
  crm_ia_runtime=jsonb_set(crm_ia_runtime,'{pending_api_echo}',marker,true),updated_at=now() where id=c.id;
 return true;
end $$;

alter function public.crm_ia_legacy_delivery_recover() rename to crm_ia_legacy_delivery_recover_base;
create function public.crm_ia_legacy_delivery_recover() returns jsonb
language plpgsql security definer set search_path='' as $$
declare legacy jsonb;expired planeje_private.crm_ia_agent_runs;total integer:=0;
begin
 legacy=public.crm_ia_legacy_delivery_recover_base();
 for expired in update planeje_private.crm_ia_agent_runs set status='failed',result='{"queued":false,"skipped":"run_expired"}'::jsonb
   where status='claimed' and created_at<clock_timestamp()-interval '5 minutes' returning * loop
  total=total+1;
  if expired.mode='followup' then update public.cliente_atend_conversas set ia_followup_due_at=null,ia_followup_delivery_state='failed',updated_at=clock_timestamp()
   where cliente_id=expired.cliente_id and contact_id=expired.contact_id and updated_at=(expired.snapshot->>'conversation_updated_at')::timestamptz;end if;
 end loop;
 return legacy||jsonb_build_object('agent_runs',total);
end $$;

create function public.crm_ia_agent_slots(p_client uuid,p_agent uuid,p_lead uuid,p_date date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.cliente_atend_ia_agentes;l public.leads;owner_key uuid;
begin
 select * into a from public.cliente_atend_ia_agentes where id=p_agent and cliente_id=p_client and ativo;
 select * into l from public.leads where id=p_lead and cliente_id=p_client and crm_ia_archived_at is null;
 if a.id is null or l.id is null or a.funil#>>'{crm_ia,tipo}'<>'agendamento' then return '{"rows":[],"total":0}';end if;
 owner_key=coalesce(nullif(a.funil#>>'{crm_ia,agendamento,owner_id}','')::uuid,l.responsavel_id);
 return private.crm_ia_slots(p_client,owner_key,p_date,null,a.funil#>'{crm_ia,agendamento}');
end $$;

create function public.crm_ia_apply_agent_action(p_run uuid,p_action jsonb,p_reply text,p_followup jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare r planeje_private.crm_ia_agent_runs;cfg public.crm_ia_config;a public.cliente_atend_ia_agentes;l public.leads;c public.cliente_atend_conversas;
 rules jsonb;dest jsonb;target jsonb;fields jsonb;k text;v jsonb;kind text:=p_action->>'type';destination text;stage_key uuid;next_agent uuid;
 appointment jsonb;reply text;outbox uuid;stamp timestamptz;owner_key uuid;reminder jsonb;reminder_at timestamptz;hours_n numeric;
begin
 select * into r from planeje_private.crm_ia_agent_runs where id=p_run for update;
 if r.id is null then raise exception 'crm_ia_run';end if;
 if r.status='queued' then return r.result;elsif r.status<>'claimed' then return '{"queued":false,"skipped":"run_closed"}';end if;
 perform pg_advisory_xact_lock(hashtextextended('crm-ia:'||r.cliente_id::text,0));
 select * into cfg from public.crm_ia_config where cliente_id=r.cliente_id for share;
 select * into a from public.cliente_atend_ia_agentes where id=r.agent_id and cliente_id=r.cliente_id for share;rules=a.funil->'crm_ia';dest=coalesce(rules->'destino','{"tipo":"humano"}');
 select * into l from public.leads where id=r.lead_id and cliente_id=r.cliente_id for update;
 select * into c from public.cliente_atend_conversas where cliente_id=r.cliente_id and contact_id=r.contact_id for update;
 target=planeje_private.crm_ia_delivery_target(r.cliente_id,r.channel_id,r.contact_id);
 if not private.crm_ia_agent_actor(r.cliente_id,r.actor_id) or cfg.revision is distinct from (r.snapshot->>'config_revision')::uuid
  or cfg.data#>>'{attendance,auto_send}' is distinct from 'true' or not a.ativo or not a.auto_responder or target->>'allowed'<>'true'
  or a.updated_at is distinct from (r.snapshot->>'agent_updated_at')::timestamptz or l.updated_at is distinct from (r.snapshot->>'lead_updated_at')::timestamptz
  or c.updated_at is distinct from (r.snapshot->>'conversation_updated_at')::timestamptz or c.ia_pausada or c.status='finalizado'
  or planeje_private.crm_ia_delivery_config(r.cliente_id,target->>'phone',cfg.revision,true) is not null then
  update planeje_private.crm_ia_agent_runs set status='cancelled' where id=r.id;return '{"queued":false,"skipped":"snapshot_changed"}';end if;
 if kind is null or kind not in ('answer','qualify','handoff','close','book') or jsonb_typeof(p_action)<>'object'
  or length(coalesce(p_reply,''))>4000 then raise exception 'crm_ia_action';end if;
 fields=coalesce(l.crm_ia_fields,'{}');
 if p_action ? 'values' then
  if jsonb_typeof(p_action->'values')<>'object' or octet_length((p_action->'values')::text)>12000 then raise exception 'crm_ia_variables';end if;
  for k,v in select * from jsonb_each(p_action->'values') loop
   if not exists(select 1 from jsonb_array_elements(coalesce(rules->'variaveis','[]')) variable where variable->>'nome'=k)
    or jsonb_typeof(v)<>'string' or length(v#>>'{}')>500 then raise exception 'crm_ia_variables';end if;
   fields=jsonb_set(fields,array[k],v,true);
  end loop;
 end if;
 if kind='qualify' then
  if rules->>'tipo'<>'qualificacao' or exists(select 1 from jsonb_array_elements(coalesce(rules->'variaveis','[]')) variable
   where nullif(btrim(fields->>(variable->>'nome')),'') is null) then raise exception 'crm_ia_qualification_incomplete';end if;
  destination=coalesce(dest->>'tipo','humano');
  update public.leads set qualificado=true,updated_at=clock_timestamp() where id=l.id returning * into l;
  update public.cliente_whatsapp_contact set qualificado=true,mini_crm=coalesce(mini_crm,'{}')||'{"qualificado":"Sim"}'::jsonb,
   updated_at=clock_timestamp() where id=r.contact_id and cliente_id=r.cliente_id;
 elsif kind='handoff' then destination='humano';elsif kind='close' then destination='encerrar';end if;
 if fields is distinct from l.crm_ia_fields then update public.leads set crm_ia_fields=fields,updated_at=clock_timestamp() where id=l.id returning * into l;end if;
 if kind in ('qualify','book') then stage_key=nullif(dest->>'stage_id','')::uuid;end if;
 if kind='book' then
  if rules->>'tipo'<>'agendamento' or coalesce(r.snapshot->>'last_text','') !~* '(agend|marc|confirm|pode ser|quero esse|esse hor)' then raise exception 'crm_ia_booking_confirmation';end if;
  owner_key=coalesce(nullif(rules#>>'{agendamento,owner_id}','')::uuid,l.responsavel_id);
  appointment=private.crm_ia_book(r.cliente_id,jsonb_build_object('owner_id',owner_key,'lead_id',l.id,'contact_id',r.contact_id,
   'start_at',p_action->>'start_at','end_at',p_action->>'end_at','request_id',r.id,'title',coalesce(nullif(rules#>>'{agendamento,title}',''),'Atendimento'),
   'notes',coalesce(rules#>>'{agendamento,instructions}',''),'crm_ia_agent_id',a.id),r.actor_id);
  select * into l from public.leads where id=l.id;
  destination=coalesce(dest->>'tipo','humano');
 end if;
 if r.mode='followup' and c.ia_followup_passo+1>=coalesce(jsonb_array_length(rules->'cadencia'),0) then
  destination=coalesce(dest->>'tipo','humano');stage_key=nullif(dest->>'stage_id','')::uuid;
 end if;
 if stage_key is not null then l=jsonb_populate_record(null::public.leads,private.crm_ia_move(r.cliente_id,l.id,stage_key,coalesce(p_action->>'reason','Conclusão pelo agente CRM IA'),l.updated_at::text,r.actor_id));end if;
 if destination='agente' then
  next_agent=nullif(dest->>'agente_id','')::uuid;
  if not exists(select 1 from public.cliente_atend_ia_agentes where id=next_agent and cliente_id=r.cliente_id and ativo and funil#>>'{crm_ia,pipeline_id}'=l.pipeline_id::text
    and coalesce(funil#>'{crm_ia,stage_ids}','[]') ? l.stage_id::text) then raise exception 'crm_ia_destination';end if;
 end if;
 reply=left(btrim(coalesce(p_reply,'')),4000);
 if kind='book' then reply='Horário reservado para '||to_char((appointment->>'start_at')::timestamptz at time zone coalesce(cfg.data#>>'{availability,timezone}','America/Sao_Paulo'),'DD/MM/YYYY "às" HH24:MI')||'.'||case when nullif(dest->>'message','') is not null then ' '||(dest->>'message') else '' end;
 elsif destination='humano' then reply=coalesce(case when r.snapshot->>'concierge'='true' then nullif(cfg.data#>>'{concierge,handoff_message}','') end,
  case when dest->>'tipo'='humano' then nullif(dest->>'message','') end,'Vou encaminhar seu atendimento para a equipe.');
 elsif destination='encerrar' then reply='Tudo bem. Este atendimento foi encerrado. Se precisar, envie uma nova mensagem.';
 elsif reply ~* '(agendad|reservad|compromisso.{0,20}confirm|etapa.{0,20}mov)' then reply='Posso conferir os próximos passos com você. Qual é sua preferência?';end if;
 if reply='' then raise exception 'crm_ia_empty_reply';end if;
 update public.cliente_atend_conversas set status=case when destination='encerrar' then 'finalizado' when destination='humano' then 'esperando' else 'entrada' end,
  ia_pausada=coalesce(destination='humano',false),status_at=clock_timestamp(),ia_followup_due_at=null,
  ia_followup_whatsapp_config_id=r.channel_id,ia_followup_claim_token=null,ia_followup_claim_snapshot=null,ia_followup_delivery_state='pending',
  crm_ia_runtime=c.crm_ia_runtime||jsonb_build_object('active',true,'agent_id',a.id,'next_agent_id',next_agent,'delivery_run_id',r.id,'config_revision',cfg.revision,
   'closed',destination='encerrar','channel_id',r.channel_id,'pending_followup',case when destination in ('humano','encerrar') then '{}'::jsonb else p_followup end),
  updated_at=clock_timestamp() where id=c.id returning updated_at into stamp;
 if destination='encerrar' then update public.crm_ia_outbox set status='cancelled',error_code='conversation_closed'
  where cliente_id=r.cliente_id and contact_id=r.contact_id and kind<>'manual' and status='pending';end if;
 insert into public.crm_ia_outbox(cliente_id,whatsapp_config_id,contact_id,lead_id,kind,body,scheduled_at,request_id,created_by,source_updated_at,config_revision,agent_run_id)
 values(r.cliente_id,r.channel_id,r.contact_id,l.id,case when r.mode='followup' then 'followup' else 'reply' end,reply,clock_timestamp(),r.id,r.actor_id,stamp,cfg.revision,r.id) returning id into outbox;
 if appointment is not null then
  for reminder in select value from jsonb_array_elements(coalesce(rules#>'{agendamento,reminders}','[]')) loop
   if reminder->>'unidade' not in ('horas','dias') then raise exception 'crm_ia_reminder_interval';end if;
   hours_n=(reminder->>'valor')::numeric*case when reminder->>'unidade'='dias' then 24 else 1 end;
   if hours_n<=0 or hours_n>8760 then raise exception 'crm_ia_reminder_interval';end if;
   reminder_at=(appointment->>'start_at')::timestamptz-hours_n*interval '1 hour';
   if reminder_at>clock_timestamp() then
    insert into public.crm_ia_outbox(cliente_id,whatsapp_config_id,contact_id,lead_id,kind,body,scheduled_at,request_id,created_by,source_updated_at,config_revision,agent_run_id,appointment_id)
    values(r.cliente_id,r.channel_id,r.contact_id,l.id,'reminder','Lembrete: seu atendimento está reservado para '||to_char((appointment->>'start_at')::timestamptz at time zone coalesce(cfg.data#>>'{availability,timezone}','America/Sao_Paulo'),'DD/MM/YYYY "às" HH24:MI')||'.',
     reminder_at,md5(r.id::text||':reminder:'||reminder_at::text)::uuid,r.actor_id,(appointment->>'updated_at')::timestamptz,cfg.revision,r.id,(appointment->>'id')::uuid)
    on conflict(cliente_id,created_by,request_id) do nothing;
   end if;
  end loop;
 end if;
 update planeje_private.crm_ia_agent_runs set status='queued',result=jsonb_build_object('handled',true,'typed',true,'queued',true,'outbox_id',outbox,'resposta',reply,'action',kind,'lead_updated_at',l.updated_at,'appointment',appointment) where id=r.id returning result into target;
 return target;
end $$;

alter function public.crm_ia_delivery_recheck(uuid,uuid) rename to crm_ia_delivery_recheck_base;
create function public.crm_ia_delivery_recheck(p_id uuid,p_claim_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item public.crm_ia_outbox;r planeje_private.crm_ia_agent_runs;a public.cliente_atend_ia_agentes;l public.leads;appointment public.crm_ia_appointments;c public.cliente_atend_conversas;
begin
 select * into item from public.crm_ia_outbox where id=p_id;
 if item.agent_run_id is not null then
  select * into r from planeje_private.crm_ia_agent_runs where id=item.agent_run_id;
  select * into a from public.cliente_atend_ia_agentes where id=r.agent_id;
  select * into l from public.leads where id=r.lead_id;
  if r.id is null or not private.crm_ia_agent_actor(r.cliente_id,r.actor_id) or not a.ativo or not a.auto_responder
   or a.updated_at is distinct from (r.snapshot->>'agent_updated_at')::timestamptz or (item.kind<>'reminder' and l.updated_at is distinct from (r.result->>'lead_updated_at')::timestamptz)
   or (not coalesce((r.snapshot->>'concierge')::boolean,false) and not private.crm_ia_agent_window(a.funil->'crm_ia',coalesce((select data#>>'{availability,timezone}' from public.crm_ia_config where cliente_id=item.cliente_id),'America/Sao_Paulo'))) then
   update public.crm_ia_outbox set status='cancelled',error_code='agent_changed' where id=p_id and status='sending' and claim_token=p_claim_token;
   return '{"allowed":false,"reason":"agent_changed"}';end if;
  if item.appointment_id is not null then
   select * into appointment from public.crm_ia_appointments where id=item.appointment_id and cliente_id=item.cliente_id;
   select * into c from public.cliente_atend_conversas where cliente_id=item.cliente_id and contact_id=item.contact_id;
   if appointment.id is null or appointment.status not in ('scheduled','confirmed') or appointment.start_at<=clock_timestamp()
    or appointment.updated_at is distinct from item.source_updated_at or c.ia_pausada or c.status='finalizado' then
    update public.crm_ia_outbox set status='cancelled',error_code='appointment_changed' where id=p_id and status='sending' and claim_token=p_claim_token;
    return '{"allowed":false,"reason":"appointment_changed"}';end if;
  end if;
 end if;
 return public.crm_ia_delivery_recheck_base(p_id,p_claim_token);
end $$;
alter function public.crm_ia_delivery_finish(uuid,uuid,text,text,text) rename to crm_ia_delivery_finish_base;
create function public.crm_ia_delivery_finish(p_id uuid,p_claim_token uuid,p_status text,p_message_id text default null,p_error_code text default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare item public.crm_ia_outbox;followup jsonb;ok boolean;c public.cliente_atend_conversas;echo jsonb;stamp timestamptz;
begin
 ok=public.crm_ia_delivery_finish_base(p_id,p_claim_token,p_status,p_message_id,p_error_code);
 if not ok then return false;end if;
 select * into item from public.crm_ia_outbox where id=p_id;
 if item.agent_run_id is not null and p_status='sent' and nullif(p_message_id,'') is not null then
  select * into c from public.cliente_atend_conversas where cliente_id=item.cliente_id and contact_id=item.contact_id for update;
  echo=c.crm_ia_runtime->'pending_api_echo';
  if echo->>'message_id'=p_message_id and echo->>'channel_id'=item.whatsapp_config_id::text
    and (echo->>'version')::timestamptz=c.updated_at and echo->>'previous_paused'='false' and c.ia_pausada then
   update public.cliente_atend_conversas set ia_pausada=false,status=coalesce(echo->>'previous_status',status),
    ia_followup_due_at=nullif(echo->>'previous_due_at','')::timestamptz,ia_followup_delivery_state=coalesce(echo->>'previous_delivery_state','pending'),
    crm_ia_runtime=crm_ia_runtime-'pending_api_echo',updated_at=now() where id=c.id returning updated_at into stamp;
   if item.kind<>'reminder' then update public.crm_ia_outbox set source_updated_at=stamp where id=item.id;item.source_updated_at=stamp;end if;
  end if;
 end if;
 if item.agent_run_id is not null and item.kind<>'reminder' then
  select crm_ia_runtime->'pending_followup' into followup from public.cliente_atend_conversas where cliente_id=item.cliente_id and contact_id=item.contact_id and updated_at=item.source_updated_at;
  update public.cliente_atend_conversas set ia_respondeu_em=case when p_status='sent' then clock_timestamp() else ia_respondeu_em end,
   ia_followup_due_at=case when p_status='sent' and not ia_pausada then nullif(followup->>'due_at','')::timestamptz end,
   ia_followup_passo=coalesce((followup->>'passo')::integer,0),ia_followup_delivery_state=case when p_status='sent' and followup->>'due_at' is not null then 'pending' else p_status end,
   crm_ia_runtime=crm_ia_runtime||jsonb_build_object('silence_started_at',followup->>'anchor','followup_agent_id',followup->>'agent_id','followup_agent_updated_at',followup->>'agent_updated_at'),
   updated_at=clock_timestamp() where cliente_id=item.cliente_id and contact_id=item.contact_id and updated_at=item.source_updated_at;
 end if;
 return true;
end $$;

revoke all on function private.crm_ia_agent_actor(uuid,uuid),private.crm_ia_agent_window(jsonb,text) from public,anon,authenticated;
revoke all on function public.crm_ia_agent_intake(uuid,uuid,uuid,text),public.crm_ia_agent_begin(uuid,uuid,uuid,uuid,uuid,text,text,jsonb),
 public.crm_ia_agent_slots(uuid,uuid,uuid,date),public.crm_ia_apply_agent_action(uuid,jsonb,text,jsonb),
 public.crm_ia_agent_fail(uuid),
 public.crm_ia_agent_note_api_echo(uuid,uuid,uuid,text,timestamptz),
 public.crm_ia_legacy_delivery_recover(),
 public.crm_ia_delivery_recheck(uuid,uuid),public.crm_ia_delivery_finish(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.crm_ia_agent_intake(uuid,uuid,uuid,text),public.crm_ia_agent_begin(uuid,uuid,uuid,uuid,uuid,text,text,jsonb),
 public.crm_ia_agent_slots(uuid,uuid,uuid,date),public.crm_ia_apply_agent_action(uuid,jsonb,text,jsonb),
 public.crm_ia_agent_fail(uuid),
 public.crm_ia_agent_note_api_echo(uuid,uuid,uuid,text,timestamptz),
 public.crm_ia_legacy_delivery_recover(),
 public.crm_ia_delivery_recheck(uuid,uuid),public.crm_ia_delivery_finish(uuid,uuid,text,text,text) to service_role;
notify pgrst,'reload schema';
commit;
