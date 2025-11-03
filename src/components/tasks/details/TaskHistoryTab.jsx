import React from 'react';
    import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
    import { User } from 'lucide-react';
    import { formatDistanceToNow } from 'date-fns';
    import { ptBR } from 'date-fns/locale';

    const TaskHistoryTab = ({ history = [], users = [], statusOptions = [] }) => {
      const sortedHistory = [...history].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      if (!history || history.length === 0) {
        return <p className="text-center text-gray-500 dark:text-gray-400 py-10">Nenhum histórico de alterações de status encontrado.</p>;
      }

      return (
        <div className="space-y-6">
          {sortedHistory.map((item, index) => {
            const user = users.find(u => u.id === item.user_id);
            const currentStatus = statusOptions.find(s => s.value === item.status);
            const previousHistoryItem = sortedHistory[index + 1];
            const previousStatus = previousHistoryItem ? statusOptions.find(s => s.value === previousHistoryItem.status) : null;
            
            const assigneeNames = (item.assignee_ids || [])
                .map(id => users.find(u => u.id === id)?.full_name || 'Desconhecido')
                .join(', ');

            return (
              <div key={item.timestamp} className="flex items-start gap-4">
                <Avatar className="h-8 w-8 sm:h-10 sm:w-10 border">
                  <AvatarImage src={user?.avatar_url} alt={user?.full_name} />
                  <AvatarFallback><User className="h-4 w-4 sm:h-5 sm:w-5"/></AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="text-sm">
                    <span className="font-semibold dark:text-white">{user?.full_name || 'Usuário desconhecido'}</span>
                    <span className="text-gray-600 dark:text-gray-400"> moveu esta tarefa </span>
                    {previousStatus && (
                      <>
                        <span className="font-medium text-gray-600 dark:text-gray-400">de </span>
                         <span className="font-semibold" style={{ color: previousStatus.color.startsWith('#') ? previousStatus.color : '' }}>{previousStatus.label}</span>
                         <span className="font-medium text-gray-600 dark:text-gray-400"> para </span>
                      </>
                    )}
                    <span className="font-semibold" style={{ color: currentStatus?.color.startsWith('#') ? currentStatus.color : '' }}>{currentStatus?.label || item.status}</span>
                  </p>
                  {assigneeNames && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Responsáveis: {assigneeNames}
                      </p>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true, locale: ptBR })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      );
    };

    export default TaskHistoryTab;