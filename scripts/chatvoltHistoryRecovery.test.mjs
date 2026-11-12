import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { fetchLeadConversaAudit, buildLeadConversaAudit } from '../src/lib/rastreamentoLeadConversa.js';

const clienteId = 'client-fixture';
const phone = '5511000000001';
const cid = 'conversation-fixture';
let queries;
function fixture(mode = 'ok') {
  queries = [];
  return createClient('https://fixture.invalid', 'fixture-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async input => {
      const url = new URL(input);
      assert.equal(url.hostname, 'fixture.invalid');
      const q = url.searchParams;
      assert.equal(q.get('cliente_id'), `eq.${clienteId}`);
      queries.push(url);
      let data = [];
      const fail = () => new Response(JSON.stringify({message:'fixture failure'}), {status:500});
      if (url.pathname.endsWith('/cliente_whatsapp_inbox')) {
        if (mode === 'inbox-error') return fail();
        data = mode === 'unbound' ? [] : [{ id:'in', body:'Pergunta inicial', message_id:'original',
          chatvolt_event:'AGENT_USER_MESSAGE', chatvolt_conversation_id:cid,
          created_at:'2026-10-27T17:00:05Z', msg_timestamp:'2026-10-27T17:00:05Z', is_group:false }];
      }
      if (url.pathname.endsWith('/cliente_whatsapp_webhook_log') && q.get('source') === 'eq.chatvolt') {
        if (mode === 'chatvolt-error') return fail();
        if (q.get('from_jid') === 'is.null') {
          assert.equal(q.get('raw_payload->>conversationId'), `in.(${cid})`);
          assert.equal(q.get('limit'), '120');
          if (mode === 'recovery-error') return fail();
          data = [
            { id:'missing-phone', from_jid:null, created_at:'2026-10-27T17:01:00Z', raw_payload:{
              eventType:'AGENT_USER_MESSAGE', conversationId:cid, messageId:'recovered',
              userMessage:'Outra pergunta', agentResponse:'Outra resposta', channel:'whatsapp' } },
            { id:'retry', from_jid:null, created_at:'2026-10-27T17:01:01Z', raw_payload:{
              eventType:'AGENT_USER_MESSAGE', conversationId:cid, messageId:'recovered',
              userMessage:'Outra pergunta', agentResponse:'Outra resposta', channel:'whatsapp' } },
            { id:'system-event',from_jid:null,created_at:'2026-10-27T17:01:02Z',raw_payload:{eventType:'STEP_ENTERED',conversationId:cid,messageId:'system',attachments:[{url:'https://media.example.invalid/system.jpg',mimeType:'image/jpeg'}]}},
            { id:'already-saved', from_jid:null, created_at:'2026-10-27T17:02:00Z', raw_payload:{
              eventType:'USER_MESSAGE_RECEIVED', conversationId:cid, messageId:'original', userMessage:'Pergunta inicial' } },
          ];
        } else {
          data = mode === 'unbound' ? [] : [{ id:'known', from_jid:`${phone}@s.whatsapp.net`,
            created_at:'2026-10-27T17:00:04Z', raw_payload:{eventType:'AGENT_MESSAGE_SENDED',
              conversationId:cid, messageId:'team-known', agentResponse:'Resposta inicial', channel:'whatsapp'} }, {id:'photo',from_jid:`${phone}@s.whatsapp.net`,created_at:'2026-10-27T17:00:07Z',raw_payload:{eventType:'USER_MESSAGE_RECEIVED',conversationId:cid,messageId:'photo',userPhoneNumber:phone,attachments:[{url:'https://media.example.invalid/photo.jpg',mimeType:'image/jpeg'}],channel:'whatsapp'}}];
        }
      }
      return new Response(JSON.stringify(data), {headers:{'Content-Type':'application/json'}});
    } },
  });
}
const raw = await fetchLeadConversaAudit(fixture(), {clienteId,digits:phone});
const audit = buildLeadConversaAudit(raw);
const messages = audit.items.filter(i=>i.type==='msg');
assert.equal(messages.filter(i=>i.body==='Outra pergunta').length,1,'recover inbound by known conversation, dedupe retries');
assert.equal(messages.filter(i=>i.body==='Outra resposta').length,1,'recover and dedupe team response');
assert.equal(messages.filter(i=>i.body==='Pergunta inicial').length,1,'do not repeat saved inbound');
assert.ok(messages.some(i=>i.timeEstimated),'do not claim receipt time is original message time');
assert.equal(raw.error,null);
assert.ok(!messages.some(i=>i.mediaUrl==='https://media.example.invalid/system.jpg'),'system event attachments are not lead messages');
assert.ok(messages.some(i=>i.kind==='image'&&i.mediaUrl==='https://media.example.invalid/photo.jpg'),'recover incoming photo without caption from bound log');

for (const mode of ['inbox-error','chatvolt-error','recovery-error']) {
  const result = await fetchLeadConversaAudit(fixture(mode), {clienteId,digits:phone});
  assert.ok(result.error, `${mode} must surface a partial history error`);
  assert.ok(result.inboxRows.length || result.teamLogRows.length, 'preserve sources which loaded successfully');
}
await fetchLeadConversaAudit(fixture('unbound'), {clienteId,digits:phone});
assert.ok(!queries.some(url=>url.searchParams.get('from_jid')==='is.null'),'never fetch unbound conversations');

const withOriginal = buildLeadConversaAudit({inboxRows:[{
  id:'dated', body:'Com horário', chatvolt_event:'USER_MESSAGE_RECEIVED', chatvolt_original_at:'2026-10-27T17:00:00Z',
  msg_timestamp:'2026-10-27T17:00:00Z', created_at:'2026-10-27T17:00:10Z',
}]});
assert.equal(withOriginal.items.find(i=>i.type==='msg').timeEstimated,false);
console.log('PASS Chatvolt history: scoped recovery, both sides, retry dedupe, source time, partial failures, no identity guessing');
