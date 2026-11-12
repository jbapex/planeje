import React, { useEffect } from 'react';
import WhatsappConnectionPublic from '@/components/pages/WhatsappConnectionPublic';
import { isWhatsappConnectionPath } from '@/lib/whatsappConnection';
    import { Helmet } from 'react-helmet';
    import { useParams, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
    import { Toaster } from '@/components/ui/toaster';
    import { useAuth } from '@/contexts/SupabaseAuthContext';
    import { useModuleSettings } from '@/contexts/ModuleSettingsContext';
    import MainLayout from '@/components/layout/MainLayout';
import MainLayoutCliente from '@/components/layout/MainLayoutCliente';
    import Dashboard from '@/components/pages/Dashboard';
    import Clients from '@/components/pages/Clients';
    import Projects from '@/components/pages/Projects';
    import ProjectDetail from '@/components/pages/ProjectDetail';
    import Tasks from '@/components/pages/Tasks';
    import Requests from '@/components/pages/Requests';
    import Settings from '@/components/pages/Settings';
    import SuperAdmin from '@/components/pages/SuperAdmin';
    import Login from '@/components/auth/Login';
    import SignUp from '@/components/auth/SignUp';
    import SignUpSuperAdmin from '@/components/auth/SignUpSuperAdmin';
    import SocialMedia from '@/components/pages/SocialMedia';
    import PaidTraffic from '@/components/pages/PaidTraffic';
    import MetaIntegrationHelp from '@/components/pages/MetaIntegrationHelp';
    import PrivacyPolicy from '@/components/pages/PrivacyPolicy';
    import TermsOfService from '@/components/pages/TermsOfService';
    import DataDeletion from '@/components/pages/DataDeletion';
    import MetaAdsReporter from '@/components/pages/MetaAdsReporter';
    import PerformanceReport from '@/components/pages/PerformanceReport';
    import PGMPanel from '@/components/pages/PGMPanel';
    import Onboarding from '@/components/pages/Onboarding';
    import MarketingDiagnostic from '@/components/pages/MarketingDiagnostic';
import PublicClientChat from '@/components/pages/PublicClientChat';
import ApexIAAuthenticated from '@/components/pages/ApexIAAuthenticated';
import ClientLogin from '@/components/auth/ClientLogin';
import ProtectedClientRoute from '@/components/auth/ProtectedClientRoute';
import ProtectedClientPageRoute from '@/components/auth/ProtectedClientPageRoute';
import ClientSupport from '@/components/pages/ClientSupport';
import ClientCadastros from '@/components/pages/ClientCadastros';
import ClientCampaignsStatus from '@/components/pages/ClientCampaignsStatus';
import ClientAreaPanel from '@/components/pages/ClientAreaPanel';
import TrafficWeekly from '@/components/pages/TrafficWeekly';
import AssistantHome from '@/components/pages/AssistantHome';
import CerebroPage from '@/components/pages/CerebroPage';
import AtlasPage from '@/components/pages/AtlasPage';
import AtlasEventPanel from '@/components/atlas/AtlasEventPanel';
import SelectClient from '@/components/pages/SelectClient';
import ClientChat from '@/components/pages/ClientChat';
import GeneralChat from '@/components/pages/GeneralChat';
import TestImageModels from '@/components/pages/TestImageModels';
import AILearningDashboard from '@/components/pages/AILearningDashboard';
import ClientCRM from '@/components/pages/ClientCRM';
import MiniCrmPage from '@/components/pages/MiniCrmPage';
import ClienteCalendarioPage from '@/components/pages/ClienteCalendarioPage';
import ClienteAtendimentoPage from '@/components/pages/ClienteAtendimentoPage';
import ClienteAtendimentoConfigPage from '@/components/pages/ClienteAtendimentoConfigPage';
import LojaAdminOnlyRoute from '@/components/auth/LojaAdminOnlyRoute';
import LeadDetailPage from '@/components/pages/LeadDetailPage';
import CrmLayout from '@/components/pages/CrmLayout';
import AtendimentoPage from '@/components/pages/AtendimentoPage';
import AtendimentoConfigPage from '@/components/pages/AtendimentoConfigPage';
import ConversasCanaisPage from '@/components/pages/ConversasCanaisPage';
import ConversasEnviosPage from '@/components/pages/ConversasEnviosPage';
import ConversasLembretesPage from '@/components/pages/ConversasLembretesPage';
import { CONVERSAS_DEFAULT_PATH } from '@/lib/conversasRoutes';
import ContatosRastreamentoPage from '@/components/pages/ContatosRastreamentoPage';
import RelatoriosPorClientePage from '@/components/pages/RelatoriosPorClientePage';
import CoberturaMensalPage from '@/components/pages/CoberturaMensalPage';
import AgenciaFinanceiroPage from '@/components/pages/AgenciaFinanceiroPage';
import ClientHubPage from '@/components/pages/ClientHubPage';
    import ChatLauncher from '@/components/pages/ChatLauncher';
    import WhatsAppSettings from '@/components/pages/WhatsAppSettings';
import MetaAgencySettings from '@/components/pages/MetaAgencySettings';
import GoogleDriveAgencySettings from '@/components/pages/GoogleDriveAgencySettings';
import GoogleAdsAgencySettings from '@/components/pages/GoogleAdsAgencySettings';
import GoogleDataAgencySettings from '@/components/pages/GoogleDataAgencySettings';
import ExtensaoWhatsAppPage from '@/components/pages/ExtensaoWhatsAppPage';
import PlanejeAutomacoesPage from '@/components/pages/PlanejeAutomacoesPage';
import BriefingPublico from '@/components/briefing/BriefingPublico';
import CaixaPendenciasPage from '@/components/pages/CaixaPendenciasPage';

const GestorIaWorkspace = React.lazy(() => import('@/components/gestor-ia/GestorIaWorkspace'));
const CsIaWorkspace = React.lazy(() => import('@/components/cs-ia/CsIaWorkspace'));
const CrmIaWorkspace = React.lazy(() => import('@/components/crm-ia/CrmIaWorkspace'));

const TrafegoPreviewPage = import.meta.env.DEV
  ? React.lazy(() => import('@/components/traffic/preview/TrafegoPreviewPage.jsx'))
  : null;

    const ProtectedRoute = ({ children, allowedRoles, requiredModule }) => {
      const { profile, loading: authLoading } = useAuth();
      const { moduleSettings, loading: modulesLoading } = useModuleSettings();

      const loading = authLoading || modulesLoading;
      
      if (loading) {
        return <div className="flex w-full h-screen items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200">Carregando...</div>; 
      }

      const isAllowed = profile?.role && allowedRoles.includes(profile.role);
      const isModuleEnabled = !requiredModule || moduleSettings[requiredModule] === true;

      if (!profile || !isAllowed || !isModuleEnabled) {
        return <Navigate to="/tasks/list" replace />;
      }

      return children;
    };

    const PrivateClientChat = () => {
      const { session, profile } = useAuth();
      const { clientId } = useParams();
      if (!session || !profile) return <Login />;
      if (profile.role === 'cliente' && profile.cliente_id !== clientId) return <Navigate to="/cliente/support" replace />;
      if (profile.role !== 'cliente' && profile.status !== 'active') return <Navigate to="/login" replace />;
      return <PublicClientChat />;
    };
    const PrivateChatLauncher = () => {
      const { session, profile } = useAuth();
      return session && profile ? <ChatLauncher /> : <Login />;
    };

    const PublicPages = () => (
      <>
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/terms-of-service" element={<TermsOfService />} />
        <Route path="/data-deletion" element={<DataDeletion />} />
        <Route path="/diagnostico" element={<MarketingDiagnostic />} />
        {/* Rotas públicas do ApexIA (acesso via link) - MANTIDAS */}
        <Route path="/chat/:clientId/:sessionId?" element={<PrivateClientChat />} />
        <Route path="/chat-launcher" element={<PrivateChatLauncher />} />
        {/* Nova rota de login para clientes */}
        <Route path="/login-cliente" element={<ClientLogin />} />
      </>
    );

    function App() {
      const { session, profile, loading: authLoading, authError, retryAuth, signOut } = useAuth();
      const navigate = useNavigate();
      const location = useLocation();
      const isPublicBriefingRoute = location.pathname.startsWith('/b/');
      const isPublicWhatsappRoute = isWhatsappConnectionPath(location.pathname);
      const isDevPreview = import.meta.env.DEV && location.pathname.includes('/paid-traffic/preview');

      useEffect(() => {
        const isDarkMode = localStorage.getItem('theme') === 'dark';
        if (isDarkMode) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }, []);

      // Redirecionar clientes para /apexia se tentarem acessar rotas internas
      // Este useEffect é importante porque detecta mudanças no profile e redireciona imediatamente
      useEffect(() => {
        if (!isPublicWhatsappRoute && !authLoading && session && profile?.role === 'cliente' && profile?.cliente_id) {

          // Para HashRouter, o path está no hash
          const hash = window.location.hash;
          const currentPath = hash ? hash.replace('#', '') : window.location.pathname;

          if (currentPath === '/mini-crm' || currentPath.startsWith('/mini-crm?') || currentPath.startsWith('/mini-crm/')) {
            navigate(`/cliente/mini-crm${currentPath.slice('/mini-crm'.length)}`, { replace: true });
            return;
          }
          
          // Lista de rotas permitidas para clientes
          const allowedPaths = ['/apexia', '/chat', '/login-cliente', '/cliente', '/b'];
          const isAllowedPath = allowedPaths.some(path => currentPath.startsWith(path));
          
          // Se não está em uma rota permitida, redirecionar para o Dashboard
          if (!isAllowedPath && currentPath && currentPath !== '/') {
            console.log('🔄 App: Cliente em rota interna (' + currentPath + '), redirecionando para /cliente/support');
            navigate('/cliente/support', { replace: true });
            return;
          }
          
          // Se estiver na raiz ou em /tasks/list, redirecionar para o Dashboard
          if (currentPath === '/' || currentPath === '' || currentPath === '/tasks/list' || currentPath === '/tasks') {
            console.log('🔄 App: Cliente na raiz ou rota padrão (' + currentPath + '), redirecionando para /cliente/support');
            navigate('/cliente/support', { replace: true });
          }
        }
      }, [session, profile, authLoading, navigate, isPublicWhatsappRoute]);

      if ((authLoading || (session && !profile && !authError)) && !isPublicBriefingRoute && !isPublicWhatsappRoute && !isDevPreview) {
        return (
          <div className="flex flex-col w-full h-screen items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
            <p>Carregando...</p>
          </div>
        );
      }

      if (session && profile && profile.role !== 'cliente' && profile.status !== 'active' && !isPublicBriefingRoute && !isPublicWhatsappRoute && !isDevPreview) {
        return <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6">
          <p className="text-lg font-semibold">Acesso ainda não autorizado</p>
          <p>Peça a Josias um convite para entrar no Planeje.</p>
          <button type="button" onClick={() => signOut()}>Sair</button>
        </div>;
      }

      if (authError && !isPublicBriefingRoute && !isPublicWhatsappRoute && !isDevPreview) {
        return (
          <div className="flex flex-col w-full h-screen items-center justify-center gap-3 bg-gray-50 px-6 dark:bg-gray-900 text-gray-800 dark:text-gray-200">
            <p className="text-lg font-semibold">Não foi possível concluir o acesso</p>
            <p className="max-w-md text-center text-sm text-gray-500 dark:text-gray-400">
              Não conseguimos carregar seus dados agora. Tente novamente.
            </p>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                onClick={() => retryAuth()}
              >
                Tentar de novo
              </button>
              <button
                type="button"
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium dark:border-gray-600"
                onClick={() => signOut()}
              >
                Sair
              </button>
            </div>
          </div>
        );
      }

      return (
        <>
          <Helmet>
            <title>Planeje — Sistema operacional para agências</title>
            <meta name="description" content="Planeje é o sistema operacional para agências: clientes, conversas, entregas, tráfego, CRM e IA em um só lugar." />
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="true" />
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Poppins:wght@400;500;600;800&display=swap" rel="stylesheet" />
          </Helmet>
          <Routes>
            <Route path="/b/:token" element={<BriefingPublico />} />
            <Route path="/conectar-whatsapp/:token" element={<WhatsappConnectionPublic />} />
            {import.meta.env.DEV && TrafegoPreviewPage ? (
              <Route
                path="/paid-traffic/preview/*"
                element={
                  <React.Suspense fallback={<p className="p-6 text-muted-foreground">Carregando preview…</p>}>
                    <TrafegoPreviewPage />
                  </React.Suspense>
                }
              />
            ) : null}
            {PublicPages()}

            {session ? (
              profile?.role === 'cliente' && profile?.cliente_id ? (
                <>
                  <Route path="/mini-crm/*" element={<Navigate to={`/cliente${location.pathname}${location.search}`} replace />} />
                  <Route path="/apexia" element={<ProtectedClientRoute><ProtectedClientPageRoute pageKey="apexia"><ApexIAAuthenticated /></ProtectedClientPageRoute></ProtectedClientRoute>} />
                  <Route path="/apexia/:sessionId" element={<ProtectedClientRoute><ProtectedClientPageRoute pageKey="apexia"><ApexIAAuthenticated /></ProtectedClientPageRoute></ProtectedClientRoute>} />
                  <Route path="/cliente" element={<ProtectedClientRoute><MainLayoutCliente /></ProtectedClientRoute>}>
                    <Route index element={<Navigate to="/cliente/support" replace />} />
                    <Route path="support" element={<ProtectedClientPageRoute pageKey="dashboard"><ClientSupport /></ProtectedClientPageRoute>} />
                    <Route path="trafego" element={<Navigate to="/cliente/support" replace />} />
                    <Route path="cadastros" element={<LojaAdminOnlyRoute><ClientCadastros /></LojaAdminOnlyRoute>} />
                    <Route path="campaigns-status" element={<ProtectedClientPageRoute pageKey="campaigns-status"><ClientCampaignsStatus /></ProtectedClientPageRoute>} />
                    <Route path="pgm-panel" element={<ProtectedClientPageRoute pageKey="pgm-panel"><PGMPanel /></ProtectedClientPageRoute>} />
                    <Route path="mini-crm" element={<MiniCrmPage />} />
                    <Route path="calendario" element={<ClienteCalendarioPage />} />
                    <Route path="atendimento" element={<ProtectedClientPageRoute pageKey="atendimento"><ClienteAtendimentoPage /></ProtectedClientPageRoute>} />
                    <Route path="atendimento/config" element={<ProtectedClientPageRoute pageKey="atendimento"><ClienteAtendimentoConfigPage /></ProtectedClientPageRoute>} />
                    <Route path="crm" element={<ProtectedClientPageRoute pageKey="crm"><CrmLayout /></ProtectedClientPageRoute>}>
                      <Route index element={<Navigate to="leads" replace />} />
                      <Route path="leads/:leadId" element={<LeadDetailPage />} />
                      <Route path=":tab" element={<ClientCRM />} />
                    </Route>
                  </Route>
                  <Route path="*" element={<Navigate to="/cliente/support" replace />} />
                </>
              ) : (
                <>
                  {/* Área do Cliente - Acessível por administradores (fora do MainLayout para abrir em tela cheia) */}
                  <Route path="/client-area" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="client_area"><MainLayoutCliente /></ProtectedRoute>}>
                    <Route path="support" element={<ClientSupport />} />
                    <Route path="trafego" element={<Navigate to="/client-area/support" replace />} />
                    <Route path="traffic-weekly" element={<TrafficWeekly />} />
                    <Route path="cadastros" element={<ClientCadastros />} />
                    <Route path="campaigns-status" element={<ClientCampaignsStatus />} />
                    <Route path="pgm-panel" element={<PGMPanel />} />
                    <Route path="mini-crm" element={<MiniCrmPage />} />
                    <Route path="calendario" element={<ClienteCalendarioPage />} />
                    <Route path="atendimento" element={<ClienteAtendimentoPage />} />
                    <Route path="crm" element={<CrmLayout />}>
                      <Route index element={<Navigate to="leads" replace />} />
                      <Route path="leads/:leadId" element={<LeadDetailPage />} />
                      <Route path=":tab" element={<ClientCRM />} />
                    </Route>
                    <Route index element={<Navigate to="/client-area/support" replace />} />
                  </Route>

                  <Route path="/gestor-ia/*" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="paid_traffic"><React.Suspense fallback={<p className="p-6" role="status">Carregando Gestor IA…</p>}><GestorIaWorkspace /></React.Suspense></ProtectedRoute>} />
                  <Route path="/cs-ia/*" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="clients"><React.Suspense fallback={<p className="p-6" role="status">Carregando CS IA…</p>}><CsIaWorkspace /></React.Suspense></ProtectedRoute>} />
                  <Route path="/crm-ia/*" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="crm"><React.Suspense fallback={<p className="p-6" role="status">Carregando CRM IA…</p>}><CrmIaWorkspace /></React.Suspense></ProtectedRoute>} />
                  <Route path="/" element={<MainLayout />}>
                    <Route index element={<Navigate to="/caixa" replace />} />
                    <Route path="caixa" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']}><CaixaPendenciasPage /></ProtectedRoute>} />
                    <Route path="conversas" element={<Navigate to={CONVERSAS_DEFAULT_PATH} replace />} />
                    <Route path="conversas/config" element={<ProtectedRoute allowedRoles={['superadmin']}><AtendimentoConfigPage /></ProtectedRoute>} />
                    <Route path="conversas/canais" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="atendimento"><ConversasCanaisPage /></ProtectedRoute>} />
                    <Route path="conversas/envios" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="atendimento"><ConversasEnviosPage /></ProtectedRoute>} />
                    <Route path="conversas/lembretes" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="atendimento"><ConversasLembretesPage /></ProtectedRoute>} />
                    <Route path="conversas/:statusTab" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="atendimento"><AtendimentoPage /></ProtectedRoute>} />
                    <Route path="atendimento" element={<Navigate to={CONVERSAS_DEFAULT_PATH} replace />} />
                    <Route path="dashboard" element={<Dashboard />} />
                    <Route path="clients" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="clients"><Clients /></ProtectedRoute>} />
                    <Route path="clients/new" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="clients"><Clients /></ProtectedRoute>} />
                    <Route path="clients/:id/edit" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="clients"><ClientHubPage /></ProtectedRoute>} />
                    <Route path="clients/:id" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="clients"><ClientHubPage /></ProtectedRoute>} />
                    <Route path="financeiro" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']} requiredModule="financeiro"><AgenciaFinanceiroPage /></ProtectedRoute>} />
                    
                    <Route path="projects" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="projects"><Projects /></ProtectedRoute>} />
                    <Route path="projects/new" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="projects"><Projects /></ProtectedRoute>} />
                    <Route path="projects/edit/:id" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="projects"><Projects /></ProtectedRoute>} />
                    <Route path="projects/:id/*" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="projects"><ProjectDetail /></ProtectedRoute>} />

                    <Route path="tasks" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="tasks"><Navigate to="/tasks/list" replace /></ProtectedRoute>} />
                    <Route path="tasks/:view" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="tasks"><Tasks /></ProtectedRoute>} />
                    <Route path="tasks/:view/:id" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="tasks"><Tasks /></ProtectedRoute>} />
                    
                    <Route path="requests" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']} requiredModule="requests"><Requests /></ProtectedRoute>} />
                    <Route path="social-media" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="social_media"><SocialMedia /></ProtectedRoute>} />
                    <Route path="paid-traffic/*" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="paid_traffic"><PaidTraffic /></ProtectedRoute>} />
                    <Route path="rastreamento" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="rastreamento"><ContatosRastreamentoPage /></ProtectedRoute>} />
                    <Route path="relatorios-cliente" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="reports"><RelatoriosPorClientePage /></ProtectedRoute>} />
                    <Route path="cobertura" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="tasks"><CoberturaMensalPage /></ProtectedRoute>} />
                    <Route path="mini-crm" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="mini_crm"><MiniCrmPage /></ProtectedRoute>} />
                    <Route path="crm" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="crm"><CrmLayout /></ProtectedRoute>}>
                      <Route index element={<Navigate to="leads" replace />} />
                      <Route path="leads/:leadId" element={<LeadDetailPage />} />
                      <Route path=":tab" element={<ClientCRM />} />
                    </Route>
                    <Route path="meta-reporter" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="paid_traffic"><MetaAdsReporter /></ProtectedRoute>} />
                    <Route path="reports" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="reports"><PerformanceReport /></ProtectedRoute>} />
                    <Route path="pgm-panel" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="pgm"><PGMPanel /></ProtectedRoute>} />
                    <Route path="traffic-weekly" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']}><TrafficWeekly /></ProtectedRoute>} />
                    <Route path="onboarding" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="onboarding"><Onboarding /></ProtectedRoute>} />
                    <Route path="assistant" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="assistant"><AssistantHome /></ProtectedRoute>} />
                    <Route path="assistant/cerebro" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="assistant"><CerebroPage /></ProtectedRoute>} />
                    <Route path="assistant/atlas/configuracoes" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']} requiredModule="assistant"><div className="atlas-settings-page"><AtlasEventPanel settingsOnly /></div></ProtectedRoute>} />
                    <Route path="assistant/atlas" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="assistant"><AtlasPage /></ProtectedRoute>} />
                    <Route path="assistant/select-client" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="assistant"><SelectClient /></ProtectedRoute>} />
                    <Route path="assistant/client/:clientId" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="assistant"><ClientChat /></ProtectedRoute>} />
                    <Route path="assistant/general" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="assistant"><GeneralChat /></ProtectedRoute>} />
                    <Route path="assistant/learning" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="assistant"><AILearningDashboard /></ProtectedRoute>} />
                    <Route path="settings" element={<Settings />} />
                    <Route path="settings/whatsapp" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']}><WhatsAppSettings /></ProtectedRoute>} />
                    <Route path="settings/meta" element={<ProtectedRoute allowedRoles={['superadmin']}><MetaAgencySettings /></ProtectedRoute>} />
                    <Route path="settings/google-drive" element={<ProtectedRoute allowedRoles={['superadmin']}><GoogleDriveAgencySettings /></ProtectedRoute>} />
                    <Route path="settings/google-ads" element={<ProtectedRoute allowedRoles={['superadmin']}><GoogleAdsAgencySettings /></ProtectedRoute>} />
                    <Route path="settings/google-dados" element={<ProtectedRoute allowedRoles={['superadmin']}><GoogleDataAgencySettings /></ProtectedRoute>} />
                    <Route path="extensao-whatsapp" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']}><ExtensaoWhatsAppPage /></ProtectedRoute>} />
                    <Route path="automacoes" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']} requiredModule="automacoes"><PlanejeAutomacoesPage /></ProtectedRoute>} />
                    <Route path="super-admin/diagnostic-leads" element={<ProtectedRoute allowedRoles={['superadmin']}><Navigate to="/super-admin/diagnostico?tab=leads" replace /></ProtectedRoute>} />
                    <Route path="super-admin/ai-agents" element={<ProtectedRoute allowedRoles={['superadmin']}><Navigate to="/super-admin/ia?tab=agents" replace /></ProtectedRoute>} />
                    <Route path="super-admin/chat-limits" element={<ProtectedRoute allowedRoles={['superadmin']}><Navigate to="/super-admin/ia?tab=limits" replace /></ProtectedRoute>} />
                    <Route path="test-image-models" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><TestImageModels /></ProtectedRoute>} />
                    <Route path="super-admin/*" element={<ProtectedRoute allowedRoles={['superadmin']}><SuperAdmin /></ProtectedRoute>} />
                    <Route path="meta-integration-help" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><MetaIntegrationHelp /></ProtectedRoute>} />
                    
                    <Route path="*" element={<Navigate to="/caixa" replace />} />
                  </Route>
                </>
              )
            ) : (
              <>
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<SignUp />} />
                <Route path="/signup-superadmin" element={<SignUpSuperAdmin />} />
                
                <Route path="*" element={<Navigate to="/login" replace />} />
              </>
            )}
          </Routes>
          <Toaster />
        </>
      );
    }

    export default App;
