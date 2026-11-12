-- Autorizar cada canal uma vez por consulta evita repetir os gates em cada mensagem.
-- Leituras do CRM IA: escopo antes da agregação, página somente depois da contagem.
CREATE OR REPLACE FUNCTION private.crm_ia_conversation_rows(p_client uuid)
RETURNS TABLE(contact_id uuid,channel_id uuid,nome text,phone text,last_message text,last_message_at timestamptz,
  attendance text,awaiting_since timestamptz,lead_id uuid,assigned_to uuid,ia_ativa boolean,resolvida boolean,
  updated_at timestamptz,pipeline_id uuid,stage_id uuid,origin text,followup_due_at timestamptz,value numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  WITH identities AS MATERIALIZED (
    SELECT c.*,private.crm_ia_phone(coalesce(nullif(c.phone,''),CASE WHEN c.from_jid LIKE '%@s.whatsapp.net' THEN c.from_jid END)) AS phone_key
    FROM public.cliente_whatsapp_contact c WHERE c.cliente_id=p_client AND private.crm_ia_client(p_client)
  ), phones AS (
    SELECT phone_key,CASE WHEN count(*)=1 THEN (array_agg(id))[1] END AS contact_id
    FROM identities WHERE phone_key<>'' GROUP BY phone_key
  ), lead_contacts AS (
    SELECT l.id,l.crm_ia_contact_id,coalesce(l.crm_ia_contact_id,p.contact_id) AS contact_id
    FROM public.leads l LEFT JOIN phones p ON p.phone_key=private.crm_ia_phone(l.whatsapp)
    WHERE l.cliente_id=p_client AND l.crm_ia_archived_at IS NULL
  ), links AS (
    SELECT contact_id,CASE
      WHEN count(*) FILTER(WHERE crm_ia_contact_id IS NOT NULL)=1
        THEN (array_agg(id ORDER BY id) FILTER(WHERE crm_ia_contact_id IS NOT NULL))[1]
      WHEN count(*) FILTER(WHERE crm_ia_contact_id IS NOT NULL)=0 AND count(*)=1 THEN (array_agg(id))[1]
    END AS lead_id FROM lead_contacts WHERE contact_id IS NOT NULL GROUP BY contact_id
  ), contacts AS MATERIALIZED (
    SELECT c.* FROM identities c WHERE private.crm_ia_contact(p_client,c.id)
  ), allowed_channels AS MATERIALIZED (
    SELECT wc.id FROM public.cliente_whatsapp_config wc WHERE wc.cliente_id=p_client AND private.crm_ia_channel(p_client,wc.id)
  ), messages AS (
    SELECT c.id AS contact_id,i.whatsapp_config_id AS channel_id,i.id AS message_id,i.body,
      coalesce(i.msg_timestamp,i.created_at) AS message_at,false AS from_me
    FROM contacts c JOIN public.cliente_whatsapp_inbox i ON i.cliente_id=p_client
      AND (i.from_jid=c.from_jid OR i.chat_jid=c.from_jid)
    JOIN allowed_channels ac ON ac.id=i.whatsapp_config_id
    WHERE NOT coalesce(i.is_group,false)
    UNION ALL
    SELECT c.id,s.whatsapp_config_id,s.id,s.body,s.created_at,true
    FROM contacts c JOIN public.cliente_whatsapp_sent s ON s.cliente_id=p_client
      AND (s.to_jid=c.from_jid OR s.chat_jid=c.from_jid)
    JOIN allowed_channels ac ON ac.id=s.whatsapp_config_id
  ), latest AS (
    SELECT DISTINCT ON(contact_id,channel_id) * FROM messages
    ORDER BY contact_id,channel_id,message_at DESC,message_id DESC,from_me DESC
  )
  SELECT c.id,m.channel_id,coalesce(nullif(btrim(c.mini_crm->>'contato_nome'),''),nullif(btrim(c.sender_name),''),'Contato sem nome'),
    c.phone,m.body,m.message_at,
    CASE WHEN s.status='finalizado' THEN 'resolved' WHEN s.id IS NULL OR coalesce(s.ia_pausada,true) THEN 'human' ELSE 'ai' END,
    CASE WHEN s.status='esperando' THEN s.status_at END,l.id,s.assigned_to,
    s.id IS NOT NULL AND s.status IS DISTINCT FROM 'finalizado' AND NOT coalesce(s.ia_pausada,true),
    coalesce(s.status='finalizado',false),coalesce(s.updated_at,c.updated_at),l.pipeline_id,l.stage_id,l.origem,
    s.ia_followup_due_at,l.valor
  FROM latest m JOIN contacts c ON c.id=m.contact_id
  LEFT JOIN public.cliente_atend_conversas s ON s.cliente_id=p_client AND s.contact_id=c.id
  LEFT JOIN links k ON k.contact_id=c.id
  LEFT JOIN public.leads l ON l.id=k.lead_id AND l.cliente_id=p_client AND private.crm_ia_lead(l.id,p_client)
$$;
