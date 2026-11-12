/** Domínio da Central de Tráfego (Fase 1). Sem feature flag em public_config. */

export const TRAFFIC_DEMAND_TYPES = [
  { value: 'nova_campanha', label: 'Nova campanha' },
  { value: 'publicacao', label: 'Publicação' },
  { value: 'revisao_24h', label: 'Revisão 24h' },
  { value: 'revisao_72h', label: 'Revisão 72h' },
  { value: 'analise', label: 'Análise' },
  { value: 'orcamento', label: 'Orçamento' },
  { value: 'criativo', label: 'Criativo' },
  { value: 'relatorio', label: 'Relatório' },
  { value: 'cobranca_material', label: 'Cobrança de material' },
  { value: 'aprovacao_cliente', label: 'Aprovação do cliente' },
  { value: 'pausa_reativacao', label: 'Pausa / reativação' },
  { value: 'rastreamento', label: 'Rastreamento' },
  { value: 'ajuste', label: 'Ajuste operacional' },
  { value: 'outro', label: 'Outra demanda' },
];

export const TRAFFIC_DEMAND_TYPE_VALUES = TRAFFIC_DEMAND_TYPES.map((d) => d.value);

export const TRAFFIC_PRIORITIES = [
  { value: 'high', label: 'Alta' },
  { value: 'medium', label: 'Média' },
  { value: 'low', label: 'Baixa' },
];

export const TRAFFIC_SITUATIONS = [
  { value: 'active', label: 'Ativo' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'needs_review', label: 'Revisão operacional' },
  { value: 'waiting_client', label: 'Aguardando cliente' },
  { value: 'temporarily_paused', label: 'Pausado temporariamente' },
  { value: 'no_campaign_expected', label: 'Sem campanha esperada' },
  { value: 'closed', label: 'Encerrado' },
];

export const DEMAND_TYPES_REQUIRING_EXISTING_CAMPAIGN = [
  'publicacao',
  'ajuste',
  'pausa_reativacao',
  'relatorio',
  'revisao_24h',
  'revisao_72h',
];

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const TRAFFIC_LINK_RELATIONS = ['origin', 'linked', 'legacy', 'review_24h', 'review_72h', 'affects'];

export const TRAFFIC_SOURCE_TYPES = ['manual', 'review', 'legacy', 'successor', 'system'];

/** Escrita PostgREST direta nas tabelas de integridade é negada; só RPCs. */
export const CENTRAL_TABLE_WRITE_POLICY = {
  traffic_task_details: 'rpc_only',
  paid_campaign_task_links: 'rpc_only',
  traffic_completion_evidence: 'rpc_only',
  traffic_client_ops: 'rpc_only',
};

export const MANUAL_DEMAND_TYPES = TRAFFIC_DEMAND_TYPES.filter(
  (d) => d.value !== 'revisao_24h' && d.value !== 'revisao_72h'
);

export function demandTypeLabel(value) {
  return TRAFFIC_DEMAND_TYPES.find((d) => d.value === value)?.label || value || 'Demanda';
}

export function situationLabel(value) {
  return TRAFFIC_SITUATIONS.find((s) => s.value === value)?.label || value || 'Sem situação';
}

export function priorityLabel(value) {
  if (value == null || value === '') return null;
  const normalized = normalizePriority(value);
  return TRAFFIC_PRIORITIES.find((p) => p.value === normalized)?.label || null;
}

export function formatOperationalUpdatedAt(value) {
  if (value == null || value === '') return 'Não configurado';
  const day = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return 'Não configurado';
  const [year, month, date] = day.split('-');
  return `${date}/${month}/${year}`;
}

export function isReviewDemandType(demandType) {
  return demandType === 'revisao_24h' || demandType === 'revisao_72h';
}

export function createsCampaignAsset(demandType) {
  return demandType === 'nova_campanha';
}

export function demandRequiresExistingCampaign(demandType) {
  return DEMAND_TYPES_REQUIRING_EXISTING_CAMPAIGN.includes(demandType);
}

export function tryUuid(value) {
  const raw = String(value || '').trim();
  if (!UUID_RE.test(raw)) return null;
  return raw.toLowerCase();
}

export function normalizePriority(value) {
  const v = String(value || '')
    .trim()
    .toLowerCase();
  if (v === 'alta' || v === 'high') return 'high';
  if (v === 'media' || v === 'média' || v === 'medium') return 'medium';
  if (v === 'baixa' || v === 'low') return 'low';
  return 'medium';
}

export function canAssignOthers({ role, accessLevel } = {}) {
  if (role === 'superadmin' || role === 'admin') return true;
  return accessLevel === 'all';
}

export function operationalDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function campaignKpisValid(kpis) {
  if (kpis == null || kpis === '') return true;
  let parsed = kpis;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return false;
    }
  }
  if (!Array.isArray(parsed)) return false;
  return parsed.every(
    (item) => item && typeof item === 'object' && !Array.isArray(item) && String(item.name || '').trim()
  );
}

export function minCommentChars(demandType) {
  if (demandType === 'analise' || demandType === 'orcamento' || demandType === 'relatorio') return 80;
  return 20;
}

export function autoCreatesReviews(demandType) {
  return demandType === 'nova_campanha' || demandType === 'publicacao';
}

export function reviewGenerationKey(sourceTaskId, campaignId, demandType) {
  return `review:${sourceTaskId}:${campaignId}:${demandType}`;
}

export function expectedAutoReviews(demandType, campaignIds) {
  if (!autoCreatesReviews(demandType)) return [];
  const ids = [...new Set((campaignIds || []).filter(Boolean))];
  const out = [];
  for (const campaignId of ids) {
    out.push({ demandType: 'revisao_24h', generationKey: reviewGenerationKey('SOURCE', campaignId, 'revisao_24h') });
    out.push({ demandType: 'revisao_72h', generationKey: reviewGenerationKey('SOURCE', campaignId, 'revisao_72h') });
  }
  return out;
}

export function evidenceRowValid(row) {
  const n = [row?.comment_id, row?.attachment_id, row?.campaign_id].filter((v) => v != null && v !== '').length;
  return n === 1;
}

export function evidenceRulesForDemand(demandType) {
  const min = minCommentChars(demandType);
  if (demandType === 'nova_campanha' || demandType === 'publicacao') {
    return {
      needCampaignOrFileOrComment: true,
      minCommentChars: min,
      hint: `Selecione a campanha, um anexo ou um comentário (mín. ${min} caracteres se for a única evidência).`,
    };
  }
  if (demandType === 'criativo' || demandType === 'relatorio') {
    return {
      needFileOrComment: true,
      minCommentChars: min,
      hint: `Selecione um anexo ou descreva o link/arquivo (mín. ${min} caracteres se for só texto).`,
    };
  }
  if (demandType === 'analise' || demandType === 'orcamento') {
    return {
      needComment: true,
      minCommentChars: min,
      hint: `Descreva a execução (mínimo ${min} caracteres).`,
    };
  }
  return {
    needAny: true,
    minCommentChars: min,
    hint: `Selecione evidência (anexo, campanha do mesmo cliente ou comentário com mín. ${min} caracteres).`,
  };
}

export function uiAllowed({ role, enabled, allowlist, profileId }) {
  const isAdmin = role === 'superadmin' || role === 'admin';
  if (isAdmin) return true;
  if (role !== 'colaborador') return false;
  if (!enabled) return false;
  const list = Array.isArray(allowlist) ? allowlist : [];
  if (!list.length) return false;
  return list.includes(profileId);
}

export function validateLinkedCampaigns(taskClientId, campaigns) {
  const errors = [];
  for (const c of campaigns || []) {
    if (!c?.id) continue;
    if (!taskClientId) {
      errors.push('Cliente da demanda é obrigatório para vincular campanha.');
      break;
    }
    if (c.client_id && c.client_id !== taskClientId) {
      errors.push('Campanha de outro cliente não pode ser vinculada.');
    }
  }
  return { ok: errors.length === 0, errors };
}

export function validateCreateDemandInput(input) {
  const errors = [];
  const title = String(input?.title || '').trim();
  const clientId = input?.clientId || null;
  const demandType = input?.demandType;
  const dueDate = input?.dueDate || null;
  const priority = normalizePriority(input?.priority);
  const assigneeIds = (input?.assigneeIds || []).filter(Boolean);
  const links = input?.links || [];
  const campaign = input?.campaign || null;

  if (!clientId) errors.push('Cliente obrigatório.');
  if (!title) errors.push('Título obrigatório.');
  if (!assigneeIds.length) errors.push('Responsável obrigatório.');
  if (!dueDate) errors.push('Prazo obrigatório.');
  if (!TRAFFIC_PRIORITIES.some((p) => p.value === priority)) errors.push('Prioridade obrigatória.');
  if (!TRAFFIC_DEMAND_TYPE_VALUES.includes(demandType)) errors.push('Tipo inválido.');
  if (input?.accessLevel != null && input?.role && !canAssignOthers({ role: input.role, accessLevel: input.accessLevel })) {
    if (assigneeIds.some((id) => id !== input.actorId)) {
      errors.push('Sem permissão para atribuir a outra pessoa.');
    }
  }

  const linked = validateLinkedCampaigns(
    clientId,
    links.map((l) => ({ id: l.paid_campaign_id, client_id: l.client_id }))
  );
  if (!linked.ok) errors.push(...linked.errors);

  if (demandRequiresExistingCampaign(demandType) && links.filter((l) => l.paid_campaign_id).length === 0) {
    errors.push('Este tipo exige campanha válida do mesmo cliente.');
  }

  let createsCampaign = false;
  if (createsCampaignAsset(demandType)) {
    createsCampaign = true;
    if (links.length) errors.push('Nova campanha não seleciona campanha existente.');
    if (!String(campaign?.name || '').trim()) errors.push('Nome da campanha obrigatório.');
    const budget = Number(campaign?.budget);
    if (!Number.isFinite(budget) || budget <= 0) errors.push('Orçamento da campanha deve ser maior que zero.');
    if (!campaign?.assigneeId) errors.push('Responsável da campanha obrigatório.');
    if (!campaignKpisValid(campaign?.kpis)) errors.push('KPIs da campanha em formato inválido.');
  }

  return { ok: errors.length === 0, errors, createsCampaign };
}

export function validateCompletionInput({
  demandType,
  summary,
  nextActionNone,
  successorTitle,
  successorDueDate,
  successorAssigneeIds,
  commentContent,
  attachmentIds,
  evidenceCampaignIds,
}) {
  const errors = [];
  if (!String(summary || '').trim() || String(summary).trim().length < 8) {
    errors.push('Resumo de conclusão obrigatório.');
  }

  const none = Boolean(nextActionNone);
  const successor = String(successorTitle || '').trim();
  const autoReviews = autoCreatesReviews(demandType);

  if (autoReviews) {
    if (none) errors.push('Publicação e nova campanha geram revisões 24h e 72h; não marque “sem próxima ação”.');
    if (successor) errors.push('Não crie sucessora manual: as revisões 24h e 72h são a próxima ação.');
  } else {
    if (none && successor) errors.push('Sucessora e “sem próxima ação” são exclusivos.');
    if (!none && !successor) errors.push('Crie a próxima ação ou marque que não há próxima ação.');
    if (successor && !successorDueDate) errors.push('A tarefa sucessora exige prazo.');
    if (successor && !(successorAssigneeIds || []).filter(Boolean).length) {
      errors.push('A tarefa sucessora exige responsável.');
    }
  }

  const rules = evidenceRulesForDemand(demandType);
  const comment = String(commentContent || '').trim();
  const atts = (attachmentIds || []).filter(Boolean);
  const camps = (evidenceCampaignIds || []).filter(Boolean);
  const min = minCommentChars(demandType);
  const commentIsOnlyEvidence = Boolean(comment) && atts.length === 0 && camps.length === 0;

  if (commentIsOnlyEvidence && comment.length < min) {
    errors.push(`Comentário como única evidência exige pelo menos ${min} caracteres.`);
  }
  if (rules.needComment && comment.length < min) {
    errors.push(rules.hint);
  }
  if (rules.needFileOrComment) {
    const commentOk = comment.length >= min;
    if (!commentOk && atts.length === 0) errors.push(rules.hint);
  }
  if (rules.needCampaignOrFileOrComment) {
    const commentOk = comment.length >= min;
    if (!commentOk && atts.length === 0 && camps.length === 0) errors.push(rules.hint);
  }
  if (rules.needAny) {
    const commentOk = comment.length >= min;
    if (!commentOk && atts.length === 0 && camps.length === 0) errors.push(rules.hint);
  }
  return { ok: errors.length === 0, errors, rules };
}

export function isTaskOpenByFlags(task, terminalValues) {
  const status = String(task?.status || '');
  const terminals = new Set((terminalValues || []).map(String));
  if (terminals.size) return !terminals.has(status);
  return true;
}

export function clientOpsPendingReason(ops) {
  if (!ops) return 'Sem gestor oficial';
  if (!ops.primary_assignee_id) return 'Sem gestor oficial';
  return null;
}

export function situationIsWaiting(situation) {
  return situation === 'waiting_client' || situation === 'onboarding' || situation === 'temporarily_paused';
}

export function legacyTaskCanComplete(details) {
  return Boolean(details && details.demand_type && (details.source_type === 'legacy' || details.task_id));
}

export const HOJE_BUCKETS = [
  'atrasadas',
  'vencem_hoje',
  'revisoes_48h',
  'aguardando_cliente',
  'publicacoes_pendentes',
  'demais',
];

export function classifyHojeBucket(row, { today, nowMs, horizonMs = 48 * 3600 * 1000 } = {}) {
  const due = row?.due_date || null;
  const demandType = row?.demand_type || row?.details?.demand_type;
  const situation = row?.situation || row?.ops_situation;
  if (due && today && due < today) return 'atrasadas';
  if (due && today && due === today) return 'vencem_hoje';
  const reviewSoon = isReviewDemandType(demandType);
  let withinHorizon = false;
  if (reviewSoon && due && today) {
    const t = new Date(`${due}T00:00:00Z`).getTime();
    const t0 = new Date(`${today}T00:00:00Z`).getTime();
    withinHorizon = t > t0 && t <= t0 + horizonMs + 24 * 3600 * 1000;
  }
  if (reviewSoon && row?.next_review_at && nowMs) {
    const at = new Date(row.next_review_at).getTime();
    if (at >= nowMs && at <= nowMs + horizonMs) withinHorizon = true;
  }
  if (reviewSoon && withinHorizon) return 'revisoes_48h';
  if (situation === 'waiting_client' || demandType === 'cobranca_material' || demandType === 'aprovacao_cliente') {
    return 'aguardando_cliente';
  }
  if (demandType === 'publicacao') return 'publicacoes_pendentes';
  return 'demais';
}

export function groupHojeBuckets(rows, clock) {
  const grouped = {
    atrasadas: [],
    vencem_hoje: [],
    revisoes_48h: [],
    aguardando_cliente: [],
    publicacoes_pendentes: [],
    demais: [],
  };
  for (const row of rows || []) {
    grouped[classifyHojeBucket(row, clock)].push(row);
  }
  return grouped;
}

export function campaignHasOpenDemand(campaignId, openTasks) {
  return (openTasks || []).some((t) => (t.campaign_ids || t.campaignIds || []).includes(campaignId));
}

export function buildSituacaoMetrics({ tasks = [], campaigns = [], ops = null, terminalValues = [], today, snapshot }) {
  const open = (tasks || []).filter((t) => isTaskOpenByFlags(t, terminalValues));
  const overdue = open.filter((t) => t.due_date && today && t.due_date < today);
  const dated = [...open].sort((a, b) => String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')));
  const nextAction = dated[0] || null;
  const nextReview =
    dated.find((t) => isReviewDemandType(t.demand_type || t.details?.demand_type)) || null;
  const waitingTypes = open.filter((t) => {
    const dt = t.demand_type || t.details?.demand_type;
    return dt === 'cobranca_material' || dt === 'aprovacao_cliente';
  });
  const clientPending = (ops?.situation === 'waiting_client' ? 1 : 0) + waitingTypes.length;
  const suppressMissingCampaign = ops?.situation === 'no_campaign_expected';
  const withoutDemand = suppressMissingCampaign
    ? []
    : (campaigns || []).filter((c) =>
        !campaignHasOpenDemand(
          c.id,
          open.map((t) => ({
            ...t,
            campaign_ids: t.campaign_ids || t.campaignIds || (t.campaigns || []).map((x) => x.id),
          }))
        )
      );
  const nextActionOverdue = Boolean(nextAction?.due_date && today && nextAction.due_date < today);
  return {
    openTasks: open.length,
    overdueTasks: overdue.length,
    nextAction: nextAction ? { task_id: nextAction.id, title: nextAction.title, due_date: nextAction.due_date } : null,
    nextReview: nextReview
      ? { task_id: nextReview.id, title: nextReview.title, due_date: nextReview.due_date }
      : null,
    nextActionOverdue,
    clientPending,
    campaignsWithoutDemand: withoutDemand,
    pendingGestor: Boolean(clientOpsPendingReason(ops)),
    snapshot,
  };
}
