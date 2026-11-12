import { periodLabels } from './trafficPerformanceReport.js';

export const SOCIAL_REPORT_METRICS = [
  { key: 'reach', label: 'Alcance' },
  { key: 'impressions', label: 'Impressões' },
  { key: 'profileViews', label: 'Visitas ao perfil' },
  { key: 'pageViews', label: 'Visitas à página' },
  { key: 'engagement', label: 'Interações' },
  { key: 'accountsEngaged', label: 'Contas engajadas' },
  { key: 'saves', label: 'Salvamentos' },
  { key: 'shares', label: 'Compartilhamentos' },
  { key: 'websiteClicks', label: 'Link na bio' },
  { key: 'followers', label: 'Seguidores' },
  { key: 'newFollows', label: 'Novos seguidores' },
  { key: 'posts', label: 'Publicações no período' },
];

export const DEFAULT_VISIBLE_SOCIAL_METRICS = [
  'reach',
  'impressions',
  'profileViews',
  'pageViews',
  'engagement',
  'accountsEngaged',
  'saves',
  'shares',
  'websiteClicks',
  'followers',
  'newFollows',
  'posts',
];

const SOCIAL_KEYS = new Set(SOCIAL_REPORT_METRICS.map((item) => item.key));

const GENDER_LABELS = {
  F: 'Mulheres',
  M: 'Homens',
  U: 'Não informado',
  FEMALE: 'Mulheres',
  MALE: 'Homens',
  UNKNOWN: 'Não informado',
};

export function normalizeVisibleSocialMetrics(list) {
  const picked = [...new Set((Array.isArray(list) ? list : [])
    .map((item) => String(item || '').trim())
    .filter((key) => SOCIAL_KEYS.has(key)))];
  return picked.length ? picked : [...DEFAULT_VISIBLE_SOCIAL_METRICS];
}

export function isSocialMetricVisible(visible, key) {
  return normalizeVisibleSocialMetrics(visible).includes(key);
}

export function toggleVisibleSocialMetric(visible, key, on) {
  const current = normalizeVisibleSocialMetrics(visible);
  if (!SOCIAL_KEYS.has(key)) return current;
  if (on) return normalizeVisibleSocialMetrics([...current, key]);
  const next = current.filter((item) => item !== key);
  return next.length ? next : [...DEFAULT_VISIBLE_SOCIAL_METRICS];
}

/** Lê um insight da Meta sem transformar ausência em zero. */
export function socialInsightNumber(insight) {
  if (!insight) return null;
  if (insight.total_value && insight.total_value.value != null && insight.total_value.value !== '') {
    const n = Number(insight.total_value.value);
    return Number.isFinite(n) ? n : null;
  }
  if (insight.value != null && insight.value !== '') {
    const n = Number(insight.value);
    return Number.isFinite(n) ? n : null;
  }
  if (Array.isArray(insight.values) && insight.values.length) {
    if (insight.name === 'follower_count') {
      const n = Number(insight.values[insight.values.length - 1]?.value);
      return Number.isFinite(n) ? n : null;
    }
    let sum = 0;
    let saw = false;
    for (const entry of insight.values) {
      if (entry?.value == null || entry.value === '') continue;
      const n = Number(entry.value);
      if (!Number.isFinite(n)) continue;
      sum += n;
      saw = true;
    }
    return saw ? sum : null;
  }
  return null;
}

export function formatSocialMetric(value) {
  if (value == null || value === '') return 'sem dado';
  const n = Number(value);
  if (!Number.isFinite(n)) return 'sem dado';
  return Math.round(n).toLocaleString('pt-BR');
}

function pickNamed(insights, names) {
  const list = Array.isArray(insights) ? insights : [];
  for (const name of names) {
    const found = list.find((row) => row?.name === name);
    if (!found) continue;
    const value = socialInsightNumber(found);
    if (value != null) return value;
  }
  return null;
}

function finiteOrNull(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sumNullable(values) {
  let sum = 0;
  let saw = false;
  for (const value of values) {
    const n = finiteOrNull(value);
    if (n == null) continue;
    sum += n;
    saw = true;
  }
  return saw ? sum : null;
}

export function labelAudienceGender(raw) {
  const value = String(raw || '').trim();
  if (!value) return 'sem dado';
  return GENDER_LABELS[value.toUpperCase()] || value;
}

export function labelAudienceItem(kind, raw) {
  if (kind === 'gender') return labelAudienceGender(raw);
  const value = String(raw || '').trim();
  return value || 'sem dado';
}

/** Normaliza demografia da Meta; lista vazia vira “sem dado”, nunca inventa faixa. */
export function mapAudienceBucket(raw = null, note = '') {
  const source = raw && typeof raw === 'object' ? raw : {};
  const take = (key) => {
    const list = Array.isArray(source[key]) ? source[key] : [];
    return list
      .map((row) => {
        const label = String(row?.label || '').trim();
        const value = finiteOrNull(row?.value);
        if (!label || value == null) return null;
        return { label, value };
      })
      .filter(Boolean);
  };
  const age = take('age');
  const gender = take('gender');
  const city = take('city');
  const country = take('country');
  const empty = !(age.length || gender.length || city.length || country.length);
  const text = String(note || '').trim();
  return {
    age,
    gender,
    city,
    country,
    empty,
    note: empty ? (text || 'sem dado') : '',
    detail: !empty && !age.length && !gender.length ? text : '',
  };
}

/** Novos seguidores do período: saldo da Meta, ou a variação da série diária. */
export function instagramNewFollows(insights = []) {
  const list = Array.isArray(insights) ? insights : [];
  const netRow = list.find((item) => item?.name === 'follows_and_unfollows');
  const explicit = netRow?.total_value && netRow.total_value.value != null && netRow.total_value.value !== ''
    ? Number(netRow.total_value.value)
    : null;
  if (Number.isFinite(explicit)) return explicit;
  const row = list.find((item) => item?.name === 'follower_count');
  const series = (Array.isArray(row?.values) ? row.values : [])
    .map((entry) => Number(entry?.value))
    .filter((value) => Number.isFinite(value));
  if (series.length < 2) return null;
  const max = Math.max(...series);
  const min = Math.min(...series);
  if (max >= 100 && min >= max * 0.4) return series[series.length - 1] - series[0];
  return series.reduce((sum, value) => sum + value, 0);
}

export const SOCIAL_POSTS_PER_PAGE = 3;

export function mapInstagramAudience(payload = null, note = '') {
  const audience = payload && typeof payload === 'object' ? payload : null;
  const followers = audience?.followers || null;
  const engaged = audience?.engaged || null;
  const reached = audience?.reached || null;
  const preferred = [followers, engaged, reached].find((bucket) => {
    if (!bucket || typeof bucket !== 'object') return false;
    return ['age', 'gender', 'city', 'country'].some((key) => Array.isArray(bucket[key]) && bucket[key].length);
  }) || null;
  const mapped = mapAudienceBucket(preferred, note || audience?.errors?.[0] || '');
  return {
    ...mapped,
    source: preferred === followers ? 'followers' : preferred === engaged ? 'engaged' : preferred === reached ? 'reached' : null,
  };
}

/** Foto inteira do post. Vídeo usa a capa; imagem usa o arquivo, não a miniatura quadrada. */
export function socialPostImageUrl(raw = {}) {
  const type = String(raw.media_type || raw.type || '').toUpperCase();
  const media = String(raw.media_url || '').trim();
  const thumb = String(raw.thumbnailUrl || raw.thumbnail_url || '').trim();
  const picture = String(raw.full_picture || raw.picture || '').trim();
  const video = type.includes('VIDEO') || /\.mp4(\?|$)/i.test(media);
  if (video) {
    if (thumb) return thumb;
    if (picture) return picture;
    return /\.mp4(\?|$)/i.test(media) ? '' : media;
  }
  return media || picture || thumb;
}

export function mapSocialPost(raw = {}, channel = 'instagram') {
  const insights = raw.insights && typeof raw.insights === 'object' ? raw.insights : {};
  const reach = finiteOrNull(insights.reach ?? raw.reach);
  const likes = finiteOrNull(insights.likes ?? raw.like_count ?? raw.reactions_count);
  const comments = finiteOrNull(insights.comments ?? raw.comments_count);
  const saves = finiteOrNull(insights.saved ?? insights.saves ?? raw.saves);
  const shares = finiteOrNull(insights.shares ?? raw.shares_count);
  const interactions = finiteOrNull(
    insights.total_interactions
    ?? insights.engagement
    ?? sumNullable([likes, comments, saves, shares]),
  );
  const views = finiteOrNull(insights.views ?? insights.impressions ?? raw.views);
  const thumbnailUrl = socialPostImageUrl(raw);
  const caption = String(raw.caption || raw.message || '').trim();
  const type = String(raw.media_type || raw.type || '').trim() || 'post';
  const scoreFromRaw = finiteOrNull(raw.score);
  const computed = Math.max(
    interactions == null ? -1 : interactions,
    reach == null ? -1 : reach,
    likes == null ? -1 : likes,
  );
  const score = scoreFromRaw != null ? scoreFromRaw : (computed < 0 ? null : computed);
  return {
    id: String(raw.id || ''),
    channel: raw.channel || channel,
    type,
    caption,
    thumbnailUrl,
    permalink: String(raw.permalink || raw.permalink_url || '').trim(),
    timestamp: raw.timestamp || raw.created_time || null,
    reach,
    likes,
    comments,
    saves,
    shares,
    interactions,
    views,
    score,
  };
}

/** Ordena publicações com métrica; sem métrica fica no fim. */
export function rankTopPosts(posts = [], limit = 6) {
  const list = (Array.isArray(posts) ? posts : [])
    .filter((post) => post && post.id)
    .slice();
  list.sort((a, b) => {
    const scoreA = a.score == null ? -1 : a.score;
    const scoreB = b.score == null ? -1 : b.score;
    if (scoreB !== scoreA) return scoreB - scoreA;
    const reachA = a.reach == null ? -1 : a.reach;
    const reachB = b.reach == null ? -1 : b.reach;
    return reachB - reachA;
  });
  const withMetric = list.filter((post) => post.score != null);
  const source = withMetric.length ? withMetric : list;
  return source.slice(0, Math.max(0, limit));
}

export function aggregatePostMetrics(posts = []) {
  const list = Array.isArray(posts) ? posts : [];
  return {
    saves: sumNullable(list.map((post) => post.saves)),
    shares: sumNullable(list.map((post) => post.shares)),
    impressions: sumNullable(list.map((post) => post.views)),
  };
}

function withPostsAndAudience(channel, {
  posts = [],
  audience = null,
  audienceNote = '',
} = {}) {
  const mappedPosts = (Array.isArray(posts) ? posts : [])
    .map((item) => mapSocialPost(item, channel.channel))
    .filter((post) => post.id);
  const fromPosts = aggregatePostMetrics(mappedPosts);
  const metrics = {
    ...channel.metrics,
    impressions: channel.metrics.impressions != null ? channel.metrics.impressions : fromPosts.impressions,
    saves: channel.metrics.saves != null ? channel.metrics.saves : fromPosts.saves,
    shares: channel.metrics.shares != null ? channel.metrics.shares : fromPosts.shares,
  };
  return {
    ...channel,
    metrics,
    audience: audience && typeof audience === 'object' && !Array.isArray(audience)
      ? (audience.empty != null ? audience : mapAudienceBucket(audience, audienceNote))
      : mapAudienceBucket(null, audienceNote || 'sem dado'),
    posts: mappedPosts,
    topPosts: rankTopPosts(mappedPosts, 6),
  };
}

export function mapInstagramChannel({
  handle = '',
  insights = [],
  followers = null,
  mediaCount = null,
  posts = [],
  audience = null,
  audienceNote = '',
} = {}) {
  const followersValue = pickNamed(insights, ['followers_current', 'follower_count']);
  const channel = {
    id: 'instagram',
    channel: 'instagram',
    label: 'Instagram',
    handle: String(handle || '').trim(),
    metrics: {
      reach: pickNamed(insights, ['reach']),
      impressions: pickNamed(insights, ['impressions', 'views']),
      profileViews: pickNamed(insights, ['profile_views']),
      pageViews: null,
      engagement: pickNamed(insights, ['total_interactions']),
      accountsEngaged: pickNamed(insights, ['accounts_engaged']),
      saves: null,
      shares: null,
      websiteClicks: pickNamed(insights, ['website_clicks', 'profile_links_taps']),
      followers: followersValue != null ? followersValue : (followers == null ? null : Number(followers)),
      newFollows: instagramNewFollows(insights),
      posts: mediaCount == null ? null : Number(mediaCount),
    },
  };
  return withPostsAndAudience(channel, { posts, audience, audienceNote });
}

export function mapFacebookChannel({
  handle = '',
  insights = [],
  followers = null,
  postCount = null,
  posts = [],
  audience = null,
  audienceNote = '',
} = {}) {
  const followersValue = pickNamed(insights, ['page_follows', 'page_fans']);
  let mediaViews = null;
  for (const name of ['page_media_view', 'page_video_views']) {
    const value = pickNamed(insights, [name]);
    if (value == null) continue;
    mediaViews = (mediaViews || 0) + value;
  }
  const channel = {
    id: 'facebook',
    channel: 'facebook',
    label: 'Facebook',
    handle: String(handle || '').trim(),
    metrics: {
      reach: pickNamed(insights, ['page_total_media_view_unique', 'page_impressions_unique', 'page_posts_impressions_unique']),
      impressions: mediaViews,
      profileViews: null,
      pageViews: pickNamed(insights, ['page_views_total']),
      engagement: pickNamed(insights, ['page_post_engagements']),
      accountsEngaged: null,
      saves: null,
      shares: null,
      websiteClicks: null,
      followers: followersValue != null ? followersValue : (followers == null ? null : Number(followers)),
      newFollows: pickNamed(insights, ['page_daily_follows']),
      posts: postCount == null ? null : Number(postCount),
      mediaViews,
    },
  };
  return withPostsAndAudience(channel, {
    posts,
    audience,
    audienceNote: audienceNote || 'Idade e gênero a Meta não devolve para a página.',
  });
}

export function socialMetricRows(channel, visible) {
  const keys = normalizeVisibleSocialMetrics(visible);
  const metrics = channel?.metrics || {};
  const labels = Object.fromEntries(SOCIAL_REPORT_METRICS.map((item) => [item.key, item.label]));
  return keys
    .filter((key) => Object.prototype.hasOwnProperty.call(metrics, key) || key === 'posts')
    .filter((key) => key !== 'websiteClicks' || channel?.id === 'instagram' || metrics.websiteClicks != null)
    .map((key) => ({
      key,
      label: labels[key] || key,
      value: formatSocialMetric(metrics[key]),
      raw: metrics[key],
    }));
}

export function audienceRows(audience) {
  const data = audience && typeof audience === 'object' ? audience : mapAudienceBucket();
  const groups = [
    { key: 'age', title: 'Idade', kind: 'age', items: data.age || [] },
    { key: 'gender', title: 'Gênero', kind: 'gender', items: data.gender || [] },
    { key: 'city', title: 'Cidades', kind: 'city', items: data.city || [] },
    { key: 'country', title: 'Países', kind: 'country', items: data.country || [] },
  ];
  const mapped = groups.map((group) => {
    const total = group.items.reduce((sum, row) => sum + (Number(row.value) || 0), 0);
    return {
      ...group,
      empty: group.items.length === 0,
      rows: group.items.length
        ? group.items.map((row) => ({
          label: labelAudienceItem(group.kind, row.label),
          value: formatSocialMetric(row.value),
          raw: row.value,
          pct: total > 0 ? Math.round((Number(row.value) / total) * 100) : null,
        }))
        : [{ label: 'sem dado', value: 'sem dado', raw: null, pct: null }],
    };
  });
  const withData = mapped.filter((group) => !group.empty);
  return withData.length ? withData : mapped;
}

/** Monta os slides de redes: números, audiência e melhores posts. */
export function buildSocialSlides(channels = [], visible = DEFAULT_VISIBLE_SOCIAL_METRICS) {
  const list = (Array.isArray(channels) ? channels : []).filter((row) => row && row.id);
  const slides = [];
  for (const channel of list) {
    slides.push({
      id: `social:${channel.id}`,
      kind: 'metrics',
      channel,
      rows: socialMetricRows(channel, visible),
    });
    slides.push({
      id: `social-audience:${channel.id}`,
      kind: 'audience',
      channel,
      audience: channel.audience || mapAudienceBucket(),
      groups: audienceRows(channel.audience),
    });
    const ranked = rankTopPosts(channel.topPosts?.length ? channel.topPosts : channel.posts, 6);
    const pages = ranked.length
      ? Array.from({ length: Math.ceil(ranked.length / SOCIAL_POSTS_PER_PAGE) }, (_, index) => (
        ranked.slice(index * SOCIAL_POSTS_PER_PAGE, (index + 1) * SOCIAL_POSTS_PER_PAGE)
      ))
      : [[]];
    pages.forEach((posts, index) => {
      slides.push({
        id: index === 0 ? `social-posts:${channel.id}` : `social-posts:${channel.id}:${index + 1}`,
        kind: 'posts',
        channel,
        posts,
        page: index + 1,
        pageCount: pages.length,
      });
    });
  }
  return slides;
}

export function buildSocialReport({
  clientName = '',
  range = null,
  channels = [],
  note = '',
} = {}) {
  const list = (channels || []).filter((row) => row && row.id);
  return {
    clientName: String(clientName || '').trim(),
    range,
    labels: periodLabels(range),
    channels: list,
    slides: buildSocialSlides(list),
    note: String(note || '').trim(),
    empty: list.length === 0,
  };
}
