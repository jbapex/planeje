-- =====================================================
-- FIX: Ajustar RLS da tabela task_automations
-- Problema: Automações só funcionam para superadmin porque RLS bloqueia leitura para outros usuários
-- Solução: Permitir que todos os usuários autenticados LEIAM automações ativas (automações são globais)
-- =====================================================

-- 1. Garantir que RLS está habilitado
ALTER TABLE IF EXISTS public.task_automations ENABLE ROW LEVEL SECURITY;

-- 2. Remover políticas antigas que podem estar bloqueando
DROP POLICY IF EXISTS "Users can view their own automations" ON public.task_automations;
DROP POLICY IF EXISTS "Users can view automations" ON public.task_automations;
DROP POLICY IF EXISTS "Users can read automations" ON public.task_automations;

-- 3. Política: TODOS os usuários autenticados podem LER automações ativas
-- (Automações devem ser globais, não específicas de usuário)
CREATE POLICY "Authenticated users can read active automations"
  ON public.task_automations
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- 4. Política: Usuários podem ver TODAS as automações (ativas e inativas) para gerenciamento
-- (Isso permite que vejam na interface de gerenciamento)
CREATE POLICY "Authenticated users can view all automations"
  ON public.task_automations
  FOR SELECT
  TO authenticated
  USING (true);

-- 5. Política: Apenas o criador ou superadmin podem criar/editar/deletar
CREATE POLICY "Users can manage their own automations or superadmin can manage all"
  ON public.task_automations
  FOR ALL
  TO authenticated
  USING (
    owner_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role = 'superadmin'
    )
  )
  WITH CHECK (
    owner_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role = 'superadmin'
    )
  );

-- 6. Garantir permissões básicas
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.task_automations TO authenticated;

-- 7. Verificar se a tabela existe e tem a estrutura correta
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'task_automations'
  ) THEN
    RAISE NOTICE 'Tabela task_automations não existe. Criando...';
    
    CREATE TABLE IF NOT EXISTS public.task_automations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      trigger_type TEXT NOT NULL,
      trigger_config JSONB DEFAULT '{}'::jsonb,
      actions JSONB DEFAULT '[]'::jsonb,
      is_active BOOLEAN DEFAULT true NOT NULL
    );
    
    CREATE INDEX IF NOT EXISTS idx_task_automations_trigger_type ON public.task_automations(trigger_type);
    CREATE INDEX IF NOT EXISTS idx_task_automations_is_active ON public.task_automations(is_active) WHERE is_active = true;
    CREATE INDEX IF NOT EXISTS idx_task_automations_owner_id ON public.task_automations(owner_id);
    
    RAISE NOTICE 'Tabela task_automations criada com sucesso!';
  ELSE
    RAISE NOTICE 'Tabela task_automations já existe.';
  END IF;
END $$;

-- 8. Comentários explicativos
COMMENT ON TABLE public.task_automations IS 'Automações de tarefas - devem ser globais (todos os usuários podem executar automações ativas)';
COMMENT ON COLUMN public.task_automations.owner_id IS 'Criador da automação (para gerenciamento), mas automações ativas são executadas por todos os usuários';
COMMENT ON COLUMN public.task_automations.is_active IS 'Se true, a automação será executada para todos os usuários quando o trigger for acionado';
