# ⚡ Configuração Rápida da API Key - Resolver Erro do ApexIA

## 🚨 Erro Atual
```
"Could not retrieve OpenAI API key. Please ensure it's set in the Vault and the function has the correct permissions."
```

## ✅ Solução (2 minutos)

### Passo 1: Obter sua chave da OpenAI

1. Acesse: https://platform.openai.com/api-keys
2. Crie uma nova chave ou copie uma existente
3. A chave começa com `sk-...`

### Passo 2: Configurar no Supabase (MAIS FÁCIL)

1. Acesse o **Dashboard do Supabase**: https://supabase.com/dashboard
2. Selecione seu projeto
3. Vá em **Edge Functions** (menu lateral)
4. Clique em **Settings** (ou procure por "Secrets" ou "Environment Variables")
5. Clique em **Add Secret** ou **Add Environment Variable**
6. Preencha:
   - **Name**: `OPENAI_API_KEY`
   - **Value**: Cole sua chave da OpenAI (ex: `sk-proj-...`)
7. Clique em **Save**

### Passo 3: Fazer Deploy da Edge Function Atualizada

**Opção A - Via Dashboard (Passo a Passo Detalhado):**

#### Se a função JÁ EXISTE:
1. Acesse: https://supabase.com/dashboard
2. Selecione seu projeto
3. No menu lateral esquerdo, clique em **Edge Functions**
4. Você verá uma lista de funções. Procure por `openai-chat`
5. Clique no nome `openai-chat` para abrir
6. Você verá o código da função. Clique no botão **Edit** ou **Deploy** (dependendo da interface)
7. **Substitua TODO o código** pelo conteúdo do arquivo `supabase/functions/openai-chat/index.ts`
   - Para copiar: Abra o arquivo `supabase/functions/openai-chat/index.ts` no seu editor
   - Selecione todo o conteúdo (Ctrl+A / Cmd+A)
   - Copie (Ctrl+C / Cmd+C)
   - Volte ao Dashboard, selecione todo o código antigo e cole (Ctrl+V / Cmd+V)
8. Clique em **Save** ou **Deploy**
9. Aguarde alguns segundos até aparecer "Deployed" ou mensagem de sucesso

#### Se a função NÃO EXISTE ainda:
1. Acesse: https://supabase.com/dashboard
2. Selecione seu projeto
3. No menu lateral esquerdo, clique em **Edge Functions**
4. Clique no botão **Create Function** ou **New Function** (geralmente no topo direito)
5. Preencha:
   - **Function name**: `openai-chat` (exatamente assim, com hífen)
   - **Language**: TypeScript (ou Deno)
6. Cole o código completo do arquivo `supabase/functions/openai-chat/index.ts`
7. Clique em **Create** ou **Deploy**
8. Aguarde alguns segundos

**Opção B - Via CLI (Mais Rápido se já tem CLI instalado):**
```bash
# Se ainda não tem o Supabase CLI instalado:
npm install -g supabase

# Login
supabase login

# Link com seu projeto (pegue o project-ref no Dashboard → Settings → General)
supabase link --project-ref seu-project-ref-aqui

# Deploy
supabase functions deploy openai-chat
```

**Dica:** Se não souber usar CLI, use a Opção A (Dashboard) que é mais visual.

### Passo 4: Testar

1. Abra o ApexIA no navegador
2. Envie uma mensagem
3. Deve funcionar! ✅

## 📋 Verificar se Funcionou

**No Dashboard do Supabase:**
1. **Edge Functions** → **Logs** → Selecione `openai-chat`
2. Envie uma mensagem no ApexIA
3. Nos logs deve aparecer:
   ```
   ✅ API key obtida da variável de ambiente
   ✅ Usando API key de: variável de ambiente (OPENAI_API_KEY)
   Processando chat com X mensagens, modelo: gpt-4o
   ```

**Se aparecer erro:**
- ❌ `OpenAI API key não encontrada` → A variável não foi configurada corretamente
- ❌ `Erro na API da OpenAI: 401` → A chave está incorreta ou inválida
- ❌ `Function not found` → A Edge Function não foi deployada

## 🔍 Alternativa: Via SQL (se preferir usar app_secrets)

Se preferir usar a tabela `app_secrets` ao invés de variáveis de ambiente:

```sql
-- Execute no SQL Editor do Supabase (logado como superadmin)
SELECT set_encrypted_secret('OPENAI_API_KEY', 'sua-chave-openai-aqui');
```

**Importante:** Substitua `'sua-chave-openai-aqui'` pela sua chave real.

## ✅ Checklist Final

- [ ] API key da OpenAI obtida
- [ ] Variável `OPENAI_API_KEY` configurada no Dashboard
- [ ] Edge Function `openai-chat` deployada com código atualizado
- [ ] Teste enviando mensagem no ApexIA
- [ ] Verificou os logs no Dashboard

## 🆘 Ainda não funciona?

1. **Verifique os logs** no Dashboard do Supabase (Edge Functions → Logs)
2. **Verifique o console** do navegador (F12 → Console)
3. **Verifique se a variável está correta:**
   - Nome exato: `OPENAI_API_KEY` (maiúsculas)
   - Valor: deve começar com `sk-`
   - Não tem espaços extras antes/depois

---

**Tempo estimado:** 2-5 minutos
**Dificuldade:** Fácil

