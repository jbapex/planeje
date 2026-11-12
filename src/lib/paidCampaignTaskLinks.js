import { tryUuid } from './centralTrafego.js';

export const PAID_CAMPAIGN_SELECT_WITH_LINKS =
  '*, clientes(id, empresa), profiles!assignee_id(id, full_name, avatar_url), paid_campaign_task_links(task_id, relation_type, created_at)';

export const PAID_CAMPAIGN_SELECT_LEGACY =
  '*, clientes(id, empresa), profiles!assignee_id(id, full_name, avatar_url)';

/** Tarefa principal da campanha: ordem determinística de relation_type. */
export const PRIMARY_CAMPAIGN_LINK_ORDER = [
  'origin',
  'legacy',
  'linked',
  'affects',
  'review_24h',
  'review_72h',
];

export function legacyTaskIdsFromAdSets(campaign) {
  const ids = [];
  for (const set of campaign?.ad_sets || []) {
    for (const ad of set?.ads || []) {
      const id = tryUuid(ad?.task_id);
      if (id) ids.push(id);
    }
  }
  return [...new Set(ids)];
}

export function sortCampaignTaskLinks(links) {
  return [...(links || [])]
    .map((l) => ({
      ...l,
      task_id: tryUuid(l?.task_id),
    }))
    .filter((l) => l.task_id)
    .sort((a, b) => {
      const ia = PRIMARY_CAMPAIGN_LINK_ORDER.indexOf(a.relation_type);
      const ib = PRIMARY_CAMPAIGN_LINK_ORDER.indexOf(b.relation_type);
      const ra = ia < 0 ? PRIMARY_CAMPAIGN_LINK_ORDER.length : ia;
      const rb = ib < 0 ? PRIMARY_CAMPAIGN_LINK_ORDER.length : ib;
      if (ra !== rb) return ra - rb;
      const ca = String(a.created_at || '');
      const cb = String(b.created_at || '');
      if (ca !== cb) return ca.localeCompare(cb);
      return String(a.task_id).localeCompare(String(b.task_id));
    });
}

export function linkedTaskIdsFromNormalized(campaign) {
  return [...new Set(sortCampaignTaskLinks(campaign?.paid_campaign_task_links).map((l) => l.task_id))];
}

/** Tabela normalizada primeiro; JSON legado só como fallback. Não grava a ligação principal no JSON. */
export function resolveCampaignTaskIds(campaign) {
  const normalized = linkedTaskIdsFromNormalized(campaign);
  if (normalized.length) return normalized;
  return legacyTaskIdsFromAdSets(campaign);
}

export function resolvePrimaryCampaignTaskId(campaign) {
  const sorted = sortCampaignTaskLinks(campaign?.paid_campaign_task_links);
  if (sorted.length) return sorted[0].task_id;
  return legacyTaskIdsFromAdSets(campaign)[0] || null;
}
