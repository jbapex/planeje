import { extractOauthCodeFromInput, looksLikeGoogleClientId, looksLikeRefreshToken, previewSecret } from './googleAdsAgency.js';

export const GOOGLE_DATA_REFRESH_TOKEN_SECRET = 'GOOGLE_DATA_REFRESH_TOKEN';
export const GOOGLE_DATA_SETTINGS_PATH = '/settings/google-dados';
export const GOOGLE_DATA_OAUTH_REDIRECT_URI = 'http://127.0.0.1:8080';

export const GOOGLE_DATA_SCOPES = [
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/business.manage',
  'https://www.googleapis.com/auth/tagmanager.readonly',
  'openid',
  'email',
  'profile',
];

export const GOOGLE_DATA_SCOPE = GOOGLE_DATA_SCOPES.join(' ');

export { extractOauthCodeFromInput, looksLikeGoogleClientId, looksLikeRefreshToken, previewSecret };

export function buildGoogleDataAuthUrl(clientId, redirectUri = GOOGLE_DATA_OAUTH_REDIRECT_URI) {
  const id = String(clientId || '').trim();
  if (!id) return '';
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_DATA_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'false',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function summarizeGoogleDataConnection(checkData) {
  const payload = checkData && typeof checkData === 'object' ? checkData : {};
  const analytics = payload.analytics && typeof payload.analytics === 'object' ? payload.analytics : {};
  const business = payload.business && typeof payload.business === 'object' ? payload.business : {};
  const tagmanager = payload.tagmanager && typeof payload.tagmanager === 'object' ? payload.tagmanager : {};
  const connected = Boolean(payload.connected);
  const error = payload.error?.message || payload.error || '';
  return {
    connected,
    email: String(payload.email || '').trim(),
    analyticsOk: Boolean(analytics.ok),
    businessOk: Boolean(business.ok),
    tagmanagerOk: Boolean(tagmanager.ok),
    analyticsError: String(analytics.error || ''),
    businessError: String(business.error || ''),
    tagmanagerError: String(tagmanager.error || ''),
    error: connected ? '' : String(error || 'Autorize Analytics, Meu Negócio e Tag Manager com o Client ID da agência.'),
    readyToLink: connected && (Boolean(analytics.ok) || Boolean(business.ok) || Boolean(tagmanager.ok)),
  };
}

export function googleDataCredentialsMissingMessage(data) {
  const code = data?.error?.code || data?.error?.message || '';
  return /CREDENTIALS_MISSING|não configurad|GOOGLE_DATA_REFRESH/i.test(String(code));
}
