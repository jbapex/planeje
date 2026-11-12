export const TRACKABLE_MATCH_CODE_RE = /\bPJ-([A-Z0-9]{6})\b/i;

const ZERO = '\u200c';
const ONE = '\u2060';
// Six ONEs cannot occur inside an ASCII PJ code; the frame separates other invisible text.
const FRAME = ONE.repeat(6);
const CODE_RE = /^PJ-[A-Z0-9]{6}$/;

export function encodeHiddenMatchCode(value) {
  const code = String(value || '').trim().toUpperCase();
  if (!CODE_RE.test(code)) return '';
  const bits = Array.from(code, char => char.charCodeAt(0).toString(2).padStart(8, '0')).join('');
  return FRAME + bits.replace(/0/g, ZERO).replace(/1/g, ONE) + FRAME;
}

export function extractHiddenMatchCode(value) {
  let found = null;
  for (const run of String(value || '').match(/[\u200c\u2060]+/g) || []) {
    if (!run.includes(FRAME)) continue;
    if (!run.startsWith(FRAME) || run.length !== 84 || !run.endsWith(FRAME)) return null;
    const bits = run.slice(6, -6).replace(/\u200c/g, '0').replace(/\u2060/g, '1');
    let code = '';
    for (let i = 0; i < bits.length; i += 8) {
      code += String.fromCharCode(parseInt(bits.slice(i, i + 8), 2));
    }
    if (!CODE_RE.test(code) || (found && found !== code)) return null;
    found = code;
  }
  return found;
}

export function extractMatchCode(value) {
  const raw = String(value || '');
  const visible = raw.match(TRACKABLE_MATCH_CODE_RE);
  if (!raw.includes(FRAME)) return visible ? `PJ-${visible[1].toUpperCase()}` : null;
  const hidden = extractHiddenMatchCode(raw);
  if (!hidden) return null;
  for (const match of raw.matchAll(/\bPJ-([A-Z0-9]{6})\b/gi)) {
    if (`PJ-${match[1].toUpperCase()}` !== hidden) return null;
  }
  return hidden;
}
