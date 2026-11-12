import assert from 'node:assert/strict';
import * as frontend from '../src/lib/rastreamentoTrackableLink.js';
import * as edge from '../supabase/functions/_shared/rastreamentoTrackableLink.ts';
import { readChatvoltPayload } from '../supabase/functions/_shared/chatvoltIngress.js';
import { normalizeInboundPayload } from '../supabase/functions/_shared/inboundNormalize.ts';
import { encodeHiddenMatchCode, extractHiddenMatchCode } from '../supabase/functions/_shared/rastreamentoHiddenMatchCode.js';

const greeting = 'Olá! Quero informações sobre este produto. 👩‍💻';
const options = { initialMessage: `${greeting} {codigo_oculto}`, appendMatchCode: false };
const code = 'PJ-ABC234';
assert.equal(typeof frontend.setHiddenMatchCode, 'function', 'form can opt into hidden identification without duplicating its marker');
const template = frontend.setHiddenMatchCode(greeting, true);
assert.equal(template, `${greeting} {codigo_oculto}`);
assert.equal(frontend.setHiddenMatchCode(template, true), template);
assert.equal(frontend.setHiddenMatchCode(`${greeting} {CODIGO_OCULTO} {codigo_oculto}`, true), template);
assert.equal(frontend.setHiddenMatchCode(template, false), greeting);
assert.equal(frontend.setHiddenMatchCode('', true), '{codigo_oculto}');
assert.equal(frontend.setHiddenMatchCode(null, false), '');
assert.equal(frontend.extractMatchCode(frontend.buildWaMeMessageText(code, {initialMessage:template,appendMatchCode:false})), code);
const visibleText = text => text.replace(/[\u200c\u2060]/g, '').trim();
const fixedBits = '01010000 01001010 00101101 01000001 01000010 01000011 00110010 00110011 00110100';
const frame = '\u2060'.repeat(6);
const fixed = frame + fixedBits.replaceAll(' ', '').replaceAll('0', '\u200c').replaceAll('1', '\u2060') + frame;
assert.equal(encodeHiddenMatchCode(code), fixed, 'ASCII fixture fixes the wire format independently of roundtrip');
assert.equal(extractHiddenMatchCode(fixed), code);
assert.equal(encodeHiddenMatchCode(' pj-abc234 '), fixed);
assert.equal(fixed.length, 84);
for (const value of ['', null, 'PJ-ABC23', 'PJ-ABC2345', 'QJ-ABC234', 'PJ-ABC23💻']) {
  assert.equal(encodeHiddenMatchCode(value), '');
}

const other = encodeHiddenMatchCode('PJ-XYZ789');
for (const helper of [frontend, edge]) {
  for (const invalid of [null, '', greeting, 'Oi 👩‍💻 ❤️', '\u200c'.repeat(128) + '\u2060'.repeat(35),
    fixed.slice(1), fixed.slice(0, -1), fixed.slice(0, 40) + '\u200c' + fixed.slice(40),
    fixed.slice(0, 6) + '\u2060' + fixed.slice(7), `${fixed} texto ${other}`, `${fixed} PJ-XYZ789`,
    `${fixed} texto ${other.slice(1)}`, `${other} texto ${fixed.slice(1)}`,
    `${fixed} texto ${other.slice(0, -1)}`]) {
    assert.equal(helper.extractMatchCode(invalid), null, 'invalid, foreign and ambiguous formats cannot attribute');
  }
  assert.equal(helper.extractMatchCode(`Oi ${fixed} texto ${fixed}`), code);
  assert.equal(helper.extractMatchCode(`PJ-ABC234 ${fixed}`), code);
  assert.equal(helper.extractMatchCode('Código pj-abc234'), code);
  assert.equal(helper.extractMatchCode('PJ-ABC234 PJ-XYZ789'), code, 'legacy visible precedence stays unchanged');
  assert.equal(helper.buildWaMeMessageText(code, { initialMessage: greeting, appendMatchCode: false }), greeting);
  assert.equal(helper.buildWaMeMessageText(code, { initialMessage: greeting }), `${greeting}\n\nCódigo ${code}`);
  assert.equal(helper.buildWaMeMessageText(code, { initialMessage: 'Código {codigo}' }), `Código ${code}`);
  assert.equal(helper.buildWaMeMessageText(code), `Olá! Código ${code}`);
  assert.equal(helper.buildWaMeMessageText('', { initialMessage: '{codigo_oculto}' }), 'Olá!');
  assert.equal(helper.buildWaMeMessageText('invalid', options), greeting);
  assert.equal(helper.buildWaMeMessageText(code, { ...options, appendMatchCode: true }), greeting + fixed,
    'explicit hidden marker overrides the visible-code checkbox');
  assert.equal(helper.buildWaMeMessageText(code, { initialMessage: '{CODIGO_OCULTO} {codigo_oculto}' }), 'Olá!' + fixed);
  for (const legacy of ['PJ-XYZ789', '{codigo}']) {
    const text = helper.buildWaMeMessageText(code, { initialMessage: `${greeting} ${legacy} {codigo_oculto}` });
    assert.equal(visibleText(text), greeting, 'hidden opt-in removes legacy visible tokens');
    assert.equal(helper.extractMatchCode(text), code);
  }
}

for (const helper of [frontend, edge]) {
  const message = helper.buildWaMeMessageText(code, options);
  assert.equal(visibleText(message), greeting, 'opt-in keeps the greeting legible without a marker or code');
  assert.equal(helper.extractMatchCode(message), code);
  assert.equal(message.includes(code), false);
  for (const openMode of ['auto', 'app', 'web']) {
    const url = helper.buildWaMeRedirectUrl('5511000000001', code, { ...options, openMode });
    const decoded = new URL(url).searchParams.get('text');
    const body = JSON.parse(JSON.stringify({ eventType: 'USER_MESSAGE_RECEIVED', userPhoneNumber: '5511000000002',
      userMessage: decoded, messageId: 'fixture-hidden', channel: 'whatsapp' }));
    assert.equal(helper.extractMatchCode(readChatvoltPayload(body).messageText), code);
    const inbound = normalizeInboundPayload(body);
    assert.equal(inbound.format, 'chatvolt');
    assert.equal(inbound.fromMe, false);
    assert.equal(helper.extractMatchCode(inbound.messageText), code);
  }
}

console.log('PASS hidden match code: message, URL, Chatvolt and normalization');
