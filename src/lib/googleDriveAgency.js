import { previewSecret } from './metaAgencyToken.js';

export const GOOGLE_DRIVE_CLIENT_ID_SECRET = 'GOOGLE_DRIVE_CLIENT_ID';
export const GOOGLE_DRIVE_CLIENT_SECRET_SECRET = 'GOOGLE_DRIVE_CLIENT_SECRET';
export const GOOGLE_DRIVE_APP_ORIGIN_SECRET = 'GOOGLE_DRIVE_APP_ORIGIN';
export const GOOGLE_DRIVE_SETTINGS_PATH = '/settings/google-drive';

export const OAUTH_NOT_CONFIGURED_MESSAGE =
  'Cole o Client ID e o Secret em Configurações → Google Drive da agência.';

export const GOOGLE_DRIVE_PUBLIC_ORIGIN = 'https://planeje.jbapex.com.br';

export function defaultGoogleDriveRedirectUri(supabaseUrl) {
  const base = String(supabaseUrl || '').replace(/\/$/, '');
  if (!base) return '';
  return `${base}/functions/v1/google-drive-api`;
}

export function sanitizeGoogleDriveRedirectUri(uri, supabaseUrl) {
  const raw = String(uri || '').trim();
  const fallback = defaultGoogleDriveRedirectUri(supabaseUrl);
  if (!raw) return fallback;
  try {
    const parsed = new URL(raw);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '') || fallback;
  } catch {
    return fallback;
  }
}

export function isPublicHttpsGoogleRedirect(uri) {
  try {
    const parsed = new URL(String(uri || '').trim());
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (!host.includes('.')) return false;
    if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
    if (host === 'api-gw' || host.startsWith('api-gw.') || host.includes('kong')) return false;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

export function originToDriveRedirect(origin) {
  const raw = String(origin || '').trim();
  if (!raw) return '';
  try {
    return `${new URL(raw).origin}/functions/v1/google-drive-api`;
  } catch {
    return '';
  }
}

export function resolveGoogleDriveRedirectUri({
  explicitUri,
  appOrigin,
  supabaseUrl,
  publicFallback = GOOGLE_DRIVE_PUBLIC_ORIGIN,
} = {}) {
  const candidates = [
    sanitizeGoogleDriveRedirectUri(explicitUri, publicFallback),
    originToDriveRedirect(appOrigin),
    defaultGoogleDriveRedirectUri(supabaseUrl),
    defaultGoogleDriveRedirectUri(publicFallback),
  ];
  for (const uri of candidates) {
    if (uri && isPublicHttpsGoogleRedirect(uri)) return uri;
  }
  return defaultGoogleDriveRedirectUri(publicFallback);
}

export function looksLikeGoogleClientId(value) {
  const id = String(value || '').trim();
  if (!id) return false;
  return /\.apps\.googleusercontent\.com$/i.test(id);
}

export function summarizeGoogleDriveOAuth(data, supabaseUrl) {
  const payload = data && typeof data === 'object' ? data : {};
  const redirectUri = resolveGoogleDriveRedirectUri({
    explicitUri: payload.redirectUri || payload.redirect_uri,
    appOrigin: payload.appOrigin,
    supabaseUrl,
  });
  const oauthConfigured = Boolean(payload.oauthConfigured);
  return {
    oauthConfigured,
    hasClientId: Boolean(payload.hasClientId),
    hasClientSecret: Boolean(payload.hasClientSecret),
    usingAdsFallback: Boolean(payload.usingAdsFallback),
    redirectUri,
    appOrigin: String(payload.appOrigin || '').trim(),
    settingsPath: payload.settingsPath || GOOGLE_DRIVE_SETTINGS_PATH,
    error: oauthConfigured ? '' : OAUTH_NOT_CONFIGURED_MESSAGE,
  };
}

export function googleDriveOAuthErrorMessage(error) {
  const message = String(error?.message || error || '').trim();
  if (!message) return OAUTH_NOT_CONFIGURED_MESSAGE;
  if (/GOOGLE_DRIVE_CLIENT|GOOGLE_ADS_CLIENT|secrets do Supabase|não configurado/i.test(message)) {
    return OAUTH_NOT_CONFIGURED_MESSAGE;
  }
  return message;
}

export { previewSecret };
