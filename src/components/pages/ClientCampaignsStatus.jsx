import React, { useEffect, useState, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay, eachMonthOfInterval, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion } from 'framer-motion';
import { 
  CheckCircle2, 
  Clock, 
  PlayCircle, 
  Eye, 
  UserCheck, 
  Circle, 
  AlertCircle, 
  Pause,
  Loader2,
  Search,
  Filter,
  Video,
  Image as ImageIcon,
  FileText,
  Calendar,
  BarChart3
} from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

const STATUS_INFO = {
  'published': { 
    label: 'Publicado', 
    color: 'bg-green-500', 
    icon: CheckCircle2,
    description: 'O que foi feito e concluído'
  },
  'scheduled': { 
    label: 'Agendado', 
    color: 'bg-purple-500', 
    icon: Calendar,
    description: 'Agendado para publicação'
  },
  'production': { 
    label: 'Em Produção', 
    color: 'bg-blue-500', 
    icon: PlayCircle,
    description: 'Em produção'
  },
  'review': { 
    label: 'Em Revisão', 
    color: 'bg-yellow-500', 
    icon: Eye,
    description: 'Em revisão interna'
  },
  'approve': { 
    label: 'Aguardando Aprovação', 
    color: 'bg-orange-500', 
    icon: UserCheck,
    description: 'Aguardando sua aprovação'
  },
  'todo': { 
    label: 'A Fazer', 
    color: 'bg-gray-400', 
    icon: Circle,
    description: 'Para fazer'
  },
  'blocked': { 
    label: 'Bloqueado', 
    color: 'bg-red-500', 
    icon: AlertCircle,
    description: 'Bloqueado'
  },
  'pending': { 
    label: 'Pendente', 
    color: 'bg-yellow-600', 
    icon: Clock,
    description: 'Pendente'
  },
  'standby': { 
    label: 'Standby', 
    color: 'bg-gray-300', 
    icon: Pause,
    description: 'Em espera'
  },
};

const TYPE_INFO = {
  'video': { label: 'Vídeo', icon: Video, color: 'text-blue-600' },
  'arte': { label: 'Arte', icon: ImageIcon, color: 'text-purple-600' },
  'post': { label: 'Post', icon: FileText, color: 'text-green-600' },
  'reels': { label: 'Reels', icon: Video, color: 'text-pink-600' },
  'story': { label: 'Story', icon: ImageIcon, color: 'text-orange-600' },
  'social_media': { label: 'Social Media', icon: FileText, color: 'text-cyan-600' },
};

const ClientCampaignsStatus = () => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [clients, setClients] = useState([]);
  
  // Filtro de data - padrão: mês atual
  const hoje = new Date();
  const [selectedMonth, setSelectedMonth] = useState(hoje.getMonth() + 1); // 1-12
  const [selectedYear, setSelectedYear] = useState(hoje.getFullYear());

  const clienteId = profile?.cliente_id;
  const isAdmin = profile?.role && ['superadmin', 'admin', 'colaborador'].includes(profile.role) && !clienteId;

  useEffect(() => {
    const fetchData = async () => {
      // Se for cliente e não tiver cliente_id, não carregar
      if (!isAdmin && !clienteId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        // Se for admin, buscar TODAS as tarefas do sistema
        // Se for cliente, buscar apenas as tarefas dele
        let tasksQuery = supabase
          .from('tarefas')
          .select('*, projetos(name), clientes(empresa)')
          .order('created_at', { ascending: false });

        if (!isAdmin && clienteId) {
          tasksQuery = tasksQuery.eq('client_id', clienteId);
        }

        const { data: tasksData, error: tasksError } = await tasksQuery;

        if (tasksError) {
          console.error('Erro ao buscar tarefas:', tasksError);
          toast({
            title: 'Erro ao carregar tarefas',
            description: 'Não foi possível carregar as tarefas.',
            variant: 'destructive',
          });
        } else {
          setTasks(tasksData || []);
        }

        // Buscar projetos
        let projectsQuery = supabase
          .from('projetos')
          .select('id, name');

        if (!isAdmin && clienteId) {
          projectsQuery = projectsQuery.eq('client_id', clienteId);
        }

        const { data: projectsData, error: projectsError } = await projectsQuery;

        if (projectsError) {
          console.error('Erro ao buscar projetos:', projectsError);
        } else {
          setProjects(projectsData || []);
        }

        // Buscar todos os clientes (para filtro quando for admin)
        if (isAdmin) {
          const { data: clientsData, error: clientsError } = await supabase
            .from('clientes')
            .select('id, empresa')
            .order('empresa', { ascending: true });
          
          if (clientsError) {
            console.error('Erro ao buscar clientes:', clientsError);
          } else {
            setClients(clientsData || []);
          }
        }
      } catch (error) {
        console.error('Erro ao buscar dados:', error);
        toast({
          title: 'Erro ao carregar dados',
          description: 'Ocorreu um erro inesperado.',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [clienteId, toast]);

  // Filtrar e agrupar tarefas por status
  const tasksByStatus = useMemo(() => {
    let filteredTasks = tasks;

    // Filtro de busca
    if (searchTerm) {
      filteredTasks = filteredTasks.filter(task =>
        task.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filtro por tipo
    if (typeFilter !== 'all') {
      filteredTasks = filteredTasks.filter(task => task.type === typeFilter);
    }

    // Filtro por projeto
    if (projectFilter !== 'all') {
      filteredTasks = filteredTasks.filter(task => task.project_id === projectFilter);
    }

    // Filtro por cliente (apenas para admins)
    if (clientFilter !== 'all') {
      filteredTasks = filteredTasks.filter(task => task.client_id === clientFilter);
    }

    // Filtro por data (mês/ano)
    const inicioMes = startOfDay(startOfMonth(new Date(selectedYear, selectedMonth - 1, 1)));
    const fimMes = endOfDay(endOfMonth(new Date(selectedYear, selectedMonth - 1, 1)));
    
    filteredTasks = filteredTasks.filter(task => {
      // Usar post_date se disponível, senão usar created_at
      const taskDate = task.post_date || task.created_at;
      if (!taskDate) return false;
      
      const data = startOfDay(new Date(taskDate));
      return data >= inicioMes && data <= fimMes;
    });

    // Agrupar por status
    const grouped = {};
    Object.keys(STATUS_INFO).forEach(status => {
      if (status === 'published') {
        // Incluir tarefas 'published' e 'completed' no grupo 'published'
        grouped[status] = filteredTasks.filter(task => 
          task.status === 'published' || task.status === 'completed'
        );
      } else {
        grouped[status] = filteredTasks.filter(task => task.status === status);
      }
    });

    return grouped;
  }, [tasks, searchTerm, typeFilter, projectFilter, clientFilter, selectedMonth, selectedYear]);

  // Contar total de tarefas por status
  const getStatusCount = (status) => tasksByStatus[status]?.length || 0;

  // Produção mensal (últimos 12 meses)
  const producaoMensal = useMemo(() => {
    const hoje = new Date();
    const inicioPeriodo = startOfMonth(subMonths(hoje, 11));
    const fimPeriodo = endOfMonth(hoje);
    
    // Gerar array com os últimos 12 meses (sempre retorna 12 meses, mesmo sem dados)
    let meses = eachMonthOfInterval({ start: inicioPeriodo, end: fimPeriodo });
    
    // Garantir que sempre temos exatamente 12 meses
    if (meses.length !== 12) {
      // Se por algum motivo não tivermos 12 meses, criar manualmente
      const mesesCorrigidos = [];
      for (let i = 11; i >= 0; i--) {
        mesesCorrigidos.push(startOfMonth(subMonths(hoje, i)));
      }
      meses = mesesCorrigidos;
    }
    
    const resultado = meses.map(mes => {
      const inicioMes = startOfDay(startOfMonth(mes));
      const fimMes = endOfDay(endOfMonth(mes));
      
      // Contar tarefas produzidas (published ou completed) no mês
      const tarefasMes = (tasks || []).filter(task => {
        const taskDate = task.post_date || task.created_at;
        if (!taskDate) return false;
        
        try {
          const data = startOfDay(new Date(taskDate));
          return data >= inicioMes && data <= fimMes && 
                 (task.status === 'published' || task.status === 'completed');
        } catch {
          return false;
        }
      });
      
      return {
        mes: format(mes, 'MMM/yyyy', { locale: ptBR }),
        total: tarefasMes.length,
        dataCompleta: mes
      };
    });
    
    // Garantir que sempre retornamos exatamente 12 meses
    const resultadoFinal = resultado.length === 12 ? resultado : (() => {
      const mesesCorrigidos = [];
      for (let i = 11; i >= 0; i--) {
        const mes = startOfMonth(subMonths(hoje, i));
        const inicioMes = startOfDay(startOfMonth(mes));
        const fimMes = endOfDay(endOfMonth(mes));
        
        const tarefasMes = (tasks || []).filter(task => {
          const taskDate = task.post_date || task.created_at;
          if (!taskDate) return false;
          
          try {
            const data = startOfDay(new Date(taskDate));
            return data >= inicioMes && data <= fimMes && 
                   (task.status === 'published' || task.status === 'completed');
          } catch {
            return false;
          }
        });
        
        mesesCorrigidos.push({
          mes: format(mes, 'MMM/yyyy', { locale: ptBR }),
          total: tarefasMes.length,
          dataCompleta: mes
        });
      }
      return mesesCorrigidos;
    })();
    
    console.log('📊 Produção Mensal calculada:', {
      totalMeses: resultadoFinal.length,
      mesesComDados: resultadoFinal.filter(m => m.total > 0).length,
      dados: resultadoFinal
    });
    
    return resultadoFinal;
  }, [tasks]);

  // Formatar data
  const formatDate = (dateString) => {
    if (!dateString) return 'Não informado';
    try {
      return format(new Date(dateString), 'dd/MM/yyyy', { locale: ptBR });
    } catch {
      return 'Data inválida';
    }
  };

  // Componente de gráfico de barras
  const BarChart = ({ data, dataKey, labelKey, color }) => {
    const [hoveredBar, setHoveredBar] = useState(null);
    const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
    
    // Validar dados
    if (!data || !Array.isArray(data) || data.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-slate-400">
          <BarChart3 className="h-12 w-12 mb-3 opacity-50" />
          <p className="font-medium text-sm">Nenhum dado disponível</p>
        </div>
      );
    }
    
    const valores = data.map(d => parseFloat(d[dataKey]) || 0);
    const maxValue = Math.max(...valores, 0);
    // Garantir que sempre temos um valor mínimo para o eixo Y, mesmo quando todos são zero
    const niceMax = maxValue === 0 ? 1 : Math.max(Math.ceil(maxValue * 1.2), 1);
    const alturaMaxima = 200;
    const paddingTop = 20;
    const paddingBottom = 30;
    const alturaGrafico = alturaMaxima - paddingTop - paddingBottom;
    
    const larguraTotal = data.length * 80;
    const larguraBarraPx = (larguraTotal / data.length) * 0.5;
    const espacamento = (larguraTotal / data.length) * 0.5;
    
    const valoresEixoY = [niceMax, 0];

    return (
      <div className="w-full">
        <div className="relative" style={{ height: `${alturaMaxima}px` }}>
          <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between pr-2 py-[18px]" style={{ width: '50px' }}>
            {valoresEixoY.map((valor, idx) => (
              <span key={idx} className="text-[10px] font-medium text-slate-400">
                {valor.toFixed(0)}
              </span>
            ))}
          </div>

          <div className="ml-14 relative" style={{ height: `${alturaMaxima}px` }}>
            <svg 
              className="w-full h-full overflow-visible" 
              viewBox={`0 0 ${data.length * 80} ${alturaMaxima}`} 
              preserveAspectRatio="none"
            >
              {data.map((item, index) => {
                const valor = parseFloat(item[dataKey]) || 0;
                // Sempre calcular altura, mesmo quando zero (para mostrar a barra mínima)
                const altura = valor > 0 ? (valor / niceMax) * alturaGrafico : Math.max((1 / niceMax) * alturaGrafico, 2);
                const xPos = index * (larguraBarraPx + espacamento) + espacamento / 2;
                const yBase = paddingTop + alturaGrafico;
                const yTop = valor > 0 ? yBase - altura : yBase - 2;
                
                return (
                  <g key={index}>
                    <rect
                      x={xPos - 5}
                      y={0}
                      width={larguraBarraPx + 10}
                      height={alturaMaxima}
                      fill="transparent"
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={(e) => {
                        setHoveredBar(index);
                        const rect = e.currentTarget.getBoundingClientRect();
                        const container = e.currentTarget.closest('.ml-14');
                        if (container) {
                          const containerRect = container.getBoundingClientRect();
                          setTooltipPosition({
                            x: rect.left - containerRect.left + rect.width / 2,
                            y: rect.top - containerRect.top
                          });
                        }
                      }}
                      onMouseLeave={() => setHoveredBar(null)}
                    />
                    <motion.rect
                      x={xPos}
                      y={yTop}
                      width={larguraBarraPx}
                      height={valor > 0 ? altura : 2}
                      fill={color}
                      fillOpacity={valor > 0 ? (hoveredBar === index ? "1" : (index === data.length - 1 ? "1" : "0.4")) : "0.2"}
                      rx="6"
                      initial={{ height: 0, y: yBase }}
                      animate={{ height: valor > 0 ? altura : 2, y: yTop }}
                      transition={{ duration: 0.8, delay: index * 0.1 }}
                      style={{ transition: 'fillOpacity 0.2s' }}
                    />
                  </g>
                );
              })}
            </svg>
            
            {hoveredBar !== null && (
              <div
                className="absolute z-50 bg-slate-800 text-white text-xs rounded-lg shadow-xl px-3 py-2 pointer-events-none border border-slate-700"
                style={{
                  left: `${tooltipPosition.x}px`,
                  top: `${tooltipPosition.y - 10}px`,
                  transform: 'translate(-50%, -100%)'
                }}
              >
                <div className="font-semibold mb-1 text-white">{data[hoveredBar][labelKey]}</div>
                <div className="text-white">
                  Produzido: {data[hoveredBar][dataKey]} tarefa{data[hoveredBar][dataKey] !== 1 ? 's' : ''}
                </div>
              </div>
            )}
            
            <div className="absolute bottom-2 left-0 right-0 flex justify-between px-2">
              {data.map((item, index) => {
                const xPos = index * (larguraBarraPx + espacamento) + espacamento / 2;
                const xPercent = (xPos / (data.length * 80)) * 100;
                const mesAbreviado = item[labelKey].split('/')[0].toLowerCase();
                return (
                  <div 
                    key={index} 
                    className="absolute text-[10px] font-bold text-slate-400 uppercase tracking-tighter text-center"
                    style={{ 
                      left: `${xPercent}%`,
                      transform: 'translateX(-50%)',
                      width: '40px'
                    }}
                  >
                    {mesAbreviado}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Status das Campanhas - JB APEX</title>
      </Helmet>

      <div className="space-y-6">
        {/* Header */}
        <header>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[#1e293b] tracking-tight">
                Status das Campanhas
              </h1>
              <p className="text-sm text-slate-500 mt-1 font-medium">
                {isAdmin 
                  ? 'Acompanhe o status de todas as campanhas e tarefas do sistema'
                  : 'Acompanhe o status de todas as suas campanhas e tarefas em produção'
                }
              </p>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-50 border border-blue-200">
              <Calendar className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-semibold text-blue-700">
                {format(new Date(selectedYear, selectedMonth - 1, 1), "MMMM 'de' yyyy", { locale: ptBR })}
              </span>
            </div>
          </div>
        </header>

        {/* Filtros */}
        <Card className="bg-white border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[1.5rem] overflow-hidden">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Buscar por título ou descrição..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 h-10 bg-slate-50 border-slate-200 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
                  />
                </div>
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full md:w-[200px] h-10 bg-slate-50 border-slate-200 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                  <SelectValue placeholder="Todos os tipos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  {Object.entries(TYPE_INFO).map(([key, info]) => (
                    <SelectItem key={key} value={key}>
                      {info.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={projectFilter} onValueChange={setProjectFilter}>
                <SelectTrigger className="w-full md:w-[200px] h-10 bg-slate-50 border-slate-200 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                  <SelectValue placeholder="Todos os projetos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os projetos</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isAdmin && (
                <Select value={clientFilter} onValueChange={setClientFilter}>
                  <SelectTrigger className="w-full md:w-[200px] h-10 bg-slate-50 border-slate-200 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                    <SelectValue placeholder="Todos os clientes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os clientes</SelectItem>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.empresa}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {/* Filtro de Mês */}
              <Select 
                value={selectedMonth.toString()} 
                onValueChange={(value) => setSelectedMonth(parseInt(value))}
              >
                <SelectTrigger className="w-full md:w-[160px] h-10 bg-slate-50 border-slate-200 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                  <SelectValue placeholder="Mês" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => {
                    const monthIndex = i + 1;
                    const monthDate = new Date(selectedYear, monthIndex - 1, 1);
                    const isCurrentMonth = monthIndex === hoje.getMonth() + 1 && selectedYear === hoje.getFullYear();
                    return (
                      <SelectItem key={monthIndex} value={monthIndex.toString()}>
                        {format(monthDate, 'MMMM', { locale: ptBR })}
                        {isCurrentMonth && ' (atual)'}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {/* Filtro de Ano */}
              <Select 
                value={selectedYear.toString()} 
                onValueChange={(value) => setSelectedYear(parseInt(value))}
              >
                <SelectTrigger className="w-full md:w-[120px] h-10 bg-slate-50 border-slate-200 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                  <SelectValue placeholder="Ano" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 5 }, (_, i) => {
                    const year = hoje.getFullYear() - 2 + i;
                    const isCurrentYear = year === hoje.getFullYear();
                    return (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                        {isCurrentYear && ' (atual)'}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {/* Botão para voltar ao mês atual */}
              {(selectedMonth !== hoje.getMonth() + 1 || selectedYear !== hoje.getFullYear()) && (
                <Button
                  onClick={() => {
                    setSelectedMonth(hoje.getMonth() + 1);
                    setSelectedYear(hoje.getFullYear());
                  }}
                  variant="outline"
                  className="h-10 px-4 bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
                >
                  Mês Atual
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Gráfico de Produção Mensal - Tudo que foi feito para o cliente mês a mês */}
        <Card className="bg-white border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[1.5rem] overflow-hidden">
          <CardHeader className="p-6 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-500 bg-opacity-10">
                <BarChart3 className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-slate-800">Produção Mensal</CardTitle>
                <p className="text-sm text-slate-500 mt-1 font-medium">
                  Tudo que foi produzido para o cliente mês a mês (últimos 12 meses)
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6 pt-0">
            <div className="h-64">
              {producaoMensal && producaoMensal.length > 0 ? (
                <BarChart
                  data={producaoMensal}
                  dataKey="total"
                  labelKey="mes"
                  color="#3b82f6"
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                  <BarChart3 className="h-12 w-12 mb-3 opacity-50" />
                  <p className="font-medium text-sm">Carregando dados de produção...</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Cards de Status */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Object.entries(STATUS_INFO).map(([status, info]) => {
            const statusTasks = tasksByStatus[status] || [];
            const Icon = info.icon;
            const count = statusTasks.length;

            return (
              <Card
                key={status}
                className="bg-white border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[1.5rem] overflow-hidden flex flex-col h-full max-h-[600px] hover:shadow-[0_12px_40px_rgb(0,0,0,0.06)] transition-shadow duration-200"
              >
                <CardHeader className="pb-4 flex-shrink-0 p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-xl ${info.color} bg-opacity-10`}>
                        <Icon className={`h-5 w-5 ${info.color.replace('bg-', 'text-')}`} />
                      </div>
                      <div>
                        <CardTitle className="text-lg font-bold text-[#1e293b] tracking-tight">
                          {info.label}
                        </CardTitle>
                        <p className="text-xs text-slate-400 mt-0.5 font-medium">
                          {info.description}
                        </p>
                      </div>
                    </div>
                    <Badge
                      className={`${info.color} text-white text-sm font-semibold px-2.5 py-1 rounded-lg`}
                    >
                      {count}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 min-h-0 p-0">
                  {count === 0 ? (
                    <div className="p-6 text-center text-sm text-slate-400 font-medium">
                      Nenhuma tarefa neste status
                    </div>
                  ) : (
                    <ScrollArea className="h-full px-6 pb-6">
                      <div className="space-y-3">
                        {statusTasks.map((task) => {
                          const typeInfo = TYPE_INFO[task.type] || { label: task.type, icon: FileText, color: 'text-slate-600' };
                          const TypeIcon = typeInfo.icon;

                          return (
                            <div
                              key={task.id}
                              className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-300 transition-all duration-200"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-2">
                                    <TypeIcon className={`h-4 w-4 ${typeInfo.color} flex-shrink-0`} />
                                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                      {typeInfo.label}
                                    </span>
                                  </div>
                                  <h4 className="text-sm font-bold text-slate-800 line-clamp-2 mb-2">
                                    {task.title || 'Sem título'}
                                  </h4>
                                  {isAdmin && task.clientes?.empresa && (
                                    <p className="text-xs font-semibold text-orange-600 mt-1">
                                      Cliente: {task.clientes.empresa}
                                    </p>
                                  )}
                                  {task.projetos?.name && (
                                    <p className="text-xs text-slate-500 mt-1 font-medium">
                                      Projeto: {task.projetos.name}
                                    </p>
                                  )}
                                  {(task.due_date || task.post_date) && (
                                    <p className="text-xs text-slate-400 mt-1 font-medium">
                                      {task.post_date ? 'Agendado: ' : 'Vencimento: '}
                                      {formatDate(task.post_date || task.due_date)}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </>
  );
};

export default ClientCampaignsStatus;
