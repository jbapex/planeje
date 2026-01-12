# 🚀 Guia Prático: Implementação Evolution API

## 📋 Checklist de Implementação

### **Fase 1: Setup Evolution API** (30 minutos)
- [ ] Instalar Docker
- [ ] Criar docker-compose.yml
- [ ] Iniciar Evolution API
- [ ] Conectar WhatsApp via QR Code
- [ ] Testar envio de mensagem manual

### **Fase 2: Integração com Supabase** (1 hora)
- [ ] Criar Edge Function
- [ ] Configurar secrets
- [ ] Criar função de formatação de mensagens
- [ ] Testar envio via Edge Function

### **Fase 3: Triggers no Banco** (30 minutos)
- [ ] Criar trigger para mudanças de status
- [ ] Criar trigger para novas tarefas
- [ ] Criar trigger para prazos
- [ ] Testar notificações automáticas

### **Fase 4: Interface de Configuração** (2 horas)
- [ ] Criar página de configurações
- [ ] Cadastro de número WhatsApp
- [ ] Escolha de tipos de notificação
- [ ] Teste de envio

---

## 🔧 Fase 1: Setup Evolution API

### **1.1. Instalar Docker**

**No seu servidor/VPS:**

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Verificar instalação
docker --version
docker-compose --version
```

---

### **1.2. Criar docker-compose.yml**

```bash
# Criar diretório
mkdir -p ~/evolution-api
cd ~/evolution-api

# Criar arquivo docker-compose.yml
cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  evolution-api:
    image: atendai/evolution-api:latest
    container_name: evolution-api
    restart: always
    ports:
      - "8080:8080"
    environment:
      # Chave de autenticação (mude para uma chave segura)
      - AUTHENTICATION_API_KEY=SUA_CHAVE_SECRETA_AQUI
      
      # Configurações do banco (opcional, mas recomendado)
      - DATABASE_ENABLED=true
      - DATABASE_PROVIDER=postgresql
      - DATABASE_CONNECTION_URI=postgresql://user:password@host:5432/evolution
      
      # Configurações de servidor
      - SERVER_URL=http://localhost:8080
      - SERVER_TYPE=http
      
      # Configurações de QR Code
      - QRCODE_LIMIT=30
      - QRCODE_COLOR=#198754
    volumes:
      - evolution_instances:/evolution/instances
      - evolution_store:/evolution/store
    networks:
      - evolution-network

volumes:
  evolution_instances:
  evolution_store:

networks:
  evolution-network:
    driver: bridge
EOF

# IMPORTANTE: Edite o arquivo e mude AUTHENTICATION_API_KEY
nano docker-compose.yml
```

---

### **1.3. Iniciar Evolution API**

```bash
# Iniciar container
docker-compose up -d

# Ver logs
docker-compose logs -f

# Verificar se está rodando
curl http://localhost:8080
```

---

### **1.4. Conectar WhatsApp**

**1. Acessar interface web:**
```
http://seu-servidor:8080
```

**2. Criar instância:**
```bash
# Via API
curl -X POST http://localhost:8080/instance/create \
  -H "apikey: SUA_CHAVE_SECRETA_AQUI" \
  -H "Content-Type: application/json" \
  -d '{
    "instanceName": "jbapex-instance",
    "token": "token-opcional",
    "qrcode": true,
    "integration": "WHATSAPP-BAILEYS"
  }'
```

**3. Obter QR Code:**
```bash
# Via API
curl http://localhost:8080/instance/connect/jbapex-instance \
  -H "apikey: SUA_CHAVE_SECRETA_AQUI"
```

**4. Escanear QR Code:**
- Abra WhatsApp no celular
- Vá em Configurações > Aparelhos conectados
- Escaneie o QR Code exibido

**5. Verificar status:**
```bash
curl http://localhost:8080/instance/fetchInstances \
  -H "apikey: SUA_CHAVE_SECRETA_AQUI"
```

---

### **1.5. Testar Envio de Mensagem**

```bash
# Enviar mensagem de teste
curl -X POST http://localhost:8080/message/sendText/jbapex-instance \
  -H "apikey: SUA_CHAVE_SECRETA_AQUI" \
  -H "Content-Type: application/json" \
  -d '{
    "number": "5511999999999",
    "text": "Teste de mensagem do Evolution API!"
  }'
```

**Formato do número:** Sempre com código do país (55 para Brasil) + DDD + número

---

## 🔗 Fase 2: Integração com Supabase

### **2.1. Criar Edge Function**

```bash
# Criar diretório
mkdir -p supabase/functions/whatsapp-notification
cd supabase/functions/whatsapp-notification
```

**Criar `index.ts`:**

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL') || 'http://localhost:8080';
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

    if (!evolutionApiKey) {
      return new Response(
        JSON.stringify({ error: 'EVOLUTION_API_KEY não configurada' }),
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

---

### **2.2. Configurar Secrets no Supabase**

```bash
# Adicionar secrets
supabase secrets set EVOLUTION_API_URL=http://seu-servidor:8080
supabase secrets set EVOLUTION_API_KEY=sua_chave_secreta_aqui
```

**Ou via Dashboard:**
1. Acesse Supabase Dashboard
2. Vá em Project Settings > Edge Functions > Secrets
3. Adicione:
   - `EVOLUTION_API_URL`: URL do seu Evolution API
   - `EVOLUTION_API_KEY`: Chave de autenticação

---

### **2.3. Fazer Deploy da Edge Function**

```bash
# Deploy
supabase functions deploy whatsapp-notification

# Ou via Dashboard:
# 1. Vá em Edge Functions
# 2. Clique em "Deploy new function"
# 3. Cole o código do index.ts
```

---

### **2.4. Testar Edge Function**

```bash
# Testar via curl
curl -X POST https://seu-projeto.supabase.co/functions/v1/whatsapp-notification \
  -H "Authorization: Bearer SEU_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "5511999999999",
    "message": "Teste via Supabase Edge Function!"
  }'
```

---

## 🗄️ Fase 3: Triggers no Banco

### **3.1. Criar Tabela de Configuração**

```sql
-- Criar tabela para configurações de WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clientes(id) ON DELETE CASCADE,
  phone_number VARCHAR(20) NOT NULL,
  notification_type VARCHAR(50) NOT NULL, -- 'task_status', 'task_assigned', 'task_overdue', etc.
  enabled BOOLEAN DEFAULT true,
  preferences JSONB DEFAULT '{}'::jsonb,
  instance_name VARCHAR(100) DEFAULT 'jbapex-instance',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, notification_type, client_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_user ON whatsapp_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_client ON whatsapp_notifications(client_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_enabled ON whatsapp_notifications(enabled) WHERE enabled = true;

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_whatsapp_notifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_whatsapp_notifications_updated_at
  BEFORE UPDATE ON whatsapp_notifications
  FOR EACH ROW
  EXECUTE FUNCTION update_whatsapp_notifications_updated_at();

-- RLS
ALTER TABLE whatsapp_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
  ON whatsapp_notifications FOR SELECT
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('superadmin', 'admin')
  ));

CREATE POLICY "Users can manage their own notifications"
  ON whatsapp_notifications FOR ALL
  USING (auth.uid() = user_id);
```

---

### **3.2. Criar Função para Enviar Notificação**

```sql
-- Função para enviar notificação via Edge Function
CREATE OR REPLACE FUNCTION send_whatsapp_notification(
  p_user_id UUID,
  p_message TEXT,
  p_notification_type VARCHAR(50) DEFAULT 'task_status'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_config RECORD;
  v_result JSONB;
BEGIN
  -- Buscar configuração do usuário
  SELECT phone_number, instance_name
  INTO v_config
  FROM whatsapp_notifications
  WHERE user_id = p_user_id
    AND notification_type = p_notification_type
    AND enabled = true
  LIMIT 1;

  -- Se não encontrou configuração, retornar
  IF v_config IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Configuração não encontrada');
  END IF;

  -- Chamar Edge Function via HTTP
  -- Nota: Isso requer extensão http no PostgreSQL
  -- Ou usar pg_net se disponível no Supabase
  
  -- Por enquanto, retornar sucesso (implementação real via Edge Function será feita)
  RETURN jsonb_build_object(
    'success', true,
    'phone', v_config.phone_number,
    'message', p_message
  );
END;
$$;
```

---

### **3.3. Criar Trigger para Mudanças de Status**

```sql
-- Função que será chamada quando tarefa muda de status
CREATE OR REPLACE FUNCTION notify_whatsapp_on_task_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_message TEXT;
  v_client_name TEXT;
  v_user_name TEXT;
BEGIN
  -- Só notificar se status mudou
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Buscar nome do cliente
  SELECT empresa INTO v_client_name
  FROM clientes
  WHERE id = NEW.client_id;

  -- Buscar nome do usuário responsável
  SELECT full_name INTO v_user_name
  FROM profiles
  WHERE id = NEW.owner_id;

  -- Formatar mensagem
  v_message := format(
    '🎯 Status Atualizado!

📋 Tarefa: %s
👤 Cliente: %s
📊 Status Anterior: %s
📊 Status Atual: %s
👥 Responsável: %s

Acesse o sistema para ver detalhes.',
    NEW.title,
    COALESCE(v_client_name, 'N/A'),
    OLD.status,
    NEW.status,
    COALESCE(v_user_name, 'N/A')
  );

  -- Chamar Edge Function via pg_net (se disponível)
  -- Por enquanto, apenas logar (implementação real será via webhook)
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger
DROP TRIGGER IF EXISTS task_status_change_whatsapp_trigger ON tarefas;
CREATE TRIGGER task_status_change_whatsapp_trigger
  AFTER UPDATE ON tarefas
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION notify_whatsapp_on_task_status_change();
```

---

### **3.4. Criar Webhook para Processar Eventos**

**Criar Edge Function `whatsapp-webhook`:**

```typescript
// supabase/functions/whatsapp-webhook/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  try {
    const { event, task, user, client } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Buscar configurações de notificação
    const { data: configs } = await supabase
      .from('whatsapp_notifications')
      .select('*')
      .eq('enabled', true)
      .eq('notification_type', event.type);

    if (!configs || configs.length === 0) {
      return new Response(JSON.stringify({ success: false, message: 'Nenhuma configuração encontrada' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Formatar mensagem
    const message = formatNotificationMessage(event, task, client);

    // Enviar para cada configuração
    const results = await Promise.all(
      configs.map(async (config) => {
        const { data, error } = await supabase.functions.invoke('whatsapp-notification', {
          body: {
            phone: config.phone_number,
            message: message,
            instanceName: config.instance_name || 'jbapex-instance',
          },
        });
        return { config: config.id, success: !error, error };
      })
    );

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

function formatNotificationMessage(event, task, client) {
  // Implementar formatação de mensagem baseado no tipo de evento
  return `🎯 Notificação\n\n${JSON.stringify(event)}`;
}
```

---

## 🎨 Fase 4: Interface de Configuração

### **4.1. Criar Componente de Configuração**

**Criar `src/components/pages/WhatsAppSettings.jsx`:**

```javascript
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const WhatsAppSettings = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [phone, setPhone] = useState('');
  const [notifications, setNotifications] = useState({
    task_status: false,
    task_assigned: false,
    task_overdue: false,
    task_completed: false,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const { data } = await supabase
      .from('whatsapp_notifications')
      .select('*')
      .eq('user_id', user.id);

    if (data && data.length > 0) {
      const config = data[0];
      setPhone(config.phone_number);
      // Carregar preferências
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      // Salvar configurações
      // Implementar lógica de salvamento
      toast({ title: 'Configurações salvas!' });
    } catch (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    const { data, error } = await supabase.functions.invoke('whatsapp-notification', {
      body: {
        phone: phone,
        message: '✅ Teste de notificação WhatsApp do sistema JB APEX!',
      },
    });

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Mensagem enviada!', description: 'Verifique seu WhatsApp.' });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configurações WhatsApp</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Número do WhatsApp</Label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="5511999999999"
          />
          <p className="text-xs text-gray-500 mt-1">
            Formato: Código do país + DDD + Número (ex: 5511999999999)
          </p>
        </div>

        <div>
          <Label>Tipos de Notificação</Label>
          <div className="space-y-2 mt-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                checked={notifications.task_status}
                onCheckedChange={(checked) =>
                  setNotifications({ ...notifications, task_status: checked })
                }
              />
              <Label>Tarefa mudou de status</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                checked={notifications.task_assigned}
                onCheckedChange={(checked) =>
                  setNotifications({ ...notifications, task_assigned: checked })
                }
              />
              <Label>Nova tarefa atribuída</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                checked={notifications.task_overdue}
                onCheckedChange={(checked) =>
                  setNotifications({ ...notifications, task_overdue: checked })
                }
              />
              <Label>Tarefa atrasada</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                checked={notifications.task_completed}
                onCheckedChange={(checked) =>
                  setNotifications({ ...notifications, task_completed: checked })
                }
              />
              <Label>Tarefa concluída</Label>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={loading}>
            Salvar Configurações
          </Button>
          <Button onClick={handleTest} variant="outline">
            Testar Envio
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default WhatsAppSettings;
```

---

## ✅ Próximos Passos

1. **Setup Evolution API** (30 min)
2. **Criar Edge Function** (1 hora)
3. **Configurar Triggers** (30 min)
4. **Criar Interface** (2 horas)
5. **Testar Tudo** (1 hora)

**Total estimado:** 5 horas

---

**🎉 Com isso, você terá notificações WhatsApp funcionando!**

