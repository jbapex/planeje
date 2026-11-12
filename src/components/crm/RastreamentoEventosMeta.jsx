import { contactDisplayName } from '@/lib/leadIdentity';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Eye,
  Loader2,
  MessageCircle,
  RefreshCw,
  ShieldAlert,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import ContatosMessagePeriodPicker from '@/components/crm/ContatosMessagePeriodPicker';
import { RastreamentoSectionTitle } from '@/components/crm/RastreamentoUi';
import { rastreamentoTabHelp } from '@/lib/rastreamentoHub';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { sendMetaConversionForComercialChange } from '@/lib/metaConversions';
import RastreamentoLeadFicha from '@/components/crm/RastreamentoLeadFicha';
import {
  EVENTOS_EVENT_FILTERS,
  EVENTOS_SOURCE_FILTERS,
  EVENTOS_STATUS_FILTERS,
  campaignContextFromTracking,
  canRetryEvento,
  capiDeliveryDetail,
  capiDeliveryLabel,
  capiDeliveryState,
  capiEventLabel,
  capiEventSource,
  capiInspectSnapshots,
  capiMissingFields,
  defaultEventosPeriod,
  displayEventosPhone,
  filterEventosRows,
  formatEventosDateBr,
  formatEventosWhen,
  missingFieldLabel,
  paginateEventosRows,
  periodUtcBounds,
  summarizeEventos,
} from '@/lib/rastreamentoEventosMeta';

const AUDIT_TABS = [
  { id: 'summary', label: 'Resumo' },
  { id: 'source', label: 'Entrada' },
  { id: 'request', label: 'Envio Meta' },
  { id: 'response', label: 'Resposta Meta' },
];

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function Metric({ label, value, detail, tone, icon: Icon, active, onClick }) {
  return (
    <button
      type="button"
      className={`eventos-metric eventos-metric--${tone}${active ? ' is-active' : ''}`}
      onClick={onClick}
      title={detail}
    >
      <Icon className="h-4 w-4" />
      <strong>{value}</strong>
      <span>{label}</span>
    </button>
  );
}

function StatusChip({ state, label }) {
  return <span className={`eventos-chip eventos-chip--${state}`}>{label}</span>;
}

function JsonPanel({ snapshot }) {
  const { toast } = useToast();
  const serialized = snapshot?.payload ? JSON.stringify(snapshot.payload, null, 2) : null;

  return (
    <section className="eventos-json">
      <header>
        <p>{snapshot?.label}</p>
        {serialized ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={async () => {
              await navigator.clipboard.writeText(serialized);
              toast({ title: 'JSON copiado' });
            }}
          >
            <Copy className="h-3.5 w-3.5 mr-1" />
            Copiar JSON
          </Button>
        ) : null}
      </header>
      {serialized ? (
        <pre>
          <code>{serialized}</code>
        </pre>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhum payload disponível nesta aba.</p>
      )}
    </section>
  );
}

function LeadCampaign({ event, onOpenLead }) {
  const adLine = [event.campaignName, event.adSetName, event.adName].filter(Boolean).join(' · ');
  return (
    <div className="eventos-context">
      <button type="button" className="eventos-lead-open" onClick={() => onOpenLead?.(event)}>
        {event.leadName}
      </button>
      <small>{event.phoneDisplay}</small>
      {adLine ? (
        <small className="eventos-context__ad" title={adLine}>
          {adLine}
        </small>
      ) : null}
    </div>
  );
}

/**
 * Auditoria CAPI no padrão TRACK: período, saúde da entrega, inspeção e retry só de rede.
 */
export default function RastreamentoEventosMeta({ clienteId, since: sinceProp, until: untilProp, onPeriodChange }) {
  const { toast } = useToast();
  const fallback = useMemo(() => defaultEventosPeriod(), []);
  const [localPeriod, setLocalPeriod] = useState(fallback);
  const appliedSince = sinceProp || localPeriod.since;
  const appliedUntil = untilProp || localPeriod.until;
  const [eventName, setEventName] = useState('');
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [startedOnly, setStartedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);
  const [outsideCount, setOutsideCount] = useState(0);
  const [retryingId, setRetryingId] = useState('');
  const [inspect, setInspect] = useState(null);
  const [inspectTab, setInspectTab] = useState('summary');
  const [leadFicha, setLeadFicha] = useState(null);

  const load = useCallback(async () => {
    if (!clienteId) {
      setRows([]);
      setOutsideCount(0);
      return;
    }
    const bounds = periodUtcBounds(appliedSince, appliedUntil);
    if (!bounds) return;
    setLoading(true);
    setError(null);
    const [periodRes, totalRes] = await Promise.all([
      supabase
        .from('meta_conversion_event_log')
        .select(
          'id, event_name, success, ctwa_clid, error_message, created_at, contact_id, lead_id, whatsapp_config_id, meta_response',
        )
        .eq('cliente_id', clienteId)
        .gte('created_at', bounds.from)
        .lte('created_at', bounds.to)
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('meta_conversion_event_log')
        .select('id', { count: 'exact', head: true })
        .eq('cliente_id', clienteId),
    ]);
    if (periodRes.error) {
      setError(periodRes.error.message);
      setRows([]);
      setLoading(false);
      return;
    }
    const logs = periodRes.data || [];
    const contactIds = [...new Set(logs.map((row) => row.contact_id).filter(Boolean))];
    const leadIds = [...new Set(logs.map((row) => row.lead_id).filter(Boolean))];
    const configIds = [...new Set(logs.map((row) => row.whatsapp_config_id).filter(Boolean))];
    const contacts = [];
    const leads = [];
    for (const ids of chunk(contactIds, 100)) {
      const { data } = await supabase
        .from('cliente_whatsapp_contact')
        .select('id, sender_name, mini_crm, phone, tracking_data, utm_campaign, utm_medium, utm_content, first_seen_at, origin_source, profile_pic_url')
        .in('id', ids);
      contacts.push(...(data || []));
    }
    for (const ids of chunk(leadIds, 100)) {
      const { data } = await supabase
        .from('leads')
        .select('id, nome, whatsapp, tracking_data, utm_campaign, utm_medium, utm_content')
        .in('id', ids);
      leads.push(...(data || []));
    }
    let configs = [];
    if (configIds.length) {
      const { data } = await supabase.from('cliente_whatsapp_config').select('id, name').in('id', configIds);
      configs = data || [];
    }
    const contactById = new Map(contacts.map((item) => [item.id, item]));
    const leadById = new Map(leads.map((item) => [item.id, item]));
    const configById = new Map(configs.map((item) => [item.id, item]));
    setRows(
      logs.map((row) => {
        const contact = contactById.get(row.contact_id) || null;
        const lead = leadById.get(row.lead_id) || null;
        const trackingRow = contact || lead || {};
        const campaign = campaignContextFromTracking(trackingRow);
        const sourceInfo = capiEventSource(row.event_name);
        const delivery = capiDeliveryState(row);
        return {
          ...row,
          contact,
          lead,
          leadId: lead?.id || row.lead_id || null,
          leadName: (contact?.mini_crm?.contato_nome && contactDisplayName(contact)) || lead?.nome || contact?.sender_name || 'Lead não vinculado',
          phoneDisplay: displayEventosPhone(lead?.whatsapp || contact?.phone),
          campaignName: campaign.campaignName,
          adSetName: campaign.adSetName,
          adName: campaign.adName,
          instanceName: configById.get(row.whatsapp_config_id)?.name || '',
          sourceId: sourceInfo.id,
          sourceLabel: sourceInfo.label,
          deliveryState: delivery,
          statusLabel: capiDeliveryLabel(delivery),
          statusDetail: capiDeliveryDetail(row),
          canRetry: canRetryEvento(row),
        };
      }),
    );
    const total = totalRes.count || 0;
    setOutsideCount(Math.max(0, total - logs.length));
    setLoading(false);
  }, [appliedSince, appliedUntil, clienteId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () =>
      filterEventosRows(rows, {
        eventName,
        status,
        source,
        startedOnly,
        since: appliedSince,
        until: appliedUntil,
      }),
    [rows, eventName, status, source, startedOnly, appliedSince, appliedUntil],
  );
  const summary = useMemo(
    () => summarizeEventos(rows, { since: appliedSince, until: appliedUntil }),
    [rows, appliedSince, appliedUntil],
  );
  const pagination = useMemo(
    () => paginateEventosRows(filtered, page),
    [filtered, page],
  );
  const activeFilterCount = [eventName, status, source, startedOnly ? 'started' : ''].filter(Boolean).length;
  const snapshots = inspect ? capiInspectSnapshots(inspect) : null;
  const missing = inspect ? capiMissingFields(inspect) : [];

  useEffect(() => {
    setPage(1);
  }, [eventName, status, source, startedOnly, appliedSince, appliedUntil]);

  const applyPeriod = useCallback(
    ({ from, to }) => {
      if (!from || !to) return;
      setLocalPeriod({ since: from, until: to });
      onPeriodChange?.({ since: from, until: to });
    },
    [onPeriodChange],
  );

  const showAll = () => {
    const untilToday = defaultEventosPeriod().until;
    applyPeriod({ from: '2020-01-01', to: untilToday });
  };

  const retry = async (row) => {
    if (!canRetryEvento(row)) {
      toast({
        variant: 'destructive',
        title: 'Este erro não reenvia',
        description:
          row?.event_name === 'LeadSubmitted'
            ? 'Conversa iniciada só reenvia quando há clique CTWA e o envio ainda não teve sucesso.'
            : 'Qualificado e Compra só reenviam em falha de rede. Sem destino ou rejeição da Meta ficam no histórico.',
      });
      return;
    }
    if (!clienteId || !(row?.contact || row?.lead)) {
      toast({
        variant: 'destructive',
        title: 'Não dá para reenviar',
        description: 'Este evento não tem contato ou lead vinculado.',
      });
      return;
    }
    setRetryingId(row.id);
    try {
      await sendMetaConversionForComercialChange({
        clienteId,
        patch: {},
        eventName: row.event_name,
        lead: row.lead,
        contact: row.contact,
        ctwaClid: row.ctwa_clid,
        showToast: toast,
      });
      await load();
    } finally {
      setRetryingId('');
    }
  };

  if (!clienteId) {
    return (
      <Card className="rt-empty">
        <CardContent className="py-14 text-center text-sm text-muted-foreground">
          Selecione um cliente no topo.
        </CardContent>
      </Card>
    );
  }

  const renderActions = (event) => (
    <div className="eventos-row-actions">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8"
        onClick={() => setLeadFicha(event)}
      >
        <User className="h-3.5 w-3.5 mr-1" />
        Ver lead
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8"
        onClick={() => {
          setInspectTab('summary');
          setInspect(event);
        }}
      >
        <Eye className="h-3.5 w-3.5 mr-1" />
        Inspecionar
      </Button>
      {event.canRetry ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          disabled={retryingId === event.id}
          onClick={() => void retry(event)}
        >
          {retryingId === event.id ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
          )}
          Reenviar
        </Button>
      ) : null}
    </div>
  );

  return (
    <div className="eventos-page">
      <section className="eventos-board">
        <header className="eventos-board__head">
          <div>
            <RastreamentoSectionTitle
              as="h2"
              title="Fluxo para a Meta"
              help={`${rastreamentoTabHelp('eventos')} Enviados chegaram à Meta. Bloqueados dependem de configuração (sem destino ou 2804117). Falhas são envio não concluído. Conversa iniciada reenvia com CTWA. Qualificado/Compra só em falha de rede. Clique no número para filtrar a lista.`}
              helpLabel="Sobre o fluxo para a Meta"
            />
            <p className="eventos-board__period-label">
              {summary.startedConversations} conversa{summary.startedConversations === 1 ? '' : 's'} iniciada{summary.startedConversations === 1 ? '' : 's'}
              {' · '}
              {summary.total} envio{summary.total === 1 ? '' : 's'}
              {' · '}
              {formatEventosDateBr(appliedSince)} a {formatEventosDateBr(appliedUntil)}
            </p>
          </div>
          {outsideCount > 0 ? (
            <p className="eventos-outside">
              {outsideCount} fora deste recorte.{' '}
              <button type="button" onClick={showAll}>
                Ver todos
              </button>
            </p>
          ) : null}
        </header>

        <div className="eventos-board__period">
          <ContatosMessagePeriodPicker
            compact
            fromIso={appliedSince}
            toIso={appliedUntil}
            onChangePeriod={applyPeriod}
          />
          <Button type="button" variant="outline" size="sm" className="h-8 rounded-xl bg-white border-slate-200" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            <span className="ml-1.5">Atualizar</span>
          </Button>
        </div>

        <div className="eventos-metrics">
          <Metric
            icon={MessageCircle}
            label="Conversas iniciadas"
            value={summary.startedConversations}
            detail="Primeira mensagem no período — a mesma conta da Visão geral e dos Leads. Envio CAPI de conversa antiga não entra aqui. Clique para filtrar."
            tone="started"
            active={startedOnly}
            onClick={() => {
              setStatus('');
              setSource('');
              setStartedOnly((current) => {
                const next = !current;
                setEventName(next ? 'LeadSubmitted' : '');
                return next;
              });
            }}
          />
          <Metric
            icon={CheckCircle2}
            label="Enviados"
            value={summary.sent}
            detail="Linhas recebidas pela Meta neste período, inclusive conversa antiga. Clique para filtrar."
            tone="sent"
            active={status === 'sent'}
            onClick={() => {
              setStartedOnly(false);
              setStatus((current) => (current === 'sent' ? '' : 'sent'));
            }}
          />
          <Metric
            icon={ShieldAlert}
            label="Bloqueados"
            value={summary.blocked}
            detail="Dependem de configuração. Clique para filtrar."
            tone="blocked"
            active={status === 'blocked'}
            onClick={() => {
              setStartedOnly(false);
              setStatus((current) => (current === 'blocked' ? '' : 'blocked'));
            }}
          />
          <Metric
            icon={AlertTriangle}
            label="Falhas"
            value={summary.failed}
            detail="Envio não concluído. Clique para filtrar."
            tone="failed"
            active={status === 'failed'}
            onClick={() => {
              setStartedOnly(false);
              setStatus((current) => (current === 'failed' ? '' : 'failed'));
            }}
          />
        </div>
      </section>

      <section className="eventos-board eventos-board--list">
        <header className="eventos-board__head">
          <div>
            <h3>Eventos</h3>
            <p className="eventos-board__period-label">
              {pagination.totalItems} registro{pagination.totalItems === 1 ? '' : 's'}
              {activeFilterCount ? ` · ${activeFilterCount} filtro${activeFilterCount > 1 ? 's' : ''}` : ''}
            </p>
          </div>
          <div className="eventos-board__filters">
            <label>
              <span>Evento</span>
              <select
                value={eventName}
                onChange={(event) => {
                  const value = event.target.value;
                  setEventName(value);
                  if (value !== 'LeadSubmitted') setStartedOnly(false);
                }}
              >
                <option value="">Todos</option>
                {EVENTOS_EVENT_FILTERS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Estado</span>
              <select
                value={status}
                onChange={(event) => {
                  setStartedOnly(false);
                  setStatus(event.target.value);
                }}
              >
                <option value="">Todos</option>
                {EVENTOS_STATUS_FILTERS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Origem</span>
              <select value={source} onChange={(event) => setSource(event.target.value)}>
                <option value="">Todas</option>
                {EVENTOS_SOURCE_FILTERS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            {activeFilterCount ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-10"
                onClick={() => {
                  setEventName('');
                  setStatus('');
                  setSource('');
                  setStartedOnly(false);
                }}
              >
                Limpar
              </Button>
            ) : null}
          </div>
        </header>

        {error ? <p className="text-sm text-destructive px-1">{error}</p> : null}

        <div className="eventos-table-wrap">
          <table className="eventos-table">
            <thead>
              <tr>
                <th>Evento</th>
                <th>Lead</th>
                <th>Quando</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="eventos-empty">
                    <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
                    Carregando eventos…
                  </td>
                </tr>
              ) : pagination.items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="eventos-empty">
                    <strong>Nenhum evento encontrado</strong>
                    <span>Ajuste o período ou aguarde a chegada de novos eventos.</span>
                  </td>
                </tr>
              ) : (
                pagination.items.map((event) => (
                  <tr key={event.id}>
                    <td>
                      <div className="eventos-event">
                        <strong>{capiEventLabel(event.event_name)}</strong>
                        <StatusChip state={event.deliveryState} label={event.statusLabel} />
                      </div>
                      <span>
                        {event.sourceLabel}
                        {event.instanceName ? ` · ${event.instanceName}` : ''}
                      </span>
                      {event.error_message && event.deliveryState !== 'sent' ? (
                        <small>{event.error_message}</small>
                      ) : null}
                    </td>
                    <td>
                      <LeadCampaign event={event} onOpenLead={setLeadFicha} />
                    </td>
                    <td>
                      <strong>{formatEventosWhen(event.created_at)}</strong>
                    </td>
                    <td>{renderActions(event)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="eventos-mobile">
          {pagination.items.map((event) => (
            <article key={event.id} className={`eventos-mobile-card eventos-mobile-card--${event.deliveryState}`}>
              <header>
                <div>
                  <span>{event.sourceLabel}</span>
                  <h3>{capiEventLabel(event.event_name)}</h3>
                </div>
                <StatusChip state={event.deliveryState} label={event.statusLabel} />
              </header>
              <LeadCampaign event={event} onOpenLead={setLeadFicha} />
              <p>{formatEventosWhen(event.created_at)}</p>
              {renderActions(event)}
            </article>
          ))}
        </div>

        <nav className="eventos-pagination">
          <span>
            Página {pagination.page} de {pagination.totalPages} · {pagination.totalItems} eventos
          </span>
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              Anterior
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setPage((value) => value + 1)}
            >
              Próxima
            </Button>
          </div>
        </nav>
      </section>

      <Dialog open={Boolean(inspect)} onOpenChange={(open) => !open && setInspect(null)}>
        <DialogContent className="max-w-2xl eventos-inspect">
          <DialogHeader>
            <DialogTitle>{inspect ? capiEventLabel(inspect.event_name) : 'Auditoria'}</DialogTitle>
            <DialogDescription>Auditoria do evento. Reenvio só em falha transitória de comunicação.</DialogDescription>
          </DialogHeader>
          {inspect ? (
            <>
              <div className="eventos-inspect-tabs">
                {AUDIT_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={inspectTab === tab.id ? 'is-active' : ''}
                    onClick={() => setInspectTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              {inspectTab === 'summary' ? (
                <div className="eventos-inspect-summary">
                  <div className="eventos-delivery">
                    <StatusChip state={inspect.deliveryState} label={inspect.statusLabel} />
                    <strong>{inspect.statusDetail}</strong>
                  </div>
                  <dl>
                    <div>
                      <dt>Origem</dt>
                      <dd>{inspect.sourceLabel}</dd>
                    </div>
                    <div>
                      <dt>Evento</dt>
                      <dd>{inspect.event_name}</dd>
                    </div>
                    <div>
                      <dt>Clique</dt>
                      <dd className="font-mono text-xs break-all">{inspect.ctwa_clid || 'Não resolvido'}</dd>
                    </div>
                    <div>
                      <dt>Instância</dt>
                      <dd>{inspect.instanceName || 'Não resolvida'}</dd>
                    </div>
                  </dl>
                  {inspect.canRetry ? (
                    <div className="eventos-retry-hint">
                      <div>
                        <strong>
                          {inspect.event_name === 'LeadSubmitted'
                            ? 'Reenviar conversa iniciada'
                            : 'Falha transitória de comunicação'}
                        </strong>
                        <small>
                          {inspect.event_name === 'LeadSubmitted'
                            ? 'Usa o mesmo clique CTWA. Se Pixel e Página já estão ligados, a Meta recebe agora.'
                            : 'Uma nova tentativa reutiliza o mesmo evento e o mesmo clique.'}
                        </small>
                      </div>
                      <Button type="button" size="sm" disabled={retryingId === inspect.id} onClick={() => void retry(inspect)}>
                        {retryingId === inspect.id ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                        Reenviar
                      </Button>
                    </div>
                  ) : null}
                  {missing.length ? (
                    <div className="eventos-missing">
                      <span>Dados ausentes</span>
                      <div>
                        {missing.map((field) => (
                          <em key={field}>{missingFieldLabel(field)}</em>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {inspectTab === 'source' ? <JsonPanel snapshot={snapshots.source} /> : null}
              {inspectTab === 'request' ? <JsonPanel snapshot={snapshots.request} /> : null}
              {inspectTab === 'response' ? <JsonPanel snapshot={snapshots.response} /> : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <RastreamentoLeadFicha
        open={Boolean(leadFicha)}
        onOpenChange={(open) => {
          if (!open) setLeadFicha(null);
        }}
        clienteId={clienteId}
        contact={leadFicha?.contact || null}
        lead={leadFicha?.lead || null}
        event={leadFicha}
      />
    </div>
  );
}
