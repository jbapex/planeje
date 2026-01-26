import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { Loader2, Users, Eye, Heart, MessageSquare, Share2, TrendingUp } from 'lucide-react';
import { format, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const formatCurrency = (value) => {
  const num = typeof value === 'number' ? value : parseFloat(value) || 0;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num);
};

const formatNumber = (value) => {
  const num = typeof value === 'number' ? value : parseFloat(value) || 0;
  return new Intl.NumberFormat('pt-BR').format(num);
};

const PageInsightsView = ({ pageId, pageName, dateRange, cacheKey, getCachedData, setCachedData }) => {
  const [insights, setInsights] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    reach: 0,
    impressions: 0,
    engagedUsers: 0,
    fans: 0,
    engagements: 0,
  });

  const { toast } = useToast();

  const fetchInsights = useCallback(async (forceRefresh = false) => {
    if (!pageId || !dateRange?.from || !dateRange?.to || !isValid(dateRange.from) || !isValid(dateRange.to)) {
      return;
    }

    setLoading(true);

    try {
      // Verifica cache
      if (!forceRefresh) {
        const cached = getCachedData(cacheKey);
        if (cached) {
          setInsights(cached.insights);
          setPosts(cached.posts || []);
          setMetrics(cached.metrics || metrics);
          setLoading(false);
          return;
        }
      }

      const timeRange = {
        since: format(dateRange.from, 'yyyy-MM-dd'),
        until: format(dateRange.to, 'yyyy-MM-dd'),
      };

      // Busca insights
      const insightsResponse = await supabase.functions.invoke('meta-ads-api', {
        body: {
          action: 'get-page-insights',
          page_id: pageId,
          time_range: timeRange,
          metrics: [
            'page_follows',
            'page_reach',
            'page_post_engagements',
          ],
        },
      });

      if (insightsResponse.error) throw insightsResponse.error;
      if (insightsResponse.data?.error) throw new Error(insightsResponse.data.error.message);

      const insightsData = insightsResponse.data?.insights || [];

      // Processa insights para calcular totais
      const processedMetrics = {
        reach: 0,
        impressions: 0,
        engagedUsers: 0,
        fans: 0,
        engagements: 0,
      };

      insightsData.forEach((insight) => {
        if (insight.values && Array.isArray(insight.values)) {
          const total = insight.values.reduce((sum, val) => sum + (parseFloat(val.value) || 0), 0);
          
          switch (insight.name) {
            case 'page_reach':
              processedMetrics.reach = total;
              break;
            case 'page_follows':
              // Pega o último valor (mais recente) para seguidores
              if (insight.values.length > 0) {
                processedMetrics.fans = parseFloat(insight.values[insight.values.length - 1].value) || 0;
              }
              break;
            case 'page_post_engagements':
              processedMetrics.engagements = total;
              // Engajamentos também podem ser usados como "usuários engajados" aproximado
              processedMetrics.engagedUsers = total;
              break;
          }
        }
      });

      // Busca posts da página
      const postsResponse = await supabase.functions.invoke('meta-ads-api', {
        body: {
          action: 'get-page-posts',
          page_id: pageId,
          time_range: timeRange,
        },
      });

      let postsData = [];
      if (!postsResponse.error && !postsResponse.data?.error) {
        postsData = postsResponse.data?.posts || [];
      }

      setInsights(insightsData);
      setPosts(postsData);
      setMetrics(processedMetrics);

      // Salva no cache
      setCachedData(cacheKey, {
        insights: insightsData,
        posts: postsData,
        metrics: processedMetrics,
      });
    } catch (err) {
      console.error('Erro ao buscar insights da página:', err);
      toast({
        title: 'Erro ao buscar insights',
        description: err.message || 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [pageId, dateRange, cacheKey, getCachedData, setCachedData, toast]);

  useEffect(() => {
    fetchInsights();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, dateRange?.from, dateRange?.to]);

  if (loading) {
    return (
      <Card className="dark:bg-gray-800">
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            <span className="ml-2 dark:text-gray-400">Carregando insights...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="dark:bg-gray-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium dark:text-gray-300">Alcance</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold dark:text-white">{formatNumber(metrics.reach)}</div>
          </CardContent>
        </Card>

        <Card className="dark:bg-gray-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium dark:text-gray-300">Seguidores</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold dark:text-white">{formatNumber(metrics.fans)}</div>
          </CardContent>
        </Card>

        <Card className="dark:bg-gray-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium dark:text-gray-300">Engajamentos</CardTitle>
            <Heart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold dark:text-white">{formatNumber(metrics.engagements)}</div>
          </CardContent>
        </Card>

        <Card className="dark:bg-gray-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium dark:text-gray-300">Usuários Engajados</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold dark:text-white">{formatNumber(metrics.engagedUsers)}</div>
          </CardContent>
        </Card>
      </div>

      {posts.length > 0 && (
        <Card className="dark:bg-gray-800">
          <CardHeader>
            <CardTitle className="dark:text-white">Posts Recentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="dark:border-gray-700">
                    <TableHead className="dark:text-white">Data</TableHead>
                    <TableHead className="dark:text-white">Tipo</TableHead>
                    <TableHead className="dark:text-white">Mensagem</TableHead>
                    <TableHead className="dark:text-white">Alcance</TableHead>
                    <TableHead className="dark:text-white">Engajamentos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {posts.slice(0, 10).map((post) => (
                    <TableRow key={post.id} className="dark:border-gray-700">
                      <TableCell className="dark:text-gray-300">
                        {post.created_time
                          ? format(new Date(post.created_time), 'dd/MM/yyyy HH:mm', { locale: ptBR })
                          : '-'}
                      </TableCell>
                      <TableCell className="dark:text-gray-300">
                        <Badge variant="secondary" className="dark:bg-gray-700">
                          {post.type || 'post'}
                        </Badge>
                      </TableCell>
                      <TableCell className="dark:text-gray-300 max-w-md truncate">
                        {post.message || post.story || '-'}
                      </TableCell>
                      <TableCell className="dark:text-gray-300">
                        {post.insights?.reach ? formatNumber(post.insights.reach) : '-'}
                      </TableCell>
                      <TableCell className="dark:text-gray-300">
                        {post.insights?.engagement ? formatNumber(post.insights.engagement) : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {posts.length === 0 && !loading && (
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
