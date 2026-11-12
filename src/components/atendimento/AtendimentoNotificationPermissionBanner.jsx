import React, { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  getNotificationPermission,
  requestAtendimentoNotificationPermission,
  wasNotificationPermissionAsked,
} from '@/lib/atendimentoDesktopNotification';

export default function AtendimentoNotificationPermissionBanner() {
  const [permission, setPermission] = useState(() => getNotificationPermission());
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const sync = () => setPermission(getNotificationPermission());
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  if (dismissed || permission === 'unsupported' || permission === 'granted') {
    return null;
  }

  const isDenied = permission === 'denied';

  return (
    <div className="pointer-events-auto fixed bottom-4 left-4 z-[120] w-[min(100vw-2rem,24rem)] rounded-xl border border-border bg-card p-4 shadow-lg">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Bell className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {isDenied ? 'Notificações bloqueadas' : 'Ativar avisos em segundo plano'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            {isDenied
              ? 'Para ver e ouvir mensagens com outra aba aberta, permita notificações do Planeje nas configurações do navegador.'
              : 'Com permissão, você recebe o balão do sistema e o som mesmo usando outra aba ou aplicativo.'}
          </p>
          {!isDenied && (
            <Button
              type="button"
              size="sm"
              className="mt-3 h-8"
              onClick={async () => {
                const result = await requestAtendimentoNotificationPermission();
                setPermission(result);
              }}
            >
              Permitir notificações
            </Button>
          )}
        </div>
        <button
          type="button"
          aria-label="Fechar"
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted"
          onClick={() => setDismissed(true)}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function useAutoAskNotificationPermission(enabled) {
  useEffect(() => {
    if (!enabled) return undefined;
    if (getNotificationPermission() !== 'default') return undefined;
    if (wasNotificationPermissionAsked()) return undefined;

    const timer = setTimeout(() => {
      requestAtendimentoNotificationPermission().catch(() => {});
    }, 2500);

    return () => clearTimeout(timer);
  }, [enabled]);
}
