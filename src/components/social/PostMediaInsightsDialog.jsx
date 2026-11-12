import React, { useEffect, useMemo, useState } from 'react';
import { format, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Clock,
  Activity,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  Heart,
  Loader2,
  MessageCircle,
  Play,
  Share2,
  UserPlus,
  User,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/customSupabaseClient';

const formatNumber = (value) => {
  const num = typeof value === 'number' ? value : parseFloat(value);
  if (!Number.isFinite(num)) return '—';
  return new Intl.NumberFormat('pt-BR').format(num);
};

const formatPercent = (value) => {
  if (!Number.isFinite(value)) return '—';
  return `${new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 1,
    minimumFractionDigits: value > 0 && value < 1 ? 1 : 0,
  }).format(value)}%`;
};

const formatDurationMs = (value) => {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m ${String(sec).padStart(1, '0')}s`;
};

function insightValue(insight) {
  if (!insight) return 0;
  if (insight.total_value && insight.total_value.value != null) {
    return Number(insight.total_value.value) || 0;
  }
  if (insight.value != null && insight.value !== '') {
    return Number(insight.value) || 0;
  }
  if (Array.isArray(insight.values) && insight.values.length) {
    return insight.values.reduce((sum, entry) => sum + (Number(entry?.value) || 0), 0);
  }
  return 0;
}

function parseEmbeddedInsights(item) {
  const rows = item?.insights?.data || (Array.isArray(item?.insights) ? item.insights : null);
  if (!rows) {
    return {
      reach: item?.insights?.reach ?? null,
      engagement: item?.insights?.engagement ?? item?.insights?.post_engagements ?? null,
      likes: item?.like_count ?? null,
      comments: item?.comments_count ?? null,
      views: null,
      avgWatchMs: null,
      totalWatchMs: null,
      follows: null,
      profileVisits: null,
      profileActivity: null,
      saved: null,
      shares: null,
    };
  }
  const map = {};
  for (const row of rows) {
    map[row.name] = insightValue(row);
  }
  return {
    reach: map.reach ?? null,
    engagement: map.total_interactions ?? map.post_engagements ?? map.engagement ?? null,
    likes: map.likes ?? item?.like_count ?? null,
    comments: map.comments ?? item?.comments_count ?? null,
    views: map.views ?? map.plays ?? null,
    avgWatchMs: map.ig_reels_avg_watch_time ?? null,
    totalWatchMs: map.ig_reels_video_view_total_time ?? null,
    follows: map.follows ?? null,
    profileVisits: map.profile_visits ?? null,
    profileActivity: map.profile_activity ?? null,
    saved: map.saved ?? null,
    shares: map.shares ?? null,
  };
}

function typeLabel(type) {
  const t = String(type || '').toUpperCase();
  if (t === 'REELS' || t.includes('REEL')) return 'Reels';
  if (t === 'CAROUSEL_ALBUM' || t.includes('CAROUSEL')) return 'Carrossel';
  if (t === 'VIDEO') return 'Vídeo';
  if (t === 'IMAGE' || t === 'PHOTO') return 'Foto';
  return t || 'Post';
}

function isVideoType(type) {
  const t = String(type || '').toUpperCase();
  return t === 'VIDEO' || t === 'REELS' || t.includes('REEL');
}

function isCarouselType(type) {
  const t = String(type || '').toUpperCase();
  return t === 'CAROUSEL_ALBUM' || t.includes('CAROUSEL');
}

function buildSlides(detail, fallbackItem) {
  const type = detail?.media_type || fallbackItem?.media_type || fallbackItem?.type;
  if (isCarouselType(type) && detail?.children?.length) {
    return detail.children.map((child) => ({
      id: child.id,
      media_type: child.media_type,
      media_url: child.media_url,
      thumbnail_url: child.thumbnail_url,
    }));
  }
  const mediaUrl = detail?.media_url || fallbackItem?.media_url || null;
  const thumb = detail?.thumbnail_url || fallbackItem?.thumbnail_url || fallbackItem?.full_picture || mediaUrl;
  return [{
    id: detail?.id || fallbackItem?.id,
    media_type: type,
    media_url: mediaUrl,
    thumbnail_url: thumb,
  }];
}

export default function PostMediaInsightsDialog({
  open,
  onOpenChange,
  item,
  platform = 'instagram',
  pageId = '',
}) {
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState(null);
  const [detail, setDetail] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentsError, setCommentsError] = useState(null);
  const [error, setError] = useState(null);
  const [slideIndex, setSlideIndex] = useState(0);
  const [captionExpanded, setCaptionExpanded] = useState(false);

  const baseType = String(item?.media_type || item?.type || detail?.media_type || 'post').toUpperCase();

  useEffect(() => {
    if (!open || !item?.id) {
      setMetrics(null);
      setDetail(null);
      setComments([]);
      setCommentsError(null);
      setError(null);
      setSlideIndex(0);
      setCaptionExpanded(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      setCommentsError(null);
      setSlideIndex(0);
      setCaptionExpanded(false);

      if (platform !== 'instagram') {
        try {
          const insightsRes = await supabase.functions.invoke('meta-ads-api', {
            body: {
              action: 'get-page-post-insights',
              post_id: item.id,
              page_id: pageId || String(item.id || '').split('_')[0] || undefined,
            },
          });
          if (cancelled) return;
          const metricsMap = insightsRes.data?.metrics || {};
          setDetail({
            ...item,
            media_url: item.media_url || item.full_picture || null,
            caption: item.caption || item.message || '',
            children: [],
          });
          setMetrics({
            reach: metricsMap.reach ?? null,
            engagement: metricsMap.clicks
              ?? item.insights?.engagement
              ?? ((Number(item.reactions_count) || 0) + (Number(item.comments_count) || 0) + (Number(item.shares_count) || 0)),
            likes: item.reactions_count ?? item.like_count ?? item.insights?.likes ?? null,
            comments: item.comments_count ?? item.insights?.comments ?? null,
            views: metricsMap.views ?? metricsMap.video_views ?? null,
            avgWatchMs: metricsMap.avg_watch_ms ?? null,
            totalWatchMs: null,
            follows: null,
            profileVisits: null,
            profileActivity: null,
            saved: null,
            shares: item.shares_count ?? item.insights?.shares ?? null,
          });
          setComments([]);
        } catch (err) {
          if (!cancelled) {
            setDetail({
              ...item,
              media_url: item.media_url || item.full_picture || null,
              caption: item.caption || item.message || '',
              children: [],
            });
            setMetrics(parseEmbeddedInsights(item));
            setError(err.message || 'Não foi possível ler os insights deste post.');
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
        return;
      }

      try {
        const [insightsRes, detailRes] = await Promise.all([
          supabase.functions.invoke('meta-ads-api', {
            body: {
              action: 'get-instagram-media-insights',
              media_id: item.id,
              media_type: baseType,
            },
          }),
          supabase.functions.invoke('meta-ads-api', {
            body: {
              action: 'get-instagram-media-detail',
              media_id: item.id,
            },
          }),
        ]);

        if (cancelled) return;

        if (!insightsRes.error && !insightsRes.data?.error) {
          const map = {};
          for (const row of insightsRes.data?.insights || []) {
            map[row.name] = insightValue(row);
          }
        setMetrics({
          reach: map.reach ?? null,
          engagement: map.total_interactions ?? null,
          likes: map.likes ?? item.like_count ?? null,
          comments: map.comments ?? item.comments_count ?? null,
          views: map.views ?? map.plays ?? null,
          avgWatchMs: map.ig_reels_avg_watch_time ?? null,
          totalWatchMs: map.ig_reels_video_view_total_time ?? null,
          follows: map.follows ?? null,
          profileVisits: map.profile_visits ?? null,
          profileActivity: map.profile_activity ?? null,
          saved: map.saved ?? null,
          shares: map.shares ?? null,
        });
        } else {
          setMetrics(parseEmbeddedInsights(item));
        }

        if (detailRes.error || detailRes.data?.error) {
          setDetail({
            ...item,
            media_url: item.media_url || null,
            thumbnail_url: item.thumbnail_url || null,
            caption: item.caption || '',
            children: [],
          });
          setError(detailRes.data?.error?.message || detailRes.error?.message || null);
          setComments([]);
        } else {
          setDetail(detailRes.data?.media || null);
          setComments(detailRes.data?.comments || []);
          setCommentsError(detailRes.data?.comments_error || null);
        }
      } catch (err) {
        if (!cancelled) {
          setMetrics(parseEmbeddedInsights(item));
          setDetail({
            ...item,
            caption: item.caption || '',
            children: [],
          });
          setError(err?.message || 'Não foi possível carregar o post');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [open, item, platform, baseType, pageId]);

  const slides = useMemo(() => buildSlides(detail, item), [detail, item]);
  const current = slides[Math.min(slideIndex, Math.max(slides.length - 1, 0))] || null;
  const type = String(detail?.media_type || item?.media_type || item?.type || 'post').toUpperCase();
  const when = detail?.timestamp || item?.timestamp || item?.created_time;
  const whenLabel = when && isValid(new Date(when))
    ? format(new Date(when), "dd MMM yyyy · HH:mm", { locale: ptBR })
    : null;
  const permalink = detail?.permalink || item?.permalink || item?.permalink_url || null;
  const caption = detail?.caption || item?.caption || item?.message || '';
  const captionLong = caption.length > 180;

  const engagementRate = useMemo(() => {
    const reach = Number(metrics?.reach);
    const engagement = Number(metrics?.engagement);
    if (!Number.isFinite(reach) || reach <= 0 || !Number.isFinite(engagement)) return null;
    return (engagement / reach) * 100;
  }, [metrics]);

  const viewsPerReach = useMemo(() => {
    const reach = Number(metrics?.reach);
    const views = Number(metrics?.views);
    if (!Number.isFinite(reach) || reach <= 0 || !Number.isFinite(views)) return null;
    return views / reach;
  }, [metrics]);

  const secondaryCards = useMemo(() => {
    const cards = [
      metrics?.views != null
        ? { key: 'views', label: 'Visualizações', value: metrics.views, icon: Play, format: 'number' }
        : null,
      isVideoType(type) && metrics?.avgWatchMs != null
        ? { key: 'avgWatch', label: 'Tempo médio', value: metrics.avgWatchMs, icon: Clock, format: 'duration' }
        : null,
      isVideoType(type) && metrics?.totalWatchMs != null
        ? { key: 'totalWatch', label: 'Tempo total', value: metrics.totalWatchMs, icon: Clock, format: 'duration' }
        : null,
      viewsPerReach != null
        ? { key: 'viewsReach', label: 'Views / alcance', value: viewsPerReach, icon: Eye, format: 'ratio' }
        : null,
      { key: 'likes', label: 'Curtidas', value: metrics?.likes ?? detail?.like_count, icon: Heart, format: 'number' },
      {
        key: 'comments',
        label: 'Comentários',
        value: metrics?.comments ?? detail?.comments_count ?? comments.length,
        icon: MessageCircle,
        format: 'number',
      },
      { key: 'saved', label: 'Salvos', value: metrics?.saved, icon: Bookmark, format: 'number' },
      { key: 'shares', label: 'Envios', value: metrics?.shares, icon: Share2, format: 'number' },
      metrics?.follows != null
        ? { key: 'follows', label: 'Seguiu por este post', value: metrics.follows, icon: UserPlus, format: 'number' }
        : null,
      metrics?.profileVisits != null
        ? { key: 'profileVisits', label: 'Visitas ao perfil', value: metrics.profileVisits, icon: User, format: 'number' }
        : null,
      metrics?.profileActivity != null
        ? { key: 'profileActivity', label: 'Ações no perfil', value: metrics.profileActivity, icon: Activity, format: 'number' }
        : null,
    ].filter(Boolean);

    if (platform !== 'instagram') {
      return cards.filter((card) => ['likes', 'comments'].includes(card.key));
    }
    return cards;
  }, [type, metrics, detail, comments.length, platform, viewsPerReach]);

  const formatCardValue = (value, valueFormat) => {
    if (valueFormat === 'duration') return formatDurationMs(value);
    if (valueFormat === 'ratio') {
      const num = Number(value);
      if (!Number.isFinite(num)) return '—';
      return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(num)}×`;
    }
    return formatNumber(value);
  };

  const goSlide = (delta) => {
    if (slides.length <= 1) return;
    setSlideIndex((prev) => (prev + delta + slides.length) % slides.length);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="client-social-insight-dialog sm:max-w-3xl max-h-[94vh] overflow-y-auto p-0 gap-0 border-0">
        <DialogHeader className="client-social-insight-top">
          <DialogTitle className="client-social-insight-title">Desempenho do post</DialogTitle>
          <p className="client-social-insight-subtitle">
            Mídia, legenda, comentários e métricas
          </p>
        </DialogHeader>

        {!item ? null : (
          <div className="client-social-insight-body">
            <div className={`client-social-insight-layout ${isCarouselType(type) || isVideoType(type) ? 'has-media' : ''}`}>
              <div className="client-social-insight-viewer">
                {loading && !detail ? (
                  <div className="client-social-insight-viewer-empty">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : current && isVideoType(current.media_type || type) && current.media_url ? (
                  <video
                    key={current.id || current.media_url}
                    className="client-social-insight-video"
                    src={current.media_url}
                    poster={current.thumbnail_url || undefined}
                    controls
                    playsInline
                    preload="metadata"
                  />
                ) : current?.media_url || current?.thumbnail_url ? (
                  <img
                    key={current.id || current.media_url || current.thumbnail_url}
                    src={current.media_url || current.thumbnail_url}
                    alt=""
                    className="client-social-insight-image"
                  />
                ) : (
                  <div className="client-social-insight-viewer-empty">{typeLabel(type)}</div>
                )}

                {slides.length > 1 ? (
                  <>
                    <button
                      type="button"
                      className="client-social-insight-nav is-prev"
                      onClick={() => goSlide(-1)}
                      aria-label="Slide anterior"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="client-social-insight-nav is-next"
                      onClick={() => goSlide(1)}
                      aria-label="Próximo slide"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    <div className="client-social-insight-dots" aria-hidden>
                      {slides.map((slide, idx) => (
                        <button
                          key={slide.id || idx}
                          type="button"
                          className={idx === slideIndex ? 'is-active' : ''}
                          onClick={() => setSlideIndex(idx)}
                        />
                      ))}
                    </div>
                    <span className="client-social-insight-counter">
                      {slideIndex + 1}/{slides.length}
                    </span>
                  </>
                ) : null}
              </div>

              <div className="client-social-insight-side">
                <div className="client-social-insight-chips">
                  <span className="client-social-insight-chip">{typeLabel(type)}</span>
                  {whenLabel ? <span className="client-social-insight-when">{whenLabel}</span> : null}
                </div>

                {caption ? (
                  <div className="client-social-insight-caption-wrap">
                    <p className={`client-social-insight-caption ${captionExpanded || !captionLong ? 'is-full' : ''}`}>
                      {caption}
                    </p>
                    {captionLong ? (
                      <button
                        type="button"
                        className="client-social-insight-caption-toggle"
                        onClick={() => setCaptionExpanded((v) => !v)}
                      >
                        {captionExpanded ? 'Ver menos' : 'Ver legenda completa'}
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <p className="client-social-insight-caption is-muted">Sem legenda</p>
                )}

                {loading ? (
                  <div className="client-social-insight-loading">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Carregando métricas…</span>
                  </div>
                ) : (
                  <>
                    <div className="client-social-insight-spotlight">
                      <div className="client-social-insight-spot">
                        <span className="client-social-insight-spot-label">
                          <Eye className="h-3.5 w-3.5" />
                          Alcance
                        </span>
                        <strong>{formatNumber(metrics?.reach)}</strong>
                      </div>
                      <div className="client-social-insight-spot">
                        <span className="client-social-insight-spot-label">
                          <Activity className="h-3.5 w-3.5" />
                          Interações
                        </span>
                        <strong>{formatNumber(metrics?.engagement)}</strong>
                      </div>
                      <div className="client-social-insight-spot is-rate">
                        <span className="client-social-insight-spot-label">Taxa</span>
                        <strong>{formatPercent(engagementRate)}</strong>
                      </div>
                    </div>

                    <div className="client-social-insight-grid">
                      {secondaryCards.map(({ key, label, value, icon: Icon, format: valueFormat }) => (
                        <div key={key} className="client-social-insight-card">
                          <div className="client-social-insight-card-icon">
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <div>
                            <span>{label}</span>
                            <strong>{formatCardValue(value, valueFormat)}</strong>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="client-social-insight-note">
                      “Seguiu por este post” só vem em foto/carrossel. Em Reels a Meta não libera essa métrica.
                      Idade e gênero ficam só na Análise da conta.
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="client-social-insight-comments">
              <div className="client-social-insight-comments-head">
                <h4>
                  <MessageCircle className="h-4 w-4" />
                  Comentários
                </h4>
                <span>
                  {formatNumber(detail?.comments_count ?? comments.length)}
                </span>
              </div>

              {loading ? (
                <div className="client-social-insight-loading is-compact">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Buscando comentários…</span>
                </div>
              ) : commentsError && comments.length === 0 ? (
                <p className="client-social-insight-comments-empty">{commentsError}</p>
              ) : comments.length === 0 ? (
                <p className="client-social-insight-comments-empty">Nenhum comentário neste post.</p>
              ) : (
                <ul className="client-social-insight-comments-list">
                  {comments.map((comment) => (
                    <li key={comment.id}>
                      <div className="client-social-insight-comment-meta">
                        <strong>@{comment.username || 'usuario'}</strong>
                        {comment.timestamp && isValid(new Date(comment.timestamp)) ? (
                          <span>
                            {format(new Date(comment.timestamp), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                          </span>
                        ) : null}
                      </div>
                      <p>{comment.text || '—'}</p>
                      {(comment.replies || []).map((reply) => (
                        <div key={reply.id} className="client-social-insight-reply">
                          <strong>@{reply.username || 'usuario'}</strong>
                          <p>{reply.text || '—'}</p>
                        </div>
                      ))}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {error ? (
              <p className="client-social-insight-error">{error}</p>
            ) : null}

            <div className="client-social-insight-footer">
              {permalink ? (
                <a
                  href={permalink}
                  target="_blank"
                  rel="noreferrer"
                  className="client-social-insight-external"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Abrir no {platform === 'instagram' ? 'Instagram' : 'Facebook'}
                </a>
              ) : (
                <span />
              )}
              <button
                type="button"
                className="client-social-insight-close"
                onClick={() => onOpenChange?.(false)}
              >
                Fechar
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
