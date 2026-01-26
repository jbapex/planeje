# 🚀 Guia Passo a Passo - Deploy da Edge Function meta-ads-api

## 📋 Opção 1: Via CLI (Recomendado - Mais Rápido)

### Pré-requisitos
- Supabase CLI instalado (já está instalado ✅)
- Login no Supabase feito
- Projeto linkado

### Passo 1: Verificar Login
```bash
cd /Users/josiasbonfimdefaria/Downloads/planeje
supabase login
```
Se já estiver logado, pule para o próximo passo.

### Passo 2: Verificar/Linkar Projeto
```bash
# Verificar se projeto está linkado
supabase projects list

# Se não estiver linkado, você precisa do Project Reference ID
# Encontre em: Supabase Dashboard → Settings → General → Reference ID
supabase link --project-ref SEU_PROJECT_REF_AQUI
```

### Passo 3: Fazer Deploy
```bash
# Deploy da função
supabase functions deploy meta-ads-api
```

### Passo 4: Configurar Secrets (Se necessário)
```bash
# Adicionar token do Meta (se ainda não tiver)
supabase secrets set META_SYSTEM_USER_ACCESS_TOKEN=seu-token-aqui
```

---

## 📋 Opção 2: Via Dashboard do Supabase (Interface Web)

### Passo 1: Acessar o Dashboard
1. Acesse: **https://supabase.com/dashboard**
2. Faça login se necessário
3. Selecione seu projeto na lista

### Passo 2: Navegar até Edge Functions
1. No menu lateral esquerdo, procure por **"Edge Functions"** ou **"Functions"**
2. Clique nele

### Passo 3A: Se a função `meta-ads-api` JÁ EXISTE

#### 3A.1 - Localizar a função
- Na lista de funções, procure por `meta-ads-api`
- Clique no nome da função

#### 3A.2 - Editar o código
- Você verá uma tela com o código atual
- Procure por um botão **"Edit"** ou **"Deploy"** ou um ícone de lápis ✏️
- Clique para editar

#### 3A.3 - Substituir o código
1. Abra o arquivo local: `supabase/functions/meta-ads-api/index.ts`
2. Selecione TODO o conteúdo (Ctrl+A ou Cmd+A)
3. Copie (Ctrl+C ou Cmd+C)
4. Volte ao Dashboard
5. Selecione TODO o código antigo na tela
6. Delete e cole o novo código (Ctrl+V ou Cmd+V)
7. Clique em **"Deploy"** ou **"Save"**

### Passo 3B: Se a função `meta-ads-api` NÃO EXISTE

#### 3B.1 - Criar nova função
- Clique no botão **"New Function"** ou **"Create Function"**
- Nome: `meta-ads-api`
- Runtime: `Deno`

#### 3B.2 - Adicionar código
1. Abra o arquivo local: `supabase/functions/meta-ads-api/index.ts`
2. Selecione TODO o conteúdo (Ctrl+A ou Cmd+A)
3. Copie (Ctrl+C ou Cmd+C)
4. Cole no editor do Dashboard (Ctrl+V ou Cmd+V)
5. Clique em **"Deploy"** ou **"Save"**

### Passo 4: Configurar Secrets (Variáveis de Ambiente)

1. No menu da função `meta-ads-api`, procure por **"Settings"** ou **"Secrets"**
2. Clique em **"Add Secret"** ou **"Manage Secrets"**
3. Adicione as seguintes variáveis:

   **Obrigatórias:**
   - `META_SYSTEM_USER_ACCESS_TOKEN` = seu token do Meta Business
   - `SUPABASE_URL` = URL do seu projeto (geralmente já está configurado)
   - `SUPABASE_SERVICE_ROLE_KEY` = Service Role Key (geralmente já está configurado)

   **Opcionais:**
   - `META_BUSINESS_ID` = ID do Business Manager (se quiser usar um específico)

4. Clique em **"Save"** ou **"Update"**

---

## ✅ Verificação Pós-Deploy

### Testar a função
1. No Dashboard, vá em **Edge Functions** → `meta-ads-api`
2. Procure por uma aba **"Invoke"** ou **"Test"**
3. Teste com este JSON:
```json
{
  "action": "check-connection"
}
```
4. Deve retornar:
```json
{
  "connected": true,
  "user": { ... }
}
```

### Verificar Logs
1. No Dashboard, vá em **Edge Functions** → `meta-ads-api`
2. Clique em **"Logs"** ou **"View Logs"**
3. Verifique se há erros

---

## 🔧 Solução de Problemas

### Erro: "Function not found"
- Certifique-se de que o nome da função está correto: `meta-ads-api`
- Verifique se o deploy foi concluído com sucesso

### Erro: "Token not found"
- Verifique se o secret `META_SYSTEM_USER_ACCESS_TOKEN` está configurado
- Verifique se o nome do secret está exatamente como mostrado (case-sensitive)

### Erro: "Permission denied"
- Verifique se o System User tem as permissões necessárias no Meta Business Manager
- Permissões necessárias:
  - `pages_read_engagement`
  - `pages_read_user_content`
  - `pages_manage_posts`
  - `instagram_basic`
  - `instagram_manage_insights`

### Erro: "Non-2xx status code"
- Isso foi corrigido no código! Certifique-se de que fez o deploy da versão mais recente
- Verifique os logs da função para ver o erro específico

---

## 📝 Script Automatizado

Se preferir usar o script automatizado:

```bash
cd /Users/josiasbonfimdefaria/Downloads/planeje
chmod +x deploy-meta-ads-api.sh
./deploy-meta-ads-api.sh
```

O script vai:
1. Verificar se está no diretório correto
2. Verificar se o Supabase CLI está instalado
3. Verificar login
4. Linkar projeto (se necessário)
5. Fazer o deploy automaticamente

---

## 🎯 Próximos Passos Após Deploy

1. ✅ Deploy concluído
2. ✅ Secrets configurados
3. 🔄 Recarregue a página "Redes Sociais" no sistema
4. 🔄 Clique na aba "Meta Business"
5. ✅ Deve funcionar sem erros!

---

## 📞 Precisa de Ajuda?

Se encontrar problemas:
1. Verifique os logs da Edge Function no Dashboard
2. Verifique o console do navegador (F12)
3. Verifique se o token do Meta está válido e não expirou
