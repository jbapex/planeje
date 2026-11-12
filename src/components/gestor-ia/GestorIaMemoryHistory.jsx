import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { date } from './GestorIaContext';
import GestorIaDrawer from './GestorIaDrawer';
import { loadGestorMemoryReference, loadPreviousGestorAtlasMemory } from './gestorIaMemoryData';

const referenceStates = { active: 'Vigente', replaced: 'Substituída', revoked: 'Retirada' };

export function AtlasNoteReference({ clientId, ownerId, memoryId, close }) {
  const [reading, setReading] = useState(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    loadGestorMemoryReference(supabase, { clientId, ownerId, memoryId })
      .then((note) => { if (active) setReading({ note }); })
      .catch(() => { if (active) setReading({ error: true }); });
    return () => { active = false; };
  }, [clientId, ownerId, memoryId, retry]);
  const note = reading?.note;
  return <GestorIaDrawer label="Memória do cliente" title="Anotação citada" close={close}>
    {!reading ? <p role="status">Consultando a versão citada…</p>
      : reading.error ? <div><p role="alert">Não foi possível consultar a versão citada.</p><button type="button" className="gia-action-link"
        onClick={() => { setReading(null); setRetry((value) => value + 1); }}>Tentar novamente</button></div>
        : note ? <article className="gia-panel"><h3>Versão {note.version} · {referenceStates[note.state]}</h3>
          <small className="gia-caption">{date(note.created_at)}</small><p className="gia-prose">{note.content}</p></article>
          : <p className="gia-caption">Anotação indisponível nesta ficha.</p>}
  </GestorIaDrawer>;
}

export default function AtlasNoteHistory({ clientId, ownerId, note, close, reuse }) {
  const [versions, setVersions] = useState([note]);
  const [index, setIndex] = useState(1);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState(false);
  const selected = versions[index];
  const newer = versions[index - 1];

  useEffect(() => {
    if (selected) return;
    let active = true;
    loadPreviousGestorAtlasMemory(supabase, { clientId, ownerId, note: newer }).then((previous) => {
      if (!active) return;
      if (previous) setVersions((current) => [...current, previous]);
      else setError(true);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [clientId, ownerId, newer, selected, retry]);

  return <GestorIaDrawer label="Memória do cliente" title="Histórico da anotação" close={close}>
    <div className="gia-memory-history">
      <article className="gia-panel"><h3>Versão {note.version} · Vigente</h3><small className="gia-caption">{date(note.created_at)}</small><p className="gia-prose">{note.content}</p></article>
      <article className="gia-panel" aria-label="Versão consultada">
        {selected ? <><h3>Versão {selected.version} · Substituída</h3><small className="gia-caption">{date(selected.created_at)}</small><p className="gia-prose">{selected.content}</p></>
          : error ? <><p role="alert">Não foi possível consultar esta versão.</p><button className="gia-action-link" type="button"
            onClick={() => { setError(false); setRetry((count) => count + 1); }}>Tentar novamente</button></>
            : <p role="status">Consultando a versão anterior…</p>}
      </article>
    </div>
    <div className="gia-header-actions">
      <button className="gia-action-link" type="button" disabled={!selected?.replaces_id} onClick={() => setIndex(index + 1)}>Versão anterior</button>
      <button className="gia-action-link" type="button" disabled={index === 1} onClick={() => { setError(false); setIndex(index - 1); }}>Versão seguinte</button>
      {reuse && selected && <button className="gia-action-link gia-primary-action" type="button" onClick={() => reuse(selected.content)}>Usar texto como rascunho</button>}
    </div>
    <p className="gia-caption">A versão vigente orienta as próximas consultas.{reuse && ' Para reaproveitar um texto antigo, confirme a correção na ficha.'}</p>
  </GestorIaDrawer>;
}
