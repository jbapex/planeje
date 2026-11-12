import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GOOGLE_DRIVE_SETTINGS_PATH,
  OAUTH_NOT_CONFIGURED_MESSAGE,
  defaultGoogleDriveRedirectUri,
  sanitizeGoogleDriveRedirectUri,
  googleDriveOAuthErrorMessage,
  looksLikeGoogleClientId,
  resolveGoogleDriveRedirectUri,
  summarizeGoogleDriveOAuth,
} from '../src/lib/googleDriveAgency.js';

test('redirect URI aponta para o callback da função', () => {
  assert.equal(
    defaultGoogleDriveRedirectUri('https://planeje.jbapex.com.br/'),
    'https://planeje.jbapex.com.br/functions/v1/google-drive-api',
  );
});

test('client id típico do Google Cloud é reconhecido', () => {
  assert.equal(looksLikeGoogleClientId('123-abc.apps.googleusercontent.com'), true);
  assert.equal(looksLikeGoogleClientId('nao-e-isso'), false);
  assert.equal(looksLikeGoogleClientId(''), false);
});

test('resumo não expõe secret e aponta para a tela de configuração', () => {
  const summary = summarizeGoogleDriveOAuth(
    {
      oauthConfigured: false,
      hasClientId: false,
      hasClientSecret: false,
      clientSecret: 'super-secret-value',
    },
    'https://planeje.jbapex.com.br',
  );
  assert.equal(summary.oauthConfigured, false);
  assert.equal(summary.settingsPath, GOOGLE_DRIVE_SETTINGS_PATH);
  assert.match(summary.error, /Google Drive da agência/);
  assert.equal(JSON.stringify(summary).includes('super-secret-value'), false);
});

test('URI com query do callback antigo é limpa', () => {
  assert.equal(
    sanitizeGoogleDriveRedirectUri(
      'https://planeje.jbapex.com.br/functions/v1/google-drive-api?action=callback',
      'https://planeje.jbapex.com.br',
    ),
    'https://planeje.jbapex.com.br/functions/v1/google-drive-api',
  );
});

test('resumo configurado não inventa erro', () => {
  const summary = summarizeGoogleDriveOAuth(
    {
      oauthConfigured: true,
      hasClientId: true,
      hasClientSecret: true,
      redirectUri: 'https://planeje.jbapex.com.br/functions/v1/google-drive-api?action=callback',
    },
    'https://planeje.jbapex.com.br',
  );
  assert.equal(summary.oauthConfigured, true);
  assert.equal(summary.error, '');
  assert.equal(summary.redirectUri, 'https://planeje.jbapex.com.br/functions/v1/google-drive-api');
});

test('URI interna do edge vira a origem pública HTTPS', () => {
  assert.equal(
    resolveGoogleDriveRedirectUri({
      explicitUri: 'http://api-gw:8000/functions/v1/google-drive-api',
      appOrigin: 'https://planeje.jbapex.com.br',
      supabaseUrl: 'http://api-gw:8000',
    }),
    'https://planeje.jbapex.com.br/functions/v1/google-drive-api',
  );
});

test('erro antigo de secrets vira o texto da tela', () => {
  assert.equal(
    googleDriveOAuthErrorMessage('Configure GOOGLE_DRIVE_CLIENT_ID e GOOGLE_DRIVE_CLIENT_SECRET nos secrets do Supabase.'),
    OAUTH_NOT_CONFIGURED_MESSAGE,
  );
});
