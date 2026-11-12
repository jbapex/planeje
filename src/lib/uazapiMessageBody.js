function pickString(...values) {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

/** Extrai texto de payloads uazapi (várias estruturas aninhadas). */
export function extractUazapiMessageBody(payload = {}, body = {}) {
  const direct = pickString(
    payload.body,
    payload.text,
    typeof payload.content === 'string' ? payload.content : '',
    body.body,
    body.text
  );
  if (direct) return direct;

  const message = payload.message ?? body.message;
  if (typeof message === 'string' && message.trim()) return message.trim();
  if (!message || typeof message !== 'object') return '';

  const msg = message;
  const fromConversation = pickString(msg.conversation, msg.text);
  if (fromConversation) return fromConversation;

  const ext = msg.extendedTextMessage;
  if (ext && typeof ext === 'object') {
    const t = pickString(ext.text);
    if (t) return t;
  }

  const content = msg.content;
  if (typeof content === 'string' && content.trim()) return content.trim();
  if (content && typeof content === 'object') {
    const t = pickString(content.text, content.caption, content.title);
    if (t) return t;
  }

  const image = msg.imageMessage;
  if (image && typeof image === 'object') {
    const t = pickString(image.caption);
    if (t) return t;
  }

  return '';
}

export function messageBodyForDisplay(row) {
  const body = row?.body?.trim();
  if (body) return body;

  if (row?.raw_payload && typeof row.raw_payload === 'object') {
    const raw = row.raw_payload;
    const payload = raw.data && typeof raw.data === 'object' ? raw.data : raw;
    const extracted = extractUazapiMessageBody(payload, raw);
    if (extracted) return extracted;
  }

  const type = (row?.type || 'mensagem').toLowerCase();
  if (type === 'text' || type === 'chat') return '(mensagem sem texto)';
  if (type === 'image') return '[Imagem]';
  if (type === 'audio' || type === 'ptt' || type === 'myaudio' || type === 'voice') return '[Áudio]';
  if (type === 'video') return '[Vídeo]';
  if (type === 'document') return '[Documento]';
  if (type === 'sticker') return '[Figurinha]';
  return `[${type}]`;
}

export function jidPhoneDigits(jid) {
  if (!jid) return '';
  return String(jid).replace(/@.*$/, '').replace(/\D/g, '');
}
