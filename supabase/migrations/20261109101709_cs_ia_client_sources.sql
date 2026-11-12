BEGIN;

CREATE FUNCTION public.cs_ia_client_sources(p_client_id uuid, p_source text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NOT private.cs_ia_client_exists(p_client_id) THEN RETURN NULL; END IF;

  IF p_source = 'crm' AND private.cs_ia_module_enabled('crm') THEN
    RETURN jsonb_build_object(
      'totals', (SELECT jsonb_build_object('leads', count(*),
        'qualified', count(*) FILTER (WHERE l.qualificado), 'won', count(*) FILTER (WHERE l.comprou))
        FROM public.leads l WHERE l.cliente_id = p_client_id),
      'items', (SELECT coalesce(jsonb_agg(to_jsonb(event) ORDER BY event.at DESC, event.id DESC), '[]'::jsonb)
        FROM (
          SELECT e.id, e.lead_id, l.nome AS label, e.realizado_em AS at, (
            SELECT s.nome FROM public.crm_stages s JOIN public.crm_pipelines p ON p.id = s.pipeline_id
            WHERE s.id = e.stage_nova_id AND p.cliente_id = p_client_id
          ) AS stage
          FROM public.leads l JOIN public.crm_funnel_events e ON e.lead_id = l.id
          WHERE l.cliente_id = p_client_id
          ORDER BY e.realizado_em DESC, e.id DESC LIMIT 5
        ) event)
    );
  END IF;

  IF p_source = 'arquivos' THEN
    RETURN jsonb_build_object('items', (
      SELECT coalesce(jsonb_agg(to_jsonb(doc) ORDER BY doc.created_at DESC, doc.id DESC), '[]'::jsonb)
      FROM (
        SELECT d.id, d.title, d.created_at, d.record_meta->>'kind' AS kind, d.record_meta->>'state' AS state
        FROM public.client_documents d
        WHERE d.client_id = p_client_id AND d.archived_at IS NULL AND d.record_meta <> '{}'::jsonb
        ORDER BY d.created_at DESC, d.id DESC LIMIT 5
      ) doc
    ));
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.cs_ia_client_sources(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cs_ia_client_sources(uuid, text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
