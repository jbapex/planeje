# 🧪 Como Testar a Edge Function no Supabase Dashboard

## 🎯 Objetivo

Verificar quais contas a API do Meta está retornando diretamente no Supabase.

---

## ✅ Método 1: Via Logs da Edge Function (Mais Fácil)

### **Passo a Passo:**

1. **Acesse o Supabase Dashboard**
   - https://supabase.com/dashboard
   - Selecione seu projeto

2. **Vá em Edge Functions**
   - Menu lateral → **Edge Functions**

3. **Selecione `meta-ads-api`**
   - Clique na função `meta-ads-api`

4. **Vá na aba Logs**
   - Clique em **Logs** no topo

5. **Execute um teste no sistema:**
   - No seu sistema, acesse **Gestão de Tráfego**
   - Tente vincular uma conta ou recarregue a página
   - Isso vai disparar a busca de contas

6. **Volte aos Logs:**
   - Os logs mais recentes vão aparecer
   - Procure por:
     - `🔍 Fetching ad accounts...`
     - `✅ Found X ad accounts...`
     - `📋 Business IDs: ...`
     - `📋 Account IDs: ...`

**Os logs vão mostrar exatamente:**
- Quantas businesses foram encontradas
- Quantas contas foram encontradas em cada business
- Quais são os IDs das contas encontradas
- Se há algum erro

---

## ✅ Método 2: Via SQL Editor (Teste Direto)

### **Passo a Passo:**

1. **Acesse o SQL Editor no Supabase**
   - Menu lateral → **SQL Editor**

2. **Crie uma Nova Query**

3. **Cole este código:**

```sql
-- Teste da Edge Function meta-ads-api
SELECT 
  net.http_post(
    url := 'https://SEU_PROJECT_REF.supabase.co/functions/v1/meta-ads-api',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1)
    ),
    body := jsonb_build_object(
      'action', 'get-ad-accounts'
    )
  ) AS response;
```

4. **Substitua `SEU_PROJECT_REF`:**
   - Encontre na URL do seu projeto Supabase
   - Exemplo: Se a URL é `https://abcdefgh.supabase.co`, então `abcdefgh` é o Project Ref

5. **Execute a Query (Ctrl+Enter ou Run)**

6. **Veja o Resultado:**
   - Clique no resultado para expandir
   - Procure pelo campo que contém o JSON
   - Procure por `"adAccounts"` no JSON
   - Lá você verá todas as contas retornadas

---

## ✅ Método 3: Via Console do Navegador (Teste no Frontend)

### **Passo a Passo:**

1. **Abra o sistema no navegador**

2. **Abra o Console do Desenvolvedor**
   - Pressione **F12** ou **Ctrl+Shift+I** (Windows/Linux)
   - Ou **Cmd+Option+I** (Mac)

3. **Vá na aba Console**

4. **Cole este código e execute:**

```javascript
// Teste direto da busca de contas
(async () => {
  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(
      'SUA_SUPABASE_URL',
      'SUA_SUPABASE_ANON_KEY'
    );
    
    console.log('🔍 Buscando contas...');
    const { data, error } = await supabase.functions.invoke('meta-ads-api', {
      body: { action: 'get-ad-accounts' }
    });
    
    if (error) {
      console.error('❌ Erro:', error);
      return;
    }
    
    if (data?.error) {
      console.error('❌ Erro da API:', data.error);
      return;
    }
    
    console.log('✅ Contas encontradas:', data.adAccounts?.length || 0);
    console.log('📋 Lista de contas:', data.adAccounts);
    console.log('📋 IDs das contas:', data.adAccounts?.map(acc => acc.id).join(', '));
    
    // Mostra detalhes de cada conta
    if (data.adAccounts && data.adAccounts.length > 0) {
      console.table(data.adAccounts.map(acc => ({
        ID: acc.id,
        Nome: acc.name || 'Sem nome',
        Account ID: acc.account_id || 'N/A',
        Moeda: acc.currency || 'N/A'
      })));
    }
  } catch (err) {
    console.error('❌ Erro ao executar teste:', err);
  }
})();
```

5. **Substitua as variáveis:**
   - `SUA_SUPABASE_URL`: URL do seu projeto (ex: `https://abcdefgh.supabase.co`)
   - `SUA_SUPABASE_ANON_KEY`: Chave anônima (encontra em Settings → API → anon public)

6. **Execute o código**
   - Pressione Enter
   - Veja os resultados no console

---

## 📊 O Que Procurar nos Resultados

### **Se aparecerem menos contas do que esperado:**

1. **Verifique os logs da Edge Function:**
   - Quantas businesses foram encontradas?
   - Quantas contas em cada business?

2. **Verifique se há erros:**
   - Procure por `❌` ou `⚠️` nos logs
   - Veja se há mensagens de erro

3. **Verifique o Business Manager:**
   - O System User tem acesso a todas as businesses?
   - Todas as contas estão atribuídas ao System User?

### **Se aparecerem todas as contas:**

✅ **Funcionou!** O problema pode estar no frontend filtrando as contas.

---

## 🆘 Problemas Comuns

### **Erro: "Function not found"**
- A Edge Function não está deployada
- Execute: `supabase functions deploy meta-ads-api`

### **Erro: "TOKEN_NOT_FOUND"**
- O token não está no Vault
- Verifique: Settings → Vault → `META_SYSTEM_USER_ACCESS_TOKEN`

### **Erro: "Permission denied"**
- O System User não tem acesso às contas
- Verifique no Meta Business Manager

---

## 💡 Dica

**O método mais fácil é o Método 1 (Logs)**, pois você não precisa escrever código, apenas ver os logs que já estão sendo gerados automaticamente!

---

**Última atualização**: 2026-01-25
