/** Normaliza valor de status (acentos, caixa, _) para comparar com a config do dashboard. */
export function normalizeDashboardStatusKey(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[\s_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/** Chaves padrão do funil: A Fazer, Produção, Revisão, Alteração, Josias, Aprovar cliente (não “aguardando aprovação”). */
export const DEFAULT_PIPELINE_STATUS_KEYS = new Set([
  'todo',
  'a_fazer',
  'production',
  'em_producao',
  'producao',
  'review',
  'em_revisao',
  'revisao',
  'alteracao',
  'josias',
  'approve',
  'aprovar_cliente',
]);

/** Nunca entra em Atrasadas / Próximas (mesmo se estiver em overdueInclude). */
const PIPELINE_HARD_EXCLUDE_KEYS = new Set(['aguardando_aprovacao']);

/**
 * Tarefa entra em Atrasadas / Próximas (e alertas de atraso) quando está nesse funil.
 * `overdueExclude` continua excluindo; `overdueInclude` não vazio restringe aos valores escolhidos.
 */
export function taskCountsInOverdueAndUpcomingPipeline(status, dashboardConfig) {
  const st = String(status || '');
  if (!st) return false;
  const nk = normalizeDashboardStatusKey(st);
  if (PIPELINE_HARD_EXCLUDE_KEYS.has(nk)) return false;

  const exclude = dashboardConfig?.overdueExclude || [];
  if (exclude.includes(st)) return false;

  const include = dashboardConfig?.overdueInclude;
  if (Array.isArray(include) && include.length > 0) {
    return include.some((v) => normalizeDashboardStatusKey(v) === nk);
  }

  return DEFAULT_PIPELINE_STATUS_KEYS.has(nk);
}
