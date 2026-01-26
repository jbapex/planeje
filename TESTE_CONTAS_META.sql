-- =====================================================
-- TESTE: Verificar Quais Contas a API Meta Está Retornando
-- =====================================================
-- ⚠️ IMPORTANTE: Este SQL não funciona diretamente
-- Use o método via Console do Navegador (veja abaixo)
-- =====================================================

-- =====================================================
-- MÉTODO RECOMENDADO: Via Console do Navegador
-- =====================================================
-- 1. Abra o sistema no navegador
-- 2. Pressione F12 (abre o Console)
-- 3. Cole e execute o código JavaScript abaixo:

/*
// Cole este código no Console do Navegador (F12):

(async () => {
  try {
    // Busca a URL e chave do Supabase automaticamente
    const supabaseUrl = window.location.origin.includes('supabase') 
      ? window.location.origin 
      : 'https://SEU_PROJECT_REF.supabase.co';
    
    const response = await fetch(`${supabaseUrl}/functions/v1/meta-ads-api`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('sb-access-token') || 'SEU_ANON_KEY'}`
      },
      body: JSON.stringify({ action: 'get-ad-accounts' })
    });
    
    const data = await response.json();
    
    console.log('📊 ============================================');
    console.log('📊 RESULTADO DO TESTE DE CONTAS META');
    console.log('📊 ============================================');
    console.log('✅ Total de contas encontradas:', data.adAccounts?.length || 0);
    console.log('📋 Contas encontradas:', data.adAccounts);
    
    if (data.adAccounts && data.adAccounts.length > 0) {
      console.log('📋 IDs das contas:', data.adAccounts.map(acc => acc.id).join(', '));
      console.table(data.adAccounts.map(acc => ({
        ID: acc.id,
        Nome: acc.name || 'Sem nome',
        Account_ID: acc.account_id || 'N/A',
        Moeda: acc.currency || 'N/A'
      })));
    }
    
    if (data.error) {
      console.error('❌ Erro:', data.error);
    }
    
    return data;
  } catch (err) {
    console.error('❌ Erro ao executar teste:', err);
  }
})();
*/

-- =====================================================
-- MÉTODO ALTERNATIVO: Via Logs do Supabase (MAIS FÁCIL!)
-- =====================================================
-- 1. Acesse: Supabase Dashboard → Edge Functions → meta-ads-api → Logs
-- 2. No seu sistema, recarregue a página de Gestão de Tráfego
-- 3. Volte aos Logs e procure por:
--    - "✅ Total unique ad accounts found: X"
--    - "📋 Account IDs: ..."
--    - "📋 Business IDs: ..."

-- =====================================================
-- EXEMPLO DE RESULTADO ESPERADO:
-- =====================================================
-- {
--   "adAccounts": [
--     {
--       "id": "act_123456789",
--       "name": "Nome da Conta",
--       "account_id": "123456789",
--       "currency": "BRL"
--     },
--     ...
--   ]
-- }

-- =====================================================
-- NOTA: O método mais fácil é verificar os Logs!
-- Não precisa escrever código, apenas ver o que já está sendo registrado.
-- =====================================================
