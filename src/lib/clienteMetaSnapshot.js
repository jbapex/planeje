import { startOfMonth } from 'date-fns';
import { supabase } from '@/lib/customSupabaseClient';
import { formatMoney, normalizeAccountInsights } from './trafegoFila.js';
import { isMetaRateLimited, previousHasMetaSignal, shouldKeepPreviousMeta, shouldPersistMetaSnapshot } from './trafegoHojeCache.js';

export const META_SNAPSHOT_VERSION = 2;
/** Snapshot de carteira: depois disso, Dashboard/Situação buscam a Meta de novo. */
export const META_RESUMO_STALE_MS = 10 * 60 * 1000;

const DELIVERY_LABEL = {
  ACTIVE: 'No ar',
  PAUSED: 'Pausada',
  CAMPAIGN_PAUSED: 'Pausada',
  ADSET_PAUSED: 'Pausada',
  DISAPPROVED: 'Reprovada',
  PENDING_REVIEW: 'Em análise',
  PENDING_BILLING_INFO: 'Sem pagamento',
  WITH_ISSUES: 'Com problemas',
  ARCHIVED: 'Arquivada',
  DELETED: 'Excluída',
};

const DELIVERY_INFO_LABEL = {
  ACTIVE: 'No ar',
  LEARNING: 'Aprendizado',
  LEARNING_LIMITED: 'Aprendizado limitado',
  INACTIVE: 'Inativo',
  NOT_DELIVERING: 'Não veicula',
  NOT_PUBLISHED: 'Não publicado',
  ERROR: 'Erro',
  PENDING_REVIEW: 'Em análise',
  SCHEDULED: 'Agendado',
  REJECTED: 'Reprovado',
  COMPLETED: 'Encerrado',
  LIMITED: 'Limitado',
};

function issuesList(item) {
  const raw = item?.issues_info || item?.adset_issues_info || item?.campaign_issues_info;
  return Array.isArray(raw) ? raw : [];
}

function textBlob(item) {
  const issues = issuesList(item)
    .map((issue) => `${issue?.error_code || ''} ${issue?.error_summary || ''} ${issue?.error_message || ''} ${issue?.error_type || ''}`)
    .join(' ');
  const recs = Array.isArray(item?.recommendations)
    ? item.recommendations.map((r) => `${r?.code || ''} ${r?.title || ''} ${r?.message || ''}`).join(' ')
    : '';
  const info = item?.delivery_info && typeof item.delivery_info === 'object' ? item.delivery_info : {};
  const desc = `${info.delivery_status_description || ''} ${info.reason || ''} ${info.status || ''}`;
  const fundingText = item?.funding_source_details
    ? `${item.funding_source_details.display_string || ''} ${item.funding_source_details.type || ''}`
    : '';
  const checks = Array.isArray(item?.failed_delivery_checks)
    ? item.failed_delivery_checks.map((c) => `${c?.check_name || ''} ${c?.summary || ''} ${c?.description || ''}`).join(' ')
    : '';
  return `${issues} ${recs} ${desc} ${fundingText} ${checks}`;
}

function isPaymentBlob(blob) {
  return /payment|billing|pagamento|cart[aã]o|unsettled|ad account.*disable|failing.?payment|pending_billing/i.test(blob);
}

/** Interruptor do Ads Manager: ligado / desligado. */
export function metaToggleStatus(item) {
  const configured = String(item?.configured_status || item?.status || '').toUpperCase();
  if (configured === 'ACTIVE') return { on: true, label: 'Ligado' };
  if (configured === 'PAUSED') return { on: false, label: 'Desligado' };
  if (configured === 'ARCHIVED') return { on: false, label: 'Arquivado' };
  if (configured === 'DELETED') return { on: false, label: 'Excluído' };
  return { on: false, label: configured || '—' };
}

function firstIssueDetail(item) {
  const issues = issuesList(item);
  if (issues.length) {
    const first = issues[0] || {};
    return String(first.error_summary || first.error_message || first.error_type || '').trim() || null;
  }
  const checks = Array.isArray(item?.failed_delivery_checks) ? item.failed_delivery_checks : [];
  if (checks.length) {
    const first = checks[0] || {};
    return String(first.summary || first.description || first.check_name || '').trim() || null;
  }
  const info = item?.delivery_info && typeof item.delivery_info === 'object' ? item.delivery_info : null;
  const desc = String(info?.delivery_status_description || info?.reason || '').trim();
  return desc || null;
}

function packDelivery({ active, delivering, tone, label, detail = null, needsWhy = false }) {
  return {
    active: Boolean(active),
    delivering: Boolean(delivering),
    tone,
    label,
    detail: detail || null,
    needsWhy: Boolean(needsWhy),
  };
}

/** Coluna Veiculação do Ads Manager (se está saindo de verdade). */
export function metaVeiculacaoStatus(item) {
  const toggle = metaToggleStatus(item);
  const effective = String(item?.effective_status || '').toUpperCase();
  const accountStatus = Number(item?.account_status);
  const disableReason = Number(item?.disable_reason);
  const blob = textBlob(item);
  const info = item?.delivery_info && typeof item.delivery_info === 'object' ? item.delivery_info : null;
  const infoStatus = String(info?.status || info?.delivery_status || '').toUpperCase();
  const failedChecks = Array.isArray(item?.failed_delivery_checks) ? item.failed_delivery_checks : [];
  const detail = firstIssueDetail(item);

  if (accountStatus === 3 || disableReason === 3 || disableReason === 14 || effective === 'PENDING_BILLING_INFO' || isPaymentBlob(blob)) {
    return packDelivery({
      active: false,
      delivering: false,
      tone: 'issue',
      label: 'Erro no pagamento',
      detail: detail || 'Regularizar cartão ou cobrança na Meta',
    });
  }
  if (failedChecks.length) {
    const first = failedChecks[0] || {};
    const label = isPaymentBlob(blob)
      ? 'Erro no pagamento'
      : String(first.summary || first.description || first.check_name || 'Com problemas');
    return packDelivery({
      active: false,
      delivering: false,
      tone: 'issue',
      label,
      detail: detail || label,
    });
  }
  if (accountStatus === 2) {
    return packDelivery({
      active: false,
      delivering: false,
      tone: 'issue',
      label: 'Conta desativada',
      detail: detail || 'Conta de anúncios desativada na Meta',
    });
  }
  if (infoStatus === 'ERROR' || /erro no pagamento/i.test(blob)) {
    return packDelivery({
      active: false,
      delivering: false,
      tone: 'issue',
      label: isPaymentBlob(blob) ? 'Erro no pagamento' : 'Erro',
      detail: detail || null,
    });
  }
  if (effective === 'WITH_ISSUES') {
    return packDelivery({
      active: false,
      delivering: false,
      tone: 'issue',
      label: 'Com problemas',
      detail: detail || 'A Meta sinalizou problemas neste item',
    });
  }
  if (!toggle.on) {
    return packDelivery({
      active: false,
      delivering: false,
      tone: 'paused',
      label: 'Desativado',
      detail: 'Interruptor desligado — anote o motivo operacional se for pausa consciente',
      needsWhy: true,
    });
  }
  if (infoStatus === 'LEARNING' || infoStatus === 'LEARNING_LIMITED') {
    return packDelivery({
      active: true,
      delivering: true,
      tone: 'active',
      label: DELIVERY_INFO_LABEL[infoStatus],
      detail: detail || null,
    });
  }
  if (infoStatus === 'ACTIVE') {
    return packDelivery({ active: true, delivering: true, tone: 'active', label: 'No ar' });
  }
  if (infoStatus === 'INACTIVE' || infoStatus === 'NOT_DELIVERING' || infoStatus === 'LIMITED') {
    return packDelivery({
      active: false,
      delivering: false,
      tone: 'issue',
      label: DELIVERY_INFO_LABEL[infoStatus] || 'Inativo',
      detail: detail || DELIVERY_INFO_LABEL[infoStatus] || null,
    });
  }
  if (infoStatus && DELIVERY_INFO_LABEL[infoStatus]) {
    return packDelivery({
      active: false,
      delivering: false,
      tone: 'paused',
      label: DELIVERY_INFO_LABEL[infoStatus],
      detail: detail || null,
      needsWhy: infoStatus === 'COMPLETED' || infoStatus === 'SCHEDULED' ? false : true,
    });
  }
  if (effective === 'ACTIVE') {
    return packDelivery({ active: true, delivering: true, tone: 'active', label: 'No ar' });
  }
  const label = DELIVERY_LABEL[effective] || effective || '—';
  return packDelivery({
    active: false,
    delivering: false,
    tone: 'paused',
    label,
    detail: detail || null,
    needsWhy: !toggle.on || label === 'Pausada' || label === 'Desativado',
  });
}

/** @deprecated use metaVeiculacaoStatus — “no ar” de verdade, não o interruptor */
export function metaDeliveryStatus(item) {
  return metaVeiculacaoStatus(item);
}

export const OBJECTIVE_LABELS = {
  mensagens: 'Mensagens',
  leads: 'Leads',
  compras: 'Compras',
  trafego: 'Tráfego',
  engajamento: 'Engajamento',
  alcance: 'Alcance',
  app: 'App',
  outros: 'Outros',
};

const OBJECTIVE_ORDER = ['mensagens', 'leads', 'compras', 'trafego', 'engajamento', 'alcance', 'app', 'outros'];

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function monthRange() {
  return {
    since: startOfMonth(new Date()).toISOString().slice(0, 10),
    until: new Date().toISOString().slice(0, 10),
  };
}

export function campaignObjectiveKey(objective) {
  const o = String(objective || '').toUpperCase();
  if (!o) return 'outros';
  if (o.includes('MESSAGE') || o.includes('CONVERSATION')) return 'mensagens';
  if (o.includes('LEAD')) return 'leads';
  if (o.includes('SALE') || o.includes('PURCHASE') || o.includes('CATALOG')) return 'compras';
  if (o.includes('CONVERSION')) return 'compras';
  if (o.includes('TRAFFIC') || o.includes('LINK_CLICK')) return 'trafego';
  if (o.includes('ENGAGE') || o.includes('POST') || o.includes('PAGE_LIKE') || o.includes('EVENT')) return 'engajamento';
  if (o.includes('AWARENESS') || o.includes('REACH') || o.includes('VIDEO') || o.includes('BRAND')) return 'alcance';
  if (o.includes('APP')) return 'app';
  return 'outros';
}

function insightRow(campaign) {
  const raw = campaign?.insights?.data?.[0] || campaign?.insights?.[0] || campaign?.insights || {};
  return raw && !Array.isArray(raw) ? raw : {};
}

function extractCampaignMetrics(campaign) {
  const ins = insightRow(campaign);
  const n = normalizeAccountInsights(ins);
  return {
    spend: n.spend,
    messages: n.messages,
    leads: n.leads,
    purchases: n.purchases,
    purchaseValue: n.purchaseValue,
    impressions: n.impressions,
    clicks: n.clicks,
    reach: n.reach,
    engagements: n.engagements,
    videoViews: n.videoViews,
  };
}

export function extractEntityMetrics(item) {
  return extractCampaignMetrics(item);
}

function emptyBucket() {
  return {
    spend: 0,
    messages: 0,
    leads: 0,
    purchases: 0,
    purchaseValue: 0,
    impressions: 0,
    clicks: 0,
    reach: 0,
    engagements: 0,
    videoViews: 0,
    active: 0,
    total: 0,
  };
}

export function buildMetaSnapshot({
  campaigns = [],
  period,
  permError = false,
  rateLimited = false,
  errorMessage = null,
} = {}) {
  const byObjective = {};
  const running = [];
  let spend = 0;
  let messages = 0;
  let leads = 0;
  let purchases = 0;
  let purchaseValue = 0;
  let impressions = 0;
  let clicks = 0;
  let activeCount = 0;

  for (const campaign of campaigns) {
    const metrics = extractCampaignMetrics(campaign);
    const key = campaignObjectiveKey(campaign.objective);
    if (!byObjective[key]) byObjective[key] = emptyBucket();
    const bucket = byObjective[key];
    bucket.spend += metrics.spend;
    bucket.messages += metrics.messages;
    bucket.leads += metrics.leads;
    bucket.purchases += metrics.purchases;
    bucket.purchaseValue += metrics.purchaseValue;
    bucket.impressions += metrics.impressions;
    bucket.clicks += metrics.clicks;
    bucket.reach += metrics.reach;
    bucket.engagements += metrics.engagements;
    bucket.videoViews += metrics.videoViews;
    bucket.total += 1;

    spend += metrics.spend;
    messages += metrics.messages;
    leads += metrics.leads;
    purchases += metrics.purchases;
    purchaseValue += metrics.purchaseValue;
    impressions += metrics.impressions;
    clicks += metrics.clicks;

    const active = metaVeiculacaoStatus(campaign).active;
    if (active) {
      activeCount += 1;
      bucket.active += 1;
      running.push({
        id: campaign.id,
        name: campaign.name || 'Campanha',
        objective: campaign.objective || null,
        objectiveKey: key,
        spend: metrics.spend,
        messages: metrics.messages,
        leads: metrics.leads,
        purchases: metrics.purchases,
      });
    }
  }

  running.sort((a, b) => b.spend - a.spend);

  const issueLabels = [];
  for (const campaign of campaigns) {
    const delivery = metaVeiculacaoStatus(campaign);
    if (delivery.tone === 'issue' && delivery.label) issueLabels.push(delivery.label);
  }
  const uniqueIssues = [...new Set(issueLabels)];

  const inferredGoal = inferGoalFromTotals({ messages, leads, purchases, byObjective });
  const snapshot = {
    v: META_SNAPSHOT_VERSION,
    period: period || monthRange(),
    syncedAt: new Date().toISOString(),
    permError: Boolean(permError),
    rateLimited: Boolean(rateLimited),
    errorMessage: errorMessage || null,
    spend,
    messages,
    leads,
    purchases,
    purchaseValue,
    impressions,
    clicks,
    activeCount,
    sold: purchases > 0,
    inferredGoal,
    byObjective,
    running: running.slice(0, 8),
    issueLabels: uniqueIssues,
    deliveryAlert: uniqueIssues[0] || null,
  };

  return snapshot;
}

function inferGoalFromTotals({ messages, leads, purchases, byObjective }) {
  const activeKeys = OBJECTIVE_ORDER.filter((k) => (byObjective[k]?.active || 0) > 0 || (byObjective[k]?.spend || 0) > 0);
  if (activeKeys.length > 1) {
    const top = [...activeKeys].sort((a, b) => (byObjective[b]?.spend || 0) - (byObjective[a]?.spend || 0))[0];
    if (activeKeys.filter((k) => (byObjective[k]?.spend || 0) > (byObjective[top]?.spend || 0) * 0.25).length > 1) {
      return 'misto';
    }
    return top;
  }
  if (purchases > 0 && purchases >= messages && purchases >= leads) return 'compras';
  if (messages > leads && messages > 0) return 'mensagens';
  if (leads > 0) return 'leads';
  return activeKeys[0] || null;
}

export function metricsFromSnapshot(snapshot) {
  if (!snapshot) return undefined;
  if (snapshot.permError && !snapshot.spend && !snapshot.messages && !snapshot.purchases) return null;
  return {
    spend: num(snapshot.spend),
    messages: num(snapshot.messages),
    leads: num(snapshot.leads),
    purchases: num(snapshot.purchases),
    purchaseValue: num(snapshot.purchaseValue),
    impressions: num(snapshot.impressions),
    clicks: num(snapshot.clicks),
  };
}

export function isMetaSnapshotStale(snapshot, now = Date.now()) {
  if (!snapshot?.syncedAt) return true;
  if (Number(snapshot.v || 0) < META_SNAPSHOT_VERSION) return true;
  const t = new Date(snapshot.syncedAt).getTime();
  if (Number.isNaN(t)) return true;
  const age = now - t;
  if (isMetaRateLimited(snapshot) && !previousHasMetaSignal(snapshot)) {
    return age > 60 * 1000;
  }
  return age > META_RESUMO_STALE_MS;
}

export function formatMetaSyncedAgo(syncedAt, now = Date.now()) {
  if (!syncedAt) return '';
  const t = new Date(syncedAt).getTime();
  if (Number.isNaN(t)) return '';
  const sec = Math.max(0, Math.round((now - t) / 1000));
  if (sec < 20) return 'agora';
  if (sec < 60) return `há ${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `há ${min} min`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `há ${hours} h`;
  return `há ${Math.round(hours / 24)} d`;
}

export function readClienteMetaResumo(client) {
  return client?.meta_resumo || client?.entregaveis?.meta_resumo || null;
}

export async function readMetaResumoById(clienteId) {
  if (!clienteId) return null;
  const { data, error } = await supabase
    .from('clientes')
    .select('meta_resumo, entregaveis')
    .eq('id', clienteId)
    .maybeSingle();
  if (error && /meta_resumo/i.test(String(error.message || ''))) {
    const retry = await supabase.from('clientes').select('entregaveis').eq('id', clienteId).maybeSingle();
    return readClienteMetaResumo(retry.data);
  }
  if (error) return null;
  return readClienteMetaResumo(data);
}

/** Falha da Meta não pode gravar R$ 0 por cima do mês. */
export function snapshotFromMetaFetch(fetched, previous) {
  const snapshot = shouldKeepPreviousMeta(fetched, previous)
    ? previous
    : buildMetaSnapshot(fetched || {});
  const persist = shouldPersistMetaSnapshot(fetched, previous, snapshot);
  if (!persist && previousHasMetaSignal(previous)) {
    return { snapshot: previous, persist: false };
  }
  return { snapshot, persist };
}

export async function saveClienteMetaResumo(clienteId, snapshot) {
  if (!clienteId || !snapshot) return { error: null };
  const { error } = await supabase.from('clientes').update({ meta_resumo: snapshot }).eq('id', clienteId);
  if (!error) return { error: null };
  if (!/meta_resumo/i.test(String(error.message || ''))) {
    console.warn('Não gravou meta_resumo', error.message);
    return { error };
  }
  const { data } = await supabase.from('clientes').select('entregaveis').eq('id', clienteId).maybeSingle();
  const entregaveis = { ...(data?.entregaveis || {}), meta_resumo: snapshot };
  const fallback = await supabase.from('clientes').update({ entregaveis }).eq('id', clienteId);
  if (fallback.error) console.warn('Não gravou snapshot em entregaveis', fallback.error.message);
  return { error: fallback.error };
}

export async function fetchCampaignsForAccounts(accounts, period) {
  const timeRange = period || monthRange();
  const campaigns = [];
  let permError = false;
  let rateLimited = false;
  let errorMessage = null;

  for (const acc of accounts || []) {
    const { data, error } = await supabase.functions.invoke('meta-ads-api', {
      body: {
        action: 'get-campaigns',
        adAccountId: acc.meta_account_id,
        time_range: timeRange,
        metrics: [
          'spend',
          'impressions',
          'clicks',
          'reach',
          'results',
          'instagram_profile_visits',
          'actions',
          'action_values',
        ],
      },
    });
    if (error || data?.error) {
      const limitMsg = metaApiLimitMessage(data || { error });
      if (limitMsg) {
        rateLimited = true;
        errorMessage = limitMsg;
      } else {
        permError = true;
        errorMessage = data?.error?.message || error?.message || 'Sem permissão na Meta';
      }
      continue;
    }
    campaigns.push(...(data?.campaigns || []));
  }

  return { campaigns, permError, rateLimited, errorMessage, period: timeRange };
}

async function mapPool(items, limit, fn) {
  const ret = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      ret[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, Math.max(items.length, 1)) }, worker));
  return ret;
}

function campaignIsRelevant(campaign) {
  const toggle = metaToggleStatus(campaign);
  const delivery = metaVeiculacaoStatus(campaign);
  return toggle.on || delivery.active || num(extractCampaignMetrics(campaign).spend) > 0;
}

function readAdsetsPayload(data) {
  if (Array.isArray(data?.adsets)) return data.adsets;
  if (Array.isArray(data?.data?.adsets)) return data.data.adsets;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

export function readNestedAdsets(campaign) {
  const raw = campaign?.adsets;
  if (Array.isArray(raw)) return raw.map((adset) => decorateAdset(adset, campaign));
  if (Array.isArray(raw?.data)) return raw.data.map((adset) => decorateAdset(adset, campaign));
  return [];
}

export function metaApiLimitMessage(data) {
  const err = data?.error || data?.data?.error;
  if (!err) return null;
  const code = Number(err.code);
  const msg = String(err.error_user_msg || err.message || '');
  if (code === 17 || code === 4 || /limit|limite|excessiv|rate/i.test(msg)) {
    return 'A Meta limitou as chamadas desta conta. Espere um ou dois minutos e atualize.';
  }
  return err.error_user_msg || err.message || null;
}

function flattenAds(raw) {
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw)) return raw;
  return [];
}

function decorateAdset(adset, campaign) {
  const inheritedIssues = [...issuesList(adset), ...issuesList(campaign)];
  const next = {
    ...adset,
    campaign_name: campaign?.name || adset.campaign_name,
    campaign_objective: campaign?.objective || adset.campaign_objective,
    objective: adset.objective || campaign?.objective,
    issues_info: inheritedIssues.length ? inheritedIssues : adset.issues_info,
    account_status: adset.account_status ?? campaign?.account_status,
    disable_reason: adset.disable_reason ?? campaign?.disable_reason,
    funding_source_details: adset.funding_source_details ?? campaign?.funding_source_details,
    failed_delivery_checks: adset.failed_delivery_checks ?? campaign?.failed_delivery_checks,
    delivery_info: adset.delivery_info || campaign?.delivery_info,
    recommendations: adset.recommendations || campaign?.recommendations,
  };
  if (adset?.ads != null) next.ads = flattenAds(adset.ads);
  else delete next.ads;
  return next;
}

export async function fetchAdsForAdset(adsetId, period) {
  const id = String(adsetId || '').trim();
  if (!id) return [];
  const time_range = period?.since && period?.until ? period : monthRange();
  const { data, error } = await supabase.functions.invoke('meta-ads-api', {
    body: {
      action: 'get-ads',
      adsetId: id,
      time_range,
      skipInsights: false,
    },
  });
  if (error || data?.error) return [];
  return flattenAds(data?.ads);
}

function adsetHasTargeting(adset) {
  return adset?.targeting && typeof adset.targeting === 'object' && Object.keys(adset.targeting).length > 0;
}

function adsetHasInsights(adset) {
  if (adset?.insights?.skipped) return false;
  // Insights aninhados vieram da API (mesmo sem gasto no período)
  if (Array.isArray(adset?.insights?.data)) return true;
  if (Array.isArray(adset?.insights)) return true;
  return false;
}

function adsetIsComplete(adset) {
  return adsetHasTargeting(adset) && adsetHasInsights(adset);
}

export async function fetchAdsetsForCampaigns(campaigns, period, accounts = []) {
  const timeRange = period || monthRange();
  const byId = new Map((campaigns || []).map((c) => [String(c.id), c]));
  const adsets = [];
  const seen = new Set();

  const pushAll = (list) => {
    for (const adset of list || []) {
      const id = String(adset.id || '');
      if (!id) continue;
      if (seen.has(id)) {
        // Preferir versão mais completa (targeting + insights), sem perder ads já lidos
        const idx = adsets.findIndex((a) => String(a.id) === id);
        if (idx >= 0) {
          const prev = adsets[idx];
          if (adsetIsComplete(adset) && !adsetIsComplete(prev)) {
            const merged = decorateAdset(adset, byId.get(String(adset.campaign_id)));
            if (merged.ads == null && prev.ads != null) merged.ads = prev.ads;
            adsets[idx] = merged;
          } else if (prev.ads == null && adset.ads != null) {
            adsets[idx] = { ...prev, ads: flattenAds(adset.ads) };
          }
        }
        continue;
      }
      seen.add(id);
      adsets.push(decorateAdset(adset, byId.get(String(adset.campaign_id))));
    }
  };

  for (const campaign of campaigns || []) {
    pushAll(readNestedAdsets(campaign));
  }

  const relevant = (campaigns || []).filter(campaignIsRelevant);

  const metrics = [
    'spend',
    'impressions',
    'clicks',
    'reach',
    'results',
    'instagram_profile_visits',
    'actions',
    'action_values',
  ];

  for (const acc of accounts || []) {
    const rawId = String(acc.meta_account_id || '').trim();
    if (!rawId) continue;
    const adAccountId = rawId.startsWith('act_') ? rawId : `act_${rawId}`;
    const { data } = await supabase.functions.invoke('meta-ads-api', {
      body: {
        action: 'get-adsets',
        adAccountId,
        time_range: timeRange,
        metrics,
      },
    });
    if (metaApiLimitMessage(data)) return adsets;
    pushAll(readAdsetsPayload(data));
  }

  // Fallback por campanha só se ainda faltar conjunto
  const stillMissing = relevant.filter(
    (campaign) => !adsets.some((a) => String(a.campaign_id) === String(campaign.id))
  );

  for (const campaign of stillMissing.slice(0, 5)) {
    const { data } = await supabase.functions.invoke('meta-ads-api', {
      body: {
        action: 'get-adsets',
        campaignId: campaign.id,
        time_range: timeRange,
        metrics,
      },
    });
    if (metaApiLimitMessage(data)) break;
    pushAll(readAdsetsPayload(data).map((adset) => decorateAdset(adset, campaign)));
  }

  return adsets;
}

export function entityResultLine(objectiveOrKey, metrics = {}) {
  const raw = String(objectiveOrKey || '');
  let key = OBJECTIVE_LABELS[raw] ? raw : campaignObjectiveKey(raw);
  const spend = num(metrics.spend);
  const fmt = (n) => num(n).toLocaleString('pt-BR');
  // Lead da Meta com mensagens e 0 leads → mostra msgs (não “0 leads · R$ …”).
  if (key === 'leads' && num(metrics.messages) > 0 && num(metrics.leads) === 0) {
    key = 'mensagens';
  }
  if (key === 'mensagens') {
    const n = num(metrics.messages);
    return {
      key,
      label: OBJECTIVE_LABELS[key],
      value: n,
      line: n > 0 ? `${fmt(n)} msgs · ${formatMoney(spend / n)}` : spend > 0 ? `0 msgs · ${formatMoney(spend)}` : '—',
    };
  }
  if (key === 'leads') {
    const n = num(metrics.leads);
    return {
      key,
      label: OBJECTIVE_LABELS[key],
      value: n,
      line: n > 0 ? `${fmt(n)} leads · ${formatMoney(spend / n)}` : spend > 0 ? `0 leads · ${formatMoney(spend)}` : '—',
    };
  }
  if (key === 'compras') {
    const n = num(metrics.purchases);
    const roas = spend > 0 ? num(metrics.purchaseValue) / spend : 0;
    return {
      key,
      label: OBJECTIVE_LABELS[key],
      value: n,
      line: n > 0 ? `${fmt(n)} vendas · ROAS ${roas.toFixed(2)}x` : spend > 0 ? `${formatMoney(spend)} · sem venda` : '—',
    };
  }
  if (key === 'trafego') {
    const n = num(metrics.clicks);
    return {
      key,
      label: OBJECTIVE_LABELS[key],
      value: n,
      line: n > 0 ? `${fmt(n)} cliques · CPC ${formatMoney(spend / n)}` : spend > 0 ? formatMoney(spend) : '—',
    };
  }
  if (key === 'engajamento') {
    const n = num(metrics.engagements) || num(metrics.clicks);
    const unit = num(metrics.engagements) > 0 ? 'interações' : 'cliques';
    return {
      key,
      label: OBJECTIVE_LABELS[key],
      value: n,
      line: n > 0 ? `${fmt(n)} ${unit} · ${formatMoney(spend)}` : spend > 0 ? formatMoney(spend) : '—',
    };
  }
  if (key === 'alcance') {
    const n = num(metrics.reach) || num(metrics.impressions);
    const unit = num(metrics.reach) > 0 ? 'alcance' : 'impr.';
    return {
      key,
      label: OBJECTIVE_LABELS[key],
      value: n,
      line: n > 0 ? `${fmt(n)} ${unit} · ${formatMoney(spend)}` : spend > 0 ? formatMoney(spend) : '—',
    };
  }
  if (key === 'app') {
    const n = num(metrics.videoViews);
    return {
      key,
      label: OBJECTIVE_LABELS[key],
      value: n,
      line: n > 0 ? `${fmt(n)} instalações` : spend > 0 ? formatMoney(spend) : '—',
    };
  }
  const parts = [];
  if (metrics.messages) parts.push(`${fmt(metrics.messages)} msgs`);
  if (metrics.leads) parts.push(`${fmt(metrics.leads)} leads`);
  if (metrics.purchases) parts.push(`${fmt(metrics.purchases)} vendas`);
  if (metrics.clicks) parts.push(`${fmt(metrics.clicks)} cliques`);
  if (metrics.reach) parts.push(`${fmt(metrics.reach)} alcance`);
  return {
    key,
    label: OBJECTIVE_LABELS[key] || 'Resultado',
    value: num(metrics.clicks) || num(metrics.messages) || num(metrics.leads),
    line: parts.join(' · ') || (spend > 0 ? formatMoney(spend) : '—'),
  };
}

export function objectiveKpiCards(snapshot) {
  if (!snapshot) return [];
  return snapshotObjectiveLines(snapshot).map((item) => {
    const bucket = snapshot.byObjective[item.key] || emptyBucket();
    const result = entityResultLine(item.key, bucket);
    return {
      key: item.key,
      label: result.label,
      value: Number(result.value || 0).toLocaleString('pt-BR'),
      line: result.line,
    };
  });
}

export async function syncClienteMetaResumo(clienteId, accounts, { previous } = {}) {
  const fetched = await fetchCampaignsForAccounts(accounts);
  let lastGood = previous;
  if ((isMetaRateLimited(fetched) || fetched.permError) && !previousHasMetaSignal(lastGood)) {
    lastGood = (await readMetaResumoById(clienteId)) || lastGood;
  }
  const { snapshot, persist } = snapshotFromMetaFetch(fetched, lastGood);
  if (persist) await saveClienteMetaResumo(clienteId, snapshot);
  return snapshot;
}

export async function refreshClientsMetaResumo(entries, { force = false, concurrency = 2, onEach } = {}) {
  const list = (entries || []).filter((entry) => entry?.client?.id && (entry.accounts || []).length);
  const todo = force ? list : list.filter((entry) => isMetaSnapshotStale(readClienteMetaResumo(entry.client)));
  const byId = {};
  for (const entry of list) {
    const cached = readClienteMetaResumo(entry.client);
    if (cached && !todo.some((item) => item.client.id === entry.client.id)) {
      byId[entry.client.id] = cached;
    }
  }
  if (!todo.length) return byId;

  let done = 0;
  await mapPool(todo, concurrency, async (entry) => {
    const cached = readClienteMetaResumo(entry.client);
    let snapshot = cached;
    try {
      snapshot = await syncClienteMetaResumo(entry.client.id, entry.accounts, { previous: cached });
    } catch (e) {
      snapshot = cached || {
        v: META_SNAPSHOT_VERSION,
        syncedAt: new Date().toISOString(),
        permError: true,
        errorMessage: e?.message || String(e),
        spend: 0,
        activeCount: 0,
      };
    }
    byId[entry.client.id] = snapshot;
    done += 1;
    onEach?.({ clientId: entry.client.id, snapshot, done, total: todo.length });
  });
  return byId;
}

function resultLineForBucket(key, bucket) {
  return entityResultLine(key, bucket).line;
}

export function snapshotObjectiveLines(snapshot) {
  if (!snapshot?.byObjective) return [];
  return OBJECTIVE_ORDER.filter((key) => {
    const b = snapshot.byObjective[key];
    return (
      b &&
      (b.spend > 0 ||
        b.active > 0 ||
        b.messages > 0 ||
        b.leads > 0 ||
        b.purchases > 0 ||
        b.clicks > 0 ||
        b.reach > 0 ||
        b.engagements > 0)
    );
  }).map((key) => ({
    key,
    label: OBJECTIVE_LABELS[key],
    active: num(snapshot.byObjective[key].active),
    line: resultLineForBucket(key, snapshot.byObjective[key]),
  }));
}

export function snapshotRunningLabel(snapshot) {
  if (!snapshot) return 'Sem dado Meta';
  if (snapshot.permError && snapshot.activeCount === 0 && !snapshot.spend) return 'Sem permissão';
  const n = num(snapshot.activeCount);
  if (n === 0) return 'Nada no ar';
  if (n === 1) return snapshot.running?.[0]?.name || '1 campanha no ar';
  return `${n} campanhas no ar`;
}

export function snapshotSoldLabel(snapshot) {
  if (!snapshot) return { text: '—', tone: 'muted' };
  if (snapshot.sold) {
    const n = num(snapshot.purchases);
    const extra = snapshot.purchaseValue > 0 ? ` · ${formatMoney(snapshot.purchaseValue)}` : '';
    return { text: `Vendeu (${n}${extra})`, tone: 'ok' };
  }
  const buySpend = num(snapshot.byObjective?.compras?.spend);
  const buyActive = num(snapshot.byObjective?.compras?.active);
  // Sem gasto/ativo de compras: não mostra “Sem venda neste objetivo”.
  if (buySpend <= 0 && buyActive <= 0 && snapshot.inferredGoal !== 'compras') {
    return { text: '', tone: 'muted' };
  }
  return {
    text: 'Não vendeu',
    tone: 'danger',
  };
}

export function snapshotSyncedLabel(snapshot) {
  if (!snapshot?.syncedAt) return '';
  const d = new Date(snapshot.syncedAt);
  if (Number.isNaN(d.getTime())) return '';
  return `Meta ${d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
}

export function snapshotListSummary(snapshot) {
  const running = snapshotRunningLabel(snapshot);
  const lines = snapshotObjectiveLines(snapshot);
  const sold = snapshotSoldLabel(snapshot);
  return { running, lines, sold };
}
