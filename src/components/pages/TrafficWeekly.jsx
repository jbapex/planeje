import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar as CalendarIcon, Loader2, FileText, TrendingUp, MousePointerClick, List, Edit, Trash2, X } from 'lucide-react';

import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

const formatCurrency = (value) => {
  const num = typeof value === 'number' ? value : parseFloat(value) || 0;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(num);
};

const formatPercentage = (value) => {
  const num = typeof value === 'number' ? value : parseFloat(value) || 0;
  return `${num.toFixed(2)}%`;
};

const TrafficWeekly = () => {
  const { profile } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clientes, setClientes] = useState([]);
  const [clienteSelecionado, setClienteSelecionado] = useState('');
  const [semanaInicio, setSemanaInicio] = useState(null);
  const [semanaFim, setSemanaFim] = useState(null);
  const [formState, setFormState] = useState({
    impressoes: '',
    cliques: '',
    leads: '',
    investimento: '',
    observacoes: '',
  });
  const [historico, setHistorico] = useState([]);
  const [showLista, setShowLista] = useState(false);
  const [todosLancamentos, setTodosLancamentos] = useState([]);
  const [loadingLista, setLoadingLista] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [excluindoId, setExcluindoId] = useState(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Calcular CTR e CLP automaticamente
  const ctr = useMemo(() => {
    const imp = parseInt(formState.impressoes || 0);
    const cli = parseInt(formState.cliques || 0);
    return imp > 0 ? (cli / imp) * 100 : 0;
  }, [formState.impressoes, formState.cliques]);

  const clp = useMemo(() => {
    const inv = parseFloat(formState.investimento || 0);
    const lea = parseInt(formState.leads || 0);
    return lea > 0 ? inv / lea : 0;
  }, [formState.investimento, formState.leads]);

  const isFormValid = useMemo(() => {
    return (
      !!clienteSelecionado &&
      !!semanaInicio &&
      !!semanaFim &&
      formState.impressoes !== '' &&
      formState.investimento !== ''
    );
  }, [clienteSelecionado, semanaInicio, semanaFim, formState.impressoes, formState.investimento]);

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setLoading(true);

        // Buscar todos os clientes
        const { data: clientesData, error: clientesError } = await supabase
          .from('clientes')
          .select('id, empresa')
          .order('empresa');

        if (clientesError) {
          console.error('Erro ao carregar clientes:', clientesError);
          toast({
            title: 'Erro ao carregar clientes',
            description: 'Não foi possível carregar a lista de clientes.',
            variant: 'destructive',
          });
        } else {
          setClientes(clientesData || []);
        }

        // Buscar histórico recente (últimas 6 semanas)
        const { data: historicoData, error: historicoError } = await supabase
          .from('cliente_resultados_semanais')
          .select(`
            *,
            clientes:cliente_id(empresa),
            created_by_profile:profiles!cliente_resultados_semanais_created_by_fkey(full_name)
          `)
          .order('semana_inicio', { ascending: false })
          .limit(6);

        if (historicoError) {
          console.error('Erro ao carregar histórico semanal:', historicoError);
        } else {
          setHistorico(historicoData || []);
        }
      } catch (error) {
        console.error('Erro ao carregar dados iniciais:', error);
        toast({
          title: 'Erro ao carregar dados',
          description: 'Não foi possível carregar os dados iniciais.',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
  }, [toast]);

  // Buscar todos os lançamentos para a lista
  const carregarTodosLancamentos = async () => {
    setLoadingLista(true);
    try {
      const { data, error } = await supabase
        .from('cliente_resultados_semanais')
        .select(`
          *,
          clientes:cliente_id(empresa),
          created_by_profile:profiles!cliente_resultados_semanais_created_by_fkey(full_name)
        `)
        .order('semana_inicio', { ascending: false });

      if (error) {
        console.error('Erro ao carregar lançamentos:', error);
        toast({
          title: 'Erro ao carregar lançamentos',
          description: 'Não foi possível carregar a lista de lançamentos.',
          variant: 'destructive',
        });
      } else {
        setTodosLancamentos(data || []);
      }
    } catch (error) {
      console.error('Erro ao carregar lançamentos:', error);
      toast({
        title: 'Erro ao carregar lançamentos',
        description: 'Ocorreu um erro inesperado.',
        variant: 'destructive',
      });
    } finally {
      setLoadingLista(false);
    }
  };

  // Abrir modal de lista
  const handleAbrirLista = () => {
    setShowLista(true);
    carregarTodosLancamentos();
  };

  // Editar lançamento
  const handleEditar = (lancamento) => {
    setEditandoId(lancamento.id);
    setClienteSelecionado(lancamento.cliente_id);
    
    // Converter datas
    const inicio = new Date(lancamento.semana_inicio);
    const fim = new Date(lancamento.semana_fim);
    setSemanaInicio(inicio);
    setSemanaFim(fim);
    
    // Preencher formulário
    setFormState({
      impressoes: lancamento.impressoes?.toString() || '',
      cliques: lancamento.cliques?.toString() || '',
      leads: lancamento.leads?.toString() || '',
      investimento: lancamento.investimento?.toString() || '',
      observacoes: lancamento.observacoes || '',
    });
    
    setShowLista(false);
    
    // Scroll para o formulário
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Excluir lançamento
  const handleExcluir = async () => {
    if (!excluindoId) return;

    try {
      const { error } = await supabase
        .from('cliente_resultados_semanais')
        .delete()
        .eq('id', excluindoId);

      if (error) {
        console.error('Erro ao excluir lançamento:', error);
        toast({
          title: 'Erro ao excluir',
          description: 'Não foi possível excluir o lançamento.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Lançamento excluído!',
          description: 'O lançamento foi excluído com sucesso.',
        });
        
        // Recarregar listas
        carregarTodosLancamentos();
        const { data: historicoData } = await supabase
          .from('cliente_resultados_semanais')
          .select(`
            *,
            clientes:cliente_id(empresa),
            created_by_profile:profiles!cliente_resultados_semanais_created_by_fkey(full_name)
          `)
          .order('semana_inicio', { ascending: false })
          .limit(6);
        setHistorico(historicoData || []);
      }
    } catch (error) {
      console.error('Erro ao excluir lançamento:', error);
      toast({
        title: 'Erro ao excluir',
        description: 'Ocorreu um erro inesperado.',
        variant: 'destructive',
      });
    } finally {
      setExcluindoId(null);
      setShowDeleteDialog(false);
    }
  };

  const handleChange = (field, value) => {
    setFormState((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSemanaSelect = (date) => {
    if (!date) {
      setSemanaInicio(null);
      setSemanaFim(null);
      return;
    }
    
    // Garantir que a data seja um objeto Date válido
    const dataSelecionada = date instanceof Date ? date : new Date(date);
    
    // Calcular início da semana (segunda-feira)
    const inicio = startOfWeek(dataSelecionada, { weekStartsOn: 1 });
    // Calcular fim da semana (domingo)
    const fim = endOfWeek(dataSelecionada, { weekStartsOn: 1 });
    
    // Garantir que início e fim sejam diferentes
    if (inicio.getTime() === fim.getTime()) {
      // Se por algum motivo forem iguais, adicionar 6 dias ao fim
      fim.setDate(fim.getDate() + 6);
    }
    
    console.log('📅 Semana selecionada:', {
      dataSelecionada: format(dataSelecionada, 'dd/MM/yyyy'),
      inicio: format(inicio, 'dd/MM/yyyy'),
      fim: format(fim, 'dd/MM/yyyy'),
      diasDiferenca: Math.ceil((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24))
    });
    
    setSemanaInicio(inicio);
    setSemanaFim(fim);
  };

  const handleRegister = async () => {
    if (!clienteSelecionado || !semanaInicio || !semanaFim) return;

    // Validações
    const impressoes = parseInt(formState.impressoes || 0);
    const cliques = parseInt(formState.cliques || 0);
    const leads = parseInt(formState.leads || 0);
    const investimento = parseFloat(
      String(formState.investimento)
        .replace(/\./g, '')
        .replace(',', '.')
    ) || 0;

    if (cliques > impressoes) {
      toast({
        title: 'Erro de validação',
        description: 'O número de cliques não pode ser maior que o número de impressões.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);

    try {
      // Garantir que semana_inicio e semana_fim sejam diferentes
      if (semanaInicio.getTime() === semanaFim.getTime()) {
        toast({
          title: 'Erro de validação',
          description: 'A semana deve ter início e fim diferentes. Por favor, selecione uma data válida.',
          variant: 'destructive',
        });
        setSaving(false);
        return;
      }

      // Se estiver editando, atualizar ao invés de inserir
      if (editandoId) {
        const { error: updateError } = await supabase
          .from('cliente_resultados_semanais')
          .update({
            semana_inicio: format(semanaInicio, 'yyyy-MM-dd'),
            semana_fim: format(semanaFim, 'yyyy-MM-dd'),
            impressoes: impressoes,
            cliques: cliques,
            leads: leads,
            investimento: investimento,
            observacoes: formState.observacoes || null,
          })
          .eq('id', editandoId);

        if (updateError) {
          console.error('Erro ao atualizar lançamento:', updateError);
          toast({
            title: 'Erro ao atualizar',
            description: 'Não foi possível atualizar o lançamento.',
            variant: 'destructive',
          });
          setSaving(false);
          return;
        }

        toast({
          title: 'Lançamento atualizado!',
          description: 'Os dados da semana foram atualizados com sucesso.',
        });

        // Limpar estado de edição
        setEditandoId(null);
        setClienteSelecionado('');
        setSemanaInicio(null);
        setSemanaFim(null);
        setFormState({
          impressoes: '',
          cliques: '',
          leads: '',
          investimento: '',
          observacoes: '',
        });
      } else {
        // Se não estiver editando, inserir novo registro
        const payload = {
          cliente_id: clienteSelecionado,
          semana_inicio: format(semanaInicio, 'yyyy-MM-dd'),
          semana_fim: format(semanaFim, 'yyyy-MM-dd'),
          impressoes: impressoes,
          cliques: cliques,
          leads: leads,
          investimento: investimento,
          observacoes: formState.observacoes || null,
          created_by: profile?.id || null,
        };

        console.log('💾 Salvando dados semanais:', {
          semana_inicio: payload.semana_inicio,
          semana_fim: payload.semana_fim,
          cliente_id: payload.cliente_id
        });

        const { error } = await supabase.from('cliente_resultados_semanais').insert(payload);

        if (error) {
          console.error('Erro ao registrar semana:', error);
          toast({
            title: 'Erro ao registrar',
            description: 'Não foi possível salvar os dados da semana. Tente novamente.',
            variant: 'destructive',
          });
          setSaving(false);
          return;
        }

        toast({
          title: 'Cadastro semanal salvo!',
          description: 'Os dados de tráfego da semana selecionada foram salvos com sucesso.',
        });

        // Limpar formulário
        setClienteSelecionado('');
        setSemanaInicio(null);
        setSemanaFim(null);
        setFormState({
          impressoes: '',
          cliques: '',
          leads: '',
          investimento: '',
          observacoes: '',
        });
      }

      // Recarregar histórico
      const { data: historicoData, error: historicoError } = await supabase
        .from('cliente_resultados_semanais')
        .select(`
          *,
          clientes:cliente_id(empresa),
          created_by_profile:profiles!cliente_resultados_semanais_created_by_fkey(full_name)
        `)
        .order('semana_inicio', { ascending: false })
        .limit(6);

      if (historicoError) {
        console.error('Erro ao recarregar histórico semanal:', historicoError);
      } else {
        setHistorico(historicoData || []);
      }

      // Recarregar lista se estiver aberta
      if (showLista) {
        carregarTodosLancamentos();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Tráfego Semanal - JB APEX</title>
      </Helmet>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Header */}
          <header className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[#1e293b] tracking-tight">
                Tráfego Semanal
              </h1>
              <p className="text-sm text-slate-500 mt-1 font-medium">
                Registre os dados de tráfego pago por semana
              </p>
            </div>
            <Button
              onClick={handleAbrirLista}
              variant="outline"
              className="flex items-center gap-2 h-10 bg-white border-slate-200 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] hover:bg-slate-50"
            >
              <List className="h-4 w-4" />
              Ver Todos os Lançamentos
            </Button>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)] gap-6">
            {/* Card Esquerdo - Formulário */}
            <Card className="bg-white border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[1.5rem] overflow-hidden">
              <CardHeader className="p-6 pb-4">
                <CardTitle className="text-lg font-bold text-slate-800">Cadastrar Dados Semanais</CardTitle>
                <CardDescription className="text-sm text-slate-500 mt-1 font-medium">
                  Preencha os resultados de tráfego da semana selecionada.
                </CardDescription>
              </CardHeader>
                <CardContent className="p-6 pt-0 space-y-5">
                  {/* Cliente */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Cliente</label>
                    <Select value={clienteSelecionado} onValueChange={setClienteSelecionado}>
                      <SelectTrigger className="h-10 bg-slate-50 border-slate-200 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                        <SelectValue placeholder="Selecione o cliente" />
                      </SelectTrigger>
                      <SelectContent>
                        {clientes.map((cliente) => (
                          <SelectItem key={cliente.id} value={cliente.id}>
                            {cliente.empresa}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Semana */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Semana</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-start h-10 bg-slate-50 border-slate-200 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] hover:bg-slate-50"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {semanaInicio && semanaFim ? (
                            <span className="text-sm">
                              {format(semanaInicio, 'dd/MM/yyyy', { locale: ptBR })} - {format(semanaFim, 'dd/MM/yyyy', { locale: ptBR })}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">Selecione uma data da semana</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          initialFocus
                          mode="single"
                          numberOfMonths={1}
                          selected={semanaInicio}
                          onSelect={handleSemanaSelect}
                          locale={ptBR}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Grid de campos numéricos */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Impressões</label>
                      <Input
                        type="number"
                        min="0"
                        value={formState.impressoes}
                        onChange={(e) => handleChange('impressoes', e.target.value)}
                        className="h-10 bg-slate-50 border-slate-200 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Cliques</label>
                      <Input
                        type="number"
                        min="0"
                        value={formState.cliques}
                        onChange={(e) => handleChange('cliques', e.target.value)}
                        className="h-10 bg-slate-50 border-slate-200 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Leads</label>
                      <Input
                        type="number"
                        min="0"
                        value={formState.leads}
                        onChange={(e) => handleChange('leads', e.target.value)}
                        className="h-10 bg-slate-50 border-slate-200 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Investimento (R$)</label>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={formState.investimento}
                        onChange={(e) => handleChange('investimento', e.target.value)}
                        className="h-10 bg-slate-50 border-slate-200 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
                        placeholder="0,00"
                      />
                    </div>
                  </div>

                  {/* CTR e CLP (calculados automaticamente) */}
                  <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-200">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                        <MousePointerClick className="h-4 w-4 text-blue-600" />
                        CTR (Calculado)
                      </label>
                      <Input
                        value={formatPercentage(ctr)}
                        disabled
                        className="h-10 bg-slate-100 border-slate-200 rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-emerald-600" />
                        CLP (Calculado)
                      </label>
                      <Input
                        value={formatCurrency(clp)}
                        disabled
                        className="h-10 bg-slate-100 border-slate-200 rounded-xl"
                      />
                    </div>
                  </div>

                  {/* Observações */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Observações</label>
                    <Textarea
                      rows={3}
                      value={formState.observacoes}
                      onChange={(e) => handleChange('observacoes', e.target.value)}
                      className="resize-none bg-slate-50 border-slate-200 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
                      placeholder="Adicione observações sobre esta semana..."
                    />
                  </div>

                  {/* Botão Registrar/Atualizar */}
                  <div className="pt-2">
                    <Button
                      onClick={handleRegister}
                      disabled={!isFormValid || saving}
                      className="w-full h-11 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg shadow-blue-500/20"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          {editandoId ? 'Atualizando...' : 'Registrando...'}
                        </>
                      ) : editandoId ? (
                        <>
                          <Edit className="h-4 w-4 mr-2" />
                          Atualizar Lançamento
                        </>
                      ) : (
                        'Registrar'
                      )}
                    </Button>
                    {editandoId && (
                      <Button
                        onClick={() => {
                          setEditandoId(null);
                          setClienteSelecionado('');
                          setSemanaInicio(null);
                          setSemanaFim(null);
                          setFormState({
                            impressoes: '',
                            cliques: '',
                            leads: '',
                            investimento: '',
                            observacoes: '',
                          });
                        }}
                        variant="outline"
                        className="w-full h-11 text-sm font-semibold mt-2 bg-white border-slate-200 rounded-xl hover:bg-slate-50"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Cancelar Edição
                      </Button>
                    )}
                  </div>
                </CardContent>
            </Card>

            {/* Card Direito - Histórico */}
            <Card className="bg-white border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[1.5rem] overflow-hidden">
              <CardHeader className="p-6 pb-4">
                <CardTitle className="text-lg font-bold text-slate-800">Histórico Recente</CardTitle>
                <CardDescription className="text-sm text-slate-500 mt-1 font-medium">
                  Últimas 6 semanas cadastradas.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 pt-0 space-y-4">
                {historico.length === 0 ? (
                  <p className="text-sm text-slate-500 font-medium">Nenhuma semana cadastrada ainda.</p>
                ) : (
                  historico.map((semana) => {
                    const ctrCalculado = semana.impressoes > 0 ? (semana.cliques / semana.impressoes) * 100 : 0;
                    const clpCalculado = semana.leads > 0 ? semana.investimento / semana.leads : 0;
                    
                    return (
                      <div
                        key={semana.id}
                        className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-300 transition-all duration-200"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="font-bold text-sm text-slate-800">
                              {format(new Date(semana.semana_inicio), 'dd/MM', { locale: ptBR })} - {format(new Date(semana.semana_fim), 'dd/MM', { locale: ptBR })}
                            </p>
                            <p className="text-xs text-slate-500 mt-1 font-medium">
                              {semana.clientes?.empresa || 'Cliente não encontrado'}
                            </p>
                          </div>
                        </div>
                        <div className="space-y-1 text-xs text-slate-600">
                          <p>
                            <span className="font-semibold">Impressões:</span> {semana.impressoes?.toLocaleString('pt-BR') || 0} -{' '}
                            <span className="font-semibold">Cliques:</span> {semana.cliques?.toLocaleString('pt-BR') || 0}
                          </p>
                          <p>
                            <span className="font-semibold">Leads:</span> {semana.leads?.toLocaleString('pt-BR') || 0} -{' '}
                            <span className="font-semibold">Investimento:</span> {formatCurrency(semana.investimento || 0)}
                          </p>
                          <p>
                            <span className="font-semibold">CTR:</span> {formatPercentage(ctrCalculado)} -{' '}
                            <span className="font-semibold">CLP:</span> {formatCurrency(clpCalculado)}
                          </p>
                          {semana.observacoes && (
                            <p className="mt-2 text-xs italic text-slate-500">
                              {semana.observacoes}
                            </p>
                          )}
                          {semana.created_by_profile && (
                            <p className="mt-1 text-xs text-slate-400">
                              Cadastrado por: {semana.created_by_profile.full_name}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Dialog de Lista de Lançamentos */}
      <Dialog open={showLista} onOpenChange={setShowLista}>
        <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto bg-white rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-[#1e293b] tracking-tight">Todos os Lançamentos</DialogTitle>
            <DialogDescription className="text-sm text-slate-500 font-medium">
              Visualize, edite ou exclua lançamentos de tráfego semanal
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            {loadingLista ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : todosLancamentos.length === 0 ? (
              <p className="text-center py-8 text-slate-500 font-medium">
                Nenhum lançamento encontrado.
              </p>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="text-slate-700 font-semibold">Cliente</TableHead>
                      <TableHead className="text-slate-700 font-semibold">Semana</TableHead>
                      <TableHead className="text-slate-700 font-semibold">Impressões</TableHead>
                      <TableHead className="text-slate-700 font-semibold">Cliques</TableHead>
                      <TableHead className="text-slate-700 font-semibold">Leads</TableHead>
                      <TableHead className="text-slate-700 font-semibold">Investimento</TableHead>
                      <TableHead className="text-slate-700 font-semibold">CTR</TableHead>
                      <TableHead className="text-slate-700 font-semibold">CLP</TableHead>
                      <TableHead className="text-slate-700 font-semibold">Cadastrado por</TableHead>
                      <TableHead className="text-right text-slate-700 font-semibold">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {todosLancamentos.map((lancamento) => {
                      const ctr = lancamento.impressoes > 0 ? (lancamento.cliques / lancamento.impressoes) * 100 : 0;
                      const clp = lancamento.leads > 0 ? lancamento.investimento / lancamento.leads : 0;
                      
                      return (
                        <TableRow key={lancamento.id} className="hover:bg-slate-50">
                          <TableCell className="font-semibold text-slate-800">
                            {lancamento.clientes?.empresa || 'N/A'}
                          </TableCell>
                          <TableCell className="text-slate-700 font-medium">
                            {format(new Date(lancamento.semana_inicio), 'dd/MM/yyyy', { locale: ptBR })} - {format(new Date(lancamento.semana_fim), 'dd/MM/yyyy', { locale: ptBR })}
                          </TableCell>
                          <TableCell className="text-slate-700">{lancamento.impressoes?.toLocaleString('pt-BR') || 0}</TableCell>
                          <TableCell className="text-slate-700">{lancamento.cliques?.toLocaleString('pt-BR') || 0}</TableCell>
                          <TableCell className="text-slate-700">{lancamento.leads?.toLocaleString('pt-BR') || 0}</TableCell>
                          <TableCell className="text-slate-700 font-semibold">{formatCurrency(lancamento.investimento || 0)}</TableCell>
                          <TableCell className="text-slate-700">{formatPercentage(ctr)}</TableCell>
                          <TableCell className="text-slate-700 font-semibold">{formatCurrency(clp)}</TableCell>
                          <TableCell className="text-sm text-slate-600 font-medium">
                            {lancamento.created_by_profile?.full_name || 'N/A'}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditar(lancamento)}
                                className="h-8 w-8 p-0 hover:bg-blue-50 hover:text-blue-600"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setExcluindoId(lancamento.id);
                                  setShowDeleteDialog(true);
                                }}
                                className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de Confirmação de Exclusão */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este lançamento? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setExcluindoId(null);
              setShowDeleteDialog(false);
            }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleExcluir}
              className="bg-red-600 hover:bg-red-700"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default TrafficWeekly;
