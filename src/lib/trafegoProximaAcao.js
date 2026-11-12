/** Alerta da Meta vira o que o gestor faz agora. Sem escrita automática. */

import { isMetaRateLimited } from './trafegoHojeCache.js';

export const NEXT_ACTIONS = {
  pagamento: {
    code: 'pagamento',
    title: 'Resolver pagamento',
    action: 'Regularizar o cartão na Meta ou cobrar o cliente.',
    gestorDo: 'Abra o Painel e regularize o cartão, ou crie uma demanda para cobrar o cliente.',
    demandType: 'cobranca_material',
    demandTitle: 'Resolver erro de pagamento na Meta',
    tone: 'issue',
    rank: 0,
  },
  limite: {
    code: 'limite',
    title: 'Cobrar limite',
    action: 'Pedir aumento de limite ao cliente ou pausar o que não precisa gastar.',
    gestorDo: 'Abra o Painel para pausar o que não precisa gastar, ou crie uma demanda para pedir limite.',
    demandType: 'orcamento',
    demandTitle: 'Cobrar aumento de limite na Meta',
    tone: 'issue',
    rank: 1,
  },
  meta_off: {
    code: 'meta_off',
    title: 'Vincular a Meta',
    action: 'Conferir System User e a conta de anúncios no cadastro.',
    gestorDo: 'Abra o Painel e reconecte a conta. Se faltar permissão, crie uma demanda.',
    demandType: 'rastreamento',
    demandTitle: 'Vincular / liberar conta Meta',
    tone: 'issue',
    rank: 2,
  },
  zero_leads: {
    code: 'zero_leads',
    title: 'Revisar 0 leads',
    action: 'Gastou sem lead. Revisar criativo, público e o formulário.',
    gestorDo: 'Gastou sem lead. Abra o Painel e ajuste criativo, público ou formulário, ou crie uma demanda.',
    demandType: 'analise',
    demandTitle: 'Revisar campanha sem lead',
    tone: 'warn',
    rank: 3,
  },
  zero_msgs: {
    code: 'zero_msgs',
    title: 'Revisar 0 mensagens',
    action: 'Gastou em mensagem sem conversa. Revisar criativo e CTWA.',
    gestorDo: 'Gastou sem conversa. Abra o Painel e ajuste criativo ou CTWA, ou crie uma demanda.',
    demandType: 'analise',
    demandTitle: 'Revisar campanha sem mensagem',
    tone: 'warn',
    rank: 3,
  },
  zero_vendas: {
    code: 'zero_vendas',
    title: 'Revisar 0 vendas',
    action: 'Gastou em compra sem venda. Revisar pixel, checkout e criativo.',
    gestorDo: 'Gastou sem venda. Abra o Painel e confira pixel, checkout e criativo, ou crie uma demanda.',
    demandType: 'analise',
    demandTitle: 'Revisar campanha sem venda',
    tone: 'warn',
    rank: 3,
  },
  roas_irreal: {
    code: 'roas_irreal',
    title: 'Conferir pixel',
    action: 'ROAS irreal — o evento de compra provavelmente está duplicado ou errado.',
    gestorDo: 'O evento de compra provavelmente está duplicado. Abra o Painel ou crie uma demanda.',
    demandType: 'rastreamento',
    demandTitle: 'Conferir pixel / evento de compra',
    tone: 'warn',
    rank: 4,
  },
  engajamento_sem_resultado: {
    code: 'engajamento_sem_resultado',
    title: 'Revisar objetivo',
    action: 'Gastou em engajamento sem lead, mensagem ou venda. Vale o objetivo?',
    gestorDo: 'Gastou em engajamento sem conversão. Abra o Painel e confira o objetivo, ou crie uma demanda.',
    demandType: 'analise',
    demandTitle: 'Revisar gasto em engajamento sem conversão',
    tone: 'warn',
    rank: 5,
  },
};

export function isHardTrafficAction(code) {
  return code === 'pagamento' || code === 'limite' || code === 'meta_off';
}

export const ZERO_SPEND = 80;
const ENGAGE_SPEND = 400;
const ROAS_CRAZY = 20;
const ROAS_SPEND = 80;

function textOf(brief) {
  return `${brief?.alert || ''} ${(brief?.issueLabels || []).join(' ')}`.toLowerCase();
}

export function classifyDeliveryIssue(brief) {
  const text = textOf(brief);
  if (/pagamento|payment|billing|cart[aã]o|unsettled/.test(text)) return 'pagamento';
  if (/limite de gastos|spend.?cap|limite de gasto/.test(text)) return 'limite';
  if (/indisponív|sem permiss|system user|dados da meta|não há snapshot|ainda não há/.test(text)) return 'meta_off';
  return null;
}

export function classifyQuality({
  spend = 0,
  leads = 0,
  messages = 0,
  purchases = 0,
  purchaseValue = 0,
  byObjective = {},
  inferredGoal = null,
} = {}) {
  const used = Number(spend) || 0;
  const roas = used > 0 ? Number(purchaseValue || 0) / used : 0;
  const leadSpend = Number(byObjective.leads?.spend || 0);
  const msgSpend = Number(byObjective.mensagens?.spend || 0);
  const buySpend = Number(byObjective.compras?.spend || 0);
  const engSpend = Number(byObjective.engajamento?.spend || 0);
  const engLike =
    engSpend >= ENGAGE_SPEND ||
    (inferredGoal === 'engajamento' &&
      used >= ENGAGE_SPEND &&
      leadSpend < ZERO_SPEND &&
      buySpend < ZERO_SPEND &&
      msgSpend < ZERO_SPEND);

  if (Number(purchases) > 0 && roas >= ROAS_CRAZY && used >= ROAS_SPEND) {
    return { code: 'roas_irreal', roas, spend: used, purchases: Number(purchases) };
  }
  // Objetivo LEAD da Meta com mensagens e 0 leads → não grita “0 leads”.
  if (leadSpend >= ZERO_SPEND && Number(leads) === 0 && Number(messages) === 0) {
    return { code: 'zero_leads', spend: leadSpend };
  }
  if (msgSpend >= ZERO_SPEND && Number(messages) === 0) {
    return { code: 'zero_msgs', spend: msgSpend };
  }
  if (buySpend >= ZERO_SPEND && Number(purchases) === 0) {
    return { code: 'zero_vendas', spend: buySpend };
  }
  if (engLike && Number(leads) === 0 && Number(purchases) === 0 && Number(messages) === 0) {
    return { code: 'engajamento_sem_resultado', spend: engSpend || used };
  }
  return null;
}

export function qualityFromSnapshot(snapshot) {
  if (!snapshot || snapshot.permError) return null;
  return classifyQuality({
    spend: snapshot.spend,
    leads: snapshot.leads,
    messages: snapshot.messages,
    purchases: snapshot.purchases,
    purchaseValue: snapshot.purchaseValue,
    byObjective: snapshot.byObjective,
    inferredGoal: snapshot.inferredGoal,
  });
}

function pack(code, extra = {}) {
  const spec = NEXT_ACTIONS[code];
  if (!spec) return null;
  return { ...spec, ...extra };
}

export function nextActionForAccount({ brief, snapshot } = {}) {
  const issue = classifyDeliveryIssue(brief || {});
  if (issue) {
    return pack(issue, { detail: NEXT_ACTIONS[issue].gestorDo || brief?.alert || NEXT_ACTIONS[issue].action });
  }

  if (isMetaRateLimited(snapshot) || isMetaRateLimited(brief)) {
    return null;
  }

  if (snapshot?.permError || (snapshot?.errorMessage && !snapshot.spend && !snapshot.activeCount)) {
    return pack('meta_off', { detail: NEXT_ACTIONS.meta_off.gestorDo || snapshot.errorMessage || NEXT_ACTIONS.meta_off.action });
  }

  const quality = brief?.quality || qualityFromSnapshot(snapshot) || classifyQuality(brief?.totals || {});
  if (!quality?.code) return null;
  const spec = NEXT_ACTIONS[quality.code];
  const doNext = spec.gestorDo || spec.action;
  const detail =
    quality.code === 'roas_irreal'
      ? `ROAS ${Number(quality.roas || 0).toFixed(1)}x com ${quality.purchases} venda(s). ${doNext}`
      : doNext;
  return pack(quality.code, { detail, quality });
}

export function pickStrongerAction(current, next) {
  if (!next) return current || null;
  if (!current) return next;
  return (next.rank ?? 9) < (current.rank ?? 9) ? next : current;
}

/** Conjunto que explica a ação da fila (gasto sem resultado / pixel / engajamento). */
export function adsetMatchesAction(actionCode, metrics = {}, objectiveKey = '') {
  const used = Number(metrics.spend) || 0;
  const leads = Number(metrics.leads) || 0;
  const messages = Number(metrics.messages) || 0;
  const purchases = Number(metrics.purchases) || 0;
  const purchaseValue = Number(metrics.purchaseValue) || 0;
  if (actionCode === 'zero_leads') return used >= ZERO_SPEND && leads === 0;
  if (actionCode === 'zero_msgs') return used >= ZERO_SPEND && messages === 0;
  if (actionCode === 'zero_vendas') return used >= ZERO_SPEND && purchases === 0;
  if (actionCode === 'roas_irreal') {
    const roas = used > 0 ? purchaseValue / used : 0;
    return purchases > 0 && roas >= ROAS_CRAZY && used >= ROAS_SPEND;
  }
  if (actionCode === 'engajamento_sem_resultado') {
    return (
      (objectiveKey === 'engajamento' || used >= ENGAGE_SPEND) &&
      used >= ZERO_SPEND &&
      leads === 0 &&
      messages === 0 &&
      purchases === 0
    );
  }
  return false;
}
