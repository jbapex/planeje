import React, { useMemo } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { portfolioScopeKey } from '../../../supabase/functions/gestor-ia-meta/portfolio.js';
import GestorIaCampaigns from './GestorIaCampaigns';
import GestorIaCharts from './GestorIaCharts';
import GestorIaMetricCards from './GestorIaMetricCards';
import { periodLabel } from './GestorIaContext';
import { CHART_METRICS, timelineRows } from './gestorIaMetricModel';
import { buildPortfolioMetrics, loadPortfolioMetricReadings, portfolioMetricScopes } from './gestorIaPortfolioMetricModel.js';
import { useGestorRead } from './gestorIaReads';

const PORTFOLIO_METRICS = CHART_METRICS.map((metric) => ({ ...metric,
  label: { messages: 'Conversas', costMessage: 'Custo por conversa' }[metric.key] || metric.label }));

export function usePortfolioMetricReading({ clients, accountId, period, readStore, enabled, objective, goal, revision }) {
  const { scopes, sharedAccounts } = useMemo(() => portfolioMetricScopes(clients, accountId), [clients, accountId]);
  const scopeKeys = scopes.map(portfolioScopeKey).sort();
  const scope = JSON.stringify(scopeKeys);
  const { since, until } = period;
  const key = JSON.stringify(['metricas-carteira', scope, since, until, revision]);
  const recent = readStore.recentPortfolioMetrics;
  const active = enabled && scopes.length > 0;
  const subset = active && [...recent.values()].find(({ entries, requested, revision: savedRevision }) => savedRevision === revision && requested.since === since && requested.until === until &&
    scopeKeys.every((key) => entries.some((entry) => portfolioScopeKey(entry) === key)));
  const load = async () => {
    try {
      const entries = await loadPortfolioMetricReadings(supabase, scopes, { since, until });
      const saved = { entries, requested: { since, until }, revision };
      recent.set(scope, saved);
      return saved;
    } catch (error) {
      if (error.accessDenied) recent.clear();
      throw error;
    }
  };
  const read = useGestorRead(readStore, key, active, () => {
    if (!subset) return load();
    return { ...subset, entries: subset.entries.filter((entry) => scopeKeys.includes(portfolioScopeKey(entry))) };
  });
  const saved = read.data || (active && !read.error?.accessDenied ? subset || recent.get(scope) : null);
  const model = useMemo(() => buildPortfolioMetrics(scopes, saved?.entries || [], saved?.requested || { since, until }, objective, goal),
    [scopes, saved, since, until, objective, goal]);
  return { ...model, scope, key, count: scopes.length, sharedAccounts, accessDenied: read.error?.accessDenied,
    pending: Boolean(read.request), loading: active && !saved && !read.error,
    stale: Boolean(saved && (saved.revision !== revision || saved.requested.since !== since || saved.requested.until !== until)), error: read.error?.message };
}

export default function GestorIaPortfolioMetrics({ data, compare, objective, goal, validPeriod, refreshNotice }) {
  if (!validPeriod || data.accessDenied) return data.error ? <p className="gia-notice" role="alert">{data.error}</p> : null;
  const { account, period, resultKey, costKey, currency, comparison } = data;
  const rows = data.daily.length || comparison?.daily.length ? timelineRows(data.daily, compare ? comparison?.daily || [] : [], period) : [];
  const cards = [...new Set(['spend', resultKey, costKey, 'ctr', 'cpm', 'frequency'])];
  if (cards.length < 6) cards.splice(3, 0, 'impressions');
  const scope = `${data.clientsRead} ${data.clientsRead === 1 ? 'cliente' : 'clientes'} · ${data.accountsRead} de ${data.count} ${data.count === 1 ? 'conta' : 'contas'}`;
  const coverage = data.accountsRead > 0 ? `${scope} · ${periodLabel(period)}${data.partial || !data.exact ? ' · Cobertura parcial' : ''}`
    : data.loading ? 'Consultando leituras salvas…' : !data.count ? 'Nenhuma conta Meta elegível neste recorte.' : 'Sem leituras salvas neste período.';
  return <div className="gia-stack">
    <section className="gia-panel gia-metrics-overview">
      <div className="gia-portfolio-metric-status" role="status"><p>{coverage}{data.stale && ' · Último recorte consultado'}</p>
        {data.sharedAccounts > 0 && <small>{data.sharedAccounts} {data.sharedAccounts === 1 ? 'conta compartilhada fora do total' : 'contas compartilhadas fora do total'}</small>}</div>
      {data.error && <p className="gia-notice" role="alert">{data.error}</p>}
      {refreshNotice && <p className="gia-notice" role="status">{refreshNotice}</p>}
      {data.mixedCurrency && <p className="gia-notice">As contas têm moedas diferentes. Os valores aparecem por conta na tabela.</p>}
      <GestorIaMetricCards cards={cards} snapshot={account} previous={compare ? comparison?.account : null} currency={currency} rows={rows}
        live label="Indicadores da carteira" resultKey={resultKey} costKey={costKey} derived definitions={PORTFOLIO_METRICS} />
      {compare && <p className="gia-source">{comparison ? `Anterior · ${periodLabel(comparison.period)}` : 'Comparação indisponível para a cobertura deste recorte.'}</p>}
    </section>
    <GestorIaCharts key={`chart:${resultKey}:${costKey}`} state={{ ...data, loading: data.loading && !data.stale }} rows={rows} partialText="Série diária parcial no recorte salvo."
      compare={Boolean(compare && comparison)} resultKey={resultKey} costKey={costKey} definitions={PORTFOLIO_METRICS} />
    {data.tablePartial && <p className="gia-source">A estrutura salva de conjuntos ou anúncios está parcial.</p>}
    <GestorIaCampaigns key={`campaigns:${resultKey}:${costKey}`} campaigns={data.campaigns} currency={currency} period={period}
      requestKey={`${data.key}:${objective}:${goal}`} resultKey={resultKey} costKey={costKey} portfolio definitions={PORTFOLIO_METRICS} />
  </div>;
}
