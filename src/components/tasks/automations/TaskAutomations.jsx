import React, { useState, useEffect, useCallback, useRef } from 'react';
    import { Button } from "@/components/ui/button";
    import { Label } from "@/components/ui/label";
    import { MultiSelect } from "@/components/ui/multi-select";
    import { Plus, Bot, Trash2, ToggleLeft, ToggleRight, Layers } from 'lucide-react';
    import { useToast } from "@/components/ui/use-toast";
    import { supabase } from '@/lib/customSupabaseClient';
    import { clearTaskAutomationsCache } from '@/lib/workflow';
    import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
    import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
    import AutomationForm from './AutomationForm';

    const TaskAutomations = ({ statusOptions, users, onTasksMutated }) => {
      const [automations, setAutomations] = useState([]);
      const [loading, setLoading] = useState(true);
      const [isFormOpen, setIsFormOpen] = useState(false);
      const [selectedAutomation, setSelectedAutomation] = useState(null);
      const [bulkStatusValues, setBulkStatusValues] = useState([]);
      const [bulkCount, setBulkCount] = useState(null);
      const [bulkCountLoading, setBulkCountLoading] = useState(false);
      const [bulkLoading, setBulkLoading] = useState(false);
      const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
      const bulkSeededRef = useRef(false);
      const { toast } = useToast();

      useEffect(() => {
        if (!statusOptions.length || bulkSeededRef.current) return;
        const initial = statusOptions
          .filter(
            (s) =>
              /publicad/i.test(s.label || '') ||
              /^(published|publicado)$/i.test(String(s.value || ''))
          )
          .map((s) => s.value);
        if (initial.length) setBulkStatusValues(initial);
        bulkSeededRef.current = true;
      }, [statusOptions]);

      const statusMultiOptions = (statusOptions || []).map((s) => ({
        value: s.value,
        label: s.label || s.value,
      }));

      const bulkStatusObjects = bulkStatusValues
        .map((v) => statusMultiOptions.find((o) => o.value === v))
        .filter(Boolean);

      const refreshBulkCount = useCallback(async () => {
        if (!bulkStatusValues.length) {
          setBulkCount(null);
          setBulkCountLoading(false);
          return;
        }
        setBulkCountLoading(true);
        try {
          const { count, error } = await supabase
            .from('tarefas')
            .select('id', { count: 'exact', head: true })
            .in('status', bulkStatusValues)
            .or('type.is.null,type.neq.social_media');
          if (error) {
            setBulkCount(null);
            return;
          }
          setBulkCount(count ?? 0);
        } finally {
          setBulkCountLoading(false);
        }
      }, [bulkStatusValues]);

      useEffect(() => {
        refreshBulkCount();
      }, [refreshBulkCount]);

      const handleBulkMove = async () => {
        if (!bulkStatusValues.length) {
          toast({
            title: 'Selecione ao menos um status',
            variant: 'destructive',
          });
          return;
        }
        setBulkLoading(true);
        try {
          const { data: moved, error } = await supabase.rpc('bulk_move_tasks_to_social_media', {
            status_values: bulkStatusValues,
          });
          if (error) {
            toast({
              title: 'Erro ao mover tarefas',
              description: error.message,
              variant: 'destructive',
            });
            return;
          }
          const n = typeof moved === 'number' ? moved : 0;
          toast({
            title: 'Concluído',
            description:
              n === 0
                ? 'Nenhuma tarefa correspondente ao filtro (já em Redes Sociais ou sem esse status).'
                : `${n} tarefa(s) enviada(s) para Redes Sociais (concluído).`,
          });
          await refreshBulkCount();
          if (onTasksMutated) await onTasksMutated();
          setBulkConfirmOpen(false);
        } finally {
          setBulkLoading(false);
        }
      };
      
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
        clearTaskAutomationsCache();
        fetchAutomations();
        setIsFormOpen(false);
        setSelectedAutomation(null);
      };

      const handleDelete = async (id) => {
        const { error } = await supabase.from('task_automations').delete().eq('id', id);
        if (error) {
          toast({ title: 'Erro ao excluir automação', description: error.message, variant: 'destructive' });
        } else {
          clearTaskAutomationsCache();
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
          clearTaskAutomationsCache();
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
          <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-start sm:justify-between">
            <Card className="flex-1 border-amber-200/80 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base dark:text-white">
                  <Layers className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                  Mover em massa para Redes Sociais
                </CardTitle>
                <CardDescription className="dark:text-gray-400">
                  A automação só roda quando o status <span className="font-medium">muda</span>. Tarefas que já estavam em Publicado não voltam no tempo — use aqui para esvaziar essa fila (mesmo efeito da automação: tipo Redes Sociais, concluído, sem responsáveis).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Status de origem</Label>
                  <MultiSelect
                    options={statusMultiOptions}
                    value={bulkStatusObjects}
                    onChange={(objs) => setBulkStatusValues((objs || []).map((o) => o.value))}
                    placeholder="Ex.: Publicado"
                    className="mt-1 bg-white dark:bg-gray-800"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {bulkStatusValues.length === 0
                      ? 'Selecione um ou mais status.'
                      : bulkCountLoading
                        ? 'Contando tarefas…'
                        : `Encontradas: ${bulkCount === null ? '—' : bulkCount} tarefa(s) no Kanban principal (fora de Redes Sociais).`}
                  </span>
                  <AlertDialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={
                        bulkLoading ||
                        bulkCountLoading ||
                        !bulkStatusValues.length ||
                        bulkCount === null ||
                        bulkCount === 0
                      }
                      onClick={() => setBulkConfirmOpen(true)}
                    >
                      Mover agora
                    </Button>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Mover {bulkCount ?? '…'} tarefa(s)?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Elas sairão do quadro de tarefas e irão para o módulo Redes Sociais como concluídas, com responsáveis removidos. Esta ação não pode ser desfeita pelo sistema.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={bulkLoading}>Cancelar</AlertDialogCancel>
                        <Button type="button" disabled={bulkLoading} onClick={() => void handleBulkMove()}>
                          {bulkLoading ? 'Processando…' : 'Confirmar'}
                        </Button>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
            <Button className="shrink-0 self-end sm:self-start" onClick={() => setIsFormOpen(true)}>
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