import { supabase } from '@/lib/customSupabaseClient';
import { invokeGoogleDrive } from '@/lib/googleDriveClient';
import { describeMetaPublishError } from '@/lib/metaInstagramSchedule';
import {
  META_REELS_MAX_BYTES,
  META_RUPLOAD_CHUNK_BYTES,
  META_VIDEO_MAX_BYTES,
  shouldUseMetaResumable,
} from '@/lib/metaPublishMedia';

export { META_REELS_MAX_BYTES, META_RUPLOAD_CHUNK_BYTES, shouldUseMetaResumable };

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function resumableChunkPlan(fileSize, chunkBytes = META_RUPLOAD_CHUNK_BYTES) {
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

export function transferComplete(startOffset, endOffset) {
  const start = Number(startOffset);
  const end = Number(endOffset);
  return Number.isFinite(start) && Number.isFinite(end) && start === end;
}

async function invokeMetaAds(body) {
  const { data, error } = await supabase.functions.invoke('meta-ads-api', { body });
  if (error) {
    let msg = error.message || 'Falha ao chamar a Meta';
    try {
      const ctx = error.context;
      if (ctx && typeof ctx.json === 'function') {
        const parsed = await ctx.json();
        if (parsed?.error) {
          msg = describeMetaPublishError(parsed.error);
        }
      }
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  if (data?.error) {
    throw new Error(describeMetaPublishError(data.error));
  }
  return data;
}

async function putLocalIgChunk(proxyPath, chunk, offset, fileSize) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const headers = {
    'Content-Range': `bytes ${offset}-${offset + (chunk.size || chunk.byteLength || 0) - 1}/${fileSize}`,
    'Content-Type': 'application/octet-stream',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (key) headers.apikey = key;
  const res = await fetch(proxyPath, { method: 'PUT', headers, body: chunk });
  const parsed = await res.json().catch(() => ({}));
  if (parsed?.error) {
    throw new Error(describeMetaPublishError(parsed.error));
  }
  if (!res.ok) throw new Error(`Falha no envio (${res.status})`);
  return parsed;
}

async function waitIgFinished(creationId, onProgress) {
  let status = 'IN_PROGRESS';
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const st = await invokeMetaAds({
      action: 'get-ig-container-status',
      creation_id: creationId,
    });
    status = String(st?.status_code || '');
    onProgress?.({
      phase: 'process',
      percent: Math.min(99, 90 + Math.round((attempt / 90) * 9)),
      status,
    });
    if (status === 'FINISHED' || status === 'ERROR' || status === 'EXPIRED') break;
    await sleep(4000);
  }
  if (status !== 'FINISHED') {
    throw new Error(
      status === 'ERROR' || status === 'EXPIRED'
        ? `A Meta recusou o vídeo (${status}). Confira se é MP4 H.264 de até 15 min.`
        : 'A Meta ainda processa o vídeo. Tente publicar de novo em instantes.'
    );
  }
}

export async function publishLargeInstagramReel({
  instagramAccountId,
  clienteId,
  driveFileId = null,
  localFile = null,
  fileSize,
  caption = '',
  coverUrl = '',
  thumbOffset = null,
  scheduledUnix = null,
  holdPublish = false,
  onProgress,
} = {}) {
  let size = Number(fileSize || localFile?.size || 0);
  if (!size && driveFileId && clienteId) {
    const info = await invokeGoogleDrive({ action: 'file-info', clienteId, fileId: driveFileId });
    size = Number(info?.file?.size || 0);
  }
  if (!instagramAccountId) throw new Error('Escolha a conta Instagram');
  if (!size) throw new Error('Tamanho do vídeo desconhecido');
  if (size > META_REELS_MAX_BYTES) throw new Error('Vídeo maior que 1 GB. A Meta não aceita Reels acima disso.');
  if (!driveFileId && !localFile) throw new Error('Falta o arquivo do vídeo');

  onProgress?.({ phase: 'upload', percent: 1 });
  const start = await invokeMetaAds({
    action: 'start-ig-resumable-upload',
    instagram_account_id: instagramAccountId,
    file_size: size,
    caption,
    cover_url: coverUrl || undefined,
    thumb_offset: thumbOffset,
  });
  const creationId = start?.creation_id;
  const uri = start?.uri;
  const proxyPath = start?.proxyPath;
  if (!creationId) throw new Error('A Meta não iniciou o envio do Reels');

  let offset = 0;
  while (offset < size) {
    const length = Math.min(META_RUPLOAD_CHUNK_BYTES, size - offset);
    let next = offset + length;
    if (localFile) {
      if (!proxyPath) throw new Error('A Meta não abriu o canal de envio');
      const chunk = localFile.slice(offset, offset + length);
      const put = await putLocalIgChunk(proxyPath, chunk, offset, size);
      next = Number(put?.next_offset ?? offset + length);
    } else {
      const put = await invokeMetaAds({
        action: 'upload-ig-resumable-chunk',
        creation_id: creationId,
        uri,
        file_size: size,
        offset,
        length,
        clienteId,
        driveFileId,
      });
      next = Number(put?.next_offset ?? offset + length);
    }
    if (!Number.isFinite(next) || next <= offset) next = offset + length;
    offset = next;
    onProgress?.({
      phase: 'upload',
      percent: Math.min(90, Math.round((offset / size) * 90)),
    });
  }

  onProgress?.({ phase: 'process', percent: 92 });
  await waitIgFinished(creationId, onProgress);

  if (holdPublish) {
    onProgress?.({ phase: 'done', percent: 100 });
    return { creation_id: creationId, held: true };
  }

  const published = await invokeMetaAds({
    action: 'publish-ig-container',
    instagram_account_id: instagramAccountId,
    creation_id: creationId,
  });
  onProgress?.({ phase: 'done', percent: 100 });
  return published;
}

export async function publishLargeFacebookVideo({
  pageId,
  clienteId,
  driveFileId = null,
  localFile = null,
  fileSize,
  message = '',
  scheduledUnix = null,
  onProgress,
} = {}) {
  let size = Number(fileSize || localFile?.size || 0);
  if (!size && driveFileId && clienteId) {
    const info = await invokeGoogleDrive({ action: 'file-info', clienteId, fileId: driveFileId });
    size = Number(info?.file?.size || 0);
  }
  if (!pageId) throw new Error('Escolha a página');
  if (!size) throw new Error('Tamanho do vídeo desconhecido');
  if (size > META_REELS_MAX_BYTES) throw new Error('Vídeo maior que 1 GB.');
  if (!driveFileId && !localFile) throw new Error('Falta o arquivo do vídeo');
  if (localFile && !driveFileId) {
    throw new Error('Vídeo grande no Facebook sai do Drive. Envie o MP4 ao Drive deste cliente e escolha de lá.');
  }

  onProgress?.({ phase: 'upload', percent: 1 });
  const start = await invokeMetaAds({
    action: 'start-fb-video-upload',
    page_id: pageId,
    file_size: size,
  });
  const sessionId = start?.upload_session_id;
  if (!sessionId) throw new Error('A Meta não iniciou o vídeo da página');

  let startOffset = Number(start.start_offset || 0);
  let endOffset = Number(start.end_offset || 0);
  let guard = 0;
  while (!transferComplete(startOffset, endOffset) && guard < 400) {
    guard += 1;
    const length = Math.max(0, endOffset - startOffset);
    if (!length) break;
    const put = await invokeMetaAds({
      action: 'upload-fb-video-chunk',
      page_id: pageId,
      upload_session_id: sessionId,
      start_offset: startOffset,
      end_offset: endOffset,
      length,
      file_size: size,
      clienteId,
      driveFileId,
    });
    const nextStart = Number(put?.start_offset);
    const nextEnd = Number(put?.end_offset);
    if (!Number.isFinite(nextStart) || !Number.isFinite(nextEnd)) {
      throw new Error('A Meta não avançou o envio do vídeo');
    }
    if (nextStart === startOffset && nextEnd === endOffset) {
      throw new Error('A Meta não avançou o envio do vídeo');
    }
    startOffset = nextStart;
    endOffset = nextEnd;
    onProgress?.({
      phase: 'upload',
      percent: Math.min(95, Math.round((startOffset / Math.max(size, 1)) * 95)),
    });
  }

  const finished = await invokeMetaAds({
    action: 'finish-fb-video-upload',
    page_id: pageId,
    upload_session_id: sessionId,
    description: message,
    scheduled_publish_time: scheduledUnix || undefined,
  });
  onProgress?.({ phase: 'done', percent: 100 });
  return finished;
}

export function mediaNeedsResumable(media) {
  if (!media) return false;
  return shouldUseMetaResumable({
    kind: media.kind,
    size: media.size,
    large: media.large,
  });
}

export function belowStageLimit(size) {
  const n = Number(size);
  return Number.isFinite(n) && n > 0 && n <= META_VIDEO_MAX_BYTES;
}
