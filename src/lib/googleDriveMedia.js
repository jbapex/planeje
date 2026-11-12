export const TASK_DRIVE_BUCKET = 'task-drive';
export const DRIVE_UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;
export const DRIVE_UPLOAD_MAX_BYTES = 2 * 1024 * 1024 * 1024;

export const DRIVE_FOLDER_MY = 'root';
export const DRIVE_FOLDER_SHARED = 'shared';
export const DRIVE_FOLDER_RECENT_VIDEOS = 'recent-videos';

export function escapeDriveQueryValue(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
}

export function isDriveFileId(id) {
  const v = String(id || '').trim();
  if (v === DRIVE_FOLDER_MY || v === DRIVE_FOLDER_SHARED || v === DRIVE_FOLDER_RECENT_VIDEOS) {
    return true;
  }
  return /^[a-zA-Z0-9_-]{8,256}$/.test(v);
}

export function isSpecialDrivePlace(id) {
  const v = String(id || '').trim();
  return v === DRIVE_FOLDER_MY || v === DRIVE_FOLDER_SHARED || v === DRIVE_FOLDER_RECENT_VIDEOS || !v;
}

export function isPinnableDriveFolderId(id) {
  const v = String(id || '').trim();
  if (isSpecialDrivePlace(v)) return false;
  return /^[a-zA-Z0-9_-]{8,256}$/.test(v);
}

export function normalizeDriveFavorite(row) {
  const id = String(row?.favorite_folder_id || row?.id || '').trim();
  if (!isPinnableDriveFolderId(id)) return null;
  const name = String(row?.favorite_folder_name || row?.name || '').trim();
  return { id, name: name || 'Pasta favorita' };
}

export function buildDriveListQuery({ folderId = DRIVE_FOLDER_MY, q = '', mediaOnly = true } = {}) {
  const parts = ['trashed = false'];
  const folder = String(folderId || DRIVE_FOLDER_MY).trim() || DRIVE_FOLDER_MY;
  const extra = String(q || '').trim();

  if (folder === DRIVE_FOLDER_SHARED) {
    parts.push('sharedWithMe = true');
  } else if (folder === DRIVE_FOLDER_RECENT_VIDEOS) {
    parts.push("(mimeType contains 'video/' or mimeType = 'application/vnd.google-apps.video')");
  } else {
    const id = isDriveFileId(folder) ? folder : DRIVE_FOLDER_MY;
    parts.push(`'${escapeDriveQueryValue(id)}' in parents`);
  }

  if (mediaOnly && folder !== DRIVE_FOLDER_RECENT_VIDEOS) {
    parts.push(
      "(mimeType = 'application/vnd.google-apps.folder' or mimeType contains 'video/' or mimeType contains 'image/' or mimeType = 'application/vnd.google-apps.video')",
    );
  }

  if (extra) {
    parts.push(`name contains '${escapeDriveQueryValue(extra)}'`);
  }
  return parts.join(' and ');
}

export function isDriveFolder(file) {
  return Boolean(file?.isFolder) || file?.mimeType === 'application/vnd.google-apps.folder';
}

export function isDriveVideo(mimeOrFile) {
  const mime = typeof mimeOrFile === 'string'
    ? mimeOrFile
    : mimeOrFile?.mimeType || mimeOrFile?.mime_type;
  const m = String(mime || '').toLowerCase();
  return m.startsWith('video/') || m === 'application/vnd.google-apps.video';
}

export function isDriveImage(mimeOrFile) {
  const mime = typeof mimeOrFile === 'string'
    ? mimeOrFile
    : mimeOrFile?.mimeType || mimeOrFile?.mime_type;
  return String(mime || '').toLowerCase().startsWith('image/');
}

export function isGoogleNativeFile(mimeOrFile) {
  const mime = typeof mimeOrFile === 'string' ? mimeOrFile : mimeOrFile?.mimeType;
  const m = String(mime || '').toLowerCase();
  return m.startsWith('application/vnd.google-apps') && !m.endsWith('.folder');
}

export function driveViewUrl(fileId) {
  const id = String(fileId || '').trim();
  if (!id) return '';
  return `https://drive.google.com/file/d/${id}/view`;
}

export function drivePreviewUrl(fileId) {
  const id = String(fileId || '').trim();
  if (!id) return '';
  return `https://drive.google.com/file/d/${id}/preview`;
}

export function enlargeDriveThumbnail(url) {
  const value = String(url || '').trim();
  if (!value) return value;
  return value.replace(/=s\d+/, '=s400').replace(/([?&])sz=\d+/i, '$1sz=400');
}

/** Miniatura da lista do seletor: foto do material, não o ícone genérico. */
export function driveListThumbSrc(file) {
  if (!file || isDriveFolder(file)) return '';
  return enlargeDriveThumbnail(file.thumbnailLink || file.thumbnail_url || '');
}

export function formatDriveBytes(n) {
  const num = Number(n);
  if (!Number.isFinite(num) || num < 0) return '';
  if (num < 1024) return `${Math.round(num)} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(1)} MB`;
}

export function isPlanejeStoredMedia(url) {
  return /\/storage\/v1\/object\/public\/task-drive\//i.test(String(url || ''));
}

export function isPlayableVideoUrl(url, mime) {
  const href = String(url || '');
  if (!href) return false;
  if (isDriveVideo(mime) && isPlanejeStoredMedia(href)) return true;
  return isPlanejeStoredMedia(href) && /\.(mp4|webm|mov|m4v|ogg)(\?|$)/i.test(href);
}

export function isPlayableImageUrl(url, mime) {
  const href = String(url || '');
  if (!href) return false;
  if (isDriveImage(mime)) return isPlanejeStoredMedia(href) || /^https?:\/\//i.test(href);
  return /\.(png|jpe?g|gif|webp)(\?|$)/i.test(href);
}

export function driveFileIdFromUrl(url) {
  const value = String(url || '');
  const file = value.match(/\/file\/d\/([a-zA-Z0-9_-]{8,256})/i);
  if (file) return file[1];
  const open = value.match(/[?&]id=([a-zA-Z0-9_-]{8,256})/i);
  return open ? open[1] : '';
}

export function driveFileIdFromAttachment(item) {
  const id = String(item?.external_file_id || '').trim();
  if (isDriveFileId(id) && id !== DRIVE_FOLDER_MY && id !== DRIVE_FOLDER_SHARED && id !== DRIVE_FOLDER_RECENT_VIDEOS) {
    return id;
  }
  return driveFileIdFromUrl(item?.source_url || item?.url || '');
}

/** Forma o anexo da tarefa como arquivo do Drive, para a miniatura da lista. */
export function driveFileFromAttachment(item) {
  if (!item) return null;
  return {
    id: driveFileIdFromAttachment(item),
    name: item.name,
    mimeType: item.mime_type || item.mimeType || '',
    thumbnailLink: item.thumbnail_url || item.thumbnailLink || '',
    size: item.size_bytes ?? item.size ?? null,
  };
}

export function attachmentLooksLikeVideo(item) {
  if (isDriveVideo(item)) return true;
  const name = String(item?.name || item?.url || '');
  return /\.(mp4|webm|mov|m4v|ogg)(\?|$)/i.test(name);
}

export function attachmentHasInAppVideo(item) {
  return isPlayableVideoUrl(item?.url, item?.mime_type);
}

export function attachmentNeedsDriveStream(item) {
  if (item?.provider !== 'google_drive') return false;
  if (!attachmentLooksLikeVideo(item)) return false;
  return Boolean(driveFileIdFromAttachment(item));
}

export function attachmentNeedsDriveImage(item) {
  if (item?.provider !== 'google_drive') return false;
  if (!isDriveImage(item)) return false;
  return Boolean(driveFileIdFromAttachment(item));
}

export function driveStreamThumbUrl(streamUrl) {
  const value = String(streamUrl || '').trim();
  if (!value) return '';
  return `${value}${value.includes('?') ? '&' : '?'}kind=thumb`;
}

export function isGoogleDriveUploadUrl(url) {
  try {
    const parsed = new URL(String(url || ''));
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (host !== 'www.googleapis.com' && !host.endsWith('.googleapis.com')) return false;
    return parsed.pathname.includes('/upload/drive/');
  } catch {
    return false;
  }
}

export function driveUploadContentRange(offset, endExclusive, total) {
  return `bytes ${offset}-${endExclusive - 1}/${total}`;
}

export function describeDriveUploadFailure(message, { inFolder = false } = {}) {
  const m = String(message || '');
  if (/non-2xx/i.test(m)) {
    return 'O envio não chegou ao Drive. Tente de novo; vídeo grande sobe direto para o Drive.';
  }
  if (/File not found|not found|insufficient|permission|forbidden/i.test(m)) {
    return inFolder
      ? 'Esta pasta não aceitou o envio pelo Planeje. Envie pelo site do Drive nesta pasta e depois escolha o arquivo aqui.'
      : 'Sem permissão para enviar neste Drive. Reconecte o Google Drive.';
  }
  return m || 'Não deu para enviar ao Drive.';
}

export function attachmentHasInAppImage(item) {
  if (attachmentHasInAppVideo(item)) return false;
  if (isDriveImage(item)) {
    return Boolean(String(item?.url || item?.thumbnail_url || '').trim());
  }
  return isPlayableImageUrl(item?.url, item?.mime_type);
}

export function driveOpenUrl(attachment) {
  const source = String(attachment?.source_url || '').trim();
  if (source) return source;
  const id = String(attachment?.external_file_id || '').trim();
  if (id) return driveViewUrl(id);
  return String(attachment?.url || '').trim();
}

export function describeDriveSync(sync) {
  if (!sync) return 'Não foi possível vincular o arquivo.';
  if (sync.skipReason === 'google_native') {
    return 'Este arquivo do Drive não é um vídeo baixável. Abra no Drive.';
  }
  if (isDriveVideo(sync.mimeType)) {
    return 'Vídeo fica no Drive. Toca daqui, sem copiar para o Planeje.';
  }
  if (isDriveImage(sync.mimeType)) {
    return 'Imagem fica no Drive. Aparece daqui, sem copiar para o Planeje.';
  }
  return 'Arquivo fica no Drive. O Planeje só guarda o vínculo.';
}

export function buildDriveAttachmentPayload({ taskId, publicationId = null, file, sync }) {
  const mapped = sync?.file && typeof sync.file === 'object' ? sync.file : file;
  const fileId = mapped?.id || file?.id || null;
  const mime = sync?.mimeType || mapped?.mimeType || file?.mimeType || null;
  const driveUrl =
    sync?.driveUrl ||
    mapped?.webViewLink ||
    file?.webViewLink ||
    (fileId ? driveViewUrl(fileId) : '');
  const size = sync?.size ?? mapped?.size ?? file?.size ?? null;
  return {
    task_id: taskId,
    name: mapped?.name || file?.name || 'Arquivo Drive',
    url: driveUrl,
    source_url: driveUrl || null,
    provider: 'google_drive',
    publication_id: publicationId,
    external_file_id: fileId,
    mime_type: mime,
    size_bytes: size == null ? null : Number(size),
    thumbnail_url: null,
  };
}

export function isGoogleDriveAssetUrl(url) {
  const value = String(url || '');
  if (!value || isPlanejeStoredMedia(value)) return false;
  return Boolean(driveFileIdFromUrl(value)) || /drive\.google\.com/i.test(value);
}

export function publicationNeedsDriveStaging(publication) {
  const url = String(publication?.asset_url || publication?.source_url || publication?.url || '');
  if (isPlanejeStoredMedia(url)) return false;
  if (isGoogleDriveAssetUrl(url)) return true;
  return Boolean(driveFileIdFromAttachment(publication));
}

export async function insertTaskDriveAttachment(client, payload) {
  let { data, error } = await client.from('task_attachments').insert(payload).select('*').maybeSingle();
  if (error && (String(error.message || '').includes('source_url') || error.code === 'PGRST204')) {
    const withoutSource = { ...payload };
    delete withoutSource.source_url;
    const retry = await client.from('task_attachments').insert(withoutSource).select('*').maybeSingle();
    data = retry.data;
    error = retry.error;
  }
  if (error && (String(error.message || '').includes('provider') || error.code === 'PGRST204')) {
    const fallback = await client.from('task_attachments').insert({
      task_id: payload.task_id,
      name: payload.name,
      url: payload.url,
    }).select('*').maybeSingle();
    data = fallback.data;
    error = fallback.error;
  }
  if (error) throw error;
  return data;
}
