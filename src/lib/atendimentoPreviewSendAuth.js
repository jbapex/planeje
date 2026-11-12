/**
 * Autorização de envio no Atendimento da loja (página atendimento + nível).
 * Espelhada em supabase/functions/_shared/atendimentoLojaAcesso.ts
 */

export { canClienteSendAtendimento } from './atendimentoLojaAcesso.js';

/** Equipe interna (caminho já existente). */
export function isAtendimentoInternalSenderRole(role) {
  return ['superadmin', 'admin', 'colaborador'].includes(String(role || ''));
}
