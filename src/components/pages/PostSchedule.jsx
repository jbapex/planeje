import React, { useState, useEffect, useCallback } from 'react';
    import { Calendar, Filter } from 'lucide-react';
    import { useToast } from '@/components/ui/use-toast';
    import { supabase } from '@/lib/customSupabaseClient';
    import { useAuth } from '@/contexts/SupabaseAuthContext';
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
    import CalendarView from '@/components/tasks/CalendarView';
    import TaskDetail from '@/components/tasks/TaskDetail';
    import { AnimatePresence } from 'framer-motion';

    const PostSchedule = () => {
      const [tasks, setTasks] = useState([]);
      const [clients, setClients] = useState([]);
      const [projects, setProjects] = useState([]);
      const [users, setUsers] = useState([]);
      const [statusOptions, setStatusOptions] = useState([]);
      const [selectedTask, setSelectedTask] = useState(null);
      const [loading, setLoading] = useState(true);
      const [selectedClient, setSelectedClient] = useState('all');

      const { toast } = useToast();
      const { user } = useAuth();

      const fetchData = useCallback(async () => {
        if (!user) return;
        setLoading(true);

        const { data: tasksData, error: tasksError } = await supabase
          .from('tarefas')
          .select('*, clientes(id, empresa), projetos(name)')
          .not('post_date', 'is', null);

        const { data: clientsData, error: clientsError } = await supabase.from('clientes').select('id, empresa');
        const { data: projectsData, error: projectsError } = await supabase.from('projetos').select('id, name, client_id');
        // Importante: clientes (role='cliente') não podem aparecer como responsáveis.
        const { data: usersData, error: usersError } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .neq('role', 'cliente');
        const { data: statusData, error: statusError } = await supabase.from('task_statuses').select('*').eq('owner_id', user.id).order('sort_order');

        if (tasksError || clientsError || projectsError || usersError || statusError) {
          toast({ title: "Erro ao buscar dados", description: tasksError?.message || clientsError?.message || projectsError?.message || usersError?.message || statusError?.message, variant: "destructive" });
        } else {
          setTasks(tasksData || []);
          setClients(clientsData || []);
          setProjects(projectsData || []);
          setUsers(usersData || []);
          setStatusOptions(statusData || []);
        }
        setLoading(false);
      }, [toast, user]);

      useEffect(() => {
        fetchData();
      }, [fetchData]);

      const filteredTasks = tasks.filter(task => selectedClient === 'all' || task.client_id === selectedClient);

      const handleOpenTask = (task) => {
        setSelectedTask(task);
      };

      const handleCloseTask = () => {
        setSelectedTask(null);
      };

      const handleSaveTask = async (taskData, isNew) => {
        const dataToSave = { ...taskData, owner_id: user.id };
        if (dataToSave.due_date === '') dataToSave.due_date = null;
        if (dataToSave.post_date === '') dataToSave.post_date = null;
        
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

      return (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
              <Calendar className="h-8 w-8" />
              Agendamento de Posts
            </h1>
          </div>
          
          <div className="flex items-center gap-4 p-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
            <Filter className="text-gray-500 dark:text-gray-400" />
            <Select value={selectedClient} onValueChange={setSelectedClient}>
              <SelectTrigger className="w-[220px] dark:bg-gray-800 dark:border-gray-700">
                <SelectValue placeholder="Selecione um cliente" />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                <SelectItem value="all">Todos os Clientes</SelectItem>
                {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.empresa}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <p className="text-center py-10 dark:text-gray-300">Carregando agendamentos...</p>
          ) : (
            <CalendarView
              tasks={filteredTasks}
              onOpenTask={handleOpenTask}
              statusOptions={statusOptions}
              clients={clients}
              showClientIndicator={selectedClient === 'all'}
              forcedDateType="post_date"
            />
          )}

          <AnimatePresence>
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
                onTaskCreated={fetchData}
              />
            )}
          </AnimatePresence>
        </div>
      );
    };

    export default PostSchedule;