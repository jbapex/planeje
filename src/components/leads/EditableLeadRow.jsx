import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useClienteCrmSettings } from '@/contexts/ClienteCrmSettingsContext';
import { Check, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { TableCell, TableRow } from '@/components/ui/table';

const EditableLeadRow = ({ lead, onSave, onCancel, stages }) => {
  const { settings } = useClienteCrmSettings();
  const [formData, setFormData] = useState({});
  const useStages = Array.isArray(stages) && stages.length > 0;

  useEffect(() => {
    setFormData({
      ...lead,
      data_entrada: lead.data_entrada ? (typeof lead.data_entrada === 'string' ? lead.data_entrada.split('T')[0] : lead.data_entrada) : '',
      agendamento: lead.agendamento ? (typeof lead.agendamento === 'string' ? lead.agendamento.slice(0, 16) : '') : '',
      valor: lead.valor ?? '',
      observacoes: lead.observacoes || '',
      product_id: lead.product_id || '',
    });
  }, [lead]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = () => {
    const payload = {
      id: formData.id,
      nome: formData.nome,
      whatsapp: formData.whatsapp,
      email: formData.email,
      data_entrada: formData.data_entrada ? new Date(formData.data_entrada).toISOString().split('T')[0] : null,
      origem: formData.origem,
      sub_origem: formData.sub_origem,
      agendamento: formData.agendamento ? new Date(formData.agendamento).toISOString() : null,
      status: formData.status,
      vendedor: formData.vendedor,
      product_id: formData.product_id || null,
      valor: parseFloat(formData.valor) || 0,
      observacoes: formData.observacoes,
    };
    if (useStages && formData.stage_id) {
      payload.stage_id = formData.stage_id;
      payload.stage_entered_at = new Date().toISOString();
    }
    onSave(payload);
  };

  if (!formData.id) return null;

  const origins = settings?.origins || [];
  const subOrigins = (formData.origem && settings?.sub_origins?.[formData.origem]) || [];
  const statuses = settings?.statuses || [];
  const sellers = settings?.sellers || [];

  return (
    <TableRow className="bg-muted/30">
      <TableCell colSpan={13} className="p-4">
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="text-xs font-medium">Nome</label>
            <Input name="nome" value={formData.nome || ''} onChange={handleChange} className="mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium">WhatsApp</label>
            <Input name="whatsapp" value={formData.whatsapp || ''} onChange={handleChange} className="mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium">Email</label>
            <Input name="email" type="email" value={formData.email || ''} onChange={handleChange} className="mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium">Data de Entrada</label>
            <Input name="data_entrada" type="date" value={formData.data_entrada || ''} onChange={handleChange} className="mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium">Origem</label>
            <Select value={formData.origem || ''} onValueChange={(v) => setFormData((p) => ({ ...p, origem: v, sub_origem: '' }))}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Origem..." />
              </SelectTrigger>
              <SelectContent>
                {origins.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium">Sub Origem</label>
            <Select value={formData.sub_origem || ''} onValueChange={(v) => setFormData((p) => ({ ...p, sub_origem: v }))}>
              <SelectTrigger className="mt-1" disabled={!subOrigins.length}>
                <SelectValue placeholder="Sub origem..." />
              </SelectTrigger>
              <SelectContent>
                {subOrigins.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium">Agendamento</label>
            <Input name="agendamento" type="datetime-local" value={formData.agendamento || ''} onChange={handleChange} className="mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium">{useStages ? 'Etapa do funil' : 'Status'}</label>
            {useStages ? (
              <Select
                value={formData.stage_id || ''}
                onValueChange={(stageId) => {
                  const stage = stages.find((s) => s.id === stageId);
                  setFormData((p) => ({ ...p, stage_id: stageId, status: stage?.nome ?? p.status }));
                }}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Etapa..." />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {(s.nome || '').replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Select value={formData.status || ''} onValueChange={(v) => setFormData((p) => ({ ...p, status: v }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Status..." />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((s) => (
                    <SelectItem key={s.name} value={s.name}>
                      {(s.name || '').replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div>
            <label className="text-xs font-medium">Vendedor</label>
            <Select value={formData.vendedor || ''} onValueChange={(v) => setFormData((p) => ({ ...p, vendedor: v }))}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Vendedor..." />
              </SelectTrigger>
              <SelectContent>
                {sellers.map((seller) => (
                  <SelectItem key={seller} value={seller}>
                    {seller}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium">Valor (R$)</label>
            <Input name="valor" type="number" step="0.01" value={formData.valor ?? ''} onChange={handleChange} className="mt-1" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium">Observações</label>
            <Textarea name="observacoes" value={formData.observacoes || ''} onChange={handleChange} className="mt-1" rows={2} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" size="sm" onClick={onCancel}>
            <X className="h-4 w-4 mr-1" />
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSave}>
            <Check className="h-4 w-4 mr-1" />
            Salvar
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
};

export default EditableLeadRow;
