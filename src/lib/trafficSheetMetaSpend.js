import { campaignDraft, shiftDate } from './trafficWeeklyReview.js';
import { metaCatalogAccountKey, normalizeSheetName } from './trafficSheetCatalog.js';

async function defaultInvoke(name, options) {
  const { supabase } = await import('./customSupabaseClient.js');
  return supabase.functions.invoke(name, options);
}

/** Período da semana da rotina (segunda a domingo). */
export function weekSpendRange(weekStart) {
  const since = String(weekStart || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) return null;
  return { since, until: shiftDate(since, 6) };
}

export function insightSpend(adset) {
  const nested = adset?.insights;
  const row = Array.isArray(nested?.data) ? nested.data[0] : Array.isArray(nested) ? nested[0] : nested?.data || null;
  if (row == null || row.spend == null || row.spend === '') return null;
  const n = Number(String(row.spend).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function formatSpendInput(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function readAdsets(data) {
  if (Array.isArray(data?.adsets)) return data.adsets;
  if (Array.isArray(data?.data?.adsets)) return data.data.adsets;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function nameKey(campaign, adset) {
  return `${normalizeSheetName(campaign)}|${normalizeSheetName(adset)}`;
}

function newRowId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `row-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Índice só por conjunto (nunca total da campanha). */
export function buildAdsetSpendIndex(adsets = []) {
  const byId = new Map();
  const byName = new Map();
  const list = [];
  for (const adset of adsets || []) {
    const spend = insightSpend(adset);
    if (spend == null) continue;
    const id = String(adset.id || '').trim();
    const campaignId = String(adset.campaign_id || '').trim();
    const campaignName = String(adset.campaign_name || adset.campaign?.name || '').trim();
    const adsetName = String(adset.name || '').trim();
    if (id) byId.set(id, spend);
    if (adsetName) {
      byName.set(nameKey(campaignId, adsetName), spend);
      if (campaignName) byName.set(nameKey(campaignName, adsetName), spend);
    }
    list.push({
      id,
      name: adsetName,
      campaign_id: campaignId,
      campaign_name: campaignName,
      spend,
      raw: adset,
    });
  }
  return { byId, byName, list };
}

export function lookupRowSpend(row, index) {
  if (!row || !index) return null;
  const adsetId = String(row.adset_id || '').trim();
  const adsetName = String(row.adset_name || '').trim();
  if (!adsetId && !adsetName) return null;
  if (adsetId && index.byId.has(adsetId)) return index.byId.get(adsetId);
  const campaignId = String(row.campaign_id || '').trim();
  const campaignName = String(row.campaign_name || '').trim();
  if (adsetName && campaignId && index.byName.has(nameKey(campaignId, adsetName))) {
    return index.byName.get(nameKey(campaignId, adsetName));
  }
  if (adsetName && campaignName && index.byName.has(nameKey(campaignName, adsetName))) {
    return index.byName.get(nameKey(campaignName, adsetName));
  }
  return null;
}

function adsetsForCampaignRow(index, row, matchById = false) {
  const campaignId = String(row.campaign_id || '').trim();
  const campaignName = normalizeSheetName(row.campaign_name);
  return (index.list || []).filter((item) => {
    if (matchById) return Boolean(campaignId && item.campaign_id === campaignId);
    if (campaignId && item.campaign_id === campaignId) return true;
    if (campaignName && normalizeSheetName(item.campaign_name) === campaignName) return true;
    // get-adsets costuma trazer só campaign_id; casa pelo id da linha
    return Boolean(campaignId && item.campaign_id === campaignId);
  });
}

/**
 * Preenche Gasto R$ do conjunto.
 * - Linha com campanha + conjunto: só preenche o gasto daquele conjunto.
 * - Linha só com campanha: abre um conjunto por linha (com gasto no período).
 */
export function applyWeekSpendToRows(rows = [], index, { overwrite = false, matchById = false } = {}) {
  let filled = 0;
  let skipped = 0;
  let missing = 0;
  let expanded = 0;
  let needAdset = 0;
  const next = [];

  for (const row of rows || []) {
    if ((row.platform || 'meta') !== 'meta') {
      next.push(row);
      continue;
    }
    const hasCampaign = String(row.campaign_id || row.campaign_name || '').trim();
    const hasAdset = String(row.adset_id || row.adset_name || '').trim();
    if (!hasCampaign && !hasAdset) {
      next.push(row);
      continue;
    }

    if (!hasAdset) {
      const children = adsetsForCampaignRow(index, row, matchById);
      if (!children.length) {
        needAdset += 1;
        missing += 1;
        next.push(row);
        continue;
      }
      for (const item of children) {
        expanded += 1;
        filled += 1;
        next.push(campaignDraft({
          ...row,
          id: newRowId(),
          campaign_id: item.campaign_id || row.campaign_id,
          campaign_name: row.campaign_name || item.campaign_name,
          adset_id: item.id,
          adset_name: item.name,
          spend: formatSpendInput(item.spend),
        }));
      }
      continue;
    }

    const spend = lookupRowSpend(row, index);
    if (spend == null) {
      missing += 1;
      next.push(row);
      continue;
    }
    const has = String(row.spend ?? '').trim() !== '';
    if (has && !overwrite) {
      skipped += 1;
      next.push(row);
      continue;
    }
    filled += 1;
    next.push({ ...row, spend: formatSpendInput(spend) });
  }

  return { rows: next, filled, skipped, missing, expanded, needAdset };
}

async function invokeAdsets({ accountId, campaignId, since, until, invoke }) {
  const body = {
    action: 'get-adsets',
    time_range: { since, until },
    metrics: ['spend'],
  };
  if (campaignId) body.campaignId = campaignId;
  else {
    const digits = metaCatalogAccountKey(accountId);
    body.adAccountId = digits ? `act_${digits}` : accountId;
  }
  const { data, error } = await invoke('meta-ads-api', { body });
  if (error) throw error;
  if (data?.error) {
    const message = data.error.message || data.error.error_user_msg || 'Não foi possível ler o gasto na Meta.';
    const err = new Error(message);
    err.code = data.error.code;
    throw err;
  }
  return readAdsets(data);
}

/**
 * Busca gasto dos conjuntos no período (por campanha da planilha).
 */
export async function fetchMetaWeekAdsetSpend(rows = [], { since, until, invoke = defaultInvoke } = {}) {
  if (!since || !until) throw new Error('Informe o período da semana.');
  const metaRows = (rows || []).filter((row) => (row.platform || 'meta') === 'meta' && String(row.account_id || '').trim());
  if (!metaRows.length) throw new Error('Informe a conta Meta na tabela.');

  const byAccount = new Map();
  for (const row of metaRows) {
    const key = metaCatalogAccountKey(row.account_id);
    if (!key) continue;
    if (!byAccount.has(key)) byAccount.set(key, { accountId: key, campaignIds: new Set() });
    const campaignId = String(row.campaign_id || '').trim();
    if (campaignId) byAccount.get(key).campaignIds.add(campaignId);
  }

  const merged = [];
  for (const { accountId, campaignIds } of byAccount.values()) {
    const ids = [...campaignIds];
    if (!ids.length) {
      throw new Error('Escolha a campanha na lista (para achar o ID) e o conjunto, ou só a campanha para puxar os conjuntos dela.');
    }
    for (const campaignId of ids) {
      const list = await invokeAdsets({ accountId, campaignId, since, until, invoke });
      for (const adset of list) merged.push(adset);
    }
  }
  return buildAdsetSpendIndex(merged);
}

export function spendPullMessage(result, periodLabel) {
  const period = periodLabel || 'este período';
  if (!result) return '';
  if (result.expanded) {
    return `Gasto da Meta · ${period}: trouxe ${result.expanded} conjunto(s) com gasto. Pode editar qualquer valor.`;
  }
  if (result.filled || result.skipped) {
    if (result.skipped && result.filled === 0) {
      return `Gasto da Meta · ${period}: as linhas já tinham valor. Pode editar ou substituir.`;
    }
    if (result.skipped) {
      return `Gasto da Meta · ${period}: preencheu ${result.filled} conjunto(s). ${result.skipped} já tinham valor — pode editar ou substituir.`;
    }
    return `Gasto da Meta · ${period}: preencheu ${result.filled} conjunto(s). Pode editar qualquer valor.`;
  }
  if (result.needAdset) {
    return `Não achei conjunto com gasto neste período (${period}) para a campanha. Confira se veiculou nesta semana, ou escolha o conjunto na lista.`;
  }
  if (result.missing) {
    return `Nenhum gasto de conjunto neste período (${period}). Confira o nome do conjunto ou se veiculou nesta semana.`;
  }
  return 'Informe a campanha e o conjunto (ou só a campanha para puxar os conjuntos dela).';
}
