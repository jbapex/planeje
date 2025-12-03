-- =====================================================
-- ADICIONAR TOKEN META ADS VIA SQL
-- =====================================================
-- ⚠️ ATENÇÃO: Substitua 'SEU_TOKEN_AQUI' pelo token real!
-- =====================================================

-- Execute este comando substituindo 'SEU_TOKEN_AQUI' pelo token do Meta:
-- SELECT set_meta_token('SEU_TOKEN_AQUI');

-- OU use diretamente (se a função set_meta_token não existir):

-- Método 1: Tentar inserir diretamente no Vault (pode não ter permissão)
INSERT INTO vault.secrets (name, secret)
VALUES ('META_SYSTEM_USER_ACCESS_TOKEN', 'SEU_TOKEN_AQUI'::bytea)
ON CONFLICT (name) 
DO UPDATE SET 
  secret = EXCLUDED.secret,
  updated_at = NOW();

-- Se der erro de permissão, use o Dashboard:
-- → Supabase Dashboard → Settings → Vault
-- → Add Secret
-- → Nome: META_SYSTEM_USER_ACCESS_TOKEN
-- → Valor: Cole seu token aqui

-- =====================================================
-- VERIFICAR SE FUNCIONOU
-- =====================================================

-- Verifica se o token foi adicionado:
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM vault.secrets 
      WHERE name = 'META_SYSTEM_USER_ACCESS_TOKEN'
    )
    THEN '✅ Token encontrado no Vault!'
    ELSE '❌ Token NÃO encontrado. Adicione via Dashboard.'
  END AS status;

-- Testa a função get_encrypted_secret:
SELECT 
  CASE 
    WHEN get_encrypted_secret('META_SYSTEM_USER_ACCESS_TOKEN') IS NOT NULL
    THEN '✅ Token acessível via função RPC'
    ELSE '❌ Token não acessível. Verifique permissões.'
  END AS status_funcao;

