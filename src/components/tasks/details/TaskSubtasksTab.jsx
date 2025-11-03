import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { PlusCircle, X, Lock } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Textarea } from '@/components/ui/textarea';

const TaskSubtasksTab = ({ taskId, taskType, taskStatus, onSubtasksChange, subtasks: initialSubtasks, isNewTask }) => {
  const [subtasks, setSubtasks] = useState(initialSubtasks || []);
  const [newSubtask, setNewSubtask] = useState('');
  const { toast } = useToast();
  const isFetching = useRef(false);

  const fetchSubtasksAndRules = useCallback(async () => {
    if (!taskId || isNewTask || isFetching.current) {
      if (isNewTask) {
        setSubtasks([]);
        onSubtasksChange([]);
      }
      return;
    }

    isFetching.current = true;

    try {
      const { data: currentSubtasksData, error: fetchError } = await supabase
        .from('task_subtasks')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });

      if (fetchError) {
        toast({ title: "Erro ao buscar subtarefas existentes", description: fetchError.message, variant: "destructive" });
        return;
      }
      
      const currentSubtasks = currentSubtasksData || [];
      let requiredSteps = [];
      if (taskType && taskStatus) {
        const { data: ruleData, error: ruleError } = await supabase
          .from('workflow_rules')
          .select('required_subtasks')
          .eq('task_type', taskType)
          .eq('status_value', taskStatus)
          .maybeSingle();
        
        if (ruleError) {
          toast({ title: "Erro ao buscar regras de workflow", description: ruleError.message, variant: "destructive" });
        }
        if (ruleData) {
          requiredSteps = ruleData.required_subtasks || [];
        }
      }
      
      const existingTitles = new Set(currentSubtasks.map(st => st.title));
      
      const stepsToCreate = requiredSteps
        .filter(step => !existingTitles.has(step.title))
        .map(step => ({ 
          task_id: taskId, 
          title: step.title, 
          is_required: true,
          type: step.type,
          is_completed: false,
        }));

      if (stepsToCreate.length > 0) {
        const { data: insertedData, error: insertError } = await supabase.from('task_subtasks').insert(stepsToCreate).select();
        if (insertError) {
          toast({ title: "Erro ao criar subtarefas obrigatórias", description: insertError.message, variant: "destructive" });
        } else {
          const allSubtasks = [...currentSubtasks, ...insertedData].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
          setSubtasks(allSubtasks);
          onSubtasksChange(allSubtasks);
        }
      } else {
        setSubtasks(currentSubtasks);
        onSubtasksChange(currentSubtasks);
      }
    } finally {
      isFetching.current = false;
    }
  }, [taskId, taskType, taskStatus, toast, onSubtasksChange, isNewTask]);

  useEffect(() => {
    fetchSubtasksAndRules();
  }, [fetchSubtasksAndRules]);

  const handleAddSubtask = async () => {
    if (!newSubtask.trim() || isNewTask) return;
    const { data: inserted, error } = await supabase.from('task_subtasks').insert({ task_id: taskId, title: newSubtask, is_required: false, type: 'check', is_completed: false }).select();
    if (error) {
      toast({ title: "Erro ao adicionar subtarefa", description: error.message, variant: "destructive" });
    } else {
      setNewSubtask('');
      const updatedSubtasks = [...subtasks, ...inserted];
      setSubtasks(updatedSubtasks);
      onSubtasksChange(updatedSubtasks);
    }
  };

  const updateSubtask = async (subtaskId, updates) => {
    const { data, error } = await supabase.from('task_subtasks').update(updates).eq('id', subtaskId).select();
    if (error) {
      toast({ title: "Erro ao atualizar subtarefa", description: error.message, variant: "destructive" });
    } else {
      const updatedSubtasks = subtasks.map(st => st.id === subtaskId ? data[0] : st);
      setSubtasks(updatedSubtasks);
      onSubtasksChange(updatedSubtasks);
    }
  };

  const handleDeleteSubtask = async (subtaskId, isRequired) => {
    if (isRequired) {
      toast({ title: "Ação não permitida", description: "Subtarefas obrigatórias não podem ser removidas.", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from('task_subtasks').delete().eq('id', subtaskId);
    if (error) {
      toast({ title: "Erro ao remover subtarefa", description: error.message, variant: "destructive" });
    } else {
      const updatedSubtasks = subtasks.filter(st => st.id !== subtaskId);
      setSubtasks(updatedSubtasks);
      onSubtasksChange(updatedSubtasks);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input value={newSubtask} onChange={e => setNewSubtask(e.target.value)} placeholder="Adicionar subtarefa rápida..." onKeyPress={e => e.key === 'Enter' && handleAddSubtask()} className="dark:bg-gray-700 dark:text-white dark:border-gray-600 text-sm" disabled={isNewTask} />
        <Button onClick={handleAddSubtask} disabled={isNewTask} size="icon"><PlusCircle size={16} /></Button>
      </div>
      <div className="space-y-3">
        {subtasks.map(subtask => (
          <div key={subtask.id} className="p-3 rounded-md bg-gray-50 dark:bg-gray-900/50 border dark:border-gray-700">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3 flex-grow">
                {subtask.type === 'check' && (
                  <Checkbox 
                    className="mt-1"
                    checked={subtask.is_completed} 
                    onCheckedChange={() => updateSubtask(subtask.id, { is_completed: !subtask.is_completed })} 
                  />
                )}
                <div className="flex-grow space-y-2">
                  <span className={`${subtask.is_completed ? 'line-through text-gray-500 dark:text-gray-400' : 'dark:text-white'} flex items-center font-medium text-sm`}>
                    {subtask.title}
                    {subtask.is_required && <Lock className="ml-2 h-3 w-3 text-yellow-500" />}
                  </span>
                  {subtask.type === 'text' && (
                    <Textarea
                      placeholder={`Escreva o ${subtask.title.toLowerCase()} aqui...`}
                      value={subtask.content || ''}
                      onChange={(e) => {
                        const newContent = e.target.value;
                        const updatedSubtasks = subtasks.map(st => st.id === subtask.id ? {...st, content: newContent} : st);
                        setSubtasks(updatedSubtasks);
                        onSubtasksChange(updatedSubtasks);
                      }}
                      onBlur={(e) => updateSubtask(subtask.id, { content: e.target.value, is_completed: !!e.target.value.trim() })}
                      className="dark:bg-gray-800 dark:text-white dark:border-gray-600 text-sm"
                      rows={3}
                    />
                  )}
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => handleDeleteSubtask(subtask.id, subtask.is_required)} className="dark:text-gray-400 dark:hover:text-white ml-2 flex-shrink-0">
                <X size={16} />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TaskSubtasksTab;