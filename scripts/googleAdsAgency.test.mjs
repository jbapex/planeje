import assert from 'node:assert/strict';
import {
  buildGoogleAdsAuthUrl,
  cleanLoginCustomerId,
  extractOauthCodeFromInput,
  googleAdsCredentialsMissingMessage,
  looksLikeGoogleClientId,
  looksLikeRefreshToken,
  summarizeGoogleAdsConnection,
} from '../src/lib/googleAdsAgency.js';

assert.equal(cleanLoginCustomerId('123-456-7890'), '1234567890');
assert.equal(looksLikeGoogleClientId('123-abc.apps.googleusercontent.com'), true);
assert.equal(looksLikeGoogleClientId('not-an-id'), false);

const url = buildGoogleAdsAuthUrl('123-abc.apps.googleusercontent.com');
assert.match(url, /accounts\.google\.com/);
assert.match(url, /adwords/);
assert.match(url, /access_type=offline/);
assert.deepEqual(new URL(url).searchParams.get('scope').split(' ').sort(), [
  'https://www.googleapis.com/auth/adwords',
  'https://www.googleapis.com/auth/datamanager',
]);

assert.equal(
  googleAdsCredentialsMissingMessage({ error: { code: 'CREDENTIALS_MISSING' } }),
  true,
);
assert.equal(googleAdsCredentialsMissingMessage({ error: { message: 'outro' } }), false);

const summary = summarizeGoogleAdsConnection(
  { connected: true },
  { customers: [{ id: '1', name: 'A' }] },
);
assert.equal(summary.readyToLink, true);
assert.equal(summary.customersCount, 1);

assert.equal(
  extractOauthCodeFromInput(
    'http://127.0.0.1:8080/?iss=https://accounts.google.com&code=4/0ATsMZqTESTCODE&scope=https://www.googleapis.com/auth/adwords',
  ),
  '4/0ATsMZqTESTCODE',
);
assert.equal(extractOauthCodeFromInput('4/0ATsMZqTESTCODE'), '4/0ATsMZqTESTCODE');
assert.equal(extractOauthCodeFromInput('1//0gRefresh'), '');
assert.equal(looksLikeRefreshToken('1//0gRefresh'), true);
assert.equal(looksLikeRefreshToken('4/0ATsMZ'), false);

console.log('googleAdsAgency.test.mjs ok');
