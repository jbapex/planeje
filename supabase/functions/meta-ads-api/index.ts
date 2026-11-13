import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  CLIENTE_META_MANUAL_ACTIONS,
  handleClienteMetaManual,
} from "./clienteMetaManual.ts";
import { persistAdThumbnail } from "../_shared/persistAdThumbnail.ts";
import { META_AD_IDENTITY_FIELDS, metaAdIdentity } from "../_shared/metaAdEnrichment.js";
import { handleMetaWrite } from "../_shared/metaWriteAuthorization.js";
import {
  LARGE_MEDIA_ACTIONS,
  handleIgRuploadPut,
  handleLargeMediaAction,
} from "./largeMediaUpload.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, offset, file_size, x-upload-offset, x-file-size",
};

/** `actions:omni_purchase` não é field válido na Marketing API. */
function adsInsightFields(metrics: unknown, fallback = "spend,impressions,clicks"): string {
  const raw = Array.isArray(metrics)
    ? metrics.map(String)
    : String(metrics || fallback).split(",");
  const out = new Set<string>();
  for (const item of raw) {
    const field = String(item || "").trim();
    if (!field) continue;
    if (field.includes(":")) {
      out.add(field.split(":")[0]);
      continue;
    }
    out.add(field);
  }
  return [...out].join(",") || fallback;
}

/** Conversões CTWA usam token do BM do cliente (não MADS). */
const CTWA_CLIENT_ACTIONS = new Set([
  "list-whatsapp-business-accounts",
  "get-waba-dataset",
  "send-ctwa-conversion",
]);

function ctwaSecretName(clienteId: string) {
  return `META_CTWA_CLIENT_${clienteId.replace(/-/g, "_")}`;
}

async function readGlobalMetaToken(
  supabase: ReturnType<typeof createClient>
): Promise<string | null> {
  const fromEnv = Deno.env.get("META_SYSTEM_USER_ACCESS_TOKEN");
  if (fromEnv) return fromEnv;
  const { data } = await supabase.rpc("get_encrypted_secret", {
    p_secret_name: "META_SYSTEM_USER_ACCESS_TOKEN",
  });
  return data ? String(data) : null;
}

async function readClientMetaToken(
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

function onlyDigits(id: string): string {
  return String(id || "").replace(/\D/g, "");
}

/** Capa nítida de anúncio em vídeo: creative.thumbnail_url vem 64×64. */
async function bestVideoPreviewUrl(videoId: string, metaToken: string): Promise<string | null> {
  const id = String(videoId || "").replace(/\D/g, "");
  if (!id) return null;
  try {
    const url = `https://graph.facebook.com/v24.0/${id}?fields=picture,format&access_token=${metaToken}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data?.error) return null;
    const formats = Array.isArray(data.format) ? data.format : [];
    let best: string | null = null;
    let bestWidth = 0;
    for (const fmt of formats) {
      const picture = fmt?.picture ? String(fmt.picture) : "";
      const width = Number(fmt?.width) || 0;
      if (picture && width >= bestWidth) {
        best = picture;
        bestWidth = width;
      }
    }
    if (best) return best;
    return data.picture ? String(data.picture) : null;
  } catch {
    return null;
  }
}

/** O thumbnail_width no anúncio não aumenta o criativo aninhado. No nó do criativo, 1080 devolve o quadro assinado. */
async function largeCreativeThumbnailUrl(creativeId: string, metaToken: string): Promise<string | null> {
  const id = String(creativeId || "").replace(/\D/g, "");
  if (!id) return null;
  try {
    const params = new URLSearchParams({
      fields: "thumbnail_url",
      thumbnail_width: "1080",
      thumbnail_height: "1920",
      access_token: metaToken,
    });
    const res = await fetch(`https://graph.facebook.com/v24.0/${id}?${params.toString()}`);
    const data = await res.json();
    if (data?.error) return null;
    const url = data?.thumbnail_url ? String(data.thumbnail_url).trim() : "";
    return url || null;
  } catch {
    return null;
  }
}

type WabaPhoneRow = { id: string; display_phone_number: string };

function phoneDigits(p: string): string {
  return String(p || "").replace(/\D/g, "");
}

function phonesMatch(a: string, b: string): boolean {
  const na = phoneDigits(a);
  const nb = phoneDigits(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ta = na.length >= 10 ? na.slice(-10) : na;
  const tb = nb.length >= 10 ? nb.slice(-10) : nb;
  return ta === tb;
}

async function getPageAccessToken(pageId: string, userToken: string): Promise<string | null> {
  const id = onlyDigits(pageId);
  if (!id) return null;
  const response = await fetch(
    `https://graph.facebook.com/v24.0/${id}?fields=access_token&access_token=${userToken}`
  );
  const data = await response.json();
  return data?.access_token ? String(data.access_token) : null;
}

function insightNumeric(row: any, reduce: "sum" | "last" = "sum"): number {
  if (row?.total_value && typeof row.total_value === "object" && row.total_value.value != null) {
    return Number(row.total_value.value) || 0;
  }
  const values = Array.isArray(row?.values) ? row.values : [];
  const toNum = (raw: any) => {
    if (raw && typeof raw === "object") {
      return Object.values(raw).reduce((sum: number, n) => sum + (Number(n) || 0), 0);
    }
    return Number(raw) || 0;
  };
  if (!values.length) return toNum(row?.value);
  if (reduce === "last") return toNum(values[values.length - 1]?.value);
  return values.reduce((sum: number, entry: any) => sum + toNum(entry?.value), 0);
}

async function fetchWabaPhoneNumbers(wabaId: string, token: string): Promise<WabaPhoneRow[]> {
  const wid = onlyDigits(wabaId);
  if (!wid) return [];
  const url =
    `https://graph.facebook.com/v24.0/${encodeURIComponent(wid)}/phone_numbers?fields=id,display_phone_number,verified_name&limit=50&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data?.error) return [];
  return (data?.data || [])
    .map((row: { id?: string; display_phone_number?: string }) => ({
      id: String(row.id || ""),
      display_phone_number: String(row.display_phone_number || ""),
    }))
    .filter((p: WabaPhoneRow) => p.display_phone_number);
}

async function listWabaAccountIds(
  metaToken: string,
  businessId: string | null
): Promise<{ id: string; name: string; source: string; phone_numbers?: WabaPhoneRow[] }[]> {
  const accounts: { id: string; name: string; source: string; phone_numbers?: WabaPhoneRow[] }[] = [];
  const seen = new Set<string>();
  const pushAccounts = (items: { id?: string; name?: string }[] | undefined, source: string) => {
    for (const item of items || []) {
      if (!item?.id || seen.has(item.id)) continue;
      seen.add(item.id);
      accounts.push({ id: String(item.id), name: String(item.name || item.id), source });
    }
  };
  let businessIds: string[] = [];
  const businessIdEnv = String(businessId ?? "").trim();
  if (businessIdEnv) {
    businessIds = [businessIdEnv];
  } else {
    const meRes = await fetch(
      `https://graph.facebook.com/v24.0/me?fields=businesses{id,name}&access_token=${encodeURIComponent(metaToken)}`
    );
    const meData = await meRes.json();
    if (meData?.error) return accounts;
    businessIds = (meData?.businesses?.data || []).map((b: { id: string }) => b.id).filter(Boolean);
  }
  for (const bid of businessIds) {
    for (const edge of ["owned_whatsapp_business_accounts", "client_whatsapp_business_accounts"] as const) {
      const url =
        `https://graph.facebook.com/v24.0/${encodeURIComponent(bid)}/${edge}?fields=id,name&limit=100&access_token=${encodeURIComponent(metaToken)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data?.error) pushAccounts(data?.data, edge);
    }
  }
  return accounts;
}

async function resolveWabaIdForBusinessPhone(
  metaToken: string,
  businessId: string | null,
  businessPhone: string
): Promise<string | null> {
  const accounts = await listWabaAccountIds(metaToken, businessId);
  for (const acc of accounts) {
    const phones = await fetchWabaPhoneNumbers(acc.id, metaToken);
    if (phones.some((p) => phonesMatch(p.display_phone_number, businessPhone))) {
      return onlyDigits(acc.id);
    }
  }
  return null;
}

async function fetchDatasetIdForWaba(wabaId: string, token: string): Promise<string | null> {
  const wid = onlyDigits(wabaId);
  if (!wid) return null;
  const tokenQ = encodeURIComponent(token);
  const wabaUrl =
    `https://graph.facebook.com/v24.0/${encodeURIComponent(wid)}?fields=id,name,dataset&access_token=${tokenQ}`;
  const wabaRes = await fetch(wabaUrl);
  const wabaData = await wabaRes.json();
  if (wabaData?.error) return null;
  let datasetId: string | null = wabaData?.dataset?.id ? String(wabaData.dataset.id) : null;
  const datasetEdgeUrl =
    `https://graph.facebook.com/v24.0/${encodeURIComponent(wid)}/dataset?access_token=${tokenQ}`;
  if (!datasetId) {
    const getRes = await fetch(datasetEdgeUrl);
    const getData = await getRes.json();
    if (getData?.id) datasetId = String(getData.id);
    else if (!getData?.error) {
      const postRes = await fetch(datasetEdgeUrl, { method: "POST" });
      const postData = await postRes.json();
      if (postData?.id) datasetId = String(postData.id);
    }
  }
  return datasetId ? onlyDigits(datasetId) : null;
}

async function fetchDatasetIdForPage(pageId: string, token: string): Promise<string | null> {
  const pid = onlyDigits(pageId);
  if (!pid) return null;
  const tokenQ = encodeURIComponent(token);
  const pageUrl =
    `https://graph.facebook.com/v24.0/${encodeURIComponent(pid)}?fields=id,name,dataset&access_token=${tokenQ}`;
  const pageRes = await fetch(pageUrl);
  const pageData = await pageRes.json();
  if (pageData?.error) return null;
  let datasetId: string | null = pageData?.dataset?.id ? String(pageData.dataset.id) : null;
  const datasetEdgeUrl =
    `https://graph.facebook.com/v24.0/${encodeURIComponent(pid)}/dataset?access_token=${tokenQ}`;
  if (!datasetId) {
    const getRes = await fetch(datasetEdgeUrl);
    const getData = await getRes.json();
    if (getData?.id) datasetId = String(getData.id);
    else if (!getData?.error) {
      const postRes = await fetch(datasetEdgeUrl, { method: "POST" });
      const postData = await postRes.json();
      if (postData?.id) datasetId = String(postData.id);
    }
  }
  return datasetId ? onlyDigits(datasetId) : null;
}

function buildCtwaUserData(
  ctwaClid: string,
  wabaId: string,
  pageId: string,
  phoneHash?: string | null,
): Record<string, unknown> {
  const userData: Record<string, unknown> = { ctwa_clid: ctwaClid };
  if (pageId) {
    userData.page_id = pageId;
  } else if (wabaId) {
    userData.whatsapp_business_account_id = wabaId;
  }
  if (phoneHash) {
    userData.ph = [phoneHash];
  }
  return userData;
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function extractOwnerFromRawPayload(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const body = (p.body && typeof p.body === "object" ? p.body : p) as Record<string, unknown>;
  const owner = p.owner ?? body.owner;
  if (owner == null) return null;
  const s = String(owner).trim();
  return s || null;
}

function extractCtwaFromRawPayload(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const message = p.message as Record<string, unknown> | undefined;
  const content = message?.content as Record<string, unknown> | undefined;
  const contextInfo = content?.contextInfo as Record<string, unknown> | undefined;
  const externalAdReply = contextInfo?.externalAdReply as Record<string, unknown> | undefined;
  const clid = externalAdReply?.ctwaClid ?? externalAdReply?.ctwa_clid ?? p.ctwaClid ?? p.ctwa_clid;
  if (clid == null) return null;
  const s = String(clid).trim();
  return s || null;
}

async function resolveBusinessPhoneForContact(
  supabase: ReturnType<typeof createClient>,
  clienteId: string,
  contactId: string | null,
  ctwaClid: string,
  bodyBusinessPhone: string | null
): Promise<string | null> {
  if (bodyBusinessPhone && phoneDigits(bodyBusinessPhone)) return bodyBusinessPhone;
  if (!contactId) return null;

  const { data: contactRow } = await supabase
    .from("cliente_whatsapp_contact")
    .select("tracking_data")
    .eq("id", contactId)
    .eq("cliente_id", clienteId)
    .maybeSingle();
  const td = contactRow?.tracking_data as Record<string, unknown> | null;
  if (td?.owner_phone) return String(td.owner_phone);

  const { data: logs } = await supabase
    .from("cliente_whatsapp_webhook_log")
    .select("raw_payload")
    .eq("cliente_id", clienteId)
    .order("created_at", { ascending: false })
    .limit(40);

  for (const log of logs || []) {
    const raw = log.raw_payload;
    const logClid = extractCtwaFromRawPayload(raw);
    if (logClid && logClid !== ctwaClid) continue;
    const owner = extractOwnerFromRawPayload(raw);
    if (owner) return owner;
  }
  return null;
}

function isUnknownFieldError(err: any) {
  const msg = String(err?.message || "");
  const code = Number(err?.code);
  return code === 100 || /nonexisting field|does not support|Tried accessing nonexisting field/i.test(msg);
}

async function graphJson(url: string) {
  const res = await fetch(url);
  return res.json();
}

async function graphWithFieldFallback(urls: string[]) {
  let last: any = null;
  for (const url of urls) {
    const json = await graphJson(url);
    last = json;
    if (!json?.error) return json;
    if (!isUnknownFieldError(json.error)) return json;
    console.warn("Graph field fallback:", json.error.message);
  }
  return last;
}

const INSIGHTS_CONCURRENCY = 8;

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, idx: number) => Promise<R>
): Promise<R[]> {
  const ret: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      ret[idx] = await fn(items[idx], idx);
    }
  }
  const workers = Math.min(Math.max(limit, 1), items.length || 1);
  await Promise.all(Array.from({ length: workers }, worker));
  return ret;
}

async function fetchObjectInsights(
  objectId: string,
  metricsStr: string,
  validTimeRange: { since: string; until: string },
  metaToken: string
) {
  const timeRangeParam = encodeURIComponent(JSON.stringify(validTimeRange));
  const url = `https://graph.facebook.com/v24.0/${objectId}/insights?fields=${encodeURIComponent(metricsStr)}&time_range=${timeRangeParam}&access_token=${metaToken}`;
  const insightsData = await graphJson(url);
  if (insightsData?.error) {
    return { data: [] as any[], error: insightsData.error };
  }
  const data = Array.isArray(insightsData.data)
    ? insightsData.data
    : insightsData.data
      ? [insightsData.data]
      : [];
  return { data, error: null };
}

/** Insights aninhados nem sempre trazem instagram_profile_visits — busca direta na edge /insights. */
async function enrichWithDirectInsights(
  objects: any[],
  metricsStr: string,
  validTimeRange: { since: string; until: string },
  metaToken: string
) {
  if (!objects.length) return objects;
  return mapPool(objects, INSIGHTS_CONCURRENCY, async (obj) => {
    const id = String(obj?.id || "").trim();
    if (!id) return obj;
    const { data } = await fetchObjectInsights(id, metricsStr, validTimeRange, metaToken);
    if (data.length) {
      return { ...obj, insights: { data, paging: null, direct: true } };
    }
    return obj;
  });
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase credentials not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const reqUrl = new URL(req.url);
    if (req.method === "PUT" && reqUrl.searchParams.get("action") === "ig-rupload") {
      const token = await readGlobalMetaToken(supabase);
      if (!token) {
        return new Response(
          JSON.stringify({ error: { message: "Token Meta da agência não configurado", code: "TOKEN_NOT_CONFIGURED" } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return await handleIgRuploadPut(req, reqUrl, token, supabaseServiceKey, corsHeaders);
    }

    // Get request body
    let action: string;
    let body: any = {};
    try {
      const requestBody = await req.json();
      action = requestBody.action;
      body = { ...requestBody };
      delete body.action;
    } catch (err) {
      return new Response(
        JSON.stringify({
          error: {
            message: "Invalid request body",
            code: "INVALID_REQUEST",
          },
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!action) {
      return new Response(
        JSON.stringify({
          error: {
            message: "Action is required",
            code: "MISSING_ACTION",
          },
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (action === "update-adset") {
      return await handleMetaWrite({
        request: req,
        body,
        corsHeaders,
        createCaller: (authorization: string) => createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: authorization } },
        }),
        readToken: () => readGlobalMetaToken(supabase),
      });
    }

    if (CLIENTE_META_MANUAL_ACTIONS.has(action)) {
      return await handleClienteMetaManual({
        supabase,
        action,
        body,
        corsHeaders,
      });
    }

    if (action === "persist-ad-thumbnail") {
      const stored = await persistAdThumbnail(supabase, {
        adId: body.adId ?? body.ad_id ?? null,
        sourceUrl: body.sourceUrl ?? body.source_url ?? body.thumbnail_url ?? null,
        supabaseUrl,
      });
      return new Response(
        JSON.stringify({ public_url: stored, thumbnail_url: stored }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let metaToken: string | null = null;
    /** BM do cliente (CTWA); não usar META_BUSINESS_ID da MADS. */
    let clientCtwaBusinessId: string | null = null;

    if (CTWA_CLIENT_ACTIONS.has(action)) {
      const clienteId = String(body.clienteId ?? "").trim();
      if (!clienteId) {
        return new Response(
          JSON.stringify({
            error: {
              message:
                "clienteId é obrigatório para conversões WhatsApp (use o token do BM do cliente, não MADS).",
              code: "MISSING_CLIENTE_ID",
            },
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      metaToken = await readClientMetaToken(supabase, clienteId);
      if (!metaToken) {
        return new Response(
          JSON.stringify({
            error: {
              message:
                "Token Meta do cliente não configurado. Salve em Canais → Token Meta do cliente.",
              code: "CLIENT_META_TOKEN_NOT_CONFIGURED",
            },
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      const { data: clRow } = await supabase
        .from("clientes")
        .select("meta_ctwa_business_id")
        .eq("id", clienteId)
        .maybeSingle();
      clientCtwaBusinessId = clRow?.meta_ctwa_business_id
        ? String(clRow.meta_ctwa_business_id).trim()
        : null;
      console.log(`✅ CTWA: token do cliente ${clienteId}`);
    } else {
      metaToken = await readGlobalMetaToken(supabase);
      if (!metaToken) {
        return new Response(
          JSON.stringify({
            error: {
              message:
                "META_SYSTEM_USER_ACCESS_TOKEN not found in Vault or environment variables",
              code: "TOKEN_NOT_FOUND",
            },
            connected: false,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    if (LARGE_MEDIA_ACTIONS.has(action)) {
      return await handleLargeMediaAction({
        action,
        body,
        req,
        metaToken,
        corsHeaders,
        supabaseUrl,
        serviceKey: supabaseServiceKey,
      });
    }

    // Handle different actions
    if (action === "check-connection") {
      // Simple validation: try to get user info from Meta API
      try {
        const response = await fetch(
          `https://graph.facebook.com/v24.0/me?access_token=${metaToken}`
        );
        const data = await response.json();

        if (data.error) {
          return new Response(
            JSON.stringify({
              error: data.error,
              connected: false,
            }),
            {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        return new Response(
          JSON.stringify({
            connected: true,
            user: data,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({
            error: {
              message: err.message || "Failed to connect to Meta API",
            },
            connected: false,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    if (action === "inspect-agency-token") {
      const tokenQ = encodeURIComponent(metaToken);
      const graphGet = async (pathAndQuery: string) => {
        const res = await fetch(`https://graph.facebook.com/v24.0/${pathAndQuery}${pathAndQuery.includes("?") ? "&" : "?"}access_token=${tokenQ}`);
        return res.json();
      };
      try {
        const me = await graphGet("me?fields=id,name");
        if (me?.error) {
          return new Response(
            JSON.stringify({
              connected: false,
              error: me.error,
              permissions: [],
              adAccounts: [],
              pages: [],
              instagramAccounts: [],
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const [permJson, accountsJson, pagesJson] = await Promise.all([
          graphGet("me/permissions"),
          graphGet("me/adaccounts?fields=id,name,account_id,currency&limit=200"),
          graphGet("me/accounts?fields=id,name,category,instagram_business_account&limit=200"),
        ]);

        const permissions = (permJson?.data || [])
          .filter((row: { status?: string }) => row?.status === "granted")
          .map((row: { permission?: string }) => String(row.permission || ""))
          .filter(Boolean);

        const adAccounts = (accountsJson?.data || []).map((row: { id?: string; name?: string; account_id?: string; currency?: string }) => ({
          id: String(row.id || ""),
          name: String(row.name || row.id || ""),
          account_id: String(row.account_id || ""),
          currency: String(row.currency || ""),
        }));

        const pages = (pagesJson?.data || []).map((row: { id?: string; name?: string; category?: string; instagram_business_account?: { id?: string } }) => ({
          id: String(row.id || ""),
          name: String(row.name || row.id || ""),
          category: row.category ? String(row.category) : null,
          hasInstagram: Boolean(row.instagram_business_account?.id),
          instagramId: row.instagram_business_account?.id ? String(row.instagram_business_account.id) : null,
        }));

        const instagramAccounts: { id: string; username: string; name: string; page_name: string }[] = [];
        for (const page of pages.filter((page) => page.instagramId)) {
          const ig = await graphGet(`${encodeURIComponent(page.instagramId)}?fields=id,username,name`);
          if (!ig?.error && ig?.id) {
            instagramAccounts.push({
              id: String(ig.id),
              username: String(ig.username || ig.id),
              name: String(ig.name || ig.username || ig.id),
              page_name: page.name,
            });
          }
        }

        return new Response(
          JSON.stringify({
            connected: true,
            user: { id: String(me.id || ""), name: String(me.name || me.id || "") },
            permissions,
            adAccounts,
            pages: pages.map((page) => ({
              id: page.id,
              name: page.name,
              category: page.category,
              hasInstagram: page.hasInstagram,
            })),
            instagramAccounts,
            errors: {
              permissions: permJson?.error || null,
              adAccounts: accountsJson?.error || null,
              pages: pagesJson?.error || null,
            },
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({
            connected: false,
            error: { message: err?.message || "Failed to inspect Meta token" },
            permissions: [],
            adAccounts: [],
            pages: [],
            instagramAccounts: [],
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (action === "list-campaign-catalog") {
      const { adAccountId } = body;
      if (!adAccountId) {
        return new Response(
          JSON.stringify({ error: { message: "adAccountId is required" }, campaigns: [] }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const accountId = String(adAccountId).startsWith("act_")
        ? String(adAccountId)
        : `act_${onlyDigits(String(adAccountId)) || String(adAccountId)}`;
      const fieldSets = [
        "id,name,status,effective_status,adsets.limit(80){id,name,status,effective_status,campaign_id}",
        "id,name,status,adsets.limit(80){id,name,status,campaign_id}",
        "id,name,status",
      ];
      const mapRow = (row: any) => ({
        id: String(row?.id || ""),
        name: String(row?.name || ""),
        status: String(row?.effective_status || row?.status || ""),
        adsets: Array.isArray(row?.adsets?.data)
          ? row.adsets.data.map((adset: any) => ({
              id: String(adset?.id || ""),
              name: String(adset?.name || ""),
              status: String(adset?.effective_status || adset?.status || ""),
              campaign_id: String(adset?.campaign_id || row?.id || ""),
            }))
          : [],
      });
      try {
        const first = await graphWithFieldFallback(
          fieldSets.map(
            (fields) =>
              `https://graph.facebook.com/v24.0/${accountId}/campaigns?fields=${encodeURIComponent(fields)}&limit=100&access_token=${metaToken}`
          )
        );
        if (first?.error) {
          return new Response(
            JSON.stringify({ error: first.error, campaigns: [] }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const campaigns = (first?.data || []).map(mapRow);
        let nextUrl = first?.paging?.next || "";
        let pages = 1;
        while (nextUrl && pages < 8) {
          const json = await graphJson(nextUrl);
          if (json?.error) break;
          campaigns.push(...(json.data || []).map(mapRow));
          nextUrl = json.paging?.next || "";
          pages += 1;
        }
        return new Response(JSON.stringify({ campaigns }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(
          JSON.stringify({
            error: { message: err?.message || "Failed to list campaign catalog" },
            campaigns: [],
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (action === "get-ad-by-id") {
      const { adId } = body;
      if (!adId || typeof adId !== "string" || !adId.trim()) {
        return new Response(
          JSON.stringify({ error: { message: "adId is required", code: "MISSING_AD_ID" } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const id = String(adId).trim();
      try {
        const fields = `${META_AD_IDENTITY_FIELDS},creative{id,thumbnail_url,image_url,object_type,video_id}`;
        const params = new URLSearchParams({
          fields,
          access_token: metaToken,
        });
        const url = `https://graph.facebook.com/v24.0/${id}?${params.toString()}`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.error) {
          console.error("[get-ad-by-id] Meta API error:", data.error);
          return new Response(
            JSON.stringify({ error: { message: data.error.message || "Erro ao buscar anúncio", code: data.error.code || "META_API_ERROR" } }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const campaign = data.campaign || {};
        const creative = data.creative || {};
        const imageUrl = creative?.image_url ? String(creative.image_url) : "";
        const previewUrl = creative?.thumbnail_url ? String(creative.thumbnail_url) : "";
        const creativeId = creative?.id ? String(creative.id) : "";
        const largeThumb = creativeId ? await largeCreativeThumbnailUrl(creativeId, metaToken) : null;
        let thumbnailUrl = largeThumb || imageUrl || previewUrl || null;
        const videoId = creative?.video_id ? String(creative.video_id) : "";
        if (!largeThumb && videoId) {
          const videoPreview = await bestVideoPreviewUrl(videoId, metaToken);
          if (videoPreview) thumbnailUrl = videoPreview;
        }
        let storedThumb = await persistAdThumbnail(supabase, {
          adId: id,
          sourceUrl: thumbnailUrl,
          supabaseUrl,
        });
        if (!storedThumb && previewUrl && previewUrl !== thumbnailUrl) {
          storedThumb = await persistAdThumbnail(supabase, {
            adId: id,
            sourceUrl: previewUrl,
            supabaseUrl,
          });
        }
        let accountName: string | null = null;
        if (campaign.account_id) {
          const actId = campaign.account_id.toString().startsWith("act_") ? campaign.account_id : `act_${campaign.account_id}`;
          try {
            const accUrl = `https://graph.facebook.com/v24.0/${actId}?fields=name&access_token=${metaToken}`;
            const accRes = await fetch(accUrl);
            const accData = await accRes.json();
            if (!accData.error && accData.name) accountName = accData.name;
          } catch (_) {
            // ignore
          }
        }
        return new Response(
          JSON.stringify({
            ad: {
              ...metaAdIdentity(data),
              thumbnail_url: storedThumb || thumbnailUrl || null,
              thumbnail_stored_url: storedThumb || null,
              thumbnail_source_url: thumbnailUrl ?? null,
            },
            accountName: accountName || null,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        console.error("[get-ad-by-id] Exception:", err);
        return new Response(
          JSON.stringify({ error: { message: err?.message || "Falha ao buscar dados do anúncio", code: "REQUEST_FAILED" } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // --- Lead Ads (Gestão de leads dos anúncios) ---
    function normalizeLeadFieldData(fieldData: { name: string; values: string[] }[]): { nome: string | null; email: string | null; telefone: string | null; field_data: Record<string, string> } {
      const map: Record<string, string> = {};
      (fieldData || []).forEach((f) => {
        const v = Array.isArray(f.values) && f.values[0] != null ? String(f.values[0]).trim() : "";
        if (f.name && v) map[f.name] = v;
      });
      const fullName = map.full_name || null;
      const nome = fullName || (map.first_name || map.last_name ? [map.first_name, map.last_name].filter(Boolean).join(" ").trim() || null : null) || null;
      const email = map.email || null;
      const telefone = map.phone_number || map.phone || map.telefone || null;
      return { nome, email, telefone, field_data: map };
    }

    if (action === "get-leads-by-form") {
      const { form_id, since, limit, after } = body;
      if (!form_id || typeof form_id !== "string" || !form_id.trim()) {
        return new Response(
          JSON.stringify({ error: { message: "form_id is required", code: "MISSING_FORM_ID" } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      try {
        const formId = String(form_id).trim();
        const fields = "created_time,id,ad_id,form_id,field_data";
        let url = `https://graph.facebook.com/v24.0/${formId}/leads?fields=${encodeURIComponent(fields)}&limit=${Math.min(Number(limit) || 100, 500)}`;
        if (since != null && (typeof since === "number" || (typeof since === "string" && /^\d+$/.test(since)))) {
          const ts = typeof since === "string" ? parseInt(since, 10) : since;
          url += `&filtering=${encodeURIComponent(JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: ts }]))}`;
        }
        if (after && typeof after === "string" && after.trim()) url += `&after=${encodeURIComponent(after.trim())}`;
        url += `&access_token=${metaToken}`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.error) {
          return new Response(
            JSON.stringify({ error: data.error, leads: [], paging: null }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const leads = (data.data || []).map((lead: any) => {
          const normalized = normalizeLeadFieldData(lead.field_data || []);
          return {
            id: lead.id,
            created_time: lead.created_time,
            ad_id: lead.ad_id || null,
            form_id: lead.form_id || formId,
            nome: normalized.nome,
            email: normalized.email,
            telefone: normalized.telefone,
            field_data: normalized.field_data,
          };
        });
        return new Response(
          JSON.stringify({ leads, paging: data.paging || null }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: { message: err?.message || "Falha ao buscar leads do formulário", code: "REQUEST_FAILED" }, leads: [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (action === "get-lead-by-id") {
      const { leadgen_id } = body;
      if (!leadgen_id || typeof leadgen_id !== "string" || !leadgen_id.trim()) {
        return new Response(
          JSON.stringify({ error: { message: "leadgen_id is required", code: "MISSING_LEADGEN_ID" } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      try {
        const id = String(leadgen_id).trim();
        const fields = "created_time,id,ad_id,form_id,field_data";
        const url = `https://graph.facebook.com/v24.0/${id}?fields=${encodeURIComponent(fields)}&access_token=${metaToken}`;
        const response = await fetch(url);
        const lead = await response.json();
        if (lead.error) {
          return new Response(
            JSON.stringify({ error: lead.error, lead: null }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const normalized = normalizeLeadFieldData(lead.field_data || []);
        const out = {
          id: lead.id,
          created_time: lead.created_time,
          ad_id: lead.ad_id || null,
          form_id: lead.form_id || null,
          nome: normalized.nome,
          email: normalized.email,
          telefone: normalized.telefone,
          field_data: normalized.field_data,
        };
        return new Response(
          JSON.stringify({ lead: out }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: { message: err?.message || "Falha ao buscar lead", code: "REQUEST_FAILED" }, lead: null }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (action === "get-leads-by-ad") {
      const { ad_id, since, limit, after } = body;
      if (!ad_id || typeof ad_id !== "string" || !ad_id.trim()) {
        return new Response(
          JSON.stringify({ error: { message: "ad_id is required", code: "MISSING_AD_ID" } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      try {
        const adId = String(ad_id).trim();
        const fields = "created_time,id,ad_id,form_id,field_data";
        let url = `https://graph.facebook.com/v24.0/${adId}/leads?fields=${encodeURIComponent(fields)}&limit=${Math.min(Number(limit) || 100, 500)}`;
        if (since != null && (typeof since === "number" || (typeof since === "string" && /^\d+$/.test(since)))) {
          const ts = typeof since === "string" ? parseInt(since, 10) : since;
          url += `&filtering=${encodeURIComponent(JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: ts }]))}`;
        }
        if (after && typeof after === "string" && after.trim()) url += `&after=${encodeURIComponent(after.trim())}`;
        url += `&access_token=${metaToken}`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.error) {
          return new Response(
            JSON.stringify({ error: data.error, leads: [], paging: null }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const leads = (data.data || []).map((lead: any) => {
          const normalized = normalizeLeadFieldData(lead.field_data || []);
          return {
            id: lead.id,
            created_time: lead.created_time,
            ad_id: lead.ad_id || adId,
            form_id: lead.form_id || null,
            nome: normalized.nome,
            email: normalized.email,
            telefone: normalized.telefone,
            field_data: normalized.field_data,
          };
        });
        return new Response(
          JSON.stringify({ leads, paging: data.paging || null }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: { message: err?.message || "Falha ao buscar leads do anúncio", code: "REQUEST_FAILED" }, leads: [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (action === "get-ad-accounts") {
      try {
        console.log("🔍 Fetching ad accounts...");
        
        // Get business ID first (you may need to configure this)
        const businessId = Deno.env.get("META_BUSINESS_ID");
        console.log("Business ID from env:", businessId || "not set");
        console.log("🔍 Starting comprehensive ad accounts search...");
        
        if (!businessId) {
          // Try to get from user's businesses
          console.log("Fetching user businesses...");
          const userResponse = await fetch(
            `https://graph.facebook.com/v24.0/me?fields=businesses&access_token=${metaToken}`
          );
          const userData = await userResponse.json();
          
          console.log("User data response:", JSON.stringify(userData));
          
          if (userData.error) {
            console.error("❌ Meta API error:", userData.error);
            return new Response(
              JSON.stringify({
                error: {
                  message: userData.error.message || "Erro ao buscar businesses",
                  code: userData.error.code,
                  type: userData.error.type,
                },
                adAccounts: [],
              }),
              {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              }
            );
          }

          // Helper function to fetch all pages from paginated API
          const fetchAllPages = async (url: string): Promise<any[]> => {
            const allData: any[] = [];
            let currentUrl = url;
            
            while (currentUrl) {
              const response = await fetch(currentUrl);
              const data = await response.json();
              
              if (data.error) {
                console.error("❌ Error in pagination:", data.error);
                break;
              }
              
              if (data.data) {
                allData.push(...data.data);
              }
              
              // Check for next page
              currentUrl = data.paging?.next || null;
            }
            
            return allData;
          };

          // Helper function to remove duplicates by ID
          const removeDuplicates = (accounts: any[]): any[] => {
            const seen = new Set();
            return accounts.filter(account => {
              if (seen.has(account.id)) {
                return false;
              }
              seen.add(account.id);
              return true;
            });
          };

          const allAccounts: any[] = [];

          // Method 1: Try to get ad accounts directly from user (includes all accessible accounts)
          try {
            console.log("🔍 Fetching ad accounts directly from user (me/adaccounts)...");
            const directAccountsUrl = `https://graph.facebook.com/v24.0/me/adaccounts?fields=id,name,account_id,currency&limit=500&access_token=${metaToken}`;
            const directAccounts = await fetchAllPages(directAccountsUrl);
            
            if (directAccounts.length > 0) {
              console.log(`✅ Found ${directAccounts.length} ad accounts directly from user`);
              allAccounts.push(...directAccounts);
            } else {
              console.log("⚠️ No accounts found via me/adaccounts");
            }
          } catch (directErr) {
            console.warn("⚠️ Could not fetch direct ad accounts:", directErr);
          }
          
          // Method 1.5: Try to get ad accounts from System User's assigned assets
          try {
            console.log("🔍 Fetching ad accounts from System User assigned assets...");
            // Get the System User ID first
            const systemUserResponse = await fetch(
              `https://graph.facebook.com/v24.0/me?fields=id&access_token=${metaToken}`
            );
            const systemUserData = await systemUserResponse.json();
            
            if (systemUserData.id && !systemUserData.error) {
              const systemUserId = systemUserData.id;
              console.log(`System User ID: ${systemUserId}`);
              
              // Try to get ad accounts assigned to this system user
              const assignedAccountsUrl = `https://graph.facebook.com/v24.0/${systemUserId}/assigned_ad_accounts?fields=id,name,account_id,currency&limit=500&access_token=${metaToken}`;
              const assignedAccounts = await fetchAllPages(assignedAccountsUrl);
              
              if (assignedAccounts.length > 0) {
                console.log(`✅ Found ${assignedAccounts.length} assigned ad accounts from System User`);
                allAccounts.push(...assignedAccounts);
              }
            }
          } catch (systemUserErr) {
            console.warn("⚠️ Could not fetch System User assigned accounts:", systemUserErr);
          }

          // Method 2: Get accounts from all businesses (if available)
          if (userData.businesses && userData.businesses.data.length > 0) {
            console.log(`🔍 Fetching ad accounts from ${userData.businesses.data.length} businesses...`);
            console.log(`📋 Business IDs:`, userData.businesses.data.map((b: any) => `${b.id} (${b.name || 'no name'})`).join(', '));
            
            for (const business of userData.businesses.data) {
              try {
                console.log(`  📦 Processing business: ${business.id} (${business.name || 'no name'})`);
                
                // Get owned accounts
                const ownedUrl = `https://graph.facebook.com/v24.0/${business.id}/owned_ad_accounts?fields=id,name,account_id,currency&limit=500&access_token=${metaToken}`;
                const ownedAccounts = await fetchAllPages(ownedUrl);
                if (ownedAccounts.length > 0) {
                  console.log(`    ✅ Found ${ownedAccounts.length} owned accounts from business ${business.id}`);
                  allAccounts.push(...ownedAccounts);
                } else {
                  console.log(`    ⚠️ No owned accounts found for business ${business.id}`);
                }

                // Get assigned accounts (accounts the System User has access to but doesn't own)
                // This is the key endpoint - it returns ALL accounts the System User can access
                const assignedUrl = `https://graph.facebook.com/v24.0/${business.id}/ad_accounts?fields=id,name,account_id,currency&limit=500&access_token=${metaToken}`;
                const assignedAccounts = await fetchAllPages(assignedUrl);
                if (assignedAccounts.length > 0) {
                  console.log(`    ✅ Found ${assignedAccounts.length} assigned accounts from business ${business.id}`);
                  console.log(`    📋 Account IDs from ${business.id}:`, assignedAccounts.map((acc: any) => acc.id).join(', '));
                  allAccounts.push(...assignedAccounts);
                } else {
                  console.log(`    ⚠️ No assigned accounts found for business ${business.id}`);
                }
                
                // Also try the client_ad_accounts endpoint (for client accounts)
                try {
                  const clientAccountsUrl = `https://graph.facebook.com/v24.0/${business.id}/client_ad_accounts?fields=id,name,account_id,currency&limit=500&access_token=${metaToken}`;
                  const clientAccounts = await fetchAllPages(clientAccountsUrl);
                  if (clientAccounts.length > 0) {
                    console.log(`    ✅ Found ${clientAccounts.length} client accounts from business ${business.id}`);
                    allAccounts.push(...clientAccounts);
                  }
                } catch (clientErr) {
                  // This endpoint might not be available, ignore
                  console.log(`    ℹ️ client_ad_accounts endpoint not available for business ${business.id}`);
                }
              } catch (businessErr) {
                console.warn(`    ❌ Error fetching accounts from business ${business.id}:`, businessErr);
                if (businessErr instanceof Error) {
                  console.warn(`    Error message: ${businessErr.message}`);
                }
              }
            }
          } else {
            console.warn("⚠️ No businesses found for System User");
          }

          // Remove duplicates and return
          const uniqueAccounts = removeDuplicates(allAccounts);
          console.log(`✅ Total unique ad accounts found: ${uniqueAccounts.length}`);
          console.log(`📋 Account IDs:`, uniqueAccounts.map(acc => acc.id).join(', '));

          if (uniqueAccounts.length === 0) {
            return new Response(
              JSON.stringify({
                error: {
                  message: "Nenhuma conta de anúncio encontrada. Verifique se o System User tem acesso a contas de anúncio no Meta Business Manager.",
                  hint: "Configure o System User no Meta Business Manager e atribua-o a contas de anúncio.",
                },
                adAccounts: [],
              }),
              {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              }
            );
          }

          return new Response(
            JSON.stringify({
              adAccounts: uniqueAccounts,
            }),
            {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        } else {
          // Use configured business ID - but still fetch all types of accounts
          console.log("Using configured business ID:", businessId);
          
          // Helper function to fetch all pages from paginated API
          const fetchAllPages = async (url: string): Promise<any[]> => {
            const allData: any[] = [];
            let currentUrl = url;
            
            while (currentUrl) {
              const response = await fetch(currentUrl);
              const data = await response.json();
              
              if (data.error) {
                console.error("❌ Error in pagination:", data.error);
                break;
              }
              
              if (data.data) {
                allData.push(...data.data);
              }
              
              // Check for next page
              currentUrl = data.paging?.next || null;
            }
            
            return allData;
          };

          // Helper function to remove duplicates by ID
          const removeDuplicates = (accounts: any[]): any[] => {
            const seen = new Set();
            return accounts.filter(account => {
              if (seen.has(account.id)) {
                return false;
              }
              seen.add(account.id);
              return true;
            });
          };

          const allAccounts: any[] = [];

          // Get owned accounts
          try {
            const ownedUrl = `https://graph.facebook.com/v24.0/${businessId}/owned_ad_accounts?fields=id,name,account_id,currency&limit=500&access_token=${metaToken}`;
            const ownedAccounts = await fetchAllPages(ownedUrl);
            if (ownedAccounts.length > 0) {
              console.log(`✅ Found ${ownedAccounts.length} owned accounts`);
              allAccounts.push(...ownedAccounts);
            }
          } catch (err) {
            console.warn("⚠️ Error fetching owned accounts:", err);
          }

          // Get assigned accounts (accounts the System User has access to)
          try {
            const assignedUrl = `https://graph.facebook.com/v24.0/${businessId}/ad_accounts?fields=id,name,account_id,currency&limit=500&access_token=${metaToken}`;
            const assignedAccounts = await fetchAllPages(assignedUrl);
            if (assignedAccounts.length > 0) {
              console.log(`✅ Found ${assignedAccounts.length} assigned accounts`);
              allAccounts.push(...assignedAccounts);
            }
          } catch (err) {
            console.warn("⚠️ Error fetching assigned accounts:", err);
          }

          // Also try direct method as fallback
          try {
            const directUrl = `https://graph.facebook.com/v24.0/me/adaccounts?fields=id,name,account_id,currency&limit=500&access_token=${metaToken}`;
            const directAccounts = await fetchAllPages(directUrl);
            if (directAccounts.length > 0) {
              console.log(`✅ Found ${directAccounts.length} accounts directly from user`);
              allAccounts.push(...directAccounts);
            }
          } catch (err) {
            console.warn("⚠️ Error fetching direct accounts:", err);
          }

          // Remove duplicates
          const uniqueAccounts = removeDuplicates(allAccounts);
          console.log(`✅ Total unique ad accounts found: ${uniqueAccounts.length}`);

          if (uniqueAccounts.length === 0) {
            return new Response(
              JSON.stringify({
                error: {
                  message: "Nenhuma conta de anúncio encontrada. Verifique se o System User tem acesso a contas de anúncio no Meta Business Manager.",
                  hint: "Configure o System User no Meta Business Manager e atribua-o a contas de anúncio.",
                },
                adAccounts: [],
              }),
              {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              }
            );
          }

          return new Response(
            JSON.stringify({
              adAccounts: uniqueAccounts,
            }),
            {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
      } catch (err) {
        console.error("❌ Exception in get-ad-accounts:", err);
        return new Response(
          JSON.stringify({
            error: {
              message: err?.message || "Erro inesperado ao buscar contas de anúncio",
              details: err?.toString(),
            },
            adAccounts: [],
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Handle campaign insights and other actions
    if (action === "get-campaign-insights" || action === "get-ad-insights") {
      const { ad_account_id, time_range, metrics, cliente_id } = body;

      if (!ad_account_id) {
        return new Response(
          JSON.stringify({
            error: { message: "ad_account_id is required" },
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      try {
        const requestedLevel = String(body.level || "").toLowerCase();
        const defaultLevel = action === "get-campaign-insights" ? "campaign" : "ad";
        const level = requestedLevel === "account" ? "" : requestedLevel || defaultLevel;
        const fields = adsInsightFields(metrics, "spend,impressions,clicks");
        let insightsToken = metaToken;
        if (cliente_id) {
          const clientToken = await readClientMetaToken(supabase, String(cliente_id));
          if (clientToken) insightsToken = clientToken;
        }

        const params = new URLSearchParams({
          fields,
          access_token: String(insightsToken || ""),
          limit: String(body.limit || 500),
        });
        if (level) params.set("level", level);
        if (body.time_increment != null && String(body.time_increment).trim() !== "") {
          params.set("time_increment", String(body.time_increment));
        }
        const range = time_range as { since?: string; until?: string } | undefined;
        if (range?.since && range?.until) {
          params.set(
            "time_range",
            JSON.stringify({ since: range.since, until: range.until })
          );
        } else {
          params.set("date_preset", "last_30d");
        }
        const url = `https://graph.facebook.com/v24.0/${encodeURIComponent(String(ad_account_id))}/insights?${params.toString()}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
          throw new Error(data.error.message);
        }

        return new Response(
          JSON.stringify({
            campaigns: data.data || [],
            paging: data.paging || null,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({
            error: {
              message: err.message || "Failed to fetch insights",
            },
            campaigns: {},
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Get campaigns for an ad account
    if (action === "get-campaigns") {
      const { adAccountId, time_range, metrics } = body;

      if (!adAccountId) {
        return new Response(
          JSON.stringify({ error: { message: "adAccountId is required" } }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
        const metricsStr = adsInsightFields(
          metrics,
          "spend,impressions,clicks,reach,results,instagram_profile_visits,actions,action_values"
        );
        const validTimeRange = time_range && time_range.since && time_range.until 
          ? time_range 
          : { since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], until: new Date().toISOString().split('T')[0] };
        const timeRangeJson = JSON.stringify(validTimeRange);
        const insightsNested = `insights.time_range(${timeRangeJson}).fields(${metricsStr})`;
        // Anúncio com insights do período (fallback sem insights / sem ads se a Graph recusar)
        const adsNestedRich =
          `ads.limit(50){id,name,status,configured_status,effective_status,${insightsNested}}`;
        const adsNestedSafe =
          "ads.limit(50){id,name,status,configured_status,effective_status}";
        const adsetNestedRich =
          `adsets{id,name,status,configured_status,effective_status,campaign_id,optimization_goal,targeting,issues_info,delivery_info,recommendations,${adsNestedRich},${insightsNested}}`;
        const adsetNestedMid =
          `adsets{id,name,status,configured_status,effective_status,campaign_id,optimization_goal,targeting,issues_info,${adsNestedRich},${insightsNested}}`;
        const adsetNestedAdsSafe =
          `adsets{id,name,status,configured_status,effective_status,campaign_id,optimization_goal,targeting,issues_info,${adsNestedSafe},${insightsNested}}`;
        const adsetNestedSafe =
          `adsets{id,name,status,configured_status,effective_status,campaign_id,optimization_goal,targeting,issues_info,${insightsNested}}`;
        const campaignFieldSets = [
          `id,name,status,configured_status,effective_status,objective,created_time,updated_time,issues_info,recommendations,${adsetNestedRich}`,
          `id,name,status,configured_status,effective_status,objective,created_time,updated_time,issues_info,${adsetNestedMid}`,
          `id,name,status,configured_status,effective_status,objective,created_time,updated_time,issues_info,${adsetNestedAdsSafe}`,
          `id,name,status,configured_status,effective_status,objective,created_time,updated_time,issues_info,${adsetNestedSafe}`,
        ];
        const campaignsData = await graphWithFieldFallback(
          campaignFieldSets.map(
            (fields) =>
              `https://graph.facebook.com/v24.0/${accountId}/campaigns?fields=${encodeURIComponent(fields)}&access_token=${metaToken}`
          )
        );

        if (campaignsData.error) {
          return new Response(
            JSON.stringify({ error: campaignsData.error, campaigns: [] }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        let accountStatus: number | null = null;
        let disableReason: number | null = null;
        let fundingSourceDetails: any = null;
        let failedDeliveryChecks: any = null;
        try {
          const accJson = await graphWithFieldFallback([
            `https://graph.facebook.com/v24.0/${accountId}?fields=account_status,disable_reason,funding_source_details,failed_delivery_checks&access_token=${metaToken}`,
            `https://graph.facebook.com/v24.0/${accountId}?fields=account_status,disable_reason,funding_source_details&access_token=${metaToken}`,
            `https://graph.facebook.com/v24.0/${accountId}?fields=account_status,disable_reason&access_token=${metaToken}`,
          ]);
          if (!accJson?.error) {
            accountStatus = accJson.account_status ?? null;
            disableReason = accJson.disable_reason ?? null;
            fundingSourceDetails = accJson.funding_source_details ?? null;
            failedDeliveryChecks = accJson.failed_delivery_checks ?? null;
          }
        } catch {
          // conta sem status não bloqueia campanhas
        }

        // Debug: verifica se effective_status está sendo retornado
        if (campaignsData.data && campaignsData.data.length > 0) {
          const firstCampaign = campaignsData.data[0];
          console.log(`📊 Primeira campanha retornada pela API:`, {
            id: firstCampaign.id,
            name: firstCampaign.name,
            status: firstCampaign.status,
            effective_status: firstCampaign.effective_status,
            allFields: Object.keys(firstCampaign)
          });
        }

        console.log(`📅 Time range:`, validTimeRange);
        console.log(`📊 Metrics:`, metricsStr);
        
        // Processa TODAS as campanhas em paralelo para máxima velocidade
        const campaignsWithInsights = [];
        const campaignsList = campaignsData.data || [];
        
        console.log(`📊 Processando ${campaignsList.length} campanhas em paralelo...`);
        
        // Processa todas as campanhas simultaneamente
        const allCampaignPromises = campaignsList.map(async (campaign, index) => {
          try {
            // Busca insights
            const timeRangeParam = encodeURIComponent(JSON.stringify(validTimeRange));
            const insightsUrl = `https://graph.facebook.com/v24.0/${campaign.id}/insights?fields=${metricsStr}&time_range=${timeRangeParam}&access_token=${metaToken}`;
            
            const insightsResponse = await fetch(insightsUrl);
            const insightsData = await insightsResponse.json();
            
            // Garante que sempre retorna um formato consistente
            if (insightsData.error) {
              console.error(`❌ Error fetching insights for campaign ${campaign.id}:`, insightsData.error);
              return { ...campaign, insights: { data: [], error: insightsData.error } };
            }
            
            // Busca effective_status apenas se não estiver presente
            let finalCampaign = { ...campaign };
            if (!finalCampaign.effective_status) {
              try {
                const campaignDetailsUrl = `https://graph.facebook.com/v24.0/${campaign.id}?fields=effective_status&access_token=${metaToken}`;
                const campaignDetailsResponse = await fetch(campaignDetailsUrl);
                const campaignDetailsData = await campaignDetailsResponse.json();
                
                if (!campaignDetailsData.error && campaignDetailsData.effective_status) {
                  finalCampaign.effective_status = campaignDetailsData.effective_status;
                }
              } catch (err) {
                // Ignora erro de effective_status, não é crítico
              }
            }
            
            // Garante que data seja sempre um array
            return { 
              ...finalCampaign,
              account_status: accountStatus,
              disable_reason: disableReason,
              funding_source_details: fundingSourceDetails,
              failed_delivery_checks: failedDeliveryChecks,
              insights: { 
                data: Array.isArray(insightsData.data) ? insightsData.data : (insightsData.data ? [insightsData.data] : []),
                paging: insightsData.paging || null
              } 
            };
          } catch (err) {
            console.error(`Exception fetching insights for campaign ${campaign.id}:`, err);
            return {
              ...campaign,
              account_status: accountStatus,
              disable_reason: disableReason,
              funding_source_details: fundingSourceDetails,
              failed_delivery_checks: failedDeliveryChecks,
              insights: { data: [], error: { message: err.message } },
            };
          }
        });
        
        // Aguarda todas as campanhas processarem
        const allResults = await Promise.all(allCampaignPromises);
        campaignsWithInsights.push(...allResults);
        
        console.log(`✅ Todas as ${campaignsWithInsights.length} campanhas processadas!`);

        return new Response(
          JSON.stringify({ campaigns: campaignsWithInsights }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: { message: err?.message || "Erro ao buscar campanhas" }, campaigns: [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Get account-level insights
    if (action === "get-account-insights") {
      const { adAccountId, time_range, metrics } = body;

      if (!adAccountId) {
        return new Response(
          JSON.stringify({ error: { message: "adAccountId is required" } }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
        const metricsStr = adsInsightFields(metrics, "spend,impressions,clicks,results");
        const validTimeRange = time_range && time_range.since && time_range.until 
          ? time_range 
          : { since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], until: new Date().toISOString().split('T')[0] };
        const timeRangeParam = encodeURIComponent(JSON.stringify(validTimeRange));
        const url = `https://graph.facebook.com/v24.0/${accountId}/insights?fields=${metricsStr}&time_range=${timeRangeParam}&access_token=${metaToken}`;
        
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
          return new Response(
            JSON.stringify({ error: data.error, insights: null }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ insights: data.data?.[0] || data.data || null }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: { message: err?.message || "Erro ao buscar insights" }, insights: null }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Get ad sets for a campaign or account
    // Uma única chamada Graph: targeting + insights aninhados (evita N requests / rate limit)
    if (action === "get-adsets") {
      const { campaignId, adAccountId, time_range, metrics, skipInsights } = body;

      if (!campaignId && !adAccountId) {
        return new Response(
          JSON.stringify({ error: { message: "campaignId or adAccountId is required" } }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const metricsStr = adsInsightFields(
          metrics,
          "spend,impressions,clicks,reach,results,instagram_profile_visits,actions,action_values"
        );
        const validTimeRange =
          time_range && time_range.since && time_range.until
            ? time_range
            : {
                since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
                until: new Date().toISOString().split("T")[0],
              };
        const timeRangeJson = JSON.stringify(validTimeRange);

        const adsNestedRich = skipInsights === true
          ? "ads.limit(50){id,name,status,configured_status,effective_status}"
          : `ads.limit(50){id,name,status,configured_status,effective_status,insights.time_range(${timeRangeJson}).fields(${metricsStr})}`;
        const adsNestedSafe =
          "ads.limit(50){id,name,status,configured_status,effective_status}";
        const baseRich =
          `id,name,status,configured_status,effective_status,campaign_id,created_time,updated_time,optimization_goal,daily_budget,lifetime_budget,targeting,issues_info,delivery_info,recommendations,${adsNestedRich}`;
        const baseMid =
          `id,name,status,configured_status,effective_status,campaign_id,created_time,updated_time,optimization_goal,daily_budget,lifetime_budget,targeting,issues_info,delivery_info,${adsNestedRich}`;
        const baseSafeWithAdsRich =
          `id,name,status,configured_status,effective_status,campaign_id,created_time,updated_time,optimization_goal,targeting,issues_info,${adsNestedRich}`;
        const baseSafeWithAds =
          `id,name,status,configured_status,effective_status,campaign_id,created_time,updated_time,optimization_goal,targeting,issues_info,${adsNestedSafe}`;
        const baseSafe =
          "id,name,status,configured_status,effective_status,campaign_id,created_time,updated_time,optimization_goal,targeting,issues_info";
        const withInsights = (fields: string) =>
          skipInsights === true ? fields : `${fields},insights.time_range(${timeRangeJson}).fields(${metricsStr})`;

        const rawAccountId = adAccountId
          ? adAccountId.startsWith("act_")
            ? adAccountId
            : `act_${adAccountId}`
          : null;
        const endpoint = campaignId ? `${campaignId}/adsets` : `${rawAccountId}/adsets`;
        const adsetsData = await graphWithFieldFallback(
          [baseRich, baseMid, baseSafeWithAdsRich, baseSafeWithAds, baseSafe].map(
            (fields) =>
              `https://graph.facebook.com/v24.0/${endpoint}?fields=${encodeURIComponent(withInsights(fields))}&limit=100&access_token=${metaToken}`
          )
        );

        console.log(
          `📊 [get-adsets] campanha=${campaignId || "-"} conta=${rawAccountId || "-"} skipInsights=${skipInsights === true} n=${(adsetsData.data || []).length}`
        );

        if (adsetsData.error) {
          console.error(`❌ [get-adsets] Erro do Meta:`, adsetsData.error);
          return new Response(
            JSON.stringify({ error: adsetsData.error, adsets: [] }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const rawAdsets = adsetsData.data || [];
        const adsets = rawAdsets.map((adset: any) => {
          if (skipInsights === true) {
            return { ...adset, insights: { data: [], skipped: true } };
          }
          const nested = adset.insights;
          const data = Array.isArray(nested?.data)
            ? nested.data
            : nested?.data
              ? [nested.data]
              : Array.isArray(nested)
                ? nested
                : [];
          return {
            ...adset,
            insights: { data, paging: nested?.paging || null },
          };
        });

        const adsetsWithInsights =
          skipInsights === true
            ? adsets
            : await enrichWithDirectInsights(adsets, metricsStr, validTimeRange, metaToken);

        return new Response(JSON.stringify({ adsets: adsetsWithInsights }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(
          JSON.stringify({ error: { message: err?.message || "Erro ao buscar ad sets" }, adsets: [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Single ad (stale check / lightweight)
    if (action === "get-ad") {
      const { adId } = body;
      if (!adId) {
        return new Response(
          JSON.stringify({ error: { message: "adId is required" } }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      try {
        const url =
          `https://graph.facebook.com/v24.0/${adId}?fields=id,name,status,effective_status,adset_id,campaign_id&access_token=${metaToken}`;
        const res = await fetch(url);
        const d = await res.json();
        if (d.error) {
          return new Response(
            JSON.stringify({ error: d.error, ad: null }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({ ad: d }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: { message: err?.message || "Erro ao buscar anúncio" }, ad: null }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Get ads for an ad set, campaign, or account
    if (action === "get-ads") {
      const { adsetId, adAccountId, campaignId, time_range, metrics, skipInsights } = body;

      if (!adsetId && !adAccountId && !campaignId) {
        return new Response(
          JSON.stringify({ error: { message: "adsetId, adAccountId, or campaignId is required" } }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const metricsStr = adsInsightFields(
          metrics,
          "spend,impressions,clicks,reach,results,instagram_profile_visits,actions,action_values"
        );
        const validTimeRange =
          time_range && time_range.since && time_range.until
            ? time_range
            : {
                since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
                until: new Date().toISOString().split("T")[0],
              };
        const timeRangeJson = JSON.stringify(validTimeRange);
        const adFieldsBase =
          "id,name,status,configured_status,effective_status,adset_id,created_time,updated_time";
        const adFieldsWithInsights =
          `${adFieldsBase},insights.time_range(${timeRangeJson}).fields(${metricsStr})`;
        let endpoint: string;
        if (adsetId) {
          endpoint = `${adsetId}/ads`;
        } else if (campaignId) {
          endpoint = `${campaignId}/ads`;
        } else {
          const accountId = String(adAccountId).startsWith("act_")
            ? adAccountId
            : `act_${adAccountId}`;
          endpoint = `${accountId}/ads`;
        }

        if (skipInsights === true) {
          const adsData = await graphJson(
            `https://graph.facebook.com/v24.0/${endpoint}?fields=${encodeURIComponent(adFieldsBase)}&limit=50&access_token=${metaToken}`
          );
          if (adsData.error) {
            return new Response(
              JSON.stringify({ error: adsData.error, ads: [] }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          const light = (adsData.data || []).map((ad: any) => ({
            ...ad,
            insights: { data: [], skipped: true },
          }));
          return new Response(JSON.stringify({ ads: light }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Uma chamada só com insights aninhados (evita N+1 / rate limit)
        const adsData = await graphWithFieldFallback([
          `https://graph.facebook.com/v24.0/${endpoint}?fields=${encodeURIComponent(adFieldsWithInsights)}&limit=50&access_token=${metaToken}`,
          `https://graph.facebook.com/v24.0/${endpoint}?fields=${encodeURIComponent(adFieldsBase)}&limit=50&access_token=${metaToken}`,
        ]);

        if (adsData.error) {
          return new Response(
            JSON.stringify({ error: adsData.error, ads: [] }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const adsWithInsights = (adsData.data || []).map((ad: any) => {
          const nested = ad.insights;
          const data = Array.isArray(nested?.data)
            ? nested.data
            : nested?.data
              ? [nested.data]
              : Array.isArray(nested)
                ? nested
                : [];
          return {
            ...ad,
            insights: { data, paging: nested?.paging || null },
          };
        });

        const adsEnriched = await enrichWithDirectInsights(
          adsWithInsights,
          metricsStr,
          validTimeRange,
          metaToken
        );

        return new Response(
          JSON.stringify({ ads: adsEnriched }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: { message: err?.message || "Erro ao buscar anúncios" }, ads: [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Get Facebook Pages
    if (action === "get-pages") {
      try {
        console.log("🔍 Fetching Facebook pages...");
        
        // Busca páginas do System User
        const pagesUrl = `https://graph.facebook.com/v24.0/me/accounts?fields=id,name,access_token,category,picture&limit=500&access_token=${metaToken}`;
        const pagesResponse = await fetch(pagesUrl);
        const pagesData = await pagesResponse.json();

        if (pagesData.error) {
          return new Response(
            JSON.stringify({
              error: {
                message: pagesData.error.message || "Erro ao buscar páginas",
                code: pagesData.error.code,
                type: pagesData.error.type,
              },
              pages: [],
            }),
            {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        return new Response(
          JSON.stringify({
            pages: pagesData.data || [],
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      } catch (err) {
        console.error("❌ Exception in get-pages:", err);
        return new Response(
          JSON.stringify({
            error: {
              message: err?.message || "Erro inesperado ao buscar páginas",
              details: err?.toString(),
            },
            pages: [],
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Get Instagram Business Accounts
    if (action === "get-instagram-accounts") {
      try {
        console.log("🔍 Fetching Instagram Business accounts...");
        
        // Primeiro busca as páginas do Facebook (que podem ter Instagram conectado)
        const pagesUrl = `https://graph.facebook.com/v24.0/me/accounts?fields=id,name,instagram_business_account&limit=500&access_token=${metaToken}`;
        const pagesResponse = await fetch(pagesUrl);
        const pagesData = await pagesResponse.json();

        if (pagesData.error) {
          return new Response(
            JSON.stringify({
              error: {
                message: pagesData.error.message || "Erro ao buscar contas Instagram",
                code: pagesData.error.code,
              },
              instagramAccounts: [],
            }),
            {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        // Filtra apenas páginas com Instagram Business conectado
        const instagramAccounts = [];
        for (const page of pagesData.data || []) {
          if (page.instagram_business_account) {
            try {
              // Busca detalhes da conta Instagram
              const instagramUrl = `https://graph.facebook.com/v24.0/${page.instagram_business_account.id}?fields=id,username,name,profile_picture_url,biography,website,followers_count,follows_count,media_count&access_token=${metaToken}`;
              const instagramResponse = await fetch(instagramUrl);
              const instagramData = await instagramResponse.json();
              
              if (!instagramData.error && instagramData.id) {
                instagramAccounts.push({
                  id: instagramData.id,
                  username: instagramData.username,
                  name: instagramData.name || instagramData.username,
                  profile_picture_url: instagramData.profile_picture_url,
                  biography: instagramData.biography || "",
                  website: instagramData.website || "",
                  followers_count: instagramData.followers_count ?? null,
                  follows_count: instagramData.follows_count ?? null,
                  media_count: instagramData.media_count ?? null,
                  page_id: page.id,
                  page_name: page.name,
                });
              }
            } catch (err) {
              console.warn(`⚠️ Erro ao buscar detalhes do Instagram ${page.instagram_business_account.id}:`, err);
            }
          }
        }

        return new Response(
          JSON.stringify({
            instagramAccounts: instagramAccounts,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      } catch (err) {
        console.error("❌ Exception in get-instagram-accounts:", err);
        return new Response(
          JSON.stringify({
            error: {
              message: err?.message || "Erro inesperado ao buscar contas Instagram",
              details: err?.toString(),
            },
            instagramAccounts: [],
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Get Page Insights
    if (action === "get-page-insights") {
      const { page_id, time_range } = body;

      if (!page_id) {
        return new Response(
          JSON.stringify({ error: { message: "page_id is required" }, insights: [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const pageAccessToken = await getPageAccessToken(page_id, metaToken);
        if (!pageAccessToken) {
          return new Response(
            JSON.stringify({ error: { message: "Não foi possível obter o token de acesso da página" }, insights: [] }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const validTimeRange = time_range && time_range.since && time_range.until
          ? time_range
          : {
              since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
              until: new Date().toISOString().split("T")[0],
            };

        // page_reach / page_impressions_unique saíram da Graph (jun/2026).
        // Cada métrica vai sozinha: uma inválida não zera o lote.
        const specs: Array<{ name: string; period: string; reduce: "sum" | "last" }> = [
          { name: "page_total_media_view_unique", period: "days_28", reduce: "last" },
          { name: "page_media_view", period: "day", reduce: "sum" },
          { name: "page_post_engagements", period: "day", reduce: "sum" },
          { name: "page_views_total", period: "day", reduce: "sum" },
          { name: "page_follows", period: "day", reduce: "last" },
          { name: "page_daily_follows", period: "day", reduce: "sum" },
          { name: "page_total_actions", period: "day", reduce: "sum" },
          { name: "page_video_views", period: "day", reduce: "sum" },
        ];

        const insightsResults: any[] = [];
        for (const spec of specs) {
          const periods = spec.period === "days_28" ? ["days_28", "day"] : [spec.period];
          let loaded = false;
          for (const period of periods) {
            const url =
              `https://graph.facebook.com/v24.0/${page_id}/insights` +
              `?metric=${encodeURIComponent(spec.name)}` +
              `&period=${period}` +
              `&since=${validTimeRange.since}&until=${validTimeRange.until}` +
              `&access_token=${pageAccessToken}`;
            const response = await fetch(url);
            const data = await response.json();
            if (data.error || !Array.isArray(data.data) || !data.data.length) continue;
            for (const row of data.data) {
              insightsResults.push({
                ...row,
                value: insightNumeric(row, spec.reduce),
              });
            }
            loaded = true;
            break;
          }
          if (!loaded) {
            console.warn(`⚠️ Page insight ${spec.name} vazia ou inválida`);
          }
        }

        return new Response(
          JSON.stringify({ insights: insightsResults }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: { message: err?.message || "Erro ao buscar insights da página" }, insights: [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Cidades e países de quem segue a página. Idade e gênero a Meta retirou.
    if (action === "get-page-audience") {
      const { page_id, time_range } = body;
      if (!page_id) {
        return new Response(
          JSON.stringify({ error: { message: "page_id is required" }, audience: null }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const distribution = (payload: any): Record<string, number> | null => {
        const rows = Array.isArray(payload?.data) ? payload.data : [];
        for (const row of rows) {
          const values = Array.isArray(row?.values) ? row.values : [];
          for (let index = values.length - 1; index >= 0; index -= 1) {
            const value = values[index]?.value;
            if (!value || typeof value !== "object" || Array.isArray(value)) continue;
            const entries = Object.entries(value).filter(([, amount]) => Number(amount) > 0);
            if (!entries.length) continue;
            return Object.fromEntries(entries.map(([label, amount]) => [label, Number(amount)]));
          }
        }
        return null;
      };

      const toRows = (map: Record<string, number> | null) => {
        if (!map) return [];
        return Object.entries(map)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([label, value]) => ({ label, value }));
      };

      try {
        const pageAccessToken = await getPageAccessToken(page_id, metaToken);
        if (!pageAccessToken) {
          return new Response(
            JSON.stringify({
              error: { message: "Não foi possível obter o token de acesso da página" },
              audience: { city: [], country: [] },
              note: "Sem token da página para ler cidades e países.",
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const since = time_range?.since;
        const until = time_range?.until;
        const specs = [
          { metric: "page_follows_city", key: "city", fallback: "page_fans_city" },
          { metric: "page_follows_country", key: "country", fallback: "page_fans_country" },
        ];
        const audience: Record<string, Array<{ label: string; value: number }>> = { city: [], country: [] };

        for (const spec of specs) {
          const names = [spec.metric, spec.fallback];
          let rows: Array<{ label: string; value: number }> = [];
          for (const name of names) {
            const attempts = [
              `period=day${since && until ? `&since=${since}&until=${until}` : ""}`,
              "period=lifetime",
            ];
            for (const query of attempts) {
              const url =
                `https://graph.facebook.com/v24.0/${page_id}/insights` +
                `?metric=${encodeURIComponent(name)}&${query}&access_token=${pageAccessToken}`;
              const response = await fetch(url);
              const data = await response.json();
              if (data?.error) continue;
              const map = distribution(data);
              if (!map) continue;
              rows = toRows(map);
              break;
            }
            if (rows.length) break;
          }
          audience[spec.key] = rows;
        }

        const found = audience.city.length + audience.country.length > 0;
        return new Response(
          JSON.stringify({
            audience,
            note: found
              ? "Idade e gênero a Meta não devolve para a página."
              : "A Meta não devolveu cidades nem países desta página. Idade e gênero também não existem mais nesse fluxo.",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({
            error: { message: err?.message || "Erro ao buscar audiência da página" },
            audience: { city: [], country: [] },
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Get Page Posts
    if (action === "get-page-posts") {
      const { page_id, time_range } = body;

      if (!page_id) {
        return new Response(
          JSON.stringify({ error: { message: "page_id is required" } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const pageAccessToken = await getPageAccessToken(page_id, metaToken);
        if (!pageAccessToken) {
          return new Response(
            JSON.stringify({ error: { message: "Não foi possível obter o token de acesso da página" }, posts: [] }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const validTimeRange = time_range && time_range.since && time_range.until
          ? time_range
          : { since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0], until: new Date().toISOString().split("T")[0] };

        const fields = [
          "id",
          "message",
          "created_time",
          "permalink_url",
          "full_picture",
          "status_type",
          "shares",
          "reactions.limit(0).summary(true)",
          "comments.limit(0).summary(true)",
          "attachments{media_type,type,url,media,subattachments,unshimmed_url,title}",
        ].join(",");
        const postsUrl =
          `https://graph.facebook.com/v24.0/${page_id}/published_posts` +
          `?fields=${encodeURIComponent(fields)}` +
          `&since=${validTimeRange.since}&until=${validTimeRange.until}` +
          `&limit=50&access_token=${pageAccessToken}`;
        const postsResponse = await fetch(postsUrl);
        const postsData = await postsResponse.json();

        if (postsData.error) {
          return new Response(
            JSON.stringify({ error: postsData.error, posts: [] }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const mapAttachmentType = (post: any) => {
          const attachments = post?.attachments?.data || [];
          const first = attachments[0] || {};
          const sub = first.subattachments?.data || [];
          const mediaType = String(first.media_type || first.type || "").toLowerCase();
          if (sub.length > 1 || mediaType === "album") return "CAROUSEL_ALBUM";
          if (mediaType.includes("video")) return "VIDEO";
          if (mediaType.includes("photo") || mediaType.includes("image") || post.full_picture) return "IMAGE";
          return "STATUS";
        };

        const processedPosts = (postsData.data || []).map((post: any) => {
          const mediaType = mapAttachmentType(post);
          const first = (post.attachments?.data || [])[0] || {};
          const image = first.media?.image || {};
          const original = image.src ? String(image.src) : "";
          const preview = post.full_picture ? String(post.full_picture) : "";
          const thumb = original || preview || first.unshimmed_url || null;
          const reactionsCount = Number(post.reactions?.summary?.total_count) || 0;
          const commentsCount = Number(post.comments?.summary?.total_count) || 0;
          const sharesCount = Number(post.shares?.count) || 0;
          return {
            id: post.id,
            message: post.message || "",
            created_time: post.created_time,
            permalink_url: post.permalink_url || null,
            full_picture: thumb,
            thumbnail_url: thumb,
            media_type: mediaType,
            type: mediaType,
            status_type: post.status_type || null,
            platform: "facebook_page",
            reactions_count: reactionsCount,
            comments_count: commentsCount,
            shares_count: sharesCount,
            like_count: reactionsCount,
            insights: {
              likes: reactionsCount,
              comments: commentsCount,
              shares: sharesCount,
              engagement: reactionsCount + commentsCount + sharesCount,
            },
          };
        });

        return new Response(
          JSON.stringify({ posts: processedPosts }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: { message: err?.message || "Erro ao buscar posts da página" }, posts: [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (action === "get-page-post-insights") {
      const { post_id, page_id } = body;
      if (!post_id) {
        return new Response(
          JSON.stringify({ error: { message: "post_id is required" }, insights: [], metrics: null }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      try {
        const token = page_id
          ? (await getPageAccessToken(page_id, metaToken)) || metaToken
          : metaToken;
        const metricList = [
          "post_total_media_view_unique",
          "post_media_view",
          "post_clicks",
          "post_reactions_by_type_total",
          "post_video_views",
          "post_video_avg_time_watched",
        ];
        const rows: any[] = [];
        for (const metric of metricList) {
          const url =
            `https://graph.facebook.com/v24.0/${post_id}/insights` +
            `?metric=${encodeURIComponent(metric)}&period=lifetime&access_token=${token}`;
          const response = await fetch(url);
          const data = await response.json();
          if (data.error || !Array.isArray(data.data)) continue;
          for (const row of data.data) {
            rows.push({ ...row, value: insightNumeric(row, "last") });
          }
        }
        const byName: Record<string, number> = {};
        for (const row of rows) byName[row.name] = Number(row.value) || 0;
        return new Response(
          JSON.stringify({
            insights: rows,
            metrics: {
              reach: byName.post_total_media_view_unique || null,
              views: byName.post_media_view || byName.post_video_views || null,
              clicks: byName.post_clicks || null,
              reactions: byName.post_reactions_by_type_total || null,
              video_views: byName.post_video_views || null,
              avg_watch_ms: byName.post_video_avg_time_watched || null,
            },
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: { message: err?.message || "Erro ao buscar insights do post" }, insights: [], metrics: null }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Get Instagram Insights
    if (action === "get-instagram-insights") {
      const { instagram_account_id, time_range, metrics } = body;

      if (!instagram_account_id) {
        return new Response(
          JSON.stringify({ error: { message: "instagram_account_id is required" } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const requested = Array.isArray(metrics)
          ? metrics.map(String)
          : String(metrics || "reach,follower_count,profile_views,total_interactions").split(",");
        const validTimeRange = time_range && time_range.since && time_range.until
          ? time_range
          : {
              since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
              until: new Date().toISOString().split("T")[0],
            };

        // period=day + since/until: reach, follower_count (delta diário — pouco útil sozinho)
        // metric_type=total_value + period=day + since/until: profile_views, total_interactions
        const periodMetrics = requested.filter((m) =>
          ["reach", "follower_count", "impressions"].includes(m.trim())
        );
        const totalValueMetrics = requested.filter((m) =>
          ["profile_views", "website_clicks", "profile_links_taps", "total_interactions", "accounts_engaged", "follows_and_unfollows"].includes(m.trim())
        );

        const insightsResults: any[] = [];

        const normalizeInsight = (row: any) => {
          let value = 0;
          if (row?.total_value && typeof row.total_value === "object" && row.total_value.value != null) {
            value = Number(row.total_value.value) || 0;
          } else if (Array.isArray(row?.values) && row.values.length) {
            if (row.name === "follower_count") {
              value = Number(row.values[row.values.length - 1]?.value) || 0;
            } else {
              value = row.values.reduce(
                (sum: number, entry: any) => sum + (Number(entry?.value) || 0),
                0
              );
            }
          } else if (row?.value != null) {
            value = Number(row.value) || 0;
          }
          return { ...row, value };
        };

        for (const metric of periodMetrics) {
          try {
            const periodUrl =
              `https://graph.facebook.com/v24.0/${instagram_account_id}/insights` +
              `?metric=${encodeURIComponent(metric.trim())}` +
              `&period=day&since=${validTimeRange.since}&until=${validTimeRange.until}` +
              `&access_token=${metaToken}`;
            const periodResponse = await fetch(periodUrl);
            const periodData = await periodResponse.json();
            if (!periodData.error && periodData.data) {
              insightsResults.push(...periodData.data.map(normalizeInsight));
            } else if (periodData.error) {
              console.warn(`⚠️ Erro ao buscar ${metric} com period:`, periodData.error);
            }
          } catch (err) {
            console.warn(`⚠️ Erro ao buscar métrica ${metric}:`, err);
          }
        }

        for (const metric of totalValueMetrics) {
          try {
            const totalValueUrl =
              `https://graph.facebook.com/v24.0/${instagram_account_id}/insights` +
              `?metric=${encodeURIComponent(metric.trim())}` +
              `&metric_type=total_value&period=day` +
              `&since=${validTimeRange.since}&until=${validTimeRange.until}` +
              `&access_token=${metaToken}`;
            const totalValueResponse = await fetch(totalValueUrl);
            const totalValueData = await totalValueResponse.json();
            if (!totalValueData.error && totalValueData.data) {
              insightsResults.push(...totalValueData.data.map(normalizeInsight));
            } else if (totalValueData.error) {
              console.warn(`⚠️ Erro ao buscar ${metric} com total_value:`, totalValueData.error);
            }
          } catch (err) {
            console.warn(`⚠️ Erro ao buscar métrica ${metric} com total_value:`, err);
          }
        }

        // Seguidores atuais vêm do perfil (follower_count diário costuma ser delta ~0).
        try {
          const profileUrl =
            `https://graph.facebook.com/v24.0/${instagram_account_id}` +
            `?fields=followers_count,media_count&access_token=${metaToken}`;
          const profileRes = await fetch(profileUrl);
          const profileJson = await profileRes.json();
          if (!profileJson.error && profileJson.followers_count != null) {
            insightsResults.push({
              name: "followers_current",
              value: Number(profileJson.followers_count) || 0,
              period: "lifetime",
            });
          }
        } catch {
          // opcional
        }

        return new Response(
          JSON.stringify({ insights: insightsResults }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: { message: err?.message || "Erro ao buscar insights do Instagram" }, insights: null }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Demografia do público Instagram (idade, gênero, cidade, país)
    if (action === "get-instagram-audience") {
      const { instagram_account_id, timeframe } = body;
      if (!instagram_account_id) {
        return new Response(
          JSON.stringify({ error: { message: "instagram_account_id is required" }, audience: null }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const tf = ["this_week", "this_month", "last_30_days", "last_90_days"].includes(String(timeframe || ""))
        ? String(timeframe)
        : "this_month";

      const parseBreakdown = (payload: any) => {
        const rows = payload?.data || [];
        if (!rows.length) return [];
        const totalValue = rows[0]?.total_value;
        const breakdowns = totalValue?.breakdowns || [];
        const results = breakdowns[0]?.results || [];
        return results
          .map((entry: any) => {
            const dims = entry?.dimension_values || [];
            // Meta costuma devolver [timeframe, dimension] ou só [dimension]
            const label = String(dims[dims.length - 1] || dims[0] || "").trim();
            const value = Number(entry?.value) || 0;
            if (!label || !value) return null;
            return { label, value };
          })
          .filter(Boolean)
          .sort((a: any, b: any) => b.value - a.value);
      };

      const fetchDemo = async (metric: string, breakdown: string) => {
        const url =
          `https://graph.facebook.com/v24.0/${instagram_account_id}/insights` +
          `?metric=${encodeURIComponent(metric)}` +
          `&period=lifetime&metric_type=total_value` +
          `&timeframe=${encodeURIComponent(tf)}` +
          `&breakdown=${encodeURIComponent(breakdown)}` +
          `&access_token=${metaToken}`;
        try {
          const res = await fetch(url);
          const json = await res.json();
          if (json.error) {
            return { items: [], error: json.error.message || "erro" };
          }
          return { items: parseBreakdown(json), error: null };
        } catch (err) {
          return { items: [], error: err?.message || "falha" };
        }
      };

      try {
        const audience: Record<string, any> = {
          timeframe: tf,
          followers: {},
          engaged: {},
          reached: {},
          errors: [],
        };

        const jobs: Array<{ bucket: string; key: string; metric: string; breakdown: string }> = [
          { bucket: "followers", key: "age", metric: "follower_demographics", breakdown: "age" },
          { bucket: "followers", key: "gender", metric: "follower_demographics", breakdown: "gender" },
          { bucket: "followers", key: "city", metric: "follower_demographics", breakdown: "city" },
          { bucket: "followers", key: "country", metric: "follower_demographics", breakdown: "country" },
          { bucket: "engaged", key: "age", metric: "engaged_audience_demographics", breakdown: "age" },
          { bucket: "engaged", key: "gender", metric: "engaged_audience_demographics", breakdown: "gender" },
          { bucket: "engaged", key: "city", metric: "engaged_audience_demographics", breakdown: "city" },
          { bucket: "reached", key: "age", metric: "reached_audience_demographics", breakdown: "age" },
          { bucket: "reached", key: "gender", metric: "reached_audience_demographics", breakdown: "gender" },
          { bucket: "reached", key: "city", metric: "reached_audience_demographics", breakdown: "city" },
        ];

        // Sequencial para evitar rate limit; demografia não muda a cada segundo.
        for (const job of jobs) {
          const result = await fetchDemo(job.metric, job.breakdown);
          audience[job.bucket][job.key] = result.items.slice(0, job.key === "city" || job.key === "country" ? 8 : 12);
          if (result.error) {
            audience.errors.push(`${job.metric}/${job.breakdown}: ${result.error}`);
          }
        }

        const hasAny = ["followers", "engaged", "reached"].some((bucket) =>
          Object.values(audience[bucket] || {}).some((list: any) => Array.isArray(list) && list.length > 0)
        );

        return new Response(
          JSON.stringify({
            audience: hasAny ? audience : null,
            error: hasAny
              ? null
              : {
                  message:
                    audience.errors[0] ||
                    "Demografia indisponível (precisa de conta profissional com 100+ seguidores e permissão de insights).",
                },
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({
            audience: null,
            error: { message: err?.message || "Erro ao buscar demografia do Instagram" },
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Detalhe de mídia Instagram: vídeo/carrossel + comentários + legenda
    if (action === "get-instagram-media-detail") {
      const { media_id } = body;
      if (!media_id) {
        return new Response(
          JSON.stringify({ error: { message: "media_id is required" }, media: null, comments: [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      try {
        const fields = [
          "id",
          "media_type",
          "media_product_type",
          "media_url",
          "thumbnail_url",
          "caption",
          "permalink",
          "timestamp",
          "like_count",
          "comments_count",
          "username",
          "children{id,media_type,media_url,thumbnail_url}",
        ].join(",");
        const mediaUrl =
          `https://graph.facebook.com/v24.0/${media_id}` +
          `?fields=${encodeURIComponent(fields)}&access_token=${metaToken}`;
        const mediaRes = await fetch(mediaUrl);
        const mediaJson = await mediaRes.json();
        if (mediaJson.error) {
          return new Response(
            JSON.stringify({ error: mediaJson.error, media: null, comments: [] }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const children = (mediaJson.children?.data || []).map((child: any) => ({
          id: child.id,
          media_type: child.media_type,
          media_url: child.media_url || null,
          thumbnail_url: child.thumbnail_url || null,
        }));

        let comments: any[] = [];
        let commentsError: string | null = null;
        try {
          const commentsUrl =
            `https://graph.facebook.com/v24.0/${media_id}/comments` +
            `?fields=${encodeURIComponent("id,text,username,timestamp,like_count,replies{id,text,username,timestamp}")}` +
            `&limit=50&access_token=${metaToken}`;
          const commentsRes = await fetch(commentsUrl);
          const commentsJson = await commentsRes.json();
          if (commentsJson.error) {
            commentsError = commentsJson.error.message || "Comentários indisponíveis";
          } else {
            comments = (commentsJson.data || []).map((row: any) => ({
              id: row.id,
              text: row.text || "",
              username: row.username || null,
              timestamp: row.timestamp || null,
              like_count: row.like_count != null ? Number(row.like_count) : 0,
              replies: (row.replies?.data || []).map((reply: any) => ({
                id: reply.id,
                text: reply.text || "",
                username: reply.username || null,
                timestamp: reply.timestamp || null,
              })),
            }));
          }
        } catch (err) {
          commentsError = err?.message || "Falha ao buscar comentários";
        }

        return new Response(
          JSON.stringify({
            media: {
              id: mediaJson.id,
              media_type: mediaJson.media_type,
              media_product_type: mediaJson.media_product_type,
              media_url: mediaJson.media_url || null,
              thumbnail_url: mediaJson.thumbnail_url || null,
              caption: mediaJson.caption || "",
              permalink: mediaJson.permalink || null,
              timestamp: mediaJson.timestamp || null,
              like_count: mediaJson.like_count != null ? Number(mediaJson.like_count) : null,
              comments_count: mediaJson.comments_count != null ? Number(mediaJson.comments_count) : null,
              username: mediaJson.username || null,
              children,
            },
            comments,
            comments_error: commentsError,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({
            error: { message: err?.message || "Erro ao buscar detalhe da mídia" },
            media: null,
            comments: [],
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Insights de uma mídia Instagram (alcance por post)
    if (action === "get-instagram-media-insights") {
      const { media_id, media_type } = body;
      if (!media_id) {
        return new Response(
          JSON.stringify({ error: { message: "media_id is required" }, insights: [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      try {
        const type = String(media_type || "").toUpperCase();
        const isReel = type === "REELS" || type === "VIDEO" || type.includes("REEL");
        const isCarousel = type === "CAROUSEL_ALBUM" || type.includes("CAROUSEL");
        const baseMetrics = [
          "reach",
          "total_interactions",
          "likes",
          "comments",
          "saved",
          "shares",
          "views",
        ];
        // Demografia (idade/gênero) NÃO existe por mídia na Graph — só na conta.
        // Reels: tempos de watch. Feed/carrossel: follows + visitas ao perfil.
        let metricList = [...baseMetrics];
        if (isReel) {
          metricList = [
            ...baseMetrics,
            "ig_reels_avg_watch_time",
            "ig_reels_video_view_total_time",
          ];
        } else if (!type || type === "IMAGE" || type === "PHOTO" || isCarousel) {
          metricList = [...baseMetrics, "follows", "profile_visits", "profile_activity"];
        }

        const normalizeRows = (rows: any[]) =>
          (rows || []).map((row: any) => ({
            ...row,
            value: Array.isArray(row.values) && row.values.length
              ? Number(row.values[0]?.value) || 0
              : Number(row.value) || 0,
          }));

        const fetchMetrics = async (metrics: string[]) => {
          const url =
            `https://graph.facebook.com/v24.0/${media_id}/insights` +
            `?metric=${encodeURIComponent(metrics.join(","))}` +
            `&access_token=${metaToken}`;
          const response = await fetch(url);
          return response.json();
        };

        let data = await fetchMetrics(metricList);
        if (data.error && metricList.length > baseMetrics.length) {
          data = await fetchMetrics(baseMetrics);
        }
        if (data.error) {
          return new Response(
            JSON.stringify({ error: data.error, insights: [] }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({ insights: normalizeRows(data.data || []) }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: { message: err?.message || "Erro ao buscar insights da mídia" }, insights: [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Get Instagram Media
    if (action === "get-instagram-media") {
      const { instagram_account_id, time_range } = body;

      if (!instagram_account_id) {
        return new Response(
          JSON.stringify({ error: { message: "instagram_account_id is required" } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const validTimeRange = time_range && time_range.since && time_range.until 
          ? time_range 
          : { since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], until: new Date().toISOString().split('T')[0] };
        
        // Não embutir insights inválidos (ex.: engagement) — isso quebra a lista inteira.
        // since/until na Graph às vezes falha; buscamos recentes e filtramos por timestamp.
        const mediaUrl = `https://graph.facebook.com/v24.0/${instagram_account_id}/media?fields=id,media_type,media_product_type,media_url,thumbnail_url,caption,permalink,timestamp,like_count,comments_count&limit=100&access_token=${metaToken}`;
        const mediaResponse = await fetch(mediaUrl);
        const mediaData = await mediaResponse.json();

        if (mediaData.error) {
          return new Response(
            JSON.stringify({ error: mediaData.error, media: [] }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const sinceMs = Date.parse(`${validTimeRange.since}T00:00:00.000Z`);
        const untilMs = Date.parse(`${validTimeRange.until}T23:59:59.999Z`);

        const processedMedia = (mediaData.data || [])
          .filter((item: any) => {
            if (!Number.isFinite(sinceMs) || !Number.isFinite(untilMs)) return true;
            const ts = Date.parse(String(item.timestamp || ""));
            if (!Number.isFinite(ts)) return true;
            return ts >= sinceMs && ts <= untilMs;
          })
          .map((item: any) => {
          const product = String(item.media_product_type || "").toUpperCase();
          return {
            ...item,
            platform: "instagram",
            media_type: product === "REELS" ? "REELS" : item.media_type,
            insights: {},
          };
        });

        return new Response(
          JSON.stringify({ media: processedMedia }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: { message: err?.message || "Erro ao buscar mídia do Instagram" }, media: [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Perfil da página Facebook (bio, seguidores, foto)
    if (action === "get-page-profile") {
      const { page_id } = body;
      if (!page_id) {
        return new Response(
          JSON.stringify({ error: { message: "page_id is required" }, profile: null }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      try {
        const url = `https://graph.facebook.com/v24.0/${page_id}?fields=id,name,about,fan_count,followers_count,link,picture.type(large){url},cover&access_token=${metaToken}`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.error) {
          return new Response(
            JSON.stringify({ error: data.error, profile: null }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({
            profile: {
              id: data.id,
              name: data.name,
              about: data.about || "",
              fan_count: data.fan_count ?? null,
              followers_count: data.followers_count ?? data.fan_count ?? null,
              link: data.link || "",
              profile_picture_url: data.picture?.data?.url || null,
              cover_url: data.cover?.source || null,
              platform: "facebook_page",
            },
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: { message: err?.message || "Erro ao buscar perfil da página" }, profile: null }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Perfil Instagram Business (bio, site, seguidores + stories ativos 24h)
    if (action === "get-instagram-profile") {
      const { instagram_account_id } = body;
      if (!instagram_account_id) {
        return new Response(
          JSON.stringify({ error: { message: "instagram_account_id is required" }, profile: null }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      try {
        const url =
          `https://graph.facebook.com/v24.0/${instagram_account_id}` +
          `?fields=id,username,name,biography,website,followers_count,follows_count,media_count,profile_picture_url` +
          `&access_token=${metaToken}`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.error) {
          return new Response(
            JSON.stringify({ error: data.error, profile: null }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Destaques (highlights) NÃO existem na Graph oficial.
        // Stories ativos (últimas 24h) sim — útil como prévia, sem confundir com destaques.
        let stories: any[] = [];
        try {
          const storiesUrl =
            `https://graph.facebook.com/v24.0/${instagram_account_id}/stories` +
            `?fields=id,media_type,media_url,thumbnail_url,permalink,timestamp` +
            `&limit=20&access_token=${metaToken}`;
          const storiesRes = await fetch(storiesUrl);
          const storiesJson = await storiesRes.json();
          if (!storiesJson.error) {
            stories = (storiesJson.data || []).map((row: any) => ({
              id: row.id,
              media_type: row.media_type || null,
              media_url: row.media_url || null,
              thumbnail_url: row.thumbnail_url || row.media_url || null,
              permalink: row.permalink || null,
              timestamp: row.timestamp || null,
            }));
          }
        } catch {
          stories = [];
        }

        return new Response(
          JSON.stringify({
            profile: {
              id: data.id,
              username: data.username,
              name: data.name || data.username,
              biography: data.biography || "",
              website: data.website || "",
              followers_count: data.followers_count ?? null,
              follows_count: data.follows_count ?? null,
              media_count: data.media_count ?? null,
              profile_picture_url: data.profile_picture_url || null,
              stories,
              platform: "instagram",
            },
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: { message: err?.message || "Erro ao buscar perfil do Instagram" }, profile: null }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Publish Page Post
    if (action === "publish-page-post") {
      const { page_id, message, link, scheduled_publish_time, published } = body;

      if (!page_id) {
        return new Response(
          JSON.stringify({ error: { message: "page_id is required" } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const pageUrl = `https://graph.facebook.com/v24.0/${page_id}?fields=access_token&access_token=${metaToken}`;
        const pageResponse = await fetch(pageUrl);
        const pageData = await pageResponse.json();

        if (pageData.error || !pageData.access_token) {
          return new Response(
            JSON.stringify({ error: { message: "Não foi possível obter o token de acesso da página" } }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const pageAccessToken = pageData.access_token;
        const scheduleUnix = scheduled_publish_time
          ? Number(scheduled_publish_time)
          : null;
        const fileUrl = String(body.file_url || body.video_url || "").trim();
        if (fileUrl) {
          const videoBody = new URLSearchParams();
          videoBody.set("file_url", fileUrl);
          if (message) videoBody.set("description", String(message));
          if (scheduleUnix && Number.isFinite(scheduleUnix)) {
            videoBody.set("published", "false");
            videoBody.set("scheduled_publish_time", String(Math.floor(scheduleUnix)));
          } else if (published === false) {
            videoBody.set("published", "false");
          }
          videoBody.set("access_token", pageAccessToken);
          const videoResponse = await fetch(
            `https://graph-video.facebook.com/v24.0/${page_id}/videos`,
            { method: "POST", body: videoBody }
          );
          const videoData = await videoResponse.json();
          if (videoData.error) {
            return new Response(
              JSON.stringify({ error: videoData.error, post_id: null }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          return new Response(
            JSON.stringify({
              post_id: videoData.id || videoData.post_id || null,
              scheduled: Boolean(scheduleUnix && Number.isFinite(scheduleUnix)),
              success: true,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const postBody = new URLSearchParams();
        if (message) postBody.set("message", String(message));
        if (link) postBody.set("link", String(link));
        if (scheduleUnix && Number.isFinite(scheduleUnix)) {
          postBody.set("published", "false");
          postBody.set("scheduled_publish_time", String(Math.floor(scheduleUnix)));
        } else if (published === false) {
          postBody.set("published", "false");
        }
        postBody.set("access_token", pageAccessToken);

        const publishResponse = await fetch(
          `https://graph.facebook.com/v24.0/${page_id}/feed`,
          { method: "POST", body: postBody }
        );
        const publishData = await publishResponse.json();

        if (publishData.error) {
          return new Response(
            JSON.stringify({ error: publishData.error, post_id: null }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        let permalink: string | null = null;
        try {
          const permalinkRes = await fetch(
            `https://graph.facebook.com/v24.0/${publishData.id}?fields=permalink_url&access_token=${pageAccessToken}`
          );
          const permalinkJson = await permalinkRes.json();
          if (!permalinkJson.error && permalinkJson.permalink_url) {
            permalink = String(permalinkJson.permalink_url);
          }
        } catch {
          // permalink opcional
        }

        return new Response(
          JSON.stringify({
            post_id: publishData.id,
            permalink,
            scheduled: Boolean(scheduleUnix),
            success: true,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: { message: err?.message || "Erro ao publicar post na página" }, post_id: null }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Publish Instagram Content (IMAGE | REELS | CAROUSEL)
    if (action === "publish-instagram-content") {
      const {
        instagram_account_id,
        image_url,
        video_url,
        cover_url,
        thumb_offset,
        caption,
        media_type,
        children,
      } = body;

      if (!instagram_account_id) {
        return new Response(
          JSON.stringify({ error: { message: "instagram_account_id is required" } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const kind = String(media_type || (video_url ? "REELS" : "IMAGE")).toUpperCase();
      const waitIgContainer = async (creationId: string, label: string, attempts = 16) => {
        let status = "IN_PROGRESS";
        for (let attempt = 0; attempt < attempts; attempt += 1) {
          const statusRes = await fetch(
            `https://graph.facebook.com/v24.0/${creationId}?fields=status_code&access_token=${metaToken}`
          );
          const statusJson = await statusRes.json();
          status = String(statusJson.status_code || statusJson.status || "");
          if (status === "FINISHED" || status === "ERROR" || status === "EXPIRED") break;
          await new Promise((resolve) => setTimeout(resolve, 2500));
        }
        if (status !== "FINISHED") {
          return {
            error: {
              message: `Container ${label} não ficou pronto (status: ${status || "desconhecido"}). Tente de novo em instantes.`,
              code: "IG_CONTAINER_NOT_READY",
            },
          };
        }
        return null;
      };

      if (kind === "CAROUSEL" || kind === "CAROUSEL_ALBUM") {
        const items = Array.isArray(children) ? children : [];
        if (items.length < 2 || items.length > 10) {
          return new Response(
            JSON.stringify({
              error: { message: "Carrossel precisa de 2 a 10 mídias (imagem ou vídeo)" },
              media_id: null,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        try {
          const childIds: string[] = [];
          for (let i = 0; i < items.length; i += 1) {
            const item = items[i] || {};
            const itemImage = String(item.image_url || item.imageUrl || "").trim();
            const itemVideo = String(item.video_url || item.videoUrl || "").trim();
            if (!itemImage && !itemVideo) {
              return new Response(
                JSON.stringify({
                  error: { message: `Slide ${i + 1} sem URL de imagem ou vídeo` },
                  media_id: null,
                }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
            const childParams = new URLSearchParams();
            childParams.set("is_carousel_item", "true");
            childParams.set("access_token", metaToken);
            if (itemVideo) {
              childParams.set("media_type", "VIDEO");
              childParams.set("video_url", itemVideo);
            } else {
              childParams.set("image_url", itemImage);
            }
            const childRes = await fetch(
              `https://graph.facebook.com/v24.0/${instagram_account_id}/media`,
              { method: "POST", body: childParams }
            );
            const childData = await childRes.json();
            if (childData.error || !childData.id) {
              return new Response(
                JSON.stringify({ error: childData.error || { message: `Falha no slide ${i + 1}` }, media_id: null }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
            const waitErr = await waitIgContainer(String(childData.id), `do slide ${i + 1}`);
            if (waitErr) {
              return new Response(
                JSON.stringify({ ...waitErr, media_id: null, creation_id: childData.id }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
            childIds.push(String(childData.id));
          }

          const carouselParams = new URLSearchParams();
          carouselParams.set("media_type", "CAROUSEL");
          carouselParams.set("children", childIds.join(","));
          carouselParams.set("caption", String(caption || ""));
          carouselParams.set("access_token", metaToken);

          const carouselRes = await fetch(
            `https://graph.facebook.com/v24.0/${instagram_account_id}/media`,
            { method: "POST", body: carouselParams }
          );
          const carouselData = await carouselRes.json();
          if (carouselData.error || !carouselData.id) {
            return new Response(
              JSON.stringify({ error: carouselData.error || { message: "Falha ao criar carrossel" }, media_id: null }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          const creationId = String(carouselData.id);
          const waitCarousel = await waitIgContainer(creationId, "do carrossel");
          if (waitCarousel) {
            return new Response(
              JSON.stringify({ ...waitCarousel, media_id: null, creation_id: creationId }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          const publishResponse = await fetch(
            `https://graph.facebook.com/v24.0/${instagram_account_id}/media_publish`,
            {
              method: "POST",
              body: new URLSearchParams({
                creation_id: creationId,
                access_token: metaToken,
              }),
            }
          );
          const publishData = await publishResponse.json();
          if (publishData.error) {
            return new Response(
              JSON.stringify({ error: publishData.error, media_id: null }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          let permalink: string | null = null;
          try {
            const permalinkRes = await fetch(
              `https://graph.facebook.com/v24.0/${publishData.id}?fields=permalink&access_token=${metaToken}`
            );
            const permalinkJson = await permalinkRes.json();
            if (!permalinkJson.error && permalinkJson.permalink) {
              permalink = String(permalinkJson.permalink);
            }
          } catch {
            // opcional
          }

          return new Response(
            JSON.stringify({
              media_id: publishData.id,
              permalink,
              scheduled: false,
              success: true,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } catch (err) {
          return new Response(
            JSON.stringify({
              error: { message: err?.message || "Erro ao publicar carrossel no Instagram" },
              media_id: null,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      if (kind === "REELS" || kind === "VIDEO") {
        if (!video_url) {
          return new Response(
            JSON.stringify({ error: { message: "video_url is required for Reels/video" }, media_id: null }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else if (!image_url) {
        return new Response(
          JSON.stringify({ error: { message: "image_url is required" }, media_id: null }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const containerParams = new URLSearchParams();
        containerParams.set("caption", String(caption || ""));
        containerParams.set("access_token", metaToken);
        if (kind === "REELS" || kind === "VIDEO") {
          containerParams.set("media_type", "REELS");
          containerParams.set("video_url", String(video_url));
          containerParams.set("share_to_feed", "true");
          // Capa: imagem pública (cover_url) ou frame do vídeo em ms (thumb_offset)
          if (cover_url && String(cover_url).trim()) {
            containerParams.set("cover_url", String(cover_url).trim());
          } else if (thumb_offset != null && String(thumb_offset).trim() !== "") {
            const offsetMs = Number(thumb_offset);
            if (Number.isFinite(offsetMs) && offsetMs >= 0) {
              containerParams.set("thumb_offset", String(Math.floor(offsetMs)));
            }
          }
        } else {
          containerParams.set("image_url", String(image_url));
        }
        // Instagram Graph recusa published=false / scheduled_publish_time (#3 whitelist).
        // Agendar neste recorte publica na hora.

        const containerResponse = await fetch(
          `https://graph.facebook.com/v24.0/${instagram_account_id}/media`,
          { method: "POST", body: containerParams }
        );
        const containerData = await containerResponse.json();

        if (containerData.error) {
          return new Response(
            JSON.stringify({ error: containerData.error, media_id: null }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const creationId = containerData.id;

        // Reels: aguarda o container ficar FINISHED antes de publicar.
        if (kind === "REELS" || kind === "VIDEO") {
          const waitErr = await waitIgContainer(String(creationId), "do Reels");
          if (waitErr) {
            return new Response(
              JSON.stringify({ ...waitErr, media_id: null, creation_id: creationId }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        const publishResponse = await fetch(
          `https://graph.facebook.com/v24.0/${instagram_account_id}/media_publish`,
          {
            method: "POST",
            body: new URLSearchParams({
              creation_id: String(creationId),
              access_token: metaToken,
            }),
          }
        );
        const publishData = await publishResponse.json();

        if (publishData.error) {
          return new Response(
            JSON.stringify({ error: publishData.error, media_id: null }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        let permalink: string | null = null;
        try {
          const permalinkRes = await fetch(
            `https://graph.facebook.com/v24.0/${publishData.id}?fields=permalink&access_token=${metaToken}`
          );
          const permalinkJson = await permalinkRes.json();
          if (!permalinkJson.error && permalinkJson.permalink) {
            permalink = String(permalinkJson.permalink);
          }
        } catch {
          // opcional
        }

        return new Response(
          JSON.stringify({
            media_id: publishData.id,
            permalink,
            scheduled: false,
            success: true,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: { message: err?.message || "Erro ao publicar conteúdo no Instagram" }, media_id: null }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    /** Lista contas WhatsApp Business visíveis para o token (Graph API). */
    if (action === "list-whatsapp-business-accounts") {
      try {
        const businessIdEnv = String(
          body.businessId ?? clientCtwaBusinessId ?? ""
        ).trim();
        const accounts = await listWabaAccountIds(
          metaToken,
          businessIdEnv || clientCtwaBusinessId
        );
        let businessIds: string[] = [];
        if (businessIdEnv) businessIds = [businessIdEnv];
        else if (clientCtwaBusinessId) businessIds = [clientCtwaBusinessId];
        for (const acc of accounts) {
          acc.phone_numbers = await fetchWabaPhoneNumbers(acc.id, metaToken);
        }

        return new Response(
          JSON.stringify({ accounts, business_ids: businessIds }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: { message: err?.message || "Erro ao listar WABA" }, accounts: [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    /** Dataset do WABA (Click to WhatsApp → Conversions API). */
    if (action === "get-waba-dataset") {
      const pageIdRaw = onlyDigits(String(body.pageId ?? ""));
      if (pageIdRaw) {
        try {
          const datasetId = await fetchDatasetIdForPage(pageIdRaw, metaToken);
          if (!datasetId) {
            return new Response(
              JSON.stringify({
                error: {
                  message: "Dataset da página não encontrado",
                  code: "META_PAGE_DATASET_ERROR",
                  hint: "Confira page_id e permissões no token do cliente (BM do cliente, não MADS).",
                },
              }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          return new Response(
            JSON.stringify({ dataset_id: datasetId, page_id: pageIdRaw }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } catch (err) {
          return new Response(
            JSON.stringify({ error: { message: err?.message || "Erro ao obter dataset da página" } }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      const wabaId = String(body.wabaId ?? "").trim();
      if (!wabaId) {
        return new Response(
          JSON.stringify({ error: { message: "Informe wabaId ou pageId", code: "MISSING_WABA_OR_PAGE" } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      try {
        const tokenQ = encodeURIComponent(metaToken);
        const wabaUrl = `https://graph.facebook.com/v24.0/${encodeURIComponent(wabaId)}?fields=id,name,dataset&access_token=${tokenQ}`;
        const wabaRes = await fetch(wabaUrl);
        const wabaData = await wabaRes.json();

        if (wabaData?.error) {
          const code = wabaData.error.code;
          const hint =
            code === 100 || String(wabaData.error.message || "").includes("does not exist")
              ? "O token do Tráfego Pago não enxerga esse WABA. Em Configurações do negócio → Usuários do sistema → Atribuir ativos → Contas do WhatsApp (controle total). Depois use «Listar contas» para pegar o ID correto da API."
              : "Verifique permissões whatsapp_business_management e whatsapp_business_manage_events no app Meta.";
          return new Response(
            JSON.stringify({
              error: {
                message: wabaData.error.message || "WABA inacessível para este token",
                code: wabaData.error.code || "META_WABA_ERROR",
                hint,
              },
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        let datasetId: string | null = wabaData?.dataset?.id ? String(wabaData.dataset.id) : null;

        const datasetEdgeUrl = `https://graph.facebook.com/v24.0/${encodeURIComponent(wabaId)}/dataset?access_token=${tokenQ}`;
        if (!datasetId) {
          const getRes = await fetch(datasetEdgeUrl);
          const getData = await getRes.json();
          if (getData?.id) datasetId = String(getData.id);
          else if (!getData?.error) {
            const postRes = await fetch(datasetEdgeUrl, { method: "POST" });
            const postData = await postRes.json();
            if (postData?.id) datasetId = String(postData.id);
            else if (postData?.error) {
              return new Response(
                JSON.stringify({
                  error: {
                    message: postData.error.message || "Erro ao criar dataset",
                    code: postData.error.code || "META_DATASET_ERROR",
                    hint: "Crie o dataset no Gerenciador de Eventos ou peça acesso WhatsApp ao System User.",
                  },
                }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
          } else {
            return new Response(
              JSON.stringify({
                error: {
                  message: getData.error.message || "Erro ao buscar dataset",
                  code: getData.error.code || "META_DATASET_ERROR",
                  hint: "Informe o Dataset ID manualmente (Gerenciador de Eventos → Conjuntos de dados).",
                },
                waba_name: wabaData?.name ?? null,
              }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        return new Response(
          JSON.stringify({
            dataset_id: datasetId,
            waba_id: wabaId,
            waba_name: wabaData?.name ?? null,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: { message: err?.message || "Erro ao obter dataset" } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    /** Envia Lead, QualifiedLead, InitiateCheckout, Purchase ou LeadSubmitted para CTWA. */
    if (action === "send-ctwa-conversion") {
      const clienteId = String(body.clienteId ?? "").trim();
      const ctwaClid = String(body.ctwaClid ?? "").trim();
      const eventName = String(body.eventName ?? "").trim();
      const contactId = body.contactId ?? null;
      const leadId = body.leadId ?? null;
      let whatsappConfigId = String(body.whatsappConfigId ?? "").trim() || null;
      const allowedEvents = ["Lead", "QualifiedLead", "InitiateCheckout", "Purchase", "LeadSubmitted"];
      if (!clienteId || !ctwaClid || !allowedEvents.includes(eventName)) {
        return new Response(
          JSON.stringify({
            error: { message: "clienteId, ctwaClid e eventName válidos são obrigatórios", code: "INVALID_PAYLOAD" },
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const norm = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

      if (!whatsappConfigId && contactId) {
        const { data: contactRow } = await supabase
          .from("cliente_whatsapp_contact")
          .select("whatsapp_config_id, instance_name")
          .eq("id", contactId)
          .eq("cliente_id", clienteId)
          .maybeSingle();
        if (contactRow?.whatsapp_config_id) {
          whatsappConfigId = String(contactRow.whatsapp_config_id);
        } else if (contactRow?.instance_name) {
          const { data: configs } = await supabase
            .from("cliente_whatsapp_config")
            .select("id, name")
            .eq("cliente_id", clienteId);
          const inst = norm(String(contactRow.instance_name));
          for (const c of configs || []) {
            const n = norm(String(c.name || ""));
            if (n && (n === inst || inst.includes(n) || n.includes(inst))) {
              whatsappConfigId = String(c.id);
              break;
            }
          }
        }
      }

      let channelConfig: {
        id: string;
        meta_waba_id: string | null;
        meta_page_id: string | null;
        meta_dataset_id: string | null;
        meta_conversions_enabled: boolean;
        name: string | null;
      } | null = null;

      if (whatsappConfigId) {
        const { data: ch } = await supabase
          .from("cliente_whatsapp_config")
          .select("id, meta_waba_id, meta_page_id, meta_dataset_id, meta_conversions_enabled, name")
          .eq("id", whatsappConfigId)
          .eq("cliente_id", clienteId)
          .maybeSingle();
        channelConfig = ch;
      }

      if (!channelConfig) {
        const { data: enabledList } = await supabase
          .from("cliente_whatsapp_config")
          .select("id, meta_waba_id, meta_page_id, meta_dataset_id, meta_conversions_enabled, name")
          .eq("cliente_id", clienteId)
          .eq("meta_conversions_enabled", true);
        if (enabledList?.length === 1) channelConfig = enabledList[0];
      }

      let wabaId = onlyDigits(String(channelConfig?.meta_waba_id ?? ""));
      let pageId = onlyDigits(String(body.pageId ?? channelConfig?.meta_page_id ?? ""));
      let datasetId = onlyDigits(String(channelConfig?.meta_dataset_id ?? ""));
      let conversionsEnabled = !!channelConfig?.meta_conversions_enabled;
      let usePageId = !!pageId;

      if (!wabaId || !datasetId || !conversionsEnabled || !pageId) {
        const { data: cliente } = await supabase
          .from("clientes")
          .select("meta_waba_id, meta_dataset_id, meta_conversions_enabled, meta_rastreamento")
          .eq("id", clienteId)
          .maybeSingle();
        if (!conversionsEnabled) conversionsEnabled = !!cliente?.meta_conversions_enabled;
        if (!wabaId && !usePageId) wabaId = onlyDigits(String(cliente?.meta_waba_id ?? ""));
        if (!datasetId) datasetId = onlyDigits(String(cliente?.meta_dataset_id ?? ""));
        const rastreamento =
          cliente?.meta_rastreamento && typeof cliente.meta_rastreamento === "object"
            ? (cliente.meta_rastreamento as Record<string, unknown>)
            : {};
        if (!pageId) pageId = onlyDigits(String(rastreamento.pageId ?? rastreamento.page_id ?? ""));
        if (!datasetId) {
          datasetId = onlyDigits(
            String(rastreamento.pixelId ?? rastreamento.datasetId ?? rastreamento.pixel_id ?? ""),
          );
        }
        usePageId = !!pageId;
      }

      if (!conversionsEnabled && (datasetId || pageId)) {
        conversionsEnabled = true;
      }

      if (!conversionsEnabled) {
        return new Response(
          JSON.stringify({ skipped: true, reason: "conversions_disabled" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (usePageId && !datasetId) {
        const fromPage = await fetchDatasetIdForPage(pageId, metaToken);
        if (fromPage) datasetId = fromPage;
      }

      if (!datasetId || (!usePageId && !wabaId)) {
        return new Response(
          JSON.stringify({
            skipped: true,
            reason: "missing_waba_or_dataset",
            error: {
              message: usePageId
                ? "Configure Page ID e Dataset (Buscar pela página) no canal."
                : "Configure WABA e Dataset no card do canal em Canais (Conversões Meta deste canal).",
            },
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      whatsappConfigId = whatsappConfigId || channelConfig?.id || null;

      const { data: clRowCtwa } = await supabase
        .from("clientes")
        .select("meta_ctwa_business_id")
        .eq("id", clienteId)
        .maybeSingle();
      const clientCtwaBusinessIdSend = clRowCtwa?.meta_ctwa_business_id
        ? String(clRowCtwa.meta_ctwa_business_id).trim()
        : null;

      const businessPhone = usePageId
        ? null
        : await resolveBusinessPhoneForContact(
        supabase,
        clienteId,
        contactId ? String(contactId) : null,
        ctwaClid,
        String(body.businessPhone ?? "").trim() || null
          );
      let wabaAutoCorrected = false;
      let identityMode: "page_id" | "waba_id" = usePageId ? "page_id" : "waba_id";
      if (businessPhone) {
        const configuredPhones = await fetchWabaPhoneNumbers(wabaId, metaToken);
        const wabaHasPhone = configuredPhones.some((p) =>
          phonesMatch(p.display_phone_number, businessPhone)
        );
        if (!wabaHasPhone) {
          const resolvedWaba = await resolveWabaIdForBusinessPhone(
            metaToken,
            clientCtwaBusinessIdSend,
            businessPhone
          );
          if (resolvedWaba && resolvedWaba !== wabaId) {
            const resolvedDataset = await fetchDatasetIdForWaba(resolvedWaba, metaToken);
            if (resolvedDataset) {
              wabaId = resolvedWaba;
              datasetId = resolvedDataset;
              wabaAutoCorrected = true;
            }
          } else if (!resolvedWaba) {
            const phoneLabels = configuredPhones.map((p) => p.display_phone_number).join(", ");
            return new Response(
              JSON.stringify({
                error: {
                  message:
                    `A WABA ${wabaId} não inclui o telefone da loja ${businessPhone}. Números nesta WABA: ${phoneLabels || "nenhum"}.`,
                  code: "WABA_PHONE_MISMATCH",
                  hint:
                    "Listar contas → escolha a WABA com o número do anúncio CTWA (ex. 3253-5236) → Buscar dataset → Salvar.",
                },
                business_phone: businessPhone,
                waba_id_configured: onlyDigits(String(channelConfig?.meta_waba_id ?? wabaId)),
              }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      }

      const nowSec = Math.floor(Date.now() / 1000);
      const sevenDays = 7 * 24 * 3600;
      const requestedTime = Number(body.eventTime ?? body.event_time);
      const eventTime = Number.isFinite(requestedTime) && requestedTime > 0
        ? Math.min(nowSec, Math.max(nowSec - sevenDays, Math.floor(requestedTime)))
        : nowSec;

      const successQuery = supabase
        .from("meta_conversion_event_log")
        .select("id")
        .eq("cliente_id", clienteId)
        .eq("event_name", eventName)
        .eq("ctwa_clid", ctwaClid)
        .eq("success", true)
        .limit(1);
      const { data: recent } = eventName === "LeadSubmitted"
        ? await successQuery
        : await successQuery.gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());

      if (recent?.length) {
        return new Response(
          JSON.stringify({ skipped: true, reason: "duplicate_event", success: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const eventId = `planeje_${eventName}_${ctwaClid.slice(0, 32)}_${eventTime}`;
      const valueNum = Number(body.value);

      let phoneHash: string | null = null;
      let adId: string | null = onlyDigits(String(body.adId ?? body.ad_id ?? ""));
      let contactPhone = phoneDigits(String(body.phone ?? ""));
      if (contactId) {
        const { data: contactForHash } = await supabase
          .from("cliente_whatsapp_contact")
          .select("phone, tracking_data")
          .eq("id", contactId)
          .eq("cliente_id", clienteId)
          .maybeSingle();
        if (contactForHash?.phone) contactPhone = phoneDigits(String(contactForHash.phone));
        const td = (contactForHash?.tracking_data || {}) as Record<string, unknown>;
        if (!adId) {
          adId = onlyDigits(String(td.source_id ?? td.ad_id ?? td.sourceID ?? ""));
        }
      }
      if (contactPhone.length >= 10) {
        phoneHash = await sha256Hex(contactPhone.startsWith("55") ? contactPhone : `55${contactPhone}`);
      }

      const postEvent = (wabaForSend: string, pageForSend: string) => {
        const customData: Record<string, unknown> = {};
        if (adId) customData.ad_id = adId;
        if (eventName === "Purchase" && Number.isFinite(valueNum) && valueNum > 0) {
          customData.currency = "BRL";
          customData.value = valueNum;
        }
        const eventPayload: Record<string, unknown> = {
          event_name: eventName,
          event_time: eventTime,
          event_id: eventId,
          action_source: "business_messaging",
          messaging_channel: "whatsapp",
          user_data: buildCtwaUserData(ctwaClid, wabaForSend, pageForSend, phoneHash),
        };
        if (Object.keys(customData).length) eventPayload.custom_data = customData;
        const postBody: Record<string, unknown> = { data: [eventPayload] };
        const testCode = Deno.env.get("META_CTWA_TEST_EVENT_CODE")?.trim();
        if (testCode) postBody.test_event_code = testCode;
        return postBody;
      };

      let success = false;
      let metaResponse: Record<string, unknown> | null = null;
      let errorMessage: string | null = null;

      const sendPayload = async (wabaForSend: string, pageForSend: string) => {
        const eventsUrl =
          `https://graph.facebook.com/v24.0/${encodeURIComponent(datasetId)}/events?access_token=${encodeURIComponent(metaToken)}`;
        const res = await fetch(eventsUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(postEvent(wabaForSend, pageForSend)),
        });
        return res.json();
      };

      try {
        metaResponse = await sendPayload(usePageId ? "" : wabaId, usePageId ? pageId : "");
        if (metaResponse?.error) {
          const errObj = metaResponse.error as Record<string, unknown>;
          const parts: string[] = [];
          if (errObj.message) parts.push(String(errObj.message));
          if (errObj.error_user_msg) parts.push(String(errObj.error_user_msg));
          errorMessage = parts.join(" — ") || JSON.stringify(metaResponse.error);
          const fallbackPageId = onlyDigits(String(channelConfig?.meta_page_id ?? ""));
          if (errObj.error_subcode === 2804117 && !usePageId && wabaId && fallbackPageId) {
            const dsFromPage = await fetchDatasetIdForPage(fallbackPageId, metaToken);
            if (dsFromPage) datasetId = dsFromPage;
            metaResponse = await sendPayload("", fallbackPageId);
            if (!metaResponse?.error) {
              success = true;
              identityMode = "page_id";
              pageId = fallbackPageId;
              errorMessage = null;
            } else {
              const err2 = metaResponse.error as Record<string, unknown>;
              errorMessage = [err2.message, err2.error_user_msg].filter(Boolean).join(" — ");
            }
          }
        } else {
          success = true;
        }
      } catch (err) {
        errorMessage = err?.message || "Erro de rede ao chamar Meta";
      }

      await supabase.from("meta_conversion_event_log").insert({
        cliente_id: clienteId,
        whatsapp_config_id: whatsappConfigId,
        contact_id: contactId,
        lead_id: leadId,
        event_name: eventName,
        ctwa_clid: ctwaClid,
        success,
        meta_response: metaResponse,
        error_message: errorMessage,
      });

      if (!success) {
        const errObj = (metaResponse?.error || {}) as Record<string, unknown>;
        const subcode = errObj.error_subcode;
        let hint: string | undefined;
        if (subcode === 2804117) {
          hint =
            "ctwa_clid não combina com WABA/page_id. Configure Page ID da Página do anúncio ou WABA do número correto.";
        } else if (/invalid parameter/i.test(String(errorMessage || ""))) {
          hint =
            "Confira WABA + Dataset do canal que recebeu o CTWA; ctwaClid deve vir de clique novo nesse mesmo número.";
        }
        return new Response(
          JSON.stringify({
            error: {
              message: errorMessage || "Meta rejeitou o evento",
              code: "META_EVENT_FAILED",
              subcode: subcode ?? null,
              hint,
              channel_name: channelConfig?.name ?? null,
              waba_id_used: identityMode === "page_id" ? null : wabaId,
              page_id_used: identityMode === "page_id" ? pageId : null,
              identity_mode: identityMode,
              waba_auto_corrected: wabaAutoCorrected,
              business_phone: businessPhone ?? null,
            },
            meta_response: metaResponse,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          events_received: metaResponse?.events_received ?? 1,
          event_name: eventName,
          waba_id_used: identityMode === "page_id" ? null : wabaId,
          page_id_used: identityMode === "page_id" ? pageId : null,
          identity_mode: identityMode,
          waba_auto_corrected: wabaAutoCorrected,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizeActId = (raw: string) => {
      const id = String(raw || "").trim().replace(/^act_/, "");
      return id ? `act_${id}` : "";
    };

    const fetchGraphPages = async (firstUrl: string): Promise<any[]> => {
      const items: any[] = [];
      let url: string | null = firstUrl;
      let guard = 0;
      while (url && guard < 20) {
        guard += 1;
        const res = await fetch(url);
        const data = await res.json();
        if (data?.error) {
          throw new Error(data.error.message || "Erro na API Meta");
        }
        if (Array.isArray(data?.data)) items.push(...data.data);
        url = data?.paging?.next || null;
      }
      return items;
    };

    if (action === "get-ad-pixels") {
      const adAccountId = normalizeActId(String(body.adAccountId ?? ""));
      if (!adAccountId) {
        return new Response(
          JSON.stringify({ error: { message: "adAccountId é obrigatório", code: "MISSING_ACCOUNT" } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      try {
        const fields = "id,name,last_fired_time,code";
        const url = `https://graph.facebook.com/v24.0/${encodeURIComponent(adAccountId)}/adspixels?fields=${encodeURIComponent(fields)}&limit=100&access_token=${encodeURIComponent(metaToken)}`;
        const rows = await fetchGraphPages(url);
        const pixels = rows.map((p: any) => ({
          id: p.id,
          name: p.name || p.id,
          lastFiredAt: p.last_fired_time || null,
          code: p.code || null,
        }));
        return new Response(
          JSON.stringify({ success: true, pixels }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err: any) {
        return new Response(
          JSON.stringify({
            error: {
              message: err?.message || "Não foi possível listar pixels. Verifique permissões no Business Manager.",
              code: "PIXELS_FETCH_FAILED",
            },
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (action === "get-custom-audiences") {
      const adAccountId = normalizeActId(String(body.adAccountId ?? ""));
      const pixelId = String(body.pixelId ?? "").trim();
      if (!adAccountId) {
        return new Response(
          JSON.stringify({ error: { message: "adAccountId é obrigatório", code: "MISSING_ACCOUNT" } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      try {
        const fields =
          "id,name,subtype,approximate_count_lower_bound,delivery_status,time_updated,rule";
        const url = `https://graph.facebook.com/v24.0/${encodeURIComponent(adAccountId)}/customaudiences?fields=${encodeURIComponent(fields)}&limit=500&access_token=${encodeURIComponent(metaToken)}`;
        let rows = await fetchGraphPages(url);
        if (pixelId) {
          rows = rows.filter((a: any) => {
            const rule = a.rule != null ? String(a.rule) : "";
            return rule.includes(pixelId);
          });
        }
        const audiences = rows.map((a: any) => ({
          id: a.id,
          name: a.name || a.id,
          subtype: a.subtype || null,
          approximateCount: a.approximate_count_lower_bound ?? null,
          deliveryStatus: a.delivery_status || null,
          timeUpdated: a.time_updated || null,
        }));
        return new Response(
          JSON.stringify({ success: true, audiences }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err: any) {
        return new Response(
          JSON.stringify({
            error: {
              message: err?.message || "Não foi possível listar públicos personalizados.",
              code: "AUDIENCES_FETCH_FAILED",
            },
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (action === "get-pixel-events-summary") {
      const pixelId = String(body.pixelId ?? body.datasetId ?? "").trim();
      const clienteId = String(body.clienteId ?? "").trim();
      if (!pixelId) {
        return new Response(
          JSON.stringify({ error: { message: "pixelId ou datasetId é obrigatório", code: "MISSING_PIXEL" } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      try {
        const pixelUrl = `https://graph.facebook.com/v24.0/${encodeURIComponent(pixelId)}?fields=id,name,last_fired_time&access_token=${encodeURIComponent(metaToken)}`;
        const pixelRes = await fetch(pixelUrl);
        const pixelData = await pixelRes.json();
        if (pixelData?.error) {
          throw new Error(pixelData.error.message || "Pixel não encontrado ou sem permissão");
        }

        const apiEvents: { key: string; label: string; status: string; lastFiredAt: string | null; source: string }[] = [];
        if (pixelData.last_fired_time) {
          apiEvents.push({
            key: "PageView",
            label: "PageView",
            status: "active",
            lastFiredAt: pixelData.last_fired_time,
            source: "meta",
          });
        }

        const logEvents: { event_name: string; lastFiredAt: string; success: boolean }[] = [];
        if (clienteId) {
          const { data: logs, error: logErr } = await supabase
            .from("meta_conversion_event_log")
            .select("event_name, success, created_at")
            .eq("cliente_id", clienteId)
            .order("created_at", { ascending: false })
            .limit(200);
          if (!logErr && logs?.length) {
            const seen = new Set<string>();
            for (const row of logs) {
              const name = row.event_name;
              if (!name || seen.has(name)) continue;
              seen.add(name);
              logEvents.push({
                event_name: name,
                lastFiredAt: row.created_at,
                success: !!row.success,
              });
            }
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            pixel: {
              id: pixelData.id || pixelId,
              name: pixelData.name || pixelId,
              lastFiredAt: pixelData.last_fired_time || null,
            },
            apiEvents,
            logEvents,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err: any) {
        return new Response(
          JSON.stringify({
            error: {
              message: err?.message || "Não foi possível carregar resumo de eventos do pixel.",
              code: "PIXEL_EVENTS_FAILED",
            },
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Unknown action
    return new Response(
      JSON.stringify({
        error: { message: `Unknown action: ${action}` },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: {
          message: error.message || "Internal server error",
        },
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

