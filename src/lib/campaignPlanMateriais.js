/**
 * Utilitários compartilhados entre Plano de Campanha e Calendário de materiais.
 */

/** Título da tarefa criada a partir de um material: [Empresa do cliente] descrição */
export function buildTaskTitleFromPlanMaterial(clientEmpresa, materialDescricao) {
  const nome = (clientEmpresa || '').trim() || 'Cliente';
  const titulo = (materialDescricao || '').trim() || '—';
  return `[${nome}] ${titulo}`;
}

export function getPlanItemTaskWarnings(item) {
  const blocking = [];
  const optional = [];
  const desc = (item?.descricao || '').trim();
  const entrega = (item?.data_entrega || '').trim();
  const postagem = (item?.data_postagem || '').trim();
  if (!desc) blocking.push('Descrição (vira o título da tarefa)');
  if (!entrega) blocking.push('Data de entrega');
  if (!postagem) blocking.push('Data de postagem');
  if (!item?.responsavel_id) optional.push('Responsável');
  if (!(item?.detalhes || '').trim()) optional.push('Detalhes ou roteiro no plano');
  return { blocking, optional };
}

/** Data exibida no calendário: postagem tem prioridade, senão entrega. */
export function getMaterialCalendarDateKey(m) {
  const post = (m?.data_postagem || '').trim();
  const ent = (m?.data_entrega || '').trim();
  return post || ent || null;
}

export function mergeCronogramaWithMaterials(plan) {
  const materiais = plan.materiais || [];
  const fromMat = materiais
    .filter((m) => (m.data_postagem || '').trim())
    .map((m) => ({
      id: `material-${m.id}`,
      data: m.data_postagem,
      acao: m.descricao || 'Ação do material',
      source: 'material',
    }));
  const other = (plan.cronograma || []).filter((c) => c.source !== 'material');
  return [...other, ...fromMat].sort((a, b) => new Date(a.data) - new Date(b.data));
}
