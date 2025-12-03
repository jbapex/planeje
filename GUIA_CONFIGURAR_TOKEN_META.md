# 🔑 Guia Completo: Como Configurar o Token do Meta Ads

## 📋 Resumo Rápido

O token do Meta Ads precisa ser configurado no **Supabase Vault** com o nome:
- **Nome do Secret**: `META_SYSTEM_USER_ACCESS_TOKEN`
- **Valor**: O token gerado no Meta Business Manager

---

## 🎯 Passo a Passo Completo

### **PASSO 1: Criar System User no Meta Business Manager**

1. Acesse: https://business.facebook.com/settings/
2. No menu lateral, vá em **Usuários** → **Usuários do sistema**
3. Clique em **Adicionar**
4. Dê um nome (ex: "PlanejeOnline_API")
5. Defina a função como **Admin**
6. Clique em **Criar**

---

### **PASSO 2: Atribuir Conta de Anúncio ao System User** ⚠️ CRÍTICO

**Este é o passo mais importante! Sem isso, o token não funcionará.**

1. Com o System User criado, clique em **Atribuir Ativos**
2. Na barra lateral esquerda, selecione **Contas de Anúncio**
3. Na coluna do meio, selecione a conta de anúncio que você quer gerenciar
4. Na coluna da direita, ative **Controle Total** (ou pelo menos "Gerenciar campanhas")
5. Clique em **Salvar alterações**

**⚠️ ATENÇÃO**: Se você pular este passo, receberá erro "Acesso negado" mesmo com o token correto!

---

### **PASSO 3: Gerar o Token de Acesso**

1. Com o System User selecionado, clique em **Gerar novo token**
2. Selecione o **aplicativo** que você criou no Portal de Desenvolvedores do Meta
   - Se não tem app, crie um em: https://developers.facebook.com/
3. Marque as seguintes **permissões (scopes)**:
   - ✅ `ads_read`
   - ✅ `ads_management`
   - ✅ `business_management`
   - ✅ `read_insights`
4. Clique em **Gerar Token**
5. **COPIE O TOKEN IMEDIATAMENTE** - ele não será mostrado novamente!

---

### **PASSO 4: Adicionar Token no Supabase Vault**

#### **Opção A: Via Interface do Supabase (Recomendado)**

1. Acesse seu projeto no Supabase: https://supabase.com/dashboard
2. No menu lateral, vá em **Settings** → **Vault**
3. Clique em **Add Secret** ou **New Secret**
4. Preencha:
   - **Name**: `META_SYSTEM_USER_ACCESS_TOKEN`
   - **Value**: Cole o token que você copiou no Passo 3
5. Clique em **Save** ou **Create Secret**

#### **Opção B: Via SQL (Alternativa)**

Se preferir usar SQL, execute no **SQL Editor** do Supabase:

```sql
-- Adiciona o token no Vault
SELECT vault.create_secret(
  'META_SYSTEM_USER_ACCESS_TOKEN',
  'SEU_TOKEN_AQUI'
);
```

**⚠️ IMPORTANTE**: Substitua `'SEU_TOKEN_AQUI'` pelo token real que você copiou.

---

### **PASSO 5: Verificar se Funcionou**

1. Volte para o sistema (Gestão de Tráfego)
2. A aba **Meta Insights** deve estar habilitada
3. Se ainda aparecer "Conexão inativa", verifique:
   - ✅ Token foi salvo corretamente no Vault
   - ✅ Nome do secret está exatamente: `META_SYSTEM_USER_ACCESS_TOKEN`
   - ✅ System User tem acesso à conta de anúncio (Passo 2)
   - ✅ Token tem as permissões corretas (Passo 3)

---

## 🔍 Como Verificar se o Token Está Configurado

### **No Supabase:**

1. Vá em **Settings** → **Vault**
2. Procure por `META_SYSTEM_USER_ACCESS_TOKEN`
3. Se existir, está configurado ✅
4. Se não existir, precisa adicionar ❌

### **No Sistema:**

1. Vá em **Gestão de Tráfego**
2. Se a aba **Meta Insights** estiver habilitada (não cinza), está funcionando ✅
3. Se estiver desabilitada ou mostrar "Conexão inativa", precisa configurar ❌

---

## ❌ Problemas Comuns e Soluções

### **Problema 1: "Acesso negado" ou "Permission denied"**

**Causa**: System User não tem acesso à conta de anúncio.

**Solução**: 
- Volte ao **Passo 2** e certifique-se de atribuir a conta de anúncio ao System User
- Verifique se selecionou **Controle Total** ou pelo menos "Gerenciar campanhas"

---

### **Problema 2: "Token inválido" ou "Invalid token"**

**Causa**: Token expirado ou incorreto.

**Solução**:
- Gere um novo token no Meta Business Manager (Passo 3)
- Atualize o secret no Supabase Vault com o novo token

---

### **Problema 3: "Token não encontrado"**

**Causa**: Secret não foi criado ou nome está errado.

**Solução**:
- Verifique se o nome do secret está **exatamente**: `META_SYSTEM_USER_ACCESS_TOKEN`
- É case-sensitive (maiúsculas e minúsculas importam)
- Crie o secret novamente se necessário

---

### **Problema 4: Token funciona mas não mostra dados**

**Causa**: Permissões insuficientes ou conta de anúncio não atribuída.

**Solução**:
- Verifique se todas as permissões foram marcadas no Passo 3
- Confirme que a conta de anúncio foi atribuída no Passo 2

---

## 📝 Checklist Final

Antes de considerar a configuração completa, verifique:

- [ ] System User criado no Meta Business Manager
- [ ] Conta de anúncio atribuída ao System User (com Controle Total)
- [ ] Token gerado com todas as permissões necessárias
- [ ] Token copiado e salvo
- [ ] Secret criado no Supabase Vault com nome exato: `META_SYSTEM_USER_ACCESS_TOKEN`
- [ ] Token colado corretamente no valor do secret
- [ ] Aba "Meta Insights" habilitada no sistema

---

## 🆘 Precisa de Ajuda?

Se ainda tiver problemas:

1. Verifique os logs do console do navegador (F12)
2. Verifique os logs da Edge Function no Supabase (Edge Functions → meta-ads-api → Logs)
3. Confirme que a Edge Function `meta-ads-api` está deployada
4. Verifique se o token não expirou (tokens podem expirar após alguns meses)

---

**Última atualização**: 2025-01-XX

