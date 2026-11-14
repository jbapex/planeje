import React from 'react';
import AtlasAgentMark from './AtlasAgentMark';
import atlasAvatar from '@/assets/atlas/atlas-avatar-3d-v1.png';
import './AtlasExecutor.css';

const AGENTS = { central: 'Atlas', crm: 'CRM IA', cs: 'CS IA', gestor: 'Gestor IA', operacao: 'Operação', estrategia: 'Estratégia', financeiro: 'Financeiro' };
const STATUS = { running: 'Em andamento', completed: 'Concluído', partial: 'Consulta parcial', waiting: 'Aguardando você', failed: 'Falhou', skipped: 'Não executado', stopped: 'Encerrado' };

function currentStep(steps, active) {
  if (!active) return steps.at(-1);
  const pending = new Map();
  for (const [index, step] of steps.entries()) {
    if (['answer', 'error'].includes(step.kind)) {
      if (step.agent === 'central') pending.clear();
      else for (const [key, entry] of pending) if (entry.step.agent === step.agent) pending.delete(key);
    }
    const key = JSON.stringify([step.agent, step.parent, step.app, step.kind, step.item_id]);
    if (['running', 'waiting'].includes(step.status)) pending.set(key, { step, index });
    else pending.delete(key);
  }
  return [...pending.values()].sort((left, right) => right.index - left.index)[0]?.step || steps.at(-1);
}

export default function AtlasExecutorActivity({ steps: rawSteps = [], agents = [], active = false }) {
  const types = { read: 'Consulta da fonte', ai: 'Transformação com IA', condition: 'Condição do fluxo', result: 'Resultado interno' };
  const steps = rawSteps.map(step => step.state ? { ...step, agent: step.app && step.app !== 'atlas' ? step.app : 'central', status: step.state, summary: step.label || step.error || types[step.type] || 'Etapa do fluxo registrada' } : step);
  if (!active && !steps.length) return null;
  const name = id => agents.find(agent => agent.id === id)?.name || AGENTS[id] || 'Atlas';
  const current = currentStep(steps, active);
  const running = active && current?.status === 'running';
  return <section className="atlas-executor-activity" data-active={Boolean(running)} aria-label="Atividade do Squad">
    <div className="atlas-executor-live" role="status" aria-live="polite" aria-atomic="true">
      <span className="atlas-executor-agent" aria-hidden="true"><AtlasAgentMark agentId={current?.agent} avatar={atlasAvatar} /></span>
      <span><strong>{name(current?.agent)}{current && <> · {STATUS[current.status] || 'Etapa registrada'}</>}</strong><span>{current?.summary || 'Aguardando atividade registrada do Atlas.'}</span></span>
      {running && <span className="atlas-executor-live-dot" aria-hidden="true" />}
    </div>
    {steps.length > 0 && <details className="atlas-executor-timeline"><summary>Atividade registrada · {steps.length} {steps.length === 1 ? 'evento' : 'eventos'}</summary>
      <ol>{steps.map((step, index) => <li key={index} data-status={step.status}>
        <span className="atlas-executor-agent" aria-hidden="true"><AtlasAgentMark agentId={step.agent} avatar={atlasAvatar} /></span>
        <div><strong>{name(step.agent)} · {STATUS[step.status] || 'Etapa registrada'}</strong>{step.parent && <small>Com {name(step.parent)}</small>}
          {step.summary && <p>{step.summary}</p>}
          {step.source?.available === false && <p className="atlas-executor-notice">Fonte parcial ou indisponível.</p>}
          {step.item_id && <button type="button" className="atlas-executor-jump" onClick={() => globalThis.document?.getElementById('atlas-executor-item-' + step.item_id)?.scrollIntoView({ block: 'center', behavior: globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })}>Ver pergunta ou proposta</button>}
          {step.at && Number.isFinite(Date.parse(step.at)) && <time dateTime={step.at}>{new Date(step.at).toLocaleString('pt-BR')}</time>}
        </div>
      </li>)}</ol>
    </details>}
  </section>;
}
