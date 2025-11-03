import React, { useState, useMemo } from 'react';
import { startOfMonth, endOfMonth, eachDayOfInterval, format, parseISO, addMonths, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const TimelineView = ({ tasks, statusOptions, users, onOpenTask, clients }) => {
  const [currentDate, setCurrentDate] = useState(new Date());

  const { firstDay, lastDay, daysInMonth, monthYear } = useMemo(() => {
    const first = startOfMonth(currentDate);
    const last = endOfMonth(currentDate);
    return {
      firstDay: first,
      lastDay: last,
      daysInMonth: eachDayOfInterval({ start: first, end: last }),
      monthYear: format(currentDate, "MMMM 'de' yyyy", { locale: ptBR })
    };
  }, [currentDate]);

  const getClientName = (clientId) => {
    const client = clients.find(c => c.id === clientId);
    return client?.empresa || 'Sem Cliente';
  };

  const tasksByClient = useMemo(() => {
    const filteredTasks = tasks.filter(t => t.due_date);
    return filteredTasks.reduce((acc, task) => {
      const clientName = getClientName(task.client_id);
      if (!acc[clientName]) acc[clientName] = [];
      acc[clientName].push(task);
      return acc;
    }, {});
  }, [tasks, clients]);
  
  const getAssigneesNames = (assigneeIds) => {
    if (!assigneeIds || assigneeIds.length === 0) return '';
    return assigneeIds.map(id => users.find(u => u.id === id)?.full_name).filter(Boolean).join(', ');
  };

  const clientNames = Object.keys(tasksByClient).sort();

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm h-full flex flex-col overflow-hidden">
      <div className="flex justify-center items-center mb-4 flex-shrink-0">
        <Button variant="ghost" size="icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-xl font-bold capitalize w-48 text-center dark:text-white">{monthYear}</h2>
        <Button variant="ghost" size="icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
      <div className="overflow-auto flex-grow relative">
        <div className="inline-block min-w-full align-top">
          <div className="grid" style={{ gridTemplateColumns: `200px repeat(${daysInMonth.length}, minmax(50px, 1fr))` }}>
            {/* Header: Cliente */}
            <div className="sticky top-0 left-0 bg-gray-100 dark:bg-gray-900 z-20 border-b border-r dark:border-gray-700 font-semibold p-2 dark:text-white flex items-center">Cliente</div>
            
            {/* Header: Dias */}
            {daysInMonth.map(day => (
              <div key={day.toString()} className="sticky top-0 bg-gray-100 dark:bg-gray-900 z-10 text-center border-b border-r dark:border-gray-700 p-2 text-sm dark:text-gray-300">
                <span className="font-semibold">{format(day, 'd')}</span>
                <div className="text-xs text-gray-400">{format(day, 'eee', { locale: ptBR })}</div>
              </div>
            ))}
            
            {/* Rows: Clientes e Tarefas */}
            {clientNames.length > 0 ? clientNames.map((clientName) => (
              <React.Fragment key={clientName}>
                <div className="sticky left-0 bg-white dark:bg-gray-800 z-10 border-b border-r dark:border-gray-700 font-medium p-2 text-sm dark:text-white flex items-center truncate" title={clientName}>{clientName}</div>
                {daysInMonth.map((day) => {
                   const tasksForDay = tasksByClient[clientName].filter(t => {
                    const taskDate = parseISO(t.due_date);
                    return format(taskDate, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd');
                  });
                  return (
                    <div key={`${clientName}-${day.toString()}`} className={`border-b border-r dark:border-gray-700 p-1 space-y-1 min-h-[60px] flex flex-col`}>
                      {tasksForDay.map(task => {
                        const statusInfo = statusOptions.find(s => s.value === task.status) || {};
                        return (
                          <div 
                            key={task.id} 
                            onClick={() => onOpenTask(task)} 
                            className="text-xs p-1 rounded text-white truncate cursor-pointer hover:opacity-80 transition-opacity"
                            style={{ backgroundColor: statusInfo.color || '#6B7280' }}
                            title={`${task.title} - ${getAssigneesNames(task.assignee_ids)}`}
                          >
                            {task.title}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </React.Fragment>
            )) : (
                <div className="col-span-full text-center p-10 text-gray-500 dark:text-gray-400">
                    Nenhuma tarefa com data de vencimento encontrada para este mês.
                </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TimelineView;