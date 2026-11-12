import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ContatosMessagePeriodPicker from '@/components/crm/ContatosMessagePeriodPicker';
import RastreamentoLeadFicha from '@/components/crm/RastreamentoLeadFicha';
import RastreamentoGoogleEventHistory, { GoogleEventStatus } from '@/components/crm/RastreamentoGoogleEventHistory';
import { RastreamentoSectionTitle } from '@/components/crm/RastreamentoUi';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { contactDisplayName } from '@/lib/leadIdentity';
import { canRetryGoogleEvento, googleDeliveryState, googleEventLabel, googleEventMetadata, groupGoogleEventos, summarizeGoogleEventos } from '@/lib/rastreamentoEventosGoogle';
import { defaultEventosPeriod, displayEventosPhone, formatEventosDateBr, formatEventosWhen, paginateEventosRows, periodUtcBounds } from '@/lib/rastreamentoEventosMeta';

const METRICS = [
  { state: 'sent', label: 'Enviados', icon: CheckCircle2, tone: 'sent' },
  { state: 'pending', label: 'Em processamento', icon: RefreshCw, tone: 'started' },
  { state: 'blocked', label: 'Bloqueados', icon: ShieldAlert, tone: 'blocked' },
  { state: 'failed', label: 'Falhas', icon: AlertTriangle, tone: 'failed' },
];

async function readIdentities(table, fields, ids, clienteId) {
  const rows = [];
  let failed = false;
  for (let offset = 0; offset < ids.length; offset += 100) {
    try {
      const { data, error } = await supabase.from(table).select(fields).eq('cliente_id', clienteId).in('id', ids.slice(offset, offset + 100));
      if (error) throw error;
      rows.push(...(data || []));
    } catch {
      failed = true;
    }
  }
  return { byId: new Map(rows.map(row => [row.id, row])), failed };
}

function EventContact({ group, onOpen }) {
  return <div className="eventos-context">
    {group.contact || group.lead ? <button type="button" className="eventos-lead-open" onClick={() => onOpen(group)}>{group.leadName}</button> : <strong>{group.leadName}</strong>}
    <small>{group.phoneDisplay}</small>
    {group.campaign ? <small className="eventos-context__ad" title={group.campaign}>{group.campaign}</small> : null}
  </div>;
}

function EventWhen({ group }) {
  return <div className="eventos-context">
    <strong>{formatEventosWhen(group.firstAt)}</strong>
    <small>{group.attempts.length} tentativa{group.attempts.length === 1 ? '' : 's'}</small>
    {group.attempts.length > 1 ? <small>Última tentativa: {formatEventosWhen(group.lastAt)}</small> : null}
  </div>;
}

function EventResult({ group }) {
  const row = group.current;
  const state = googleDeliveryState(row);
  const nextCheck = googleEventMetadata(row)?.nextCheckAt;
  return <div className="eventos-delivery">
    <div className="eventos-event"><strong>{googleEventLabel(group.eventName)}</strong><GoogleEventStatus row={row} /></div>
    <small className="text-muted-foreground">{state === 'sent' ? (googleEventMetadata(row) ? 'Processamento confirmado. Atribuição no Google Ads.' : 'Envio registrado pela integração anterior.') : state === 'pending' ? 'Aguardando o resultado do Google.' : state === 'blocked' ? 'Revise a configuração antes de tentar novamente.' : state === 'uncertain' ? 'Sem confirmação. Consulte o histórico antes de tentar novamente.' : 'Envio não concluído. Consulte o histórico.'}</small>
    {state === 'pending' && nextCheck && Date.now() < Date.parse(nextCheck) ? <small className="text-muted-foreground">Consulta liberada em {formatEventosWhen(nextCheck)}.</small> : null}
  </div>;
}

export default function RastreamentoEventosGoogle({ clienteId, since: sinceProp, until: untilProp, onPeriodChange }) {
  const { toast } = useToast();
  const [snapshot, setSnapshot] = useState({ clienteId: null, rows: [] });
  const currentClient = useRef(clienteId);
  currentClient.current = clienteId;
  const requestVersion = useRef(0);
  const actionInFlight = useRef(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [status, setStatus] = useState('');
  const [eventName, setEventName] = useState('');
  const [page, setPage] = useState(1);
  const [inspect, setInspect] = useState(null);
  const [leadFicha, setLeadFicha] = useState(null);
  const [localPeriod, setLocalPeriod] = useState(() => sinceProp && untilProp ? { since: sinceProp, until: untilProp } : defaultEventosPeriod());
  useEffect(() => { if (sinceProp && untilProp) setLocalPeriod({ since: sinceProp, until: untilProp }); }, [sinceProp, untilProp]);
  const { since: appliedSince, until: appliedUntil } = localPeriod;

  const load = useCallback(async () => {
    if (!clienteId || currentClient.current !== clienteId) return;
    const version = ++requestVersion.current;
    setLoading(true);
    setLoadError(null);
    try {
      const bounds = periodUtcBounds(appliedSince, appliedUntil);
      let query = supabase.from('google_conversion_event_log')
        .select('id, cliente_id, contact_id, lead_id, gclid, event_name, conversion_action, customer_id, success, error_message, created_at, google_response')
        .eq('cliente_id', clienteId).order('created_at', { ascending: false }).limit(501);
      if (bounds?.from && bounds?.to) query = query.gte('created_at', bounds.from).lte('created_at', bounds.to);
      const { data, error } = await query;
      if (error) throw error;
      if (version !== requestVersion.current || currentClient.current !== clienteId) return;
      // shortcut: até 500 tentativas por período; usar paginação no servidor se o recorte exceder esse volume.
      const rows = (data || []).slice(0, 500);
      const ids = (field) => [...new Set(rows.map(row => row[field]).filter(Boolean))];
      const [contacts, leads] = await Promise.all([
        readIdentities('cliente_whatsapp_contact', 'id, sender_name, mini_crm, phone, tracking_data, utm_campaign, utm_medium, utm_content, first_seen_at, origin_source, profile_pic_url', ids('contact_id'), clienteId),
        readIdentities('leads', 'id, nome, whatsapp, tracking_data, utm_campaign, utm_medium, utm_content', ids('lead_id'), clienteId),
      ]);
      if (version !== requestVersion.current || currentClient.current !== clienteId) return;
      setSnapshot({ clienteId, since: appliedSince, until: appliedUntil, rows, contacts: contacts.byId, leads: leads.byId, identityError: contacts.failed || leads.failed, truncated: data?.length > 500 });
    } catch (err) {
      if (version === requestVersion.current && currentClient.current === clienteId) setLoadError({ clienteId, message: err.message || 'Tente atualizar novamente.' });
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [clienteId, appliedSince, appliedUntil]);

  const latestLoad = useRef(load);
  latestLoad.current = load;

  useEffect(() => {
    currentClient.current = clienteId;
    load();
    return () => { requestVersion.current += 1; currentClient.current = null; };
  }, [load, clienteId]);
  useEffect(() => { setPage(1); }, [status, eventName, clienteId, appliedSince, appliedUntil]);

  const activeSnapshot = snapshot.clienteId === clienteId && snapshot.since === appliedSince && snapshot.until === appliedUntil;
  const groups = useMemo(() => {
    if (!activeSnapshot) return [];
    return groupGoogleEventos(snapshot.rows).map(group => {
      const contact = group.identityConflict ? null : snapshot.contacts?.get(group.contactId);
      const lead = group.identityConflict ? null : snapshot.leads?.get(group.leadId);
      return { ...group, contact, lead,
        leadName: group.identityConflict ? 'Contato com identificação divergente' : contactDisplayName(contact) || lead?.nome || 'Contato indisponível',
        phoneDisplay: displayEventosPhone(contact?.phone || lead?.whatsapp),
        campaign: contact?.utm_campaign || lead?.utm_campaign || '',
      };
    });
  }, [snapshot, activeSnapshot]);
  const summary = useMemo(() => summarizeGoogleEventos(groups.map(group => group.current)), [groups]);
  const filtered = useMemo(() => groups.filter(group => (!eventName || group.eventName === eventName) && (!status || googleDeliveryState(group.current) === status || (status === 'failed' && googleDeliveryState(group.current) === 'uncertain'))), [groups, status, eventName]);
  const pagination = useMemo(() => paginateEventosRows(filtered, page), [filtered, page]);
  const inspected = inspect?.clienteId === clienteId ? groups.find(group => group.key === inspect.key) : null;
  const ficha = leadFicha?.clienteId === clienteId ? leadFicha.group : null;

  const applyPeriod = ({ from, to }) => {
    if (!from || !to) return;
    setLocalPeriod({ since: from, until: to });
    onPeriodChange?.({ since: from, until: to });
  };
  const openLead = group => setLeadFicha({ clienteId, group });
  const sendAction = async (row, action) => {
    if (!clienteId || !row?.id || actionInFlight.current || currentClient.current !== clienteId) return;
    if (action === 'retry-click-conversion' && !canRetryGoogleEvento(row)) return;
    const meta = googleEventMetadata(row);
    if (action === 'get-conversion-status' && (meta?.phase !== 'processing' || Date.now() < Date.parse(meta.nextCheckAt || ''))) return;
    const version = requestVersion.current;
    actionInFlight.current = true;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('google-ads-api', { body: { action, clienteId, eventId: row.id } });
      if (currentClient.current !== clienteId) return;
      if (requestVersion.current !== version) {
        await latestLoad.current();
        return;
      }
      if (error) throw error;
      if (data?.error && !data?.success) {
        toast({ variant: 'destructive', title: action === 'get-conversion-status' ? 'Consulta não concluída' : 'Reenvio falhou', description: data.error?.message || 'Erro Google Ads' });
      } else if (data?.success) {
        toast({ title: 'Processamento Google confirmado', description: 'A atribuição na campanha deve ser conferida no Google Ads.' });
      } else if (data?.pending) {
        toast({ title: 'Google: em processamento', description: 'Aguarde a próxima consulta. Não é necessário reenviar.' });
      }
      await latestLoad.current();
    } catch (err) {
      if (currentClient.current === clienteId) {
        if (requestVersion.current === version) toast({ variant: 'destructive', title: 'Não foi possível concluir a ação', description: err.message });
        await latestLoad.current();
      }
    } finally {
      actionInFlight.current = false;
      setBusy(false);
    }
  };
  const renderActions = group => {
    const row = group.current;
    const meta = googleEventMetadata(row);
    return <div className="eventos-row-actions">
      <Button type="button" variant="ghost" size="sm" onClick={() => setInspect({ clienteId, key: group.key })}>{group.attempts.length > 1 ? `Histórico (${group.attempts.length})` : 'Detalhes'}</Button>
      {group.contact || group.lead ? <Button type="button" variant="ghost" size="sm" onClick={() => openLead(group)}>Ver lead</Button> : null}
      {!row.success && meta?.phase === 'processing' ? <Button type="button" variant="outline" size="sm" disabled={busy || loading || loadError?.clienteId === clienteId || Date.now() < Date.parse(meta.nextCheckAt || '')} onClick={() => sendAction(row, 'get-conversion-status')}>Consultar processamento</Button> : null}
      {canRetryGoogleEvento(row) ? <Button type="button" variant="outline" size="sm" disabled={busy || loading || loadError?.clienteId === clienteId} onClick={() => sendAction(row, 'retry-click-conversion')}>Tentar novamente</Button> : null}
    </div>;
  };
  if (!clienteId) return <section className="eventos-board eventos-empty">Selecione um cliente no topo.</section>;

  return <div className="eventos-page google-eventos">
    <section className="eventos-board">
      <header className="eventos-board__head">
        <div>
          <RastreamentoSectionTitle as="h2" title="Fluxo para o Google" help="Uma linha por conversão. Os números consideram o resultado atual das tentativas carregadas no período. Histórico mantém os erros anteriores. Em processamento significa recebimento pelo Google; a atribuição é conferida no Google Ads." />
          <p className="eventos-board__period-label">{groups.length} eventos · {activeSnapshot ? snapshot.rows.length : 0} tentativas · {formatEventosDateBr(appliedSince)} a {formatEventosDateBr(appliedUntil)}</p>
        </div>
        <div className="eventos-board__period">
          <ContatosMessagePeriodPicker compact fromIso={appliedSince} toIso={appliedUntil} onChangePeriod={applyPeriod} />
          <Button type="button" variant="outline" size="sm" onClick={load} disabled={loading} aria-label="Atualizar eventos Google">{loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}<span className="ml-1.5">Atualizar</span></Button>
        </div>
      </header>
      <div className="eventos-metrics">
        {METRICS.map(({ state, label, icon: Icon, tone }) => <button key={state} type="button" className={`eventos-metric eventos-metric--${tone} ${status === state ? 'is-active' : ''}`} aria-pressed={status === state} onClick={() => setStatus(value => value === state ? '' : state)}><Icon className="h-4 w-4 shrink-0" /><strong>{summary[state]}</strong><span>{label}</span></button>)}
      </div>
    </section>
    <section className="eventos-board eventos-board--list" aria-busy={loading}>
      <header className="eventos-board__head">
        <div><h3>Eventos e tentativas</h3><p className="eventos-board__period-label">O resultado atual fica na lista. Reenvios anteriores ficam no histórico.</p></div>
        <div className="eventos-board__filters">
          <label>Evento<select value={eventName} onChange={event => setEventName(event.target.value)}><option value="">Todos</option>{['LeadSubmitted', 'QualifiedLead', 'Purchase'].map(name => <option key={name} value={name}>{googleEventLabel(name)}</option>)}</select></label>
          <label>Estado<select value={status} onChange={event => setStatus(event.target.value)}><option value="">Todos</option>{METRICS.map(item => <option key={item.state} value={item.state}>{item.label}</option>)}</select></label>
          {status || eventName ? <Button type="button" variant="ghost" size="sm" onClick={() => { setStatus(''); setEventName(''); }}>Limpar filtros</Button> : null}
        </div>
      </header>
      {loadError?.clienteId === clienteId ? <p role="alert" className="text-sm text-destructive">Não foi possível atualizar os eventos. {loadError.message} {groups.length ? 'A lista mantém a última consulta.' : ''}</p> : null}
      {activeSnapshot && snapshot.identityError ? <p role="alert" className="text-sm text-amber-800">Não foi possível carregar os dados de alguns contatos. Os eventos continuam disponíveis; tente atualizar.</p> : null}
      {activeSnapshot && snapshot.truncated ? <p role="status" className="text-sm text-muted-foreground">Exibindo as 500 tentativas mais recentes do período. O histórico e os totais podem estar incompletos. Reduza o período.</p> : null}
      <div className="eventos-table-wrap">
        <table className="eventos-table">
          <thead><tr><th>Evento</th><th>Contato</th><th>Quando</th><th>Ações</th></tr></thead>
          <tbody>{pagination.items.length ? pagination.items.map(group => <tr key={group.key}>
            <td><EventResult group={group} /></td><td><EventContact group={group} onOpen={openLead} /></td><td><EventWhen group={group} /></td><td>{renderActions(group)}</td>
          </tr>) : <tr><td colSpan={4} className="eventos-empty">{loading ? 'Carregando eventos…' : loadError?.clienteId === clienteId ? 'Atualize para consultar os eventos.' : 'Nenhum evento encontrado neste período e filtros.'}</td></tr>}</tbody>
        </table>
      </div>
      <div className="eventos-mobile">
        {pagination.items.map(group => <article key={group.key} className="eventos-mobile-card"><EventResult group={group} /><EventContact group={group} onOpen={openLead} /><EventWhen group={group} />{renderActions(group)}</article>)}
        {!pagination.items.length ? <p className="eventos-empty">{loading ? 'Carregando eventos…' : loadError?.clienteId === clienteId ? 'Atualize para consultar os eventos.' : 'Nenhum evento encontrado neste período e filtros.'}</p> : null}
      </div>
      <nav className="eventos-pagination" aria-label="Páginas de eventos Google">
        <span>Página {pagination.page} de {pagination.totalPages} · {pagination.totalItems} eventos</span>
        <div><Button type="button" variant="ghost" size="sm" disabled={pagination.page <= 1} onClick={() => setPage(pagination.page - 1)}>Anterior</Button><Button type="button" variant="ghost" size="sm" disabled={pagination.page >= pagination.totalPages} onClick={() => setPage(pagination.page + 1)}>Próxima</Button></div>
      </nav>
    </section>
    <RastreamentoGoogleEventHistory group={inspected} onClose={() => setInspect(null)} />
    <RastreamentoLeadFicha open={Boolean(ficha)} onOpenChange={(open) => !open && setLeadFicha(null)} clienteId={clienteId} contact={ficha?.contact || null} lead={ficha?.lead || null} event={ficha?.current || null} />
  </div>;
}
