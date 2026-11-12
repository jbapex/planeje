/**
 * Leitura ao vivo para o MCP. Só consulta (Meta, Google, WhatsApp gravado).
 * Não pausa campanha, não muda orçamento e não envia mensagem.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const LIVE_TTL_MS = 10 * 60 * 1000;

type CacheHit = { at: number; value: unknown };
const cache = new Map<string, CacheHit>();

export function readLiveCache<T>(key: string, force = false, now = Date.now()): T | null {
  if (force) return null;
  const hit = cache.get(key);
  if (!hit || now - hit.at > LIVE_TTL_MS) return null;
  return hit.value as T;
}

export function writeLiveCache(key: string, value: unknown, now = Date.now()): void {
  cache.set(key, { at: now, value });
}

export function clearLiveCache(): void {
  cache.clear();
}

export function snapshotIsStale(snapshot: unknown, now = Date.now(), ttl = LIVE_TTL_MS): boolean {
  if (!snapshot || typeof snapshot !== 'object') return true;
  const synced = (snapshot as { syncedAt?: unknown }).syncedAt;
  if (typeof synced !== 'string' || !synced) return true;
  const t = new Date(synced).getTime();
  if (Number.isNaN(t)) return true;
  return now - t > ttl;
}

export function compactMetaResumo(snapshot: unknown): Record<string, unknown> | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const s = snapshot as Record<string, unknown>;
  const running = Array.isArray(s.running) ? s.running.slice(0, 8) : [];
  return {
    syncedAt: s.syncedAt ?? null,
    period: s.period ?? null,
    spend: s.spend ?? null,
    messages: s.messages ?? null,
    leads: s.leads ?? null,
    purchases: s.purchases ?? null,
    purchaseValue: s.purchaseValue ?? null,
    impressions: s.impressions ?? null,
    clicks: s.clicks ?? null,
    activeCount: s.activeCount ?? null,
    deliveryAlert: s.deliveryAlert ?? null,
    running,
  };
}

export { consultMensagens, phoneCandidates } from './messageHistory.js';

type EdgeResult = { ok: boolean; error: string | null; data: Record<string, unknown> | null };

async function invokeEdge(
  supabase: SupabaseClient,
  name: string,
  body: Record<string, unknown>
): Promise<EdgeResult> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) return { ok: false, error: error.message, data: null };
  const rec = (data && typeof data === 'object' ? data : null) as Record<string, unknown> | null;
  const errObj = rec?.error as { message?: string } | undefined;
  if (errObj?.message) return { ok: false, error: errObj.message, data: rec };
  return { ok: true, error: null, data: rec };
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asList(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (raw && typeof raw === 'object' && Array.isArray((raw as { data?: unknown }).data)) {
    return (raw as { data: Record<string, unknown>[] }).data;
  }
  return [];
}

function insightBag(item: Record<string, unknown>): Record<string, unknown> {
  const raw = item.insights as unknown;
  const row = Array.isArray((raw as { data?: unknown })?.data)
    ? ((raw as { data: Record<string, unknown>[] }).data[0] ?? {})
    : Array.isArray(raw)
      ? ((raw[0] as Record<string, unknown>) ?? {})
      : raw && typeof raw === 'object'
        ? (raw as Record<string, unknown>)
        : {};
  return row;
}

function money(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n) / 100;
}

function actionSum(ins: Record<string, unknown>, types: string[], field = 'actions'): number {
  return asList(ins[field])
    .filter((a) => types.includes(String(a.action_type || '')))
    .reduce((sum, a) => Math.max(sum, num(a.value)), 0);
}

function resultCount(ins: Record<string, unknown>): number {
  const raw = ins.results;
  if (typeof raw === 'number' || typeof raw === 'string') return num(raw);
  return asList(raw).reduce(
    (sum, r) => sum + asList(r.values).reduce((s, v) => s + num(v.value), 0),
    0
  );
}

/** Métricas de uma linha do Painel (campanha, conjunto ou anúncio). */
export function painelMetrics(ins: Record<string, unknown>): Record<string, number | null> {
  const gasto = num(ins.spend);
  const impressoes = num(ins.impressions);
  const cliques = num(ins.clicks);
  const resultados = resultCount(ins);
  const purchaseTypes = ['purchase', 'offsite_conversion.fb_pixel_purchase', 'omni_purchase'];
  return {
    gasto,
    impressoes,
    cliques,
    alcance: num(ins.reach),
    resultados,
    custo_por_resultado: resultados > 0 ? Math.round((gasto / resultados) * 100) / 100 : null,
    ctr: impressoes > 0 ? Math.round((cliques / impressoes) * 10000) / 100 : null,
    cpc: cliques > 0 ? Math.round((gasto / cliques) * 100) / 100 : null,
    conversas: actionSum(ins, ['onsite_conversion.messaging_conversation_started_7d']),
    leads: actionSum(ins, ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead']),
    compras: actionSum(ins, purchaseTypes),
    valor_compras: actionSum(ins, purchaseTypes, 'action_values'),
    visitas_perfil: num(ins.instagram_profile_visits),
  };
}

export function shapePainelCampaigns(
  campaigns: unknown[],
  limits: { campanhas?: number; conjuntos?: number; anuncios?: number } = {}
): Record<string, unknown>[] {
  const maxC = limits.campanhas ?? 30;
  const maxS = limits.conjuntos ?? 20;
  const maxA = limits.anuncios ?? 15;
  return (campaigns || [])
    .filter((item) => item && typeof item === 'object')
    .slice(0, maxC)
    .map((campaign) => {
      const row = campaign as Record<string, unknown>;
      const allSets = asList(row.adsets);
      const conjuntos = allSets.slice(0, maxS).map((adset) => {
        const allAds = asList(adset.ads);
        const anuncios = allAds.slice(0, maxA).map((ad) => ({
          id: ad.id ?? null,
          nome: ad.name ?? null,
          status: ad.effective_status || ad.status || null,
          ...painelMetrics(insightBag(ad)),
        }));
        return {
          id: adset.id ?? null,
          nome: adset.name ?? null,
          status: adset.effective_status || adset.status || null,
          objetivo: adset.optimization_goal ?? null,
          orcamento_dia: money(adset.daily_budget),
          ...painelMetrics(insightBag(adset)),
          total_anuncios: allAds.length,
          anuncios,
        };
      });
      return {
        id: row.id ?? null,
        nome: row.name ?? null,
        status: row.effective_status || row.status || null,
        objetivo: row.objective ?? null,
        orcamento_dia: money(row.daily_budget),
        ...painelMetrics(insightBag(row)),
        total_conjuntos: allSets.length,
        conjuntos,
      };
    });
}

function matchesLinha(row: Record<string, unknown>, filtro: string): boolean {
  const f = filtro.trim().toLowerCase();
  return String(row.id || '') === filtro.trim() || String(row.name || '').toLowerCase().includes(f);
}

/** Mantém só a campanha, o conjunto ou o anúncio pedido (id ou parte do nome). */
export function filterPainelRows(rows: Record<string, unknown>[], filtro?: string): Record<string, unknown>[] {
  if (!filtro || !filtro.trim()) return rows;
  const out: Record<string, unknown>[] = [];
  for (const row of rows) {
    if (matchesLinha(row, filtro)) {
      out.push(row);
      continue;
    }
    const sets = asList(row.adsets)
      .map((adset) => {
        if (matchesLinha(adset, filtro)) return adset;
        const ads = asList(adset.ads).filter((ad) => matchesLinha(ad, filtro));
        return ads.length ? { ...adset, ads } : null;
      })
      .filter(Boolean) as Record<string, unknown>[];
    if (sets.length) out.push({ ...row, adsets: sets });
  }
  return out;
}

const PAINEL_METRICS = [
  'spend',
  'impressions',
  'clicks',
  'reach',
  'results',
  'instagram_profile_visits',
  'actions',
  'action_values',
];

export async function consultPainel(
  supabase: SupabaseClient,
  clienteId: string,
  opts: { since: string; until: string; atualizar?: boolean; linha?: string }
): Promise<Record<string, unknown>> {
  const linha = opts.linha?.trim() || '';
  const key = `painel:${clienteId}:${opts.since}:${opts.until}:${linha.toLowerCase()}`;
  const hit = readLiveCache<Record<string, unknown>>(key, Boolean(opts.atualizar));
  if (hit) return hit;

  const { data: accounts, error } = await supabase
    .from('cliente_meta_accounts')
    .select('meta_account_id, meta_account_name')
    .eq('cliente_id', clienteId)
    .eq('is_active', true)
    .limit(3);
  if (error) return { fonte: 'meta', aviso: error.message, campanhas: [] };

  const campanhas: Record<string, unknown>[] = [];
  const erros: string[] = [];
  for (const account of accounts ?? []) {
    const rec = account as { meta_account_id?: string; meta_account_name?: string };
    if (!rec.meta_account_id) continue;
    const time_range = { since: opts.since, until: opts.until };
    const live = await invokeEdge(supabase, 'meta-ads-api', {
      action: 'get-campaigns',
      adAccountId: rec.meta_account_id,
      time_range,
      metrics: PAINEL_METRICS,
    });
    if (!live.ok) {
      erros.push(live.error || 'Meta sem resposta');
      continue;
    }
    let rows = Array.isArray(live.data?.campaigns) ? (live.data?.campaigns as Record<string, unknown>[]) : [];
    const semConjunto = rows.length > 0 && rows.every((row) => asList(row.adsets).length === 0);
    if (semConjunto) {
      const adsets = await invokeEdge(supabase, 'meta-ads-api', {
        action: 'get-adsets',
        adAccountId: rec.meta_account_id,
        time_range,
        metrics: PAINEL_METRICS,
      });
      if (adsets.ok) {
        const list = Array.isArray(adsets.data?.adsets) ? (adsets.data?.adsets as Record<string, unknown>[]) : [];
        const byCampaign = new Map<string, Record<string, unknown>[]>();
        for (const adset of list) {
          const id = String(adset.campaign_id || '');
          if (!byCampaign.has(id)) byCampaign.set(id, []);
          byCampaign.get(id)?.push(adset);
        }
        rows = rows.map((row) => ({ ...row, adsets: byCampaign.get(String(row.id || '')) || [] }));
      } else if (adsets.error) {
        erros.push(adsets.error);
      }
    }
    const filtered = filterPainelRows(rows, linha);
    const limits = linha ? { campanhas: 100, conjuntos: 100, anuncios: 100 } : {};
    for (const row of shapePainelCampaigns(filtered, limits)) {
      campanhas.push({ ...row, conta: rec.meta_account_name || rec.meta_account_id });
    }
  }

  const out: Record<string, unknown> = {
    fonte: 'meta',
    periodo: { inicio: opts.since, fim: opts.until },
    contas: (accounts ?? []).length,
    ...(linha ? { filtro: linha } : {}),
    campanhas,
  };
  if (erros.length) out.aviso = erros[0];
  else if (linha && !campanhas.length) out.aviso = `Nenhuma campanha, conjunto ou anúncio com "${linha}" neste período.`;
  if (campanhas.length) writeLiveCache(key, out);
  return out;
}

export async function consultMeta(
  supabase: SupabaseClient,
  clienteId: string,
  opts: { since: string; until: string; atualizar?: boolean; salvo?: unknown }
): Promise<Record<string, unknown>> {
  const salvo = compactMetaResumo(opts.salvo);
  const fresh = salvo && !snapshotIsStale(opts.salvo);
  if (fresh && !opts.atualizar) {
    return { fonte: 'salvo', resumo: salvo };
  }
  const key = `meta:${clienteId}:${opts.since}:${opts.until}`;
  const hit = readLiveCache<Record<string, unknown>>(key, Boolean(opts.atualizar));
  if (hit) return hit;

  const { data: accounts, error } = await supabase
    .from('cliente_meta_accounts')
    .select('meta_account_id, meta_account_name')
    .eq('cliente_id', clienteId)
    .eq('is_active', true)
    .limit(3);
  if (error) {
    return { fonte: salvo ? 'salvo' : 'meta', resumo: salvo, aviso: error.message };
  }
  const campanhas: Record<string, unknown>[] = [];
  const erros: string[] = [];
  let spend = 0;
  let impressions = 0;
  let clicks = 0;
  let reach = 0;
  for (const account of accounts ?? []) {
    const rec = account as { meta_account_id?: string; meta_account_name?: string };
    if (!rec.meta_account_id) continue;
    const live = await invokeEdge(supabase, 'meta-ads-api', {
      action: 'get-campaign-insights',
      ad_account_id: rec.meta_account_id,
      cliente_id: clienteId,
      time_range: { since: opts.since, until: opts.until },
      level: 'campaign',
      limit: 40,
      metrics: ['spend', 'impressions', 'clicks', 'reach'],
    });
    if (!live.ok) {
      erros.push(live.error || 'Meta sem resposta');
      continue;
    }
    const rows = Array.isArray(live.data?.campaigns) ? (live.data?.campaigns as Record<string, unknown>[]) : [];
    for (const row of rows) {
      spend += num(row.spend);
      impressions += num(row.impressions);
      clicks += num(row.clicks);
      reach += num(row.reach);
      campanhas.push({
        conta: rec.meta_account_name || rec.meta_account_id,
        nome: row.campaign_name || row.name || row.ad_name || null,
        spend: num(row.spend),
        impressions: num(row.impressions),
        clicks: num(row.clicks),
        reach: num(row.reach),
      });
    }
  }
  const out: Record<string, unknown> = {
    fonte: campanhas.length || !erros.length ? 'meta' : 'salvo',
    periodo: { inicio: opts.since, fim: opts.until },
    resumo: {
      spend,
      impressions,
      clicks,
      reach,
      campanhas: campanhas.length,
      syncedAt: new Date().toISOString(),
    },
    salvo,
    campanhas: campanhas.slice(0, 40),
  };
  if (erros.length) out.aviso = erros[0];
  if (!campanhas.length && salvo) out.fonte = 'salvo';
  if (campanhas.length || !erros.length) writeLiveCache(key, out);
  return out;
}

export async function consultGoogle(
  supabase: SupabaseClient,
  clienteId: string,
  opts: { since: string; until: string; atualizar?: boolean }
): Promise<Record<string, unknown>> {
  const key = `google:${clienteId}:${opts.since}:${opts.until}`;
  const hit = readLiveCache<Record<string, unknown>>(key, Boolean(opts.atualizar));
  if (hit) return hit;

  const [ads, ga, biz, tag] = await Promise.all([
    supabase
      .from('cliente_google_ads_accounts')
      .select('google_customer_id, google_customer_name')
      .eq('cliente_id', clienteId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('cliente_google_analytics_properties')
      .select('property_id, property_name')
      .eq('cliente_id', clienteId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('cliente_google_business_locations')
      .select('location_name, location_title')
      .eq('cliente_id', clienteId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('cliente_google_tag_containers')
      .select('account_id, container_id, container_name, public_id')
      .eq('cliente_id', clienteId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle(),
  ]);

  const customerId = (ads.data as { google_customer_id?: string } | null)?.google_customer_id;
  const propertyId = (ga.data as { property_id?: string } | null)?.property_id;
  const locationName = (biz.data as { location_name?: string } | null)?.location_name;
  const container = tag.data as { account_id?: string; container_id?: string; public_id?: string; container_name?: string } | null;

  const [campaigns, analytics, business, manager] = await Promise.all([
    customerId
      ? invokeEdge(supabase, 'google-ads-api', {
          action: 'get-campaigns',
          customerId,
          time_range: { since: opts.since, until: opts.until },
        })
      : Promise.resolve({ ok: false, error: 'Sem conta Google Ads', data: null } as EdgeResult),
    propertyId
      ? invokeEdge(supabase, 'google-data-api', {
          action: 'get-analytics-overview',
          propertyId,
          since: opts.since,
          until: opts.until,
        })
      : Promise.resolve({ ok: false, error: 'Sem propriedade Analytics', data: null } as EdgeResult),
    locationName
      ? invokeEdge(supabase, 'google-data-api', {
          action: 'get-business-overview',
          locationName,
          since: opts.since,
          until: opts.until,
        })
      : Promise.resolve({ ok: false, error: 'Sem ficha do Meu Negócio', data: null } as EdgeResult),
    container?.account_id && container.container_id
      ? invokeEdge(supabase, 'google-data-api', {
          action: 'get-tagmanager-overview',
          accountId: container.account_id,
          containerId: container.container_id,
        })
      : Promise.resolve({ ok: false, error: 'Sem container do Tag Manager', data: null } as EdgeResult),
  ]);

  const campRows = Array.isArray(campaigns.data?.campaigns)
    ? (campaigns.data?.campaigns as Record<string, unknown>[]).slice(0, 40)
    : [];
  const out: Record<string, unknown> = {
    fonte: 'google',
    periodo: { inicio: opts.since, fim: opts.until },
    ads: customerId
      ? {
          conta: (ads.data as { google_customer_name?: string } | null)?.google_customer_name || customerId,
          campanhas: campRows,
          diario: Array.isArray(campaigns.data?.daily) ? campaigns.data?.daily : [],
          aviso: campaigns.ok ? null : campaigns.error,
        }
      : { aviso: 'Sem conta Google Ads vinculada' },
    analytics: propertyId
      ? { propriedade: (ga.data as { property_name?: string } | null)?.property_name || propertyId, relatorio: analytics.data, aviso: analytics.ok ? null : analytics.error }
      : { aviso: 'Sem propriedade Analytics' },
    meu_negocio: locationName
      ? { ficha: (biz.data as { location_title?: string } | null)?.location_title || locationName, relatorio: business.data, aviso: business.ok ? null : business.error }
      : { aviso: 'Sem ficha do Meu Negócio' },
    tag_manager: container?.container_id
      ? {
          container: container.container_name || container.public_id || container.container_id,
          inventario: manager.data,
          aviso: manager.ok ? null : manager.error,
        }
      : { aviso: 'Sem container do Tag Manager' },
  };
  const anyOk = campaigns.ok || analytics.ok || business.ok || manager.ok;
  if (anyOk) writeLiveCache(key, out);
  return out;
}

