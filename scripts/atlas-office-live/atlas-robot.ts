import type {WorldLandmark} from '../atlas-office-preview/vendor/habblaud/client/src/world/api';
import {atlasSprite,type RobotDirection} from './atlas-sprite';
import {OfficeRobotTour,robotVisits,robotDestination} from '../../src/lib/atlasOfficeRobot.js';

/** Host-owned mascot, separate from the roster and the operational manager. */
export function atlasRobot(getData:()=>any,getBusinessTime:()=>boolean):WorldLandmark{
 const tour=new OfficeRobotTour();
 let direction:RobotDirection='down';
 let state:any={x:136,y:232,moving:false,visit:null},tick=0,lastData:any=null,lastVisitCheck=0;
 const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 const actor:WorldLandmark={id:'atlas-manager',x:112,y:179,w:48,h:68,foreground:true,
  pick(){return robotDestination(tour.current);},
  update(now,dt,frame){
   tick=now;const value=getData();if(value!==lastData||now-lastVisitCheck>1000){lastData=value;lastVisitCheck=now;tour.setVisits(robotVisits(value));}
   const before=state;state=tour.update(now,dt,frame,{businessTime:getBusinessTime(),reducedMotion:reduced()});
   const dx=state.x-before.x,dy=state.y-before.y;
   if(state.moving&&Math.hypot(dx,dy)>.01)direction=Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up');
   else if(state.visit){const p=frame.person(state.visit.personId);if(p){const dx=p.x-state.x,dy=p.y-state.y;direction=Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up');}}
   actor.x=state.x-24;actor.y=state.y-53;
  },
  draw(ctx,night,selected){
   const{x,y,visit,moving}=state,motion=!reduced(),walk=moving&&motion;
   const animation=walk?Math.floor(tick/140)%4:motion&&tick%4800>4600?1:0;
   const sprite=atlasSprite(direction,walk,animation);
   ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.imageSmoothingEnabled=false;
   ctx.fillStyle='rgba(25,13,52,.22)';ctx.fillRect(-7,-1,14,3);
   if(selected||visit){ctx.strokeStyle='#b797ff';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(0,0,11,3,0,0,Math.PI*2);ctx.stroke();}
   ctx.drawImage(sprite.canvas,-sprite.ax,-sprite.ay);
   const working=getData()?.manager_activity?.workers?.some((w:any)=>w.agent==='central')&&Date.now()-Date.parse(getData()?.manager_activity?.heartbeat_at)<90000;
   const label=visit?'Atlas → '+visit.name:'Atlas',sub=visit?.kind==='mission'?visit.text:visit?(moving?'Pergunta registrada':'Aguardando resposta'):working?'Coordenando a consulta':(getBusinessTime()?'Acompanhando a agência':'Disponível para você');
   ctx.font='bold 9px Arial,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
   const w=Math.min(190,Math.max(45,ctx.measureText(label).width+12));
   ctx.fillStyle='#f6f0ff';ctx.beginPath();ctx.roundRect(-w/2,-49,w,13,3);ctx.fill();ctx.strokeStyle='#a78bfa';ctx.lineWidth=1;ctx.stroke();ctx.fillStyle='#6b3fa0';ctx.fillText(label,0,-42,w-8);
   ctx.font='8px Arial,sans-serif';const sw=Math.min(170,ctx.measureText(sub).width+12);ctx.fillStyle=night>.4?'#342944e8':'#fffef5e8';ctx.fillRect(-sw/2,5,sw,11);ctx.fillStyle=night>.4?'#eee5ff':'#6d587f';ctx.fillText(sub,0,10,sw-6);
   ctx.restore();
  }
 };
 return actor;
}
