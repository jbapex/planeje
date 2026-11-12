/**
 * Cliente só confirmou (curtida, reação, ok). Não pede resposta da equipe.
 */

const ACK_WORDS = new Set([
  'ok',
  'okk',
  'okey',
  'okay',
  'blz',
  'beleza',
  'valeu',
  'vlw',
  'obrigado',
  'obrigada',
  'obg',
  'show',
  'perfeito',
  'combinado',
  'fechou',
  'tmj',
  'top',
  'massa',
]);

const ACK_EMOJI = new Set(['👍', '👌', '✅', '✔', '✔️', '👏', '🙌', '❤', '❤️', '😍', '🙏', '💯']);

function stripAckDecorations(value) {
  return String(value || '')
    .replace(/[\uFE0F\u200D]/g, '')
    .replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '')
    .trim();
}

function isAckEmojiChar(ch) {
  return ACK_EMOJI.has(ch);
}

function lowerType(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

export function isUazapiReactionInbound(payload, message) {
  const msg = message && typeof message === 'object' ? message : payload?.message;
  if (msg?.reactionMessage) return true;
  const typeVals = [payload?.type, payload?.messageType, msg?.type, msg?.messageType];
  if (typeVals.some((value) => {
    const t = lowerType(value);
    return t === 'reaction' || t === 'reactionmessage';
  })) return true;
  const content = msg?.content;
  if (content && typeof content === 'object' && (content.key || content.text) && (msg?.reaction || content.key)) {
    return true;
  }
  return false;
}

export function isClientAcknowledgment({ body, type } = {}) {
  const typeKey = String(type || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  if (typeKey === 'reaction' || typeKey === 'reactionmessage') return true;

  const raw = String(body || '').trim();
  if (!raw) return false;
  if (/^\[reaction/i.test(raw)) return true;
  if (raw.length > 40) return false;

  const stripped = stripAckDecorations(raw);
  const compact = stripped.replace(/\s+/g, '');
  if (compact && [...compact].every(isAckEmojiChar)) return true;

  const word = stripped
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/^[👍👌✅✔👏🙌❤😍🙏💯]+/g, '')
    .replace(/[!?.,…\s]+$/g, '')
    .replace(/^[!?.,…\s]+/g, '')
    .trim();
  if (!word) return compact.length > 0 && [...compact].every(isAckEmojiChar);
  return ACK_WORDS.has(word);
}
