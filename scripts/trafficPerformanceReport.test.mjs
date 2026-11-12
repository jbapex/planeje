import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPerformanceReport,
  creativeUrls,
  dateRange,
  DEFAULT_VISIBLE_METRICS,
  formatMoney,
  isMetricVisible,
  monthRange,
  normalizeVisibleMetrics,
  periodKey,
  periodLabels,
  reportResultSpec,
  routineNotes,
  salesBlock,
  toggleVisibleMetric,
  unitCost,
} from '../src/lib/trafficPerformanceReport.js';
import {
  audienceRows,
  buildSocialReport,
  buildSocialSlides,
  DEFAULT_VISIBLE_SOCIAL_METRICS,
  formatSocialMetric,
  instagramNewFollows,
  mapAudienceBucket,
  mapFacebookChannel,
  mapInstagramAudience,
  mapInstagramChannel,
  mapSocialPost,
  normalizeVisibleSocialMetrics,
  rankTopPosts,
  SOCIAL_REPORT_METRICS,
  socialInsightNumber,
  socialMetricRows,
} from '../src/lib/trafficSocialReport.js';
import { reportPdfFileName, rewriteModernColorValue, slidePdfFormat } from '../src/lib/trafficPerformanceReportPdf.js';
import { galleryPageId, hiddenPageLabel, inkOn, presentReport, readText } from '../src/lib/trafficReportEditor.js';
import { parsePaidTrafficRoute, paidTrafficPaths } from '../src/lib/paidTrafficRoutes.js';

const account = {
  spend: '930.52',
  impressions: '184994',
  reach: '59597',
  actions: [
    { action_type: 'omni_purchase', value: '198' },
    { action_type: 'video_view', value: '1000' },
  ],
  action_values: [{ action_type: 'omni_purchase', value: '15563.30' }],
};

test('month range covers the calendar month', () => {
  const range = monthRange('2025-07');
  assert.deepEqual(range, { since: '2025-07-01', until: '2025-07-31', year: 2025, month: 7 });
  assert.equal(periodLabels(range).start, '01.07.2025');
  assert.equal(periodLabels(range).end, '31.07.2025');
  assert.equal(periodLabels(range).title, 'julho de 2025');
  assert.equal(monthRange('2025-13'), null);
});

test('custom date range recalculates the period title', () => {
  const range = dateRange('2026-09-01', '2026-09-15');
  assert.deepEqual(range, { since: '2026-09-01', until: '2026-09-15', year: 2026, month: 9 });
  assert.equal(periodLabels(range).title, '01.09.2026 a 15.09.2026');
  assert.equal(periodKey(range), '2026-09-01_2026-09-15');
  assert.equal(dateRange('2026-09-20', '2026-09-10'), null);
  assert.equal(dateRange('2026-13-01', '2026-13-02'), null);
  const full = dateRange('2026-09-01', '2026-09-30');
  assert.equal(periodLabels(full).title, 'setembro de 2026');
});

test('visible metrics hide columns without deleting totals', () => {
  assert.deepEqual(normalizeVisibleMetrics(['reach', 'bogus', 'spend']), ['reach', 'spend']);
  assert.deepEqual(normalizeVisibleMetrics([]), DEFAULT_VISIBLE_METRICS);
  assert.equal(isMetricVisible(['reach', 'spend'], 'impressions'), false);
  assert.equal(isMetricVisible(['reach', 'spend'], 'spend'), true);
  assert.deepEqual(toggleVisibleMetric(['reach', 'impressions', 'result', 'cost', 'spend'], 'impressions', false), ['reach', 'result', 'cost', 'spend']);
  assert.deepEqual(toggleVisibleMetric(['reach'], 'impressions', true), ['reach', 'impressions']);
  const report = buildPerformanceReport({
    clientName: 'Lali',
    range: dateRange('2025-07-01', '2025-07-31'),
    resultLabel: 'Compras no site',
    accountRows: [account],
  });
  assert.equal(report.totals.reach, 59597);
  assert.equal(isMetricVisible(['spend'], 'reach'), false);
  assert.equal(report.totals.reach, 59597);
});

test('social metrics keep missing values empty instead of zero', () => {
  assert.equal(socialInsightNumber(null), null);
  assert.equal(socialInsightNumber({ name: 'reach', values: [] }), null);
  assert.equal(socialInsightNumber({ name: 'reach', values: [{ value: '12' }, { value: '8' }] }), 20);
  assert.equal(formatSocialMetric(null), 'sem dado');
  assert.equal(formatSocialMetric(1200), '1.200');
  const ig = mapInstagramChannel({
    handle: '@lali',
    insights: [{ name: 'reach', values: [{ value: '40' }] }],
    followers: 900,
    mediaCount: 3,
  });
  assert.equal(ig.metrics.reach, 40);
  assert.equal(ig.metrics.profileViews, null);
  assert.equal(ig.metrics.followers, 900);
  assert.equal(ig.metrics.posts, 3);
  assert.equal(ig.audience.empty, true);
  assert.equal(ig.audience.note, 'sem dado');
  const fb = mapFacebookChannel({
    handle: 'Lali',
    insights: [{ name: 'page_views_total', values: [{ value: '11' }] }],
    postCount: 2,
  });
  assert.equal(fb.metrics.pageViews, 11);
  assert.equal(fb.metrics.reach, null);
  const social = buildSocialReport({
    clientName: 'Lali',
    range: dateRange('2026-09-01', '2026-09-15'),
    channels: [ig, fb],
  });
  assert.equal(social.channels.length, 2);
  assert.equal(social.empty, false);
  const rows = socialMetricRows(ig, ['reach', 'profileViews', 'followers']);
  assert.equal(rows.find((row) => row.key === 'reach').value, '40');
  assert.equal(rows.find((row) => row.key === 'profileViews').value, 'sem dado');
  assert.deepEqual(normalizeVisibleSocialMetrics(['reach', 'x']), ['reach']);
});

test('social report builds audience and top posts without inventing ages', () => {
  const empty = mapAudienceBucket(null, '');
  assert.equal(empty.empty, true);
  assert.equal(empty.note, 'sem dado');
  assert.deepEqual(empty.age, []);
  const audience = mapInstagramAudience({
    followers: {
      age: [{ label: '25-34', value: 40 }, { label: '18-24', value: 20 }],
      gender: [{ label: 'F', value: 70 }, { label: 'M', value: 30 }],
      city: [{ label: 'Curitiba, Paraná', value: 12 }],
    },
  });
  assert.equal(audience.empty, false);
  assert.equal(audience.age[0].label, '25-34');
  const posts = [
    mapSocialPost({
      id: 'p1',
      thumbnail_url: 'https://cdn.example/a.jpg',
      caption: 'Vestido A',
      like_count: 10,
      insights: { reach: 100, total_interactions: 40, saved: 5, shares: 2 },
    }),
    mapSocialPost({
      id: 'p2',
      media_url: 'https://cdn.example/b.jpg',
      caption: 'Vestido B',
      insights: { reach: 500, total_interactions: 90 },
    }),
    mapSocialPost({ id: 'p3', caption: 'Sem métrica' }),
  ];
  assert.equal(posts[0].thumbnailUrl, 'https://cdn.example/a.jpg');
  assert.equal(mapSocialPost({
    id: 'full',
    media_type: 'IMAGE',
    thumbnail_url: 'https://cdn.example/square.jpg',
    media_url: 'https://cdn.example/full.jpg',
  }).thumbnailUrl, 'https://cdn.example/full.jpg');
  assert.equal(mapSocialPost({
    id: 'vid',
    media_type: 'VIDEO',
    thumbnail_url: 'https://cdn.example/cover.jpg',
    media_url: 'https://cdn.example/clip.mp4',
  }).thumbnailUrl, 'https://cdn.example/cover.jpg');
  assert.equal(posts[2].score, null);
  const top = rankTopPosts(posts, 2);
  assert.deepEqual(top.map((item) => item.id), ['p2', 'p1']);
  const ig = mapInstagramChannel({
    handle: '@apice',
    insights: [
      { name: 'reach', values: [{ value: '1200' }] },
      { name: 'impressions', values: [{ value: '3000' }] },
    ],
    followers: 4500,
    mediaCount: 3,
    posts,
    audience,
  });
  assert.equal(ig.metrics.impressions, 3000);
  assert.equal(ig.metrics.saves, 5);
  assert.equal(ig.topPosts[0].id, 'p2');
  assert.equal(ig.audience.gender[0].label, 'F');
  const slides = buildSocialSlides([ig], ['reach', 'impressions', 'saves', 'followers']);
  assert.equal(slides.length, 3);
  assert.equal(slides[0].kind, 'metrics');
  assert.equal(slides[1].kind, 'audience');
  assert.equal(slides[2].kind, 'posts');
  assert.equal(slides[1].groups.find((group) => group.key === 'age').rows[0].label, '25-34');
  assert.equal(slides[2].posts[0].thumbnailUrl, 'https://cdn.example/b.jpg');
  const noDemo = mapInstagramChannel({ handle: '@x', insights: [], audienceNote: 'conta pequena' });
  assert.equal(noDemo.audience.empty, true);
  assert.match(noDemo.audience.note, /conta pequena|sem dado/);
  assert.equal(instagramNewFollows([]), null);
  assert.equal(instagramNewFollows([{ name: 'follows_and_unfollows', total_value: { value: 18 } }]), 18);
  assert.equal(instagramNewFollows([{ name: 'follows_and_unfollows', total_value: { value: 0 } }]), 0);
  assert.equal(instagramNewFollows([
    { name: 'follows_and_unfollows', value: 0 },
    { name: 'follower_count', values: [{ value: 2 }, { value: 3 }] },
  ]), 5);
  assert.equal(instagramNewFollows([{
    name: 'follower_count',
    values: [{ value: 1000 }, { value: 1040 }],
  }]), 40);
  const grew = mapInstagramChannel({
    insights: [
      { name: 'follows_and_unfollows', total_value: { value: 18 } },
      { name: 'website_clicks', total_value: { value: 7 } },
    ],
  });
  assert.equal(grew.metrics.newFollows, 18);
  assert.equal(grew.metrics.websiteClicks, 7);
  assert.equal(DEFAULT_VISIBLE_SOCIAL_METRICS.includes('websiteClicks'), true);
  assert.equal(SOCIAL_REPORT_METRICS.find((item) => item.key === 'websiteClicks').label, 'Link na bio');
  const bioRow = socialMetricRows(grew, DEFAULT_VISIBLE_SOCIAL_METRICS).find((row) => row.key === 'websiteClicks');
  assert.equal(bioRow.value, '7');
  const fbRows = socialMetricRows(mapFacebookChannel({ postCount: 1 }), DEFAULT_VISIBLE_SOCIAL_METRICS);
  assert.equal(fbRows.some((row) => row.key === 'websiteClicks'), false);
  const many = Array.from({ length: 4 }, (_, index) => mapSocialPost({
    id: `m${index}`,
    thumbnail_url: 'https://cdn.example/a.jpg',
    insights: { reach: 100 - index, total_interactions: 50 - index },
  }));
  const paged = buildSocialSlides([mapInstagramChannel({ posts: many })], ['reach']);
  const postSlides = paged.filter((slide) => slide.kind === 'posts');
  assert.equal(postSlides.length, 2);
  assert.equal(postSlides[0].posts.length, 3);
  assert.equal(postSlides[1].posts.length, 1);
  assert.equal(postSlides[1].id, 'social-posts:instagram:2');
  assert.equal(hiddenPageLabel({ social: { channels: [{ id: 'instagram', label: 'Instagram' }] } }, 'social-posts:instagram:2'), 'Publicações · Instagram · 2');
  const pageAudience = mapFacebookChannel({
    audience: mapAudienceBucket({
      city: [{ label: 'Curitiba, PR', value: 12 }],
      country: [{ label: 'BR', value: 20 }],
    }, 'Idade e gênero a Meta não devolve para a página.'),
  });
  assert.equal(pageAudience.audience.empty, false);
  assert.equal(pageAudience.audience.city[0].label, 'Curitiba, PR');
  assert.match(pageAudience.audience.detail, /Idade e gênero/);
  const pageGroups = audienceRows(pageAudience.audience).map((group) => group.key);
  assert.deepEqual(pageGroups, ['city', 'country']);
});


test('result follows the client label', () => {
  assert.equal(reportResultSpec('Compras no site', { purchases: 10, leads: 80 }).key, 'purchases');
  assert.equal(reportResultSpec('Leads', {}).label, 'Leads');
  assert.equal(reportResultSpec('', { messages: 4, leads: 1 }).key, 'messages');
  assert.equal(reportResultSpec('Agendamentos', { leads: 80, messages: 12 }).key, 'messages');
  assert.equal(reportResultSpec('Agendamentos', { leads: 80, messages: 12 }).label, 'Mensagens iniciadas');
  assert.equal(unitCost(930.52, 198).toFixed(2), '4.70');
  assert.equal(formatMoney(930.52), 'R$\u00a0930,52');
});

test('account total is not the sum of overlapping campaign reach', () => {
  const report = buildPerformanceReport({
    clientName: 'Lali Pizzaria',
    range: monthRange('2025-07'),
    resultLabel: 'Compras no site',
    accountRows: [account],
    campaignRows: [
      { campaign_id: 'c1', campaign_name: 'WhatsApp', objective: 'OUTCOME_SALES', spend: '400', impressions: '100', reach: '90000', actions: [{ action_type: 'purchase', value: '80' }] },
      { campaign_id: 'c2', campaign_name: 'Remarketing', objective: 'OUTCOME_SALES', spend: '530.52', impressions: '80', reach: '80000', actions: [{ action_type: 'purchase', value: '118' }] },
    ],
    adRows: [
      { ad_id: 'a1', ad_name: 'Pizza 1', campaign_id: 'c1', campaign_name: 'WhatsApp', spend: '10', impressions: '20', reach: '10', actions: [{ action_type: 'purchase', value: '33' }, { action_type: 'video_view', value: '6405' }] },
      { ad_id: 'a2', ad_name: 'Pizza 2', campaign_id: 'c1', campaign_name: 'WhatsApp', spend: '8', impressions: '12', reach: '8', actions: [{ action_type: 'purchase', value: '20' }, { action_type: 'video_view', value: '3777' }] },
      { ad_id: 'a3', ad_name: 'Pizza 3', campaign_id: 'c2', campaign_name: 'Remarketing', spend: '9', impressions: '11', reach: '7', video_play_actions: [{ action_type: 'video_view', value: '5220' }], actions: [{ action_type: 'purchase', value: '59' }] },
      { ad_id: 'a4', ad_name: 'Pizza 4', campaign_id: 'c2', campaign_name: 'Remarketing', spend: '1', impressions: '4', reach: '2', actions: [{ action_type: 'purchase', value: '2' }] },
      { ad_id: 'a5', ad_name: 'Sobra', campaign_id: 'c2', campaign_name: 'Remarketing', spend: '1', impressions: '3', reach: '1', actions: [{ action_type: 'purchase', value: '1' }] },
    ],
  });
  assert.equal(report.totals.reach, 59597);
  assert.equal(report.totals.result, 198);
  assert.equal(report.result.costLabel, 'Custo por Compra');
  assert.equal(report.showCampaignSlides, true);
  assert.equal(report.campaigns[0].name, 'Remarketing');
  assert.equal(report.campaigns[0].creatives.map((ad) => ad.id).join(','), 'a3,a4');
  assert.equal(report.gallery[0][0].id, 'a5');
  assert.equal(report.gallery[0][0].viewLabel, 'impressões');
  assert.equal(report.campaigns[0].creatives[0].viewLabel, 'views');
  assert.equal(report.campaigns[0].creatives[0].viewCount, 5220);
});

test('a single front keeps creatives in the gallery', () => {
  const report = buildPerformanceReport({
    clientName: 'Lali',
    range: monthRange('2025-07'),
    resultLabel: 'Compras no site',
    accountRows: [account],
    campaignRows: [{ campaign_id: 'c1', campaign_name: 'WhatsApp', spend: '10', impressions: '20', reach: '5' }],
    adRows: [
      { ad_id: 'a1', campaign_id: 'c1', spend: '1', impressions: '2', reach: '1' },
      { ad_id: 'a2', campaign_id: 'c1', spend: '1', impressions: '2', reach: '1' },
    ],
  });
  assert.equal(report.showCampaignSlides, false);
  assert.equal(report.campaigns[0].creatives.length, 0);
  assert.equal(report.gallery[0].length, 2);
});

test('sales and routine notes feed the closing slides', () => {
  const sales = salesBlock({ vendas: [{ valor_total: 100 }, { valor_total: 50 }], spend: 30 });
  assert.equal(sales.count, 2);
  assert.equal(sales.ticket, 75);
  assert.equal(sales.roi.toFixed(2), '5.00');
  assert.equal(sales.source, 'vendas');
  const metaOnly = salesBlock({ metaPurchases: 198, metaPurchaseValue: 15563.3, spend: 930.52 });
  assert.equal(metaOnly.source, 'meta');
  assert.equal(metaOnly.count, 198);
  const notes = routineNotes([
    { week_start: '2025-07-07', analysis: 'Troquei o criativo da pizza.', data_note: 'Saldo ok.', action_draft: { title: 'Novo criativo de fim de semana' } },
  ]);
  assert.equal(notes.done.length, 2);
  assert.equal(notes.next[0].text, 'Novo criativo de fim de semana');
});

test('gallery keeps every delivered ad', () => {
  const adRows = Array.from({ length: 15 }, (_, index) => ({
    ad_id: `a${index}`,
    campaign_id: 'c1',
    spend: '1',
    impressions: '2',
    reach: '1',
  }));
  const report = buildPerformanceReport({
    clientName: 'Lali',
    range: monthRange('2025-07'),
    resultLabel: 'Compras no site',
    accountRows: [account],
    campaignRows: [{ campaign_id: 'c1', campaign_name: 'WhatsApp', spend: '10', impressions: '20', reach: '5' }],
    adRows,
  });
  assert.equal(report.gallery.flat().length, 15);
});

test('creative slide uses the saved photo and keeps the signed Meta file unchanged', () => {
  const urls = creativeUrls({
    thumbnail_source_url: 'https://scontent.xx.fbcdn.net/v/image.jpg?stp=p1080x1080&oe=abc',
    thumbnail_stored_url: 'https://planeje.jbapex.com.br/storage/v1/object/public/ad-thumbnails/ad_1.jpg',
  });
  assert.match(urls.thumbnailUrl, /ad-thumbnails/);
  assert.match(urls.fallbackUrl, /p1080x1080/);
  assert.doesNotMatch(urls.fallbackUrl, /p720x720/);
  const storedOnly = creativeUrls({ thumbnail_url: 'https://planeje.jbapex.com.br/storage/v1/object/public/ad-thumbnails/ad_1.jpg' });
  assert.match(storedOnly.thumbnailUrl, /ad-thumbnails/);
  assert.equal(storedOnly.fallbackUrl, '');
});

test('pdf file name uses the client and the period', () => {
  assert.equal(reportPdfFileName('Lali Pizzaria', '2026-09'), 'Relatorio-Lali-Pizzaria-2026-09.pdf');
  assert.equal(reportPdfFileName('Ápice Noivas', '2026-09'), 'Relatorio-Apice-Noivas-2026-09.pdf');
  assert.equal(reportPdfFileName('Lali', '2026-09-01_2026-09-15'), 'Relatorio-Lali-2026-09-01_2026-09-15.pdf');
});

test('pdf rewrites modern colors and leaves the notes page out', () => {
  const converted = rewriteModernColorValue(
    '0px 16px 40px color(srgb 0.1 0.2 0.3 / 0.5), oklch(0.7 0.15 80)',
    (fn) => (fn.startsWith('color') ? 'rgb(1, 2, 3)' : 'rgb(4, 5, 6)')
  );
  assert.equal(converted, '0px 16px 40px rgb(1, 2, 3), rgb(4, 5, 6)');
  assert.equal(rewriteModernColorValue('rgb(17, 17, 17)', () => 'nope'), 'rgb(17, 17, 17)');
  const report = buildPerformanceReport({
    clientName: 'JB APEX',
    range: monthRange('2026-09'),
    resultLabel: 'Compras no site',
    accountRows: [account],
    reviews: [{ analysis: 'Campanhas boas.', action_draft: { title: 'Acompanhar' } }],
  });
  assert.equal(report.showNotes, false);
  assert.equal(report.notes.done[0].text, 'Campanhas boas.');
  assert.equal(report.showSales, true);
});

test('pdf page keeps the slide size', () => {
  assert.deepEqual(slidePdfFormat(960, 540), { format: [960, 540], orientation: 'landscape' });
  assert.deepEqual(slidePdfFormat(960.4, 812.2), { format: [960, 812], orientation: 'landscape' });
  assert.equal(slidePdfFormat(700, 980).orientation, 'portrait');
});

test('report edits hide a page and an ad without changing the numbers source', () => {
  const report = buildPerformanceReport({
    clientName: 'Lali',
    range: monthRange('2025-07'),
    resultLabel: 'Compras no site',
    accountRows: [account],
    campaignRows: [
      { campaign_id: 'c1', campaign_name: 'WhatsApp', spend: '400', impressions: '100', reach: '90', actions: [{ action_type: 'purchase', value: '80' }] },
      { campaign_id: 'c2', campaign_name: 'Remarketing', spend: '530', impressions: '80', reach: '80', actions: [{ action_type: 'purchase', value: '118' }] },
    ],
    adRows: [
      { ad_id: 'a1', ad_name: 'Pizza 1', campaign_id: 'c1', spend: '10', impressions: '20', reach: '10', actions: [{ action_type: 'purchase', value: '33' }] },
      { ad_id: 'a2', ad_name: 'Pizza 2', campaign_id: 'c1', spend: '8', impressions: '12', reach: '8', actions: [{ action_type: 'purchase', value: '20' }] },
      { ad_id: 'a3', ad_name: 'Pizza 3', campaign_id: 'c2', spend: '9', impressions: '11', reach: '7', actions: [{ action_type: 'purchase', value: '59' }] },
      { ad_id: 'a4', ad_name: 'Pizza 4', campaign_id: 'c2', spend: '1', impressions: '4', reach: '2', actions: [{ action_type: 'purchase', value: '2' }] },
      { ad_id: 'a5', ad_name: 'Sobra', campaign_id: 'c2', spend: '1', impressions: '3', reach: '1', actions: [{ action_type: 'purchase', value: '1' }] },
    ],
  });
  const hiddenAd = presentReport(report, { hiddenPages: [], hiddenAds: ['a5'], text: {} });
  assert.equal(hiddenAd.gallery.flat().some((ad) => ad.id === 'a5'), false);
  assert.equal(hiddenAd.totals.result, report.totals.result);
  const hiddenPage = presentReport(report, { hiddenPages: ['cover', `campaign:${report.campaigns[0].id}`, galleryPageId(report.gallery[0])], hiddenAds: [], text: {} });
  assert.equal(hiddenPage.showCover, false);
  assert.equal(hiddenPage.campaigns.some((item) => item.id === report.campaigns[0].id), false);
  assert.equal(hiddenPage.gallery.length, 0);
  assert.equal(readText({ text: { 'label.result': 'Pedidos' } }, 'label.result', 'Vendas'), 'Pedidos');
  assert.equal(inkOn('#f1b309'), '#111111');
  assert.equal(inkOn('#111111'), '#ffffff');
});

test('report route stays inside paid traffic', () => {
  assert.equal(paidTrafficPaths.relatorio(), '/paid-traffic/relatorio');
  assert.equal(parsePaidTrafficRoute('/paid-traffic/relatorio').trafficTab, 'relatorio');
  assert.equal(parsePaidTrafficRoute('/paid-traffic/rotina').trafficTab, 'rotina');
});
