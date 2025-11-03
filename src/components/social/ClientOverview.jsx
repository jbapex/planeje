import React from 'react';
    import { motion } from 'framer-motion';
    import { useNavigate } from 'react-router-dom';
    import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
    import { Badge } from '@/components/ui/badge';
    import { FolderKanban } from 'lucide-react';

    const ClientOverview = ({ selectedClientId, projects, tasks, clients }) => {
      const navigate = useNavigate();

      const getProjectTaskSummary = (projectId) => {
        const projectTasks = tasks.filter(t => t.project_id === projectId);
        const summary = {
          todo: projectTasks.filter(t => ['todo', 'production'].includes(t.status)).length,
          inProgress: projectTasks.filter(t => ['review', 'approve', 'scheduled'].includes(t.status)).length,
          done: projectTasks.filter(t => ['published', 'completed'].includes(t.status)).length,
          total: projectTasks.length,
        };
        summary.progress = summary.total > 0 ? Math.round((summary.done / summary.total) * 100) : 0;
        return summary;
      };

      const statusOptions = [
        { value: 'planejamento', label: 'Planejamento', color: 'bg-blue-500' },
        { value: 'execucao', label: 'Execução', color: 'bg-yellow-500' },
        { value: 'concluido', label: 'Concluído', color: 'bg-green-500' },
        { value: 'pausado', label: 'Pausado', color: 'bg-gray-500' },
      ];

      const renderProjectsForClient = (client) => {
        const clientProjects = projects.filter(p => p.client_id === client.id);

        if (clientProjects.length === 0) {
          return (
            <div className="text-center py-6 bg-white dark:bg-gray-800/50 rounded-lg shadow-sm mt-4">
              <FolderKanban className="mx-auto text-gray-400 dark:text-gray-500 mb-2" size={32} />
              <h4 className="text-md font-semibold text-gray-600 dark:text-gray-300">Nenhum Projeto Encontrado</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400">Este cliente ainda não possui projetos.</p>
            </div>
          );
        }

        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-4">
            {clientProjects.map(project => {
              const summary = getProjectTaskSummary(project.id);
              const statusInfo = statusOptions.find(s => s.value === project.status) || { label: project.status, color: 'bg-gray-400' };
              return (
                <motion.div key={project.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <Card 
                    className="h-full flex flex-col dark:bg-gray-800 dark:border-gray-700 cursor-pointer hover:border-blue-500 dark:hover:border-blue-500 transition-colors"
                    onClick={() => navigate(`/projects/${project.id}`)}
                  >
                    <CardHeader>
                      <CardTitle className="flex justify-between items-start">
                        <span className="dark:text-white">{project.name}</span>
                        <Badge className={`${statusInfo.color} text-white`}>{statusInfo.label}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-grow flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm text-gray-500 dark:text-gray-400">Progresso</span>
                          <span className="text-sm font-semibold dark:text-white">{summary.progress}%</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                          <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${summary.progress}%` }}></div>
                        </div>
                      </div>
                      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex justify-around text-center">
                        <div>
                          <p className="font-bold text-lg dark:text-white">{summary.todo}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">A Fazer</p>
                        </div>
                        <div>
                          <p className="font-bold text-lg dark:text-white">{summary.inProgress}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Em Andamento</p>
                        </div>
                        <div>
                          <p className="font-bold text-lg dark:text-white">{summary.done}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Concluído</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        );
      };

      const clientsToRender = selectedClientId === 'all' 
        ? clients 
        : clients.filter(c => c.id === selectedClientId);

      return (
        <div className="space-y-8">
          {clientsToRender.map(client => (
            <div key={client.id}>
              <h2 className="text-2xl font-bold text-gray-800 dark:text-white border-b-2 border-blue-500 pb-2 mb-4">
                {client.empresa}
              </h2>
              {renderProjectsForClient(client)}
            </div>
          ))}
        </div>
      );
    };

    export default ClientOverview;