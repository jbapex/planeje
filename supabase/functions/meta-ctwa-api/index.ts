/**
 * Edge Function só para Conversões CTWA (token do BM do cliente).
 * Deploy manual: Supabase → Edge Functions → Create → nome meta-ctwa-api → colar este arquivo como index.ts
 *
 * Se usar esta função em vez de meta-ads-api para CTWA, o frontend deve invocar "meta-ctwa-api"
 * (ver src/lib/metaCtwaClientToken.js → invokeMetaAdsForCliente).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function ctwaSecretName(clienteId: string) {
  return `META_CTWA_CLIENT_${clienteId.replace(/-/g, "_")}`;
}

function onlyDigits(id: string): string {
  return String(id || "").replace(/\D/g, "");
}

function formatMetaGraphError(err: Record<string, unknown> | null | undefined): string {
  if (!err || typeof err !== "object") return "Erro desconhecido na Meta";
  const parts: string[] = [];
  if (err.message) parts.push(String(err.message));
  if (err.error_user_msg) parts.push(String(err.error_user_msg));
  if (err.error_subcode != null) parts.push(`subcode ${err.error_subcode}`);
  if (err.error_data) parts.push(JSON.stringify(err.error_data));
  return parts.join(" — ") || "Erro Meta";
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

async function fetchWabaPhoneNumbers(
  wabaId: string,
  token: string
): Promise<WabaPhoneRow[]> {
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

/** Dataset da Página Facebook (alternativa documentada à WABA para CTWA). */
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
  pageId: string
): Record<string, string> {
  const userData: Record<string, string> = { ctwa_clid: ctwaClid };
  if (pageId) {
    userData.page_id = pageId;
  } else if (wabaId) {
    userData.whatsapp_business_account_id = wabaId;
  }
  return userData;
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

    let action: string;
    let body: Record<string, unknown> = {};
    try {
      const requestBody = await req.json();
      action = requestBody.action;
      body = { ...requestBody };
      delete body.action;
    } catch {
      return new Response(
        JSON.stringify({ error: { message: "Invalid request body", code: "INVALID_REQUEST" } }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!action) {
      return new Response(
        JSON.stringify({ error: { message: "Action is required", code: "MISSING_ACTION" } }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const clienteId = String(body.clienteId ?? "").trim();
    if (!clienteId) {
      return new Response(
        JSON.stringify({
          error: {
            message: "clienteId é obrigatório",
            code: "MISSING_CLIENTE_ID",
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const metaToken = await readClientMetaToken(supabase, clienteId);
    if (!metaToken) {
      return new Response(
        JSON.stringify({
          error: {
            message: "Token Meta do cliente não configurado. Salve em Gerenciar logins → Meta WhatsApp.",
            code: "CLIENT_META_TOKEN_NOT_CONFIGURED",
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: clRow } = await supabase
      .from("clientes")
      .select("meta_ctwa_business_id")
      .eq("id", clienteId)
      .maybeSingle();
    const clientCtwaBusinessId = clRow?.meta_ctwa_business_id
      ? String(clRow.meta_ctwa_business_id).trim()
      : null;

  if (action === "list-whatsapp-business-accounts") {
      try {
        const businessIdEnv = String(body.businessId ?? clientCtwaBusinessId ?? "").trim();
        const accounts = await listWabaAccountIds(
          metaToken,
          businessIdEnv || clientCtwaBusinessId
        );
        let businessIds: string[] = [];
        if (businessIdEnv) {
          businessIds = [businessIdEnv];
        } else if (clientCtwaBusinessId) {
          businessIds = [clientCtwaBusinessId];
        }
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
                  hint: "Confira page_id e permissões page_events / business_management no token do cliente.",
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
          JSON.stringify({
            error: { message: "Informe wabaId ou pageId", code: "MISSING_WABA_OR_PAGE" },
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      try {
        const tokenQ = encodeURIComponent(metaToken);
        const wabaUrl = `https://graph.facebook.com/v24.0/${encodeURIComponent(wabaId)}?fields=id,name,dataset&access_token=${tokenQ}`;
        const wabaRes = await fetch(wabaUrl);
        const wabaData = await wabaRes.json();
        if (wabaData?.error) {
          return new Response(
            JSON.stringify({
              error: {
                message: wabaData.error.message || "WABA inacessível",
                code: wabaData.error.code || "META_WABA_ERROR",
                hint: "Atribua Conta do WhatsApp ao System User no BM do cliente.",
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
                JSON.stringify({ error: { message: postData.error.message, code: "META_DATASET_ERROR" } }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
          }
        }
        return new Response(
          JSON.stringify({ dataset_id: datasetId, waba_id: wabaId, waba_name: wabaData?.name ?? null }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: { message: err?.message || "Erro ao obter dataset" } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (action === "send-ctwa-conversion") {
      const ctwaClid = String(body.ctwaClid ?? "").trim();
      const eventName = String(body.eventName ?? "").trim();
      const contactId = body.contactId ?? null;
      const leadId = body.leadId ?? null;
      let whatsappConfigId = String(body.whatsappConfigId ?? "").trim() || null;
      const allowedEvents = ["QualifiedLead", "InitiateCheckout", "Purchase", "LeadSubmitted"];
      if (!ctwaClid || !allowedEvents.includes(eventName)) {
        return new Response(
          JSON.stringify({ error: { message: "ctwaClid e eventName válidos são obrigatórios", code: "INVALID_PAYLOAD" } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (ctwaClid.length < 8) {
        return new Response(
          JSON.stringify({ error: { message: "ctwaClid inválido no contato", code: "INVALID_CTWA_CLID" } }),
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
      } | null = null;

      if (whatsappConfigId) {
        const { data: ch } = await supabase
          .from("cliente_whatsapp_config")
          .select("id, meta_waba_id, meta_page_id, meta_dataset_id, meta_conversions_enabled")
          .eq("id", whatsappConfigId)
          .eq("cliente_id", clienteId)
          .maybeSingle();
        channelConfig = ch;
      }
      if (!channelConfig) {
        const { data: enabledList } = await supabase
          .from("cliente_whatsapp_config")
          .select("id, meta_waba_id, meta_page_id, meta_dataset_id, meta_conversions_enabled")
          .eq("cliente_id", clienteId)
          .eq("meta_conversions_enabled", true);
        if (enabledList?.length === 1) channelConfig = enabledList[0];
      }

      let wabaId = onlyDigits(String(channelConfig?.meta_waba_id ?? ""));
      let pageId = onlyDigits(String(body.pageId ?? channelConfig?.meta_page_id ?? ""));
      let datasetId = onlyDigits(String(channelConfig?.meta_dataset_id ?? ""));
      let conversionsEnabled = !!channelConfig?.meta_conversions_enabled;
      const usePageId = !!pageId;

      if (!wabaId || !datasetId || !conversionsEnabled) {
        const { data: cliente } = await supabase
          .from("clientes")
          .select("meta_waba_id, meta_dataset_id, meta_conversions_enabled")
          .eq("id", clienteId)
          .maybeSingle();
        if (!conversionsEnabled) conversionsEnabled = !!cliente?.meta_conversions_enabled;
        if (!wabaId && !usePageId) wabaId = onlyDigits(String(cliente?.meta_waba_id ?? ""));
        if (!datasetId) datasetId = onlyDigits(String(cliente?.meta_dataset_id ?? ""));
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
                ? "Configure Page ID e Dataset (Buscar pela página) na aba Meta WhatsApp."
                : "Configure WABA e Dataset na aba Meta WhatsApp.",
            },
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      whatsappConfigId = whatsappConfigId || channelConfig?.id || null;

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
      if (businessPhone) {
        const configuredPhones = await fetchWabaPhoneNumbers(wabaId, metaToken);
        const wabaHasPhone = configuredPhones.some((p) =>
          phonesMatch(p.display_phone_number, businessPhone)
        );
        if (!wabaHasPhone) {
          const resolvedWaba = await resolveWabaIdForBusinessPhone(
            metaToken,
            clientCtwaBusinessId,
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
                    "Em Meta WhatsApp → Listar contas, escolha a WABA que mostra o mesmo número do anúncio CTWA (ex.: 41 3253-5236), Buscar dataset e Salvar.",
                },
                business_phone: businessPhone,
                waba_id_configured: onlyDigits(String(channelConfig?.meta_waba_id ?? wabaId)),
              }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      }

      const dedupeSince = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: recent } = await supabase
        .from("meta_conversion_event_log")
        .select("id")
        .eq("cliente_id", clienteId)
        .eq("event_name", eventName)
        .eq("ctwa_clid", ctwaClid)
        .eq("success", true)
        .gte("created_at", dedupeSince)
        .limit(1);
      if (recent?.length) {
        return new Response(
          JSON.stringify({ skipped: true, reason: "duplicate_event", success: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const eventTime = Math.floor(Date.now() / 1000);
      const valueNum = Number(body.value);
      const eventId = `planeje_${eventName}_${ctwaClid.slice(0, 32)}_${eventTime}`;
      const postEvent = (wabaForSend: string, pageForSend: string) => {
        const eventPayload: Record<string, unknown> = {
          event_name: eventName,
          event_time: eventTime,
          event_id: eventId,
          action_source: "business_messaging",
          messaging_channel: "whatsapp",
          user_data: buildCtwaUserData(ctwaClid, wabaForSend, pageForSend),
        };
        if (eventName === "Purchase" && Number.isFinite(valueNum) && valueNum > 0) {
          eventPayload.custom_data = { currency: "BRL", value: valueNum };
        }
        const postBody: Record<string, unknown> = { data: [eventPayload] };
        const testCode = Deno.env.get("META_CTWA_TEST_EVENT_CODE")?.trim();
        if (testCode) postBody.test_event_code = testCode;
        return postBody;
      };

      let success = false;
      let metaResponse: Record<string, unknown> | null = null;
      let errorMessage: string | null = null;
      let identityMode: "page_id" | "waba_id" = usePageId ? "page_id" : "waba_id";

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
          errorMessage = formatMetaGraphError(metaResponse.error as Record<string, unknown>);
          const errObj = metaResponse.error as Record<string, unknown>;
          const fallbackPageId = onlyDigits(String(channelConfig?.meta_page_id ?? ""));
          if (
            errObj.error_subcode === 2804117 &&
            !usePageId &&
            wabaId &&
            fallbackPageId
          ) {
            let pageDataset = datasetId;
            const dsFromPage = await fetchDatasetIdForPage(fallbackPageId, metaToken);
            if (dsFromPage) pageDataset = dsFromPage;
            if (pageDataset) {
              datasetId = pageDataset;
              metaResponse = await sendPayload("", fallbackPageId);
              if (!metaResponse?.error) {
                success = true;
                identityMode = "page_id";
                errorMessage = null;
              } else {
                errorMessage = formatMetaGraphError(metaResponse.error as Record<string, unknown>);
              }
            }
          }
        } else {
          success = true;
        }
      } catch (err) {
        errorMessage = err?.message || "Erro de rede";
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
        let hint: string | undefined;
        if (errObj.error_subcode === 2804117) {
          hint =
            "ctwa_clid não combina com WABA/page_id do canal. Tente Page ID da Página do anúncio (Configurações da Página) ou WABA do número 3253-5236.";
        } else if (/invalid parameter/i.test(String(errorMessage || ""))) {
          hint = "Dataset do WABA (Buscar), WABA do CTWA, ctwaClid real do webhook.";
        }
        return new Response(
          JSON.stringify({
            error: { message: errorMessage, code: "META_EVENT_FAILED", subcode: errObj.error_subcode, hint },
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
          waba_id_used: usePageId ? null : wabaId,
          page_id_used: usePageId || identityMode === "page_id" ? pageId || channelConfig?.meta_page_id : null,
          identity_mode: identityMode,
          waba_auto_corrected: wabaAutoCorrected,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        error: {
          message: `Action não suportada: ${action}. Use list-whatsapp-business-accounts, get-waba-dataset, send-ctwa-conversion`,
          code: "UNKNOWN_ACTION",
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: { message: err?.message || "Internal error", code: "INTERNAL_ERROR" } }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
