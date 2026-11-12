/** Retenção de mídia nas conversas — arquivos ficam só no celular após o prazo. */
export const DEFAULT_MEDIA_RETENTION_DAYS = 35;

const MEDIA_TYPES = new Set([
  'image',
  'sticker',
  'video',
  'videoplay',
  'ptv',
  'audio',
  'ptt',
  'myaudio',
  'voice',
  'voicemessage',
  'document',
  'file',
]);

export function isAtendimentoMediaType(type: string | null | undefined): boolean {
  const t = String(type || '').toLowerCase().trim();
  return MEDIA_TYPES.has(t);
}

function payloadRoot(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (obj.data && typeof obj.data === 'object') return obj.data as Record<string, unknown>;
  return obj;
}

/** Detecta mensagem de mídia mesmo quando `type` veio genérico. */
export function rowLooksLikeMedia(row: { type?: string | null; raw_payload?: unknown }): boolean {
  if (isAtendimentoMediaType(row.type)) return true;
  const payload = payloadRoot(row.raw_payload);
  if (!payload) return false;
  if (isAtendimentoMediaType(String(payload.type ?? ''))) return true;

  const content = payload.content;
  if (content && typeof content === 'object') {
    const c = content as Record<string, unknown>;
    const mime = String(c.mimetype || '').toLowerCase();
    if (mime.startsWith('image/') || mime.startsWith('audio/') || mime.startsWith('video/')) return true;
    if (mime.includes('pdf') || mime.includes('document')) return true;
    if (c.ptt === true || c.audio === true || c.voice === true) return true;
  }

  const msg = payload.message;
  if (msg && typeof msg === 'object') {
    const m = msg as Record<string, unknown>;
    if (m.imageMessage || m.videoMessage || m.audioMessage || m.pttMessage || m.documentMessage || m.stickerMessage) {
      return true;
    }
  }

  return false;
}

function pickStr(...values: unknown[]): string | null {
  for (const v of values) {
    const s = String(v ?? '').trim();
    if (s) return s;
  }
  return null;
}

/** Substitui raw_payload pesado por metadados mínimos (IDs, legenda, nome do arquivo). */
export function buildPurgedMediaPayload(
  row: { type?: string | null; body?: string | null; message_id?: string | null },
  raw: unknown,
): Record<string, unknown> {
  const payload = payloadRoot(raw);
  const content =
    payload?.content && typeof payload.content === 'object' ? (payload.content as Record<string, unknown>) : null;
  const msg = payload?.message && typeof payload.message === 'object' ? (payload.message as Record<string, unknown>) : null;
  const key = payload?.key && typeof payload.key === 'object' ? (payload.key as Record<string, unknown>) : null;
  const msgKey = msg?.key && typeof msg.key === 'object' ? (msg.key as Record<string, unknown>) : null;

  const type = pickStr(row.type, payload?.type, content?.type) || 'file';
  const fileName = pickStr(content?.fileName, content?.title, payload?.fileName, payload?.title);
  const mimetype = pickStr(content?.mimetype, payload?.mimetype);
  const caption = pickStr(content?.caption, content?.text, payload?.caption, row.body);

  const minimalData: Record<string, unknown> = {
    id: pickStr(payload?.id, row.message_id),
    messageid: pickStr(payload?.messageid, payload?.messageId),
    messageId: pickStr(payload?.messageId, payload?.messageid),
    type,
    owner: pickStr(payload?.owner, payload?.instance),
    chatid: pickStr(payload?.chatid, payload?.chatId),
    fileName,
    mimetype,
    caption,
  };

  if (content) {
    minimalData.content = {
      type: pickStr(content.type, type),
      fileName,
      mimetype,
      caption,
      text: pickStr(content.text),
    };
  }

  if (key?.id) {
    minimalData.key = { id: key.id, fromMe: key.fromMe ?? null };
  }
  if (msgKey?.id) {
    minimalData.message = { key: { id: msgKey.id, fromMe: msgKey.fromMe ?? null } };
  }

  return {
    _mediaPurged: true,
    data: minimalData,
  };
}

export function isPayloadAlreadyPurged(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  return (raw as Record<string, unknown>)._mediaPurged === true;
}
