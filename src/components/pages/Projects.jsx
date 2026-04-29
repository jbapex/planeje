import React, { useState, useEffect, useCallback, useRef } from 'react';
    import { AnimatePresence } from 'framer-motion';
    import { Plus, Search, Filter, List, LayoutGrid, Trash2, ArrowLeft, ChevronRight } from 'lucide-react';
    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';
    import { useToast } from '@/components/ui/use-toast';
    import { supabase } from '@/lib/customSupabaseClient';
    import { useAuth } from '@/contexts/SupabaseAuthContext';
    import ProjectForm from '@/components/forms/ProjectForm';
    import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
    import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
    import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
    import { Badge } from '@/components/ui/badge';
    import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
    import {
      Table,
      TableBody,
      TableCell,
      TableHead,
      TableHeader,
      TableRow,
    } from "@/components/ui/table";
    import { useDataCache } from '@/hooks/useDataCache';
    import ProjectsOperationalPanel from '@/components/projects/ProjectsOperationalPanel';

    const Projects = () => {
      const [projects, setProjects] = useState([]);
      const [clients, setClients] = useState([]);
      const [tasks, setTasks] = useState([]);
      const [campaignPlans, setCampaignPlans] = useState([]);
      const [users, setUsers] = useState([]);
      const [editingProject, setEditingProject] = useState(null);
      const [loading, setLoading] = useState(true);
      const [searchTerm, setSearchTerm] = useState('');
      const [statusFilter, setStatusFilter] = useState('all');
      const [viewMode, setViewMode] = useState('grid');
      const [showDeleteAlert, setShowDeleteAlert] = useState(false);
      const [projectToDelete, setProjectToDelete] = useState(null);
      const [isFormOpen, setIsFormOpen] = useState(false);
      const [selectedClientId, setSelectedClientId] = useState(null);
      const { toast } = useToast();
      const { user } = useAuth();
      const navigate = useNavigate();
      const location = useLocation();
      const [searchParams] = useSearchParams();
      const prefillClientId = searchParams.get('client_id');
      const prefillYear = searchParams.get('year');
      const prefillMonth = searchParams.get('month');
      
      // Hook de cache para prevenir re-fetch desnecessário
      const { data: cachedData, setCachedData, shouldFetch } = useDataCache('projects_v4');
      
      // Ref para controlar se já fez o fetch inicial (evita re-fetch ao voltar para aba)
      const hasFetchedRef = useRef(false);

      useEffect(() => {
        const path = location.pathname;
        if (path === '/projects/new') {
            setEditingProject(null);
            setIsFormOpen(true);
        } else if (path.startsWith('/projects/edit/')) {
            const projectId = path.split('/projects/edit/')[1];
            const projectToEdit = projects.find(p => p.id === projectId);
            if (projectToEdit) {
                setEditingProject(projectToEdit);
                setIsFormOpen(true);
            } else if (projects.length > 0) {
                navigate('/projects');
            }
        } else {
            setIsFormOpen(false);
            setEditingProject(null);
        }
      }, [location, navigate, projects]);


      const fetchData = useCallback(async () => {
        setLoading(true);
        const { data: projectsData, error: projectsError } = await supabase.from('projetos').select('*, clientes(empresa)');
        const { data: clientsData, error: clientsError } = await supabase
          .from('clientes')
          .select('id, empresa, responsavel, logo_urls, etapa');
        const { data: tasksData, error: tasksError } = await supabase.from('tarefas').select('id, project_id, status, assignee_ids, due_date, post_date, title');
        const projectIds = (projectsData || []).map((p) => p.id).filter(Boolean);
        let plansData = [];
        let plansError = null;
        if (projectIds.length > 0) {
          const res = await supabase.from('campaign_plans').select('*').in('project_id', projectIds);
          plansData = res.data || [];
          plansError = res.error;
        }
        // Importante: cliente (role='cliente') não pode ser responsável por nada no sistema.
        // Então removemos perfis de cliente de todas as listas de "usuários".
        const { data: usersData, error: usersError } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .neq('role', 'cliente');

        if (projectsError || clientsError || tasksError || usersError || plansError) {
          toast({ title: "Erro ao buscar dados", description: projectsError?.message || clientsError?.message || tasksError?.message || usersError?.message || plansError?.message, variant: "destructive" });
        } else {
          // Salva no cache
          const dataToCache = {
            projects: projectsData || [],
            clients: clientsData || [],
            tasks: tasksData || [],
            campaignPlans: plansData || [],
            users: usersData || []
          };
          setCachedData(dataToCache);
          setProjects(dataToCache.projects);
          setClients(dataToCache.clients);
          setTasks(dataToCache.tasks);
          setCampaignPlans(dataToCache.campaignPlans);
          setUsers(dataToCache.users);
        }
        setLoading(false);
      }, [toast, setCachedData]);

      useEffect(() => {
        if (!user) return;
        
        // Se já fez fetch inicial, não faz nada (evita recarregamento ao voltar para aba)
        if (hasFetchedRef.current) {
          // Apenas sincroniza com cache se necessário, sem fazer fetch
          if (!shouldFetch() && cachedData) {
            setProjects(cachedData.projects);
            setClients(cachedData.clients);
            setTasks(cachedData.tasks);
            setCampaignPlans(cachedData.campaignPlans || []);
            setUsers(cachedData.users);
            setLoading(false);
          }
          return;
        }
        
        // Se tem cache válido, usa ele e marca como fetched
        if (!shouldFetch() && cachedData) {
          setProjects(cachedData.projects);
          setClients(cachedData.clients);
          setTasks(cachedData.tasks);
          setCampaignPlans(cachedData.campaignPlans || []);
          setUsers(cachedData.users);
          setLoading(false);
          hasFetchedRef.current = true;
          return;
        }

        // Se não tem cache ou está expirado, faz fetch apenas uma vez
        if (!hasFetchedRef.current) {
          hasFetchedRef.current = true;
          fetchData();
        }
      }, [user]); // Apenas user como dependência - evita re-execução
      
      const handleSaveProject = async (projectData, isNew) => {
        // Usa o owner_id do formData se existir, senão usa o user.id como padrão
        const dataToSave = { ...projectData, owner_id: projectData.owner_id || user.id };
        let error;

        if (isNew) {
            ({ error } = await supabase.from('projetos').insert(dataToSave));
        } else {
            ({ error } = await supabase.from('projetos').update(dataToSave).eq('id', editingProject.id));
        }

        if (error) {
          toast({ title: "Erro ao salvar projeto", description: error.message, variant: "destructive" });
        } else {
          toast({ title: `Projeto ${isNew ? 'criado' : 'atualizado'}!` });
          setCachedData(null); // Limpa cache para forçar refresh
          
          // Se criou um novo projeto e tinha cliente selecionado, mantém o cliente selecionado
          // Se não tinha cliente selecionado mas o projeto tem client_id, seleciona esse cliente
          if (isNew && dataToSave.client_id) {
            if (!selectedClientId) {
              setSelectedClientId(dataToSave.client_id);
            }
          }
          
          fetchData();
          navigate('/projects');
        }
      };

      const handleDeleteProject = async (projectId) => {
        const { error: tasksError } = await supabase.from('tarefas').delete().eq('project_id', projectId);
        if (tasksError) {
          toast({ title: "Erro ao remover tarefas do projeto", description: tasksError.message, variant: "destructive" });
          return;
        }
        
        const { error } = await supabase.from('projetos').delete().eq('id', projectId);
        if (error) {
          toast({ title: "Erro ao remover projeto", description: error.message, variant: "destructive" });
        } else {
          toast({ title: "Projeto removido" });
          setCachedData(null); // Limpa cache para forçar refresh
          fetchData();
        }
      };
      
      const confirmDelete = () => {
        if (projectToDelete) {
          handleDeleteProject(projectToDelete.id);
        }
        setProjectToDelete(null);
        setShowDeleteAlert(false);
      };
      
      const handleDeleteClick = (e, project) => {
        e.stopPropagation();
        setProjectToDelete(project);
        setShowDeleteAlert(true);
      };
      
      const handleOpenForm = (project = null) => {
        navigate(project ? `/projects/edit/${project.id}` : '/projects/new');
      };

      const handleCloseForm = () => {
        navigate('/projects');
      };

      const handleSelectClient = (clientId) => {
        setSelectedClientId(clientId);
        setSearchTerm('');
        setStatusFilter('all');
      };

      const handleBackToClients = () => {
        setSelectedClientId(null);
        setSearchTerm('');
        setStatusFilter('all');
      };

      const getProjectProgress = (projectId) => {
        const projectTasks = tasks.filter(t => t.project_id === projectId);
        if (projectTasks.length === 0) return 0;
        const completedTasks = projectTasks.filter(t => ['published', 'concluido'].includes(t.status));
        return (completedTasks.length / projectTasks.length) * 100;
      };

      // Busca o responsável pela execução do projeto (owner)
      const getProjectOwner = (project) => {
        if (!project || !project.owner_id) return null;
        // Busca o usuário responsável no array de users
        return users.find(u => u.id === project.owner_id) || null;
      };

      // Filtra projetos do cliente selecionado
      const filteredProjects = projects.filter(p => {
        const clientName = p.clientes?.empresa || '';
        const searchMatch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || clientName.toLowerCase().includes(searchTerm.toLowerCase());
        const clientMatch = p.client_id === selectedClientId;
        const statusMatch = statusFilter === 'all' || p.status === statusFilter;
        return searchMatch && clientMatch && statusMatch;
      });

      const statusOptions = [
        { value: 'planejamento', label: 'Planejamento' },
        { value: 'execucao', label: 'Execução' },
        { value: 'concluido', label: 'Concluído' },
        { value: 'pausado', label: 'Pausado' },
      ];

      const renderGridView = () => (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map(project => {
            const progress = getProjectProgress(project.id);
            const owner = getProjectOwner(project);
            return (
              <div key={project.id}>
                <Card className="h-full flex flex-col dark:bg-gray-800 dark:border-gray-700">
                  <div className="flex-grow cursor-pointer" onClick={() => navigate(`/projects/${project.id}`)}>
                    <CardHeader>
                      <CardTitle className="flex justify-between items-start">
                        <span className="dark:text-white">{project.name}</span>
                         <Badge variant={project.status === 'execucao' ? 'default' : 'secondary'}>{statusOptions.find(s => s.value === project.status)?.label || project.status}</Badge>
                      </CardTitle>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{project.clientes?.empresa}</p>
                    </CardHeader>
                    <CardContent className="flex-grow flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm text-gray-500 dark:text-gray-400">Progresso</span>
                          <span className="text-sm font-semibold dark:text-white">{Math.round(progress)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${progress}%` }}></div>
                        </div>
                      </div>
                      <div className="flex justify-between items-center mt-4">
                        {owner ? (
                          <div className="flex items-center gap-2">
                            <img 
                              className="h-8 w-8 rounded-full border-2 border-white dark:border-gray-800 object-cover" 
                              alt={owner.full_name || 'Responsável'} 
                              src={owner.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(owner.full_name || 'User')}&background=random`}
                              onError={(e) => {
                                e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(owner.full_name || 'User')}&background=random`;
                              }}
                            />
                            <span className="text-sm text-gray-500 dark:text-gray-400">{owner.full_name}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400 dark:text-gray-500">Sem responsável</span>
                        )}
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {tasks.filter(t => t.project_id === project.id).length} tarefas
                        </span>
                      </div>
                    </CardContent>
                  </div>
                  <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                     <Button variant="ghost" className="w-full justify-center" onClick={(e) => handleDeleteClick(e, project)}>
                        <Trash2 className="h-4 w-4 mr-2 text-red-500" />
                        <span className="text-red-500">Excluir</span>
                      </Button>
                  </div>
                </Card>
              </div>
            );
          })}
        </div>
      );

      const renderListView = () => (
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <Table>
            <TableHeader>
              <TableRow className="dark:border-gray-700">
                <TableHead className="dark:text-white">Projeto</TableHead>
                <TableHead className="dark:text-white">Cliente</TableHead>
                <TableHead className="dark:text-white">Status</TableHead>
                <TableHead className="dark:text-white">Progresso</TableHead>
                <TableHead className="dark:text-white">Responsáveis</TableHead>
                <TableHead className="text-right dark:text-white">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProjects.map(project => {
                const progress = getProjectProgress(project.id);
                const owner = getProjectOwner(project);
                return (
                  <TableRow key={project.id} className="dark:border-gray-700 group cursor-pointer" onClick={() => navigate(`/projects/${project.id}`)}>
                    <TableCell className="font-medium dark:text-white">{project.name}</TableCell>
                    <TableCell className="text-gray-500 dark:text-gray-400">{project.clientes?.empresa}</TableCell>
                    <TableCell><Badge variant={project.status === 'execucao' ? 'default' : 'secondary'}>{statusOptions.find(s => s.value === project.status)?.label || project.status}</Badge></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${progress}%` }}></div>
                        </div>
                        <span className="text-sm font-semibold dark:text-white">{Math.round(progress)}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {owner ? (
                        <div className="flex items-center gap-2">
                          <img 
                            className="h-8 w-8 rounded-full border-2 border-white dark:border-gray-800 object-cover" 
                            alt={owner.full_name || 'Responsável'} 
                            src={owner.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(owner.full_name || 'User')}&background=random`}
                            onError={(e) => {
                              e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(owner.full_name || 'User')}&background=random`;
                            }}
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">{owner.full_name}</span>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400 dark:text-gray-500">Sem responsável</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={(e) => handleDeleteClick(e, project)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      );

      const selectedClient = clients.find(c => c.id === selectedClientId);

      return (
        <div className="space-y-6">
          {selectedClientId && (
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={handleBackToClients} className="flex items-center gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Voltar ao painel
                </Button>
                <ChevronRight className="h-4 w-4 text-gray-400" />
                <div>
                  <h1 className="text-2xl font-bold text-gray-800 dark:text-white">{selectedClient?.empresa}</h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    {filteredProjects.length} {filteredProjects.length === 1 ? 'campanha' : 'campanhas'}
                  </p>
                </div>
              </div>
              <Button onClick={() => handleOpenForm()}>
                <Plus className="mr-2 h-4 w-4" /> Nova campanha
              </Button>
            </div>
          )}

          {/* Busca e filtros só na visão por cliente (campanhas do cliente) */}
          {selectedClientId && (
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="relative w-full md:w-auto">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  placeholder="Buscar projetos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-full md:w-80 dark:bg-gray-800 dark:border-gray-700"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="h-5 w-5 text-gray-500" />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[180px] dark:bg-gray-800 dark:border-gray-700"><SelectValue placeholder="Filtrar por status" /></SelectTrigger>
                  <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                    <SelectItem value="all">Todos os Status</SelectItem>
                    {statusOptions.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Conteúdo */}
          {selectedClientId ? (
            // View de projetos do cliente
            <>
              <Tabs value={viewMode} onValueChange={setViewMode} className="w-full">
                <TabsList className="dark:bg-gray-800 dark:border-gray-700">
                  <TabsTrigger value="grid" className="dark:text-gray-300 dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-white"><LayoutGrid className="mr-2 h-4 w-4" /> Grade</TabsTrigger>
                  <TabsTrigger value="list" className="dark:text-gray-300 dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-white"><List className="mr-2 h-4 w-4" /> Lista</TabsTrigger>
                </TabsList>
                <TabsContent value="grid">
                  {loading ? <p className="text-center py-10 dark:text-gray-300">Carregando...</p> : renderGridView()}
                </TabsContent>
                <TabsContent value="list">
                  {loading ? <p className="text-center py-10 dark:text-gray-300">Carregando...</p> : renderListView()}
                </TabsContent>
              </Tabs>

              {filteredProjects.length === 0 && !loading && (
                <div className="text-center py-10">
                  <p className="text-gray-500 dark:text-gray-400">Nenhum projeto encontrado.</p>
                </div>
              )}
            </>
          ) : (
            <>
              {clients.length === 0 && !loading ? (
                <div className="text-center py-10 rounded-md border border-border bg-muted/20">
                  <p className="text-gray-500 dark:text-gray-400 mb-4">Nenhum cliente cadastrado.</p>
                  <Button onClick={() => navigate('/clients/new')} variant="outline">
                    <Plus className="mr-2 h-4 w-4" /> Criar primeiro cliente
                  </Button>
                </div>
              ) : (
                <ProjectsOperationalPanel
                  clients={clients}
                  projects={projects}
                  tasks={tasks}
                  campaignPlans={campaignPlans}
                  users={users}
                  loading={loading}
                  navigate={navigate}
                  onNewCampaign={() => handleOpenForm()}
                  onNewClient={() => navigate('/clients/new')}
                  onOpenClientProjects={(clientId) => handleSelectClient(clientId)}
                />
              )}
            </>
          )}

          <AnimatePresence>
            {isFormOpen && (
              <ProjectForm
                key={`${editingProject?.id || 'new'}-${prefillClientId || ''}-${prefillYear || ''}-${prefillMonth || ''}`}
                onClose={handleCloseForm}
                onSave={handleSaveProject}
                project={editingProject}
                clients={clients}
                users={users}
                defaultClientId={prefillClientId || selectedClientId}
                defaultYear={prefillYear || undefined}
                defaultMonth={prefillMonth || undefined}
              />
            )}
          </AnimatePresence>
          
           <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Essa ação não pode ser desfeita. Isso excluirá permanentemente o projeto e todas as suas tarefas associadas.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setShowDeleteAlert(false)}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">Sim, excluir</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
      );
    };

    export default Projects;