import React, { useMemo } from 'react';
import { CalendarClock, Users, Workflow } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import TaskChannelBadges, { ChannelLogo } from '@/components/tasks/TaskChannelBadges';
import { cn } from '@/lib/utils';
import { getTaskDueState } from '@/lib/taskUrgency';
import { isContentTaskType } from '@/lib/taskChannelPublications';

const SummaryItem = ({ icon: Icon, label, children, tone }) => (
  <div className={cn(
    'flex min-w-0 items-center gap-2 px-2.5 py-2',
    tone === 'overdue' && 'bg-red-50 dark:bg-red-950/30',
    tone === 'soon' && 'bg-amber-50 dark:bg-amber-950/30'
  )}>
    <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    <div className="min-w-0">
      <span className="sr-only">{label}: </span>
      <div className="min-w-0 text-xs font-semibold leading-4 text-foreground">{children}</div>
    </div>
  </div>
);

export default function TaskOperationalSummary({ formData, users = [], statusOptions = [], publications = [] }) {
  const status = statusOptions.find((item) => item.value === formData.status);
  const content = isContentTaskType(formData.type);
  const due = getTaskDueState(formData, { statusOptions });
  const assignees = useMemo(() => {
    const selected = new Set(formData.assignee_ids || []);
    return users.filter((item) => selected.has(item.id));
  }, [formData.assignee_ids, users]);
  const plannedChannels = useMemo(() => [...new Set(
    (Array.isArray(formData.planned_channels) ? formData.planned_channels : [])
      .filter((channel) => typeof channel === 'string' && channel.trim())
      .map((channel) => channel.trim())
  )], [formData.planned_channels]);

  return (
    <section className="border-y bg-muted/20 px-3 py-1.5 sm:px-5" aria-label="Resumo operacional da tarefa">
      <div className={cn('grid grid-cols-2 overflow-hidden rounded-lg border bg-background/80 [&>div]:border-r [&>div:nth-child(-n+2)]:border-b [&>div:nth-child(2n)]:border-r-0 sm:[&>div]:border-b-0 sm:[&>div]:border-r sm:[&>div:last-child]:border-r-0', content ? 'sm:grid-cols-4' : 'sm:grid-cols-3')}>
        <SummaryItem icon={Workflow} label="Etapa atual">
          <span className="flex min-w-0 items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: status?.color || '#94a3b8' }} />
            <span className="truncate">{status?.label || formData.status || 'Sem etapa'}</span>
          </span>
        </SummaryItem>
        <SummaryItem icon={CalendarClock} label={content ? due.isProductionDelivered ? 'Prazo da etapa' : 'Prazo de produção' : 'Prazo da tarefa'} tone={due.tone}>
          <span className="block truncate">{due.label || 'Sem prazo definido'}</span>
        </SummaryItem>
        <SummaryItem icon={Users} label="Responsáveis">
          {assignees.length ? (
            <span className="flex min-w-0 items-center gap-2" title={assignees.map((item) => item.full_name).join(', ')}>
              <span className="flex shrink-0 -space-x-1.5">
                {assignees.slice(0, 3).map((item) => (
                  <Avatar key={item.id} className="h-[18px] w-[18px] border border-background">
                    <AvatarImage src={item.avatar_url || undefined} alt={item.full_name || 'Responsável'} />
                    <AvatarFallback className="text-[8px]">{String(item.full_name || '?').trim().charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                ))}
              </span>
              <span className="truncate">
                {assignees.length === 1
                  ? String(assignees[0].full_name || 'Responsável').trim().split(/\s+/)[0]
                  : `${assignees.length} responsáveis`}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">Sem responsável</span>
          )}
        </SummaryItem>
        {content && <SummaryItem icon={Workflow} label="Canais">
          {publications.length ? (
            <TaskChannelBadges publications={publications} compact />
          ) : plannedChannels.length ? (
            <div className="flex flex-wrap items-center gap-2" aria-label={`${plannedChannels.length} ${plannedChannels.length === 1 ? 'canal previsto' : 'canais previstos'}`}>
              <div className="flex items-center gap-1">
                {plannedChannels.slice(0, 4).map((channel) => <ChannelLogo key={channel} channel={channel} size="sm" />)}
              </div>
              <span className="text-xs text-muted-foreground">{plannedChannels.length} {plannedChannels.length === 1 ? 'canal previsto' : 'canais previstos'}</span>
            </div>
          ) : (
            <span className="text-muted-foreground">Nenhum canal</span>
          )}
        </SummaryItem>}
      </div>
    </section>
  );
}
