/**
 * Regras de mudança de coluna no Kanban de tráfego pago (paid_campaigns).
 * O primeiro status (menor sort_order) é tratado como etapa inicial (ex.: planejamento).
 */

/** Valor `paid_campaign_statuses.value` da primeira coluna (ordenada por sort_order). */
export function getKanbanGateSourceStatusValue(statuses) {
  if (!Array.isArray(statuses) || statuses.length === 0) return 'planning';
  const sorted = [...statuses].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  return sorted[0]?.value || 'planning';
}

/**
 * Mudança que exige anúncio Meta vinculado: sair da primeira etapa para qualquer outra.
 */
export function kanbanMoveRequiresMetaLinkedAd(statuses, fromStatus, toStatus) {
  if (!fromStatus || !toStatus || fromStatus === toStatus) return false;
  const gate = getKanbanGateSourceStatusValue(statuses);
  return fromStatus === gate && toStatus !== gate;
}

/** Anúncio principal (primeiro ad do primeiro conjunto) com vínculo Meta utilizável. */
export function paidCampaignMainAdHasMetaLink(campaign) {
  const ad = campaign?.ad_sets?.[0]?.ads?.[0];
  const id = ad?.meta_ad_id;
  if (id == null || String(id).trim() === '') return false;
  if (ad.meta_ad_broken) return false;
  return true;
}

/**
 * Anúncio vinculado ao Meta mas sem veiculação ativa (pausado, arquivado, excluído na rede, vínculo quebrado, etc.).
 * Usa `meta_ad_status` (effective_status do Graph) gravado no anúncio.
 */
export function isMetaAdDeactivatedOnMeta(mainAd) {
  if (!mainAd?.meta_ad_id) return false;
  if (mainAd.meta_ad_broken) return true;
  const st = String(mainAd.meta_ad_status || '').trim().toUpperCase();
  if (!st) return false;
  if (st === 'ACTIVE') return false;
  return true;
}
