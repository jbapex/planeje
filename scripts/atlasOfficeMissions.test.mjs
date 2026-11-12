import test from 'node:test';
import assert from 'node:assert/strict';
import * as missions from '../src/lib/atlasOfficeMissions.js';
import {liveOfficeSnapshot,officeAgentStates} from '../src/lib/atlasOfficePresentation.js';
import {robotVisits} from '../src/lib/atlasOfficeRobot.js';
import * as robot from '../src/lib/atlasOfficeRobot.js';

const at='2026-10-19T12:00:00Z',now=Date.parse(at);
const job={id:'job',conversation_id:'conversation',client_id:'client',status:'running',started_at:at,created_at:at,
 task:'PRIVATE ORDER',title:'PRIVATE TITLE',result:'PRIVATE RESULT',steps:[
  {agent:'central',kind:'coordination',status:'running',at,summary:'PRIVATE CONTEXT'},
  {agent:'operacao',parent:'central',kind:'delegation',status:'running',at},
  {agent:'operacao',parent:'central',kind:'read',status:'completed',at,source:{section:'tasks'},summary:'PRIVATE TASK'},
 ]};
const data=()=>({office:{profiles:[{id:'person',full_name:'Ana Exemplo',status:'active'}],functions:[],tasks:[],clients:[]},config:{enabled:true},state:{heartbeat_at:at},activity:{complete:true,threads:[]},client_states:[],questions:[],proposals:[]});

test('real running lifecycle exposes a named specialist without private prompt or record content',()=>{
 const activity=missions.officeMissionActivity([job],{heartbeatAt:at});
 assert.equal(activity.running,1);
 const specialist=activity.workers.find(w=>w.agent==='operacao');
 assert.equal(specialist.name,'Operação');assert.equal(specialist.room,'operation');
 assert.equal(specialist.job_id,'job');assert.equal(specialist.conversation_id,'conversation');
 assert.equal(specialist.text,'Conferindo tarefas');assert.doesNotMatch(JSON.stringify(activity),/PRIVATE/);
});

test('completed specialist, finished job and queued job never pretend to be working',()=>{
 const ended=structuredClone(job);ended.steps.push({agent:'operacao',kind:'answer',status:'completed',at});
 assert.equal(missions.officeMissionActivity([ended],{heartbeatAt:at}).workers.some(w=>w.agent==='operacao'),false);
 for(const status of ['queued','waiting_team','completed','failed','cancelled']){
  const activity=missions.officeMissionActivity([{...job,status}],{heartbeatAt:at});
  assert.equal(activity.workers.length,0);assert.equal(activity.running,0);
  assert.equal(activity.queued,status==='queued'?1:0);assert.equal(activity.waiting_team,status==='waiting_team'?1:0);
 }
});

test('a specialist waiting for a delegated colleague is not animated as reading a source',()=>{
 const nested=structuredClone(job);nested.steps.push({agent:'clientes',parent:'operacao',kind:'delegation',status:'running',at});
 const d=data();d.manager_activity=missions.officeMissionActivity([nested],{heartbeatAt:at});
 assert.equal(d.manager_activity.workers.find(w=>w.agent==='operacao').text,'Aguardando Clientes');
 const agents=liveOfficeSnapshot(d,{now,businessTime:true}).agents;
 assert.equal(agents.find(a=>a.id==='atlas-ia:operacao').status,'waiting');
 assert.equal(agents.find(a=>a.id==='atlas-ia:clientes').status,'working');
});

test('a specialist delegated again uses its current parent rather than an older delegation',()=>{
 const nested={...job,steps:[
  {agent:'central',kind:'coordination',status:'running',at},
  {agent:'clientes',parent:'central',kind:'delegation',status:'running',at},
  {agent:'operacao',parent:'clientes',kind:'delegation',status:'running',at},
  {agent:'operacao',parent:'clientes',kind:'answer',status:'completed',at},
  {agent:'clientes',parent:'central',kind:'answer',status:'completed',at},
  {agent:'operacao',parent:'central',kind:'delegation',status:'running',at},
  {agent:'clientes',parent:'operacao',kind:'delegation',status:'running',at},
  {agent:'clientes',parent:'operacao',kind:'read',status:'completed',at,source:{section:'conversations',available:true}},
 ]};
 const workers=missions.officeMissionActivity([nested],{heartbeatAt:at}).workers;
 assert.equal(workers.find(w=>w.agent==='clientes').phase,'working');
 assert.equal(workers.find(w=>w.agent==='clientes').text,'Conferindo grupos');
 assert.equal(workers.find(w=>w.agent==='operacao').text,'Aguardando Clientes');
 assert.equal(workers.find(w=>w.agent==='central').text,'Aguardando Operação');
});

test('map shows the real AI specialist outside working hours while the employee stays resting',()=>{
 const d=data();d.manager_activity=missions.officeMissionActivity([job],{heartbeatAt:at});
 const snapshot=liveOfficeSnapshot(d,{now,businessTime:false});
 const specialist=snapshot.agents.find(a=>a.id==='atlas-ia:operacao');
 assert.equal(specialist.status,'working');assert.equal(specialist.resting,false);
 assert.equal(specialist.roomId,'operation');assert.match(specialist.name,/IA/);
 assert.equal(snapshot.agents.find(a=>a.id==='person').resting,true);
 assert.equal(officeAgentStates(d,{now,businessTime:false}).counts.working,0);
 assert.equal(d.office.tasks.length,0);
});

test('stale or missing primary worker heartbeat does not keep AI characters working',()=>{
 for(const heartbeatAt of [null,'2026-10-19T11:58:00Z']){
  const d=data();d.manager_activity=missions.officeMissionActivity([job],{heartbeatAt});
  const live=missions.liveOfficeMissions(d.manager_activity,{now});
  assert.equal(live.fresh,false);assert.equal(live.workers.length,0);
  assert.equal(liveOfficeSnapshot(d,{now,businessTime:true}).agents.some(a=>a.id==='atlas-ia:operacao'),false);
 }
});

test('robot may visit a real AI consultation without inventing an employee message',()=>{
 const d=data();d.manager_activity=missions.officeMissionActivity([job],{heartbeatAt:at});
 d.activity.complete=false;
 const visits=robotVisits(d,{now});
 assert.equal(visits[0].kind,'mission');assert.equal(visits[0].personId,'atlas-ia:operacao');
 assert.equal(visits[0].jobId,'job');assert.equal(visits[0].threadId,undefined);
 d.manager_activity=missions.officeMissionActivity([{...job,status:'completed'}],{heartbeatAt:at});
 assert.deepEqual(robotVisits(d,{now}),[]);
});

test('clicking the robot keeps the exact mission or employee thread instead of another open conversation',()=>{
 assert.equal(robot.robotDestination({kind:'mission',jobId:'job-b'}),'mission:job-b');
 assert.equal(robot.robotDestination({threadId:'thread-b'}),'thread-b');
 assert.equal(robot.robotDestination(null),'conversation');
});
