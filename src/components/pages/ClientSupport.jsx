import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import ClientPortalReports from '@/components/client/ClientPortalReports';
import ClientPortalPerformance from '@/components/client/ClientPortalPerformance';
import ClientPortalNotices from '@/components/client/ClientPortalNotices';
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
  BarChart3,
  Activity,
  ChevronDown,
  LayoutDashboard,
  ArrowUpRight,
  User,
  UserCheck,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachWeekOfInterval, eachMonthOfInterval, subMonths, startOfDay, endOfDay, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { TooltipCustom } from '@/components/ui/tooltip-custom';
import { MiniCrmBoard, useMiniCrmSummary } from '@/components/pages/MiniCrmSummary';
import { loadDashboardMetaSpend } from '@/lib/dashboardMetaSpend';
import { rowFromContact, statusLabel } from '@/lib/miniCrm';
import { resolvePainelPeriod } from '@/lib/trafegoPainelHref';

// Função para formatar moeda
function ymd(date) {
  const value = date instanceof Date ? date : new Date(date);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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
  const [resultadosSemanais, setResultadosSemanais] = useState([]);
  const [periodo, setPeriodo] = useState('mes_atual');
  const [dateRange, setDateRange] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  
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

          // Buscar resultados semanais (tráfego) de todos os clientes
          const { data: resultadosSemanaisData } = await supabase
            .from('cliente_resultados_semanais')
            .select('id, cliente_id, semana_inicio, semana_fim, investimento')
            .in('cliente_id', clienteIds)
            .order('semana_inicio', { ascending: false });

          setResultadosSemanais(resultadosSemanaisData || []);
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

        // Buscar resultados semanais (tráfego) do cliente
        const { data: resultadosSemanaisData, error: resultadosSemanaisError } = await supabase
          .from('cliente_resultados_semanais')
          .select('id, cliente_id, semana_inicio, semana_fim, investimento')
          .eq('cliente_id', clienteId)
          .order('semana_inicio', { ascending: false });

        console.log('📊 ClientSupport - Resultados semanais (tráfego):', {
          total: resultadosSemanaisData?.length || 0,
          primeiroRegistro: resultadosSemanaisData?.[0],
          erro: resultadosSemanaisError
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

        if (resultadosSemanaisError) {
          console.error('Erro ao buscar resultados semanais:', resultadosSemanaisError);
        } else {
          setResultadosSemanais(resultadosSemanaisData || []);
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

  // Calcular período baseado na seleção
  const periodoCalculado = useMemo(() => {
    const hoje = new Date();
    let inicio, fim;

    if (periodo === 'custom' && dateRange?.from && dateRange?.to) {
      inicio = startOfDay(dateRange.from);
      fim = endOfDay(dateRange.to);
    } else if (periodo === '7') {
      inicio = startOfDay(subDays(hoje, 7));
      fim = endOfDay(hoje);
    } else if (periodo === '15') {
      inicio = startOfDay(subDays(hoje, 15));
      fim = endOfDay(hoje);
    } else if (periodo === '30') {
      inicio = startOfDay(subDays(hoje, 30));
      fim = endOfDay(hoje);
    } else if (periodo === 'mes_anterior') {
      const mesAnterior = subMonths(hoje, 1);
      inicio = startOfDay(startOfMonth(mesAnterior));
      fim = endOfDay(endOfMonth(mesAnterior));
    } else { // mes_atual (padrão)
      inicio = startOfDay(startOfMonth(hoje));
      fim = endOfDay(endOfMonth(hoje));
    }

    return { inicio, fim };
  }, [periodo, dateRange]);

  // Dados do período selecionado
  const mesAtual = useMemo(() => {
    const { inicio, fim } = periodoCalculado;
    
    // Filtrar dados diários do período selecionado
    const dadosMes = resultadosDiarios.filter(item => {
      const data = startOfDay(new Date(item.data_referencia));
      return data >= inicio && data <= fim;
    });

    // Filtrar dados semanais (tráfego) que se intersectam com o período
    // Uma semana se intersecta se: semana_inicio <= fim E semana_fim >= inicio
    const dadosSemanaisMes = resultadosSemanais.filter(item => {
      const semanaInicio = startOfDay(new Date(item.semana_inicio));
      const semanaFim = endOfDay(new Date(item.semana_fim));
      return semanaInicio <= fim && semanaFim >= inicio;
    });

    const totalVendas = dadosMes.reduce((sum, item) => sum + (item.vendas || 0), 0);
    const totalFaturamento = dadosMes.reduce((sum, item) => sum + parseFloat(item.faturamento || 0), 0);
    const totalLeads = dadosMes.reduce((sum, item) => sum + (item.leads || 0), 0);
    
    // Investimento: somar dados diários + dados semanais (tráfego)
    const investimentoDiario = dadosMes.reduce((sum, item) => sum + parseFloat(item.investimento || 0), 0);
    const investimentoSemanal = dadosSemanaisMes.reduce((sum, item) => sum + parseFloat(item.investimento || 0), 0);
    const totalInvestimento = investimentoDiario + investimentoSemanal;
    
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
  }, [resultadosDiarios, resultadosSemanais, periodoCalculado]);

  const { ready: crmReady, summary: crmResumo, rows: crmRows, statuses: crmStatuses } = useMiniCrmSummary(clienteId, periodoCalculado.inicio, periodoCalculado.fim);
  const painel = useMemo(() => {
    if (!crmResumo) return mesAtual;
    const leads = crmResumo.leads;
    const vendas = crmResumo.vendas;
    const faturamento = Number(crmResumo.valor) || 0;
    const investimento = mesAtual.totalInvestimento;
    return {
      ...mesAtual,
      totalLeads: leads,
      totalVendas: vendas,
      totalFaturamento: faturamento,
      taxaConversao: leads ? (vendas / leads) * 100 : 0,
      ticketMedio: crmResumo.ticket,
      roi: investimento > 0 ? ((faturamento - investimento) / investimento) * 100 : 0,
      qualificados: crmResumo.qualificados,
      noShow: crmResumo.noShow,
      agendamentos: crmResumo.agendamentos,
      fromCrm: true,
    };
  }, [crmResumo, mesAtual]);

  const [metaSpend, setMetaSpend] = useState(null);
  const [metaDaily, setMetaDaily] = useState([]);
  const [yearRows, setYearRows] = useState([]);

  useEffect(() => {
    if (!clienteId || !painel.fromCrm) {
      setMetaSpend(null);
      setMetaDaily([]);
      return undefined;
    }
    let cancel = false;
    const since = ymd(periodoCalculado.inicio);
    const untilDate = periodoCalculado.fim > new Date() ? new Date() : periodoCalculado.fim;
    const until = ymd(untilDate);
    const alternates = [];
    if (periodo === 'mes_atual') alternates.push(resolvePainelPeriod('mes'));
    if (periodo === 'mes_anterior') alternates.push(resolvePainelPeriod('mes_passado'));
    if (periodo === '7') alternates.push(resolvePainelPeriod('7d'));
    if (periodo === '30') alternates.push(resolvePainelPeriod('30d'));
    loadDashboardMetaSpend(clienteId, since, until, alternates)
      .then((result) => {
        if (cancel) return;
        setMetaSpend(result.spend);
        setMetaDaily(result.daily || []);
      })
      .catch(() => {
        if (!cancel) setMetaSpend(null);
      });
    return () => {
      cancel = true;
    };
  }, [clienteId, painel.fromCrm, periodo, periodoCalculado.inicio, periodoCalculado.fim]);

  useEffect(() => {
    if (!clienteId || !painel.fromCrm) {
      setYearRows([]);
      return undefined;
    }
    let cancel = false;
    const year = new Date().getFullYear();
    supabase
      .from('cliente_whatsapp_contact')
      .select('first_seen_at, mini_crm')
      .eq('cliente_id', clienteId)
      .gte('first_seen_at', `${year}-01-01T00:00:00-03:00`)
      .lte('first_seen_at', `${year}-12-31T23:59:59-03:00`)
      .limit(5000)
      .then(({ data }) => {
        if (!cancel) setYearRows((data || []).map(rowFromContact));
      });
    return () => {
      cancel = true;
    };
  }, [clienteId, painel.fromCrm]);

  const emNegociacao = useMemo(() => (
    (crmRows || []).filter((row) => {
      const label = statusLabel(crmStatuses, row.status) || row.status;
      return row.status === 'Em Negociação' || label === 'Em Negociação';
    }).length
  ), [crmRows, crmStatuses]);

  const serieAnual = useMemo(() => {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const meses = Array.from({ length: 12 }, (_, mes) => {
      const data = new Date(ano, mes, 1);
      return {
        mes: format(data, 'MMM/yyyy', { locale: ptBR }),
        faturamento: 0,
        vendas: 0,
        ticketMedio: 0,
        dataCompleta: data,
      };
    });
    (yearRows || []).forEach((row) => {
      if (row.status !== 'Venda Realizada') return;
      const stamp = row.data_venda || row.data;
      const data = new Date(row.data_venda ? `${row.data_venda}T12:00:00` : stamp);
      if (Number.isNaN(data.getTime()) || data.getFullYear() !== ano) return;
      const item = meses[data.getMonth()];
      item.faturamento += Number(row.valor) || 0;
      item.vendas += 1;
    });
    return meses.map((item) => ({
      ...item,
      ticketMedio: item.vendas ? item.faturamento / item.vendas : 0,
    }));
  }, [yearRows]);

  const cplMeta = useMemo(() => {
    if (!painel.fromCrm || !metaDaily.length) return [];
    const fim = periodoCalculado.fim > new Date() ? new Date() : periodoCalculado.fim;
    const semanas = eachWeekOfInterval(
      { start: periodoCalculado.inicio, end: fim },
      { weekStartsOn: 1 },
    );
    return semanas.map((semana, index) => {
      const inicioSemana = startOfDay(semana > periodoCalculado.inicio ? semana : periodoCalculado.inicio);
      const fimSemana = endOfDay(endOfWeek(semana, { weekStartsOn: 1 }) < fim ? endOfWeek(semana, { weekStartsOn: 1 }) : fim);
      const spend = metaDaily.reduce((sum, item) => {
        const data = startOfDay(new Date(`${item.day}T12:00:00`));
        return data >= inicioSemana && data <= fimSemana ? sum + (Number(item.spend) || 0) : sum;
      }, 0);
      const leads = (crmRows || []).filter((row) => {
        const data = startOfDay(new Date(row.data));
        return data >= inicioSemana && data <= fimSemana && String(row.nome || '').trim();
      }).length;
      return {
        semana: `Semana ${index + 1}`,
        cpl: leads > 0 ? Number((spend / leads).toFixed(2)) : null,
      };
    });
  }, [painel.fromCrm, metaDaily, periodoCalculado, crmRows]);

  const periodoLegenda = {
    7: 'Últimos 7 dias',
    15: 'Últimos 15 dias',
    30: 'Últimos 30 dias',
    mes_atual: 'Mês atual',
    mes_anterior: 'Mês anterior',
    custom: 'Período',
  }[periodo] || 'Período';

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

  // Dados combinados de vídeos e artes por mês (últimos 12 meses)
  const videosArtesAgrupados = useMemo(() => {
    const hoje = new Date();
    const inicioPeriodo = startOfMonth(subMonths(hoje, 11));
    const fimPeriodo = endOfMonth(hoje);
    
    // Gerar array com os últimos 12 meses
    const meses = eachMonthOfInterval({ start: inicioPeriodo, end: fimPeriodo });
    
    // Garantir que sempre temos exatamente 12 meses
    const mesesCompletos = meses.length === 12 ? meses : (() => {
      const mesesCorrigidos = [];
      for (let i = 11; i >= 0; i--) {
        mesesCorrigidos.push(startOfMonth(subMonths(hoje, i)));
      }
      return mesesCorrigidos;
    })();
    
    // Inicializar mapa com os últimos 12 meses
    const mesesMap = {};
    mesesCompletos.forEach(mes => {
      const mesAno = format(mes, 'MMM/yyyy', { locale: ptBR });
      mesesMap[mesAno] = {
        mes: mesAno,
        videos: 0,
        artes: 0,
        dataCompleta: mes,
        titulosVideos: [],
        titulosArtes: []
      };
    });
    
    // Preencher com dados reais de vídeos e artes dos últimos 12 meses
    [...videos, ...artes].forEach(task => {
      // Usar post_date se disponível (para agendados), senão usar created_at
      const dataReferencia = task.post_date || task.created_at;
      if (dataReferencia) {
        try {
          const data = new Date(dataReferencia);
          const dataInicio = startOfDay(startOfMonth(data));
          const dataFim = endOfDay(endOfMonth(data));
          
          // Verificar se a data está dentro do período dos últimos 12 meses
          if (dataInicio >= inicioPeriodo && dataFim <= fimPeriodo) {
            const mesAno = format(data, 'MMM/yyyy', { locale: ptBR });
            
            if (mesesMap[mesAno]) {
              if (task.type === 'video') {
                mesesMap[mesAno].videos += 1;
                if (task.title) {
                  mesesMap[mesAno].titulosVideos.push(task.title);
                }
              } else if (task.type === 'arte') {
                mesesMap[mesAno].artes += 1;
                if (task.title) {
                  mesesMap[mesAno].titulosArtes.push(task.title);
                }
              }
            }
          }
        } catch (error) {
          console.error('Erro ao processar data da tarefa:', error);
        }
      }
    });

    // Ordenar do mais recente para o mais antigo (último mês primeiro)
    return Object.values(mesesMap).sort((a, b) => {
      return b.dataCompleta - a.dataCompleta;
    });
  }, [videos, artes]);

  // Dados mensais de faturamento e ticket médio (com todos os meses do ano atual)
  const dadosMensaisFaturamento = useMemo(() => {
    const mesesMap = {};
    
    // Usar o ano atual dinamicamente
    const hoje = new Date();
    const anoAtual = hoje.getFullYear();
    
    // Inicializar todos os meses do ano atual
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
    
    // Filtrar apenas dados do ano atual
    const anoAtualInicio = new Date(anoAtual, 0, 1);
    const anoAtualFim = new Date(anoAtual, 11, 31, 23, 59, 59);
    
    // Preencher com dados reais do ano atual
    resultadosDiarios.forEach(item => {
      const data = new Date(item.data_referencia);
      
      // Filtrar apenas dados do ano atual
      if (data >= anoAtualInicio && data <= anoAtualFim) {
        const mesAno = format(data, 'MMM/yyyy', { locale: ptBR });
        
        if (mesesMap[mesAno]) {
          const faturamento = parseFloat(item.faturamento || 0);
          mesesMap[mesAno].faturamento += faturamento;
          mesesMap[mesAno].vendas += item.vendas || 0;
          mesesMap[mesAno].investimento += parseFloat(item.investimento || 0);
        }
      }
    });

    // Debug: verificar dados por mês
    console.log('📊 Dados mensais de faturamento:', Object.values(mesesMap).map(m => ({
      mes: m.mes,
      faturamento: m.faturamento,
      temDados: m.faturamento > 0
    })));

    const dadosOrdenados = Object.values(mesesMap)
      .map(item => ({
        ...item,
        ticketMedio: item.vendas > 0 ? item.faturamento / item.vendas : 0,
        faturamentoAcumulado: 0 // Será calculado abaixo
      }))
      .sort((a, b) => {
        return a.dataCompleta - b.dataCompleta;
      });

    // Calcular acumulado: só soma meses com dados reais, meses futuros mantêm último valor conhecido
    let ultimoAcumulado = 0;
    const mesAtual = hoje.getMonth();
    const anoAtualHoje = hoje.getFullYear();
    
    return dadosOrdenados.map((item, index) => {
      const itemMes = item.dataCompleta.getMonth();
      const itemAno = item.dataCompleta.getFullYear();
      const isMesFuturo = itemAno > anoAtualHoje || (itemAno === anoAtualHoje && itemMes > mesAtual);
      
      // Se o mês tem faturamento > 0 e não é futuro, adiciona ao acumulado
      if (item.faturamento > 0 && !isMesFuturo) {
        ultimoAcumulado += item.faturamento;
      }
      // Se não tem dados ou é futuro, mantém o último acumulado conhecido
      return { ...item, faturamentoAcumulado: ultimoAcumulado };
    });
  }, [resultadosDiarios]);

  // CPL por semana do período selecionado
  const cplSemanal = useMemo(() => {
    const { inicio, fim } = periodoCalculado;
    
    // Filtrar resultados diários do período selecionado
    const resultadosMes = resultadosDiarios.filter(item => {
      const data = startOfDay(new Date(item.data_referencia));
      return data >= inicio && data <= fim;
    });
    
    // Gerar semanas apenas dentro do período
    const semanas = eachWeekOfInterval(
      { start: inicio, end: fim }, 
      { weekStartsOn: 1 }
    );
    
    const dadosSemanas = semanas.map((semana, index) => {
      // Garantir que a semana não ultrapasse os limites do período
      const inicioSemana = startOfDay(semana > inicio ? semana : inicio);
      const fimSemana = endOfDay(
        endOfWeek(semana, { weekStartsOn: 1 }) < fim 
          ? endOfWeek(semana, { weekStartsOn: 1 }) 
          : fim
      );
      
      // Filtrar dados da semana com datas normalizadas
      const dadosSemana = resultadosMes.filter(item => {
        const data = startOfDay(new Date(item.data_referencia));
        return data >= inicioSemana && data <= fimSemana;
      });

      const totalInvestimento = dadosSemana.reduce(
        (sum, item) => sum + parseFloat(item.investimento || 0), 
        0
      );
      const totalLeads = dadosSemana.reduce(
        (sum, item) => sum + parseInt(item.leads || 0), 
        0
      );
      
      // Calcular CPL: se não há leads mas há investimento, retornar null ou valor especial
      const cpl = totalLeads > 0 
        ? totalInvestimento / totalLeads 
        : (totalInvestimento > 0 ? null : 0);

      return {
        semana: `Semana ${index + 1}`,
        cpl: cpl !== null ? parseFloat(cpl.toFixed(2)) : null,
        investimento: totalInvestimento,
        leads: totalLeads
      };
    });
    
    return dadosSemanas;
  }, [resultadosDiarios, periodoCalculado]);

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
    const [hoveredPoint, setHoveredPoint] = useState(null);
    const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
    const svgContainerRef = useRef(null);
    
    // Verificar se há dados
    if (!data || data.length === 0) {
      return (
        <div className="w-full flex items-center justify-center" style={{ height: '200px' }}>
          <div className="text-slate-400 text-sm">Nenhum dado disponível</div>
        </div>
      );
    }
    
    // Constantes do gráfico
    const alturaMaxima = 200;
    const paddingTop = 20;
    const paddingBottom = 30;
    const paddingLeft = 0;
    const paddingRight = 0;
    const alturaGrafico = alturaMaxima - paddingTop - paddingBottom;
    
    // Calcular valores do eixo Y
    const maxValue = Math.max(...data.map(d => d[dataKey] || 0), 0);
    let niceMax = 100000;
    if (maxValue > 0) {
      if (maxValue >= 100000) {
        niceMax = Math.ceil(maxValue / 100000) * 100000;
      } else if (maxValue >= 10000) {
        niceMax = Math.ceil(maxValue / 10000) * 10000;
      } else if (maxValue >= 1000) {
        niceMax = Math.ceil(maxValue / 1000) * 1000;
      } else if (maxValue >= 100) {
        niceMax = Math.ceil(maxValue / 100) * 100;
      } else if (maxValue >= 10) {
        niceMax = Math.ceil(maxValue / 10) * 10;
      } else {
        niceMax = Math.max(maxValue * 1.2, 10); // Adicionar 20% de margem para valores pequenos
      }
    } else {
      // Se todos os valores são zero, usar um valor padrão pequeno para manter a escala
      niceMax = 10;
    }
    const valoresEixoY = [niceMax, niceMax / 2, 0];
    
    // Calcular largura do viewBox baseada no número de pontos
    // Usar espaçamento uniforme: cada ponto ocupa 100 unidades no viewBox
    const larguraViewBox = data.length > 1 
      ? Math.max((data.length - 1) * 100 + 200, 800) 
      : data.length === 1 
        ? 800 
        : 800;
    const espacamentoPontos = data.length > 1 ? (larguraViewBox - 200) / (data.length - 1) : 0;
    const pontoInicialX = data.length > 1 ? 100 : larguraViewBox / 2;
    
    // Calcular pontos da linha usando coordenadas absolutas consistentes
    const baseY = paddingTop + alturaGrafico;
    const pontos = data.map((item, index) => {
      const x = pontoInicialX + (index * espacamentoPontos);
      const valor = item[dataKey] || 0;
      // Garantir que valores zero fiquem exatamente na base
      const y = valor === 0 
        ? baseY 
        : paddingTop + alturaGrafico - ((valor / niceMax) * alturaGrafico);
      return { 
        x,
        y,
        value: valor,
        label: item[labelKey],
        index,
        rawData: item
      };
    });

    // Criar o path para a área preenchida - garantir que fecha corretamente na base
    // A área deve ir da linha até a base (zero) do gráfico
    const areaPath = pontos.length > 0 
      ? `${createSmoothPath(pontos)} L ${pontos[pontos.length - 1].x} ${baseY} L ${pontos[0].x} ${baseY} Z`
      : '';

    // Função para calcular posição do tooltip
    const handlePointHover = (index, event) => {
      if (!svgContainerRef.current) return;
      
      setHoveredPoint(index);
      const ponto = pontos[index];
      
      // Calcular posição relativa ao container SVG
      const svgElement = svgContainerRef.current.querySelector('svg');
      if (svgElement) {
        const containerRect = svgContainerRef.current.getBoundingClientRect();
        const svgRect = svgElement.getBoundingClientRect();
        
        // Converter coordenada do viewBox para pixel do container
        const viewBoxWidth = larguraViewBox;
        const svgWidth = svgRect.width;
        const xPercent = (ponto.x / viewBoxWidth);
        let xPixel = xPercent * svgWidth;
        
        // Posição Y: acima do ponto
        const viewBoxHeight = alturaMaxima;
        const svgHeight = svgRect.height;
        const yPercent = (ponto.y / viewBoxHeight);
        let yPixel = yPercent * svgHeight;
        
        // Ajustar para ficar acima do ponto
        yPixel = Math.max(40, yPixel - 15);
        
        // Garantir que o tooltip não saia dos limites (estimativa de largura ~120px)
        const tooltipHalfWidth = 60;
        xPixel = Math.max(tooltipHalfWidth, Math.min(svgWidth - tooltipHalfWidth, xPixel));
        
        setTooltipPosition({
          x: xPixel,
          y: yPixel
        });
      }
    };

    return (
      <div className="w-full">
        <div className="relative" style={{ height: `${alturaMaxima}px` }}>
          {/* Eixo Y com valores - Simplificado */}
          <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between pr-2 py-[18px]" style={{ width: '50px' }}>
            {valoresEixoY.map((valor, idx) => (
              <span key={idx} className="text-[10px] font-medium text-slate-400">
                {valor >= 1000 ? `${(valor / 1000).toFixed(0)}k` : valor}
              </span>
            ))}
          </div>

          {/* Área do gráfico */}
          <div ref={svgContainerRef} className="ml-14 relative" style={{ height: `${alturaMaxima}px` }}>
            <svg 
              className="w-full h-full overflow-visible" 
              viewBox={`0 0 ${larguraViewBox} ${alturaMaxima}`} 
              preserveAspectRatio="xMidYMid meet"
              width="100%"
              height="100%"
            >
              <defs>
                <linearGradient id={`gradient-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity="0.2" />
                  <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Linha de grade no meio */}
              <line
                x1={paddingLeft}
                y1={paddingTop + alturaGrafico / 2}
                x2={larguraViewBox - paddingRight}
                y2={paddingTop + alturaGrafico / 2}
                stroke="#E2E8F0"
                strokeWidth="1"
                strokeDasharray="4,4"
              />
              
              {/* Área preenchida - sempre renderizar quando há pontos */}
              {pontos.length > 0 && areaPath && (
                <path
                  d={areaPath}
                  fill={`url(#gradient-${dataKey})`}
                />
              )}
              
              {/* Linha curva do gráfico - sempre renderizar quando há 2+ pontos */}
              {pontos.length >= 2 && createSmoothPath(pontos) && (
                <path
                  d={createSmoothPath(pontos)}
                  fill="none"
                  stroke={color}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              
              {/* Linha reta quando há apenas 1 ponto ou quando a linha suave não pode ser criada */}
              {pontos.length === 1 && (
                <line
                  x1={pontos[0].x}
                  y1={pontos[0].y}
                  x2={pontos[0].x}
                  y2={baseY}
                  stroke={color}
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              )}
              
              {/* Pontos interativos com hover */}
              {pontos.map((ponto, index) => (
                <g key={index}>
                  {/* Área invisível para detectar hover - maior para facilitar interação */}
                  <circle
                    cx={ponto.x}
                    cy={ponto.y}
                    r="25"
                    fill="transparent"
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={(e) => {
                      e.stopPropagation();
                      handlePointHover(index, e);
                    }}
                    onMouseMove={(e) => {
                      e.stopPropagation();
                      if (hoveredPoint === index) {
                        handlePointHover(index, e);
                      }
                    }}
                    onMouseLeave={() => {
                      setHoveredPoint(null);
                    }}
                  />
                  {/* Ponto visível */}
                  <circle
                    cx={ponto.x}
                    cy={ponto.y}
                    r={hoveredPoint === index ? "6" : "4"}
                    fill={color}
                    stroke="white"
                    strokeWidth="2"
                    style={{ transition: 'r 0.2s' }}
                    pointerEvents="none"
                  />
                </g>
              ))}
            </svg>
            
            {/* Tooltip */}
            {hoveredPoint !== null && pontos[hoveredPoint] && (
              <div
                className="absolute z-50 bg-slate-800 text-white text-xs rounded-lg shadow-xl px-3 py-2 pointer-events-none border border-slate-700 whitespace-nowrap"
                style={{
                  left: `${tooltipPosition.x}px`,
                  top: `${tooltipPosition.y}px`,
                  transform: 'translate(-50%, -100%)'
                }}
              >
                <div className="font-semibold mb-1 text-white">{pontos[hoveredPoint].label}</div>
                <div className="text-white">
                  {dataKey === 'faturamento' || dataKey === 'faturamentoAcumulado' ? (
                    pontos[hoveredPoint].value > 0 ? (
                      <>
                        <div>{formatCurrency(pontos[hoveredPoint].value)}</div>
                        {dataKey === 'faturamentoAcumulado' && (
                          <div className="text-slate-300 text-[10px] mt-0.5">
                            Mês: {formatCurrency(pontos[hoveredPoint].rawData.faturamento)}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-slate-300">Sem dados registrados</div>
                    )
                  ) : dataKey === 'ticketMedio' ? formatCurrency(pontos[hoveredPoint].value) : 
                   formatNumber(pontos[hoveredPoint].value)}
                </div>
              </div>
            )}
            
            {/* Eixo X - Alinhado com os pontos */}
            <div className="absolute bottom-2 left-0 right-0" style={{ height: '20px' }}>
              {data.map((item, index) => {
                const mesAbreviado = item[labelKey].split('/')[0].toLowerCase();
                // Mostrar apenas alguns meses se forem muitos
                const showMonth = data.length <= 6 || index % 2 === 0;
                const pontoX = pontos[index]?.x || 0;
                
                // Converter coordenada do viewBox para porcentagem do container
                const xPercent = (pontoX / larguraViewBox) * 100;
                
                return (
                  <div 
                    key={index} 
                    className="absolute text-[10px] font-bold text-slate-400 uppercase tracking-tighter text-center"
                    style={{ 
                      left: `${xPercent}%`,
                      transform: 'translateX(-50%)',
                      visibility: showMonth ? 'visible' : 'hidden',
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

  // Componente de gráfico de barras (CPL semanal) — barras só para cima, sem overflow
  const BarChart = ({ data, dataKey, labelKey, color }) => {
    const [hoveredBar, setHoveredBar] = useState(null);

    const valores = data.map((d) => {
      const raw = d[dataKey];
      if (raw === null || raw === undefined) return 0;
      const n = typeof raw === 'number' ? raw : parseFloat(raw);
      return Number.isFinite(n) && n > 0 ? n : 0;
    });
    const maxValue = Math.max(...valores, 0);
    const niceMax = maxValue > 0 ? Math.max(Math.ceil(maxValue * 2) / 2, 1) : 1;
    const alturaMaxima = 200;
    const paddingTop = 20;
    const paddingBottom = 30;
    const alturaGrafico = alturaMaxima - paddingTop - paddingBottom;
    const yBase = paddingTop + alturaGrafico;
    const n = Math.max(data.length, 1);
    const larguraTotal = n * 80;
    const slot = larguraTotal / n;
    const larguraBarraPx = slot * 0.5;
    const valoresEixoY = [niceMax, 0];

    return (
      <div className="w-full overflow-hidden">
        <div className="relative overflow-hidden" style={{ height: `${alturaMaxima}px` }}>
          <div
            className="absolute left-0 top-0 bottom-0 flex flex-col justify-between pr-2"
            style={{ width: '50px', paddingTop: `${paddingTop}px`, paddingBottom: `${paddingBottom}px` }}
          >
            {valoresEixoY.map((valor, idx) => (
              <span key={idx} className="text-[10px] font-medium text-slate-400 leading-none">
                {valor.toFixed(1)}
              </span>
            ))}
          </div>

          <div className="ml-14 relative h-full overflow-hidden">
            <svg
              className="w-full h-full"
              viewBox={`0 0 ${larguraTotal} ${alturaMaxima}`}
              preserveAspectRatio="none"
              style={{ overflow: 'hidden' }}
            >
              <line
                x1={0}
                y1={yBase}
                x2={larguraTotal}
                y2={yBase}
                stroke="#e2e8f0"
                strokeWidth="1"
              />
              {data.map((item, index) => {
                const valor = valores[index];
                if (valor <= 0) return null;
                const altura = (valor / niceMax) * alturaGrafico;
                const xPos = index * slot + (slot - larguraBarraPx) / 2;
                const yTop = yBase - altura;
                const opaco = hoveredBar === index || index === data.length - 1;

                return (
                  <rect
                    key={index}
                    x={xPos}
                    y={yTop}
                    width={larguraBarraPx}
                    height={altura}
                    fill={color}
                    fillOpacity={opaco ? 1 : 0.4}
                    rx="6"
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setHoveredBar(index)}
                    onMouseLeave={() => setHoveredBar(null)}
                  />
                );
              })}
            </svg>

            {hoveredBar !== null && valores[hoveredBar] > 0 && (() => {
              const valor = valores[hoveredBar];
              const altura = (valor / niceMax) * alturaGrafico;
              const xCenter = ((hoveredBar + 0.5) / n) * 100;
              const yBarTop = paddingTop + alturaGrafico - altura;
              const tooltipTop = Math.max(8, yBarTop - 8);
              return (
                <div
                  className="absolute z-50 bg-slate-800 text-white text-xs rounded-lg shadow-xl px-3 py-2 pointer-events-none border border-slate-700 whitespace-nowrap"
                  style={{
                    left: `${xCenter}%`,
                    top: `${tooltipTop}px`,
                    transform: 'translate(-50%, -100%)',
                  }}
                >
                  <div className="font-semibold mb-1 text-white">{data[hoveredBar][labelKey]}</div>
                  <div className="text-white">CPL: {formatCurrency(valor)}</div>
                </div>
              );
            })()}

            <div className="absolute bottom-0 left-0 right-0 h-[30px] pointer-events-none">
              {data.map((item, index) => (
                <div
                  key={index}
                  className="absolute text-[10px] font-bold text-slate-400 uppercase tracking-tighter text-center"
                  style={{
                    left: `${((index + 0.5) / n) * 100}%`,
                    transform: 'translateX(-50%)',
                    width: '40px',
                    bottom: '6px',
                  }}
                >
                  {String(item[labelKey] || '').replace('Semana ', 'S')}
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

  if (loading || (clienteId && !crmReady)) {
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

      <div className="space-y-4 sm:space-y-6">
        <motion.div 
          className="flex flex-col md:flex-row md:items-center md:justify-between items-center gap-4 text-center md:text-left"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="w-full md:w-auto">
            <h1 className="text-2xl sm:text-3xl font-bold text-[#1e293b]">Dashboard</h1>
            <p className="text-sm sm:text-base text-slate-500 mt-1">
              Bem-vindo, {profile?.full_name || 'Cliente'}! Acompanhe seus resultados e métricas.
            </p>
          </div>
          
          <div className="flex items-center gap-2 justify-center md:justify-end w-full md:w-auto">
            <Select 
              value={periodo} 
              onValueChange={(value) => {
                setPeriodo(value);
                if (value !== 'custom') {
                  setShowDatePicker(false);
                }
              }}
            >
              <SelectTrigger className="w-40 h-10 text-sm bg-white border border-slate-100 rounded-lg shadow-sm hover:bg-slate-50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="15">Últimos 15 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="mes_atual">Mês Atual</SelectItem>
                <SelectItem value="mes_anterior">Mês Anterior</SelectItem>
                <SelectItem value="custom">Intervalo Personalizado</SelectItem>
              </SelectContent>
            </Select>
            
            {periodo === 'custom' && (
              <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-auto h-10 text-sm bg-white border border-slate-100 rounded-lg shadow-sm px-3"
                  >
                    {dateRange?.from && dateRange?.to ? (
                      <span className="text-slate-700">
                        {format(dateRange.from, 'dd/MM/yyyy', { locale: ptBR })} - {format(dateRange.to, 'dd/MM/yyyy', { locale: ptBR })}
                      </span>
                    ) : dateRange?.from ? (
                      <span className="text-slate-700">
                        {format(dateRange.from, 'dd/MM/yyyy', { locale: ptBR })} - ...
                      </span>
                    ) : (
                      <span className="text-slate-400">Selecione o intervalo</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 rounded-xl" align="start">
                  <div className="flex">
                    <div className="border-r p-3 space-y-1 w-[180px] bg-gray-50">
                      <div className="text-xs font-semibold mb-2 text-gray-700 uppercase tracking-wide">
                        Atalhos Rápidos
                      </div>
                      <div className="space-y-0.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start text-left font-normal text-xs h-7 px-2"
                          onClick={() => {
                            const hoje = new Date();
                            setDateRange({ from: startOfDay(hoje), to: endOfDay(hoje) });
                            setShowDatePicker(false);
                          }}
                        >
                          Hoje
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start text-left font-normal text-xs h-7 px-2"
                          onClick={() => {
                            const ontem = subDays(new Date(), 1);
                            setDateRange({ from: startOfDay(ontem), to: endOfDay(ontem) });
                            setShowDatePicker(false);
                          }}
                        >
                          Ontem
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start text-left font-normal text-xs h-7 px-2"
                          onClick={() => {
                            const hoje = new Date();
                            setDateRange({ from: startOfDay(subDays(hoje, 7)), to: endOfDay(hoje) });
                            setShowDatePicker(false);
                          }}
                        >
                          Últimos 7 dias
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start text-left font-normal text-xs h-7 px-2"
                          onClick={() => {
                            const hoje = new Date();
                            setDateRange({ from: startOfDay(subDays(hoje, 30)), to: endOfDay(hoje) });
                            setShowDatePicker(false);
                          }}
                        >
                          Últimos 30 dias
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start text-left font-normal text-xs h-7 px-2"
                          onClick={() => {
                            const hoje = new Date();
                            setDateRange({ from: startOfMonth(hoje), to: endOfMonth(hoje) });
                            setShowDatePicker(false);
                          }}
                        >
                          Mês atual
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start text-left font-normal text-xs h-7 px-2"
                          onClick={() => {
                            const mesAnterior = subMonths(new Date(), 1);
                            setDateRange({ from: startOfMonth(mesAnterior), to: endOfMonth(mesAnterior) });
                            setShowDatePicker(false);
                          }}
                        >
                          Mês anterior
                        </Button>
                      </div>
                    </div>
                    <div className="p-4">
                      <Calendar
                        initialFocus
                        mode="range"
                        defaultMonth={dateRange?.from || new Date()}
                        selected={dateRange}
                        onSelect={(range) => {
                          const newRange = range || { from: null, to: null };
                          setDateRange(newRange);
                          if (newRange?.from && newRange?.to) {
                            setShowDatePicker(false);
                          }
                        }}
                        numberOfMonths={2}
                        locale={ptBR}
                      />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
        </motion.div>

        {profile?.role === 'cliente' && clienteId && <React.Fragment key={`${profile.id}:${clienteId}`}>
          <ClientPortalPerformance clientId={clienteId} />
          <ClientPortalReports clientId={clienteId} />
          <ClientPortalNotices />
        </React.Fragment>}
        <div className={painel.fromCrm ? 'space-y-4' : 'grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6'}>
          <div className={painel.fromCrm ? 'space-y-4' : 'lg:col-span-2 space-y-4 sm:space-y-6'}>
            {/* Card Faturamento Estilizado (Hero KPI) */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              <div className="rounded-xl sm:rounded-2xl bg-gradient-to-br from-[#0f172a] via-[#1e3a8a] to-[#3b82f6] p-4 sm:p-5 relative overflow-hidden shadow-sm sm:shadow-xl shadow-blue-900/10 border border-white/10">
                {/* Imagem de fundo celestial com ondas de luz e estrelas */}
                <div 
                  className="absolute inset-0 opacity-60 mix-blend-screen pointer-events-none bg-cover bg-center scale-105" 
                  style={{ backgroundImage: "url('/dashboard-bg-stars.png')" }} 
                />
                
                {/* Overlay adicional para profundidade */}
                <div className="absolute inset-0 bg-blue-950/20 pointer-events-none" />
                
                <div className="relative z-10 space-y-3 sm:space-y-4">
                  <div className="px-2">
                    <p className="text-white text-base sm:text-lg font-normal tracking-tight leading-tight">{painel.fromCrm ? 'Valor vendido' : 'Faturamento Total'}</p>
                    <h2 className="text-2xl sm:text-3xl font-black text-sky-100 mt-1 tracking-tighter leading-none drop-shadow-sm">
                      {formatCurrency(painel.totalFaturamento)}
                    </h2>
                  </div>

                  {/* Sub-card branco translúcido para KPIs secundários */}
                  <div className="bg-white/95 backdrop-blur-md rounded-xl p-4 sm:p-5 shadow-lg">
                    <div className={`grid grid-cols-2 gap-4 sm:gap-0 ${painel.fromCrm && painel.qualificados != null ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
                      {[
                        { label: 'Leads Gerados', value: formatNumber(painel.totalLeads), hint: periodoLegenda, icon: User, iconClass: 'text-emerald-500/80' },
                        painel.fromCrm && painel.qualificados != null && { label: 'Qualificados', value: formatNumber(painel.qualificados), hint: periodoLegenda, icon: UserCheck, iconClass: 'text-sky-500/80' },
                        { label: 'Vendas Fechadas', value: formatNumber(painel.totalVendas), hint: periodoLegenda, icon: ShoppingCart, iconClass: 'text-slate-300' },
                        { label: 'Taxa de Conversão', value: formatPercentage(painel.taxaConversao), hint: 'Leads → Vendas', icon: TrendingUp, iconClass: 'text-blue-500/80' },
                      ].filter(Boolean).map((item, index) => {
                        const Icon = item.icon;
                        return (
                          <div key={item.label} className={`flex flex-col ${index ? 'sm:border-l sm:border-slate-100 sm:pl-4' : ''} ${index < 3 ? 'sm:pr-4' : ''}`}>
                            <div className="flex items-center justify-between">
                              <span className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tighter">{item.value}</span>
                              <Icon className={`h-4 w-4 ${item.iconClass}`} />
                            </div>
                            <div className="mt-0.5">
                              <p className="text-xs font-bold text-slate-600 leading-tight">{item.label}</p>
                              <p className="text-[9px] font-semibold text-slate-400 uppercase">{item.hint}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            {painel.fromCrm ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.15 }}
              >
                <Card className="border-none shadow-sm sm:shadow-md bg-white p-5 sm:p-8 rounded-xl sm:rounded-2xl">
                  <div className="mb-4 sm:mb-6">
                    <h3 className="text-base sm:text-lg font-bold text-slate-800">ROI - Retorno sobre Investimento</h3>
                    <p className="text-xs sm:text-sm text-slate-400 font-semibold mt-1">Análise financeira do período selecionado</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
                    <div className="flex flex-col p-4 sm:p-6 rounded-xl bg-gradient-to-br from-sky-50 to-blue-50 border border-blue-100">
                      <div className="flex items-center justify-end mb-2 sm:mb-3">
                        <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Investido</span>
                      </div>
                      <h4 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">
                        {metaSpend == null ? '…' : formatCurrency(metaSpend)}
                      </h4>
                      <p className="text-xs text-slate-500 font-medium mt-2">
                        {metaSpend == null ? 'Lendo a Meta' : 'Total investido no período'}
                      </p>
                    </div>
                    <div className="flex flex-col p-4 sm:p-6 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100">
                      <div className="flex items-center justify-end mb-2 sm:mb-3">
                        <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">Ticket médio</span>
                      </div>
                      <h4 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">
                        {formatCurrency(painel.ticketMedio || 0)}
                      </h4>
                      <p className="text-xs text-slate-500 font-medium mt-2">Média por venda fechada</p>
                    </div>
                    <div className="flex flex-col p-4 sm:p-6 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100">
                      <div className="flex items-center justify-end mb-2 sm:mb-3">
                        <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Em negociação</span>
                      </div>
                      <h4 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">
                        {formatNumber(emNegociacao)}
                      </h4>
                      <p className="text-xs text-slate-500 font-medium mt-2">Leads neste status no período</p>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ) : null}

            {painel.fromCrm ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 space-y-4">
                  <Card className="border-none shadow-sm bg-white rounded-2xl">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base font-bold text-slate-800">Evolução de Faturamento</CardTitle>
                      <CardDescription>Faturamento mensal ao longo do ano</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <LineChart data={serieAnual} dataKey="faturamento" labelKey="mes" color="#14b8a6" />
                    </CardContent>
                  </Card>
                  <Card className="border-none shadow-sm bg-white rounded-2xl">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base font-bold text-slate-800">Evolução do Ticket Médio</CardTitle>
                      <CardDescription>Ticket médio mensal das vendas fechadas</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <LineChart data={serieAnual} dataKey="ticketMedio" labelKey="mes" color="#3b82f6" />
                    </CardContent>
                  </Card>
                </div>
                <Card className="border-none shadow-sm bg-white rounded-2xl h-fit self-start overflow-hidden">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-bold text-slate-800">Evolução de CPL</CardTitle>
                    <CardDescription>Custo por lead semanal</CardDescription>
                  </CardHeader>
                  <CardContent className="overflow-hidden">
                    {cplMeta.length ? (
                      <BarChart data={cplMeta} dataKey="cpl" labelKey="semana" color="#6366f1" />
                    ) : (
                      <p className="text-sm text-slate-400 py-8">Sem gasto diário da Meta neste período.</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            ) : null}

            {painel.fromCrm ? (
              <MiniCrmBoard summary={crmResumo} rows={crmRows} statuses={crmStatuses} detailsOnly />
            ) : null}

            {/* Card ROI - Investimento, Faturamento e ROI */}
            {!painel.fromCrm ? <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.15 }}
            >
              <Card className="border-none shadow-sm sm:shadow-md bg-white p-5 sm:p-8 rounded-xl sm:rounded-2xl">
                <div className="mb-4 sm:mb-6">
                  <h3 className="text-base sm:text-lg font-bold text-slate-800">ROI - Retorno sobre Investimento</h3>
                  <p className="text-xs sm:text-sm text-slate-400 font-semibold mt-1">Análise financeira do período selecionado</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
                  {/* Investimento */}
                  <TooltipCustom
                    content="Total de recursos investidos em marketing e publicidade no período selecionado. Inclui investimentos em tráfego pago e campanhas."
                    side="top"
                  >
                    <div className="flex flex-col p-4 sm:p-6 rounded-xl bg-gradient-to-br from-sky-50 to-blue-50 border border-blue-100 cursor-help">
                      <div className="flex items-center justify-end mb-2 sm:mb-3">
                        <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Investido</span>
                      </div>
                      <h4 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">
                        {formatCurrency(mesAtual.totalInvestimento)}
                      </h4>
                      <p className="text-xs text-slate-500 font-medium mt-2">Total investido no período</p>
                    </div>
                  </TooltipCustom>

                  {/* Faturamento */}
                  <TooltipCustom
                    content="Receita total gerada pelas vendas no período selecionado. Representa o faturamento bruto antes de descontos e impostos."
                    side="top"
                  >
                    <div className="flex flex-col p-4 sm:p-6 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 cursor-help">
                      <div className="flex items-center justify-end mb-2 sm:mb-3">
                        <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">Faturado</span>
                      </div>
                      <h4 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">
                        {formatCurrency(painel.totalFaturamento)}
                      </h4>
                      <p className="text-xs text-slate-500 font-medium mt-2">Total faturado no período</p>
                    </div>
                  </TooltipCustom>

                  {/* ROI */}
                  <TooltipCustom
                    content="Retorno sobre Investimento (ROI) mostra a eficiência do investimento em marketing. Calculado como: ((Faturamento - Investimento) ÷ Investimento) × 100. Valores positivos indicam lucro."
                    side="top"
                  >
                    <div className="flex flex-col p-4 sm:p-6 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 cursor-help">
                      <div className="flex items-center justify-end mb-2 sm:mb-3">
                        <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">ROI</span>
                      </div>
                      <h4 className={`text-xl sm:text-2xl font-black tracking-tight ${
                        painel.roi >= 0 ? 'text-emerald-600' : 'text-red-600'
                      }`}>
                        {painel.totalInvestimento > 0 ? `${painel.roi >= 0 ? '+' : ''}${Math.round(painel.roi)}%` : '0%'}
                      </h4>
                      <p className="text-xs text-slate-500 font-medium mt-2">
                        {painel.totalInvestimento > 0 
                          ? `Retorno líquido: ${formatCurrency(painel.totalFaturamento - painel.totalInvestimento)}`
                          : 'Sem investimento registrado'}
                      </p>
                    </div>
                  </TooltipCustom>
                </div>
              </Card>
            </motion.div> : null}

          </div>

        </div>
      </div>
    </>
  );
};

export default ClientSupport;
