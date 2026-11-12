import assert from 'node:assert/strict';
import { test } from 'node:test';
import { maskRoutineText, selectRoutineLeads } from '../../src/lib/gestorIaRoutine.js';

const row = { id: 'row-a', platform: 'meta', account_id: 'act_700', campaign_id: '10001', campaign_name: 'Campanha sintética', adset_id: '20001', adset_name: 'Conjunto sintético' };
const options = { clientId: 'client-a', weekStart: '2026-11-09', rows: [row] };
const contact = (id, tracking = {}, patch = {}) => ({
  id, cliente_id: 'client-a', sender_name: 'Contato sintético', origin_source: 'meta_ads', first_seen_at: '2026-11-10T14:00:00Z',
  tracking_data: tracking, mini_crm: {}, ...patch,
});
const ids = { account_id: '700', campaign_id: '10001', adset_id: '20001' };
const names = { campaign_name: 'Campanha sintética', adset_name: 'Conjunto sintético' };

test('IDs exatos retornam identidade canônica limitada e método id', () => {
  const result = selectRoutineLeads([contact('exact', { meta_ad_details: { ad: {
    id: '30001', account_id: 'act_700', name: 'Anúncio sintético', campaign: { id: '10001', name: 'Campanha sintética' },
    adset: { id: '20001', name: 'Conjunto sintético' }, raw_payload: { secret: 'nunca exportar' },
  } }, body: 'nunca exportar' })], options);
  assert.equal(result.leads.length, 1);
  assert.equal(result.leads[0].routineMatchMethod, 'id');
  assert.deepEqual(result.leads[0].routineOrigin, { ...ids, ...names, ad_name: 'Anúncio sintético' });
  assert.equal(result.leads[0].routineCohort, 'novo');
  assert.equal(JSON.stringify(result).includes('nunca exportar'), false);
});

test('IDs globais de campanha e conjunto casam sem conta somente com par único', () => {
  const result = selectRoutineLeads([contact('no-account', { campaign_id: '10001', adset_id: '20001' })], options);
  assert.deepEqual(result.leads.map((lead) => lead.id), ['no-account']);
  assert.equal(result.leads[0].routineMatchMethod, 'id');
  assert.equal(result.leads[0].routineOrigin.account_id, '700');
});

test('IDs globais não autorizam escolher conta quando o universo contradiz a identidade', () => {
  const result = selectRoutineLeads([contact('ambiguous-ids', { campaign_id: '10001', adset_id: '20001' })], {
    ...options, allRows: [row, { ...row, id: 'conflicting-account', account_id: '701' }],
  });
  assert.equal(result.leads.length, 0);
  assert.deepEqual(result.unmatchedLeads.map((lead) => lead.id), ['ambiguous-ids']);
});

test('par de nomes usa normalização compartilhada e informa vínculo por nome', () => {
  const result = selectRoutineLeads([contact('by-name', { account_id: 'act_700',
    meta_ad_details: { ad: { campaign: { name: '  CAMPÁNHA   SINTÉTICA ' }, adset: { name: ' CONJUNTO   SINTÉTICO ' } } },
  })], options);
  assert.deepEqual(result.leads.map((lead) => lead.id), ['by-name']);
  assert.equal(result.leads[0].routineMatchMethod, 'name');
  assert.deepEqual(result.leads[0].routineOrigin, { ...ids, ...names, ad_name: '' });
  assert.equal(result.unattributed, 0);
});

test('fallback por nomes sem conta exige identidade única no universo inteiro', () => {
  const otherAccount = { ...row, id: 'row-b', account_id: 'act_701', campaign_id: '10002', adset_id: '20002' };
  const result = selectRoutineLeads([contact('ambiguous', names)], { ...options, allRows: [row, otherAccount] });
  assert.equal(result.leads.length, 0);
  assert.deepEqual(result.unmatchedLeads.map((lead) => lead.id), ['ambiguous']);
  assert.equal(result.unmatchedLeads[0].routineMatchMethod, null);
  assert.equal(result.unattributed, 1);
});

test('conta disponível resolve nomes iguais de contas distintas sem depender da seleção', () => {
  const otherAccount = { ...row, id: 'row-b', account_id: 'act_701', campaign_id: '10002', adset_id: '20002' };
  const contacts = [contact('from-a', { ...names, account_id: '700' }), contact('from-b', { ...names, account_id: '701' })];
  const result = selectRoutineLeads(contacts, { ...options, allRows: [row, otherAccount] });
  assert.deepEqual(result.leads.map((lead) => lead.id), ['from-a']);
  assert.equal(result.unmatchedLeads.length, 0);
});

test('linhas repetidas da mesma identidade não tornam o vínculo ambíguo', () => {
  const result = selectRoutineLeads([contact('same-origin', names)], { ...options, allRows: [row, { ...row, id: 'duplicate' }] });
  assert.deepEqual(result.leads.map((lead) => lead.id), ['same-origin']);
  assert.equal(result.leads[0].routineMatchMethod, 'name');
});

test('ID parcial não contraditório pode completar par de nomes inequívoco', () => {
  const result = selectRoutineLeads([contact('partial', { ...names, campaign_id: '10001' })], options);
  assert.deepEqual(result.leads.map((lead) => lead.id), ['partial']);
  assert.equal(result.leads[0].routineMatchMethod, 'name');
});

test('ID contraditório bloqueia fallback mesmo com nomes exatos', () => {
  const contacts = [
    contact('campaign-conflict', { ...names, campaign_id: 'wrong-campaign' }),
    contact('adset-conflict', { ...names, adset_id: 'wrong-adset' }),
    contact('account-conflict', { ...names, account_id: '701' }),
  ];
  const result = selectRoutineLeads(contacts, options);
  assert.equal(result.leads.length, 0);
  assert.deepEqual(result.unmatchedLeads.map((lead) => lead.id), ['campaign-conflict', 'adset-conflict', 'account-conflict']);
  assert.ok(result.unmatchedLeads.every((lead) => lead.routineMatchMethod === null));
});

test('IDs contraditórios entre detalhe e tracking não escolhem silenciosamente o primeiro', () => {
  const result = selectRoutineLeads([contact('nested-conflict', { ...ids, campaign_id: 'wrong-campaign', meta_ad_details: { ad: {
    account_id: '700', campaign: { id: '10001', name: names.campaign_name }, adset: { id: '20001', name: names.adset_name },
  } } })], options);
  assert.equal(result.leads.length, 0);
  assert.deepEqual(result.unmatchedLeads.map((lead) => lead.id), ['nested-conflict']);
});

test('nome sem conjunto não comprova atribuição', () => {
  const result = selectRoutineLeads([contact('only-campaign', { account_id: '700', campaign_name: names.campaign_name })], options);
  assert.equal(result.leads.length, 0);
  assert.deepEqual(result.unmatchedLeads.map((lead) => lead.id), ['only-campaign']);
});

test('Google e origem manual mantêm separação apesar de nomes e IDs Meta iguais', () => {
  const result = selectRoutineLeads([
    contact('google', { ...ids, ...names }, { origin_source: 'google_ads' }),
    contact('manual', { ...ids, ...names }, { origin_source: 'site' }),
  ], options);
  assert.equal(result.leads.length, 0);
  assert.deepEqual(result.unmatchedLeads.map((lead) => lead.id), ['google', 'manual']);
  assert.ok(result.unmatchedLeads.every((lead) => lead.routineMatchMethod === null));
  assert.equal(result.unattributed, 0);
});

test('nomes de anúncio, campanha e conjunto saem mascarados sem dados livres', () => {
  const syntheticPhone = '5511987654321';
  const namedRow = { ...row, campaign_name: `Campanha ${syntheticPhone}`, adset_name: `Conjunto ${syntheticPhone}` };
  const result = selectRoutineLeads([contact('private', { ...ids, campaign_name: namedRow.campaign_name, adset_name: namedRow.adset_name,
    meta_ad_details: { ad: { name: `Anúncio ${syntheticPhone}` } }, raw_phone: syntheticPhone,
  })], { ...options, rows: [namedRow] });
  assert.equal(result.leads.length, 1);
  assert.equal(JSON.stringify(result).includes(syntheticPhone), false);
  assert.deepEqual(result.leads[0].routineOrigin, { ...ids, campaign_name: 'Campanha •••• 4321', adset_name: 'Conjunto •••• 4321', ad_name: 'Anúncio •••• 4321' });
});

test('vínculo por nome com telefone é igual para contato cru e projetado pela máscara SQL', () => {
  const namedRow = { ...row, campaign_name: 'Campanha 5511987654321', adset_name: 'Conjunto 5511987654321' };
  for (const projected of [false, true]) {
    const result = selectRoutineLeads([contact('phone-name', { account_id: '700',
      campaign_name: projected ? maskRoutineText(namedRow.campaign_name) : namedRow.campaign_name,
      adset_name: projected ? maskRoutineText(namedRow.adset_name) : namedRow.adset_name,
    })], { ...options, rows: [namedRow], originCatalog: [] });
    assert.deepEqual(result.leads.map((lead) => lead.id), ['phone-name']);
    assert.equal(result.leads[0].routineMatchMethod, 'name');
    assert.equal(JSON.stringify(result).includes('5511987654321'), false);
  }
});

test('colisão de nomes mascarados fica ambígua no universo completo antes da seleção', () => {
  const namedRow = { ...row, campaign_name: 'Campanha 5511987654321', adset_name: 'Conjunto 5511987654321' };
  const otherRow = { ...row, id: 'row-b', account_id: 'act_701', campaign_id: '10002', adset_id: '20002',
    campaign_name: 'Campanha 5521987654321', adset_name: 'Conjunto 5521987654321' };
  for (const projected of [false, true]) {
    const result = selectRoutineLeads([contact('masked-ambiguity', {
      campaign_name: projected ? maskRoutineText(namedRow.campaign_name) : namedRow.campaign_name,
      adset_name: projected ? maskRoutineText(namedRow.adset_name) : namedRow.adset_name,
    })], { ...options, rows: [namedRow], allRows: [namedRow, otherRow] });
    assert.equal(result.leads.length, 0);
    assert.deepEqual(result.unmatchedLeads.map((lead) => lead.id), ['masked-ambiguity']);
    assert.equal(result.unmatchedLeads[0].routineMatchMethod, null);
  }
});

test('IDs exatos prevalecem quando nomes de campanhas colidem depois da máscara', () => {
  const namedRow = { ...row, campaign_name: 'Campanha 5511987654321', adset_name: 'Conjunto 5511987654321' };
  const otherRow = { ...namedRow, id: 'row-b', account_id: 'act_701', campaign_id: '10002', adset_id: '20002',
    campaign_name: 'Campanha 5521987654321', adset_name: 'Conjunto 5521987654321' };
  const result = selectRoutineLeads([contact('phone-name-by-id', { ...ids,
    campaign_name: 'Campanha •••• 4321', adset_name: 'Conjunto •••• 4321',
  })], { ...options, rows: [namedRow], allRows: [namedRow, otherRow] });
  assert.deepEqual(result.leads.map((lead) => lead.id), ['phone-name-by-id']);
  assert.equal(result.leads[0].routineMatchMethod, 'id');
});

test('filtro parcial mantém IDs fora da seleção separados da ausência de vínculo', () => {
  const otherRow = { ...row, id: 'row-b', campaign_id: '10002', adset_id: '20002', campaign_name: 'Outra campanha', adset_name: 'Outro conjunto' };
  const result = selectRoutineLeads([contact('selected', ids), contact('excluded', { account_id: '700', campaign_id: '10002', adset_id: '20002' })], {
    ...options, allRows: [row, otherRow],
  });
  assert.deepEqual(result.leads.map((lead) => lead.id), ['selected']);
  assert.equal(result.unmatchedLeads.length, 0);
  assert.equal(result.unattributed, 0);
});

test('catálogo salvo participa da ambiguidade antes da seleção parcial', () => {
  const result = selectRoutineLeads([contact('catalog-ambiguous', names)], { ...options,
    originCatalog: [{ account_id: '701', campaign_id: '10002', adset_id: '20002', ...names, campaign_status: 'PAUSED' }],
  });
  assert.equal(result.leads.length, 0);
  assert.deepEqual(result.unmatchedLeads.map((lead) => lead.id), ['catalog-ambiguous']);
  assert.equal(result.unmatchedLeads[0].routineMatchMethod, null);
});

test('catálogo salvo resolve identidade do anúncio sem consultar Meta', () => {
  const result = selectRoutineLeads([contact('catalog-ad', { ad_id: '30001' })], { ...options,
    originCatalog: [{ ...ids, ...names, ad_id: '30001', ad_name: 'Anúncio sintético', campaign_status: 'ACTIVE' }],
  });
  assert.deepEqual(result.leads.map((lead) => lead.id), ['catalog-ad']);
  assert.equal(result.leads[0].routineMatchMethod, 'id');
  assert.deepEqual(result.leads[0].routineOrigin, { ...ids, ...names, ad_name: 'Anúncio sintético' });
});

test('anúncio do catálogo não supera campaign_id contraditório recebido', () => {
  const result = selectRoutineLeads([contact('catalog-conflict', { ad_id: '30001', campaign_id: 'wrong-campaign' })], { ...options,
    originCatalog: [{ ...ids, ...names, ad_id: '30001', campaign_status: 'ACTIVE' }],
  });
  assert.equal(result.leads.length, 0);
  assert.deepEqual(result.unmatchedLeads.map((lead) => lead.id), ['catalog-conflict']);
});

test('modo entrada não atribui somente por nomes de catálogo fora das linhas da revisão', () => {
  const historical = { account_id: '700', campaign_id: '10002', campaign_name: 'Campanha antiga', adset_id: '20002', adset_name: 'Conjunto antigo', campaign_status: 'PAUSED' };
  const result = selectRoutineLeads([contact('catalog-name-outside', { campaign_name: 'Campanha antiga', adset_name: 'Conjunto antigo' })], {
    ...options, originCatalog: [historical],
  });
  assert.equal(result.leads.length, 0);
  assert.deepEqual(result.unmatchedLeads.map((lead) => lead.id), ['catalog-name-outside']);
});

test('marcador de conflito do DTO bloqueia IDs coalescidos fora do primeiro toque de link', () => {
  const result = selectRoutineLeads([contact('dto-conflict', { ...ids, attribution_conflict: true })], options);
  assert.equal(result.leads.length, 0);
  assert.deepEqual(result.unmatchedLeads.map((lead) => lead.id), ['dto-conflict']);
});

const link = (snapshot, extra = {}) => ({ planeje_link_id: 'synthetic-link', planeje_link_origin: 'site',
  utm_source: 'linktree', planeje_link_attribution: { platform: 'meta', ...snapshot }, ...extra });

test('Linktree configurado casa pelo snapshot sem mudar primeira origem', () => {
  const lead = contact('link-configured', link({ campaign_id: '10001', adset_id: '20001', ...names }), { origin_source: 'site', utm_source: 'linktree' });
  const before = structuredClone(lead);
  const result = selectRoutineLeads([lead], options);
  assert.deepEqual(result.leads.map((item) => item.id), ['link-configured']);
  assert.equal(result.leads[0].routineMatchMethod, 'link');
  assert.equal(result.leads[0].origin_source, 'site');
  assert.equal(result.leads[0].routineOrigin.account_id, '700');
  assert.deepEqual(lead, before);
});

test('origem Google preservada no clique não é convertida pelo snapshot Meta', () => {
  const result = selectRoutineLeads([contact('google-link', link({ campaign_id: '10001', adset_id: '20001', ...names }, {
    planeje_link_origin: 'google_ads',
  }), { origin_source: null })], options);
  assert.equal(result.leads.length, 0);
  assert.deepEqual(result.unmatchedLeads.map((lead) => lead.id), ['google-link']);
  assert.equal(result.unattributed, 0);
});

test('Linktree sem conjunto configurado permanece sem vínculo apesar de metadados posteriores', () => {
  const result = selectRoutineLeads([contact('link-no-set', link({ campaign_id: '10001', campaign_name: names.campaign_name }, ids), {
    origin_source: 'site', utm_source: 'linktree',
  })], options);
  assert.equal(result.leads.length, 0);
  assert.deepEqual(result.unmatchedLeads.map((lead) => lead.id), ['link-no-set']);
  assert.equal(result.unmatchedLeads[0].routineMatchMethod, null);
});

test('snapshot de primeiro toque prevalece sobre IDs de anúncio posterior', () => {
  const otherRow = { ...row, id: 'other', campaign_id: '10002', adset_id: '20002' };
  const result = selectRoutineLeads([contact('first-link', link({ campaign_id: '10001', adset_id: '20001', ...names }, {
    account_id: '700', campaign_id: '10002', adset_id: '20002', meta_ad_details: { ad: { campaign: { id: '10002' }, adset: { id: '20002' } } },
  }), { origin_source: 'site', utm_source: 'linktree' })], { ...options, allRows: [row, otherRow] });
  assert.deepEqual(result.leads.map((lead) => lead.id), ['first-link']);
  assert.equal(result.leads[0].routineMatchMethod, 'link');
  assert.equal(result.leads[0].routineOrigin.campaign_id, '10001');
});

test('snapshot do link não herda conta de enriquecimento posterior para anular sua origem', () => {
  const result = selectRoutineLeads([contact('first-link-account', link({ campaign_id: '10001', adset_id: '20001', ...names }, {
    account_id: '701', attribution_conflict: true, link_configured: true,
  }), { origin_source: 'site', utm_source: 'linktree' })], options);
  assert.deepEqual(result.leads.map((lead) => lead.id), ['first-link-account']);
  assert.equal(result.leads[0].routineOrigin.account_id, '700');
});

test('snapshot do link conserva nomes históricos mesmo quando a linha atual foi renomeada', () => {
  const result = selectRoutineLeads([contact('first-link-names', link({ campaign_id: '10001', adset_id: '20001', ...names }), {
    origin_source: 'site', utm_source: 'linktree',
  })], { ...options, rows: [{ ...row, campaign_name: 'Campanha renomeada', adset_name: 'Conjunto renomeado' }] });
  assert.equal(result.leads[0]?.routineOrigin.campaign_name, 'Campanha sintética');
  assert.equal(result.leads[0]?.routineOrigin.adset_name, 'Conjunto sintético');
});

test('link Meta sem atribuição configurada não recebe conjunto a partir da UTM', () => {
  const result = selectRoutineLeads([contact('meta-link-no-config', { planeje_link_id: 'synthetic-link', planeje_link_origin: 'meta_ads',
    utm_source: 'facebook', utm_campaign: names.campaign_name, utm_content: names.adset_name,
  })], options);
  assert.equal(result.leads.length, 0);
  assert.deepEqual(result.unmatchedLeads.map((lead) => lead.id), ['meta-link-no-config']);
});

test('link Meta sem configuração não herda conjunto do enriquecimento posterior', () => {
  const result = selectRoutineLeads([contact('unconfigured-link-later-ad', { ...ids, ...names,
    planeje_link_origin: 'meta_ads', link_configured: false,
  })], options);
  assert.equal(result.leads.length, 0);
  assert.deepEqual(result.unmatchedLeads.map((lead) => lead.id), ['unconfigured-link-later-ad']);
  assert.equal(result.unmatchedLeads[0].routineMatchMethod, null);
  assert.equal(result.unmatchedLeads[0].routineOrigin.adset_id, '');
});
