const socialTypes = new Set(['social_media', 'post', 'reels', 'story']);

export function isCsBoardTask(task) {
  return Boolean(task?.id && !socialTypes.has(task.type));
}

export function csTaskEditorLink(clientId, actorId, taskId = 'new', room) {
  return {
    to: `/tasks/list/${encodeURIComponent(taskId)}?client_id=${encodeURIComponent(clientId)}`,
    state: { csTask: { clientId, actorId, ...(room && { room }) } },
  };
}

export function csTaskClientId(state, clientId, user, profile, modules) {
  const origin = state?.csTask;
  return origin && clientId && user?.id && origin.actorId === user.id && origin.clientId === clientId &&
    profile?.id === user.id && profile.status === 'active' &&
    modules?.clients === true && modules.atendimento === true && modules.tasks === true ? clientId : null;
}

export async function confirmCsTaskClient(db, clientId) {
  if (!clientId) return false;
  try {
    const { data, error } = await db.rpc('cs_ia_radar').eq('client_id', clientId).maybeSingle();
    return !error && data?.client_id === clientId;
  } catch {
    return false;
  }
}

export function csTaskReturn(clientId, room) {
  if (room && (room.client === '' || room.client === clientId)) {
    const query = new URLSearchParams();
    if (room.client) query.set('cliente', room.client);
    if (typeof room.status === 'string' && room.status.length > 0 && room.status.length <= 100) query.set('situacao', room.status);
    const search = query.toString();
    return search ? `/cs-ia/tarefas?${search}` : '/cs-ia/tarefas';
  }
  return `/cs-ia/clientes/${encodeURIComponent(clientId)}?aba=tarefas`;
}
