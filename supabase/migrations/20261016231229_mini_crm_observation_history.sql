-- Observation ledger. Existing text stays on the contact; prior text is preserved lazily.
begin;
create table public.mini_crm_observation_history (
 id uuid primary key default gen_random_uuid(),
 cliente_id uuid not null references public.clientes(id) on delete cascade,
 contact_id uuid not null references public.cliente_whatsapp_contact(id) on delete cascade,
 body text not null,
 kind text not null default 'note' check(kind in ('note','legacy','cleared')),
 author_id uuid references auth.users(id) on delete set null,
 author_name text,
 created_at timestamptz default clock_timestamp(),
 check((kind='legacy')=(created_at is null)),
 check(kind='cleared' or length(btrim(body))>0)
);
create index mini_crm_observation_contact_date on public.mini_crm_observation_history(cliente_id,contact_id,created_at desc nulls last,id desc);
create index mini_crm_observation_contact_idx on public.mini_crm_observation_history(contact_id);
create index mini_crm_observation_author_idx on public.mini_crm_observation_history(author_id) where author_id is not null;
alter table public.mini_crm_observation_history enable row level security;
create policy mini_crm_observation_read on public.mini_crm_observation_history for select to authenticated using (
 public.mini_crm_rules_access(cliente_id,false)
 and exists(select 1 from public.cliente_whatsapp_contact c where c.id=contact_id and c.cliente_id=mini_crm_observation_history.cliente_id)
);
revoke all on public.mini_crm_observation_history from public,anon,authenticated,service_role;
grant select on public.mini_crm_observation_history to authenticated,service_role;

-- Private trigger only: records the row change already authorized by contact RLS.
-- No public INSERT/UPDATE/DELETE path to rewrite the ledger or forge an author.
create function planeje_private.mini_crm_capture_observation() returns trigger
language plpgsql security definer set search_path='' as $$
declare prior text:=''; next_body text:=btrim(coalesce(new.mini_crm->>'observacao',''));
 actor uuid:=auth.uid(); actor_name text; request_id uuid:=nullif(current_setting('planeje.mini_crm_note_request',true),'')::uuid;
begin
 if tg_op='UPDATE' then prior=btrim(coalesce(old.mini_crm->>'observacao',''));end if;
 if prior=next_body and request_id is null then return new;end if;
 if tg_op='UPDATE' and prior<>'' and not exists(select 1 from public.mini_crm_observation_history where contact_id=new.id and cliente_id=new.cliente_id) then
   insert into public.mini_crm_observation_history(cliente_id,contact_id,body,kind,created_at)
   values(new.cliente_id,new.id,prior,'legacy',null);
 end if;
 if next_body='' and prior='' then return new;end if;
 if actor is not null then select p.full_name into actor_name from public.profiles p where p.id=actor;end if;
 insert into public.mini_crm_observation_history(id,cliente_id,contact_id,body,kind,author_id,author_name)
 values(coalesce(request_id,gen_random_uuid()),new.cliente_id,new.id,next_body,
   case when next_body='' then 'cleared' else 'note' end,actor,
   coalesce(nullif(btrim(actor_name),''),case when actor is null then 'Atualização do sistema' else 'Usuário' end));
 return new;
end $$;
revoke all on function planeje_private.mini_crm_capture_observation() from public,anon,authenticated,service_role;
create trigger mini_crm_observation_capture after insert or update of mini_crm on public.cliente_whatsapp_contact
for each row execute function planeje_private.mini_crm_capture_observation();

-- One explicit save is one note, including repeated text on a new request.
-- Retrying a committed request never reorders/overwrites a newer observation.
create function public.mini_crm_save_observation(p_cliente_id uuid,p_contact_id uuid,p_body text,p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.cliente_whatsapp_contact%rowtype; existing public.mini_crm_observation_history%rowtype;
 body text:=btrim(coalesce(p_body,'')); result jsonb;
begin
 if auth.uid() is null or not coalesce(public.mini_crm_rules_access(p_cliente_id,false),false) then raise exception 'Acesso não autorizado' using errcode='42501';end if;
 if body='' or length(body)>10000 or p_request_id is null then raise exception 'Informe uma observação de até 10.000 caracteres' using errcode='22023';end if;
 select * into c from public.cliente_whatsapp_contact where id=p_contact_id and cliente_id=p_cliente_id for update;
 if not found then raise exception 'Contato indisponível' using errcode='42501';end if;
 select * into existing from public.mini_crm_observation_history where id=p_request_id;
 if found then
   if existing.contact_id<>c.id or existing.cliente_id<>p_cliente_id or existing.body<>body or existing.author_id is distinct from auth.uid() then
     raise exception 'Registro de observação indisponível' using errcode='22023';
   end if;
   return to_jsonb(c);
 end if;
 perform set_config('planeje.mini_crm_note_request',p_request_id::text,true);
 result=public.mini_crm_patch_contact(p_cliente_id,p_contact_id,jsonb_build_object('observacao',body));
 perform set_config('planeje.mini_crm_note_request','',true);
 return result;
end $$;
revoke all on function public.mini_crm_save_observation(uuid,uuid,text,uuid) from public,anon;
grant execute on function public.mini_crm_save_observation(uuid,uuid,text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
