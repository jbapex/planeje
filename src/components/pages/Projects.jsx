import React, { useState, useEffect, useCallback } from 'react';
    import { motion, AnimatePresence } from 'framer-motion';
    import { Plus, Search, Filter, List, LayoutGrid, Trash2 } from 'lucide-react';
    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';
    import { useToast } from '@/components/ui/use-toast';
    import { supabase } from '@/lib/customSupabaseClient';
    import { useAuth } from '@/contexts/SupabaseAuthContext';
    import ProjectForm from '@/components/forms/ProjectForm';
    import { useNavigate, useLocation } from 'react-router-dom';
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

    const Projects = () => {
      const [projects, setProjects] = useState([]);
      const [clients, setClients] = useState([]);
      const [tasks, setTasks] = useState([]);
      const [users, setUsers] = useState([]);
      const [editingProject, setEditingProject] = useState(null);
      const [loading, setLoading] = useState(true);
      const [searchTerm, setSearchTerm] = useState('');
      const [clientFilter, setClientFilter] = useState('all');
      const [statusFilter, setStatusFilter] = useState('all');
      const [viewMode, setViewMode] = useState('grid');
      const [showDeleteAlert, setShowDeleteAlert] = useState(false);
      const [projectToDelete, setProjectToDelete] = useState(null);
      const [isFormOpen, setIsFormOpen] = useState(false);
      const [isFirstMount, setIsFirstMount] = useState(true);

      const { toast } = useToast();
      const { user } = useAuth();
      const navigate = useNavigate();
      const location = useLocation();
      
      // Hook de cache para prevenir re-fetch desnecessário
      const { data: cachedData, setCachedData, shouldFetch } = useDataCache('projects');
      
      // Marca primeira montagem para evitar animações em remount
      useEffect(() => {
        if (isFirstMount) {
          const timer = setTimeout(() => setIsFirstMount(false), 100);
          return () => clearTimeout(timer);
        }
      }, [isFirstMount]);

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
        const { data: clientsData, error: clientsError } = await supabase.from('clientes').select('id, empresa');
        const { data: tasksData, error: tasksError } = await supabase.from('tarefas').select('id, project_id, status, assignee_ids');
        const { data: usersData, error: usersError } = await supabase.from('profiles').select('id, full_name, avatar_url');

        if (projectsError || clientsError || tasksError || usersError) {
          toast({ title: "Erro ao buscar dados", description: projectsError?.message || clientsError?.message || tasksError?.message || usersError?.message, variant: "destructive" });
        } else {
          // Salva no cache
          const dataToCache = {
            projects: projectsData || [],
            clients: clientsData || [],
            tasks: tasksData || [],
            users: usersData || []
          };
          setCachedData(dataToCache);
          setProjects(dataToCache.projects);
          setClients(dataToCache.clients);
          setTasks(dataToCache.tasks);
          setUsers(dataToCache.users);
        }
        setLoading(false);
      }, [toast, setCachedData]);

      useEffect(() => {
        // Se tem cache válido (últimos 30 segundos), usa ele
        if (!shouldFetch() && cachedData) {
          setProjects(cachedData.projects);
          setClients(cachedData.clients);
          setTasks(cachedData.tasks);
          setUsers(cachedData.users);
          setLoading(false);
          return; // Não faz fetch!
        }

        // Se não tem cache ou está expirado, faz fetch
        fetchData();
      }, [fetchData, shouldFetch, cachedData, setCachedData]);
      
      const handleSaveProject = async (projectData, isNew) => {
        const dataToSave = { ...projectData, owner_id: user.id };
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

      const filteredProjects = projects.filter(p => {
        const clientName = p.clientes?.empresa || '';
        const searchMatch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || clientName.toLowerCase().includes(searchTerm.toLowerCase());
        const clientMatch = clientFilter === 'all' || p.client_id === clientFilter;
        const statusMatch = statusFilter === 'all' || p.status === statusFilter;
        return searchMatch && clientMatch && statusMatch;
      });

      const getProjectProgress = (projectId) => {
        const projectTasks = tasks.filter(t => t.project_id === projectId);
        if (projectTasks.length === 0) return 0;
        const completedTasks = projectTasks.filter(t => ['published', 'concluido'].includes(t.status));
        return (completedTasks.length / projectTasks.length) * 100;
      };

      const getProjectAssignees = (projectId) => {
        const projectTasks = tasks.filter(t => t.project_id === projectId);
        const assigneeIds = new Set(projectTasks.flatMap(t => t.assignee_ids || []));
        return Array.from(assigneeIds).map(id => users.find(u => u.id === id)).filter(Boolean);
      };

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
            const assignees = getProjectAssignees(project.id);
            return (
              <motion.div key={project.id} initial={isFirstMount ? { opacity: 0 } : false} animate={{ opacity: 1 }}>
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
                        <div className="flex -space-x-2">
                          {assignees.slice(0, 3).map(assignee => (
                            <img key={assignee.id} className="h-8 w-8 rounded-full border-2 border-white dark:border-gray-800" alt={assignee.full_name} src="https://images.unsplash.com/photo-1551437288-dce670e4d1e6" />
                          ))}
                          {assignees.length > 3 && (
                            <div className="h-8 w-8 rounded-full border-2 border-white dark:border-gray-800 bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-semibold">
                              +{assignees.length - 3}
                            </div>
                          )}
                        </div>
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
              </motion.div>
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
                const assignees = getProjectAssignees(project.id);
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
                      <div className="flex -space-x-2">
                        {assignees.slice(0, 3).map(assignee => (
                          <img key={assignee.id} className="h-8 w-8 rounded-full border-2 border-white dark:border-gray-800" alt={assignee.full_name} src="https://images.unsplash.com/photo-1551437288-dce670e4d1e6" />
                        ))}
                        {assignees.length > 3 && (
                          <div className="h-8 w-8 rounded-full border-2 border-white dark:border-gray-800 bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-semibold">
                            +{assignees.length - 3}
                          </div>
                        )}
                      </div>
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

      return (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Projetos</h1>
            <Button onClick={() => handleOpenForm()}><Plus className="mr-2 h-4 w-4" /> Novo Projeto</Button>
          </div>

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
              <Select value={clientFilter} onValueChange={setClientFilter}>
                <SelectTrigger className="w-[180px] dark:bg-gray-800 dark:border-gray-700"><SelectValue placeholder="Filtrar por cliente" /></SelectTrigger>
                <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                  <SelectItem value="all">Todos os Clientes</SelectItem>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.empresa}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px] dark:bg-gray-800 dark:border-gray-700"><SelectValue placeholder="Filtrar por status" /></SelectTrigger>
                <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                  <SelectItem value="all">Todos os Status</SelectItem>
                  {statusOptions.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

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

          <AnimatePresence>
            {isFormOpen && (
              <ProjectForm
                onClose={handleCloseForm}
                onSave={handleSaveProject}
                project={editingProject}
                clients={clients}
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