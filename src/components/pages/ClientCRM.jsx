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
import LeadDetailModal from '@/components/crm/LeadDetailModal';
import ImportLeadsModal from '@/components/crm/ImportLeadsModal';
import CrmSettingsFunil from '@/components/crm/CrmSettingsFunil';
import CrmSettingsUsuarios from '@/components/crm/CrmSettingsUsuarios';
import CrmVisaoGeral from '@/components/crm/CrmVisaoGeral';
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
const CRM_TAB_AUTOMACOES = 'automacoes';

const CRM_TABS_BY_PATH = {
  [CRM_TAB_LEADS]: true,
  [CRM_TAB_VISAO_GERAL]: true,
  [CRM_TAB_CONTATOS]: true,
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
  const basePath = location.pathname.startsWith('/client-area') ? '/client-area' : '/cliente';

  const isAdminWithoutCliente = profile?.role && ['superadmin', 'admin', 'colaborador'].includes(profile.role) && !profile?.cliente_id;

  const resolvedTab = CRM_TABS_BY_PATH[tabParam] ? tabParam : (isAdminWithoutCliente ? CRM_TAB_CONTATOS : CRM_TAB_LEADS);
  const [activeTab, setActiveTab] = useState(resolvedTab);

  useEffect(() => {
    if (tabParam && CRM_TABS_BY_PATH[tabParam] && tabParam !== activeTab) setActiveTab(tabParam);
  }, [tabParam]);

  // Administrador: só Contatos; redirecionar qualquer outra aba para contatos
  useEffect(() => {
    if (isAdminWithoutCliente && tabParam !== CRM_TAB_CONTATOS) {
      navigate(`${basePath}/crm/${CRM_TAB_CONTATOS}`, { replace: true });
    }
  }, [isAdminWithoutCliente, tabParam, navigate, basePath]);

  const setActiveTabAndNavigate = useCallback(
    (value) => {
      setActiveTab(value);
      navigate(`${basePath}/crm/${value}`, { replace: true });
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
  const [showLeadDetail, setShowLeadDetail] = useState(null);
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
            onShowLeadDetail={setShowLeadDetail}
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
                onShowDetail={setShowLeadDetail}
                getStatusIcon={getStatusIcon}
                getStatusText={getStatusText}
                onUpdateLead={onUpdateLead}
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
          onShowLeadDetail={setShowLeadDetail}
          onEdit={setEditingLead}
          lastLeadElementRef={lastLeadElementRef}
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

      <div className="flex flex-col flex-1 min-h-0 space-y-3 sm:space-y-4">
        <Tabs value={activeTab} onValueChange={setActiveTabAndNavigate} className="flex flex-col flex-1 min-h-0 w-full">
          {/* Cabeçalho largura total, mais alto, espaçamento entre abas */}
          <header
            className="flex items-center gap-6 w-full min-w-0 py-4 bg-white dark:bg-card border-b border-gray-200/80 dark:border-gray-800 shadow-[0_4px_12px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.35)] px-4 sm:px-6 md:px-8"
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <LayoutGrid className="h-5 w-5" />
              </div>
              <span className="font-semibold text-base text-foreground hidden sm:inline">CRM</span>
            </div>
            <TabsList className="flex flex-1 min-w-0 h-auto p-0 bg-transparent gap-2 flex-wrap justify-center sm:justify-start">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    title="Leads – Funil e Contatos"
                    className={cn(
                      'flex items-center gap-2 text-base rounded-lg px-4 py-2.5 min-w-0 transition-colors',
                      (activeTab === CRM_TAB_LEADS || activeTab === CRM_TAB_CONTATOS)
                        ? 'font-semibold text-slate-900 dark:text-slate-100 bg-slate-200 dark:bg-slate-600'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-600/50'
                    )}
                  >
                    <LayoutGrid className="h-4 w-4 shrink-0" />
                    <span>Leads</span>
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  sideOffset={6}
                  className="min-w-[11rem] rounded-xl bg-white dark:bg-gray-900 border border-gray-200/90 dark:border-gray-700 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.1)] dark:shadow-[0_4px_6px_-1px_rgba(0,0,0,0.2),0_10px_20px_-2px_rgba(0,0,0,0.35)] py-2"
                >
                  <DropdownMenuItem
                    onClick={() => setActiveTabAndNavigate(CRM_TAB_LEADS)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-4 py-3 cursor-pointer font-semibold mx-1.5 my-0.5 focus:bg-transparent',
                      activeTab === CRM_TAB_LEADS
                        ? 'text-violet-600 dark:text-violet-400 bg-violet-50/80 dark:bg-violet-950/40'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    )}
                  >
                    <LayoutGrid className={cn('h-5 w-5 shrink-0', activeTab === CRM_TAB_LEADS ? 'text-violet-600 dark:text-violet-400' : 'text-slate-500 dark:text-slate-400')} />
                    Funil
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setActiveTabAndNavigate(CRM_TAB_CONTATOS)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-4 py-3 cursor-pointer font-semibold mx-1.5 my-0.5 focus:bg-transparent',
                      activeTab === CRM_TAB_CONTATOS
                        ? 'text-violet-600 dark:text-violet-400 bg-violet-50/80 dark:bg-violet-950/40'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    )}
                  >
                    <Users className={cn('h-5 w-5 shrink-0', activeTab === CRM_TAB_CONTATOS ? 'text-violet-600 dark:text-violet-400' : 'text-slate-500 dark:text-slate-400')} />
                    Contatos
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <TabsTrigger
                value={CRM_TAB_VISAO_GERAL}
                className="flex items-center gap-2 text-base rounded-lg px-4 py-2.5 text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-600/50 data-[state=active]:font-semibold data-[state=active]:text-slate-900 dark:data-[state=active]:text-slate-100 data-[state=active]:!bg-slate-200 dark:data-[state=active]:!bg-slate-600 min-w-0 transition-colors"
                title="Métricas e resumo do funil"
              >
                <BarChart3 className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">Visão geral</span>
              </TabsTrigger>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    title="Ajustes – Funil, Usuários, API e Apicebot"
                    className={cn(
                      'flex items-center gap-2 text-base rounded-lg px-4 py-2.5 min-w-0 transition-colors',
                      [CRM_TAB_AJUSTES_FUNIL, CRM_TAB_AJUSTES_USUARIOS, CRM_TAB_API, CRM_TAB_APICEBOT, CRM_TAB_AUTOMACOES].includes(activeTab)
                        ? 'font-semibold text-slate-900 dark:text-slate-100 bg-slate-200 dark:bg-slate-600'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-600/50'
                    )}
                  >
                    <Settings className="h-4 w-4 shrink-0" />
                    <span className="hidden sm:inline">Ajustes</span>
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  sideOffset={6}
                  className="min-w-[11rem] rounded-xl bg-white dark:bg-gray-900 border border-gray-200/90 dark:border-gray-700 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.1)] dark:shadow-[0_4px_6px_-1px_rgba(0,0,0,0.2),0_10px_20px_-2px_rgba(0,0,0,0.35)] py-2"
                >
                  <DropdownMenuItem
                    onClick={() => setActiveTabAndNavigate(CRM_TAB_AJUSTES_FUNIL)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-4 py-3 cursor-pointer font-semibold mx-1.5 my-0.5 focus:bg-transparent',
                      activeTab === CRM_TAB_AJUSTES_FUNIL
                        ? 'text-violet-600 dark:text-violet-400 bg-violet-50/80 dark:bg-violet-950/40'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    )}
                  >
                    <LayoutGrid className={cn('h-5 w-5 shrink-0', activeTab === CRM_TAB_AJUSTES_FUNIL ? 'text-violet-600 dark:text-violet-400' : 'text-slate-500 dark:text-slate-400')} />
                    Funil
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setActiveTabAndNavigate(CRM_TAB_AJUSTES_USUARIOS)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-4 py-3 cursor-pointer font-semibold mx-1.5 my-0.5 focus:bg-transparent',
                      activeTab === CRM_TAB_AJUSTES_USUARIOS
                        ? 'text-violet-600 dark:text-violet-400 bg-violet-50/80 dark:bg-violet-950/40'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    )}
                  >
                    <Users className={cn('h-5 w-5 shrink-0', activeTab === CRM_TAB_AJUSTES_USUARIOS ? 'text-violet-600 dark:text-violet-400' : 'text-slate-500 dark:text-slate-400')} />
                    Usuários
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setActiveTabAndNavigate(CRM_TAB_API)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-4 py-3 cursor-pointer font-semibold mx-1.5 my-0.5 focus:bg-transparent',
                      activeTab === CRM_TAB_API
                        ? 'text-violet-600 dark:text-violet-400 bg-violet-50/80 dark:bg-violet-950/40'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    )}
                  >
                    <Link2 className={cn('h-5 w-5 shrink-0', activeTab === CRM_TAB_API ? 'text-violet-600 dark:text-violet-400' : 'text-slate-500 dark:text-slate-400')} />
                    API
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setActiveTabAndNavigate(CRM_TAB_APICEBOT)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-4 py-3 cursor-pointer font-semibold mx-1.5 my-0.5 focus:bg-transparent',
                      activeTab === CRM_TAB_APICEBOT
                        ? 'text-violet-600 dark:text-violet-400 bg-violet-50/80 dark:bg-violet-950/40'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    )}
                  >
                    <Bot className={cn('h-5 w-5 shrink-0', activeTab === CRM_TAB_APICEBOT ? 'text-violet-600 dark:text-violet-400' : 'text-slate-500 dark:text-slate-400')} />
                    Apicebot
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setActiveTabAndNavigate(CRM_TAB_AUTOMACOES)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-4 py-3 cursor-pointer font-semibold mx-1.5 my-0.5 focus:bg-transparent',
                      activeTab === CRM_TAB_AUTOMACOES
                        ? 'text-violet-600 dark:text-violet-400 bg-violet-50/80 dark:bg-violet-950/40'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    )}
                  >
                    <Zap className={cn('h-5 w-5 shrink-0', activeTab === CRM_TAB_AUTOMACOES ? 'text-violet-600 dark:text-violet-400' : 'text-slate-500 dark:text-slate-400')} />
                    Automações
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <TabsTrigger
                value={CRM_TAB_CANAIS}
                className="flex items-center gap-2 text-base rounded-lg px-4 py-2.5 text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-600/50 data-[state=active]:font-semibold data-[state=active]:text-slate-900 dark:data-[state=active]:text-slate-100 data-[state=active]:!bg-slate-200 dark:data-[state=active]:!bg-slate-600 min-w-0 transition-colors"
                title="Conectar WhatsApp"
              >
                <Radio className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">Canais</span>
              </TabsTrigger>
              {!HIDE_INBOX_AND_WHATSAPP_TABS && (
                <>
                  <TabsTrigger value={CRM_TAB_CAIXA_ENTRADA} className="flex items-center gap-2 text-base rounded-lg px-4 py-2.5 text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-600/50 data-[state=active]:font-semibold data-[state=active]:text-slate-900 dark:data-[state=active]:text-slate-100 data-[state=active]:!bg-slate-200 dark:data-[state=active]:!bg-slate-600 min-w-0 transition-colors" title="Caixa de entrada">
                    <Inbox className="h-4 w-4 shrink-0" />
                    <span className="hidden sm:inline">Inbox</span>
                  </TabsTrigger>
                  <TabsTrigger value={CRM_TAB_WHATSAPP} className="flex items-center gap-2 text-base rounded-lg px-4 py-2.5 text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-600/50 data-[state=active]:font-semibold data-[state=active]:text-slate-900 dark:data-[state=active]:text-slate-100 data-[state=active]:!bg-slate-200 dark:data-[state=active]:!bg-slate-600 min-w-0 transition-colors" title="Chat WhatsApp">
                    <MessageSquare className="h-4 w-4 shrink-0" />
                    <span className="hidden sm:inline">WhatsApp</span>
                  </TabsTrigger>
                </>
              )}
            </TabsList>
            <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-auto">
              <Button variant="outline" size="sm" className="h-10 rounded-full text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 hidden sm:inline-flex px-4" onClick={() => window.open('/cliente/support', '_self')}>
                <Star className="h-4 w-4 mr-1.5" />
                Sugira melhorias
              </Button>
              <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-foreground" title="Notificações">
                <Bell className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-foreground" title="Atualizar" onClick={() => refetchLeads()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-foreground hidden sm:flex" title="Ajuda">
                <HelpCircle className="h-4 w-4" />
              </Button>
            </div>
          </header>

          <div className="px-2 sm:px-3 md:px-4 flex flex-col flex-1 min-h-0">
          <TabsContent value={CRM_TAB_LEADS} className="mt-4 flex flex-col flex-1 min-h-0 overflow-y-auto data-[state=inactive]:hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-0 py-2.5 -mx-3 sm:-mx-4 md:-mx-8 px-3 sm:px-4 md:px-8 rounded-none bg-slate-100 dark:bg-slate-800/60">
              <div className="flex flex-1 flex-wrap items-center gap-3 min-w-0">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground shrink-0">
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
                  <SelectTrigger className="w-[240px] h-9 font-medium bg-background shrink-0">
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
                <span className="text-sm text-muted-foreground shrink-0 hidden sm:inline">
                  Leads ativos
                </span>
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
                  className="max-w-sm h-9 text-xs flex-1 min-w-[160px]"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-9 shrink-0"
                  onClick={() => refetchLeads()}
                  title="Buscar"
                >
                  <Search className="h-3.5 w-3.5 mr-1.5" />
                  Buscar
                </Button>
                <Dialog open={filterOpen} onOpenChange={setFilterOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" title="Filtros">
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
                        <label className="text-sm font-medium">Status</label>
                        <Select value={filters.status} onValueChange={(v) => setFilters((p) => ({ ...p, status: v }))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="todos">Todos</SelectItem>
                            {(settings?.statuses || []).map((s) => (
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
                    </div>
                    <DialogFooter>
                      <Button onClick={() => setFilterOpen(false)}>Aplicar</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => setViewMode('list')} title="Lista">
                  <List className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="icon" className={`h-8 w-8 shrink-0 ${viewMode === 'kanban' ? 'bg-muted' : ''}`} onClick={() => setViewMode('kanban')} title="Kanban">
                  <LayoutGrid className="h-3.5 w-3.5" />
                </Button>
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
            <CrmVisaoGeral metrics={leadsHook.metrics} loading={loading} />
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

      {showLeadDetail && (
        <LeadDetailModal
          lead={showLeadDetail}
          isOpen={!!showLeadDetail}
          onClose={() => setShowLeadDetail(null)}
          onEdit={setEditingLead}
          pipelines={pipelines}
          onTransfer={async (lead, { pipeline_id, stage_id, stage_nome }) => {
            await onUpdateLead(lead.id, {
              pipeline_id,
              stage_id,
              status: stage_nome,
              status_vida: 'ativo',
              stage_entered_at: new Date().toISOString(),
            });
            refetchLeads();
            setShowLeadDetail(null);
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
