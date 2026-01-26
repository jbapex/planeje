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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
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
  const [selectedMonthTasks, setSelectedMonthTasks] = useState(null);
  const [showTasksDialog, setShowTasksDialog] = useState(false);
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

  // Produção mensal (Janeiro a Dezembro do ano atual)
  const producaoMensal = useMemo(() => {
    const hoje = new Date();
    const anoAtual = hoje.getFullYear();
    
    // Gerar os 12 meses de Janeiro a Dezembro do ano atual
    const meses = [];
    for (let mes = 0; mes < 12; mes++) {
      meses.push(new Date(anoAtual, mes, 1));
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
        mes: format(mes, 'MMM', { locale: ptBR }),
        mesCompleto: format(mes, 'MMM/yyyy', { locale: ptBR }),
        total: tarefasMes.length,
        dataCompleta: mes,
        tarefas: tarefasMes // Incluir as tarefas do mês
      };
    });
    
    // Validar que temos exatamente 12 meses
    if (resultado.length !== 12) {
      console.warn('⚠️ Produção Mensal: Esperado 12 meses, recebido:', resultado.length);
      return [];
    }
    
    console.log('📊 Produção Mensal (Jan a Dez):', {
      totalMeses: resultado.length,
      mesesComDados: resultado.filter(m => m.total > 0).length,
      ordem: resultado.map(m => m.mes),
      dados: resultado.map(m => ({ mes: m.mes, total: m.total }))
    });
    
    return resultado;
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

  // Componente de gráfico de barras (estilo similar ao PGMPanel)
  const BarChart = ({ data, dataKey, labelKey, color, onBarClick }) => {
    const [hoveredBar, setHoveredBar] = useState(null);
    const [tooltipData, setTooltipData] = useState({ x: 0, y: 0, mes: '' });
    
    // Validar dados
    if (!data || !Array.isArray(data) || data.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-slate-400">
          <BarChart3 className="h-12 w-12 mb-3 opacity-50" />
          <p className="font-medium text-sm">Nenhum dado disponível</p>
        </div>
      );
    }
    
    // Validar que temos exatamente 12 meses
    if (data.length !== 12) {
      console.warn('⚠️ BarChart: Esperado 12 meses, recebido:', data.length);
    }
    
    const valores = data.map(d => parseFloat(d[dataKey]) || 0);
    const maxValue = Math.max(...valores, 0);
    
    // Calcular valor máximo "bonito" para o eixo Y
    let maxValueFinal = 1;
    if (maxValue > 0) {
      const potencia = Math.pow(10, Math.floor(Math.log10(maxValue)));
      maxValueFinal = Math.ceil(maxValue / potencia) * potencia;
    }
    
    const alturaMaxima = 300;
    const numIntervalos = 5;
    const intervaloValor = maxValueFinal / numIntervalos;
    const valoresEixoY = Array.from({ length: numIntervalos + 1 }, (_, i) => i * intervaloValor);

    return (
      <div className="w-full">
        <div className="relative w-full">
          {/* Eixo Y e Grid Lines */}
          <div className="absolute left-0 top-0 bottom-8 w-12 flex flex-col justify-between pr-2">
            {valoresEixoY.slice().reverse().map((value, index) => {
              // Formatar valores de forma compacta
              const formattedValue = value >= 1000000 
                ? `${(value / 1000000).toFixed(1)}M`
                : value >= 1000
                ? `${(value / 1000).toFixed(0)}K`
                : value.toFixed(0);
              
              return (
                <div key={index} className="flex items-center justify-end">
                  <span className="text-xs text-slate-400 font-medium">{formattedValue}</span>
                </div>
              );
            })}
          </div>

          {/* Área do gráfico */}
          <div className="ml-12 pr-4 relative" style={{ paddingBottom: '30px' }}>
            {/* Grid Lines */}
            <div className="relative" style={{ height: `${alturaMaxima}px` }}>
              {valoresEixoY.map((value, index) => {
                const yPosition = alturaMaxima - (value / maxValueFinal) * alturaMaxima;
                return (
                  <div
                    key={index}
                    className="absolute left-0 right-0 border-t border-slate-200"
                    style={{ top: `${yPosition}px` }}
                  />
                );
              })}

              {/* SVG para barras */}
              <svg 
                className="absolute inset-0 w-full h-full" 
                viewBox={`0 0 1200 ${alturaMaxima}`}
                preserveAspectRatio="none"
                style={{ overflow: 'visible' }}
              >
                <defs>
                  {/* Gradiente azul para as barras */}
                  <linearGradient id="barGradient-producao" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.7" />
                  </linearGradient>
                </defs>

                {/* Barras de Produção */}
                {data.map((item, index) => {
                  const valor = parseFloat(item[dataKey]) || 0;
                  const larguraViewBox = 1200;
                  const numMeses = 12;
                  const larguraMes = larguraViewBox / numMeses;
                  const xCentro = (index * larguraMes) + (larguraMes / 2);
                  const larguraBarra = larguraMes * 0.6; // 60% da largura do mês
                  const alturaBarra = (valor / maxValueFinal) * alturaMaxima;
                  const xBarra = xCentro - (larguraBarra / 2);
                  const yBarra = alturaMaxima - alturaBarra;
                  const isHovered = hoveredBar === index;

                  return (
                    <g key={index}>
                      {valor > 0 && (
                        <>
                          <rect
                            x={xBarra}
                            y={yBarra}
                            width={larguraBarra}
                            height={alturaBarra}
                            fill="url(#barGradient-producao)"
                            rx="4"
                            ry="4"
                            style={{
                              cursor: 'pointer',
                              opacity: isHovered ? 0.8 : 1,
                              transition: 'opacity 0.2s'
                            }}
                            onClick={() => {
                              if (onBarClick && item.tarefas) {
                                onBarClick(item);
                              }
                            }}
                            onMouseEnter={(e) => {
                              setHoveredBar(index);
                              const rect = e.currentTarget.getBoundingClientRect();
                              const graphContainer = e.currentTarget.closest('.ml-12');
                              if (graphContainer) {
                                const containerRect = graphContainer.getBoundingClientRect();
                                setTooltipData({
                                  x: rect.left - containerRect.left + rect.width / 2,
                                  y: rect.top - containerRect.top - 10,
                                  mes: item.mes
                                });
                              }
                            }}
                            onMouseMove={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const graphContainer = e.currentTarget.closest('.ml-12');
                              if (graphContainer) {
                                const containerRect = graphContainer.getBoundingClientRect();
                                setTooltipData({
                                  x: rect.left - containerRect.left + rect.width / 2,
                                  y: rect.top - containerRect.top - 10,
                                  mes: item.mes
                                });
                              }
                            }}
                            onMouseLeave={() => setHoveredBar(null)}
                          />
                          {/* Número dentro da barra */}
                          <text
                            x={xCentro}
                            y={yBarra + (alturaBarra / 2) + 4}
                            textAnchor="middle"
                            className="text-xs font-bold fill-white"
                            style={{ fontSize: '12px', fontWeight: 'bold', pointerEvents: 'none' }}
                          >
                            {valor}
                          </text>
                        </>
                      )}
                      {/* Área invisível para hover mesmo quando valor é zero */}
                      <rect
                        x={xCentro - (larguraMes / 2)}
                        y={0}
                        width={larguraMes}
                        height={alturaMaxima}
                        fill="transparent"
                        style={{ cursor: 'pointer' }}
                        onClick={() => {
                          if (onBarClick && item.tarefas) {
                            onBarClick(item);
                          }
                        }}
                        onMouseEnter={(e) => {
                          setHoveredBar(index);
                          const rect = e.currentTarget.getBoundingClientRect();
                          const graphContainer = e.currentTarget.closest('.ml-12');
                          if (graphContainer) {
                            const containerRect = graphContainer.getBoundingClientRect();
                            setTooltipData({
                              x: rect.left - containerRect.left + rect.width / 2,
                              y: rect.top - containerRect.top - 10,
                              mes: item.mes
                            });
                          }
                        }}
                        onMouseLeave={() => setHoveredBar(null)}
                      />
                    </g>
                  );
                })}
              </svg>
              
            </div>
            
            {/* Tooltip */}
            {hoveredBar !== null && (
              <div
                className="absolute z-50 bg-slate-800 text-white text-xs rounded-lg shadow-xl px-3 py-2 pointer-events-none border border-slate-700"
                style={{
                  left: `${tooltipData.x}px`,
                  top: `${tooltipData.y}px`,
                  transform: 'translate(-50%, -100%)'
                }}
              >
                <div className="font-semibold mb-1 text-white">{data[hoveredBar].mesCompleto || data[hoveredBar][labelKey]}</div>
                <div className="text-white">
                  {data[hoveredBar][dataKey]} tarefa{data[hoveredBar][dataKey] !== 1 ? 's' : ''} produzida{data[hoveredBar][dataKey] !== 1 ? 's' : ''}
                </div>
              </div>
            )}
            
            {/* Labels dos meses */}
            <div className="absolute bottom-0 left-0 right-0 flex justify-between" style={{ height: '25px', zIndex: 10 }}>
              {data.map((item, index) => {
                const larguraViewBox = 1200;
                const numMeses = 12;
                const larguraMes = larguraViewBox / numMeses;
                const xCentro = (index * larguraMes) + (larguraMes / 2);
                const xPercent = (xCentro / larguraViewBox) * 100;
                const mesAbreviado = (item.mes || item[labelKey]?.split('/')[0] || '').toUpperCase();
                
                return (
                  <div 
                    key={index} 
                    className="absolute text-xs font-medium text-slate-600 dark:text-slate-400 uppercase text-center pointer-events-none"
                    style={{ 
                      left: `${xPercent}%`,
                      transform: 'translateX(-50%)',
                      bottom: '2px'
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

      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <header>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between items-center gap-3 sm:gap-4 text-center sm:text-left">
            <div className="w-full sm:w-auto">
              <h1 className="text-2xl sm:text-3xl font-bold text-[#1e293b] tracking-tight">
                Status das Campanhas
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium">
                {isAdmin 
                  ? 'Acompanhe o status de todas as campanhas e tarefas do sistema'
                  : 'Acompanhe o status de todas as suas campanhas e tarefas em produção'
                }
              </p>
            </div>
            <div className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl bg-blue-50 border border-blue-200 justify-center sm:justify-start w-full sm:w-auto">
              <Calendar className="h-4 w-4 text-blue-600" />
              <span className="text-xs sm:text-sm font-semibold text-blue-700">
                {format(new Date(selectedYear, selectedMonth - 1, 1), "MMMM 'de' yyyy", { locale: ptBR })}
              </span>
            </div>
          </div>
        </header>

        {/* Filtros */}
        <Card className="bg-white border-none shadow-sm sm:shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-xl sm:rounded-[1.5rem] overflow-hidden">
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col md:flex-row gap-3 sm:gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Buscar por título ou descrição..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 h-10 sm:h-11 bg-slate-50 border-slate-200 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] text-sm sm:text-base"
                  />
                </div>
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full md:w-[200px] h-10 sm:h-11 bg-slate-50 border-slate-200 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] text-sm sm:text-base">
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
                <SelectTrigger className="w-full md:w-[200px] h-10 sm:h-11 bg-slate-50 border-slate-200 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] text-sm sm:text-base">
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
                  <SelectTrigger className="w-full md:w-[200px] h-10 sm:h-11 bg-slate-50 border-slate-200 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] text-sm sm:text-base">
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
                <SelectTrigger className="w-full md:w-[160px] h-10 sm:h-11 bg-slate-50 border-slate-200 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] text-sm sm:text-base">
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
                <SelectTrigger className="w-full md:w-[120px] h-10 sm:h-11 bg-slate-50 border-slate-200 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] text-sm sm:text-base">
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
                  className="h-10 sm:h-11 px-3 sm:px-4 bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] text-sm sm:text-base"
                >
                  Mês Atual
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Gráfico de Produção Mensal - Tudo que foi feito para o cliente mês a mês */}
        <Card className="bg-white border-none shadow-sm sm:shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-xl sm:rounded-[1.5rem] overflow-hidden">
          <CardHeader className="p-4 sm:p-6 pb-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-2 sm:p-2.5 rounded-xl bg-blue-500 bg-opacity-10">
                <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
              </div>
              <div>
                <CardTitle className="text-base sm:text-lg font-bold text-slate-800">Produção Mensal</CardTitle>
                <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium">
                  Tudo que foi produzido para o cliente mês a mês (últimos 12 meses)
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <div className="h-64 sm:h-80">
              {producaoMensal && producaoMensal.length > 0 ? (
                <BarChart
                  data={producaoMensal}
                  dataKey="total"
                  labelKey="mes"
                  color="#3b82f6"
                  onBarClick={(monthData) => {
                    setSelectedMonthTasks(monthData);
                    setShowTasksDialog(true);
                  }}
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {Object.entries(STATUS_INFO).map(([status, info]) => {
            const statusTasks = tasksByStatus[status] || [];
            const Icon = info.icon;
            const count = statusTasks.length;

            return (
              <Card
                key={status}
                className="bg-white border-none shadow-sm sm:shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-xl sm:rounded-[1.5rem] overflow-hidden flex flex-col h-full max-h-[500px] sm:max-h-[600px] hover:shadow-md sm:hover:shadow-[0_12px_40px_rgb(0,0,0,0.06)] transition-shadow duration-200"
              >
                <CardHeader className="pb-3 sm:pb-4 flex-shrink-0 p-4 sm:p-6">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                      <div className={`p-2 sm:p-2.5 rounded-xl ${info.color} bg-opacity-10 flex-shrink-0`}>
                        <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${info.color.replace('bg-', 'text-')}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-base sm:text-lg font-bold text-[#1e293b] tracking-tight truncate">
                          {info.label}
                        </CardTitle>
                        <p className="text-xs text-slate-400 mt-0.5 font-medium line-clamp-1">
                          {info.description}
                        </p>
                      </div>
                    </div>
                    <Badge
                      className={`${info.color} text-white text-xs sm:text-sm font-semibold px-2 sm:px-2.5 py-1 rounded-lg flex-shrink-0`}
                    >
                      {count}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 min-h-0 p-0">
                  {count === 0 ? (
                    <div className="p-4 sm:p-6 text-center text-xs sm:text-sm text-slate-400 font-medium">
                      Nenhuma tarefa neste status
                    </div>
                  ) : (
                    <ScrollArea className="h-full px-4 sm:px-6 pb-4 sm:pb-6">
                      <div className="space-y-2 sm:space-y-3">
                        {statusTasks.map((task) => {
                          const typeInfo = TYPE_INFO[task.type] || { label: task.type, icon: FileText, color: 'text-slate-600' };
                          const TypeIcon = typeInfo.icon;

                          return (
                            <div
                              key={task.id}
                              className="p-3 sm:p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-300 transition-all duration-200"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
                                    <TypeIcon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${typeInfo.color} flex-shrink-0`} />
                                    <span className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                      {typeInfo.label}
                                    </span>
                                  </div>
                                  <h4 className="text-xs sm:text-sm font-bold text-slate-800 line-clamp-2 mb-1.5 sm:mb-2">
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

      {/* Dialog para exibir tarefas do mês */}
      <Dialog open={showTasksDialog} onOpenChange={setShowTasksDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              Tarefas de {selectedMonthTasks?.mesCompleto || selectedMonthTasks?.mes}
            </DialogTitle>
            <DialogDescription>
              {selectedMonthTasks?.total || 0} tarefa{selectedMonthTasks?.total !== 1 ? 's' : ''} produzida{selectedMonthTasks?.total !== 1 ? 's' : ''} neste mês
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto mt-4">
            {selectedMonthTasks?.tarefas && selectedMonthTasks.tarefas.length > 0 ? (
              <div className="space-y-3">
                {selectedMonthTasks.tarefas.map((task) => {
                  const getTypeIcon = () => {
                    if (task.type === 'video') return <Video className="h-4 w-4" />;
                    if (task.type === 'arte') return <ImageIcon className="h-4 w-4" />;
                    return <FileText className="h-4 w-4" />;
                  };

                  const getStatusColor = () => {
                    if (task.status === 'published') return 'bg-green-100 text-green-700 border-green-200';
                    if (task.status === 'completed') return 'bg-blue-100 text-blue-700 border-blue-200';
                    return 'bg-gray-100 text-gray-700 border-gray-200';
                  };

                  return (
                    <div
                      key={task.id}
                      className="p-4 rounded-lg border bg-white hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1">
                          <div className={`p-2 rounded-lg ${getStatusColor()}`}>
                            {getTypeIcon()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-slate-800 truncate">{task.title || 'Sem título'}</h4>
                            <div className="flex items-center gap-4 mt-2 flex-wrap">
                              <span className="text-xs text-slate-500 font-medium">
                                Tipo: {task.type === 'video' ? 'Vídeo' : task.type === 'arte' ? 'Arte' : task.type}
                              </span>
                              <span className="text-xs text-slate-500 font-medium">
                                Status: {task.status === 'published' ? 'Publicado' : task.status === 'completed' ? 'Concluído' : task.status}
                              </span>
                              {task.post_date && (
                                <span className="text-xs text-slate-500 font-medium">
                                  Data: {formatDate(task.post_date)}
                                </span>
                              )}
                            </div>
                            {task.description && (
                              <p className="text-sm text-slate-600 mt-2 line-clamp-2">{task.description}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 text-slate-400">
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium">Nenhuma tarefa encontrada para este mês</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ClientCampaignsStatus;
