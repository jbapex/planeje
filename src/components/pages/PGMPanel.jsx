import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  BarChart2, 
  Users, 
  DollarSign, 
  TrendingUp, 
  Target, 
  ShoppingCart,
  Search,
  ArrowUpDown,
  Loader2,
  TrendingDown
} from 'lucide-react';
import { motion } from 'framer-motion';
import { 
  format, 
  subDays, 
  startOfMonth, 
  endOfMonth, 
  subMonths,
  startOfDay,
  endOfDay
} from 'date-fns';
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

const PGMPanel = () => {
  const { toast } = useToast();
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [clientesData, setClientesData] = useState([]);
  const [dadosDiarios, setDadosDiarios] = useState([]); // Dados dia a dia para tabela e gráficos
  const [dadosAnoAtual, setDadosAnoAtual] = useState([]); // Dados do ano atual para Performance Mensal (não filtrado)
  const [periodo, setPeriodo] = useState('30'); // últimos 30 dias por padrão
  const [searchTerm, setSearchTerm] = useState('');
  const [sortColumn, setSortColumn] = useState('faturamento');
  const [sortDirection, setSortDirection] = useState('desc');
  const [funnelStep2Name, setFunnelStep2Name] = useState('Etapa 2');
  const [funnelStep3Name, setFunnelStep3Name] = useState('Etapa 3');
  const [abaAtiva, setAbaAtiva] = useState('cadastro');
  const [dateRange, setDateRange] = useState({ from: null, to: null });
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  // Se for cliente, filtrar apenas seus dados
  const isClientView = profile?.role === 'cliente' && profile?.cliente_id;

  // Garantir que a página tenha scroll
  useEffect(() => {
    document.documentElement.style.overflow = 'auto';
    document.body.style.overflow = 'auto';
    document.documentElement.style.height = 'auto';
    document.body.style.height = 'auto';
    
    return () => {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
      document.documentElement.style.height = '';
      document.body.style.height = '';
    };
  }, []);

  // Calcular datas baseado no período selecionado
  const getDateRange = (period) => {
    const hoje = new Date();
    let dataInicio, dataFim;

    switch (period) {
      case '7':
        dataInicio = subDays(hoje, 7);
        dataFim = hoje;
        break;
      case '15':
        dataInicio = subDays(hoje, 15);
        dataFim = hoje;
        break;
      case '30':
        dataInicio = subDays(hoje, 30);
        dataFim = hoje;
        break;
      case 'mes_atual':
        dataInicio = startOfMonth(hoje);
        dataFim = endOfMonth(hoje);
        break;
      case 'mes_anterior':
        const mesAnterior = subMonths(hoje, 1);
        dataInicio = startOfMonth(mesAnterior);
        dataFim = endOfMonth(mesAnterior);
        break;
      case 'custom':
        // Usar intervalo personalizado
        if (dateRange.from && dateRange.to) {
          dataInicio = dateRange.from;
          dataFim = dateRange.to;
        } else if (dateRange.from) {
          // Se só tem data inicial, usar até hoje
          dataInicio = dateRange.from;
          dataFim = hoje;
        } else {
          // Fallback para 30 dias se não houver seleção
          dataInicio = subDays(hoje, 30);
          dataFim = hoje;
        }
        break;
      default:
        dataInicio = subDays(hoje, 30);
        dataFim = hoje;
    }

    return {
      dataInicio: format(dataInicio, 'yyyy-MM-dd'),
      dataFim: format(dataFim, 'yyyy-MM-dd')
    };
  };

  // Buscar e agregar dados
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const { dataInicio, dataFim } = getDateRange(periodo);

        // Se for cliente, buscar os nomes personalizados das etapas
        if (isClientView) {
          const { data: cliente, error: clienteError } = await supabase
            .from('clientes')
            .select('funnel_step_2_name, funnel_step_3_name')
            .eq('id', profile.cliente_id)
            .maybeSingle();

          if (cliente) {
            setFunnelStep2Name(cliente.funnel_step_2_name || 'Visita Agendada');
            setFunnelStep3Name(cliente.funnel_step_3_name || 'Visita Realizada');
          }
        } else {
          // Se for admin, usar nomes genéricos como solicitado no plano
          setFunnelStep2Name('Etapa 2');
          setFunnelStep3Name('Etapa 3');
        }

        // Construir query base - buscar TODOS os campos da tabela
        let query = supabase
          .from('cliente_resultados_diarios')
          .select(`
            id,
            cliente_id,
            data_referencia,
            leads,
            visitas_agendadas,
            visitas_realizadas,
            vendas,
            faturamento,
            investimento,
            observacoes,
            created_at,
            clientes:cliente_id (
              id,
              empresa,
              nome_contato
            )
          `)
          .gte('data_referencia', dataInicio)
          .lte('data_referencia', dataFim);

        // Se for cliente, filtrar apenas seus dados
        if (isClientView) {
          query = query.eq('cliente_id', profile.cliente_id);
        }

        const { data: resultadosDiarios, error } = await query.order('data_referencia', { ascending: false });
        
        // Debug: Verificar se a query retornou dados
        if (error) {
          console.error('❌ PGMPanel - Erro na query diários:', error);
        } else {
          console.log('✅ PGMPanel - Query diários executada com sucesso:', {
            totalRegistros: resultadosDiarios?.length || 0,
            periodo: { dataInicio, dataFim },
            primeiroRegistro: resultadosDiarios?.[0]
          });
        }

        if (error) {
          console.error('Erro ao buscar resultados diários:', error);
          toast({
            title: 'Erro ao carregar dados',
            description: error.message,
            variant: 'destructive'
          });
          setLoading(false);
          return;
        }

        // Buscar dados semanais (tráfego semanal)
        // Buscar semanas que se intersectam com o período:
        // - semana_inicio <= dataFim (semana começa antes ou no fim do período)
        // - semana_fim >= dataInicio (semana termina depois ou no início do período)
        let querySemanais = supabase
          .from('cliente_resultados_semanais')
          .select(`
            id,
            cliente_id,
            semana_inicio,
            semana_fim,
            impressoes,
            cliques,
            leads,
            investimento,
            observacoes,
            created_at,
            clientes:cliente_id (
              id,
              empresa,
              nome_contato
            )
          `)
          .lte('semana_inicio', dataFim)
          .gte('semana_fim', dataInicio);

        // Se for cliente, filtrar apenas seus dados
        if (isClientView) {
          querySemanais = querySemanais.eq('cliente_id', profile.cliente_id);
        }

        const { data: resultadosSemanais, error: errorSemanais } = await querySemanais.order('semana_inicio', { ascending: false });

        if (errorSemanais) {
          console.error('❌ PGMPanel - Erro ao buscar dados semanais:', errorSemanais);
        } else {
          console.log('✅ PGMPanel - Dados semanais encontrados:', {
            totalRegistros: resultadosSemanais?.length || 0,
            registros: resultadosSemanais
          });
        }

        // Debug: Log dos dados recebidos
        console.log('📊 PGMPanel - Dados recebidos:', {
          totalRegistros: resultadosDiarios?.length || 0,
          periodo: { dataInicio, dataFim },
          isClientView,
          clienteId: profile?.cliente_id
        });

        // Agregar dados por cliente
        const dadosAgregados = {};
        
        // Processar dados diários
        if (resultadosDiarios && resultadosDiarios.length > 0) {
          resultadosDiarios.forEach(item => {
            const clienteId = item.cliente_id;
            
            if (!dadosAgregados[clienteId]) {
              dadosAgregados[clienteId] = {
                cliente_id: clienteId,
                cliente: item.clientes,
                leads: 0,
                visitas_agendadas: 0,
                visitas_realizadas: 0,
                vendas: 0,
                faturamento: 0,
                investimento: 0
              };
            }
            
            // Garantir que todos os valores sejam números válidos
            dadosAgregados[clienteId].leads += parseInt(item.leads) || 0;
            dadosAgregados[clienteId].visitas_agendadas += parseInt(item.visitas_agendadas) || 0;
            dadosAgregados[clienteId].visitas_realizadas += parseInt(item.visitas_realizadas) || 0;
            dadosAgregados[clienteId].vendas += parseInt(item.vendas) || 0;
            dadosAgregados[clienteId].faturamento += parseFloat(item.faturamento) || 0;
            dadosAgregados[clienteId].investimento += parseFloat(item.investimento) || 0;
          });
        }

        // Processar dados semanais (tráfego semanal) e agregar
        // IMPORTANTE: Apenas agregar o investimento, NÃO os leads
        // Os leads devem vir apenas do cadastro diário do cliente
        if (resultadosSemanais && resultadosSemanais.length > 0) {
          resultadosSemanais.forEach(item => {
            const clienteId = item.cliente_id;
            
            if (!dadosAgregados[clienteId]) {
              dadosAgregados[clienteId] = {
                cliente_id: clienteId,
                cliente: item.clientes,
                leads: 0,
                visitas_agendadas: 0,
                visitas_realizadas: 0,
                vendas: 0,
                faturamento: 0,
                investimento: 0
              };
            }
            
            // Agregar APENAS o investimento dos dados semanais
            // NÃO agregar leads - os leads vêm apenas do cadastro diário do cliente
            dadosAgregados[clienteId].investimento += parseFloat(item.investimento) || 0;
          });

          console.log('📊 PGMPanel - Dados semanais agregados (apenas investimento):', {
            totalSemanas: resultadosSemanais.length,
            semanas: resultadosSemanais.map(s => ({
              cliente: s.clientes?.empresa,
              semana: `${s.semana_inicio} - ${s.semana_fim}`,
              investimento: s.investimento,
              nota: 'Leads não agregados - vêm apenas do cadastro diário do cliente'
            }))
          });
        }
          
        console.log('📊 PGMPanel - Dados agregados:', {
          totalClientes: Object.keys(dadosAgregados).length,
          clientes: Object.values(dadosAgregados).map(c => ({
            cliente: c.cliente?.empresa,
            leads: c.leads,
            vendas: c.vendas,
            faturamento: c.faturamento,
            investimento: c.investimento
          }))
        });

        if (Object.keys(dadosAgregados).length === 0) {
          console.warn('⚠️ PGMPanel - Nenhum dado encontrado para o período:', { dataInicio, dataFim });
        }

        // Salvar dados diários para gráficos e tabela
        const dadosDiariosFormatados = (resultadosDiarios || []).map(item => {
          // Garantir que todos os valores sejam números válidos
          const investimento = parseFloat(item.investimento) || 0;
          const leads = parseInt(item.leads) || 0;
          const visitas_agendadas = parseInt(item.visitas_agendadas) || 0;
          const visitas_realizadas = parseInt(item.visitas_realizadas) || 0;
          const vendas = parseInt(item.vendas) || 0;
          const faturamento = parseFloat(item.faturamento) || 0;
          
          const cpl = leads > 0 ? investimento / leads : 0;
          const taxaConversao = leads > 0 ? (vendas / leads) * 100 : 0;
          const ticketMedio = vendas > 0 ? faturamento / vendas : 0;

          return {
            data_referencia: item.data_referencia,
            cliente_id: item.cliente_id,
            cliente: item.clientes,
            investimento,
            leads,
            visitas_agendadas,
            visitas_realizadas,
            vendas,
            faturamento,
            cpl,
            taxa_conversao: taxaConversao,
            ticket_medio: ticketMedio,
            origem: 'diario' // Marcar como cadastro diário
          };
        });

        // Adicionar dados semanais convertidos para formato diário (usando semana_inicio como data_referencia)
        // IMPORTANTE: Apenas incluir o investimento, NÃO os leads
        // Os leads devem vir apenas do cadastro diário do cliente
        if (resultadosSemanais && resultadosSemanais.length > 0) {
          resultadosSemanais.forEach(item => {
            const investimento = parseFloat(item.investimento) || 0;
            // NÃO usar leads dos dados semanais - apenas investimento
            // leads = 0 porque os leads vêm apenas do cadastro diário do cliente
            const leads = 0;
            const cpl = 0; // CPL será calculado apenas com leads do cadastro diário

            // Criar um registro apenas com investimento (sem leads)
            dadosDiariosFormatados.push({
              data_referencia: item.semana_inicio,
              cliente_id: item.cliente_id,
              cliente: item.clientes,
              investimento,
              leads: 0, // Leads vêm apenas do cadastro diário do cliente
              visitas_agendadas: 0,
              visitas_realizadas: 0,
              vendas: 0,
              faturamento: 0,
              cpl: 0, // CPL será calculado apenas com dados diários
              taxa_conversao: 0,
              ticket_medio: 0,
              origem: 'semanal' // Marcar como origem semanal
            });
          });
        }
        
        console.log('📊 PGMPanel - Dados diários formatados:', {
          total: dadosDiariosFormatados.length,
          primeiroRegistro: dadosDiariosFormatados[0],
          ultimoRegistro: dadosDiariosFormatados[dadosDiariosFormatados.length - 1]
        });

        setDadosDiarios(dadosDiariosFormatados);

        // Converter objeto em array e calcular métricas derivadas
        const dadosArray = Object.values(dadosAgregados).map(item => {
          // Garantir que todos os valores sejam números válidos
          const leads = parseInt(item.leads) || 0;
          const vendas = parseInt(item.vendas) || 0;
          const faturamento = parseFloat(item.faturamento) || 0;
          const investimento = parseFloat(item.investimento) || 0;
          
          const taxaConversao = leads > 0 ? (vendas / leads) * 100 : 0;
          const ticketMedio = vendas > 0 ? faturamento / vendas : 0;
          const cpl = leads > 0 ? investimento / leads : 0;

          return {
            ...item,
            leads,
            vendas,
            faturamento,
            investimento,
            taxa_conversao: taxaConversao,
            ticket_medio: ticketMedio,
            cpl
          };
        });

        console.log('📊 PGMPanel - Dados finais de clientes:', {
          total: dadosArray.length,
          metricas: dadosArray.map(c => ({
            cliente: c.cliente?.empresa,
            leads: c.leads,
            vendas: c.vendas,
            faturamento: c.faturamento,
            investimento: c.investimento,
            cpl: c.cpl,
            taxa_conversao: c.taxa_conversao,
            ticket_medio: c.ticket_medio
          }))
        });

        setClientesData(dadosArray);

        // Buscar TODOS os dados do ano atual para o gráfico Performance Mensal (não filtrado)
        const anoAtual = new Date().getFullYear();
        const inicioAno = `${anoAtual}-01-01`;
        const fimAno = `${anoAtual}-12-31`;
        
        // Buscar dados diários do ano atual
        let queryAnoAtual = supabase
          .from('cliente_resultados_diarios')
          .select(`
            id,
            cliente_id,
            data_referencia,
            faturamento,
            investimento,
            clientes:cliente_id (
              id,
              empresa,
              nome_contato
            )
          `)
          .gte('data_referencia', inicioAno)
          .lte('data_referencia', fimAno);

        // Se for cliente, filtrar apenas seus dados
        if (isClientView) {
          queryAnoAtual = queryAnoAtual.eq('cliente_id', profile.cliente_id);
        }

        const { data: resultadosAnoAtual, error: errorAnoAtual } = await queryAnoAtual.order('data_referencia', { ascending: false });

        // Buscar dados semanais (Ads) do ano atual
        let querySemanaisAnoAtual = supabase
          .from('cliente_resultados_semanais')
          .select(`
            id,
            cliente_id,
            semana_inicio,
            semana_fim,
            investimento,
            clientes:cliente_id (
              id,
              empresa,
              nome_contato
            )
          `)
          .lte('semana_inicio', fimAno)
          .gte('semana_fim', inicioAno);

        // Se for cliente, filtrar apenas seus dados
        if (isClientView) {
          querySemanaisAnoAtual = querySemanaisAnoAtual.eq('cliente_id', profile.cliente_id);
        }

        const { data: resultadosSemanaisAnoAtual, error: errorSemanaisAnoAtual } = await querySemanaisAnoAtual.order('semana_inicio', { ascending: false });

        if (errorAnoAtual) {
          console.error('❌ PGMPanel - Erro ao buscar dados do ano atual:', errorAnoAtual);
        } else {
          console.log('✅ PGMPanel - Dados do ano atual carregados:', {
            totalRegistros: resultadosAnoAtual?.length || 0,
            periodo: { inicioAno, fimAno }
          });
        }

        if (errorSemanaisAnoAtual) {
          console.error('❌ PGMPanel - Erro ao buscar dados semanais do ano atual:', errorSemanaisAnoAtual);
        } else {
          console.log('✅ PGMPanel - Dados semanais do ano atual carregados:', {
            totalRegistros: resultadosSemanaisAnoAtual?.length || 0,
            periodo: { inicioAno, fimAno }
          });
        }

        // Formatar dados diários do ano atual
        const dadosAnoAtualFormatados = (resultadosAnoAtual || []).map(item => ({
          data_referencia: item.data_referencia,
          cliente_id: item.cliente_id,
          cliente: item.clientes,
          investimento: parseFloat(item.investimento) || 0,
          faturamento: parseFloat(item.faturamento) || 0
        }));

        // Adicionar dados semanais (Ads) convertidos para formato diário
        // Usar semana_inicio como data_referencia para agrupar por mês
        if (resultadosSemanaisAnoAtual && resultadosSemanaisAnoAtual.length > 0) {
          console.log('📊 PGMPanel - Adicionando dados semanais (Ads) ao gráfico:', {
            totalSemanas: resultadosSemanaisAnoAtual.length,
            semanas: resultadosSemanaisAnoAtual.map(s => ({
              semana: `${s.semana_inicio} - ${s.semana_fim}`,
              investimento: s.investimento,
              cliente: s.clientes?.empresa
            }))
          });

          resultadosSemanaisAnoAtual.forEach(item => {
            const investimento = parseFloat(item.investimento) || 0;
            if (investimento > 0) {
              dadosAnoAtualFormatados.push({
                data_referencia: item.semana_inicio, // Usar semana_inicio para agrupar por mês
                cliente_id: item.cliente_id,
                cliente: item.clientes,
                investimento: investimento,
                faturamento: 0 // Dados semanais não têm faturamento
              });
            }
          });

          console.log('✅ PGMPanel - Dados semanais adicionados. Total de registros:', dadosAnoAtualFormatados.length);
        }

        setDadosAnoAtual(dadosAnoAtualFormatados);
      } catch (error) {
        console.error('Erro ao processar dados:', error);
        toast({
          title: 'Erro ao processar dados',
          description: 'Ocorreu um erro inesperado.',
          variant: 'destructive'
        });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [periodo, toast, isClientView, profile?.cliente_id, dateRange.from, dateRange.to]);

  // Calcular métricas gerais - garantir que todos os valores sejam calculados corretamente
  const metricasGerais = useMemo(() => {
    const totalClientes = clientesData.length;
    
    // Garantir que todos os valores sejam números válidos
    const totalInvestimento = clientesData.reduce((sum, item) => {
      const valor = parseFloat(item.investimento) || 0;
      return sum + valor;
    }, 0);
    
    const totalFaturamento = clientesData.reduce((sum, item) => {
      const valor = parseFloat(item.faturamento) || 0;
      return sum + valor;
    }, 0);
    
    const totalLeads = clientesData.reduce((sum, item) => {
      const valor = parseInt(item.leads) || 0;
      return sum + valor;
    }, 0);
    
    const totalVendas = clientesData.reduce((sum, item) => {
      const valor = parseInt(item.vendas) || 0;
      return sum + valor;
    }, 0);
    
    const taxaConversaoGeral = totalLeads > 0 ? (totalVendas / totalLeads) * 100 : 0;
    const ticketMedioGeral = totalVendas > 0 ? totalFaturamento / totalVendas : 0;
    const cplMedio = totalLeads > 0 ? totalInvestimento / totalLeads : 0;

    const metricas = {
      totalClientes,
      totalInvestimento,
      totalFaturamento,
      totalLeads,
      totalVendas,
      taxaConversaoGeral,
      ticketMedioGeral,
      cplMedio
    };
    
    console.log('📊 PGMPanel - Métricas gerais calculadas:', metricas);
    
    return metricas;
  }, [clientesData]);

  // Filtrar e ordenar dados
  const dadosFiltradosEOrdenados = useMemo(() => {
    let dados = [...clientesData];

    // Filtrar por busca
    if (searchTerm) {
      const termo = searchTerm.toLowerCase();
      dados = dados.filter(item => 
        item.cliente?.empresa?.toLowerCase().includes(termo) ||
        item.cliente?.nome_contato?.toLowerCase().includes(termo)
      );
    }

    // Ordenar
    dados.sort((a, b) => {
      let aValue, bValue;

      switch (sortColumn) {
        case 'cliente':
          aValue = a.cliente?.empresa || '';
          bValue = b.cliente?.empresa || '';
          break;
        case 'leads':
          aValue = a.leads;
          bValue = b.leads;
          break;
        case 'visitas_agendadas':
          aValue = a.visitas_agendadas;
          bValue = b.visitas_agendadas;
          break;
        case 'visitas_realizadas':
          aValue = a.visitas_realizadas;
          bValue = b.visitas_realizadas;
          break;
        case 'vendas':
          aValue = a.vendas;
          bValue = b.vendas;
          break;
        case 'faturamento':
          aValue = a.faturamento;
          bValue = b.faturamento;
          break;
        case 'taxa_conversao':
          aValue = a.taxa_conversao;
          bValue = b.taxa_conversao;
          break;
        case 'ticket_medio':
          aValue = a.ticket_medio;
          bValue = b.ticket_medio;
          break;
        default:
          aValue = a.faturamento;
          bValue = b.faturamento;
      }

      if (typeof aValue === 'string') {
        return sortDirection === 'asc' 
          ? aValue.localeCompare(bValue, 'pt-BR')
          : bValue.localeCompare(aValue, 'pt-BR');
      }

      return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
    });

    return dados;
  }, [clientesData, searchTerm, sortColumn, sortDirection]);

  // Função para alternar ordenação
  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  // Função para obter label do período
  const getPeriodoLabel = (period) => {
    switch (period) {
      case '7':
        return 'Últimos 7 dias';
      case '15':
        return 'Últimos 15 dias';
      case '30':
        return 'Últimos 30 dias';
      case 'mes_atual':
        return 'Mês Atual';
      case 'mes_anterior':
        return 'Mês Anterior';
      default:
        return 'Últimos 30 dias';
    }
  };

  // Dados agregados para funil - garantir que todos os valores sejam calculados corretamente
  const funilData = useMemo(() => {
    const totalLeads = dadosDiarios.reduce((sum, item) => {
      const valor = parseInt(item.leads) || 0;
      return sum + valor;
    }, 0);
    
    const totalVisitasAgendadas = dadosDiarios.reduce((sum, item) => {
      const valor = parseInt(item.visitas_agendadas) || 0;
      return sum + valor;
    }, 0);
    
    const totalVisitasRealizadas = dadosDiarios.reduce((sum, item) => {
      const valor = parseInt(item.visitas_realizadas) || 0;
      return sum + valor;
    }, 0);
    
    const totalVendas = dadosDiarios.reduce((sum, item) => {
      const valor = parseInt(item.vendas) || 0;
      return sum + valor;
    }, 0);

    const funil = [
      { label: 'Leads', value: totalLeads, color: '#06B6D4' }, // cyan-500
      { label: funnelStep2Name, value: totalVisitasAgendadas, color: '#6B7280' }, // gray-500
      { label: funnelStep3Name, value: totalVisitasRealizadas, color: '#10B981' }, // green-500
      { label: 'Vendas', value: totalVendas, color: '#0891B2' }, // cyan-700
    ];
    
    console.log('📊 PGMPanel - Dados do funil:', funil);
    
    return funil;
  }, [dadosDiarios]);

  // Separar dados por origem para as abas
  const dadosCadastroDiario = useMemo(() => {
    return dadosDiarios.filter(item => item.origem === 'diario' || !item.origem);
  }, [dadosDiarios]);

  const dadosTrafegoPago = useMemo(() => {
    return dadosDiarios.filter(item => item.origem === 'semanal');
  }, [dadosDiarios]);

  // Dados mensais para gráfico de performance - usar dados do ano atual (não filtrado)
  const dadosMensais = useMemo(() => {
    const mesesMap = {};
    
    dadosAnoAtual.forEach(item => {
      const data = new Date(item.data_referencia);
      const mesAbreviado = format(data, 'MMM', { locale: ptBR });
      
      if (!mesesMap[mesAbreviado]) {
        mesesMap[mesAbreviado] = {
          mes: mesAbreviado,
          investimento: 0,
          faturamento: 0
        };
      }
      
      // Garantir que todos os valores sejam números válidos
      const investimento = parseFloat(item.investimento) || 0;
      const faturamento = parseFloat(item.faturamento) || 0;
      
      mesesMap[mesAbreviado].investimento += investimento;
      mesesMap[mesAbreviado].faturamento += faturamento;
    });

    const dados = Object.values(mesesMap).sort((a, b) => {
      // Ordenar por ordem cronológica dos meses
      const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
      const indexA = meses.indexOf(a.mes.toLowerCase());
      const indexB = meses.indexOf(b.mes.toLowerCase());
      return indexA - indexB;
    });
    
    console.log('📊 PGMPanel - Dados mensais calculados (ano atual completo):', dados.map(m => ({
      mes: m.mes,
      investimento: m.investimento,
      faturamento: m.faturamento
    })));
    
    return dados;
  }, [dadosAnoAtual]);

  // Componente de gráfico de funil
  const FunnelChart = ({ data }) => {
    const maxValue = Math.max(...data.map(d => d.value), 1);
    
    return (
      <div className="space-y-4">
        {data.map((item, index) => (
          <div key={index} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700">{item.label}</span>
              <span className="text-sm font-bold text-slate-900">{formatNumber(item.value)}</span>
            </div>
            <div className="relative h-8 bg-slate-100 rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: item.color }}
                initial={{ width: 0 }}
                animate={{ width: `${(item.value / maxValue) * 100}%` }}
                transition={{ duration: 0.8, delay: index * 0.1 }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Componente de gráfico de performance mensal
  const MonthlyPerformanceChart = ({ data }) => {
    const [hoveredBar, setHoveredBar] = useState(null);
    const [tooltipData, setTooltipData] = useState({ x: 0, y: 0, mes: '' });
    
    // Sempre mostrar todos os meses do ano atual
    const anoAtual = new Date().getFullYear();
    const mesesAbreviados = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const mesesMap = {
      'jan': 'Jan', 'fev': 'Fev', 'mar': 'Mar', 'abr': 'Abr',
      'mai': 'Mai', 'jun': 'Jun', 'jul': 'Jul', 'ago': 'Ago',
      'set': 'Set', 'out': 'Out', 'nov': 'Nov', 'dez': 'Dez'
    };
    
    // Criar array com todos os meses do ano atual, preenchendo com dados do período filtrado
    const mesesCompletos = mesesAbreviados.map((mesAbreviado, index) => {
      // Buscar dados do mês correspondente (date-fns retorna em minúsculas)
      const mesEncontrado = data.find(d => {
        const mesDataLower = d.mes.toLowerCase();
        return mesDataLower === mesAbreviado.toLowerCase() || mesesMap[mesDataLower] === mesAbreviado;
      });
      
      return {
        mes: mesAbreviado,
        investimento: mesEncontrado?.investimento || 0,
        faturamento: mesEncontrado?.faturamento || 0,
        dataCompleta: new Date(anoAtual, index, 1)
      };
    });

    // Calcular o valor máximo dos dados para ajustar o eixo Y dinamicamente
    const maxValorDados = Math.max(
      ...mesesCompletos.map(m => Math.max(m.investimento, m.faturamento)),
      1 // Mínimo de 1 para evitar divisão por zero
    );

    // Arredondar para cima para um valor "bonito" no eixo Y
    const potencia = Math.pow(10, Math.floor(Math.log10(maxValorDados)));
    const maxValue = Math.ceil(maxValorDados / potencia) * potencia;
    
    // Se o valor máximo for muito pequeno, usar pelo menos 1000
    const maxValueFinal = Math.max(maxValue, 1000);

    // Calcular intervalos do eixo Y (5 intervalos)
    const intervalos = 5;
    const intervaloValor = maxValueFinal / intervalos;
    const valoresEixoY = Array.from({ length: intervalos + 1 }, (_, i) => i * intervaloValor);

    const alturaMaxima = 300; // Altura máxima do gráfico em pixels

    return (
      <div className="w-full">
        {/* Legenda */}
        <div className="flex items-center justify-center gap-6 mb-6">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#60A5FA' }}></div>
            <span className="text-sm text-slate-700 font-medium">Investimento</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-gradient-to-b from-emerald-600 to-emerald-400"></div>
            <span className="text-sm text-slate-700 font-medium">Faturamento</span>
          </div>
        </div>

        {/* Gráfico */}
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
          <div className="ml-12 pr-4 relative">
            {/* Grid Lines */}
            <div className="relative" style={{ height: `${alturaMaxima}px` }}>
              {valoresEixoY.map((value, index) => {
                // Inverter: 0 embaixo, maxValueFinal em cima
                const yPosition = alturaMaxima - (value / maxValueFinal) * alturaMaxima;
                return (
                  <div
                    key={index}
                    className="absolute left-0 right-0 border-t border-slate-200"
                    style={{ top: `${yPosition}px` }}
                  />
                );
              })}

              {/* SVG para linha de Investimento e barras de Faturamento */}
              <svg 
                className="absolute inset-0 w-full h-full" 
                viewBox={`0 0 1200 ${alturaMaxima}`}
                preserveAspectRatio="none"
                style={{ overflow: 'visible' }}
              >
                <defs>
                  {/* Gradiente verde para barras de Faturamento */}
                  <linearGradient id="gradient-faturamento-pgm" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#34D399" stopOpacity="0.7" />
                  </linearGradient>
                  {/* Gradiente azul claro para área preenchida de Investimento */}
                  <linearGradient id="gradient-investimento-area-pgm" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#60A5FA" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#60A5FA" stopOpacity="0.05" />
                  </linearGradient>
                </defs>

                {/* Barras de Faturamento - renderizar primeiro para ficar atrás da linha */}
                {mesesCompletos.map((item, index) => {
                  const larguraViewBox = 1200;
                  const numMeses = 12; // Sempre 12 meses
                  const larguraMes = larguraViewBox / numMeses;
                  const xCentro = (index * larguraMes) + (larguraMes / 2);
                  const larguraBarra = larguraMes * 0.5; // 50% da largura do mês
                  const alturaFaturamento = (item.faturamento / maxValueFinal) * alturaMaxima;
                  const xBarra = xCentro - (larguraBarra / 2);
                  const yBarra = alturaMaxima - alturaFaturamento;
                  const isHovered = hoveredBar === index;

                  return (
                    <g key={index}>
                      <rect
                        x={xBarra}
                        y={yBarra}
                        width={larguraBarra}
                        height={alturaFaturamento}
                        fill="url(#gradient-faturamento-pgm)"
                        rx="4"
                        ry="4"
                        style={{
                          cursor: 'pointer',
                          opacity: isHovered ? 0.8 : 1,
                          transition: 'opacity 0.2s'
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
                    </g>
                  );
                })}

                {/* Linha de Investimento - renderizar depois das barras para ficar por cima */}
                {(() => {
                  const larguraViewBox = 1200;
                  const numMeses = 12; // Sempre 12 meses
                  const larguraMes = larguraViewBox / numMeses;
                  const pontos = mesesCompletos.map((item, index) => {
                    const x = (index * larguraMes) + (larguraMes / 2);
                    const y = alturaMaxima - (item.investimento / maxValueFinal) * alturaMaxima;
                    return { x, y, value: item.investimento };
                  });

                  // Criar path suave para a linha usando curvas de Bezier
                  let pathLine = '';
                  let pathArea = '';
                  if (pontos.length > 0) {
                    pathLine = `M ${pontos[0].x} ${pontos[0].y}`;
                    pathArea = `M ${pontos[0].x} ${alturaMaxima} L ${pontos[0].x} ${pontos[0].y}`;
                    
                    for (let i = 1; i < pontos.length; i++) {
                      const prev = pontos[i - 1];
                      const curr = pontos[i];
                      const cp1x = prev.x + (curr.x - prev.x) / 2;
                      const cp2x = prev.x + (curr.x - prev.x) / 2;
                      pathLine += ` C ${cp1x} ${prev.y}, ${cp2x} ${curr.y}, ${curr.x} ${curr.y}`;
                      pathArea += ` C ${cp1x} ${prev.y}, ${cp2x} ${curr.y}, ${curr.x} ${curr.y}`;
                    }
                    
                    pathArea += ` L ${pontos[pontos.length - 1].x} ${alturaMaxima} Z`;
                  }

                  return (
                    <>
                      {/* Área preenchida sob a linha de Investimento */}
                      <path
                        d={pathArea}
                        fill="url(#gradient-investimento-area-pgm)"
                      />
                      {/* Linha de Investimento */}
                      <path
                        d={pathLine}
                        fill="none"
                        stroke="#60A5FA"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      {/* Pontos na linha de Investimento - bolinha branca com borda azul */}
                      {pontos.map((ponto, idx) => (
                        <circle
                          key={idx}
                          cx={ponto.x}
                          cy={ponto.y}
                          r="6"
                          fill="white"
                          stroke="#60A5FA"
                          strokeWidth="2.5"
                        />
                      ))}
                    </>
                  );
                })()}
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
                <div className="font-semibold mb-1 text-white">{tooltipData.mes}</div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded" style={{ backgroundColor: '#60A5FA' }}></div>
                    <span className="text-white">Investimento: {formatCurrency(mesesCompletos[hoveredBar].investimento)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded bg-gradient-to-b from-emerald-600 to-emerald-400"></div>
                    <span className="text-white">Faturamento: {formatCurrency(mesesCompletos[hoveredBar].faturamento)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Eixo X - Labels dos meses */}
            <div className="flex justify-between mt-2 px-2">
              {mesesCompletos.map((item, index) => (
                <div 
                  key={index} 
                  className="text-xs text-slate-400 font-medium" 
                  style={{ width: '8.33%', textAlign: 'center' }}
                >
                  {item.mes}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <Helmet>
        <title>Painel PGM - JB APEX</title>
      </Helmet>

      <div className="space-y-6 max-w-7xl mx-auto">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#1e293b] tracking-tight">
              Painel PGM
            </h1>
            <p className="text-sm text-slate-500 mt-1 font-medium">
              {isClientView 
                ? 'Painel de Gestão e Métricas - Seus resultados consolidados'
                : 'Painel de Gestão e Métricas - Análise consolidada de todos os clientes'
              }
            </p>
          </div>
          
          {/* Filtros discretos no header */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {!isClientView && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Buscar cliente..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-48 h-10 text-sm bg-slate-50 border-slate-200 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
                />
              </div>
            )}
            <div className="flex items-center gap-2">
              <Select value={periodo} onValueChange={(value) => {
                setPeriodo(value);
                if (value !== 'custom') {
                  setShowDatePicker(false);
                }
              }}>
                <SelectTrigger className="w-40 h-10 text-sm bg-slate-50 border-slate-200 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
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
                      className="w-auto h-10 text-sm bg-slate-50 border-slate-200 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] px-3"
                    >
                      {dateRange.from && dateRange.to ? (
                        <span className="text-slate-700">
                          {format(dateRange.from, 'dd/MM/yyyy', { locale: ptBR })} - {format(dateRange.to, 'dd/MM/yyyy', { locale: ptBR })}
                        </span>
                      ) : dateRange.from ? (
                        <span className="text-slate-700">
                          {format(dateRange.from, 'dd/MM/yyyy', { locale: ptBR })} - ...
                        </span>
                      ) : (
                        <span className="text-slate-400">Selecione o intervalo</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 rounded-2xl border-none shadow-2xl" align="start">
                    <div className="flex">
                      <div className="p-4 border-r border-slate-200">
                        <div className="space-y-1">
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
                            // Fechar quando ambos os valores estiverem selecionados
                            if (newRange?.from && newRange?.to) {
                              setShowDatePicker(false);
                              // Os dados serão recarregados automaticamente pelo useEffect que depende de periodo
                            }
                          }}
                          numberOfMonths={2}
                          locale={ptBR}
                          className="rounded-2xl"
                        />
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>
        </header>

        {/* Cards de Métricas Gerais */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="bg-white border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[1.5rem] overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 p-6">
              <CardTitle className="text-sm font-semibold text-slate-700">Investimento em Ads</CardTitle>
              <TrendingDown className="h-5 w-5 text-cyan-500" />
            </CardHeader>
            <CardContent className="p-6 pt-0">
              <div className="text-xl font-bold text-cyan-600">
                {formatCurrency(metricasGerais.totalInvestimento)}
              </div>
              <p className="text-xs text-slate-400 mt-1 font-medium">
                No período selecionado
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[1.5rem] overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 p-6">
              <CardTitle className="text-sm font-semibold text-slate-700">Total de Leads</CardTitle>
              <Target className="h-5 w-5 text-blue-500" />
            </CardHeader>
            <CardContent className="p-6 pt-0">
              <div className="text-xl font-bold text-blue-600">
                {formatNumber(metricasGerais.totalLeads)}
              </div>
              <p className="text-xs text-slate-400 mt-1 font-medium">
                CPL médio: {formatCurrency(metricasGerais.cplMedio)}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[1.5rem] overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 p-6">
              <CardTitle className="text-sm font-semibold text-slate-700">Vendas Realizadas</CardTitle>
              <ShoppingCart className="h-5 w-5 text-purple-500" />
            </CardHeader>
            <CardContent className="p-6 pt-0">
              <div className="text-xl font-bold text-purple-600">
                {formatNumber(metricasGerais.totalVendas)}
              </div>
              <p className="text-xs text-slate-400 mt-1 font-medium">
                Taxa de conversão: {formatPercentage(metricasGerais.taxaConversaoGeral)}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[1.5rem] overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 p-6">
              <CardTitle className="text-sm font-semibold text-slate-700">Faturamento</CardTitle>
              <DollarSign className="h-5 w-5 text-green-500" />
            </CardHeader>
            <CardContent className="p-6 pt-0">
              <div className="text-xl font-bold text-green-600">
                {formatCurrency(metricasGerais.totalFaturamento)}
              </div>
              <p className="text-xs text-slate-400 mt-1 font-medium">
                Ticket médio: {formatCurrency(metricasGerais.ticketMedioGeral)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Gráficos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Funil de Vendas */}
          <Card className="bg-white border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[1.5rem] overflow-hidden">
            <CardHeader className="p-8 pb-4">
              <CardTitle className="text-lg font-bold text-[#1e293b] tracking-tight">Funil de Vendas</CardTitle>
              <CardDescription className="text-sm text-slate-400 mt-1 font-medium">
                Performance detalhada {isClientView ? 'do parceiro' : 'dos parceiros'}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-8 pt-0">
              {loading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <FunnelChart data={funilData} />
              )}
            </CardContent>
          </Card>

          {/* Performance Mensal */}
          <Card className="bg-white border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[1.5rem] overflow-hidden">
            <CardHeader className="p-8 pb-4">
              <CardTitle className="text-lg font-bold text-[#1e293b] tracking-tight">Performance Mensal</CardTitle>
              <CardDescription className="text-sm text-slate-400 mt-1 font-medium">
                Detalhada pelo período selecionado
              </CardDescription>
            </CardHeader>
            <CardContent className="p-8 pt-0">
              {loading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : dadosMensais.length === 0 ? (
                <div className="text-center py-12 text-slate-400 font-medium">
                  Nenhum dado mensal encontrado.
                </div>
              ) : (
                <MonthlyPerformanceChart data={dadosMensais} />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tabela de Performance Dia a Dia */}
        <Card className="bg-white border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[1.5rem] overflow-hidden">
          <CardHeader className="p-8 pb-4">
            <CardTitle className="text-lg font-bold text-[#1e293b] tracking-tight">Performance Consolidada</CardTitle>
            <CardDescription className="text-sm text-slate-400 mt-1 font-medium">
              Dados consolidados dia a dia separados por origem
            </CardDescription>
          </CardHeader>
          <CardContent className="p-8 pt-0">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : dadosDiarios.length === 0 ? (
              <div className="text-center py-12 text-slate-400 font-medium">
                Nenhum dado encontrado para o período selecionado.
              </div>
            ) : (
              <Tabs value={abaAtiva} onValueChange={setAbaAtiva} className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6 bg-slate-100 rounded-xl p-1">
                  <TabsTrigger 
                    value="cadastro" 
                    className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-slate-900 text-slate-600 font-medium"
                  >
                    Cadastro Diário
                  </TabsTrigger>
                  <TabsTrigger 
                    value="trafego" 
                    className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-slate-900 text-slate-600 font-medium"
                  >
                    Tráfego Pago
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="cadastro" className="mt-0">
                  {dadosCadastroDiario.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 font-medium">
                      Nenhum dado de cadastro diário encontrado para o período selecionado.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-slate-200">
                            <TableHead className="text-slate-700 font-semibold">Data</TableHead>
                            {!isClientView && (
                              <TableHead className="text-slate-700 font-semibold">Cliente</TableHead>
                            )}
                            <TableHead className="text-slate-700 font-semibold">Investimento (R$)</TableHead>
                            <TableHead className="text-slate-700 font-semibold">Leads</TableHead>
                            <TableHead className="text-slate-700 font-semibold">{funnelStep2Name}</TableHead>
                            <TableHead className="text-slate-700 font-semibold">{funnelStep3Name}</TableHead>
                            <TableHead className="text-slate-700 font-semibold">Vendas</TableHead>
                            <TableHead className="text-slate-700 font-semibold">Faturamento (R$)</TableHead>
                            <TableHead className="text-slate-700 font-semibold">CPL</TableHead>
                            <TableHead className="text-slate-700 font-semibold">Taxa Conversão</TableHead>
                            <TableHead className="text-slate-700 font-semibold">Ticket Médio</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {dadosCadastroDiario
                            .sort((a, b) => new Date(b.data_referencia) - new Date(a.data_referencia))
                            .map((item, index) => (
                              <TableRow key={index} className="border-slate-100 hover:bg-slate-50/50">
                                <TableCell className="text-slate-800 font-medium">
                                  {format(new Date(item.data_referencia), 'dd/MM/yyyy', { locale: ptBR })}
                                </TableCell>
                                {!isClientView && (
                                  <TableCell className="font-medium text-slate-800">
                                    {item.cliente?.empresa || 'N/A'}
                                  </TableCell>
                                )}
                                <TableCell className="text-slate-700">
                                  {formatCurrency(item.investimento)}
                                </TableCell>
                                <TableCell className="text-slate-700">
                                  {formatNumber(item.leads)}
                                </TableCell>
                                <TableCell className="text-slate-700">
                                  {formatNumber(item.visitas_agendadas)}
                                </TableCell>
                                <TableCell className="text-slate-700">
                                  {formatNumber(item.visitas_realizadas)}
                                </TableCell>
                                <TableCell className="text-slate-700">
                                  {formatNumber(item.vendas)}
                                </TableCell>
                                <TableCell className="font-semibold text-green-600">
                                  {formatCurrency(item.faturamento)}
                                </TableCell>
                                <TableCell className="text-slate-700">
                                  {item.leads > 0 ? formatCurrency(item.cpl) : '-'}
                                </TableCell>
                                <TableCell className="text-slate-700">
                                  {formatPercentage(item.taxa_conversao)}
                                </TableCell>
                                <TableCell className="text-slate-700">
                                  {item.vendas > 0 ? formatCurrency(item.ticket_medio) : '-'}
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>
                
                <TabsContent value="trafego" className="mt-0">
                  {dadosTrafegoPago.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 font-medium">
                      Nenhum dado de tráfego pago encontrado para o período selecionado.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-slate-200">
                            <TableHead className="text-slate-700 font-semibold">Data</TableHead>
                            {!isClientView && (
                              <TableHead className="text-slate-700 font-semibold">Cliente</TableHead>
                            )}
                            <TableHead className="text-slate-700 font-semibold">Investimento (R$)</TableHead>
                            <TableHead className="text-slate-700 font-semibold">Leads</TableHead>
                            <TableHead className="text-slate-700 font-semibold">{funnelStep2Name}</TableHead>
                            <TableHead className="text-slate-700 font-semibold">{funnelStep3Name}</TableHead>
                            <TableHead className="text-slate-700 font-semibold">Vendas</TableHead>
                            <TableHead className="text-slate-700 font-semibold">Faturamento (R$)</TableHead>
                            <TableHead className="text-slate-700 font-semibold">CPL</TableHead>
                            <TableHead className="text-slate-700 font-semibold">Taxa Conversão</TableHead>
                            <TableHead className="text-slate-700 font-semibold">Ticket Médio</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {dadosTrafegoPago
                            .sort((a, b) => new Date(b.data_referencia) - new Date(a.data_referencia))
                            .map((item, index) => (
                              <TableRow key={index} className="border-slate-100 hover:bg-slate-50/50">
                                <TableCell className="text-slate-800 font-medium">
                                  {format(new Date(item.data_referencia), 'dd/MM/yyyy', { locale: ptBR })}
                                </TableCell>
                                {!isClientView && (
                                  <TableCell className="font-medium text-slate-800">
                                    {item.cliente?.empresa || 'N/A'}
                                  </TableCell>
                                )}
                                <TableCell className="text-slate-700">
                                  {formatCurrency(item.investimento)}
                                </TableCell>
                                <TableCell className="text-slate-700">
                                  {formatNumber(item.leads)}
                                </TableCell>
                                <TableCell className="text-slate-700">
                                  {formatNumber(item.visitas_agendadas)}
                                </TableCell>
                                <TableCell className="text-slate-700">
                                  {formatNumber(item.visitas_realizadas)}
                                </TableCell>
                                <TableCell className="text-slate-700">
                                  {formatNumber(item.vendas)}
                                </TableCell>
                                <TableCell className="font-semibold text-green-600">
                                  {formatCurrency(item.faturamento)}
                                </TableCell>
                                <TableCell className="text-slate-700">
                                  {item.leads > 0 ? formatCurrency(item.cpl) : '-'}
                                </TableCell>
                                <TableCell className="text-slate-700">
                                  {formatPercentage(item.taxa_conversao)}
                                </TableCell>
                                <TableCell className="text-slate-700">
                                  {item.vendas > 0 ? formatCurrency(item.ticket_medio) : '-'}
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default PGMPanel;
