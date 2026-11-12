import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const folder = await mkdtemp(join(tmpdir(), 'crm-profiles-preview-')), output = join(folder, 'runtime.mjs');
await build({ entryPoints: ['supabase/functions/_shared/crmIaRuntime.ts'], outfile: output, bundle: true, format: 'esm', platform: 'node' });
const { runCrmIaAgent } = await import(pathToFileURL(output));
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const clientId = id(11), contactId = id(31), channelId = id(21), agentId = id(81), profileId = id(101);

for (const mode of ['testar', 'sugerir']) test(`${mode} propõe perfil publicado sem aplicar classificação nem ações`, async () => {
  const calls = [];
  const profile = { id: profileId, nome: 'Decidido', cor: '#aabbcc', descricao: 'Deseja contratar', pistas: ['Quero contratar'], actions: { owner_id: id(1), tags: ['VIP'] } };
  const rules = { tipo: 'qualificacao', pipeline_id: id(41), stage_ids: [id(51)], profiles: [profile] };
  const lead = { id: id(61), pipeline_id: id(41), stage_id: id(51), crm_ia_fields: {} };
  const rows = { cliente_atend_ia_agentes: [{ id: agentId, nome: 'Agente QA', modelo: 'openai/gpt-4o-mini', ativo: true, funil: { crm_ia: rules } }], crm_ia_config: [{ data: { attendance: { auto_send: false } } }],
    leads: [lead], cliente_whatsapp_contact: [{ id: contactId, from_jid: '551199999999@s.whatsapp.net' }], cliente_atend_conversas: [{}], cliente_whatsapp_config: [{ id: channelId }],
    cliente_whatsapp_inbox: [{ body: 'Quero contratar.', type: 'text', from_jid: '551199999999@s.whatsapp.net', created_at: '2026-11-11T10:00:00Z' }], clientes: [{ empresa: 'QA' }] };
  const db = { from(table) {
    let single = false;
    const q = { select() { return q; }, eq() { return q; }, is() { return q; }, order() { return q; }, limit() { return q; }, or() { return q; }, in() { return q; },
      maybeSingle() { single = true; return q; }, insert(value) { calls.push({ table, value }); return q; }, update() { assert.fail('preview cannot update database records'); },
      then(resolve, reject) { const data = rows[table] || []; return Promise.resolve({ data: single ? data[0] || null : data }).then(resolve, reject); } }; return q;
  }, rpc() { assert.fail('preview cannot begin a run or apply actions'); } };
  const result = await runCrmIaAgent({ db, clientId, contactId, channelId, agentId, mode, userId: id(1), previewMessages: [{ role: 'user', content: 'Quero contratar.' }],
    callModel: async (_model, messages) => { assert.match(messages[0].content, /Deseja contratar/); return { resposta: JSON.stringify({ text: 'Vamos continuar.', action: { type: 'answer', profile_id: profileId } }) }; } });
  assert.equal(result.preview, true); assert.equal(result.action.profile_id, profileId); assert.equal(lead.crm_ia_profile, undefined);
  assert.deepEqual(calls.map(call => call.table), ['cliente_atend_ia_log']);
});
test.after(() => rm(folder, { recursive: true, force: true }));
