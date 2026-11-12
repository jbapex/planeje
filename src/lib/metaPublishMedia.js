import { supabase } from '@/lib/customSupabaseClient';
import { invokeGoogleDrive } from '@/lib/googleDriveClient';
import { TASK_DRIVE_BUCKET, isDriveImage, isDriveVideo } from '@/lib/googleDriveMedia';

export const META_PUBLISH_PREFIX = 'meta-publish-temp';
export const META_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const META_VIDEO_MAX_BYTES = 40 * 1024 * 1024;
export const META_REELS_MAX_BYTES = 1024 * 1024 * 1024;
export const META_RUPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;

export function fileExceedsMetaStage(size, maxBytes = META_VIDEO_MAX_BYTES) {
  const n = Number(size);
  return Number.isFinite(n) && n > maxBytes;
}

export function fileExceedsMetaReels(size, maxBytes = META_REELS_MAX_BYTES) {
  const n = Number(size);
  return Number.isFinite(n) && n > maxBytes;
}

export function shouldUseMetaResumable({ kind, size, large } = {}) {
  if (large) return true;
  if (String(kind || '') !== 'video') return false;
  const n = Number(size);
  return Number.isFinite(n) && n > META_VIDEO_MAX_BYTES && n <= META_REELS_MAX_BYTES;
}

export function metaStageLimitHint(maxBytes = META_VIDEO_MAX_BYTES) {
  const mb = Math.round(maxBytes / (1024 * 1024));
  return `Para publicar ou agendar na Meta, exporte um MP4 H.264 de até ${mb} MB. O original pode ficar no Drive.`;
}

export function metaResumableHint() {
  return 'Vídeo grande vai direto do Drive para a Meta (MP4 H.264, até 1 GB e 15 min). O original não é copiado no Planeje.';
}

export function isStageTooLargeError(err) {
  return /40\s*MB|maior que 40/i.test(String(err?.message || err || ''));
}

function safeFileName(name) {
  return String(name || 'media')
    .replace(/[^\w.\-]+/g, '_')
    .slice(0, 80) || 'media';
}

function publicObjectUrl(path) {
  const { data } = supabase.storage.from(TASK_DRIVE_BUCKET).getPublicUrl(path);
  return data?.publicUrl || '';
}

export function isMetaTempPath(path) {
  return String(path || '').startsWith(`${META_PUBLISH_PREFIX}/`);
}

export function detectMediaKind(fileOrMime, name = '') {
  const mime = typeof fileOrMime === 'string'
    ? fileOrMime
    : fileOrMime?.type || fileOrMime?.mimeType || '';
  const label = `${mime} ${name}`.toLowerCase();
  if (label.startsWith('video/') || /\.(mp4|mov|m4v|webm)(\?|$)/i.test(label)) return 'video';
  if (label.startsWith('image/') || /\.(png|jpe?g|gif|webp)(\?|$)/i.test(label)) return 'image';
  if (isDriveVideo(fileOrMime)) return 'video';
  if (isDriveImage(fileOrMime)) return 'image';
  return 'unknown';
}

/**
 * Sobe arquivo local para Storage público (temporário para a Meta baixar).
 */
export async function uploadLocalFileForMeta(file, { clientId } = {}) {
  if (!file) throw new Error('Selecione um arquivo');
  const kind = detectMediaKind(file, file.name);
  if (kind === 'unknown') throw new Error('Use imagem (JPG/PNG) ou vídeo (MP4/MOV)');
  if (kind === 'image' && file.size > META_IMAGE_MAX_BYTES) {
    throw new Error('Imagem maior que 8 MB. Comprima ou escolha outra.');
  }
  if (kind === 'video' && file.size > META_VIDEO_MAX_BYTES) {
    if (file.size > META_REELS_MAX_BYTES) {
      throw new Error('Vídeo maior que 1 GB. A Meta não aceita Reels acima disso.');
    }
    return {
      publicUrl: null,
      storagePath: null,
      large: true,
      localFile: file,
      mimeType: file.type || 'video/mp4',
      name: file.name,
      size: file.size,
      kind: 'video',
      source: 'upload',
      temporary: false,
    };
  }
  const cid = String(clientId || 'avulso').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'avulso';
  const storagePath = `${META_PUBLISH_PREFIX}/${cid}/${crypto.randomUUID()}/${safeFileName(file.name)}`;
  const { error } = await supabase.storage
    .from(TASK_DRIVE_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type || (kind === 'video' ? 'video/mp4' : 'image/jpeg'),
      upsert: true,
    });
  if (error) throw new Error(error.message || 'Falha no upload');
  const publicUrl = publicObjectUrl(storagePath);
  if (!publicUrl) throw new Error('Não foi possível gerar URL pública');
  return {
    publicUrl,
    storagePath,
    mimeType: file.type || null,
    name: file.name,
    size: file.size,
    kind,
    source: 'upload',
    temporary: true,
  };
}

/**
 * Vídeo grande: só o vínculo do Drive + URL de preview. Sem copiar o master.
 * Arquivo pequeno: cópia pública temporária para a Graph baixar.
 */
export async function attachDriveMediaForMeta(clienteId, driveFile) {
  if (!clienteId) throw new Error('Cliente necessário para usar o Drive');
  const fileId = driveFile?.id;
  if (!fileId) throw new Error('Arquivo do Drive sem identificação');
  const kind = detectMediaKind(driveFile, driveFile.name);
  if (kind === 'unknown') throw new Error('Escolha uma imagem ou vídeo no Drive');
  const size = Number(driveFile.size || 0);
  if (kind === 'video' && fileExceedsMetaReels(size)) {
    throw new Error('Vídeo maior que 1 GB. A Meta não aceita Reels acima disso.');
  }
  if (kind === 'video' && shouldUseMetaResumable({ kind, size })) {
    const stream = await invokeGoogleDrive({
      action: 'stream-url',
      clienteId,
      fileId,
    });
    return {
      publicUrl: null,
      storagePath: null,
      large: true,
      mimeType: driveFile.mimeType || 'video/mp4',
      name: driveFile.name,
      size,
      kind: 'video',
      source: 'drive',
      driveFileId: fileId,
      previewUrl: stream?.url || null,
      temporary: false,
    };
  }
  return stageDriveFileForMeta(clienteId, driveFile);
}

/**
 * Copia arquivo do Drive para Storage público temporário.
 */
export async function stageDriveFileForMeta(clienteId, driveFile) {
  if (!clienteId) throw new Error('Cliente necessário para usar o Drive');
  const fileId = driveFile?.id;
  if (!fileId) throw new Error('Arquivo do Drive sem identificação');
  const kind = detectMediaKind(driveFile, driveFile.name);
  if (kind === 'unknown') throw new Error('Escolha uma imagem ou vídeo no Drive');
  const data = await invokeGoogleDrive({
    action: 'stage-for-meta',
    clienteId,
    fileId,
  });
  if (!data?.publicUrl) throw new Error('Não foi possível preparar a mídia do Drive');
  return {
    publicUrl: data.publicUrl,
    storagePath: data.storagePath || null,
    mimeType: data.mimeType || driveFile.mimeType || null,
    name: data.name || driveFile.name,
    size: data.size ?? driveFile.size ?? null,
    kind,
    source: 'drive',
    driveFileId: fileId,
    temporary: true,
  };
}

export async function cleanupMetaPublishMedia(storagePath) {
  const path = String(storagePath || '').trim();
  if (!isMetaTempPath(path)) return false;
  const { error } = await supabase.storage.from(TASK_DRIVE_BUCKET).remove([path]);
  return !error;
}
