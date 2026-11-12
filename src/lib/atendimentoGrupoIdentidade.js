export function digitsOnly(value) {
  return String(value ?? '').replace(/\D/g, '');
}

export function normalizeWhatsappPhone(value) {
  let digits = digitsOnly(value);
  if (!digits) return '';
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits;
}

export function phonesMatch(a, b) {
  const da = digitsOnly(a);
  const db = digitsOnly(b);
  if (!da || !db) return false;
  if (da === db) return true;
  const short = da.length <= db.length ? da : db;
  const long = da.length <= db.length ? db : da;
  if (short.length < 8) return false;
  return long.endsWith(short);
}

function senderDigits(sender) {
  return digitsOnly(sender?.phone || sender?.senderPhoneDigits || sender?.senderJid || sender?.jid || '');
}

export function findStaffBySender(staffRows, sender) {
  const phone = senderDigits(sender);
  const jid = String(sender?.senderJid || sender?.jid || '').toLowerCase();
  if (!phone && !jid) return null;
  for (const row of staffRows || []) {
    if (row?.phone && phone && phonesMatch(row.phone, phone)) return row;
    const rowJid = String(row?.sender_jid || '').toLowerCase();
    if (rowJid && jid && (jid === rowJid || jid.includes(digitsOnly(row.phone)))) return row;
  }
  return null;
}

export function findContatoResposta(contatos, sender) {
  const phone = senderDigits(sender);
  if (!phone) return null;
  for (const row of contatos || []) {
    if (row?.phone && phonesMatch(row.phone, phone)) return row;
  }
  return null;
}

/**
 * equipe: número ligado a um usuário do Planeje.
 * contato: número marcado no grupo para resposta rápida.
 * outro: o grupo já tem contatos marcados e este número não é um deles.
 * indefinido: o grupo ainda não tem marca; a análise de sempre decide.
 */
export function classificarRemetenteGrupo({ staffRows, contatos, sender }) {
  const staff = findStaffBySender(staffRows, sender);
  if (staff) return { kind: 'equipe', row: staff };
  const marked = (contatos || []).filter((row) => row?.phone);
  const contact = findContatoResposta(marked, sender);
  if (contact) return { kind: 'contato', row: contact };
  if (marked.length > 0) return { kind: 'outro', row: null };
  return { kind: 'indefinido', row: null };
}

/** null apaga o relógio. string liga. keep deixa como está. ia deixa a análise decidir. */
export function efeitoAguardoGrupo(kind, messageAt) {
  if (kind === 'equipe') return { action: 'clear' };
  if (kind === 'contato') return { action: 'start', at: messageAt || null };
  if (kind === 'outro') return { action: 'keep' };
  return { action: 'ia' };
}

export function nomeEquipe(row) {
  const label = String(row?.label || '').trim();
  if (!label) return '';
  return label.replace(/\s*[—–-]\s*equipe.*$/i, '').trim() || label;
}

export function aplicarNomeEquipe(messages, staffRows) {
  if (!staffRows?.length || !messages?.length) return messages;
  let changed = false;
  const next = messages.map((msg) => {
    if (!msg?.isGroup || msg.direction === 'out') return msg;
    const staff = findStaffBySender(staffRows, msg);
    const name = nomeEquipe(staff);
    if (!name) return msg;
    if (msg.senderName === name && msg.senderSubtitle === 'Equipe') return msg;
    changed = true;
    return { ...msg, senderName: name, senderSubtitle: 'Equipe', senderIsEquipe: true };
  });
  return changed ? next : messages;
}

function firstToken(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[\s—–-]+/)
    .filter(Boolean)[0] || '';
}

/** Uma letra a mais, a menos ou trocada. Não aproxima Rafael de Raphael. */
function nearFirstName(a, b) {
  if (!a || !b || a.length < 6 || b.length < 6) return false;
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    let edits = 0;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) edits += 1;
      if (edits > 1) return false;
    }
    return edits === 1;
  }
  const [shorter, longer] = a.length < b.length ? [a, b] : [b, a];
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < shorter.length && j < longer.length) {
    if (shorter[i] === longer[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    j += 1;
    if (edits > 1) return false;
  }
  return true;
}

export function rowForUser(rows, user) {
  if (!user?.id) return null;
  const linked = (rows || []).find((row) => row.profile_id === user.id);
  if (linked) return linked;
  const first = String(user.full_name || '').trim().split(/\s+/)[0].toLowerCase();
  if (first.length < 4) return null;
  return (
    (rows || []).find((row) => {
      if (row.profile_id && row.profile_id !== user.id) return false;
      const label = String(row.label || '').toLowerCase();
      const match = String(row.name_match || '').toLowerCase();
      const labelFirst = firstToken(label);
      return match === first || label.startsWith(first) || nearFirstName(match, first) || nearFirstName(labelFirst, first);
    }) || null
  );
}
