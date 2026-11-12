/**
 * Fase 1: carteira do gestor, fila Fazer agora e visto do check-up.
 * Não conecta no banco.
 */
import {
  clientInGestorCarteira,
  keepCarteiraDoGestor,
  canSeeGoogleAdsTab,
  paidTrafficHomePath,
  paidTrafficNavPath,
  shouldScopeCarteiraToGestor,
} from '../src/lib/carteiraGestor.js';
import { briefingLook } from '../src/lib/centralTrafegoCheckup.js';
import { buildFazerAgoraQueue } from '../src/lib/trafegoFazerAgora.js';

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FALHOU:', msg);
    failed += 1;
  }
}

const rafael = '3b248b66-6782-4dae-b647-b50ba4332463';
const lovato = 'd41110b6-f0b4-4057-8f58-52ce9059617e';
const ops = { [lovato]: { primary_assignee_id: rafael } };

assert(shouldScopeCarteiraToGestor({ id: rafael, role: 'colaborador' }), 'colaborador filtra carteira');
assert(!shouldScopeCarteiraToGestor({ id: 'adm', role: 'admin' }), 'admin vê a carteira inteira');
assert(clientInGestorCarteira(lovato, { userId: rafael, opsByClient: ops }), 'Lovato é do Rafael');
assert(!clientInGestorCarteira(lovato, { userId: 'outro', opsByClient: ops }), 'outro gestor não vê Lovato');

const scoped = keepCarteiraDoGestor([{ id: lovato }, { id: 'x' }], {
  profile: { id: rafael, role: 'colaborador' },
  userId: rafael,
  opsByClient: ops,
});
assert(scoped.length === 1 && scoped[0].id === lovato, 'keepCarteiraDoGestor fica só na conta do gestor');

assert(paidTrafficNavPath({ role: 'colaborador' }) === '/paid-traffic/hoje', 'nav do gestor cai na Hoje');
assert(paidTrafficHomePath({ showCentral: true, profile: { role: 'colaborador' } }) === '/paid-traffic/hoje', 'home do gestor é Hoje');
assert(paidTrafficHomePath({ showCentral: false, profile: { role: 'colaborador' } }) === '/paid-traffic/dashboard', 'sem Central, home é Dashboard');
assert(canSeeGoogleAdsTab({ role: 'colaborador' }), 'gestor vê a aba Google Ads');
assert(canSeeGoogleAdsTab({ role: 'admin' }), 'admin vê a aba Google Ads');
assert(!canSeeGoogleAdsTab({ role: 'cliente' }), 'cliente não vê a aba Google Ads');

const wait = briefingLook({ client_id: lovato, problems: [] }, null, { metaLoading: true });
assert(wait.ready === false && wait.tone === 'wait', 'visto espera a Meta');

const alert = briefingLook({ client_id: lovato, problems: [] }, { alert: 'Limite de gastos atingido.' });
assert(alert.tone === 'alert' && alert.ready === true, 'alerta Meta impede OK cego');

const ok = briefingLook({ client_id: lovato, problems: [] }, { delivering: 4, alert: null });
assert(ok.tone === 'ok' && ok.ready === true, 'conta no ar libera visto');

const waitWeek = briefingLook({ client_id: lovato, problems: [] }, { delivering: 0, alert: null }, { weekLoading: true });
assert(waitWeek.ready === false && waitWeek.tone === 'wait', 'visto espera a semana na segunda');

const queue = buildFazerAgoraQueue({
  dayRows: [
    { client: { id: lovato, empresa: 'Lovato' }, alert: 'Nada veiculando', alertKind: 'idle', spend: 0 },
    { client: { id: 'jr', empresa: 'JR CAR' }, alert: null, delivering: 13, spend: 1800 },
  ],
  weekRows: [
    { client: { id: lovato, empresa: 'Lovato' }, alert: 'Limite de gastos atingido.', alertKind: 'issue', issueLabels: ['Limite de gastos atingido.'] },
  ],
  checkupRows: [{ client_id: 'rio', empresa: 'Rio Sul', problems: [{ code: 'meta_unavailable', label: 'Dados da Meta indisponíveis' }] }],
  atrasadas: [],
  vencemHoje: [{ id: 't1', client_id: 'jr', client_empresa: 'JR CAR', title: 'Ajuste' }],
});
assert(queue.some((i) => i.title === 'Lovato' && i.action?.code === 'limite'), 'Lovato entra na fila pelo alerta da semana');
assert(!queue.some((i) => i.clientId === 'rio'), 'check-up / Rio Sul não entra em Fazer agora');
assert(queue.some((i) => i.kind === 'demand' && i.id === 'demand:t1'), 'demanda de hoje entra na fila');
assert(!queue.some((i) => i.kind === 'meta' && i.clientId === 'jr'), 'JR CAR veiculando não vira alerta');

if (failed) {
  console.error(`${failed} teste(s) falharam`);
  process.exit(1);
}
console.log('OK: fase 1 da Hoje / carteira / visto');
