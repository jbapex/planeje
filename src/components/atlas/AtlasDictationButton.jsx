import React,{useEffect,useRef,useState} from 'react';
import {Mic,Square,X,Loader2,RotateCcw} from 'lucide-react';
import {AtlasDictationRecorder,audioClock} from '@/lib/atlasDictationRecorder';
import {transcribeAtlasDictation} from '@/lib/atlasDictationClient';
import './AtlasDictationButton.css';
export default function AtlasDictationButton({onText,onActiveChange,disabled=false,compact=false,transcribe=transcribeAtlasDictation}){
  const [state,setState]=useState({phase:'idle',seconds:0,error:''}),rec=useRef(),abort=useRef(),callbacks=useRef();callbacks.current={onText,onActiveChange,transcribe};
  useEffect(()=>{const recorder=new AtlasDictationRecorder({onChange:state=>{setState({...state});callbacks.current.onActiveChange?.(['permission','recording','transcribing'].includes(state.phase));},onAudio:async audio=>{abort.current=new AbortController();try{const text=await callbacks.current.transcribe({...audio,signal:abort.current.signal});if(recorder.accepts(audio.generation)){callbacks.current.onText(text);recorder.complete();}}catch(error){if(recorder.accepts(audio.generation))recorder.fail(error);}}});rec.current=recorder;return()=>{abort.current?.abort();recorder.destroy();callbacks.current.onActiveChange?.(false);};},[]);
  useEffect(()=>{if(disabled){abort.current?.abort();rec.current?.cancel();}},[disabled]);
  const active=['permission','recording','transcribing'].includes(state.phase),cancel=()=>{abort.current?.abort();rec.current.cancel();};
  return <div className={'atlas-dictation'+(compact?' is-compact':'')} aria-label="Resposta por áudio">
    {state.phase==='recording'?<button type="button" onClick={()=>rec.current.stop()} className="atlas-dictation-recording" aria-label="Parar e transcrever" title="Parar e transcrever"><Square size={14} aria-hidden="true"/>{compact?audioClock(state.seconds):`Parar e transcrever · ${audioClock(state.seconds)}`}</button>:active?<span role="status"><Loader2 size={16} className="atlas-spin" aria-hidden="true"/><span className={compact?'sr-only':undefined}>{state.phase==='permission'?'Abrindo microfone…':'Transcrevendo…'}</span></span>:<button type="button" disabled={disabled} onClick={()=>rec.current.start()} aria-label="Gravar áudio" title="Gravar áudio · até 2 min; confira o texto antes de enviar"><Mic size={18} aria-hidden="true"/>{!compact&&'Gravar áudio'}</button>}
    {state.phase==='error'&&rec.current?.lastAudio&&<button type="button" onClick={()=>rec.current.retry()} aria-label="Tentar transcrição novamente" title="Tentar transcrição novamente"><RotateCcw size={16} aria-hidden="true"/>{!compact&&'Tentar transcrição novamente'}</button>}
    {(active||state.phase==='error')&&<button type="button" onClick={cancel} aria-label="Cancelar áudio" title="Cancelar áudio"><X size={16} aria-hidden="true"/></button>}
    {state.error?<p role="alert">{state.error}</p>:!compact&&<small>Até 2 min · confira o texto antes de enviar</small>}
  </div>;
}
