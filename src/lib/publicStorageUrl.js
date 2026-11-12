/** URLs públicas do Storage no Planeje, sem o host morto do projeto cloud. */

export const PLANEJE_PUBLIC_ORIGIN = 'https://planeje.jbapex.com.br';

const INTERNAL_HOST = /^(api-gw|kong|localhost|127\.0\.0\.1)$/i;

export function publicAppOrigin() {
  try {
    if (typeof window === 'undefined' || !window.location?.hostname) {
      return PLANEJE_PUBLIC_ORIGIN;
    }
    const host = window.location.hostname;
    if (INTERNAL_HOST.test(host)) return PLANEJE_PUBLIC_ORIGIN;
    if (window.location.port === '8000' || window.location.port === '3003') {
      return `${window.location.protocol}//${host}`;
    }
    return window.location.origin;
  } catch {
    return PLANEJE_PUBLIC_ORIGIN;
  }
}

/** Troca supabase.co / api-gw / kong pelo origin do app em arquivos públicos do Storage. */
export function rewritePublicStorageUrl(url) {
  const value = String(url || '').trim();
  if (!value) return value;
  try {
    const parsed = new URL(value);
    if (!/\/storage\/v1\/object\/public\//i.test(parsed.pathname)) return value;
    const host = parsed.hostname.toLowerCase();
    if (!INTERNAL_HOST.test(host) && !host.endsWith('supabase.co')) return value;
    return `${publicAppOrigin()}${parsed.pathname}${parsed.search}`;
  } catch {
    return value;
  }
}

export function rewritePublicStorageUrls(urls) {
  return (Array.isArray(urls) ? urls : [])
    .map((url) => rewritePublicStorageUrl(url))
    .filter(Boolean);
}
