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
import { Phone, Mail, Calendar, Edit, ArrowRightLeft, Activity, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { buildContactTrackingFromRawPayload, extractPhoneAndNameFromRawPayload } from '@/lib/contactFromWebhookPayload';

const LeadDetailModal = ({ lead, isOpen, onClose, onEdit, pipelines = [], onTransfer }) => {
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
    if (!isOpen) {
      setShowTransfer(false);
      setTransferPipelineId('');
      setTransferStageId('');
      setWebhookBodyViewing(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !lead?.id) {
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
  }, [isOpen, lead?.id]);

  if (!lead) return null;

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const d = new Date(dateString);
    return isNaN(d.getTime()) ? '-' : format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  };

  const formatDateShort = (dateString) => {
    if (!dateString) return '-';
    const d = new Date(dateString);
    return isNaN(d.getTime()) ? '-' : format(d, 'dd/MM/yyyy', { locale: ptBR });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarImage src={lead.profile_pic_url} />
              <AvatarFallback>{lead.nome ? lead.nome.charAt(0).toUpperCase() : '?'}</AvatarFallback>
            </Avatar>
            <div>
              <DialogTitle className="text-lg">{lead.nome}</DialogTitle>
              <p className="text-sm text-muted-foreground">{getStatusText(lead.status)}</p>
            </div>
          </div>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex items-center gap-3">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <a href={`https://wa.me/${(lead.whatsapp || '').replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              {lead.whatsapp || '-'}
            </a>
          </div>
          <div className="flex items-center gap-3">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span>{lead.email || '-'}</span>
          </div>
          <div className="flex items-center gap-3">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span>Entrada: {formatDateShort(lead.data_entrada)}</span>
          </div>
          {lead.agendamento && (
            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>Agendamento: {formatDate(lead.agendamento)}</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-muted-foreground">Origem</span>
            <span>{lead.origem || '-'}</span>
            <span className="text-muted-foreground">Sub origem</span>
            <span>{lead.sub_origem || '-'}</span>
            <span className="text-muted-foreground">Vendedor</span>
            <span>{lead.vendedor || '-'}</span>
            <span className="text-muted-foreground">Responsável</span>
            <span>{lead.responsavel?.full_name || '-'}</span>
            <span className="text-muted-foreground">Valor</span>
            <span>
              {lead.valor != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(lead.valor)) : '-'}
            </span>
          </div>
          {lead.observacoes && (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Observações</p>
              <p className="text-sm whitespace-pre-wrap">{lead.observacoes}</p>
            </div>
          )}

          <div className="border-t pt-4 space-y-2">
            <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <Activity className="h-4 w-4" />
              Histórico de eventos (webhook)
            </p>
            {webhookEventsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando…
              </div>
            ) : webhookEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">Nenhum evento webhook vinculado.</p>
            ) : (
              <div className="rounded-md border bg-muted/30 max-h-48 overflow-y-auto divide-y">
                {webhookEvents.map((ev) => (
                  <div key={ev.id || ev.webhook_log_id} className="p-2 text-sm">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-muted-foreground shrink-0">
                        {ev.created_at ? formatDate(ev.created_at) : '-'}
                      </span>
                      {ev.source && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted font-medium">{ev.source}</span>
                      )}
                      {ev.raw_payload != null && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs shrink-0"
                          onClick={() => setWebhookBodyViewing(ev)}
                        >
                          Ver corpo
                        </Button>
                      )}
                    </div>
                    {ev.body_preview && (
                      <p className="text-xs mt-1 text-foreground/90 line-clamp-2">{ev.body_preview}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {pipelines.length > 1 && onTransfer && (
            <div className="border-t pt-4 space-y-3">
              {!showTransfer ? (
                <Button variant="outline" size="sm" className="w-full" onClick={() => setShowTransfer(true)}>
                  <ArrowRightLeft className="h-4 w-4 mr-2" />
                  Transferir para outro funil
                </Button>
              ) : (
                <>
                  <p className="text-sm font-medium text-muted-foreground">Novo funil e etapa</p>
                  <Select value={transferPipelineId} onValueChange={setTransferPipelineId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione o funil" />
                    </SelectTrigger>
                    <SelectContent>
                      {pipelines.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {(p.nome || 'Sem nome').replace(/_/g, ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={transferStageId} onValueChange={setTransferStageId} disabled={loadingStages || !transferPipelineId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={loadingStages ? 'Carregando…' : 'Selecione a etapa'} />
                    </SelectTrigger>
                    <SelectContent>
                      {transferStages.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {(s.nome || '').replace(/_/g, ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setShowTransfer(false)}>
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      disabled={!transferStageId || transferring}
                      onClick={async () => {
                        const stage = transferStages.find((s) => s.id === transferStageId);
                        if (!stage) return;
                        setTransferring(true);
                        await onTransfer(lead, { pipeline_id: transferPipelineId, stage_id: transferStageId, stage_nome: stage.nome });
                        setTransferring(false);
                        onClose();
                      }}
                    >
                      {transferring ? 'Transferindo…' : 'Transferir'}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => { onEdit?.(lead); onClose(); }}>
            <Edit className="h-4 w-4 mr-2" />
            Editar
          </Button>
        </div>
      </DialogContent>

      <Dialog open={!!webhookBodyViewing} onOpenChange={(open) => !open && setWebhookBodyViewing(null)}>
        <DialogContent className="max-w-xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm">Corpo do evento</DialogTitle>
            {webhookBodyViewing?.created_at && (
              <p className="text-xs text-muted-foreground">{formatDate(webhookBodyViewing.created_at)}</p>
            )}
          </DialogHeader>
          <div className="flex-1 min-h-[120px] max-h-[50vh] rounded-md border bg-muted/30 p-3 overflow-y-auto overflow-x-hidden">
            {webhookBodyViewing?.raw_payload != null ? (
              <pre className="text-xs font-mono whitespace-pre-wrap break-words">
                {typeof webhookBodyViewing.raw_payload === 'object'
                  ? JSON.stringify(webhookBodyViewing.raw_payload, null, 2)
                  : String(webhookBodyViewing.raw_payload)}
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
                  const { error } = await supabase
                    .from('cliente_whatsapp_contact')
                    .upsert(row, {
                      onConflict: 'cliente_id,from_jid',
                      updateColumns: ['phone', 'sender_name', 'origin_source', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'tracking_data', 'last_message_at', 'updated_at'],
                    });
                  if (error) {
                    setApplyTrackingLoading(false);
                    toast({ variant: 'destructive', title: 'Erro ao aplicar rastreamento', description: error.message });
                    return;
                  }
                  if (!lead.origem && tracking.origin_source === 'meta_ads') {
                    await supabase.from('leads').update({ origem: 'Meta Ads' }).eq('id', lead.id);
                  }
                  setApplyTrackingLoading(false);
                  toast({ title: 'Rastreamento aplicado', description: 'O contato foi atualizado com os dados de rastreamento deste evento.' });
                  setWebhookBodyViewing(null);
                  onClose();
                }}
              >
                {applyTrackingLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Aplicar rastreamento ao contato
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};

export default LeadDetailModal;
