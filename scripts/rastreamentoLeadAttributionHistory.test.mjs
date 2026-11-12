import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { appendAttributionHistory, fetchLeadAttributionHistory } from '../src/lib/rastreamentoLeadAttributionHistory.js';

const cid='client-fixture',jid='5511000000001@s.whatsapp.net';
const rows=Array.from({length:21},(_,index)=>({id:`00000000-0000-0000-0000-${String(99-index).padStart(12,'0')}`,event_at:'2026-10-28T12:00:00.123456+00:00',origin_source:'google_ads',attribution:{utm_campaign:'A'}}));
let requests=[],fail=false;
const client=createClient('https://fixture.invalid','fixture-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(input,init)=>{
  const url=new URL(input);assert.equal(url.hostname,'fixture.invalid');assert.equal(init.method,'GET');requests.push(url);
  if(url.pathname.endsWith('/cliente_whatsapp_contact')) {
    assert.equal(url.searchParams.get('cliente_id'),'eq.'+cid);assert.ok(['eq.contact-fixture','eq.missing-contact'].includes(url.searchParams.get('id')));
    assert.equal(url.searchParams.get('select'),'from_jid');
    return new Response(JSON.stringify(fail?{message:'fixture failure'}:url.searchParams.get('id')==='eq.missing-contact'?null:{from_jid:jid}),{status:fail?500:200,headers:{'Content-Type':'application/json'}});
  }
  assert.equal(url.searchParams.get('cliente_id'),'eq.'+cid);assert.equal(url.searchParams.get('from_jid'),'eq.'+jid);
  assert.ok(!url.searchParams.get('select').includes('raw_payload'));assert.equal(url.searchParams.get('limit'),'21');
  return new Response(JSON.stringify(fail?{message:'fixture failure'}:rows),{status:fail?500:200,headers:{'Content-Type':'application/json'}});
}}});
const first=await fetchLeadAttributionHistory(client,{clienteId:cid,fromJid:jid});
assert.equal(first.rows.length,20);assert.equal(first.nextCursor.at,rows[19].event_at,'cursor preserves database microseconds');
assert.equal(first.nextCursor.id,rows[19].id);assert.equal(first.error,null);
const snippet=await fetchLeadAttributionHistory(client,{clienteId:cid,contactId:'contact-fixture'});
assert.equal(snippet.rows.length,20,'contact summaries from Events must resolve the canonical JID under the same client');
assert.ok(requests.some(url=>url.pathname.endsWith('/cliente_whatsapp_contact')));
const unavailable=await fetchLeadAttributionHistory(client,{clienteId:cid,contactId:'missing-contact'});
assert.equal(unavailable.rows.length,0);assert.equal(unavailable.error,null);
assert.ok(requests.at(-1).pathname.endsWith('/cliente_whatsapp_contact'),'invisible contact must not trigger a history query');
await fetchLeadAttributionHistory(client,{clienteId:cid,fromJid:jid,cursor:first.nextCursor});
assert.ok(requests.at(-1).searchParams.get('or').includes('event_at.lt.'+rows[19].event_at));
assert.ok(requests.at(-1).searchParams.get('or').includes('id.lt.'+rows[19].id));
const merged=appendAttributionHistory(rows.slice(0,2),[rows[1],rows[2]]);
assert.deepEqual(merged,rows.slice(0,3));assert.equal(rows.length,21);
fail=true;assert.ok((await fetchLeadAttributionHistory(client,{clienteId:cid,fromJid:jid})).error);
const failedSnippet=await fetchLeadAttributionHistory(client,{clienteId:cid,contactId:'contact-fixture'});
assert.ok(failedSnippet.error);assert.equal(failedSnippet.rows.length,0);
const before=requests.length;
assert.equal((await fetchLeadAttributionHistory(client,{clienteId:cid,fromJid:jid,cursor:{at:'invalid),cliente_id.neq.x',id:rows[1].id}})).rows.length,0);
assert.equal((await fetchLeadAttributionHistory(client,{clienteId:null,fromJid:jid})).rows.length,0);assert.equal(requests.length,before);
console.log('PASS origin history reader: tenant/contact scope, keyset, microseconds, duplicate append and error');
