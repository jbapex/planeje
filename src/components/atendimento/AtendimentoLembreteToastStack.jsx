import React from 'react';
import { Bell, CheckCircle2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export default function AtendimentoLembreteToastStack({
  items = [],
  onOpen,
  onComplete,
  onDismiss,
}) {
  if (!items.length) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[130] flex w-[min(100vw-2rem,24rem)] flex-col gap-2"
      aria-live="assertive"
      aria-label="Lembretes pendentes"
    >
      {items.map((item) => {
        const isOverdue = item.state === 'overdue';
        return (
          <div
            key={item.id}
            className={cn(
              'pointer-events-auto rounded-xl border bg-card/98 p-3 shadow-lg backdrop-blur-sm',
              'animate-in slide-in-from-right-full fade-in duration-300',
              isOverdue
                ? 'border-red-300 dark:border-red-800 ring-1 ring-red-200/60 dark:ring-red-900/40'
                : 'border-amber-200 dark:border-amber-800',
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                  isOverdue ? 'bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
                )}
              >
                <Bell className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm font-semibold', isOverdue ? 'text-red-700 dark:text-red-300' : 'text-foreground')}>
                  {isOverdue ? 'Lembrete vencido' : 'Lembrete chegando'}
                </p>
                <p className="mt-0.5 truncate text-sm font-medium text-foreground">{item.title}</p>
                <p className="text-xs text-muted-foreground truncate">{item.convName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.whenLabel}</p>
              </div>
              <button
                type="button"
                aria-label="Fechar lembrete"
                onClick={() => onDismiss?.(item.id)}
                className="shrink-0 rounded-md p-1 text-muted-foreground opacity-70 transition hover:bg-muted hover:opacity-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 justify-end">
              <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => onOpen?.(item)}>
                Abrir
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-8 gap-1"
                onClick={() => onComplete?.(item)}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Concluir
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
