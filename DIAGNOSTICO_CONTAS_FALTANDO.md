# 🔍 Diagnóstico: Contas Não Aparecem no Sistema

## 🎯 Problema

Você tem 27 contas conectadas ao aplicativo no Meta Business Manager, mas elas não aparecem todas no sistema.

---

## ✅ Passo 1: Verificar Logs da Edge Function

**Isso vai mostrar exatamente o que a API está retornando:**

1. Acesse o **Supabase Dashboard**
2. Vá em **Edge Functions** → **meta-ads-api**
3. Clique em **Logs**
4. Procure por logs recentes quando você tentou buscar contas
5. Procure por mensagens como:
   - `🔍 Fetching ad accounts...`
   - `✅ Found X ad accounts...`
   - `📋 Business IDs: ...`
   - `📋 Account IDs: ...`

**O que procurar:**
- Quantas businesses foram encontradas?
- Quantas contas foram encontradas em cada business?
- Há algum erro sendo retornado?

---

## ✅ Passo 2: Verificar Business Manager ID

**Na imagem que você mostrou, vejo "MADS Portfólio empresarial"**

1. **No Meta Business Manager:**
   - Acesse: https://business.facebook.com/settings/
   - Vá em **Informações da empresa** (ou **Business Info**)
   - Procure pelo **ID do Business Manager**
   - Copie esse ID

2. **Configure no Supabase:**
   - Vá em **Edge Functions** → **Settings** → **Secrets**
   - Adicione ou atualize: `META_BUSINESS_ID`
   - Valor: Cole o ID do Business Manager "MADS Portfólio empresarial"

**Isso força o sistema a buscar contas desse Business Manager específico.**

---

## ✅ Passo 3: Verificar se System User Tem Acesso

**As 27 entidades na imagem são businesses ou contas?**

1. **No Meta Business Manager:**
   - Com o System User "planejeapi" selecionado
   - Clique em **"Ver ativos atribuídos"** ou **"Assigned Assets"**
   - Vá na aba **"Contas de Anúncio"** ou **"Ad Accounts"**
   - **Quantas contas aparecem aqui?**

**Se aparecerem menos de 27:**
- O System User não tem acesso a todas as contas
- Você precisa atribuir as contas faltantes ao System User

**Se aparecerem 27 ou mais:**
- O problema está na busca da API
- Continue para o Passo 4

---

## ✅ Passo 4: Testar Busca Direta

**Vamos testar se a API do Meta está retornando todas as contas:**

1. **Abra o console do navegador** (F12)
2. **Vá na aba Console**
3. **Execute este código:**

```javascript
// Teste direto da API
const testAccounts = async () => {
  try {
    // Primeiro, vamos ver quais businesses o System User tem acesso
    const businessesResponse = await fetch('https://graph.facebook.com/v18.0/me?fields=businesses&access_token=SEU_TOKEN_AQUI');
    const businessesData = await businessesResponse.json();
    console.log('Businesses:', businessesData);
    
    // Depois, vamos buscar contas de cada business
    if (businessesData.businesses && businessesData.businesses.data) {
      for (const business of businessesData.businesses.data) {
        const accountsResponse = await fetch(`https://graph.facebook.com/v18.0/${business.id}/ad_accounts?fields=id,name&limit=500&access_token=SEU_TOKEN_AQUI`);
        const accountsData = await accountsResponse.json();
        console.log(`Business ${business.id} (${business.name}):`, accountsData);
      }
    }
  } catch (err) {
    console.error('Erro:', err);
  }
};

testAccounts();
```

**⚠️ IMPORTANTE:** Substitua `SEU_TOKEN_AQUI` pelo token do System User (pode pegar temporariamente do Supabase Vault para teste)

---

## ✅ Passo 5: Verificar se Há Filtro no Frontend

**Pode haver um filtro no código que está escondendo contas:**

1. **Abra o console do navegador** (F12)
2. **Vá na aba Console**
3. **Recarregue a página de Gestão de Tráfego**
4. **Procure por logs:**
   - `adAccounts` ou `ad_accounts`
   - Quantas contas foram recebidas da API?
   - Quantas contas estão sendo exibidas?

**Se receber 27 mas mostrar menos:**
- Há um filtro no frontend
- Precisamos verificar o código do componente

---

## 🆘 Soluções Rápidas

### **Solução 1: Configurar Business ID Específico**

Se você tem um Business Manager específico (MADS Portfólio empresarial):

1. **Encontre o ID do Business Manager:**
   - No Meta Business Manager, vá em **Informações da empresa**
   - O ID geralmente está no formato: `123456789012345`

2. **Configure no Supabase:**
   - Edge Functions → Settings → Secrets
   - Adicione: `META_BUSINESS_ID` = ID do Business Manager

3. **Faça deploy novamente:**
   ```bash
   supabase functions deploy meta-ads-api
   ```

### **Solução 2: Verificar Permissões do Token**

O token pode não ter permissão para ver todas as contas:

1. **Verifique as permissões do token:**
   - No Meta Business Manager, com o System User selecionado
   - Veja quais permissões o token tem
   - Certifique-se de ter: `ads_read`, `ads_management`, `business_management`

2. **Se necessário, gere um novo token:**
   - Com todas as permissões necessárias
   - Atualize no Supabase Vault

---

## 📋 Checklist de Diagnóstico

Antes de considerar resolvido:

- [ ] Verificou os logs da Edge Function?
- [ ] Quantas businesses foram encontradas?
- [ ] Quantas contas foram encontradas em cada business?
- [ ] Configurou o META_BUSINESS_ID se necessário?
- [ ] System User tem acesso a todas as 27 contas?
- [ ] Token tem todas as permissões necessárias?
- [ ] Testou a busca direta da API?

---

## 💡 Próximos Passos

**Depois de verificar os logs, me envie:**
1. Quantas businesses foram encontradas
2. Quantas contas foram encontradas em cada business
3. Se há algum erro nos logs
4. O ID do Business Manager "MADS Portfólio empresarial" (se tiver)

**Com essas informações, posso ajustar o código para buscar corretamente!**

---

**Última atualização**: 2026-01-25
