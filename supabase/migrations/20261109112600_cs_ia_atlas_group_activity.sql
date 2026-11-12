BEGIN;

CREATE FUNCTION public.cs_ia_atlas_group_activity(
  p_client_id uuid, p_conversation_id uuid, p_wa_client_id uuid, p_channel_id uuid
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  WITH scope AS MATERIALIZED (
    SELECT g.id, jsonb_build_object('wa_client_id', g.cliente_id, 'channel_id', g.whatsapp_config_id,
      'group_jid', lower(btrim(g.chat_jid))) AS source
    FROM public.cs_ia_group_source(p_client_id, p_conversation_id) g
    WHERE private.cs_ia_role() IN ('admin','superadmin')
      AND private.cs_ia_module_enabled('tasks') AND private.cs_ia_module_enabled('assistant')
      AND public.atlas_demand_access()
      AND g.cliente_id = p_wa_client_id AND g.whatsapp_config_id = p_channel_id
  )
  SELECT jsonb_build_object(
    'scan', (SELECT jsonb_build_object('state', scan.state, 'checked_at', scan.checked_at)
      FROM public.atlas_event_groups scan
      WHERE scan.owner_id = auth.uid() AND scan.client_id = p_client_id AND scan.conversation_id = s.id
        AND scan.coverage->'group_source' = s.source),
    'job', (SELECT jsonb_build_object('state', job.state, 'created_at', job.created_at, 'finished_at', job.finished_at,
        'published_at', job.published_at, 'partial', coalesce(job.coverage->'partial' = 'true'::jsonb, false))
      FROM public.atlas_event_jobs job
      WHERE job.owner_id = auth.uid() AND job.client_id = p_client_id AND job.conversation_id = s.id
        AND job.coverage->'group_source' = s.source
      ORDER BY job.created_at DESC, job.id DESC LIMIT 1)
  )
  FROM scope s;
$$;

REVOKE ALL ON FUNCTION public.cs_ia_atlas_group_activity(uuid,uuid,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cs_ia_atlas_group_activity(uuid,uuid,uuid,uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
