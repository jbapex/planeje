import React from 'react';
    import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
    import { User } from 'lucide-react';
    import { formatDistanceToNow } from 'date-fns';
    import { ptBR } from 'date-fns/locale';

    const TaskHistoryTab = ({ history = [], users = [], statusOptions = [] }) => {
      const entries = Array.isArray(history) ? history.filter(Boolean) : [];
      const sortedHistory = [...entries].sort((a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0));

      if (entries.length === 0) {
        return <p className="text-center text-gray-500 dark:text-gray-400 py-10">Nenhum histórico de alterações de status encontrado.</p>;
      }

      return (
        <div className="space-y-6">
          {sortedHistory.map((item, index) => {
            const user = users.find(u => u.id === item.user_id);
            const fromContext = item.source === 'cs_ia_whatsapp_context';
            const fromCommand = item.source === 'cs_ia_whatsapp';
            const fromCreation = item.source === 'cs_ia_whatsapp_creation';
            const currentStatus = statusOptions.find(s => s.value === item.status);
            const previousHistoryItem = sortedHistory[index + 1];
            const previousStatus = previousHistoryItem ? statusOptions.find(s => s.value === previousHistoryItem.status) : null;
            
            const assigneeNames = (item.assignee_ids || [])
                .map(id => users.find(u => u.id === id)?.full_name || 'Desconhecido')
                .join(', ');

            return (
              <div key={`${item.timestamp || 'undated'}-${index}`} className="flex items-start gap-4">
                <Avatar className="h-8 w-8 sm:h-10 sm:w-10 border">
                  <AvatarImage src={user?.avatar_url} alt={user?.full_name} />
                  <AvatarFallback><User className="h-4 w-4 sm:h-5 sm:w-5"/></AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="text-sm">
                    <span className="font-semibold dark:text-white">{fromCreation || fromContext || fromCommand ? 'CS IA' : user?.full_name || 'Usuário desconhecido'}</span>
                    <span className="text-gray-600 dark:text-gray-400">{fromCreation ? ' criou esta tarefa em ' : ' moveu esta tarefa '}</span>
                    {previousStatus && (
                      <>
                        <span className="font-medium text-gray-600 dark:text-gray-400">de </span>
                         <span className="font-semibold" style={{ color: previousStatus.color?.startsWith('#') ? previousStatus.color : '' }}>{previousStatus.label}</span>
                         <span className="font-medium text-gray-600 dark:text-gray-400"> para </span>
                      </>
                    )}
                    <span className="font-semibold" style={{ color: currentStatus?.color?.startsWith('#') ? currentStatus.color : '' }}>{currentStatus?.label || item.status}</span>
                  </p>
                  {fromCreation && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Acompanhamento identificado na leitura do WhatsApp.</p>}
                  {(fromContext || fromCommand) && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {fromContext ? 'Início identificado no relato pelo WhatsApp de' : 'Início informado no WhatsApp por'} {user?.full_name || 'responsável cadastrado'}.
                  </p>}
                  {assigneeNames && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Responsáveis: {assigneeNames}
                      </p>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {Number.isFinite(Date.parse(item.timestamp)) ? formatDistanceToNow(new Date(item.timestamp), { addSuffix: true, locale: ptBR }) : 'Data não registrada'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      );
    };

    export default TaskHistoryTab;
