import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, BookmarkCheck, Check, Plus, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useModuleSettings } from '@/contexts/ModuleSettingsContext';
import { supabase } from '@/lib/customSupabaseClient';
import { canUseGestorReportArchive } from '@/lib/gestorIaReportArchive';
import { newTaskHref, taskHref } from '@/components/traffic/operacao/TrafegoOperacaoBits';
import { date, number, periodLabel, readingTime } from './GestorIaContext';
import { formatMetric } from './gestorIaMetricModel';
import GestorIaDrawer from './GestorIaDrawer';
import GestorIaDecisionOutcome from './GestorIaDecisionOutcome';
import { DecisionAtlasLink, DecisionMemoryEvidence } from './GestorIaDecisionAnalysis';
import { DECISION_ENTITY_LEVELS, DECISION_EVIDENCE, DECISION_ORIGINS, DECISION_VERDICTS, decisionMemoryDraft, decisionPayload, decisionTaskDraft } from './gestorIaDecisionLog';
import { DECISION_OUTCOME_METRICS } from './gestorIaDecisionOutcomeModel';
import { loadAgendaLearning } from './gestorIaMemoryData';
import { GESTOR_AGENDA_AI_ENABLED, loadAgendaPlan } from './gestorIaAgendaAiData';
import { useGestorAtlasContext } from './useGestorAtlas';
import { DecisionPortalNotice } from './GestorIaPortalNotices';

const events = { approved: 'Aprovada', dismissed: 'Dispensada', reopened: 'Reaberta', linked: 'Tarefa vinculada', unlinked: 'Vínculo retirado', verdict: 'Veredito registrado' };
const money = new Set(['spend', 'cost', 'target', 'previousCost', 'projectedSpend', 'budget', 'flaggedSpend', 'recentSpend']);
const resultKeys = ['leads', 'messages', 'purchases', 'landingPageViews', 'postEngagements'];
const planStatus = { queued: 'Aguardando a análise da agenda.', reserved: 'A análise está em andamento.',
  empty: 'A análise terminou sem um plano para este aviso.', failed: 'A análise da agenda ficou indisponível.',
  limited: 'O teto diário de análises foi atingido.', account_used: 'Esta conta já usou a análise agendada de hoje.',
  superseded: 'O contexto mudou antes de concluir a análise.' };

function useScheduledPlan(decisionId) {
  const [reading, setReading] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!decisionId) return undefined;
    let active = true;
    loadAgendaPlan(supabase, decisionId).then((result) => { if (active) setReading({ result }); })
      .catch((error) => { if (active) setReading({ error: error.message }); });
    return () => { active = false; };
  }, [decisionId, attempt]);
  return { reading, retry: () => { setReading(null); setAttempt((value) => value + 1); } };
}

function DecisionDiscoveryEvidence({ evidence, period, prior, currency, adName }) {
  const metrics = new Map(evidence.map(({ key, value }) => [key, value]));
  const pairs = [[resultKeys.find((key) => metrics.has(key)), 'previousResults'], ['spend', 'previousSpend'], ['cost', 'previousCost'],
    ['ctr', 'previousCtr'], ['frequency', 'previousFrequency']]
    .filter(([recent, previous]) => metrics.has(recent) && metrics.has(previous));
  const format = (key, value) => key === 'frequency' ? `${number(value, 2)}×` : formatMetric(value,
    key === 'ctr' ? { unit: 'percent' } : money.has(key) ? { unit: 'money' } : null, currency);
  const title = adName ? 'Comparação do anúncio' : 'Comparação da campanha';
  return <section className="gia-panel gia-stack gia-decision-evidence" aria-label={title}>
    <div><h3>{title}</h3>{adName && <p className="gia-caption">{adName}</p>}</div>
    <div className="gia-table-wrap" tabIndex={0} role="region" aria-label="Valores por recorte">
      <table><thead><tr><th scope="col">Indicador</th><th scope="col">Anterior<small>{periodLabel(prior)}</small></th>
        <th scope="col">Recente<small>{periodLabel(period)}</small></th></tr></thead>
        <tbody>{pairs.map(([key, previous]) => <tr key={key}><th scope="row">{DECISION_EVIDENCE[key]}</th>
          <td>{format(key, metrics.get(previous))}</td><td><strong>{format(key, metrics.get(key))}</strong></td></tr>)}</tbody>
      </table>
    </div>
  </section>;
}

function DecisionEntityEvidence({ rows, currency, period, comparison, objective, target }) {
  const fatigue = rows.some(({ frequency }) => frequency !== null);
  const formatMoney = (value) => formatMetric(value, { unit: 'money' }, currency);
  const percent = (value) => formatMetric(value, { unit: 'percent' });
  return <section className="gia-panel gia-stack gia-decision-evidence" aria-label="Evidências por item">
    <div><h3>Evidências por item</h3>{comparison && <p className="gia-caption">CTR de link · {periodLabel(comparison)} → {periodLabel(period)}</p>}</div>
    <div className="gia-table-wrap" tabIndex={0} role="region" aria-label="Anúncios e referências da decisão">
      <table>
        <thead><tr><th scope="col">Item</th><th scope="col">Investido</th><th scope="col">{DECISION_OUTCOME_METRICS[objective]?.label || 'Resultados'}</th>
          <th scope="col">Custo</th>{fatigue && <><th scope="col">Frequência {period && date(period.until).slice(0, 5)}</th><th scope="col">CTR de link</th></>}</tr></thead>
        <tbody>{rows.map(({ level, name, spend, results, cost, dailyCosts, dailyResults, frequency, ctr, previousCtr }, index) =>
          <tr key={`${level}-${index}`} data-reference={level === 'campaign' || level === 'account'}>
            <th scope="row"><strong>{name}</strong><small>{DECISION_ENTITY_LEVELS[level]}{(level === 'campaign' || level === 'account') && ' · referência'}</small>
              {dailyResults && <small>Por dia · {dailyResults.map((value, i) => value === 0 ? '0 resultados' : formatMoney(dailyCosts[i])).join(' → ')}</small>}
            </th>
            <td>{formatMoney(spend)}</td><td>{number(results)}</td>
            <td>{formatMoney(cost)}{target > 0 && cost !== null && level !== 'account' && <small>{number(cost / target, 2)}× o alvo</small>}</td>
            {fatigue && <><td>{number(frequency, 2)}</td><td>{previousCtr === null || ctr === null ? '—' : `${percent(previousCtr)} → ${percent(ctr)}`}</td></>}
          </tr>)}</tbody>
      </table>
    </div>
    {rows.some(({ level }) => level === 'adset') && <p className="gia-caption">O investimento dos itens sinalizados conta cada entrega uma vez.</p>}
  </section>;
}

function AgendaPriorLearning({ decisionId, clientId, campaignId }) {
  const [reading, setReading] = useState(null);
  useEffect(() => {
    let active = true;
    loadAgendaLearning(supabase, decisionId).then((note) => { if (active) setReading({ note }); })
      .catch((error) => { if (active) setReading({ error: error.message }); });
    return () => { active = false; };
  }, [decisionId]);

  if (!reading) return <p className="gia-caption" role="status">Consultando aprendizado anterior…</p>;
  if (reading.error) return <p className="gia-caption" role="status">{reading.error}</p>;
  const { note } = reading;
  if (!note) return null;
  return <section className="gia-panel gia-stack" aria-label="Aprendizado anterior">
    <div className="gia-section-heading">
      <h3 className="gia-inline-icon"><BookmarkCheck size={16} aria-hidden="true" />Aprendizado anterior</h3>
      <span className="gia-badge">{campaignId ? 'Mesma campanha' : 'Mesma conta'}</span>
    </div>
    <div><strong>{note.title}</strong><p className="gia-caption">{[DECISION_VERDICTS[note.verdict], readingTime(note.verdictAt), 'Privada', `Versão atual ${note.version}`].filter(Boolean).join(' · ')}</p></div>
    <p className="gia-prose">{note.content}</p>
    <Link className="gia-row-link" to={`/gestor-ia/clientes/${encodeURIComponent(clientId)}?tab=memoria`}>Ver na Memória <ArrowUpRight aria-hidden="true" size={13} /></Link>
  </section>;
}

export function DecisionNote({ clients, initialId, save, close }) {
  const [id, setId] = useState(initialId || (clients.length === 1 ? clients[0].id : ''));
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  const [key] = useState(() => `note:${crypto.randomUUID()}`);
  const valid = clients.some((client) => client.id === id) && title.trim() && detail.trim();

  async function submit(event) {
    event.preventDefault();
    if (!valid || locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try { await save({ client_id: id, title: title.trim(), origin: 'note', source_key: key, payload: { detail: detail.trim() } }); }
    catch (failure) { setError(failure.message); }
    finally { locked.current = false; setBusy(false); }
  }

  return <GestorIaDrawer label="Decisões" title="Nova nota" busy={busy} close={close}>
    <form className="gia-stack gia-decision-form" onSubmit={submit}>
      <label>Cliente<select required value={id} onChange={(event) => setId(event.target.value)} disabled={busy}>
        <option value="" disabled>Escolher cliente</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.empresa}</option>)}
      </select></label>
      <label>Título<input required value={title} maxLength={110} onChange={(event) => setTitle(event.target.value)} disabled={busy} /></label>
      <label>O que precisa ser decidido<textarea required rows={4} maxLength={800} value={detail} onChange={(event) => setDetail(event.target.value)} disabled={busy} /></label>
      {error && <p className="gia-notice" role="alert">{error}</p>}
      <div className="gia-header-actions"><button type="button" className="gia-action-link" disabled={busy} onClick={close}>Cancelar</button>
        <button type="submit" className="gia-action-link gia-primary-action" disabled={!valid || busy}>{busy ? 'Salvando…' : 'Salvar nota'}</button></div>
    </form>
  </GestorIaDrawer>;
}

export default function GestorIaDecisionReview({ item, ownerId, canUseTasks, taskOptions, readStore, change, persist, reloadLog, close }) {
  const { client, record, task, lane } = item;
  const { profile, canViewField } = useAuth();
  const { moduleSettings, loading } = useModuleSettings();
  const { detail, source, kind, period, syncedAt, currency, steps, verification, days, evidence, memoryEvidence, measurement, agendaLearningId, learningVersion,
    entityEvidence = [], comparisonPeriod, discoveryAd } = decisionPayload(record.payload);
  const scheduled = record.source_key.startsWith('agenda:');
  const discovery = record.origin === 'ai' && record.source_key.startsWith('agenda:busca:');
  const pacing = discovery && kind === 'verba';
  const showAgendaPlan = scheduled && !discovery && GESTOR_AGENDA_AI_ENABLED;
  const { reading: agendaReading, retry: retryAgendaPlan } = useScheduledPlan(showAgendaPlan ? record.id : null);
  const agendaResult = agendaReading?.result;
  const plan = discovery && detail && steps.length && verification && days
    ? { hypothesis: detail, steps, verification, days, usedMemory: Boolean(learningVersion) } : agendaResult?.plan;
  const versionUsed = discovery ? learningVersion : agendaResult?.learningVersion;
  const account = measurement.accountId && client.metaAccounts?.find(({ meta_account_id }) =>
    meta_account_id.replace(/^act_/, '') === measurement.accountId.slice(4));
  const [taskId, setTaskId] = useState('');
  const [verdict, setVerdict] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  const observation = useRef(null);
  const tasks = canUseTasks ? (client.tasks || []).filter(({ id }) => id !== record.task_id) : [];
  const history = Array.isArray(record.history) ? record.history : [];
  const atlasScope = useGestorAtlasContext(client.id, readStore);
  const memoryDraft = atlasScope && decisionMemoryDraft(record, ownerId);
  const canCompareOutcome = canUseTasks && task && client.metaAccounts?.length > 0 && (lane === 'verdict' || record.verdict) && ['admin', 'superadmin'].includes(profile?.role);
  const reopen = { status: 'pending', task_id: null, verdict: null, verdict_note: null };
  const update = async (patch) => {
    if (locked.current || portalBusy) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try { await change(item, patch); }
    catch (failure) { setError(failure.message); }
    finally { locked.current = false; setBusy(false); }
  };

  return <GestorIaDrawer label={discovery ? 'Descoberta da agenda' : scheduled ? 'Agenda de decisões' : DECISION_ORIGINS[record.origin]} title={record.title} busy={busy || portalBusy} close={close}>
    <p className="gia-caption">{[client.empresa, account?.meta_account_name, source].filter(Boolean).join(' · ')}</p>
    <div className="gia-header-actions">
      {lane === 'pending' ? <><button type="button" className="gia-action-link gia-primary-action" disabled={busy || portalBusy} onClick={() => void update({ status: 'approved' })}><Check aria-hidden="true" />Aprovar</button>
        <button type="button" className="gia-action-link" disabled={busy || portalBusy} onClick={() => void update({ status: 'dismissed' })}>Dispensar</button></>
        : <button type="button" className="gia-action-link" disabled={busy || portalBusy} onClick={() => void update(reopen)}>Reabrir decisão</button>}
      {lane === 'approved' && canUseTasks && !record.task_id && <Link className="gia-action-link gia-primary-action" to={newTaskHref(client.id)}
        state={decisionTaskDraft(record, ownerId, plan)}><Plus aria-hidden="true" />Preparar tarefa</Link>}
      <DecisionAtlasLink clientId={client.id} readStore={readStore} label={plan ? 'Investigar no Atlas' : undefined} decision={{
        title: record.title, source: DECISION_ORIGINS[record.origin], detail, kind, period, comparisonPeriod, currency, evidence, entityEvidence,
        agendaDiscovery: discovery, discoveryAd, measurement,
      }} />
    </div>
    {!loading && canUseGestorReportArchive(profile, moduleSettings, canViewField) && <DecisionPortalNotice client={client} decisionId={record.id}
      persist={persist} reloadLog={reloadLog} disabled={busy} setBusy={setPortalBusy} />}
    {detail && !(discovery && plan) && <section><h3>{record.origin === 'note' ? 'Nota' : 'Por que apareceu'}</h3><p>{detail}</p></section>}
    {discovery && comparisonPeriod ? <DecisionDiscoveryEvidence evidence={evidence} period={period} prior={comparisonPeriod} currency={currency} adName={discoveryAd} />
      : (period || evidence.length > 0) && <section className={pacing ? 'gia-panel gia-decision-budget' : 'gia-panel'}><h3>{pacing ? 'Ritmo da verba' : record.origin === 'ai' ? 'O que a IA olhou' : 'Resumo salvo'}</h3>
      <p className="gia-caption">{periodLabel(period)}{syncedAt && readingTime(syncedAt) ? ` · ${readingTime(syncedAt)}` : ''}</p>
      <dl className="gia-context-grid">{evidence.map(({ key, value }) => <div key={key}><dt>{DECISION_EVIDENCE[key]}</dt><dd>{formatMetric(value, money.has(key) ? { unit: 'money' } : null, currency)}</dd></div>)}</dl>
      {pacing && <p className="gia-caption">A projeção soma o gasto até a data e estima o restante do mês pela média dos últimos três dias fechados.</p>}
    </section>}
    {plan && <section className="gia-panel gia-stack gia-agenda-plan" aria-label="Plano da agenda com IA">
      <div className="gia-section-heading"><h3 className="gia-inline-icon"><Sparkles size={16} aria-hidden="true" />{discovery ? 'Plano sugerido' : 'Plano da agenda'}</h3><span className="gia-badge is-info">IA</span></div>
      <p className="gia-caption">{[readingTime(discovery ? record.created_at : agendaResult?.completedAt), plan.usedMemory && (versionUsed
        ? `Usou a versão ${versionUsed} do aprendizado autorizado` : 'Com aprendizado autorizado')].filter(Boolean).join(' · ')}</p>
      <div><strong>Hipótese a verificar</strong><p>{plan.hypothesis}</p></div>
      <ol className="gia-decision-steps">{plan.steps.map((step, i) => <li key={i}>{step}</li>)}</ol>
      <div><strong>Como verificar em {plan.days} dias após a ação</strong><p>{plan.verification}</p></div>
    </section>}
    {entityEvidence.length > 0 && <DecisionEntityEvidence rows={entityEvidence} currency={currency} period={period} comparison={comparisonPeriod}
      objective={measurement.objective} target={evidence.find(({ key }) => key === 'target')?.value} />}
    {!(discovery && versionUsed) && <DecisionMemoryEvidence references={memoryEvidence} clientId={client.id} />}
    {scheduled && agendaLearningId && atlasScope && <AgendaPriorLearning key={record.id} decisionId={record.id} clientId={client.id} campaignId={measurement.campaignId} />}
    {!plan && <>
      {showAgendaPlan && (!agendaReading || agendaReading.error || agendaResult) && <div className="gia-agenda-plan-status">
        <p className="gia-caption" role="status">{!agendaReading ? 'Consultando plano da agenda…' : agendaReading.error || planStatus[agendaResult?.state]}</p>
        {(agendaReading?.error || ['queued', 'reserved'].includes(agendaResult?.state)) && <button type="button" className="gia-action-link" onClick={retryAgendaPlan}>Consultar plano</button>}
      </div>}
      {steps.length > 0 && <section><h3>Plano de ação</h3><ol className="gia-decision-steps">{steps.map((step, i) => <li key={i}>{step}</li>)}</ol></section>}
      {verification && <section><h3>Como verificar</h3><p>{days ? `Em ${days} dias após a ação: ` : ''}{verification}</p></section>}
    </>}
    {task && canUseTasks && <section className="gia-panel"><h3>Tarefa vinculada</h3><p>{task.title}</p>
      <Link className="gia-row-link" to={`${taskHref(task.id)}?${new URLSearchParams({ client_id: client.id })}`} state={{ gestorIa: true }}>Abrir em Tarefas <ArrowUpRight aria-hidden="true" size={13} /></Link></section>}
    {record.task_id && !task && canUseTasks && <p className="gia-caption">A tarefa vinculada está indisponível nesta consulta.</p>}
    {record.verdict && <section className="gia-panel gia-stack"><div><h3>Veredito · {DECISION_VERDICTS[record.verdict]}</h3><p className="gia-prose">{record.verdict_note}</p></div>
      {memoryDraft && <Link className="gia-row-link" to={`/gestor-ia/clientes/${encodeURIComponent(client.id)}?tab=memoria`} state={memoryDraft}>Levar para Memória <ArrowUpRight aria-hidden="true" size={13} /></Link>}
    </section>}
    {canCompareOutcome && <GestorIaDecisionOutcome item={item} taskOptions={taskOptions} readStore={readStore} note={note} busy={busy} planDays={plan?.days}
      onUse={lane === 'verdict' ? (text) => { setNote(text); observation.current?.focus(); } : undefined} />}
    {lane === 'verdict' && <form className="gia-panel gia-stack gia-decision-form" onSubmit={(event) => { event.preventDefault(); if (verdict && note.trim()) void update({ verdict, verdict_note: note.trim() }); }}>
      <h3>Registrar o resultado</h3>
      <label>Veredito<select required value={verdict} disabled={busy} onChange={(event) => setVerdict(event.target.value)}>
        <option value="" disabled>Escolher resultado</option>{Object.entries(DECISION_VERDICTS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select></label>
      <label>O que foi observado<textarea ref={observation} required rows={4} maxLength={800} value={note} disabled={busy} onChange={(event) => setNote(event.target.value)} /></label>
      <button type="submit" className="gia-action-link gia-primary-action" disabled={busy || !verdict || !note.trim()}>Salvar veredito</button>
    </form>}
    {lane === 'approved' && canUseTasks && tasks.length > 0 && <div className="gia-decision-task gia-decision-form">
      <form onSubmit={(event) => { event.preventDefault(); if (taskId) void update({ task_id: taskId }); }}>
        <label>Tarefa existente<select required disabled={busy} value={taskId} onChange={(event) => setTaskId(event.target.value)}>
          <option value="" disabled>Escolher tarefa</option>{tasks.map(({ id, title }) => <option key={id} value={id}>{title}</option>)}
        </select></label>
        <button type="submit" className="gia-action-link" disabled={busy || !taskId}>{record.task_id ? 'Trocar vínculo' : 'Vincular tarefa'}</button>
      </form>
    </div>}
    {error && <p className="gia-notice" role="alert">{error}</p>}
    {record.created_at && <details className="gia-panel gia-decision-history">
      <summary>Histórico</summary><ol>{[...history].reverse().map((event, i) => <li key={`${event.at}-${i}`}>
        <strong>{events[event.event]}</strong>{event.verdict && ` · ${DECISION_VERDICTS[event.verdict]}`}<small>{readingTime(event.at)}</small>{event.note && <p>{event.note}</p>}
      </li>)}<li><strong>Registrada</strong><small>{readingTime(record.created_at)}</small></li></ol>
    </details>}
  </GestorIaDrawer>;
}
