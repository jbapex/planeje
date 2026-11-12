import React, { useEffect, useId, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { calendarStatus, dateTime, named, QUEUE_STATUS } from './crmIaPresentation';

export function useCrmRead(api, action, payload = {}, revision = 0, enabled = true, refreshEveryMs = 0) {
  const payloadKey = JSON.stringify(payload);
  const key = JSON.stringify([action, payloadKey, revision]);
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let current = true;
    let running = false;
    setResult({ key, pending: true });
    async function load() {
      if (running || !current) return;
      running = true;
      try { const data = await api(action, JSON.parse(payloadKey)); if (current) setResult({ key, data }); }
      catch (error) { if (current) setResult({ key, error: error.message || 'Não foi possível consultar esta fonte.' }); }
      finally { running = false; }
    }
    void load();
    const timer = refreshEveryMs > 0 ? setInterval(() => { if (typeof document === 'undefined' || document.visibilityState === 'visible') void load(); }, refreshEveryMs) : null;
    return () => { current = false; if (timer !== null) clearInterval(timer); };
  }, [api, action, key, payloadKey, enabled, refreshEveryMs]);
  return enabled ? result?.key === key ? result : { pending: true } : {};
}

export function CrmIaField({ label, value, onChange, options, type = 'text', children, ...props }) {
  const id = useId();
  const attributes = { id, 'aria-label': label, value: value ?? '', onChange: event => onChange(type === 'checkbox' ? event.target.checked : event.target.value), ...props };
  return <label className={type === 'checkbox' ? 'crm-ia-check' : 'crm-ia-field'} htmlFor={id}>
    {type !== 'checkbox' && <span>{label}</span>}
    {options ? <select {...attributes}>{options.map(item => <option key={item.value ?? item.id ?? item} value={item.value ?? item.id ?? item} disabled={item.disabled}>{item.label ?? named(item)}</option>)}</select>
      : type === 'textarea' ? <textarea rows={3} {...attributes} />
        : type === 'checkbox' ? <input {...attributes} type="checkbox" checked={Boolean(value)} value={undefined} /> : <input {...attributes} type={type} />}
    {type === 'checkbox' && <span>{label}</span>}{children && <small>{children}</small>}
  </label>;
}

export function CrmIaEditor({ title, description = 'Revise os campos antes de salvar.', children, onClose, onSave, saveLabel = 'Salvar', disabled, className, footerActions, onCloseAutoFocus }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function submit(event) {
    event.preventDefault();
    if (busy.current || disabled) return;
    busy.current = true; setPending(true); setError('');
    try { await onSave(); if (mounted.current) onClose(); }
    catch (failure) { if (mounted.current) setError(failure.message || 'Não foi possível salvar. Confira os dados atuais.'); }
    finally { busy.current = false; if (mounted.current) setPending(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy.current) onClose(); }}><DialogContent className={`crm-ia-dialog${className ? ` ${className}` : ''}`} aria-describedby={undefined} onCloseAutoFocus={onCloseAutoFocus}>
    <DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription>
    {onSave ? <form onSubmit={submit}><fieldset disabled={pending || disabled}>{children}</fieldset>
      {error && <p className="crm-ia-error" role="alert">{error}</p>}
      <footer>{footerActions?.({ pending, disabled })}<button type="button" disabled={pending} onClick={onClose}>Cancelar</button><button type="submit" className="crm-ia-primary" disabled={pending || disabled}>{pending ? 'Salvando…' : saveLabel}</button></footer>
    </form> : <div>{children}<button type="button" onClick={onClose}>Concluir</button></div>}
  </DialogContent></Dialog>;
}

export function CrmIaState({ read, retry, empty, children }) {
  if (read.pending) return <p className="crm-ia-state" role="status">Carregando…</p>;
  if (read.error) return <div className="crm-ia-error" role="alert">{read.error} <button type="button" onClick={retry}>Tentar novamente</button></div>;
  if (empty) return <p className="crm-ia-state" role="status">{empty}</p>;
  return children;
}

export function CrmIaPagination({ total = 0, offset, limit, onPage }) {
  return <nav className="crm-ia-pagination" aria-label="Paginação"><span>{total ? `${offset + 1}–${Math.min(offset + limit, total)} de ${total}` : 'Nenhum registro'}</span>
    <div><button type="button" disabled={!offset} onClick={() => onPage(Math.max(0, offset - limit))}>Anterior</button><button type="button" disabled={offset + limit >= total} onClick={() => onPage(offset + limit)}>Próxima</button></div></nav>;
}

export function CrmIaQueue({ api, revision, mutate, canManage, filters = {} }) {
  const [reload, setReload] = useState(0);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null);
  const [offset, setOffset] = useState(0);
  const read = useCrmRead(api, 'queue', { ...filters, offset, limit: 20 }, `${revision}:${reload}`, true, 15000);
  async function cancel(item) {
    if (pending) return;
    setPending(item.id); setError('');
    try { await mutate('cancel_message', { id: item.id, expected_updated_at: item.updated_at }); setReload(value => value + 1); }
    catch (failure) { setError(failure.message); } finally { setPending(null); }
  }
  return <section className="crm-ia-card"><div className="crm-ia-section-heading"><h2>Mensagens agendadas</h2><button type="button" onClick={() => setReload(value => value + 1)}>Atualizar fila</button></div>
    <p className="crm-ia-muted">Uma entrega incerta precisa de conferência. Ela não é reenviada automaticamente.</p>
    {error && <p className="crm-ia-error" role="alert">{error}</p>}
    <CrmIaState read={read} retry={() => setReload(value => value + 1)} empty={read.data?.rows?.length === 0 && 'Nenhuma mensagem agendada.'}>
      <ul className="crm-ia-list">{(read.data?.rows || []).map(item => <li key={item.id}><div><strong>{QUEUE_STATUS[item.status] || item.status}{item.kind === 'notification' ? ' · Aviso interno' : ''}</strong><p>{item.body}</p>
        {item.kind === 'notification' && <><small>{`Destinatário: ${item.recipient_label || item.recipient_phone || 'Indisponível'}`}{item.recipient_phone && item.recipient_label !== item.recipient_phone ? ` · ${item.recipient_phone}` : ''}</small><small>{`Lead fonte: ${item.source_lead ? named(item.source_lead) : item.contact ? named(item.contact) : 'Contato indisponível'}`}</small></>}
        <small>{dateTime(item.scheduled_at)}{item.kind !== 'notification' ? ` · ${item.contact ? named(item.contact) : 'Contato indisponível'}` : ''}{item.channel_name ? ` · ${item.channel_name}` : ''}</small>
        {calendarStatus(item.calendar) && <small>{calendarStatus(item.calendar)}</small>}{item.calendar_fallback && <small>A confirmação do horário foi substituída por um aviso de conferência pela equipe.</small>}
        {item.voice_status === 'generating' && <small>Preparando voz sintética…</small>}
        {item.voice_status === 'ready' && <small>{item.status === 'sent' ? 'Voz sintética enviada.' : 'Áudio preparado; envio ainda não confirmado.'}</small>}
        {item.voice_status === 'text_fallback' && <small>{item.status === 'sent' ? 'Enviada em texto: o áudio ficou indisponível.' : 'Será usada a resposta em texto: o áudio ficou indisponível.'}</small>}</div>
        {canManage && item.status === 'pending' && <button type="button" disabled={Boolean(pending)} onClick={() => cancel(item)}>{pending === item.id ? 'Cancelando…' : 'Cancelar mensagem'}</button>}</li>)}</ul>
      <CrmIaPagination total={read.data?.total} offset={offset} limit={20} onPage={setOffset} />
    </CrmIaState>
  </section>;
}
