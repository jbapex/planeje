export const ATLAS_AGENT_DETAILS = {
  crm: { title: 'CRM IA', description: 'Funil comercial, fila humana e próximos passos.', skills: ['Analisar CRM e preparar próximos passos'], prompt: 'Consulte o especialista CRM IA. Analise o funil e a fila humana da conta selecionada; proponha um próximo passo com fontes e cobertura.' },
  trafego: {title:'Tráfego',description:'Campanhas, verba e otimização.',prompt:'Confira as campanhas, o orçamento mensal e as otimizações dos clientes de tráfego.'},
  resultados: {title:'Resultados',description:'Do contato à venda confirmada.',prompt:'Cruze o tráfego com conversas, agendamentos e vendas deste cliente. Mostre as lacunas de registro.'},
  financeiro: {title:'Financeiro',description:'Recebimentos e compromissos.',prompt:'O que preciso acompanhar no financeiro neste mês?'},
  clientes: { title: 'Clientes', description: 'O contexto de cada relação, sempre à mão.', skills: ['Conciliar alinhamentos e tarefas', 'Recuperar preferências e regras'], prompt: 'O que combinamos com este cliente que ainda não virou tarefa?' },
  operacao: { title: 'Operação', description: 'Clareza sobre decisões, entregas e bloqueios.', skills: ['Preparar um panorama de decisões', 'Investigar bloqueios e dependências'], prompt: 'O que depende de mim hoje e quais entregas estão bloqueadas?' },
  estrategia: { title: 'Estratégia e criação', description: 'Do briefing à ideia que vale desenvolver.', skills: ['Conduzir brainstorm com contexto', 'Propor conceito, roteiros e copy'], prompt: 'Vamos explorar três caminhos criativos para uma campanha. Primeiro, me ajude a completar o briefing.' },
};

export const ATLAS_STATUS_LABELS = {
  partial: 'Consulta limitada',
  waiting_team: 'Aguardando equipe',
  cancelled: 'Cancelada', completed: 'Concluído', processing: 'Em andamento', running: 'Em andamento', failed: 'Falhou', interrupted: 'Interrompido', consulted: 'Consulta registrada', pending: 'Pendente', queued: 'Na fila', skipped: 'Não utilizado', proposed: 'Proposta pronta', success: 'Concluído', error: 'Falhou',
};

export function atlasMissionStatus(run) {
  if (run.status === 'completed' && Array.isArray(run.steps)) {
    const lastStep = run.steps.at(-1);
    if (lastStep?.agent === 'central' && lastStep.kind === 'answer' && lastStep.status === 'partial') return atlasStatusLabel('partial');
    if (run.steps.some(step => step.kind === 'queued' && step.job_id)) return 'Pedido encaminhado';
    if (run.steps.some(step => step.kind === 'internal_question')) return 'Resposta recebida';
  }
  return atlasStatusLabel(run.status);
}

export function atlasConversationTimeline(messages,jobs,conversationId) {
  return [...messages,...jobs.filter(j=>j.conversation_id===conversationId).map(j=>({
    id:`job-${j.id}`,role:'assistant',job_id:j.id,job_status:j.status,
    retry_message:j.status==='failed'&&j.origin_run_id?messages.find(m=>m.role==='user'&&m.run_id===j.origin_run_id)?.content:null,
    thread_ids:[...new Set((j.steps||[]).filter(s=>s.kind==='internal_question'&&s.thread_id).map(s=>s.thread_id))],
    content:['completed','waiting_team'].includes(j.status)?j.result||'A consulta está aguardando a equipe.':['queued','running'].includes(j.status)?`Estou conferindo “${j.title}”. Você pode acompanhar os passos abaixo e continuar conversando.`:j.status==='cancelled'?`A missão “${j.title}” foi cancelada.`:`${j.result?j.result+'\n\n':''}Não consegui concluir “${j.title}”. ${j.error||'O pedido foi preservado.'}`,
    created_at:j.finished_at||j.started_at||j.created_at,
  }))].sort((a,b)=>new Date(a.created_at||0)-new Date(b.created_at||0));
}

export function atlasStatusLabel(status) {
  return ATLAS_STATUS_LABELS[status] || 'Registro recebido';
}

export function atlasAgentRunStatus(run, agent) {
  const steps = (Array.isArray(run?.steps) ? run.steps : []).filter((step) => step.agent === agent);
  const lifecycle = [...steps].reverse().find((step) => ['delegation', 'coordination', 'answer', 'error'].includes(step.kind));
  if (lifecycle?.kind === 'answer' && lifecycle.status === 'completed') return 'completed';
  if (lifecycle?.kind === 'error' || lifecycle?.status === 'failed') return 'failed';
  if (lifecycle && ['delegation', 'coordination'].includes(lifecycle.kind)) return ['failed', 'completed', 'cancelled'].includes(run.status) ? 'interrupted' : 'processing';
  if (steps.length) return run.status === 'failed' ? 'interrupted' : 'consulted';
  return null;
}

export function atlasAgentActivity(runs, latestRun, agent) {
  const working = (runs || []).some(run => ['running', 'processing'].includes(run.status) && atlasAgentRunStatus(run, agent) === 'processing');
  return working ? 'processing' : atlasAgentRunStatus(latestRun, agent);
}

export function atlasDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

export function latestAtlasRun(runs) {
  return [...(runs || [])].sort((a, b) => new Date(b.created_at || b.received_at || 0) - new Date(a.created_at || a.received_at || 0))[0] || null;
}
