import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/customSupabaseClient';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const STATUS_INFO = {
  'todo': { label: 'A Fazer', color: 'bg-gray-400' },
  'production': { label: 'Em Produção', color: 'bg-blue-500' },
  'review': { label: 'Em Revisão', color: 'bg-yellow-500' },
  'approve': { label: 'Aprovar Cliente', color: 'bg-orange-500' },
  'scheduled': { label: 'Agendado', color: 'bg-purple-500' },
  'published': { label: 'Publicado', color: 'bg-green-500' },
  'pending': { label: 'Pendente', color: 'bg-yellow-600' },
  'blocked': { label: 'Bloqueado', color: 'bg-red-500' },
};

const ClientProgress = ({ client, onClose }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    if (!client) return;
    setLoading(true);

    const firstDay = startOfMonth(currentDate);
    const lastDay = endOfMonth(currentDate);

    const { data, error } = await supabase
      .from('tarefas')
      .select('*')
      .eq('client_id', client.id)
      .gte('due_date', firstDay.toISOString())
      .lte('due_date', lastDay.toISOString());

    if (error) {
      console.error("Error fetching tasks:", error);
    } else {
      setTasks(data);
    }
    setLoading(false);
  }, [client, currentDate]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const changeMonth = (amount) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + amount);
    setCurrentDate(newDate);
  };

  const tasksByStatus = Object.keys(STATUS_INFO).reduce((acc, status) => {
    acc[status] = tasks.filter(t => t.status === status).length;
    return acc;
  }, {});

  const totalTasks = tasks.length;
  const completedTasks = tasksByStatus['published'] || 0;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg dark:bg-gray-800 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="dark:text-white">Progresso de {client.empresa}</DialogTitle>
        </DialogHeader>
        <div className="py-4 space-y-6">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={() => changeMonth(-1)} className="dark:text-gray-300 dark:hover:bg-gray-700">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-semibold text-lg capitalize dark:text-white">
              {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
            </span>
            <Button variant="ghost" size="icon" onClick={() => changeMonth(1)} className="dark:text-gray-300 dark:hover:bg-gray-700">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {loading ? (
            <p className="text-center dark:text-gray-300">Carregando...</p>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-1 text-sm">
                  <span className="font-medium dark:text-white">Progresso Geral</span>
                  <span className="text-gray-600 dark:text-gray-400">{completedTasks} de {totalTasks} tarefas</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                  <div className="bg-green-500 h-2.5 rounded-full" style={{ width: `${completionRate}%` }}></div>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-2 dark:text-white">Tarefas por Status</h4>
                <div className="space-y-2">
                  {Object.entries(tasksByStatus).map(([status, count]) => {
                    if (count === 0) return null;
                    const info = STATUS_INFO[status];
                    return (
                      <div key={status} className="flex items-center justify-between text-sm dark:text-gray-300">
                        <div className="flex items-center">
                          <span className={`w-3 h-3 rounded-full mr-2 ${info.color}`}></span>
                          <span>{info.label}</span>
                        </div>
                        <span>{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ClientProgress;