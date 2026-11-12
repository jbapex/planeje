import type {WorldLandmark} from '../atlas-office-preview/vendor/habblaud/client/src/world/api';
import {appearanceFromSeed,characterSprite} from '../atlas-office-preview/vendor/habblaud/client/src/art';
import {clientWalkers,pickClientWalker} from '../../src/lib/atlasClientWalk.js';
const T=16;
const appearances=new Map();
const logos=new Map<string,HTMLImageElement>();
function loadedLogo(url:string|null){
 if(!url)return null;
 let img=logos.get(url);
 if(!img){img=new Image();img.crossOrigin='anonymous';img.referrerPolicy='no-referrer';img.src=url;logos.set(url,img);}
 return img.complete&&img.naturalWidth>0?img:null;
}
const reducedMotion=()=>typeof matchMedia!=='undefined'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
/** A separate, host-owned building. It never creates rooms/agents or task execution state. */
export function clientHouse(roomCount:number,counts:{total:number;jb:number;apice:number;unclassified:number},clients:any[]=[],selectedClient:()=>string|null=()=>null,motionPaused:()=>boolean=()=>false):WorldLandmark {
 const cols=2+Math.max(1,Math.ceil(roomCount/2)),w=38*T,h=25*T,x=(cols*16*T-w)/2,y=41*T;
 return {id:'clients-house',x,y,w,h,pick:(px,py)=>pickClientWalker(clientWalkers(clients,Date.now(),{reducedMotion:reducedMotion()||motionPaused()}),px,py),draw(ctx,night,selected){
  ctx.translate(x,y);ctx.imageSmoothingEnabled=false;
  const mix=(a:number,b:number)=>Math.round(a+(b-a)*night);
  const shade=(day:number[],dark:number[])=>`rgb(${day.map((v,i)=>mix(v,dark[i])).join(',')})`;
  const rect=(x:number,y:number,w:number,h:number,color:string)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);};
  const ink=shade([51,43,66],[229,220,239]),edge=shade([84,67,100],[65,54,87]);
  const floor=shade([237,227,210],[175,157,143]),tile=shade([218,207,190],[155,141,133]);
  const roof=shade([111,74,147],[62,47,93]),roofLight=shade([141,101,171],[82,58,111]);
  // Foundation, pathway from the opposite sidewalk and small front garden.
  rect(24,39,w-40,h-62,'rgba(13,16,28,.3)');
  rect(w/2-24,8,48,45,shade([212,209,201],[92,98,120]));
  for(let yy=8;yy<50;yy+=12)rect(w/2-24,yy,48,1,shade([185,185,177],[74,79,99]));
  rect(16,48,w-32,h-75,edge);rect(22,54,w-44,h-87,floor);
  for(let xx=24;xx<w-24;xx+=24)for(let yy=55;yy<h-35;yy+=24){rect(xx,yy,22,1,tile);rect(xx,yy,1,22,tile);}
  // Shared roof/wall band; both portfolios belong to this single house.
  for(let row=0;row<4;row++){const inset=(3-row)*5;rect(13+inset,32+row*6,w-26-inset*2,6,row%2?roof:roofLight);}
  rect(13,56,w-26,5,edge);rect(24,h-40,w-48,7,edge);
  rect(w/2-23,48,46,13,shade([119,160,174],[117,144,165]));
  rect(w/2-2,49,3,12,'#e6cf98');
  // Central corridor/foyer and partitions.
  rect(w/2-22,63,44,173,shade([215,205,217],[147,130,155]));
  rect(w/2-29,64,5,155,edge);rect(w/2+24,64,5,155,edge);
  const shelf=(xx:number,yy:number)=>{
   rect(xx,yy,56,24,shade([117,85,64],[95,73,70]));
   const books=['#a690b6','#9fbcad','#ccb98d','#a4abc5'];
   for(let k=0;k<11;k++)rect(xx+3+k*4,yy+3,3,15,books[k%books.length]);rect(xx,yy+20,56,3,edge);
  };
  const plant=(xx:number,yy:number)=>{rect(xx-5,yy+3,10,8,shade([158,112,79],[112,86,81]));rect(xx-9,yy-4,18,8,shade([92,136,88],[65,97,83]));rect(xx-5,yy-10,10,18,shade([111,155,99],[75,112,88]));};
  const table=(xx:number,yy:number,color:string)=>{
   rect(xx+8,yy-8,18,8,color);rect(xx+8,yy+34,18,8,color);
   rect(xx-7,yy+6,8,18,color);rect(xx+41,yy+6,8,18,color);
   rect(xx,yy,42,34,shade([164,128,92],[136,107,92]));rect(xx+2,yy+2,38,29,shade([213,183,139],[177,146,115]));
   rect(xx+8,yy+8,14,12,'#e6ded2');rect(xx+11,yy+11,8,1,'#a69bb1');rect(xx+27,yy+18,8,5,'#8f72b0');
  };
  const suite=(left:number,width:number,label:string,n:number,accent:string)=>{
   rect(left,68,width,23,shade([242,237,230],[225,213,192]));
   rect(left,68,4,23,accent);ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 16px Arial,sans-serif';ctx.fillStyle='#453951';ctx.fillText(label,left+width/2,80);
   shelf(left+11,100);shelf(left+width-68,100);
   table(left+width/2-21,146,accent);
   rect(left+10,147,38,35,shade([145,129,164],[102,93,129]));rect(left+13,150,31,12,shade([175,157,194],[130,115,155]));
   plant(left+width-22,174);plant(left+19,210);
   ctx.font='bold 14px Arial,sans-serif';ctx.fillStyle=ink;ctx.fillText(n+' cliente'+(n===1?'':'s'),left+width/2,211);
  };
  suite(31,239,'JB Apex',counts.jb,'#9f7bd1');suite(338,239,'Ápice Noivas',counts.apice,'#bd83b1');
  // A shared reception cabinet, lamps and front plants keep the two rooms connected.
  rect(w/2-14,196,28,25,shade([170,138,108],[127,104,99]));rect(w/2-10,197,20,3,'#e3d3b8');
  plant(8,214);plant(w-8,214);
  if(night>.02){
   for(const lx of [25,w-25]){const g=ctx.createRadialGradient(lx,110,1,lx,110,43);g.addColorStop(0,`rgba(255,218,139,${night*.25})`);g.addColorStop(1,'rgba(255,218,139,0)');ctx.fillStyle=g;ctx.fillRect(lx-43,67,86,86);rect(lx-3,99,6,7,'#ffe5a5');}
  }
  // Shared reception for clients whose operation has not been classified yet.
  rect(25,237,w-50,5,edge);rect(26,243,w-52,112,shade([229,222,235],[163,148,176]));
  ctx.textAlign='center';ctx.fillStyle=ink;ctx.font='bold 14px Arial,sans-serif';
  ctx.fillText('Recepção · carteira a confirmar',w/2,257);
  plant(44,340);plant(w-44,340);
  const walkers=clientWalkers(clients,Date.now(),{reducedMotion:reducedMotion()||motionPaused()});
  for(const avatar of walkers.sort((a,b)=>a.y-b.y)){
   if(!appearances.has(avatar.id))appearances.set(avatar.id,appearanceFromSeed(avatar.seed,{look:avatar.seed%2?'f':'m'}));
   const sprite=characterSprite({appearance:appearances.get(avatar.id),dir:avatar.dir,pose:avatar.pose as 'walk'|'stand',frame:avatar.frame,seated:false});
   ctx.fillStyle='rgba(20,15,35,.18)';ctx.fillRect(Math.round(avatar.x-7),Math.round(avatar.y-2),14,4);
   if(selectedClient()===avatar.id){ctx.strokeStyle='#d4b5ff';ctx.lineWidth=2;ctx.strokeRect(Math.round(avatar.x-11),Math.round(avatar.y-5),22,9);}
   ctx.drawImage(sprite.canvas,Math.round(avatar.x-sprite.ax),Math.round(avatar.y-sprite.ay));
   const color=avatar.operation==='unclassified'?'#62546d':avatar.operation==='apice'?'#915980':'#77529b',logo=loadedLogo(avatar.logo_url);
   ctx.save();ctx.imageSmoothingEnabled=true;ctx.beginPath();ctx.arc(avatar.x,avatar.y-43,12,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle=selectedClient()===avatar.id?'#d4b5ff':color;ctx.lineWidth=2;ctx.stroke();
   if(logo){const size=18,scale=Math.min(size/logo.naturalWidth,size/logo.naturalHeight),iw=logo.naturalWidth*scale,ih=logo.naturalHeight*scale;ctx.drawImage(logo,avatar.x-iw/2,avatar.y-43-ih/2,iw,ih);}
   else{ctx.font='bold 9px Arial,sans-serif';ctx.fillStyle=color;ctx.textAlign='center';ctx.fillText(avatar.initials,avatar.x,avatar.y-43,19);}
   ctx.restore();
   if(selectedClient()===avatar.id){ctx.font='bold 10px Arial,sans-serif';const labelW=Math.min(190,ctx.measureText(avatar.name).width+10);rect(Math.round(avatar.x-labelW/2),Math.round(avatar.y-73),labelW,14,color);ctx.fillStyle='#fff';ctx.textAlign='center';ctx.fillText(avatar.name,Math.round(avatar.x),Math.round(avatar.y-66),labelW-6);}
  }
  // Building sign and small live count; these are records, not customer presence.
  const signW=282,sx=(w-signW)/2;
  rect(sx-3,0,signW+6,30,selected?'#af8bea':'#483b5b');rect(sx,3,signW,24,'#f8f3fc');
  ctx.fillStyle='#75519f';ctx.textAlign='center';ctx.font='bold 18px Arial,sans-serif';ctx.fillText('⌂  Casa dos clientes',w/2,16);
  ctx.fillStyle=shade([79,62,96],[226,214,236]);ctx.font='13px Arial,sans-serif';
  ctx.fillText(counts.total+' clientes · clique em um personagem para acompanhar',w/2,h-13);
  if(selected){ctx.strokeStyle='#b995ef';ctx.lineWidth=3;ctx.strokeRect(11,30,w-22,h-58);}
 }};
}
