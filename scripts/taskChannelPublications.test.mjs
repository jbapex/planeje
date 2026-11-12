import assert from 'node:assert/strict';
import {
  assetUrlFromTaskMedia,
  attachmentBlocksMetaSend,
  attachmentExceedsMetaStage,
  buildPublicationPayload,
  checkTaskPublicationCompletion,
  contentSocialArchiveBlockers,
  clientPostsFields,
  manualPublishedFields,
  createEmptyPublication,
  defaultMetaChannels,
  defaultPublicationChannels,
  defaultPublicationDate,
  fallbackPublicationDestination,
  destinationForChannel,
  displayPublicationWhen,
  firstAssigneeId,
  getPublicationProgress,
  hydratePublicationMedia,
  mediaForChannel,
  metaScheduleAt,
  preferredTaskMedia,
  publicationToSocialTask,
  remainingPublicationChannels,
  splitScheduledDateTime,
  combineScheduledDateTime,
  validatePublication,
} from '../src/lib/taskChannelPublications.js';

const taskId = '00000000-0000-4000-8000-000000000001';
const assigneeId = '00000000-0000-4000-8000-000000000002';

const empty = createEmptyPublication(taskId, assigneeId);
assert.deepEqual(validatePublication(buildPublicationPayload(empty, taskId)), [
  'Escolha o canal.',
  'Informe o perfil, página ou destino.',
  'Escolha a data e o horário da postagem.',
]);

const published = buildPublicationPayload({
  ...empty,
  channel: 'Instagram',
  destination: '@cliente',
  scheduled_for: '2026-09-20',
  status: 'published',
  published_on: '2026-09-20',
  evidence_url: 'https://instagram.com/p/example',
  material_version: '2',
}, taskId);
assert.deepEqual(validatePublication(published), []);
assert.equal(published.material_version, 2);

assert.deepEqual(getPublicationProgress([
  { status: 'published' },
  { status: 'pending' },
  { status: 'cancelled' },
]), { published: 1, total: 2, complete: false });

const socialTask = publicationToSocialTask({
  id: 'pub-1',
  task_id: taskId,
  channel: 'YouTube',
  status: 'scheduled',
  scheduled_for: '2026-09-21',
  assignee_id: assigneeId,
  task: { id: taskId, title: 'Vídeo institucional', client_id: 'client-1' },
});
assert.equal(socialTask.title, 'YouTube · Vídeo institucional');
assert.equal(socialTask.status, 'publication_scheduled');
assert.equal(socialTask.post_date, '2026-09-21');
assert.deepEqual(socialTask.assignee_ids, [assigneeId]);
assert.equal(socialTask.parentTask.id, taskId);

const queryRows = [
  { id: 'one', status: 'published' },
  { id: 'two', status: 'pending' },
];
const fakeClient = {
  from() {
    return {
      select() { return this; },
      eq() { return Promise.resolve({ data: queryRows, error: null }); },
    };
  },
};
const completion = await checkTaskPublicationCompletion(fakeClient, taskId, 'published');
assert.equal(completion.hasPublications, true);
assert.deepEqual(completion.blocking, [queryRows[1]]);

assert.deepEqual(contentSocialArchiveBlockers([]), [
  'Cadastre as publicações por canal e cole o link de cada uma publicada. Se o cliente posta, marque Cliente publica.',
]);
assert.deepEqual(contentSocialArchiveBlockers([], { clientPosts: true }), []);
assert.deepEqual(contentSocialArchiveBlockers([
  { channel: 'Instagram', status: 'published', evidence_url: 'https://instagram.com/p/ok' },
  { channel: 'Facebook', status: 'cancelled', evidence_url: '' },
]), []);
assert.deepEqual(contentSocialArchiveBlockers([
  { channel: 'Instagram', status: 'client_posts', evidence_url: '' },
]), []);
assert.ok(contentSocialArchiveBlockers([
  { channel: 'Instagram', status: 'pending', evidence_url: '' },
]).some((item) => item.includes('Instagram')));
assert.ok(contentSocialArchiveBlockers([
  { channel: 'Facebook', status: 'published', evidence_url: 'não é link' },
]).some((item) => item.includes('link')));
assert.equal(clientPostsFields({ scheduled_for: '2026-10-08' }).patch.status, 'client_posts');
assert.equal(clientPostsFields({ scheduled_for: '2026-10-08' }).patch.published_on, '2026-10-08');

const marked = manualPublishedFields({
  evidence_url: 'https://instagram.com/reel/abc',
  scheduled_for: '2026-09-25',
});
assert.equal(marked.ok, true);
assert.equal(marked.patch.status, 'published');
assert.equal(marked.patch.published_on, '2026-09-25');
assert.equal(manualPublishedFields({ evidence_url: 'arquivo.mp4' }).ok, false);
assert.equal(fallbackPublicationDestination('', 'Instagram'), 'Instagram');
assert.equal(fallbackPublicationDestination('  @loja  ', 'Instagram'), '@loja');
assert.equal(defaultPublicationDate({ post_date: '2026-09-09', due_date: '2026-09-01' }), '2026-09-09');

assert.equal(firstAssigneeId({ assignee_ids: [assigneeId] }), assigneeId);
assert.equal(defaultPublicationDate({ post_date: '2026-09-19', due_date: '2026-09-20' }), '2026-09-19');
assert.equal(
  destinationForChannel('Instagram', [{ platform: 'instagram', username: 'apicenoivas' }]),
  '@apicenoivas',
);
assert.deepEqual(
  defaultMetaChannels({
    plannedChannels: ['Instagram', 'Facebook'],
    accounts: [{ platform: 'instagram', username: 'apicenoivas' }],
  }),
  ['Instagram'],
);
assert.deepEqual(
  defaultPublicationChannels({
    plannedChannels: ['Instagram', 'TikTok'],
    accounts: [{ platform: 'instagram', username: 'apicenoivas' }],
  }),
  ['Instagram', 'TikTok'],
);

const driveClip = {
  id: 'att-1',
  provider: 'google_drive',
  external_file_id: '1DriveFileIdABC',
  name: 'corte.mp4',
  source_url: 'https://drive.google.com/file/d/1DriveFileIdABC/view',
  mime_type: 'video/mp4',
  size_bytes: 12 * 1024 * 1024,
};
assert.equal(preferredTaskMedia([driveClip]).id, 'att-1');
assert.match(assetUrlFromTaskMedia(driveClip), /1DriveFileIdABC/);
assert.equal(attachmentExceedsMetaStage(driveClip), false);
assert.equal(attachmentExceedsMetaStage({ ...driveClip, size_bytes: 80 * 1024 * 1024 }), true);
assert.equal(attachmentBlocksMetaSend({ ...driveClip, size_bytes: 80 * 1024 * 1024 }), false);
assert.equal(attachmentBlocksMetaSend({
  name: 'arte.PNG',
  mime_type: 'image/png',
  size_bytes: 2 * 1024 * 1024,
}), false);
assert.equal(attachmentBlocksMetaSend({
  name: 'arte.PNG',
  mime_type: 'image/png',
  size_bytes: 12 * 1024 * 1024,
}), true);

const pngOnTask = {
  id: 'att-png',
  provider: 'google_drive',
  publication_id: 'pub-1',
  external_file_id: '1PngFileIdXYZ12',
  name: 'DD46E7E7-7886-4D26-B8E6-CD86374A4EB7C.PNG',
  mime_type: 'image/png',
  source_url: 'https://drive.google.com/file/d/1PngFileIdXYZ12/view',
};
const hydratedPng = hydratePublicationMedia({
  id: 'pub-1',
  channel: 'Instagram',
  asset_url: '',
}, pngOnTask);
assert.match(hydratedPng.asset_url, /1PngFileIdXYZ12/);
assert.equal(hydratedPng.external_file_id, '1PngFileIdXYZ12');
assert.equal(hydratedPng.mime_type, 'image/png');

const scheduled = metaScheduleAt('2099-01-15', new Date('2099-01-01T08:00:00'));
assert.equal(scheduled.getFullYear(), 2099);
assert.equal(scheduled.getMonth(), 0);
assert.equal(scheduled.getDate(), 15);
assert.equal(scheduled.getHours(), 10);

const evening = metaScheduleAt('2099-01-15T18:30', new Date('2099-01-01T08:00:00'));
assert.equal(evening.getHours(), 18);
assert.equal(evening.getMinutes(), 30);

const combined = combineScheduledDateTime('2026-09-20', '14:45');
assert.equal(combined.scheduled_for, '2026-09-20');
assert.equal(combined.local, '2026-09-20T14:45');
assert.match(combined.scheduled_at, /2026-09-20|2026-09-19/);

const split = splitScheduledDateTime({ scheduled_at: combined.scheduled_at, scheduled_for: '2026-09-20' });
assert.equal(split.date, '2026-09-20');
assert.equal(split.time, '14:45');
assert.match(displayPublicationWhen({ scheduled_at: combined.scheduled_at }), /20\/09\/2026|09\/20\/2026/);

const igClip = { ...driveClip, id: 'att-ig', publication_id: 'pub-ig' };
const tiktokClip = { ...driveClip, id: 'att-tt', publication_id: 'pub-tt', name: 'tiktok.mp4', external_file_id: '1TikTokFile' };
assert.equal(
  mediaForChannel('Instagram', {
    attachments: [igClip, tiktokClip],
    publications: [{ id: 'pub-ig', channel: 'Instagram', status: 'pending' }],
  }).id,
  'att-ig',
);
assert.equal(
  mediaForChannel('TikTok', {
    attachments: [igClip, tiktokClip],
    publications: [{ id: 'pub-tt', channel: 'TikTok', status: 'pending' }],
  }).id,
  'att-tt',
);
assert.equal(
  remainingPublicationChannels({
    plannedChannels: ['Instagram', 'TikTok'],
    publications: [{ channel: 'Instagram', status: 'pending' }],
  }).join(','),
  'TikTok',
);

console.log('task channel publications: ok');
