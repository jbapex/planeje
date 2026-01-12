-- Migration: Criar tabela de configurações WhatsApp
-- Execute este script no Supabase SQL Editor

-- Criar tabela para configurações de WhatsApp
CREATE TABLE IF NOT EXISTS public.whatsapp_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_user ON public.whatsapp_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_client ON public.whatsapp_notifications(client_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_enabled ON public.whatsapp_notifications(enabled) WHERE enabled = true;

-- Trigger para updated_at
DROP TRIGGER IF EXISTS update_whatsapp_notifications_updated_at ON public.whatsapp_notifications;
CREATE OR REPLACE FUNCTION update_whatsapp_notifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_whatsapp_notifications_updated_at
  BEFORE UPDATE ON public.whatsapp_notifications
  FOR EACH ROW
  EXECUTE FUNCTION update_whatsapp_notifications_updated_at();

-- RLS (Row Level Security)
ALTER TABLE public.whatsapp_notifications ENABLE ROW LEVEL SECURITY;

-- Política: Usuários podem ver suas próprias notificações
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.whatsapp_notifications;
CREATE POLICY "Users can view their own notifications"
  ON public.whatsapp_notifications FOR SELECT
  USING (
    auth.uid() = user_id OR 
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role IN ('superadmin', 'admin')
    )
  );

-- Política: Usuários podem gerenciar suas próprias notificações
DROP POLICY IF EXISTS "Users can manage their own notifications" ON public.whatsapp_notifications;
CREATE POLICY "Users can manage their own notifications"
  ON public.whatsapp_notifications FOR ALL
  USING (auth.uid() = user_id);

-- Comentários
COMMENT ON TABLE public.whatsapp_notifications IS 'Configurações de notificações WhatsApp por usuário';
COMMENT ON COLUMN public.whatsapp_notifications.notification_type IS 'Tipo de notificação: task_status, task_assigned, task_overdue, task_completed, etc.';
COMMENT ON COLUMN public.whatsapp_notifications.phone_number IS 'Número do WhatsApp no formato: código do país + DDD + número (ex: 5511999999999)';

-- Verificar se foi criado
SELECT 
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'whatsapp_notifications'
ORDER BY ordinal_position;

