import React from 'react';
    import { motion } from 'framer-motion';
    import { Edit, Trash2, Calendar, Folder, Users } from 'lucide-react';
    import { Button } from '@/components/ui/button';
    import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
    import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
    import { Badge } from '@/components/ui/badge';
    import { Card, CardHeader } from "@/components/ui/card";
    import { getTaskDueState } from '@/lib/taskUrgency';
    import { getTaskClientName } from '@/lib/taskRelations';
    import { TaskDueLabel, TaskPriorityBadge } from '@/components/tasks/TaskUrgencyBadges';
    import TaskChannelBadges from '@/components/tasks/TaskChannelBadges';

    const getTextColor = (hexcolor) => {
        if (!hexcolor) return '#000000';
        hexcolor = hexcolor.replace("#", "");
        const r = parseInt(hexcolor.substr(0, 2), 16);
        const g = parseInt(hexcolor.substr(2, 2), 16);
        const b = parseInt(hexcolor.substr(4, 2), 16);
        const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
        return (yiq >= 128) ? '#000000' : '#ffffff';
    };


    const ListView = ({ tasks, onOpenTask, onDelete, statusOptions, userRole, users, isMobile, clients = [] }) => {
      
      const getAssignees = (assigneeIds) => {
        if (!assigneeIds || assigneeIds.length === 0) return [];
        return assigneeIds.map(id => users.find(u => u.id === id)).filter(Boolean);
      };

      if (isMobile) {
        return (
            <div className="space-y-2 pb-20">
                {tasks.map(task => {
                    const statusInfo = statusOptions.find(s => s.value === task.status) || {};
                    const assignees = getAssignees(task.assignee_ids);
                    const statusColor = statusInfo.color || '#6B7280'; // Fallback para cinza se não tiver cor
                    const textColor = getTextColor(statusColor);
                    const due = getTaskDueState(task, { statusOptions });

                    const statusBadge = (
                        <Badge
                            style={{ '--status-color': statusColor, backgroundColor: statusColor, color: textColor }}
                            className="tasks-status-badge whitespace-nowrap border-transparent text-xs"
                        >
                            {statusInfo.label || task.status}
                        </Badge>
                    );

                    return (
                        <motion.div
                            key={task.id}
                            layout
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                        >
                            <Card
                                className="tasks-list-card dark:bg-gray-800 dark:border-gray-700 cursor-pointer border-l-4"
                                style={{ borderLeftColor: due.color || undefined }}
                                onClick={() => onOpenTask(task)}
                            >
                                <CardHeader className="flex flex-row items-start justify-between p-3 pb-2">
                                    <div className="flex-1 min-w-0 space-y-1">
                                        <p className="font-semibold text-sm dark:text-white line-clamp-2">{task.title}</p>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {statusBadge}
                                            <TaskPriorityBadge priority={task.priority} />
                                            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                                                <Folder className="h-3 w-3" />
                                                <span className="truncate">{getTaskClientName(task, clients)}</span>
                                            </div>
                                            {task.projetos?.name && <Badge variant="secondary" className="text-xs">{task.projetos.name}</Badge>}
                                        </div>
                                        <TaskChannelBadges publications={task._channel_publications} compact />
                                        {due.label && (
                                            <div className="flex items-center gap-1.5 text-xs">
                                                <Calendar className="h-3 w-3" />
                                                <TaskDueLabel task={task} statusOptions={statusOptions} />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex -space-x-1.5 ml-2 flex-shrink-0">
                                        {assignees.slice(0, 2).map(assignee => (
                                            <Avatar key={assignee.id} className="h-7 w-7 border-2 border-card">
                                                <AvatarImage src={assignee.avatar_url} />
                                                <AvatarFallback className="text-xs">{assignee.full_name ? assignee.full_name.slice(0, 2) : '?'}</AvatarFallback>
                                            </Avatar>
                                        ))}
                                        {assignees.length > 2 && <Avatar className="h-7 w-7 border-2 border-card"><AvatarFallback className="text-xs">+{assignees.length - 2}</AvatarFallback></Avatar>}
                                    </div>
                                </CardHeader>
                            </Card>
                        </motion.div>
                    );
                })}
            </div>
        );
      }

      return (
        <div className="tasks-list-container space-y-2">
            {tasks.map(task => {
              const statusInfo = statusOptions.find(s => s.value === task.status) || {};
              const assignees = getAssignees(task.assignee_ids);
              const statusColor = statusInfo.color || '#6B7280'; // Fallback para cinza se não tiver cor
              const due = getTaskDueState(task, { statusOptions });
              
              const statusBadge = (
                <Badge 
                  style={{ '--status-color': statusColor, backgroundColor: statusColor, color: getTextColor(statusColor) }} 
                  className="tasks-status-badge whitespace-nowrap border-transparent text-xs"
                >
                  {statusInfo.label || task.status}
                </Badge>
              );

              return (
                <motion.div 
                  key={task.id} 
                  layout 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }} 
                >
                  <div 
                    className="tasks-list-row flex bg-white dark:bg-gray-800 p-3 rounded-lg shadow-sm items-center justify-between border border-l-4"
                    style={{
                      '--status-color': statusColor,
                      '--due-tone-color': due.color || statusColor,
                      borderLeftColor: due.color || statusColor || undefined,
                    }}
                  >
                    <div className="flex items-center gap-3 flex-grow cursor-pointer min-w-0" onClick={() => onOpenTask(task)}>
                       {statusBadge}
                       <div className="flex-grow min-w-0">
                          <p className="font-medium text-sm dark:text-white truncate">{task.title}</p>
                          <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex-wrap">
                            <span className="truncate">{getTaskClientName(task, clients)}</span>
                            {task.projetos?.name && <Badge variant="secondary" className="text-xs">{task.projetos.name}</Badge>}
                            <TaskPriorityBadge priority={task.priority} />
                            {due.label && (
                              <TaskDueLabel task={task} statusOptions={statusOptions} />
                            )}
                          </div>
                          <TaskChannelBadges publications={task._channel_publications} compact />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                     <div className="flex items-center -space-x-1.5">
                        {assignees.length > 0 ? (
                          assignees.slice(0, 3).map(assignee => (
                              <Avatar key={assignee.id} className="h-7 w-7 border-2 border-white dark:border-gray-800">
                                  <AvatarImage src={assignee.avatar_url} />
                                  <AvatarFallback className="text-xs">{assignee.full_name ? assignee.full_name[0] : '?'}</AvatarFallback>
                              </Avatar>
                          ))
                        ) : (
                          <Avatar className="h-7 w-7 border-2 border-white dark:border-gray-800">
                              <AvatarFallback className="text-xs bg-gray-200 dark:bg-gray-700"><Users size={10}/></AvatarFallback>
                          </Avatar>
                        )}
                        {assignees.length > 3 && (
                             <Avatar className="h-7 w-7 border-2 border-white dark:border-gray-800">
                                <AvatarFallback className="text-xs">+{assignees.length - 3}</AvatarFallback>
                            </Avatar>
                        )}
                    </div>
                      {(userRole === 'superadmin' || userRole === 'admin') && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => onOpenTask(task)} className="h-8 w-8 dark:text-gray-300 dark:hover:bg-gray-700"><Edit className="h-3.5 w-3.5" /></Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:bg-gray-700"><Trash2 className="h-3.5 w-3.5" /></Button></AlertDialogTrigger>
                            <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
                              <AlertDialogHeader><AlertDialogTitle className="dark:text-white">Confirmar exclusão</AlertDialogTitle><AlertDialogDescription className="dark:text-gray-400">Tem certeza que deseja excluir esta tarefa?</AlertDialogDescription></AlertDialogHeader>
                              <AlertDialogFooter><AlertDialogCancel className="dark:text-white dark:border-gray-600 dark:hover:bg-gray-700">Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => onDelete(task.id)} className="dark:bg-red-600 dark:hover:bg-red-700">Excluir</AlertDialogAction></AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
      );
    };

    export default ListView;
