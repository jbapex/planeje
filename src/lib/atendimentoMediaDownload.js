import { supabase } from '@/lib/customSupabaseClient';
import { invokeEdgeFunction } from '@/lib/supabaseFunctions';

/** Cache em memória por sessão (message_id + canal). */
const mediaUrlCache = new Map();

function cacheKey({ clienteId, whatsappConfigId, messageId }) {
  return `${clienteId || ''}:${whatsappConfigId || ''}:${messageId}`;
}

async function getAccessTokenForFunctions() {
  let {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    const { data: refreshed, error } = await supabase.auth.refreshSession();
    if (error || !refreshed.session?.access_token) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }
    session = refreshed.session;
  }
  return session.access_token;
}

/** URL exibível direto no browser (CDN uazapi decodificado, data URL, storage). */
export function isStableMediaUrl(url) {
  const u = String(url || '').trim();
  if (!u) return false;
  if (u.startsWith('data:')) return true;
  if (/\.enc(\?|#|$)/i.test(u)) return false;
  if (/\.uazapi\.com/i.test(u)) return true;
  if (/supabase\.co\/storage\//i.test(u)) return true;
  return false;
}

function ensureDocumentFileName(name, mimetype) {
  const base = String(name || '').trim() || 'documento';
  if (/\.[a-z0-9]{2,5}$/i.test(base)) return base;
  const mime = String(mimetype || '').toLowerCase();
  if (mime.includes('pdf')) return `${base}.pdf`;
  if (mime.includes('word') || mime.includes('document')) return `${base}.docx`;
  if (mime.includes('sheet') || mime.includes('excel')) return `${base}.xlsx`;
  return base;
}

/**
 * Dispara download no browser com nome de arquivo correto (evita .enc de URLs externas).
 */
export function triggerMediaFileDownload({ url, fileName, mimetype }) {
  if (!url) return;

  const safeName = ensureDocumentFileName(fileName, mimetype);

  if (String(url).startsWith('data:')) {
    const a = document.createElement('a');
    a.href = url;
    a.download = safeName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }

  fetch(url)
    .then((res) => res.blob())
    .then((blob) => {
      const type = mimetype || blob.type || 'application/octet-stream';
      const fileBlob = blob.type ? blob : new Blob([blob], { type });
      const objectUrl = URL.createObjectURL(fileBlob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = safeName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    })
    .catch(() => {
      window.open(url, '_blank', 'noopener,noreferrer');
    });
}

/**
 * Baixa mídia via edge function uazapi-download-media.
 * Retorna { url, fileName, mimetype }.
 */
export async function fetchAtendimentoMediaUrl({
  uazapiMessageId,
  messageIds,
  clienteId,
  whatsappConfigId,
  fileName,
  mediaKind,
  chatJid,
  forceRefresh = false,
}) {
  const ids = [
    ...(Array.isArray(messageIds) ? messageIds : []),
    uazapiMessageId,
  ]
    .map((id) => String(id || '').trim())
    .filter(Boolean);
  const uniqueIds = [...new Set(ids)].sort((a, b) => {
    const rank = (id) => {
      if (/^r[0-9a-f]{6,}$/i.test(id)) return 0;
      if (/^[A-F0-9]{12,}$/i.test(id)) return 1;
      if (id.includes(':')) return 2;
      return 3;
    };
    return rank(a) - rank(b);
  });
  if (!uniqueIds.length || !clienteId) return null;

  const primaryId = uniqueIds[0];
  const key = cacheKey({ clienteId, whatsappConfigId, messageId: primaryId });
  if (!forceRefresh && mediaUrlCache.has(key)) return mediaUrlCache.get(key);

  const accessToken = await getAccessTokenForFunctions();
  const { data, error } = await invokeEdgeFunction(
    'uazapi-download-media',
    {
      message_id: primaryId,
      message_ids: uniqueIds,
      cliente_id: clienteId,
      whatsapp_config_id: whatsappConfigId || undefined,
      file_name: fileName || undefined,
      media_kind: mediaKind || undefined,
      generate_mp3: mediaKind === 'audio' ? true : undefined,
      chat_jid: chatJid || undefined,
    },
    accessToken
  );

  if (error) throw new Error(error.message || 'Erro ao baixar mídia.');
  if (data?.error) throw new Error(data.error);

  const url = data?.url || data?.fileURL || data?.fileUrl || null;
  if (!url) return null;

  const result = {
    url,
    fileName: data?.fileName || fileName || null,
    mimetype: data?.mimetype || null,
  };

  mediaUrlCache.set(key, result);
  for (const id of uniqueIds) {
    mediaUrlCache.set(cacheKey({ clienteId, whatsappConfigId, messageId: id }), result);
  }
  return result;
}

export function clearAtendimentoMediaCache() {
  mediaUrlCache.clear();
}

/** Mensagem precisa fetch se é mídia sem URL estável ou só thumbnail embutido. */
export function messageNeedsMediaDownload(msg) {
  if (!msg || msg.kind === 'text' || msg.mediaPurged) return false;
  const hasIds = Boolean(msg.uazapiMessageId) || (msg.downloadMessageIds?.length > 0);
  if (!hasIds) return false;
  const url = msg.media?.url;
  if (!url) return true;
  if (msg.media?.isThumbnail) return true;
  if (!isStableMediaUrl(url)) return true;
  return false;
}
