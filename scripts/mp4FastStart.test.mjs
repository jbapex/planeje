import assert from 'node:assert/strict';
import {
  assemblePlanSlice,
  inspectMp4Prefix,
  loadFastStartPlan,
  mapPlanRange,
  patchChunkOffsets,
  readU32,
} from '../supabase/functions/meta-ads-api/mp4FastStart.js';

function u32(value) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0);
  return bytes;
}

function box(type, payload) {
  const size = 8 + payload.byteLength;
  const out = new Uint8Array(size);
  new DataView(out.buffer).setUint32(0, size);
  out[4] = type.charCodeAt(0);
  out[5] = type.charCodeAt(1);
  out[6] = type.charCodeAt(2);
  out[7] = type.charCodeAt(3);
  out.set(payload, 8);
  return out;
}

function concat(parts) {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out;
}

function fourcc(bytes, offset) {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

const ftyp = box('ftyp', new Uint8Array([0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 1, 0x69, 0x73, 0x6f, 0x6d]));
const free = box('free', new Uint8Array());
const payload = new Uint8Array(64);
for (let i = 0; i < payload.length; i += 1) payload[i] = i + 1;
const mdat = box('mdat', payload);
const stcoPayload = concat([u32(0), u32(1), u32(ftyp.byteLength + free.byteLength + 8)]);
const stco = box('stco', stcoPayload);
const stbl = box('stbl', stco);
const moov = box('moov', stbl);
const original = concat([ftyp, free, mdat, moov]);

assert.equal(fourcc(original, 4), 'ftyp');
assert.equal(fourcc(original, ftyp.byteLength + 4), 'free');
assert.equal(fourcc(original, ftyp.byteLength + free.byteLength + 4), 'mdat');
assert.equal(fourcc(original, ftyp.byteLength + free.byteLength + mdat.byteLength + 4), 'moov');

const inspect = inspectMp4Prefix(original.subarray(0, 64), original.byteLength);
assert.equal(inspect.needsFastStart, true);
assert.equal(inspect.mdat.start, ftyp.byteLength + free.byteLength);
assert.equal(inspect.moovOffset, ftyp.byteLength + free.byteLength + mdat.byteLength);

const source = original;
const plan = await loadFastStartPlan(original.byteLength, async (offset, length) => source.subarray(offset, offset + length));
assert.ok(plan);
assert.equal(plan.newFileSize, original.byteLength);
assert.equal(plan.delta, moov.byteLength);

const rebuilt = await assemblePlanSlice(plan, 0, plan.newFileSize, async (offset, length) => source.subarray(offset, offset + length));
assert.equal(rebuilt.byteLength, original.byteLength);
assert.equal(fourcc(rebuilt, 4), 'ftyp');
assert.equal(fourcc(rebuilt, ftyp.byteLength + 4), 'free');
const moovAt = ftyp.byteLength + free.byteLength;
assert.equal(fourcc(rebuilt, moovAt + 4), 'moov');
assert.equal(fourcc(rebuilt, moovAt + moov.byteLength + 4), 'mdat');

const newPayloadOffset = moovAt + moov.byteLength + 8;
const entryAt = moovAt + 8 + 8 + 8 + 8;
assert.equal(readU32(rebuilt, entryAt), newPayloadOffset);
assert.deepEqual(
  Array.from(rebuilt.subarray(newPayloadOffset, newPayloadOffset + payload.byteLength)),
  Array.from(payload),
);

const slices = mapPlanRange(plan, plan.prefix.byteLength - 4, 12);
assert.equal(slices.length, 2);
assert.equal(slices[0].kind, 'prefix');
assert.equal(slices[1].kind, 'source');

const alreadyFast = concat([ftyp, moov, mdat]);
const skip = await loadFastStartPlan(alreadyFast.byteLength, async (offset, length) => alreadyFast.subarray(offset, offset + length));
assert.equal(skip, null);

const shifted = patchChunkOffsets(moov, 10);
assert.notDeepEqual(Array.from(shifted), Array.from(moov));

const tinyHead = inspectMp4Prefix(ftyp, original.byteLength);
assert.equal(tinyHead.needsFastStart, false); // mdat not in 24-byte ftyp-only buffer... ftyp is complete, no mdat
assert.equal(tinyHead.mdat, null);

console.log('mp4FastStart.test.mjs PASS');
