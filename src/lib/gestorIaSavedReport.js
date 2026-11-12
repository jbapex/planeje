import { AD_THUMBNAIL_BUCKET, rewriteStoredThumbUrl, thumbnailAssetKey } from './adThumbnail.js';
import { buildPerformanceReport, dateRange, formatCount, formatMoney, isMetricVisible, periodLabels, REPORT_METRICS,
  reportAccountTotals, reportMetricNumber, resultCount, unitCost } from './trafficPerformanceReport.js';

const unavailable = {
  NO_ACCOUNTS: 'Vincule uma conta Meta ao cliente para montar o relatório.',
  NO_READING: 'Sem medições salvas neste recorte. Escolha um período com dados ou atualize a conta em Métricas.',
  NO_COMMON_PERIOD: 'As contas têm recortes salvos diferentes. Selecione uma conta ou um período em comum.',
  MIXED_CURRENCY: 'As contas usam moedas diferentes. Monte um relatório por conta.',
};

export async function loadSavedReportAccounts(db, clientId) {
  const accounts = new Map();
  for (let offset = 0;;) {
    const { data, error } = await db.from('cliente_meta_accounts').select('meta_account_id,meta_account_name')
      .eq('cliente_id', clientId).eq('is_active', true).order('id').range(offset, offset + 499);
    if (error || !Array.isArray(data)) throw new Error('Contas vinculadas indisponíveis.');
    if (!data.length) return [...accounts.values()];
    for (const { meta_account_id: raw, meta_account_name: name } of data) {
      if (typeof raw !== 'string' || !raw.trim()) continue;
      const id = `act_${raw.trim().replace(/^act_/, '')}`;
      if (!accounts.has(id)) accounts.set(id, { id, name: name || id });
    }
    offset += data.length;
  }
}

async function attachSavedThumbnails(db, report) {
  const ids = [...new Set([...report.campaigns.flatMap(({ creatives }) => creatives), ...report.gallery.flat()].map(({ id }) => id))];
  const keys = ids.map(thumbnailAssetKey).filter(Boolean);
  if (!keys.length) return report;
  const sources = new Map();
  for (let offset = 0; offset < keys.length; offset += 100) {
    const { data, error } = await db.from('meta_ad_thumbnails').select('asset_key,storage_path').in('asset_key', keys.slice(offset, offset + 100));
    if (error || !Array.isArray(data)) continue;
    for (const { asset_key, storage_path } of data) {
      const match = /^ad_(\d{5,32})\.(jpg|png|webp|gif)$/.exec(storage_path || '');
      if (!match || asset_key !== `ad:${match[1]}`) continue;
      const { data: asset } = db.storage.from(AD_THUMBNAIL_BUCKET).getPublicUrl(storage_path);
      if (asset?.publicUrl) sources.set(asset_key, rewriteStoredThumbUrl(asset.publicUrl));
    }
  }
  const paint = (ad) => ({ ...ad, thumbnailUrl: sources.get(thumbnailAssetKey(ad.id)) || '' });
  return { ...report, campaigns: report.campaigns.map((campaign) => ({ ...campaign, creatives: campaign.creatives.map(paint) })),
    gallery: report.gallery.map((page) => page.map(paint)) };
}

export function savedReportComparisonRows(report, visible) {
  if (!report?.comparison) return [];
  const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 2 });
  const delta = new Intl.NumberFormat('pt-BR', { style: 'percent', signDisplay: 'exceptZero', maximumFractionDigits: 1 });
  const valueLabel = (value, key) => value === null ? '—' : key === 'ctr' ? percent.format(value)
    : ['spend','cost','cpc'].includes(key) ? formatMoney(value, report.currency) : formatCount(value);
  return REPORT_METRICS.filter(({ key }) => isMetricVisible(visible, key)).map(({ key, label }) => {
    const current = reportMetricNumber(report.totals, key);
    const prior = reportMetricNumber(report.comparison.totals, key);
    return { key, label: key === 'result' ? report.result.label : key === 'cost' ? report.result.costLabel : label,
      current: valueLabel(current, key), previous: valueLabel(prior, key),
      change: current !== null && prior > 0 ? delta.format((current - prior) / prior) : '—' };
  });
}

export async function loadSavedGestorMetaReport(db, { clientId, clientName, period, accountId, linkedAccounts = [], compare = false, includeCreatives = true }) {
  const { data, error } = await db.functions.invoke('gestor-ia-meta', { body: { action: 'get-gestor-report-reading', cliente_id: clientId,
    ...(accountId && { ad_account_id: accountId }), ...(compare && { compare: true }), time_range: { since: period.since, until: period.until } } });
  if (error || data?.error) throw new Error(error?.context?.status === 403 ? 'Acesso ao relatório salvo indisponível.' : 'Não foi possível consultar a leitura salva do relatório.');
  if (data?.report === null && Object.hasOwn(unavailable, data.reason)) return { note: unavailable[data.reason] };
  const snapshot = data?.report;
  const range = dateRange(snapshot?.period?.since, snapshot?.period?.until);
  if (!range || range.since < period.since || range.until > period.until || !/^[A-Z]{3}$/.test(snapshot.currency || '') ||
      !Array.isArray(snapshot.accounts) || !snapshot.accounts.length || !Array.isArray(snapshot.missingAccounts) || !Array.isArray(snapshot.accountRows) ||
      snapshot.accountRows.length !== snapshot.accounts.length || !Array.isArray(snapshot.campaignRows) || !Array.isArray(snapshot.adRows)) {
    throw new Error('A leitura salva não retornou um relatório válido.');
  }

  const nameFor = (id) => linkedAccounts.find((account) => account.id === id)?.name;
  const noReading = snapshot.missingAccounts.length;
  const namesWithoutReading = snapshot.missingAccounts.map(nameFor).filter(Boolean);
  const partialDays = snapshot.accounts.some(({ missingDays }) => missingDays > 0);
  const exact = range.since === period.since && range.until === period.until;
  const linksCount = snapshot.accounts.length + noReading;
  const span = periodLabels(range);
  const oldest = snapshot.accounts.map(({ fetchedAt }) => Date.parse(fetchedAt)).sort((a, b) => a - b)[0];
  const readAt = Number.isFinite(oldest) ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(oldest) : '';
  const scope = accountId ? nameFor(accountId) || 'Conta selecionada' : `${snapshot.accounts.length} de ${linksCount} contas`;
  const previous = snapshot.comparison;
  const previousRange = compare && dateRange(previous?.period?.since, previous?.period?.until);
  const comparable = previousRange && previousRange.until < range.since && Array.isArray(previous.accountRows) &&
    previous.accountRows.length === snapshot.accountRows.length;
  const notes = [
    noReading && (namesWithoutReading.length === noReading ? `Sem leitura salva em ${namesWithoutReading.join(', ')}.` : `${noReading} conta(s) sem leitura salva no recorte.`),
    partialDays && 'Série com lacunas. Os totais somam os dias disponíveis.',
    snapshot.campaignsPartial && 'Detalhamento parcial de campanhas.',
    includeCreatives && snapshot.adsPartial && 'Detalhamento parcial de anúncios.',
    compare && !comparable && 'Período anterior sem leitura comparável.',
  ].filter(Boolean);
  const savedMeta = { scope, caption: `Meta Ads · Leitura salva · ${scope} · ${span.start} a ${span.end}${readAt ? ` · Leitura mais antiga em ${readAt}` : ''}`,
    notes, exact, adsPartial: snapshot.adsPartial === true };

  const canReadClientSales = !accountId && !noReading && !partialDays && snapshot.currency === 'BRL';
  const [settings, sales] = await Promise.all([
    db.from('traffic_weekly_settings').select('result_label').eq('client_id', clientId).maybeSingle(),
    canReadClientSales ? db.from('crm_vendas').select('valor_total, data_venda').eq('cliente_id', clientId)
      .gte('data_venda', range.since).lte('data_venda', range.until) : null,
  ]);
  const report = buildPerformanceReport({ clientName, range, savedMeta, currency: snapshot.currency,
    accountRows: snapshot.accountRows, campaignRows: snapshot.campaignRows, adRows: includeCreatives ? snapshot.adRows : [],
    resultLabel: settings.data?.result_label || '', vendas: sales?.data || [] });
  if (comparable) {
    const totals = reportAccountTotals(previous.accountRows, true);
    const result = resultCount(totals, report.result.key);
    report.comparison = { range: previousRange, totals: { ...totals, result, cost: unitCost(totals.spend, result) } };
  }
  return { report: await attachSavedThumbnails(db, report) };
}
