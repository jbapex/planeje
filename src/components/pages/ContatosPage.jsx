import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { useClienteWhatsAppConfig } from '@/hooks/useClienteWhatsAppConfig';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { extractPhoneAndNameFromRawPayload, buildContactTrackingFromRawPayload, getFromJidFromRawPayload, isMetaAdsContactForStats, isMetaAdsLeadForStats } from '@/lib/contactFromWebhookPayload';
import { getPhoneVariations, normalizePhoneNumber } from '@/lib/leadUtils';
import { useCrmPipeline } from '@/hooks/useCrmPipeline';
import ImportFacebookLeadsModal from '@/components/crm/ImportFacebookLeadsModal';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Users,
  Loader2,
  RefreshCw,
  Filter,
  Activity,
  Eye,
  MessageCircle,
  Infinity,
  UserX,
  Info,
  Globe,
  Search,
  FileDown,
  Upload,
  PlusCircle,
  Trash2,
  Send,
  Facebook,
  CalendarRange,
  Calendar as CalendarPickerIcon,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { format, isValid, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const ORIGIN_FILTER_ALL = 'todos';
const ORIGIN_FILTER_META = 'meta_ads';
const ORIGIN_FILTER_NAO_IDENT = 'nao_identificado';

/** Filtro de período: qual timestamp usar (primeira vs última mensagem). */
const MESSAGE_DATE_FIELD_FIRST = 'primeira';
const MESSAGE_DATE_FIELD_LAST = 'ultima';

/** Limite pedido na query da lista (o servidor pode ainda cortar em ~1000 por resposta). */
const CONTACTS_FETCH_LIMIT = 50000;
/**
 * PostgREST costuma devolver no máximo 1000 linhas por requisição.
 * Para totais por origem baterem com o count, precisamos paginar com .range().
 */
const SUPABASE_PAGE_SIZE = 1000;

const CONTACT_SELECT_FOR_STATS =
  'id, from_jid, phone, sender_name, origin_source, utm_source, utm_medium, utm_campaign, utm_content, utm_term, first_seen_at, last_message_at, tracking_data, profile_pic_url, instance_name, crm_apice_lead_status, crm_apice_lead_status_at';

const LEAD_SELECT_FULL =
  'id, nome, whatsapp, origem, status, valor, tracking_data, data_entrada, created_at, updated_at, ultima_interacao, utm_source, utm_medium, utm_campaign, utm_content, utm_term, pipeline:pipeline_id(id, nome), stage:stage_id(id, nome), crm_apice_lead_status, crm_apice_lead_status_at';

async function fetchAllClienteWhatsappContactsPaged(supabase, clienteId) {
  const all = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('cliente_whatsapp_contact')
      .select(CONTACT_SELECT_FOR_STATS)
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

async function fetchAllLeadsPaged(supabase, clienteId) {
  const all = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('leads')
      .select(LEAD_SELECT_FULL)
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

async function fetchAllClienteWhatsappContactsPagedByClientes(supabase, clienteIds) {
  const all = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('cliente_whatsapp_contact')
      .select(CONTACT_SELECT_FOR_STATS)
      .in('cliente_id', clienteIds)
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

async function fetchAllLeadsPagedByClientes(supabase, clienteIds) {
  const all = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('leads')
      .select(LEAD_SELECT_FULL)
      .in('cliente_id', clienteIds)
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

function formatDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '—';
  return format(d, "dd/MM/yyyy HH:mm", { locale: ptBR });
}

/** Primeira “mensagem” para lead sem contato WhatsApp: data_entrada (início do dia) ou created_at. */
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

/** Última interação para lead sem contato: ultima_interacao > updated_at > created_at. */
function leadLastMessageIso(l) {
  return l.ultima_interacao || l.updated_at || l.created_at || null;
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

function buildFunnelMapFromLeads(allLeads) {
  const map = new Map();
  allLeads.forEach((l) => {
    const pipelineNome = l.pipeline?.nome || null;
    const stageNome = l.stage?.nome || null;
    if (!pipelineNome && !stageNome) return;
    getPhoneVariations(l.whatsapp || '').forEach((v) => map.set(v, { pipelineNome, stageNome }));
  });
  return map;
}

function createGetFunnelInfoForExport(funnelMap) {
  return (row) => {
    if (row._fromLead && row.pipelineNome) return { pipelineNome: row.pipelineNome, stageNome: row.stageNome };
    const raw = (row.phone || '').trim() || (row.from_jid || '').replace(/@.*$/, '').trim();
    const variations = getPhoneVariations(raw);
    for (const v of variations) {
      const info = funnelMap.get(v);
      if (info) return info;
    }
    return null;
  };
}

function filterContactsForExport(contacts, { origin, search, dateField, dateFrom, dateTo }) {
  let list = contacts;
  if (origin === ORIGIN_FILTER_META) list = list.filter(isMetaAdsContactForStats);
  else if (origin === ORIGIN_FILTER_NAO_IDENT) {
    list = list.filter((c) => !isMetaAdsContactForStats(c) && c.origin_source === 'nao_identificado');
  }
  const term = search.trim().toLowerCase();
  const termNorm = term.replace(/\D/g, '');
  if (term) {
    list = list.filter((c) => {
      const name = (c.sender_name || '').toLowerCase();
      const phone = (c.phone || '').replace(/\D/g, '');
      return name.includes(term) || (c.phone || '').toLowerCase().includes(term) || (termNorm && phone.includes(termNorm));
    });
  }
  if (dateFrom || dateTo) {
    list = list.filter((c) => rowInMessageDateRange(c, dateField, dateFrom, dateTo));
  }
  return list;
}

function filterLeadsForExport(leadsPool, { origin, search, dateField, dateFrom, dateTo }) {
  let pool = leadsPool;
  const term = search.trim().toLowerCase();
  const termNorm = term.replace(/\D/g, '');
  if (term) {
    pool = pool.filter((l) => {
      const name = (l.nome || '').toLowerCase();
      const phone = (l.whatsapp || '').replace(/\D/g, '');
      return name.includes(term) || (l.whatsapp || '').toLowerCase().includes(term) || (termNorm && phone.includes(termNorm));
    });
  }
  if (origin === ORIGIN_FILTER_META) pool = pool.filter(isMetaAdsLeadForStats);
  else if (origin === ORIGIN_FILTER_NAO_IDENT) pool = pool.filter((l) => !isMetaAdsLeadForStats(l));
  if (dateFrom || dateTo) {
    pool = pool.filter((l) =>
      rowInMessageDateRange(
        { first_seen_at: leadFirstSeenIso(l), last_message_at: leadLastMessageIso(l) },
        dateField,
        dateFrom,
        dateTo
      )
    );
  }
  return pool;
}

function mapLeadsToExportDisplayRows(leads) {
  return leads.map((l) => ({
    _fromLead: true,
    id: `lead-${l.id}`,
    sender_name: l.nome || null,
    phone: l.whatsapp || null,
    from_jid: (l.whatsapp || '').replace(/\D/g, '') ? `${(l.whatsapp || '').replace(/\D/g, '')}@s.whatsapp.net` : null,
    origin_source: isMetaAdsLeadForStats(l) ? 'meta_ads' : 'nao_identificado',
    tracking_data: l.tracking_data || null,
    first_seen_at: leadFirstSeenIso(l),
    last_message_at: leadLastMessageIso(l),
    instance_name: null,
    profile_pic_url: null,
    utm_source: l.utm_source,
    utm_medium: l.utm_medium,
    utm_campaign: l.utm_campaign,
    pipelineNome: l.pipeline?.nome ?? null,
    stageNome: l.stage?.nome ?? null,
    crm_apice_lead_status: l.crm_apice_lead_status ?? null,
    crm_apice_lead_status_at: l.crm_apice_lead_status_at ?? null,
  }));
}

/**
 * Converte um valor de timestamp do contato/lead em ms (epoch).
 * Trata: ISO com Z, date-only YYYY-MM-DD (calendário local), número (ms ou s).
 */
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
  // Só data (Postgres date / string): meio-dia local evita deslocar o dia por UTC
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

/**
 * Filtro por intervalo (inputs type=date = yyyy-MM-dd no fuso local).
 * Compara o instante da mensagem com início/fim do dia local em [de, até].
 */
function rowInMessageDateRange(row, dateFieldMode, dateFromStr, dateToStr) {
  const fromT = dateFromStr ? String(dateFromStr).trim() : '';
  const toT = dateToStr ? String(dateToStr).trim() : '';
  if (!fromT && !toT) return true;

  const rawField = dateFieldMode === MESSAGE_DATE_FIELD_FIRST ? row.first_seen_at : row.last_message_at;
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

/** yyyy-mm-dd → dd/mm/aaaa (só exibição / filtro de contatos). */
function isoYmdToBrDisplay(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** yyyy-mm-dd → Date local (calendário). */
function isoYmdToLocalDate(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Date local → yyyy-mm-dd. */
function localDateToIsoYmd(d) {
  if (!d || !(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Uma única ação: abrir calendário (pt-BR); exibe dd/mm/aaaa; estado pai em yyyy-mm-dd. */
function ContatosBrDateInput({ id, valueIso, onChangeIso, ariaLabel, className }) {
  const [calOpen, setCalOpen] = useState(false);
  const selectedDate = isoYmdToLocalDate(valueIso);

  return (
    <Popover open={calOpen} onOpenChange={setCalOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className={cn(
            'h-9 w-full min-w-[140px] sm:w-[168px] justify-start font-normal text-left text-sm rounded-md bg-muted/30 border-gray-200/80 dark:border-gray-700/50 px-2',
            className
          )}
          aria-label={ariaLabel}
          title={ariaLabel}
        >
          <CalendarPickerIcon className="mr-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          {valueIso ? (
            <span className="tabular-nums text-foreground text-xs">{isoYmdToBrDisplay(valueIso)}</span>
          ) : (
            <span className="text-muted-foreground text-xs">dd/mm/aaaa</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={ptBR}
          defaultMonth={selectedDate || new Date()}
          selected={selectedDate}
          onSelect={(date) => {
            if (date) {
              onChangeIso(localDateToIsoYmd(date));
            } else {
              onChangeIso('');
            }
            setCalOpen(false);
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

/** Chave para deduplicar contato + lead pelo mesmo telefone (fallback: id da linha). */
function contactRowDedupeKey(c) {
  const raw = (c.phone || '').trim() || (c.from_jid || '').replace(/@.*$/, '').trim();
  const n = normalizePhoneNumber(raw);
  if (n) return `p:${n}`;
  return `c:${c.id}`;
}

function leadRowDedupeKey(l) {
  const n = normalizePhoneNumber(l.whatsapp || '');
  if (n) return `p:${n}`;
  return `l:${l.id}`;
}

const ORIGIN_CAT_ORDER = { meta: 4, google: 3, outras: 2, nao: 1, none: 0 };

function mergeOriginCategory(prev, next) {
  if (!next) return prev;
  if (!prev) return next;
  return ORIGIN_CAT_ORDER[next] >= ORIGIN_CAT_ORDER[prev] ? next : prev;
}

/** Primeira mensagem = mais antiga; última = mais recente (contato + eventos webhook carregados). */
function mergeContactWebhookTimestamps(contact, events) {
  const firstPool = [];
  const lastPool = [];
  if (contact?.first_seen_at) firstPool.push(contact.first_seen_at);
  if (contact?.last_message_at) lastPool.push(contact.last_message_at);
  (events || []).forEach((e) => {
    if (e?.created_at) {
      firstPool.push(e.created_at);
      lastPool.push(e.created_at);
    }
  });
  if (firstPool.length === 0 && lastPool.length === 0) {
    return { first_seen_at: contact?.first_seen_at ?? null, last_message_at: contact?.last_message_at ?? null };
  }
  const firstMs = firstPool.length ? Math.min(...firstPool.map((t) => new Date(t).getTime())) : null;
  const lastMs = lastPool.length ? Math.max(...lastPool.map((t) => new Date(t).getTime())) : null;
  return {
    first_seen_at: firstMs != null ? new Date(firstMs).toISOString() : contact?.first_seen_at ?? null,
    last_message_at: lastMs != null ? new Date(lastMs).toISOString() : contact?.last_message_at ?? null,
  };
}

/**
 * Logos: coloque as imagens em public/logos/
 * - Meta Ads: arquivo "meta-ads.webp" (ou "meta ads.webp") → uso: /logos/meta-ads.webp
 * - Google Ads: arquivo "google-ads.png" (ou "google ads.png") → uso: /logos/google-ads.png
 * Nomes com espaço na URL viram %20 (ex.: /logos/meta%20ads.webp).
 */
function MetaLogoIcon({ className = 'h-5 w-5' }) {
  return <img src="/logos/meta%20ads.webp" alt="Meta Ads" className={className} />;
}

function GoogleAdsIcon({ className = 'h-5 w-5' }) {
  return <img src="/logos/google%20ads.png" alt="Google Ads" className={className} />;
}

const ContatosPage = ({ embeddedInCrm, onOpenConversation, onNovoLead, allClientsView = false }) => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const {
    effectiveClienteId,
    loading: configLoading,
    isAdminWithoutCliente,
    selectedClienteId,
    setSelectedClienteId,
    clientesForAdmin,
  } = useClienteWhatsAppConfig({ autoSelectFirstClient: !embeddedInCrm });
  const allClientsMode = embeddedInCrm && isAdminWithoutCliente && allClientsView;
  const adminClienteIds = useMemo(
    () => (clientesForAdmin || []).map((c) => c.id).filter(Boolean),
    [clientesForAdmin]
  );
  const canLoadAllClients = allClientsMode && adminClienteIds.length > 0;
  const canLoadData = !!effectiveClienteId || canLoadAllClients;

  const [contacts, setContacts] = useState([]);
  /** Total real de linhas no banco (count exact), pode ser > contacts.length se houver limite de fetch */
  const [contactsTotalDbCount, setContactsTotalDbCount] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fillFromWebhookLogLoading, setFillFromWebhookLogLoading] = useState(false);
  const [recalcTimestampsLoading, setRecalcTimestampsLoading] = useState(false);
  const [originFilter, setOriginFilter] = useState(ORIGIN_FILTER_ALL);
  const [searchTerm, setSearchTerm] = useState('');
  const [messageDateField, setMessageDateField] = useState(MESSAGE_DATE_FIELD_LAST);
  const [messageDateFrom, setMessageDateFrom] = useState('');
  const [messageDateTo, setMessageDateTo] = useState('');
  const [contactEventsViewing, setContactEventsViewing] = useState(null);
  const [contactEvents, setContactEvents] = useState([]);
  const [contactEventsLoading, setContactEventsLoading] = useState(false);
  const [eventBodyViewing, setEventBodyViewing] = useState(null);
  const [applyTrackingLoading, setApplyTrackingLoading] = useState(false);
  const [metaAdDetails, setMetaAdDetails] = useState(null);
  const [metaAdDetailsLoading, setMetaAdDetailsLoading] = useState(false);
  const [metaAdDetailsError, setMetaAdDetailsError] = useState(null);
  const [contactToDelete, setContactToDelete] = useState(null);
  const [deleteContactLoading, setDeleteContactLoading] = useState(false);
  const [selectedContactIds, setSelectedContactIds] = useState(new Set());
  const [exportFunnelOpen, setExportFunnelOpen] = useState(false);
  const [exportPipelineId, setExportPipelineId] = useState('');
  const [exportStageId, setExportStageId] = useState('');
  const [exportStages, setExportStages] = useState([]);
  const [exportFunnelLoading, setExportFunnelLoading] = useState(false);
  const [exportCsvOpen, setExportCsvOpen] = useState(false);
  const [exportCsvScope, setExportCsvScope] = useState('screen');
  const [exportCsvOrigin, setExportCsvOrigin] = useState(ORIGIN_FILTER_ALL);
  const [exportCsvDateField, setExportCsvDateField] = useState(MESSAGE_DATE_FIELD_LAST);
  const [exportCsvDateFrom, setExportCsvDateFrom] = useState('');
  const [exportCsvDateTo, setExportCsvDateTo] = useState('');
  const [exportCsvSearch, setExportCsvSearch] = useState('');
  const [exportCsvRunning, setExportCsvRunning] = useState(false);
  const [phoneToFunnelInfo, setPhoneToFunnelInfo] = useState(new Map());
  const [leadsOnlyInFunnel, setLeadsOnlyInFunnel] = useState([]);
  /** Todos os leads do cliente (lista completa via paginação) — contagem por origem e funil. */
  const [allLeadsForStats, setAllLeadsForStats] = useState([]);
  /** Total de linhas na tabela leads (count exact). */
  const [leadsTotalDbCount, setLeadsTotalDbCount] = useState(null);
  /** Contagem por origem em todos os contatos (paginação .range — bate com o total do banco). */
  const [contactOriginDb, setContactOriginDb] = useState(null);
  /** Todos os contatos do cliente (paginação), para recalcular os cards com filtros. */
  const [allContactsFull, setAllContactsFull] = useState([]);
  /** Carregando totais por origem (todas as páginas). */
  const [aggregatesLoading, setAggregatesLoading] = useState(false);
  const [importFacebookLeadsOpen, setImportFacebookLeadsOpen] = useState(false);
  const [batchEnrichingMeta, setBatchEnrichingMeta] = useState(false);
  /** Progresso do lote Meta: quantos contatos já processaram / total */
  const [metaEnrichProgress, setMetaEnrichProgress] = useState(null);

  const { pipelines } = useCrmPipeline();

  const isMetaAdsLead = useCallback((l) => isMetaAdsLeadForStats(l), []);

  useEffect(() => {
    if (!exportPipelineId) {
      setExportStages([]);
      setExportStageId('');
      return;
    }
    supabase
      .from('crm_stages')
      .select('id, nome, ordem')
      .eq('pipeline_id', exportPipelineId)
      .order('ordem', { ascending: true })
      .then(({ data }) => {
        setExportStages(data || []);
        setExportStageId((prev) => ((data || []).some((s) => s.id === prev) ? prev : (data?.[0]?.id || '')));
      });
  }, [exportPipelineId]);

  const toggleContactSelection = useCallback((id) => {
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const openExportFunnelForContacts = useCallback((contactList) => {
    setSelectedContactIds(new Set(contactList.map((c) => c.id)));
    setExportPipelineId(pipelines?.[0]?.id || '');
    setExportStageId('');
    setExportFunnelOpen(true);
  }, [pipelines]);

  const displayTracking = useMemo(() => {
    if (!contactEventsViewing) return null;
    if (contactEventsViewing.origin_source === 'meta_ads' && contactEventsViewing.tracking_data && Object.keys(contactEventsViewing.tracking_data).length > 0) {
      return { origin_source: 'meta_ads', tracking_data: contactEventsViewing.tracking_data };
    }
    const ev = (contactEvents || []).find((e) => e?.raw_payload && buildContactTrackingFromRawPayload(e.raw_payload).origin_source === 'meta_ads');
    return ev ? buildContactTrackingFromRawPayload(ev.raw_payload) : null;
  }, [contactEventsViewing, contactEvents]);

  const effectiveSourceIdForMeta = useMemo(() => {
    if (!displayTracking?.tracking_data || typeof displayTracking.tracking_data !== 'object') return null;
    const td = displayTracking.tracking_data;
    const eventsByDate = Array.isArray(td.events_by_date) && td.events_by_date.length > 0
      ? [...td.events_by_date].sort((a, b) => (b.received_at || '').localeCompare(a.received_at || ''))
      : [];
    const sid = td.source_id ?? eventsByDate[0]?.source_id ?? null;
    return sid != null && String(sid).trim() !== '' ? String(sid).trim() : null;
  }, [displayTracking]);

  const metaAutoLoadDoneRef = useRef(new Set());
  const batchEnrichingMetaRef = useRef(false);
  /** Evita reprocessar o mesmo lote em loop quando a Meta API não preenche ninguém */
  const metaBatchLastKeyRef = useRef('');

  const deleteContact = useCallback(async () => {
    if (!contactToDelete || !effectiveClienteId) return;
    setDeleteContactLoading(true);
    const { error } = await supabase
      .from('cliente_whatsapp_contact')
      .delete()
      .eq('id', contactToDelete.id)
      .eq('cliente_id', effectiveClienteId);
    setDeleteContactLoading(false);
    setContactToDelete(null);
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao excluir contato', description: error.message });
      return;
    }
    setContacts((prev) => prev.filter((x) => x.id !== contactToDelete.id));
    setContactsTotalDbCount((n) => (typeof n === 'number' ? Math.max(0, n - 1) : n));
    toast({ title: 'Contato excluído' });
  }, [contactToDelete, effectiveClienteId, toast]);

  const loadContacts = useCallback(async (opts = {}) => {
    const silent = opts.silent === true;
    if (opts.resetMetaBatchKey) metaBatchLastKeyRef.current = '';
    if (!canLoadData) {
      setContacts([]);
      setContactsTotalDbCount(null);
      return;
    }
    if (!silent) setLoading(true);
    let query = supabase
      .from('cliente_whatsapp_contact')
      .select(CONTACT_SELECT_FOR_STATS, { count: 'exact' })
      .order('last_message_at', { ascending: false })
      .limit(CONTACTS_FETCH_LIMIT);
    if (canLoadAllClients) query = query.in('cliente_id', adminClienteIds);
    else query = query.eq('cliente_id', effectiveClienteId);
    const { data, error, count } = await query;
    if (!silent) setLoading(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao carregar contatos', description: error.message });
      setContacts([]);
      setContactsTotalDbCount(null);
      return;
    }
    const rows = data || [];
    setContacts(rows);
    setContactsTotalDbCount(typeof count === 'number' ? count : rows.length);
  }, [canLoadData, canLoadAllClients, adminClienteIds, effectiveClienteId, toast]);

  /** Busca todas as páginas (PostgREST ~1000/req) e calcula totais por origem + leads só no funil. */
  const loadFullAggregates = useCallback(async () => {
    if (!canLoadData) return;
    setAggregatesLoading(true);
    try {
      const leadsCountPromise = canLoadAllClients
        ? supabase.from('leads').select('id', { count: 'exact', head: true }).in('cliente_id', adminClienteIds)
        : supabase.from('leads').select('id', { count: 'exact', head: true }).eq('cliente_id', effectiveClienteId);
      const allContactsPromise = canLoadAllClients
        ? fetchAllClienteWhatsappContactsPagedByClientes(supabase, adminClienteIds)
        : fetchAllClienteWhatsappContactsPaged(supabase, effectiveClienteId);
      const allLeadsPromise = canLoadAllClients
        ? fetchAllLeadsPagedByClientes(supabase, adminClienteIds)
        : fetchAllLeadsPaged(supabase, effectiveClienteId);
      const [leadsCountRes, allContacts, allLeads] = await Promise.all([
        leadsCountPromise,
        allContactsPromise,
        allLeadsPromise,
      ]);
      const leadsHead = typeof leadsCountRes.count === 'number' ? leadsCountRes.count : null;
      setLeadsTotalDbCount(leadsHead);

      let meta = 0;
      let google = 0;
      let outras = 0;
      let nao = 0;
      for (const c of allContacts) {
        if (isMetaAdsContactForStats(c)) {
          meta += 1;
          continue;
        }
        if (c.origin_source === 'google_ads') google += 1;
        else if (c.origin_source === 'nao_identificado') nao += 1;
        else if (c.origin_source && !['nao_identificado', 'google_ads'].includes(c.origin_source)) outras += 1;
      }
      setContactOriginDb({ meta, google, outras, nao, total: allContacts.length });
      setAllContactsFull(allContacts);

      setAllLeadsForStats(allLeads);

      const map = new Map();
      allLeads.forEach((l) => {
        const pipelineNome = l.pipeline?.nome || null;
        const stageNome = l.stage?.nome || null;
        if (!pipelineNome && !stageNome) return;
        const variations = getPhoneVariations(l.whatsapp || '');
        variations.forEach((v) => map.set(v, { pipelineNome, stageNome }));
      });
      setPhoneToFunnelInfo(map);

      const contactPhones = new Set();
      allContacts.forEach((c) => {
        const raw = (c.phone || '').trim() || (c.from_jid || '').replace(/@.*$/, '').trim();
        getPhoneVariations(raw).forEach((v) => contactPhones.add(v));
      });
      const onlyInFunnel = allLeads.filter((l) => {
        const variations = getPhoneVariations(l.whatsapp || '');
        return !variations.some((v) => contactPhones.has(v));
      });
      setLeadsOnlyInFunnel(onlyInFunnel);
    } catch (e) {
      console.error(e);
      toast({ variant: 'destructive', title: 'Erro ao carregar totais por origem', description: e?.message || String(e) });
      setContactOriginDb(null);
      setAllContactsFull([]);
    } finally {
      setAggregatesLoading(false);
    }
  }, [canLoadData, canLoadAllClients, adminClienteIds, effectiveClienteId, toast]);

  // Limpar antes de recarregar: evita cruzar telefones entre clientes e corrige a corrida Meta/Não (lista vazia = todos os leads "só funil").
  useEffect(() => {
    if (!canLoadData) return;
    setContacts([]);
    setContactsTotalDbCount(null);
    setLeadsOnlyInFunnel([]);
    setAllLeadsForStats([]);
    setLeadsTotalDbCount(null);
    setContactOriginDb(null);
    setAllContactsFull([]);
    setAggregatesLoading(false);
    setPhoneToFunnelInfo(new Map());
  }, [canLoadData, effectiveClienteId, adminClienteIds]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  useEffect(() => {
    if (!canLoadData || loading) return;
    void loadFullAggregates();
  }, [canLoadData, effectiveClienteId, loading, loadFullAggregates]);

  useEffect(() => {
    if (!effectiveClienteId || canLoadAllClients) return;
    const channel = supabase
      .channel(`contatos:${effectiveClienteId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cliente_whatsapp_contact', filter: `cliente_id=eq.${effectiveClienteId}` },
        () => {
          loadContacts({ silent: true });
          loadFullAggregates();
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [effectiveClienteId, canLoadAllClients, loadContacts, loadFullAggregates]);

  useEffect(() => {
    batchEnrichingMetaRef.current = false;
    setBatchEnrichingMeta(false);
    setMetaEnrichProgress(null);
    metaBatchLastKeyRef.current = '';
  }, [effectiveClienteId]);

  // Carregar dados do Meta em lote para contatos que ainda não têm campanha/anúncio (salva no banco e atualiza as colunas)
  useEffect(() => {
    if (!effectiveClienteId || loading || !contacts.length || batchEnrichingMetaRef.current) return;
    const toEnrich = contacts.filter(
      (c) =>
        isMetaAdsContactForStats(c) &&
        !c.tracking_data?.meta_ad_details?.ad &&
        (c.tracking_data?.source_id ?? c.tracking_data?.ad_id)
    );
    if (toEnrich.length === 0) return;
    const batchKey = toEnrich.map((c) => c.from_jid).sort().join('|');
    if (metaBatchLastKeyRef.current === batchKey) {
      return;
    }
    batchEnrichingMetaRef.current = true;
    setBatchEnrichingMeta(true);
    const totalEnrich = toEnrich.length;
    setMetaEnrichProgress({ done: 0, total: totalEnrich });
    (async () => {
      let saved = 0;
      for (let i = 0; i < toEnrich.length; i++) {
        const c = toEnrich[i];
        const adId = c.tracking_data?.source_id ?? c.tracking_data?.ad_id;
        if (!adId || !String(adId).trim()) {
          setMetaEnrichProgress({ done: i + 1, total: totalEnrich });
          continue;
        }
        try {
          const { data } = await supabase.functions.invoke('meta-ads-api', {
            body: { action: 'get-ad-by-id', adId: String(adId).trim() },
          });
          if (data?.error || !data?.ad) {
            setMetaEnrichProgress({ done: i + 1, total: totalEnrich });
            continue;
          }
          const fetchedAt = new Date().toISOString();
          const metaEntry = { accountName: data.accountName, ad: data.ad, fetched_at: fetchedAt };
          const prev = c.tracking_data || {};
          const history = [...(Array.isArray(prev.meta_ad_details_history) ? prev.meta_ad_details_history : []), { fetched_at: fetchedAt, accountName: data.accountName, ad: data.ad }].slice(-30);
          const nextTracking = { ...prev, meta_ad_details: metaEntry, meta_ad_details_history: history };
          const { error: upErr } = await supabase
            .from('cliente_whatsapp_contact')
            .update({ tracking_data: nextTracking, updated_at: new Date().toISOString() })
            .eq('cliente_id', effectiveClienteId)
            .eq('from_jid', c.from_jid);
          if (!upErr) saved += 1;
        } catch {
          // ignora erro por contato para seguir com os demais
        }
        setMetaEnrichProgress({ done: i + 1, total: totalEnrich });
        await new Promise((r) => setTimeout(r, 400));
      }
      metaBatchLastKeyRef.current = batchKey;
      batchEnrichingMetaRef.current = false;
      setBatchEnrichingMeta(false);
      setMetaEnrichProgress(null);
      await loadContacts({ silent: true });
      const missed = totalEnrich - saved;
      toast({
        title: 'Carregamento do Meta concluído',
        description:
          missed > 0
            ? `${saved} de ${totalEnrich} contato(s) com campanha/anúncio preenchidos. ${missed} não retornaram dados da API (ou sem ID válido). Use o botão "Atualizar" para tentar de novo.`
            : `${saved} contato(s) atualizado(s) com dados do Meta.`,
      });
    })();
  }, [loading, contacts, effectiveClienteId, loadContacts, toast]);

  const fillContactsFromWebhookLog = useCallback(async () => {
    if (!effectiveClienteId) return;
    setFillFromWebhookLogLoading(true);
    const { data: logRows, error: logError } = await supabase
      .from('cliente_whatsapp_webhook_log')
      .select('id, from_jid, raw_payload, created_at')
      .eq('cliente_id', effectiveClienteId)
      .order('created_at', { ascending: false })
      .limit(2000);
    if (logError) {
      toast({ variant: 'destructive', title: 'Erro ao ler eventos do webhook', description: logError.message });
      setFillFromWebhookLogLoading(false);
      return;
    }
    const jids = [];
    const oldestByJid = new Map();
    (logRows || []).forEach((row) => {
      const fromColumn = row.from_jid && String(row.from_jid).trim() && row.from_jid !== 'unknown' ? String(row.from_jid).trim() : null;
      const jid = fromColumn || getFromJidFromRawPayload(row.raw_payload);
      if (!jid || jid === 'unknown') return;
      const cur = row.created_at;
      if (!cur) return;
      const prev = oldestByJid.get(jid);
      if (!prev || new Date(cur) < new Date(prev)) oldestByJid.set(jid, cur);
    });
    const byJid = new Map();
    (logRows || []).forEach((row) => {
      const fromColumn = row.from_jid && String(row.from_jid).trim() && row.from_jid !== 'unknown' ? String(row.from_jid).trim() : null;
      const jid = fromColumn || getFromJidFromRawPayload(row.raw_payload);
      if (!jid || jid === 'unknown') return;
      if (byJid.has(jid)) return;
      const tracking = buildContactTrackingFromRawPayload(row.raw_payload);
      const { phone, sender_name } = extractPhoneAndNameFromRawPayload(row.raw_payload, jid);
      const trackingData = { ...(tracking.tracking_data || {}) };
      byJid.set(jid, {
        cliente_id: effectiveClienteId,
        from_jid: jid,
        phone: phone || null,
        sender_name: sender_name || null,
        origin_source: tracking.origin_source,
        utm_source: tracking.utm_source,
        utm_medium: tracking.utm_medium,
        utm_campaign: tracking.utm_campaign,
        utm_content: tracking.utm_content,
        utm_term: tracking.utm_term,
        tracking_data: trackingData,
        first_seen_at: oldestByJid.get(jid) || row.created_at || new Date().toISOString(),
        last_message_at: row.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      jids.push(jid);
    });
    const toUpsert = Array.from(byJid.values());
    if (toUpsert.length === 0) {
      toast({ title: 'Nada para preencher', description: 'Não há eventos com from_jid válido no log do webhook.' });
      setFillFromWebhookLogLoading(false);
      return;
    }
    const { data: existingContacts } = await supabase
      .from('cliente_whatsapp_contact')
      .select('from_jid, tracking_data, origin_source, utm_source, utm_medium, utm_campaign, utm_content, utm_term, first_seen_at, last_message_at')
      .eq('cliente_id', effectiveClienteId)
      .in('from_jid', jids);
    const existingByJid = new Map((existingContacts || []).map((c) => [c.from_jid, c]));
    toUpsert.forEach((row) => {
      const existing = existingByJid.get(row.from_jid);
      const existingHasTracking = existing?.tracking_data && typeof existing.tracking_data === 'object' && Object.keys(existing.tracking_data).length > 0;
      if (existing && existingHasTracking) {
        row.tracking_data = existing.tracking_data;
        row.origin_source = existing.origin_source ?? row.origin_source;
        row.utm_source = existing.utm_source ?? row.utm_source;
        row.utm_medium = existing.utm_medium ?? row.utm_medium;
        row.utm_campaign = existing.utm_campaign ?? row.utm_campaign;
        row.utm_content = existing.utm_content ?? row.utm_content;
        row.utm_term = existing.utm_term ?? row.utm_term;
      } else if (existing?.tracking_data?.meta_ad_details) {
        row.tracking_data = { ...(row.tracking_data || {}), meta_ad_details: existing.tracking_data.meta_ad_details, meta_ad_details_history: existing.tracking_data.meta_ad_details_history };
      }
      if (existing?.first_seen_at && row.first_seen_at) {
        row.first_seen_at = new Date(
          Math.min(new Date(existing.first_seen_at).getTime(), new Date(row.first_seen_at).getTime())
        ).toISOString();
      } else if (existing?.first_seen_at) {
        row.first_seen_at = existing.first_seen_at;
      }
      if (existing?.last_message_at && row.last_message_at) {
        row.last_message_at = new Date(
          Math.max(new Date(existing.last_message_at).getTime(), new Date(row.last_message_at).getTime())
        ).toISOString();
      } else if (existing?.last_message_at) {
        row.last_message_at = existing.last_message_at;
      }
    });
    const { error: upsertError } = await supabase
      .from('cliente_whatsapp_contact')
      .upsert(toUpsert, {
        onConflict: 'cliente_id,from_jid',
        updateColumns: ['phone', 'sender_name', 'origin_source', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'tracking_data', 'first_seen_at', 'last_message_at', 'updated_at'],
      });
    if (upsertError) {
      toast({ variant: 'destructive', title: 'Erro ao salvar contatos', description: upsertError.message });
      setFillFromWebhookLogLoading(false);
      return;
    }
    toast({ title: 'Contatos preenchidos', description: `${toUpsert.length} contato(s) adicionados/atualizados a partir dos eventos do webhook.` });
    await loadContacts({ silent: true });
    setFillFromWebhookLogLoading(false);
  }, [effectiveClienteId, loadContacts, toast]);

  /** Reaplica primeira/última mensagem a partir do log (RPC no banco). */
  const recalcContactTimestampsFromWebhookLog = useCallback(async () => {
    if (!effectiveClienteId) return;
    setRecalcTimestampsLoading(true);
    try {
      const { data, error } = await supabase.rpc('recalc_whatsapp_contact_timestamps_from_webhook_log', {
        p_cliente_id: effectiveClienteId,
      });
      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao recalcular datas', description: error.message });
        return;
      }
      const n = typeof data === 'number' ? data : 0;
      toast({
        title: 'Datas recalculadas',
        description: n > 0 ? `${n} contato(s) atualizado(s) com base no log de webhooks.` : 'Nenhum contato precisou de ajuste (ou não há eventos no log para estes números).',
      });
      await loadContacts({ silent: true });
    } finally {
      setRecalcTimestampsLoading(false);
    }
  }, [effectiveClienteId, loadContacts, toast]);

  const filteredContacts = useMemo(() => {
    let list = contacts;
    if (originFilter === ORIGIN_FILTER_META) {
      list = list.filter(isMetaAdsContactForStats);
    } else if (originFilter === ORIGIN_FILTER_NAO_IDENT) {
      list = list.filter((c) => !isMetaAdsContactForStats(c) && c.origin_source === 'nao_identificado');
    }
    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      const termNorm = term.replace(/\D/g, '');
      list = list.filter((c) => {
        const name = (c.sender_name || '').toLowerCase();
        const phone = (c.phone || '').replace(/\D/g, '');
        return name.includes(term) || (c.phone || '').toLowerCase().includes(term) || (termNorm && phone.includes(termNorm));
      });
    }
    if (messageDateFrom || messageDateTo) {
      list = list.filter((c) => rowInMessageDateRange(c, messageDateField, messageDateFrom, messageDateTo));
    }
    return list;
  }, [contacts, originFilter, searchTerm, messageDateField, messageDateFrom, messageDateTo]);

  const filteredLeadsOnlyInFunnel = useMemo(() => {
    let pool = leadsOnlyInFunnel || [];
    const term = searchTerm.trim().toLowerCase();
    const termNorm = term.replace(/\D/g, '');
    if (term) {
      pool = pool.filter((l) => {
        const name = (l.nome || '').toLowerCase();
        const phone = (l.whatsapp || '').replace(/\D/g, '');
        return name.includes(term) || (l.whatsapp || '').toLowerCase().includes(term) || (termNorm && phone.includes(termNorm));
      });
    }
    if (originFilter === ORIGIN_FILTER_META) {
      pool = pool.filter(isMetaAdsLead);
    } else if (originFilter === ORIGIN_FILTER_NAO_IDENT) {
      pool = pool.filter((l) => !isMetaAdsLead(l));
    }
    if (messageDateFrom || messageDateTo) {
      pool = pool.filter((l) =>
        rowInMessageDateRange(
          { first_seen_at: leadFirstSeenIso(l), last_message_at: leadLastMessageIso(l) },
          messageDateField,
          messageDateFrom,
          messageDateTo
        )
      );
    }
    return pool;
  }, [leadsOnlyInFunnel, searchTerm, originFilter, isMetaAdsLead, messageDateField, messageDateFrom, messageDateTo]);

  const displayList = useMemo(() => {
    const leadRows = filteredLeadsOnlyInFunnel.map((l) => ({
      _fromLead: true,
      id: `lead-${l.id}`,
      sender_name: l.nome || null,
      phone: l.whatsapp || null,
      from_jid: (l.whatsapp || '').replace(/\D/g, '') ? `${(l.whatsapp || '').replace(/\D/g, '')}@s.whatsapp.net` : null,
      origin_source: isMetaAdsLead(l) ? 'meta_ads' : 'nao_identificado',
      tracking_data: l.tracking_data || null,
      first_seen_at: leadFirstSeenIso(l),
      last_message_at: leadLastMessageIso(l),
      instance_name: null,
      profile_pic_url: null,
      pipelineNome: l.pipeline?.nome ?? null,
      stageNome: l.stage?.nome ?? null,
      crm_apice_lead_status: l.crm_apice_lead_status ?? null,
      crm_apice_lead_status_at: l.crm_apice_lead_status_at ?? null,
    }));
    return [...filteredContacts, ...leadRows];
  }, [filteredContacts, filteredLeadsOnlyInFunnel, isMetaAdsLead]);

  const getFunnelInfoForRow = useCallback((row) => {
    if (row._fromLead && row.pipelineNome) return { pipelineNome: row.pipelineNome, stageNome: row.stageNome };
    const raw = (row.phone || '').trim() || (row.from_jid || '').replace(/@.*$/, '').trim();
    const variations = getPhoneVariations(raw);
    for (const v of variations) {
      const info = phoneToFunnelInfo.get(v);
      if (info) return info;
    }
    return null;
  }, [phoneToFunnelInfo]);

  const toggleSelectAllContacts = useCallback(() => {
    if (selectedContactIds.size === filteredContacts.length) {
      setSelectedContactIds(new Set());
    } else {
      setSelectedContactIds(new Set(filteredContacts.map((c) => c.id)));
    }
  }, [filteredContacts, selectedContactIds.size]);

  const runExportToFunnel = useCallback(async () => {
    if (!exportPipelineId || !exportStageId || selectedContactIds.size === 0) {
      toast({ variant: 'destructive', title: 'Selecione funil, etapa e pelo menos um contato.' });
      return;
    }
    setExportFunnelLoading(true);
    const toExport = filteredContacts.filter((c) => selectedContactIds.has(c.id));
    let created = 0;
    let already = 0;
    for (const c of toExport) {
      const { data } = await supabase.functions.invoke('create-lead-from-contact', {
        body: {
          from_jid: c.from_jid,
          phone: c.phone || null,
          sender_name: c.sender_name || null,
          profile_pic_url: c.profile_pic_url || null,
          pipeline_id: exportPipelineId,
          stage_id: exportStageId,
          origin_source: c.origin_source || null,
          utm_source: c.utm_source || null,
          utm_medium: c.utm_medium || null,
          utm_campaign: c.utm_campaign || null,
          utm_content: c.utm_content || null,
          utm_term: c.utm_term || null,
          tracking_data: c.tracking_data && typeof c.tracking_data === 'object' ? c.tracking_data : null,
        },
      });
      if (data?.created) created += 1;
      else if (data?.reason === 'already_exists') already += 1;
    }
    setExportFunnelLoading(false);
    setExportFunnelOpen(false);
    setSelectedContactIds(new Set());
    if (created > 0) toast({ title: 'Exportado para o funil', description: `${created} contato(s) adicionados ao funil.${already > 0 ? ` ${already} já existiam no CRM.` : ''}` });
    else if (already > 0) toast({ title: 'Nenhum novo', description: `Todos os ${already} contato(s) já existem no CRM.` });
    else toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível exportar. Tente novamente.' });
  }, [exportPipelineId, exportStageId, selectedContactIds, filteredContacts, toast]);

  /** Contatos na página atual (lista) — usado nos números do filtro junto com leads só no funil. */
  const metaContactsOnly = useMemo(
    () => contacts.filter((c) => isMetaAdsContactForStats(c)).length,
    [contacts]
  );

  /** Leads CRM: partição por origem (lista completa após loadFullAggregates). */
  const leadOriginStats = useMemo(() => {
    const list = allLeadsForStats || [];
    let meta = 0;
    let semOrigem = 0;
    let outras = 0;
    for (const l of list) {
      if (isMetaAdsLead(l)) meta += 1;
      else if (!l?.origem || !String(l.origem).trim()) semOrigem += 1;
      else outras += 1;
    }
    return { totalFetched: list.length, meta, semOrigem, outras };
  }, [allLeadsForStats, isMetaAdsLead]);

  /** Só na amostra da lista (primeira página) — fallback quando não há agregado do banco. */
  const naoIdentInList = useMemo(
    () => contacts.filter((c) => !isMetaAdsContactForStats(c) && c.origin_source === 'nao_identificado').length,
    [contacts]
  );

  const contactBucketsSum = useMemo(() => {
    if (!contactOriginDb) return null;
    return contactOriginDb.meta + contactOriginDb.outras + contactOriginDb.nao + contactOriginDb.google;
  }, [contactOriginDb]);

  /** Busca, período ou origem no dropdown: os cards acompanham a mesma lógica da tabela (contatos = base completa quando já carregada). */
  const listFiltersActive = useMemo(
    () =>
      Boolean(
        searchTerm.trim() ||
        messageDateFrom ||
        messageDateTo ||
        originFilter !== ORIGIN_FILTER_ALL
      ),
    [searchTerm, messageDateFrom, messageDateTo, originFilter]
  );

  const contactCardStatsFiltered = useMemo(() => {
    const source = allContactsFull.length > 0 ? allContactsFull : contacts;
    const list = source.filter((c) => {
      if (originFilter === ORIGIN_FILTER_META && !isMetaAdsContactForStats(c)) return false;
      if (
        originFilter === ORIGIN_FILTER_NAO_IDENT &&
        !(!isMetaAdsContactForStats(c) && c.origin_source === 'nao_identificado')
      ) {
        return false;
      }
      const term = searchTerm.trim().toLowerCase();
      const termNorm = term.replace(/\D/g, '');
      if (term) {
        const name = (c.sender_name || '').toLowerCase();
        const phone = (c.phone || '').replace(/\D/g, '');
        if (!(name.includes(term) || (c.phone || '').toLowerCase().includes(term) || (termNorm && phone.includes(termNorm)))) {
          return false;
        }
      }
      if (messageDateFrom || messageDateTo) {
        if (!rowInMessageDateRange(c, messageDateField, messageDateFrom, messageDateTo)) return false;
      }
      return true;
    });
    let meta = 0;
    let google = 0;
    let outras = 0;
    let nao = 0;
    for (const c of list) {
      if (isMetaAdsContactForStats(c)) {
        meta += 1;
        continue;
      }
      if (c.origin_source === 'google_ads') google += 1;
      else if (c.origin_source === 'nao_identificado') nao += 1;
      else if (c.origin_source && !['nao_identificado', 'google_ads'].includes(c.origin_source)) outras += 1;
    }
    return { total: list.length, meta, google, outras, nao, usedFullDataset: allContactsFull.length > 0 };
  }, [
    allContactsFull,
    contacts,
    originFilter,
    searchTerm,
    messageDateField,
    messageDateFrom,
    messageDateTo,
  ]);

  const leadCardStatsFiltered = useMemo(() => {
    let list = allLeadsForStats || [];
    if (originFilter === ORIGIN_FILTER_META) list = list.filter(isMetaAdsLead);
    else if (originFilter === ORIGIN_FILTER_NAO_IDENT) list = list.filter((l) => !isMetaAdsLead(l));
    const term = searchTerm.trim().toLowerCase();
    const termNorm = term.replace(/\D/g, '');
    if (term) {
      list = list.filter((l) => {
        const name = (l.nome || '').toLowerCase();
        const phone = (l.whatsapp || '').replace(/\D/g, '');
        return name.includes(term) || (l.whatsapp || '').toLowerCase().includes(term) || (termNorm && phone.includes(termNorm));
      });
    }
    if (messageDateFrom || messageDateTo) {
      list = list.filter((l) =>
        rowInMessageDateRange(
          { first_seen_at: leadFirstSeenIso(l), last_message_at: leadLastMessageIso(l) },
          messageDateField,
          messageDateFrom,
          messageDateTo
        )
      );
    }
    let meta = 0;
    let semOrigem = 0;
    let outras = 0;
    for (const l of list) {
      if (isMetaAdsLead(l)) meta += 1;
      else if (!l?.origem || !String(l.origem).trim()) semOrigem += 1;
      else outras += 1;
    }
    return { total: list.length, meta, semOrigem, outras };
  }, [allLeadsForStats, originFilter, searchTerm, messageDateField, messageDateFrom, messageDateTo, isMetaAdsLead]);

  /** Valores exibidos nos cards: totais do banco ou totais filtrados. */
  const contactCardsDisplay = useMemo(() => {
    if (!listFiltersActive) {
      return {
        total: contactsTotalDbCount ?? contactOriginDb?.total ?? contacts.length,
        meta: contactOriginDb?.meta ?? metaContactsOnly,
        google: contactOriginDb != null ? contactOriginDb.google : contacts.filter((c) => !isMetaAdsContactForStats(c) && c.origin_source === 'google_ads').length,
        outras:
          contactOriginDb != null
            ? contactOriginDb.outras
            : contacts.filter(
                (c) =>
                  !isMetaAdsContactForStats(c) &&
                  c.origin_source &&
                  !['nao_identificado', 'google_ads'].includes(c.origin_source)
              ).length,
        nao: contactOriginDb?.nao ?? naoIdentInList,
        subtitle: 'global',
      };
    }
    return {
      total: contactCardStatsFiltered.total,
      meta: contactCardStatsFiltered.meta,
      google: contactCardStatsFiltered.google,
      outras: contactCardStatsFiltered.outras,
      nao: contactCardStatsFiltered.nao,
      subtitle: 'filtered',
      partialList: !contactCardStatsFiltered.usedFullDataset,
    };
  }, [
    listFiltersActive,
    contactsTotalDbCount,
    contactOriginDb,
    contacts,
    contactCardStatsFiltered,
    metaContactsOnly,
    naoIdentInList,
  ]);

  const leadCardsDisplay = useMemo(() => {
    if (!listFiltersActive) {
      return {
        total: leadsTotalDbCount ?? leadOriginStats.totalFetched,
        meta: leadOriginStats.meta,
        semOrigem: leadOriginStats.semOrigem,
        outras: leadOriginStats.outras,
        subtitle: 'global',
      };
    }
    return {
      total: leadCardStatsFiltered.total,
      meta: leadCardStatsFiltered.meta,
      semOrigem: leadCardStatsFiltered.semOrigem,
      outras: leadCardStatsFiltered.outras,
      subtitle: 'filtered',
    };
  }, [listFiltersActive, leadsTotalDbCount, leadOriginStats, leadCardStatsFiltered]);

  /**
   * Telefones únicos entre WhatsApp + CRM: mesma origem “vence” por prioridade
   * Meta > Google > Outras > Não rastreada/sem origem (linhas sem bucket de origem = none, não entram nos 3 cards).
   */
  const mergedUniqueStats = useMemo(() => {
    const classifyContact = (c) => {
      if (isMetaAdsContactForStats(c)) return 'meta';
      if (c.origin_source === 'google_ads') return 'google';
      if (c.origin_source === 'nao_identificado') return 'nao';
      if (c.origin_source && !['nao_identificado', 'google_ads'].includes(c.origin_source)) return 'outras';
      return 'none';
    };
    const classifyLead = (l) => {
      if (isMetaAdsLead(l)) return 'meta';
      if (!l?.origem || !String(l.origem).trim()) return 'nao';
      return 'outras';
    };

    const contactSource = allContactsFull.length > 0 ? allContactsFull : contacts;
    let contactList;
    if (!listFiltersActive) {
      contactList = contactSource;
    } else {
      contactList = contactSource.filter((c) => {
        if (originFilter === ORIGIN_FILTER_META && !isMetaAdsContactForStats(c)) return false;
        if (
          originFilter === ORIGIN_FILTER_NAO_IDENT &&
          !(!isMetaAdsContactForStats(c) && c.origin_source === 'nao_identificado')
        ) {
          return false;
        }
        const term = searchTerm.trim().toLowerCase();
        const termNorm = term.replace(/\D/g, '');
        if (term) {
          const name = (c.sender_name || '').toLowerCase();
          const phone = (c.phone || '').replace(/\D/g, '');
          if (!(name.includes(term) || (c.phone || '').toLowerCase().includes(term) || (termNorm && phone.includes(termNorm)))) {
            return false;
          }
        }
        if (messageDateFrom || messageDateTo) {
          if (!rowInMessageDateRange(c, messageDateField, messageDateFrom, messageDateTo)) return false;
        }
        return true;
      });
    }

    let leadList = allLeadsForStats || [];
    if (listFiltersActive) {
      if (originFilter === ORIGIN_FILTER_META) leadList = leadList.filter(isMetaAdsLead);
      else if (originFilter === ORIGIN_FILTER_NAO_IDENT) leadList = leadList.filter((l) => !isMetaAdsLead(l));
      const term = searchTerm.trim().toLowerCase();
      const termNorm = term.replace(/\D/g, '');
      if (term) {
        leadList = leadList.filter((l) => {
          const name = (l.nome || '').toLowerCase();
          const phone = (l.whatsapp || '').replace(/\D/g, '');
          return name.includes(term) || (l.whatsapp || '').toLowerCase().includes(term) || (termNorm && phone.includes(termNorm));
        });
      }
      if (messageDateFrom || messageDateTo) {
        leadList = leadList.filter((l) =>
          rowInMessageDateRange(
            { first_seen_at: leadFirstSeenIso(l), last_message_at: leadLastMessageIso(l) },
            messageDateField,
            messageDateFrom,
            messageDateTo
          )
        );
      }
    }

    const byKey = new Map();
    for (const c of contactList) {
      const k = contactRowDedupeKey(c);
      byKey.set(k, mergeOriginCategory(byKey.get(k), classifyContact(c)));
    }
    for (const l of leadList) {
      const k = leadRowDedupeKey(l);
      byKey.set(k, mergeOriginCategory(byKey.get(k), classifyLead(l)));
    }

    let metaUnique = 0;
    let outrasUnique = 0;
    let naoUnique = 0;
    for (const cat of byKey.values()) {
      if (cat === 'meta') metaUnique += 1;
      else if (cat === 'google' || cat === 'outras') outrasUnique += 1;
      else if (cat === 'nao') naoUnique += 1;
    }
    return { metaUnique, outrasUnique, naoUnique };
  }, [
    listFiltersActive,
    allContactsFull,
    contacts,
    originFilter,
    searchTerm,
    messageDateField,
    messageDateFrom,
    messageDateTo,
    allLeadsForStats,
    isMetaAdsLead,
  ]);

  /** Números do select de origem: mesma lógica de busca + datas + leads só no funil. */
  const filterTodosCount = filteredContacts.length + filteredLeadsOnlyInFunnel.length;

  /** Lista de contatos no estado pode ser só as primeiras páginas (~1000); não exibir esse número como “total”. */
  const listaContatosCortada =
    contactsTotalDbCount != null && contacts.length < contactsTotalDbCount;

  const filterMetaCount = useMemo(() => {
    let list = contacts.filter(isMetaAdsContactForStats);
    const term = searchTerm.trim().toLowerCase();
    const termNorm = term.replace(/\D/g, '');
    if (term) {
      list = list.filter((c) => {
        const name = (c.sender_name || '').toLowerCase();
        const phone = (c.phone || '').replace(/\D/g, '');
        return name.includes(term) || (c.phone || '').toLowerCase().includes(term) || (termNorm && phone.includes(termNorm));
      });
    }
    if (messageDateFrom || messageDateTo) {
      list = list.filter((c) => rowInMessageDateRange(c, messageDateField, messageDateFrom, messageDateTo));
    }
    let lp = (leadsOnlyInFunnel || []).filter(isMetaAdsLead);
    if (term) {
      lp = lp.filter((l) => {
        const name = (l.nome || '').toLowerCase();
        const phone = (l.whatsapp || '').replace(/\D/g, '');
        return name.includes(term) || (l.whatsapp || '').toLowerCase().includes(term) || (termNorm && phone.includes(termNorm));
      });
    }
    if (messageDateFrom || messageDateTo) {
      lp = lp.filter((l) =>
        rowInMessageDateRange(
          { first_seen_at: leadFirstSeenIso(l), last_message_at: leadLastMessageIso(l) },
          messageDateField,
          messageDateFrom,
          messageDateTo
        )
      );
    }
    return list.length + lp.length;
  }, [contacts, leadsOnlyInFunnel, searchTerm, messageDateField, messageDateFrom, messageDateTo, isMetaAdsLead]);

  const filterNaoIdentCount = useMemo(() => {
    let list = contacts.filter((c) => !isMetaAdsContactForStats(c) && c.origin_source === 'nao_identificado');
    const term = searchTerm.trim().toLowerCase();
    const termNorm = term.replace(/\D/g, '');
    if (term) {
      list = list.filter((c) => {
        const name = (c.sender_name || '').toLowerCase();
        const phone = (c.phone || '').replace(/\D/g, '');
        return name.includes(term) || (c.phone || '').toLowerCase().includes(term) || (termNorm && phone.includes(termNorm));
      });
    }
    if (messageDateFrom || messageDateTo) {
      list = list.filter((c) => rowInMessageDateRange(c, messageDateField, messageDateFrom, messageDateTo));
    }
    let lp = (leadsOnlyInFunnel || []).filter((l) => !isMetaAdsLead(l));
    if (term) {
      lp = lp.filter((l) => {
        const name = (l.nome || '').toLowerCase();
        const phone = (l.whatsapp || '').replace(/\D/g, '');
        return name.includes(term) || (l.whatsapp || '').toLowerCase().includes(term) || (termNorm && phone.includes(termNorm));
      });
    }
    if (messageDateFrom || messageDateTo) {
      lp = lp.filter((l) =>
        rowInMessageDateRange(
          { first_seen_at: leadFirstSeenIso(l), last_message_at: leadLastMessageIso(l) },
          messageDateField,
          messageDateFrom,
          messageDateTo
        )
      );
    }
    return list.length + lp.length;
  }, [contacts, leadsOnlyInFunnel, searchTerm, messageDateField, messageDateFrom, messageDateTo, isMetaAdsLead]);

  const openExportCsvDialog = useCallback(() => {
    setExportCsvScope('screen');
    setExportCsvOrigin(originFilter);
    setExportCsvDateField(messageDateField);
    setExportCsvDateFrom(messageDateFrom);
    setExportCsvDateTo(messageDateTo);
    setExportCsvSearch(searchTerm);
    setExportCsvOpen(true);
  }, [originFilter, messageDateField, messageDateFrom, messageDateTo, searchTerm]);

  const applyPageFiltersToExportForm = useCallback(() => {
    setExportCsvOrigin(originFilter);
    setExportCsvDateField(messageDateField);
    setExportCsvDateFrom(messageDateFrom);
    setExportCsvDateTo(messageDateTo);
    setExportCsvSearch(searchTerm);
  }, [originFilter, messageDateField, messageDateFrom, messageDateTo, searchTerm]);

  const runExportCsv = useCallback(async () => {
    if (!canLoadData) return;

    const headers = [
      'Nome',
      'Telefone',
      'Origem',
      'Campanha',
      'Conjunto de anúncio',
      'Anúncio',
      'Primeira mensagem',
      'Última mensagem',
      'Conta (WhatsApp)',
      'Funil',
      'Etapa',
      'Etiqueta (CRM-Apice)',
      'Rastreio (UTM)',
    ];
    const escape = (v) => (v == null ? '' : String(v).replace(/"/g, '""'));

    const buildRow = (c, resolveFunnel) => {
      const name =
        (c.tracking_data?.lead_name && String(c.tracking_data.lead_name).trim()) ||
        c.sender_name ||
        c.phone ||
        c.from_jid ||
        '';
      const rowIsMetaAds = c._fromLead ? c.origin_source === 'meta_ads' : isMetaAdsContactForStats(c);
      const origin =
        rowIsMetaAds
          ? c.utm_campaign
            ? 'Meta Ads · Via Campanha'
            : 'Meta Ads'
          : c.origin_source === 'google_ads'
            ? 'Google Ads'
            : 'Não rastreada';
      const campaign =
        c.tracking_data?.meta_ad_details?.ad?.campaign?.name ?? c.tracking_data?.campaign_name ?? '';
      const adset = c.tracking_data?.meta_ad_details?.ad?.adset?.name ?? '';
      const ad = c.tracking_data?.meta_ad_details?.ad?.name ?? c.tracking_data?.ad_name ?? '';
      const conta = (c.instance_name && String(c.instance_name).trim()) || '';
      const fi = resolveFunnel(c);
      const funnel = fi?.pipelineNome ?? '';
      const etapa = fi?.stageNome ?? '';
      const etiquetaApice = c.crm_apice_lead_status ? `CRM-Apice: ${c.crm_apice_lead_status}` : '';
      const rastreio =
        [c.utm_source, c.utm_medium, c.utm_campaign].filter(Boolean).join(' · ') ||
        (rowIsMetaAds ? 'Meta Ads' : '');
      return [
        name,
        c.phone || c.from_jid || '',
        origin,
        campaign,
        adset,
        ad,
        formatDate(c.first_seen_at),
        formatDate(c.last_message_at),
        conta,
        funnel,
        etapa,
        etiquetaApice,
        rastreio || '—',
      ]
        .map(escape)
        .map((v) => `"${v}"`)
        .join(',');
    };

    let rows;
    let resolveFunnel;

    if (exportCsvScope === 'screen') {
      rows = displayList;
      resolveFunnel = getFunnelInfoForRow;
    } else {
      setExportCsvRunning(true);
      try {
        const allC = canLoadAllClients
          ? await fetchAllClienteWhatsappContactsPagedByClientes(supabase, adminClienteIds)
          : await fetchAllClienteWhatsappContactsPaged(supabase, effectiveClienteId);
        const allL = canLoadAllClients
          ? await fetchAllLeadsPagedByClientes(supabase, adminClienteIds)
          : await fetchAllLeadsPaged(supabase, effectiveClienteId);
        const funnelMap = buildFunnelMapFromLeads(allL);
        resolveFunnel = createGetFunnelInfoForExport(funnelMap);
        const filt = {
          origin: exportCsvOrigin,
          search: exportCsvSearch,
          dateField: exportCsvDateField,
          dateFrom: exportCsvDateFrom,
          dateTo: exportCsvDateTo,
        };
        const filteredC = filterContactsForExport(allC, filt);
        const onlyFunnel = computeLeadsOnlyInFunnelFromContacts(allC, allL);
        const filteredL = filterLeadsForExport(onlyFunnel, filt);
        rows = [...filteredC, ...mapLeadsToExportDisplayRows(filteredL)];
      } catch (e) {
        console.error(e);
        toast({
          variant: 'destructive',
          title: 'Erro ao carregar dados',
          description: e?.message || String(e),
        });
        setExportCsvRunning(false);
        return;
      }
      setExportCsvRunning(false);
    }

    if (!rows.length) {
      toast({
        variant: 'destructive',
        title: 'Nada para exportar',
        description:
          exportCsvScope === 'screen'
            ? 'Não há linhas na tabela com os filtros atuais.'
            : 'Ajuste origem, período ou texto de busca.',
      });
      return;
    }

    const csv = [headers.map((h) => `"${escape(h)}"`).join(','), ...rows.map((c) => buildRow(c, resolveFunnel))].join('\r\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const suffix = exportCsvScope === 'screen' ? 'tabela' : 'banco';
    a.download = `contatos-${suffix}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({
      title: 'Exportado',
      description: `${rows.length} linha(s) · ${exportCsvScope === 'screen' ? 'igual à tabela' : 'base completa filtrada'}.`,
    });
    setExportCsvOpen(false);
  }, [
    canLoadData,
    canLoadAllClients,
    adminClienteIds,
    effectiveClienteId,
    displayList,
    exportCsvScope,
    exportCsvOrigin,
    exportCsvSearch,
    exportCsvDateField,
    exportCsvDateFrom,
    exportCsvDateTo,
    getFunnelInfoForRow,
    toast,
  ]);

  useEffect(() => {
    if (!contactEventsViewing) {
      setMetaAdDetails(null);
      setMetaAdDetailsLoading(false);
      setMetaAdDetailsError(null);
    } else {
      const saved = contactEventsViewing.tracking_data?.meta_ad_details;
      setMetaAdDetails(saved && saved.ad ? saved : null);
      setMetaAdDetailsError(null);
    }
  }, [contactEventsViewing]);

  useEffect(() => {
    const contact = contactEventsViewing;
    if (!contact || !effectiveClienteId || !isMetaAdsContactForStats(contact) || !effectiveSourceIdForMeta) return;
    if (contact.tracking_data?.meta_ad_details?.ad) return;
    const key = `${contact.from_jid}:${effectiveSourceIdForMeta}`;
    if (metaAutoLoadDoneRef.current.has(key)) return;
    metaAutoLoadDoneRef.current.add(key);

    let cancelled = false;
    setMetaAdDetailsLoading(true);
    setMetaAdDetailsError(null);
    setMetaAdDetails(null);
    (async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke('meta-ads-api', {
          body: { action: 'get-ad-by-id', adId: effectiveSourceIdForMeta },
        });
        if (cancelled) return;
        if (fnError) {
          setMetaAdDetailsError('Não foi possível carregar dados deste anúncio no Meta.');
          return;
        }
        if (data?.error) {
          setMetaAdDetailsError('Não foi possível carregar dados deste anúncio no Meta.');
          return;
        }
        const payload = data ?? null;
        if (payload?.ad) {
          const fetchedAt = new Date().toISOString();
          setMetaAdDetails({ ...payload, fetched_at: fetchedAt });
          const metaEntry = { accountName: payload.accountName, ad: payload.ad, fetched_at: fetchedAt };
          const prev = contact.tracking_data || {};
          const history = [...(Array.isArray(prev.meta_ad_details_history) ? prev.meta_ad_details_history : []), { fetched_at: fetchedAt, accountName: payload.accountName, ad: payload.ad }].slice(-30);
          const nextTracking = { ...prev, meta_ad_details: metaEntry, meta_ad_details_history: history };
          const { error: updateErr } = await supabase
            .from('cliente_whatsapp_contact')
            .update({ tracking_data: nextTracking, updated_at: new Date().toISOString() })
            .eq('cliente_id', effectiveClienteId)
            .eq('from_jid', contact.from_jid);
          if (!updateErr) {
            setContactEventsViewing((prev) => (prev ? { ...prev, tracking_data: nextTracking } : prev));
            loadContacts({ silent: true });
          }
        } else {
          setMetaAdDetails(payload);
        }
      } catch {
        if (!cancelled) setMetaAdDetailsError('Não foi possível carregar dados deste anúncio no Meta.');
      } finally {
        if (!cancelled) setMetaAdDetailsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [contactEventsViewing, effectiveClienteId, effectiveSourceIdForMeta, loadContacts]);

  useEffect(() => {
    if (!contactEventsViewing || !effectiveClienteId) {
      setContactEvents([]);
      return;
    }
    setContactEventsLoading(true);
    const jid = contactEventsViewing.from_jid;
    const phoneOnly = jid ? String(jid).replace(/@s\.whatsapp\.net$/i, '').trim() : '';
    const fromJidValues = [...new Set([jid, phoneOnly].filter(Boolean))];
    let query = supabase
      .from('cliente_whatsapp_webhook_log')
      .select('id, created_at, source, body_preview, status, raw_payload, from_jid')
      .eq('cliente_id', effectiveClienteId)
      .order('created_at', { ascending: false })
      .limit(100);
    query = fromJidValues.length ? query.in('from_jid', fromJidValues) : query.eq('from_jid', jid);
    query
      .then(({ data }) => setContactEvents(data || []))
      .finally(() => setContactEventsLoading(false));
  }, [contactEventsViewing?.id, contactEventsViewing?.from_jid, effectiveClienteId]);

  const hasSourceId = (raw) => {
    if (!raw || typeof raw !== 'object') return false;
    const body = raw;
    const payload = (body.data && typeof body.data === 'object' ? body.data : body) || {};
    const chat = body.chat ?? payload.chat;
    const v = (o, ...keys) => { if (!o) return null; for (const k of keys) if (o[k] != null && String(o[k]).trim()) return true; return false; };
    return v(body, 'source_id', 'sourceId') || v(payload, 'source_id', 'sourceId') || (chat && v(chat, 'source_id', 'sourceId'));
  };

  if (configLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      {!embeddedInCrm && (
        <Helmet>
          <title>Contatos - CRM</title>
        </Helmet>
      )}
      <div className={embeddedInCrm ? 'space-y-6' : 'space-y-4'}>
        <div className="flex flex-col gap-3">
          {embeddedInCrm && isAdminWithoutCliente && !allClientsMode && clientesForAdmin?.length > 0 && (
            <div className="rounded-xl border border-slate-200/80 dark:border-slate-700/50 bg-white dark:bg-card p-4 shadow-sm">
              <Label className="text-sm font-medium text-muted-foreground block mb-2">Cliente</Label>
              <Select value={selectedClienteId || ''} onValueChange={(v) => setSelectedClienteId(v || null)}>
                <SelectTrigger className="w-full sm:w-[280px] h-10 rounded-lg">
                  <SelectValue placeholder="Selecione o cliente para ver os contatos" />
                </SelectTrigger>
                <SelectContent>
                  {clientesForAdmin.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.empresa || c.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {/* Título + cliente (admin) + Novo */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
              {(!embeddedInCrm || !isAdminWithoutCliente) && (
                <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
                  Contatos
                </h1>
              )}
              {!embeddedInCrm && isAdminWithoutCliente && !allClientsMode && clientesForAdmin?.length > 0 && (
                <Select value={selectedClienteId || ''} onValueChange={(v) => setSelectedClienteId(v || null)}>
                  <SelectTrigger className="w-full sm:w-[200px] h-9">
                    <SelectValue placeholder="Selecione o cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientesForAdmin.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.empresa || c.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            {onNovoLead ? (
              <Button
                type="button"
                size="sm"
                className="h-8 text-sm rounded-md gap-1 bg-blue-600 hover:bg-blue-700 text-white shrink-0 w-full sm:w-auto justify-center px-3"
                onClick={onNovoLead}
                disabled={!effectiveClienteId}
                title={!effectiveClienteId ? 'Cliente não disponível' : 'Adicionar novo lead'}
              >
                <PlusCircle className="h-3.5 w-3.5" />
                Novo
              </Button>
            ) : null}
          </div>

          <div className="rounded-xl border border-slate-200/80 dark:border-slate-700/60 bg-white dark:bg-card shadow-sm overflow-hidden">
            <div className="p-2 sm:p-3 space-y-2.5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Ações</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button variant="outline" size="sm" className="h-8 text-xs rounded-md gap-1 px-2.5" onClick={openExportCsvDialog} disabled={loading || !canLoadData}>
                    <FileDown className="h-3.5 w-3.5" />
                    Exportar contatos
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 text-xs rounded-md gap-1 px-2.5" onClick={() => openExportFunnelForContacts(filteredContacts)} disabled={loading || filteredContacts.length === 0} title="Exportar todos para um funil">
                    <Send className="h-3.5 w-3.5" />
                    Exportar para funil
                  </Button>
                  {selectedContactIds.size > 0 && (
                    <Button variant="default" size="sm" className="h-8 text-xs rounded-md gap-1 px-2.5" onClick={() => openExportFunnelForContacts(filteredContacts.filter((c) => selectedContactIds.has(c.id)))}>
                      <Send className="h-3.5 w-3.5" />
                      Exportar {selectedContactIds.size} selecionado(s)
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="h-8 text-xs rounded-md gap-1 px-2.5" onClick={fillContactsFromWebhookLog} disabled={loading || fillFromWebhookLogLoading}>
                    {fillFromWebhookLogLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    Importar contatos
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs rounded-md gap-1 px-2.5"
                    onClick={recalcContactTimestampsFromWebhookLog}
                    disabled={loading || !effectiveClienteId || recalcTimestampsLoading}
                    title="Atualiza primeira e última mensagem de todos os contatos deste cliente usando o histórico salvo no log de webhooks"
                  >
                    {recalcTimestampsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Recalcular datas
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 text-xs rounded-md gap-1 px-2.5" onClick={() => setImportFacebookLeadsOpen(true)} disabled={!effectiveClienteId} title="Importar leads da Gestão de leads dos anúncios (Facebook Lead Ads)">
                    <Facebook className="h-3.5 w-3.5" />
                    Importar leads do Facebook
                  </Button>
                </div>
              </div>

              {effectiveClienteId && (
                <div className="border-t border-slate-200/70 dark:border-slate-700/50 pt-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Filtros</p>
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
                    <div className="relative flex-1 min-w-[min(100%,200px)] max-w-md">
                      <Input
                        placeholder="Pesquisar"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="h-8 pl-2 pr-8 text-sm rounded-md bg-muted/30 border-gray-200/80 dark:border-gray-700/50"
                      />
                      <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    </div>
                    <Select value={originFilter} onValueChange={setOriginFilter}>
                      <SelectTrigger className="h-8 w-[min(100%,158px)] sm:w-[158px] text-xs rounded-md border-gray-200/80 dark:border-gray-700/50 px-2">
                        <Filter className="h-3.5 w-3.5 mr-1 shrink-0" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ORIGIN_FILTER_ALL}>
                          {listFiltersActive || !listaContatosCortada ? `Todos (${filterTodosCount})` : 'Todos'}
                        </SelectItem>
                        <SelectItem value={ORIGIN_FILTER_META}>Meta Ads ({filterMetaCount})</SelectItem>
                        <SelectItem value={ORIGIN_FILTER_NAO_IDENT}>Não identificado ({filterNaoIdentCount})</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2 text-xs rounded-md"
                      onClick={() => loadContacts({ resetMetaBatchKey: true })}
                      disabled={loading || aggregatesLoading}
                      title="Recarrega lista e totais"
                    >
                      {loading || aggregatesLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      Atualizar
                    </Button>
                    <Select value={messageDateField} onValueChange={setMessageDateField}>
                      <SelectTrigger className="h-8 w-[min(100%,168px)] sm:w-[168px] text-xs rounded-md border-gray-200/80 dark:border-gray-700/50 px-2">
                        <CalendarRange className="h-3.5 w-3.5 mr-1 shrink-0" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={MESSAGE_DATE_FIELD_FIRST}>Primeira mensagem</SelectItem>
                        <SelectItem value={MESSAGE_DATE_FIELD_LAST}>Última mensagem</SelectItem>
                      </SelectContent>
                    </Select>
                    <ContatosBrDateInput
                      id="contatos-date-from"
                      valueIso={messageDateFrom}
                      onChangeIso={setMessageDateFrom}
                      aria-label="Data inicial do período"
                    />
                    <span className="text-muted-foreground text-xs px-0.5 shrink-0">até</span>
                    <ContatosBrDateInput
                      id="contatos-date-to"
                      valueIso={messageDateTo}
                      onChangeIso={setMessageDateTo}
                      aria-label="Data final do período"
                    />
                    {(messageDateFrom || messageDateTo) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs shrink-0"
                        onClick={() => {
                          setMessageDateFrom('');
                          setMessageDateTo('');
                        }}
                      >
                        Limpar
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {!canLoadData ? (
          <Card className="rounded-xl border-slate-200/60 dark:border-slate-700/50 bg-white dark:bg-card shadow-sm">
            <CardContent className="py-12 px-6 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 mb-4">
                <Users className="h-7 w-7" />
              </div>
              <p className="text-sm font-medium text-foreground">
                {isAdminWithoutCliente ? 'Selecione um cliente' : 'Cliente não identificado'}
              </p>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                {isAdminWithoutCliente ? 'Use o seletor acima para escolher o cliente e visualizar os contatos.' : 'Não foi possível identificar o cliente.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="rounded-xl border-slate-200/60 dark:border-slate-700/50 overflow-hidden bg-white dark:bg-card shadow-sm">
            <CardContent className="p-0">
              <div className="p-5 pb-4 border-b border-slate-200/60 dark:border-slate-700/50 space-y-4">
                <div
                  className="rounded-lg border border-slate-200/70 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-900/20 px-3 py-2"
                  title="Contatos = total no banco (WhatsApp). Meta / Outras / Não = telefones únicos entre contatos + leads (prioridade Meta → Google → Outras → Não)."
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex flex-wrap items-center gap-2">
                    <span>Resumo</span>
                    {listFiltersActive && (
                      <span className="normal-case font-normal text-[10px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200">
                        Filtros ativos
                      </span>
                    )}
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* 1 — Contatos (só tabela cliente_whatsapp_contact) */}
                  <div
                    className="rounded-xl border border-primary/20 bg-primary/5 dark:bg-primary/10 p-4 flex flex-col gap-2 min-h-[120px]"
                    title={
                      listFiltersActive
                        ? 'Contatos com os filtros atuais.'
                        : 'Total de linhas na tabela de contatos WhatsApp no banco.'
                    }
                  >
                    <div className="flex items-start gap-2">
                      <MessageCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-muted-foreground">Contatos</p>
                        <p className="text-[10px] text-muted-foreground/90 leading-tight">
                          {listFiltersActive ? 'Conforme filtros' : 'No banco'}
                        </p>
                      </div>
                    </div>
                    <p className="text-2xl font-semibold tabular-nums text-foreground flex-1 flex items-center">
                      {contactCardsDisplay.total.toLocaleString('pt-BR')}
                    </p>
                    {(contactCardsDisplay.subtitle === 'filtered' ||
                      (!listFiltersActive &&
                        contactOriginDb != null &&
                        contactBucketsSum != null &&
                        contactBucketsSum !== contactOriginDb.total)) && (
                      <p className="text-[10px] text-muted-foreground leading-snug mt-auto min-h-[1rem]">
                        {contactCardsDisplay.subtitle === 'filtered' ? (
                          <>
                            Filtros aplicados.
                            {contactCardsDisplay.partialList && (
                              <span className="block text-amber-700 dark:text-amber-400 mt-0.5">Lista parcial.</span>
                            )}
                          </>
                        ) : (
                          <span className="block text-amber-700 dark:text-amber-400 mt-0.5">
                            Somas por origem ≠ total no banco.
                          </span>
                        )}
                      </p>
                    )}
                  </div>

                  {/* 2 — Meta unificado */}
                  <div
                    className="rounded-xl border border-slate-200/50 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-900/30 p-4 flex flex-col gap-1 min-h-[120px]"
                    title="Telefones únicos · Meta. Mesmo número nas duas bases conta uma vez."
                  >
                    <div className="flex items-center gap-2">
                      <MetaLogoIcon className="h-10 w-10 shrink-0" />
                      <p className="text-xs font-medium text-muted-foreground">Meta Ads</p>
                    </div>
                    <p className="text-2xl font-semibold tabular-nums inline-flex items-center min-h-[32px]">
                      {aggregatesLoading && contactOriginDb == null && !listFiltersActive ? (
                        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
                      ) : (
                        mergedUniqueStats.metaUnique
                      )}
                    </p>
                  </div>

                  {/* 3 — Outras unificadas (inclui Google nos contatos) */}
                  <div
                    className="rounded-xl border border-slate-200/50 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-900/30 p-4 flex flex-col gap-1 min-h-[120px]"
                    title="Telefones únicos · Google e outras origens (não Meta)."
                  >
                    <div className="flex items-center gap-2">
                      <Globe className="h-5 w-5 text-slate-600 dark:text-slate-400 shrink-0" />
                      <p className="text-xs font-medium text-muted-foreground">Outras / Google</p>
                    </div>
                    <p className="text-2xl font-semibold tabular-nums inline-flex items-center min-h-[32px]">
                      {aggregatesLoading && contactOriginDb == null && !listFiltersActive ? (
                        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
                      ) : (
                        mergedUniqueStats.outrasUnique
                      )}
                    </p>
                  </div>

                  {/* 4 — Não rastreada + sem origem */}
                  <div
                    className="rounded-xl border border-slate-200/50 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-900/30 p-4 flex flex-col gap-1 min-h-[120px]"
                    title="Telefones únicos · não rastreada ou lead sem origem."
                  >
                    <div className="flex items-center gap-2">
                      <UserX className="h-5 w-5 text-orange-700 dark:text-orange-400 shrink-0" />
                      <p className="text-xs font-medium text-muted-foreground">Não rastreada / sem origem</p>
                    </div>
                    <p className="text-2xl font-semibold tabular-nums inline-flex items-center min-h-[32px]">
                      {aggregatesLoading && contactOriginDb == null && !listFiltersActive ? (
                        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
                      ) : (
                        mergedUniqueStats.naoUnique
                      )}
                    </p>
                  </div>
                </div>

                <div className="hidden rounded-xl border border-slate-200/50 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-900/30 p-4 flex items-center gap-4">
                  <GoogleAdsIcon className="h-20 w-20" />
                  <div>
                    <p className="text-sm text-muted-foreground">Google Ads (contatos)</p>
                    <p className="text-xl font-semibold tabular-nums">{contactCardsDisplay.google}</p>
                  </div>
                </div>
              </div>
              {batchEnrichingMeta && (
                <div
                  className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 py-2 px-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-200 text-sm"
                  title="Campanha, conjunto e anúncio do Meta. Alguns podem ficar em branco se a API não retornar."
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                    <span>
                      Carregando Meta…
                      {metaEnrichProgress != null && (
                        <>
                          {' '}
                          <span className="tabular-nums font-semibold">
                            {metaEnrichProgress.done}/{metaEnrichProgress.total}
                          </span>
                        </>
                      )}
                    </span>
                  </div>
                </div>
              )}
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : displayList.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="text-sm text-muted-foreground">Nenhum contato encontrado.</p>
                  <p className="text-xs text-muted-foreground mt-1">Use &quot;Importar contatos&quot; para preencher a partir dos eventos do webhook.</p>
                </div>
              ) : (
                <div className="flex flex-col min-h-0">
                  {(messageDateFrom || messageDateTo) && (
                    <div className="px-4 py-2 border-b border-slate-200/60 dark:border-slate-700/50 bg-slate-50/80 dark:bg-slate-900/40 shrink-0">
                      <p className="text-xs text-muted-foreground">
                        Filtro de data —{' '}
                        <span className="font-medium text-foreground">
                          {messageDateField === MESSAGE_DATE_FIELD_FIRST ? 'Primeira mensagem' : 'Última mensagem'}
                        </span>
                        {': '}
                        <span className="tabular-nums">
                          {messageDateFrom ? isoYmdToBrDisplay(messageDateFrom) : '…'}
                        </span>
                        {' → '}
                        <span className="tabular-nums">
                          {messageDateTo ? isoYmdToBrDisplay(messageDateTo) : '…'}
                        </span>
                        {' · '}
                        <span className="font-semibold text-foreground tabular-nums">{displayList.length}</span> linha(s) na lista
                      </p>
                    </div>
                  )}
                  <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-gray-50/95 dark:bg-gray-900/95 border-b border-gray-200/80 dark:border-gray-700/50">
                      <tr>
                        <th className="w-10 py-3 px-2 text-left">
                          <Checkbox
                            checked={filteredContacts.length > 0 && selectedContactIds.size === filteredContacts.length}
                            onCheckedChange={toggleSelectAllContacts}
                            aria-label="Selecionar todos"
                          />
                        </th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Nome</th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Telefone</th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Origem</th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">Campanha</th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">Conjunto de anúncio</th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">Anúncio</th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Primeira mensagem</th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Última mensagem</th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Conta</th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Funil / Etapa</th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider min-w-[8rem]">Etiqueta</th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider w-24">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200/60 dark:divide-gray-700/50">
                        {displayList.map((c) => {
                          const isLeadOnly = c._fromLead === true;
                          const displayName = (c.tracking_data?.lead_name && String(c.tracking_data.lead_name).trim()) || c.sender_name || c.phone || c.from_jid || '—';
                          const funnelInfo = getFunnelInfoForRow(c);
                          const rowIsMetaAds = isLeadOnly ? c.origin_source === 'meta_ads' : isMetaAdsContactForStats(c);
                          return (
                          <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                            <td className="py-3 px-2">
                              {!isLeadOnly && (
                                <Checkbox
                                  checked={selectedContactIds.has(c.id)}
                                  onCheckedChange={() => toggleContactSelection(c.id)}
                                  aria-label={`Selecionar ${displayName}`}
                                />
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                <Avatar className="h-9 w-9 rounded-full border border-gray-200/50 dark:border-gray-700/50">
                                  <AvatarImage src={c.profile_pic_url || undefined} />
                                  <AvatarFallback className="text-xs bg-muted text-foreground">
                                    {(displayName !== '—' ? displayName : '?').slice(0, 2).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="font-medium text-foreground">{displayName}</span>
                                {isLeadOnly && (
                                  <span className="rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 px-2 py-0.5 text-xs font-medium">Lead (sem contato)</span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-muted-foreground font-mono text-xs">
                              {c.phone || c.from_jid || '—'}
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                                  rowIsMetaAds
                                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                                    : 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300'
                                }`}
                              >
                                {rowIsMetaAds ? (
                                  <>
                                    <Infinity className="h-3.5 w-3.5 shrink-0" />
                                    Meta Ads
                                    {c.utm_campaign && <span className="opacity-90"> · Via Campanha</span>}
                                  </>
                                ) : (
                                  <>
                                    <UserX className="h-3.5 w-3.5 shrink-0" />
                                    Não rastreada
                                  </>
                                )}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-muted-foreground text-xs hidden md:table-cell truncate max-w-[140px]" title={c.tracking_data?.meta_ad_details?.ad?.campaign?.name ?? c.tracking_data?.campaign_name ?? undefined}>
                              {c.tracking_data?.meta_ad_details?.ad?.campaign?.name ?? c.tracking_data?.campaign_name ?? '—'}
                            </td>
                            <td className="py-3 px-4 text-muted-foreground text-xs hidden md:table-cell truncate max-w-[140px]" title={c.tracking_data?.meta_ad_details?.ad?.adset?.name ?? undefined}>
                              {c.tracking_data?.meta_ad_details?.ad?.adset?.name ?? '—'}
                            </td>
                            <td className="py-3 px-4 text-muted-foreground text-xs hidden md:table-cell truncate max-w-[140px]" title={c.tracking_data?.meta_ad_details?.ad?.name ?? c.tracking_data?.ad_name ?? undefined}>
                              {c.tracking_data?.meta_ad_details?.ad?.name ?? c.tracking_data?.ad_name ?? '—'}
                            </td>
                            <td className="py-3 px-4 text-muted-foreground text-xs hidden sm:table-cell">
                              {formatDate(c.first_seen_at)}
                            </td>
                            <td className="py-3 px-4 text-muted-foreground text-xs">
                              {formatDate(c.last_message_at)}
                            </td>
                            <td className="py-3 px-4 hidden sm:table-cell text-muted-foreground text-xs">
                              {c.instance_name?.trim() || '—'}
                            </td>
                            <td className="py-3 px-4 text-muted-foreground text-xs align-top">
                              {funnelInfo ? (
                                <span className="inline-flex flex-col gap-0.5">
                                  <span>{funnelInfo.pipelineNome || '—'}</span>
                                  <span className="text-muted-foreground/80">{funnelInfo.stageNome || '—'}</span>
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="py-3 px-4 text-xs align-top">
                              {c.crm_apice_lead_status ? (
                                <Badge
                                  variant="outline"
                                  title={
                                    c.crm_apice_lead_status_at
                                      ? `CRM-Apice · atualizado em ${formatDate(c.crm_apice_lead_status_at)}`
                                      : 'Status recebido do CRM-Apice'
                                  }
                                  className="text-[10px] font-medium border-violet-300 bg-violet-50 text-violet-900 dark:bg-violet-950/50 dark:text-violet-200 dark:border-violet-800"
                                >
                                  CRM-Apice: {c.crm_apice_lead_status}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-0.5">
                                {!isLeadOnly && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => setContactEventsViewing(c)}
                                      title="Ver eventos deste contato"
                                    >
                                      <Eye className="h-4 w-4 text-muted-foreground" />
                                    </Button>
                                    {onOpenConversation && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => onOpenConversation(c.from_jid)}
                                        title="Abrir conversa na Caixa de entrada"
                                      >
                                        <MessageCircle className="h-4 w-4 text-muted-foreground" />
                                      </Button>
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => openExportFunnelForContacts([c])}
                                      title="Exportar para funil"
                                    >
                                      <Send className="h-4 w-4 text-muted-foreground" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                      onClick={() => setContactToDelete(c)}
                                      title="Excluir contato"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                  </table>
                </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={exportFunnelOpen} onOpenChange={setExportFunnelOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Exportar para funil</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {selectedContactIds.size} contato(s) serão adicionados como leads no funil e etapa escolhidos. Contatos que já existirem no CRM serão ignorados.
            </p>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Funil</Label>
              <Select value={exportPipelineId} onValueChange={setExportPipelineId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o funil" />
                </SelectTrigger>
                <SelectContent>
                  {(pipelines || []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Etapa</Label>
              <Select value={exportStageId} onValueChange={setExportStageId} disabled={!exportPipelineId || exportStages.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder={exportStages.length === 0 ? 'Nenhuma etapa' : 'Selecione a etapa'} />
                </SelectTrigger>
                <SelectContent>
                  {exportStages.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportFunnelOpen(false)} disabled={exportFunnelLoading}>
              Cancelar
            </Button>
            <Button onClick={runExportToFunnel} disabled={exportFunnelLoading || !exportPipelineId || !exportStageId}>
              {exportFunnelLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Exportar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={exportCsvOpen} onOpenChange={(o) => { if (!exportCsvRunning) setExportCsvOpen(o); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Exportar contatos (CSV)</DialogTitle>
            <p className="text-sm text-muted-foreground">
              A tabela pode mostrar só parte do banco. Para baixar todos os registros com filtros, use base completa.
            </p>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Origem dos dados</Label>
              <Select value={exportCsvScope} onValueChange={setExportCsvScope}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="screen">Igual à tabela agora</SelectItem>
                  <SelectItem value="database">Base completa no banco</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {exportCsvScope === 'screen' && listaContatosCortada && (
              <p className="text-xs text-amber-700 dark:text-amber-400 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 p-2">
                A lista carregada pode estar incompleta. Para exportar tudo, escolha &quot;Base completa no banco&quot;.
              </p>
            )}
            {exportCsvScope === 'database' && (
              <>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={applyPageFiltersToExportForm}>
                    Usar filtros da página
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label>Origem (Meta / não identificado)</Label>
                  <Select value={exportCsvOrigin} onValueChange={setExportCsvOrigin}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ORIGIN_FILTER_ALL}>Todos</SelectItem>
                      <SelectItem value={ORIGIN_FILTER_META}>Meta Ads</SelectItem>
                      <SelectItem value={ORIGIN_FILTER_NAO_IDENT}>Não identificado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Busca por nome ou telefone (opcional)</Label>
                  <Input
                    value={exportCsvSearch}
                    onChange={(e) => setExportCsvSearch(e.target.value)}
                    placeholder="Deixe vazio para não filtrar"
                    className="h-9"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data da mensagem</Label>
                  <Select value={exportCsvDateField} onValueChange={setExportCsvDateField}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={MESSAGE_DATE_FIELD_FIRST}>Primeira mensagem</SelectItem>
                      <SelectItem value={MESSAGE_DATE_FIELD_LAST}>Última mensagem</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <span className="text-xs font-medium">De</span>
                    <ContatosBrDateInput
                      id="export-csv-from"
                      valueIso={exportCsvDateFrom}
                      onChangeIso={setExportCsvDateFrom}
                      ariaLabel="Data inicial exportação"
                    />
                  </div>
                  <span className="text-muted-foreground text-xs pb-2">até</span>
                  <div className="space-y-1">
                    <span className="text-xs font-medium">Até</span>
                    <ContatosBrDateInput
                      id="export-csv-to"
                      valueIso={exportCsvDateTo}
                      onChangeIso={setExportCsvDateTo}
                      ariaLabel="Data final exportação"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Período vazio = todas as datas. Inclui contatos WhatsApp e leads só no funil, como na tabela.
                </p>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportCsvOpen(false)} disabled={exportCsvRunning}>
              Cancelar
            </Button>
            <Button
              onClick={() => void runExportCsv()}
              disabled={exportCsvRunning || (exportCsvScope === 'screen' && displayList.length === 0)}
            >
              {exportCsvRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              Baixar CSV
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!contactToDelete} onOpenChange={(open) => { if (!open) setContactToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contato?</AlertDialogTitle>
            <AlertDialogDescription>
              {contactToDelete && (
                <>
                  O contato {(contactToDelete.tracking_data?.lead_name && String(contactToDelete.tracking_data.lead_name).trim()) || contactToDelete.sender_name || contactToDelete.phone || contactToDelete.from_jid || 'este'}
                  será removido da lista. Esta ação não pode ser desfeita. O contato poderá voltar a aparecer se receber novas mensagens pelo webhook.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteContactLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); deleteContact(); }}
              disabled={deleteContactLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteContactLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ImportFacebookLeadsModal
        isOpen={importFacebookLeadsOpen}
        onClose={() => setImportFacebookLeadsOpen(false)}
        effectiveClienteId={effectiveClienteId}
        onImported={loadContacts}
      />

      <Dialog open={!!contactEventsViewing} onOpenChange={(open) => { if (!open) { setContactEventsViewing(null); setEventBodyViewing(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-base">Informações da conversa</DialogTitle>
            {contactEventsViewing && (
              <p className="text-sm text-muted-foreground">
                {(contactEventsViewing.tracking_data?.lead_name && String(contactEventsViewing.tracking_data.lead_name).trim()) || contactEventsViewing.sender_name || contactEventsViewing.phone || contactEventsViewing.from_jid}
                {contactEventsViewing.from_jid && <span className="text-xs ml-2 font-mono">{contactEventsViewing.from_jid}</span>}
              </p>
            )}
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {contactEventsViewing && (
              <>
                <div className="rounded-lg border bg-card p-4 space-y-3">
                  <p className="text-sm font-medium text-muted-foreground">Informações da conversa</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <span className="text-muted-foreground">Nome</span>
                    <span>{(contactEventsViewing.tracking_data?.lead_name && String(contactEventsViewing.tracking_data.lead_name).trim()) || contactEventsViewing.sender_name || '—'}</span>
                    <span className="text-muted-foreground">WhatsApp</span>
                    <span className="font-mono">{contactEventsViewing.phone || contactEventsViewing.from_jid || '—'}</span>
                    <span className="text-muted-foreground flex items-center gap-1">
                      Origem
                      <span title="Origem identificada por rastreio (ex.: Meta Ads) ou não identificada."><Info className="h-3.5 w-3.5 text-muted-foreground" /></span>
                    </span>
                    <span>
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${contactEventsViewing.origin_source === 'meta_ads' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300'}`}>
                        {contactEventsViewing.origin_source === 'meta_ads' ? <><Infinity className="h-3.5 w-3.5 shrink-0" /> Meta Ads</> : <><UserX className="h-3.5 w-3.5 shrink-0" /> Não rastreada</>}
                      </span>
                    </span>
                    <span className="text-muted-foreground">Primeira interação</span>
                    <span>{formatDate(contactEventsViewing.first_seen_at)}</span>
                    <span className="text-muted-foreground">Última interação</span>
                    <span>{formatDate(contactEventsViewing.last_message_at)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    A primeira data é a do primeiro evento recebido; a última é atualizada a cada nova mensagem (webhook).
                  </p>
                </div>

                <div className="rounded-lg border bg-card p-4 space-y-3">
                  <p className="text-sm font-medium text-muted-foreground">Informações do método de rastreamento</p>
                  {displayTracking?.origin_source === 'meta_ads' && displayTracking.tracking_data && Object.keys(displayTracking.tracking_data).length > 0 ? (
                    <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1.5">
                      {(() => {
                        const eventsByDate = Array.isArray(displayTracking.tracking_data.events_by_date) && displayTracking.tracking_data.events_by_date.length > 0
                          ? [...displayTracking.tracking_data.events_by_date].sort((a, b) => (b.received_at || '').localeCompare(a.received_at || ''))
                          : [];
                        const renderTrackingFields = (data) => {
                          if (!data || typeof data !== 'object') return null;
                          return (
                            <div className="space-y-1">
                              {data.source_id != null && <p><span className="text-muted-foreground">sourceID:</span> {String(data.source_id)}</p>}
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
                        const effectiveSourceId = effectiveSourceIdForMeta;
                        return (
                          <>
                            {eventsByDate.length > 0 ? (
                              <div className="space-y-2">
                                <p className="text-xs font-medium text-muted-foreground">Eventos recebidos (Meta Ads) por data</p>
                                {eventsByDate.map((entry, idx) => (
                                  <details key={idx} className="rounded border bg-background/50 overflow-hidden">
                                    <summary className="cursor-pointer px-2 py-1.5 text-sm font-medium hover:bg-muted/50 list-none flex items-center gap-2">
                                      <span className="inline-block w-2 h-2 rounded-full bg-primary/60 shrink-0" />
                                      {entry.received_at ? formatDate(entry.received_at) : '—'}
                                    </summary>
                                    <div className="px-2 pb-2 pt-0 pl-4 border-t border-border/50 mt-1 space-y-1">
                                      {renderTrackingFields(entry)}
                                    </div>
                                  </details>
                                ))}
                              </div>
                            ) : (
                              renderTrackingFields(displayTracking.tracking_data)
                            )}
                            {effectiveSourceId != null && effectiveSourceId !== '' && (
                              <div className="pt-3 mt-3 border-t border-border/50 space-y-2">
                          {metaAdDetailsLoading && (
                            <p className="text-muted-foreground flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                              Carregando dados do Meta…
                            </p>
                          )}
                          {metaAdDetailsError && !metaAdDetailsLoading && (
                            <p className="text-destructive text-sm">{metaAdDetailsError}</p>
                          )}
                          {metaAdDetails && !metaAdDetails.error && !metaAdDetailsLoading && (
                            <div className="space-y-1">
                              {(metaAdDetails.fetched_at || displayTracking.tracking_data.meta_ad_details?.fetched_at) && (
                                <p className="text-xs text-muted-foreground">
                                  Dados recebidos em {formatDate(metaAdDetails.fetched_at || displayTracking.tracking_data.meta_ad_details?.fetched_at)}
                                </p>
                              )}
                              {metaAdDetails.accountName != null && metaAdDetails.accountName !== '' && <p><span className="text-muted-foreground">Conta de anúncios:</span> {metaAdDetails.accountName}</p>}
                              {metaAdDetails.ad?.campaign?.name != null && <p><span className="text-muted-foreground">Campanha:</span> {metaAdDetails.ad.campaign.name}</p>}
                              {metaAdDetails.ad?.adset?.name != null && <p><span className="text-muted-foreground">Conjunto:</span> {metaAdDetails.ad.adset.name}</p>}
                              {metaAdDetails.ad?.name != null && <p><span className="text-muted-foreground">Anúncio:</span> {metaAdDetails.ad.name}</p>}
                              {Array.isArray(displayTracking.tracking_data.meta_ad_details_history) && displayTracking.tracking_data.meta_ad_details_history.length > 1 && (
                                <details className="mt-2 text-xs text-muted-foreground">
                                  <summary className="cursor-pointer hover:text-foreground">Histórico de dados recebidos ({displayTracking.tracking_data.meta_ad_details_history.length} datas)</summary>
                                  <ul className="mt-1 list-disc list-inside space-y-0.5">
                                    {[...displayTracking.tracking_data.meta_ad_details_history].reverse().map((entry, i) => (
                                      <li key={i}>{entry.fetched_at ? formatDate(entry.fetched_at) : '—'}</li>
                                    ))}
                                  </ul>
                                </details>
                              )}
                            </div>
                          )}
                          {!metaAdDetailsLoading && !metaAdDetails?.ad && !metaAdDetailsError && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                const sourceId = String(effectiveSourceId).trim();
                                if (!sourceId || !contactEventsViewing?.from_jid || !effectiveClienteId) return;
                                setMetaAdDetailsLoading(true);
                                setMetaAdDetailsError(null);
                                setMetaAdDetails(null);
                                try {
                                  const { data, error: fnError } = await supabase.functions.invoke('meta-ads-api', {
                                    body: { action: 'get-ad-by-id', adId: sourceId },
                                  });
                                  if (fnError) {
                                    setMetaAdDetailsError('Não foi possível carregar dados deste anúncio no Meta.');
                                    setMetaAdDetailsLoading(false);
                                    return;
                                  }
                                  if (data?.error) {
                                    setMetaAdDetailsError('Não foi possível carregar dados deste anúncio no Meta.');
                                    setMetaAdDetailsLoading(false);
                                    return;
                                  }
                                  const payload = data ?? null;
                                  if (payload?.ad) {
                                    const fetchedAt = new Date().toISOString();
                                    setMetaAdDetails({ ...payload, fetched_at: fetchedAt });
                                    const metaEntry = { accountName: payload.accountName, ad: payload.ad, fetched_at: fetchedAt };
                                    const prev = contactEventsViewing.tracking_data || {};
                                    const history = [...(Array.isArray(prev.meta_ad_details_history) ? prev.meta_ad_details_history : []), { fetched_at: fetchedAt, accountName: payload.accountName, ad: payload.ad }].slice(-30);
                                    const nextTracking = { ...prev, meta_ad_details: metaEntry, meta_ad_details_history: history };
                                    const { error: updateErr } = await supabase
                                      .from('cliente_whatsapp_contact')
                                      .update({ tracking_data: nextTracking, updated_at: new Date().toISOString() })
                                      .eq('cliente_id', effectiveClienteId)
                                      .eq('from_jid', contactEventsViewing.from_jid);
                                    if (!updateErr) {
                                      setContactEventsViewing((prev) => (prev ? { ...prev, tracking_data: nextTracking } : prev));
                                      loadContacts({ silent: true });
                                    }
                                  } else {
                                    setMetaAdDetails(payload);
                                  }
                                } catch {
                                  setMetaAdDetailsError('Não foi possível carregar dados deste anúncio no Meta.');
                                }
                                setMetaAdDetailsLoading(false);
                              }}
                            >
                              Carregar dados do Meta
                            </Button>
                          )}
                          {metaAdDetails?.ad && !metaAdDetailsLoading && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-muted-foreground"
                              onClick={async () => {
                                const sourceId = String(effectiveSourceId).trim();
                                if (!sourceId || !contactEventsViewing?.from_jid || !effectiveClienteId) return;
                                setMetaAdDetailsLoading(true);
                                setMetaAdDetailsError(null);
                                try {
                                  const { data, error: fnError } = await supabase.functions.invoke('meta-ads-api', {
                                    body: { action: 'get-ad-by-id', adId: sourceId },
                                  });
                                  if (!fnError && !data?.error && data?.ad) {
                                    const fetchedAt = new Date().toISOString();
                                    setMetaAdDetails({ ...data, fetched_at: fetchedAt });
                                    const prev = contactEventsViewing.tracking_data || {};
                                    const history = [...(Array.isArray(prev.meta_ad_details_history) ? prev.meta_ad_details_history : []), { fetched_at: fetchedAt, accountName: data.accountName, ad: data.ad }].slice(-30);
                                    const nextTracking = { ...prev, meta_ad_details: { accountName: data.accountName, ad: data.ad, fetched_at: fetchedAt }, meta_ad_details_history: history };
                                    const { error: updateErr } = await supabase
                                      .from('cliente_whatsapp_contact')
                                      .update({ tracking_data: nextTracking, updated_at: new Date().toISOString() })
                                      .eq('cliente_id', effectiveClienteId)
                                      .eq('from_jid', contactEventsViewing.from_jid);
                                    if (!updateErr) {
                                      setContactEventsViewing((prev) => (prev ? { ...prev, tracking_data: nextTracking } : prev));
                                      loadContacts({ silent: true });
                                    }
                                  }
                                } finally {
                                  setMetaAdDetailsLoading(false);
                                }
                              }}
                            >
                              Atualizar dados do Meta
                            </Button>
                          )}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-200">
                      <span className="shrink-0 mt-0.5">!</span>
                      <p>Esta conversa não possui nenhum método de rastreamento. Isso significa que este contato não iniciou a conversa através de um canal rastreado (por exemplo, links rastreáveis ou campanhas de mensagem). Você pode aplicar o rastreamento a partir de um evento webhook na seção abaixo.</p>
                    </div>
                  )}
                </div>

                <div className="rounded-lg border bg-card p-4 space-y-3">
                  <p className="text-sm font-medium text-muted-foreground">Disparos de webhook</p>
                  <p className="text-xs text-muted-foreground">Mostrando no máximo os últimos 100 webhooks para este contato.</p>
                  <div className="min-h-[120px] max-h-[40vh] overflow-y-auto rounded-md border bg-muted/30 p-2 space-y-2">
                    {contactEventsLoading ? (
                      <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Carregando eventos…
                      </div>
                    ) : contactEvents.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-6 text-center">Nenhum evento recebido para este contato.</p>
                    ) : (
                      contactEvents.map((ev) => (
                        <div key={ev.id} className="rounded border bg-background p-2 text-sm">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-muted-foreground shrink-0">
                              {ev.created_at ? formatDate(ev.created_at) : '—'}
                            </span>
                            {ev.source && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-muted font-medium">{ev.source}</span>
                            )}
                            {hasSourceId(ev.raw_payload) && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 font-medium">SourceID</span>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs ml-auto shrink-0"
                              onClick={() => setEventBodyViewing(ev)}
                            >
                              Ver corpo
                            </Button>
                          </div>
                          {ev.body_preview && <p className="text-xs mt-1 text-foreground/80 line-clamp-2">{ev.body_preview}</p>}
                        </div>
                      ))
                    )}
                  </div>
                  {contactEventsViewing && effectiveClienteId && contactEvents.length > 0 && contactEvents[0]?.raw_payload != null && (
                    <div className="flex justify-end gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={applyTrackingLoading}
                        onClick={async () => {
                          const contact = contactEventsViewing;
                          const ev = contactEvents[0];
                          if (!contact?.from_jid || !effectiveClienteId) return;
                          setApplyTrackingLoading(true);
                          const tracking = buildContactTrackingFromRawPayload(ev.raw_payload);
                          const { phone, sender_name } = extractPhoneAndNameFromRawPayload(ev.raw_payload, contact.from_jid);
                          const now = new Date().toISOString();
                          const existingHasTracking = contact.tracking_data && typeof contact.tracking_data === 'object' && Object.keys(contact.tracking_data).length > 0;
                          const finalTracking = existingHasTracking ? contact.tracking_data : (tracking.tracking_data || null);
                          const finalOrigin = existingHasTracking ? (contact.origin_source ?? tracking.origin_source) : tracking.origin_source;
                          const finalUtm = existingHasTracking
                            ? { utm_source: contact.utm_source ?? tracking.utm_source, utm_medium: contact.utm_medium ?? tracking.utm_medium, utm_campaign: contact.utm_campaign ?? tracking.utm_campaign, utm_content: contact.utm_content ?? tracking.utm_content, utm_term: contact.utm_term ?? tracking.utm_term }
                            : { utm_source: tracking.utm_source, utm_medium: tracking.utm_medium, utm_campaign: tracking.utm_campaign, utm_content: tracking.utm_content, utm_term: tracking.utm_term };
                          const mergedTracking = !existingHasTracking && contact.tracking_data?.meta_ad_details
                            ? { ...(tracking.tracking_data || {}), meta_ad_details: contact.tracking_data.meta_ad_details, meta_ad_details_history: contact.tracking_data.meta_ad_details_history }
                            : finalTracking;
                          const { first_seen_at: firstSeen, last_message_at: lastMsg } = mergeContactWebhookTimestamps(contact, contactEvents);
                          const row = {
                            cliente_id: effectiveClienteId,
                            from_jid: contact.from_jid,
                            phone: phone || null,
                            sender_name: sender_name || null,
                            origin_source: finalOrigin,
                            utm_source: finalUtm.utm_source,
                            utm_medium: finalUtm.utm_medium,
                            utm_campaign: finalUtm.utm_campaign,
                            utm_content: finalUtm.utm_content,
                            utm_term: finalUtm.utm_term,
                            tracking_data: mergedTracking,
                            first_seen_at: firstSeen,
                            last_message_at: lastMsg || ev.created_at || now,
                            updated_at: now,
                          };
                          const { error } = await supabase
                            .from('cliente_whatsapp_contact')
                            .upsert(row, {
                              onConflict: 'cliente_id,from_jid',
                              updateColumns: ['phone', 'sender_name', 'origin_source', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'tracking_data', 'first_seen_at', 'last_message_at', 'updated_at'],
                            });
                          setApplyTrackingLoading(false);
                          if (error) {
                            toast({ variant: 'destructive', title: 'Erro ao aplicar rastreamento', description: error.message });
                            return;
                          }
                          toast({ title: 'Rastreamento aplicado', description: existingHasTracking ? 'Contato atualizado (dados de rastreamento e Meta preservados).' : 'Contato atualizado com o rastreamento do evento mais recente.' });
                          loadContacts({ silent: true });
                          setContactEventsViewing((prev) => (prev?.from_jid === contact.from_jid ? { ...prev, ...row } : prev));
                        }}
                      >
                        {applyTrackingLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Atualizar contato com rastreamento do último evento
                      </Button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!eventBodyViewing} onOpenChange={(open) => !open && setEventBodyViewing(null)}>
        <DialogContent className="max-w-xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm">Corpo do evento</DialogTitle>
            {eventBodyViewing?.created_at && <p className="text-xs text-muted-foreground">{formatDate(eventBodyViewing.created_at)}</p>}
          </DialogHeader>
          <div className="min-h-[120px] max-h-[50vh] rounded-md border bg-muted/30 p-3 overflow-y-auto overflow-x-hidden">
            {eventBodyViewing?.raw_payload != null ? (
              <pre className="text-xs font-mono whitespace-pre-wrap break-words">
                {typeof eventBodyViewing.raw_payload === 'object'
                  ? JSON.stringify(eventBodyViewing.raw_payload, null, 2)
                  : String(eventBodyViewing.raw_payload)}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum corpo salvo.</p>
            )}
          </div>
          {contactEventsViewing && effectiveClienteId && eventBodyViewing?.raw_payload != null && (
            <div className="flex justify-end gap-2 pt-3 border-t">
              <Button
                variant="default"
                size="sm"
                disabled={applyTrackingLoading}
                onClick={async () => {
                  const contact = contactEventsViewing;
                  const ev = eventBodyViewing;
                  if (!contact?.from_jid || !effectiveClienteId) return;
                  setApplyTrackingLoading(true);
                  const tracking = buildContactTrackingFromRawPayload(ev.raw_payload);
                  const { phone, sender_name } = extractPhoneAndNameFromRawPayload(ev.raw_payload, contact.from_jid);
                  const now = new Date().toISOString();
                  const existingHasTracking = contact.tracking_data && typeof contact.tracking_data === 'object' && Object.keys(contact.tracking_data).length > 0;
                  const finalTracking = existingHasTracking ? contact.tracking_data : (tracking.tracking_data || null);
                  const finalOrigin = existingHasTracking ? (contact.origin_source ?? tracking.origin_source) : tracking.origin_source;
                  const finalUtm = existingHasTracking
                    ? { utm_source: contact.utm_source ?? tracking.utm_source, utm_medium: contact.utm_medium ?? tracking.utm_medium, utm_campaign: contact.utm_campaign ?? tracking.utm_campaign, utm_content: contact.utm_content ?? tracking.utm_content, utm_term: contact.utm_term ?? tracking.utm_term }
                    : { utm_source: tracking.utm_source, utm_medium: tracking.utm_medium, utm_campaign: tracking.utm_campaign, utm_content: tracking.utm_content, utm_term: tracking.utm_term };
                  const mergedTracking = !existingHasTracking && contact.tracking_data?.meta_ad_details
                    ? { ...(tracking.tracking_data || {}), meta_ad_details: contact.tracking_data.meta_ad_details, meta_ad_details_history: contact.tracking_data.meta_ad_details_history }
                    : finalTracking;
                  const { first_seen_at: firstSeen, last_message_at: lastMsg } = mergeContactWebhookTimestamps(contact, contactEvents);
                  const row = {
                    cliente_id: effectiveClienteId,
                    from_jid: contact.from_jid,
                    phone: phone || null,
                    sender_name: sender_name || null,
                    origin_source: finalOrigin,
                    utm_source: finalUtm.utm_source,
                    utm_medium: finalUtm.utm_medium,
                    utm_campaign: finalUtm.utm_campaign,
                    utm_content: finalUtm.utm_content,
                    utm_term: finalUtm.utm_term,
                    tracking_data: mergedTracking,
                    first_seen_at: firstSeen,
                    last_message_at: lastMsg || ev.created_at || now,
                    updated_at: now,
                  };
                  const { error } = await supabase
                    .from('cliente_whatsapp_contact')
                    .upsert(row, {
                      onConflict: 'cliente_id,from_jid',
                      updateColumns: ['phone', 'sender_name', 'origin_source', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'tracking_data', 'first_seen_at', 'last_message_at', 'updated_at'],
                    });
                  setApplyTrackingLoading(false);
                  if (error) {
                    toast({ variant: 'destructive', title: 'Erro ao aplicar rastreamento', description: error.message });
                    return;
                  }
                  toast({ title: 'Rastreamento aplicado', description: existingHasTracking ? 'O contato manteve os dados de rastreamento e Meta.' : 'O contato foi atualizado com os dados de rastreamento deste evento.' });
                  setEventBodyViewing(null);
                  loadContacts({ silent: true });
                  setContactEventsViewing((prev) => (prev?.from_jid === contact.from_jid ? { ...prev, ...row } : prev));
                }}
              >
                {applyTrackingLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Aplicar rastreamento ao contato
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ContatosPage;
