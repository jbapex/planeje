import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import {
  CalendarRange,
  ChevronDown,
  ChevronUp,
  Globe,
  Link2,
  Loader2,
  MessageCircle,
  Pencil,
  Phone,
  Search,
  User,
  UserX,
  Table2,
  Kanban,
  CalendarClock,
  FileText,
  Settings2,
  Plug,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import RastreamentoClienteSelect from '@/components/crm/RastreamentoClienteSelect';
import RastreamentoLeadFicha from '@/components/crm/RastreamentoLeadFicha';
import MiniCrmObservation, { MiniCrmNotesProvider } from '@/components/crm/MiniCrmObservation';
import { saveMiniCrmObservation } from '@/lib/miniCrmObservations';
import MiniCrmConfig from '@/components/pages/MiniCrmConfig';
import MiniCrmMessageRules from '@/components/pages/MiniCrmMessageRules';
import { saveContactName } from '@/lib/leadIdentity';
import { miniCrmPatchDifference } from '../../../supabase/functions/_shared/miniCrmMessageRules.js';
import MiniCrmFollowUp, { AttemptForm, DayField, dateCaption } from '@/components/pages/MiniCrmFollowUp';
import MiniCrmRangePicker from '@/components/pages/MiniCrmRangePicker';
import ClienteCanaisPage from '@/components/pages/ClienteCanaisPage';
import { useAtendimentoLojaMembro } from '@/hooks/useAtendimentoLojaMembro';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ToastAction } from '@/components/ui/toast';
import './MiniCrmPage.css';
import { parseComercialValor } from '@/lib/leadComercial';
import { extractCtwaClid, sendMetaConversionForComercialChange } from '@/lib/metaConversions';
import {
  applyStatusChange,
  appointmentTimeKey,
  isAppointmentDateColumn,
  attemptTitle,
  buildConfirmedSaleMini,
  canConfirmSale,
  clearRemovedStatus,
  defaultStatusKey,
  ensureRescueStatus,
  entryInPeriod,
  formatDayBr,
  formatMoneyBr,
  gridColumns,
  groupFollowUps,
  isFollowStatus,
  kanbanColumns,
  keepSystemStatuses,
  needsSaleConfirm,
  openReturn,
  progressLabel,
  registerAttempt,
  returnOfRow,
  scheduleReturn,
  startRepescagem,
  commercialPatchFromMiniChange,
  shouldSendQualified,
  applyNoAnswerMark,
  NO_ANSWER_COLUMN,
  normalizeLeadName,
  normalizeLeadPhone,
  origemDoContato,
  miniCrmOriginBucket as originBucket,
  miniCrmOriginBadge as originBadge,
  patchMiniCrm,
  phoneKey,
  presetForNicho,
  removedStatusKeys,
  resolveMiniCrmSetup,
  rowFromContact,
  rowMatchesPhone,
  statusInk,
  statusLabel,
  moneyAmount,
  sumColumnMoney,
  withDefaultStatus,
  withLeadIdentity,
} from '@/lib/miniCrm';

function mergeMiniPatch(base = {}, patch = {}) {
  const next = { ...(base || {}) };
  for (const [key, value] of Object.entries(patch)) { if (value == null) delete next[key]; else next[key] = value; }
  return next;
}
const PAGE_SIZE = 1000;
const MAX_ROWS = 5000;

function todayInput() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function monthStartInput() {
  return `${todayInput().slice(0, 7)}-01`;
}

function addDaysYmd(ymd, days) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function previousMonthRange(todayYmd = todayInput()) {
  const [y, m] = String(todayYmd).split('-').map(Number);
  const end = new Date(Date.UTC(y, m - 1, 0));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

const PERIOD_OPTIONS = [
  { id: 'hoje', label: 'Hoje' },
  { id: 'ontem', label: 'Ontem' },
  { id: '7d', label: 'Sete dias' },
  { id: 'mes', label: 'Mês atual' },
  { id: 'mes_anterior', label: 'Mês anterior' },
  { id: 'aberto', label: 'Todo o período' },
  { id: 'custom', label: 'Personalizado' },
];

function rangeForPeriodKey(key) {
  const today = todayInput();
  if (key === 'hoje') return { from: today, to: today };
  if (key === 'ontem') {
    const yesterday = addDaysYmd(today, -1);
    return { from: yesterday, to: yesterday };
  }
  if (key === '7d') return { from: addDaysYmd(today, -6), to: today };
  if (key === 'mes_anterior') return previousMonthRange(today);
  if (key === 'aberto') return { from: '', to: '' };
  return { from: monthStartInput(), to: today };
}

function formatWhenParts(iso) {
  if (!iso) return { day: '—', time: '' };
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { day: '—', time: '' };
  const day = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
  const time = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
  return { day, time };
}

function formatPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  const local = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return String(value || '—');
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return `${parts[0][0] || ''}${parts[1]?.[0] || ''}`.toUpperCase();
}

const STATUS_TONE = {
  'Novo Lead': 'new',
  'Em Atendimento': 'work',
  'Follow Up': 'follow',
  Agendado: 'sched',
  'Em Negociação': 'deal',
  'Venda Realizada': 'won',
  'Venda Perdida': 'lost',
  'Não Respondeu': 'mute',
  'Não Compareceu': 'miss',
  Reagendado: 'resched',
  'Lead Desqualificado': 'off',
};

const TONE_CYCLE = ['new', 'work', 'follow', 'sched', 'deal', 'won', 'lost', 'mute', 'miss', 'resched', 'off'];

function statusTone(key, statuses) {
  if (!key) return 'empty';
  if (STATUS_TONE[key]) return STATUS_TONE[key];
  const index = (statuses || []).findIndex((status) => status.key === key);
  return TONE_CYCLE[(index < 0 ? 0 : index) % TONE_CYCLE.length];
}

async function fetchContacts(clienteId, fromDate, toDate, { onlyMini = false } = {}) {
  const rows = [];
  let from = 0;
  while (rows.length < MAX_ROWS) {
    let query = supabase
      .from('cliente_whatsapp_contact')
      .select('id, sender_name, phone, from_jid, origin_source, utm_source, utm_medium, utm_campaign, utm_content, utm_term, tracking_data, first_seen_at, mini_crm, profile_pic_url, qualificado, comprou, valor_venda')
      .eq('cliente_id', clienteId)
      .order('first_seen_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (onlyMini) query = query.not('mini_crm', 'is', null);
    if (!onlyMini && fromDate) query = query.gte('first_seen_at', `${fromDate}T00:00:00-03:00`);
    if (!onlyMini && toDate) query = query.lte('first_seen_at', `${toDate}T23:59:59-03:00`);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows.slice(0, MAX_ROWS);
}

/** Grava o status de entrada em quem está vazio ou órfão; quem já tem status válido não é tocado. */
async function settleDefaultStatus(clienteId, contacts, statuses, eligible) {
  const pending = (contacts || []).filter((contact) => eligible(contact)
    && withDefaultStatus(contact.mini_crm, statuses) !== contact.mini_crm);
  let written = 0;
  for (let i = 0; i < pending.length; i += 10) {
    const batch = pending.slice(i, i + 10);
    const results = await Promise.all(batch.map(async (contact) => {
      const mini = withDefaultStatus(contact.mini_crm, statuses);
      let query = supabase.from('cliente_whatsapp_contact').update({ mini_crm: mini }).eq('id', contact.id).eq('cliente_id', clienteId);
      query = contact.mini_crm == null ? query.is('mini_crm', null) : query.eq('mini_crm', JSON.stringify(contact.mini_crm));
      const { data, error } = await query.select('mini_crm').maybeSingle();
      if (!data) return false;
      if (error) return false;
      contact.mini_crm = mini;
      return true;
    }));
    written += results.filter(Boolean).length;
  }
  return written;
}

function rowWithDefault(contact, statuses) {
  return {
    ...rowFromContact({ ...contact, mini_crm: withDefaultStatus(contact.mini_crm, statuses) }),
    originBucket: originBucket(contact),
  };
}

export default function MiniCrmPage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const isStoreUser = profile?.role === 'cliente' && profile?.cliente_id;
  const isTeamUser = profile?.role === 'superadmin' || profile?.role === 'admin' || profile?.role === 'colaborador';
  const clienteId = isStoreUser ? profile.cliente_id : (searchParams.get('cliente') || '');
  const activeClienteId = useRef(clienteId);
  activeClienteId.current = clienteId;
  const fone = searchParams.get('fone') || '';
  const lojaMembro = useAtendimentoLojaMembro();
  const lojaRestrito = Boolean(lojaMembro.gate && lojaMembro.membro && lojaMembro.nivel !== 'admin');
  const [clientes, setClientes] = useState([]);
  const [nicho, setNicho] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [showUntracked, setShowUntracked] = useState(false);
  const [rows, setRows] = useState([]);
  const [followRows, setFollowRows] = useState([]);
  const [followLoading, setFollowLoading] = useState(false);
  const [sellerFilter, setSellerFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [periodKey, setPeriodKey] = useState('aberto');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [originFilter, setOriginFilter] = useState('');
  const [savingId, setSavingId] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [storedConfig, setStoredConfig] = useState(null);
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [panelId, setPanelId] = useState('');
  const [focusId, setFocusId] = useState('');
  const [fichaContact, setFichaContact] = useState(null);
  const [view, setView] = useState(() => {
    try {
      const saved = sessionStorage.getItem('planeje-mini-crm-view');
      return saved === 'kanban' || saved === 'config' || saved === 'canais' || saved === 'automacao' || saved === 'follow' ? saved : 'grade';
    } catch {
      return 'grade';
    }
  });
  const [resumoCollapsed, setResumoCollapsed] = useState(() => {
    try {
      return sessionStorage.getItem('planeje-mini-crm-resumo-collapsed') === '1';
    } catch {
      return false;
    }
  });
  const [draggingId, setDraggingId] = useState('');
  const [overStatus, setOverStatus] = useState(null);
  const contactsById = useRef(new Map());
  const statusesRef = useRef(null);
  const [statusSig, setStatusSig] = useState('');
  const drafts = useRef(new Map());
  const timers = useRef(new Map());
  const pendingPatches = useRef(new Map());
  const saveQueues = useRef(new Map());
  const highlightRef = useRef(null);
  const scrolledTarget = useRef('');
  const boardRef = useRef(null);
  const [boardPanDown, setBoardPanDown] = useState(false);
  const [boardPanStartX, setBoardPanStartX] = useState(0);
  const [boardPanScrollLeft, setBoardPanScrollLeft] = useState(0);

  const canSeeUntracked = isTeamUser || showUntracked;
  const scopedRows = useMemo(() => {
    if (canSeeUntracked) return rows;
    return rows.filter((row) => row.originBucket !== 'off');
  }, [rows, canSeeUntracked]);

  const preset = useMemo(() => presetForNicho(nicho), [nicho]);
  const setup = useMemo(() => resolveMiniCrmSetup(preset, storedConfig, scopedRows), [preset, storedConfig, scopedRows]);
  const tableColumns = useMemo(() => gridColumns(preset, setup.columns), [preset, setup.columns]);

  useEffect(() => {
    if (statusSig) statusesRef.current = setup.statuses;
  }, [setup.statuses, statusSig]);

  useEffect(() => {
    if (isStoreUser) return undefined;
    let cancelled = false;
    supabase
      .from('clientes')
      .select('id, empresa, nicho')
      .order('empresa')
      .then(({ data, error }) => {
        if (cancelled || error) return;
        setClientes(data || []);
      });
    return () => {
      cancelled = true;
    };
  }, [isStoreUser]);

  useEffect(() => {
    if (canSeeUntracked) return;
    if (originFilter === 'off') setOriginFilter('');
  }, [canSeeUntracked, originFilter]);

  const load = useCallback(async () => {
    if (!clienteId) {
      setRows([]);
      setNicho('');
      setEmpresa('');
      setShowUntracked(false);
      setStoredConfig(null);
      return;
    }
    setLoading(true);
    setStatusSig('');
    try {
      const { data: client, error: clientError } = await supabase
        .from('clientes')
        .select('empresa, nicho, mini_crm_show_untracked')
        .eq('id', clienteId)
        .maybeSingle();
      if (clientError) throw clientError;
      setEmpresa(client?.empresa || '');
      setNicho(client?.nicho || '');
      setShowUntracked(Boolean(client?.mini_crm_show_untracked));
      const { data: configRow, error: configError } = await supabase
        .from('mini_crm_config')
        .select('statuses, columns, sellers, cadence, updated_at')
        .eq('cliente_id', clienteId)
        .maybeSingle();
      if (configError) throw configError;
      setStoredConfig(configRow || null);
      const { data: autoRules } = await supabase.from('mini_crm_message_rules').select('settings').eq('cliente_id', clienteId).maybeSingle();
      setAutoEnabled(autoRules?.settings?.enabled === true);
      const contacts = await fetchContacts(clienteId, fromDate, toDate);
      const { statuses } = resolveMiniCrmSetup(presetForNicho(client?.nicho || ''), configRow || null, []);
      statusesRef.current = statuses;
      setStatusSig(statuses.map((status) => status.key).join('|'));
      const showOff = Boolean(client?.mini_crm_show_untracked);
      await settleDefaultStatus(
        clienteId,
        contacts,
        statuses,
        (contact) => contact.mini_crm || showOff || originBucket(contact) !== 'off',
      );
      contactsById.current = new Map(contacts.map((item) => [item.id, item]));
      setTruncated(contacts.length >= MAX_ROWS);
      setRows(contacts.map((contact) => rowWithDefault(contact, statuses)));
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Não carregou o mini CRM',
        description: error?.message || 'Tente de novo.',
      });
    } finally {
      setLoading(false);
    }
  }, [clienteId, fromDate, toDate, toast]);

  const loadFollow = useCallback(async () => {
    if (!clienteId) {
      setFollowRows([]);
      return;
    }
    if (!statusSig) return;
    setFollowLoading(true);
    try {
      const contacts = await fetchContacts(clienteId, '', '', { onlyMini: true });
      const statuses = statusesRef.current || [];
      await settleDefaultStatus(clienteId, contacts, statuses, () => true);
      contacts.forEach((item) => contactsById.current.set(item.id, item));
      setFollowRows(contacts.map((contact) => rowWithDefault(contact, statuses)));
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Não carregou o follow-up',
        description: error?.message || 'Tente de novo.',
      });
    } finally {
      setFollowLoading(false);
    }
  }, [clienteId, toast, statusSig]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (view !== 'follow') return undefined;
    loadFollow();
    return undefined;
  }, [view, loadFollow]);

  const refreshContactRow = useCallback(async (contactId) => {
    if (!clienteId || !contactId) return;
    const { data, error } = await supabase
      .from('cliente_whatsapp_contact')
      .select('id, sender_name, phone, from_jid, origin_source, utm_source, utm_medium, utm_campaign, utm_content, utm_term, tracking_data, first_seen_at, mini_crm, profile_pic_url, qualificado, comprou, valor_venda')
      .eq('cliente_id', clienteId)
      .eq('id', contactId)
      .maybeSingle();
    if (error || !data) return;
    contactsById.current.set(data.id, data);
    const pending = pendingPatches.current.get(data.id) || {};
    const merged = mergeMiniPatch(data.mini_crm, pending);
    const painted = rowWithDefault({ ...data, mini_crm: merged }, statusesRef.current || []);
    drafts.current.set(data.id, painted.mini);
    setRows((current) => {
      if (current.some((item) => item.id === data.id)) return current.map((item) => item.id === data.id ? painted : item);
      const day = String(data.first_seen_at || '').slice(0, 10);
      if ((fromDate && day < fromDate) || (toDate && day > toDate)) return current;
      return [painted, ...current].slice(0, MAX_ROWS);
    });
    setFollowRows((current) => current.map((item) => item.id === data.id ? painted : item));
    setFichaContact((current) => current?.id === data.id ? data : current);
  }, [clienteId, fromDate, toDate]);

  // Realtime supplies new contacts and backend stage changes without reloading drafts/configuration.
  useEffect(() => {
    if (!clienteId) return undefined;
    const channel = supabase.channel(`mini-crm:${clienteId}`).on('postgres_changes',
      { event: '*', schema: 'public', table: 'cliente_whatsapp_contact', filter: `cliente_id=eq.${clienteId}` },
      (payload) => { if (payload.new?.id) void refreshContactRow(payload.new.id); }).subscribe();
    // A small, visible-only fallback also covers a dropped realtime connection.
    let since = new Date().toISOString(), running = false;
    const poll = async () => {
      if (document.hidden || running) return;
      running = true;
      const until = new Date().toISOString();
      try {
        const { data, error } = await supabase.from('cliente_whatsapp_contact').select('id')
          .eq('cliente_id', clienteId).gte('updated_at', since).lte('updated_at', until).order('updated_at').limit(200);
        if (!error) {
          for (const item of data || []) await refreshContactRow(item.id);
          if ((data || []).length < 200) since = until;
        }
      } finally { running = false; }
    };
    const timer = window.setInterval(() => void poll(), 20000);
    return () => {window.clearInterval(timer);void supabase.removeChannel(channel);};
  }, [clienteId, refreshContactRow]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return scopedRows.filter((row) => {
      if (originFilter && row.originBucket !== originFilter) return false;
      if (statusFilter && row.status !== statusFilter) return false;
      if (!term) return true;
      return `${row.nome} ${row.telefone} ${row.origem} ${row.observacao}`.toLowerCase().includes(term);
    });
  }, [scopedRows, search, statusFilter, originFilter]);

  const originSummary = useMemo(() => {
    let meta = 0;
    let outras = 0;
    scopedRows.forEach((row) => {
      if (row.originBucket === 'meta') meta += 1;
      else if (row.originBucket === 'outras') outras += 1;
    });
    return { total: scopedRows.length, meta, outras };
  }, [scopedRows]);

  const panelRow = (view === 'follow' ? followRows : scopedRows).find((row) => row.id === panelId)
    || followRows.find((row) => row.id === panelId)
    || rows.find((row) => row.id === panelId)
    || null;

  /* Rola até o card uma vez por destino; editar o lead muda `visible` a cada tecla
     e não pode puxar o quadro de volta para o card destacado. */
  useEffect(() => {
    const target = focusId || fone;
    if (!target || loading || scrolledTarget.current === target) return undefined;
    const timer = window.setTimeout(() => {
      if (!highlightRef.current) return;
      highlightRef.current.scrollIntoView({ block: 'center' });
      scrolledTarget.current = target;
    }, 50);
    return () => window.clearTimeout(timer);
  }, [fone, focusId, loading, visible]);

  const maybeSendQualified = useCallback(async (contact) => {
    if (!clienteId || !contact) return;
    const tracking = contact.tracking_data && typeof contact.tracking_data === 'object'
      ? contact.tracking_data
      : null;
    if (!extractCtwaClid(tracking)) return;

    const { data: prior } = await supabase
      .from('meta_conversion_event_log')
      .select('id')
      .eq('cliente_id', clienteId)
      .eq('contact_id', contact.id)
      .eq('event_name', 'QualifiedLead')
      .eq('success', true)
      .limit(1);
    if (prior?.length) return;

    void sendMetaConversionForComercialChange({
      clienteId,
      patch: { qualificado: true },
      lead: null,
      contact,
      showToast: toast,
    });
  }, [clienteId, toast]);

  const trackDraft = useCallback((id, mini) => {
    const before = drafts.current.get(id) || contactsById.current.get(id)?.mini_crm || {};
    pendingPatches.current.set(id, { ...pendingPatches.current.get(id), ...miniCrmPatchDifference(before, mini) });
    drafts.current.set(id, mini);
  }, []);

  const persist = useCallback((id, mini) => {
    const patch = { ...pendingPatches.current.get(id) };
    if (!Object.keys(patch).length) return Promise.resolve();
    const previous = saveQueues.current.get(id) || Promise.resolve();
    const work = previous.catch(() => {}).then(async () => {
      setSavingId(id);
      const contact = contactsById.current.get(id) || null;
      const commercial = commercialPatchFromMiniChange(contact?.mini_crm, mergeMiniPatch(contact?.mini_crm, patch), contact);
      const { data, error } = await supabase.rpc('mini_crm_patch_contact', {
        p_cliente_id: clienteId, p_contact_id: id, p_patch: patch, p_commercial: commercial || {},
      }).then((result) => result, (error) => ({ data: null, error }));
      setSavingId('');
      if (error || !data) {
        toast({ variant: 'destructive', title: 'Não salvou a linha', description: error?.message || 'Tente novamente.' });
        return false;
      }
      const pending = { ...pendingPatches.current.get(id) };
      for (const key of Object.keys(patch)) if (JSON.stringify(pending[key]) === JSON.stringify(patch[key])) delete pending[key];
      pendingPatches.current.set(id, pending);
      contactsById.current.set(id, data);
      const merged = mergeMiniPatch(data.mini_crm, pending);
      drafts.current.set(id, merged);
      const painted = rowWithDefault({ ...data, mini_crm: merged }, statusesRef.current || []);
      setRows((current) => current.map((item) => item.id === id ? painted : item));
      setFollowRows((current) => current.map((item) => item.id === id ? painted : item));
      setFichaContact((current) => current?.id === id ? data : current);
      if (shouldSendQualified(commercial)) void maybeSendQualified(data);
      return true;
    });
    saveQueues.current.set(id, work);
    return work;
  }, [clienteId, toast, maybeSendQualified]);

  const resumeAutomation = useCallback(async (row) => {
    const saved = await persist(row.id, drafts.current.get(row.id) || row.mini);
    if (saved === false) return;
    const { error } = await supabase.rpc('mini_crm_patch_contact', { p_cliente_id: clienteId, p_contact_id: row.id, p_patch: {}, p_resume: true });
    if (error) toast({ variant: 'destructive', title: 'Não retomou a automação', description: error.message });
    else {await refreshContactRow(row.id);toast({ title: 'Automação retomada para este contato' });}
  }, [clienteId, persist, refreshContactRow, toast]);

  const saveObservation = useCallback((params) => {
    const previous = saveQueues.current.get(params.contactId) || Promise.resolve();
    const work = previous.catch(() => {}).then(() => saveMiniCrmObservation(supabase, params));
    saveQueues.current.set(params.contactId, work);
    return work;
  }, []);

  const observationSaved = useCallback((data) => {
    if (data.cliente_id !== activeClienteId.current) return;
    contactsById.current.set(data.id, data);
    const merged = mergeMiniPatch(data.mini_crm, pendingPatches.current.get(data.id) || {});
    drafts.current.set(data.id, merged);
    const painted = rowWithDefault({ ...data, mini_crm: merged }, statusesRef.current || []);
    setRows((current) => current.map((item) => item.id === data.id ? painted : item));
    setFollowRows((current) => current.map((item) => item.id === data.id ? painted : item));
    setFichaContact((current) => current?.id === data.id ? data : current);
  }, []);

  const paintLead = useCallback((id, mini, seed) => {
    const paint = (item) => (item.id === id
      ? {
        ...item,
        mini,
        status: mini.status || '',
        proxima_em: mini.proxima_em || '',
        proxima_acao: mini.proxima_acao || '',
        motivo: mini.motivo || item.motivo || '',
        vendedor: mini.vendedor || item.vendedor,
        qualificado: mini.qualificado || '',
        valor: mini.valor ?? item.valor ?? '',
        data_venda: mini.data_venda || item.data_venda || '',
      }
      : item);
    setRows((current) => current.map(paint));
    setFollowRows((current) => {
      if (current.some((item) => item.id === id)) return current.map(paint);
      if (!seed) return current;
      return [paint({ ...seed, id }), ...current];
    });
  }, []);

  const commitMini = useCallback((row, mini) => {
    trackDraft(row.id, mini);
    paintLead(row.id, mini, row);
    return persist(row.id, mini);
  }, [paintLead, persist, trackDraft]);

  const [programRequest, setProgramRequest] = useState(null);
  const [salePrompt, setSalePrompt] = useState(null);
  const [saleDate, setSaleDate] = useState('');
  const [saleValor, setSaleValor] = useState('');
  const [saleSaving, setSaleSaving] = useState(false);

  const closeSalePrompt = useCallback(() => {
    setSalePrompt(null);
    setSaleDate('');
    setSaleValor('');
    setSaleSaving(false);
  }, []);

  const maybeSendPurchase = useCallback(async (contact, valor) => {
    if (!clienteId || !contact) return;
    const tracking = contact.tracking_data && typeof contact.tracking_data === 'object'
      ? contact.tracking_data
      : null;
    if (!extractCtwaClid(tracking)) return;

    const { data: prior } = await supabase
      .from('meta_conversion_event_log')
      .select('id')
      .eq('cliente_id', clienteId)
      .eq('contact_id', contact.id)
      .eq('event_name', 'Purchase')
      .eq('success', true)
      .limit(1);
    if (prior?.length) return;

    void sendMetaConversionForComercialChange({
      clienteId,
      patch: { comprou: true, valor: Number(valor) || 0 },
      lead: null,
      contact,
      showToast: toast,
    });
  }, [clienteId, toast]);

  const confirmSale = useCallback(async () => {
    if (!salePrompt || saleSaving) return;
    const amount = parseComercialValor(saleValor);
    if (!canConfirmSale({ dataVenda: saleDate, valor: amount })) {
      toast({
        variant: 'destructive',
        title: 'Informe data e valor',
        description: 'Data no formato dd/mm/aaaa e valor maior que zero.',
      });
      return;
    }
    const { row, status } = salePrompt;
    const base = drafts.current.get(row.id) || row.mini;
    const mini = buildConfirmedSaleMini(
      base,
      { status, dataVenda: saleDate, valor: amount },
      setup.statuses,
      todayInput(),
      setup.cadence,
    );
    setSaleSaving(true);
    const pendingBefore = { ...pendingPatches.current.get(row.id) };
    trackDraft(row.id, mini);
    const saved = await persist(row.id, mini);
    if (saved === false) {
      pendingPatches.current.set(row.id, pendingBefore);
      const contact = contactsById.current.get(row.id);
      const restored = rowWithDefault({ ...contact, id: row.id, mini_crm: contact ? mergeMiniPatch(contact.mini_crm, pendingBefore) : base }, setup.statuses);
      drafts.current.set(row.id, restored.mini);
      setRows((current) => current.map((item) => item.id === row.id ? restored : item));
      setFollowRows((current) => current.map((item) => item.id === row.id ? restored : item));
      setSaleSaving(false);
      return;
    }
    const contact = contactsById.current.get(row.id) || null;
    await maybeSendPurchase(
      contact
        ? {
          ...contact,
          mini_crm: mini,
          comprou: true,
          valor_venda: amount,
        }
        : null,
      amount,
    );
    closeSalePrompt();
  }, [
    salePrompt,
    saleSaving,
    saleValor,
    saleDate,
    setup.statuses,
    setup.cadence,
    trackDraft,
    persist,
    maybeSendPurchase,
    closeSalePrompt,
    toast,
  ]);

  const edit = useCallback((row, key, value, kind) => {
    if (key === 'status') {
      if (needsSaleConfirm(row.status, value)) {
        const base = drafts.current.get(row.id) || row.mini;
        setSalePrompt({ row, status: value });
        setSaleDate(base.data_venda || todayInput());
        setSaleValor(
          base.valor != null && Number(base.valor) > 0
            ? String(base.valor).replace('.', ',')
            : '',
        );
        return;
      }
      const base = drafts.current.get(row.id) || row.mini;
      const today = todayInput();
      const before = openReturn(base);
      const mini = applyStatusChange(base, value, setup.statuses, today, setup.cadence);
      commitMini(row, mini);
      const after = openReturn(mini);
      if (isFollowStatus(value, setup.statuses) && after && !before) {
        setProgramRequest({ id: row.id, token: `${row.id}:${Date.now()}` });
      }
      return;
    }
    if (key === NO_ANSWER_COLUMN.key) {
      const base = drafts.current.get(row.id) || row.mini;
      const before = openReturn(base);
      const mini = applyNoAnswerMark(base, value, setup.statuses, todayInput(), setup.cadence);
      commitMini(row, mini);
      if (openReturn(mini) && !before) {
        setProgramRequest({ id: row.id, token: `${row.id}:${Date.now()}` });
      }
      return;
    }
    const field = kind || (key === 'valor' ? 'money' : key === 'data_venda' ? 'day' : 'text');
    const base = drafts.current.get(row.id) || row.mini;
    const mini = patchMiniCrm(base, key, value, field);
    trackDraft(row.id, mini);
    /* O campo mostra o texto como digitado; o trim fica só no que é gravado,
       senão o espaço no fim some a cada tecla e não dá para separar palavras. */
    const shown = field === 'money' || field === 'text' ? (value ?? '') : (mini[key] || '');
    const paint = (item) => (item.id === row.id ? { ...item, [key]: shown, mini } : item);
    setRows((current) => current.map(paint));
    setFollowRows((current) => current.map(paint));
    const timerKey = row.id;
    window.clearTimeout(timers.current.get(timerKey));
    timers.current.set(timerKey, window.setTimeout(() => {
      persist(row.id, drafts.current.get(row.id) || mini);
    }, 400));
  }, [commitMini, persist, setup.cadence, setup.statuses, trackDraft]);

  /* Grava no contato (sender_name/phone) e numa cópia no mini_crm, que o webhook
     do WhatsApp não regrava; não mexe em status nem dispara conversão. */
  const saveIdentity = useCallback(async (row, field, raw) => {
    if (!clienteId || !row) return false;
    const isName = field === 'nome';
    const value = isName ? normalizeLeadName(raw) : normalizeLeadPhone(raw);
    if (!value || (isName && value.length > 160)) {
      toast({
        variant: 'destructive',
        title: isName ? 'Confira o nome' : 'Telefone inválido',
        description: isName ? 'Digite um nome com até 160 caracteres.' : 'Use DDD e número, ex.: (41) 99999-9999.',
      });
      return false;
    }
    if (isName ? value === row.nome : value === normalizeLeadPhone(row.telefone)) return true;
    const base = drafts.current.get(row.id) || row.mini;
    if (isName) {
      const flushed = await persist(row.id, base);
      if (flushed === false) return false;
      try {
        await saveContactName(supabase, { clienteId, contactId: row.id, name: value });
        await refreshContactRow(row.id);
        return true;
      } catch (error) {
        toast({ variant: 'destructive', title: 'Não salvou o nome', description: error.message });
        return false;
      }
    }
    const mini = withLeadIdentity(base, isName ? { nome: value } : { telefone: value });
    const payload = isName ? { sender_name: value } : { phone: value };
    trackDraft(row.id, mini);
    setSavingId(row.id);
    const { error } = await supabase
      .from('cliente_whatsapp_contact')
      .update(payload)
      .eq('id', row.id)
      .eq('cliente_id', clienteId);
    setSavingId('');
    if (error) {
      if (drafts.current.get(row.id) === mini) drafts.current.set(row.id, base);
      toast({ variant: 'destructive', title: isName ? 'Não salvou o nome' : 'Não salvou o telefone', description: error.message });
      return false;
    }
    const contact = contactsById.current.get(row.id);
    if (contact) contactsById.current.set(row.id, { ...contact, ...payload });
    const persisted = await persist(row.id, mini);
    if (persisted === false) return false;
    const shown = isName
      ? { nome: value, contato_nome: value }
      : { telefone: value, contato_telefone: value, foneKey: phoneKey(value) };
    const paint = (item) => (item.id === row.id ? { ...item, ...shown, mini: { ...item.mini, ...(isName ? { contato_nome: value } : { contato_telefone: value }) } } : item);
    setRows((current) => current.map(paint));
    setFollowRows((current) => current.map(paint));
    setFichaContact((current) => (current?.id === row.id ? { ...current, ...contactsById.current.get(row.id), ...payload } : current));
    return true;
  }, [clienteId, toast, persist, trackDraft, refreshContactRow]);

  const highlightedId = useMemo(() => {
    if (focusId && visible.some((row) => row.id === focusId)) return focusId;
    if (!fone) return '';
    return visible.find((row) => rowMatchesPhone(row, fone))?.id || '';
  }, [focusId, fone, visible]);

  const columns = useMemo(() => kanbanColumns(visible, setup.statuses), [visible, setup.statuses]);

  const clearStatusFromLeads = useCallback(async (removed, target) => {
    if (!clienteId || !removed.length) return { moved: 0, failed: 0 };
    const found = [];
    for (let from = 0; found.length < MAX_ROWS; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('cliente_whatsapp_contact')
        .select('id, mini_crm')
        .eq('cliente_id', clienteId)
        .in('mini_crm->>status', removed)
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) return { moved: 0, failed: -1 };
      found.push(...(data || []));
      if (!data || data.length < PAGE_SIZE) break;
    }
    const cleared = new Map();
    let failed = 0;
    for (const contact of found) {
      const mini = clearRemovedStatus(contact.mini_crm, removed, target);
      if (mini === contact.mini_crm) continue;
      let query = supabase.from('cliente_whatsapp_contact').update({ mini_crm: mini }).eq('id', contact.id).eq('cliente_id', clienteId);
      query = contact.mini_crm == null ? query.is('mini_crm', null) : query.eq('mini_crm', JSON.stringify(contact.mini_crm));
      const { data, error } = await query.select('mini_crm').maybeSingle();
      if (error || !data) failed += 1;
      else cleared.set(contact.id, mini);
    }
    cleared.forEach((mini, id) => {
      const known = contactsById.current.get(id);
      if (known) contactsById.current.set(id, { ...known, mini_crm: mini });
      const draft = drafts.current.get(id);
      if (draft) drafts.current.set(id, clearRemovedStatus(draft, removed, target));
    });
    const paint = (item) => {
      if (!cleared.has(item.id)) return item;
      return { ...item, status: target, mini: clearRemovedStatus(item.mini, removed, target) };
    };
    setRows((current) => current.map(paint));
    setFollowRows((current) => current.map(paint));
    return { moved: cleared.size, failed };
  }, [clienteId]);

  const saveSetup = useCallback(async ({ statuses: asked, columns: nextColumns, sellers, renames }) => {
    if (!clienteId) return;
    const statuses = keepSystemStatuses(setup.statuses, asked);
    const removed = removedStatusKeys(setup.statuses, statuses);
    setSavingConfig(true);
    const payload = {
      cliente_id: clienteId,
      statuses,
      columns: nextColumns,
      sellers,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('mini_crm_config').upsert(payload);
    setSavingConfig(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Não salvou a configuração', description: error.message });
      return;
    }
    (renames || []).forEach((rename) => {
      rows.filter((row) => row.vendedor === rename.origin).forEach((row) => {
        edit(row, 'vendedor', rename.name, 'text');
      });
    });
    setStoredConfig(payload);
    statusesRef.current = statuses;
    const target = defaultStatusKey(statuses);
    const { moved, failed } = await clearStatusFromLeads(removed, target);
    if (failed) {
      toast({
        variant: 'destructive',
        title: 'Configuração salva, mas alguns leads não foram gravados em Novo Lead',
        description: 'Eles aparecem em Novo Lead e são gravados de novo ao recarregar o Mini CRM.',
      });
      return;
    }
    toast({
      title: 'Configuração salva',
      ...(moved ? { description: `${moved} lead(s) foram para ${statusLabel(statuses, target)}.` } : {}),
    });
  }, [clearStatusFromLeads, clienteId, edit, rows, setup.statuses, toast]);

  const saveCadence = useCallback(async (cadence) => {
    if (!clienteId) return;
    setSavingConfig(true);
    const payload = {
      cliente_id: clienteId,
      statuses: setup.statuses,
      columns: setup.columns,
      sellers: setup.sellers,
      cadence,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('mini_crm_config').upsert(payload);
    setSavingConfig(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Não salvou a cadência', description: error.message });
      return false;
    }
    setStoredConfig(payload);
    toast({ title: 'Cadência salva' });
    return true;
  }, [clienteId, setup.columns, setup.sellers, setup.statuses, toast]);

  const saveStatuses = useCallback(async (statuses) => {
    if (!clienteId) return false;
    const payload = {
      cliente_id: clienteId,
      statuses,
      columns: setup.columns,
      sellers: setup.sellers,
      cadence: setup.cadence,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('mini_crm_config').upsert(payload);
    if (error) {
      toast({ variant: 'destructive', title: 'Não criou o status Repescagem', description: error.message });
      return false;
    }
    setStoredConfig(payload);
    return true;
  }, [clienteId, setup.cadence, setup.columns, setup.sellers, toast]);

  const saveReturn = useCallback((row, mini) => {
    commitMini(row, mini);
  }, [commitMini]);

  const concludeAttempt = useCallback((row, payload) => {
    const statuses = ensureRescueStatus(setup.statuses);
    if (payload.resultado === 'repescagem' && statuses !== setup.statuses) void saveStatuses(statuses);
    const mini = registerAttempt(drafts.current.get(row.id) || row.mini, {
      ...payload,
      today: todayInput(),
      statuses,
      cadence: setup.cadence,
    });
    saveReturn(row, mini);
    if (payload.resultado !== 'respondeu') return;
    const entry = contactsById.current.get(row.id)?.first_seen_at || row.data || '';
    const outside = !entryInPeriod(entry, fromDate, toDate);
    const column = statusLabel(statuses, mini.status) || 'Kanban';
    const day = entry ? formatDayBr(String(entry).slice(0, 10)) : '';
    toast({
      title: `Lead foi para ${column}`,
      description: outside
        ? `Entrou em ${day || 'data antiga'}, fora do período escolhido no Kanban.`
        : 'Saiu do Follow-up e já está nessa coluna do Kanban.',
      action: (
        <ToastAction
          altText="Ver no Kanban"
          onClick={() => {
            setPanelId('');
            scrolledTarget.current = '';
            setFocusId(row.id);
            if (outside) {
              setPeriodKey('aberto');
              setFromDate('');
              setToDate('');
            }
            chooseView('kanban');
          }}
        >
          Ver no Kanban
        </ToastAction>
      ),
    });
  }, [fromDate, toDate, saveReturn, saveStatuses, setup.cadence, setup.statuses, toast]);

  const followSource = useMemo(() => {
    if (canSeeUntracked) return followRows;
    return followRows.filter((row) => row.originBucket !== 'off');
  }, [followRows, canSeeUntracked]);

  const followVisible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return followSource.filter((row) => {
      if (sellerFilter && row.vendedor !== sellerFilter) return false;
      if (!term) return true;
      return `${row.nome} ${row.telefone} ${row.proxima_acao} ${row.vendedor}`.toLowerCase().includes(term);
    });
  }, [followSource, search, sellerFilter]);

  const followGroups = useMemo(
    () => groupFollowUps(followVisible, todayInput(), setup.statuses, setup.cadence),
    [followVisible, setup.cadence, setup.statuses],
  );

  const followSellers = useMemo(() => {
    const names = new Set(setup.sellers);
    followSource.forEach((row) => {
      const name = String(row.vendedor || '').trim();
      if (name) names.add(name);
    });
    return [...names].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [followSource, setup.sellers]);

  const sheetFields = useMemo(() => {
    const fields = setup.columns.map((field) => ({ ...field }));
    if (fields.some((field) => field.key === 'proxima_em')) return fields;
    const field = { key: 'proxima_em', label: 'Data do follow-up', kind: 'day' };
    const at = fields.findIndex((item) => item.key === 'proxima_acao');
    if (at >= 0) fields.splice(at, 0, field);
    else fields.push(field);
    return fields;
  }, [setup.columns]);

  // The detail view edits the same row and queue as the grid, including drafts.
  const fichaRow = fichaContact ? (
    rows.find((row) => row.id === fichaContact.id)
    || followRows.find((row) => row.id === fichaContact.id)
    || rowWithDefault({ ...fichaContact, mini_crm: drafts.current.get(fichaContact.id) || fichaContact.mini_crm }, setup.statuses)
  ) : null;
  const fichaFields = [tableColumns.find((field) => field.kind === 'status'), ...sheetFields]
    .filter((field, index, fields) => field && !field.locked && !['qualificado', 'valor'].includes(field.key)
      && fields.findIndex((item) => item?.key === field.key) === index);
  const saveFicha = async () => {
    if (!fichaRow) return true;
    window.clearTimeout(timers.current.get(fichaRow.id));
    return persist(fichaRow.id, drafts.current.get(fichaRow.id) || fichaRow.mini);
  };

  useEffect(() => {
    if (lojaRestrito && (view === 'config' || view === 'canais' || view === 'automacao')) setView('grade');
  }, [lojaRestrito, view]);

  const chooseView = (next) => {
    setView(next);
    try {
      sessionStorage.setItem('planeje-mini-crm-view', next);
    } catch {
      /* a sessão pode bloquear o storage */
    }
  };

  const toggleResumo = () => {
    setResumoCollapsed((current) => {
      const next = !current;
      try {
        sessionStorage.setItem('planeje-mini-crm-resumo-collapsed', next ? '1' : '0');
      } catch {
        /* a sessão pode bloquear o storage */
      }
      return next;
    });
  };

  const dragMoved = useRef(false);

  /* Mesmo gesto de arraste horizontal do Kanban de Tarefas (KanbanView.jsx):
     mousedown no fundo do quadro rola scrollLeft; cards/botões ficam de fora. */
  useEffect(() => {
    if (view !== 'kanban') return undefined;
    const slider = boardRef.current;
    if (!slider) return undefined;

    const handleMouseDown = (e) => {
      if (e.target.closest('button, a, input, select, textarea, [role="button"], .mini-crm-card')) {
        return;
      }
      setBoardPanDown(true);
      slider.classList.add('active');
      setBoardPanStartX(e.pageX - slider.offsetLeft);
      setBoardPanScrollLeft(slider.scrollLeft);
    };

    const handleMouseLeave = () => {
      setBoardPanDown(false);
      slider.classList.remove('active');
    };

    const handleMouseUp = () => {
      setBoardPanDown(false);
      slider.classList.remove('active');
    };

    const handleMouseMove = (e) => {
      if (!boardPanDown) return;
      e.preventDefault();
      const x = e.pageX - slider.offsetLeft;
      const walk = (x - boardPanStartX) * 2;
      slider.scrollLeft = boardPanScrollLeft - walk;
    };

    slider.addEventListener('mousedown', handleMouseDown);
    slider.addEventListener('mouseleave', handleMouseLeave);
    slider.addEventListener('mouseup', handleMouseUp);
    slider.addEventListener('mousemove', handleMouseMove);

    return () => {
      slider.removeEventListener('mousedown', handleMouseDown);
      slider.removeEventListener('mouseleave', handleMouseLeave);
      slider.removeEventListener('mouseup', handleMouseUp);
      slider.removeEventListener('mousemove', handleMouseMove);
      slider.classList.remove('active');
    };
  }, [view, boardPanDown, boardPanStartX, boardPanScrollLeft]);

  const startDrag = (event, row) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target.closest('input, select, textarea, .mini-crm-card-edit')) return;
    if (event.pointerType === 'mouse') event.preventDefault();
    window.getSelection?.()?.removeAllRanges();
    document.body.classList.add('mini-crm-dragging');
    const card = event.currentTarget;
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = card.getBoundingClientRect();
    const grabX = startX - origin.left;
    const grabY = startY - origin.top;
    let active = false;
    let ghost = null;
    dragMoved.current = false;
    const placeGhost = (x, y) => {
      if (ghost) ghost.style.transform = `translate3d(${x - grabX}px, ${y - grabY}px, 0) rotate(3deg)`;
    };
    const dropGhost = (backHome) => {
      const el = ghost;
      ghost = null;
      if (!el) return;
      if (!backHome) {
        el.remove();
        return;
      }
      const home = card.isConnected ? card.getBoundingClientRect() : origin;
      el.classList.add('is-returning');
      el.style.transform = `translate3d(${home.left}px, ${home.top}px, 0) rotate(0deg)`;
      const done = () => el.remove();
      el.addEventListener('transitionend', done, { once: true });
      window.setTimeout(done, 260);
    };
    const move = (ev) => {
      if (!active) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
        active = true;
        dragMoved.current = true;
        setDraggingId(row.id);
        ghost = card.cloneNode(true);
        ghost.classList.remove('is-dragging', 'is-hit');
        ghost.classList.add('mini-crm-card-ghost');
        ghost.setAttribute('aria-hidden', 'true');
        ghost.style.width = `${origin.width}px`;
        document.body.appendChild(ghost);
      }
      if (ev.cancelable) ev.preventDefault();
      placeGhost(ev.clientX, ev.clientY);
      const board = document.querySelector('.mini-crm-board.is-kanban');
      if (board) {
        const bounds = board.getBoundingClientRect();
        if (ev.clientX > bounds.right - 56) board.scrollLeft += 22;
        if (ev.clientX < bounds.left + 56) board.scrollLeft -= 22;
      }
      const next = kanbanStatusAt(ev.clientX, ev.clientY);
      setOverStatus((current) => (current === next ? current : next));
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('keydown', key, true);
      document.body.classList.remove('mini-crm-dragging');
      let moved = false;
      if (active && ev.type === 'pointerup') {
        const status = kanbanStatusAt(ev.clientX, ev.clientY);
        if (status != null && (row.status || '') !== status) {
          moved = true;
          edit(row, 'status', status);
        }
      }
      dropGhost(!moved);
      setDraggingId('');
      setOverStatus(null);
    };
    const key = (ev) => {
      if (ev.key !== 'Escape') return;
      ev.preventDefault();
      ev.stopPropagation();
      up({ type: 'pointercancel' });
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('keydown', key, true);
  };

  const [rangeOpen, setRangeOpen] = useState(false);
  const wholePeriod = !fromDate && !toDate;

  const applyPeriodKey = (key) => {
    setPeriodKey(key);
    if (key === 'custom') {
      setRangeOpen(true);
      return;
    }
    setRangeOpen(false);
    const range = rangeForPeriodKey(key);
    setFromDate(range.from);
    setToDate(range.to);
  };

  return (
    <MiniCrmNotesProvider clienteId={clienteId} onSave={saveObservation} onSaved={observationSaved}>
    <div className="mini-crm">
      <Helmet>
        <title>Mini CRM{empresa ? ` · ${empresa}` : ''}</title>
      </Helmet>
      <header className="mini-crm-top">
        {!isStoreUser && clientes.length > 0 && (
          <div className="mini-crm-top-row">
            <RastreamentoClienteSelect
              clientes={clientes}
              value={clienteId}
              onChange={(id) => {
                const next = new URLSearchParams(searchParams);
                next.set('cliente', id);
                setSearchParams(next);
              }}
            />
            <span className="mini-crm-saving" aria-live="polite" style={{ visibility: savingId ? 'visible' : 'hidden' }}>Salvando…</span>
          </div>
        )}
        {isStoreUser && savingId ? (
          <p className="mini-crm-saving" aria-live="polite">Salvando…</p>
        ) : null}
        <nav className="mini-crm-nav" aria-label="Visualização">
          <button type="button" className={view === 'grade' ? 'is-on' : ''} onClick={() => chooseView('grade')}>
            <Table2 size={15} />
            Grade
          </button>
          <button type="button" className={view === 'kanban' ? 'is-on' : ''} onClick={() => chooseView('kanban')}>
            <Kanban size={15} />
            Kanban
          </button>
          <button type="button" className={view === 'follow' ? 'is-on' : ''} onClick={() => chooseView('follow')}>
            <CalendarClock size={15} />
            Follow-up
          </button>
          {!lojaRestrito ? (
            <>
              <button type="button" className={view === 'config' ? 'is-on' : ''} onClick={() => chooseView('config')}>
                <Settings2 size={15} />
                Configurar
              </button>
              <button type="button" className={view === 'automacao' ? 'is-on' : ''} onClick={() => chooseView('automacao')}><Settings2 size={15} />Automação</button>
              <button type="button" className={view === 'canais' ? 'is-on' : ''} onClick={() => chooseView('canais')}>
                <Plug size={15} />
                Canais
              </button>
            </>
          ) : null}
        </nav>
      </header>

      {(view === 'grade' || view === 'kanban') && clienteId && (
        <section
          className={`mini-crm-resumo${resumoCollapsed ? ' is-collapsed' : ''}`}
          aria-label="Resumo"
        >
          <div className="mini-crm-resumo-bar">
            <p className="mini-crm-resumo-label">Resumo</p>
            {resumoCollapsed ? (
              <span className="mini-crm-resumo-peek">
                {originSummary.total.toLocaleString('pt-BR')} leads
                {wholePeriod ? ' · todo o período' : ''}
              </span>
            ) : null}
            <button
              type="button"
              className="mini-crm-resumo-toggle"
              onClick={toggleResumo}
              aria-expanded={!resumoCollapsed}
              aria-controls="mini-crm-resumo-cards"
            >
              {resumoCollapsed ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronUp size={15} aria-hidden="true" />}
              {resumoCollapsed ? 'Expandir' : 'Recolher'}
            </button>
          </div>
          {!resumoCollapsed ? (
            <div id="mini-crm-resumo-cards" className="mini-crm-resumo-grid">
              <article className="mini-crm-resumo-card is-total">
                <div className="mini-crm-resumo-head">
                  <MessageCircle size={18} />
                  <div>
                    <strong>Total de leads</strong>
                    <span>{wholePeriod ? 'Todo o período' : 'No período'}</span>
                  </div>
                </div>
                <b>{originSummary.total.toLocaleString('pt-BR')}</b>
              </article>
              <article className="mini-crm-resumo-card">
                <div className="mini-crm-resumo-head">
                  <img src="/logos/meta%20ads.webp" alt="" width="22" height="22" />
                  <div>
                    <strong>Meta Ads</strong>
                    <span>Leads da Meta</span>
                  </div>
                </div>
                <b>{originSummary.meta.toLocaleString('pt-BR')}</b>
              </article>
              <article className="mini-crm-resumo-card">
                <div className="mini-crm-resumo-head">
                  <Globe size={18} />
                  <div>
                    <strong>Outras origens</strong>
                    <span>Google e demais</span>
                  </div>
                </div>
                <b>{originSummary.outras.toLocaleString('pt-BR')}</b>
              </article>
            </div>
          ) : null}
        </section>
      )}

      {(view === 'grade' || view === 'kanban') && (
      <div className="mini-crm-toolbar">
        <label className="mini-crm-search">
          <Search size={16} />
          <input
            value={search}
            placeholder="Buscar nome ou telefone"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className="mini-crm-field mini-crm-period-field">
          <CalendarRange size={15} />
          <select
            aria-label="Período"
            value={periodKey}
            onChange={(event) => applyPeriodKey(event.target.value)}
          >
            {PERIOD_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
        {periodKey === 'custom' ? (
          <MiniCrmRangePicker
            from={fromDate}
            to={toDate}
            open={rangeOpen}
            onOpenChange={setRangeOpen}
            onChange={(from, to) => {
              setFromDate(from);
              setToDate(to);
            }}
          />
        ) : null}
        <label className="mini-crm-field">
          <select aria-label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">Todos os status</option>
            {setup.statuses.map((status) => (
              <option key={status.key} value={status.key}>{status.label}</option>
            ))}
          </select>
        </label>
        <label className="mini-crm-field">
          <select aria-label="Origem" value={originFilter} onChange={(event) => setOriginFilter(event.target.value)}>
            <option value="">Todos</option>
            <option value="meta">Meta Ads</option>
            <option value="outras">Outras origens</option>
            {canSeeUntracked ? <option value="off">Não rastreados</option> : null}
          </select>
        </label>
        <span className="mini-crm-count">{visible.length} {view === 'kanban' ? 'no quadro' : 'na grade'}</span>
      </div>
      )}

      {!clienteId && (
        <p className="mini-crm-pick">Escolha o cliente para ver os leads.</p>
      )}

      {clienteId && view === 'canais' && !lojaRestrito && (
        <ClienteCanaisPage lockedClienteId={clienteId} embeddedInMiniCrm />
      )}

      {clienteId && view === 'follow' && (
        <MiniCrmFollowUp
          groups={followGroups}
          counts={followGroups.counts}
          loading={followLoading}
          today={todayInput()}
          statuses={setup.statuses}
          columns={setup.columns}
          sellers={followSellers}
          seller={sellerFilter}
          onSeller={setSellerFilter}
          search={search}
          onSearch={setSearch}
          programRequest={programRequest}
          cadence={setup.cadence}
          savingCadence={savingConfig}
          onSaveCadence={saveCadence}
          onOpen={(row) => setPanelId(row.id)}
          onChat={(row) => setFichaContact(contactsById.current.get(row.id) || null)}
          onSchedule={(row, payload) => saveReturn(row, scheduleReturn(drafts.current.get(row.id) || row.mini, payload, setup.cadence))}
          onAttempt={concludeAttempt}
          onStart={(row) => saveReturn(row, startRepescagem(drafts.current.get(row.id) || row.mini, todayInput(), setup.statuses, setup.cadence))}
        />
      )}

      {clienteId && view === 'automacao' && !lojaRestrito && !loading && <MiniCrmMessageRules key={clienteId} clienteId={clienteId} statuses={setup.statuses} columns={setup.columns} onSaved={setAutoEnabled} />}

      {clienteId && view === 'config' && !lojaRestrito && !loading && (
        <MiniCrmConfig
          key={`${clienteId}:${storedConfig?.updated_at || 'novo'}:${setup.sellers.join('|')}`}
          statuses={setup.statuses}
          columns={setup.columns}
          sellers={setup.sellers}
          saving={savingConfig}
          onSave={saveSetup}
        />
      )}

      {clienteId && (view === 'grade' || view === 'kanban') && (
        <div
          ref={view === 'kanban' ? boardRef : undefined}
          className={`mini-crm-board${view === 'kanban' ? ' is-kanban' : ''}`}
        >
          {loading ? (
            <div className="mini-crm-loading">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando leads
            </div>
          ) : view === 'kanban' ? (
            <KanbanBoard
              columns={columns}
              statuses={setup.statuses}
              draggingId={draggingId}
              overStatus={overStatus}
              highlightedId={highlightedId}
              highlightRef={highlightRef}
              onOpen={(row) => {
                if (dragMoved.current) {
                  dragMoved.current = false;
                  return;
                }
                setFichaContact(contactsById.current.get(row.id) || null);
              }}
              onEdit={(row) => setPanelId(row.id)}
              onPointerDown={startDrag}
            />
          ) : (
            <table className="mini-crm-table">
              <thead>
                <tr>
                  {tableColumns.map((column) => (
                    <th key={column.key}>{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr>
                    <td className="mini-crm-empty" colSpan={tableColumns.length}>
                      Nenhum lead neste período.
                    </td>
                  </tr>
                )}
                {visible.map((row) => (
                  <tr
                    key={row.id}
                    ref={row.id === highlightedId ? highlightRef : undefined}
                    className={row.id === highlightedId ? 'is-hit' : undefined}
                    data-tone={statusTone(row.status, setup.statuses)}
                  >
                    {tableColumns.map((column) => (
                      <td key={column.key}>
                        <Cell
                          column={column}
                          row={row}
                          statuses={setup.statuses}
                          sellers={setup.sellers}
                          onChange={(value) => edit(row, column.key, value, column.kind)}
                          onAuxChange={(key, value) => edit(row, key, value, 'time')}
                          onOpen={() => setFichaContact(contactsById.current.get(row.id) || null)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {truncated && view !== 'config' && view !== 'follow' && (
        <p className="mini-crm-note">Mostrando os {MAX_ROWS} leads mais recentes. Ajuste o período para ver o restante.</p>
      )}

      {panelRow && (view === 'kanban' || view === 'follow') && (
        <>
          <button type="button" className="mini-crm-drawer-backdrop" aria-label="Fechar painel" onClick={() => setPanelId('')} />
          <aside
            className={`mini-crm-drawer${view === 'follow' ? ' is-follow' : ''}`}
            role="dialog"
            aria-label={view === 'follow' ? 'Painel do follow-up' : 'Dados do lead'}
          >
            {autoEnabled && (panelRow.mini?._planeje_message_status?.manual || (panelRow.status && !panelRow.mini?._planeje_message_status?.lastStatus)) && <div className="mini-crm-auto-control"><span>Automação pausada pela marcação manual.</span><button type="button" className="mini-crm-secondary" onClick={() => void resumeAutomation(panelRow)}>Retomar automação</button></div>}
            {view === 'follow' ? (
              <FollowLeadPanel
                row={panelRow}
                statuses={setup.statuses}
                cadence={setup.cadence}
                sheetFields={sheetFields}
                sellers={setup.sellers}
                today={todayInput()}
                onClose={() => setPanelId('')}
                onChat={() => setFichaContact(contactsById.current.get(panelRow.id) || null)}
                onEdit={(key, value, kind) => edit(panelRow, key, value, kind)}
                onIdentity={(field, value) => saveIdentity(panelRow, field, value)}
                onSchedule={(payload) => saveReturn(panelRow, scheduleReturn(drafts.current.get(panelRow.id) || panelRow.mini, payload, setup.cadence))}
                onAttempt={(payload) => concludeAttempt(panelRow, payload)}
              />
            ) : (
              <>
                <header>
                  <LeadAvatar name={panelRow.nome} foto={panelRow.foto} />
                  <div>
                    <IdentityField
                      key={`nome-${panelRow.id}`}
                      label="Nome do lead"
                      value={panelRow.nome}
                      onSave={(value) => saveIdentity(panelRow, 'nome', value)}
                    >
                      <strong>{panelRow.nome || 'Sem nome'}</strong>
                    </IdentityField>
                    <IdentityField
                      key={`fone-${panelRow.id}`}
                      label="Telefone do lead"
                      inputMode="tel"
                      value={panelRow.telefone ? formatPhone(panelRow.telefone) : ''}
                      onSave={(value) => saveIdentity(panelRow, 'telefone', value)}
                    >
                      <small>{formatPhone(panelRow.telefone)}</small>
                    </IdentityField>
                  </div>
                  <button type="button" aria-label="Fechar" onClick={() => setPanelId('')}>
                    <X size={16} />
                  </button>
                </header>
                <div className="mini-crm-sheet">
                  {sheetFields.map((field) => <SheetField key={field.key} field={field} row={panelRow} statuses={setup.statuses} sellers={setup.sellers} onEdit={(key, value, kind) => edit(panelRow, key, value, kind)} />)}
                </div>
              </>
            )}
          </aside>
        </>
      )}
      <RastreamentoLeadFicha
        open={Boolean(fichaContact)}
        onOpenChange={async (open) => {
          if (!open && await saveFicha() !== false) setFichaContact(null);
        }}
        clienteId={clienteId}
        contact={fichaContact}
        originLabel={fichaContact ? origemDoContato(fichaContact) : undefined}
        onNameSave={fichaContact?.id ? async (name) => {
          const contact = contactsById.current.get(fichaContact.id) || fichaContact;
          return saveIdentity(rowWithDefault(contact, statusesRef.current || []), 'nome', name);
        } : undefined}
        onComercialSaved={() => {
          if (fichaContact?.id) void refreshContactRow(fichaContact.id);
        }}
        crmFields={fichaRow ? (
          <section className="rt-lead-ficha__mark mini-crm-ficha-fields" aria-label="Mini CRM">
            <div className="mini-crm-ficha-heading">
              <h3>Mini CRM</h3>
              <span role="status">{savingId === fichaRow.id ? 'Salvando…' : Object.keys(pendingPatches.current.get(fichaRow.id) || {}).length ? 'Alterações pendentes' : 'Salvo'}</span>
            </div>
            <div className="mini-crm-sheet">
              {fichaFields.map((field) => <SheetField key={field.key} field={field} row={fichaRow} statuses={setup.statuses} sellers={setup.sellers} saleActive={Boolean(salePrompt)} onEdit={(key, value, kind) => edit(fichaRow, key, value, kind)} />)}
            </div>
            <div className="mini-crm-ficha-save">
              <span>Demais campos: salvamento automático.</span>
              <Button type="button" variant="outline" size="sm" disabled={savingId === fichaRow.id} onClick={() => void saveFicha()}>Salvar alterações</Button>
            </div>
            {autoEnabled && (fichaRow.mini?._planeje_message_status?.manual || (fichaRow.status && !fichaRow.mini?._planeje_message_status?.lastStatus)) && (
              <div className="mini-crm-auto-control"><span>Automação pausada pela marcação manual.</span><button type="button" className="mini-crm-secondary" onClick={() => void resumeAutomation(fichaRow)}>Retomar automação</button></div>
            )}
          </section>
        ) : null}
      />
      <Dialog
        open={Boolean(salePrompt)}
        onOpenChange={(open) => {
          if (!open) closeSalePrompt();
        }}
      >
        <DialogContent className="mini-crm-sale-dialog sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Registrar venda</DialogTitle>
            <DialogDescription>
              Informe a data e o valor para confirmar a venda
              {salePrompt?.row?.nome ? ` de ${salePrompt.row.nome}` : ''}.
            </DialogDescription>
          </DialogHeader>
          <div className="mini-crm-sale-fields">
            <label>
              <span>Data da venda</span>
              <DayField
                className="mini-crm-input"
                ariaLabel="Data da venda"
                value={saleDate}
                onChange={setSaleDate}
              />
            </label>
            <label>
              <span>Valor</span>
              <input
                className="mini-crm-input mini-crm-money"
                inputMode="decimal"
                placeholder="0,00"
                aria-label="Valor da venda"
                value={saleValor}
                onChange={(event) => setSaleValor(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void confirmSale();
                  }
                }}
              />
            </label>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={closeSalePrompt} disabled={saleSaving}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void confirmSale()}
              disabled={
                saleSaving
                || !canConfirmSale({ dataVenda: saleDate, valor: parseComercialValor(saleValor) })
              }
            >
              {saleSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Confirmar venda
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </MiniCrmNotesProvider>
  );
}

/** Texto do cabeçalho que vira campo ao clicar: Enter ou sair do campo grava, Esc cancela. */
function IdentityField({ label, value, inputMode, onSave, children }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const done = useRef(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const open = () => {
    done.current = false;
    setDraft(value || '');
    setEditing(true);
  };

  const finish = async () => {
    if (done.current) return;
    done.current = true;
    setSaving(true);
    try {
      const saved = await onSave(draft);
      if (saved !== false) setEditing(false);
      else done.current = false;
    } catch { done.current = false; }
    finally { setSaving(false); }
  };

  if (!editing) {
    return (
      <button type="button" className="mini-crm-identity" title={`Editar ${label.toLowerCase()}`} aria-label={`Editar ${label.toLowerCase()}`} onClick={open}>
        {children}
        <Pencil size={12} aria-hidden="true" className="mini-crm-identity-pen" />
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      className="mini-crm-identity-input"
      aria-label={label}
      inputMode={inputMode}
      value={draft}
      disabled={saving}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => void finish()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          void finish();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          done.current = true;
          setEditing(false);
        }
      }}
    />
  );
}

function dayLabel(value) {
  return formatDayBr(String(value || '').slice(0, 10));
}

function FollowLeadPanel({
  row,
  statuses,
  cadence,
  sheetFields,
  sellers,
  today,
  onClose,
  onChat,
  onEdit,
  onIdentity,
  onSchedule,
  onAttempt,
}) {
  const status = (statuses || []).find((item) => item.key === row.status);
  const retorno = returnOfRow(row, statuses, cadence);
  const received = formatWhenParts(row.data);
  const history = Array.isArray(row.mini?.retorno_historico)
    ? [...row.mini.retorno_historico].reverse()
    : [];
  const hasObservacao = (sheetFields || []).some((field) => field.key === 'observacao');
  const dataFields = (sheetFields || []).filter(
    (field) => !['proxima_em', 'proxima_acao', 'observacao'].includes(field.key),
  );
  const [em, setEm] = useState(retorno?.em || '');
  const [acao, setAcao] = useState(retorno?.acao || attemptTitle(retorno) || '');
  const [rescheduling, setRescheduling] = useState(false);

  useEffect(() => {
    setEm(retorno?.em || '');
    setAcao(retorno?.acao || attemptTitle(retorno) || '');
    setRescheduling(false);
  }, [row.id, retorno?.em, retorno?.acao, retorno?.passo, retorno?.cadencia]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="mini-crm-follow-panel">
      <header className="mini-crm-follow-panel-head">
        <LeadAvatar name={row.nome} foto={row.foto} />
        <div className="mini-crm-follow-panel-who">
          <div className="mini-crm-follow-panel-title">
            <IdentityField
              key={`nome-${row.id}`}
              label="Nome do lead"
              value={row.nome}
              onSave={(value) => onIdentity('nome', value)}
            >
              <strong>{row.nome || 'Sem nome'}</strong>
            </IdentityField>
            {status ? (
              <span
                className="mini-crm-follow-status"
                style={status.color ? { background: status.color, color: statusInk(status.color) } : undefined}
              >
                {status.label}
              </span>
            ) : null}
          </div>
          <div className="mini-crm-follow-panel-meta">
            <span>
              <Phone size={14} aria-hidden="true" />
              <IdentityField
                key={`fone-${row.id}`}
                label="Telefone do lead"
                inputMode="tel"
                value={row.telefone ? formatPhone(row.telefone) : ''}
                onSave={(value) => onIdentity('telefone', value)}
              >
                {formatPhone(row.telefone)}
              </IdentityField>
            </span>
            <span>
              <User size={14} aria-hidden="true" />
              {row.vendedor ? `Responsável: ${row.vendedor}` : 'Sem vendedor'}
            </span>
            <span>
              <CalendarClock size={14} aria-hidden="true" />
              {received.day === '—'
                ? 'Recebido em —'
                : `Recebido em ${received.day}${received.time ? ` · ${received.time}` : ''}`}
            </span>
          </div>
        </div>
        <button type="button" className="mini-crm-follow-panel-chat" onClick={onChat}>
          <MessageCircle size={15} />
          Ver conversa
        </button>
        <button type="button" aria-label="Fechar" onClick={onClose}>
          <X size={16} />
        </button>
      </header>

      <div className="mini-crm-follow-panel-body">
        <div className="mini-crm-follow-panel-col">
          <section className="mini-crm-follow-block">
            <header>
              <strong>Dados da oportunidade</strong>
            </header>
            <div className="mini-crm-sheet">
              {dataFields.map((field) => (
                <label key={field.key}>
                  <span>{field.label}</span>
                  <Cell
                    column={field}
                    row={row}
                    statuses={statuses}
                    sellers={sellers}
                    surface="sheet"
                    onChange={(value) => onEdit(field.key, value, field.kind)}
                    onAuxChange={(key, value) => onEdit(key, value, 'time')}
                  />
                </label>
              ))}
            </div>
          </section>

          <section className="mini-crm-follow-block mini-crm-follow-history">
            <header>
              <strong>Histórico</strong>
            </header>
            {history.length === 0 ? (
              <p className="mini-crm-follow-muted">Ainda sem tentativa registrada.</p>
            ) : (
              <ol>
                {history.map((item, index) => (
                  <li key={`${item.em_conclusao || item.em || index}-${index}`}>
                    <div>
                      <strong>{item.resultado || 'Tentativa'}</strong>
                      <time>{item.em_conclusao ? dayLabel(item.em_conclusao) : (item.em ? dayLabel(item.em) : '')}</time>
                    </div>
                    <small>
                      {attemptTitle(item)}
                      {item.em ? ` · retorno ${dayLabel(item.em)}` : ''}
                    </small>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <div className="mini-crm-follow-panel-col">
          <section className="mini-crm-follow-block is-next">
            <header>
              <strong>Próxima ação</strong>
            </header>
            {retorno ? (
              <>
                <p className="mini-crm-follow-next-when">
                  <CalendarClock size={16} aria-hidden="true" />
                  <strong>{dateCaption(retorno.em, today)}</strong>
                </p>
                <p className="mini-crm-follow-next-action">{retorno.acao || attemptTitle(retorno)}</p>
                <p className="mini-crm-follow-muted">{progressLabel(retorno)}</p>
                {rescheduling ? (
                  <div className="mini-crm-follow-reschedule">
                    <label>
                      Data
                      <DayField ariaLabel="Data do retorno" value={em} onChange={setEm} />
                    </label>
                    <label>
                      Ação
                      <input
                        value={acao}
                        onChange={(event) => setAcao(event.target.value)}
                        placeholder="O que fazer"
                      />
                    </label>
                    <div className="mini-crm-modal-actions">
                      <button type="button" onClick={() => setRescheduling(false)}>Cancelar</button>
                      <button
                        type="button"
                        className="is-primary"
                        onClick={() => {
                          onSchedule({ em, acao });
                          setRescheduling(false);
                        }}
                      >
                        Salvar retorno
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="mini-crm-follow-reschedule-btn" onClick={() => setRescheduling(true)}>
                    Reprogramar
                  </button>
                )}
              </>
            ) : (
              <p className="mini-crm-follow-muted">Sem retorno aberto neste lead.</p>
            )}
          </section>

          {hasObservacao ? <section className="mini-crm-follow-block"><MiniCrmObservation contactId={row.id} value={row.observacao || ''} /></section> : null}

          {retorno ? (
            <section className="mini-crm-follow-block">
              <header>
                <strong>Registrar tentativa</strong>
              </header>
              <AttemptForm
                key={`${row.id}:${retorno.passo}:${retorno.cadencia}`}
                retorno={retorno}
                today={today}
                statuses={statuses}
                cadence={cadence}
                onAttempt={onAttempt}
              />
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function kanbanStatusAt(x, y) {
  const stack = document.elementsFromPoint(x, y);
  for (const el of stack) {
    if (el.closest('.mini-crm-card')) continue;
    const column = el.closest('[data-kanban]');
    if (!column) continue;
    const raw = column.getAttribute('data-kanban');
    return raw === '__vazio' ? '' : raw;
  }
  return null;
}

function columnColor(key, statuses) {
  if (!key) return undefined;
  const color = (statuses || []).find((status) => status.key === key)?.color;
  if (!color) return undefined;
  return { '--col': color, '--col-ink': statusInk(color) };
}

function KanbanBoard({
  columns,
  statuses,
  draggingId,
  overStatus,
  highlightedId,
  highlightRef,
  onOpen,
  onEdit,
  onPointerDown,
}) {
  return columns.map((column) => {
    const total = sumColumnMoney(column.rows);
    return (
    <section
      key={column.status || 'vazio'}
      className={`mini-crm-col${overStatus === column.status ? ' is-over' : ''}`}
      data-kanban={column.status || '__vazio'}
      data-tone={statusTone(column.status, statuses)}
      style={columnColor(column.status, statuses)}
    >
      <header>
        <strong>{statusLabel(statuses, column.status)}</strong>
        {total != null && <em className="mini-crm-col-total" title="Soma dos valores desta coluna">{formatMoneyBr(total)}</em>}
        <span>{column.rows.length}</span>
      </header>
      <div className="mini-crm-col-list">
        {column.rows.length === 0 && (
          <p>{overStatus === column.status ? 'Solte aqui' : 'Nenhum lead'}</p>
        )}
        {column.rows.map((row) => {
          const when = formatWhenParts(row.data);
          const badge = originBadge(row.origem);
          return (
            <article
              key={row.id}
              ref={row.id === highlightedId ? highlightRef : undefined}
              className={`mini-crm-card${row.id === highlightedId ? ' is-hit' : ''}${row.id === draggingId ? ' is-dragging' : ''}`}
              onPointerDown={(event) => onPointerDown(event, row)}
            >
              <div className="mini-crm-person">
                <LeadAvatar name={row.nome} foto={row.foto} />
                <button type="button" title="Ver a conversa" onClick={() => onOpen(row)}>
                  {row.nome || 'Sem nome'}
                </button>
                <button
                  type="button"
                  className="mini-crm-card-edit"
                  title="Preencher"
                  aria-label="Preencher dados"
                  onClick={() => onEdit(row)}
                >
                  <FileText size={13} strokeWidth={1.75} />
                </button>
              </div>
              <small>{formatPhone(row.telefone)}</small>
              {Boolean(moneyAmount(row.valor)) && (
                <b className="mini-crm-card-money" title="Valor da venda">{formatMoneyBr(row.valor)}</b>
              )}
              <footer>
                <span className={`mini-crm-origin is-${badge.tone}`} title={badge.title}>
                  {badge.tone === 'meta' ? <img src="/logos/meta%20ads.webp" alt="" /> : null}
                  {badge.tone === 'google' ? <img src="/logos/google%20ads.png" alt="" /> : null}
                  {badge.tone === 'site' ? (badge.label === 'Meta Link' ? <Link2 size={14} /> : <Globe size={14} />) : null}
                  {badge.label}
                </span>
                <time>{when.day}</time>
              </footer>
            </article>
          );
        })}
      </div>
    </section>
    );
  });
}

function LeadAvatar({ name, foto }) {
  const [broken, setBroken] = useState(false);
  if (foto && !broken) {
    return (
      <span className="mini-crm-avatar has-photo">
        <img src={foto} alt="" onError={() => setBroken(true)} />
      </span>
    );
  }
  return <span className="mini-crm-avatar" aria-hidden="true">{initials(name)}</span>;
}

function MoneyField({ value, ariaLabel, placeholder, onChange }) {
  const [editing, setEditing] = useState(false);
  const raw = value === '' || value == null ? '' : (typeof value === 'number' ? String(value).replace('.', ',') : value);
  return (
    <input
      className="mini-crm-input mini-crm-money"
      inputMode="decimal"
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={editing ? raw : (formatMoneyBr(value) || raw)}
      onFocus={() => setEditing(true)}
      onBlur={() => setEditing(false)}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function SheetField({ field, row, statuses, sellers, onEdit, saleActive = false }) {
  if (field.key === 'observacao') return <div className="mini-crm-observation-field"><MiniCrmObservation contactId={row.id} value={row.observacao || ''} label={field.label} /></div>;
  return <label className={field.key === 'proxima_acao' ? 'is-wide' : undefined}>
    <span>{field.label}</span>
    <Cell key={field.kind === 'status' ? String(saleActive) : field.key} column={field} row={row} statuses={statuses} sellers={sellers} surface="sheet"
      onChange={(value) => onEdit(field.key, value, field.kind)} onAuxChange={(key, value) => onEdit(key, value, 'time')} />
  </label>;
}

function Cell({ column, row, onChange, onAuxChange, onOpen, statuses = [], sellers = [], surface }) {
  if (column.key === 'observacao') return <MiniCrmObservation contactId={row.id} value={row.observacao || ''} label={column.label} compact={surface !== 'sheet'} />;
  if (column.locked) {
    if (column.kind === 'date') {
      const when = formatWhenParts(row.data);
      return (
        <span className="mini-crm-when">
          <strong>{when.day}</strong>
          {when.time ? <small>{when.time}</small> : null}
        </span>
      );
    }
    if (column.key === 'nome') {
      return (
        <span className="mini-crm-person">
          <LeadAvatar name={row.nome} foto={row.foto} />
          <button type="button" title="Ver a conversa" onClick={onOpen}>
            {row.nome || 'Sem nome'}
          </button>
        </span>
      );
    }
    if (column.key === 'telefone') {
      return <span className="mini-crm-phone">{formatPhone(row.telefone)}</span>;
    }
    if (column.key === 'origem') {
      const badge = originBadge(row.origem);
      return (
        <span className={`mini-crm-origin is-${badge.tone}`} title={badge.title}>
          {badge.tone === 'meta' ? <img src="/logos/meta%20ads.webp" alt="" /> : null}
          {badge.tone === 'google' ? <img src="/logos/google%20ads.png" alt="" /> : null}
          {badge.tone === 'site' ? (badge.label === 'Meta Link' ? <Link2 size={14} /> : <Globe size={14} />) : null}
          {badge.tone === 'off' ? <UserX size={14} /> : null}
          {badge.label}
        </span>
      );
    }
    return <span className="mini-crm-origin" title={row[column.key]}>{row[column.key] || '—'}</span>;
  }
  if (column.kind === 'status') {
    const current = row.status;
    const options = [...statuses];
    if (current && !options.some((status) => status.key === current)) {
      options.unshift({ key: current, label: current });
    }
    const picked = statuses.find((status) => status.key === current);
    return (
      <select
        className="mini-crm-status"
        data-tone={statusTone(current, statuses)}
        style={picked?.color ? { background: picked.color, color: statusInk(picked.color) } : undefined}
        value={current}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((status) => <option key={status.key} value={status.key}>{status.label}</option>)}
      </select>
    );
  }
  if (column.kind === 'simnao') {
    const value = row[column.key] || '';
    return (
      <select
        className="mini-crm-flag"
        data-flag={value}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">—</option>
        <option value="Sim">Sim</option>
        <option value="Não">Não</option>
      </select>
    );
  }
  if (column.key === 'vendedor' && sellers.length) {
    const current = row.vendedor || '';
    const options = current && !sellers.includes(current) ? [current, ...sellers] : sellers;
    return (
      <select
        className="mini-crm-input"
        value={current}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">—</option>
        {options.map((name) => <option key={name} value={name}>{name}</option>)}
      </select>
    );
  }
  if (column.kind === 'money') {
    return (
      <MoneyField
        value={row[column.key]}
        ariaLabel={column.label}
        placeholder={surface === 'sheet' ? 'R$ 0,00' : undefined}
        onChange={onChange}
      />
    );
  }
  if (column.kind === 'day') {
    if (isAppointmentDateColumn(column) && onAuxChange) {
      const timeKey = appointmentTimeKey(column);
      return <span className="mini-crm-appointment-fields">
        <DayField className="mini-crm-input mini-crm-day" ariaLabel={column.label} value={row[column.key] || ''} onChange={onChange} />
        <input type="time" step="60" className="mini-crm-input" aria-label={`Horário de ${column.label}`} value={row[timeKey] || row.mini?.[timeKey] || ''} onChange={(event) => onAuxChange(timeKey, event.target.value)} />
      </span>;
    }
    return (
      <DayField
        className="mini-crm-input mini-crm-day"
        ariaLabel={column.label}
        value={row[column.key] || ''}
        onChange={onChange}
      />
    );
  }
  if (surface === 'sheet' && (column.key === 'observacao' || column.key === 'proxima_acao')) {
    return (
      <textarea
        className="mini-crm-input mini-crm-area is-long"
        rows={3}
        value={row[column.key] || ''}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  return (
    <input
      className={`mini-crm-input${column.key === 'observacao' ? ' is-wide' : ''}`}
      value={row[column.key] || ''}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
