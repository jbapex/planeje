-- =====================================================
-- SCRIPT DE EXECUÇÃO: Criar Tabela cliente_meta_accounts
-- Execute este script no Supabase SQL Editor
-- =====================================================

-- Criar tabela
CREATE TABLE IF NOT EXISTS public.cliente_meta_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    cliente_id uuid NOT NULL,
    meta_account_id text NOT NULL,
    meta_account_name text,
    is_active boolean DEFAULT true NOT NULL,
    notes text,
    CONSTRAINT cliente_meta_accounts_pkey PRIMARY KEY (id),
    CONSTRAINT cliente_meta_accounts_cliente_id_fkey FOREIGN KEY (cliente_id) 
        REFERENCES public.clientes(id) ON DELETE CASCADE,
    CONSTRAINT cliente_meta_accounts_unique UNIQUE (cliente_id, meta_account_id)
);

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_cliente_meta_accounts_cliente_id 
    ON public.cliente_meta_accounts(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cliente_meta_accounts_meta_account_id 
    ON public.cliente_meta_accounts(meta_account_id);
CREATE INDEX IF NOT EXISTS idx_cliente_meta_accounts_is_active 
    ON public.cliente_meta_accounts(is_active);

-- Criar função para trigger
CREATE OR REPLACE FUNCTION update_cliente_meta_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger
DROP TRIGGER IF EXISTS trigger_update_cliente_meta_accounts_updated_at ON public.cliente_meta_accounts;
CREATE TRIGGER trigger_update_cliente_meta_accounts_updated_at
    BEFORE UPDATE ON public.cliente_meta_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_cliente_meta_accounts_updated_at();

-- Habilitar RLS
ALTER TABLE public.cliente_meta_accounts ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas se existirem (para evitar conflitos)
DROP POLICY IF EXISTS "Usuários autenticados podem ver vinculações" ON public.cliente_meta_accounts;
DROP POLICY IF EXISTS "Usuários autenticados podem inserir vinculações" ON public.cliente_meta_accounts;
DROP POLICY IF EXISTS "Usuários autenticados podem atualizar vinculações" ON public.cliente_meta_accounts;
DROP POLICY IF EXISTS "Usuários autenticados podem deletar vinculações" ON public.cliente_meta_accounts;

-- Criar políticas RLS
CREATE POLICY "Usuários autenticados podem ver vinculações"
    ON public.cliente_meta_accounts
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Usuários autenticados podem inserir vinculações"
    ON public.cliente_meta_accounts
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar vinculações"
    ON public.cliente_meta_accounts
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem deletar vinculações"
    ON public.cliente_meta_accounts
    FOR DELETE
    TO authenticated
    USING (true);

-- Adicionar comentários
COMMENT ON TABLE public.cliente_meta_accounts IS 'Relacionamento entre clientes e contas de anúncios do Meta/Facebook';
COMMENT ON COLUMN public.cliente_meta_accounts.cliente_id IS 'ID do cliente cadastrado';
COMMENT ON COLUMN public.cliente_meta_accounts.meta_account_id IS 'ID da conta do Meta (formato: act_123456789)';
COMMENT ON COLUMN public.cliente_meta_accounts.meta_account_name IS 'Nome da conta do Meta (armazenado para facilitar visualização)';
COMMENT ON COLUMN public.cliente_meta_accounts.is_active IS 'Se a vinculação está ativa (permite desativar sem deletar)';
COMMENT ON COLUMN public.cliente_meta_accounts.notes IS 'Notas opcionais sobre a vinculação';

-- Verificar se foi criado com sucesso
SELECT 
    'Tabela criada com sucesso!' as status,
    COUNT(*) as total_vinculacoes
FROM public.cliente_meta_accounts;

