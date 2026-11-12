import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Pause, Play } from 'lucide-react';
import AtlasAgentMark from './AtlasAgentMark';

const SUGGESTIONS = [
  { agent: 'clientes', title: 'Clientes que precisam de atenção', detail: 'Priorize os próximos contatos', prompt: 'Quais clientes precisam da minha atenção hoje? Separe fatos de hipóteses e sugira o próximo passo.' },
  { agent: 'operacao', title: 'O que espera por mim', detail: 'Confira pendências e bloqueios', prompt: 'Confira as entregas que dependem de mim hoje e organize o que devo resolver primeiro.' },
  { agent: 'estrategia', title: 'Desenvolver uma ideia', detail: 'Comece pelo briefing', prompt: 'Vamos desenvolver uma campanha. Me ajude a organizar o briefing antes de propor ideias.' },
  { agent: 'trafego', title: 'Campanhas da semana', detail: 'Gasto, leads e custo por lead', prompt: 'Como foram as campanhas da semana? Compare gasto, leads e custo por lead.' },
  { agent: 'resultados', title: 'Do contato à venda', detail: 'Onde estão os gargalos', prompt: 'Cruze os dados de tráfego e atendimento para identificar gargalos até a venda.' },
  { agent: 'operacao', title: 'Planejar a próxima entrega', detail: 'Transforme uma decisão em ação', prompt: 'Organize a próxima entrega em passos, com uma sugestão de responsável e prazo.' },
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
