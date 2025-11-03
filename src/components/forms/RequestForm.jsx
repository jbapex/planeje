import React, { useState, useEffect } from 'react';
    import { Save, User, MessageSquare, Flag, Calendar, CheckCircle } from 'lucide-react';
    import { useSessionFormState } from '@/hooks/useSessionFormState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from '@/components/ui/label';

const ORIGEM_OPTIONS = ['WhatsApp', 'Email', 'Ligação', 'Reunião', 'Interna'];
const PRIORITY_OPTIONS = ['baixa', 'media', 'alta'];
const STATUS_OPTIONS = ['aberta', 'analise', 'execucao', 'concluida', 'rejeitada'];

const RequestForm = ({ request, clients, onSave, onClose }) => {
  const formKey = `request_${request?.id || 'new'}`;
  
  // Função para obter dados iniciais
  const getInitialData = () => {
    if (request) {
      return {
        client_id: request.client_id || '',
        origem: request.origem || 'WhatsApp',
        title: request.title || '',
        description: request.description || '',
        priority: request.priority || 'media',
        status: request.status || 'aberta',
        data_recebida: request.data_recebida ? new Date(request.data_recebida).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        prazo: request.prazo ? new Date(request.prazo).toISOString().split('T')[0] : '',
      };
    }
    return {
      client_id: '',
      origem: 'WhatsApp',
      title: '',
      description: '',
      priority: 'media',
      status: 'aberta',
      data_recebida: new Date().toISOString().split('T')[0],
      prazo: '',
    };
  };

  // Hook que persiste estado em sessionStorage
  const [formData, setFormData, clearFormData] = useSessionFormState(formKey, getInitialData());

  // Atualiza quando solicitação muda (mas preserva estado salvo se existir)
  useEffect(() => {
    const saved = sessionStorage.getItem(`form_state_${formKey}`);
    if (!saved && request) {
      // Só atualiza se não tiver estado salvo
      const initial = getInitialData();
      setFormData(initial);
    }
  }, [request?.id]); // Só quando ID da solicitação muda

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Limpa o estado salvo após salvar com sucesso
    clearFormData();
    onSave(formData, !request);
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{request ? 'Editar Solicitação' : 'Registrar Solicitação'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="client_id"><User className="inline-block mr-2 h-4 w-4" />Cliente</Label>
              <Select value={formData.client_id} onValueChange={(v) => handleChange('client_id', v)} required>
                <SelectTrigger id="client_id"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.empresa}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="origem">Origem</Label>
              <Select value={formData.origem} onValueChange={(v) => handleChange('origem', v)}>
                <SelectTrigger id="origem"><SelectValue /></SelectTrigger>
                <SelectContent>{ORIGEM_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="title"><MessageSquare className="inline-block mr-2 h-4 w-4" />Título</Label>
            <Input id="title" value={formData.title} onChange={(e) => handleChange('title', e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea id="description" value={formData.description} onChange={(e) => handleChange('description', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="priority"><Flag className="inline-block mr-2 h-4 w-4" />Prioridade</Label>
              <Select value={formData.priority} onValueChange={(v) => handleChange('priority', v)}>
                <SelectTrigger id="priority"><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORITY_OPTIONS.map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status"><CheckCircle className="inline-block mr-2 h-4 w-4" />Status</Label>
              <Select value={formData.status} onValueChange={(v) => handleChange('status', v)}>
                <SelectTrigger id="status"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS_OPTIONS.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="data_recebida"><Calendar className="inline-block mr-2 h-4 w-4" />Data Recebida</Label>
              <Input id="data_recebida" type="date" value={formData.data_recebida} onChange={(e) => handleChange('data_recebida', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prazo">Prazo (SLA)</Label>
              <Input id="prazo" type="date" value={formData.prazo} onChange={(e) => handleChange('prazo', e.target.value)} />
            </div>
          </div>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" onClick={handleSubmit}><Save size={16} className="mr-2" />{request ? 'Salvar Alterações' : 'Registrar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RequestForm;