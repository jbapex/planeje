/**
 * Validação de movimentação de lead entre etapas (stages) do funil.
 * Regras: etapas permitidas, ações obrigatórias da etapa de destino, motivo para ganho/perdido.
 */

/**
 * Verifica se o lead pode ser movido da stage de origem para a stage de destino.
 * @param {Object} params
 * @param {Object} params.sourceStage - stage atual do lead (pode ser null se lead sem stage)
 * @param {Object} params.targetStage - stage de destino
 * @param {Object} params.lead - lead (para campos obrigatórios)
 * @param {number} params.interacoesCount - quantidade de interações do lead
 * @param {boolean} params.hasProximaAcao - se proxima_acao está preenchida
 * @param {string} [params.motivoGanhoPerdido] - obrigatório quando targetStage.tipo é ganho ou perdido
 * @returns {{ valid: boolean, message?: string }}
 */
export function validateLeadMove({ sourceStage, targetStage, lead, interacoesCount = 0, hasProximaAcao = false, motivoGanhoPerdido = '' }) {
  if (!targetStage) {
    return { valid: false, message: 'Etapa de destino não informada.' };
  }

  const targetTipo = (targetStage.tipo || 'intermediaria').toLowerCase();

  // 1. Etapas permitidas: se temos stage de origem, destino deve estar em etapas_permitidas
  if (sourceStage && sourceStage.id) {
    const permitidas = sourceStage.etapas_permitidas;
    const allowedIds = Array.isArray(permitidas) ? permitidas : (permitidas && permitidas.length ? JSON.parse(JSON.stringify(permitidas)) : []);
    const allowedSet = new Set(allowedIds.map((id) => String(id)));
    if (allowedSet.size > 0 && !allowedSet.has(String(targetStage.id))) {
      return { valid: false, message: `Não é permitido avançar da etapa "${formatStageName(sourceStage.nome)}" para "${formatStageName(targetStage.nome)}".` };
    }
  }

  // 2. Ações obrigatórias da etapa de destino
  const acoes = targetStage.acoes_obrigatorias;
  const actions = Array.isArray(acoes) ? acoes : (acoes ? [acoes] : []);
  for (const action of actions) {
    const type = action?.type || action?.tipo;
    if (type === 'interaction' || type === 'interacao') {
      const min = action.min_count ?? action.minCount ?? 1;
      if (interacoesCount < min) {
        return { valid: false, message: `A etapa "${formatStageName(targetStage.nome)}" exige pelo menos ${min} interação(ões) registrada(s). Registre interações no lead antes de avançar.` };
      }
    }
    if (type === 'follow_up') {
      if (!hasProximaAcao && !(lead?.proxima_acao)) {
        return { valid: false, message: `A etapa "${formatStageName(targetStage.nome)}" exige uma próxima ação (follow-up) agendada. Preencha "Próxima ação" no lead.` };
      }
    }
    if (type === 'field' && action.field) {
      const value = lead?.[action.field];
      if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
        const label = action.label || action.field;
        return { valid: false, message: `A etapa "${formatStageName(targetStage.nome)}" exige o preenchimento do campo "${label}".` };
      }
    }
  }

  // 3. Ganho/Perdido: motivo obrigatório
  if (targetTipo === 'ganho' || targetTipo === 'perdido') {
    const motivo = (motivoGanhoPerdido || '').trim();
    if (!motivo) {
      return { valid: false, message: `Ao mover para "${formatStageName(targetStage.nome)}" é obrigatório informar o motivo.` };
    }
  }

  return { valid: true };
}

function formatStageName(name) {
  if (!name) return 'Etapa';
  return String(name).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Calcula se o lead está atrasado na stage (tempo na etapa > tempo_max_horas).
 * @param {Object} stage - stage com tempo_max_horas
 * @param {string} stageEnteredAt - ISO date do lead.stage_entered_at
 * @returns {boolean}
 */
export function isLeadOverdueInStage(stage, stageEnteredAt) {
  if (!stage?.tempo_max_horas || !stageEnteredAt) return false;
  const entered = new Date(stageEnteredAt).getTime();
  const now = Date.now();
  const hoursInStage = (now - entered) / (1000 * 60 * 60);
  return hoursInStage > stage.tempo_max_horas;
}
