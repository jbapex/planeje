import assert from 'node:assert/strict';
import {
  dateOnlyInSaoPaulo,
  defaultRastreamentoPeriod,
  periodBoundsSaoPaulo,
  readRastreamentoPeriod,
  timestampInSaoPauloRange,
  writeRastreamentoPeriod,
  ymdInSaoPaulo,
} from '../src/lib/rastreamentoPeriod.js';

assert.equal(dateOnlyInSaoPaulo(new Date('2026-09-19T15:00:00.000-03:00')), '2026-09-19');
assert.equal(ymdInSaoPaulo('2026-09-19T22:10:00.000-03:00'), '2026-09-19');
assert.equal(ymdInSaoPaulo('2026-09-20T01:10:00.000Z'), '2026-09-19');

const bounds = periodBoundsSaoPaulo('2026-09-19', '2026-09-19');
assert.equal(bounds.sinceIso, '2026-09-19T00:00:00.000-03:00');
assert.equal(bounds.untilIso, '2026-09-19T23:59:59.999-03:00');

const start = Date.parse(bounds.sinceIso);
const end = Date.parse(bounds.untilIso);
assert.equal(timestampInSaoPauloRange(Date.parse('2026-09-19T08:35:00.000-03:00'), '2026-09-19', '2026-09-19'), true);
assert.equal(timestampInSaoPauloRange(Date.parse('2026-09-18T23:50:00.000-03:00'), '2026-09-19', '2026-09-19'), false);
assert.equal(timestampInSaoPauloRange(Date.parse('2026-09-20T00:10:00.000-03:00'), '2026-09-19', '2026-09-19'), false);
assert.equal(timestampInSaoPauloRange(start, '2026-09-19', '2026-09-19'), true);
assert.equal(timestampInSaoPauloRange(end, '2026-09-19', '2026-09-19'), true);
assert.equal(timestampInSaoPauloRange(start, '', ''), true);

const period = defaultRastreamentoPeriod(new Date('2026-09-19T15:00:00.000-03:00'));
assert.equal(period.until, '2026-09-19');
assert.equal(period.since, '2026-09-13');

const fromUrl = readRastreamentoPeriod(new URLSearchParams('de=2026-09-19&ate=2026-09-19'));
assert.deepEqual(fromUrl, { since: '2026-09-19', until: '2026-09-19' });
const written = writeRastreamentoPeriod(new URLSearchParams('aba=leads'), {
  since: '2026-09-19',
  until: '2026-09-19',
});
assert.equal(written.get('aba'), 'leads');
assert.equal(written.get('de'), '2026-09-19');
assert.equal(written.get('ate'), '2026-09-19');

console.log('PASS rastreamento period');
