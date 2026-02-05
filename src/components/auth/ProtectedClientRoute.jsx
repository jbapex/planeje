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

  return children;
};

export default ProtectedClientRoute;
