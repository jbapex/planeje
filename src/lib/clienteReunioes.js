export const PENDING_REUNIAO_KEY = 'planeje-reuniao-pendente';
export const CAPTION_SETTLE_MS = 2000;
export const MEET_CODE_RE = /^[a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3}$/;

const STATUS_LABEL = {
  marcada: 'Marcada',
  em_andamento: 'Em andamento',
  transcrita: 'Transcrita',
};

export function reuniaoStatusLabel(status) {
  return STATUS_LABEL[status] || 'Marcada';
}

export function parseMeetCode(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  const fromUrl = raw.match(/meet\.google\.com\/([a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3})(?:[/?#]|$)/);
  const code = fromUrl ? fromUrl[1] : raw.split(/[?#\s]/)[0];
  if (code === 'new' || code === 'landing') return '';
  return MEET_CODE_RE.test(code) ? code : '';
}

export function meetUrl(code) {
  const parsed = parseMeetCode(code);
  return parsed ? `https://meet.google.com/${parsed}` : '';
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function sameCaptionLine(prev, next) {
  if (!prev || !next) return false;
  if (prev === next) return true;
  return next.startsWith(prev) || prev.startsWith(next);
}

function longerText(prev, next) {
  return next.length >= prev.length ? next : prev;
}

export function pushCaption(open, sample, at) {
  const speaker = cleanText(sample?.speaker).slice(0, 120) || 'Alguém';
  const text = cleanText(sample?.text).slice(0, 4000);
  if (!text) return { open: open || null, closed: null };
  if (!open) {
    return { open: { speaker, text, inicio: at, fim: at }, closed: null };
  }
  if (open.speaker === speaker && sameCaptionLine(open.text, text)) {
    return {
      open: { ...open, text: longerText(open.text, text), fim: at },
      closed: null,
    };
  }
  return {
    open: { speaker, text, inicio: at, fim: at },
    closed: { ...open, fim: at },
  };
}

export function dominantSpeaker(log, start, end, skipName = '') {
  const counts = new Map();
  let best = '';
  let bestCount = 0;
  const skip = String(skipName || '').trim();
  (log || []).forEach((entry) => {
    const at = Number(entry && entry.t);
    const name = String((entry && entry.name) || '').trim();
    if (!name || at < start || at > end) return;
    if (skip && name === skip) return;
    const count = (counts.get(name) || 0) + 1;
    counts.set(name, count);
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  });
  return best;
}

export function settleCaption(open, at, waitMs = CAPTION_SETTLE_MS) {
  if (!open) return { open: null, closed: null };
  if (Number(at) - Number(open.fim) < waitMs) return { open, closed: null };
  return { open: null, closed: { ...open, fim: at } };
}

export function formatFalaClock(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function transcriptText(reuniao, falas) {
  const title = reuniao?.titulo || 'Reunião';
  const lines = (falas || []).map((fala) => {
    const clock = formatFalaClock(fala.inicio_em);
    const nome = fala.nome || 'Alguém';
    const texto = cleanFalaText(fala.texto);
    return texto ? `${clock ? `${clock} · ` : ''}${nome} · ${texto}` : '';
  });
  return [title, ...lines].filter(Boolean).join('\n');
}

function wordsOf(text) {
  return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((word) => word.length >= 3);
}

export function wordOverlap(a, b) {
  const x = wordsOf(a);
  const y = wordsOf(b);
  if (!x.length || !y.length) return 0;
  const shorter = x.length <= y.length ? x : y;
  const longer = new Set(x.length <= y.length ? y : x);
  const hits = shorter.filter((word) => longer.has(word)).length;
  return shorter.length < 2 ? (hits && x.join(' ') === y.join(' ') ? 1 : 0) : hits / shorter.length;
}

export function captionDelta(committed, current) {
  return rawCaptionDelta(committed, current).replace(/^[\s.,;:!?…-]+/, '');
}

function rawCaptionDelta(committed, current) {
  const done = String(committed || '');
  const now = String(current || '').replace(/\s+/g, ' ').trim();
  if (!done) return now;
  if (now.indexOf(done) === 0) return now.slice(done.length).trim();
  const doneWords = done.split(' ');
  for (let size = Math.min(6, doneWords.length); size >= 2; size -= 1) {
    const tail = doneWords.slice(-size).join(' ');
    const at = now.lastIndexOf(tail);
    if (at >= 0) return now.slice(at + tail.length).trim();
  }
  return now.length > done.length ? now.slice(done.length).trim() : '';
}

export function cleanFalaText(value) {
  return String(value || '')
    .replace(/portugu[eê]s do brasil\.?/gi, ' ')
    .replace(/\bcontext:/gi, ' ')
    .replace(/#{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,;:!?-]+/, '')
    .trim();
}

function foldText(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
}

export function groupFalas(falas) {
  const groups = [];
  (falas || []).forEach((fala) => {
    const texto = cleanFalaText(fala.texto);
    if (!texto) return;
    const nome = String(fala.nome || '').trim() || 'Alguém';
    const last = groups[groups.length - 1];
    if (last && last.nome === nome) {
      const prev = last.textos[last.textos.length - 1];
      const a = foldText(prev);
      const b = foldText(texto);
      if (b.startsWith(a)) last.textos[last.textos.length - 1] = texto;
      else if (!a.startsWith(b)) last.textos.push(texto);
      last.fim = fala.inicio_em || last.fim;
      return;
    }
    groups.push({ key: fala.id ?? `${nome}-${groups.length}`, nome, inicio: fala.inicio_em, fim: fala.inicio_em, textos: [texto] });
  });
  return groups;
}

export function speakerNames(falas) {
  const counts = new Map();
  (falas || []).forEach((fala) => {
    if (!cleanFalaText(fala.texto)) return;
    const nome = String(fala.nome || '').trim() || 'Alguém';
    counts.set(nome, (counts.get(nome) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([nome, total]) => ({ nome, total }));
}

