# 🧪 Como Testar a Edge Function WhatsApp

## 📋 Checklist Antes de Testar

- [ ] Evolution API rodando na VPS
- [ ] WhatsApp conectado (status = "open")
- [ ] Secrets configurados no Supabase
- [ ] Edge Function criada e deployada

---

## 🚀 Passo 1: Fazer Deploy da Edge Function

### **Opção A: Via CLI (Recomendado)**

```bash
# No diretório do projeto
supabase functions deploy whatsapp-notification
```

### **Opção B: Via Dashboard**

1. Acesse **Supabase Dashboard**
2. Vá em **Edge Functions**
3. Clique em **Create a new function**
4. Nome: `whatsapp-notification`
5. Cole o código do `index.ts`
6. Clique em **Deploy**

---

## ✅ Passo 2: Testar Edge Function

### **2.1. Obter Credenciais**

**Você precisa de:**
- **Project URL:** `https://seu-projeto.supabase.co`
- **Anon Key:** Chave anônima do Supabase

**Onde encontrar:**
1. Supabase Dashboard
2. **Project Settings > API**
3. Copiar **Project URL** e **anon public** key

---

### **2.2. Testar via cURL**

```bash
curl -X POST https://SEU_PROJETO.supabase.co/functions/v1/whatsapp-notification \
  -H "Authorization: Bearer SEU_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "5511999999999",
    "message": "✅ Teste via Supabase Edge Function!"
  }'
```

**Substitua:**
- `SEU_PROJETO` pelo ID do seu projeto Supabase
- `SEU_ANON_KEY` pela chave anônima
- `5511999999999` pelo seu número de teste

---

### **2.3. Testar via JavaScript (Frontend)**

```javascript
const { data, error } = await supabase.functions.invoke('whatsapp-notification', {
  body: {
    phone: '5511999999999',
    message: '✅ Teste via Supabase Edge Function!'
  }
});

if (error) {
  console.error('Erro:', error);
} else {
  console.log('Sucesso:', data);
}
```

---

### **2.4. Testar via Postman/Insomnia**

**URL:**
```
POST https://SEU_PROJETO.supabase.co/functions/v1/whatsapp-notification
```

**Headers:**
```
Authorization: Bearer SEU_ANON_KEY
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "phone": "5511999999999",
  "message": "✅ Teste via Supabase Edge Function!"
}
```

---

## 🔍 Verificar Logs

### **Via Dashboard:**

1. Vá em **Edge Functions > whatsapp-notification**
2. Clique em **Logs**
3. Veja os logs em tempo real

### **Via CLI:**

```bash
supabase functions logs whatsapp-notification
```

---

## ✅ Respostas Esperadas

### **Sucesso:**

```json
{
  "success": true,
  "messageId": "3EB0C767F26AEC1B",
  "data": {
    "key": {
      "id": "3EB0C767F26AEC1B",
      "remoteJid": "5511999999999@s.whatsapp.net"
    },
    "message": {
      "conversation": "✅ Teste via Supabase Edge Function!"
    },
    "messageTimestamp": 1234567890,
    "status": "PENDING"
  }
}
```

### **Erro - Secrets não configurados:**

```json
{
  "error": "EVOLUTION_API_URL ou EVOLUTION_API_KEY não configuradas",
  "details": "Verifique se os secrets foram configurados corretamente no Supabase"
}
```

### **Erro - Número inválido:**

```json
{
  "error": "Número de telefone inválido. Use formato: código do país + DDD + número (ex: 5511999999999)"
}
```

### **Erro - Evolution API offline:**

```json
{
  "error": "Erro ao enviar mensagem",
  "details": "Verifique os logs da Edge Function para mais detalhes"
}
```

---

## 🐛 Troubleshooting

### **Problema: "Function not found"**

**Causa:** Edge Function não foi deployada.

**Solução:**
```bash
supabase functions deploy whatsapp-notification
```

---

### **Problema: "Unauthorized"**

**Causa:** Anon Key incorreta ou não está no header.

**Solução:**
- Verificar se está usando a chave correta
- Verificar se o header `Authorization` está correto

---

### **Problema: "EVOLUTION_API_URL não configurada"**

**Causa:** Secrets não foram configurados.

**Solução:**
1. Verificar se secrets foram criados
2. Verificar nomes: `EVOLUTION_API_URL` e `EVOLUTION_API_KEY`
3. Verificar valores (sem espaços extras)

---

### **Problema: "Connection refused"**

**Causa:** Evolution API não está acessível.

**Solução:**
1. Verificar se Evolution API está rodando na VPS
2. Verificar se porta 8080 está aberta
3. Verificar se IP da VPS está correto no secret
4. Testar acesso direto: `curl http://SEU_IP_VPS:8080`

---

### **Problema: "Invalid API Key"**

**Causa:** Chave API do Evolution API está incorreta.

**Solução:**
1. Verificar chave no `docker-compose.yml` da VPS
2. Verificar chave no secret `EVOLUTION_API_KEY` do Supabase
3. Garantir que são iguais

---

### **Problema: Mensagem não chega**

**Verificar:**
1. WhatsApp está conectado? (status = "open")
2. Número está no formato correto? (5511999999999)
3. Ver logs do Evolution API na VPS
4. Ver logs da Edge Function no Supabase

---

## 📊 Verificar Status do Evolution API

```bash
# Na VPS
curl http://localhost:8080/instance/fetchInstances \
  -H "apikey: SUA_CHAVE_SECRETA"
```

**Deve retornar:**
```json
{
  "instance": {
    "instanceName": "jbapex-instance",
    "status": "open"
  }
}
```

**Status `open` = Conectado! ✅**

---

## ✅ Checklist de Teste

- [ ] Edge Function deployada
- [ ] Teste via cURL funcionando
- [ ] Resposta de sucesso recebida
- [ ] Mensagem chegou no WhatsApp
- [ ] Logs sem erros

---

## 🎯 Próximos Passos

Após testar com sucesso:

1. ✅ **Criar triggers no banco** (notificações automáticas)
2. ✅ **Criar interface de configuração** (usuários cadastrarem número)
3. ✅ **Implementar notificações por status** (Kanban)

---

**🎉 Se o teste funcionou, você está pronto para integrar com o sistema!**

