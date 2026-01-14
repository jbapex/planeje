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
  const [isExpanded, setIsExpanded] = useState(true);
  const titleInputRef = useRef(null);
  const noteTextareaRef = useRef(null);

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

  useEffect(() => {
    if (isEditingNote && noteTextareaRef.current) {
      noteTextareaRef.current.focus();
    }
  }, [isEditingNote]);

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
    onUpdate({
      ...item,
      due_date: date ? date.toISOString() : null
    });
  };

  const handleAssigneeChange = (assigneeId) => {
    onUpdate({
      ...item,
      assignee_id: assigneeId || null
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
    const newSubtask = {
      id: crypto.randomUUID(),
      title: 'Nova subtarefa',
      due_date: item.due_date || null,
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
        "flex items-start gap-2 p-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors",
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

        {/* Conteúdo Principal */}
        <div className="flex-1 min-w-0">
          {/* Título */}
          <div className="flex items-center gap-2 mb-1">
            {isEditingTitle ? (
              <Input
                ref={titleInputRef}
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={handleTitleKeyDown}
                className={cn(
                  "h-7 text-sm font-medium",
                  item.is_completed && "line-through text-gray-500 dark:text-gray-400"
                )}
              />
            ) : (
              <span
                onClick={handleTitleClick}
                className={cn(
                  "text-sm font-medium cursor-pointer hover:text-blue-600 dark:hover:text-blue-400",
                  item.is_completed && "line-through text-gray-500 dark:text-gray-400"
                )}
              >
                {item.title || 'Sem título'}
              </span>
            )}
          </div>

          {/* Informações (Data, Responsável, Status) */}
          <div className="flex items-center gap-3 flex-wrap text-xs text-gray-500 dark:text-gray-400">
            {/* Data */}
            <Popover>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300">
                  <CalendarIcon className="h-3 w-3" />
                  {item.due_date ? (
                    <span>{format(new Date(item.due_date), "dd/MM/yyyy", { locale: ptBR })}</span>
                  ) : (
                    <span className="text-gray-400">Sem data</span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={item.due_date ? new Date(item.due_date) : null}
                  onSelect={handleDateChange}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            {/* Responsável */}
            <Select value={item.assignee_id || ''} onValueChange={handleAssigneeChange}>
              <SelectTrigger className="h-6 w-auto px-2 text-xs border-none shadow-none hover:bg-gray-100 dark:hover:bg-gray-700">
                <div className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {assignee ? (
                    <>
                      <Avatar className="h-4 w-4">
                        <AvatarImage src={assignee.avatar_url} />
                        <AvatarFallback className="text-[8px]">{assignee.full_name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <span className="max-w-[80px] truncate">{assignee.full_name}</span>
                    </>
                  ) : (
                    <span className="text-gray-400">Sem responsável</span>
                  )}
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Sem responsável</SelectItem>
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

            {/* Status */}
            {item.is_completed && item.completed_at && (
              <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-3 w-3" />
                <span>Concluído em {format(new Date(item.completed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
              </div>
            )}
            {!item.is_completed && daysLeft !== null && (
              <div className={cn(
                "flex items-center gap-1",
                taskStatus === 'overdue' && "text-red-600 dark:text-red-400",
                taskStatus === 'urgent' && "text-orange-600 dark:text-orange-400",
                taskStatus === 'pending' && "text-gray-500 dark:text-gray-400"
              )}>
                <Clock className="h-3 w-3" />
                {taskStatus === 'overdue' && <span>Atrasado {Math.abs(daysLeft)} dias</span>}
                {taskStatus === 'urgent' && <span>Em {daysLeft} dias</span>}
                {taskStatus === 'pending' && <span>Em {daysLeft} dias</span>}
              </div>
            )}
          </div>

          {/* Nota */}
          {isEditingNote ? (
            <div className="mt-2">
              <Textarea
                ref={noteTextareaRef}
                value={editingNote}
                onChange={(e) => setEditingNote(e.target.value)}
                placeholder="Adicione uma nota..."
                className="h-16 text-xs"
              />
              <div className="flex gap-2 mt-1">
                <Button size="sm" variant="default" onClick={handleNoteSave}>Salvar</Button>
                <Button size="sm" variant="ghost" onClick={() => {
                  setEditingNote(item.note || '');
                  setIsEditingNote(false);
                }}>Cancelar</Button>
              </div>
            </div>
          ) : item.note && (
            <div className="mt-1 text-xs text-gray-600 dark:text-gray-400 italic">
              💬 {item.note}
            </div>
          )}
        </div>

        {/* Ações */}
        <div className="flex items-center gap-1 opacity-0 group-hover/task:opacity-100 transition-opacity">
          {/* Adicionar Subtarefa */}
          {!isSubtask && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleAddSubtaskClick}
              title="Adicionar subtarefa"
            >
              <Plus className="h-4 w-4" />
            </Button>
          )}

          {/* Adicionar Nota */}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-7 w-7",
              item.note && "text-blue-600 dark:text-blue-400"
            )}
            onClick={() => setIsEditingNote(true)}
            title="Adicionar nota"
          >
            <FileText className="h-4 w-4" />
          </Button>

          {/* Expandir/Recolher Subtarefas */}
          {hasSubtasks && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setIsExpanded(!isExpanded)}
              title={isExpanded ? "Recolher subtarefas" : "Expandir subtarefas"}
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          )}

          {/* Excluir */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-red-500 hover:text-red-700"
                title="Excluir tarefa"
              >
                <Trash2 className="h-4 w-4" />
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

      {/* Subtarefas */}
      <AnimatePresence>
        {hasSubtasks && isExpanded && (
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
    </div>
  );
};

export default OnboardingTaskItemInline;

