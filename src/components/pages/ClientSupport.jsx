import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { 
  Video, 
  Image as ImageIcon, 
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

const ClientSupport = () => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [resultadosDiarios, setResultadosDiarios] = useState([]);
  
  const clienteId = profile?.cliente_id;
  const isAdmin = profile?.role && ['superadmin', 'admin', 'colaborador'].includes(profile.role) && !clienteId;

  // Buscar dados
  useEffect(() => {
    const fetchData = async () => {
      // Se for admin sem cliente_id, buscar dados agregados de todos os clientes
      if (isAdmin) {
        setLoading(true);
        try {
          // Buscar todos os clientes com login
          const { data: profilesData } = await supabase
            .from('profiles')
            .select('cliente_id')
            .eq('role', 'cliente')
            .not('cliente_id', 'is', null);

          const clienteIds = [...new Set((profilesData || []).map(p => p.cliente_id).filter(Boolean))];

          if (clienteIds.length === 0) {
            setLoading(false);
            return;
          }

          // Buscar tarefas de todos os clientes
          const { data: tasksVideoArte } = await supabase
            .from('tarefas')
            .select('*')
            .in('client_id', clienteIds)
            .in('type', ['arte', 'video'])
            .in('status', ['published', 'scheduled']);

          const { data: tasksSocialMediaAll } = await supabase
            .from('tarefas')
            .select('*')
            .in('client_id', clienteIds)
            .in('type', ['post', 'reels', 'story', 'social_media']);

          const tasksSocialMedia = (tasksSocialMediaAll || []).filter(task => 
            task.status !== 'todo' && task.status !== 'standby'
          );

          const allTasks = [...(tasksVideoArte || []), ...tasksSocialMedia];
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
          setTasks(tasksMapeadas || []);

          // Buscar resultados diários de todos os clientes
          const { data: resultadosData } = await supabase
            .from('cliente_resultados_diarios')
            .select('id, cliente_id, data_referencia, leads, visitas_agendadas, visitas_realizadas, vendas, faturamento, investimento')
            .in('cliente_id', clienteIds)
            .order('data_referencia', { ascending: false });

          setResultadosDiarios(resultadosData || []);
        } catch (error) {
          console.error('Erro ao buscar dados agregados:', error);
          toast({
            title: 'Erro ao carregar dados',
            description: 'Não foi possível carregar os dados do dashboard.',
            variant: 'destructive'
          });
        } finally {
          setLoading(false);
        }
        return;
      }

      if (!clienteId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        // Buscar tarefas de vídeo e arte APENAS com status "published" ou "scheduled"
        // (se está agendado ou publicado, o vídeo foi feito)
        const { data: tasksVideoArte, error: errorVideoArte } = await supabase
          .from('tarefas')
          .select('*')
          .eq('client_id', clienteId)
          .in('type', ['arte', 'video'])
          .in('status', ['published', 'scheduled']);

        // Buscar TODAS as tarefas de redes sociais (se está em redes sociais, já foi publicada)
        // Excluir apenas "todo" e "standby"
        const { data: tasksSocialMediaAll, error: errorSocialMediaAll } = await supabase
          .from('tarefas')
          .select('*')
          .eq('client_id', clienteId)
          .in('type', ['post', 'reels', 'story', 'social_media']);

        // Filtrar redes sociais: excluir apenas "todo" e "standby"
        const tasksSocialMedia = (tasksSocialMediaAll || []).filter(task => 
          task.status !== 'todo' && task.status !== 'standby'
        );

        const tasksError = errorVideoArte || errorSocialMediaAll;
        const allTasks = [...(tasksVideoArte || []), ...tasksSocialMedia];
        
        // Debug: Log todas as tarefas encontradas
        console.log('🔍 Todas as tarefas encontradas:', allTasks.length);
        console.log('📹 Tarefas de vídeo/arte (published/scheduled):', tasksVideoArte?.length || 0);
        console.log('📱 Tarefas de social media (todas exceto todo/standby):', tasksSocialMedia.length);
        allTasks.forEach(task => {
          if (task.type === 'video' || task.type === 'reels') {
            console.log(`  Vídeo: ${task.title} - Status: ${task.status} - Type: ${task.type}`);
          }
        });
        
        // Não precisa filtrar mais, já filtramos acima
        const tasksData = allTasks;
        
        // Mapear tarefas de social media para type arte ou video baseado no type original
        // reels = video, post/story = arte
        const tasksMapeadas = tasksData.map(task => {
          if (['post', 'reels', 'story', 'social_media'].includes(task.type)) {
            if (task.type === 'reels') {
              return { ...task, type: 'video' };
            } else {
              // post, story, social_media -> arte
              return { ...task, type: 'arte' };
            }
          }
          return task;
        });
        
        // Debug: Contar vídeos finais
        const videosFinais = tasksMapeadas.filter(t => t.type === 'video');
        console.log('✅ Total de vídeos após filtros:', videosFinais.length);
        videosFinais.forEach(v => {
          console.log(`  Vídeo final: ${v.title} - Status: ${v.status}`);
        });

        // Buscar resultados diários - garantir que busca todos os campos necessários
        const { data: resultadosData, error: resultadosError } = await supabase
          .from('cliente_resultados_diarios')
          .select('id, cliente_id, data_referencia, leads, visitas_agendadas, visitas_realizadas, vendas, faturamento, investimento')
          .eq('cliente_id', clienteId)
          .order('data_referencia', { ascending: false });
        
        console.log('📊 ClientSupport - Resultados diários:', {
          total: resultadosData?.length || 0,
          primeiroRegistro: resultadosData?.[0],
          erro: resultadosError
        });

        if (tasksError) {
          console.error('Erro ao buscar tarefas:', tasksError);
        } else {
          setTasks(tasksMapeadas || []);
        }

        if (resultadosError) {
          console.error('Erro ao buscar resultados:', resultadosError);
        } else {
          console.log('📊 ClientSupport - Resultados diários carregados:', {
            total: resultadosData?.length || 0,
            primeiroRegistro: resultadosData?.[0],
            ultimoRegistro: resultadosData?.[resultadosData?.length - 1]
          });
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
  }, [clienteId, toast]);

  // Dados do mês atual
  const mesAtual = useMemo(() => {
    const hoje = new Date();
    const inicioMes = startOfMonth(hoje);
    const fimMes = endOfMonth(hoje);
    
    const dadosMes = resultadosDiarios.filter(item => {
      const data = new Date(item.data_referencia);
      return data >= inicioMes && data <= fimMes;
    });

    const totalVendas = dadosMes.reduce((sum, item) => sum + (item.vendas || 0), 0);
    const totalFaturamento = dadosMes.reduce((sum, item) => sum + parseFloat(item.faturamento || 0), 0);
    const totalLeads = dadosMes.reduce((sum, item) => sum + (item.leads || 0), 0);
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

  // Separar vídeos e artes
  const videos = tasks.filter(task => task.type === 'video');
  const artes = tasks.filter(task => task.type === 'arte');
  
  const totalVideos = videos.length;
  const totalArtes = artes.length;

  // Dados mensais acumulados de vídeos
  const videosMensais = useMemo(() => {
    const mesesMap = {};
    
    videos.forEach(task => {
      if (task.created_at) {
        const data = new Date(task.created_at);
        const mesAno = format(data, 'MMM/yyyy', { locale: ptBR });
        
        if (!mesesMap[mesAno]) {
          mesesMap[mesAno] = {
            mes: mesAno,
            total: 0
          };
        }
        mesesMap[mesAno].total += 1;
      }
    });

    return Object.values(mesesMap).sort((a, b) => {
      const dateA = new Date(a.mes);
      const dateB = new Date(b.mes);
      return dateA - dateB;
    });
  }, [videos]);

  // Dados mensais acumulados de artes
  const artesMensais = useMemo(() => {
    const mesesMap = {};
    
    artes.forEach(task => {
      if (task.created_at) {
        const data = new Date(task.created_at);
        const mesAno = format(data, 'MMM/yyyy', { locale: ptBR });
        
        if (!mesesMap[mesAno]) {
          mesesMap[mesAno] = {
            mes: mesAno,
            total: 0
          };
        }
        mesesMap[mesAno].total += 1;
      }
    });

    return Object.values(mesesMap).sort((a, b) => {
      const dateA = new Date(a.mes);
      const dateB = new Date(b.mes);
      return dateA - dateB;
    });
  }, [artes]);

  // Dados combinados de vídeos e artes por mês (para gráfico agrupado)
  const videosArtesAgrupados = useMemo(() => {
    const mesesMap = {};
    
    // Inicializar todos os meses de 2026 com valores zerados
    const anoAtual = 2026;
    for (let mes = 0; mes < 12; mes++) {
      const data = new Date(anoAtual, mes, 1);
      const mesAno = format(data, 'MMM/yyyy', { locale: ptBR });
      mesesMap[mesAno] = {
        mes: mesAno,
        videos: 0,
        artes: 0,
        dataCompleta: data,
        titulosVideos: [],
        titulosArtes: []
      };
    }
    
    // Preencher com dados reais de vídeos e artes
    // Somar todos os vídeos (published + scheduled) na mesma coluna
    [...videos, ...artes].forEach(task => {
      // Usar post_date se disponível (para agendados), senão usar created_at
      const dataReferencia = task.post_date || task.created_at;
      if (dataReferencia) {
        const data = new Date(dataReferencia);
        const mesAno = format(data, 'MMM/yyyy', { locale: ptBR });
        
        if (mesesMap[mesAno]) {
          if (task.type === 'video') {
            // Somar todos os vídeos (published e scheduled) na mesma coluna
            mesesMap[mesAno].videos += 1;
            if (task.title) {
              mesesMap[mesAno].titulosVideos.push(task.title);
            }
          } else if (task.type === 'arte') {
            // Somar todas as artes (published e scheduled) na mesma coluna
            mesesMap[mesAno].artes += 1;
            if (task.title) {
              mesesMap[mesAno].titulosArtes.push(task.title);
            }
          }
        }
      }
    });

    return Object.values(mesesMap).sort((a, b) => {
      return a.dataCompleta - b.dataCompleta;
    });
  }, [videos, artes]);

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
    
    // Preencher com dados reais
    resultadosDiarios.forEach(item => {
      const data = new Date(item.data_referencia);
      const mesAno = format(data, 'MMM/yyyy', { locale: ptBR });
      
      if (mesesMap[mesAno]) {
        mesesMap[mesAno].faturamento += parseFloat(item.faturamento || 0);
        mesesMap[mesAno].vendas += item.vendas || 0;
        mesesMap[mesAno].investimento += parseFloat(item.investimento || 0);
      }
    });

    return Object.values(mesesMap)
      .map(item => ({
        ...item,
        ticketMedio: item.vendas > 0 ? item.faturamento / item.vendas : 0,
        faturamentoAcumulado: 0 // Será calculado abaixo
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

  // CPL por semana do mês atual
  const cplSemanal = useMemo(() => {
    const hoje = new Date();
    const inicioMes = startOfMonth(hoje);
    const fimMes = endOfMonth(hoje);
    
    console.log('📊 CPL Semanal - Início:', {
      hoje: format(hoje, 'dd/MM/yyyy'),
      inicioMes: format(inicioMes, 'dd/MM/yyyy'),
      fimMes: format(fimMes, 'dd/MM/yyyy'),
      totalResultadosDiarios: resultadosDiarios.length
    });
    
    const semanas = eachWeekOfInterval({ start: inicioMes, end: fimMes }, { weekStartsOn: 1 });
    
    console.log('📊 CPL Semanal - Semanas encontradas:', semanas.length);
    
    const dadosSemanas = semanas.map((semana, index) => {
      const fimSemana = endOfWeek(semana, { weekStartsOn: 1 });
      
      const dadosSemana = resultadosDiarios.filter(item => {
        const data = new Date(item.data_referencia);
        return data >= semana && data <= fimSemana;
      });

      const totalInvestimento = dadosSemana.reduce((sum, item) => sum + parseFloat(item.investimento || 0), 0);
      const totalLeads = dadosSemana.reduce((sum, item) => sum + parseInt(item.leads || 0), 0);
      const cpl = totalLeads > 0 ? totalInvestimento / totalLeads : 0;

      console.log(`📊 Semana ${index + 1}:`, {
        periodo: `${format(semana, 'dd/MM')} - ${format(fimSemana, 'dd/MM')}`,
        registrosEncontrados: dadosSemana.length,
        totalInvestimento,
        totalLeads,
        cpl
      });

      return {
        semana: `Semana ${index + 1}`,
        cpl: parseFloat(cpl.toFixed(2)), // Garantir 2 casas decimais
        investimento: totalInvestimento,
        leads: totalLeads
      };
    });
    
    console.log('📊 CPL Semanal - Resultado final:', dadosSemanas);
    
    return dadosSemanas;
  }, [resultadosDiarios]);

  // Função para criar curva suave (bezier)
  const createSmoothPath = (points) => {
    if (points.length < 2) return '';
    
    let path = `M ${points[0].x} ${points[0].y}`;
    
    for (let i = 0; i < points.length - 1; i++) {
      const current = points[i];
      const next = points[i + 1];
      
      // Ponto de controle para curva suave
      const cp1x = current.x + (next.x - current.x) / 2;
      const cp1y = current.y;
      const cp2x = current.x + (next.x - current.x) / 2;
      const cp2y = next.y;
      
      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${next.x} ${next.y}`;
    }
    
    return path;
  };

  // Componente de gráfico de linha simples (estilo da imagem com curva suave)
  const LineChart = ({ data, dataKey, labelKey, color, title }) => {
    const maxValue = Math.max(...data.map(d => d[dataKey] || 0), 1);
    // Arredondar para cima para um valor "bonito" (ex: 500000, 1000000, etc)
    const niceMax = Math.ceil(maxValue / 100000) * 100000 || 100000;
    const alturaMaxima = 200;
    const paddingTop = 20;
    const paddingBottom = 30;
    const alturaGrafico = alturaMaxima - paddingTop - paddingBottom;
    const larguraBarra = 100 / data.length;
    
    // Calcular intervalos do eixo Y (ex: 0, 100000, 200000, 300000, 400000, 500000)
    const numIntervalos = 6;
    const intervalo = niceMax / (numIntervalos - 1);
    const valoresEixoY = Array.from({ length: numIntervalos }, (_, i) => i * intervalo).reverse();

    // Calcular pontos da linha
    const pontos = data.map((item, index) => {
      const x = (index * larguraBarra) + (larguraBarra / 2);
      const y = paddingTop + alturaGrafico - ((item[dataKey] || 0) / niceMax) * alturaGrafico;
      return { x: (x / 100) * (data.length * 80), y };
    });

    return (
      <div className="w-full">
        <div className="relative" style={{ height: `${alturaMaxima}px` }}>
          {/* Eixo Y com valores */}
          <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between pr-2" style={{ width: '60px' }}>
            {valoresEixoY.map((valor, idx) => (
              <span key={idx} className="text-xs text-gray-600 dark:text-gray-400">
                {formatNumber(valor)}
              </span>
            ))}
          </div>

          {/* Área do gráfico */}
          <div className="ml-16 relative" style={{ height: `${alturaMaxima}px` }}>
            <svg 
              className="w-full h-full" 
              viewBox={`0 0 ${data.length * 80} ${alturaMaxima}`} 
              preserveAspectRatio="none"
            >
              {/* Linhas de grade horizontais (grid lines) */}
              {valoresEixoY.map((valor, idx) => {
                const y = paddingTop + alturaGrafico - (valor / niceMax) * alturaGrafico;
                return (
                  <line
                    key={idx}
                    x1="0"
                    y1={y}
                    x2={data.length * 80}
                    y2={y}
                    stroke="#E5E7EB"
                    strokeWidth="1"
                    strokeDasharray="2,2"
                    opacity="0.5"
                  />
                );
              })}
              
              {/* Linha base (baseline no Y=0) */}
              <line
                x1="0"
                y1={paddingTop + alturaGrafico}
                x2={data.length * 80}
                y2={paddingTop + alturaGrafico}
                stroke="#9CA3AF"
                strokeWidth="1"
              />
              
              {/* Linha curva do gráfico */}
              <path
                d={createSmoothPath(pontos)}
                fill="none"
                stroke={color}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Pontos circulares */}
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
            
            {/* Eixo X com meses abreviados - todos os meses */}
            <div className="absolute bottom-0 left-0 right-0 flex justify-between text-xs dark:text-gray-400">
              {data.map((item, index) => {
                // Formatar mês para abreviação (ex: "jan", "fev", etc)
                const mesAbreviado = item[labelKey].split('/')[0].toLowerCase();
                return (
                  <div key={index} className="text-center" style={{ width: `${larguraBarra}%` }}>
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

  // Componente de gráfico de barras com linhas de grade (estilo CPL)
  const BarChart = ({ data, dataKey, labelKey, color, title }) => {
    const valores = data.map(d => parseFloat(d[dataKey]) || 0);
    const maxValue = Math.max(...valores, 0.01); // Mínimo de 0.01 para evitar divisão por zero
    // Arredondar para cima para um valor "bonito" (ex: 4.00, 5.00, 10.00, etc)
    const niceMax = Math.max(Math.ceil(maxValue * 10) / 10, 1);
    const alturaMaxima = 200;
    const paddingTop = 20;
    const paddingBottom = 30;
    const alturaGrafico = alturaMaxima - paddingTop - paddingBottom;
    const larguraBarra = 100 / data.length;
    
    // Calcular largura e espaçamento das barras
    const larguraTotal = data.length * 80;
    const larguraBarraPx = (larguraTotal / data.length) * 0.6; // 60% da largura disponível por barra
    const espacamento = (larguraTotal / data.length) * 0.4; // 40% de espaçamento
    
    // Calcular intervalos do eixo Y (ex: 0.00, 1.00, 2.00, 3.00, 4.00)
    const numIntervalos = 5;
    const intervalo = niceMax / (numIntervalos - 1);
    const valoresEixoY = Array.from({ length: numIntervalos }, (_, i) => i * intervalo).reverse();

    console.log('📊 BarChart CPL - Dados:', {
      data,
      valores,
      maxValue,
      niceMax,
      valoresEixoY,
      larguraBarraPx,
      espacamento
    });

    return (
      <div className="w-full">
        <div className="relative" style={{ height: `${alturaMaxima}px` }}>
          {/* Eixo Y com valores */}
          <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between pr-2" style={{ width: '60px' }}>
            {valoresEixoY.map((valor, idx) => (
              <span key={idx} className="text-xs text-gray-600 dark:text-gray-400">
                {valor.toFixed(2)}
              </span>
            ))}
          </div>

          {/* Área do gráfico */}
          <div className="ml-16 relative" style={{ height: `${alturaMaxima}px` }}>
            <svg 
              className="w-full h-full" 
              viewBox={`0 0 ${data.length * 80} ${alturaMaxima}`} 
              preserveAspectRatio="none"
            >
              {/* Linhas de grade horizontais (grid lines) */}
              {valoresEixoY.map((valor, idx) => {
                const y = paddingTop + alturaGrafico - (valor / niceMax) * alturaGrafico;
                return (
                  <line
                    key={idx}
                    x1="0"
                    y1={y}
                    x2={data.length * 80}
                    y2={y}
                    stroke="#E5E7EB"
                    strokeWidth="1"
                    strokeDasharray="2,2"
                    opacity="0.5"
                  />
                );
              })}
              
              {/* Linha base (baseline no Y=0) */}
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
                
                console.log(`📊 Barra ${index + 1}:`, {
                  semana: item[labelKey],
                  valor,
                  altura,
                  alturaGrafico,
                  niceMax,
                  xPos,
                  yTop,
                  yBase,
                  larguraBarraPx
                });
                
                // Garantir altura mínima visível mesmo para valores pequenos
                const alturaFinal = valor > 0 ? Math.max(altura, 3) : 0; // Mínimo 3px para valores > 0
                
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
                        {/* Valor acima da barra */}
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

  // Componente de gráfico de barras simples (soma vídeos + artes)
  const GroupedBarChart = ({ data, labelKey, videosKey, artesKey, videosColor, artesColor, title }) => {
    const [hoveredBar, setHoveredBar] = useState(null);
    const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
    const maxValue = Math.max(...data.map(d => Math.max(d[videosKey] || 0, d[artesKey] || 0)), 1);
    const alturaMaxima = 200;
    const alturaGrafico = alturaMaxima - 30; // Espaço para os labels dos meses
    const larguraBarra = 100 / data.length;
    const larguraGrupo = larguraBarra * 0.7; // 70% da largura disponível

    return (
      <div className="w-full">
        <div className="relative" style={{ height: `${alturaMaxima}px` }}>
          {/* Área do gráfico com padding inferior para os meses */}
          <div className="absolute inset-0 pb-8">
            <div className="relative w-full h-full flex items-end justify-between">
              {data.map((item, index) => {
                // Somar vídeos + artes na mesma coluna
                const total = (item[videosKey] || 0) + (item[artesKey] || 0);
                const alturaTotal = (total / maxValue) * alturaGrafico;
                const posicaoX = (index * larguraBarra) + (larguraBarra / 2) - (larguraGrupo / 2);
                const titulosVideos = item.titulosVideos || [];
                const titulosArtes = item.titulosArtes || [];
                const todosTitulos = [...titulosVideos, ...titulosArtes];

                return (
                  <div
                    key={index}
                    className="absolute flex items-end justify-center"
                    style={{
                      left: `${posicaoX}%`,
                      width: `${larguraGrupo}%`,
                      height: `${alturaGrafico}px`
                    }}
                  >
                    <motion.div
                      className="w-full rounded-t cursor-pointer hover:opacity-80 transition-opacity"
                      style={{
                        backgroundColor: videosColor, // Usar cor azul para a coluna única
                        height: `${alturaTotal}px`,
                        minHeight: total > 0 ? '2px' : '0px'
                      }}
                      initial={{ height: 0 }}
                      animate={{ height: alturaTotal }}
                      transition={{ duration: 0.8, delay: index * 0.1 }}
                      onMouseEnter={(e) => {
                        if (todosTitulos.length > 0) {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const containerRect = e.currentTarget.closest('.relative').getBoundingClientRect();
                          setHoveredBar({ type: 'total', index, titulos: todosTitulos, videos: item[videosKey] || 0, artes: item[artesKey] || 0 });
                          setTooltipPosition({ 
                            x: rect.left - containerRect.left + rect.width / 2, 
                            y: rect.top - containerRect.top 
                          });
                        }
                      }}
                      onMouseLeave={() => setHoveredBar(null)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          {/* Tooltip */}
          {hoveredBar && (
            <div
              className="absolute z-50 bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg p-3 max-w-xs pointer-events-none border border-gray-700"
              style={{
                left: `${tooltipPosition.x}px`,
                top: `${tooltipPosition.y - 10}px`,
                transform: 'translate(-50%, -100%)'
              }}
            >
              <div className="font-semibold mb-2 text-white">
                Total: {hoveredBar.titulos.length} ({hoveredBar.videos} vídeos + {hoveredBar.artes} artes)
              </div>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {hoveredBar.titulos.map((titulo, idx) => (
                  <div key={idx} className="text-gray-300 dark:text-gray-300 text-xs">
                    • {titulo}
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Eixo X com meses na parte inferior */}
          <div className="absolute bottom-0 left-0 right-0 flex justify-between">
            {data.map((item, index) => {
              // Formatar mês para abreviação (ex: "jan", "fev", etc)
              const mesAbreviado = item[labelKey].split('/')[0].toLowerCase();
              return (
                <div 
                  key={index} 
                  className="text-center text-xs dark:text-gray-400"
                  style={{ width: `${larguraBarra}%` }}
                >
                  {mesAbreviado}
                </div>
              );
            })}
          </div>
        </div>
        {/* Legenda melhorada */}
        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-center gap-3 text-sm">
            <div 
              className="w-4 h-4 rounded" 
              style={{ backgroundColor: videosColor }}
            ></div>
            <div className="flex flex-col">
              <span className="font-semibold dark:text-white">Total de Vídeos e Artes</span>
              <span className="text-xs text-muted-foreground dark:text-gray-400">
                Soma de vídeos (publicados + agendados) e artes (publicadas + agendadas)
              </span>
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
        <title>Dashboard - JB APEX</title>
      </Helmet>

      <div className="space-y-8">
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <h1 className="text-3xl font-bold bg-gradient-to-r from-orange-400 to-purple-600 bg-clip-text text-transparent dark:from-orange-400 dark:to-purple-400">
            Dashboard
          </h1>
          <p className="text-muted-foreground dark:text-gray-400 mt-2">
            {isAdmin 
              ? 'Visão administrativa - Dados agregados de todos os clientes com login'
              : `Bem-vindo, ${profile?.full_name || 'Cliente'}! Acompanhe seus resultados e métricas.`
            }
          </p>
        </motion.header>

        {/* Cards Principais */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <Card className="dark:bg-gray-800/50 dark:border-gray-700/50 border border-gray-200/50 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 bg-white/80 backdrop-blur-sm bg-gradient-to-br from-white to-gray-50/50 dark:from-gray-800/50 dark:to-gray-900/30">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-6">
                <CardTitle className="text-sm font-medium dark:text-gray-300">Vendas do Mês</CardTitle>
                <ShoppingCart className="h-5 w-5 text-green-500 dark:text-green-400" />
              </CardHeader>
              <CardContent className="p-6 pt-0">
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {formatNumber(mesAtual.totalVendas)}
                </div>
                <p className="text-xs text-muted-foreground dark:text-gray-400 mt-1">
                  Mês atual
                </p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
          >
            <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-2 border-green-400/60 dark:border-green-500/60 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-6">
                <CardTitle className="text-sm font-medium text-green-800 dark:text-green-300">Faturamento</CardTitle>
                <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
              </CardHeader>
              <CardContent className="p-6 pt-0">
                <div className="text-2xl font-bold text-green-700 dark:text-green-400">
                  {formatCurrency(mesAtual.totalFaturamento)}
                </div>
                <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                  Mês atual
                </p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.3 }}
          >
            <Card className="dark:bg-gray-800/50 dark:border-gray-700/50 border border-gray-200/50 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 bg-white/80 backdrop-blur-sm bg-gradient-to-br from-white to-orange-50/30 dark:from-gray-800/50 dark:to-orange-900/10">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-6">
                <CardTitle className="text-sm font-medium dark:text-gray-300">Taxa de Conversão</CardTitle>
                <TrendingUp className="h-5 w-5 text-orange-500 dark:text-orange-400" />
              </CardHeader>
              <CardContent className="p-6 pt-0">
                <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                  {formatPercentage(mesAtual.taxaConversao)}
                </div>
                <p className="text-xs text-muted-foreground dark:text-gray-400 mt-1">
                  Mês atual
                </p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.4 }}
          >
            <Card className="dark:bg-gray-800/50 dark:border-gray-700/50 border border-gray-200/50 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 bg-white/80 backdrop-blur-sm bg-gradient-to-br from-white to-indigo-50/30 dark:from-gray-800/50 dark:to-indigo-900/10">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-6">
                <CardTitle className="text-sm font-medium dark:text-gray-300">Ticket Médio</CardTitle>
                <Target className="h-5 w-5 text-indigo-500 dark:text-indigo-400" />
              </CardHeader>
              <CardContent className="p-6 pt-0">
                <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                  {formatCurrency(mesAtual.ticketMedio)}
                </div>
                <p className="text-xs text-muted-foreground dark:text-gray-400 mt-1">
                  Mês atual
                </p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.5 }}
          >
            <Card className="dark:bg-gray-800/50 dark:border-gray-700/50 border border-gray-200/50 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 bg-white/80 backdrop-blur-sm bg-gradient-to-br from-white to-cyan-50/30 dark:from-gray-800/50 dark:to-cyan-900/10">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-6">
                <CardTitle className="text-sm font-medium dark:text-gray-300">ROI</CardTitle>
                <BarChart3 className="h-5 w-5 text-cyan-500 dark:text-cyan-400" />
              </CardHeader>
              <CardContent className="p-6 pt-0">
                <div className={`text-2xl font-bold ${mesAtual.roi >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {formatPercentage(mesAtual.roi)}
                </div>
                <p className="text-xs text-muted-foreground dark:text-gray-400 mt-1">
                  Retorno sobre investimento
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Gráficos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Gráfico de Evolução do Ticket Médio */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.6 }}
          >
            <Card className="dark:bg-gray-800/50 dark:border-gray-700/50 border border-gray-200/50 shadow-sm hover:shadow-md transition-all duration-200 bg-white/80 backdrop-blur-sm">
              <CardHeader className="p-6">
                <CardTitle className="dark:text-white">Evolução do Ticket Médio</CardTitle>
                <CardDescription className="dark:text-gray-400">
                  Comparativo mensal
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 pt-0">
                {dadosMensaisFaturamento.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground dark:text-gray-400">
                    Nenhum dado disponível
                  </div>
                ) : (
                  <LineChart
                    data={dadosMensaisFaturamento}
                    dataKey="ticketMedio"
                    labelKey="mes"
                    color="#06B6D4"
                    title="Ticket Médio (R$)"
                  />
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Gráfico de Evolução de Faturamento Acumulado */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.7 }}
          >
            <Card className="dark:bg-gray-800/50 dark:border-gray-700/50 border border-gray-200/50 shadow-sm hover:shadow-md transition-all duration-200 bg-white/80 backdrop-blur-sm">
              <CardHeader className="p-6">
                <CardTitle className="dark:text-white">Evolução de Faturamento</CardTitle>
                <CardDescription className="dark:text-gray-400">
                  Comparativo mensal
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 pt-0">
                {dadosMensaisFaturamento.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground dark:text-gray-400">
                    Nenhum dado disponível
                  </div>
                ) : (
                  <LineChart
                    data={dadosMensaisFaturamento}
                    dataKey="faturamentoAcumulado"
                    labelKey="mes"
                    color="#10B981"
                    title="Faturamento Acumulado (R$)"
                  />
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Gráfico de CPL por Semana */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.8 }}
          >
            <Card className="dark:bg-gray-800/50 dark:border-gray-700/50 border border-gray-200/50 shadow-sm hover:shadow-md transition-all duration-200 bg-white/80 backdrop-blur-sm">
              <CardHeader className="p-6">
                <CardTitle className="dark:text-white">Evolução CPL por Semana</CardTitle>
                <CardDescription className="dark:text-gray-400">
                  Semanas do mês atual
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 pt-0">
                {cplSemanal.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground dark:text-gray-400">
                    Nenhum dado disponível
                  </div>
                ) : (
                  <BarChart
                    data={cplSemanal}
                    dataKey="cpl"
                    labelKey="semana"
                    color="#06B6D4"
                    title="CPL por Semana (R$)"
                  />
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </>
  );
};

export default ClientSupport;
