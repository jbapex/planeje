import React, { useLayoutEffect, useState } from 'react';
import { ArrowUp, ChevronDown, Hash, Loader2, X } from 'lucide-react';
import { filterAtlasClients } from '@/lib/atlasConversationClients';
import AtlasAgentMark from './AtlasAgentMark';
import AtlasDictationButton from './AtlasDictationButton';

export const atlasAgentPrefix = name => `Consulte o especialista ${name}.\n`;
const normalize = value => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR');

export default function AtlasConversationComposer({ atlas, avatar, busy, dictating, setDictating, voice, clientName, composerRef, onContextChange }) {
  const [dismissed, setDismissed] = useState(false);
  const [index, setIndex] = useState(0);
  const [caret, setCaret] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const agents = atlas.base.agents || [];
  const directedAgent = agents.find(agent => agent.id !== 'central' && atlas.draft.startsWith(atlasAgentPrefix(agent.name)));
  const currentAgent = directedAgent || agents.find(agent => agent.id === selectedId);
  const prefix = currentAgent ? atlasAgentPrefix(currentAgent.name) : '';
  const text = directedAgent ? atlas.draft.slice(prefix.length) : atlas.draft;
  const cursor = Math.min(caret ?? text.length, text.length);
  const match = /(?:^|\s)([@#])([^\n@#]{0,70})$/u.exec(text.slice(0, cursor));
  const trigger = !dismissed && match?.[1];
  const tokenStart = match && match.index + (match[0][0] === match[1] ? 0 : 1);
  const options = trigger === '#' ? [
    ...(!match[2].trim() ? [{ id: '', label: 'Visão geral' }] : []),
    ...filterAtlasClients(atlas.base.clients, match[2]).slice(0, 7).map(client => ({ id: client.id, label: client.empresa })),
  ] : trigger === '@' ? agents.filter(agent => normalize(agent.name).includes(normalize(match[2].trim()))).map(agent => ({ id: agent.id, label: agent.name })) : [];
  const active = options[Math.min(index, options.length - 1)];
  const sendDisabled = busy || !text.trim() || atlas.draft.length > atlas.messageLimit || Boolean(trigger);

  useLayoutEffect(() => {
    const field = composerRef.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = Math.min(field.scrollHeight, 180) + 'px';
  }, [text, composerRef]);

  function edit(next, agent = currentAgent) {
    if (agent) setSelectedId(agent.id);
    else setSelectedId(null);
    atlas.setDraft((agent ? atlasAgentPrefix(agent.name) : '') + next);
  }

  function focusAt(position) {
    setCaret(position);
    requestAnimationFrame(() => {
      composerRef.current?.focus();
      composerRef.current?.setSelectionRange(position, position);
    });
  }

  function choose(option) {
    if (busy || !trigger) return;
    const before = text.slice(0, tokenStart);
    const after = text.slice(cursor);
    const next = after ? before + after.trimStart() : before.trimEnd();
    if (trigger === '#') {
      if (option.id !== atlas.clientId && !onContextChange(option.id)) return;
      edit(next);
    } else {
      edit(next, option.id === 'central' ? null : agents.find(agent => agent.id === option.id));
    }
    setDismissed(true);
    focusAt(Math.min(tokenStart, next.length));
  }

  function toggle(symbol) {
    if (trigger === symbol) {
      setDismissed(true);
      return;
    }
    const start = match ? tokenStart : cursor;
    const before = text.slice(0, start);
    const insertion = (before && !/\s$/.test(before) ? ' ' : '') + symbol;
    edit(before + insertion + text.slice(cursor));
    setIndex(0);
    setDismissed(false);
    focusAt(start + insertion.length);
  }

  function onKeyDown(event) {
    if (event.nativeEvent.isComposing) return;
    if (trigger && event.key === 'Escape') { event.preventDefault(); setDismissed(true); return; }
    if (trigger && options.length && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      setIndex((Math.min(index, options.length - 1) + (event.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length);
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (trigger && active) choose(active);
      else if (!sendDisabled) {
        if (currentAgent) setSelectedId(currentAgent.id);
        atlas.send(event);
      }
    }
  }

  return <form className="atlas-composer atlas-converse-composer" onBlur={event => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setDismissed(true);
  }} onSubmit={event => {
    event.preventDefault();
    if (sendDisabled) return;
    if (currentAgent) setSelectedId(currentAgent.id);
    atlas.send(event);
  }}>
    <label className="sr-only" htmlFor="atlas-message">Seu pedido ao Atlas</label>
    <textarea id="atlas-message" ref={composerRef} value={text} onChange={event => {
      edit(event.target.value);
      setCaret(event.target.selectionStart);
      setDismissed(false);
      setIndex(0);
    }} onSelect={event => setCaret(event.target.selectionStart)} disabled={busy}
      placeholder={atlas.clientChoice ? 'Confirme o cliente acima ou escreva o nome aqui…' : 'Pergunte qualquer coisa. @ chama um especialista; # escolhe um cliente.'}
      rows={2} maxLength={Math.max(1, atlas.messageLimit - prefix.length)} onKeyDown={onKeyDown} aria-describedby={trigger ? 'atlas-converse-picker-label' : undefined} />
    {trigger && !busy && <div className="atlas-converse-picker" key={trigger}>
      <p id="atlas-converse-picker-label">{trigger === '#' ? 'Escolher cliente' : 'Falar com um especialista'} <span>↑ ↓ navegar · ↵ escolher</span></p>
      <div role="group" aria-labelledby="atlas-converse-picker-label">
        {options.map(option => <button type="button" key={option.id} data-active={active === option} onClick={() => choose(option)}>
          {trigger === '#' ? <Hash size={15} aria-hidden="true" /> : <AtlasAgentMark agentId={option.id} avatar={avatar} />}{option.label}
        </button>)}
        {!options.length && <span className="atlas-converse-picker-empty">Nenhum resultado.</span>}
      </div>
      <span className="sr-only" aria-live="polite">{active?.label}</span>
    </div>}
    {atlas.draft.length > atlas.messageLimit && <p role="alert">Resuma a mensagem para até {atlas.messageLimit.toLocaleString('pt-BR')} caracteres.</p>}
    <div className="atlas-converse-composer-actions">
      <div className="atlas-converse-token">
        <button type="button" className="atlas-converse-chip" disabled={busy} aria-label="Escolher especialista" aria-expanded={trigger === '@'} onClick={() => toggle('@')}><AtlasAgentMark agentId={currentAgent?.id} avatar={avatar} />{currentAgent?.name || 'Atlas'} <ChevronDown size={12} aria-hidden="true" /></button>
        {currentAgent && <button type="button" className="atlas-converse-remove" aria-label="Remover especialista" disabled={busy} onClick={() => { edit(text, null); setDismissed(true); focusAt(text.length); }}><X size={13} aria-hidden="true" /></button>}
      </div>
      <div className="atlas-converse-token">
        <button type="button" className="atlas-converse-chip" disabled={busy} aria-label={`Contexto: ${clientName}`} aria-expanded={trigger === '#'} onClick={() => toggle('#')}><Hash size={14} aria-hidden="true" /><span>{atlas.clientId ? clientName : 'Cliente'}</span></button>
        {atlas.clientId && <button type="button" className="atlas-converse-remove" aria-label="Remover cliente" disabled={busy} onClick={() => { if (onContextChange('')) { edit(text); setDismissed(true); focusAt(text.length); } }}><X size={13} aria-hidden="true" /></button>}
      </div>
      <span className="atlas-converse-mode">Chat</span>
      <div className="atlas-converse-send-actions">
        <span className="atlas-converse-version">Atlas {agents.find(agent => agent.id === 'central')?.skill_version || ''}</span>
        <AtlasDictationButton compact disabled={atlas.sending || atlas.historyLoading || atlas.processing || voice.active} onActiveChange={setDictating} onText={spoken => { setDismissed(true); edit((text.trim() ? text + '\n' : '') + spoken); }} />
        <button type="submit" className="atlas-send" disabled={sendDisabled || dictating} aria-label={atlas.retryKind === 'terminal' ? 'Nova tentativa' : atlas.retryKind === 'uncertain' ? 'Reenviar' : 'Enviar'} title="Enviar">{atlas.sending ? <Loader2 className="atlas-spin" size={17} aria-hidden="true" /> : <ArrowUp size={19} aria-hidden="true" />}</button>
      </div>
    </div>
  </form>;
}
