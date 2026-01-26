# 🔗 Guia: Vincular Nova Conta de Anúncio do Meta

## ✅ Resposta Rápida

**É apenas ajuste externo no Meta!** Não precisa mexer no sistema. 

O sistema busca automaticamente todas as contas que o System User tem acesso.

---

## 🎯 Passo a Passo

### **0. Verificar se System User Existe (IMPORTANTE!)**

**Primeiro, verifique se você tem um System User:**

1. Acesse: https://business.facebook.com/settings/
2. Vá em **Usuários → Usuários do sistema**
3. Veja se existe algum System User listado

**Se NÃO existe:**
- Você precisa criar um primeiro
- Veja: `GUIA_CONFIGURAR_TOKEN_META.md` → Passo 1
- Depois volte aqui e continue

**Se JÁ existe:**
- Continue para o Passo 1 abaixo

---

### **1. No Meta Business Manager (Ajuste Externo)**

Para que sua nova conta de anúncio apareça no sistema, você precisa dar acesso ao **System User**:

1. **Acesse o Meta Business Manager**
   - https://business.facebook.com/settings/

2. **Vá em Usuários → Usuários do sistema**
   - No menu lateral esquerdo

3. **Selecione o System User** que você criou anteriormente
   - (O mesmo que gerou o token `META_SYSTEM_USER_ACCESS_TOKEN`)
   - ⚠️ **Se você não tem System User, precisa criar um primeiro!**

4. **Clique em "Atribuir Ativos"** (ou "Assign Assets")

5. **Selecione "Contas de Anúncio"** na barra lateral esquerda

6. **Encontre sua nova conta de anúncio** na lista do meio
   - Procure pelo nome ou ID da conta (ex: `act_123456789`)

7. **Na coluna da direita, ative "Controle Total"**
   - Ou pelo menos "Gerenciar campanhas" e "Ver relatórios"

8. **Clique em "Salvar alterações"**

### **💡 Dica: Verificar Contas Existentes**

**Se você já tem contas vinculadas no sistema mas elas não aparecem:**
1. Com o System User selecionado, clique em **"Ver ativos atribuídos"**
2. Veja quais contas aparecem na lista
3. Compare com as contas que aparecem no seu sistema
4. **Atribua as contas que estão faltando** (siga os passos acima)

---

### **2. No Sistema (Automático - Não Precisa Fazer Nada!)**

Depois de atribuir a conta ao System User no Meta:

1. **A conta aparecerá automaticamente** quando você:
   - Abrir o formulário de um cliente
   - Clicar em "Vincular Nova Conta"
   - O sistema busca todas as contas disponíveis automaticamente

2. **Se a conta não aparecer:**
   - Aguarde alguns segundos e clique em "Vincular" novamente
   - O sistema recarrega as contas disponíveis automaticamente
   - Verifique se você salvou as alterações no Meta Business Manager

---

## 🔍 Como Verificar se Funcionou

### **No Meta Business Manager:**
1. Vá em **Usuários → Usuários do sistema**
2. Selecione seu System User
3. Clique em **"Ver ativos atribuídos"**
4. Verifique se sua nova conta aparece na lista de **Contas de Anúncio**

### **No Sistema:**
1. Acesse **Clientes** no menu
2. Abra um cliente para editar
3. Role até **"Contas de Anúncios Meta"**
4. Clique no dropdown **"Selecione uma conta"**
5. Sua nova conta deve aparecer na lista! ✅

---

## ❓ Perguntas Frequentes

### **P: Preciso mexer no código do sistema?**
**R:** Não! É apenas configuração no Meta Business Manager.

### **P: Preciso gerar um novo token?**
**R:** Não! O token do System User continua o mesmo. Só precisa atribuir a nova conta ao System User.

### **P: A conta aparece imediatamente?**
**R:** Sim! Assim que você atribuir a conta ao System User no Meta, ela aparecerá na próxima vez que o sistema buscar as contas disponíveis.

### **P: Posso vincular a mesma conta a vários clientes?**
**R:** Sim! Uma conta do Meta pode ser vinculada a múltiplos clientes no sistema.

### **P: E se eu criar um novo app no Meta?**
**R:** Se você criou um novo app, precisa:
1. Gerar um novo token usando esse app (no System User)
2. Atualizar o token no Supabase Vault
3. Atribuir as contas de anúncio ao System User

---

## 📝 Checklist

Antes de considerar concluído:

- [ ] Nova conta de anúncio criada no Meta
- [ ] System User tem acesso à nova conta (atribuído no Business Manager)
- [ ] Permissões configuradas (Controle Total ou pelo menos "Gerenciar campanhas")
- [ ] Alterações salvas no Meta Business Manager
- [ ] Conta aparece no dropdown ao vincular no sistema ✅

---

## 🆘 Problemas Comuns

### **Problema: Conta não aparece no sistema**

**Soluções:**
1. Verifique se a conta foi atribuída ao System User no Meta Business Manager
2. Verifique se você clicou em "Salvar alterações" no Meta
3. Aguarde alguns segundos e tente novamente (pode levar alguns segundos para propagar)
4. Recarregue a página do sistema e tente vincular novamente

### **Problema: Erro "Acesso negado" ao buscar contas**

**Soluções:**
1. Verifique se o System User tem "Controle Total" na conta
2. Verifique se o token ainda está válido (não expirou)
3. Verifique se o token tem as permissões corretas (`ads_read`, `ads_management`, `business_management`)

---

## 💡 Dica Importante

**Uma vez que você atribuiu a conta ao System User no Meta, o sistema automaticamente:**
- ✅ Busca a conta quando você vai vincular
- ✅ Mostra a conta no dropdown
- ✅ Permite vincular a conta ao cliente
- ✅ Busca dados da conta automaticamente

**Não precisa fazer mais nada no sistema!** 🎉

---

**Última atualização**: 2026-01-25
