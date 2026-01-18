-- =====================================================
-- SCRIPT DE EXECUÇÃO: Adicionar Autenticação de Clientes
-- ✅ EXECUTADO COM SUCESSO
-- =====================================================

-- ✅ Migration executada! A estrutura está pronta para:
-- 1. Criar usuários clientes com login/senha
-- 2. Vincular usuários a clientes via profiles.cliente_id
-- 3. RLS policies ativas para proteger dados

-- Próximos passos:
-- 1. Testar criação de login de cliente (via painel admin - ainda a implementar)
-- 2. Testar login em /login-cliente
-- 3. Testar acesso ao ApexIA autenticado em /apexia

-- Para criar um login de cliente manualmente no Supabase:
-- 1. Auth > Users > Add User (ou criar via Admin API)
-- 2. Criar/atualizar profile com:
--    - id = auth.users.id
--    - role = 'cliente'
--    - cliente_id = id do cliente na tabela clientes
