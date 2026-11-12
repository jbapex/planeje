import assert from 'node:assert/strict';

const META_VIDEO_MAX_BYTES = 40 * 1024 * 1024;
const META_REELS_MAX_BYTES = 1024 * 1024 * 1024;
const META_RUPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;

function shouldUseMetaResumable({ kind, size, large } = {}) {
  if (large) return true;
  if (String(kind || '') !== 'video') return false;
  const n = Number(size);
  return Number.isFinite(n) && n > META_VIDEO_MAX_BYTES && n <= META_REELS_MAX_BYTES;
}

function resumableChunkPlan(fileSize, chunkBytes = META_RUPLOAD_CHUNK_BYTES) {
  const size = Math.max(0, Math.floor(Number(fileSize) || 0));
  const step = Math.max(1, Math.floor(Number(chunkBytes) || META_RUPLOAD_CHUNK_BYTES));
  const chunks = [];
  let offset = 0;
  while (offset < size) {
    const length = Math.min(step, size - offset);
    chunks.push({ offset, length, end: offset + length });
    offset += length;
  }
  return chunks;
}

function transferComplete(startOffset, endOffset) {
  const start = Number(startOffset);
  const end = Number(endOffset);
  return Number.isFinite(start) && Number.isFinite(end) && start === end;
}

function isStageTooLargeError(err) {
  return /40\s*MB|maior que 40/i.test(String(err?.message || err || ''));
}

assert.equal(shouldUseMetaResumable({ kind: 'video', size: 20 * 1024 * 1024 }), false);
assert.equal(shouldUseMetaResumable({ kind: 'video', size: 427.6 * 1024 * 1024 }), true);
assert.equal(shouldUseMetaResumable({ kind: 'image', size: 427.6 * 1024 * 1024 }), false);
assert.equal(shouldUseMetaResumable({ kind: 'video', size: 2 * 1024 * 1024 * 1024 }), false);
assert.equal(shouldUseMetaResumable({ kind: 'video', large: true, size: 10 }), true);

const plan = resumableChunkPlan(10 * 1024 * 1024, 4 * 1024 * 1024);
assert.equal(plan.length, 3);
assert.equal(plan[0].offset, 0);
assert.equal(plan[0].length, 4 * 1024 * 1024);
assert.equal(plan[2].end, 10 * 1024 * 1024);

const huge = resumableChunkPlan(Math.round(427.6 * 1024 * 1024));
assert.ok(huge.length > 50);
assert.equal(huge[huge.length - 1].end, Math.round(427.6 * 1024 * 1024));

assert.equal(transferComplete(100, 100), true);
assert.equal(transferComplete(0, 1048576), false);
assert.equal(isStageTooLargeError(new Error('Arquivo maior que 40 MB')), true);
assert.equal(isStageTooLargeError(new Error('outro')), false);

function looksLikeMp4(bytes) {
  return Boolean(
    bytes &&
      bytes.byteLength >= 12 &&
      bytes[4] === 0x66 &&
      bytes[5] === 0x74 &&
      bytes[6] === 0x79 &&
      bytes[7] === 0x70
  );
}

function hasFourcc(bytes, code) {
  const a = code.charCodeAt(0);
  const b = code.charCodeAt(1);
  const c = code.charCodeAt(2);
  const d = code.charCodeAt(3);
  for (let i = 0; i <= bytes.length - 4; i += 1) {
    if (bytes[i] === a && bytes[i + 1] === b && bytes[i + 2] === c && bytes[i + 3] === d) return true;
  }
  return false;
}

const ftyp = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
assert.equal(looksLikeMp4(ftyp), true);
assert.equal(looksLikeMp4(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])), false);
assert.equal(hasFourcc(new TextEncoder().encode('xxxxhvc1yyyy'), 'hvc1'), true);
assert.equal(hasFourcc(new TextEncoder().encode('xxxxavc1yyyy'), 'hvc1'), false);

console.log('metaResumableUpload.test.mjs PASS');
