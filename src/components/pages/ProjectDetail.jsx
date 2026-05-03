import React, { useState, useEffect, useCallback, useMemo } from 'react';
    import { useParams, useNavigate } from 'react-router-dom';
    import { ArrowLeft, Edit, Trash2 } from 'lucide-react';
    import { supabase } from '@/lib/customSupabaseClient';
    import { useToast } from '@/components/ui/use-toast';
    import { Button } from '@/components/ui/button';
    import { Badge } from '@/components/ui/badge';
    import { Card, CardHeader, CardTitle } from '@/components/ui/card';
    import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
    import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
    import CampaignPlanner from '@/components/projects/CampaignPlanner';
    import ChecklistGenerator from '@/components/projects/ChecklistGenerator';
    import CampaignMaterialsCalendar from '@/components/projects/CampaignMaterialsCalendar';
    import ProjectReport from '@/components/projects/ProjectReport';
    import ProjectDocuments from '@/components/projects/ProjectDocuments';
    import ProjectForm from '@/components/forms/ProjectForm';
    import { AnimatePresence } from 'framer-motion';
    import { useAuth } from '@/contexts/SupabaseAuthContext';
    import { useDataCache } from '@/hooks/useDataCache';
    import { cn } from '@/lib/utils';
    import { projectStatusLabel, normalizeProjetosStatus } from '@/lib/projectsOperationalMetrics';

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
      const { profile } = useAuth();
      const userRole = profile?.role;

      const activeTab = useMemo(() => {
        const t = subpath?.split('/')[0] || 'report';
        return t === 'funnel' ? 'report' : t;
      }, [subpath]);
      
      // Hook de cache com chave única por projeto
      const { data: cachedData, setCachedData, shouldFetch } = useDataCache(`project_${id}`);

      const fetchData = useCallback(async () => {
        setLoading(true);
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
          .select('status_value, label, color, sort_order')
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
        const t = subpath?.split('/')[0];
        if (t === 'funnel') {
          navigate(`/projects/${id}/report`, { replace: true });
        }
      }, [subpath, id, navigate]);

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
        } else {
          toast({ title: "Campanha atualizada!" });
          setCachedData(null); // Limpa cache para forçar refresh
          fetchData();
        }
        setShowForm(false);
      };

      if (loading) {
        return <div className="flex items-center justify-center h-full dark:text-gray-300"><p>Carregando detalhes da campanha...</p></div>;
      }

      if (!project || !client) {
        return null;
      }

      const projectTabTriggerClass = cn(
        'rounded-sm px-1.5 py-1 text-[11px] font-medium leading-tight text-white/95 shadow-none transition-colors',
        'hover:bg-white/15 data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm',
        'sm:px-2.5 sm:py-1 sm:text-xs dark:data-[state=active]:bg-gray-100 dark:data-[state=active]:text-gray-950'
      );

      return (
        <>
          <Tabs
            value={activeTab}
            onValueChange={(value) => navigate(`/projects/${id}/${value}`)}
            className="flex w-full min-w-0 flex-col"
          >
            <div className="sticky top-0 z-30 -mx-6 shrink-0 border-b border-gray-200 bg-white px-6 pb-2 pt-0 shadow-sm dark:border-gray-700 dark:bg-gray-950">
              <Card className="overflow-hidden rounded-t-none border-t-0 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <CardHeader className="space-y-0 p-2 sm:p-2.5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate('/projects')}
                        className="-ml-1.5 h-7 shrink-0 gap-0.5 px-1.5 text-xs text-muted-foreground hover:text-foreground dark:text-gray-300 dark:hover:bg-gray-700/80"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        <span className="ml-0.5 hidden sm:inline">Voltar</span>
                      </Button>
                      <div className="min-w-0 flex-1 space-y-0">
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                          <CardTitle className="text-lg font-semibold leading-snug tracking-tight text-foreground dark:text-white sm:text-xl">
                            {project.name}
                          </CardTitle>
                          <Badge
                            variant="outline"
                            className={cn(
                              'shrink-0 px-1.5 py-0 text-[10px] font-medium leading-none',
                              STATUS_STYLES[normalizeProjetosStatus(project.status)] || ''
                            )}
                          >
                            {projectStatusLabel(project.status)}
                          </Badge>
                        </div>
                        <p className="truncate text-xs text-muted-foreground dark:text-gray-400">{client?.empresa}</p>
                      </div>
                    </div>
                    {(userRole === 'superadmin' || userRole === 'admin') && (
                      <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowForm(true)}
                          className="h-7 px-2 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600"
                        >
                          <Edit className="mr-1 h-3 w-3" /> Editar
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button type="button" variant="destructive" size="sm" className="h-7 px-2 text-xs">
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
                      </div>
                    )}
                  </div>
                </CardHeader>
                <div className="border-t border-border/60 px-1.5 pb-1.5 pt-1 dark:border-gray-600/80">
                  <TabsList className="grid h-auto w-full grid-cols-2 gap-0.5 rounded-md bg-gradient-to-br from-orange-400 to-purple-600 p-0.5 text-white shadow-sm sm:grid-cols-5">
                    <TabsTrigger value="report" className={projectTabTriggerClass}>Relatório</TabsTrigger>
                    <TabsTrigger value="planner" className={projectTabTriggerClass}>Plano de Campanha</TabsTrigger>
                    <TabsTrigger value="calendar" className={projectTabTriggerClass}>Calendário</TabsTrigger>
                    <TabsTrigger value="documents" className={projectTabTriggerClass}>Documentos</TabsTrigger>
                    <TabsTrigger value="checklist" className={projectTabTriggerClass}>Checklist</TabsTrigger>
                  </TabsList>
                </div>
              </Card>
            </div>

            <TabsContent value="report" forceMount={true} className={activeTab === 'report' ? 'mt-0 min-h-0 pt-4 focus-visible:ring-0 focus-visible:ring-offset-0' : 'hidden'}>
              <ProjectReport project={project} tasks={tasks} campaignPlan={campaignPlan} taskStatuses={taskStatuses} />
            </TabsContent>
            {/* Sem forceMount: evita CampaignPlanner montado em background sobrescrever
                materiais salvos no Calendário (autosave com debounce + sessionStorage). */}
            <TabsContent value="planner" className={activeTab === 'planner' ? 'mt-0 min-h-0 pt-4 focus-visible:ring-0 focus-visible:ring-offset-0' : 'hidden'}>
              <CampaignPlanner project={project} client={client} isPage />
            </TabsContent>
            <TabsContent value="calendar" forceMount={true} className={activeTab === 'calendar' ? 'mt-0 min-h-0 pt-4 focus-visible:ring-0 focus-visible:ring-offset-0' : 'hidden'}>
              <CampaignMaterialsCalendar project={project} client={client} onRefresh={fetchData} />
            </TabsContent>
            <TabsContent value="documents" forceMount={true} className={activeTab === 'documents' ? 'mt-0 flex min-h-0 h-[calc(100vh-280px)] flex-col pt-4 focus-visible:ring-0 focus-visible:ring-offset-0' : 'hidden'}>
              <div className="min-h-0 flex-1 overflow-hidden">
                <ProjectDocuments client={client} />
              </div>
            </TabsContent>
            <TabsContent value="checklist" forceMount={true} className={activeTab === 'checklist' ? 'mt-0 min-h-0 pt-4 focus-visible:ring-0 focus-visible:ring-offset-0' : 'hidden'}>
              <ChecklistGenerator project={project} fetchProjects={fetchData} isPage />
            </TabsContent>
          </Tabs>

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