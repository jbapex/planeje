import assert from 'node:assert/strict';
import {
  composerWhenFromPublication,
  driveFileFromPublication,
  futurePublicationSchedule,
  publicationIgFormat,
  publicationLooksLikeVideo,
  socialQueueCardAction,
  socialQueueFooterLabel,
} from '../src/lib/socialQueueOpen.js';

assert.equal(socialQueueCardAction({}).type, 'task');
assert.equal(socialQueueFooterLabel({}), 'Abrir tarefa');

const scheduled = {
  publication: {
    id: 'p1',
    status: 'scheduled',
    caption: 'Oi',
    scheduled_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    format: 'Reels',
    asset_url: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view',
  },
};
assert.equal(socialQueueCardAction(scheduled).type, 'composer');
assert.equal(socialQueueFooterLabel(scheduled), 'Abrir post');
assert.equal(publicationIgFormat(scheduled.publication), 'REELS');
assert.equal(publicationLooksLikeVideo(scheduled.publication), true);
assert.equal(driveFileFromPublication(scheduled.publication).id, '1AbCdEfGhIjKlMnOpQrStUvWxYz012345');

const when = composerWhenFromPublication(scheduled.publication);
assert.equal(when.whenMode, 'schedule');
assert.ok(when.scheduledTime instanceof Date);

const published = {
  publication: {
    id: 'p2',
    status: 'published',
    evidence_url: 'https://www.instagram.com/p/abc/',
  },
};
assert.deepEqual(socialQueueCardAction(published), {
  type: 'evidence',
  url: 'https://www.instagram.com/p/abc/',
});
assert.equal(socialQueueFooterLabel(published), 'Ver comprovante');

const publishedNoLink = {
  publication: { id: 'p3', status: 'published', format: 'Feed' },
};
assert.equal(socialQueueCardAction(publishedNoLink).type, 'composer');
assert.equal(publicationIgFormat(publishedNoLink.publication), 'IMAGE');

const past = {
  publication: {
    id: 'p4',
    status: 'failed',
    scheduled_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  },
};
assert.equal(composerWhenFromPublication(past.publication).whenMode, 'now');
assert.ok(futurePublicationSchedule(past.publication).getTime() > Date.now());

console.log('socialQueueOpen.test.mjs ok');
