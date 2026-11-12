import React, { useState, useEffect, useMemo } from 'react';
import TaskTrafficWeeklyShortcut from '@/components/tasks/details/TaskTrafficWeeklyShortcut';
    import { useNavigate } from 'react-router-dom';
    import { Input } from '@/components/ui/input';
    import { Textarea } from '@/components/ui/textarea';
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
    import { Label } from '@/components/ui/label';
    import { Button } from '@/components/ui/button';
    import { Sparkles, AlertTriangle, ListTodo, CalendarPlus as CalendarIcon, Timer, GanttChartSquare } from 'lucide-react';
    import TaskFieldHelp, { TaskFieldLabel } from '@/components/tasks/TaskFieldHelp';
    import { useToast } from '@/components/ui/use-toast';
    import { useAuth } from '@/contexts/SupabaseAuthContext';
    import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
    import { MultiSelect } from '@/components/ui/multi-select';
    import TaskSubtasksTab from '@/components/tasks/details/TaskSubtasksTab';
    import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
    import { Calendar } from '@/components/ui/calendar';
    import { format } from 'date-fns';
    import { ptBR } from 'date-fns/locale';
    import { cn } from '@/lib/utils';
    import { motion } from 'framer-motion';
    import { usePlataformasConteudo } from '@/hooks/usePlataformasConteudo';
    import PlataformaMaterialSelect from '@/components/projects/PlataformaMaterialSelect';
    import TaskBriefingForm from '@/components/tasks/TaskBriefingForm';
    import TaskPublicationsPanel from '@/components/tasks/details/TaskPublicationsPanel';
    import { emptyBriefingPayload } from '@/lib/briefingObrigatorio';
    import { isContentTaskType } from '@/lib/taskChannelPublications';
    import { TASK_PRIORITIES, getDueTone, isTerminalTaskStatus, normalizeTaskPriority } from '@/lib/taskUrgency';
    import { TaskPriorityBadge } from '@/components/tasks/TaskUrgencyBadges';
    import TaskDemandControl from '@/components/tasks/details/TaskDemandControl';
    import TaskWorkflowPanel from '@/components/tasks/details/TaskWorkflowPanel';
    import TaskRecordingControl, { RECORDING_TASK_TYPES } from '@/components/tasks/details/TaskRecordingControl';

    const formatSeconds = (totalSeconds, withSeconds = true) => {
        if (isNaN(totalSeconds) || totalSeconds < 0) return withSeconds ? '0s' : '0m';
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = Math.floor(totalSeconds % 60);

        let result = '';
        if (hours > 0) result += `${hours}h `;
        if (minutes > 0) result += `${minutes}m `;
        if (withSeconds && (seconds > 0 || result === '')) result += `${seconds}s`;
        
        if (!withSeconds && hours === 0 && minutes === 0) return '0m';

        return result.trim() || (withSeconds ? '0s' : '0m');
    };

    const LiveTimer = ({ timeLogs, currentStatus }) => {
        const [elapsedTime, setElapsedTime] = useState(0);

        useEffect(() => {
            const activeLog = (timeLogs || [])
                .filter(log => log.status === currentStatus && log.start && !log.end)
                .sort((a, b) => new Date(b.start) - new Date(a.start))[0];
            
            let intervalId;

            if (activeLog) {
                const calculateElapsedTime = () => {
                    const now = new Date();
                    const start = new Date(activeLog.start);
                    setElapsedTime(Math.floor((now - start) / 1000));
                };
                
                calculateElapsedTime();
                intervalId = setInterval(calculateElapsedTime, 1000);
            } else {
                setElapsedTime(0);
            }

            return () => clearInterval(intervalId);
        }, [timeLogs, currentStatus]);

        if (elapsedTime === 0) return null;

        return (
            <div className="flex items-center gap-2 p-2 rounded-md bg-yellow-100 dark:bg-yellow-900/50 border border-yellow-200 dark:border-yellow-800/60">
                <Timer className="h-5 w-5 text-yellow-600 dark:text-yellow-400 animate-pulse" />
                <span className="text-sm font-medium text-yellow-800 dark:text-yellow-300">Tempo no status atual:</span>
                <span className="text-sm font-bold text-yellow-900 dark:text-yellow-200 tabular-nums">{formatSeconds(elapsedTime, true)}</span>
            </div>
        );
    };

    const TimeTrackingAnalysis = ({ timeLogs, statusOptions }) => {
        const timeByStatus = useMemo(() => {
            const statusTimes = {};
            (timeLogs || []).forEach(log => {
                if (log.status && log.start && log.end) {
                    const start = new Date(log.start);
                    const end = new Date(log.end);
                    const duration = (end.getTime() - start.getTime()) / 1000;
                    if (!isNaN(duration)) {
                        statusTimes[log.status] = (statusTimes[log.status] || 0) + duration;
                    }
                }
            });
            return statusTimes;
        }, [timeLogs]);

        const totalTime = useMemo(() => Object.values(timeByStatus).reduce((acc, time) => acc + time, 0), [timeByStatus]);

        if (totalTime === 0) return null;

        return (
            <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center dark:text-white"><GanttChartSquare className="mr-2 h-5 w-5" />Análise de Tempo por Status</h3>
                <div className="space-y-2">
                    {Object.entries(timeByStatus).map(([status, seconds]) => {
                        const statusLabel = statusOptions.find(opt => opt.value === status)?.label || status;
                        const statusColor = statusOptions.find(opt => opt.value === status)?.color || '#CCCCCC';
                        const percentage = totalTime > 0 ? (seconds / totalTime) * 100 : 0;
                        return (
                            <div key={status} className="space-y-1">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="font-medium text-gray-700 dark:text-gray-300">{statusLabel}</span>
                                    <span className="font-bold text-gray-900 dark:text-white">{formatSeconds(seconds, false)}</span>
                                </div>
                                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                                    <motion.div
                                        className="h-2.5 rounded-full"
                                        style={{ backgroundColor: statusColor }}
                                        initial={{ width: 0 }}
                                        animate={{ width: `${percentage}%` }}
                                        transition={{ duration: 0.5 }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
                 <div className="flex justify-between items-center pt-2 border-t dark:border-gray-600">
                    <span className="text-sm font-bold text-gray-800 dark:text-white">Tempo Total na Tarefa</span>
                    <span className="text-sm font-extrabold text-blue-700 dark:text-blue-400">{formatSeconds(totalTime, false)}</span>
                </div>
            </div>
        )
    }

    const TaskDetailsTab = ({
      formData,
      setFormData,
      clients,
      projects,
      users,
      statusOptions,
      onStatusChange,
      onSubtasksChange,
      subtasks,
      isNewTask,
      highlightDueDate = false,
      onPublicationsChange,
      onOpenPublications,
      showPublications = true,
      linkedOnboarding = null,
      lockClient = false,
    }) => {
      const navigate = useNavigate();
      const isOnboarding = formData.type === 'onboarding';
      const availableStatuses = linkedOnboarding
        ? statusOptions.filter((status) => ['todo','production','completed',formData.status].includes(status.value))
        : isContentTaskType(formData.type) ? statusOptions.filter((status) => status.value !== 'completed') : statusOptions;
      const [showOpenAIAlert, setShowOpenAIAlert] = useState(false);
      const [isGenerating, setIsGenerating] = useState(false);
      const [generatedCopy, setGeneratedCopy] = useState('');
      const [filteredProjects, setFilteredProjects] = useState([]);
      const { toast } = useToast();
      const { getOpenAIKey } = useAuth();
      const { plataformas, loading: platsLoading } = usePlataformasConteudo();
      
      const userOptions = useMemo(() => users.map(user => ({
        value: user.id,
        label: user.full_name,
      })), [users]);
      
      const selectedAssignees = useMemo(() => {
        return userOptions.filter(option => (formData.assignee_ids || []).includes(option.value));
      }, [formData.assignee_ids, userOptions]);

      useEffect(() => {
        if (formData.client_id) {
          setFilteredProjects(projects.filter(p => p.client_id === formData.client_id));
        } else {
          setFilteredProjects([]);
        }
      }, [formData.client_id, projects]);
      
      const handleChange = (field, value) => {
        const newFormData = { ...formData, [field]: value };
        if (field === 'client_id') {
          newFormData.project_id = '';
        }
        if (field === 'type' && value !== formData.type) {
          newFormData.workflow_template_id = null;
          newFormData.workflow_stage_key = null;
          newFormData.operational_function_id = null;
        }
        setFormData(newFormData);
      };
      
      const handleAssigneeChange = (selectedOptions) => {
        const selectedIds = selectedOptions.map(option => option.value);
        handleChange('assignee_ids', selectedIds);
      };

      const handleDateChange = (field, date) => {
        const formattedDate = date ? format(date, 'yyyy-MM-dd') : null;
        handleChange(field, formattedDate);
      };

      const handleStatusChange = (newStatus) => {
        onStatusChange(newStatus);
      };

      const generateCopy = async () => {
        setIsGenerating(true);
        setGeneratedCopy('');

        const clientName = clients.find(c => c.id === formData.client_id)?.empresa || 'o cliente';
        const prompt = `Aja como um social media expert. Crie uma sugestão de copy para um post em rede social para ${clientName}. A tarefa é sobre "${formData.title}". A descrição da tarefa é: "${formData.description}". A copy deve ser envolvente e terminar com uma chamada para ação clara. Responda apenas com o texto da copy.`;

        try {
          const { invokeProjectsAiChat } = await import('@/lib/projectsAiCompletion');
          let text;
          try {
            text = await invokeProjectsAiChat({
              messages: [{ role: 'user', content: prompt }],
              openaiModel: 'gpt-3.5-turbo',
              temperature: 0.7,
              max_tokens: 250,
            });
          } catch (edgeErr) {
            const apiKey = await getOpenAIKey();
            if (!apiKey) {
              setShowOpenAIAlert(true);
              return;
            }
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
              body: JSON.stringify({ model: 'gpt-3.5-turbo', messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 250 })
            });
            if (!response.ok) throw new Error(`API da OpenAI respondeu com status ${response.status}`);
            const data = await response.json();
            text = data.choices[0].message.content.trim();
          }
          setGeneratedCopy(text);
          toast({ title: "Sugestão de copy gerada!" });
        } catch (error) {
          toast({ title: "Erro ao gerar copy", description: error.message, variant: "destructive" });
        } finally {
          setIsGenerating(false);
        }
      };

      const selectedStatus = useMemo(() => {
        return statusOptions.find(s => s.value === formData.status);
      }, [formData.status, statusOptions]);
      const productionDateTone = getDueTone(formData.due_date, {
        isTerminal: Boolean(formData.production_delivered_at) || isTerminalTaskStatus(formData.status, statusOptions),
      });

      return (
        <div className="space-y-4">
          {formData.type === 'paid_traffic' && <TaskTrafficWeeklyShortcut taskId={formData.id} />}
          {linkedOnboarding && <div className="flex items-center justify-between gap-3 rounded-lg border bg-violet-50/60 px-3 py-2 text-xs dark:bg-violet-900/10"><span>{linkedOnboarding.state === 'completed' ? 'Etapa concluída. Acompanhe o andamento no onboarding.' : 'Etapa do onboarding. Concluir abre a próxima tarefa.'}</span><Button variant="ghost" size="sm" onClick={() => navigate('/onboarding')}>Ver onboarding</Button></div>}
          <div className="space-y-1">
            <Label className="text-xs">Nome da Tarefa</Label>
            <Input value={formData.title || ''} onChange={e => handleChange('title', e.target.value)} className="text-base font-semibold" />
          </div>

          {!isNewTask && <LiveTimer timeLogs={formData.time_logs} currentStatus={formData.status} />}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Cliente</Label>
              <Select value={formData.client_id || ''} disabled={lockClient || Boolean(linkedOnboarding)} onValueChange={v => handleChange('client_id', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.empresa}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {!isOnboarding && <div className="space-y-1">
              <Label className="text-xs">Campanha (Projeto)</Label>
              <Select value={formData.project_id || ''} onValueChange={v => handleChange('project_id', v)} disabled={!formData.client_id || filteredProjects.length === 0}>
                <SelectTrigger><SelectValue placeholder={!formData.client_id ? "Selecione um cliente" : "Selecione a campanha"} /></SelectTrigger>
                <SelectContent>
                  {filteredProjects.length > 0 ? filteredProjects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>) : <div className="p-2 text-center text-sm text-muted-foreground">Nenhuma campanha.</div>}
                </SelectContent>
              </Select>
            </div>}
            <div className="space-y-1">
              <Label className="text-xs">Tipo</Label>
              <Select value={formData.type || ''} disabled={Boolean(linkedOnboarding)} onValueChange={v => handleChange('type', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="arte">Arte</SelectItem><SelectItem value="carrossel">Carrossel</SelectItem><SelectItem value="video">Vídeo</SelectItem><SelectItem value="reels">Reels</SelectItem><SelectItem value="planejamento">Planejamento</SelectItem><SelectItem value="paid_traffic">Tráfego pago</SelectItem><SelectItem value="reuniao">Reunião</SelectItem><SelectItem value="financeiro">Financeiro</SelectItem><SelectItem value="interno">Interno</SelectItem><SelectItem value="onboarding">Onboarding</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nível de urgência</Label>
              <Select value={normalizeTaskPriority(formData.priority)} onValueChange={(v) => handleChange('priority', v)}>
                <SelectTrigger><SelectValue><TaskPriorityBadge priority={formData.priority} always /></SelectValue></SelectTrigger>
                <SelectContent>{TASK_PRIORITIES.map((priority) => <SelectItem key={priority.value} value={priority.value}><TaskPriorityBadge priority={priority.value} always /></SelectItem>)}</SelectContent>
              </Select>
            </div>
            {!isOnboarding && !isContentTaskType(formData.type) && (
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Plataforma</Label>
                <PlataformaMaterialSelect value={formData.plataforma} onChange={(value) => handleChange('plataforma', value)} plataformas={plataformas} loading={platsLoading} triggerClassName="dark:bg-gray-700 dark:border-gray-600" />
              </div>
            )}
          </div>

          <div className={cn('grid grid-cols-1 gap-4', isOnboarding ? 'md:grid-cols-2' : 'md:grid-cols-3')}>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select disabled={linkedOnboarding?.state === 'completed'} value={formData.status || (statusOptions?.[0]?.value || '')} onValueChange={handleStatusChange}>
                <SelectTrigger><SelectValue>{selectedStatus ? <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full" style={{ backgroundColor: selectedStatus.color }} /><span>{selectedStatus.label}</span></div> : 'Selecione o status'}</SelectValue></SelectTrigger>
                <SelectContent>{(availableStatuses || []).map((status) => <SelectItem key={status.value} value={status.value}><div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full" style={{ backgroundColor: status.color }} /><span>{status.label}</span></div></SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div id="task-detail-due-date" className={cn('space-y-1 rounded-md transition-shadow', highlightDueDate && 'ring-2 ring-destructive ring-offset-2 ring-offset-background')}>
              <Label className="text-xs">{isOnboarding ? 'Prazo da etapa' : 'Data de entrega'} <span className="text-destructive" aria-hidden>*</span></Label>
              <Popover><PopoverTrigger asChild><Button type="button" variant="outline" aria-required="true" className={cn('w-full justify-start text-left font-normal', !formData.due_date && 'text-muted-foreground', productionDateTone === 'overdue' && 'border-red-400 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300', productionDateTone === 'soon' && 'border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200')}><CalendarIcon className="mr-2 h-4 w-4" />{formData.due_date ? format(new Date(formData.due_date + 'T00:00:00'), 'PPP', { locale: ptBR }) : <span>Escolha uma data</span>}</Button></PopoverTrigger><PopoverContent className="z-[80] w-auto p-0"><Calendar mode="single" selected={formData.due_date ? new Date(formData.due_date + 'T00:00:00') : null} onSelect={(date) => handleDateChange('due_date', date)} initialFocus locale={ptBR} /></PopoverContent></Popover>
            </div>
            {!isOnboarding && <div className="space-y-1">
              <Label className="text-xs">{isContentTaskType(formData.type) ? 'Data prevista (geral)' : 'Data de postagem'}</Label>
              <Popover><PopoverTrigger asChild><Button type="button" variant="outline" className={cn('w-full justify-start text-left font-normal', !formData.post_date && 'text-muted-foreground')}><CalendarIcon className="mr-2 h-4 w-4" />{formData.post_date ? format(new Date(formData.post_date + 'T00:00:00'), 'PPP', { locale: ptBR }) : <span>Escolha uma data</span>}</Button></PopoverTrigger><PopoverContent className="z-[80] w-auto p-0"><Calendar mode="single" selected={formData.post_date ? new Date(formData.post_date + 'T00:00:00') : null} onSelect={(date) => handleDateChange('post_date', date)} initialFocus locale={ptBR} /></PopoverContent></Popover>
              {isContentTaskType(formData.type) && <p className="text-xs text-muted-foreground">
                Os horários de cada rede ficam em {onOpenPublications && !isNewTask
                  ? <button type="button" className="font-medium text-violet-700 underline dark:text-violet-300" onClick={onOpenPublications}>Publicações</button>
                  : 'Publicações'}.
              </p>}
            </div>}
          </div>

          <div className="space-y-1">
            <TaskFieldLabel help={formData.workflow_template_id && !linkedOnboarding ? 'Os responsáveis vêm da etapa do fluxo. Se a pessoa mudar, ajuste a função da etapa.' : null}>Responsáveis</TaskFieldLabel>
            {linkedOnboarding ? <Select value={formData.assignee_ids?.[0] || ''} onValueChange={(id) => handleChange('assignee_ids', [id])}><SelectTrigger><SelectValue placeholder="Selecione o responsável" /></SelectTrigger><SelectContent>{userOptions.map((person) => <SelectItem key={person.value} value={person.value}>{person.label}</SelectItem>)}</SelectContent></Select>
              : formData.workflow_template_id ? <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">{selectedAssignees?.length ? selectedAssignees.map((person) => person.label).join(', ') : 'Pela etapa do fluxo'}</div> : <MultiSelect options={userOptions} value={selectedAssignees} onChange={handleAssigneeChange} placeholder="Selecione responsáveis" />}
          </div>

          <div className="space-y-1.5">
            <TaskFieldLabel htmlFor="task-execution-notes" help="Texto que a equipe lê para executar a tarefa.">Orientações para execução</TaskFieldLabel>
            <Textarea id="task-execution-notes" value={formData.description || ''} onChange={e => handleChange('description', e.target.value)} rows={6} placeholder="O que precisa ser produzido ou realizado." />
          </div>

          <TaskBriefingForm
            type={formData.type}
            payload={formData.briefing_payload || emptyBriefingPayload()}
            briefingLegado={Boolean(formData.briefing_legado)}
            onPayloadChange={(next) => handleChange('briefing_payload', next)}
          />

          {!linkedOnboarding && <TaskWorkflowPanel formData={formData} setFormData={setFormData} isNewTask={isNewTask} onStatusChange={onStatusChange} />}

          {!isNewTask && formData.id && RECORDING_TASK_TYPES.includes(String(formData.type || '').toLowerCase()) && (
            <TaskRecordingControl formData={formData} setFormData={setFormData} />
          )}

          <TaskDemandControl formData={formData} setFormData={setFormData} isNewTask={isNewTask} />

          {showPublications && !isNewTask && isContentTaskType(formData.type) && (
            <TaskPublicationsPanel taskId={formData.id} users={users} onPublicationsChange={onPublicationsChange} />
          )}
          {showPublications && isNewTask && isContentTaskType(formData.type) && (
            <div className="flex items-center gap-1 rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-sm">
              <span>Publicações</span>
              <TaskFieldHelp label="Sobre publicações">Salve a tarefa e depois abra Publicações para agendar com o arquivo já no Drive.</TaskFieldHelp>
            </div>
          )}
          
          {!isNewTask && (
            <div className="space-y-4 pt-4 border-t dark:border-gray-700">
              <TimeTrackingAnalysis timeLogs={formData.time_logs} statusOptions={statusOptions} />
            </div>
          )}

          {!isNewTask && (
            <div className="space-y-4 pt-4 border-t dark:border-gray-700">
              <h3 className="text-lg font-semibold flex items-center dark:text-white"><ListTodo className="mr-2 h-5 w-5" />Subtarefas</h3>
              <TaskSubtasksTab 
                taskId={formData.id} 
                taskType={formData.type} 
                taskStatus={formData.status} 
                onSubtasksChange={onSubtasksChange}
                subtasks={subtasks}
                deferRequiredSubtasks={lockClient}
              />
            </div>
          )}

          {!isOnboarding && <details className="rounded-xl border bg-card">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Ferramentas opcionais <span className="font-normal text-muted-foreground">(copy com IA)</span></summary>
            <div className="space-y-3 border-t bg-muted/10 p-4">
              <Button onClick={generateCopy} className="w-full" disabled={isGenerating} size="sm">
                <Sparkles className="mr-2 h-4 w-4" />
                {isGenerating ? 'Gerando...' : 'Gerar sugestão de copy'}
              </Button>
              {generatedCopy && (
                <div className="space-y-2">
                  <Label className="text-xs">Copy gerada por IA</Label>
                  <Textarea value={generatedCopy} readOnly rows={5} className="bg-gray-50 text-sm" />
                </div>
              )}
            </div>
          </details>}
          <AlertDialog open={showOpenAIAlert} onOpenChange={setShowOpenAIAlert}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle><AlertTriangle className="inline mr-2 text-yellow-500" />IA não disponível</AlertDialogTitle>
                <AlertDialogDescription>Configure a chave em Configurações (OpenAI ou OpenRouter para campanhas) e verifique as Edge Functions no Supabase.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogAction onClick={() => setShowOpenAIAlert(false)}>Entendi</AlertDialogAction>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      );
    };

    export default TaskDetailsTab;
