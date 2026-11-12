BEGIN;

CREATE FUNCTION public.cs_ia_connection_summary()
RETURNS TABLE(id uuid, name text, instance_status text, linked_clients integer)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  WITH linked AS (
    SELECT r.channel_id, r.wa_client_id, count(*)::integer AS client_count
    FROM public.cs_ia_radar_snapshot() r
    WHERE r.group_status = 'linked'
    GROUP BY r.channel_id, r.wa_client_id
  )
  SELECT cfg.id, coalesce(nullif(btrim(cfg.name::text), ''), 'Canal sem nome'),
    CASE lower(cfg.instance_status::text)
      WHEN 'connected' THEN 'connected'
      WHEN 'connecting' THEN 'connecting'
      WHEN 'disconnected' THEN 'disconnected'
      ELSE 'unknown'
    END,
    coalesce(l.client_count, 0)
  FROM public.cliente_whatsapp_config cfg
  LEFT JOIN linked l ON l.channel_id = cfg.id AND l.wa_client_id = cfg.cliente_id
  LEFT JOIN public.cs_ia_group_registration_channels() manageable
    ON manageable.id = cfg.id AND manageable.wa_client_id = cfg.cliente_id
  WHERE cfg.archived_at IS NULL AND (l.channel_id IS NOT NULL OR manageable.id IS NOT NULL);
$$;

REVOKE ALL ON FUNCTION public.cs_ia_connection_summary() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cs_ia_connection_summary() TO authenticated;
NOTIFY pgrst, 'reload schema';

COMMIT;
