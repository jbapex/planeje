import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import {
  Bookmark,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Eye,
  Heart,
  Image as ImageIcon,
  Layers,
  Link2,
  MousePointerClick,
  Send,
  Share2,
  Target,
  User,
  UserPlus,
  Users,
} from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useModuleSettings } from '@/contexts/ModuleSettingsContext';
import { GESTOR_REPORT_TEXT_LIMIT, readGestorReportCopy } from '@/lib/gestorIaAtlasDraft';
import { canUseGestorReportArchive, gestorReportPath, uploadGestorReportPdf } from '@/lib/gestorIaReportArchive';
import { GESTOR_REPORT_WINDOWS, loadClientReportModel, loadReportModels, reportModelPeriod } from '@/lib/gestorIaReportModels';
import { loadSavedGestorMetaReport, loadSavedReportAccounts, savedReportComparisonRows } from '@/lib/gestorIaSavedReport';
import {
  accountsByPlatform,
  displaySocialAccount,
  fetchClienteSocialAccounts,
} from '@/lib/clienteSocialAccounts';
import {
  buildPerformanceReport,
  creativeUrls,
  dateRange,
  defaultReportPeriod,
  formatCount,
  formatMoney,
  isMetricVisible,
  monthRange,
  normalizeVisibleMetrics,
  periodKey,
  periodLabels,
  readReportPrefill,
  REPORT_METRICS,
  reportMetricNumber,
  toggleVisibleMetric,
} from '@/lib/trafficPerformanceReport';
import {
  buildSocialReport,
  buildSocialSlides,
  formatSocialMetric,
  mapAudienceBucket,
  mapFacebookChannel,
  mapInstagramAudience,
  mapInstagramChannel,
  normalizeVisibleSocialMetrics,
  SOCIAL_REPORT_METRICS,
  toggleVisibleSocialMetric,
} from '@/lib/trafficSocialReport';
import {
  buildGoogleReport,
  collectGoogleEvidence,
  formatGoogleMetric,
  formatPercent,
  GOOGLE_REPORT_METRICS,
  googleCampaignPages,
  isGoogleMetricVisible,
  normalizeVisibleGoogleMetrics,
  toggleVisibleGoogleMetric,
} from '@/lib/trafficGoogleReport';
import {
  analyticsChannelLabel,
  analyticsDeviceLabel,
  analyticsPageLabel,
  analyticsPlaceLabel,
  analyticsSourceLabel,
  formatDurationSeconds,
  formatRatioPercent,
  formatSignedPercent,
  analyticsDelta,
  mapAnalyticsReport,
} from '@/lib/googleDataInsightsView';
import jbApexLogo from '@/assets/traffic-report/jb-apex-logo.png';
import jbApexLogoWhite from '@/assets/traffic-report/jb-apex-logo-white.png';
import coverChart from '@/assets/traffic-report/cover-chart.png';
import { buildReportPdfBlob, downloadReportPdf } from '@/lib/trafficPerformanceReportPdf';
import {
  DEFAULT_BRAND,
  emptyDraft,
  galleryPageId,
  hiddenAdLabel,
  hiddenPageLabel,
  inkOn,
  presentReport,
  readBrand,
  readDraft,
  readReportChannel,
  readReportScope,
  readText,
  readVisibleGoogleMetrics,
  readVisibleMetrics,
  readVisibleSocialMetrics,
  writeBrand,
  writeDraft,
  writeReportChannel,
  writeReportScope,
  writeVisibleGoogleMetrics,
  writeVisibleMetrics,
  writeVisibleSocialMetrics,
} from '@/lib/trafficReportEditor';
import './TrafficPerformanceReport.css';

function initialVisibleSocialMetrics() {
  const current = normalizeVisibleSocialMetrics(readVisibleSocialMetrics());
  try {
    const flag = 'planeje.trafficReport.bioLinkSeen';
    if (localStorage.getItem(flag) === '1') return current;
    localStorage.setItem(flag, '1');
  } catch {
    return current;
  }
  if (current.includes('websiteClicks')) return current;
  const at = current.indexOf('followers');
  const next = at >= 0
    ? [...current.slice(0, at), 'websiteClicks', ...current.slice(at)]
    : [...current, 'websiteClicks'];
  writeVisibleSocialMetrics(next);
  return next;
}

const COVER_INDEX = [
  { icon: CheckCircle2, title: 'Resultados', text: 'Apresentação de métricas semanais' },
  { icon: ClipboardList, title: 'Entregas', text: 'Entenda qual etapa do projeto estamos', card: true },
  { icon: Target, title: 'O que foi feito', text: 'O que foi feito no período em destaque', card: true },
  { icon: ClipboardCheck, title: 'O que será feito', text: 'O que será feito nos próximos dias', card: true },
];

const GOOGLE_COVER_INDEX = [
  { icon: CheckCircle2, title: 'Resultados', text: 'Cliques, custo, conversões e o dia a dia do gasto' },
  { icon: Target, title: 'Campanhas', text: 'Tipo, palavras, grupos e o texto dos anúncios', card: true },
  { icon: ClipboardList, title: 'Analytics', text: 'Canal, origem, dispositivo e cidade do site', card: true },
];

const INSIGHT_METRICS = ['spend', 'impressions', 'clicks', 'reach', 'actions', 'action_values'];

function shiftDays(ymd, days) {
  const date = new Date(`${ymd}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function invokeInsights(accountId, clientId, range, level) {
  const { data, error } = await supabase.functions.invoke('meta-ads-api', {
    body: {
      action: level === 'ad' ? 'get-ad-insights' : 'get-campaign-insights',
      ad_account_id: accountId,
      cliente_id: clientId,
      time_range: { since: range.since, until: range.until },
      level,
      metrics: level === 'campaign'
        ? [...INSIGHT_METRICS, 'campaign_name', 'campaign_id']
        : level === 'ad'
          ? [...INSIGHT_METRICS, 'ad_id', 'ad_name', 'campaign_id', 'campaign_name']
          : INSIGHT_METRICS,
      limit: level === 'ad' ? 100 : 50,
    },
  });
  if (error) throw new Error(error.message || 'A Meta não respondeu.');
  if (data?.error?.message) throw new Error(data.error.message);
  return Array.isArray(data?.campaigns) ? data.campaigns : [];
}

async function loadCreative(adId) {
  const { data, error } = await supabase.functions.invoke('meta-ads-api', {
    body: { action: 'get-ad-by-id', adId: String(adId) },
  });
  if (error || data?.error) return { thumbnailUrl: '', fallbackUrl: '' };
  return creativeUrls(data?.ad || {});
}

async function attachThumbnails(report) {
  const ids = [];
  const push = (ad) => {
    if (ad?.id && !ids.includes(ad.id)) ids.push(ad.id);
  };
  report.campaigns.forEach((campaign) => campaign.creatives.forEach(push));
  report.gallery.flat().forEach(push);
  const found = new Map();
  const queue = [...ids];
  const worker = async () => {
    while (queue.length) {
      const id = queue.shift();
      found.set(id, await loadCreative(id));
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  const paint = (ad) => ({ ...ad, ...(found.get(ad.id) || { thumbnailUrl: '', fallbackUrl: '' }) });
  return {
    ...report,
    campaigns: report.campaigns.map((campaign) => ({ ...campaign, creatives: campaign.creatives.map(paint) })),
    gallery: report.gallery.map((page) => page.map(paint)),
  };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Não foi possível ler a logo.'));
    image.src = src;
  });
}

async function logoFromFile(file) {
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Não foi possível ler a logo.'));
    reader.readAsDataURL(file);
  });
  const image = await loadImage(data);
  const scale = Math.min(1, 640 / image.width, 640 / image.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

function ReportText({ id, fallback, as: Tag = 'span', draft, editing, onText }) {
  const value = readText(draft, id, fallback);
  if (!editing) return <Tag>{value}</Tag>;
  return (
    <Tag
      contentEditable
      suppressContentEditableWarning
      spellCheck
      onBlur={(event) => onText(id, event.currentTarget.textContent ?? '')}
    >
      {value}
    </Tag>
  );
}

function GestorSummaryReview({ text, included, unavailable, update }) {
  return <section className="tr-gestor-summary" aria-label="Resumo vindo do Atlas">
    <label>Resumo para o relatório
      <textarea value={text} rows={5} maxLength={GESTOR_REPORT_TEXT_LIMIT} onChange={(event) => update(event.target.value, false)} />
    </label>
    <div className="tr-toolbar-buttons">
      {unavailable ? <span>{unavailable}</span>
        : included ? <><span role="status">Resumo selecionado para o PDF.</span><button type="button" className="tr-quiet" onClick={() => update(text, false)}>Retirar do PDF</button></>
          : <button type="button" className="tr-go" disabled={!text.trim()} onClick={() => update(text, true)}>Incluir resumo no PDF</button>}
    </div>
  </section>;
}

function PageFrame({ editing, onHide, children }) {
  return (
    <div className="tr-page">
      {editing ? (
        <div className="tr-page-tools">
          <button type="button" className="tr-hide" onClick={onHide}>Ocultar página</button>
        </div>
      ) : null}
      {children}
    </div>
  );
}

function MetricRow({ labelId, label, value, strong = false, draft, editing, onText }) {
  return (
    <div className={`tr-metric${strong ? ' is-strong' : ''}`}>
      <ReportText id={labelId} fallback={label} draft={draft} editing={editing} onText={onText} />
      <i aria-hidden="true" />
      <strong>{value}</strong>
    </div>
  );
}

const SOCIAL_METRIC_ICONS = {
  reach: Eye,
  impressions: Layers,
  profileViews: User,
  pageViews: MousePointerClick,
  engagement: Heart,
  accountsEngaged: Users,
  saves: Bookmark,
  shares: Share2,
  websiteClicks: Link2,
  followers: Users,
  newFollows: UserPlus,
  posts: ImageIcon,
};

function SocialMetricCard({ labelId, label, value, metricKey, draft, editing, onText }) {
  const Icon = SOCIAL_METRIC_ICONS[metricKey] || Eye;
  const empty = value == null || value === '' || value === 'sem dado';
  return (
    <div className={`tr-social-metric${empty ? ' is-empty' : ''}`}>
      <span className="tr-social-metric-icon" aria-hidden="true"><Icon /></span>
      <div>
        <ReportText id={labelId} fallback={label} draft={draft} editing={editing} onText={onText} />
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function CreativeCard({ ad, resultLabel, editing, onHide, saved = false }) {
  return (
    <figure className="tr-creative">
      {editing ? (
        <button type="button" className="tr-hide tr-hide-ad" data-html2canvas-ignore onClick={onHide}>
          Ocultar
        </button>
      ) : null}
      <div className="tr-creative-frame">
        {ad.thumbnailUrl ? (
          <img
            src={ad.thumbnailUrl}
            alt=""
            data-fallback={ad.fallbackUrl || ''}
            onError={(event) => {
              const fallback = event.currentTarget.dataset.fallback;
              if (fallback && event.currentTarget.src !== fallback) event.currentTarget.src = fallback;
            }}
          />
        ) : (
          <div className="tr-creative-empty">{saved ? ad.name : 'Sem foto deste anúncio'}</div>
        )}
      </div>
      <figcaption>
        <b>{formatCount(ad.result)} {resultLabel}</b>
        <span>{formatCount(ad.viewCount)} {ad.viewLabel}</span>
      </figcaption>
    </figure>
  );
}

function SocialPostStat({ icon: Icon, value, label }) {
  if (value == null) return null;
  return (
    <span className="tr-ig-stat" title={label}>
      <Icon aria-hidden="true" />
      <b>{formatSocialMetric(value)}</b>
      <span className="sr-only">{label}</span>
    </span>
  );
}

function SocialPostCard({ post }) {
  const interactions = post.interactions != null ? post.interactions : post.likes;
  const hasActions = interactions != null || post.saves != null || post.shares != null;
  return (
    <figure className="tr-creative tr-social-post">
      <div className="tr-creative-frame">
        {post.thumbnailUrl ? (
          <img src={post.thumbnailUrl} alt="" referrerPolicy="no-referrer" />
        ) : (
          <div className="tr-creative-empty">Sem foto deste post</div>
        )}
      </div>
      <figcaption>
        {hasActions ? (
          <span className="tr-ig-actions">
            <SocialPostStat icon={Heart} value={interactions} label="interações" />
            <SocialPostStat icon={Bookmark} value={post.saves} label="salvamentos" />
            <SocialPostStat icon={Send} value={post.shares} label="compartilhamentos" />
          </span>
        ) : (
          <span>{post.caption ? post.caption.slice(0, 72) : post.type}</span>
        )}
        {post.reach != null ? <span>Alcance {formatSocialMetric(post.reach)}</span> : null}
      </figcaption>
    </figure>
  );
}

function AudienceBars({ groups }) {
  return (
    <div className="tr-audience-grid">
      {groups.map((group) => (
        <div key={group.key} className="tr-audience-panel">
          <h3>{group.title}</h3>
          <ul>
            {group.rows.map((row, index) => (
              <li key={`${group.key}-${row.label}-${index}`}>
                <div className="tr-audience-meta">
                  <span>{row.label}</span>
                  <strong>
                    {row.value}
                    {row.pct != null ? <em> · {row.pct}%</em> : null}
                  </strong>
                </div>
                <div className="tr-audience-track">
                  <i style={{ width: `${Math.max(row.pct == null ? 0 : row.pct, row.raw == null ? 0 : 2)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function SlideHeader({ kickerId, kicker, titleId, title, asideId, aside, draft, editing, onText }) {
  return (
    <header className="tr-slide-head">
      <div>
        <p>JB Apex</p>
        <ReportText as="h2" id={titleId} fallback={title} draft={draft} editing={editing} onText={onText} />
        {kicker ? <ReportText as="span" id={kickerId} fallback={kicker} draft={draft} editing={editing} onText={onText} /> : null}
      </div>
      {aside ? (
        <div className="tr-slide-aside">
          <ReportText as="b" id={asideId} fallback={aside} draft={draft} editing={editing} onText={onText} />
        </div>
      ) : null}
    </header>
  );
}

function paidMetricRows(report, draft, editing, onText, visible) {
  const rows = [
    { key: 'reach', labelId: 'label.reach', label: 'Alcance', value: report.totals.reach == null ? '—' : formatCount(report.totals.reach) },
    { key: 'impressions', labelId: 'label.impressions', label: 'Impressões', value: formatCount(report.totals.impressions) },
    { key: 'clicks', labelId: 'label.clicks', label: 'Cliques', value: formatCount(report.totals.clicks) },
    { key: 'result', labelId: 'label.result', label: report.result.label, value: formatCount(report.totals.result) },
    {
      key: 'cost',
      labelId: 'label.cost',
      label: report.result.costLabel,
      value: report.totals.cost == null ? '—' : formatMoney(report.totals.cost, report.currency),
    },
    { key: 'spend', labelId: 'label.spend', label: 'Investimento', value: formatMoney(report.totals.spend, report.currency), strong: true },
    { key: 'messages', labelId: 'label.messages', label: 'Mensagens iniciadas', value: formatCount(report.totals.messages) },
    { key: 'leads', labelId: 'label.leads', label: 'Leads', value: formatCount(report.totals.leads) },
    ...paidRateRows(report.totals, report.currency),
  ];
  return rows
    .filter((row) => isMetricVisible(visible, row.key))
    .map((row) => (
      <MetricRow
        key={row.key}
        labelId={row.labelId}
        label={row.label}
        value={row.value}
        strong={Boolean(row.strong)}
        draft={draft}
        editing={editing}
        onText={onText}
      />
    ));
}

function googleMetricRows(report, draft, editing, onText, visible) {
  const rows = [
    { key: 'impressions', labelId: 'label.g.impressions', label: 'Impressões', value: formatCount(report.totals.impressions) },
    { key: 'clicks', labelId: 'label.g.clicks', label: 'Cliques', value: formatCount(report.totals.clicks) },
    { key: 'ctr', labelId: 'label.g.ctr', label: 'CTR', value: formatPercent(report.totals.ctr) },
    { key: 'cpc', labelId: 'label.g.cpc', label: 'CPC', value: formatGoogleMetric('cpc', report.totals) },
    { key: 'spend', labelId: 'label.g.spend', label: 'Investimento', value: formatMoney(report.totals.spend), strong: true },
    { key: 'conversions', labelId: 'label.g.conversions', label: 'Conversões', value: formatCount(report.totals.conversions) },
    { key: 'cost', labelId: 'label.g.cost', label: 'Custo por conversão', value: formatGoogleMetric('cost', report.totals) },
    { key: 'value', labelId: 'label.g.value', label: 'Valor das conversões', value: formatGoogleMetric('value', report.totals) },
    { key: 'roas', labelId: 'label.g.roas', label: 'ROAS', value: formatGoogleMetric('roas', report.totals) },
  ];
  return rows
    .filter((row) => isGoogleMetricVisible(visible, row.key))
    .map((row) => (
      <MetricRow
        key={row.key}
        labelId={row.labelId}
        label={row.label}
        value={row.value}
        strong={Boolean(row.strong)}
        draft={draft}
        editing={editing}
        onText={onText}
      />
    ));
}

function KpiChecks({ items, picked, onToggle }) {
  return (
    <div className="tr-kpi-grid">
      {items.map((item) => (
        <label key={item.key}>
          <input
            type="checkbox"
            checked={picked.includes(item.key)}
            onChange={(event) => onToggle(item.key, event.target.checked)}
          />
          {item.label}
        </label>
      ))}
    </div>
  );
}

function paidRateRows(totals, currency) {
  const ctr = reportMetricNumber(totals, 'ctr');
  const cpc = reportMetricNumber(totals, 'cpc');
  return [
    { key: 'ctr', labelId: 'label.ctr', label: 'CTR', value: formatPercent(ctr === null ? null : ctr * 100) },
    { key: 'cpc', labelId: 'label.cpc', label: 'CPC', value: cpc === null ? '—' : formatMoney(cpc, currency) },
  ];
}

function campaignMetricRows(campaign, result, draft, editing, onText, visible, currency) {
  const rows = [
    { key: 'reach', labelId: 'label.reach', label: 'Alcance', value: campaign.reach == null ? '—' : formatCount(campaign.reach) },
    { key: 'impressions', labelId: 'label.impressions', label: 'Impressões', value: formatCount(campaign.impressions) },
    { key: 'clicks', labelId: 'label.clicks', label: 'Cliques', value: formatCount(campaign.clicks) },
    { key: 'result', labelId: 'label.result', label: result.label, value: formatCount(campaign.result) },
    {
      key: 'cost',
      labelId: 'label.cost',
      label: result.costLabel,
      value: campaign.cost == null ? '—' : formatMoney(campaign.cost, currency),
    },
    { key: 'spend', labelId: 'label.spend', label: 'Investimento', value: formatMoney(campaign.spend, currency), strong: true },
    { key: 'messages', labelId: 'label.messages', label: 'Mensagens iniciadas', value: formatCount(campaign.messages) },
    { key: 'leads', labelId: 'label.leads', label: 'Leads', value: formatCount(campaign.leads) },
    ...paidRateRows(campaign, currency),
  ];
  return rows
    .filter((row) => isMetricVisible(visible, row.key))
    .map((row) => (
      <MetricRow
        key={row.key}
        labelId={row.labelId}
        label={row.label}
        value={row.value}
        strong={Boolean(row.strong)}
        draft={draft}
        editing={editing}
        onText={onText}
      />
    ));
}

async function enrichInstagramMedia(mediaItems, limit = 12) {
  const slice = (mediaItems || []).slice(0, limit);
  const enriched = await Promise.all(slice.map(async (item) => {
    try {
      const { data, error } = await supabase.functions.invoke('meta-ads-api', {
        body: {
          action: 'get-instagram-media-insights',
          media_id: item.id,
          media_type: item.media_type,
        },
      });
      if (error || data?.error) return item;
      const map = {};
      for (const row of data?.insights || []) {
        if (!row?.name) continue;
        const value = row.value != null && row.value !== ''
          ? Number(row.value)
          : (Array.isArray(row.values) ? Number(row.values[0]?.value) : null);
        map[row.name] = Number.isFinite(value) ? value : null;
      }
      return {
        ...item,
        insights: {
          ...(item.insights || {}),
          reach: map.reach ?? item.insights?.reach,
          total_interactions: map.total_interactions,
          likes: map.likes ?? item.like_count,
          comments: map.comments ?? item.comments_count,
          saved: map.saved,
          shares: map.shares,
          views: map.views,
        },
      };
    } catch {
      return item;
    }
  }));
  return [...enriched, ...(mediaItems || []).slice(limit)];
}

async function enrichPagePosts(posts, pageId, limit = 12) {
  const slice = (posts || []).slice(0, limit);
  const enriched = await Promise.all(slice.map(async (post) => {
    try {
      const { data, error } = await supabase.functions.invoke('meta-ads-api', {
        body: {
          action: 'get-page-post-insights',
          post_id: post.id,
          page_id: pageId,
        },
      });
      if (error || data?.error) return post;
      const metrics = data?.metrics || {};
      return {
        ...post,
        insights: {
          ...(post.insights || {}),
          reach: metrics.reach ?? post.insights?.reach,
          views: metrics.views ?? post.insights?.views,
          engagement: post.insights?.engagement
            ?? ((Number(post.reactions_count) || 0)
              + (Number(post.comments_count) || 0)
              + (Number(post.shares_count) || 0)),
          likes: post.reactions_count,
          comments: post.comments_count,
          shares: post.shares_count,
        },
      };
    } catch {
      return post;
    }
  }));
  return [...enriched, ...(posts || []).slice(limit)];
}

async function loadSocialBlock(clientId, range) {
  const accounts = await fetchClienteSocialAccounts(supabase, clientId);
  const { instagram, pages } = accountsByPlatform(accounts);
  const ig = instagram[0] || null;
  const page = pages[0] || null;
  const notes = [];
  const channels = [];
  const timeRange = { since: range.since, until: range.until };

  if (ig?.meta_id) {
    try {
      const [insightsRes, profileRes, mediaRes, audienceRes] = await Promise.all([
        supabase.functions.invoke('meta-ads-api', {
          body: {
            action: 'get-instagram-insights',
            instagram_account_id: ig.meta_id,
            time_range: timeRange,
            metrics: ['reach', 'impressions', 'profile_views', 'website_clicks', 'profile_links_taps', 'total_interactions', 'accounts_engaged', 'follower_count', 'follows_and_unfollows'],
          },
        }),
        supabase.functions.invoke('meta-ads-api', {
          body: { action: 'get-instagram-profile', instagram_account_id: ig.meta_id },
        }),
        supabase.functions.invoke('meta-ads-api', {
          body: {
            action: 'get-instagram-media',
            instagram_account_id: ig.meta_id,
            time_range: timeRange,
          },
        }),
        supabase.functions.invoke('meta-ads-api', {
          body: {
            action: 'get-instagram-audience',
            instagram_account_id: ig.meta_id,
            timeframe: 'this_month',
          },
        }),
      ]);
      if (insightsRes.error || insightsRes.data?.error) {
        notes.push(`Instagram: ${insightsRes.data?.error?.message || insightsRes.error?.message || 'sem resposta'}`);
      } else {
        const profile = profileRes.data?.profile;
        let media = (!mediaRes.error && !mediaRes.data?.error) ? (mediaRes.data?.media || []) : [];
        media = await enrichInstagramMedia(media, 12);
        const audienceNote = audienceRes.data?.error?.message
          || audienceRes.error?.message
          || '';
        const audience = mapInstagramAudience(
          (!audienceRes.error && audienceRes.data?.audience) ? audienceRes.data.audience : null,
          audienceNote,
        );
        channels.push(mapInstagramChannel({
          handle: profile?.username
            ? `@${String(profile.username).replace(/^@/, '')}`
            : displaySocialAccount(ig),
          insights: insightsRes.data?.insights || [],
          followers: profile?.followers_count ?? null,
          mediaCount: Array.isArray(media) ? media.length : null,
          posts: media,
          audience,
          audienceNote,
        }));
      }
    } catch (err) {
      notes.push(`Instagram: ${err.message || 'falha na Meta'}`);
    }
  }

  if (page?.meta_id) {
    try {
      const [insightsRes, profileRes, postsRes, audienceRes] = await Promise.all([
        supabase.functions.invoke('meta-ads-api', {
          body: {
            action: 'get-page-insights',
            page_id: page.meta_id,
            time_range: timeRange,
          },
        }),
        supabase.functions.invoke('meta-ads-api', {
          body: { action: 'get-page-profile', page_id: page.meta_id },
        }),
        supabase.functions.invoke('meta-ads-api', {
          body: {
            action: 'get-page-posts',
            page_id: page.meta_id,
            time_range: timeRange,
          },
        }),
        supabase.functions.invoke('meta-ads-api', {
          body: {
            action: 'get-page-audience',
            page_id: page.meta_id,
            time_range: timeRange,
          },
        }),
      ]);
      if (insightsRes.error || insightsRes.data?.error) {
        notes.push(`Facebook: ${insightsRes.data?.error?.message || insightsRes.error?.message || 'sem resposta'}`);
      } else {
        const profile = profileRes.data?.profile;
        let posts = (!postsRes.error && !postsRes.data?.error) ? (postsRes.data?.posts || []) : [];
        posts = await enrichPagePosts(posts, page.meta_id, 12);
        const pageAudience = (!audienceRes.error && audienceRes.data?.audience) ? audienceRes.data.audience : null;
        const audienceNote = audienceRes.data?.note
          || audienceRes.data?.error?.message
          || audienceRes.error?.message
          || '';
        channels.push(mapFacebookChannel({
          handle: displaySocialAccount(page),
          insights: insightsRes.data?.insights || [],
          followers: profile?.followers_count ?? profile?.fan_count ?? null,
          postCount: Array.isArray(posts) ? posts.length : null,
          posts,
          audience: mapAudienceBucket(pageAudience, audienceNote),
          audienceNote,
        }));
      }
    } catch (err) {
      notes.push(`Facebook: ${err.message || 'falha na Meta'}`);
    }
  }

  if (!ig && !page) {
    notes.push('Nenhuma conta de Instagram ou página Facebook ligada a este cliente.');
  }

  return buildSocialReport({
    clientName: '',
    range,
    channels,
    note: notes.join(' '),
  });
}

async function loadGoogleAnalytics(clientId, range) {
  try {
    const { data: links, error } = await supabase
      .from('cliente_google_analytics_properties')
      .select('property_id, property_name')
      .eq('cliente_id', clientId)
      .eq('is_active', true)
      .limit(1);
    if (error) return { report: null, note: 'Analytics não entrou nesta leitura.' };
    const link = links?.[0];
    if (!link?.property_id) {
      return { report: null, note: 'Analytics não está vinculado a este cliente. Os números de cima são só do Google Ads.' };
    }
    const { data, error: fnError } = await supabase.functions.invoke('google-data-api', {
      body: {
        action: 'get-analytics-overview',
        propertyId: link.property_id,
        since: range.since,
        until: range.until,
      },
    });
    if (fnError || data?.error?.message) {
      return { report: null, note: 'O Analytics não devolveu o período. Os números de anúncio continuam os do Google Ads.' };
    }
    return {
      report: { name: link.property_name || 'Analytics', ...mapAnalyticsReport({ ...data, since: range.since, until: range.until }) },
      note: '',
    };
  } catch {
    return { report: null, note: 'Analytics não entrou nesta leitura.' };
  }
}

const MONTH_NAMES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

function formatBrDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!match) return '';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function parseBrDate(text) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(text || '').trim());
  if (!match) return '';
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  const date = new Date(`${iso}T12:00:00Z`);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return '';
  return iso;
}

function maskBrDate(raw) {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join('/');
}

function monthChoices(selected) {
  const now = new Date();
  const items = [];
  for (let offset = -14; offset <= 2; offset += 1) {
    const cursor = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const value = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    items.push({ value, label: `${MONTH_NAMES[cursor.getMonth()]} de ${cursor.getFullYear()}` });
  }
  if (selected && !items.some((item) => item.value === selected)) {
    const [year, month] = selected.split('-').map(Number);
    if (month >= 1 && month <= 12) items.push({ value: selected, label: `${MONTH_NAMES[month - 1]} de ${year}` });
  }
  return items.sort((a, b) => b.value.localeCompare(a.value));
}

function BrDateField({ label, value, onChange }) {
  const [text, setText] = useState(formatBrDate(value));
  useEffect(() => { setText(formatBrDate(value)); }, [value]);
  return (
    <label>
      {label}
      <input
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd/mm/aaaa"
        value={text}
        onChange={(event) => {
          const next = maskBrDate(event.target.value);
          setText(next);
          const iso = parseBrDate(next);
          if (iso) onChange(iso);
        }}
        onBlur={() => setText(formatBrDate(value))}
      />
    </label>
  );
}

export default function TrafficPerformanceReport() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const fromGestor = searchParams.get('origem') === 'gestor-ia';
  const { user, profile, canViewField } = useAuth();
  const { moduleSettings, loading: modulesLoading } = useModuleSettings();
  const { clientId: prefillClientId, period: prefillPeriod } = readReportPrefill(searchParams);
  const prefillSince = prefillPeriod?.since;
  const prefillUntil = prefillPeriod?.until;
  const initialPeriod = useMemo(() => defaultReportPeriod(), []);
  const [clients, setClients] = useState([]);
  const [selectedClientId, setClientId] = useState(prefillClientId);
  const [since, setSince] = useState(prefillSince ?? initialPeriod.since);
  const [until, setUntil] = useState(prefillUntil ?? initialPeriod.until);
  const [channel, setChannel] = useState(() => fromGestor ? 'meta' : readReportChannel());
  const [scope, setScope] = useState(() => fromGestor ? 'paid' : readReportScope());
  const [savedAccounts, setSavedAccounts] = useState(null);
  const [selectedMeta, setSelectedMeta] = useState(null);
  const [modelSettings, setModelSettings] = useState(null);
  const [modelChoice, setModelChoice] = useState(null);
  const [gestorMetrics, setGestorMetrics] = useState(null);
  const [kpiOpen, setKpiOpen] = useState(false);
  const [visibleMetrics, setVisibleMetrics] = useState(() => normalizeVisibleMetrics(readVisibleMetrics()));
  const [visibleSocialMetrics, setVisibleSocialMetrics] = useState(initialVisibleSocialMetrics);
  const [visibleGoogleMetrics, setVisibleGoogleMetrics] = useState(() => normalizeVisibleGoogleMetrics(readVisibleGoogleMetrics()));
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState('');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState(null);
  const [brand, setBrand] = useState(DEFAULT_BRAND);
  const [draft, setDraft] = useState(emptyDraft);
  const [summaryDraft, setSummaryDraft] = useState(null);
  const [savedPdf, setSavedPdf] = useState(null);
  const deckRef = useRef(null);
  const filterRevision = useRef(0);
  const archiveAttempt = useRef(null);
  const archiveRender = useRef(null);

  const client = useMemo(() => clients.find(({ id }) => id === selectedClientId), [clients, selectedClientId]);
  const clientId = client?.id || '';
  const clientName = client?.empresa || '';
  const range = useMemo(() => dateRange(since, until), [since, until]);
  const storagePeriod = range ? periodKey(range) : '';
  const summaryCopy = readGestorReportCopy({ state: location.state, ownerId: user?.id, clientId, period: range });
  const summaryReview = summaryCopy && (summaryDraft?.locationKey === location.key ? summaryDraft : { text: summaryCopy, included: false });
  const paidReportScope = channel === 'google' || scope !== 'social';
  const summaryUnavailable = !paidReportScope ? 'Selecione um relatório com tráfego pago para incluir este resumo.'
    : report?.savedMeta?.exact === false ? 'O resumo corresponde ao período solicitado. Use o recorte salvo para redigir um novo resumo.' : '';
  const includedSummary = !summaryUnavailable && summaryReview?.included ? summaryReview.text.trim() : '';
  const archiveAllowed = fromGestor && !modulesLoading && user?.id === profile?.id &&
    canUseGestorReportArchive(profile, moduleSettings, canViewField);
  const savedMetaMode = fromGestor && channel === 'meta' && paidReportScope;
  const modelKey = savedMetaMode && archiveAllowed && clientId ? JSON.stringify([user.id, clientId]) : '';
  const modelPending = Boolean(modelKey && modelSettings?.key !== modelKey);
  const loadedModels = modelKey && modelSettings?.key === modelKey ? modelSettings : null;
  const modelId = (modelChoice?.key === modelKey ? modelChoice.id : loadedModels?.defaultId) || '';
  const activeModel = loadedModels?.models.find(({ id }) => id === modelId);
  const metricsKey = JSON.stringify([modelKey, activeModel?.id, activeModel?.revision]);
  const paidOn = gestorMetrics?.key === metricsKey && savedMetaMode ? gestorMetrics.metrics : activeModel?.metrics || visibleMetrics;
  const metaAccounts = savedAccounts?.clientId === clientId ? savedAccounts.accounts : [];
  const metaAccountId = selectedMeta?.clientId === clientId ? selectedMeta.id : '';
  const archiveVersion = useMemo(() => [archiveAllowed, user?.id, clientId, range, channel, scope, metaAccountId,
    report, draft, brand, includedSummary, paidOn, visibleSocialMetrics, visibleGoogleMetrics], [archiveAllowed, user?.id, clientId, range, channel, scope, metaAccountId,
    report, draft, brand, includedSummary, paidOn, visibleSocialMetrics, visibleGoogleMetrics]);
  const archived = savedPdf === archiveVersion;

  useLayoutEffect(() => {
    archiveRender.current = archiveVersion;
    return () => { archiveRender.current = null; archiveAttempt.current = null; };
  }, [archiveVersion]);

  useEffect(() => {
    let alive = true;
    supabase.from('clientes').select('id, empresa').eq('etapa', 'closed').order('empresa').then(({ data, error: loadError }) => {
      if (!alive) return;
      if (loadError) {
        setError(loadError.message || 'Não foi possível listar os clientes.');
        return;
      }
      setClients(data || []);
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    setClientId(prefillClientId);
  }, [prefillClientId]);

  useEffect(() => {
    setChannel(fromGestor ? 'meta' : readReportChannel());
    setScope(fromGestor ? 'paid' : readReportScope());
  }, [fromGestor]);

  useEffect(() => {
    if (!savedMetaMode || !archiveAllowed || !clientId) return;
    let active = true;
    loadSavedReportAccounts(supabase, clientId).then((accounts) => {
      if (active) setSavedAccounts({ clientId, accounts });
    }).catch(() => { if (active) setSavedAccounts({ clientId, accounts: [], failed: true }); });
    return () => { active = false; };
  }, [archiveAllowed, clientId, savedMetaMode]);

  useEffect(() => {
    if (!modelKey) return;
    let active = true;
    Promise.all([loadReportModels(supabase), loadClientReportModel(supabase, clientId)]).then(([models, binding]) => {
      if (active) setModelSettings({ key: modelKey, models, defaultId: binding.model_id });
    }).catch(() => { if (active) setModelSettings({ key: modelKey, models: [], failed: true }); });
    return () => { active = false; };
  }, [clientId, modelKey]);

  useEffect(() => {
    if (!prefillSince || !prefillUntil) return;
    setSince(prefillSince);
    setUntil(prefillUntil);
  }, [prefillClientId, prefillSince, prefillUntil]);

  useEffect(() => {
    setReport(null);
    return () => { filterRevision.current += 1; };
  }, [clientId, since, until, scope, channel, fromGestor, metaAccountId, archiveAllowed, activeModel]);

  useEffect(() => {
    setBrand(readBrand());
  }, []);

  useEffect(() => {
    setDraft(readDraft(clientId, storagePeriod));
  }, [clientId, storagePeriod]);

  const view = useMemo(() => (report && (!report.savedMeta || archiveAllowed) ? presentReport(report, draft) : null), [report, draft, archiveAllowed]);
  const hasPaid = Boolean(view?.includePaid);
  const hasSocial = Boolean(view?.showSocial && view.social?.channels?.length);
  const socialSlides = useMemo(
    () => (hasSocial ? buildSocialSlides(view.social.channels, visibleSocialMetrics) : []),
    [hasSocial, view, visibleSocialMetrics],
  );

  const saveDraft = (next) => {
    setDraft(next);
    writeDraft(clientId, storagePeriod, next);
  };

  const saveBrand = (next) => {
    try {
      writeBrand(next);
      setBrand(next);
    } catch {
      setError('A logo não coube neste navegador. Use um arquivo menor.');
    }
  };

  const onText = (id, value) => {
    saveDraft({ ...draft, text: { ...draft.text, [id]: value } });
  };

  const hidePage = (id) => {
    if (draft.hiddenPages.includes(id)) return;
    saveDraft({ ...draft, hiddenPages: [...draft.hiddenPages, id] });
  };

  const hideAd = (id) => {
    if (draft.hiddenAds.includes(id)) return;
    saveDraft({ ...draft, hiddenAds: [...draft.hiddenAds, id] });
  };

  const applyMonthPreset = (ym) => {
    const next = monthRange(ym);
    if (!next) return;
    setSince(next.since);
    setUntil(next.until);
  };

  const applyModelPeriod = () => {
    const next = reportModelPeriod(activeModel?.window_key);
    if (!next) { setError('Ainda não há dias fechados neste mês. Escolha outro período.'); return; }
    setError('');
    setSince(next.since);
    setUntil(next.until);
  };

  const changeChannel = (next) => {
    const value = next === 'google' ? 'google' : 'meta';
    setChannel(value);
    if (!fromGestor) writeReportChannel(value);
    setKpiOpen(false);
  };

  const changeScope = (next) => {
    setScope(next);
    if (!fromGestor) writeReportScope(next);
  };

  const changeMetric = (key, on) => {
    const next = toggleVisibleMetric(paidOn, key, on);
    if (savedMetaMode) { setGestorMetrics({ key: metricsKey, metrics: next }); return; }
    setVisibleMetrics(next);
    writeVisibleMetrics(next);
  };

  const changeSocialMetric = (key, on) => {
    const next = toggleVisibleSocialMetric(visibleSocialMetrics, key, on);
    setVisibleSocialMetrics(next);
    writeVisibleSocialMetrics(next);
  };

  const changeGoogleMetric = (key, on) => {
    const next = toggleVisibleGoogleMetric(visibleGoogleMetrics, key, on);
    setVisibleGoogleMetrics(next);
    writeVisibleGoogleMetrics(next);
  };

  const generateGoogle = async () => {
    const { data, error: loadError } = await supabase
      .from('cliente_google_ads_accounts')
      .select('google_customer_id, google_customer_name')
      .eq('cliente_id', clientId)
      .eq('is_active', true);
    if (loadError) throw new Error(loadError.message);
    const linked = (data || [])
      .map((row) => ({
        id: String(row.google_customer_id || '').replace(/-/g, '').trim(),
        name: row.google_customer_name || '',
      }))
      .filter((row) => row.id);
    if (!linked.length) throw new Error('Nenhuma conta de Google Ads ligada a este cliente.');
    const accounts = [];
    const notes = [];
    for (const account of linked) {
      const { data: payload, error } = await supabase.functions.invoke('google-ads-api', {
        body: {
          action: 'get-campaigns',
          customerId: account.id,
          time_range: { since: range.since, until: range.until },
        },
      });
      if (error || payload?.error?.message) {
        notes.push(`${account.name || account.id}: ${payload?.error?.message || error?.message || 'falha no Google Ads'}`);
        continue;
      }
      accounts.push({
        id: account.id,
        name: account.name || payload?.accountName || account.id,
        campaigns: payload?.campaigns || [],
        daily: payload?.daily || [],
      });
    }
    const built = buildGoogleReport({
      clientName,
      range,
      accounts,
      note: notes.join(' '),
    });
    if (!built.campaigns.length) {
      throw new Error(notes[0] || 'O Google Ads não devolveu entrega neste período.');
    }
    const top = built.campaigns.filter((row) => row.sourceId && row.customerId).slice(0, 4);
    const [details, analytics] = await Promise.all([
      Promise.all(top.map(async (campaign) => {
        try {
          const { data: payload, error } = await supabase.functions.invoke('google-ads-api', {
            body: {
              action: 'get-campaign-detail',
              customerId: campaign.customerId,
              campaignId: campaign.sourceId,
              time_range: { since: range.since, until: range.until },
            },
          });
          if (error || payload?.error?.message) return null;
          return payload;
        } catch {
          return null;
        }
      })),
      loadGoogleAnalytics(clientId, range),
    ]);
    const evidence = collectGoogleEvidence(details);
    built.keywords = evidence.keywords;
    built.ads = evidence.ads;
    built.groups = evidence.groups;
    built.analytics = analytics.report;
    built.analyticsNote = analytics.note;
    if (!evidence.keywords.length && !evidence.ads.length && !evidence.groups.length && top.length) {
      built.note = [built.note, 'Palavras e texto dos anúncios não voltaram nesta leitura.'].filter(Boolean).join(' ');
    }
    return built;
  };

  const generate = async () => {
    if (loading || modelPending) return;
    if (!clientId || !range) {
      setError('Escolha o cliente e um período válido (data inicial até a final).');
      return;
    }
    const revision = filterRevision.current;
    const showReport = (next) => {
      if (filterRevision.current === revision) setReport(next);
    };
    setLoading(true);
    setError('');
    setReport(null);
    try {
      if (channel === 'google') {
        showReport(await generateGoogle());
        return;
      }
      const wantPaid = scope === 'paid' || scope === 'both';
      const wantSocial = scope === 'social' || scope === 'both';
      let paidReport = null;
      let social = null;
      let reportPeriod = range;
      const notes = [];

      if (wantPaid && savedMetaMode) {
        if (!archiveAllowed) throw new Error('Acesso ao relatório salvo indisponível.');
        const saved = await loadSavedGestorMetaReport(supabase, { clientId, clientName, period: range, accountId: metaAccountId, linkedAccounts: metaAccounts,
          compare: activeModel?.compare_previous === true, includeCreatives: activeModel?.include_creatives !== false });
        if (saved.report) {
          paidReport = { ...saved.report, reportModel: activeModel };
          reportPeriod = paidReport.range;
        } else if (scope === 'paid') throw new Error(saved.note);
        else notes.push(saved.note);
      } else if (wantPaid) {
        const [accountsRes, settingsRes, reviewsRes, vendasRes] = await Promise.all([
          supabase.from('cliente_meta_accounts').select('meta_account_id, meta_account_name, is_active').eq('cliente_id', clientId).eq('is_active', true),
          supabase.from('traffic_weekly_settings').select('result_label').eq('client_id', clientId).maybeSingle(),
          supabase.from('traffic_weekly_reviews').select('week_start, analysis, data_note, action_draft, kind').eq('client_id', clientId).eq('kind', 'review').gte('week_start', shiftDays(range.since, -6)).lte('week_start', range.until).order('week_start'),
          supabase.from('crm_vendas').select('valor_total, data_venda').eq('cliente_id', clientId).gte('data_venda', range.since).lte('data_venda', range.until),
        ]);
        if (accountsRes.error) throw new Error(accountsRes.error.message);
        const accounts = (accountsRes.data || []).filter((row) => row.meta_account_id);
        if (!accounts.length) {
          if (scope === 'paid') throw new Error('Nenhuma conta de anúncio ligada a este cliente.');
          notes.push('Tráfego pago: nenhuma conta de anúncio ligada.');
        } else {
          const accountRows = [];
          const campaignRows = [];
          const adRows = [];
          for (const account of accounts) {
            try {
              const [accountLevel, campaigns, ads] = await Promise.all([
                invokeInsights(account.meta_account_id, clientId, range, 'account'),
                invokeInsights(account.meta_account_id, clientId, range, 'campaign'),
                invokeInsights(account.meta_account_id, clientId, range, 'ad'),
              ]);
              accountRows.push(...accountLevel);
              campaignRows.push(...campaigns);
              adRows.push(...ads);
            } catch (err) {
              notes.push(`${account.meta_account_name || account.meta_account_id}: ${err.message || 'falha na Meta'}`);
            }
          }
          if (!accountRows.length && !campaignRows.length && !adRows.length) {
            if (scope === 'paid') throw new Error(notes[0] || 'A Meta não devolveu números neste período.');
            notes.push(notes[0] || 'Tráfego pago: a Meta não devolveu números neste período.');
          } else {
            paidReport = buildPerformanceReport({
              clientName,
              range,
              resultLabel: settingsRes.data?.result_label || '',
              accountRows,
              campaignRows,
              adRows,
              vendas: vendasRes.error ? [] : vendasRes.data || [],
              reviews: reviewsRes.error ? [] : reviewsRes.data || [],
              accountNote: notes.join(' '),
            });
            paidReport = await attachThumbnails(paidReport);
          }
        }
      }

      if (wantSocial) {
        social = await loadSocialBlock(clientId, reportPeriod);
        social = { ...social, clientName };
        if (social.empty && scope === 'social') {
          throw new Error(social.note || 'Sem Instagram ou página Facebook para este cliente.');
        }
      }

      if (!paidReport && (!social || social.empty)) {
        throw new Error(notes.filter(Boolean).join(' ') || social?.note || 'Não foi possível montar o relatório neste período.');
      }

      if (paidReport) {
        showReport({
          ...paidReport,
          includePaid: true,
          accountNote: paidReport.accountNote || notes.filter(Boolean).join(' '),
          social: social && !social.empty ? social : null,
        });
      } else {
        showReport({
          clientName,
          range,
          labels: social.labels,
          result: { key: 'leads', label: 'Resultados', costLabel: 'Custo por resultado' },
          intro: '',
          totals: { spend: 0, impressions: 0, clicks: 0, reach: 0, messages: 0, leads: 0, purchases: 0, purchaseValue: 0, views: 0, result: 0, cost: null },
          campaigns: [],
          gallery: [],
          sales: { count: 0, value: 0, ticket: null, roi: null, spend: 0, source: 'none' },
          notes: { done: [], next: [] },
          accountNote: notes.join(' '),
          showCampaignSlides: false,
          showSales: false,
          showNotes: false,
          includePaid: false,
          social,
        });
      }
    } catch (err) {
      if (filterRevision.current === revision) setError(err.message || 'Não foi possível montar o relatório.');
    } finally {
      setLoading(false);
    }
  };

  const exportPdf = async (archive) => {
    const deck = deckRef.current;
    if (!deck || exporting || (archive && (!archiveAllowed || archived))) return;
    setExporting(archive ? 'archive' : 'download');
    setError('');
    const reportRoot = deck.closest('.tr-report');
    reportRoot?.classList.remove('is-editing');
    try {
      if (!archive) {
        await downloadReportPdf(deck, { clientName: report?.clientName, month: report?.range ? periodKey(report.range) : storagePeriod || since });
        return;
      }
      if (!archiveAttempt.current) {
        const source = channel === 'google' ? 'google' : report.includePaid ? report.social ? 'meta_redes' : 'meta' : 'redes';
        const path = gestorReportPath(clientId, user?.id, report.range, source, crypto.randomUUID());
        const blob = await buildReportPdfBlob(deck);
        if (archiveRender.current !== archiveVersion) return;
        archiveAttempt.current = { path, blob };
      }
      const { path, blob } = archiveAttempt.current;
      await uploadGestorReportPdf(supabase, path, blob);
      if (archiveRender.current === archiveVersion) {
        archiveAttempt.current = null;
        setSavedPdf(archiveVersion);
      }
    } catch (err) {
      if (!archive || archiveRender.current === archiveVersion) setError(err.message || 'Não foi possível gerar o PDF.');
    } finally {
      if (editing) reportRoot?.classList.add('is-editing');
      setExporting('');
    }
  };

  const pickLogo = async (file) => {
    if (!file) return;
    try {
      const logo = await logoFromFile(file);
      saveBrand({ ...brand, logo });
    } catch (err) {
      setError(err.message || 'Não foi possível usar essa logo.');
    }
  };

  const textProps = { draft, editing, onText };
  const brandStyle = {
    '--tr-accent': brand.accent,
    '--tr-ink': brand.ink,
    '--tr-on-accent': inkOn(brand.accent),
    '--tr-on-ink': inkOn(brand.ink),
  };
  const monthValue = range && range.since.slice(0, 7) === range.until.slice(0, 7) ? range.since.slice(0, 7) : '';
  const socialOn = normalizeVisibleSocialMetrics(visibleSocialMetrics);
  const googleOn = normalizeVisibleGoogleMetrics(visibleGoogleMetrics);
  const kpiCount = channel === 'google'
    ? googleOn.length
    : (scope === 'paid' ? paidOn.length : scope === 'social' ? socialOn.length : paidOn.length + socialOn.length);

  return (
    <section className={`tr-report${editing ? ' is-editing' : ''}`}>
      <div className="tr-toolbar">
        <div className="tr-toolbar-fields">
          <label className="tr-client">
            Cliente
            <select value={clientId} onChange={(event) => setClientId(event.target.value)}>
              <option value="">Escolher</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.empresa}</option>)}
            </select>
          </label>
          {savedMetaMode && archiveAllowed && <label className="tr-client">
            Conta Meta
            <select value={metaAccountId} onChange={(event) => setSelectedMeta({ clientId, id: event.target.value })}>
              <option value="">Todas as contas</option>
              {metaAccountId && !metaAccounts.some(({ id }) => id === metaAccountId) && <option value={metaAccountId} disabled>Conta selecionada indisponível</option>}
              {metaAccounts.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>}
          <BrDateField label="De" value={since} onChange={setSince} />
          <BrDateField label="Até" value={until} onChange={setUntil} />
          <label>
            Mês
            <select aria-label="Atalho do mês" value={monthValue} onChange={(event) => applyMonthPreset(event.target.value)}>
              <option value="">{monthValue ? 'Período solto' : 'Escolher'}</option>
              {monthChoices(monthValue).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          {modelKey && (modelPending || loadedModels?.models.length > 0) && <label className="tr-client">
            Modelo de relatório
            <select value={activeModel?.id || ''} disabled={modelPending} onChange={(event) => {
              setModelChoice({ key: modelKey, id: event.target.value });
              setGestorMetrics(null);
              setError('');
            }}>
              <option value="">{modelPending ? 'Consultando…' : 'Sem modelo'}</option>
              {loadedModels?.models.map(({ id, name }) => <option key={id} value={id}>{name}{id === loadedModels.defaultId ? ' · padrão' : ''}</option>)}
            </select>
          </label>}
          {activeModel && <button type="button" className="tr-quiet" onClick={applyModelPeriod} title={GESTOR_REPORT_WINDOWS[activeModel.window_key]}>Usar janela do modelo</button>}
        </div>
        <div className="tr-toolbar-actions">
          <div className="tr-menu">
            <div className="tr-scope" role="tablist" aria-label="Relatório">
              <button type="button" role="tab" aria-selected={channel === 'meta'} className={channel === 'meta' ? 'is-active' : ''} onClick={() => changeChannel('meta')}>Meta</button>
              <button type="button" role="tab" aria-selected={channel === 'google'} className={channel === 'google' ? 'is-active' : ''} onClick={() => changeChannel('google')}>Google</button>
            </div>
            {channel === 'meta' ? (
              <div className="tr-scope is-sub" role="group" aria-label="O que entra no relatório da Meta">
                <button type="button" className={scope === 'paid' ? 'is-active' : ''} onClick={() => changeScope('paid')}>Tráfego pago</button>
                <button type="button" className={scope === 'social' ? 'is-active' : ''} onClick={() => changeScope('social')}>Redes sociais</button>
                <button type="button" className={scope === 'both' ? 'is-active' : ''} onClick={() => changeScope('both')}>Os dois</button>
              </div>
            ) : (
              <span className="tr-channel-note">Google Ads deste cliente</span>
            )}
          </div>
          <div className="tr-toolbar-buttons">
            <button type="button" className={`tr-quiet${kpiOpen ? ' is-on' : ''}`} aria-expanded={kpiOpen} onClick={() => setKpiOpen((value) => !value)}>
              Indicadores · {kpiCount}
            </button>
            <button type="button" className="tr-go" onClick={generate} disabled={loading || modelPending || !clientId || !range}>
              {loading ? 'Montando…' : 'Montar relatório'}
            </button>
            <button type="button" className="tr-quiet" onClick={() => exportPdf(false)} disabled={!report || exporting}>
              {exporting === 'download' ? 'Gerando PDF…' : 'Baixar PDF'}
            </button>
            {archiveAllowed && <button type="button" className="tr-quiet" onClick={() => exportPdf(true)} disabled={!report || exporting || archived}>
              {exporting === 'archive' ? 'Salvando PDF…' : archived ? 'Salvo no Gestor' : 'Salvar no Gestor'}
            </button>}
            <button type="button" className="tr-quiet" onClick={() => setEditing((value) => !value)} disabled={!report || Boolean(exporting)}>
              {editing ? 'Fechar' : 'Personalizar'}
            </button>
          </div>
        </div>
        {kpiOpen ? (
          <div className="tr-kpi-panel">
            {channel === 'google' ? (
              <section>
                <h3>Google Ads</h3>
                <KpiChecks items={GOOGLE_REPORT_METRICS} picked={googleOn} onToggle={changeGoogleMetric} />
              </section>
            ) : (
              <div className={scope === 'both' ? 'is-split' : ''}>
                {(scope === 'paid' || scope === 'both') ? (
                  <section>
                    <h3>Tráfego pago</h3>
                    <KpiChecks items={savedMetaMode ? REPORT_METRICS : REPORT_METRICS.filter(({ key }) => key !== 'ctr' && key !== 'cpc')} picked={paidOn} onToggle={changeMetric} />
                  </section>
                ) : null}
                {(scope === 'social' || scope === 'both') ? (
                  <section>
                    <h3>Instagram e redes</h3>
                    <KpiChecks items={SOCIAL_REPORT_METRICS} picked={socialOn} onToggle={changeSocialMetric} />
                  </section>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
        {editing ? (
          <div className="tr-brand">
            <label>
              Cor de destaque
              <input type="color" value={brand.accent} onChange={(event) => saveBrand({ ...brand, accent: event.target.value })} />
            </label>
            <label>
              Cor principal
              <input type="color" value={brand.ink} onChange={(event) => saveBrand({ ...brand, ink: event.target.value })} />
            </label>
            <label>
              Logo
              <input type="file" accept="image/*" onChange={(event) => { pickLogo(event.target.files?.[0]); event.target.value = ''; }} />
            </label>
            {brand.logo ? <button type="button" onClick={() => saveBrand({ ...brand, logo: '' })}>Tirar logo</button> : null}
            <button type="button" onClick={() => saveBrand(DEFAULT_BRAND)}>Cores padrão</button>
            <button type="button" onClick={() => saveDraft(emptyDraft())}>Limpar ajustes deste período</button>
          </div>
        ) : null}
      </div>

      {savedMetaMode && clientId && range && <p className="tr-note">
        {report?.savedMeta?.caption ? `${report.savedMeta.caption}.` : 'Meta Ads · Leituras salvas do Gestor.'}{' '}
        {report?.savedMeta?.exact === false && 'O PDF usa o período disponível.'}{' '}
        {scope === 'both' && 'As redes sociais são consultadas ao montar.'}{' '}
        {savedAccounts?.clientId === clientId && savedAccounts.failed && 'Seletor de contas indisponível.'}{' '}
        {loadedModels?.failed && 'Modelos indisponíveis. O relatório pode ser montado com os filtros manuais.'}{' '}
        <Link className="tr-source-link" to={{ pathname: `/gestor-ia/clientes/${encodeURIComponent(clientId)}`, search: new URLSearchParams({ periodo: 'custom', desde: range.since,
          ate: range.until, ...(metaAccountId && { conta: metaAccountId }) }).toString() }}>Abrir Métricas</Link>
      </p>}
      {archived && <p className="tr-note" role="status">PDF salvo para revisão. <Link to={{ pathname: `/gestor-ia/clientes/${encodeURIComponent(clientId)}`,
        search: new URLSearchParams({ tab: 'relatorios', periodo: 'custom', desde: report.range.since, ate: report.range.until }).toString() }}>Abrir arquivo do cliente</Link></p>}
      {summaryReview && <GestorSummaryReview text={summaryReview.text} included={summaryReview.included} unavailable={summaryUnavailable}
        update={(text, included) => setSummaryDraft({ locationKey: location.key, text, included })} />}
      {editing ? <p className="tr-note">Clique no texto para alterar. Ocultar página vale só para este cliente e período, neste navegador. O PDF sai igual ao que está na tela. Os números continuam os da conta.</p> : null}
      {error ? <p className="tr-error">{error}</p> : null}
      {loading ? <p className="tr-wait">{channel === 'google' ? 'Buscando Google Ads, anúncios e Analytics…'
        : savedMetaMode ? 'Consultando leituras salvas…' : 'Buscando os números da Meta e as fotos dos anúncios…'}</p> : null}
      {view ? (
        <div className="tr-deck" ref={deckRef} style={brandStyle}>
          {(draft.hiddenPages.length > 0 || draft.hiddenAds.length > 0) ? (
            <div className="tr-restore">
              {draft.hiddenPages.map((id) => (
                <button key={id} type="button" onClick={() => saveDraft({ ...draft, hiddenPages: draft.hiddenPages.filter((item) => item !== id) })}>
                  Mostrar {hiddenPageLabel(report, id)}
                </button>
              ))}
              {draft.hiddenAds.map((id) => (
                <button key={id} type="button" onClick={() => saveDraft({ ...draft, hiddenAds: draft.hiddenAds.filter((item) => item !== id) })}>
                  Mostrar {hiddenAdLabel(report, id)}
                </button>
              ))}
            </div>
          ) : null}

          {view.showCover ? (
            <PageFrame editing={editing} onHide={() => hidePage('cover')}>
              <article className="tr-slide tr-cover-slide">
                <header className="tr-cover-bar">
                  <img className="tr-cover-logo" src={brand.logo || jbApexLogo} alt="JB Apex Agência" />
                  <span className="tr-cover-dash" />
                  <div className="tr-cover-dates">
                    <b>{view.labels.start}</b>
                    <b>{view.labels.end}</b>
                  </div>
                </header>
                <div className="tr-cover-body">
                  <div className="tr-cover-copy">
                    <ReportText as="h2" id="cover.title" fallback="Métricas" {...textProps} />
                    <ReportText as="p" id="cover.client" fallback={view.clientName} {...textProps} />
                    {view.savedMeta && <small className="tr-channel-note">Meta Ads · {view.savedMeta.scope} · Leitura salva{view.reportModel && ` · ${view.reportModel.name}`}</small>}
                    <ol>
                      {(view.channel === 'google' ? GOOGLE_COVER_INDEX : COVER_INDEX).map((item, index) => {
                        const Icon = item.icon;
                        return (
                          <li key={item.title} className={item.card ? 'is-card' : ''}>
                            <Icon strokeWidth={2.25} aria-hidden="true" />
                            <ReportText as="strong" id={`cover.${view.channel === 'google' ? 'g.' : ''}${index}.title`} fallback={item.title} {...textProps} />
                            <span className="tr-index-line" aria-hidden="true" />
                            <ReportText as="span" id={`cover.${view.channel === 'google' ? 'g.' : ''}${index}.text`} fallback={item.text} {...textProps} />
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                  <img className="tr-cover-chart" src={coverChart} alt="" />
                  <i className="tr-cover-rail" aria-hidden="true" />
                </div>
              </article>
            </PageFrame>
          ) : null}

          {includedSummary && (view.channel === 'google' || view.includePaid) && <div className="tr-page">
            <article className="tr-slide tr-slide-flow tr-gestor-summary-page">
              <header className="tr-slide-head"><div><span>Rotina de tráfego</span><h2>Resumo do período</h2></div><b className="tr-slide-aside">{view.labels.title}</b></header>
              <p>{includedSummary}</p>
            </article>
          </div>}

          {view.channel === 'google' && !draft.hiddenPages.includes('account') ? (
            <PageFrame editing={editing} onHide={() => hidePage('account')}>
              <article className="tr-slide tr-slide-flow">
                <SlideHeader titleId="title.g.results" title="Resultados" kickerId="kicker.google" kicker="Google Ads" asideId="aside.google" aside={view.labels.title} {...textProps} />
                <div className="tr-metrics">
                  {googleMetricRows(view, draft, editing, onText, visibleGoogleMetrics)}
                </div>
                {view.note ? <p className="tr-note"><ReportText id="google.note" fallback={view.note} {...textProps} /></p> : null}
                {view.analyticsNote ? <p className="tr-note"><ReportText id="google.analyticsNote" fallback={view.analyticsNote} {...textProps} /></p> : null}
              </article>
            </PageFrame>
          ) : null}

          {view.channel === 'google' && view.daily?.length > 1 && !draft.hiddenPages.includes('google-days') ? (
            <PageFrame editing={editing} onHide={() => hidePage('google-days')}>
              <article className="tr-slide tr-slide-flow">
                <SlideHeader titleId="title.g.days" title="Dia a dia" kickerId="kicker.google.days" kicker="Google Ads" asideId="aside.g.days" aside={view.labels.title} {...textProps} />
                <p className="tr-google-hint">Altura da barra é o investimento do dia. Passe o mouse para ver o valor.</p>
                <div className="tr-google-days" aria-hidden="true">
                  {view.daily.map((day) => {
                    const max = Math.max(...view.daily.map((item) => item.spend), 1);
                    return (
                      <i
                        key={day.date}
                        title={`${day.date.slice(8, 10)}/${day.date.slice(5, 7)}: ${formatMoney(day.spend)}, ${formatCount(day.clicks)} cliques`}
                        style={{ height: `${Math.max(6, (day.spend / max) * 100)}%` }}
                      />
                    );
                  })}
                </div>
                <p className="tr-google-hint">
                  {view.daily[0].date.slice(8, 10)}/{view.daily[0].date.slice(5, 7)}
                  {' a '}
                  {view.daily.at(-1).date.slice(8, 10)}/{view.daily.at(-1).date.slice(5, 7)}
                  {' · '}
                  {formatMoney(view.daily.reduce((sum, day) => sum + day.spend, 0))}
                </p>
              </article>
            </PageFrame>
          ) : null}

          {view.channel === 'google' ? googleCampaignPages(view.campaigns).map((page, index, pages) => {
            const pageId = `google-campaigns:${index}`;
            if (draft.hiddenPages.includes(pageId)) return null;
            const columns = GOOGLE_REPORT_METRICS.filter((item) => isGoogleMetricVisible(visibleGoogleMetrics, item.key));
            return (
              <PageFrame key={pageId} editing={editing} onHide={() => hidePage(pageId)}>
                <article className="tr-slide tr-slide-flow">
                  <SlideHeader
                    titleId={`title.g.campaigns.${index}`}
                    title={pages.length > 1 ? `Campanhas · ${index + 1}/${pages.length}` : 'Campanhas'}
                    kickerId="kicker.google.campaigns"
                    kicker="Google Ads"
                    asideId={`aside.g.campaigns.${index}`}
                    aside={view.labels.title}
                    {...textProps}
                  />
                  <table className="tr-google-table">
                    <thead>
                      <tr>
                        <th>Campanha</th>
                        {columns.map((column) => <th key={column.key}>{column.label}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {page.map((row) => (
                        <tr key={row.id}>
                          <td>
                            {row.name}
                            {row.kind ? <span className="tr-google-sub">{row.kind}</span> : null}
                          </td>
                          {columns.map((column) => (
                            <td key={column.key}>{formatGoogleMetric(column.key, row)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </article>
              </PageFrame>
            );
          }) : null}

          {view.channel === 'google' && view.keywords?.length > 0 && !draft.hiddenPages.includes('google-keywords') ? (
            <PageFrame editing={editing} onHide={() => hidePage('google-keywords')}>
              <article className="tr-slide tr-slide-flow">
                <SlideHeader titleId="title.g.keywords" title="Palavras" kickerId="kicker.google.keywords" kicker="Google Ads" asideId="aside.g.keywords" aside={view.labels.title} {...textProps} />
                <p className="tr-google-hint">As doze com mais cliques nas campanhas de maior investimento. Sem clique e sem custo ficam de fora.</p>
                <table className="tr-google-table">
                  <thead>
                    <tr>
                      <th>Palavra</th>
                      <th>Tipo</th>
                      <th>Cliques</th>
                      <th>Impressões</th>
                      <th>Investimento</th>
                      <th>Conversões</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.keywords.map((row) => (
                      <tr key={`${row.text}-${row.match}`}>
                        <td>{row.text}</td>
                        <td>{row.match}</td>
                        <td>{formatCount(row.clicks)}</td>
                        <td>{formatCount(row.impressions)}</td>
                        <td>{formatMoney(row.spend)}</td>
                        <td>{formatCount(row.conversions)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </article>
            </PageFrame>
          ) : null}

          {view.channel === 'google' && view.ads?.length > 0 && !draft.hiddenPages.includes('google-ads') ? (
            <PageFrame editing={editing} onHide={() => hidePage('google-ads')}>
              <article className="tr-slide tr-slide-flow">
                <SlideHeader titleId="title.g.ads" title="Anúncios" kickerId="kicker.google.ads" kicker="Google Ads" asideId="aside.g.ads" aside={view.labels.title} {...textProps} />
                <p className="tr-google-hint">O título é o texto do anúncio. Esta leitura não traz a foto do criativo.</p>
                <table className="tr-google-table">
                  <thead>
                    <tr>
                      <th>Anúncio</th>
                      <th>Cliques</th>
                      <th>Impressões</th>
                      <th>Investimento</th>
                      <th>Conversões</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.ads.map((row) => (
                      <tr key={row.id}>
                        <td>
                          {row.title}
                          {row.group ? <span className="tr-google-sub">{row.group}</span> : null}
                        </td>
                        <td>{formatCount(row.clicks)}</td>
                        <td>{formatCount(row.impressions)}</td>
                        <td>{formatMoney(row.spend)}</td>
                        <td>{formatCount(row.conversions)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </article>
            </PageFrame>
          ) : null}

          {view.channel === 'google' && view.groups?.length > 0 && !draft.hiddenPages.includes('google-groups') ? (
            <PageFrame editing={editing} onHide={() => hidePage('google-groups')}>
              <article className="tr-slide tr-slide-flow">
                <SlideHeader titleId="title.g.groups" title="Grupos" kickerId="kicker.google.groups" kicker="Google Ads" asideId="aside.g.groups" aside={view.labels.title} {...textProps} />
                <p className="tr-google-hint">Grupo de anúncio na Pesquisa. No Performance Max, o grupo de recursos. Só das campanhas de maior investimento.</p>
                <table className="tr-google-table">
                  <thead>
                    <tr>
                      <th>Grupo</th>
                      <th>Tipo</th>
                      <th>Cliques</th>
                      <th>Investimento</th>
                      <th>Conversões</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.groups.map((row) => (
                      <tr key={`${row.kind}-${row.name}`}>
                        <td>{row.name}</td>
                        <td>{row.kind}</td>
                        <td>{formatCount(row.clicks)}</td>
                        <td>{formatMoney(row.spend)}</td>
                        <td>{formatCount(row.conversions)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </article>
            </PageFrame>
          ) : null}

          {view.channel === 'google' && view.analytics && !draft.hiddenPages.includes('google-analytics') ? (
            <PageFrame editing={editing} onHide={() => hidePage('google-analytics')}>
              <article className="tr-slide tr-slide-flow">
                <SlideHeader titleId="title.g.analytics" title="Analytics" kickerId="kicker.google.analytics" kicker="Site" asideId="aside.g.analytics" aside={view.analytics.name || view.labels.title} {...textProps} />
                <p className="tr-google-hint">Sessões do GA4. Eventos-chave daqui não são as conversões do Google Ads.</p>
                <div className="tr-metrics">
                  <MetricRow labelId="label.ga.sessions" label="Sessões" value={formatCount(view.analytics.sessions)} draft={draft} editing={editing} onText={onText} />
                  <MetricRow labelId="label.ga.users" label="Usuários" value={formatCount(view.analytics.users)} draft={draft} editing={editing} onText={onText} />
                  <MetricRow labelId="label.ga.new" label="Novos usuários" value={formatCount(view.analytics.newUsers)} draft={draft} editing={editing} onText={onText} />
                  <MetricRow labelId="label.ga.engage" label="Engajamento" value={formatRatioPercent(view.analytics.engagementRate)} draft={draft} editing={editing} onText={onText} />
                  <MetricRow labelId="label.ga.time" label="Tempo médio" value={formatDurationSeconds(view.analytics.averageSessionDuration)} draft={draft} editing={editing} onText={onText} />
                  <MetricRow labelId="label.ga.events" label="Eventos-chave" value={formatCount(view.analytics.conversions)} strong draft={draft} editing={editing} onText={onText} />
                </div>
                {view.analytics.previous ? (
                  <p className="tr-google-hint">
                    Período anterior: {formatCount(view.analytics.previous.sessions)} sessões
                    {analyticsDelta(view.analytics.sessions, view.analytics.previous.sessions) != null
                      ? ` (${formatSignedPercent(analyticsDelta(view.analytics.sessions, view.analytics.previous.sessions))})`
                      : ''}
                    .
                  </p>
                ) : null}
                <table className="tr-google-table">
                  <thead>
                    <tr><th>Página de destino</th><th>Sessões</th><th>Eventos-chave</th></tr>
                  </thead>
                  <tbody>
                    {view.analytics.pages.slice(0, 8).map((row) => (
                      <tr key={row.page}>
                        <td>{analyticsPageLabel(row.page)}</td>
                        <td>{formatCount(row.sessions)}</td>
                        <td>{formatCount(row.conversions)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </article>
            </PageFrame>
          ) : null}

          {view.channel === 'google' && view.analytics && !draft.hiddenPages.includes('google-origem') ? (
            <PageFrame editing={editing} onHide={() => hidePage('google-origem')}>
              <article className="tr-slide tr-slide-flow">
                <SlideHeader titleId="title.g.origem" title="De onde veio" kickerId="kicker.google.origem" kicker="Analytics" asideId="aside.g.origem" aside={view.labels.title} {...textProps} />
                <p className="tr-google-hint">Canal é o grupo do Analytics. Origem é a dupla fonte / mídia da sessão. A parte é sobre as sessões do site, não sobre o clique do anúncio.</p>
                <div className="tr-google-split">
                  <table className="tr-google-table">
                    <thead>
                      <tr><th>Canal</th><th>Sessões</th><th>Parte</th><th>Eventos-chave</th></tr>
                    </thead>
                    <tbody>
                      {view.analytics.channels.slice(0, 8).map((row) => (
                        <tr key={row.channel}>
                          <td>{analyticsChannelLabel(row.channel)}</td>
                          <td>{formatCount(row.sessions)}</td>
                          <td>{formatPercent(view.analytics.sessions ? (row.sessions / view.analytics.sessions) * 100 : null)}</td>
                          <td>{formatCount(row.conversions)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <table className="tr-google-table">
                    <thead>
                      <tr><th>Origem</th><th>Sessões</th><th>Parte</th></tr>
                    </thead>
                    <tbody>
                      {view.analytics.sources.slice(0, 8).map((row) => (
                        <tr key={row.source}>
                          <td>{analyticsSourceLabel(row.source)}</td>
                          <td>{formatCount(row.sessions)}</td>
                          <td>{formatPercent(view.analytics.sessions ? (row.sessions / view.analytics.sessions) * 100 : null)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="tr-google-split">
                  <table className="tr-google-table">
                    <thead>
                      <tr><th>Dispositivo</th><th>Sessões</th><th>Parte</th></tr>
                    </thead>
                    <tbody>
                      {view.analytics.devices.slice(0, 4).map((row) => (
                        <tr key={row.device}>
                          <td>{analyticsDeviceLabel(row.device)}</td>
                          <td>{formatCount(row.sessions)}</td>
                          <td>{formatPercent(view.analytics.sessions ? (row.sessions / view.analytics.sessions) * 100 : null)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <table className="tr-google-table">
                    <thead>
                      <tr><th>Cidade</th><th>Sessões</th></tr>
                    </thead>
                    <tbody>
                      {view.analytics.cities.slice(0, 8).map((row) => (
                        <tr key={row.city}>
                          <td>{analyticsPlaceLabel(row.city)}</td>
                          <td>{formatCount(row.sessions)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            </PageFrame>
          ) : null}

          {hasPaid && view.showAccount ? (
            <PageFrame editing={editing} onHide={() => hidePage('account')}>
              <article className="tr-slide">
                <SlideHeader titleId="title.results" title="Resultados" kickerId="kicker.channel" kicker="Facebook-Instagram" asideId="aside.account" aside={view.labels.title} {...textProps} />
                <div className="tr-metrics">
                  {paidMetricRows(view, draft, editing, onText, paidOn)}
                  {view.savedMeta && <p className="tr-note">{[`${view.savedMeta.caption}.`, ...view.savedMeta.notes].join(' ')}</p>}
                </div>
                {view.accountNote ? <p className="tr-note"><ReportText id="account.note" fallback={view.accountNote} {...textProps} /></p> : null}
              </article>
            </PageFrame>
          ) : null}

          {hasPaid && view.comparison && (
            <div className="tr-page">
              <article className="tr-slide tr-slide-flow">
                <SlideHeader titleId="title.meta.comparison" title="Comparação com período anterior" kickerId="kicker.meta.comparison" kicker="Meta Ads" {...textProps} />
                <table className="tr-google-table">
                  <thead><tr><th scope="col">Indicador</th><th scope="col">{periodLabels(view.comparison.range).title}</th>
                    <th scope="col">{view.labels.title}</th><th scope="col">Variação</th></tr></thead>
                  <tbody>{savedReportComparisonRows(view, paidOn).map(({ key, label, previous, current, change }) => <tr key={key}>
                    <td>{label}</td><td>{previous}</td><td>{current}</td><td>{change}</td>
                  </tr>)}</tbody>
                </table>
              </article>
            </div>
          )}

          {hasPaid && view.showCampaignSlides ? view.campaigns.map((campaign) => (
            <PageFrame key={campaign.id} editing={editing} onHide={() => hidePage(`campaign:${campaign.id}`)}>
              <article className="tr-slide">
                <SlideHeader titleId="title.results" title="Resultados" kickerId="kicker.channel" kicker="Facebook-Instagram" asideId={`aside.campaign.${campaign.id}`} aside={campaign.name} {...textProps} />
                <div className={view.reportModel?.include_creatives === false ? undefined : 'tr-split'}>
                  <div className="tr-metrics">
                    {campaignMetricRows(campaign, view.result, draft, editing, onText, paidOn, view.currency)}
                  </div>
                  {view.reportModel?.include_creatives !== false && <div className="tr-creatives">
                    {campaign.creatives.length === 0 ? <p className="tr-creative-empty">{view.savedMeta?.adsPartial ? 'Criativos indisponíveis nesta leitura.' : 'Sem criativo com entrega nesta campanha.'}</p> : campaign.creatives.map((ad) => (
                      <CreativeCard key={ad.id} ad={ad} resultLabel={readText(draft, 'label.result', view.result.label)} editing={editing} onHide={() => hideAd(ad.id)} saved={Boolean(view.savedMeta)} />
                    ))}
                  </div>}
                </div>
              </article>
            </PageFrame>
          )) : null}

          {hasPaid ? view.gallery.map((page) => {
            const pageId = galleryPageId(page);
            return (
              <PageFrame key={pageId} editing={editing} onHide={() => hidePage(pageId)}>
                <article className="tr-slide tr-slide-dark">
                  <SlideHeader titleId="title.creatives" title="Criativos" kickerId="kicker.whatsapp" kicker="Para WhatsApp" asideId="aside.gallery" aside={view.labels.title} {...textProps} />
                  <div className="tr-creatives is-gallery">
                    {page.map((ad) => (
                      <CreativeCard key={ad.id} ad={ad} resultLabel={readText(draft, 'label.result', view.result.label)} editing={editing} onHide={() => hideAd(ad.id)} saved={Boolean(view.savedMeta)} />
                    ))}
                  </div>
                </article>
              </PageFrame>
            );
          }) : null}

          {hasSocial ? socialSlides.filter((slide) => !draft.hiddenPages.includes(slide.id)).map((slide) => {
            if (slide.kind === 'audience') {
              return (
                <PageFrame key={slide.id} editing={editing} onHide={() => hidePage(slide.id)}>
                  <article className="tr-slide">
                    <SlideHeader
                      titleId={`title.social.audience.${slide.channel.id}`}
                      title={`Audiência · ${slide.channel.label}`}
                      kickerId="kicker.social"
                      kicker="Redes sociais"
                      asideId={`aside.social.audience.${slide.channel.id}`}
                      aside={slide.channel.handle || view.labels.title}
                      {...textProps}
                    />
                    {slide.audience?.empty ? (
                      <p className="tr-note">Idade, gênero e cidades: sem dado{slide.audience.note && slide.audience.note !== 'sem dado' ? ` (${slide.audience.note})` : ''}.</p>
                    ) : slide.audience?.detail ? (
                      <p className="tr-note">{slide.audience.detail}</p>
                    ) : null}
                    <AudienceBars groups={slide.groups} />
                  </article>
                </PageFrame>
              );
            }
            if (slide.kind === 'posts') {
              return (
                <PageFrame key={slide.id} editing={editing} onHide={() => hidePage(slide.id)}>
                  <article className="tr-slide tr-slide-dark">
                    <SlideHeader
                      titleId={`title.social.posts.${slide.channel.id}${slide.page > 1 ? `.${slide.page}` : ''}`}
                      title={`Melhores publicações · ${slide.channel.label}${slide.pageCount > 1 ? ` · ${slide.page}/${slide.pageCount}` : ''}`}
                      kickerId="kicker.social"
                      kicker="Redes sociais"
                      asideId={`aside.social.posts.${slide.channel.id}`}
                      aside={view.labels.title}
                      {...textProps}
                    />
                    <div className="tr-creatives is-gallery is-social-posts">
                      {slide.posts.length === 0 ? (
                        <p className="tr-creative-empty">Sem publicações com foto neste período.</p>
                      ) : slide.posts.map((post) => (
                        <SocialPostCard key={post.id} post={post} />
                      ))}
                    </div>
                  </article>
                </PageFrame>
              );
            }
            return (
              <PageFrame key={slide.id} editing={editing} onHide={() => hidePage(slide.id)}>
                <article className="tr-slide">
                  <SlideHeader
                    titleId={`title.social.${slide.channel.id}`}
                    title={slide.channel.label}
                    kickerId="kicker.social"
                    kicker="Redes sociais"
                    asideId={`aside.social.${slide.channel.id}`}
                    aside={slide.channel.handle || view.labels.title}
                    {...textProps}
                  />
                  <div className="tr-social-metrics">
                    {slide.rows.map((row) => (
                      <SocialMetricCard
                        key={row.key}
                        metricKey={row.key}
                        labelId={`label.social.${slide.channel.id}.${row.key}`}
                        label={row.label}
                        value={row.value}
                        draft={draft}
                        editing={editing}
                        onText={onText}
                      />
                    ))}
                  </div>
                  {view.social.note ? <p className="tr-note"><ReportText id={`social.note.${slide.channel.id}`} fallback={view.social.note} {...textProps} /></p> : null}
                </article>
              </PageFrame>
            );
          }) : null}

          {hasPaid && view.showSales ? (
            <PageFrame editing={editing} onHide={() => hidePage('sales')}>
              <article className="tr-slide tr-slide-dark tr-slide-sales">
                <SlideHeader titleId="title.sales" title={view.savedMeta && view.sales.source === 'vendas' ? 'Vendas registradas no Planeje' : 'Performance de vendas'} kickerId="kicker.sales" kicker={`Em relação a ${view.labels.title}`} asideId="aside.sales" aside={view.labels.title} {...textProps} />
                <div className="tr-sales">
                  <p className="tr-sales-kicker"><ReportText id="sales.period" fallback={view.labels.title} {...textProps} /></p>
                  <div className="tr-sales-hero">
                    <div>
                      <span><ReportText id="sales.countLabel" fallback={view.savedMeta
                        ? view.sales.source === 'vendas' ? 'Vendas registradas' : 'Compras atribuídas na Meta'
                        : `Total de ${view.result.label.toLowerCase()}`} {...textProps} /></span>
                      <strong>{formatCount(view.sales.count)}</strong>
                    </div>
                    <div>
                      <span><ReportText id="sales.valueLabel" fallback="Valor em vendas" {...textProps} /></span>
                      <strong>{formatMoney(view.sales.value, view.currency)}</strong>
                    </div>
                  </div>
                  <ul className="tr-sales-meta">
                    <li>
                      <span><ReportText id="sales.ticketLabel" fallback="Ticket médio" {...textProps} /></span>
                      <b>{view.sales.ticket == null ? '—' : formatMoney(view.sales.ticket, view.currency)}</b>
                    </li>
                    <li>
                      <span><ReportText id="sales.roiLabel" fallback="Retorno sob o investimento" {...textProps} /></span>
                      <b>{view.sales.roi == null ? '—' : view.sales.roi.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</b>
                    </li>
                    <li>
                      <span><ReportText id="sales.spendLabel" fallback="Valor investido" {...textProps} /></span>
                      <b>{formatMoney(view.sales.spend, view.currency)}</b>
                    </li>
                  </ul>
                </div>
              </article>
            </PageFrame>
          ) : null}

          {hasPaid && view.showNotes ? (
            <PageFrame editing={editing} onHide={() => hidePage('notes')}>
              <article className="tr-slide" data-pdf-skip="notes">
                <SlideHeader titleId="title.notes" title="O que foi feito" kickerId="kicker.notes" kicker="E o que será feito" asideId="aside.notes" aside={view.labels.title} {...textProps} />
                <div className="tr-notes">
                  <div>
                    <ReportText as="h3" id="notes.doneTitle" fallback="No período" {...textProps} />
                    {view.notes.done.length === 0 ? <p>Sem análise escrita na Rotina deste período.</p> : view.notes.done.map((item, index) => (
                      <p key={`${item.week}-${index}`}><ReportText id={`notes.done.${index}`} fallback={item.text} {...textProps} /></p>
                    ))}
                  </div>
                  <div>
                    <ReportText as="h3" id="notes.nextTitle" fallback="Próximos dias" {...textProps} />
                    {view.notes.next.length === 0 ? <p>Sem próxima ação escrita na Rotina.</p> : view.notes.next.map((item, index) => (
                      <p key={`${item.week}-${index}`}><ReportText id={`notes.next.${index}`} fallback={item.text} {...textProps} /></p>
                    ))}
                  </div>
                </div>
              </article>
            </PageFrame>
          ) : null}

          {view.showEnd ? (
            <PageFrame editing={editing} onHide={() => hidePage('end')}>
              <article className="tr-slide tr-slide-end">
                <p><ReportText id="end.line" fallback="Sobrou alguma dúvida?" {...textProps} /></p>
                {brand.logo ? (
                  <span className="tr-end-logo-chip"><img src={brand.logo} alt="" /></span>
                ) : (
                  <img src={jbApexLogoWhite} alt="JB Apex Agência" />
                )}
              </article>
            </PageFrame>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
