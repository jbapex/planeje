import React from 'react';
import { Link } from 'react-router-dom';
import { Bell, CalendarClock, Check, ExternalLink, ListTodo, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAtendimentoConversaPlanejamento } from '@/hooks/useAtendimentoConversaPlanejamento';
import {
  formatPlanejamentoWhen,
  lembreteDueState,
  lembreteDueStateLabel,
} from '@/lib/atendimentoConversaPlanejamento';

export default function AtendimentoGrupoPlanejamentoPanel({
  conversation,
  canManage = true,
  onCreateTask,
  onAgendarLembrete,
  className,
}) {
  const { tasks, lembretes, loading, cancelLembrete, completeLembrete } =
    useAtendimentoConversaPlanejamento(conversation?.id);

  if (!conversation) return null;

  const isGroup = conversation.is_group;

  return (
    <div className={cn('wa-side-section space-y-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="wa-side-section-title mb-0">
          {isGroup ? 'Planejamento do grupo' : 'Planejamento'}
        </p>
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      {isGroup && (
        <p className="wa-text-caption">
          Crie tarefas ou lembretes internos — os avisos aparecem em Conversas → Lembretes.
        </p>
      )}

      {canManage && (
        <div className="flex flex-col gap-2">
          <Button type="button" size="sm" className="justify-start shadow-sm" onClick={onCreateTask}>
            <ListTodo className="h-4 w-4 mr-2" />
            Criar tarefa
          </Button>
          <Button type="button" size="sm" variant="outline" className="justify-start" onClick={onAgendarLembrete}>
            <Bell className="h-4 w-4 mr-2" />
            Novo lembrete
          </Button>
        </div>
      )}

      {lembretes.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-[#667781] uppercase tracking-wide">Lembretes</p>
          <ul className="space-y-2">
            {lembretes.map((item) => {
              const state = lembreteDueState(item.scheduled_at);
              const overdue = state === 'overdue';
              return (
                <li
                  key={item.id}
                  className={cn(
                    'rounded-lg border p-2.5 text-sm bg-white dark:bg-[#2a3942]',
                    overdue && 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/20',
                    state === 'due_soon' && 'border-amber-300'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{item.title}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <CalendarClock className="h-3 w-3 shrink-0" />
                        {formatPlanejamentoWhen(item.scheduled_at)}
                      </p>
                      <Badge variant={overdue ? 'destructive' : 'secondary'} className="wa-badge-sm mt-1">
                        {lembreteDueStateLabel(state)}
                      </Badge>
                      {item.body && (
                        <p className="text-xs mt-1 line-clamp-2 text-[#667781]">{item.body}</p>
                      )}
                    </div>
                    {canManage && (
                      <div className="flex shrink-0 gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Marcar feito"
                          onClick={() => completeLembrete(item.id)}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Cancelar"
                          onClick={() => cancelLembrete(item.id)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {tasks.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-[#667781] uppercase tracking-wide">Tarefas vinculadas</p>
          <ul className="space-y-2">
            {tasks.map((task) => (
              <li key={task.id} className="rounded-lg border p-2.5 text-sm bg-white dark:bg-[#2a3942]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{task.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Entrega: {task.due_date || '—'}
                      {task.type ? ` · ${task.type}` : ''}
                    </p>
                    <Badge variant="outline" className="wa-badge-sm mt-1 capitalize">
                      {task.status}
                    </Badge>
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" asChild>
                    <Link to={`/tasks/list/${task.id}`} title="Abrir tarefa">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!loading && tasks.length === 0 && lembretes.length === 0 && (
        <p className="wa-text-caption">Nenhuma tarefa ou lembrete ainda.</p>
      )}
    </div>
  );
}
