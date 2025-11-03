# 📸 Guia Visual - Deploy da Edge Function no Supabase Dashboard

## 🎯 Objetivo
Atualizar a Edge Function `openai-chat` com o código novo que busca a API key corretamente.

---

## 📋 Passo 1: Abrir o Dashboard

1. Acesse: **https://supabase.com/dashboard**
2. Faça login se necessário
3. Selecione seu projeto na lista

---

## 📋 Passo 2: Encontrar Edge Functions

**No menu lateral esquerdo:**
- Procure por **"Edge Functions"** ou **"Functions"**
- Clique nele

**Você verá:**
- Uma lista de funções existentes
- OU uma tela dizendo "No functions yet"

---

## 📋 Passo 3A: Se a função `openai-chat` JÁ EXISTE

### 3A.1 - Localizar a função
- Na lista de funções, procure por `openai-chat`
- Clique no nome ou no ícone de edição

### 3A.2 - Editar o código
- Você verá uma tela com o código atual
- Procure por botões como:
  - **"Edit"**
  - **"Deploy"**
  - **"Update"**
  - Ou um ícone de lápis ✏️

### 3A.3 - Substituir o código

**Método 1 - Copiar do arquivo local:**
1. Abra o arquivo: `supabase/functions/openai-chat/index.ts`
2. Selecione TODO o conteúdo (Ctrl+A ou Cmd+A)
3. Copie (Ctrl+C ou Cmd+C)
4. Volte ao Dashboard
5. **Selecione TODO o código antigo** na tela
6. Delete e cole o novo código (Ctrl+V ou Cmd+V)

**Método 2 - Abrir arquivo no VS Code/Editor:**
1. No seu editor, abra: `supabase/functions/openai-chat/index.ts`
2. Copie todo o conteúdo
3. Cole no Dashboard substituindo o código antigo

### 3A.4 - Salvar/Deploy
- Clique em **"Save"**, **"Deploy"**, **"Update"** ou **"Publish"**
- Aguarde aparecer uma mensagem de sucesso (pode levar alguns segundos)

---

## 📋 Passo 3B: Se a função `openai-chat` NÃO EXISTE

### 3B.1 - Criar nova função
- Clique no botão **"Create Function"** ou **"New Function"**
- Geralmente fica no topo direito da tela

### 3B.2 - Preencher dados
- **Function name**: Digite exatamente `openai-chat` (com hífen, tudo minúsculo)
- **Language**: Selecione **TypeScript** ou **Deno**

### 3B.3 - Colar o código
1. Abra o arquivo: `supabase/functions/openai-chat/index.ts`
2. Copie TODO o conteúdo
3. Cole na área de código do Dashboard

### 3B.4 - Criar
- Clique em **"Create"**, **"Deploy"** ou **"Save"**
- Aguarde a criação (pode levar alguns segundos)

---

## 📋 Passo 4: Verificar se Funcionou

### 4.1 - Verificar na lista
- Volte para a lista de Edge Functions
- Você deve ver `openai-chat` listada
- Deve mostrar status **"Active"** ou **"Deployed"**

### 4.2 - Testar
1. Abra o ApexIA no navegador
2. Envie uma mensagem
3. Deve funcionar! ✅

### 4.3 - Ver logs (se quiser)
- Na tela da função `openai-chat`
- Procure por **"Logs"** ou **"View Logs"**
- Envie uma mensagem no ApexIA
- Você deve ver logs aparecendo em tempo real

---

## 🆘 Problemas Comuns

### "Function name already exists"
- A função já existe! Siga o Passo 3A ao invés de 3B

### "Cannot find file"
- Certifique-se de que o arquivo `supabase/functions/openai-chat/index.ts` existe
- Se não existir, crie a pasta e o arquivo

### "Deploy failed"
- Verifique se o código está completo (copiou tudo?)
- Veja se há erros de sintaxe no Dashboard
- Tente copiar e colar novamente

### Não encontra "Edge Functions" no menu
- Procure por **"Functions"** ao invés de "Edge Functions"
- Ou verifique se está na versão correta do Supabase (pode estar em beta)

---

## 💡 Dica Extra

**Para ter certeza que o código está certo:**
1. Abra o arquivo `supabase/functions/openai-chat/index.ts` no seu editor
2. Verifique se tem aproximadamente 180 linhas
3. A primeira linha deve ser: `// Edge Function para ApexIA - Chat Público com OpenAI`
4. Se tiver menos linhas ou estiver diferente, algo está errado

---

## ✅ Checklist Final

- [ ] Acessei o Dashboard do Supabase
- [ ] Encontrei Edge Functions no menu
- [ ] Localizei ou criei a função `openai-chat`
- [ ] Copiei o código completo de `index.ts`
- [ ] Colei substituindo o código antigo
- [ ] Cliquei em Save/Deploy
- [ ] Vi mensagem de sucesso
- [ ] Testei no ApexIA

---

**Tempo estimado:** 3-5 minutos
**Dificuldade:** Fácil (só copiar e colar!)

