import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
    import { useParams, useNavigate } from 'react-router-dom';
    import { ArrowLeft, CalendarDays, Edit, FileText, Trash2 } from 'lucide-react';
    import { supabase } from '@/lib/customSupabaseClient';
    import { useToast } from '@/components/ui/use-toast';
    import { Button } from '@/components/ui/button';
    import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
    import ProjectPlanningWorkspace from '@/components/projects/ProjectPlanningWorkspace';
import ProjectMonthlyScope from '@/components/projects/ProjectMonthlyScope';
import ProjectTaskTracking from '@/components/projects/ProjectTaskTracking';
import ProjectPlanningTimeline from '@/components/projects/ProjectPlanningTimeline';
import { projectPeriodLabel } from '@/lib/projectPeriod';
    import CampaignMaterialsCalendar from '@/components/projects/CampaignMaterialsCalendar';
    import ProjectDocuments from '@/components/projects/ProjectDocuments';
    import ProjectForm from '@/components/forms/ProjectForm';
    import { AnimatePresence } from 'framer-motion';
    import { useAuth } from '@/contexts/SupabaseAuthContext';
    import { useDataCache } from '@/hooks/useDataCache';
    import { cn } from '@/lib/utils';
    import { projectStatusLabel, normalizeProjetosStatus } from '@/lib/projectsOperationalMetrics';
    import WorkspacePageHeader from '@/components/layout/WorkspacePageHeader';

    const STATUS_STYLES = {
      'planejamento': 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-200 dark:border-blue-700',
      'aprovacao': 'bg-violet-100 text-violet-900 border-violet-200 dark:bg-violet-900/25 dark:text-violet-100 dark:border-violet-700',
      'execucao': 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-200 dark:border-yellow-700',
      'concluido': 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-200 dark:border-green-700',
      'pausado': 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-700/20 dark:text-gray-200 dark:border-gray-600',
    };

    const ProjectDetail = () => {
      const { id, '*': subpath } = useParams();
      const navigate = useNavigate();
      const { toast } = useToast();
      const [project, setProject] = useState(null);
      const [client, setClient] = useState(null);
      const [clients, setClients] = useState([]);
      const [users, setUsers] = useState([]);
      const [tasks, setTasks] = useState([]);
      const [campaignPlan, setCampaignPlan] = useState(null);
      const [taskStatuses, setTaskStatuses] = useState([]);
      const [loading, setLoading] = useState(true);
      const [showForm, setShowForm] = useState(false);
      const plannerRef = useRef(null);
      const calendarRef = useRef(null);
      const leaveTo = async (url) => {
        if (plannerRef.current && !await plannerRef.current.flush()) return;
        if (calendarRef.current && !await calendarRef.current.flush()) return;
        navigate(url);
      };
      const { profile, user } = useAuth();
      const userRole = profile?.role;

      const activeView = useMemo(() => {
        const t = subpath?.split('/')[0] || 'planner';
        if (t === 'calendar' || t === 'documents') return t;
        return 'planner';
      }, [subpath]);
      
      // Hook de cache com chave única por projeto
      const { data: cachedData, setCachedData, shouldFetch } = useDataCache(`project_${id}`);

      const fetchData = useCallback(async (options = {}) => {
        if (!options.silent) setLoading(true);
        const { data: projectData, error: projectError } = await supabase.from('projetos').select('*, clientes ( * )').eq('id', id).single();
        
        if (projectError || !projectData) {
          toast({ title: 'Erro ao buscar campanha', description: projectError?.message || 'Campanha não encontrada.', variant: 'destructive' });
          navigate('/projects');
          return;
        }

        const { data: tasksData, error: tasksError } = await supabase.from('tarefas').select('*').eq('project_id', id);
        const { data: clientsData, error: clientsError } = await supabase.from('clientes').select('*');
        // Importante: cliente (role='cliente') não pode ser responsável por nada no sistema.
        // Então removemos perfis de cliente de todas as listas de "usuários".
        const { data: usersData, error: usersError } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .neq('role', 'cliente');
        const { data: planData, error: planError } = await supabase.from('campaign_plans').select('*').eq('project_id', projectData.id).maybeSingle();
        const { data: statusesData } = await supabase
          .from('task_statuses')
          .select('status_value:value, label, color, sort_order, is_terminal')
          .order('sort_order');

        if (tasksError) {
          toast({ title: 'Erro ao buscar tarefas', description: tasksError.message, variant: 'destructive' });
        }
        if (clientsError) {
            toast({ title: 'Erro ao buscar clientes', description: clientsError.message, variant: 'destructive' });
        }
        if (usersError) {
            toast({ title: 'Erro ao buscar usuários', description: usersError.message, variant: 'destructive' });
        }
        if (planError && planError.code !== 'PGRST116') {
          toast({ title: 'Erro ao buscar plano de campanha', description: planError.message, variant: 'destructive' });
        }

        // Salva no cache
        const dataToCache = {
          project: projectData,
          client: projectData.clientes,
          tasks: tasksData || [],
          clients: clientsData || [],
          users: usersData || [],
          campaignPlan: planData,
          taskStatuses: statusesData || [],
        };
        
        setCachedData(dataToCache);
        setProject(dataToCache.project);
        setClient(dataToCache.client);
        setTasks(dataToCache.tasks);
        setClients(dataToCache.clients);
        setUsers(dataToCache.users);
        setCampaignPlan(dataToCache.campaignPlan);
        setTaskStatuses(dataToCache.taskStatuses || []);

        setLoading(false);
      }, [id, navigate, toast, setCachedData]);

      useEffect(() => {
        // Se tem cache válido (últimos 30 segundos), usa ele
        if (!shouldFetch() && cachedData) {
          setProject(cachedData.project);
          setClient(cachedData.client);
          setTasks(cachedData.tasks);
          setClients(cachedData.clients);
          setUsers(cachedData.users || []);
          setCampaignPlan(cachedData.campaignPlan);
          setTaskStatuses(cachedData.taskStatuses || []);
          setLoading(false);
          return; // Não faz fetch!
        }

        // Se não tem cache ou está expirado, faz fetch
        fetchData();
      }, [fetchData, shouldFetch, cachedData, setCachedData]);
      useEffect(() => {
        const refresh = () => { void fetchData({ silent: true }); };
        refresh();
        window.addEventListener('focus', refresh);
        return () => window.removeEventListener('focus', refresh);
      }, [fetchData]);

      const handleDeleteProject = async () => {
        const { error } = await supabase.from('projetos').delete().eq('id', id);
        if (error) {
          toast({ title: "Erro ao remover campanha", description: error.message, variant: "destructive" });
        } else {
          toast({ title: "Campanha removida" });
          navigate('/projects');
        }
      };

      const handleSaveProject = async (projectData) => {
        const { error } = await supabase.from('projetos').update(projectData).eq('id', id);
        if (error) {
          toast({ title: "Erro ao atualizar campanha", description: error.message, variant: "destructive" });
          return false;
        } else {
          toast({ title: "Campanha atualizada!" });
          setCachedData(null); // Limpa cache para forçar refresh
          fetchData();
        }
        setShowForm(false);
        return true;
      };
      const handleChangeStage = async (status) => {
        if (plannerRef.current && !await plannerRef.current.flush()) return;
        const { data, error } = await supabase.from('projetos').update({ status }).eq('id', id).select('*').single();
        if (error) { toast({ title: 'Não foi possível mudar a etapa', description: error.message, variant: 'destructive' }); return; }
        setProject((current) => ({ ...current, ...data }));
        setCachedData((current) => current ? { ...current, project: { ...current.project, ...data } } : current);
        await fetchData({ silent: true });
        toast({ title: 'Etapa do projeto atualizada' });
      };

      if (loading) {
        return <div className="flex items-center justify-center h-full dark:text-gray-300"><p>Carregando detalhes da campanha...</p></div>;
      }

      if (!project || !client) {
        return null;
      }

      return (
        <>
          <div className="flex w-full min-w-0 flex-col">
            <WorkspacePageHeader
              title={project.name}
              label={projectStatusLabel(project.status)}
              labelClassName={cn('border', STATUS_STYLES[normalizeProjetosStatus(project.status)] || '')}
              description={`${client?.empresa} · ${projectPeriodLabel(project)}`}
              help="O plano registra o documento e os materiais do período, organizados por mês. Calendário organiza as datas, Referências guarda os arquivos de apoio e Tarefas acompanha a execução pelo fluxo configurado."
              leading={<Button type="button" variant="ghost" size="icon" onClick={() => leaveTo('/projects')} className="h-9 w-9 shrink-0 rounded-xl" aria-label="Voltar aos planos"><ArrowLeft className="h-4 w-4" /></Button>}
              actions={<>
                      {activeView === 'planner' ? <>
                        <Button type="button" variant="ghost" size="sm" onClick={() => leaveTo(`/projects/${id}/calendar`)} className="h-9 rounded-xl px-3 text-xs">
                          <CalendarDays className="mr-1 h-3.5 w-3.5" /> Calendário
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => leaveTo(`/projects/${id}/documents`)} className="h-9 rounded-xl px-3 text-xs">
                          <FileText className="mr-1 h-3.5 w-3.5" /> Referências
                        </Button>
                      </> : <Button type="button" variant="secondary" size="sm" onClick={() => leaveTo(`/projects/${id}/planner`)} className="h-9 rounded-xl px-3 text-xs">
                        <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Voltar ao plano
                      </Button>}
                      {(userRole === 'superadmin' || userRole === 'admin') && <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowForm(true)}
                          className="h-9 rounded-xl px-3 text-xs"
                        >
                          <Edit className="mr-1 h-3 w-3" /> Editar
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button type="button" variant="destructive" size="sm" className="h-9 rounded-xl px-3 text-xs">
                              <Trash2 className="mr-1 h-3 w-3" /> Excluir
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="dark:border-gray-700 dark:bg-gray-800">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="dark:text-white">Você tem certeza?</AlertDialogTitle>
                              <AlertDialogDescription className="dark:text-gray-400">
                                Esta ação não pode ser desfeita. Isso excluirá permanentemente a campanha &quot;{project.name}&quot;.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="dark:border-gray-600 dark:text-white dark:hover:bg-gray-700">Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={handleDeleteProject} className="dark:bg-red-600 dark:hover:bg-red-700">Excluir</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>}
              </>}
            />

            {/* Sem forceMount: evita CampaignPlanner montado em background sobrescrever
                materiais salvos no Calendário (autosave com debounce + sessionStorage). */}
            {activeView === 'planner' && <main className="min-h-0 pt-4">
              <ProjectPlanningTimeline project={project} plan={campaignPlan} tasks={tasks} statusOptions={taskStatuses.map((status) => ({ ...status, value: status.status_value }))} canManage={['superadmin', 'admin'].includes(userRole) || user?.id === project.owner_id} onChangeStage={handleChangeStage} onEditDates={() => setShowForm(true)} />
              <ProjectMonthlyScope client={client} project={project} />
              <div className="mt-5"><ProjectPlanningWorkspace key={project.id} ref={plannerRef} project={project} client={client} /></div>
              <div className="mt-8"><ProjectTaskTracking key={project.id} project={project} plan={campaignPlan} users={users} taskStatuses={taskStatuses} /></div>
            </main>}
            {activeView === 'calendar' && <main className="min-h-0 pt-4">
              <CampaignMaterialsCalendar key={project.id} ref={calendarRef} project={project} client={client} />
            </main>}
            {activeView === 'documents' && <main className="flex min-h-0 h-[calc(100vh-220px)] flex-col pt-4">
              <div className="min-h-0 flex-1 overflow-hidden">
                <ProjectDocuments client={client} />
              </div>
            </main>}
          </div>

          <AnimatePresence>
            {showForm && (
              <ProjectForm
                project={project}
                clients={clients}
                users={users}
                onSave={handleSaveProject}
                onClose={() => setShowForm(false)}
              />
            )}
          </AnimatePresence>
        </>
      );
    };

    export default ProjectDetail;
