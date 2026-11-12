import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { buildMiniCrmSummary, fetchMiniCrmSummary } from '../src/lib/rastreamentoMiniCrmResumo.js';

test('mostra campos e status configurados da loja sem alterar o contato', () => {
  const contact={id:'contact-a',mini_crm:{status:'Agendado',vendedor:'Consultora fictícia',data_agendamento:'2026-11-20',data_agendamento_hora:'14:30',observacao:'Preferência fictícia'}};
  const before=JSON.stringify(contact);
  const rows=buildMiniCrmSummary({contact,niche:'Loja de noivas',config:{statuses:[{key:'Agendado',label:'Prova marcada',color:'#0F766E'}],columns:[{key:'vendedor',label:'Consultora',kind:'text'},{key:'data_agendamento',label:'Agendamento',kind:'day'},{key:'observacao',label:'Notas',kind:'text'}]}});
  assert.equal(rows.find(r=>r.key==='status').value,'Prova marcada');
  assert.equal(rows.find(r=>r.key==='status').color,'#0f766e');
  assert.equal(rows.find(r=>r.key==='vendedor').color,undefined);
  assert.equal(rows.find(r=>r.key==='vendedor').value,'Consultora fictícia');
  assert.match(rows.find(r=>r.key==='data_agendamento').value,/20\/11\/2026/);
  assert.match(rows.find(r=>r.key==='data_agendamento').value,/14:30/);
  assert.equal(rows.find(r=>r.key==='observacao').value,'Preferência fictícia');
  assert.equal(JSON.stringify(contact),before);
  assert.equal(rows.some(r=>r.key.startsWith('_')),false);
});

test('mantém status sem configuração e campos vazios sem cor inventada', () => {
  for (const status of ['Legado', '']) {
    const rows=buildMiniCrmSummary({contact:{mini_crm:{status}},config:{statuses:[{key:'Agendado',label:'Prova marcada',color:'#7c3aed'}],columns:[]}});
    assert.equal(rows[0].value,status || 'Não informado');
    assert.equal(rows[0].color,undefined);
  }
});

test('leitura mantém cliente e contato, não escreve e propaga falha', async () => {
  for(const fail of [false,true]) {
    const calls=[];
    const client=createClient('https://fixture.invalid','fixture-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,options)=>{
      const u=new URL(input),q=u.searchParams;calls.push(u.pathname);
      assert.equal(u.hostname,'fixture.invalid');assert.equal(options?.method||'GET','GET');
      let data;
      if(u.pathname.endsWith('/clientes')) {assert.equal(q.get('id'),'eq.client-a');data={nicho:'Noivas'};}
      else {
        assert.equal(q.get('cliente_id'),'eq.client-a');
        if(u.pathname.endsWith('/cliente_whatsapp_contact')) {assert.equal(q.get('id'),'eq.contact-a');data={id:'contact-a',mini_crm:{status:'Agendado'}};}
        else {assert.ok(u.pathname.endsWith('/mini_crm_config'));data={statuses:[],columns:[]};if(fail)return new Response('{"message":"fixture"}',{status:403});}
      }
      return new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
    }}});
    if(fail) await assert.rejects(fetchMiniCrmSummary(client,{clienteId:'client-a',contactId:'contact-a'}));
    else assert.equal((await fetchMiniCrmSummary(client,{clienteId:'client-a',contactId:'contact-a'}))[0].value,'Agendado');
    assert.equal(calls.length,3);
  }
  assert.deepEqual(await fetchMiniCrmSummary({from(){throw new Error('must not query')}},{clienteId:'client-a'}),[]);
});
