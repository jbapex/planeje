import assert from 'node:assert/strict';
import {
  clampVideoOffset,
  composerCoverChip,
  composerCoverOffset,
  composerPhonePoster,
  composerStillKind,
  formatVideoClock,
} from '../src/lib/composerVideoPreview.js';

assert.equal(formatVideoClock(0), '0:00');
assert.equal(formatVideoClock(3.9), '0:03');
assert.equal(formatVideoClock(75), '1:15');
assert.equal(formatVideoClock(-2), '0:00');

assert.equal(clampVideoOffset(3, 10), 3);
assert.equal(clampVideoOffset(-1, 10), 0);
assert.equal(clampVideoOffset(12, 10), 9.95);
assert.equal(clampVideoOffset(4, 0), 4);

assert.equal(composerStillKind('auto', { isVideo: true }), 'auto');
assert.equal(composerStillKind('frame', { isVideo: true }), 'frame');
assert.equal(composerStillKind('image', { isVideo: true, hasCoverImage: true }), 'image');
assert.equal(composerStillKind('image', { isVideo: true, hasCoverImage: false }), 'auto');
assert.equal(composerStillKind('auto', { isVideo: false }), 'empty');

assert.equal(composerCoverOffset('auto', 8, 20), 0);
assert.equal(composerCoverOffset('frame', 8, 20), 8);
assert.equal(composerCoverOffset('frame', 99, 10), 9.95);

assert.equal(composerCoverChip('auto'), 'Capa automática');
assert.equal(composerCoverChip('image'), 'Capa');
assert.equal(composerCoverChip('frame', '0:58'), 'Capa · 0:58');
assert.equal(composerCoverChip('frame', ''), 'Capa');

assert.equal(composerPhonePoster('frame', { drivePoster: 'thumb.jpg' }), undefined);
assert.equal(composerPhonePoster('auto', { drivePoster: 'thumb.jpg' }), undefined);
assert.equal(composerPhonePoster('image', { drivePoster: 'thumb.jpg' }), 'thumb.jpg');
assert.equal(composerPhonePoster('frame', { playing: true, drivePoster: 'thumb.jpg' }), undefined);

console.log('composerVideoPreview.test.mjs PASS');
