/**
 * Fase 5 · Central 10/10
 * Corte 1–4: anúncio com insights, fila honesta, qualidade 7d, barra.
 * Não conecta no banco / não importa módulos com alias @/.
 */
import { buildFazerAgoraQueue, gestorAccountChip } from '../src/lib/trafegoFazerAgora.js';
import { classifyQuality, nextActionForAccount, NEXT_ACTIONS } from '../src/lib/trafegoProximaAcao.js';
import { clientHealth, formatMoney, normalizeAccountInsights } from '../src/lib/trafegoFila.js';
import { clientVisibleInPainel, painelHref, painelPeriodForAction, periodWindowLabel } from '../src/lib/trafegoPainelHref.js';
import { shouldKeepPreviousMeta, shouldPersistMetaSnapshot } from '../src/lib/trafegoHojeCache.js';

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FALHOU:', msg);
    failed += 1;
  }
}

/** Espelho mínimo de extractEntityMetrics + entityResultLine (sem @/). */
function extractMetrics(item) {
  const raw = item?.insights?.data?.[0] || item?.insights?.[0] || item?.insights || {};
  const row = raw && !Array.isArray(raw) ? raw : {};
  return normalizeAccountInsights(row);
}

function resultLine(objective, metrics) {
  const o = String(objective || '').toUpperCase();
  let key = 'outros';
  if (o.includes('MESSAGE') || o.includes('CONVERSATION')) key = 'mensagens';
  else if (o.includes('LEAD')) key = 'leads';
  else if (o.includes('SALE') || o.includes('PURCHASE') || o.includes('CONVERSION')) key = 'compras';
  const spend = Number(metrics.spend) || 0;
  const messages = Number(metrics.messages) || 0;
  const leads = Number(metrics.leads) || 0;
  if (key === 'leads' && messages > 0 && leads === 0) key = 'mensagens';
  if (key === 'mensagens') {
    return {
      key,
      line: messages > 0
        ? `${messages} msgs · ${formatMoney(spend / messages)}`
        : spend > 0
          ? `0 msgs · ${formatMoney(spend)}`
          : '—',
    };
  }
  if (key === 'leads') {
    return {
      key,
      line: leads > 0
        ? `${leads} leads · ${formatMoney(spend / leads)}`
        : spend > 0
          ? `0 leads · ${formatMoney(spend)}`
          : '—',
    };
  }
  return { key, line: spend > 0 ? formatMoney(spend) : '—' };
}

function soldLabel(snapshot) {
  if (snapshot.sold) return { text: `Vendeu`, tone: 'ok' };
  const buySpend = Number(snapshot.byObjective?.compras?.spend) || 0;
  const buyActive = Number(snapshot.byObjective?.compras?.active) || 0;
  if (buySpend <= 0 && buyActive <= 0 && snapshot.inferredGoal !== 'compras') {
    return { text: '', tone: 'muted' };
  }
  return { text: 'Não vendeu', tone: 'danger' };
}

// —— Corte 1: métricas no anúncio ——
const adWithInsights = {
  id: 'ad1',
  insights: {
    data: [
      {
        spend: '120.50',
        impressions: '10000',
        clicks: '250',
        actions: [{ action_type: 'lead', value: '3' }],
      },
    ],
  },
};
const adMetrics = extractMetrics(adWithInsights);
assert(adMetrics.spend === 120.5, `gasto do anúncio: ${adMetrics.spend}`);
assert(adMetrics.clicks === 250, 'cliques do anúncio');
const adLine = resultLine('OUTCOME_LEADS', adMetrics);
assert(adLine.line.includes('leads'), `linha do anúncio: ${adLine.line}`);
assert(adLine.line !== '—', 'linha do anúncio não vazia');

// —— Corte 2: fila só Meta dura ——
const anaJulia = {
  client: { id: 'ana', empresa: 'Ana Júlia' },
  alert: null,
  delivering: 3,
  spend: 40,
  quality: null,
  totals: { spend: 40, leads: 2, byObjective: { leads: { spend: 40 } } },
};
const lovato = {
  client: { id: 'lovato', empresa: 'Lovato' },
  alert: 'Limite de gastos atingido.',
  alertKind: 'issue',
  spend: 0,
};
const nelatto = {
  client: { id: 'nelatto', empresa: 'Nelatto' },
  alert: 'Erro no pagamento',
  alertKind: 'issue',
  spend: 0,
};
const casaGeffer = {
  client: { id: 'geffer', empresa: 'Casa Geffer' },
  alert: null,
  quality: { code: 'zero_leads', spend: 935 },
  totals: { spend: 935, leads: 0, byObjective: { leads: { spend: 935 } } },
};
const rioSul = {
  client: { id: 'rio', empresa: 'Rio Sul' },
  alert: null,
  quality: { code: 'zero_msgs', spend: 120 },
  totals: { spend: 120, messages: 0, byObjective: { mensagens: { spend: 120 } } },
};

const queue = buildFazerAgoraQueue({
  dayRows: [anaJulia, lovato, nelatto, casaGeffer, rioSul],
  weekRows: [],
  checkupRows: [{ client_id: 'ana', empresa: 'Ana Júlia', problems: [{ code: 'next_action_overdue' }] }],
  atrasadas: [],
  vencemHoje: [],
});
assert(!queue.some((i) => i.clientId === 'ana'), 'Ana Júlia saudável fora da fila');
assert(queue.some((i) => i.clientId === 'lovato' && i.action?.code === 'limite'), 'Lovato na fila');
assert(queue.some((i) => i.clientId === 'nelatto' && i.action?.code === 'pagamento'), 'Nelatto na fila');
assert(queue.some((i) => i.clientId === 'geffer' && i.action?.code === 'zero_leads'), 'Casa Geffer na fila');
assert(queue.some((i) => i.clientId === 'rio' && i.action?.code === 'zero_msgs'), 'Rio Sul na fila');
assert(
  !queue.some((i) => String(i.reason || '').includes('conjuntos no ar')),
  'texto do card não é “N conjuntos no ar”'
);
assert(queue.every((i) => i.kind === 'demand' || i.action?.code), 'todo item Meta tem acao');

const queueComDemanda = buildFazerAgoraQueue({
  dayRows: [
    {
      client: { id: 'lali', empresa: 'Lali' },
      quality: { code: 'roas_irreal', roas: 56.8, purchases: 136 },
      totals: { spend: 208, purchases: 136, purchaseValue: 11827 },
    },
  ],
  weekRows: [],
  atrasadas: [],
  vencemHoje: [
    {
      id: 'task-lali',
      client_id: 'lali',
      client_empresa: 'Lali Pizzaria',
      title: 'Conferir pixel / evento de compra',
      due_date: '2026-09-01',
      priority: 'medium',
    },
  ],
});
assert(queueComDemanda.length === 1, `só demanda quando já criou: ${queueComDemanda.length}`);
assert(queueComDemanda[0].kind === 'demand', 'item restante é demanda');
assert(queueComDemanda[0].action?.code === 'roas_irreal', 'aviso da Meta cola na demanda');

const queueDuroComDemanda = buildFazerAgoraQueue({
  dayRows: [
    {
      client: { id: 'dinamac', empresa: 'Dinamac' },
      alert: 'Dados da Meta indisponíveis',
      alertKind: 'error',
    },
  ],
  atrasadas: [
    {
      id: 'task-din',
      client_id: 'dinamac',
      client_empresa: 'Dinamac',
      title: 'Ajuste interno',
      due_date: '2026-09-14',
    },
  ],
});
assert(
  queueDuroComDemanda.length === 1,
  `duro+demanda é um cartão: ${queueDuroComDemanda.length}`
);
assert(
  queueDuroComDemanda[0].kind === 'demand' && queueDuroComDemanda[0].clientId === 'dinamac',
  'demanda atrasada continua'
);
assert(
  queueDuroComDemanda[0].action?.code === 'meta_off',
  'aviso da Meta cola na demanda, não vira segundo cartão'
);

const queueTeto = buildFazerAgoraQueue({
  dayRows: [
    {
      client: { id: 'jr', empresa: 'JR CAR', limite_meta: 1500 },
      spend: 1623,
      totals: { spend: 1623, leads: 2, byObjective: { engajamento: { spend: 1623 } } },
    },
  ],
});
assert(
  queueTeto.some((i) => i.clientId === 'jr' && i.action?.title === 'Acima do teto'),
  'teto da ficha entra na fila'
);

const queueTetoMes = buildFazerAgoraQueue({
  dayRows: [
    {
      client: { id: 'jr2', empresa: 'JR CAR', limite_meta: 1500, meta_resumo: { spend: 1623 } },
      spend: 40,
      totals: { spend: 40 },
    },
  ],
});
assert(
  queueTetoMes.some((i) => i.clientId === 'jr2' && i.action?.title === 'Acima do teto'),
  'teto usa gasto do mês no snapshot se o dia for baixo'
);

const dinChip = gestorAccountChip({
  nextAction: { tone: 'issue', title: 'Vincular a Meta' },
  overdueDays: -5,
  noAr: false,
  activeCount: 0,
});
assert(dinChip.chip === 'Vincular a Meta', `chip Dinamac: ${dinChip.chip}`);
assert(dinChip.tone === 'overdue', 'chip duro é overdue');

const laliChip = gestorAccountChip({
  nextAction: { tone: 'warn', title: 'Conferir pixel' },
  overdueDays: null,
  noAr: true,
  activeCount: 6,
});
assert(laliChip.chip === 'Conferir pixel', `chip Lali: ${laliChip.chip}`);

function shiftYmd(ymd, days) {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
const today = '2026-09-01';
const week = { since: shiftYmd(today, -7), until: shiftYmd(today, -1) };
assert(week.since === '2026-08-25', `7d since: ${week.since}`);
assert(week.until === '2026-08-31', `7d until: ${week.until}`);

const href = painelHref('geffer', { period: week, actionCode: 'zero_leads' });
assert(href.includes('acao=zero_leads'), `href com acao: ${href}`);
assert(href.includes('from=2026-08-25') && href.includes('to=2026-08-31'), `href 7d: ${href}`);

const hrefTeto = painelHref('jr', { period: week, actionCode: 'limite' });
assert(hrefTeto.includes('periodo=mes'), `teto abre o mês: ${hrefTeto}`);
assert(!hrefTeto.includes('from='), `teto não herda 7d: ${hrefTeto}`);
assert(painelPeriodForAction('limite', week).periodo === 'mes', 'limite → mês');
assert(periodWindowLabel('mes') === 'este mês', 'janela do mês');
assert(periodWindowLabel('7d') === 'últimos 7 dias', 'janela 7d');
assert(periodWindowLabel('hoje') === 'hoje', 'janela hoje');
assert(clientVisibleInPainel({ anyCount: 1 }), 'conta desligada entra no Painel');
assert(clientVisibleInPainel({ hasOps: true }), 'ops sem conta entra no Painel');
assert(!clientVisibleInPainel({}), 'cliente sem Meta e sem ops fica fora');

const chipFromMeta = gestorAccountChip({
  nextAction: nextActionForAccount({
    snapshot: null,
    brief: { alert: 'Ainda não há snapshot desta conta.' },
  }),
  overdueDays: -5,
});
assert(chipFromMeta.chip === 'Vincular a Meta', `chip sem snapshot: ${chipFromMeta.chip}`);

// —— Corte 3 ——
const annahLine = resultLine('OUTCOME_LEADS', { spend: 601, leads: 0, messages: 12 });
assert(annahLine.key === 'mensagens', `Annah key msgs, veio ${annahLine.key}`);
assert(annahLine.line.includes('msgs'), `Annah linha: ${annahLine.line}`);
assert(!annahLine.line.includes('0 leads'), 'Annah não mostra 0 leads');

const annahQuality = classifyQuality({
  spend: 601,
  leads: 0,
  messages: 12,
  byObjective: { leads: { spend: 601 } },
});
assert(annahQuality == null, 'Annah com msgs não vira zero_leads');

const laliWeek = classifyQuality({
  spend: 208,
  purchases: 62,
  purchaseValue: 16000,
  byObjective: { compras: { spend: 208 } },
});
assert(laliWeek?.code === 'roas_irreal', 'Lali ROAS irreal nos 7d');

const soldQuiet = soldLabel({
  sold: false,
  inferredGoal: 'mensagens',
  byObjective: { mensagens: { spend: 100 } },
});
assert(!soldQuiet.text, `sold some sem compras: "${soldQuiet.text}"`);

const health = clientHealth(
  { objetivo_meta: 'mensagens', meta_custo_mensagem: 15 },
  { spend: 300, messages: 10, leads: 0, purchases: 0, purchaseValue: 0 }
);
assert(health.resultStatus === 'critico', `meta da ficha fora: ${health.label}`);
assert(String(health.label).includes('Fora'), `rótulo fora: ${health.label}`);

const healthSem = clientHealth(
  { objetivo_meta: '' },
  { spend: 100, messages: 2, leads: 0, purchases: 0, purchaseValue: 0 }
);
assert(healthSem.label === 'Sem meta' || healthSem.resultStatus === 'sem_meta', `sem cadastro: ${healthSem.label}`);

const merged = { client: { id: 'lali' }, quality: laliWeek };
const laliAction = nextActionForAccount({ brief: merged });
assert(laliAction?.code === 'roas_irreal', 'Lali entra na fila via 7d');
assert(NEXT_ACTIONS.roas_irreal.title === 'Conferir pixel', 'ação pixel');
assert(String(NEXT_ACTIONS.roas_irreal.gestorDo || '').includes('Painel'), 'pixel diz o que fazer');
assert(String(NEXT_ACTIONS.pagamento.gestorDo || '').includes('Painel'), 'pagamento diz o que fazer');

const laliCard = buildFazerAgoraQueue({
  dayRows: [
    {
      client: { id: 'lali2', empresa: 'Lali Pizzaria' },
      quality: { code: 'roas_irreal', roas: 38.5, purchases: 164 },
      totals: { spend: 208, purchases: 164, purchaseValue: 8008 },
    },
  ],
  weekRows: [],
  atrasadas: [],
  vencemHoje: [],
})[0];
assert(laliCard?.action?.code === 'roas_irreal', 'Lali entra como conferir pixel');
assert(laliCard?.action?.demandType === 'rastreamento', 'pixel vira demanda de rastreamento');
assert(String(laliCard?.reason || '').includes('Painel'), `cartão do gestor: ${laliCard?.reason}`);
assert(!String(laliCard?.reason || '').startsWith('Conferir pixel —'), 'título não se repete no texto');
assert(!String(laliCard?.reason || '').includes('ROAS irreal —'), 'sem jargão de ROAS irreal');

const previousSnap = { spend: 1500, activeCount: 2, syncedAt: '2026-09-19T10:00:00.000Z' };
assert(
  shouldKeepPreviousMeta({ rateLimited: true, campaigns: [] }, previousSnap),
  'limite da API conserva a última análise'
);
assert(
  shouldKeepPreviousMeta({ rateLimited: true, campaigns: [{ id: '1' }] }, previousSnap),
  'limite com lista sem insight conserva o gasto'
);
assert(
  !shouldKeepPreviousMeta({ campaigns: [] }, previousSnap),
  'dia vazio de verdade substitui'
);
assert(
  !shouldPersistMetaSnapshot({ rateLimited: true, campaigns: [] }, previousSnap, { spend: 0, activeCount: 0 }),
  'não grava R$ 0 quando a Meta limita'
);
assert(
  shouldPersistMetaSnapshot({ campaigns: [{ id: '1' }] }, previousSnap, { spend: 80, activeCount: 1 }),
  'grava leitura boa'
);
assert(
  nextActionForAccount({
    snapshot: {
      spend: 0,
      activeCount: 0,
      errorMessage: 'A Meta limitou as chamadas desta conta. Espere um ou dois minutos e atualize.',
    },
  }) == null,
  'limite da API não vira Vincular a Meta'
);
assert(
  nextActionForAccount({
    snapshot: { permError: true, spend: 0, activeCount: 0, errorMessage: 'Sem permissão' },
  })?.code === 'meta_off',
  'sem permissão continua Vincular a Meta'
);

if (failed) {
  console.error(`${failed} teste(s) falharam`);
  process.exit(1);
}
console.log('OK fase5 — anúncio, fila, 7d, meta');
