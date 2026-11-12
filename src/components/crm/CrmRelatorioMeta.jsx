import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { preferredThumbnailUrl, isPlanejeStoredThumb } from '@/lib/adThumbnail';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useClienteWhatsAppConfig } from '@/hooks/useClienteWhatsAppConfig';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { format, startOfMonth, endOfMonth, parseISO, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, DollarSign, TrendingUp, Calendar as CalendarIcon, Loader2, RefreshCw, ExternalLink, ImageOff, ChevronDown, ChevronRight, Filter, X, MessageCircle, Tag, UserX } from 'lucide-react';
import { isMetaAdsContactForStats, isMetaAdsLeadForStats } from '@/lib/contactFromWebhookPayload';
import { getPhoneVariations } from '@/lib/leadUtils';
import { isVendaComercial, vendaValorComercial } from '@/lib/leadComercial';
import LeadComercialInline from '@/components/crm/LeadComercialInline';
import LeadAnalysisLabels from '@/components/crm/LeadAnalysisLabels';
import { cn } from '@/lib/utils';
import { formatFunilSpend } from '@/lib/funilMetrics';
import { collectAdAccountIds } from '@/lib/hubResultsSummary';
import {
  campaignIdFromReportRow,
  emptyRelatorioSpendIndex,
  fetchCrmRelatorioMetaSpend,
  spendForCampaign,
} from '@/lib/crmRelatorioMetaSpend';
import {
  addRelatorioTrackingToGroup,
  emptyRelatorioGroup,
  reportCampaignName,
  selectRelatorioTrackingContacts,
  summarizeRelatorioTracking,
} from '@/lib/crmRelatorioMetaTracking';
import { RastreamentoHelp } from '@/components/crm/RastreamentoUi';
import { rastreamentoTabHelp } from '@/lib/rastreamentoHub';
import {
  bumpAnalysisCounts,
  catalogFromRows,
  reportRowHasAnalysisLabel,
  tallyAnalysisLabels,
} from '@/lib/rastreamentoAnalysisLabels';

/** Mesmo critério da página Contatos: última mensagem / interação para o filtro de período. */
const MESSAGE_DATE_FIELD_LAST = 'ultima';
const FILTER_ALL = '__all__';

const SUPABASE_PAGE_SIZE = 1000;

const CONTACT_SELECT_META =
  'id, from_jid, phone, sender_name, origin_source, utm_source, utm_medium, utm_campaign, utm_content, utm_term, first_seen_at, last_message_at, tracking_data, profile_pic_url, instance_name, whatsapp_config_id, qualificado, comprou, valor_venda';

const LEAD_SELECT_META =
  'id, nome, whatsapp, origem, status, valor, qualificado, comprou, etiquetas, tracking_data, data_entrada, created_at, updated_at, ultima_interacao, utm_source, utm_medium, utm_campaign, utm_content, utm_term, pipeline:pipeline_id(id, nome), stage:stage_id(id, nome)';

async function fetchAllClienteWhatsappContactsForMeta(supabase, clienteId) {
  const all = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('cliente_whatsapp_contact')
      .select(CONTACT_SELECT_META)
      .eq('cliente_id', clienteId)
      .order('last_message_at', { ascending: false })
      .range(from, from + SUPABASE_PAGE_SIZE - 1);
    if (error) throw error;
    const chunk = data || [];
    all.push(...chunk);
    if (chunk.length < SUPABASE_PAGE_SIZE) break;
    from += SUPABASE_PAGE_SIZE;
    if (from > 200000) break;
  }
  return all;
}

async function fetchAllLeadsForMeta(supabase, clienteId) {
  const all = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('leads')
      .select(LEAD_SELECT_META)
      .eq('cliente_id', clienteId)
      .order('updated_at', { ascending: false })
      .range(from, from + SUPABASE_PAGE_SIZE - 1);
    if (error) throw error;
    const chunk = data || [];
    all.push(...chunk);
    if (chunk.length < SUPABASE_PAGE_SIZE) break;
    from += SUPABASE_PAGE_SIZE;
    if (from > 200000) break;
  }
  return all;
}

function computeLeadsOnlyInFunnelFromContacts(allContacts, allLeads) {
  const contactPhones = new Set();
  allContacts.forEach((c) => {
    const raw = (c.phone || '').trim() || (c.from_jid || '').replace(/@.*$/, '').trim();
    getPhoneVariations(raw).forEach((v) => contactPhones.add(v));
  });
  return allLeads.filter((l) => {
    const variations = getPhoneVariations(l.whatsapp || '');
    return !variations.some((v) => contactPhones.has(v));
  });
}

function leadFirstSeenIso(l) {
  if (l.data_entrada != null && l.data_entrada !== '') {
    const raw = String(l.data_entrada).split('T')[0];
    const parts = raw.split('-').map(Number);
    if (parts.length === 3 && parts.every((n) => !Number.isNaN(n))) {
      const [y, m, d] = parts;
      return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
    }
  }
  return l.created_at || null;
}

function leadLastMessageIso(l) {
  return l.ultima_interacao || l.updated_at || l.created_at || null;
}

function messageTimestampToMs(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
  }
  const parsed = parseISO(raw);
  if (isValid(parsed)) return parsed.getTime();
  const fb = new Date(raw);
  const t = fb.getTime();
  return Number.isNaN(t) ? null : t;
}

function rowInMessageDateRange(row, dateFieldMode, dateFromStr, dateToStr) {
  const fromT = dateFromStr ? String(dateFromStr).trim() : '';
  const toT = dateToStr ? String(dateToStr).trim() : '';
  if (!fromT && !toT) return true;
  const rawField = dateFieldMode === MESSAGE_DATE_FIELD_LAST ? row.last_message_at : row.first_seen_at;
  const rowMs = messageTimestampToMs(rawField);
  if (rowMs == null || Number.isNaN(rowMs)) return false;
  if (fromT) {
    const p = fromT.split('-').map(Number);
    if (p.length !== 3 || p.some((n) => Number.isNaN(n))) return false;
    const [y, m, d] = p;
    const fromStart = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
    if (rowMs < fromStart) return false;
  }
  if (toT) {
    const p = toT.split('-').map(Number);
    if (p.length !== 3 || p.some((n) => Number.isNaN(n))) return false;
    const [y, m, d] = p;
    const toEnd = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
    if (rowMs > toEnd) return false;
  }
  return true;
}

function findLinkedMetaLeadForContact(contact, metaLeads) {
  const raw = (contact.phone || '').trim() || (contact.from_jid || '').replace(/@.*$/, '').trim();
  const cVars = new Set(getPhoneVariations(raw));
  for (const l of metaLeads) {
    for (const v of getPhoneVariations(l.whatsapp || '')) {
      if (cVars.has(v)) return l;
    }
  }
  return null;
}

/** Linha do relatório: mesmo conjunto da aba Contatos (filtro Meta + última mensagem no período). */
function buildMetaReportRows(allContacts, allLeads, dateFromStr, dateToStr) {
  const onlyFunnel = computeLeadsOnlyInFunnelFromContacts(allContacts, allLeads);
  const metaLeads = allLeads.filter(isMetaAdsLeadForStats);

  const metaContactsInRange = allContacts.filter(isMetaAdsContactForStats).filter((c) =>
    rowInMessageDateRange(c, MESSAGE_DATE_FIELD_LAST, dateFromStr, dateToStr)
  );

  const funnelMetaInRange = onlyFunnel.filter(isMetaAdsLeadForStats).filter((l) =>
    rowInMessageDateRange(
      { first_seen_at: leadFirstSeenIso(l), last_message_at: leadLastMessageIso(l) },
      MESSAGE_DATE_FIELD_LAST,
      dateFromStr,
      dateToStr
    )
  );

  const fromContacts = metaContactsInRange.map((c) => {
    const linked = findLinkedMetaLeadForContact(c, metaLeads);
    const preferContactTracking =
      c.tracking_data && typeof c.tracking_data === 'object' && Object.keys(c.tracking_data).length > 0;
    const tracking_data = preferContactTracking ? c.tracking_data : linked?.tracking_data ?? null;
    return {
      rowKey: `cw-${c.id}`,
      id: linked?.id ?? `cw-${c.id}`,
      nome: c.sender_name || linked?.nome || null,
      whatsapp: c.phone || linked?.whatsapp || null,
      data_entrada: linked?.data_entrada ?? c.first_seen_at,
      status: linked?.status ?? null,
      qualificado: linked?.qualificado ?? c.qualificado ?? null,
      comprou: linked?.comprou ?? c.comprou ?? null,
      valor: linked?.valor ?? c.valor_venda ?? null,
      utm_source: c.utm_source ?? linked?.utm_source ?? null,
      utm_medium: c.utm_medium ?? linked?.utm_medium ?? null,
      utm_campaign: c.utm_campaign ?? linked?.utm_campaign ?? null,
      utm_content: c.utm_content ?? linked?.utm_content ?? null,
      utm_term: c.utm_term ?? linked?.utm_term ?? null,
      tracking_data,
      origem: linked?.origem ?? null,
      pipeline: linked?.pipeline,
      stage: linked?.stage,
      etiquetas: linked?.etiquetas || [],
      _enrichTarget: { type: 'contact', id: c.id },
      _contactRow: c,
      _detailLead: linked || null,
      _leadRef: linked || null,
    };
  });

  const fromFunnel = funnelMetaInRange.map((l) => ({
    rowKey: `lead-${l.id}`,
    id: l.id,
    nome: l.nome,
    whatsapp: l.whatsapp,
    data_entrada: l.data_entrada,
    status: l.status,
    qualificado: l.qualificado,
    comprou: l.comprou,
    valor: l.valor,
    utm_source: l.utm_source,
    utm_medium: l.utm_medium,
    utm_campaign: l.utm_campaign,
    utm_content: l.utm_content,
    utm_term: l.utm_term,
    tracking_data: l.tracking_data,
    origem: l.origem,
    pipeline: l.pipeline,
    stage: l.stage,
    etiquetas: l.etiquetas || [],
    _enrichTarget: { type: 'lead', id: l.id },
    _detailLead: l,
    _leadRef: l,
  }));

  return [...fromContacts, ...fromFunnel];
}

const formatCurrency = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);

function getCampaignIdFromRow(lead) {
  return campaignIdFromReportRow(lead) || null;
}

function getCampaignName(lead) {
  return reportCampaignName(lead);
}

function getAdSetName(lead) {
  const td = lead?.tracking_data;
  if (td && typeof td === 'object') {
    const fromMeta = td.meta_ad_details?.ad?.adset?.name;
    if (fromMeta) return String(fromMeta).trim();
    if (td.adset_name != null && String(td.adset_name).trim() !== '') return String(td.adset_name).trim();
  }
  const fromCol = lead?.utm_medium != null && String(lead.utm_medium).trim() !== '' ? String(lead.utm_medium).trim() : '';
  if (fromCol) return fromCol;
  return 'Sem conjunto';
}

function getAdName(lead) {
  const fromCol = lead?.utm_content != null && String(lead.utm_content).trim() !== '' ? String(lead.utm_content).trim() : '';
  if (fromCol) return fromCol;
  const td = lead?.tracking_data;
  if (td && typeof td === 'object') {
    const fromMeta = td.meta_ad_details?.ad?.name;
    if (fromMeta) return fromMeta;
    if (td.utm_content != null && String(td.utm_content).trim() !== '') return String(td.utm_content).trim();
    if (td.ad_name) return td.ad_name;
    if (td.ad_id) return `Anúncio ${td.ad_id}`;
  }
  return null;
}

function getAdFilterKey(lead) {
  const adIdRaw = getAdId(lead);
  const adName = getAdName(lead) || (adIdRaw ? `Anúncio ${adIdRaw}` : 'Sem anúncio');
  const campaignName = getCampaignName(lead);
  return adIdRaw || `name:${campaignName}::${adName}`;
}

function getAdFilterLabel(lead) {
  return getAdName(lead) || (getAdId(lead) ? `Anúncio ${getAdId(lead)}` : 'Sem anúncio');
}

function sortFilterLabels(names) {
  const sem = [];
  const rest = [];
  names.forEach((n) => {
    if (n.startsWith('Sem ')) sem.push(n);
    else rest.push(n);
  });
  rest.sort((a, b) => a.localeCompare(b, 'pt-BR'));
  sem.sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return [...rest, ...sem];
}

function getAdId(lead) {
  const td = lead?.tracking_data;
  if (!td || typeof td !== 'object') return null;
  if (td.ad_id != null && String(td.ad_id).trim() !== '') return String(td.ad_id).trim();
  if (td.source_id != null && String(td.source_id).trim() !== '') return String(td.source_id).trim();
  return null;
}

function getAdThumbnailUrl(lead) {
  return preferredThumbnailUrl(lead?.tracking_data);
}

/** URL do anúncio no Meta (webhook), mesma usada em rastreamento — root ou último evento em events_by_date. */
function getMetaAdSourceUrlFromRow(row) {
  const td = row?.tracking_data;
  if (!td || typeof td !== 'object') return null;
  const root = td.sourceURL ?? td.source_url;
  if (root != null && String(root).trim() !== '') return String(root).trim();
  const events = Array.isArray(td.events_by_date) ? [...td.events_by_date] : [];
  events.sort((a, b) => (b?.received_at || '').localeCompare(a?.received_at || ''));
  for (const ev of events) {
    if (!ev || typeof ev !== 'object') continue;
    const u = ev.sourceURL ?? ev.source_url;
    if (u != null && String(u).trim() !== '') return String(u).trim();
    const nested = ev.tracking_data;
    if (nested && typeof nested === 'object') {
      const u2 = nested.sourceURL ?? nested.source_url;
      if (u2 != null && String(u2).trim() !== '') return String(u2).trim();
    }
  }
  return null;
}

function sanitizeHttpUrl(raw) {
  if (raw == null || typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.href;
  } catch {
    return null;
  }
}

function isVenda(row) {
  return isVendaComercial({
    qualificado: row.qualificado,
    comprou: row.comprou,
    valor: row.valor,
    status: row.status,
  });
}

function needsEnrichment(lead) {
  /** Colunas na tabela leads já trazem campanha + anúncio (Meta) — não precisa da API. */
  const camp = lead?.utm_campaign != null && String(lead.utm_campaign).trim() !== '';
  const adCol = lead?.utm_content != null && String(lead.utm_content).trim() !== '';
  if (camp && adCol) return false;
  const td = lead?.tracking_data;
  if (!td || typeof td !== 'object') return false;
  const hasAdKey =
    (td.ad_id != null && String(td.ad_id).trim() !== '') ||
    (td.source_id != null && String(td.source_id).trim() !== '');
  if (!hasAdKey) return false;
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

export default function CrmRelatorioMeta({ onShowLeadDetail, effectiveClienteId: effectiveClienteIdProp, embeddedInHub = false, dateRange: dateRangeProp, onDateRangeChange }) {
  const { effectiveClienteId: effectiveClienteIdFromHook } = useClienteWhatsAppConfig();
  const effectiveClienteId = effectiveClienteIdProp ?? effectiveClienteIdFromHook;
  const { toast } = useToast();
  const autoEnrichDoneRef = useRef(false);
  const [localDateRange, setLocalDateRange] = useState(() => {
    const now = new Date();
    return { from: startOfMonth(now), to: endOfMonth(now) };
  });
  const dateRange = onDateRangeChange ? dateRangeProp : localDateRange;
  const setDateRange = onDateRangeChange || setLocalDateRange;
  useEffect(() => {
    autoEnrichDoneRef.current = false;
  }, [effectiveClienteId, dateRange?.from, dateRange?.to]);
  const [reportRows, setReportRows] = useState([]);
  const [trackingRows, setTrackingRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [expandedRowKey, setExpandedRowKey] = useState(null);
  const [filterCampaign, setFilterCampaign] = useState(FILTER_ALL);
  const [filterAdSet, setFilterAdSet] = useState(FILTER_ALL);
  const [filterAd, setFilterAd] = useState(FILTER_ALL);
  const [filterLabel, setFilterLabel] = useState(FILTER_ALL);
  const [spendIndex, setSpendIndex] = useState(emptyRelatorioSpendIndex);
  const [loadingSpend, setLoadingSpend] = useState(false);
  const [spendReady, setSpendReady] = useState(false);

  useEffect(() => {
    setFilterCampaign(FILTER_ALL);
    setFilterAdSet(FILTER_ALL);
    setFilterAd(FILTER_ALL);
    setFilterLabel(FILTER_ALL);
  }, [effectiveClienteId, dateRange?.from, dateRange?.to]);

  /**
   * Mesmo conjunto da aba Contatos (origem Meta): contatos WhatsApp + leads só no funil.
   * Período: última mensagem / interação (não só data_entrada do lead).
   */
  const fetchReportRows = useCallback(async () => {
    if (!effectiveClienteId) {
      setReportRows([]);
      setTrackingRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [allContacts, allLeads] = await Promise.all([
        fetchAllClienteWhatsappContactsForMeta(supabase, effectiveClienteId),
        fetchAllLeadsForMeta(supabase, effectiveClienteId),
      ]);
      let dateFromStr = '';
      let dateToStr = '';
      if (dateRange?.from) {
        dateFromStr = format(dateRange.from, 'yyyy-MM-dd');
        dateToStr = dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : dateFromStr;
      }
      const rows = buildMetaReportRows(allContacts, allLeads, dateFromStr, dateToStr);
      setReportRows(rows);
      setTrackingRows(
        selectRelatorioTrackingContacts(allContacts, (contact) =>
          rowInMessageDateRange(contact, 'primeira', dateFromStr, dateToStr)
        )
      );
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro ao carregar relatório Meta', description: e?.message });
      setReportRows([]);
      setTrackingRows([]);
    } finally {
      setLoading(false);
    }
  }, [effectiveClienteId, dateRange?.from, dateRange?.to, toast]);

  useEffect(() => {
    void fetchReportRows();
  }, [fetchReportRows]);

  const fetchCampaignSpend = useCallback(async () => {
    if (!effectiveClienteId || !dateRange?.from) {
      setSpendIndex(emptyRelatorioSpendIndex());
      setSpendReady(false);
      return;
    }
    const since = format(dateRange.from, 'yyyy-MM-dd');
    const until = dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : since;
    setLoadingSpend(true);
    setSpendReady(false);
    try {
      const { data: clienteRow } = await supabase
        .from('clientes')
        .select('meta_rastreamento')
        .eq('id', effectiveClienteId)
        .maybeSingle();
      const adAccountIds = collectAdAccountIds(clienteRow?.meta_rastreamento);
      const next = await fetchCrmRelatorioMetaSpend(
        (name, opts) => supabase.functions.invoke(name, opts),
        { clienteId: effectiveClienteId, adAccountIds, since, until },
      );
      setSpendIndex(next);
    } catch {
      setSpendIndex(emptyRelatorioSpendIndex());
    } finally {
      setLoadingSpend(false);
      setSpendReady(true);
    }
  }, [effectiveClienteId, dateRange?.from, dateRange?.to]);

  useEffect(() => {
    void fetchCampaignSpend();
  }, [fetchCampaignSpend]);

  const rowsForAdSetOptions = useMemo(() => {
    const combined = [...reportRows, ...trackingRows];
    if (filterCampaign === FILTER_ALL) return combined;
    return combined.filter((r) => getCampaignName(r) === filterCampaign);
  }, [reportRows, trackingRows, filterCampaign]);

  const rowsForAdOptions = useMemo(() => {
    let rows = rowsForAdSetOptions;
    if (filterAdSet !== FILTER_ALL) rows = rows.filter((r) => getAdSetName(r) === filterAdSet);
    return rows;
  }, [rowsForAdSetOptions, filterAdSet]);

  const campaignFilterOptions = useMemo(
    () => sortFilterLabels([...new Set([...reportRows, ...trackingRows].map(getCampaignName))]),
    [reportRows, trackingRows]
  );

  const adSetFilterOptions = useMemo(
    () => sortFilterLabels([...new Set(rowsForAdSetOptions.map(getAdSetName))]),
    [rowsForAdSetOptions]
  );

  const adFilterOptions = useMemo(() => {
    const map = new Map();
    rowsForAdOptions.forEach((r) => {
      const key = getAdFilterKey(r);
      if (!map.has(key)) map.set(key, getAdFilterLabel(r));
    });
    return [...map.entries()]
      .sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
      .map(([value, label]) => ({ value, label }));
  }, [rowsForAdOptions]);

  const filteredRows = useMemo(() => {
    return reportRows.filter((row) => {
      if (filterCampaign !== FILTER_ALL && getCampaignName(row) !== filterCampaign) return false;
      if (filterAdSet !== FILTER_ALL && getAdSetName(row) !== filterAdSet) return false;
      if (filterAd !== FILTER_ALL && getAdFilterKey(row) !== filterAd) return false;
      if (filterLabel !== FILTER_ALL && !reportRowHasAnalysisLabel(row, filterLabel)) return false;
      return true;
    });
  }, [reportRows, filterCampaign, filterAdSet, filterAd, filterLabel]);

  const filteredTracking = useMemo(() => {
    return trackingRows.filter((row) => {
      if (filterCampaign !== FILTER_ALL && getCampaignName(row) !== filterCampaign) return false;
      if (filterAdSet !== FILTER_ALL && getAdSetName(row) !== filterAdSet) return false;
      if (filterAd !== FILTER_ALL && getAdFilterKey(row) !== filterAd) return false;
      if (filterLabel !== FILTER_ALL && !reportRowHasAnalysisLabel(row, filterLabel)) return false;
      return true;
    });
  }, [trackingRows, filterCampaign, filterAdSet, filterAd, filterLabel]);

  const analysisCatalog = useMemo(() => catalogFromRows(reportRows), [reportRows]);
  const analysisTalliesUnfiltered = useMemo(
    () => tallyAnalysisLabels(
      reportRows.filter((row) => {
        if (filterCampaign !== FILTER_ALL && getCampaignName(row) !== filterCampaign) return false;
        if (filterAdSet !== FILTER_ALL && getAdSetName(row) !== filterAdSet) return false;
        if (filterAd !== FILTER_ALL && getAdFilterKey(row) !== filterAd) return false;
        return true;
      }),
      analysisCatalog,
    ),
    [reportRows, filterCampaign, filterAdSet, filterAd, analysisCatalog],
  );

  const hasActiveFilters =
    filterCampaign !== FILTER_ALL || filterAdSet !== FILTER_ALL || filterAd !== FILTER_ALL || filterLabel !== FILTER_ALL;

  const clearMetaFilters = useCallback(() => {
    setFilterCampaign(FILTER_ALL);
    setFilterAdSet(FILTER_ALL);
    setFilterAd(FILTER_ALL);
    setFilterLabel(FILTER_ALL);
  }, []);

  const handleFilterCampaignChange = useCallback((value) => {
    setFilterCampaign(value);
    setFilterAdSet(FILTER_ALL);
    setFilterAd(FILTER_ALL);
  }, []);

  const handleFilterAdSetChange = useCallback((value) => {
    setFilterAdSet(value);
    setFilterAd(FILTER_ALL);
  }, []);

  const byCampaign = useMemo(() => {
    const map = new Map();
    filteredRows.forEach((l) => {
      const name = getCampaignName(l);
      const campaignId = getCampaignIdFromRow(l);
      if (!map.has(name)) {
        map.set(name, emptyRelatorioGroup(name, campaignId));
      }
      const row = map.get(name);
      if (!row.campaignId && campaignId) row.campaignId = campaignId;
      row.leads += 1;
      bumpAnalysisCounts(row, l);
      if (isVenda(l)) {
        row.vendas += 1;
        row.valorTotal += Number(l.valor) || 0;
      }
      map.set(name, row);
    });
    filteredTracking.forEach((l) => {
      const name = getCampaignName(l);
      map.set(name, addRelatorioTrackingToGroup(map.get(name) || emptyRelatorioGroup(name, getCampaignIdFromRow(l)), l));
    });
    return Array.from(map.values())
      .map((row) => {
        const spend = spendForCampaign(spendIndex, {
          campaignId: row.campaignId,
          campaignName: row.campaignName,
        });
        const cpl = row.leads > 0 && spend > 0 ? spend / row.leads : null;
        const roas = spend > 0 ? row.valorTotal / spend : null;
        return { ...row, spend, cpl, roas };
      })
      .sort((a, b) => (b.realConversations - a.realConversations) || (b.leads - a.leads));
  }, [filteredRows, filteredTracking, spendIndex]);

  const byAd = useMemo(() => {
    const map = new Map();
    const ensureAdRow = (l) => {
      const adIdRaw = getAdId(l);
      const adName = getAdName(l) || (adIdRaw ? `Anúncio ${adIdRaw}` : 'Sem anúncio');
      const campaignName = getCampaignName(l);
      const key = adIdRaw || `name:${campaignName}::${adName}`;
      if (!map.has(key)) {
        map.set(key, {
          adId: adIdRaw || key,
          adName,
          campaignName,
          thumbnailUrl: null,
          sourceUrl: null,
          leads: 0,
          vendas: 0,
          valorTotal: 0,
          realConversations: 0,
          qualificados: 0,
          naoResponde: 0,
          desqualificado: 0,
        });
      }
      const row = map.get(key);
      const nextThumb = getAdThumbnailUrl(l);
      if (!row.thumbnailUrl || (nextThumb && isPlanejeStoredThumb(nextThumb) && !isPlanejeStoredThumb(row.thumbnailUrl))) {
        if (nextThumb) row.thumbnailUrl = nextThumb;
      }
      if (!row.sourceUrl) {
        const rawUrl = getMetaAdSourceUrlFromRow(l);
        const safe = sanitizeHttpUrl(rawUrl);
        if (safe) row.sourceUrl = safe;
      }
      return { key, row };
    };
    filteredRows.forEach((l) => {
      const { row } = ensureAdRow(l);
      row.leads += 1;
      bumpAnalysisCounts(row, l);
      if (isVenda(l)) {
        row.vendas += 1;
        row.valorTotal += Number(l.valor) || 0;
      }
    });
    filteredTracking.forEach((l) => {
      const { row } = ensureAdRow(l);
      row.realConversations += 1;
      if (l?.qualificado === true) row.qualificados += 1;
    });
    return Array.from(map.values()).sort((a, b) => (b.realConversations - a.realConversations) || (b.leads - a.leads));
  }, [filteredRows, filteredTracking]);

  const summary = useMemo(() => {
    const totalLeads = filteredRows.length;
    const vendas = filteredRows.filter(isVenda).length;
    const valorTotal = filteredRows.filter(isVenda).reduce(
      (s, l) => s + vendaValorComercial({ qualificado: l.qualificado, comprou: l.comprou, valor: l.valor, status: l.status }),
      0
    );
    const tracking = summarizeRelatorioTracking(filteredTracking);
    const analysis = tallyAnalysisLabels(filteredRows, analysisCatalog);
    const naoResponde = analysis.find((item) => item.id === 'nao_responde')?.count || 0;
    const desqualificado = analysis.find((item) => item.id === 'desqualificado')?.count || 0;
    return {
      totalLeads,
      vendas,
      valorTotal,
      realConversations: tracking.realConversations,
      qualificados: tracking.qualificados,
      naoResponde,
      desqualificado,
      analysis,
    };
  }, [filteredRows, filteredTracking, analysisCatalog]);

  const summarySpend = useMemo(() => {
    const matched = byCampaign.reduce((sum, row) => sum + (Number(row.spend) || 0), 0);
    const total = hasActiveFilters ? matched : (Number(spendIndex.total) || matched);
    const cpl = summary.totalLeads > 0 && total > 0 ? total / summary.totalLeads : null;
    const roas = total > 0 ? summary.valorTotal / total : null;
    return { total, cpl, roas };
  }, [byCampaign, hasActiveFilters, spendIndex.total, summary]);

  const toEnrich = useMemo(() => reportRows.filter(needsEnrichment), [reportRows]);
  const hasEnrichable = toEnrich.length > 0;

  const runEnrich = useCallback(async () => {
    if (!hasEnrichable || !effectiveClienteId) return;
    setEnriching(true);
    const BATCH = 5;
    let updated = 0;
    try {
      for (let i = 0; i < toEnrich.length; i += BATCH) {
        const batch = toEnrich.slice(i, i + BATCH);
        await Promise.all(
          batch.map(async (row) => {
            const adId = getAdId(row);
            if (!adId) return;
            const { data, error: fnError } = await supabase.functions.invoke('meta-ads-api', {
              body: { action: 'get-ad-by-id', adId },
            });
            if (fnError || data?.error) return;
            if (!data?.ad) return;
            const prev = (row.tracking_data && typeof row.tracking_data === 'object') ? row.tracking_data : {};
            const metaEntry = { accountName: data.accountName ?? null, ad: data.ad, fetched_at: new Date().toISOString() };
            const history = [...(Array.isArray(prev.meta_ad_details_history) ? prev.meta_ad_details_history : []), { fetched_at: metaEntry.fetched_at, accountName: data.accountName, ad: data.ad }].slice(-30);
            const nextTracking = { ...prev, meta_ad_details: metaEntry, meta_ad_details_history: history };
            const target = row._enrichTarget;
            if (target?.type === 'contact') {
              const { error: upErr } = await supabase
                .from('cliente_whatsapp_contact')
                .update({ tracking_data: nextTracking, updated_at: new Date().toISOString() })
                .eq('id', target.id)
                .eq('cliente_id', effectiveClienteId);
              if (!upErr) updated += 1;
            } else if (target?.type === 'lead') {
              const { error: upErr } = await supabase.from('leads').update({ tracking_data: nextTracking }).eq('id', target.id);
              if (!upErr) updated += 1;
            }
          })
        );
      }
      toast({ title: 'Dados do Meta atualizados', description: `${updated} registro(s) enriquecidos com campanha e anúncio.` });
      await fetchReportRows();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro ao atualizar', description: e?.message });
    } finally {
      setEnriching(false);
    }
  }, [toEnrich, hasEnrichable, fetchReportRows, toast, effectiveClienteId]);

  useEffect(() => {
    if (loading || reportRows.length === 0) return;
    const needEnrich = reportRows.filter(needsEnrichment);
    if (needEnrich.length === 0 || autoEnrichDoneRef.current) return;
    autoEnrichDoneRef.current = true;
    runEnrich();
  }, [loading, reportRows, runEnrich]);

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

  const cardSurface = embeddedInHub
    ? 'relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-[0_10px_35px_rgba(15,23,42,0.045)] dark:border-white/10 dark:bg-card'
    : '';
  const tableWrap = embeddedInHub
    ? 'rounded-[26px] border border-slate-200/70 dark:border-white/10 overflow-x-auto shadow-[0_14px_45px_rgba(15,23,42,0.055)]'
    : 'rounded-md border overflow-x-auto';

  return (
    <div
      className={
        embeddedInHub
          ? 'flex flex-col gap-6 px-5 py-5 sm:px-6 sm:py-6 pb-6 w-full min-w-0'
          : 'flex flex-col gap-6 p-4 sm:p-6 pb-8 w-full min-w-0'
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          {!embeddedInHub && (
            <h1 className="text-xl font-semibold text-foreground">Relatório Meta</h1>
          )}
          {embeddedInHub ? (
            <div className="flex items-center gap-0.5">
              <h2 className="text-lg font-semibold tracking-[-0.025em] text-slate-950 dark:text-white">Relatórios</h2>
              <RastreamentoHelp label="Sobre os relatórios">{rastreamentoTabHelp('relatorio')}</RastreamentoHelp>
            </div>
          ) : null}
          <p className={`text-sm text-muted-foreground ${embeddedInHub ? 'mt-1' : 'mt-0.5'}`}>
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
                  description: toEnrich.length === 0 && reportRows.length > 0
                    ? 'Todos os registros do Meta já possuem campanha e anúncio preenchidos.'
                    : reportRows.length === 0
                      ? 'Não há linhas Meta no período para enriquecer.'
                      : 'Nenhum registro com anúncio pendente de rastreamento. Os dados já estão atualizados.',
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

      {reportRows.length > 0 && (
        <div
          className={
            embeddedInHub
              ? 'rounded-lg border border-slate-200/80 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-900/20 p-4 space-y-3'
              : 'rounded-lg border bg-muted/20 p-4 space-y-3'
          }
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              Filtrar por campanha, conjunto ou anúncio
            </p>
            {hasActiveFilters && (
              <Button type="button" variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={clearMetaFilters}>
                <X className="h-3.5 w-3.5" />
                Limpar filtros
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5 min-w-0">
              <Label className="text-xs text-muted-foreground">Campanha</Label>
              <Select value={filterCampaign} onValueChange={handleFilterCampaignChange}>
                <SelectTrigger className="h-9 rounded-lg">
                  <SelectValue placeholder="Todas as campanhas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>Todas as campanhas</SelectItem>
                  {campaignFilterOptions.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 min-w-0">
              <Label className="text-xs text-muted-foreground">Conjunto</Label>
              <Select
                value={filterAdSet}
                onValueChange={handleFilterAdSetChange}
                disabled={adSetFilterOptions.length === 0}
              >
                <SelectTrigger className="h-9 rounded-lg">
                  <SelectValue placeholder="Todos os conjuntos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>Todos os conjuntos</SelectItem>
                  {adSetFilterOptions.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 min-w-0">
              <Label className="text-xs text-muted-foreground">Anúncio</Label>
              <Select
                value={filterAd}
                onValueChange={setFilterAd}
                disabled={adFilterOptions.length === 0}
              >
                <SelectTrigger className="h-9 rounded-lg">
                  <SelectValue placeholder="Todos os anúncios" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>Todos os anúncios</SelectItem>
                  {adFilterOptions.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-0.5">
              <Tag className="h-3 w-3" />
              Análise
            </span>
            <Button
              type="button"
              variant={filterLabel === FILTER_ALL ? 'default' : 'outline'}
              size="sm"
              className="h-7 px-2 text-[11px] rounded-md"
              onClick={() => setFilterLabel(FILTER_ALL)}
            >
              Todas
            </Button>
            {analysisTalliesUnfiltered.map((item) => (
              <Button
                key={item.id}
                type="button"
                variant={filterLabel === item.name ? 'default' : 'outline'}
                size="sm"
                className="h-7 px-2 text-[11px] rounded-md gap-1"
                onClick={() => setFilterLabel((current) => (current === item.name ? FILTER_ALL : item.name))}
                title="Filtra o relatório. Não envia à Meta."
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: item.color }} />
                {item.name}
                <span className="tabular-nums opacity-80">{item.count}</span>
              </Button>
            ))}
          </div>
          {hasActiveFilters && (
            <p className="text-xs text-muted-foreground">
              Exibindo {filteredRows.length} de {reportRows.length} lead(s) e {filteredTracking.length} conversa(s) reais no período.
              {filteredRows.length === 0 && filteredTracking.length === 0 && ' Ajuste os filtros ou use «Carregar dados do Meta» para preencher campanha e anúncio.'}
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className={cardSurface}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" /> Total de leads (Meta)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{summary.totalLeads}</p>
          </CardContent>
        </Card>
        <Card className={cardSurface}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <MessageCircle className="h-4 w-4" /> Conversas reais
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{summary.realConversations}</p>
          </CardContent>
        </Card>
        <Card className={cardSurface}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              Gasto (Meta API)
              {loadingSpend && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums tracking-[-0.04em]">
              {spendReady && spendIndex.hasAdAccounts && (summarySpend.total > 0 || !spendIndex.errors.length)
                ? formatFunilSpend(summarySpend.total)
                : '—'}
            </p>
            {spendReady && !loadingSpend && !spendIndex.hasAdAccounts ? (
              <p className="mt-1 text-xs text-muted-foreground">Ligue a conta de anúncios em Integrações.</p>
            ) : null}
            {spendReady && !loadingSpend && spendIndex.hasAdAccounts && summarySpend.total <= 0 && spendIndex.errors[0] ? (
              <p className="mt-1 text-xs text-muted-foreground">{String(spendIndex.errors[0]).slice(0, 140)}</p>
            ) : null}
          </CardContent>
        </Card>
        <Card className={cardSurface}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              Qualificados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums tracking-[-0.04em]">{summary.qualificados}</p>
          </CardContent>
        </Card>
        <Card className={cardSurface}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Tag className="h-4 w-4" /> Não responde
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums tracking-[-0.04em]">{summary.naoResponde}</p>
          </CardContent>
        </Card>
        <Card className={cardSurface}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <UserX className="h-4 w-4" /> Desqualificado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums tracking-[-0.04em]">{summary.desqualificado}</p>
          </CardContent>
        </Card>
        <Card className={cardSurface}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Vendas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums tracking-[-0.04em]">{summary.vendas}</p>
          </CardContent>
        </Card>
        <Card className={cardSurface}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> Valor total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{formatCurrency(summary.valorTotal)}</p>
          </CardContent>
        </Card>
        <Card className={cardSurface}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">CPL</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {summarySpend.cpl != null ? formatFunilSpend(summarySpend.cpl) : '—'}
            </p>
          </CardContent>
        </Card>
        <Card className={cardSurface}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">ROAS</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {summarySpend.roas != null ? `${(summarySpend.roas * 100).toFixed(0)}%` : '—'}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Por campanha</h2>
        <div className={tableWrap}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Campanha</th>
                <th className="text-right p-3 font-medium">Leads</th>
                <th className="text-right p-3 font-medium">Conversas reais</th>
                <th className="text-right p-3 font-medium">Qualificados</th>
                <th className="text-right p-3 font-medium">Não responde</th>
                <th className="text-right p-3 font-medium">Desqualificado</th>
                <th className="text-right p-3 font-medium">Gasto</th>
                <th className="text-right p-3 font-medium">CPL</th>
                <th className="text-right p-3 font-medium">Vendas</th>
                <th className="text-right p-3 font-medium">Valor</th>
                <th className="text-right p-3 font-medium">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {byCampaign.length === 0 ? (
                <tr><td colSpan={11} className="p-4 text-center text-muted-foreground">Nenhuma campanha identificada. Use &quot;Carregar dados do Meta&quot; para preencher.</td></tr>
              ) : (
                byCampaign.map((row) => (
                  <tr key={row.campaignName} className="border-b last:border-0">
                    <td className="p-3">{row.campaignName}</td>
                    <td className="p-3 text-right tabular-nums">{row.leads}</td>
                    <td className="p-3 text-right tabular-nums">{row.realConversations}</td>
                    <td className="p-3 text-right tabular-nums">{row.qualificados}</td>
                    <td className="p-3 text-right tabular-nums">{row.naoResponde}</td>
                    <td className="p-3 text-right tabular-nums">{row.desqualificado}</td>
                    <td className="p-3 text-right tabular-nums">
                      {row.spend > 0 ? formatFunilSpend(row.spend) : '—'}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {row.cpl != null ? formatFunilSpend(row.cpl) : '—'}
                    </td>
                    <td className="p-3 text-right tabular-nums">{row.vendas}</td>
                    <td className="p-3 text-right tabular-nums">{formatCurrency(row.valorTotal)}</td>
                    <td className="p-3 text-right tabular-nums">
                      {row.roas != null ? `${(row.roas * 100).toFixed(0)}%` : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Por anúncio</h2>
        <div className={tableWrap}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="w-14 p-3 font-medium" aria-label="Miniatura" />
                <th className="text-left p-3 font-medium">Anúncio</th>
                <th className="text-left p-3 font-medium">Campanha</th>
                <th className="text-right p-3 font-medium">Leads</th>
                <th className="text-right p-3 font-medium">Conversas reais</th>
                <th className="text-right p-3 font-medium">Qualificados</th>
                <th className="text-right p-3 font-medium">Não responde</th>
                <th className="text-right p-3 font-medium">Desqualificado</th>
                <th className="text-right p-3 font-medium">Vendas</th>
                <th className="text-right p-3 font-medium">Valor total</th>
              </tr>
            </thead>
            <tbody>
              {byAd.length === 0 ? (
                <tr><td colSpan={10} className="p-4 text-center text-muted-foreground">Nenhum anúncio identificado.</td></tr>
              ) : (
                byAd.map((row) => (
                  <tr key={row.adId} className="border-b last:border-0">
                    <td className="p-3 w-14 align-middle">
                      {row.thumbnailUrl ? (
                        row.sourceUrl ? (
                          <a
                            href={row.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Abrir anúncio (link do lead)"
                            className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
                          >
                            <img
                              src={row.thumbnailUrl}
                              alt=""
                              className="h-10 w-10 rounded object-cover border border-border hover:opacity-90 transition-opacity"
                            />
                          </a>
                        ) : (
                          <img
                            src={row.thumbnailUrl}
                            alt=""
                            className="h-10 w-10 rounded object-cover border border-border"
                          />
                        )
                      ) : row.sourceUrl ? (
                        <a
                          href={row.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Abrir anúncio (link do lead)"
                          className="inline-flex h-10 w-10 items-center justify-center rounded border border-border bg-muted/50 text-primary hover:bg-muted transition-colors"
                        >
                          <ExternalLink className="h-5 w-5" />
                        </a>
                      ) : (
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded border border-border bg-muted/50 text-muted-foreground" title="Sem miniatura">
                          <ImageOff className="h-5 w-5" />
                        </span>
                      )}
                    </td>
                    <td className="p-3">{row.adName}</td>
                    <td className="p-3">{row.campaignName}</td>
                    <td className="p-3 text-right tabular-nums">{row.leads}</td>
                    <td className="p-3 text-right tabular-nums">{row.realConversations}</td>
                    <td className="p-3 text-right tabular-nums">{row.qualificados}</td>
                    <td className="p-3 text-right tabular-nums">{row.naoResponde}</td>
                    <td className="p-3 text-right tabular-nums">{row.desqualificado}</td>
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
        <h2 className="text-lg font-semibold">Leads do Meta (Contatos + funil)</h2>
        <div className={tableWrap}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-3 w-10" aria-label="Expandir" />
                <th className="text-left p-3 font-medium">Nome</th>
                <th className="text-left p-3 font-medium">Telefone</th>
                <th className="text-left p-3 font-medium">Data entrada</th>
                <th className="text-left p-3 font-medium">Campanha</th>
                <th className="text-left p-3 font-medium hidden lg:table-cell">Conjunto</th>
                <th className="text-left p-3 font-medium">Anúncio</th>
                <th className="text-left p-3 font-medium">Etapa</th>
                <th className="text-left p-3 font-medium min-w-[7rem]">Qualificado</th>
                <th className="text-left p-3 font-medium min-w-[7rem]">Comprou</th>
                <th className="text-right p-3 font-medium min-w-[6rem]">Valor (R$)</th>
                <th className="text-left p-3 font-medium min-w-[10rem]">Etiqueta</th>
                {onShowLeadDetail && <th className="p-3 w-10" />}
              </tr>
            </thead>
            <tbody>
              {reportRows.length === 0 ? (
                <tr><td colSpan={onShowLeadDetail ? 13 : 12} className="p-4 text-center text-muted-foreground">Nenhuma linha Meta no período. Marque qualificação e venda em cada linha para alimentar os totais.</td></tr>
              ) : filteredRows.length === 0 ? (
                <tr><td colSpan={onShowLeadDetail ? 13 : 12} className="p-4 text-center text-muted-foreground">Nenhum lead corresponde aos filtros selecionados.</td></tr>
              ) : (
                filteredRows.map((l) => {
                  const entradaLabel = (() => {
                    if (!l.data_entrada) return '—';
                    try {
                      const d = new Date(l.data_entrada);
                      return Number.isNaN(d.getTime()) ? '—' : format(d, 'dd/MM/yyyy', { locale: ptBR });
                    } catch {
                      return '—';
                    }
                  })();
                  const etapaLabel = (l.stage && l.stage.nome) || l.status || '—';
                  return (
                    <React.Fragment key={l.rowKey}>
                      <tr className="border-b last:border-0">
                        <td className="p-3 align-middle">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={() => setExpandedRowKey((prev) => (prev === l.rowKey ? null : l.rowKey))}
                            title={expandedRowKey === l.rowKey ? 'Ocultar rastreamento' : 'Ver rastreamento'}
                          >
                            {expandedRowKey === l.rowKey ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </Button>
                        </td>
                        <td className="p-3">{l.nome || '—'}</td>
                        <td className="p-3 font-mono text-xs">{l.whatsapp || '—'}</td>
                        <td className="p-3">{entradaLabel}</td>
                        <td className="p-3">{getCampaignName(l)}</td>
                        <td className="p-3 hidden lg:table-cell text-muted-foreground">{getAdSetName(l)}</td>
                        <td className="p-3">{getAdName(l) || '—'}</td>
                        <td className="p-3">{etapaLabel}</td>
                        <td className="p-3 align-top">
                          <LeadComercialInline
                            field="qualificado"
                            clienteId={effectiveClienteId}
                            lead={l._detailLead}
                            contact={l._contactRow}
                            compact
                            disabled={!effectiveClienteId}
                            onSaved={fetchReportRows}
                          />
                        </td>
                        <td className="p-3 align-top">
                          <LeadComercialInline
                            field="comprou"
                            clienteId={effectiveClienteId}
                            lead={l._detailLead}
                            contact={l._contactRow}
                            compact
                            disabled={!effectiveClienteId}
                            onSaved={fetchReportRows}
                          />
                        </td>
                        <td className="p-3 align-top text-right">
                          <LeadComercialInline
                            field="valor"
                            clienteId={effectiveClienteId}
                            lead={l._detailLead}
                            contact={l._contactRow}
                            compact
                            disabled={!effectiveClienteId}
                            onSaved={fetchReportRows}
                          />
                        </td>
                        <td className="p-3 align-top">
                          <LeadAnalysisLabels
                            clienteId={effectiveClienteId}
                            contact={l._contactRow}
                            lead={l._detailLead}
                            catalog={analysisCatalog}
                            disabled={!effectiveClienteId}
                            onSaved={fetchReportRows}
                          />
                        </td>
                        {onShowLeadDetail && (
                          <td className="p-3">
                            {l._detailLead ? (
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onShowLeadDetail(l._detailLead)} title="Ver lead no CRM">
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            ) : (
                              <span className="text-muted-foreground text-xs px-1" title="Sem lead no CRM (só contato WhatsApp)">
                                —
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                      {expandedRowKey === l.rowKey && (
                        <tr className="border-b last:border-0 bg-muted/20">
                          <td colSpan={onShowLeadDetail ? 13 : 12} className="p-4 align-top">
                            {renderTrackingInfo(l)}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
