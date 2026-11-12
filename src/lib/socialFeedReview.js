/**
 * Cruza publicações do Planeje com itens do feed da Meta.
 * Não altera status operacional — só classifica para leitura/selo.
 */

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function dayKey(value) {
  if (!value) return '';
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function captionSnippet(value, size = 48) {
  const text = normalizeText(value);
  if (!text) return '';
  return text.slice(0, size);
}

function sameUrl(a, b) {
  const left = String(a || '').trim().replace(/\/$/, '');
  const right = String(b || '').trim().replace(/\/$/, '');
  if (!left || !right) return false;
  return left === right;
}

function publicationPlatform(publication) {
  const channel = String(publication?.channel || '').toLowerCase();
  if (channel === 'instagram') return 'instagram';
  if (channel === 'facebook') return 'facebook_page';
  return null;
}

function feedPlatform(item) {
  if (item?.platform) return item.platform;
  if (item?.media_type || item?.timestamp) return 'instagram';
  return 'facebook_page';
}

function feedCaption(item) {
  return item?.caption || item?.message || '';
}

function feedPermalink(item) {
  return item?.permalink || item?.permalink_url || '';
}

function feedDay(item) {
  return dayKey(item?.timestamp || item?.created_time || item?.published_at);
}

function feedId(item) {
  return String(item?.id || item?.meta_post_id || '').trim();
}

/**
 * @returns {'confirmed'|'planned_missing'|'organic'|null}
 */
export function matchPublicationToFeedItem(publication, feedItem) {
  if (!publication || !feedItem) return null;
  const pubPlatform = publicationPlatform(publication);
  const itemPlatform = feedPlatform(feedItem);
  if (pubPlatform && itemPlatform && pubPlatform !== itemPlatform) return null;

  const metaId = String(publication.meta_post_id || '').trim();
  const itemId = feedId(feedItem);
  if (metaId && itemId && metaId === itemId) return 'confirmed';

  if (publication.evidence_url && sameUrl(publication.evidence_url, feedPermalink(feedItem))) {
    return 'confirmed';
  }

  const pubDay = dayKey(publication.published_on || publication.scheduled_for);
  const itemDay = feedDay(feedItem);
  const pubCap = captionSnippet(publication.caption);
  const itemCap = captionSnippet(feedCaption(feedItem));
  if (pubDay && itemDay && pubDay === itemDay && pubCap && itemCap) {
    if (pubCap === itemCap || itemCap.includes(pubCap) || pubCap.includes(itemCap)) {
      return 'confirmed';
    }
  }

  const dest = normalizeText(publication.destination).replace(/^@/, '');
  const handle = normalizeText(feedItem.username || feedItem.page_name || '').replace(/^@/, '');
  if (pubDay && itemDay && pubDay === itemDay && dest && handle && (dest === handle || dest.includes(handle) || handle.includes(dest))) {
    if (!pubCap || !itemCap || pubCap.slice(0, 24) === itemCap.slice(0, 24)) {
      return 'confirmed';
    }
  }

  return null;
}

function todayIso(now = new Date()) {
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

/**
 * Monta o relatório de conferência.
 * @param {object[]} publications publicações Instagram/Facebook do cliente
 * @param {object[]} feedItems posts/mídia do feed (com platform)
 * @param {{ now?: Date }} [options]
 */
export function buildSocialFeedReview(publications = [], feedItems = [], { now = new Date() } = {}) {
  const today = todayIso(now);
  const usedFeedIds = new Set();
  const confirmed = [];
  const plannedMissing = [];
  const matchedPublicationIds = new Set();

  const relevant = (publications || []).filter((pub) => {
    const platform = publicationPlatform(pub);
    return platform && pub.status !== 'cancelled';
  });

  for (const publication of relevant) {
    let best = null;
    for (const item of feedItems || []) {
      const itemId = feedId(item);
      if (itemId && usedFeedIds.has(itemId)) continue;
      const kind = matchPublicationToFeedItem(publication, item);
      if (kind === 'confirmed') {
        best = item;
        break;
      }
    }
    if (best) {
      const itemId = feedId(best);
      if (itemId) usedFeedIds.add(itemId);
      matchedPublicationIds.add(publication.id);
      confirmed.push({ publication, feedItem: best });
      continue;
    }

    const due = dayKey(publication.scheduled_for || publication.published_on);
    const pastDue = due && due <= today;
    const expectsPresence = ['pending', 'scheduled', 'published', 'failed'].includes(publication.status);
    if (expectsPresence && pastDue) {
      plannedMissing.push({ publication, feedItem: null });
    }
  }

  const organic = [];
  for (const item of feedItems || []) {
    const itemId = feedId(item);
    if (itemId && usedFeedIds.has(itemId)) continue;
    organic.push({ publication: null, feedItem: item });
  }

  return {
    confirmed,
    plannedMissing,
    organic,
    counts: {
      confirmed: confirmed.length,
      plannedMissing: plannedMissing.length,
      organic: organic.length,
      publications: relevant.length,
      feed: (feedItems || []).length,
    },
  };
}

export function reviewBadgeForPublication(publication, review) {
  if (!publication?.id || !review) return null;
  if ((review.confirmed || []).some((row) => row.publication?.id === publication.id)) {
    return { tone: 'ok', label: 'Confirmado na Meta' };
  }
  if ((review.plannedMissing || []).some((row) => row.publication?.id === publication.id)) {
    return { tone: 'warn', label: 'Planejado sem post' };
  }
  return null;
}

export function normalizeFeedItem(item, platform) {
  if (!item) return null;
  return {
    ...item,
    platform,
    id: feedId(item),
    caption: feedCaption(item),
    permalink: feedPermalink(item),
    published_at: item.timestamp || item.created_time || null,
    media_type: item.media_type || item.type || 'post',
    thumbnail_url: item.thumbnail_url || item.media_url || item.full_picture || null,
  };
}
