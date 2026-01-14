import React, { useState, useEffect } from 'react';
    import { Save, FolderKanban, User, UserCircle } from 'lucide-react';
    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';
    import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
    import { Label } from '@/components/ui/label';
    import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
    import { useSessionFormState } from '@/hooks/useSessionFormState';
    import { useAuth } from '@/contexts/SupabaseAuthContext';

const STATUS_OPTIONS = ['planejamento', 'execucao', 'concluido', 'pausado'];

const ProjectForm = ({ project, clients, users = [], onSave, onClose, defaultClientId }) => {
  const isNew = !project;
  const formKey = `project_${project?.id || 'new'}`;
  const { user } = useAuth();
  
  // Debug: verificar se usuários estão sendo recebidos
  useEffect(() => {
    console.log('ProjectForm - users recebidos:', users?.length || 0, users);
  }, [users]);
  
  // Meses em português
  const months = [
    { value: '0', label: 'Janeiro' },
    { value: '1', label: 'Fevereiro' },
    { value: '2', label: 'Março' },
    { value: '3', label: 'Abril' },
    { value: '4', label: 'Maio' },
    { value: '5', label: 'Junho' },
    { value: '6', label: 'Julho' },
    { value: '7', label: 'Agosto' },
    { value: '8', label: 'Setembro' },
    { value: '9', label: 'Outubro' },
    { value: '10', label: 'Novembro' },
    { value: '11', label: 'Dezembro' },
  ];

  // Gera anos de 2020 até 2030
  const years = Array.from({ length: 11 }, (_, i) => 2020 + i);

  // Estado inicial baseado no projeto ou vazio
  const getInitialData = () => {
    const now = new Date();
    if (project) {
      const projectDate = project.mes_referencia ? new Date(project.mes_referencia) : now;
      return {
        name: project.name || '',
        client_id: project.client_id || '',
        owner_id: project.owner_id || user?.id || '',
        month: projectDate.getMonth().toString(),
        year: projectDate.getFullYear().toString(),
        mes_referencia: project.mes_referencia ? new Date(project.mes_referencia).toISOString() : now.toISOString(),
        status: project.status || 'planejamento'
      };
    }
    return {
      name: '',
      client_id: defaultClientId || '',
      owner_id: user?.id || '',
      month: now.getMonth().toString(),
      year: now.getFullYear().toString(),
      mes_referencia: now.toISOString(),
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

  // Atualiza mes_referencia quando mês ou ano mudam
  useEffect(() => {
    if (formData.month && formData.year) {
      const date = new Date(parseInt(formData.year), parseInt(formData.month), 1);
      const newMesReferencia = date.toISOString();
      setFormData(prev => {
        // Só atualiza se for diferente para evitar loop
        if (prev.mes_referencia !== newMesReferencia) {
          return { ...prev, mes_referencia: newMesReferencia };
        }
        return prev;
      });
    }
  }, [formData.month, formData.year, setFormData]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Verifica se deve mostrar o campo de cliente
  const showClientField = !defaultClientId || project;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.client_id || !formData.name) {
      alert("Cliente e Título do Projeto são obrigatórios.");
      return;
    }
    
    // Garante que mes_referencia está correto
    const date = new Date(parseInt(formData.year), parseInt(formData.month), 1);
    
    const dataToSave = {
      name: formData.name,
      client_id: formData.client_id,
      owner_id: formData.owner_id || user?.id,
      mes_referencia: date.toISOString(),
      status: formData.status
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
          {showClientField && (
            <div className="space-y-2">
              <Label htmlFor="client_id"><User className="inline-block mr-2 h-4 w-4" />Cliente</Label>
              <Select value={formData.client_id} onValueChange={(v) => handleChange('client_id', v)} required>
                <SelectTrigger id="client_id"><SelectValue placeholder="Selecione um cliente" /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.empresa}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="name"><FolderKanban className="inline-block mr-2 h-4 w-4" />Título do Projeto</Label>
            <Input id="name" value={formData.name} onChange={(e) => handleChange('name', e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Mês de Referência</Label>
            <div className="flex gap-2">
              <Select value={formData.month} onValueChange={(v) => handleChange('month', v)}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Mês" />
                </SelectTrigger>
                <SelectContent>
                  {months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={formData.year} onValueChange={(v) => handleChange('year', v)}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Ano" />
                </SelectTrigger>
                <SelectContent>
                  {years.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="owner_id"><UserCircle className="inline-block mr-2 h-4 w-4" />Responsável pela Execução</Label>
            <Select value={formData.owner_id || 'unassigned'} onValueChange={(v) => handleChange('owner_id', v === 'unassigned' ? '' : v)}>
              <SelectTrigger id="owner_id">
                <SelectValue placeholder="Selecione o responsável" />
              </SelectTrigger>
              <SelectContent>
                {users && users.length > 0 ? (
                  <>
                    <SelectItem value="unassigned">Sem responsável</SelectItem>
                    {users.map(u => (
                      <SelectItem key={u.id} value={u.id}>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={u.avatar_url} />
                            <AvatarFallback>{u.full_name ? u.full_name.charAt(0).toUpperCase() : '?'}</AvatarFallback>
                          </Avatar>
                          <span>{u.full_name || 'Sem nome'}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </>
                ) : (
                  <SelectItem value="loading" disabled>Carregando usuários...</SelectItem>
                )}
              </SelectContent>
            </Select>
            {users && users.length === 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400">Nenhum usuário encontrado no sistema</p>
            )}
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