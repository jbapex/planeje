import React from 'react';
import { motion } from 'framer-motion';
import { Target, DollarSign, Calendar, AlertTriangle, List, CheckCircle, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from 'date-fns';

const DonutChart = ({ percentage, color }) => {
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative w-32 h-32 md:w-36 md:h-36">
      <svg className="w-full h-full" viewBox="0 0 120 120">
        <circle
          className="text-gray-200 dark:text-gray-700"
          strokeWidth="10"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx="60"
          cy="60"
        />
        <motion.circle
          className={color}
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx="60"
          cy="60"
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1, ease: "easeInOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-white">{percentage}%</span>
      </div>
    </div>
  );
};

const BarChart = ({ data }) => {
  const maxValue = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="space-y-4">
      {data.map((item, index) => (
        <div key={index} className="grid grid-cols-4 gap-2 items-center">
          <div className="text-xs font-medium text-muted-foreground col-span-1 truncate">{item.label}</div>
          <div className="col-span-3 flex items-center gap-2">
            <motion.div 
              className="h-2 rounded-full"
              style={{ background: item.color }}
              initial={{ width: 0 }}
              animate={{ width: `${(item.value / maxValue) * 100}%`}}
              transition={{ duration: 0.5, delay: 0.2 * index }}
            />
            <span className="text-sm font-semibold text-foreground">{item.value}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

const InfoItem = ({ icon: Icon, label, value, colorClass = "text-gray-500 dark:text-gray-400" }) => (
  <div className="flex items-start gap-4">
    <div className={`mt-1 flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100 dark:bg-gray-700 ${colorClass}`}>
      <Icon className="w-5 h-5" />
    </div>
    <div className="flex-1 min-w-0"> {/* Added flex-1 min-w-0 */}
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-base font-semibold text-foreground dark:text-white break-words">{value || '-'}</p> {/* Changed truncate to break-words */}
    </div>
  </div>
);


const ProjectReport = ({ project, tasks, campaignPlan }) => {
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => ['published', 'concluido'].includes(t.status)).length;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  
  const statusCounts = tasks.reduce((acc, task) => {
    const status = task.status || 'sem_status';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  const statusDataForChart = Object.entries(statusCounts).map(([status, count]) => {
    // This part should be ideally linked to a central status config
    const statusInfo = {
        'todo': { label: 'A Fazer', color: '#9CA3AF' }, // Gray
        'doing': { label: 'Em Andamento', color: '#3B82F6' }, // Blue
        'em_revisao': { label: 'Em Revisão', color: '#F97316' }, // Orange
        'published': { label: 'Publicado', color: '#10B981' }, // Green
        'concluido': { label: 'Concluído', color: '#10B981' }, // Green
        'sem_status': { label: 'Sem Status', color: '#6B7280' },
    };
    return {
        label: statusInfo[status]?.label || status,
        value: count,
        color: statusInfo[status]?.color || '#6B7280'
    };
  });

  const pendingList = tasks.filter(t => !['published', 'concluido'].includes(t.status));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="dark:text-white">Informações Chave</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InfoItem icon={Target} label="Objetivo Principal" value={campaignPlan?.objetivo} colorClass="text-blue-500 dark:text-blue-400" />
            <InfoItem icon={DollarSign} label="Orçamento para Tráfego" value={campaignPlan?.trafego_pago?.orcamento ? `R$ ${parseFloat(campaignPlan.trafego_pago.orcamento).toLocaleString('pt-BR')}` : '-'} colorClass="text-green-500 dark:text-green-400" />
            <InfoItem icon={Calendar} label="Mês de Referência" value={project.mes_referencia ? format(parseISO(project.mes_referencia), 'MMMM yyyy') : '-'} colorClass="text-purple-500 dark:text-purple-400"/>
            <InfoItem icon={AlertTriangle} label="Status da Campanha" value={project.status} colorClass="text-yellow-500 dark:text-yellow-400"/>
          </CardContent>
        </Card>
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="dark:text-white">Distribuição de Tarefas</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart data={statusDataForChart} />
          </CardContent>
        </Card>
      </div>
      <div className="space-y-6">
        <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="dark:text-white">Progresso Geral</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
                <DonutChart percentage={completionRate} color="text-blue-500" />
                <div className="text-center">
                    <p className="text-xl font-bold dark:text-white">{completedTasks} / {totalTasks}</p>
                    <p className="text-sm text-muted-foreground">tarefas concluídas</p>
                </div>
            </CardContent>
        </Card>
        <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
                <CardTitle className="dark:text-white">Lista de Pendências</CardTitle>
                <CardDescription>{pendingList.length} tarefa(s) pendente(s)</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="max-h-64 overflow-y-auto space-y-3 pr-2">
                {pendingList.length > 0 ? pendingList.map(task => (
                    <div key={task.id} className="p-3 border dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900/50">
                    <p className="font-medium text-sm text-foreground dark:text-gray-200 truncate">{task.title}</p>
                    <div className="flex items-center justify-between mt-2 text-xs">
                        <Badge variant="secondary" className="capitalize">{task.status}</Badge>
                        {task.due_date ? (
                            <span className="flex items-center gap-1 text-muted-foreground dark:text-gray-400">
                                <Clock className="w-3 h-3"/>
                                {format(parseISO(task.due_date), 'dd/MM/yyyy')}
                            </span>
                        ) : null}
                    </div>
                    </div>
                )) : (
                     <div className="flex flex-col items-center justify-center text-center py-8">
                        <CheckCircle className="w-12 h-12 text-green-500 mb-2"/>
                        <p className="font-semibold dark:text-white">Tudo em dia!</p>
                        <p className="text-sm text-muted-foreground">Nenhuma tarefa pendente.</p>
                    </div>
                )}
                </div>
            </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ProjectReport;