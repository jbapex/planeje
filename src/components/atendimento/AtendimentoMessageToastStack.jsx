import React from 'react';
import { X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

function initialsFromName(name) {
  const parts = String(name || '?')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export default function AtendimentoMessageToastStack({ alerts = [], onOpen, onDismiss }) {
  if (!alerts.length) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[120] flex w-[min(100vw-2rem,22rem)] flex-col gap-2"
      aria-live="polite"
      aria-label="Novas mensagens"
    >
      {alerts.map((alert) => (
        <button
          key={alert.id}
          type="button"
          onClick={() => onOpen?.(alert)}
          className={cn(
            'pointer-events-auto group flex w-full items-start gap-3 rounded-xl border border-border/80 bg-card/95 p-3 text-left shadow-lg backdrop-blur-sm',
            'transition hover:border-primary/40 hover:shadow-xl',
            'animate-in slide-in-from-right-full fade-in duration-300'
          )}
        >
          <Avatar className="h-11 w-11 shrink-0 border border-border/60">
            {alert.avatarUrl ? <AvatarImage src={alert.avatarUrl} alt="" /> : null}
            <AvatarFallback className="bg-primary/10 text-sm font-medium text-primary">
              {initialsFromName(alert.subtitle || alert.title)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="truncate text-sm font-semibold text-foreground">{alert.title}</p>
            {alert.subtitle ? (
              <p className="truncate text-xs font-medium text-muted-foreground">{alert.subtitle}</p>
            ) : null}
            <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{alert.preview}</p>
          </div>
          <span
            role="button"
            tabIndex={0}
            aria-label="Fechar"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss?.(alert.id);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onDismiss?.(alert.id);
              }
            }}
            className="shrink-0 rounded-md p-1 text-muted-foreground opacity-70 transition hover:bg-muted hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </span>
        </button>
      ))}
    </div>
  );
}
