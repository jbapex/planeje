import React, { lazy, Suspense, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useMatch, useSearchParams } from 'react-router-dom';
import { BarChart3, Bell, Briefcase, CalendarDays, FileText, LockKeyhole, Plug, Radio, Target, Users } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useModuleSettings } from '@/contexts/ModuleSettingsContext';
import { supabase } from '@/lib/customSupabaseClient';
import { dateRange } from '@/lib/trafficPerformanceReport';
import { defaultMetricsPeriod, presetPeriod } from './gestorIaMetricModel';
import { goalMonthPeriod, MEDIA_GOAL_OBJECTIVES } from './gestorIaMediaGoalModel';
import { goalAccountId } from './gestorIaMediaGoalData';
import { canSeeCampaignGoals, canUseGestorIa, GESTOR_PERMISSION_FIELDS, loadGestorPortfolio, loadGestorReviews } from './gestorIaData';
import GestorIaMetrics, { useGestorIaMetrics } from './GestorIaMetrics';
import GestorIaPortfolioMetrics, { usePortfolioMetricReading } from './GestorIaPortfolioMetrics';
import GestorIaRefresh, { metaRefreshNotice } from './GestorIaRefresh';
import { createGestorReads, useGestorRead } from './gestorIaReads';
import { readClienteMetaResumo } from '@/lib/clienteMetaSnapshot';
import ContatosRastreamentoPage from '@/components/pages/ContatosRastreamentoPage';
import GestorIaClient from './GestorIaClient';
import GestorIaPortfolio from './GestorIaPortfolio';
import { GestorIaAccounts } from './GestorIaAccounts';
import GestorIaDecisions from './GestorIaDecisions';
import GestorIaReports, { GestorIaReportActions } from './GestorIaReports';
import GestorIaClientPicker from './GestorIaClientPicker';
import GestorIaConnectors from './GestorIaConnectors';
import GestorIaSidebar from './GestorIaSidebar';
import { GESTOR_RASTREAMENTO_PATH } from './gestorIaClientModel';
import { date } from './GestorIaContext';
import './GestorIa.css';
import './GestorIaTracking.css';

const TABS = [
  ['metricas', 'Métricas', BarChart3], ['carteira', 'Carteira', Users],
  ['decisoes', 'Decisões', Bell], ['relatorios', 'Relatórios', FileText],
  ['rotina', 'Rotina semanal', CalendarDays, ''],
  ['conectores', 'Conectores', Plug],
];
const GestorIaRoutine = lazy(() => import('./GestorIaRoutine'));
const TRACKING_TAB = ['rastreamento', 'Rastreamento', Radio];
const NO_CLIENTS = [];

export default function GestorIaWorkspace() {
  const { profile, canViewField, loading: authLoading } = useAuth();
  const { moduleSettings, moduleAccess, loading: modulesLoading } = useModuleSettings();
  const location = useLocation();
  const clientRoute = useMatch('/gestor-ia/clientes/:clientId');
  const accountsRoute = useMatch('/gestor-ia/carteira/contas');
  const connectorsRoute = useMatch('/gestor-ia/conectores');
  const trackingRoute = Boolean(useMatch(GESTOR_RASTREAMENTO_PATH));
  const routineRoute = Boolean(useMatch('/gestor-ia/rotina'));
  const [params, setParams] = useSearchParams();
  const workspaceRef = useRef(null);
  const clientTab = clientRoute ? params.get('tab') : null;
  const [picker, setPicker] = useState('');
  const [goalReadingRevision, setGoalReadingRevision] = useState(0);
  const allowed = !authLoading && !modulesLoading && canUseGestorIa(profile, moduleSettings);
  const fieldAccess = GESTOR_PERMISSION_FIELDS.map((field) => canViewField?.(field) === true);
  const taskScope = moduleAccess?.tasks || 'all';
  const identity = JSON.stringify([profile?.id, profile?.role, profile?.status, allowed, fieldAccess, moduleSettings?.tasks, moduleSettings?.clients, moduleSettings?.reports, taskScope]);
  const readStore = useMemo(() => createGestorReads(identity), [identity]);

  useLayoutEffect(() => {
    if (workspaceRef.current) workspaceRef.current.scrollTop = 0;
  }, [location.pathname, clientTab]);

  const portfolioRead = useGestorRead(readStore, 'carteira', allowed && !trackingRoute, () => loadGestorPortfolio(supabase, profile, moduleSettings, canViewField, taskScope));
  const portfolio = portfolioRead.data || {};
  const portfolioError = portfolioRead.error && 'Não foi possível carregar sua carteira. Tente atualizar as consultas.';
  const busy = !portfolioRead.data && !portfolioRead.error;
  const clients = portfolio.clients || NO_CLIENTS;
  const availableClients = portfolio.availableClients || clients;
  const activeTab = trackingRoute ? TRACKING_TAB : clientRoute || accountsRoute ? TABS[1]
    : TABS.find(([path]) => location.pathname.replace(/\/$/, '').endsWith(`/${path}`)) || TABS[0];
  const isMetrics = activeTab[0] === 'metricas';
  const isPortfolio = activeTab[0] === 'carteira';
  const isDecisions = activeTab[0] === 'decisoes';
  const isReports = activeTab[0] === 'relatorios';
  const isAdmin = ['superadmin', 'admin'].includes(profile?.role);
  const canReadMeta = allowed && canViewField?.('meta_resumo') === true;
  // Valor protege contrato e cobrança; o desempenho segue a permissão de mídia.
  const canReadPortfolio = canReadMeta;
  const canFilterGoals = canReadPortfolio && canSeeCampaignGoals(profile, moduleSettings, canViewField);
  const explicitClient = params.get('cliente') || '';
  const explicitAccount = params.get('conta') || '';
  const allMetricClients = isMetrics && canReadPortfolio && !explicitClient;
  const clientId = accountsRoute || connectorsRoute || trackingRoute || routineRoute || allMetricClients ? '' : (clientRoute?.params.clientId || explicitClient || clients[0]?.id || availableClients[0]?.id || '');
  const client = availableClients.find((c) => c.id === clientId);
  const objective = canReadPortfolio && Object.hasOwn(MEDIA_GOAL_OBJECTIVES, params.get('metric_objective')) ? params.get('metric_objective') : 'all';
  const goal = canFilterGoals && ['with', 'without'].includes(params.get('metric_goal')) ? params.get('metric_goal') : 'all';
  const mainPortfolio = isMetrics && canReadPortfolio && (allMetricClients || client?.metaAccounts?.length > 0);
  const singleMetric = isMetrics && (!mainPortfolio || Boolean(client && (explicitAccount || client.metaAccounts?.length === 1)));
  const defaultRange = clientRoute ? presetPeriod('last7') : defaultMetricsPeriod();
  const requestedPeriod = { since: params.get('desde') ?? defaultRange.since, until: params.get('ate') ?? defaultRange.until };
  const range = dateRange(requestedPeriod.since, requestedPeriod.until);
  const period = range || requestedPeriod;
  const validPeriod = Boolean(range);
  const preset = params.get('periodo');
  const selectedPreset = preset === 'custom' ? preset : [preset, ...(clientRoute ? ['last7', 'last14', 'last30', 'month', 'lastMonth'] : ['month', 'last7', 'last14', 'last30', 'lastMonth'])].find((key) => {
    const candidate = presetPeriod(key);
    return candidate?.since === period.since && candidate?.until === period.until;
  }) || 'custom';
  const reviewKey = JSON.stringify(['relatorios', client?.id, period.since, period.until]);
  const query = { profile, modules: moduleSettings, clientId: client?.id, period };
  const goalsTab = clientTab === 'metas';
  const goalPeriod = goalMonthPeriod(params.get('mes_meta'));
  const detailPanel = singleMetric || Boolean(clientRoute && !['metas', 'decisoes', 'relatorios'].includes(clientTab));
  const reportsPanel = isReports || Boolean(clientRoute && ['relatorios', 'memoria'].includes(clientTab));
  const needsArchive = reportsPanel || detailPanel && (!canReadMeta || !client?.metaAccounts?.length);
  const reviewRead = useGestorRead(readStore, reviewKey, allowed && Boolean(client) && validPeriod && needsArchive,
    () => loadGestorReviews(supabase, query));
  const reviews = { reviews: reviewRead.data, loading: !reviewRead.data && !reviewRead.error, error: reviewRead.error && 'Não foi possível consultar as análises registradas.' };
  const primaryGoal = goalsTab && client?.mediaGoals?.find(({ is_primary }) => is_primary);
  const primaryAccount = primaryGoal && client.metaAccounts?.find(({ meta_account_id }) => goalAccountId(meta_account_id) === primaryGoal.account_id);
  const accountId = params.get('conta') || primaryAccount?.meta_account_id || client?.metaAccounts?.[0]?.meta_account_id || '';
  const compare = params.get('comparar') === '1';
  const data = useGestorIaMetrics({ client, query: goalsTab ? { ...query, period: goalPeriod } : query, readStore, accountId,
    canReadMeta, validPeriod: goalsTab || validPeriod, compare: !goalsTab && compare, eager: !mainPortfolio }, detailPanel || goalsTab);
  const metricClients = useMemo(() => allMetricClients ? clients : client ? [client] : [], [allMetricClients, clients, client]);
  const portfolioMetrics = usePortfolioMetricReading({ clients: metricClients, accountId: allMetricClients ? '' : explicitAccount,
    period, readStore, enabled: mainPortfolio && validPeriod, objective, goal, revision: goalReadingRevision });
  const showLegacySummary = mainPortfolio && singleMetric && objective === 'all' && goal === 'all' &&
    !portfolioMetrics.loading && !portfolioMetrics.error && portfolioMetrics.accountsRead === 0;

  function filter(key, value) {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if ((['conta', 'cliente'].includes(key) && !value) || (['metric_goal', 'metric_objective'].includes(key) && value === 'all')) next.delete(key);
      else next.set(key, value);
      if (key === 'cliente') next.delete('conta');
      if (['cliente', 'conta', 'desde', 'ate'].includes(key)) next.delete('campanha');
      if (key === 'desde' || key === 'ate') next.set('periodo', 'custom');
      return next;
    });
  }

  function choosePeriod(choice) {
    const dates = presetPeriod(choice) || period;
    setParams((old) => {
      const next = new URLSearchParams(old);
      next.set('periodo', choice);
      next.set('desde', dates.since);
      next.set('ate', dates.until);
      next.delete('campanha');
      return next;
    });
  }

  if (authLoading || modulesLoading) return <div className="gestor-ia gia-status" role="status">Carregando acesso…</div>;
  if (!allowed) return <div className="gestor-ia gia-status"><h1>Acesso ao Gestor IA indisponível</h1><Link to="/caixa">Voltar ao Planeje</Link></div>;

  const canAccessClients = moduleSettings?.clients === true;
  const canUseTracking = moduleSettings?.rastreamento === true;
  const tabs = canUseTracking ? [...TABS, [...TRACKING_TAB, trackingRoute ? location.search : '']] : TABS;
  const canManageClients = isAdmin && canAccessClients;
  const canUseTasks = moduleSettings?.tasks === true;
  const canEditMonthlyGoals = isAdmin && moduleSettings?.reports === true;
  const hasPeriod = isMetrics || isReports;
  const canCompare = mainPortfolio || canReadMeta && client?.metaAccounts?.some((a) => a.meta_account_id === accountId);
  const pageProps = { client, query, identity, readStore, accountId, canReadMeta, reviews, validPeriod, compare, data, goalPeriod, goalReadingRevision };
  const mainParams = new URLSearchParams(params);
  mainParams.delete('tab');
  mainParams.delete('carteira_contas');
  mainParams.delete('editar_meta');
  mainParams.delete('campanha');
  if (clientRoute) {
    mainParams.set('cliente', clientId);
  }
  const allClientsOption = isDecisions || isMetrics && canReadPortfolio;
  const clientSelect = <label className="gia-filter-select"><Users aria-hidden="true" />
    <select aria-label="Cliente" id="gestor-cliente" value={isDecisions ? params.get('cliente') || '' : clientId} onChange={(e) => filter('cliente', e.target.value)} disabled={busy || !availableClients.length}>
      <option value="" disabled={!allClientsOption}>{allClientsOption ? 'Todos os clientes' : 'Selecione um cliente'}</option>
      {params.get('cliente') && !client && <option value={clientId}>Cliente indisponível</option>}
      {availableClients.map((c) => <option key={c.id} value={c.id}>{c.empresa}</option>)}
    </select>
  </label>;
  const accountSelect = canReadMeta && <select aria-label="Conta Meta" id="gestor-conta" value={accountId} onChange={(e) => filter('conta', e.target.value)} disabled={!client?.metaAccounts?.length}>
    <option value="" disabled>Sem conta Meta</option>
    {(client?.metaAccounts || []).map((a) => <option key={a.meta_account_id} value={a.meta_account_id}>{a.meta_account_name || a.meta_account_id}</option>)}
    {accountId && !client?.metaAccounts?.some((a) => a.meta_account_id === accountId) && <option value={accountId}>Conta indisponível</option>}
  </select>;
  const metricAccountSelect = client && (canReadPortfolio && (client.metaAccounts?.length > 1 || explicitAccount)
    ? <select aria-label="Conta Meta" value={explicitAccount} onChange={(e) => filter('conta', e.target.value)}>
      <option value="">Todas as contas</option>
      {(client.metaAccounts || []).map(({ meta_account_id, meta_account_name }) => <option key={meta_account_id} value={meta_account_id}>{meta_account_name || meta_account_id}</option>)}
      {explicitAccount && !client.metaAccounts?.some(({ meta_account_id }) => meta_account_id === explicitAccount) && <option value={explicitAccount}>Conta indisponível</option>}
    </select> : accountSelect);
  const goalsAccountSelect = canReadMeta && <select aria-label="Filtrar metas por conta" id="gestor-conta-metas" value={params.get('conta') || ''} onChange={(e) => filter('conta', e.target.value)}>
    <option value="">Todas as contas</option>
    {(client?.metaAccounts || []).map(({ meta_account_id, meta_account_name }) => <option key={meta_account_id} value={meta_account_id}>{meta_account_name || meta_account_id}</option>)}
    {params.has('conta') && !client?.metaAccounts?.some(({ meta_account_id }) => meta_account_id === accountId) && <option value={accountId}>Conta indisponível</option>}
  </select>;
  const periodSelect = <label className="gia-filter-select"><CalendarDays aria-hidden="true" />
    <select aria-label="Período" id="gestor-periodo" value={selectedPreset} onChange={(e) => choosePeriod(e.target.value)}><option value="month">Este mês</option><option value="last7">Últimos 7 dias</option><option value="last14">Últimos 14 dias</option><option value="last30">Últimos 30 dias</option><option value="lastMonth">Mês passado</option><option value="custom">Personalizado</option></select>
  </label>;
  const periodDates = selectedPreset === 'custom' ? <div className="gia-dates"><input aria-label="Data inicial" id="gestor-desde" type="date" value={period.since} onChange={(e) => filter('desde', e.target.value)} /><span aria-hidden="true">–</span><input aria-label="Data final" id="gestor-ate" type="date" value={period.until} onChange={(e) => filter('ate', e.target.value)} /></div> : <span className="gia-filter-range">{date(period.since).slice(0, 5)} – {date(period.until).slice(0, 5)}</span>;
  const clientPeriod = <><div className="gia-period-switch" aria-label="Período das métricas">{[['last7', '7 dias'], ['last14', '14 dias'], ['last30', '30 dias']].map(([id, label]) => <button type="button" key={id} aria-pressed={selectedPreset === id} onClick={() => choosePeriod(id)}>{label}</button>)}</div>
    {periodSelect}{periodDates}</>;
  const compareToggle = canCompare && <button className="gia-compare" type="button" role="switch" aria-label="Comparar com período anterior" aria-checked={compare} disabled={!validPeriod} onClick={() => filter('comparar', compare ? '0' : '1')}><i aria-hidden="true" />Comparar</button>;
  const periodError = !validPeriod && <p className="gia-notice" role="alert">Confira as datas do período.</p>;
  const refresh = async () => {
    if (data.canRefresh) await data.refresh();
    else await Promise.all([portfolioRead.reload(), reviewRead.reload()]);
    setGoalReadingRevision((previous) => previous + 1);
  };
  const refreshing = Boolean(portfolioMetrics.pending && mainPortfolio) || (data.canRefresh ? data.refreshing : Boolean(portfolioRead.refreshing || reviewRead.refreshing));
  const savedAt = !data.current.accessDenied && canViewField?.('meta_resumo') === true ? readClienteMetaResumo(client)?.syncedAt : null;

  return (
    <div className="gestor-ia" ref={workspaceRef}>
      <GestorIaSidebar tabs={tabs} activeTab={activeTab[0]} search={trackingRoute ? '' : mainParams.toString()} profileName={profile.full_name || 'Minha conta'} />
      <main className={trackingRoute && canUseTracking ? 'gia-main gia-main--rastreamento' : 'gia-main'}>
        {routineRoute ? <Suspense fallback={<p className="gia-status" role="status">Abrindo rotina…</p>}><GestorIaRoutine clients={availableClients} loading={busy} error={portfolioError} profile={profile} modules={moduleSettings} canViewField={canViewField} readStore={readStore} /></Suspense> : trackingRoute ? (
          canUseTracking ? <ContatosRastreamentoPage /> : <p className="gia-notice" role="alert">Acesso ao Rastreamento indisponível.</p>
        ) : <>
        {!clientRoute && !accountsRoute && <header className="gia-header">
          <div className="gia-title"><h1>{activeTab[1]}</h1>{isPortfolio && !busy && <span className="gia-title-count" aria-label={`${clients.length} clientes`}>{clients.length}</span>}<span className="gia-readonly"><LockKeyhole aria-hidden="true" />Modo de consulta</span></div>
          <div className="gia-header-actions">
            {isPortfolio && !busy && !portfolioError && <button className="gia-action-link gia-primary-action" type="button" onClick={() => setPicker('cliente')}><Users aria-hidden="true" />Selecionar cliente</button>}
            {isReports && client && validPeriod && <GestorIaReportActions client={client} period={period} reviews={reviews} readStore={readStore} />}
            <GestorIaRefresh onClick={refresh} pending={refreshing} disabled={busy || data.pending}
              savedOnly={mainPortfolio && !data.canRefresh}
              fetchedAt={isMetrics ? mainPortfolio && !showLegacySummary ? portfolioMetrics.fetchedAt : data.current.fetchedAt || savedAt : null} />
          </div>
        </header>}
        {hasPeriod && <section className="gia-filters" aria-label="Filtros de consulta">
          {clientSelect}
          {isMetrics && metricAccountSelect}
          {isMetrics && canReadPortfolio && <label className="gia-filter-select gia-filter-tag"><Target aria-hidden="true" />
            <select aria-label="Objetivo" value={objective} onChange={(e) => filter('metric_objective', e.target.value)}>
              <option value="all">Todos os objetivos</option>
              {Object.entries(MEDIA_GOAL_OBJECTIVES).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}
            </select></label>}
          {isMetrics && canFilterGoals && <label className="gia-filter-select gia-filter-tag"><select aria-label="Situação da meta" value={goal} onChange={(e) => filter('metric_goal', e.target.value)}>
            <option value="all">Com e sem meta</option><option value="with">Só com meta</option><option value="without">Sem meta</option>
          </select></label>}
          {periodSelect}{periodDates}
          {isMetrics && compareToggle}
        </section>}
        {hasPeriod && periodError}
        {(portfolio.warnings || []).length > 0 && <div className="gia-notice" role="status">{portfolio.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}
        {portfolioRead.data && portfolioError && <p className="gia-notice" role="status">{portfolioError} Exibindo os dados anteriores.</p>}
        {connectorsRoute ? <GestorIaConnectors clients={availableClients} busy={busy} error={!portfolioRead.data ? portfolioError : null} modules={moduleSettings} role={profile.role} manageAccounts={canManageClients && !busy && !portfolioError ? setPicker : undefined} />
          : busy ? <p className="gia-status" role="status">Carregando carteira…</p>
          : !portfolioRead.data && portfolioError ? <p className="gia-status" role="alert">{portfolioError}</p>
          : !isReports && !isPortfolio && !client && !availableClients.length ? <div className="gia-empty"><Briefcase aria-hidden="true" /><h2>Nenhum cliente na carteira de tráfego</h2></div>
          : !isReports && (!isPortfolio || clientRoute) && !client && !allMetricClients ? <div className="gia-stack">{isDecisions && clientSelect}<div className="gia-empty"><h2>Cliente indisponível</h2>{clientRoute && <Link to="/gestor-ia/carteira">Voltar à carteira</Link>}</div></div> : <Routes>
          <Route path="metricas" element={mainPortfolio && !showLegacySummary ? <GestorIaPortfolioMetrics data={portfolioMetrics} compare={compare} objective={objective} goal={goal}
            validPeriod={validPeriod} refreshNotice={metaRefreshNotice(data.current)} /> : <GestorIaMetrics {...pageProps} />} />
          <Route path="carteira" element={params.get('carteira_contas') === '1' ? <Navigate replace to={{ pathname: '/gestor-ia/carteira/contas', search: mainParams.toString() }} /> : <GestorIaPortfolio clients={clients} canManageClients={canAccessClients} readStore={readStore} goalReadingRevision={goalReadingRevision} />} />
          <Route path="carteira/contas" element={<GestorIaAccounts clients={clients} params={params} pageProps={pageProps} linkAccount={canManageClients ? () => setPicker('contas') : undefined} />} />
          <Route path="clientes/:clientId" element={client && <GestorIaClient key={client.id} client={client} clients={availableClients} params={params} reload={refresh} reloadPortfolio={portfolioRead.reload} refreshing={refreshing} pageProps={pageProps} reviewKey={reviewKey} selectAccount={(id) => filter('conta', id)} canManageClients={canManageClients} canUseTasks={canUseTasks} canEditMonthlyGoals={canEditMonthlyGoals}
            goalsAccountSelect={goalsAccountSelect} selectGoalMonth={(value) => filter('mes_meta', value)}
            clientFilters={<><section className="gia-filters gia-client-filters" aria-label="Filtros de métricas do cliente">
              {accountSelect}{clientPeriod}{compareToggle}
            </section>{periodError}</>}
            accountFilters={<><section className="gia-filters gia-client-filters" aria-label="Conta e período">{accountSelect}{clientPeriod}</section>{periodError}</>}
            reportFilters={<><section className="gia-filters gia-client-filters" aria-label="Período do relatório">{periodSelect}{periodDates}</section>{periodError}</>}
          />} />
          <Route path="decisoes" element={<GestorIaDecisions key={identity} clients={params.get('cliente') ? client ? [client] : [] : clients} clientFilter={clientSelect} canUseTasks={canUseTasks} taskClientId={params.get('cliente') ? client?.id : undefined} readStore={readStore} reloadPortfolio={portfolioRead.reload} />} />
          <Route path="relatorios" element={<GestorIaReports key={reviewKey} client={client} hasClients={availableClients.length > 0} period={period} reviews={reviews} validPeriod={validPeriod} readStore={readStore} />} />
          <Route path="*" element={<Navigate to={`/gestor-ia/metricas${location.search}`} replace />} />
        </Routes>}
        {picker && !busy && !portfolioError && (picker === 'cliente' || canManageClients) && <GestorIaClientPicker key={`${picker}:${identity}`} clients={availableClients} params={params} mode={picker} canAccessClients={canAccessClients} canManageClients={canManageClients} close={() => setPicker('')} />}
        </>}
      </main>
    </div>
  );
}
