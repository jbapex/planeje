/** Links rastreáveis Planeje → WhatsApp (Deno). Espelho de src/lib/rastreamentoTrackableLink.js */
import { encodeHiddenMatchCode, extractMatchCode as extractTrackableMatchCode } from "./rastreamentoHiddenMatchCode.js";
import { linkAttributionSnapshot } from "./rastreamentoMessageAttribution.js";
export { TRACKABLE_MATCH_CODE_RE } from "./rastreamentoHiddenMatchCode.js";

const META_UTM = ["facebook", "meta", "fb", "meta_ads", "meta ads", "facebook_ads", "fb_ads", "ig", "instagram"];
const GOOGLE_UTM = ["google", "googleads", "google_ads", "adwords", "gads"];
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SLUG_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export type TrackableOrigin = "site" | "google_ads" | "meta_ads";

export type MatchedClick = {
  id: string;
  link_id: string;
  cliente_id: string;
  match_code: string;
  gclid: string | null;
  fbclid: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  origin_resolved: TrackableOrigin;
  link_attribution?: {
    platform: "meta" | "google" | "site";
    campaign_id?: string;
    campaign_name?: string;
    adset_id?: string;
    adset_name?: string;
  } | null;
  matched_at?: string | null;
  matched_from_jid?: string | null;
  clicked_at?: string | null;
};

// deno-lint-ignore no-explicit-any
type Sb = any;

export function normalizePhoneDigits(value: unknown): string {
  return String(value || "").replace(/\D/g, "");
}

export function generateTrackableSlug(length = 8): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += SLUG_ALPHABET[Math.floor(Math.random() * SLUG_ALPHABET.length)];
  }
  if (!/^[a-z]/.test(out)) out = `a${out.slice(1)}`;
  return out;
}

export function generateMatchCode(): string {
  let body = "";
  for (let i = 0; i < 6; i += 1) {
    body += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return `PJ-${body}`;
}

export function extractMatchCode(text: unknown): string | null {
  return extractTrackableMatchCode(text);
}

export function hasCtwaTrackingSignal(tracking: Record<string, unknown> | null | undefined): boolean {
  const td = tracking && typeof tracking === "object" ? tracking : {};
  if (td.ctwaClid != null && String(td.ctwaClid).trim()) return true;
  if (td.ctwa_clid != null && String(td.ctwa_clid).trim()) return true;
  return false;
}

function utmSuggests(list: string[], value: unknown): boolean {
  const s = String(value || "").toLowerCase();
  if (!s) return false;
  return list.some((m) => s.includes(m));
}

export function resolveOriginFromClickParams(params: {
  gclid?: string | null;
  fbclid?: string | null;
  utm_source?: string | null;
  default_origin?: string | null;
}): TrackableOrigin {
  if (params.gclid || utmSuggests(GOOGLE_UTM, params.utm_source)) return "google_ads";
  if (params.fbclid || utmSuggests(META_UTM, params.utm_source)) return "meta_ads";
  const fallback = String(params.default_origin || "site").trim();
  if (fallback === "google_ads" || fallback === "meta_ads" || fallback === "site") {
    return fallback;
  }
  return "site";
}

export function buildWaMeMessageText(
  matchCode: string,
  opts: { initialMessage?: string | null; appendMatchCode?: boolean } = {},
): string {
  const code = String(matchCode || "").trim().toUpperCase();
  const greeting = String(opts.initialMessage || "").trim();
  if (/\{codigo_oculto\}/i.test(greeting)) {
    const visible = greeting.replace(/\{codigo(?:_oculto)?\}|\bPJ-[A-Z0-9]{6}\b/gi, "").trim() || "Olá!";
    return visible + encodeHiddenMatchCode(code);
  }
  const withCode = opts.appendMatchCode !== false && Boolean(code);
  if (greeting && withCode) {
    if (/\bPJ-[A-Z0-9]{6}\b/i.test(greeting) || /\{codigo\}/i.test(greeting)) {
      return greeting.replace(/\{codigo\}/gi, code).replace(/\bPJ-[A-Z0-9]{6}\b/gi, code);
    }
    return `${greeting}\n\nCódigo ${code}`;
  }
  if (greeting) return greeting;
  if (withCode) return `Olá! Código ${code}`;
  return "Olá!";
}

export function buildWaMeRedirectUrl(
  phoneDigits: string,
  matchCode: string,
  opts: {
    initialMessage?: string | null;
    appendMatchCode?: boolean;
    openMode?: string | null;
    whatsapp_open_mode?: string | null;
  } = {},
): string {
  const phone = normalizePhoneDigits(phoneDigits);
  if (!phone) return "";
  const text = buildWaMeMessageText(matchCode, opts);
  const encoded = encodeURIComponent(text);
  const mode = String(opts.openMode || opts.whatsapp_open_mode || "auto").trim().toLowerCase();
  if (mode === "app") return `whatsapp://send?phone=${phone}&text=${encoded}`;
  if (mode === "web") return `https://web.whatsapp.com/send?phone=${phone}&text=${encoded}`;
  return `https://wa.me/${phone}?text=${encoded}`;
}

export function mergeClickUtmWithLinkDefaults(
  clickUtm: Record<string, unknown> | null | undefined,
  linkDefaults: Record<string, unknown> | null | undefined,
): {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
} {
  const click = clickUtm && typeof clickUtm === "object" ? clickUtm : {};
  const defaults = linkDefaults && typeof linkDefaults === "object" ? linkDefaults : {};
  const pick = (key: string, defKey: string) => {
    const fromClick = String((click as Record<string, unknown>)[key] || "").trim();
    if (fromClick) return fromClick;
    return String((defaults as Record<string, unknown>)[defKey] || (defaults as Record<string, unknown>)[key] || "").trim() || null;
  };
  return {
    utm_source: pick("utm_source", "default_utm_source"),
    utm_medium: pick("utm_medium", "default_utm_medium"),
    utm_campaign: pick("utm_campaign", "default_utm_campaign"),
    utm_content: pick("utm_content", "default_utm_content"),
    utm_term: pick("utm_term", "default_utm_term"),
  };
}

export function trackingFromMatchedClick(
  click: MatchedClick,
  keepExisting: Record<string, unknown> | null = null,
): Record<string, unknown> {
  const next: Record<string, unknown> = keepExisting && typeof keepExisting === "object"
    ? { ...keepExisting }
    : {};
  if (click.gclid) next.gclid = click.gclid;
  if (click.fbclid) next.fbclid = click.fbclid;
  if (click.utm_source) next.utm_source = click.utm_source;
  if (click.utm_medium) next.utm_medium = click.utm_medium;
  if (click.utm_campaign) next.utm_campaign = click.utm_campaign;
  if (click.utm_content) next.utm_content = click.utm_content;
  if (click.utm_term) next.utm_term = click.utm_term;
  next.planeje_match_code = click.match_code;
  next.planeje_click_id = click.id;
  next.planeje_link_id = click.link_id;
  next.planeje_link_origin = click.origin_resolved;
  if (click.link_attribution != null) next.planeje_link_attribution = linkAttributionSnapshot(click.link_attribution);
  if (click.clicked_at) next.planeje_clicked_at = click.clicked_at;
  return next;
}

/**
 * Casa o código da 1ª mensagem com um clique aberto do mesmo cliente.
 * Não sobrescreve CTWA (chame só quando não há ctwaClid).
 */
export async function claimTrackableClickMatch(
  supabase: Sb,
  opts: { matchCode: string; clienteId: string; fromJid?: string | null },
): Promise<MatchedClick | null> {
  const code = String(opts.matchCode || "").trim().toUpperCase();
  if (!/^PJ-[A-Z0-9]{6}$/.test(code)) return null;
  const fields = "id, link_id, cliente_id, match_code, gclid, fbclid, utm_source, utm_medium, utm_campaign, utm_content, utm_term, origin_resolved, link_attribution, matched_at, matched_from_jid, clicked_at";

  const { data: existing, error: findError } = await supabase
    .from("cliente_rastreamento_link_clicks")
    .select(fields)
    .eq("match_code", code)
    .maybeSingle();

  if (findError || !existing) return null;
  if (existing.cliente_id !== opts.clienteId) return null;

  if (existing.matched_at) {
    if (opts.fromJid && existing.matched_from_jid && existing.matched_from_jid === opts.fromJid) {
      return existing as MatchedClick;
    }
    return null;
  }

  const { data: claimed, error: claimError } = await supabase
    .from("cliente_rastreamento_link_clicks")
    .update({
      matched_at: new Date().toISOString(),
      matched_from_jid: opts.fromJid || null,
    })
    .eq("id", existing.id)
    .is("matched_at", null)
    .select(fields)
    .maybeSingle();

  if (claimError) {
    console.error("[rastreamentoTrackableLink] claim error", claimError.message);
    return null;
  }
  if (claimed || !opts.fromJid) return (claimed as MatchedClick | null) || null;

  // Another event for the same sender may have won the atomic claim.
  const { data: raced, error: raceError } = await supabase
    .from("cliente_rastreamento_link_clicks").select(fields)
    .eq("id", existing.id).eq("cliente_id", opts.clienteId).eq("match_code", code)
    .eq("matched_from_jid", opts.fromJid).maybeSingle();
  return !raceError && raced?.matched_at && raced.matched_from_jid === opts.fromJid
    ? raced as MatchedClick : null;
}
