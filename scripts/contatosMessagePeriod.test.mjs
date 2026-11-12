import assert from 'node:assert/strict';
import {
  MESSAGE_PERIOD_PRESETS,
  isoYmdToBrDisplay,
  localDateToIsoYmd,
  matchMessagePeriodPreset,
  messagePeriodIso,
  messagePeriodTriggerLabel,
} from '../src/lib/contatosMessagePeriod.js';

const now = new Date(2026, 8, 19, 15, 40, 0);

assert.equal(isoYmdToBrDisplay('2026-09-19'), '19/09/2026');
assert.equal(localDateToIsoYmd(now), '2026-09-19');

assert.deepEqual(
  MESSAGE_PERIOD_PRESETS.map((p) => p.id),
  ['hoje', 'ontem', '7d', '15d', '30d', 'mes', 'mes-passado']
);

assert.deepEqual(messagePeriodIso('hoje', now), { from: '2026-09-19', to: '2026-09-19' });
assert.deepEqual(messagePeriodIso('ontem', now), { from: '2026-09-18', to: '2026-09-18' });
assert.deepEqual(messagePeriodIso('7d', now), { from: '2026-09-13', to: '2026-09-19' });
assert.deepEqual(messagePeriodIso('15d', now), { from: '2026-09-05', to: '2026-09-19' });
assert.deepEqual(messagePeriodIso('30d', now), { from: '2026-08-21', to: '2026-09-19' });
assert.deepEqual(messagePeriodIso('mes', now), { from: '2026-09-01', to: '2026-09-30' });
assert.deepEqual(messagePeriodIso('mes-passado', now), { from: '2026-08-01', to: '2026-08-31' });

assert.equal(matchMessagePeriodPreset('2026-09-19', '2026-09-19', now)?.id, 'hoje');
assert.equal(matchMessagePeriodPreset('2026-09-13', '2026-09-19', now)?.id, '7d');
assert.equal(matchMessagePeriodPreset('2026-08-01', '2026-08-31', now)?.id, 'mes-passado');
assert.equal(matchMessagePeriodPreset('2026-09-01', '2026-09-10', now), null);

assert.equal(messagePeriodTriggerLabel('', '', now), 'Período');
assert.equal(messagePeriodTriggerLabel('2026-09-19', '2026-09-19', now), 'Hoje');
assert.equal(messagePeriodTriggerLabel('2026-09-01', '2026-09-10', now), '01/09/2026 – 10/09/2026');

console.log('PASS contatos message period');
