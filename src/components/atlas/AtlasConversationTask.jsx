import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Check, ClipboardList } from 'lucide-react';
import { demandRpc, loadAtlasConversationDemands, loadAtlasDemandReview } from '@/lib/atlasDemands';
import { executeAutomation, getAutomationErrorMessages } from '@/lib/workflow';
import AtlasDemandReview from './AtlasDemandReview';

export function useAtlasConversationDemands(ownerId, clientId, requestIds) {
  const ids = requestIds.join(',');
  const key = JSON.stringify([ownerId, clientId, ids]);
  const [snapshot, setSnapshot] = useState(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!ownerId || !clientId || !ids) return;
    let active = true;
    loadAtlasConversationDemands({ ownerId, clientId, requestIds: ids.split(',') }).then(rows => {
      if (active) setSnapshot({ key, rows });
    }).catch(error => {
      if (active) setSnapshot({ key, error: error.message });
    });
    return () => { active = false; };
  }, [ownerId, clientId, ids, key, reload]);
  if (snapshot?.key !== key) return {};
  return {
    rows: snapshot.rows,
    error: snapshot.error,
    retry: () => { setSnapshot(null); setReload(value => value + 1); },
    update: row => setSnapshot(current => current?.key === key && current.rows
      ? { ...current, rows: [...current.rows.filter(item => item.request_id !== row.request_id), row] } : current),
  };
}

export default function AtlasConversationTask({ ownerId, clientId, clientName, requestId, title, content, demand, onChange, disabled }) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState(null);
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);

  const action = (p_action, p_data) => demandRpc('atlas_demand_action', { p_action, p_data });
  const sync = async work => {
    if (lock.current || disabled) return;
    lock.current = true;
    setBusy(true); setError('');
    try { await work(); }
    catch (failure) {
      try {
        const [current] = await loadAtlasConversationDemands({ ownerId, clientId, requestIds: [requestId] }) || [];
        if (current) onChange(current);
        if (current?.state === 'linked' || current?.state === 'archived') {
          setReview(null);
          return;
        }
        if (failure.code === 'PT409' || current && review && current.revision !== review.demand.revision) {
          setReview(null); setStale(true);
        }
      } catch { /* Keep the original action error visible. */ }
      setError(failure.message || 'Não foi possível confirmar o repasse.');
    } finally { lock.current = false; setBusy(false); }
  };
  const open = () => sync(async () => {
    let current = demand;
    if (!current) {
      const result = await action('create', { request_id: requestId, client_id: clientId, title, context: content });
      current = result.demand;
      onChange(current);
    }
    if (current.state === 'linked') {
      const [confirmed] = await loadAtlasConversationDemands({ ownerId, clientId, requestIds: [requestId] }) || [];
      if (confirmed) onChange(confirmed);
      return;
    }
    if (current.state === 'archived') return;
    if (current.state === 'draft' || stale && current.state === 'proposed') {
      const result = await action('prepare_manual', { id: current.id, revision: current.revision });
      current = result.demand;
      onChange(current);
    }
    if (current.state !== 'proposed') throw new Error('A proposta está em outra etapa. Confira a demanda na ficha do cliente.');
    setReview(await loadAtlasDemandReview(current));
    setStale(false);
  });
  const approve = value => sync(async () => {
    const result = await action('approve', value);
    if (!result.task?.id || result.demand?.state !== 'linked' || result.demand.task_id !== result.task.id) throw new Error('O serviço não confirmou uma tarefa para este repasse.');
    onChange({ ...result.demand, task_available: true });
    setReview(null);
    if (result.created && !result.replayed) {
      try {
        const automation = await executeAutomation(result.task.id, 'task_created', { task: result.task });
        if (getAutomationErrorMessages(automation).length) throw new Error();
      } catch { setError('O repasse foi aprovado. Confira as automações na tarefa.'); }
    }
  });
  const refuse = () => sync(async () => {
    const result = await action('archive', { id: demand.id, revision: demand.revision });
    onChange(result.demand);
    setReview(null);
  });

  if (!demand && !busy && !error) return <button type="button" className="atlas-text-button atlas-converse-prepare-task" disabled={disabled} onClick={open}><ClipboardList size={15} aria-hidden="true" />Preparar tarefa</button>;
  return <div className="atlas-converse-task">
    <div className="atlas-converse-task-heading">
      {demand?.state === 'linked' ? <Check size={17} aria-hidden="true" /> : <ClipboardList size={17} aria-hidden="true" />}
      <div><strong>{demand?.state === 'linked' ? 'Repasse aprovado' : demand?.state === 'archived' ? 'Proposta recusada' : 'Proposta de tarefa'}</strong><small>{clientName}</small></div>
    </div>
    {busy && <p role="status">Confirmando com o Planeje…</p>}
    {error && <p role="alert">{error}</p>}
    {demand?.state === 'linked' ? (demand.task_id && demand.task_available
      ? <Link className="atlas-text-button" to={'/tasks/list/' + demand.task_id}>Abrir tarefa em Tarefas <ArrowUpRight size={14} aria-hidden="true" /></Link>
      : <p>A tarefa vinculada não está disponível.</p>) : demand?.state === 'archived' ? <p>O histórico foi guardado.</p> : <>
      {review ? <AtlasDemandReview key={review.demand.revision} demand={review.demand} context={review} busy={busy || disabled} onApprove={approve} onClose={() => setReview(null)} /> :
        <button type="button" className="atlas-text-button" disabled={busy || disabled} onClick={open}>{stale ? 'Atualizar proposta' : demand?.state === 'proposed' ? 'Revisar proposta' : 'Preparar tarefa'}</button>}
      {demand && <button type="button" className="atlas-text-button atlas-converse-refuse" disabled={busy || disabled} onClick={refuse}>Recusar proposta</button>}
    </>}
  </div>;
}
