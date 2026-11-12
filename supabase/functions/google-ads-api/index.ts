import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleGoogleDataManagerConversion } from "../_shared/googleDataManagerConversions.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const API_VERSION = "v25";

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

async function getGoogleCredentials(supabase: ReturnType<typeof createClient>) {
  const developerToken = await getSecret(supabase, "GOOGLE_ADS_DEVELOPER_TOKEN");
  const clientId = await getSecret(supabase, "GOOGLE_ADS_CLIENT_ID");
  const clientSecret = await getSecret(supabase, "GOOGLE_ADS_CLIENT_SECRET");
  const refreshToken = await getSecret(supabase, "GOOGLE_ADS_REFRESH_TOKEN");
  const loginCustomerId = await getSecret(supabase, "GOOGLE_ADS_LOGIN_CUSTOMER_ID");

  return { developerToken, clientId, clientSecret, refreshToken, loginCustomerId };
}

async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<string> {
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

function cleanCustomerId(id: string) {
  return String(id || "").replace(/-/g, "").trim();
}

function buildHeaders(
  accessToken: string,
  developerToken?: string | null,
  loginCustomerId?: string | null
) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
  // Desde 09/09/2026 o token é opcional e ignorado; o acesso vem do projeto Cloud do OAuth.
  const token = String(developerToken || "").trim();
  if (token) headers["developer-token"] = token;
  if (loginCustomerId) {
    headers["login-customer-id"] = cleanCustomerId(loginCustomerId);
  }
  return headers;
}

async function googleAdsPost(
  path: string,
  payload: unknown,
  accessToken: string,
  developerToken?: string | null,
  loginCustomerId?: string | null,
) {
  const res = await fetch(`https://googleads.googleapis.com/${API_VERSION}/${path}`, {
    method: "POST",
    headers: buildHeaders(accessToken, developerToken, loginCustomerId),
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(text.slice(0, 500));
  }
  if (!res.ok) {
    throw new Error(googleAdsErrorMessage(data, text.slice(0, 400)));
  }
  return data;
}

function parseKeywordSeedList(raw: unknown): string[] {
  const text = Array.isArray(raw) ? raw.join("\n") : String(raw || "");
  const parts = text
    .split(/[\n,;]+/)
    .map((part) => part.replace(/^["'`]+|["'`]+$/g, "").replace(/\s+/g, " ").trim())
    .filter((part) => part.length >= 2 && part.length <= 80);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(part);
    if (out.length >= 10) break;
  }
  return out;
}

const KEYWORD_MONTH: Record<string, number> = {
  JANUARY: 1,
  FEBRUARY: 2,
  MARCH: 3,
  APRIL: 4,
  MAY: 5,
  JUNE: 6,
  JULY: 7,
  AUGUST: 8,
  SEPTEMBER: 9,
  OCTOBER: 10,
  NOVEMBER: 11,
  DECEMBER: 12,
};

function mapKeywordIdeaRow(row: Record<string, unknown>) {
  const metrics = (row.keywordIdeaMetrics || row.keyword_idea_metrics || {}) as Record<string, unknown>;
  const volumes = Array.isArray(metrics.monthlySearchVolumes || metrics.monthly_search_volumes)
    ? ((metrics.monthlySearchVolumes || metrics.monthly_search_volumes) as Record<string, unknown>[])
    : [];
  const monthly = volumes
    .map((point) => {
      const monthKey = String(point.month || "").toUpperCase();
      return {
        year: Number(point.year) || 0,
        month: KEYWORD_MONTH[monthKey] || (Number(point.month) >= 1 && Number(point.month) <= 12 ? Number(point.month) : 0),
        searches: Number(point.monthlySearches || point.monthly_searches) || 0,
      };
    })
    .filter((point) => point.year && point.month)
    .sort((a, b) => a.year - b.year || a.month - b.month);
  return {
    text: String(row.text || "").trim(),
    avgMonthlySearches: Number(metrics.avgMonthlySearches || metrics.avg_monthly_searches) || 0,
    competition: String(metrics.competition || ""),
    competitionIndex: Number(metrics.competitionIndex || metrics.competition_index) || 0,
    averageCpc: microsNumber(metrics.averageCpcMicros || metrics.average_cpc_micros) / 1_000_000,
    monthly,
  };
}

function sortMappedKeywordIdeas(
  rows: ReturnType<typeof mapKeywordIdeaRow>[],
) {
  return [...rows].sort(
    (a, b) =>
      (Number(b.avgMonthlySearches) || 0) - (Number(a.avgMonthlySearches) || 0) ||
      a.text.localeCompare(b.text, "pt-BR"),
  );
}

async function googleAdsSearch(
  customerId: string,
  query: string,
  accessToken: string,
  developerToken?: string | null,
  loginCustomerId?: string | null
) {
  const cid = cleanCustomerId(customerId);
  const res = await fetch(
    `https://googleads.googleapis.com/${API_VERSION}/customers/${cid}/googleAds:search`,
    {
      method: "POST",
      headers: buildHeaders(accessToken, developerToken, loginCustomerId),
      body: JSON.stringify({ query }),
    }
  );
  const text = await res.text();
  let data: { results?: unknown[]; error?: { message?: string } };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(text.slice(0, 500));
  }
  if (!res.ok) {
    const msg =
      data?.error?.message ||
      (Array.isArray((data as { error?: { details?: unknown } })?.error?.details)
        ? JSON.stringify((data as { error: { details: unknown } }).error.details)
        : text.slice(0, 300));
    throw new Error(googleAdsErrorMessage(data, msg));
  }
  return (data.results || []) as Record<string, unknown>[];
}

function parseRowField(row: Record<string, unknown>, ...path: string[]) {
  let cur: unknown = row;
  for (const p of path) {
    if (!cur || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[p];
  }
  if (cur === undefined || cur === null) return null;
  return cur;
}

function gaqlDate(value: unknown) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function gaqlId(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length > 0 && digits.length <= 20 ? digits : "";
}

function microsNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function metricsFromRow(row: Record<string, unknown>) {
  const costMicros = microsNumber(parseRowField(row, "metrics", "costMicros"));
  return {
    impressions: microsNumber(parseRowField(row, "metrics", "impressions")),
    clicks: microsNumber(parseRowField(row, "metrics", "clicks")),
    spend: costMicros / 1_000_000,
    conversions: Number(parseRowField(row, "metrics", "conversions") || 0),
    conversionValue: Number(parseRowField(row, "metrics", "conversionsValue") || 0),
  };
}

function addDaily(
  dailyByDate: Map<string, { date: string; spend: number; clicks: number; conversions: number; impressions: number }>,
  dateValue: unknown,
  metrics: { spend: number; clicks: number; conversions: number; impressions: number }
) {
  const date = gaqlDate(dateValue);
  if (!date) return;
  const current = dailyByDate.get(date) || { date, spend: 0, clicks: 0, conversions: 0, impressions: 0 };
  current.spend += metrics.spend;
  current.clicks += metrics.clicks;
  current.conversions += metrics.conversions;
  current.impressions += metrics.impressions;
  dailyByDate.set(date, current);
}

function googleAdsErrorMessage(data: unknown, fallback: string): string {
  const err = (data as { error?: { message?: string; details?: unknown[] } })?.error;
  if (Array.isArray(err?.details)) {
    for (const detail of err.details) {
      const errors = (detail as { errors?: { message?: string }[] })?.errors;
      if (Array.isArray(errors) && errors[0]?.message) return String(errors[0].message);
    }
  }
  return err?.message || fallback;
}

async function authorizeConversionRequest(
  req: Request,
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceKey: string,
  action: string,
  body: Record<string, unknown>,
): Promise<Response | null> {
  if (req.method !== "POST") return json({ error: { message: "Use POST." } }, 405);
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer /, "");
  if (!token) return json({ error: { message: "Entre novamente no Planeje." } }, 401);
  const conversion = action !== "exchange-oauth-code";
  if (conversion && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(body.clienteId || ""))) {
    return json({ error: { message: "Cliente inválido." } }, 400);
  }
  if (conversion && token === serviceKey) return null;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!anonKey) return json({ error: { message: "Autenticação indisponível." } }, 503);
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth, error: authError } = await caller.auth.getUser(token);
  if (authError || !auth?.user) return json({ error: { message: "Sessão inválida." } }, 401);
  const { data: active, error: activeError } = await caller.rpc("planeje_current_account_access");
  if (activeError || active !== true) return json({ error: { message: "Conta ou sessão sem acesso ativo." } }, 403);
  const { data: profile, error } = await supabase.from("profiles").select("role, cliente_id").eq("id", auth.user.id).maybeSingle();
  const allowed = !error && profile && (conversion
    ? ["superadmin", "admin", "colaborador"].includes(profile.role) || (profile.role === "cliente" && profile.cliente_id === body.clienteId)
    : profile.role === "superadmin");
  return allowed ? null : json({ error: { message: "Sem acesso a esta operação ou cliente." } }, 403);
}

type ConversionActionRow = {
  id: string;
  name: string;
  resourceName: string;
  type: string;
  category: string;
  status: string;
};

const PLANEJE_CONVERSION_SPECS = [
  {
    key: "lead",
    name: "Planeje — Conversa",
    category: "SUBMIT_LEAD_FORM",
    countingType: "ONE_PER_CLICK",
  },
  {
    key: "qualified",
    name: "Planeje — Qualificado",
    category: "QUALIFIED_LEAD",
    countingType: "ONE_PER_CLICK",
  },
  {
    key: "purchase",
    name: "Planeje — Compra",
    category: "PURCHASE",
    countingType: "MANY_PER_CLICK",
  },
] as const;

function mapConversionActionRow(row: Record<string, unknown>): ConversionActionRow {
  return {
    id: String(parseRowField(row, "conversionAction", "id") || ""),
    name: String(parseRowField(row, "conversionAction", "name") || ""),
    resourceName: String(parseRowField(row, "conversionAction", "resourceName") || ""),
    type: String(parseRowField(row, "conversionAction", "type") || ""),
    category: String(parseRowField(row, "conversionAction", "category") || ""),
    status: String(parseRowField(row, "conversionAction", "status") || ""),
  };
}

function isUploadClicks(action: ConversionActionRow): boolean {
  return (
    String(action.type).toUpperCase() === "UPLOAD_CLICKS" &&
    String(action.status).toUpperCase() !== "REMOVED"
  );
}

async function fetchConversionActions(
  customerId: string,
  accessToken: string,
  developerToken?: string | null,
  loginCustomerId?: string | null,
): Promise<ConversionActionRow[]> {
  const query = `
    SELECT
      conversion_action.id,
      conversion_action.name,
      conversion_action.resource_name,
      conversion_action.type,
      conversion_action.status,
      conversion_action.category
    FROM conversion_action
    WHERE conversion_action.status != 'REMOVED'
    ORDER BY conversion_action.name
  `;
  const rows = await googleAdsSearch(
    customerId,
    query,
    accessToken,
    developerToken,
    loginCustomerId,
  );
  return rows.map(mapConversionActionRow).filter((action) => action.resourceName);
}

async function mutateConversionActions(
  customerId: string,
  operations: Record<string, unknown>[],
  accessToken: string,
  developerToken?: string | null,
  loginCustomerId?: string | null,
): Promise<{ results: { resourceName?: string }[] }> {
  const cid = cleanCustomerId(customerId);
  const res = await fetch(
    `https://googleads.googleapis.com/${API_VERSION}/customers/${cid}/conversionActions:mutate`,
    {
      method: "POST",
      headers: buildHeaders(accessToken, developerToken, loginCustomerId),
      body: JSON.stringify({ operations }),
    },
  );
  const text = await res.text();
  let data: {
    results?: { resourceName?: string }[];
    error?: { message?: string; details?: unknown[] };
  } = {};
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(text.slice(0, 500));
  }
  if (!res.ok) {
    throw new Error(googleAdsErrorMessage(data, text.slice(0, 400)));
  }
  return { results: data.results || [] };
}

async function mutateGoogleAds(
  customerId: string,
  resource: "campaigns" | "campaignBudgets" | "adGroupCriteria",
  operations: Record<string, unknown>[],
  accessToken: string,
  developerToken?: string | null,
  loginCustomerId?: string | null,
) {
  const cid = cleanCustomerId(customerId);
  const res = await fetch(
    `https://googleads.googleapis.com/${API_VERSION}/customers/${cid}/${resource}:mutate`,
    {
      method: "POST",
      headers: buildHeaders(accessToken, developerToken, loginCustomerId),
      body: JSON.stringify({ operations }),
    },
  );
  const text = await res.text();
  let data: { results?: { resourceName?: string }[]; error?: { message?: string } } = {};
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(text.slice(0, 500));
  }
  if (!res.ok) throw new Error(googleAdsErrorMessage(data, text.slice(0, 400)));
  return { results: data.results || [] };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase credentials not configured");
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

    if (!action) {
      return json({ error: { message: "Action is required" } });
    }

    if (["upload-click-conversion", "retry-click-conversion", "get-conversion-status", "exchange-oauth-code"].includes(action)) {
      const denied = await authorizeConversionRequest(req, supabase, supabaseUrl, supabaseServiceKey, action, body);
      if (denied) return denied;
    }

    const creds = await getGoogleCredentials(supabase);
    const { developerToken, clientId, clientSecret, refreshToken, loginCustomerId } = creds;

    if (action === "exchange-oauth-code") {
      const cid = String(body.clientId || clientId || "").trim();
      const csec = String(body.clientSecret || clientSecret || "").trim();
      const code = String(body.code || "").trim();
      const redirectUri = String(body.redirectUri || "http://127.0.0.1:8080").trim();
      if (!cid || !csec || !code) {
        return json({
          error: {
            message: "Client ID, Secret e code são obrigatórios para trocar por refresh token.",
            code: "CREDENTIALS_MISSING",
          },
        });
      }
      try {
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
          const msg =
            data.error_description ||
            data.error ||
            "Não veio refresh_token. O code expira em poucos minutos; autorize de novo.";
          return json({ error: { message: String(msg) } });
        }
        const scopes = String(data.scope || "").split(/\s+/);
        if (!["https://www.googleapis.com/auth/adwords", "https://www.googleapis.com/auth/datamanager"].every(scope => scopes.includes(scope))) {
          return json({ error: { code: "OAUTH_SCOPES_REQUIRED", message: "Copie uma nova URL e autorize Google Ads e Data Manager. A conexão anterior foi preservada." } });
        }
        return json({ refreshToken: data.refresh_token as string, tokenType: data.token_type || "Bearer" });
      } catch (err) {
        return json({
          error: { message: err instanceof Error ? err.message : "Falha ao trocar o code" },
        });
      }
    }

    if (action === "check-connection") {
      if (!clientId || !clientSecret || !refreshToken) {
        return json({
          connected: false,
          error: {
            message:
              "Configure GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET e GOOGLE_ADS_REFRESH_TOKEN (Google Ads API no Cloud + OAuth). Developer Token não é mais obrigatório.",
            code: "CREDENTIALS_MISSING",
          },
        });
      }
      try {
        await refreshAccessToken(clientId, clientSecret, refreshToken);
        return json({ connected: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "OAuth falhou";
        const looksLikeCode =
          String(refreshToken || "").startsWith("4/") || !String(refreshToken || "").startsWith("1//");
        return json({
          connected: false,
          error: {
            message: looksLikeCode
              ? "O Refresh Token salvo ainda é o code da autorização. Copie a URL de autorização, autorize no Chrome e cole a barra http://127.0.0.1:8080/?code=... no campo."
              : msg,
          },
        });
      }
    }

    if (!clientId || !clientSecret || !refreshToken) {
      return json({
        error: {
          message:
            "Credenciais OAuth da Google Ads API não configuradas no servidor.",
          code: "CREDENTIALS_MISSING",
        },
        customers: [],
        campaigns: [],
      });
    }

    const accessToken = await refreshAccessToken(clientId, clientSecret, refreshToken);

    if (action === "get-customers") {
      try {
        const listRes = await fetch(
          `https://googleads.googleapis.com/${API_VERSION}/customers:listAccessibleCustomers`,
          {
            headers: buildHeaders(accessToken, developerToken, loginCustomerId),
          }
        );
        const listText = await listRes.text();
        let listData: { resourceNames?: string[]; error?: { message?: string } };
        try {
          listData = JSON.parse(listText);
        } catch {
          throw new Error(
            listRes.status === 404
              ? `Google Ads API (${API_VERSION}) não encontrada.`
              : "Resposta inválida do Google Ads."
          );
        }
        if (!listRes.ok) {
          throw new Error(listData?.error?.message || `Google Ads API erro ${listRes.status}`);
        }

        const resourceNames = listData.resourceNames || [];
        const customers: { id: string; name: string; resourceName: string }[] = [];
        const seen = new Set<string>();

        const addCustomer = (id: string, name: string, resourceName: string) => {
          const cid = cleanCustomerId(id);
          if (!cid || seen.has(cid)) return;
          seen.add(cid);
          customers.push({
            id: cid,
            name: name || `Conta ${cid}`,
            resourceName: resourceName || `customers/${cid}`,
          });
        };

        const toFetch = resourceNames.slice(0, 40);
        await Promise.all(
          toFetch.map(async (resourceName) => {
            const match = resourceName.match(/customers\/(\d+)/);
            if (!match) return;
            const id = match[1];
            try {
              const rows = await googleAdsSearch(
                id,
                "SELECT customer.id, customer.descriptive_name, customer.currency_code FROM customer LIMIT 1",
                accessToken,
                developerToken,
                loginCustomerId
              );
              const row = rows[0];
              const name =
                String(parseRowField(row, "customer", "descriptiveName") || "") ||
                `Conta ${id}`;
              addCustomer(id, name, resourceName);
            } catch {
              addCustomer(id, `Conta ${id}`, resourceName);
            }
          })
        );

        const mccId = cleanCustomerId(String(loginCustomerId || ""));
        if (mccId) {
          try {
            const childRows = await googleAdsSearch(
              mccId,
              `SELECT
                customer_client.client_customer,
                customer_client.descriptive_name,
                customer_client.id,
                customer_client.manager,
                customer_client.status
              FROM customer_client
              WHERE customer_client.status = 'ENABLED'
              LIMIT 200`,
              accessToken,
              developerToken,
              mccId
            );
            for (const row of childRows) {
              const id = String(parseRowField(row, "customerClient", "id") || "");
              const name = String(parseRowField(row, "customerClient", "descriptiveName") || "");
              const resourceName = String(
                parseRowField(row, "customerClient", "clientCustomer") || ""
              );
              addCustomer(id, name, resourceName);
            }
          } catch {
            addCustomer(mccId, `MCC ${mccId}`, `customers/${mccId}`);
          }
        }

        customers.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

        if (customers.length === 0) {
          return json({
            customers: [],
            error: {
              message:
                "Nenhuma conta Google Ads acessível com este refresh token. Verifique MCC e permissões.",
            },
          });
        }

        return json({ customers });
      } catch (err) {
        return json({
          error: { message: err?.message || "Erro ao listar contas Google Ads" },
          customers: [],
        });
      }
    }

    if (action === "get-campaigns") {
      const customerId = body.customerId || body.adAccountId;
      if (!customerId) {
        return json({ error: { message: "customerId is required" }, campaigns: [], daily: [], accountBudgets: [] });
      }

      const timeRange = body.time_range as { since?: string; until?: string } | undefined;
      const since = gaqlDate(timeRange?.since);
      const until = gaqlDate(timeRange?.until);
      const dateClause = since && until
        ? `segments.date BETWEEN '${since}' AND '${until}'`
        : "segments.date DURING LAST_30_DAYS";

      try {
        const [metricRows, attributeRows, budgetRows, customerRows] = await Promise.all([
          googleAdsSearch(
            String(customerId),
            `
            SELECT
              campaign.id,
              campaign.name,
              campaign.status,
              segments.date,
              metrics.impressions,
              metrics.clicks,
              metrics.cost_micros,
              metrics.conversions,
              metrics.conversions_value
            FROM campaign
            WHERE campaign.status != 'REMOVED'
              AND ${dateClause}
            ORDER BY segments.date
            LIMIT 10000
            `,
            accessToken,
            developerToken,
            loginCustomerId
          ),
          googleAdsSearch(
            String(customerId),
            `
            SELECT
              campaign.id,
              campaign.name,
              campaign.status,
              campaign.primary_status,
              campaign.advertising_channel_type,
              campaign_budget.resource_name,
              campaign_budget.amount_micros,
              campaign_budget.total_amount_micros,
              campaign_budget.explicitly_shared
            FROM campaign
            WHERE campaign.status != 'REMOVED'
            ORDER BY campaign.name
            LIMIT 200
            `,
            accessToken,
            developerToken,
            loginCustomerId
          ).catch(() => [] as Record<string, unknown>[]),
          googleAdsSearch(
            String(customerId),
            `
            SELECT
              account_budget.id,
              account_budget.name,
              account_budget.status,
              account_budget.amount_served_micros,
              account_budget.adjusted_spending_limit_micros,
              account_budget.adjusted_spending_limit_type,
              account_budget.approved_spending_limit_micros,
              account_budget.approved_spending_limit_type
            FROM account_budget
            WHERE account_budget.status = 'APPROVED'
            LIMIT 20
            `,
            accessToken,
            developerToken,
            loginCustomerId
          ).catch(() => [] as Record<string, unknown>[]),
          googleAdsSearch(
            String(customerId),
            `
            SELECT customer.id, customer.descriptive_name, customer.currency_code
            FROM customer
            LIMIT 1
            `,
            accessToken,
            developerToken,
            loginCustomerId
          ).catch(() => [] as Record<string, unknown>[]),
        ]);

        const byId = new Map<string, Record<string, unknown>>();
        const dailyByDate = new Map<string, { date: string; spend: number; clicks: number; conversions: number; impressions: number }>();
        for (const row of attributeRows) {
          const id = String(parseRowField(row, "campaign", "id") || "");
          if (!id) continue;
          byId.set(id, {
            id,
            name: String(parseRowField(row, "campaign", "name") || id),
            status: String(parseRowField(row, "campaign", "status") || "UNKNOWN"),
            primaryStatus: String(parseRowField(row, "campaign", "primaryStatus") || ""),
            channelType: String(parseRowField(row, "campaign", "advertisingChannelType") || ""),
            dailyBudget: microsNumber(parseRowField(row, "campaignBudget", "amountMicros")) / 1_000_000,
            totalBudget: microsNumber(parseRowField(row, "campaignBudget", "totalAmountMicros")) / 1_000_000,
            budgetShared: Boolean(parseRowField(row, "campaignBudget", "explicitlyShared")),
            budgetResource: String(parseRowField(row, "campaignBudget", "resourceName") || ""),
            impressions: 0,
            clicks: 0,
            spend: 0,
            conversions: 0,
            conversionValue: 0,
          });
        }

        for (const row of metricRows) {
          const id = String(parseRowField(row, "campaign", "id") || "");
          if (!id) continue;
          const metrics = metricsFromRow(row);
          addDaily(dailyByDate, parseRowField(row, "segments", "date"), metrics);
          const prev = byId.get(id);
          if (prev) {
            prev.impressions = Number(prev.impressions) + metrics.impressions;
            prev.clicks = Number(prev.clicks) + metrics.clicks;
            prev.spend = Number(prev.spend) + metrics.spend;
            prev.conversions = Number(prev.conversions) + metrics.conversions;
            prev.conversionValue = Number(prev.conversionValue) + metrics.conversionValue;
          } else {
            byId.set(id, {
              id,
              name: String(parseRowField(row, "campaign", "name") || id),
              status: String(parseRowField(row, "campaign", "status") || "UNKNOWN"),
              primaryStatus: "",
              channelType: "",
              dailyBudget: 0,
              totalBudget: 0,
              budgetShared: false,
              ...metrics,
            });
          }
        }

        const accountBudgets = budgetRows.map((row) => {
          const adjustedType = String(parseRowField(row, "accountBudget", "adjustedSpendingLimitType") || "");
          const approvedType = String(parseRowField(row, "accountBudget", "approvedSpendingLimitType") || "");
          const limitType = adjustedType && adjustedType !== "UNSPECIFIED" ? adjustedType : approvedType;
          const limitMicros = parseRowField(row, "accountBudget", "adjustedSpendingLimitMicros")
            ?? parseRowField(row, "accountBudget", "approvedSpendingLimitMicros");
          return {
            id: String(parseRowField(row, "accountBudget", "id") || ""),
            name: String(parseRowField(row, "accountBudget", "name") || ""),
            status: String(parseRowField(row, "accountBudget", "status") || ""),
            servedMicros: microsNumber(parseRowField(row, "accountBudget", "amountServedMicros")),
            limitMicros: limitMicros == null ? null : microsNumber(limitMicros),
            limitType,
          };
        });

        const customer = customerRows[0];
        const campaigns = Array.from(byId.values()).sort(
          (a, b) => Number(b.spend) - Number(a.spend)
        );
        const daily = Array.from(dailyByDate.values()).sort((a, b) => a.date.localeCompare(b.date));
        return json({
          campaigns,
          daily,
          accountBudgets,
          currency: String(parseRowField(customer || {}, "customer", "currencyCode") || "BRL"),
          accountName: String(parseRowField(customer || {}, "customer", "descriptiveName") || ""),
        });
      } catch (err) {
        return json({
          error: { message: err?.message || "Erro ao buscar campanhas" },
          campaigns: [],
          daily: [],
          accountBudgets: [],
        });
      }
    }

    if (action === "get-campaign-detail") {
      const customerId = body.customerId || body.adAccountId;
      const campaignId = gaqlId(body.campaignId);
      if (!customerId) {
        return json({ error: { message: "customerId is required" }, adGroups: [], ads: [], keywords: [], assetGroups: [], daily: [] });
      }
      if (!campaignId) {
        return json({ error: { message: "campaignId is required" }, adGroups: [], ads: [], keywords: [], assetGroups: [], daily: [] });
      }
      const timeRange = body.time_range as { since?: string; until?: string } | undefined;
      const since = gaqlDate(timeRange?.since);
      const until = gaqlDate(timeRange?.until);
      const dateClause = since && until
        ? `segments.date BETWEEN '${since}' AND '${until}'`
        : "segments.date DURING LAST_30_DAYS";

      const empty = [] as Record<string, unknown>[];
      try {
        const [groupMetricRows, groupAttrRows, adMetricRows, adAttrRows, keywordRows, assetRows, assetAttrRows, dailyRows] = await Promise.all([
          googleAdsSearch(
            String(customerId),
            `
            SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.primary_status,
              segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value
            FROM ad_group
            WHERE campaign.id = ${campaignId} AND ad_group.status != 'REMOVED' AND ${dateClause}
            LIMIT 5000
            `,
            accessToken, developerToken, loginCustomerId
          ).catch(() => empty),
          googleAdsSearch(
            String(customerId),
            `
            SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.primary_status
            FROM ad_group
            WHERE campaign.id = ${campaignId} AND ad_group.status != 'REMOVED'
            ORDER BY ad_group.name
            LIMIT 200
            `,
            accessToken, developerToken, loginCustomerId
          ).catch(() => empty),
          googleAdsSearch(
            String(customerId),
            `
            SELECT ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type, ad_group_ad.status,
              ad_group.id, ad_group.name,
              segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value
            FROM ad_group_ad
            WHERE campaign.id = ${campaignId} AND ad_group_ad.status != 'REMOVED' AND ${dateClause}
            LIMIT 5000
            `,
            accessToken, developerToken, loginCustomerId
          ).catch(() => empty),
          googleAdsSearch(
            String(customerId),
            `
            SELECT ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type, ad_group_ad.status,
              ad_group_ad.ad.responsive_search_ad.headlines, ad_group.id, ad_group.name
            FROM ad_group_ad
            WHERE campaign.id = ${campaignId} AND ad_group_ad.status != 'REMOVED'
            LIMIT 200
            `,
            accessToken, developerToken, loginCustomerId
          ).catch(() => empty),
          googleAdsSearch(
            String(customerId),
            `
            SELECT ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status,
              ad_group.id, ad_group.name,
              segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
            FROM keyword_view
            WHERE campaign.id = ${campaignId} AND ad_group_criterion.status != 'REMOVED' AND ${dateClause}
            LIMIT 5000
            `,
            accessToken, developerToken, loginCustomerId
          ).catch(() => empty),
          googleAdsSearch(
            String(customerId),
            `
            SELECT asset_group.id, asset_group.name, asset_group.status,
              segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value
            FROM asset_group
            WHERE campaign.id = ${campaignId} AND asset_group.status != 'REMOVED' AND ${dateClause}
            LIMIT 2000
            `,
            accessToken, developerToken, loginCustomerId
          ).catch(() => empty),
          googleAdsSearch(
            String(customerId),
            `
            SELECT asset_group.id, asset_group.name, asset_group.status
            FROM asset_group
            WHERE campaign.id = ${campaignId} AND asset_group.status != 'REMOVED'
            LIMIT 200
            `,
            accessToken, developerToken, loginCustomerId
          ).catch(() => empty),
          googleAdsSearch(
            String(customerId),
            `
            SELECT segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
            FROM campaign
            WHERE campaign.id = ${campaignId} AND ${dateClause}
            LIMIT 400
            `,
            accessToken, developerToken, loginCustomerId
          ).catch(() => empty),
        ]);

        const headlinesOf = (row: Record<string, unknown>) => {
          const rsa = parseRowField(row, "adGroupAd", "ad", "responsiveSearchAd") as { headlines?: unknown } | null;
          const list = Array.isArray(rsa?.headlines) ? rsa.headlines : [];
          return list.map((item) => {
            if (typeof item === "string") return item.trim();
            if (item && typeof item === "object" && "text" in item) {
              return String((item as { text?: string }).text || "").trim();
            }
            return "";
          }).filter(Boolean);
        };

        const adGroups = new Map<string, Record<string, unknown>>();
        for (const row of groupAttrRows) {
          const id = String(parseRowField(row, "adGroup", "id") || "");
          if (!id) continue;
          adGroups.set(id, {
            id,
            name: String(parseRowField(row, "adGroup", "name") || id),
            status: String(parseRowField(row, "adGroup", "status") || "UNKNOWN"),
            primaryStatus: String(parseRowField(row, "adGroup", "primaryStatus") || ""),
            impressions: 0, clicks: 0, spend: 0, conversions: 0, conversionValue: 0,
          });
        }
        for (const row of groupMetricRows) {
          const id = String(parseRowField(row, "adGroup", "id") || "");
          if (!id) continue;
          const metrics = metricsFromRow(row);
          const prev = adGroups.get(id) || {
            id,
            name: String(parseRowField(row, "adGroup", "name") || id),
            status: String(parseRowField(row, "adGroup", "status") || "UNKNOWN"),
            primaryStatus: "",
            impressions: 0, clicks: 0, spend: 0, conversions: 0, conversionValue: 0,
          };
          prev.impressions = Number(prev.impressions) + metrics.impressions;
          prev.clicks = Number(prev.clicks) + metrics.clicks;
          prev.spend = Number(prev.spend) + metrics.spend;
          prev.conversions = Number(prev.conversions) + metrics.conversions;
          prev.conversionValue = Number(prev.conversionValue) + metrics.conversionValue;
          adGroups.set(id, prev);
        }

        const ads = new Map<string, Record<string, unknown>>();
        const ingestAd = (row: Record<string, unknown>, withMetrics: boolean) => {
          const id = String(parseRowField(row, "adGroupAd", "ad", "id") || "");
          if (!id) return;
          const prev = ads.get(id) || {
            id,
            name: String(parseRowField(row, "adGroupAd", "ad", "name") || ""),
            type: String(parseRowField(row, "adGroupAd", "ad", "type") || ""),
            status: String(parseRowField(row, "adGroupAd", "status") || "UNKNOWN"),
            headlines: headlinesOf(row),
            adGroupId: String(parseRowField(row, "adGroup", "id") || ""),
            adGroupName: String(parseRowField(row, "adGroup", "name") || ""),
            impressions: 0, clicks: 0, spend: 0, conversions: 0, conversionValue: 0,
          };
          if (withMetrics) {
            const metrics = metricsFromRow(row);
            prev.impressions = Number(prev.impressions) + metrics.impressions;
            prev.clicks = Number(prev.clicks) + metrics.clicks;
            prev.spend = Number(prev.spend) + metrics.spend;
            prev.conversions = Number(prev.conversions) + metrics.conversions;
            prev.conversionValue = Number(prev.conversionValue) + metrics.conversionValue;
          }
          ads.set(id, prev);
        };
        for (const row of adAttrRows) ingestAd(row, false);
        for (const row of adMetricRows) ingestAd(row, true);

        const keywords = new Map<string, Record<string, unknown>>();
        for (const row of keywordRows) {
          const text = String(parseRowField(row, "adGroupCriterion", "keyword", "text") || "").trim();
          const matchType = String(parseRowField(row, "adGroupCriterion", "keyword", "matchType") || "");
          const adGroupId = String(parseRowField(row, "adGroup", "id") || "");
          if (!text) continue;
          const key = `${adGroupId}:${matchType}:${text.toLowerCase()}`;
          const metrics = metricsFromRow(row);
          const prev = keywords.get(key) || {
            id: key,
            text,
            matchType,
            criterionId: String(parseRowField(row, "adGroupCriterion", "criterionId") || ""),
            status: String(parseRowField(row, "adGroupCriterion", "status") || "UNKNOWN"),
            adGroupId,
            adGroupName: String(parseRowField(row, "adGroup", "name") || ""),
            impressions: 0, clicks: 0, spend: 0, conversions: 0, conversionValue: 0,
          };
          prev.impressions = Number(prev.impressions) + metrics.impressions;
          prev.clicks = Number(prev.clicks) + metrics.clicks;
          prev.spend = Number(prev.spend) + metrics.spend;
          prev.conversions = Number(prev.conversions) + metrics.conversions;
          keywords.set(key, prev);
        }

        const assetGroups = new Map<string, Record<string, unknown>>();
        for (const row of assetAttrRows) {
          const id = String(parseRowField(row, "assetGroup", "id") || "");
          if (!id) continue;
          assetGroups.set(id, {
            id,
            name: String(parseRowField(row, "assetGroup", "name") || id),
            status: String(parseRowField(row, "assetGroup", "status") || "UNKNOWN"),
            impressions: 0, clicks: 0, spend: 0, conversions: 0, conversionValue: 0,
          });
        }
        for (const row of assetRows) {
          const id = String(parseRowField(row, "assetGroup", "id") || "");
          if (!id) continue;
          const metrics = metricsFromRow(row);
          const prev = assetGroups.get(id) || {
            id,
            name: String(parseRowField(row, "assetGroup", "name") || id),
            status: String(parseRowField(row, "assetGroup", "status") || "UNKNOWN"),
            impressions: 0, clicks: 0, spend: 0, conversions: 0, conversionValue: 0,
          };
          prev.impressions = Number(prev.impressions) + metrics.impressions;
          prev.clicks = Number(prev.clicks) + metrics.clicks;
          prev.spend = Number(prev.spend) + metrics.spend;
          prev.conversions = Number(prev.conversions) + metrics.conversions;
          prev.conversionValue = Number(prev.conversionValue) + metrics.conversionValue;
          assetGroups.set(id, prev);
        }

        const dailyByDate = new Map<string, { date: string; spend: number; clicks: number; conversions: number; impressions: number }>();
        for (const row of dailyRows) {
          addDaily(dailyByDate, parseRowField(row, "segments", "date"), metricsFromRow(row));
        }

        const sortSpend = (a: Record<string, unknown>, b: Record<string, unknown>) => Number(b.spend) - Number(a.spend);
        return json({
          adGroups: Array.from(adGroups.values()).sort(sortSpend),
          ads: Array.from(ads.values()).sort(sortSpend),
          keywords: Array.from(keywords.values()).sort(sortSpend),
          assetGroups: Array.from(assetGroups.values()).sort(sortSpend),
          daily: Array.from(dailyByDate.values()).sort((a, b) => a.date.localeCompare(b.date)),
        });
      } catch (err) {
        return json({
          error: { message: err?.message || "Erro ao abrir a campanha do Google Ads" },
          adGroups: [],
          ads: [],
          keywords: [],
          assetGroups: [],
          daily: [],
        });
      }
    }

    if (action === "list-campaign-catalog") {
      const customerId = body.customerId || body.adAccountId;
      if (!customerId) {
        return json({ error: { message: "customerId is required" }, campaigns: [], adGroups: [] });
      }
      try {
        const campaignRows = await googleAdsSearch(
          String(customerId),
          `
          SELECT campaign.id, campaign.name, campaign.status
          FROM campaign
          WHERE campaign.status != 'REMOVED'
          ORDER BY campaign.name
          LIMIT 200
          `,
          accessToken,
          developerToken,
          loginCustomerId
        );
        const groupRows = await googleAdsSearch(
          String(customerId),
          `
          SELECT ad_group.id, ad_group.name, ad_group.status, campaign.id, campaign.name
          FROM ad_group
          WHERE ad_group.status != 'REMOVED'
          ORDER BY ad_group.name
          LIMIT 500
          `,
          accessToken,
          developerToken,
          loginCustomerId
        );
        const campaigns = campaignRows.map((row) => ({
          id: String(parseRowField(row, "campaign", "id") || ""),
          name: String(parseRowField(row, "campaign", "name") || ""),
          status: String(parseRowField(row, "campaign", "status") || "UNKNOWN"),
        })).filter((campaign) => campaign.id && campaign.name);
        const adGroups = groupRows.map((row) => ({
          id: String(parseRowField(row, "adGroup", "id") || ""),
          name: String(parseRowField(row, "adGroup", "name") || ""),
          status: String(parseRowField(row, "adGroup", "status") || "UNKNOWN"),
          campaignId: String(parseRowField(row, "campaign", "id") || ""),
          campaignName: String(parseRowField(row, "campaign", "name") || ""),
        })).filter((group) => group.id && group.name);
        return json({ campaigns, adGroups });
      } catch (err) {
        return json({
          error: { message: err?.message || "Erro ao listar campanhas do Google Ads" },
          campaigns: [],
          adGroups: [],
        });
      }
    }

    if (action === "get-ad-groups") {
      const customerId = body.customerId || body.adAccountId;
      const campaignId = gaqlId(body.campaignId);
      if (!customerId) {
        return json({ error: { message: "customerId is required" }, adGroups: [] });
      }
      if (!campaignId) {
        return json({ error: { message: "campaignId is required" }, adGroups: [] });
      }

      try {
        const query = `
          SELECT
            ad_group.id,
            ad_group.name,
            ad_group.status,
            campaign.id
          FROM ad_group
          WHERE campaign.id = ${campaignId}
            AND ad_group.status != 'REMOVED'
          ORDER BY ad_group.name
          LIMIT 200
        `;
        const rows = await googleAdsSearch(
          String(customerId),
          query,
          accessToken,
          developerToken,
          loginCustomerId
        );
        const adGroups = rows.map((row) => ({
          id: String(parseRowField(row, "adGroup", "id") || ""),
          name: String(parseRowField(row, "adGroup", "name") || ""),
          status: String(parseRowField(row, "adGroup", "status") || "UNKNOWN"),
          campaignId: String(parseRowField(row, "campaign", "id") || campaignId),
        })).filter((g) => g.id);
        return json({ adGroups });
      } catch (err) {
        return json({
          error: { message: err?.message || "Erro ao buscar grupos de anúncios" },
          adGroups: [],
        });
      }
    }

    if (action === "get-keywords") {
      const customerId = body.customerId || body.adAccountId;
      const campaignId = gaqlId(body.campaignId);
      const adGroupId = gaqlId(body.adGroupId);
      if (!customerId) {
        return json({ error: { message: "customerId is required" }, keywords: [] });
      }

      try {
        let where = "ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.status != 'REMOVED'";
        if (adGroupId) {
          where += ` AND ad_group.id = ${adGroupId}`;
        } else if (campaignId) {
          where += ` AND campaign.id = ${campaignId}`;
        }

        const includeMetrics = Boolean(body.includeMetrics || body.withMetrics);
        const query = includeMetrics
          ? `
          SELECT
            ad_group_criterion.criterion_id,
            ad_group_criterion.keyword.text,
            ad_group_criterion.keyword.match_type,
            ad_group.id,
            campaign.id,
            campaign.name,
            metrics.impressions,
            metrics.clicks,
            metrics.cost_micros,
            metrics.conversions
          FROM keyword_view
          WHERE ${where}
            AND segments.date DURING LAST_30_DAYS
          ORDER BY metrics.impressions DESC
          LIMIT 40
        `
          : `
          SELECT
            ad_group_criterion.criterion_id,
            ad_group_criterion.keyword.text,
            ad_group_criterion.keyword.match_type,
            ad_group.id,
            campaign.id
          FROM keyword_view
          WHERE ${where}
          ORDER BY ad_group_criterion.keyword.text
          LIMIT 100
        `;
        const rows = await googleAdsSearch(
          String(customerId),
          query,
          accessToken,
          developerToken,
          loginCustomerId
        );
        const keywords = rows.map((row) => {
          const metrics = includeMetrics ? metricsFromRow(row) : null;
          return {
            id: String(parseRowField(row, "adGroupCriterion", "criterionId") || ""),
            text: String(parseRowField(row, "adGroupCriterion", "keyword", "text") || ""),
            matchType: String(parseRowField(row, "adGroupCriterion", "keyword", "matchType") || ""),
            adGroupId: String(parseRowField(row, "adGroup", "id") || ""),
            campaignId: String(parseRowField(row, "campaign", "id") || ""),
            campaignName: includeMetrics ? String(parseRowField(row, "campaign", "name") || "") : "",
            impressions: metrics?.impressions || 0,
            clicks: metrics?.clicks || 0,
            spend: metrics?.spend || 0,
            conversions: metrics?.conversions || 0,
          };
        }).filter((k) => k.text);
        return json({ keywords });
      } catch (err) {
        return json({
          error: { message: err?.message || "Erro ao buscar palavras-chave" },
          keywords: [],
        });
      }
    }

    if (action === "list-conversion-actions") {
      const customerId = cleanCustomerId(String(body.customerId || body.googleCustomerId || ""));
      if (!customerId) {
        return json({ error: { message: "customerId é obrigatório" }, actions: [] });
      }
      try {
        const all = await fetchConversionActions(
          customerId,
          accessToken,
          developerToken,
          loginCustomerId,
        );
        const actions = all.filter(isUploadClicks);
        return json({
          actions,
          otherCount: all.length - actions.length,
        });
      } catch (err) {
        return json({
          error: { message: err instanceof Error ? err.message : "Erro ao listar ações de conversão" },
          actions: [],
        });
      }
    }

    if (action === "ensure-conversion-actions") {
      const customerId = cleanCustomerId(String(body.customerId || body.googleCustomerId || ""));
      if (!customerId) {
        return json({ error: { message: "customerId é obrigatório" }, actions: [] });
      }
      try {
        let all = await fetchConversionActions(
          customerId,
          accessToken,
          developerToken,
          loginCustomerId,
        );
        let upload = all.filter(isUploadClicks);
        const missing = PLANEJE_CONVERSION_SPECS.filter(
          (spec) =>
            !upload.some(
              (row) => row.name.trim().toLowerCase() === spec.name.toLowerCase(),
            ),
        );
        const created: string[] = [];
        if (missing.length) {
          const fullOperations = missing.map((spec) => ({
            create: {
              name: spec.name,
              type: "UPLOAD_CLICKS",
              category: spec.category,
              status: "ENABLED",
              countingType: spec.countingType,
              clickThroughLookbackWindowDays: 90,
              valueSettings: {
                defaultValue: 0,
                alwaysUseDefaultValue: false,
              },
            },
          }));
          const simpleOperations = missing.map((spec) => ({
            create: {
              name: spec.name,
              type: "UPLOAD_CLICKS",
              category: "DEFAULT",
              status: "ENABLED",
            },
          }));
          let mutated: { results: { resourceName?: string }[] };
          try {
            mutated = await mutateConversionActions(
              customerId,
              fullOperations,
              accessToken,
              developerToken,
              loginCustomerId,
            );
          } catch {
            mutated = await mutateConversionActions(
              customerId,
              simpleOperations,
              accessToken,
              developerToken,
              loginCustomerId,
            );
          }
          created.push(
            ...mutated.results.map((row) => String(row.resourceName || "")).filter(Boolean),
          );
          all = await fetchConversionActions(
            customerId,
            accessToken,
            developerToken,
            loginCustomerId,
          );
          upload = all.filter(isUploadClicks);
        }
        const mapped: Record<string, string> = {};
        for (const spec of PLANEJE_CONVERSION_SPECS) {
          const found = upload.find(
            (row) => row.name.trim().toLowerCase() === spec.name.toLowerCase(),
          );
          if (found?.resourceName) mapped[spec.key] = found.resourceName;
        }
        return json({
          actions: upload,
          created,
          mapped,
          otherCount: all.length - upload.length,
        });
      } catch (err) {
        return json({
          error: {
            message: err instanceof Error ? err.message : "Erro ao criar ações de conversão",
          },
          actions: [],
        });
      }
    }

    if (action === "generate-keyword-ideas") {
      const customerId = cleanCustomerId(String(body.customerId || body.adAccountId || ""));
      if (!customerId) {
        return json({ error: { message: "customerId is required" }, ideas: [], seeds: [] });
      }
      const seeds = parseKeywordSeedList(body.keywords || body.seeds || body.q);
      if (!seeds.length) {
        return json({
          error: { message: "Digite pelo menos uma palavra para ver o volume de busca." },
          ideas: [],
          seeds: [],
        });
      }
      try {
        const payload = {
          language: "languageConstants/1014",
          geoTargetConstants: ["geoTargetConstants/2076"],
          includeAdultKeywords: false,
          keywordPlanNetwork: "GOOGLE_SEARCH",
          pageSize: 25,
          keywordSeed: { keywords: seeds },
        };
        const data = await googleAdsPost(
          `customers/${customerId}:generateKeywordIdeas`,
          payload,
          accessToken,
          developerToken,
          loginCustomerId,
        );
        const ideas = sortMappedKeywordIdeas(
          (Array.isArray(data?.results) ? data.results : []).map(mapKeywordIdeaRow).filter((row) => row.text),
        );
        return json({
          seeds,
          geo: "Brasil",
          language: "Português",
          ideas,
        });
      } catch (err) {
        const raw = err instanceof Error ? err.message : "Não foi possível ler o Planejador de Palavras-chave.";
        const explorer = /explorer access|basic or standard access/i.test(raw);
        return json({
          error: {
            code: explorer ? "PLANNER_EXPLORER" : "PLANNER_ERROR",
            message: explorer
              ? "O Planejador de Palavras-chave pede acesso Básico da API do Google Ads. A conta da agência está no nível Explorer. Peça a atualização em ads.google.com/aw/apicenter. Enquanto isso, o Planeje mostra as palavras reais da conta (30 dias)."
              : raw,
          },
          ideas: [],
          seeds,
        });
      }
    }

    if (["upload-click-conversion", "retry-click-conversion", "get-conversion-status"].includes(action)) {
      const result = await handleGoogleDataManagerConversion({
        supabase, accessToken, loginCustomerId, action, body,
        cloudProjectId: await getSecret(supabase, "GOOGLE_DATA_MANAGER_PROJECT_ID"),
      });
      return json(result);
    }

    if (action === "update-google-ads") {
      const customerId = cleanCustomerId(String(body.customerId || ""));
      const kind = String(body.kind || "");
      if (!customerId) return json({ error: { message: "Escolha a conta Google Ads." } });
      try {
        if (kind === "campaign-status") {
          const campaignId = gaqlId(body.campaignId);
          const status = body.status === "PAUSED" || body.status === "ENABLED" ? body.status : "";
          if (!campaignId || !status) return json({ error: { message: "Confira a campanha e se ela vai pausar ou ligar." } });
          const updated = await mutateGoogleAds(
            customerId,
            "campaigns",
            [{
              update: { resourceName: `customers/${customerId}/campaigns/${campaignId}`, status },
              updateMask: "status",
            }],
            accessToken,
            developerToken,
            loginCustomerId,
          );
          return json({ ok: true, resourceName: updated.results[0]?.resourceName || "" });
        }
        if (kind === "campaign-budget") {
          const resource = String(body.budgetResource || "");
          const micros = Number(body.amountMicros);
          const expected = `customers/${customerId}/campaignBudgets/`;
          if (!resource.startsWith(expected) || !/^\d+$/.test(resource.slice(expected.length))) {
            return json({ error: { message: "O Google não devolveu o orçamento desta campanha." } });
          }
          if (!Number.isFinite(micros) || micros < 1_000_000 || micros > 20_000_000_000) {
            return json({ error: { message: "Informe um orçamento diário entre R$ 1 e R$ 20.000." } });
          }
          const updated = await mutateGoogleAds(
            customerId,
            "campaignBudgets",
            [{
              update: { resourceName: resource, amountMicros: String(Math.round(micros)) },
              updateMask: "amount_micros",
            }],
            accessToken,
            developerToken,
            loginCustomerId,
          );
          return json({ ok: true, resourceName: updated.results[0]?.resourceName || "" });
        }
        if (kind === "keyword-status") {
          const adGroupId = gaqlId(body.adGroupId);
          const criterionId = gaqlId(body.criterionId);
          const status = body.status === "PAUSED" || body.status === "ENABLED" ? body.status : "";
          if (!adGroupId || !criterionId || !status) {
            return json({ error: { message: "Esta palavra não pode ser alterada por aqui." } });
          }
          const updated = await mutateGoogleAds(
            customerId,
            "adGroupCriteria",
            [{
              update: {
                resourceName: `customers/${customerId}/adGroupCriteria/${adGroupId}~${criterionId}`,
                status,
              },
              updateMask: "status",
            }],
            accessToken,
            developerToken,
            loginCustomerId,
          );
          return json({ ok: true, resourceName: updated.results[0]?.resourceName || "" });
        }
        return json({ error: { message: "Alteração inválida." } });
      } catch (err) {
        return json({ error: { message: err instanceof Error ? err.message : "O Google recusou a alteração." } });
      }
    }

    return json({ error: { message: `Unknown action: ${action}` } });
  } catch (err) {
    return json({
      error: { message: err?.message || "Internal error" },
    });
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
