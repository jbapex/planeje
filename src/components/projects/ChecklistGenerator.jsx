import React, { useState } from 'react';
import { Save, Sparkles, Plus, Trash2, Edit, Check, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle as AlertDialogTitleComponent } from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader } from '@/components/ui/card';

const TASK_TYPES = ['Post Feed', 'Stories', 'Reels', 'Design', 'Copy', 'Planejamento', 'Reunião', 'Edição de Vídeo', 'Captação', 'Roteiro'];

const ChecklistGenerator = ({ project, onClose, fetchProjects, isPage = false }) => {
  const [tasks, setTasks] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [showOpenAIAlert, setShowOpenAIAlert] = useState(false);
  const { toast } = useToast();
  const { user, getOpenAIKey } = useAuth();

  const generateChecklist = async () => {
    const apiKey = await getOpenAIKey();
    if (!apiKey) {
      setShowOpenAIAlert(true);
      return;
    }
    
    toast({ title: "🚧 Funcionalidade não implementada!", description: "A geração com IA será adicionada em breve. 🚀" });
    
    const mockTasks = [
      { id: Date.now() + 1, title: `Definir estratégia para ${project.name}`, description: 'Detalhar os objetivos e KPIs.', type: 'Planejamento' },
      { id: Date.now() + 2, title: `Criar 3 posts para ${project.name}`, description: 'Posts para feed sobre o tema.', type: 'Post Feed' },
    ];
    setTasks(mockTasks);
  };

  const addTask = () => setTasks([...tasks, { id: Date.now(), title: 'Nova Tarefa', description: '', type: 'Post Feed' }]);
  const removeTask = (id) => setTasks(tasks.filter(t => t.id !== id));
  const updateTask = (id, field, value) => setTasks(tasks.map(t => t.id === id ? { ...t, [field]: value } : t));

  const createTasks = async () => {
    if (tasks.length === 0) {
      toast({ title: "Nenhuma tarefa para criar", variant: "destructive" });
      return;
    }
    const newTasks = tasks.map(task => ({
      title: task.title,
      description: task.description,
      status: 'todo',
      project_id: project.id,
      client_id: project.client_id,
      owner_id: user.id,
      type: task.type,
    }));
    const { error } = await supabase.from('tarefas').insert(newTasks);
    if (error) toast({ title: "Erro ao criar tarefas", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Tarefas criadas com sucesso!", description: "Elas já estão disponíveis na página de Tarefas." });
      if (fetchProjects) fetchProjects();
      if (!isPage) onClose();
      setTasks([]);
    }
  };
  
  const renderContent = () => (
     <div className="space-y-4">
      <div className="flex gap-2">
        <Button onClick={generateChecklist} disabled={isGenerating}><Sparkles size={16} className="mr-2" />{isGenerating ? 'Gerando...' : 'Sugerir com IA'}</Button>
        <Button variant="outline" onClick={addTask}><Plus size={16} className="mr-2" />Adicionar Tarefa</Button>
      </div>
      <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
        {tasks.map(task => (
          <div key={task.id} className="p-3 border rounded-lg flex items-center gap-2">
            {editingTask === task.id ? (
              <>
                <Input value={task.title} onChange={e => updateTask(task.id, 'title', e.target.value)} />
                <Button size="icon" onClick={() => setEditingTask(null)}><Check className="h-4 w-4" /></Button>
              </>
            ) : (
              <>
                <div className="flex-grow">
                  <p className="font-medium">{task.title}</p>
                  <Input className="text-sm mt-1" placeholder="Descrição..." value={task.description} onChange={e => updateTask(task.id, 'description', e.target.value)} />
                </div>
                <Select value={task.type} onValueChange={v => updateTask(task.id, 'type', v)}>
                  <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TASK_TYPES.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" onClick={() => setEditingTask(task.id)}><Edit className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => removeTask(task.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const renderAlerts = () => (
    <AlertDialog open={showOpenAIAlert} onOpenChange={setShowOpenAIAlert}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitleComponent><AlertTriangle className="inline mr-2 text-yellow-500" />Chave da OpenAI não encontrada</AlertDialogTitleComponent>
          <AlertDialogDescription>Para usar o assistente de IA, por favor, adicione sua chave da API da OpenAI na página de Configurações.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogAction onClick={() => setShowOpenAIAlert(false)}>Entendi</AlertDialogAction>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (isPage) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <h2 className="text-2xl font-semibold">Checklist de Tarefas</h2>
                <Button onClick={createTasks} disabled={tasks.length === 0}><Save size={16} className="mr-2" />Criar {tasks.length} Tarefa(s)</Button>
            </CardHeader>
            <CardContent>
                {renderContent()}
                {renderAlerts()}
            </CardContent>
        </Card>
    );
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Checklist de Tarefas: {project.name}</DialogTitle></DialogHeader>
        <div className="py-4">
            {renderContent()}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={createTasks} disabled={tasks.length === 0}><Save size={16} className="mr-2" />Criar {tasks.length} Tarefa(s)</Button>
        </DialogFooter>
        {renderAlerts()}
      </DialogContent>
    </Dialog>
  );
};

export default ChecklistGenerator;