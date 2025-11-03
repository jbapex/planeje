import React, { useState, useEffect } from 'react';
    import { Button } from "@/components/ui/button";
    import { Input } from "@/components/ui/input";
    import { Label } from "@/components/ui/label";
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
    import { MultiSelect } from "@/components/ui/multi-select";
    import { useToast } from "@/components/ui/use-toast";
    import { supabase } from '@/lib/customSupabaseClient';
    import { useAuth } from '@/contexts/SupabaseAuthContext';
    import { X, ArrowLeft, ArrowRight, Plus, Trash2, GripVertical, Bot, UserX, Move, UserCheck, Repeat } from 'lucide-react';

    const triggerTypes = [
      { value: 'status_change', label: 'Alterações de status' },
      { value: 'task_created', label: 'Tarefa criada' },
      { value: 'due_date_arrived', label: 'Data de vencimento chega' },
    ];

    const actionTypes = [
      { value: 'change_status', label: 'Mudar o status' },
      { value: 'set_assignee', label: 'Adicionar responsável' },
      { value: 'remove_assignee', label: 'Remover responsável' },
      { value: 'reassign_previous', label: 'Reatribuir ao responsável anterior' },
      { value: 'change_priority', label: 'Alterar prioridade' },
      { value: 'move_task', label: 'Mover para...' },
      { value: 'create_subtask', label: 'Criar uma subtarefa' },
      { value: 'notify_user', label: 'Notificar usuário' },
      { value: 'add_comment', label: 'Adicionar comentário' },
    ];

    const priorityOptions = [
      { value: 'low', label: 'Baixa' },
      { value: 'medium', label: 'Média' },
      { value: 'high', label: 'Alta' },
      { value: 'urgent', label: 'Urgente' },
    ];

    const moveOptions = [
        { value: 'social_media_completed', label: 'Redes Sociais (Concluído)' },
    ];

    const renderStatusOption = (status) => ({
        value: status.value,
        label: status.label,
        content: (
            <div className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${status.color}`}></span>
                <span>{status.label}</span>
            </div>
        )
    });

    const AutomationForm = ({ statusOptions, users, onSave, onCancel, automation }) => {
      const [name, setName] = useState('');
      const [triggerType, setTriggerType] = useState('status_change');
      const [triggerConfig, setTriggerConfig] = useState({ from_status: [], to_status: [] });
      const [actions, setActions] = useState([]);
      const [isSubmitting, setIsSubmitting] = useState(false);

      const { toast } = useToast();
      const { user } = useAuth();
      
      const userOptions = users.map(u => ({ value: u.id, label: u.full_name }));

      useEffect(() => {
        if (automation) {
          setName(automation.name || 'Nova Automação');
          setTriggerType(automation.trigger_type);
          setTriggerConfig(automation.trigger_config || { from_status: [], to_status: [] });
          setActions(automation.actions?.map(a => ({...a, id: Math.random()})) || []);
        } else {
          setName('Nova Automação');
          setTriggerType('status_change');
          setActions([{ type: 'change_status', config: {}, id: Date.now() }]);
        }
      }, [automation]);

      const handleActionChange = (id, field, value) => {
        setActions(actions.map(action => {
          if (action.id === id) {
            if (field === 'type') {
              // Quando o tipo muda, inicializa config apropriado
              const newConfig = {};
              if (value === 'set_assignee' || value === 'remove_assignee') {
                newConfig.assignee_ids = [];
              }
              return { ...action, [field]: value, config: newConfig };
            }
            return { ...action, [field]: value };
          }
          return action;
        }));
      };
      
      const addAction = () => {
        setActions([...actions, { type: 'change_status', config: {}, id: Date.now() }]);
      };

      const removeAction = (id) => {
        setActions(actions.filter(action => action.id !== id));
      };

      const handleSubmit = async (e) => {
        e.preventDefault();
        if (actions.length === 0) {
            toast({ title: "Nenhuma ação definida", description: "Você precisa adicionar pelo menos uma ação.", variant: 'destructive' });
            return;
        }
        setIsSubmitting(true);
      
        // Garante que assignee_ids seja sempre array quando necessário
        const cleanedActions = actions.map(({id, ...rest}) => {
          const cleanedAction = { ...rest };
          // Garante que set_assignee e remove_assignee tenham assignee_ids como array
          if ((cleanedAction.type === 'set_assignee' || cleanedAction.type === 'remove_assignee')) {
            if (!cleanedAction.config) cleanedAction.config = {};
            if (!Array.isArray(cleanedAction.config.assignee_ids)) {
              cleanedAction.config.assignee_ids = cleanedAction.config.assignee_ids 
                ? [cleanedAction.config.assignee_ids] 
                : [];
            }
          }
          return cleanedAction;
        });
      
        const automationData = {
          owner_id: user.id,
          name,
          trigger_type: triggerType,
          trigger_config: triggerConfig,
          actions: cleanedActions, // ações já limpas e validadas
        };

        let error;
        if (automation) {
          ({ error } = await supabase.from('task_automations').update(automationData).eq('id', automation.id));
        } else {
          ({ error } = await supabase.from('task_automations').insert(automationData));
        }

        if (error) {
          toast({ title: 'Erro ao salvar automação', description: error.message, variant: 'destructive' });
        } else {
          toast({ title: `Automação ${automation ? 'atualizada' : 'criada'} com sucesso!` });
          onSave();
        }
        setIsSubmitting(false);
      };
      
      const getSummary = () => {
        const triggerLabel = triggerTypes.find(t => t.value === triggerType)?.label;
        const actionLabels = actions.map(a => actionTypes.find(at => at.value === a.type)?.label).filter(Boolean);
        
        if (!triggerLabel || actionLabels.length === 0) return null;

        return (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">Quando</span>
            <span className="bg-gray-200 dark:bg-gray-600 px-2 py-1 rounded-md text-sm">{triggerLabel}</span>
            <span className="font-medium">então</span>
            {actionLabels.map((label, index) => (
              <React.Fragment key={index}>
                <span className="bg-gray-200 dark:bg-gray-600 px-2 py-1 rounded-md text-sm">{label}</span>
                {index < actionLabels.length - 1 && <span className="font-medium">e</span>}
              </React.Fragment>
            ))}
          </div>
        );
      };


      const TriggerCard = () => (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm w-full">
          <div className="flex items-center gap-2 mb-4">
            <div className="bg-indigo-100 dark:bg-indigo-900/50 p-2 rounded-md">
              <Bot className="h-5 w-5 text-indigo-500" />
            </div>
            <h3 className="font-bold text-lg dark:text-white">Acionar</h3>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-md space-y-4">
            <Select value={triggerType} onValueChange={setTriggerType} required>
                <SelectTrigger><SelectValue placeholder="Selecione um gatilho" /></SelectTrigger>
                <SelectContent>{triggerTypes.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
            {renderTriggerConfig()}
          </div>
        </div>
      );

      const ActionCard = ({ action }) => (
        <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-md space-y-4 relative group">
            <div className="flex items-center justify-between">
               <Select value={action.type} onValueChange={(v) => handleActionChange(action.id, 'type', v)} required>
                    <SelectTrigger><SelectValue placeholder="Selecione uma ação" /></SelectTrigger>
                    <SelectContent>{actionTypes.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
                </Select>
                {actions.length > 1 && (
                    <Button variant="ghost" size="icon" className="absolute top-2 right-2 opacity-0 group-hover:opacity-100" onClick={() => removeAction(action.id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                )}
            </div>
          {renderActionConfig(action)}
        </div>
      );

      // Funções auxiliares para converter entre strings e objetos para MultiSelect
      const convertStatusArrayToObjects = (statusArray) => {
        if (!statusArray || statusArray.length === 0) return [];
        return statusArray.map(statusValue => {
          const status = statusOptions.find(s => s.value === statusValue);
          return status ? renderStatusOption(status) : null;
        }).filter(Boolean);
      };

      const convertObjectsToStatusArray = (objects) => {
        if (!objects || objects.length === 0) return [];
        return objects.map(obj => obj.value);
      };

      // Funções para converter assignee_ids
      const convertAssigneeArrayToObjects = (assigneeArray) => {
        if (!assigneeArray || assigneeArray.length === 0) return [];
        return assigneeArray.map(assigneeId => {
          return userOptions.find(u => u.value === assigneeId);
        }).filter(Boolean);
      };

      const convertObjectsToAssigneeArray = (objects) => {
        if (!objects || objects.length === 0) return [];
        return objects.map(obj => obj.value);
      };

      const renderTriggerConfig = () => {
        switch (triggerType) {
          case 'status_change':
            return (
              <>
                <div>
                  <Label className="text-xs text-gray-500 dark:text-gray-400">De</Label>
                  <MultiSelect
                    options={statusOptions.map(renderStatusOption)}
                    value={convertStatusArrayToObjects(triggerConfig.from_status)}
                    onChange={(v) => setTriggerConfig({ ...triggerConfig, from_status: convertObjectsToStatusArray(v) })}
                    placeholder="Qualquer Status"
                    className="bg-white dark:bg-gray-800"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-500 dark:text-gray-400">Para</Label>
                  <MultiSelect
                    options={statusOptions.map(renderStatusOption)}
                    value={convertStatusArrayToObjects(triggerConfig.to_status)}
                    onChange={(v) => setTriggerConfig({ ...triggerConfig, to_status: convertObjectsToStatusArray(v) })}
                    placeholder="Selecione um ou mais status"
                    className="bg-white dark:bg-gray-800"
                  />
                </div>
              </>
            );
          default:
            return <p className="text-sm text-center text-gray-500 dark:text-gray-400 py-4">Configuração para este gatilho em breve.</p>;
        }
      };

      const renderActionConfig = (action) => {
        const updateConfig = (field, value) => {
            setActions(actions.map(a => 
              a.id === action.id 
                ? { ...a, config: { ...a.config, [field]: value } }
                : a
            ));
        };

        switch (action.type) {
          case 'change_status':
            return (
              <div>
                <Label className="text-xs text-gray-500 dark:text-gray-400">Mover para</Label>
                <Select value={action.config.status || ''} onValueChange={(v) => updateConfig('status', v)} required>
                  <SelectTrigger className="bg-white dark:bg-gray-800"><SelectValue placeholder="Selecione o status" /></SelectTrigger>
                  <SelectContent>{statusOptions.map(s => <SelectItem key={s.value} value={s.value}>{renderStatusOption(s).content}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            );
          case 'set_assignee':
            return (
              <div>
                <Label className="text-xs text-gray-500 dark:text-gray-400">Adicionar usuários</Label>
                 <MultiSelect
                    options={userOptions}
                    value={convertAssigneeArrayToObjects(action.config?.assignee_ids || [])}
                    onChange={(v) => updateConfig('assignee_ids', convertObjectsToAssigneeArray(v))}
                    placeholder="Selecione um ou mais usuários"
                    className="bg-white dark:bg-gray-800"
                  />
              </div>
            );
          case 'remove_assignee':
            return (
              <div>
                <Label className="text-xs text-gray-500 dark:text-gray-400">Remover usuários</Label>
                 <MultiSelect
                    options={userOptions}
                    value={convertAssigneeArrayToObjects(action.config?.assignee_ids || [])}
                    onChange={(v) => updateConfig('assignee_ids', convertObjectsToAssigneeArray(v))}
                    placeholder="Deixe em branco para remover todos"
                    className="bg-white dark:bg-gray-800"
                  />
              </div>
            );
          case 'reassign_previous':
            return (
                <div>
                    <Label className="text-xs text-gray-500 dark:text-gray-400">Buscar responsável do status</Label>
                    <Select value={action.config.from_status || ''} onValueChange={(v) => updateConfig('from_status', v)} required>
                        <SelectTrigger className="bg-white dark:bg-gray-800"><SelectValue placeholder="Selecione o status de origem" /></SelectTrigger>
                        <SelectContent>{statusOptions.map(s => <SelectItem key={s.value} value={s.value}>{renderStatusOption(s).content}</SelectItem>)}</SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">A tarefa será atribuída ao último responsável que trabalhou nela no status selecionado.</p>
                </div>
            );
          case 'move_task':
            return (
                <div>
                    <Label className="text-xs text-gray-500 dark:text-gray-400">Destino</Label>
                    <Select value={action.config.destination || ''} onValueChange={(v) => updateConfig('destination', v)} required>
                        <SelectTrigger className="bg-white dark:bg-gray-800"><SelectValue placeholder="Selecione o destino" /></SelectTrigger>
                        <SelectContent>{moveOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
            );
          default:
            return <p className="text-sm text-center text-gray-500 dark:text-gray-400 py-4">Configuração para esta ação em breve.</p>;
        }
      };

      return (
        <div className="fixed inset-0 bg-gray-100 dark:bg-gray-900 z-50 flex flex-col">
           <header className="flex items-center justify-between p-4 border-b dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={onCancel}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <Input id="name" value={name} onChange={e => setName(e.target.value)} required className="text-lg font-semibold border-none focus-visible:ring-0 shadow-none p-0 dark:bg-gray-800" />
                </div>
                <Button variant="ghost" onClick={onCancel}>
                    <X className="h-5 w-5" />
                </Button>
            </header>

          <main className="flex-grow overflow-y-auto p-8">
            <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
              <div className="flex items-start gap-8">
                <div className="w-1/2 flex-shrink-0">
                  <TriggerCard />
                </div>

                <div className="flex items-center h-full pt-20">
                  <ArrowRight className="text-gray-400 dark:text-gray-500" />
                </div>

                <div className="w-1/2 flex flex-col gap-4">
                  <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm w-full">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="bg-indigo-100 dark:bg-indigo-900/50 p-2 rounded-md">
                         <Bot className="h-5 w-5 text-indigo-500 -scale-x-100" />
                      </div>
                      <h3 className="font-bold text-lg dark:text-white">Ação</h3>
                    </div>
                    <div className="space-y-4">
                      {actions.map((action) => (
                        <div key={action.id} className="flex items-start gap-2">
                            <GripVertical className="h-5 w-5 text-gray-400 mt-5 flex-shrink-0" />
                            <div className="w-full">
                               <ActionCard action={action} />
                            </div>
                        </div>
                      ))}
                      <Button type="button" variant="outline" className="w-full" onClick={addAction}>
                        <Plus className="mr-2 h-4 w-4" /> Adicionar Ação
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </form>
          </main>

           <footer className="flex items-center justify-between p-4 border-t dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0">
                <div className="text-sm text-gray-700 dark:text-gray-300">
                    {getSummary()}
                </div>
                <div className="flex gap-2">
                    <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button>
                    <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
                        {isSubmitting ? 'Salvando...' : 'Salvar'}
                    </Button>
                </div>
            </footer>
        </div>
      );
    };

    export default AutomationForm;