/** Gasto do Relatório Meta: Insights das contas ligadas. Sem funil e sem envio CAPI. */

export function digitsCampaignId(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 5 ? digits : '';
}

export function campaignIdFromReportRow(row) {
  const td = row?.tracking_data && typeof row.tracking_data === 'object' ? row.tracking_data : {};
  const ad = td.meta_ad_details?.ad && typeof td.meta_ad_details.ad === 'object' ? td.meta_ad_details.ad : {};
  const candidates = [
    ad.campaign?.id,
    ad.campaign_id,
    td.meta_ad_details?.campaign_id,
    td.campaign_id,
    td.campaignId,
    td.utm_campaign_id,
    row?.campaign_id,
  ];
  for (const candidate of candidates) {
    const id = digitsCampaignId(candidate);
    if (id) return id;
  }
  return '';
}

export function normalizeCampaignName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function emptyRelatorioSpendIndex() {
  return {
    total: 0,
    byId: {},
    byName: {},
    errors: [],
    hasAdAccounts: false,
  };
}

export function buildRelatorioSpendIndex(insightRows = []) {
  const byId = {};
  const byName = {};
  let rowTotal = 0;
  (insightRows || []).forEach((row) => {
    const spend = Number(row?.spend) || 0;
    rowTotal += spend;
    const id = digitsCampaignId(row?.campaign_id || row?.campaignId || row?.id);
    const nameKey = normalizeCampaignName(row?.campaign_name || row?.campaignName);
    if (id) byId[id] = (byId[id] || 0) + spend;
    if (nameKey) byName[nameKey] = (byName[nameKey] || 0) + spend;
  });
  const idTotal = Object.values(byId).reduce((sum, value) => sum + (Number(value) || 0), 0);
  return {
    total: idTotal > 0 ? idTotal : rowTotal,
    byId,
    byName,
    errors: [],
    hasAdAccounts: true,
  };
}

export function spendForCampaign(index, { campaignId, campaignName } = {}) {
  const id = digitsCampaignId(campaignId);
  if (id && index?.byId && Object.prototype.hasOwnProperty.call(index.byId, id)) {
    return Number(index.byId[id]) || 0;
  }
  const nameKey = normalizeCampaignName(campaignName);
  if (nameKey && index?.byName && Object.prototype.hasOwnProperty.call(index.byName, nameKey)) {
    return Number(index.byName[nameKey]) || 0;
  }
  return 0;
}

function insightError(result) {
  return result?.error?.message || result?.data?.error?.message || null;
}

function insightRows(result) {
  return Array.isArray(result?.data?.campaigns) ? result.data.campaigns : [];
}

export async function fetchCrmRelatorioMetaSpend(invokeFn, { clienteId, adAccountIds, since, until }) {
  const ids = Array.isArray(adAccountIds) ? adAccountIds.filter(Boolean) : [];
  if (!ids.length) return emptyRelatorioSpendIndex();

  const results = await Promise.all(
    ids.map(async (adAccountId) => {
      const base = {
        action: 'get-campaign-insights',
        cliente_id: clienteId,
        ad_account_id: adAccountId,
        time_range: { since, until },
        limit: 500,
      };
      const attempts = [
        { ...base, metrics: ['spend', 'campaign_id', 'campaign_name'], level: 'campaign' },
        { ...base, metrics: ['spend'], level: 'campaign' },
        { ...base, metrics: ['spend'], level: 'account' },
      ];
      let lastError = null;
      for (const body of attempts) {
        const result = await invokeFn('meta-ads-api', { body });
        const rows = insightRows(result);
        if (rows.length) return { rows, error: null };
        lastError = insightError(result);
      }
      return { rows: [], error: lastError };
    }),
  );

  const rows = results.flatMap((row) => row.rows);
  const errors = results.map((row) => row.error).filter(Boolean);
  return {
    ...buildRelatorioSpendIndex(rows),
    errors,
    hasAdAccounts: true,
  };
}
