-- A lease prevents concurrent dispatch. An expired lease is uncertain, never retried automatically.
begin;

create table public.crm_ia_outbox (
 id uuid primary key default gen_random_uuid(),
 cliente_id uuid not null references public.clientes(id) on delete cascade,
 whatsapp_config_id uuid not null references public.cliente_whatsapp_config(id),
 contact_id uuid not null references public.cliente_whatsapp_contact(id),
 lead_id uuid references public.leads(id),
 kind text not null check(kind in ('manual','followup','reminder')),
 body text not null check(length(btrim(body)) between 1 and 4000),
 scheduled_at timestamptz not null,
 status text not null default 'pending' check(status in ('pending','sending','sent','failed','cancelled','uncertain')),
 request_id uuid not null,
 created_by uuid not null references public.profiles(id),
 attempts integer not null default 0 check(attempts >= 0),
 claimed_at timestamptz, claim_token uuid,
 sent_at timestamptz, provider_message_id text, error_code text,
 source_updated_at timestamptz, config_revision uuid,
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 unique(cliente_id,created_by,request_id)
);
create index crm_ia_outbox_due on public.crm_ia_outbox(scheduled_at,id) where status='pending';
create index crm_ia_outbox_claimed on public.crm_ia_outbox(claimed_at) where status='sending';
alter table public.crm_ia_outbox enable row level security;
revoke all on public.crm_ia_outbox from public,anon,authenticated;
grant all on public.crm_ia_outbox to service_role;
grant usage on schema planeje_private to service_role;

alter table public.cliente_atend_conversas
 add column ia_followup_whatsapp_config_id uuid references public.cliente_whatsapp_config(id),
 add column ia_followup_claim_token uuid,
 add column ia_followup_claimed_at timestamptz,
 add column ia_followup_claim_snapshot jsonb,
 add column ia_followup_delivery_state text not null default 'pending'
   check(ia_followup_delivery_state in ('pending','sending','sent','failed','cancelled','uncertain'));
alter table public.atendimento_conversa_planejamento
 add column delivery_claim_token uuid,
 add column delivery_claimed_at timestamptz,
 add column delivery_claim_snapshot jsonb,
 add column delivery_state text not null default 'pending'
   check(delivery_state in ('pending','sending','sent','failed','cancelled','uncertain'));
create index crm_ia_legacy_followup_claimed on public.cliente_atend_conversas(ia_followup_claimed_at) where ia_followup_delivery_state='sending';
create index crm_ia_legacy_reminder_claimed on public.atendimento_conversa_planejamento(delivery_claimed_at) where delivery_state='sending';

-- Existing human editors keep their permissions, but cannot forge a transport lease or reopen it.
create function planeje_private.crm_ia_legacy_claim_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if current_user='service_role' or pg_has_role(current_user,
   (select pg_get_userbyid(p.proowner) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='planeje_private' and p.proname='crm_ia_legacy_claim_guard' and p.pronargs=0),'USAGE') then return new;end if;
 if tg_table_name='cliente_atend_conversas' then
  new.ia_followup_whatsapp_config_id=case when tg_op='UPDATE' then old.ia_followup_whatsapp_config_id end;
  new.ia_followup_claim_token=case when tg_op='UPDATE' then old.ia_followup_claim_token end;
  new.ia_followup_claimed_at=case when tg_op='UPDATE' then old.ia_followup_claimed_at end;
  new.ia_followup_claim_snapshot=case when tg_op='UPDATE' then old.ia_followup_claim_snapshot end;
  new.ia_followup_delivery_state=case when tg_op='UPDATE' then old.ia_followup_delivery_state else 'pending' end;
 else
  new.delivery_claim_token=case when tg_op='UPDATE' then old.delivery_claim_token end;
  new.delivery_claimed_at=case when tg_op='UPDATE' then old.delivery_claimed_at end;
  new.delivery_claim_snapshot=case when tg_op='UPDATE' then old.delivery_claim_snapshot end;
  new.delivery_state=case when tg_op='UPDATE' then old.delivery_state else 'pending' end;
 end if;
 return new;
end $$;
revoke all on function planeje_private.crm_ia_legacy_claim_guard() from public,anon,authenticated;
grant execute on function planeje_private.crm_ia_legacy_claim_guard() to service_role;
create trigger crm_ia_legacy_claim_guard before insert or update on public.cliente_atend_conversas
 for each row execute function planeje_private.crm_ia_legacy_claim_guard();
create trigger crm_ia_legacy_claim_guard before insert or update on public.atendimento_conversa_planejamento
 for each row execute function planeje_private.crm_ia_legacy_claim_guard();

create function planeje_private.crm_ia_outbox_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='INSERT' or (new.cliente_id,new.whatsapp_config_id,new.contact_id,new.lead_id)
   is distinct from (old.cliente_id,old.whatsapp_config_id,old.contact_id,old.lead_id) then
  if not exists(select 1 from public.cliente_whatsapp_config where id=new.whatsapp_config_id and cliente_id=new.cliente_id)
    or not exists(select 1 from public.cliente_whatsapp_contact where id=new.contact_id and cliente_id=new.cliente_id)
    or (new.lead_id is not null and not exists(select 1 from public.leads where id=new.lead_id and cliente_id=new.cliente_id)) then
   raise exception 'crm_ia_delivery_scope' using errcode='42501';
  end if;
 end if;
 new.updated_at=clock_timestamp();return new;
end $$;
revoke all on function planeje_private.crm_ia_outbox_guard() from public,anon,authenticated;
grant execute on function planeje_private.crm_ia_outbox_guard() to service_role;
create trigger crm_ia_outbox_guard before insert or update on public.crm_ia_outbox
for each row execute function planeje_private.crm_ia_outbox_guard();

create function planeje_private.crm_ia_delivery_target(p_client uuid,p_channel uuid,p_contact uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.cliente_whatsapp_contact%rowtype;
begin
 if not exists(select 1 from public.cliente_whatsapp_config where id=p_channel and cliente_id=p_client
   and archived_at is null and provider='uazapi' and nullif(btrim(token),'') is not null and nullif(btrim(subdomain),'') is not null) then
  return '{"allowed":false,"reason":"channel_unavailable"}';
 end if;
 select * into c from public.cliente_whatsapp_contact where id=p_contact and cliente_id=p_client;
 if not found or coalesce(c.from_jid,'') !~ '^[0-9]+@(s\.whatsapp\.net|c\.us|lid)$' then
  return '{"allowed":false,"reason":"contact_unavailable"}';
 end if;
 return jsonb_build_object('allowed',true,'cliente_id',p_client,'whatsapp_config_id',p_channel,'contact_id',c.id,'to',c.from_jid,
   'phone',regexp_replace(coalesce(nullif(c.phone,''),case when c.from_jid not like '%@lid' then split_part(c.from_jid,'@',1) else '' end),'\D','','g'));
end $$;
revoke all on function planeje_private.crm_ia_delivery_target(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function planeje_private.crm_ia_delivery_target(uuid,uuid,uuid) to service_role;

-- Configuration is created by the next migration and resolved only when dispatch runs.
create function planeje_private.crm_ia_delivery_config(p_client uuid,p_phone text,p_revision uuid,p_auto boolean)
returns text language plpgsql security invoker set search_path='' as $$
declare settings jsonb;revision uuid;
begin
 select c.data,c.revision into settings,revision from public.crm_ia_config c where c.cliente_id=p_client;
 if p_auto and (not found or p_revision is null or revision is distinct from p_revision
   or settings#>>'{attendance,auto_send}' is distinct from 'true') then return 'automation_changed';end if;
 if settings#>>'{test_mode,enabled}'='true' and not exists(
   select 1 from jsonb_array_elements_text(case when jsonb_typeof(settings#>'{test_mode,phones}')='array'
     then settings#>'{test_mode,phones}' else '[]'::jsonb end) p(phone)
   where length(p_phone) between 8 and 16 and regexp_replace(p.phone,'\D','','g')=p_phone
 ) then return 'test_number_not_allowed';end if;
 return null;
end $$;
revoke all on function planeje_private.crm_ia_delivery_config(uuid,text,uuid,boolean) from public,anon,authenticated;
grant execute on function planeje_private.crm_ia_delivery_config(uuid,text,uuid,boolean) to service_role;

create function public.crm_ia_delivery_claim(p_now timestamptz default clock_timestamp(),p_ids uuid[] default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 update public.crm_ia_outbox set status='uncertain',error_code='lease_expired'
 where status='sending' and claimed_at<clock_timestamp()-interval '5 minutes';
 with picked as (
  select id from public.crm_ia_outbox where status='pending' and attempts=0 and scheduled_at<=p_now
    and (p_ids is null or id=any(p_ids)) order by scheduled_at,id limit 25 for update skip locked
 ), claimed as (
  update public.crm_ia_outbox o set status='sending',claim_token=gen_random_uuid(),claimed_at=clock_timestamp(),attempts=attempts+1
  from picked p where o.id=p.id returning o.*
 ) select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into result from claimed;
 return result;
end $$;

create function public.crm_ia_delivery_recheck(p_id uuid,p_claim_token uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare row public.crm_ia_outbox%rowtype;target jsonb;reason text;conversation public.cliente_atend_conversas%rowtype;last_message timestamptz;
begin
 select * into row from public.crm_ia_outbox where id=p_id for update;
 if not found or row.status<>'sending' or row.claim_token is distinct from p_claim_token or p_claim_token is null then
  return '{"allowed":false,"reason":"claim_lost"}';end if;
 target=planeje_private.crm_ia_delivery_target(row.cliente_id,row.whatsapp_config_id,row.contact_id);
 if target->>'allowed'<>'true' then reason=target->>'reason';
 elsif not public.cliente_atend_loja_habilitada(row.cliente_id) then reason='module_disabled';
 elsif not exists(select 1 from public.profiles p where p.id=row.created_by and p.status='active'
   and (p.role in ('superadmin','admin','colaborador') or (p.role='cliente' and p.cliente_id=row.cliente_id))) then reason='creator_unavailable';
 else reason=planeje_private.crm_ia_delivery_config(row.cliente_id,target->>'phone',row.config_revision,row.kind<>'manual');end if;
 if reason is null and row.kind<>'manual' and nullif(to_jsonb(row)->>'appointment_id','') is null then
  select * into conversation from public.cliente_atend_conversas where cliente_id=row.cliente_id and contact_id=row.contact_id;
  select last_message_at into last_message from public.cliente_whatsapp_contact where id=row.contact_id and cliente_id=row.cliente_id;
  if not found or conversation.id is null or ((conversation.ia_pausada or conversation.status='finalizado')
    and coalesce(to_jsonb(conversation)#>>'{crm_ia_runtime,delivery_run_id}','')<>coalesce(to_jsonb(row)->>'agent_run_id','no_run'))
    or row.source_updated_at is null or conversation.updated_at is distinct from row.source_updated_at
    or last_message>row.created_at then reason='source_changed';end if;
 end if;
 if reason is not null then
  update public.crm_ia_outbox set status='cancelled',error_code=reason where id=row.id;
  return jsonb_build_object('allowed',false,'reason',reason);
 end if;
 return (target-'phone')||jsonb_build_object('id',row.id,'claim_token',row.claim_token,'body',row.body,
  'media_descriptor',coalesce(to_jsonb(row)->'media_descriptor','{}'::jsonb));
end $$;

create function public.crm_ia_delivery_finish(p_id uuid,p_claim_token uuid,p_status text,p_message_id text default null,p_error_code text default null)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_status not in ('sent','failed','uncertain') then raise exception 'crm_ia_delivery_status';end if;
 update public.crm_ia_outbox set status=p_status,sent_at=case when p_status='sent' then clock_timestamp() end,
   provider_message_id=left(p_message_id,300),error_code=case when p_error_code ~ '^[a-z_]{1,60}$' then p_error_code end
 where id=p_id and status='sending' and claim_token=p_claim_token and p_claim_token is not null;
 return found;
end $$;

create function public.crm_ia_legacy_delivery_recover()
returns jsonb language plpgsql security invoker set search_path='' as $$
declare reminders integer;followups integer;
begin
 update public.atendimento_conversa_planejamento set delivery_state='uncertain',
   status=case when status='pendente' then 'falhou' else status end,error_message='delivery_unconfirmed'
 where delivery_state='sending' and delivery_claimed_at<clock_timestamp()-interval '5 minutes';
 get diagnostics reminders=row_count;
 update public.cliente_atend_conversas set ia_followup_delivery_state='uncertain',ia_followup_due_at=null
 where ia_followup_delivery_state='sending' and ia_followup_claimed_at<clock_timestamp()-interval '5 minutes';
 get diagnostics followups=row_count;
 return jsonb_build_object('reminders',reminders,'followups',followups);
end $$;

create function public.crm_ia_legacy_delivery_claim(p_kind text,p_id uuid,p_expected jsonb,p_now timestamptz default clock_timestamp())
returns jsonb language plpgsql security invoker set search_path='' as $$
declare reminder public.atendimento_conversa_planejamento%rowtype;conversation public.cliente_atend_conversas%rowtype;
 token uuid:=gen_random_uuid();channel uuid;channels integer;snapshot jsonb;revision uuid;
begin
 if p_kind='reminder' then
  select * into reminder from public.atendimento_conversa_planejamento where id=p_id for update;
  if not found then return '{}';end if;
  if reminder.delivery_state='sending' and reminder.delivery_claimed_at<clock_timestamp()-interval '5 minutes' then
   update public.atendimento_conversa_planejamento set delivery_state='uncertain',status='falhou',error_message='delivery_unconfirmed' where id=p_id;
   return '{}';
  end if;
  if reminder.status<>'pendente' or reminder.kind<>'lembrete_whatsapp' or reminder.scheduled_at>p_now or reminder.delivery_state<>'pending'
    or reminder.updated_at is distinct from (p_expected->>'updated_at')::timestamptz then return '{}';end if;
  snapshot=jsonb_build_object('updated_at',now(),'body',reminder.body,'cliente_id',reminder.cliente_id,
    'whatsapp_config_id',reminder.whatsapp_config_id,'conversation_id',reminder.conversation_id,'to',reminder.chat_jid,'scheduled_at',reminder.scheduled_at);
  update public.atendimento_conversa_planejamento set delivery_state='sending',delivery_claim_token=token,
    delivery_claimed_at=clock_timestamp(),delivery_claim_snapshot=snapshot,updated_at=now() where id=p_id;
 elsif p_kind='followup' then
  select * into conversation from public.cliente_atend_conversas where id=p_id for update;
  if not found then return '{}';end if;
  if conversation.ia_followup_delivery_state='sending' and conversation.ia_followup_claimed_at<clock_timestamp()-interval '5 minutes' then
   update public.cliente_atend_conversas set ia_followup_delivery_state='uncertain',ia_followup_due_at=null where id=p_id;
   return '{}';
  end if;
  if conversation.ia_followup_due_at is null or conversation.ia_followup_due_at>p_now or conversation.ia_followup_delivery_state<>'pending'
    or conversation.status='finalizado' or conversation.ia_pausada
    or conversation.updated_at is distinct from (p_expected->>'updated_at')::timestamptz then return '{}';end if;
  channel=conversation.ia_followup_whatsapp_config_id;
  if channel is null then
   select count(*),min(id::text)::uuid into channels,channel from public.cliente_whatsapp_config
    where cliente_id=conversation.cliente_id and archived_at is null and provider='uazapi';
   if channels<>1 then
    update public.cliente_atend_conversas set ia_followup_delivery_state='failed',ia_followup_due_at=null where id=p_id;return '{}';end if;
  end if;
  if nullif(btrim(p_expected->>'body'),'') is null or length(p_expected->>'body')>4000 or not exists(
    select 1 from public.cliente_atend_ia_agentes where id=(p_expected->>'agent_id')::uuid and cliente_id=conversation.cliente_id
      and ativo and auto_responder and updated_at=(p_expected->>'agent_updated_at')::timestamptz) then
   update public.cliente_atend_conversas set ia_followup_delivery_state='cancelled',ia_followup_due_at=null where id=p_id;return '{}';end if;
  select c.revision into revision from public.crm_ia_config c where c.cliente_id=conversation.cliente_id;
  snapshot=p_expected||jsonb_build_object('updated_at',now(),'due_at',conversation.ia_followup_due_at,'passo',conversation.ia_followup_passo,'config_revision',revision);
  update public.cliente_atend_conversas set ia_followup_delivery_state='sending',ia_followup_claim_token=token,
    ia_followup_claimed_at=clock_timestamp(),ia_followup_claim_snapshot=snapshot,ia_followup_whatsapp_config_id=channel where id=p_id;
 else raise exception 'crm_ia_delivery_kind';end if;
 return jsonb_build_object('id',p_id,'claim_token',token);
end $$;

create function public.crm_ia_legacy_delivery_recheck(p_kind text,p_id uuid,p_claim_token uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare reminder public.atendimento_conversa_planejamento%rowtype;conversation public.cliente_atend_conversas%rowtype;
 target jsonb;snapshot jsonb;reason text;revision uuid;agent public.cliente_atend_ia_agentes%rowtype;
begin
 if p_kind='reminder' then
  select * into reminder from public.atendimento_conversa_planejamento where id=p_id for update;
  if not found or reminder.delivery_state<>'sending' or reminder.delivery_claim_token is distinct from p_claim_token or p_claim_token is null then
   return '{"allowed":false,"reason":"claim_lost"}';end if;
  snapshot=reminder.delivery_claim_snapshot;
  if reminder.status<>'pendente' or reminder.updated_at is distinct from (snapshot->>'updated_at')::timestamptz
    or reminder.body is distinct from snapshot->>'body' or reminder.chat_jid is distinct from snapshot->>'to'
    or reminder.whatsapp_config_id is distinct from (snapshot->>'whatsapp_config_id')::uuid
    or reminder.scheduled_at is distinct from (snapshot->>'scheduled_at')::timestamptz then reason='source_changed';
  elsif nullif(btrim(reminder.body),'') is null then reason='empty_body';
  elsif not exists(select 1 from public.cliente_whatsapp_config where id=reminder.whatsapp_config_id and cliente_id=reminder.cliente_id
    and archived_at is null and provider='uazapi') or not exists(select 1 from public.atendimento_conversas
      where id=reminder.conversation_id and cliente_id=reminder.cliente_id and whatsapp_config_id=reminder.whatsapp_config_id
        and chat_jid=reminder.chat_jid and archived_at is null and not coalesce(bloqueada,false)) then reason='channel_unavailable';end if;
  if reason is not null then
   update public.atendimento_conversa_planejamento set delivery_state='cancelled',status=case when status='pendente' then 'cancelado' else status end,
     error_message=reason where id=p_id;
   return jsonb_build_object('allowed',false,'reason',reason);
  end if;
  return jsonb_build_object('allowed',true,'id',p_id,'claim_token',p_claim_token,'cliente_id',reminder.cliente_id,
    'whatsapp_config_id',reminder.whatsapp_config_id,'conversation_id',reminder.conversation_id,'to',reminder.chat_jid,'body',reminder.body);
 elsif p_kind='followup' then
  select * into conversation from public.cliente_atend_conversas where id=p_id for update;
  if not found or conversation.ia_followup_delivery_state<>'sending' or conversation.ia_followup_claim_token is distinct from p_claim_token or p_claim_token is null then
   return '{"allowed":false,"reason":"claim_lost"}';end if;
  snapshot=conversation.ia_followup_claim_snapshot;
  target=planeje_private.crm_ia_delivery_target(conversation.cliente_id,conversation.ia_followup_whatsapp_config_id,conversation.contact_id);
  select * into agent from public.cliente_atend_ia_agentes where id=(snapshot->>'agent_id')::uuid and cliente_id=conversation.cliente_id;
  select c.revision into revision from public.crm_ia_config c where c.cliente_id=conversation.cliente_id;
  if conversation.ia_pausada or conversation.status='finalizado' or conversation.ia_followup_due_at is null
    or conversation.updated_at is distinct from (snapshot->>'updated_at')::timestamptz
    or conversation.ia_followup_due_at is distinct from (snapshot->>'due_at')::timestamptz
    or conversation.ia_followup_passo is distinct from (snapshot->>'passo')::integer then reason='source_changed';
  elsif target->>'allowed'<>'true' then reason=target->>'reason';
  elsif exists(select 1 from public.cliente_whatsapp_inbox i where i.cliente_id=conversation.cliente_id
    and i.whatsapp_config_id=conversation.ia_followup_whatsapp_config_id and not coalesce(i.is_group,false)
    and (i.chat_jid=target->>'to' or i.from_jid=target->>'to')
    and coalesce(i.msg_timestamp,i.created_at)>coalesce(conversation.ia_respondeu_em,conversation.ia_followup_claimed_at)) then reason='source_changed';
  elsif not public.cliente_atend_loja_habilitada(conversation.cliente_id) then reason='module_disabled';
  elsif agent.id is null or not agent.ativo or not agent.auto_responder or agent.updated_at is distinct from (snapshot->>'agent_updated_at')::timestamptz
    or revision is distinct from (snapshot->>'config_revision')::uuid then reason='automation_changed';
  else reason=planeje_private.crm_ia_delivery_config(conversation.cliente_id,target->>'phone',revision,agent.funil ? 'crm_ia');end if;
  if reason is not null then
   update public.cliente_atend_conversas set ia_followup_delivery_state='cancelled' where id=p_id;
   return jsonb_build_object('allowed',false,'reason',reason);
  end if;
  return (target-'phone')||jsonb_build_object('id',p_id,'claim_token',p_claim_token,'body',snapshot->>'body');
 end if;
 raise exception 'crm_ia_delivery_kind';
end $$;

create function public.crm_ia_legacy_delivery_finish(p_kind text,p_id uuid,p_claim_token uuid,p_status text,p_error_code text default null,p_patch jsonb default '{}')
returns boolean language plpgsql security invoker set search_path='' as $$
declare conversation public.cliente_atend_conversas%rowtype;unchanged boolean;
begin
 if p_status not in ('sent','failed','uncertain') then raise exception 'crm_ia_delivery_status';end if;
 if p_kind='reminder' then
  update public.atendimento_conversa_planejamento set delivery_state=p_status,
    status=case when status='pendente' then case when p_status='sent' then 'concluido' else 'falhou' end else status end,
    completed_at=case when p_status='sent' then clock_timestamp() else completed_at end,
    error_message=case when p_status<>'sent' then 'delivery_unconfirmed' else null end,updated_at=clock_timestamp()
  where id=p_id and delivery_state='sending' and delivery_claim_token=p_claim_token and p_claim_token is not null;
  return found;
 elsif p_kind='followup' then
  select * into conversation from public.cliente_atend_conversas where id=p_id for update;
  if not found or conversation.ia_followup_delivery_state<>'sending' or conversation.ia_followup_claim_token is distinct from p_claim_token or p_claim_token is null then return false;end if;
  unchanged=conversation.updated_at=(conversation.ia_followup_claim_snapshot->>'updated_at')::timestamptz
    and not conversation.ia_pausada and conversation.status<>'finalizado';
  update public.cliente_atend_conversas set
   status=case when p_status='sent' and unchanged then coalesce(p_patch->>'status',status) else status end,
   status_at=case when p_status='sent' and unchanged then coalesce((p_patch->>'status_at')::timestamptz,status_at) else status_at end,
   ia_pausada=case when p_status='sent' and unchanged then coalesce((p_patch->>'ia_pausada')::boolean,ia_pausada) else ia_pausada end,
   ia_respondeu_em=case when p_status='sent' and unchanged then coalesce((p_patch->>'ia_respondeu_em')::timestamptz,ia_respondeu_em) else ia_respondeu_em end,
   ia_followup_due_at=case when p_status='sent' and unchanged then (p_patch->>'ia_followup_due_at')::timestamptz when unchanged then null else ia_followup_due_at end,
   ia_followup_passo=case when p_status='sent' and unchanged then coalesce((p_patch->>'ia_followup_passo')::integer,0) else ia_followup_passo end,
   ia_followup_delivery_state=case when p_status='sent' and unchanged and nullif(p_patch->>'ia_followup_due_at','') is not null then 'pending' else p_status end,
   ia_followup_claim_token=null,ia_followup_claim_snapshot=null where id=p_id;
  return true;
 end if;
 raise exception 'crm_ia_delivery_kind';
end $$;

revoke all on function public.crm_ia_delivery_claim(timestamptz,uuid[]) from public,anon,authenticated;
revoke all on function public.crm_ia_delivery_recheck(uuid,uuid) from public,anon,authenticated;
revoke all on function public.crm_ia_delivery_finish(uuid,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.crm_ia_legacy_delivery_recover() from public,anon,authenticated;
revoke all on function public.crm_ia_legacy_delivery_claim(text,uuid,jsonb,timestamptz) from public,anon,authenticated;
revoke all on function public.crm_ia_legacy_delivery_recheck(text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.crm_ia_legacy_delivery_finish(text,uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.crm_ia_delivery_claim(timestamptz,uuid[]),public.crm_ia_delivery_recheck(uuid,uuid),
 public.crm_ia_delivery_finish(uuid,uuid,text,text,text),public.crm_ia_legacy_delivery_claim(text,uuid,jsonb,timestamptz),
 public.crm_ia_legacy_delivery_recheck(text,uuid,uuid),public.crm_ia_legacy_delivery_finish(text,uuid,uuid,text,text,jsonb),
 public.crm_ia_legacy_delivery_recover() to service_role;
notify pgrst,'reload schema';
commit;
