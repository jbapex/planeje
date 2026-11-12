-- Reaproveita campos de significado equivalente, sem inventar dados de briefing.
-- Somente novas tarefas vinculadas; nenhum backfill ou mudança em estado/aprovação.
CREATE OR REPLACE FUNCTION planeje_private.prefill_planned_material_briefing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  material jsonb := NEW.briefing_payload->'plan_material';
  reference_text text;
  defaults jsonb;
BEGIN
  IF NEW.plan_material_id IS NULL OR jsonb_typeof(material) IS DISTINCT FROM 'object' THEN
    RETURN NEW;
  END IF;
  reference_text := coalesce(nullif(btrim(material->>'referencia_url'), ''), nullif(btrim(material->>'referencias'), ''));
  defaults := jsonb_strip_nulls(jsonb_build_object(
    'formato', nullif(btrim(material->>'formato'), ''),
    'cta', nullif(btrim(material->>'cta'), ''),
    'roteiro', nullif(btrim(material->>'roteiro'), ''),
    'data_uso', coalesce(nullif(btrim(material->>'data_uso'), ''), nullif(btrim(material->>'data_postagem'), '')),
    'copy_final', nullif(btrim(material->>'copy_final'), ''),
    'referencia_url', CASE WHEN reference_text ~ '^https?://[^[:space:]]+$' THEN reference_text END
  ));
  -- Chaves já informadas, inclusive vazias, são decisões da equipe e prevalecem.
  NEW.briefing_payload := defaults || NEW.briefing_payload;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION planeje_private.prefill_planned_material_briefing()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER ab_tarefas_prefill_planned_material_briefing
  BEFORE INSERT ON public.tarefas
  FOR EACH ROW EXECUTE FUNCTION planeje_private.prefill_planned_material_briefing();

NOTIFY pgrst, 'reload schema';
