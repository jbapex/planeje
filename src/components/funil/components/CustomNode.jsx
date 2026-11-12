import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import { NODE_CONFIG } from '@/components/funil/nodeConfig';
import { hasMetaLink } from '@/lib/funilMetaLink';
import { hasGoogleLink } from '@/lib/funilGoogleLink';
import { formatFunilMetricsKpi } from '@/lib/funilMetrics';
import { resolveEffectiveLink } from '@/lib/funilNodeGraph';
import { formatPixelMetaBadge } from '@/lib/funilPixelMeta';
import { formatAudienceMetaBadge } from '@/lib/funilAudienceMeta';
import { formatAdsetBadge } from '@/lib/funilMetaAdset';
import { FunilMetaStatusDot } from '@/components/funil/components/FunilMetaStatus';
import {
  getMetaStatusBadgeText,
  getMetaStatusLabel,
  getMetaStatusRingClass,
  normalizeMetaStatus,
} from '@/lib/funilMetaStatus';
import {
  getGoogleStatusBadgeText,
  getGoogleStatusLabel,
  getGoogleStatusRingClass,
  normalizeGoogleStatus,
} from '@/lib/funilGoogleStatus';
import { isFunilCreativeNodeType, fetchMetaAdCreative } from '@/lib/funilMetaCreative';
import ICONS from '@/components/funil/components/nodeIcons';

// ── Handle helpers ─────────────────────────────────────────────────────────
function Handles({ color, shape }) {
  const s = { background: color, width: 10, height: 10, border: '2px solid white', zIndex: 10 };
  const topOffset   = shape === 'browser' ? '18%' : shape === 'diamond' ? '-6px' : '37%';
  const sideOffset  = shape === 'browser' ? '55%' : shape === 'diamond' ? '50%' : '38%';
  const botOffset   = shape === 'browser' ? '82%' : shape === 'diamond' ? 'calc(100% + 6px)' : '38%';

  return (
    <>
      <Handle type="target" position={Position.Top}    id="top"    style={{ ...s, top: '-6px', left: '50%' }}/>
      <Handle type="target" position={Position.Left}   id="left"   style={{ ...s, top: sideOffset }}/>
      <Handle type="source" position={Position.Right}  id="right"  style={{ ...s, top: sideOffset }}/>
      <Handle type="source" position={Position.Bottom} id="bottom" style={{ ...s, bottom: '-6px', left: '50%' }}/>
    </>
  );
}

function hasDetails(data) {
  return !!(data.creative || data.notes || data.url || data.copy);
}

function MetaLinkBadge({ metaLink }) {
  if (!hasMetaLink(metaLink)) return null;
  const status = metaLink?.campaignStatus;
  const tone = normalizeMetaStatus(status);
  const statusLabel = status ? getMetaStatusLabel(status) : '';
  const title = [metaLink.campaignName, metaLink.accountName, statusLabel]
    .filter(Boolean)
    .join(' · ');
  return (
    <span
      className={`vn-meta-badge vn-meta-badge--${tone}`}
      title={title || 'Conectado ao Meta'}
    >
      {status && <FunilMetaStatusDot status={status} className="vn-meta-badge__dot" />}
      <span className="vn-meta-badge__text">{getMetaStatusBadgeText(status)}</span>
    </span>
  );
}

function GoogleLinkBadge({ googleLink }) {
  if (!hasGoogleLink(googleLink)) return null;
  const status = googleLink?.campaignStatus;
  const tone = normalizeGoogleStatus(status);
  const statusLabel = status ? getGoogleStatusLabel(status) : '';
  const title = [googleLink.campaignName, googleLink.customerName, statusLabel]
    .filter(Boolean)
    .join(' · ');
  return (
    <span
      className={`vn-google-badge vn-google-badge--${tone}`}
      title={title || 'Conectado ao Google Ads'}
    >
      {status && (
        <span className={`vn-google-badge__ring ${getGoogleStatusRingClass(status)}`} aria-hidden />
      )}
      <span className="vn-google-badge__text">{getGoogleStatusBadgeText(status)}</span>
    </span>
  );
}

function AdsLinkBadges({ metaLink, googleLink }) {
  const hasMeta = hasMetaLink(metaLink);
  const hasGoogle = hasGoogleLink(googleLink);
  if (!hasMeta && !hasGoogle) return null;
  return (
    <div className={`vn-ads-badges ${hasMeta && hasGoogle ? 'vn-ads-badges--dual' : ''}`}>
      {hasMeta && <MetaLinkBadge metaLink={metaLink} />}
      {hasGoogle && <GoogleLinkBadge googleLink={googleLink} />}
    </div>
  );
}

function AudienceMetaBadge({ audienceMeta }) {
  const text = formatAudienceMetaBadge(audienceMeta);
  if (!text) return null;
  return (
    <span className="vn-audience-badge" title={audienceMeta?.customAudienceName || 'Público Meta'}>
      👥 {text}
    </span>
  );
}

function PixelMetaBadge({ pixelMeta }) {
  const text = formatPixelMetaBadge(pixelMeta);
  if (!text) return null;
  return (
    <span className="vn-pixel-badge" title={pixelMeta?.pixelName || 'Pixel Meta'}>
      {text}
    </span>
  );
}

function AdsetBadge({ effective, data }) {
  const link = effective?.metaLink;
  const adSetName = data?.linkOverride?.adSetName || link?.adSetName;
  const text = formatAdsetBadge({ adSetId: data?.linkOverride?.adSetId || link?.adSetId, adSetName });
  if (!text) return null;
  return (
    <span className="vn-adset-badge" title={adSetName || 'Conjunto Meta'}>
      ⊞ {text}
    </span>
  );
}

function InheritedBadge({ data, effective }) {
  if (!data?.linkSource?.parentNodeId && !effective?.inherits) return null;
  const campaign =
    effective?.metaLink?.campaignName ||
    effective?.googleLink?.campaignName ||
    effective?.metaLink?.adName;
  if (!campaign && !effective?.parentLabel) return null;
  return (
    <span className="vn-inherit-badge" title={`Herdado de ${effective?.parentLabel || 'pai'}`}>
      ↳ {campaign || effective?.parentLabel}
    </span>
  );
}

function MetricsKpiStrip({ data, effective }) {
  const kpi = formatFunilMetricsKpi(data.metrics);
  const err = data.metricsError;
  const adLabel = effective?.metaLink?.adName;
  if (!kpi && !err && data.contactCount == null && !adLabel) return null;
  return (
    <div className="vn-metrics-strip">
      {err && (
        <span className="vn-metrics-strip__warn" title={err}>
          ⚠ métricas
        </span>
      )}
      {kpi && <span className="vn-metrics-strip__kpi">{kpi}</span>}
      {adLabel && !kpi && (
        <span className="vn-metrics-strip__kpi vn-metrics-strip__ad">{adLabel}</span>
      )}
      {data.contactCount > 0 && (
        <span className="vn-metrics-strip__leads" title="Leads atribuídos no período">
          {data.contactCount} leads
        </span>
      )}
    </div>
  );
}

function CreativeThumbInRing({ thumbnailUrl, nodeType }) {
  if (!thumbnailUrl) return null;
  return (
    <div className="vn-circle__creative-media">
      <img
        src={thumbnailUrl}
        alt=""
        className="vn-circle__creative-img"
        referrerPolicy="no-referrer"
        draggable={false}
      />
      {nodeType === 'video-ad' && <span className="vn-circle__play" aria-hidden>▶</span>}
    </div>
  );
}

// ── Circle Node ────────────────────────────────────────────────────────────
function CircleVisual({ cfg, data, onEdit, effective }) {
  const isCreative = isFunilCreativeNodeType(data.type);
  const thumb = data.creativeThumbnailUrl;

  return (
    <div className={`vn-circle ${isCreative && thumb ? 'vn-circle--has-creative' : ''}`}>
      <AdsLinkBadges metaLink={effective?.metaLink || data.metaLink} googleLink={effective?.googleLink || data.googleLink} />
      <InheritedBadge data={data} effective={effective} />
      <AdsetBadge data={data} effective={effective} />
      <PixelMetaBadge pixelMeta={data.pixelMeta} />
      <AudienceMetaBadge audienceMeta={data.audienceMeta} />
      <MetricsKpiStrip data={data} effective={effective} />
      {hasDetails(data) && <span className="vn-dot" style={{ background: cfg.bg }} />}
      <div
        className={`vn-circle__ring ${isCreative && thumb ? 'vn-circle__ring--creative' : ''}`}
        style={
          isCreative && thumb
            ? { boxShadow: `0 6px 20px ${cfg.bg}55`, borderColor: cfg.bg }
            : { background: cfg.gradient || cfg.bg, boxShadow: `0 6px 20px ${cfg.bg}55` }
        }
      >
        {isCreative && thumb ? (
          <CreativeThumbInRing thumbnailUrl={thumb} nodeType={data.type} />
        ) : isCreative && effective?.metaLink?.adId ? (
          <Loader2 className="h-6 w-6 animate-spin text-white/90" />
        ) : (
          ICONS[data.type] || ICONS.email
        )}
      </div>
      <div className="vn-label" onDoubleClick={onEdit}>{data.label}</div>
      {data.subtitle && <div className="vn-sublabel">{data.subtitle}</div>}
    </div>
  );
}

// ── Browser Node ───────────────────────────────────────────────────────────
function BrowserVisual({ cfg, data, onEdit, effective }) {
  const type = data.type;

  return (
    <div className="vn-browser">
      <AdsLinkBadges metaLink={effective?.metaLink || data.metaLink} googleLink={effective?.googleLink || data.googleLink} />
      <InheritedBadge data={data} effective={effective} />
      <AdsetBadge data={data} effective={effective} />
      <PixelMetaBadge pixelMeta={data.pixelMeta} />
      <AudienceMetaBadge audienceMeta={data.audienceMeta} />
      <MetricsKpiStrip data={data} effective={effective} />
      <div className="vn-browser__chrome">
        <div className="vn-browser__dots">
          <span style={{ background: '#FF5F56' }}/>
          <span style={{ background: '#FFBD2E' }}/>
          <span style={{ background: '#27C93F' }}/>
        </div>
        <div className="vn-browser__bar"/>
      </div>

      <div className="vn-browser__body" style={{ background: cfg.pageBg || 'white' }}>
        {type === 'checkout' && (
          <div className="bc bc--checkout">
            <div className="bc__check">✓</div>
            <div className="bc__form">
              <div/><div className="short"/>
            </div>
            <div className="bc__bump">+ ORDER BUMP</div>
            <div className="bc__cta" style={{ background: cfg.ctaColor }}>CALL TO ACTION</div>
          </div>
        )}
        {type === 'upsell' && (
          <div className="bc bc--upsell">
            <div className="bc__video"><span>▶</span></div>
            <div className="bc__cta orange">BUY NOW</div>
          </div>
        )}
        {type === 'thank-you-page' && (
          <div className="bc bc--thankyou">
            <div className="bc__success">✓</div>
            <div className="bc__thanks-line"/><div className="bc__thanks-line short"/>
          </div>
        )}
        {type === 'webinar' && (
          <div className="bc bc--webinar">
            <div className="bc__webinar-img"/>
            <div className="bc__cta" style={{ background: cfg.ctaColor }}>INSCREVER-SE</div>
          </div>
        )}
        {(type === 'landing-page' || !['checkout','upsell','thank-you-page','webinar'].includes(type)) && (
          <div className="bc bc--landing">
            <div className="bc__hero"/>
            <div className="bc__line"/><div className="bc__line short"/>
            <div className="bc__cta" style={{ background: cfg.ctaColor }}>CALL TO ACTION</div>
          </div>
        )}
      </div>

      <div className="vn-browser__footer" onDoubleClick={onEdit}>
        {hasDetails(data) && <span className="vn-dot vn-dot--browser" style={{ background: cfg.ctaColor || '#3B82F6' }} />}
        {data.label}
        {data.subtitle && <span className="vn-sublabel vn-sublabel--browser"> · {data.subtitle}</span>}
      </div>
    </div>
  );
}

// ── Diamond Node ───────────────────────────────────────────────────────────
function DiamondVisual({ cfg, data, onEdit, effective }) {
  return (
    <div className="vn-diamond">
      <AdsLinkBadges metaLink={effective?.metaLink || data.metaLink} googleLink={effective?.googleLink || data.googleLink} />
      <InheritedBadge data={data} effective={effective} />
      <AdsetBadge data={data} effective={effective} />
      <PixelMetaBadge pixelMeta={data.pixelMeta} />
      <AudienceMetaBadge audienceMeta={data.audienceMeta} />
      <MetricsKpiStrip data={data} effective={effective} />
      <div
        className="vn-diamond__shape"
        style={{ background: cfg.gradient || cfg.bg, boxShadow: `0 6px 20px ${cfg.bg}55` }}
      >
        <div className="vn-diamond__inner">{ICONS[data.type] || ICONS.decision}</div>
      </div>
      <div className="vn-label" onDoubleClick={onEdit}>{data.label}</div>
      {data.subtitle && <div className="vn-sublabel">{data.subtitle}</div>}
      {hasDetails(data) && <span className="vn-dot vn-dot--diamond" style={{ background: cfg.bg }} />}
    </div>
  );
}

// ── Main CustomNode ────────────────────────────────────────────────────────
export default function CustomNode({ id, data, selected }) {
  const { setNodes, getNodes, getEdges } = useReactFlow();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(data.label);

  const cfg = NODE_CONFIG[data.type] || NODE_CONFIG.email;

  const effective = useMemo(() => {
    const nodes = getNodes();
    const edges = getEdges();
    const self = nodes.find((n) => n.id === id);
    return resolveEffectiveLink(self || { id, data }, nodes, edges);
  }, [id, data, getNodes, getEdges]);

  const adIdForCreative = effective?.metaLink?.adId;
  const isCreativeNode = isFunilCreativeNodeType(data.type);

  useEffect(() => {
    if (!isCreativeNode || !adIdForCreative) return;
    if (data.creativeThumbnailUrlAdId === adIdForCreative && data.creativeThumbnailUrl) return;

    let cancelled = false;
    fetchMetaAdCreative(adIdForCreative).then((creative) => {
      if (cancelled || !creative?.thumbnailUrl) return;
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id
            ? {
                ...n,
                data: {
                  ...n.data,
                  creativeThumbnailUrl: creative.thumbnailUrl,
                  creativeThumbnailUrlAdId: adIdForCreative,
                },
              }
            : n
        )
      );
    });
    return () => {
      cancelled = true;
    };
  }, [
    adIdForCreative,
    isCreativeNode,
    id,
    data.creativeThumbnailUrl,
    data.creativeThumbnailUrlAdId,
    setNodes,
  ]);

  const commit = useCallback((val) => {
    setNodes((nds) =>
      nds.map((n) => n.id === id ? { ...n, data: { ...n.data, label: val } } : n)
    );
  }, [id, setNodes]);

  const startEdit = () => { setDraft(data.label); setEditing(true); };
  const finishEdit = () => { setEditing(false); commit(draft); };

  const handleColor = cfg.bg || '#3B82F6';

  const metaForStatus = effective?.metaLink || data.metaLink;
  const googleForStatus = effective?.googleLink || data.googleLink;
  const statusRingClass =
    metaForStatus?.campaignId && metaForStatus?.campaignStatus
      ? getMetaStatusRingClass(metaForStatus.campaignStatus)
      : googleForStatus?.campaignId && googleForStatus?.campaignStatus
        ? getGoogleStatusRingClass(googleForStatus.campaignStatus)
        : '';

  return (
    <div
      className={`vn-wrapper vn--${cfg.shape} ${selected ? 'vn--selected' : ''} ${statusRingClass}`.trim()}
      style={{ '--nc': cfg.bg }}
    >
      <Handles color={handleColor} shape={cfg.shape} />

      {editing ? (
        <div className="vn-edit">
          <input
            autoFocus
            className="vn-edit__input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={finishEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') finishEdit();
              if (e.key === 'Escape') { setEditing(false); }
            }}
          />
        </div>
      ) : cfg.shape === 'browser' ? (
        <BrowserVisual cfg={cfg} data={data} onEdit={startEdit} effective={effective} />
      ) : cfg.shape === 'diamond' ? (
        <DiamondVisual cfg={cfg} data={data} onEdit={startEdit} effective={effective} />
      ) : (
        <CircleVisual cfg={cfg} data={data} onEdit={startEdit} effective={effective} />
      )}
    </div>
  );
}
