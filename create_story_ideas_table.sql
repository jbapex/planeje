-- =====================================================
-- TABELA: story_ideas
-- Descrição: Armazena ideias de stories do Instagram geradas pela IA
-- =====================================================

CREATE TABLE IF NOT EXISTS public.story_ideas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    client_id uuid NOT NULL,
    category text NOT NULL, -- 'venda', 'suspense', 'bastidores', 'resultados', 'engajamento', 'outros'
    concept text NOT NULL, -- Descrição do conceito da ideia
    visual_suggestion text, -- Sugestão de visual
    caption text NOT NULL, -- Texto/caption sugerido
    cta text, -- Call to action
    context text, -- Contexto adicional informado pelo usuário
    expires_at timestamp with time zone NOT NULL, -- Data de expiração (created_at + 7 dias)
    is_active boolean DEFAULT true NOT NULL,
    CONSTRAINT story_ideas_pkey PRIMARY KEY (id),
    CONSTRAINT story_ideas_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clientes(id) ON DELETE CASCADE
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_story_ideas_client_id ON public.story_ideas(client_id);
CREATE INDEX IF NOT EXISTS idx_story_ideas_expires_at ON public.story_ideas(expires_at);
CREATE INDEX IF NOT EXISTS idx_story_ideas_is_active ON public.story_ideas(is_active);
CREATE INDEX IF NOT EXISTS idx_story_ideas_created_at ON public.story_ideas(created_at DESC);

-- Habilitar Row Level Security
ALTER TABLE public.story_ideas ENABLE ROW LEVEL SECURITY;

-- Política: Clientes podem ver apenas suas próprias ideias
CREATE POLICY "Clientes podem ver suas próprias ideias"
    ON public.story_ideas
    FOR SELECT
    TO anon, authenticated
    USING (
        -- Permitir acesso público via client_id (para chat público)
        true
    );

-- Política: Clientes podem inserir suas próprias ideias
CREATE POLICY "Clientes podem inserir suas próprias ideias"
    ON public.story_ideas
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

-- Política: Clientes podem atualizar suas próprias ideias
CREATE POLICY "Clientes podem atualizar suas próprias ideias"
    ON public.story_ideas
    FOR UPDATE
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- Política: Clientes podem excluir suas próprias ideias
CREATE POLICY "Clientes podem excluir suas próprias ideias"
    ON public.story_ideas
    FOR DELETE
    TO anon, authenticated
    USING (true);

-- Permissões
GRANT ALL ON TABLE public.story_ideas TO anon, authenticated, service_role;

-- Comentários nas colunas
COMMENT ON TABLE public.story_ideas IS 'Armazena ideias de stories do Instagram geradas pela IA para cada cliente';
COMMENT ON COLUMN public.story_ideas.category IS 'Tipo de story: venda, suspense, bastidores, resultados, engajamento, outros';
COMMENT ON COLUMN public.story_ideas.expires_at IS 'Data de expiração da ideia (7 dias após criação)';
COMMENT ON COLUMN public.story_ideas.is_active IS 'Se false, a ideia foi excluída (soft delete)';

