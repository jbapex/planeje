import React, { useState, useEffect, useRef } from 'react';
import { Lightbulb, Bell, CheckSquare, AlertTriangle, Clock, Calendar, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { format, startOfWeek, endOfWeek, isPast, isToday, isWithinInterval, addDays, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useDataCache } from '@/hooks/useDataCache';
const StatCard = ({
  icon: Icon,
  title,
  value,
  subtitle,
  color,
  delay,
  isFirstMount = true
}) => <div className="bg-card dark:bg-gray-800 p-4 md:p-6 rounded-xl shadow-sm border dark:border-gray-700">
    <div className="flex items-start justify-between">
      <div className="space-y-1">
        <p className="text-xs font-semibold text-muted-foreground dark:text-gray-400 uppercase tracking-wider">{title}</p>
        <p className="text-2xl md:text-3xl font-bold text-card-foreground dark:text-white">{value}</p>
        <p className="text-xs text-muted-foreground dark:text-gray-500">{subtitle}</p>
      </div>
      <Icon className={`w-6 h-6 md:w-8 md:h-8 ${color}`} />
    </div>
  </div>;
const InfoCard = ({
  icon: Icon,
  title,
  color,
  children
}) => <Card className="h-full dark:bg-gray-800 dark:border-gray-700">
    <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-4">
      <Icon className={`w-6 h-6 ${color}`} />
      <CardTitle className="text-lg dark:text-white">{title}</CardTitle>
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>;
const SugestaoItem = ({
  task,
  clientName
}) => <div className="flex items-start gap-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg">
    <div className="flex-shrink-0 w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center">
      <Lightbulb className="w-4 h-4 text-white" />
    </div>
    <div className="flex-1">
      <p className="text-sm font-medium text-yellow-900 dark:text-yellow-200">{task.title}</p>
      <p className="text-xs text-yellow-700 dark:text-yellow-400">{clientName} • <span className="capitalize">{task.status}</span></p>
    </div>
  </div>;
const AlertaItem = ({
  icon: Icon,
  text,
  subtext
}) => <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg">
    <div className="flex-shrink-0 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
      <Icon className="w-4 h-4 text-white" />
    </div>
    <div className="flex-1">
      <p className="text-sm font-medium text-red-900 dark:text-red-200">{text}</p>
      <p className="text-xs text-red-700 dark:text-red-400">{subtext}</p>
    </div>
  </div>;
const EmptyState = ({
  icon: Icon,
  title,
  message,
  color
}) => <div className="flex flex-col items-center justify-center text-center h-full py-10">
    <Icon className={`w-12 h-12 mb-4 ${color}`} />
    <h4 className="text-lg font-semibold text-card-foreground dark:text-white">{title}</h4>
    <p className="text-sm text-muted-foreground dark:text-gray-400">{message}</p>
  </div>;
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
  const today = new Date();
  const formattedDate = format(today, "EEEE, d 'de' MMMM", {
    locale: ptBR
  });
  
  // Hook de cache para prevenir re-fetch desnecessário
  const cacheKey = `dashboard_${user?.id}_${profile?.role}`;
  const { data: cachedData, setCachedData, shouldFetch } = useDataCache(cacheKey);
  
  // Ref para controlar se já fez o fetch inicial (evita re-fetch ao voltar para aba)
  const hasFetchedRef = useRef(false);
  
  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      
      // Se já tem cache válido, não faz fetch
      if (!shouldFetch() && cachedData) {
        setStats(cachedData.stats);
        setSuggestions(cachedData.suggestions);
        setAlerts(cachedData.alerts);
        setLoading(false);
        hasFetchedRef.current = true;
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
      const startOfThisWeek = startOfWeek(today, {
        weekStartsOn: 1
      });
      const endOfThisWeek = endOfWeek(today, {
        weekStartsOn: 1
      });
      const next7Days = addDays(today, 7);
      const executed = tasks.filter(t => t.status === 'published' && isWithinInterval(new Date(t.due_date), {
        start: startOfThisWeek,
        end: endOfThisWeek
      })).length;
      const overdue = tasks.filter(t => !['published', 'scheduled', 'concluido'].includes(t.status) && isPast(new Date(t.due_date)) && !isToday(new Date(t.due_date))).length;
      const todayTasks = tasks.filter(t => isToday(new Date(t.due_date))).length;
      const upcoming = tasks.filter(t => isWithinInterval(new Date(t.due_date), {
        start: addDays(today, 1),
        end: next7Days
      })).length;
      setStats({
        executed,
        overdue,
        today: todayTasks,
        upcoming
      });
      const activeTasks = tasks.filter(t => !['published', 'scheduled', 'concluido'].includes(t.status));
      const scoredTasks = activeTasks.map(task => {
        let score = 0;
        const dueDate = new Date(task.due_date);
        if (isPast(dueDate) && !isToday(dueDate)) score += 10;
        const daysToDue = differenceInDays(dueDate, today);
        if (daysToDue >= 0 && daysToDue <= 3) score += 5;
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
          const hasFuturePosts = tasks.some(t => t.client_id === client.id && isWithinInterval(new Date(t.due_date), {
            start: today,
            end: addDays(today, 3)
          }));
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
              start: today,
              end: addDays(today, 3)
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
      tasks.forEach(task => {
        if (isPast(new Date(task.due_date)) && !isToday(new Date(task.due_date)) && !['published', 'scheduled', 'concluido'].includes(task.status)) {
          newAlerts.push({
            type: 'overdue_task',
            text: task.title,
            subtext: `Tarefa atrasada (${task.clientes?.empresa || 'N/A'})`
          });
        }
      });
      setAlerts(newAlerts.slice(0, 5));
      
      // Salva no cache
      setCachedData({
        stats: {
          executed,
          overdue,
          today: todayTasks,
          upcoming
        },
        suggestions: scoredTasks,
        alerts: newAlerts.slice(0, 5)
      });
      
      setLoading(false);
    };
    
    // Se já fez fetch inicial, não faz nada (evita recarregamento ao voltar para aba)
    if (hasFetchedRef.current) {
      // Apenas sincroniza com cache se necessário, sem fazer fetch
      if (!shouldFetch() && cachedData) {
        setStats(cachedData.stats);
        setSuggestions(cachedData.suggestions);
        setAlerts(cachedData.alerts);
        setLoading(false);
      }
      return;
    }
    
    // Se tem cache válido, usa ele e marca como fetched
    if (!shouldFetch() && cachedData) {
      setStats(cachedData.stats);
      setSuggestions(cachedData.suggestions);
      setAlerts(cachedData.alerts);
      setLoading(false);
      hasFetchedRef.current = true;
      return;
    }
    
    // Se não tem cache, faz fetch apenas uma vez
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetchData();
    }
  }, [user, profile]); // Apenas user e profile - evita re-execução
  
  const handleNotImplemented = () => toast({
    description: "🚧 Funcionalidade não implementada! Você pode solicitar no próximo prompt! 🚀"
  });
  const statCardsData = [{
    title: 'Executadas',
    value: stats.executed,
    subtitle: 'Esta semana',
    icon: CheckSquare,
    color: 'text-green-500'
  }, {
    title: 'Atrasadas',
    value: stats.overdue,
    subtitle: 'Requer atenção',
    icon: AlertTriangle,
    color: 'text-red-500'
  }, {
    title: 'Hoje',
    value: stats.today,
    subtitle: 'Para postar',
    icon: Clock,
    color: 'text-orange-500'
  }, {
    title: 'Próximas',
    value: stats.upcoming,
    subtitle: '7 dias',
    icon: Calendar,
    color: 'text-blue-500'
  }];
  return <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Olá, {profile?.full_name || 'Usuário'}!</h1>
        <p className="text-muted-foreground dark:text-gray-400 capitalize">{formattedDate}</p>
        {(profile?.role === 'superadmin' || profile?.role === 'admin') && <div className="mt-4 flex flex-col sm:flex-row gap-2">
                <Button variant="dark" onClick={handleNotImplemented} className="w-full sm:w-auto">Meus dados</Button>
                <Button variant="outline" onClick={handleNotImplemented} className="w-full sm:w-auto">Versão 3.0</Button>
            </div>}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCardsData.map((stat) => <StatCard key={stat.title} {...stat} delay={0} isFirstMount={false} />)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <InfoCard icon={Lightbulb} title="Sugestões de Prioridade" color="text-yellow-500">
            {loading ? <p className="dark:text-gray-300">Analisando tarefas...</p> : suggestions.length > 0 ? <div className="space-y-3">
                {suggestions.map(task => <SugestaoItem key={task.id} task={task} clientName={task.clientes?.empresa || 'N/A'} />)}
              </div> : <EmptyState icon={ListChecks} title="Tudo tranquilo!" message="Nenhuma tarefa crítica no momento." color="text-green-500" />}
          </InfoCard>
        </div>
        <div>
          <InfoCard icon={Bell} title="Alertas Proativos" color="text-red-500">
            {loading ? <p className="dark:text-gray-300">Verificando alertas...</p> : alerts.length > 0 ? <div className="space-y-3">
                {alerts.map((alert, index) => <AlertaItem key={index} icon={AlertTriangle} text={alert.text} subtext={alert.subtext} />)}
              </div> : <EmptyState icon={Bell} title="Tudo em ordem!" message="Nenhum alerta no momento." color="text-green-500" />}
          </InfoCard>
        </div>
      </div>
    </div>;
};
export default Dashboard;