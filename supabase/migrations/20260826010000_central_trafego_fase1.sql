-- Central de Tráfego — Fase 1 (aditiva, atômica).
-- NÃO altera policies globais de tarefas, clientes, profiles,
-- task_comments, task_attachments, paid_campaigns.
-- NÃO revoga create_ad_from_structure.
-- Aplicar somente com psql neste arquivo (BEGIN/COMMIT). Não executar agora.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Flags semânticas (não usar sort_order)
-- ---------------------------------------------------------------------------
ALTER TABLE public.task_statuses
  ADD COLUMN IF NOT EXISTS is_initial boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_terminal boolean NOT NULL DEFAULT false;

ALTER TABLE public.paid_campaign_statuses
  ADD COLUMN IF NOT EXISTS lifecycle text;

ALTER TABLE public.paid_campaign_statuses
  DROP CONSTRAINT IF EXISTS paid_campaign_statuses_lifecycle_chk;

ALTER TABLE public.paid_campaign_statuses
  ADD CONSTRAINT paid_campaign_statuses_lifecycle_chk
  CHECK (lifecycle IS NULL OR lifecycle IN ('planning', 'active', 'paused', 'terminal'));

UPDATE public.task_statuses SET is_initial = false, is_terminal = false;
UPDATE public.task_statuses SET is_initial = true WHERE value = 'todo';
UPDATE public.task_statuses SET is_terminal = true WHERE value = 'published';

UPDATE public.paid_campaign_statuses SET lifecycle = 'planning' WHERE value = 'planning';
UPDATE public.paid_campaign_statuses SET lifecycle = 'active' WHERE value = 'active';
UPDATE public.paid_campaign_statuses SET lifecycle = 'paused' WHERE value = 'paused';
UPDATE public.paid_campaign_statuses SET lifecycle = 'active' WHERE value = 'reporting';
UPDATE public.paid_campaign_statuses SET lifecycle = 'active' WHERE value = 'alterao';
UPDATE public.paid_campaign_statuses SET lifecycle = 'terminal' WHERE value = 'completed';

DO $$
DECLARE
  v_initial int;
  v_terminal int;
  v_missing text;
  v_unmapped text;
BEGIN
  SELECT count(*) INTO v_initial FROM public.task_statuses WHERE is_initial;
  SELECT count(*) INTO v_terminal FROM public.task_statuses WHERE is_terminal;

  IF NOT EXISTS (SELECT 1 FROM public.task_statuses WHERE value = 'todo') THEN
    RAISE EXCEPTION 'Central de Tráfego: task_statuses.value = todo não existe. Abortando.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.task_statuses WHERE value = 'published') THEN
    RAISE EXCEPTION 'Central de Tráfego: task_statuses.value = published não existe. Abortando.';
  END IF;
  IF v_initial <> 1 THEN
    RAISE EXCEPTION 'Central de Tráfego: deve existir exatamente 1 status inicial de tarefa (todo). Encontrados: %', v_initial;
  END IF;
  IF v_terminal < 1 THEN
    RAISE EXCEPTION 'Central de Tráfego: é necessário pelo menos 1 status terminal (published). Encontrados: %', v_terminal;
  END IF;

  FOREACH v_missing IN ARRAY ARRAY['planning', 'active', 'paused', 'reporting', 'alterao', 'completed']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.paid_campaign_statuses WHERE value = v_missing) THEN
      RAISE EXCEPTION 'Central de Tráfego: paid_campaign_statuses.value = % não existe. Abortando.', v_missing;
    END IF;
  END LOOP;

  SELECT string_agg(value, ', ') INTO v_unmapped
  FROM public.paid_campaign_statuses
  WHERE lifecycle IS NULL;

  IF v_unmapped IS NOT NULL THEN
    RAISE EXCEPTION 'Central de Tráfego: status de campanha sem lifecycle (não usar sort_order): %', v_unmapped;
  END IF;
END $$;

ALTER TABLE public.paid_campaign_statuses
  ALTER COLUMN lifecycle SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS task_statuses_one_initial
  ON public.task_statuses ((true))
  WHERE is_initial;

-- ---------------------------------------------------------------------------
-- 2. Tabelas novas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.traffic_client_ops (
  client_id uuid PRIMARY KEY REFERENCES public.clientes(id) ON DELETE CASCADE,
  primary_assignee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  situation text NOT NULL DEFAULT 'active',
  situation_reason text,
  resume_at date,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT traffic_client_ops_situation_chk CHECK (
    situation IN (
      'active', 'onboarding', 'needs_review', 'waiting_client',
      'temporarily_paused', 'no_campaign_expected', 'closed'
    )
  )
);

ALTER TABLE public.traffic_client_ops DROP CONSTRAINT IF EXISTS traffic_client_ops_situation_chk;
ALTER TABLE public.traffic_client_ops
  ADD CONSTRAINT traffic_client_ops_situation_chk CHECK (
    situation IN (
      'active', 'onboarding', 'needs_review', 'waiting_client',
      'temporarily_paused', 'no_campaign_expected', 'closed'
    )
  );

CREATE TABLE IF NOT EXISTS public.traffic_client_access (
  client_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (client_id, profile_id)
);

CREATE TABLE IF NOT EXISTS public.traffic_task_details (
  task_id uuid PRIMARY KEY REFERENCES public.tarefas(id) ON DELETE CASCADE,
  demand_type text NOT NULL,
  source_type text NOT NULL DEFAULT 'manual',
  source_reference text,
  next_action_none boolean NOT NULL DEFAULT false,
  next_review_at timestamptz,
  blocked_reason text,
  completion_summary text,
  generated_from_task_id uuid REFERENCES public.tarefas(id) ON DELETE SET NULL,
  generation_key text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT traffic_task_details_demand_type_chk CHECK (
    demand_type IN (
      'nova_campanha', 'publicacao', 'revisao_24h', 'revisao_72h',
      'analise', 'orcamento', 'criativo', 'relatorio',
      'cobranca_material', 'aprovacao_cliente', 'pausa_reativacao',
      'rastreamento', 'ajuste', 'outro'
    )
  ),
  CONSTRAINT traffic_task_details_source_type_chk CHECK (
    source_type IN ('manual', 'review', 'legacy', 'successor', 'system')
  )
);

ALTER TABLE public.traffic_task_details DROP CONSTRAINT IF EXISTS traffic_task_details_demand_type_chk;
ALTER TABLE public.traffic_task_details
  ADD CONSTRAINT traffic_task_details_demand_type_chk CHECK (
    demand_type IN (
      'nova_campanha', 'publicacao', 'revisao_24h', 'revisao_72h',
      'analise', 'orcamento', 'criativo', 'relatorio',
      'cobranca_material', 'aprovacao_cliente', 'pausa_reativacao',
      'rastreamento', 'ajuste', 'outro'
    )
  );
UPDATE public.traffic_task_details SET source_type = 'manual' WHERE source_type IS NULL;
ALTER TABLE public.traffic_task_details ALTER COLUMN source_type SET DEFAULT 'manual';
ALTER TABLE public.traffic_task_details ALTER COLUMN source_type SET NOT NULL;
ALTER TABLE public.traffic_task_details DROP COLUMN IF EXISTS approval_status;

CREATE UNIQUE INDEX IF NOT EXISTS traffic_task_details_generation_key_uidx
  ON public.traffic_task_details (generation_key)
  WHERE generation_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS traffic_task_details_generated_from_idx
  ON public.traffic_task_details (generated_from_task_id);

CREATE TABLE IF NOT EXISTS public.paid_campaign_task_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tarefas(id) ON DELETE CASCADE,
  paid_campaign_id uuid NOT NULL REFERENCES public.paid_campaigns(id) ON DELETE CASCADE,
  relation_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT paid_campaign_task_links_rel_chk CHECK (
    relation_type IN ('origin', 'linked', 'legacy', 'review_24h', 'review_72h', 'affects')
  ),
  UNIQUE (task_id, paid_campaign_id, relation_type)
);

CREATE UNIQUE INDEX IF NOT EXISTS paid_campaign_task_links_one_origin
  ON public.paid_campaign_task_links (paid_campaign_id)
  WHERE relation_type = 'origin';

CREATE INDEX IF NOT EXISTS paid_campaign_task_links_task_idx
  ON public.paid_campaign_task_links (task_id);
CREATE INDEX IF NOT EXISTS paid_campaign_task_links_campaign_idx
  ON public.paid_campaign_task_links (paid_campaign_id);

CREATE TABLE IF NOT EXISTS public.traffic_completion_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tarefas(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES public.task_comments(id) ON DELETE RESTRICT,
  attachment_id uuid REFERENCES public.task_attachments(id) ON DELETE RESTRICT,
  campaign_id uuid REFERENCES public.paid_campaigns(id) ON DELETE RESTRICT,
  evidence_kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT traffic_completion_evidence_kind_chk CHECK (
    evidence_kind IN ('comment', 'attachment', 'campaign')
  ),
  CONSTRAINT traffic_completion_evidence_one_source_chk CHECK (
    num_nonnulls(comment_id, attachment_id, campaign_id) = 1
  ),
  CONSTRAINT traffic_completion_evidence_kind_match_chk CHECK (
    (evidence_kind = 'comment' AND comment_id IS NOT NULL)
    OR (evidence_kind = 'attachment' AND attachment_id IS NOT NULL)
    OR (evidence_kind = 'campaign' AND campaign_id IS NOT NULL)
  )
);

ALTER TABLE public.traffic_completion_evidence DROP CONSTRAINT IF EXISTS traffic_completion_evidence_source_chk;
ALTER TABLE public.traffic_completion_evidence DROP CONSTRAINT IF EXISTS traffic_completion_evidence_one_source_chk;
ALTER TABLE public.traffic_completion_evidence
  ADD CONSTRAINT traffic_completion_evidence_one_source_chk CHECK (
    num_nonnulls(comment_id, attachment_id, campaign_id) = 1
  );

ALTER TABLE public.traffic_completion_evidence
  DROP CONSTRAINT IF EXISTS traffic_completion_evidence_campaign_id_fkey;
ALTER TABLE public.traffic_completion_evidence
  ADD CONSTRAINT traffic_completion_evidence_campaign_id_fkey
  FOREIGN KEY (campaign_id) REFERENCES public.paid_campaigns(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS traffic_completion_evidence_task_idx
  ON public.traffic_completion_evidence (task_id);

CREATE TABLE IF NOT EXISTS public.traffic_central_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

INSERT INTO public.traffic_central_settings (id, enabled)
VALUES (true, false)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.traffic_central_allowed_profiles (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- 3. Helpers DEFINER (search_path seguro)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.central_trafego_caller_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.central_trafego_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(public.central_trafego_caller_role() IN ('superadmin', 'admin'), false)
$$;

CREATE OR REPLACE FUNCTION public.central_trafego_is_internal()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(public.central_trafego_caller_role() IN ('superadmin', 'admin', 'colaborador'), false)
$$;

CREATE OR REPLACE FUNCTION public.central_trafego_is_gestor(p_cliente_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.traffic_client_ops
    WHERE client_id = p_cliente_id
      AND primary_assignee_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.central_trafego_has_explicit_access(p_cliente_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.traffic_client_access
    WHERE client_id = p_cliente_id
      AND profile_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.central_trafego_can_access_client(p_cliente_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.central_trafego_is_admin()
    OR public.central_trafego_is_gestor(p_cliente_id)
    OR public.central_trafego_has_explicit_access(p_cliente_id)
$$;

CREATE OR REPLACE FUNCTION public.central_trafego_can_assign_others()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.central_trafego_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_module_access
      WHERE user_id = auth.uid()
        AND module_name IN ('tasks', 'paid_traffic')
        AND access_level = 'all'
    )
$$;

CREATE OR REPLACE FUNCTION public.central_trafego_can_see_task(p_task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.central_trafego_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.tarefas t
      WHERE t.id = p_task_id
        AND public.central_trafego_is_internal()
        AND (
          auth.uid() = t.owner_id
          OR auth.uid() = ANY (COALESCE(t.assignee_ids, ARRAY[]::uuid[]))
          OR public.central_trafego_can_access_client(t.client_id)
        )
    )
$$;

CREATE OR REPLACE FUNCTION public.central_trafego_ui_allowed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.central_trafego_is_internal()
    AND (
      public.central_trafego_is_admin()
      OR (
        COALESCE((SELECT enabled FROM public.traffic_central_settings WHERE id), false)
        AND EXISTS (
          SELECT 1 FROM public.traffic_central_allowed_profiles
          WHERE profile_id = auth.uid()
        )
      )
    )
$$;

CREATE OR REPLACE FUNCTION public.central_trafego_campaign_of_client(p_campaign_id uuid, p_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.paid_campaigns c
    WHERE c.id = p_campaign_id AND c.client_id = p_client_id
  )
$$;

CREATE OR REPLACE FUNCTION public.central_trafego_try_uuid(p_value text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN p_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN p_value::uuid
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.central_trafego_normalize_priority(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE lower(btrim(COALESCE(p_value, '')))
    WHEN 'alta' THEN 'high'
    WHEN 'high' THEN 'high'
    WHEN 'media' THEN 'medium'
    WHEN 'média' THEN 'medium'
    WHEN 'medium' THEN 'medium'
    WHEN 'baixa' THEN 'low'
    WHEN 'low' THEN 'low'
    ELSE 'medium'
  END
$$;

CREATE OR REPLACE FUNCTION public.central_trafego_operational_date()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date
$$;

CREATE OR REPLACE FUNCTION public.central_trafego_demand_requires_existing_campaign(p_demand_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT p_demand_type IN (
    'publicacao', 'ajuste', 'pausa_reativacao', 'relatorio', 'revisao_24h', 'revisao_72h'
  )
$$;

CREATE OR REPLACE FUNCTION public.central_trafego_kpis_valid(p_kpis jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN p_kpis IS NULL THEN true
    WHEN p_kpis = 'null'::jsonb THEN true
    WHEN jsonb_typeof(p_kpis) IS DISTINCT FROM 'array' THEN false
    ELSE NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_kpis) e
      WHERE jsonb_typeof(e) IS DISTINCT FROM 'object'
         OR COALESCE(btrim(e->>'name'), '') = ''
    )
  END
$$;

CREATE OR REPLACE FUNCTION public.central_trafego_min_comment_chars(p_demand_type text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN p_demand_type IN ('analise', 'orcamento', 'relatorio') THEN 80
    ELSE 20
  END
$$;

CREATE OR REPLACE FUNCTION public.central_trafego_assert_assignees(p_assignee_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_role text;
BEGIN
  IF p_assignee_ids IS NULL OR COALESCE(array_length(p_assignee_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Central de Tráfego: responsável obrigatório';
  END IF;
  FOREACH v_id IN ARRAY p_assignee_ids LOOP
    SELECT role INTO v_role FROM public.profiles WHERE id = v_id;
    IF v_role IS NULL THEN
      RAISE EXCEPTION 'Central de Tráfego: responsável % não existe', v_id;
    END IF;
    IF v_role NOT IN ('superadmin', 'admin', 'colaborador') THEN
      RAISE EXCEPTION 'Central de Tráfego: responsável % não é equipe interna', v_id;
    END IF;
  END LOOP;
  IF NOT public.central_trafego_can_assign_others() THEN
    IF EXISTS (SELECT 1 FROM unnest(p_assignee_ids) a(id) WHERE a.id IS DISTINCT FROM v_uid) THEN
      RAISE EXCEPTION 'Central de Tráfego: você só pode atribuir a demanda a si';
    END IF;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. RLS: SELECT autenticado conforme acesso; escrita de details/links/evidências só via RPC
-- ---------------------------------------------------------------------------
ALTER TABLE public.traffic_client_ops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traffic_client_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traffic_task_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paid_campaign_task_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traffic_completion_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traffic_central_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traffic_central_allowed_profiles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.traffic_client_ops FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.traffic_client_access FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.traffic_task_details FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.paid_campaign_task_links FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.traffic_completion_evidence FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.traffic_central_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.traffic_central_allowed_profiles FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.traffic_client_ops TO authenticated;
GRANT SELECT ON public.traffic_client_access TO authenticated;
GRANT SELECT ON public.traffic_task_details TO authenticated;
GRANT SELECT ON public.paid_campaign_task_links TO authenticated;
GRANT SELECT ON public.traffic_completion_evidence TO authenticated;
GRANT SELECT ON public.traffic_central_settings TO authenticated;
GRANT SELECT ON public.traffic_central_allowed_profiles TO authenticated;

GRANT SELECT, UPDATE ON public.traffic_central_settings TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.traffic_central_allowed_profiles TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.traffic_client_access TO authenticated;

GRANT ALL ON public.traffic_client_ops TO service_role;
GRANT ALL ON public.traffic_client_access TO service_role;
GRANT ALL ON public.traffic_task_details TO service_role;
GRANT ALL ON public.paid_campaign_task_links TO service_role;
GRANT ALL ON public.traffic_completion_evidence TO service_role;
GRANT ALL ON public.traffic_central_settings TO service_role;
GRANT ALL ON public.traffic_central_allowed_profiles TO service_role;

DROP POLICY IF EXISTS traffic_task_details_all ON public.traffic_task_details;
DROP POLICY IF EXISTS paid_campaign_task_links_all ON public.paid_campaign_task_links;
DROP POLICY IF EXISTS traffic_completion_evidence_all ON public.traffic_completion_evidence;
DROP POLICY IF EXISTS traffic_client_ops_write_admin ON public.traffic_client_ops;
DROP POLICY IF EXISTS traffic_client_ops_update_gestor ON public.traffic_client_ops;
DROP POLICY IF EXISTS traffic_client_ops_select ON public.traffic_client_ops;
CREATE POLICY traffic_client_ops_select ON public.traffic_client_ops
  FOR SELECT TO authenticated
  USING (
    public.central_trafego_is_internal()
    AND (
      public.central_trafego_is_admin()
      OR primary_assignee_id = auth.uid()
      OR public.central_trafego_has_explicit_access(client_id)
    )
  );

DROP POLICY IF EXISTS traffic_client_access_select ON public.traffic_client_access;
CREATE POLICY traffic_client_access_select ON public.traffic_client_access
  FOR SELECT TO authenticated
  USING (public.central_trafego_is_internal() AND (public.central_trafego_is_admin() OR profile_id = auth.uid()));

DROP POLICY IF EXISTS traffic_client_access_admin ON public.traffic_client_access;
CREATE POLICY traffic_client_access_admin ON public.traffic_client_access
  FOR ALL TO authenticated
  USING (public.central_trafego_is_admin())
  WITH CHECK (public.central_trafego_is_admin());

DROP POLICY IF EXISTS traffic_task_details_select ON public.traffic_task_details;
CREATE POLICY traffic_task_details_select ON public.traffic_task_details
  FOR SELECT TO authenticated
  USING (public.central_trafego_can_see_task(task_id));

DROP POLICY IF EXISTS paid_campaign_task_links_select ON public.paid_campaign_task_links;
CREATE POLICY paid_campaign_task_links_select ON public.paid_campaign_task_links
  FOR SELECT TO authenticated
  USING (public.central_trafego_can_see_task(task_id));

DROP POLICY IF EXISTS traffic_completion_evidence_select ON public.traffic_completion_evidence;
CREATE POLICY traffic_completion_evidence_select ON public.traffic_completion_evidence
  FOR SELECT TO authenticated
  USING (public.central_trafego_can_see_task(task_id));

DROP POLICY IF EXISTS traffic_central_settings_select ON public.traffic_central_settings;
CREATE POLICY traffic_central_settings_select ON public.traffic_central_settings
  FOR SELECT TO authenticated
  USING (public.central_trafego_is_internal());

DROP POLICY IF EXISTS traffic_central_settings_update ON public.traffic_central_settings;
CREATE POLICY traffic_central_settings_update ON public.traffic_central_settings
  FOR UPDATE TO authenticated
  USING (public.central_trafego_is_admin())
  WITH CHECK (public.central_trafego_is_admin());

DROP POLICY IF EXISTS traffic_central_allowed_select ON public.traffic_central_allowed_profiles;
CREATE POLICY traffic_central_allowed_select ON public.traffic_central_allowed_profiles
  FOR SELECT TO authenticated
  USING (public.central_trafego_is_internal());

DROP POLICY IF EXISTS traffic_central_allowed_write ON public.traffic_central_allowed_profiles;
CREATE POLICY traffic_central_allowed_write ON public.traffic_central_allowed_profiles
  FOR ALL TO authenticated
  USING (public.central_trafego_is_admin())
  WITH CHECK (public.central_trafego_is_admin());

CREATE OR REPLACE FUNCTION public.traffic_completion_evidence_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'Central de Tráfego: evidências são imutáveis';
END;
$$;

DROP TRIGGER IF EXISTS traffic_completion_evidence_no_update ON public.traffic_completion_evidence;
CREATE TRIGGER traffic_completion_evidence_no_update
  BEFORE UPDATE ON public.traffic_completion_evidence
  FOR EACH ROW
  EXECUTE PROCEDURE public.traffic_completion_evidence_immutable();

-- Conclusão da Central insere task_comments com pendencia_caixa no default (false)
-- e origem=trafego_conclusao. O trigger global da Caixa já ignora pendencia_caixa=false.
-- Esta migration NÃO substitui public.criar_pendencias_caixa_comentario().

-- ---------------------------------------------------------------------------
-- 5. RPCs de escrita DEFINER
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_traffic_demand(text, uuid, text, date, uuid[], text, jsonb, uuid, text, timestamptz);
DROP FUNCTION IF EXISTS public.complete_traffic_demand(uuid, text, boolean, text, text, date, text, uuid[], uuid[], text);

CREATE OR REPLACE FUNCTION public.create_traffic_demand(
  p_title text,
  p_client_id uuid,
  p_demand_type text,
  p_due_date date,
  p_priority text,
  p_assignee_ids uuid[],
  p_description text DEFAULT NULL,
  p_links jsonb DEFAULT '[]'::jsonb,
  p_campaign jsonb DEFAULT NULL,
  p_source_type text DEFAULT 'manual',
  p_source_reference text DEFAULT NULL,
  p_generated_from_task_id uuid DEFAULT NULL,
  p_generation_key text DEFAULT NULL,
  p_next_review_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_status text;
  v_task_id uuid;
  v_link jsonb;
  v_campaign_id uuid;
  v_rel text;
  v_camp_status text;
  v_camp_name text;
  v_camp_assignee uuid;
  v_camp_budget numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Central de Tráfego: não autenticado';
  END IF;
  IF NOT public.central_trafego_is_internal() THEN
    RAISE EXCEPTION 'Central de Tráfego: apenas equipe interna pode criar demanda';
  END IF;
  IF NOT public.central_trafego_ui_allowed() THEN
    RAISE EXCEPTION 'Central de Tráfego: UI/RPC não liberada para este perfil';
  END IF;
  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'Central de Tráfego: título obrigatório';
  END IF;
  IF p_client_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = p_client_id) THEN
    RAISE EXCEPTION 'Central de Tráfego: cliente obrigatório';
  END IF;
  IF NOT public.central_trafego_can_access_client(p_client_id) THEN
    IF p_generated_from_task_id IS NULL OR NOT public.central_trafego_can_see_task(p_generated_from_task_id) THEN
      RAISE EXCEPTION 'Central de Tráfego: sem acesso a este cliente';
    END IF;
  END IF;
  IF p_due_date IS NULL THEN
    RAISE EXCEPTION 'Central de Tráfego: prazo obrigatório';
  END IF;
  p_priority := public.central_trafego_normalize_priority(p_priority);
  IF p_demand_type IS NULL OR p_demand_type NOT IN (
    'nova_campanha', 'publicacao', 'revisao_24h', 'revisao_72h',
    'analise', 'orcamento', 'criativo', 'relatorio',
    'cobranca_material', 'aprovacao_cliente', 'pausa_reativacao',
    'rastreamento', 'ajuste', 'outro'
  ) THEN
    RAISE EXCEPTION 'Central de Tráfego: demand_type inválido';
  END IF;
  IF COALESCE(p_source_type, 'manual') NOT IN ('manual', 'review', 'legacy', 'successor', 'system') THEN
    RAISE EXCEPTION 'Central de Tráfego: source_type inválido';
  END IF;

  PERFORM public.central_trafego_assert_assignees(p_assignee_ids);

  SELECT value INTO v_status FROM public.task_statuses WHERE is_initial LIMIT 1;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Central de Tráfego: nenhum status inicial configurado em task_statuses.is_initial';
  END IF;

  IF p_generated_from_task_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.tarefas src
      WHERE src.id = p_generated_from_task_id AND src.client_id = p_client_id
    ) THEN
      RAISE EXCEPTION 'Central de Tráfego: tarefa geradora inválida ou de outro cliente';
    END IF;
    IF NOT public.central_trafego_can_see_task(p_generated_from_task_id) THEN
      RAISE EXCEPTION 'Central de Tráfego: sem acesso à tarefa geradora';
    END IF;
  END IF;

  IF p_demand_type = 'nova_campanha' THEN
    IF p_links IS NOT NULL AND jsonb_typeof(p_links) = 'array' AND jsonb_array_length(p_links) > 0 THEN
      RAISE EXCEPTION 'Central de Tráfego: nova campanha não vincula campanha existente';
    END IF;
    IF p_campaign IS NULL OR jsonb_typeof(p_campaign) <> 'object' THEN
      RAISE EXCEPTION 'Central de Tráfego: dados da nova campanha obrigatórios';
    END IF;
  END IF;

  INSERT INTO public.tarefas (
    title, description, client_id, type, status, due_date, priority, owner_id, assignee_ids, status_history
  ) VALUES (
    btrim(p_title),
    NULLIF(btrim(COALESCE(p_description, '')), ''),
    p_client_id,
    'paid_traffic',
    v_status,
    p_due_date,
    p_priority,
    v_uid,
    p_assignee_ids,
    jsonb_build_array(jsonb_build_object(
      'status', v_status,
      'user_id', v_uid,
      'timestamp', to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'assignee_ids', to_jsonb(p_assignee_ids)
    ))
  )
  RETURNING id INTO v_task_id;

  INSERT INTO public.traffic_task_details (
    task_id, demand_type, source_type, source_reference,
    generated_from_task_id, generation_key, next_review_at
  ) VALUES (
    v_task_id,
    p_demand_type,
    COALESCE(NULLIF(p_source_type, ''), 'manual'),
    NULLIF(p_source_reference, ''),
    p_generated_from_task_id,
    NULLIF(p_generation_key, ''),
    p_next_review_at
  );

  IF p_demand_type = 'nova_campanha' THEN
    v_camp_name := NULLIF(btrim(COALESCE(p_campaign->>'name', '')), '');
    IF v_camp_name IS NULL THEN
      RAISE EXCEPTION 'Central de Tráfego: nome da campanha obrigatório';
    END IF;
    BEGIN
      v_camp_budget := NULLIF(p_campaign->>'budget', '')::numeric;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Central de Tráfego: orçamento da campanha inválido';
    END;
    IF v_camp_budget IS NULL OR v_camp_budget <= 0 THEN
      RAISE EXCEPTION 'Central de Tráfego: orçamento da campanha deve ser maior que zero';
    END IF;
    IF NOT public.central_trafego_kpis_valid(p_campaign->'kpis') THEN
      RAISE EXCEPTION 'Central de Tráfego: kpis da campanha em formato inválido';
    END IF;
    v_camp_assignee := public.central_trafego_try_uuid(p_campaign->>'assignee_id');
    IF v_camp_assignee IS NULL THEN
      RAISE EXCEPTION 'Central de Tráfego: responsável da campanha obrigatório';
    END IF;
    PERFORM public.central_trafego_assert_assignees(ARRAY[v_camp_assignee]);

    SELECT value INTO v_camp_status
    FROM public.paid_campaign_statuses
    WHERE lifecycle = 'planning' AND value = 'planning'
    LIMIT 1;
    IF v_camp_status IS NULL THEN
      SELECT value INTO v_camp_status FROM public.paid_campaign_statuses WHERE lifecycle = 'planning' LIMIT 1;
    END IF;
    IF v_camp_status IS NULL THEN
      RAISE EXCEPTION 'Central de Tráfego: nenhum status de campanha com lifecycle=planning';
    END IF;

    INSERT INTO public.paid_campaigns (
      name, description, budget, kpis, client_id, owner_id, assignee_id, status, ad_sets
    ) VALUES (
      v_camp_name,
      NULLIF(btrim(COALESCE(p_campaign->>'description', '')), ''),
      v_camp_budget,
      COALESCE(p_campaign->'kpis', '[]'::jsonb),
      p_client_id,
      v_uid,
      v_camp_assignee,
      v_camp_status,
      '[]'::jsonb
    )
    RETURNING id INTO v_campaign_id;

    INSERT INTO public.paid_campaign_task_links (task_id, paid_campaign_id, relation_type, created_by)
    VALUES (v_task_id, v_campaign_id, 'origin', v_uid);
  ELSIF p_links IS NOT NULL AND jsonb_typeof(p_links) = 'array' THEN
    FOR v_link IN SELECT * FROM jsonb_array_elements(p_links)
    LOOP
      v_campaign_id := public.central_trafego_try_uuid(v_link->>'paid_campaign_id');
      v_rel := COALESCE(NULLIF(v_link->>'relation_type', ''), 'linked');
      IF v_campaign_id IS NULL THEN
        CONTINUE;
      END IF;
      IF NOT public.central_trafego_campaign_of_client(v_campaign_id, p_client_id) THEN
        RAISE EXCEPTION 'Central de Tráfego: campanha % não pertence ao cliente da demanda', v_campaign_id;
      END IF;
      INSERT INTO public.paid_campaign_task_links (task_id, paid_campaign_id, relation_type, created_by)
      VALUES (v_task_id, v_campaign_id, v_rel, v_uid)
      ON CONFLICT (task_id, paid_campaign_id, relation_type) DO NOTHING;
    END LOOP;
  END IF;

  IF public.central_trafego_demand_requires_existing_campaign(p_demand_type)
     AND NOT EXISTS (SELECT 1 FROM public.paid_campaign_task_links l WHERE l.task_id = v_task_id) THEN
    RAISE EXCEPTION 'Central de Tráfego: este tipo exige campanha válida do mesmo cliente';
  END IF;

  RETURN v_task_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_traffic_demand(
  p_task_id uuid,
  p_completion_summary text,
  p_next_action_none boolean DEFAULT false,
  p_successor_title text DEFAULT NULL,
  p_successor_demand_type text DEFAULT NULL,
  p_successor_due_date date DEFAULT NULL,
  p_successor_priority text DEFAULT NULL,
  p_successor_assignee_ids uuid[] DEFAULT NULL,
  p_comment_content text DEFAULT NULL,
  p_attachment_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_evidence_campaign_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_terminal_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_task public.tarefas%ROWTYPE;
  v_details public.traffic_task_details%ROWTYPE;
  v_terminal text;
  v_history jsonb;
  v_comment_id uuid;
  v_att uuid;
  v_campaign uuid;
  v_ok boolean := false;
  v_review_id uuid;
  v_key text;
  v_successor uuid;
  v_created_reviews int := 0;
  v_auto boolean;
  v_comment text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Central de Tráfego: não autenticado';
  END IF;
  IF NOT public.central_trafego_is_internal() THEN
    RAISE EXCEPTION 'Central de Tráfego: apenas equipe interna pode concluir demanda';
  END IF;
  IF NOT public.central_trafego_ui_allowed() THEN
    RAISE EXCEPTION 'Central de Tráfego: UI/RPC não liberada para este perfil';
  END IF;
  IF p_task_id IS NULL THEN
    RAISE EXCEPTION 'Central de Tráfego: task_id obrigatório';
  END IF;
  IF p_completion_summary IS NULL OR char_length(btrim(p_completion_summary)) < 8 THEN
    RAISE EXCEPTION 'Central de Tráfego: resumo de conclusão obrigatório';
  END IF;

  SELECT * INTO v_task FROM public.tarefas WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Central de Tráfego: tarefa não encontrada';
  END IF;
  IF v_task.type IS DISTINCT FROM 'paid_traffic' THEN
    RAISE EXCEPTION 'Central de Tráfego: somente tarefas type=paid_traffic podem ser concluídas nesta RPC';
  END IF;
  IF NOT public.central_trafego_can_see_task(p_task_id) THEN
    RAISE EXCEPTION 'Central de Tráfego: sem acesso a esta demanda';
  END IF;
  IF NOT (
    public.central_trafego_is_admin()
    OR public.central_trafego_can_access_client(v_task.client_id)
    OR auth.uid() = v_task.owner_id
    OR auth.uid() = ANY (COALESCE(v_task.assignee_ids, ARRAY[]::uuid[]))
  ) THEN
    RAISE EXCEPTION 'Central de Tráfego: sem acesso a esta demanda';
  END IF;

  IF EXISTS (SELECT 1 FROM public.task_statuses s WHERE s.value = v_task.status AND s.is_terminal) THEN
    RAISE EXCEPTION 'Central de Tráfego: demanda já está terminal';
  END IF;

  SELECT * INTO v_details FROM public.traffic_task_details WHERE task_id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Central de Tráfego: demanda sem traffic_task_details';
  END IF;

  v_auto := v_details.demand_type IN ('nova_campanha', 'publicacao');
  IF v_auto THEN
    IF p_next_action_none THEN
      RAISE EXCEPTION 'Central de Tráfego: publicação/nova campanha gera revisões 24h e 72h; next_action_none não é permitido';
    END IF;
    IF p_successor_title IS NOT NULL AND btrim(p_successor_title) <> '' THEN
      RAISE EXCEPTION 'Central de Tráfego: não informe sucessora manual; as revisões são a próxima ação';
    END IF;
  ELSE
    IF NOT p_next_action_none AND (p_successor_title IS NULL OR btrim(p_successor_title) = '') THEN
      RAISE EXCEPTION 'Central de Tráfego: informe a sucessora ou next_action_none';
    END IF;
    IF p_next_action_none AND p_successor_title IS NOT NULL AND btrim(p_successor_title) <> '' THEN
      RAISE EXCEPTION 'Central de Tráfego: sucessora e next_action_none são exclusivos';
    END IF;
    IF NOT p_next_action_none THEN
      IF p_successor_due_date IS NULL THEN
        RAISE EXCEPTION 'Central de Tráfego: a sucessora exige prazo';
      END IF;
      p_successor_priority := public.central_trafego_normalize_priority(p_successor_priority);
      PERFORM public.central_trafego_assert_assignees(COALESCE(p_successor_assignee_ids, v_task.assignee_ids));
    END IF;
  END IF;

  IF p_terminal_status IS NOT NULL THEN
    v_terminal := p_terminal_status;
    IF NOT EXISTS (SELECT 1 FROM public.task_statuses WHERE value = v_terminal AND is_terminal) THEN
      RAISE EXCEPTION 'Central de Tráfego: status % não é terminal', v_terminal;
    END IF;
  ELSE
    SELECT value INTO v_terminal FROM public.task_statuses WHERE is_terminal AND value = 'published';
    IF v_terminal IS NULL THEN
      SELECT value INTO v_terminal FROM public.task_statuses WHERE is_terminal ORDER BY value LIMIT 1;
    END IF;
    IF v_terminal IS NULL THEN
      RAISE EXCEPTION 'Central de Tráfego: nenhum status terminal configurado';
    END IF;
  END IF;

  v_comment := NULLIF(btrim(COALESCE(p_comment_content, '')), '');
  IF v_comment IS NOT NULL THEN
    IF COALESCE(array_length(p_attachment_ids, 1), 0) = 0
       AND COALESCE(array_length(p_evidence_campaign_ids, 1), 0) = 0
       AND char_length(v_comment) < public.central_trafego_min_comment_chars(v_details.demand_type) THEN
      RAISE EXCEPTION 'Central de Tráfego: comentário como única evidência exige pelo menos % caracteres',
        public.central_trafego_min_comment_chars(v_details.demand_type);
    END IF;
    IF v_details.demand_type IN ('analise', 'orcamento')
       AND char_length(v_comment) < public.central_trafego_min_comment_chars(v_details.demand_type) THEN
      RAISE EXCEPTION 'Central de Tráfego: análise/orçamento exige comentário de execução com pelo menos 80 caracteres';
    END IF;
    INSERT INTO public.task_comments (task_id, user_id, content, origem, pendencia_caixa)
    VALUES (p_task_id, v_uid, v_comment, 'trafego_conclusao', false)
    RETURNING id INTO v_comment_id;
    INSERT INTO public.traffic_completion_evidence (task_id, comment_id, evidence_kind, created_by)
    VALUES (p_task_id, v_comment_id, 'comment', v_uid);
    v_ok := true;
  END IF;

  IF p_attachment_ids IS NOT NULL THEN
    FOREACH v_att IN ARRAY p_attachment_ids
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM public.task_attachments a
        JOIN public.tarefas t ON t.id = a.task_id
        WHERE a.id = v_att
          AND t.client_id = v_task.client_id
      ) THEN
        RAISE EXCEPTION 'Central de Tráfego: anexo % não pertence a uma tarefa do mesmo cliente', v_att;
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.traffic_completion_evidence e
        WHERE e.attachment_id = v_att AND e.task_id = p_task_id
      ) THEN
        RAISE EXCEPTION 'Central de Tráfego: anexo % já foi usado nesta conclusão', v_att;
      END IF;
      INSERT INTO public.traffic_completion_evidence (task_id, attachment_id, evidence_kind, created_by)
      VALUES (p_task_id, v_att, 'attachment', v_uid);
      v_ok := true;
    END LOOP;
  END IF;

  IF p_evidence_campaign_ids IS NOT NULL THEN
    FOREACH v_campaign IN ARRAY p_evidence_campaign_ids
    LOOP
      IF NOT public.central_trafego_campaign_of_client(v_campaign, v_task.client_id) THEN
        RAISE EXCEPTION 'Central de Tráfego: campanha % não pertence ao cliente da demanda', v_campaign;
      END IF;
      INSERT INTO public.paid_campaign_task_links (task_id, paid_campaign_id, relation_type, created_by)
      VALUES (p_task_id, v_campaign, 'linked', v_uid)
      ON CONFLICT (task_id, paid_campaign_id, relation_type) DO NOTHING;
      INSERT INTO public.traffic_completion_evidence (task_id, campaign_id, evidence_kind, created_by)
      VALUES (p_task_id, v_campaign, 'campaign', v_uid);
      v_ok := true;
    END LOOP;
  END IF;

  IF v_details.demand_type IN ('nova_campanha', 'publicacao') THEN
    IF NOT v_ok THEN
      RAISE EXCEPTION 'Central de Tráfego: publicação/nova campanha exige evidência selecionada nesta conclusão';
    END IF;
  ELSIF v_details.demand_type IN ('criativo', 'relatorio') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.traffic_completion_evidence
      WHERE task_id = p_task_id AND evidence_kind IN ('attachment', 'comment')
        AND created_by = v_uid AND created_at >= (now() - interval '1 minute')
    ) THEN
      RAISE EXCEPTION 'Central de Tráfego: criativo/relatório exige anexo da tarefa ou comentário mínimo';
    END IF;
  ELSIF v_details.demand_type IN ('analise', 'orcamento') THEN
    IF v_comment_id IS NULL THEN
      RAISE EXCEPTION 'Central de Tráfego: análise/orçamento exige comentário de execução desta conclusão';
    END IF;
  ELSE
    IF NOT v_ok THEN
      RAISE EXCEPTION 'Central de Tráfego: evidência obrigatória nesta conclusão';
    END IF;
  END IF;

  v_history := COALESCE(v_task.status_history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
    'status', v_terminal,
    'user_id', v_uid,
    'timestamp', to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'assignee_ids', to_jsonb(COALESCE(v_task.assignee_ids, ARRAY[]::uuid[]))
  ));

  UPDATE public.tarefas
  SET status = v_terminal, status_history = v_history
  WHERE id = p_task_id;

  UPDATE public.traffic_task_details
  SET
    completion_summary = btrim(p_completion_summary),
    next_action_none = CASE WHEN v_auto THEN false ELSE p_next_action_none END,
    updated_at = now()
  WHERE task_id = p_task_id;

  IF (NOT v_auto) AND (NOT p_next_action_none) THEN
    v_successor := public.create_traffic_demand(
      p_title := btrim(p_successor_title),
      p_client_id := v_task.client_id,
      p_demand_type := COALESCE(p_successor_demand_type, 'outro'),
      p_due_date := p_successor_due_date,
      p_priority := public.central_trafego_normalize_priority(COALESCE(p_successor_priority, v_task.priority)),
      p_assignee_ids := COALESCE(p_successor_assignee_ids, v_task.assignee_ids),
      p_source_type := 'successor',
      p_source_reference := p_task_id::text,
      p_generated_from_task_id := p_task_id,
      p_links := COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'paid_campaign_id', l.paid_campaign_id,
          'relation_type', 'linked'
        ))
        FROM public.paid_campaign_task_links l
        WHERE l.task_id = p_task_id
      ), '[]'::jsonb)
    );
  END IF;

  IF v_auto THEN
    FOR v_campaign IN
      SELECT DISTINCT l.paid_campaign_id
      FROM public.paid_campaign_task_links l
      JOIN public.paid_campaigns pc ON pc.id = l.paid_campaign_id
      WHERE l.task_id = p_task_id
        AND pc.client_id = v_task.client_id
    LOOP
      v_key := 'review:' || p_task_id::text || ':' || v_campaign::text || ':revisao_24h';
      BEGIN
        v_review_id := public.create_traffic_demand(
          p_title := 'Revisão 24h da campanha',
          p_client_id := v_task.client_id,
          p_demand_type := 'revisao_24h',
          p_due_date := public.central_trafego_operational_date() + 1,
          p_priority := public.central_trafego_normalize_priority(v_task.priority),
          p_assignee_ids := v_task.assignee_ids,
          p_source_type := 'review',
          p_source_reference := v_campaign::text,
          p_generated_from_task_id := p_task_id,
          p_generation_key := v_key,
          p_next_review_at := now() + interval '24 hours',
          p_links := jsonb_build_array(jsonb_build_object(
            'paid_campaign_id', v_campaign,
            'relation_type', 'review_24h'
          ))
        );
        v_created_reviews := v_created_reviews + 1;
      EXCEPTION WHEN unique_violation THEN
        NULL;
      END;

      v_key := 'review:' || p_task_id::text || ':' || v_campaign::text || ':revisao_72h';
      BEGIN
        v_review_id := public.create_traffic_demand(
          p_title := 'Revisão 72h da campanha',
          p_client_id := v_task.client_id,
          p_demand_type := 'revisao_72h',
          p_due_date := public.central_trafego_operational_date() + 3,
          p_priority := public.central_trafego_normalize_priority(v_task.priority),
          p_assignee_ids := v_task.assignee_ids,
          p_source_type := 'review',
          p_source_reference := v_campaign::text,
          p_generated_from_task_id := p_task_id,
          p_generation_key := v_key,
          p_next_review_at := now() + interval '72 hours',
          p_links := jsonb_build_array(jsonb_build_object(
            'paid_campaign_id', v_campaign,
            'relation_type', 'review_72h'
          ))
        );
        v_created_reviews := v_created_reviews + 1;
      EXCEPTION WHEN unique_violation THEN
        NULL;
      END;
    END LOOP;
    IF v_created_reviews = 0 AND NOT EXISTS (
      SELECT 1 FROM public.paid_campaign_task_links l WHERE l.task_id = p_task_id
    ) THEN
      RAISE EXCEPTION 'Central de Tráfego: publicação/nova campanha precisa de campanha vinculada para gerar revisões';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'task_id', p_task_id,
    'successor_task_id', v_successor,
    'reviews_created', v_created_reviews
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_traffic_client_ops(
  p_client_id uuid,
  p_primary_assignee_id uuid DEFAULT NULL,
  p_situation text DEFAULT 'active',
  p_situation_reason text DEFAULT NULL,
  p_resume_at date DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_existing public.traffic_client_ops%ROWTYPE;
  v_assignee uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Central de Tráfego: não autenticado';
  END IF;
  IF NOT public.central_trafego_ui_allowed() THEN
    RAISE EXCEPTION 'Central de Tráfego: UI/RPC não liberada para este perfil';
  END IF;
  IF p_client_id IS NULL THEN
    RAISE EXCEPTION 'Central de Tráfego: cliente obrigatório';
  END IF;
  IF p_situation IS NULL OR p_situation NOT IN (
    'active', 'onboarding', 'needs_review', 'waiting_client', 'temporarily_paused', 'no_campaign_expected', 'closed'
  ) THEN
    RAISE EXCEPTION 'Central de Tráfego: situação inválida';
  END IF;

  SELECT * INTO v_existing FROM public.traffic_client_ops WHERE client_id = p_client_id;

  IF public.central_trafego_is_admin() THEN
    v_assignee := p_primary_assignee_id;
  ELSE
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Central de Tráfego: só admin cria ficha operacional';
    END IF;
    IF v_existing.primary_assignee_id IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'Central de Tráfego: só o gestor oficial ou admin altera esta ficha';
    END IF;
    v_assignee := v_existing.primary_assignee_id;
  END IF;

  INSERT INTO public.traffic_client_ops (
    client_id, primary_assignee_id, situation, situation_reason, resume_at, updated_at, updated_by
  ) VALUES (
    p_client_id, v_assignee, p_situation, NULLIF(p_situation_reason, ''), p_resume_at, now(), v_uid
  )
  ON CONFLICT (client_id) DO UPDATE SET
    primary_assignee_id = EXCLUDED.primary_assignee_id,
    situation = EXCLUDED.situation,
    situation_reason = EXCLUDED.situation_reason,
    resume_at = EXCLUDED.resume_at,
    updated_at = EXCLUDED.updated_at,
    updated_by = EXCLUDED.updated_by;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. RPCs de leitura com escopo (não filtrar carteira no JavaScript)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.central_trafego_task_json(p_task_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'id', t.id,
    'title', t.title,
    'description', t.description,
    'status', t.status,
    'due_date', t.due_date,
    'priority', t.priority,
    'client_id', t.client_id,
    'client_empresa', cl.empresa,
    'assignee_ids', t.assignee_ids,
    'owner_id', t.owner_id,
    'demand_type', d.demand_type,
    'source_type', d.source_type,
    'source_reference', d.source_reference,
    'next_review_at', d.next_review_at,
    'details', to_jsonb(d),
    'situation', ops.situation,
    'campaigns', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', pc.id,
        'name', pc.name,
        'client_id', pc.client_id,
        'status', pc.status,
        'relation_type', l.relation_type
      ))
      FROM public.paid_campaign_task_links l
      JOIN public.paid_campaigns pc ON pc.id = l.paid_campaign_id
      WHERE l.task_id = t.id AND pc.client_id = t.client_id
    ), '[]'::jsonb)
  )
  FROM public.tarefas t
  JOIN public.traffic_task_details d ON d.task_id = t.id
  JOIN public.clientes cl ON cl.id = t.client_id
  LEFT JOIN public.traffic_client_ops ops ON ops.client_id = t.client_id
  WHERE t.id = p_task_id
$$;

CREATE OR REPLACE FUNCTION public.central_trafego_hoje()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := public.central_trafego_operational_date();
  v_now timestamptz := now();
  v_horizon timestamptz := now() + interval '48 hours';
  v_out jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Central de Tráfego: não autenticado';
  END IF;
  IF NOT public.central_trafego_ui_allowed() THEN
    RAISE EXCEPTION 'Central de Tráfego: UI/RPC não liberada para este perfil';
  END IF;

  WITH scoped AS (
    SELECT t.id,
      public.central_trafego_task_json(t.id) AS payload,
      t.due_date,
      d.demand_type,
      d.next_review_at,
      ops.situation
    FROM public.tarefas t
    JOIN public.traffic_task_details d ON d.task_id = t.id
    LEFT JOIN public.traffic_client_ops ops ON ops.client_id = t.client_id
    WHERE t.type = 'paid_traffic'
      AND public.central_trafego_can_see_task(t.id)
      AND NOT EXISTS (
        SELECT 1 FROM public.task_statuses s
        WHERE s.value = t.status AND s.is_terminal
      )
  ),
  classified AS (
    SELECT
      id,
      payload,
      CASE
        WHEN due_date IS NOT NULL AND due_date < v_today THEN 'atrasadas'
        WHEN due_date IS NOT NULL AND due_date = v_today THEN 'vencem_hoje'
        WHEN demand_type IN ('revisao_24h', 'revisao_72h')
          AND (
            (due_date IS NOT NULL AND due_date > v_today AND due_date <= (v_today + 2))
            OR (next_review_at IS NOT NULL AND next_review_at >= v_now AND next_review_at <= v_horizon)
          )
          THEN 'revisoes_48h'
        WHEN situation = 'waiting_client'
          OR demand_type IN ('cobranca_material', 'aprovacao_cliente')
          THEN 'aguardando_cliente'
        WHEN demand_type = 'publicacao' THEN 'publicacoes_pendentes'
        ELSE 'demais'
      END AS bucket
    FROM scoped
  )
  SELECT jsonb_build_object(
    'atrasadas', COALESCE((SELECT jsonb_agg(payload ORDER BY (payload->>'due_date')) FROM classified WHERE bucket = 'atrasadas'), '[]'::jsonb),
    'vencem_hoje', COALESCE((SELECT jsonb_agg(payload ORDER BY (payload->>'due_date')) FROM classified WHERE bucket = 'vencem_hoje'), '[]'::jsonb),
    'revisoes_48h', COALESCE((SELECT jsonb_agg(payload ORDER BY (payload->>'due_date')) FROM classified WHERE bucket = 'revisoes_48h'), '[]'::jsonb),
    'aguardando_cliente', COALESCE((SELECT jsonb_agg(payload ORDER BY (payload->>'due_date')) FROM classified WHERE bucket = 'aguardando_cliente'), '[]'::jsonb),
    'publicacoes_pendentes', COALESCE((SELECT jsonb_agg(payload ORDER BY (payload->>'due_date')) FROM classified WHERE bucket = 'publicacoes_pendentes'), '[]'::jsonb),
    'demais', COALESCE((SELECT jsonb_agg(payload ORDER BY (payload->>'due_date')) FROM classified WHERE bucket = 'demais'), '[]'::jsonb),
    'clients', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'empresa', c.empresa) ORDER BY c.empresa)
      FROM public.clientes c
      WHERE public.central_trafego_can_access_client(c.id)
        AND (
          EXISTS (SELECT 1 FROM public.cliente_meta_accounts m WHERE m.cliente_id = c.id)
          OR EXISTS (SELECT 1 FROM public.paid_campaigns pc WHERE pc.client_id = c.id)
          OR EXISTS (SELECT 1 FROM public.tarefas t WHERE t.client_id = c.id AND t.type = 'paid_traffic')
          OR EXISTS (SELECT 1 FROM public.traffic_client_ops o WHERE o.client_id = c.id)
        )
    ), '[]'::jsonb),
    'campaigns', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', pc.id, 'name', pc.name, 'client_id', pc.client_id, 'status', pc.status, 'budget', pc.budget
      ) ORDER BY pc.name)
      FROM public.paid_campaigns pc
      WHERE public.central_trafego_can_access_client(pc.client_id)
    ), '[]'::jsonb),
    'team', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', p.id, 'full_name', p.full_name, 'role', p.role) ORDER BY p.full_name)
      FROM public.profiles p
      WHERE p.role IN ('superadmin', 'admin', 'colaborador')
        AND public.central_trafego_is_admin()
    ), '[]'::jsonb),
    'attachments_by_task', '{}'::jsonb
  )
  INTO v_out;

  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.central_trafego_situacao()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := public.central_trafego_operational_date();
  v_out jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Central de Tráfego: não autenticado';
  END IF;
  IF NOT public.central_trafego_ui_allowed() THEN
    RAISE EXCEPTION 'Central de Tráfego: UI/RPC não liberada para este perfil';
  END IF;

  WITH ops_clients AS (
    SELECT c.id, c.empresa, c.meta_resumo
    FROM public.clientes c
    WHERE public.central_trafego_can_access_client(c.id)
      AND (
        EXISTS (SELECT 1 FROM public.cliente_meta_accounts m WHERE m.cliente_id = c.id)
        OR EXISTS (SELECT 1 FROM public.paid_campaigns pc WHERE pc.client_id = c.id)
        OR EXISTS (SELECT 1 FROM public.tarefas t WHERE t.client_id = c.id AND t.type = 'paid_traffic')
        OR EXISTS (SELECT 1 FROM public.traffic_client_ops o WHERE o.client_id = c.id)
      )
  ),
  rows AS (
    SELECT
      oc.id AS client_id,
      oc.empresa,
      ops.primary_assignee_id AS gestor_id,
      gp.full_name AS gestor_name,
      ops.situation,
      ops.situation_reason,
      ops.resume_at,
      ops.updated_at AS ops_updated_at,
      oc.meta_resumo,
      (
        SELECT count(*) FROM public.tarefas t
        JOIN public.traffic_task_details d ON d.task_id = t.id
        WHERE t.client_id = oc.id AND t.type = 'paid_traffic'
          AND NOT EXISTS (SELECT 1 FROM public.task_statuses s WHERE s.value = t.status AND s.is_terminal)
      ) AS open_tasks,
      (
        SELECT count(*) FROM public.tarefas t
        JOIN public.traffic_task_details d ON d.task_id = t.id
        WHERE t.client_id = oc.id AND t.type = 'paid_traffic'
          AND t.due_date < v_today
          AND NOT EXISTS (SELECT 1 FROM public.task_statuses s WHERE s.value = t.status AND s.is_terminal)
      ) AS overdue_tasks,
      (
        SELECT count(*) FROM public.tarefas t
        JOIN public.traffic_task_details d ON d.task_id = t.id
        WHERE t.client_id = oc.id AND t.type = 'paid_traffic'
          AND d.demand_type IN ('cobranca_material', 'aprovacao_cliente')
          AND NOT EXISTS (SELECT 1 FROM public.task_statuses s WHERE s.value = t.status AND s.is_terminal)
      ) AS pending_client_tasks,
      (
        SELECT to_jsonb(x) FROM (
          SELECT t.id AS task_id, t.title, t.due_date
          FROM public.tarefas t
          JOIN public.traffic_task_details d ON d.task_id = t.id
          WHERE t.client_id = oc.id AND t.type = 'paid_traffic'
            AND NOT EXISTS (SELECT 1 FROM public.task_statuses s WHERE s.value = t.status AND s.is_terminal)
          ORDER BY t.due_date NULLS LAST, t.created_at
          LIMIT 1
        ) x
      ) AS next_action,
      (
        SELECT to_jsonb(x) FROM (
          SELECT t.id AS task_id, t.title, t.due_date, d.next_review_at
          FROM public.tarefas t
          JOIN public.traffic_task_details d ON d.task_id = t.id
          WHERE t.client_id = oc.id AND t.type = 'paid_traffic'
            AND d.demand_type IN ('revisao_24h', 'revisao_72h')
            AND NOT EXISTS (SELECT 1 FROM public.task_statuses s WHERE s.value = t.status AND s.is_terminal)
          ORDER BY COALESCE(d.next_review_at::date, t.due_date) NULLS LAST
          LIMIT 1
        ) x
      ) AS next_review,
      (
        SELECT count(*) FROM public.paid_campaigns pc
        JOIN public.paid_campaign_statuses st ON st.value = pc.status
        WHERE pc.client_id = oc.id AND st.lifecycle = 'active'
      ) AS active_campaigns,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', pc.id, 'name', pc.name))
        FROM public.paid_campaigns pc
        WHERE pc.client_id = oc.id
          AND NOT EXISTS (
            SELECT 1
            FROM public.paid_campaign_task_links l
            JOIN public.tarefas t ON t.id = l.task_id
            WHERE l.paid_campaign_id = pc.id
              AND t.type = 'paid_traffic'
              AND NOT EXISTS (SELECT 1 FROM public.task_statuses s WHERE s.value = t.status AND s.is_terminal)
          )
      ), '[]'::jsonb) AS campaigns_without_demand
    FROM ops_clients oc
    LEFT JOIN public.traffic_client_ops ops ON ops.client_id = oc.id
    LEFT JOIN public.profiles gp ON gp.id = ops.primary_assignee_id
  )
  SELECT jsonb_build_object(
    'rows', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'client_id', r.client_id,
        'empresa', r.empresa,
        'gestor_id', r.gestor_id,
        'gestor_name', r.gestor_name,
        'situation', r.situation,
        'situation_reason', r.situation_reason,
        'resume_at', r.resume_at,
        'next_action', r.next_action,
        'next_review', r.next_review,
        'open_tasks', r.open_tasks,
        'overdue_tasks', r.overdue_tasks,
        'client_pending', (CASE WHEN r.situation = 'waiting_client' THEN 1 ELSE 0 END) + r.pending_client_tasks,
        'pending_gestor', r.gestor_id IS NULL,
        'next_action_overdue', CASE
          WHEN r.next_action ? 'due_date' AND NULLIF(r.next_action->>'due_date', '') IS NOT NULL
            THEN (r.next_action->>'due_date')::date < v_today
          ELSE false
        END,
        'active_campaigns', r.active_campaigns,
        'campaigns_without_demand', CASE
          WHEN r.situation = 'no_campaign_expected' THEN '[]'::jsonb
          ELSE r.campaigns_without_demand
        END,
        'meta_resumo', r.meta_resumo,
        'updated_at', r.ops_updated_at
      ) ORDER BY (r.gestor_id IS NULL) DESC, r.empresa)
      FROM rows r
    ), '[]'::jsonb),
    'team', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', p.id, 'full_name', p.full_name, 'role', p.role) ORDER BY p.full_name)
      FROM public.profiles p
      WHERE p.role IN ('superadmin', 'admin', 'colaborador')
        AND public.central_trafego_is_admin()
    ), '[]'::jsonb)
  )
  INTO v_out;

  RETURN v_out;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Backfill legado
-- ---------------------------------------------------------------------------
INSERT INTO public.traffic_task_details (task_id, demand_type, source_type, source_reference)
SELECT t.id, 'outro', 'legacy', t.id::text
FROM public.tarefas t
WHERE t.type = 'paid_traffic'
ON CONFLICT (task_id) DO NOTHING;

INSERT INTO public.paid_campaign_task_links (task_id, paid_campaign_id, relation_type)
SELECT
  parsed.task_uuid,
  pc.id,
  'legacy'
FROM public.paid_campaigns pc
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(pc.ad_sets) = 'array' THEN pc.ad_sets ELSE '[]'::jsonb END
) AS aset
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(aset->'ads') = 'array' THEN aset->'ads' ELSE '[]'::jsonb END
) AS ad
CROSS JOIN LATERAL (
  SELECT public.central_trafego_try_uuid(ad->>'task_id') AS task_uuid
) parsed
JOIN public.tarefas t ON t.id = parsed.task_uuid
WHERE parsed.task_uuid IS NOT NULL
  AND t.client_id IS NOT NULL
  AND pc.client_id IS NOT NULL
  AND t.client_id = pc.client_id
ON CONFLICT (task_id, paid_campaign_id, relation_type) DO NOTHING;

UPDATE public.tarefas
SET priority = public.central_trafego_normalize_priority(priority)
WHERE type = 'paid_traffic';

INSERT INTO public.traffic_client_ops (client_id, primary_assignee_id, situation)
SELECT DISTINCT c.id, NULL::uuid, 'needs_review'::text
FROM public.clientes c
WHERE EXISTS (SELECT 1 FROM public.cliente_meta_accounts m WHERE m.cliente_id = c.id)
   OR EXISTS (SELECT 1 FROM public.paid_campaigns pc WHERE pc.client_id = c.id)
   OR EXISTS (SELECT 1 FROM public.tarefas t WHERE t.client_id = c.id AND t.type = 'paid_traffic')
ON CONFLICT (client_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 8. Grants das RPCs
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.central_trafego_caller_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.central_trafego_is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.central_trafego_is_internal() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.central_trafego_is_gestor(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.central_trafego_has_explicit_access(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.central_trafego_can_access_client(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.central_trafego_can_assign_others() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.central_trafego_can_see_task(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.central_trafego_ui_allowed() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.central_trafego_campaign_of_client(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.central_trafego_try_uuid(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.central_trafego_normalize_priority(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.central_trafego_operational_date() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.central_trafego_demand_requires_existing_campaign(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.central_trafego_kpis_valid(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.central_trafego_min_comment_chars(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.central_trafego_assert_assignees(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.central_trafego_task_json(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_traffic_demand(text, uuid, text, date, text, uuid[], text, jsonb, jsonb, text, text, uuid, text, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_traffic_demand(uuid, text, boolean, text, text, date, text, uuid[], text, uuid[], uuid[], text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_traffic_client_ops(uuid, uuid, text, text, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.central_trafego_hoje() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.central_trafego_situacao() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.central_trafego_caller_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.central_trafego_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.central_trafego_is_internal() TO authenticated;
GRANT EXECUTE ON FUNCTION public.central_trafego_is_gestor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.central_trafego_has_explicit_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.central_trafego_can_access_client(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.central_trafego_can_assign_others() TO authenticated;
GRANT EXECUTE ON FUNCTION public.central_trafego_can_see_task(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.central_trafego_ui_allowed() TO authenticated;
GRANT EXECUTE ON FUNCTION public.central_trafego_campaign_of_client(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.central_trafego_try_uuid(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.central_trafego_normalize_priority(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.central_trafego_operational_date() TO authenticated;
GRANT EXECUTE ON FUNCTION public.central_trafego_demand_requires_existing_campaign(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.central_trafego_kpis_valid(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.central_trafego_min_comment_chars(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_traffic_demand(text, uuid, text, date, text, uuid[], text, jsonb, jsonb, text, text, uuid, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_traffic_demand(uuid, text, boolean, text, text, date, text, uuid[], text, uuid[], uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_traffic_client_ops(uuid, uuid, text, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.central_trafego_hoje() TO authenticated;
GRANT EXECUTE ON FUNCTION public.central_trafego_situacao() TO authenticated;

COMMENT ON TABLE public.traffic_central_settings IS
  'Flag da Central. Default false. Allowlist vazia NÃO libera colaborador. Não usar public_config.';
COMMENT ON TABLE public.traffic_completion_evidence IS
  'Evidências imutáveis (UPDATE bloqueado). Escrita só via complete_traffic_demand.';
COMMENT ON FUNCTION public.create_traffic_demand IS
  'Cria demanda. nova_campanha cria paid_campaigns + link origin. SECURITY DEFINER.';
COMMENT ON FUNCTION public.complete_traffic_demand IS
  'Conclui demanda com FOR UPDATE. Publicação/nova campanha geram 24h+72h por campanha.';

COMMIT;
