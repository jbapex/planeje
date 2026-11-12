import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Search, SlidersHorizontal, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { campaignObjectiveKey, extractEntityMetrics, metaVeiculacaoStatus, readNestedAdsets } from '@/lib/clienteMetaSnapshot';
import { CHART_METRICS, formatMetric, metricValue, normalizeInsight } from './gestorIaMetricModel';
import { periodLabel } from './GestorIaContext';

const COLUMNS = [
  ['delivery', 'Entrega'], ['messages', 'Mensagens'], ['leads', 'Leads'], ['purchases', 'Compras'],
  ['costMessage', 'Custo por mensagem'], ['cpl', 'Custo por lead'], ['costPurchase', 'Custo por compra'], ['spend', 'Investimento'],
  ['impressions', 'Impressões'], ['clicks', 'Cliques'], ['ctr', 'CTR'], ['cpm', 'CPM'],
];
const PORTFOLIO_COLUMNS = [...COLUMNS, ...CHART_METRICS.filter(({ key }) => !COLUMNS.some(([existing]) => existing === key)).map(({ key, label }) => [key, label])];
const LEVELS = [
  ['campanha', 'Campanhas', 'Campanha'], ['conjunto', 'Conjuntos', 'Conjunto'], ['anuncio', 'Anúncios', 'Anúncio'],
];
const OBJECTIVES = { mensagens: 'Mensagens', leads: 'Leads', compras: 'Compras', trafego: 'Tráfego', engajamento: 'Engajamento', alcance: 'Alcance', outros: 'Outros' };
function rowsByLevel(campaigns) {
  const campaignsWithGoal = campaigns.map((c) => ({ ...c, objectiveKey: campaignObjectiveKey(c.objective) }));
  const adsets = campaignsWithGoal.flatMap((c) => readNestedAdsets(c).map((a) => ({ ...a, parent: c.name, objectiveKey: c.objectiveKey, portfolioScope: c.portfolioScope })));
  const ads = adsets.flatMap((adset) => {
    const items = Array.isArray(adset.ads) ? adset.ads : adset.ads?.data;
    return Array.isArray(items) ? items.filter(Boolean).map((ad) => ({ ...ad, parent: adset.name, objectiveKey: adset.objectiveKey, portfolioScope: adset.portfolioScope })) : [];
  });
  return { campanha: campaignsWithGoal, conjunto: adsets, anuncio: ads };
}

export default function GestorIaCampaigns({ campaigns, currency, period, client, requestKey, resultKey, costKey, error, focusedCampaign, clearCampaignTo, portfolio = false, definitions = CHART_METRICS }) {
  const [level, setLevel] = useState('campanha'), [search, setSearch] = useState(''), [objective, setObjective] = useState('all');
  const [delivery, setDelivery] = useState('all'), [sort, setSort] = useState({ key: 'spend', direction: -1 });
  const [columns, setColumns] = useState(() => [...new Set(['delivery', resultKey, costKey, 'spend', 'impressions', 'ctr'])]);
  const [page, setPage] = useState(1), [pageSize, setPageSize] = useState(10), [detail, setDetail] = useState(null);
  const detailRef = useRef(null);
  const focusRef = useRef(null);
  const grouped = useMemo(() => rowsByLevel(focusedCampaign ? campaigns.filter(({ id }) => id === focusedCampaign) : campaigns), [campaigns, focusedCampaign]);
  const all = useMemo(() => grouped[level].map((row) => ({
    ...row, name: String(row.name || 'Sem nome'), delivery: metaVeiculacaoStatus(row),
    metrics: Array.isArray(row.insights?.data) && row.insights.data.length && !row.insights.error
      ? portfolio ? normalizeInsight(row.insights.data[0]) : extractEntityMetrics(row) : null,
  })), [grouped, level, portfolio]);
  const rows = all.filter((row) => [row.name, row.id, row.parent, row.portfolioScope?.clientName, row.portfolioScope?.accountName].join(' ')
    .toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR')))
    .filter((row) => objective === 'all' || row.objectiveKey === objective)
    .filter((row) => delivery === 'all' || (delivery === 'active' ? row.delivery.active : !row.delivery.active));
  rows.sort((a, b) => {
    if (sort.key === 'name') return a.name.localeCompare(b.name, 'pt-BR') * sort.direction;
    if (portfolio && definitions.find((metric) => metric.key === sort.key)?.unit === 'money') {
      const byCurrency = a.portfolioScope.currency.localeCompare(b.portfolioScope.currency);
      if (byCurrency) return byCurrency;
    }
    const x = metricValue(a.metrics, sort.key), y = metricValue(b.metrics, sort.key);
    return x === null ? y === null ? 0 : 1 : y === null ? -1 : (x - y) * sort.direction;
  });
  const pages = Math.max(1, Math.ceil(rows.length / pageSize)), currentPage = Math.min(page, pages);
  const visible = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selected = detail?.key === requestKey ? detail.row : null;
  useEffect(() => {
    if (!focusedCampaign) return;
    focusRef.current?.focus({ preventScroll: true });
    focusRef.current?.scrollIntoView({ block: 'start' });
  }, [focusedCampaign]);
  useEffect(() => {
    if (!selected) return;
    detailRef.current?.focus();
    detailRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);
  const value = (row, key) => formatMetric(metricValue(row.metrics, key), definitions.find((m) => m.key === key), row.metrics?.currency || row.portfolioScope?.currency || currency);
  const options = (portfolio ? PORTFOLIO_COLUMNS : COLUMNS).map(([key, label]) => [key, definitions.find((metric) => metric.key === key)?.label || label]);
  const visibleColumns = options.filter(([key]) => columns.includes(key));
  const changeSort = (key) => { setSort((old) => ({ key, direction: old.key === key ? -old.direction : key === 'name' ? 1 : -1 })); setPage(1); };
  return <section className="gia-campaigns" aria-label="Estrutura de anúncios">
    {focusedCampaign && <div className="gia-section-heading gia-campaign-focus" tabIndex={-1} ref={focusRef}>
      <div><p className="gia-caption">Campanha em foco</p>
        <strong>{grouped.campanha[0]?.name || 'Campanha sem leitura neste período'}</strong></div>
      <Link className="gia-action-link" to={clearCampaignTo}>Ver todas as campanhas</Link>
    </div>}
    <div className="gia-table-tools"><div className="gia-segments" aria-label="Nível das métricas">{LEVELS.map(([key, label]) => <button type="button" key={key} aria-label={label} aria-pressed={level === key} onClick={() => { setLevel(key); setPage(1); setDetail(null); }}>{label}<span aria-hidden="true">{grouped[key].length}</span></button>)}</div>
      <div className="gia-table-controls">
        <label className="gia-table-search" htmlFor="gia-search"><span className="sr-only">Buscar na tabela</span><Search aria-hidden="true" /><input id="gia-search" type="search" placeholder="Buscar" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></label>
        <div className="gia-table-filters">
          {!portfolio && <><label className="sr-only" htmlFor="gia-objective">Objetivo na tabela</label><select id="gia-objective" value={objective} onChange={(e) => { setObjective(e.target.value); setPage(1); }}><option value="all">Todos os objetivos</option>{Object.entries(OBJECTIVES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></>}
          <label className="sr-only" htmlFor="gia-delivery">Veiculação na tabela</label><select id="gia-delivery" value={delivery} onChange={(e) => { setDelivery(e.target.value); setPage(1); }}><option value="all">Toda veiculação</option><option value="active">Com entrega</option><option value="inactive">Sem entrega</option></select>
          <details className="gia-column-picker"><summary><SlidersHorizontal aria-hidden="true" />Colunas · {visibleColumns.length + (portfolio ? 2 : 1)}</summary><fieldset><legend className="sr-only">Colunas visíveis</legend>{options.map(([key, label]) => <label key={key}><input id={`gia-col-${key}`} type="checkbox" checked={columns.includes(key)} onChange={(e) => setColumns((old) => e.target.checked ? [...old, key] : old.filter((c) => c !== key))} />{label}</label>)}</fieldset></details>
        </div>
      </div>
    </div>
    {error ? <p className="gia-empty" role="alert">{error}</p> : !rows.length ? <p className="gia-empty">Nenhum item corresponde aos filtros deste nível.</p> : <div className="gia-table-wrap" {...(portfolio && { tabIndex: 0, role: 'region', 'aria-label': 'Tabela de métricas da carteira' })}><table><caption className="sr-only">Métricas por {level}</caption><thead><tr>
      <th aria-sort={sort.key === 'name' ? sort.direction === 1 ? 'ascending' : 'descending' : 'none'}><button type="button" aria-label="Ordenar por nome" onClick={() => changeSort('name')}>{LEVELS.find(([key]) => key === level)[2]}</button></th>
      {portfolio && <th scope="col">Cliente</th>}
      {visibleColumns.map(([key, label]) => <th key={key} className={key === 'delivery' ? undefined : 'gia-number'} aria-sort={sort.key === key ? sort.direction === 1 ? 'ascending' : 'descending' : 'none'}>{key === 'delivery' ? label : <button type="button" aria-label={`Ordenar por ${label.toLowerCase()}`} onClick={() => changeSort(key)}>{label}{sort.key === key ? sort.direction === -1 ? ' ↓' : ' ↑' : ''}</button>}</th>)}
    </tr></thead><tbody>{visible.map((row) => <tr key={portfolio ? `${row.portfolioScope.accountId}:${row.id}` : row.id}>
      <td><button type="button" className="gia-entity-name" aria-label={`Detalhes de ${row.name}`} onClick={() => setDetail({ key: requestKey, row })}>{row.name}</button>
        <small>{row.parent || row.portfolioScope?.accountName || client?.empresa}</small></td>
      {portfolio && <td>{row.portfolioScope.clientName}</td>}
      {visibleColumns.map(([key]) => <td key={key} className={key === 'delivery' ? undefined : 'gia-number'}>{key === 'delivery' ? <span className={`gia-delivery is-${row.delivery.tone}`}>{row.delivery.label}</span> : value(row, key)}</td>)}
    </tr>)}</tbody></table></div>}
    <div className="gia-pagination"><span>{rows.length ? `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, rows.length)} de ${rows.length}` : '0 itens'} · {all.length} retornados neste nível</span><label htmlFor="gia-page-size">Por página<select id="gia-page-size" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>{[10, 25, 50].map((size) => <option key={size}>{size}</option>)}</select></label><Button variant="outline" size="icon" aria-label="Página anterior" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft /></Button><span>{currentPage} / {pages}</span><Button variant="outline" size="icon" aria-label="Próxima página" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}><ChevronRight /></Button></div>
    {selected && <section className="gia-entity-detail" aria-label="Detalhes do item" ref={detailRef} tabIndex={-1}><div className="gia-section-heading"><div><p className="gia-eyebrow">{selected.portfolioScope?.clientName || client?.empresa} · somente leitura</p><h3>{selected.name}</h3></div><Button variant="ghost" size="icon" aria-label="Fechar detalhes" onClick={() => setDetail(null)}><X /></Button></div><dl className="gia-context-grid"><div><dt>Identificador</dt><dd>{selected.id}</dd></div><div><dt>Objetivo</dt><dd>{OBJECTIVES[selected.objectiveKey] || selected.objectiveKey}</dd></div><div><dt>Veiculação</dt><dd>{selected.delivery.label}</dd></div><div><dt>Período consultado</dt><dd>{periodLabel(selected.portfolioScope?.period || period)}</dd></div><div><dt>Investimento</dt><dd>{value(selected, 'spend')}</dd></div><div><dt>{portfolio ? definitions.find(({ key }) => key === resultKey)?.label : 'Leads'}</dt><dd>{value(selected, portfolio ? resultKey : 'leads')}</dd></div></dl>{selected.delivery.detail && <p>{selected.delivery.detail}</p>}</section>}
  </section>;
}
