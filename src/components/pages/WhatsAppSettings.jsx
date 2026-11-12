import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, CheckCircle2, XCircle, Loader2, Send, Puzzle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';

const WhatsAppSettings = () => {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  
  const [notifications, setNotifications] = useState({
    task_status: false,
    task_assigned: false,
    task_overdue: false,
    task_completed: false,
  });

  const notificationTypes = [
    {
      key: 'task_status',
      label: 'Tarefa mudou de status',
      description: 'Receba notificação quando uma tarefa muda de status no Kanban',
      icon: '🔄',
    },
    {
      key: 'task_assigned',
      label: 'Nova tarefa atribuída',
      description: 'Receba notificação quando uma nova tarefa é atribuída a você',
      icon: '🔔',
    },
    {
      key: 'task_overdue',
      label: 'Tarefa atrasada',
      description: 'Receba alertas quando tarefas estão atrasadas',
      icon: '⚠️',
    },
    {
      key: 'task_completed',
      label: 'Tarefa concluída',
      description: 'Receba notificação quando uma tarefa é concluída',
      icon: '✅',
    },
  ];

  useEffect(() => {
    if (user) {
      loadSettings();
    }
  }, [user]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('whatsapp_notifications')
        .select('*')
        .eq('user_id', user.id);

      if (error) {
        console.error('Erro ao carregar configurações:', error);
        return;
      }

      if (data && data.length > 0) {
        // Agrupar configurações por tipo
        const configs = {};
        data.forEach(config => {
          configs[config.notification_type] = {
            enabled: config.enabled,
            phone: config.phone_number,
          };
          // Se ainda não tem número no estado, usar o primeiro encontrado
          if (!phone && config.phone_number) {
            setPhone(config.phone_number);
          }
        });

        // Atualizar estado de notificações
        const newNotifications = { ...notifications };
        Object.keys(configs).forEach(key => {
          if (configs[key]) {
            newNotifications[key] = configs[key].enabled;
          }
        });
        setNotifications(newNotifications);
      }
    } catch (error) {
      console.error('Erro:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar configurações',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!phone || phone.trim() === '') {
      toast({
        title: 'Número obrigatório',
        description: 'Por favor, informe seu número do WhatsApp',
        variant: 'destructive',
      });
      return;
    }

    // Validar formato do número (deve ter pelo menos 10 dígitos)
    const formattedPhone = phone.replace(/\D/g, '');
    if (formattedPhone.length < 10) {
      toast({
        title: 'Número inválido',
        description: 'Por favor, informe um número válido (ex: 5511999999999)',
        variant: 'destructive',
      });
      return;
    }

    // Verificar se pelo menos uma notificação está habilitada
    const hasEnabled = Object.values(notifications).some(v => v === true);
    if (!hasEnabled) {
      toast({
        title: 'Nenhuma notificação selecionada',
        description: 'Selecione pelo menos um tipo de notificação',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSaving(true);

      // Salvar cada tipo de notificação
      const promises = Object.keys(notifications).map(async (type) => {
        const enabled = notifications[type];
        
        // Usar upsert para atualizar ou criar
        const { error } = await supabase
          .from('whatsapp_notifications')
          .upsert({
            user_id: user.id,
            phone_number: formattedPhone,
            notification_type: type,
            enabled: enabled,
            instance_name: 'jbapex-instance',
          }, {
            onConflict: 'user_id,notification_type,client_id',
          });

        if (error) {
          console.error(`Erro ao salvar ${type}:`, error);
          throw error;
        }
      });

      await Promise.all(promises);

      toast({
        title: 'Configurações salvas!',
        description: 'Suas preferências de notificação foram salvas com sucesso.',
      });
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao salvar configurações',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!phone || phone.trim() === '') {
      toast({
        title: 'Número obrigatório',
        description: 'Por favor, informe seu número do WhatsApp',
        variant: 'destructive',
      });
      return;
    }

    const formattedPhone = phone.replace(/\D/g, '');
    if (formattedPhone.length < 10) {
      toast({
        title: 'Número inválido',
        description: 'Por favor, informe um número válido',
        variant: 'destructive',
      });
      return;
    }

    try {
      setTesting(true);

      const { data, error } = await supabase.functions.invoke('whatsapp-notification', {
        body: {
          phone: formattedPhone,
          message: `✅ Teste de notificação WhatsApp do sistema JB APEX!

Olá ${profile?.full_name || 'Usuário'},

Esta é uma mensagem de teste para verificar se suas configurações estão funcionando corretamente.

Se você recebeu esta mensagem, suas configurações estão corretas! 🎉`,
        },
      });

      if (error) {
        throw error;
      }

      toast({
        title: 'Mensagem enviada!',
        description: 'Verifique seu WhatsApp. Se não receber em alguns segundos, verifique as configurações.',
      });
    } catch (error) {
      console.error('Erro ao testar:', error);
      toast({
        title: 'Erro ao enviar teste',
        description: error.message || 'Verifique se o Evolution API está configurado corretamente',
        variant: 'destructive',
      });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <MessageSquare className="h-8 w-8" />
          Configurações WhatsApp
        </h1>
        <p className="text-gray-500 mt-2">
          Configure suas notificações WhatsApp para receber alertas sobre tarefas e campanhas
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Puzzle className="h-5 w-5" />
            Extensão no Chrome
          </CardTitle>
          <CardDescription>
            Ícone arrastável em qualquer página do Chrome, com demandas do dia e criação rápida de tarefa ou solicitação.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="outline" onClick={() => navigate('/extensao-whatsapp')}>
            Baixar extensão
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Número do WhatsApp</CardTitle>
          <CardDescription>
            Informe seu número no formato: código do país + DDD + número (ex: 5511999999999)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="phone">Número do WhatsApp</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="5511999999999"
              className="mt-2"
            />
            <p className="text-xs text-gray-500 mt-1">
              Formato: Código do país (55) + DDD (sem 0) + Número (ex: 5511999999999)
            </p>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleTest} variant="outline" disabled={testing || !phone}>
              {testing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Testar Envio
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tipos de Notificação</CardTitle>
          <CardDescription>
            Escolha quais tipos de notificação você deseja receber
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {notificationTypes.map((type) => (
            <div
              key={type.key}
              className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <Checkbox
                id={type.key}
                checked={notifications[type.key]}
                onCheckedChange={(checked) =>
                  setNotifications({ ...notifications, [type.key]: checked })
                }
                className="mt-1"
              />
              <div className="flex-1">
                <Label
                  htmlFor={type.key}
                  className="text-base font-medium cursor-pointer flex items-center gap-2"
                >
                  <span className="text-xl">{type.icon}</span>
                  {type.label}
                </Label>
                <p className="text-sm text-gray-500 mt-1">{type.description}</p>
              </div>
              {notifications[type.key] && (
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Ativo
                </Badge>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-500">
                {Object.values(notifications).filter(v => v).length} de {notificationTypes.length} notificações ativas
              </p>
            </div>
            <Button onClick={handleSave} disabled={saving} size="lg">
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar Configurações'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Alert>
        <AlertDescription>
          <strong>💡 Dica:</strong> Após salvar, você receberá notificações automaticamente quando eventos acontecerem no sistema.
          Use o botão "Testar Envio" para verificar se suas configurações estão funcionando.
        </AlertDescription>
      </Alert>
    </div>
  );
};

export default WhatsAppSettings;

