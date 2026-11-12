/**
 * Agrupa publicações por dia e horário, como o Planner da Meta:
 * um chip por slot, com Instagram e/ou Facebook no mesmo horário.
 */

function channelKind(channel) {
  const value = String(channel || '').toLowerCase();
  if (value.includes('instagram') || value === 'ig') return 'instagram';
  if (value.includes('facebook') || value === 'fb') return 'facebook';
  return 'other';
}

export function publicationPlannerDate(publication) {
  const at = publication?.scheduled_at;
  if (at) {
    const parsed = new Date(at);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const published = publication?.published_on;
  if (published && String(published).length > 10) {
    const parsed = new Date(published);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const day = String(publication?.scheduled_for || publication?.published_on || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return new Date(`${day}T09:00:00`);
  }
  return null;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

export function plannerTimeLabel(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function plannerDayKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function groupKey(publication, date) {
  const taskId = publication.task_id || publication.task?.id || publication.id;
  return `${taskId}|${plannerDayKey(date)}|${plannerTimeLabel(date)}`;
}

export function buildPlannerItems(publications = []) {
  const groups = new Map();
  const priority = { failed: 4, pending: 3, scheduled: 2, client_posts: 1, published: 0 };
  for (const publication of publications || []) {
    if (!publication || String(publication.status || '') === 'cancelled') continue;
    const date = publicationPlannerDate(publication);
    if (!date) continue;
    const key = groupKey(publication, date);
    const existing = groups.get(key);
    const kind = channelKind(publication.channel);
    const status = publication.status === 'scheduled' && !plannerPublicationState(publication).scheduled
      ? 'pending' : publication.status || 'pending';
    if (!existing) {
      groups.set(key, {
        id: key,
        date,
        dayKey: plannerDayKey(date),
        time: plannerTimeLabel(date),
        instagram: kind === 'instagram',
        facebook: kind === 'facebook',
        other: kind === 'other',
        status,
        title: publication.task?.title || publication.caption || publication.channel || 'Post',
        clientId: publication.task?.client_id || publication.client_id || null,
        clientName: publication.task?.clientes?.empresa || '',
        format: String(publication.format || publication.task?.type || '').toLowerCase(),
        taskType: String(publication.task?.type || '').toLowerCase(),
        caption: String(publication.caption || '').trim(),
        assetUrl: String(publication.asset_url || publication.source_url || '').trim(),
        publications: [publication],
      });
      continue;
    }
    existing.publications.push(publication);
    if (kind === 'instagram') existing.instagram = true;
    if (kind === 'facebook') existing.facebook = true;
    if (kind === 'other') existing.other = true;
    if (!existing.caption && publication.caption) existing.caption = String(publication.caption).trim();
    if (!existing.assetUrl) {
      existing.assetUrl = String(publication.asset_url || publication.source_url || '').trim();
    }
    // Um canal entregue não pode esconder trabalho pendente no mesmo conteúdo.
    if ((priority[status] ?? 3) > (priority[existing.status] ?? 3)) {
      existing.status = status;
    }
  }

  return [...groups.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function itemsForDay(items, day) {
  const key = plannerDayKey(day);
  return (items || []).filter((item) => item.dayKey === key);
}

export function matchesPlannerFilter(item, filter) {
  if (!filter || filter === 'all') return true;
  if (filter === 'instagram') return Boolean(item.instagram);
  if (filter === 'facebook') return Boolean(item.facebook);
  if (filter === 'reels') return plannerFormatLabel(item) === 'Reels';
  if (filter === 'post') {
    const format = String(item.format || '');
    return !format.includes('reel') && !format.includes('stor');
  }
  if (filter === 'story') return String(item.format || '').includes('stor');
  return true;
}

export const PLANNER_STATUS_META = {
  pending: { id: 'pending', label: 'Planejado', tone: 'amber' },
  scheduled: { id: 'scheduled', label: 'Programado', tone: 'mint' },
  published: { id: 'published', label: 'Publicado', tone: 'mint' },
  failed: { id: 'failed', label: 'Precisa de atenção', tone: 'orange' },
  client_posts: { id: 'client_posts', label: 'Cliente publica', tone: 'amber' },
};

export function plannerStatusMeta(status) {
  return PLANNER_STATUS_META[status] || PLANNER_STATUS_META.pending;
}

export function plannerPublicationState(publication) {
  const status = publication?.status;
  if (status === 'published') {
    return { label: publication.meta_post_id ? 'Publicado pela integração' : 'Publicação informada', tone: 'mint' };
  }
  if (status === 'scheduled') {
    if (channelKind(publication.channel) === 'facebook' && publication.meta_post_id) {
      return { label: 'Agendado na Meta', tone: 'mint', scheduled: true };
    }
    if (channelKind(publication.channel) === 'instagram' && publication.meta_dispatch?.hold
      && Number.isFinite(Date.parse(publication.scheduled_at))) {
      return { label: 'Agendado no Planeje', tone: 'mint', scheduled: true };
    }
    return { label: 'Horário definido', tone: 'amber' };
  }
  return plannerStatusMeta(status);
}

export function plannerFormatLabel(item) {
  const blob = `${item?.format || ''} ${item?.taskType || ''} ${item?.title || ''}`.toLowerCase();
  if (blob.includes('reel') || blob.includes('video')) return 'Reels';
  if (blob.includes('carrossel') || blob.includes('carousel')) return 'Carrossel';
  if (blob.includes('stor')) return 'Stories';
  return 'Estático';
}

export function plannerStatusCounts(items = []) {
  const counts = {
    pending: 0,
    scheduled: 0,
    failed: 0,
    published: 0,
  };
  for (const item of items) {
    if (counts[item.status] != null) counts[item.status] += 1;
  }
  return counts;
}

export function matchesPlannerSearch(item, query) {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return true;
  const hay = [
    item?.title,
    item?.caption,
    item?.clientName,
    plannerFormatLabel(item),
  ].join(' ').toLowerCase();
  return hay.includes(needle);
}

export function plannerItemCanMove(item) {
  return Boolean(item) && item.status !== 'published' && item.status !== 'cancelled'
    && !(item.publications || []).some((p) => p.channel === 'Facebook' && p.status === 'scheduled' && p.meta_post_id);
}

export function movePlannerItemToDay(item, dayKey, timeHm) {
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(timeHm || ''))
    ? timeHm
    : (item?.time || '10:00');
  const date = String(dayKey || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const local = `${date}T${time}`;
  return {
    scheduled_for: date,
    scheduled_at: new Date(`${local}:00`).toISOString(),
  };
}

export function targetDayInWeek(item, weekDays = []) {
  if (!weekDays.length) return null;
  const source = item?.date;
  if (!(source instanceof Date) || Number.isNaN(source.getTime())) return weekDays[0];
  return weekDays.find((day) => day.getDay() === source.getDay()) || weekDays[0];
}
