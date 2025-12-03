-- =====================================================
-- PREPARAÇÃO PARA INTEGRAÇÃO META ADS
-- =====================================================
-- Este script prepara o banco de dados para a Edge Function meta-ads-api
-- NOTA: A Edge Function em si precisa ser deployada via CLI ou Dashboard
-- =====================================================

-- 1. Verifica e cria a função RPC para buscar secrets do Vault
-- (Necessária para a Edge Function buscar o token)
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
      -- Se vault.secrets não existir ou não tiver acesso, retorna NULL
      NULL;
  END;
  
  -- Fallback: tenta buscar de uma tabela alternativa (se existir)
  BEGIN
    SELECT secret_value INTO v_secret_value
    FROM app_secrets
    WHERE secret_name = p_secret_name;
    
    RETURN v_secret_value;
  EXCEPTION
    WHEN OTHERS THEN
      RETURN NULL;
  END;
END;
$$;

-- 2. Garante permissões para a função
GRANT EXECUTE ON FUNCTION get_encrypted_secret(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_encrypted_secret(TEXT) TO service_role;

-- 3. Comentário explicativo
COMMENT ON FUNCTION get_encrypted_secret IS 'Busca um secret do Supabase Vault ou tabela app_secrets. Usado pela Edge Function meta-ads-api para buscar META_SYSTEM_USER_ACCESS_TOKEN.';

-- =====================================================
-- VERIFICAÇÕES
-- =====================================================

-- Verifica se a função foi criada
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM pg_proc 
    WHERE proname = 'get_encrypted_secret'
  ) THEN
    RAISE NOTICE '✅ Função get_encrypted_secret criada com sucesso!';
  ELSE
    RAISE WARNING '❌ Erro ao criar função get_encrypted_secret';
  END IF;
END $$;

-- =====================================================
-- PRÓXIMOS PASSOS (NÃO PODEM SER FEITOS VIA SQL)
-- =====================================================

/*
⚠️ IMPORTANTE: As seguintes ações NÃO podem ser feitas via SQL:

1. ❌ Criar/Deployar Edge Function
   → Precisa ser feito via:
      - Supabase Dashboard → Edge Functions → Create
      - OU: supabase functions deploy meta-ads-api

2. ❌ Adicionar secret no Vault
   → Precisa ser feito via:
      - Supabase Dashboard → Settings → Vault → Add Secret
      - Nome: META_SYSTEM_USER_ACCESS_TOKEN
      - Valor: Token do System User do Meta

3. ❌ Configurar variáveis de ambiente da Edge Function
   → Precisa ser feito via:
      - Supabase Dashboard → Edge Functions → Settings → Secrets
      - Adicionar: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY

=====================================================
COMO COMPLETAR A CONFIGURAÇÃO:
=====================================================

1. Execute este SQL (você já está fazendo isso)

2. Deploy da Edge Function:
   - Via Dashboard: Copie o código de supabase/functions/meta-ads-api/index.ts
   - Via CLI: supabase functions deploy meta-ads-api

3. Adicione o token no Vault:
   - Supabase Dashboard → Settings → Vault
   - Nome: META_SYSTEM_USER_ACCESS_TOKEN
   - Valor: Seu token do Meta

4. Configure secrets da Edge Function:
   - Supabase Dashboard → Edge Functions → Settings → Secrets
   - Adicione SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY

=====================================================
*/

