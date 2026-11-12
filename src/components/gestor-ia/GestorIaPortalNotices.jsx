import React, { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { PortalNoticeList, usePortalNoticePages } from '@/components/client/ClientPortalNotices';
import { supabase } from '@/lib/customSupabaseClient';
import { loadDecisionPortalNotice, PORTAL_NOTICE_MESSAGE_LIMIT, PORTAL_NOTICE_TITLE_LIMIT, publishPortalNotice, withdrawPortalNotice } from '@/lib/gestorIaPortalNotices';
import GestorIaDrawer from './GestorIaDrawer';

export function DecisionPortalNotice({ client, decisionId, persist, reloadLog, disabled, setBusy }) {
  const [resolvedId, setResolvedId] = useState(null);
  const [reading, setReading] = useState(null);
  const [revision, setRevision] = useState(0);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [needsReload, setNeedsReload] = useState(false);
  const id = decisionId || resolvedId;

  useEffect(() => {
    if (!id) return;
    let active = true;
    loadDecisionPortalNotice(supabase, id).then((copy) => { if (active) setReading({ copy }); })
      .catch((failure) => { if (active) setReading({ error: failure.message }); });
    return () => { active = false; };
  }, [id, revision]);

  const copy = reading?.copy;
  const published = Boolean(copy?.published_at);
  const waiting = Boolean(id && !reading);
  const reload = () => { setDraft(null); setReading(null); setError(''); setNeedsReload(false); setRevision((n) => n + 1); };

  async function save(publish) {
    if (disabled || saving || needsReload) return;
    setSaving(true);
    setBusy(true);
    setError('');
    let createdId;
    try {
      if (publish && !id) createdId = (await persist()).id;
      const next = publish ? await publishPortalNotice(supabase, id || createdId, copy?.revision || 0, draft.title, draft.message)
        : await withdrawPortalNotice(supabase, copy);
      setReading({ copy: next });
      setDraft(null);
    } catch (failure) {
      setError(failure.message);
      setNeedsReload(true);
    } finally {
      if (createdId) { setResolvedId(createdId); void reloadLog(); }
      setSaving(false);
      setBusy(false);
    }
  }

  const locked = disabled || saving || needsReload;
  return <section className="gia-panel gia-stack" aria-label="Visibilidade do aviso">
    <div className="gia-section-heading"><h3 className="gia-inline-icon"><Bell size={16} aria-hidden="true" />Visibilidade do aviso</h3>
      {waiting ? <small role="status">Consultando…</small> : !reading?.error && <span role="status" className={`gia-delivery${published ? ' is-active' : ''}`}>{published ? 'Visível ao cliente' : 'Interno'}</span>}
    </div>
    {published && !draft && <div><strong>{copy.title}</strong><p className="gia-prose">{copy.message}</p></div>}
    {!waiting && !reading?.error && !draft && <div className="gia-header-actions">
      <button className="gia-action-link" type="button" disabled={locked} onClick={() => setDraft({ title: copy?.title || '', message: copy?.message || '' })}>
        {published ? 'Editar aviso publicado' : 'Preparar aviso ao cliente'}</button>
      {published && <button className="gia-action-link" type="button" disabled={locked} onClick={() => void save(false)}>Retirar do portal</button>}
    </div>}
    {draft && <form className="gia-stack gia-decision-form" onSubmit={(event) => {
      event.preventDefault();
      if (draft.title.trim() && draft.message.trim()) void save(true);
    }}>
      <p className="gia-caption">Esta versão ficará visível aos logins de {client.empresa} com acesso ao Dashboard.</p>
      <label>Título no portal<input required maxLength={PORTAL_NOTICE_TITLE_LIMIT} disabled={locked} value={draft.title}
        onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
      <label>Mensagem no portal<textarea required maxLength={PORTAL_NOTICE_MESSAGE_LIMIT} rows={4} disabled={locked} value={draft.message}
        onChange={(e) => setDraft({ ...draft, message: e.target.value })} /></label>
      <div className="gia-header-actions">
        <button className="gia-action-link" type="button" disabled={saving} onClick={() => setDraft(null)}>Cancelar</button>
        <button className="gia-action-link gia-primary-action" type="submit" disabled={locked || !draft.title.trim() || !draft.message.trim()}>
          {saving ? 'Salvando…' : published ? 'Atualizar aviso no portal' : 'Publicar aviso no portal'}
        </button>
      </div>
    </form>}
    {(error || reading?.error) && <p className="gia-notice" role="alert">{error || reading.error}</p>}
    {(needsReload || reading?.error) && <div><button className="gia-action-link" type="button" onClick={reload}>Atualizar visibilidade</button></div>}
  </section>;
}

function PublishedNotices({ client, close }) {
  const pages = usePortalNoticePages(client.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function withdraw(row) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try { await withdrawPortalNotice(supabase, row); setNotice('Aviso retirado do portal.'); }
    catch (failure) { setError(failure.message); }
    finally { pages.reload(); setBusy(false); }
  }
  return <GestorIaDrawer label="Janela do cliente" title="Avisos publicados" busy={busy} close={close}>
    <p className="gia-caption">{client.empresa}</p>
    <PortalNoticeList pages={pages} action={(row) => <button className="gia-action-link" type="button" disabled={busy}
      aria-label={`Retirar do portal · ${row.title}`} onClick={() => void withdraw(row)}>Retirar do portal</button>} />
    {notice && <p className="gia-caption" role="status">{notice}</p>}
    {error && <p className="gia-notice" role="alert">{error}</p>}
  </GestorIaDrawer>;
}

export default function GestorIaPortalNotices({ client }) {
  const [open, setOpen] = useState(false);
  return <>
    <button className="gia-action-link" type="button" aria-haspopup="dialog" onClick={() => setOpen(true)}>Gerenciar avisos</button>
    {open && <PublishedNotices client={client} close={() => setOpen(false)} />}
  </>;
}
