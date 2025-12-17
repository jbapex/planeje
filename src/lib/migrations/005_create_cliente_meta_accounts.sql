-- =====================================================
-- TABELA: cliente_meta_accounts
-- Descrição: Relacionamento many-to-many entre clientes e contas de anúncios do Meta
-- Permite que cada cliente tenha múltiplas contas vinculadas
-- =====================================================

CREATE TABLE IF NOT EXISTS public.cliente_meta_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    cliente_id uuid NOT NULL,
    meta_account_id text NOT NULL, -- ID da conta do Meta (ex: "act_123456789")
    meta_account_name text, -- Nome da conta (para facilitar visualização)
    is_active boolean DEFAULT true NOT NULL, -- Permite desativar sem deletar
    notes text, -- Notas opcionais sobre a vinculação
    CONSTRAINT cliente_meta_accounts_pkey PRIMARY KEY (id),
    CONSTRAINT cliente_meta_accounts_cliente_id_fkey FOREIGN KEY (cliente_id) 
        REFERENCES public.clientes(id) ON DELETE CASCADE,
    CONSTRAINT cliente_meta_accounts_unique UNIQUE (cliente_id, meta_account_id)
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_cliente_meta_accounts_cliente_id 
    ON public.cliente_meta_accounts(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cliente_meta_accounts_meta_account_id 
    ON public.cliente_meta_accounts(meta_account_id);
CREATE INDEX IF NOT EXISTS idx_cliente_meta_accounts_is_active 
    ON public.cliente_meta_accounts(is_active);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_cliente_meta_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_cliente_meta_accounts_updated_at
    BEFORE UPDATE ON public.cliente_meta_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_cliente_meta_accounts_updated_at();

-- Habilitar Row Level Security
ALTER TABLE public.cliente_meta_accounts ENABLE ROW LEVEL SECURITY;

-- Política: Usuários autenticados podem ver todas as vinculações
CREATE POLICY "Usuários autenticados podem ver vinculações"
    ON public.cliente_meta_accounts
    FOR SELECT
    TO authenticated
    USING (true);

-- Política: Usuários autenticados podem inserir vinculações
CREATE POLICY "Usuários autenticados podem inserir vinculações"
    ON public.cliente_meta_accounts
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Política: Usuários autenticados podem atualizar vinculações
CREATE POLICY "Usuários autenticados podem atualizar vinculações"
    ON public.cliente_meta_accounts
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Política: Usuários autenticados podem deletar vinculações
CREATE POLICY "Usuários autenticados podem deletar vinculações"
    ON public.cliente_meta_accounts
    FOR DELETE
    TO authenticated
    USING (true);

-- Comentários explicativos
COMMENT ON TABLE public.cliente_meta_accounts IS 'Relacionamento entre clientes e contas de anúncios do Meta/Facebook';
COMMENT ON COLUMN public.cliente_meta_accounts.cliente_id IS 'ID do cliente cadastrado';
COMMENT ON COLUMN public.cliente_meta_accounts.meta_account_id IS 'ID da conta do Meta (formato: act_123456789)';
COMMENT ON COLUMN public.cliente_meta_accounts.meta_account_name IS 'Nome da conta do Meta (armazenado para facilitar visualização)';
COMMENT ON COLUMN public.cliente_meta_accounts.is_active IS 'Se a vinculação está ativa (permite desativar sem deletar)';
COMMENT ON COLUMN public.cliente_meta_accounts.notes IS 'Notas opcionais sobre a vinculação';

