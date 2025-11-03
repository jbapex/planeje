import React, { useState, useEffect } from 'react';
    import { useParams } from 'react-router-dom';
    import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose } from '@/components/ui/drawer';
    import { Button } from '@/components/ui/button';
    import { Save, Trash2, MessageSquare, Paperclip, Rocket, History } from 'lucide-react';
    import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
    import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
    import TaskDetailsTab from '@/components/tasks/details/TaskDetailsTab';
    import TaskCommentsTab from '@/components/tasks/details/TaskCommentsTab';
    import TaskAttachmentsTab from '@/components/tasks/details/TaskAttachmentsTab';
    import TaskHistoryTab from '@/components/tasks/details/TaskHistoryTab';
    import BoostTaskDialog from '@/components/tasks/details/BoostTaskDialog';
    import { supabase } from '@/lib/customSupabaseClient';
    import { useToast } from '@/components/ui/use-toast';
    import { useAuth } from '@/contexts/SupabaseAuthContext';
    import { useSessionFormState } from '@/hooks/useSessionFormState';

    const TaskDetail = ({ task, onClose, onSave, onDelete, clients, projects, users, statusOptions, userRole }) => {
      const { id: taskIdFromUrl } = useParams();
      const isNewTask = taskIdFromUrl === 'new';
      const taskId = task?.id || taskIdFromUrl;
      const formKey = `task_${taskId}`;
      
      // Estado inicial baseado na tarefa
      const getInitialData = () => {
        if (task && Object.keys(task).length > 0) {
          return {
            ...task,
            // Garante que arrays e objetos estão presentes
            assignee_ids: task.assignee_ids || [],
            subtasks: task.subtasks || [],
            time_logs: task.time_logs || [],
            status_history: task.status_history || []
          };
        }
        return {
          title: '',
          description: '',
          status: statusOptions?.[0]?.value || 'todo',
          client_id: '',
          project_id: '',
          assignee_ids: [],
          due_date: '',
          post_date: '',
          type: '',
          priority: 'medium',
          subtasks: [],
          time_logs: [],
          status_history: []
        };
      };

      // Hook que persiste estado em sessionStorage
      const [formData, setFormData, clearFormData] = useSessionFormState(formKey, getInitialData());
      
      const [isBoostDialogOpen, setIsBoostDialogOpen] = useState(false);
      const [subtasks, setSubtasks] = useState([]);
      const { toast } = useToast();
      const { user } = useAuth();

      // Restaura subtasks quando tarefa muda (mas preserva estado do form)
      useEffect(() => {
        const saved = sessionStorage.getItem(`form_state_${formKey}`);
        if (!saved && task?.id) {
          const fetchInitialSubtasks = async () => {
            const { data } = await supabase.from('task_subtasks').select('*').eq('task_id', task.id);
            setSubtasks(data || []);
          };
          fetchInitialSubtasks();
        } else if (!task?.id) {
          setSubtasks([]);
        }
      }, [task?.id, formKey]);

      const handleSave = () => {
        const updatedTask = { ...formData, subtasks };
        // Limpa o estado salvo após salvar com sucesso
        clearFormData();
        onSave(updatedTask, isNewTask);
      };

      const handleStatusChange = async (newStatus) => {
        const currentStatus = formData.status;
        const taskType = formData.type;

        if (!taskType) {
          setFormData(prev => ({ ...prev, status: newStatus }));
          return;
        }

        // IMPORTANTE: Verifica regras do STATUS DE DESTINO (novo status), não o atual
        // Isso garante que todas as condições sejam atendidas antes de entrar no novo status
        const { data: ruleData, error: ruleError } = await supabase
          .from('workflow_rules')
          .select('required_subtasks')
          .eq('task_type', taskType)
          .eq('status_value', newStatus) // CORRIGIDO: verifica o novo status
          .maybeSingle();

        if (ruleError) {
          toast({ title: "Erro ao verificar regras", description: ruleError.message, variant: "destructive" });
          return;
        }

        const requiredSteps = ruleData?.required_subtasks || [];
        
        if (requiredSteps.length > 0) {
          const missingSteps = requiredSteps.filter(step => {
            const subtask = subtasks.find(st => st.title === step.title);
            if (!subtask) return true;
            if (step.type === 'text') {
              return !subtask.content || subtask.content.trim() === '';
            }
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
        
        setFormData(prev => ({ ...prev, status: newStatus }));
      };

      return (
        <>
          <Drawer open={true} onOpenChange={(open) => !open && onClose()}>
            <DrawerContent className="w-full sm:max-w-2xl ml-auto h-full dark:bg-gray-800 dark:border-gray-700">
              <div className="flex flex-col h-full">
                <DrawerHeader className="p-4 sm:p-6">
                  <DrawerTitle className="dark:text-white text-xl sm:text-2xl">{isNewTask ? 'Nova Tarefa' : 'Detalhes da Tarefa'}</DrawerTitle>
                  <DrawerDescription className="dark:text-gray-400 text-sm sm:text-base">{isNewTask ? 'Preencha os campos para criar uma nova tarefa.' : 'Edite os detalhes da sua tarefa aqui.'}</DrawerDescription>
                </DrawerHeader>
                <div className="p-4 overflow-y-auto flex-grow">
                  <Tabs defaultValue="details" className="w-full">
                    <TabsList className="dark:bg-gray-700 grid w-full grid-cols-4">
                      <TabsTrigger value="details" className="dark:text-gray-300 dark:data-[state=active]:bg-gray-600 dark:data-[state=active]:text-white text-xs sm:text-sm">Detalhes</TabsTrigger>
                      <TabsTrigger value="comments" disabled={isNewTask} className="dark:text-gray-300 dark:data-[state=active]:bg-gray-600 dark:data-[state=active]:text-white text-xs sm:text-sm"><MessageSquare className="mr-1 h-4 w-4" /><span className="hidden sm:inline">Comentários</span></TabsTrigger>
                      <TabsTrigger value="attachments" disabled={isNewTask} className="dark:text-gray-300 dark:data-[state=active]:bg-gray-600 dark:data-[state=active]:text-white text-xs sm:text-sm"><Paperclip className="mr-1 h-4 w-4" /><span className="hidden sm:inline">Anexos</span></TabsTrigger>
                      <TabsTrigger value="history" disabled={isNewTask} className="dark:text-gray-300 dark:data-[state=active]:bg-gray-600 dark:data-[state=active]:text-white text-xs sm:text-sm"><History className="mr-1 h-4 w-4" /><span className="hidden sm:inline">Histórico</span></TabsTrigger>
                    </TabsList>
                    <TabsContent value="details" className="mt-4">
                      <TaskDetailsTab 
                        formData={formData} 
                        setFormData={setFormData} 
                        clients={clients} 
                        projects={projects} 
                        users={users} 
                        statusOptions={statusOptions} 
                        userRole={userRole}
                        onStatusChange={handleStatusChange}
                        onSubtasksChange={setSubtasks}
                        subtasks={subtasks}
                        isNewTask={isNewTask}
                      />
                    </TabsContent>
                    <TabsContent value="comments" className="mt-4 h-[calc(100%-60px)]">
                      {!isNewTask && <TaskCommentsTab taskId={task.id} />}
                    </TabsContent>
                    <TabsContent value="attachments" className="mt-4">
                      {!isNewTask && <TaskAttachmentsTab taskId={task.id} />}
                    </TabsContent>
                     <TabsContent value="history" className="mt-4">
                      {!isNewTask && <TaskHistoryTab history={formData.status_history} users={users} statusOptions={statusOptions} />}
                    </TabsContent>
                  </Tabs>
                </div>
                <DrawerFooter className="flex-shrink-0 border-t dark:border-gray-700 p-4">
                  <div className="flex flex-col sm:flex-row sm:justify-between w-full gap-2">
                    <div className="flex gap-2 justify-between sm:justify-start">
                      {(userRole === 'superadmin' || userRole === 'admin') && !isNewTask && (
                        <Button variant="outline" size="sm" onClick={() => setIsBoostDialogOpen(true)} className="border-blue-500 text-blue-500 hover:bg-blue-50 hover:text-blue-600 dark:border-blue-500 dark:text-blue-400 dark:hover:bg-blue-900/50 dark:hover:text-blue-300">
                          <Rocket size={14} className="mr-1 sm:mr-2" />
                          <span className="hidden sm:inline">Impulsionar</span>
                        </Button>
                      )}
                      {(userRole === 'superadmin' || userRole === 'admin') && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm" disabled={isNewTask}><Trash2 size={14} className="mr-1 sm:mr-2" />Excluir</Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="dark:text-white">Você tem certeza?</AlertDialogTitle>
                              <AlertDialogDescription className="dark:text-gray-400">Essa ação não pode ser desfeita. Isso irá remover permanentemente a tarefa.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="dark:text-white dark:border-gray-600 dark:hover:bg-gray-700">Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => onDelete(task.id)} className="dark:bg-red-600 dark:hover:bg-red-700">Excluir</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                    <div className="flex gap-2 justify-end">
                      <DrawerClose asChild><Button variant="ghost" size="sm" onClick={onClose} className="dark:text-white dark:hover:bg-gray-700">Cancelar</Button></DrawerClose>
                      <Button onClick={handleSave} size="sm"><Save size={14} className="mr-1 sm:mr-2" />Salvar</Button>
                    </div>
                  </div>
                </DrawerFooter>
              </div>
            </DrawerContent>
          </Drawer>
          {!isNewTask && (
            <BoostTaskDialog
              open={isBoostDialogOpen}
              onOpenChange={setIsBoostDialogOpen}
              task={task}
              users={users}
            />
          )}
        </>
      );
    };

    export default TaskDetail;