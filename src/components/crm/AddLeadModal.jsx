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

const AddLeadModal = ({ isOpen, onClose, onSave, members = [] }) => {
  const { settings } = useClienteCrmSettings();
  const { toast } = useToast();
  const customDateSettings = settings?.custom_fields_settings?.date_field || { is_active: false, label: '' };

  const getInitialState = () => ({
    nome: '',
    whatsapp: '',
    email: '',
    origem: '',
    sub_origem: '',
    data_entrada: new Date().toISOString().split('T')[0],
    agendamento: '',
    status: settings?.statuses?.[0]?.name || 'agendado',
    vendedor: '',
    responsavel_id: '',
    valor: '',
    observacoes: '',
    custom_date_field: '',
    etiquetas: [],
  });

  const [formData, setFormData] = useState(getInitialState());

  useEffect(() => {
    if (isOpen) {
      setFormData({
        ...getInitialState(),
        status: settings?.statuses?.[0]?.name || 'agendado',
      });
    }
  }, [isOpen, settings?.statuses]);

  const handleValueChange = (name, value) => {
    setFormData((prev) => {
      const next = { ...prev, [name]: value };
      if (name === 'origem') next.sub_origem = '';
      return next;
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.nome?.trim() || !formData.whatsapp?.trim()) {
      toast({
        variant: 'destructive',
        title: 'Campos obrigatórios',
        description: 'Preencha pelo menos Nome e WhatsApp.',
      });
      return;
    }
    onSave({
      ...formData,
      valor: parseFloat(formData.valor) || 0,
      agendamento: formData.agendamento ? new Date(formData.agendamento).toISOString() : null,
      custom_date_field: formData.custom_date_field ? new Date(formData.custom_date_field).toISOString().split('T')[0] : null,
      responsavel_id: formData.responsavel_id || null,
      etiquetas: Array.isArray(formData.etiquetas) ? formData.etiquetas : [],
    });
  };

  if (!isOpen) return null;

  const availableSubOrigins = formData.origem && settings?.sub_origins?.[formData.origem] ? settings.sub_origins[formData.origem] : [];
  const origins = settings?.origins || [];
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
          <DialogTitle>Adicionar Novo Lead</DialogTitle>
          <DialogDescription>Preencha as informações abaixo para cadastrar um novo lead.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="nome">Nome *</Label>
              <Input id="nome" name="nome" value={formData.nome} onChange={(e) => handleValueChange('nome', e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="whatsapp">WhatsApp *</Label>
              <Input id="whatsapp" name="whatsapp" value={formData.whatsapp} onChange={(e) => handleValueChange('whatsapp', e.target.value)} required />
            </div>
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" value={formData.email} onChange={(e) => handleValueChange('email', e.target.value)} />
          </div>
          <div>
            <Label htmlFor="data_entrada">Data do Contato</Label>
            <Input
              id="data_entrada"
              name="data_entrada"
              type="date"
              value={formData.data_entrada}
              onChange={(e) => handleValueChange('data_entrada', e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Origem</Label>
              <Select value={formData.origem} onValueChange={(v) => handleValueChange('origem', v)}>
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
              <Select
                value={formData.sub_origem}
                onValueChange={(v) => handleValueChange('sub_origem', v)}
                disabled={availableSubOrigins.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sub origem..." />
                </SelectTrigger>
                <SelectContent>
                  {availableSubOrigins.map((s) => (
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
            <Input
              name="agendamento"
              type="datetime-local"
              value={formData.agendamento}
              onChange={(e) => handleValueChange('agendamento', e.target.value)}
            />
          </div>
          {customDateSettings.is_active && (
            <div>
              <Label>{customDateSettings.label}</Label>
              <Input
                name="custom_date_field"
                type="date"
                value={formData.custom_date_field}
                onChange={(e) => handleValueChange('custom_date_field', e.target.value)}
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(v) => handleValueChange('status', v)}>
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
              <Select value={formData.vendedor} onValueChange={(v) => handleValueChange('vendedor', v)}>
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
            <Label>Valor (R$)</Label>
            <Input
              name="valor"
              type="number"
              step="0.01"
              value={formData.valor}
              onChange={(e) => handleValueChange('valor', e.target.value)}
            />
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea name="observacoes" value={formData.observacoes} onChange={(e) => handleValueChange('observacoes', e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit">Salvar Lead</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddLeadModal;
