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

export function shiftAgendaMonth(date, months) {
  const instant = civilInstant(date);
  if (!instant || !Number.isInteger(months)) return '';
  const day = instant.getUTCDate();
  instant.setUTCDate(1);instant.setUTCMonth(instant.getUTCMonth()+months);
  const last = new Date(instant);last.setUTCMonth(last.getUTCMonth()+1,0);
  instant.setUTCDate(Math.min(day,last.getUTCDate()));
  const result = instant.toISOString().split('T')[0];
  return civilInstant(result) ? result : '';
}

export function agendaRange(date, view) {
  const instant = civilInstant(date);
  if (!instant) return { since:'', until:'', days:[] };
  const anchor = view==='month' ? `${date.slice(0,7)}-01` : date;
  const since = ['week','month'].includes(view) ? shiftAgendaDate(anchor,-civilInstant(anchor).getUTCDay()) : date;
  const days = Array.from({length:view==='month' ? 42 : view==='week' ? 7 : 1},(_,index) => shiftAgendaDate(since,index));
  return { since, until:days.at(-1), days };
}

export function agendaSlotAt(rows, { date, time, owner_id }, timeZone) {
  if (!civilInstant(date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time||'') || !owner_id) return '';
  const clock = new Intl.DateTimeFormat('en-GB',{timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const matches = (rows||[]).filter(row=>row.owner_id===owner_id && agendaCivilDate(row.start_at,timeZone)===date && clock.format(new Date(row.start_at))===time);
  return matches.length===1 ? matches[0].start_at : '';
}

export function agendaWeekLayout(rows, dates, timeZone) {
  const days = dates.map(date => ({date,events:[]})), byDate = new Map(days.map(day => [day.date,day])), outside = [];
  const clock = new Intl.DateTimeFormat('en-GB', {timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const minutes = value => { const parts = Object.fromEntries(clock.formatToParts(new Date(value)).map(part => [part.type,part.value])); return Number(parts.hour)*60+Number(parts.minute); };
  for (const item of rows) {
    const date = agendaCivilDate(item.start_at,timeZone), day = byDate.get(date);
    if (!day || agendaCivilDate(item.end_at,timeZone) !== date) { outside.push(item); continue; }
    const start = minutes(item.start_at), end = minutes(item.end_at);
    if (start<7*60 || end>21*60 || end<=start) { outside.push(item); continue; }
    const height = Math.max(24,end-start);
    day.events.push({item,top:Math.min(start-7*60,14*60-height),height});
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
