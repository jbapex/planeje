import React, { useState, useEffect } from 'react';
    import { Save, FolderKanban, User } from 'lucide-react';
    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';
    import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
    import { Label } from '@/components/ui/label';
    import { DayPicker } from 'react-day-picker';
    import 'react-day-picker/dist/style.css';
    import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
    import { format } from 'date-fns';
    import { ptBR } from 'date-fns/locale';
    import { useSessionFormState } from '@/hooks/useSessionFormState';

const STATUS_OPTIONS = ['planejamento', 'execucao', 'concluido', 'pausado'];

const ProjectForm = ({ project, clients, onSave, onClose }) => {
  const isNew = !project;
  const formKey = `project_${project?.id || 'new'}`;
  
  // Estado inicial baseado no projeto ou vazio
  const getInitialData = () => {
    if (project) {
      return {
        name: project.name || '',
        client_id: project.client_id || '',
        mes_referencia: project.mes_referencia ? new Date(project.mes_referencia).toISOString() : new Date().toISOString(),
        status: project.status || 'planejamento'
      };
    }
    return {
      name: '',
      client_id: '',
      mes_referencia: new Date().toISOString(),
      status: 'planejamento'
    };
  };

  // Hook que persiste estado em sessionStorage
  const [formData, setFormData, clearFormData] = useSessionFormState(formKey, getInitialData());

  // Atualiza quando projeto muda (mas preserva estado salvo se existir)
  useEffect(() => {
    const saved = sessionStorage.getItem(`form_state_${formKey}`);
    if (!saved && project) {
      // Só atualiza se não tiver estado salvo
      const initial = getInitialData();
      setFormData(initial);
    }
  }, [project?.id]); // Só quando ID do projeto muda

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.client_id || !formData.name) {
      alert("Cliente e Título do Projeto são obrigatórios.");
      return;
    }
    const dataToSave = {
      ...formData,
      mes_referencia: typeof formData.mes_referencia === 'string' 
        ? formData.mes_referencia 
        : formData.mes_referencia.toISOString(),
    };
    // Limpa o estado salvo após salvar com sucesso
    clearFormData();
    onSave(dataToSave, isNew);
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Novo Projeto' : 'Editar Projeto'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="client_id"><User className="inline-block mr-2 h-4 w-4" />Cliente</Label>
            <Select value={formData.client_id} onValueChange={(v) => handleChange('client_id', v)} required>
              <SelectTrigger id="client_id"><SelectValue placeholder="Selecione um cliente" /></SelectTrigger>
              <SelectContent>
                {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.empresa}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="name"><FolderKanban className="inline-block mr-2 h-4 w-4" />Título do Projeto</Label>
            <Input id="name" value={formData.name} onChange={(e) => handleChange('name', e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Mês de Referência</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  {format(typeof formData.mes_referencia === 'string' ? new Date(formData.mes_referencia) : formData.mes_referencia, "MMMM 'de' yyyy", { locale: ptBR })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <DayPicker
                  mode="single"
                  selected={typeof formData.mes_referencia === 'string' ? new Date(formData.mes_referencia) : formData.mes_referencia}
                  onSelect={(day) => day && handleChange('mes_referencia', day.toISOString())}
                  captionLayout="dropdown-buttons"
                  fromYear={2020}
                  toYear={2030}
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={formData.status} onValueChange={(v) => handleChange('status', v)}>
              <SelectTrigger><SelectValue placeholder="Selecione o status" /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" onClick={handleSubmit}><Save size={16} className="mr-2" />{isNew ? 'Adicionar Projeto' : 'Salvar Alterações'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ProjectForm;