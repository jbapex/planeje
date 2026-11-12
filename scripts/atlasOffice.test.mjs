import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {officeRows,officeTask,officeBusinessTime,clientOfficeContext,fingerprintContext,validateOfficeAnalysis,OFFICE_FIELDS} from '../supabase/functions/_shared/atlasOffice.js';
import {scanOffice,boundedOfficeContext} from '../supabase/functions/_shared/atlasOfficeManager.js';

let checks=0;const ok=(value)=>{assert.ok(value);checks++;};
function fakeRows(rows,{fail=false}={}) {
  const calls=[];return {calls,from(table){let lower=null,n=500;const filters=[];const q={select(fields){calls.push({table,fields});return q;},order(){return q;},limit(v){n=v;return q;},gt(k,v){lower=v;return q;},eq(k,v){filters.push([k,v]);return q;},then(resolve,reject){return Promise.resolve(fail?{data:null,error:{code:'denied'}}:{data:rows.filter(r=>(lower===null||r.id>lower)&&filters.every(([k,v])=>r[k]===v)).slice(0,n),error:null}).then(resolve,reject);}};return q;}};
}
const records=Array.from({length:1207},(_,i)=>({id:String(i).padStart(5,'0')}));
const db=fakeRows(records);assert.equal((await officeRows(db,'tarefas')).length,1207);checks++;
ok(db.calls.every(c=>c.fields===OFFICE_FIELDS.tarefas));assert.equal(db.calls.length,3);checks++;
await assert.rejects(()=>officeRows(fakeRows([],{fail:true}),'tarefas'),/não foi considerada vazia/);checks++;
await assert.rejects(()=>officeRows(db,'secrets'),/não permitida/);checks++;
ok(!Object.values(OFFICE_FIELDS).join(',').match(/access_token|password|whatsapp\b/));
ok(officeBusinessTime(new Date('2026-10-15T11:00:00Z')));
ok(!officeBusinessTime(new Date('2026-10-15T20:00:00Z')));
ok(!officeBusinessTime(new Date('2026-10-17T14:00:00Z')));
const now=new Date('2026-10-15T13:00:00Z');
ok(!officeTask({status:'custom_done',due_date:'2026-10-01'},[{value:'custom_done',is_terminal:true}],now).deadline_flags.length);
ok(!officeTask({status:'production',due_date:'2026-10-01',production_delivered_at:'2026-10-03'},[],now).deadline_flags.length);
ok(officeTask({status:'production',due_date:'2026-10-01'},[],now).deadline_flags.length===1);
const owner='00000000-0000-4000-8000-000000000001',client='00000000-0000-4000-8000-000000000002';
const office={clients:[{id:client,empresa:'Exemplo',objetivo_meta:'Aumentar contatos qualificados',meta_resumo:{syncedAt:'2026-10-15',spend:10}}],profiles:[{id:owner,full_name:'Pessoa'}],tasks:[],functions:[],projects:[],campaigns:[],conversations:[],memories:[]};
const context=clientOfficeContext(office,client);ok(context.direction_known);
const old=fingerprintContext(context);office.clients[0].meta_resumo.syncedAt='2026-10-16';assert.equal(fingerprintContext(clientOfficeContext(office,client)),old);checks++;
office.clients[0].meta_resumo.spend=11;ok(fingerprintContext(clientOfficeContext(office,client))!==old);
const proposal={summary:'Verificar o material',question:'',task_proposals:[{title:'Conferir material',description:'Preparar material confirmado',type:'arte',assignee_ids:[owner],due_date:null}]};
assert.equal(validateOfficeAnalysis(proposal,context).proposals.length,1);checks++;
assert.throws(()=>validateOfficeAnalysis({...proposal,task_proposals:[{...proposal.task_proposals[0],assignee_ids:['intruso']}]},context),/pessoa/);checks++;
assert.equal(validateOfficeAnalysis(proposal,{...context,direction_known:false}).proposals.length,0);checks++;
ok(boundedOfficeContext(context).coverage.tasks_total===0);

const hash=async s=>createHash('sha256').update(s).digest('hex');
async function simulation({snapshot=office,states=[],questions=[],lease='lease',at=now,fail=false}={}) {
  const writes=[],calls=[];
  const result=await scanOffice({office:snapshot,config:{},states,questions,proposals:[],hash,now:at,
    saveClient:async(id,patch)=>writes.push({kind:'state',id,...patch}),ask:async(...args)=>writes.push({kind:'question',args}),supersede:async()=>{},reserve:async()=>lease,finish:async(...args)=>calls.push({kind:'finish',args}),
    callModel:async()=>{calls.push({kind:'model'});if(fail)throw new Error('provider');return {value:proposal,tokens:100,usage:{total_tokens:100}};},saveProposal:async p=>writes.push({kind:'proposal',...p})});
  return {result,writes,calls};
}
let res=await simulation({at:new Date('2026-10-15T03:00:00Z')});ok(res.calls.length===0&&res.writes.length===0);
res=await simulation({states:[{client_id:client,analyzed_hash:await hash(fingerprintContext(clientOfficeContext(office,client)))}]});ok(res.result.unchanged===1&&res.calls.length===0);
res=await simulation({snapshot:{...office,clients:[{...office.clients[0],objetivo_meta:null}]}});ok(res.result.questions===1&&res.calls.length===0&&res.writes.every(w=>w.kind!=='proposal'));
res=await simulation({snapshot:{...office,clients:[{...office.clients[0],objetivo_meta:null}]},questions:[{client_id:client,state:'answered'}]});ok(res.result.questions===1&&res.writes.find(w=>w.kind==='question').args[1]==='direction:v1:1');
res=await simulation({questions:[{client_id:client,state:'open'}]});ok(res.calls.length===0&&res.result.questions===0);
res=await simulation({lease:null});ok(res.result.budget_wait===1&&res.calls.length===0);
res=await simulation({lease:null,snapshot:{...office,clients:[...office.clients,{id:'00000000-0000-4000-8000-000000000003',empresa:'Outro cliente',objetivo_meta:null}]}});ok(res.result.budget_wait===1&&res.result.questions===1&&res.calls.length===0);
res=await simulation();ok(res.result.model_calls===1&&res.writes.filter(w=>w.kind==='proposal').length===1);
res=await simulation({fail:true});ok(res.calls.find(c=>c.kind==='finish').args[1]===null&&res.writes.some(w=>w.status==='error'));
res=await simulation({states:[{client_id:client,requested_at:'2026-10-15T01:00:00Z'}],at:new Date('2026-10-15T03:00:00Z')});ok(res.result.model_calls===1);
// The manager never receives an operational mutation callback.
ok(!['createTask','approveTask','updateTask'].some(key=>String(scanOffice).includes(key)));
console.log(JSON.stringify({checks,passed:true}));
