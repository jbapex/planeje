import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon, RefreshCw, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { googleAdsAccountsForPicker } from '@/lib/googleAdsLinkedAccounts';
import {
  accountBalanceFromBudgets,
  campaignRates,
  dailyBarHeight,
  fillDailySeries,
  googleAdsAdLabel,
  googleAdsChannelLabel,
  googleAdsDailyHover,
  googleAdsKeywordMatchLabel,
  googleAdsKeywordsEmptyCopy,
  googleAdsStatusLabel,
} from '@/lib/googleAdsInsightsView';
import {
  isPlannerAccessDenied,
  keywordCompetitionLabel,
  keywordTrendBarHeight,
  keywordTrendHover,
  monthShortLabel,
  parseKeywordSeeds,
  plannerAccessCopy,
  seedsFromAccountKeywords,
  sortAccountKeywordStats,
  sortKeywordIdeas,
} from '@/lib/googleAdsKeywordTrends';
import GoogleAnalyticsBoard from '@/components/traffic/GoogleAnalyticsBoard';
import GoogleBusinessBoard from '@/components/traffic/GoogleBusinessBoard';
import GoogleTagBoard from '@/components/traffic/GoogleTagBoard';
import GoogleAdsWriteDialog from '@/components/traffic/GoogleAdsWriteDialog';
import './GoogleAdsInsights.css';

function formatMoney(value, currency = 'BRL') {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currency || 'BRL' }).format(Number(value));
}

function formatNumber(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return new Intl.NumberFormat('pt-BR').format(Number(value));
}

function formatPercent(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(Number(value))}%`;
}

function dayLabel(ymd) {
  const date = String(ymd || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

function DailySpendBars({ series, currency, compact = false }) {
  const points = Array.isArray(series) ? series : [];
  const [hoverDate, setHoverDate] = useState('');
  if (!points.length) return null;
  const max = Math.max(0, ...points.map((point) => Number(point.spend) || 0));
  const every = points.length <= 14 ? 1 : Math.ceil(points.length / 10);
  const hovered = points.find((point) => point.date === hoverDate) || null;
  const tip = hovered ? googleAdsDailyHover(hovered) : null;
  return (
    <div className={compact ? 'ga-daily ga-daily--compact' : 'ga-daily'}>
      {!compact ? (
        <>
          <h3>Gasto por dia</h3>
          <p>Passe o mouse no dia. Só desta conta Google Ads; não mistura com a Meta.</p>
        </>
      ) : null}
      <div
        className="ga-daily-bars"
        role="img"
        aria-label="Gasto por dia. Passe o mouse no dia para ver o valor."
        onMouseLeave={() => setHoverDate('')}
      >
        {points.map((point, index) => {
          const spend = Number(point.spend) || 0;
          const label = dayLabel(point.date);
          const show = index === 0 || index === points.length - 1 || index % every === 0;
          const on = hoverDate === point.date;
          const dayTip = googleAdsDailyHover(point);
          return (
            <div
              key={point.date}
              className={on ? 'ga-daily-col is-on' : 'ga-daily-col'}
              tabIndex={0}
              onMouseEnter={() => setHoverDate(point.date)}
              onFocus={() => setHoverDate(point.date)}
              aria-label={`${dayTip.heading}: ${formatMoney(dayTip.spend, currency)}, ${formatNumber(dayTip.clicks)} cliques`}
            >
              <div className="ga-daily-track">
                <div
                  className="ga-daily-bar"
                  style={{ height: `${dailyBarHeight(spend, max)}%` }}
                />
              </div>
              <span className={show ? 'ga-daily-label' : 'ga-daily-label ga-daily-label--gap'}>{label}</span>
              <div className="ga-daily-balloon" aria-hidden="true">
                <strong>{dayTip.heading}</strong>
                <span>Gasto <b>{formatMoney(dayTip.spend, currency)}</b></span>
                <span>Cliques <b>{formatNumber(dayTip.clicks)}</b></span>
                <span>Conv. <b>{formatNumber(dayTip.conversions)}</b></span>
              </div>
            </div>
          );
        })}
      </div>
      <div className={tip ? 'ga-daily-readout' : 'ga-daily-readout ga-daily-readout--idle'} role="status">
        {tip ? (
          <>
            <strong>{tip.heading}</strong>
            <span>Gasto {formatMoney(tip.spend, currency)}</span>
            <span>{formatNumber(tip.clicks)} cliques</span>
            <span>{formatNumber(tip.conversions)} conv.</span>
          </>
        ) : (
          <span>Passe o mouse no dia para ver gasto, cliques e conversões.</span>
        )}
      </div>
    </div>
  );
}

function KeywordTrendSpark({ monthly }) {
  const points = Array.isArray(monthly) ? monthly : [];
  const [hover, setHover] = useState(null);
  if (!points.length) return <span className="ga-trend-empty">—</span>;
  const max = Math.max(0, ...points.map((point) => Number(point.searches) || 0));
  const tip = hover ? keywordTrendHover(hover) : null;
  return (
    <div className="ga-trend-spark" onMouseLeave={() => setHover(null)}>
      {points.map((point) => {
        const on = hover?.year === point.year && hover?.month === point.month;
        return (
          <button
            key={`${point.year}-${point.month}`}
            type="button"
            className={on ? 'ga-trend-col is-on' : 'ga-trend-col'}
            aria-label={`${monthShortLabel(point.month)}/${point.year}: ${formatNumber(point.searches)} buscas`}
            onMouseEnter={() => setHover(point)}
            onFocus={() => setHover(point)}
          >
            <span style={{ height: `${keywordTrendBarHeight(point.searches, max)}%` }} />
          </button>
        );
      })}
      <span className={tip ? 'ga-trend-tip' : 'ga-trend-tip is-idle'}>
        {tip ? `${tip.heading} · ${formatNumber(tip.searches)}` : '12 meses'}
      </span>
    </div>
  );
}

function KeywordTrendsCard({ accountId, disabled }) {
  const { toast } = useToast();
  const [seedText, setSeedText] = useState('');
  const [ideas, setIdeas] = useState([]);
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filling, setFilling] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setSeedText('');
    setIdeas([]);
    setStats([]);
    setError('');
  }, [accountId]);

  const loadAccountStats = useCallback(async () => {
    if (!accountId) return [];
    setStatsLoading(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('google-ads-api', {
        body: { action: 'get-keywords', customerId: accountId, includeMetrics: true },
      });
      if (fnError) throw fnError;
      if (data?.error?.message) throw new Error(data.error.message);
      const rows = sortAccountKeywordStats(data?.keywords || []);
      setStats(rows);
      return rows;
    } catch (err) {
      setStats([]);
      throw err;
    } finally {
      setStatsLoading(false);
    }
  }, [accountId]);

  const search = useCallback(async (raw) => {
    const seeds = parseKeywordSeeds(raw);
    if (!accountId) return;
    if (!seeds.length) {
      setError('Digite pelo menos uma palavra (ex.: vestido de noiva).');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data, error: fnError } = await supabase.functions.invoke('google-ads-api', {
        body: { action: 'generate-keyword-ideas', customerId: accountId, keywords: seeds },
      });
      if (fnError) throw fnError;
      const denied = data?.error?.code === 'PLANNER_EXPLORER' || isPlannerAccessDenied(data?.error?.message);
      if (denied) throw new Error(data.error.message || 'PLANNER_EXPLORER');
      if (data?.error?.message) throw new Error(data.error.message);
      const rows = sortKeywordIdeas(data?.ideas || []);
      setIdeas(rows);
      setStats([]);
      if (!rows.length) setError('A Google não devolveu volume para essas palavras.');
    } catch (err) {
      setIdeas([]);
      const copy = plannerAccessCopy(err.message || '') || 'Não foi possível ler o Planejador.';
      setError(copy);
      if (isPlannerAccessDenied(err.message) || isPlannerAccessDenied(copy)) {
        try {
          const rows = await loadAccountStats();
          if (!rows.length) {
            setError(`${copy} Esta conta não tem palavras de Pesquisa nos últimos 30 dias.`);
          }
        } catch {
          /* keep planner copy */
        }
      } else {
        toast({ title: 'Palavras tendências', description: copy, variant: 'destructive' });
      }
    } finally {
      setLoading(false);
    }
  }, [accountId, loadAccountStats, toast]);

  const fillFromAccount = useCallback(async () => {
    if (!accountId) return;
    setFilling(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('google-ads-api', {
        body: { action: 'get-keywords', customerId: accountId },
      });
      if (fnError) throw fnError;
      if (data?.error?.message) throw new Error(data.error.message);
      const seeds = seedsFromAccountKeywords(data?.keywords || [], 8);
      if (!seeds.length) {
        setError('Esta conta não tem palavras de Pesquisa. Digite um tema (ex.: vestido de noiva).');
        return;
      }
      setSeedText(seeds.join(', '));
      await search(seeds.join('\n'));
    } catch (err) {
      setError(plannerAccessCopy(err.message) || 'Não foi possível ler as palavras da conta.');
    } finally {
      setFilling(false);
    }
  }, [accountId, search]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Palavras tendências</CardTitle>
        <p className="text-xs text-muted-foreground">
          Volume de busca no Brasil (Planejador de Palavras-chave). Não é o Google Trends e não mistura com a Meta.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="ga-trend-form">
          <input
            className="ga-trend-input"
            value={seedText}
            onChange={(e) => setSeedText(e.target.value)}
            placeholder="Ex.: vestido de noiva, buffet casamento"
            disabled={disabled || loading}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                search(seedText);
              }
            }}
          />
          <Button type="button" onClick={() => search(seedText)} disabled={disabled || loading || !accountId}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Buscar
          </Button>
          <Button type="button" variant="secondary" onClick={fillFromAccount} disabled={disabled || filling || loading || !accountId}>
            {filling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Usar palavras da conta
          </Button>
        </div>
        {error ? <p className="ga-detail-empty">{error}</p> : null}
        {statsLoading && !stats.length ? (
          <p className="ga-detail-empty">Lendo as palavras reais da conta…</p>
        ) : null}
        {stats.length ? (
          <div className="overflow-x-auto">
            <p className="text-xs text-muted-foreground mb-2">
              Palavras reais da conta nos últimos 30 dias. Não é volume de busca do Brasil.
            </p>
            <table className="ga-detail-table ga-trend-table">
              <thead>
                <tr>
                  <th>Palavra</th>
                  <th>Campanha</th>
                  <th>Correspondência</th>
                  <th>Impressões</th>
                  <th>Cliques</th>
                  <th>CTR</th>
                  <th>Investimento</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((row, index) => {
                  const rates = campaignRates(row);
                  return (
                    <tr key={row.id || `${row.text}-${row.campaignId}-${index}`}>
                      <td>{row.text}</td>
                      <td>{row.campaignName || '—'}</td>
                      <td>{googleAdsKeywordMatchLabel(row.matchType)}</td>
                      <td>{formatNumber(row.impressions)}</td>
                      <td>{formatNumber(row.clicks)}</td>
                      <td>{rates.ctr == null ? '—' : formatPercent(rates.ctr)}</td>
                      <td>{formatMoney(row.spend)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        {ideas.length ? (
          <div className="overflow-x-auto">
            <table className="ga-detail-table ga-trend-table">
              <thead>
                <tr>
                  <th>Palavra</th>
                  <th>Buscas/mês</th>
                  <th>Concorrência</th>
                  <th>CPC méd.</th>
                  <th>12 meses</th>
                </tr>
              </thead>
              <tbody>
                {ideas.map((row) => (
                  <tr key={row.text}>
                    <td>{row.text}</td>
                    <td>{row.avgMonthlySearches ? formatNumber(row.avgMonthlySearches) : '—'}</td>
                    <td>{keywordCompetitionLabel(row.competition)}</td>
                    <td>{row.averageCpc ? formatMoney(row.averageCpc) : '—'}</td>
                    <td><KeywordTrendSpark monthly={row.monthly} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DetailTable({ rows, columns, empty }) {
  if (!rows.length) {
    return <p className="ga-detail-empty">{empty}</p>;
  }
  return (
    <table className="ga-detail-table">
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.key}>{col.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            {columns.map((col) => (
              <td key={col.key}>{col.render(row)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CampaignDetail({ campaign, detail, currency, onKeyword }) {
  if (!detail || detail.loading) {
    return (
      <div className="ga-detail">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (detail?.error) {
    return (
      <div className="ga-detail">
        <p className="ga-detail-empty">{detail.error}</p>
      </div>
    );
  }
  const adGroups = detail?.adGroups || [];
  const ads = detail?.ads || [];
  const keywords = detail?.keywords || [];
  const assetGroups = detail?.assetGroups || [];
  const daily = detail?.daily || [];
  const missSpend =
    (Number(campaign?.spend) || 0) > 0
    && [...adGroups, ...ads, ...assetGroups].every((row) => (Number(row.spend) || 0) <= 0);
  const money = (value) => formatMoney(value, currency);
  return (
    <div className="ga-detail">
      {daily.length ? <DailySpendBars series={daily} currency={currency} compact /> : null}
      {missSpend ? (
        <p className="ga-detail-empty">A Google não detalha o gasto desta campanha nos grupos e anúncios. O investimento da linha de cima continua valendo.</p>
      ) : null}
      {assetGroups.length ? (
        <div className="ga-detail-block">
          <h4>Grupos de assets</h4>
          <DetailTable
            rows={assetGroups}
            empty=""
            columns={[
              { key: 'name', label: 'Nome', render: (row) => row.name },
              { key: 'status', label: 'Status', render: (row) => googleAdsStatusLabel(row.status) },
              { key: 'spend', label: 'Investimento', render: (row) => money(row.spend) },
              { key: 'clicks', label: 'Cliques', render: (row) => formatNumber(row.clicks) },
              { key: 'conv', label: 'Conv.', render: (row) => formatNumber(row.conversions) },
            ]}
          />
        </div>
      ) : null}
      <div className="ga-detail-block">
        <h4>Grupos de anúncios</h4>
        <DetailTable
          rows={adGroups}
          empty="Nenhum grupo de anúncios neste período."
          columns={[
            { key: 'name', label: 'Nome', render: (row) => row.name },
            { key: 'status', label: 'Status', render: (row) => googleAdsStatusLabel(row.status, row.primaryStatus) },
            { key: 'spend', label: 'Investimento', render: (row) => money(row.spend) },
            { key: 'clicks', label: 'Cliques', render: (row) => formatNumber(row.clicks) },
            { key: 'conv', label: 'Conv.', render: (row) => formatNumber(row.conversions) },
          ]}
        />
      </div>
      <div className="ga-detail-block">
        <h4>Anúncios</h4>
        <DetailTable
          rows={ads}
          empty="Nenhum anúncio neste período."
          columns={[
            { key: 'name', label: 'Anúncio', render: (row) => googleAdsAdLabel(row) },
            { key: 'group', label: 'Grupo', render: (row) => row.adGroupName || '—' },
            { key: 'spend', label: 'Investimento', render: (row) => money(row.spend) },
            { key: 'clicks', label: 'Cliques', render: (row) => formatNumber(row.clicks) },
            { key: 'conv', label: 'Conv.', render: (row) => formatNumber(row.conversions) },
          ]}
        />
      </div>
      <div className="ga-detail-block">
        <h4>Palavras-chave</h4>
        <DetailTable
          rows={keywords}
          empty={googleAdsKeywordsEmptyCopy(campaign?.channelType)}
          columns={[
            { key: 'text', label: 'Palavra', render: (row) => row.text },
            { key: 'match', label: 'Correspondência', render: (row) => googleAdsKeywordMatchLabel(row.matchType) },
            { key: 'group', label: 'Grupo', render: (row) => row.adGroupName || '—' },
            { key: 'spend', label: 'Investimento', render: (row) => money(row.spend) },
            { key: 'clicks', label: 'Cliques', render: (row) => formatNumber(row.clicks) },
            {
              key: 'action',
              label: '',
              render: (row) => {
                if (!onKeyword || !row.criterionId || !row.adGroupId) return '—';
                if (row.status !== 'ENABLED' && row.status !== 'PAUSED') return googleAdsStatusLabel(row.status);
                return (
                  <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => onKeyword(row)}>
                    {row.status === 'ENABLED' ? 'Pausar' : 'Ligar'}
                  </Button>
                );
              },
            },
          ]}
        />
      </div>
    </div>
  );
}

export default function GoogleAdsInsights() {
  const { toast } = useToast();
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState('all');
  const [links, setLinks] = useState([]);
  const [adAccounts, setAdAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [campaigns, setCampaigns] = useState([]);
  const [daily, setDaily] = useState([]);
  const [accountBudgets, setAccountBudgets] = useState([]);
  const [currency, setCurrency] = useState('BRL');
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [expandedId, setExpandedId] = useState('');
  const [sourceTab, setSourceTab] = useState('ads');
  const [writeOpen, setWriteOpen] = useState(false);
  const [writeDraft, setWriteDraft] = useState(null);
  const [details, setDetails] = useState({});
  const [date, setDate] = useState({
    from: new Date(new Date().setDate(new Date().getDate() - 30)),
    to: new Date(),
  });

  useEffect(() => {
    (async () => {
      setLoadingClients(true);
      const { data: linked, error } = await supabase
        .from('cliente_google_ads_accounts')
        .select('cliente_id, google_customer_id, google_customer_name')
        .eq('is_active', true);
      if (error) {
        setLinks([]);
        setClients([]);
        setLoadingClients(false);
        return;
      }
      const rows = linked || [];
      setLinks(rows);
      const ids = [...new Set(rows.map((row) => row.cliente_id).filter(Boolean))];
      if (!ids.length) {
        setClients([]);
        setLoadingClients(false);
        return;
      }
      const { data } = await supabase.from('clientes').select('id, empresa').in('id', ids).eq('etapa', 'closed').order('empresa');
      setClients(data || []);
      setLoadingClients(false);
    })();
  }, []);

  const loadAccountsForClient = useCallback(() => {
    setLoadingAccounts(true);
    setSelectedAccount('');
    setCampaigns([]);
    setDaily([]);
    setAccountBudgets([]);
    setHasLoaded(false);
    setExpandedId('');
    setDetails({});
    const mapped = googleAdsAccountsForPicker(links, selectedClient);
    setAdAccounts(mapped);
    if (mapped.length === 1) setSelectedAccount(mapped[0].id);
    setLoadingAccounts(false);
  }, [links, selectedClient]);

  useEffect(() => {
    loadAccountsForClient();
  }, [loadAccountsForClient]);

  const fetchCampaigns = useCallback(async () => {
    if (!selectedAccount) return;
    if (!date?.from || !isValid(date.from) || !date?.to || !isValid(date.to)) {
      toast({ title: 'Período inválido', variant: 'destructive' });
      return;
    }

    setLoading(true);
    setExpandedId('');
    setDetails({});
    try {
      const { data, error } = await supabase.functions.invoke('google-ads-api', {
        body: {
          action: 'get-campaigns',
          customerId: selectedAccount,
          time_range: {
            since: format(date.from, 'yyyy-MM-dd'),
            until: format(date.to, 'yyyy-MM-dd'),
          },
        },
      });
      if (error) throw error;
      if (data?.error?.message) {
        throw new Error(data.error.message);
      }
      setCampaigns(data?.campaigns || []);
      setDaily(Array.isArray(data?.daily) ? data.daily : []);
      setAccountBudgets(data?.accountBudgets || []);
      setCurrency(data?.currency || 'BRL');
      setHasLoaded(true);
    } catch (err) {
      toast({
        title: 'Erro ao carregar campanhas',
        description: err.message,
        variant: 'destructive',
      });
      setCampaigns([]);
      setDaily([]);
      setAccountBudgets([]);
      setHasLoaded(false);
    } finally {
      setLoading(false);
    }
  }, [selectedAccount, date.from, date.to]);

  useEffect(() => {
    if (!selectedAccount || loadingAccounts) return undefined;
    fetchCampaigns();
    return undefined;
  }, [selectedAccount, loadingAccounts, fetchCampaigns]);

  const loadCampaignDetail = useCallback(async (campaignId) => {
    if (!selectedAccount || !campaignId) return;
    if (!date?.from || !isValid(date.from) || !date?.to || !isValid(date.to)) return;
    setDetails((prev) => ({ ...prev, [campaignId]: { ...(prev[campaignId] || {}), loading: true, error: '' } }));
    try {
      const { data, error } = await supabase.functions.invoke('google-ads-api', {
        body: {
          action: 'get-campaign-detail',
          customerId: selectedAccount,
          campaignId,
          time_range: {
            since: format(date.from, 'yyyy-MM-dd'),
            until: format(date.to, 'yyyy-MM-dd'),
          },
        },
      });
      if (error) throw error;
      if (data?.error?.message) throw new Error(data.error.message);
      setDetails((prev) => ({
        ...prev,
        [campaignId]: {
          loading: false,
          error: '',
          adGroups: data?.adGroups || [],
          ads: data?.ads || [],
          keywords: data?.keywords || [],
          assetGroups: data?.assetGroups || [],
          daily: fillDailySeries(
            format(date.from, 'yyyy-MM-dd'),
            format(date.to, 'yyyy-MM-dd'),
            data?.daily || []
          ),
        },
      }));
    } catch (err) {
      setDetails((prev) => ({
        ...prev,
        [campaignId]: { loading: false, error: err.message || 'Não foi possível abrir a campanha.', adGroups: [], ads: [], keywords: [], assetGroups: [], daily: [] },
      }));
    }
  }, [selectedAccount, date.from, date.to]);

  const toggleCampaign = useCallback((campaignId) => {
    setExpandedId((current) => {
      const next = current === campaignId ? '' : campaignId;
      if (next) {
        const cached = details[next];
        if (!cached || cached.error) loadCampaignDetail(next);
      }
      return next;
    });
  }, [details, loadCampaignDetail]);

  const balance = useMemo(() => accountBalanceFromBudgets(accountBudgets), [accountBudgets]);
  const dailySeries = useMemo(
    () => fillDailySeries(
      date?.from && isValid(date.from) ? format(date.from, 'yyyy-MM-dd') : '',
      date?.to && isValid(date.to) ? format(date.to, 'yyyy-MM-dd') : '',
      daily
    ),
    [daily, date.from, date.to]
  );
  const totalSpend = campaigns.reduce((s, c) => s + (c.spend || 0), 0);
  const totalClicks = campaigns.reduce((s, c) => s + (c.clicks || 0), 0);
  const totalConversions = campaigns.reduce((s, c) => s + (Number(c.conversions) || 0), 0);
  const totalImpressions = campaigns.reduce((s, c) => s + (c.impressions || 0), 0);
  const totals = campaignRates({ spend: totalSpend, clicks: totalClicks, impressions: totalImpressions, conversions: totalConversions });

  const periodSince = date?.from && isValid(date.from) ? format(date.from, 'yyyy-MM-dd') : '';
  const periodUntil = date?.to && isValid(date.to) ? format(date.to, 'yyyy-MM-dd') : '';
  const saldoLabel = !hasLoaded
    ? '—'
    : balance.unlimited
      ? 'Ilimitado'
      : balance.available
        ? formatMoney(balance.remaining, currency)
        : 'Indisponível';

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Google Ads, Analytics, Meu Negócio e Tag Manager ficam em abas separadas, abaixo do cliente e da data. Nesta aba dá para pausar, ligar ou mudar o orçamento de uma campanha, e pausar uma palavra-chave, sempre com confirmação. A Meta continua no fluxo atual.
      </p>
      <div className="flex flex-wrap gap-4 items-end">
        <div className="min-w-[200px]">
          <label className="text-sm font-medium text-muted-foreground block mb-2">Cliente</label>
          <Select value={selectedClient} onValueChange={setSelectedClient} disabled={loadingClients}>
            <SelectTrigger>
              <SelectValue placeholder="Todos os clientes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Clientes com Google Ads vinculado</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.empresa}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-[220px]">
          <label className="text-sm font-medium text-muted-foreground block mb-2">Conta Google Ads</label>
          <Select
            value={selectedAccount}
            onValueChange={setSelectedAccount}
            disabled={loadingAccounts || adAccounts.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder={loadingAccounts ? 'Carregando…' : 'Selecione a conta'} />
            </SelectTrigger>
            <SelectContent>
              {adAccounts.map((acc) => (
                <SelectItem key={acc.id} value={acc.id}>
                  {acc.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              <CalendarIcon className="h-4 w-4" />
              {date?.from && date?.to
                ? `${format(date.from, 'dd/MM/yy', { locale: ptBR })} – ${format(date.to, 'dd/MM/yy', { locale: ptBR })}`
                : 'Período'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={{ from: date.from, to: date.to }}
              onSelect={(range) => {
                if (range?.from) setDate({ from: range.from, to: range.to || range.from });
              }}
              locale={ptBR}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>

        <Button onClick={fetchCampaigns} disabled={loading || !selectedAccount}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Atualizar
        </Button>
      </div>

      <div className="ga-source-tabs" role="tablist" aria-label="Leitura do Google">
        {[['ads', 'Google Ads'], ['analytics', 'Analytics'], ['business', 'Meu Negócio'], ['tag', 'Tag Manager']].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={sourceTab === id} onClick={() => setSourceTab(id)}>{label}</button>
        ))}
      </div>

      {sourceTab === 'analytics' ? (
        <GoogleAnalyticsBoard clienteId={selectedClient} since={periodSince} until={periodUntil} />
      ) : null}
      {sourceTab === 'business' ? (
        <GoogleBusinessBoard clienteId={selectedClient} since={periodSince} until={periodUntil} />
      ) : null}
      {sourceTab === 'tag' ? <GoogleTagBoard clienteId={selectedClient} /> : null}

      {sourceTab === 'ads' ? <>
      {selectedClient !== 'all' && adAccounts.length === 0 && !loadingAccounts && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          Este cliente não tem contas Google Ads vinculadas. Vá em <strong>Cadastro do cliente → Contas Google Ads</strong> para vincular.
        </p>
      )}
      {selectedClient === 'all' && adAccounts.length === 0 && !loadingAccounts && !loadingClients && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          Nenhum cliente com Google Ads vinculado. A Meta continua igual; o Google só entra nas contas já ligadas.
        </p>
      )}

      {(hasLoaded || loading) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Saldo disponível</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{loading && !hasLoaded ? '…' : saldoLabel}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {balance.unlimited
                  ? 'Conta faturada sem teto neste orçamento.'
                  : balance.available
                    ? `Limite ${formatMoney(balance.limit, currency)} · já usado ${formatMoney(balance.served, currency)}`
                    : 'O Google não publicou orçamento de conta nesta MCC.'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Investimento no período</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatMoney(totalSpend, currency)}</p>
              <p className="text-xs text-muted-foreground mt-1">Não mistura com o gasto da Meta.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Cliques · CTR</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatNumber(totalClicks)}</p>
              <p className="text-xs text-muted-foreground mt-1">CTR {formatPercent(totals.ctr)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Conversões · custo</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatNumber(totalConversions)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {totals.costPerConversion != null ? formatMoney(totals.costPerConversion, currency) : '—'} / conv.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {hasLoaded && dailySeries.length > 0 ? (
        <Card>
          <DailySpendBars series={dailySeries} currency={currency} />
        </Card>
      ) : null}

      {selectedAccount ? (
        <KeywordTrendsCard accountId={selectedAccount} disabled={loadingAccounts} />
      ) : null}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campanha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Orç. / dia</TableHead>
                <TableHead className="text-right">Investimento</TableHead>
                <TableHead className="text-right">Impressões</TableHead>
                <TableHead className="text-right">Cliques</TableHead>
                <TableHead className="text-right">CTR</TableHead>
                <TableHead className="text-right">CPC</TableHead>
                <TableHead className="text-right">Conv.</TableHead>
                <TableHead className="text-right">Custo/conv.</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && !hasLoaded ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : campaigns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center py-12 text-muted-foreground">
                    Selecione a conta. O período filtra o investimento; saldo e orçamento vêm da conta.
                  </TableCell>
                </TableRow>
              ) : (
                campaigns.map((c) => {
                  const rates = campaignRates(c);
                  const budget = c.dailyBudget > 0
                    ? formatMoney(c.dailyBudget, currency)
                    : c.totalBudget > 0
                      ? `Total ${formatMoney(c.totalBudget, currency)}`
                      : '—';
                  const open = expandedId === c.id;
                  return (
                    <React.Fragment key={c.id}>
                    <TableRow>
                      <TableCell className="font-medium min-w-[220px]">
                        <div className="flex items-start gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="ga-open shrink-0 mt-0.5"
                            aria-expanded={open}
                            aria-label={open ? 'Fechar campanha' : 'Abrir campanha'}
                            onClick={() => toggleCampaign(c.id)}
                          >
                            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </Button>
                          <span>
                            {c.name}
                            {c.budgetShared ? <span className="block text-xs text-muted-foreground">Orçamento compartilhado</span> : null}
                            <span className="mt-1 flex flex-wrap gap-1">
                              {c.status === 'ENABLED' || c.status === 'PAUSED' ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => {
                                    setWriteDraft({
                                      kind: 'campaign-status',
                                      customerId: selectedAccount,
                                      campaignId: c.id,
                                      status: c.status === 'ENABLED' ? 'PAUSED' : 'ENABLED',
                                      name: c.name,
                                    });
                                    setWriteOpen(true);
                                  }}
                                >
                                  {c.status === 'ENABLED' ? 'Pausar' : 'Ligar'}
                                </Button>
                              ) : null}
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs"
                                onClick={() => {
                                  setWriteDraft({
                                    kind: 'campaign-budget',
                                    customerId: selectedAccount,
                                    budgetResource: c.budgetResource,
                                    budgetShared: c.budgetShared,
                                    budgetReais: c.dailyBudget > 0 ? c.dailyBudget : '',
                                    name: c.name,
                                  });
                                  setWriteOpen(true);
                                }}
                              >
                                Orçamento
                              </Button>
                            </span>
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{googleAdsChannelLabel(c.channelType)}</TableCell>
                      <TableCell>
                        <Badge variant={c.status === 'ENABLED' ? 'default' : 'secondary'}>
                          {googleAdsStatusLabel(c.status, c.primaryStatus)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">{budget}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{formatMoney(c.spend, currency)}</TableCell>
                      <TableCell className="text-right">{formatNumber(c.impressions)}</TableCell>
                      <TableCell className="text-right">{formatNumber(c.clicks)}</TableCell>
                      <TableCell className="text-right">{formatPercent(rates.ctr)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{formatMoney(rates.cpc, currency)}</TableCell>
                      <TableCell className="text-right">{formatNumber(c.conversions)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{formatMoney(rates.costPerConversion, currency)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{formatMoney(c.conversionValue, currency)}</TableCell>
                    </TableRow>
                    {open ? (
                      <TableRow>
                        <TableCell colSpan={12} className="p-0">
                          <CampaignDetail
                            campaign={c}
                            detail={details[c.id]}
                            currency={currency}
                            onKeyword={(row) => {
                              setWriteDraft({
                                kind: 'keyword-status',
                                customerId: selectedAccount,
                                adGroupId: row.adGroupId,
                                criterionId: row.criterionId,
                                status: row.status === 'ENABLED' ? 'PAUSED' : 'ENABLED',
                                name: row.text,
                              });
                              setWriteOpen(true);
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    ) : null}
                    </React.Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      </> : null}
      <GoogleAdsWriteDialog
        open={writeOpen}
        onOpenChange={setWriteOpen}
        draft={writeDraft}
        onConfirm={async (payload) => {
          const { data, error } = await supabase.functions.invoke('google-ads-api', {
            body: { action: 'update-google-ads', ...payload },
          });
          if (error) throw new Error(error.message || 'O Google recusou a alteração.');
          if (data?.error?.message) throw new Error(data.error.message);
          toast({ title: 'Google Ads atualizado', description: 'A conta foi lida de novo.' });
          await fetchCampaigns();
        }}
      />
    </div>
  );
}
