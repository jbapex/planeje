import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar as CalendarIcon, Loader2, FileText, List, Edit, Trash2, X, ChevronDown } from 'lucide-react';

import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

const formatCurrency = (value) => {
  const num =
    typeof value === 'number'
      ? value
      : parseFloat(
          String(value || '')
            .replace(/\./g, '')
            .replace(',', '.'),
        ) || 0;

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(num);
};

// Helper para interpretar datas vindo do banco (YYYY-MM-DD) como datas locais
// evitando o bug de "voltar 1 dia" por causa do fuso horário/UTC
const parseLocalDateFromDb = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;

  const str = String(value);
  const parts = str.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts.map((p) => parseInt(p, 10));
    if (!Number.isNaN(year) && !Number.isNaN(month) && !Number.isNaN(day)) {
      // new Date(ano, mesIndex, dia) usa sempre horário local
      return new Date(year, month - 1, day);
    }
  }

  // Fallback: deixa o JS tentar parsear
  return new Date(str);
};

const ClientCadastroSemanal = () => {
  const { profile } = useAuth();
  const { toast } = useToast();

  const clienteId = profile?.cliente_id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [partnerName, setPartnerName] = useState('');
  const [funnelStep2Name, setFunnelStep2Name] = useState('Visita Agendada');
  const [funnelStep3Name, setFunnelStep3Name] = useState('Visita Realizada');
  const [referenceDate, setReferenceDate] = useState(null);
  const [formState, setFormState] = useState({
    leads: '',
    visitas_agendadas: '',
    visitas_realizadas: '',
    vendas: '',
    faturamento: '',
    observacoes: '',
  });
  const [historico, setHistorico] = useState([]);
  const [showLista, setShowLista] = useState(false);
  const [todosLancamentos, setTodosLancamentos] = useState([]);
  const [loadingLista, setLoadingLista] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [excluindoId, setExcluindoId] = useState(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const isFormValid = useMemo(() => {
    const leadsValid = formState.leads !== '' && formState.leads.trim() !== '';
    const faturamentoValid = formState.faturamento !== '' && formState.faturamento.trim() !== '';
    
    return (
      !!clienteId &&
      !!partnerName &&
      !!referenceDate &&
      leadsValid &&
      faturamentoValid
    );
  }, [clienteId, partnerName, referenceDate, formState.leads, formState.faturamento]);

  useEffect(() => {
    const loadInitialData = async () => {
      if (!clienteId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const [{ data: cliente, error: clienteError }, { data: dias, error: historicoError }] = await Promise.all([
          supabase
            .from('clientes')
            .select('empresa, funnel_step_2_name, funnel_step_3_name')
            .eq('id', clienteId)
            .maybeSingle(),
          supabase
            .from('cliente_resultados_diarios')
            .select(`
              *,
              created_by_profile:profiles!cliente_resultados_diarios_created_by_fkey(full_name)
            `)
            .eq('cliente_id', clienteId)
            .order('data_referencia', { ascending: false })
            .limit(4),
        ]);

        if (clienteError) {
          console.error('Erro ao carregar parceiro:', clienteError);
        } else if (cliente) {
          if (cliente.empresa) setPartnerName(cliente.empresa);
          if (cliente.funnel_step_2_name) setFunnelStep2Name(cliente.funnel_step_2_name);
          if (cliente.funnel_step_3_name) setFunnelStep3Name(cliente.funnel_step_3_name);
        }

        if (historicoError) {
          console.error('Erro ao carregar histórico diário:', historicoError);
          toast({
            title: 'Erro ao carregar histórico',
            description: 'Não foi possível carregar o histórico recente de dias.',
            variant: 'destructive',
          });
        } else {
          setHistorico(dias || []);
        }
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
  }, [clienteId, toast]);

  const carregarTodosLancamentos = async () => {
    if (!clienteId) return;
    
    setLoadingLista(true);
    try {
      const { data, error } = await supabase
        .from('cliente_resultados_diarios')
        .select(`
          *,
          created_by_profile:profiles!cliente_resultados_diarios_created_by_fkey(full_name)
        `)
        .eq('cliente_id', clienteId)
        .order('data_referencia', { ascending: false });

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

  const handleAbrirLista = () => {
    setShowLista(true);
    carregarTodosLancamentos();
  };

  const formatMonetaryForInput = (value) => {
    if (!value && value !== 0) return '';
    const num = typeof value === 'number' ? value : parseFloat(value) || 0;
    return num.toFixed(2).replace('.', ',');
  };

  const handleEditar = (lancamento) => {
    setEditandoId(lancamento.id);
    setReferenceDate(parseLocalDateFromDb(lancamento.data_referencia));
    
    setFormState({
      leads: lancamento.leads?.toString() || '',
      visitas_agendadas: lancamento.visitas_agendadas?.toString() || '',
      visitas_realizadas: lancamento.visitas_realizadas?.toString() || '',
      vendas: lancamento.vendas?.toString() || '',
      faturamento: formatMonetaryForInput(lancamento.faturamento),
      observacoes: lancamento.observacoes || '',
    });
    
    setShowLista(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleExcluir = async () => {
    if (!excluindoId) return;

    try {
      const { error } = await supabase
        .from('cliente_resultados_diarios')
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
        
        carregarTodosLancamentos();
        const { data: historicoData } = await supabase
          .from('cliente_resultados_diarios')
          .select(`
            *,
            created_by_profile:profiles!cliente_resultados_diarios_created_by_fkey(full_name)
          `)
          .eq('cliente_id', clienteId)
          .order('data_referencia', { ascending: false })
          .limit(4);
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

  const formatMonetaryInput = (value) => {
    let cleaned = value.replace(/[^\d,]/g, '');
    const parts = cleaned.split(',');
    if (parts.length > 2) {
      cleaned = parts[0] + ',' + parts.slice(1).join('');
    }
    if (parts.length === 2 && parts[1].length > 2) {
      cleaned = parts[0] + ',' + parts[1].substring(0, 2);
    }
    return cleaned;
  };

  const handleChange = (field, value) => {
    if (field === 'faturamento') {
      value = formatMonetaryInput(value);
    }
    setFormState((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleRegister = async () => {
    if (!clienteId || !referenceDate) return;

    setSaving(true);

    try {
      if (editandoId) {
        const { error: updateError } = await supabase
          .from('cliente_resultados_diarios')
          .update({
            data_referencia: format(referenceDate, 'yyyy-MM-dd'),
            leads: formState.leads ? parseInt(formState.leads, 10) || 0 : 0,
            visitas_agendadas: formState.visitas_agendadas ? parseInt(formState.visitas_agendadas, 10) || 0 : 0,
            visitas_realizadas: formState.visitas_realizadas ? parseInt(formState.visitas_realizadas, 10) || 0 : 0,
            vendas: formState.vendas ? parseInt(formState.vendas, 10) || 0 : 0,
            faturamento:
              formState.faturamento && formState.faturamento !== ''
                ? parseFloat(
                    String(formState.faturamento)
                      .replace(/\./g, '')
                      .replace(',', '.'),
                  ) || 0
                : 0,
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
          description: 'Os dados do dia foram atualizados com sucesso.',
        });

        setEditandoId(null);
        setReferenceDate(null);
        setFormState({
          leads: '',
          visitas_agendadas: '',
          visitas_realizadas: '',
          vendas: '',
          faturamento: '',
          observacoes: '',
        });

        const { data: historicoData } = await supabase
          .from('cliente_resultados_diarios')
          .select(`
            *,
            created_by_profile:profiles!cliente_resultados_diarios_created_by_fkey(full_name)
          `)
          .eq('cliente_id', clienteId)
          .order('data_referencia', { ascending: false })
          .limit(4);
        setHistorico(historicoData || []);

        if (showLista) {
          carregarTodosLancamentos();
        }

        setSaving(false);
        return;
      }

      const payload = {
        cliente_id: clienteId,
        data_referencia: format(referenceDate, 'yyyy-MM-dd'),
        leads: formState.leads ? parseInt(formState.leads, 10) || 0 : 0,
        visitas_agendadas: formState.visitas_agendadas ? parseInt(formState.visitas_agendadas, 10) || 0 : 0,
        visitas_realizadas: formState.visitas_realizadas ? parseInt(formState.visitas_realizadas, 10) || 0 : 0,
        vendas: formState.vendas ? parseInt(formState.vendas, 10) || 0 : 0,
        faturamento:
          formState.faturamento && formState.faturamento !== ''
            ? parseFloat(
                String(formState.faturamento)
                  .replace(/\./g, '')
                  .replace(',', '.'),
              ) || 0
            : 0,
        observacoes: formState.observacoes || null,
        created_by: profile?.id || null,
      };

      const { error } = await supabase.from('cliente_resultados_diarios').insert(payload);

      if (error) {
        console.error('Erro ao registrar dia:', error);
        toast({
          title: 'Erro ao registrar',
          description: error.message || 'Não foi possível salvar os dados do dia. Tente novamente.',
          variant: 'destructive',
        });
        setSaving(false);
        return;
      }

      toast({
        title: 'Cadastro diário salvo!',
        description: 'Os dados de tráfego do dia selecionado foram salvos com sucesso.',
      });

      if (!editandoId) {
        setReferenceDate(null);
        setFormState({
          leads: '',
          visitas_agendadas: '',
          visitas_realizadas: '',
          vendas: '',
          faturamento: '',
          observacoes: '',
        });
      }

      const { data: diasAtualizados, error: historicoError } = await supabase
        .from('cliente_resultados_diarios')
        .select(`
          *,
          created_by_profile:profiles!cliente_resultados_diarios_created_by_fkey(full_name)
        `)
        .eq('cliente_id', clienteId)
        .order('data_referencia', { ascending: false })
        .limit(4);

        if (historicoError) {
          console.error('Erro ao recarregar histórico diário:', historicoError);
        } else {
          setHistorico(diasAtualizados || []);
        }

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
        <title>Cadastro Diário - JB APEX</title>
      </Helmet>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-4 sm:space-y-8 max-w-7xl mx-auto px-2 sm:px-0">
          {/* Título da Página */}
          <header className="flex flex-col md:flex-row md:items-center md:justify-between items-center gap-2 sm:gap-4 text-center md:text-left">
            <div className="w-full md:w-auto">
              <h1 className="text-xl sm:text-3xl font-bold text-[#1e293b] tracking-tight">Cadastro Diário</h1>
              <p className="text-slate-500 text-xs sm:text-base mt-0.5 sm:mt-1 font-medium hidden sm:block">
                Preencha os dados referentes ao dia selecionado.
              </p>
            </div>
            <div className="relative w-full md:w-auto flex justify-center md:justify-end">
              <Button
                onClick={handleAbrirLista}
                variant="outline"
                className="flex items-center gap-2 bg-white border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg sm:rounded-xl h-9 sm:h-10 px-3 sm:px-5 shadow-sm font-semibold transition-all text-xs sm:text-sm"
              >
                <span className="hidden sm:inline">Ver Todos os Lançamentos</span>
                <span className="sm:hidden">Ver Todos</span>
                <ChevronDown className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-400" />
              </Button>
            </div>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-8 items-start">
            {/* Card Esquerdo - Formulário */}
            <div className="lg:col-span-7">
              <Card className="bg-white border-none shadow-sm sm:shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-lg sm:rounded-[1.5rem] overflow-hidden">
                <CardHeader className="p-4 sm:p-8 pb-3 sm:pb-4">
                  <CardTitle className="text-lg sm:text-2xl font-bold text-[#1e293b] tracking-tight">Cadastrar Dados Diários</CardTitle>
                  <CardDescription className="text-xs sm:text-base text-slate-400 mt-0.5 sm:mt-1 font-medium hidden sm:block">
                    Preencha os dados referentes ao dia selecionado.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 sm:p-8 pt-0 space-y-3 sm:space-y-6">
                  {/* Parceiro */}
                  <div className="space-y-1.5 sm:space-y-2">
                    <label className="text-xs sm:text-sm font-medium text-slate-700 ml-1">Parceiro</label>
                    <Input
                      value={partnerName}
                      disabled
                      className="h-10 sm:h-12 bg-slate-50 border-slate-200 rounded-lg sm:rounded-xl text-slate-500 font-medium px-3 sm:px-4 text-xs sm:text-base transition-all shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
                    />
                  </div>

                  {/* Data referência */}
                  <div className="space-y-1.5 sm:space-y-2">
                    <label className="text-xs sm:text-sm font-medium text-slate-700 ml-1">Data referência</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-start h-10 sm:h-12 bg-slate-50 border-slate-200 rounded-lg sm:rounded-xl text-slate-500 font-medium px-3 sm:px-4 hover:bg-slate-100 transition-all group text-xs sm:text-base shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
                        >
                          <CalendarIcon className="mr-2 sm:mr-3 h-4 w-4 sm:h-5 sm:w-5 text-slate-400 group-hover:text-blue-500" />
                          {referenceDate ? (
                            <span className="text-slate-700">
                              {format(referenceDate, 'dd/MM/yyyy', { locale: ptBR })}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs sm:text-base">Selecione o dia</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 rounded-2xl border-none shadow-2xl" align="start">
                        <Calendar
                          initialFocus
                          mode="single"
                          numberOfMonths={1}
                          selected={referenceDate}
                          onSelect={setReferenceDate}
                          locale={ptBR}
                          className="rounded-2xl border-none p-4"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Grid de campos numéricos */}
                  <div className="grid grid-cols-2 md:grid-cols-2 gap-x-2 sm:gap-x-6 gap-y-3 sm:gap-y-6">
                    <div className="space-y-1 sm:space-y-2">
                      <label className="text-xs sm:text-sm font-medium text-slate-700 ml-1">Leads</label>
                      <p className="text-[10px] sm:text-xs text-slate-500 ml-1 -mt-0.5 sm:-mt-1 hidden sm:block">Total de contatos que demonstraram interesse</p>
                      <Input
                        type="number"
                        min="0"
                        value={formState.leads}
                        onChange={(e) => handleChange('leads', e.target.value)}
                        className="h-10 sm:h-12 bg-slate-50 border-slate-200 rounded-lg sm:rounded-xl text-slate-800 font-semibold px-3 sm:px-4 focus:bg-white focus:border-blue-300 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.1)] transition-all text-sm sm:text-base shadow-[0_1px_3px_rgba(0,0,0,0.05)] placeholder:text-slate-400 placeholder:font-normal placeholder:text-xs"
                        placeholder="Ex: 25"
                      />
                    </div>
                    <div className="space-y-1 sm:space-y-2">
                      <label className="text-xs sm:text-sm font-medium text-slate-700 ml-1">{funnelStep2Name || 'Visitas Agendadas'}</label>
                      <p className="text-[10px] sm:text-xs text-slate-500 ml-1 -mt-0.5 sm:-mt-1 hidden sm:block">Contatos que agendaram uma visita ou reunião</p>
                      <Input
                        type="number"
                        min="0"
                        value={formState.visitas_agendadas}
                        onChange={(e) => handleChange('visitas_agendadas', e.target.value)}
                        className="h-10 sm:h-12 bg-slate-50 border-slate-200 rounded-lg sm:rounded-xl text-slate-800 font-semibold px-3 sm:px-4 focus:bg-white focus:border-blue-300 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.1)] transition-all text-sm sm:text-base shadow-[0_1px_3px_rgba(0,0,0,0.05)] placeholder:text-slate-400 placeholder:font-normal placeholder:text-xs"
                        placeholder="Ex: 10"
                      />
                    </div>
                    <div className="space-y-1 sm:space-y-2">
                      <label className="text-xs sm:text-sm font-medium text-slate-700 ml-1">{funnelStep3Name || 'Visitas Realizadas'}</label>
                      <p className="text-[10px] sm:text-xs text-slate-500 ml-1 -mt-0.5 sm:-mt-1 hidden sm:block">Visitas ou reuniões que foram efetivamente realizadas</p>
                      <Input
                        type="number"
                        min="0"
                        value={formState.visitas_realizadas}
                        onChange={(e) => handleChange('visitas_realizadas', e.target.value)}
                        className="h-10 sm:h-12 bg-slate-50 border-slate-200 rounded-lg sm:rounded-xl text-slate-800 font-semibold px-3 sm:px-4 focus:bg-white focus:border-blue-300 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.1)] transition-all text-sm sm:text-base shadow-[0_1px_3px_rgba(0,0,0,0.05)] placeholder:text-slate-400 placeholder:font-normal placeholder:text-xs"
                        placeholder="Ex: 8"
                      />
                    </div>
                    <div className="space-y-1 sm:space-y-2">
                      <label className="text-xs sm:text-sm font-medium text-slate-700 ml-1">Vendas</label>
                      <p className="text-[10px] sm:text-xs text-slate-500 ml-1 -mt-0.5 sm:-mt-1 hidden sm:block">Total de vendas efetivamente concluídas</p>
                      <Input
                        type="number"
                        min="0"
                        value={formState.vendas}
                        onChange={(e) => handleChange('vendas', e.target.value)}
                        className="h-10 sm:h-12 bg-slate-50 border-slate-200 rounded-lg sm:rounded-xl text-slate-800 font-semibold px-3 sm:px-4 focus:bg-white focus:border-blue-300 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.1)] transition-all text-sm sm:text-base shadow-[0_1px_3px_rgba(0,0,0,0.05)] placeholder:text-slate-400 placeholder:font-normal placeholder:text-xs"
                        placeholder="Ex: 3"
                      />
                    </div>
                  </div>

                  {/* Faturamento */}
                  <div className="space-y-1.5 sm:space-y-2 pt-0.5 sm:pt-1">
                    <label className="text-xs sm:text-sm font-medium text-slate-700 ml-1">Faturamento Total (R$)</label>
                    <p className="text-[10px] sm:text-xs text-slate-500 ml-1 -mt-0.5 sm:-mt-1 hidden sm:block">Valor total faturado no dia (receita bruta)</p>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={formState.faturamento}
                      onChange={(e) => handleChange('faturamento', e.target.value)}
                      className="h-10 sm:h-12 bg-slate-50 border-slate-200 rounded-lg sm:rounded-xl font-semibold text-sm sm:text-lg text-slate-800 px-3 sm:px-4 focus:bg-white focus:border-blue-300 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.1)] transition-all shadow-[0_1px_3px_rgba(0,0,0,0.05)] placeholder:text-slate-400 placeholder:font-normal placeholder:text-xs sm:placeholder:text-sm"
                      placeholder="Ex: 15.000,00"
                    />
                  </div>

                  {/* Observações */}
                  <div className="space-y-1.5 sm:space-y-2">
                    <label className="text-xs sm:text-sm font-medium text-slate-700 ml-1">Observações</label>
                    <Textarea
                      rows={2}
                      value={formState.observacoes}
                      onChange={(e) => handleChange('observacoes', e.target.value)}
                      className="bg-slate-50 border-slate-200 rounded-lg sm:rounded-xl resize-none p-3 sm:p-4 text-slate-700 font-medium focus:bg-white focus:border-blue-300 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.1)] transition-all text-xs sm:text-base shadow-[0_1px_3px_rgba(0,0,0,0.05)] placeholder:text-slate-400 placeholder:font-normal placeholder:text-xs"
                      placeholder="Adicione observações relevantes sobre este dia (opcional)..."
                    />
                  </div>

                  {/* Botão Registrar/Atualizar */}
                  <div className="pt-2 sm:pt-4">
                    <Button
                      onClick={handleRegister}
                      disabled={!isFormValid || saving}
                      className="w-full h-10 sm:h-12 text-xs sm:text-base font-bold bg-gradient-to-r from-emerald-400 to-teal-300 hover:from-emerald-500 hover:to-teal-400 text-white rounded-lg sm:rounded-xl shadow-lg shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-50 tracking-tight"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 mr-2 sm:mr-3 animate-spin" />
                          <span className="text-xs sm:text-base">{editandoId ? 'Atualizando...' : 'Registrando...'}</span>
                        </>
                      ) : editandoId ? (
                        'Atualizar Lançamento'
                      ) : (
                        'Registrar'
                      )}
                    </Button>
                    {editandoId && (
                      <Button
                        onClick={() => {
                          setEditandoId(null);
                          setReferenceDate(null);
                          setFormState({
                            leads: '',
                            visitas_agendadas: '',
                            visitas_realizadas: '',
                            vendas: '',
                            faturamento: '',
                            observacoes: '',
                          });
                        }}
                        variant="ghost"
                        className="w-full h-9 sm:h-10 text-slate-400 font-bold mt-2 hover:bg-slate-50 rounded-lg sm:rounded-xl transition-colors text-xs sm:text-sm"
                      >
                        Cancelar Edição
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Card Direito - Histórico */}
            <div className="lg:col-span-5 h-full hidden lg:block">
              <Card className="bg-white border-none shadow-sm sm:shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-xl sm:rounded-[1.5rem] flex flex-col h-full overflow-hidden min-h-[400px] sm:min-h-[500px]">
                <CardHeader className="p-5 sm:p-8 pb-4">
                  <CardTitle className="text-xl sm:text-2xl font-bold text-[#1e293b] tracking-tight">Histórico Recente</CardTitle>
                  <CardDescription className="text-sm sm:text-base text-slate-400 mt-1 font-medium">
                    Últimos 4 dias cadastrados.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 sm:p-8 pt-0 flex-1 flex flex-col min-h-0">
                  <ScrollArea className="h-full pr-2">
                    {historico.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
                        <div className="relative">
                          <div className="absolute inset-0 bg-blue-500/5 blur-3xl rounded-full scale-125" />
                          <div className="bg-white p-10 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] relative z-10 border border-slate-100">
                            <img src="/placeholder-illustration.svg" alt="Sem dados" className="h-44 w-44 opacity-90" />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <p className="text-lg font-bold text-slate-600">Nenhum dia cadastrado ainda.</p>
                          <p className="text-sm text-slate-400 font-medium max-w-xs">
                            Comece preenchendo os dados do dia no formulário ao lado.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3 pt-2">
                        {historico.map((dia) => (
                          <div
                            key={dia.id}
                            className="p-6 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 border-2 border-emerald-200 hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer group relative overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
                            onClick={() => handleEditar(dia)}
                          >
                            <div className="flex items-center justify-between mb-4 relative z-10">
                              <div>
                                <p className="text-base font-bold text-[#1e293b]">
                                  {format(parseLocalDateFromDb(dia.data_referencia), 'dd/MM/yyyy', { locale: ptBR })}
                                </p>
                                <p className="text-xs text-slate-400 mt-0.5 font-medium">
                                  {format(parseLocalDateFromDb(dia.data_referencia), "EEEE", { locale: ptBR })}
                                </p>
                              </div>
                              <div className="h-9 w-9 rounded-lg bg-emerald-100 flex items-center justify-center shadow-sm group-hover:bg-emerald-200 group-hover:scale-105 transition-all">
                                <Edit className="h-4 w-4 text-emerald-600" />
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-5 relative z-10 mb-4">
                              <div className="space-y-1">
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Leads</p>
                                <p className="text-2xl font-bold text-slate-900 tracking-tight leading-none">{dia.leads ?? 0}</p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Vendas</p>
                                <p className="text-2xl font-bold text-slate-900 tracking-tight leading-none">{dia.vendas ?? 0}</p>
                              </div>
                            </div>
                            
                            <div className="pt-4 border-t border-emerald-100 flex items-center justify-between relative z-10">
                              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Faturamento</span>
                              <span className="text-lg font-bold text-emerald-600 tracking-tight leading-none">{formatCurrency(dia.faturamento || 0)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      <Dialog open={showLista} onOpenChange={setShowLista}>
        <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">Todos os Lançamentos</DialogTitle>
            <DialogDescription>
              Visualize, edite ou exclua seus lançamentos diários
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            {loadingLista ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : todosLancamentos.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">
                Nenhum lançamento encontrado.
              </p>
            ) : (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Leads</TableHead>
                      <TableHead>{funnelStep2Name}</TableHead>
                      <TableHead>{funnelStep3Name}</TableHead>
                      <TableHead>Vendas</TableHead>
                      <TableHead>Faturamento</TableHead>
                      <TableHead>Cadastrado por</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {todosLancamentos.map((lancamento) => {
                      return (
                        <TableRow key={lancamento.id}>
                          <TableCell className="font-medium">
                            {format(parseLocalDateFromDb(lancamento.data_referencia), 'dd/MM/yyyy', { locale: ptBR })}
                          </TableCell>
                          <TableCell>{lancamento.leads?.toLocaleString('pt-BR') || 0}</TableCell>
                          <TableCell>{lancamento.visitas_agendadas?.toLocaleString('pt-BR') || 0}</TableCell>
                          <TableCell>{lancamento.visitas_realizadas?.toLocaleString('pt-BR') || 0}</TableCell>
                          <TableCell>{lancamento.vendas?.toLocaleString('pt-BR') || 0}</TableCell>
                          <TableCell>{formatCurrency(lancamento.faturamento || 0)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {lancamento.created_by_profile?.full_name || 'N/A'}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditar(lancamento)}
                                className="h-8 w-8 p-0"
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

export default ClientCadastroSemanal;
