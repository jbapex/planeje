import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from "@/components/ui/calendar";
import { Calendar as CalendarIcon, RefreshCw, Plus, Facebook, Instagram } from 'lucide-react';
import { format, isValid, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import PageInsightsView from './PageInsightsView';
import InstagramInsightsView from './InstagramInsightsView';
import ContentPublisher from './ContentPublisher';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

// Constantes para cache
const CACHE_PREFIX = 'meta_business_cache_';
const CACHE_DURATION_MS = 4 * 60 * 60 * 1000; // 4 horas

// Funções auxiliares para gerenciar cache
const getCacheKey = (type, entityId, dateFrom, dateTo) => {
  const fromStr = dateFrom ? format(dateFrom, 'yyyy-MM-dd') : '';
  const toStr = dateTo ? format(dateTo, 'yyyy-MM-dd') : '';
  return `${CACHE_PREFIX}${type}_${entityId}_${fromStr}_${toStr}`;
};

const getCachedData = (cacheKey) => {
  try {
    const cached = localStorage.getItem(cacheKey);
    if (!cached) return null;
    
    const parsed = JSON.parse(cached);
    const now = Date.now();
    const cacheAge = now - parsed.timestamp;
    
    if (cacheAge < CACHE_DURATION_MS) {
      console.log(`✅ Cache válido encontrado para ${cacheKey} (${Math.round(cacheAge / 1000 / 60)}min atrás)`);
      return parsed.data;
    } else {
      console.log(`⏰ Cache expirado para ${cacheKey} (${Math.round(cacheAge / 1000 / 60)}min atrás)`);
      localStorage.removeItem(cacheKey);
      return null;
    }
  } catch (err) {
    console.error('Erro ao ler cache:', err);
    return null;
  }
};

const setCachedData = (cacheKey, data) => {
  try {
    const cacheEntry = {
      timestamp: Date.now(),
      data: data,
    };
    localStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
    console.log(`💾 Dados salvos no cache: ${cacheKey}`);
  } catch (err) {
    console.error('Erro ao salvar cache:', err);
  }
};

const MetaBusinessInsights = () => {
  const [type, setType] = useState('pages'); // 'pages' ou 'instagram'
  const [pages, setPages] = useState([]);
  const [instagramAccounts, setInstagramAccounts] = useState([]);
  const [selectedPage, setSelectedPage] = useState(null);
  const [selectedInstagram, setSelectedInstagram] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingPages, setLoadingPages] = useState(true);
  const [loadingInstagram, setLoadingInstagram] = useState(true);
  const [date, setDate] = useState({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [showPublisher, setShowPublisher] = useState(false);

  const { toast } = useToast();

  // Busca páginas do Facebook
  const fetchPages = useCallback(async () => {
    setLoadingPages(true);
    try {
      const { data, error } = await supabase.functions.invoke('meta-ads-api', {
        body: { action: 'get-pages' },
      });

      if (error) {
        console.error('Erro na Edge Function:', error);
        throw new Error(error.message || 'Erro ao conectar com a Edge Function');
      }

      if (data?.error) {
        console.error('Erro retornado pela API:', data.error);
        throw new Error(data.error.message || 'Erro ao buscar páginas');
      }

      const pagesData = data?.pages || [];
      setPages(pagesData);
      if (pagesData.length > 0 && !selectedPage) {
        setSelectedPage(pagesData[0].id);
      } else if (pagesData.length === 0) {
        console.warn('Nenhuma página encontrada. Verifique as permissões do System User.');
      }
    } catch (err) {
      console.error('Erro ao buscar páginas:', err);
      toast({
        title: 'Erro ao buscar páginas',
        description: err.message || 'Erro desconhecido. Verifique se a Edge Function está deployada e o token está configurado.',
        variant: 'destructive',
      });
      setPages([]);
    } finally {
      setLoadingPages(false);
    }
  }, [toast]);

  // Busca contas Instagram
  const fetchInstagramAccounts = useCallback(async () => {
    setLoadingInstagram(true);
    try {
      const { data, error } = await supabase.functions.invoke('meta-ads-api', {
        body: { action: 'get-instagram-accounts' },
      });

      if (error) {
        console.error('Erro na Edge Function:', error);
        throw new Error(error.message || 'Erro ao conectar com a Edge Function');
      }

      if (data?.error) {
        console.error('Erro retornado pela API:', data.error);
        throw new Error(data.error.message || 'Erro ao buscar contas Instagram');
      }

      const accountsData = data?.instagramAccounts || [];
      setInstagramAccounts(accountsData);
      if (accountsData.length > 0 && !selectedInstagram) {
        setSelectedInstagram(accountsData[0].id);
      } else if (accountsData.length === 0) {
        console.warn('Nenhuma conta Instagram encontrada. Verifique as permissões do System User.');
      }
    } catch (err) {
      console.error('Erro ao buscar contas Instagram:', err);
      toast({
        title: 'Erro ao buscar contas Instagram',
        description: err.message || 'Erro desconhecido. Verifique se a Edge Function está deployada e o token está configurado.',
        variant: 'destructive',
      });
      setInstagramAccounts([]);
    } finally {
      setLoadingInstagram(false);
    }
  }, [toast]);

  useEffect(() => {
    if (type === 'pages') {
      fetchPages();
    } else {
      fetchInstagramAccounts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const handleRefresh = useCallback(() => {
    if (type === 'pages') {
      fetchPages();
    } else {
      fetchInstagramAccounts();
    }
  }, [type, fetchPages, fetchInstagramAccounts]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex gap-2">
            <Button
              variant={type === 'pages' ? 'default' : 'outline'}
              onClick={() => {
                setType('pages');
                setSelectedPage(null);
                setSelectedInstagram(null);
              }}
              className="dark:bg-gray-700 dark:text-white dark:border-gray-600"
            >
              <Facebook className="mr-2 h-4 w-4" />
              Páginas Facebook
            </Button>
            <Button
              variant={type === 'instagram' ? 'default' : 'outline'}
              onClick={() => {
                setType('instagram');
                setSelectedPage(null);
                setSelectedInstagram(null);
              }}
              className="dark:bg-gray-700 dark:text-white dark:border-gray-600"
            >
              <Instagram className="mr-2 h-4 w-4" />
              Contas Instagram
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-start text-left font-normal dark:bg-gray-700 dark:text-white dark:border-gray-600"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {date?.from ? (
                  date.to ? (
                    <>
                      {format(date.from, "dd/MM/yy", { locale: ptBR })} - {format(date.to, "dd/MM/yy", { locale: ptBR })}
                    </>
                  ) : (
                    format(date.from, "dd/MM/yy", { locale: ptBR })
                  )
                ) : (
                  <span>Escolha o período</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={date?.from}
                selected={date}
                onSelect={setDate}
                numberOfMonths={2}
                locale={ptBR}
              />
            </PopoverContent>
          </Popover>
          <Button
            onClick={handleRefresh}
            variant="outline"
            size="sm"
            className="dark:bg-gray-700 dark:text-white dark:border-gray-600"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
          <Dialog open={showPublisher} onOpenChange={setShowPublisher}>
            <DialogTrigger asChild>
              <Button className="dark:bg-blue-600 dark:hover:bg-blue-700">
                <Plus className="mr-2 h-4 w-4" />
                Postar Conteúdo
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto dark:bg-gray-800">
              <DialogHeader>
                <DialogTitle className="dark:text-white">Publicar Conteúdo</DialogTitle>
              </DialogHeader>
              <ContentPublisher
                type={type}
                pages={pages}
                instagramAccounts={instagramAccounts}
                selectedPage={selectedPage}
                selectedInstagram={selectedInstagram}
                onClose={() => setShowPublisher(false)}
                onSuccess={() => {
                  setShowPublisher(false);
                  handleRefresh();
                }}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {type === 'pages' ? (
          <Select
            value={selectedPage || ''}
            onValueChange={setSelectedPage}
            disabled={loadingPages || pages.length === 0}
          >
            <SelectTrigger className="w-full md:w-[300px] dark:bg-gray-700 dark:text-white dark:border-gray-600">
              <SelectValue
                placeholder={
                  loadingPages
                    ? 'Carregando páginas...'
                    : pages.length === 0
                    ? 'Nenhuma página encontrada'
                    : 'Selecione uma página'
                }
              />
            </SelectTrigger>
            <SelectContent className="dark:bg-gray-700 dark:text-white">
              {pages.map((page) => (
                <SelectItem key={page.id} value={page.id} className="dark:hover:bg-gray-600">
                  {page.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Select
            value={selectedInstagram || ''}
            onValueChange={setSelectedInstagram}
            disabled={loadingInstagram || instagramAccounts.length === 0}
          >
            <SelectTrigger className="w-full md:w-[300px] dark:bg-gray-700 dark:text-white dark:border-gray-600">
              <SelectValue
                placeholder={
                  loadingInstagram
                    ? 'Carregando contas...'
                    : instagramAccounts.length === 0
                    ? 'Nenhuma conta encontrada'
                    : 'Selecione uma conta'
                }
              />
            </SelectTrigger>
            <SelectContent className="dark:bg-gray-700 dark:text-white">
              {instagramAccounts.map((account) => (
                <SelectItem key={account.id} value={account.id} className="dark:hover:bg-gray-600">
                  {account.username || account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {type === 'pages' && selectedPage && date?.from && date?.to && (
        <PageInsightsView
          pageId={selectedPage}
          pageName={pages.find((p) => p.id === selectedPage)?.name}
          dateRange={date}
          cacheKey={getCacheKey('page', selectedPage, date.from, date.to)}
          getCachedData={getCachedData}
          setCachedData={setCachedData}
        />
      )}

      {type === 'instagram' && selectedInstagram && date?.from && date?.to && (
        <InstagramInsightsView
          instagramId={selectedInstagram}
          instagramName={instagramAccounts.find((a) => a.id === selectedInstagram)?.username || instagramAccounts.find((a) => a.id === selectedInstagram)?.name}
          dateRange={date}
          cacheKey={getCacheKey('instagram', selectedInstagram, date.from, date.to)}
          getCachedData={getCachedData}
          setCachedData={setCachedData}
        />
      )}

      {!selectedPage && type === 'pages' && !loadingPages && (
        <Card className="dark:bg-gray-800">
          <CardContent className="pt-6">
            <p className="text-center py-10 dark:text-gray-400">
              {pages.length === 0
                ? 'Nenhuma página encontrada. Verifique as permissões do System User.'
                : 'Selecione uma página para visualizar os insights.'}
            </p>
          </CardContent>
        </Card>
      )}

      {!selectedInstagram && type === 'instagram' && !loadingInstagram && (
        <Card className="dark:bg-gray-800">
          <CardContent className="pt-6">
            <p className="text-center py-10 dark:text-gray-400">
              {instagramAccounts.length === 0
                ? 'Nenhuma conta Instagram encontrada. Verifique as permissões do System User.'
                : 'Selecione uma conta para visualizar os insights.'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default MetaBusinessInsights;
