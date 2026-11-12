import { supabase } from '@/lib/customSupabaseClient';
import { googleDriveOAuthErrorMessage } from '@/lib/googleDriveAgency';
import {
  DRIVE_UPLOAD_CHUNK_BYTES,
  DRIVE_UPLOAD_MAX_BYTES,
  describeDriveUploadFailure,
  driveUploadContentRange,
  normalizeDriveFavorite,
} from '@/lib/googleDriveMedia';

const FUNCTION_NAME = import.meta.env?.VITE_GOOGLE_DRIVE_FUNCTION || 'google-drive-api';

export async function invokeGoogleDrive(body) {
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body });
  if (error) {
    let msg = data?.error || error.message || 'Falha ao chamar Google Drive';
    try {
      const ctx = error.context;
      if (ctx && typeof ctx.json === 'function') {
        const j = await ctx.json();
        if (j?.error) msg = typeof j.error === 'string' ? j.error : j.error.message || msg;
      }
    } catch {
      // ignore
    }
    throw new Error(googleDriveOAuthErrorMessage(msg));
  }
  if (data?.error) throw new Error(googleDriveOAuthErrorMessage(data.error));
  return data;
}

export async function fetchGoogleDriveOAuthConfig() {
  return invokeGoogleDrive({ action: 'oauth-config' });
}

export async function fetchGoogleDriveFavorite(clienteId) {
  if (!clienteId) return null;
  const { data, error } = await supabase
    .from('cliente_google_drive_connection')
    .select('favorite_folder_id, favorite_folder_name')
    .eq('cliente_id', clienteId)
    .maybeSingle();
  if (error) throw error;
  return normalizeDriveFavorite(data);
}

export async function setGoogleDriveFavorite(clienteId, folderId, folderName) {
  if (!clienteId) throw new Error('Cliente necessário');
  const { error } = await supabase.rpc('set_cliente_google_drive_favorite', {
    p_cliente_id: clienteId,
    p_folder_id: folderId || null,
    p_folder_name: folderName || null,
  });
  if (error) throw error;
}

export async function fetchGoogleDriveStatus(clienteId) {
  if (!clienteId) {
    return { connected: false, email: null, status: 'disconnected', oauthConfigured: false };
  }
  return invokeGoogleDrive({ action: 'status', clienteId });
}

export async function getGoogleDriveAuthUrl(clienteId, returnTo) {
  return invokeGoogleDrive({
    action: 'get-auth-url',
    clienteId,
    returnTo: returnTo || `${window.location.hash.replace(/^#/, '') || '/crm/canais'}`,
  });
}

export async function disconnectGoogleDrive(clienteId) {
  return invokeGoogleDrive({ action: 'disconnect', clienteId });
}

export async function listGoogleDriveFiles(
  clienteId,
  { folderId = 'root', pageToken, q, mediaOnly = true } = {},
) {
  return invokeGoogleDrive({
    action: 'list',
    clienteId,
    folderId,
    pageToken: pageToken || undefined,
    q: q || undefined,
    mediaOnly,
  });
}

export async function syncGoogleDriveFile(clienteId, fileId) {
  if (!fileId) throw new Error('Arquivo do Drive sem identificação');
  return invokeGoogleDrive({
    action: 'sync-file',
    clienteId,
    fileId,
  });
}

export async function getGoogleDriveStreamUrl(clienteId, fileId) {
  if (!fileId) throw new Error('Arquivo do Drive sem identificação');
  return invokeGoogleDrive({
    action: 'stream-url',
    clienteId,
    fileId,
  });
}

export async function previewGoogleDriveThumb(clienteId, fileId) {
  if (!fileId) return { dataUrl: null };
  return invokeGoogleDrive({
    action: 'preview-thumb',
    clienteId,
    fileId,
  });
}

export async function uploadGoogleDriveFile(clienteId, { name, mimeType, contentBase64, folderId }) {
  return invokeGoogleDrive({
    action: 'upload',
    clienteId,
    name,
    mimeType,
    contentBase64,
    folderId: folderId || 'root',
  });
}

async function putDriveUploadChunk(uploadUrl, proxyPath, chunk, range, mimeType) {
  const headers = {
    'Content-Range': range,
    'Content-Type': mimeType || 'application/octet-stream',
  };
  try {
    return await fetch(uploadUrl, { method: 'PUT', headers, body: chunk });
  } catch {
    if (!proxyPath) throw new Error('Não deu para enviar ao Drive.');
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const proxyHeaders = { ...headers };
    if (token) proxyHeaders.Authorization = `Bearer ${token}`;
    if (key) proxyHeaders.apikey = key;
    return fetch(proxyPath, { method: 'PUT', headers: proxyHeaders, body: chunk });
  }
}

export async function uploadGoogleDriveResumable(clienteId, file, { folderId = 'root', onProgress } = {}) {
  if (!file) throw new Error('Escolha um arquivo');
  if (file.size > DRIVE_UPLOAD_MAX_BYTES) {
    throw new Error('Arquivo maior que 2 GB. Envie pelo site do Drive e escolha aqui.');
  }
  const inFolder = Boolean(folderId) && folderId !== 'root' && folderId !== 'shared' && folderId !== 'recent-videos';
  const session = await invokeGoogleDrive({
    action: 'upload-session',
    clienteId,
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    folderId: folderId || 'root',
  });
  const uploadUrl = session?.uploadUrl;
  if (!uploadUrl) throw new Error('Google não iniciou o envio');
  const proxyPath = session.proxyPath || null;
  let offset = 0;
  let created = null;
  while (offset < file.size) {
    const end = Math.min(offset + DRIVE_UPLOAD_CHUNK_BYTES, file.size);
    const chunk = file.slice(offset, end);
    const range = driveUploadContentRange(offset, end, file.size);
    const res = await putDriveUploadChunk(uploadUrl, proxyPath, chunk, range, file.type);
    if (res.status === 308) {
      const sent = res.headers.get('Range') || '';
      const last = Number((sent.match(/bytes=0-(\d+)/) || [])[1]);
      offset = Number.isFinite(last) ? last + 1 : end;
      onProgress?.(Math.min(99, Math.round((offset / file.size) * 100)));
      continue;
    }
    if (!res.ok) {
      let msg = `Upload falhou (${res.status})`;
      try {
        const j = await res.json();
        msg = j?.error?.message || j?.error || msg;
      } catch {
        // ignore
      }
      throw new Error(describeDriveUploadFailure(msg, { inFolder }));
    }
    created = await res.json().catch(() => null);
    offset = end;
    onProgress?.(100);
  }
  return { file: created, storedInRoot: Boolean(session.storedInRoot) };
}

export async function stageGoogleDriveForMeta(clienteId, fileId) {
  if (!clienteId) throw new Error('Cliente necessário');
  if (!fileId) throw new Error('Arquivo do Drive sem identificação');
  return invokeGoogleDrive({
    action: 'stage-for-meta',
    clienteId,
    fileId,
  });
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
    reader.readAsDataURL(file);
  });
}
