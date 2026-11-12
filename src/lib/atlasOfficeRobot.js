/** Presentation only: a visit is an existing Atlas message, never a new call. */
import {liveOfficeMissions} from './atlasOfficeMissions.js';
export const robotDestination=visit=>visit?.threadId||(visit?.kind==='mission'&&visit.jobId?'mission:'+visit.jobId:'conversation');
export function robotVisits(data,{now=Date.now()}={}){
 const missions=liveOfficeMissions(data?.manager_activity,{now}).workers.filter(w=>w.agent!=='central').map(w=>({key:'mission:'+w.job_id+':'+w.agent,kind:'mission',jobId:w.job_id,personId:w.id,name:w.name,client:'Consulta de IA',state:'running',text:w.text,at:w.at}));
 if(!data?.activity?.complete)return missions;
 const people=new Map((data.office?.profiles||[]).filter(p=>p.status==='active').map(p=>[p.id,p]));
 return[...missions,...(data.activity.threads||[]).filter(t=>['awaiting_reply','needs_owner','delivery_review'].includes(t.state)&&people.has(t.current_person_id)&&t.last_atlas?.[0]?.id&&t.last_atlas[0].content&&(!t.last_human?.[0]||String(t.last_atlas[0].created_at)>=String(t.last_human[0].created_at)))
 .map(t=>({key:t.id+':'+t.last_atlas[0].id+':'+t.current_person_id,threadId:t.id,personId:t.current_person_id,name:people.get(t.current_person_id).full_name.split(' ')[0],client:(data.office.clients||[]).find(c=>c.id===t.client_id)?.empresa||'Cliente',state:t.state,at:t.last_atlas[0].created_at}))
 .sort((a,b)=>String(b.at).localeCompare(String(a.at))||a.key.localeCompare(b.key))];
}

/** One persistent visitor. Refreshes do not replay a trip or reset a dwell. */
export class OfficeRobotTour{
 constructor(){this.visits=[];this.current=null;this.position={x:136,y:232};this.path=[];this.goal=null;this.arrivedAt=0;this.checkedAt=0;this.idleStep=0;this.lastIdle=0;this.moving=false;}
 setVisits(visits){
  const oldKeys=new Set(this.visits.map(v=>v.key));this.visits=visits;
  const fresh=visits.find(v=>!oldKeys.has(v.key));
  const next=fresh||visits.find(v=>v.key===this.current?.key)||visits[0]||null;
  if(next?.key!==this.current?.key){this.current=next;this.path=[];this.goal=null;this.arrivedAt=0;this.checkedAt=0;}
  else this.current=next;
 }
 update(now,dt,frame,{reducedMotion=false,businessTime=true}={}){
  if(this.current&&this.visits.length>1&&this.arrivedAt&&now-this.arrivedAt>12000){const i=this.visits.findIndex(v=>v.key===this.current.key);this.current=this.visits[(i+1)%this.visits.length];this.path=[];this.goal=null;this.arrivedAt=0;this.checkedAt=0;}
  const person=this.current?frame.person(this.current.personId):null;
  const stops=[{x:136,y:232},{x:375,y:232},{x:520,y:232}];
  if(!this.current&&businessTime&&!reducedMotion&&now-this.lastIdle>16000){this.idleStep=(this.idleStep+1)%stops.length;this.lastIdle=now;this.goal=null;}
  const desired=person?{x:person.x-30,y:person.y}:stops[this.current?0:this.idleStep];
  if(now-this.checkedAt>=1000||!this.goal){
   this.checkedAt=now;
   if(!this.goal||Math.hypot(this.goal.x-desired.x,this.goal.y-desired.y)>18){
    const route=frame.route(this.position,desired);
    if(route?.length){this.path=route;this.goal={...desired};this.arrivedAt=0;}
    else if(route){this.path=[];this.goal={...desired};this.arrivedAt=now;}
   }
  }
  this.moving=false;
  if(reducedMotion&&this.path.length){this.position={...this.path[this.path.length-1]};this.path=[];this.arrivedAt=now;}
  else{
   let budget=Math.max(0,Math.min(.1,dt))*70;
   while(this.path.length&&budget>0){const next=this.path[0],d=Math.hypot(next.x-this.position.x,next.y-this.position.y);if(d<=budget){this.position={...next};this.path.shift();budget-=d;}else{this.position={x:this.position.x+(next.x-this.position.x)*budget/d,y:this.position.y+(next.y-this.position.y)*budget/d};budget=0;}this.moving=true;}
   if(!this.path.length&&!this.arrivedAt)this.arrivedAt=now;
  }
  return{...this.position,moving:this.moving,visit:this.current,waiting:!!this.current&&!this.moving,personVisible:!!person};
 }
}
