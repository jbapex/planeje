import React, { useCallback, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  BarChart2,
  LayoutDashboard,
  Link2,
  Loader2,
  Plug,
  Radio,
  Send,
  Settings,
  Users,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { useClienteWhatsAppConfig } from '@/hooks/useClienteWhatsAppConfig';
import ContatosPage from '@/components/pages/ContatosPage';
import RastreamentoRelatorios from '@/components/crm/RastreamentoRelatorios';
import FunilEditor from '@/components/funil/FunilEditor';
import RastreamentoVisaoGeral from '@/components/crm/RastreamentoVisaoGeral';
import RastreamentoEventosMeta from '@/components/crm/RastreamentoEventosMeta';
import RastreamentoEventosGoogle from '@/components/crm/RastreamentoEventosGoogle';
import RastreamentoIntegracoes from '@/components/crm/RastreamentoIntegracoes';
import RastreamentoTrackableLinks from '@/components/crm/RastreamentoTrackableLinks';
import RastreamentoConfiguracoes from '@/components/crm/RastreamentoConfiguracoes';
import RastreamentoClienteSelect from '@/components/crm/RastreamentoClienteSelect';
import { RastreamentoHelp } from '@/components/crm/RastreamentoUi';
import {
  readStoredRastreamentoClienteId,
  rastreamentoTabHelp,
  rastreamentoTabSearchValue,
  resolveRastreamentoTab,
  storeRastreamentoClienteId,
} from '@/lib/rastreamentoHub';
import { readRastreamentoPeriod, writeRastreamentoPeriod } from '@/lib/rastreamentoPeriod';
import './RastreamentoHub.css';

const HUB_TABS = (
  <TabsList className="rastreamento-hub-tabs">
    <TabsTrigger value="visao" className="rastreamento-hub-tab">
      <LayoutDashboard className="h-4 w-4 shrink-0" />
      Visão geral
    </TabsTrigger>
    <TabsTrigger value="leads" className="rastreamento-hub-tab">
      <Users className="h-4 w-4 shrink-0" />
      Leads
    </TabsTrigger>
    <TabsTrigger value="relatorio" className="rastreamento-hub-tab">
      <BarChart2 className="h-4 w-4 shrink-0" />
      Relatórios
    </TabsTrigger>
    <TabsTrigger value="eventos" className="rastreamento-hub-tab">
      <Send className="h-4 w-4 shrink-0" />
      Eventos
    </TabsTrigger>
    <TabsTrigger value="links" className="rastreamento-hub-tab">
      <Link2 className="h-4 w-4 shrink-0" />
      Links
    </TabsTrigger>
    <TabsTrigger value="integracoes" className="rastreamento-hub-tab">
      <Plug className="h-4 w-4 shrink-0" />
      Integrações
    </TabsTrigger>
    <TabsTrigger value="configuracoes" className="rastreamento-hub-tab">
      <Settings className="h-4 w-4 shrink-0" />
      Configurações
    </TabsTrigger>
  </TabsList>
);

/**
 * Hub Rastreamento: visão geral, leads, relatório, eventos CAPI, funil e integrações.
 */
const ContatosRastreamentoPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = resolveRastreamentoTab(searchParams.get('aba'));
  const [storedClienteId, setStoredClienteId] = useState(() => readStoredRastreamentoClienteId() || null);
  const [eventosPlatform, setEventosPlatform] = useState(
    () => (searchParams.get('plataforma') === 'google' ? 'google' : 'meta'),
  );

  const period = useMemo(() => readRastreamentoPeriod(searchParams), [searchParams]);

  const setPeriod = useCallback(
    ({ since, until } = {}) => {
      setSearchParams(writeRastreamentoPeriod(searchParams, { since, until }), { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const setActiveTab = useCallback(
    (value) => {
      const next = new URLSearchParams(searchParams);
      const aba = rastreamentoTabSearchValue(value);
      if (aba) next.set('aba', aba);
      else next.delete('aba');
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const handleSelectCliente = useCallback((id) => {
    setStoredClienteId(id || null);
    storeRastreamentoClienteId(id || '');
  }, []);

  const {
    effectiveClienteId,
    selectedClienteId,
    setSelectedClienteId,
    clientesForAdmin,
    isMultiClientHub,
    loading: configLoading,
  } = useClienteWhatsAppConfig({
    autoSelectFirstClient: !storedClienteId,
    allowMultiClientHub: true,
    controlledSelectedClienteId: storedClienteId,
    onSelectedClienteIdChange: handleSelectCliente,
  });

  const sharedClienteSelection = useMemo(
    () => ({ selectedClienteId, setSelectedClienteId }),
    [selectedClienteId, setSelectedClienteId]
  );

  const selectedClienteName = useMemo(() => {
    if (!effectiveClienteId) return '';
    const found = clientesForAdmin?.find((c) => c.id === effectiveClienteId);
    return found?.empresa || '';
  }, [effectiveClienteId, clientesForAdmin]);

  const handleShowLeadDetail = useCallback(
    (lead) => {
      if (lead?.id) navigate(`/crm/leads/${lead.id}`);
    },
    [navigate]
  );

  const handleViewContactsByUtm = useCallback(
    (utmCampaign) => {
      const next = new URLSearchParams(searchParams);
      next.set('aba', 'leads');
      if (utmCampaign) next.set('utm_campaign', utmCampaign);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  return (
    <>
      <Helmet>
        <title>Rastreamento - JB APEX</title>
        <meta
          name="description"
          content="Rastreie leads WhatsApp, relatórios Meta e Google e conversões por cliente."
        />
      </Helmet>
      <div className="rastreamento-hub-shell">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
          <header className="rastreamento-hub-header">
            <div className="rastreamento-hub-header__row">
              <div className="rastreamento-hub-header__brand">
                <div className="rastreamento-hub-header__icon">
                  <Radio className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-0.5">
                    <h1 className="rastreamento-hub-header__title">Rastreamento</h1>
                    <RastreamentoHelp label="Sobre esta aba">{rastreamentoTabHelp(activeTab)}</RastreamentoHelp>
                  </div>
                  <p className="rastreamento-hub-header__subtitle">
                    {selectedClienteName || 'Selecione um cliente'}
                  </p>
                </div>
              </div>

              {isMultiClientHub && clientesForAdmin?.length > 0 && (
                <RastreamentoClienteSelect
                  clientes={clientesForAdmin}
                  value={selectedClienteId || effectiveClienteId || ''}
                  onChange={setSelectedClienteId}
                />
              )}
            </div>
            <div className="rastreamento-hub-header__nav">{HUB_TABS}</div>
          </header>

          <TabsContent
            value="visao"
            className="rastreamento-hub-panel focus-visible:outline-none data-[state=inactive]:hidden"
          >
            {configLoading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <RastreamentoVisaoGeral
                clienteId={effectiveClienteId}
                onOpenTab={setActiveTab}
                since={period.since}
                until={period.until}
                onPeriodChange={setPeriod}
              />
            )}
          </TabsContent>

          <TabsContent
            value="leads"
            className="rastreamento-hub-panel rastreamento-hub-panel--leads focus-visible:outline-none data-[state=inactive]:hidden"
          >
            <ContatosPage
              standaloneTracking
              hideHubClientSelector
              embeddedInHub
              sharedClienteSelection={sharedClienteSelection}
              periodFromIso={period.since}
              periodToIso={period.until}
              onPeriodChange={setPeriod}
            />
          </TabsContent>

          <TabsContent
            value="relatorio"
            className="rastreamento-hub-panel focus-visible:outline-none data-[state=inactive]:hidden"
          >
            {configLoading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : !effectiveClienteId ? (
              <Card className="rt-empty">
                <CardContent className="py-14 text-center text-sm text-muted-foreground">
                  Selecione um cliente no topo para ver os relatórios.
                </CardContent>
              </Card>
            ) : (
              <div className="overflow-hidden rounded-[26px] border border-slate-200/70 bg-white shadow-[0_14px_45px_rgba(15,23,42,0.055)] dark:border-white/10 dark:bg-card min-w-0">
                <RastreamentoRelatorios
                  clienteId={effectiveClienteId}
                  onShowLeadDetail={handleShowLeadDetail}
                />
              </div>
            )}
          </TabsContent>

          <TabsContent
            value="eventos"
            className="rastreamento-hub-panel focus-visible:outline-none data-[state=inactive]:hidden"
          >
            {configLoading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`rounded-full px-3 py-1.5 text-sm font-medium border ${
                      eventosPlatform === 'meta'
                        ? 'bg-violet-600 text-white border-violet-600'
                        : 'bg-background border-border text-muted-foreground'
                    }`}
                    onClick={() => {
                      setEventosPlatform('meta');
                      const next = new URLSearchParams(searchParams);
                      next.delete('plataforma');
                      setSearchParams(next, { replace: true });
                    }}
                  >
                    Meta
                  </button>
                  <button
                    type="button"
                    className={`rounded-full px-3 py-1.5 text-sm font-medium border ${
                      eventosPlatform === 'google'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-background border-border text-muted-foreground'
                    }`}
                    onClick={() => {
                      setEventosPlatform('google');
                      const next = new URLSearchParams(searchParams);
                      next.set('plataforma', 'google');
                      setSearchParams(next, { replace: true });
                    }}
                  >
                    Google
                  </button>
                </div>
                {eventosPlatform === 'google' ? (
                  <RastreamentoEventosGoogle
                    clienteId={effectiveClienteId}
                    since={period.since}
                    until={period.until}
                    onPeriodChange={setPeriod}
                  />
                ) : (
                  <RastreamentoEventosMeta
                    clienteId={effectiveClienteId}
                    since={period.since}
                    until={period.until}
                    onPeriodChange={setPeriod}
                  />
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent
            value="funil"
            className="rastreamento-hub-panel rastreamento-hub-panel--funil focus-visible:outline-none data-[state=inactive]:hidden"
          >
            {configLoading ? (
              <div className="flex flex-1 justify-center items-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <FunilEditor
                clienteId={effectiveClienteId}
                clienteName={selectedClienteName}
                onViewContacts={handleViewContactsByUtm}
              />
            )}
          </TabsContent>

          <TabsContent
            value="links"
            className="rastreamento-hub-panel focus-visible:outline-none data-[state=inactive]:hidden"
          >
            {configLoading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : !effectiveClienteId ? (
              <Card className="rt-empty">
                <CardContent className="py-14 text-center text-sm text-muted-foreground">
                  Selecione um cliente no topo para gerar links rastreáveis.
                </CardContent>
              </Card>
            ) : (
              <div className="rt-page">
                <RastreamentoTrackableLinks
                  clienteId={effectiveClienteId}
                  clienteName={selectedClienteName}
                  onOpenMatchedLeads={(linkId) => {
                    const next = new URLSearchParams(searchParams);
                    next.set('aba', 'leads');
                    if (linkId) next.set('planeje_link_id', linkId);
                    else next.delete('planeje_link_id');
                    setSearchParams(next, { replace: true });
                  }}
                />
              </div>
            )}
          </TabsContent>

          <TabsContent
            value="integracoes"
            className="rastreamento-hub-panel focus-visible:outline-none data-[state=inactive]:hidden"
          >
            {configLoading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <RastreamentoIntegracoes
                clienteId={effectiveClienteId}
                onOpenSettings={() => setActiveTab('configuracoes')}
                onOpenLinks={() => setActiveTab('links')}
              />
            )}
          </TabsContent>

          <TabsContent
            value="configuracoes"
            className="rastreamento-hub-panel focus-visible:outline-none data-[state=inactive]:hidden"
          >
            {configLoading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <RastreamentoConfiguracoes clienteId={effectiveClienteId} />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
};

export default ContatosRastreamentoPage;
