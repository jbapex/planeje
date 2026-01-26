# 🔍 Guia: Diagnosticar e Corrigir System User

## 🎯 Problema

Você já tem contas vinculadas no sistema que aparecem, mas parece que o System User não está vinculado a essas contas no Meta Business Manager.

---

## ✅ Passo 1: Verificar se o System User Existe

### No Meta Business Manager:

1. Acesse: https://business.facebook.com/settings/
2. No menu lateral, vá em **Usuários** → **Usuários do sistema**
3. Veja se existe algum System User listado

**Se NÃO existe System User:**
- Você precisa criar um primeiro
- Veja o guia: `GUIA_CONFIGURAR_TOKEN_META.md` → Passo 1

**Se JÁ existe System User:**
- Continue para o Passo 2

---

## ✅ Passo 2: Verificar Quais Contas o System User Tem Acesso

### No Meta Business Manager:

1. Com o System User selecionado, clique em **"Ver ativos atribuídos"** ou **"Assigned Assets"**
2. Vá na aba **"Contas de Anúncio"** ou **"Ad Accounts"**
3. Veja quais contas aparecem na lista

**Se a lista estiver vazia:**
- O System User não tem acesso a nenhuma conta
- Você precisa atribuir as contas (Passo 3)

**Se aparecerem algumas contas:**
- Compare com as contas que aparecem no seu sistema
- Se faltar alguma, você precisa atribuir (Passo 3)

---

## ✅ Passo 3: Atribuir Contas ao System User

### Para cada conta que aparece no sistema mas NÃO aparece na lista do System User:

1. **No Meta Business Manager:**
   - Com o System User selecionado
   - Clique em **"Atribuir Ativos"** ou **"Assign Assets"**

2. **Na barra lateral esquerda:**
   - Selecione **"Contas de Anúncio"** ou **"Ad Accounts"**

3. **Na coluna do meio:**
   - Procure pela conta que você quer adicionar
   - Você pode procurar pelo nome ou pelo ID (ex: `act_123456789`)

4. **Na coluna da direita:**
   - Ative **"Controle Total"** (ou pelo menos "Gerenciar campanhas" e "Ver relatórios")

5. **Clique em "Salvar alterações"**

6. **Repita para cada conta** que precisa ser adicionada

---

## 🔍 Passo 4: Verificar no Sistema

### Depois de atribuir as contas:

1. **Aguarde alguns segundos** (pode levar alguns segundos para propagar)

2. **No sistema:**
   - Acesse **Clientes** → Edite um cliente
   - Role até **"Contas de Anúncios Meta"**
   - Clique em **"Vincular Nova Conta"**
   - As contas atribuídas ao System User devem aparecer no dropdown

3. **Se ainda não aparecer:**
   - Recarregue a página
   - Aguarde mais alguns segundos
   - Verifique se você salvou as alterações no Meta

---

## 🆘 Problemas Comuns

### Problema: "Não consigo encontrar o System User"

**Soluções:**
- Verifique se você está em **Usuários → Usuários do sistema** (não "Parceiros")
- Se não existe, você precisa criar um primeiro
- Veja: `GUIA_CONFIGURAR_TOKEN_META.md` → Passo 1

### Problema: "System User existe mas não consigo atribuir contas"

**Soluções:**
- Verifique se você tem permissão de Admin no Business Manager
- Verifique se você é o dono das contas de anúncio
- Algumas contas podem estar em outro Business Manager

### Problema: "Atribuí as contas mas não aparecem no sistema"

**Soluções:**
1. Verifique se você clicou em **"Salvar alterações"** no Meta
2. Aguarde alguns segundos (pode levar até 1 minuto para propagar)
3. Recarregue a página do sistema
4. Tente vincular novamente
5. Verifique se o token do System User ainda está válido

### Problema: "Tenho muitas contas para atribuir"

**Soluções:**
- Você pode atribuir múltiplas contas de uma vez:
  1. Selecione o System User
  2. Clique em "Atribuir Ativos"
  3. Selecione "Contas de Anúncio"
  4. Selecione **múltiplas contas** na coluna do meio (mantenha Ctrl/Cmd pressionado)
  5. Ative "Controle Total" na coluna da direita
  6. Clique em "Salvar alterações"

---

## 📝 Checklist de Verificação

Antes de considerar resolvido:

- [ ] System User existe no Meta Business Manager
- [ ] System User tem acesso a todas as contas que aparecem no sistema
- [ ] Contas foram atribuídas com "Controle Total" ou pelo menos "Gerenciar campanhas"
- [ ] Alterações foram salvas no Meta Business Manager
- [ ] Contas aparecem no dropdown ao vincular no sistema ✅

---

## 💡 Dica Importante

**O System User precisa ter acesso às contas no Meta Business Manager para que:**
- ✅ As contas apareçam quando você busca contas disponíveis
- ✅ O sistema consiga buscar dados das contas via API
- ✅ Você consiga vincular as contas aos clientes

**Sem isso, mesmo que as contas estejam cadastradas no sistema, você não conseguirá:**
- ❌ Ver dados atualizados
- ❌ Buscar novas informações
- ❌ Vincular novas contas

---

**Última atualização**: 2026-01-25
