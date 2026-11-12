import assert from 'node:assert/strict';
import {
  chunkIds,
  clientBoardPhotoUrls,
  clientsWithMetaAccounts,
  SOCIAL_ACCOUNT_IN_CHUNK,
} from '../src/lib/clienteSocialAccounts.js';

function testKeepsOnlyLinked() {
  const clients = [
    { id: 'a', empresa: 'Zebra' },
    { id: 'b', empresa: 'Ápice' },
    { id: 'c', empresa: 'Impacto' },
  ];
  const map = new Map([
    ['c', [{ platform: 'instagram' }]],
    ['b', [{ platform: 'facebook_page' }]],
  ]);
  const linked = clientsWithMetaAccounts(clients, map);
  assert.deepEqual(linked.map((row) => row.id), ['b', 'c']);
}

function testEmptyMap() {
  const linked = clientsWithMetaAccounts([{ id: 'a', empresa: 'X' }], new Map());
  assert.equal(linked.length, 0);
}

testKeepsOnlyLinked();
testEmptyMap();

function testBoardPhotoPrefersInstagram() {
  const urls = clientBoardPhotoUrls(
    { logo_urls: ['https://logo.quebrada/x.png', 'https://scontent.cdninstagram.com/ig.jpg'] },
    [
      { platform: 'facebook_page', profile_picture_url: 'https://graph.facebook.com/page.jpg' },
      { platform: 'instagram', profile_picture_url: 'https://scontent.cdninstagram.com/ig.jpg' },
    ],
  );
  assert.deepEqual(urls, [
    'https://scontent.cdninstagram.com/ig.jpg',
    'https://graph.facebook.com/page.jpg',
    'https://logo.quebrada/x.png',
  ]);
}

testBoardPhotoPrefersInstagram();

function testChunksIdsForInQuery() {
  const ids = Array.from({ length: 90 }, (_, i) => `id-${i}`);
  const chunks = chunkIds(ids, SOCIAL_ACCOUNT_IN_CHUNK);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].length, 80);
  assert.equal(chunks[1].length, 10);
}

testChunksIdsForInQuery();
console.log('clienteSocialAccounts.test.mjs PASS');
