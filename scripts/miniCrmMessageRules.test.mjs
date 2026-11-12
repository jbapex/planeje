import assert from 'node:assert/strict';
import {normalizeMessageRules,parseMessageAppointment as parse,planMiniCrmMessage as plan,miniCrmPatchDifference,messageHasKeyword,validateMessageRules,messageRulesCatalog} from '../supabase/functions/_shared/miniCrmMessageRules.js';
import {appointmentTime,appointmentTimeKey,patchMiniCrm,presetForNicho,resolveMiniCrmSetup} from '../src/lib/miniCrm.js';
let count=0;const test=(name,fn)=>{fn();count++;};
const at='2026-10-16T15:00:00Z',now='2026-10-16T15:00:30Z';
const catalog={statuses:['Novo Lead','Em Atendimento','Agendado','Perdido','Venda Realizada','Follow Up'].map(key=>({key,label:key})),columns:[{key:'data_agendamento',label:'Agendamento',kind:'day'}]};
const rules=normalizeMessageRules({enabled:true,appointmentField:'data_agendamento'});
const event={messageId:'msg1',channel:'canal1',fromMe:false,isGroup:false,text:'Olá',type:'text',at};
const run=(mini={},e={},r={})=>plan({rules:{...rules,...r},catalog,mini,event:{...event,...e},enabledAt:'2026-10-16T14:00:00Z',now});
for(const [text,day,time] of [
 ['Agendada dia 13/11 às 15hrs','2026-11-13','15:00'],['AGENDÁDO 13/11/26 às 15h30','2026-11-13','15:30'],
 ['Agendda dia 13/11 às 15:30','2026-11-13','15:30'],['confirmada para 13 de novembro às 9 horas','2026-11-13','09:00'],
 ['Marquei para amanhã às 10','2026-10-17','10:00'],['Agendamos hoje às 14h','2026-10-16','14:00'],
 ['Reagendado para 2026-11-13 às 08:05','2026-11-13','08:05'],['Agendado 13/11','2026-11-13',''],
 ['Agendada 05/01 às 9h','2027-01-05','09:00'],['Agendada 12/10 às 9h','2026-10-12','09:00'],
 ])test(text,()=>{const p=parse(text,at);assert.equal(p.ok,true,JSON.stringify(p));assert.equal(p.day,day);assert.equal(p.time,time);});
for(const text of ['Quero agendar dia 13/11 às15h','Não está agendada dia 13/11 às 15h','Agendado cancelado dia 13/11','Agendado 31/02/2026 às 15h','Agendado 13/11 às 25h','Agendado 13/11 às 15:90','Agendado 13/11 ou 14/11 às 15h','Agendado 13/11 às 15h ou 16h','Agendado hoje ou amanhã às 15h','Agendada dia 13/11 às 15h?'])test('reject '+text,()=>assert.equal(parse(text,at).ok,false));
test('São Paulo midnight',()=>assert.equal(parse('Agendado hoje às 10h','2026-10-17T01:00:00Z').day,'2026-10-16'));
test('extra confirmation',()=>assert.equal(parse('Reserva feita 13/11 às 10h',at,'reserva feita').ok,true));
test('disabled by default',()=>assert.equal(normalizeMessageRules().enabled,false));
test('bounded rules',()=>assert.equal(normalizeMessageRules({keywords:Array.from({length:60},()=>({}))}).keywords.length,30));
test('literal whole keyword',()=>{assert.equal(messageHasKeyword('quero agendar visita','agendar'),true);assert.equal(messageHasKeyword('desagendar visita','agendar'),false);assert.equal(messageHasKeyword('a.b','.*'),false);});
test('historical flag blocks even a recent timestamp',()=>assert.equal(run({}, {historical:true}).apply,false));
test('legacy source selection still matches its new numbered source',()=>assert.equal(run({}, {channel:'ingress:meta_cloud:123',channelAliases:['ingress:meta_cloud']}, {arrivalChannels:['ingress:meta_cloud']}).apply,true));
test('legacy source last-message marker still prevents duplicates',()=>assert.equal(run({_planeje_message_status:{lastMessageAt:at,lastMessageId:'msg1',lastChannel:'ingress:meta_cloud'}}, {channel:'ingress:meta_cloud:123',channelAliases:['ingress:meta_cloud']}).apply,false));
test('another numbered source remains excluded',()=>assert.equal(run({}, {channel:'ingress:meta_cloud:456',channelAliases:['ingress:meta_cloud']}, {arrivalChannels:['ingress:meta_cloud:123']}).apply,false));
test('arrival',()=>assert.equal(run().patch.status,'Novo Lead'));
test('reply',()=>assert.equal(run({status:'Novo Lead'},{fromMe:true}).patch.status,'Em Atendimento'));
test('incoming does not regress',()=>assert.equal(run({status:'Em Atendimento'}).apply,false));
test('manual respected',()=>assert.equal(run({status:'Novo Lead',_planeje_message_status:{manual:true}}).reason,'manual'));
test('existing advanced respected',()=>assert.equal(run({status:'Agendado'},{fromMe:true}).reason,'existing_manual_stage'));
test('groups excluded',()=>assert.equal(run({}, {isGroup:true}).apply,false));
test('reactions excluded',()=>assert.equal(run({}, {type:'reaction'}).apply,false));
test('old excluded',()=>assert.equal(run({}, {at:'2026-10-15T10:00:00Z'}).apply,false));
test('future excluded',()=>assert.equal(run({}, {at:'2026-10-17T10:00:00Z'}).apply,false));
test('scoped channel',()=>assert.equal(run({}, {},{arrivalChannels:['canal2']}).apply,false));
test('appointment fills date and time',()=>{const p=run({status:'Em Atendimento'},{fromMe:true,text:'Agendada 13/11 às 15h30'});assert.equal(p.patch.status,'Agendado');assert.equal(p.patch.data_agendamento,'2026-11-13');assert.equal(p.patch.data_agendamento_hora,'15:30');});
test('customer cannot confirm appointment rule',()=>assert.notEqual(run({}, {text:'Agendada 13/11 às15h'}).reason,'appointment'));
test('no invented time',()=>assert.equal(run({}, {fromMe:true,text:'Agendada 13/11'}).patch.data_agendamento_hora,null));
test('duplicate/out of order',()=>assert.equal(run({_planeje_message_status:{lastMessageAt:at,lastMessageId:'msg1',lastChannel:'canal1'}}).apply,false));
test('distinct messages in the same second',()=>assert.equal(run({status:'Novo Lead',_planeje_message_status:{lastMessageAt:at,lastMessageId:'another',lastChannel:'canal1'}},{fromMe:true}).patch.status,'Em Atendimento'));
test('keyword sender',()=>{const keywords=[{id:'k',words:'orçamento',status:'Perdido',sender:'team',channels:[]}];assert.equal(run({}, {text:'ORÇAMENTO'}, {keywords}).reason,'arrival');assert.equal(run({}, {text:'ORÇAMENTO',fromMe:true},{keywords}).reason,'keyword:k');});
test('keyword channel',()=>assert.equal(run({}, {text:'orçamento'},{keywords:[{id:'k',words:'orçamento',status:'Perdido',sender:'lead',channels:['canal2']}]}).reason,'arrival'));
test('first keyword wins',()=>assert.equal(run({}, {text:'orçamento'},{keywords:[{id:'k',words:'orçamento',status:'Perdido',sender:'lead',channels:[]},{id:'j',words:'orçamento',status:'Agendado',sender:'lead',channels:[]}]}).reason,'keyword:k'));
test('commercial statuses rejected',()=>assert.ok(validateMessageRules({...rules,entryStatus:'Venda Realizada'},catalog).length));
test('missing date column rejected',()=>assert.ok(validateMessageRules({...rules,appointmentField:'observacao'},catalog).length));
test('patch preserves server metadata',()=>assert.deepEqual(miniCrmPatchDifference({status:'Novo Lead',observacao:'antiga',_planeje_message_status:{manual:false}},{status:'Novo Lead',observacao:'nova',_planeje_message_status:{manual:true}}),{observacao:'nova'}));
test('hour stores separately',()=>{assert.equal(appointmentTimeKey('data_agendamento'),'data_agendamento_hora');const m=patchMiniCrm({data_agendamento:'2026-11-13'},'data_agendamento_hora','9:30','time');assert.equal(m.data_agendamento,'2026-11-13');assert.equal(appointmentTime(m,catalog.columns),'09:30');assert.equal(patchMiniCrm(m,'data_agendamento_hora','25:00','time').data_agendamento_hora,'09:30');assert.ok(!('data_agendamento_hora' in patchMiniCrm(m,'data_agendamento_hora','','time')));});
test('default schema matches UI',()=>{const setup=resolveMiniCrmSetup(presetForNicho('Loja de noivas'),null,[]);const backend=messageRulesCatalog({nicho:'Loja de noivas'},null);assert.ok(backend.columns.every(c=>setup.columns.some(s=>s.key===c.key)));});
console.log(JSON.stringify({passed:count}));
