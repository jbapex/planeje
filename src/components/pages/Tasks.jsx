import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
    import { AnimatePresence, motion } from 'framer-motion';
    import { Plus, List, LayoutGrid, GitCommit, Settings, Filter, Bot, Calendar, Timer } from 'lucide-react';
    import { useParams, useNavigate } from 'react-router-dom';
    import { Button } from '@/components/ui/button';
    import { useToast } from '@/components/ui/use-toast';
    import { supabase } from '@/lib/customSupabaseClient';
    import { useAuth } from '@/contexts/SupabaseAuthContext';
    import { useModuleSettings } from '@/contexts/ModuleSettingsContext';
    import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
    import TaskDetail from '@/components/tasks/TaskDetail';
    import ListView from '@/components/tasks/ListView';
    import KanbanView from '@/components/tasks/KanbanView';
    import TimelineView from '@/components/tasks/TimelineView';
    import StatusSettings from '@/components/tasks/StatusSettings';
    import TaskAutomations from '@/components/tasks/automations/TaskAutomations';
    import CalendarView from '@/components/tasks/CalendarView';
    import TimeTrackingSettings from '@/components/tasks/TimeTrackingSettings';
    import { useDataCache } from '@/hooks/useDataCache';
import { executeAutomation } from '@/lib/workflow';

    const Tasks = () => {
      const [tasks, setTasks] = useState([]);
      const [scheduleTasks, setScheduleTasks] = useState([]);
      const [clients, setClients] = useState([]);
      const [projects, setProjects] = useState([]);
      const [users, setUsers] = useState([]);
      const [selectedTask, setSelectedTask] = useState(null);
      const [isNewTask, setIsNewTask] = useState(false);
      const [loading, setLoading] = useState(true);
      const [scheduleLoading, setScheduleLoading] = useState(true);
      const [isStatusSettingsOpen, setStatusSettingsOpen] = useState(false);
      const [isTimeTrackingSettingsOpen, setTimeTrackingSettingsOpen] = useState(false);
      const [statusOptions, setStatusOptions] = useState([]);
      const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
      const [filtersExpanded, setFiltersExpanded] = useState(false);


      const { toast } = useToast();
      const { user, profile } = useAuth();
      const { moduleAccess } = useModuleSettings();
      const userRole = profile?.role;
      const tasksAccessLevel = moduleAccess.tasks || 'all';
      const { view: activeTabFromUrl = 'list', id: taskIdFromUrl } = useParams();
      const navigate = useNavigate();
      
      // Hook de cache com chave única por usuário e role
      const cacheKey = `tasks_${user?.id}_${userRole}_${tasksAccessLevel}`;
      const { data: cachedData, setCachedData, shouldFetch } = useDataCache(cacheKey);
      
      // Ref para controlar se já fez o fetch inicial (evita re-fetch ao voltar para aba)
      const hasFetchedRef = useRef(false);
      
      const activeTab = useMemo(() => {
        if (isMobile && !['list', 'automations'].includes(activeTabFromUrl)) {
          return 'list';
        }
        return activeTabFromUrl;
      }, [activeTabFromUrl, isMobile]);

      useEffect(() => {
        const handleResize = () => {
          const mobile = window.innerWidth < 768;
          setIsMobile(mobile);
          if (mobile && !['list', 'automations'].includes(activeTab)) {
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

      useEffect(() => {
        if (user?.id) localStorage.setItem(`task_filter_${user.id}_client`, clientFilter);
      }, [clientFilter, user?.id]);

      useEffect(() => {
        if (user?.id) localStorage.setItem(`task_filter_${user.id}_status`, statusFilter);
      }, [statusFilter, user?.id]);
      
      useEffect(() => {
        if (user?.id) localStorage.setItem(`task_filter_${user.id}_assignee`, assigneeFilter);
      }, [assigneeFilter, user?.id]);

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
        const { data: tasksData, error: tasksError } = await supabase.from('tarefas').select('*, clientes(id, empresa), projetos(name)').not('post_date', 'is', null);
        if (tasksError) {
          toast({ title: "Erro ao buscar agendamentos", description: tasksError.message, variant: "destructive" });
        } else {
          setScheduleTasks(tasksData || []);
        }
        setScheduleLoading(false);
      }, [toast, user]);

      const fetchData = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        // Busca statusOptions primeiro e usa o resultado diretamente
        const fetchedStatusOptions = await fetchStatusOptions();
        await fetchScheduleData();
        
        let tasksQuery = supabase.from('tarefas').select('*, clientes(empresa), projetos(name)').or('type.is.null,type.neq.social_media,type.eq.paid_traffic');
        if (userRole === 'colaborador' && tasksAccessLevel === 'responsible') {
            tasksQuery = tasksQuery.contains('assignee_ids', [user.id]);
        }

        const { data: tasksData, error: tasksError } = await tasksQuery;
        const { data: clientsData, error: clientsError } = await supabase.from('clientes').select('id, empresa');
        const { data: projectsData, error: projectsError } = await supabase.from('projetos').select('id, name, client_id');
        // Importante: cliente (role='cliente') não pode ser responsável por nada no sistema.
        // Então removemos perfis de cliente de todas as listas de "usuários" (assignees/owners).
        const { data: usersData, error: usersError } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .neq('role', 'cliente');

        if (tasksError || clientsError || projectsError || usersError) {
          toast({ title: "Erro ao buscar dados", description: tasksError?.message || clientsError?.message || projectsError?.message || usersError?.message, variant: "destructive" });
        } else {
          // Salva no cache usando os statusOptions recém-buscados
          const dataToCache = {
            tasks: tasksData || [],
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
        }
        setLoading(false);
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
        if (!shouldFetch() && cachedData) {
          setTasks(cachedData.tasks);
          setClients(cachedData.clients);
          setProjects(cachedData.projects);
          setUsers(cachedData.users);
          // Não usa statusOptions do cache, pois já foi atualizado no useEffect acima
          setLoading(false);
          hasFetchedRef.current = true;
          return;
        }

        // Se não tem cache ou está expirado, faz fetch apenas uma vez
        if (!hasFetchedRef.current) {
          hasFetchedRef.current = true;
          fetchData();
        }
      }, [user, shouldFetch, cachedData, fetchData]); // Removido fetchStatusOptions para evitar loop

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
                  .select('*, clientes(empresa), projetos(name)')
                  .eq('id', newTask.id)
                  .single();
                
                if (!error && data) {
                  setTasks(prev => {
                    // Verifica se a tarefa já existe (evita duplicatas)
                    if (prev.find(t => t.id === data.id)) {
                      return prev;
                    }
                    return [...prev, data];
                  });
                  
                  // Atualiza scheduleTasks se for tarefa agendada
                  if (data.post_date) {
                    setScheduleTasks(prev => {
                      if (prev.find(t => t.id === data.id)) {
                        return prev.map(t => t.id === data.id ? data : t);
                      }
                      return [...prev, data];
                    });
                  }
                  
                  // Atualiza cache
                  setCachedData(prev => prev ? {
                    ...prev,
                    tasks: [...(prev.tasks || []), data]
                  } : null);
                }
              } else if (payload.eventType === 'UPDATE') {
                // Tarefa atualizada - ATUALIZAÇÃO IMEDIATA usando payload + busca relacionamentos se necessário
                const updatedTask = payload.new;
                
                // Atualiza imediatamente o estado local com os dados do payload
                setTasks(prev => {
                  const existingTask = prev.find(t => t.id === updatedTask.id);
                  if (existingTask) {
                    // Mescla os dados atualizados mantendo relacionamentos existentes
                    return prev.map(t => 
                      t.id === updatedTask.id 
                        ? { ...t, ...updatedTask, clientes: t.clientes, projetos: t.projetos }
                        : t
                    );
                  }
                  // Se não existe, mantém como está (será atualizado pela busca em background)
                  return prev;
                });
                
                // Atualiza scheduleTasks se for tarefa agendada
                if (updatedTask.post_date) {
                  setScheduleTasks(prev => {
                    const existingTask = prev.find(t => t.id === updatedTask.id);
                    if (existingTask) {
                      return prev.map(t => 
                        t.id === updatedTask.id 
                          ? { ...t, ...updatedTask, clientes: t.clientes, projetos: t.projetos }
                          : t
                      );
                    }
                    // Se não existe e tem post_date, busca dados completos
                    return prev;
                  });
                } else {
                  // Remove de scheduleTasks se não tem mais post_date
                  setScheduleTasks(prev => prev.filter(t => t.id !== updatedTask.id));
                }
                
                // Busca dados relacionados em background para garantir que estão atualizados
                supabase
                  .from('tarefas')
                  .select('*, clientes(empresa), projetos(name)')
                  .eq('id', updatedTask.id)
                  .single()
                  .then(({ data, error }) => {
                    if (!error && data) {
                      // Atualiza com dados completos quando disponíveis
                      setTasks(prev => prev.map(t => t.id === data.id ? data : t));
                      
                      // Atualiza scheduleTasks se necessário
                      if (data.post_date) {
                        setScheduleTasks(prev => {
                          const existing = prev.find(t => t.id === data.id);
                          if (existing) {
                            return prev.map(t => t.id === data.id ? data : t);
                          }
                          return [...prev, data];
                        });
                      }
                      
                      // Atualiza cache
                      setCachedData(prev => prev ? {
                        ...prev,
                        tasks: (prev.tasks || []).map(t => t.id === data.id ? data : t)
                      } : null);
                    }
                  });
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
      }, [user, userRole, tasksAccessLevel, setCachedData]);

      useEffect(() => {
        if (taskIdFromUrl && tasks.length > 0 && !isNewTask) {
          const task = tasks.find(t => t.id === taskIdFromUrl);
          if (task) {
            setSelectedTask(task);
            setIsNewTask(false);
          } else {
            toast({ title: "Tarefa não encontrada", variant: "destructive" });
            navigate(`/tasks/${activeTab}`);
          }
        } else if (taskIdFromUrl === 'new') {
          handleNewTask();
        } else {
          setSelectedTask(null);
          setIsNewTask(false);
        }
      }, [taskIdFromUrl, tasks, navigate, toast, isNewTask, activeTab]);

      const filteredTasks = useMemo(() => {
        const taskList = Array.isArray(tasks) ? tasks : [];
        let currentTasks = [...taskList];
        if (clientFilter !== 'all') currentTasks = currentTasks.filter(task => task.client_id === clientFilter);
        if (statusFilter !== 'all') currentTasks = currentTasks.filter(task => task.status === statusFilter);
        if (assigneeFilter !== 'all') currentTasks = currentTasks.filter(task => task.assignee_ids?.includes(assigneeFilter));
        return currentTasks;
      }, [tasks, clientFilter, statusFilter, assigneeFilter]);

      const filteredScheduleTasks = useMemo(() => {
        const list = Array.isArray(scheduleTasks) ? scheduleTasks : [];
        return list.filter(task => scheduleClientFilter === 'all' || task.client_id === scheduleClientFilter);
      }, [scheduleTasks, scheduleClientFilter]);

      const handleSaveTask = async (taskData, isNew) => {
        const { subtasks, ...restOfTaskData } = taskData;
        const dataToSave = { ...restOfTaskData, owner_id: user.id };

        if (dataToSave.due_date === '') dataToSave.due_date = null;
        if (dataToSave.post_date === '') dataToSave.post_date = null;
        if (dataToSave.client_id === '') dataToSave.client_id = null;
        if (dataToSave.project_id === '') dataToSave.project_id = null;
        
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
          const { data: newTask, error } = await supabase.from('tarefas').insert(dataToSave).select().single();
          if (error) {
            toast({ title: "Erro ao criar tarefa", description: error.message, variant: "destructive" });
          } else {
            toast({ title: "Tarefa criada!" });
            setCachedData(null); // Limpa cache para forçar refresh
            setTasks(prev => [...prev, newTask]);
            // Executa automações para nova tarefa
            try {
              await executeAutomation(newTask.id, 'task_created', { task: newTask });
            } catch (err) {
              console.error('Error executing automation for new task:', err);
            }
            navigate(`/tasks/${activeTab}`);
          }
        } else {
          delete dataToSave.clientes;
          delete dataToSave.projetos;
          
          const { data: oldData, error: fetchError } = await supabase.from('tarefas').select('status, time_logs, status_history, assignee_ids').eq('id', taskData.id).single();
          if (fetchError) {
            toast({ title: "Erro ao buscar tarefa antiga", description: fetchError.message, variant: "destructive" });
            return;
          }

          if (oldData.status !== dataToSave.status || JSON.stringify(oldData.assignee_ids) !== JSON.stringify(dataToSave.assignee_ids)) {
            const newHistoryEntry = {
              status: dataToSave.status,
              user_id: user.id,
              assignee_ids: dataToSave.assignee_ids,
              timestamp: new Date().toISOString()
            };
            dataToSave.status_history = [...(oldData.status_history || []), newHistoryEntry];
          }
          
          const { data: updatedTask, error: updateError } = await supabase.from('tarefas').update(dataToSave).eq('id', taskData.id).select().single();
          if (updateError) {
            toast({ title: "Erro ao atualizar tarefa", description: updateError.message, variant: "destructive" });
          } else {
            toast({ title: "Tarefa atualizada!" });
            setCachedData(null); // Limpa cache para forçar refresh
            setTasks(prev => prev.map(t => t.id === updatedTask.id ? { ...t, ...updatedTask } : t));
            if (oldData.status !== updatedTask.status) {
              // Executa automações para mudança de status
              const eventData = { old_status: oldData.status, new_status: updatedTask.status };
              const automationStart = performance.now();
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/72aa0069-2fbf-413e-a858-b1b419cc5e13',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Tasks.jsx:437',message:'Starting automation (form save)',data:{taskId:updatedTask.id,eventData},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
              // #endregion
              try {
                const result = await executeAutomation(updatedTask.id, 'status_change', eventData);
                const automationTime = performance.now() - automationStart;
                
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/72aa0069-2fbf-413e-a858-b1b419cc5e13',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Tasks.jsx:441',message:'Automation completed (form save)',data:{taskId:updatedTask.id,automationTime:automationTime.toFixed(2),success:result?.success,hasResults:!!result?.results?.length,willReload:result?.success&&result.results?.some(r=>r.result?.updatedTask)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
                // #endregion
                
                // Se a automação executou com sucesso, atualiza a UI
                if (result?.success && result.results?.length > 0) {
                  const updatedTaskFromAutomation = result.results.find(r => r.result?.updatedTask)?.result?.updatedTask;
                  if (updatedTaskFromAutomation) {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/72aa0069-2fbf-413e-a858-b1b419cc5e13',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Tasks.jsx:443',message:'Updating UI optimistically (form save)',data:{taskId:updatedTask.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'O'})}).catch(()=>{});
                    // #endregion
                    setTasks(prev => prev.map(t => t.id === updatedTask.id ? { ...t, ...updatedTaskFromAutomation } : t));
                  } else {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/72aa0069-2fbf-413e-a858-b1b419cc5e13',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Tasks.jsx:447',message:'Reloading data after automation (form save)',data:{taskId:updatedTask.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'I'})}).catch(()=>{});
                    // #endregion
                    fetchData();
                  }
                }
              } catch (err) {
                const automationTime = performance.now() - automationStart;
                console.error('Error executing automation for status change:', err);
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/72aa0069-2fbf-413e-a858-b1b419cc5e13',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Tasks.jsx:447',message:'Automation error (form save)',data:{taskId:updatedTask.id,error:err.message,automationTime:automationTime.toFixed(2)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'J'})}).catch(()=>{});
                // #endregion
              }
            }
            navigate(`/tasks/${activeTab}`);
          }
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
          navigate(`/tasks/${activeTab}`);
        }
      };

      const handleUpdateTaskStatus = async (taskId, newStatus) => {
        const taskToUpdate = tasks.find(t => t.id === taskId);
        if (!taskToUpdate) return;

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
                fetchData();
                return;
            }
        }

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
        
        const { data: updatedTask, error: updateError } = await supabase.from('tarefas').update({ status: newStatus, status_history: newStatusHistory }).eq('id', taskId).select().single();
        if (updateError) {
            toast({ title: "Erro ao atualizar status", variant: "destructive" });
            setTasks(originalTasks);
            setScheduleTasks(originalScheduleTasks);
        } else {
            // A subscription do Realtime vai atualizar automaticamente para todos os usuários
            // Mas garantimos que o estado local está correto
            setTasks(currentTasks => 
                currentTasks.map(task => 
                    task.id === updatedTask.id ? { ...task, ...updatedTask } : task
                )
            );
            
            if (oldData.status !== newStatus) {
                // Executa automações para mudança de status
                const eventData = { old_status: oldData.status, new_status: newStatus };
                const automationStart = performance.now();
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/72aa0069-2fbf-413e-a858-b1b419cc5e13',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Tasks.jsx:562',message:'Starting automation (drag-drop)',data:{taskId,eventData},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
                // #endregion
                try {
                  const result = await executeAutomation(taskId, 'status_change', eventData);
                  const automationTime = performance.now() - automationStart;
                  
                  // #region agent log
                  fetch('http://127.0.0.1:7242/ingest/72aa0069-2fbf-413e-a858-b1b419cc5e13',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Tasks.jsx:566',message:'Automation completed (drag-drop)',data:{taskId,automationTime:automationTime.toFixed(2),success:result?.success,hasResults:!!result?.results?.length,willReload:result?.success&&result.results?.some(r=>r.result?.updatedTask)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
                  // #endregion
                  
                  // Se a automação executou com sucesso, atualiza a UI
                  // Isso garante que mudanças de assignee_ids ou outras atualizações sejam refletidas
                  if (result?.success && result.results?.length > 0) {
                    // Atualização otimista: se temos a tarefa atualizada, usa ela diretamente
                    const updatedTask = result.results.find(r => r.result?.updatedTask)?.result?.updatedTask;
                    if (updatedTask) {
                      // #region agent log
                      fetch('http://127.0.0.1:7242/ingest/72aa0069-2fbf-413e-a858-b1b419cc5e13',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Tasks.jsx:570',message:'Updating UI optimistically',data:{taskId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'O'})}).catch(()=>{});
                      // #endregion
                      setTasks(currentTasks => 
                        currentTasks.map(task => 
                          task.id === taskId ? { ...task, ...updatedTask } : task
                        )
                      );
                    } else {
                      // Se não temos a tarefa atualizada, recarrega os dados
                      // #region agent log
                      fetch('http://127.0.0.1:7242/ingest/72aa0069-2fbf-413e-a858-b1b419cc5e13',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Tasks.jsx:577',message:'Reloading data after automation',data:{taskId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'I'})}).catch(()=>{});
                      // #endregion
                      fetchData();
                    }
                  }
                } catch (err) {
                  const automationTime = performance.now() - automationStart;
                  console.error('Error executing automation for status change:', err);
                  // #region agent log
                  fetch('http://127.0.0.1:7242/ingest/72aa0069-2fbf-413e-a858-b1b419cc5e13',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Tasks.jsx:572',message:'Automation error (drag-drop)',data:{taskId,error:err.message,automationTime:automationTime.toFixed(2)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'J'})}).catch(()=>{});
                  // #endregion
                }
            }
        }
    };

      const handleOpenTask = (task) => navigate(`/tasks/${activeTab}/${task.id}`);
      const handleNewTask = () => {
        setIsNewTask(true);
        setSelectedTask(null);
        navigate(`/tasks/${activeTab}/new`);
      };
      const handleCloseTask = () => {
        setIsNewTask(false);
        setSelectedTask(null);
        navigate(`/tasks/${activeTab}`);
      };

      const handleTabChange = (newTab) => {
        navigate(`/tasks/${newTab}`);
      };
      
      const tabOptions = [
        { value: 'list', label: 'Lista', icon: List },
        { value: 'kanban', label: 'Kanban', icon: LayoutGrid, mobile: false },
        { value: 'timeline', label: 'Linha do Tempo', icon: GitCommit, mobile: false },
        { value: 'schedule', label: 'Calendário', icon: Calendar, mobile: false },
        { value: 'automations', label: 'Automações', icon: Bot, adminOnly: true },
      ];

      const visibleTabs = tabOptions.filter(tab => {
        if (isMobile && tab.mobile === false) return false;
        if (tab.adminOnly && userRole !== 'superadmin' && userRole !== 'admin') return false;
        return true;
      });

      const viewComponents = { list: ListView, kanban: KanbanView, timeline: TimelineView };
      const commonProps = { tasks: filteredTasks, clients, projects, users, statusOptions, onOpenTask: handleOpenTask, onUpdateStatus: handleUpdateTaskStatus, onDelete: handleDeleteTask, fetchData, userRole };
      
      return (
        <div className="flex flex-col h-full overflow-hidden">
          <div className="flex-shrink-0 mb-6">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Tarefas</h1>
                {(userRole === 'superadmin' || userRole === 'admin') && activeTab !== 'schedule' && (
                  <div className="hidden md:flex">
                    <Button variant="ghost" size="icon" onClick={() => setStatusSettingsOpen(true)} className="dark:text-gray-300 dark:hover:bg-gray-700"><Settings className="h-5 w-5" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => setTimeTrackingSettingsOpen(true)} className="dark:text-gray-300 dark:hover:bg-gray-700"><Timer className="h-5 w-5" /></Button>
                  </div>
                )}
              </div>
              {activeTab !== 'automations' && <Button onClick={handleNewTask}><Plus className="mr-2 h-4 w-4" /> Nova Tarefa</Button>}
            </div>

            {activeTab !== 'automations' && activeTab !== 'schedule' && (
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
                      <div className="flex flex-col md:flex-row items-center gap-4 p-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
                        <Filter className="text-gray-500 dark:text-gray-400 hidden md:block" />
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
                            {statusOptions.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                          <SelectTrigger className="w-full md:w-[180px] whitespace-nowrap"><SelectValue placeholder="Filtrar por responsável" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todos os Responsáveis</SelectItem>
                            {users.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
            {activeTab === 'schedule' && (
              <div className="mt-4">
                <div className="flex items-center gap-4 p-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
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
            <TabsList className="dark:bg-gray-800 dark:border-gray-700 flex-shrink-0">
               {visibleTabs.map(tab => {
                const Icon = tab.icon;
                return (
                  <TabsTrigger key={tab.value} value={tab.value} className="dark:text-gray-300 dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-white">
                    <Icon className="mr-2 h-4 w-4" />
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
              {scheduleLoading ? <p className="text-center py-10 dark:text-gray-300">Carregando agendamentos...</p> : <CalendarView tasks={filteredScheduleTasks} onOpenTask={handleOpenTask} statusOptions={statusOptions} clients={clients} showClientIndicator={scheduleClientFilter === 'all'} forcedDateType="post_date" />}
            </TabsContent>
             <TabsContent value="automations" className="flex-grow mt-2 overflow-y-auto">
              {(userRole === 'superadmin' || userRole === 'admin') && <TaskAutomations statusOptions={statusOptions} users={users} />}
            </TabsContent>
          </Tabs>

          <AnimatePresence>
            {(selectedTask || isNewTask) && (
              <TaskDetail
                task={selectedTask || { title: '', description: '', status: statusOptions.length > 0 ? statusOptions[0].value : 'todo', client_id: '', project_id: '', assignee_ids: userRole === 'colaborador' ? [user.id] : [], due_date: '', post_date: '', type: '', time_logs: [], status_history: [] }}
                onClose={handleCloseTask}
                onSave={handleSaveTask}
                onDelete={handleDeleteTask}
                clients={clients}
                projects={projects}
                users={users}
                statusOptions={statusOptions}
                userRole={userRole}
              />
            )}
          </AnimatePresence>
          <AnimatePresence>
            {isStatusSettingsOpen && (
              <StatusSettings isOpen={isStatusSettingsOpen} onClose={() => { setStatusSettingsOpen(false); fetchData(); }} />
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