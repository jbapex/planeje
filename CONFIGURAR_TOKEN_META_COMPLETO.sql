-- =====================================================
-- CONFIGURAÇÃO COMPLETA META ADS VIA SQL
-- =====================================================
-- Este script faz TUDO de uma vez:
-- 1. Cria as funções necessárias
-- 2. Adiciona o token no Vault
-- =====================================================

-- =====================================================
-- PARTE 1: CRIAR FUNÇÕES NECESSÁRIAS
-- =====================================================

-- 1. Função para buscar secrets do Vault
CREATE OR REPLACE FUNCTION get_encrypted_secret(
  p_secret_name TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_secret_value TEXT;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_secret_value
    FROM vault.secrets
    WHERE name = p_secret_name;
    
    IF v_secret_value IS NOT NULL THEN
      RETURN v_secret_value;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;
  
  RETURN NULL;
END;
$$;

-- 2. Função para adicionar token no Vault
CREATE OR REPLACE FUNCTION set_meta_token(
  p_token_value TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  BEGIN
    INSERT INTO vault.secrets (name, secret)
    VALUES ('META_SYSTEM_USER_ACCESS_TOKEN', p_token_value::bytea)
    ON CONFLICT (name) 
    DO UPDATE SET 
      secret = EXCLUDED.secret,
      updated_at = NOW();
    
    RETURN '✅ Token adicionado/atualizado no Vault com sucesso!';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RETURN '❌ Sem permissão para acessar vault.secrets. Adicione manualmente via Dashboard → Settings → Vault';
    WHEN OTHERS THEN
      RETURN '❌ Erro: ' || SQLERRM || '. Adicione manualmente via Dashboard → Settings → Vault';
  END;
END;
$$;

-- 3. Função para verificar configuração
CREATE OR REPLACE FUNCTION check_meta_token_config()
RETURNS TABLE (
  item TEXT,
  status TEXT,
  instrucao TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token_exists BOOLEAN := FALSE;
BEGIN
  RETURN QUERY SELECT 
    '1. Função get_encrypted_secret'::TEXT AS item,
    CASE 
      WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_encrypted_secret')
      THEN '✅ Configurada'::TEXT
      ELSE '❌ Não configurada'::TEXT
    END AS status,
    'Execute este script completo'::TEXT AS instrucao;
  
  BEGIN
    SELECT EXISTS(
      SELECT 1 FROM vault.secrets 
      WHERE name = 'META_SYSTEM_USER_ACCESS_TOKEN'
    ) INTO v_token_exists;
    
    IF v_token_exists THEN
      RETURN QUERY SELECT 
        '2. Token no Vault'::TEXT,
        '✅ Encontrado'::TEXT,
        'Token está configurado corretamente'::TEXT;
    ELSE
      RETURN QUERY SELECT 
        '2. Token no Vault'::TEXT,
        '❌ NÃO encontrado'::TEXT,
        'Execute: SELECT set_meta_token(''SEU_TOKEN_AQUI'');'::TEXT;
    END IF;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RETURN QUERY SELECT 
        '2. Token no Vault'::TEXT,
        '⚠️  Não foi possível verificar'::TEXT,
        'Verifique manualmente em Dashboard → Settings → Vault'::TEXT;
    WHEN OTHERS THEN
      RETURN QUERY SELECT 
        '2. Token no Vault'::TEXT,
        '⚠️  Erro ao verificar: ' || SQLERRM::TEXT,
        'Verifique manualmente'::TEXT;
  END;
  
  RETURN QUERY SELECT 
    '3. Edge Function meta-ads-api'::TEXT,
    '⚠️  Verificar manualmente'::TEXT,
    'Dashboard → Edge Functions (não pode ser criada via SQL)'::TEXT;
END;
$$;

-- 4. Conceder permissões
GRANT EXECUTE ON FUNCTION get_encrypted_secret(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_encrypted_secret(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION set_meta_token(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION set_meta_token(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION check_meta_token_config() TO authenticated;

-- =====================================================
-- PARTE 2: ADICIONAR O TOKEN
-- =====================================================

-- Tenta adicionar o token usando a função
DO $$
DECLARE
  v_result TEXT;
BEGIN
  -- Tenta usar a função set_meta_token
  SELECT set_meta_token('EAAQLsv8KHG4BQAVfteheZBu3Crk8UnSne6RvMZACK32qDZAVFBZCk0DVQpPIB56kP1ZA1wmIWHPmqkvsitTKxd4m0bgZBZBvak8TLSaDDMpbeDmgqNtHdnw9pAny6ntbuNmhKtcVK12vkdPmaDcNWWLrII0wWDn9IS8OExMYHaqp0KdmbRm6msrp1voXzGdgKrDSQZDZD') INTO v_result;
  
  RAISE NOTICE '%', v_result;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '❌ Erro ao adicionar token via função: %', SQLERRM;
    RAISE NOTICE '💡 Tente adicionar manualmente via Dashboard → Settings → Vault';
END;
$$;

-- =====================================================
-- PARTE 3: VERIFICAR CONFIGURAÇÃO
-- =====================================================

-- Mostra o status da configuração
SELECT * FROM check_meta_token_config();

-- =====================================================
-- PRÓXIMOS PASSOS
-- =====================================================
/*
Se o token não foi adicionado via SQL, adicione manualmente:

1. Acesse: https://supabase.com/dashboard
2. Vá em: Settings → Vault
3. Clique em: Add Secret
4. Preencha:
   - Name: META_SYSTEM_USER_ACCESS_TOKEN
   - Value: EAAQLsv8KHG4BQAVfteheZBu3Crk8UnSne6RvMZACK32qDZAVFBZCk0DVQpPIB56kP1ZA1wmIWHPmqkvsitTKxd4m0bgZBZBvak8TLSaDDMpbeDmgqNtHdnw9pAny6ntbuNmhKtcVK12vkdPmaDcNWWLrII0wWDn9IS8OExMYHaqp0KdmbRm6msrp1voXzGdgKrDSQZDZD
5. Salve

Depois, verifique novamente:
SELECT * FROM check_meta_token_config();
*/

