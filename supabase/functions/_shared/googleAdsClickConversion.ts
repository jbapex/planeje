import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export function gclidFromTracking(
  tracking: Record<string, unknown> | null | undefined,
): string {
  if (!tracking || typeof tracking !== "object") return "";
  const raw = tracking.gclid ?? tracking.gClid ?? tracking.GCLID;
  return raw == null ? "" : String(raw).trim();
}

/**
 * Dispara LeadSubmitted no Google Ads quando o contato tem gclid
 * e a conta do cliente tem conversões + ação de conversa mapeada.
 */
export async function maybeSendGoogleLeadSubmitted(opts: {
  supabase: SupabaseClient;
  supabaseUrl: string;
  serviceKey: string;
  clienteId: string;
  contactId: string;
  tracking?: Record<string, unknown> | null;
  fromMe?: boolean;
}): Promise<void> {
  if (opts.fromMe) return;
  const gclid = gclidFromTracking(opts.tracking);
  if (!gclid) return;

  const { data: prior } = await opts.supabase
    .from("google_conversion_event_log")
    .select("id")
    .eq("cliente_id", opts.clienteId)
    .eq("gclid", gclid)
    .in("event_name", ["LeadSubmitted", "Lead"])
    .eq("success", true)
    .limit(1);
  if (prior?.length) return;

  const url = `${opts.supabaseUrl}/functions/v1/google-ads-api`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.serviceKey}`,
      },
      body: JSON.stringify({
        action: "upload-click-conversion",
        clienteId: opts.clienteId,
        contactId: opts.contactId,
        gclid,
        eventName: "LeadSubmitted",
      }),
    });
    const body = await res.json().catch(() => ({}));
    console.log(
      "[google-ads] LeadSubmitted",
      res.status,
      body?.success,
      body?.skipped,
      body?.reason || body?.error?.message || "",
    );
  } catch (e) {
    console.error("[google-ads] LeadSubmitted failed", e);
  }
}
