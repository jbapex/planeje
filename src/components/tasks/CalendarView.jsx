import React, { useState, useMemo, useEffect } from 'react';
    import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
    import { Button } from '@/components/ui/button';
    import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isToday, parse, isSameDay, add, sub } from 'date-fns';
    import { ptBR } from 'date-fns/locale';
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
    import { Label } from '@/components/ui/label';
    import {
      AlertDialog,
      AlertDialogAction,
      AlertDialogCancel,
      AlertDialogContent,
      AlertDialogDescription,
      AlertDialogFooter,
      AlertDialogHeader,
      AlertDialogTitle,
    } from '@/components/ui/alert-dialog';

    const generateColor = (str) => {
      if (!str) return '#cccccc';
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
      }
      let color = '#';
      for (let i = 0; i < 3; i++) {
        const value = (hash >> (i * 8)) & 0xFF;
        color += ('00' + value.toString(16)).substr(-2);
      }
      return color;
    };

    const CalendarView = ({ tasks, onOpenTask, onDeleteTask, statusOptions, clients = [], showClientIndicator = false, forcedDateType = null }) => {
      const [currentDate, setCurrentDate] = useState(new Date());
      const [dateType, setDateType] = useState(forcedDateType || 'due_date');
      const [taskIdPendingDelete, setTaskIdPendingDelete] = useState(null);

      useEffect(() => {
        if (forcedDateType) {
          setDateType(forcedDateType);
        }
      }, [forcedDateType]);

      const clientColors = useMemo(() => {
        const colors = {};
        clients.forEach(client => {
          colors[client.id] = generateColor(client.id);
        });
        return colors;
      }, [clients]);

      const firstDayOfMonth = startOfMonth(currentDate);
      const lastDayOfMonth = endOfMonth(currentDate);
      const daysInMonth = eachDayOfInterval({ start: firstDayOfMonth, end: lastDayOfMonth });
      const startingDayIndex = getDay(firstDayOfMonth);

      const getTasksForDay = (day) => {
        return tasks.filter(task => {
          const taskDateString = task[dateType];
          if (!taskDateString) return false;
          
          try {
            const taskDate = parse(taskDateString, 'yyyy-MM-dd', new Date());
            return isSameDay(taskDate, day);
          } catch (e) {
            console.error("Invalid date format for task", task.id, taskDateString, e);
            return false;
          }
        });
      };

      const handlePrevMonth = () => {
        setCurrentDate(sub(currentDate, { months: 1 }));
      };

      const handleNextMonth = () => {
        setCurrentDate(add(currentDate, { months: 1 }));
      };

      const taskPendingDelete = useMemo(
        () => (taskIdPendingDelete ? tasks.find((t) => t.id === taskIdPendingDelete) : null),
        [taskIdPendingDelete, tasks]
      );

      const confirmDelete = async () => {
        if (!taskIdPendingDelete || !onDeleteTask) return;
        await onDeleteTask(taskIdPendingDelete);
        setTaskIdPendingDelete(null);
      };

      return (
        <>
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
          <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={handlePrevMonth} className="dark:bg-gray-700 dark:text-white dark:border-gray-600 dark:hover:bg-gray-600"><ChevronLeft /></Button>
              <h2 className="text-xl font-bold capitalize dark:text-white">{format(currentDate, 'MMMM yyyy', { locale: ptBR })}</h2>
              <Button variant="outline" size="icon" onClick={handleNextMonth} className="dark:bg-gray-700 dark:text-white dark:border-gray-600 dark:hover:bg-gray-600"><ChevronRight /></Button>
            </div>
            {!forcedDateType && (
              <div className="flex items-center gap-2">
                <Label htmlFor="date-type-filter" className="dark:text-gray-300">Visualizar por:</Label>
                <Select value={dateType} onValueChange={setDateType}>
                  <SelectTrigger id="date-type-filter" className="w-[180px] dark:bg-gray-700 dark:text-white dark:border-gray-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="due_date">Data de Entrega</SelectItem>
                    <SelectItem value="post_date">Data de Postagem</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => <div key={day} className="text-center font-medium text-gray-500 dark:text-gray-400 py-2">{day}</div>)}
            {Array.from({ length: startingDayIndex }).map((_, i) => <div key={`empty-${i}`} className="border dark:border-gray-700 rounded-md" />)}
            {daysInMonth.map(day => (
              <div key={day.toString()} className={`border dark:border-gray-700 rounded-md p-2 min-h-[120px] ${isToday(day) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                <span className={`font-semibold ${isToday(day) ? 'text-blue-600 dark:text-blue-300' : 'dark:text-gray-300'}`}>{format(day, 'd')}</span>
                <div className="mt-1 space-y-1">
                  {getTasksForDay(day).map(task => {
                    const statusInfo = statusOptions.find(s => s.value === task.status) || {};
                    const clientColor = showClientIndicator && task.client_id ? clientColors[task.client_id] : (statusInfo.color || generateColor(task.status || ''));
                    return (
                      <div
                        key={task.id}
                        className="text-xs rounded overflow-hidden flex items-stretch gap-0 min-w-0 group/cal-task"
                        style={{ backgroundColor: clientColor }}
                      >
                        <button
                          type="button"
                          onClick={() => onOpenTask(task)}
                          className="flex-1 min-w-0 text-left p-1 text-white truncate cursor-pointer hover:brightness-110"
                          title={`${task.clientes?.empresa ? task.clientes.empresa + ': ' : ''}${task.title}`}
                        >
                          {task.title}
                        </button>
                        {onDeleteTask ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setTaskIdPendingDelete(task.id);
                            }}
                            className="shrink-0 px-1 flex items-center justify-center text-white/80 hover:text-white hover:bg-black/20 opacity-80 sm:opacity-0 sm:group-hover/cal-task:opacity-100 focus-visible:opacity-100"
                            aria-label={`Excluir tarefa: ${task.title}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {showClientIndicator && (
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
              {clients.map(client => (
                <div key={client.id} className="flex items-center gap-2 text-sm">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: clientColors[client.id] }}></span>
                  <span className="dark:text-gray-300">{client.empresa}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <AlertDialog open={!!taskIdPendingDelete} onOpenChange={(open) => !open && setTaskIdPendingDelete(null)}>
          <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
            <AlertDialogHeader>
              <AlertDialogTitle className="dark:text-white">Excluir tarefa?</AlertDialogTitle>
              <AlertDialogDescription className="dark:text-gray-400">
                {taskPendingDelete
                  ? `Remover permanentemente: "${taskPendingDelete.title}"?`
                  : 'Esta ação não pode ser desfeita.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="dark:text-white dark:border-gray-600 dark:hover:bg-gray-700">Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => void confirmDelete()}
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        </>
      );
    };

    export default CalendarView;