import {useLayoutEffect,useRef,useState} from 'react';

const MARGIN=12,GAP=12;
const clamp=(value,min,max)=>Math.min(Math.max(value,min),Math.max(min,max));
const storageKey=userId=>`planeje:atlas:position:v1:${userId}`;
const valid=value=>value&&Number.isFinite(value.x)&&Number.isFinite(value.y)&&value.x>=0&&value.x<=1&&value.y>=0&&value.y<=1;

// Store a fraction of the usable viewport so a saved position also fits another size.
function viewport(size){
 const width=document.documentElement.clientWidth,height=Math.min(window.innerHeight,window.visualViewport?.height||window.innerHeight);
 return {width,height,size,xMax:Math.max(MARGIN,width-size-MARGIN),yMax:Math.max(MARGIN,height-size-MARGIN)};
}
function point(value,area){
 return value?{x:MARGIN+value.x*(area.xMax-MARGIN),y:MARGIN+value.y*(area.yMax-MARGIN)}:{x:clamp(area.width-area.size-(area.width<=600?12:22),MARGIN,area.xMax),y:clamp(area.height<=620?65:area.width<=600?100:106,MARGIN,area.yMax)};
}
function fraction(value,area){
 return {x:area.xMax===MARGIN?0:(clamp(value.x,MARGIN,area.xMax)-MARGIN)/(area.xMax-MARGIN),y:area.yMax===MARGIN?0:(clamp(value.y,MARGIN,area.yMax)-MARGIN)/(area.yMax-MARGIN)};
}

export default function useAtlasFloatingPosition({userId,visible,open,callCount,expanded=false}){
 const robot=useRef(null),call=useRef(null),gesture=useRef(null),suppressedUntil=useRef(0);
 const [position,setPosition]=useState(null),[layout,setLayout]=useState(null),[dragging,setDragging]=useState(false);
 const persist=value=>{try{if(value)localStorage.setItem(storageKey(userId),JSON.stringify(value));else localStorage.removeItem(storageKey(userId));}catch{/* Storage restrictions must not prevent moving the robot. */}};

 useLayoutEffect(()=>{
  let saved=null;
  try{const value=JSON.parse(localStorage.getItem(storageKey(userId)));if(valid(value))saved=value;}catch{/* Keep the original corner when storage is unavailable. */}
  gesture.current=null;setDragging(false);setPosition(saved);setLayout(null);
 },[userId]);

 useLayoutEffect(()=>{
  if(!visible)return;
  const measure=()=>{
   if(!robot.current)return;
   const area=viewport(robot.current.offsetWidth),anchor=point(position,area);
   const width=Math.min(400,area.width-2*MARGIN);
   let height=Math.max(1,Math.min(690,Math.max(200,area.height-(area.width<=600?180:190)),area.height-2*MARGIN));
   const below=anchor.y+area.size+GAP,aboveRoom=anchor.y-GAP-MARGIN,belowRoom=area.height-MARGIN-below;
   const leftRoom=anchor.x-GAP-MARGIN,rightRoom=area.width-MARGIN-anchor.x-area.size-GAP;
   let left=clamp(anchor.x+area.size-width,MARGIN,area.width-width-MARGIN),top;
   if(belowRoom>=height)top=below;
   else if(aboveRoom>=height)top=anchor.y-GAP-height;
   else if(rightRoom>=width||leftRoom>=width){left=rightRoom>=width?anchor.x+area.size+GAP:anchor.x-GAP-width;top=clamp(anchor.y,MARGIN,area.height-height-MARGIN);}
   else if(Math.max(aboveRoom,belowRoom)>=200){height=Math.min(height,Math.max(aboveRoom,belowRoom));top=aboveRoom>=belowRoom?anchor.y-GAP-height:below;}
   else top=clamp(below,MARGIN,area.height-height-MARGIN);
   if(expanded){height=Math.max(1,area.height-2*MARGIN);top=MARGIN;}
   const callWidth=Math.min(260,area.width-2*MARGIN),callHeight=call.current?.offsetHeight||64;
   const callLeft=leftRoom>=callWidth?anchor.x-GAP-callWidth:rightRoom>=callWidth?anchor.x+area.size+GAP:clamp(anchor.x+area.size-callWidth,MARGIN,area.width-callWidth-MARGIN);
   const callTop=leftRoom>=callWidth||rightRoom>=callWidth?anchor.y:below+callHeight<=area.height-MARGIN?below:anchor.y-GAP-callHeight;
   const next={x:anchor.x,y:anchor.y,size:area.size,box:{left,top,width,height},call:{left:callLeft,top:clamp(callTop,MARGIN,area.height-callHeight-MARGIN),width:callWidth}};
   setLayout(old=>JSON.stringify(old)===JSON.stringify(next)?old:next);
  };
  measure();window.addEventListener('resize',measure);window.visualViewport?.addEventListener('resize',measure);
  return()=>{window.removeEventListener('resize',measure);window.visualViewport?.removeEventListener('resize',measure);};
 },[visible,open,callCount,position,expanded]);

 const finish=(event,cancelled=false)=>{
  const active=gesture.current;
  if(!active||active.pointerId!==event.pointerId)return;
  gesture.current=null;setDragging(false);
  if(active.moved){
   suppressedUntil.current=Date.now()+350;
   if(cancelled)setPosition(active.previous);
   else persist(active.latest);
  }
  if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
 };
 const robotProps={
  ref:robot,
  title:'Arraste para mover. Clique para conversar. Alt + setas move pelo teclado; Alt + Home volta ao canto.',
  'aria-keyshortcuts':'Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight Alt+Home',
  onPointerDown:event=>{
   if(event.button!==0||event.isPrimary===false)return;
   const rect=event.currentTarget.getBoundingClientRect();
   gesture.current={pointerId:event.pointerId,clientX:event.clientX,clientY:event.clientY,x:rect.left,y:rect.top,previous:position,latest:position,moved:false};
   suppressedUntil.current=0;event.currentTarget.setPointerCapture(event.pointerId);
  },
  onPointerMove:event=>{
   const active=gesture.current;
   if(!active||active.pointerId!==event.pointerId)return;
   const dx=event.clientX-active.clientX,dy=event.clientY-active.clientY;
   if(!active.moved&&Math.hypot(dx,dy)<5)return;
   active.moved=true;event.preventDefault();setDragging(true);
   active.latest=fraction({x:active.x+dx,y:active.y+dy},viewport(event.currentTarget.offsetWidth));setPosition(active.latest);
  },
  onPointerUp:event=>finish(event),
  onPointerCancel:event=>finish(event,true),
  onLostPointerCapture:event=>finish(event,true),
  onClickCapture:event=>{if(event.detail>0&&Date.now()<suppressedUntil.current){event.preventDefault();event.stopPropagation();}},
  onKeyDown:event=>{
   if(!event.altKey)return;
   if(event.key==='Home'){event.preventDefault();setPosition(null);persist(null);return;}
   const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]},direction=directions[event.key];
   if(!direction)return;
   event.preventDefault();const area=viewport(event.currentTarget.offsetWidth),current=point(position,area),step=event.shiftKey?40:16;
   const next=fraction({x:current.x+direction[0]*step,y:current.y+direction[1]*step},area);setPosition(next);persist(next);
  },
 };
 return {robotProps,callRef:call,dragging,style:layout?{left:layout.x,top:layout.y,right:'auto',width:layout.size,height:layout.size}:undefined,boxStyle:layout?{position:'fixed',right:'auto',...layout.box}:undefined,callStyle:layout?{position:'fixed',right:'auto',...layout.call}:undefined};
}
