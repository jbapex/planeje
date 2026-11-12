import assert from 'node:assert/strict';
import {
  IG_PREPARE_WINDOW_MS,
  instagramPreparePercent,
  instagramPrepareProgress,
  instagramPrepareStatus,
  shouldPrepareInstagramNow,
} from '../src/lib/igSchedulePrepare.js';

const now = Date.parse('2026-09-21T20:00:00-03:00');

assert.equal(shouldPrepareInstagramNow(new Date(now + 2 * 60 * 60 * 1000), now), true);
assert.equal(shouldPrepareInstagramNow(new Date(now + IG_PREPARE_WINDOW_MS), now), true);
assert.equal(shouldPrepareInstagramNow(new Date(now + IG_PREPARE_WINDOW_MS + 60 * 1000), now), false);
assert.equal(shouldPrepareInstagramNow(new Date(now + 30 * 1000), now), false);
assert.equal(shouldPrepareInstagramNow('nao-e-data', now), false);

assert.equal(instagramPreparePercent(null), 0);
assert.equal(instagramPreparePercent({ offset: 40000000, file_size: 80000000 }), 50);
assert.equal(instagramPreparePercent({ offset: 72000000, file_size: 80000000 }), 90);
assert.equal(instagramPreparePercent({ offset: 80000000, file_size: 80000000 }), 99);

assert.equal(instagramPrepareStatus(null), '');
assert.equal(instagramPrepareStatus({ phase: 'queued' }), 'Na fila para a Meta');
assert.equal(
  instagramPrepareStatus({ phase: 'uploading', offset: 40000000, file_size: 80000000 }),
  'Enviando 50%',
);
assert.equal(instagramPrepareStatus({ phase: 'processing' }), 'A Meta está processando');
assert.equal(instagramPrepareStatus({ phase: 'ready' }), 'Pronto na Meta');

const uploading = instagramPrepareProgress({
  phase: 'uploading',
  offset: 72000000,
  file_size: 80000000,
});
assert.equal(uploading.percent, 90);
assert.equal(uploading.label, 'Enviando 90%');
assert.equal(uploading.showBar, true);
assert.equal(uploading.determinate, true);

const processing = instagramPrepareProgress({ phase: 'processing' });
assert.equal(processing.showBar, true);
assert.equal(processing.determinate, false);

const overdue = instagramPrepareProgress(
  { phase: 'processing' },
  { scheduledAt: '2026-09-21T20:27:00-03:00', now: Date.parse('2026-09-21T22:50:00-03:00') },
);
assert.equal(overdue.overdue, true);
assert.equal(overdue.label, 'Horário passou — Meta ainda processa');
assert.equal(
  instagramPrepareStatus(
    { phase: 'processing' },
    { scheduledAt: '2026-09-21T20:27:00-03:00', now: Date.parse('2026-09-21T22:50:00-03:00') },
  ),
  'Horário passou — Meta ainda processa',
);

const longWait = instagramPrepareProgress(
  { phase: 'processing', processing_since: '2026-09-21T19:00:00-03:00' },
  { scheduledAt: '2026-09-21T23:00:00-03:00', now: Date.parse('2026-09-21T19:20:00-03:00') },
);
assert.equal(longWait.overdue, false);
assert.equal(longWait.label, 'Meta demorando no processamento');

const readyOverdue = instagramPrepareProgress(
  { phase: 'ready' },
  { scheduledAt: '2026-09-21T20:00:00-03:00', now: Date.parse('2026-09-21T20:05:00-03:00') },
);
assert.equal(readyOverdue.label, 'Pronto — publicando na hora');

console.log('igSchedulePrepare.test.mjs ok');
