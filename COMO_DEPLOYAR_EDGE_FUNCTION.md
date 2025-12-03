# 🚀 Como Deployar a Edge Function meta-ads-api

## ⚠️ PROBLEMA IDENTIFICADO

O erro "Conexão com Meta Ads inativa" acontece porque a **Edge Function `meta-ads-api` não está deployada** no Supabase.

A Edge Function foi criada no código, mas precisa ser enviada para o Supabase.

---

## 📋 Opção 1: Deploy via Supabase Dashboard (Mais Fácil)

### **Passo 1: Acessar o Supabase Dashboard**
1. Vá em: https://supabase.com/dashboard
2. Selecione seu projeto

### **Passo 2: Criar a Edge Function**
1. No menu lateral, vá em **Edge Functions**
2. Clique em **Create a new function**
3. Nome: `meta-ads-api`
4. Cole o código do arquivo `supabase/functions/meta-ads-api/index.ts`

### **Passo 3: Configurar Secrets**
1. Vá em **Edge Functions** → **Settings** → **Secrets**
2. Adicione:
   - `SUPABASE_URL`: Sua URL do Supabase (encontrada em Settings → API)
   - `SUPABASE_SERVICE_ROLE_KEY`: Service Role Key (encontrada em Settings → API)

### **Passo 4: Deploy**
1. Clique em **Deploy** ou **Save**

---

## 📋 Opção 2: Deploy via CLI (Recomendado)

### **Passo 1: Instalar Supabase CLI**

```bash
# macOS
brew install supabase/tap/supabase

# Ou via npm
npm install -g supabase
```

### **Passo 2: Login no Supabase**

```bash
supabase login
```

### **Passo 3: Linkar ao Projeto**

```bash
# Vá para a pasta do projeto
cd /Users/josiasbonfimdefaria/Downloads/planeje

# Linkar ao projeto (você precisará do Project Reference ID)
supabase link --project-ref seu-project-ref-aqui
```

**Onde encontrar o Project Reference ID:**
- Supabase Dashboard → Settings → General → Reference ID

### **Passo 4: Deploy da Função**

```bash
supabase functions deploy meta-ads-api
```

### **Passo 5: Configurar Secrets**

```bash
# Configurar SUPABASE_URL
supabase secrets set SUPABASE_URL="sua-url-aqui"

# Configurar SUPABASE_SERVICE_ROLE_KEY
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="sua-service-role-key-aqui"
```

**OU** configure via Dashboard:
- Edge Functions → Settings → Secrets

---

## ✅ Verificar se Funcionou

### **1. No Supabase Dashboard:**
- Vá em **Edge Functions**
- Deve aparecer `meta-ads-api` na lista
- Status deve ser "Active"

### **2. No Sistema:**
- Recarregue a página de Gestão de Tráfego
- A aba "Meta Insights" deve estar habilitada
- O erro deve desaparecer

### **3. Testar Diretamente:**
Abra o console do navegador (F12) e execute:

```javascript
const { data, error } = await supabase.functions.invoke('meta-ads-api', {
  body: { action: 'check-connection' }
});
console.log('Resultado:', data, error);
```

---

## 🔍 Se Ainda Não Funcionar

### **Verificar Logs:**
1. Supabase Dashboard → Edge Functions → `meta-ads-api`
2. Clique em **Logs**
3. Veja os erros recentes

### **Verificar Token:**
1. Supabase Dashboard → Settings → Vault
2. Confirme que `META_SYSTEM_USER_ACCESS_TOKEN` existe
3. Verifique se o valor está correto

### **Verificar Permissões:**
1. Meta Business Manager → System Users
2. Confirme que o System User tem acesso à conta de anúncio

---

## 📝 Checklist Final

Antes de considerar completo:

- [ ] Edge Function `meta-ads-api` existe no Supabase Dashboard
- [ ] Status da função é "Active"
- [ ] Secrets configurados (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
- [ ] Token `META_SYSTEM_USER_ACCESS_TOKEN` está no Vault
- [ ] System User tem acesso à conta de anúncio
- [ ] Teste direto no console retorna `connected: true`

---

**O problema mais provável é que a Edge Function não está deployada ainda!**

