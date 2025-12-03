# 🔑 Como Adicionar Seu Token do Meta

## ⚠️ IMPORTANTE: Segurança

O arquivo `ADICIONAR_SEU_TOKEN_META.sql` contém seu token secreto e foi adicionado ao `.gitignore` para não ser commitado no Git.

---

## 🎯 Método Recomendado: Via Dashboard (Mais Seguro)

### **Passo a Passo:**

1. **Acesse o Supabase Dashboard**
   - Vá em: https://supabase.com/dashboard
   - Selecione seu projeto

2. **Vá para o Vault**
   - Menu lateral → **Settings** → **Vault**

3. **Adicione o Secret**
   - Clique em **Add Secret** ou **New Secret**
   - **Name**: `META_SYSTEM_USER_ACCESS_TOKEN` (exatamente assim)
   - **Value**: Cole seu token:
     ```
     EAAQLsv8KHG4BQAVfteheZBu3Crk8UnSne6RvMZACK32qDZAVFBZCk0DVQpPIB56kP1ZA1wmIWHPmqkvsitTKxd4m0bgZBZBvak8TLSaDDMpbeDmgqNtHdnw9pAny6ntbuNmhKtcVK12vkdPmaDcNWWLrII0wWDn9IS8OExMYHaqp0KdmbRm6msrp1voXzGdgKrDSQZDZD
     ```
   - Clique em **Save** ou **Create Secret**

4. **Verifique**
   - O secret deve aparecer na lista
   - Nome deve estar exatamente: `META_SYSTEM_USER_ACCESS_TOKEN`

---

## 📝 Método Alternativo: Via SQL

Se preferir usar SQL, execute no **SQL Editor** do Supabase:

```sql
-- Primeiro, certifique-se de que a função existe
-- Execute CONFIGURAR_META_VIA_SQL.sql se ainda não executou

-- Depois, adicione o token:
SELECT set_meta_token('EAAQLsv8KHG4BQAVfteheZBu3Crk8UnSne6RvMZACK32qDZAVFBZCk0DVQpPIB56kP1ZA1wmIWHPmqkvsitTKxd4m0bgZBZBvak8TLSaDDMpbeDmgqNtHdnw9pAny6ntbuNmhKtcVK12vkdPmaDcNWWLrII0wWDn9IS8OExMYHaqp0KdmbRm6msrp1voXzGdgKrDSQZDZD');
```

**OU** execute o arquivo `ADICIONAR_SEU_TOKEN_META.sql` completo.

---

## ✅ Verificar se Funcionou

### **Via SQL:**
```sql
SELECT * FROM check_meta_token_config();
```

### **No Sistema:**
1. Recarregue a página de **Gestão de Tráfego**
2. O erro deve desaparecer
3. A aba **Meta Insights** deve estar habilitada

---

## 🔍 Se Ainda Não Funcionar

1. **Verifique se o token está no Vault:**
   - Dashboard → Settings → Vault
   - Procure por `META_SYSTEM_USER_ACCESS_TOKEN`

2. **Verifique se a Edge Function está deployada:**
   - Dashboard → Edge Functions
   - Deve existir `meta-ads-api`

3. **Teste o token diretamente:**
   - Abra o console do navegador (F12)
   - Execute:
   ```javascript
   const { data, error } = await supabase.functions.invoke('meta-ads-api', {
     body: { action: 'check-connection' }
   });
   console.log('Resultado:', data, error);
   ```

---

## 🚨 Lembrete de Segurança

- ✅ Token foi adicionado ao `.gitignore`
- ⚠️ Não compartilhe este token publicamente
- ⚠️ Se o token vazar, gere um novo no Meta Business Manager
- ⚠️ Tokens podem expirar - verifique periodicamente

---

**Após adicionar o token, a integração deve funcionar!**

