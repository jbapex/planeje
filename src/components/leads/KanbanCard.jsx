import React, { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Phone, Calendar, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { useClienteCrmSettings } from '@/contexts/ClienteCrmSettingsContext';

const KanbanCard = ({
  lead,
  currentStageId,
  onShowLeadDetail,
  onUpdateLead,
  stages,
  moveLeadToStage,
  onRequestMoveWithModal,
  onDragStart,
  isDragging,
  className,
}) => {
  const [moving, setMoving] = useState(false);
  const { toast } = useToast();
  const { settings } = useClienteCrmSettings();
  const tagDefs = settings?.tags || [];
  const leadTags = Array.isArray(lead.etiquetas) ? lead.etiquetas : [];
  const isFromMeta = lead?.origem === 'Meta Ads' || (lead?.tracking_data && typeof lead.tracking_data === 'object' && (lead.tracking_data.meta_ad_details || (lead.utm_source && /facebook|meta|fb/i.test(String(lead.utm_source))) || lead.utm_campaign));

  const handleDragStart = (e) => {
    e.stopPropagation();
    if (onDragStart) onDragStart(e, lead);
    else {
      e.dataTransfer.setData('text/plain', lead.id);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/json', JSON.stringify({ leadId: lead.id, stageId: currentStageId }));
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '-';
    return format(date, 'dd/MM/yy');
  };

  const otherStages = (stages || []).filter((s) => s.id !== currentStageId);
  const canMove = otherStages.length > 0 && (moveLeadToStage || onRequestMoveWithModal);

  const handleMoveTo = async (targetStage) => {
    if (!targetStage) return;
    const isFinal = targetStage.tipo === 'ganho' || targetStage.tipo === 'perdido';
    if (isFinal && onRequestMoveWithModal) {
      onRequestMoveWithModal(lead, targetStage);
      return;
    }
    if (moveLeadToStage) {
      setMoving(true);
      const result = await moveLeadToStage(lead, targetStage.id, {});
      setMoving(false);
      if (!result.success && result.message) {
        toast({ variant: 'destructive', title: 'Não foi possível mover', description: result.message });
      }
    }
  };

  return (
    <Card
      className={cn(
        'cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow text-sm',
        isDragging && 'opacity-50',
        isFromMeta && 'bg-violet-50/50 dark:bg-violet-950/20 border border-violet-200/70 dark:border-violet-800/50',
        className
      )}
      onClick={() => onShowLeadDetail?.(lead)}
      draggable={!!(moveLeadToStage || onRequestMoveWithModal)}
      onDragStart={handleDragStart}
    >
      <CardHeader className="p-2 pb-0.5 flex flex-row items-center gap-1.5">
        <Avatar className="h-6 w-6 shrink-0 text-xs">
          <AvatarImage src={lead.profile_pic_url} />
          <AvatarFallback>{lead.nome ? lead.nome.charAt(0).toUpperCase() : '?'}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
          <p className="font-medium truncate text-xs">{lead.nome}</p>
          <div className="flex items-center gap-1 shrink-0">
            {isFromMeta && (
              <img src="/logos/meta%20ads.webp" alt="Meta Ads" className="h-4 w-4 object-contain" title="Lead do Meta Ads" />
            )}
            {lead.data_entrada && (
              <span className="text-[10px] text-muted-foreground">
                {formatDate(lead.data_entrada)}
              </span>
            )}
          </div>
        </div>
        {canMove && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" disabled={moving} title="Mover para outra etapa">
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              {otherStages.map((s) => (
                <DropdownMenuItem key={s.id} onClick={() => handleMoveTo(s)}>
                  {(s.nome || '').replace(/_/g, ' ')}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </CardHeader>
      <CardContent className="p-2 pt-0 space-y-0.5 text-xs text-muted-foreground">
        {leadTags.length > 0 && (
          <div className="flex flex-wrap gap-1 pb-1">
            {leadTags.map((tagName) => {
              const def = tagDefs.find((t) => (t.name || '').replace(/_/g, ' ') === (tagName || '').replace(/_/g, ' ') || t.name === tagName);
              const color = def?.color || '#6b7280';
              return (
                <Badge key={tagName} variant="secondary" className="text-[9px] px-1 py-0" style={{ backgroundColor: `${color}20`, color, borderColor: color }}>
                  {(tagName || '').replace(/_/g, ' ')}
                </Badge>
              );
            })}
          </div>
        )}
        <div className="flex items-center gap-1.5 justify-between min-w-0">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <Phone className="h-3 w-3 shrink-0" />
            <span className="truncate">{lead.whatsapp || '-'}</span>
          </div>
          {lead.responsavel?.full_name && (
            <div className="flex items-center gap-1 shrink-0" title={lead.responsavel.full_name}>
              <Avatar className="h-5 w-5 border border-border">
                <AvatarImage src={lead.responsavel.avatar_url} />
                <AvatarFallback className="text-[9px]">
                  {lead.responsavel.full_name ? lead.responsavel.full_name.charAt(0).toUpperCase() : '?'}
                </AvatarFallback>
              </Avatar>
              <span className="text-[10px] truncate max-w-[60px] hidden sm:inline">
                {lead.responsavel.full_name}
              </span>
            </div>
          )}
        </div>
        {lead.agendamento && (
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3 w-3 shrink-0" />
            <span>Ag: {formatDate(lead.agendamento)}</span>
          </div>
        )}
        {lead.vendedor && <p className="truncate">{lead.vendedor}</p>}
      </CardContent>
    </Card>
  );
};

export default KanbanCard;
