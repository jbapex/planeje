/** Links rastreáveis Planeje → WhatsApp (Google / Meta-site / site). Sem pixel nem CAPI. */
import { encodeHiddenMatchCode, extractMatchCode as extractTrackableMatchCode } from '../../supabase/functions/_shared/rastreamentoHiddenMatchCode.js';
import { linkAttributionSnapshot } from '../../supabase/functions/_shared/rastreamentoMessageAttribution.js';
export { TRACKABLE_MATCH_CODE_RE } from '../../supabase/functions/_shared/rastreamentoHiddenMatchCode.js';

const META_UTM = ['facebook', 'meta', 'fb', 'meta_ads', 'meta ads', 'facebook_ads', 'fb_ads', 'ig', 'instagram'];
const GOOGLE_UTM = ['google', 'googleads', 'google_ads', 'adwords', 'gads'];
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SLUG_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function normalizePhoneDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

export function generateTrackableSlug(length = 8) {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += SLUG_ALPHABET[Math.floor(Math.random() * SLUG_ALPHABET.length)];
  }
  if (!/^[a-z]/.test(out)) out = `a${out.slice(1)}`;
  return out;
}

export function generateMatchCode() {
  let body = '';
  for (let i = 0; i < 6; i += 1) {
    body += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return `PJ-${body}`;
}

export function extractMatchCode(text) {
  return extractTrackableMatchCode(text);
}

export function setHiddenMatchCode(message, enabled = true) {
  const greeting = String(message || '').replace(/\s*\{codigo_oculto\}/gi, '').trim();
  return enabled ? `${greeting}${greeting ? ' ' : ''}{codigo_oculto}` : greeting;
}

export function hasCtwaTrackingSignal(tracking) {
  const td = tracking && typeof tracking === 'object' ? tracking : {};
  if (td.ctwaClid != null && String(td.ctwaClid).trim()) return true;
  if (td.ctwa_clid != null && String(td.ctwa_clid).trim()) return true;
  return false;
}

/** CTWA / anúncio → WhatsApp (não é o link Planeje com só fbclid). */
export function isCtwaStyleTracking(tracking) {
  const td = tracking && typeof tracking === 'object' ? tracking : {};
  if (td.planeje_match_code || td.planeje_link_id) return false;
  if (hasCtwaTrackingSignal(td)) return true;
  if (td.source_id != null && String(td.source_id).trim()) return true;
  if (td.sourceApp != null && String(td.sourceApp).trim()) return true;
  return false;
}

function utmSuggests(list, value) {
  const s = String(value || '').toLowerCase();
  if (!s) return false;
  return list.some((m) => s.includes(m));
}

/**
 * Resolve origem do clique no link Planeje.
 * CTWA (Click to WhatsApp) não passa por aqui.
 */
export function resolveOriginFromClickParams({
  gclid = null,
  fbclid = null,
  utm_source = null,
  default_origin = 'site',
} = {}) {
  if (gclid || utmSuggests(GOOGLE_UTM, utm_source)) return 'google_ads';
  if (fbclid || utmSuggests(META_UTM, utm_source)) return 'meta_ads';
  const fallback = String(default_origin || 'site').trim();
  if (fallback === 'google_ads' || fallback === 'meta_ads' || fallback === 'site') return fallback;
  return 'site';
}

export function buildWaMeMessageText(matchCode, { initialMessage = '', appendMatchCode = true } = {}) {
  const code = String(matchCode || '').trim().toUpperCase();
  const greeting = String(initialMessage || '').trim();
  if (/\{codigo_oculto\}/i.test(greeting)) {
    const visible = greeting.replace(/\{codigo(?:_oculto)?\}|\bPJ-[A-Z0-9]{6}\b/gi, '').trim() || 'Olá!';
    return visible + encodeHiddenMatchCode(code);
  }
  const withCode = appendMatchCode !== false && Boolean(code);
  if (greeting && withCode) {
    // Evita duplicar se a pessoa já colocou o placeholder
    if (/\bPJ-[A-Z0-9]{6}\b/i.test(greeting) || /\{codigo\}/i.test(greeting)) {
      return greeting.replace(/\{codigo\}/gi, code).replace(/\bPJ-[A-Z0-9]{6}\b/gi, code);
    }
    return `${greeting}\n\nCódigo ${code}`;
  }
  if (greeting) return greeting;
  if (withCode) return `Olá! Código ${code}`;
  return 'Olá!';
}

export function buildWaMeRedirectUrl(phoneDigits, matchCode, opts = {}) {
  const phone = normalizePhoneDigits(phoneDigits);
  if (!phone) return '';
  const text = buildWaMeMessageText(matchCode, opts);
  const encoded = encodeURIComponent(text);
  const mode = String(opts.openMode || opts.whatsapp_open_mode || 'auto').trim().toLowerCase();
  if (mode === 'app') return `whatsapp://send?phone=${phone}&text=${encoded}`;
  if (mode === 'web') return `https://web.whatsapp.com/send?phone=${phone}&text=${encoded}`;
  return `https://wa.me/${phone}?text=${encoded}`;
}

export function publicTrackableLinkUrl(origin, slug, utm = null) {
  const base = String(origin || '').replace(/\/$/, '') || 'https://planeje.jbapex.com.br';
  const s = String(slug || '').trim();
  if (!s) return '';
  const url = `${base}/r/${s}`;
  if (!utm || typeof utm !== 'object') return url;
  const params = new URLSearchParams();
  const pairs = [
    ['utm_source', utm.utm_source || utm.default_utm_source],
    ['utm_medium', utm.utm_medium || utm.default_utm_medium],
    ['utm_campaign', utm.utm_campaign || utm.default_utm_campaign],
    ['utm_content', utm.utm_content || utm.default_utm_content],
    ['utm_term', utm.utm_term || utm.default_utm_term],
  ];
  for (const [key, value] of pairs) {
    const v = String(value || '').trim();
    if (v) params.set(key, v);
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

/** Preenche UTM do clique com os padrões do link quando a URL não trouxe o parâmetro. */
export function mergeClickUtmWithLinkDefaults(clickUtm, linkDefaults) {
  const click = clickUtm && typeof clickUtm === 'object' ? clickUtm : {};
  const defaults = linkDefaults && typeof linkDefaults === 'object' ? linkDefaults : {};
  const pick = (key, defKey) => {
    const fromClick = String(click[key] || '').trim();
    if (fromClick) return fromClick;
    return String(defaults[defKey] || defaults[key] || '').trim() || null;
  };
  return {
    utm_source: pick('utm_source', 'default_utm_source'),
    utm_medium: pick('utm_medium', 'default_utm_medium'),
    utm_campaign: pick('utm_campaign', 'default_utm_campaign'),
    utm_content: pick('utm_content', 'default_utm_content'),
    utm_term: pick('utm_term', 'default_utm_term'),
  };
}

/** HTML do botão WhatsApp no site — usa o link do Planeje (não wa.me cru). */
export function siteWhatsappButtonHtml(trackableUrl, { label = 'Falar no WhatsApp' } = {}) {
  const href = String(trackableUrl || '').trim();
  if (!href) return '';
  const safeLabel = String(label || 'Falar no WhatsApp').replace(/</g, '');
  return `<a href="${href}" rel="noopener noreferrer">${safeLabel}</a>`;
}

/**
 * “Pixel” Planeje (estilo CQC): grava gclid/fbclid/UTM em cookie (7 dias).
 * Ao clicar no link /r/… (ou num wa.me que o script aponta para /r/…), injeta os cookies na URL.
 * Sem o script, o /r/ só captura o que já estiver na URL naquele clique.
 * Não é pixel Meta / CAPI.
 */
export function siteWhatsappRewriteScript(trackableUrl) {
  const href = String(trackableUrl || '').trim();
  if (!href) return '';
  const escaped = href.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `<!-- Planeje pixel: cookies de campanha (7 dias) + injeta no link /r/ — não é pixel Meta -->
<script>
(function () {
  var PLANEJE_LINK = '${escaped}';
  var DAYS = 7;
  var KEYS = ['gclid','fbclid','utm_source','utm_medium','utm_campaign','utm_content','utm_term'];
  var COOKIE = 'planeje_trk';

  function readCookie() {
    try {
      var m = document.cookie.match(new RegExp('(?:^|; )' + COOKIE + '=([^;]*)'));
      return m ? JSON.parse(decodeURIComponent(m[1])) : {};
    } catch (e) { return {}; }
  }
  function writeCookie(obj) {
    var exp = new Date(Date.now() + DAYS * 864e5).toUTCString();
    document.cookie = COOKIE + '=' + encodeURIComponent(JSON.stringify(obj))
      + '; expires=' + exp + '; path=/; SameSite=Lax';
  }
  function captureFromUrl() {
    var q = new URLSearchParams(location.search);
    var cur = readCookie();
    var changed = false;
    KEYS.forEach(function (k) {
      var v = q.get(k);
      if (v) { cur[k] = v; changed = true; }
    });
    if (changed) writeCookie(cur);
  }
  function withCookies(url) {
    try {
      var u = new URL(url, location.href);
      var cur = readCookie();
      KEYS.forEach(function (k) {
        if (cur[k] && !u.searchParams.get(k)) u.searchParams.set(k, cur[k]);
      });
      return u.toString();
    } catch (e) { return url; }
  }
  function isWa(u) {
    try {
      if (String(u).indexOf('whatsapp://') === 0) return true;
      var h = new URL(u, location.href).hostname.toLowerCase();
      return h === 'wa.me' || h === 'api.whatsapp.com' || h === 'web.whatsapp.com';
    } catch (e) { return false; }
  }
  function isPlanejeTrack(u) {
    try {
      var x = new URL(u, location.href);
      return /\\/r\\/[A-Za-z0-9_-]+/.test(x.pathname);
    } catch (e) { return false; }
  }
  function enhance() {
    document.querySelectorAll('a[href]').forEach(function (a) {
      var href = a.getAttribute('href') || '';
      if (isWa(href)) {
        a.setAttribute('href', withCookies(PLANEJE_LINK));
      } else if (isPlanejeTrack(href)) {
        a.setAttribute('href', withCookies(href));
      }
    });
  }
  document.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (isWa(href)) {
      a.setAttribute('href', withCookies(PLANEJE_LINK));
    } else if (isPlanejeTrack(href)) {
      a.setAttribute('href', withCookies(href));
    }
  }, true);

  captureFromUrl();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhance);
  else enhance();
})();
</script>`;
}

/** Alias semântico: o “pixel” do site é o script de cookies + injeção. */
export function sitePlanejePixelScript(trackableUrl) {
  return siteWhatsappRewriteScript(trackableUrl);
}

export function trackingFromMatchedClick(click, { keepExisting = null } = {}) {
  const base =
    keepExisting && typeof keepExisting === 'object' ? { ...keepExisting } : {};
  const next = { ...base };
  if (click?.gclid) next.gclid = click.gclid;
  if (click?.fbclid) next.fbclid = click.fbclid;
  if (click?.utm_source) next.utm_source = click.utm_source;
  if (click?.utm_medium) next.utm_medium = click.utm_medium;
  if (click?.utm_campaign) next.utm_campaign = click.utm_campaign;
  if (click?.utm_content) next.utm_content = click.utm_content;
  if (click?.utm_term) next.utm_term = click.utm_term;
  if (click?.match_code) next.planeje_match_code = click.match_code;
  if (click?.id) next.planeje_click_id = click.id;
  if (click?.link_id) next.planeje_link_id = click.link_id;
  next.planeje_link_origin = click?.origin_resolved || 'site';
  if (click?.link_attribution != null) next.planeje_link_attribution = linkAttributionSnapshot(click.link_attribution);
  return next;
}

export function originLabel(originSource, { ctwa = false } = {}) {
  if (originSource === 'google_ads') return 'Google Ads';
  if (originSource === 'site') return 'Site';
  if (originSource === 'meta_ads') return ctwa ? 'Meta Ads' : 'Meta Ads';
  return 'Não rastreada';
}

/** Nome de apresentação do tráfego de site; não altera a atribuição registrada. */
export function siteOriginLabel(...utmSources) {
  return utmSources.find((value) => typeof value === 'string' && value.trim())?.trim() || 'Site';
}

/** Evidência registrada prevalece sobre sinais de uma campanha posterior. */
export function recordedOriginSource(row, lead = false) {
  const origins = ['google_ads', 'meta_ads', 'site'];
  let origin = origins.includes(row?.origin_source) ? row.origin_source : row?.tracking_data?.planeje_link_origin;
  const legacy = String(row?.origem || '').trim().toLowerCase();
  if (lead && !origins.includes(origin)) {
    if (legacy === 'site') origin = 'site';
    else if (['google', 'google ads', 'google_ads'].includes(legacy)) origin = 'google_ads';
    else if (['meta', 'meta ads'].includes(legacy)) origin = 'meta_ads';
  }
  const tracking = row?.tracking_data || {};
  const fromLink = Boolean(tracking.planeje_link_id || tracking.planeje_match_code);
  const source = siteOriginLabel(row?.utm_source, tracking.utm_source).toLowerCase();
  // O snapshot do link preserva sua origem; a UTM Linktree sozinha não comprova site.
  if (fromLink && source === 'linktree' && origin !== 'google_ads') {
    if (tracking.gclid != null && String(tracking.gclid).trim()) return 'google_ads';
    if (!hasCtwaTrackingSignal(tracking) && ['meta_ads', 'site'].includes(tracking.planeje_link_origin)) return tracking.planeje_link_origin;
  }
  if (origins.includes(origin)) return origin;
  return '';
}

export function isGoogleAdsContactForStats(c) {
  if (!c) return false;
  const origin = recordedOriginSource(c);
  if (origin) return origin === 'google_ads';
  const td = c.tracking_data;
  if (td && typeof td === 'object' && td.gclid != null && String(td.gclid).trim()) return true;
  return utmSuggests(GOOGLE_UTM, c.utm_source) || utmSuggests(GOOGLE_UTM, td?.utm_source);
}

export function isSiteContactForStats(c) {
  if (!c) return false;
  return recordedOriginSource(c) === 'site';
}
