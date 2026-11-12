import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
let calls=0,fail=false;
globalThis.__teamDb={rpc:async(name,args)=>{
 assert.equal(name,'atlas_team_list_page');calls++;
 if(fail&&args.p_before_id)return {error:{message:'Página indisponível'}};
 const start=args.p_before_id?Number(args.p_before_id):0,items=Array.from({length:Math.min(50,113-start)},(_,i)=>({id:String(start+i+1)}));
 return {data:{items,complete:start+50>=113,next:start+50<113?{id:String(start+50),at:'fixture'}:null}};
}};
const source=readFileSync(new URL('../src/lib/atlasTeam.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replaceAll('import.meta.env','({})');
const api=await import('data:text/javascript;base64,'+Buffer.from('const supabase=globalThis.__teamDb;\n'+source).toString('base64'));
assert.equal((await api.teamRpc('atlas_team_list')).length,113);assert.equal(calls,3);
fail=true;await assert.rejects(api.teamRpc('atlas_team_list'),/Página/);
const t={current_person_id:'a',state:'awaiting_reply',last_atlas_at:'2026-10-27',management_data:{dialogue:{waiting_on:'client'}}};
assert.equal(api.teamNeedsCall(t,'a'),false);assert.equal(api.teamNeedsAnswer(t,'a'),false);
t.management_data={};assert.equal(api.teamNeedsAnswer(t,'a'),true);assert.equal(api.teamNeedsCall(t,'other'),false);
t.management_data={dispatch_pending:true};assert.equal(api.teamNeedsAnswer(t,'a'),false);
for(const state of ['delivery_review','needs_owner'])for(const waiting_on of ['client','none'])assert.equal(api.teamNeedsAnswer({...t,state,management_data:{dialogue:{waiting_on}}},'a'),true);
console.log('Atlas team dialogue: pagination 113, page error, personal attention passed');
