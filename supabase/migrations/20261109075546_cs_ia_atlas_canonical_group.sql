BEGIN;

CREATE OR REPLACE FUNCTION private.atlas_event_client(p_conversation uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  WITH source AS (
    SELECT g.id, g.cliente_id, lower(btrim(g.chat_jid)) AS jid
    FROM public.atendimento_conversas g
    WHERE g.id = p_conversation AND g.is_group AND NOT g.bloqueada AND g.archived_at IS NULL
      AND g.whatsapp_config_id IS NOT NULL AND nullif(btrim(g.chat_jid), '') IS NOT NULL
  ), candidates AS (
    SELECT c.id, c.etapa, l.wa_cliente_id = g.cliente_id AND lower(btrim(l.chat_jid)) = g.jid AS valid
    FROM source g JOIN public.cliente_whatsapp_grupo l ON l.conversation_id = g.id
    JOIN public.clientes c ON c.id = l.cliente_id
    UNION ALL
    SELECT c.id, c.etapa, true
    FROM source g CROSS JOIN public.clientes c
    CROSS JOIN LATERAL (SELECT c.entregaveis->'whatsapp_grupo' AS link) old
    WHERE NOT EXISTS (SELECT 1 FROM public.cliente_whatsapp_grupo l WHERE l.cliente_id = c.id)
      AND (
        (old.link->>'conversation_id' = g.id::text
          AND coalesce(nullif(old.link->>'wa_cliente_id',''), g.cliente_id::text) = g.cliente_id::text
          AND coalesce(nullif(lower(btrim(old.link->>'chat_jid')),''), g.jid) = g.jid)
        OR (nullif(old.link->>'conversation_id','') IS NULL
          AND old.link->>'wa_cliente_id' = g.cliente_id::text AND lower(btrim(old.link->>'chat_jid')) = g.jid
          AND NOT EXISTS (SELECT 1 FROM public.atendimento_conversas other
            WHERE other.id <> g.id AND other.cliente_id = g.cliente_id AND lower(btrim(other.chat_jid)) = g.jid
              AND other.is_group AND NOT other.bloqueada AND other.archived_at IS NULL))
      )
  )
  SELECT (array_agg(id))[1] FROM candidates
  HAVING count(*) = 1 AND bool_and(coalesce(valid, false) AND etapa = 'closed');
$$;

-- Uma resolução por lote para o worker, usando o mesmo vínculo dos gatilhos do Atlas.
CREATE FUNCTION public.atlas_event_resolve_groups(p_owner uuid, p_conversations uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR auth.uid() IS NOT NULL THEN
    RAISE insufficient_privilege USING MESSAGE = 'Worker exclusivo.';
  END IF;
  IF NOT private.atlas_event_enabled(p_owner) OR cardinality(p_conversations) NOT BETWEEN 1 AND 200 THEN
    RETURN '[]'::jsonb;
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(to_jsonb(link) ORDER BY link.conversation_id)
    FROM (
      SELECT g.id AS conversation_id, private.atlas_event_client(g.id) AS client_id,
        g.cliente_id AS wa_client_id, g.whatsapp_config_id AS channel_id, lower(btrim(g.chat_jid)) AS group_jid
      FROM public.atendimento_conversas g WHERE g.id = ANY(p_conversations)
    ) link WHERE link.client_id IS NOT NULL
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.atlas_event_resolve_groups(uuid,uuid[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.atlas_event_resolve_groups(uuid,uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION private.atlas_event_inventory_current(p_job uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  j public.atlas_event_jobs;
  source public.atendimento_conversas;
  scope jsonb;
  ref jsonb;
  body text;
  kind text;
  audio_state text;
  found_source boolean;
BEGIN
  SELECT * INTO j FROM public.atlas_event_jobs WHERE id = p_job;
  IF NOT FOUND OR private.atlas_event_client(j.conversation_id) IS DISTINCT FROM j.client_id THEN RETURN false; END IF;
  scope := j.input->'coverage'->'group_source';
  -- Lotes novos registram o canal. O inventário antigo continua legível durante a troca do worker.
  IF scope IS NOT NULL THEN
    SELECT * INTO source FROM public.atendimento_conversas WHERE id = j.conversation_id;
    IF scope IS DISTINCT FROM jsonb_build_object('wa_client_id', source.cliente_id, 'channel_id', source.whatsapp_config_id,
      'group_jid', lower(btrim(source.chat_jid))) THEN RETURN false; END IF;
  END IF;
  IF j.input->'coverage'->'message_inventory' IS DISTINCT FROM jsonb_build_object(
    'received',(SELECT jsonb_build_object('count',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(i.id::text,E'\n' ORDER BY i.id),''),'UTF8')),'hex'))
      FROM public.cliente_whatsapp_inbox i WHERE i.conversation_id=j.conversation_id AND i.media_purged_at IS NULL
        AND (scope IS NULL OR (i.cliente_id, i.whatsapp_config_id) = (source.cliente_id, source.whatsapp_config_id))),
    'sent',(SELECT jsonb_build_object('count',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(s.id::text,E'\n' ORDER BY s.id),''),'UTF8')),'hex'))
      FROM public.cliente_whatsapp_sent s WHERE s.conversation_id=j.conversation_id
        AND (scope IS NULL OR (s.cliente_id, s.whatsapp_config_id) = (source.cliente_id, source.whatsapp_config_id))))
    OR jsonb_typeof(j.input->'messages') IS DISTINCT FROM 'array' THEN RETURN false; END IF;

  FOR ref IN SELECT value FROM jsonb_array_elements(j.input->'messages') LOOP
    body := NULL;
    kind := NULL;
    audio_state := NULL;
    IF ref->>'id' LIKE 'in:%' THEN
      SELECT i.type, CASE WHEN lower(i.type) IN ('ptt','audio','audiomessage','voice','myaudio','voicemessage','voice_message')
        THEN CASE WHEN a.status='completed' THEN a.transcript END ELSE i.body END,
        CASE WHEN lower(i.type) IN ('ptt','audio','audiomessage','voice','myaudio','voicemessage','voice_message')
        THEN coalesce(a.status,'pending') END
      INTO kind, body, audio_state
      FROM public.cliente_whatsapp_inbox i
      LEFT JOIN public.atlas_audio_transcripts a ON a.inbox_id=i.id AND a.owner_id=j.owner_id
      WHERE i.id::text=substr(ref->>'id',4) AND i.conversation_id=j.conversation_id AND i.media_purged_at IS NULL
        AND (scope IS NULL OR (i.cliente_id, i.whatsapp_config_id) = (source.cliente_id, source.whatsapp_config_id));
      found_source := FOUND;
      IF body IS NOT NULL THEN
        body := regexp_replace(body,'['||chr(1)||'-'||chr(8)||chr(11)||chr(12)||chr(14)||'-'||chr(31)||']','','g');
      END IF;
      IF audio_state='pending' AND ref->>'audio_state'='historical_unavailable' THEN audio_state:='historical_unavailable'; END IF;
      IF audio_state IS DISTINCT FROM ref->>'audio_state' THEN RETURN false; END IF;
    ELSIF ref->>'id' LIKE 'out:%' THEN
      SELECT s.body, 'text' INTO body, kind
      FROM public.cliente_whatsapp_sent s
      WHERE s.id::text=substr(ref->>'id',5) AND s.conversation_id=j.conversation_id
        AND (scope IS NULL OR (s.cliente_id, s.whatsapp_config_id) = (source.cliente_id, source.whatsapp_config_id));
      found_source := FOUND;
    ELSE
      RETURN false;
    END IF;
    IF NOT found_source OR body IS DISTINCT FROM ref->>'body' OR kind IS DISTINCT FROM ref->>'type' THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION private.atlas_event_inventory_current(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.atlas_event_inventory_current(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.atlas_event_project_demands(p_job uuid)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  f public.atlas_event_findings;
  j public.atlas_event_jobs;
  d uuid;
  body text;
  projected integer := 0;
BEGIN
  SELECT * INTO j FROM public.atlas_event_jobs WHERE id=p_job AND state='completed' AND published_at IS NOT NULL;
  IF NOT FOUND OR NOT private.atlas_event_enabled(j.owner_id)
    OR private.atlas_event_client(j.conversation_id) IS DISTINCT FROM j.client_id
    OR NOT EXISTS (SELECT 1 FROM public.atlas_event_config c WHERE c.owner_id=j.owner_id AND j.client_id=ANY(c.client_ids))
    OR (j.input->'coverage' ? 'group_source' AND NOT private.atlas_event_inventory_current(j.id)) THEN RETURN 0; END IF;

  FOR f IN SELECT * FROM public.atlas_event_findings WHERE job_id=j.id AND route IN ('owner','review') AND demand_id IS NULL FOR UPDATE LOOP
    IF f.task_id IS NOT NULL THEN
      SELECT id INTO d FROM public.atlas_demands WHERE owner_id=f.owner_id AND client_id=f.client_id
        AND task_id=f.task_id AND state='linked' ORDER BY created_at LIMIT 1;
    END IF;
    IF d IS NULL THEN
      SELECT 'Pedido identificado em grupo do cliente. Fontes para revisão:'||E'\n'||coalesce(
        string_agg(left(m->>'created_at',32)||' · '||left(coalesce(m->>'body','Fonte sem transcrição'),1800),E'\n'),'Fonte pendente')
      INTO body FROM jsonb_array_elements(j.input->'messages') m WHERE f.sources ? (m->>'id');
      body:=left(body||E'\n\nEsclarecimento sugerido: '||f.question||
        CASE WHEN f.task_id IS NULL THEN '' ELSE E'\nTarefa candidata: '||f.task_id::text END,12000);
      INSERT INTO public.atlas_demands(owner_id,client_id,request_id,title,context,state,analysis,proposal)
      SELECT f.owner_id,f.client_id,f.id,private.atlas_demand_task_title(c.empresa,left(f.title,greatest(1,177-char_length(c.empresa)))),
        body,'draft',f.summary,jsonb_build_object('source','atlas_event','finding_id',f.id,'candidate_task_id',f.task_id)
      FROM public.clientes c WHERE c.id=f.client_id
      ON CONFLICT(owner_id,request_id) DO NOTHING RETURNING id INTO d;
      IF d IS NULL THEN SELECT id INTO d FROM public.atlas_demands WHERE owner_id=f.owner_id AND request_id=f.id; END IF;
      INSERT INTO public.atlas_demand_events(demand_id,kind,body)
      SELECT d,'event_received','Pedido do WhatsApp identificado pelo Atlas. Confira as fontes e prepare o repasse; nenhuma tarefa foi criada.'
      WHERE NOT EXISTS (SELECT 1 FROM public.atlas_demand_events WHERE demand_id=d AND kind='event_received');
    END IF;
    UPDATE public.atlas_event_findings SET demand_id=d WHERE id=f.id;
    projected:=projected+1;
    d:=NULL;
  END LOOP;
  RETURN projected;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
