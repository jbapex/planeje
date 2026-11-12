import { previewSecret } from './metaAgencyToken.js';

export const GOOGLE_ADS_DEVELOPER_TOKEN_SECRET = 'GOOGLE_ADS_DEVELOPER_TOKEN';
export const GOOGLE_ADS_CLIENT_ID_SECRET = 'GOOGLE_ADS_CLIENT_ID';
export const GOOGLE_ADS_CLIENT_SECRET_SECRET = 'GOOGLE_ADS_CLIENT_SECRET';
export const GOOGLE_ADS_REFRESH_TOKEN_SECRET = 'GOOGLE_ADS_REFRESH_TOKEN';
export const GOOGLE_ADS_LOGIN_CUSTOMER_ID_SECRET = 'GOOGLE_ADS_LOGIN_CUSTOMER_ID';
export const GOOGLE_DATA_MANAGER_PROJECT_ID_SECRET = 'GOOGLE_DATA_MANAGER_PROJECT_ID';
export const GOOGLE_ADS_SETTINGS_PATH = '/settings/google-ads';

export const GOOGLE_ADS_SECRET_NAMES = [
  GOOGLE_ADS_DEVELOPER_TOKEN_SECRET,
  GOOGLE_ADS_CLIENT_ID_SECRET,
  GOOGLE_ADS_CLIENT_SECRET_SECRET,
  GOOGLE_ADS_REFRESH_TOKEN_SECRET,
  GOOGLE_ADS_LOGIN_CUSTOMER_ID_SECRET,
  GOOGLE_DATA_MANAGER_PROJECT_ID_SECRET,
];

export const GOOGLE_ADS_OAUTH_SCOPE = 'https://www.googleapis.com/auth/adwords https://www.googleapis.com/auth/datamanager';

/** Redirect usado no fluxo de obter refresh token (desktop / script). */
export const GOOGLE_ADS_OAUTH_REDIRECT_URI = 'http://127.0.0.1:8080';

export { previewSecret };

export function looksLikeGoogleClientId(value) {
  const v = String(value || '').trim();
  return v.includes('.apps.googleusercontent.com') || /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/i.test(v);
}

export function cleanLoginCustomerId(value) {
  return String(value || '').replace(/\D/g, '');
}

export function buildGoogleAdsAuthUrl(clientId, redirectUri = GOOGLE_ADS_OAUTH_REDIRECT_URI) {
  const id = String(clientId || '').trim();
  if (!id) return '';
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_ADS_OAUTH_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function summarizeGoogleAdsConnection(checkData, customersData) {
  const connected = Boolean(checkData?.connected);
  const customers = Array.isArray(customersData?.customers) ? customersData.customers : [];
  const error =
    checkData?.error?.message ||
    customersData?.error?.message ||
    (!connected ? 'Credenciais incompletas ou OAuth inválido.' : '');
  return {
    connected,
    customersCount: customers.length,
    error: connected && customers.length === 0 ? customersData?.error?.message || error : error,
    readyToLink: connected && customers.length > 0,
  };
}

export function extractOauthCodeFromInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    if (raw.includes('code=')) {
      const url = raw.includes('://') ? raw : `http://127.0.0.1:8080/${raw.replace(/^\//, '')}`;
      const parsed = new URL(url.includes('://') ? url : `http://dummy/?${raw}`);
      const code = parsed.searchParams.get('code');
      if (code) return code.trim();
    }
  } catch {
    /* fall through */
  }
  const match = raw.match(/(?:^|[?&]code=)(4\/[A-Za-z0-9_-]+)/);
  if (match) return match[1];
  if (/^4\/[A-Za-z0-9_-]+$/.test(raw)) return raw;
  return '';
}

export function looksLikeRefreshToken(value) {
  return /^1\/\//.test(String(value || '').trim());
}

export function looksLikeOauthCode(value) {
  return Boolean(extractOauthCodeFromInput(value));
}

export function googleAdsCredentialsMissingMessage(data) {
  const code = data?.error?.code || data?.error?.message || '';
  return /CREDENTIALS_MISSING|não configurad/i.test(String(code));
}
