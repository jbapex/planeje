import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import * as recovery from '../supabase/functions/_shared/chatvoltConversationAttribution.js';
import { encodeHiddenMatchCode } from '../supabase/functions/_shared/rastreamentoHiddenMatchCode.js';

const phone = '5511000000001', cid = 'conversation-fixture', org = 'org-fixture';
const initial = { from_jid: null, event: 'AGENT_USER_MESSAGE', phone: null, message: 'Olá! Vim pelo site.' + encodeHiddenMatchCode('PJ-ABC234'), message_id: 'initial', conversation_id: cid, organization_id: org, channel: 'whatsapp' };
const identified = { ...initial, from_jid: phone + '@s.whatsapp.net', phone, message: 'Quero um produto', message_id: 'identified', event: 'USER_MESSAGE_RECEIVED' };
const body = { eventType: 'USER_MESSAGE_RECEIVED', userPhoneNumber: phone, messageId: 'identified', conversationId: cid, organizationId: org, channel: 'whatsapp', userMessage: 'Quero um produto' };
assert.equal(typeof recovery.lookupChatvoltConversationAttribution, 'function');
const lookup = recovery.lookupChatvoltConversationAttribution;
let reads = [];
function fixture(rows = [initial, identified], fail = false) {
  reads = [];
  return createClient('https://fixture.invalid', 'fixture-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      const url = new URL(input), q = url.searchParams; reads.push(url);
      assert.equal(url.hostname, 'fixture.invalid'); assert.equal(init?.method || 'GET', 'GET');
      assert.ok(url.pathname.endsWith('/cliente_whatsapp_webhook_log'));
      assert.equal(q.get('cliente_id'), 'eq.client-fixture'); assert.equal(q.get('source'), 'eq.chatvolt');
      assert.equal(q.get('raw_payload->>conversationId'), 'eq.' + cid);
      assert.equal(q.get('raw_payload->>organizationId'), 'eq.' + org);
      assert.equal(q.get('limit'), '201');
      assert.ok(!q.get('select').split(',').includes('raw_payload'), 'never read whole payloads for attribution');
      return new Response(JSON.stringify(fail ? { message: 'fixture failure' } : rows), {status: fail ? 500 : 200, headers: {'Content-Type':'application/json'}});
    } },
  });
}
const opts = { clienteId: 'client-fixture', body };
let result = await lookup(fixture(), opts);
assert.equal(result.phone,phone);
assert.equal(result.matches?.[0].matchCode,'PJ-ABC234');
assert.equal(result.matches[0].messageId,'initial');
const multiple=await lookup(fixture([initial,identified,{...initial,message:'Retornei'+encodeHiddenMatchCode('PJ-XYZ789'),message_id:'other'}]),opts);
assert.equal(multiple.matches.length,2,'distinct messages retain their distinct click evidence');
assert.equal(await lookup(fixture([initial,identified,{...initial,message:'Retornei'+encodeHiddenMatchCode('PJ-XYZ789')}]),opts),null,'one message identity cannot carry different click codes');
result = await lookup(fixture([{...initial,name:'Não identifica o contato'}, {...identified,name:'Nome conhecido'}]),opts);
assert.equal(result.name,'Nome conhecido','only the bound phone event supplies the fallback display name');
result = await lookup(fixture(), { ...opts, body: { ...body, eventType:'AGENT_USER_MESSAGE', userPhoneNumber:null, userMessage:initial.message, messageId:'initial' } });
assert.equal(result?.phone, phone, 'code arriving after the identified message must recover too');
for (const rows of [[], [initial], [identified], [initial, {...identified, phone:'5511000000002',from_jid:'5511000000002@s.whatsapp.net'}],
  [initial, identified, {...identified,phone:'5511000000002',from_jid:'5511000000002@s.whatsapp.net'}],
  [initial, {...identified,from_jid:'inconsistent@s.whatsapp.net'}], [initial, {...identified,organization_id:'foreign'}],
  [initial, {...identified,conversation_id:'foreign'}], [initial, {...identified,channel:'instagram'}],
  [{...initial,event:'AGENT_MESSAGE_SENDED'},identified], [{...initial,event:'GROUP_MESSAGE_RECEIVED'},identified],
  [{...initial,message:initial.message.slice(0,-1)},identified],
  [...Array(200).fill(initial),identified],
]) assert.equal(await lookup(fixture(rows),opts),null,'incomplete/conflicting scope or identity must fail closed');
for (const change of [{conversationId:''},{organizationId:''},{messageId:''},{channel:'instagram'},{userPhoneNumber:''},{eventType:'AGENT_MESSAGE_SENDED',agentResponse:initial.message},{eventType:'GROUP_MESSAGE_RECEIVED'}]) {
  const supabase = fixture();assert.equal(await lookup(supabase,{...opts,body:{...body,...change}}),null);assert.equal(reads.length,0);
}
assert.equal(await lookup(fixture(undefined,true),opts),null,'read error cannot invent attribution');
console.log('PASS Chatvolt conversation attribution: exact scope, phone binding, both orders, codes, failure and conflicts');
