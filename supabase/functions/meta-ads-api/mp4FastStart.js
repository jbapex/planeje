/**
 * Reordena MP4 com moov no fim para o índice ir na frente (faststart).
 * Só copia caixas; não recodifica. A Graph do Instagram recusa vários
 * arquivos que o app e o Meta Business convertem sozinhos.
 */

const CONTAINER_TYPES = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'mvex']);
const MAX_MOOV = 8 * 1024 * 1024;

function dataView(bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

export function readU32(bytes, offset) {
  return dataView(bytes).getUint32(offset);
}

function readU64(bytes, offset) {
  return dataView(bytes).getBigUint64(offset);
}

function writeU32(bytes, offset, value) {
  dataView(bytes).setUint32(offset, value >>> 0);
}

function writeU64(bytes, offset, value) {
  dataView(bytes).setBigUint64(offset, BigInt(value));
}

function fourcc(bytes, offset) {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

export function parseTopBoxes(bytes, fileSize) {
  const boxes = [];
  let i = 0;
  const limit = bytes.byteLength;
  const total = Number(fileSize) > 0 ? Number(fileSize) : limit;
  while (i + 8 <= limit) {
    let size = readU32(bytes, i);
    const type = fourcc(bytes, i + 4);
    let header = 8;
    if (size === 1) {
      if (i + 16 > limit) break;
      size = Number(readU64(bytes, i + 8));
      header = 16;
    } else if (size === 0) {
      size = total - i;
    }
    if (!Number.isFinite(size) || size < header) break;
    boxes.push({ type, start: i, size, header });
    if (i + size > limit) break;
    i += size;
  }
  return boxes;
}

export function inspectMp4Prefix(head, fileSize) {
  const boxes = parseTopBoxes(head, fileSize);
  const ftyp = boxes.find((box) => box.type === 'ftyp') || null;
  const moov = boxes.find((box) => box.type === 'moov') || null;
  const mdat = boxes.find((box) => box.type === 'mdat') || null;
  const moovAfterMdat = Boolean(mdat && (!moov || mdat.start < moov.start));
  return {
    boxes,
    ftyp,
    moov,
    mdat,
    needsFastStart: moovAfterMdat,
    moovOffset: moovAfterMdat && mdat ? mdat.start + mdat.size : (moov ? moov.start : -1),
  };
}

export function patchChunkOffsets(moov, delta) {
  const out = moov.slice();
  const shift = Number(delta) || 0;
  const walk = (start, end) => {
    let i = start;
    while (i + 8 <= end) {
      let size = readU32(out, i);
      const type = fourcc(out, i + 4);
      let header = 8;
      if (size === 1) {
        if (i + 16 > end) break;
        size = Number(readU64(out, i + 8));
        header = 16;
      } else if (size === 0) {
        size = end - i;
      }
      const payload = i + header;
      const boxEnd = Math.min(i + size, end);
      if (boxEnd <= i) break;
      if (type === 'stco' && boxEnd - payload >= 8) {
        const count = readU32(out, payload + 4);
        let p = payload + 8;
        for (let n = 0; n < count && p + 4 <= boxEnd; n += 1, p += 4) {
          writeU32(out, p, readU32(out, p) + shift);
        }
      } else if (type === 'co64' && boxEnd - payload >= 8) {
        const count = readU32(out, payload + 4);
        let p = payload + 8;
        for (let n = 0; n < count && p + 8 <= boxEnd; n += 1, p += 8) {
          writeU64(out, p, readU64(out, p) + BigInt(shift));
        }
      } else if (CONTAINER_TYPES.has(type)) {
        walk(payload, boxEnd);
      }
      i = boxEnd;
    }
  };
  walk(0, out.byteLength);
  return out;
}

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out;
}

export function buildFastStartPlan({ head, boxes, moovBox, mdat, fileSize }) {
  if (!mdat || !moovBox?.byteLength || !head) return null;
  const leading = (boxes || []).filter((box) => box.start < mdat.start && box.start + box.size <= head.byteLength);
  if (!leading.length) return null;
  const leadingBytes = concatBytes(leading.map((box) => head.subarray(box.start, box.start + box.size)));
  const oldPayload = mdat.start + mdat.header;
  const newMdatStart = leadingBytes.byteLength + moovBox.byteLength;
  const newPayload = newMdatStart + mdat.header;
  const delta = newPayload - oldPayload;
  const patchedMoov = patchChunkOffsets(moovBox, delta);
  const mdatHeader = new Uint8Array(mdat.header);
  if (mdat.header >= 8) {
    if (mdat.header === 16) {
      writeU32(mdatHeader, 0, 1);
      mdatHeader.set([0x6d, 0x64, 0x61, 0x74], 4);
      writeU64(mdatHeader, 8, mdat.size);
    } else {
      writeU32(mdatHeader, 0, mdat.size);
      mdatHeader.set([0x6d, 0x64, 0x61, 0x74], 4);
    }
  }
  const prefix = concatBytes([leadingBytes, patchedMoov, mdatHeader]);
  const sourceDataLength = mdat.size - mdat.header;
  return {
    prefix,
    newFileSize: Number(fileSize) || prefix.byteLength + sourceDataLength,
    sourceDataOffset: oldPayload,
    sourceDataLength,
    delta,
  };
}

export function mapPlanRange(plan, offset, length) {
  const slices = [];
  let left = Math.max(0, Math.floor(Number(length) || 0));
  let pos = Math.max(0, Math.floor(Number(offset) || 0));
  const prefixLen = plan.prefix.byteLength;
  while (left > 0) {
    if (pos < prefixLen) {
      const n = Math.min(left, prefixLen - pos);
      slices.push({ kind: 'prefix', offset: pos, length: n });
      pos += n;
      left -= n;
      continue;
    }
    const sourcePos = pos - prefixLen;
    if (sourcePos >= plan.sourceDataLength) break;
    const n = Math.min(left, plan.sourceDataLength - sourcePos);
    slices.push({ kind: 'source', offset: plan.sourceDataOffset + sourcePos, length: n });
    pos += n;
    left -= n;
  }
  return slices;
}

export async function assemblePlanSlice(plan, offset, length, readSource) {
  const slices = mapPlanRange(plan, offset, length);
  const out = new Uint8Array(length);
  let written = 0;
  for (const slice of slices) {
    if (slice.kind === 'prefix') {
      out.set(plan.prefix.subarray(slice.offset, slice.offset + slice.length), written);
    } else {
      const part = await readSource(slice.offset, slice.length);
      if (!part || part.byteLength !== slice.length) {
        throw new Error('O Drive devolveu um trecho incompleto. Tente de novo.');
      }
      out.set(part, written);
    }
    written += slice.length;
  }
  return out.subarray(0, written);
}

export async function loadFastStartPlan(fileSize, readRange) {
  const size = Math.floor(Number(fileSize) || 0);
  if (size < 64) return null;
  const headLen = Math.min(256, size);
  const head = await readRange(0, headLen);
  const inspect = inspectMp4Prefix(head, size);
  if (!inspect.needsFastStart || !inspect.ftyp || !inspect.mdat) return null;
  const moovOffset = inspect.mdat.start + inspect.mdat.size;
  if (moovOffset + 8 > size) return null;
  const moovHead = await readRange(moovOffset, Math.min(16, size - moovOffset));
  if (fourcc(moovHead, 4) !== 'moov') return null;
  let moovSize = readU32(moovHead, 0);
  if (moovSize === 1 && moovHead.byteLength >= 16) moovSize = Number(readU64(moovHead, 8));
  if (!Number.isFinite(moovSize) || moovSize < 16 || moovSize > MAX_MOOV || moovOffset + moovSize > size) {
    return null;
  }
  const moovBox = await readRange(moovOffset, moovSize);
  if (moovBox.byteLength !== moovSize) return null;
  return buildFastStartPlan({
    head,
    boxes: inspect.boxes,
    moovBox,
    mdat: inspect.mdat,
    fileSize: size,
  });
}
