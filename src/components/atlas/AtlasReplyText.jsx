import React,{useEffect,useRef,useState} from 'react';

export default function AtlasReplyText({text,animate=false}){
 const timerRef=useRef(null);
 const [length,setLength]=useState(()=>animate?0:text.length);
 useEffect(()=>{
  const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
  if(!animate||preference.matches){setLength(text.length);return;}
  setLength(0);
  let shown=0;
  const timer=setInterval(()=>{shown=Math.min(shown+40,text.length);setLength(shown);if(shown===text.length)clearInterval(timer);},20);
  timerRef.current=timer;
  const finish=()=>{if(preference.matches){clearInterval(timer);setLength(text.length);}};
  preference.addEventListener('change',finish);
  return()=>{clearInterval(timer);preference.removeEventListener('change',finish);};
 },[text,animate]);
 const writing=animate&&length<text.length;
 return <><p><span aria-hidden={writing||undefined}>{writing?text.slice(0,length):text}</span>{writing&&<span className="sr-only">{text}</span>}</p>{writing&&<button type="button" className="atlas-team-show-reply" onClick={()=>{clearInterval(timerRef.current);setLength(text.length);}}>Mostrar resposta completa</button>}</>;
}
