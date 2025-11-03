import React, { useState, useEffect, useCallback } from 'react';
    import { motion } from 'framer-motion';
    import { Calendar, CheckCircle, Clock, User, Users } from 'lucide-react';
    import { Button } from '@/components/ui/button';
    import { useToast } from '@/components/ui/use-toast';
    import { supabase } from '@/lib/customSupabaseClient';
    import { useAuth } from '@/contexts/SupabaseAuthContext';
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
    import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
    import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
    import { Badge } from '@/components/ui/badge';
    import CalendarView from '@/components/tasks/CalendarView';
    import TaskDetail from '@/components/tasks/TaskDetail';
    import ClientOverview from '@/components/social/ClientOverview';

    const SocialMedia = () => {
      const [clients, setClients] = useState([]);
      const [tasks, setTasks] = useState([]);
      const [projects, setProjects] = useState([]);
      const [users, setUsers] = useState([]);
      const [statusOptions, setStatusOptions] = useState([]);
      const [selectedClient, setSelectedClient] = useState('all');
      const [loading, setLoading] = useState(true);
      const [selectedTask, setSelectedTask] = useState(null);

      const { toast } = useToast();
      const { user } = useAuth();

      const fetchData = useCallback(async () => {
        setLoading(true);
        const { data: clientsData, error: clientsError } = await supabase.from('clientes').select('id, empresa');
        const { data: tasksData, error: tasksError } = await supabase.from('tarefas').select('*, clientes(id, empresa), projetos(name)').in('type', ['post', 'reels', 'story', 'social_media']);
        const { data: projectsData, error: projectsError } = await supabase.from('projetos').select('id, name, client_id, status');
        const { data: usersData, error: usersError } = await supabase.from('profiles').select('id, full_name, avatar_url');
        const { data: statusData, error: statusError } = await supabase.from('task_statuses').select('*').order('sort_order');

        if (clientsError || tasksError || projectsError || usersError || statusError) {
          toast({ title: "Erro ao buscar dados", description: clientsError?.message || tasksError?.message || projectsError?.message || usersError?.message || statusError?.message, variant: "destructive" });
        } else {
          setClients(clientsData || []);
          setTasks(tasksData || []);
          setProjects(projectsData || []);
          setUsers(usersData || []);
          setStatusOptions(statusData || []);
        }
        setLoading(false);
      }, [toast]);

      useEffect(() => {
        if (user) {
          fetchData();
          const channel = supabase.channel('realtime-social-media-tasks')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tarefas', filter: 'type=in.(post,reels,story,social_media)' }, 
            (payload) => {
                fetchData();
            })
            .subscribe();
          return () => supabase.removeChannel(channel);
        }
      }, [user, fetchData, supabase]);

      const filteredTasks = tasks.filter(task => selectedClient === 'all' || task.client_id === selectedClient);
      const scheduledTasks = filteredTasks.filter(task => task.status === 'scheduled');
      const completedTasks = filteredTasks.filter(task => task.status === 'completed');

      const handleOpenTask = (task) => {
        setSelectedTask(task);
      };

      const handleCloseTask = () => {
        setSelectedTask(null);
      };

      const handleSaveTask = async (taskData, isNew) => {
        const dataToSave = { ...taskData, owner_id: user.id };
        if (dataToSave.due_date === '') dataToSave.due_date = null;
        
        let error;
        if (isNew) {
          ({ error } = await supabase.from('tarefas').insert(dataToSave));
        } else {
          ({ error } = await supabase.from('tarefas').update(dataToSave).eq('id', taskData.id));
        }

        if (error) {
          toast({ title: "Erro ao salvar tarefa", description: error.message, variant: "destructive" });
        } else {
          toast({ title: `Tarefa ${isNew ? 'criada' : 'atualizada'}!` });
          fetchData();
          handleCloseTask();
        }
      };

      const handleDeleteTask = async (taskId) => {
        const { error } = await supabase.from('tarefas').delete().eq('id', taskId);
        if (error) toast({ title: "Erro ao remover tarefa", description: error.message, variant: "destructive" });
        else {
          toast({ title: "Tarefa removida" });
          fetchData();
          handleCloseTask();
        }
      };

      const TaskCard = ({ task }) => {
        const status = statusOptions.find(s => s.value === task.status);
        return (
          <Card onClick={() => handleOpenTask(task)} className="cursor-pointer hover:shadow-md transition-shadow dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="p-4">
              <div className="flex justify-between items-start">
                <p className="font-semibold dark:text-white">{task.title}</p>
                {status && <Badge style={{ backgroundColor: status.color.startsWith('#') ? status.color : '' }} className={`${!status.color.startsWith('#') ? status.color : ''} text-white`}>{status.label}</Badge>}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">{task.projetos?.name}</p>
              <div className="flex items-center justify-between mt-2 text-sm text-gray-500 dark:text-gray-400">
                <span>{task.due_date ? new Date(task.due_date).toLocaleDateString() : 'Sem data'}</span>
                <div className="flex -space-x-2">
                  {(task.assignee_ids || []).map(id => {
                    const assignee = users.find(u => u.id === id);
                    return assignee ? <img key={id} className="h-6 w-6 rounded-full border-2 border-white dark:border-gray-800" alt={assignee.full_name} src={assignee.avatar_url || `https://ui-avatars.com/api/?name=${assignee.full_name}&background=random`} /> : null;
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      };

      return (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Redes Sociais</h1>
            <div className="w-full md:w-auto">
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger className="w-full md:w-[220px] dark:bg-gray-800 dark:border-gray-700">
                  <SelectValue placeholder="Selecione um cliente" />
                </SelectTrigger>
                <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                  <SelectItem value="all">Todos os Clientes</SelectItem>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.empresa}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {loading ? (
            <p className="text-center py-10 dark:text-gray-300">Carregando conteúdo...</p>
          ) : (
            <Tabs defaultValue="calendar" className="w-full">
              <TabsList className="dark:bg-gray-800 dark:border-gray-700">
                <TabsTrigger value="overview" className="dark:text-gray-300 dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-white"><User className="mr-2 h-4 w-4" />Visão Geral</TabsTrigger>
                <TabsTrigger value="calendar" className="dark:text-gray-300 dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-white"><Calendar className="mr-2 h-4 w-4" />Calendário</TabsTrigger>
                <TabsTrigger value="scheduled" className="dark:text-gray-300 dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-white"><Clock className="mr-2 h-4 w-4" />Agendados</TabsTrigger>
                <TabsTrigger value="completed" className="dark:text-gray-300 dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-white"><CheckCircle className="mr-2 h-4 w-4" />Concluídos</TabsTrigger>
              </TabsList>
              <TabsContent value="overview">
                <ClientOverview 
                  selectedClientId={selectedClient} 
                  projects={projects} 
                  tasks={tasks} 
                  clients={clients}
                />
              </TabsContent>
              <TabsContent value="calendar">
                <CalendarView 
                  tasks={filteredTasks} 
                  onOpenTask={handleOpenTask} 
                  statusOptions={statusOptions} 
                  clients={clients}
                  showClientIndicator={selectedClient === 'all'}
                />
              </TabsContent>
              <TabsContent value="scheduled">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {scheduledTasks.length > 0 ? scheduledTasks.map(task => <TaskCard key={task.id} task={task} />) : <p className="col-span-full text-center py-10 dark:text-gray-400">Nenhum post agendado.</p>}
                </div>
              </TabsContent>
              <TabsContent value="completed">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {completedTasks.length > 0 ? completedTasks.map(task => <TaskCard key={task.id} task={task} />) : <p className="col-span-full text-center py-10 dark:text-gray-400">Nenhum post concluído.</p>}
                </div>
              </TabsContent>
            </Tabs>
          )}
          {selectedTask && (
            <TaskDetail
              task={selectedTask}
              onClose={handleCloseTask}
              onSave={handleSaveTask}
              onDelete={handleDeleteTask}
              clients={clients}
              projects={projects}
              users={users}
              statusOptions={statusOptions}
              userRole={user?.role}
            />
          )}
        </div>
      );
    };

    export default SocialMedia;