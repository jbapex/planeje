BEGIN;

ALTER FUNCTION private.atlas_executor_action(text,text) RENAME TO atlas_executor_action_pre_automation;
CREATE FUNCTION private.atlas_executor_action(p_app text,p_action text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT (p_app IN('atlas','crm','cs','gestor') AND p_action IN('save_automation','activate_automation','pause_automation'))
    OR private.atlas_executor_action_pre_automation(p_app,p_action);
$$;

ALTER FUNCTION private.atlas_executor_dispatch(public.atlas_execution_items) RENAME TO atlas_executor_dispatch_pre_automation;
CREATE FUNCTION private.atlas_executor_dispatch(p_item public.atlas_execution_items) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF p_item.action IN('save_automation','activate_automation','pause_automation') THEN
    RETURN private.atlas_squad_automation_apply(p_item);
  END IF;
  RETURN private.atlas_executor_dispatch_pre_automation(p_item);
END $$;

REVOKE ALL ON FUNCTION private.atlas_executor_action(text,text),private.atlas_executor_dispatch(public.atlas_execution_items),
  private.atlas_executor_action_pre_automation(text,text),private.atlas_executor_dispatch_pre_automation(public.atlas_execution_items)
  FROM PUBLIC,anon,authenticated,service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
