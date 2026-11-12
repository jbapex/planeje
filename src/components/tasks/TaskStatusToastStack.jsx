import React from 'react';
import { ListTodo, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function TaskStatusToastStack({ alerts = [], onOpen, onDismiss }) {
  if (!alerts.length) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 left-4 z-[125] flex w-[min(100vw-2rem,22rem)] flex-col gap-2"
      aria-live="polite"
      aria-label="Mudanças de status em tarefas"
    >
      {alerts.map((alert) => (
        <button
          key={alert.id}
          type="button"
          onClick={() => onOpen?.(alert)}
          className={cn(
            'pointer-events-auto group flex w-full items-start gap-3 rounded-xl border border-border/80 bg-card/95 p-3 text-left shadow-lg backdrop-blur-sm',
            'transition hover:border-primary/40 hover:shadow-xl',
            'animate-in slide-in-from-left-full fade-in duration-300'
          )}
        >
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border/60 bg-primary/10"
            style={{ boxShadow: `inset 0 0 0 2px ${alert.statusColor || '#6B7280'}33` }}
          >
            <ListTodo className="h-5 w-5 text-primary" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="mb-1 flex items-center gap-2">
              <span
                className="inline-flex max-w-full truncate rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                style={{ backgroundColor: alert.statusColor || '#6B7280' }}
              >
                {alert.statusLabel}
              </span>
            </div>
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
