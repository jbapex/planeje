import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
    import { AnimatePresence, motion } from 'framer-motion';
    import { Plus, List, LayoutGrid, GitCommit, Settings, Filter, Bot, Calendar, Timer, Users, Building2 } from 'lucide-react';
    import { useLocation, useParams, useNavigate, useSearchParams } from 'react-router-dom';
    import { Button } from '@/components/ui/button';
    import { useToast } from '@/components/ui/use-toast';
    import { supabase } from '@/lib/customSupabaseClient';
    import { useAuth } from '@/contexts/SupabaseAuthContext';
    import { useModuleSettings } from '@/contexts/ModuleSettingsContext';
    import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
    import WorkspacePageHeader from '@/components/layout/WorkspacePageHeader';
    import TaskDetail from '@/components/tasks/TaskDetail';
    import ListView from '@/components/tasks/ListView';
    import KanbanView from '@/components/tasks/KanbanView';
    import TimelineView from '@/components/tasks/TimelineView';
    import StatusSettings from '@/components/tasks/StatusSettings';
    import TaskAutomations from '@/components/tasks/automations/TaskAutomations';
    import CalendarView from '@/components/tasks/CalendarView';
    import TimeTrackingSettings from '@/components/tasks/TimeTrackingSettings';
    import TeamCapacityView from '@/components/tasks/TeamCapacityView';
    import { useDataCache } from '@/hooks/useDataCache';
import {
  executeAutomation,
  runDueDateArrivedAutomations,
  getAutomationErrorMessages,
} from '@/lib/workflow';
import { cn } from '@/lib/utils';
import { isTerminalTaskStatus, normalizeTaskPriority, sortTasksByWorkOrder } from '@/lib/taskUrgency';
import { checkTaskPublicationCompletion, contentSocialArchiveBlockers, isContentTaskType } from '@/lib/taskChannelPublications';
import '@/components/tasks/Tasks.css';
import { TASK_RELATIONS_SELECT, upsertTaskWithRelations, readTaskAfterAutomations } from '@/lib/taskRelations';
import { NEXT_ACTIONS } from '@/lib/trafegoProximaAcao';
import { updateDecision } from '@/components/gestor-ia/gestorIaDecisionLog';
import { confirmCsTaskClient, csTaskClientId, csTaskReturn, isCsBoardTask } from '@/lib/csIaTaskNavigation';

/** Mesmo estilo visual das abas do painel operacional de Projetos (TabsList / TabsTrigger). */
const tasksTabBar = cn(
  'tasks-tab-bar inline-flex h-auto w-full flex-shrink-0 flex-wrap items-center justify-center gap-1 rounded-full border border-gray-300/90 bg-gray-200/95 p-1 text-muted-foreground dark:border-gray-600 dark:bg-gray-900'
);
const tasksTabTrigger = cn(
  'tasks-tab-trigger inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-muted-foreground shadow-none transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm dark:text-gray-400 dark:data-[state=active]:bg-gray-800 dark:data-[state=active]:text-white'
);

    const Tasks = () => {
      const [tasks, setTasks] = useState([]);
      const [scheduleTasks, setScheduleTasks] = useState([]);
      const [clients, setClients] = useState([]);
      const [projects, setProjects] = useState([]);
      const [users, setUsers] = useState([]);
      const [selectedTask, setSelectedTask] = useState(null);
      const [loading, setLoading] = useState(true);
      const [scheduleLoading, setScheduleLoading] = useState(true);
      const [isStatusSettingsOpen, setStatusSettingsOpen] = useState(false);
      const [isTimeTrackingSettingsOpen, setTimeTrackingSettingsOpen] = useState(false);
      const [statusOptions, setStatusOptions] = useState([]);
      const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
      const [filtersExpanded, setFiltersExpanded] = useState(false);
      const [operationalFunctions, setOperationalFunctions] = useState([]);
      const [workflowTemplates, setWorkflowTemplates] = useState([]);


      const { toast } = useToast();
      const { user, profile, canViewField } = useAuth();
      const { moduleAccess, moduleSettings } = useModuleSettings();
      const userRole = profile?.role;
      const tasksAccessLevel = moduleAccess.tasks || 'all';
      const { view: activeTabFromUrl = 'list', id: taskIdFromUrl } = useParams();
      const isNewTask = taskIdFromUrl === 'new';
      const location = useLocation();
      const [searchParams] = useSearchParams();
      const clientIdFromUrl = searchParams.get('client_id');
      const typeFromUrl = searchParams.get('type');
      const isPaidTrafficDraft = isNewTask && typeFromUrl === 'paid_traffic';
      const csTask = Boolean(location.state?.csTask);
      const csClient = csTaskClientId(location.state, clientIdFromUrl, user, profile, moduleSettings);
      const csScopeKey = csClient ? JSON.stringify([location.key, csClient, user.id]) : null;
      const [csAccess, setCsAccess] = useState(null);
      const csVerified = Boolean(csScopeKey && csAccess?.key === csScopeKey && csAccess.allowed);
      const csReturnTo = csVerified ? csTaskReturn(csClient, location.state.csTask.room) : null;
      const skipInitialDueDateAutomation = csTask || location.state?.csTaskView === true || Boolean(taskIdFromUrl && location.state?.gestorIa === true);
      const navigate = useNavigate();
      const backOnCloseRef = useRef(false);

      useEffect(() => {
        backOnCloseRef.current = false;
      }, [location.key]);

      useEffect(() => {
        if (!csScopeKey) return;
        let active = true;
        confirmCsTaskClient(supabase, csClient).then(allowed => {
          if (active) setCsAccess({ key: csScopeKey, allowed });
        });
        return () => { active = false; };
      }, [csClient, csScopeKey]);
      
      // Hook de cache com chave única por usuário e role
      const cacheKey = `tasks_channels_v2_${user?.id}_${userRole}_${tasksAccessLevel}`;
      const { data: cachedData, setCachedData, shouldFetch } = useDataCache(cacheKey);
      
      // Ref para controlar se já fez o fetch inicial (evita re-fetch ao voltar para aba)
      const hasFetchedRef = useRef(false);
      const localKanbanUpdateRef = useRef(new Map());
      const relationsRef = useRef({ clients, projects });
      relationsRef.current = { clients, projects };
      
      const activeTab = useMemo(() => {
        if (isMobile && !['list', 'automations', 'capacity'].includes(activeTabFromUrl)) {
          return 'list';
        }
        return activeTabFromUrl;
      }, [activeTabFromUrl, isMobile]);

      useEffect(() => {
        const handleResize = () => {
          const mobile = window.innerWidth < 768;
          setIsMobile(mobile);
          if (mobile && !['list', 'automations', 'capacity'].includes(activeTab)) {
            navigate('/tasks/list', { replace: true });
          }
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
      }, [activeTab, navigate]);

      const getInitialFilter = (key, defaultValue) => localStorage.getItem(`task_filter_${user?.id}_${key}`) || defaultValue;

      const [clientFilter, setClientFilter] = useState(() => getInitialFilter('client', 'all'));
      const [statusFilter, setStatusFilter] = useState(() => getInitialFilter('status', 'all'));
      const [assigneeFilter, setAssigneeFilter] = useState(() => getInitialFilter('assignee', 'all'));
      const [scheduleClientFilter, setScheduleClientFilter] = useState('all');
      const [agencyView, setAgencyView] = useState(() => getInitialFilter('agency_view', 'false') === 'true');

      useEffect(() => {
        if (user?.id) localStorage.setItem(`task_filter_${user.id}_client`, clientFilter);
      }, [clientFilter, user?.id]);

      useEffect(() => {
        if (clientIdFromUrl && !isNewTask && !csTask) setClientFilter(clientIdFromUrl);
      }, [clientIdFromUrl, isNewTask, csTask]);

      useEffect(() => {
        if (user?.id) localStorage.setItem(`task_filter_${user.id}_status`, statusFilter);
      }, [statusFilter, user?.id]);
      
      useEffect(() => {
        if (user?.id) localStorage.setItem(`task_filter_${user.id}_assignee`, assigneeFilter);
      }, [assigneeFilter, user?.id]);

      useEffect(() => {
        if (user?.id) localStorage.setItem(`task_filter_${user.id}_agency_view`, String(agencyView));
      }, [agencyView, user?.id]);

      useEffect(() => {
        if (!agencyView && assigneeFilter !== 'all') setAssigneeFilter('all');
      }, [agencyView, assigneeFilter]);

      useEffect(() => {
        if (!user?.id) return;
        let cancelled = false;
        const loadOperationalView = async () => {
          const [functionResult, templateResult] = await Promise.all([
            supabase.from('task_operational_functions').select('id,name,assignee_ids,is_active').eq('is_active', true).order('name'),
            supabase.from('task_workflow_templates').select('id,stages,is_active').eq('is_active', true),
          ]);
          if (cancelled) return;
          if (!functionResult.error) setOperationalFunctions(functionResult.data || []);
          if (!templateResult.error) setWorkflowTemplates(templateResult.data || []);
        };
        void loadOperationalView();
        return () => { cancelled = true; };
      }, [user?.id]);

      const fetchStatusOptions = useCallback(async () => {
        const { data, error } = await supabase.from('task_statuses').select('*').order('sort_order');
        if(error){
          toast({ title: "Erro ao buscar status", description: error.message, variant: "destructive" });
          return [];
        }
        setStatusOptions(data);
        return data;
      }, [toast]);
      
      const fetchScheduleData = useCallback(async () => {
        if (!user) return;
        setScheduleLoading(true);
        const { data: tasksData, error: tasksError } = await supabase.from('tarefas').select(TASK_RELATIONS_SELECT).not('post_date', 'is', null);
        if (tasksError) {
          toast({ title: "Erro ao buscar agendamentos", description: tasksError.message, variant: "destructive" });
        } else {
          setScheduleTasks(tasksData || []);
        }
        setScheduleLoading(false);
      }, [toast, user]);

      const patchTaskInState = useCallback((taskId, patch, options = {}) => {
        const incoming = { ...patch, id: taskId };
        const relations = { ...relationsRef.current, ...options };
        const mainOptions = { ...relations, insert: options.insert === true, include: task => task.type !== 'social_media' };
        setTasks(prev => upsertTaskWithRelations(prev, incoming, mainOptions));
        setScheduleTasks(prev => upsertTaskWithRelations(prev, incoming, {
          ...relations, include: task => Boolean(task.post_date),
        }));
        setCachedData(prev => prev ? {
          ...prev, tasks: upsertTaskWithRelations(prev.tasks || [], incoming, mainOptions),
        } : prev);
      }, [setCachedData]);

      const runTaskAutomationAndRefresh = useCallback(async (task, trigger, eventData) => {
        let result;
        try {
          result = await executeAutomation(task.id, trigger, eventData);
        } catch (error) {
          result = { error, results: [] };
        }
        const errors = getAutomationErrorMessages(result);
        if (errors.length) toast({ title: 'Automação', description: errors[0], variant: 'destructive' });
        // Read after ALL matching rules, including partial failures and moves to Social.
        const final = await readTaskAfterAutomations(result, () => supabase
          .from('tarefas').select(TASK_RELATIONS_SELECT).eq('id', task.id).single(), task);
        if (final.task) patchTaskInState(task.id, final.task);
        if (final.error) toast({
          title: 'Tarefa salva',
          description: 'Não foi possível conferir a atualização final. Atualize a lista para conferir.',
        });
      }, [patchTaskInState, toast]);

      const fetchData = useCallback(async ({ silent = false, runDueDateAutomation = true } = {}) => {
        if (!user) return;
        if (!silent) setLoading(true);
        // Busca statusOptions primeiro e usa o resultado diretamente
        const fetchedStatusOptions = await fetchStatusOptions();
        await fetchScheduleData();
        
        let tasksQuery = supabase.from('tarefas').select(TASK_RELATIONS_SELECT).or('type.is.null,type.neq.social_media,type.eq.paid_traffic');
        if (userRole === 'colaborador' && tasksAccessLevel === 'responsible') {
            tasksQuery = tasksQuery.contains('assignee_ids', [user.id]);
        }

        const { data: tasksData, error: tasksError } = await tasksQuery;
        const { data: publicationData, error: publicationError } = await supabase
          .from('task_channel_publications')
          .select('id, task_id, channel, status, scheduled_for');
        const { data: clientsData, error: clientsError } = await supabase.from('clientes').select('id, empresa');
        const { data: projectsData, error: projectsError } = await supabase.from('projetos').select('id, name, client_id');
        // Importante: cliente (role='cliente') não pode ser responsável por nada no sistema.
        // Então removemos perfis de cliente de todas as listas de "usuários" (assignees/owners).
        const { data: usersData, error: usersError } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .neq('role', 'cliente');

        if (tasksError || clientsError || projectsError || usersError || publicationError) {
          toast({ title: "Erro ao buscar dados", description: tasksError?.message || clientsError?.message || projectsError?.message || usersError?.message || publicationError?.message, variant: "destructive" });
        } else {
          const publicationsByTask = (publicationData || []).reduce((groups, publication) => {
            (groups[publication.task_id] ||= []).push(publication);
            return groups;
          }, {});
          const tasksWithPublications = (tasksData || []).map((task) => ({
            ...task,
            _channel_publications: publicationsByTask[task.id] || [],
          }));
          // Salva no cache usando os statusOptions recém-buscados
          const dataToCache = {
            tasks: tasksWithPublications,
            clients: clientsData || [],
            projects: projectsData || [],
            users: usersData || [],
            statusOptions: fetchedStatusOptions || []
          };
          setCachedData(dataToCache);
          setTasks(dataToCache.tasks);
          setClients(dataToCache.clients);
          setProjects(dataToCache.projects);
          setUsers(dataToCache.users);
          if (runDueDateAutomation) await runDueDateArrivedAutomations(dataToCache.tasks);
        }
        if (!silent) setLoading(false);
      }, [toast, fetchStatusOptions, fetchScheduleData, user, userRole, tasksAccessLevel, setCachedData]);

      // Sempre atualiza statusOptions quando o componente é montado (dados pequenos e críticos para UI)
      useEffect(() => {
        if (user) {
          fetchStatusOptions();
        }
      }, [user, fetchStatusOptions]);

      useEffect(() => {
        if (!user) return;
        
        // Se já fez fetch inicial, não faz nada (evita recarregamento ao voltar para aba)
        if (hasFetchedRef.current) {
          return;
        }
        
        // Se tem cache válido, usa ele (statusOptions já foi atualizado no useEffect acima)
        if (!csTask && !shouldFetch() && cachedData) {
          setTasks(cachedData.tasks);
          setClients(cachedData.clients);
          setProjects(cachedData.projects);
          setUsers(cachedData.users);
          // Não usa statusOptions do cache, pois já foi atualizado no useEffect acima
          setLoading(false);
          hasFetchedRef.current = true;
          if (!skipInitialDueDateAutomation) void runDueDateArrivedAutomations(cachedData.tasks || []);
          return;
        }

        // Se não tem cache ou está expirado, faz fetch apenas uma vez
        if (!hasFetchedRef.current) {
          hasFetchedRef.current = true;
          fetchData({ runDueDateAutomation: !skipInitialDueDateAutomation });
        }
      }, [user, shouldFetch, cachedData, fetchData, csTask, skipInitialDueDateAutomation]); // Removido fetchStatusOptions para evitar loop

      // Subscription para atualizações em tempo real - ATUALIZA TODOS OS USUÁRIOS SIMULTANEAMENTE
      useEffect(() => {
        if (!user) return;

        // Configura a query base para Realtime
        const channelName = `tarefas-changes-${user.id}`;
        const tasksChannel = supabase
          .channel(channelName)
          .on(
            'postgres_changes',
            {
              event: '*', // Escuta INSERT, UPDATE, DELETE
              schema: 'public',
              table: 'tarefas'
            },
            async (payload) => {
              const task = payload.new || payload.old;
              
              // Para colaboradores, filtra apenas tarefas atribuídas a eles
              if (userRole === 'colaborador' && tasksAccessLevel === 'responsible') {
                if (task && !task.assignee_ids?.includes(user.id)) {
                  // Ignora mudanças em tarefas não atribuídas ao usuário
                  return;
                }
              }
              
              if (payload.eventType === 'INSERT') {
                // Nova tarefa criada - busca dados relacionados
                const newTask = payload.new;
                const { data, error } = await supabase
                  .from('tarefas')
                  .select(TASK_RELATIONS_SELECT)
                  .eq('id', newTask.id)
                  .single();
                
                if (!error && data) {
                  patchTaskInState(data.id, data, { insert: true, relationsOnlyIfExists: true });
                }
              } else if (payload.eventType === 'UPDATE') {
                const updatedTask = payload.new;
                const localTs = localKanbanUpdateRef.current.get(updatedTask.id);
                if (localTs && Date.now() - localTs < 4000) {
                  localKanbanUpdateRef.current.delete(updatedTask.id);
                  return;
                }
                patchTaskInState(updatedTask.id, updatedTask);
              } else if (payload.eventType === 'DELETE') {
                // Tarefa deletada
                const deletedTask = payload.old;
                setTasks(prev => prev.filter(t => t.id !== deletedTask.id));
                setScheduleTasks(prev => prev.filter(t => t.id !== deletedTask.id));
                
                // Atualiza cache
                setCachedData(prev => prev ? {
                  ...prev,
                  tasks: (prev.tasks || []).filter(t => t.id !== deletedTask.id)
                } : null);
              }
            }
          )
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              console.log('✅ Inscrito nas mudanças em tempo real da tabela tarefas - atualizações serão refletidas para todos os usuários');
            } else if (status === 'CHANNEL_ERROR') {
              console.error('❌ Erro ao se inscrever nas mudanças em tempo real');
            }
          });

        // Cleanup: remove a subscription quando o componente desmonta
        return () => {
          console.log('🔌 Removendo subscription de tarefas');
          supabase.removeChannel(tasksChannel);
        };
      }, [user, userRole, tasksAccessLevel, setCachedData, patchTaskInState]);

      useEffect(() => {
        if (taskIdFromUrl && !isNewTask && tasks.length > 0) {
          const task = tasks.find(t => t.id === taskIdFromUrl);
          if (task) {
            setSelectedTask(task);
          } else if (csTask) {
            setSelectedTask(null);
          } else {
            toast({ title: "Tarefa não encontrada", variant: "destructive" });
            navigate(`/tasks/${activeTab}`);
          }
        } else {
          setSelectedTask(null);
        }
      }, [taskIdFromUrl, tasks, navigate, toast, isNewTask, activeTab, csTask]);

      const myOperationalFunctions = useMemo(() => operationalFunctions.filter((item) =>
        (item.assignee_ids || []).includes(user?.id)), [operationalFunctions, user?.id]);
      const myFunctionIds = useMemo(() => new Set(myOperationalFunctions.map((item) => item.id)), [myOperationalFunctions]);

      const taskBelongsToMyWork = useCallback((task) =>
        myFunctionIds.has(task.operational_function_id) || (task.assignee_ids || []).includes(user?.id),
      [myFunctionIds, user?.id]);

      const scopedTasks = useMemo(() => {
        const taskList = Array.isArray(tasks) ? tasks : [];
        return agencyView ? taskList : taskList.filter(taskBelongsToMyWork);
      }, [tasks, agencyView, taskBelongsToMyWork]);

      const filteredTasks = useMemo(() => {
        let currentTasks = [...scopedTasks];
        if (clientFilter !== 'all') currentTasks = currentTasks.filter(task => task.client_id === clientFilter);
        if (statusFilter !== 'all') currentTasks = currentTasks.filter(task => task.status === statusFilter);
        if (assigneeFilter !== 'all') currentTasks = currentTasks.filter(task => task.assignee_ids?.includes(assigneeFilter));
        if (typeFromUrl === 'paid_traffic') currentTasks = currentTasks.filter(task => task.type === 'paid_traffic');
        currentTasks = currentTasks.filter((task) => task.type !== 'paid_traffic' || !isTerminalTaskStatus(task.status, statusOptions));
        return sortTasksByWorkOrder(currentTasks, { statusOptions });
      }, [scopedTasks, clientFilter, statusFilter, assigneeFilter, typeFromUrl, statusOptions]);

      const visibleStatusOptions = useMemo(() => {
        if (agencyView) return statusOptions;
        const values = new Set(scopedTasks.map((task) => task.status));
        for (const template of workflowTemplates) {
          for (const stage of Array.isArray(template.stages) ? template.stages : []) {
            if (myFunctionIds.has(stage.function_id)) values.add(stage.status_value);
          }
        }
        return statusOptions.filter((status) => values.has(status.value));
      }, [agencyView, statusOptions, scopedTasks, workflowTemplates, myFunctionIds]);

      useEffect(() => {
        if (statusFilter !== 'all' && !visibleStatusOptions.some((status) => status.value === statusFilter)) setStatusFilter('all');
      }, [statusFilter, visibleStatusOptions]);

      const filteredScheduleTasks = useMemo(() => {
        const list = Array.isArray(scheduleTasks) ? scheduleTasks : [];
        return list.filter(task => (agencyView || taskBelongsToMyWork(task)) && (scheduleClientFilter === 'all' || task.client_id === scheduleClientFilter));
      }, [scheduleTasks, agencyView, taskBelongsToMyWork, scheduleClientFilter]);

      const canPublishTask = async (taskId, nextStatus) => {
        try {
          const { blocking } = await checkTaskPublicationCompletion(supabase, taskId, nextStatus);
          if (!blocking.length) return true;
          toast({
            title: 'Ainda existem canais pendentes',
            description: `${blocking.length} publicação(ões) ainda precisam ser publicadas ou canceladas. Abra a tarefa e confira “Publicações por canal”.`,
            variant: 'destructive',
          });
          return false;
        } catch (error) {
          toast({ title: 'Não foi possível conferir os canais', description: error.message, variant: 'destructive' });
          return false;
        }
      };

      const handleSaveTask = async (taskData, isNew) => {
        if (csTask && (!csVerified || isNew !== isNewTask || taskData.client_id !== csClient ||
          (!isNew && taskData.id !== taskIdFromUrl) || !(await confirmCsTaskClient(supabase, csClient)))) {
          toast({ title: 'A ficha ou tarefa mudou de escopo', description: 'Volte ao CS IA e abra a tarefa novamente.', variant: 'destructive' });
          return false;
        }
        const { subtasks, _channel_publications, ...restOfTaskData } = taskData;
        const dataToSave = { ...restOfTaskData, owner_id: user.id };

        const dueRaw = dataToSave.due_date;
        if (dueRaw == null || String(dueRaw).trim() === '') {
          toast({
            title: 'Data de entrega obrigatória',
            description: 'Selecione a data de entrega antes de salvar a tarefa.',
            variant: 'destructive',
          });
          return false;
        }

        if (dataToSave.due_date === '') dataToSave.due_date = null;
        if (dataToSave.post_date === '') dataToSave.post_date = null;
        if (dataToSave.client_id === '') dataToSave.client_id = null;
        if (dataToSave.project_id === '') dataToSave.project_id = null;
        if (dataToSave.plataforma === '' || dataToSave.plataforma == null) dataToSave.plataforma = null;
        dataToSave.priority = normalizeTaskPriority(dataToSave.priority);

        if (!isNew && !(await canPublishTask(taskData.id, dataToSave.status))) return false;
        
        if (isNew) {
          dataToSave.status_history = [
            {
              status: dataToSave.status,
              user_id: user.id,
              assignee_ids: dataToSave.assignee_ids,
              timestamp: new Date().toISOString()
            }
          ];
          delete dataToSave.id;
          const { data: newTask, error } = await supabase.from('tarefas').insert(dataToSave).select(TASK_RELATIONS_SELECT).single();
          if (error) {
            toast({ title: "Erro ao criar tarefa", description: error.message, variant: "destructive" });
            return false;
          }
          toast({ title: "Tarefa criada!" });
          setCachedData(null); // Limpa cache para forçar refresh
          patchTaskInState(newTask.id, newTask, { insert: true });
          await runTaskAutomationAndRefresh(newTask, 'task_created', { task: newTask });
          const draft = location.state;
          const decision = isPaidTrafficDraft && draft?.gestorIa === true && draft.draftOwnerId === user.id && draft.gestorIaDecision;
          if (decision && draft.draftClientId === newTask.client_id && newTask.type === 'paid_traffic') {
            try { await updateDecision(supabase, decision, { task_id: newTask.id }); }
            catch (failure) { toast({ title: 'Tarefa criada. Vincule-a pelo quadro de decisões.', description: failure.message }); }
            navigate(`/gestor-ia/clientes/${encodeURIComponent(newTask.client_id)}?tab=decisoes`);
          } else if (csReturnTo) navigate(csReturnTo, { replace: true });
          else navigate(`/tasks/${activeTab}`);
          return true;
        } else {
          delete dataToSave.clientes;
          delete dataToSave.projetos;
          
          let previous = supabase.from('tarefas').select('status, time_logs, status_history, assignee_ids').eq('id', taskData.id);
          if (csTask) previous = previous.eq('client_id', csClient);
          const { data: oldData, error: fetchError } = await previous.single();
          if (fetchError) {
            toast({ title: "Erro ao buscar tarefa antiga", description: fetchError.message, variant: "destructive" });
            return false;
          }

          dataToSave.status_history = oldData.status_history || [];
          if (oldData.status !== dataToSave.status || JSON.stringify(oldData.assignee_ids) !== JSON.stringify(dataToSave.assignee_ids)) {
            const newHistoryEntry = {
              status: dataToSave.status,
              user_id: user.id,
              assignee_ids: dataToSave.assignee_ids,
              timestamp: new Date().toISOString()
            };
            dataToSave.status_history = [...(oldData.status_history || []), newHistoryEntry];
          }
          
          let update = supabase.from('tarefas').update(dataToSave).eq('id', taskData.id);
          if (csTask) update = update.eq('client_id', csClient);
          const { data: updatedTask, error: updateError } = await update.select(TASK_RELATIONS_SELECT).single();
          if (updateError) {
            toast({ title: "Erro ao atualizar tarefa", description: updateError.message, variant: "destructive" });
            return false;
          }
          toast({ title: "Tarefa atualizada!" });
          setCachedData(null); // Limpa cache para forçar refresh
          patchTaskInState(updatedTask.id, updatedTask);
          if (oldData.status !== updatedTask.status) {
            await runTaskAutomationAndRefresh(updatedTask, 'status_change', {
              old_status: oldData.status, new_status: updatedTask.status,
            });
          }
          if (csReturnTo) navigate(csReturnTo, { replace: true });
          else navigate(`/tasks/${activeTab}`);
          return true;
        }
      };

      const handleDeleteTask = async (taskId) => {
        const { error } = await supabase.from('tarefas').delete().eq('id', taskId);
        if (error) {
          toast({ title: "Erro ao remover tarefa", description: error.message, variant: "destructive" });
        } else {
          toast({ title: "Tarefa removida" });
          setCachedData(null); // Limpa cache para forçar refresh
          setTasks(prev => prev.filter(t => t.id !== taskId));
          setScheduleTasks(prev => prev.filter(t => t.id !== taskId));
          navigate(`/tasks/${activeTab}`);
        }
      };

      const handleUpdateTaskStatus = async (taskId, newStatus) => {
        const taskToUpdate = tasks.find(t => t.id === taskId);
        if (!taskToUpdate) return;

        if (!(await canPublishTask(taskId, newStatus))) return;

        // IMPORTANTE: Verifica regras do STATUS DE DESTINO (novo status), não o atual
        // Isso garante que todas as condições sejam atendidas antes de entrar no novo status
        const { data: ruleData, error: ruleError } = await supabase
            .from('workflow_rules')
            .select('required_subtasks')
            .eq('task_type', taskToUpdate.type)
            .eq('status_value', newStatus) // CORRIGIDO: verifica o novo status
            .maybeSingle();

        if (ruleError) {
            toast({ title: "Erro ao verificar regras", description: ruleError.message, variant: "destructive" });
            return;
        }

        const requiredSteps = ruleData?.required_subtasks || [];
        if (requiredSteps.length > 0) {
            const { data: subtasksData, error: subtasksError } = await supabase
                .from('task_subtasks')
                .select('title, is_completed, content, type')
                .eq('task_id', taskId);

            if (subtasksError) {
                toast({ title: "Erro ao buscar subtarefas", description: subtasksError.message, variant: "destructive" });
                return;
            }

            const missingSteps = requiredSteps.filter(step => {
                const subtask = subtasksData.find(st => st.title === step.title);
                if (!subtask) return true;
                if (step.type === 'text') return !subtask.content || subtask.content.trim() === '';
                return !subtask.is_completed;
            });

            if (missingSteps.length > 0) {
                toast({
                    title: "Etapas pendentes!",
                    description: `Para entrar neste status, conclua: ${missingSteps.map(s => s.title).join(', ')}`,
                    variant: "destructive",
                });
                return;
            }
        }

        if (newStatus === 'completed' && isContentTaskType(taskToUpdate.type) && taskToUpdate.type !== 'social_media') {
            let clientPosts = Boolean(taskToUpdate.clientes?.postagem_do_cliente);
            try {
                const { data: publications, error: publicationError } = await supabase
                    .from('task_channel_publications')
                    .select('id, status, channel, evidence_url')
                    .eq('task_id', taskId);
                if (publicationError) throw publicationError;
                if (!clientPosts && taskToUpdate.client_id) {
                    const { data: clientRow } = await supabase
                        .from('clientes')
                        .select('postagem_do_cliente')
                        .eq('id', taskToUpdate.client_id)
                        .maybeSingle();
                    clientPosts = Boolean(clientRow?.postagem_do_cliente);
                }
                const blockers = contentSocialArchiveBlockers(publications, { clientPosts });
                if (blockers.length) {
                    toast({
                        title: 'A tarefa continua onde está',
                        description: blockers[0],
                        variant: 'destructive',
                    });
                    return;
                }
            } catch (error) {
                toast({ title: 'Não foi possível conferir as publicações', description: error.message, variant: 'destructive' });
                return;
            }

            const { error: moveError } = await supabase.rpc('move_task_to_social_media', { task_id: taskId });
            if (moveError) {
                toast({ title: 'Não foi possível concluir', description: moveError.message, variant: 'destructive' });
                return;
            }
            const { data: moved } = await supabase.from('tarefas').select(TASK_RELATIONS_SELECT).eq('id', taskId).maybeSingle();
            if (moved) patchTaskInState(taskId, moved);
            else {
                setTasks((prev) => prev.filter((task) => task.id !== taskId));
                setScheduleTasks((prev) => prev.filter((task) => task.id !== taskId));
            }
            setCachedData(null);
            toast({
                title: 'Tarefa foi para Redes Sociais',
                description: clientPosts ? 'O cliente publica; está em Concluídos, sem link.' : 'Ela está em Concluídos.',
            });
            return;
        }

        localKanbanUpdateRef.current.set(taskId, Date.now());
        setTimeout(() => localKanbanUpdateRef.current.delete(taskId), 5000);

        // ATUALIZAÇÃO OTIMISTA: atualiza o estado local imediatamente para feedback visual instantâneo
        const originalTasks = [...tasks];
        const originalScheduleTasks = [...scheduleTasks];
        
        setTasks(currentTasks => 
            currentTasks.map(task => 
                task.id === taskId ? { ...task, status: newStatus } : task
            )
        );
        
        // Atualiza também scheduleTasks se necessário
        setScheduleTasks(currentScheduleTasks =>
            currentScheduleTasks.map(task =>
                task.id === taskId ? { ...task, status: newStatus } : task
            )
        );

        const { data: oldData, error: fetchError } = await supabase.from('tarefas').select('status, time_logs, status_history, assignee_ids').eq('id', taskId).single();
        if (fetchError) {
            toast({ title: "Erro ao buscar tarefa antiga", description: fetchError.message, variant: "destructive" });
            setTasks(originalTasks);
            setScheduleTasks(originalScheduleTasks);
            return;
        }

        const newHistoryEntry = {
          status: newStatus,
          user_id: user.id,
          assignee_ids: oldData.assignee_ids,
          timestamp: new Date().toISOString()
        };
        const newStatusHistory = [...(oldData.status_history || []), newHistoryEntry];
        
        const { data: updatedTask, error: updateError } = await supabase.from('tarefas').update({ status: newStatus, status_history: newStatusHistory }).eq('id', taskId).select(TASK_RELATIONS_SELECT).single();
        if (updateError) {
            toast({ title: "Não foi possível avançar a tarefa", description: updateError.message, variant: "destructive" });
            setTasks(originalTasks);
            setScheduleTasks(originalScheduleTasks);
        } else {
            patchTaskInState(taskId, updatedTask);

            if (oldData.status !== newStatus) {
                await runTaskAutomationAndRefresh(updatedTask, 'status_change', {
                  old_status: oldData.status, new_status: newStatus,
                });
            }
        }
    };

      const handleOpenTask = (task) => {
        if (task.type === 'social_media' || ['post', 'reels', 'story'].includes(task.type)) {
          navigate(`/social-media?task=${task.id}`);
          return;
        }
        navigate(`/tasks/${activeTab}/${task.id}`);
      };
      const handleNewTask = () => {
        navigate(`/tasks/${activeTab}/new`);
      };
      const handleCloseTask = () => {
        if (csTask) {
          navigate(csReturnTo || '/cs-ia/carteira', { replace: true });
          return;
        }
        if (isPaidTrafficDraft && location.state?.backOnClose === true) {
          // O botão e o drawer podem disparar o fechamento no mesmo clique.
          if (!backOnCloseRef.current) {
            backOnCloseRef.current = true;
            navigate(-1);
          }
          return;
        }
        setSelectedTask(null);
        navigate(`/tasks/${activeTab}`);
        void fetchData({ silent: true });
      };

      const handleTabChange = (newTab) => {
        navigate(`/tasks/${newTab}`);
      };
      
      const tabOptions = [
        { value: 'list', label: 'Lista', icon: List },
        { value: 'kanban', label: 'Kanban', icon: LayoutGrid, mobile: false },
        { value: 'timeline', label: 'Linha do Tempo', icon: GitCommit, mobile: false },
        { value: 'schedule', label: 'Calendário', icon: Calendar, mobile: false },
        { value: 'capacity', label: 'Fila da equipe', icon: Users },
        { value: 'automations', label: 'Automações', icon: Bot, adminOnly: true },
      ];

      const visibleTabs = tabOptions.filter(tab => {
        if (isMobile && tab.mobile === false) return false;
        if (tab.adminOnly && userRole !== 'superadmin' && userRole !== 'admin') return false;
        return true;
      });

      const viewComponents = { list: ListView, kanban: KanbanView, timeline: TimelineView };
      const commonProps = { tasks: filteredTasks, clients, projects, users, statusOptions: visibleStatusOptions, onOpenTask: handleOpenTask, onUpdateStatus: handleUpdateTaskStatus, onDelete: handleDeleteTask, fetchData, userRole };

      const draftClientId = isPaidTrafficDraft && clients.some(client => client.id === clientIdFromUrl) ? clientIdFromUrl : '';
      const { draftOwnerId, draftClientId: sourceClientId, draftSignal, draftDecision, gestorIa } = location.state || {};
      const canApplySignal = draftClientId && sourceClientId === draftClientId && user?.id && draftOwnerId === user.id && canViewField?.('meta_resumo') === true;
      const draftAction = canApplySignal && typeof draftSignal === 'string' && Object.hasOwn(NEXT_ACTIONS, draftSignal) ? NEXT_ACTIONS[draftSignal] : null;
      const aiTitle = typeof draftDecision?.title === 'string' ? draftDecision.title.trim() : '';
      const aiPlan = typeof draftDecision?.description === 'string' ? draftDecision.description.trim() : '';
      const canApplyDecision = gestorIa === true && canApplySignal && aiTitle && aiTitle.length <= 110 && aiPlan && aiPlan.length <= 1000;
      const editorTask = isNewTask ? {
        title: draftAction?.title || (canApplyDecision ? aiTitle : ''),
        description: draftAction?.action || (canApplyDecision ? aiPlan : ''),
        status: statusOptions[0]?.value || 'todo',
        client_id: csVerified ? csClient : draftClientId,
        project_id: '',
        assignee_ids: userRole === 'colaborador' ? [user.id] : [],
        due_date: '',
        post_date: '',
        type: isPaidTrafficDraft ? 'paid_traffic' : '',
        plataforma: '',
        priority: 'medium',
        time_logs: [],
        status_history: [],
      } : selectedTask;
      const csEditorAllowed = csVerified && !loading && clients.some(client => client.id === csClient) &&
        (isNewTask || selectedTask?.id === taskIdFromUrl && selectedTask.client_id === csClient && isCsBoardTask(selectedTask));
      const showTaskEditor = editorTask && (csTask ? csEditorAllowed : (!isPaidTrafficDraft || !clientIdFromUrl || !loading));
      
      return (
        <div className="planeje-tasks flex flex-col h-full overflow-hidden">
          <div className="flex-shrink-0 mb-6">
            <WorkspacePageHeader
              title="Tarefas"
              label="Execução"
              help="A visão pessoal mostra as etapas das suas funções e as tarefas atribuídas diretamente a você. Ative a Visão da agência para consultar o quadro completo. Status, funções e responsáveis continuam seguindo as automações configuradas."
              actions={<>
                {(userRole === 'superadmin' || userRole === 'admin') && activeTab !== 'schedule' && (
                  <div className="hidden items-center gap-1 md:flex">
                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={() => setStatusSettingsOpen(true)} aria-label="Configurar status"><Settings className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={() => setTimeTrackingSettingsOpen(true)} aria-label="Configurar apontamentos"><Timer className="h-4 w-4" /></Button>
                  </div>
                )}
              {!['automations', 'capacity'].includes(activeTab) && <>
                <Button type="button" size="sm" className="h-9 rounded-xl px-3 text-xs" variant={agencyView ? 'default' : 'secondary'} onClick={() => setAgencyView((value) => !value)}>
                  <Building2 className="mr-1.5 h-3.5 w-3.5" />Visão da agência: {agencyView ? 'Ativa' : 'Desativada'}
                </Button>
                <Button size="sm" className="h-9 rounded-xl px-3 text-xs" onClick={handleNewTask}><Plus className="mr-1.5 h-3.5 w-3.5" />Nova tarefa</Button>
              </>}
              </>}
            />

            {!['automations', 'schedule', 'capacity'].includes(activeTab) && (
              <div className="mt-4">
                {/* Botão para expandir/recolher filtros no mobile */}
                {isMobile && (
                  <Button
                    variant="outline"
                    onClick={() => setFiltersExpanded(!filtersExpanded)}
                    className="w-full mb-2 flex items-center justify-center gap-2"
                  >
                    <Filter className="h-4 w-4" />
                    {filtersExpanded ? 'Ocultar Filtros' : 'Mostrar Filtros'}
                  </Button>
                )}
                
                {/* Filtros - sempre visíveis no desktop, condicionais no mobile */}
                <AnimatePresence>
                  {(!isMobile || filtersExpanded) && (
                    <motion.div
                      initial={isMobile ? { height: 0, opacity: 0 } : false}
                      animate={isMobile ? { height: 'auto', opacity: 1 } : false}
                      exit={isMobile ? { height: 0, opacity: 0 } : false}
                      transition={{ duration: 0.2 }}
                      className={isMobile ? 'overflow-hidden' : ''}
                    >
                      <div className="tasks-filters-bar flex flex-col md:flex-row md:flex-wrap items-center gap-4 p-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
                        <Filter className="text-gray-500 dark:text-gray-400 hidden md:block" />
                        {!agencyView && <div className="w-full rounded-md bg-violet-50 px-3 py-2 text-sm text-violet-800 dark:bg-violet-950/30 dark:text-violet-200 md:w-auto">
                          <strong>Minhas funções:</strong> {myOperationalFunctions.map((item) => item.name).join(', ') || 'somente atribuições diretas'}
                        </div>}
                        <Select value={clientFilter} onValueChange={setClientFilter}>
                          <SelectTrigger className="w-full md:w-[180px] whitespace-nowrap"><SelectValue placeholder="Filtrar por cliente" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todos os Clientes</SelectItem>
                            {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.empresa}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                          <SelectTrigger className="w-full md:w-[180px] whitespace-nowrap"><SelectValue placeholder="Filtrar por status" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todos os Status</SelectItem>
                            {visibleStatusOptions.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        {agencyView && <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                          <SelectTrigger className="w-full md:w-[180px] whitespace-nowrap"><SelectValue placeholder="Filtrar por responsável" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todos os Responsáveis</SelectItem>
                            {users.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                          </SelectContent>
                        </Select>}
                        <p className="tasks-due-legend w-full text-xs text-muted-foreground md:ml-auto md:w-auto">
                          Ordem: atrasadas e o que é para hoje primeiro. <span className="font-medium text-amber-600 dark:text-amber-400">Amarelo</span> = chega em até 3 dias. <span className="font-medium text-red-600 dark:text-red-400">Vermelho</span> = hoje ou atrasada.
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
            {activeTab === 'schedule' && (
              <div className="mt-4">
                <div className="tasks-filters-bar flex items-center gap-4 p-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
                  <Filter className="text-gray-500 dark:text-gray-400" />
                  <Select value={scheduleClientFilter} onValueChange={setScheduleClientFilter}>
                    <SelectTrigger className="w-full md:w-[220px] dark:bg-gray-800 dark:border-gray-700"><SelectValue placeholder="Selecione um cliente" /></SelectTrigger>
                    <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                      <SelectItem value="all">Todos os Clientes</SelectItem>
                      {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.empresa}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          <Tabs value={activeTab} className="w-full flex-grow flex flex-col overflow-hidden" onValueChange={handleTabChange}>
            <TabsList className={tasksTabBar}>
               {visibleTabs.map(tab => {
                const Icon = tab.icon;
                return (
                  <TabsTrigger key={tab.value} value={tab.value} className={tasksTabTrigger}>
                    <Icon className="h-4 w-4 shrink-0" />
                    {isMobile && tab.value === 'automations' ? '' : tab.label.split(' ')[0]}
                  </TabsTrigger>
                );
              })}
            </TabsList>
            {Object.entries(viewComponents).map(([key, Component]) => (
              <TabsContent key={key} value={key} className="flex-grow mt-2 overflow-y-auto">
                {loading ? <p className="text-center py-10 dark:text-gray-300">Carregando...</p> : <Component {...commonProps} isMobile={isMobile} />}
              </TabsContent>
            ))}
             <TabsContent value="schedule" className="flex-grow mt-2 overflow-y-auto">
              {scheduleLoading ? <p className="text-center py-10 dark:text-gray-300">Carregando agendamentos...</p> : (
                <CalendarView
                  tasks={filteredScheduleTasks}
                  onOpenTask={handleOpenTask}
                  onDeleteTask={(userRole === 'superadmin' || userRole === 'admin') ? handleDeleteTask : undefined}
                  statusOptions={visibleStatusOptions}
                  clients={clients}
                  showClientIndicator={scheduleClientFilter === 'all'}
                  forcedDateType="post_date"
                />
              )}
            </TabsContent>
             <TabsContent value="automations" className="flex-grow mt-2 overflow-y-auto">
              {(userRole === 'superadmin' || userRole === 'admin') && (
                <TaskAutomations
                  statusOptions={statusOptions}
                  users={users}
                  onTasksMutated={async () => {
                    await fetchData({ silent: true });
                  }}
                />
              )}
            </TabsContent>
            <TabsContent value="capacity" className="flex-grow mt-2 overflow-y-auto">
              <TeamCapacityView users={users} userRole={userRole} onOpenTask={handleOpenTask} />
            </TabsContent>
          </Tabs>

          <AnimatePresence>
            {csTask && !showTaskEditor && (
              loading || csScopeKey && csAccess?.key !== csScopeKey
                ? <p role="status">Conferindo a tarefa do cliente…</p>
                : <div role="alert">Tarefa ou cliente indisponível para esta ficha. <Button type="button" onClick={handleCloseTask}>Voltar ao CS IA</Button></div>
            )}
            {showTaskEditor && (
              <TaskDetail
                key={isNewTask ? `${location.key}:${draftAction?.code || (canApplyDecision ? 'gestor-ia' : '')}` : selectedTask.id}
                task={editorTask}
                onClose={handleCloseTask}
                onSave={handleSaveTask}
                onDelete={csTask ? undefined : handleDeleteTask}
                clients={clients}
                projects={projects}
                users={users}
                statusOptions={statusOptions}
                userRole={userRole}
                ephemeralDraft={csTask && isNewTask || isPaidTrafficDraft && gestorIa === true}
                lockClient={csTask}
                requireDueDate
              />
            )}
          </AnimatePresence>
          <AnimatePresence>
            {isStatusSettingsOpen && (
              <StatusSettings isOpen={isStatusSettingsOpen} onClose={() => { setStatusSettingsOpen(false); fetchData({ silent: true }); }} />
            )}
          </AnimatePresence>
          <AnimatePresence>
            {isTimeTrackingSettingsOpen && (
                <TimeTrackingSettings isOpen={isTimeTrackingSettingsOpen} onClose={() => setTimeTrackingSettingsOpen(false)} statusOptions={statusOptions} />
            )}
          </AnimatePresence>
        </div>
      );
    };

    export default Tasks;
