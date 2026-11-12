import React, { lazy, Suspense, useEffect, useState } from 'react';
import { CalendarDays, Search, User, X } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { currency, displayDate, displayWeek, saoPauloDate } from '@/lib/trafficWeeklyReview';
import { loadRoutineLeadContact, loadRoutineLeads } from './gestorIaRoutineData';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const localDate = (value) => Number.isFinite(Date.parse(value)) ? displayDate(saoPauloDate(new Date(value))) : '—';
const LeadFicha = lazy(() => import('@/components/crm/RastreamentoLeadFicha'));

export default function GestorIaRoutineLeads({ client, weekStart, selection, profile, modules, close }) {
  const [result, setResult] = useState(null);
  const [mode, setMode] = useState('entrada');
  const [cohort, setCohort] = useState('all');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [appointments, setAppointments] = useState(selection.appointmentsOnly);
  const [search, setSearch] = useState('');
  const [contact, setContact] = useState(null);
  const [opening, setOpening] = useState(null);
  const [contactError, setContactError] = useState('');
  const [group, setGroup] = useState('matched');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    const timeout = setTimeout(() => controller.abort(), 20000);
    setError(''); setResult(null);
    loadRoutineLeads(supabase, { profile, modules, clientId: client.id, weekStart, rows: selection.rows, allRows: selection.allRows || selection.rows, mode, niche: client.nicho, signal: controller.signal })
      .then((data) => { if (current) setResult(data); })
      .catch((reason) => { if (current) setError(reason.message); })
      .finally(() => clearTimeout(timeout));
    return () => { current = false; controller.abort(); clearTimeout(timeout); };
  }, [client.id, client.nicho, weekStart, attempt, modules, profile, selection.rows, selection.allRows, mode]);
  useEffect(() => {
    if (!opening) return undefined;
    const controller = new AbortController();
    let current = true;
    const timeout = setTimeout(() => controller.abort(), 20000);
    setContact(null); setContactError('');
    loadRoutineLeadContact(supabase, { profile, modules, clientId: client.id, contactId: opening, signal: controller.signal })
      .then((data) => { if (current) setContact(data); })
      .catch((reason) => { if (current) { setContactError(reason.message); setOpening(null); } })
      .finally(() => clearTimeout(timeout));
    return () => { current = false; controller.abort(); clearTimeout(timeout); };
  }, [opening, client.id, modules, profile]);
  const leads = (group === 'matched' ? result?.leads : result?.unmatchedLeads) || [];
  const summary = result?.summary;
  const counts = summary;
  const displayed = leads.filter((lead) => (cohort === 'all' || lead.routineCohort === cohort) && (!appointments || lead.routineScheduled) && (!search || `${lead.sender_name || ''} ${lead.phone || ''}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))));
  const pages = Math.max(1, Math.ceil(displayed.length / 30));
  const activePage = Math.min(page, pages);
  return <Dialog open onOpenChange={(open) => { if (!open && !contact) close(); }}><DialogContent className="gestor-ia gia-routine-leads-dialog" overlayClassName="bg-black/30">
    <header className="gia-drawer-heading"><div><p className="gia-eyebrow">{client.empresa} · {selection.rows.length} linha(s)</p><DialogTitle>Leads da semana</DialogTitle></div><button type="button" className="gia-icon-button" aria-label="Fechar leads da semana" onClick={close}><X aria-hidden="true" /></button></header>
    <div className="gia-stack">
    <div className="gia-routine-tabs" aria-label="Período dos leads">{[['entrada', 'Leads novos da semana'], ['agendados_na_semana', 'Agendados na semana']].map(([key, label]) => <button type="button" key={key} aria-pressed={mode === key} onClick={() => { if (mode === key) return; setResult(null); setMode(key); setCohort('all'); setPage(1); }}>{label}</button>)}</div>
    <DialogDescription className="gia-caption">{mode === 'entrada' ? `Entrada de ${displayWeek(weekStart)}. Agendamentos registrados depois também entram nesta coorte.` : `Marcações registradas de ${displayWeek(weekStart)}, no horário de Brasília. Inclui leads que entraram antes desta semana.`}</DialogDescription>
    {summary && <div className="gia-routine-lead-summary" aria-label="Resumo dos leads"><span>Total<strong>{summary.total}</strong></span><span>Novos<strong>{summary.novos}</strong></span><span>Antigos<strong>{summary.antigos}</strong></span><span>CPA · novos<strong>{currency(summary.atribuidos.cpa)}</strong></span></div>}
    {summary && <p className="gia-caption">CPA: {summary.atribuidos.cpaNovos} novo(s) agendado(s) nas linhas Meta com gasto informado. Antigos e origens fora da revisão ficam separados.</p>}
    {mode === 'agendados_na_semana' && counts && <div className="gia-routine-tabs" aria-label="Coorte dos agendamentos">{[['all', 'Todos', counts.total], ['novo', 'Novos', counts.novos], ['antigo', 'Antigos', counts.antigos]].map(([key, label, count]) => <button type="button" key={key} aria-pressed={cohort === key} onClick={() => { setCohort(key); setPage(1); }}>{label} {count}</button>)}</div>}
    <div className="gia-routine-tabs" aria-label="Vínculo dos leads"><button type="button" aria-pressed={group === 'matched'} onClick={() => { setGroup('matched'); setPage(1); }}>Vinculados {result?.leads.length ?? '—'}</button><button type="button" aria-pressed={group === 'unmatched'} onClick={() => { setGroup('unmatched'); setPage(1); }}>Sem vínculo Meta {result?.unmatchedLeads.length ?? '—'}</button></div>
    <div className="gia-routine-tabs" aria-label="Filtrar leads"><button type="button" aria-pressed={!appointments} onClick={() => { setAppointments(false); setPage(1); }}>Todos {result && leads.length}</button><button type="button" aria-pressed={appointments} onClick={() => { setAppointments(true); setPage(1); }}><CalendarDays size={15} aria-hidden="true" />Agendaram {result && leads.filter((lead) => lead.routineScheduled).length}</button></div>
    <label className="gia-search"><Search aria-hidden="true" /><input aria-label="Buscar lead da semana" placeholder="Nome ou últimos 4 dígitos" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
    {error ? <div className="gia-notice" role="alert">{error} <button type="button" onClick={() => setAttempt((value) => value + 1)}>Tentar novamente</button></div> : !result ? <p role="status">Consultando os leads…</p> : <>
      {result.unresolvedRows > 0 && <p className="gia-notice" role="status">{result.unresolvedRows} linha(s) sem identificação Meta utilizável. Leads manuais, Google e sem identificação aparecem em Sem vínculo Meta.</p>}
      {result.unattributed > 0 && <p className="gia-caption">{result.unattributed} lead(s) Meta têm identificação incompleta ou ambígua no rastreamento. A contagem abaixo considera os vínculos confirmados.</p>}
      <div className="gia-routine-lead-list">{displayed.slice((activePage - 1) * 30, activePage * 30).map((lead) => <button type="button" key={lead.id} onClick={() => setOpening(lead.id)} className="gia-routine-lead"><span className="gia-initials" aria-hidden="true"><User size={17} /></span><span><strong>{lead.sender_name || 'Lead sem nome'}</strong><small>{lead.phone}</small>{lead.routineMatchMethod && <small>{lead.routineOrigin.campaign_name || 'Campanha identificada'} · {lead.routineOrigin.adset_name || 'Conjunto identificado'} <span className="gia-routine-match">{lead.routineMatchMethod === 'name' ? 'por nome' : lead.routineMatchMethod === 'link' ? 'pelo link' : 'por ID'}</span></small>}{mode === 'agendados_na_semana' && <small>{lead.routineCohort === 'antigo' ? 'Lead antigo' : 'Lead novo'} · Entrada: {localDate(lead.first_seen_at)}</small>}{group === 'unmatched' && <small>{lead.routineMatchReason}</small>}</span><span className={lead.routineCrmOutdated ? 'gia-routine-crm-alert' : 'gia-caption'}>{mode === 'agendados_na_semana' ? <><strong>Agendou na semana</strong><small>{localDate(lead.routineScheduledAt)} · {lead.routineScheduleSource === 'manual' ? 'Marcação manual' : 'Conversa'}</small></> : lead.routineCrmOutdated ? <><strong>CRM desatualizado</strong><small>Agendado pela conversa, sem tag no CRM · {displayDate(lead.routineAppointment)}</small></> : lead.routineScheduled ? lead.routineAppointment ? `Agendou · ${displayDate(lead.routineAppointment)}` : 'Agendou' : 'Sem agendamento registrado'}</span></button>)}</div>
      {result.originRows.length > 0 && <section className="gia-routine-historical" aria-label="Origens fora da revisão"><h3>Origens fora da revisão</h3>{result.originRows.map((row) => <div key={`${row.account_id}:${row.campaign_id}:${row.adset_id}`}><strong>{row.campaign_name || row.campaign_id} · {row.adset_name || row.adset_id}</strong><span>{row.status === 'campanha_encerrada' ? 'Campanha encerrada' : 'Fora da revisão'} · {currency(0)} · {row.agendamentosNovos} novo(s) · {row.agendamentosAntigos} antigo(s)</span></div>)}</section>}
      {!displayed.length && <div className="gia-empty"><p>Nenhum {appointments ? 'agendamento registrado' : 'lead vinculado'} para esta seleção.</p></div>}
      <div className="gia-routine-pagination"><span>{displayed.length} lead(s) · {activePage} de {pages}</span><button type="button" disabled={activePage <= 1} onClick={() => setPage(activePage - 1)}>Anterior</button><button type="button" disabled={activePage >= pages} onClick={() => setPage(activePage + 1)}>Próxima</button></div>
    </>}
    {contactError && <p role="alert" className="gia-notice">{contactError}</p>}
    {opening && !contact && <p role="status">Abrindo ficha…</p>}
    {contact && <Suspense fallback={<p role="status">Abrindo ficha…</p>}><LeadFicha open clienteId={client.id} contact={contact} onOpenChange={(open) => { if (!open) { setOpening(null); setContact(null); } }} className="rt-lead-ficha--gestor" /></Suspense>}
    </div>
  </DialogContent></Dialog>;
}
