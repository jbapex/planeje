import React, { useEffect, useId, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Textarea } from '@/components/ui/textarea';
import { revokeAtlasMemory, saveAtlasMemory } from '@/lib/atlasApi';
import { GESTOR_ATLAS_CONVERSATION } from '@/lib/gestorIaAtlasDraft';
import { supabase } from '@/lib/customSupabaseClient';
import { date } from './GestorIaContext';
import { agendaMemoryPermissions, canUseGestorAtlasMemory, GESTOR_ATLAS_MEMORY_LIMIT, loadGestorAtlasMemories,
  loadGestorMemorySources, saveGestorDecisionLearning } from './gestorIaMemoryData';
import { DECISION_VERDICTS } from './gestorIaDecisionLog';
import { clientPage } from './gestorIaClientModel';
import { goalAccountId } from './gestorIaMediaGoalData';
import { decisionMemoryExcerpt, isMemoryReferenceId, memoryFitsDecisionAccount } from '../../../supabase/functions/gestor-ia-decisions/memory.js';
import { GESTOR_AGENDA_AI_ENABLED } from './gestorIaAgendaAiData';
import AtlasNoteHistory, { AtlasNoteReference } from './GestorIaMemoryHistory';

const manualAnalysisEnabled = import.meta.env?.VITE_GESTOR_IA_DECISIONS_ENABLED === 'true';

export default function AtlasNotes({ client, ownerId, atlasDraft, initialDraft, canReadDecisions, canChooseAccount, accountId }) {
  const clientId = client.id;
  const [params, setParams] = useSearchParams();
  const referenceId = params.get('versao_memoria');
  const editorId = useId();
  const noteId = useId();
  const [reading, setReading] = useState(null);
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState(() => initialDraft || null);
  const [revokeId, setRevokeId] = useState(null);
  const [content, setContent] = useState(initialDraft?.content || '');
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [history, setHistory] = useState(null);
  const noteInput = useRef(null);
  const savingRef = useRef(false);

  useEffect(() => {
    let active = true;
    loadGestorAtlasMemories(supabase, { clientId, ownerId }).then(async (notes) => {
      if (!active) return;
      setReading({ notes });
      if (!notes?.length) return;
      const candidates = notes.filter((note) => !note.team_shared && decisionMemoryExcerpt(note)).map(({ id }) => id);
      const [origin, agenda] = await Promise.allSettled([
        canReadDecisions ? loadGestorMemorySources(supabase, clientId, notes.map(({ id }) => id)) : null,
        GESTOR_AGENDA_AI_ENABLED ? agendaMemoryPermissions(supabase, clientId, candidates) : null,
      ]);
      if (active) setReading({ notes, sources: origin.value, sourceError: origin.status === 'rejected',
        agendaPermissions: agenda.value, agendaError: agenda.status === 'rejected' });
    }).catch(() => {
      if (active) setReading({ error: true });
    });
    return () => { active = false; };
  }, [clientId, ownerId, version, canReadDecisions]);

  const editorVisible = Boolean(editing && reading?.notes);
  useEffect(() => { if (editorVisible) noteInput.current?.focus(); }, [editorVisible, editing]);

  function openEditor(note) {
    setEditing(note);
    setContent(note?.content || '');
    setConfirmed(false);
    setRevokeId(null);
    setNotice(null);
  }

  async function updateMemory(update) {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setNotice(null);
    try {
      if (!await canUseGestorAtlasMemory(supabase, clientId)) {
        setReading({ notes: null });
        return;
      }
      setNotice({ text: await update() });
    } catch (failure) {
      setConfirmed(false);
      setNotice({ error: true, text: failure?.decisionLearning ? failure.message : 'Não foi possível confirmar a gravação. Confira a lista antes de repetir.' });
    } finally {
      setVersion((current) => current + 1);
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function save(event) {
    event.preventDefault();
    const note = content.trim();
    if (!reading?.notes || !editing || !confirmed || !note || note.length > 4000) return;
    const replacesId = editing.id || null;
    await updateMemory(async () => {
      const memory = editing.decisionId
        ? await saveGestorDecisionLearning(supabase, { decisionId: editing.decisionId, revision: editing.revision, content: note, confirmed })
        : (await saveAtlasMemory({ content: note, clientId, replacesId })).memory;
      if (!memory?.id || memory.client_id !== clientId || memory.owner_id !== ownerId ||
          (replacesId && memory.replaces_id !== replacesId)) throw new Error('Anotação sem confirmação.');
      openEditor(null);
      return replacesId ? 'Correção salva como nova versão.' : editing.decisionId ? 'Aprendizado ligado ao veredito.' : 'Anotação salva no Atlas.';
    });
  }

  async function revoke() {
    if (!reading?.notes?.some((note) => note.id === revokeId && !note.team_shared)) return;
    await updateMemory(async () => {
      await revokeAtlasMemory(revokeId);
      setRevokeId(null);
      return 'Anotação retirada das próximas consultas do Atlas.';
    });
  }

  async function allowAgenda(note, allow) {
    if (!reading?.agendaPermissions || !Object.hasOwn(reading.agendaPermissions, note.id)) return;
    await updateMemory(async () => {
      await agendaMemoryPermissions(supabase, clientId, [note.id], allow);
      return allow ? 'Esta versão foi autorizada para a agenda.' : 'Autorização desta versão retirada.';
    });
  }

  function decisionLink(key, value, account) {
    const path = clientPage(clientId, params, 'decisoes');
    const query = new URLSearchParams(path.search);
    query.set(key, value);
    if (account) query.set('conta', account);
    return { ...path, search: query.toString() };
  }

  if (!reading) return <p className="gia-caption" role="status">Consultando anotações do Atlas…</p>;
  if (reading.error) return <div className="space-y-2">
    <p className="gia-caption" role="alert">Não foi possível consultar as anotações do Atlas.</p>
    <button type="button" className="gia-action-link" onClick={() => { setReading(null); setVersion((current) => current + 1); }}>Tentar novamente</button>
  </div>;
  if (!reading.notes) return <p className="gia-caption">As anotações do Atlas são acessíveis ao titular autorizado.</p>;

  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2">
      <button type="button" className="gia-action-link" disabled={saving} aria-expanded={Boolean(editing)} aria-controls={editing ? editorId : undefined}
        onClick={() => openEditor(editing ? null : {})}>{editing ? 'Fechar anotação' : 'Adicionar anotação'}</button>
      {atlasDraft && <Link className="gia-action-link" to={GESTOR_ATLAS_CONVERSATION} state={atlasDraft}>Conversar com Atlas</Link>}
    </div>
    {editing && <form id={editorId} className="space-y-3" onSubmit={save}>
      <label htmlFor={noteId} className="block">{editing.id ? 'Corrigir anotação privada' : editing.decisionId ? 'Aprendizado da decisão' : 'Nova anotação privada'}</label>
      <Textarea id={noteId} ref={noteInput} value={content} rows={3} maxLength={4000} disabled={saving} onChange={(event) => {
        setContent(event.target.value);
        setConfirmed(false);
      }} />
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={confirmed} disabled={saving} onChange={(event) => setConfirmed(event.target.checked)} />
        Confirmo o uso desta anotação no Atlas para este cliente.
      </label>
      <button type="submit" className="gia-action-link gia-primary-action" disabled={!confirmed || !content.trim() || saving}>
        {saving ? 'Salvando…' : editing.id ? 'Confirmar correção' : 'Confirmar e salvar'}
      </button>
    </form>}
    {notice && <p className="gia-caption" role={notice.error ? 'alert' : 'status'}>{notice.text}</p>}
    {reading.agendaError && <p className="gia-caption" role="status">Autorizações da agenda indisponíveis nesta leitura.</p>}
    {canReadDecisions && reading.sourceError && <p className="gia-caption" role="status">Origem das decisões indisponível nesta leitura.</p>}
    {reading.notes.length ? <ul className="gia-account-list gia-memory-list">
      {reading.notes.map((note) => {
        const source = canReadDecisions ? reading.sources?.[note.id] : null;
        const accounts = client.metaAccounts || [];
        const account = source?.accountId ? accounts.find(({ meta_account_id }) => goalAccountId(meta_account_id) === source.accountId)
          : accounts.find(({ meta_account_id }) => meta_account_id === accountId) || accounts[0];
        const canAnalyze = manualAnalysisEnabled && canReadDecisions && reading.sources && account && !saving && !note.team_shared &&
          (canChooseAccount || !source?.accountId) &&
          isMemoryReferenceId(note.id) && decisionMemoryExcerpt(note) && memoryFitsDecisionAccount(source, goalAccountId(account.meta_account_id));
        return <li key={note.id}>
        <small>{date(note.created_at)} · {note.learning_kind === 'pattern' ? 'Padrão observado' : note.learning_kind === 'fact' ? 'Fato relatado' : note.source === 'user_confirmation' ? 'Confirmada' : 'Memória do Atlas'} · {note.team_shared ? 'Uso com a equipe' : 'Privada'}
          {note.version > 1 && ` · Versão ${note.version}`}</small>
        <p className="gia-prose">{note.content}</p>
        {source && <div className="gia-memory-origin">
          <span className="gia-badge">Aprendizado {source.adId ? 'do anúncio' : source.campaignId ? 'da campanha' : 'da decisão'}</span>
          {source.accountId && <small>{account?.meta_account_name || account?.meta_account_id || 'Conta anterior'}</small>}
          <small>{source.current ? DECISION_VERDICTS[source.verdict] : 'Veredito atualizado'}</small>
          <Link className="gia-row-link" aria-label={`Ver decisão de origem · ${source.title}`}
            to={decisionLink('decisao_origem', source.decisionId)}>{source.title}</Link>
        </div>}
        {(!note.team_shared || note.replaces_id) && <div className="gia-memory-actions">
          {!note.team_shared && (revokeId === note.id ? <><span>Retirar das próximas consultas?</span>
            <button type="button" className="gia-action-link" disabled={saving} onClick={() => setRevokeId(null)}>Cancelar</button>
            <button type="button" className="gia-action-link" disabled={saving} onClick={revoke}>Confirmar retirada</button></>
            : <><button type="button" className="gia-action-link" disabled={saving} onClick={() => openEditor(note)}>Corrigir</button>
              <button type="button" className="gia-action-link" disabled={saving} onClick={() => { openEditor(null); setRevokeId(note.id); }}>Retirar do uso</button></>)}
          {note.replaces_id && note.version > 1 && revokeId !== note.id && <button type="button" className="gia-action-link" aria-haspopup="dialog"
            disabled={saving} onClick={() => setHistory(note)}>Ver histórico</button>}
          {canAnalyze && revokeId !== note.id && <Link className="gia-action-link gia-memory-reuse" aria-haspopup="dialog"
            to={decisionLink('usar_memoria', note.id, account.meta_account_id)}>Usar em análise</Link>}
        </div>}
        {Object.hasOwn(reading.agendaPermissions || {}, note.id) && <details className="gia-memory-agenda">
          <summary>IA agendada <span className={`gia-badge${reading.agendaPermissions[note.id] ? ' is-info' : ''}`}>
            {reading.agendaPermissions[note.id] ? 'Autorizada' : 'Sem autorização'}</span></summary>
          <p className="gia-caption">Quando um aviso corresponder ao aprendizado, a agenda pode enviar este trecho e as métricas do aviso à OpenAI. Correções geram uma nova versão.</p>
          <blockquote>{decisionMemoryExcerpt(note)}</blockquote>
          <button type="button" className="gia-action-link" disabled={saving} onClick={() => void allowAgenda(note, !reading.agendaPermissions[note.id])}>
            {reading.agendaPermissions[note.id] ? 'Retirar autorização da agenda' : 'Autorizar esta versão para a agenda'}</button>
        </details>}
      </li>; })}
    </ul> : <p className="gia-caption">Nada anotado ainda.</p>}
    {reading.notes.length === GESTOR_ATLAS_MEMORY_LIMIT && <p className="gia-caption">Exibindo as {GESTOR_ATLAS_MEMORY_LIMIT} anotações mais recentes.</p>}
    {history && <AtlasNoteHistory note={history} clientId={clientId} ownerId={ownerId} close={() => setHistory(null)}
      reuse={history.team_shared ? null : (text) => { setHistory(null); openEditor({ ...history, content: text }); }} />}
    {isMemoryReferenceId(referenceId) && <AtlasNoteReference key={referenceId} clientId={clientId} ownerId={ownerId} memoryId={referenceId}
      close={() => setParams((current) => {
        const next = new URLSearchParams(current); next.delete('versao_memoria'); return next;
      }, { replace: true })} />}
  </div>;
}
