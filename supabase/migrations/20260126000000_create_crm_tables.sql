-- =====================================================
-- MIGRATION: Criar tabelas de CRM de Oportunidades
-- Descrição: Cria crm_oportunidades e crm_atividades, com campos
--           alinhados ao funil de vendas e origens de tráfego.
-- =====================================================

-- 1. Criar tabela principal de oportunidades
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'crm_oportunidades'
  ) THEN
    CREATE TABLE public.crm_oportunidades (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      -- Importante: mantemos apenas o campo cliente_id sem FK direta para evitar
      -- falha da migration em ambientes onde a tabela public.clientes ainda não existe.
      -- A relação é lógica e usada em joins pela aplicação.
      cliente_id uuid NOT NULL,

      lead_nome text NOT NULL,
      lead_email text,
      lead_telefone text,

      -- Origem de tráfego / canal
      origem_canal text NOT NULL,
      origem_campanha text,

      -- Etapa do funil
      status_etapa text NOT NULL,

      -- Projeção de receita
      valor_previsto numeric(14,2),
      probabilidade integer,

      -- Datas principais
      data_criacao timestamptz NOT NULL DEFAULT now(),
      data_ultima_atualizacao timestamptz NOT NULL DEFAULT now(),
      data_fechamento timestamptz,

      -- Observações gerais
      observacoes_resumo text,

      -- Integração com tracking / UTMs
      external_conversion_id text,
      pixel_source text,
      utm_source text,
      utm_medium text,
      utm_campaign text,
      utm_term text,
      utm_content text,

      -- Conexão com visão macro (Cadastro Diário / PGM)
      venda_confirmada boolean DEFAULT false,
      venda_valor_real numeric(14,2),
      venda_registrada_em timestamptz,
      venda_origem_registro text,

      -- Auditoria básica
      created_by_profile_id uuid,
      updated_by_profile_id uuid
    );

    COMMENT ON TABLE public.crm_oportunidades IS 'Oportunidades de venda (leads) por cliente, conectadas a origens de tráfego e funil.';

    COMMENT ON COLUMN public.crm_oportunidades.origem_canal IS 'Canal de origem do lead (meta, google, organico, indicacao, nao_rastreado, etc).';
    COMMENT ON COLUMN public.crm_oportunidades.status_etapa IS 'Etapa do funil: novo, contato_inicial, reuniao_marcada, proposta_enviada, fechado_ganho, fechado_perdido, etc.';
  END IF;
END $$;

-- Índices auxiliares
CREATE INDEX IF NOT EXISTS idx_crm_oportunidades_cliente_status
  ON public.crm_oportunidades (cliente_id, status_etapa);

CREATE INDEX IF NOT EXISTS idx_crm_oportunidades_cliente_data_criacao
  ON public.crm_oportunidades (cliente_id, data_criacao DESC);

CREATE INDEX IF NOT EXISTS idx_crm_oportunidades_cliente_contatos
  ON public.crm_oportunidades (cliente_id, lead_telefone, lead_email);

CREATE INDEX IF NOT EXISTS idx_crm_oportunidades_conversion
  ON public.crm_oportunidades (cliente_id, external_conversion_id);

-- 2. Criar tabela de atividades / histórico
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'crm_atividades'
  ) THEN
    CREATE TABLE public.crm_atividades (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      oportunidade_id uuid NOT NULL REFERENCES public.crm_oportunidades (id) ON DELETE CASCADE,
      -- Mesmo racional da tabela de oportunidades: manter apenas o campo cliente_id
      -- sem FK direta para não depender da existência de public.clientes na ordem das migrations.
      cliente_id uuid NOT NULL,

      tipo text NOT NULL,
      descricao text NOT NULL,
      realizada_em timestamptz NOT NULL DEFAULT now(),

      criado_por_profile_id uuid,
      canal_externo text,
      metadados jsonb
    );

    COMMENT ON TABLE public.crm_atividades IS 'Atividades e anotações ligadas a uma oportunidade de CRM.';
    COMMENT ON COLUMN public.crm_atividades.tipo IS 'Tipo de atividade: ligacao, email, reuniao, nota, etc.';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_crm_atividades_oportunidade_data
  ON public.crm_atividades (oportunidade_id, realizada_em DESC);

CREATE INDEX IF NOT EXISTS idx_crm_atividades_cliente_data
  ON public.crm_atividades (cliente_id, realizada_em DESC);

-- 3. Trigger para atualizar data_ultima_atualizacao em crm_oportunidades
CREATE OR REPLACE FUNCTION public.crm_oportunidades_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.data_ultima_atualizacao := now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_crm_oportunidades_set_updated_at'
  ) THEN
    CREATE TRIGGER trg_crm_oportunidades_set_updated_at
    BEFORE UPDATE ON public.crm_oportunidades
    FOR EACH ROW
    EXECUTE FUNCTION public.crm_oportunidades_set_updated_at();
  END IF;
END $$;

-- 4. Trigger para preencher data_fechamento ao fechar oportunidade
CREATE OR REPLACE FUNCTION public.crm_oportunidades_set_data_fechamento()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status_etapa IN ('fechado_ganho', 'fechado_perdido')
     AND (OLD.status_etapa IS DISTINCT FROM NEW.status_etapa)
     AND NEW.data_fechamento IS NULL THEN
    NEW.data_fechamento := now();
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_crm_oportunidades_set_data_fechamento'
  ) THEN
    CREATE TRIGGER trg_crm_oportunidades_set_data_fechamento
    BEFORE UPDATE ON public.crm_oportunidades
    FOR EACH ROW
    EXECUTE FUNCTION public.crm_oportunidades_set_data_fechamento();
  END IF;
END $$;

-- 5. Trigger para garantir cliente_id em crm_atividades
CREATE OR REPLACE FUNCTION public.crm_atividades_set_cliente_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_cliente_id uuid;
BEGIN
  IF NEW.cliente_id IS NULL THEN
    SELECT cliente_id INTO v_cliente_id
    FROM public.crm_oportunidades
    WHERE id = NEW.oportunidade_id;

    NEW.cliente_id := v_cliente_id;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_crm_atividades_set_cliente_id'
  ) THEN
    CREATE TRIGGER trg_crm_atividades_set_cliente_id
    BEFORE INSERT ON public.crm_atividades
    FOR EACH ROW
    EXECUTE FUNCTION public.crm_atividades_set_cliente_id();
  END IF;
END $$;

-- 6. FK para clientes (necessária para o join clientes:cliente_id no PostgREST/Supabase)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'clientes'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_schema = 'public' AND table_name = 'crm_oportunidades'
        AND constraint_name = 'fk_crm_oportunidades_cliente_id'
    ) THEN
      ALTER TABLE public.crm_oportunidades
        ADD CONSTRAINT fk_crm_oportunidades_cliente_id
        FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- 7. RLS em crm_oportunidades (superadmin vê tudo; cliente só o próprio)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
    ALTER TABLE public.crm_oportunidades ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "crm_oportunidades_superadmin_all" ON public.crm_oportunidades;
    CREATE POLICY "crm_oportunidades_superadmin_all"
      ON public.crm_oportunidades FOR ALL TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
      );

    DROP POLICY IF EXISTS "crm_oportunidades_cliente_own" ON public.crm_oportunidades;
    CREATE POLICY "crm_oportunidades_cliente_own"
      ON public.crm_oportunidades FOR ALL TO authenticated
      USING (
        cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL)
      )
      WITH CHECK (
        cliente_id IN (SELECT cliente_id FROM public.profiles WHERE id = auth.uid() AND role = 'cliente' AND cliente_id IS NOT NULL)
      );
  END IF;
END $$;
