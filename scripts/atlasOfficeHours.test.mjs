import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {officeClock} from '../src/lib/atlasOfficeClock.js';
import {officeAgentStates,liveOfficeSnapshot} from '../src/lib/atlasOfficePresentation.js';
const base='scripts/atlas-office-preview/vendor/habblaud/client/src';
const bundled=await build({stdin:{contents:`export {Sim} from './${base}/world/sim/sim.ts';export * as art from './${base}/art/index.ts';export {ambientAt} from './${base}/world/render/daylight.ts';`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent'});
const {Sim,art,ambientAt}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const day=Date.parse('2026-10-16T13:00:00Z'),night=Date.parse('2026-10-16T03:20:00Z');
function fixture(now=night){return {config:{enabled:true},business_time:officeClock(now).businessTime,state:{heartbeat_at:new Date(now).toISOString()},office:{profiles:[{id:'ana',full_name:'Ana Exemplo'},{id:'bia',full_name:'Bia Exemplo'}],functions:[],tasks:[{id:'t1',assignee_ids:['ana'],client_id:'c1',done:false,title:'Conferir campanha'},{id:'t2',assignee_ids:['bia'],client_id:'c2',done:false,title:'Conferir material'}]},questions:[{client_id:'c1',state:'open'}],proposals:[{client_id:'c2',state:'pending',assignee_ids:['bia']}],client_states:[]};}
const opts={theme:'none',daylight:'auto',dayNight:true,liveliness:'calm',showNames:true,bubbles:'important',followSelected:false};
function simulate(d,now){const sim=new Sim(art,()=>opts,null);sim.applySnapshot(liveOfficeSnapshot(d,{now}),now);sim.update(.016,now+16);return sim;}
test('São Paulo clock, weekdays and exact 08:00/17:00 boundaries ignore the device timezone',()=>{
 for(const [at,expected,hour] of [['2026-10-16T10:59:59Z',false,7],['2026-10-16T11:00:00Z',true,8],['2026-10-16T19:59:59Z',true,16],['2026-10-16T20:00:00Z',false,17],['2026-10-17T13:00:00Z',false,10],['2026-10-18T13:00:00Z',false,10],['2026-10-19T11:00:00Z',true,8],['2026-10-16T03:00:00Z',false,0]]){const c=officeClock(Date.parse(at));assert.equal(c.businessTime,expected);assert.equal(Math.floor(c.hour),hour);}
 assert.throws(()=>officeClock(NaN));
});
test('scene follows dawn, daylight, sunset and night continuously across midnight',()=>{
 const phases=[['08:30','Amanhecer'],['16:00','Dia'],['21:00','Entardecer'],['01:00','Noite'],['03:20','Madrugada']];
 for(const [time,phase] of phases)assert.equal(officeClock(Date.parse('2026-10-16T'+time+':00Z')).phase,phase);
 assert.equal(ambientAt(officeClock(day).hour).night,0);
 assert.equal(ambientAt(officeClock(night).hour).night,1);
 assert.ok(ambientAt(18).night>0&&ambientAt(18).night<1);
 assert.ok(Math.abs(ambientAt(23.999).outside[0]-ambientAt(0).outside[0])<=1);
});
test('rest preserves real question/proposal counts and does not mutate source records',()=>{
 const d=fixture(),before=structuredClone(d),states=officeAgentStates(d,{now:night}),snap=liveOfficeSnapshot(d,{now:night});
 assert.equal(states.counts.waiting,1);assert.equal(states.counts.approval,1);
 assert.ok(states.people.every(p=>p.resting));assert.ok(snap.agents.every(a=>a.status==='idle'&&a.resting&&!a.waitingFor));
 assert.deepEqual(d,before);
});
test('both waiting and approval characters actually sleep and stay at their desks',()=>{
 const sim=simulate(fixture(),night);
 for(const ch of sim.chars.values()){assert.equal(ch.pose,'sleep');assert.equal(ch.atSpot,ch.homeSpot);assert.equal(sim.social.canJoin(ch,night),false);}
 for(let i=1;i<=180;i++)sim.update(1,night+i*1000);
 for(const ch of sim.chars.values()){assert.equal(ch.pose,'sleep');assert.equal(ch.atSpot,ch.homeSpot);assert.equal(ch.gathering,null);}
});
test('only an actual fresh analysis wakes its related character; stale/error/queued do not',()=>{
 const d=fixture();d.client_states=[{client_id:'c1',status:'analyzing',retry_after:new Date(night+60000).toISOString()}];
 let snap=liveOfficeSnapshot(d,{now:night});assert.equal(snap.agents[0].status,'working');assert.equal(snap.agents[0].resting,false);assert.equal(snap.agents[1].resting,true);
 const sim=simulate(d,night);assert.equal(sim.chars.get('ana').pose,'type');assert.equal(sim.chars.get('bia').pose,'sleep');
 for(const patch of [{state:{heartbeat_at:new Date(night-100000).toISOString()}},{client_states:[{client_id:'c1',status:'error'}]},{client_states:[{client_id:'c1',status:'queued'}]},{client_states:[{client_id:'c1',status:'analyzing',retry_after:new Date(night-1).toISOString()}]}])assert.equal(liveOfficeSnapshot({...d,...patch},{now:night}).agents[0].resting,true);
});
test('a completed manual analysis returns to sleep; next business morning restores pending hands',()=>{
 const d=fixture(),sim=simulate(d,night);
 d.client_states=[{client_id:'c1',status:'analyzing',retry_after:new Date(night+60000).toISOString()}];
 sim.applySnapshot(liveOfficeSnapshot(d,{now:night+1000}),night+1000);sim.update(.016,night+1016);assert.equal(sim.chars.get('ana').pose,'type');
 d.client_states=[];sim.applySnapshot(liveOfficeSnapshot(d,{now:night+2000}),night+2000);sim.update(.016,night+2016);assert.equal(sim.chars.get('ana').pose,'sleep');
 d.state.heartbeat_at=new Date(day).toISOString();d.business_time=true;
 sim.applySnapshot(liveOfficeSnapshot(d,{now:day}),day);sim.update(.016,day+16);
 for(const ch of sim.chars.values()){assert.equal(ch.pose,'raise_hand');assert.equal(ch.info.resting,false);}
});
test('the idle-to-rest transition interrupts an outing even when the queue status stays idle',()=>{
 const d=fixture(day);d.questions=[];d.proposals=[];const sim=simulate(d,day),ch=sim.chars.get('ana');
 ch.queue.push({t:'act',pose:'wave',ms:60000});
 d.business_time=false;d.state.heartbeat_at=new Date(night).toISOString();
 sim.applySnapshot(liveOfficeSnapshot(d,{now:night}),night);sim.update(.016,night+16);
 assert.equal(ch.pose,'sleep');assert.equal(ch.queue.length,0);
});
test('paused monitoring rests even in daytime; requested working state takes precedence',()=>{
 const d=fixture(day);d.config.enabled=false;assert.ok(liveOfficeSnapshot(d,{now:day}).agents.every(a=>a.resting));
 d.client_states=[{client_id:'c1',status:'analyzing',retry_after:new Date(day+60000).toISOString()}];
 assert.equal(liveOfficeSnapshot(d,{now:day}).agents[0].resting,false);
});
