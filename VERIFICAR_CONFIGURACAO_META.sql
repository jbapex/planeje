-- =====================================================
-- SCRIPT DE VERIFICAÇÃO: Configuração Meta Ads
-- =====================================================
-- Execute este script para verificar o que está configurado
-- =====================================================

-- 1. Verifica se a função RPC existe
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_proc WHERE proname = 'get_encrypted_secret'
    ) 
    THEN '✅ Função get_encrypted_secret existe'
    ELSE '❌ Função get_encrypted_secret NÃO existe - Execute 006_prepare_meta_ads_integration.sql'
  END AS status_funcao;

-- 2. Tenta verificar se o token existe no Vault (pode não ter permissão)
DO $$
DECLARE
  v_token_exists BOOLEAN := FALSE;
BEGIN
  BEGIN
    SELECT EXISTS(
      SELECT 1 FROM vault.secrets 
      WHERE name = 'META_SYSTEM_USER_ACCESS_TOKEN'
    ) INTO v_token_exists;
    
    IF v_token_exists THEN
      RAISE NOTICE '✅ Token META_SYSTEM_USER_ACCESS_TOKEN encontrado no Vault';
    ELSE
      RAISE WARNING '❌ Token META_SYSTEM_USER_ACCESS_TOKEN NÃO encontrado no Vault';
      RAISE NOTICE '   → Vá em Supabase Dashboard → Settings → Vault';
      RAISE NOTICE '   → Adicione secret: META_SYSTEM_USER_ACCESS_TOKEN';
    END IF;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE '⚠️  Sem permissão para acessar vault.secrets diretamente';
      RAISE NOTICE '   → Verifique manualmente em: Supabase Dashboard → Settings → Vault';
    WHEN OTHERS THEN
      RAISE WARNING '⚠️  Erro ao verificar Vault: %', SQLERRM;
  END;
END $$;

-- 3. Testa a função get_encrypted_secret (se existir)
DO $$
DECLARE
  v_token TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_encrypted_secret') THEN
    SELECT get_encrypted_secret('META_SYSTEM_USER_ACCESS_TOKEN') INTO v_token;
    
    IF v_token IS NOT NULL AND v_token != '' THEN
      RAISE NOTICE '✅ Token encontrado via função get_encrypted_secret';
      RAISE NOTICE '   (Token não será exibido por segurança)';
    ELSE
      RAISE WARNING '❌ Token NÃO encontrado via função get_encrypted_secret';
      RAISE NOTICE '   → Verifique se o secret está no Vault com o nome exato: META_SYSTEM_USER_ACCESS_TOKEN';
    END IF;
  ELSE
    RAISE WARNING '❌ Função get_encrypted_secret não existe';
  END IF;
END $$;

-- 4. Resumo final
SELECT 
  '========================================' AS separador,
  'RESUMO DA CONFIGURAÇÃO' AS titulo,
  '========================================' AS separador2;

SELECT 
  '1. Função RPC' AS item,
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_encrypted_secret')
    THEN '✅ Configurada'
    ELSE '❌ Não configurada - Execute 006_prepare_meta_ads_integration.sql'
  END AS status;

-- Nota sobre Edge Function (não pode verificar via SQL)
SELECT 
  '2. Edge Function meta-ads-api' AS item,
  '⚠️  Verifique manualmente no Dashboard' AS status,
  '   → Supabase Dashboard → Edge Functions' AS instrucao;

-- Nota sobre Token no Vault
SELECT 
  '3. Token no Vault' AS item,
  '⚠️  Verifique manualmente no Dashboard' AS status,
  '   → Supabase Dashboard → Settings → Vault' AS instrucao,
  '   → Nome: META_SYSTEM_USER_ACCESS_TOKEN' AS nome_secret;

-- Nota sobre Secrets da Edge Function
SELECT 
  '4. Secrets da Edge Function' AS item,
  '⚠️  Verifique manualmente no Dashboard' AS status,
  '   → Edge Functions → Settings → Secrets' AS instrucao,
  '   → Adicione: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY' AS secrets_necessarios;

