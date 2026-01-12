-- Migration: Criar sistema de aprendizado contínuo para IA
-- Descrição: Tabelas para feedback, preferências, padrões aprendidos e exemplos de referência

-- 1. Tabela de Feedback
CREATE TABLE IF NOT EXISTS public.ai_learning_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  
  -- Referência à conversa e mensagem
  conversation_id UUID REFERENCES public.assistant_project_conversations(id) ON DELETE CASCADE,
  message_index INTEGER NOT NULL, -- Índice da mensagem na conversa
  
  -- Feedback
  feedback_type VARCHAR(20) NOT NULL CHECK (feedback_type IN ('positive', 'negative', 'correction')),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  
  -- Dados do feedback
  original_message TEXT NOT NULL, -- Mensagem original da IA
  corrected_message TEXT, -- Se foi correção, a mensagem corrigida
  feedback_notes TEXT, -- Notas do usuário sobre o feedback
  
  -- Metadados para aprendizado
  message_type VARCHAR(50), -- 'campaign', 'analysis', 'strategy', 'content', etc.
  client_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL, -- Se aplicável
  model_used VARCHAR(100), -- Qual modelo foi usado
  
  -- Padrões identificados
  learned_patterns JSONB DEFAULT '{}'::jsonb -- Padrões extraídos do feedback
);

-- Índices para feedback
CREATE INDEX IF NOT EXISTS idx_ai_feedback_user ON public.ai_learning_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_conversation ON public.ai_learning_feedback(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_type ON public.ai_learning_feedback(feedback_type);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_client ON public.ai_learning_feedback(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_feedback_created ON public.ai_learning_feedback(created_at DESC);

-- 2. Tabela de Preferências do Usuário
CREATE TABLE IF NOT EXISTS public.ai_user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  
  -- Preferências aprendidas
  preferred_campaign_format JSONB DEFAULT '{}'::jsonb, -- Formato preferido de campanhas
  preferred_analysis_depth VARCHAR(20) DEFAULT 'medium' CHECK (preferred_analysis_depth IN ('shallow', 'medium', 'deep')),
  preferred_tone VARCHAR(50), -- Tom de voz preferido
  preferred_presentation_style JSONB DEFAULT '{}'::jsonb, -- Estilo de apresentação
  
  -- Preferências de modelos
  preferred_models JSONB DEFAULT '{}'::jsonb, -- { "campaign": "model-x", "analysis": "model-y", "strategy": "model-z" }
  
  -- Outras preferências aprendidas
  preferences JSONB DEFAULT '{}'::jsonb -- Preferências adicionais aprendidas
);

-- Trigger para atualizar updated_at
DROP TRIGGER IF EXISTS update_ai_preferences_updated_at ON public.ai_user_preferences;
CREATE OR REPLACE FUNCTION update_ai_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_ai_preferences_updated_at
  BEFORE UPDATE ON public.ai_user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_preferences_updated_at();

-- Índice para preferências
CREATE INDEX IF NOT EXISTS idx_ai_preferences_user ON public.ai_user_preferences(user_id);

-- 3. Tabela de Padrões Aprendidos
CREATE TABLE IF NOT EXISTS public.ai_learned_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  
  -- Tipo de padrão
  pattern_type VARCHAR(50) NOT NULL, -- 'campaign_structure', 'content_format', 'strategy_approach', 'tone_style', etc.
  
  -- Contexto do padrão
  client_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL, -- Se específico de cliente
  niche VARCHAR(100), -- Nicho do cliente (se aplicável)
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- Se específico de usuário
  
  -- Padrão identificado
  pattern_data JSONB NOT NULL, -- Dados do padrão
  success_indicators JSONB DEFAULT '{}'::jsonb, -- Indicadores de sucesso
  success_rate NUMERIC(5, 2) DEFAULT 0 CHECK (success_rate >= 0 AND success_rate <= 100), -- Taxa de sucesso (0-100)
  
  -- Metadados
  times_used INTEGER DEFAULT 0, -- Quantas vezes foi usado
  times_successful INTEGER DEFAULT 0, -- Quantas vezes foi bem-sucedido
  last_used_at TIMESTAMP WITH TIME ZONE,
  
  -- Aprendizado
  confidence_score NUMERIC(5, 2) DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 100), -- Confiança no padrão (0-100)
  learned_from JSONB DEFAULT '[]'::jsonb -- De onde veio: [{ "type": "project", "id": "...", "success": true }]
);

-- Trigger para atualizar updated_at
DROP TRIGGER IF EXISTS update_ai_patterns_updated_at ON public.ai_learned_patterns;
CREATE OR REPLACE FUNCTION update_ai_patterns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_ai_patterns_updated_at
  BEFORE UPDATE ON public.ai_learned_patterns
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_patterns_updated_at();

-- Índices para padrões
CREATE INDEX IF NOT EXISTS idx_ai_patterns_type ON public.ai_learned_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_ai_patterns_client ON public.ai_learned_patterns(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_patterns_niche ON public.ai_learned_patterns(niche) WHERE niche IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_patterns_user ON public.ai_learned_patterns(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_patterns_confidence ON public.ai_learned_patterns(confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_ai_patterns_success_rate ON public.ai_learned_patterns(success_rate DESC);

-- 4. Tabela de Exemplos de Referência
CREATE TABLE IF NOT EXISTS public.ai_reference_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  
  -- Referência ao exemplo
  conversation_id UUID REFERENCES public.assistant_project_conversations(id) ON DELETE CASCADE,
  message_index INTEGER NOT NULL,
  example_type VARCHAR(50) NOT NULL, -- 'campaign', 'strategy', 'analysis', 'content', 'structure', etc.
  
  -- Conteúdo do exemplo
  example_content TEXT NOT NULL,
  example_structure JSONB DEFAULT '{}'::jsonb, -- Estrutura extraída (seções, formato, etc.)
  
  -- Contexto
  client_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  tags TEXT[] DEFAULT '{}',
  description TEXT, -- Descrição do usuário sobre por que é um bom exemplo
  
  -- Uso
  times_referenced INTEGER DEFAULT 0 -- Quantas vezes foi usado como referência
);

-- Trigger para atualizar updated_at
DROP TRIGGER IF EXISTS update_ai_examples_updated_at ON public.ai_reference_examples;
CREATE OR REPLACE FUNCTION update_ai_examples_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_ai_examples_updated_at
  BEFORE UPDATE ON public.ai_reference_examples
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_examples_updated_at();

-- Índices para exemplos
CREATE INDEX IF NOT EXISTS idx_ai_examples_user ON public.ai_reference_examples(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_examples_type ON public.ai_reference_examples(example_type);
CREATE INDEX IF NOT EXISTS idx_ai_examples_client ON public.ai_reference_examples(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_examples_tags ON public.ai_reference_examples USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_ai_examples_conversation ON public.ai_reference_examples(conversation_id);

-- Permissões RLS (Row Level Security)
ALTER TABLE public.ai_learning_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_learned_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_reference_examples ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para ai_learning_feedback
DROP POLICY IF EXISTS "Users can view their own feedback" ON public.ai_learning_feedback;
CREATE POLICY "Users can view their own feedback"
  ON public.ai_learning_feedback
  FOR SELECT
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin', 'admin')));

DROP POLICY IF EXISTS "Users can create their own feedback" ON public.ai_learning_feedback;
CREATE POLICY "Users can create their own feedback"
  ON public.ai_learning_feedback
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own feedback" ON public.ai_learning_feedback;
CREATE POLICY "Users can update their own feedback"
  ON public.ai_learning_feedback
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their own feedback" ON public.ai_learning_feedback;
CREATE POLICY "Users can delete their own feedback"
  ON public.ai_learning_feedback
  FOR DELETE
  USING (user_id = auth.uid());

-- Políticas RLS para ai_user_preferences
DROP POLICY IF EXISTS "Users can view their own preferences" ON public.ai_user_preferences;
CREATE POLICY "Users can view their own preferences"
  ON public.ai_user_preferences
  FOR SELECT
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin', 'admin')));

DROP POLICY IF EXISTS "Users can create their own preferences" ON public.ai_user_preferences;
CREATE POLICY "Users can create their own preferences"
  ON public.ai_user_preferences
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own preferences" ON public.ai_user_preferences;
CREATE POLICY "Users can update their own preferences"
  ON public.ai_user_preferences
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Políticas RLS para ai_learned_patterns (todos podem ver, mas apenas admins podem criar/atualizar)
DROP POLICY IF EXISTS "Users can view patterns" ON public.ai_learned_patterns;
CREATE POLICY "Users can view patterns"
  ON public.ai_learned_patterns
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can manage patterns" ON public.ai_learned_patterns;
CREATE POLICY "Admins can manage patterns"
  ON public.ai_learned_patterns
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin', 'admin')));

-- Políticas RLS para ai_reference_examples
DROP POLICY IF EXISTS "Users can view their own examples" ON public.ai_reference_examples;
CREATE POLICY "Users can view their own examples"
  ON public.ai_reference_examples
  FOR SELECT
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin', 'admin')));

DROP POLICY IF EXISTS "Users can create their own examples" ON public.ai_reference_examples;
CREATE POLICY "Users can create their own examples"
  ON public.ai_reference_examples
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own examples" ON public.ai_reference_examples;
CREATE POLICY "Users can update their own examples"
  ON public.ai_reference_examples
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their own examples" ON public.ai_reference_examples;
CREATE POLICY "Users can delete their own examples"
  ON public.ai_reference_examples
  FOR DELETE
  USING (user_id = auth.uid());

-- Garantir permissões básicas
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ai_learning_feedback TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ai_user_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ai_learned_patterns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ai_reference_examples TO authenticated;

-- Comentários
COMMENT ON TABLE public.ai_learning_feedback IS 'Armazena feedback do usuário sobre respostas da IA para aprendizado contínuo';
COMMENT ON TABLE public.ai_user_preferences IS 'Armazena preferências pessoais do usuário aprendidas pelo sistema';
COMMENT ON TABLE public.ai_learned_patterns IS 'Armazena padrões de sucesso identificados pelo sistema';
COMMENT ON TABLE public.ai_reference_examples IS 'Armazena exemplos marcados pelo usuário como referência';

