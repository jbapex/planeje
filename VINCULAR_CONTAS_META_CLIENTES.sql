-- =====================================================
-- SCRIPT: Vincular Contas Meta aos Clientes
-- Descrição: Aplica a migration para criar a tabela de relacionamento
-- =====================================================

-- Execute este script no Supabase SQL Editor ou via CLI

\i src/lib/migrations/005_create_cliente_meta_accounts.sql

-- Ou copie e cole o conteúdo do arquivo acima diretamente no SQL Editor

-- =====================================================
-- EXEMPLO DE USO:
-- =====================================================

-- 1. Vincular uma conta a um cliente:
-- INSERT INTO cliente_meta_accounts (cliente_id, meta_account_id, meta_account_name)
-- VALUES (
--     'uuid-do-cliente-aqui',
--     'act_123456789',
--     'Nome da Conta do Meta'
-- );

-- 2. Ver todas as vinculações:
-- SELECT 
--     c.empresa as cliente,
--     cma.meta_account_name as conta_meta,
--     cma.meta_account_id,
--     cma.is_active,
--     cma.created_at
-- FROM cliente_meta_accounts cma
-- JOIN clientes c ON c.id = cma.cliente_id
-- ORDER BY c.empresa, cma.created_at DESC;

-- 3. Ver contas vinculadas a um cliente específico:
-- SELECT * FROM cliente_meta_accounts 
-- WHERE cliente_id = 'uuid-do-cliente-aqui' 
-- AND is_active = true;

-- 4. Desativar uma vinculação (sem deletar):
-- UPDATE cliente_meta_accounts 
-- SET is_active = false 
-- WHERE id = 'uuid-da-vinculacao';

-- 5. Reativar uma vinculação:
-- UPDATE cliente_meta_accounts 
-- SET is_active = true 
-- WHERE id = 'uuid-da-vinculacao';

