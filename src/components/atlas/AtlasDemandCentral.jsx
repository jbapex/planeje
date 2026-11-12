import AtlasEventPanel from './AtlasEventPanel';
import {managedDemandIds} from '@/lib/atlasEventProgress';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Plus, RefreshCw, Sparkles, ArrowUpRight, X } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { loadDemands, demandRpc, analyzeDemand, loadAtlasDemandReview } from '@/lib/atlasDemands';
import { operationLabel, demandPhase, demandNextStep, ownerIntakeThread } from '@/lib/atlasDemandPresentation';
import { executeAutomation, getAutomationErrorMessages } from '@/lib/workflow';
import AtlasDictationButton from './AtlasDictationButton';
import AtlasDemandReview from './AtlasDemandReview';
import './AtlasDemandCentral.css';
import { AtlasFollowupPanel } from './AtlasTaskFollowup';
import AtlasFollowupReference from './AtlasFollowupReference';
import { followupState, hydrateTaskUpdates } from '@/lib/atlasTaskFollowup';
import { ATLAS_DEMAND_PILOT } from '@/lib/atlasDemands';
import { csTaskReturn } from '@/lib/csIaTaskNavigation';

const date = value => value ? new Date(value.length === 10 ? value + 'T12:00:00' : value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', ...(value.length > 10 ? { hour: '2-digit', minute: '2-digit' } : {}) }) : 'A definir';
const Input = props => <input className="atlas-demand-input" {...props} />;
const Select = props => <select className="atlas-demand-input" {...props} />;
const Area = props => <textarea className="atlas-demand-input" {...props} />;
const Button = ({ primary, children, ...props }) => <button type="button" className={`atlas-demand-button ${primary ? 'is-primary' : ''}`} {...props}>{children}</button>;

function NewDemand({ clients, clientId, busy, onSave, onClose }) {
  const [value, setValue] = useState({ client_id: clientId || clients[0]?.id || '', title: '', context: '', source_url: '' });
  const [recording, setRecording] = useState(false);
  const request = useRef({ id: crypto.randomUUID(), fingerprint: null });
  const set = (key, text) => setValue(v => ({ ...v, [key]: text }));
  const save = async e => {
    e.preventDefault();
    const fingerprint = JSON.stringify(value);
    if (request.current.fingerprint && request.current.fingerprint !== fingerprint) request.current.id = crypto.randomUUID();
    request.current.fingerprint = fingerprint;
    await onSave({ ...value, request_id: request.current.id });
  };
  return <section className="atlas-demand-panel" aria-label="Registrar demanda"><div className="atlas-demand-header"><h3>Nova demanda</h3><Button onClick={onClose} disabled={busy || recording}><X size={14} />Fechar</Button></div><form onSubmit={save} className="atlas-demand-form">
    <div className="atlas-demand-grid"><label>Cliente<Select value={value.client_id} onChange={e => set('client_id', e.target.value)} required disabled={Boolean(clientId) || busy}>{clients.map(c => <option value={c.id} key={c.id}>{c.empresa}</option>)}</Select></label><label>Assunto<Input maxLength={180} required value={value.title} onChange={e => set('title', e.target.value)} disabled={busy} /></label></div>
    <label>Contexto e resultado esperado<Area rows={5} maxLength={12000} required value={value.context} onChange={e => set('context', e.target.value)} disabled={busy} /></label>
    <AtlasDictationButton disabled={busy} onActiveChange={setRecording} onText={text => setValue(v => ({ ...v, context: (v.context ? v.context + '\n' : '') + text }))} />
    <label>Link de referência (opcional)<Input type="url" maxLength={2000} placeholder="https://…" value={value.source_url} onChange={e => set('source_url', e.target.value)} disabled={busy} /></label>
    <div className="atlas-demand-actions"><button className="atlas-demand-button is-primary" disabled={busy || recording} type="submit">Guardar demanda</button><span className="atlas-demand-muted">A análise e o repasse vêm depois de salvar.</span></div>
  </form></section>;
}

function WatchTask({ data, clientId, busy, onSave, onClose }) {
  const [client, setClient] = useState(clientId || data.clients[0]?.id || ''), [taskId, setTaskId] = useState('');
  const tasks = data.tasks.filter(t => t.client_id === client && !data.statuses.find(s => s.value === t.status)?.is_terminal);
  return <section className="atlas-demand-panel atlas-demand-review" aria-label="Acompanhar tarefa existente"><div className="atlas-demand-header"><h3>Acompanhar tarefa existente</h3><Button onClick={onClose} disabled={busy}>Voltar</Button></div><form className="atlas-demand-form" onSubmit={e => { e.preventDefault(); onSave(taskId); }}>
    <label>Cliente<Select value={client} onChange={e => { setClient(e.target.value); setTaskId(''); }} disabled={busy || Boolean(clientId)}>{data.clients.map(c => <option key={c.id} value={c.id}>{c.empresa}</option>)}</Select></label>
    <label>Tarefa em aberto<Select value={taskId} onChange={e => setTaskId(e.target.value)} required disabled={busy}><option value="">Selecione uma tarefa</option>{tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</Select></label>
    <p className="atlas-demand-muted">O Atlas acompanha a tarefa que já existe. Responsáveis, prazo e etapa permanecem os da tarefa.</p>
    <button type="submit" className="atlas-demand-button is-primary" disabled={busy || !taskId}>Iniciar acompanhamento</button>
  </form></section>;
}

function TeamQueue({ data, actorId, refresh, run, busy }) {
  return <div className="atlas-demand-team"><div className="atlas-demand-header"><div><h2>Meus repasses do Atlas</h2><p className="atlas-demand-muted">Confirme o recebimento, registre avanços e sinalize impedimentos na tarefa atribuída a você.</p></div><Button onClick={refresh} disabled={busy}><RefreshCw size={14} />Atualizar</Button></div>
    {!data.queue.length && <p className="atlas-demand-empty">Nenhum repasse atribuído a você.</p>}
    {data.queue.map(task => <article className="atlas-demand-panel" key={task.id}>
      <div className="atlas-demand-header"><div><span className="atlas-demand-muted">{task.client_name}</span><h3>{task.title}</h3></div><Link className="atlas-demand-link" to={'/tasks/list/' + task.id}>Abrir tarefa <ArrowUpRight size={14} /></Link></div>
      <p className="atlas-demand-body">{task.description}</p><p className="atlas-demand-muted">Etapa: {task.status_label} · Prazo: {date(task.due_date)}</p>
      <AtlasFollowupPanel task={task} comments={task.comments} updates={hydrateTaskUpdates(data.updates.filter(u => u.task_id === task.id), task.comments)} status={data.statuses.find(s => s.value === task.status)} manager={false} actorId={actorId} ownerId={task.owner_id} busy={busy} onSubmit={args => run(() => demandRpc('atlas_task_followup_update', args), 'Atualização registrada nos Comentários da tarefa.')} />
      <details className="atlas-followup-history"><summary>Histórico da tarefa</summary><ol className="atlas-demand-history">{task.comments.map(c => <li key={c.id}><p>{c.body}</p><span>{c.author || 'Equipe'} · {date(c.at)}</span></li>)}</ol></details>
    </article>)}
  </div>;
}

export default function AtlasDemandCentral({ clientId = null }) {
  const location = useLocation();
  const { user } = useAuth();
  const [eventData,setEventData]=useState(null),[manualOpen,setManualOpen]=useState(false);
  const [data, setData] = useState(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [selected, setSelected] = useState(null), [creating, setCreating] = useState(false), [group, setGroup] = useState('demands'), [filter, setFilter] = useState('all'), [review, setReview] = useState(null), [answer, setAnswer] = useState(''), [recording, setRecording] = useState(false), [watching, setWatching] = useState(false);
  const alive = useRef(false), analysisRequests = useRef({}), abort = useRef(null), busyRef = useRef(false), generation = useRef(0);
  const refresh = useCallback(async () => {
    const epoch = generation.current;
    const result = await loadDemands(clientId);
    if (alive.current && epoch === generation.current) setData(result);
    return result;
  }, [clientId, user?.id]);
  useEffect(() => { generation.current++; alive.current = true; setData(null); setEventData(null); setManualOpen(false); setSelected(null); setReview(null); setCreating(false); setWatching(false); refresh().catch(e => alive.current && setError(e.message)); const timer = setInterval(() => { if (!document.hidden && !busyRef.current) refresh().catch(e => alive.current && setError(e.message)); }, 15000); return () => { alive.current = false; abort.current?.abort(); clearInterval(timer); }; }, [refresh, user?.id]);
  const run = async (action, message) => {
    if (busyRef.current) return false;
    busyRef.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); await refresh(); if (alive.current) setNotice(message); return true; }
    catch (e) { if (alive.current) setError(e.message); return false; }
    finally { busyRef.current = false; if (alive.current) setBusy(false); }
  };
  const client = id => data?.clients?.find(c => c.id === id);
  const task = d => data?.tasks?.find(t => t.id === d.task_id);
  const names = ids => (ids || []).map(id => data?.people?.find(p => p.id === id)?.full_name || 'Responsável indisponível').join(', ');
  const analyze = d => run(async () => { const key = d.id + ':' + d.revision; const request = analysisRequests.current[key] ||= crypto.randomUUID(); abort.current = new AbortController(); try { await analyzeDemand(d.id, request, abort.current.signal); } catch (error) { if (error.status) delete analysisRequests.current[key]; throw error; } delete analysisRequests.current[key]; setReview(null); }, 'Análise salva. Revise o próximo passo antes de encaminhar.');
  const openReview = d => run(async () => { setReview({ id: d.id, context: await loadAtlasDemandReview(d) }); }, 'Confira os campos do repasse.');
  const approve = value => run(async () => {
    const response = await demandRpc('atlas_demand_action', { p_action: 'approve', p_data: value });
    if (response.created && !response.replayed) { const result = await executeAutomation(response.task.id, 'task_created', { task: response.task }); if (getAutomationErrorMessages(result).length) setError('A tarefa foi criada; confira as automações na própria tarefa.'); }
    setReview(null);
  }, 'Repasse aprovado. A equipe pode consultar a tarefa e responder na Minha caixa.');
  const updatesFor = id => hydrateTaskUpdates((data?.updates || []).filter(u => u.task_id === id), data.comments, data.people);
  const trackingFor = d => followupState(task(d), updatesFor(d.task_id), data.statuses.find(s => s.value === task(d)?.status), undefined, data.comments.filter(c => c.task_id === d.task_id), d.owner_id);
  const row = d => {
    const t = task(d), tracking = d.state === 'linked' && !ownerIntakeThread(d) ? trackingFor(d) : null, status = data.statuses.find(s => s.value === t?.status), responses = data.comments.filter(c => c.task_id === d.task_id && c.user_id !== d.owner_id);
    const withWho = ownerIntakeThread(d) ? names(t?.assignee_ids)||'Ver conversa do Atlas' : d.state === 'linked' ? tracking.ownerAttention ? tracking.key === 'owner_assigned' ? 'Você · delegação' : 'Você · revisão' : names(t?.assignee_ids) || 'Sem responsável' : d.state === 'proposed' || d.state === 'needs_direction' ? 'Você' : 'Atlas · análise pendente';
    return <tr key={d.id}><td><Link to={`/clients/${d.client_id}?aba=demandas`}>{client(d.client_id)?.empresa || 'Cliente indisponível'}</Link><small>{operationLabel(client(d.client_id))}</small></td><td><button type="button" className="atlas-demand-title" onClick={() => { setSelected(d.id); setReview(null); setCreating(false); setWatching(false); setAnswer(''); }}>{d.title}</button><small>{date(d.updated_at)}{responses.length ? ` · ${responses.length} resposta(s) da equipe` : ''}</small></td><td><span className="atlas-demand-phase">{demandPhase(d, t, data.statuses)}</span></td><td>{withWho}</td><td>{tracking ? tracking.label : demandNextStep(d, t, status)}{tracking && <small>{tracking.next}{tracking.overdue ? ' · Prazo vencido' : ''}</small>}<small>Prazo: {date(t?.due_date)}</small></td><td>{t ? <Link to={'/tasks/list/' + t.id}>Tarefa ↗</Link> : <span className="atlas-demand-muted">Sem tarefa</span>}{t?.project_id && <Link to={'/projects/' + t.project_id}>Projeto ↗</Link>}</td></tr>;
  };
  useEffect(() => { setSelected(new URLSearchParams(location.search).get('demanda')); }, [location.search, clientId]);
  const current = data?.demands?.find(d => d.id === selected), currentTask = current && task(current);
  const managedIds=managedDemandIds(eventData,data?.demands||[],user?.id);
  const manualDemands=(data?.demands||[]).filter(d=>!managedIds.has(d.id));
  const rows = manualDemands.filter(d => filter === 'all' ? d.state !== 'archived' : filter === 'mine' ? !ownerIntakeThread(d) && (['proposed', 'needs_direction'].includes(d.state) || d.state === 'linked' && trackingFor(d).ownerAttention) : filter === 'blocked' || filter === 'waiting' ? d.state === 'linked' && trackingFor(d).key === filter : d.state === filter);
  const tracked = data?.manager ? [...new Map(data.demands.filter(d => d.state === 'linked'&&!ownerIntakeThread(d)).map(d => [d.task_id, trackingFor(d)])).values()] : [];
  const actionCount = data?.manager ? manualDemands.filter(d => !ownerIntakeThread(d) && (['proposed', 'needs_direction'].includes(d.state) || d.state === 'linked' && trackingFor(d).ownerAttention)).length : 0;

  return <section className="atlas-demands" aria-label="Central de demandas Atlas">
    {data?.manager && clientId && new URLSearchParams(location.search).get('origem') === 'cs' &&
      <Link className="atlas-demand-button" to={csTaskReturn(clientId)}>Voltar ao quadro do CS IA</Link>}
    {data?.manager && <AtlasEventPanel clientId={clientId} onOverview={setEventData}/>}
    {error && <p role="alert" className="atlas-demand-error">{error}</p>}{notice && <p role="status" className="atlas-demand-notice">{notice}</p>}
    {!data ? <p role="status">Consultando demandas…</p> : !data.manager ? <TeamQueue data={data} actorId={user?.id} run={run} busy={busy} refresh={() => run(async () => {}, 'Atualizado.')} /> : <>
      <section className="atlas-demand-manual-section"><div className="atlas-demand-manual-heading"><div><h2>Repasses e tarefas <span>{manualDemands.filter(d=>d.state!=='archived').length}</span></h2><p>Registros manuais e tarefas já vinculadas.{actionCount>0&&<strong> {actionCount} depende{actionCount>1?'m':''} de você.</strong>}</p></div><button type="button" className="atlas-demand-button" aria-expanded={manualOpen||Boolean(current)||creating||watching} disabled={busy||recording} onClick={()=>{const open=manualOpen||Boolean(current)||creating||watching;setManualOpen(!open);if(open){setSelected(null);setReview(null);setCreating(false);setWatching(false);}}}>{manualOpen||current||creating||watching?'Recolher':'Ver registros'}</button></div><div className="atlas-demand-manual-content" hidden={!(manualOpen||current||creating||watching)}>
      <div className="atlas-demand-header"><div><h3>Demandas manuais e tarefas vinculadas</h3><p className="atlas-demand-muted">Pedidos dos grupos são acompanhados acima. Aqui ficam os repasses manuais e as tarefas já vinculadas.</p></div><div className="atlas-demand-actions"><Button disabled={busy || recording} onClick={() => run(async () => {}, 'Fontes atualizadas.')}><RefreshCw size={14} />Atualizar</Button><Button primary disabled={busy || recording} onClick={() => { setCreating(true); setWatching(false); setSelected(null); setReview(null); }}><Plus size={15} />Nova demanda</Button><Button disabled={busy || recording} onClick={() => { setWatching(true); setCreating(false); setSelected(null); setReview(null); }}>Acompanhar tarefa</Button></div></div>
      <div className="atlas-demand-toolbar"><label>Fila<Select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Demandas abertas</option><option value="mine">Dependem de você</option><option value="draft">Entrada</option><option value="linked">Em acompanhamento</option><option value="waiting">Aguardando equipe</option><option value="blocked">Com impedimento</option><option value="archived">Arquivadas</option></Select></label><label>Visualização<Select value={group} onChange={e => setGroup(e.target.value)}><option value="demands">Uma linha por demanda</option><option value="clients">Agrupar por cliente</option></Select></label><span className="atlas-demand-muted">{rows.length} registro(s) · {actionCount} dependem de você</span></div>
      <div className="atlas-followup-counts" aria-label="Resumo do acompanhamento">{[['waiting', 'Aguardando equipe'], ['blocked', 'Com impedimento'], ['needs_owner', 'Decisões'], ['delivered', 'Entregas para revisão']].map(([key, label]) => <span key={key}><strong>{tracked.filter(t => ['needs_owner', 'delivered'].includes(key) ? t.pending.some(u => u.kind === key) : t.key === key).length}</strong> {label}</span>)}</div>
      {!ATLAS_DEMAND_PILOT && <p className="atlas-demand-muted">Conferência automática: seg–sex, 8h às 17h (São Paulo){data.followup?.followup_checked_at ? ' · Última leitura: ' + new Date(data.followup.followup_checked_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : ''}.</p>}
      {data.followup?.followup_error && <p role="alert" className="atlas-demand-error">{data.followup.followup_error}</p>}
      {ATLAS_DEMAND_PILOT && !clientId && <AtlasFollowupReference />}
      {watching && <WatchTask data={data} clientId={clientId} busy={busy} onClose={() => setWatching(false)} onSave={id => run(async () => { const context = await demandRpc('atlas_task_followup_context', { p_task: id }); const result = await demandRpc('atlas_task_followup_watch', { p_task: id, p_hash: context.task.task_hash }); setWatching(false); setSelected(result.demand.id); setFilter('all'); }, 'Acompanhamento iniciado na tarefa existente.')} />}
      {!rows.length ? <p className="atlas-demand-empty">Nenhuma demanda nesta fila. Registre a primeira para preparar um repasse.</p> : <div className="atlas-demand-table"><table><thead><tr>{['Cliente', 'Demanda / histórico', 'Fase', 'Com quem está', 'Próximo passo', 'Vínculos'].map(x => <th key={x}>{x}</th>)}</tr></thead><tbody>{group === 'clients' ? data.clients.filter(c => rows.some(d => d.client_id === c.id)).flatMap(c => [<tr className="atlas-demand-group" key={'group-' + c.id}><td colSpan={6}>{c.empresa} · {operationLabel(c)}</td></tr>, ...rows.filter(d => d.client_id === c.id).map(row)]) : rows.map(row)}</tbody></table></div>}
      {creating && <NewDemand clients={data.clients} clientId={clientId} busy={busy} onClose={() => setCreating(false)} onSave={value => run(async () => { const result = await demandRpc('atlas_demand_action', { p_action: 'create', p_data: value }); setCreating(false); setSelected(result.demand.id); setFilter('all'); }, 'Demanda guardada. Peça a análise para preparar o próximo passo.')} />}
      {current && (review?.id === current.id ? <AtlasDemandReview key={current.id + ':' + current.revision} demand={current} context={review.context} busy={busy} onApprove={approve} onClose={() => setReview(null)} /> : <section className="atlas-demand-panel" aria-label="Detalhe da demanda"><div className="atlas-demand-header"><div><span className="atlas-demand-muted">{client(current.client_id)?.empresa}</span><h3>{current.title}</h3></div><Button onClick={() => setSelected(null)} disabled={busy || recording}>Fechar</Button></div>{current.state === 'linked' && currentTask && !ownerIntakeThread(current) && <AtlasFollowupPanel key={currentTask.id} task={currentTask} comments={data.comments.filter(c => c.task_id === currentTask.id)} updates={updatesFor(currentTask.id)} status={data.statuses.find(s => s.value === currentTask.status)} manager actorId={user?.id} ownerId={current.owner_id} people={data.people} busy={busy || recording} onSubmit={args => run(() => demandRpc('atlas_task_followup_update', args), 'Retorno registrado para a equipe nos Comentários da tarefa.')} />}<div className="atlas-demand-grid"><div><h4>Contexto registrado</h4><p className="atlas-demand-body">{current.context}</p>{current.source_url && <a className="atlas-demand-link" href={current.source_url} target="_blank" rel="noopener noreferrer">Referência ↗</a>}{current.analysis && <><h4>{current.proposal?.source === 'owner_manual' ? 'Proposta preparada por você' : 'Análise do Atlas'}</h4><p className="atlas-demand-body">{current.analysis}</p><p className="atlas-demand-muted">Usa fontes autorizadas do cliente. Confira as fontes e o histórico usados. O conteúdo dos anexos não foi aberto nesta análise.</p></>}
        {current.state === 'needs_direction' && <form className="atlas-demand-form" onSubmit={e => { e.preventDefault(); run(async () => { await demandRpc('atlas_demand_action', { p_action: 'direction', p_data: { id: current.id, revision: current.revision, answer } }); setAnswer(''); }, 'Direção guardada na memória do cliente. Peça nova análise.'); }}><label>{current.owner_question}<Area rows={3} required maxLength={3000} value={answer} onChange={e => setAnswer(e.target.value)} disabled={busy} /></label><AtlasDictationButton disabled={busy} onActiveChange={setRecording} onText={text => setAnswer(v => (v ? v + '\n' : '') + text)} /><button className="atlas-demand-button is-primary" disabled={busy || recording} type="submit">Guardar orientação</button></form>}
        <div className="atlas-demand-actions">{ownerIntakeThread(current)?<Button onClick={()=>window.dispatchEvent(new CustomEvent('atlas-team:open',{detail:{threadId:ownerIntakeThread(current)}}))}>Ver conversa da demanda no robô ↗</Button>:<>{!['linked', 'archived'].includes(current.state) && <Button disabled={busy || recording} onClick={() => analyze(current)}><Sparkles size={14} />{busy ? 'Aguarde…' : 'Analisar com Atlas'}</Button>}{(['draft', 'needs_direction'].includes(current.state) || current.state === 'proposed' && current.proposal?.source === 'owner_manual') && <Button disabled={busy || recording} onClick={() => run(() => demandRpc('atlas_demand_action', { p_action: 'prepare_manual', p_data: { id: current.id, revision: current.revision } }), 'Repasse preparado por você. Revise os campos antes de aprovar.')}>Preparar repasse manual</Button>}{current.state === 'proposed' && <Button primary disabled={busy || recording} onClick={() => openReview(current)}>Revisar repasse</Button>}{!['linked', 'archived'].includes(current.state) && <Button disabled={busy || recording} onClick={() => run(() => demandRpc('atlas_demand_action', { p_action: 'archive', p_data: { id: current.id, revision: current.revision } }), 'Demanda arquivada com o histórico preservado.')}>Arquivar</Button>}</>}{currentTask && <Link className="atlas-demand-link" to={'/tasks/list/' + currentTask.id}>Abrir tarefa ↗</Link>}<Link className="atlas-demand-link" to={`/clients/${current.client_id}?aba=arquivos`}>Arquivos e memória ↗</Link></div>
        {current.state === 'linked' && !currentTask && <p role="alert">A tarefa vinculada não está disponível. O histórico foi preservado; nenhuma tarefa será recriada automaticamente.</p>}
      </div><div><h4>Histórico e respostas</h4><ol className="atlas-demand-history">{[...data.events.filter(e => e.demand_id === current.id).map(e => ({ id: e.id, text: e.body, at: e.created_at, author: e.actor_id ? names([e.actor_id]) : 'Atlas · análise' })), ...data.comments.filter(c => c.task_id === current.task_id).map(c => ({ id: c.id, text: c.content, at: c.created_at, author: names([c.user_id]) }))].sort((a, b) => a.at.localeCompare(b.at)).map(e => <li key={e.id}><p>{e.text}</p><span>{e.author} · {date(e.at)}</span></li>)}</ol>{currentTask && <p className="atlas-demand-muted">Fase e prazo consultados diretamente na tarefa: {demandPhase(current, currentTask, data.statuses)} · {date(currentTask.due_date)}</p>}</div></div></section>)}
    </div></section></>}
  </section>;
}
