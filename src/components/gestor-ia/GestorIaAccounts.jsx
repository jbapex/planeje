import React, { Fragment, useEffect, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, ChevronDown, ChevronRight, Link2, Plus, Search } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { mapPool } from '@/lib/googleAdsDashboard';
import { extractEntityMetrics, metaVeiculacaoStatus, readNestedAdsets } from '@/lib/clienteMetaSnapshot';
import { periodLabel } from './GestorIaContext';
import { adPlatforms, clientEditor, clientPage } from './gestorIaClientModel';
import { loadGestorAccountsOverview } from './gestorIaData';
import { overviewKey } from './gestorIaReads';
import { metaRefreshNotice } from './GestorIaRefresh';
import { CHART_METRICS, formatMetric, metricValue, objectiveMetricKeys } from './gestorIaMetricModel';
import GestorIaAccountOverview, { accountSearchText, accountStatus, GestorIaBusinessLink, metaAccountKey, useGestorIaAccountsOverview } from './GestorIaAccountOverview';

const accountsFor = (clients) => clients.flatMap((client) => adPlatforms.flatMap(([platform, field, id, name]) =>
  (client[field] || []).map((account) => ({ client, platform, id: account[id], name: account[name] || account[id] })),
));
const metric = (key) => CHART_METRICS.find((item) => item.key === key);
const money = metric('spend');

function useCatalogOverview(clients, { query: { profile, modules }, readStore, canReadMeta }) {
  useSyncExternalStore(readStore.subscribe, readStore.version, readStore.version);
  useEffect(() => {
    if (!canReadMeta) return undefined;
    const targets = clients.filter((client) => client.metaAccounts?.length);
    let active = true;
    void mapPool(targets, 2, async ({ id }) => {
      if (active) await readStore.run(overviewKey(id), () => loadGestorAccountsOverview(supabase, { profile, modules, clientId: id }));
    });
    return () => { active = false; };
  }, [canReadMeta, clients, readStore, modules, profile]);
  const byClient = new Map();
  let pending = 0, incomplete = false;
  if (canReadMeta) for (const client of clients.filter(({ metaAccounts }) => metaAccounts?.length)) {
    const { data, error } = readStore.get(overviewKey(client.id));
    if (data) byClient.set(client.id, new Map(data.accounts.map((account) => [metaAccountKey(account.id), account])));
    if (!data && !error) pending += 1;
    if (error || data && data.accounts.length < client.metaAccounts.length) incomplete = true;
  }
  return { byClient, pending, incomplete };
}

function accountLocation(account, params) {
  const path = clientPage(account.client.id, params, 'contas');
  const next = new URLSearchParams(path.search);
  if (account.platform === 'Meta Ads') next.set('conta', account.id);
  return { ...path, search: next.toString() };
}

function catalogGroup(account, groupBy) {
  if (groupBy === 'none') return { key: 'all', label: '' };
  if (groupBy === 'client') return { key: account.client.id, label: account.client.empresa };
  if (groupBy === 'business' && account.platform === 'Meta Ads') {
    const business = account.info?.business;
    return business ? { key: business.id, label: business.name || `BM ${business.id}`, businessId: business.id }
      : { key: 'unknown-business', label: 'BM não informado' };
  }
  return { key: account.platform, label: account.platform };
}

function AccountTable({ groups, params, unavailable, showOwner, showMeta, showBilling }) {
  const count = 3 + Number(showOwner) + Number(showMeta) + Number(showBilling);
  return <div className="gia-table-wrap gia-table-frame gia-account-table gia-account-overview gia-account-catalog" data-meta={showMeta || undefined}>
    <table>
      <caption className="sr-only">Contas vinculadas</caption>
      <thead><tr>
        <th scope="col">Conta de anúncio</th><th scope="col">{showMeta ? 'Status' : 'Vínculo'}</th><th scope="col">Cliente</th>
        {showOwner && <th scope="col" title="Responsável de tráfego do cliente no Planeje">Dono</th>}
        {showMeta && <th scope="col" className="gia-account-money">Investido · 30d</th>}
        {showBilling && <th scope="col" className="gia-account-money" title="Valor de cobrança informado pela Meta para contas pós-pagas em reais">Saldo de cobrança</th>}
      </tr></thead>
      {groups.map(({ key, label, businessId, accounts }) => <tbody key={key}>
        {label && <tr className="gia-portfolio-group"><th scope="rowgroup" colSpan={count}>
          <span>{label}</span> <span>{accounts.length} {accounts.length === 1 ? 'conta' : 'contas'}</span>
          <GestorIaBusinessLink id={businessId} />
        </th></tr>}
        {accounts.map((account) => {
          const fallback = showMeta && account.platform === 'Meta Ads' ? 'Sem leitura' : 'Vinculada';
          const status = accountStatus(account.info?.status, fallback);
          return <tr key={`${account.client.id}-${account.platform}-${account.id}`}>
            <td><strong>{account.name}</strong><small>{account.id} · {account.platform}</small></td>
            <td><span className={`gia-delivery${status.tone}`}>{status.label}</span></td>
            <td><Link className="gia-row-link gia-inline-icon" to={accountLocation(account, params)}>{account.client.empresa}<ArrowUpRight aria-hidden="true" /></Link></td>
            {showOwner && <td>{account.owner || '—'}</td>}
            {showMeta && <td className="gia-account-money">{formatMetric(account.info?.spend30d, money, account.info?.currency)}</td>}
            {showBilling && <td className="gia-account-money">{account.info?.prepaid === true
              ? <span className="gia-caption" title="Consulte o saldo pré-pago na Meta">Pré-pago</span>
              : formatMetric(account.info?.billingBalance, money, account.info?.currency)}</td>}
          </tr>;
        })}
      </tbody>)}
      {!groups.length && <tbody><tr><td className="gia-empty" colSpan={count}>{unavailable ? 'Consulta de contas indisponível.' : 'Nenhuma conta para estes filtros.'}</td></tr></tbody>}
    </table>
  </div>;
}

export function GestorIaAccounts({ clients, params, pageProps, linkAccount }) {
  const { canViewField } = useAuth();
  const [search, setSearch] = useState('');
  const [platform, setPlatform] = useState('all');
  const [groupBy, setGroupBy] = useState('business');
  const overview = useCatalogOverview(clients, pageProps);
  const showOwner = canViewField?.('responsavel') === true;
  const showMeta = pageProps.canReadMeta && clients.some((client) => client.metaAccounts?.length);
  const showBilling = showMeta && canViewField?.('valor') === true;
  const grouping = !showMeta && groupBy === 'business' ? 'platform' : groupBy;
  const accounts = accountsFor(clients).map((account) => ({
    ...account,
    owner: showOwner && account.client.gestorName !== 'Não informado' ? account.client.gestorName : undefined,
    info: showMeta && account.platform === 'Meta Ads'
      ? overview.byClient?.get(account.client.id)?.get(metaAccountKey(account.id))
      : undefined,
  }));
  const needle = accountSearchText(search.trim());
  const visible = accounts.filter((account) => (platform === 'all' || account.platform === platform) &&
    accountSearchText([account.name, account.id, account.client.empresa, account.owner, account.info?.business?.name, account.info?.business?.id].join(' ')).includes(needle));
  const groups = new Map();
  for (const account of visible) {
    const group = catalogGroup(account, grouping);
    if (!groups.has(group.key)) groups.set(group.key, { ...group, accounts: [] });
    groups.get(group.key).accounts.push(account);
  }
  const back = new URLSearchParams(params);
  for (const name of ['tab', 'conta', 'carteira_contas']) back.delete(name);
  return <div className="gia-stack gia-accounts-page">
    <header className="gia-header">
      <div className="gia-title">
        <Link className="gia-icon-button gia-back-link" to={{ pathname: '/gestor-ia/carteira', search: back.toString() }} aria-label="Voltar à Carteira"><ArrowLeft aria-hidden="true" /></Link>
        <h1>Contas</h1><span className="gia-title-count">{accounts.length}</span><span className="gia-readonly">Contas vinculadas aos clientes da carteira</span>
      </div>
      {linkAccount && <button type="button" className="gia-action-link gia-primary-action" onClick={linkAccount}><Plus aria-hidden="true" />Vincular conta</button>}
    </header>
    <section className="gia-panel gia-account-panel">
      <div className="gia-section-heading"><h2>Contas de anúncio</h2><span className="gia-caption">{visible.length} {visible.length === 1 ? 'conta' : 'contas'}</span></div>
      <div className="gia-list-toolbar">
        <label className="gia-table-search"><Search aria-hidden="true" /><input aria-label="Buscar conta" type="search" placeholder={showMeta ? 'Buscar conta, ID, BM ou cliente' : 'Buscar conta, ID ou cliente'} value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <div className="gia-pills" aria-label="Plataforma">
          {['all', ...adPlatforms.map(([label]) => label)].map((value) => <button key={value} type="button" aria-pressed={platform === value} onClick={() => setPlatform(value)}>{value === 'all' ? 'Todas' : value}<span>{accounts.filter((account) => value === 'all' || account.platform === value).length}</span></button>)}
        </div>
        <select className="gia-toolbar-select" aria-label="Agrupar contas" value={grouping} onChange={(event) => setGroupBy(event.target.value)}>
          {showMeta && <option value="business">Agrupar por BM</option>}
          <option value="platform">Agrupar por plataforma</option><option value="client">Agrupar por cliente</option><option value="none">Sem agrupamento</option>
        </select>
      </div>
      <AccountTable groups={[...groups.values()]} params={params} showOwner={showOwner} showMeta={showMeta} showBilling={showBilling} unavailable={!accounts.length && clients.some((client) => adPlatforms.some(([, key]) => client[key] === null))} />
      {showMeta && (overview.pending > 0 || overview.incomplete) && <p className="gia-account-source gia-caption" role="status">
        {overview.pending > 0 ? 'Carregando contas salvas…' : 'Algumas contas ainda não têm leitura salva.'}
      </p>}
    </section>
  </div>;
}

function DeliveryTable({ client, period, accountId, data, validPeriod, filters, info }) {
  const [collapsed, setCollapsed] = useState([]);
  const [columns, setColumns] = useState('resultados');
  const { current, live, linked } = data;
  const account = client.metaAccounts?.find((item) => item.meta_account_id === accountId);
  const { resultKey, costKey } = objectiveMetricKeys(client.objetivo_meta);
  const currency = current.account?.currency || info?.currency;
  const keys = columns === 'cliques' ? ['spend', 'impressions', 'clicks', 'ctr'] : ['spend', resultKey, costKey];
  const values = (insights) => keys.map((key) => <td key={key} className="gia-number">{formatMetric(metricValue(insights, key), metric(key), currency)}</td>);
  const status = !validPeriod ? 'Selecione um período válido.'
    : !live && linked ? 'A entrega por campanha está disponível para perfis administrativos.'
    : !linked ? 'Nenhuma conta Meta selecionada para esta consulta.'
    : !current.fetchedAt && !current.loading ? current.error || 'Ainda não há leitura de entrega salva para esta conta.'
      : current.campaignsError;
  const campaigns = current.campaigns || [];
  const expandable = campaigns.filter((campaign) => readNestedAdsets(campaign).length > 0).map(({ id }) => id);
  const anyExpanded = expandable.some((id) => !collapsed.includes(id));
  const state = accountStatus(info?.status, 'Vinculada');
  return <section className="gia-panel gia-account-panel">
    <div className="gia-section-heading"><div><h2>Onde a entrega aconteceu</h2><p className="gia-caption">Conta › campanha › conjunto{!filters && ` · ${periodLabel(period)}`}</p></div></div>
    {current.fetchedAt && current.exact === false && <p className="gia-caption">Último período salvo · {periodLabel(current.period)}</p>}
    {current.partial && <p className="gia-caption">A Meta retornou uma parte da estrutura de campanhas.</p>}
    {metaRefreshNotice(current) && <p className="gia-notice" role="status">{metaRefreshNotice(current)}</p>}
    {current.fetchedAt && current.error && <p className="gia-notice" role="alert">{current.error}</p>}
    {filters && <div className="gia-delivery-toolbar">
      {filters}
      {!status && !current.loading && <div className="gia-header-actions">
        {expandable.length > 0 && <button type="button" className="gia-action-link" onClick={() => setCollapsed(anyExpanded ? expandable : [])}>{anyExpanded ? 'Recolher conjuntos' : 'Expandir conjuntos'}</button>}
        <select className="gia-toolbar-select" aria-label="Colunas de entrega" value={columns} onChange={(event) => setColumns(event.target.value)}><option value="resultados">Resultados</option><option value="cliques">Entrega e cliques</option></select>
      </div>}
    </div>}
    {status ? <p className="gia-caption" role={current.error || current.campaignsError ? 'alert' : undefined}>{status}</p> : current.loading ? <p className="gia-caption" role="status">Carregando entrega salva…</p> :
      <div className="gia-table-wrap gia-table-frame gia-delivery-tree"><table>
        <caption className="sr-only">Entrega por conta, campanha e conjunto</caption>
        <thead><tr><th scope="col">Conta / Campanha</th><th scope="col">Status</th>{keys.map((key) => <th key={key} scope="col">{key === 'spend' ? 'Investido' : metric(key).label}</th>)}</tr></thead>
        <tbody>
          <tr className="gia-portfolio-group"><td><strong>{account?.meta_account_name || accountId}</strong></td><td><span className={`gia-delivery${state.tone}`}>{state.label}</span></td>{values(current.account)}</tr>
          {campaigns.map((campaign) => {
            const sets = readNestedAdsets(campaign);
            const open = !collapsed.includes(campaign.id);
            return <Fragment key={campaign.id}>
              <tr><td className="gia-delivery-campaign">{sets.length > 0 ? <button type="button" className="gia-inline-icon gia-entity-name" aria-expanded={open} onClick={() => setCollapsed((old) => open ? [...old, campaign.id] : old.filter((id) => id !== campaign.id))}>
                {open ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}{campaign.name || 'Campanha sem nome'}</button> : campaign.name || 'Campanha sem nome'}</td>
                <td>{metaVeiculacaoStatus(campaign).label}</td>{values(campaign.insights?.data?.length ? extractEntityMetrics(campaign) : null)}</tr>
              {open && sets.map((set) => <tr key={set.id}><td className="gia-delivery-adset">{set.name || 'Conjunto sem nome'}</td><td>{metaVeiculacaoStatus(set).label}</td>{values(set.insights?.data?.length ? extractEntityMetrics(set) : null)}</tr>)}
            </Fragment>;
          })}
          {!campaigns.length && <tr><td colSpan={keys.length + 2} className="gia-empty">Nenhuma campanha neste período.</td></tr>}
        </tbody>
      </table></div>}
  </section>;
}

export function GestorIaClientAccounts({ client, params, pageProps, data, filters, selectAccount, canManageClients, canViewBalance }) {
  const overview = useGestorIaAccountsOverview(pageProps, client.metaAccounts);
  const accounts = accountsFor([client]);
  const unavailable = adPlatforms.some(([, field]) => client[field] === null);
  const info = overview.accounts?.find(({ id }) => metaAccountKey(id) === metaAccountKey(pageProps.accountId));
  return <div className="gia-stack">
    <section className="gia-panel gia-account-panel">
      <div className="gia-section-heading">
        <div className="gia-account-heading"><h2>Contas vinculadas</h2>{accounts.length > 0 && <span className="gia-badge">{accounts.length}</span>}</div>
        <div className="gia-header-actions">
          {canManageClients && <>
            <Link className="gia-action-link gia-primary-action" to={clientEditor(client.id, 'contas-meta')} state={{ backOnClose: true }}><Link2 aria-hidden="true" />{client.metaAccounts?.length === 0 ? 'Vincular Meta Ads' : 'Gerenciar Meta Ads'}</Link>
            <Link className="gia-action-link" to={clientEditor(client.id, 'contas-google')} state={{ backOnClose: true }}>{client.googleAccounts?.length === 0 ? 'Vincular Google Ads' : 'Gerenciar Google Ads'}</Link>
          </>}
          <Link className="gia-action-link" to={{ pathname: '/gestor-ia/carteira/contas', search: params.toString() }}>Todas as contas</Link>
        </div>
      </div>
      <GestorIaAccountOverview accounts={accounts} overview={overview} params={params} unavailable={unavailable} selectedId={pageProps.accountId} selectAccount={selectAccount} canReadMeta={pageProps.canReadMeta} canManageClients={canManageClients} showBilling={pageProps.canReadMeta && canViewBalance} />
    </section>
    <DeliveryTable key={pageProps.accountId} client={client} accountId={pageProps.accountId} period={pageProps.query.period} validPeriod={pageProps.validPeriod} data={data} filters={pageProps.canReadMeta && client.metaAccounts?.length ? filters : null} info={info} />
  </div>;
}
