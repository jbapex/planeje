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
import { Phone, Mail, Calendar, Edit, ArrowRightLeft } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/customSupabaseClient';

const LeadDetailModal = ({ lead, isOpen, onClose, onEdit, pipelines = [], onTransfer }) => {
  const { settings } = useClienteCrmSettings();
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferPipelineId, setTransferPipelineId] = useState('');
  const [transferStageId, setTransferStageId] = useState('');
  const [transferStages, setTransferStages] = useState([]);
  const [loadingStages, setLoadingStages] = useState(false);
  const [transferring, setTransferring] = useState(false);

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
    }
  }, [isOpen]);

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
    </Dialog>
  );
};

export default LeadDetailModal;
