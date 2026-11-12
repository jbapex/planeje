import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const BASE = "https://datamanager.googleapis.com/v1";
const ACTION_COLUMNS: Record<string, string> = {
  LeadSubmitted: "conv_action_lead", Lead: "conv_action_lead",
  QualifiedLead: "conv_action_qualified", Purchase: "conv_action_purchase",
};
const cleanId = (value: unknown) => String(value || "").replace(/-/g, "").trim();
const table = "google_conversion_event_log";
const metaOf = (row: any) => row?.google_response?.api === "data_manager_v1" ? row.google_response : null;
const errorResult = (message: string, code = "GOOGLE_CONVERSION_ERROR") => ({ success: false, error: { message, code } });

function googleError(data: any, fallback: string): string {
  const message = String(data?.error?.message || fallback);
  const reasons = (data?.error?.details || []).map((d: any) => d.reason || "").join(" ");
  if (/ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficient.*scopes/i.test(`${reasons} ${message}`)) {
    return "DATAMANAGER_REAUTHORIZE: Autorize novamente o Google Ads da agência com a permissão Data Manager.";
  }
  if (/SERVICE_DISABLED|has not been used.*disabled|not enabled/i.test(`${reasons} ${message}`)) {
    return "DATAMANAGER_API_DISABLED: Ative a Data Manager API no projeto Google Cloud da conexão.";
  }
  return message;
}

async function save(supabase: SupabaseClient, row: any, patch: any) {
  const { data, error } = await supabase.from(table).update(patch)
    .eq("id", row.id).eq("cliente_id", row.cliente_id).select("id").maybeSingle();
  if (error || !data) throw new Error("Não foi possível gravar o resultado do envio Google. Consulte o histórico antes de tentar novamente.");
}

async function readResponse(res: Response) {
  try { return await res.json(); } catch { return null; }
}

async function conversionIdentity(clienteId: string, gclid: string, eventName: string, conversionAction: string) {
  const bytes = new TextEncoder().encode(JSON.stringify([clienteId, gclid, eventName, conversionAction]));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  const uuid = new Uint8Array(digest.slice(0, 16));
  uuid[6] = (uuid[6] & 15) | 128;
  uuid[8] = (uuid[8] & 63) | 128;
  const hex = Array.from(uuid, b => b.toString(16).padStart(2, "0")).join("");
  return { transactionId: `pj-${hash}`, logId: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` };
}

function retryable(row: any) {
  if (row.success) return false;
  const meta = metaOf(row);
  if (meta?.phase === "processing") return false;
  if (meta?.phase === "sending") return Date.now() - Date.parse(meta.submittedAt || row.created_at) > 5 * 60_000;
  if (row.event_name === "Purchase" && !meta?.event) return false;
  const details = meta?.response?.error?.details;
  if (meta?.phase === "failed" && Array.isArray(details) && details.some((detail: any) =>
    Array.isArray(detail?.fieldViolations) && detail.fieldViolations.some((v: any) =>
      v?.reason === "REQUIRED_FIELD_MISSING" && v?.field === "events.events[0].event_source"))) return true;
  return /fetch failed|failed to fetch|network|timeout|timed out|ECONNRESET|HTTP (429|5\d\d)|DATAMANAGER_REAUTHORIZE|DATAMANAGER_API_DISABLED|DATAMANAGER_PROJECT_REQUIRED|New integrations.*Data Manager|CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE/i.test(row.error_message || "") || meta?.phase === "uncertain";
}

/** Uma conversão por cliente/clique/evento, com o mesmo ID em toda tentativa. */
export async function handleGoogleDataManagerConversion(opts: {
  supabase: SupabaseClient; accessToken: string; loginCustomerId?: string | null; cloudProjectId?: string | null;
  action: string; body: Record<string, any>;
}) {
  const { supabase, accessToken, loginCustomerId, action, body } = opts;
  const clienteId = String(body.clienteId || "").trim();
  if (!clienteId) return errorResult("Cliente é obrigatório.");
  const projectId = String(opts.cloudProjectId || "").trim();
  const projectValid = /^(?:[a-z][a-z0-9-]{4,28}[a-z0-9]|\d{6,20})$/.test(projectId);
  const projectError = "not_configured: DATAMANAGER_PROJECT_REQUIRED: Configure o ID do projeto Google Cloud em Google Ads da agência.";
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
  if (projectValid) headers["x-goog-user-project"] = projectId;

  let original: any = null;
  if (action !== "upload-click-conversion") {
    if (!body.eventId) return errorResult("Selecione um evento do histórico.");
    const found = await supabase.from(table).select("*").eq("cliente_id", clienteId).eq("id", body.eventId).maybeSingle();
    if (found.error || !found.data) return errorResult("Evento não encontrado neste cliente.", "EVENT_NOT_FOUND");
    original = found.data;
    if (action === "get-conversion-status") return projectValid ? checkStatus(supabase, original, headers) : { ...errorResult(projectError), pending: true };
    if (!retryable(original)) return errorResult("Este evento não permite reenvio. Confira o resultado ou a configuração antes de tentar.", "RETRY_NOT_ALLOWED");
  }

  const gclid = String(original?.gclid ?? body.gclid ?? "").trim();
  const eventName = String(original?.event_name ?? body.eventName ?? "").trim().replace(/^Lead$/, "LeadSubmitted");
  const column = ACTION_COLUMNS[eventName];
  if (!gclid || !column) return errorResult("Informe GCLID e um evento de conversa, qualificação ou compra.", "INVALID_EVENT");
  if (!original) {
    for (const [id, source] of [[body.contactId, "cliente_whatsapp_contact"], [body.leadId, "leads"]]) {
      if (!id) continue;
      const owner = await supabase.from(source).select("id").eq("cliente_id", clienteId).eq("id", id).maybeSingle();
      if (owner.error || !owner.data) return errorResult("Contato ou lead não encontrado neste cliente.", "CONTACT_NOT_FOUND");
    }
  }
  const { data: accounts, error: accountError } = await supabase.from("cliente_google_ads_accounts")
    .select("id, google_customer_id, conversions_enabled, conv_action_lead, conv_action_qualified, conv_action_purchase")
    .eq("cliente_id", clienteId).eq("is_active", true);
  if (accountError) return errorResult("Não foi possível consultar a configuração Google.");
  const requestedCustomer = cleanId(original?.customer_id || body.customerId || body.googleCustomerId);
  const enabled = (accounts || []).filter((a: any) => a.conversions_enabled === true);
  const account = requestedCustomer ? enabled.find((a: any) => cleanId(a.google_customer_id) === requestedCustomer) : enabled[0];
  const customerId = cleanId(account?.google_customer_id);
  const conversionAction = String(account?.[column] || "").trim();
  const mapped = conversionAction.match(/^customers\/(\d{10})\/conversionActions\/(\d+)$/);
  const requestedAction = original?.conversion_action || body.conversionAction;
  if (!account || !mapped || (requestedAction && requestedAction !== conversionAction)) {
    const message = "not_configured: Confira a conta habilitada e a ação mapeada para este evento.";
    const audit = await supabase.from(table).insert({ cliente_id: clienteId, gclid, event_name: eventName,
      contact_id: original?.contact_id || body.contactId || null, lead_id: original?.lead_id || body.leadId || null,
      conversion_action: conversionAction || null, customer_id: customerId || null, success: false,
      google_response: { api: "data_manager_v1", phase: "blocked" }, error_message: message });
    return audit.error ? errorResult("Não foi possível registrar o bloqueio Google.") : errorResult(message, "NOT_CONFIGURED");
  }

  const priorResult = await supabase.from(table).select("*").eq("cliente_id", clienteId).eq("gclid", gclid)
    .in("event_name", eventName === "LeadSubmitted" ? ["LeadSubmitted", "Lead"] : [eventName])
    .order("created_at", { ascending: true });
  if (priorResult.error) return errorResult("Não foi possível conferir envios anteriores. Nenhum novo envio foi feito.");
  const prior = priorResult.data || [];
  if (prior.some((r: any) => r.success)) return { success: true, skipped: true, idempotent: true, reason: "already_sent" };
  const pending = prior.find((r: any) => ["processing", "sending", "uncertain"].includes(metaOf(r)?.phase) &&
    !prior.some((next: any) => metaOf(next)?.retryOf === r.id));
  if (pending && pending.id !== original?.id) return { success: false, pending: true, skipped: true, idempotent: true, reason: "processing", eventId: pending.id };
  if (!original && prior.some((r: any) => !String(r.error_message || "").startsWith("not_configured:"))) {
    return { ...errorResult("Há uma tentativa anterior. Use o reenvio individual no histórico."), skipped: true, reason: "previous_failure" };
  }

  const identity = await conversionIdentity(clienteId, gclid, eventName, conversionAction);
  const canonical = prior.find((r: any) => r.id === identity.logId);
  const oldMeta = metaOf(canonical) || metaOf(original);
  const timestamp = oldMeta?.event?.eventTimestamp || (original ? prior[0]?.created_at : null) || body.conversionDateTime || new Date().toISOString();
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return errorResult("Data da conversão inválida.", "INVALID_TIMESTAMP");
  const event: any = oldMeta?.event ? { ...oldMeta.event } : {
    eventTimestamp: date.toISOString(), adIdentifiers: { gclid },
    transactionId: identity.transactionId,
  };
  // Conversões deste fluxo nascem no WhatsApp; snapshots antigos também precisam do campo obrigatório.
  event.eventSource ||= "MESSAGE";
  if (!oldMeta?.event && eventName === "Purchase") {
    const value = Number(body.value);
    if (body.value != null && (!Number.isFinite(value) || value < 0)) return errorResult("Valor da compra inválido.", "INVALID_VALUE");
    if (value > 0) {
      event.conversionValue = value;
      event.currency = String(body.currencyCode || "BRL");
      if (!/^[A-Z]{3}$/.test(event.currency)) return errorResult("Moeda da compra inválida.", "INVALID_CURRENCY");
    }
  }
  const destination: any = { operatingAccount: { accountType: "GOOGLE_ADS", accountId: mapped[1] }, productDestinationId: mapped[2] };
  const loginId = cleanId(loginCustomerId);
  if (loginId) {
    if (!/^\d{10}$/.test(loginId)) return errorResult("Confira a MCC na configuração Google.", "INVALID_LOGIN_ACCOUNT");
    destination.loginAccount = { accountType: "GOOGLE_ADS", accountId: loginId };
  }
  const submittedAt = new Date().toISOString();
  const meta: any = { api: "data_manager_v1", phase: projectValid ? "sending" : "blocked", event, destination, submittedAt, retryOf: original?.id || null };
  const row = {
    // A PK existente reserva atomicamente o primeiro payload; no Google, o mesmo ID pode atualizar valores.
    ...(canonical ? {} : { id: identity.logId }),
    cliente_id: clienteId, contact_id: original?.contact_id || body.contactId || null,
    lead_id: original?.lead_id || body.leadId || null, gclid, event_name: eventName,
    conversion_action: conversionAction, customer_id: customerId, success: false,
    google_response: meta, error_message: projectValid ? "Envio em andamento; confirmação ainda não recebida." : projectError,
  };
  const inserted = await supabase.from(table).insert(row).select("*").single();
  if (inserted.error?.code === "23505") {
    const reserved = await supabase.from(table).select("*").eq("cliente_id", clienteId).eq("id", identity.logId).maybeSingle();
    const existing = reserved.data;
    if (!reserved.error && existing?.gclid === gclid && existing.conversion_action === conversionAction) {
      if (existing.success) return { success: true, skipped: true, idempotent: true, reason: "already_sent" };
      if (["sending", "processing", "uncertain"].includes(metaOf(existing)?.phase)) {
        return { success: false, pending: true, skipped: true, idempotent: true, eventId: existing.id };
      }
      return { ...errorResult(existing.error_message || "Consulte a tentativa já registrada."), skipped: true, idempotent: true };
    }
  }
  if (inserted.error || !inserted.data) return errorResult("Não foi possível registrar a tentativa. Nenhum envio foi feito.", "LOG_WRITE_FAILED");
  const log = inserted.data;
  if (!projectValid) return errorResult(projectError, "DATAMANAGER_PROJECT_REQUIRED");
  try {
    const res = await fetch(`${BASE}/events:ingest`, { method: "POST", headers,
      body: JSON.stringify({ destinations: [destination], events: [event] }) });
    const data = await readResponse(res);
    if (!res.ok) {
      const message = `HTTP ${res.status}: ${googleError(data, "Google Data Manager recusou o envio.")}`;
      await save(supabase, log, { google_response: { ...meta, phase: "failed", response: data }, error_message: message });
      return errorResult(message);
    }
    if (!data?.requestId || typeof data.requestId !== "string") throw new Error("Google não devolveu requestId; confirmação do envio indisponível.");
    const nextCheckAt = new Date(Date.now() + 30 * 60_000).toISOString();
    await save(supabase, log, { google_response: { ...meta, phase: "processing", requestId: data.requestId, response: data, statusChecks: 0, nextCheckAt }, error_message: null });
    return { success: false, accepted: true, pending: true, eventId: log.id, nextCheckAt };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha de comunicação com Google.";
    try { await save(supabase, log, { google_response: { ...meta, phase: "uncertain" }, error_message: message }); } catch { /* O registro anterior conserva a identidade para recuperação. */ }
    return { ...errorResult(message), uncertain: true, eventId: log.id };
  }
}

async function checkStatus(supabase: SupabaseClient, row: any, headers: Record<string, string>) {
  const meta = metaOf(row);
  if (row.success) return { success: true, idempotent: true };
  if (meta?.phase !== "processing" || !meta?.requestId) return errorResult("Este evento não possui processamento pendente para consultar.");
  if (Date.now() < new Date(meta.nextCheckAt || 0).getTime()) return { success: false, pending: true, nextCheckAt: meta.nextCheckAt };
  const nextCheckAt = new Date(Date.now() + Math.min(60, 30 * 1.3 ** ((meta.statusChecks || 0) + 1)) * 60_000).toISOString();
  const updated = { ...meta, nextCheckAt, statusChecks: (meta.statusChecks || 0) + 1 };
  try {
    const claimed = await supabase.from(table).update({ google_response: updated }).eq("id", row.id)
      .eq("cliente_id", row.cliente_id).eq("google_response->>nextCheckAt", meta.nextCheckAt).select("id").maybeSingle();
    if (claimed.error) throw new Error("Não foi possível reservar a consulta Google. O envio continua pendente.");
    if (!claimed.data) return { success: false, pending: true, nextCheckAt };
    const url = `${BASE}/requestStatus:retrieve?requestId=${encodeURIComponent(meta.requestId)}`;
    const res = await fetch(url, { headers });
    const data = await readResponse(res);
    if (!res.ok) throw new Error(googleError(data, `Não foi possível consultar o Google: HTTP ${res.status}`));
    const destination = (data?.requestStatusPerDestination || []).find((s: any) =>
      s.destination?.operatingAccount?.accountId === meta.destination.operatingAccount.accountId &&
      s.destination?.productDestinationId === meta.destination.productDestinationId);
    if (!destination) throw new Error("Diagnóstico sem o destino esperado. O envio continua pendente.");
    const state = destination.requestStatus;
    if (state === "SUCCESS" && String(destination.eventsIngestionStatus?.recordCount) !== "1") {
      throw new Error("Diagnóstico sem confirmação do registro enviado. O envio continua pendente.");
    }
    const success = state === "SUCCESS";
    const failed = ["FAILED", "FAILURE", "PARTIAL_SUCCESS"].includes(state);
    const reasons = (destination.errorInfo?.errorCounts || []).map((e: any) => e.reason).filter(Boolean).join(", ");
    const errorMessage = failed ? reasons || `Processamento Google: ${state}` : null;
    await save(supabase, row, { success, error_message: errorMessage, google_response: {
      ...updated, phase: success ? "completed" : failed ? "failed" : "processing", diagnostics: data, lastCheckError: null,
    } });
    return { success, pending: !success && !failed, nextCheckAt, ...(failed ? { error: { message: errorMessage } } : {}) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao consultar processamento.";
    try { await save(supabase, row, { google_response: { ...updated, lastCheckError: message } }); } catch { /* Não declarar conclusão sem persistência. */ }
    return { ...errorResult(message), pending: true, nextCheckAt };
  }
}
