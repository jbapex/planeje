import React from 'react';
import { toast } from '@/components/ui/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { supabase } from '@/lib/customSupabaseClient';

let sessionPromptOpen = false;

export function isSessionAuthError(message) {
  const m = String(message || '').toLowerCase();
  return (
    m.includes('sessão expirada') ||
    m.includes('sessao expirada') ||
    m.includes('token inválido') ||
    m.includes('token invalido') ||
    m.includes('não autorizado') ||
    m.includes('nao autorizado') ||
    m.includes('invalid jwt') ||
    m.includes('jwt expired') ||
    m.includes('unauthorized') ||
    m.includes('401')
  );
}

export async function reloginAfterSessionExpired() {
  await supabase.auth.signOut();
  window.location.href = '/#/login';
}

/** Toast persistente com ação — não desloga automaticamente. */
export function promptSessionRelogin(onReLogin = reloginAfterSessionExpired) {
  if (sessionPromptOpen) return;
  sessionPromptOpen = true;

  toast({
    variant: 'destructive',
    title: 'Sessão expirada',
    description: 'Sua sessão expirou. Faça login novamente para continuar.',
    duration: Infinity,
    action: (
      <ToastAction
        altText="Fazer login novamente"
        onClick={() => {
          sessionPromptOpen = false;
          onReLogin();
        }}
      >
        Fazer login novamente
      </ToastAction>
    ),
  });
}

export class SessionExpiredError extends Error {
  constructor(message = 'Sessão expirada. Faça login novamente.') {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

export function handlePossibleSessionError(message) {
  if (!isSessionAuthError(message)) return false;
  promptSessionRelogin();
  return true;
}
