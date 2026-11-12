import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAtendimentoLojaMembro } from '@/hooks/useAtendimentoLojaMembro';

/** Usuário da loja que não é administrador (supervisor/atendente/inativo) não abre esta página. */
export default function LojaAdminOnlyRoute({ children }) {
  const { gate, loading, membro, nivel } = useAtendimentoLojaMembro();
  if (!gate) return children;
  if (loading) return null;
  if (membro && nivel !== 'admin') return <Navigate to="/cliente/atendimento" replace />;
  return children;
}
