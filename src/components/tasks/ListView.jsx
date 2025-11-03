import React from 'react';
    import { motion } from 'framer-motion';
    import { Edit, Trash2, Calendar, Folder, Users } from 'lucide-react';
    import { Button } from '@/components/ui/button';
    import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
    import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
    import { Badge } from '@/components/ui/badge';
    import { Card, CardHeader, CardContent } from "@/components/ui/card";

    const getTextColor = (hexcolor) => {
        if (!hexcolor) return '#000000';
        hexcolor = hexcolor.replace("#", "");
        const r = parseInt(hexcolor.substr(0, 2), 16);
        const g = parseInt(hexcolor.substr(2, 2), 16);
        const b = parseInt(hexcolor.substr(4, 2), 16);
        const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
        return (yiq >= 128) ? '#000000' : '#ffffff';
    };


    const ListView = ({ tasks, onOpenTask, onDelete, statusOptions, userRole, users, isMobile }) => {
      
      const getAssignees = (assigneeIds) => {
        if (!assigneeIds || assigneeIds.length === 0) return [];
        return assigneeIds.map(id => users.find(u => u.id === id)).filter(Boolean);
      };

      if (isMobile) {
        return (
            <div className="space-y-3 pb-20">
                {tasks.map(task => {
                    const statusInfo = statusOptions.find(s => s.value === task.status) || {};
                    const assignees = getAssignees(task.assignee_ids);
                    const textColor = getTextColor(statusInfo.color);

                    const statusBadge = (
                        <Badge
                            style={{ backgroundColor: statusInfo.color, color: textColor }}
                            className="whitespace-nowrap border-transparent"
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
                            <Card className="dark:bg-gray-800 dark:border-gray-700" onClick={() => onOpenTask(task)}>
                                <CardHeader className="flex flex-row items-start justify-between pb-2">
                                    <div className="space-y-1">
                                        <p className="font-semibold text-base dark:text-white">{task.title}</p>
                                        {statusBadge}
                                    </div>
                                    <div className="flex -space-x-2">
                                        {assignees.slice(0, 2).map(assignee => (
                                            <Avatar key={assignee.id} className="h-10 w-10 border-2 border-card">
                                                <AvatarImage src={assignee.avatar_url} />
                                                <AvatarFallback>{assignee.full_name ? assignee.full_name.slice(0, 2) : '?'}</AvatarFallback>
                                            </Avatar>
                                        ))}
                                        {assignees.length > 2 && <Avatar className="h-10 w-10 border-2 border-card"><AvatarFallback>+{assignees.length - 2}</AvatarFallback></Avatar>}
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-2 text-sm">
                                    <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                                        <Folder className="h-4 w-4" />
                                        <span>{task.clientes?.empresa || 'Sem cliente'}</span>
                                        {task.projetos?.name && <Badge variant="secondary">{task.projetos.name}</Badge>}
                                    </div>
                                    {task.due_date && (
                                        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                                          <Calendar className="h-4 w-4" />
                                          <span>Vence: {new Date(task.due_date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</span>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </motion.div>
                    );
                })}
            </div>
        );
      }

      return (
        <div className="space-y-3">
            {tasks.map(task => {
              const statusInfo = statusOptions.find(s => s.value === task.status) || {};
              const assignees = getAssignees(task.assignee_ids);
              
              const statusBadge = (
                <Badge 
                  style={{ backgroundColor: statusInfo.color, color: getTextColor(statusInfo.color) }} 
                  className="whitespace-nowrap border-transparent"
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
                    className="flex bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm items-center justify-between border-l-4"
                    style={{ borderColor: statusInfo.color || 'transparent' }}
                  >
                    <div className="flex items-center gap-4 flex-grow cursor-pointer" onClick={() => onOpenTask(task)}>
                       {statusBadge}
                       <div className="flex-grow">
                          <p className="font-medium dark:text-white">{task.title}</p>
                          <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 mt-1">
                            <span>{task.clientes?.empresa || 'Sem cliente'}</span>
                            {task.projetos?.name && <Badge variant="secondary">{task.projetos.name}</Badge>}
                            {task.due_date && <span>Vence: {new Date(task.due_date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</span>}
                          </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 ml-4">
                     <div className="flex items-center -space-x-2">
                        {assignees.length > 0 ? (
                          assignees.slice(0, 3).map(assignee => (
                              <Avatar key={assignee.id} className="h-8 w-8 border-2 border-white dark:border-gray-800">
                                  <AvatarImage src={assignee.avatar_url} />
                                  <AvatarFallback className="text-xs">{assignee.full_name ? assignee.full_name[0] : '?'}</AvatarFallback>
                              </Avatar>
                          ))
                        ) : (
                          <Avatar className="h-8 w-8 border-2 border-white dark:border-gray-800">
                              <AvatarFallback className="text-xs bg-gray-200 dark:bg-gray-700"><Users size={12}/></AvatarFallback>
                          </Avatar>
                        )}
                        {assignees.length > 3 && (
                             <Avatar className="h-8 w-8 border-2 border-white dark:border-gray-800">
                                <AvatarFallback className="text-xs">+{assignees.length - 3}</AvatarFallback>
                            </Avatar>
                        )}
                    </div>
                      {(userRole === 'superadmin' || userRole === 'admin') && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => onOpenTask(task)} className="dark:text-gray-300 dark:hover:bg-gray-700"><Edit className="h-4 w-4" /></Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:bg-gray-700"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
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