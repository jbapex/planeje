import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import AtlasOrbit from '@/components/atlas/AtlasOrbit';
import {MANAGER_AGENTS} from '../../supabase/functions/_shared/atlasManager.js';
import '@/components/atlas/atlas.css';
function Preview(){
 const [mode,setMode]=useState('idle'),[level,setLevel]=useState(.55),[job,setJob]=useState(null),[selected,setSelected]=useState(null);
 const levelsRef=useRef({input:0,output:0});
 useEffect(()=>{let frame;const draw=now=>{const amplitude=mode==='idle'?0:level*(.4+Math.abs(Math.sin(now/130)*Math.sin(now/410))*.6);levelsRef.current={input:mode==='hearing'?amplitude:0,output:mode==='speaking'?amplitude:0};frame=requestAnimationFrame(draw);};frame=requestAnimationFrame(draw);return()=>cancelAnimationFrame(frame);},[mode,level]);
 const voice={active:mode!=='idle',status:mode,levelsRef,start:()=>setMode('hearing'),stop:()=>setMode('idle')};
 return <><div className="preview-toolbar"><p>PRÉVIA LOCAL · amplitudes e missões simuladas para conferir a animação. Nenhum microfone, cliente ou agente real é acionado aqui.</p><button onClick={()=>setMode('idle')}>Em repouso</button><button onClick={()=>setMode('hearing')}>Ouvindo (demonstração)</button><button onClick={()=>setMode('speaking')}>Falando (demonstração)</button><label>Intensidade <input aria-label="Intensidade" type="range" min="0" max="1" step=".05" value={level} onChange={e=>setLevel(Number(e.target.value))}/></label><button onClick={()=>setJob({status:'running',steps:[{agent:'trafego',parent:'central',kind:'delegation',status:'running'},{agent:'resultados',parent:'trafego',kind:'delegation',status:'running'}]})}>Acionar Tráfego → Resultados</button><button disabled={!job} onClick={()=>setJob({...job,status:'completed',steps:[...job.steps,{agent:'trafego',kind:'answer',status:'completed'},{agent:'resultados',kind:'answer',status:'completed'}]})}>Concluir missão</button><button disabled={!job} onClick={()=>setJob({...job,status:'cancelled'})}>Cancelar missão</button></div><div className="atlas-page"><header className="atlas-header"><div className="atlas-brand"><div><h1>Atlas <span>Seu cérebro no Planeje</span></h1><p>INTELIGÊNCIA CENTRAL</p></div></div></header><AtlasOrbit agents={MANAGER_AGENTS} activeRuns={job?[job]:[]} latestRun={job} selectedAgent={selected} onSelectAgent={id=>setSelected(id===selected?null:id)} enabled onPrompt={()=>{}} voice={voice}/></div></>;
}
createRoot(document.getElementById('root')).render(<Preview/>);
