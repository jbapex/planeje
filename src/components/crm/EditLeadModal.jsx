import React, { useState, useEffect } from 'react';
import { useClienteCrmSettings } from '@/contexts/ClienteCrmSettingsContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';

const EditLeadModal = ({ lead, isOpen, onClose, onSave, members = [] }) => {
  const { settings } = useClienteCrmSettings();
  const { toast } = useToast();
  const [formData, setFormData] = useState({});

  useEffect(() => {
    if (lead && isOpen) {
      setFormData({
        ...lead,
        data_entrada: lead.data_entrada ? (typeof lead.data_entrada === 'string' ? lead.data_entrada.split('T')[0] : lead.data_entrada) : '',
        agendamento: lead.agendamento ? (typeof lead.agendamento === 'string' ? lead.agendamento.slice(0, 16) : '') : '',
        valor: lead.valor ?? '',
        observacoes: lead.observacoes || '',
        responsavel_id: lead.responsavel_id || '',
        etiquetas: Array.isArray(lead.etiquetas) ? [...lead.etiquetas] : [],
      });
    }
  }, [lead, isOpen]);

  const handleValueChange = (name, value) => {
    setFormData((prev) => {
      const next = { ...prev, [name]: value };
      if (name === 'origem') next.sub_origem = '';
      return next;
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.nome?.trim()) {
      toast({ variant: 'destructive', title: 'Nome obrigatório', description: 'Preencha o nome do lead.' });
      return;
    }
    onSave({
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
      responsavel_id: formData.responsavel_id || null,
      valor: parseFloat(formData.valor) || 0,
      observacoes: formData.observacoes,
      etiquetas: Array.isArray(formData.etiquetas) ? formData.etiquetas : [],
    });
    onClose();
  };

  if (!isOpen || !lead) return null;

  const origins = settings?.origins || [];
  const subOrigins = (formData.origem && settings?.sub_origins?.[formData.origem]) || [];
  const statuses = settings?.statuses || [];
  const sellers = settings?.sellers || [];
  const tagDefs = settings?.tags || [];
  const selectedEtiquetas = Array.isArray(formData.etiquetas) ? formData.etiquetas : [];
  const toggleEtiqueta = (tagName) => {
    const name = (tagName || '').trim().replace(/\s+/g, '_');
    setFormData((prev) => {
      const current = Array.isArray(prev.etiquetas) ? prev.etiquetas : [];
      const has = current.some((n) => n === name || (n || '').replace(/_/g, ' ') === (tagName || '').replace(/_/g, ' '));
      const next = has ? current.filter((n) => n !== name && (n || '').replace(/_/g, ' ') !== (tagName || '').replace(/_/g, ' ')) : [...current, name];
      return { ...prev, etiquetas: next };
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Lead</DialogTitle>
          <DialogDescription>Altere as informações do lead e salve.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-nome">Nome *</Label>
              <Input id="edit-nome" value={formData.nome || ''} onChange={(e) => handleValueChange('nome', e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="edit-whatsapp">WhatsApp</Label>
              <Input id="edit-whatsapp" value={formData.whatsapp || ''} onChange={(e) => handleValueChange('whatsapp', e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="edit-email">Email</Label>
            <Input id="edit-email" type="email" value={formData.email || ''} onChange={(e) => handleValueChange('email', e.target.value)} />
          </div>
          <div>
            <Label>Data de Entrada</Label>
            <Input type="date" value={formData.data_entrada || ''} onChange={(e) => handleValueChange('data_entrada', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Origem</Label>
              <Select value={formData.origem || ''} onValueChange={(v) => handleValueChange('origem', v)}>
                <SelectTrigger>
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
              <Label>Sub Origem</Label>
              <Select value={formData.sub_origem || ''} onValueChange={(v) => handleValueChange('sub_origem', v)} disabled={!subOrigins.length}>
                <SelectTrigger>
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
          </div>
          <div>
            <Label>Agendamento</Label>
            <Input type="datetime-local" value={formData.agendamento || ''} onChange={(e) => handleValueChange('agendamento', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Status</Label>
              <Select value={formData.status || ''} onValueChange={(v) => handleValueChange('status', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((s) => (
                    <SelectItem key={s.name} value={s.name}>
                      {(s.name || '').replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Vendedor</Label>
              <Select value={formData.vendedor || ''} onValueChange={(v) => handleValueChange('vendedor', v)}>
                <SelectTrigger>
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
          </div>
          {members.length > 0 && (
            <div>
              <Label>Responsável</Label>
              <Select value={formData.responsavel_id || 'none'} onValueChange={(v) => handleValueChange('responsavel_id', v === 'none' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um responsável..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.full_name || 'Sem nome'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Valor (R$)</Label>
            <Input type="number" step="0.01" value={formData.valor ?? ''} onChange={(e) => handleValueChange('valor', e.target.value)} />
          </div>
          {tagDefs.length > 0 && (
            <div>
              <Label>Etiquetas</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {tagDefs.map((t) => {
                  const name = (t.name || '').replace(/_/g, ' ');
                  const isChecked = selectedEtiquetas.some((n) => n === t.name || (n || '').replace(/_/g, ' ') === name);
                  return (
                    <label key={t.name} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={isChecked} onCheckedChange={() => toggleEtiqueta(t.name)} />
                      <span className="text-sm" style={{ color: t.color || '#6b7280' }}>{name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
          <div>
            <Label>Observações</Label>
            <Textarea value={formData.observacoes || ''} onChange={(e) => handleValueChange('observacoes', e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit">Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditLeadModal;
