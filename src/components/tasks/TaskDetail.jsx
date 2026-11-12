import React, { useState, useEffect, useRef, useCallback } from 'react';
    import { useParams } from 'react-router-dom';
    import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose } from '@/components/ui/drawer';
    import { Button } from '@/components/ui/button';
    import { Save, Trash2, MessageSquare, Paperclip, Rocket, History, ListTodo, Send } from 'lucide-react';
    import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
    import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
    import TaskDetailsTab from '@/components/tasks/details/TaskDetailsTab';
    import TaskCommentsTab from '@/components/tasks/details/TaskCommentsTab';
    import TaskAttachmentsTab from '@/components/tasks/details/TaskAttachmentsTab';
    import TaskHistoryTab from '@/components/tasks/details/TaskHistoryTab';
    import TaskPublicationsPanel from '@/components/tasks/details/TaskPublicationsPanel';
    import TaskOperationalSummary from '@/components/tasks/details/TaskOperationalSummary';
    import TaskDeliveryAccountability from '@/components/tasks/details/TaskDeliveryAccountability';
    import BoostTaskDialog from '@/components/tasks/details/BoostTaskDialog';
    import { supabase } from '@/lib/customSupabaseClient';
    import { useToast } from '@/components/ui/use-toast';
    import { useAuth } from '@/contexts/SupabaseAuthContext';
    import { useSessionFormState } from '@/hooks/useSessionFormState';
    import { buildBriefingColumns, emptyBriefingPayload } from '@/lib/briefingObrigatorio';
    import { createTaskSaveGuard } from '@/lib/taskSaveGuard';
    import { activePublications, isContentTaskType } from '@/lib/taskChannelPublications';

    const TaskDetail = ({
      task,
      onClose,
      onSave,
      onDelete,
      clients,
      projects,
      users,
      statusOptions,
      userRole,
      requireDueDate = false,
      ephemeralDraft = false,
      lockClient = false,
      onPublicationsChange,
      initialTab = 'details',
    }) => {
      const { id: taskIdFromUrl } = useParams();
      const isNewTask = taskIdFromUrl === 'new';
      const taskId = task?.id || taskIdFromUrl;
      const formKey = ephemeralDraft ? null : `task_${taskId}`;
      
      // Estado inicial baseado na tarefa
      const getInitialData = () => {
        if (task && Object.keys(task).length > 0) {
          return {
            ...task,
            // Garante que arrays e objetos estão presentes
            assignee_ids: task.assignee_ids || [],
            subtasks: task.subtasks || [],
            time_logs: task.time_logs || [],
            status_history: task.status_history || [],
            priority: task.priority || 'medium',
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
          plataforma: '',
          priority: 'medium',
          subtasks: [],
          time_logs: [],
          status_history: [],
          briefing_estado: 'rascunho',
          briefing_completo: false,
          briefing_legado: false,
          briefing_payload: emptyBriefingPayload(),
        };
      };

      // Hook que persiste estado em sessionStorage
      const [formData, setFormData, clearFormData] = useSessionFormState(formKey, getInitialData());
      
      const [isBoostDialogOpen, setIsBoostDialogOpen] = useState(false);
      const [subtasks, setSubtasks] = useState([]);
      const subtasksRef = useRef(subtasks);
      subtasksRef.current = subtasks;
      const saveGuardRef = useRef(null);
      if (!saveGuardRef.current) saveGuardRef.current = createTaskSaveGuard(formData.status);
      const [saveState, setSaveState] = useState(() => saveGuardRef.current.snapshot());
      const validationTypeRef = useRef(formData.type);
      const hasSelectedStatusRef = useRef(false);
      useEffect(() => () => saveGuardRef.current.invalidate(), []);
      const [activeTab, setActiveTab] = useState(initialTab);
      const [publicationSummary, setPublicationSummary] = useState(task?._channel_publications || []);
      const [attachmentCount, setAttachmentCount] = useState(0);
      const [dueDateHighlight, setDueDateHighlight] = useState(false);
      const { toast } = useToast();
      const { user } = useAuth();
      const handlePublicationsChange = useCallback((publications) => {
        setPublicationSummary(activePublications(publications || []));
        onPublicationsChange?.(formData.id, activePublications(publications || []));
      }, [formData.id, onPublicationsChange]);
      const handleAttachmentsChange = useCallback((count) => setAttachmentCount(count || 0), []);
      const showPublicationArea = !isNewTask && isContentTaskType(formData.type);
      const [onboardingStage, setOnboardingStage] = useState(null);
      useEffect(() => {
        let cancelled = false;
        setOnboardingStage(null);
        if (isNewTask || formData.type !== 'onboarding' || !taskId) return;
        supabase.from('client_onboarding_stages').select('id,onboarding_id,state').eq('task_id', taskId).maybeSingle()
          .then(({ data, error }) => { if (!cancelled && !error) setOnboardingStage(data); });
        return () => { cancelled = true; };
      }, [isNewTask, formData.type, taskId]);

      useEffect(() => {
        if (isNewTask || !taskId) {
          setPublicationSummary([]);
          setAttachmentCount(0);
          return;
        }
        let cancelled = false;
        const loadOperationalSummary = async () => {
          const [publicationResult, attachmentResult] = await Promise.all([
            supabase
              .from('task_channel_publications')
              .select('id, channel, status, destination, scheduled_for')
              .eq('task_id', taskId)
              .order('created_at', { ascending: true }),
            supabase
              .from('task_attachments')
              .select('id', { count: 'exact', head: true })
              .eq('task_id', taskId),
          ]);
          if (cancelled) return;
          if (!publicationResult.error) setPublicationSummary(activePublications(publicationResult.data || []));
          if (!attachmentResult.error) setAttachmentCount(attachmentResult.count || 0);
        };
        void loadOperationalSummary();
        return () => { cancelled = true; };
      }, [isNewTask, taskId]);

      useEffect(() => {
        if (!showPublicationArea && activeTab === 'publications') setActiveTab('details');
      }, [activeTab, showPublicationArea]);

      // Restaura subtasks quando tarefa muda (mas preserva estado do form)
      useEffect(() => {
        const saved = formKey && sessionStorage.getItem(`form_state_${formKey}`);
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

      const saveTask = async () => {
        if (requireDueDate) {
          const d = formData.due_date;
          if (d == null || String(d).trim() === '') {
            toast({
              title: 'Data de entrega obrigatória',
              description: 'Escolha a data de entrega abaixo e salve de novo. O restante do formulário foi mantido.',
              variant: 'destructive',
            });
            setActiveTab('details');
            setDueDateHighlight(true);
            window.setTimeout(() => setDueDateHighlight(false), 4500);
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                document.getElementById('task-detail-due-date')?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'center',
                });
              });
            });
            return;
          }
        }

        const briefingCols = buildBriefingColumns({
          type: formData.type,
          title: formData.title,
          description: formData.description,
          payload: formData.briefing_payload || emptyBriefingPayload(),
          estado: formData.briefing_estado || 'rascunho',
          existingLegado: Boolean(formData.briefing_legado),
          isNew: isNewTask,
        });

        if (briefingCols._warnings?.length && formData.briefing_estado === 'completo') {
          toast({
            title: 'Briefing incompleto (aviso)',
            description: `Campos: ${(briefingCols._missing || []).join(', ') || 'ver formulário'}. Neste estágio não bloqueia.`,
          });
        }

        const updatedTask = {
          ...formData,
          subtasks,
          briefing_estado: briefingCols.briefing_estado,
          briefing_completo: briefingCols.briefing_completo,
          briefing_legado: briefingCols.briefing_legado,
          briefing_payload: briefingCols.briefing_payload,
          briefing_validado_em: briefingCols.briefing_validado_em,
        };
        const maybePromise = onSave(updatedTask, isNewTask);
        const ok =
          maybePromise != null && typeof maybePromise.then === 'function'
            ? await maybePromise
            : maybePromise;
        if (ok === true) clearFormData();
      };

      const handleSave = async () => {
        const guard = saveGuardRef.current;
        if (!guard.beginSave(formData.status)) {
          const state = guard.snapshot();
          toast({
            title: state.saving ? 'Salvando tarefa…' : 'Confira o status antes de salvar',
            description: state.error || 'Aguarde a validação do status e tente salvar novamente.',
          });
          return;
        }
        setSaveState(guard.snapshot());
        try {
          await saveTask();
        } catch (error) {
          console.error('Error saving task:', error);
          toast({ title: 'Não foi possível salvar', description: 'Seus dados foram mantidos. Tente novamente.', variant: 'destructive' });
        } finally {
          guard.finishSave();
          setSaveState(guard.snapshot());
        }
      };

      const handleStatusChange = async (newStatus) => {
        const guard = saveGuardRef.current;
        const token = guard.beginValidation(newStatus);
        if (token === null) return;
        hasSelectedStatusRef.current = true;
        // Keep the choice visible, but never save it until its validation succeeds.
        setFormData(prev => ({ ...prev, status: newStatus }));
        setSaveState(guard.snapshot());
        let validationError = '';
        try {
          if (formData.type) {
            const { data: ruleData, error: ruleError } = await supabase
              .from('workflow_rules')
              .select('required_subtasks')
              .eq('task_type', formData.type)
              .eq('status_value', newStatus)
              .maybeSingle();
            if (ruleError) throw ruleError;
            const missingSteps = (ruleData?.required_subtasks || []).filter(step => {
              const subtask = subtasksRef.current.find(st => st.title === step.title);
              if (!subtask) return true;
              return step.type === 'text'
                ? !subtask.content || subtask.content.trim() === ''
                : !subtask.is_completed;
            });
            if (missingSteps.length) {
              validationError = `Para entrar neste status, conclua: ${missingSteps.map(step => step.title).join(', ')}. Depois tente validar novamente.`;
            }
          }
        } catch (error) {
          console.error('Error validating task status:', error);
          validationError = 'Não foi possível validar o status. Seus dados foram mantidos. Tente novamente.';
        }
        // A slower response must never approve/reject a newer selection.
        if (guard.finishValidation(token, validationError)) {
          setSaveState(guard.snapshot());
        }
      };

      useEffect(() => {
        if (validationTypeRef.current === formData.type) return;
        validationTypeRef.current = formData.type;
        if (hasSelectedStatusRef.current) void handleStatusChange(formData.status);
      }, [formData.type]);

      return (
        <>
          <Drawer open={true} onOpenChange={(open) => !open && onClose()}>
            <DrawerContent className="w-full sm:max-w-3xl ml-auto h-full dark:bg-gray-800 dark:border-gray-700">
              <div className="flex flex-col h-full">
                <DrawerHeader className="border-b px-4 py-3 sm:px-5 sm:py-3">
                  <DrawerTitle className="text-lg dark:text-white sm:text-xl">{isNewTask ? 'Nova Tarefa' : 'Detalhes da Tarefa'}</DrawerTitle>
                  {isNewTask && (
                    <DrawerDescription className="text-sm dark:text-gray-400">Preencha os campos para criar uma nova tarefa.</DrawerDescription>
                  )}
                </DrawerHeader>
                {!isNewTask && (
                  <>
                    <TaskOperationalSummary
                      formData={formData}
                      users={users}
                      statusOptions={statusOptions}
                      publications={publicationSummary}
                    />
                    {showPublicationArea && <TaskDeliveryAccountability
                      task={formData}
                      attachmentCount={attachmentCount}
                      onOpenAttachments={() => setActiveTab('attachments')}
                    />}
                  </>
                )}
                <div className="flex-grow overflow-y-auto p-3 sm:px-5 sm:py-3">
                  <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="h-9 dark:bg-gray-700 flex w-full justify-start gap-0.5 overflow-x-auto p-0.5">
                      <TabsTrigger value="details" className="shrink-0 dark:text-gray-300 dark:data-[state=active]:bg-gray-600 dark:data-[state=active]:text-white text-xs sm:text-sm"><ListTodo className="mr-1 h-4 w-4" />Tarefa</TabsTrigger>
                      {showPublicationArea && (
                        <TabsTrigger value="publications" className="shrink-0 dark:text-gray-300 dark:data-[state=active]:bg-gray-600 dark:data-[state=active]:text-white text-xs sm:text-sm">
                          <Send className="mr-1 h-4 w-4" />Publicações
                          <span className="ml-1 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-950 dark:text-violet-200">{publicationSummary.length}</span>
                        </TabsTrigger>
                      )}
                      <TabsTrigger value="attachments" disabled={isNewTask} className="shrink-0 dark:text-gray-300 dark:data-[state=active]:bg-gray-600 dark:data-[state=active]:text-white text-xs sm:text-sm"><Paperclip className="mr-1 h-4 w-4" />Anexos<span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold">{attachmentCount}</span></TabsTrigger>
                      <TabsTrigger value="comments" disabled={isNewTask} className="shrink-0 dark:text-gray-300 dark:data-[state=active]:bg-gray-600 dark:data-[state=active]:text-white text-xs sm:text-sm"><MessageSquare className="mr-1 h-4 w-4" />Comentários</TabsTrigger>
                      <TabsTrigger value="history" disabled={isNewTask} className="shrink-0 dark:text-gray-300 dark:data-[state=active]:bg-gray-600 dark:data-[state=active]:text-white text-xs sm:text-sm"><History className="mr-1 h-4 w-4" />Histórico</TabsTrigger>
                    </TabsList>
                    <TabsContent value="details" className="mt-3">
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
                        highlightDueDate={dueDateHighlight}
                        onPublicationsChange={handlePublicationsChange}
                        onOpenPublications={() => setActiveTab('publications')}
                        showPublications={false}
                        linkedOnboarding={onboardingStage}
                        lockClient={lockClient}
                      />
                    </TabsContent>
                    <TabsContent value="publications" className="mt-4">
                      {showPublicationArea && (
                        <TaskPublicationsPanel
                          taskId={taskId}
                          task={formData}
                          users={users}
                          onPublicationsChange={handlePublicationsChange}
                          onAttachmentsChange={handleAttachmentsChange}
                        />
                      )}
                    </TabsContent>
                    <TabsContent value="comments" className="mt-4 h-[calc(100%-60px)]">
                      {!isNewTask && <TaskCommentsTab taskId={task.id} />}
                    </TabsContent>
                    <TabsContent value="attachments" className="mt-4">
                      {!isNewTask && (
                        <TaskAttachmentsTab
                          taskId={task.id}
                          clienteId={formData.client_id || task.client_id || null}
                          task={formData}
                          users={users}
                          onAttachmentsChange={handleAttachmentsChange}
                          onPublicationsChange={handlePublicationsChange}
                        />
                      )}
                    </TabsContent>
                     <TabsContent value="history" className="mt-4">
                      {!isNewTask && <TaskHistoryTab history={formData.status_history} users={users} statusOptions={statusOptions} />}
                    </TabsContent>
                  </Tabs>
                </div>
                <DrawerFooter className="flex-shrink-0 border-t dark:border-gray-700 p-4">
                  <div className="flex flex-col sm:flex-row sm:justify-between w-full gap-2">
                    <div className="flex gap-2 justify-between sm:justify-start">
                      {(userRole === 'superadmin' || userRole === 'admin') && showPublicationArea && (
                        <Button variant="outline" size="sm" onClick={() => setIsBoostDialogOpen(true)} className="border-blue-500 text-blue-500 hover:bg-blue-50 hover:text-blue-600 dark:border-blue-500 dark:text-blue-400 dark:hover:bg-blue-900/50 dark:hover:text-blue-300">
                          <Rocket size={14} className="mr-1 sm:mr-2" />
                          <span className="hidden sm:inline">Impulsionar</span>
                        </Button>
                      )}
                      {(userRole === 'superadmin' || userRole === 'admin') && !onboardingStage && onDelete && (
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
                    <div className="flex flex-col gap-2 items-end">
                      {saveState.pending && <p role="status" className="text-sm text-gray-500">Validando status…</p>}
                      {saveState.error && (
                        <div role="alert" className="text-sm text-red-600 dark:text-red-400">
                          <p>{saveState.error}</p>
                          <Button variant="outline" size="sm" onClick={() => void handleStatusChange(formData.status)}>Tentar novamente</Button>
                        </div>
                      )}
                      <div className="flex gap-2 justify-end">
                      <DrawerClose asChild><Button variant="ghost" size="sm" onClick={onClose} className="dark:text-white dark:hover:bg-gray-700">Cancelar</Button></DrawerClose>
                      <Button onClick={() => void handleSave()} disabled={saveState.pending || Boolean(saveState.error) || saveState.saving} size="sm"><Save size={14} className="mr-1 sm:mr-2" />{saveState.saving ? 'Salvando…' : 'Salvar'}</Button>
                      </div>
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
