import React, { useEffect } from 'react';
    import { Helmet } from 'react-helmet';
    import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
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
    import ModuleManagement from '@/components/pages/ModuleManagement';
    import Login from '@/components/auth/Login';
    import SignUp from '@/components/auth/SignUp';
    import SignUpSuperAdmin from '@/components/auth/SignUpSuperAdmin';
    import SocialMedia from '@/components/pages/SocialMedia';
    import PaidTraffic from '@/components/pages/PaidTraffic';
    import ClientFieldPermissions from '@/components/pages/ClientFieldPermissions';
    import MetaIntegrationHelp from '@/components/pages/MetaIntegrationHelp';
    import PrivacyPolicy from '@/components/pages/PrivacyPolicy';
    import TermsOfService from '@/components/pages/TermsOfService';
    import DataDeletion from '@/components/pages/DataDeletion';
    import MetaAdsReporter from '@/components/pages/MetaAdsReporter';
    import PerformanceReport from '@/components/pages/PerformanceReport';
    import PGMPanel from '@/components/pages/PGMPanel';
    import Onboarding from '@/components/pages/Onboarding';
    import MarketingDiagnostic from '@/components/pages/MarketingDiagnostic';
import DiagnosticLeads from '@/components/admin/DiagnosticLeads';
import PublicClientChat from '@/components/pages/PublicClientChat';
import ApexIAAuthenticated from '@/components/pages/ApexIAAuthenticated';
import ClientLogin from '@/components/auth/ClientLogin';
import ProtectedClientRoute from '@/components/auth/ProtectedClientRoute';
import ProtectedClientPageRoute from '@/components/auth/ProtectedClientPageRoute';
import ClientSupport from '@/components/pages/ClientSupport';
import ClientCadastroSemanal from '@/components/pages/ClientCadastroSemanal';
import ClientCadastros from '@/components/pages/ClientCadastros';
import ClientCampaignsStatus from '@/components/pages/ClientCampaignsStatus';
import ClientAreaPanel from '@/components/pages/ClientAreaPanel';
import TrafficWeekly from '@/components/pages/TrafficWeekly';
import AssistantHome from '@/components/pages/AssistantHome';
import SelectClient from '@/components/pages/SelectClient';
import ClientChat from '@/components/pages/ClientChat';
import GeneralChat from '@/components/pages/GeneralChat';
import TestImageModels from '@/components/pages/TestImageModels';
import AILearningDashboard from '@/components/pages/AILearningDashboard';
import ClientCRM from '@/components/pages/ClientCRM';
    import AiAgentsManager from '@/components/pages/AiAgentsManager';
    import ChatLimitsManager from '@/components/pages/ChatLimitsManager';
    import ChatLauncher from '@/components/pages/ChatLauncher';
    import WhatsAppSettings from '@/components/pages/WhatsAppSettings';

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

    const PublicPages = () => (
      <>
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/terms-of-service" element={<TermsOfService />} />
        <Route path="/data-deletion" element={<DataDeletion />} />
        <Route path="/diagnostico" element={<MarketingDiagnostic />} />
        {/* Rotas públicas do ApexIA (acesso via link) - MANTIDAS */}
        <Route path="/chat/:clientId" element={<PublicClientChat />} />
        <Route path="/chat/:clientId/:sessionId" element={<PublicClientChat />} />
        <Route path="/chat-launcher" element={<ChatLauncher />} />
        {/* Nova rota de login para clientes */}
        <Route path="/login-cliente" element={<ClientLogin />} />
      </>
    );

    function App() {
      const { session, profile, loading: authLoading } = useAuth();
      const navigate = useNavigate();

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
        if (!authLoading && session && profile?.role === 'cliente' && profile?.cliente_id) {

          // Para HashRouter, o path está no hash
          const hash = window.location.hash;
          const currentPath = hash ? hash.replace('#', '') : window.location.pathname;
          
          // Lista de rotas permitidas para clientes
          const allowedPaths = ['/apexia', '/chat', '/login-cliente', '/cliente'];
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
      }, [session, profile, authLoading, navigate]);

      if (authLoading) {
        return (
          <div className="flex flex-col w-full h-screen items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
            <p>Carregando...</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Se demorar, recarregue a página</p>
          </div>
        );
      }

      return (
        <>
          <Helmet>
            <title>JB APEX - Sistema de Gestão Inteligente</title>
            <meta name="description" content="JB APEX é uma plataforma de gestão inteligente, projetada para otimizar o controle de clientes, projetos, tarefas e solicitações." />
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="true" />
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Poppins:wght@400;500;600;800&display=swap" rel="stylesheet" />
          </Helmet>
          <Routes>
            {PublicPages()}

            {session ? (
              profile?.role === 'cliente' && profile?.cliente_id ? (
                <>
                  <Route path="/apexia" element={<ProtectedClientRoute><ProtectedClientPageRoute pageKey="apexia"><ApexIAAuthenticated /></ProtectedClientPageRoute></ProtectedClientRoute>} />
                  <Route path="/apexia/:sessionId" element={<ProtectedClientRoute><ProtectedClientPageRoute pageKey="apexia"><ApexIAAuthenticated /></ProtectedClientPageRoute></ProtectedClientRoute>} />
                  <Route path="/cliente" element={<ProtectedClientRoute><MainLayoutCliente /></ProtectedClientRoute>}>
                    <Route index element={<Navigate to="/cliente/support" replace />} />
                    <Route path="support" element={<ProtectedClientPageRoute pageKey="dashboard"><ClientSupport /></ProtectedClientPageRoute>} />
                    <Route path="trafego" element={<ProtectedClientPageRoute pageKey="trafego"><ClientCadastroSemanal /></ProtectedClientPageRoute>} />
                    <Route path="cadastros" element={<ClientCadastros />} />
                    <Route path="campaigns-status" element={<ProtectedClientPageRoute pageKey="campaigns-status"><ClientCampaignsStatus /></ProtectedClientPageRoute>} />
                    <Route path="pgm-panel" element={<ProtectedClientPageRoute pageKey="pgm-panel"><PGMPanel /></ProtectedClientPageRoute>} />
                    <Route path="crm" element={<Navigate to="/cliente/crm/leads" replace />} />
                    <Route path="crm/:tab" element={<ProtectedClientPageRoute pageKey="crm"><ClientCRM /></ProtectedClientPageRoute>} />
                  </Route>
                  <Route path="*" element={<Navigate to="/cliente/support" replace />} />
                </>
              ) : (
                <>
                  {/* Área do Cliente - Acessível por administradores (fora do MainLayout para abrir em tela cheia) */}
                  <Route path="/client-area" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']}><MainLayoutCliente /></ProtectedRoute>}>
                    <Route path="support" element={<ClientSupport />} />
                    <Route path="trafego" element={<ClientCadastroSemanal />} />
                    <Route path="traffic-weekly" element={<TrafficWeekly />} />
                    <Route path="cadastros" element={<ClientCadastros />} />
                    <Route path="campaigns-status" element={<ClientCampaignsStatus />} />
                    <Route path="pgm-panel" element={<PGMPanel />} />
                    <Route path="crm" element={<Navigate to="/client-area/crm/leads" replace />} />
                    <Route path="crm/:tab" element={<ClientCRM />} />
                    <Route index element={<Navigate to="/client-area/support" replace />} />
                  </Route>

                  <Route path="/" element={<MainLayout />}>
                    <Route index element={<Navigate to="/tasks/list" replace />} />
                    <Route path="dashboard" element={<Dashboard />} />
                    <Route path="clients" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="clients"><Clients /></ProtectedRoute>} />
                    <Route path="clients/:id" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="clients"><Clients /></ProtectedRoute>} />
                    
                    <Route path="projects" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="projects"><Projects /></ProtectedRoute>} />
                    <Route path="projects/new" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="projects"><Projects /></ProtectedRoute>} />
                    <Route path="projects/edit/:id" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="projects"><Projects /></ProtectedRoute>} />
                    <Route path="projects/:id/*" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="projects"><ProjectDetail /></ProtectedRoute>} />

                    <Route path="tasks" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="tasks"><Navigate to="/tasks/list" replace /></ProtectedRoute>} />
                    <Route path="tasks/:view" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="tasks"><Tasks /></ProtectedRoute>} />
                    <Route path="tasks/:view/:id" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="tasks"><Tasks /></ProtectedRoute>} />
                    
                    <Route path="requests" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']} requiredModule="requests"><Requests /></ProtectedRoute>} />
                    <Route path="social-media" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="social_media"><SocialMedia /></ProtectedRoute>} />
                    <Route path="paid-traffic" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="paid_traffic"><PaidTraffic /></ProtectedRoute>} />
                    <Route path="meta-reporter" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="paid_traffic"><MetaAdsReporter /></ProtectedRoute>} />
                    <Route path="reports" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']} requiredModule="reports"><PerformanceReport /></ProtectedRoute>} />
                    <Route path="pgm-panel" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']}><PGMPanel /></ProtectedRoute>} />
                    <Route path="traffic-weekly" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']}><TrafficWeekly /></ProtectedRoute>} />
                    <Route path="onboarding" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']}><Onboarding /></ProtectedRoute>} />
                    <Route path="assistant" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']}><AssistantHome /></ProtectedRoute>} />
                    <Route path="assistant/select-client" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']}><SelectClient /></ProtectedRoute>} />
                    <Route path="assistant/client/:clientId" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']}><ClientChat /></ProtectedRoute>} />
                    <Route path="assistant/general" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']}><GeneralChat /></ProtectedRoute>} />
                    <Route path="assistant/learning" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']}><AILearningDashboard /></ProtectedRoute>} />
                    <Route path="settings" element={<Settings />} />
                    <Route path="settings/whatsapp" element={<ProtectedRoute allowedRoles={['superadmin', 'admin', 'colaborador']}><WhatsAppSettings /></ProtectedRoute>} />
                    <Route path="super-admin/diagnostic-leads" element={<ProtectedRoute allowedRoles={['superadmin']}><DiagnosticLeads /></ProtectedRoute>} />
                    <Route path="super-admin/ai-agents" element={<ProtectedRoute allowedRoles={['superadmin']}><AiAgentsManager /></ProtectedRoute>} />
                    <Route path="super-admin/chat-limits" element={<ProtectedRoute allowedRoles={['superadmin']}><ChatLimitsManager /></ProtectedRoute>} />
                    <Route path="test-image-models" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><TestImageModels /></ProtectedRoute>} />
                    <Route path="super-admin/*" element={<ProtectedRoute allowedRoles={['superadmin']}><SuperAdmin /></ProtectedRoute>} />
                    <Route path="meta-integration-help" element={<ProtectedRoute allowedRoles={['superadmin', 'admin']}><MetaIntegrationHelp /></ProtectedRoute>} />
                    
                    <Route path="*" element={<Navigate to="/tasks/list" replace />} />
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