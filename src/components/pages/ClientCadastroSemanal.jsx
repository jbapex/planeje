import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar as CalendarIcon, Loader2, FileText, List, Edit, Trash2, X } from 'lucide-react';

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

const ClientCadastroSemanal = () => {
  const { profile } = useAuth();
  const { toast } = useToast();

  const clienteId = profile?.cliente_id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [partnerName, setPartnerName] = useState('');
  const [referenceDate, setReferenceDate] = useState(null);
  const [formState, setFormState] = useState({
    leads: '',
    visitas_agendadas: '',
    visitas_realizadas: '',
    vendas: '',
    faturamento: '',
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
            .select('empresa')
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
        } else if (cliente?.empresa) {
          setPartnerName(cliente.empresa);
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

  // Buscar todos os lançamentos do cliente para a lista
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

  // Abrir modal de lista
  const handleAbrirLista = () => {
    setShowLista(true);
    carregarTodosLancamentos();
  };

  // Função para formatar número monetário para exibição (com vírgula)
  const formatMonetaryForInput = (value) => {
    if (!value && value !== 0) return '';
    const num = typeof value === 'number' ? value : parseFloat(value) || 0;
    return num.toFixed(2).replace('.', ',');
  };

  // Editar lançamento
  const handleEditar = (lancamento) => {
    setEditandoId(lancamento.id);
    setReferenceDate(new Date(lancamento.data_referencia));
    
    // Preencher formulário
    setFormState({
      leads: lancamento.leads?.toString() || '',
      visitas_agendadas: lancamento.visitas_agendadas?.toString() || '',
      visitas_realizadas: lancamento.visitas_realizadas?.toString() || '',
      vendas: lancamento.vendas?.toString() || '',
      faturamento: formatMonetaryForInput(lancamento.faturamento),
      investimento: formatMonetaryForInput(lancamento.investimento),
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
        
        // Recarregar listas
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

  // Função para formatar valor monetário durante a digitação
  const formatMonetaryInput = (value) => {
    // Remove tudo exceto números e vírgula
    let cleaned = value.replace(/[^\d,]/g, '');
    
    // Garante que há apenas uma vírgula
    const parts = cleaned.split(',');
    if (parts.length > 2) {
      cleaned = parts[0] + ',' + parts.slice(1).join('');
    }
    
    // Limita a 2 casas decimais após a vírgula
    if (parts.length === 2 && parts[1].length > 2) {
      cleaned = parts[0] + ',' + parts[1].substring(0, 2);
    }
    
    return cleaned;
  };

  const handleChange = (field, value) => {
    // Formatar campos monetários durante a digitação
    if (field === 'faturamento' || field === 'investimento') {
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
      // Se estiver editando, atualizar ao invés de inserir
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
            investimento:
              formState.investimento && formState.investimento !== ''
                ? parseFloat(
                    String(formState.investimento)
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

        // Limpar estado de edição
        setEditandoId(null);
        setReferenceDate(null);
        setFormState({
          leads: '',
          visitas_agendadas: '',
          visitas_realizadas: '',
          vendas: '',
          faturamento: '',
          investimento: '',
          observacoes: '',
        });

        // Recarregar histórico
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

        // Recarregar lista se estiver aberta
        if (showLista) {
          carregarTodosLancamentos();
        }

        setSaving(false);
        return;
      }

      // Se não estiver editando, inserir novo registro
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
        investimento:
          formState.investimento && formState.investimento !== ''
            ? parseFloat(
                String(formState.investimento)
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

      // Limpar formulário apenas se não estiver editando
      if (!editandoId) {
        setReferenceDate(null);
        setFormState({
          leads: '',
          visitas_agendadas: '',
          visitas_realizadas: '',
          vendas: '',
          faturamento: '',
          investimento: '',
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
        <title>Cadastro Diário - JB APEX</title>
      </Helmet>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Título da Página */}
          <header className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 dark:text-white flex items-center">
                <FileText className="mr-3 h-8 w-8" />
                Cadastro Diário
              </h1>
              <p className="text-muted-foreground dark:text-gray-400 mt-1">
                Preencha os dados referentes ao dia selecionado
              </p>
            </div>
            <Button
              onClick={handleAbrirLista}
              variant="outline"
              className="flex items-center gap-2"
            >
              <List className="h-4 w-4" />
              Ver Todos os Lançamentos
            </Button>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)] gap-6 items-start">
            {/* Card Esquerdo - Formulário */}
            <div className="relative rounded-lg p-[1px] bg-gradient-to-r from-orange-400/40 via-purple-500/40 to-orange-400/40 bg-[length:200%_100%] animate-gradient-shift h-fit">
              <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-orange-400/30 via-purple-500/30 to-orange-400/30 opacity-40 blur-sm animate-gradient-shift pointer-events-none"></div>
              <Card className="relative bg-card border-0 shadow-sm rounded-lg">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-semibold text-card-foreground">Cadastrar Dados Diários</CardTitle>
                <CardDescription className="text-sm text-muted-foreground mt-1">
                  Preencha os dados referentes ao dia selecionado.
                </CardDescription>
              </CardHeader>
            <CardContent className="space-y-5">
              {/* Parceiro */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Parceiro</label>
                <Input
                  value={partnerName}
                  disabled
                  className="h-10"
                />
              </div>

              {/* Data referência */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Data referência</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start h-10"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {referenceDate ? (
                        <span className="text-sm">
                          {format(referenceDate, 'dd/MM/yyyy', { locale: ptBR })}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Selecione o dia que deseja preencher</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      initialFocus
                      mode="single"
                      numberOfMonths={1}
                      selected={referenceDate}
                      onSelect={setReferenceDate}
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Grid de campos numéricos */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Leads</label>
                  <Input
                    type="number"
                    min="0"
                    value={formState.leads}
                    onChange={(e) => handleChange('leads', e.target.value)}
                    className="h-10"
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Visita Agendada</label>
                  <Input
                    type="number"
                    min="0"
                    value={formState.visitas_agendadas}
                    onChange={(e) => handleChange('visitas_agendadas', e.target.value)}
                    className="h-10"
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Visita Realizada</label>
                  <Input
                    type="number"
                    min="0"
                    value={formState.visitas_realizadas}
                    onChange={(e) => handleChange('visitas_realizadas', e.target.value)}
                    className="h-10"
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Vendas</label>
                  <Input
                    type="number"
                    min="0"
                    value={formState.vendas}
                    onChange={(e) => handleChange('vendas', e.target.value)}
                    className="h-10"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Faturamento e Investimento */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Faturamento (R$)</label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={formState.faturamento}
                    onChange={(e) => handleChange('faturamento', e.target.value)}
                    className="h-10"
                    placeholder="0,00"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Investimento em Ads (R$)</label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={formState.investimento}
                    onChange={(e) => handleChange('investimento', e.target.value)}
                    className="h-10"
                    placeholder="0,00"
                  />
                </div>
              </div>

              {/* Observações */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Observações</label>
                <Textarea
                  rows={3}
                  value={formState.observacoes}
                  onChange={(e) => handleChange('observacoes', e.target.value)}
                  className="resize-none"
                  placeholder="Adicione observações sobre este dia..."
                />
              </div>

              {/* Botão Registrar/Atualizar */}
              <div className="pt-2">
                <Button
                  onClick={handleRegister}
                  disabled={!isFormValid || saving}
                  className="w-full h-11 text-sm font-semibold bg-green-600 hover:bg-green-700 text-white"
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
                      setReferenceDate(null);
                      setFormState({
                        leads: '',
                        visitas_agendadas: '',
                        visitas_realizadas: '',
                        vendas: '',
                        faturamento: '',
                        investimento: '',
                        observacoes: '',
                      });
                    }}
                    variant="outline"
                    className="w-full h-11 text-sm font-semibold mt-2"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Cancelar Edição
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
          </div>

            {/* Card Direito - Histórico */}
            <Card className="bg-card border border-border shadow-sm flex flex-col h-full max-h-[calc(100vh-12rem)]">
            <CardHeader className="pb-4 flex-shrink-0">
              <CardTitle className="text-lg font-semibold text-card-foreground">Histórico Recente</CardTitle>
              <CardDescription className="text-sm text-muted-foreground mt-1">
                Últimos 4 dias cadastrados.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 p-0">
              <ScrollArea className="h-full px-6 pb-6">
                <div className="space-y-4 pr-4">
                  {historico.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum dia cadastrado ainda.</p>
                  ) : (
                    historico.map((dia) => (
                  <div
                    key={dia.id}
                    className="rounded-lg border border-border bg-muted/50 p-4 flex flex-col gap-3"
                  >
                    {/* Cabeçalho do card histórico */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 space-y-1">
                        <p className="text-sm font-medium text-card-foreground">
                          {format(new Date(dia.data_referencia), 'dd \'de\' MMMM \'de\' yyyy', { locale: ptBR })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Cadastrado por: {dia.created_by_profile?.full_name || profile?.full_name || 'Sistema'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Observações: {dia.observacoes || 'Não informado'}
                        </p>
                      </div>
                      <span className="inline-flex items-center rounded-full bg-gradient-to-r from-orange-400 to-purple-600 text-white px-2.5 py-0.5 text-xs font-medium">
                        Administrador
                      </span>
                    </div>

                    {/* Grid de métricas */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="rounded-lg bg-background border border-border p-3 flex flex-col">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">LEADS</span>
                        <span className="text-base font-semibold text-card-foreground">{dia.leads ?? 0}</span>
                      </div>
                      <div className="rounded-lg bg-background border border-border p-3 flex flex-col">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">VISITA AGENDADA</span>
                        <span className="text-base font-semibold text-card-foreground">{dia.visitas_agendadas ?? 0}</span>
                      </div>
                      <div className="rounded-lg bg-background border border-border p-3 flex flex-col">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">VISITA REALIZADA</span>
                        <span className="text-base font-semibold text-card-foreground">{dia.visitas_realizadas ?? 0}</span>
                      </div>
                      <div className="rounded-lg bg-background border border-border p-3 flex flex-col">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">VENDAS</span>
                        <span className="text-base font-semibold text-card-foreground">{dia.vendas ?? 0}</span>
                      </div>
                    </div>

                    {/* Faturamento e Investimento destacados */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-green-100 border-2 border-green-400 p-3">
                        <p className="text-xs font-semibold text-green-800 mb-1">Faturamento</p>
                        <p className="text-lg font-bold text-green-700">
                          {formatCurrency(dia.faturamento || 0)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-blue-100 border-2 border-blue-400 p-3">
                        <p className="text-xs font-semibold text-blue-800 mb-1">Investimento</p>
                        <p className="text-lg font-bold text-blue-700">
                          {formatCurrency(dia.investimento || 0)}
                        </p>
                      </div>
                    </div>
                  </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
          </div>
        </div>
      )}

      {/* Dialog de Lista de Lançamentos */}
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
                      <TableHead>Visitas Agendadas</TableHead>
                      <TableHead>Visitas Realizadas</TableHead>
                      <TableHead>Vendas</TableHead>
                      <TableHead>Faturamento</TableHead>
                      <TableHead>Investimento</TableHead>
                      <TableHead>Cadastrado por</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {todosLancamentos.map((lancamento) => {
                      return (
                        <TableRow key={lancamento.id}>
                          <TableCell className="font-medium">
                            {format(new Date(lancamento.data_referencia), 'dd/MM/yyyy', { locale: ptBR })}
                          </TableCell>
                          <TableCell>{lancamento.leads?.toLocaleString('pt-BR') || 0}</TableCell>
                          <TableCell>{lancamento.visitas_agendadas?.toLocaleString('pt-BR') || 0}</TableCell>
                          <TableCell>{lancamento.visitas_realizadas?.toLocaleString('pt-BR') || 0}</TableCell>
                          <TableCell>{lancamento.vendas?.toLocaleString('pt-BR') || 0}</TableCell>
                          <TableCell>{formatCurrency(lancamento.faturamento || 0)}</TableCell>
                          <TableCell>{formatCurrency(lancamento.investimento || 0)}</TableCell>
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

export default ClientCadastroSemanal;

