BEGIN;

-- Shared immutable facts for approval and its later native transport recheck.
-- No user impersonation: this helper reads facts, while native actor_check owns ACL.
CREATE FUNCTION private.atlas_executor_crm_delivery_snapshot(p_client uuid,p_contact uuid,p_channel uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE contact public.cliente_whatsapp_contact;channel public.cliente_whatsapp_config;
  conversation public.cliente_atend_conversas;inbox public.atendimento_conversas;config_revision uuid;
BEGIN
  SELECT * INTO contact FROM public.cliente_whatsapp_contact WHERE id=p_contact AND cliente_id=p_client;
  SELECT * INTO channel FROM public.cliente_whatsapp_config WHERE id=p_channel AND cliente_id=p_client;
  SELECT * INTO conversation FROM public.cliente_atend_conversas WHERE cliente_id=p_client AND contact_id=p_contact;
  SELECT * INTO inbox FROM public.atendimento_conversas WHERE cliente_id=p_client AND whatsapp_config_id=p_channel AND chat_jid=contact.from_jid ORDER BY updated_at DESC,id DESC LIMIT 1;
  SELECT revision INTO config_revision FROM public.crm_ia_config WHERE cliente_id=p_client;
  RETURN jsonb_build_object('contact_id',contact.id,'channel_id',channel.id,'source_jid',contact.from_jid,
    'phone',contact.phone,'name',coalesce(nullif(contact.mini_crm->>'contato_nome',''),contact.sender_name),
    'contact_updated_at',contact.updated_at,'config_revision',config_revision,
    'channel_version',md5(jsonb_build_object('id',channel.id,'provider',channel.provider,'name',channel.name,
      'instance_status',channel.instance_status,'archived_at',channel.archived_at,'token',channel.token,'subdomain',channel.subdomain)::text),
    'conversation',CASE WHEN conversation.id IS NULL THEN 'null'::jsonb ELSE jsonb_build_object('id',conversation.id,
      'status',conversation.status,'ia_pausada',conversation.ia_pausada,'assigned_to',conversation.assigned_to,
      'privado',conversation.privado,'updated_at',conversation.updated_at) END,
    'inbox',CASE WHEN inbox.id IS NULL THEN 'null'::jsonb ELSE jsonb_build_object('id',inbox.id,
      'updated_at',inbox.updated_at,'archived_at',inbox.archived_at,'bloqueada',inbox.bloqueada) END);
END $$;
REVOKE ALL ON FUNCTION private.atlas_executor_crm_delivery_snapshot(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Read-only review context. The caller remains the authenticated Atlas owner;
-- CRM and Atendimento decide client/contact/channel rights using their native helpers.
CREATE FUNCTION public.atlas_executor_crm_delivery_context(p_client uuid,p_contact uuid,p_channel uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=private.atlas_executor_user();contact public.cliente_whatsapp_contact;
  channel public.cliente_whatsapp_config;conversation public.cliente_atend_conversas;inbox public.atendimento_conversas;
  target jsonb;blocked boolean;config_revision uuid;delivery_reason text;snapshot jsonb;
BEGIN
  IF p_client IS NULL OR p_contact IS NULL OR p_channel IS NULL
    OR NOT coalesce(private.crm_ia_contact(p_client,p_contact),false)
    OR NOT coalesce(private.crm_ia_channel(p_client,p_channel,true),false) THEN
    RAISE EXCEPTION 'Sem acesso de envio para este contato e canal.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO contact FROM public.cliente_whatsapp_contact WHERE id=p_contact AND cliente_id=p_client;
  SELECT * INTO channel FROM public.cliente_whatsapp_config WHERE id=p_channel AND cliente_id=p_client;
  SELECT * INTO conversation FROM public.cliente_atend_conversas WHERE cliente_id=p_client AND contact_id=p_contact;
  SELECT * INTO inbox FROM public.atendimento_conversas
    WHERE cliente_id=p_client AND whatsapp_config_id=p_channel AND chat_jid=contact.from_jid
    ORDER BY updated_at DESC,id DESC LIMIT 1;
  target:=planeje_private.crm_ia_delivery_target(p_client,p_channel,p_contact);
  SELECT revision INTO config_revision FROM public.crm_ia_config WHERE cliente_id=p_client;
  delivery_reason:=planeje_private.crm_ia_delivery_config(p_client,target->>'phone',config_revision,false);
  blocked:=coalesce(inbox.bloqueada,false) OR EXISTS(SELECT 1 FROM public.atendimento_bloqueios b
    WHERE b.cliente_id=p_client AND b.chat_jid=contact.from_jid);
  snapshot:=private.atlas_executor_crm_delivery_snapshot(p_client,p_contact,p_channel);
  RETURN jsonb_build_object('client_id',p_client,'contact_id',p_contact,'channel_id',p_channel,
    'can_send',coalesce((target->>'allowed')::boolean,false) AND NOT blocked AND inbox.archived_at IS NULL
      AND channel.instance_status='connected' AND delivery_reason IS NULL,
    'blocked',blocked,'recipient',jsonb_build_object('name',snapshot->'name','phone',target->'phone','jid',target->'to'),
    'channel',jsonb_build_object('id',channel.id,'name',channel.name,'status',channel.instance_status),
    'conversation',snapshot->'conversation','snapshot',snapshot);
END $$;
REVOKE ALL ON FUNCTION public.atlas_executor_crm_delivery_context(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.atlas_executor_crm_delivery_context(uuid,uuid,uuid) TO authenticated;

-- Only atlas_executor_decide's transaction may invoke this dispatcher branch.
-- It inserts a native pending row; the existing dispatcher owns transport/leases.
CREATE FUNCTION private.atlas_executor_crm_delivery(p_item public.atlas_execution_items) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE actor uuid;stored public.atlas_execution_items;p jsonb:=p_item.payload;
  contact_key uuid;channel_key uuid;current_context jsonb;outbox jsonb;
BEGIN
  actor:=private.atlas_executor_user();
  SELECT * INTO stored FROM public.atlas_execution_items WHERE id=p_item.id AND owner_id=actor FOR UPDATE;
  IF stored.id IS NULL OR stored.app<>'crm' OR stored.action<>'send_message' OR stored.kind<>'proposal'
    OR stored.state<>'proposed' OR to_jsonb(stored) IS DISTINCT FROM to_jsonb(p_item) THEN
    RAISE EXCEPTION 'Proposta de mensagem indisponível.' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR (p-ARRAY['contact_id','channel_id','body','expected'])<>'{}'::jsonb
    OR jsonb_typeof(p->'body') IS DISTINCT FROM 'string' OR length(btrim(p->>'body')) NOT BETWEEN 1 AND 4000
    OR jsonb_typeof(p->'expected') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Conteúdo da proposta de mensagem inválido.' USING ERRCODE='22023';
  END IF;
  contact_key:=(p->>'contact_id')::uuid;channel_key:=(p->>'channel_id')::uuid;
  IF contact_key IS NULL OR channel_key IS NULL THEN RAISE EXCEPTION 'Contato e canal obrigatórios.' USING ERRCODE='22023';END IF;

  -- Blocking inserts a marker before editing inbox rows. Take its table lock
  -- first, then the same per-client lock as native manual enqueue, avoiding an
  -- approval/block deadlock and a block appearing between check and queue write.
  LOCK TABLE public.atendimento_bloqueios IN SHARE MODE;
  PERFORM pg_advisory_xact_lock(hashtextextended('crm-ia:'||stored.client_id::text,0));
  PERFORM 1 FROM public.cliente_whatsapp_contact WHERE id=contact_key AND cliente_id=stored.client_id FOR UPDATE;
  PERFORM 1 FROM public.cliente_whatsapp_config WHERE id=channel_key AND cliente_id=stored.client_id FOR SHARE;
  PERFORM 1 FROM public.crm_ia_config WHERE cliente_id=stored.client_id FOR SHARE;
  PERFORM 1 FROM public.cliente_atend_conversas WHERE cliente_id=stored.client_id AND contact_id=contact_key FOR UPDATE;
  PERFORM 1 FROM public.atendimento_conversas WHERE cliente_id=stored.client_id AND whatsapp_config_id=channel_key
    AND chat_jid=(SELECT from_jid FROM public.cliente_whatsapp_contact WHERE id=contact_key) ORDER BY id FOR UPDATE;

  -- This separate volatile call observes authorization and source changes made
  -- while waiting for locks. It performs no provisioning or transport.
  current_context:=public.atlas_executor_crm_delivery_context(stored.client_id,contact_key,channel_key);
  IF current_context->>'can_send' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'O destinatário ou canal não permite envio no estado atual.' USING ERRCODE='42501';
  END IF;
  IF current_context->'snapshot' IS DISTINCT FROM p->'expected' THEN
    RAISE EXCEPTION 'O contato, canal ou controle da conversa mudou.' USING ERRCODE='40001';
  END IF;
  outbox:=public.crm_ia_workspace('schedule_message',stored.client_id,jsonb_build_object(
    'contact_id',contact_key,'channel_id',channel_key,'body',p->>'body','request_id',stored.id));
  IF outbox->>'status' IS DISTINCT FROM 'pending' OR outbox->>'request_id' IS DISTINCT FROM stored.id::text THEN
    RAISE EXCEPTION 'A fila nativa não confirmou uma nova mensagem pendente.' USING ERRCODE='40001';
  END IF;
  RETURN jsonb_build_object('queued',true,'sent',false,'delivery_state','queued','status',outbox->'status',
    'outbox_id',outbox->'id','request_id',stored.id,'contact_id',contact_key,'channel_id',channel_key,
    'recipient',current_context->'recipient','attendance','human',
    'delivery_snapshot',private.atlas_executor_crm_delivery_snapshot(stored.client_id,contact_key,channel_key));
END $$;
REVOKE ALL ON FUNCTION private.atlas_executor_crm_delivery(public.atlas_execution_items) FROM PUBLIC,anon,authenticated,service_role;

-- Atlas receipts bind the later native worker to the post-enqueue facts. Native
-- schedule_message legitimately changes IA pause/updated_at, hence snapshot after it.
CREATE FUNCTION private.atlas_executor_crm_delivery_guard(p_id uuid) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE box public.crm_ia_outbox;item public.atlas_execution_items;actual jsonb;
BEGIN
  SELECT * INTO box FROM public.crm_ia_outbox WHERE id=p_id;
  SELECT * INTO item FROM public.atlas_execution_items WHERE id=box.request_id AND kind='proposal' AND app='crm' AND action='send_message';
  IF item.id IS NULL THEN RETURN NULL;END IF; -- Other native senders retain their existing contract.
  IF item.state<>'completed' OR item.decision IS DISTINCT FROM 'approve' OR item.owner_id IS DISTINCT FROM box.created_by
    OR item.client_id IS DISTINCT FROM box.cliente_id OR item.payload->>'contact_id' IS DISTINCT FROM box.contact_id::text
    OR item.payload->>'channel_id' IS DISTINCT FROM box.whatsapp_config_id::text OR item.payload->>'body' IS DISTINCT FROM box.body
    OR item.result->>'outbox_id' IS DISTINCT FROM box.id::text OR item.result->'queued' IS DISTINCT FROM 'true'::jsonb
    OR jsonb_typeof(item.result->'delivery_snapshot') IS DISTINCT FROM 'object' THEN RETURN 'atlas_proof_changed';END IF;
  IF public.crm_ia_delivery_actor_check(box.id,'outbox')->>'allowed' IS DISTINCT FROM 'true' THEN RETURN 'atlas_actor_changed';END IF;
  actual:=private.atlas_executor_crm_delivery_snapshot(box.cliente_id,box.contact_id,box.whatsapp_config_id);
  IF EXISTS(SELECT 1 FROM public.atendimento_bloqueios b WHERE b.cliente_id=box.cliente_id AND b.chat_jid=actual->>'source_jid')
    OR actual#>>'{inbox,bloqueada}'='true' THEN RETURN 'atlas_recipient_blocked';END IF;
  IF actual IS DISTINCT FROM item.result->'delivery_snapshot' THEN RETURN 'atlas_source_changed';END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION private.atlas_executor_crm_delivery_guard(uuid) FROM PUBLIC,anon,authenticated,service_role;
-- The pre-existing base recheck is SECURITY INVOKER and already service-callable.
GRANT EXECUTE ON FUNCTION private.atlas_executor_crm_delivery_guard(uuid) TO service_role;

-- Preserve this native OID, ACL, SECURITY INVOKER, volatility and search_path.
-- Voice/calendar/notification wrappers and already cached base callers all reach
-- this guard. Only Atlas's new native rows change behavior; no native chain rename.
CREATE OR REPLACE FUNCTION public.crm_ia_delivery_recheck_base(p_id uuid,p_claim_token uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare row public.crm_ia_outbox%rowtype;target jsonb;reason text;conversation public.cliente_atend_conversas%rowtype;last_message timestamptz;
begin
 select * into row from public.crm_ia_outbox where id=p_id for update;
 if not found or row.status<>'sending' or row.claim_token is distinct from p_claim_token or p_claim_token is null then
  return '{"allowed":false,"reason":"claim_lost"}';end if;
 if row.kind='notification' then return '{"allowed":false,"reason":"notification_requires_receipt"}';end if;
 reason:=private.atlas_executor_crm_delivery_guard(row.id);
 if reason is not null then
  update public.crm_ia_outbox set status='cancelled',error_code=reason where id=row.id;
  return jsonb_build_object('allowed',false,'reason',reason);
 end if;
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

NOTIFY pgrst,'reload schema';
COMMIT;
