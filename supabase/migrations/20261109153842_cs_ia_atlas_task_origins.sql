BEGIN;

-- O recibo é do Atlas. O histórico da tarefa, por si só, é editável.
CREATE FUNCTION private.cs_ia_atlas_creation_receipt(p_task_id uuid, p_client_id uuid, p_owner_id uuid,
  p_request_id uuid, p_thread_id uuid)
RETURNS boolean LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND private.cs_ia_module_enabled('tasks') AND private.cs_ia_client_exists(p_client_id)
    AND EXISTS (
      SELECT 1 FROM public.atlas_team_requests r
      JOIN public.atlas_team_threads t ON t.id = r.thread_id
      JOIN public.tarefas task ON (task.id, task.client_id, task.owner_id) = (p_task_id, p_client_id, p_owner_id)
      WHERE r.id = p_request_id AND r.thread_id = p_thread_id
        AND t.client_id = p_client_id AND t.owner_id = p_owner_id
        AND r.state = 'completed' AND r.applied AND r.result->>'applied_decision' = 'ready'
        AND r.result->>'task_id' = p_task_id::text AND nullif(r.result->>'existing_task_id', '') IS NULL
        AND (private.cs_ia_role() <> 'colaborador' OR auth.uid() = ANY(task.assignee_ids) OR NOT EXISTS (
          SELECT 1 FROM public.user_module_access a WHERE a.user_id = auth.uid()
            AND a.module_name::text = 'tasks' AND a.access_level::text = 'responsible'
        ))
    );
$$;

CREATE FUNCTION public.cs_ia_atlas_task_origins(p_task_ids uuid[])
RETURNS TABLE(task_id uuid) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT t.id FROM public.tarefas t
  WHERE cardinality(p_task_ids) BETWEEN 1 AND 200 AND t.id = ANY(p_task_ids)
    AND t.status_history->0->>'source' = 'atlas_after_account_clarification'
    AND private.cs_ia_atlas_creation_receipt(t.id, t.client_id, t.owner_id,
      public.central_trafego_try_uuid(t.status_history->0->>'request_id'),
      public.central_trafego_try_uuid(t.status_history->0->>'thread_id'));
$$;

REVOKE ALL ON FUNCTION private.cs_ia_atlas_creation_receipt(uuid,uuid,uuid,uuid,uuid),
  public.cs_ia_atlas_task_origins(uuid[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.cs_ia_atlas_creation_receipt(uuid,uuid,uuid,uuid,uuid),
  public.cs_ia_atlas_task_origins(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.cs_ia_atlas_group_requests(
  p_client_id uuid, p_conversation_id uuid, p_wa_client_id uuid, p_channel_id uuid
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  WITH scope AS MATERIALIZED (
    SELECT g.id, g.cliente_id, g.whatsapp_config_id, g.chat_jid
    FROM public.cs_ia_group_source(p_client_id, p_conversation_id) g
    WHERE private.cs_ia_role() IN ('admin','superadmin')
      AND private.cs_ia_module_enabled('tasks') AND private.cs_ia_module_enabled('assistant')
      AND public.atlas_demand_access()
      AND g.cliente_id = p_wa_client_id AND g.whatsapp_config_id = p_channel_id
  ), recent AS (
    SELECT f.id, f.title, f.updated_at, f.state, d.id AS demand_id, d.state AS demand_state,
      t.id AS thread_id, t.state AS thread_state, task.id AS task_id,
      EXISTS (SELECT 1 FROM public.cs_ia_atlas_task_origins(ARRAY[task.id])) AS created_by_atlas
    FROM scope s
    JOIN public.atlas_event_findings f ON f.conversation_id = s.id AND f.client_id = p_client_id AND f.owner_id = auth.uid()
    JOIN public.atlas_event_jobs j ON (j.id, j.owner_id, j.client_id, j.conversation_id) =
      (f.job_id, f.owner_id, f.client_id, f.conversation_id) AND j.state = 'completed' AND j.published_at IS NOT NULL
    LEFT JOIN public.atlas_demands d ON (d.id, d.owner_id, d.client_id) = (f.demand_id, f.owner_id, f.client_id)
    LEFT JOIN public.atlas_team_threads t ON (t.id, t.owner_id, t.client_id) = (f.thread_id, f.owner_id, f.client_id)
    LEFT JOIN public.tarefas task ON task.client_id = f.client_id
      AND task.id = coalesce(CASE WHEN d.state = 'linked' THEN d.task_id END, t.task_id)
    WHERE f.route <> 'none'
      AND (j.input->'coverage'->'group_source' IS NULL OR j.input->'coverage'->'group_source' =
        jsonb_build_object('wa_client_id', s.cliente_id, 'channel_id', s.whatsapp_config_id, 'group_jid', lower(btrim(s.chat_jid))))
      AND (f.demand_id IS NULL OR d.id IS NOT NULL)
      AND (f.thread_id IS NULL OR t.id IS NOT NULL)
      AND jsonb_typeof(f.sources) = 'array' AND f.sources <> '[]'::jsonb
      AND NOT EXISTS (
        -- A mesma conversa pode ter registros antigos de outro canal.
        SELECT 1
        FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(f.sources) = 'array' THEN f.sources ELSE '[]'::jsonb END) r(ref)
        CROSS JOIN LATERAL (SELECT public.central_trafego_try_uuid(split_part(r.ref, ':', 2)) AS id) source
        WHERE NOT (
          CASE split_part(r.ref, ':', 1)
            WHEN 'in' THEN EXISTS (SELECT 1 FROM public.cliente_whatsapp_inbox i
              WHERE i.id = source.id AND r.ref = 'in:' || i.id::text AND (i.conversation_id, i.cliente_id, i.whatsapp_config_id) =
                (s.id, s.cliente_id, s.whatsapp_config_id) AND i.media_purged_at IS NULL)
            WHEN 'out' THEN EXISTS (SELECT 1 FROM public.cliente_whatsapp_sent m
              WHERE m.id = source.id AND r.ref = 'out:' || m.id::text AND (m.conversation_id, m.cliente_id, m.whatsapp_config_id) =
                (s.id, s.cliente_id, s.whatsapp_config_id))
            ELSE false
          END
        )
      )
    ORDER BY f.updated_at DESC, f.id
    LIMIT 12
  )
  SELECT CASE WHEN EXISTS (SELECT 1 FROM scope) THEN
    coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.updated_at DESC, r.id) FROM recent r), '[]'::jsonb)
  END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
