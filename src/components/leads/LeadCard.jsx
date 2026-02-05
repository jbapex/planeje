import React from 'react';
import { motion } from 'framer-motion';
import { Checkbox } from '@/components/ui/checkbox';
import { Edit, Trash2, Eye } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import StatusEditor from './StatusEditor';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const formatDate = (dateString) => {
  if (!dateString) return '-';
  const d = typeof dateString === 'string' && dateString.includes('T') ? new Date(dateString) : new Date(dateString);
  return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
};

const LeadCard = ({
  lead,
  selected,
  onSelect,
  onEdit,
  onDelete,
  onShowDetail,
  getStatusIcon,
  getStatusText,
  onUpdateLead,
}) => {
  const StatusIcon = getStatusIcon ? getStatusIcon(lead.status) : null;

  const handleStatusChange = (newStatus) => {
    onUpdateLead?.(lead.id, { ...lead, status: newStatus });
  };

  return (
    <motion.div layout className="shrink-0">
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={selected}
              onCheckedChange={(checked) => onSelect(lead.id, !!checked)}
              aria-label={`Selecionar ${lead.nome}`}
              className="mt-1"
              onClick={(e) => e.stopPropagation()}
            />
            <Avatar className="h-10 w-10">
              <AvatarImage src={lead.profile_pic_url} />
              <AvatarFallback>{lead.nome ? lead.nome.charAt(0).toUpperCase() : '?'}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{lead.nome}</p>
              <p className="text-xs text-muted-foreground">Entrada: {formatDate(lead.data_entrada)}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          <p className="text-sm">{lead.whatsapp || '-'}</p>
          <p className="text-sm">{lead.email || '-'}</p>
          <p className="text-sm">{lead.agendamento ? `Ag: ${formatDate(lead.agendamento)}` : 'Sem agendamento'}</p>
          <div className="flex items-center gap-2">
            {StatusIcon && <StatusIcon className="h-4 w-4 shrink-0" />}
            <StatusEditor value={lead.status} onChange={(v) => handleStatusChange(v)} className="flex-1 min-w-0" />
          </div>
          <div className="flex items-center gap-1 pt-2">
            <Button variant="ghost" size="sm" className="flex-1" onClick={() => onShowDetail?.(lead)}>
              <Eye className="h-4 w-4 mr-1" />
              Ver
            </Button>
            <Button variant="ghost" size="sm" className="flex-1" onClick={() => onEdit?.(lead)}>
              <Edit className="h-4 w-4 mr-1" />
              Editar
            </Button>
            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => onDelete?.(lead.id)}>
              <Trash2 className="h-4 w-4 mr-1" />
              Excluir
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default LeadCard;
