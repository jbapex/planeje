// =====================================================
// TESTE: Verificar Quais Contas a API Meta Está Retornando
// =====================================================
// INSTRUÇÕES:
// 1. Abra o sistema no navegador
// 2. Pressione F12 (abre o Console do Desenvolvedor)
// 3. Vá na aba "Console"
// 4. Cole TODO este código e pressione Enter
// 5. Veja os resultados no console
// =====================================================

(async () => {
  try {
    console.log('🔍 Iniciando teste de busca de contas Meta...');
    
    // Tenta descobrir a URL do Supabase automaticamente
    let supabaseUrl = '';
    let supabaseAnonKey = '';
    
    // Método 1: Tenta pegar do window se disponível
    if (window.supabase) {
      const client = window.supabase;
      supabaseUrl = client.supabaseUrl;
      supabaseAnonKey = client.supabaseKey;
    }
    
    // Método 2: Tenta pegar do localStorage ou sessionStorage
    if (!supabaseUrl) {
      const stored = localStorage.getItem('supabase.auth.token') || 
                     sessionStorage.getItem('supabase.auth.token');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed.currentSession?.access_token) {
            // Extrai a URL da estrutura do token
            supabaseUrl = window.location.origin.includes('supabase') 
              ? window.location.origin 
              : 'https://SEU_PROJECT_REF.supabase.co';
          }
        } catch (e) {}
      }
    }
    
    // Método 3: Usa a URL atual se estiver no Supabase
    if (!supabaseUrl) {
      if (window.location.hostname.includes('supabase')) {
        supabaseUrl = `https://${window.location.hostname}`;
      } else {
        // Você precisa substituir isso pela URL do seu projeto
        supabaseUrl = prompt('Digite a URL do seu projeto Supabase (ex: https://abcdefgh.supabase.co):') || '';
      }
    }
    
    if (!supabaseUrl) {
      console.error('❌ Não foi possível determinar a URL do Supabase. Por favor, edite o código e adicione manualmente.');
      return;
    }
    
    console.log('📡 URL do Supabase:', supabaseUrl);
    
    // Faz a requisição para a Edge Function
    const response = await fetch(`${supabaseUrl}/functions/v1/meta-ads-api`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'get-ad-accounts' })
    });
    
    const data = await response.json();
    
    // Exibe os resultados
    console.log('\n📊 ============================================');
    console.log('📊 RESULTADO DO TESTE DE CONTAS META');
    console.log('📊 ============================================');
    
    if (data.error) {
      console.error('❌ ERRO:', data.error);
      console.error('   Mensagem:', data.error.message || data.error);
      console.error('   Código:', data.error.code || 'N/A');
    } else {
      const totalContas = data.adAccounts?.length || 0;
      console.log(`✅ Total de contas encontradas: ${totalContas}`);
      
      if (totalContas > 0) {
        console.log('\n📋 Lista de contas:');
        console.table(data.adAccounts.map(acc => ({
          ID: acc.id,
          Nome: acc.name || 'Sem nome',
          'Account ID': acc.account_id || 'N/A',
          Moeda: acc.currency || 'N/A'
        })));
        
        console.log('\n📋 IDs das contas (para copiar):');
        console.log(data.adAccounts.map(acc => acc.id).join(', '));
        
        console.log('\n📋 Nomes das contas:');
        data.adAccounts.forEach((acc, index) => {
          console.log(`   ${index + 1}. ${acc.name || acc.id} (${acc.id})`);
        });
      } else {
        console.warn('⚠️ Nenhuma conta foi encontrada!');
        console.log('   Verifique:');
        console.log('   1. Se o token está configurado no Supabase Vault');
        console.log('   2. Se o System User tem acesso às contas no Meta Business Manager');
        console.log('   3. Se a Edge Function está deployada');
      }
    }
    
    console.log('\n📊 ============================================\n');
    
    return data;
  } catch (err) {
    console.error('❌ Erro ao executar teste:', err);
    console.error('   Detalhes:', err.message);
    console.error('\n💡 Dica: Verifique se você está no sistema e se a URL do Supabase está correta.');
  }
})();
