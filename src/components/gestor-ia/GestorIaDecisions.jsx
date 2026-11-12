import React, { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, CalendarClock, ChevronRight, ClipboardList, Plus, RefreshCw, Search, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { nextActionForAccount } from '@/lib/trafegoProximaAcao';
import { readClienteMetaResumo } from '@/lib/clienteMetaSnapshot';
import { isOpenTrafficTask } from '@/lib/trafegoDashboard';
import { newTaskHref, taskHref } from '@/components/traffic/operacao/TrafegoOperacaoBits';
import { date, number, periodLabel } from './GestorIaContext';
import { formatMetric, metricValue } from './gestorIaMetricModel';
import GestorIaDrawer from './GestorIaDrawer';
import { DecisionAnalysisPicker, DecisionAnalysisReading, DecisionAtlasLink, decisionKind } from './GestorIaDecisionAnalysis';
import { loadGestorDecisionAnalysis } from './gestorIaData';
import GestorIaAvatar from './GestorIaAvatar';
import GestorIaDecisionReview, { DecisionNote } from './GestorIaDecisionReview';
import GestorIaDecisionAgenda from './GestorIaDecisionAgenda';
import { aiDecisionRows, DECISION_ORIGINS, DECISION_VERDICTS, decisionLane, decisionPayload, findDecision, isDecisionTaskComplete, loadDecisionLog, saveDecisionRows, signalDecisionRow, updateDecision } from './gestorIaDecisionLog';
import { useGestorRead } from './gestorIaReads';
import { useGestorAtlasContext } from './useGestorAtlas';
import { isMemoryReferenceId } from '../../../supabase/functions/gestor-ia-decisions/memory.js';

const analysisEnabled = import.meta.env.VITE_GESTOR_IA_DECISIONS_ENABLED === 'true';
const agendaEnabled = import.meta.env.VITE_GESTOR_IA_AGENDA_ENABLED === 'true';
const taskStatuses = { todo: 'A fazer', pending: 'Pendente', production: 'Em produção', in_progress: 'Em andamento', review: 'Em revisão', completed: 'Concluída', published: 'Publicada' };
const activeStatuses = new Set(['production', 'in_progress', 'review']);
const decisionKey = ({ client_id, source_key }) => `${client_id}:${source_key}`;
const stages = [
  ['pending', 'Esperando decisão', 'is-amber', 'Nenhuma decisão pendente.'],
  ['approved', 'Aprovado, a fazer', 'is-blue', 'Nenhuma ação aprovada.'],
  ['verdict', 'Feito, aguardando veredito', 'is-grey', 'Nenhuma tarefa concluída esperando veredito.'],
  ['resolved', 'Decidido', 'is-green', 'Nenhum veredito ou dispensa para estes filtros.'],
];

function taskStatus(task, options) {
  const status = String(task.status || '').trim().toLowerCase();
  return options?.find(({ value }) => value === task.status)?.label || taskStatuses[status] || (isDecisionTaskComplete(task, options) ? 'Concluída' : task.status || 'Status não informado');
}

export function GestorIaDecisionReading({ client, task, action, summary, close, canUseTasks, analyze, readStore }) {
  const { profile } = useAuth();
  const title = action?.title || task?.title || 'Sem título';
  const source = action ? 'Regra do Planeje' : `Tarefa registrada · ${taskStatus(task)}`;
  return <GestorIaDrawer label={action ? 'Sinal do Gestor' : 'Tarefa registrada'} title={title} close={close}>
    <p className="gia-caption">{client.empresa} · {action ? 'Regra do Planeje' : taskStatus(task)}</p>
    {action ? <>
      <section><h3>Por que apareceu</h3><p>{action.detail || action.action}</p></section>
      <section className="gia-panel"><h3>Resumo usado na leitura</h3><p className="gia-caption">{periodLabel(summary?.period)}</p>
        <dl className="gia-context-grid">
          <div><dt>Investimento</dt><dd>{formatMetric(metricValue(summary, 'spend'), { unit: 'money' }, summary?.currency)}</dd></div>
          <div><dt>Mensagens</dt><dd>{number(metricValue(summary, 'messages'))}</dd></div>
          <div><dt>Leads</dt><dd>{number(metricValue(summary, 'leads'))}</dd></div>
        </dl>
      </section>
    </> : <dl className="gia-context-grid"><div><dt>Status</dt><dd>{taskStatus(task)}</dd></div><div><dt>Prazo</dt><dd>{task.due_date ? date(task.due_date) : 'Sem prazo'}</dd></div></dl>}
    {canUseTasks && (action
      ? <Link className="gia-action-link gia-primary-action" to={newTaskHref(client.id)} state={{ gestorIa: true, backOnClose: true, draftSignal: action.code, draftOwnerId: profile?.id, draftClientId: client.id }}><Plus aria-hidden="true" />Criar tarefa deste sinal</Link>
      : <Link className="gia-action-link" to={`${taskHref(task.id)}?${new URLSearchParams({ client_id: client.id })}`} state={{ gestorIa: true }}><ArrowUpRight aria-hidden="true" />Abrir em Tarefas</Link>)}
    {action && analyze && <button className="gia-action-link" type="button" onClick={() => analyze(client.id)}><Sparkles aria-hidden="true" />Investigar com IA</button>}
    <DecisionAtlasLink clientId={client.id} readStore={readStore} decision={{ title, source, detail: action?.detail || action?.action, period: summary?.period }} />
  </GestorIaDrawer>;
}

export default function GestorIaDecisions({ clients, clientFilter, canUseTasks, taskClientId, initialAccountId, readStore, reloadPortfolio }) {
  const { canViewField, profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const requestedMemory = taskClientId && params.get('usar_memoria');
  const requestedDecision = taskClientId && !requestedMemory && params.get('decisao_origem');
  const [search, setSearch] = useState('');
  const [origin, setOrigin] = useState('all');
  const [sort, setSort] = useState('priority');
  const [opened, setOpened] = useState(null);
  const [picker, setPicker] = useState(null);
  const [analyses, setAnalyses] = useState({});
  const [feedback, setFeedback] = useState(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const analysisLock = useRef(false);
  const ownerId = profile?.id;
  const canRegister = Boolean(ownerId && clients.length && canViewField?.('meta_resumo') === true && canViewField?.('valor') === true);
  const agendaClients = agendaEnabled && canRegister && ['admin', 'superadmin'].includes(profile?.role)
    ? clients.filter((client) => client.metaAccounts?.length) : [];
  const canUseAgenda = Boolean(useGestorAtlasContext(agendaClients[0]?.id, readStore));
  const log = useGestorRead(readStore, 'decisoes:historico', canRegister, () => loadDecisionLog(supabase, ownerId, canUseTasks));
  const taskOptions = log.data?.statuses;
  const historyReady = Boolean(log.data);
  const preparingHistory = canRegister && !historyReady && !log.error;
  const canAnalyze = analysisEnabled && canRegister;
  const analyzing = feedback?.loading === true;
  const linkedMemory = canAnalyze && isMemoryReferenceId(requestedMemory) ? requestedMemory : null;
  const pickerClient = picker ?? (linkedMemory ? taskClientId : null);
  function clearEntry(key) {
    setParams((current) => {
      const next = new URLSearchParams(current); next.delete(key); return next;
    }, { replace: true });
  }
  const closeAnalysis = () => { setPicker(null); if (linkedMemory) clearEntry('usar_memoria'); };
  const closeDecision = () => { setOpened(null); if (requestedDecision) clearEntry('decisao_origem'); };
  const beginAnalysis = (id) => { closeDecision(); setPicker(id); };
  async function storeAnalysis(clientId, rows) {
    setFeedback({ loading: true, clientId, saving: true });
    try {
      await saveDecisionRows(supabase, rows);
      await log.reload();
      setFeedback(null);
    } catch (error) { setFeedback({ clientId, rows, error: error.message }); }
  }
  async function analyze(client, memoryIds, scope) {
    if (!canAnalyze || analysisLock.current || !clients.some(({ id }) => id === client.id)) return;
    analysisLock.current = true;
    closeAnalysis();
    setFeedback({ loading: true, clientId: client.id, detailed: Boolean(scope.accountId) });
    setOrigin('all');
    setSearch('');
    try {
      const result = await loadGestorDecisionAnalysis(supabase, client.id, memoryIds, scope);
      const rows = aiDecisionRows(client.id, result);
      setAnalyses((previous) => ({ ...previous, [client.id]: { ...result,
        suggestions: result.suggestions.map((suggestion, index) => ({ ...suggestion, id: `ia-${client.id}-${index}`, draft: rows[index] })),
      } }));
      setOpened((id) => id?.startsWith(`ia-${client.id}-`) ? null : id);
      if (historyReady && rows.length) await storeAnalysis(client.id, rows);
      else setFeedback(null);
    } catch (error) {
      setFeedback({ error: error.message, clientId: client.id });
    } finally { analysisLock.current = false; }
  }
  async function refreshBoard() {
    setRefreshing(true);
    try { await Promise.all([log.reload(), reloadPortfolio?.()]); }
    finally { setRefreshing(false); }
  }
  async function createRecord(draft) {
    await saveDecisionRows(supabase, [draft]);
    return findDecision(supabase, ownerId, draft);
  }
  async function changeDecision(item, patch) {
    const record = item.record.id ? item.record : await createRecord(item.record);
    try {
      if (!item.record.id && record.status !== 'pending') throw new Error('Esta decisão já foi tratada em outra tela. Confira o histórico.');
      const saved = await updateDecision(supabase, record, patch);
      await log.reload();
      setOpened(decisionKey(saved));
    } catch (error) {
      await log.reload();
      throw error;
    }
  }
  const query = search.trim().toLocaleLowerCase('pt-BR');
  const matches = (client, title) => `${client.empresa} ${title}`.toLocaleLowerCase('pt-BR').includes(query);
  const signals = [];
  const taskGroups = { pending: [], active: [], finished: [] };
  let unavailable = 0;
  for (const client of clients) {
    const summary = canViewField?.('meta_resumo') === true ? readClienteMetaResumo(client) : null;
    if (!summary || summary.permError || summary.rateLimited || metricValue(summary, 'spend') === null) {
      unavailable++;
    } else {
      const action = nextActionForAccount({ snapshot: summary });
      if ((origin === 'all' || origin === 'signal') && action && matches(client, action.title)) signals.push({ id: `signal-${client.id}`, client, action, summary });
    }
    for (const task of client.tasks || []) {
      if ((origin !== 'all' && origin !== 'task') || !matches(client, task.title)) continue;
      const status = String(task.status || '').trim().toLowerCase();
      const item = { id: `task-${client.id}-${task.id}`, client, task };
      if (isDecisionTaskComplete(task, taskOptions)) taskGroups.finished.push(item);
      else if (isOpenTrafficTask(task)) taskGroups[activeStatuses.has(status) ? 'active' : 'pending'].push(item);
    }
  }
  const reviewed = canAnalyze ? clients.filter(({ id }) => analyses[id]) : [];
  const suggestionCount = reviewed.reduce((count, { id }) => count + analyses[id].suggestions.length, 0);
  const suggestions = (origin === 'all' || origin === 'ai') ? reviewed.flatMap((client) => analyses[client.id].suggestions
    .filter((item) => matches(client, `${item.title} ${item.source}`))
    .map((suggestion) => ({ id: suggestion.id, client, suggestion, analysis: analyses[client.id] }))) : [];
  const proposed = [...suggestions, ...signals];
  const title = (item) => item.suggestion?.title || item.action?.title || item.task?.title || '';
  const byName = (a, b) => title(a).localeCompare(title(b), 'pt-BR');
  proposed.sort(sort === 'title' ? byName : (a, b) => (a.action?.rank ?? -1) - (b.action?.rank ?? -1));
  Object.values(taskGroups).forEach((items) => items.sort(sort === 'title' ? byName : (a, b) => String(a.task.due_date || '9999').localeCompare(String(b.task.due_date || '9999'))));
  const clientById = new Map(clients.map((client) => [client.id, client]));
  const records = log.data?.rows || [];
  const recorded = new Set(records.map(decisionKey));
  const ledgerItems = historyReady ? [
    ...records.map((record) => ({ record, client: clientById.get(record.client_id) })),
    ...proposed.map((item) => ({ client: item.client, record: item.suggestion?.draft || signalDecisionRow(item.client.id, item.action, item.summary) }))
      .filter(({ record }) => {
        const key = decisionKey(record);
        if (recorded.has(key)) return false;
        recorded.add(key);
        return true;
      }),
  ].flatMap((item) => {
    const { client, record } = item;
    const { source, rank, kind } = decisionPayload(record.payload);
    if (!client || (origin !== 'all' && origin !== record.origin) || !matches(client, `${record.title} ${source}`)) return [];
    const task = canUseTasks ? client.tasks?.find(({ id }) => id === record.task_id) : undefined;
    return [{ ...item, id: decisionKey(record), rank, source, kind, task, lane: decisionLane(record, task, taskOptions) }];
  }).sort((a, b) => sort === 'title' ? a.record.title.localeCompare(b.record.title, 'pt-BR')
    : (a.rank ?? -1) - (b.rank ?? -1) ||
      String(b.record.created_at || '').localeCompare(String(a.record.created_at || ''))) : [];
  const selectedLog = ledgerItems.find(({ id, record }) => opened !== null ? id === opened : requestedDecision && record.id === requestedDecision);
  const selected = [...(historyReady ? [] : proposed), ...Object.values(taskGroups).flat()].find(({ id }) => id === opened);
  const feedbackClient = canAnalyze && clients.find((client) => client.id === feedback?.clientId);
  const openCount = historyReady ? ledgerItems.filter(({ lane }) => lane !== 'resolved').length : proposed.length + taskGroups.pending.length + taskGroups.active.length;
  const taskLanes = [
    ['pending', 'A fazer', 'is-blue'], ['active', 'Em andamento', 'is-grey'], ['finished', 'Concluídas', 'is-green'],
  ].map(([key, label, tone]) => <section className="gia-board-lane" key={key}>
    <h2><i className={`gia-board-dot ${tone}`} />{label} <span>{taskGroups[key].length}</span></h2>
    {taskGroups[key].map(({ id, client, task }) => <article className="gia-board-card" key={id}>
      <p className="gia-board-client"><ClipboardList aria-hidden="true" />{client.empresa}</p>
      <h3><button className="gia-board-open" type="button" aria-haspopup="dialog" onClick={() => setOpened(id)}>{task.title || 'Sem título'}<ChevronRight aria-hidden="true" /></button></h3>
      <footer><span className="gia-badge">Tarefa registrada</span><small>{taskStatus(task, taskOptions)}</small>{task.due_date && <small>Prazo {date(task.due_date)}</small>}</footer>
    </article>)}
    {!taskGroups[key].length && <p className="gia-board-empty">{clients.every((client) => client.tasks == null) ? 'Tarefas indisponíveis para esta seleção.' : 'Nenhuma tarefa nesta etapa.'}</p>}
  </section>);

  return <div className="gia-stack">
    <div className="gia-list-toolbar">
      <label className="gia-table-search"><Search aria-hidden="true" /><input type="search" aria-label="Buscar sinal, tarefa ou cliente" placeholder="Buscar sinal, tarefa ou cliente" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      {clientFilter}
      <select className="gia-toolbar-select" aria-label="Origem da decisão" value={origin} onChange={(event) => setOrigin(event.target.value)}><option value="all">Origem: todas</option>{(canAnalyze || historyReady) && <option value="ai">Sugestões da IA</option>}<option value="signal">Regras do Planeje</option>{historyReady && <option value="note">Notas</option>}<option value="task">Tarefas do Planeje</option></select>
      <select className="gia-toolbar-select" aria-label="Ordenar decisões" value={sort} onChange={(event) => setSort(event.target.value)}><option value="priority">Ordenar: prioridade</option><option value="title">Ordenar: título</option></select>
      <span className="gia-caption gia-board-count">{openCount} em aberto</span>
      {historyReady && <><button type="button" className="gia-icon-button" aria-label="Atualizar quadro" disabled={refreshing || log.refreshing} onClick={() => void refreshBoard()}><RefreshCw aria-hidden="true" /></button>
        <button type="button" className="gia-action-link" aria-haspopup="dialog" onClick={() => setNoteOpen(true)}><Plus aria-hidden="true" />Nova nota</button></>}
      {canUseTasks && <Link className="gia-action-link" to={newTaskHref(taskClientId)} state={{ gestorIa: true, backOnClose: true }}><Plus aria-hidden="true" />Nova tarefa</Link>}
      {canUseAgenda && <button className="gia-action-link" type="button" aria-haspopup="dialog" onClick={() => setAgendaOpen(true)}><CalendarClock aria-hidden="true" />Agenda de decisões</button>}
      {canAnalyze && <button className="gia-action-link gia-primary-action" type="button" aria-haspopup="dialog" disabled={analyzing || preparingHistory} onClick={() => beginAnalysis(taskClientId || (clients.length === 1 ? clients[0].id : ''))}><Sparkles aria-hidden="true" />Analisar com IA</button>}
      {!analysisEnabled && <span className="gia-badge">Análise com IA em validação</span>}
    </div>
    {preparingHistory && <p className="gia-caption" role="status">Consultando histórico…</p>}
    {log.error && <div className="gia-notice" role="status">Histórico de decisões indisponível. <button className="gia-row-link" type="button" onClick={() => void log.reload()}>Tentar novamente</button></div>}
    {historyReady && log.data.statusesError && <p className="gia-notice" role="status">Os status personalizados de Tarefas estão indisponíveis.</p>}
    {feedbackClient && (analyzing ? <p className="gia-notice" role="status">{feedback.saving ? 'Guardando as sugestões de' : feedback.detailed ? 'Analisando a conta de' : 'Analisando o resumo de'} {feedbackClient.empresa}…</p>
      : <div className="gia-notice" role="alert">{feedback.error}{feedback.rows && <button className="gia-row-link" type="button" onClick={() => void storeAnalysis(feedbackClient.id, feedback.rows)}>Tentar guardar sugestões</button>}</div>)}
    {reviewed.length > 0 && !feedbackClient && <p className="gia-decision-status gia-caption" role="status"><GestorIaAvatar /><span>
      {reviewed.length === 1 ? reviewed[0].empresa : `${reviewed.length} clientes analisados`} · {suggestionCount ? `${suggestionCount} ${suggestionCount === 1 ? 'sugestão' : 'sugestões'}` : 'Nenhuma sugestão em aberto'}
      {reviewed.length === 1 && ` · ${periodLabel(analyses[reviewed[0].id].period)}`}
    </span></p>}
    {historyReady && origin !== 'task' && <div className="gia-board" aria-label="Quadro de decisões">
      {stages.map(([lane, label, tone, empty]) => {
        const items = ledgerItems.filter((item) => item.lane === lane);
        return <section className="gia-board-lane" key={lane} aria-label={label}>
          <h2><i className={`gia-board-dot ${tone}`} />{label} <span>{items.length}</span></h2>
          {items.map(({ id, client, record, task, source, kind }) => <article className="gia-board-card" key={id}>
            <p className="gia-board-client">{client.empresa}</p>
            <h3><button className="gia-board-open" type="button" aria-haspopup="dialog" onClick={() => setOpened(id)}>{record.title}<ChevronRight aria-hidden="true" /></button></h3>
            {record.source_key.startsWith('agenda:') && source && <p className="gia-caption">{source}</p>}
            <footer><span className={`gia-badge${record.origin === 'ai' ? ' is-info' : ''}`}>{record.source_key.startsWith('agenda:busca:') ? 'IA · Agenda'
              : record.source_key.startsWith('agenda:') ? 'Agenda' : DECISION_ORIGINS[record.origin]}</span>
              {Object.hasOwn(decisionKind, kind) && <small>{decisionKind[kind]}</small>}
              {record.verdict ? <small>{DECISION_VERDICTS[record.verdict]}</small> : record.status === 'dismissed' ? <small>Dispensada</small> : task ? <small>{taskStatus(task, taskOptions)}</small> : null}</footer>
          </article>)}
          {!items.length && <p className="gia-board-empty">{empty}</p>}
        </section>;
      })}
    </div>}
    {historyReady && canUseTasks && ['all', 'task'].includes(origin) && <details className="gia-tasks-disclosure" open={origin === 'task' || undefined}>
      <summary>Tarefas do Planeje <span className="gia-caption">{Object.values(taskGroups).flat().length}</span></summary>
      <div className="gia-board gia-board-tasks" aria-label="Etapas das tarefas">{taskLanes}</div>
    </details>}
    {!historyReady && <div className="gia-board" aria-label="Quadro de decisões">
      <section className="gia-board-lane">
        <h2><i className="gia-board-dot is-amber" />Esperando decisão <span>{proposed.length}</span></h2>
        {proposed.map(({ id, client, action, summary, suggestion }) => <article className="gia-board-card" key={id}>
          <p className="gia-board-client">{client.empresa}</p>
          <h3><button className="gia-board-open" type="button" aria-haspopup="dialog" onClick={() => setOpened(id)}>{suggestion ? suggestion.title : action.title}<ChevronRight aria-hidden="true" /></button></h3>
          <p>{suggestion ? suggestion.source : action.action}</p>
          <footer>{suggestion ? <><span className="gia-badge is-info">IA</span><small>{decisionKind[suggestion.kind]}</small></> : <><span className="gia-badge">Regra do Planeje</span><small>{periodLabel(summary.period)}</small></>}</footer>
        </article>)}
        {!proposed.length && <p className="gia-board-empty">{unavailable === clients.length ? 'Resumos indisponíveis para esta seleção.' : 'Nenhuma decisão para estes filtros.'}</p>}
        {unavailable > 0 && unavailable < clients.length && <small className="gia-caption">{unavailable} {unavailable === 1 ? 'cliente sem resumo disponível' : 'clientes sem resumo disponível'}</small>}
      </section>
      {taskLanes}
    </div>}
    {selectedLog && <GestorIaDecisionReview key={selectedLog.id} item={selectedLog} ownerId={ownerId}
      canUseTasks={canUseTasks} taskOptions={taskOptions} readStore={readStore} change={changeDecision}
      persist={() => createRecord(selectedLog.record)} reloadLog={log.reload} close={closeDecision} />}
    {requestedDecision && historyReady && !selectedLog && <p className="gia-caption" role="status">Decisão de origem indisponível nesta ficha.</p>}
    {agendaOpen && canUseAgenda && <GestorIaDecisionAgenda clients={agendaClients} initialId={taskClientId} close={() => setAgendaOpen(false)} />}
    {noteOpen && historyReady && <DecisionNote clients={clients} initialId={taskClientId} close={() => setNoteOpen(false)} save={async (draft) => {
      const record = await createRecord(draft);
      await log.reload();
      setOrigin('all');
      setSearch('');
      setNoteOpen(false);
      setOpened(decisionKey(record));
    }} />}
    {selected && (selected.suggestion ? <DecisionAnalysisReading {...selected} close={() => setOpened(null)} canUseTasks={canUseTasks} readStore={readStore}
      dismiss={() => { setAnalyses({ ...analyses, [selected.client.id]: { ...selected.analysis, suggestions: selected.analysis.suggestions.filter(({ id }) => id !== selected.id) } }); setOpened(null); }} />
      : <GestorIaDecisionReading {...selected} close={() => setOpened(null)} canUseTasks={canUseTasks} readStore={readStore} analyze={canAnalyze && !analyzing ? beginAnalysis : undefined} />)}
    {canAnalyze && !preparingHistory && pickerClient !== null && <DecisionAnalysisPicker clients={clients} initialId={pickerClient} initialAccountId={initialAccountId}
      initialMemoryId={linkedMemory} onAnalyze={analyze} close={closeAnalysis} readStore={readStore} />}
  </div>;
}
