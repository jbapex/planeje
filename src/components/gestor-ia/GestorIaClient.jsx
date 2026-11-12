import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { buildGestorAtlasDraft, GESTOR_ATLAS_CONVERSATION } from '@/lib/gestorIaAtlasDraft';
import { isOpenTrafficTask } from '@/lib/trafegoDashboard';
import { nextActionForAccount } from '@/lib/trafegoProximaAcao';
import { readClienteMetaResumo } from '@/lib/clienteMetaSnapshot';
import { date, number, objectiveLabel, periodLabel } from './GestorIaContext';
import { GestorIaMetricsView } from './GestorIaMetrics';
import GestorIaRefresh from './GestorIaRefresh';
import GestorIaClientAvatar from './GestorIaClientAvatar';
import GestorIaDecisions, { GestorIaDecisionReading } from './GestorIaDecisions';
import { ClientReportArchive } from './GestorIaReports';
import { GestorIaClientAccounts } from './GestorIaAccounts';
import GestorIaGoals from './GestorIaGoals';
import GestorIaMemory from './GestorIaMemory';
import GestorIaClientMenu from './GestorIaClientMenu';
import GestorIaAvatar from './GestorIaAvatar';
import { clientEditor, clientPage, readClientGoalTargets } from './gestorIaClientModel';
import { formatMetric, metricValue } from './gestorIaMetricModel';
import { goalMonthPeriod, MEDIA_GOAL_OBJECTIVES, mediaGoalProgress } from './gestorIaMediaGoalModel';
import { goalAccountId } from './gestorIaMediaGoalData';
import { useGestorAtlasContext } from './useGestorAtlas';
import { useGestorGoalReadings } from './useGestorGoalReadings';

const tabs = [
  ['metricas', 'Métricas'], ['contas', 'Contas e BM'], ['metas', 'Metas'],
  ['decisoes', 'Decisões'], ['relatorios', 'Relatório'], ['memoria', 'Memória'],
];

export default function GestorIaClient({ clients, client, params, reload, reloadPortfolio, refreshing, clientFilters, accountFilters, reportFilters, reviewKey, pageProps, selectAccount, canManageClients, canUseTasks, canEditMonthlyGoals, goalsAccountSelect, selectGoalMonth }) {
  const { canViewField } = useAuth();
  const [opened, setOpened] = useState(null);
  const requestedTab = params.get('tab');
  const tab = tabs.some(([id]) => id === requestedTab) ? requestedTab : 'metricas';
  const { data } = pageProps;
  const campaignId = params.get('campanha');
  const focusedCampaign = params.get('conta') && /^\d{1,32}$/.test(campaignId) ? campaignId : null;
  const atlasScope = useGestorAtlasContext(client.id, pageProps.readStore);
  const index = clients.findIndex(({ id }) => id === client.id);
  const tasks = client.tasks?.filter(isOpenTrafficTask);
  const snapshot = canViewField?.('meta_resumo') === true ? readClienteMetaResumo(client) : null;
  const hasSnapshot = snapshot && !snapshot.permError && !snapshot.rateLimited && metricValue(snapshot, 'spend') !== null;
  const signal = hasSnapshot ? nextActionForAccount({ snapshot }) : null;
  const selectedTask = tasks?.find((task) => task.id === opened);
  const selectedSignal = opened === 'signal' ? signal : null;
  const goalTargets = readClientGoalTargets(client, canViewField);
  const { goals, target, limit } = goalTargets;
  const primary = client.mediaGoals?.find((goal) => goal.is_primary);
  const primaryObjective = primary && MEDIA_GOAL_OBJECTIVES[primary.objective];
  const editablePrimary = canManageClients && pageProps.canReadMeta && canViewField?.('valor') === true && primaryObjective ? primary : null;
  const metaAccount = data.live && client.metaAccounts?.find((account) => account.meta_account_id === pageProps.accountId);
  const goalMonth = tab === 'metas' ? pageProps.goalPeriod : goalMonthPeriod();
  const inGoalAccount = editablePrimary && tab === 'metas' && metaAccount && primary.account_id === goalAccountId(metaAccount.meta_account_id);
  const goalRead = useGestorGoalReadings(pageProps.readStore, editablePrimary && !inGoalAccount ? [primary.id] : [], goalMonth, pageProps.goalReadingRevision);
  const savedGoal = editablePrimary && goalRead.data?.[primary.id];
  const goalReading = inGoalAccount ? data.current : savedGoal?.accountId === primary?.account_id ? savedGoal?.reading : null;
  const progress = editablePrimary && goalReading ? mediaGoalProgress(primary, goalReading, goalMonth, client.mediaGoals) : null;
  const goalInScope = metaAccount && primaryObjective && primary.account_id === goalAccountId(metaAccount.meta_account_id)
    ? { ...primary, objective: primaryObjective.volume, costLabel: primaryObjective.cost } : null;
  const analysisDraft = atlasScope && buildGestorAtlasDraft({ ...atlasScope,
    period: tab === 'metas' ? pageProps.goalPeriod : pageProps.query.period, reading: data.current,
    accountName: metaAccount && (metaAccount.meta_account_name || metaAccount.meta_account_id),
    canSeeSpend: canViewField?.('valor') === true, goal: goalInScope,
  });
  const goalMoney = (cents) => formatMetric(cents / 100, { unit: 'money' }, 'BRL');
  const goalVolume = primaryObjective?.volume.toLocaleLowerCase('pt-BR');
  const summary = [
    canViewField?.('nicho') === true && client.nicho,
    primaryObjective ? `${primaryObjective.cost} alvo ${goalMoney(primary.cost_cents)}` : canViewField?.('objetivo_meta') === true && objectiveLabel(client.objetivo_meta),
    primaryObjective ? primary.budget_cents != null && `Verba ${goalMoney(primary.budget_cents)}${progress?.budgetPercent != null ? ` (${number(progress.budgetPercent)}% usada)` : ''}` : target && `Meta de ${target.label.toLocaleLowerCase('pt-BR')} ${target.value}`,
    primaryObjective ? progress?.volumePercent == null && primary.result_target != null && `${number(primary.result_target)} ${goalVolume}/mês` : limit > 0 && `Limite Meta ${number(limit, 2)}`,
    canViewField?.('responsavel') === true && client.gestorName,
  ].filter(Boolean);
  const backParams = new URLSearchParams(params);
  for (const name of ['tab', 'cliente', 'conta', 'carteira_contas', 'editar_meta', 'decisao_origem', 'usar_memoria', 'versao_memoria', 'campanha']) backParams.delete(name);

  function sectionPath(id, editGoal) {
    const next = new URLSearchParams(params);
    for (const name of ['cliente', 'editar_meta', 'decisao_origem', 'usar_memoria', 'versao_memoria', 'campanha']) next.delete(name);
    if (id === 'metas' && tab !== 'metas') next.delete('conta');
    if (id === 'metricas') next.delete('tab');
    else next.set('tab', id);
    if (editGoal) next.set('editar_meta', editGoal.id);
    return { search: next.toString() };
  }

  return <div className="gia-client-page">
    <header className="gia-header gia-client-header">
      <div className="gia-title">
        <Link className="gia-icon-button gia-back-link" to={{ pathname: '/gestor-ia/carteira', search: backParams.toString() }} aria-label="Voltar à Carteira"><ArrowLeft aria-hidden="true" /></Link>
        <GestorIaClientAvatar client={client} />
        <h1>{client.empresa}</h1>
        <span className="gia-client-status">
          <GestorIaAvatar />
          {hasSnapshot && snapshot.syncedAt ? `Resumo salvo em ${date(snapshot.syncedAt)}` : 'Modo de consulta'}
          {tasks?.length > 0 && <Link to={sectionPath('decisoes')} className="gia-attention-text">{tasks.length} {tasks.length === 1 ? 'tarefa em aberto' : 'tarefas em aberto'}</Link>}
        </span>
      </div>
      <div className="gia-header-actions">
        <div className="gia-client-position">
          <span>{index + 1} de {clients.length}</span>
          {[[clients[index - 1], 'Cliente anterior', ChevronLeft], [clients[index + 1], 'Próximo cliente', ChevronRight]].map(([item, label, Icon]) =>
            item ? <Link key={label} className="gia-icon-button" to={clientPage(item.id, params, tab)} aria-label={label}><Icon aria-hidden="true" /></Link>
              : <button key={label} className="gia-icon-button" disabled type="button" aria-label={label}><Icon aria-hidden="true" /></button>)}
        </div>
        <GestorIaRefresh onClick={reload} pending={refreshing} disabled={data.pending}
          accountName={tab === 'metas' && !params.get('conta') && client.metaAccounts?.length > 1 && metaAccount ? metaAccount.meta_account_name || metaAccount.meta_account_id : undefined}
          fetchedAt={data.current.fetchedAt || (!data.current.accessDenied && hasSnapshot ? snapshot.syncedAt : null)} />
        {analysisDraft && <Link className="gia-action-link" to={GESTOR_ATLAS_CONVERSATION} state={analysisDraft}><Sparkles aria-hidden="true" />Analisar no Atlas</Link>}
        <GestorIaClientMenu label="Configurar cliente" destination={sectionPath} editTo={canManageClients ? clientEditor(client.id) : undefined} />
      </div>
    </header>
    {summary.length > 0 && <p className="gia-client-summary">{summary.join(' · ')}
      {progress?.volumePercent != null && <span className="gia-client-goal-progress" title={`Dados da meta principal até ${date(progress.through)}`}>
        {' · Meta do mês '}<strong>{number(progress.results)} de {number(primary.result_target)} {goalVolume}</strong>
      </span>}
      {editablePrimary ? <Link to={sectionPath('metas', editablePrimary)} replace={tab === 'metas'} aria-haspopup="dialog">Editar metas</Link>
        : tab !== 'metas' && <Link to={sectionPath('metas')}>Ver metas</Link>}
    </p>}
    <nav aria-label="Seções do cliente" className="gia-client-tabs">
      {tabs.map(([id, label]) => <Link key={id} to={sectionPath(id)} aria-current={tab === id ? 'page' : undefined}>{label}{id === 'decisoes' && tasks?.length > 0 && <span className="gia-badge">{tasks.length}</span>}</Link>)}
    </nav>

    {tab === 'metricas' && <div className="gia-stack">
      {signal && <details className="gia-reading">
        <summary><GestorIaAvatar /><span>{signal.title}</span><span className="gia-caption">Sinal do resumo salvo</span><span className="gia-reading-label">Ver leitura</span></summary>
        <div className="gia-reading-body"><p>{signal.detail || signal.action}</p><small className="gia-caption">{periodLabel(snapshot.period)}</small><Link to={sectionPath('decisoes')}>Ver no quadro</Link></div>
      </details>}
      {clientFilters}
      <GestorIaMetricsView {...pageProps} data={data} target={target} focusedCampaign={focusedCampaign} clearCampaignTo={sectionPath('metricas')}
        activity={<aside className="gia-client-activity gia-panel">
        <h2>Hoje, neste cliente</h2>
        {signal && <article><span className="gia-board-dot is-amber" /><div><button className="gia-entity-name" type="button" aria-haspopup="dialog" onClick={() => setOpened('signal')}>{signal.title}</button><p>{signal.action}</p><small>{periodLabel(snapshot.period)}</small></div></article>}
        {tasks?.map((task) => <article key={task.id}><span className="gia-board-dot is-blue" /><div><button className="gia-entity-name" type="button" aria-haspopup="dialog" onClick={() => setOpened(task.id)}>{task.title || 'Sem título'}</button>{task.due_date && <p>Prazo {date(task.due_date)}</p>}</div></article>)}
        {tasks == null ? <p className="gia-caption">Consulta de tarefas indisponível.</p> : !signal && !tasks.length && <p className="gia-caption">Nenhuma pendência registrada.</p>}
        {(signal || tasks?.length > 0) && <Link className="gia-row-link" to={sectionPath('decisoes')}>Ver tudo nas decisões</Link>}
      </aside>} />
      {(selectedSignal || selectedTask) && <GestorIaDecisionReading client={client} task={selectedTask} action={selectedSignal} summary={snapshot} close={() => setOpened(null)} canUseTasks={canUseTasks} readStore={pageProps.readStore} />}
    </div>}
    {tab === 'contas' && <GestorIaClientAccounts client={client} params={params} pageProps={pageProps} data={data} filters={accountFilters} selectAccount={selectAccount} canManageClients={canManageClients} canViewBalance={canViewField?.('valor') === true} />}
    {tab === 'metas' && <GestorIaGoals client={client} {...goalTargets} snapshot={hasSnapshot ? snapshot : null}
      canManageClients={canManageClients} canEditMonthlyGoals={canEditMonthlyGoals} query={pageProps.query} readStore={pageProps.readStore} reloadPortfolio={reloadPortfolio}
      canReadMeta={pageProps.canReadMeta} period={pageProps.goalPeriod} reading={data.current} accountId={pageProps.accountId}
      accountFilter={params.get('conta') || ''} accountSelect={goalsAccountSelect} selectMonth={selectGoalMonth} accountsTo={sectionPath('contas')} atlasScope={atlasScope} />}
    {tab === 'decisoes' && <GestorIaDecisions key={`${pageProps.identity}:${client.id}`} clients={[client]} canUseTasks={canUseTasks} taskClientId={client.id}
      initialAccountId={params.get('conta')} readStore={pageProps.readStore} reloadPortfolio={reloadPortfolio} />}
    {tab === 'relatorios' && <ClientReportArchive key={reviewKey} client={client} reviews={pageProps.reviews} validPeriod={pageProps.validPeriod} period={pageProps.query.period} filters={reportFilters} readStore={pageProps.readStore} />}
    {tab === 'memoria' && <GestorIaMemory client={client} period={pageProps.query.period} reviews={pageProps.reviews} canManageClients={canManageClients} canReadMeta={pageProps.canReadMeta} metrics={data.current} accountId={metaAccount?.meta_account_id} filters={accountFilters}
      atlasDraft={atlasScope ? buildGestorAtlasDraft({ ...atlasScope, purpose: 'memory' }) : null} />}
  </div>;
}
