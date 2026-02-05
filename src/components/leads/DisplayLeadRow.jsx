import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Edit, Trash2, Eye } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import StatusEditor from './StatusEditor';
import { TableCell, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { isLeadOverdueInStage } from '@/lib/crmFunnelValidation';

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
}) => {
  const StatusIcon = getStatusIcon ? getStatusIcon(lead.status) : null;

  const handleRowClick = (e) => {
    if (e.target.closest('button, [role="checkbox"], input')) return;
    onShowLeadDetail?.(lead);
  };

  const handleStatusChange = (newStatus) => {
    onUpdateLead?.(lead.id, { ...lead, status: newStatus });
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
      <TableCell>{lead.origem || '-'}</TableCell>
      <TableCell>{formatDate(lead.agendamento)}</TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            {StatusIcon && <StatusIcon className="h-3.5 w-3.5 shrink-0" />}
            <StatusEditor value={lead.status} onChange={(v) => handleStatusChange(v)} className="w-[100px] h-7 text-xs" />
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
