import React, { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatWaitLabel, isAwaitingResponse } from '@/lib/atendimentoWaitTime';

const TICK_MS = 30000;

export default function AtendimentoWaitTimeBadge({
  conversation,
  variant = 'list',
  className,
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!isAwaitingResponse(conversation)) return undefined;
    const id = setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [conversation?.id, conversation?.awaiting_response_since, conversation?.status]);

  if (!isAwaitingResponse(conversation)) return null;

  const label = formatWaitLabel(conversation, nowMs);
  if (!label) return null;

  if (variant === 'header') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200',
          className,
        )}
        title="Tempo aguardando resposta da equipe"
      >
        <Clock className="h-3 w-3 shrink-0" />
        Aguardando há {label}
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-medium text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300',
        className,
      )}
      title="Tempo aguardando resposta"
    >
      <Clock className="h-3 w-3 shrink-0" />
      {label}
    </span>
  );
}
