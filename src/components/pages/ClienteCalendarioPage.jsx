import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { CalendarDays, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import RastreamentoClienteSelect from '@/components/crm/RastreamentoClienteSelect';
import RastreamentoLeadFicha from '@/components/crm/RastreamentoLeadFicha';
import { isMetaAdsContactForStats } from '@/lib/contactFromWebhookPayload';
import { isSiteContactForStats } from '@/lib/rastreamentoTrackableLink';
import {
  appointmentDateColumns,
  appointmentDay,
  appointmentTime,
  appointmentStatusKeys,
  formatDayBr,
  presetForNicho,
  resolveMiniCrmSetup,
  statusLabel,
  nomeDoLead,
  telefoneDoLead,
} from '@/lib/miniCrm';
import './ClienteCalendarioPage.css';

const PAGE_SIZE = 1000;
const MAX_ROWS = 5000;
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const CONTACT_FIELDS = 'id, sender_name, phone, from_jid, origin_source, utm_source, utm_medium, utm_campaign, utm_content, utm_term, tracking_data, first_seen_at, mini_crm, profile_pic_url, qualificado, comprou, valor_venda';

function todayYmd() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function isUntracked(contact) {
  if (isMetaAdsContactForStats(contact) || isSiteContactForStats(contact)) return false;
  const source = String(contact?.origin_source || '');
  return !(source === 'google_ads' || (source && source !== 'nao_identificado' && source !== 'meta_ads'));
}

function monthTitle(year, month) {
  const text = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month, 1)));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function monthCells(year, month) {
  const first = new Date(Date.UTC(year, month, 1));
  const start = new Date(first);
  start.setUTCDate(1 - first.getUTCDay());
  const last = new Date(Date.UTC(year, month + 1, 0));
  const weeks = Math.ceil((first.getUTCDay() + last.getUTCDate()) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + i);
    return { ymd: day.toISOString().slice(0, 10), inMonth: day.getUTCMonth() === month, date: day.getUTCDate() };
  });
}

async function fetchMiniContacts(clienteId) {
  const rows = [];
  let from = 0;
  while (rows.length < MAX_ROWS) {
    const { data, error } = await supabase
      .from('cliente_whatsapp_contact')
      .select(CONTACT_FIELDS)
      .eq('cliente_id', clienteId)
      .not('mini_crm', 'is', null)
      .order('first_seen_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows.slice(0, MAX_ROWS);
}

export default function ClienteCalendarioPage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const isStoreUser = profile?.role === 'cliente' && profile?.cliente_id;
  const isTeamUser = ['superadmin', 'admin', 'colaborador'].includes(profile?.role);
  const clienteId = isStoreUser ? profile.cliente_id : (searchParams.get('cliente') || '');
  const [clientes, setClientes] = useState([]);
  const [empresa, setEmpresa] = useState('');
  const [loading, setLoading] = useState(false);
  const [leads, setLeads] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [dateLabel, setDateLabel] = useState('');
  const [fichaContact, setFichaContact] = useState(null);
  const today = todayYmd();
  const [cursor, setCursor] = useState(() => ({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 }));

  useEffect(() => {
    if (isStoreUser) return undefined;
    let cancelled = false;
    supabase
      .from('clientes')
      .select('id, empresa, nicho')
      .order('empresa')
      .then(({ data, error }) => {
        if (!cancelled && !error) setClientes(data || []);
      });
    return () => {
      cancelled = true;
    };
  }, [isStoreUser]);

  const load = useCallback(async () => {
    if (!clienteId) {
      setLeads([]);
      setEmpresa('');
      return;
    }
    setLoading(true);
    try {
      const { data: client, error: clientError } = await supabase
        .from('clientes')
        .select('empresa, nicho, mini_crm_show_untracked')
        .eq('id', clienteId)
        .maybeSingle();
      if (clientError) throw clientError;
      const { data: configRow, error: configError } = await supabase
        .from('mini_crm_config')
        .select('statuses, columns, sellers, cadence, updated_at')
        .eq('cliente_id', clienteId)
        .maybeSingle();
      if (configError) throw configError;
      const setup = resolveMiniCrmSetup(presetForNicho(client?.nicho || ''), configRow || null, []);
      const keys = new Set(appointmentStatusKeys(setup.statuses));
      const dateColumns = appointmentDateColumns(setup.columns);
      const canSeeUntracked = isTeamUser || Boolean(client?.mini_crm_show_untracked);
      const contacts = await fetchMiniContacts(clienteId);
      setEmpresa(client?.empresa || '');
      setStatuses(setup.statuses);
      setDateLabel(dateColumns.map((column) => column.label).join(' / '));
      setLeads(contacts
        .filter((contact) => keys.has(String(contact.mini_crm?.status || '')))
        .filter((contact) => canSeeUntracked || !isUntracked(contact))
        .map((contact) => ({
          contact,
          nome: nomeDoLead(contact) || telefoneDoLead(contact) || 'Sem nome',
          telefone: telefoneDoLead(contact),
          status: contact.mini_crm.status,
          day: appointmentDay(contact.mini_crm, setup.columns),
          time: appointmentTime(contact.mini_crm, setup.columns),
        })));
    } catch (error) {
      toast({ variant: 'destructive', title: 'Não carregou o calendário', description: error?.message || 'Tente de novo.' });
    } finally {
      setLoading(false);
    }
  }, [clienteId, isTeamUser, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const byDay = useMemo(() => {
    const map = new Map();
    leads.forEach((lead) => {
      if (!lead.day) return;
      if (!map.has(lead.day)) map.set(lead.day, []);
      map.get(lead.day).push(lead);
    });
    map.forEach((list) => list.sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99') || a.nome.localeCompare(b.nome, 'pt-BR')));
    return map;
  }, [leads]);

  const undated = useMemo(() => leads.filter((lead) => !lead.day), [leads]);
  const cells = useMemo(() => monthCells(cursor.year, cursor.month), [cursor]);
  const boardRef = useRef(null);

  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return undefined;
    const fit = () => {
      if (!window.matchMedia('(min-width: 768px)').matches) {
        board.style.height = '';
        return;
      }
      const scroller = board.closest('.planeje-workspace-main');
      const top = board.getBoundingClientRect().top + (scroller?.scrollTop || 0);
      const viewport = window.visualViewport?.height || window.innerHeight;
      let bottom = viewport;
      if (scroller) {
        const style = getComputedStyle(scroller);
        bottom = Math.min(
          viewport,
          scroller.getBoundingClientRect().top + scroller.clientHeight - parseFloat(style.paddingBottom || 0),
        );
      }
      board.style.height = `${Math.max(360, Math.floor(bottom - top - 16))}px`;
      if (scroller) scroller.scrollTop = 0;
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [clienteId, clientes.length, undated.length, cells.length]);
  const monthPrefix = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}`;
  const monthCount = useMemo(
    () => leads.filter((lead) => lead.day.startsWith(monthPrefix)).length,
    [leads, monthPrefix],
  );

  const shift = (delta) => setCursor(({ year, month }) => {
    const next = new Date(Date.UTC(year, month + delta, 1));
    return { year: next.getUTCFullYear(), month: next.getUTCMonth() };
  });

  const leadButton = (lead) => (
    <button
      key={lead.contact.id}
      type="button"
      className="cal-lead"
      data-status={lead.status}
      style={{ '--cal-status': statuses.find((status) => status.key === lead.status)?.color || '#7c3aed' }}
      title={`${lead.nome} · ${statusLabel(statuses, lead.status)}${lead.day ? ` · ${formatDayBr(lead.day)}` : ''}`}
      onClick={() => setFichaContact(lead.contact)}
    >
      {lead.time ? `${lead.time} · ` : ''}{lead.nome}
    </button>
  );

  return (
    <div className="cal-page">
      <Helmet>
        <title>Calendário{empresa ? ` · ${empresa}` : ''}</title>
      </Helmet>
      <header className="cal-top">
        {!isStoreUser && clientes.length > 0 && (
          <RastreamentoClienteSelect
            clientes={clientes}
            value={clienteId}
            onChange={(id) => {
              const next = new URLSearchParams(searchParams);
              next.set('cliente', id);
              setSearchParams(next);
            }}
          />
        )}
        <div className="cal-head">
          <div className="cal-title">
            <CalendarDays className="h-5 w-5" />
            <div>
              <h1>Calendário</h1>
              <p>
                Leads agendados pela {dateLabel || 'data do agendamento'}
                {monthCount ? ` · ${monthCount} no mês` : ''}
              </p>
            </div>
          </div>
          <div className="cal-nav">
            <button type="button" aria-label="Mês anterior" onClick={() => shift(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <strong>{monthTitle(cursor.year, cursor.month)}</strong>
            <button type="button" aria-label="Próximo mês" onClick={() => shift(1)}>
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="cal-today"
              onClick={() => setCursor({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 })}
            >
              Hoje
            </button>
          </div>
        </div>
      </header>

      {!clienteId ? (
        <p className="cal-empty">Escolha um cliente para ver os agendados.</p>
      ) : (
        <section ref={boardRef} className="cal-board" aria-busy={loading}>
          {loading && (
            <div className="cal-loading">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
          <div className="cal-grid cal-weekdays">
            {WEEKDAYS.map((name) => <span key={name}>{name}</span>)}
          </div>
          <div className="cal-grid cal-days" style={{ '--cal-weeks': cells.length / 7 }}>
            {cells.map((cell) => {
              const list = byDay.get(cell.ymd) || [];
              return (
                <div
                  key={cell.ymd}
                  className={`cal-day${cell.inMonth ? '' : ' is-out'}${cell.ymd === today ? ' is-today' : ''}`}
                  data-day={cell.ymd}
                  title={formatDayBr(cell.ymd)}
                >
                  <span className="cal-day-number">{cell.date}</span>
                  <div className="cal-day-leads">{list.map(leadButton)}</div>
                </div>
              );
            })}
          </div>
          {undated.length > 0 && (
            <div className="cal-undated">
              <span>Sem data ({undated.length}):</span>
              {undated.map(leadButton)}
            </div>
          )}
        </section>
      )}

      <RastreamentoLeadFicha
        open={Boolean(fichaContact)}
        onOpenChange={(open) => {
          if (!open) setFichaContact(null);
        }}
        clienteId={clienteId}
        contact={fichaContact}
        onComercialSaved={() => void load()}
      />
    </div>
  );
}
