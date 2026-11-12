import React from 'react';
import { Flame } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getTaskDueState, normalizeTaskPriority, taskPriorityMeta } from '@/lib/taskUrgency';

const PRIORITY_CLASS = {
  low: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/80 dark:text-slate-200 dark:border-slate-600',
  medium: 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950/50 dark:text-sky-200 dark:border-sky-800',
  high: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/50 dark:text-orange-200 dark:border-orange-800',
  urgent: 'bg-red-600 text-white border-red-700 dark:bg-red-600 dark:text-white dark:border-red-500',
};

export function TaskPriorityBadge({ priority, className, always = false }) {
  const meta = taskPriorityMeta(priority);
  const value = normalizeTaskPriority(priority);
  if (!always && value !== 'high' && value !== 'urgent') return null;
  return (
    <Badge
      variant="outline"
      className={cn(
        'tasks-priority-badge gap-1 whitespace-nowrap border text-xs font-semibold',
        PRIORITY_CLASS[value],
        className
      )}
    >
      {value === 'urgent' ? <Flame className="h-3 w-3" /> : null}
      {meta.label}
    </Badge>
  );
}

export function TaskDueLabel({ task, dueDate, status, productionDeliveredAt, stageDueAt, statusOptions, className }) {
  const due = getTaskDueState(task || {
    due_date: dueDate,
    status,
    production_delivered_at: productionDeliveredAt,
    stage_due_at: stageDueAt,
  }, { statusOptions });
  if (!due.label) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap',
        due.tone === 'overdue' && 'text-red-600 dark:text-red-400',
        due.tone === 'soon' && 'text-amber-600 dark:text-amber-400',
        due.isProductionDelivered && due.tone === 'none' && 'text-emerald-600 dark:text-emerald-400',
        !due.isProductionDelivered && due.tone === 'none' && 'text-gray-500 dark:text-gray-400',
        className
      )}
    >
      {due.label}
    </span>
  );
}
