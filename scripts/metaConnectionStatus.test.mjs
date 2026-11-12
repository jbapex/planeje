import assert from 'node:assert/strict';
import {
  metaConnectionFromCheckResponse,
  overviewMetaBanner,
} from '../src/lib/metaConnectionStatus.js';

function testLateSuccessStillApplies() {
  const ignored = metaConnectionFromCheckResponse({
    discarded: true,
    data: { connected: true },
  });
  assert.equal(ignored.apply, false);
  const late = metaConnectionFromCheckResponse({
    discarded: false,
    data: { connected: true },
  });
  assert.deepEqual(late, { apply: true, status: 'connected' });
}

function testTimeoutMustNotInventDisconnected() {
  const timeout = metaConnectionFromCheckResponse({ discarded: true, error: true });
  assert.equal(timeout.apply, false);
}

function testGraphErrorIsDisconnected() {
  const next = metaConnectionFromCheckResponse({
    data: { connected: false, error: { message: 'Invalid OAuth' } },
  });
  assert.deepEqual(next, { apply: true, status: 'disconnected' });
}

function testAppRateLimitIsLimitedNotDisconnected() {
  const next = metaConnectionFromCheckResponse({
    data: {
      connected: false,
      error: {
        message: '(#4) Application request limit reached',
        type: 'OAuthException',
        code: 4,
      },
    },
  });
  assert.deepEqual(next, { apply: true, status: 'limited' });
}

function testBannerDoesNotSayDisconnectedWhileChecking() {
  assert.match(overviewMetaBanner('checking'), /Conferindo/);
  assert.doesNotMatch(overviewMetaBanner('checking'), /não está conectada/i);
  assert.match(overviewMetaBanner('limited'), /última atualização salva/);
  assert.match(overviewMetaBanner('disconnected'), /última atualização salva/);
  assert.equal(overviewMetaBanner('connected'), null);
}

testLateSuccessStillApplies();
testTimeoutMustNotInventDisconnected();
testGraphErrorIsDisconnected();
testAppRateLimitIsLimitedNotDisconnected();
testBannerDoesNotSayDisconnectedWhileChecking();
console.log('metaConnectionStatus.test.mjs ok');
