# 📱 Integração WhatsApp: Notificações Automáticas por Etapa do Kanban

## 🎯 Visão Geral

**Objetivo:** Conectar WhatsApp ao sistema para enviar notificações automáticas quando tarefas/campanhas mudam de status no Kanban.

**Benefícios:**
- ✅ Clientes informados em tempo real sobre progresso
- ✅ Equipe notificada sobre tarefas atribuídas
- ✅ Alertas automáticos sobre prazos e bloqueios
- ✅ Comunicação direta sem precisar entrar no sistema

---

## 🎯 Casos de Uso

### **1. Notificações para Clientes** 👤

**Quando enviar:**
- ✅ Tarefa/campanha muda de status (ex: "Em Revisão" → "Aprovado")
- ✅ Nova tarefa atribuída relacionada ao cliente
- ✅ Prazo próximo de vencer
- ✅ Projeto concluído

**Exemplo de mensagem:**
```
🎉 Olá [Nome do Cliente]!

Sua campanha "[Nome da Campanha]" mudou de status:
📊 De: Em Produção
📊 Para: Em Revisão

Nossa equipe está revisando o material antes da publicação.
Você será notificado quando estiver aprovado!

Atenciosamente,
Equipe JB APEX
```

---

### **2. Notificações para Equipe** 👥

**Quando enviar:**
- ✅ Nova tarefa atribuída
- ✅ Tarefa mudou de status
- ✅ Tarefa bloqueada (aguardando dependência)
- ✅ Prazo próximo de vencer
- ✅ Tarefa concluída

**Exemplo de mensagem:**
```
🔔 Nova Tarefa Atribuída!

📋 Tarefa: Criar 5 posts para Instagram
👤 Cliente: [Nome do Cliente]
📅 Prazo: 15/01/2024
📊 Status: A Fazer

Acesse o sistema para ver detalhes:
[Link direto para tarefa]

Boa sorte! 🚀
```

---

### **3. Notificações de Alerta** ⚠️

**Quando enviar:**
- ✅ Tarefa atrasada
- ✅ Campanha com baixa performance
- ✅ Bloqueio identificado
- ✅ Cliente sem atividade há muito tempo

**Exemplo de mensagem:**
```
⚠️ Alerta: Tarefa Atrasada!

📋 Tarefa: Revisar arte da campanha
👤 Cliente: [Nome do Cliente]
📅 Prazo: 10/01/2024 (Vencido há 2 dias)
👤 Responsável: [Nome]

Por favor, atualize o status ou conclua a tarefa.
```

---

## 🏗️ Arquitetura da Integração

### **Opção 1: WhatsApp Business API (Recomendado)** ⭐

**Vantagens:**
- ✅ API oficial do WhatsApp
- ✅ Suporte a mensagens automatizadas
- ✅ Confiável e estável
- ✅ Suporte a templates aprovados

**Desvantagens:**
- ❌ Requer aprovação do WhatsApp
- ❌ Pode ter custos por mensagem
- ❌ Setup mais complexo

**Como funciona:**
```
Sistema detecta mudança no Kanban
  ↓
Edge Function processa evento
  ↓
Envia mensagem via WhatsApp Business API
  ↓
WhatsApp entrega mensagem ao destinatário
```

---

### **Opção 2: WhatsApp Web via API (Mais Simples)** 🚀

**Vantagens:**
- ✅ Setup rápido
- ✅ Gratuito
- ✅ Fácil de implementar
- ✅ Não precisa aprovação

**Desvantagens:**
- ❌ Menos confiável (pode desconectar)
- ❌ Limitações de rate limit
- ❌ Pode violar termos de uso do WhatsApp

**Como funciona:**
```
Sistema detecta mudança no Kanban
  ↓
Edge Function processa evento
  ↓
Envia mensagem via API do WhatsApp Web
  ↓
WhatsApp Web entrega mensagem
```

---

### **Opção 3: Twilio WhatsApp API** 💼

**Vantagens:**
- ✅ API profissional
- ✅ Confiável
- ✅ Boa documentação
- ✅ Suporte a múltiplos canais

**Desvantagens:**
- ❌ Custo por mensagem
- ❌ Requer conta Twilio

**Como funciona:**
```
Sistema detecta mudança no Kanban
  ↓
Edge Function processa evento
  ↓
Envia mensagem via Twilio API
  ↓
Twilio entrega via WhatsApp
```

---

## 📋 Implementação Recomendada

### **Fase 1: Setup Básico (1 semana)** 🚀

**1. Escolher Provedor:**
- Recomendado: **Twilio WhatsApp API** (mais profissional)
- Alternativa: **WhatsApp Business API** (se tiver conta Business)

**2. Criar Edge Function:**
```typescript
// supabase/functions/whatsapp-notification/index.ts
// Função que recebe eventos e envia notificações
```

**3. Configurar Webhooks:**
- Detectar mudanças no Kanban
- Processar eventos
- Enviar notificações

---

### **Fase 2: Notificações Básicas (1 semana)** 📱

**Implementar:**
- ✅ Notificação quando tarefa muda de status
- ✅ Notificação quando nova tarefa é atribuída
- ✅ Notificação quando tarefa é concluída

**Configurações:**
- Permitir usuário escolher quais notificações receber
- Permitir configurar horários (não enviar fora do horário comercial)

---

### **Fase 3: Notificações Avançadas (1 semana)** 🎯

**Implementar:**
- ✅ Notificações de alerta (tarefas atrasadas)
- ✅ Notificações para clientes
- ✅ Notificações de bloqueios
- ✅ Relatórios semanais via WhatsApp

---

## 🔧 Estrutura Técnica

### **1. Tabela de Configuração**

```sql
CREATE TABLE whatsapp_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  client_id UUID REFERENCES clientes(id),
  notification_type VARCHAR(50), -- 'task_status', 'task_assigned', 'task_overdue', etc.
  enabled BOOLEAN DEFAULT true,
  phone_number VARCHAR(20),
  preferences JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

### **2. Edge Function**

```typescript
// supabase/functions/whatsapp-notification/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const { event, task, user, client } = await req.json();
  
  // Verificar se usuário quer receber notificação
  const { data: config } = await supabase
    .from('whatsapp_notifications')
    .select('*')
    .eq('user_id', user.id)
    .eq('notification_type', event.type)
    .eq('enabled', true)
    .single();
  
  if (!config) return;
  
  // Enviar mensagem via Twilio/WhatsApp API
  const message = formatMessage(event, task, client);
  await sendWhatsAppMessage(config.phone_number, message);
  
  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
```

---

### **3. Trigger no Banco**

```sql
-- Trigger que detecta mudanças no Kanban
CREATE OR REPLACE FUNCTION notify_whatsapp_on_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Se status mudou, dispara evento
  IF OLD.status != NEW.status THEN
    PERFORM pg_notify('whatsapp_notification', json_build_object(
      'type', 'task_status_change',
      'task_id', NEW.id,
      'old_status', OLD.status,
      'new_status', NEW.status,
      'user_id', NEW.owner_id
    )::text);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER task_status_change_trigger
  AFTER UPDATE ON tarefas
  FOR EACH ROW
  EXECUTE FUNCTION notify_whatsapp_on_status_change();
```

---

## 📱 Templates de Mensagens

### **Template 1: Mudança de Status**

```
🎯 Status Atualizado!

📋 Tarefa: [Nome da Tarefa]
👤 Cliente: [Nome do Cliente]
📊 Status Anterior: [Status Antigo]
📊 Status Atual: [Status Novo]

[Descrição do que significa o novo status]

Acesse: [Link]
```

---

### **Template 2: Nova Tarefa**

```
🔔 Nova Tarefa!

📋 [Nome da Tarefa]
👤 Cliente: [Nome do Cliente]
📅 Prazo: [Data]
👥 Responsável: [Nome]

[Descrição da tarefa]

Acesse: [Link]
```

---

### **Template 3: Tarefa Concluída**

```
✅ Tarefa Concluída!

📋 [Nome da Tarefa]
👤 Cliente: [Nome do Cliente]
👥 Concluída por: [Nome]

Parabéns pelo trabalho! 🎉

Acesse: [Link]
```

---

### **Template 4: Alerta de Prazo**

```
⚠️ Atenção: Prazo Próximo!

📋 [Nome da Tarefa]
👤 Cliente: [Nome do Cliente]
📅 Prazo: [Data] (em [X] dias)
👥 Responsável: [Nome]

Por favor, atualize o status ou conclua a tarefa.

Acesse: [Link]
```

---

## ⚙️ Configurações do Usuário

### **Página de Configurações**

```javascript
// src/components/pages/WhatsAppSettings.jsx
// Permite usuário:
// - Cadastrar número do WhatsApp
// - Escolher quais notificações receber
// - Definir horários (não enviar fora do horário comercial)
// - Testar notificações
```

**Opções de Notificação:**
- ✅ Tarefa atribuída
- ✅ Tarefa mudou de status
- ✅ Tarefa concluída
- ✅ Tarefa atrasada
- ✅ Campanha mudou de status
- ✅ Projeto concluído
- ✅ Relatório semanal

**Horários:**
- Horário comercial: 08:00 - 18:00
- Fins de semana: Desabilitado por padrão
- Feriados: Desabilitado por padrão

---

## 🎯 Fluxo Completo

### **Exemplo: Tarefa muda de "Em Produção" para "Em Revisão"**

```
1. Usuário arrasta tarefa no Kanban
   ↓
2. Sistema atualiza status no banco
   ↓
3. Trigger detecta mudança
   ↓
4. Edge Function recebe evento
   ↓
5. Verifica configurações do usuário
   ↓
6. Formata mensagem personalizada
   ↓
7. Envia via WhatsApp API
   ↓
8. Usuário recebe notificação no WhatsApp
```

---

## 📊 Métricas de Sucesso

### **KPIs:**
- ✅ Taxa de entrega de mensagens (>95%)
- ✅ Tempo médio de entrega (<5 segundos)
- ✅ Taxa de abertura de links nas mensagens
- ✅ Satisfação dos usuários com notificações

---

## 🚀 Próximos Passos

### **1. Escolher Provedor:**
- [ ] Twilio WhatsApp API (recomendado)
- [ ] WhatsApp Business API
- [ ] Outro provedor

### **2. Criar Edge Function:**
- [ ] Setup básico
- [ ] Integração com API escolhida
- [ ] Testes de envio

### **3. Implementar Triggers:**
- [ ] Trigger para mudanças de status
- [ ] Trigger para novas tarefas
- [ ] Trigger para prazos

### **4. Criar Interface de Configuração:**
- [ ] Página de configurações
- [ ] Cadastro de número
- [ ] Escolha de notificações
- [ ] Teste de envio

---

## 💡 Melhorias Futuras

### **Fase 2:**
- ✅ Respostas automáticas via WhatsApp
- ✅ Integração com chat do sistema
- ✅ Envio de relatórios via WhatsApp
- ✅ Notificações para clientes

### **Fase 3:**
- ✅ Chatbot via WhatsApp
- ✅ Criação de tarefas via WhatsApp
- ✅ Atualização de status via WhatsApp
- ✅ Integração completa com sistema

---

## ✅ Checklist de Implementação

### **Setup Inicial:**
- [ ] Escolher provedor de WhatsApp API
- [ ] Criar conta e obter credenciais
- [ ] Configurar secrets no Supabase
- [ ] Criar Edge Function básica

### **Desenvolvimento:**
- [ ] Implementar trigger no banco
- [ ] Criar função de formatação de mensagens
- [ ] Implementar envio de mensagens
- [ ] Criar página de configurações

### **Testes:**
- [ ] Testar envio de mensagens
- [ ] Testar diferentes tipos de notificação
- [ ] Testar configurações de horário
- [ ] Testar com múltiplos usuários

### **Deploy:**
- [ ] Deploy da Edge Function
- [ ] Configurar webhooks
- [ ] Testar em produção
- [ ] Documentar para usuários

---

**🎉 Com essa integração, o sistema se tornará ainda mais autônomo e eficiente!**

