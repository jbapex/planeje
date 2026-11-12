import assert from 'node:assert/strict';
import test from 'node:test';
import { createCrmPreview, PREVIEW_IDS as ids } from './preview/fixture.js';

const A = ids.clientA, B = ids.clientB;
const disabled = { enabled: false, recipient: { type: 'lead_owner', person_id: null, phone: null } };
const changeRules = (agent, rules) => ({ ...agent, expected_updated_at: agent.updated_at, funil: { ...agent.funil, crm_ia: { ...agent.funil.crm_ia, ...rules } } });

test('prévia valida destinatário ao publicar e conserva rascunho incompleto', async () => {
  const p = createCrmPreview(), agent = (await p.request('workspace', A)).agents[0];
  const incomplete = changeRules(agent, { notification: { enabled: true, recipient: { type: 'phone', phone: '' } } });
  const draft = await p.request('agent_draft', A, { agent_id: agent.id });
  const saved = await p.request('save_agent_draft', A, { agent_id: agent.id, revision: draft.revision, data: incomplete });
  await assert.rejects(p.request('publish_agent_draft', A, { agent_id: agent.id, revision: saved.revision }), /telefone|destinatário/i);
  assert.ok((await p.request('agent_draft', A, { agent_id: agent.id })).draft);
  const published = await p.request('save_agent', A, changeRules(agent, { notification: { enabled: true, recipient: { type: 'phone', phone: '(11) 00000-0099', person_id: ids.otherPerson } } }));
  assert.deepEqual(published.funil.crm_ia.notification, { enabled: true, recipient: { type: 'phone', phone: '5511000000099', person_id: null } });
  await assert.rejects(p.request('save_agent', A, changeRules(published, { notification: { enabled: true, recipient: { type: 'person', person_id: ids.clientB } } })), /pessoa|destinatário/i);
});

test('modelo aplicado limpa destinatário e mantém avisos e autonomia desligados', async () => {
  const p = createCrmPreview(), workspace = await p.request('workspace', A), agent = workspace.agents[0];
  const data = changeRules(agent, { notification: { enabled: true, recipient: { type: 'phone', phone: '5511000000099' } } });
  const template = await p.request('save_template', A, { nome: 'Modelo fictício', tipo: 'agent', data });
  assert.deepEqual(template.data.funil.crm_ia.notification, disabled);
  assert.equal(template.data.funil.crm_ia.agendamento.notify_owner, false);
  await p.request('apply_template', A, { id: template.id, revision: template.revision, target_client_id: B });
  const copied = (await p.request('workspace', B)).agents.at(-1);
  assert.deepEqual(copied.funil.crm_ia.notification, disabled);
  assert.equal(copied.funil.crm_ia.agendamento.notify_owner, false);
  assert.equal(copied.ativo, false); assert.equal(copied.auto_responder, false);
});

test('fila sintética distingue destino interno e lead fonte sem criar conversa de equipe', async () => {
  const p = createCrmPreview({ state: 'controles-conversa' });
  const before = await p.request('conversations', A);
  const notice = (await p.request('queue', A)).rows.find(row => row.kind === 'notification');
  assert.ok(notice); assert.equal(notice.contact_id, ids.contactA);
  assert.equal(notice.source_lead.id, ids.leadA);
  assert.equal(notice.recipient_phone, '5511000000099');
  assert.notEqual(notice.recipient_phone, notice.source_lead.whatsapp);
  assert.equal((await p.request('conversations', A)).total, before.total);
});
