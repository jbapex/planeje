-- Enrich only the authorized page/state; contact phone and follow-up remain nullable source values.
CREATE OR REPLACE FUNCTION public.crm_ia_workspace(p_action text,p_client_id uuid DEFAULT NULL,p_payload jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;rows jsonb;contact_key uuid;channel_key uuid;contact_name text;contact_avatar text;contact_phone text;followup_due timestamptz;
BEGIN
  -- The canonical RPC authorizes the complete request before any identity is read.
  result:=public.crm_ia_workspace_pre_message_authorship(p_action,p_client_id,p_payload);
  IF p_action IS NULL OR p_action NOT IN('messages','conversations') THEN RETURN result;END IF;
  IF p_action='conversations' THEN
    SELECT coalesce(jsonb_agg(page.item||jsonb_build_object('profile_pic_url',c.profile_pic_url,'phone',c.phone,'followup_due_at',s.ia_followup_due_at) ORDER BY page.position),'[]') INTO rows
    FROM jsonb_array_elements(coalesce(result->'rows','[]')) WITH ORDINALITY AS page(item,position)
    LEFT JOIN public.cliente_whatsapp_contact c ON c.id=(page.item->>'contact_id')::uuid AND c.cliente_id=p_client_id
    LEFT JOIN public.cliente_atend_conversas s ON s.cliente_id=p_client_id AND s.contact_id=c.id;
    RETURN jsonb_set(result,'{rows}',rows);
  END IF;

  contact_key:=nullif(p_payload->>'contact_id','')::uuid;
  channel_key:=nullif(coalesce(p_payload->>'channel_id',p_payload->>'whatsapp_config_id'),'')::uuid;
  SELECT coalesce(nullif(btrim(c.mini_crm->>'contato_nome'),''),nullif(btrim(c.sender_name),''),'Contato sem nome'),c.profile_pic_url,c.phone,s.ia_followup_due_at
    INTO contact_name,contact_avatar,contact_phone,followup_due FROM public.cliente_whatsapp_contact c
    LEFT JOIN public.cliente_atend_conversas s ON s.cliente_id=p_client_id AND s.contact_id=c.id
    WHERE c.id=contact_key AND c.cliente_id=p_client_id;
  WITH page AS MATERIALIZED (
    SELECT item,position FROM jsonb_array_elements(coalesce(result->'rows','[]')) WITH ORDINALITY AS p(item,position)
  ), sources AS MATERIALIZED (
    SELECT page.*,s.id AS sent_id,s.message_id,s.sent_by,s.body
    FROM page LEFT JOIN public.cliente_whatsapp_sent s ON page.item->>'from_me'='true' AND s.id=(page.item->>'id')::uuid
      AND s.cliente_id=p_client_id AND s.whatsapp_config_id=channel_key
      AND EXISTS(SELECT 1 FROM public.cliente_whatsapp_contact c WHERE c.id=contact_key AND c.cliente_id=p_client_id
        AND (s.to_jid=c.from_jid OR s.chat_jid=c.from_jid))
  ), receipts AS MATERIALIZED (
    SELECT s.sent_id,count(*) AS matches,min(o.created_by::text)::uuid AS actor_id,min(o.body) AS body
    FROM sources s JOIN public.crm_ia_outbox o ON o.cliente_id=p_client_id AND o.whatsapp_config_id=channel_key
      AND o.contact_id=contact_key AND o.kind='manual' AND o.agent_run_id IS NULL AND o.status='sent'
      AND nullif(o.provider_message_id,'') IS NOT NULL AND o.provider_message_id=s.message_id
    WHERE s.item->>'can_flag' IS DISTINCT FROM 'true'
      -- The legacy sent row is writable; only one matching receipt can establish its author.
      AND NOT EXISTS(SELECT 1 FROM public.cliente_whatsapp_sent duplicate WHERE duplicate.cliente_id=p_client_id
        AND duplicate.whatsapp_config_id=channel_key AND duplicate.message_id=s.message_id AND duplicate.id<>s.sent_id)
    GROUP BY s.sent_id
  ), authors AS (
    SELECT s.item,s.position,p.full_name,p.avatar_url,
      CASE WHEN s.item->>'from_me'='false' THEN 'contact'
        -- can_flag comes from crm_ia_ai_message_source in the authorized RPC, including its run and delivery proof.
        WHEN s.item->>'from_me'='true' AND s.item->>'can_flag'='true' THEN 'ai'
        WHEN r.matches=1 THEN 'human'
        WHEN s.item->>'from_me'='true' AND s.item->>'sender_kind'='automation' THEN 'automation'
        ELSE 'unknown' END AS kind
    FROM sources s LEFT JOIN receipts r ON r.sent_id=s.sent_id AND r.matches=1
      AND r.actor_id=s.sent_by AND r.body IS NOT DISTINCT FROM s.body
    LEFT JOIN public.profiles p ON p.id=r.actor_id
  )
  SELECT coalesce(jsonb_agg(item||jsonb_build_object('sender_kind',kind,
    'sender_name',CASE kind WHEN 'contact' THEN contact_name WHEN 'human' THEN coalesce(nullif(btrim(full_name),''),'Equipe')
      WHEN 'ai' THEN 'IA' WHEN 'automation' THEN 'Automação' END,
    'avatar_url',CASE kind WHEN 'contact' THEN contact_avatar WHEN 'human' THEN avatar_url END) ORDER BY position),'[]')
    INTO rows FROM authors;
  result:=jsonb_set(result,'{rows}',rows);
  IF jsonb_typeof(result->'state')='object' THEN
    result:=jsonb_set(result,'{state}',(result->'state')||jsonb_build_object('profile_pic_url',contact_avatar,'phone',contact_phone,'followup_due_at',followup_due));
  END IF;
  RETURN result;
END $$;
