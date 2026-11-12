import React, { useEffect, useId, useRef } from 'react';
import { Brain, Users, Layers, Sparkles, ArrowUpRight, Check, Loader2, CalendarDays, BarChart3, User, X } from 'lucide-react';
import { ATLAS_AGENT_DETAILS, atlasAgentActivity, atlasStatusLabel } from './atlasPresentation';
import { atlasWaveLevel, atlasWavePath } from '@/lib/atlasWaveform';

const ICONS = { clientes: Users, operacao: Layers, estrategia: Sparkles, trafego: BarChart3, resultados: CalendarDays, financeiro: User };
const CONNECTIONS = [
  ['clientes', 'M 480 313 C 356 315 325 249 60 249'],
  ['operacao', 'M 480 295 C 414 265 441 111 250 111'],
  ['estrategia', 'M 520 297 C 650 290 653 220 930 220'],
  ['trafego', 'M 480 332 C 344 354 349 495 60 495'],
  ['resultados', 'M 520 326 C 640 361 704 450 940 450'],
  ['financeiro', 'M 515 343 C 558 432 582 590 780 590'],
];

export default function AtlasOrbit({ agents = [], activeRuns = [], selectedAgent, onSelectAgent, latestRun, waiting, enabled, onPrompt, voice, voiceDisabled }) {
  const gradientId = `atlas-fluid-${useId().replace(/:/g, '')}`;
  const coreRef = useRef(null);
  const waveRefs = useRef([]);
  const voiceRef = useRef(voice); voiceRef.current = voice;
  const voiceStatus = voice?.status;
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame, last = 0, phase = 0, envelope = 0;
    const levels = [0, 0, 0, 0];
    const draw = now => {
      const delta = Math.min(last ? (now - last) / 1000 : 1 / 60, .064); last = now;
      const target = motion.matches ? 0 : atlasWaveLevel(voiceRef.current);
      envelope += (target - envelope) * (1 - Math.exp(-delta / (target > envelope ? .11 : .38)));
      phase += delta * (.65 + envelope * .4);
      coreRef.current?.style.setProperty('--voice-level', envelope.toFixed(3));
      waveRefs.current.forEach((path, layer) => {
        levels[layer] += (envelope - levels[layer]) * (1 - Math.exp(-delta / (.09 + layer * .07)));
        path?.setAttribute('d', atlasWavePath({ level: levels[layer], time: phase, layer, reducedMotion: motion.matches }));
      });
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);
  const specialists = agents.filter((agent) => ATLAS_AGENT_DETAILS[agent.id]);
  const current = specialists.find((agent) => agent.id === selectedAgent);
  const detail = ATLAS_AGENT_DETAILS[current?.id];
  const activity = id => atlasAgentActivity(activeRuns, latestRun, id);
  const delegations = [...activeRuns, latestRun].flatMap(run => run?.steps || []).filter((s,i,all)=>s.kind==='delegation' && s.parent && s.parent!=='central' && all.findIndex(t=>t.agent===s.agent&&t.parent===s.parent)===i);
  return <section className="atlas-orbit-panel" aria-label="Atlas e seus especialistas">
    <div className="atlas-map-caption"><span className="atlas-section-kicker"><span className="atlas-small-dot" /> Seu núcleo de inteligência</span><span>{specialists.length} especialistas · {specialists.reduce((total, agent) => total + (agent.skills || []).length, 0)} habilidades</span></div>
    <div className="atlas-orbit">
      <svg className="atlas-orbit-lines" viewBox="0 0 1000 650" preserveAspectRatio="none" aria-hidden="true">
        {CONNECTIONS.map(([id, d]) => <g key={id} className={`atlas-connection ${ICONS[id] ? 'atlas-connection-ready' : ''} ${activity(id) === 'processing' ? 'atlas-connection-working' : ''}`}><path d={d} /><path className="atlas-connection-light" pathLength="100" d={d} /></g>)}
        {delegations.map(step=>{const points={clientes:[110,249],operacao:[270,111],estrategia:[870,220],trafego:[110,495],resultados:[870,450],financeiro:[720,590]}; const a=points[step.parent],b=points[step.agent];return a&&b?<path key={`${step.parent}-${step.agent}`} className={`atlas-peer-link ${activity(step.agent)==='processing'?'atlas-peer-working':''}`} pathLength="100" d={`M ${a[0]} ${a[1]} Q 500 340 ${b[0]} ${b[1]}`} />:null;})}
      </svg>
      <button ref={coreRef} type="button" className={`atlas-core atlas-core-${voiceStatus || 'idle'} ${waiting ? 'atlas-core-waiting' : ''}`} onClick={voice?.active ? voice.stop : voice?.start} disabled={!voice?.active && voiceDisabled} aria-label={voice?.active ? 'Encerrar conversa com Atlas' : 'Conversar com Atlas'}>
        <div className="atlas-core-aura" />
        <svg className="atlas-core-waves" viewBox="0 0 400 400" aria-hidden="true">
          <defs>
            <linearGradient id={`${gradientId}-violet`} x1="10%" y1="0%" x2="85%" y2="100%"><stop stopColor="#dfc2ff"/><stop offset=".42" stopColor="#b078ef"/><stop offset="1" stopColor="#6541da" stopOpacity=".3"/></linearGradient>
            <linearGradient id={`${gradientId}-blue`} x1="95%" y1="10%" x2="5%" y2="90%"><stop stopColor="#a0b9ff"/><stop offset=".5" stopColor="#9772ed"/><stop offset="1" stopColor="#d992e8" stopOpacity=".3"/></linearGradient>
            <linearGradient id={`${gradientId}-rose`} x1="0%" y1="90%" x2="80%" y2="0%"><stop stopColor="#e399d2" stopOpacity=".75"/><stop offset=".48" stopColor="#9154d7" stopOpacity=".25"/><stop offset="1" stopColor="#c8b5ff"/></linearGradient>
            <linearGradient id={`${gradientId}-edge`} x1="10%" y1="5%" x2="80%" y2="95%"><stop stopColor="#f3dcff" stopOpacity=".7"/><stop offset=".25" stopColor="#c4b1ff" stopOpacity="0"/><stop offset=".6" stopColor="#b4a1ee" stopOpacity=".08"/><stop offset=".84" stopColor="#d597ef" stopOpacity=".5"/><stop offset="1" stopColor="#8456d5" stopOpacity="0"/></linearGradient>
          </defs>
          {['violet','blue','rose','edge'].map((color,layer) => <path key={color} ref={node => { waveRefs.current[layer] = node; }} d={atlasWavePath({layer})} className={`atlas-fluid-${color}`} fill={layer===3?'none':`url(#${gradientId}-${color})`} stroke={layer===3?`url(#${gradientId}-edge)`:'none'} />)}
        </svg>
        <div className="atlas-core-ring" />
        <div className="atlas-core-inner"><Brain size={42} strokeWidth={1} aria-hidden="true" /><span>Atlas</span><small>CÉREBRO CENTRAL</small></div>
      </button>
      {specialists.map((agent) => {
        const Icon = ICONS[agent.id];
        const agentStatus = activity(agent.id);
        const label = !enabled ? 'Não habilitado' : agentStatus ? atlasStatusLabel(agentStatus) : 'Disponível';
        return <button key={agent.id} type="button" className={`atlas-agent atlas-agent-${agent.id} ${agentStatus === 'processing' ? 'atlas-agent-working' : ''}`} aria-label={`${ATLAS_AGENT_DETAILS[agent.id].title} ${label}`} aria-pressed={current?.id === agent.id} onClick={() => onSelectAgent(agent.id)} aria-controls="atlas-agent-detail">
          <span className="atlas-agent-top"><span className="atlas-agent-icon"><Icon size={19} aria-hidden="true" /></span><span className="atlas-agent-copy"><strong>{ATLAS_AGENT_DETAILS[agent.id].title}</strong><small>{agent.role || ATLAS_AGENT_DETAILS[agent.id].description}</small></span>{agentStatus === 'completed' && <Check size={13} className="atlas-agent-check" aria-label="Concluído" />}</span>
          <span className="atlas-agent-status">{agentStatus === 'processing' ? <Loader2 className="atlas-spin" size={12} aria-hidden="true" /> : <span className="atlas-agent-status-dot" />}{agentStatus === 'processing' ? 'Trabalhando nesta missão' : label}</span>
        </button>;
      })}
      <div className="atlas-core-state" role="status">{voiceStatus === 'speaking' ? 'Atlas está falando com você' : voiceStatus === 'hearing' ? 'Atlas está ouvindo você' : voiceStatus === 'listening' ? 'Pode falar. Estou aqui com você.' : voiceStatus === 'connecting' ? 'Conectando sua conversa…' : waiting ? <><Loader2 className="atlas-spin" size={12} aria-hidden="true" /> Atlas está pensando com os agentes</> : enabled ? 'Toque no Atlas para conversar' : 'Aguardando habilitação'}</div>
    </div>
    {current && detail && <div className="atlas-agent-detail" id="atlas-agent-detail">
      <div className="atlas-detail-top"><h2>{detail.title}</h2><span>Especialista</span><button type="button" className="atlas-detail-close" aria-label="Fechar detalhes do especialista" onClick={() => onSelectAgent(current.id)}><X size={15} /></button></div>
      <p>{current.role || detail.description}</p>
      <ul>{(current.skills || []).map((skill) => <li key={skill.id}><Check size={13} aria-hidden="true" /><span>{skill.name}<small className="atlas-skill-version">v{skill.version}</small>{skill.description && <span className="atlas-skill-description">{skill.description}</span>}</span></li>)}</ul>
      {!(current.skills || []).length && <p>O catálogo de skills ainda não foi informado pelo serviço.</p>}
      <button type="button" className="atlas-text-button" onClick={() => onPrompt(detail.prompt)} disabled={!enabled}>Começar por aqui <ArrowUpRight size={14} aria-hidden="true" /></button>
    </div>}
    <div className="atlas-map-footer"><span>Um cérebro. Sua equipe de agentes.</span><span>Clique em um especialista para explorar</span></div>
  </section>;
}
