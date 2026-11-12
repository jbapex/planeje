/** Helpers para envio de mídia no atendimento WhatsApp (uazapi /send/media). */

export const ATENDIMENTO_MEDIA_MAX_BYTES = 4 * 1024 * 1024;
/** Acima disto o arquivo não cabe no JSON da função: sobe em partes e o WhatsApp recebe o link. */
export const ATENDIMENTO_INLINE_MAX_BYTES = ATENDIMENTO_MEDIA_MAX_BYTES;
/** Documento nas Conversas da agência. Foto, áudio e voz pequenos continuam no limite de 4 MB. */
export const ATENDIMENTO_AGENCIA_DOC_MAX_BYTES = 1024 * 1024 * 1024;
/** Cada parte do arquivo grande. O nginx do storage aceita até 100 MB por pedido. */
export const ATENDIMENTO_UPLOAD_CHUNK_BYTES = 32 * 1024 * 1024;

/** Tempo que falta, a partir do que já subiu. Vazio enquanto a conta ainda não fecha. */
export function formatUploadRemaining(remainingMs) {
  const ms = Number(remainingMs);
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const minutes = Math.ceil(ms / 60000);
  if (minutes <= 1) return 'falta menos de 1 min';
  return `faltam cerca de ${minutes} min`;
}

export function encodeTusMetadata(fields) {
  const bytesToBase64 = (value) => {
    const bytes = new TextEncoder().encode(String(value));
    let bin = '';
    for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  };
  return Object.entries(fields || {})
    .filter(([, value]) => value != null && String(value) !== '')
    .map(([key, value]) => `${key} ${bytesToBase64(value)}`)
    .join(',');
}

export const ATENDIMENTO_MEDIA_ACCEPT =
  '.jpg,.jpeg,.png,.webp,.gif,.pdf,.mp3,.ogg,.m4a,.wav,.webm,image/*,audio/*,application/pdf';

const DOC_EXT = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv|zip)$/i;
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|svg)$/i;
const AUDIO_EXT = /\.(mp3|ogg|m4a|wav|webm|opus|aac)$/i;

export function resolveUazapiMediaType(file) {
  if (!file) return null;
  const mime = String(file.type || '').toLowerCase();
  const name = String(file.name || '').toLowerCase();

  if (mime.startsWith('image/') || IMAGE_EXT.test(name)) return 'image';
  if (mime.startsWith('audio/') || AUDIO_EXT.test(name)) {
    if (mime.includes('ogg') || name.endsWith('.ogg') || mime.includes('opus')) return 'ptt';
    return 'audio';
  }
  if (mime === 'application/pdf' || mime.startsWith('application/') || DOC_EXT.test(name)) return 'document';
  return null;
}

export function formatFileSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return '';
  if (n >= 1024 * 1024 * 1024) return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (n >= 1024 * 1024) return `${Math.max(1, Math.round(n / (1024 * 1024)))} MB`;
  if (n >= 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${n} B`;
}

export function validateAtendimentoMediaFile(file, options = {}) {
  const maxBytes = Number(options.maxBytes) > 0 ? Number(options.maxBytes) : ATENDIMENTO_MEDIA_MAX_BYTES;
  const allowAnyDocument = Boolean(options.allowAnyDocument);
  if (!file) return { ok: false, message: 'Nenhum arquivo selecionado.' };
  if (!file.size) return { ok: false, message: 'Arquivo vazio.' };
  if (file.size > maxBytes) {
    const label = maxBytes >= ATENDIMENTO_AGENCIA_DOC_MAX_BYTES ? '1 GB' : '4 MB';
    return { ok: false, message: `Arquivo muito grande. Máximo ${label}.` };
  }
  if (file.size > ATENDIMENTO_INLINE_MAX_BYTES) {
    return { ok: true, mediaType: 'document', viaUrl: true };
  }
  const type = resolveUazapiMediaType(file);
  if (!type) {
    if (allowAnyDocument) return { ok: true, mediaType: 'document', viaUrl: false };
    return { ok: false, message: 'Tipo não suportado. Use imagem, PDF/documento ou áudio.' };
  }
  return { ok: true, mediaType: type, viaUrl: false };
}

export function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Não foi possível ler o arquivo.'));
        return;
      }
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error || new Error('Falha ao ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

export function sentMessagePreviewForMedia(mediaType, fileName, caption) {
  const cap = (caption || '').trim();
  if (cap) return cap;
  const name = fileName || 'arquivo';
  if (mediaType === 'image') return `[Imagem] ${name}`;
  if (mediaType === 'audio' || mediaType === 'ptt') return `[Áudio] ${name}`;
  return `[Documento] ${name}`;
}

export const ATENDIMENTO_EMOJIS = [
  '😀', '😊', '🙂', '😉', '😍', '🥰', '😘', '🤗',
  '😅', '😂', '🤣', '😢', '😭', '😡', '🤔', '😴',
  '👍', '👎', '🙏', '👏', '🤝', '💪', '✅', '❌',
  '❤️', '💙', '💚', '🔥', '⭐', '🎉', '📎', '📷',
  '📄', '🕐', '📅', '💬', '📞', '🏢', '🚀', '✨',
];

export function insertTextAtCursor(textarea, currentValue, insertText, onChange) {
  if (!textarea) {
    onChange((currentValue || '') + insertText);
    return;
  }
  const start = textarea.selectionStart ?? currentValue.length;
  const end = textarea.selectionEnd ?? currentValue.length;
  const next = `${currentValue.slice(0, start)}${insertText}${currentValue.slice(end)}`;
  onChange(next);
  const pos = start + insertText.length;
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.selectionStart = pos;
    textarea.selectionEnd = pos;
  });
}
