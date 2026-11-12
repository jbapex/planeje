import assert from 'node:assert/strict';
import {
  ATENDIMENTO_AGENCIA_DOC_MAX_BYTES,
  ATENDIMENTO_MEDIA_MAX_BYTES,
  ATENDIMENTO_UPLOAD_CHUNK_BYTES,
  encodeTusMetadata,
  formatUploadRemaining,
  validateAtendimentoMediaFile,
} from '../src/lib/atendimentoMediaSend.js';

const GB = 1024 * 1024 * 1024;
const big = { size: 600 * 1024 * 1024, name: 'video.mp4', type: 'video/mp4' };

const loja = validateAtendimentoMediaFile(big);
assert.equal(loja.ok, false);
assert.match(loja.message, /4 MB/);

const agencia = validateAtendimentoMediaFile(big, {
  maxBytes: ATENDIMENTO_AGENCIA_DOC_MAX_BYTES,
  allowAnyDocument: true,
});
assert.equal(agencia.ok, true);
assert.equal(agencia.mediaType, 'document');
assert.equal(agencia.viaUrl, true);

const over = validateAtendimentoMediaFile(
  { size: GB + 1, name: 'grande.zip', type: 'application/zip' },
  { maxBytes: ATENDIMENTO_AGENCIA_DOC_MAX_BYTES, allowAnyDocument: true },
);
assert.equal(over.ok, false);
assert.match(over.message, /1 GB/);

const photo = validateAtendimentoMediaFile(
  { size: 200 * 1024, name: 'foto.jpg', type: 'image/jpeg' },
  { maxBytes: ATENDIMENTO_AGENCIA_DOC_MAX_BYTES, allowAnyDocument: true },
);
assert.equal(photo.ok, true);
assert.equal(photo.mediaType, 'image');
assert.equal(photo.viaUrl, false);

const zip = validateAtendimentoMediaFile(
  { size: 2 * 1024 * 1024, name: 'pacote.zip', type: 'application/zip' },
  { maxBytes: ATENDIMENTO_AGENCIA_DOC_MAX_BYTES, allowAnyDocument: true },
);
assert.equal(zip.mediaType, 'document');
assert.equal(zip.viaUrl, false);

const lojaTipo = validateAtendimentoMediaFile({ size: 1000, name: 'clip.mp4', type: 'video/mp4' });
assert.equal(lojaTipo.ok, false);

assert.equal(ATENDIMENTO_MEDIA_MAX_BYTES, 4 * 1024 * 1024);
assert.equal(formatUploadRemaining(0), '');
assert.equal(formatUploadRemaining(20000), 'falta menos de 1 min');
assert.equal(formatUploadRemaining(8 * 60000), 'faltam cerca de 8 min');
assert.equal(ATENDIMENTO_UPLOAD_CHUNK_BYTES, 32 * 1024 * 1024);
assert.ok(ATENDIMENTO_UPLOAD_CHUNK_BYTES < 90 * 1024 * 1024);
const meta = encodeTusMetadata({ bucketName: 'atendimento-envios', objectName: 'a/b.pdf' });
assert.match(meta, /^bucketName /);
assert.match(meta, /objectName /);

console.log('atendimentoMediaLimite: ok');
