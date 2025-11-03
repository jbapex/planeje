-- =====================================================
-- SCRIPT DE VERIFICAÇÃO - Ver se as funções existem
-- =====================================================

-- Verifica se a tabela existe
SELECT 
  'Tabela app_secrets existe' as status,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'app_secrets'
  ) THEN '✅ SIM' ELSE '❌ NÃO' END as resultado;

-- Verifica se a função set_encrypted_secret existe
SELECT 
  'Função set_encrypted_secret existe' as status,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'set_encrypted_secret'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) THEN '✅ SIM' ELSE '❌ NÃO' END as resultado;

-- Verifica se a função get_encrypted_secret existe
SELECT 
  'Função get_encrypted_secret existe' as status,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'get_encrypted_secret'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) THEN '✅ SIM' ELSE '❌ NÃO' END as resultado;

-- Lista todas as funções relacionadas a secrets
SELECT 
  proname as "Nome da Função",
  pg_get_function_arguments(oid) as "Parâmetros"
FROM pg_proc 
WHERE proname LIKE '%secret%'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

