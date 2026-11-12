import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { demandRpc } from '@/lib/atlasDemands';
import { followupState, UPDATE_KINDS } from '@/lib/atlasTaskFollowup';
import AtlasDictationButton from './AtlasDictationButton';
import './AtlasDemandCentral.css';

export function AtlasFollowupPanel({ task, updates = [], status, manager, actorId, ownerId = manager ? actorId : task?.owner_id, people = [], comments = [], busy = false, onSubmit }) {
  const state = followupState(task, updates, status, undefined, comments, ownerId);
  const comment = state.lastComment;
  const commentAuthor = comment && (people.find(p => p.id === comment.user_id)?.full_name || comment.profiles?.full_name || comment.author || 'Equipe');
  const commentTime = comment?.created_at ?? comment?.at;
  const commentDate = commentTime && !Number.isNaN(Date.parse(commentTime)) ? new Date(commentTime).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;
  const [kind, setKind] = useState('received'), [text, setText] = useState(''), [target, setTarget] = useState(''), [recording, setRecording] = useState(false);
  const request = useRef(null);
  useEffect(() => { if (!target && !text && state.pending.length) setTarget(state.pending[0].id); }, [target, text, state.pending.map(u => u.id).join(',')]);
  const targetValid = state.pending.some(u => u.id === target);
  const canReport = !manager && (task?.assignee_ids || []).includes(actorId) && state.key !== 'done';
  const save = async e => {
    e.preventDefault();
    const body = text.trim(), reply = manager ? target : null, updateKind = manager ? 'owner_reply' : kind;
    if (!body || manager && !targetValid) return;
    const fingerprint = JSON.stringify([task.id, updateKind, body, reply]);
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
    const ok = await onSubmit({ p_task: task.id, p_kind: updateKind, p_text: body, p_id: request.current.id, p_reply_to: reply });
    if (ok !== false) { setText(''); setTarget(''); request.current = null; }
  };
  return <section className="atlas-followup" aria-label="Acompanhamento da tarefa pelo Atlas">
    <div className="atlas-followup-heading"><strong>{state.label}</strong>{state.overdue && <span className="atlas-demand-phase">Prazo vencido</span>}</div>
    <p className="atlas-followup-next">{state.next}.</p>
    {comment && <div className="atlas-followup-message"><span>{commentAuthor}{commentDate && <> · <time dateTime={commentTime}>{commentDate}</time></>}</span><p>{comment.content ?? comment.body}</p></div>}
    <p className="atlas-followup-stage">Etapa: {status?.label || task?.status || 'A conferir'}{state.total > 1 && ` · ${state.responded} de ${state.total} responsáveis registraram atualização`}</p>
    {state.pending.length > 0 && <ul className="atlas-followup-requests">{state.pending.map(u => <li key={u.id}><strong>{u.author || 'Equipe'}</strong><p>{u.content}</p></li>)}</ul>}
    {manager && state.pending.length > 0 && <form className="atlas-demand-form" onSubmit={save}>
      <label>Responder a<select className="atlas-demand-input" value={target} onChange={e => setTarget(e.target.value)} disabled={busy || recording} required><option value="">Selecione o retorno</option>{target && !targetValid && <option value={target}>Pedido atualizado — selecione novamente</option>}{state.pending.map(u => <option key={u.id} value={u.id}>{u.author || 'Equipe'} · {UPDATE_KINDS.find(([id]) => id === u.kind)?.[1]}</option>)}</select></label>
      <label>Resposta para a equipe<textarea className="atlas-demand-input" rows={3} required maxLength={4000} value={text} onChange={e => setText(e.target.value)} disabled={busy || recording} /></label>
      <div className="atlas-demand-actions"><AtlasDictationButton disabled={busy} onActiveChange={setRecording} onText={value => setText(previous => (previous ? previous + '\n' : '') + value)} /><button type="submit" className="atlas-demand-button is-primary" disabled={busy || recording || !text.trim() || !targetValid}>Registrar retorno para a equipe</button></div>
    </form>}
    {canReport && <form className="atlas-demand-form" onSubmit={save}>
      <label>Atualização para o Atlas<select className="atlas-demand-input" value={kind} onChange={e => setKind(e.target.value)} disabled={busy} required>{UPDATE_KINDS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>O que a equipe precisa registrar<textarea className="atlas-demand-input" rows={3} required maxLength={4000} value={text} onChange={e => setText(e.target.value)} placeholder={kind === 'needs_owner' ? 'Qual decisão precisa do dono e quais são as opções?' : kind === 'blocked' ? 'O que impede o avanço e de quem depende?' : kind === 'delivered' ? 'O que foi entregue e onde conferir?' : 'O que recebeu ou avançou e qual é o próximo passo?'} disabled={busy} /></label>
      <button type="submit" className="atlas-demand-button is-primary" disabled={busy || !text.trim()}>Registrar atualização</button>
    </form>}
    <details className="atlas-followup-help"><summary>Como o Atlas acompanha</summary><p>Os comentários mantêm o histórico. Para informar andamento, impedimento, decisão ou entrega, a equipe usa Atualização para o Atlas. A entrega aguarda revisão; a conclusão vem da etapa da tarefa.</p></details>
  </section>;
}

export default function AtlasTaskFollowup({ taskId, onUpdated, comments = [] }) {
  const { user } = useAuth();
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const epoch = useRef(0), lock = useRef(false);
  const refresh = useCallback(async () => {
    const current = epoch.current;
    try {
      const value = await demandRpc('atlas_task_followup_context', { p_task: taskId });
      if (current === epoch.current) { setData(value); setError(''); }
      return value;
    } catch (e) {
      if (current === epoch.current) { const forbidden = ['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(e.code); if (forbidden) setData(null); setError(e.code === '42501' ? '' : e.message); }
      throw e;
    }
  }, [taskId, user?.id]);
  useEffect(() => { epoch.current++; setData(null); setError(''); refresh().catch(() => {}); const timer = setInterval(() => { if (!document.hidden && !lock.current) refresh().catch(() => {}); }, 15000); return () => { epoch.current++; clearInterval(timer); }; }, [refresh]);
  const run = async action => {
    if (lock.current) return false;
    const current = epoch.current; lock.current = true; setBusy(true); setError('');
    try { await action(); await refresh(); await onUpdated?.(); return true; }
    catch (e) { if (current === epoch.current) setError(e.message); return false; }
    finally { lock.current = false; if (current === epoch.current) setBusy(false); }
  };
  if (!data) return error ? <p className="atlas-demand-error" role="alert">{error}</p> : null;
  return <div className="atlas-task-followup">
    {error && <p className="atlas-demand-error" role="alert">{error}</p>}
    {!data.watching ? data.manager && <button type="button" className="atlas-demand-button" disabled={busy} onClick={() => run(() => demandRpc('atlas_task_followup_watch', { p_task: taskId, p_hash: data.task.task_hash }))}>Acompanhar esta tarefa com o Atlas</button> : <>
      <AtlasFollowupPanel key={taskId} task={data.task} status={data.status} updates={data.updates} comments={comments} manager={data.manager} actorId={user?.id} ownerId={data.owner_id} people={data.people} busy={busy} onSubmit={args => run(() => demandRpc('atlas_task_followup_update', args))} />
      {data.manager && <Link className="atlas-demand-link" to="/caixa">Ver acompanhamento na Minha caixa ↗</Link>}
    </>}
  </div>;
}
