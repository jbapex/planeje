import assert from 'node:assert/strict';
import { buildSocialFeedReview, matchPublicationToFeedItem } from '../src/lib/socialFeedReview.js';
import {
  channelForPlatform,
  displaySocialAccount,
  filterAvailableToLink,
  platformForChannel,
} from '../src/lib/clienteSocialAccounts.js';

function testMatchByMetaId() {
  const publication = {
    id: 'p1',
    channel: 'Instagram',
    meta_post_id: 'ig_100',
    caption: 'Olá mundo',
    scheduled_for: '2026-09-10',
    status: 'published',
  };
  const feedItem = {
    id: 'ig_100',
    platform: 'instagram',
    caption: 'Olá mundo',
    permalink: 'https://instagram.com/p/abc',
    timestamp: '2026-09-10T12:00:00Z',
  };
  assert.equal(matchPublicationToFeedItem(publication, feedItem), 'confirmed');
}

function testMatchByPermalink() {
  const publication = {
    id: 'p2',
    channel: 'Facebook',
    evidence_url: 'https://facebook.com/posts/99/',
    scheduled_for: '2026-09-11',
    status: 'published',
  };
  const feedItem = {
    id: 'fb_99',
    platform: 'facebook_page',
    permalink_url: 'https://facebook.com/posts/99',
    created_time: '2026-09-11T08:00:00Z',
    message: 'Oferta',
  };
  assert.equal(matchPublicationToFeedItem(publication, feedItem), 'confirmed');
}

function testMatchByDayAndCaption() {
  const publication = {
    id: 'p3',
    channel: 'Instagram',
    caption: 'Promoção flash de setembro',
    scheduled_for: '2026-09-12',
    status: 'pending',
  };
  const feedItem = {
    id: 'ig_200',
    platform: 'instagram',
    caption: 'Promoção flash de setembro com frete',
    timestamp: '2026-09-12T15:00:00Z',
  };
  assert.equal(matchPublicationToFeedItem(publication, feedItem), 'confirmed');
}

function testReviewBuckets() {
  const now = new Date('2026-09-19T12:00:00-03:00');
  const publications = [
    {
      id: 'a',
      channel: 'Instagram',
      meta_post_id: 'ig_1',
      caption: 'Post A',
      scheduled_for: '2026-09-18',
      status: 'published',
    },
    {
      id: 'b',
      channel: 'Instagram',
      caption: 'Post B que não saiu',
      scheduled_for: '2026-09-17',
      status: 'scheduled',
    },
    {
      id: 'c',
      channel: 'LinkedIn',
      caption: 'Ignorar',
      scheduled_for: '2026-09-17',
      status: 'pending',
    },
  ];
  const feed = [
    {
      id: 'ig_1',
      platform: 'instagram',
      caption: 'Post A',
      timestamp: '2026-09-18T10:00:00Z',
      permalink: 'https://instagram.com/p/a',
    },
    {
      id: 'ig_organic',
      platform: 'instagram',
      caption: 'Improviso do cliente',
      timestamp: '2026-09-16T10:00:00Z',
      permalink: 'https://instagram.com/p/x',
    },
  ];
  const review = buildSocialFeedReview(publications, feed, { now });
  assert.equal(review.counts.confirmed, 1);
  assert.equal(review.counts.plannedMissing, 1);
  assert.equal(review.counts.organic, 1);
  assert.equal(review.confirmed[0].publication.id, 'a');
  assert.equal(review.plannedMissing[0].publication.id, 'b');
  assert.equal(review.organic[0].feedItem.id, 'ig_organic');
}

function testAccountHelpers() {
  assert.equal(platformForChannel('Instagram'), 'instagram');
  assert.equal(platformForChannel('Facebook'), 'facebook_page');
  assert.equal(channelForPlatform('instagram'), 'Instagram');
  assert.equal(
    displaySocialAccount({ platform: 'instagram', username: 'loja' }),
    '@loja'
  );
  const available = filterAvailableToLink(
    [{ id: '1' }, { id: '2' }],
    [{ platform: 'instagram', meta_id: '1', is_active: true }],
    'instagram'
  );
  assert.deepEqual(available.map((row) => row.id), ['2']);
}

testMatchByMetaId();
testMatchByPermalink();
testMatchByDayAndCaption();
testReviewBuckets();
testAccountHelpers();
console.log('socialFeedReview.test.mjs: OK');
