/**
 * Testes da regra única de saúde da operação de tráfego.
 * Não conecta no banco.
 */
import {
  buildClientOperacao,
  buildExceptionQueue,
  buildOverview,
  buildTrafegoHubModel,
  flattenAlertas,
  healthLabel,
  metricDisplay,
} from '../src/lib/trafegoSaude.js';
import { TRAFEGO_PREVIEW_DATE, trafegoPreviewRawClients } from '../src/dev/trafegoPreviewFixtures.js';
import { exceptionActionPlan, unwrapMoney } from '../src/lib/trafegoAcoes.js';

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FALHOU:', msg);
    failed += 1;
  }
}

const model = buildTrafegoHubModel(trafegoPreviewRawClients(), { operationalDate: TRAFEGO_PREVIEW_DATE });
const byId = Object.fromEntries(model.clients.map((c) => [c.clientId, c]));

assert(healthLabel('ok') === 'OK', 'rótulo operacional é OK, não Saudável');
assert(!model.clients.some((c) => /saudável/i.test(c.health.label)), 'nenhuma tela usa Saudável');

assert(byId['c-apex'].health.status === 'critico', 'orçamento estourado + ação vencida = crítico');
assert(byId['c-apex'].exceptions.find((e) => e.code === 'over_budget')?.ownerName === 'Ana Costa', 'exceção leva o gestor');
assert(byId['c-apex'].exceptions.some((e) => e.code === 'next_action_overdue'), 'Apex: próxima ação vencida');

assert(byId['c-norte'].health.status === 'aguardando_cliente', 'waiting_client define saúde');
assert(byId['c-sul'].exceptions.some((e) => e.bucket === 'campanha_esperada_sem_atividade'), 'Sul: campanha esperada sem atividade');
assert(byId['c-meta-off'].health.status === 'dados_indisponiveis', 'Meta indisponível não vira zero');
assert(metricDisplay(byId['c-meta-off'].spendMonth) === 'Dados indisponíveis', 'spend indisponível ≠ 0');
assert(byId['c-ok'].health.status === 'ok', 'cliente normal = OK');
assert(byId['c-pause'].health.status === 'pausa', 'pausa planejada');
assert(
  !byId['c-no-camp'].exceptions.some((e) => e.code === 'missing_active_campaign'),
  'sem campanha esperada não gera alerta falso'
);

const alertas = flattenAlertas(model.clients);
const overviewHealth = model.overview.healthCounts;
assert(overviewHealth.critico === model.clients.filter((c) => c.health.status === 'critico').length, 'visão geral usa a mesma saúde');
assert(
  model.alertas.every((a) => model.clients.find((c) => c.clientId === a.clientId).exceptions.some((e) => e.code === a.code)),
  'alertas saem da mesma lista de exceções'
);
assert(
  (model.exceptions.critico || []).every((row) => row.health.status === 'critico' || row.bucket === 'critico'),
  'fila crítico alinhada à regra'
);
assert(
  model.alertas.find((a) => a.clientId === 'c-apex' && a.code === 'over_budget')?.health.status === 'critico',
  'alerta usa o objeto de saúde, não a string crua'
);
assert(
  model.alertas.every((a) => typeof a.health === 'object' && a.health.status && a.health.label),
  'alerta carrega objeto de saúde com rótulo'
);

const queue = buildExceptionQueue(model.clients);
const apexCodes = (queue.critico || []).filter((r) => r.clientId === 'c-apex').map((r) => r.code);
assert(new Set(apexCodes).size === apexCodes.length, 'problemas iguais não duplicam por cliente/código');

const overview = buildOverview(model.clients, { operationalDate: TRAFEGO_PREVIEW_DATE });
assert(overview.monthlySpend.available, 'investido do mês disponível quando há snapshot');
assert(overview.checkup.total >= 1, 'progresso de check-up no overview');
assert(model.checkup.expanded[0].exceptions.length > 0, 'check-up abre primeiro quem tem problema');
assert(model.checkup.compactOk.every((c) => c.health.status === 'ok'), 'check-up compacto só para OK');
assert(model.tasks.waiting.some((t) => t.waitingClient || t.demand_type === 'cobranca_material'), 'board reusa tarefas reais agrupadas');

const lonely = buildClientOperacao({
  clientId: 'x',
  empresa: 'X',
  situation: 'active',
  requireActiveCampaign: true,
  activeCampaigns: 0,
  spendMonthAvailable: false,
  snapshot: null,
  due: true,
});
assert(metricDisplay(lonely.spendMonth) === 'Dados indisponíveis', 'sem snapshot = indisponível');
assert(lonely.health.status !== 'ok' || lonely.exceptions.length > 0, 'conta sem dado não aparece como operação ok silenciosa');

assert(exceptionActionPlan({ code: 'missing_gestor' }).kind === 'conta', 'sem gestor abre a conta, não tarefa');
assert(exceptionActionPlan({ code: 'missing_gestor' }).label === 'Definir gestor', 'rótulo de definir gestor');
assert(exceptionActionPlan({ code: 'missing_active_campaign' }).secondary?.demandType === 'nova_campanha', 'campanha ausente oferece nova campanha');
assert(exceptionActionPlan({ code: 'overdue_tasks', taskId: 't-1' }).kind === 'complete', 'tarefa vencida com id conclui na Central');
assert(exceptionActionPlan({ code: 'meta_unavailable' }).kind === 'ficha', 'Meta indisponível não cria tarefa');
assert(unwrapMoney({ available: true, value: 2500 }).amount === 2500, 'orçamento do check-up (json) vira número');
assert(unwrapMoney({ available: false, value: null }).available === false, 'orçamento ausente não vira zero');

if (failed) {
  console.error(`${failed} falha(s)`);
  process.exit(1);
}
console.log('ok trafego-saude');
