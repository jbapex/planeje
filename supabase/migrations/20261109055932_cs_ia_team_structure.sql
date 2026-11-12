BEGIN;

CREATE TABLE private.cs_ia_team_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('cargo', 'squad')),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 60 AND name = btrim(name) AND name !~ '[[:cntrl:]]'),
  archived boolean NOT NULL DEFAULT false,
  version uuid NOT NULL DEFAULT gen_random_uuid(),
  UNIQUE (id, kind)
);
CREATE UNIQUE INDEX cs_ia_team_label_name ON private.cs_ia_team_labels (kind, lower(name));

CREATE TABLE private.cs_ia_team_assignments (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label_id uuid NOT NULL,
  kind text NOT NULL,
  PRIMARY KEY (profile_id, label_id),
  FOREIGN KEY (label_id, kind) REFERENCES private.cs_ia_team_labels(id, kind)
);
CREATE UNIQUE INDEX cs_ia_team_one_cargo ON private.cs_ia_team_assignments (profile_id) WHERE kind = 'cargo';
CREATE INDEX cs_ia_team_assignment_label ON private.cs_ia_team_assignments (label_id);

ALTER TABLE private.cs_ia_team_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.cs_ia_team_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.cs_ia_team_labels, private.cs_ia_team_assignments FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON private.cs_ia_team_labels, private.cs_ia_team_assignments TO authenticated;

CREATE POLICY cs_ia_team_labels_read ON private.cs_ia_team_labels FOR SELECT TO authenticated
  USING ((SELECT private.cs_ia_role()) IS NOT NULL
    AND (NOT archived OR (SELECT private.cs_ia_role()) IN ('admin', 'superadmin')));

CREATE POLICY cs_ia_team_assignments_read ON private.cs_ia_team_assignments FOR SELECT TO authenticated
  USING ((SELECT private.cs_ia_role()) IS NOT NULL AND EXISTS (
    SELECT 1 FROM private.cs_ia_team_labels l WHERE l.id = cs_ia_team_assignments.label_id
  ) AND EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = cs_ia_team_assignments.profile_id AND p.status = 'active'
      AND p.role IN ('admin', 'superadmin', 'colaborador') AND (
        (SELECT private.cs_ia_role()) IN ('admin', 'superadmin') OR p.id = (SELECT auth.uid())
        OR ((SELECT private.cs_ia_owner_visible()) AND EXISTS (
          SELECT 1 FROM public.clientes c WHERE c.etapa = 'closed' AND c.responsavel::text = p.id::text
            AND private.cs_ia_client_scope(c.responsavel::text)
        ))
      )
  ));

CREATE FUNCTION public.cs_ia_team_structure()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT CASE WHEN private.cs_ia_role() IS NOT NULL THEN jsonb_build_object(
    'labels', (SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.kind, l.archived, lower(l.name), l.id), '[]'::jsonb)
      FROM private.cs_ia_team_labels l),
    'assignments', (SELECT coalesce(jsonb_agg(jsonb_build_object('profile_id', a.profile_id, 'label_id', a.label_id)
      ORDER BY a.profile_id, a.label_id), '[]'::jsonb) FROM private.cs_ia_team_assignments a)
  ) END;
$$;

CREATE FUNCTION public.cs_ia_save_team_label(p_id uuid, p_kind text, p_name text, p_archived boolean, p_version uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  saved private.cs_ia_team_labels%ROWTYPE;
  label_name text := regexp_replace(coalesce(p_name, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
BEGIN
  IF NOT coalesce(private.cs_ia_role() IN ('admin', 'superadmin'), false) THEN
    RAISE insufficient_privilege USING MESSAGE = 'Sem permissão para editar cargos ou squads.';
  END IF;
  IF NOT coalesce(p_kind IN ('cargo', 'squad'), false) OR p_archived IS NULL OR
    char_length(label_name) NOT BETWEEN 2 AND 60 OR label_name ~ '[[:cntrl:]]' THEN
    RAISE invalid_parameter_value USING MESSAGE = 'Informe um nome de 2 a 60 caracteres para o cargo ou squad.';
  END IF;

  IF p_id IS NULL THEN
    IF p_archived OR p_version IS NOT NULL THEN RAISE invalid_parameter_value USING MESSAGE = 'Confira o novo cadastro.'; END IF;
    INSERT INTO private.cs_ia_team_labels (kind, name) VALUES (p_kind, label_name) RETURNING * INTO saved;
  ELSE
    UPDATE private.cs_ia_team_labels SET name = label_name, archived = p_archived, version = gen_random_uuid()
      WHERE id = p_id AND kind = p_kind AND version = p_version RETURNING * INTO saved;
    IF NOT FOUND THEN RAISE serialization_failure USING MESSAGE = 'O cadastro mudou. Atualize a equipe e tente novamente.'; END IF;
  END IF;
  RETURN to_jsonb(saved);
END;
$$;

CREATE FUNCTION public.cs_ia_save_team_person(p_profile_id uuid, p_label_ids uuid[], p_expected_ids uuid[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  current_ids uuid[];
BEGIN
  IF NOT coalesce(private.cs_ia_role() IN ('admin', 'superadmin'), false) THEN
    RAISE insufficient_privilege USING MESSAGE = 'Sem permissão para editar a organização da equipe.';
  END IF;
  IF p_label_ids IS NULL OR p_expected_ids IS NULL OR array_position(p_label_ids, NULL) IS NOT NULL OR
    array_position(p_expected_ids, NULL) IS NOT NULL OR cardinality(p_label_ids) > 64 OR cardinality(p_expected_ids) > 64 THEN
    RAISE invalid_parameter_value USING MESSAGE = 'Confira os vínculos da pessoa.';
  END IF;

  PERFORM 1 FROM public.profiles p WHERE p.id = p_profile_id AND p.status = 'active'
    AND p.role IN ('admin', 'superadmin', 'colaborador') FOR UPDATE;
  IF NOT FOUND THEN RAISE insufficient_privilege USING MESSAGE = 'Perfil ativo da equipe indisponível.'; END IF;

  current_ids := ARRAY(SELECT a.label_id FROM private.cs_ia_team_assignments a WHERE a.profile_id = p_profile_id ORDER BY a.label_id);
  IF current_ids IS DISTINCT FROM ARRAY(SELECT DISTINCT id FROM unnest(p_expected_ids) id ORDER BY id) THEN
    RAISE serialization_failure USING MESSAGE = 'A organização desta pessoa mudou. Atualize a equipe e tente novamente.';
  END IF;

  PERFORM 1 FROM private.cs_ia_team_labels l WHERE l.id = ANY(p_label_ids) ORDER BY l.id FOR SHARE;
  IF EXISTS (SELECT 1 FROM unnest(p_label_ids) wanted(id) LEFT JOIN private.cs_ia_team_labels l ON l.id = wanted.id
    WHERE l.id IS NULL OR (l.archived AND NOT l.id = ANY(current_ids))) THEN
    RAISE invalid_parameter_value USING MESSAGE = 'Cargo ou squad arquivado ou indisponível.';
  END IF;
  IF (SELECT count(*) FROM private.cs_ia_team_labels WHERE id = ANY(p_label_ids) AND kind = 'cargo') > 1 THEN
    RAISE invalid_parameter_value USING MESSAGE = 'Escolha um cargo por pessoa.';
  END IF;

  DELETE FROM private.cs_ia_team_assignments a WHERE a.profile_id = p_profile_id AND NOT a.label_id = ANY(p_label_ids);
  INSERT INTO private.cs_ia_team_assignments (profile_id, label_id, kind)
    SELECT p_profile_id, l.id, l.kind FROM private.cs_ia_team_labels l WHERE l.id = ANY(p_label_ids)
    ON CONFLICT DO NOTHING;
  RETURN p_profile_id;
END;
$$;

REVOKE ALL ON FUNCTION public.cs_ia_team_structure(), public.cs_ia_save_team_label(uuid, text, text, boolean, uuid),
  public.cs_ia_save_team_person(uuid, uuid[], uuid[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cs_ia_team_structure(), public.cs_ia_save_team_label(uuid, text, text, boolean, uuid),
  public.cs_ia_save_team_person(uuid, uuid[], uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
