import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useModuleSettings } from '@/contexts/ModuleSettingsContext';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { BarChart2, CheckCircle, Clock, ListTodo, AlertTriangle, GanttChartSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { format, isPast, isToday, differenceInDays } from 'date-fns';

const formatSecondsToHours = (totalSeconds) => {
    if (isNaN(totalSeconds) || totalSeconds < 0) return '0h 0m';
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
};

const TaskStatusBadge = ({ dueDate }) => {
    if (!dueDate) return null;
    const date = new Date(dueDate + 'T00:00:00');
    if (isPast(date) && !isToday(date)) {
        return <Badge variant="destructive">Vencida</Badge>;
    }
    const daysUntilDue = differenceInDays(date, new Date());
    if (daysUntilDue >= 0 && daysUntilDue <= 3) {
        return <Badge className="bg-yellow-500 text-white">Vence em {daysUntilDue}d</Badge>;
    }
    return null;
};

const PerformanceReport = () => {
    const [reportData, setReportData] = useState([]);
    const [statusOptions, setStatusOptions] = useState([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();
    const { profile } = useAuth();
    const { moduleAccess, loading: moduleLoading } = useModuleSettings();

    const reportAccess = useMemo(() => {
        if (profile?.role === 'superadmin') return 'all';
        return moduleAccess.reports || 'self';
    }, [profile, moduleAccess]);

    useEffect(() => {
        if (moduleLoading) return;

        const fetchReportData = async () => {
            setLoading(true);

            const { data: statuses, error: statusesError } = await supabase.from('task_statuses').select('*');
            if (statusesError) {
                toast({ title: 'Erro ao buscar status', description: statusesError.message, variant: 'destructive' });
            } else {
                setStatusOptions(statuses || []);
            }
            
            let usersQuery = supabase.from('profiles').select('id, full_name, avatar_url');

            if (reportAccess === 'self') {
                usersQuery = usersQuery.eq('id', profile.id);
            } else {
                usersQuery = usersQuery.in('role', ['colaborador', 'admin', 'superadmin']);
            }

            const { data: users, error: usersError } = await usersQuery;
            
            if (usersError) {
                toast({ title: 'Erro ao buscar usuários', description: usersError.message, variant: 'destructive' });
                setLoading(false);
                return;
            }

            const { data: tasks, error: tasksError } = await supabase
                .from('tarefas')
                .select('id, title, assignee_ids, time_logs, due_date, status');

            if (tasksError) {
                toast({ title: 'Erro ao buscar tarefas', description: tasksError.message, variant: 'destructive' });
                setLoading(false);
                return;
            }

            const userReports = users.map(user => {
                const userTasks = tasks.filter(task => task.assignee_ids?.includes(user.id));
                const taskCount = userTasks.length;
                
                const overdueTasks = userTasks.filter(t => t.due_date && isPast(new Date(t.due_date+'T00:00:00')) && !isToday(new Date(t.due_date+'T00:00:00'))).length;

                let totalTimeSeconds = 0;
                let tasksWithTime = 0;
                const timeByStatus = {};

                userTasks.forEach(task => {
                    let taskTime = 0;
                    if (task.time_logs) {
                        task.time_logs.forEach(log => {
                            if (log.start && log.end) {
                                const duration = (new Date(log.end).getTime() - new Date(log.start).getTime()) / 1000;
                                if(log.assignee_ids?.includes(user.id)) {
                                    totalTimeSeconds += duration;
                                    taskTime += duration;
                                    if(log.status) {
                                       timeByStatus[log.status] = (timeByStatus[log.status] || 0) + duration;
                                    }
                                }
                            }
                        });
                    }
                    if(taskTime > 0) tasksWithTime++;
                });

                const averageTimePerTask = tasksWithTime > 0 ? totalTimeSeconds / tasksWithTime : 0;

                return {
                    user,
                    taskCount,
                    overdueTasks,
                    tasks: userTasks,
                    totalTime: formatSecondsToHours(totalTimeSeconds),
                    averageTimePerTask: formatSecondsToHours(averageTimePerTask),
                    timeByStatus
                };
            });

            setReportData(userReports);
            setLoading(false);
        };

        fetchReportData();
    }, [toast, profile, reportAccess, moduleLoading]);

    if (loading || moduleLoading) {
        return (
            <div className="flex justify-center items-center h-full">
                <p className="text-lg dark:text-white">Gerando relatórios...</p>
            </div>
        );
    }
    
    return (
        <div className="space-y-8">
            <header>
                <h1 className="text-3xl font-bold text-gray-800 dark:text-white flex items-center">
                    <BarChart2 className="mr-3 h-8 w-8" />
                    Relatório de Desempenho
                </h1>
                <p className="text-muted-foreground dark:text-gray-400">Análise de produtividade dos colaboradores.</p>
            </header>
            
            <Accordion type="single" collapsible className="w-full space-y-6">
                 {reportData.map((data, index) => (
                    <motion.div
                        key={data.user.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                    >
                        <Card className="dark:bg-gray-800 dark:border-gray-700 overflow-hidden">
                            <AccordionItem value={data.user.id}>
                                <AccordionTrigger className="hover:no-underline px-6">
                                    <div className="flex items-center gap-4 w-full">
                                        <Avatar className="h-16 w-16">
                                            <AvatarImage src={data.user.avatar_url} alt={data.user.full_name} />
                                            <AvatarFallback>{data.user.full_name.charAt(0)}</AvatarFallback>
                                        </Avatar>
                                        <div className="flex-grow text-left">
                                            <CardTitle className="text-xl dark:text-white">{data.user.full_name}</CardTitle>
                                            <CardDescription className="dark:text-gray-400">Resumo de Atividades</CardDescription>
                                        </div>
                                    </div>
                                </AccordionTrigger>
                                
                                <CardContent className="space-y-4 -mt-4">
                                    <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                        <div className="flex items-center gap-3">
                                            <ListTodo className="h-5 w-5 text-blue-500" />
                                            <span className="font-medium text-sm dark:text-gray-300">Total de Tarefas</span>
                                        </div>
                                        <span className="font-bold text-lg text-blue-600 dark:text-blue-400">{data.taskCount}</span>
                                    </div>
                                    {data.overdueTasks > 0 && (
                                        <div className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/40 rounded-lg">
                                            <div className="flex items-center gap-3">
                                                <AlertTriangle className="h-5 w-5 text-red-500" />
                                                <span className="font-medium text-sm text-red-700 dark:text-red-300">Tarefas Vencidas</span>
                                            </div>
                                            <span className="font-bold text-lg text-red-600 dark:text-red-400">{data.overdueTasks}</span>
                                        </div>
                                    )}
                                    <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                        <div className="flex items-center gap-3">
                                            <Clock className="h-5 w-5 text-green-500" />
                                            <span className="font-medium text-sm dark:text-gray-300">Tempo Total de Trabalho</span>
                                        </div>
                                        <span className="font-bold text-lg text-green-600 dark:text-green-400">{data.totalTime}</span>
                                    </div>
                                    <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                        <div className="flex items-center gap-3">
                                            <CheckCircle className="h-5 w-5 text-purple-500" />
                                            <span className="font-medium text-sm dark:text-gray-300">Tempo Médio por Tarefa</span>
                                        </div>
                                        <span className="font-bold text-lg text-purple-600 dark:text-purple-400">{data.averageTimePerTask}</span>
                                    </div>
                                </CardContent>
                                <AnimatePresence>
                                <AccordionContent>
                                    <div className="px-6 pb-6 space-y-6">
                                        <div className="space-y-4">
                                            <h3 className="font-semibold text-lg flex items-center dark:text-white"><GanttChartSquare className="mr-2 h-5 w-5"/> Tempo por Status</h3>
                                            {Object.keys(data.timeByStatus).length > 0 ? (
                                                <div className="space-y-2">
                                                    {Object.entries(data.timeByStatus).map(([statusKey, time]) => {
                                                        const statusInfo = statusOptions.find(s => s.value === statusKey);
                                                        return (
                                                            <div key={statusKey} className="flex justify-between items-center text-sm p-2 bg-gray-50 dark:bg-gray-700/50 rounded-md">
                                                                <span className="font-medium dark:text-gray-300 flex items-center">
                                                                    {statusInfo && <div className={`w-3 h-3 rounded-full mr-2 ${statusInfo.color}`}></div>}
                                                                    {statusInfo?.label || statusKey}
                                                                </span>
                                                                <span className="font-bold dark:text-white">{formatSecondsToHours(time)}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : <p className="text-sm text-gray-500 dark:text-gray-400">Nenhum tempo registrado.</p>}
                                        </div>
                                        <div className="space-y-4">
                                            <h3 className="font-semibold text-lg flex items-center dark:text-white"><ListTodo className="mr-2 h-5 w-5"/> Lista de Tarefas</h3>
                                            {data.tasks.length > 0 ? (
                                                <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                                                    {data.tasks.map(task => (
                                                        <div key={task.id} className="flex justify-between items-center text-sm p-2 bg-gray-50 dark:bg-gray-700/50 rounded-md">
                                                            <span className="font-medium dark:text-gray-300">{task.title}</span>
                                                            <TaskStatusBadge dueDate={task.due_date} />
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : <p className="text-sm text-gray-500 dark:text-gray-400">Nenhuma tarefa atribuída.</p>}
                                        </div>
                                    </div>
                                </AccordionContent>
                                </AnimatePresence>
                            </AccordionItem>
                        </Card>
                    </motion.div>
                ))}
            </Accordion>
        </div>
    );
};

export default PerformanceReport;