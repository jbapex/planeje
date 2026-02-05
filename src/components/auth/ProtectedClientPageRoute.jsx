import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';

// Mapeamento de rotas para chaves de página
const ROUTE_TO_PAGE_KEY = {
  '/cliente/support': 'dashboard',
  '/cliente/trafego': 'trafego',
  '/cliente/campaigns-status': 'campaigns-status',
  '/apexia': 'apexia',
  '/cliente/pgm-panel': 'pgm-panel',
  '/cliente/cadastros': 'cadastros', // Página "Meus Dados" - sempre permitida para clientes
  '/cliente/crm': 'crm',
};

// Função helper para obter pageKey de uma rota
const getPageKeyFromPath = (pathname) => {
  // Verificar correspondência exata primeiro
  if (ROUTE_TO_PAGE_KEY[pathname]) {
    return ROUTE_TO_PAGE_KEY[pathname];
  }
  
  // Verificar correspondência parcial (para rotas com parâmetros)
  for (const [route, pageKey] of Object.entries(ROUTE_TO_PAGE_KEY)) {
    if (pathname.startsWith(route)) {
      return pageKey;
    }
  }
  
  return null;
};

const ProtectedClientPageRoute = ({ children, pageKey }) => {
  const auth = useAuth();
  const { user, profile, loading: authLoading, hasPageAccess } = auth || { loading: true };
  const location = useLocation();

  // Se o contexto não estiver disponível, mostrar loading
  if (!auth) {
    return (
      <div className="flex w-full h-screen items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mb-4"></div>
        <p className="ml-4">Carregando...</p>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="flex w-full h-screen items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mb-4"></div>
        <p className="ml-4">Carregando...</p>
      </div>
    );
  }

  // Verificar se é cliente autenticado
  const isClient =
    !!user && !!profile && profile.role === 'cliente' && !!profile.cliente_id;

  if (!isClient) {
    return <Navigate to="/login-cliente" replace />;
  }

  // Se não foi fornecido pageKey, tentar inferir da rota
  const effectivePageKey = pageKey || getPageKeyFromPath(location.pathname);

  // Se não conseguir mapear a rota, permite acesso (para páginas que não precisam de controle)
  if (!effectivePageKey) {
    return children;
  }

  // Verificar permissão de acesso à página
  if (!hasPageAccess(effectivePageKey)) {
    // Tentar redirecionar para a primeira página permitida
    const allowedPages = profile?.allowed_pages;
    let redirectPath = '/cliente/support'; // Fallback padrão
    
    if (Array.isArray(allowedPages) && allowedPages.length > 0) {
      // Encontrar a primeira página permitida e redirecionar para ela
      const firstAllowedPage = allowedPages[0];
      const pageToRoute = {
        'dashboard': '/cliente/support',
        'trafego': '/cliente/trafego',
        'campaigns-status': '/cliente/campaigns-status',
        'apexia': '/apexia',
        'pgm-panel': '/cliente/pgm-panel',
        'crm': '/cliente/crm',
        'api': '/cliente/crm',
        'canais': '/cliente/crm',
      };
      redirectPath = pageToRoute[firstAllowedPage] || '/cliente/support';
    } else if (allowedPages === null || allowedPages === undefined) {
      // Se todas as páginas estão permitidas, redirecionar para dashboard
      redirectPath = '/cliente/support';
    }
    
    return <Navigate to={redirectPath} replace />;
  }

  return children;
};

export default ProtectedClientPageRoute;
