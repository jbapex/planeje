import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { buildLeadConversaAudit, fetchLeadConversaAudit, filterLeadConversaByChannel, leadConversaChannels } from '../src/lib/rastreamentoLeadConversa.js';

const channels = [{ id: 'account-a', name: 'Vendas' }, { id: 'account-b', name: 'Consultora' }, { id: 'account-c', name: 'Agenda' }];
const message = (id, config, at) => ({ id, whatsapp_config_id: config, body: 'Texto fictício', is_group: false, created_at: at, msg_timestamp: at });

test('separa contas do mesmo provedor, mantém a conta vazia e filtra sem perder a visão conjunta', () => {
  const audit = buildLeadConversaAudit({ channels, inboxRows: [message('a','account-a','2026-11-01T10:00:00Z'),message('b','account-b','2026-11-01T11:00:00Z')] });
  const available = leadConversaChannels(audit);
  assert.deepEqual(available.map(c => [c.label,c.count]).sort(), [['Agenda',0],['Consultora',1],['Vendas',1]]);
  assert.equal(filterLeadConversaByChannel(audit,'').inboundCount,2);
  const sales=available.find(c=>c.label==='Vendas');
  assert.equal(filterLeadConversaByChannel(audit,sales.key).inboundCount,1);
  assert.equal(audit.items.find(i=>i.id==='in-b').channelLabel,'Consultora');
});

test('120 mensagens recentes de uma conta não apagam a outra conta', () => {
  const audit=buildLeadConversaAudit({ channels, inboxRows:[message('old','account-b','2026-10-01T00:00:00Z'),...Array.from({length:130},(_,i)=>message(`a-${i}`,'account-a',new Date(Date.UTC(2026,10,1,0,i)).toISOString()))] });
  assert.equal(audit.items.filter(i=>i.type==='msg').length,121);
  assert.equal(audit.items.some(i=>i.id==='in-old'),true);
  assert.equal(audit.truncated,true);
});

test('consultas por conta preservam cliente e falhas parciais não apagam mensagens', async () => {
  for (const mode of ['ok','metadata-error','account-error']) {
    const failChannels=mode==='metadata-error';
    const calls=[];
    const client=createClient('https://fixture.invalid','fixture-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,options)=>{
      const url=new URL(input),q=url.searchParams;calls.push(url);
      assert.equal(url.hostname,'fixture.invalid');assert.equal(q.get('cliente_id'),'eq.client-a');
      assert.equal(options?.method || 'GET','GET');
      let data=[];
      if(url.pathname.endsWith('/cliente_whatsapp_config')) {
        assert.equal(q.get('select'),'id,name');
        if(failChannels) return new Response('{"message":"fixture failure"}',{status:403,headers:{'content-type':'application/json'}});
        data=channels;
      }
      if(url.pathname.endsWith('/cliente_whatsapp_inbox')) {
        assert.ok(q.get('select').includes('uazapi_internal_id:raw_payload->message->>id'));
        assert.equal(q.get('select').split(',').includes('raw_payload'),false);
        const config=q.get('whatsapp_config_id');
        if(mode==='account-error'&&config==='eq.account-b') return new Response('{"message":"fixture failure"}',{status:403,headers:{'content-type':'application/json'}});
        data=[{...message(config==='eq.account-b'?'b':'a',config==='eq.account-b'?'account-b':'account-a','2026-11-01T10:00:00Z'),type:'ptt',wa_message_id:'ABC123',uazapi_internal_id:'fixture-owner:ABC123',message_id:'fixture-chat_1234567890000'}];
      }
      return new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
    }}});
    const history=await fetchLeadConversaAudit(client,{clienteId:'client-a',digits:'5511000000001'});
    assert.ok(calls.some(u=>u.pathname.endsWith('/cliente_whatsapp_config')));
    assert.equal(history.inboxRows.length,mode==='ok'?2:1);
    assert.deepEqual(buildLeadConversaAudit(history).items.find(i=>i.type==='msg').downloadMessageIds,['ABC123','fixture-chat_1234567890000','fixture-owner:ABC123']);
    assert.equal(Boolean(history.error),mode!=='ok');
    if(!failChannels) assert.ok(calls.some(u=>u.searchParams.get('whatsapp_config_id')==='eq.account-b'));
  }
});
