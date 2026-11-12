import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const moduleUrl = process.env.META_ECHO_HISTORY_MODULE
  ? pathToFileURL(process.env.META_ECHO_HISTORY_MODULE)
  : new URL('../src/lib/rastreamentoLeadConversa.js', import.meta.url);
const { fetchLeadConversaAudit, buildLeadConversaAudit } = await import(moduleUrl);
const clientId = 'client-fixture';
const phone = '5511000000001';
const echo = { id: 'wamid.fixture', to: phone, from: '5511000000000', timestamp: '1792756800',
  type: 'text', text: { body: 'Resposta Meta fictícia' } };
let checkedMeta = false;

function fixtureClient(mode = 'ok') {
  return createClient('https://fixture.invalid', 'fixture-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input) => {
      const url = new URL(input);
      assert.equal(url.hostname, 'fixture.invalid');
      const q = url.searchParams;
      assert.equal(q.get('cliente_id'), `eq.${clientId}`, 'every query must stay in its client');
      let data = [];
      if (url.pathname.endsWith('/cliente_whatsapp_inbox')) {
        data = [{ id: 'in-fixture', body: 'Pergunta fictícia', is_group: false, phone, from_jid: `${phone}@s.whatsapp.net`,
          msg_timestamp: '2026-10-23T15:00:00Z' }];
      } else if (url.pathname.endsWith('/cliente_whatsapp_webhook_log')) {
        if (q.get('source') === 'eq.ingress') {
          checkedMeta = true;
          assert.equal(q.get('raw_payload->entry->0->changes->0->>field'), 'eq.smb_message_echoes');
          assert.equal(q.get('raw_payload->entry->0->changes->0->value->message_echoes->0->>to'), 'in.(5511000000001,11000000001)');
          assert.equal(q.get('limit'), '120');
          assert.ok(!q.get('select').split(',').includes('raw_payload'), 'do not fetch whole customer payloads');
          if (mode === 'throw') throw new Error('fixture network failure');
          if (mode === 'error') return new Response(JSON.stringify({ code: 'PGRST100', message: 'fixture query failure' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
          data = [{ id: 'meta-fixture', created_at: '2026-10-23T15:01:00Z', meta_echo: echo }];
        } else {
          assert.equal(q.get('source'), 'eq.chatvolt');
          assert.equal(q.get('from_jid'), 'in.(5511000000001@s.whatsapp.net,5511000000001@c.us,11000000001@s.whatsapp.net,11000000001@c.us)');
          data = [{ id: 'chatvolt-fixture', created_at: '2026-10-23T15:02:00Z', from_jid: `${phone}@s.whatsapp.net`,
            raw_payload: { eventType: 'AGENT_MESSAGE_SENDED', agentResponse: 'Resposta Chatvolt fictícia',
              createdAt: '2026-10-23T15:02:00Z', channel: 'whatsapp', messageId: 'cv-fixture' } }];
        }
      }
      return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
    } },
  });
}

for (const mode of ['ok', 'error', 'throw']) {
  checkedMeta = false;
  const history = await fetchLeadConversaAudit(fixtureClient(mode), { clienteId: clientId, digits: phone });
  assert.equal(checkedMeta, true, 'must query company echoes as well as Chatvolt');
  assert.equal(history.inboxRows.length, 1);
  const audit = buildLeadConversaAudit(history);
  const replies = audit.items.filter((item) => item.side === 'equipe');
  assert.ok(replies.some((item) => item.body === 'Resposta Chatvolt fictícia'), 'Meta failure must preserve Dinamac/Chatvolt replies');
  assert.equal(replies.some((item) => item.body === 'Resposta Meta fictícia'), mode === 'ok');
  assert.equal(Boolean(history.error), mode !== 'ok');
}
const empty = await fetchLeadConversaAudit({ from() { throw new Error('invalid identity must not query'); } }, { clienteId: clientId, digits: '' });
assert.equal(empty.inboxRows.length, 0);
console.log('PASS Meta echo query: scoped filters, original Chatvolt, deduped inbox, HTTP/network failures, invalid identity');
