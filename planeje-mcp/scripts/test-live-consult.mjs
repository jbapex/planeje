import {
  clearLiveCache,
  compactMetaResumo,
  filterPainelRows,
  mergeConversa,
  painelMetrics,
  messagePreview,
  phoneCandidates,
  readLiveCache,
  shapePainelCampaigns,
  snapshotIsStale,
  writeLiveCache,
} from '../src/liveConsult.ts';

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FALHOU:', msg);
    failed += 1;
  }
}

const now = Date.parse('2026-09-30T15:00:00Z');
assert(snapshotIsStale(null, now), 'sem resumo está velho');
assert(snapshotIsStale({ syncedAt: '2026-09-30T14:40:00Z' }, now), 'resumo de 20 min está velho');
assert(!snapshotIsStale({ syncedAt: '2026-09-30T14:55:00Z' }, now), 'resumo de 5 min serve');

const compact = compactMetaResumo({
  syncedAt: '2026-09-30T14:55:00Z',
  spend: 10,
  running: [1, 2, 3, 4, 5, 6, 7, 8, 9],
});
assert(compact.spend === 10 && compact.running.length === 8, 'resumo compacto corta a lista');

assert(phoneCandidates('(11) 98888-7777').includes('5511988887777'), 'telefone ganha 55');
assert(messagePreview('  oi   tudo bem  ', '').startsWith('oi tudo bem'), 'mensagem em uma linha');

const thread = mergeConversa(
  [{ id: '1', body: 'quero orçamento', msg_timestamp: '2026-09-30T12:00:00Z', is_group: false, phone: '5511' }],
  [{ id: '2', body: 'já te chamo', created_at: '2026-09-30T12:05:00Z' }]
);
assert(thread.length === 2 && thread[0].lado === 'lead' && thread[1].lado === 'equipe', 'conversa em ordem');
assert(
  mergeConversa([{ id: 'g', body: 'grupo', is_group: true, msg_timestamp: '2026-09-30T12:00:00Z' }], []).length === 0,
  'grupo fica de fora'
);

const painel = shapePainelCampaigns([
  {
    id: 'c1',
    name: 'Noivas',
    effective_status: 'ACTIVE',
    insights: { data: [{ spend: '12.5', impressions: '100', clicks: '4', reach: '80' }] },
    adsets: {
      data: [
        {
          id: 's1',
          name: 'Conjunto A',
          status: 'ACTIVE',
          daily_budget: '2000',
          ads: { data: [{ id: 'a1', name: 'Anúncio 1', effective_status: 'ACTIVE', insights: { data: [{ spend: '3' }] } }] },
        },
      ],
    },
  },
]);
assert(painel[0].nome === 'Noivas' && painel[0].conjuntos[0].nome === 'Conjunto A', 'painel traz campanha e conjunto');
assert(painel[0].conjuntos[0].anuncios[0].nome === 'Anúncio 1', 'painel traz anúncio');
assert(painel[0].conjuntos[0].orcamento_dia === 20, 'orçamento diário sai de centavos');

const m = painelMetrics({
  spend: '100',
  impressions: '1000',
  clicks: '20',
  results: [{ indicator: 'actions:x', values: [{ value: '8' }] }],
  actions: [
    { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '8' },
    { action_type: 'purchase', value: '2' },
    { action_type: 'omni_purchase', value: '2' },
  ],
  action_values: [{ action_type: 'purchase', value: '500' }],
});
assert(m.resultados === 8 && m.custo_por_resultado === 12.5, 'resultado e custo por resultado');
assert(m.ctr === 2 && m.cpc === 5, 'CTR e CPC');
assert(m.conversas === 8 && m.compras === 2 && m.valor_compras === 500, 'compras sem contar em dobro');
assert(painelMetrics({}).custo_por_resultado === null, 'sem resultado não inventa custo');

const raw = [
  {
    id: 'c1',
    name: 'Noivas',
    adsets: { data: [{ id: 's1', name: 'Conjunto A', ads: { data: [{ id: 'a1', name: 'Vídeo' }, { id: 'a2', name: 'Foto' }] } }] },
  },
  { id: 'c2', name: 'Festa', adsets: { data: [] } },
];
assert(filterPainelRows(raw, 'festa').map((r) => r.id).join() === 'c2', 'filtra campanha pelo nome');
const soAnuncio = filterPainelRows(raw, 'a2');
assert(
  soAnuncio.length === 1 && soAnuncio[0].adsets[0].ads.length === 1 && soAnuncio[0].adsets[0].ads[0].id === 'a2',
  'filtra anúncio pelo id e mantém o caminho'
);
assert(filterPainelRows(raw, '').length === 2, 'sem filtro devolve tudo');

clearLiveCache();
assert(readLiveCache('k') === null, 'cache vazio');
writeLiveCache('k', { ok: 1 }, now);
assert(readLiveCache('k', false, now + 1000)?.ok === 1, 'cache recente vale');
assert(readLiveCache('k', true, now + 1000) === null, 'atualizar ignora o cache');

if (failed) {
  console.error(`${failed} teste(s) falharam`);
  process.exit(1);
}
console.log('OK consulta ao vivo');
