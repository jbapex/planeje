BEGIN;

CREATE FUNCTION private.cs_ia_segment_visible()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(staff.role = 'superadmin' OR (staff.role IN ('admin', 'colaborador') AND coalesce(
    (SELECT u.can_view FROM public.user_client_field_permissions u WHERE u.user_id = auth.uid() AND u.field_name::text = 'nicho'),
    (SELECT r.can_view FROM public.client_field_permissions r WHERE r.role::text = staff.role AND r.field_name::text = 'nicho'), true)
  ), false)
  FROM (SELECT private.planeje_staff_role() AS role) staff;
$$;

CREATE FUNCTION public.cs_ia_portfolio_segments()
RETURNS TABLE(client_id uuid, segment text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT c.id, nullif(btrim(c.nicho), '')
  FROM public.clientes c
  WHERE (SELECT private.cs_ia_role()) IS NOT NULL AND (SELECT private.cs_ia_segment_visible())
    AND c.etapa = 'closed' AND private.cs_ia_client_scope(c.responsavel::text);
$$;

REVOKE ALL ON FUNCTION private.cs_ia_segment_visible(), public.cs_ia_portfolio_segments() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.cs_ia_segment_visible(), public.cs_ia_portfolio_segments() TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
