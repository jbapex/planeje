import React, { useEffect, useId, useRef, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { loadCsGroupLabel, saveCsGroupLabel } from '@/lib/csIaGroupInventory';

export default function CsIaGroupRename({ source, displayName, onSaved }) {
  const id = useId();
  const trigger = useRef(null);
  const input = useRef(null);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (open && label) input.current?.focus(); }, [open, label]);

  async function refresh() {
    setOpen(true);
    setBusy(true);
    setError('');
    try {
      const current = await loadCsGroupLabel(supabase, source);
      setLabel(current);
      setDraft(current.name || current.officialName);
    } catch (failure) {
      setLabel(null);
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setOpen(false);
    setLabel(null);
    trigger.current?.focus();
  }

  async function save(name) {
    if (!label || busy) return;
    setBusy(true);
    setError('');
    try {
      await saveCsGroupLabel(supabase, source, label.version, name);
      close();
      onSaved();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  const name = draft.trim();
  return <>
    <button ref={trigger} type="button" className="gia-action-link" aria-expanded={open} aria-controls={open ? id : undefined}
      aria-label={`Renomear no CS · ${displayName}`} onClick={busy ? undefined : open ? close : refresh} aria-disabled={busy}
      onKeyDown={(event) => { if (open && !busy && event.key === 'Escape') close(); }}>Renomear no CS</button>
    {open && <form id={id} className="gia-stack cs-group-rename" aria-label="Renomear grupo no CS" onSubmit={(event) => {
      event.preventDefault();
      if (name && name !== (label?.name || label?.officialName)) void save(name);
    }} onKeyDown={(event) => {
      if (event.key === 'Escape' && !busy) { event.preventDefault(); close(); }
    }}>
      {busy && !label && <p role="status">Carregando nome do grupo…</p>}
      {label && <label className="cs-filter"><span>Nome do grupo no CS</span>
        <input ref={input} maxLength={120} value={draft} onChange={(event) => setDraft(event.target.value)} disabled={busy} />
      </label>}
      {label && <p className="gia-caption">Nome oficial no WhatsApp · {label.officialName}. A mudança vale neste canal do CS.</p>}
      {error && <p className="gia-notice" role="alert">{error}</p>}
      <div className="cs-actions">
        <button type="button" className="gia-action-link" onClick={close} disabled={busy}>Cancelar</button>
        {error && <button type="button" className="gia-action-link" onClick={refresh} disabled={busy}>Atualizar nome</button>}
        {label?.name && <button type="button" className="gia-action-link" onClick={() => save(null)} disabled={busy}>Restaurar nome oficial</button>}
        {label && <button type="submit" className="gia-action-link gia-primary-action"
          disabled={busy || !name || name === (label.name || label.officialName)}>{busy ? 'Salvando…' : 'Salvar nome'}</button>}
      </div>
    </form>}
  </>;
}
