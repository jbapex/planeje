import assert from 'node:assert/strict';
import { origemDoContato, miniCrmOriginBadge, miniCrmOriginBucket, rowFromContact } from '../src/lib/miniCrm.js';
import { buildLeadFicha } from '../src/lib/rastreamentoLeadFicha.js';

let passed = 0;
function check(contact, label, bucket, tone) {
  const before = JSON.stringify(contact);
  assert.equal(origemDoContato(contact), label);
  assert.equal(rowFromContact(contact).origem, label);
  assert.equal(miniCrmOriginBucket(contact), bucket);
  assert.equal(miniCrmOriginBadge(label).label, tone === 'meta' ? 'Meta Ads' : label);
  assert.equal(miniCrmOriginBadge(label).tone, tone);
  assert.equal(JSON.stringify(contact), before, 'presentation cannot mutate stored attribution');
  passed += 1;
}

const link = { origin_source: 'site', utm_source: 'Linktree', utm_medium: 'clique', utm_campaign: 'visitas_ao_perfil', tracking_data: { planeje_link_id: 'example', planeje_link_match_method: 'initial_message' } };
check(link, 'Meta Link', 'outras', 'site');
check({ ...link, utm_source: '  LINKTREE  ' }, 'Meta Link', 'outras', 'site');
check({ ...link, utm_source: null, tracking_data: { ...link.tracking_data, utm_source: ' Linktree ' } }, 'Meta Link', 'outras', 'site');
check({ ...link, origin_source: 'meta_ads' }, 'Meta Link', 'outras', 'site');
check({ ...link, utm_source: 'Newsletter' }, 'Newsletter', 'outras', 'site');
check({ ...link, utm_source: 'Instagram' }, 'Instagram', 'outras', 'site');
check({ origin_source: 'nao_identificado', utm_source: ' Parceiro local ' }, 'Parceiro local', 'outras', 'site');
check({ origin_source: 'nao_identificado', utm_source: ' ', tracking_data: { utm_source: 'Indicação' } }, 'Indicação', 'outras', 'site');
check({ origin_source: 'nao_identificado', utm_source: { invalid: true } }, 'Não rastreada', 'off', 'off');
check({ origin_source: 'nao_identificado', utm_campaign: 'visitas_ao_perfil' }, 'Não rastreada', 'off', 'off');
check({ origin_source: 'nao_identificado', utm_source: ' ' }, 'Não rastreada', 'off', 'off');
check({ origin_source: 'meta_ads', utm_source: 'Linktree', tracking_data: { ctwaClid: 'real-click' } }, 'Meta Ads via Campanha de Mensagem', 'meta', 'meta');
check({ origin_source: 'meta_ads', utm_source: 'Linktree', tracking_data: { planeje_link_id: 'example', ctwa_clid: 'real-click' } }, 'Meta Ads via Campanha de Mensagem', 'meta', 'meta');
check({ origin_source: 'meta_ads', tracking_data: { trackable_link_id: 'legacy' } }, 'Meta Ads via Link Rastreável', 'meta', 'meta');
check({ origin_source: 'google_ads', utm_source: 'Linktree' }, 'Google Ads', 'outras', 'google');
check({ origin_source: 'nao_identificado', tracking_data: { sheet_origem: 'Indicação da planilha' } }, 'Indicação da planilha', 'off', 'site');
check({ ...link, tracking_data: { ...link.tracking_data, sheet_origem: 'Origem importada' } }, 'Origem importada', 'outras', 'site');

const ficha = buildLeadFicha({ contact: link });
assert.equal(ficha.origin, 'Linktree', 'shared tracking ficha keeps its existing interpretation');
assert.equal(ficha.showCapiJourney, false);
assert.equal(ficha.showCreative, false);
assert.ok(JSON.stringify(ficha).includes('clique individual não identificado'));
assert.equal(miniCrmOriginBadge('Instagram Orgânico').label, 'Instagram Orgânico');
assert.equal(miniCrmOriginBadge('Google Meu Negócio').label, 'Google Meu Negócio');
console.log(`Mini CRM origins: ${passed} scenarios passed; UTMs, mutation guard, CAPI and shared ficha preserved.`);
