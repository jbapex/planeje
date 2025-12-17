-- =====================================================
-- TABELA: cliente_meta_observations
-- Descrição: Armazena observações/comentários sobre ações realizadas para clientes na gestão de tráfego Meta
-- =====================================================

CREATE TABLE IF NOT EXISTS public.cliente_meta_observations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    cliente_id uuid NOT NULL,
    user_id uuid NOT NULL,
    observation text NOT NULL,
    CONSTRAINT cliente_meta_observations_pkey PRIMARY KEY (id),
    CONSTRAINT cliente_meta_observations_cliente_id_fkey FOREIGN KEY (cliente_id) 
        REFERENCES public.clientes(id) ON DELETE CASCADE,
    CONSTRAINT cliente_meta_observations_user_id_fkey FOREIGN KEY (user_id) 
        REFERENCES public.profiles(id) ON DELETE CASCADE
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_cliente_meta_observations_cliente_id 
    ON public.cliente_meta_observations(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cliente_meta_observations_created_at 
    ON public.cliente_meta_observations(created_at DESC);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_cliente_meta_observations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_cliente_meta_observations_updated_at
    BEFORE UPDATE ON public.cliente_meta_observations
    FOR EACH ROW
    EXECUTE FUNCTION update_cliente_meta_observations_updated_at();

-- Habilitar Row Level Security
ALTER TABLE public.cliente_meta_observations ENABLE ROW LEVEL SECURITY;

-- Política: Usuários autenticados podem ver todas as observações
CREATE POLICY "Usuários autenticados podem ver observações"
    ON public.cliente_meta_observations
    FOR SELECT
    TO authenticated
    USING (true);

-- Política: Usuários autenticados podem inserir observações
CREATE POLICY "Usuários autenticados podem inserir observações"
    ON public.cliente_meta_observations
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Política: Usuários autenticados podem atualizar observações
CREATE POLICY "Usuários autenticados podem atualizar observações"
    ON public.cliente_meta_observations
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Política: Usuários autenticados podem deletar observações
CREATE POLICY "Usuários autenticados podem deletar observações"
    ON public.cliente_meta_observations
    FOR DELETE
    TO authenticated
    USING (true);

-- Comentários explicativos
COMMENT ON TABLE public.cliente_meta_observations IS 'Observações e comentários sobre ações realizadas para clientes na gestão de tráfego Meta';
COMMENT ON COLUMN public.cliente_meta_observations.cliente_id IS 'ID do cliente';
COMMENT ON COLUMN public.cliente_meta_observations.user_id IS 'ID do usuário que criou a observação';
COMMENT ON COLUMN public.cliente_meta_observations.observation IS 'Texto da observação/comentário';

-- Permissões
GRANT ALL ON TABLE public.cliente_meta_observations TO anon, authenticated, service_role;

