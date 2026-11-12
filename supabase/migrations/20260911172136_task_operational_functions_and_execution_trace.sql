-- Agency-installation scope. No existing automation or task history is rewritten.
-- Managers are captured once; later grants/revocations are database-admin operations.
CREATE SCHEMA IF NOT EXISTS planeje_private AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA planeje_private FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE planeje_private.task_operational_function_managers (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  granted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE planeje_private.task_operational_function_managers OWNER TO postgres;
ALTER TABLE planeje_private.task_operational_function_managers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE planeje_private.task_operational_function_managers
  FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO planeje_private.task_operational_function_managers (user_id)
SELECT id FROM public.profiles
WHERE status = 'active' AND role IN ('admin', 'superadmin');

CREATE FUNCTION public.can_manage_task_operational_functions()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM planeje_private.task_operational_function_managers AS m
    WHERE m.user_id = auth.uid() AND m.is_active
  )
$$;
ALTER FUNCTION public.can_manage_task_operational_functions() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_manage_task_operational_functions()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_task_operational_functions()
  TO authenticated, service_role;

CREATE TABLE public.task_operational_functions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  assignee_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT task_operational_functions_name_valid
    CHECK (char_length(name) BETWEEN 1 AND 120 AND name = btrim(name)),
  CONSTRAINT task_operational_functions_active_members
    CHECK (NOT is_active OR cardinality(assignee_ids) > 0),
  CONSTRAINT task_operational_functions_no_null_members
    CHECK (array_position(assignee_ids, NULL) IS NULL)
);
ALTER TABLE public.task_operational_functions OWNER TO postgres;
CREATE UNIQUE INDEX task_operational_functions_name_unique
  ON public.task_operational_functions (lower(name));
ALTER TABLE public.task_operational_functions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.task_operational_functions
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.task_operational_functions TO authenticated;
GRANT ALL ON TABLE public.task_operational_functions TO service_role;

CREATE POLICY task_operational_functions_read
  ON public.task_operational_functions FOR SELECT TO authenticated USING (true);
CREATE POLICY task_operational_functions_insert
  ON public.task_operational_functions FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.can_manage_task_operational_functions()));
CREATE POLICY task_operational_functions_update
  ON public.task_operational_functions FOR UPDATE TO authenticated
  USING ((SELECT public.can_manage_task_operational_functions()))
  WITH CHECK ((SELECT public.can_manage_task_operational_functions()));
-- No client DELETE policy/grant: deactivate to retain IDs referenced in actions.

CREATE FUNCTION planeje_private.validate_task_operational_function()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  normalized_members uuid[];
  old_normalized_members uuid[];
BEGIN
  NEW.name := pg_catalog.btrim(NEW.name);
  IF pg_catalog.array_position(NEW.assignee_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Responsáveis não podem conter valores nulos.';
  END IF;
  SELECT coalesce(pg_catalog.array_agg(DISTINCT x ORDER BY x), '{}'::uuid[])
    INTO normalized_members
  FROM pg_catalog.unnest(coalesce(NEW.assignee_ids, '{}'::uuid[])) AS x;
  NEW.assignee_ids := normalized_members;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'O identificador da função não pode ser alterado.';
    END IF;
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
    SELECT coalesce(pg_catalog.array_agg(DISTINCT x ORDER BY x), '{}'::uuid[])
      INTO old_normalized_members
    FROM pg_catalog.unnest(OLD.assignee_ids) AS x;
  ELSE
    NEW.created_by := auth.uid();
    NEW.created_at := pg_catalog.clock_timestamp();
  END IF;
  NEW.updated_at := pg_catalog.clock_timestamp();

  -- Existing stale assignments may be retained while disabling a function.
  -- Every new/changed destination and every active function is validated.
  IF TG_OP = 'INSERT' OR NEW.is_active
     OR normalized_members IS DISTINCT FROM old_normalized_members THEN
    IF EXISTS (
      SELECT 1 FROM pg_catalog.unnest(normalized_members) AS requested(profile_id)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.profiles AS p
        WHERE p.id = requested.profile_id AND p.status = 'active'
          AND p.role IN ('admin', 'superadmin', 'colaborador')
      )
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'Selecione apenas perfis internos ativos existentes.';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
ALTER FUNCTION planeje_private.validate_task_operational_function() OWNER TO postgres;
REVOKE ALL ON FUNCTION planeje_private.validate_task_operational_function()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER task_operational_functions_validate
  BEFORE INSERT OR UPDATE ON public.task_operational_functions
  FOR EACH ROW EXECUTE FUNCTION planeje_private.validate_task_operational_function();

ALTER TABLE public.tarefas
  ADD COLUMN stage_execution_history jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.tarefas ADD CONSTRAINT tarefas_stage_execution_history_array
  CHECK (jsonb_typeof(stage_execution_history) = 'array');

CREATE FUNCTION planeje_private.capture_task_stage_execution()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  old_members uuid[];
  new_members uuid[];
  status_changed boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.stage_execution_history := '[]'::jsonb;
    RETURN NEW;
  END IF;

  -- This runs for every UPDATE, including attempts to overwrite only the trace.
  NEW.stage_execution_history := OLD.stage_execution_history;
  SELECT coalesce(pg_catalog.array_agg(DISTINCT x ORDER BY x), '{}'::uuid[])
    INTO old_members
  FROM pg_catalog.unnest(coalesce(OLD.assignee_ids, '{}'::uuid[])) AS x
  WHERE x IS NOT NULL;
  SELECT coalesce(pg_catalog.array_agg(DISTINCT x ORDER BY x), '{}'::uuid[])
    INTO new_members
  FROM pg_catalog.unnest(coalesce(NEW.assignee_ids, '{}'::uuid[])) AS x
  WHERE x IS NOT NULL;
  status_changed := NEW.status IS DISTINCT FROM OLD.status;

  IF status_changed OR new_members IS DISTINCT FROM old_members THEN
    NEW.stage_execution_history := OLD.stage_execution_history ||
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'id', pg_catalog.gen_random_uuid(),
        'at', pg_catalog.clock_timestamp(),
        'actor_id', auth.uid(),
        'kind', CASE WHEN status_changed THEN 'status_change' ELSE 'assignment_change' END,
        'from_status', OLD.status,
        'from_assignee_ids', old_members,
        'to_status', NEW.status,
        'to_assignee_ids', new_members
      ));
  END IF;
  RETURN NEW;
END
$$;
ALTER FUNCTION planeje_private.capture_task_stage_execution() OWNER TO postgres;
REVOKE ALL ON FUNCTION planeje_private.capture_task_stage_execution()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER zz_tarefas_capture_stage_execution
  BEFORE INSERT OR UPDATE ON public.tarefas
  FOR EACH ROW EXECUTE FUNCTION planeje_private.capture_task_stage_execution();

COMMENT ON COLUMN public.tarefas.stage_execution_history IS
  'Server-recorded status/assignee transitions after phase 1; existing status_history is unchanged. Empty history means no recorded transition, not inferred execution.';
COMMENT ON TABLE public.task_operational_functions IS
  'Operational assignments shared within this agency installation. Authenticated readers; managers authorized by a private static ACL.';
COMMENT ON FUNCTION public.can_manage_task_operational_functions() IS
  'Boolean check of private manager ACL; profile.role is not consulted at runtime. ACL onboarding/revocation is database-admin managed in phase 1.';

NOTIFY pgrst, 'reload schema';
