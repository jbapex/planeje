import React, { useState, useEffect } from 'react';
import { useClienteCrmSettings, getStatusText } from '@/contexts/ClienteCrmSettingsContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Phone, Mail, Calendar, Edit, ArrowRightLeft, Activity, Loader2, Tag, ShoppingCart, Pencil, Check, X, FileText, Inbox, MessageCircle, Copy, MoreHorizontal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { buildContactTrackingFromRawPayload, extractPhoneAndNameFromRawPayload } from '@/lib/contactFromWebhookPayload';
import { useLeadVendas } from '@/hooks/useLeadVendas';
import RegisterSaleModal from '@/components/crm/RegisterSaleModal';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

/**
 * Conteúdo do detalhe do lead (blocos Contato, Comercial, Vendas, etc. + edição inline).
 * Usado tanto no LeadDetailModal quanto na LeadDetailPage.
 */
const EMPTY_PLACEHOLDER = 'Não informado';

const LeadDetailContent = ({ lead, onClose, onEdit, onUpdateLead, members = [], pipelines = [], onTransfer, isOpen = true, isPage = false }) => {
  const { settings } = useClienteCrmSettings();
  const { toast } = useToast();
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferPipelineId, setTransferPipelineId] = useState('');
  const [transferStageId, setTransferStageId] = useState('');
  const [transferStages, setTransferStages] = useState([]);
  const [loadingStages, setLoadingStages] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [webhookEvents, setWebhookEvents] = useState([]);
  const [webhookEventsLoading, setWebhookEventsLoading] = useState(false);
  const [webhookBodyViewing, setWebhookBodyViewing] = useState(null);
  const [applyTrackingLoading, setApplyTrackingLoading] = useState(false);
  const [registerSaleOpen, setRegisterSaleOpen] = useState(false);
  const [editSaleVenda, setEditSaleVenda] = useState(null);
  const [editingField, setEditingField] = useState(null);
  const [inlineValue, setInlineValue] = useState('');
  const [savingField, setSavingField] = useState(false);
  const [quickNote, setQuickNote] = useState('');
  const [quickNoteSaving, setQuickNoteSaving] = useState(false);
  const [quickNoteOpen, setQuickNoteOpen] = useState(false);
  const [lastNoteAddedAt, setLastNoteAddedAt] = useState(null);
  const [metaAdDetailsLoading, setMetaAdDetailsLoading] = useState(false);
  const [metaAdDetailsError, setMetaAdDetailsError] = useState(null);
  const { vendas, loading: vendasLoading, refetch: refetchVendas } = useLeadVendas(lead?.id);

  const effectiveSourceId = (lead?.tracking_data && typeof lead.tracking_data === 'object')
    ? (lead.tracking_data.source_id ?? lead.tracking_data.events_by_date?.[0]?.source_id ?? null)
    : null;
  const hasMetaTracking = lead?.origem === 'Meta Ads' ||
    !!(lead?.utm_campaign || lead?.utm_source || lead?.utm_medium || lead?.utm_content || lead?.utm_term) ||
    (lead?.tracking_data && typeof lead.tracking_data === 'object' && Object.keys(lead.tracking_data).length > 0);

  const origins = settings?.origins || [];
  const subOrigins = (lead?.origem && settings?.sub_origins?.[lead.origem]) || [];
  const sellers = settings?.sellers || [];

  useEffect(() => {
    if (!transferPipelineId) {
      setTransferStages([]);
      setTransferStageId('');
      return;
    }
    setLoadingStages(true);
    supabase
      .from('crm_stages')
      .select('*')
      .eq('pipeline_id', transferPipelineId)
      .order('ordem', { ascending: true })
      .then(({ data }) => {
        setTransferStages(data || []);
        const first = (data || [])[0];
        setTransferStageId(first?.id || '');
      })
      .finally(() => setLoadingStages(false));
  }, [transferPipelineId]);

  useEffect(() => {
    if (isOpen === false) {
      setShowTransfer(false);
      setTransferPipelineId('');
      setTransferStageId('');
      setWebhookBodyViewing(null);
      setEditingField(null);
      setMetaAdDetailsError(null);
    }
  }, [isOpen]);

  const fetchMetaAdDetailsForLead = async () => {
    const sourceId = (lead?.tracking_data && typeof lead.tracking_data === 'object')
      ? (lead.tracking_data.source_id ?? lead.tracking_data.events_by_date?.[0]?.source_id ?? null)
      : null;
    if (!sourceId || typeof sourceId !== 'string' || !sourceId.trim() || !onUpdateLead || !lead?.id) return;
    setMetaAdDetailsLoading(true);
    setMetaAdDetailsError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('meta-ads-api', {
        body: { action: 'get-ad-by-id', adId: sourceId.trim() },
      });
      if (fnError) {
        setMetaAdDetailsError('Não foi possível carregar dados deste anúncio no Meta.');
        return;
      }
      if (data?.error) {
        setMetaAdDetailsError('Não foi possível carregar dados deste anúncio no Meta.');
        return;
      }
      if (data?.ad) {
        const fetchedAt = new Date().toISOString();
        const metaEntry = { accountName: data.accountName ?? null, ad: data.ad, fetched_at: fetchedAt };
        const prev = lead.tracking_data && typeof lead.tracking_data === 'object' ? lead.tracking_data : {};
        const history = [...(Array.isArray(prev.meta_ad_details_history) ? prev.meta_ad_details_history : []), { fetched_at: fetchedAt, accountName: data.accountName, ad: data.ad }].slice(-30);
        const nextTracking = { ...prev, meta_ad_details: metaEntry, meta_ad_details_history: history };
        await onUpdateLead(lead.id, { tracking_data: nextTracking });
      }
    } catch {
      setMetaAdDetailsError('Não foi possível carregar dados deste anúncio no Meta.');
    } finally {
      setMetaAdDetailsLoading(false);
    }
  };

  const startEdit = (field, currentValue) => {
    setEditingField(field);
    setInlineValue(currentValue !== undefined && currentValue !== null ? String(currentValue) : '');
  };

  const cancelEdit = () => {
    setEditingField(null);
    setInlineValue('');
  };

  const saveInlineField = async (field, value) => {
    if (!onUpdateLead || !lead?.id) return;
    setSavingField(true);
    try {
      let payload = {};
      if (field === 'email') payload = { email: (value || '').trim() || null };
      else if (field === 'origem') payload = { origem: (value || '').trim() || null, sub_origem: null };
      else if (field === 'sub_origem') payload = { sub_origem: (value || '').trim() || null };
      else if (field === 'vendedor') payload = { vendedor: (value || '').trim() || null };
      else if (field === 'responsavel_id') payload = { responsavel_id: value || null };
      else if (field === 'valor') payload = { valor: parseFloat(String(value).replace(',', '.')) || 0 };
      const result = await onUpdateLead(lead.id, payload);
      if (result?.error) throw result.error;
      setEditingField(null);
      setInlineValue('');
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: err?.message || 'Tente novamente.' });
    } finally {
      setSavingField(false);
    }
  };

  useEffect(() => {
    if (!lead?.id) {
      setWebhookEvents([]);
      return;
    }
    setWebhookEventsLoading(true);
    supabase
      .from('lead_webhook_event')
      .select('id, webhook_log_id, cliente_whatsapp_webhook_log(created_at, source, body_preview, status, raw_payload)')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        const rows = (data || []).map((r) => ({
          id: r.id,
          webhook_log_id: r.webhook_log_id,
          ...(r.cliente_whatsapp_webhook_log || {}),
        }));
        setWebhookEvents(rows);
      })
      .finally(() => setWebhookEventsLoading(false));
  }, [lead?.id]);

  if (!lead) return null;

  // Datas só (yyyy-MM-dd) ou com T00:00:00Z vêm do banco como “dia” — interpretar em horário local para não exibir um dia antes
  const toLocalDate = (dateString) => {
    if (!dateString) return null;
    const s = String(dateString).trim();
    const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [, y, m, d] = match.map(Number);
      const date = new Date(y, m - 1, d);
      return isNaN(date.getTime()) ? new Date(dateString) : date;
    }
    return new Date(dateString);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const d = toLocalDate(dateString);
    return isNaN(d.getTime()) ? '-' : format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  };

  const formatDateShort = (dateString) => {
    if (!dateString) return '-';
    const d = toLocalDate(dateString);
    return isNaN(d.getTime()) ? '-' : format(d, 'dd/MM/yyyy', { locale: ptBR });
  };

  const renderInlineRow = (field, label, readValue, editValue) => (
    <div className={isPage ? 'grid grid-cols-[minmax(140px,auto)_1fr_auto] items-center gap-2 py-1.5' : 'flex items-center justify-between gap-2 py-1'}>
      <span className="text-muted-foreground text-sm shrink-0">{label}</span>
      <span className="text-sm truncate">{readValue}</span>
      {onUpdateLead && (
        <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0 opacity-70" onClick={() => startEdit(field, editValue)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );

  const stageColor = lead.stage?.color || undefined;
  const pipelineName = lead.pipeline?.nome ? (lead.pipeline.nome || '').replace(/_/g, ' ') : '';
  const stageName = lead.stage?.nome ? (lead.stage.nome || '').replace(/_/g, ' ') : '';

  const missingFields = [];
  if (!lead.email?.trim()) missingFields.push('e-mail');
  if (!lead.vendedor?.trim() && !lead.responsavel_id) missingFields.push('vendedor');
  if (lead.origem && subOrigins.length > 0 && !lead.sub_origem?.trim()) missingFields.push('suborigem');
  const showIncompleteAlert = isPage && missingFields.length > 0;

  const telNumber = (lead.whatsapp || '').replace(/\D/g, '');
  const telHref = telNumber ? `tel:+55${telNumber.length === 11 ? telNumber : '41' + telNumber}` : '';
  const whatsappHref = telNumber ? `https://wa.me/55${telNumber.length === 11 ? telNumber : telNumber}` : '';

  const copyNumber = () => {
    if (!lead.whatsapp) return;
    navigator.clipboard.writeText(lead.whatsapp).then(() => toast({ title: 'Número copiado' }));
  };

  const submitQuickNote = async () => {
    const text = (quickNote || '').trim();
    if (!text || !onUpdateLead || !lead?.id) return;
    setQuickNoteSaving(true);
    const prefix = lead.observacoes ? `${lead.observacoes}\n` : '';
    const line = `[${format(new Date(), 'dd/MM HH:mm', { locale: ptBR })}] ${text}`;
    const result = await onUpdateLead(lead.id, { observacoes: prefix + line });
    setQuickNoteSaving(false);
    if (!result?.error) {
      setQuickNote('');
      setQuickNoteOpen(false);
      setLastNoteAddedAt(new Date());
      toast({ title: 'Nota adicionada' });
    }
  };

  const lastInteractionAt = (() => {
    const dates = [lead.updated_at].filter(Boolean);
    if (webhookEvents.length > 0 && webhookEvents[0].created_at) dates.push(webhookEvents[0].created_at);
    if (dates.length === 0) return null;
    return new Date(Math.max(...dates.map((d) => new Date(d).getTime())));
  })();

  return (
    <>
      <div className={isPage ? 'rounded-lg border bg-muted/20 p-4 mb-4' : 'flex items-center gap-3 mb-4'}>
        {isPage ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-14 w-14">
                  <AvatarImage src={lead.profile_pic_url} />
                  <AvatarFallback className="text-lg">{lead.nome ? lead.nome.charAt(0).toUpperCase() : '?'}</AvatarFallback>
                </Avatar>
                <div>
                  <h2 className="text-xl font-semibold">{lead.nome || EMPTY_PLACEHOLDER}</h2>
                  {lead.whatsapp && (
                    <p className="text-sm text-muted-foreground mt-0.5">+55 {lead.whatsapp.replace(/\D/g, '').replace(/(\d{2})(\d{5})(\d{4})/, '$1 $2-$3')}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-xs font-medium" style={stageColor ? { backgroundColor: `${stageColor}20`, color: stageColor, borderColor: stageColor } : undefined}>
                      {getStatusText(lead.status)}
                    </Badge>
                    {(pipelineName || stageName) && (
                      <span className="text-sm text-muted-foreground">
                        {[pipelineName, stageName].filter(Boolean).join(' › ')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {whatsappHref && (
                  <Button size="sm" className="bg-[#25D366] hover:bg-[#20BD5A] text-white" asChild>
                    <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="h-4 w-4 mr-1.5" />
                      WhatsApp
                    </a>
                  </Button>
                )}
                {telHref && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={telHref}><Phone className="h-4 w-4 mr-1.5" />Ligar</a>
                  </Button>
                )}
                {lead.whatsapp && (
                  <Button variant="outline" size="sm" onClick={copyNumber}>
                    <Copy className="h-4 w-4 mr-1.5" />
                    Copiar número
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => setQuickNoteOpen(true)}>
                  <FileText className="h-4 w-4 mr-1.5" />
                  Nova nota
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => { onEdit?.(lead); onClose?.(); }}>Editar</DropdownMenuItem>
                    {pipelines.length > 1 && onTransfer && (
                      <DropdownMenuItem onClick={() => setShowTransfer(true)}>Transferir</DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        ) : (
          <>
            <Avatar className="h-12 w-12">
              <AvatarImage src={lead.profile_pic_url} />
              <AvatarFallback>{lead.nome ? lead.nome.charAt(0).toUpperCase() : '?'}</AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-lg font-semibold">{lead.nome}</h2>
              <p className="text-sm text-muted-foreground">{getStatusText(lead.status)}</p>
            </div>
          </>
        )}
      </div>

      {showIncompleteAlert && (
        <Alert className="mb-4 border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-200 [&>svg]:text-amber-600">
          <AlertTitle>Cadastro incompleto</AlertTitle>
          <AlertDescription>Faltam: {missingFields.join(', ')}.</AlertDescription>
        </Alert>
      )}

      {quickNoteOpen && (
        <Dialog open={quickNoteOpen} onOpenChange={setQuickNoteOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Nota rápida</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                placeholder="Adicionar uma nota rápida..."
                value={quickNote}
                onChange={(e) => setQuickNote(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitQuickNote()}
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setQuickNoteOpen(false)}>Cancelar</Button>
                <Button onClick={submitQuickNote} disabled={quickNoteSaving || !quickNote.trim()}>
                  {quickNoteSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {isPage ? (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(320px,400px)_1fr] gap-6 py-2 min-h-0">
          {/* Coluna esquerda: cadastro do lead */}
          <div className="space-y-5 min-h-0">
            <Card>
              <CardHeader className="p-4">
                <CardTitle className="text-base font-medium">Dados do Lead</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                  <a href={whatsappHref || '#'} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">
                    {lead.whatsapp || EMPTY_PLACEHOLDER}
                  </a>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                  {lead.email ? (
                    <span>{lead.email}</span>
                  ) : (
                    <Button variant="ghost" size="sm" className="h-auto p-0 text-primary" onClick={() => onEdit?.(lead)}>
                      Adicionar e-mail
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>Entrada: {lead.data_entrada ? formatDateShort(lead.data_entrada) : EMPTY_PLACEHOLDER}</span>
                </div>
                {lead.agendamento && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span>Agendamento: {formatDate(lead.agendamento)}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <Tag className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Button variant="ghost" size="sm" className="h-auto p-0 text-primary" onClick={() => onEdit?.(lead)}>
                    Adicionar etiqueta
                  </Button>
                </div>
                {lastInteractionAt && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5" />
                    Última interação {formatDistanceToNow(lastInteractionAt, { addSuffix: true, locale: ptBR })}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-4">
                <CardTitle className="text-base font-medium">Comercial</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 pt-0">
                {editingField === 'origem' ? (
                  <div className="flex items-center gap-2 py-1">
                    <Label className="text-muted-foreground text-sm shrink-0">Fonte / Origem</Label>
                    <Select value={inlineValue} onValueChange={setInlineValue}>
                      <SelectTrigger className="h-9 flex-1"><SelectValue placeholder="Origem" /></SelectTrigger>
                      <SelectContent>
                        {origins.map((o) => (<SelectItem key={o} value={o}>{o}</SelectItem>))}
                      </SelectContent>
                    </Select>
                    <Button size="icon" variant="ghost" className="h-8 w-8" disabled={savingField} onClick={() => saveInlineField('origem', inlineValue)}><Check className="h-4 w-4 text-green-600" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancelEdit}><X className="h-4 w-4" /></Button>
                  </div>
                ) : (
                  renderInlineRow('origem', 'Fonte / Origem', lead.origem || EMPTY_PLACEHOLDER, lead.origem ?? '')
                )}
                {editingField === 'sub_origem' ? (
                  <div className="flex items-center gap-2 py-1">
                    <Label className="text-muted-foreground text-sm shrink-0">Sub origem</Label>
                    <Select value={inlineValue} onValueChange={setInlineValue}>
                      <SelectTrigger className="h-9 flex-1"><SelectValue placeholder="Sub origem" /></SelectTrigger>
                      <SelectContent>
                        {subOrigins.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                      </SelectContent>
                    </Select>
                    <Button size="icon" variant="ghost" className="h-8 w-8" disabled={savingField} onClick={() => saveInlineField('sub_origem', inlineValue)}><Check className="h-4 w-4 text-green-600" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancelEdit}><X className="h-4 w-4" /></Button>
                  </div>
                ) : (
                  renderInlineRow('sub_origem', 'Sub origem', lead.sub_origem || EMPTY_PLACEHOLDER, lead.sub_origem ?? '')
                )}
                {editingField === 'vendedor' ? (
                  <div className="flex items-center gap-2 py-1">
                    <Label className="text-muted-foreground text-sm shrink-0">Vendedor</Label>
                    {sellers.length > 0 ? (
                      <Select value={inlineValue} onValueChange={setInlineValue}>
                        <SelectTrigger className="h-9 flex-1"><SelectValue placeholder="Vendedor" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">—</SelectItem>
                          {sellers.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input className="h-9 flex-1" value={inlineValue} onChange={(e) => setInlineValue(e.target.value)} placeholder="Vendedor" />
                    )}
                    <Button size="icon" variant="ghost" className="h-8 w-8" disabled={savingField} onClick={() => saveInlineField('vendedor', inlineValue)}><Check className="h-4 w-4 text-green-600" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancelEdit}><X className="h-4 w-4" /></Button>
                  </div>
                ) : (
                  renderInlineRow('vendedor', 'Vendedor', lead.vendedor || EMPTY_PLACEHOLDER, lead.vendedor ?? '')
                )}
                {editingField === 'responsavel_id' ? (
                  <div className="flex items-center gap-2 py-1">
                    <Label className="text-muted-foreground text-sm shrink-0">Responsável</Label>
                    <Select value={inlineValue} onValueChange={setInlineValue}>
                      <SelectTrigger className="h-9 flex-1"><SelectValue placeholder="Responsável" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">—</SelectItem>
                        {(members || []).map((m) => (<SelectItem key={m.id} value={m.id}>{m.full_name || m.email || m.id}</SelectItem>))}
                      </SelectContent>
                    </Select>
                    <Button size="icon" variant="ghost" className="h-8 w-8" disabled={savingField} onClick={() => saveInlineField('responsavel_id', inlineValue)}><Check className="h-4 w-4 text-green-600" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancelEdit}><X className="h-4 w-4" /></Button>
                  </div>
                ) : (
                  renderInlineRow('responsavel_id', 'Responsável', lead.responsavel?.full_name || EMPTY_PLACEHOLDER, lead.responsavel_id ?? '')
                )}
                {editingField === 'valor' ? (
                  <div className="flex items-center gap-2 py-1">
                    <Label className="text-muted-foreground text-sm shrink-0">Valor</Label>
                    <Input
                      type="number"
                      step={0.01}
                      className="h-9 flex-1"
                      value={inlineValue}
                      onChange={(e) => setInlineValue(e.target.value)}
                      placeholder="0"
                    />
                    <Button size="icon" variant="ghost" className="h-8 w-8" disabled={savingField} onClick={() => saveInlineField('valor', inlineValue)}><Check className="h-4 w-4 text-green-600" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancelEdit}><X className="h-4 w-4" /></Button>
                  </div>
                ) : (
                  renderInlineRow('valor', 'Valor', lead.valor != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(lead.valor)) : EMPTY_PLACEHOLDER, lead.valor ?? '')
                )}
              </CardContent>
            </Card>

            {(Array.isArray(lead.etiquetas) && lead.etiquetas.length > 0) && (
              <Card>
                <CardHeader className="p-4">
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <Tag className="h-4 w-4" /> Etiquetas
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 flex flex-wrap gap-2">
                  {(lead.etiquetas || []).map((tagName) => {
                    const def = (settings?.tags || []).find((t) => t.name === tagName || (t.name || '').replace(/_/g, ' ') === (tagName || '').replace(/_/g, ' '));
                    const color = def?.color || '#6b7280';
                    return (
                      <Badge key={tagName} variant="secondary" className="text-xs" style={{ backgroundColor: `${color}20`, color, borderColor: color }}>
                        {(tagName || '').replace(/_/g, ' ')}
                      </Badge>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="p-4">
                <CardTitle className="text-base font-medium">Observações</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {lead.observacoes ? (
                  <p className="text-sm whitespace-pre-wrap">{lead.observacoes}</p>
                ) : (
                  <div className="flex flex-col items-center justify-center py-6 text-center">
                    <FileText className="h-8 w-8 text-muted-foreground/60 mb-1.5" />
                    <p className="text-sm text-muted-foreground">Nenhuma observação</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {pipelines.length > 1 && onTransfer && (
              <Card>
                <CardContent className="p-4 space-y-3">
                  {!showTransfer ? (
                    <Button variant="outline" size="sm" className="w-full" onClick={() => setShowTransfer(true)}>
                      <ArrowRightLeft className="h-4 w-4 mr-2" />
                      Transferir para outro funil
                    </Button>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-muted-foreground">Novo funil e etapa</p>
                      <Select value={transferPipelineId} onValueChange={setTransferPipelineId}>
                        <SelectTrigger className="w-full"><SelectValue placeholder="Selecione o funil" /></SelectTrigger>
                        <SelectContent>
                          {pipelines.map((p) => (<SelectItem key={p.id} value={p.id}>{(p.nome || 'Sem nome').replace(/_/g, ' ')}</SelectItem>))}
                        </SelectContent>
                      </Select>
                      <Select value={transferStageId} onValueChange={setTransferStageId} disabled={loadingStages || !transferPipelineId}>
                        <SelectTrigger className="w-full"><SelectValue placeholder={loadingStages ? 'Carregando…' : 'Selecione a etapa'} /></SelectTrigger>
                        <SelectContent>
                          {transferStages.map((s) => (<SelectItem key={s.id} value={s.id}>{(s.nome || '').replace(/_/g, ' ')}</SelectItem>))}
                        </SelectContent>
                      </Select>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setShowTransfer(false)}>Cancelar</Button>
                        <Button
                          size="sm"
                          disabled={!transferStageId || transferring}
                          onClick={async () => {
                            const stage = transferStages.find((s) => s.id === transferStageId);
                            if (!stage) return;
                            setTransferring(true);
                            await onTransfer(lead, { pipeline_id: transferPipelineId, stage_id: transferStageId, stage_nome: stage.nome });
                            setTransferring(false);
                            if (onClose) onClose();
                          }}
                        >
                          {transferring ? 'Transferindo…' : 'Transferir'}
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="p-4">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Atividades
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="Adicionar uma nota rápida..."
                    className="flex-1"
                    value={quickNote}
                    onChange={(e) => setQuickNote(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), submitQuickNote())}
                  />
                  <Button size="sm" onClick={submitQuickNote} disabled={quickNoteSaving || !quickNote.trim()}>
                    {quickNoteSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar'}
                  </Button>
                </div>
                {webhookEventsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando…
                  </div>
                ) : (webhookEvents.length === 0 && !lastInteractionAt && !lastNoteAddedAt) ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Inbox className="h-10 w-10 text-muted-foreground mb-2" />
                    <p className="text-sm font-medium text-muted-foreground">Nenhuma atividade registrada</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Adicione uma nota rápida ou aguarde eventos de integração.</p>
                  </div>
                ) : (
                  <div className="rounded-md border bg-muted/30 max-h-64 overflow-y-auto divide-y">
                    {lastNoteAddedAt && (
                      <div className="p-3 flex items-start gap-2 text-sm">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium">Nota adicionada</p>
                          <p className="text-xs text-muted-foreground">{formatDistanceToNow(lastNoteAddedAt, { addSuffix: true, locale: ptBR })}</p>
                        </div>
                      </div>
                    )}
                    {lastInteractionAt && (
                      <div className="p-3 flex items-start gap-2 text-sm">
                        <Activity className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium">Última interação</p>
                          <p className="text-xs text-muted-foreground">{formatDistanceToNow(lastInteractionAt, { addSuffix: true, locale: ptBR })}</p>
                        </div>
                      </div>
                    )}
                    {webhookEvents.map((ev) => (
                      <div key={ev.id || ev.webhook_log_id} className="p-3 flex items-start gap-2 text-sm">
                        <MessageCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-muted-foreground">{ev.created_at ? formatDistanceToNow(new Date(ev.created_at), { addSuffix: true, locale: ptBR }) : '-'}</p>
                          {ev.body_preview && <p className="text-xs mt-0.5 line-clamp-2">{ev.body_preview}</p>}
                          {ev.raw_payload != null && (
                            <Button variant="ghost" size="sm" className="h-6 text-xs mt-1" onClick={() => setWebhookBodyViewing(ev)}>Ver corpo</Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Coluna direita: abas Oportunidade, Rastreio, Tarefas */}
          <div className="min-h-0 flex flex-col">
            <Tabs defaultValue="oportunidade" className="flex flex-col min-h-0">
              <TabsList className="w-full grid grid-cols-3">
                <TabsTrigger value="oportunidade">Oportunidade</TabsTrigger>
                <TabsTrigger value="rastreio">Rastreio</TabsTrigger>
                <TabsTrigger value="tarefas">Tarefas</TabsTrigger>
              </TabsList>
              <TabsContent value="oportunidade" className="flex-1 mt-4 min-h-0">
                <Card>
                  <CardHeader className="p-4 flex flex-row items-center justify-between gap-2 space-y-0">
                    <CardTitle className="text-base font-medium flex items-center gap-2">
                      <ShoppingCart className="h-4 w-4" />
                      Vendas
                    </CardTitle>
                    <Button variant="outline" size="sm" className="h-8 text-xs shrink-0" onClick={() => setRegisterSaleOpen(true)}>
                      Registrar venda
                    </Button>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {vendasLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Carregando…
                      </div>
                    ) : vendas.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <ShoppingCart className="h-10 w-10 text-muted-foreground mb-2" />
                        <p className="text-sm font-medium text-muted-foreground">Nenhuma venda registrada</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Use o botão acima para registrar.</p>
                      </div>
                    ) : (
                      <div className="rounded-md border bg-muted/30 divide-y max-h-48 overflow-y-auto">
                        {vendas.map((v) => (
                          <div key={v.id} className="p-3 text-sm">
                            <div className="flex justify-between items-center gap-2">
                              <span className="font-medium">{formatDateShort(v.data_venda)}</span>
                              <div className="flex items-center gap-1 shrink-0">
                                <span>{typeof v.valor_total === 'number' ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v.valor_total) : v.valor_total}</span>
                                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => setEditSaleVenda(v)} aria-label="Editar venda">
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                            {v.observacoes && <p className="text-xs text-muted-foreground mt-1">{v.observacoes}</p>}
                            {Array.isArray(v.crm_venda_itens) && v.crm_venda_itens.length > 0 && (
                              <ul className="mt-2 text-xs text-muted-foreground space-y-0.5">
                                {v.crm_venda_itens.map((it) => (
                                  <li key={it.id}>
                                    {(it.product?.name || it.service?.name || it.descricao || 'Item')}{it.item_tipo === 'serviço' ? ' (serviço)' : ''} × {it.quantidade} = {typeof it.valor_total === 'number' ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(it.valor_total) : it.valor_total}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="rastreio" className="flex-1 mt-4 min-h-0 space-y-4">
                <Card>
                  <CardHeader className="p-4">
                    <CardTitle className="text-base font-medium">Dados Meta / Rastreio</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 pt-0">
                    {hasMetaTracking ? (
                      <>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                          {lead.utm_campaign && (<><span className="text-muted-foreground">Campanha</span><span>{lead.utm_campaign}</span></>)}
                          {lead.utm_source && (<><span className="text-muted-foreground">Fonte (utm_source)</span><span>{lead.utm_source}</span></>)}
                          {lead.utm_medium && (<><span className="text-muted-foreground">Meio (utm_medium)</span><span>{lead.utm_medium}</span></>)}
                          {lead.utm_content && (<><span className="text-muted-foreground">Conteúdo (utm_content)</span><span>{lead.utm_content}</span></>)}
                          {lead.utm_term && (<><span className="text-muted-foreground">Termo (utm_term)</span><span>{lead.utm_term}</span></>)}
                        </div>
                        {(lead.tracking_data?.meta_ad_details || lead.tracking_data?.campaign_name || lead.tracking_data?.ad_name) && (
                          <div className="pt-2 border-t border-border/50 space-y-1 text-sm">
                            {lead.tracking_data.meta_ad_details && typeof lead.tracking_data.meta_ad_details === 'object' && lead.tracking_data.meta_ad_details.ad && (
                              <>
                                {lead.tracking_data.meta_ad_details.accountName != null && lead.tracking_data.meta_ad_details.accountName !== '' && <p><span className="text-muted-foreground">Conta de anúncios:</span> {String(lead.tracking_data.meta_ad_details.accountName)}</p>}
                                {lead.tracking_data.meta_ad_details.ad?.campaign?.name != null && <p><span className="text-muted-foreground">Campanha:</span> {String(lead.tracking_data.meta_ad_details.ad.campaign.name)}</p>}
                                {lead.tracking_data.meta_ad_details.ad?.adset?.name != null && <p><span className="text-muted-foreground">Conjunto de anúncios:</span> {String(lead.tracking_data.meta_ad_details.ad.adset.name)}</p>}
                                {lead.tracking_data.meta_ad_details.ad?.name != null && <p><span className="text-muted-foreground">Anúncio:</span> {String(lead.tracking_data.meta_ad_details.ad.name)}</p>}
                                {(lead.tracking_data.meta_ad_details.fetched_at) && <p className="text-xs text-muted-foreground">Dados recebidos em {formatDate(lead.tracking_data.meta_ad_details.fetched_at)}</p>}
                              </>
                            )}
                            {(!lead.tracking_data.meta_ad_details?.ad) && (lead.tracking_data.campaign_name || lead.tracking_data.ad_name) && (
                              <>
                                {lead.tracking_data.campaign_name && <p><span className="text-muted-foreground">Campanha (Meta):</span> {String(lead.tracking_data.campaign_name)}</p>}
                                {lead.tracking_data.ad_name && <p><span className="text-muted-foreground">Anúncio:</span> {String(lead.tracking_data.ad_name)}</p>}
                              </>
                            )}
                          </div>
                        )}
                        {effectiveSourceId != null && effectiveSourceId !== '' && (
                          <div className="pt-2 border-t border-border/50 space-y-2">
                            {metaAdDetailsLoading && (
                              <p className="text-muted-foreground flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                                Carregando dados do Meta…
                              </p>
                            )}
                            {metaAdDetailsError && !metaAdDetailsLoading && (
                              <p className="text-destructive text-sm">{metaAdDetailsError}</p>
                            )}
                            {!metaAdDetailsLoading && !lead.tracking_data?.meta_ad_details?.ad && !metaAdDetailsError && (
                              <Button variant="outline" size="sm" onClick={fetchMetaAdDetailsForLead}>
                                <Activity className="h-4 w-4 mr-2" />
                                Carregar dados do Meta
                              </Button>
                            )}
                            {lead.tracking_data?.meta_ad_details?.ad && !metaAdDetailsLoading && (
                              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={fetchMetaAdDetailsForLead}>
                                Atualizar dados do Meta
                              </Button>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <Activity className="h-10 w-10 text-muted-foreground mb-2" />
                        <p className="text-sm font-medium text-muted-foreground">Nenhum dado de rastreio</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Dados de campanhas ou UTM aparecerão aqui.</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="p-4">
                    <CardTitle className="text-base font-medium flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      Histórico de eventos (webhook)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {webhookEventsLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Carregando…
                      </div>
                    ) : webhookEvents.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <Inbox className="h-10 w-10 text-muted-foreground mb-2" />
                        <p className="text-sm font-medium text-muted-foreground">Nenhum evento webhook vinculado</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Eventos de integração aparecerão aqui.</p>
                      </div>
                    ) : (
                      <div className="rounded-md border bg-muted/30 max-h-48 overflow-y-auto divide-y">
                        {webhookEvents.map((ev) => (
                          <div key={ev.id || ev.webhook_log_id} className="p-2 text-sm">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="text-muted-foreground shrink-0">{ev.created_at ? formatDate(ev.created_at) : '-'}</span>
                              {ev.source && <span className="text-xs px-1.5 py-0.5 rounded bg-muted font-medium">{ev.source}</span>}
                              {ev.raw_payload != null && (
                                <Button variant="ghost" size="sm" className="h-7 text-xs shrink-0" onClick={() => setWebhookBodyViewing(ev)}>
                                  Ver corpo
                                </Button>
                              )}
                            </div>
                            {ev.body_preview && <p className="text-xs mt-1 text-foreground/90 line-clamp-2">{ev.body_preview}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="tarefas" className="flex-1 mt-4">
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                    <Activity className="h-12 w-12 text-muted-foreground/60 mb-3" />
                    <p className="text-sm font-medium text-muted-foreground">Tarefas vinculadas a este lead</p>
                    <p className="text-xs text-muted-foreground mt-1">Em breve você poderá ver e criar tarefas aqui.</p>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      ) : (
      <div className="space-y-4 py-4">
        <Card>
          <CardHeader className={isPage ? 'p-4' : 'py-3'}>
            <CardTitle className={isPage ? 'text-base font-medium flex items-center gap-2' : 'text-sm font-medium flex items-center gap-1.5'}>
              <Phone className="h-4 w-4 text-muted-foreground" />
              Contato
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            <div className="flex items-center gap-3 text-sm">
              <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
              <a href={`https://wa.me/${(lead.whatsapp || '').replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                {lead.whatsapp || EMPTY_PLACEHOLDER}
              </a>
            </div>
            {editingField === 'email' ? (
              <div className="flex items-center gap-2">
                <Label htmlFor="inline-email" className="sr-only">Email</Label>
                <Input
                  id="inline-email"
                  type="email"
                  className="h-9 flex-1"
                  value={inlineValue}
                  onChange={(e) => setInlineValue(e.target.value)}
                  placeholder="Email"
                />
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" disabled={savingField} onClick={() => saveInlineField('email', inlineValue)}><Check className="h-4 w-4 text-green-600" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" disabled={savingField} onClick={cancelEdit}><X className="h-4 w-4" /></Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>{lead.email || EMPTY_PLACEHOLDER}</span>
                {onUpdateLead && (
                  <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0 opacity-70" onClick={() => startEdit('email', lead.email)}><Pencil className="h-3.5 w-3.5" /></Button>
                )}
              </div>
            )}
            <div className="flex items-center gap-3 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              <span>Entrada: {lead.data_entrada ? formatDateShort(lead.data_entrada) : EMPTY_PLACEHOLDER}</span>
            </div>
            {lead.agendamento && (
              <div className="flex items-center gap-3 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>Agendamento: {formatDate(lead.agendamento)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={isPage ? 'lg:order-3' : undefined}>
          <CardHeader className={isPage ? 'p-4' : 'py-3'}>
            <CardTitle className={isPage ? 'text-base font-medium' : 'text-sm font-medium'}>Comercial</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 pt-0">
            {editingField === 'origem' ? (
              <div className="flex items-center gap-2 py-1">
                <Label className="text-muted-foreground text-sm shrink-0">Fonte / Origem</Label>
                <Select value={inlineValue} onValueChange={setInlineValue}>
                  <SelectTrigger className="h-9 flex-1"><SelectValue placeholder="Origem" /></SelectTrigger>
                  <SelectContent>
                    {origins.map((o) => (<SelectItem key={o} value={o}>{o}</SelectItem>))}
                  </SelectContent>
                </Select>
                <Button size="icon" variant="ghost" className="h-8 w-8" disabled={savingField} onClick={() => saveInlineField('origem', inlineValue)}><Check className="h-4 w-4 text-green-600" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancelEdit}><X className="h-4 w-4" /></Button>
              </div>
            ) : (
              renderInlineRow('origem', 'Fonte / Origem', lead.origem || EMPTY_PLACEHOLDER, lead.origem ?? '')
            )}
            {editingField === 'sub_origem' ? (
              <div className="flex items-center gap-2 py-1">
                <Label className="text-muted-foreground text-sm shrink-0">Sub origem</Label>
                <Select value={inlineValue} onValueChange={setInlineValue}>
                  <SelectTrigger className="h-9 flex-1"><SelectValue placeholder="Sub origem" /></SelectTrigger>
                  <SelectContent>
                    {subOrigins.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                  </SelectContent>
                </Select>
                <Button size="icon" variant="ghost" className="h-8 w-8" disabled={savingField} onClick={() => saveInlineField('sub_origem', inlineValue)}><Check className="h-4 w-4 text-green-600" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancelEdit}><X className="h-4 w-4" /></Button>
              </div>
            ) : (
              renderInlineRow('sub_origem', 'Sub origem', lead.sub_origem || EMPTY_PLACEHOLDER, lead.sub_origem ?? '')
            )}
            {editingField === 'vendedor' ? (
              <div className="flex items-center gap-2 py-1">
                <Label className="text-muted-foreground text-sm shrink-0">Vendedor</Label>
                {sellers.length > 0 ? (
                  <Select value={inlineValue} onValueChange={setInlineValue}>
                    <SelectTrigger className="h-9 flex-1"><SelectValue placeholder="Vendedor" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">—</SelectItem>
                      {sellers.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input className="h-9 flex-1" value={inlineValue} onChange={(e) => setInlineValue(e.target.value)} placeholder="Vendedor" />
                )}
                <Button size="icon" variant="ghost" className="h-8 w-8" disabled={savingField} onClick={() => saveInlineField('vendedor', inlineValue)}><Check className="h-4 w-4 text-green-600" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancelEdit}><X className="h-4 w-4" /></Button>
              </div>
            ) : (
              renderInlineRow('vendedor', 'Vendedor', lead.vendedor || EMPTY_PLACEHOLDER, lead.vendedor ?? '')
            )}
            {editingField === 'responsavel_id' ? (
              <div className="flex items-center gap-2 py-1">
                <Label className="text-muted-foreground text-sm shrink-0">Responsável</Label>
                <Select value={inlineValue} onValueChange={setInlineValue}>
                  <SelectTrigger className="h-9 flex-1"><SelectValue placeholder="Responsável" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">—</SelectItem>
                    {(members || []).map((m) => (<SelectItem key={m.id} value={m.id}>{m.full_name || m.email || m.id}</SelectItem>))}
                  </SelectContent>
                </Select>
                <Button size="icon" variant="ghost" className="h-8 w-8" disabled={savingField} onClick={() => saveInlineField('responsavel_id', inlineValue)}><Check className="h-4 w-4 text-green-600" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancelEdit}><X className="h-4 w-4" /></Button>
              </div>
            ) : (
              renderInlineRow('responsavel_id', 'Responsável', lead.responsavel?.full_name || EMPTY_PLACEHOLDER, lead.responsavel_id ?? '')
            )}
            {editingField === 'valor' ? (
              <div className="flex items-center gap-2 py-1">
                <Label className="text-muted-foreground text-sm shrink-0">Valor</Label>
                <Input
                  type="number"
                  step={0.01}
                  className="h-9 flex-1"
                  value={inlineValue}
                  onChange={(e) => setInlineValue(e.target.value)}
                  placeholder="0"
                />
                <Button size="icon" variant="ghost" className="h-8 w-8" disabled={savingField} onClick={() => saveInlineField('valor', inlineValue)}><Check className="h-4 w-4 text-green-600" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancelEdit}><X className="h-4 w-4" /></Button>
              </div>
            ) : (
              renderInlineRow('valor', 'Valor', lead.valor != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(lead.valor)) : EMPTY_PLACEHOLDER, lead.valor ?? '')
            )}
          </CardContent>
        </Card>

        {(Array.isArray(lead.etiquetas) && lead.etiquetas.length > 0) && (
          <Card className={isPage ? 'lg:order-5' : undefined}>
            <CardHeader className={isPage ? 'p-4' : 'py-3'}>
              <CardTitle className={isPage ? 'text-base font-medium flex items-center gap-2' : 'text-sm font-medium flex items-center gap-1.5'}>
                <Tag className="h-4 w-4" /> Etiquetas
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 flex flex-wrap gap-2">
              {(lead.etiquetas || []).map((tagName) => {
                const def = (settings?.tags || []).find((t) => t.name === tagName || (t.name || '').replace(/_/g, ' ') === (tagName || '').replace(/_/g, ' '));
                const color = def?.color || '#6b7280';
                return (
                  <Badge key={tagName} variant="secondary" className="text-xs" style={{ backgroundColor: `${color}20`, color, borderColor: color }}>
                    {(tagName || '').replace(/_/g, ' ')}
                  </Badge>
                );
              })}
            </CardContent>
          </Card>
        )}

        {(isPage || hasMetaTracking) && (
          <Card className={isPage ? 'lg:order-2' : undefined}>
            <CardHeader className={isPage ? 'p-4' : 'py-3'}>
              <CardTitle className={isPage ? 'text-base font-medium' : 'text-sm font-medium'}>Dados Meta / Rastreio</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {hasMetaTracking ? (
                <>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    {lead.utm_campaign && (<><span className="text-muted-foreground">Campanha</span><span>{lead.utm_campaign}</span></>)}
                    {lead.utm_source && (<><span className="text-muted-foreground">Fonte (utm_source)</span><span>{lead.utm_source}</span></>)}
                    {lead.utm_medium && (<><span className="text-muted-foreground">Meio (utm_medium)</span><span>{lead.utm_medium}</span></>)}
                    {lead.utm_content && (<><span className="text-muted-foreground">Conteúdo (utm_content)</span><span>{lead.utm_content}</span></>)}
                    {lead.utm_term && (<><span className="text-muted-foreground">Termo (utm_term)</span><span>{lead.utm_term}</span></>)}
                  </div>
                  {(lead.tracking_data?.meta_ad_details || lead.tracking_data?.campaign_name || lead.tracking_data?.ad_name) && (
                    <div className="pt-2 border-t border-border/50 space-y-1 text-sm">
                      {lead.tracking_data.meta_ad_details && typeof lead.tracking_data.meta_ad_details === 'object' && lead.tracking_data.meta_ad_details.ad && (
                        <>
                          {lead.tracking_data.meta_ad_details.accountName != null && lead.tracking_data.meta_ad_details.accountName !== '' && <p><span className="text-muted-foreground">Conta de anúncios:</span> {String(lead.tracking_data.meta_ad_details.accountName)}</p>}
                          {lead.tracking_data.meta_ad_details.ad?.campaign?.name != null && <p><span className="text-muted-foreground">Campanha:</span> {String(lead.tracking_data.meta_ad_details.ad.campaign.name)}</p>}
                          {lead.tracking_data.meta_ad_details.ad?.adset?.name != null && <p><span className="text-muted-foreground">Conjunto de anúncios:</span> {String(lead.tracking_data.meta_ad_details.ad.adset.name)}</p>}
                          {lead.tracking_data.meta_ad_details.ad?.name != null && <p><span className="text-muted-foreground">Anúncio:</span> {String(lead.tracking_data.meta_ad_details.ad.name)}</p>}
                          {(lead.tracking_data.meta_ad_details.fetched_at) && <p className="text-xs text-muted-foreground">Dados recebidos em {formatDate(lead.tracking_data.meta_ad_details.fetched_at)}</p>}
                        </>
                      )}
                      {(!lead.tracking_data.meta_ad_details?.ad) && (lead.tracking_data.campaign_name || lead.tracking_data.ad_name) && (
                        <>
                          {lead.tracking_data.campaign_name && <p><span className="text-muted-foreground">Campanha (Meta):</span> {String(lead.tracking_data.campaign_name)}</p>}
                          {lead.tracking_data.ad_name && <p><span className="text-muted-foreground">Anúncio:</span> {String(lead.tracking_data.ad_name)}</p>}
                        </>
                      )}
                    </div>
                  )}
                  {effectiveSourceId != null && effectiveSourceId !== '' && (
                    <div className="pt-2 border-t border-border/50 space-y-2">
                      {metaAdDetailsLoading && (
                        <p className="text-muted-foreground flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                          Carregando dados do Meta…
                        </p>
                      )}
                      {metaAdDetailsError && !metaAdDetailsLoading && (
                        <p className="text-destructive text-sm">{metaAdDetailsError}</p>
                      )}
                      {!metaAdDetailsLoading && !lead.tracking_data?.meta_ad_details?.ad && !metaAdDetailsError && (
                        <Button variant="outline" size="sm" onClick={fetchMetaAdDetailsForLead}>
                          <Activity className="h-4 w-4 mr-2" />
                          Carregar dados do Meta
                        </Button>
                      )}
                      {lead.tracking_data?.meta_ad_details?.ad && !metaAdDetailsLoading && (
                        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={fetchMetaAdDetailsForLead}>
                          Atualizar dados do Meta
                        </Button>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Activity className="h-10 w-10 text-muted-foreground mb-2" />
                  <p className="text-sm font-medium text-muted-foreground">Nenhum dado de rastreio</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Dados de campanhas ou UTM aparecerão aqui.</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
        {(isPage || lead.observacoes) && (
          <Card className={isPage ? 'lg:order-7' : undefined}>
            <CardHeader className={isPage ? 'p-4' : 'py-3'}>
              <CardTitle className={isPage ? 'text-base font-medium' : 'text-sm font-medium'}>Observações</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {lead.observacoes ? (
                <p className="text-sm whitespace-pre-wrap">{lead.observacoes}</p>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <FileText className="h-8 w-8 text-muted-foreground/60 mb-1.5" />
                  <p className="text-sm text-muted-foreground">Nenhuma observação</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card className={isPage ? 'lg:order-4' : undefined}>
          <CardHeader className={isPage ? 'p-4 flex flex-row items-center justify-between gap-2 space-y-0' : 'py-3 flex flex-row items-center justify-between gap-2 space-y-0'}>
            <CardTitle className={isPage ? 'text-base font-medium flex items-center gap-2' : 'text-sm font-medium flex items-center gap-1.5'}>
              <ShoppingCart className="h-4 w-4" />
              Vendas
            </CardTitle>
            <Button variant="outline" size="sm" className="h-8 text-xs shrink-0" onClick={() => setRegisterSaleOpen(true)}>
              Registrar venda
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            {vendasLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando…
              </div>
            ) : vendas.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <ShoppingCart className="h-10 w-10 text-muted-foreground mb-2" />
                <p className="text-sm font-medium text-muted-foreground">Nenhuma venda registrada</p>
                <p className="text-xs text-muted-foreground mt-0.5">Use o botão acima para registrar.</p>
              </div>
            ) : (
              <div className="rounded-md border bg-muted/30 divide-y max-h-48 overflow-y-auto">
                {vendas.map((v) => (
                  <div key={v.id} className="p-3 text-sm">
                    <div className="flex justify-between items-center gap-2">
                      <span className="font-medium">{formatDateShort(v.data_venda)}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <span>{typeof v.valor_total === 'number' ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v.valor_total) : v.valor_total}</span>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => setEditSaleVenda(v)} aria-label="Editar venda">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    {v.observacoes && <p className="text-xs text-muted-foreground mt-1">{v.observacoes}</p>}
                    {Array.isArray(v.crm_venda_itens) && v.crm_venda_itens.length > 0 && (
                      <ul className="mt-2 text-xs text-muted-foreground space-y-0.5">
                        {v.crm_venda_itens.map((it) => (
                          <li key={it.id}>
                            {(it.product?.name || it.service?.name || it.descricao || 'Item')}{it.item_tipo === 'serviço' ? ' (serviço)' : ''} × {it.quantidade} = {typeof it.valor_total === 'number' ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(it.valor_total) : it.valor_total}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={isPage ? 'lg:order-6' : undefined}>
          <CardHeader className={isPage ? 'p-4' : 'py-3'}>
            <CardTitle className={isPage ? 'text-base font-medium flex items-center gap-2' : 'text-sm font-medium flex items-center gap-1.5'}>
              <Activity className="h-4 w-4" />
              Histórico de eventos (webhook)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {webhookEventsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando…
              </div>
            ) : webhookEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Inbox className="h-10 w-10 text-muted-foreground mb-2" />
                <p className="text-sm font-medium text-muted-foreground">Nenhum evento webhook vinculado</p>
                <p className="text-xs text-muted-foreground mt-0.5">Eventos de integração aparecerão aqui.</p>
              </div>
            ) : (
              <div className="rounded-md border bg-muted/30 max-h-48 overflow-y-auto divide-y">
                {webhookEvents.map((ev) => (
                  <div key={ev.id || ev.webhook_log_id} className="p-2 text-sm">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-muted-foreground shrink-0">{ev.created_at ? formatDate(ev.created_at) : '-'}</span>
                      {ev.source && <span className="text-xs px-1.5 py-0.5 rounded bg-muted font-medium">{ev.source}</span>}
                      {ev.raw_payload != null && (
                        <Button variant="ghost" size="sm" className="h-7 text-xs shrink-0" onClick={() => setWebhookBodyViewing(ev)}>
                          Ver corpo
                        </Button>
                      )}
                    </div>
                    {ev.body_preview && <p className="text-xs mt-1 text-foreground/90 line-clamp-2">{ev.body_preview}</p>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {pipelines.length > 1 && onTransfer && (
          <Card className={isPage ? 'lg:order-8' : undefined}>
            <CardContent className="py-3 space-y-3">
              {!showTransfer ? (
                <Button variant="outline" size="sm" className="w-full" onClick={() => setShowTransfer(true)}>
                  <ArrowRightLeft className="h-4 w-4 mr-2" />
                  Transferir para outro funil
                </Button>
              ) : (
                <>
                  <p className="text-sm font-medium text-muted-foreground">Novo funil e etapa</p>
                  <Select value={transferPipelineId} onValueChange={setTransferPipelineId}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Selecione o funil" /></SelectTrigger>
                    <SelectContent>
                      {pipelines.map((p) => (<SelectItem key={p.id} value={p.id}>{(p.nome || 'Sem nome').replace(/_/g, ' ')}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <Select value={transferStageId} onValueChange={setTransferStageId} disabled={loadingStages || !transferPipelineId}>
                    <SelectTrigger className="w-full"><SelectValue placeholder={loadingStages ? 'Carregando…' : 'Selecione a etapa'} /></SelectTrigger>
                    <SelectContent>
                      {transferStages.map((s) => (<SelectItem key={s.id} value={s.id}>{(s.nome || '').replace(/_/g, ' ')}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setShowTransfer(false)}>Cancelar</Button>
                    <Button
                      size="sm"
                      disabled={!transferStageId || transferring}
                      onClick={async () => {
                        const stage = transferStages.find((s) => s.id === transferStageId);
                        if (!stage) return;
                        setTransferring(true);
                        await onTransfer(lead, { pipeline_id: transferPipelineId, stage_id: transferStageId, stage_nome: stage.nome });
                        setTransferring(false);
                        if (onClose) onClose();
                      }}
                    >
                      {transferring ? 'Transferindo…' : 'Transferir'}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
      )}

      {!isPage && (
        <div className="flex justify-end pt-2 border-t">
          <Button variant="outline" onClick={() => { onEdit?.(lead); onClose?.(); }}>
            <Edit className="h-4 w-4 mr-2" />
            Editar
          </Button>
        </div>
      )}

      <Dialog open={!!webhookBodyViewing} onOpenChange={(open) => !open && setWebhookBodyViewing(null)}>
        <DialogContent className="max-w-xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm">Corpo do evento</DialogTitle>
            {webhookBodyViewing?.created_at && <p className="text-xs text-muted-foreground">{formatDate(webhookBodyViewing.created_at)}</p>}
          </DialogHeader>
          <div className="flex-1 min-h-[120px] max-h-[50vh] rounded-md border bg-muted/30 p-3 overflow-y-auto overflow-x-hidden">
            {webhookBodyViewing?.raw_payload != null ? (
              <pre className="text-xs font-mono whitespace-pre-wrap break-words">
                {typeof webhookBodyViewing.raw_payload === 'object' ? JSON.stringify(webhookBodyViewing.raw_payload, null, 2) : String(webhookBodyViewing.raw_payload)}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum corpo salvo.</p>
            )}
          </div>
          {lead?.cliente_id && lead?.whatsapp && webhookBodyViewing?.raw_payload != null && (
            <div className="flex justify-end gap-2 pt-3 border-t">
              <Button
                variant="default"
                size="sm"
                disabled={applyTrackingLoading}
                onClick={async () => {
                  const phoneNorm = (lead.whatsapp || '').replace(/\D/g, '').trim();
                  const fromJid = phoneNorm ? `${phoneNorm}@s.whatsapp.net` : null;
                  if (!fromJid) return;
                  setApplyTrackingLoading(true);
                  const tracking = buildContactTrackingFromRawPayload(webhookBodyViewing.raw_payload);
                  const { phone, sender_name } = extractPhoneAndNameFromRawPayload(webhookBodyViewing.raw_payload, fromJid);
                  const now = new Date().toISOString();
                  const row = {
                    cliente_id: lead.cliente_id,
                    from_jid: fromJid,
                    phone: phone || lead.whatsapp || null,
                    sender_name: sender_name || lead.nome || null,
                    origin_source: tracking.origin_source,
                    utm_source: tracking.utm_source,
                    utm_medium: tracking.utm_medium,
                    utm_campaign: tracking.utm_campaign,
                    utm_content: tracking.utm_content,
                    utm_term: tracking.utm_term,
                    tracking_data: tracking.tracking_data,
                    last_message_at: webhookBodyViewing.created_at || now,
                    updated_at: now,
                  };
                  const { error } = await supabase.from('cliente_whatsapp_contact').upsert(row, {
                    onConflict: 'cliente_id,from_jid',
                    updateColumns: ['phone', 'sender_name', 'origin_source', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'tracking_data', 'last_message_at', 'updated_at'],
                  });
                  if (error) {
                    setApplyTrackingLoading(false);
                    toast({ variant: 'destructive', title: 'Erro ao aplicar rastreamento', description: error.message });
                    return;
                  }
                  if (tracking.origin_source === 'meta_ads') {
                    const leadUpdate = {
                      origem: lead.origem || 'Meta Ads',
                      utm_source: tracking.utm_source || null,
                      utm_medium: tracking.utm_medium || null,
                      utm_campaign: tracking.utm_campaign || null,
                      utm_content: tracking.utm_content || null,
                      utm_term: tracking.utm_term || null,
                      tracking_data: tracking.tracking_data && typeof tracking.tracking_data === 'object' ? tracking.tracking_data : null,
                    };
                    await supabase.from('leads').update(leadUpdate).eq('id', lead.id);
                  }
                  setApplyTrackingLoading(false);
                  toast({ title: 'Rastreamento aplicado', description: 'O contato e o lead foram atualizados com os dados de rastreamento.' });
                  setWebhookBodyViewing(null);
                  if (onClose) onClose();
                }}
              >
                {applyTrackingLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Aplicar rastreamento ao contato
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <RegisterSaleModal
        isOpen={registerSaleOpen || !!editSaleVenda}
        onClose={() => { setRegisterSaleOpen(false); setEditSaleVenda(null); }}
        lead={lead}
        venda={editSaleVenda}
        onSuccess={refetchVendas}
      />
    </>
  );
};

export default LeadDetailContent;
