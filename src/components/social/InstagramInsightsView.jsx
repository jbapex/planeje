import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { isSnapshotFresh, readSnapshotEntry } from '@/lib/socialSnapshotCache';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  Users,
  Eye,
  Heart,
  MapPin,
  Globe2,
  MousePointerClick,
} from 'lucide-react';
import { format, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { emptyPaid, fetchPaidTraffic } from '@/lib/metaPaidTrafficInsights';
import PaidTrafficPanel from './PaidTrafficPanel';
import './ClientSocialProfile.css';

const formatNumber = (value) => {
  const num = typeof value === 'number' ? value : parseFloat(value);
  if (!Number.isFinite(num)) return '—';
  return new Intl.NumberFormat('pt-BR').format(num);
};

const GENDER_LABELS = {
  F: 'Mulheres',
  M: 'Homens',
  U: 'Não informado',
  FEMALE: 'Mulheres',
  MALE: 'Homens',
  UNKNOWN: 'Não informado',
};

const COUNTRY_LABELS = {
  BR: 'Brasil',
  US: 'EUA',
  PT: 'Portugal',
  AR: 'Argentina',
  PY: 'Paraguai',
  UY: 'Uruguai',
  CL: 'Chile',
  BO: 'Bolívia',
  PE: 'Peru',
  CO: 'Colômbia',
  MX: 'México',
  ES: 'Espanha',
  IN: 'Índia',
  NG: 'Nigéria',
};

function labelDemo(kind, raw) {
  const value = String(raw || '').trim();
  if (!value) return '—';
  if (kind === 'gender') return GENDER_LABELS[value.toUpperCase()] || value;
  if (kind === 'country') return COUNTRY_LABELS[value.toUpperCase()] || value;
  return value;
}

function insightValue(insight) {
  if (!insight) return 0;
  if (insight.total_value && insight.total_value.value != null) {
    return Number(insight.total_value.value) || 0;
  }
  if (insight.value != null && insight.value !== '') {
    return Number(insight.value) || 0;
  }
  if (Array.isArray(insight.values) && insight.values.length) {
    if (insight.name === 'follower_count') {
      return Number(insight.values[insight.values.length - 1]?.value) || 0;
    }
    return insight.values.reduce((sum, entry) => sum + (Number(entry?.value) || 0), 0);
  }
  return 0;
}

async function enrichMediaWithInsights(mediaItems, limit = 10) {
  const slice = (mediaItems || []).slice(0, limit);
  const enriched = await Promise.all(
    slice.map(async (item) => {
      try {
        const { data, error } = await supabase.functions.invoke('meta-ads-api', {
          body: {
            action: 'get-instagram-media-insights',
            media_id: item.id,
            media_type: item.media_type,
          },
        });
        if (error || data?.error) return item;
        const map = {};
        for (const row of data?.insights || []) {
          map[row.name] = insightValue(row);
        }
        return {
          ...item,
          insights: {
            ...(item.insights || {}),
            reach: map.reach ?? item.insights?.reach,
            total_interactions: map.total_interactions,
            likes: map.likes ?? item.like_count,
            comments: map.comments ?? item.comments_count,
          },
        };
      } catch {
        return item;
      }
    })
  );
  const rest = (mediaItems || []).slice(limit);
  return [...enriched, ...rest];
}

function DemoBars({ title, icon: Icon, items, kind }) {
  const total = useMemo(
    () => (items || []).reduce((sum, row) => sum + (Number(row.value) || 0), 0),
    [items]
  );
  if (!items?.length) return null;

  return (
    <div className="ig-audience-panel">
      <div className="ig-audience-panel-head">
        {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
        <h5>{title}</h5>
      </div>
      <ul className="ig-audience-bars">
        {items.map((row) => {
          const value = Number(row.value) || 0;
          const pct = total > 0 ? (value / total) * 100 : 0;
          return (
            <li key={`${kind}-${row.label}`}>
              <div className="ig-audience-bar-meta">
                <span>{labelDemo(kind, row.label)}</span>
                <strong>
                  {formatNumber(value)}
                  <em>{pct >= 0.5 ? ` · ${pct.toFixed(0)}%` : ''}</em>
                </strong>
              </div>
              <div className="ig-audience-bar-track">
                <div className="ig-audience-bar-fill" style={{ width: `${Math.max(pct, 2)}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const InstagramInsightsView = ({
  clientId = null,
  instagramId,
  instagramName,
  dateRange,
  cacheKey,
  getCachedData,
  setCachedData,
  followersFallback = null,
  onOpenMedia = null,
  showPaid = true,
  liveMeta = true,
}) => {
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [audience, setAudience] = useState(null);
  const [audienceNote, setAudienceNote] = useState(null);
  const [paid, setPaid] = useState(emptyPaid());
  const [metrics, setMetrics] = useState({
    reach: 0,
    followers: 0,
    profileViews: 0,
    websiteClicks: 0,
    accountsEngaged: 0,
    engagement: 0,
  });

  const { toast } = useToast();

  const fetchInsights = useCallback(async (forceRefresh = false) => {
    if (!instagramId || !dateRange?.from || !dateRange?.to || !isValid(dateRange.from) || !isValid(dateRange.to)) {
      return;
    }

    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (dateRange.to > today) {
      toast({
        title: 'Período inválido',
        description: 'Não é possível buscar dados de datas futuras. Selecione um período até hoje.',
        variant: 'destructive',
      });
      setLoading(false);
      return;
    }

    setLoading(true);

    const insightsCacheKey = `${cacheKey}_v5`;
    const applyCache = () => {
      const cached = getCachedData(insightsCacheKey);
      if (!cached?.metrics) return false;
      setMedia(cached.media || []);
      setMetrics(cached.metrics);
      setAudience(cached.audience || null);
      setAudienceNote(cached.audienceNote || null);
      setPaid(cached.paid || emptyPaid());
      return true;
    };

    try {
      const cachedOk = applyCache();
      if (cachedOk) setLoading(false);
      if (!liveMeta) {
        setLoading(false);
        return;
      }
      const entry = readSnapshotEntry(insightsCacheKey);
      if (!forceRefresh && cachedOk && isSnapshotFresh(entry?.timestamp)) {
        return;
      }
      if (!cachedOk) setLoading(true);

      const timeRange = {
        since: format(dateRange.from, 'yyyy-MM-dd'),
        until: format(dateRange.to, 'yyyy-MM-dd'),
      };

      const [insightsResponse, audienceResponse, mediaResponse, paidData] = await Promise.all([
        supabase.functions.invoke('meta-ads-api', {
          body: {
            action: 'get-instagram-insights',
            instagram_account_id: instagramId,
            time_range: timeRange,
            metrics: [
              'reach',
              'profile_views',
              'website_clicks',
              'total_interactions',
              'accounts_engaged',
            ],
          },
        }),
        supabase.functions.invoke('meta-ads-api', {
          body: {
            action: 'get-instagram-audience',
            instagram_account_id: instagramId,
            timeframe: 'this_month',
          },
        }),
        supabase.functions.invoke('meta-ads-api', {
          body: {
            action: 'get-instagram-media',
            instagram_account_id: instagramId,
            time_range: timeRange,
          },
        }),
        showPaid ? fetchPaidTraffic({ clientId, timeRange }) : Promise.resolve(emptyPaid()),
      ]);

      if (insightsResponse.error) throw insightsResponse.error;
      if (insightsResponse.data?.error) throw new Error(insightsResponse.data.error.message);

      const insightsData = insightsResponse.data?.insights || [];
      const processedMetrics = {
        reach: 0,
        followers: Number(followersFallback) || 0,
        profileViews: 0,
        websiteClicks: 0,
        accountsEngaged: 0,
        engagement: 0,
      };

      for (const insight of insightsData) {
        const metricValue = insightValue(insight);
        switch (insight.name) {
          case 'reach':
            processedMetrics.reach = metricValue;
            break;
          case 'followers_current':
            processedMetrics.followers = metricValue || processedMetrics.followers;
            break;
          case 'follower_count':
            if (!processedMetrics.followers) processedMetrics.followers = metricValue;
            break;
          case 'profile_views':
            processedMetrics.profileViews = metricValue;
            break;
          case 'website_clicks':
            processedMetrics.websiteClicks = metricValue;
            break;
          case 'accounts_engaged':
            processedMetrics.accountsEngaged = metricValue;
            break;
          case 'total_interactions':
            processedMetrics.engagement = metricValue;
            break;
          default:
            break;
        }
      }

      if (!processedMetrics.followers && followersFallback != null) {
        processedMetrics.followers = Number(followersFallback) || 0;
      }

      let nextAudience = null;
      let nextAudienceNote = null;
      if (!audienceResponse.error && audienceResponse.data?.audience) {
        nextAudience = audienceResponse.data.audience;
      } else if (audienceResponse.data?.error?.message) {
        nextAudienceNote = audienceResponse.data.error.message;
      }

      let mediaData = [];
      if (!mediaResponse.error && !mediaResponse.data?.error) {
        mediaData = mediaResponse.data?.media || [];
      }
      mediaData = await enrichMediaWithInsights(mediaData, 10);

      setMedia(mediaData);
      setMetrics(processedMetrics);
      setAudience(nextAudience);
      setAudienceNote(nextAudienceNote);
      setPaid(paidData);
      setCachedData(insightsCacheKey, {
        insights: insightsData,
        media: mediaData,
        metrics: processedMetrics,
        audience: nextAudience,
        audienceNote: nextAudienceNote,
        paid: paidData,
      });
    } catch (err) {
      console.error('Erro ao buscar insights do Instagram:', err);
      if (!applyCache()) {
        toast({
          title: 'Erro ao buscar insights',
          description: err.message || 'Erro desconhecido',
          variant: 'destructive',
        });
      }
    } finally {
      setLoading(false);
    }
  }, [instagramId, dateRange, cacheKey, getCachedData, setCachedData, toast, followersFallback, clientId, showPaid, liveMeta]);

  useEffect(() => {
    void fetchInsights(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instagramId, dateRange?.from, dateRange?.to, followersFallback, clientId, liveMeta]);

  const followerDemo = audience?.followers || null;
  const hasFollowerDemo = Boolean(
    followerDemo &&
      (followerDemo.age?.length || followerDemo.gender?.length || followerDemo.city?.length || followerDemo.country?.length)
  );

  if (loading) {
    return (
      <Card className="dark:bg-gray-800">
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            <span className="ml-2 dark:text-gray-400">Carregando insights…</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card className="dark:bg-gray-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium dark:text-gray-300">Alcance</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold dark:text-white">{formatNumber(metrics.reach)}</div>
            <p className="text-xs text-muted-foreground mt-1">Contas alcançadas no período</p>
          </CardContent>
        </Card>

        <Card className="dark:bg-gray-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium dark:text-gray-300">Visitas ao perfil</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold dark:text-white">{formatNumber(metrics.profileViews)}</div>
            <p className="text-xs text-muted-foreground mt-1">Visualizações do perfil (orgânico)</p>
          </CardContent>
        </Card>

        <Card className="dark:bg-gray-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium dark:text-gray-300">Cliques no link da bio</CardTitle>
            <MousePointerClick className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold dark:text-white">{formatNumber(metrics.websiteClicks)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.websiteClicks
                ? 'Toques no site do perfil'
                : 'Zero no período (ou site não cadastrado na Meta)'}
            </p>
          </CardContent>
        </Card>

        <Card className="dark:bg-gray-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium dark:text-gray-300">Seguidores</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold dark:text-white">{formatNumber(metrics.followers)}</div>
            <p className="text-xs text-muted-foreground mt-1">Total atual da conta</p>
          </CardContent>
        </Card>

        <Card className="dark:bg-gray-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium dark:text-gray-300">Engajamento</CardTitle>
            <Heart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold dark:text-white">{formatNumber(metrics.engagement)}</div>
            <p className="text-xs text-muted-foreground mt-1">Interações totais no período</p>
          </CardContent>
        </Card>

        <Card className="dark:bg-gray-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium dark:text-gray-300">Contas engajadas</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold dark:text-white">{formatNumber(metrics.accountsEngaged)}</div>
            <p className="text-xs text-muted-foreground mt-1">Contas únicas que interagiram</p>
          </CardContent>
        </Card>
      </div>

      {showPaid && typeof PaidTrafficPanel === 'function' ? <PaidTrafficPanel paid={paid} /> : null}

      {hasFollowerDemo ? (
        <Card className="dark:bg-gray-800">
          <CardHeader>
            <CardTitle className="dark:text-white">Público dos seguidores</CardTitle>
            <p className="text-sm text-muted-foreground">
              Idade, gênero e localização (Meta · demografia dos seguidores)
            </p>
          </CardHeader>
          <CardContent>
            <div className="ig-audience-grid">
              <DemoBars title="Idade" icon={Users} items={followerDemo.age} kind="age" />
              <DemoBars title="Gênero" icon={Users} items={followerDemo.gender} kind="gender" />
              <DemoBars title="Cidades" icon={MapPin} items={followerDemo.city} kind="city" />
              <DemoBars title="Países" icon={Globe2} items={followerDemo.country} kind="country" />
            </div>
          </CardContent>
        </Card>
      ) : audienceNote ? (
        <Card className="dark:bg-gray-800">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{audienceNote}</p>
          </CardContent>
        </Card>
      ) : null}

      {media.length > 0 ? (
        <Card className="dark:bg-gray-800">
          <CardHeader>
            <CardTitle className="dark:text-white">
              Mídia recente{instagramName ? ` · ${instagramName}` : ''}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="dark:border-gray-700">
                    <TableHead className="dark:text-white">Data</TableHead>
                    <TableHead className="dark:text-white">Tipo</TableHead>
                    <TableHead className="dark:text-white">Legenda</TableHead>
                    <TableHead className="dark:text-white">Curtidas</TableHead>
                    <TableHead className="dark:text-white">Comentários</TableHead>
                    <TableHead className="dark:text-white">Alcance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {media.slice(0, 10).map((item) => (
                    <TableRow
                      key={item.id}
                      className={`dark:border-gray-700 ${onOpenMedia ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-gray-700/50' : ''}`}
                      onClick={() => onOpenMedia?.(item)}
                    >
                      <TableCell className="dark:text-gray-300">
                        {item.timestamp
                          ? format(new Date(item.timestamp), 'dd/MM/yyyy HH:mm', { locale: ptBR })
                          : '—'}
                      </TableCell>
                      <TableCell className="dark:text-gray-300">
                        <Badge variant="secondary" className="dark:bg-gray-700">
                          {item.media_type || 'post'}
                        </Badge>
                      </TableCell>
                      <TableCell className="dark:text-gray-300 max-w-md truncate">
                        {item.caption || '—'}
                      </TableCell>
                      <TableCell className="dark:text-gray-300">
                        {formatNumber(item.insights?.likes ?? item.like_count)}
                      </TableCell>
                      <TableCell className="dark:text-gray-300">
                        {formatNumber(item.insights?.comments ?? item.comments_count)}
                      </TableCell>
                      <TableCell className="dark:text-gray-300">
                        {formatNumber(item.insights?.reach)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="dark:bg-gray-800">
          <CardContent className="pt-6">
            <p className="text-center py-10 dark:text-gray-400">
              Nenhuma mídia encontrada no período selecionado.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default InstagramInsightsView;
