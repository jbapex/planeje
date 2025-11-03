-- =====================================================
-- VERSÃO SIMPLIFICADA - FUNÇÃO PARA SALVAR/BUSCAR SECRETS
-- Execute este script no SQL Editor do Supabase
-- =====================================================
-- Esta versão usa uma tabela simples e funciona sem Vault
-- =====================================================

-- 1. Criar tabela para armazenar secrets (se não existir)
CREATE TABLE IF NOT EXISTS app_secrets (
  name TEXT PRIMARY KEY,
  secret_value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Habilitar Row Level Security
ALTER TABLE app_secrets ENABLE ROW LEVEL SECURITY;

-- 3. Política: Apenas superadmins podem ler/escrever
DROP POLICY IF EXISTS "Apenas superadmins podem gerenciar secrets" ON app_secrets;

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

-- 4. Função para SALVAR secret
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

  -- Insere ou atualiza o secret
  INSERT INTO app_secrets (name, secret_value)
  VALUES (p_secret_name, p_secret_value)
  ON CONFLICT (name) 
  DO UPDATE SET 
    secret_value = EXCLUDED.secret_value,
    updated_at = NOW();
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
  -- Verifica se é superadmin ou admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('superadmin', 'admin', 'colaborador')
  ) THEN
    RETURN NULL;
  END IF;

  -- Busca o secret
  SELECT secret_value INTO v_secret_value
  FROM app_secrets
  WHERE name = p_secret_name;
  
  RETURN v_secret_value;
END;
$$;

-- 6. Conceder permissões de execução
GRANT EXECUTE ON FUNCTION set_encrypted_secret(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_encrypted_secret(TEXT) TO authenticated;

-- 7. Garantir permissões na tabela
GRANT SELECT, INSERT, UPDATE ON app_secrets TO authenticated;

-- =====================================================
-- PRONTO! Agora você pode salvar a chave API
-- =====================================================
-- Esta implementação:
-- ✅ Salva em uma tabela segura no banco
-- ✅ Protegida por RLS (Row Level Security)
-- ✅ Apenas superadmins podem salvar
-- ✅ Superadmins, admins e colaboradores podem ler
-- =====================================================

