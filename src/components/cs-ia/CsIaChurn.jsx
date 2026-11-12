import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import GestorIaDrawer from '@/components/gestor-ia/GestorIaDrawer';
import { buildClientHubUrl } from '@/lib/clientHubRoutes';
import { dateTime } from './csIaPresentation';

export function CsIaChurnEditor({ clientName, onSave, onClose }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (busy || !reason.trim()) return;
    setBusy(true);
    setError('');
    try {
      await onSave(reason);
      onClose();
    } catch (failure) {
      setError(failure.message);
      setBusy(false);
    }
  }

  return <GestorIaDrawer label="CS IA · Carteira" title="Encerrar acompanhamento" close={onClose} busy={busy}>
    <form className="gia-stack" onSubmit={submit}>
      <p><strong>{clientName}</strong> sairá da carteira ativa e passará para <strong>Perdido</strong> no cadastro de Clientes. O motivo ficará em Contas encerradas.</p>
      <label className="cs-filter"><span>Motivo do encerramento</span>
        <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={4} required maxLength={1000} disabled={busy} />
      </label>
      {error && <p role="alert" className="gia-notice">{error}</p>}
      <div className="cs-actions">
        <button type="button" className="gia-action-link" onClick={(event) => event.currentTarget.closest('dialog').close()} disabled={busy}>Cancelar</button>
        <button type="submit" className="gia-action-link cs-close-action" disabled={busy || !reason.trim()}>{busy ? 'Registrando…' : 'Confirmar encerramento'}</button>
      </div>
    </form>
  </GestorIaDrawer>;
}

export function CsIaChurn({ entries, loading, error, confirmedId, onReload }) {
  const sorted = [...entries].sort((a, b) => Date.parse(b.closed_at) - Date.parse(a.closed_at) || b.id.localeCompare(a.id));

  return <div className="gia-stack cs-section">
    <Link className="gia-action-link cs-back" to="/cs-ia/carteira"><ArrowLeft aria-hidden="true" /> Carteira</Link>
    <header className="gia-header cs-header"><div><p className="gia-eyebrow">CS IA · Carteira</p><h1>Contas encerradas</h1>
      <p className="cs-subtitle">Consulte o motivo e a data dos encerramentos registrados pelo CS.</p></div></header>
    {sorted.some((entry) => entry.id === confirmedId) && <p className="cs-success" role="status">Encerramento registrado.</p>}
    {loading && <p role="status">Carregando contas encerradas…</p>}
    {error && <div className="gia-notice" role="alert">{error} <button className="gia-action-link" type="button" onClick={onReload}>Tentar novamente</button></div>}
    {!loading && !error && !sorted.length && <p className="gia-panel gia-empty">Nenhum encerramento registrado.</p>}
    {!!sorted.length && <ul className="gia-stack cs-churn-list">
      {sorted.map((entry) => <li key={entry.id} className="gia-panel gia-stack">
        <div className="gia-section-heading"><h2>{entry.client_name}</h2>
          <span className="gia-tag">{entry.current_stage === 'closed' ? 'Reativado' : entry.current_stage === 'lost' ? 'Encerrado' : 'Em outra etapa'}</span></div>
        <time className="gia-caption" dateTime={entry.closed_at}>{dateTime(entry.closed_at)}</time>
        <p className="gia-prose">{entry.reason}</p>
        <Link className="gia-action-link cs-back" to={buildClientHubUrl(entry.client_id)}>Abrir ficha no Planeje <ArrowUpRight aria-hidden="true" /></Link>
      </li>)}
    </ul>}
  </div>;
}
