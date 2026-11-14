import assert from 'node:assert/strict';
import test from 'node:test';
import { readAgendaCalendar } from '../../src/components/crm-ia/crmIaAgendaRead.js';

const payload={since:'2026-11-01',until:'2026-12-12',owner_id:'owner-a'};
const summary={scheduled:201,confirmed:0,cancelled:0,no_show:0};
const rows=Array.from({length:201},(_,i)=>({id:`appointment-${i}`,owner_id:'owner-a'}));
const page=(all,offset)=>({rows:all.slice(offset,offset+200),total:all.length,timezone:'America/Sao_Paulo',summary});

test('calendário reúne mais de uma página mantendo recorte e resumo do servidor',async()=>{
  const calls=[];const result=await readAgendaCalendar(async(action,p)=>{calls.push([action,p]);return page(rows,p.offset);},payload);
  assert.equal(result.complete,true);assert.deepEqual(result.rows,rows);assert.equal(result.total,201);assert.deepEqual(result.summary,summary);
  assert.deepEqual(calls,[['agenda',{...payload,offset:0,limit:200}],['agenda',{...payload,offset:200,limit:200}]]);
});
test('calendário vazio tem cobertura completa sem nova consulta',async()=>{
  let calls=0;const result=await readAgendaCalendar(async()=>{calls++;return page([],0);},payload);
  assert.equal(calls,1);assert.equal(result.complete,true);assert.deepEqual(result.rows,[]);
});
test('revogação/erro no meio não entrega um calendário parcial como sucesso',async()=>{
  const calls=[];await assert.rejects(readAgendaCalendar(async(_action,p)=>{calls.push(p.offset);if(p.offset)throw Error('Sem acesso');return page(rows,p.offset);},payload),/Sem acesso/);
  assert.deepEqual(calls,[0,200]);
});
test('mudança de contagem, fuso, resumo ou página repetida pede nova leitura',async()=>{
  for(const patch of [{total:202},{timezone:'Europe/Lisbon'},{summary:{...summary,confirmed:1}},{rows:rows.slice(0,1)}]){
    await assert.rejects(readAgendaCalendar(async(_action,p)=>({...page(rows,p.offset),...(p.offset?patch:{})}),payload),/agenda.*alterad|leitura.*agenda/i);
  }
});
test('contrato inválido ou página vazia prematura não representa a grade como completa',async()=>{
  for(const response of [{rows:[],total:2,timezone:'America/Sao_Paulo',summary}, {...page(rows,0),total:-1}, {...page(rows,0),rows:[{}]}, {...page(rows,0),timezone:'bad-zone'}])
    await assert.rejects(readAgendaCalendar(async()=>response,payload),/leitura.*agenda|agenda.*alterad/i);
});
test('limite de quatro mil registros informa cobertura incompleta, preservando o total',async()=>{
  const large=Array.from({length:4001},(_,i)=>({id:`large-${i}`}));let calls=0;
  const result=await readAgendaCalendar(async(_action,p)=>{calls++;return page(large,p.offset);},payload);
  assert.equal(calls,20);assert.equal(result.complete,false);assert.equal(result.rows.length,4000);assert.equal(result.total,4001);
});
