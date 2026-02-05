-- =====================================================
-- MIGRATION: Pipeline, Stages e Eventos de Funil (CRM)
-- Descrição: crm_pipelines, crm_stages, crm_funnel_events,
--           crm_lead_interacoes, evolução de leads; migração de statuses.
-- =====================================================

-- 1. Tabela crm_pipelines (um ou mais por cliente)
CREATE TABLE IF NOT EXISTS public.crm_pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  nome text NOT NULL DEFAULT 'Pipeline principal',
  descricao text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_pipelines_cliente ON public.crm_pipelines (cliente_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clientes') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_schema = 'public' AND table_name = 'crm_pipelines' AND constraint_name = 'fk_crm_pipelines_cliente') THEN
      ALTER TABLE public.crm_pipelines
        ADD CONSTRAINT fk_crm_pipelines_cliente
        FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- 2. Tabela crm_stages (etapas por pipeline)
CREATE TABLE IF NOT EXISTS public.crm_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid NOT NULL,
  nome text NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  tempo_max_horas integer,
  tipo text NOT NULL DEFAULT 'intermediaria' CHECK (tipo IN ('intermediaria', 'ganho', 'perdido')),
  acoes_obrigatorias jsonb DEFAULT '[]'::jsonb,
  etapas_permitidas jsonb DEFAULT '[]'::jsonb,
  color text DEFAULT '#6b7280',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_stages_pipeline ON public.crm_stages (pipeline_id);
CREATE INDEX IF NOT EXISTS idx_crm_stages_pipeline_ordem ON public.crm_stages (pipeline_id, ordem);

ALTER TABLE public.crm_stages
  DROP CONSTRAINT IF EXISTS fk_crm_stages_pipeline;
ALTER TABLE public.crm_stages
  ADD CONSTRAINT fk_crm_stages_pipeline
  FOREIGN KEY (pipeline_id) REFERENCES public.crm_pipelines(id) ON DELETE CASCADE;

-- 3. Tabela crm_funnel_events (histórico de movimentação)
CREATE TABLE IF NOT EXISTS public.crm_funnel_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  stage_anterior_id uuid,
  stage_nova_id uuid NOT NULL,
  realizado_em timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  motivo_ganho_perdido text,
  metadados jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_crm_funnel_events_lead ON public.crm_funnel_events (lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_funnel_events_realizado ON public.crm_funnel_events (realizado_em DESC);
CREATE INDEX IF NOT EXISTS idx_crm_funnel_events_stage_nova ON public.crm_funnel_events (stage_nova_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'leads') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_schema = 'public' AND table_name = 'crm_funnel_events' AND constraint_name = 'fk_crm_funnel_events_lead') THEN
      ALTER TABLE public.crm_funnel_events
        ADD CONSTRAINT fk_crm_funnel_events_lead
        FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'crm_stages') THEN
    ALTER TABLE public.crm_funnel_events
      DROP CONSTRAINT IF EXISTS fk_crm_funnel_events_stage_anterior;
    ALTER TABLE public.crm_funnel_events
      ADD CONSTRAINT fk_crm_funnel_events_stage_anterior
      FOREIGN KEY (stage_anterior_id) REFERENCES public.crm_stages(id) ON DELETE SET NULL;
    ALTER TABLE public.crm_funnel_events
      DROP CONSTRAINT IF EXISTS fk_crm_funnel_events_stage_nova;
    ALTER TABLE public.crm_funnel_events
      ADD CONSTRAINT fk_crm_funnel_events_stage_nova
      FOREIGN KEY (stage_nova_id) REFERENCES public.crm_stages(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 4. Tabela crm_lead_interacoes (interações por lead, para ações obrigatórias)
CREATE TABLE IF NOT EXISTS public.crm_lead_interacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  cliente_id uuid NOT NULL,
  tipo text NOT NULL,
  descricao text,
  realizada_em timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_lead_interacoes_lead ON public.crm_lead_interacoes (lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_lead_interacoes_cliente ON public.crm_lead_interacoes (cliente_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'leads') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_schema = 'public' AND table_name = 'crm_lead_interacoes' AND constraint_name = 'fk_crm_lead_interacoes_lead') THEN
      ALTER TABLE public.crm_lead_interacoes
        ADD CONSTRAINT fk_crm_lead_interacoes_lead
        FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clientes') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_schema = 'public' AND table_name = 'crm_lead_interacoes' AND constraint_name = 'fk_crm_lead_interacoes_cliente') THEN
      ALTER TABLE public.crm_lead_interacoes
        ADD CONSTRAINT fk_crm_lead_interacoes_cliente
        FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- 5. Evoluir leads: novas colunas
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'leads') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'pipeline_id') THEN
      ALTER TABLE public.leads ADD COLUMN pipeline_id uuid;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'stage_id') THEN
      ALTER TABLE public.leads ADD COLUMN stage_id uuid;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'ultima_interacao') THEN
      ALTER TABLE public.leads ADD COLUMN ultima_interacao timestamptz;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'proxima_acao') THEN
      ALTER TABLE public.leads ADD COLUMN proxima_acao timestamptz;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'status_vida') THEN
      ALTER TABLE public.leads ADD COLUMN status_vida text CHECK (status_vida IS NULL OR status_vida IN ('ativo', 'ganho', 'perdido'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'stage_entered_at') THEN
      ALTER TABLE public.leads ADD COLUMN stage_entered_at timestamptz;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'crm_stages') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'pipeline_id') THEN
      ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS fk_leads_pipeline;
      ALTER TABLE public.leads ADD CONSTRAINT fk_leads_pipeline
        FOREIGN KEY (pipeline_id) REFERENCES public.crm_pipelines(id) ON DELETE SET NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'stage_id') THEN
      ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS fk_leads_stage;
      ALTER TABLE public.leads ADD CONSTRAINT fk_leads_stage
        FOREIGN KEY (stage_id) REFERENCES public.crm_stages(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leads_pipeline_stage ON public.leads (pipeline_id, stage_id);
CREATE INDEX IF NOT EXISTS idx_leads_status_vida ON public.leads (cliente_id, status_vida);

-- 6. Migração de dados: cliente_crm_settings -> pipeline + stages; leads.status -> stage_id
DO $$
DECLARE
  r RECORD;
  pip_id uuid;
  stage_rec RECORD;
  st_id uuid;
  idx integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cliente_crm_settings') THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT id, cliente_id, statuses
    FROM public.cliente_crm_settings
    WHERE statuses IS NOT NULL AND jsonb_array_length(statuses) > 0
  LOOP
    SELECT id INTO pip_id FROM public.crm_pipelines WHERE cliente_id = r.cliente_id LIMIT 1;
    IF pip_id IS NULL THEN
      INSERT INTO public.crm_pipelines (cliente_id, nome, descricao)
      VALUES (r.cliente_id, 'Pipeline principal', 'Funil criado a partir dos statuses existentes.')
      RETURNING id INTO pip_id;
    END IF;

    idx := 0;
    FOR stage_rec IN
      SELECT (elem->>'name') AS name, COALESCE(elem->>'color', '#6b7280') AS color, ord AS ord
      FROM jsonb_array_elements(r.statuses) WITH ORDINALITY AS t(elem, ord)
      ORDER BY ord
      LIMIT 100
    LOOP
      SELECT id INTO st_id FROM public.crm_stages WHERE pipeline_id = pip_id AND nome = stage_rec.name LIMIT 1;
      IF st_id IS NULL THEN
        INSERT INTO public.crm_stages (pipeline_id, nome, ordem, tipo, color)
        VALUES (
          pip_id,
          stage_rec.name,
          idx,
          CASE
            WHEN LOWER(stage_rec.name) IN ('vendeu', 'ganho', 'fechado_ganho') THEN 'ganho'
            WHEN LOWER(stage_rec.name) IN ('nao_compareceu', 'perdido', 'fechado_perdido') THEN 'perdido'
            ELSE 'intermediaria'
          END,
          stage_rec.color
        );
        idx := idx + 1;
      END IF;
    END LOOP;

    UPDATE public.crm_stages SET etapas_permitidas = (
      SELECT jsonb_agg(id::text ORDER BY ordem)
      FROM public.crm_stages
      WHERE pipeline_id = pip_id
    ) WHERE pipeline_id = pip_id;

    UPDATE public.leads l
    SET
      pipeline_id = pip_id,
      stage_id = (SELECT id FROM public.crm_stages s WHERE s.pipeline_id = pip_id AND s.nome = l.status LIMIT 1),
      status_vida = (
        SELECT CASE s.tipo
          WHEN 'ganho' THEN 'ganho'::text
          WHEN 'perdido' THEN 'perdido'::text
          ELSE 'ativo'::text
        END
        FROM public.crm_stages s
        WHERE s.pipeline_id = pip_id AND s.nome = l.status
        LIMIT 1
      ),
      stage_entered_at = COALESCE(l.updated_at, l.created_at)
    WHERE l.cliente_id = r.cliente_id;
  END LOOP;
END $$;

-- Fix etapas_permitidas: by default allow next stage(s). Re-run would need id. For migration we left jsonb_agg(id::text).
-- 7. RLS
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
    ALTER TABLE public.crm_pipelines ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "crm_pipelines_superadmin_all" ON public.crm_pipelines;
    CREATE POLICY "crm_pipelines_superadmin_all" ON public.crm_pipelines FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'))
      WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));
    DROP POLICY IF EXISTS "crm_pipelines_cliente_own" ON public.crm_pipelines;
    CREATE POLICY "crm_pipelines_cliente_own" ON public.crm_pipelines FOR ALL TO authenticated
      USING (cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL))
      WITH CHECK (cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL));
    DROP POLICY IF EXISTS "crm_pipelines_admin_colaborador" ON public.crm_pipelines;
    CREATE POLICY "crm_pipelines_admin_colaborador" ON public.crm_pipelines FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','colaborador')))
      WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','colaborador')));

    ALTER TABLE public.crm_stages ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "crm_stages_superadmin_all" ON public.crm_stages;
    CREATE POLICY "crm_stages_superadmin_all" ON public.crm_stages FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'))
      WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));
    DROP POLICY IF EXISTS "crm_stages_via_pipeline" ON public.crm_stages;
    CREATE POLICY "crm_stages_via_pipeline" ON public.crm_stages FOR ALL TO authenticated
      USING (
        pipeline_id IN (
          SELECT id FROM public.crm_pipelines WHERE cliente_id IN (
            SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND (role = 'cliente' AND cliente_id IS NOT NULL)
          )
          UNION
          SELECT id FROM public.crm_pipelines WHERE EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
          UNION
          SELECT id FROM public.crm_pipelines WHERE EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','colaborador'))
        )
      )
      WITH CHECK (
        pipeline_id IN (
          SELECT id FROM public.crm_pipelines WHERE cliente_id IN (
            SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND (role = 'cliente' AND cliente_id IS NOT NULL)
          )
          UNION
          SELECT id FROM public.crm_pipelines WHERE EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
          UNION
          SELECT id FROM public.crm_pipelines WHERE EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','colaborador'))
        )
      );

    ALTER TABLE public.crm_funnel_events ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "crm_funnel_events_superadmin_all" ON public.crm_funnel_events;
    CREATE POLICY "crm_funnel_events_superadmin_all" ON public.crm_funnel_events FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'))
      WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));
    DROP POLICY IF EXISTS "crm_funnel_events_via_lead" ON public.crm_funnel_events;
    CREATE POLICY "crm_funnel_events_via_lead" ON public.crm_funnel_events FOR ALL TO authenticated
      USING (
        lead_id IN (SELECT id FROM public.leads l WHERE EXISTS (
          SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND (
            (p.role = 'cliente' AND p.cliente_id = l.cliente_id) OR
            p.role = 'superadmin' OR
            p.role IN ('admin','colaborador')
          )
        ))
      )
      WITH CHECK (
        lead_id IN (SELECT id FROM public.leads l WHERE EXISTS (
          SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND (
            (p.role = 'cliente' AND p.cliente_id = l.cliente_id) OR
            p.role = 'superadmin' OR
            p.role IN ('admin','colaborador')
          )
        ))
      );

    ALTER TABLE public.crm_lead_interacoes ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "crm_lead_interacoes_superadmin_all" ON public.crm_lead_interacoes;
    CREATE POLICY "crm_lead_interacoes_superadmin_all" ON public.crm_lead_interacoes FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'))
      WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'));
    DROP POLICY IF EXISTS "crm_lead_interacoes_cliente_own" ON public.crm_lead_interacoes;
    CREATE POLICY "crm_lead_interacoes_cliente_own" ON public.crm_lead_interacoes FOR ALL TO authenticated
      USING (cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL))
      WITH CHECK (cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL));
    DROP POLICY IF EXISTS "crm_lead_interacoes_admin_colaborador" ON public.crm_lead_interacoes;
    CREATE POLICY "crm_lead_interacoes_admin_colaborador" ON public.crm_lead_interacoes FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','colaborador')))
      WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','colaborador')));
  END IF;
END $$;

-- Trigger updated_at para pipelines e stages
CREATE OR REPLACE FUNCTION public.crm_pipelines_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_crm_pipelines_updated_at ON public.crm_pipelines;
CREATE TRIGGER trg_crm_pipelines_updated_at
  BEFORE UPDATE ON public.crm_pipelines
  FOR EACH ROW EXECUTE FUNCTION public.crm_pipelines_set_updated_at();

CREATE OR REPLACE FUNCTION public.crm_stages_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_crm_stages_updated_at ON public.crm_stages;
CREATE TRIGGER trg_crm_stages_updated_at
  BEFORE UPDATE ON public.crm_stages
  FOR EACH ROW EXECUTE FUNCTION public.crm_stages_set_updated_at();
