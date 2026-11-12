import React from 'react';
import { Mic, MicOff, PhoneOff, Volume2, Loader2, Square } from 'lucide-react';
const LABELS = { connecting: 'Conectando a voz…', listening: 'Pode falar. Estou ouvindo.', hearing: 'Estou ouvindo você…', thinking: 'Consultando o Atlas…', speaking: 'Atlas está falando…' };
export default function AtlasVoiceControls({ voice, disabled }) {
  return <div className={`atlas-voice ${voice.active ? 'atlas-voice-active' : ''}`}>
    {voice.active ? <>
      <div className="atlas-voice-state" role="status">{voice.status === 'connecting' || voice.status === 'thinking' ? <Loader2 size={15} className="atlas-spin" /> : <span className="atlas-voice-waves" aria-hidden="true"><i /><i /><i /><i /><i /></span>}<span>{voice.muted ? 'Microfone pausado' : LABELS[voice.status]}</span></div>
      <div className="atlas-voice-actions"><button type="button" onClick={voice.mute} aria-label={voice.muted ? 'Ativar microfone' : 'Pausar microfone'} aria-pressed={voice.muted}>{voice.muted ? <MicOff size={16} /> : <Mic size={16} />}</button>{voice.status === 'speaking' && <button type="button" onClick={voice.interrupt} aria-label="Interromper resposta"><Square size={14} /></button>}{voice.needsPlay && <button type="button" onClick={voice.play}><Volume2 size={15} />Ouvir</button>}<button type="button" onClick={voice.stop} className="atlas-voice-end" aria-label="Encerrar conversa por voz"><PhoneOff size={16} /></button></div>
    </> : <button type="button" className="atlas-start-voice" onClick={voice.start} disabled={disabled}><Mic size={16} />Conversar por voz<span>Fale com o Atlas</span></button>}
    <small>Voz gerada por IA{voice.active ? voice.muted ? ' · microfone pausado' : ' · conversa contínua, pode falar naturalmente' : ' · inicie uma vez e converse sem apertar a cada fala'}</small>
    {voice.error && <p className="atlas-voice-error" role="alert">{voice.error}</p>}
    {voice.active && voice.subtitle && <p className="atlas-voice-subtitle">{voice.subtitle}</p>}
  </div>;
}
