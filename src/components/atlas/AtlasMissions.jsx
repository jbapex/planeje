import React from 'react';
import { Check, GitBranch, AlertCircle, RefreshCw, X } from 'lucide-react';
import { cancelAtlasJob } from '@/lib/atlasApi';
import { ATLAS_AGENT_DETAILS, atlasDate, atlasStatusLabel,atlasMissionStatus } from './atlasPresentation';

export default function AtlasMissions({ runs = [], processing, onRefresh, onError }) {
  async function cancel(id) { try { await cancelAtlasJob(id); await onRefresh(); } catch(e) { onError?.(e); } }
  return <div className="atlas-missions-panel">
    <div className="atlas-panel-heading"><GitBranch size={20} aria-hidden="true" /><div><h2>Missões desta conversa</h2><p>Os passos e resultados registrados pelo Atlas.</p></div></div>
    {processing && <button type="button" className="atlas-button" onClick={onRefresh}><RefreshCw size={14} aria-hidden="true" />Atualizar missão</button>}
    {!runs.length && <div className="atlas-empty-state"><GitBranch size={30} strokeWidth={1.3} aria-hidden="true" /><h3>A primeira missão começa com um pedido</h3><p>Ao conversar, você poderá acompanhar aqui os especialistas utilizados e o resultado de cada etapa.</p></div>}
    {[...runs].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).map((run) => <article className="atlas-mission" key={run.id}>
      <div className="atlas-mission-heading"><span className={`atlas-status atlas-status-${run.status}`}>{atlasMissionStatus(run)}</span><time dateTime={run.created_at}>{atlasDate(run.created_at)}</time></div>
      {run.title && <h3 className="atlas-mission-title">{run.title}</h3>}
      {['queued','running','waiting_team'].includes(run.status) && <button type="button" className="atlas-text-button" onClick={()=>cancel(run.id)}><X size={13}/>Cancelar missão</button>}
      <ol className="atlas-steps">{(Array.isArray(run.steps) ? run.steps : []).map((step, index) => <li key={`${step.agent}-${index}`}>
        <span className="atlas-step-mark">{step.status === 'completed' ? <Check size={13} aria-hidden="true" /> : step.status === 'failed' ? <AlertCircle size={13} aria-hidden="true" /> : <span />}</span>
        <div><strong>{step.parent && `${step.parent === 'central'?'Atlas':ATLAS_AGENT_DETAILS[step.parent]?.title || step.parent} → `}{step.agent === 'central' ? 'Atlas' : ATLAS_AGENT_DETAILS[step.agent]?.title || step.agent}</strong><span className="atlas-step-status">{atlasStatusLabel(step.status)}</span><p>{step.summary || 'Etapa registrada sem resumo.'}</p></div>
      </li>)}</ol>
      {!(run.steps || []).length && <p className="atlas-empty-copy">Nenhuma etapa registrada nesta missão.</p>}
      {run.error && <p className="atlas-mission-error">{typeof run.error === 'string' ? run.error : 'A missão registrou uma falha.'}</p>}
      {run.usage?.model_calls>0 && <p className="atlas-usage">{run.usage.model_calls} chamadas · {(Number(run.usage.prompt_tokens||0)+Number(run.usage.completion_tokens||0)).toLocaleString('pt-BR')} tokens · {Number(run.usage.cached_tokens||0).toLocaleString('pt-BR')} de entrada em cache{run.usage.token_usage_complete===false?' · medição parcial':''}</p>}
      {typeof run.result==='string'&&run.result&&<details className="atlas-mission-result"><summary>Ler resultado</summary><div className="atlas-message-content">{run.result}</div></details>}
      <details className="atlas-mission-reference"><summary>Referência da missão</summary><code>{run.id}</code></details>
    </article>)}
  </div>;
}
