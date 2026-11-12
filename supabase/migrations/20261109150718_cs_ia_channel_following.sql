BEGIN;

CREATE TABLE private.cs_ia_channel_following (
  channel_id uuid PRIMARY KEY REFERENCES public.cliente_whatsapp_config(id) ON DELETE CASCADE,
  wa_client_id uuid NOT NULL,
  starts_at timestamptz CHECK (isfinite(starts_at)),
  revision uuid NOT NULL DEFAULT gen_random_uuid()
);

ALTER TABLE private.cs_ia_channel_following ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.cs_ia_channel_following FROM PUBLIC, anon, authenticated, service_role;

-- Sem configuração, o acompanhamento mantém o comportamento anterior.
CREATE FUNCTION private.cs_ia_channel_state(p_channel_id uuid, p_wa_client_id uuid)
RETURNS TABLE(starts_at timestamptz, version text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN f.channel_id IS NULL THEN '-infinity'::timestamptz ELSE f.starts_at END,
    md5(jsonb_build_array(p_channel_id, p_wa_client_id, f.revision)::text)
  FROM (VALUES (p_channel_id, p_wa_client_id)) c(channel_id, wa_client_id)
  LEFT JOIN private.cs_ia_channel_following f USING (channel_id, wa_client_id);
$$;

CREATE FUNCTION public.cs_ia_set_channel_following(p_channel_id uuid, p_enabled boolean, p_version text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  tenant uuid;
  state record;
BEGIN
  IF auth.uid() IS NULL OR coalesce(private.cs_ia_role(), '') NOT IN ('admin', 'superadmin') THEN
    RAISE insufficient_privilege USING MESSAGE = 'Sem acesso para alterar o acompanhamento do canal.';
  END IF;
  IF p_channel_id IS NULL OR p_enabled IS NULL OR p_version IS NULL THEN
    RAISE invalid_parameter_value USING MESSAGE = 'Confira o canal e o acompanhamento.';
  END IF;

  SELECT cfg.cliente_id INTO tenant FROM public.cliente_whatsapp_config cfg
  WHERE cfg.id = p_channel_id AND cfg.provider = 'uazapi' AND cfg.archived_at IS NULL
    AND public.atendimento_user_can_access_atendimento_scope(cfg.cliente_id, NULL, cfg.id)
  FOR UPDATE;
  IF NOT FOUND THEN RAISE insufficient_privilege USING MESSAGE = 'Canal indisponível para esta sessão.'; END IF;

  SELECT * INTO state FROM private.cs_ia_channel_state(p_channel_id, tenant);
  IF state.version IS DISTINCT FROM p_version THEN
    RAISE serialization_failure USING MESSAGE = 'O acompanhamento mudou em outra sessão. Confira o estado atual.';
  END IF;
  IF (state.starts_at IS NOT NULL) = p_enabled THEN RETURN p_enabled; END IF;

  INSERT INTO private.cs_ia_channel_following AS f (channel_id, wa_client_id, starts_at)
  VALUES (p_channel_id, tenant, CASE WHEN p_enabled THEN clock_timestamp() END)
  ON CONFLICT (channel_id) DO UPDATE SET wa_client_id = EXCLUDED.wa_client_id, starts_at = EXCLUDED.starts_at,
    revision = EXCLUDED.revision;
  RETURN p_enabled;
END;
$$;

REVOKE ALL ON FUNCTION private.cs_ia_channel_state(uuid, uuid),
  public.cs_ia_set_channel_following(uuid, boolean, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.cs_ia_channel_state(uuid, uuid) TO authenticated;

COMMIT;
