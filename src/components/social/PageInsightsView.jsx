import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { isSnapshotFresh, readSnapshotEntry } from '@/lib/socialSnapshotCache';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Eye,
  Heart,
  Loader2,
  MousePointerClick,
  UserPlus,
  Users,
} from 'lucide-react';
import { format, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import PaidTrafficPanel from './PaidTrafficPanel';

const formatNumber = (value) => {
  const num = typeof value === 'number' ? value : parseFloat(value);
  if (!Number.isFinite(num)) return '—';
  return new Intl.NumberFormat('pt-BR').format(num);
};

function insightValue(insight) {
  if (!insight) return 0;
  if (insight.value != null && insight.value !== '') return Number(insight.value) || 0;
  if (insight.total_value && insight.total_value.value != null) {
    return Number(insight.total_value.value) || 0;
  }
  if (Array.isArray(insight.values) && insight.values.length) {
    if (insight.name === 'page_follows' || String(insight.period || '') === 'days_28') {
      return Number(insight.values[insight.values.length - 1]?.value) || 0;
    }
    return insight.values.reduce((sum, entry) => {
      const raw = entry?.value;
      if (raw && typeof raw === 'object') {
        return sum + Object.values(raw).reduce((inner, n) => inner + (Number(n) || 0), 0);
      }
      return sum + (Number(raw) || 0);
    }, 0);
  }
  return 0;
}

async function enrichPostsWithInsights(posts, pageId, limit = 10) {
  const slice = (posts || []).slice(0, limit);
  const enriched = await Promise.all(
    slice.map(async (post) => {
      try {
        const { data, error } = await supabase.functions.invoke('meta-ads-api', {
          body: {
            action: 'get-page-post-insights',
            post_id: post.id,
            page_id: pageId,
          },
        });
        if (error || data?.error) return post;
        const metrics = data?.metrics || {};
        return {
          ...post,
          insights: {
            ...(post.insights || {}),
            reach: metrics.reach ?? post.insights?.reach,
            views: metrics.views ?? post.insights?.views,
            clicks: metrics.clicks ?? post.insights?.clicks,
            engagement: post.insights?.engagement
              ?? ((Number(post.reactions_count) || 0)
                + (Number(post.comments_count) || 0)
                + (Number(post.shares_count) || 0)),
          },
        };
      } catch {
        return post;
      }
    })
  );
  return [...enriched, ...(posts || []).slice(limit)];
}

const PageInsightsView = ({
  pageId,
  pageName,
  dateRange,
  cacheKey,
  getCachedData,
  setCachedData,
  onOpenMedia = null,
  followersFallback = null,
  clientId = null,
  showPaid = true,
  liveMeta = true,
}) => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    reach: 0,
    mediaViews: 0,
    pageViews: 0,
    followers: 0,
    newFollows: 0,
    engagements: 0,
    ctaClicks: 0,
  });

  const { toast } = useToast();

  const fetchInsights = useCallback(async (forceRefresh = false) => {
    if (!pageId || !dateRange?.from || !dateRange?.to || !isValid(dateRange.from) || !isValid(dateRange.to)) {
      return;
    }

    setLoading(true);

    const insightsCacheKey = `${cacheKey}_v2`;
    const applyCache = () => {
      const cached = getCachedData(insightsCacheKey);
      if (!cached?.metrics) return false;
      setPosts(cached.posts || []);
      setMetrics(cached.metrics);
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

      const [insightsResponse, profileResponse, postsResponse] = await Promise.all([
        supabase.functions.invoke('meta-ads-api', {
          body: { action: 'get-page-insights', page_id: pageId, time_range: timeRange },
        }),
        supabase.functions.invoke('meta-ads-api', {
          body: { action: 'get-page-profile', page_id: pageId },
        }),
        supabase.functions.invoke('meta-ads-api', {
          body: { action: 'get-page-posts', page_id: pageId, time_range: timeRange },
        }),
      ]);

      if (insightsResponse.error) throw insightsResponse.error;
      if (insightsResponse.data?.error) throw new Error(insightsResponse.data.error.message);

      const processedMetrics = {
        reach: 0,
        mediaViews: 0,
        pageViews: 0,
        followers: Number(followersFallback) || 0,
        newFollows: 0,
        engagements: 0,
        ctaClicks: 0,
      };

      for (const insight of insightsResponse.data?.insights || []) {
        const value = insightValue(insight);
        switch (insight.name) {
          case 'page_total_media_view_unique':
            processedMetrics.reach = value;
            break;
          case 'page_media_view':
          case 'page_video_views':
            processedMetrics.mediaViews += value;
            break;
          case 'page_views_total':
            processedMetrics.pageViews = value;
            break;
          case 'page_follows':
            processedMetrics.followers = value || processedMetrics.followers;
            break;
          case 'page_daily_follows':
            processedMetrics.newFollows = value;
            break;
          case 'page_post_engagements':
            processedMetrics.engagements = value;
            break;
          case 'page_total_actions':
            processedMetrics.ctaClicks = value;
            break;
          default:
            break;
        }
      }

      const profile = profileResponse.data?.profile;
      if (profile && !processedMetrics.followers) {
        processedMetrics.followers = Number(profile.followers_count || profile.fan_count) || 0;
      }

      let postsData = [];
      if (!postsResponse.error && !postsResponse.data?.error) {
        postsData = postsResponse.data?.posts || [];
      }
      postsData = await enrichPostsWithInsights(postsData, pageId, 10);

      setPosts(postsData);
      setMetrics(processedMetrics);
      setCachedData(insightsCacheKey, {
        posts: postsData,
        metrics: processedMetrics,
      });
    } catch (err) {
      console.error('Erro ao buscar insights da página:', err);
      if (!applyCache()) {
        toast({
          title: 'Erro ao buscar insights da página',
          description: err.message || 'Erro desconhecido',
          variant: 'destructive',
        });
      }
    } finally {
      setLoading(false);
    }
  }, [pageId, dateRange, cacheKey, getCachedData, setCachedData, toast, followersFallback, liveMeta]);

  useEffect(() => {
    void fetchInsights(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, dateRange?.from, dateRange?.to, followersFallback, liveMeta]);

  if (loading) {
    return (
      <Card className="dark:bg-gray-800">
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            <span className="ml-2 dark:text-gray-400">Carregando insights da página…</span>
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
            <CardTitle className="text-sm font-medium dark:text-gray-300">Visualizadores</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold dark:text-white">{formatNumber(metrics.reach)}</div>
            <p className="text-xs text-muted-foreground mt-1">Pessoas que viram as mídias (28 dias)</p>
          </CardContent>
        </Card>

        <Card className="dark:bg-gray-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium dark:text-gray-300">Visitas à página</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold dark:text-white">{formatNumber(metrics.pageViews)}</div>
            <p className="text-xs text-muted-foreground mt-1">Visualizações do perfil da página</p>
          </CardContent>
        </Card>

        <Card className="dark:bg-gray-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium dark:text-gray-300">Cliques no perfil</CardTitle>
            <MousePointerClick className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold dark:text-white">{formatNumber(metrics.ctaClicks)}</div>
            <p className="text-xs text-muted-foreground mt-1">Toques no contacto e botão da página</p>
          </CardContent>
        </Card>

        <Card className="dark:bg-gray-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium dark:text-gray-300">Seguidores</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold dark:text-white">{formatNumber(metrics.followers)}</div>
            <p className="text-xs text-muted-foreground mt-1">Total atual da página</p>
          </CardContent>
        </Card>

        <Card className="dark:bg-gray-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium dark:text-gray-300">Engajamento</CardTitle>
            <Heart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold dark:text-white">{formatNumber(metrics.engagements)}</div>
            <p className="text-xs text-muted-foreground mt-1">Reações, comentários e partilhas nos posts</p>
          </CardContent>
        </Card>

        <Card className="dark:bg-gray-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium dark:text-gray-300">Novos seguidores</CardTitle>
            <UserPlus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold dark:text-white">{formatNumber(metrics.newFollows)}</div>
            <p className="text-xs text-muted-foreground mt-1">Seguiu a página no período</p>
          </CardContent>
        </Card>
      </div>

      {showPaid && clientId && typeof PaidTrafficPanel === 'function' ? (
        <PaidTrafficPanel clientId={clientId} dateRange={dateRange} />
      ) : null}

      {posts.length > 0 ? (
        <Card className="dark:bg-gray-800">
          <CardHeader>
            <CardTitle className="dark:text-white">
              Posts recentes{pageName ? ` · ${pageName}` : ''}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="dark:border-gray-700">
                    <TableHead className="dark:text-white">Data</TableHead>
                    <TableHead className="dark:text-white">Tipo</TableHead>
                    <TableHead className="dark:text-white">Mensagem</TableHead>
                    <TableHead className="dark:text-white">Reações</TableHead>
                    <TableHead className="dark:text-white">Visualizadores</TableHead>
                    <TableHead className="dark:text-white">Engajamento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {posts.slice(0, 10).map((post) => (
                    <TableRow
                      key={post.id}
                      className={`dark:border-gray-700 ${onOpenMedia ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-gray-700/50' : ''}`}
                      onClick={() => onOpenMedia?.(post)}
                    >
                      <TableCell className="dark:text-gray-300">
                        {post.created_time
                          ? format(new Date(post.created_time), 'dd/MM/yyyy HH:mm', { locale: ptBR })
                          : '—'}
                      </TableCell>
                      <TableCell className="dark:text-gray-300">
                        <Badge variant="secondary" className="dark:bg-gray-700">
                          {post.media_type || post.type || 'post'}
                        </Badge>
                      </TableCell>
                      <TableCell className="dark:text-gray-300 max-w-md truncate">
                        {post.message || '—'}
                      </TableCell>
                      <TableCell className="dark:text-gray-300">
                        {formatNumber(post.insights?.likes ?? post.reactions_count ?? post.like_count)}
                      </TableCell>
                      <TableCell className="dark:text-gray-300">
                        {formatNumber(post.insights?.reach)}
                      </TableCell>
                      <TableCell className="dark:text-gray-300">
                        {formatNumber(post.insights?.engagement)}
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
              Nenhum post encontrado no período selecionado.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PageInsightsView;
