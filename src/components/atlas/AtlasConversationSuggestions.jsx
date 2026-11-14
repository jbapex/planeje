import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Pause, Play } from 'lucide-react';
import AtlasAgentMark from './AtlasAgentMark';

const SUGGESTIONS = [
  { agent: 'central', title: 'Como foi a semana', detail: 'Panorama dos três agentes', prompt: 'Como foi a semana no CRM, no CS e no Gestor IA? Chame os três agentes e reúna os dados disponíveis, com período e cobertura.' },
  { agent: 'crm', title: 'Leads sem resposta', detail: 'Quem esfriou no funil', prompt: 'Quais leads estão sem resposta há mais de três dias? Consulte o CRM IA e mostre a fonte antes de sugerir o próximo contato.' },
  { agent: 'cs', title: 'Marcas que precisam de atenção', detail: 'Saúde e próximos contatos', prompt: 'Quais marcas precisam de atenção no CS IA? Priorize os sinais disponíveis e explique o próximo passo.' },
  { agent: 'gestor', title: 'Campanhas da semana', detail: 'Gasto, leads e custo por lead', prompt: 'Como foram as campanhas da semana? Compare gasto, leads e custo por lead no Gestor IA, com período e cobertura.' },
  { agent: 'crm', title: 'Configurar meu CRM', detail: 'Agentes, etapas e conhecimento', prompt: 'Quero configurar o CRM IA desta marca. Consulte o que já existe e me pergunte em etapas apenas o que faltar, antes de preparar a revisão.' },
  { agent: 'central', title: 'Ensinar ao Squad', detail: 'Orientações e correções da marca', prompt: 'Quero ensinar uma orientação para esta marca. Pergunte em etapas, mostre o texto e prepare a confirmação para guardar no conhecimento do Squad.' },
];

export default function AtlasConversationSuggestions({ agents, avatar, onPrompt }) {
  const rail = useRef(null);
  const repeated = useRef(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const node = rail.current;
    const loop = repeated.current;
    if (!node || !loop) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame;
    let previous;
    let position = node.scrollLeft;

    function drift(time) {
      if (!node.isConnected) return;
      const loopAt = loop.offsetLeft;
      if (previous && loopAt > 0 && !node.matches(':hover, :focus-within') && !document.hidden) {
        if (Math.abs(node.scrollLeft - position) > 1) position = node.scrollLeft;
        position = (position + Math.min(time - previous, 40) * 0.025) % loopAt;
        node.scrollLeft = position;
      }
      previous = time;
      frame = requestAnimationFrame(drift);
    }

    function syncMotion() {
      cancelAnimationFrame(frame);
      previous = undefined;
      if (!preference.matches) frame = requestAnimationFrame(drift);
    }
    syncMotion();
    preference.addEventListener('change', syncMotion);
    return () => {
      cancelAnimationFrame(frame);
      preference.removeEventListener('change', syncMotion);
    };
  }, [paused]);

  function cards(repeat) {
    return SUGGESTIONS.map(item => {
      const agent = agents.find(option => option.id === item.agent);
      return <button key={item.title} type="button" tabIndex={repeat ? -1 : undefined} onMouseDown={repeat ? event => event.preventDefault() : undefined} onClick={() => onPrompt(item.prompt, agent)}>
        <span className="atlas-converse-example-agent"><AtlasAgentMark agentId={agent?.id} avatar={avatar} /><span>{agent?.name || 'Atlas'}</span><ArrowUpRight size={15} aria-hidden="true" /></span>
        <strong>{item.title}</strong><small>{item.detail}</small>
      </button>;
    });
  }

  return <section className="atlas-converse-examples" aria-label="Sugestões de pedidos">
    <div className="atlas-converse-examples-rail" role="group" aria-label="Cartões de sugestões" ref={rail}>
      <div className="atlas-converse-examples-track">
        <div className="atlas-converse-examples-set">{cards(false)}</div>
        <div className="atlas-converse-examples-set" ref={repeated} aria-hidden="true">{cards(true)}</div>
      </div>
    </div>
    <button type="button" className="atlas-converse-motion-toggle" onClick={() => setPaused(value => !value)} aria-label={paused ? 'Reproduzir sugestões' : 'Pausar sugestões'} title={paused ? 'Reproduzir sugestões' : 'Pausar sugestões'}>
      {paused ? <Play size={13} aria-hidden="true" /> : <Pause size={13} aria-hidden="true" />}
    </button>
  </section>;
}
