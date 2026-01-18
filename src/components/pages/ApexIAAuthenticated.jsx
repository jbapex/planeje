import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';

/**
 * ApexIAAuthenticated - Redireciona para rota pública com clientId do profile
 * 
 * Como o PublicClientChat já funciona bem e ambos os sistemas compartilham
 * os mesmos dados, este componente simplesmente redireciona para a rota
 * pública usando o clientId do profile autenticado.
 * 
 * A RLS (Row Level Security) garante que o cliente só veja seus próprios dados,
 * mesmo na rota pública, pois ele está autenticado.
 */
const ApexIAAuthenticated = () => {
  const { profile, loading: authLoading } = useAuth();
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (authLoading) {
      console.log('⏳ ApexIAAuthenticated: Aguardando carregamento do auth...');
      return;
    }

    console.log('🔍 ApexIAAuthenticated: Verificando profile...', {
      profile,
      role: profile?.role,
      cliente_id: profile?.cliente_id,
      sessionId
    });

    // Verificar se é cliente autenticado
    if (!profile || profile.role !== 'cliente' || !profile.cliente_id) {
      console.warn('⚠️ ApexIAAuthenticated: Profile inválido, redirecionando para login');
      navigate('/login-cliente', { replace: true });
      return;
    }

    // Redirecionar para rota pública com clientId do profile
    const clientId = profile.cliente_id;
    const targetPath = sessionId ? `/chat/${clientId}/${sessionId}` : `/chat/${clientId}`;
    
    console.log('✅ ApexIAAuthenticated: Redirecionando para', targetPath);
    
    if (sessionId) {
      navigate(`/chat/${clientId}/${sessionId}`, { replace: true });
    } else {
      navigate(`/chat/${clientId}`, { replace: true });
    }
    
    setMounted(true);
  }, [profile, authLoading, navigate, sessionId]);

  // Mostrar loading enquanto redireciona
  if (!mounted || authLoading) {
    return (
      <div className="flex w-full h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Carregando ApexIA...</p>
        </div>
      </div>
    );
  }

  return null;
};

export default ApexIAAuthenticated;
