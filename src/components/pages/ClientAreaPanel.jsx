import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { 
  ShoppingCart, 
  DollarSign, 
  TrendingUp, 
  Target,
  Loader2,
  BarChart3
} from 'lucide-react';
import { motion } from 'framer-motion';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachWeekOfInterval, eachMonthOfInterval, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Função para formatar moeda
const formatCurrency = (value) => {
  const num = typeof value === 'number' ? value : parseFloat(value) || 0;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num);
};

// Função para formatar percentual
const formatPercentage = (value) => {
  const num = typeof value === 'number' ? value : parseFloat(value) || 0;
  return `${num.toFixed(2)}%`;
};

// Função para formatar número
const formatNumber = (value) => {
  const num = typeof value === 'number' ? value : parseFloat(value) || 0;
  return new Intl.NumberFormat('pt-BR').format(num);
};

const ClientAreaPanel = () => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [resultadosDiarios, setResultadosDiarios] = useState([]);
  const [clientesComLogin, setClientesComLogin] = useState([]);

  // Buscar dados
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Buscar todos os clientes que têm login
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('cliente_id')
          .eq('role', 'cliente')
          .not('cliente_id', 'is', null);

        if (profilesError) {
          console.error('Erro ao buscar clientes com login:', profilesError);
          toast({
            title: 'Erro ao carregar dados',
            description: 'Não foi possível carregar a lista de clientes.',
            variant: 'destructive'
          });
          setLoading(false);
          return;
        }

        const clienteIds = [...new Set((profilesData || []).map(p => p.cliente_id).filter(Boolean))];
        setClientesComLogin(clienteIds);

        if (clienteIds.length === 0) {
          setLoading(false);
          return;
        }

        // Buscar tarefas de vídeo e arte de todos os clientes
        const { data: tasksVideoArte, error: errorVideoArte } = await supabase
          .from('tarefas')
          .select('*')
          .in('client_id', clienteIds)
          .in('type', ['arte', 'video'])
          .in('status', ['published', 'scheduled']);

        // Buscar tarefas de redes sociais de todos os clientes
        const { data: tasksSocialMediaAll, error: errorSocialMediaAll } = await supabase
          .from('tarefas')
          .select('*')
          .in('client_id', clienteIds)
          .in('type', ['post', 'reels', 'story', 'social_media']);

        // Filtrar redes sociais: excluir apenas "todo" e "standby"
        const tasksSocialMedia = (tasksSocialMediaAll || []).filter(task => 
          task.status !== 'todo' && task.status !== 'standby'
        );

        const tasksError = errorVideoArte || errorSocialMediaAll;
        const allTasks = [...(tasksVideoArte || []), ...tasksSocialMedia];
        
        // Mapear tarefas de social media para type arte ou video
        const tasksMapeadas = allTasks.map(task => {
          if (['post', 'reels', 'story', 'social_media'].includes(task.type)) {
            if (task.type === 'reels') {
              return { ...task, type: 'video' };
            } else {
              return { ...task, type: 'arte' };
            }
          }
          return task;
        });

        if (tasksError) {
          console.error('Erro ao buscar tarefas:', tasksError);
        } else {
          setTasks(tasksMapeadas || []);
        }

        // Buscar resultados diários de todos os clientes
        const { data: resultadosData, error: resultadosError } = await supabase
          .from('cliente_resultados_diarios')
          .select('id, cliente_id, data_referencia, leads, visitas_agendadas, visitas_realizadas, vendas, faturamento, investimento')
          .in('cliente_id', clienteIds)
          .order('data_referencia', { ascending: false });

        if (resultadosError) {
          console.error('Erro ao buscar resultados:', resultadosError);
        } else {
          setResultadosDiarios(resultadosData || []);
        }
      } catch (error) {
        console.error('Erro ao buscar dados:', error);
        toast({
          title: 'Erro ao carregar dados',
          description: 'Não foi possível carregar os dados do dashboard.',
          variant: 'destructive'
        });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [toast]);

  // Dados do mês atual (agregados de todos os clientes)
  const mesAtual = useMemo(() => {
    const hoje = new Date();
    const inicioMes = startOfMonth(hoje);
    const fimMes = endOfMonth(hoje);
    
    const dadosMes = resultadosDiarios.filter(item => {
      const data = new Date(item.data_referencia);
      return data >= inicioMes && data <= fimMes;
    });

    const totalVendas = dadosMes.reduce((sum, item) => sum + parseInt(item.vendas || 0), 0);
    const totalFaturamento = dadosMes.reduce((sum, item) => sum + parseFloat(item.faturamento || 0), 0);
    const totalLeads = dadosMes.reduce((sum, item) => sum + parseInt(item.leads || 0), 0);
    const totalInvestimento = dadosMes.reduce((sum, item) => sum + parseFloat(item.investimento || 0), 0);
    const taxaConversao = totalLeads > 0 ? (totalVendas / totalLeads) * 100 : 0;
    const ticketMedio = totalVendas > 0 ? totalFaturamento / totalVendas : 0;
    const roi = totalInvestimento > 0 ? ((totalFaturamento - totalInvestimento) / totalInvestimento) * 100 : 0;

    return {
      totalVendas,
      totalFaturamento,
      totalLeads,
      totalInvestimento,
      taxaConversao,
      ticketMedio,
      roi
    };
  }, [resultadosDiarios]);

  // Dados mensais de faturamento e ticket médio (com todos os meses de 2026)
  const dadosMensaisFaturamento = useMemo(() => {
    const mesesMap = {};
    
    // Inicializar todos os meses de 2026
    const anoAtual = 2026;
    for (let mes = 0; mes < 12; mes++) {
      const data = new Date(anoAtual, mes, 1);
      const mesAno = format(data, 'MMM/yyyy', { locale: ptBR });
      mesesMap[mesAno] = {
        mes: mesAno,
        faturamento: 0,
        vendas: 0,
        investimento: 0,
        dataCompleta: data
      };
    }
    
    // Preencher com dados reais (agregados de todos os clientes)
    resultadosDiarios.forEach(item => {
      const data = new Date(item.data_referencia);
      const mesAno = format(data, 'MMM/yyyy', { locale: ptBR });
      
      if (mesesMap[mesAno]) {
        mesesMap[mesAno].faturamento += parseFloat(item.faturamento || 0);
        mesesMap[mesAno].vendas += parseInt(item.vendas || 0);
        mesesMap[mesAno].investimento += parseFloat(item.investimento || 0);
      }
    });

    return Object.values(mesesMap)
      .map(item => ({
        ...item,
        ticketMedio: item.vendas > 0 ? item.faturamento / item.vendas : 0,
        faturamentoAcumulado: 0
      }))
      .sort((a, b) => {
        return a.dataCompleta - b.dataCompleta;
      })
      .map((item, index, array) => {
        // Calcular acumulado
        const acumulado = array.slice(0, index + 1).reduce((sum, i) => sum + i.faturamento, 0);
        return { ...item, faturamentoAcumulado: acumulado };
      });
  }, [resultadosDiarios]);

  // CPL por semana do mês atual (agregado de todos os clientes)
  const cplSemanal = useMemo(() => {
    const hoje = new Date();
    const inicioMes = startOfMonth(hoje);
    const fimMes = endOfMonth(hoje);

    const semanas = eachWeekOfInterval({ start: inicioMes, end: fimMes }, { weekStartsOn: 1 });

    const dadosSemanas = semanas.map((semana, index) => {
      const fimSemana = endOfWeek(semana, { weekStartsOn: 1 });

      const dadosSemana = resultadosDiarios.filter(item => {
        const data = new Date(item.data_referencia);
        return data >= semana && data <= fimSemana;
      });

      const totalInvestimento = dadosSemana.reduce((sum, item) => sum + parseFloat(item.investimento || 0), 0);
      const totalLeads = dadosSemana.reduce((sum, item) => sum + parseInt(item.leads || 0), 0);
      const cpl = totalLeads > 0 ? totalInvestimento / totalLeads : 0;

      return {
        semana: `Semana ${index + 1}`,
        cpl: parseFloat(cpl.toFixed(2)),
        investimento: totalInvestimento,
        leads: totalLeads
      };
    });

    return dadosSemanas;
  }, [resultadosDiarios]);

  // Componente de gráfico de linha (estilo Ticket Médio e Faturamento)
  const createSmoothPath = (points) => {
    if (points.length < 2) return '';
    
    let path = `M ${points[0].x} ${points[0].y}`;
    
    for (let i = 0; i < points.length - 1; i++) {
      const current = points[i];
      const next = points[i + 1];
      const cp1x = current.x + (next.x - current.x) / 3;
      const cp1y = current.y;
      const cp2x = current.x + (next.x - current.x) * 2 / 3;
      const cp2y = next.y;
      
      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${next.x} ${next.y}`;
    }
    
    return path;
  };

  const LineChart = ({ data, dataKey, labelKey, color, title }) => {
    const maxValue = Math.max(...data.map(d => d[dataKey] || 0), 1);
    const niceMax = Math.ceil(maxValue / 100000) * 100000 || 100000;
    const alturaMaxima = 200;
    const paddingTop = 20;
    const paddingBottom = 30;
    const alturaGrafico = alturaMaxima - paddingTop - paddingBottom;
    const larguraBarra = 100 / data.length;

    const numIntervalos = 6;
    const intervalo = niceMax / (numIntervalos - 1);
    const valoresEixoY = Array.from({ length: numIntervalos }, (_, i) => i * intervalo).reverse();

    const pontos = data.map((item, index) => {
      const x = (index * larguraBarra) + (larguraBarra / 2);
      const y = paddingTop + alturaGrafico - ((item[dataKey] || 0) / niceMax) * alturaGrafico;
      return { x: (x / 100) * (data.length * 80), y };
    });

    return (
      <div className="w-full">
        <div className="relative" style={{ height: `${alturaMaxima}px` }}>
          {/* Eixo Y */}
          <div className="absolute left-0 top-0 bottom-0 w-16 flex flex-col justify-between text-xs text-muted-foreground dark:text-gray-400">
            {valoresEixoY.map((valor, idx) => (
              <span key={idx} className="text-right pr-2">
                {formatNumber(valor)}
              </span>
            ))}
          </div>
          
          <div className="ml-16 relative" style={{ height: `${alturaMaxima}px` }}>
            <svg viewBox={`0 0 ${data.length * 80} ${alturaMaxima}`} preserveAspectRatio="none">
              {/* Linhas de grade horizontais */}
              {valoresEixoY.map((valor, idx) => {
                const yPos = paddingTop + alturaGrafico - ((valor / niceMax) * alturaGrafico);
                return (
                  <line
                    key={idx}
                    x1="0"
                    y1={yPos}
                    x2={data.length * 80}
                    y2={yPos}
                    stroke="#E5E7EB"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                  />
                );
              })}
              
              {/* Linha base */}
              <line
                x1="0"
                y1={paddingTop + alturaGrafico}
                x2={data.length * 80}
                y2={paddingTop + alturaGrafico}
                stroke="#9CA3AF"
                strokeWidth="1"
              />
              
              {/* Linha suave */}
              <path
                d={createSmoothPath(pontos)}
                fill="none"
                stroke={color}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              
              {/* Pontos */}
              {pontos.map((ponto, index) => (
                <circle
                  key={index}
                  cx={ponto.x}
                  cy={ponto.y}
                  r="5"
                  fill={color}
                  stroke="white"
                  strokeWidth="2"
                />
              ))}
            </svg>
            
            {/* Eixo X com meses */}
            <div className="absolute bottom-0 left-0 right-0 flex justify-between text-xs dark:text-gray-400">
              {data.map((item, index) => (
                <div key={index} className="text-center" style={{ width: `${larguraBarra}%` }}>
                  {item[labelKey].split('/')[0].toLowerCase()}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Componente de gráfico de barras (estilo CPL)
  const BarChart = ({ data, dataKey, labelKey, color, title }) => {
    const valores = data.map(d => parseFloat(d[dataKey]) || 0);
    const maxValue = Math.max(...valores, 0.01);
    const niceMax = Math.max(Math.ceil(maxValue * 10) / 10, 1);
    const alturaMaxima = 200;
    const paddingTop = 20;
    const paddingBottom = 30;
    const alturaGrafico = alturaMaxima - paddingTop - paddingBottom;
    const larguraBarra = 100 / data.length;
    const larguraBarraPx = (data.length * 80) / data.length * 0.6;
    const espacamento = (data.length * 80) / data.length * 0.4;

    const numIntervalos = 6;
    const intervalo = niceMax / (numIntervalos - 1);
    const valoresEixoY = Array.from({ length: numIntervalos }, (_, i) => i * intervalo).reverse();

    return (
      <div className="w-full">
        <div className="relative" style={{ height: `${alturaMaxima}px` }}>
          {/* Eixo Y */}
          <div className="absolute left-0 top-0 bottom-0 w-16 flex flex-col justify-between text-xs text-muted-foreground dark:text-gray-400">
            {valoresEixoY.map((valor, idx) => (
              <span key={idx} className="text-right pr-2">
                {formatCurrency(valor)}
              </span>
            ))}
          </div>
          
          <div className="ml-16 relative" style={{ height: `${alturaMaxima}px` }}>
            <svg viewBox={`0 0 ${data.length * 80} ${alturaMaxima}`} preserveAspectRatio="none">
              {/* Linhas de grade horizontais */}
              {valoresEixoY.map((valor, idx) => {
                const yPos = paddingTop + alturaGrafico - ((valor / niceMax) * alturaGrafico);
                return (
                  <line
                    key={idx}
                    x1="0"
                    y1={yPos}
                    x2={data.length * 80}
                    y2={yPos}
                    stroke="#E5E7EB"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                  />
                );
              })}
              
              {/* Linha base */}
              <line
                x1="0"
                y1={paddingTop + alturaGrafico}
                x2={data.length * 80}
                y2={paddingTop + alturaGrafico}
                stroke="#9CA3AF"
                strokeWidth="1"
              />
              
              {/* Barras */}
              {data.map((item, index) => {
                const valor = parseFloat(item[dataKey]) || 0;
                const altura = valor > 0 ? (valor / niceMax) * alturaGrafico : 0;
                const xPos = index * (larguraBarraPx + espacamento) + espacamento / 2;
                const yBase = paddingTop + alturaGrafico;
                const yTop = yBase - altura;
                const alturaFinal = valor > 0 ? Math.max(altura, 3) : 0;

                return (
                  <g key={index}>
                    {valor > 0 && (
                      <>
                        <motion.rect
                          x={xPos}
                          y={yTop}
                          width={larguraBarraPx}
                          height={alturaFinal}
                          fill={color}
                          rx="4"
                          initial={{ height: 0, y: yBase }}
                          animate={{ height: alturaFinal, y: yTop }}
                          transition={{ duration: 0.8, delay: index * 0.1 }}
                        />
                        <text
                          x={xPos + larguraBarraPx / 2}
                          y={yTop - 8}
                          textAnchor="middle"
                          fill="currentColor"
                          className="text-xs font-semibold text-gray-700 dark:text-gray-300"
                          style={{ fontSize: '11px' }}
                        >
                          {formatCurrency(valor)}
                        </text>
                      </>
                    )}
                  </g>
                );
              })}
            </svg>
            
            {/* Eixo X com semanas */}
            <div className="absolute bottom-0 left-0 right-0 flex justify-between text-xs dark:text-gray-400">
              {data.map((item, index) => (
                <div key={index} className="text-center" style={{ width: `${larguraBarra}%` }}>
                  {item[labelKey]}
                </div>
              ))}
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
        <title>Área do Cliente - Visão Administrativa - JB APEX</title>
      </Helmet>

      <div className="space-y-8">
        <header>
          <h1 className="text-3xl font-bold text-gray-800 dark:text-white">
            Área do Cliente - Visão Administrativa
          </h1>
          <p className="text-muted-foreground dark:text-gray-400">
            Dashboard agregado de todos os clientes com login no sistema ({clientesComLogin.length} clientes)
          </p>
        </header>

        {/* Cards Principais */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium dark:text-gray-300">Vendas do Mês</CardTitle>
              <ShoppingCart className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {formatNumber(mesAtual.totalVendas)}
              </div>
              <p className="text-xs text-muted-foreground dark:text-gray-400 mt-1">
                Mês atual (todos os clientes)
              </p>
            </CardContent>
          </Card>

          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium dark:text-gray-300">Faturamento</CardTitle>
              <DollarSign className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {formatCurrency(mesAtual.totalFaturamento)}
              </div>
              <p className="text-xs text-muted-foreground dark:text-gray-400 mt-1">
                Mês atual (todos os clientes)
              </p>
            </CardContent>
          </Card>

          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium dark:text-gray-300">Taxa de Conversão</CardTitle>
              <TrendingUp className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                {formatPercentage(mesAtual.taxaConversao)}
              </div>
              <p className="text-xs text-muted-foreground dark:text-gray-400 mt-1">
                Mês atual (todos os clientes)
              </p>
            </CardContent>
          </Card>

          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium dark:text-gray-300">Ticket Médio</CardTitle>
              <Target className="h-4 w-4 text-indigo-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                {formatCurrency(mesAtual.ticketMedio)}
              </div>
              <p className="text-xs text-muted-foreground dark:text-gray-400 mt-1">
                Mês atual (todos os clientes)
              </p>
            </CardContent>
          </Card>

          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium dark:text-gray-300">ROI</CardTitle>
              <BarChart3 className="h-4 w-4 text-cyan-500" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${mesAtual.roi >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {formatPercentage(mesAtual.roi)}
              </div>
              <p className="text-xs text-muted-foreground dark:text-gray-400 mt-1">
                Retorno sobre investimento (todos os clientes)
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Gráfico: Evolução do Ticket Médio */}
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-lg font-semibold dark:text-white">Evolução do Ticket Médio</CardTitle>
            <CardDescription>Comparativo mensal (todos os clientes)</CardDescription>
          </CardHeader>
          <CardContent>
            <LineChart
              data={dadosMensaisFaturamento}
              dataKey="ticketMedio"
              labelKey="mes"
              color="#06B6D4"
              title="Ticket Médio"
            />
          </CardContent>
        </Card>

        {/* Gráfico: Evolução de Faturamento */}
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-lg font-semibold dark:text-white">Evolução de Faturamento</CardTitle>
            <CardDescription>Comparativo mensal com acumulado (todos os clientes)</CardDescription>
          </CardHeader>
          <CardContent>
            <LineChart
              data={dadosMensaisFaturamento}
              dataKey="faturamentoAcumulado"
              labelKey="mes"
              color="#10B981"
              title="Faturamento Acumulado"
            />
          </CardContent>
        </Card>

        {/* Gráfico: Evolução CPL por Semana */}
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-lg font-semibold dark:text-white">Evolução CPL por Semana</CardTitle>
            <CardDescription>Custo por lead semanal do mês atual (todos os clientes)</CardDescription>
          </CardHeader>
          <CardContent>
            <BarChart
              data={cplSemanal}
              dataKey="cpl"
              labelKey="semana"
              color="#8B5CF6"
              title="CPL Semanal"
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default ClientAreaPanel;
