import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Calendar as CalendarIcon, User, Plus, FileText, Trash2, ChevronDown, ChevronUp, Clock, CheckCircle2 } from 'lucide-react';
import { format, differenceInDays, isPast, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

const OnboardingTaskItemInline = ({ 
  item, 
  checklistId,
  onUpdate,
  onDelete,
  onAddSubtask,
  profiles,
  isSubtask = false,
  level = 0
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitle, setEditingTitle] = useState(item.title);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [editingNote, setEditingNote] = useState(item.note || '');
  const titleInputRef = useRef(null);
  const noteTextareaRef = useRef(null);
  const hasAutoEditedRef = useRef(false);

  const assignee = useMemo(() => profiles.find(p => p.id === item.assignee_id), [profiles, item.assignee_id]);
  const subtasks = item.subtasks || [];
  const hasSubtasks = subtasks.length > 0;

  // Calcular status da tarefa
  const taskStatus = useMemo(() => {
    if (item.is_completed) return 'completed';
    if (!item.due_date) return 'pending';
    const dueDate = new Date(item.due_date);
    if (isPast(dueDate) && !isToday(dueDate)) return 'overdue';
    const daysLeft = differenceInDays(dueDate, new Date());
    if (daysLeft <= 3) return 'urgent';
    return 'pending';
  }, [item.is_completed, item.due_date]);

  // Calcular dias restantes
  const daysLeft = useMemo(() => {
    if (!item.due_date || item.is_completed) return null;
    const dueDate = new Date(item.due_date);
    const diff = differenceInDays(dueDate, new Date());
    return diff;
  }, [item.due_date, item.is_completed]);

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  // Auto-editar quando o item é novo (título padrão "Nova tarefa")
  useEffect(() => {
    if (item.title === 'Nova tarefa' && !item.is_completed && !hasAutoEditedRef.current) {
      setIsEditingTitle(true);
      setEditingTitle('');
      hasAutoEditedRef.current = true;
    }
  }, [item.title, item.is_completed]);

  // Garantir que sempre tenha data (obrigatória) - apenas uma vez
  const hasSetDefaultDateRef = useRef(false);
  useEffect(() => {
    if (!item.due_date && !hasSetDefaultDateRef.current) {
      const defaultDate = new Date();
      defaultDate.setHours(23, 59, 59, 999);
      hasSetDefaultDateRef.current = true;
      onUpdate({
        ...item,
        due_date: defaultDate.toISOString()
      });
    } else if (item.due_date) {
      hasSetDefaultDateRef.current = true;
    }
  }, [item.due_date]);

  useEffect(() => {
    if (isEditingNote) {
      // Atualizar o texto da nota quando abrir o Dialog
      setEditingNote(item.note || '');
      // Pequeno delay para garantir que o Dialog está renderizado
      setTimeout(() => {
        noteTextareaRef.current?.focus();
      }, 100);
    }
  }, [isEditingNote, item.note]);

  const handleTitleClick = () => {
    if (!item.is_completed) {
      setIsEditingTitle(true);
      setEditingTitle(item.title);
    }
  };

  const handleTitleSave = () => {
    if (editingTitle.trim() && editingTitle !== item.title) {
      onUpdate({ ...item, title: editingTitle.trim() });
    }
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTitleSave();
    } else if (e.key === 'Escape') {
      setEditingTitle(item.title);
      setIsEditingTitle(false);
    }
  };

  const handleToggleComplete = (checked) => {
    onUpdate({
      ...item,
      is_completed: checked,
      completed_at: checked ? new Date().toISOString() : null
    });
  };

  const handleDateChange = (date) => {
    // Data é obrigatória - se tentar remover, mantém a data atual
    if (!date) {
      return; // Não permite remover a data
    }
    onUpdate({
      ...item,
      due_date: date.toISOString()
    });
  };

  const handleAssigneeChange = (assigneeId) => {
    onUpdate({
      ...item,
      assignee_id: assigneeId === 'unassigned' ? null : assigneeId
    });
  };

  const handleNoteSave = () => {
    onUpdate({
      ...item,
      note: editingNote.trim() || null
    });
    setIsEditingNote(false);
  };

  const handleAddSubtaskClick = () => {
    // Data padrão: mesma da tarefa pai ou hoje
    const defaultDate = item.due_date ? new Date(item.due_date) : new Date();
    if (!item.due_date) {
      defaultDate.setHours(23, 59, 59, 999); // Final do dia se for hoje
    }
    
    const newSubtask = {
      id: crypto.randomUUID(),
      title: 'Nova subtarefa',
      due_date: defaultDate.toISOString(),
      assignee_id: item.assignee_id || null,
      is_completed: false,
      completed_at: null,
      note: null,
      subtasks: []
    };
    onAddSubtask(newSubtask);
    // Auto-expandir para mostrar a nova subtarefa
    setIsExpanded(true);
  };

  const handleSubtaskUpdate = (subtaskId, updatedSubtask) => {
    const updatedSubtasks = subtasks.map(st => 
      st.id === subtaskId ? updatedSubtask : st
    );
    onUpdate({
      ...item,
      subtasks: updatedSubtasks
    });
  };

  const handleSubtaskDelete = (subtaskId) => {
    const updatedSubtasks = subtasks.filter(st => st.id !== subtaskId);
    onUpdate({
      ...item,
      subtasks: updatedSubtasks
    });
  };

  const handleSubtaskAdd = (subtaskId, newSubtask) => {
    const updatedSubtasks = subtasks.map(st => 
      st.id === subtaskId 
        ? { ...st, subtasks: [...(st.subtasks || []), newSubtask] }
        : st
    );
    onUpdate({
      ...item,
      subtasks: updatedSubtasks
    });
  };

  return (
    <div className={cn(
      "group/task",
      isSubtask && "ml-6 border-l-2 border-gray-200 dark:border-gray-700 pl-3"
    )}>
      <div className={cn(
        "flex items-center gap-3 p-2.5 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors",
        item.is_completed && "opacity-75"
      )}>
        {/* Checkbox */}
        <div className="pt-1">
          <Checkbox
            checked={item.is_completed}
            onCheckedChange={handleToggleComplete}
            className="h-5 w-5"
          />
        </div>

        {/* Conteúdo Principal - Título e data em coluna, resto na linha */}
        <div className="flex-1 min-w-0 flex items-center gap-3">
          {/* Título e Data em coluna */}
          <div className="flex-1 min-w-[120px]">
            {isEditingTitle ? (
              <Input
                ref={titleInputRef}
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={handleTitleKeyDown}
                className={cn(
                  "h-7 text-sm font-medium w-full",
                  item.is_completed && "line-through text-gray-500 dark:text-gray-400"
                )}
              />
            ) : (
              <div>
                <span
                  onClick={handleTitleClick}
                  className={cn(
                    "text-sm font-medium cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 block truncate",
                    item.is_completed && "line-through text-gray-500 dark:text-gray-400"
                  )}
                  title={item.title || 'Sem título'}
                >
                  {item.title || 'Sem título'}
                </span>
                {/* Data e Status pequenos embaixo do nome */}
                <div className="flex items-center gap-1.5 -mt-0.5 leading-none">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="text-[10px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400">
                        {item.due_date ? (
                          format(new Date(item.due_date), "dd/MM/yy", { locale: ptBR })
                        ) : (
                          format(new Date(), "dd/MM/yy", { locale: ptBR })
                        )}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={item.due_date ? new Date(item.due_date) : new Date()}
                        onSelect={handleDateChange}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  
                  {/* Status de atraso/urgente pequeno */}
                  {!item.is_completed && daysLeft !== null && (taskStatus === 'overdue' || taskStatus === 'urgent') && (
                    <span className={cn(
                      "text-[10px]",
                      taskStatus === 'overdue' && "text-red-600 dark:text-red-400",
                      taskStatus === 'urgent' && "text-orange-600 dark:text-orange-400"
                    )}>
                      {taskStatus === 'overdue' && `Atrasado ${Math.abs(daysLeft)}d`}
                      {taskStatus === 'urgent' && `Em ${daysLeft}d`}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Responsável - só avatar */}
          <Select value={item.assignee_id || 'unassigned'} onValueChange={handleAssigneeChange}>
            <SelectTrigger className="h-7 w-7 p-0 border-none shadow-none hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full [&>svg]:hidden">
              {assignee ? (
                <Avatar className="h-7 w-7 cursor-pointer">
                  <AvatarImage src={assignee.avatar_url} />
                  <AvatarFallback className="text-xs">{assignee.full_name.charAt(0)}</AvatarFallback>
                </Avatar>
              ) : (
                <div className="h-7 w-7 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                  <User className="h-3.5 w-3.5 text-gray-400" />
                </div>
              )}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">Sem responsável</SelectItem>
              {profiles.map(profile => (
                <SelectItem key={profile.id} value={profile.id}>
                  <div className="flex items-center gap-2">
                    <Avatar className="h-5 w-5">
                      <AvatarImage src={profile.avatar_url} />
                      <AvatarFallback>{profile.full_name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <span>{profile.full_name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Ações - sempre visíveis na mesma linha */}
          <div className="flex items-center gap-1">
            {/* Adicionar Nota */}
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-6 w-6",
                item.note && "text-blue-600 dark:text-blue-400"
              )}
              onClick={() => setIsEditingNote(true)}
              title="Adicionar nota"
            >
              <FileText className="h-3.5 w-3.5" />
            </Button>

            {/* Adicionar Subtarefa */}
            {!isSubtask && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleAddSubtaskClick}
                title="Adicionar subtarefa"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            )}

            {/* Excluir */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-red-500 hover:text-red-700"
                  title="Excluir tarefa"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir tarefa?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação não pode ser desfeita. A tarefa "{item.title}" será excluída permanentemente.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete} className="bg-red-500 hover:bg-red-600">
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>

      {/* Subtarefas */}
      <AnimatePresence>
        {hasSubtasks && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-1 space-y-1"
          >
            {subtasks.map((subtask) => (
              <OnboardingTaskItemInline
                key={subtask.id}
                item={subtask}
                checklistId={checklistId}
                onUpdate={(updated) => handleSubtaskUpdate(subtask.id, updated)}
                onDelete={() => handleSubtaskDelete(subtask.id)}
                onAddSubtask={(newSubtask) => handleSubtaskAdd(subtask.id, newSubtask)}
                profiles={profiles}
                isSubtask={true}
                level={level + 1}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dialog para editar nota */}
      <Dialog open={isEditingNote} onOpenChange={setIsEditingNote}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Nota</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              ref={noteTextareaRef}
              value={editingNote}
              onChange={(e) => setEditingNote(e.target.value)}
              placeholder="Digite sua nota aqui..."
              className="min-h-[100px]"
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setIsEditingNote(false);
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setEditingNote(item.note || '');
              setIsEditingNote(false);
            }}>
              Cancelar
            </Button>
            <Button onClick={handleNoteSave}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OnboardingTaskItemInline;

