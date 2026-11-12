import React, { lazy, Suspense, useEffect, useState } from 'react';
import { CalendarDays, Search, User, X } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { displayDate, displayWeek } from '@/lib/trafficWeeklyReview';
import { loadRoutineLeads } from './gestorIaRoutineData';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const LeadFicha = lazy(() => import('@/components/crm/RastreamentoLeadFicha'));

export default function GestorIaRoutineLeads({ client, weekStart, selection, profile, modules, close }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [appointments, setAppointments] = useState(selection.appointmentsOnly);
  const [search, setSearch] = useState('');
  const [contact, setContact] = useState(null);
  const [page, setPage] = useState(1);
  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    const timeout = setTimeout(() => controller.abort(), 20000);
    setError('');
    loadRoutineLeads(supabase, { profile, modules, clientId: client.id, weekStart, rows: selection.rows, niche: client.nicho, signal: controller.signal })
      .then((data) => { if (current) setResult(data); })
      .catch((reason) => { if (current) setError(reason.message); })
      .finally(() => clearTimeout(timeout));
    return () => { current = false; controller.abort(); clearTimeout(timeout); };
  }, [client.id, client.nicho, weekStart, attempt, modules, profile, selection.rows]);
  const leads = result?.leads || [];
  const displayed = leads.filter((lead) => (!appointments || lead.routineScheduled) && (!search || `${lead.sender_name || ''} ${lead.phone || ''}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))));
  const pages = Math.max(1, Math.ceil(displayed.length / 30));
  const activePage = Math.min(page, pages);
  return <Dialog open onOpenChange={(open) => { if (!open && !contact) close(); }}><DialogContent className="gestor-ia gia-routine-leads-dialog" overlayClassName="bg-black/30">
    <header className="gia-drawer-heading"><div><p className="gia-eyebrow">{client.empresa} · {selection.rows.length} linha(s)</p><DialogTitle>Leads da semana</DialogTitle></div><button type="button" className="gia-icon-button" aria-label="Fechar leads da semana" onClick={close}><X aria-hidden="true" /></button></header>
    <div className="gia-stack">
    <DialogDescription className="gia-caption">Entrada de {displayWeek(weekStart)}. Agendamentos registrados depois também entram nesta coorte.</DialogDescription>
    <div className="gia-routine-tabs" aria-label="Filtrar leads"><button type="button" aria-pressed={!appointments} onClick={() => { setAppointments(false); setPage(1); }}>Todos {result && leads.length}</button><button type="button" aria-pressed={appointments} onClick={() => { setAppointments(true); setPage(1); }}><CalendarDays size={15} aria-hidden="true" />Agendaram {result && leads.filter((lead) => lead.routineScheduled).length}</button></div>
    <label className="gia-search"><Search aria-hidden="true" /><input aria-label="Buscar lead da semana" placeholder="Buscar nome ou telefone" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
    {error ? <div className="gia-notice" role="alert">{error} <button type="button" onClick={() => setAttempt((value) => value + 1)}>Tentar novamente</button></div> : !result ? <p role="status">Consultando os leads…</p> : <>
      {result.unresolvedRows > 0 && <p className="gia-notice" role="status">{result.unresolvedRows} linha(s) sem vínculo exato de conta, campanha e conjunto Meta. Escolha os nomes no catálogo salvo para vincular; linhas manuais ou de outras plataformas não entram nesta consulta.</p>}
      {result.unattributed > 0 && <p className="gia-caption">{result.unattributed} lead(s) Meta desta semana têm identificação incompleta no rastreamento. A contagem abaixo considera os vínculos confirmados.</p>}
      <div className="gia-routine-lead-list">{displayed.slice((activePage - 1) * 30, activePage * 30).map((lead) => <button type="button" key={lead.id} onClick={() => setContact(lead)} className="gia-routine-lead"><span className="gia-initials" aria-hidden="true"><User size={17} /></span><span><strong>{lead.mini_crm?.contato_nome || lead.sender_name || lead.phone || 'Lead sem nome'}</strong><small>{lead.phone || 'Telefone não informado'}</small></span><span className="gia-caption">{lead.routineScheduled ? lead.routineAppointment ? `Agendou · ${displayDate(lead.routineAppointment)}` : 'Agendou' : 'Sem agendamento registrado'}</span></button>)}</div>
      {!displayed.length && <div className="gia-empty"><p>Nenhum {appointments ? 'agendamento registrado' : 'lead vinculado'} para esta seleção.</p></div>}
      <div className="gia-routine-pagination"><span>{displayed.length} lead(s) · {activePage} de {pages}</span><button type="button" disabled={activePage <= 1} onClick={() => setPage(activePage - 1)}>Anterior</button><button type="button" disabled={activePage >= pages} onClick={() => setPage(activePage + 1)}>Próxima</button></div>
    </>}
    {contact && <Suspense fallback={<p role="status">Abrindo ficha…</p>}><LeadFicha open clienteId={client.id} contact={contact} onOpenChange={(open) => { if (!open) setContact(null); }} className="rt-lead-ficha--gestor" /></Suspense>}
    </div>
  </DialogContent></Dialog>;
}
