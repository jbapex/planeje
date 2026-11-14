BEGIN;

-- An account without availability uses the same civil timezone as the slot reader.
DO $migration$
DECLARE
  target regprocedure := pg_catalog.to_regprocedure('public.crm_ia_workspace_pre_agent_drafts(text,uuid,jsonb)');
  definition text;
  metadata jsonb;
  original text := 'timezone:=private.crm_ia_availability(p_client_id)->>''timezone'';';
  corrected text := 'timezone:=coalesce(private.crm_ia_availability(p_client_id)->>''timezone'',''America/Sao_Paulo'');';
BEGIN
  -- Render defaults because pg_node_tree also records irrelevant parser offsets.
  SELECT pg_catalog.pg_get_functiondef(p.oid),
    (pg_catalog.to_jsonb(p)-'prosrc'-'proargdefaults')||jsonb_build_object('arguments',pg_catalog.pg_get_function_arguments(p.oid))
    INTO definition, metadata FROM pg_catalog.pg_proc p WHERE p.oid=target;
  IF definition IS NULL OR (length(definition)-length(replace(definition,original,'')))/length(original) <> 1 THEN
    RAISE EXCEPTION 'crm_ia_agenda_timezone_source_changed';
  END IF;
  EXECUTE replace(definition,original,corrected);
  IF metadata IS DISTINCT FROM (
    SELECT (pg_catalog.to_jsonb(p)-'prosrc'-'proargdefaults')||jsonb_build_object('arguments',pg_catalog.pg_get_function_arguments(p.oid))
    FROM pg_catalog.pg_proc p WHERE p.oid=target
  ) THEN
    RAISE EXCEPTION 'crm_ia_agenda_timezone_attributes_changed';
  END IF;
END;
$migration$;

COMMIT;
