-- Fase 4.1 — escopo mensal versionado por cliente.

CREATE TABLE IF NOT EXISTS public.client_monthly_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  reference_month date NOT NULL,
  product text NOT NULL DEFAULT 'indefinido',
  deliverables jsonb NOT NULL DEFAULT '{}'::jsonb,
  channels text[] NOT NULL DEFAULT '{}',
  meta_ads boolean NOT NULL DEFAULT false,
  google_ads boolean NOT NULL DEFAULT false,
  media_goals jsonb NOT NULL DEFAULT '{}'::jsonb,
  account_owner_id uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  scope_exceptions text NULL,
  plan_status text NOT NULL DEFAULT 'planning',
  cloned_from_scope_id uuid NULL REFERENCES public.client_monthly_scopes(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL,
  CONSTRAINT client_monthly_scopes_month_start CHECK (reference_month = date_trunc('month', reference_month)::date),
  CONSTRAINT client_monthly_scopes_plan_status CHECK (plan_status IN ('no_plan', 'planning', 'approved')),
  CONSTRAINT client_monthly_scopes_unique_month UNIQUE (client_id, reference_month)
);

CREATE INDEX IF NOT EXISTS idx_client_monthly_scopes_month
  ON public.client_monthly_scopes(reference_month, client_id);

CREATE TABLE IF NOT EXISTS public.client_monthly_scope_history (
  id bigserial PRIMARY KEY,
  scope_id uuid NULL,
  client_id uuid NOT NULL,
  reference_month date NOT NULL,
  action text NOT NULL,
  before_data jsonb NULL,
  after_data jsonb NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid NULL
);

ALTER TABLE public.client_monthly_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_monthly_scope_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_monthly_scopes_read ON public.client_monthly_scopes;
CREATE POLICY client_monthly_scopes_read ON public.client_monthly_scopes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS client_monthly_scopes_manage ON public.client_monthly_scopes;
CREATE POLICY client_monthly_scopes_manage ON public.client_monthly_scopes
  FOR ALL TO authenticated
  USING (public.get_my_role() IN ('superadmin', 'admin'))
  WITH CHECK (public.get_my_role() IN ('superadmin', 'admin'));

DROP POLICY IF EXISTS client_monthly_scope_history_read ON public.client_monthly_scope_history;
CREATE POLICY client_monthly_scope_history_read ON public.client_monthly_scope_history
  FOR SELECT TO authenticated USING (public.get_my_role() IN ('superadmin', 'admin'));

GRANT SELECT ON public.client_monthly_scopes TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.client_monthly_scopes TO authenticated;
GRANT SELECT ON public.client_monthly_scope_history TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.client_monthly_scope_history_id_seq TO authenticated;
GRANT ALL ON public.client_monthly_scopes, public.client_monthly_scope_history TO service_role;

CREATE OR REPLACE FUNCTION public.client_monthly_scope_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.client_monthly_scope_history
      (scope_id, client_id, reference_month, action, after_data, changed_by)
    VALUES (NEW.id, NEW.client_id, NEW.reference_month, 'created', to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
    NEW.updated_by := coalesce(auth.uid(), NEW.updated_by);
    INSERT INTO public.client_monthly_scope_history
      (scope_id, client_id, reference_month, action, before_data, after_data, changed_by)
    VALUES (NEW.id, NEW.client_id, NEW.reference_month, 'updated', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSE
    INSERT INTO public.client_monthly_scope_history
      (scope_id, client_id, reference_month, action, before_data, changed_by)
    VALUES (OLD.id, OLD.client_id, OLD.reference_month, 'deleted', to_jsonb(OLD), auth.uid());
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_client_monthly_scope_audit ON public.client_monthly_scopes;
CREATE TRIGGER trg_client_monthly_scope_audit
BEFORE INSERT OR UPDATE OR DELETE ON public.client_monthly_scopes
FOR EACH ROW EXECUTE FUNCTION public.client_monthly_scope_audit();

CREATE OR REPLACE FUNCTION public.prepare_client_monthly_scopes(p_reference_month date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month date := date_trunc('month', p_reference_month)::date;
  v_inserted integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND public.get_my_role() NOT IN ('superadmin', 'admin') THEN
    RAISE EXCEPTION 'Sem permissão para preparar escopos mensais';
  END IF;

  INSERT INTO public.client_monthly_scopes (
    client_id,
    reference_month,
    product,
    deliverables,
    channels,
    meta_ads,
    google_ads,
    media_goals,
    account_owner_id,
    scope_exceptions,
    plan_status,
    cloned_from_scope_id,
    created_by,
    updated_by
  )
  SELECT
    c.id,
    v_month,
    coalesce(previous.product, nullif(c.tipo_servico, ''), 'indefinido'),
    jsonb_build_object(
      'posts', greatest(coalesce((coalesce(previous.deliverables, c.entregaveis, '{}'::jsonb)->>'posts')::integer, 0), 0),
      'videos', greatest(coalesce((coalesce(previous.deliverables, c.entregaveis, '{}'::jsonb)->>'videos')::integer, 0), 0),
      'stories', greatest(coalesce((coalesce(previous.deliverables, c.entregaveis, '{}'::jsonb)->>'stories')::integer, 0), 0),
      'anuncios', greatest(coalesce((coalesce(previous.deliverables, c.entregaveis, '{}'::jsonb)->>'anuncios')::integer, 0), 0),
      'carrosseis', greatest(coalesce((coalesce(previous.deliverables, c.entregaveis, '{}'::jsonb)->>'carrosseis')::integer, 0), 0)
    ),
    coalesce(previous.channels, '{}'::text[]),
    coalesce(previous.meta_ads, coalesce((c.entregaveis->>'anuncios')::integer, 0) > 0),
    coalesce(previous.google_ads, lower(coalesce(c.tipo_contrato, '')) LIKE '%google%'),
    coalesce(previous.media_goals, '{}'::jsonb),
    coalesce(previous.account_owner_id, owner_profile.id),
    previous.scope_exceptions,
    'planning',
    previous.id,
    auth.uid(),
    auth.uid()
  FROM public.clientes c
  LEFT JOIN LATERAL (
    SELECT s.*
    FROM public.client_monthly_scopes s
    WHERE s.client_id = c.id
      AND s.reference_month < v_month
    ORDER BY s.reference_month DESC
    LIMIT 1
  ) previous ON true
  LEFT JOIN public.profiles owner_profile
    ON owner_profile.id::text = nullif(btrim(c.responsavel), '')
  WHERE c.etapa = 'closed'
  ON CONFLICT (client_id, reference_month) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.prepare_client_monthly_scopes(date) TO authenticated, service_role;

COMMENT ON TABLE public.client_monthly_scopes IS
  'Snapshot editável e versionado do escopo contratado de cada cliente em cada mês.';
COMMENT ON COLUMN public.client_monthly_scopes.deliverables IS
  'Quantidades do mês: posts, videos, stories, anuncios e carrosseis.';
