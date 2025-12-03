# 🔍 Diagnóstico: Token Meta Ads Não Funciona

## ✅ Checklist de Verificação

### 1. **Edge Function Existe?**
- [ ] A Edge Function `meta-ads-api` está deployada no Supabase?
- [ ] Verifique em: Supabase Dashboard → Edge Functions → `meta-ads-api`

**Se NÃO existe:**
- A Edge Function precisa ser criada e deployada
- Veja instruções em: `supabase/functions/meta-ads-api/README.md`

---

### 2. **Token Está no Vault?**
- [ ] Vá em Supabase Dashboard → Settings → Vault
- [ ] Procure por `META_SYSTEM_USER_ACCESS_TOKEN`
- [ ] Verifique se o nome está **exatamente** assim (case-sensitive)

**Se NÃO existe:**
- Adicione o secret com o nome exato: `META_SYSTEM_USER_ACCESS_TOKEN`
- Valor: Cole o token do System User

---

### 3. **Token Está Correto?**
- [ ] Token foi gerado no Meta Business Manager?
- [ ] Token tem as permissões: `ads_read`, `ads_management`, `business_management`, `read_insights`?
- [ ] Token não expirou?

**Para verificar:**
- Gere um novo token se necessário
- Atualize no Vault

---

### 4. **System User Tem Acesso?**
- [ ] System User foi atribuído à conta de anúncio?
- [ ] Tem permissão de "Controle Total" ou "Gerenciar campanhas"?

**Este é o erro mais comum!** Mesmo com token correto, se o System User não tiver acesso à conta, não funcionará.

---

### 5. **Edge Function Tem Permissões?**
- [ ] Edge Function tem acesso ao Vault?
- [ ] Service Role Key está configurada?

**Verificar:**
- Supabase Dashboard → Edge Functions → Settings → Secrets
- Deve ter: `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`

---

## 🔧 Como Verificar o Erro Real

### **Opção 1: Console do Navegador**
1. Abra o DevTools (F12)
2. Vá na aba **Console**
3. Recarregue a página de Gestão de Tráfego
4. Procure por erros relacionados a `meta-ads-api`

### **Opção 2: Logs da Edge Function**
1. Supabase Dashboard → Edge Functions → `meta-ads-api`
2. Clique em **Logs**
3. Veja os erros recentes

### **Opção 3: Testar Diretamente**
Execute no console do navegador (F12):

```javascript
const { data, error } = await supabase.functions.invoke('meta-ads-api', {
  body: { action: 'check-connection' }
});
console.log('Data:', data);
console.log('Error:', error);
```

---

## 🎯 Soluções por Tipo de Erro

### **Erro: "Function not found" ou "404"**
**Causa**: Edge Function não está deployada

**Solução**:
1. Crie a Edge Function (já criada em `supabase/functions/meta-ads-api/`)
2. Faça deploy:
   ```bash
   supabase functions deploy meta-ads-api
   ```

---

### **Erro: "TOKEN_NOT_FOUND"**
**Causa**: Token não está no Vault ou nome está errado

**Solução**:
1. Vá em Supabase → Settings → Vault
2. Verifique se existe `META_SYSTEM_USER_ACCESS_TOKEN`
3. Se não existe, crie com o nome exato
4. Se existe, verifique se o valor está correto

---

### **Erro: "Invalid token" ou "Invalid OAuth access token"**
**Causa**: Token inválido ou expirado

**Solução**:
1. Gere um novo token no Meta Business Manager
2. Atualize no Vault

---

### **Erro: "Permission denied" ou "Access denied"**
**Causa**: System User não tem acesso à conta de anúncio

**Solução**:
1. Meta Business Manager → System Users
2. Selecione o System User
3. Clique em "Atribuir Ativos"
4. Atribua a conta de anúncio com "Controle Total"

---

### **Erro: "Function execution failed"**
**Causa**: Erro interno na Edge Function

**Solução**:
1. Verifique os logs da Edge Function
2. Verifique se as variáveis de ambiente estão configuradas
3. Verifique se a função RPC `get_encrypted_secret` existe

---

## 🚀 Próximos Passos

1. **Verifique se a Edge Function existe** (mais provável que seja isso)
2. **Se não existe, faça o deploy** usando as instruções acima
3. **Teste novamente** após o deploy

---

**Se ainda não funcionar após seguir todos os passos, me envie:**
- Erro exato do console (F12)
- Logs da Edge Function
- Screenshot do Vault mostrando o secret

