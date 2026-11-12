import assert from 'node:assert/strict';

function isMetaTempPath(path) {
  return String(path || '').startsWith('meta-publish-temp/');
}

function detectMediaKind(fileOrMime, name = '') {
  const mime = typeof fileOrMime === 'string'
    ? fileOrMime
    : fileOrMime?.type || fileOrMime?.mimeType || '';
  const label = `${mime} ${name}`.toLowerCase();
  if (label.startsWith('video/') || /\.(mp4|mov|m4v|webm)(\?|$)/i.test(label)) return 'video';
  if (label.startsWith('image/') || /\.(png|jpe?g|gif|webp)(\?|$)/i.test(label)) return 'image';
  return 'unknown';
}

assert.equal(detectMediaKind({ type: 'image/jpeg' }, 'a.jpg'), 'image');
assert.equal(detectMediaKind({ type: 'video/mp4' }, 'a.mp4'), 'video');
assert.equal(detectMediaKind({}, 'shot.PNG'), 'image');
assert.equal(isMetaTempPath('meta-publish-temp/c1/u1/file.jpg'), true);
assert.equal(isMetaTempPath('other/path.jpg'), false);

function fileExceedsMetaStage(size, maxBytes = 40 * 1024 * 1024) {
  const n = Number(size);
  return Number.isFinite(n) && n > maxBytes;
}

assert.equal(fileExceedsMetaStage(427.6 * 1024 * 1024), true);
assert.equal(fileExceedsMetaStage(20 * 1024 * 1024), false);

function shouldUseMetaResumable({ kind, size, large } = {}, videoMax = 40 * 1024 * 1024, reelsMax = 1024 * 1024 * 1024) {
  if (large) return true;
  if (String(kind || '') !== 'video') return false;
  const n = Number(size);
  return Number.isFinite(n) && n > videoMax && n <= reelsMax;
}

assert.equal(shouldUseMetaResumable({ kind: 'video', size: 71 * 1024 * 1024 }), true);
assert.equal(shouldUseMetaResumable({ kind: 'video', size: 10 * 1024 * 1024 }), false);

console.log('metaPublishMedia.test.mjs PASS');
