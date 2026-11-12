export function operationLabel(client) {
  const labels = (client?.etiquetas || []).map(x => String(x?.nome || x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[-_]/g, ' '));
  if (labels.includes('apice noivas')) return 'Ápice Noivas';
  if (labels.includes('jb apex')) return 'JB Apex';
  return 'Operação a confirmar';
}
export function ownerIntakeThread(demand){
  const id=demand?.proposal?.source==='atlas_owner_intake'&&demand.proposal.thread_id;
  return typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)?id:null;
}
export function demandPhase(demand, task, statuses = []) {
  if (demand.state === 'linked') return task ? statuses.find(x => x.value === task.status)?.label || task.status : 'Tarefa indisponível';
  if(ownerIntakeThread(demand)&&['draft','proposed'].includes(demand.state))return 'Conversa registrada no Atlas';
  return { draft: 'Entrada', proposed: 'Aguardando aprovação', needs_direction: 'Precisa de direção', archived: 'Arquivada' }[demand.state] || 'A conferir';
}
export function demandNextStep(demand, task, status) {
  if(ownerIntakeThread(demand)&&['draft','proposed'].includes(demand.state))return 'Consultar acompanhamento pelo robô';
  if (demand.state === 'needs_direction') return 'Responder à decisão de direção';
  if (demand.state === 'proposed') return 'Revisar e aprovar o repasse';
  if (demand.state === 'draft') return 'Pedir análise do Atlas';
  if (demand.state === 'archived') return 'Histórico preservado';
  if (!task) return 'Conferir o vínculo da tarefa';
  if (status?.is_terminal) return 'Conferir o resultado registrado';
  if (!(task.assignee_ids || []).length) return 'Definir responsável na tarefa';
  return 'Acompanhar execução e respostas';
}

// Client names come from the authorized context, never from the model's title.
export function atlasTaskTitle(clientName, title) {
  const name = String(clientName || '').trim();
  if (!name) throw new Error('Cliente indisponível para definir o título.');
  const prefix = `[${name}]`;
  let body = String(title || '').trim();
  while (body.slice(0, prefix.length).toLocaleLowerCase('pt-BR') === prefix.toLocaleLowerCase('pt-BR')) {
    body = body.slice(prefix.length).trim();
  }
  return body ? `${prefix} ${body}` : '';
}
