-- =====================================================
-- FUNÇÕES RPC PARA GERENCIAR SECRETS NO SUPABASE VAULT
-- =====================================================
-- Execute este script no SQL Editor do seu projeto Supabase
-- =====================================================

-- Função para SALVAR secret no Vault
CREATE OR REPLACE FUNCTION set_encrypted_secret(
  p_secret_name TEXT,
  p_secret_value TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insere ou atualiza o secret no vault
  INSERT INTO vault.secrets (name, secret)
  VALUES (p_secret_name, p_secret_value::bytea)
  ON CONFLICT (name) 
  DO UPDATE SET 
    secret = EXCLUDED.secret,
    updated_at = NOW();
END;
$$;

-- Função para BUSCAR secret do Vault
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
  -- Busca o secret descriptografado do vault
  SELECT decrypted_secret INTO v_secret_value
  FROM vault.secrets
  WHERE name = p_secret_name;
  
  RETURN v_secret_value;
END;
$$;

-- =====================================================
-- PERMISSÕES
-- =====================================================
-- Garantir que apenas usuários autenticados possam usar
GRANT EXECUTE ON FUNCTION set_encrypted_secret(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_encrypted_secret(TEXT) TO authenticated;

-- =====================================================
-- NOTA IMPORTANTE:
-- =====================================================
-- Se você usar o Supabase Vault (vault.secrets), você precisa:
-- 1. Habilitar o Vault no seu projeto Supabase
-- 2. Garantir que as permissões estão corretas
--
-- ALTERNATIVA: Se o Vault não estiver disponível, você pode usar
-- uma tabela simples com criptografia. Veja o script alternativo abaixo.
-- =====================================================

