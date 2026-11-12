import React, { useMemo } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { readClienteMetaResumo } from '@/lib/clienteMetaSnapshot';
import { loadGestorAccountsOverview, loadGestorMetrics } from './gestorIaData';
import { overviewKey, useGestorRead } from './gestorIaReads';
import { filterSavedMetaHistory } from './gestorIaHistoryView';
import { metricValue, objectiveMetricKeys, previousPeriod, timelineRows } from './gestorIaMetricModel';
import { periodLabel } from './GestorIaContext';
import { metaRefreshNotice } from './GestorIaRefresh';
import { RecordedEvolution } from './GestorIaReports';
import GestorIaCharts from './GestorIaCharts';
import GestorIaCampaigns from './GestorIaCampaigns';
import GestorIaMetricCards from './GestorIaMetricCards';

const samePeriod = (a, b) => a && b && a.since === b.since && a.until === b.until;

export function useGestorIaMetrics({ client, query, readStore, accountId, canReadMeta, validPeriod, compare, eager = true }, enabled) {
  const linked = client?.metaAccounts?.some((account) => account.meta_account_id === accountId);
  const live = Boolean(canReadMeta && linked);
  const scope = JSON.stringify([client?.id, accountId]);
  const { since, until } = query.period;
  const key = JSON.stringify(['metricas', scope, since, until]);
  const active = enabled && live && validPeriod;
  const recent = readStore.recentMetrics;
  const cached = active ? recent.get(scope) : null;
  const local = useMemo(() => {
    if (!cached?.history) return null;
    const filtered = filterSavedMetaHistory(cached.history, { since, until });
    if (filtered && !cached.derived && samePeriod(cached.period, filtered.period) && Date.parse(cached.fetchedAt) >= Date.parse(filtered.fetchedAt)) {
      return { ...cached, exact: filtered.exact, comparison: cached.comparison || filtered.comparison,
        refreshStatus: undefined, retryAt: undefined, overview: undefined };
    }
    return filtered;
  }, [cached, since, until]);
  const read = async (refresh = false) => {
    if (!refresh && local) return local;
    try {
      const result = await loadGestorMetrics(supabase, { ...query, accountId, refresh, compare });
      if (result.fetchedAt && Date.parse(result.fetchedAt) >= (Date.parse(recent.get(scope)?.fetchedAt) || 0)) recent.set(scope, result);
      return result;
    } catch (error) {
      if (error?.accessDenied) recent.delete(scope);
      throw error;
    }
  };
  const entry = useGestorRead(readStore, key, active, read, eager);
  const previous = active && !entry.error?.accessDenied && recent.get(scope);
  const savedTotal = entry.data?.derived && !local?.derived && samePeriod(local?.period, entry.data.period) &&
    Date.parse(local.fetchedAt) >= Date.parse(entry.data.fetchedAt);
  const useLocal = local && !entry.error?.accessDenied && (!entry.data?.fetchedAt ||
    !entry.data.exact && local.exact || savedTotal || Date.parse(local.fetchedAt) > Date.parse(entry.data.fetchedAt));
  const reading = useLocal ? local : entry.data?.fetchedAt ? entry.data : previous ? { ...previous, exact: false } : entry.data || {};
  const refresh = async () => {
    const result = await entry.reload(() => read(true));
    if (result?.overview) {
      void readStore.run(overviewKey(client.id), () => loadGestorAccountsOverview(supabase, query), true);
    }
  };
  return { linked, live, key, refresh, pending: Boolean(entry.request), refreshing: entry.refreshing === true, canRefresh: active,
    current: { ...reading, refreshStatus: entry.data?.refreshStatus, retryAt: entry.data?.retryAt,
      loading: Boolean(entry.request) && !reading.fetchedAt, error: entry.error?.message, accessDenied: entry.error?.accessDenied } };
}

export default function GestorIaMetrics(props) {
  return <GestorIaMetricsView {...props} />;
}

export function GestorIaMetricsView({ client, query, accountId, canReadMeta, validPeriod, reviews, compare, activity, target, data, focusedCampaign, clearCampaignTo }) {
  const { canViewField } = useAuth();
  const { linked, live, key, current } = data;
  const rawSaved = !current.accessDenied && canViewField?.('meta_resumo') === true ? readClienteMetaResumo(client) : null;
  const saved = rawSaved && !rawSaved.permError && !rawSaved.rateLimited && !rawSaved.errorMessage && metricValue(rawSaved, 'spend') !== null ? rawSaved : null;
  const detailed = Boolean(current.fetchedAt);
  const snapshot = detailed ? current.account || current.snapshot : saved;
  const visiblePeriod = current.period || query.period;
  const { resultKey, costKey } = objectiveMetricKeys(client.objetivo_meta);
  const cards = live ? ['spend', resultKey, costKey, 'ctr', 'cpm', 'frequency'] : ['spend', 'messages', 'leads', 'purchases', 'impressions', 'clicks'];
  const currency = detailed ? current.account?.currency || '' : saved?.currency || '';
  const compareTotals = Boolean(compare && current.account && current.comparison?.account);
  const chartRows = detailed ? timelineRows(current.daily || [], compare ? current.comparison?.daily || [] : [], visiblePeriod) : [];
  const chartPeriod = current.comparison?.period || previousPeriod(visiblePeriod);
  const refreshNotice = metaRefreshNotice(current);
  const focusAvailable = !focusedCampaign || !current.accessDenied && samePeriod(current.period, query.period);
  return <div className="gia-stack">
    <section className="gia-panel gia-metrics-overview">
      {canReadMeta && accountId && !linked ? <p role="alert">Conta indisponível para este cliente.</p> : <>
        {!detailed && saved && <p className="gia-source">Resumo salvo do cliente · {periodLabel(saved.period)}</p>}
        {detailed && current.exact === false && <p className="gia-source">Dados disponíveis · {periodLabel(visiblePeriod)}. O recorte selecionado ainda não está completo.</p>}
        {!detailed && !saved && <p className="gia-source">{current.loading ? 'Carregando leitura salva…' : 'Sem leitura salva para esta conta.'}</p>}
        {refreshNotice && <p className="gia-notice" role="status">{refreshNotice}</p>}
        {current.error && <p className="gia-notice" role="alert">{current.error}</p>}
        {detailed && !current.account && current.snapshot && <p className="gia-notice">Os cartões usam somente as campanhas retornadas.</p>}
        {compare && (current.comparison?.error || detailed && !current.comparison) && <p className="gia-notice">{current.comparison?.error || 'O período anterior ainda não tem leitura salva.'}</p>}
        <GestorIaMetricCards cards={cards} snapshot={snapshot} previous={compareTotals ? current.comparison.account : null} currency={currency} rows={chartRows}
          live={live} label={detailed ? 'Indicadores da Meta Ads' : 'Indicadores do resumo salvo'} resultKey={resultKey} costKey={costKey} target={target} derived={current.derived} />
        {compareTotals && <p className="gia-source gia-comparison-period">Anterior · {periodLabel(chartPeriod)}</p>}
      </>}
    </section>
    <div className={activity ? 'gia-client-evolution' : undefined}>
      {live && validPeriod ? <GestorIaCharts key={client.id} state={{ ...current, loading: false, period: visiblePeriod }} rows={chartRows} compare={compare} resultKey={resultKey} spacious={Boolean(activity)} /> : <RecordedEvolution state={reviews} />}
      {activity}
    </div>
    {live && validPeriod && <>
      {current.partial && <p className="gia-notice">A Meta retornou uma parte da estrutura de campanhas.</p>}
      <GestorIaCampaigns key={focusedCampaign || 'all'} campaigns={focusAvailable ? current.campaigns || [] : []}
        currency={currency} period={visiblePeriod} client={client} requestKey={key} resultKey={resultKey} costKey={costKey}
        focusedCampaign={focusedCampaign} clearCampaignTo={clearCampaignTo}
        error={detailed ? current.campaignsError : 'Ainda não há campanhas salvas para esta conta.'} />
    </>}
  </div>;
}
