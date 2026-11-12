import React, { useState, useEffect, useCallback, useRef } from 'react';
    import { Button } from "@/components/ui/button";
    import { Label } from "@/components/ui/label";
    import { MultiSelect } from "@/components/ui/multi-select";
    import { Plus, Bot, Trash2, ToggleLeft, ToggleRight, Layers } from 'lucide-react';
    import { useToast } from "@/components/ui/use-toast";
    import { supabase } from '@/lib/customSupabaseClient';
    import { clearTaskAutomationsCache, normalizeAutomationRow } from '@/lib/workflow';
    import { fetchOperationalFunctions } from '@/lib/operationalFunctionsApi';
    import { actionConfigurationIssues, uniqueIds } from '@/lib/operationalWorkflow';
    import OperationalFunctionsPanel from './OperationalFunctionsPanel';
    import WorkflowTemplatesPanel from './WorkflowTemplatesPanel';
    import AutomationPreview from './AutomationPreview';
    import AutomationHelp from './AutomationHelp';
    import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
    import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
    import AutomationForm from './AutomationForm';
    import { Link } from 'react-router-dom';
    import { useAuth } from '@/contexts/SupabaseAuthContext';

    const statusValues = (value) => (Array.isArray(value) ? value : value ? [value] : []).map((s) => typeof s === 'object' ? s.value : s).filter(Boolean);

    const TaskAutomations = ({ statusOptions, users, onTasksMutated }) => {
      const { profile } = useAuth();
      const [automations, setAutomations] = useState([]);
      const [operationalFunctions, setOperationalFunctions] = useState([]);
      const [profiles, setProfiles] = useState([]);
      const [profilesReady, setProfilesReady] = useState(false);
      const [profilesLoading, setProfilesLoading] = useState(true);
      const [profilesError, setProfilesError] = useState('');
      const configurationRequestRef = useRef(0);
      const [canManageFunctions, setCanManageFunctions] = useState(false);
      const [configurationLoading, setConfigurationLoading] = useState(true);
      const [configurationError, setConfigurationError] = useState('');
      const [settingsPanel, setSettingsPanel] = useState(null);
      const [loading, setLoading] = useState(true);
      const [automationsError, setAutomationsError] = useState('');
      const [isFormOpen, setIsFormOpen] = useState(false);
      const [selectedAutomation, setSelectedAutomation] = useState(null);
      const [bulkStatusValues, setBulkStatusValues] = useState([]);
      const [bulkCount, setBulkCount] = useState(null);
      const [bulkCountLoading, setBulkCountLoading] = useState(false);
      const [bulkLoading, setBulkLoading] = useState(false);
      const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
      const bulkSeededRef = useRef(false);
      const { toast } = useToast();

      const loadConfiguration = useCallback(async () => {
        const request = ++configurationRequestRef.current;
        setConfigurationLoading(true);
        setConfigurationError('');
        setProfilesLoading(true);
        setProfilesError('');
        try {
          const [functions, people, access] = await Promise.allSettled([
            fetchOperationalFunctions(),
            supabase.from('profiles').select('id,full_name,status,role').neq('role', 'cliente'),
            supabase.rpc('can_manage_task_operational_functions'),
          ]);
          if (request !== configurationRequestRef.current) return;
          if (people.status === 'fulfilled' && !people.value.error) {
            setProfiles(people.value.data || []);
            setProfilesReady(true);
          } else {
            setProfiles([]);
            setProfilesReady(false);
            setProfilesError('Não foi possível consultar as pessoas. Tente novamente antes de editar as regras.');
          }
          const functionErrors = [];
          if (functions.status === 'fulfilled') setOperationalFunctions(functions.value);
          else {
            setOperationalFunctions([]);
            functionErrors.push('Não foi possível carregar as funções.');
          }
          if (access.status === 'fulfilled' && !access.value.error) setCanManageFunctions(access.value.data === true);
          else {
            setCanManageFunctions(false);
            functionErrors.push('Não foi possível consultar as permissões das funções.');
          }
          setConfigurationError(functionErrors.join(' '));
        } catch (error) {
          if (request !== configurationRequestRef.current) return;
          setProfilesReady(false);
          setProfilesError('Não foi possível consultar as pessoas. Tente novamente antes de editar as regras.');
          setConfigurationError('Não foi possível carregar as funções.');
        } finally {
          if (request === configurationRequestRef.current) {
            setConfigurationLoading(false);
            setProfilesLoading(false);
          }
        }
      }, []);
      useEffect(() => { void loadConfiguration(); }, [loadConfiguration]);

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
        setAutomationsError('');
        try {
          const { data, error } = await supabase.from('task_automations').select('*');
          if (error) throw error;
          setAutomations((data || []).map(normalizeAutomationRow));
        } catch (error) {
          setAutomationsError(error.message || 'Não foi possível carregar as automações.');
          toast({ title: 'Erro ao carregar automações', description: error.message, variant: 'destructive' });
        } finally { setLoading(false); }
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
            const from = statusValues(config.from_status).length > 0
              ? statusValues(config.from_status).map(s => statusOptions.find(opt => opt.value === s)?.label || s).join(', ')
              : 'Qualquer Status';
            const to = statusValues(config.to_status).length > 0
              ? statusValues(config.to_status).map(s => statusOptions.find(opt => opt.value === s)?.label || s).join(', ')
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

      const personName = (id) => !profilesReady || profilesLoading
        ? (profilesLoading ? 'Carregando pessoas' : 'Pessoas não consultadas')
        : profiles.find(person => person.id === id)?.full_name || 'Pessoa sem perfil';
      const functionContextUnavailable = configurationLoading || !!configurationError;
      const knownConfigurationIssues = (actions) => !profilesReady || profilesLoading ? [] : actionConfigurationIssues(
        (actions || []).filter(action => action.type !== 'assign_function' || !functionContextUnavailable),
        { functions: operationalFunctions, profiles, statusOptions },
      );

      const renderActionDescription = (action) => {
        const config = action.config || {};
        switch (action.type) {
          case 'notify_user':
            const usersToNotify = uniqueIds(config.assignee_ids)
                .map(personName)
                .join(', ');
            return `Notificação configurada (ainda não executada): ${usersToNotify || 'ninguém'}`;
          case 'add_comment':
            return `Comentário configurado (ainda não executado): "${config.comment || ''}"`;
          case 'change_status':
            const status = statusOptions.find(s => s.value === config.status)?.label || 'Status desconhecido';
            return `Mudar status para "${status}"`;
          case 'set_assignee':
             const assignees = uniqueIds(config.assignee_ids)
                .map(personName)
                .join(', ');
            return `Adicionar responsáveis: ${assignees || 'ninguém'}`;
          case 'remove_assignee':
            const assigneesToRemove = uniqueIds(config.assignee_ids)
                .map(personName)
                .join(', ');
            return `Remover responsáveis: ${assigneesToRemove || 'Todos'}`;
          case 'assign_function': {
            if (functionContextUnavailable) return 'Encaminhamento por função: configuração ainda não consultada.';
            const fn = operationalFunctions.find((item) => item.id === config.function_id);
            const names = uniqueIds(fn?.assignee_ids).map(personName).join(', ');
            return `${config.mode === 'add' ? 'Adicionar' : 'Substituir por'} função: ${fn?.name || 'Função indisponível'}${names ? ` (${names})` : ''}`;
          }
          case 'reassign_producer':
            return config.production_status === '__last_workflow_production__'
              ? 'Devolver à última função que produziu este material'
              : `Devolver a quem produziu em “${statusOptions.find((s) => s.value === config.production_status)?.label || 'Etapa não definida'}”`;
          case 'reassign_previous':
            return `Reatribuir ao responsável anterior`;
          case 'change_priority':
            return `Alterar prioridade para "${config.priority}"`;
          case 'set_demand_control': {
            const labels = { planned: 'Planejada', correction: 'Correção', change: 'Alteração', extra: 'Extra', urgency: 'Urgência' };
            return `Registrar exceção da demanda: ${labels[config.demand_type] || 'configurada'}`;
          }
          case 'increment_review_round':
            return 'Somar uma rodada de revisão';
          case 'create_subtask':
            return `Subtarefa configurada (ainda não executada): "${config.title || ''}"`;
          case 'move_task_to_social_media':
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
            users={profiles}
            operationalFunctions={functionContextUnavailable ? [] : operationalFunctions}
            operationalUnavailable={configurationLoading ? 'As funções ainda estão carregando.' : configurationError}
            onSave={handleSave}
            onCancel={() => { setIsFormOpen(false); setSelectedAutomation(null); }}
            automation={selectedAutomation}
          />
        );
      }

      return (
        <div className="space-y-5 pb-4">
          <div className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-border/80 bg-card p-1 shadow-sm">
            <Button variant="ghost" className={`h-9 rounded-lg px-4 ${settingsPanel === 'functions' ? 'bg-slate-950 text-white shadow-sm hover:bg-slate-900 hover:text-white dark:bg-white dark:text-slate-950' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`} disabled={configurationLoading || !!configurationError || !profilesReady || profilesLoading} onClick={() => setSettingsPanel(settingsPanel === 'functions' ? null : 'functions')}>Funções</Button>
            <Button variant="ghost" className={`h-9 rounded-lg px-4 ${settingsPanel === 'workflows' ? 'bg-slate-950 text-white shadow-sm hover:bg-slate-900 hover:text-white dark:bg-white dark:text-slate-950' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`} disabled={configurationLoading || !!configurationError || !profilesReady || profilesLoading} onClick={() => setSettingsPanel(settingsPanel === 'workflows' ? null : 'workflows')}>Fluxos</Button>
            <Button variant="ghost" className={`h-9 rounded-lg px-4 ${settingsPanel === 'preview' ? 'bg-slate-950 text-white shadow-sm hover:bg-slate-900 hover:text-white dark:bg-white dark:text-slate-950' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`} disabled={loading || !!automationsError || configurationLoading || !!configurationError || !profilesReady || profilesLoading} onClick={() => setSettingsPanel(settingsPanel === 'preview' ? null : 'preview')}>Conferir passagem</Button>
            {['superadmin', 'admin'].includes(profile?.role) && <Button variant="ghost" className="h-9 rounded-lg px-4 text-muted-foreground hover:bg-muted hover:text-foreground" asChild><Link to="/projects?planning=settings">Planejamento mensal</Link></Button>}
            {configurationLoading && <span className="text-sm text-muted-foreground">Carregando configuração…</span>}
          </div>
          {profilesError && <div role="alert" className="mb-4 text-sm text-red-600"><p>{profilesError}</p><Button variant="outline" size="sm" onClick={loadConfiguration}>Consultar pessoas novamente</Button></div>}
          {configurationError && <div role="alert" className="mb-4 text-sm text-red-600"><p>{configurationError} {profilesReady && 'As regras por pessoa continuam disponíveis para edição.'}</p><Button variant="outline" size="sm" onClick={loadConfiguration}>Tentar novamente</Button></div>}
          {settingsPanel && !functionContextUnavailable && profilesReady && !profilesLoading && <div>
            {settingsPanel === 'functions' ? <OperationalFunctionsPanel functions={operationalFunctions} profiles={profiles} canManage={canManageFunctions} onChanged={loadConfiguration} /> : settingsPanel === 'workflows' ? <WorkflowTemplatesPanel functions={operationalFunctions} profiles={profiles} canManage={canManageFunctions} /> : loading || automationsError ? <p role="status" className="text-sm">{loading ? 'Carregando regras…' : 'Não foi possível conferir as regras. Tente novamente.'}</p> : <AutomationPreview automations={automations} functions={operationalFunctions} profiles={profiles} statusOptions={statusOptions} describeAction={renderActionDescription} />}
          </div>}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <Card className="flex-1 border-amber-200/80 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base dark:text-white">
                  <Layers className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                  Mover em massa para Redes Sociais
                  <AutomationHelp label="Sobre mover em massa">Transfere as tarefas dos status selecionados para Redes Sociais como concluídas, removendo os responsáveis. Use para tarefas que já estavam publicadas antes da automação.</AutomationHelp>
                </CardTitle>
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
            <Button className="shrink-0 self-end sm:self-start" disabled={!profilesReady || profilesLoading} onClick={() => setIsFormOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Nova Automação
            </Button>
          </div>

          {automationsError && <div role="alert" className="mb-4 text-sm text-red-600"><p>{automationsError}</p><Button variant="outline" size="sm" onClick={fetchAutomations}>Recarregar regras</Button></div>}
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
                       <Button variant="ghost" size="icon" aria-label={`${auto.is_active ? "Pausar" : "Ativar"} ${auto.name}`} onClick={() => handleToggleActive(auto)}>
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
                    {knownConfigurationIssues(auto.actions).length > 0 && <div className="text-sm text-amber-800 dark:text-amber-300 flex items-center gap-1">Conferir destinatário<AutomationHelp label={`Pendências de ${auto.name}`}>{knownConfigurationIssues(auto.actions).map((issue) => <p key={issue}>{issue}</p>)}</AutomationHelp></div>}
                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" size="sm" disabled={!profilesReady || profilesLoading} onClick={() => setSelectedAutomation(auto)}>Editar</Button>
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
