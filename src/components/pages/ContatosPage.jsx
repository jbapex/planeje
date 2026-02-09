import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { useClienteWhatsAppConfig } from '@/hooks/useClienteWhatsAppConfig';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { extractPhoneAndNameFromRawPayload, buildContactTrackingFromRawPayload, getFromJidFromRawPayload } from '@/lib/contactFromWebhookPayload';
import { useCrmPipeline } from '@/hooks/useCrmPipeline';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Users, Loader2, RefreshCw, Filter, Activity, Eye, MessageCircle, Infinity, UserX, Info, Globe, Search, FileDown, Upload, PlusCircle, Trash2, Send } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const ORIGIN_FILTER_ALL = 'todos';
const ORIGIN_FILTER_META = 'meta_ads';
const ORIGIN_FILTER_NAO_IDENT = 'nao_identificado';

function formatDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '—';
  return format(d, "dd/MM/yyyy HH:mm", { locale: ptBR });
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

const ContatosPage = ({ embeddedInCrm, onOpenConversation }) => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const {
    effectiveClienteId,
    loading: configLoading,
    isAdminWithoutCliente,
    selectedClienteId,
    setSelectedClienteId,
    clientesForAdmin,
  } = useClienteWhatsAppConfig();

  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fillFromWebhookLogLoading, setFillFromWebhookLogLoading] = useState(false);
  const [originFilter, setOriginFilter] = useState(ORIGIN_FILTER_ALL);
  const [searchTerm, setSearchTerm] = useState('');
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

  const { pipelines } = useCrmPipeline();

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
    toast({ title: 'Contato excluído' });
  }, [contactToDelete, effectiveClienteId, toast]);

  const loadContacts = useCallback(async () => {
    if (!effectiveClienteId) {
      setContacts([]);
      return;
    }
    setLoading(true);
    let q = supabase
      .from('cliente_whatsapp_contact')
      .select('id, from_jid, phone, sender_name, origin_source, utm_source, utm_medium, utm_campaign, utm_content, utm_term, first_seen_at, last_message_at, tracking_data, profile_pic_url, instance_name')
      .eq('cliente_id', effectiveClienteId)
      .order('last_message_at', { ascending: false });
    if (originFilter === ORIGIN_FILTER_META) q = q.eq('origin_source', 'meta_ads');
    if (originFilter === ORIGIN_FILTER_NAO_IDENT) q = q.eq('origin_source', 'nao_identificado');
    const { data, error } = await q;
    setLoading(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao carregar contatos', description: error.message });
      setContacts([]);
      return;
    }
    setContacts(data || []);
  }, [effectiveClienteId, originFilter, toast]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  useEffect(() => {
    if (!effectiveClienteId) return;
    const channel = supabase
      .channel(`contatos:${effectiveClienteId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cliente_whatsapp_contact', filter: `cliente_id=eq.${effectiveClienteId}` },
        (payload) => {
          loadContacts();
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [effectiveClienteId, loadContacts]);

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
      .select('from_jid, tracking_data, origin_source, utm_source, utm_medium, utm_campaign, utm_content, utm_term')
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
    });
    const { error: upsertError } = await supabase
      .from('cliente_whatsapp_contact')
      .upsert(toUpsert, {
        onConflict: 'cliente_id,from_jid',
        updateColumns: ['phone', 'sender_name', 'origin_source', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'tracking_data', 'last_message_at', 'updated_at'],
      });
    if (upsertError) {
      toast({ variant: 'destructive', title: 'Erro ao salvar contatos', description: upsertError.message });
      setFillFromWebhookLogLoading(false);
      return;
    }
    toast({ title: 'Contatos preenchidos', description: `${toUpsert.length} contato(s) adicionados/atualizados a partir dos eventos do webhook.` });
    loadContacts();
    setFillFromWebhookLogLoading(false);
  }, [effectiveClienteId, loadContacts, toast]);

  const filteredContacts = searchTerm.trim()
    ? contacts.filter((c) => {
        const term = searchTerm.toLowerCase();
        const name = (c.sender_name || '').toLowerCase();
        const phone = (c.phone || '').replace(/\D/g, '');
        const termNorm = term.replace(/\D/g, '');
        return name.includes(term) || (c.phone || '').toLowerCase().includes(term) || (termNorm && phone.includes(termNorm));
      })
    : contacts;

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

  const metaCount = contacts.filter((c) => c.origin_source === 'meta_ads').length;
  const googleAdsCount = contacts.filter((c) => c.origin_source === 'google_ads').length;
  const outrasOrigensCount = contacts.filter((c) => c.origin_source && !['meta_ads', 'nao_identificado', 'google_ads'].includes(c.origin_source)).length;
  const naoIdentCount = contacts.filter((c) => c.origin_source === 'nao_identificado').length;

  const exportContacts = useCallback(() => {
    const headers = ['Nome', 'Telefone', 'Origem', 'Primeira mensagem', 'Última mensagem', 'Rastreio'];
    const escape = (v) => (v == null ? '' : String(v).replace(/"/g, '""'));
    const row = (c) => {
      const name = (c.tracking_data?.lead_name && String(c.tracking_data.lead_name).trim()) || c.sender_name || c.phone || c.from_jid || '';
      const origin = c.origin_source === 'meta_ads' ? 'Meta Ads' : c.origin_source === 'google_ads' ? 'Google Ads' : 'Não rastreada';
      const rastreio = [c.utm_source, c.utm_campaign].filter(Boolean).join(' · ') || (c.origin_source === 'meta_ads' ? 'Meta Ads' : '—');
      return [name, c.phone || c.from_jid || '', origin, formatDate(c.first_seen_at), formatDate(c.last_message_at), rastreio].map(escape).map((v) => `"${v}"`).join(',');
    };
    const csv = [headers.map((h) => `"${h}"`).join(','), ...filteredContacts.map(row)].join('\r\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contatos-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Exportado', description: `${filteredContacts.length} contato(s) exportados.` });
  }, [filteredContacts, toast]);

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
      <div className={embeddedInCrm ? 'space-y-6' : 'space-y-5'}>
        <div className="flex flex-col gap-4">
          {embeddedInCrm && isAdminWithoutCliente && clientesForAdmin?.length > 0 && (
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
          <div className={`flex flex-col sm:flex-row sm:items-center gap-3 ${embeddedInCrm && isAdminWithoutCliente ? 'sm:justify-end' : 'sm:justify-between'}`}>
            {(!embeddedInCrm || !isAdminWithoutCliente) && (
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
                Contatos
              </h1>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {!embeddedInCrm && isAdminWithoutCliente && clientesForAdmin?.length > 0 && (
                <Select value={selectedClienteId || ''} onValueChange={(v) => setSelectedClienteId(v || null)}>
                  <SelectTrigger className="w-[200px] h-9">
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
              <Button variant="outline" size="sm" className="h-9 rounded-lg gap-1.5" onClick={exportContacts} disabled={loading || filteredContacts.length === 0}>
                <FileDown className="h-4 w-4" />
                Exportar contatos
              </Button>
              <Button variant="outline" size="sm" className="h-9 rounded-lg gap-1.5" onClick={() => openExportFunnelForContacts(filteredContacts)} disabled={loading || filteredContacts.length === 0} title="Exportar todos para um funil">
                <Send className="h-4 w-4" />
                Exportar para funil
              </Button>
              {selectedContactIds.size > 0 && (
                <Button variant="default" size="sm" className="h-9 rounded-lg gap-1.5" onClick={() => openExportFunnelForContacts(filteredContacts.filter((c) => selectedContactIds.has(c.id)))}>
                  <Send className="h-4 w-4" />
                  Exportar {selectedContactIds.size} selecionado(s)
                </Button>
              )}
              <Button variant="outline" size="sm" className="h-9 rounded-lg gap-1.5" onClick={fillContactsFromWebhookLog} disabled={loading || fillFromWebhookLogLoading}>
                {fillFromWebhookLogLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Importar contatos
              </Button>
              <Button size="sm" className="h-9 rounded-lg gap-1.5 bg-blue-600 hover:bg-blue-700 text-white">
                <PlusCircle className="h-4 w-4" />
                Novo
              </Button>
            </div>
          </div>
          {/* Linha Pesquisar + filtros */}
          {effectiveClienteId && (
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1 max-w-md">
                <Input
                  placeholder="Pesquisar"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-10 pr-10 rounded-lg bg-muted/30 border-gray-200/80 dark:border-gray-700/50"
                />
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={originFilter} onValueChange={setOriginFilter}>
                  <SelectTrigger className="w-[180px] h-10 rounded-lg border-gray-200/80 dark:border-gray-700/50">
                    <Filter className="h-4 w-4 mr-1.5" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ORIGIN_FILTER_ALL}>Todos ({contacts.length})</SelectItem>
                    <SelectItem value={ORIGIN_FILTER_META}>Meta Ads ({metaCount})</SelectItem>
                    <SelectItem value={ORIGIN_FILTER_NAO_IDENT}>Não identificado ({naoIdentCount})</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" className="h-10 rounded-lg" onClick={loadContacts} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Atualizar
                </Button>
              </div>
            </div>
          )}
        </div>

        {!effectiveClienteId ? (
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
              <div className="p-5 pb-4 border-b border-slate-200/60 dark:border-slate-700/50">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                <div className="rounded-xl border border-slate-200/50 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-900/30 p-5 flex items-center gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-muted">
                    <MessageCircle className="h-8 w-8 text-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">Total</p>
                    <p className="text-xl font-semibold tabular-nums">{contacts.length}</p>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200/50 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-900/30 p-5 flex items-center gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center">
                    <MetaLogoIcon className="h-14 w-14" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">Meta Ads</p>
                    <p className="text-xl font-semibold tabular-nums">{metaCount}</p>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200/50 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-900/30 p-5 flex items-center gap-4">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center">
                    <GoogleAdsIcon className="h-20 w-20" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">Google Ads</p>
                    <p className="text-xl font-semibold tabular-nums">{googleAdsCount}</p>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200/50 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-900/30 p-5 flex items-center gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
                    <Globe className="h-8 w-8 text-slate-600 dark:text-slate-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">Outras origens</p>
                    <p className="text-xl font-semibold tabular-nums">{outrasOrigensCount}</p>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200/50 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-900/30 p-5 flex items-center gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-orange-100 dark:bg-orange-900/30">
                    <UserX className="h-8 w-8 text-orange-700 dark:text-orange-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">Não rastreada</p>
                    <p className="text-xl font-semibold tabular-nums">{naoIdentCount}</p>
                  </div>
                </div>
              </div>
            </div>
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredContacts.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="text-sm text-muted-foreground">Nenhum contato encontrado.</p>
                  <p className="text-xs text-muted-foreground mt-1">Use &quot;Importar contatos&quot; para preencher a partir dos eventos do webhook.</p>
                </div>
              ) : (
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
                        <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Primeira mensagem</th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Última mensagem</th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Conta</th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider w-24">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200/60 dark:divide-gray-700/50">
                        {filteredContacts.map((c) => {
                          const displayName = (c.tracking_data?.lead_name && String(c.tracking_data.lead_name).trim()) || c.sender_name || c.phone || c.from_jid || '—';
                          return (
                          <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                            <td className="py-3 px-2">
                              <Checkbox
                                checked={selectedContactIds.has(c.id)}
                                onCheckedChange={() => toggleContactSelection(c.id)}
                                aria-label={`Selecionar ${displayName}`}
                              />
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
                              </div>
                            </td>
                            <td className="py-3 px-4 text-muted-foreground font-mono text-xs">
                              {c.phone || c.from_jid || '—'}
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                                  c.origin_source === 'meta_ads'
                                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                                    : 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300'
                                }`}
                              >
                                {c.origin_source === 'meta_ads' ? (
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
                            <td className="py-3 px-4 text-muted-foreground text-xs hidden sm:table-cell">
                              {formatDate(c.first_seen_at)}
                            </td>
                            <td className="py-3 px-4 text-muted-foreground text-xs">
                              {formatDate(c.last_message_at)}
                            </td>
                            <td className="py-3 px-4 hidden sm:table-cell text-muted-foreground text-xs">
                              {c.instance_name?.trim() || '—'}
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-0.5">
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
                              </div>
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                  </table>
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
                        const effectiveSourceId = displayTracking.tracking_data.source_id ?? eventsByDate[0]?.source_id ?? null;
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
                                      loadContacts();
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
                                      loadContacts();
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
                            last_message_at: ev.created_at || now,
                            updated_at: now,
                          };
                          const { error } = await supabase
                            .from('cliente_whatsapp_contact')
                            .upsert(row, {
                              onConflict: 'cliente_id,from_jid',
                              updateColumns: ['phone', 'sender_name', 'origin_source', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'tracking_data', 'last_message_at', 'updated_at'],
                            });
                          setApplyTrackingLoading(false);
                          if (error) {
                            toast({ variant: 'destructive', title: 'Erro ao aplicar rastreamento', description: error.message });
                            return;
                          }
                          toast({ title: 'Rastreamento aplicado', description: existingHasTracking ? 'Contato atualizado (dados de rastreamento e Meta preservados).' : 'Contato atualizado com o rastreamento do evento mais recente.' });
                          loadContacts();
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
                    last_message_at: ev.created_at || now,
                    updated_at: now,
                  };
                  const { error } = await supabase
                    .from('cliente_whatsapp_contact')
                    .upsert(row, {
                      onConflict: 'cliente_id,from_jid',
                      updateColumns: ['phone', 'sender_name', 'origin_source', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'tracking_data', 'last_message_at', 'updated_at'],
                    });
                  setApplyTrackingLoading(false);
                  if (error) {
                    toast({ variant: 'destructive', title: 'Erro ao aplicar rastreamento', description: error.message });
                    return;
                  }
                  toast({ title: 'Rastreamento aplicado', description: existingHasTracking ? 'O contato manteve os dados de rastreamento e Meta.' : 'O contato foi atualizado com os dados de rastreamento deste evento.' });
                  setEventBodyViewing(null);
                  loadContacts();
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
