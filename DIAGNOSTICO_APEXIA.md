# 🔍 Diagnóstico Rápido - ApexIA não está respondendo

Se você está recebendo o erro: **"O servidor retornou um erro. Por favor, contate o administrador"**, siga este guia:

## ✅ Checklist Rápido

### 1. Verificar se a Edge Function está deployada

**No Dashboard do Supabase:**
1. Vá para **Edge Functions** (menu lateral)
2. Procure por `openai-chat` na lista
3. ✅ Se **EXISTE**: Pule para o passo 2
4. ❌ Se **NÃO EXISTE**: Você precisa fazer o deploy primeiro

**Como fazer deploy:**
- Opção A (CLI): `supabase functions deploy openai-chat`
- Opção B (Dashboard): Create Function → Cole o código de `supabase/functions/openai-chat/index.ts`

### 2. Verificar se a API Key está configurada

**No Dashboard do Supabase:**
1. Vá para **Edge Functions** → **Settings** (ou **Secrets**)
2. Procure por `OPENAI_API_KEY`
3. ✅ Se **EXISTE** com valor: Pule para o passo 3
4. ❌ Se **NÃO EXISTE**: Adicione agora

**Como adicionar:**
- Adicione uma variável de ambiente:
  - Nome: `OPENAI_API_KEY`
  - Valor: Sua chave da OpenAI (começa com `sk-`)

**OU** via SQL (se usar app_secrets):
```sql
SELECT set_encrypted_secret('OPENAI_API_KEY', 'sua-chave-openai-aqui');
```

### 3. Verificar os Logs da Edge Function

**No Dashboard do Supabase:**
1. Vá para **Edge Functions** → **Logs**
2. Selecione `openai-chat`
3. Envie uma mensagem no ApexIA
4. Veja os logs em tempo real

**O que procurar:**
- ✅ `API key obtida da...` → OK, API key encontrada
- ❌ `OpenAI API key não encontrada` → Problema: API key não configurada
- ❌ `Erro na API da OpenAI` → Problema: API key inválida ou sem crédito
- ❌ `Function not found` → Problema: Função não deployada

### 4. Testar a Edge Function diretamente

Abra o **Console do Navegador** (F12) e execute:

```javascript
// Substitua pela sua anon key do Supabase
const SUPABASE_ANON_KEY = 'sua-anon-key-aqui';

const response = await fetch('https://seu-projeto.supabase.co/functions/v1/openai-chat', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    messages: [{ role: 'user', content: 'Teste' }],
    model: 'gpt-4o'
  })
});

console.log('Status:', response.status);
console.log('Headers:', Object.fromEntries(response.headers));
const text = await response.text();
console.log('Resposta:', text.substring(0, 200));
```

**Interpretação:**
- Status 200: ✅ Funcionando! O problema pode ser no frontend
- Status 404: ❌ Função não encontrada → Precisa fazer deploy
- Status 500: ❌ Erro na função → Veja os logs
- Status 401/403: ❌ Problema de autenticação ou API key

## 🚨 Problemas Comuns e Soluções

### Problema 1: "Function not found" (404)
**Solução:** A Edge Function não está deployada
- Deploy usando CLI ou Dashboard (veja passo 1)

### Problema 2: "OpenAI API key não configurada"
**Solução:** Adicione a API key
- Dashboard → Edge Functions → Settings → Adicione `OPENAI_API_KEY`

### Problema 3: "Configuração do servidor incompleta"
**Solução:** Variáveis do Supabase não configuradas
- O Supabase deve configurar automaticamente `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`
- Se não estiverem, adicione manualmente nas Settings da Edge Function

### Problema 4: "Chave de API da OpenAI inválida"
**Solução:** API key incorreta ou expirada
- Verifique se a chave está correta
- Verifique se tem créditos na conta da OpenAI

### Problema 5: Stream não funciona (mas status 200)
**Solução:** Problema no processamento do stream no frontend
- Veja o console do navegador para erros
- Verifique se `data.body` é um ReadableStream

## 📋 Passo a Passo Completo

1. ✅ **Deploy da Edge Function**
   ```bash
   # Se usar CLI
   supabase functions deploy openai-chat
   ```

2. ✅ **Configurar API Key**
   - Dashboard → Edge Functions → Settings → Adicione `OPENAI_API_KEY`

3. ✅ **Testar**
   - Envie uma mensagem no ApexIA
   - Veja os logs no Dashboard
   - Veja o console do navegador (F12)

4. ✅ **Verificar resposta**
   - Deve aparecer texto sendo gerado em tempo real
   - Não deve aparecer erro

## 🔗 Arquivos Importantes

- **Código da Edge Function**: `supabase/functions/openai-chat/index.ts`
- **Instruções de Deploy**: `supabase/functions/openai-chat/README.md`
- **Configuração Geral**: `EDGE_FUNCTION_PUBLIC_CONFIG.md`

## 💡 Dica Final

**Sempre verifique os logs primeiro!** Eles vão te dizer exatamente o que está errado:
- Dashboard do Supabase → Edge Functions → Logs → openai-chat

Os logs mostram em tempo real o que a função está fazendo e qual erro está ocorrendo.

