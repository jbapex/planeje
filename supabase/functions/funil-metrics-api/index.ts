import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_API_VERSION = "v20";

type TimeRange = { since?: string; until?: string };

type NodeInput = {
  nodeId: string;
  metaLink?: {
    accountId?: string;
    campaignId?: string;
    adId?: string;
    adSetId?: string;
  };
  googleLink?: {
    customerId?: string;
    campaignId?: string;
    adGroupId?: string;
  };
};

type AttributionInput = {
  nodeId: string;
  utmCampaign?: string;
  utmSource?: string;
  nodeType?: string;
  metaCampaignId?: string;
  metaAdSetId?: string;
  metaAdId?: string;
  googleCampaignId?: string;
  googleAdGroupId?: string;
};

function normalizeSlug(s: string) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_");
}

function extractContactIds(contact: {
  tracking_data?: unknown;
  utm_campaign?: string | null;
  utm_source?: string | null;
}) {
  const td =
    contact.tracking_data && typeof contact.tracking_data === "object"
      ? (contact.tracking_data as Record<string, unknown>)
      : {};
  const ad = td.meta_ad_details && typeof td.meta_ad_details === "object"
    ? (td.meta_ad_details as Record<string, unknown>).ad as Record<string, unknown> | undefined
    : undefined;
  const campaign = ad?.campaign as Record<string, unknown> | undefined;
  const adset = ad?.adset as Record<string, unknown> | undefined;
  const adObj = ad as Record<string, unknown> | undefined;

  return {
    campaignId: String(campaign?.id || td.campaign_id || "").replace(/\D/g, "") || null,
    adSetId: String(adset?.id || td.adset_id || "").replace(/\D/g, "") || null,
    adId: String(adObj?.id || td.ad_id || td.source_id || "").replace(/\D/g, "") || null,
    utmCampaign: normalizeSlug(contact.utm_campaign || String(td.utm_campaign || "")),
    utmSource: normalizeSlug(contact.utm_source || String(td.utm_source || "")),
  };
}

function scoreContactNodeMatch(
  contactIds: ReturnType<typeof extractContactIds>,
  node: AttributionInput
): number {
  let score = 0;
  const nCampaign = normalizeSlug(node.utmCampaign || "");
  const nSource = normalizeSlug(node.utmSource || "");

  if (node.metaAdId && contactIds.adId && node.metaAdId === contactIds.adId) score += 100;
  if (node.metaAdSetId && contactIds.adSetId && node.metaAdSetId === contactIds.adSetId) score += 80;
  if (node.metaCampaignId && contactIds.campaignId && node.metaCampaignId === contactIds.campaignId) score += 60;

  if (node.googleAdGroupId) {
    // Google ad group not stored on contact — rely on UTM
  }
  if (node.googleCampaignId && contactIds.utmSource.includes("google")) {
    // no campaign id on contact typically
  }

  if (!nCampaign) return score;
  const cCampaign = contactIds.utmCampaign;
  if (!cCampaign) return score;

  if (cCampaign === nCampaign) score += 40;
  else if (cCampaign.includes(nCampaign) || nCampaign.includes(cCampaign)) score += 25;

  if (nSource && contactIds.utmSource) {
    if (contactIds.utmSource === nSource || contactIds.utmSource.includes(nSource)) score += 10;
    else if (nSource && contactIds.utmSource !== nSource) score -= 5;
  }

  return score;
}

function isCampaignAnchorNode(node: AttributionInput) {
  return node.nodeType === "meta" || node.nodeType === "google";
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function defaultTimeRange(): TimeRange {
  const until = new Date().toISOString().split("T")[0];
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  return { since, until };
}

async function getSecret(
  supabase: ReturnType<typeof createClient>,
  envName: string
): Promise<string | null> {
  const fromEnv = Deno.env.get(envName);
  if (fromEnv) return fromEnv;
  try {
    const { data, error } = await supabase.rpc("get_encrypted_secret", {
      p_secret_name: envName,
    });
    if (!error && data) return String(data);
  } catch {
    // ignore
  }
  return null;
}

async function getMetaToken(supabase: ReturnType<typeof createClient>) {
  return (
    Deno.env.get("META_SYSTEM_USER_ACCESS_TOKEN") ||
    (await getSecret(supabase, "META_SYSTEM_USER_ACCESS_TOKEN"))
  );
}

function ctwaSecretName(clienteId: string) {
  return `META_CTWA_CLIENT_${clienteId.replace(/-/g, "_")}`;
}

async function getClienteMetaToken(
  supabase: ReturnType<typeof createClient>,
  clienteId: string
): Promise<string | null> {
  const name = ctwaSecretName(clienteId);
  const { data: row } = await supabase
    .from("app_secrets")
    .select("secret_value")
    .eq("name", name)
    .maybeSingle();
  if (row?.secret_value && String(row.secret_value).trim().length > 20) {
    return String(row.secret_value).trim();
  }
  try {
    const { data } = await supabase.rpc("get_encrypted_secret", {
      p_secret_name: name,
    });
    if (data && String(data).trim().length > 20) return String(data).trim();
  } catch {
    // ignore
  }
  return null;
}

function parseClienteAdAccountIds(meta: unknown): string[] {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return [];
  const raw = meta as Record<string, unknown>;
  const fromIds = Array.isArray(raw.adAccountIds) ? raw.adAccountIds.map(String) : [];
  const fromAccounts = Array.isArray(raw.adAccounts)
    ? (raw.adAccounts as { id?: unknown }[]).map((row) => String(row?.id || ""))
    : [];
  const out = new Set<string>();
  for (const item of [...fromIds, ...fromAccounts]) {
    const digits = item.replace(/\D/g, "");
    if (digits) out.add(`act_${digits}`);
  }
  return [...out];
}

async function sumMetaEntitySpend(
  entityIds: string[],
  token: string | null,
  timeRange: TimeRange
): Promise<number> {
  if (!token || !entityIds.length) return 0;
  const parts = await Promise.all(
    entityIds.map(async (entityId) => {
      try {
        const metrics = await fetchMetaEntityInsights(entityId, token, timeRange, null);
        return metrics.spend || 0;
      } catch {
        return 0;
      }
    })
  );
  return parts.reduce((sum, n) => sum + n, 0);
}

async function getGoogleAccessToken(supabase: ReturnType<typeof createClient>) {
  const clientId = await getSecret(supabase, "GOOGLE_ADS_CLIENT_ID");
  const clientSecret = await getSecret(supabase, "GOOGLE_ADS_CLIENT_SECRET");
  const refreshToken = await getSecret(supabase, "GOOGLE_ADS_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) return null;
  return data.access_token as string;
}

function parseMetaInsightsRow(row: Record<string, unknown>) {
  const spend = parseFloat(String(row.spend ?? 0)) || 0;
  const impressions = parseInt(String(row.impressions ?? 0), 10) || 0;
  const clicks = parseInt(String(row.clicks ?? 0), 10) || 0;
  let conversions = 0;
  const actions = row.actions;
  if (Array.isArray(actions)) {
    for (const a of actions) {
      const act = a as { action_type?: string; value?: string };
      if (
        act.action_type === "omni_purchase" ||
        act.action_type === "purchase" ||
        act.action_type === "lead"
      ) {
        conversions += parseFloat(String(act.value ?? 0)) || 0;
      }
    }
  }
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cpc = clicks > 0 ? spend / clicks : 0;
  return { spend, impressions, clicks, conversions, ctr, cpc };
}

async function fetchMetaEntityInsights(
  entityId: string,
  metaToken: string,
  timeRange: TimeRange,
  placement?: string | null
) {
  const tr = encodeURIComponent(JSON.stringify(timeRange));
  const fields = "spend,impressions,clicks,actions";
  let url = `https://graph.facebook.com/v24.0/${entityId}/insights?fields=${fields}&time_range=${tr}&access_token=${metaToken}`;
  if (placement) {
    const breakdowns = encodeURIComponent(JSON.stringify(["publisher_platform"]));
    url += `&breakdowns=${breakdowns}`;
  }
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "Meta insights error");
  const rows = Array.isArray(data.data) ? data.data : [];
  if (placement && rows.length > 0) {
    const want = placement.toLowerCase();
    const match = rows.find((r: Record<string, unknown>) => {
      const pp = String(r.publisher_platform || "").toLowerCase();
      return pp === want || pp.includes(want);
    });
    if (match) return parseMetaInsightsRow(match as Record<string, unknown>);
    return parseMetaInsightsRow({ spend: 0, impressions: 0, clicks: 0, actions: [] });
  }
  const row = rows[0] || {};
  return parseMetaInsightsRow(row as Record<string, unknown>);
}

async function googleAdsSearch(
  customerId: string,
  query: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string | null
) {
  const cid = String(customerId).replace(/\D/g, "");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": developerToken,
    "Content-Type": "application/json",
  };
  if (loginCustomerId) headers["login-customer-id"] = String(loginCustomerId).replace(/\D/g, "");

  const res = await fetch(
    `https://googleads.googleapis.com/${GOOGLE_API_VERSION}/customers/${cid}/googleAds:search`,
    { method: "POST", headers, body: JSON.stringify({ query }) }
  );
  const text = await res.text();
  const data = JSON.parse(text);
  if (!res.ok) {
    throw new Error(data?.error?.message || text.slice(0, 200));
  }
  return (data.results || []) as Record<string, unknown>[];
}

function parseGoogleRow(row: Record<string, unknown>) {
  const get = (...path: string[]) => {
    let cur: unknown = row;
    for (const p of path) {
      if (!cur || typeof cur !== "object") return 0;
      cur = (cur as Record<string, unknown>)[p];
    }
    return Number(cur ?? 0);
  };
  const impressions = get("metrics", "impressions");
  const clicks = get("metrics", "clicks");
  const costMicros = get("metrics", "costMicros");
  const spend = costMicros / 1_000_000;
  const conversions = get("metrics", "conversions");
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cpc = clicks > 0 ? spend / clicks : 0;
  return { spend, impressions, clicks, conversions, ctr, cpc };
}

async function fetchGoogleCampaignMetrics(
  customerId: string,
  campaignId: string,
  timeRange: TimeRange,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string | null
) {
  let dateClause = "segments.date DURING LAST_30_DAYS";
  if (timeRange.since && timeRange.until) {
    dateClause = `segments.date BETWEEN '${timeRange.since}' AND '${timeRange.until}'`;
  }
  const query = `
    SELECT
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM campaign
    WHERE campaign.id = ${campaignId}
      AND ${dateClause}
  `;
  const rows = await googleAdsSearch(
    customerId,
    query,
    accessToken,
    developerToken,
    loginCustomerId
  );
  const agg = { spend: 0, impressions: 0, clicks: 0, conversions: 0, ctr: 0, cpc: 0 };
  for (const row of rows) {
    const m = parseGoogleRow(row);
    agg.spend += m.spend;
    agg.impressions += m.impressions;
    agg.clicks += m.clicks;
    agg.conversions += m.conversions;
  }
  agg.ctr = agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : 0;
  agg.cpc = agg.clicks > 0 ? agg.spend / agg.clicks : 0;
  return agg;
}

async function fetchGoogleAdGroupMetrics(
  customerId: string,
  adGroupId: string,
  timeRange: TimeRange,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string | null
) {
  let dateClause = "segments.date DURING LAST_30_DAYS";
  if (timeRange.since && timeRange.until) {
    dateClause = `segments.date BETWEEN '${timeRange.since}' AND '${timeRange.until}'`;
  }
  const query = `
    SELECT
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM ad_group
    WHERE ad_group.id = ${adGroupId}
      AND ${dateClause}
  `;
  const rows = await googleAdsSearch(
    customerId,
    query,
    accessToken,
    developerToken,
    loginCustomerId
  );
  const agg = { spend: 0, impressions: 0, clicks: 0, conversions: 0, ctr: 0, cpc: 0 };
  for (const row of rows) {
    const m = parseGoogleRow(row);
    agg.spend += m.spend;
    agg.impressions += m.impressions;
    agg.clicks += m.clicks;
    agg.conversions += m.conversions;
  }
  agg.ctr = agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : 0;
  agg.cpc = agg.clicks > 0 ? agg.spend / agg.clicks : 0;
  return agg;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !supabaseServiceKey) {
      return json({ error: { message: "Supabase not configured" } }, 500);
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let action = "";
    let body: Record<string, unknown> = {};
    try {
      const requestBody = await req.json();
      action = requestBody.action as string;
      body = { ...requestBody };
      delete body.action;
    } catch {
      return json({ error: { message: "Invalid request body" } });
    }

    if (action === "refresh-node-metrics") {
      const nodes = (body.nodes || []) as NodeInput[];
      const timeRange = (body.time_range as TimeRange) || defaultTimeRange();
      const fetchedAt = new Date().toISOString();

      const metaToken = await getMetaToken(supabase);
      const googleToken = await getGoogleAccessToken(supabase);
      const developerToken = await getSecret(supabase, "GOOGLE_ADS_DEVELOPER_TOKEN");
      const loginCustomerId = await getSecret(supabase, "GOOGLE_ADS_LOGIN_CUSTOMER_ID");

      const results: Record<string, { metrics?: unknown; error?: string }> = {};

      await Promise.all(
        nodes.map(async (node) => {
          const id = node.nodeId;
          try {
            if (node.googleLink?.customerId && node.googleLink?.campaignId) {
              if (!googleToken || !developerToken) {
                results[id] = { error: "Google Ads não configurado" };
                return;
              }
              const cid = String(node.googleLink.customerId).replace(/\D/g, "");
              let metrics;
              if (node.googleLink.adGroupId) {
                metrics = await fetchGoogleAdGroupMetrics(
                  cid,
                  String(node.googleLink.adGroupId),
                  timeRange,
                  googleToken,
                  developerToken,
                  loginCustomerId
                );
              } else {
                metrics = await fetchGoogleCampaignMetrics(
                  cid,
                  String(node.googleLink.campaignId),
                  timeRange,
                  googleToken,
                  developerToken,
                  loginCustomerId
                );
              }
              results[id] = { metrics: { ...metrics, fetchedAt } };
              return;
            }

            if (node.metaLink?.campaignId && metaToken) {
              const entityId = node.metaLink.adId || node.metaLink.adSetId
                ? String(node.metaLink.adId || node.metaLink.adSetId)
                : String(node.metaLink.campaignId);
              const metrics = await fetchMetaEntityInsights(
                entityId,
                metaToken,
                timeRange,
                node.metaLink?.placement || null
              );
              results[id] = { metrics: { ...metrics, fetchedAt } };
              return;
            }

            results[id] = { error: "Nó sem vínculo Meta/Google" };
          } catch (err) {
            results[id] = {
              error: err instanceof Error ? err.message : "Erro ao buscar métricas",
            };
          }
        })
      );

      return json({ results, fetchedAt, timeRange });
    }

    if (action === "count-contacts-attribution") {
      const clienteId = body.cliente_id as string;
      const nodes = (body.nodes || []) as AttributionInput[];
      const timeRange = (body.time_range as TimeRange) || defaultTimeRange();
      const since = timeRange.since
        ? new Date(`${timeRange.since}T00:00:00Z`).toISOString()
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const until = timeRange.until
        ? new Date(`${timeRange.until}T23:59:59Z`).toISOString()
        : new Date().toISOString();

      if (!clienteId) {
        return json({ error: { message: "cliente_id is required" }, counts: {} });
      }

      const { data: contacts, error } = await supabase
        .from("cliente_whatsapp_contact")
        .select(
          "id, utm_campaign, utm_source, origin_source, tracking_data, first_seen_at, last_message_at, qualificado, comprou, valor_venda"
        )
        .eq("cliente_id", clienteId)
        .gte("first_seen_at", since)
        .lte("first_seen_at", until);

      if (error) {
        return json({ error: { message: error.message }, counts: {} });
      }

      const counts: Record<string, number> = {};
      const anchorNodes = nodes.filter(
        (n) =>
          isCampaignAnchorNode(n) &&
          (n.utmCampaign || n.metaCampaignId || n.googleCampaignId)
      );
      const matchableNodes =
        anchorNodes.length > 0
          ? anchorNodes
          : nodes.filter((n) => n.utmCampaign || n.metaCampaignId);

      for (const node of nodes) {
        counts[node.nodeId] = 0;
      }

      const assignedContacts = new Set<string>();
      let uniqueContactCount = 0;
      let qualificados = 0;
      let vendas = 0;
      let valorTotal = 0;

      for (const c of contacts || []) {
        const contactIds = extractContactIds(c);
        let bestNode: AttributionInput | null = null;
        let bestScore = 0;

        for (const node of matchableNodes) {
          const score = scoreContactNodeMatch(contactIds, node);
          if (score > bestScore && score >= 20) {
            bestScore = score;
            bestNode = node;
          }
        }

        if (!bestNode) continue;
        uniqueContactCount += 1;
        counts[bestNode.nodeId] = (counts[bestNode.nodeId] || 0) + 1;
        assignedContacts.add(String(c.id));

        if (c.qualificado === true) qualificados += 1;
        if (c.comprou === true) {
          vendas += 1;
          valorTotal += parseFloat(String(c.valor_venda ?? 0)) || 0;
        }
      }

      return json({
        counts,
        uniqueContactCount,
        commercial: { qualificados, vendas, valorTotal },
        since,
        until,
      });
    }

    if (action === "hub-results-summary") {
      const clienteId = body.cliente_id as string;
      const nodes = (body.nodes || []) as AttributionInput[];
      const timeRange = (body.time_range as TimeRange) || defaultTimeRange();
      const metricsNodes = (body.metrics_nodes || []) as NodeInput[];

      const since = timeRange.since
        ? new Date(`${timeRange.since}T00:00:00Z`).toISOString()
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const until = timeRange.until
        ? new Date(`${timeRange.until}T23:59:59Z`).toISOString()
        : new Date().toISOString();

      if (!clienteId) {
        return json({ error: { message: "cliente_id is required" } });
      }

      let totalSpendMeta = 0;
      let totalSpendGoogle = 0;
      const fetchedAt = new Date().toISOString();
      const metaToken = await getMetaToken(supabase);
      const googleToken = await getGoogleAccessToken(supabase);
      const developerToken = await getSecret(supabase, "GOOGLE_ADS_DEVELOPER_TOKEN");
      const loginCustomerId = await getSecret(supabase, "GOOGLE_ADS_LOGIN_CUSTOMER_ID");

      const campaignMetricsNodes = metricsNodes.filter((n) => {
        const row = nodes.find((x) => x.nodeId === n.nodeId);
        return row && isCampaignAnchorNode(row);
      });

      await Promise.all(
        campaignMetricsNodes.map(async (node) => {
          const row = nodes.find((x) => x.nodeId === node.nodeId);
          if (!row) return;
          try {
            if (node.googleLink?.customerId && node.googleLink?.campaignId) {
              if (!googleToken || !developerToken) return;
              const cid = String(node.googleLink.customerId).replace(/\D/g, "");
              const metrics = node.googleLink.adGroupId
                ? await fetchGoogleAdGroupMetrics(
                    cid,
                    String(node.googleLink.adGroupId),
                    timeRange,
                    googleToken,
                    developerToken,
                    loginCustomerId
                  )
                : await fetchGoogleCampaignMetrics(
                    cid,
                    String(node.googleLink.campaignId),
                    timeRange,
                    googleToken,
                    developerToken,
                    loginCustomerId
                  );
              totalSpendGoogle += metrics.spend;
              return;
            }
            if (node.metaLink?.campaignId && metaToken) {
              const entityId = String(node.metaLink.campaignId);
              const metrics = await fetchMetaEntityInsights(
                entityId,
                metaToken,
                timeRange,
                null
              );
              totalSpendMeta += metrics.spend;
            }
          } catch {
            // ignore per-node failures in summary
          }
        })
      );

      let spendSource = campaignMetricsNodes.length ? "funil" : "none";
      if (totalSpendMeta <= 0) {
        const { data: clienteRow } = await supabase
          .from("clientes")
          .select("meta_rastreamento")
          .eq("id", clienteId)
          .maybeSingle();
        const accountIds = parseClienteAdAccountIds(clienteRow?.meta_rastreamento);
        if (accountIds.length) {
          const clientToken = await getClienteMetaToken(supabase, clienteId);
          let accountSpend = await sumMetaEntitySpend(accountIds, clientToken, timeRange);
          if (accountSpend <= 0 && metaToken && metaToken !== clientToken) {
            accountSpend = await sumMetaEntitySpend(accountIds, metaToken, timeRange);
          }
          if (accountSpend > 0) {
            totalSpendMeta = accountSpend;
            spendSource = "ad_accounts";
          }
        }
      }

      const [uniqueRes, qualRes, salesRes] = await Promise.all([
        supabase
          .from("cliente_whatsapp_contact")
          .select("id", { count: "exact", head: true })
          .eq("cliente_id", clienteId)
          .gte("last_message_at", since)
          .lte("last_message_at", until),
        supabase
          .from("cliente_whatsapp_contact")
          .select("id", { count: "exact", head: true })
          .eq("cliente_id", clienteId)
          .gte("last_message_at", since)
          .lte("last_message_at", until)
          .eq("qualificado", true),
        supabase
          .from("cliente_whatsapp_contact")
          .select("valor_venda", { count: "exact" })
          .eq("cliente_id", clienteId)
          .gte("last_message_at", since)
          .lte("last_message_at", until)
          .eq("comprou", true),
      ]);

      const uniqueContactCount = uniqueRes.error ? 0 : uniqueRes.count || 0;
      const qualificados = qualRes.error ? 0 : qualRes.count || 0;
      const vendas = salesRes.error ? 0 : salesRes.count || 0;
      let valorTotal = 0;
      if (!salesRes.error && salesRes.data) {
        for (const row of salesRes.data) {
          valorTotal += parseFloat(String((row as { valor_venda?: unknown }).valor_venda ?? 0)) || 0;
        }
      }

      const totalSpend = totalSpendMeta + totalSpendGoogle;
      const cpl = uniqueContactCount > 0 ? totalSpend / uniqueContactCount : 0;
      const roas = totalSpend > 0 ? valorTotal / totalSpend : 0;

      return json({
        fetchedAt,
        since,
        until,
        spendSource,
        spend: { meta: totalSpendMeta, google: totalSpendGoogle, total: totalSpend },
        leads: { unique: uniqueContactCount, qualificados, vendas, valorTotal },
        cpl,
        roas,
      });
    }

    return json({ error: { message: `Unknown action: ${action}` } });
  } catch (err) {
    return json({
      error: { message: err instanceof Error ? err.message : "Internal error" },
    });
  }
});
