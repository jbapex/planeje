/**
 * Atendimento da loja: login cliente com a página Atendimento permitida.
 * Padrão: Ápice (allowed_pages nulo). Super Admin liga outras no tick
 * de Permissões do login. O nível vem de cliente_atend_membros;
 * sem membros na loja, o login cliente vale como admin implícito.
 * IA automática não usa este gate.
 */
import { hasAtendimentoPagePermission } from './atendimentoLojaAcesso.js';

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

/** True para papel cliente com a página Atendimento. E-mail não conta. */
export function canSeeAtendimentoPreview(profile, lojaHabilitada) {
  if (!profile || typeof profile !== 'object') return false;
  if (profile.role !== 'cliente') return false;
  return hasAtendimentoPagePermission(profile.allowed_pages, profile.cliente_id, lojaHabilitada);
}

/** Destino se alguém sem gate abrir a rota. */
export function atendimentoPreviewFallbackPath(profile) {
  if (profile?.role === 'cliente' && profile?.cliente_id) return '/cliente/support';
  return '/';
}
