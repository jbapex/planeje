import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const ProtectedClientRoute = ({ children }) => {
  const auth = useAuth();
  const { user, profile, loading: authLoading } = auth || { loading: true };

  // Se o contexto não estiver disponível, mostrar loading
  if (!auth) {
    return (
      <div className="flex w-full h-screen items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mb-4"></div>
        <p className="ml-4">Carregando...</p>
      </div>
    );
  }

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/72aa0069-2fbf-413e-a858-b1b419cc5e13', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: 'debug-session',
      runId: 'initial',
      hypothesisId: 'H2',
      location: 'ProtectedClientRoute.jsx:render',
      message: 'ProtectedClientRoute render',
      data: {
        authLoading,
        hasUser: !!user,
        hasProfile: !!profile,
        role: profile?.role || null,
        hasClienteId: !!profile?.cliente_id,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion agent log

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

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/72aa0069-2fbf-413e-a858-b1b419cc5e13', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: 'debug-session',
      runId: 'initial',
      hypothesisId: 'H3',
      location: 'ProtectedClientRoute.jsx:isClientCheck',
      message: 'Client access check',
      data: { isClient },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion agent log

  if (!isClient) {
    return <Navigate to="/login-cliente" replace />;
  }

  return children;
};

export default ProtectedClientRoute;
