import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useClienteWhatsAppConfig } from '@/hooks/useClienteWhatsAppConfig';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Users, DollarSign, TrendingUp, Calendar as CalendarIcon, Loader2, RefreshCw, ExternalLink, ImageOff, ChevronDown, ChevronRight } from 'lucide-react';

const formatCurrency = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);

function isMetaLead(lead) {
  if (lead?.origem === 'Meta Ads') return true;
  const td = lead?.tracking_data;
  if (td && typeof td === 'object') {
    if (td.ad_id || td.meta_lead_id || td.form_id) return true;
  }
  return false;
}

function getCampaignName(lead) {
  const td = lead?.tracking_data;
  if (!td || typeof td !== 'object') return 'Sem campanha';
  const fromMeta = td.meta_ad_details?.ad?.campaign?.name;
  if (fromMeta) return fromMeta;
  if (td.campaign_name) return td.campaign_name;
  return 'Sem campanha';
}

function getAdName(lead) {
  const td = lead?.tracking_data;
  if (!td || typeof td !== 'object') return null;
  const fromMeta = td.meta_ad_details?.ad?.name;
  if (fromMeta) return fromMeta;
  if (td.ad_name) return td.ad_name;
  return td.ad_id ? `Anúncio ${td.ad_id}` : null;
}

function getAdId(lead) {
  const td = lead?.tracking_data;
  return (td && typeof td === 'object' && td.ad_id) ? td.ad_id : null;
}

function getAdThumbnailUrl(lead) {
  const url = lead?.tracking_data?.meta_ad_details?.ad?.thumbnail_url;
  return (url && typeof url === 'string' && url.trim()) ? url.trim() : null;
}

function isVenda(lead) {
  return lead?.status === 'vendeu';
}

function needsEnrichment(lead) {
  const td = lead?.tracking_data;
  if (!td || typeof td !== 'object') return false;
  if (!td.ad_id) return false;
  return !td.meta_ad_details?.ad;
}

const META_FIELD_LABELS = {
  full_name: 'Nome completo',
  first_name: 'Nome',
  last_name: 'Sobrenome',
  email: 'E-mail',
  phone_number: 'Telefone',
  city: 'Cidade',
  state: 'Estado',
  company_name: 'Empresa',
  job_title: 'Cargo',
  custom_question: 'Pergunta',
};

function formatMetaFieldLabel(key) {
  return META_FIELD_LABELS[key] || String(key).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDateSafe(value) {
  if (!value) return '—';
  try {
    const d = new Date(value);
    return isNaN(d.getTime()) ? '—' : format(d, "dd/MM/yyyy HH:mm", { locale: ptBR });
  } catch {
    return '—';
  }
}

export default function CrmRelatorioMeta({ onShowLeadDetail, effectiveClienteId: effectiveClienteIdProp }) {
  const { effectiveClienteId: effectiveClienteIdFromHook } = useClienteWhatsAppConfig();
  const effectiveClienteId = effectiveClienteIdProp ?? effectiveClienteIdFromHook;
  const { toast } = useToast();
  const autoEnrichDoneRef = useRef(false);
  const [dateRange, setDateRange] = useState(() => {
    const now = new Date();
    return { from: startOfMonth(now), to: endOfMonth(now) };
  });
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [expandedLeadId, setExpandedLeadId] = useState(null);

  const fetchLeads = useCallback(async () => {
    if (!effectiveClienteId) {
      setLeads([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      let q = supabase
        .from('leads')
        .select('id, nome, whatsapp, data_entrada, status, valor, tracking_data, origem')
        .eq('cliente_id', effectiveClienteId);
      if (dateRange?.from) {
        const fromStr = format(dateRange.from, 'yyyy-MM-dd');
        const toStr = dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : fromStr;
        q = q.gte('data_entrada', fromStr).lte('data_entrada', toStr);
      }
      const { data, error } = await q;
      if (error) throw error;
      const list = (data || []).filter(isMetaLead);
      setLeads(list);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro ao carregar leads', description: e?.message });
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, [effectiveClienteId, dateRange?.from, dateRange?.to, toast]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const byCampaign = useMemo(() => {
    const map = new Map();
    leads.forEach((l) => {
      const name = getCampaignName(l);
      if (!map.has(name)) map.set(name, { campaignName: name, leads: 0, vendas: 0, valorTotal: 0 });
      const row = map.get(name);
      row.leads += 1;
      if (isVenda(l)) {
        row.vendas += 1;
        row.valorTotal += Number(l.valor) || 0;
      }
      map.set(name, row);
    });
    return Array.from(map.values()).sort((a, b) => b.leads - a.leads);
  }, [leads]);

  const byAd = useMemo(() => {
    const map = new Map();
    leads.forEach((l) => {
      const adId = getAdId(l) || 'sem-ad-id';
      const adName = getAdName(l) || adId;
      const campaignName = getCampaignName(l);
      const key = adId;
      if (!map.has(key)) map.set(key, { adId, adName, campaignName, thumbnailUrl: null, leads: 0, vendas: 0, valorTotal: 0 });
      const row = map.get(key);
      if (!row.thumbnailUrl) row.thumbnailUrl = getAdThumbnailUrl(l);
      row.leads += 1;
      if (isVenda(l)) {
        row.vendas += 1;
        row.valorTotal += Number(l.valor) || 0;
      }
      map.set(key, row);
    });
    return Array.from(map.values()).sort((a, b) => b.leads - a.leads);
  }, [leads]);

  const summary = useMemo(() => {
    const totalLeads = leads.length;
    const vendas = leads.filter(isVenda).length;
    const valorTotal = leads.filter(isVenda).reduce((s, l) => s + (Number(l.valor) || 0), 0);
    return { totalLeads, vendas, valorTotal };
  }, [leads]);

  const toEnrich = useMemo(() => leads.filter(needsEnrichment), [leads]);
  const hasEnrichable = toEnrich.length > 0;

  const runEnrich = useCallback(async () => {
    if (!hasEnrichable) return;
    setEnriching(true);
    const BATCH = 5;
    let updated = 0;
    try {
      for (let i = 0; i < toEnrich.length; i += BATCH) {
        const batch = toEnrich.slice(i, i + BATCH);
        await Promise.all(
          batch.map(async (lead) => {
            const adId = getAdId(lead);
            if (!adId) return;
            const { data, error: fnError } = await supabase.functions.invoke('meta-ads-api', {
              body: { action: 'get-ad-by-id', adId },
            });
            if (fnError || data?.error) return;
            if (!data?.ad) return;
            const prev = (lead.tracking_data && typeof lead.tracking_data === 'object') ? lead.tracking_data : {};
            const metaEntry = { accountName: data.accountName ?? null, ad: data.ad, fetched_at: new Date().toISOString() };
            const history = [...(Array.isArray(prev.meta_ad_details_history) ? prev.meta_ad_details_history : []), { fetched_at: metaEntry.fetched_at, accountName: data.accountName, ad: data.ad }].slice(-30);
            const nextTracking = { ...prev, meta_ad_details: metaEntry, meta_ad_details_history: history };
            const { error: upErr } = await supabase.from('leads').update({ tracking_data: nextTracking }).eq('id', lead.id);
            if (!upErr) updated += 1;
          })
        );
      }
      toast({ title: 'Dados do Meta atualizados', description: `${updated} lead(s) enriquecidos com campanha e anúncio.` });
      await fetchLeads();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro ao atualizar', description: e?.message });
    } finally {
      setEnriching(false);
    }
  }, [toEnrich, hasEnrichable, fetchLeads, toast]);

  useEffect(() => {
    if (loading || leads.length === 0) return;
    const needEnrich = leads.filter(needsEnrichment);
    if (needEnrich.length === 0 || autoEnrichDoneRef.current) return;
    autoEnrichDoneRef.current = true;
    runEnrich();
  }, [loading, leads, runEnrich]);

  const renderTrackingInfo = (lead) => {
    const td = lead?.tracking_data;
    if (!td || typeof td !== 'object') {
      return <p className="text-sm text-muted-foreground">Nenhum dado de rastreamento.</p>;
    }
    const eventsByDate = Array.isArray(td.events_by_date) && td.events_by_date.length > 0
      ? [...td.events_by_date].sort((a, b) => (b.received_at || '').localeCompare(a.received_at || ''))
      : [];
    const renderTrackingFields = (data) => {
      if (!data || typeof data !== 'object') return null;
      return (
        <div className="space-y-1 text-xs">
          {data.source_id != null && <p><span className="text-muted-foreground">source_id:</span> {String(data.source_id)}</p>}
          {data.sourceApp != null && <p><span className="text-muted-foreground">sourceApp:</span> {String(data.sourceApp)}</p>}
          {data.ctwaClid != null && <p><span className="text-muted-foreground">ctwaClid:</span> <span className="break-all">{String(data.ctwaClid)}</span></p>}
          {data.conversionSource != null && <p><span className="text-muted-foreground">conversionSource:</span> {String(data.conversionSource)}</p>}
          {data.entryPointConversionExternalSource != null && <p><span className="text-muted-foreground">entryPointConversionExternalSource:</span> {String(data.entryPointConversionExternalSource)}</p>}
          {data.sourceURL != null && <p><span className="text-muted-foreground">sourceURL:</span> <a href={String(data.sourceURL)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">{String(data.sourceURL)}</a></p>}
          {data.thumbnailURL != null && <p><span className="text-muted-foreground">thumbnailURL:</span> <a href={String(data.thumbnailURL)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">{String(data.thumbnailURL)}</a></p>}
          {data.utm_source != null && <p><span className="text-muted-foreground">utm_source:</span> {String(data.utm_source)}</p>}
          {data.utm_medium != null && <p><span className="text-muted-foreground">utm_medium:</span> {String(data.utm_medium)}</p>}
          {data.utm_campaign != null && <p><span className="text-muted-foreground">utm_campaign:</span> {String(data.utm_campaign)}</p>}
          {data.utm_content != null && <p><span className="text-muted-foreground">utm_content:</span> {String(data.utm_content)}</p>}
          {data.utm_term != null && <p><span className="text-muted-foreground">utm_term:</span> {String(data.utm_term)}</p>}
          {data.fbclid != null && <p><span className="text-muted-foreground">fbclid:</span> {String(data.fbclid)}</p>}
        </div>
      );
    };
    const meta = td.meta_ad_details;
    const hasMetaAd = meta && typeof meta === 'object' && meta.ad;
    return (
      <div className="rounded-lg border bg-muted/30 p-4 space-y-4 text-sm">
        <p className="font-medium text-muted-foreground">Informações do método de rastreamento</p>
        {eventsByDate.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Eventos recebidos (Meta Ads) por data</p>
            {eventsByDate.map((entry, idx) => (
              <details key={idx} className="rounded border bg-background/50 overflow-hidden">
                <summary className="cursor-pointer px-2 py-1.5 text-sm font-medium hover:bg-muted/50 list-none flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-primary/60 shrink-0" />
                  {entry.received_at ? formatDateSafe(entry.received_at) : '—'}
                </summary>
                <div className="px-2 pb-2 pt-0 pl-4 border-t border-border/50 mt-1 space-y-1">
                  {renderTrackingFields(entry)}
                </div>
              </details>
            ))}
          </div>
        ) : (
          renderTrackingFields(td)
        )}
        {td.field_data && typeof td.field_data === 'object' && Object.keys(td.field_data).length > 0 && (
          <div className="pt-2 border-t border-border/50 space-y-1">
            <p className="font-medium text-muted-foreground">Respostas do formulário (Meta Lead Ads)</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {Object.entries(td.field_data).map(([key, value]) => (
                <React.Fragment key={key}>
                  <span className="text-muted-foreground">{formatMetaFieldLabel(key)}</span>
                  <span>{value != null && value !== '' ? String(value) : '—'}</span>
                </React.Fragment>
              ))}
            </div>
          </div>
        )}
        {hasMetaAd && (
          <div className="pt-2 border-t border-border/50 space-y-1">
            <p className="font-medium text-muted-foreground">Dados do Meta (campanha e anúncio)</p>
            <div className="flex flex-wrap items-start gap-3">
              {meta.ad?.thumbnail_url && (
                <img src={meta.ad.thumbnail_url} alt="" className="h-14 w-14 rounded object-cover border border-border shrink-0" />
              )}
              <div className="space-y-1 text-xs min-w-0">
                {meta.accountName != null && meta.accountName !== '' && <p><span className="text-muted-foreground">Conta de anúncios:</span> {String(meta.accountName)}</p>}
                {meta.ad?.campaign?.name != null && <p><span className="text-muted-foreground">Campanha:</span> {String(meta.ad.campaign.name)}</p>}
                {meta.ad?.adset?.name != null && <p><span className="text-muted-foreground">Conjunto:</span> {String(meta.ad.adset.name)}</p>}
                {meta.ad?.name != null && <p><span className="text-muted-foreground">Anúncio:</span> {String(meta.ad.name)}</p>}
                {meta.fetched_at && <p className="text-muted-foreground">Dados recebidos em {formatDateSafe(meta.fetched_at)}</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (!effectiveClienteId) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <p className="text-sm text-muted-foreground">Selecione um cliente para ver o relatório Meta.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 pb-8 w-full min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Relatório Meta</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {dateRange?.from
              ? dateRange.to
                ? `${format(dateRange.from, "dd 'de' MMM", { locale: ptBR })} – ${format(dateRange.to, "dd 'de' MMM. yyyy", { locale: ptBR })}`
                : format(dateRange.from, "dd 'de' MMM. yyyy", { locale: ptBR })
              : 'Todos os períodos'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-10 font-normal shrink-0">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateRange?.from && dateRange.to
                  ? `${format(dateRange.from, 'dd/MM', { locale: ptBR })} – ${format(dateRange.to, 'dd/MM', { locale: ptBR })}`
                  : 'Escolher período'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                locale={ptBR}
                defaultMonth={dateRange?.from || new Date()}
                selected={{ from: dateRange?.from, to: dateRange?.to }}
                onSelect={(range) => setDateRange(range?.from ? { from: range.from, to: range.to || range.from } : undefined)}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>
          <Button
            variant="secondary"
            size="sm"
            className="h-10 shrink-0"
            onClick={async () => {
              if (!hasEnrichable) {
                toast({
                  title: 'Carregar dados do Meta',
                  description: toEnrich.length === 0 && leads.length > 0
                    ? 'Todos os leads do Meta já possuem campanha e anúncio preenchidos.'
                    : leads.length === 0
                      ? 'Não há leads do Meta no período para enriquecer.'
                      : 'Nenhum lead com ad_id pendente de rastreamento. Os dados já estão atualizados.',
                });
                return;
              }
              await runEnrich();
            }}
            disabled={enriching}
          >
            {enriching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            {enriching ? 'Carregando...' : 'Carregar dados do Meta'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" /> Total de leads (Meta)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{summary.totalLeads}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Vendas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{summary.vendas}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> Valor total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{formatCurrency(summary.valorTotal)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Por campanha</h2>
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Campanha</th>
                <th className="text-right p-3 font-medium">Leads</th>
                <th className="text-right p-3 font-medium">Vendas</th>
                <th className="text-right p-3 font-medium">Valor total</th>
              </tr>
            </thead>
            <tbody>
              {byCampaign.length === 0 ? (
                <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">Nenhuma campanha identificada. Use &quot;Carregar dados do Meta&quot; para preencher.</td></tr>
              ) : (
                byCampaign.map((row) => (
                  <tr key={row.campaignName} className="border-b last:border-0">
                    <td className="p-3">{row.campaignName}</td>
                    <td className="p-3 text-right tabular-nums">{row.leads}</td>
                    <td className="p-3 text-right tabular-nums">{row.vendas}</td>
                    <td className="p-3 text-right tabular-nums">{formatCurrency(row.valorTotal)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Por anúncio</h2>
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="w-14 p-3 font-medium" aria-label="Miniatura" />
                <th className="text-left p-3 font-medium">Anúncio</th>
                <th className="text-left p-3 font-medium">Campanha</th>
                <th className="text-right p-3 font-medium">Leads</th>
                <th className="text-right p-3 font-medium">Vendas</th>
                <th className="text-right p-3 font-medium">Valor total</th>
              </tr>
            </thead>
            <tbody>
              {byAd.length === 0 ? (
                <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Nenhum anúncio identificado.</td></tr>
              ) : (
                byAd.map((row) => (
                  <tr key={row.adId} className="border-b last:border-0">
                    <td className="p-3 w-14 align-middle">
                      {row.thumbnailUrl ? (
                        <img
                          src={row.thumbnailUrl}
                          alt=""
                          className="h-10 w-10 rounded object-cover border border-border"
                        />
                      ) : (
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded border border-border bg-muted/50 text-muted-foreground" title="Sem miniatura">
                          <ImageOff className="h-5 w-5" />
                        </span>
                      )}
                    </td>
                    <td className="p-3">{row.adName}</td>
                    <td className="p-3">{row.campaignName}</td>
                    <td className="p-3 text-right tabular-nums">{row.leads}</td>
                    <td className="p-3 text-right tabular-nums">{row.vendas}</td>
                    <td className="p-3 text-right tabular-nums">{formatCurrency(row.valorTotal)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Leads do Meta</h2>
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-3 w-10" aria-label="Expandir" />
                <th className="text-left p-3 font-medium">Nome</th>
                <th className="text-left p-3 font-medium">Telefone</th>
                <th className="text-left p-3 font-medium">Data entrada</th>
                <th className="text-left p-3 font-medium">Campanha</th>
                <th className="text-left p-3 font-medium">Anúncio</th>
                <th className="text-left p-3 font-medium">Etapa</th>
                <th className="text-right p-3 font-medium">Valor</th>
                {onShowLeadDetail && <th className="p-3 w-10" />}
              </tr>
            </thead>
            <tbody>
              {leads.length === 0 ? (
                <tr><td colSpan={onShowLeadDetail ? 9 : 8} className="p-4 text-center text-muted-foreground">Nenhum lead do Meta no período.</td></tr>
              ) : (
                leads.map((l) => (
                  <React.Fragment key={l.id}>
                    <tr className="border-b last:border-0">
                      <td className="p-3 align-middle">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={() => setExpandedLeadId((prev) => (prev === l.id ? null : l.id))}
                          title={expandedLeadId === l.id ? 'Ocultar rastreamento' : 'Ver rastreamento'}
                        >
                          {expandedLeadId === l.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </Button>
                      </td>
                      <td className="p-3">{l.nome || '—'}</td>
                      <td className="p-3 font-mono text-xs">{l.whatsapp || '—'}</td>
                      <td className="p-3">{l.data_entrada ? format(new Date(l.data_entrada), 'dd/MM/yyyy', { locale: ptBR }) : '—'}</td>
                      <td className="p-3">{getCampaignName(l)}</td>
                      <td className="p-3">{getAdName(l) || '—'}</td>
                      <td className="p-3">{l.status || '—'}</td>
                      <td className="p-3 text-right tabular-nums">{formatCurrency(l.valor)}</td>
                      {onShowLeadDetail && (
                        <td className="p-3">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onShowLeadDetail(l)} title="Ver lead">
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </td>
                      )}
                    </tr>
                    {expandedLeadId === l.id && (
                      <tr className="border-b last:border-0 bg-muted/20">
                        <td colSpan={onShowLeadDetail ? 9 : 8} className="p-4 align-top">
                          {renderTrackingInfo(l)}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
