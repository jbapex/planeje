import React, { useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { CrmIaPagination, CrmIaState, useCrmRead } from './CrmIaPrimitives';
import { dateTime } from './crmIaPresentation';

export default function CrmIaNotificationFeed({ api, mutate, workspace, revision, compact = false }) {
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const [reload, setReload] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const panelId = useId();
  const read = useCrmRead(api, 'notifications', { offset, limit: 20 }, `${revision}:${reload}`, open, 15000);
  async function markRead() {
    if (busy.current || !read.data?.snapshot?.id) return;
    busy.current = true; setPending(true); setError('');
    try { await mutate('mark_notifications_read', { snapshot_id: read.data.snapshot.id }); setReload(value => value + 1); }
    catch (failure) { setError(failure.message); }
    finally { busy.current = false; setPending(false); }
  }
  return <div className="crm-ia-notification-feed" onKeyDown={event => { if (event.key === 'Escape') setOpen(false); }}>
    <button type="button" className={compact ? 'crm-ia-icon-button' : undefined} aria-label="Notificações" title="Notificações" aria-controls={panelId} aria-expanded={open} onClick={() => setOpen(value => !value)}>{compact ? <Mail size={16} aria-hidden="true" /> : 'Notificações'}</button>
    {open && <section id={panelId} className="crm-ia-card crm-ia-notification-popover" aria-label="Notificações internas">
      <div className="crm-ia-section-heading"><h2>Notificações</h2><button type="button" onClick={() => setOpen(false)}>Fechar notificações</button></div>
      <p className="crm-ia-muted">Novos leads da conta. A leitura é individual e não altera o atendimento.</p>
      {error && <p className="crm-ia-error" role="alert">{error}</p>}
      <CrmIaState read={read} retry={() => setReload(value => value + 1)}>
        <div className="crm-ia-toolbar"><span>{read.data?.unread_count ?? '—'} não lidas</span><button type="button" disabled={pending || !read.data?.snapshot?.id || !read.data?.unread_count} onClick={markRead}>{pending ? 'Marcando…' : 'Marcar todas como lidas'}</button></div>
        <ul className="crm-ia-list">{(read.data?.rows || []).map(item => <li key={item.id}><Link to={`/crm-ia/leads?${new URLSearchParams({ cliente: workspace.client.id, lead_id: item.lead_id })}`}><strong>Novo lead</strong><small>{dateTime(item.created_at)}</small></Link><span className="crm-ia-badge">{item.read ? 'Lida' : 'Não lida'}</span></li>)}</ul>
        {read.data?.rows?.length === 0 && <p className="crm-ia-muted">Nenhuma notificação disponível.</p>}
        <CrmIaPagination total={read.data?.total} offset={offset} limit={20} onPage={setOffset} />
      </CrmIaState>
    </section>}
  </div>;
}
