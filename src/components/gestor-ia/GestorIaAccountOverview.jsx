import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, BarChart3, Building2, Info, Link2, MoreHorizontal, Search } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { supabase } from '@/lib/customSupabaseClient';
import { periodLabel, readingTime } from './GestorIaContext';
import { overviewKey, useGestorRead } from './gestorIaReads';
import GestorIaDrawer from './GestorIaDrawer';
import { clientEditor, clientPage } from './gestorIaClientModel';
import { loadGestorAccountsOverview } from './gestorIaData';
import { CHART_METRICS, formatMetric } from './gestorIaMetricModel';

const spend = CHART_METRICS.find(({ key }) => key === 'spend');
const digits = (value) => /^(act_)?\d{1,32}$/.test(value) ? String(value).replace(/^act_/, '') : '';
export const metaAccountKey = (id) => digits(id) || id;
export const accountSearchText = (value) => String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR');
const filters = [['all', 'Todas'], ['active', 'Ativas'], ['attention', 'Com atenção'], ['unknown', 'Sem status']];
const statusLabels = { 2: 'Desativada', 3: 'Pagamento pendente', 7: 'Em revisão', 8: 'Liquidação pendente', 9: 'Em carência', 100: 'Em encerramento', 101: 'Encerrada' };

export function accountStatus(status, fallback = 'Sem leitura') {
  if (status === 1) return { label: 'Ativa', group: 'active', tone: ' is-active' };
  if (Number.isInteger(status) && statusLabels[status]) return { label: statusLabels[status], group: 'attention', tone: ' is-issue' };
  return { label: Number.isInteger(status) ? `Status ${status}` : fallback, group: 'unknown', tone: '' };
}

export function useGestorIaAccountsOverview({ query, readStore, canReadMeta }, links) {
  const enabled = canReadMeta && Boolean(links?.length);
  const state = useGestorRead(readStore, overviewKey(query.clientId), enabled, () => loadGestorAccountsOverview(supabase, query));
  return enabled ? { ...state.data, loading: Boolean(state.request) && !state.data, error: Boolean(state.error) } : {};
}

function metaAccountUrl(id) {
  const value = digits(id);
  return value && `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${value}`;
}

export function GestorIaBusinessLink({ id, className = 'gia-row-link gia-inline-icon' }) {
  if (!id) return null;
  const classes = `gia-open-bm ${className}`;
  const label = <>Abrir BM<ArrowUpRight aria-hidden="true" /></>;
  if (!/^\d{1,32}$/.test(id)) {
    return <button type="button" className={classes} disabled title="Disponível para BMs com ID válido na Meta" aria-label="Abrir BM, link indisponível">{label}</button>;
  }
  return <a className={classes} href={`https://business.facebook.com/settings/ad-accounts?business_id=${id}`} target="_blank" rel="noreferrer">{label}</a>;
}

function accountEditor(account) {
  return clientEditor(account.client.id, account.platform === 'Meta Ads' ? 'contas-meta' : 'contas-google');
}

function AccountMenu({ account, canReadMeta, canManageClients, params, open }) {
  const meta = account.platform === 'Meta Ads';
  const metrics = clientPage(account.client.id, params, 'metricas');
  const query = new URLSearchParams(metrics.search);
  if (meta) query.set('conta', account.id);
  const adsUrl = meta && canReadMeta && metaAccountUrl(account.id);
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><button className="gia-icon-button gia-menu-trigger" aria-label={`Ações da conta ${account.name}`} type="button"><MoreHorizontal aria-hidden="true" /></button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="gia-context-menu">
      <DropdownMenuItem onSelect={open}><Info aria-hidden="true" />Ver detalhes</DropdownMenuItem>
      {meta && canReadMeta && <DropdownMenuItem asChild><Link to={{ ...metrics, search: query.toString() }}><BarChart3 aria-hidden="true" />Ver métricas da conta</Link></DropdownMenuItem>}
      {adsUrl && <DropdownMenuItem asChild><a href={adsUrl} target="_blank" rel="noreferrer"><ArrowUpRight aria-hidden="true" />Abrir na Meta</a></DropdownMenuItem>}
      {canManageClients && <DropdownMenuItem asChild><Link to={accountEditor(account)} state={{ backOnClose: true, focusAccountId: account.id }}><Link2 aria-hidden="true" />Gerenciar vínculo</Link></DropdownMenuItem>}
    </DropdownMenuContent>
  </DropdownMenu>;
}

function AccountDetails({ account, canReadMeta, canManageClients, showBilling, period, close }) {
  const info = account.info;
  const business = info?.business;
  const billing = info?.prepaid === true ? 'Pré-pago' : info?.prepaid === false ? 'Pós-pago' : 'Não informado';
  return <GestorIaDrawer label={account.platform} title={account.name} close={close}>
    <dl className="gia-context-grid gia-account-details">
      <div><dt>ID da conta</dt><dd>{account.id}</dd></div>
      <div><dt>Estado da conta</dt><dd>{account.status.label}</dd></div>
      {canReadMeta && account.platform === 'Meta Ads' && <>
        <div><dt>BM do Meta</dt><dd>{business ? <>{business.name || 'Nome não informado'}<small>{business.id}</small></> : 'Não informado'}</dd></div>
        <div><dt>Moeda</dt><dd>{info?.currency || 'Não informada'}</dd></div>
        <div><dt>Fuso da conta</dt><dd>{info?.timezone || 'Não informado'}</dd></div>
        <div><dt>Investido em 30 dias</dt><dd>{formatMetric(info?.spend30d, spend, info?.currency)}{(info?.period || period) && <small>{periodLabel(info?.period || period)}</small>}</dd></div>
        {info?.fetchedAt && <div><dt>Última leitura</dt><dd>{readingTime(info.fetchedAt)}</dd></div>}
        {showBilling && <>
          <div><dt>Tipo de cobrança</dt><dd>{billing}</dd></div>
          <div><dt>Saldo de cobrança</dt><dd>{info?.prepaid === true ? 'Consultar na Meta' : formatMetric(info?.billingBalance, spend, info?.currency)}</dd></div>
        </>}
      </>}
    </dl>
    <div className="gia-header-actions">
      <GestorIaBusinessLink id={business?.id} className="gia-action-link" />
      {canManageClients && <Link className="gia-action-link" to={accountEditor(account)} state={{ backOnClose: true, focusAccountId: account.id }}><Link2 aria-hidden="true" />Gerenciar vínculo</Link>}
    </div>
  </GestorIaDrawer>;
}

export default function GestorIaAccountOverview({ accounts, overview, params, selectedId, selectAccount, unavailable, canReadMeta, canManageClients, showBilling }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [grouped, setGrouped] = useState(true);
  const [opened, setOpened] = useState(null);
  const byId = new Map(overview.accounts?.map((account) => [metaAccountKey(account.id), account]));
  const rows = accounts.map((account) => {
    const meta = account.platform === 'Meta Ads';
    const info = meta && canReadMeta ? byId.get(metaAccountKey(account.id)) : null;
    const fallback = meta && canReadMeta ? 'Sem leitura' : 'Vinculada';
    return { ...account, info, status: accountStatus(info?.status, fallback), key: `${account.platform}:${account.id}` };
  });
  const hasMeta = canReadMeta && rows.some(({ platform }) => platform === 'Meta Ads');
  const hasBilling = hasMeta && showBilling;
  const openedAccount = rows.find(({ key }) => key === opened);
  const needle = accountSearchText(search.trim());
  const visible = rows.filter(({ name, id, platform, info, status }) =>
    (filter === 'all' || status.group === filter) && accountSearchText([name, id, platform, info?.business?.name, info?.business?.id].join(' ')).includes(needle));
  const groups = new Map();
  for (const account of visible) {
    const business = account.info?.business;
    const isMeta = account.platform === 'Meta Ads';
    const key = grouped ? business?.id || (isMeta ? 'meta' : 'google') : '';
    if (!groups.has(key)) groups.set(key, {
      label: business?.name || (business ? `BM ${business.id}` : isMeta ? canReadMeta ? 'BM não informado' : 'Meta Ads' : 'Google Ads'),
      businessId: business?.id, accounts: [],
    });
    groups.get(key).accounts.push(account);
  }
  const count = 3 + Number(hasMeta) + Number(hasBilling);
  const readTime = readingTime(overview.fetchedAt);
  return <>
    {rows.length > 0 && <div className="gia-list-toolbar gia-account-tools">
      <label className="gia-table-search"><Search aria-hidden="true" /><input aria-label="Buscar conta ou BM" type="search" placeholder="Buscar conta, ID ou BM" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      {hasMeta && <div className="gia-pills" role="group" aria-label="Status da conta">
        {filters.map(([id, label]) => <button type="button" key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}<span>{rows.filter(({ status }) => id === 'all' || status.group === id).length}</span></button>)}
      </div>}
      {hasMeta && <button className="gia-compare gia-group-accounts" type="button" role="switch" aria-label="Agrupar por BM" aria-checked={grouped} onClick={() => setGrouped(!grouped)}><i aria-hidden="true" />Agrupar por BM</button>}
    </div>}
    <div className="gia-table-wrap gia-table-frame gia-account-table gia-account-overview" data-meta={hasMeta || undefined}>
      <table>
        <caption className="sr-only">Contas vinculadas ao cliente</caption>
        <thead><tr>
          <th scope="col">Conta de anúncio</th><th scope="col">Status</th>
          {hasMeta && <th scope="col" className="gia-account-money">Investido · 30d</th>}
          {hasBilling && <th scope="col" className="gia-account-money" title="Valor de cobrança informado pela Meta para contas pós-pagas em reais">Saldo de cobrança</th>}
          <th scope="col"><span className="sr-only">Ações</span></th>
        </tr></thead>
        {[...groups].map(([key, group]) => <tbody key={key}>
          {key && <tr className="gia-portfolio-group"><th scope="rowgroup" colSpan={count}><span className="gia-inline-icon"><Building2 aria-hidden="true" />{group.label}</span> <span>{group.accounts.length} {group.accounts.length === 1 ? 'conta' : 'contas'}</span><GestorIaBusinessLink id={group.businessId} /></th></tr>}
          {group.accounts.map((account) => <tr key={account.key} data-selected={account.platform === 'Meta Ads' && account.id === selectedId && canReadMeta || undefined}>
            <td>
              {account.platform === 'Meta Ads' && canReadMeta ? <button className="gia-entity-name" type="button" aria-pressed={account.id === selectedId} onClick={() => selectAccount(account.id)}>{account.name}</button> : <strong>{account.name}</strong>}
              <small>{account.id}{!grouped && ` · ${account.info?.business?.name || account.platform}`}</small>
            </td>
            <td><span className={`gia-delivery${account.status.tone}`}>{account.status.label}</span></td>
            {hasMeta && <td className="gia-account-money">{formatMetric(account.info?.spend30d, spend, account.info?.currency)}</td>}
            {hasBilling && <td className="gia-account-money">{account.info?.prepaid === true ? <span className="gia-caption">Pré-pago</span> : formatMetric(account.info?.billingBalance, spend, account.info?.currency)}</td>}
            <td className="gia-row-actions"><AccountMenu account={account} canReadMeta={canReadMeta} canManageClients={canManageClients} params={params} open={() => setOpened(account.key)} /></td>
          </tr>)}
        </tbody>)}
        {!visible.length && <tbody><tr><td className="gia-empty" colSpan={count}>{rows.length ? 'Nenhuma conta para estes filtros.' : unavailable ? 'Consulta de contas indisponível.' : 'Nenhuma conta vinculada a este cliente.'}</td></tr></tbody>}
      </table>
    </div>
    {(overview.loading || overview.error || readTime || overview.fetchedAt === null) && <div className="gia-account-source gia-caption" role="status">
      {overview.loading ? 'Carregando dados salvos…' : readTime ? <>{overview.period && <span>{periodLabel(overview.period)}</span>}<span>Última leitura registrada em {readTime}</span></>
        : overview.error ? 'Dados salvos das contas indisponíveis.' : 'Ainda não há leitura salva para estas contas.'}
    </div>}
    {openedAccount && <AccountDetails account={openedAccount} canReadMeta={canReadMeta} canManageClients={canManageClients} showBilling={showBilling} period={overview.period} close={() => setOpened(null)} />}
  </>;
}
