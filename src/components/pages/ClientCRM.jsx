import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, LayoutGrid, List, Settings, BarChart3, PlusCircle, Download, Filter, Search, Link2, Radio, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';

import { ClienteCrmSettingsProvider } from '@/contexts/ClienteCrmSettingsContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useLeads } from '@/hooks/useLeads';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
import CrmSettingsContent from '@/components/crm/CrmSettingsContent';
import CrmVisaoGeral from '@/components/crm/CrmVisaoGeral';
import MoveToStageModal from '@/components/crm/MoveToStageModal';
import PipelineEditor from '@/components/crm/PipelineEditor';
import { useCrmPipeline } from '@/hooks/useCrmPipeline';
import { useClientMembers } from '@/hooks/useClientMembers';
import ClienteApiPage from '@/components/pages/ClienteApiPage';
import ClienteCanaisPage from '@/components/pages/ClienteCanaisPage';
import CaixaEntradaPage from '@/components/pages/CaixaEntradaPage';

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
const CRM_TAB_CONFIGURACOES = 'configuracoes';
const CRM_TAB_API = 'api';
const CRM_TAB_CANAIS = 'canais';
const CRM_TAB_CAIXA_ENTRADA = 'caixa-entrada';

const ClientCRMContent = () => {
  const [activeTab, setActiveTab] = useState(CRM_TAB_LEADS);
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
  const { members: clientMembers } = useClientMembers();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const lastLeadElementRef = useRef(null);

  useEffect(() => {
    if (isMobile) setViewMode('list');
  }, [isMobile]);

  useEffect(() => {
    setSelectedLeads([]);
  }, [leads, filters, searchTerm, viewMode]);

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
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0 w-full">
          <div className="flex items-center justify-between w-full gap-3">
            <TabsList className="grid max-w-2xl grid-cols-6 h-10 bg-slate-200/80 dark:bg-slate-800/50 p-1 rounded-lg shrink-0">
              <TabsTrigger
                value={CRM_TAB_LEADS}
                className="flex items-center justify-center gap-1.5 text-xs rounded-md text-slate-600 dark:text-slate-400 data-[state=active]:bg-blue-600 data-[state=active]:text-white min-w-0 px-2"
                title="Leads e Kanban"
              >
                <LayoutGrid className="h-3.5 w-3.5 shrink-0" />
                <span>Leads</span>
              </TabsTrigger>
              <TabsTrigger
                value={CRM_TAB_VISAO_GERAL}
                className="flex items-center justify-center gap-1.5 text-xs rounded-md text-slate-600 dark:text-slate-400 data-[state=active]:bg-blue-600 data-[state=active]:text-white min-w-0 px-2"
                title="Métricas e resumo do funil"
              >
                <BarChart3 className="h-3.5 w-3.5 shrink-0" />
                <span>Visão geral</span>
              </TabsTrigger>
              <TabsTrigger
                value={CRM_TAB_CONFIGURACOES}
                className="flex items-center justify-center gap-1.5 text-xs rounded-md text-slate-600 dark:text-slate-400 data-[state=active]:bg-blue-600 data-[state=active]:text-white min-w-0 px-2"
                title="Status, pipeline e WhatsApp"
              >
                <Settings className="h-3.5 w-3.5 shrink-0" />
                <span>Config.</span>
              </TabsTrigger>
              <TabsTrigger
                value={CRM_TAB_API}
                className="flex items-center justify-center gap-1.5 text-xs rounded-md text-slate-600 dark:text-slate-400 data-[state=active]:bg-blue-600 data-[state=active]:text-white min-w-0 px-2"
                title="API uazapi (subdomínio e token)"
              >
                <Link2 className="h-3.5 w-3.5 shrink-0" />
                <span>API</span>
              </TabsTrigger>
              <TabsTrigger
                value={CRM_TAB_CANAIS}
                className="flex items-center justify-center gap-1.5 text-xs rounded-md text-slate-600 dark:text-slate-400 data-[state=active]:bg-blue-600 data-[state=active]:text-white min-w-0 px-2"
                title="Conectar WhatsApp (QR code)"
              >
                <Radio className="h-3.5 w-3.5 shrink-0" />
                <span>Canais</span>
              </TabsTrigger>
              <TabsTrigger
                value={CRM_TAB_CAIXA_ENTRADA}
                className="flex items-center justify-center gap-1.5 text-xs rounded-md text-slate-600 dark:text-slate-400 data-[state=active]:bg-blue-600 data-[state=active]:text-white min-w-0 px-2"
                title="Mensagens recebidas no WhatsApp"
              >
                <Inbox className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden sm:inline">Caixa de entrada</span>
                <span className="sm:hidden">Inbox</span>
              </TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-2 shrink-0 ml-auto">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={onExport} title="Exportar">
                <Download className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setShowImportLeads(true)}
              >
                Importar
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={() => setShowAddLead(true)}
              >
                <PlusCircle className="h-3.5 w-3.5 mr-1.5" />
                Novo
              </Button>
            </div>
          </div>

          <TabsContent value={CRM_TAB_LEADS} className="mt-4 flex flex-col flex-1 min-h-0 data-[state=inactive]:hidden">
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

          <TabsContent value={CRM_TAB_VISAO_GERAL} className="mt-4">
            <CrmVisaoGeral metrics={leadsHook.metrics} loading={loading} />
          </TabsContent>

          <TabsContent value={CRM_TAB_CONFIGURACOES} className="mt-4">
            <CrmSettingsContent />
          </TabsContent>
          <TabsContent value={CRM_TAB_API} className="mt-4 data-[state=inactive]:hidden">
            <ClienteApiPage onGoToCanais={() => setActiveTab(CRM_TAB_CANAIS)} embeddedInCrm />
          </TabsContent>
          <TabsContent value={CRM_TAB_CANAIS} className="mt-4 data-[state=inactive]:hidden">
            <ClienteCanaisPage onGoToApi={() => setActiveTab(CRM_TAB_API)} embeddedInCrm />
          </TabsContent>
          <TabsContent value={CRM_TAB_CAIXA_ENTRADA} className="mt-4 data-[state=inactive]:hidden">
            <CaixaEntradaPage embeddedInCrm />
          </TabsContent>
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
