import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { Loader2, Users, Eye, Heart, MessageSquare, Bookmark, Share2, TrendingUp } from 'lucide-react';
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

const InstagramInsightsView = ({ instagramId, instagramName, dateRange, cacheKey, getCachedData, setCachedData }) => {
  const [insights, setInsights] = useState(null);
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    reach: 0,
    impressions: 0,
    followers: 0,
    profileViews: 0,
    engagement: 0,
  });

  const { toast } = useToast();

  const fetchInsights = useCallback(async (forceRefresh = false) => {
    if (!instagramId || !dateRange?.from || !dateRange?.to || !isValid(dateRange.from) || !isValid(dateRange.to)) {
      return;
    }

    // Valida se as datas não estão no futuro
    const today = new Date();
    today.setHours(23, 59, 59, 999); // Fim do dia de hoje
    
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

    try {
      // Verifica cache
      if (!forceRefresh) {
        const cached = getCachedData(cacheKey);
        if (cached) {
          setInsights(cached.insights);
          setMedia(cached.media || []);
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
          action: 'get-instagram-insights',
          instagram_account_id: instagramId,
          time_range: timeRange,
          metrics: [
            'reach',
            'follower_count',
            'profile_views',
            'total_interactions',
          ],
        },
      });

      if (insightsResponse.error) throw insightsResponse.error;
      if (insightsResponse.data?.error) throw new Error(insightsResponse.data.error.message);

      const insightsData = insightsResponse.data?.insights || [];
      
      // Debug: log dos dados recebidos
      console.log('📊 Instagram Insights recebidos:', insightsData);

      // Processa insights para calcular totais
      const processedMetrics = {
        reach: 0,
        impressions: 0,
        followers: 0,
        profileViews: 0,
        engagement: 0,
      };

      insightsData.forEach((insight) => {
        // Para métricas com metric_type=total_value, a estrutura pode ser diferente
        // Pode ter um único valor em 'value' ou um array em 'values'
        let metricValue = 0;
        
        // Debug: log da estrutura de cada insight
        console.log(`🔍 Processando métrica ${insight.name}:`, {
          hasValues: !!insight.values,
          valuesIsArray: Array.isArray(insight.values),
          hasValue: insight.value !== undefined,
          structure: insight
        });
        
        if (insight.values && Array.isArray(insight.values) && insight.values.length > 0) {
          // Métricas com valores diários (period=day)
          if (insight.name === 'follower_count') {
            // Para follower_count, pega o último valor (mais recente)
            const lastValue = insight.values[insight.values.length - 1];
            metricValue = parseFloat(lastValue?.value || lastValue || 0) || 0;
          } else {
            // Para outras métricas, soma todos os valores
            metricValue = insight.values.reduce((sum, val) => {
              const valNum = typeof val === 'object' ? parseFloat(val.value || val) : parseFloat(val);
              return sum + (valNum || 0);
            }, 0);
          }
        } else if (insight.value !== undefined && insight.value !== null) {
          // Métricas com metric_type=total_value retornam um único valor
          metricValue = parseFloat(insight.value) || 0;
        } else if (insight.values && typeof insight.values === 'object' && !Array.isArray(insight.values)) {
          // Algumas métricas podem retornar um objeto com um único valor
          const firstKey = Object.keys(insight.values)[0];
          if (firstKey) {
            const val = insight.values[firstKey];
            metricValue = parseFloat(val?.value || val || 0) || 0;
          }
        } else if (insight.values && Array.isArray(insight.values) && insight.values.length === 0) {
          // Array vazio - métrica sem dados
          metricValue = 0;
        }
        
        console.log(`✅ Métrica ${insight.name} processada: ${metricValue}`);
        
        switch (insight.name) {
          case 'reach':
            processedMetrics.reach = metricValue;
            break;
          case 'follower_count':
            processedMetrics.followers = metricValue;
            break;
          case 'profile_views':
            processedMetrics.profileViews = metricValue;
            break;
          case 'total_interactions':
            processedMetrics.engagement = metricValue;
            break;
        }
      });
      
      console.log('📈 Métricas processadas:', processedMetrics);

      // Busca mídia do Instagram
      const mediaResponse = await supabase.functions.invoke('meta-ads-api', {
        body: {
          action: 'get-instagram-media',
          instagram_account_id: instagramId,
          time_range: timeRange,
        },
      });

      let mediaData = [];
      if (!mediaResponse.error && !mediaResponse.data?.error) {
        mediaData = mediaResponse.data?.media || [];
      }

      setInsights(insightsData);
      setMedia(mediaData);
      setMetrics(processedMetrics);

      // Salva no cache
      setCachedData(cacheKey, {
        insights: insightsData,
        media: mediaData,
        metrics: processedMetrics,
      });
    } catch (err) {
      console.error('Erro ao buscar insights do Instagram:', err);
      toast({
        title: 'Erro ao buscar insights',
        description: err.message || 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [instagramId, dateRange, cacheKey, getCachedData, setCachedData, toast]);

  useEffect(() => {
    fetchInsights();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instagramId, dateRange?.from, dateRange?.to]);

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
            <div className="text-2xl font-bold dark:text-white">{formatNumber(metrics.followers)}</div>
          </CardContent>
        </Card>

        <Card className="dark:bg-gray-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium dark:text-gray-300">Visualizações de Perfil</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold dark:text-white">{formatNumber(metrics.profileViews)}</div>
          </CardContent>
        </Card>

        <Card className="dark:bg-gray-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium dark:text-gray-300">Engajamento</CardTitle>
            <Heart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold dark:text-white">{formatNumber(metrics.engagement)}</div>
          </CardContent>
        </Card>
      </div>

      {media.length > 0 && (
        <Card className="dark:bg-gray-800">
          <CardHeader>
            <CardTitle className="dark:text-white">Mídia Recente</CardTitle>
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
                    <TableRow key={item.id} className="dark:border-gray-700">
                      <TableCell className="dark:text-gray-300">
                        {item.timestamp
                          ? format(new Date(item.timestamp), 'dd/MM/yyyy HH:mm', { locale: ptBR })
                          : '-'}
                      </TableCell>
                      <TableCell className="dark:text-gray-300">
                        <Badge variant="secondary" className="dark:bg-gray-700">
                          {item.media_type || 'post'}
                        </Badge>
                      </TableCell>
                      <TableCell className="dark:text-gray-300 max-w-md truncate">
                        {item.caption || '-'}
                      </TableCell>
                      <TableCell className="dark:text-gray-300">
                        {item.like_count ? formatNumber(item.like_count) : '-'}
                      </TableCell>
                      <TableCell className="dark:text-gray-300">
                        {item.comments_count ? formatNumber(item.comments_count) : '-'}
                      </TableCell>
                      <TableCell className="dark:text-gray-300">
                        {item.insights?.reach ? formatNumber(item.insights.reach) : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {media.length === 0 && !loading && (
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
