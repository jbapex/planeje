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
    import ProjectReport from '@/components/projects/ProjectReport';
    import ProjectDocuments from '@/components/projects/ProjectDocuments';
    import ProjectForm from '@/components/forms/ProjectForm';
    import SalesFunnelBuilder from '@/components/projects/SalesFunnelBuilder';
    import { AnimatePresence } from 'framer-motion';
    import { useAuth } from '@/contexts/SupabaseAuthContext';
    import { useDataCache } from '@/hooks/useDataCache';

    const STATUS_STYLES = {
      'planejamento': 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-200 dark:border-blue-700',
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
      const [loading, setLoading] = useState(true);
      const [showForm, setShowForm] = useState(false);
      const { profile } = useAuth();
      const userRole = profile?.role;

      const activeTab = useMemo(() => subpath?.split('/')[0] || 'report', [subpath]);
      
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
          campaignPlan: planData
        };
        
        setCachedData(dataToCache);
        setProject(dataToCache.project);
        setClient(dataToCache.client);
        setTasks(dataToCache.tasks);
        setClients(dataToCache.clients);
        setUsers(dataToCache.users);
        setCampaignPlan(dataToCache.campaignPlan);

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
          setLoading(false);
          return; // Não faz fetch!
        }

        // Se não tem cache ou está expirado, faz fetch
        fetchData();
      }, [fetchData, shouldFetch, cachedData, setCachedData]);

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
      
      return (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => navigate('/projects')} className="dark:text-gray-300 dark:hover:bg-gray-700"><ArrowLeft className="mr-2 h-4 w-4"/> Voltar para Campanhas</Button>
            {(userRole === 'superadmin' || userRole === 'admin') && (
                <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setShowForm(true)} className="dark:bg-gray-700 dark:text-white dark:border-gray-600 dark:hover:bg-gray-600"><Edit className="mr-2 h-4 w-4"/> Editar</Button>
                <AlertDialog>
                    <AlertDialogTrigger asChild><Button variant="destructive"><Trash2 className="mr-2 h-4 w-4"/> Excluir</Button></AlertDialogTrigger>
                    <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
                    <AlertDialogHeader><AlertDialogTitle className="dark:text-white">Você tem certeza?</AlertDialogTitle><AlertDialogDescription className="dark:text-gray-400">Esta ação não pode ser desfeita. Isso excluirá permanentemente a campanha "{project.name}".</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel className="dark:text-white dark:border-gray-600 dark:hover:bg-gray-700">Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleDeleteProject} className="dark:bg-red-600 dark:hover:bg-red-700">Excluir</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
                </div>
            )}
          </div>
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-3xl dark:text-white">{project.name}</CardTitle>
                  <p className="text-lg text-gray-500 dark:text-gray-400">{client?.empresa}</p>
                </div>
                <Badge variant="outline" className={`${STATUS_STYLES[project.status] || ''} text-base px-4 py-2`}>{project.status}</Badge>
              </div>
            </CardHeader>
          </Card>
          
          <Tabs value={activeTab} onValueChange={(value) => navigate(`/projects/${id}/${value}`)} className="w-full">
            <TabsList className="grid w-full grid-cols-5 dark:bg-gray-800 dark:border-gray-700">
              <TabsTrigger value="report" className="dark:text-gray-300 dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-white">Relatório</TabsTrigger>
              <TabsTrigger value="planner" className="dark:text-gray-300 dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-white">Plano de Campanha</TabsTrigger>
              <TabsTrigger value="funnel" className="dark:text-gray-300 dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-white">Funil de Vendas</TabsTrigger>
              <TabsTrigger value="documents" className="dark:text-gray-300 dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-white">Documentos</TabsTrigger>
              <TabsTrigger value="checklist" className="dark:text-gray-300 dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-white">Checklist de Tarefas</TabsTrigger>
            </TabsList>
            <TabsContent value="report" forceMount={true} className={activeTab === 'report' ? '' : 'hidden'}>
                <ProjectReport project={project} tasks={tasks} campaignPlan={campaignPlan} />
            </TabsContent>
             <TabsContent value="planner" forceMount={true} className={activeTab === 'planner' ? '' : 'hidden'}>
                <CampaignPlanner project={project} client={client} isPage />
            </TabsContent>
            <TabsContent value="funnel" forceMount={true} className={activeTab === 'funnel' ? '' : 'hidden'}>
                <SalesFunnelBuilder project={project} client={client} campaignPlan={campaignPlan} onPlanUpdate={fetchData} />
            </TabsContent>
             <TabsContent value="documents" forceMount={true} className={activeTab === 'documents' ? 'flex flex-col min-h-0 h-[calc(100vh-280px)]' : 'hidden'}>
                <div className="flex-1 min-h-0 overflow-hidden">
                  <ProjectDocuments client={client} />
                </div>
            </TabsContent>
             <TabsContent value="checklist" forceMount={true} className={activeTab === 'checklist' ? '' : 'hidden'}>
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
        </div>
      );
    };

    export default ProjectDetail;