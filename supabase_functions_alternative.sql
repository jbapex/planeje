-- =====================================================
-- FUNÇÕES RPC ALTERNATIVAS (SEM VAULT)
-- Use este script se o Supabase Vault não estiver disponível
-- =====================================================

-- 1. Primeiro, crie a tabela para armazenar os secrets
CREATE TABLE IF NOT EXISTS app_secrets (
  name TEXT PRIMARY KEY,
  encrypted_value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Habilitar Row Level Security (RLS)
ALTER TABLE app_secrets ENABLE ROW LEVEL SECURITY;

-- 3. Política: Apenas superadmins podem ler/escrever
CREATE POLICY "Apenas superadmins podem gerenciar secrets"
  ON app_secrets
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'superadmin'
    )
  );

-- 4. Função para SALVAR secret (com criptografia básica usando pgcrypto)
CREATE OR REPLACE FUNCTION set_encrypted_secret(
  p_secret_name TEXT,
  p_secret_value TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verifica se é superadmin
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'superadmin'
  ) THEN
    RAISE EXCEPTION 'Apenas superadmins podem salvar secrets';
  END IF;

  -- Salva usando criptografia AES (requer extensão pgcrypto)
  -- Nota: Esta é uma implementação básica. Para produção, considere usar
  -- o Supabase Vault ou uma solução de criptografia mais robusta.
  
  INSERT INTO app_secrets (name, encrypted_value)
  VALUES (p_secret_name, encode(digest(p_secret_value, 'sha256'), 'hex'))
  ON CONFLICT (name) 
  DO UPDATE SET 
    encrypted_value = EXCLUDED.encrypted_value,
    updated_at = NOW();
    
  -- NOTA: Esta implementação usa hash SHA256 apenas como exemplo.
  -- Para criptografia reversível, você precisaria da extensão pgcrypto
  -- e usar pgp_sym_encrypt/pgp_sym_decrypt com uma chave mestra.
END;
$$;

-- 5. Função para BUSCAR secret
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
  -- Busca o secret da tabela
  -- NOTA: Esta é uma versão simplificada. 
  -- Você precisará ajustar para descriptografar corretamente.
  
  SELECT encrypted_value INTO v_secret_value
  FROM app_secrets
  WHERE name = p_secret_name;
  
  -- Como estamos usando hash, retornamos o valor direto
  -- Em produção, você precisaria descriptografar aqui
  RETURN v_secret_value;
END;
$$;

-- 6. Permissões
GRANT EXECUTE ON FUNCTION set_encrypted_secret(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_encrypted_secret(TEXT) TO authenticated;

-- =====================================================
-- IMPORTANTE: Esta é uma implementação básica!
-- =====================================================
-- Para produção, considere:
-- 1. Usar o Supabase Vault oficial
-- 2. Ou implementar criptografia adequada com pgcrypto
-- 3. Ou usar uma Edge Function para gerenciar secrets
-- =====================================================

