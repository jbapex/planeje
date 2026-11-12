/**
 * Testes dos extractors e colunas personalizáveis do Painel.
 * Não conecta no banco nem na Meta API.
 */
import {
  DEFAULT_PAINEL_COLUMNS,
  extractPainelMetrics,
  formatPainelMetricValue,
  normalizePainelColumnKeys,
  painelMetricForItem,
  PAINEL_COLUMNS,
} from '../src/lib/trafegoPainelMetrics.js';

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FALHOU:', msg);
    failed += 1;
  }
}

const mockItem = {
  objective: 'OUTCOME_ENGAGEMENT',
  campaign_objective: 'OUTCOME_ENGAGEMENT',
  insights: {
    data: [
      {
        spend: '120.50',
        impressions: '10000',
        clicks: '250',
        results: '42',
        actions: [
          { action_type: 'video_view', value: '1800' },
          { action_type: 'messaging_conversation_started', value: '15' },
          { action_type: 'click_to_call', value: '3' },
          { action_type: 'lead', value: '8' },
          { action_type: 'purchase', value: '2' },
          { action_type: 'profile_visit', value: '55' },
          { action_type: 'follow', value: '12' },
        ],
        action_values: [{ action_type: 'purchase', value: '450.00' }],
      },
    ],
  },
};

const metrics = extractPainelMetrics(mockItem);
assert(metrics.spend === 120.5, 'gasto parseado');
assert(metrics.videoViews === 1800, 'VV soma video_view');
assert(metrics.conversations === 15, 'conversas iniciadas');
assert(metrics.contacts === 3, 'contatos iniciados');
assert(metrics.leads === 8, 'leads');
assert(metrics.purchases === 2, 'compras');
assert(metrics.purchaseValue === 450, 'valor da compra');
assert(metrics.profileVisits === 55, 'visitas perfil via action');
const directProfile = extractPainelMetrics({
  insights: { data: [{ spend: '10', instagram_profile_visits: '88', actions: [] }] },
});
assert(directProfile.profileVisits === 88, 'visitas perfil via campo instagram_profile_visits');

const fromResults = extractPainelMetrics({
  optimization_goal: 'PROFILE_VISIT',
  insights: { data: [{ spend: '20', results: '33', actions: [] }] },
});
assert(fromResults.profileVisits === 33, 'visitas perfil via results + optimization_goal');
assert(metrics.followers === 12, 'seguidores');
assert(metrics.metaResults === 42, 'resultado Meta');
assert(Math.abs(metrics.costPerConversation - 120.5 / 15) < 0.01, 'custo por conversa');
assert(Math.abs(metrics.costPerLead - 120.5 / 8) < 0.01, 'custo por lead');
assert(Math.abs(metrics.ctr - 2.5) < 0.01, 'CTR calculado');

assert(formatPainelMetricValue('gasto', metrics).includes('120'), 'formata gasto');
assert(formatPainelMetricValue('vv', metrics) === '1.800', 'formata VV pt-BR');
assert(formatPainelMetricValue('conversas', metrics) === '15', 'formata conversas');
assert(formatPainelMetricValue('custo_conversa', metrics).includes('8'), 'formata custo/conversa');
assert(formatPainelMetricValue('valor_compra', metrics).includes('450'), 'formata valor da compra');
assert(formatPainelMetricValue('vv', { ...metrics, videoViews: 0 }) === '—', 'zero vira traço');

assert(
  painelMetricForItem('resultado_resumo', mockItem, mockItem.objective).length > 0,
  'resultado resumido usa entityResultLine'
);

const normalized = normalizePainelColumnKeys(['gasto', 'vv', 'ligado']);
assert(normalized[0] === 'ligado', 'colunas fixas primeiro');
assert(normalized[1] === 'nome', 'nome fixo em segundo');
assert(normalized.includes('vv'), 'mantém colunas escolhidas');

const defaults = normalizePainelColumnKeys([]);
assert(defaults.length >= DEFAULT_PAINEL_COLUMNS.length, 'fallback para defaults');
for (const key of DEFAULT_PAINEL_COLUMNS) {
  assert(defaults.includes(key), `default inclui ${key}`);
}

assert(PAINEL_COLUMNS.every((c) => c.key && c.label && c.group), 'catálogo completo');

if (failed) {
  console.error(`\n${failed} teste(s) falharam.`);
  process.exit(1);
}
console.log('OK — trafegoPainelMetrics e colunas do Painel');
