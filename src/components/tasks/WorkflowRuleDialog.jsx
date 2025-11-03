import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const TASK_TYPES = ['arte', 'video', 'planejamento'];
const SUBTASK_TYPES = ['check', 'text'];

const WorkflowRuleDialog = ({ status, isOpen, onClose }) => {
  const [rules, setRules] = useState([]);
  const [selectedType, setSelectedType] = useState(TASK_TYPES[0]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [newSubtaskType, setNewSubtaskType] = useState(SUBTASK_TYPES[0]);
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchRules = useCallback(async () => {
    if (!status) return;
    const { data, error } = await supabase
      .from('workflow_rules')
      .select('*')
      .eq('status_value', status.value);
    
    if (error) {
      toast({ title: 'Erro ao buscar regras', description: error.message, variant: 'destructive' });
    } else {
      setRules(data || []);
    }
  }, [status, toast]);

  useEffect(() => {
    if (isOpen) {
      fetchRules();
    }
  }, [isOpen, fetchRules]);

  const currentRule = rules.find(r => r.task_type === selectedType);
  const currentSubtasks = currentRule?.required_subtasks || [];

  const handleSaveRule = async (subtasks) => {
    if (!user) return;
    
    const { error } = await supabase
      .from('workflow_rules')
      .upsert({
        owner_id: user.id,
        status_value: status.value,
        task_type: selectedType,
        required_subtasks: subtasks,
      }, { onConflict: 'status_value,task_type' });

    if (error) {
      toast({ title: 'Erro ao salvar regra', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Regra salva com sucesso!' });
      fetchRules();
    }
  };

  const handleAddSubtask = () => {
    if (!newSubtaskTitle.trim()) return;
    const newSubtask = { title: newSubtaskTitle.trim(), type: newSubtaskType };
    const updatedSubtasks = [...currentSubtasks, newSubtask];
    handleSaveRule(updatedSubtasks);
    setNewSubtaskTitle('');
    setNewSubtaskType(SUBTASK_TYPES[0]);
  };

  const handleRemoveSubtask = (subtaskToRemove) => {
    const updatedSubtasks = currentSubtasks.filter(s => s.title !== subtaskToRemove.title);
    handleSaveRule(updatedSubtasks);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="dark:text-white">Regras para o Status: {status.label}</DialogTitle>
          <DialogDescription className="dark:text-gray-400">
            Defina as subtarefas obrigatórias para cada tipo de tarefa neste status.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task-type" className="dark:text-white">Tipo de Tarefa</Label>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger id="task-type" className="dark:bg-gray-700 dark:text-white dark:border-gray-600">
                <SelectValue placeholder="Selecione um tipo" />
              </SelectTrigger>
              <SelectContent>
                {TASK_TYPES.map(type => (
                  <SelectItem key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="dark:text-white">Subtarefas Obrigatórias</Label>
            <div className="space-y-2">
              {currentSubtasks.map((subtask, index) => (
                <div key={index} className="flex items-center justify-between p-2 rounded-md bg-gray-100 dark:bg-gray-700">
                  <div className="flex flex-col">
                    <span className="dark:text-gray-200 font-medium">{subtask.title}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">Tipo: {subtask.type}</span>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleRemoveSubtask(subtask)} className="text-red-500 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {currentSubtasks.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-2">Nenhuma subtarefa obrigatória definida.</p>
              )}
            </div>
          </div>

          <div className="space-y-2 pt-4 border-t dark:border-gray-700">
            <Label htmlFor="new-subtask" className="dark:text-white">Adicionar Subtarefa</Label>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                id="new-subtask"
                value={newSubtaskTitle}
                onChange={(e) => setNewSubtaskTitle(e.target.value)}
                placeholder="Ex: Roteiro"
                className="dark:bg-gray-700 dark:text-white dark:border-gray-600"
              />
              <Select value={newSubtaskType} onValueChange={setNewSubtaskType}>
                <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUBTASK_TYPES.map(type => (
                    <SelectItem key={type} value={type}>{type === 'check' ? 'Checkbox' : 'Texto'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleAddSubtask} className="w-full sm:w-auto"><Plus className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="dark:text-white dark:border-gray-600 dark:hover:bg-gray-700">Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default WorkflowRuleDialog;