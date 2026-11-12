BEGIN;
-- The canonical leads.etiquetas column is text[], while API/configuration inputs are JSON arrays.
CREATE FUNCTION private.crm_ia_lead_tags(p_tags jsonb) RETURNS text[]
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result text[];
BEGIN
 IF jsonb_typeof(p_tags) IS DISTINCT FROM 'array' OR jsonb_array_length(p_tags)>50 THEN
  RAISE EXCEPTION 'Informe até 50 etiquetas de texto.' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_tags) value WHERE jsonb_typeof(value)<>'string' OR length(btrim(value#>>'{}')) NOT BETWEEN 1 AND 100) THEN
  RAISE EXCEPTION 'Cada etiqueta deve ser um texto de 1 a 100 caracteres.' USING ERRCODE='22023';
 END IF;
 SELECT coalesce(array_agg(tag ORDER BY first_position),ARRAY[]::text[]) INTO result
  FROM(SELECT btrim(value#>>'{}') AS tag,min(ordinality) AS first_position FROM jsonb_array_elements(p_tags) WITH ORDINALITY GROUP BY btrim(value#>>'{}')) normalized;
 RETURN result;
END$$;
REVOKE ALL ON FUNCTION private.crm_ia_lead_tags(jsonb) FROM PUBLIC,anon,authenticated;

create or replace function public.crm_ia_agent_intake(p_client uuid,p_channel uuid,p_contact uuid,p_text text) returns jsonb
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
    private.crm_ia_lead_tags(coalesce(entry->'tags','[]'::jsonb)),coalesce(nullif(c.origin_source,''),'whatsapp') from public.crm_stages s where s.id=(entry->>'stage_id')::uuid returning * into l;
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
REVOKE ALL ON FUNCTION public.crm_ia_agent_intake(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_ia_agent_intake(uuid,uuid,uuid,text) TO service_role;

ALTER FUNCTION public.crm_ia_workspace(text,uuid,jsonb) RENAME TO crm_ia_workspace_pre_lead_tags;
REVOKE ALL ON FUNCTION public.crm_ia_workspace_pre_lead_tags(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.crm_ia_workspace(p_action text,p_client_id uuid DEFAULT NULL,p_payload jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;changed jsonb;tags text[];
BEGIN
 -- Retain the complete validated save, actor/tenant gates, CAS, imports and existing wrapper chain.
 result:=public.crm_ia_workspace_pre_lead_tags(p_action,p_client_id,p_payload);
 IF p_action='save_lead' AND p_payload ? 'etiquetas' THEN
  tags:=private.crm_ia_lead_tags(p_payload->'etiquetas');
  UPDATE public.leads l SET etiquetas=tags,updated_at=clock_timestamp()
   WHERE l.id=(result->>'id')::uuid AND l.cliente_id=p_client_id AND private.crm_ia_lead(l.id,p_client_id)
    AND l.updated_at=(result->>'updated_at')::timestamptz RETURNING to_jsonb(l) INTO changed;
  IF changed IS NULL THEN RAISE EXCEPTION 'Lead indisponível ou versão alterada.' USING ERRCODE='40001';END IF;
  result:=result||changed;
 END IF;
 RETURN result;
END$$;
REVOKE ALL ON FUNCTION public.crm_ia_workspace(text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_ia_workspace(text,uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
