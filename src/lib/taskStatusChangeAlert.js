/** Tarefas exibidas no módulo Tarefas (exclui fila Redes Sociais). */
export function isTaskInKanbanScope(task) {
  const type = task?.type;
  if (!type) return true;
  return type !== 'social_media';
}

export function parseTaskStatusChange(task) {
  const history = task?.status_history;
  if (!Array.isArray(history) || history.length < 2) return null;

  const last = history[history.length - 1];
  const prev = history[history.length - 2];
  if (!last?.status || last.status === prev?.status) return null;

  return {
    taskId: task.id,
    newStatus: last.status,
    oldStatus: prev?.status || null,
    moverId: last.user_id || null,
    assigneeIds: Array.isArray(last.assignee_ids)
      ? last.assignee_ids
      : Array.isArray(task.assignee_ids)
        ? task.assignee_ids
        : [],
    taskTitle: String(task.title || 'Tarefa').trim() || 'Tarefa',
    clientId: task.client_id || null,
    dedupeKey: `task-status:${task.id}:${last.timestamp || `${prev?.status}->${last.status}`}`,
  };
}

export function statusLabelFromMap(statusMap, value) {
  if (!value) return '—';
  const hit = statusMap?.get(value);
  return hit?.label || value;
}

export function canNotifyTaskStatusChange({
  change,
  profileId,
  role,
  tasksAccessLevel,
  prefs,
  pathname,
}) {
  if (!change || !profileId) return false;
  if (!change.assigneeIds.includes(profileId)) return false;
  if (change.moverId && change.moverId === profileId) return false;

  if (prefs?.silenciar_tudo) return false;
  if (Array.isArray(prefs?.statuses_silenciados) && prefs.statuses_silenciados.includes(change.newStatus)) {
    return false;
  }

  if (role === 'colaborador' && tasksAccessLevel === 'responsible') {
    if (!change.assigneeIds.includes(profileId)) return false;
  }

  if (pathname && change.taskId) {
    const detailRe = new RegExp(`/tasks/[^/]+/${change.taskId}(?:/|$)`);
    if (detailRe.test(pathname)) return false;
  }

  return true;
}
