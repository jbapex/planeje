import React, { useState, useEffect, useCallback } from 'react';
    import { Button } from "@/components/ui/button";
    import { Plus, Bot, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
    import { useToast } from "@/components/ui/use-toast";
    import { supabase } from '@/lib/customSupabaseClient';
    import { useAuth } from '@/contexts/SupabaseAuthContext';
    import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
    import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
    import AutomationForm from './AutomationForm';

    const TaskAutomations = ({ statusOptions, users }) => {
      const [automations, setAutomations] = useState([]);
      const [loading, setLoading] = useState(true);
      const [isFormOpen, setIsFormOpen] = useState(false);
      const [selectedAutomation, setSelectedAutomation] = useState(null);
      const { toast } = useToast();
      const { user } = useAuth();
      
      const fetchAutomations = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
          .from('task_automations')
          .select('*');
          
        if (error) {
          toast({ title: 'Erro ao carregar automações', description: error.message, variant: 'destructive' });
        } else {
          setAutomations(data);
        }
        setLoading(false);
      }, [toast]);
      
      useEffect(() => {
        fetchAutomations();
      }, [fetchAutomations]);

      const handleSave = () => {
        fetchAutomations();
        setIsFormOpen(false);
        setSelectedAutomation(null);
      };

      const handleDelete = async (id) => {
        const { error } = await supabase.from('task_automations').delete().eq('id', id);
        if (error) {
          toast({ title: 'Erro ao excluir automação', description: error.message, variant: 'destructive' });
        } else {
          toast({ title: 'Automação excluída com sucesso!' });
          fetchAutomations();
        }
      };

      const handleToggleActive = async (automation) => {
        const { error } = await supabase
          .from('task_automations')
          .update({ is_active: !automation.is_active })
          .eq('id', automation.id);
          
        if (error) {
          toast({ title: 'Erro ao atualizar automação', description: error.message, variant: 'destructive' });
        } else {
          toast({ title: `Automação ${!automation.is_active ? 'ativada' : 'desativada'}.` });
          fetchAutomations();
        }
      };

      const renderTriggerDescription = (automation) => {
        const config = automation.trigger_config || {};
        switch (automation.trigger_type) {
          case 'status_change':
            const from = (config.from_status && config.from_status.length > 0)
              ? config.from_status.map(s => statusOptions.find(opt => opt.value === s)?.label || s).join(', ')
              : 'Qualquer Status';
            const to = (config.to_status && config.to_status.length > 0)
              ? config.to_status.map(s => statusOptions.find(opt => opt.value === s)?.label || s).join(', ')
              : 'Qualquer Status';
            return `Quando o status mudar de "${from}" para "${to}"`;
          case 'task_created':
            return `Quando uma nova tarefa for criada`;
          case 'due_date_arrived':
            return `Quando a data de vencimento chegar`;
          default:
            return 'Gatilho desconhecido';
        }
      };

      const renderActionDescription = (action) => {
        const config = action.config;
        switch (action.type) {
          case 'notify_user':
            const usersToNotify = (config.assignee_ids || [])
                .map(id => users.find(u => u.id === id)?.full_name || id)
                .join(', ');
            return `Notificar ${usersToNotify || 'ninguém'}`;
          case 'add_comment':
            return `Adicionar comentário: "${config.comment}"`;
          case 'change_status':
            const status = statusOptions.find(s => s.value === config.status)?.label || 'Status desconhecido';
            return `Mudar status para "${status}"`;
          case 'set_assignee':
             const assignees = (config.assignee_ids || [])
                .map(id => users.find(u => u.id === id)?.full_name || id)
                .join(', ');
            return `Adicionar responsáveis: ${assignees || 'ninguém'}`;
          case 'remove_assignee':
            const assigneesToRemove = (config.assignee_ids || [])
                .map(id => users.find(u => u.id === id)?.full_name || id)
                .join(', ');
            return `Remover responsáveis: ${assigneesToRemove || 'Todos'}`;
          case 'reassign_previous':
            return `Reatribuir ao responsável anterior`;
          case 'change_priority':
            return `Alterar prioridade para "${config.priority}"`;
          case 'create_subtask':
            return `Criar subtarefa: "${config.title}"`;
          case 'move_task':
            return `Mover para "Redes Sociais (Concluído)"`;
          default:
            return 'Ação desconhecida';
        }
      };

      if (isFormOpen || selectedAutomation) {
        return (
          <AutomationForm
            statusOptions={statusOptions}
            users={users}
            onSave={handleSave}
            onCancel={() => { setIsFormOpen(false); setSelectedAutomation(null); }}
            automation={selectedAutomation}
          />
        );
      }

      return (
        <div>
          <div className="flex justify-end mb-4">
            <Button onClick={() => setIsFormOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Nova Automação
            </Button>
          </div>

          {loading ? (
            <p>Carregando automações...</p>
          ) : automations.length === 0 ? (
            <Card className="text-center py-10 dark:bg-gray-800">
              <CardHeader>
                <div className="mx-auto bg-primary/10 text-primary p-3 rounded-full w-fit">
                  <Bot className="h-8 w-8" />
                </div>
                <CardTitle className="mt-4 dark:text-white">Nenhuma automação encontrada</CardTitle>
                <CardDescription className="dark:text-gray-400">Clique em "Nova Automação" para começar a criar regras e otimizar seu fluxo de trabalho.</CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {automations.map(auto => (
                <Card key={auto.id} className="dark:bg-gray-800 dark:border-gray-700">
                  <CardHeader>
                    <CardTitle className="flex justify-between items-start dark:text-white">
                      <span>{auto.name}</span>
                       <Button variant="ghost" size="icon" onClick={() => handleToggleActive(auto)}>
                        {auto.is_active ? <ToggleRight className="text-green-500 h-6 w-6" /> : <ToggleLeft className="text-gray-500 h-6 w-6" />}
                      </Button>
                    </CardTitle>
                    <CardDescription className="dark:text-gray-400">
                      {!auto.is_active && <span className="text-yellow-500 font-semibold">(Pausada)</span>}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="font-semibold text-sm mb-1 dark:text-gray-300">Gatilho:</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{renderTriggerDescription(auto)}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-sm mb-1 dark:text-gray-300">Ações:</p>
                      <ul className="list-disc list-inside space-y-1">
                        {(auto.actions || []).map((action, index) => (
                           <li key={index} className="text-sm text-gray-600 dark:text-gray-400">{renderActionDescription(action)}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" size="sm" onClick={() => setSelectedAutomation(auto)}>Editar</Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm"><Trash2 className="h-4 w-4" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                            <AlertDialogDescription>Tem certeza que deseja excluir a automação "{auto.name}"?</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(auto.id)}>Excluir</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      );
    };

    export default TaskAutomations;