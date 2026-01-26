# 🧪 Teste Rápido: Ver Quais Contas Estão Aparecendo

## 🎯 Método Mais Rápido: Via Logs do Supabase

### **Passo a Passo (2 minutos):**

1. **Acesse o Supabase Dashboard**
   - https://supabase.com/dashboard
   - Selecione seu projeto

2. **Vá em Edge Functions → meta-ads-api → Logs**

3. **No seu sistema, recarregue a página de Gestão de Tráfego**
   - Isso vai disparar a busca de contas

4. **Volte aos Logs e veja:**
   - Procure por: `✅ Total unique ad accounts found: X`
   - Procure por: `📋 Account IDs: ...`
   - Isso mostra quantas e quais contas foram encontradas!

---

## 🎯 Método Alternativo: Teste no Console do Navegador

### **Passo a Passo (1 minuto):**

1. **Abra o sistema no navegador**

2. **Pressione F12** (abre o Console)

3. **Cole e execute este código:**

```javascript
// Teste rápido - busca contas
fetch('/functions/v1/meta-ads-api', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ action: 'get-ad-accounts' })
})
.then(r => r.json())
.then(data => {
  console.log('📊 Total de contas encontradas:', data.adAccounts?.length || 0);
  console.log('📋 Contas:', data.adAccounts);
  console.table(data.adAccounts?.map(acc => ({
    ID: acc.id,
    Nome: acc.name || 'Sem nome'
  })));
})
.catch(err => console.error('❌ Erro:', err));
```

4. **Veja o resultado no console!**

---

## 📊 O Que Você Vai Ver

### **Se funcionar:**
```
📊 Total de contas encontradas: 27
📋 Contas: [array com todas as contas]
```

### **Se houver problema:**
```
❌ Erro: [mensagem de erro]
```

---

## 💡 Dica

**O método mais fácil é verificar os Logs do Supabase** - você não precisa escrever código, apenas ver o que já está sendo registrado!

---

**Me diga o que apareceu nos logs ou no console!** 🚀
