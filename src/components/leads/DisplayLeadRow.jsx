import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Edit, Trash2, Eye } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import StatusEditor from './StatusEditor';
import { TableCell, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { isLeadOverdueInStage } from '@/lib/crmFunnelValidation';
import { useClienteCrmSettings } from '@/contexts/ClienteCrmSettingsContext';

const formatDate = (dateString) => {
  if (!dateString) return '-';
  const d = typeof dateString === 'string' && dateString.includes('T') ? new Date(dateString) : new Date(dateString);
  return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
};

const formatDateTime = (dateString) => {
  if (!dateString) return '-';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

const DisplayLeadRow = ({
  lead,
  selected,
  onSelectOne,
  onEdit,
  onDelete,
  onShowLeadDetail,
  getStatusIcon,
  getStatusText,
  onUpdateLead,
  stages,
  moveLeadToStage,
}) => {
  const { settings } = useClienteCrmSettings();
  const useStages = Array.isArray(stages) && stages.length > 0;
  const StatusIcon = getStatusIcon ? getStatusIcon(lead.status) : null;
  const tagDefs = settings?.tags || [];
  const leadTags = Array.isArray(lead.etiquetas) ? lead.etiquetas : [];

  const handleRowClick = (e) => {
    if (e.target.closest('button, [role="checkbox"], input')) return;
    onShowLeadDetail?.(lead);
  };

  const handleStatusChange = (newValue) => {
    if (useStages && moveLeadToStage) {
      moveLeadToStage(lead, newValue);
    } else {
      onUpdateLead?.(lead.id, { ...lead, status: newValue });
    }
  };

  return (
    <TableRow onClick={handleRowClick} className="cursor-pointer">
      <TableCell onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={selected}
          onCheckedChange={(checked) => onSelectOne(lead.id, !!checked)}
          aria-label={`Selecionar ${lead.nome}`}
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          <Avatar className="h-6 w-6">
            <AvatarImage src={lead.profile_pic_url} />
            <AvatarFallback className="text-[10px]">{lead.nome ? lead.nome.charAt(0).toUpperCase() : '?'}</AvatarFallback>
          </Avatar>
          <span className="font-medium text-xs">{lead.nome}</span>
        </div>
      </TableCell>
      <TableCell>{formatDate(lead.data_entrada)}</TableCell>
      <TableCell>{lead.whatsapp || '-'}</TableCell>
      <TableCell>{lead.email || '-'}</TableCell>
      <TableCell>
        <div className="flex flex-col gap-0.5">
          <span>{lead.origem || '-'}</span>
          {(lead.utm_campaign || (lead.tracking_data?.campaign_name) || (lead.tracking_data?.meta_ad_details?.campaign_name)) && (
            <span className="text-[10px] text-muted-foreground truncate max-w-[120px]" title={lead.utm_campaign || lead.tracking_data?.campaign_name || lead.tracking_data?.meta_ad_details?.campaign_name}>
              {lead.utm_campaign || lead.tracking_data?.campaign_name || lead.tracking_data?.meta_ad_details?.campaign_name}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell>{formatDate(lead.agendamento)}</TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            {StatusIcon && <StatusIcon className="h-3.5 w-3.5 shrink-0" />}
            <StatusEditor
              value={useStages ? lead.stage_id : lead.status}
              onChange={handleStatusChange}
              className="w-[100px] h-7 text-xs"
              stages={stages}
            />
          </div>
          {lead.stage && isLeadOverdueInStage(lead.stage, lead.stage_entered_at) && (
            <Badge variant="destructive" className="w-fit text-[10px]">Atrasado</Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">{formatDateTime(lead.proxima_acao)}</TableCell>
      <TableCell>{lead.vendedor || '-'}</TableCell>
      <TableCell>{lead.product?.name || '-'}</TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {leadTags.map((tagName) => {
            const def = tagDefs.find((t) => (t.name || '').replace(/_/g, ' ') === (tagName || '').replace(/_/g, ' ') || t.name === tagName);
            const color = def?.color || '#6b7280';
            return (
              <Badge key={tagName} variant="secondary" className="text-[10px] px-1.5 py-0" style={{ backgroundColor: `${color}20`, color, borderColor: color }}>
                {(tagName || '').replace(/_/g, ' ')}
              </Badge>
            );
          })}
          {leadTags.length === 0 && <span className="text-muted-foreground">—</span>}
        </div>
      </TableCell>
      <TableCell>
        {lead.valor != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(lead.valor)) : '-'}
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onShowLeadDetail?.(lead)} title="Ver detalhes">
            <Eye className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit?.(lead)} title="Editar">
            <Edit className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete?.(lead.id)} title="Excluir">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
};

export default DisplayLeadRow;
