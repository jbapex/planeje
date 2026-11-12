/**
 * Fase 3: próxima ação, qualidade e rascunho de escrita na Meta.
 * Não conecta no banco.
 */
import {
  classifyDeliveryIssue,
  classifyQuality,
  nextActionForAccount,
  qualityFromSnapshot,
} from '../src/lib/trafegoProximaAcao.js';
import { buildFazerAgoraQueue } from '../src/lib/trafegoFazerAgora.js';
import { briefingLook } from '../src/lib/centralTrafegoCheckup.js';
import {
  adsLook,
  adsetIsOn,
  buildBudgetDraft,
  buildStatusDraft,
  confirmAdsetWrite,
  deliveryBlockers,
  listAds,
  parseBudgetReais,
  readAdsetBudget,
} from '../src/lib/metaAdsetWrite.js';

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FALHOU:', msg);
    failed += 1;
  }
}

assert(classifyDeliveryIssue({ alert: 'Limite de gastos atingido.' }) === 'limite', 'limite');
assert(classifyDeliveryIssue({ alert: 'Erro no pagamento' }) === 'pagamento', 'pagamento');
assert(classifyDeliveryIssue({ alert: 'Dados da Meta indisponíveis' }) === 'meta_off', 'meta off');
assert(classifyDeliveryIssue({ alert: 'Nada veiculando' }) == null, 'idle não é ação');

const lali = classifyQuality({
  spend: 208,
  purchases: 62,
  purchaseValue: 16000,
  byObjective: { compras: { spend: 208 } },
});
assert(lali?.code === 'roas_irreal', `Lali ROAS irreal, veio ${lali?.code}`);

const jr = classifyQuality({
  spend: 1845,
  leads: 0,
  messages: 0,
  purchases: 0,
  byObjective: { engajamento: { spend: 1800 } },
});
assert(jr?.code === 'engajamento_sem_resultado', `JR CAR engajamento sem resultado, veio ${jr?.code}`);

const jrGoal = classifyQuality({
  spend: 1856,
  leads: 0,
  messages: 0,
  purchases: 0,
  inferredGoal: 'engajamento',
});
assert(jrGoal?.code === 'engajamento_sem_resultado', 'JR CAR pelo objetivo inferido');

const annah = classifyQuality({
  spend: 120,
  leads: 0,
  byObjective: { leads: { spend: 120 } },
});
assert(annah?.code === 'zero_leads', 'Annah 0 leads');

const ok = classifyQuality({
  spend: 40,
  leads: 0,
  byObjective: { leads: { spend: 40 } },
});
assert(ok == null, 'gasto baixo não grita qualidade');

assert(
  qualityFromSnapshot({ permError: true, spend: 0 }) == null,
  'snapshot sem permissão não vira qualidade'
);

const lovatoAction = nextActionForAccount({
  brief: { alert: 'Limite de gastos atingido.', alertKind: 'issue' },
});
assert(lovatoAction?.code === 'limite', 'Lovato próxima ação é cobrar limite');
assert(lovatoAction.demandType === 'orcamento', 'demanda de limite é orçamento');

const queue = buildFazerAgoraQueue({
  dayRows: [
    {
      client: { id: 'lali', empresa: 'Lali Pizzaria' },
      alert: null,
      delivering: 2,
      spend: 208,
      quality: lali,
      totals: { spend: 208, purchases: 62, purchaseValue: 16000 },
    },
    {
      client: { id: 'jr', empresa: 'JR CAR' },
      alert: null,
      delivering: 13,
      spend: 1845,
      quality: jr,
    },
    {
      client: { id: 'lovato', empresa: 'Lovato' },
      alert: 'Nada veiculando',
      alertKind: 'idle',
      spend: 0,
    },
  ],
  weekRows: [
    {
      client: { id: 'lovato', empresa: 'Lovato' },
      alert: 'Limite de gastos atingido.',
      alertKind: 'issue',
      issueLabels: ['Limite de gastos atingido.'],
    },
  ],
  checkupRows: [],
  atrasadas: [],
  vencemHoje: [],
});

assert(queue.some((i) => i.clientId === 'lali' && i.action?.code === 'roas_irreal'), 'Lali na fila por pixel');
assert(queue.some((i) => i.clientId === 'jr' && i.action?.code === 'engajamento_sem_resultado'), 'JR na fila por objetivo');
assert(queue.some((i) => i.clientId === 'lovato' && i.action?.code === 'limite'), 'Lovato na fila por limite');
assert(queue.filter((i) => i.clientId === 'lovato').length === 1, 'uma ação por conta');

const look = briefingLook({ client_id: 'lali', problems: [] }, {
  delivering: 2,
  alert: null,
  quality: lali,
});
assert(look.tone === 'alert' && look.ready === true, 'ROAS irreal impede visto OK');

const adset = { id: '12345678901', name: 'Leads SP', status: 'ACTIVE', daily_budget: 8000 };
assert(adsetIsOn(adset), 'conjunto ligado');
assert(readAdsetBudget(adset).reais === 80, 'verba diária em reais');
assert(parseBudgetReais('90,5') === 9050, 'parse 90,5');
assert(parseBudgetReais('0,5') == null, 'abaixo de 1 real');

const statusDraft = buildStatusDraft({ clientName: 'JR CAR', adset });
const statusCopy = confirmAdsetWrite(statusDraft);
assert(statusCopy.valid && statusCopy.payload.status === 'PAUSED', 'confirmar pausa');
assert(statusCopy.payload.writes?.[0]?.level === 'adset', 'write principal é o conjunto');
assert(statusCopy.summary.includes('JR CAR'), 'confirmação cita o cliente');

const campOff = deliveryBlockers({
  campaign: { status: 'PAUSED' },
  adset: { status: 'PAUSED', ads: [{ id: '1', status: 'PAUSED' }] },
  turningOn: true,
});
assert(campOff.some((b) => b.code === 'campaign_off'), 'campanha desligada barra o conjunto');
assert(campOff.some((b) => b.code === 'ads_off'), 'anúncio desligado barra o conjunto');
assert(listAds({ ads: { data: [{ id: '9', status: 'ACTIVE' }, { id: '8', effective_status: 'DELETED' }] } }).length === 1, 'ignora anúncio excluído');
assert(adsLook([{ status: 'ACTIVE' }, { status: 'PAUSED' }]).on === 1, 'conta anúncios ligados');

const turnOn = buildStatusDraft({
  clientName: 'JR CAR',
  adset: { id: '222', name: 'CJ01', status: 'PAUSED', ads: [{ id: '333', status: 'PAUSED' }] },
  campaign: { id: '111', name: 'Campanha Honda', status: 'PAUSED' },
});
const withAlso = confirmAdsetWrite(turnOn, '', { campaign: true, ads: true });
assert(withAlso.payload.writes.length === 3, 'liga conjunto + campanha + anúncio');
assert(withAlso.payload.writes.some((w) => w.level === 'campaign' && w.objectId === '111'), 'inclui a campanha');
assert(withAlso.blockers.length === 2, 'mostra os dois bloqueios');

const campDraft = buildStatusDraft({
  clientName: 'JR CAR',
  entity: { id: '111', name: 'Campanha Honda', status: 'ACTIVE' },
  level: 'campaign',
});
assert(confirmAdsetWrite(campDraft).title.includes('campanha'), 'pausa a campanha');

const budgetDraft = buildBudgetDraft({ clientName: 'JR CAR', adset });
const badBudget = confirmAdsetWrite(budgetDraft, '');
assert(badBudget.valid === false, 'verba vazia não confirma');
const goodBudget = confirmAdsetWrite(budgetDraft, '100');
assert(goodBudget.valid && goodBudget.payload.daily_budget === 10000, 'verba vira centavos');

if (failed) {
  console.error(`${failed} teste(s) falharam`);
  process.exit(1);
}
console.log('OK: fase 3 ação / qualidade / escrita');
