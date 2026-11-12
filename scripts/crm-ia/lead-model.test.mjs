import assert from 'node:assert/strict';
import test from 'node:test';
import { leadPayload } from '../../src/components/crm-ia/crmIaPresentation.js';
import { leadColumnKeys, moveLeadPayload, publishedLeadProfiles, readLeadColumns } from '../../src/components/crm-ia/crmIaLeadModel.js';

const draft = { nome: 'Contato sintético', whatsapp: '5511000000000', valor: '' };
test('payload de perfil distingue preservar, limpar e atribuir sem copiar instruções', () => {
  assert.equal(Object.hasOwn(leadPayload(draft), 'profile'), false);
  assert.equal(leadPayload({ ...draft, profile: null }).profile, null);
  assert.deepEqual(leadPayload({ ...draft, profile: { agent_id: 'agent-a', id: 'profile-a', agent_updated_at: 'version-a', nome: 'Não copiar', pistas: ['privado'] } }).profile,
    { agent_id: 'agent-a', id: 'profile-a', agent_updated_at: 'version-a' });
});

test('preferência ignora conteúdo fora da allowlist e conserva identificação fixa', () => {
  assert.deepEqual(leadColumnKeys(['email', 'nome-do-cliente', { lead: 'privado' }, 'email']), ['lead', 'email']);
  const before = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => '{json inválido' };
  try { assert.ok(readLeadColumns('test').includes('lead')); }
  finally { if (before === undefined) delete globalThis.localStorage; else globalThis.localStorage = before; }
});

test('movimento exige versão, mesmo funil, avanço permitido e motivo sem alterar o lead', () => {
  const lead = { id: 'lead-a', pipeline_id: 'pipeline-a', stage_id: 'start', updated_at: 'version-a' };
  const stages = [{ id: 'start', pipeline_id: 'pipeline-a', etapas_permitidas: ['won'] }, { id: 'won', pipeline_id: 'pipeline-a', tipo: 'ganho' }, { id: 'blocked', pipeline_id: 'pipeline-a' }, { id: 'foreign', pipeline_id: 'pipeline-b' }];
  assert.throws(() => moveLeadPayload({ ...lead, updated_at: null }, 'won', stages, 'Motivo'), /Atualize/);
  assert.throws(() => moveLeadPayload(lead, 'foreign', stages, 'Motivo'), /neste funil/);
  assert.throws(() => moveLeadPayload(lead, 'blocked', stages, 'Motivo'), /não permite/);
  assert.throws(() => moveLeadPayload(lead, 'won', stages), /motivo/);
  assert.deepEqual(moveLeadPayload(lead, 'won', stages, ' Venda confirmada '), { id: 'lead-a', expected_updated_at: 'version-a', from_stage_id: 'start', stage_id: 'won', reason: 'Venda confirmada' });
  assert.equal(lead.stage_id, 'start');
});

test('atribuição de perfil restringe também lead sem funil e nunca oferece snapshot histórico', () => {
  const workspace = { lead_profiles: [{ id: 'same', pipeline_id: 'pipeline-a' }, { id: 'global', pipeline_id: null }, { id: 'removed', pipeline_id: null, historical: true }] };
  assert.deepEqual(publishedLeadProfiles(workspace, 'pipeline-a').map(item => item.id), ['same']);
  assert.deepEqual(publishedLeadProfiles(workspace, '').map(item => item.id), ['global']);
});
