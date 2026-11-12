import assert from 'node:assert/strict';
import {
  combineLocalDateAndTime,
  composerChannelName,
  composerPublicationFormat,
  composerTaskStatus,
  composerTaskType,
  composeDispatchPayload,
  describeScheduleSaveError,
  futureScheduleAt,
  localDateTimeInputValue,
  parseLocalDateTimeInput,
  resetDispatchForRetry,
  carouselChildrenFromSlides,
  scheduleRequiresDrive,
  scheduledDayParts,
  scheduledTaskPayload,
} from '../src/lib/scheduleSocialComposer.js';

assert.equal(composerTaskType('REELS', true), 'reels');
assert.equal(composerTaskType('IMAGE', true), 'post');
assert.equal(composerTaskType('IMAGE', false), 'post');
assert.equal(composerPublicationFormat('REELS'), 'Reels');
assert.equal(composerChannelName(true), 'Instagram');
assert.equal(composerChannelName(false), 'Facebook');
assert.equal(scheduleRequiresDrive({ driveFileId: 'abc' }), true);
assert.equal(scheduleRequiresDrive({ publicUrl: 'https://x' }), false);
assert.equal(carouselChildrenFromSlides([{ publicUrl: 'https://cdn/a.jpg' }]), null);
const children = carouselChildrenFromSlides([
  { publicUrl: 'https://cdn/a.jpg', kind: 'image' },
  { publicUrl: 'https://cdn/b.mp4', kind: 'video' },
]);
assert.deepEqual(children, [
  { image_url: 'https://cdn/a.jpg' },
  { video_url: 'https://cdn/b.mp4' },
]);
assert.equal(carouselChildrenFromSlides([
  { publicUrl: 'blob:local', kind: 'image' },
  { publicUrl: 'https://cdn/b.jpg', kind: 'image' },
]), null);
const kept = resetDispatchForRetry({
  igFormat: 'CAROUSEL',
  children,
  creation_id: 'old',
  phase: 'failed',
});
assert.deepEqual(kept.children, children);
assert.equal(kept.creation_id, undefined);

const when = scheduledDayParts(new Date(2026, 8, 21, 9, 0, 0));
assert.equal(when.scheduled_for, '2026-09-21');
assert.match(String(when.scheduled_at), /2026-09-21/);

const dispatch = composeDispatchPayload({
  coverMode: 'frame',
  thumbOffsetMs: 58000,
  igFormat: 'REELS',
  instagramAccountId: '1784',
});
assert.equal(dispatch.hold, true);
assert.equal(dispatch.thumbOffsetMs, 58000);
assert.equal(dispatch.igFormat, 'REELS');

const task = scheduledTaskPayload({
  title: 'Reels IA',
  caption: 'Legenda',
  type: 'reels',
  clientId: 'client-1',
  userId: 'user-1',
  scheduledAt: new Date(2026, 8, 21, 9, 0, 0),
  channel: 'Instagram',
  statusValue: composerTaskStatus(),
});
assert.equal(task.status, 'todo');
assert.equal(task.briefing_completo, false);
assert.equal(task.type, 'reels');
assert.equal(task.due_date, '2026-09-21');
assert.deepEqual(task.assignee_ids, ['user-1']);
assert.deepEqual(task.planned_channels, ['Instagram']);
assert.equal(task.status_history[0].status, 'todo');

const past = new Date(Date.now() - 60 * 60 * 1000);
assert.equal(futureScheduleAt(past).getTime() > Date.now(), true);
assert.match(describeScheduleSaveError(new Error('Anexe o conteúdo produzido antes de enviar o material para revisão.')), /guardar o agendamento/i);

const cleaned = resetDispatchForRetry({
  hold: true,
  phase: 'failed',
  creation_id: '18620177962034574',
  uri: 'https://rupload.facebook.com/ig-api-upload/v26.0/x',
  offset: 79691776,
  attempts: 10,
  last_error: 'A Meta recusou o vídeo.',
  coverMode: 'frame',
  thumbOffsetMs: 1000,
  igFormat: 'REELS',
  instagramAccountId: '17841401037217737',
});
assert.equal(cleaned.phase, undefined);
assert.equal(cleaned.creation_id, undefined);
assert.equal(cleaned.offset, undefined);
assert.equal(cleaned.coverMode, 'frame');
assert.equal(cleaned.thumbOffsetMs, 1000);
assert.equal(cleaned.igFormat, 'REELS');
assert.equal(cleaned.hold, true);
const ahead = new Date(Date.now() + 3 * 60 * 60 * 1000);
ahead.setSeconds(0, 0);
assert.match(localDateTimeInputValue(ahead), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
assert.equal(parseLocalDateTimeInput('2026-09-21T18:00').getHours(), 18);
assert.equal(combineLocalDateAndTime('2026-09-21', '18:00'), '2026-09-21T18:00');
assert.equal(combineLocalDateAndTime('', '18:00'), '');

console.log('scheduleSocialComposer.test.mjs PASS');
