import assert from 'node:assert/strict';
import { buildWaMeRedirectUrl } from '../src/lib/rastreamentoTrackableLink.js';
import {
  classifyUazapiStatusPayload,
  matchWebhookToInstance,
  parseUazapiSubdomain,
  rastreamentoWebhookUrl,
  uazapiBaseUrl,
  whatsappInstanceStatusLabel,
} from '../src/lib/rastreamentoWhatsappInstancia.js';

assert.equal(parseUazapiSubdomain('https://ana.uazapi.com/'), 'ana');
assert.equal(parseUazapiSubdomain('ana'), 'ana');
assert.equal(uazapiBaseUrl('ana'), 'https://ana.uazapi.com');
assert.equal(
  rastreamentoWebhookUrl('https://sb.example', 'cli-1', 'sec'),
  'https://sb.example/functions/v1/uazapi-inbox-webhook?cliente_id=cli-1&secret=sec',
);
assert.equal(classifyUazapiStatusPayload({ connected: true, instance: { phone: '5511999' } }).status, 'connected');
assert.equal(classifyUazapiStatusPayload({ status: { loggedIn: false } }).connected, false);

const jidCases = [
  ['5511987654321:15@s.whatsapp.net', '5511987654321'],
  ['554198765432:3@s.whatsapp.net', '554198765432'],
  ['554132123456:18@s.whatsapp.net', '554132123456'],
  ['5511987654321:0@s.whatsapp.net', '5511987654321'],
  ['5511987654321@s.whatsapp.net', '5511987654321'],
  ['5511987654321', '5511987654321'],
];
for (const [jid, phone] of jidCases) {
  for (const payload of [
    { status: { loggedIn: true, jid } },
    { instance: { status: 'connected', jid } },
    { connected: true, jid },
  ]) {
    const parsed = classifyUazapiStatusPayload(payload);
    assert.equal(parsed.phone, phone, jid);
    assert.equal(parsed.connected, true);
    for (const openMode of ['auto', 'app', 'web']) {
      const redirect = new URL(buildWaMeRedirectUrl(parsed.phone, 'PJ-ABC123', { openMode }));
      const destination = openMode === 'auto' ? redirect.pathname.slice(1) : redirect.searchParams.get('phone');
      assert.equal(destination, phone, `${jid} / ${openMode}`);
    }
  }
}
assert.equal(classifyUazapiStatusPayload({ instance: { phone: '+55 (11) 98765-4321' } }).phone, '5511987654321');
assert.equal(classifyUazapiStatusPayload({ phone: '+55 (11) 98765-4321' }).phone, '5511987654321');
assert.equal(classifyUazapiStatusPayload({ status: { jid: '' }, phone: '5511987654321' }).phone, '5511987654321');
assert.equal(classifyUazapiStatusPayload(null).phone, '');
assert.equal(whatsappInstanceStatusLabel('connected'), 'Conectada');
assert.equal(
  matchWebhookToInstance(
    [
      { instance_name: 'Outro', created_at: '1' },
      { instance_name: 'Ana Agenda', created_at: '2' },
    ],
    { name: 'Ana Agenda' },
  ).created_at,
  '2',
);

console.log('PASS rastreamento whatsapp instancia');
