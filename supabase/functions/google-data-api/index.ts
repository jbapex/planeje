/**
 * Google dados da agência: Analytics (GA4), Meu Negócio e Tag Manager.
 * OAuth separado do Ads (adwords) e do Drive. Reaproveita Client ID/Secret Ads ou Drive.
 * Secrets: GOOGLE_DATA_REFRESH_TOKEN + GOOGLE_ADS_* ou GOOGLE_DRIVE_*.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const DATA_SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/business.manage",
  "https://www.googleapis.com/auth/tagmanager.readonly",
  "openid",
  "email",
  "profile",
].join(" ");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getSecret(
  supabase: ReturnType<typeof createClient>,
  envName: string,
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

async function getOAuthClient(supabase: ReturnType<typeof createClient>) {
  const adsId = await getSecret(supabase, "GOOGLE_ADS_CLIENT_ID");
  const adsSecret = await getSecret(supabase, "GOOGLE_ADS_CLIENT_SECRET");
  const driveId = await getSecret(supabase, "GOOGLE_DRIVE_CLIENT_ID");
  const driveSecret = await getSecret(supabase, "GOOGLE_DRIVE_CLIENT_SECRET");
  const clientId = adsId || driveId;
  const clientSecret = adsSecret || driveSecret;
  const refreshToken = await getSecret(supabase, "GOOGLE_DATA_REFRESH_TOKEN");
  return {
    clientId,
    clientSecret,
    refreshToken,
    usingAdsClient: Boolean(adsId && adsSecret),
  };
}

async function refreshAccessToken(clientId: string, clientSecret: string, refreshToken: string) {
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
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Falha ao obter access token Google");
  }
  return data.access_token as string;
}

function googleErrorMessage(data: unknown, fallback: string) {
  const err = (data as { error?: { message?: string; status?: string } })?.error;
  return err?.message || fallback;
}

async function googleFetch(url: string, accessToken: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 400) };
  }
  if (!res.ok) {
    throw new Error(googleErrorMessage(data, text.slice(0, 400) || `HTTP ${res.status}`));
  }
  return data;
}

function parseGa4PropertyId(raw: unknown) {
  const text = String(raw || "").trim();
  const match = text.match(/properties\/(\d+)/i) || text.match(/^(\d{6,})$/);
  return match ? match[1] : "";
}

function ymd(value: Date) {
  return value.toISOString().slice(0, 10);
}

function last30Range() {
  const until = new Date();
  const since = new Date();
  since.setDate(since.getDate() - 29);
  return { since: ymd(since), until: ymd(until) };
}

function metricFromGa4Row(row: Record<string, unknown>, index: number) {
  const values = Array.isArray(row.metricValues) ? row.metricValues : [];
  const cell = values[index] as { value?: string } | undefined;
  return Number(cell?.value || 0) || 0;
}

async function listAnalyticsProperties(accessToken: string) {
  const data = await googleFetch(
    "https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200",
    accessToken,
  );
  const summaries = Array.isArray(data.accountSummaries) ? data.accountSummaries : [];
  const properties: Record<string, string>[] = [];
  for (const account of summaries as Record<string, unknown>[]) {
    const propertySummaries = Array.isArray(account.propertySummaries) ? account.propertySummaries : [];
    for (const property of propertySummaries as Record<string, unknown>[]) {
      const resource = String(property.property || "");
      const id = parseGa4PropertyId(resource);
      if (!id) continue;
      properties.push({
        id,
        resource: `properties/${id}`,
        name: String(property.displayName || id),
        accountId: String(account.account || "").replace("accounts/", ""),
        accountName: String(account.displayName || ""),
      });
    }
  }
  return properties;
}

async function listBusinessLocations(accessToken: string) {
  const accountsData = await googleFetch(
    "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
    accessToken,
  );
  const accounts = Array.isArray(accountsData.accounts) ? accountsData.accounts : [];
  const locations: Record<string, string>[] = [];
  for (const account of accounts as Record<string, unknown>[]) {
    const accountName = String(account.name || "");
    if (!accountName) continue;
    const locData = await googleFetch(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations?readMask=name,title,storefrontAddress,metadata&pageSize=100`,
      accessToken,
    );
    const rows = Array.isArray(locData.locations) ? locData.locations : [];
    for (const location of rows as Record<string, unknown>[]) {
      const name = String(location.name || "");
      if (!name) continue;
      locations.push({
        name,
        title: String(location.title || name),
        accountName,
        accountId: String(account.accountNumber || account.name || ""),
      });
    }
  }
  return { accounts: accounts.length, locations };
}

async function listTagContainers(accessToken: string) {
  const accountsData = await googleFetch(
    "https://www.googleapis.com/tagmanager/v2/accounts",
    accessToken,
  );
  const accounts = Array.isArray(accountsData.account) ? accountsData.account : [];
  const containers: Record<string, string>[] = [];
  for (const account of accounts as Record<string, unknown>[]) {
    const accountId = String(account.accountId || "");
    if (!accountId) continue;
    const contData = await googleFetch(
      `https://www.googleapis.com/tagmanager/v2/accounts/${accountId}/containers`,
      accessToken,
    );
    const rows = Array.isArray(contData.container) ? contData.container : [];
    for (const container of rows as Record<string, unknown>[]) {
      containers.push({
        accountId,
        accountName: String(account.name || ""),
        containerId: String(container.containerId || ""),
        name: String(container.name || container.containerId || ""),
        publicId: String(container.publicId || ""),
      });
    }
  }
  return containers;
}

function ga4Date(raw: string) {
  const text = String(raw || "");
  if (/^\d{8}$/.test(text)) return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  return text.slice(0, 10);
}

function ga4Dim(row: Record<string, unknown>) {
  const dims = Array.isArray(row.dimensionValues) ? row.dimensionValues : [];
  return String((dims[0] as { value?: string } | undefined)?.value || "");
}

function ga4Request(
  since: string,
  until: string,
  metrics: string[],
  dimension?: string,
  limit = 12,
  orderMetric = "sessions",
) {
  const request: Record<string, unknown> = {
    dateRanges: [{ startDate: since, endDate: until }],
    metrics: metrics.map((name) => ({ name })),
    limit,
  };
  if (dimension) {
    request.dimensions = [{ name: dimension }];
    request.orderBys = dimension === "date"
      ? [{ dimension: { dimensionName: "date" } }]
      : [{ metric: { metricName: orderMetric }, desc: true }];
  }
  return request;
}

async function runGa4Batch(
  accessToken: string,
  propertyId: string,
  requests: Record<string, unknown>[],
) {
  const resource = `properties/${parseGa4PropertyId(propertyId)}`;
  return googleFetch(
    `https://analyticsdata.googleapis.com/v1beta/${resource}:batchRunReports`,
    accessToken,
    { method: "POST", body: JSON.stringify({ requests }) },
  );
}

function reportRows(report: Record<string, unknown> | undefined) {
  return Array.isArray(report?.rows) ? report.rows as Record<string, unknown>[] : [];
}

function shiftIsoDate(ymd: string, days: number) {
  const date = new Date(`${ymd}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function previousAnalyticsRange(since: string, until: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || !/^\d{4}-\d{2}-\d{2}$/.test(until) || since > until) return null;
  const start = Date.parse(`${since}T00:00:00Z`);
  const end = Date.parse(`${until}T00:00:00Z`);
  const days = Math.round((end - start) / 86400000) + 1;
  const prevUntil = shiftIsoDate(since, -1);
  const prevSince = shiftIsoDate(prevUntil, -(days - 1));
  return { since: prevSince, until: prevUntil };
}

async function analyticsOverview(accessToken: string, propertyId: string, since: string, until: string) {
  if (!parseGa4PropertyId(propertyId)) throw new Error("propertyId inválido");
  const conversionMetric = async (name: "keyEvents" | "conversions") => {
    const core = [
      ga4Request(since, until, [
        "sessions",
        "activeUsers",
        "newUsers",
        "engagedSessions",
        "engagementRate",
        "averageSessionDuration",
        name,
      ]),
      ga4Request(since, until, ["sessions", "activeUsers", name], "date", 400, "sessions"),
      ga4Request(since, until, ["sessions", "activeUsers", name, "engagementRate"], "sessionDefaultChannelGroup", 12),
      ga4Request(since, until, ["sessions", "activeUsers", name], "landingPage", 15),
      ga4Request(since, until, ["sessions", "activeUsers", name], "deviceCategory", 6),
    ];
    const prev = previousAnalyticsRange(since, until);
    const extra = [
      ga4Request(since, until, ["sessions", "activeUsers", name], "sessionSourceMedium", 12),
      ga4Request(since, until, ["sessions", "activeUsers"], "city", 10),
      ga4Request(since, until, ["eventCount", "totalUsers"], "eventName", 15, "eventCount"),
      ...(prev ? [ga4Request(prev.since, prev.until, ["sessions", "activeUsers", name])] : []),
      ga4Request(since, until, ["sessions", "activeUsers", name], "sessionCampaignName", 12),
    ];
    const main = await runGa4Batch(accessToken, propertyId, core);
    let more: Record<string, unknown> = { reports: [] };
    try {
      more = await runGa4Batch(accessToken, propertyId, extra.slice(0, 3));
    } catch {
      more = { reports: [] };
    }
    let compare: Record<string, unknown> = { reports: [] };
    try {
      compare = await runGa4Batch(accessToken, propertyId, extra.slice(3));
    } catch {
      compare = { reports: [] };
    }
    return { main, more, compare };
  };
  let packed: { main: Record<string, unknown>; more: Record<string, unknown>; compare: Record<string, unknown> };
  try {
    packed = await conversionMetric("keyEvents");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/keyEvents|not found/i.test(msg)) throw err;
    packed = await conversionMetric("conversions");
  }
  const reports = Array.isArray(packed.main.reports) ? packed.main.reports as Record<string, unknown>[] : [];
  const extraReports = Array.isArray(packed.more.reports) ? packed.more.reports as Record<string, unknown>[] : [];
  const compareReports = Array.isArray(packed.compare?.reports) ? packed.compare.reports as Record<string, unknown>[] : [];
  const totalRow = reportRows(reports[0])[0];
  const totals = {
    sessions: totalRow ? metricFromGa4Row(totalRow, 0) : 0,
    users: totalRow ? metricFromGa4Row(totalRow, 1) : 0,
    newUsers: totalRow ? metricFromGa4Row(totalRow, 2) : 0,
    engagedSessions: totalRow ? metricFromGa4Row(totalRow, 3) : 0,
    engagementRate: totalRow ? metricFromGa4Row(totalRow, 4) : 0,
    averageSessionDuration: totalRow ? metricFromGa4Row(totalRow, 5) : 0,
    conversions: totalRow ? metricFromGa4Row(totalRow, 6) : 0,
  };
  const daily = reportRows(reports[1]).map((row) => ({
    date: ga4Date(ga4Dim(row)),
    sessions: metricFromGa4Row(row, 0),
    users: metricFromGa4Row(row, 1),
    conversions: metricFromGa4Row(row, 2),
  })).filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date));
  const channels = reportRows(reports[2]).map((row) => ({
    channel: ga4Dim(row) || "—",
    sessions: metricFromGa4Row(row, 0),
    users: metricFromGa4Row(row, 1),
    conversions: metricFromGa4Row(row, 2),
    engagementRate: metricFromGa4Row(row, 3),
  }));
  const pages = reportRows(reports[3]).map((row) => ({
    page: ga4Dim(row) || "(not set)",
    sessions: metricFromGa4Row(row, 0),
    users: metricFromGa4Row(row, 1),
    conversions: metricFromGa4Row(row, 2),
  }));
  const devices = reportRows(reports[4]).map((row) => ({
    device: ga4Dim(row) || "—",
    sessions: metricFromGa4Row(row, 0),
    users: metricFromGa4Row(row, 1),
    conversions: metricFromGa4Row(row, 2),
  }));
  const sources = reportRows(extraReports[0]).map((row) => ({
    source: ga4Dim(row) || "—",
    sessions: metricFromGa4Row(row, 0),
    users: metricFromGa4Row(row, 1),
    conversions: metricFromGa4Row(row, 2),
  }));
  const cities = reportRows(extraReports[1]).map((row) => ({
    city: ga4Dim(row) || "—",
    sessions: metricFromGa4Row(row, 0),
    users: metricFromGa4Row(row, 1),
  }));
  const events = reportRows(extraReports[2]).map((row) => ({
    event: ga4Dim(row) || "—",
    count: metricFromGa4Row(row, 0),
    users: metricFromGa4Row(row, 1),
  }));
  const prev = previousAnalyticsRange(since, until);
  const previousReport = prev ? compareReports[0] : undefined;
  const previousRow = reportRows(previousReport)[0];
  const previous = prev && previousReport ? {
    since: prev.since,
    until: prev.until,
    sessions: previousRow ? metricFromGa4Row(previousRow, 0) : 0,
    users: previousRow ? metricFromGa4Row(previousRow, 1) : 0,
    conversions: previousRow ? metricFromGa4Row(previousRow, 2) : 0,
  } : null;
  const campaignReport = compareReports[prev ? 1 : 0];
  const campaigns = reportRows(campaignReport).map((row) => ({
    campaign: ga4Dim(row) || "(not set)",
    sessions: metricFromGa4Row(row, 0),
    users: metricFromGa4Row(row, 1),
    conversions: metricFromGa4Row(row, 2),
  }));
  return { since, until, totals, daily, rows: channels, channels, pages, devices, sources, cities, events, previous, campaigns };
}

function sumSeries(points: unknown) {
  const rows = Array.isArray(points) ? points : [];
  let total = 0;
  for (const point of rows as Record<string, unknown>[]) {
    total += Number(point.value || 0) || 0;
  }
  return total;
}

async function businessOverview(accessToken: string, locationName: string, since: string, until: string) {
  const name = String(locationName || "").trim();
  if (!name) throw new Error("locationName inválido");
  const range = {
    startDate: { year: Number(since.slice(0, 4)), month: Number(since.slice(5, 7)), day: Number(since.slice(8, 10)) },
    endDate: { year: Number(until.slice(0, 4)), month: Number(until.slice(5, 7)), day: Number(until.slice(8, 10)) },
  };
  const metrics = [
    "WEBSITE_CLICKS",
    "CALL_CLICKS",
    "BUSINESS_DIRECTION_REQUESTS",
    "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
    "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
    "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
    "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
  ];
  const data = await googleFetch(
    `https://businessprofileperformance.googleapis.com/v1/${name}:fetchMultiDailyMetricsTimeSeries`,
    accessToken,
    { method: "POST", body: JSON.stringify({ dailyMetrics: metrics, dailyRange: range }) },
  );
  const series = Array.isArray(data.multiDailyMetricTimeSeries) ? data.multiDailyMetricTimeSeries : [];
  const totals: Record<string, number> = {
    website: 0,
    calls: 0,
    directions: 0,
    maps: 0,
    impressions: 0,
  };
  const byDate = new Map<string, Record<string, number | string>>();
  const addDay = (ymd: string, field: string, value: number) => {
    if (!ymd) return;
    const row = byDate.get(ymd) || { date: ymd, impressions: 0, maps: 0, calls: 0, directions: 0, website: 0 };
    row[field] = Number(row[field] || 0) + value;
    byDate.set(ymd, row);
  };
  for (const group of series as Record<string, unknown>[]) {
    const daily = Array.isArray(group.dailyMetricTimeSeries) ? group.dailyMetricTimeSeries : [];
    for (const item of daily as Record<string, unknown>[]) {
      const key = String(item.dailyMetric || "");
      const points = (item.timeSeries as { datedValues?: unknown } | undefined)?.datedValues;
      const rows = Array.isArray(points) ? points as Record<string, unknown>[] : [];
      const value = sumSeries(rows);
      const field = key === "WEBSITE_CLICKS"
        ? "website"
        : key === "CALL_CLICKS"
          ? "calls"
          : key === "BUSINESS_DIRECTION_REQUESTS"
            ? "directions"
            : key.includes("MAPS")
              ? "maps"
              : key.includes("SEARCH")
                ? "impressions"
                : "";
      if (!field) continue;
      totals[field] += value;
      for (const point of rows) {
        const date = (point.date || {}) as Record<string, unknown>;
        const year = Number(date.year);
        const month = Number(date.month);
        const day = Number(date.day);
        const ymd = year && month && day
          ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
          : "";
        addDay(ymd, field, Number(point.value || 0) || 0);
      }
    }
  }
  const daily = [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return { since, until, totals, daily };
}

function tagParameterText(param: Record<string, unknown>) {
  if (typeof param.value === "string") return param.value.trim();
  return "";
}

function tagPreview(row: Record<string, unknown>) {
  const params = Array.isArray(row.parameter) ? row.parameter as Record<string, unknown>[] : [];
  const texts = params
    .map((param) => ({ key: String(param.key || ""), value: tagParameterText(param) }))
    .filter((param) => param.key && param.value);
  const measurement = texts.find((param) => /measurementId|tagId|trackingId|conversionId/i.test(param.key));
  const html = texts.find((param) => param.key === "html");
  const snippet = html
    ? html.value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180)
    : "";
  const notes = texts
    .filter((param) => param.key !== "html" && param !== measurement)
    .slice(0, 3)
    .map((param) => `${param.key}: ${param.value.slice(0, 80)}`);
  return {
    measurementId: measurement ? measurement.value.slice(0, 80) : "",
    snippet,
    notes,
  };
}

async function tagManagerOverview(accessToken: string, accountId: string, containerId: string) {
  const account = String(accountId || "").replace(/\D/g, "");
  const container = String(containerId || "").replace(/\D/g, "");
  if (!account || !container) throw new Error("container inválido");
  const live = await googleFetch(
    `https://www.googleapis.com/tagmanager/v2/accounts/${account}/containers/${container}/versions:live`,
    accessToken,
  );
  const triggerRows = Array.isArray(live.trigger) ? live.trigger as Record<string, unknown>[] : [];
  const builtinTriggers: Record<string, string> = {
    "2147479553": "Todas as páginas",
    "2147479572": "Inicialização de consentimento",
    "2147479573": "Inicialização",
  };
  const triggerNames = new Map(triggerRows.map((row) => [String(row.triggerId || ""), String(row.name || "")]));
  const tagRows = Array.isArray(live.tag) ? live.tag as Record<string, unknown>[] : [];
  const variableRows = Array.isArray(live.variable) ? live.variable as Record<string, unknown>[] : [];
  const tagList = tagRows.map((row) => {
    const firing = Array.isArray(row.firingTriggerId) ? row.firingTriggerId : [];
    const preview = tagPreview(row);
    return {
      name: String(row.name || "Sem nome"),
      type: String(row.type || ""),
      paused: Boolean(row.paused),
      fires: firing.map((id) => triggerNames.get(String(id)) || builtinTriggers[String(id)] || String(id)).filter(Boolean),
      measurementId: preview.measurementId,
      snippet: preview.snippet,
      notes: preview.notes,
    };
  });
  const triggerList = triggerRows.map((row) => ({
    name: String(row.name || "Sem nome"),
    type: String(row.type || ""),
  }));
  const variableList = variableRows.map((row) => {
    const params = Array.isArray(row.parameter) ? row.parameter as Record<string, unknown>[] : [];
    const preferred = params.find((param) => /^(value|measurementId|tagId)$/i.test(String(param.key || "")) && typeof param.value === "string");
    const any = preferred || params.find((param) => typeof param.value === "string" && String(param.key || "") !== "html");
    const value = any && typeof any.value === "string" ? any.value.trim().slice(0, 120) : "";
    return {
      name: String(row.name || "Sem nome"),
      type: String(row.type || ""),
      value,
    };
  });
  const containerRow = (live.container as Record<string, unknown> | undefined) || {};
  return {
    accountId: account,
    containerId: container,
    containerName: String(containerRow.name || live.name || container),
    publicId: String(containerRow.publicId || ""),
    versionName: String(live.name || ""),
    fingerprint: String(live.fingerprint || ""),
    tagManagerUrl: String(live.tagManagerUrl || containerRow.tagManagerUrl || ""),
    tags: tagList.length,
    triggers: triggerList.length,
    variables: variableList.length,
    tagList,
    triggerList,
    variableList,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !supabaseServiceKey) throw new Error("Supabase credentials not configured");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let action = "";
    let body: Record<string, unknown> = {};
    try {
      const requestBody = await req.json();
      action = String(requestBody.action || "");
      body = { ...requestBody };
      delete body.action;
    } catch {
      return json({ error: { message: "Invalid request body" } });
    }
    if (!action) return json({ error: { message: "Action is required" } });

    const oauth = await getOAuthClient(supabase);

    if (action === "exchange-oauth-code") {
      const cid = String(body.clientId || oauth.clientId || "").trim();
      const csec = String(body.clientSecret || oauth.clientSecret || "").trim();
      const code = String(body.code || "").trim();
      const redirectUri = String(body.redirectUri || "http://127.0.0.1:8080").trim();
      if (!cid || !csec || !code) {
        return json({
          error: { message: "Client ID, Secret e code são obrigatórios.", code: "CREDENTIALS_MISSING" },
        });
      }
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: cid,
          client_secret: csec,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.refresh_token) {
        return json({
          error: {
            message:
              data.error_description ||
              data.error ||
              "Não veio refresh_token. O code expira em minutos; autorize de novo.",
          },
        });
      }
      return json({ refreshToken: data.refresh_token as string, scope: data.scope || DATA_SCOPES });
    }

    if (!oauth.clientId || !oauth.clientSecret) {
      return json({
        connected: false,
        error: {
          message: "Falta Client ID/Secret do Google Ads ou do Drive da agência.",
          code: "CREDENTIALS_MISSING",
        },
      });
    }

    if (action === "check-connection") {
      if (!oauth.refreshToken) {
        return json({
          connected: false,
          error: {
            message: "Autorize Analytics, Meu Negócio e Tag Manager em Configurações → Google dados.",
            code: "CREDENTIALS_MISSING",
          },
        });
      }
      try {
        const accessToken = await refreshAccessToken(oauth.clientId, oauth.clientSecret, oauth.refreshToken);
        let email = "";
        try {
          const info = await googleFetch("https://www.googleapis.com/oauth2/v2/userinfo", accessToken);
          email = String(info.email || "");
        } catch {
          email = "";
        }
        const probe = async (label: string, run: () => Promise<unknown>) => {
          try {
            await run();
            return { ok: true };
          } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
          }
        };
        const [analytics, business, tagmanager] = await Promise.all([
          probe("analytics", () =>
            googleFetch("https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=1", accessToken),
          ),
          probe("business", () =>
            googleFetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", accessToken),
          ),
          probe("tagmanager", () => googleFetch("https://www.googleapis.com/tagmanager/v2/accounts", accessToken)),
        ]);
        return json({
          connected: true,
          email,
          usingAdsClient: oauth.usingAdsClient,
          analytics,
          business,
          tagmanager,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "OAuth falhou";
        const looksLikeCode = String(oauth.refreshToken || "").startsWith("4/");
        return json({
          connected: false,
          error: {
            message: looksLikeCode
              ? "O token salvo ainda é o code. Autorize de novo e cole a barra http://127.0.0.1:8080/?code=..."
              : msg,
          },
        });
      }
    }

    if (!oauth.refreshToken) {
      return json({
        error: {
          message: "Autorize Analytics, Meu Negócio e Tag Manager em Configurações → Google dados.",
          code: "CREDENTIALS_MISSING",
        },
      });
    }

    const accessToken = await refreshAccessToken(oauth.clientId, oauth.clientSecret, oauth.refreshToken);
    const range = last30Range();
    const since = String(body.since || range.since);
    const until = String(body.until || range.until);

    if (action === "list-analytics-properties") {
      try {
        return json({ properties: await listAnalyticsProperties(accessToken) });
      } catch (err) {
        return json({
          properties: [],
          error: { message: err instanceof Error ? err.message : "Não foi possível listar o Analytics." },
        });
      }
    }

    if (action === "list-business-locations") {
      try {
        const listed = await listBusinessLocations(accessToken);
        return json(listed);
      } catch (err) {
        return json({
          locations: [],
          accounts: 0,
          error: { message: err instanceof Error ? err.message : "Não foi possível listar o Meu Negócio." },
        });
      }
    }

    if (action === "list-tag-containers") {
      try {
        return json({ containers: await listTagContainers(accessToken) });
      } catch (err) {
        return json({
          containers: [],
          error: { message: err instanceof Error ? err.message : "Não foi possível listar o Tag Manager." },
        });
      }
    }

    if (action === "get-analytics-overview") {
      try {
        const overview = await analyticsOverview(accessToken, String(body.propertyId || ""), since, until);
        return json(overview);
      } catch (err) {
        return json({
          error: { message: err instanceof Error ? err.message : "Não foi possível ler o Analytics." },
          totals: { sessions: 0, users: 0, conversions: 0 },
          rows: [],
        });
      }
    }

    if (action === "get-business-overview") {
      try {
        const overview = await businessOverview(accessToken, String(body.locationName || body.location || ""), since, until);
        return json(overview);
      } catch (err) {
        return json({
          error: { message: err instanceof Error ? err.message : "Não foi possível ler o Meu Negócio." },
          totals: { impressions: 0, maps: 0, calls: 0, directions: 0, website: 0 },
        });
      }
    }

    if (action === "get-tagmanager-overview") {
      try {
        const overview = await tagManagerOverview(
          accessToken,
          String(body.accountId || ""),
          String(body.containerId || ""),
        );
        return json(overview);
      } catch (err) {
        return json({
          error: { message: err instanceof Error ? err.message : "Não foi possível ler o Tag Manager." },
          tags: 0,
          triggers: 0,
        });
      }
    }

    return json({ error: { message: `Unknown action: ${action}` } });
  } catch (err) {
    return json({ error: { message: err instanceof Error ? err.message : "Internal error" } });
  }
});
