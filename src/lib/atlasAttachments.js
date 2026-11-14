/** Private Squad attachments. Content and paths never choose authorization scope. */
export const ATLAS_ATTACHMENT_BUCKET = 'atlas-executor-attachments';
export const ATLAS_ATTACHMENT_LIMITS = Object.freeze({ files: 4, totalBytes: 10 * 1024 * 1024, mediaBytes: 5 * 1024 * 1024, docxBytes: 512 * 1024, textBytes: 512 * 1024, textCharacters: 24000 });
const formats = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const uuidPattern = new RegExp(`^${uuid}$`, 'i');
const pathPattern = new RegExp(`^${uuid}/${uuid}/${uuid}\\.(pdf|docx|txt|md|csv|png|jpg|webp)$`, 'i');
const error = message => new Error(message);
export function atlasAttachmentName(value) {
  const name = String(value || 'Arquivo').replace(/[\u0000-\u001f\u007f/\\]/g, '').trim() || 'Arquivo';
  if (name.length <= 120) return name;
  const suffix = name.match(/\.[a-z0-9]{1,5}$/i)?.[0] || '';
  return name.slice(0,120 - suffix.length) + suffix;
}
export function atlasAttachmentText(bytes) {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw error('Use arquivos de texto em UTF-8.'); }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw error('O arquivo contém dados binários em vez de texto UTF-8.');
  if (text.length > ATLAS_ATTACHMENT_LIMITS.textCharacters) throw error('O texto dos anexos pode ter até 24.000 caracteres por pedido.');
  return text;
}
export async function atlasAttachmentSha256(bytes) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}
export async function validateAtlasAttachmentBytes(bytes, descriptor) {
  if (!(bytes instanceof Uint8Array)) throw error('Conteúdo do anexo inválido.');
  const suffix = String(descriptor?.name || '').split('.').pop().toLowerCase(), mime = formats[suffix], ext = suffix === 'jpeg' ? 'jpg' : suffix;
  if (!mime) throw error('Formato permitido: PDF, DOCX, TXT, MD, CSV, PNG, JPG ou WEBP.');
  const declared = descriptor.mime || descriptor.type || '';
  if (declared && declared !== mime && !(suffix === 'md' && declared === 'text/plain')) throw error('O arquivo não corresponde ao formato informado.');
  const limit = ext === 'docx' ? ATLAS_ATTACHMENT_LIMITS.docxBytes : mime.startsWith('text/') ? ATLAS_ATTACHMENT_LIMITS.textBytes : ATLAS_ATTACHMENT_LIMITS.mediaBytes;
  if (!bytes.length || bytes.length > limit || descriptor.size != null && descriptor.size !== bytes.length) throw error('O tamanho do anexo está vazio, foi alterado ou ultrapassa o limite do formato.');
  const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end));
  const valid = ext === 'pdf' ? ascii(0, 5) === '%PDF-' : ext === 'docx' ? bytes[0] === 80 && bytes[1] === 75 && bytes[2] === 3 && bytes[3] === 4 : ext === 'png' ? [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value) : ext === 'jpg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : ext === 'webp' ? ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP' : true;
  if (!valid) throw error('O arquivo não corresponde ao formato informado.');
  if (mime.startsWith('text/')) atlasAttachmentText(bytes);
  return { name: atlasAttachmentName(descriptor.name), mime, size: bytes.length, ext, sha256: await atlasAttachmentSha256(bytes) };
}
export async function validateAtlasAttachment(file) {
  if (!file || typeof file.arrayBuffer !== 'function') throw error('Escolha um arquivo válido.');
  // Bound allocation before reading a user-selected file.
  if (!file.size || file.size > ATLAS_ATTACHMENT_LIMITS.mediaBytes) throw error('Cada arquivo pode ter até 5 MiB, conforme seu formato.');
  return validateAtlasAttachmentBytes(new Uint8Array(await file.arrayBuffer()), { name: file.name, mime: file.type, size: file.size });
}
export async function validateAtlasAttachments(files) {
  if (!Array.isArray(files) || files.length > ATLAS_ATTACHMENT_LIMITS.files) throw error('Envie até quatro arquivos por pedido.');
  const ids = new Set(), descriptors = []; let size = 0, textLength = 0;
  for (const item of files) {
    if (!uuidPattern.test(item?.id || '') || ids.has(item.id)) throw error('Identidade do anexo inválida ou repetida.');
    ids.add(item.id);
    const descriptor = await validateAtlasAttachment(item.file); size += descriptor.size;
    if (size > ATLAS_ATTACHMENT_LIMITS.totalBytes) throw error('Os anexos podem somar até 10 MiB por pedido.');
    if (descriptor.mime.startsWith('text/')) textLength += atlasAttachmentText(new Uint8Array(await item.file.arrayBuffer())).length;
    if (textLength > ATLAS_ATTACHMENT_LIMITS.textCharacters) throw error('O texto dos anexos pode ter até 24.000 caracteres por pedido.');
    descriptors.push({ id: item.id, ...descriptor });
  }
  return descriptors;
}
export async function atlasAttachmentReceipt(promise, signal) {
  if (!signal) return promise;
  let abort;
  try { return await Promise.race([promise, new Promise((_, reject) => { abort = () => reject(new DOMException('Envio interrompido', 'AbortError')); if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true }); })]); }
  finally { signal.removeEventListener('abort', abort); }
}
export async function stageAtlasAttachments(caller, { requestId, clientId = null, conversationId = null, files = [], signal } = {}) {
  const descriptors = await validateAtlasAttachments(files);
  const { data, error: failure } = await atlasAttachmentReceipt(caller.rpc('atlas_executor_attachment_stage', { p_request: requestId, p_client: clientId, p_conversation: conversationId, p_files: descriptors.map(({ id, name, mime, size, sha256 }) => ({ id, name, mime, size, sha256 })) }), signal);
  if (failure || !Array.isArray(data)) throw error('Não foi possível preparar os anexos privados.');
  return data;
}
export async function uploadAtlasAttachments(storage, { files = [], manifest = [], signal } = {}) {
  const descriptors = await validateAtlasAttachments(files);
  if (!Array.isArray(manifest) || descriptors.length !== manifest.length) throw error('O manifesto dos anexos foi alterado.');
  const uploaded = [], bucket = storage.from(ATLAS_ATTACHMENT_BUCKET);
  for (let index = 0; index < descriptors.length; index++) {
    if (signal?.aborted) throw new DOMException('Envio interrompido', 'AbortError');
    const actual = descriptors[index], saved = manifest[index];
    if (!saved || actual.id !== saved.id || ['name','mime','size','sha256'].some(key => actual[key] !== saved[key]) || !pathPattern.test(saved.path || '') || saved.path.split('/')[2] !== `${actual.id}.${actual.ext}`) throw error('O manifesto, caminho ou conteúdo do anexo foi alterado.');
    let failure;
    try { ({ error: failure } = await atlasAttachmentReceipt(bucket.upload(saved.path, files[index].file, { upsert: false, contentType: actual.mime, cacheControl: '60' }), signal)); }
    catch (cause) { if (signal?.aborted || cause?.name === 'AbortError') throw cause; failure = cause; }
    if (failure) {
      // A committed/bound object rejects INSERT too. Reconcile by current private READ and SHA,
      // never by overwriting or assuming that a lost response means a successful upload.
      let previous;
      try { previous = await atlasAttachmentReceipt(bucket.download(saved.path), signal); }
      catch (cause) { if (signal?.aborted || cause?.name === 'AbortError') throw cause; throw error('Não foi possível confirmar o envio. Seus anexos estão preservados para tentar novamente.'); }
      if (previous.error || !previous.data || previous.data.size !== actual.size || await atlasAttachmentSha256(await previous.data.arrayBuffer()) !== actual.sha256) throw error('O conteúdo anterior do anexo não corresponde a este pedido.');
    }
    if (signal?.aborted) throw new DOMException('Envio interrompido', 'AbortError');
    uploaded.push({ ...saved });
  }
  return uploaded;
}
