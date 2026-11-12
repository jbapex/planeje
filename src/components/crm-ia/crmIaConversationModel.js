export const AI_FLAG_CATEGORIES = [
  { value: 'off_topic', label: 'Fugiu do assunto' },
  { value: 'missing_information', label: 'Faltou informação' },
  { value: 'inappropriate_tone', label: 'Tom inadequado' },
  { value: 'too_long', label: 'Longa demais' },
  { value: 'incorrect_information', label: 'Informação incorreta' },
  { value: 'wrong_tool', label: 'Usou a ferramenta errada' },
  { value: 'other', label: 'Outro motivo' },
];

export function mergeConversationMessages(older, latest) {
  const rows = new Map();
  for (const message of [...older, ...latest]) rows.set(`${message.from_me ? 'sent' : 'inbox'}:${message.id}`, message);
  return [...rows.values()].sort((a, b) => (Date.parse(a.created_at) || 0) - (Date.parse(b.created_at) || 0) || String(a.id).localeCompare(String(b.id)));
}

export function refreshConversationMessages(loaded, latest) {
  const known = new Set(loaded.map(message => `${message.from_me ? 'sent' : 'inbox'}:${message.id}`));
  const overlaps = latest.some(message => known.has(`${message.from_me ? 'sent' : 'inbox'}:${message.id}`));
  return mergeConversationMessages(overlaps ? loaded : [], latest);
}

export function conversationMessageSender(message, contactName) {
  if (!message.from_me) return { label: message.sender_name || contactName, kind: 'contact', avatar: message.avatar_url };
  if (message.sender_kind === 'ai' || message.can_flag === true) return { label: 'IA', kind: 'ai' };
  if (message.sender_kind === 'human' && message.sender_name) return { label: message.sender_name, kind: 'human', avatar: message.avatar_url };
  if (message.sender_kind === 'automation') return { label: 'Automação', kind: 'automation' };
  return { label: 'Equipe · autor não identificado', kind: 'unknown' };
}

export function conversationSchedulePresets(now = new Date()) {
  return [['today15', 'Hoje às 15h', 0, 15], ['tomorrow9', 'Amanhã às 9h', 1, 9], ['tomorrow15', 'Amanhã às 15h', 1, 15], ['week9', 'Daqui a 7 dias às 9h', 7, 9]].map(([id, label, days, hour]) => {
    const when = new Date(now);
    when.setDate(when.getDate() + days);
    when.setHours(hour, 0, 0, 0);
    return { id, label: `${label} · ${when.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`, scheduled_at: when.toISOString(), disabled: when.getTime() <= now.getTime() };
  });
}

export function futureConversationSchedule(value, now = new Date()) {
  const when = new Date(value);
  if (!value || !Number.isFinite(when.getTime()) || when.getTime() <= now.getTime()) throw new Error('Escolha uma data e hora futuras.');
  const local = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (local && [when.getFullYear(), when.getMonth() + 1, when.getDate(), when.getHours(), when.getMinutes()].some((part, index) => part !== Number(local[index + 1]))) throw new Error('Escolha uma data e hora locais válidas.');
  return when.toISOString();
}
