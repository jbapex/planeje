export const UPDATE_KINDS = [
  ['received', 'Confirmar recebimento'], ['progress', 'Atualizar andamento'],
  ['blocked', 'Informar impedimento'], ['needs_owner', 'Pedir decisão do dono'],
  ['delivered', 'Informar entrega para revisão'],
];
export function followupState(task, updates = [], status = {}, today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }), comments = [], ownerId = task?.owner_id) {
  status ||= {};
  if (!task) return { key: 'unavailable', label: 'Tarefa indisponível', next: 'Conferir o vínculo', ownerAttention: true, pending: [], latest: [], overdue: false };
  const overdue = Boolean(task.due_date && task.due_date < today && !status.is_terminal);
  if (status.is_terminal) return { key: 'done', label: 'Concluída na tarefa', next: 'Consultar o resultado e o histórico', ownerAttention: false, pending: [], latest: [], overdue: false };
  const assigned = task.assignee_ids || [];
  const assignees = assigned.filter(id => id !== ownerId);
  const ordered = [...updates].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const latest = assignees.map(id => ordered.filter(u => u.actor_id === id && u.kind !== 'owner_reply').at(-1)).filter(Boolean);
  const pending = latest.filter(u => ['blocked', 'needs_owner', 'delivered'].includes(u.kind) && !ordered.some(r => r.kind === 'owner_reply' && r.reply_to === u.id));
  const base = { overdue, pending, latest, responded: latest.length, total: assignees.length, ownerAttention: pending.some(u => ['needs_owner', 'delivered'].includes(u.kind)) };
  if (!assigned.length) return { ...base, key: 'unassigned', label: 'Sem responsável', next: 'Definir responsável na tarefa', ownerAttention: true };
  if (!assignees.length) return { ...base, key: 'owner_assigned', label: 'Atribuída a você', next: 'Para delegar, selecione um responsável da equipe na tarefa', ownerAttention: true };
  if (pending.some(u => u.kind === 'needs_owner')) return { ...base, key: 'needs_owner', label: 'Precisa da sua decisão', next: 'Responder ao pedido da equipe', ownerAttention: true };
  if (latest.some(u => u.kind === 'blocked')) return { ...base, key: 'blocked', label: 'Com impedimento', next: 'Equipe registrar o desbloqueio ou pedir decisão' };
  if (pending.some(u => u.kind === 'delivered')) return { ...base, key: 'delivered', label: 'Entrega para revisão', next: 'Conferir a entrega na tarefa', ownerAttention: true };
  if (latest.some(u => u.kind === 'needs_owner' && !pending.includes(u))) return { ...base, key: 'owner_replied', label: 'Decisão respondida', next: 'Equipe confirmar a retomada' };
  if (latest.some(u => u.kind === 'delivered')) return { ...base, key: 'owner_replied', label: 'Entrega comentada', next: 'Conferir o retorno e atualizar a etapa na tarefa' };
  if (latest.some(u => u.kind === 'progress')) return { ...base, key: 'progress', label: 'Andamento informado', next: 'Equipe atualizar o próximo avanço' };
  if (latest.length) return { ...base, key: 'received', label: 'Recebimento confirmado', next: 'Equipe informar o primeiro avanço' };
  const lastComment = comments.filter(c => assignees.includes(c.user_id)).sort((a, b) =>
    (Date.parse(b.created_at ?? b.at) || 0) - (Date.parse(a.created_at ?? a.at) || 0) || String(b.id ?? '').localeCompare(String(a.id ?? ''))
  )[0];
  if (lastComment) return { ...base, key: 'comment', label: 'Mensagem da equipe', next: 'Andamento ainda não informado', lastComment };
  return { ...base, key: 'waiting', label: 'Aguardando confirmação da equipe', next: 'Equipe confirmar o recebimento na tarefa' };
}
export function hydrateTaskUpdates(updates, comments, people = []) {
  return updates.flatMap(u => {
    const c = comments.find(c => c.id === u.comment_id);
    return c ? [{ ...u, content: c.content ?? c.body, author: people.find(p => p.id === u.actor_id)?.full_name || c.author || 'Equipe' }] : [];
  });
}
