import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, ExternalLink, Image as ImageIcon, ImageOff, Loader2, RefreshCw, Send, User } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import '@/components/pages/RastreamentoHub.css';
import { fetchMetaAdCreative, persistContactMetaAdIdentity } from '@/lib/funilMetaCreative';
import {
  buildLeadFicha,
  ctwaClidFromLeadSources,
  fetchLeadFichaEvents,
  leadPhotoUrl,
  shortenCtwaClid,
} from '@/lib/rastreamentoLeadFicha';
import {
  buildLeadConversaAudit,
  cqcPreviewRows,
  fetchLeadConversaAudit,
  fetchLeadPhoto,
  filterLeadConversaByChannel,
  leadConversaChannels,
  leadPhoneDigits,
} from '@/lib/rastreamentoLeadConversa';
import { sendMetaConversionForComercialChange, unixEventTimeFromIso } from '@/lib/metaConversions';
import { fetchAtendimentoMediaUrl } from '@/lib/atendimentoMediaDownload';
import { saveContactName } from '@/lib/leadIdentity';
import LeadNameEditor from '@/components/crm/LeadNameEditor';
import LeadAnalysisLabels from '@/components/crm/LeadAnalysisLabels';
import LeadComercialInline from '@/components/crm/LeadComercialInline';
import RastreamentoLeadAttributionHistory from '@/components/crm/RastreamentoLeadAttributionHistory';
import RastreamentoMiniCrmResumo from '@/components/crm/RastreamentoMiniCrmResumo';

function canalDoLead(contact) {
  const name = String(contact?.instance_name || '').trim();
  const key = name.toLowerCase();
  if (key === 'whatsapp') return 'WhatsApp oficial';
  if (key === 'zapperapi') return 'Zapper';
  return name;
}

function formatCqcWhen(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function shortMetaError(message) {
  const raw = String(message || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  if (/ctwa_clid/i.test(raw) && /page_id/i.test(raw)) {
    return ' recusada: o clique e a página não são o mesmo par.';
  }
  const head = raw.split(/\s+—\s+|\{|\. /)[0].trim() || raw;
  return `: ${head.length > 90 ? `${head.slice(0, 87)}…` : head}`;
}

/** Uma linha por evento: só a última falha, com contagem quando o mesmo texto se repetiu. */
function journeyErrorNotes(journey) {
  const byLabel = new Map();
  (journey || []).forEach((item) => {
    const text = shortMetaError(item.errorMessage);
    if (!text) return;
    const prev = byLabel.get(item.label);
    const repeats = prev && prev.text === text ? prev.repeats + 1 : 1;
    byLabel.set(item.label, { id: item.id, label: item.label, text, repeats, full: item.errorMessage });
  });
  return [...byLabel.values()];
}

function CopyField({ label, value, short }) {
  const [copied, setCopied] = useState(false);
  const display = short ? shortenCtwaClid(value) : value;
  const canCopy = Boolean(value) && !['Não informado', 'Não resolvido', '—', 'Campanha não resolvida', 'Conjunto não resolvido', 'Anúncio não resolvido'].includes(value);
  const copy = async () => {
    if (!canCopy) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="rt-lead-ficha__row">
      <span>{label}</span>
      {canCopy ? (
        <button type="button" className="rt-lead-ficha__copy" onClick={copy} title={`Copiar ${label.toLowerCase()}`}>
          <strong className={short ? 'rt-lead-ficha__mono' : undefined} title={value}>{display || '—'}</strong>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      ) : (
        <strong title={value || undefined}>{display || '—'}</strong>
      )}
    </div>
  );
}

function LeadMediaControl({ item, clienteId }) {
  const [phase, setPhase] = useState('idle');
  const [loadedFile, setLoadedFile] = useState(null);
  const labels = { audio: 'Áudio', image: 'Imagem', sticker: 'Figurinha', video: 'Vídeo', document: 'Documento' };
  const actions = { audio: 'Ouvir áudio', image: 'Ver imagem', sticker: 'Ver figurinha', video: 'Ver vídeo', document: 'Abrir documento' };
  const label = labels[item.kind] || 'Arquivo';
  const caption = item.body && !Object.values(labels).includes(item.body) ? item.body : '';
  const files = loadedFile ? [loadedFile] : (item.mediaFiles || []).filter(file => !/\.enc(?:[?#]|$)/i.test(file.url));
  const canDownload = Boolean(clienteId && item.downloadMessageIds?.length);

  const load = async () => {
    if (phase === 'loading') return;
    if (!canDownload) {
      setPhase('idle');
      return;
    }
    setPhase('loading');
    try {
      const result = await fetchAtendimentoMediaUrl({
        messageIds: item.downloadMessageIds,
        clienteId,
        whatsappConfigId: item.whatsappConfigId,
        mediaKind: item.kind,
        chatJid: item.chatJid,
        fileName: files[0]?.name || undefined,
        forceRefresh: phase === 'error',
      });
      if (!result?.url) {
        setPhase('error');
        return;
      }
      setLoadedFile({ url: result.url, kind: item.kind, mime: result.mimetype, name: result.fileName });
      setPhase('idle');
    } catch {
      setPhase('error');
    }
  };

  if (item.mediaPurged) {
    const expired = ['image', 'sticker'].includes(item.kind) ? 'expirada' : 'expirado';
    return <div className="rt-lead-audio"><span>{label} {expired}</span>{caption ? <small>{caption}</small> : null}</div>;
  }
  if (files.length && phase === 'idle') {
    return <LeadFileControl item={{ ...item, body: caption, mediaFiles: files }} onError={files.length === 1 ? () => setPhase('error') : undefined} />;
  }
  return (
    <div className="rt-lead-audio" aria-busy={phase === 'loading'}>
      {phase === 'error' ? <span role="alert">Não foi possível carregar a mídia.</span> : null}
      {!canDownload && !files.length ? <span>{label} sem arquivo</span> : (
        <button type="button" onClick={load} disabled={phase === 'loading'}>
          {phase === 'loading' ? 'Carregando mídia…' : phase === 'error' ? 'Tentar de novo' : actions[item.kind] || 'Abrir arquivo'}
        </button>
      )}
      {caption ? <small>{caption}</small> : null}
    </div>
  );
}

function LeadFileControl({ item, onError }) {
  const files = item.mediaFiles || [];
  const [failed, setFailed] = useState([]);
  const fail = url => {
    setFailed(current => current.includes(url) ? current : [...current, url]);
    onError?.();
  };
  if (!files.length) return null;
  return (
    <div className={`rt-lead-file${item.kind === 'sticker' ? ' is-sticker' : ''}`}>
      {files.map((file) => (
        failed.includes(file.url) ? (
          <a key={file.url} href={file.url} target="_blank" rel="noopener noreferrer" title={file.name || undefined}>Arquivo indisponível · Abrir</a>
        ) : file.kind === 'image' || file.kind === 'sticker' ? (
          <a key={file.url} href={file.url} target="_blank" rel="noopener noreferrer" title="Abrir foto">
            <img src={file.url} alt={item.kind === 'sticker' ? 'Figurinha da conversa' : 'Foto da conversa'} loading="lazy" onError={() => fail(file.url)} />
          </a>
        ) : file.kind === 'video' ? (
          <video key={file.url} src={file.url} controls preload="metadata" onError={() => fail(file.url)} />
        ) : file.kind === 'audio' ? (
          <audio key={file.url} src={file.url} controls preload="metadata" onError={() => fail(file.url)} />
        ) : (
          <a key={file.url} href={file.url} target="_blank" rel="noopener noreferrer">
            {file.name || 'Abrir arquivo'}
          </a>
        )
      ))}
      {item.body ? <p>{item.body}</p> : null}
    </div>
  );
}

/**
 * Ficha do lead no padrão TRACK: atribuição, criativo e jornada CAPI.
 * Conversa iniciada pode ser enviada de novo quando há CTWA e ainda não houve sucesso.
 */
export default function RastreamentoLeadFicha(props) {
  const identity = [props.clienteId, props.contact?.id, props.lead?.id, props.event?.id].join(':');
  return <LeadFichaContent key={identity} {...props} />;
}

function LeadFichaContent({
  open,
  onOpenChange,
  clienteId,
  contact,
  originLabel,
  lead,
  event,
  analysisCatalog = [],
  onAnalysisLabelsSaved,
  onComercialSaved,
  onNameSave,
  crmFields,
  className,
}) {
  const { toast } = useToast();
  const [events, setEvents] = useState([]);
  const [eventsReady, setEventsReady] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState(null);
  const [conversaReady, setConversaReady] = useState(false);
  const [conversaVersion, setConversaVersion] = useState(0);
  const [conversa, setConversa] = useState(buildLeadConversaAudit({}));
  const [photoUrl, setPhotoUrl] = useState('');
  const [sendingLeadSubmitted, setSendingLeadSubmitted] = useState(false);
  const [canalAtivo, setCanalAtivo] = useState('');
  const [abaFicha, setAbaFicha] = useState('contato');
  const [nameOverride, setNameOverride] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const chatRef = useRef(null);
  const contactTabRef = useRef(null);

  const ficha = buildLeadFicha({ contact, lead, events, event });
  if (originLabel) ficha.origin = originLabel;
  if (nameOverride && nameOverride.contactId === contact?.id) ficha.name = nameOverride.name;
  const errorNotes = journeyErrorNotes(ficha.journey);
  const showPhone = Boolean(ficha.phone) && ficha.phone !== 'Telefone indisponível' && ficha.phone !== ficha.name;
  const digits = leadPhoneDigits(contact, lead, event);
  const canaisConversa = leadConversaChannels(conversa);
  const canalPreferido = canaisConversa.some((item) => item.key === canalAtivo) ? canalAtivo : '';
  const conversaVista = filterLeadConversaByChannel(conversa, canalPreferido);

  useEffect(() => {
    if (!open || !clienteId) {
      setEvents([]);
      setEventsReady(false);
      return;
    }
    let cancelled = false;
    setEvents([]);
    setEventsReady(false);
    void fetchLeadFichaEvents(supabase, {
      clienteId,
      contactId: contact?.id || event?.contact_id || null,
      ctwaClid: event?.ctwa_clid || ctwaClidFromLeadSources(contact, lead, event) || null,
      leadId: lead?.id || event?.lead_id || null,
    }).then(({ rows }) => {
      if (!cancelled) setEvents(rows);
    }).finally(() => {
      if (!cancelled) setEventsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [open, clienteId, contact?.id, event?.contact_id, event?.ctwa_clid, lead?.id]);

  useEffect(() => {
    if (!open) {
      setThumbnailUrl(null);
      return;
    }
    if (!ficha.showCreative) {
      setThumbnailUrl(null);
      return;
    }
    const current = ficha.creative.thumbnailUrl;
    setThumbnailUrl(current || null);
    const adId = ficha.creative.adId;
    if (!adId && !current) {
      setThumbnailUrl(null);
      return;
    }
    let cancelled = false;
    const run = adId
      ? fetchMetaAdCreative(adId)
      : supabase.functions.invoke('meta-ads-api', {
          body: { action: 'persist-ad-thumbnail', sourceUrl: current },
        }).then(({ data }) => ({ thumbnailUrl: data?.public_url || data?.thumbnail_url || null }));
    void run.then((creative) => {
      if (cancelled) return;
      const next = creative?.thumbnailUrl;
      if (next) setThumbnailUrl(next);
      if (contact?.id && clienteId && creative?.ad) {
        void persistContactMetaAdIdentity({ clienteId, contactId: contact.id, ad: creative.ad, accountName: creative.accountName });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, ficha.showCreative, ficha.creative.thumbnailUrl, ficha.creative.adId, clienteId, contact?.id]);

  useEffect(() => {
    if (!open || !clienteId) {
      setConversa(buildLeadConversaAudit({}));
      setConversaReady(false);
      setPhotoUrl('');
      return;
    }
    let cancelled = false;
    setConversaReady(false);
    setPhotoUrl(leadPhotoUrl(contact, lead));
    void Promise.all([
      fetchLeadConversaAudit(supabase, { clienteId, digits }),
      fetchLeadPhoto(supabase, { clienteId, digits }),
    ]).then(([chat, contactPhoto]) => {
      if (cancelled) return;
      const teamLogRows = chat.teamLogRows || [];
      const hasWhatsapp = (chat.inboxRows || []).length > 0 || (chat.sentRows || []).length > 0 || teamLogRows.length > 0;
      const preview = hasWhatsapp ? { inboxRows: [], sentRows: [], leadAt: null, teamAt: null } : cqcPreviewRows(contact);
      const inboxRows = hasWhatsapp ? chat.inboxRows : preview.inboxRows;
      const sentRows = hasWhatsapp ? chat.sentRows : preview.sentRows;
      setConversa({
        ...buildLeadConversaAudit({ inboxRows, sentRows, teamLogRows: hasWhatsapp ? teamLogRows : [], channels: chat.channels || [] }),
        error: chat.error,
        preview: !hasWhatsapp && (inboxRows.length > 0 || sentRows.length > 0),
        cqcLeadAt: hasWhatsapp ? null : preview.leadAt,
        cqcTeamAt: hasWhatsapp ? null : preview.teamAt,
      });
      setPhotoUrl(leadPhotoUrl(contact, lead, [contactPhoto, chat.photoUrl]));
      setConversaReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [open, clienteId, digits, contact?.profile_pic_url, lead?.profile_pic_url, conversaVersion]);

  useEffect(() => {
    setAbaFicha('contato');
    setNameOverride(null);
    setEditingName(false);
  }, [open, contact?.id, lead?.id, event?.id]);

  useEffect(() => {
    setCanalAtivo('');
  }, [digits, open]);

  useEffect(() => {
    if (!conversaReady || !chatRef.current) return;
    chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [conversaReady, conversaVista.items.length, canalPreferido]);

  const sendLeadSubmitted = async () => {
    if (!clienteId || !ficha.leadSubmitted.canSend || sendingLeadSubmitted) return;
    setSendingLeadSubmitted(true);
    try {
      const result = await sendMetaConversionForComercialChange({
        clienteId,
        patch: {},
        eventName: 'LeadSubmitted',
        lead,
        contact,
        ctwaClid: ctwaClidFromLeadSources(contact, lead, event),
        eventTime: unixEventTimeFromIso(contact?.first_seen_at || lead?.data_entrada || lead?.created_at),
        showToast: toast,
      });
      if (result?.reason === 'sem_ctwa_clid') {
        toast({
          variant: 'destructive',
          title: 'Sem clique CTWA',
          description: 'Esta conversa não tem o identificador do anúncio. Sem ele a Meta não recebe a primeira mensagem.',
        });
      }
      const { rows } = await fetchLeadFichaEvents(supabase, {
        clienteId,
        contactId: contact?.id || event?.contact_id || null,
        ctwaClid: event?.ctwa_clid || ctwaClidFromLeadSources(contact, lead, event) || null,
        leadId: lead?.id || event?.lead_id || null,
      });
      setEvents(rows);
    } finally {
      setSendingLeadSubmitted(false);
    }
  };

  const saveName = async (name) => {
    if (onNameSave) {
      const saved = await onNameSave(name);
      if (saved === false) return false;
    } else {
      await saveContactName(supabase, { clienteId, contactId: contact.id, name });
      onComercialSaved?.();
    }
    setNameOverride({ contactId: contact.id, name });
    return true;
  };

  const handleComercialSaved = () => {
    onComercialSaved?.();
    if (!clienteId) return;
    void fetchLeadFichaEvents(supabase, {
      clienteId,
      contactId: contact?.id || event?.contact_id || null,
      ctwaClid: event?.ctwa_clid || ctwaClidFromLeadSources(contact, lead, event) || null,
      leadId: lead?.id || event?.lead_id || null,
    }).then(({ rows }) => setEvents(rows));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={className ? `rt-lead-ficha ${className}` : 'rt-lead-ficha'} onEscapeKeyDown={(keyEvent) => { if (editingName) keyEvent.preventDefault(); }} onOpenAutoFocus={(focusEvent) => {
        focusEvent.preventDefault();
        contactTabRef.current?.focus();
      }}>
        <DialogHeader className="rt-lead-ficha__header">
          <div className="rt-lead-ficha__who">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt=""
                className="rt-lead-ficha__avatar"
                onError={() => setPhotoUrl('')}
              />
            ) : (
              <span className="rt-lead-ficha__avatar is-empty">
                <User className="h-5 w-5" />
              </span>
            )}
            <div>
              <div className="rt-lead-ficha__name-line"><DialogTitle>{ficha.name}</DialogTitle>{contact?.id && clienteId ? <LeadNameEditor key={contact.id} name={ficha.name} onSave={saveName} onEditingChange={setEditingName} /> : null}</div>
              <DialogDescription asChild>
                <div className="rt-lead-ficha__sub">
                  <span className={`rt-lead-ficha__origin ${
                    ficha.originKind === 'meta' ? 'is-meta'
                      : ficha.originKind === 'google' ? 'is-google'
                        : ficha.originKind === 'site' ? 'is-site'
                          : 'is-off'
                  }`}>
                    {ficha.origin}
                  </span>
                  {showPhone ? <span>{ficha.phone}</span> : null}
                  {canalDoLead(contact) ? <span>{canalDoLead(contact)}</span> : null}
                  {ficha.firstSeenAt !== '—' ? <span>desde {ficha.firstSeenAt}</span> : null}
                </div>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={abaFicha} onValueChange={setAbaFicha} className="rt-lead-ficha__tabs">
          <TabsList className="rt-lead-ficha__tabs-list" aria-label="Ficha do contato">
            <TabsTrigger ref={contactTabRef} value="contato"><User className="h-4 w-4" />Contato</TabsTrigger>
            <TabsTrigger value="anuncio"><ImageIcon className="h-4 w-4" />Anúncio</TabsTrigger>
          </TabsList>
          <TabsContent value="contato" forceMount hidden={abaFicha !== 'contato'} className="rt-lead-ficha__body">
            <aside className="rt-lead-ficha__details" aria-label="Dados do contato">
              {crmFields ?? <RastreamentoMiniCrmResumo open={open} clienteId={clienteId} contactId={contact?.id || event?.contact_id || lead?.contact_id} />}
              <section className="rt-lead-ficha__mark">
                <h3>Marcar</h3>
                <div className="rt-lead-ficha__mark-grid">
                  <div className="rt-lead-ficha__mark-cell">
                    <span>Qualificado</span>
                    <LeadComercialInline
                      field="qualificado"
                      clienteId={clienteId}
                      lead={lead}
                      contact={contact}
                      compact
                      embedded
                      disabled={!clienteId || (!contact?.id && !lead?.id)}
                      onSaved={handleComercialSaved}
                    />
                  </div>
                  <div className="rt-lead-ficha__mark-cell">
                    <span>Comprou</span>
                    <LeadComercialInline
                      field="comprou"
                      clienteId={clienteId}
                      lead={lead}
                      contact={contact}
                      compact
                      embedded
                      disabled={!clienteId || (!contact?.id && !lead?.id)}
                      onSaved={handleComercialSaved}
                    />
                  </div>
                  <div className="rt-lead-ficha__mark-cell">
                    <span>Valor</span>
                    <LeadComercialInline
                      field="valor"
                      clienteId={clienteId}
                      lead={lead}
                      contact={contact}
                      compact
                      embedded
                      disabled={!clienteId || (!contact?.id && !lead?.id)}
                      onSaved={handleComercialSaved}
                    />
                  </div>
                  <div className="rt-lead-ficha__mark-cell is-etiqueta">
                    <span>Etiqueta</span>
                    <LeadAnalysisLabels
                      clienteId={clienteId}
                      contact={contact}
                      lead={lead}
                      catalog={analysisCatalog}
                      compact
                      disabled={!clienteId || (!contact?.id && !lead?.id)}
                      apiceStatus={contact?.crm_apice_lead_status || lead?.crm_apice_lead_status || ''}
                      onSaved={onAnalysisLabelsSaved}
                    />
                  </div>
                </div>
                <p className="rt-lead-ficha__mark-note">Qualificado e compra seguem a jornada e podem ir à Meta. Etiqueta é só análise.</p>
              </section>


            </aside>
            <section className="rt-lead-ficha__chat-card">
              <header>
                <h3>Atendimento</h3>
                <Button type="button" variant="ghost" size="sm" disabled={!conversaReady} onClick={() => setConversaVersion((value) => value + 1)}>
                  <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
                </Button>
                {conversaReady && (conversaVista.inboundCount || conversaVista.outboundCount) ? (
                  <span>{conversaVista.inboundCount} do lead · {conversaVista.outboundCount} da equipe</span>
                ) : null}
              </header>
              {conversaReady && canaisConversa.length > 0 ? (
                <div className="rt-lead-ficha__canais" role="group" aria-label="Filtrar conversa por canal">
                  <button type="button" aria-pressed={!canalPreferido} className={!canalPreferido ? 'is-on' : ''} onClick={() => setCanalAtivo('')}>
                    Todos os canais<small>{conversa.inboundCount + conversa.outboundCount}</small>
                  </button>
                  {canaisConversa.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      aria-pressed={item.key === canalPreferido}
                      className={item.key === canalPreferido ? 'is-on' : ''}
                      onClick={() => setCanalAtivo(item.key)}
                    >
                      {item.label}
                      <small>{item.count}</small>
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="rt-lead-ficha__stage">
                <div className="rt-lead-ficha__chat-col">
                  {conversa.error ? <p role="alert" className="p-3 text-sm text-amber-800">{conversa.error}</p> : null}
                  {!conversaReady ? (
                    <p className="rt-lead-ficha__empty">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Carregando conversa…
                    </p>
                  ) : conversaVista.items.length === 0 ? (
                    <p className="rt-lead-ficha__empty">
                      {conversa.error ? 'Conversa incompleta. Use Atualizar para tentar novamente.' : canalPreferido ? 'Nenhuma mensagem gravada para este lead neste canal.' : conversa.cqcLeadAt || conversa.cqcTeamAt
                        ? 'O arquivo do CQC guardou só o horário da última fala, sem o texto. O histórico entra quando o WhatsApp estiver ligado.'
                        : 'Ainda sem mensagens gravadas neste WhatsApp. O histórico começa quando o webhook do canal recebe a conversa.'}
                    </p>
                  ) : (
                    <ol ref={chatRef} className="rt-lead-ficha__chat">
                      {conversaVista.items.map((item) => (
                        item.type === 'day' ? (
                          <li key={item.id} className="is-day">{item.label}</li>
                        ) : (
                          <li key={item.id} className={item.side === 'equipe' ? 'is-out' : 'is-in'}>
                            <em>{item.side === 'equipe' ? 'Equipe' : 'Lead'}{item.channelLabel ? ` · ${item.channelLabel}` : ''}</em>
                            {item.mediaFiles?.length || item.kind !== 'text' ? (
                              <LeadMediaControl item={item} clienteId={clienteId} />
                            ) : (
                              <p>{item.body}</p>
                            )}
                            <time title={item.timeEstimated ? 'Horário de recebimento do evento; o Chatvolt não informou o horário original.' : undefined}>{item.timeLabel}{item.timeEstimated ? ' (recebimento)' : ''}</time>
                          </li>
                        )
                      ))}
                    </ol>
                  )}
                  <small>
                    {conversaVista.items.some((item) => item.timeEstimated) ? 'O Chatvolt não informou o horário original de algumas mensagens. A ordem usa o recebimento e pode diferir da conversa. ' : ''}
                    {conversa.items.length > 0 && !conversa.preview ? 'Até 120 mensagens gravadas por canal. ' : ''}
                    {conversa.cqcLeadAt || conversa.cqcTeamAt
                      ? `Última fala do lead ${formatCqcWhen(conversa.cqcLeadAt)}${conversa.cqcTeamAt ? ` · equipe ${formatCqcWhen(conversa.cqcTeamAt)}` : ''}.`
                      : conversa.preview
                        ? 'Últimas mensagens guardadas no CQC. O histórico completo entra quando o WhatsApp estiver ligado.'
                        : `Texto fica gravado. Arquivo de mídia some depois de ${conversa.mediaRetentionDays} dias.`}
                  </small>
                </div>
              </div>
            </section>
          </TabsContent>
          <TabsContent value="anuncio" forceMount hidden={abaFicha !== 'anuncio'} className="rt-lead-ficha__ad-panel">
            <section className="rt-lead-ficha__ad-preview" aria-label="Criativo do anúncio">
              {ficha.showCreative && thumbnailUrl ? (
                <img src={thumbnailUrl} alt={ficha.attribution.adName === 'Anúncio não resolvido' ? 'Criativo do anúncio' : ficha.attribution.adName} onError={() => setThumbnailUrl(null)} />
              ) : (
                <div className="rt-lead-ficha__ad-empty">
                  <ImageOff className="h-8 w-8" />
                  <strong>{ficha.showCreative ? 'Imagem indisponível' : 'Sem anúncio vinculado'}</strong>
                  <p>{ficha.showCreative
                    ? 'O anúncio foi identificado, mas a imagem ainda não está disponível.'
                    : `Origem deste contato: ${ficha.origin}. Quando houver um anúncio identificado, o criativo aparecerá aqui.`}</p>
                </div>
              )}
            </section>
            <aside className="rt-lead-ficha__ad-details" aria-label="Dados do anúncio e rastreamento">
              <section className="rt-lead-ficha__ad-info" aria-label="Anúncio de origem">
                <h3>Anúncio de origem</h3>
                <div className="rt-lead-ficha__attr-grid">
                  <CopyField label="Origem do contato" value={ficha.origin} />
                  {canalDoLead(contact) ? <CopyField label="Canal" value={canalDoLead(contact)} /> : null}
                  {ficha.attribution.accountName ? <CopyField label="Conta de anúncios" value={ficha.attribution.accountName} /> : null}
                  {ficha.attribution.accountId ? <CopyField label="ID da conta" value={ficha.attribution.accountId} /> : null}
                  {ficha.showCampaignContext ? <>
                    <CopyField label="Campanha" value={ficha.attribution.campaignName} />
                    <CopyField label="Conjunto" value={ficha.attribution.adSetName} />
                    <CopyField label="Anúncio" value={ficha.attribution.adName} />
                  </> : null}
                  {ficha.attribution.adId !== 'Não resolvido' ? <CopyField label="ID do anúncio" value={ficha.attribution.adId} /> : null}
                  {ficha.attribution.clickId !== 'Não resolvido' ? <CopyField
                    label="Clique"
                    value={ficha.showCreative ? ficha.attribution.ctwaClid : ficha.attribution.clickId}
                    short
                  /> : null}
                </div>
                {ficha.showCreative && ficha.creative.sourceUrl ? (
                  <a href={ficha.creative.sourceUrl} target="_blank" rel="noopener noreferrer" className="rt-lead-ficha__ad-link">
                    Abrir anúncio<ExternalLink className="h-4 w-4" />
                  </a>
                ) : null}
              </section>

              <section className="rt-lead-ficha__attr" aria-label="UTMs">
                <h3>UTMs</h3>
                {ficha.utm.hasValues ? (
                  <>
                    <div className="rt-lead-ficha__utm-grid">
                      {ficha.utm.fields.map(({ key, value }) => <CopyField key={key} label={key} value={value || 'Não informado'} />)}
                    </div>
                    {ficha.utm.note ? <p className="rt-lead-ficha__utm-note">{ficha.utm.note}</p> : null}
                  </>
                ) : <p className="rt-lead-ficha__utm-note">Nenhuma UTM registrada para este contato.</p>}
              </section>

              {open && abaFicha === 'anuncio' && (contact?.from_jid || contact?.id) ? (
                <RastreamentoLeadAttributionHistory key={`${clienteId}:${contact.from_jid || contact.id}`} clienteId={clienteId} contact={contact} />
              ) : null}

              {ficha.showCapiJourney ? (
                <section className="rt-lead-ficha__journey-card">
                  <h3>Jornada na Meta</h3>
                  {!eventsReady ? (
                    <p className="rt-lead-ficha__empty">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Carregando eventos…
                    </p>
                  ) : (
                    <>
                      <ol className="rt-lead-ficha__track">
                        {ficha.track.steps.map((step) => (
                          <li
                            key={step.eventName}
                            className={[
                              step.reached ? `is-${step.deliveryState}` : 'is-wait',
                              step.reached ? 'is-reached' : '',
                            ].filter(Boolean).join(' ')}
                            title={
                              step.item
                                ? `${step.item.label} · ${step.item.statusLabel} · ${step.item.at}`
                                : `${step.shortLabel} ainda não disparou`
                            }
                          >
                            <i />
                            <span>{step.shortLabel}</span>
                            <small>{step.item ? step.item.statusLabel : '—'}</small>
                          </li>
                        ))}
                      </ol>
                      {ficha.journey.length === 0 ? (
                        <p className="rt-lead-ficha__empty">Ainda sem eventos CAPI nesta conversa.</p>
                      ) : null}
                      {errorNotes.length > 0 ? (
                        <ul className="rt-lead-ficha__notes">
                          {errorNotes.map((note) => (
                            <li key={note.id} title={note.full}>
                              {note.label}{note.text}
                              {note.repeats > 1 ? <span> · repetiu {note.repeats} vezes</span> : null}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {ficha.leadSubmitted.canSend ? (
                        <div className="rt-lead-ficha__send">
                          <small>Há clique CTWA e a conversa iniciada ainda não chegou à Meta.</small>
                          <Button
                            type="button"
                            size="sm"
                            className="h-8 rounded-xl"
                            disabled={sendingLeadSubmitted}
                            onClick={() => void sendLeadSubmitted()}
                          >
                            {sendingLeadSubmitted ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                            ) : ficha.leadSubmitted.hasFailed ? (
                              <RefreshCw className="h-3.5 w-3.5 mr-1" />
                            ) : (
                              <Send className="h-3.5 w-3.5 mr-1" />
                            )}
                            {ficha.leadSubmitted.label}
                          </Button>
                        </div>
                      ) : ficha.leadSubmitted.hasSuccess ? (
                        <p className="rt-lead-ficha__empty">Conversa iniciada já enviada à Meta.</p>
                      ) : null}
                    </>
                  )}
                </section>
              ) : null}
            </aside>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
