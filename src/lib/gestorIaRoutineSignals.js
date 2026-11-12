const fold = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function maskRoutinePhone(value) {
  const digits = String(value || '').split('@')[0].replace(/\D/g, '');
  return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : digits ? '••••' : 'Não informado';
}

export function maskRoutineText(value) {
  return String(value || '').replace(/\+?\d[\d\s().-]{8,}\d(?:@(?:s\.whatsapp\.net|c\.us|lid|g\.us))?/g, (phone) => maskRoutinePhone(phone));
}

export function hasAppointmentNegation(value) {
  return /\b(?:desmarc\w*|cancel\w*|sem agendamento|nao\b.{0,35}\b(?:agend\w*|confirm\w*|marcad\w*|posso|poderei|vou|consigo))\b/.test(fold(value));
}

const localDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
function messageDay(at) {
  if (!Number.isFinite(Date.parse(at))) return '';
  const parts = localDay.formatToParts(new Date(at));
  return ['year', 'month', 'day'].map((type) => parts.find((part) => part.type === type).value).join('-');
}

function appointmentInText(text, at) {
  const day = messageDay(at);
  if (!day) return null;
  const stamp = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  const br = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\b/);
  let date = stamp ? stamp[0] : br ? `${br[3] || day.slice(0, 4)}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}` : '';
  if (!date && /\b(?:amanha|hoje)\b/.test(text)) {
    const relative = new Date(`${day}T12:00:00Z`);
    if (/\bamanha\b/.test(text)) relative.setUTCDate(relative.getUTCDate() + 1);
    date = relative.toISOString().slice(0, 10);
  }
  if (!date || !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) return null;
  const time = text.match(/\b([0-2]?\d)(?::([0-5]\d)|h(?:([0-5]\d))?(?!\d))\b/);
  if (!time || Number(time[1]) > 23) return null;
  return { date, time: `${time[1].padStart(2, '0')}:${time[2] || time[3] || '00'}` };
}

/** Evidência conservadora: proposta não é agendamento; cancelamento posterior invalida a confirmação. */
export function detectRoutineAppointment(messages = []) {
  let proposed = null;
  let confirmed = null;
  const ordered = [...messages].filter((m) => Number.isFinite(Date.parse(m.at)) && ['lead', 'equipe'].includes(m.direction))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || String(a.id).localeCompare(String(b.id)));
  for (const message of ordered) {
    const text = fold(message.text).trim();
    if (hasAppointmentNegation(text)) { proposed = null; confirmed = null; continue; }
    if (/\b(?:se|caso|quando|talvez|ainda|pendente|pendencia|aguard\w*|precis\w*|falt\w*|necessit\w*|deve\w*)\b|\b(?:a|para|por) confirmar\b/.test(text)) { proposed = null; continue; }
    const appointment = appointmentInText(text, message.at);
    const appointmentContext = /\b(?:agend(?:ar|ad[oa]s?|amento(?:s)?|ei|ou)|reagend(?:ar|ad[oa]s?|ei|ou)|marc(?:ar|ad[oa]s?|ou|acao|acoes)|marquei|horario|visita|prova|atendimento|consulta|te esperamos|nos vemos|comparecer|encontro)\b/.test(text);
    const confirms = !text.includes('?') && /\b(?:confirmo|confirmad[oa]s?|combinad[oa]|agendei|marquei|reservad[oa]|te esperamos|nos vemos|ficou (?:agendad|marcad)[oa]|esta (?:agendad|marcad)[oa])\b/.test(text);
    if (appointment && appointmentContext && confirms) confirmed = { ...appointment, confirmedAt: message.at };
    else if (proposed && message.direction !== proposed.direction && Date.parse(message.at) - Date.parse(proposed.at) <= 48 * 3600000
      && !text.includes('?') && /^(?:sim\b|confirmo\b|confirmad[oa]\b|combinado\b|pode marcar\b|pode agendar\b|ok[.!\s]*$)/.test(text)) {
      confirmed = { date: proposed.date, time: proposed.time, confirmedAt: message.at };
      proposed = null;
    }
    if (appointment && appointmentContext) proposed = { ...appointment, at: message.at, direction: message.direction };
    else if (text.includes('?')) proposed = null;
  }
  return confirmed;
}
