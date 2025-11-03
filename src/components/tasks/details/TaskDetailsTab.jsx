import React, { useState, useEffect, useMemo } from 'react';
    import { Input } from '@/components/ui/input';
    import { Textarea } from '@/components/ui/textarea';
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
    import { Label } from '@/components/ui/label';
    import { Button } from '@/components/ui/button';
    import { Sparkles, AlertTriangle, ListTodo, CalendarPlus as CalendarIcon, Timer, GanttChartSquare } from 'lucide-react';
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

    const TaskDetailsTab = ({ formData, setFormData, clients, projects, users, statusOptions, onStatusChange, onSubtasksChange, subtasks, isNewTask }) => {
      const [showOpenAIAlert, setShowOpenAIAlert] = useState(false);
      const [isGenerating, setIsGenerating] = useState(false);
      const [generatedCopy, setGeneratedCopy] = useState('');
      const [filteredProjects, setFilteredProjects] = useState([]);
      const { toast } = useToast();
      const { getOpenAIKey } = useAuth();
      
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
        const apiKey = await getOpenAIKey();
        if (!apiKey) {
          setShowOpenAIAlert(true);
          return;
        }
        setIsGenerating(true);
        setGeneratedCopy('');

        const clientName = clients.find(c => c.id === formData.client_id)?.empresa || 'o cliente';
        const prompt = `Aja como um social media expert. Crie uma sugestão de copy para um post em rede social para ${clientName}. A tarefa é sobre "${formData.title}". A descrição da tarefa é: "${formData.description}". A copy deve ser envolvente e terminar com uma chamada para ação clara. Responda apenas com o texto da copy.`;

        try {
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({ model: 'gpt-3.5-turbo', messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 250 })
          });
          if (!response.ok) throw new Error(`API da OpenAI respondeu com status ${response.status}`);
          const data = await response.json();
          setGeneratedCopy(data.choices[0].message.content.trim());
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

      return (
        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs">Nome da Tarefa</Label>
            <Input value={formData.title || ''} onChange={e => handleChange('title', e.target.value)} className="text-base font-semibold" />
          </div>

          {!isNewTask && <LiveTimer timeLogs={formData.time_logs} currentStatus={formData.status} />}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Cliente</Label>
              <Select value={formData.client_id || ''} onValueChange={v => handleChange('client_id', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.empresa}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Campanha (Projeto)</Label>
              <Select value={formData.project_id || ''} onValueChange={v => handleChange('project_id', v)} disabled={!formData.client_id || filteredProjects.length === 0}>
                <SelectTrigger><SelectValue placeholder={!formData.client_id ? "Selecione um cliente" : "Selecione a campanha"} /></SelectTrigger>
                <SelectContent>
                  {filteredProjects.length > 0 ? (
                    filteredProjects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)
                  ) : (
                    <div className="p-2 text-sm text-center text-gray-500">Nenhuma campanha.</div>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 col-span-1 sm:col-span-2">
              <Label className="text-xs">Responsáveis</Label>
              <MultiSelect
                options={userOptions}
                value={selectedAssignees}
                onChange={handleAssigneeChange}
                placeholder="Selecione responsáveis"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={formData.status || (statusOptions && statusOptions.length > 0 ? statusOptions[0].value : '')} onValueChange={handleStatusChange}>
                <SelectTrigger>
                  <SelectValue>
                    {selectedStatus ? (
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedStatus.color }} />
                        <span>{selectedStatus.label}</span>
                      </div>
                    ) : 'Selecione o status'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(statusOptions || []).map(s => (
                    <SelectItem key={s.value} value={s.value}>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                        <span>{s.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tipo</Label>
              <Select value={formData.type || ''} onValueChange={v => handleChange('type', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="arte">Arte</SelectItem>
                  <SelectItem value="video">Vídeo</SelectItem>
                  <SelectItem value="planejamento">Planejamento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Data de Entrega</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !formData.due_date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.due_date ? format(new Date(formData.due_date + 'T00:00:00'), "PPP", { locale: ptBR }) : <span>Escolha uma data</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={formData.due_date ? new Date(formData.due_date + 'T00:00:00') : null}
                    onSelect={(date) => handleDateChange('due_date', date)}
                    initialFocus
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Data de Postagem</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !formData.post_date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.post_date ? format(new Date(formData.post_date + 'T00:00:00'), "PPP", { locale: ptBR }) : <span>Escolha uma data</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={formData.post_date ? new Date(formData.post_date + 'T00:00:00') : null}
                    onSelect={(date) => handleDateChange('post_date', date)}
                    initialFocus
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Descrição Detalhada</Label>
            <Textarea value={formData.description || ''} onChange={e => handleChange('description', e.target.value)} rows={4} />
          </div>
          
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
              />
            </div>
          )}

          <div className="space-y-2">
            <Button onClick={generateCopy} className="w-full" disabled={isGenerating} size="sm">
              <Sparkles className="mr-2 h-4 w-4" />
              {isGenerating ? 'Gerando...' : 'Gerar Sugestão de Copy'}
            </Button>
          </div>
          {generatedCopy && (
            <div className="space-y-2">
              <Label className="text-xs">Copy Gerada por IA</Label>
              <Textarea value={generatedCopy} readOnly rows={5} className="bg-gray-50 text-sm" />
            </div>
          )}
          <AlertDialog open={showOpenAIAlert} onOpenChange={setShowOpenAIAlert}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle><AlertTriangle className="inline mr-2 text-yellow-500" />Chave da OpenAI não encontrada</AlertDialogTitle>
                <AlertDialogDescription>Para usar o assistente de IA, por favor, adicione sua chave da API da OpenAI na página de Configurações.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogAction onClick={() => setShowOpenAIAlert(false)}>Entendi</AlertDialogAction>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      );
    };

    export default TaskDetailsTab;