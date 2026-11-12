import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  Briefcase,
  Calendar,
  Check,
  EyeOff,
  FileText,
  Filter,
  Hash,
  Image as ImageIcon,
  List,
  Loader2,
  Lock,
  Mail,
  MessageSquare,
  Mic,
  MoreVertical,
  Paperclip,
  Pencil,
  Phone,
  RotateCcw,
  Search,
  Send,
  Settings,
  Smile,
  Sparkles,
  Square,
  StickyNote,
  Tag,
  Trash2,
  User,
  UserCheck,
  UserCircle,
  X,
  Zap,
} from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { atendimentoPreviewFallbackPath } from '@/lib/atendimentoPreviewGate';
import {
  auditTimeLabel,
  buildLeadConversaAudit,
  cqcPreviewRows,
  fetchLeadConversaAudit,
  messageAuditPreview,
} from '@/lib/rastreamentoLeadConversa';
import { nomeDoLead, patchMiniCrm, telefoneDoLead } from '@/lib/miniCrm';
import { phoneToWhatsAppJid } from '@/lib/atendimentoNewConversation';
import { invokeUazapiSendMessage, parseFunctionInvokeError } from '@/lib/atendimentoMessageActions';
import {
  ATENDIMENTO_MEDIA_ACCEPT,
  ATENDIMENTO_MEDIA_MAX_BYTES,
  insertTextAtCursor,
  readFileAsBase64,
  validateAtendimentoMediaFile,
} from '@/lib/atendimentoMediaSend';
import { SessionExpiredError } from '@/lib/authSessionToast';
import { useAtendimentoLojaMembro } from '@/hooks/useAtendimentoLojaMembro';
import {
  atalhoDigitado,
  caixaDaConversa,
  caixasDaConversa,
  podeAbrirConfiguracao,
  podeVerConversa,
} from '@/lib/atendimentoLojaAcesso';
import {
  addNota,
  deleteNota,
  fetchConversasEstado,
  fetchLojaBase,
  fetchNotas,
  friendlyDbError,
  saveConversa,
  saveObservacao,
} from '@/lib/atendimentoLojaData';
import { lastActivityByContact, mergeThreadWithNotes } from '@/lib/atendimentoLojaThread';
import {
  AtalhoSugestoes,
  EmojiPopover,
  RespostasPopover,
  TransferDialog,
  aplicarVariaveis,
  filtrarAtalhos,
} from '@/components/atendimento-loja/AtendimentoLojaPopovers';
import { invokeAtendimentoIa } from '@/lib/atendimentoIa';
import {
  destinoFunilLabel,
  escolherAgente,
  normalizeFunil,
  parseIaAction,
} from '../../../supabase/functions/_shared/atendimentoIaPrompt.js';
import './ClienteAtendimentoPage.css';
import '@/components/atendimento-loja/AtendimentoLoja.css';

const CONTACT_FIELDS =
  'id, sender_name, phone, from_jid, last_message_at, first_seen_at, profile_pic_url, mini_crm, tracking_data, whatsapp_config_id';

const BOXES = [
  { key: 'entrada', label: 'Entrada' },
  { key: 'esperando', label: 'Esperando' },
  { key: 'finalizados', label: 'Finalizados' },
];

const SIGN_KEY = 'planeje.atendimentoLoja.assinar';
const STICKER_ACCEPT = 'image/webp,image/png';

function resolveChatJid(contact) {
  const fromJid = String(contact?.from_jid || '').trim();
  if (fromJid.includes('@') && !fromJid.includes('@g.us')) {
    return fromJid.includes(':') ? fromJid.split(':')[0] : fromJid;
  }
  return phoneToWhatsAppJid(contact?.phone || contact?.phoneLabel) || null;
}

function formatListTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function formatFullDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function displayPhone(contact) {
  const phone = telefoneDoLead(contact) || contact?.phone || '';
  const digits = String(phone).replace(/\D/g, '');
  return digits || '—';
}

function displayName(contact) {
  return nomeDoLead(contact) || displayPhone(contact) || 'Sem nome';
}

function observationOf(contact) {
  const mini = contact?.mini_crm && typeof contact.mini_crm === 'object' ? contact.mini_crm : {};
  return String(mini.observacao || '');
}

function matchesSearch(item, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  const name = String(item.name || '').toLowerCase();
  const phone = String(item.phoneLabel || '').replace(/\D/g, '');
  const qDigits = q.replace(/\D/g, '');
  if (name.includes(q)) return true;
  if (qDigits && phone.includes(qDigits)) return true;
  return false;
}

function withinDays(ts, days) {
  if (!ts) return false;
  const t = new Date(ts).getTime();
  if (Number.isNaN(t)) return false;
  if (days === 0) return new Date(ts).toDateString() === new Date().toDateString();
  return Date.now() - t <= days * 24 * 60 * 60 * 1000;
}

function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function pickRecorderMime() {
  if (typeof window === 'undefined' || typeof window.MediaRecorder === 'undefined') return '';
  const options = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm'];
  return options.find((type) => window.MediaRecorder.isTypeSupported?.(type)) || '';
}

function WhatsAppSeal({ className = '' }) {
  return (
    <span className={`cliente-atendimento__wa ${className}`} aria-hidden title="WhatsApp">
      <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
        <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.95 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.87 1.22 3.07c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35z" />
        <path d="M12.04 2C6.58 2 2.15 6.43 2.15 11.89c0 1.76.46 3.48 1.34 5L2 22l5.26-1.38a9.86 9.86 0 0 0 4.78 1.22h.01c5.46 0 9.89-4.43 9.89-9.89C21.94 6.43 17.5 2 12.04 2zm0 18.07h-.01a8.17 8.17 0 0 1-4.16-1.14l-.3-.18-3.12.82.83-3.04-.2-.31a8.18 8.18 0 0 1-1.26-4.37c0-4.52 3.68-8.2 8.21-8.2 4.52 0 8.2 3.68 8.2 8.2 0 4.53-3.68 8.22-8.19 8.22z" />
      </svg>
    </span>
  );
}

function Avatar({ item, size = '' }) {
  return (
    <span className={`cliente-atendimento__avatar-wrap ${size}`}>
      {item?.profile_pic_url ? (
        <img className="cliente-atendimento__avatar" src={item.profile_pic_url} alt="" />
      ) : (
        <span className="cliente-atendimento__avatar is-fallback" aria-hidden>
          {(item?.name || '?').charAt(0).toUpperCase()}
        </span>
      )}
    </span>
  );
}

function EtiquetaChip({ etiqueta }) {
  if (!etiqueta) return null;
  return (
    <span className="atl-tag" style={{ '--atl-tag': etiqueta.cor || '#64748b' }}>
      {etiqueta.nome}
    </span>
  );
}

/**
 * Atendimento da loja (prévia Ápice): inbox com caixas, notas, etiquetas, setores,
 * transferência, respostas rápidas, anexo/áudio e envio pela loja. Nível vem de cliente_atend_membros.
 */
export default function ClienteAtendimentoPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const atendimento = useAtendimentoLojaMembro();
  const { gate, nivel, permissoes, membro, loading: loadingMembro } = atendimento;
  const clienteId = gate ? profile?.cliente_id : null;
  const userId = user?.id || null;
  const allowed = gate && Boolean(nivel);

  const [loadingList, setLoadingList] = useState(true);
  const [contacts, setContacts] = useState([]);
  const [activity, setActivity] = useState(() => new Map());
  const [previews, setPreviews] = useState(() => new Map());
  const [estados, setEstados] = useState(() => ({}));
  const [base, setBase] = useState({ setores: [], etiquetas: [], membros: [], respostas: [], agentes: [], agentesAtivos: 0 });
  const [selectedId, setSelectedId] = useState(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [thread, setThread] = useState({ items: [], inboundCount: 0, outboundCount: 0 });
  const [notas, setNotas] = useState([]);
  const [box, setBox] = useState('entrada');
  const [search, setSearch] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTab, setPanelTab] = useState('contato');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [composerTab, setComposerTab] = useState('mensagem');
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [toast, setToast] = useState('');
  const [windowHidden, setWindowHidden] = useState(false);
  const [filterCanal, setFilterCanal] = useState('todos');
  const [filterData, setFilterData] = useState('todos');
  const [filterSetor, setFilterSetor] = useState('todos');
  const [filterEtiqueta, setFilterEtiqueta] = useState('todos');
  const [filterAtendente, setFilterAtendente] = useState('todos');
  const [signOn, setSignOn] = useState(() => {
    try {
      return window.localStorage.getItem(SIGN_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [threadSearch, setThreadSearch] = useState('');
  const [threadSearchOpen, setThreadSearchOpen] = useState(false);
  const [popover, setPopover] = useState(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [savingConversa, setSavingConversa] = useState(false);
  const [recording, setRecording] = useState(null);
  const [obsDraft, setObsDraft] = useState('');
  const [obsState, setObsState] = useState('');
  const [emailDraft, setEmailDraft] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [iaTransferHint, setIaTransferHint] = useState('');
  const chatRef = useRef(null);
  const menuRef = useRef(null);
  const draftRef = useRef(null);
  const listSearchRef = useRef(null);
  const fileRef = useRef(null);
  const galleryRef = useRef(null);
  const stickerRef = useRef(null);
  const obsTimer = useRef(null);
  const reopenDone = useRef(new Set());

  const showToast = useCallback((text) => {
    setToast(text);
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => setToast(''), 3400);
  }, []);

  const loadBase = useCallback(async () => {
    if (!clienteId || !allowed) return;
    try {
      setBase(await fetchLojaBase(clienteId));
    } catch {
      /* mantém o que já tinha */
    }
  }, [clienteId, allowed]);

  const loadList = useCallback(async (opts = {}) => {
    const silent = Boolean(opts.silent);
    if (!clienteId || !allowed) {
      setContacts([]);
      setLoadingList(false);
      return;
    }
    if (!silent) setLoadingList(true);
    try {
      const [contactRes, inboxRes, sentRes, estadoRows] = await Promise.all([
        supabase
          .from('cliente_whatsapp_contact')
          .select(CONTACT_FIELDS)
          .eq('cliente_id', clienteId)
          .order('last_message_at', { ascending: false, nullsFirst: false })
          .limit(300),
        supabase
          .from('cliente_whatsapp_inbox')
          .select('from_jid, chat_jid, phone, body, type, msg_timestamp, created_at, is_group')
          .eq('cliente_id', clienteId)
          .eq('is_group', false)
          .order('created_at', { ascending: false })
          .limit(600),
        supabase
          .from('cliente_whatsapp_sent')
          .select('chat_jid, to_jid, body, created_at')
          .eq('cliente_id', clienteId)
          .order('created_at', { ascending: false })
          .limit(600),
        fetchConversasEstado(clienteId),
      ]);
      if (contactRes.error) throw contactRes.error;
      if (inboxRes.error) throw inboxRes.error;
      if (sentRes.error) throw sentRes.error;
      const list = contactRes.data || [];
      const inboxRows = inboxRes.data || [];
      const sentRows = sentRes.data || [];
      const act = lastActivityByContact(list, inboxRows, sentRows);

      const digitsOf = (v) => String(v || '').split('@')[0].split(':')[0].replace(/\D/g, '');
      const lastInPreview = new Map();
      inboxRows.forEach((row) => {
        const key = digitsOf(row.from_jid || row.chat_jid) || digitsOf(row.phone);
        if (key && !lastInPreview.has(key)) {
          lastInPreview.set(key, { preview: messageAuditPreview(row.body, row.type), at: row.msg_timestamp || row.created_at });
        }
      });
      const lastOutPreview = new Map();
      sentRows.forEach((row) => {
        const key = digitsOf(row.chat_jid || row.to_jid);
        if (key && !lastOutPreview.has(key)) {
          lastOutPreview.set(key, { preview: messageAuditPreview(row.body, ''), at: row.created_at });
        }
      });
      const prev = new Map();
      list.forEach((contact) => {
        const key = digitsOf(contact.from_jid) || digitsOf(contact.phone);
        const a = lastInPreview.get(key) || lastInPreview.get(digitsOf(contact.phone));
        const b = lastOutPreview.get(key) || lastOutPreview.get(digitsOf(contact.phone));
        let last = a || b || null;
        if (a && b) last = new Date(b.at) > new Date(a.at) ? { ...b, out: true } : a;
        else if (b) last = { ...b, out: true };
        if (!last) {
          const cqc = cqcPreviewRows(contact);
          const body = cqc.inboxRows[0]?.body || cqc.sentRows[0]?.body || '';
          if (body) last = { preview: body, at: null };
        }
        prev.set(contact.id, last);
      });

      const byContact = {};
      (estadoRows || []).forEach((row) => {
        byContact[row.contact_id] = row;
      });

      setContacts(list);
      setActivity(act);
      setPreviews(prev);
      setEstados(byContact);
    } catch {
      if (!silent) setContacts([]);
    } finally {
      if (!silent) setLoadingList(false);
    }
  }, [clienteId, allowed]);

  useEffect(() => {
    if (!allowed) return;
    loadBase();
    loadList();
  }, [allowed, loadBase, loadList]);

  useEffect(() => {
    if (!allowed) return;
    const tick = window.setInterval(() => {
      loadList({ silent: true });
    }, 10000);
    return () => window.clearInterval(tick);
  }, [allowed, loadList]);

  useEffect(() => {
    const onDoc = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const membrosById = useMemo(() => {
    const map = new Map();
    base.membros.forEach((m) => map.set(m.user_id, m));
    return map;
  }, [base.membros]);
  const setoresById = useMemo(() => new Map(base.setores.map((s) => [s.id, s])), [base.setores]);
  const etiquetasById = useMemo(() => new Map(base.etiquetas.map((e) => [e.id, e])), [base.etiquetas]);

  const attendantName = useMemo(() => {
    const fromMembro = String(membro?.nome || '').trim();
    const fromProfile = String(profile?.full_name || '').trim();
    const full = fromMembro || fromProfile;
    if (full) return full.split(/\s+/)[0];
    const emailLocal = String(user?.email || '').split('@')[0].trim();
    return emailLocal || 'Atendente';
  }, [membro?.nome, profile?.full_name, user?.email]);

  const conversations = useMemo(() => {
    return contacts
      .map((contact) => {
        const conversa = estados[contact.id] || null;
        const act = activity.get(contact.id) || {};
        const last = previews.get(contact.id) || null;
        const lastAt =
          [act.lastInboundAt, act.lastOutboundAt, contact.last_message_at, contact.first_seen_at]
            .filter(Boolean)
            .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;
        return {
          ...contact,
          name: displayName(contact),
          phoneLabel: displayPhone(contact),
          lastPreview: last?.preview || '',
          lastOut: Boolean(last?.out),
          lastAt,
          conversa,
          lastInboundAt: act.lastInboundAt || null,
          lastOutboundAt: act.lastOutboundAt || null,
          ...(() => {
            const args = { conversa, lastInboundAt: act.lastInboundAt, lastOutboundAt: act.lastOutboundAt };
            return { caixas: caixasDaConversa(args), box: caixaDaConversa(args) };
          })(),
          observacao: observationOf(contact),
          canal: 'whatsapp',
        };
      })
      .filter((item) =>
        podeVerConversa({ nivel, userId, conversa: item.conversa, setorIds: membro?.setor_ids || [] })
      )
      .sort((a, b) => new Date(b.lastAt || 0).getTime() - new Date(a.lastAt || 0).getTime());
  }, [contacts, estados, activity, previews, nivel, userId, membro?.setor_ids]);

  // Mensagem nova do contato depois de finalizar: grava a conversa como aberta de novo.
  useEffect(() => {
    if (!allowed || !clienteId) return;
    conversations.forEach((item) => {
      const conversa = item.conversa;
      if (!conversa || !item.caixas.reaberta) return;
      const key = `${conversa.id}:${item.lastInboundAt}`;
      if (reopenDone.current.has(key)) return;
      reopenDone.current.add(key);
      saveConversa({
        clienteId,
        contactId: item.id,
        existingId: conversa.id,
        patch: { status: 'entrada', status_at: new Date().toISOString() },
        userId,
      })
        .then((row) => {
          if (row) setEstados((prev) => ({ ...prev, [item.id]: row }));
        })
        .catch(() => {});
    });
  }, [conversations, allowed, clienteId, userId]);

  const filtered = useMemo(() => {
    return conversations.filter((item) => {
      if (!matchesSearch(item, search)) return false;
      if (filterCanal === 'whatsapp' && item.canal !== 'whatsapp') return false;
      if (filterData === 'hoje' && !withinDays(item.lastAt, 0)) return false;
      if (filterData === '7d' && !withinDays(item.lastAt, 7)) return false;
      if (filterData === '30d' && !withinDays(item.lastAt, 30)) return false;
      const c = item.conversa || {};
      if (filterSetor === 'sem' && c.setor_id) return false;
      if (filterSetor !== 'todos' && filterSetor !== 'sem' && c.setor_id !== filterSetor) return false;
      if (filterEtiqueta !== 'todos' && !(c.etiqueta_ids || []).includes(filterEtiqueta)) return false;
      if (filterAtendente === 'meus' && c.assigned_to !== userId) return false;
      if (filterAtendente === 'sem' && c.assigned_to) return false;
      if (!['todos', 'meus', 'sem'].includes(filterAtendente) && c.assigned_to !== filterAtendente) return false;
      return true;
    });
  }, [conversations, search, filterCanal, filterData, filterSetor, filterEtiqueta, filterAtendente, userId]);

  const boxes = useMemo(() => {
    const out = { entrada: [], esperando: [], finalizados: [] };
    filtered.forEach((item) => {
      BOXES.forEach(({ key }) => {
        if (item.caixas[key]) out[key].push(item);
      });
    });
    return out;
  }, [filtered]);

  const activeFilters =
    [filterCanal, filterData, filterSetor, filterEtiqueta, filterAtendente].filter((v) => v !== 'todos').length;

  const visible = boxes[box] || [];
  const selected =
    !windowHidden && conversations.find((item) => item.id === selectedId)
      ? conversations.find((item) => item.id === selectedId)
      : null;
  const selectedConversa = selected?.conversa || null;

  useEffect(() => {
    if (windowHidden) return;
    if (visible.some((item) => item.id === selectedId)) return;
    setSelectedId(visible[0]?.id || null);
  }, [box, selectedId, visible, windowHidden]);

  useEffect(() => {
    setIaTransferHint('');
  }, [selectedId]);

  const reloadThread = useCallback(
    async (contact) => {
      if (!clienteId || !contact) return;
      const digits = String(contact.phone || contact.phoneLabel || '').replace(/\D/g, '');
      const raw = await fetchLeadConversaAudit(supabase, { clienteId, digits });
      let inboxRows = raw.inboxRows || [];
      let sentRows = raw.sentRows || [];
      if (!inboxRows.length && !sentRows.length) {
        const cqc = cqcPreviewRows(contact);
        inboxRows = cqc.inboxRows;
        sentRows = cqc.sentRows;
      }
      setThread(buildLeadConversaAudit({ inboxRows, sentRows }));
    },
    [clienteId]
  );

  const selectedKey = selected?.id || null;
  useEffect(() => {
    if (!allowed || !clienteId || !selectedKey) {
      setThread({ items: [], inboundCount: 0, outboundCount: 0 });
      setNotas([]);
      return undefined;
    }
    const contact = conversations.find((item) => item.id === selectedKey);
    let cancelled = false;
    setLoadingThread(true);
    (async () => {
      try {
        await reloadThread(contact);
        const rows = await fetchNotas(clienteId, selectedKey).catch(() => []);
        if (!cancelled) setNotas(rows);
      } finally {
        if (!cancelled) setLoadingThread(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, clienteId, selectedKey, reloadThread]);

  const mergedItems = useMemo(() => mergeThreadWithNotes(thread.items, notas), [thread.items, notas]);

  const filteredThreadItems = useMemo(() => {
    const q = String(threadSearch || '').trim().toLowerCase();
    if (!q) return mergedItems;
    return mergedItems.filter((item) => item.type === 'day' || String(item.body || '').toLowerCase().includes(q));
  }, [mergedItems, threadSearch]);

  useEffect(() => {
    if (!chatRef.current) return;
    chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [mergedItems, selectedId]);

  useEffect(() => {
    setDraftText('');
    setSendError('');
    setNoteText('');
    setPopover(null);
    setObsState('');
    window.clearTimeout(obsTimer.current);
  }, [selectedId]);

  useEffect(() => {
    setObsDraft(selected ? observationOf(selected) : '');
    setEmailDraft(selected?.conversa?.contato_email || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  const applyConversaRow = useCallback((contactId, row) => {
    setEstados((prev) => {
      const next = { ...prev };
      if (row) next[contactId] = row;
      else delete next[contactId];
      return next;
    });
  }, []);

  const patchConversa = useCallback(
    async (contact, patch, okMessage) => {
      if (!contact || !clienteId) return null;
      setSavingConversa(true);
      try {
        const existing = contact.conversa || estados[contact.id] || null;
        const insertPatch =
          !existing && nivel === 'atendente' ? { assigned_to: userId, ...patch } : patch;
        const row = await saveConversa({
          clienteId,
          contactId: contact.id,
          existingId: existing?.id || null,
          patch: insertPatch,
          userId,
        });
        if (row) applyConversaRow(contact.id, row);
        else {
          // Deixou de ser visível para este nível (ex.: transferida para outro atendente).
          setContacts((prev) => prev.filter((c) => c.id !== contact.id));
          applyConversaRow(contact.id, null);
        }
        if (okMessage) showToast(okMessage);
        return row;
      } catch (err) {
        showToast(friendlyDbError(err));
        return null;
      } finally {
        setSavingConversa(false);
      }
    },
    [clienteId, estados, nivel, userId, applyConversaRow, showToast]
  );

  const markAfterSend = useCallback(
    (contact) => {
      const existing = contact?.conversa;
      patchConversa(contact, {
        status: 'entrada',
        status_at: new Date().toISOString(),
        assigned_to: existing?.assigned_to || userId,
        ia_pausada: true,
        ia_followup_passo: 0,
        ia_followup_due_at: null,
      });
    },
    [patchConversa, userId]
  );

  const composeOutgoing = useCallback(
    (text) => (signOn && text ? `*${attendantName}:*\n${text}` : text),
    [signOn, attendantName]
  );

  const pushLocalOut = useCallback((body, id) => {
    const nowIso = new Date().toISOString();
    setThread((prev) => ({
      ...prev,
      items: [...(prev.items || []), { id: id || `out-local-${Date.now()}`, type: 'msg', side: 'equipe', body, at: nowIso }],
      outboundCount: (prev.outboundCount || 0) + 1,
    }));
  }, []);

  const handleSendText = useCallback(async () => {
    if (!allowed || !permissoes.enviar) return;
    const raw = String(draftText || '').trim();
    if (!raw || !selected || sending || !clienteId) return;
    const to = resolveChatJid(selected);
    if (!to) {
      setSendError('Não foi possível achar o WhatsApp deste contato.');
      return;
    }
    const text = composeOutgoing(raw);
    setSending(true);
    setSendError('');
    try {
      const { data, error } = await invokeUazapiSendMessage({
        body: { to, body: text, cliente_id: clienteId, whatsapp_config_id: selected.whatsapp_config_id || undefined },
      });
      if (error) throw new Error(await parseFunctionInvokeError(error, data));
      if (data?.error) throw new Error(data.error);
      setDraftText('');
      pushLocalOut(text, data?.sent_row_id);
      markAfterSend(selected);
      window.setTimeout(() => reloadThread(selected).catch(() => {}), 600);
    } catch (err) {
      setSendError(
        err instanceof SessionExpiredError ? 'Sessão expirada. Entre de novo.' : err?.message || 'Erro ao enviar. Tente novamente.'
      );
    } finally {
      setSending(false);
      requestAnimationFrame(() => draftRef.current?.focus());
    }
  }, [allowed, permissoes.enviar, draftText, selected, sending, clienteId, composeOutgoing, pushLocalOut, markAfterSend, reloadThread]);

  const sendMediaFile = useCallback(
    async (file, forcedType) => {
      if (!allowed || !permissoes.enviar || !selected || !clienteId || sending) return;
      const check = validateAtendimentoMediaFile(file);
      if (!check.ok) {
        showToast(check.message);
        return;
      }
      const mediaType = forcedType || check.mediaType;
      const to = resolveChatJid(selected);
      if (!to) {
        showToast('Não foi possível achar o WhatsApp deste contato.');
        return;
      }
      setSending(true);
      setSendError('');
      try {
        const base64 = await readFileAsBase64(file);
        const caption = mediaType === 'image' || mediaType === 'document' ? composeOutgoing(String(draftText || '').trim()) : '';
        const { data, error } = await invokeUazapiSendMessage({
          body: {
            to,
            media_type: mediaType,
            file: base64,
            doc_name: mediaType === 'document' ? file.name : undefined,
            mimetype: file.type || undefined,
            caption: caption || undefined,
            cliente_id: clienteId,
            whatsapp_config_id: selected.whatsapp_config_id || undefined,
          },
        });
        if (error) throw new Error(await parseFunctionInvokeError(error, data));
        if (data?.error) throw new Error(data.error);
        if (caption) setDraftText('');
        const label =
          mediaType === 'image' ? 'Imagem' : mediaType === 'sticker' ? 'Figurinha' : mediaType === 'ptt' || mediaType === 'audio' ? 'Áudio' : 'Documento';
        pushLocalOut(caption || `[${label}] ${file.name || ''}`.trim(), data?.sent_row_id);
        markAfterSend(selected);
        window.setTimeout(() => reloadThread(selected).catch(() => {}), 800);
      } catch (err) {
        setSendError(
          err instanceof SessionExpiredError ? 'Sessão expirada. Entre de novo.' : err?.message || 'Erro ao enviar o arquivo.'
        );
      } finally {
        setSending(false);
      }
    },
    [allowed, permissoes.enviar, selected, clienteId, sending, draftText, composeOutgoing, pushLocalOut, markAfterSend, reloadThread, showToast]
  );

  const startRecording = useCallback(async () => {
    if (recording || sending || !selected) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof window.MediaRecorder === 'undefined') {
      showToast('Este navegador não grava áudio.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickRecorderMime();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      const chunks = [];
      recorder.ondataavailable = (e) => e.data?.size && chunks.push(e.data);
      const startedAt = Date.now();
      const state = { recorder, stream, chunks, startedAt, mimeType: recorder.mimeType || mimeType, cancel: false };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(null);
        if (state.cancel || !chunks.length) return;
        const type = state.mimeType || 'audio/webm';
        const ext = type.includes('ogg') ? 'ogg' : 'webm';
        const file = new File(chunks, `audio-${Date.now()}.${ext}`, { type: type.split(';')[0] });
        if (file.size > ATENDIMENTO_MEDIA_MAX_BYTES) {
          showToast('Áudio muito longo. Máximo 4 MB.');
          return;
        }
        sendMediaFile(file, 'ptt');
      };
      recorder.start();
      setRecording({ ...state, tick: 0 });
    } catch {
      showToast('Microfone não liberado neste navegador.');
    }
  }, [recording, sending, selected, sendMediaFile, showToast]);

  useEffect(() => {
    if (!recording) return undefined;
    const t = window.setInterval(() => setRecording((prev) => (prev ? { ...prev, tick: prev.tick + 1 } : prev)), 1000);
    return () => window.clearInterval(t);
  }, [recording?.startedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopRecording = (cancel) => {
    if (!recording) return;
    recording.cancel = Boolean(cancel);
    try {
      recording.recorder.stop();
    } catch {
      setRecording(null);
    }
  };

  const handleSaveNote = useCallback(async () => {
    const texto = String(noteText || '').trim();
    if (!texto || !selected || savingNote || !clienteId) return;
    setSavingNote(true);
    try {
      const nota = await addNota({ clienteId, contactId: selected.id, userId, autorNome: membro?.nome || profile?.full_name || attendantName, texto });
      setNotas((prev) => [...prev, nota]);
      setNoteText('');
      showToast('Nota interna gravada. O contato não recebe.');
    } catch (err) {
      showToast(friendlyDbError(err, 'Não foi possível gravar a nota.'));
    } finally {
      setSavingNote(false);
    }
  }, [noteText, selected, savingNote, clienteId, userId, membro?.nome, profile?.full_name, attendantName, showToast]);

  const handleDeleteNote = async (noteId) => {
    if (!window.confirm('Apagar esta nota interna?')) return;
    try {
      await deleteNota(noteId);
      setNotas((prev) => prev.filter((n) => n.id !== noteId));
    } catch (err) {
      showToast(friendlyDbError(err, 'Não foi possível apagar a nota.'));
    }
  };

  const handleSuggest = useCallback(async () => {
    if (!selected || suggesting) return;
    setSuggesting(true);
    setSendError('');
    try {
      const result = await invokeAtendimentoIa({ acao: 'sugerir', cliente_id: clienteId, contact_id: selected.id });
      if (!result?.resposta) throw new Error('A IA não devolveu sugestão.');
      const parsed = parseIaAction(result.resposta);
      const agente = (base.agentes || []).find((a) => a.id === result.agente?.id) || escolherAgente(base.agentes || [], { setorId: selected.conversa?.setor_id });
      setComposerTab('mensagem');
      setDraftText(parsed.texto || result.resposta);
      if (parsed.action === 'transfer') {
        const dest = destinoFunilLabel(agente?.funil, base.setores);
        setIaTransferHint(`A IA indicou passar para ${dest}. Revise a mensagem; Passar para atendente marca Esperando e a IA para. Nada vai ao WhatsApp sozinho.`);
        showToast(`Sugestão de ${result.agente?.nome || 'IA'}: passaria para ${dest}.`);
      } else {
        setIaTransferHint('');
        showToast(`Sugestão de ${result.agente?.nome || 'IA'} no campo. Revise antes de enviar.`);
      }
      requestAnimationFrame(() => draftRef.current?.focus());
    } catch (err) {
      setSendError(err?.message || 'Não foi possível sugerir.');
    } finally {
      setSuggesting(false);
    }
  }, [selected, suggesting, showToast, clienteId, base.agentes, base.setores]);

  const scheduleObservacao = (value) => {
    setObsDraft(value);
    setObsState('editando');
    window.clearTimeout(obsTimer.current);
    const contact = selected;
    obsTimer.current = window.setTimeout(async () => {
      if (!contact) return;
      setObsState('salvando');
      try {
        const nextMini = await saveObservacao({ clienteId, contactId: contact.id, value, patchMiniCrm });
        setContacts((prev) => prev.map((c) => (c.id === contact.id ? { ...c, mini_crm: nextMini } : c)));
        setObsState('salvo');
      } catch (err) {
        setObsState('');
        showToast(friendlyDbError(err, 'Não foi possível gravar a observação.'));
      }
    }, 800);
  };

  const saveEmail = () => {
    if (!selected) return;
    const value = String(emailDraft || '').trim();
    if ((selected.conversa?.contato_email || '') === value) return;
    if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      showToast('E-mail inválido.');
      return;
    }
    patchConversa(selected, { contato_email: value || null }, 'E-mail gravado.');
  };

  const toggleEtiqueta = (etiquetaId) => {
    if (!selected) return;
    const current = selected.conversa?.etiqueta_ids || [];
    const next = current.includes(etiquetaId) ? current.filter((id) => id !== etiquetaId) : [...current, etiquetaId];
    patchConversa(selected, { etiqueta_ids: next });
  };

  if (!gate) {
    return <Navigate to={atendimentoPreviewFallbackPath(profile)} replace />;
  }
  if (loadingMembro) {
    return (
      <div className="atl-center">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando acesso…
      </div>
    );
  }
  if (!nivel) {
    return (
      <div className="atl-center">
        <Lock className="h-5 w-5" />
        <p>Seu usuário não tem acesso ao Atendimento desta loja (inativo ou sem nível). Fale com o administrador da loja.</p>
      </div>
    );
  }

  const firstBubble = mergedItems.find((item) => item.type !== 'day' && item.side !== 'nota');
  const startedByContact = firstBubble && firstBubble.side !== 'equipe';
  const assignedMembro = selectedConversa?.assigned_to ? membrosById.get(selectedConversa.assigned_to) : null;
  const selectedSetor = selectedConversa?.setor_id ? setoresById.get(selectedConversa.setor_id) : null;
  const atalhoTermo = composerTab === 'mensagem' ? atalhoDigitado(draftText) : null;
  const atalhoMatches = atalhoTermo !== null ? filtrarAtalhos(base.respostas, atalhoTermo) : [];
  const canConfig = podeAbrirConfiguracao(nivel);

  const openPanel = (tab = 'contato') => {
    setPanelTab(tab);
    setPanelOpen(true);
    setMenuOpen(false);
  };

  const pickResposta = (item) => {
    const texto = aplicarVariaveis(item.texto, selected);
    if (atalhoTermo !== null) setDraftText(texto);
    else insertTextAtCursor(draftRef.current, draftText, texto, setDraftText);
    setPopover(null);
    setComposerTab('mensagem');
    requestAnimationFrame(() => draftRef.current?.focus());
  };

  const actionFinalizar = () => {
    setMenuOpen(false);
    if (!selected) return;
    const now = new Date().toISOString();
    patchConversa(
      selected,
      { status: 'finalizado', status_at: now, finalizado_at: now, finalizado_by: userId, ia_followup_passo: 0, ia_followup_due_at: null },
      'Conversa finalizada. Volta para Entrada se o contato escrever de novo.'
    );
  };
  const actionReabrir = () => {
    setMenuOpen(false);
    if (!selected) return;
    patchConversa(selected, { status: 'entrada', status_at: new Date().toISOString() }, 'Conversa reaberta.');
    setBox(selected.lastOutboundAt ? 'entrada' : 'esperando');
  };
  const actionEsperando = () => {
    setMenuOpen(false);
    if (!selected) return;
    patchConversa(
      selected,
      { status: 'esperando', status_at: new Date().toISOString() },
      'Marcada como esperando: fica em Esperando até a loja responder.'
    );
  };
  const actionPassarAtendente = () => {
    setMenuOpen(false);
    if (!selected) return;
    const agente = escolherAgente(base.agentes || [], { setorId: selectedConversa?.setor_id });
    const funil = normalizeFunil(agente?.funil);
    const patch = { status: 'esperando', status_at: new Date().toISOString(), ia_pausada: true, ia_followup_passo: 0, ia_followup_due_at: null };
    if (funil.destino_tipo === 'setor' && funil.destino_setor_id) patch.setor_id = funil.destino_setor_id;
    patchConversa(selected, patch, `Passou para ${destinoFunilLabel(funil, base.setores)}. A IA para nesta conversa.`);
    setIaTransferHint('');
  };
  const actionAtribuirMim = () => {
    setMenuOpen(false);
    if (!selected) return;
    patchConversa(selected, { assigned_to: userId }, 'Conversa atribuída a você.');
  };
  const actionPrivar = () => {
    setMenuOpen(false);
    if (!selected) return;
    const privado = !selectedConversa?.privado;
    patchConversa(
      selected,
      { privado, assigned_to: selectedConversa?.assigned_to || userId },
      privado ? 'Atendimento privado: só o atendente responsável (e o admin da loja) vê.' : 'Atendimento deixou de ser privado.'
    );
  };
  const actionAgendar = () => {
    setMenuOpen(false);
    showToast('Agendar envio ainda não está disponível: falta um agendador seguro no servidor para a loja.');
  };
  const confirmTransfer = async ({ setor_id, assigned_to }) => {
    if (!selected) return;
    const patch = { setor_id, assigned_to };
    if (assigned_to !== (selectedConversa?.assigned_to || null)) patch.privado = false;
    await patchConversa(selected, patch, 'Conversa transferida.');
    setTransferOpen(false);
  };

  const onFilePicked = (event, forcedType) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) sendMediaFile(file, forcedType);
  };

  const isFinalizado = Boolean(selected?.caixas?.finalizados);
  const recordingSeconds = recording ? recording.tick : 0;

  return (
    <>
      <Helmet title="Atendimento — Planeje" />
      <div
        className={`cliente-atendimento${panelOpen && selected ? ' has-panel' : ''}${filtersOpen ? ' has-filters' : ''}`}
      >
        {filtersOpen ? (
          <aside className="cliente-atendimento__filters" aria-label="Filtros">
            <header>
              <h2>Filtros</h2>
              <button type="button" onClick={() => setFiltersOpen(false)} aria-label="Fechar filtros">
                <X className="h-4 w-4" />
              </button>
            </header>
            <label>
              <span>
                <Hash className="h-3.5 w-3.5" /> Setor
              </span>
              <select value={filterSetor} onChange={(e) => setFilterSetor(e.target.value)}>
                <option value="todos">Todos</option>
                <option value="sem">Sem setor</option>
                {base.setores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>
                <Tag className="h-3.5 w-3.5" /> Etiqueta
              </span>
              <select value={filterEtiqueta} onChange={(e) => setFilterEtiqueta(e.target.value)}>
                <option value="todos">Todas</option>
                {base.etiquetas.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>
                <User className="h-3.5 w-3.5" /> Atendente
              </span>
              <select value={filterAtendente} onChange={(e) => setFilterAtendente(e.target.value)}>
                <option value="todos">Todos</option>
                <option value="meus">Minhas conversas</option>
                <option value="sem">Sem atendente</option>
                {base.membros
                  .filter((m) => m.ativo && m.user_id !== userId)
                  .map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.nome || m.email}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              <span>
                <MessageSquare className="h-3.5 w-3.5" /> Canal
              </span>
              <select value={filterCanal} onChange={(e) => setFilterCanal(e.target.value)}>
                <option value="todos">Todos</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
            </label>
            <label>
              <span>
                <Calendar className="h-3.5 w-3.5" /> Data
              </span>
              <select value={filterData} onChange={(e) => setFilterData(e.target.value)}>
                <option value="todos">Todas</option>
                <option value="hoje">Hoje</option>
                <option value="7d">Últimos 7 dias</option>
                <option value="30d">Últimos 30 dias</option>
              </select>
            </label>
            {activeFilters ? (
              <button
                type="button"
                className="atl-btn is-ghost is-sm"
                onClick={() => {
                  setFilterCanal('todos');
                  setFilterData('todos');
                  setFilterSetor('todos');
                  setFilterEtiqueta('todos');
                  setFilterAtendente('todos');
                }}
              >
                Limpar filtros
              </button>
            ) : null}
          </aside>
        ) : null}

        <aside className="cliente-atendimento__list">
          <header className="cliente-atendimento__list-head">
            <h1>Conversas</h1>
            <div className="cliente-atendimento__list-tools">
              {windowHidden ? (
                <button type="button" onClick={() => setWindowHidden(false)} title="Mostrar janela" aria-label="Mostrar janela">
                  <EyeOff className="h-4 w-4" />
                </button>
              ) : null}
              <button type="button" onClick={() => loadList()} title="Atualizar lista" aria-label="Atualizar lista">
                <List className="h-4 w-4" />
              </button>
              <button
                type="button"
                className={`cliente-atendimento__funnel${filtersOpen || activeFilters ? ' is-on' : ''}`}
                onClick={() => setFiltersOpen((v) => !v)}
                title={activeFilters ? `Filtros (${activeFilters})` : 'Filtros'}
                aria-label={filtersOpen ? 'Fechar filtros' : 'Abrir filtros'}
              >
                <Filter className="h-4 w-4" />
              </button>
              {canConfig ? (
                <button
                  type="button"
                  className="cliente-atendimento__list-add"
                  onClick={() => navigate('/cliente/atendimento/config')}
                  title="Configurações do atendimento"
                  aria-label="Configurações do atendimento"
                >
                  <Settings className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </header>

          <div className="cliente-atendimento__search-row">
            <label className="cliente-atendimento__search">
              <Search className="h-4 w-4" aria-hidden />
              <input
                ref={listSearchRef}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome ou telefone"
                autoComplete="off"
              />
            </label>
          </div>

          <div className="cliente-atendimento__boxes" role="tablist" aria-label="Caixas">
            {BOXES.map((item) => {
              const count = boxes[item.key]?.length || 0;
              const active = box === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={active ? 'is-active' : undefined}
                  onClick={() => {
                    setBox(item.key);
                    setWindowHidden(false);
                  }}
                >
                  <span>{item.label}</span>
                  {(active || count > 0) && <em>{count}</em>}
                </button>
              );
            })}
          </div>

          {loadingList ? (
            <p className="cliente-atendimento__empty">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando conversas…
            </p>
          ) : visible.length === 0 ? (
            <p className="cliente-atendimento__empty">
              <MessageSquare className="h-5 w-5 opacity-50" />
              {search.trim() || activeFilters
                ? 'Nenhuma conversa encontrada'
                : `Nenhuma conversa em ${BOXES.find((b) => b.key === box)?.label || box}.`}
            </p>
          ) : (
            <ul className="cliente-atendimento__chats">
              {visible.map((item) => {
                const c = item.conversa || {};
                const setor = c.setor_id ? setoresById.get(c.setor_id) : null;
                const dono = c.assigned_to ? membrosById.get(c.assigned_to) : null;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={item.id === selectedId && !windowHidden ? 'is-active' : undefined}
                      onClick={() => {
                        setSelectedId(item.id);
                        setWindowHidden(false);
                      }}
                    >
                      <Avatar item={item} />
                      <span className="cliente-atendimento__chat-main">
                        <span className="cliente-atendimento__chat-top">
                          <strong>{item.name}</strong>
                          <time>{formatListTime(item.lastAt)}</time>
                        </span>
                        <em>
                          {item.lastOut ? '✓ ' : ''}
                          {item.lastPreview || 'Sem mensagens gravadas'}
                        </em>
                        <span className="cliente-atendimento__chat-tags">
                          <WhatsAppSeal className="is-inline" />
                          <span className="cliente-atendimento__chip">{setor?.nome || 'Sem setor'}</span>
                          {c.privado ? <Lock className="h-3 w-3 atl-muted" aria-label="Privado" /> : null}
                          {(c.etiqueta_ids || []).slice(0, 2).map((id) => (
                            <EtiquetaChip key={id} etiqueta={etiquetasById.get(id)} />
                          ))}
                          {dono ? (
                            <span className="atl-owner" title={`Atendente: ${dono.nome || dono.email}`}>
                              {initials(dono.nome || dono.email)}
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <section className="cliente-atendimento__thread">
          {!selected ? (
            <div className="cliente-atendimento__thread-empty">
              <div className="cliente-atendimento__empty-art" aria-hidden>
                <span />
                <span />
              </div>
              <h2>Selecione uma conversa</h2>
              <small>Sem CAPI. Com Responder sozinho ligado, a IA fala no WhatsApp até a equipe assumir.</small>
            </div>
          ) : (
            <>
              <header className="cliente-atendimento__thread-head">
                <button
                  type="button"
                  className="cliente-atendimento__head-identity"
                  onClick={() => openPanel('contato')}
                  title="Abrir painel do contato"
                >
                  <Avatar item={selected} size="is-sm" />
                  <span>
                    <h2>
                      {selected.name}
                      <WhatsAppSeal className="is-inline is-head" />
                      <span className="cliente-atendimento__chip is-head">{selectedSetor?.nome || 'Sem setor'}</span>
                      {selectedConversa?.privado ? <Lock className="h-3.5 w-3.5 atl-muted" aria-label="Privado" /> : null}
                    </h2>
                    <small className="atl-head-sub">
                      {assignedMembro ? `Atendente: ${assignedMembro.nome || assignedMembro.email}` : 'Sem atendente'}
                      {isFinalizado ? ' · Finalizada' : ''}
                    </small>
                  </span>
                </button>
                <div className="cliente-atendimento__head-actions">
                  <button
                    type="button"
                    className={threadSearchOpen ? 'is-on' : undefined}
                    onClick={() => {
                      setThreadSearchOpen((v) => !v);
                      if (threadSearchOpen) setThreadSearch('');
                    }}
                    aria-label="Buscar na conversa"
                    title="Buscar na conversa"
                  >
                    <Search className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className={panelOpen ? 'is-on' : undefined}
                    onClick={() => (panelOpen ? setPanelOpen(false) : openPanel('contato'))}
                    aria-label={panelOpen ? 'Fechar painel do contato' : 'Abrir painel do contato'}
                    title="Contato"
                  >
                    <UserCircle className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => openPanel('detalhes')} title="Detalhes da conversa" aria-label="Detalhes da conversa">
                    <FileText className="h-4 w-4" />
                  </button>
                  {permissoes.transferir ? (
                    <button type="button" onClick={() => setTransferOpen(true)} title="Transferir" aria-label="Transferir">
                      <ArrowUpRight className="h-4 w-4" />
                    </button>
                  ) : null}
                  {permissoes.configurarIA && !isFinalizado ? (
                    <button
                      type="button"
                      onClick={actionPassarAtendente}
                      title="Passar para atendente (Esperando; a IA para)"
                      aria-label="Passar para atendente"
                      disabled={savingConversa}
                    >
                      <UserCheck className="h-4 w-4" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={selectedConversa?.privado ? 'is-on' : undefined}
                    onClick={actionPrivar}
                    title={selectedConversa?.privado ? 'Deixar de privar' : 'Privar atendimento'}
                    aria-label="Privar atendimento"
                  >
                    <Briefcase className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={actionAgendar} title="Agendar envio (em breve)" aria-label="Agendar envio">
                    <Calendar className="h-4 w-4" />
                  </button>
                  {isFinalizado ? (
                    <button type="button" onClick={actionReabrir} title="Reabrir" aria-label="Reabrir">
                      <RotateCcw className="h-4 w-4" />
                    </button>
                  ) : (
                    <button type="button" onClick={actionFinalizar} title="Finalizar" aria-label="Finalizar" disabled={savingConversa}>
                      <Check className="h-4 w-4" />
                    </button>
                  )}
                  <div className="cliente-atendimento__menu-wrap" ref={menuRef}>
                    <button
                      type="button"
                      className={menuOpen ? 'is-on' : undefined}
                      onClick={() => setMenuOpen((v) => !v)}
                      aria-label="Mais opções"
                      aria-expanded={menuOpen}
                      title="Mais opções"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                    {menuOpen ? (
                      <ul className="cliente-atendimento__dropdown" role="menu">
                        <li>
                          <button type="button" onClick={() => openPanel('contato')}>
                            Detalhes do contato
                          </button>
                        </li>
                        <li>
                          <button type="button" onClick={() => openPanel('detalhes')}>
                            Detalhes da conversa
                          </button>
                        </li>
                        {selectedConversa?.assigned_to !== userId ? (
                          <li>
                            <button type="button" onClick={actionAtribuirMim}>
                              Atribuir a mim
                            </button>
                          </li>
                        ) : null}
                        {permissoes.transferir ? (
                          <li>
                            <button
                              type="button"
                              onClick={() => {
                                setMenuOpen(false);
                                setTransferOpen(true);
                              }}
                            >
                              Transferir
                            </button>
                          </li>
                        ) : null}
                        <li>
                          <button type="button" onClick={actionPrivar}>
                            {selectedConversa?.privado ? 'Deixar de privar' : 'Privar atendimento'}
                          </button>
                        </li>
                        {!selected.caixas.esperando && !isFinalizado ? (
                          <li>
                            <button type="button" onClick={actionEsperando}>
                              Marcar como esperando
                            </button>
                          </li>
                        ) : null}
                        {permissoes.configurarIA && !isFinalizado ? (
                          <li>
                            <button type="button" onClick={actionPassarAtendente}>
                              Passar para atendente
                            </button>
                          </li>
                        ) : null}
                        {permissoes.configurarIA && selectedConversa?.ia_pausada && !isFinalizado ? (
                          <li>
                            <button
                              type="button"
                              onClick={() => {
                                setMenuOpen(false);
                                patchConversa(selected, { ia_pausada: false }, 'IA liberada nesta conversa.');
                              }}
                            >
                              Liberar IA
                            </button>
                          </li>
                        ) : null}
                        <li>
                          <button type="button" onClick={actionAgendar}>
                            Agendar envio
                          </button>
                        </li>
                        <li>
                          {isFinalizado ? (
                            <button type="button" onClick={actionReabrir}>
                              Reabrir
                            </button>
                          ) : (
                            <button type="button" onClick={actionFinalizar}>
                              Finalizar
                            </button>
                          )}
                        </li>
                        <li>
                          <button
                            type="button"
                            onClick={() => {
                              setMenuOpen(false);
                              setWindowHidden(true);
                              setPanelOpen(false);
                              showToast('Janela oculta até você abrir outra conversa. Nada foi apagado.');
                            }}
                          >
                            Ocultar
                          </button>
                        </li>
                      </ul>
                    ) : null}
                  </div>
                </div>
              </header>

              {selectedConversa?.ia_pausada && !isFinalizado ? (
                <div className="cliente-atendimento__ia-paused">
                  <span>A IA parou nesta conversa. Ela só volta se você liberar.</span>
                  {permissoes.configurarIA ? (
                    <button
                      type="button"
                      onClick={() => patchConversa(selected, { ia_pausada: false }, 'IA liberada nesta conversa.')}
                    >
                      Liberar IA
                    </button>
                  ) : null}
                </div>
              ) : null}

              {threadSearchOpen ? (
                <div className="cliente-atendimento__thread-search">
                  <Search className="h-4 w-4" aria-hidden />
                  <input
                    type="search"
                    value={threadSearch}
                    onChange={(e) => setThreadSearch(e.target.value)}
                    placeholder="Buscar nesta conversa"
                    autoComplete="off"
                  />
                </div>
              ) : null}

              <div ref={chatRef} className="cliente-atendimento__messages">
                {loadingThread ? (
                  <p className="cliente-atendimento__empty">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando conversa…
                  </p>
                ) : filteredThreadItems.length === 0 ? (
                  <p className="cliente-atendimento__empty">
                    {threadSearch.trim() ? 'Nenhuma mensagem encontrada nesta busca.' : 'Ainda sem mensagens gravadas neste WhatsApp.'}
                  </p>
                ) : (
                  <ol>
                    {filteredThreadItems.map((item) =>
                      item.type === 'day' ? (
                        <li key={item.id} className="is-day">
                          {item.label}
                        </li>
                      ) : item.side === 'nota' ? (
                        <li key={item.id} className="atl-note-row">
                          <div className="atl-note">
                            <header>
                              <StickyNote className="h-3.5 w-3.5" aria-hidden />
                              <strong>Nota interna · {item.autor}</strong>
                              <time>{item.timeLabel}</time>
                              {item.autorId === userId || nivel === 'admin' ? (
                                <button type="button" onClick={() => handleDeleteNote(item.noteId)} aria-label="Apagar nota" title="Apagar nota">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              ) : null}
                            </header>
                            <p>{item.body}</p>
                          </div>
                        </li>
                      ) : (
                        <React.Fragment key={item.id}>
                          {startedByContact && item === firstBubble ? (
                            <li className="is-notice">
                              <span aria-hidden>🗨️ </span>
                              Conversa iniciada pelo contato
                              {item.timeLabel || auditTimeLabel(item.at) ? ` · ${item.timeLabel || auditTimeLabel(item.at)}` : ''}
                            </li>
                          ) : null}
                          <li className={item.side === 'equipe' ? 'is-out cliente-atendimento__bubble-row' : 'is-in cliente-atendimento__bubble-row'}>
                            <div className="cliente-atendimento__bubble">
                              <p>{item.body}</p>
                              <time>{item.timeLabel || auditTimeLabel(item.at)}</time>
                            </div>
                            {item.side === 'equipe' ? (
                              <span className="cliente-atendimento__bubble-avatar" aria-hidden title="Loja">
                                {attendantName.charAt(0).toUpperCase()}
                              </span>
                            ) : null}
                          </li>
                        </React.Fragment>
                      )
                    )}
                  </ol>
                )}
              </div>

              <footer className="cliente-atendimento__composer">
                <div className={`cliente-atendimento__composer-box${composerTab === 'notas' ? ' is-note-mode' : ''}`}>
                  {atalhoTermo !== null && atalhoMatches.length ? (
                    <AtalhoSugestoes respostas={base.respostas} termo={atalhoTermo} onPick={pickResposta} />
                  ) : null}
                  {popover === 'emoji' ? (
                    <EmojiPopover
                      onClose={() => setPopover(null)}
                      onPick={(emoji) => {
                        if (composerTab === 'notas') setNoteText((v) => `${v}${emoji}`);
                        else insertTextAtCursor(draftRef.current, draftText, emoji, setDraftText);
                      }}
                    />
                  ) : null}
                  {popover === 'respostas' ? (
                    <RespostasPopover
                      respostas={base.respostas}
                      onPick={pickResposta}
                      onClose={() => setPopover(null)}
                      onConfigure={permissoes.configurarRespostas ? () => navigate('/cliente/atendimento/config?aba=respostas') : null}
                    />
                  ) : null}
                  <div className="cliente-atendimento__composer-top">
                    <div className="cliente-atendimento__sign">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={signOn}
                        className={`cliente-atendimento__sign-switch${signOn ? ' is-on' : ''}`}
                        onClick={() => {
                          const next = !signOn;
                          setSignOn(next);
                          try {
                            window.localStorage.setItem(SIGN_KEY, next ? '1' : '0');
                          } catch {
                            /* sem storage */
                          }
                        }}
                        title={signOn ? `Assinando como *${attendantName}:*` : 'Assinar mensagens com seu nome'}
                        aria-label="Assinar mensagens"
                      />
                      <span className="cliente-atendimento__sign-name">{attendantName}</span>
                      <button
                        type="button"
                        className="cliente-atendimento__sign-edit"
                        onClick={() => showToast('O nome da assinatura vem do seu usuário da loja (Configurações → Atendentes).')}
                        title="Nome da assinatura"
                        aria-label="Nome da assinatura"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="cliente-atendimento__composer-pills" role="tablist">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={composerTab === 'mensagem'}
                        className={composerTab === 'mensagem' ? 'is-on' : undefined}
                        onClick={() => setComposerTab('mensagem')}
                      >
                        <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                        Mensagem
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={composerTab === 'notas'}
                        className={composerTab === 'notas' ? 'is-on' : undefined}
                        onClick={() => setComposerTab('notas')}
                      >
                        <FileText className="h-3.5 w-3.5" aria-hidden />
                        Notas
                      </button>
                    </div>
                  </div>
                  {recording ? (
                    <div className="atl-recording" role="status">
                      <span className="atl-recording__dot" aria-hidden />
                      Gravando {String(Math.floor(recordingSeconds / 60)).padStart(1, '0')}:
                      {String(recordingSeconds % 60).padStart(2, '0')}
                      <button type="button" className="atl-btn is-ghost is-sm" onClick={() => stopRecording(true)}>
                        Cancelar
                      </button>
                      <button type="button" className="atl-btn is-sm" onClick={() => stopRecording(false)}>
                        <Square className="h-3 w-3" /> Parar e enviar
                      </button>
                    </div>
                  ) : composerTab === 'mensagem' ? (
                    <div className="cliente-atendimento__composer-field is-send">
                      {iaTransferHint ? (
                        <p className="atl-ia-transfer" role="status">
                          {iaTransferHint}
                          {permissoes.configurarIA ? (
                            <button type="button" className="atl-link" onClick={actionPassarAtendente}>
                              Passar para atendente
                            </button>
                          ) : null}
                        </p>
                      ) : null}
                      <textarea
                        ref={draftRef}
                        value={draftText}
                        onChange={(e) => {
                          setDraftText(e.target.value);
                          if (sendError) setSendError('');
                        }}
                        onKeyDown={(e) => {
                          if ((e.key === 'Enter' || e.key === 'Tab') && atalhoTermo !== null && atalhoMatches.length) {
                            e.preventDefault();
                            pickResposta(atalhoMatches[0]);
                            return;
                          }
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendText();
                          }
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          const file = e.dataTransfer?.files?.[0];
                          if (file) {
                            e.preventDefault();
                            sendMediaFile(file);
                          }
                        }}
                        placeholder="Digite sua mensagem, / para respostas rápidas, ou arraste um arquivo..."
                        rows={3}
                        disabled={sending}
                        aria-label="Mensagem WhatsApp"
                      />
                      {sendError ? (
                        <p className="cliente-atendimento__send-error" role="alert">
                          {sendError}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="cliente-atendimento__composer-field is-note">
                      <textarea
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSaveNote();
                          }
                        }}
                        placeholder="Nota interna: fica gravada para a equipe da loja e não vai ao contato."
                        rows={3}
                        disabled={savingNote}
                        aria-label="Nota interna"
                      />
                    </div>
                  )}
                  <div className="cliente-atendimento__composer-tools">
                    <div className="cliente-atendimento__composer-tools-left">
                      <button type="button" onClick={() => fileRef.current?.click()} aria-label="Anexar arquivo" title="Anexar arquivo (até 4 MB)" disabled={sending || composerTab === 'notas'}>
                        <Paperclip className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => setPopover((p) => (p === 'emoji' ? null : 'emoji'))} aria-label="Emoji" title="Emoji">
                        <Smile className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPopover((p) => (p === 'respostas' ? null : 'respostas'))}
                        aria-label="Respostas rápidas"
                        title="Respostas rápidas (ou digite /)"
                        disabled={composerTab === 'notas'}
                      >
                        <Zap className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => galleryRef.current?.click()} aria-label="Imagem" title="Enviar imagem" disabled={sending || composerTab === 'notas'}>
                        <ImageIcon className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => stickerRef.current?.click()} aria-label="Figurinha" title="Enviar figurinha (WEBP/PNG)" disabled={sending || composerTab === 'notas'}>
                        <StickyNote className="h-4 w-4" />
                      </button>
                      {permissoes.usarIA && base.agentesAtivos > 0 ? (
                        <button
                          type="button"
                          className="atl-ia-btn"
                          onClick={handleSuggest}
                          disabled={suggesting || composerTab === 'notas'}
                          aria-label="Sugerir resposta com IA"
                          title="Sugerir resposta com o agente de IA da loja (não envia)"
                        >
                          {suggesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                          <span>Sugerir</span>
                        </button>
                      ) : null}
                      <input ref={fileRef} type="file" hidden accept={ATENDIMENTO_MEDIA_ACCEPT} onChange={(e) => onFilePicked(e)} />
                      <input ref={galleryRef} type="file" hidden accept="image/*" onChange={(e) => onFilePicked(e, 'image')} />
                      <input ref={stickerRef} type="file" hidden accept={STICKER_ACCEPT} onChange={(e) => onFilePicked(e, 'sticker')} />
                    </div>
                    <div className="cliente-atendimento__composer-tools-right">
                      {composerTab === 'mensagem' ? (
                        <>
                          <button
                            type="button"
                            className={`is-mic${recording ? ' is-recording' : ''}`}
                            onClick={() => (recording ? stopRecording(false) : startRecording())}
                            aria-label={recording ? 'Parar gravação' : 'Gravar áudio'}
                            title={recording ? 'Parar e enviar' : 'Gravar áudio'}
                            disabled={sending}
                          >
                            <Mic className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className="is-send"
                            onClick={handleSendText}
                            disabled={sending || !String(draftText || '').trim()}
                            aria-label="Enviar mensagem"
                            title="Enviar"
                          >
                            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="is-send is-note-send"
                          onClick={handleSaveNote}
                          disabled={savingNote || !String(noteText || '').trim()}
                          aria-label="Gravar nota"
                          title="Gravar nota interna"
                        >
                          {savingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <StickyNote className="h-4 w-4" />}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </footer>
            </>
          )}
        </section>

        {panelOpen && selected ? (
          <aside className="cliente-atendimento__panel" aria-label="Painel do contato">
            <header className="cliente-atendimento__panel-head">
              <div className="cliente-atendimento__panel-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={panelTab === 'contato'}
                  className={panelTab === 'contato' ? 'is-active' : undefined}
                  onClick={() => setPanelTab('contato')}
                >
                  Contato
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={panelTab === 'detalhes'}
                  className={panelTab === 'detalhes' ? 'is-active' : undefined}
                  onClick={() => setPanelTab('detalhes')}
                >
                  Detalhes
                </button>
              </div>
              <button type="button" className="cliente-atendimento__panel-close" onClick={() => setPanelOpen(false)} aria-label="Fechar painel">
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="cliente-atendimento__panel-body">
              <div className="cliente-atendimento__panel-hero">
                <span className="cliente-atendimento__avatar-wrap is-lg">
                  {selected.profile_pic_url ? (
                    <img className="cliente-atendimento__avatar" src={selected.profile_pic_url} alt="" />
                  ) : (
                    <span className="cliente-atendimento__avatar is-fallback" aria-hidden>
                      {(selected.name || '?').charAt(0).toUpperCase()}
                    </span>
                  )}
                  <WhatsAppSeal />
                </span>
                <h3>{selected.name}</h3>
              </div>

              {panelTab === 'contato' ? (
                <div className="cliente-atendimento__fields atl-fields">
                  <div>
                    <dt>
                      <Tag className="h-3.5 w-3.5" /> Etiquetas
                    </dt>
                    <dd className="atl-tag-picker">
                      {base.etiquetas.length === 0 ? (
                        <span className="atl-muted">
                          Nenhuma etiqueta cadastrada.
                          {permissoes.configurarEtiquetas ? (
                            <button type="button" className="atl-link" onClick={() => navigate('/cliente/atendimento/config?aba=etiquetas')}>
                              Criar etiquetas
                            </button>
                          ) : null}
                        </span>
                      ) : (
                        base.etiquetas.map((etiqueta) => {
                          const on = (selectedConversa?.etiqueta_ids || []).includes(etiqueta.id);
                          return (
                            <button
                              key={etiqueta.id}
                              type="button"
                              className={`atl-tag is-toggle${on ? ' is-on' : ''}`}
                              style={{ '--atl-tag': etiqueta.cor || '#64748b' }}
                              onClick={() => toggleEtiqueta(etiqueta.id)}
                              aria-pressed={on}
                            >
                              {on ? '✓ ' : ''}
                              {etiqueta.nome}
                            </button>
                          );
                        })
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Observações</dt>
                    <dd>
                      <textarea
                        className="atl-input"
                        rows={4}
                        value={obsDraft}
                        onChange={(e) => scheduleObservacao(e.target.value)}
                        placeholder="Observação do Mini CRM"
                      />
                      <small className="atl-muted">
                        {obsState === 'salvando' ? 'Gravando…' : obsState === 'salvo' ? 'Gravado no Mini CRM.' : 'Mesma observação do Mini CRM.'}
                      </small>
                    </dd>
                  </div>
                  <div>
                    <dt>
                      <Phone className="h-3.5 w-3.5" /> Telefone
                    </dt>
                    <dd>{selected.phoneLabel}</dd>
                  </div>
                  <div>
                    <dt>
                      <Mail className="h-3.5 w-3.5" /> E-mail
                    </dt>
                    <dd>
                      <input
                        className="atl-input"
                        type="email"
                        value={emailDraft}
                        onChange={(e) => setEmailDraft(e.target.value)}
                        onBlur={saveEmail}
                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                        placeholder="email@cliente.com"
                      />
                    </dd>
                  </div>
                  <div>
                    <dt>Canal</dt>
                    <dd>
                      <WhatsAppSeal className="is-inline" />
                      WhatsApp
                    </dd>
                  </div>
                </div>
              ) : (
                <dl className="cliente-atendimento__fields">
                  <div>
                    <dt>Status</dt>
                    <dd>
                      {BOXES.filter((b) => selected.caixas[b.key])
                        .map((b) => b.label)
                        .join(' e ') || 'Entrada'}
                      {selected.caixas.esperando && !selected.caixas.finalizados ? ' · aguardando resposta da loja' : ''}
                    </dd>
                  </div>
                  <div>
                    <dt>Canal</dt>
                    <dd>WhatsApp</dd>
                  </div>
                  <div>
                    <dt>Setor</dt>
                    <dd>{selectedSetor?.nome || 'Sem setor'}</dd>
                  </div>
                  <div>
                    <dt>Atendente</dt>
                    <dd>{assignedMembro ? assignedMembro.nome || assignedMembro.email : 'Ninguém'}</dd>
                  </div>
                  <div>
                    <dt>Quem vê</dt>
                    <dd>
                      {selectedConversa?.privado
                        ? 'Privada: só o atendente e o admin da loja'
                        : 'Admin, supervisores e atendentes do setor/atribuídos'}
                    </dd>
                  </div>
                  <div>
                    <dt>Etiquetas</dt>
                    <dd className="atl-tag-picker">
                      {(selectedConversa?.etiqueta_ids || []).length
                        ? selectedConversa.etiqueta_ids.map((id) => <EtiquetaChip key={id} etiqueta={etiquetasById.get(id)} />)
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>IA automática</dt>
                    <dd>
                      {selectedConversa?.ia_pausada
                        ? 'Pausada (humano assumiu)'
                        : selectedConversa?.ia_respondeu_em
                          ? 'Livre — a IA responde se o interruptor Responder sozinho estiver ligado'
                          : 'Livre (só responde se um agente estiver com automático ligado)'}
                      {selectedConversa?.ia_pausada && permissoes.configurarIA ? (
                        <button type="button" className="atl-link" onClick={() => patchConversa(selected, { ia_pausada: false }, 'IA liberada nesta conversa.')}>
                          Liberar IA
                        </button>
                      ) : null}
                    </dd>
                  </div>
                  <div>
                    <dt>Contato criado em</dt>
                    <dd>{formatFullDate(selected.first_seen_at)}</dd>
                  </div>
                  {selectedConversa?.finalizado_at ? (
                    <div>
                      <dt>Última finalização</dt>
                      <dd>
                        {formatFullDate(selectedConversa.finalizado_at)}
                        {selectedConversa.finalizado_by && membrosById.get(selectedConversa.finalizado_by)
                          ? ` · ${membrosById.get(selectedConversa.finalizado_by).nome || ''}`
                          : ''}
                      </dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Mensagens</dt>
                    <dd>
                      {thread.inboundCount || 0} recebidas · {thread.outboundCount || 0} enviadas · {notas.length} notas
                    </dd>
                  </div>
                  {nivel !== 'atendente' ? (
                    <div>
                      <dt>
                        <UserCheck className="h-3.5 w-3.5" /> Ações
                      </dt>
                      <dd>
                        <button type="button" className="atl-link" onClick={() => setTransferOpen(true)}>
                          Transferir / trocar setor
                        </button>
                      </dd>
                    </div>
                  ) : null}
                </dl>
              )}
            </div>
          </aside>
        ) : null}

        {transferOpen && selected ? (
          <TransferDialog
            conversa={selectedConversa}
            setores={base.setores}
            membros={base.membros}
            currentUserId={userId}
            saving={savingConversa}
            onCancel={() => setTransferOpen(false)}
            onConfirm={confirmTransfer}
          />
        ) : null}

        {toast ? (
          <div className="cliente-atendimento__toast" role="status">
            {toast}
          </div>
        ) : null}
      </div>
    </>
  );
}
