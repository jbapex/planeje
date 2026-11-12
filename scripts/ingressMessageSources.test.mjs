import assert from 'node:assert/strict';
import { ingressMessageSource, mergeMessageSources } from '../supabase/functions/_shared/ingressMessageSource.js';
import { runMiniCrmMessage } from '../supabase/functions/_shared/miniCrmMessageRunner.js';
const meta = { format: 'meta_cloud', ownerPhone: '5511999999999', channelKey: '111111' };
const source = ingressMessageSource(meta);
assert.equal(source.id, 'ingress:meta_cloud:111111');
assert.match(source.name, /WhatsApp via webhook.*5511999999999/);
assert.deepEqual(ingressMessageSource(meta, 'configured-uuid'), { id: 'configured-uuid', aliases: [] });
assert.notEqual(ingressMessageSource({ ...meta, channelKey: '222222' }).id, source.id);
assert.equal(ingressMessageSource({ format: 'chatvolt', channelKey: 'zapperapi' }).name, 'WhatsApp via Chatvolt (Zapperapi)');
assert.notEqual(ingressMessageSource({ format: 'chatvolt', channelKey: 'whatsapp' }).id, ingressMessageSource({ format: 'chatvolt', channelKey: 'zapperapi' }).id);
assert.equal(ingressMessageSource({ format: 'canonical', ownerPhone: '5511888888888' }).id, 'ingress:canonical:5511888888888');
for (const channelKey of ['business/main', 'Equipe principal', 'shared']) {
  const first = ingressMessageSource({ format: 'canonical', channelKey, ownerPhone: '5511999999999' });
  const second = ingressMessageSource({ format: 'canonical', channelKey, ownerPhone: '5511888888888' });
  assert.notEqual(first.id, second.id);
}
assert.equal(mergeMessageSources([{ id: 'a', name: 'Configured' }], [{ id: 'a', name: 'Duplicate' }, source]).length, 2);
assert.equal(mergeMessageSources([{ id: 'a', name: 'Configured' }], [{ id: 'a', name: 'Duplicate' }])[0].name, 'Configured');
assert.equal(mergeMessageSources([], [{ id: 'ingress:meta_cloud:f3-test', name: 'Probe' }]).length, 0);
assert.equal(ingressMessageSource({ format: 'meta_cloud', channelKey: 'f3-test' }).id, 'ingress:meta_cloud');

// Real planner and runner, with a fixture-only database boundary.
const now = new Date(), enabledAt = new Date(now.getTime() - 60000).toISOString();
const rules = { enabled: true, appointmentEnabled: false, entryStatus: 'Novo Lead', workingStatus: 'Em Atendimento', arrivalChannels: [source.id] };
let mini = {}, writes = [];
const db = { from(table) {
  let client;
  const q = { select() { return q; }, eq(key, value) { if (key === 'cliente_id' || key === 'id') client = value; return q; },
    maybeSingle() { return Promise.resolve({ error: null, data: client !== 'fixture-client' ? null :
      table === 'mini_crm_message_rules' ? { settings: rules, updated_at: enabledAt } :
      table === 'cliente_whatsapp_contact' ? { id: 'fixture-contact', mini_crm: mini } :
      table === 'mini_crm_config' ? { statuses: [{ key: 'Novo Lead', label: 'Novo Lead' }, { key: 'Em Atendimento', label: 'Em Atendimento' }], columns: [], updated_at: enabledAt } : {} }); } };
  return q;
}, async rpc(name, args) { assert.equal(name, 'mini_crm_apply_message'); writes.push(args); mini = { ...mini, ...args.p_patch }; return { data: { applied: true }, error: null }; } };
const event = { messageId: 'inbound', channel: source.id, channelAliases: source.aliases, fromMe: false, isGroup: false, text: 'Olá', type: 'text', at: now.toISOString() };
let result = await runMiniCrmMessage({ supabase: db, clienteId: 'fixture-client', jid: '5511000000001@s.whatsapp.net', event });
assert.equal(result.applied, true); assert.equal(mini.status, 'Novo Lead');
result = await runMiniCrmMessage({ supabase: db, clienteId: 'fixture-client', jid: '5511000000001@s.whatsapp.net', event: { ...event, fromMe: true, messageId: 'reply' } });
assert.equal(result.applied, true); assert.equal(mini.status, 'Em Atendimento'); assert.equal(writes[1].p_channel, source.id);
const before = writes.length;
for (const patch of [{ historical: true }, { channel: 'ingress:meta_cloud:222222' }, { type: 'receipt' }, { at: new Date(now.getTime() - 120000).toISOString() }]) {
  mini = {};
  await runMiniCrmMessage({ supabase: db, clienteId: 'fixture-client', jid: '5511000000001@s.whatsapp.net', event: { ...event, ...patch } });
}
assert.equal(writes.length, before);
await runMiniCrmMessage({ supabase: db, clienteId: 'other-client', jid: '5511000000001@s.whatsapp.net', event });
assert.equal(writes.length, before);
console.log('PASS source identities, selection and real runner: arrivals/replies/history/isolation');
