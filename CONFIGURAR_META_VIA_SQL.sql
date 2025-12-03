-- =====================================================
-- CONFIGURAÇÃO META ADS VIA SQL
-- =====================================================
-- Este script prepara o banco para a integração Meta Ads
-- NOTA: A Edge Function precisa ser deployada separadamente
-- =====================================================

-- 1. Garante que a função get_encrypted_secret existe
-- (Necessária para a Edge Function buscar o token do Vault)
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
  -- Tenta buscar do vault.secrets (Supabase Vault)
  BEGIN
    SELECT decrypted_secret INTO v_secret_value
    FROM vault.secrets
    WHERE name = p_secret_name;
    
    IF v_secret_value IS NOT NULL THEN
      RETURN v_secret_value;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      -- Se não conseguir acessar, retorna NULL
      NULL;
  END;
  
  RETURN NULL;
END;
$$;

-- 2. Garante permissões
GRANT EXECUTE ON FUNCTION get_encrypted_secret(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_encrypted_secret(TEXT) TO service_role;

-- 3. Função para ADICIONAR token no Vault (se tiver permissão)
-- ⚠️ ATENÇÃO: Pode não funcionar dependendo das permissões do Vault
CREATE OR REPLACE FUNCTION set_meta_token(
  p_token_value TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Tenta inserir/atualizar no vault.secrets
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

GRANT EXECUTE ON FUNCTION set_meta_token(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION set_meta_token(TEXT) TO service_role;

-- 4. Função para VERIFICAR se o token está configurado
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
  v_token_value TEXT;
BEGIN
  -- Verifica função RPC
  RETURN QUERY SELECT 
    '1. Função get_encrypted_secret'::TEXT AS item,
    CASE 
      WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_encrypted_secret')
      THEN '✅ Configurada'::TEXT
      ELSE '❌ Não configurada'::TEXT
    END AS status,
    'Execute este script completo'::TEXT AS instrucao;
  
  -- Verifica token no Vault
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
  
  -- Nota sobre Edge Function
  RETURN QUERY SELECT 
    '3. Edge Function meta-ads-api'::TEXT,
    '⚠️  Verificar manualmente'::TEXT,
    'Dashboard → Edge Functions (não pode ser criada via SQL)'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION check_meta_token_config() TO authenticated;

-- 5. Comentários
COMMENT ON FUNCTION get_encrypted_secret IS 'Busca secret do Supabase Vault. Usado pela Edge Function meta-ads-api.';
COMMENT ON FUNCTION set_meta_token IS 'Adiciona/atualiza o token do Meta no Vault. Use: SELECT set_meta_token(''seu-token-aqui'');';
COMMENT ON FUNCTION check_meta_token_config IS 'Verifica status da configuração do Meta Ads. Use: SELECT * FROM check_meta_token_config();';

-- =====================================================
-- INSTRUÇÕES DE USO
-- =====================================================

/*
=====================================================
COMO USAR ESTE SCRIPT:
=====================================================

1. Execute este script completo no SQL Editor do Supabase
   → Isso criará as funções necessárias

2. Adicione o token (escolha UMA opção):

   OPÇÃO A - Via SQL (pode não funcionar se não tiver permissão):
   SELECT set_meta_token('SEU_TOKEN_DO_META_AQUI');
   
   OPÇÃO B - Via Dashboard (RECOMENDADO):
   → Supabase Dashboard → Settings → Vault
   → Add Secret
   → Nome: META_SYSTEM_USER_ACCESS_TOKEN
   → Valor: Seu token

3. Verifique a configuração:
   SELECT * FROM check_meta_token_config();

4. Deploy da Edge Function (NÃO pode ser feito via SQL):
   → Via Dashboard: Copie código de supabase/functions/meta-ads-api/index.ts
   → Via CLI: supabase functions deploy meta-ads-api

=====================================================
*/

