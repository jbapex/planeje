import React, { useId, useState } from 'react';
import { ArrowUpRight, ChevronDown, Copy, Layers3, Pencil, Plus, Sparkles, Target, TrendingUp } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { buildGestorAtlasDraft, GESTOR_ATLAS_CONVERSATION } from '@/lib/gestorIaAtlasDraft';
import GestorIaMediaGoalEditor from './GestorIaMediaGoalEditor';
import { LineChart } from './GestorIaCharts';
import { useGestorIaMetrics } from './GestorIaMetrics';
import { date, number } from './GestorIaContext';
import { formatMetric } from './gestorIaMetricModel';
import { metaRefreshNotice } from './GestorIaRefresh';
import { clientCampaignPage } from './gestorIaClientModel';
import { goalAccountId, linkedMediaGoals, loadMediaGoals, saveMediaGoal } from './gestorIaMediaGoalData';
import { MEDIA_GOAL_OBJECTIVES, mediaGoalAdjustment, mediaGoalCoverage, mediaGoalHealth, mediaGoalPace, mediaGoalStats } from './gestorIaMediaGoalModel';
import { useGestorRead } from './gestorIaReads';

const money = (value, currency = 'BRL') => formatMetric(value, { unit: 'money' }, currency);
const ratio = (actual, target) => actual !== null && target > 0 ? actual * 100 / target : null;
const campaignName = ({ id, name }) => name || `Campanha ${id}`;
const campaignStatus = { above: 'Acima do alvo', on: 'No alvo', idle: 'Sem entrega', 'no-result': 'Gasto sem resultado', missing: 'Sem medição', unknown: 'Sem comparação' };
const campaignPriority = ['no-result', 'above', 'missing', 'idle', 'on', 'unknown'];

function Gauge({ label, value, target, progress, expected, markerLabel = 'Ritmo esperado até a última leitura', note, hint, tone, noteTone }) {
  const pct = progress === null ? 0 : Math.max(0, Math.min(100, progress));
  return <div className="gia-media-gauge" data-tone={tone}>
    <dt>{label}</dt><dd className="gia-media-value"><strong>{value}</strong>{target && <small>{target}</small>}</dd>
    <dd className="gia-media-gauge-detail">
      {progress !== null && <div className="gia-media-rail" aria-hidden="true"><i style={{ width: `${pct}%` }} />
        {expected > 0 && expected < 100 && <span style={{ left: `${expected}%` }} title={markerLabel} />}</div>}
      {note && <small className="gia-media-note" data-tone={noteTone} title={hint}>{note}</small>}
    </dd>
  </div>;
}

function GoalOutlook({ goal, stats, period, reading, atlasDraft, simulate }) {
  const volume = MEDIA_GOAL_OBJECTIVES[goal.objective].volume.toLocaleLowerCase('pt-BR');
  const target = goal.result_target;
  const uniqueReach = goal.objective === 'alcance';
  const pace = mediaGoalPace(goal, reading, period, stats);
  const readThrough = reading.period?.until;
  return <section className="gia-media-outlook" aria-label={`Leitura de ${goal.name}`}>
    <header>
      <div><h4>{target != null && !uniqueReach ? 'Ritmo do mês' : 'Leitura da meta'}</h4>
        <p>{stats.partial ? 'Leitura parcial · projeções indisponíveis' : `Dados salvos até ${date(readThrough).slice(0, 5)}${stats.resultProjection !== null ? ` · projeção até ${date(period.monthEnd).slice(0, 5)}` : ''}`}</p></div>
      <div className="gia-header-actions">
        {simulate && <button type="button" className="gia-action-link" aria-haspopup="dialog" onClick={simulate}>Planejar ajuste</button>}
        {atlasDraft && <Link className="gia-action-link" to={GESTOR_ATLAS_CONVERSATION} state={atlasDraft}><Sparkles aria-hidden="true" />Analisar meta no Atlas</Link>}
      </div>
    </header>
    <div className="gia-media-outlook-body" data-chart={Boolean(pace)}>
      {pace && <div className="gia-media-pace">
        <div className="gia-chart-legend"><span>Realizado acumulado</span><span>Ritmo esperado</span></div>
        <LineChart id={`ritmo de ${goal.name}`} metric={{ key: 'volume', label: 'Realizado acumulado' }} compare referenceLabel="Ritmo esperado"
          rows={pace.map(({ date, actual, target: expected }) => ({ date, current: { volume: actual }, previous: { volume: expected } }))} />
      </div>}
      {stats.resultProjection !== null && <dl>
        <div><dt>No ritmo atual</dt><dd><strong>{number(stats.resultProjection)}</strong> {target != null ? `de ${number(target)} ${volume}` : volume}</dd>
          {stats.requiredDaily !== null && <small>Ritmo necessário de {number(Math.ceil(stats.requiredDaily * 10) / 10, 1)} {volume} por dia.</small>}</div>
        {stats.resultsWithinBudget !== null && <div><dt>Com a verba restante, ao custo atual</dt><dd><strong>{number(stats.resultsWithinBudget)}</strong> {volume} no total</dd><small>Restam {money(stats.budgetRemaining)}</small></div>}
        {stats.requiredCost !== null && <div><dt>Para bater a meta com essa verba</dt><dd><strong>{stats.budgetRemaining === 0 ? 'Verba consumida' : stats.requiredCost === 0 ? 'Abaixo de R$ 0,01' : `Até ${money(stats.requiredCost)}`}</strong></dd>
          {stats.budgetRemaining > 0 && <small>por resultado restante</small>}</div>}
        {stats.budgetToHitCents !== null && <div><dt>Verba total ao custo atual</dt><dd><strong>{money(stats.budgetToHitCents / 100)}</strong></dd>
          {goal.budget_cents != null && <small>{stats.budgetToHitCents > goal.budget_cents
            ? `${money((stats.budgetToHitCents - goal.budget_cents) / 100)} acima da verba atual` : 'Cabe na verba atual'}</small>}</div>}
      </dl>}
    </div>
    {stats.uniqueReachMissing ? <p>O alcance único exige o total da conta ou de uma campanha no período. O CPM usa as impressões registradas.</p>
      : !pace && target != null && !stats.partial && !uniqueReach && <p>Série diária indisponível para este recorte.</p>}
  </section>;
}

function MediaGoalCard({ goal, stats, period, reading, edit, duplicate, atlasScope, accountName, campaignPage }) {
  const panelId = useId();
  const [panel, setPanel] = useState(null);
  const objective = MEDIA_GOAL_OBJECTIVES[goal.objective];
  const scope = goal.scope === 'account' ? 'Geral da conta' : goal.scope === 'objective' ? 'Por objetivo' : 'Campanhas escolhidas';
  const costTarget = goal.cost_cents / 100;
  const budget = goal.budget_cents == null ? null : goal.budget_cents / 100;
  const costRatio = stats.comparable ? ratio(stats.cost, costTarget) : null;
  const volumeRatio = ratio(stats.results, goal.result_target);
  const behindPace = stats.expectedProgress !== null && volumeRatio < stats.expectedProgress;
  const noResult = stats.spend > 0 && stats.results === 0;
  const costAbove = costRatio !== null && Math.round(stats.cost * 100) > goal.cost_cents;
  const unmeasured = stats.spend !== null && stats.results === null && !stats.uniqueReachMissing;
  const delta = costRatio === null ? null : Math.round(costRatio - 100);
  const costNote = unmeasured ? 'Resultado sem medição' : stats.partial ? 'Recorte parcial' : !stats.valid ? 'Aguardando leitura'
    : noResult ? 'Gasto sem resultado' : !stats.comparable && stats.spend !== null ? 'Comparação em reais indisponível' : delta === null ? 'Sem custo medido'
      : delta === 0 ? (costAbove ? 'Acima do alvo' : 'No alvo') : `${number(Math.abs(delta))}% ${delta > 0 ? 'acima' : 'abaixo'} do alvo`;
  const budgetRatio = stats.comparable ? ratio(stats.spend, budget) : null;
  const budgetUsed = budget !== null && budgetRatio !== null && Math.round(stats.spend * 100) >= goal.budget_cents;
  const budgetNote = budget === null ? 'Sem verba cadastrada' : stats.partial ? 'Recorte parcial' : budgetRatio === null ? 'Sem comparação de verba'
    : budgetUsed ? (Math.round(stats.spend * 100) > goal.budget_cents ? 'Verba excedida' : 'Verba atingida')
      : stats.budgetEndOn ? `${stats.budgetEndOn < period.until ? 'Ritmo indicava estouro em' : 'Pode passar da verba em'} ${date(stats.budgetEndOn).slice(0, 5)}`
        : stats.projection !== null ? `Projeção de ${money(stats.projection)}` : `${number(budgetRatio)}% da verba usada`;
  const [status, tone] = mediaGoalHealth(goal, stats);
  const volumeNote = stats.uniqueReachMissing ? 'Alcance único indisponível' : unmeasured ? 'Métrica ausente na leitura salva' : goal.result_target == null ? 'Sem volume alvo'
    : stats.remaining === null ? 'Aguardando leitura completa' : stats.remaining === 0 ? 'Meta batida'
    : stats.daysLeft > 0 ? `Faltam ${number(stats.remaining)} em ${stats.daysLeft} ${stats.daysLeft === 1 ? 'dia' : 'dias'}`
      : `Faltaram ${number(stats.remaining)}`;
  const adjustment = mediaGoalAdjustment(goal, stats);
  const simulate = adjustment ? () => edit(adjustment.budgetCents) : null;
  const primary = goal.is_active && goal.is_primary;
  const counts = [['above', 'acima do alvo'], ['no-result', 'sem resultado'], ['idle', 'sem entrega'], ['missing', 'sem medição'], ['on', 'no alvo']]
    .map(([state, label]) => ({ state, label, count: stats.campaigns.filter((row) => row.state === state).length }))
    .filter(({ count }) => count > 0);
  const campaigns = [...stats.campaigns].sort((a, b) => (b.excessSpendCents ?? 0) - (a.excessSpendCents ?? 0) ||
    campaignPriority.indexOf(a.state) - campaignPriority.indexOf(b.state) || b.spend - a.spend);
  const shownCampaigns = panel === 'all' ? campaigns : campaigns.filter(({ state }) => state === panel);
  const largestGap = shownCampaigns[0]?.excessSpendCents > 0 ? shownCampaigns[0] : null;
  const showGaps = campaigns.some(({ excessSpendCents }) => excessSpendCents !== null);
  const campaignCount = `${campaigns.length} ${campaigns.length === 1 ? 'campanha' : 'campanhas'}`;
  const outlookLabel = goal.result_target != null && goal.objective !== 'alcance' ? 'Ritmo do mês' : stats.resultProjection !== null ? 'Projeção' : 'Ver leitura';
  const forecast = stats.resultProjection !== null && goal.result_target != null
    ? `${number(stats.resultProjection)} de ${number(goal.result_target)}` : null;
  const showOutlook = stats.valid && (goal.result_target != null || stats.resultProjection !== null || stats.uniqueReachMissing || atlasScope);
  const toggle = (next) => setPanel((current) => current === next ? null : next);

  return <article className="gia-panel gia-media-card" data-active={goal.is_active} aria-label={goal.name}>
    <header className="gia-media-card-header">
      <div className="gia-media-card-name"><h3>{goal.name}</h3>
        <span className="gia-badge">{objective.label}</span>
        {primary && <span className="gia-badge gia-media-main-badge"><Target aria-hidden="true" />Principal</span>}
        <span className="gia-media-card-meta">{scope}</span>
      </div>
      <div className="gia-media-card-actions">{status && <span className="gia-media-health" data-tone={tone}>{status}</span>}
        <button type="button" className="gia-action-link" aria-label={`Editar ${goal.name}`} aria-haspopup="dialog" onClick={() => edit()}><Pencil aria-hidden="true" />Editar</button>
        <button type="button" className="gia-icon-button" aria-label={`Duplicar ${goal.name}`} title="Duplicar meta" aria-haspopup="dialog" onClick={duplicate}><Copy aria-hidden="true" /></button>
      </div>
    </header>
    <dl className="gia-media-gauges">
      <Gauge label={objective.cost} value={money(stats.cost, stats.currency)} target={`alvo ${money(costTarget)}`}
        progress={costRatio === null ? null : costRatio / 2} expected={costRatio === null ? null : 50} markerLabel="Custo alvo" note={costNote}
        tone={!stats.partial && (costAbove || noResult) ? 'warning' : undefined} />
      <Gauge label={`${objective.volume} no mês`} value={number(stats.results)} target={goal.result_target != null && `de ${number(goal.result_target)}`}
        progress={volumeRatio} expected={stats.expectedProgress} note={volumeNote}
        hint={behindPace ? 'Volume abaixo do ritmo esperado até a última leitura' : undefined}
        tone={stats.remaining === 0 ? 'good' : undefined} noteTone={behindPace ? 'warning' : undefined} />
      <Gauge label="Verba do mês" value={money(stats.spend, stats.currency)} target={budget !== null && `de ${money(budget)}`} progress={budgetRatio} note={budgetNote}
        hint={stats.budgetEndOn ? `Projeção de ${money(stats.projection)} até o fim do mês` : undefined}
        tone={!stats.partial && budgetUsed ? 'warning' : undefined} noteTone={stats.budgetEndOn ? 'warning' : undefined} />
    </dl>
    {(campaigns.length > 0 || showOutlook) && <footer className="gia-media-card-foot">
      <div className="gia-media-card-toolbar">
        {campaigns.length > 0 && <button className="gia-media-count" type="button" aria-expanded={panel === 'all'} aria-controls={panelId} onClick={() => toggle('all')}>
          {campaignCount}<ChevronDown aria-hidden="true" /></button>}
        {counts.map(({ state, label, count }) => <button key={state} type="button" className="gia-media-status" data-state={state}
          aria-expanded={panel === state} aria-controls={panelId} onClick={() => toggle(state)}>{count} {label}</button>)}
        {showOutlook && <button className="gia-media-open-outlook" type="button" aria-expanded={panel === 'outlook'} aria-controls={panelId} onClick={() => toggle('outlook')}>
          <TrendingUp aria-hidden="true" />{forecast ? <>Projeção <strong>{forecast}</strong></> : outlookLabel}<ChevronDown aria-hidden="true" /></button>}
      </div>
      <div id={panelId} hidden={!panel}>
      {panel === 'outlook' ? <GoalOutlook goal={goal} stats={stats} period={period} reading={reading} simulate={simulate} atlasDraft={atlasScope && buildGestorAtlasDraft({
        ...atlasScope, purpose: 'goal', period, reading, accountName, canSeeSpend: true,
        goal: { ...goal, objective: objective.volume, costLabel: objective.cost }, goalStats: stats,
      })} /> : panel && <>
        {largestGap && <p className="gia-media-gap">Maior desvio na leitura <strong>{campaignName(largestGap)}</strong>
          <span>{money(largestGap.excessSpendCents / 100)} {largestGap.state === 'no-result' ? 'sem resultado' : 'acima do alvo'}</span></p>}
        <div className="gia-table-wrap" tabIndex={0} role="region" aria-label={`Campanhas de ${goal.name}`}>
          <table><thead><tr><th scope="col">Campanha</th><th scope="col">Situação</th><th scope="col">Investido</th><th scope="col">{objective.volume}</th>
            <th scope="col">{objective.cost}</th>{showGaps && <th scope="col">Acima do alvo</th>}</tr></thead>
            <tbody>{shownCampaigns.map((campaign) => <tr key={campaign.id}>
              <th scope="row">{/^\d{1,32}$/.test(campaign.id) ? <Link className="gia-media-campaign-link" to={campaignPage(campaign.id)}
                aria-label={`Ver métricas de ${campaignName(campaign)}`}>{campaignName(campaign)}<ArrowUpRight aria-hidden="true" /></Link> : campaignName(campaign)}</th>
              <td><span className="gia-media-status" data-state={campaign.state}>{campaignStatus[campaign.state]}</span></td>
              <td>{money(campaign.spend, stats.currency)}</td><td>{number(campaign.results)}</td><td>{money(campaign.cost, stats.currency)}</td>
              {showGaps && <td data-excess={campaign.excessSpendCents > 0}>{money(campaign.excessSpendCents === null ? null : campaign.excessSpendCents / 100)}</td>}
            </tr>)}</tbody>
          </table>
        </div>
      </>}</div>
    </footer>}
  </article>;
}

const accountName = (account) => account.meta_account_name || account.meta_account_id;

function useGoalAccountReading({ client, query, period, readStore, accountId, reading }, linkedId) {
  const result = useGestorIaMetrics({ client, query: { ...query, period }, readStore, accountId: linkedId,
    canReadMeta: Boolean(linkedId), validPeriod: true }, Boolean(linkedId && linkedId !== accountId));
  return linkedId === accountId ? reading : result.current;
}

function GoalCoverage({ id, rows, reading, create, edit }) {
  const [filter, setFilter] = useState('all');
  if (reading.loading && !rows) return <p id={id} className="gia-caption" role="status">Consultando campanhas salvas…</p>;
  if (!rows?.length) return <p id={id} className="gia-caption">{rows ? 'Nenhuma campanha disponível na leitura.' : 'Sem campanhas salvas neste mês.'}</p>;
  const uncovered = ({ goals, pending }) => !goals.length && !pending;
  const filters = [
    ['all', 'Todas', rows],
    ['uncovered', 'Sem meta', rows.filter(uncovered)],
    ['overlap', 'Mais de uma meta', rows.filter(({ goals }) => goals.length > 1)],
  ];
  const visible = filters.find(([key]) => key === filter)[2].slice().sort((a, b) =>
    Number(uncovered(b)) - Number(uncovered(a)) || (b.spend ?? -1) - (a.spend ?? -1));
  return <section id={id} className="gia-panel gia-media-coverage" aria-label="Cobertura das campanhas">
    <header>
      <h3>Campanhas e metas</h3>
      <div className="gia-pills" role="group" aria-label="Filtrar cobertura">{filters.map(([key, label, items]) =>
        <button key={key} type="button" className="gia-pill" aria-pressed={key === filter} onClick={() => setFilter(key)}>
          {label} <small>{items.length}</small>
        </button>)}</div>
    </header>
    {visible.length ? <div className="gia-table-wrap" tabIndex={0} role="region" aria-label="Metas por campanha">
      <table><thead><tr><th scope="col">Campanha</th><th scope="col">Investido</th><th scope="col">Meta ativa</th><th scope="col"><span className="sr-only">Ação</span></th></tr></thead>
        <tbody>{visible.map(row => <tr key={row.id}>
          <th scope="row">{campaignName(row)}</th>
          <td>{money(row.spend, reading.account?.currency)}</td>
          <td>{row.goals.length ? <div className="gia-media-coverage-matches">{row.goals.map(goal => <button key={goal.id} type="button"
            className="gia-text-button" aria-haspopup="dialog" aria-label={`Editar meta ${goal.name}`} onClick={() => edit(goal)}>{goal.name}</button>)}</div>
            : row.pending ? 'Cobertura a conferir' : <span className="gia-media-status" data-state="above">Sem meta</span>}</td>
          <td>{uncovered(row) && /^\d{1,32}$/.test(row.id) && <button type="button" className="gia-action-link" aria-haspopup="dialog"
            aria-label={`Criar meta para ${campaignName(row)}`} onClick={() => create(row)}>Criar meta</button>}</td>
        </tr>)}</tbody>
      </table>
    </div> : <p className="gia-caption">{filter === 'uncovered' ? 'Nenhuma campanha sem meta neste recorte.' : 'Nenhuma campanha com mais de uma meta neste recorte.'}</p>}
  </section>;
}

function MediaGoalAccount({ account, goals, context, atlasScope, showAccount, edit, create }) {
  const id = useId();
  const [coverageOpen, setCoverageOpen] = useState(false);
  const accountId = account.meta_account_id;
  const reading = useGoalAccountReading(context, goals.length || coverageOpen || accountId === context.accountId ? accountId : null);
  const { period } = context;
  const name = accountName(account);
  if (reading.accessDenied) return <p className="gia-notice" role="alert">Leitura indisponível para {name}.</p>;
  const cards = goals.map((goal) => ({ goal, stats: mediaGoalStats(goal, reading, period, goals) }));
  const coverage = mediaGoalCoverage(reading, period, goals);
  const covered = coverage?.filter(({ goals }) => goals.length > 0).length;
  const partial = coverage && (reading.campaignMetricsPartial ?? reading.partial);
  const active = cards.filter(({ goal }) => goal.is_active);
  const inactive = cards.filter(({ goal }) => !goal.is_active);
  const renderCard = ({ goal, stats }) => <MediaGoalCard key={goal.id} goal={goal} stats={stats} period={period} reading={reading} accountName={name}
    campaignPage={id => clientCampaignPage(context.client.id, accountId, reading.period, id)}
    atlasScope={atlasScope} edit={(budgetSuggestion) => edit(goal, account.meta_account_id, budgetSuggestion)} duplicate={() => {
      const name = goal.name.length <= 72 ? `${goal.name} · cópia` : goal.name;
      edit({ ...goal, id: null, name, is_active: false, is_primary: false }, account.meta_account_id);
    }} />;
  return <section className="gia-media-account" aria-label={`Metas de ${name}`}>
    <header className="gia-media-account-heading">
      <div>{showAccount && <strong>{name}</strong>}
        <p>{coverage ? `${partial ? 'Leitura parcial · ' : ''}Dados até ${date(reading.period.until).slice(0, 5)}`
          : reading.loading ? 'Consultando leitura salva…' : goals.length ? 'Sem leitura salva neste mês' : 'Sem metas nesta conta'}</p></div>
      <button type="button" className="gia-action-link gia-media-coverage-toggle" aria-expanded={coverageOpen} aria-controls={id}
        onClick={() => setCoverageOpen(open => !open)}>
        <Layers3 aria-hidden="true" />{coverage?.length ? `${covered} de ${coverage.length} campanhas cobertas` : 'Ver cobertura'}<ChevronDown aria-hidden="true" />
      </button>
    </header>
    {reading.error && <p className="gia-notice" role="status">{reading.error}</p>}
    {coverageOpen ? <GoalCoverage id={id} rows={coverage} reading={reading} create={row => create(row, accountId)} edit={goal => edit(goal, accountId)} /> : <div id={id} hidden />}
    {active.map(renderCard)}
    {inactive.length > 0 && <details className="gia-media-inactive"><summary>{inactive.length} {inactive.length === 1 ? 'meta inativa' : 'metas inativas'}</summary>
      <div>{inactive.map(renderCard)}</div></details>}
  </section>;
}

export default function GestorIaMediaGoals({ client, query, accountId, accountFilter, period, reading, readStore, accountSelect, monthControl, accountsTo, reloadPortfolio, atlasScope, beforeSave }) {
  const [params, setParams] = useSearchParams();
  const [localEditor, setLocalEditor] = useState(null);
  const [notice, setNotice] = useState('');
  const accounts = client.metaAccounts || [];
  const visibleAccounts = accounts.filter(({ meta_account_id }) => !accountFilter || meta_account_id === accountFilter);
  const allowed = visibleAccounts.length > 0 && (!accountFilter || !reading.accessDenied);
  const entry = useGestorRead(readStore, `metas-campanha:${client.id}`, allowed, () => loadMediaGoals(supabase, client.id));
  const allGoals = linkedMediaGoals(entry.data, accounts) || [];
  const goalsFor = (id) => allGoals.filter((goal) => goal.account_id === goalAccountId(id))
    .sort((a, b) => Number(b.is_active) - Number(a.is_active) || Number(b.is_primary) - Number(a.is_primary) || a.name.localeCompare(b.name, 'pt-BR'));
  const groups = visibleAccounts.map((account) => ({ account, goals: goalsFor(account.meta_account_id) }));
  const mainGoal = allGoals.find((goal) => goal.is_active && goal.is_primary);
  const isPrimaryAccount = (account) => mainGoal?.account_id === goalAccountId(account.meta_account_id);
  groups.sort((a, b) => Number(isPrimaryAccount(b.account)) - Number(isPrimaryAccount(a.account)) || Number(b.goals.length > 0) - Number(a.goals.length > 0));
  const activeCount = groups.reduce((total, { goals }) => total + goals.filter(({ is_active }) => is_active).length, 0);
  const requestedEdit = params.get('editar_meta');
  const headerAccount = requestedEdit && !entry.error && mainGoal?.id === requestedEdit ? accounts.find(isPrimaryAccount) : null;
  const editor = localEditor || (headerAccount && { goal: mainGoal, accountId: headerAccount.meta_account_id });
  const open = (goal, id, budgetSuggestion) => { setNotice(''); setLocalEditor({ goal, accountId: id, budgetSuggestion }); };
  const createForCampaign = (row, id) => open({ name: campaignName(row).slice(0, 80), objective: row.objective,
    scope: 'campaigns', campaign_ids: [row.id], is_primary: !mainGoal }, id);
  const close = () => {
    setLocalEditor(null);
    if (requestedEdit) setParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('editar_meta');
      return next;
    }, { replace: true });
  };
  const context = { client, query, period, readStore, accountId, reading };
  const editorAccount = allowed && accounts.find(({ meta_account_id }) => meta_account_id === editor?.accountId);
  const editorReading = useGoalAccountReading(context, editorAccount?.meta_account_id);
  const inMonth = editorReading.period?.since === period.since && editorReading.period.until >= period.since && editorReading.period.until <= period.until;
  const refreshNotice = metaRefreshNotice(reading);

  return <section className="gia-media-goals" aria-label="Metas de campanha">
    <header className="gia-media-top">
      <div className="gia-media-heading"><h2>Metas do mês</h2>
        {allowed && entry.data && <p>{activeCount} {activeCount === 1 ? 'meta ativa' : 'metas ativas'}</p>}</div>
      <div className="gia-media-tools">{accountSelect}{monthControl}
        {allowed && <button type="button" className="gia-action-link gia-primary-action" aria-haspopup="dialog" disabled={!entry.data || Boolean(entry.error)}
          onClick={() => open({ is_primary: !mainGoal }, accountId)}><Plus aria-hidden="true" />Nova meta</button>}
      </div>
    </header>
    {notice && <p className="gia-notice" role="status">{notice}</p>}
    {refreshNotice && <p className="gia-notice" role="status">{refreshNotice}</p>}
    {client.metaAccounts?.length === 0 ? <div className="gia-panel gia-media-empty"><Target aria-hidden="true" /><strong>Vincule uma conta para acompanhar campanhas.</strong><Link className="gia-action-link" to={accountsTo}>Contas e BM</Link></div>
      : !allowed ? <p className="gia-notice" role="alert">Conta indisponível para este cliente.</p>
        : entry.error ? <div className="gia-panel gia-media-empty"><p role="alert">Não foi possível carregar as metas de campanha.</p><button type="button" className="gia-action-link" onClick={() => entry.reload()}>Tentar novamente</button></div>
        : !entry.data ? <p className="gia-caption" role="status">Carregando metas…</p> : <>
          {!groups.some(({ goals }) => goals.length) && <div className="gia-panel gia-media-empty"><Target aria-hidden="true" />
            <strong>{accountFilter ? 'Nenhuma meta nesta conta' : 'Nenhuma meta de campanha'}</strong><p>Defina custo, volume e verba para começar.</p></div>}
          {groups.map(({ account, goals }) => <MediaGoalAccount key={account.meta_account_id} account={account} goals={goals} context={context}
            atlasScope={atlasScope} edit={open} create={createForCampaign} showAccount={!accountFilter && accounts.length > 1} />)}
        </>}
    {editorAccount && <GestorIaMediaGoalEditor goal={editor.goal} client={client} accountName={accountName(editorAccount)} budgetSuggestion={editor.budgetSuggestion}
      accountId={editor.accountId} accounts={!editor.goal.id && !accountFilter && accounts.length > 1 ? accounts : []}
      selectAccount={(id) => setLocalEditor((current) => ({ ...current, accountId: id }))}
      campaigns={editorReading.accessDenied ? [] : [...Object.values(editorReading.history?.campaignMeta || {}), ...(inMonth ? editorReading.campaigns || [] : [])]}
      reading={editorReading} period={period} otherGoals={goalsFor(editor.accountId).filter(({ id }) => id !== editor.goal.id)}
      close={close} save={async (draft, adjustment) => {
        if (beforeSave) await beforeSave();
        try {
          await saveMediaGoal(supabase, { clientId: client.id, accountId: editor.accountId, goalId: editor.goal.id, draft,
            adjustment, updatedAt: editor.goal.updated_at });
        } catch (error) {
          if (error.conflict) await Promise.all([entry.reload(), reloadPortfolio()]);
          throw error;
        }
        await Promise.all([entry.reload(), reloadPortfolio()]);
        setNotice('Meta salva.');
      }} />}
  </section>;
}
