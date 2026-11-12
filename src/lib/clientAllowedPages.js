/**
 * Páginas Permitidas do login da loja (Super Admin → Usuários de cliente → Permissões).
 * Atendimento é opt-in nesta lista: null = as páginas clássicas, sem inbox,
 * salvo a Ápice (quem já via continua).
 */
import { hasAtendimentoPagePermission } from './atendimentoLojaAcesso.js';

export const ATENDIMENTO_PAGE_KEY = 'atendimento';

export const CLIENT_STANDARD_PAGE_KEYS = [
  'dashboard',
  'campaigns-status',
  'apexia',
  'pgm-panel',
  'crm',
];

export const CLIENT_PAGES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'campaigns-status', label: 'Status das Campanhas' },
  { key: 'apexia', label: 'ApexIA' },
  { key: 'pgm-panel', label: 'Painel PGM' },
  { key: 'crm', label: 'CRM' },
  { key: ATENDIMENTO_PAGE_KEY, label: 'Atendimento' },
];

export const CLIENT_PAGE_KEYS = CLIENT_PAGES.map((page) => page.key);

function asKeyList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((key) => String(key || '').trim()).filter(Boolean);
}

export function hasAtendimentoInAllowedPages(allowedPages, clienteId) {
  return hasAtendimentoPagePermission(allowedPages, clienteId);
}

/** Acesso de um login cliente a uma página. Equipe interna não usa esta lista. */
export function clientHasPageAccess(profile, pageKey) {
  if (profile?.role !== 'cliente' || !profile?.cliente_id) return true;
  const key = String(pageKey || '').trim();
  if (!key) return true;
  if (key === ATENDIMENTO_PAGE_KEY) {
    return hasAtendimentoPagePermission(profile.allowed_pages, profile.cliente_id);
  }
  const allowed = profile.allowed_pages;
  if (allowed === null || allowed === undefined) return true;
  if (Array.isArray(allowed)) return allowed.includes(key);
  return true;
}

/**
 * Checkboxes ao abrir Permissões.
 * null = todas as clássicas; Atendimento só se a loja já tem (Ápice) ou se a lista já traz a chave.
 */
export function editorKeysFromAllowedPages(allowedPages, clienteId) {
  if (Array.isArray(allowedPages)) return asKeyList(allowedPages);
  const keys = [...CLIENT_STANDARD_PAGE_KEYS];
  if (hasAtendimentoPagePermission(null, clienteId)) keys.push(ATENDIMENTO_PAGE_KEY);
  return keys;
}

/** null continua sendo "todas as clássicas", sem inbox, para não liberar Atendimento sem o tick. */
export function allowedPagesValueToSave(keys) {
  const set = new Set(asKeyList(keys));
  const hasAtend = set.has(ATENDIMENTO_PAGE_KEY);
  const standardAll = CLIENT_STANDARD_PAGE_KEYS.every((key) => set.has(key));
  const extras = [...set].filter(
    (key) => key !== ATENDIMENTO_PAGE_KEY && !CLIENT_STANDARD_PAGE_KEYS.includes(key)
  );
  if (standardAll && !hasAtend && extras.length === 0) return null;
  return [...set];
}

export function describeAllowedPages(allowedPages, clienteId) {
  const keys = Array.isArray(allowedPages)
    ? asKeyList(allowedPages)
    : editorKeysFromAllowedPages(allowedPages, clienteId);
  if (!keys.length) return 'Nenhuma página';
  const saved = allowedPagesValueToSave(keys);
  if (saved === null) return 'Todas as páginas';
  if (CLIENT_PAGE_KEYS.every((key) => keys.includes(key))) return 'Todas as páginas';
  const labels = CLIENT_PAGES.filter((page) => keys.includes(page.key)).map((page) => page.label);
  const unknown = keys.filter((key) => !CLIENT_PAGE_KEYS.includes(key));
  return [...labels, ...unknown].join(', ') || 'Nenhuma página';
}
