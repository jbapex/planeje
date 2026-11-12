import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import {
  Lightbulb,
  Bell,
  CheckSquare,
  AlertTriangle,
  Clock,
  Calendar,
  ListChecks,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import WorkspacePageHeader from '@/components/layout/WorkspacePageHeader';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import '@/components/dashboard/Dashboard.css';
import {
  format,
  startOfWeek,
  endOfWeek,
  isWithinInterval,
  addDays,
  differenceInCalendarDays,
  startOfDay,
  endOfDay,
  parseISO,
  isBefore,
  isSameDay,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useDataCache } from '@/hooks/useDataCache';
import { taskCountsInOverdueAndUpcomingPipeline } from '@/lib/dashboardPipelineStatus';
import { getAgencyPulseMessage } from '@/lib/accountPulse';
import { useAgencyPulse } from '@/hooks/useAgencyPulse';
import AgencyPulseBoard from '@/components/dashboard/AgencyPulseBoard';
import DashboardAssistant from './DashboardAssistant';

/** Dia de vencimento no calendário local (evita “atrasada/hoje” errado por UTC). */
function getDueDayStart(dueDateRaw) {
  if (dueDateRaw == null || dueDateRaw === '') return null;
  const s = String(dueDateRaw).trim();
  const datePart = s.length >= 10 ? s.slice(0, 10) : s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    return startOfDay(parseISO(datePart));
  }
  return startOfDay(new Date(dueDateRaw));
}

function getHeroMessage(stats) {
  if (stats.overdue > 0) {
    return `Você tem ${stats.overdue} tarefa${stats.overdue > 1 ? 's' : ''} atrasada${stats.overdue > 1 ? 's' : ''}. Priorize o que está pendente e mantenha o time alinhado.`;
  }
  if (stats.today > 0) {
    return `${stats.today} entrega${stats.today > 1 ? 's' : ''} para hoje. Foque no essencial e use o assistente para organizar o dia.`;
  }
  return 'Operação estável. Use o painel para antecipar demandas e acompanhar o que vem pela frente.';
}

function DashboardLoading() {
  return (
    <div className="planeje-dashboard-loading">
      <div className="planeje-dashboard-skeleton planeje-dashboard-skeleton--hero" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="planeje-dashboard-skeleton planeje-dashboard-skeleton--stat" />
        ))}
      </div>
    </div>
  );
}

const StatCard = ({ icon: Icon, title, value, subtitle, tone, onClick }) => (
  <motion.button
    type="button"
    className={`planeje-dashboard-stat planeje-dashboard-stat--${tone}`}
    onClick={onClick}
    whileHover={{ y: -3 }}
    whileTap={{ scale: 0.98 }}
  >
    <div className="planeje-dashboard-stat-top">
      <div>
        <p className="planeje-dashboard-stat-label">{title}</p>
        <p className="planeje-dashboard-stat-value">{value}</p>
        <p className="planeje-dashboard-stat-sub">{subtitle}</p>
      </div>
      <div className="planeje-dashboard-stat-icon">
        <Icon className="w-5 h-5" />
      </div>
    </div>
  </motion.button>
);

const SugestaoItem = ({ task, clientName }) => (
  <div className="planeje-dashboard-item planeje-dashboard-item--suggestion">
    <div className="planeje-dashboard-item-badge planeje-dashboard-item-badge--suggestion">
      <Lightbulb className="w-3.5 h-3.5" />
    </div>
    <div className="min-w-0">
      <p className="planeje-dashboard-item-title">{task.title}</p>
      <p className="planeje-dashboard-item-meta">
        {clientName} · <span className="capitalize">{task.status}</span>
      </p>
    </div>
  </div>
);

const AlertaItem = ({ icon: Icon, text, subtext }) => (
  <div className="planeje-dashboard-item planeje-dashboard-item--alert">
    <div className="planeje-dashboard-item-badge planeje-dashboard-item-badge--alert">
      <Icon className="w-3.5 h-3.5" />
    </div>
    <div className="min-w-0">
      <p className="planeje-dashboard-item-title">{text}</p>
      <p className="planeje-dashboard-item-meta">{subtext}</p>
    </div>
  </div>
);

const EmptyState = ({ icon: Icon, title, message }) => (
  <div className="planeje-dashboard-empty">
    <div className="planeje-dashboard-empty-icon">
      <Icon className="w-6 h-6" />
    </div>
    <h4>{title}</h4>
    <p>{message}</p>
  </div>
);

const Dashboard = () => {
  const {
    user,
    profile
  } = useAuth();
  const {
    toast
  } = useToast();
  const [stats, setStats] = useState({
    executed: 0,
    overdue: 0,
    today: 0,
    upcoming: 0
  });
  const [suggestions, setSuggestions] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [overdueTasksList, setOverdueTasksList] = useState([]);
  const [todayTasksList, setTodayTasksList] = useState([]);
  const [upcomingTasksList, setUpcomingTasksList] = useState([]);
  const [executedTasksList, setExecutedTasksList] = useState([]);
  const [selectedTaskType, setSelectedTaskType] = useState(null);
  const [showTasksModal, setShowTasksModal] = useState(false);
  const today = new Date();
  const formattedDate = format(today, "EEEE, d 'de' MMMM", {
    locale: ptBR
  });
  
  // Hook de cache para prevenir re-fetch desnecessário
  const cacheKey = `dashboard_${user?.id}_${profile?.role}`;
  const { data: cachedData, setCachedData, shouldFetch, clearCache } = useDataCache(cacheKey);
  
  // Ref para controlar se já fez o fetch inicial (evita re-fetch ao voltar para aba)
  const hasFetchedRef = useRef(false);
  const [dashboardConfig, setDashboardConfig] = useState(null);
  
  // Carrega configuração do dashboard
  useEffect(() => {
    const loadDashboardConfig = async () => {
      try {
        const { data, error } = await supabase
          .from('public_config')
          .select('key, value')
          .eq('key', 'dashboard_status_config')
          .maybeSingle();
        
        if (error) throw error;
        
        if (data?.value) {
          const parsed = JSON.parse(data.value);
          setDashboardConfig({
            executed: parsed.executed ?? ['published'],
            overdueExclude: parsed.overdueExclude ?? ['published', 'scheduled', 'concluido'],
            overdueInclude: Array.isArray(parsed.overdueInclude) ? parsed.overdueInclude : [],
            today: parsed.today ?? [],
            upcoming: parsed.upcoming ?? [],
          });
        } else {
          setDashboardConfig({
            executed: ['published'],
            overdueExclude: ['published', 'scheduled', 'concluido'],
            overdueInclude: [],
            today: [],
            upcoming: [],
          });
        }
      } catch (e) {
        console.warn('Erro ao carregar configuração do dashboard:', e);
        setDashboardConfig({
          executed: ['published'],
          overdueExclude: ['published', 'scheduled', 'concluido'],
          overdueInclude: [],
          today: [],
          upcoming: [],
        });
      }
    };
    
    loadDashboardConfig();
  }, []);
  
  const applyDashboardFromCache = useCallback((data) => {
    if (!data) return;
    setStats(data.stats ?? { executed: 0, overdue: 0, today: 0, upcoming: 0 });
    setSuggestions(data.suggestions ?? []);
    setAlerts(data.alerts ?? []);
    setExecutedTasksList(data.executedTasksList ?? []);
    setOverdueTasksList(data.overdueTasksList ?? []);
    setTodayTasksList(data.todayTasksList ?? []);
    setUpcomingTasksList(data.upcomingTasksList ?? []);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      if (!user || !dashboardConfig) return;

      const anchor = new Date();
      const dayStart = startOfDay(anchor);
      const todayKey = format(dayStart, 'yyyy-MM-dd');

      const cacheDayOk =
        cachedData &&
        !shouldFetch() &&
        cachedData.fetchedForDay === todayKey &&
        Array.isArray(cachedData.overdueTasksList);

      if (cacheDayOk) {
        applyDashboardFromCache(cachedData);
        setLoading(false);
        return;
      }

      setLoading(true);
      let tasksQuery = supabase.from('tarefas').select('*, clientes(empresa)');
      let requestsQuery = supabase.from('solicitacoes').select('*, clientes(empresa)');
      if (profile?.role === 'colaborador') {
        tasksQuery = tasksQuery.contains('assignee_ids', [user.id]);
        requestsQuery = requestsQuery.eq('owner_id', user.id);
      }
      const {
        data: tasks,
        error: tasksError
      } = await tasksQuery;
      const {
        data: requests,
        error: requestsError
      } = await requestsQuery;
      const {
        data: clients,
        error: clientsError
      } = await supabase.from('clientes').select('id, empresa');
      if (tasksError || requestsError || clientsError) {
        toast({
          title: "Erro ao carregar dados do dashboard",
          variant: "destructive"
        });
        setLoading(false);
        return;
      }
      const startOfThisWeek = startOfWeek(anchor, {
        weekStartsOn: 1
      });
      const endOfThisWeek = endOfWeek(anchor, {
        weekStartsOn: 1
      });
      const upcomingEnd = endOfDay(addDays(anchor, 7));
      const tomorrowStart = startOfDay(addDays(anchor, 1));
      
      // Usa configuração do dashboard
      const executedStatuses = dashboardConfig.executed || ['published'];
      const todayStatuses = dashboardConfig.today || []; // Vazio = todos
      const upcomingStatuses = dashboardConfig.upcoming || []; // Vazio = todos
      
      const executedTasks = tasks.filter(t => {
        const dueDay = getDueDayStart(t.due_date);
        if (!dueDay) return false;
        if (!executedStatuses.includes(t.status)) return false;
        return isWithinInterval(dueDay, {
          start: startOfThisWeek,
          end: endOfThisWeek
        });
      });
      const executed = executedTasks.length;
      setExecutedTasksList(executedTasks);
      
      const overdueTasks = tasks.filter(t => {
        const dueDay = getDueDayStart(t.due_date);
        if (!dueDay) return false;
        if (!taskCountsInOverdueAndUpcomingPipeline(t.status, dashboardConfig)) return false;
        return isBefore(dueDay, dayStart);
      });
      const overdue = overdueTasks.length;
      setOverdueTasksList(overdueTasks);
      
      const todayTasksFiltered = tasks.filter(t => {
        const dueDay = getDueDayStart(t.due_date);
        if (!dueDay) return false;
        if (todayStatuses.length > 0 && !todayStatuses.includes(t.status)) return false;
        return isSameDay(dueDay, anchor);
      });
      const todayTasks = todayTasksFiltered.length;
      setTodayTasksList(todayTasksFiltered);
      
      const upcomingTasks = tasks.filter(t => {
        const dueDay = getDueDayStart(t.due_date);
        if (!dueDay) return false;
        if (!taskCountsInOverdueAndUpcomingPipeline(t.status, dashboardConfig)) return false;
        if (upcomingStatuses.length > 0 && !upcomingStatuses.includes(t.status)) return false;
        return isWithinInterval(dueDay, {
          start: tomorrowStart,
          end: upcomingEnd
        });
      });
      const upcoming = upcomingTasks.length;
      setUpcomingTasksList(upcomingTasks);
      setStats({
        executed,
        overdue,
        today: todayTasks,
        upcoming
      });
      const activeTasks = tasks.filter((t) =>
        taskCountsInOverdueAndUpcomingPipeline(t.status, dashboardConfig)
      );
      const scoredTasks = activeTasks.map(task => {
        let score = 0;
        const dueDay = getDueDayStart(task.due_date);
        if (dueDay) {
          if (isBefore(dueDay, dayStart)) score += 10;
          const daysToDue = differenceInCalendarDays(dueDay, dayStart);
          if (daysToDue >= 0 && daysToDue <= 3) score += 5;
        }
        if (['em_revisao', 'pendente', 'bloqueado'].includes(task.status)) score += 3;
        if (task.priority === 'alta') score += 4;
        if (task.priority === 'media') score += 2;
        return {
          ...task,
          score
        };
      }).filter(t => t.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
      setSuggestions(scoredTasks);
      const newAlerts = [];
      if (profile?.role !== 'colaborador') {
        clients.forEach(client => {
          const windowEnd = endOfDay(addDays(anchor, 3));
          const hasFuturePosts = tasks.some(
            (t) =>
              t.client_id === client.id &&
              getDueDayStart(t.due_date) &&
              isWithinInterval(getDueDayStart(t.due_date), {
                start: dayStart,
                end: windowEnd
              })
          );
          if (!hasFuturePosts) {
            newAlerts.push({
              type: 'no_posts',
              text: client.empresa,
              subtext: 'Sem posts futuros nos próximos 3 dias'
            });
          }
        });
        requests.forEach(req => {
          if (req.prazo && ['aberta', 'em_andamento'].includes(req.status)) {
            const slaDate = new Date(req.prazo);
            if (isWithinInterval(slaDate, {
              start: dayStart,
              end: endOfDay(addDays(anchor, 3))
            })) {
              newAlerts.push({
                type: 'sla',
                text: req.title,
                subtext: `Prazo: ${format(slaDate, 'dd/MM')}`
              });
            }
          }
        });
      }
      tasks.forEach((task) => {
        const dueDay = getDueDayStart(task.due_date);
        if (
          dueDay &&
          isBefore(dueDay, dayStart) &&
          taskCountsInOverdueAndUpcomingPipeline(task.status, dashboardConfig)
        ) {
          newAlerts.push({
            type: 'overdue_task',
            text: task.title,
            subtext: `Tarefa atrasada (${task.clientes?.empresa || 'N/A'})`,
          });
        }
      });
      setAlerts(newAlerts.slice(0, 5));
      
      setCachedData({
        fetchedForDay: todayKey,
        stats: {
          executed,
          overdue,
          today: todayTasks,
          upcoming
        },
        suggestions: scoredTasks,
        alerts: newAlerts.slice(0, 5),
        executedTasksList: executedTasks,
        overdueTasksList: overdueTasks,
        todayTasksList: todayTasksFiltered,
        upcomingTasksList: upcomingTasks,
      });
      
      setLoading(false);
    };
    
    const dayKeyNow = format(startOfDay(new Date()), 'yyyy-MM-dd');
    let cacheInvalidatedForDayChange = false;
    if (cachedData?.fetchedForDay && cachedData.fetchedForDay !== dayKeyNow) {
      clearCache();
      hasFetchedRef.current = false;
      cacheInvalidatedForDayChange = true;
    }

    if (!user || !dashboardConfig) return;

    const cacheUsable =
      !cacheInvalidatedForDayChange &&
      cachedData &&
      !shouldFetch() &&
      cachedData.fetchedForDay === dayKeyNow &&
      Array.isArray(cachedData.overdueTasksList);

    if (hasFetchedRef.current) {
      if (cacheUsable) {
        applyDashboardFromCache(cachedData);
        setLoading(false);
      }
      return;
    }

    if (cacheUsable) {
      applyDashboardFromCache(cachedData);
      setLoading(false);
      hasFetchedRef.current = true;
      return;
    }

    if (dashboardConfig) {
      hasFetchedRef.current = true;
      fetchData();
    }
  }, [user, profile, dashboardConfig, cachedData, shouldFetch, clearCache, applyDashboardFromCache]);
  
  const firstName = (profile?.full_name || 'Usuário').split(' ')[0];
  const pulse = useAgencyPulse();
  const pulseReady = !pulse.loading;
  const heroMessage = useMemo(
    () => (pulseReady ? getAgencyPulseMessage(pulse.summary) : getHeroMessage(stats)),
    [pulseReady, pulse.summary, stats]
  );

  const handleOpenTasksModal = (type) => {
    setSelectedTaskType(type);
    setShowTasksModal(true);
  };

  const getTasksForType = (type) => {
    switch(type) {
      case 'executadas':
        return executedTasksList;
      case 'atrasadas':
        return overdueTasksList;
      case 'hoje':
        return todayTasksList;
      case 'proximas':
        return upcomingTasksList;
      default:
        return [];
    }
  };

  const getTitleForType = (type) => {
    switch(type) {
      case 'executadas':
        return 'Tarefas Executadas (Esta Semana)';
      case 'atrasadas':
        return 'Tarefas Atrasadas';
      case 'hoje':
        return 'Tarefas para Hoje';
      case 'proximas':
        return 'Próximas Tarefas (7 dias)';
      default:
        return 'Tarefas';
    }
  };

  const statCardsData = [{
    title: 'Executadas',
    value: stats.executed,
    subtitle: 'Esta semana',
    icon: CheckSquare,
    tone: 'executed',
    type: 'executadas'
  }, {
    title: 'Atrasadas',
    value: stats.overdue,
    subtitle: 'Requer atenção',
    icon: AlertTriangle,
    tone: 'overdue',
    type: 'atrasadas'
  }, {
    title: 'Hoje',
    value: stats.today,
    subtitle: 'Para postar',
    icon: Clock,
    tone: 'today',
    type: 'hoje'
  }, {
    title: 'Próximas',
    value: stats.upcoming,
    subtitle: '7 dias',
    icon: Calendar,
    tone: 'upcoming',
    type: 'proximas'
  }];

  if (loading && !cachedData) {
    return (
      <>
        <Helmet>
          <title>Início — Planeje</title>
        </Helmet>
        <DashboardLoading />
      </>
    );
  }

  return (
    <div className="planeje-dashboard">
      <Helmet>
        <title>Início — Planeje</title>
      </Helmet>

      <WorkspacePageHeader
        title={`Olá, ${firstName}!`}
        description={formattedDate}
      />
      <p className="planeje-dashboard-lead">{heroMessage}</p>

      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.06 }}
      >
        <AgencyPulseBoard
          loading={pulse.loading}
          error={pulse.error}
          summary={pulse.summary}
          refresh={pulse.refresh}
        />
      </motion.section>

      <motion.section
        className="planeje-dashboard-stats"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.08 }}
      >
        {statCardsData.map((stat) => (
          <StatCard
            key={stat.title}
            {...stat}
            onClick={() => handleOpenTasksModal(stat.type)}
          />
        ))}
      </motion.section>

      <div className="planeje-dashboard-main">
        <motion.div
          className="planeje-dashboard-assistant-wrap"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.12 }}
        >
          <DashboardAssistant
            overdueTasks={overdueTasksList}
            todayTasks={todayTasksList}
            upcomingTasks={upcomingTasksList}
            alerts={alerts}
            suggestions={suggestions}
            stats={stats}
          />
        </motion.div>

        <motion.div
          className="planeje-dashboard-panels"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.16 }}
        >
          <div className="planeje-dashboard-panel">
            <div className="planeje-dashboard-panel-header">
              <div className="planeje-dashboard-panel-icon planeje-dashboard-panel-icon--suggestions">
                <Lightbulb className="w-4 h-4" />
              </div>
              <h2 className="planeje-dashboard-panel-title">Sugestões de prioridade</h2>
            </div>
            <div className="planeje-dashboard-panel-body">
              {loading ? (
                <p className="text-sm text-slate-500">Analisando tarefas…</p>
              ) : suggestions.length > 0 ? (
                suggestions.map((task) => (
                  <SugestaoItem
                    key={task.id}
                    task={task}
                    clientName={task.clientes?.empresa || 'N/A'}
                  />
                ))
              ) : (
                <EmptyState
                  icon={ListChecks}
                  title="Tudo tranquilo!"
                  message="Nenhuma tarefa crítica no momento."
                />
              )}
            </div>
          </div>

          <div className="planeje-dashboard-panel">
            <div className="planeje-dashboard-panel-header">
              <div className="planeje-dashboard-panel-icon planeje-dashboard-panel-icon--alerts">
                <Bell className="w-4 h-4" />
              </div>
              <h2 className="planeje-dashboard-panel-title">Alertas proativos</h2>
            </div>
            <div className="planeje-dashboard-panel-body">
              {loading ? (
                <p className="text-sm text-slate-500">Verificando alertas…</p>
              ) : alerts.length > 0 ? (
                alerts.map((alert, index) => (
                  <AlertaItem
                    key={index}
                    icon={AlertTriangle}
                    text={alert.text}
                    subtext={alert.subtext}
                  />
                ))
              ) : (
                <EmptyState
                  icon={Bell}
                  title="Tudo em ordem!"
                  message="Nenhum alerta no momento."
                />
              )}
            </div>
          </div>
        </motion.div>
      </div>

      <Dialog open={showTasksModal} onOpenChange={setShowTasksModal}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedTaskType && (
                <>
                  {statCardsData.find(s => s.type === selectedTaskType)?.icon && (
                    React.createElement(statCardsData.find(s => s.type === selectedTaskType).icon, {
                      className: 'w-5 h-5 text-slate-600'
                    })
                  )}
                  {getTitleForType(selectedTaskType)}
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-3">
              {selectedTaskType && getTasksForType(selectedTaskType).length > 0 ? (
                getTasksForType(selectedTaskType).map((task) => {
                  const dueDayModal = getDueDayStart(task.due_date);
                  const daysLate =
                    dueDayModal && selectedTaskType === 'atrasadas'
                      ? differenceInCalendarDays(startOfDay(new Date()), dueDayModal)
                      : null;
                  const dueDate = task.due_date 
                    ? format(new Date(task.due_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                    : 'Sem data';
                  
                  return (
                    <Card key={task.id} className="p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900 dark:text-white mb-1">
                            {task.title}
                          </h4>
                          <div className="flex flex-wrap gap-2 text-sm text-gray-600 dark:text-gray-400">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              {dueDate}
                            </span>
                            {task.clientes?.empresa && (
                              <span className="flex items-center gap-1">
                                <span>•</span>
                                Cliente: {task.clientes.empresa}
                              </span>
                            )}
                            {task.priority && (
                              <span className={`px-2 py-0.5 rounded text-xs ${
                                task.priority === 'alta' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                                task.priority === 'media' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                                'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                              }`}>
                                Prioridade: {task.priority}
                              </span>
                            )}
                            <span className={`px-2 py-0.5 rounded text-xs capitalize ${
                              task.status === 'published' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                              task.status === 'em_revisao' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                              task.status === 'pendente' ? 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400' :
                              'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                            }`}>
                              {task.status}
                            </span>
                            {daysLate !== null && daysLate > 0 && (
                              <span className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                                {daysLate} dia{daysLate > 1 ? 's' : ''} atrasado{daysLate > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })
              ) : (
                <div className="text-center py-10">
                  <ListChecks className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-gray-600 dark:text-gray-400">
                    Nenhuma tarefa encontrada nesta categoria.
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};
export default Dashboard;
