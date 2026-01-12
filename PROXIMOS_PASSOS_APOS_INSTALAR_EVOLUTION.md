# ✅ Próximos Passos Após Instalar Evolution API

## 🎯 Checklist Rápido

- [ ] Evolution API instalado e rodando
- [ ] WhatsApp conectado via QR Code
- [ ] Teste de envio funcionando
- [ ] Configurado no Supabase (secrets)
- [ ] Edge Function criada
- [ ] Integração testada

---

## 📋 Passo 1: Verificar se Está Funcionando

### **1.1. Verificar se Container Está Rodando**

```bash
# Na sua VPS
docker ps | grep evolution
```

**Você deve ver algo como:**
```
CONTAINER ID   IMAGE                          STATUS
abc123def456   atendai/evolution-api:latest   Up 2 minutes
```

### **1.2. Testar API**

```bash
# Na sua VPS
curl http://localhost:8080

# Ou do seu computador
curl http://SEU_IP_VPS:8080
```

**Se funcionar, você verá uma resposta JSON.**

---

## 📱 Passo 2: Conectar WhatsApp

### **2.1. Criar Instância**

**Opção A: Via Interface Web (Mais Fácil)**

1. Abra no navegador: `http://SEU_IP_VPS:8080`
2. Você verá a interface do Evolution API
3. Crie uma instância chamada `jbapex-instance`
4. Escaneie o QR Code com seu WhatsApp

**Opção B: Via API (Mais Técnico)**

```bash
# Na sua VPS ou do seu computador
curl -X POST http://SEU_IP_VPS:8080/instance/create \
  -H "apikey: SUA_CHAVE_SECRETA" \
  -H "Content-Type: application/json" \
  -d '{
    "instanceName": "jbapex-instance",
    "token": "token-opcional",
    "qrcode": true,
    "integration": "WHATSAPP-BAILEYS"
  }'
```

**Substitua:**
- `SEU_IP_VPS` pelo IP da sua VPS
- `SUA_CHAVE_SECRETA` pela chave que você configurou no docker-compose.yml

### **2.2. Obter QR Code**

```bash
# Obter QR Code
curl http://SEU_IP_VPS:8080/instance/connect/jbapex-instance \
  -H "apikey: SUA_CHAVE_SECRETA"
```

**Ou acesse via navegador:**
```
http://SEU_IP_VPS:8080/instance/connect/jbapex-instance?apikey=SUA_CHAVE_SECRETA
```

### **2.3. Escanear QR Code**

1. Abra WhatsApp no celular
2. Vá em **Configurações > Aparelhos conectados**
3. Toque em **Conectar um aparelho**
4. Escaneie o QR Code exibido

### **2.4. Verificar Status da Conexão**

```bash
# Verificar instâncias
curl http://SEU_IP_VPS:8080/instance/fetchInstances \
  -H "apikey: SUA_CHAVE_SECRETA"
```

**Você deve ver algo como:**
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

## 🧪 Passo 3: Testar Envio de Mensagem

### **3.1. Enviar Mensagem de Teste**

```bash
curl -X POST http://SEU_IP_VPS:8080/message/sendText/jbapex-instance \
  -H "apikey: SUA_CHAVE_SECRETA" \
  -H "Content-Type: application/json" \
  -d '{
    "number": "5511999999999",
    "text": "✅ Teste do Evolution API funcionando!"
  }'
```

**Formato do número:**
- Sempre com código do país (55 para Brasil)
- Sem DDD com 0 (ex: 11, não 011)
- Sem caracteres especiais
- Exemplo: `5511999999999` (11 = DDD, 999999999 = número)

**Se funcionar, você receberá a mensagem no WhatsApp! ✅**

---

## 🔗 Passo 4: Configurar no Supabase

### **4.1. Adicionar Secrets**

**Via Dashboard (Mais Fácil):**

1. Acesse **Supabase Dashboard**
2. Vá em **Project Settings > Edge Functions > Secrets**
3. Clique em **Add new secret**
4. Adicione:

   **Secret 1:**
   - **Name:** `EVOLUTION_API_URL`
   - **Value:** `http://SEU_IP_VPS:8080`
   - Clique em **Save**

   **Secret 2:**
   - **Name:** `EVOLUTION_API_KEY`
   - **Value:** `SUA_CHAVE_SECRETA` (a mesma do docker-compose.yml)
   - Clique em **Save**

**Via CLI:**

```bash
# No seu computador (onde tem Supabase CLI instalado)
supabase secrets set EVOLUTION_API_URL=http://SEU_IP_VPS:8080
supabase secrets set EVOLUTION_API_KEY=SUA_CHAVE_SECRETA
```

---

## 🚀 Passo 5: Criar Edge Function

### **5.1. Criar Diretório**

```bash
# No seu projeto local
mkdir -p supabase/functions/whatsapp-notification
cd supabase/functions/whatsapp-notification
```

### **5.2. Criar Arquivo index.ts**

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { phone, message, instanceName = 'jbapex-instance' } = await req.json();

    if (!phone || !message) {
      return new Response(
        JSON.stringify({ error: 'phone e message são obrigatórios' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Obter configurações do Evolution API
    const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

    if (!evolutionApiUrl || !evolutionApiKey) {
      return new Response(
        JSON.stringify({ error: 'EVOLUTION_API_URL ou EVOLUTION_API_KEY não configuradas' }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Formatar número (remover caracteres especiais)
    const formattedPhone = phone.replace(/\D/g, '');

    // Enviar mensagem via Evolution API
    const response = await fetch(
      `${evolutionApiUrl}/message/sendText/${instanceName}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': evolutionApiKey,
        },
        body: JSON.stringify({
          number: formattedPhone,
          text: message,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Erro ao enviar mensagem');
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageId: data.key?.id,
        data 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Erro:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
```

### **5.3. Fazer Deploy**

```bash
# No diretório do projeto
supabase functions deploy whatsapp-notification
```

**Ou via Dashboard:**
1. Vá em **Edge Functions**
2. Clique em **Create a new function**
3. Nome: `whatsapp-notification`
4. Cole o código do `index.ts`
5. Clique em **Deploy**

---

## ✅ Passo 6: Testar Integração Completa

### **6.1. Testar Edge Function**

```bash
# Do seu computador
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
- `SEU_ANON_KEY` pela chave anônima do Supabase
- `5511999999999` pelo seu número de teste

**Se funcionar, você receberá a mensagem no WhatsApp! ✅**

---

## 🐛 Troubleshooting

### **Problema: "Connection refused"**

**Causa:** Evolution API não está rodando ou porta bloqueada.

**Solução:**
```bash
# Verificar se está rodando
docker ps | grep evolution

# Se não estiver, iniciar
cd /opt/evolution-api
docker-compose up -d

# Verificar logs
docker-compose logs -f
```

---

### **Problema: "Unauthorized" ou "Invalid API Key"**

**Causa:** Chave API incorreta.

**Solução:**
1. Verificar chave no `docker-compose.yml`
2. Verificar chave configurada no Supabase Secrets
3. Garantir que são iguais

---

### **Problema: WhatsApp desconectado**

**Causa:** Se não usar por muito tempo, pode desconectar.

**Solução:**
1. Reconectar via QR Code
2. Implementar "keep-alive" (ping periódico)

---

### **Problema: Não recebe mensagem**

**Verificar:**
1. Número está no formato correto? (5511999999999)
2. WhatsApp está conectado? (status = "open")
3. Edge Function retornou sucesso?
4. Ver logs do Evolution API: `docker-compose logs -f`

---

## 📊 Verificar Logs

### **Logs do Evolution API**

```bash
# Na VPS
cd /opt/evolution-api
docker-compose logs -f
```

### **Logs da Edge Function**

**Via Dashboard:**
1. Vá em **Edge Functions > whatsapp-notification**
2. Clique em **Logs**

**Via CLI:**
```bash
supabase functions logs whatsapp-notification
```

---

## ✅ Checklist Final

- [ ] Evolution API rodando (`docker ps`)
- [ ] WhatsApp conectado (status = "open")
- [ ] Teste direto funcionando (curl)
- [ ] Secrets configurados no Supabase
- [ ] Edge Function criada e deployada
- [ ] Teste via Edge Function funcionando
- [ ] Mensagem recebida no WhatsApp

---

## 🎯 Próximos Passos

Agora que está funcionando:

1. ✅ **Criar triggers no banco** (para notificações automáticas)
2. ✅ **Criar interface de configuração** (para usuários)
3. ✅ **Implementar notificações por status** (Kanban)

**Quer que eu continue com esses passos?**

---

**🎉 Parabéns! Evolution API está instalado e funcionando!**

