function civilInstant(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null;
  const instant = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(instant.getTime()) && instant.toISOString().slice(0,10) === date ? instant : null;
}

export function agendaCivilDate(value, timeZone) {
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(instant).map(part => [part.type, part.value]));
  return `${parts.year.padStart(4,'0')}-${parts.month}-${parts.day}`;
}

export function shiftAgendaDate(date, days) {
  const instant = civilInstant(date);
  if (!instant) return '';
  instant.setUTCDate(instant.getUTCDate()+days);
  return instant.toISOString().slice(0,10);
}

export function agendaRange(date, view) {
  const instant = civilInstant(date);
  if (!instant) return { since:'', until:'', days:[] };
  const since = view === 'week' ? shiftAgendaDate(date,-instant.getUTCDay()) : date;
  const days = Array.from({length:view === 'week' ? 7 : 1},(_,index) => shiftAgendaDate(since,index));
  return { since, until:days.at(-1), days };
}

export function agendaWeekLayout(rows, dates, timeZone) {
  const days = dates.map(date => ({date,events:[]})), byDate = new Map(days.map(day => [day.date,day])), outside = [];
  const clock = new Intl.DateTimeFormat('en-GB', {timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const minutes = value => { const parts = Object.fromEntries(clock.formatToParts(new Date(value)).map(part => [part.type,part.value])); return Number(parts.hour)*60+Number(parts.minute); };
  for (const item of rows) {
    const date = agendaCivilDate(item.start_at,timeZone), day = byDate.get(date);
    if (!day || agendaCivilDate(item.end_at,timeZone) !== date) { outside.push(item); continue; }
    const start = minutes(item.start_at), end = minutes(item.end_at);
    if (start<7*60 || end>20*60 || end<=start) { outside.push(item); continue; }
    const height = Math.max(24,end-start);
    day.events.push({item,top:Math.min(start-7*60,13*60-height),height});
  }
  for (const day of days) {
    day.events.sort((a,b) => a.top-b.top || String(a.item.id).localeCompare(String(b.item.id)));
    let group = [], ends = [], groupEnd = -1;
    const finish = () => { for (const event of group) event.lanes = ends.length; group=[]; ends=[]; };
    for (const event of day.events) {
      if (event.top>=groupEnd) finish();
      const free = ends.findIndex(end => end<=event.top);
      event.lane = free<0 ? ends.length : free;
      ends[event.lane] = event.top+event.height;
      groupEnd = Math.max(...ends); group.push(event);
    }
    finish();
  }
  return {days,outside};
}
