-- Migration: Criar triggers para notificações WhatsApp automáticas
-- Execute este script no Supabase SQL Editor

-- Função para enviar notificação WhatsApp quando tarefa muda de status
CREATE OR REPLACE FUNCTION notify_whatsapp_task_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_message TEXT;
  v_client_name TEXT;
  v_user_name TEXT;
  v_user_phone TEXT;
  v_config RECORD;
BEGIN
  -- Só notificar se status mudou
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Buscar nome do cliente
  SELECT empresa INTO v_client_name
  FROM public.clientes
  WHERE id = NEW.client_id;

  -- Buscar nome do usuário responsável
  SELECT full_name INTO v_user_name
  FROM public.profiles
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

  -- Buscar configurações de notificação para o responsável
  SELECT phone_number, instance_name INTO v_config
  FROM public.whatsapp_notifications
  WHERE user_id = NEW.owner_id
    AND notification_type = 'task_status'
    AND enabled = true
  LIMIT 1;

  -- Se encontrou configuração, chamar Edge Function via HTTP
  IF v_config IS NOT NULL THEN
    -- Usar pg_net para fazer requisição HTTP (se disponível)
    -- Ou usar webhook que será processado por Edge Function
    PERFORM pg_notify('whatsapp_notification', json_build_object(
      'type', 'task_status_change',
      'phone', v_config.phone_number,
      'message', v_message,
      'instanceName', COALESCE(v_config.instance_name, 'jbapex-instance')
    )::text);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger
DROP TRIGGER IF EXISTS task_status_change_whatsapp_trigger ON public.tarefas;
CREATE TRIGGER task_status_change_whatsapp_trigger
  AFTER UPDATE ON public.tarefas
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION notify_whatsapp_task_status_change();

-- Função para notificar quando nova tarefa é atribuída
CREATE OR REPLACE FUNCTION notify_whatsapp_task_assigned()
RETURNS TRIGGER AS $$
DECLARE
  v_message TEXT;
  v_client_name TEXT;
  v_task_owner_name TEXT;
  v_assignee_id UUID;
  v_config RECORD;
BEGIN
  -- Verificar se há assignees novos
  IF NEW.assignee_ids IS NULL OR array_length(NEW.assignee_ids, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  -- Buscar nome do cliente
  SELECT empresa INTO v_client_name
  FROM public.clientes
  WHERE id = NEW.client_id;

  -- Buscar nome do dono da tarefa
  SELECT full_name INTO v_task_owner_name
  FROM public.profiles
  WHERE id = NEW.owner_id;

  -- Notificar cada assignee
  FOREACH v_assignee_id IN ARRAY NEW.assignee_ids
  LOOP
    -- Formatar mensagem
    v_message := format(
      '🔔 Nova Tarefa Atribuída!

📋 Tarefa: %s
👤 Cliente: %s
📅 Prazo: %s
👥 Criada por: %s

Acesse o sistema para ver detalhes.',
      NEW.title,
      COALESCE(v_client_name, 'N/A'),
      COALESCE(NEW.due_date::text, 'Não definido'),
      COALESCE(v_task_owner_name, 'N/A')
    );

    -- Buscar configuração do assignee
    SELECT phone_number, instance_name INTO v_config
    FROM public.whatsapp_notifications
    WHERE user_id = v_assignee_id
      AND notification_type = 'task_assigned'
      AND enabled = true
    LIMIT 1;

    -- Se encontrou configuração, notificar
    IF v_config IS NOT NULL THEN
      PERFORM pg_notify('whatsapp_notification', json_build_object(
        'type', 'task_assigned',
        'phone', v_config.phone_number,
        'message', v_message,
        'instanceName', COALESCE(v_config.instance_name, 'jbapex-instance')
      )::text);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger para novas tarefas atribuídas
DROP TRIGGER IF EXISTS task_assigned_whatsapp_trigger ON public.tarefas;
CREATE TRIGGER task_assigned_whatsapp_trigger
  AFTER INSERT ON public.tarefas
  FOR EACH ROW
  WHEN (array_length(NEW.assignee_ids, 1) > 0)
  EXECUTE FUNCTION notify_whatsapp_task_assigned();

-- Função para notificar quando tarefa está atrasada
CREATE OR REPLACE FUNCTION notify_whatsapp_task_overdue()
RETURNS void AS $$
DECLARE
  v_task RECORD;
  v_message TEXT;
  v_client_name TEXT;
  v_config RECORD;
  v_days_overdue INTEGER;
BEGIN
  -- Buscar tarefas atrasadas (due_date < hoje e status não é 'concluido' ou 'done')
  FOR v_task IN
    SELECT t.*, p.full_name as owner_name
    FROM public.tarefas t
    LEFT JOIN public.profiles p ON p.id = t.owner_id
    WHERE t.due_date < CURRENT_DATE
      AND t.status NOT IN ('concluido', 'done', 'completed')
      AND t.due_date IS NOT NULL
  LOOP
    -- Calcular dias de atraso
    v_days_overdue := CURRENT_DATE - v_task.due_date::date;

    -- Buscar nome do cliente
    SELECT empresa INTO v_client_name
    FROM public.clientes
    WHERE id = v_task.client_id;

    -- Formatar mensagem
    v_message := format(
      '⚠️ Tarefa Atrasada!

📋 Tarefa: %s
👤 Cliente: %s
📅 Prazo: %s
⏰ Atrasada há %s dia(s)
👥 Responsável: %s

Por favor, atualize o status ou conclua a tarefa.',
      v_task.title,
      COALESCE(v_client_name, 'N/A'),
      v_task.due_date::text,
      v_days_overdue,
      COALESCE(v_task.owner_name, 'N/A')
    );

    -- Buscar configuração do responsável
    SELECT phone_number, instance_name INTO v_config
    FROM public.whatsapp_notifications
    WHERE user_id = v_task.owner_id
      AND notification_type = 'task_overdue'
      AND enabled = true
    LIMIT 1;

    -- Se encontrou configuração, notificar
    IF v_config IS NOT NULL THEN
      PERFORM pg_notify('whatsapp_notification', json_build_object(
        'type', 'task_overdue',
        'phone', v_config.phone_number,
        'message', v_message,
        'instanceName', COALESCE(v_config.instance_name, 'jbapex-instance')
      )::text);
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Criar função para processar notificações do pg_notify
-- Esta função será chamada por um webhook ou Edge Function que escuta pg_notify

-- Comentários
COMMENT ON FUNCTION notify_whatsapp_task_status_change() IS 'Notifica via WhatsApp quando tarefa muda de status';
COMMENT ON FUNCTION notify_whatsapp_task_assigned() IS 'Notifica via WhatsApp quando nova tarefa é atribuída';
COMMENT ON FUNCTION notify_whatsapp_task_overdue() IS 'Notifica via WhatsApp sobre tarefas atrasadas';

-- Verificar se foi criado
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name LIKE '%whatsapp%'
ORDER BY trigger_name;

