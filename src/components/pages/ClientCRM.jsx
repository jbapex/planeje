import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, LayoutGrid, List, Settings, BarChart3, PlusCircle, Filter, Search, Link2, Radio, Inbox, MessageSquare, Bot, Users, Star, Bell, RefreshCw, HelpCircle, User, ChevronDown, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

import { ClienteCrmSettingsProvider } from '@/contexts/ClienteCrmSettingsContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useLeads } from '@/hooks/useLeads';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useClienteCrmSettings } from '@/contexts/ClienteCrmSettingsContext';
import { useCrmRefresh } from '@/contexts/CrmRefreshContext';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon } from 'lucide-react';

import LeadsHeader from '@/components/leads/LeadsHeader';
import LeadsTable from '@/components/leads/LeadsTable';
import LeadCard from '@/components/leads/LeadCard';
import KanbanBoard from '@/components/leads/KanbanBoard';
import DuplicateLeadDialog from '@/components/leads/DuplicateLeadDialog';

import AddLeadModal from '@/components/crm/AddLeadModal';
import EditLeadModal from '@/components/crm/EditLeadModal';
import ImportLeadsModal from '@/components/crm/ImportLeadsModal';
import ImportFacebookLeadsModal from '@/components/crm/ImportFacebookLeadsModal';
import CrmSettingsFunil from '@/components/crm/CrmSettingsFunil';
import CrmSettingsUsuarios from '@/components/crm/CrmSettingsUsuarios';
import CrmVisaoGeral from '@/components/crm/CrmVisaoGeral';
import CrmRelatorioMeta from '@/components/crm/CrmRelatorioMeta';
import MoveToStageModal from '@/components/crm/MoveToStageModal';
import PipelineEditor from '@/components/crm/PipelineEditor';
import { useCrmPipeline } from '@/hooks/useCrmPipeline';
import { useClientMembers } from '@/hooks/useClientMembers';
import ClienteApiPage from '@/components/pages/ClienteApiPage';
import ClienteCanaisPage from '@/components/pages/ClienteCanaisPage';
import ApicebotIntegracaoPage from '@/components/pages/ApicebotIntegracaoPage';
import CaixaEntradaPage from '@/components/pages/CaixaEntradaPage';
import CrmWhatsAppPage from '@/components/pages/CrmWhatsAppPage';
import ContatosPage from '@/components/pages/ContatosPage';
import AutomacoesPage from '@/components/pages/AutomacoesPage';

const ClientCRMWrapper = () => {
  const { profile } = useAuth();
  const isClientView = profile?.role === 'cliente' && profile?.cliente_id;

  if (!isClientView && profile?.role !== 'superadmin' && profile?.role !== 'admin' && profile?.role !== 'colaborador') {
    return (
      <div className="flex items-center justify-center min-h-[200px] text-muted-foreground">
        Você não tem acesso ao CRM.
      </div>
    );
  }

  return (
    <ClienteCrmSettingsProvider>
      <ClientCRMContent />
    </ClienteCrmSettingsProvider>
  );
};

const CRM_TAB_LEADS = 'leads';
const CRM_TAB_VISAO_GERAL = 'visao-geral';
const CRM_TAB_AJUSTES_FUNIL = 'ajustes-funil';
const CRM_TAB_AJUSTES_USUARIOS = 'ajustes-usuarios';
const CRM_TAB_API = 'api';
const CRM_TAB_CANAIS = 'canais';
const CRM_TAB_CAIXA_ENTRADA = 'caixa-entrada';
const CRM_TAB_WHATSAPP = 'whatsapp';
const CRM_TAB_APICEBOT = 'apicebot';
const CRM_TAB_CONTATOS = 'contatos';
const CRM_TAB_RELATORIO_META = 'relatorio-meta';
const CRM_TAB_AUTOMACOES = 'automacoes';

const CRM_TABS_BY_PATH = {
  [CRM_TAB_LEADS]: true,
  [CRM_TAB_VISAO_GERAL]: true,
  [CRM_TAB_CONTATOS]: true,
  [CRM_TAB_RELATORIO_META]: true,
  [CRM_TAB_CANAIS]: true,
  [CRM_TAB_AJUSTES_FUNIL]: true,
  [CRM_TAB_AJUSTES_USUARIOS]: true,
  [CRM_TAB_API]: true,
  [CRM_TAB_APICEBOT]: true,
  [CRM_TAB_AUTOMACOES]: true,
  [CRM_TAB_CAIXA_ENTRADA]: true,
  [CRM_TAB_WHATSAPP]: true,
};

// Ocultar por hora: Caixa de entrada e WhatsApp (abas e conteúdo)
const HIDE_INBOX_AND_WHATSAPP_TABS = true;

const ClientCRMContent = () => {
  const { tab: tabParam } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();
  const { setRefreshFn } = useCrmRefresh() || {};
  const basePath = location.pathname.startsWith('/client-area') ? '/client-area' : location.pathname.startsWith('/crm') ? '/crm' : '/cliente';

  const isAdminWithoutCliente = profile?.role && ['superadmin', 'admin', 'colaborador'].includes(profile.role) && !profile?.cliente_id;

  const resolvedTab = CRM_TABS_BY_PATH[tabParam] ? tabParam : (isAdminWithoutCliente ? CRM_TAB_CONTATOS : CRM_TAB_LEADS);
  const [activeTab, setActiveTab] = useState(resolvedTab);

  useEffect(() => {
    if (tabParam && CRM_TABS_BY_PATH[tabParam] && tabParam !== activeTab) setActiveTab(tabParam);
  }, [tabParam]);

  // Administrador: só Contatos; redirecionar qualquer outra aba para contatos
  const crmPath = (tab) => (basePath === '/crm' ? `${basePath}/${tab}` : `${basePath}/crm/${tab}`);

  useEffect(() => {
    if (isAdminWithoutCliente && tabParam !== CRM_TAB_CONTATOS) {
      navigate(crmPath(CRM_TAB_CONTATOS), { replace: true });
    }
  }, [isAdminWithoutCliente, tabParam, navigate, basePath]);

  const setActiveTabAndNavigate = useCallback(
    (value) => {
      setActiveTab(value);
      navigate(crmPath(value), { replace: true });
    },
    [navigate, basePath]
  );
  const leadsHook = useLeads();
  const {
    filteredLeads: leads,
    loading,
    filters,
    setFilters,
    searchTerm,
    setSearchTerm,
    handleUpdateLead: onUpdateLead,
    handleDeleteLead: onDeleteLead,
    handleBulkDeleteLeads: onBulkDelete,
    exportData: onExport,
    getStatusIcon,
    getStatusText,
    handleAddLead: onAddLead,
    updateExistingLead,
    refetchLeads,
    loadMoreLeads,
    hasMore,
    stages,
    moveLeadToStage,
    pipelines,
    currentPipelineId,
    setCurrentPipelineId,
    refetchPipeline,
  } = leadsHook;
  useEffect(() => {
    if (setRefreshFn) setRefreshFn(() => refetchLeads);
  }, [setRefreshFn, refetchLeads]);

  const {
    createPipeline,
    updatePipeline,
    createStage,
    updateStage,
    reorderStages,
    deleteStage,
    refetch: refetchPipelines,
  } = useCrmPipeline();

  const { settings } = useClienteCrmSettings();
  const [showNewPipelineEditor, setShowNewPipelineEditor] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedLeads, setSelectedLeads] = useState([]);

  const [editingLead, setEditingLead] = useState(null);
  const [viewMode, setViewMode] = useState('kanban');
  const [showAddLead, setShowAddLead] = useState(false);
  const [showImportLeads, setShowImportLeads] = useState(false);
  const [showImportFacebookLeads, setShowImportFacebookLeads] = useState(false);
  const handleShowLeadDetail = useCallback((lead) => {
    navigate(`${crmPath('leads')}/${lead.id}`);
  }, [navigate, crmPath]);
  const [duplicateLeadInfo, setDuplicateLeadInfo] = useState(null);
  const [moveModal, setMoveModal] = useState(null);
  const [whatsAppInitialJid, setWhatsAppInitialJid] = useState(null);
  const { members: clientMembers } = useClientMembers();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const lastLeadElementRef = useRef(null);

  useEffect(() => {
    if (isMobile) setViewMode('list');
  }, [isMobile]);

  useEffect(() => {
    setSelectedLeads([]);
  }, [leads, filters, searchTerm, viewMode]);

  // Visão do administrador: apenas Contatos e filtros por cliente (sem abas do CRM)
  if (isAdminWithoutCliente) {
    return (
      <>
        <Helmet>
          <title>Contatos - JB APEX</title>
          <meta name="description" content="Contatos por cliente." />
        </Helmet>
        <div className="flex flex-col flex-1 min-h-0 bg-slate-50/60 dark:bg-slate-950/30">
          <header className="shrink-0 border-b border-slate-200/80 dark:border-slate-800 bg-white dark:bg-card shadow-sm">
            <div className="w-full px-3 sm:px-4 lg:px-5 py-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-sm">
                    <Users className="h-6 w-6" />
                  </div>
                  <div>
                    <h1 className="text-xl font-semibold text-foreground tracking-tight">Contatos</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Visualize e filtre contatos por cliente</p>
                  </div>
                </div>
              </div>
            </div>
          </header>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="w-full px-3 sm:px-4 lg:px-5 py-6">
              <ContatosPage embeddedInCrm />
            </div>
          </div>
        </div>
      </>
    );
  }

  const handleAddLeadWithDuplicateCheck = async (leadData) => {
    const result = await onAddLead(leadData);
    if (result?.duplicate) {
      setDuplicateLeadInfo({
        existingLead: result.existingLead,
        newLeadData: leadData,
      });
    }
    return result;
  };

  const confirmUpdateDuplicate = () => {
    if (duplicateLeadInfo) {
      updateExistingLead(duplicateLeadInfo.existingLead, duplicateLeadInfo.newLeadData);
      setDuplicateLeadInfo(null);
      setShowAddLead(false);
    }
  };

  const cancelUpdateDuplicate = () => {
    setDuplicateLeadInfo(null);
  };

  const handleSaveAddLead = async (leadData) => {
    const result = await handleAddLeadWithDuplicateCheck(leadData);
    if (result && !result.duplicate) setShowAddLead(false);
  };

  const handleBulkDelete = () => {
    onBulkDelete(selectedLeads);
    setSelectedLeads([]);
  };

  const renderNoLeads = () => (
    <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
      <p className="text-lg font-medium">Nenhum lead encontrado</p>
      <p className="text-sm mt-1">Parece que não há leads com os filtros aplicados.</p>
    </div>
  );

  const renderContent = () => {
    if (loading && leads.length === 0) {
      return (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (viewMode === 'kanban' && !isMobile) {
      return (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <KanbanBoard
            leads={leads}
            onUpdateLead={onUpdateLead}
            onShowLeadDetail={handleShowLeadDetail}
            stages={stages}
            moveLeadToStage={moveLeadToStage}
            onRequestMoveWithModal={(lead, targetStage) => setMoveModal({ lead, targetStage })}
          />
        </div>
      );
    }

    if (leads.length === 0 && !loading) return renderNoLeads();

    if (isMobile) {
      return (
        <div className="space-y-4 p-4">
          <AnimatePresence mode="popLayout">
            {leads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                selected={selectedLeads.includes(lead.id)}
                onSelect={(leadId, checked) => {
                  if (checked) setSelectedLeads((p) => [...p, leadId]);
                  else setSelectedLeads((p) => p.filter((id) => id !== leadId));
                }}
                onEdit={setEditingLead}
                onDelete={onDeleteLead}
                onShowDetail={handleShowLeadDetail}
                getStatusIcon={getStatusIcon}
                getStatusText={getStatusText}
                onUpdateLead={onUpdateLead}
                stages={stages}
                moveLeadToStage={moveLeadToStage}
              />
            ))}
          </AnimatePresence>
        </div>
      );
    }

    return (
      <>
        {loading && leads.length > 0 && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Carregando mais leads...</span>
          </div>
        )}
        <LeadsTable
          leads={leads}
          selectedLeads={selectedLeads}
          setSelectedLeads={setSelectedLeads}
          onUpdateLead={onUpdateLead}
          onDeleteLead={onDeleteLead}
          getStatusIcon={getStatusIcon}
          getStatusText={getStatusText}
          onShowLeadDetail={handleShowLeadDetail}
          onEdit={setEditingLead}
          lastLeadElementRef={lastLeadElementRef}
          stages={stages}
          moveLeadToStage={moveLeadToStage}
        />
      </>
    );
  };

  return (
    <>
      <Helmet>
        <title>CRM - JB APEX</title>
        <meta name="description" content="CRM - Leads, visão geral e configurações." />
      </Helmet>

      <div className="flex flex-col flex-1 min-h-0 w-full">
        <Tabs value={activeTab} onValueChange={setActiveTabAndNavigate} className="flex flex-col flex-1 min-h-0 w-full">
          <div className="flex-1 min-h-0 flex flex-col px-2 sm:px-3 md:px-4">
          <TabsContent value={CRM_TAB_LEADS} className="mt-4 flex flex-col flex-1 min-h-0 overflow-y-auto data-[state=inactive]:hidden">
            <div data-leads-toolbar className="flex flex-col sm:flex-row flex-wrap sm:flex-nowrap items-stretch sm:items-center gap-3 mb-0 py-3 -mx-3 sm:-mx-4 md:-mx-8 px-3 sm:px-4 md:px-8 rounded-none bg-slate-100 dark:bg-slate-800/60">
              {/* Grupo 1: Funil + contexto */}
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0 shrink-0">
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Funil de vendas
                  </span>
                  <Select
                    value={currentPipelineId || ''}
                    onValueChange={(v) => {
                      if (v === '__new__') {
                        setShowNewPipelineEditor(true);
                      } else {
                        setCurrentPipelineId(v || null);
                      }
                    }}
                  >
                    <SelectTrigger className="w-[200px] sm:w-[240px] h-9 font-medium bg-background">
                      <SelectValue placeholder="Selecione o funil" />
                    </SelectTrigger>
                    <SelectContent>
                      {pipelines.map((pip) => (
                        <SelectItem key={pip.id} value={pip.id}>
                          {(pip.nome || 'Sem nome').replace(/_/g, ' ')}
                        </SelectItem>
                      ))}
                      <SelectItem value="__new__" className="text-primary font-medium border-t mt-1 pt-2">
                        + Adicionar novo funil
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <span className="hidden sm:inline text-xs text-muted-foreground/80 border-l border-slate-300 dark:border-slate-600 pl-2 sm:pl-3">
                  Leads ativos
                </span>
              </div>

              {/* Grupo 2: Busca e filtros */}
              <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1 sm:min-w-[200px] sm:max-w-md">
                <Input
                  placeholder="Buscar por nome, WhatsApp ou email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      refetchLeads();
                    }
                  }}
                  className="h-9 text-xs flex-1 min-w-[140px]"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-9 shrink-0"
                  onClick={() => refetchLeads()}
                  title="Buscar"
                >
                  <Search className="h-3.5 w-3.5 sm:mr-1.5" />
                  <span className="hidden sm:inline">Buscar</span>
                </Button>
                <Dialog open={filterOpen} onOpenChange={setFilterOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" title="Filtros">
                      <Filter className="h-3.5 w-3.5" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Filtros</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div>
                        <label className="text-sm font-medium">Período</label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className="w-full justify-start text-left font-normal h-10"
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {filters.dateRange?.from
                                ? filters.dateRange.to
                                  ? `${format(filters.dateRange.from, 'dd/MM/yy', { locale: ptBR })} – ${format(filters.dateRange.to, 'dd/MM/yy', { locale: ptBR })}`
                                  : format(filters.dateRange.from, 'dd/MM/yy', { locale: ptBR })
                                : 'Escolher período'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="range"
                              locale={ptBR}
                              defaultMonth={filters.dateRange?.from || new Date()}
                              selected={{
                                from: filters.dateRange?.from,
                                to: filters.dateRange?.to,
                              }}
                              onSelect={(range) =>
                                setFilters((p) => ({
                                  ...p,
                                  month: 'all',
                                  dateRange: range?.from ? { from: range.from, to: range.to || range.from } : undefined,
                                }))
                              }
                              numberOfMonths={2}
                            />
                            {filters.dateRange?.from && (
                              <div className="p-2 border-t">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="w-full text-xs"
                                  onClick={() =>
                                    setFilters((p) => ({ ...p, month: 'all', dateRange: undefined }))
                                  }
                                >
                                  Limpar período
                                </Button>
                              </div>
                            )}
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div>
                        <label className="text-sm font-medium">{stages?.length ? 'Etapa do funil' : 'Status'}</label>
                        <Select value={filters.status} onValueChange={(v) => setFilters((p) => ({ ...p, status: v }))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="todos">Todos</SelectItem>
                            {stages?.length
                              ? stages.map((s) => (
                                  <SelectItem key={s.id} value={s.nome}>
                                    {(s.nome || '').replace(/_/g, ' ')}
                                  </SelectItem>
                                ))
                              : (settings?.statuses || []).map((s) => (
                                  <SelectItem key={s.name} value={s.name}>
                                    {(s.name || '').replace(/_/g, ' ')}
                                  </SelectItem>
                                ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-sm font-medium">Vendedor</label>
                        <Select value={filters.vendedor} onValueChange={(v) => setFilters((p) => ({ ...p, vendedor: v }))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="todos">Todos</SelectItem>
                            {(settings?.sellers || []).map((seller) => (
                              <SelectItem key={seller} value={seller}>
                                {seller}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-sm font-medium">Origem</label>
                        <Select value={filters.origem ?? 'todos'} onValueChange={(v) => setFilters((p) => ({ ...p, origem: v }))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="todos">Todas</SelectItem>
                            <SelectItem value="Meta Ads">Meta Ads</SelectItem>
                            {(settings?.origins || [])
                              .filter((o) => o && String(o).toLowerCase() !== 'meta ads')
                              .map((orig) => (
                                <SelectItem key={orig} value={orig}>
                                  {orig}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button onClick={() => setFilterOpen(false)}>Aplicar</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              {/* Grupo 3: Filtros, Lista, Kanban e Novo — no canto direito, próximo à borda */}
              <div className="flex items-center gap-2 shrink-0 ml-auto border-t border-slate-200 dark:border-slate-700 pt-3 sm:pt-0 sm:border-t-0 sm:border-l sm:border-slate-200 dark:border-slate-700 pl-0 sm:pl-3">
                <span className="text-xs text-muted-foreground mr-1 hidden md:inline">Exibir:</span>
                <div className="flex rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <Button variant="outline" size="sm" className={`h-9 rounded-none border-0 px-2.5 gap-1.5 ${viewMode === 'list' ? 'bg-muted' : ''}`} onClick={() => setViewMode('list')} title="Lista">
                    <List className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-xs font-medium">Lista</span>
                  </Button>
                  <Button variant="outline" size="sm" className={`h-9 rounded-none border-0 border-l border-slate-200 dark:border-slate-700 px-2.5 gap-1.5 ${viewMode === 'kanban' ? 'bg-muted' : ''}`} onClick={() => setViewMode('kanban')} title="Kanban">
                    <LayoutGrid className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-xs font-medium">Kanban</span>
                  </Button>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 text-sm rounded-lg shrink-0">
                      Importar
                      <ChevronDown className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setShowImportLeads(true)}>
                      Importar CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setShowImportFacebookLeads(true)}>
                      Importar leads do Facebook
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button size="sm" className="h-9 text-sm rounded-lg bg-violet-600 hover:bg-violet-700 text-white shrink-0" onClick={() => setShowAddLead(true)}>
                  <PlusCircle className="h-4 w-4 mr-1.5" />
                  Novo
                </Button>
              </div>
            </div>

            <PipelineEditor
              open={showNewPipelineEditor}
              onOpenChange={setShowNewPipelineEditor}
              pipeline={null}
              onSaved={() => {
                refetchPipeline();
                setShowNewPipelineEditor(false);
              }}
              createPipeline={createPipeline}
              updatePipeline={updatePipeline}
              createStage={createStage}
              updateStage={updateStage}
              reorderStages={reorderStages}
              deleteStage={deleteStage}
              refetch={refetchPipelines}
            />
            <div className="flex flex-1 flex-col min-h-[calc(100vh-13rem)]">
              <div className="flex flex-1 flex-col min-h-0 gap-0 pt-0">
                <LeadsHeader
                  selectedLeads={selectedLeads}
                  onBulkDelete={handleBulkDelete}
                  viewMode={viewMode}
                />
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                  {renderContent()}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value={CRM_TAB_VISAO_GERAL} className="mt-4 flex flex-col flex-1 min-h-0 overflow-y-auto data-[state=inactive]:hidden">
            <CrmVisaoGeral
              metrics={leadsHook.metrics}
              loading={loading}
              filters={filters}
              setFilters={setFilters}
              refetchLeads={refetchLeads}
            />
          </TabsContent>

          <TabsContent value={CRM_TAB_RELATORIO_META} className="mt-4 flex flex-col flex-1 min-h-0 overflow-y-auto data-[state=inactive]:hidden">
            <CrmRelatorioMeta onShowLeadDetail={handleShowLeadDetail} />
          </TabsContent>

          <TabsContent value={CRM_TAB_AJUSTES_FUNIL} className="mt-4 flex flex-col flex-1 min-h-0 overflow-y-auto data-[state=inactive]:hidden">
            <CrmSettingsFunil />
          </TabsContent>
          <TabsContent value={CRM_TAB_AJUSTES_USUARIOS} className="mt-4 flex flex-col flex-1 min-h-0 overflow-y-auto data-[state=inactive]:hidden">
            <CrmSettingsUsuarios />
          </TabsContent>
          <TabsContent value={CRM_TAB_API} className="mt-4 flex flex-col flex-1 min-h-0 overflow-y-auto data-[state=inactive]:hidden">
            <ClienteApiPage onGoToCanais={() => setActiveTabAndNavigate(CRM_TAB_CANAIS)} embeddedInCrm />
          </TabsContent>
          <TabsContent value={CRM_TAB_CANAIS} className="mt-4 flex flex-col flex-1 min-h-0 overflow-y-auto data-[state=inactive]:hidden">
            <ClienteCanaisPage onGoToApi={() => setActiveTabAndNavigate(CRM_TAB_API)} embeddedInCrm />
          </TabsContent>
          <TabsContent value={CRM_TAB_APICEBOT} className="mt-4 flex flex-col flex-1 min-h-0 overflow-y-auto data-[state=inactive]:hidden">
            <ApicebotIntegracaoPage embeddedInCrm />
          </TabsContent>
          <TabsContent value={CRM_TAB_AUTOMACOES} className="mt-4 flex flex-col flex-1 min-h-0 overflow-y-auto data-[state=inactive]:hidden">
            <AutomacoesPage />
          </TabsContent>
          {!HIDE_INBOX_AND_WHATSAPP_TABS && (
            <>
              <TabsContent value={CRM_TAB_CAIXA_ENTRADA} className="mt-4 flex flex-col flex-1 min-h-0 overflow-y-auto data-[state=inactive]:hidden">
                <CaixaEntradaPage embeddedInCrm />
              </TabsContent>
              <TabsContent value={CRM_TAB_WHATSAPP} className="mt-4 flex flex-col flex-1 min-h-0 overflow-y-auto data-[state=inactive]:hidden">
                <CrmWhatsAppPage embeddedInCrm initialFromJid={whatsAppInitialJid} onInitialChatSelected={() => setWhatsAppInitialJid(null)} />
              </TabsContent>
            </>
          )}
          <TabsContent value={CRM_TAB_CONTATOS} className="mt-4 flex flex-col flex-1 min-h-0 overflow-y-auto data-[state=inactive]:hidden">
            <ContatosPage embeddedInCrm onOpenConversation={HIDE_INBOX_AND_WHATSAPP_TABS ? undefined : (jid) => { setActiveTabAndNavigate(CRM_TAB_WHATSAPP); setWhatsAppInitialJid(jid); }} />
          </TabsContent>
          </div>
        </Tabs>
      </div>

      {showAddLead && (
        <AddLeadModal
          isOpen={showAddLead}
          onClose={() => setShowAddLead(false)}
          onSave={handleSaveAddLead}
          members={clientMembers}
        />
      )}

      {showImportLeads && (
        <ImportLeadsModal
          isOpen={showImportLeads}
          onClose={() => setShowImportLeads(false)}
          onImport={async (rows) => leadsHook.handleBulkAddLeads(rows)}
        />
      )}

      {showImportFacebookLeads && (
        <ImportFacebookLeadsModal
          isOpen={showImportFacebookLeads}
          onClose={() => setShowImportFacebookLeads(false)}
          effectiveClienteId={profile?.cliente_id}
          onImported={refetchLeads}
        />
      )}

      {editingLead && (
        <EditLeadModal
          lead={editingLead}
          isOpen={!!editingLead}
          onClose={() => setEditingLead(null)}
          members={clientMembers}
          onSave={(data) => {
            onUpdateLead(data.id, data);
            setEditingLead(null);
          }}
        />
      )}

      <DuplicateLeadDialog
        open={!!duplicateLeadInfo}
        onOpenChange={(open) => !open && cancelUpdateDuplicate()}
        existingLead={duplicateLeadInfo?.existingLead}
        newLeadData={duplicateLeadInfo?.newLeadData}
        onConfirm={confirmUpdateDuplicate}
        onCancel={cancelUpdateDuplicate}
      />

      <MoveToStageModal
        open={!!moveModal}
        onOpenChange={(open) => !open && setMoveModal(null)}
        lead={moveModal?.lead}
        targetStage={moveModal?.targetStage}
        onConfirm={async (motivo) => {
          if (!moveModal?.lead || !moveModal?.targetStage) return;
          await moveLeadToStage(moveModal.lead, moveModal.targetStage.id, { motivoGanhoPerdido: motivo });
          setMoveModal(null);
        }}
      />
    </>
  );
};

const ClientCRM = () => (
  <ClientCRMWrapper />
);

export default ClientCRM;
