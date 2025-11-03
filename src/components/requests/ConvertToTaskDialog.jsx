import React, { useState } from 'react';
import { Save, FolderKanban, ListTodo } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const TASK_TYPES = ['Reels', 'Carrossel', 'Arte', 'Legenda', 'Estratégia', 'Outro'];

const ConvertToTaskDialog = ({ request, projects, onSave, onClose }) => {
  const { user } = useAuth();
  const [taskData, setTaskData] = useState({
    project_id: '',
    title: request.title,
    type: 'Outro',
  });

  const handleChange = (field, value) => {
    setTaskData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = () => {
    const finalTaskData = {
      ...taskData,
      description: request.description,
      status: 'todo',
      client_id: request.client_id,
      owner_id: user.id,
      due_date: request.prazo,
    };
    onSave(finalTaskData);
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Converter Solicitação em Tarefa</DialogTitle>
          <DialogDescription>Criar uma nova tarefa a partir da solicitação: "{request.title}"</DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project_id"><FolderKanban className="inline-block mr-2 h-4 w-4" />Projeto</Label>
            <Select value={taskData.project_id} onValueChange={(v) => handleChange('project_id', v)}>
              <SelectTrigger id="project_id"><SelectValue placeholder="Selecione um projeto (opcional)" /></SelectTrigger>
              <SelectContent>
                {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="title">Descrição da Tarefa</Label>
            <Input id="title" value={taskData.title} onChange={(e) => handleChange('title', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="type"><ListTodo className="inline-block mr-2 h-4 w-4" />Tipo</Label>
            <Select value={taskData.type} onValueChange={(v) => handleChange('type', v)}>
              <SelectTrigger id="type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TASK_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit}><Save size={16} className="mr-2" />Criar Tarefa</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConvertToTaskDialog;