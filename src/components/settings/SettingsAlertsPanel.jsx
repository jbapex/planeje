import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, ListTodo, Inbox, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  getNotificationPermission,
  requestAtendimentoNotificationPermission,
} from '@/lib/atendimentoDesktopNotification';
import {
  isAtendimentoMessageSoundEnabled,
  setAtendimentoMessageSoundEnabled,
  playAtendimentoMessageSound,
} from '@/lib/atendimentoMessageAlertSound';
import {
  isTaskStatusSoundEnabled,
  setTaskStatusSoundEnabled,
  playTaskStatusSound,
} from '@/lib/taskStatusAlertSound';
import {
  isCaixaPushOptInEnabled,
  setCaixaPushOptInEnabled,
} from '@/lib/caixaPendenciasAlerts';

/**
 * Painel de alertas (sons + permissão do navegador). Usado em Configurações e no menu da sidebar.
 */
export default function SettingsAlertsPanel({
  idPrefix = 'settings',
  showWhatsAppLink = true,
  className,
}) {
  const navigate = useNavigate();
  const [permission, setPermission] = useState(() => getNotificationPermission());
  const [conversasSound, setConversasSound] = useState(() => isAtendimentoMessageSoundEnabled());
  const [tasksSound, setTasksSound] = useState(() => isTaskStatusSoundEnabled());
  const [caixaPush, setCaixaPush] = useState(() => isCaixaPushOptInEnabled());

  const syncPermission = useCallback(() => {
    setPermission(getNotificationPermission());
  }, []);

  useEffect(() => {
    syncPermission();
    document.addEventListener('visibilitychange', syncPermission);
    return () => document.removeEventListener('visibilitychange', syncPermission);
  }, [syncPermission]);

  return (
    <div className={cn('space-y-5', className)}>
      <div>
        <p className="planeje-settings-alerts-section-title">Navegador</p>
        {permission === 'unsupported' ? (
          <p className="text-sm text-muted-foreground">Seu navegador não suporta notificações do sistema.</p>
        ) : permission === 'granted' ? (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            Avisos do sistema ativados — você recebe balões com outra aba aberta.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {permission === 'denied'
                ? 'Permissão bloqueada. Libere nas configurações do navegador para ver popups quando Conversas ou Tarefas atualizarem.'
                : 'Permita notificações para receber avisos do Windows/macOS mesmo usando outra aba.'}
            </p>
            {permission !== 'denied' && (
              <Button
                type="button"
                size="sm"
                onClick={async () => {
                  const result = await requestAtendimentoNotificationPermission();
                  setPermission(result);
                }}
              >
                Permitir notificações
              </Button>
            )}
          </div>
        )}
      </div>

      <div>
        <p className="planeje-settings-alerts-section-title">Sons no app</p>
        <div className="planeje-settings-switch-row">
          <div className="flex min-w-0 items-center gap-2">
            <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <Label htmlFor={`${idPrefix}-sound-conversas`} className="cursor-pointer text-sm font-medium">
                Conversas
              </Label>
              <p className="text-xs text-muted-foreground">Ping ao receber mensagem</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {conversasSound && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => playAtendimentoMessageSound()}
              >
                Testar
              </Button>
            )}
            <Switch
              id={`${idPrefix}-sound-conversas`}
              checked={conversasSound}
              onCheckedChange={(checked) => {
                setConversasSound(checked);
                setAtendimentoMessageSoundEnabled(checked);
              }}
            />
          </div>
        </div>
        <div className="planeje-settings-switch-row">
          <div className="flex min-w-0 items-center gap-2">
            <ListTodo className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <Label htmlFor={`${idPrefix}-sound-tasks`} className="cursor-pointer text-sm font-medium">
                Tarefas (Kanban)
              </Label>
              <p className="text-xs text-muted-foreground">3 notas ao mudar etapa</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {tasksSound && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => playTaskStatusSound()}
              >
                Testar
              </Button>
            )}
            <Switch
              id={`${idPrefix}-sound-tasks`}
              checked={tasksSound}
              onCheckedChange={(checked) => {
                setTasksSound(checked);
                setTaskStatusSoundEnabled(checked);
              }}
            />
          </div>
        </div>
        <div className="planeje-settings-switch-row">
          <div className="flex min-w-0 items-center gap-2">
            <Inbox className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <Label htmlFor={`${idPrefix}-caixa-push`} className="cursor-pointer text-sm font-medium">
                Push da Caixa
              </Label>
              <p className="text-xs text-muted-foreground">
                Só novo pedido interno e SLA estourado. O badge no menu continua sempre.
              </p>
            </div>
          </div>
          <Switch
            id={`${idPrefix}-caixa-push`}
            checked={caixaPush}
            onCheckedChange={(checked) => {
              setCaixaPush(checked);
              setCaixaPushOptInEnabled(checked);
            }}
          />
        </div>
      </div>

      {showWhatsAppLink && (
        <div className="flex flex-col gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between gap-2"
            onClick={() => navigate('/settings/whatsapp')}
          >
            <span>Notificações WhatsApp</span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-60" />
          </Button>
          {idPrefix === 'sidebar' && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={() => navigate('/settings?tab=alertas')}
            >
              Abrir em Configurações
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
