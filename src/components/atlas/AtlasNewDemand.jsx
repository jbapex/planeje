import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import AtlasDictationButton from './AtlasDictationButton';
import './AtlasDemandCentral.css';

export default function AtlasNewDemand({ clients, clientId, initialDraft, referenceText, busy, onSave, onClose }) {
  const [value, setValue] = useState({ client_id: clientId || clients[0]?.id || '', title: initialDraft?.title || '',
    context: initialDraft?.context || '', source_url: '' });
  const [recording, setRecording] = useState(false);
  const [referenceError, setReferenceError] = useState('');
  const request = useRef({ id: crypto.randomUUID(), fingerprint: null });
  const subject = useRef(null);
  const reference = useRef(null);
  const contextField = useRef(null);
  useEffect(() => { if (initialDraft) subject.current?.focus(); }, [initialDraft]);
  const set = (key, text) => setValue(v => ({ ...v, [key]: text }));
  const useExcerpt = () => {
    const { value: answer, selectionStart, selectionEnd } = reference.current;
    const excerpt = answer.slice(selectionStart, selectionEnd).trim();
    if (!excerpt) { setReferenceError('Selecione o trecho que quer incluir na demanda.'); reference.current.focus(); return; }
    const context = [value.context.trimEnd(), excerpt].filter(Boolean).join('\n\n');
    if (context.length > 12000) { setReferenceError('Escolha um trecho menor para manter o contexto em até 12.000 caracteres.'); return; }
    set('context', context);
    setReferenceError('');
    reference.current.setSelectionRange(selectionEnd, selectionEnd);
    contextField.current.focus();
  };
  const save = async e => {
    e.preventDefault();
    if (busy || recording) return;
    const fingerprint = JSON.stringify(value);
    if (request.current.fingerprint && request.current.fingerprint !== fingerprint) request.current.id = crypto.randomUUID();
    request.current.fingerprint = fingerprint;
    await onSave({ ...value, request_id: request.current.id });
  };
  return <section className="atlas-demand-panel" aria-label="Registrar demanda">
    <div className="atlas-demand-header"><h3>Nova demanda</h3>
      <button className="atlas-demand-button" type="button" onClick={onClose} disabled={busy || recording}><X size={14} />Fechar</button>
    </div>
    <form onSubmit={save} className="atlas-demand-form">
      <div className="atlas-demand-grid">
        <label>Cliente<select className="atlas-demand-input" value={value.client_id} onChange={e => set('client_id', e.target.value)} required disabled={Boolean(clientId) || busy}>
          {clients.map(c => <option value={c.id} key={c.id}>{c.empresa}</option>)}
        </select></label>
        <label>Assunto<input className="atlas-demand-input" ref={subject} maxLength={180} required value={value.title} onChange={e => set('title', e.target.value)} disabled={busy} /></label>
      </div>
      {referenceText && <div className="atlas-demand-form">
        <label>Resposta privada do Atlas<textarea ref={reference} className="atlas-demand-input" rows={5} readOnly value={referenceText} /></label>
        <p className="atlas-demand-muted">Selecione o trecho que a equipe precisa para executar. Você pode editar o contexto antes de guardar.</p>
        {referenceError && <p role="alert" className="atlas-demand-error">{referenceError}</p>}
        <div className="atlas-demand-actions"><button className="atlas-demand-button" type="button" disabled={busy || recording} onClick={useExcerpt}>Usar trecho selecionado</button></div>
      </div>}
      <label>Contexto e resultado esperado<textarea ref={contextField} className="atlas-demand-input" rows={5} maxLength={12000} required value={value.context}
        onChange={e => set('context', e.target.value)} disabled={busy} /></label>
      <AtlasDictationButton disabled={busy} onActiveChange={setRecording} onText={text => setValue(v => ({ ...v, context: (v.context ? v.context + '\n' : '') + text }))} />
      <label>Link de referência (opcional)<input className="atlas-demand-input" type="url" maxLength={2000} placeholder="https://…" value={value.source_url}
        onChange={e => set('source_url', e.target.value)} disabled={busy} /></label>
      <div className="atlas-demand-actions"><button className="atlas-demand-button is-primary"
        disabled={busy || recording || Boolean(referenceText) && !value.context.trim()} type="submit">Guardar demanda</button>
        <span className="atlas-demand-muted">A análise e o repasse vêm depois de salvar.</span></div>
    </form>
  </section>;
}
