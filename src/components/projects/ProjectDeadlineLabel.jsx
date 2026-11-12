import { CalendarClock } from 'lucide-react';
import { projectCurrentDeadline } from '@/lib/projectPlanningWorkflow';
import { cn } from '@/lib/utils';

export default function ProjectDeadlineLabel({ project, plan, tasks, statusOptions, onDefineDates, compact = false }) {
  const deadline = projectCurrentDeadline(project, plan, tasks, statusOptions);
  if (!deadline.value) return deadline.needsDates && onDefineDates ? <button type="button" onClick={onDefineDates} className="text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline">Definir prazos</button> : null;
  return <div className={cn('flex items-start gap-1.5 text-xs', deadline.tone === 'overdue' ? 'text-red-600 dark:text-red-300' : deadline.tone === 'soon' ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground')} title={`${deadline.label}: ${deadline.text}`}>
    <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="min-w-0"><span className={cn('font-medium', compact && 'block')}>{deadline.label}{!compact && ' · '}</span><span>{deadline.text}</span></span>
  </div>;
}
