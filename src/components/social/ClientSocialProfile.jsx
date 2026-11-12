import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format, isValid, parseISO, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  BarChart3,
  CheckCircle2,
  ExternalLink,
  Facebook,
  Grid3X3,
  Instagram,
  LayoutGrid,
  Loader2,
  Play,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import {
  accountsByPlatform,
  displaySocialAccount,
  fetchClienteSocialAccounts,
} from '@/lib/clienteSocialAccounts';
import { buildSocialFeedReview, normalizeFeedItem } from '@/lib/socialFeedReview';
import {
  formatSnapshotUpdatedAt,
  isSnapshotFresh,
  readSnapshotData,
  readSnapshotEntry,
  writeSnapshotEntry,
} from '@/lib/socialSnapshotCache';
import ContentPublisher from './ContentPublisher';
import PageInsightsView from './PageInsightsView';
import InstagramInsightsView from './InstagramInsightsView';
import PostMediaInsightsDialog from './PostMediaInsightsDialog';
import './ClientSocialProfile.css';

const CACHE_PREFIX = 'meta_client_social_v4_';

const FEED_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'IMAGE', label: 'Fotos' },
  { id: 'REELS', label: 'Reels' },
  { id: 'CAROUSEL_ALBUM', label: 'Carrossel' },
];

const VIEW_TABS = [
  { id: 'posts', label: 'Posts', icon: Grid3X3 },
  { id: 'review', label: 'Conferência', icon: CheckCircle2 },
  { id: 'insights', label: 'Análise', icon: BarChart3 },
];

const VIEW_TAB_IDS = new Set(VIEW_TABS.map((tab) => tab.id));
const FEED_FILTER_IDS = new Set(FEED_FILTERS.map((chip) => chip.id));

function cacheKey(parts) {
  return `${CACHE_PREFIX}${parts.filter(Boolean).join('_')}`;
}

function readCache(key) {
  return readSnapshotData(key);
}

function writeCache(key, data) {
  writeSnapshotEntry(key, data);
}

function formatCompact(value) {
  const num = typeof value === 'number' ? value : parseFloat(value);
  if (!Number.isFinite(num)) return '—';
  if (num >= 1000) {
    const compact = new Intl.NumberFormat('pt-BR', {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(num);
    return compact.toLowerCase();
  }
  return new Intl.NumberFormat('pt-BR').format(num);
}

function mediaThumb(item) {
  return item.thumbnail_url || item.media_url || item.full_picture || null;
}

function isVideoItem(item) {
  const type = String(item?.media_type || '').toUpperCase();
  return type === 'VIDEO' || type === 'REELS' || type.includes('REEL');
}

function matchesFeedFilter(item, filter) {
  if (filter === 'all') return true;
  const type = String(item?.media_type || '').toUpperCase();
  if (filter === 'IMAGE') return type === 'IMAGE' || type === 'PHOTO' || type === 'STATUS' || (!type && !isVideoItem(item));
  if (filter === 'REELS') return type === 'REELS' || type === 'VIDEO';
  if (filter === 'CAROUSEL_ALBUM') return type === 'CAROUSEL_ALBUM' || type.includes('CAROUSEL');
  return true;
}

function parseDateParam(value) {
  if (!value) return null;
  try {
    const date = parseISO(String(value).slice(0, 10));
    return isValid(date) ? date : null;
  } catch {
    return null;
  }
}

function linkifyBio(text) {
  const raw = String(text || '');
  if (!raw) return null;
  const parts = raw.split(/((?:https?:\/\/|www\.)[^\s]+|@[a-zA-Z0-9._]+)/g);
  return parts.map((part, index) => {
    if (/^https?:\/\//i.test(part) || /^www\./i.test(part)) {
      const href = part.startsWith('http') ? part : `https://${part}`;
      return (
        <a key={`${index}-${part}`} href={href} target="_blank" rel="noreferrer" className="client-social-bio-link">
          {part}
        </a>
      );
    }
    if (/^@[a-zA-Z0-9._]+$/.test(part)) {
      const handle = part.slice(1);
      return (
        <a
          key={`${index}-${part}`}
          href={`https://www.instagram.com/${handle}/`}
          target="_blank"
          rel="noreferrer"
          className="client-social-bio-link"
        >
          {part}
        </a>
      );
    }
    return <span key={`${index}-t`}>{part}</span>;
  });
}

function FeedTile({ item, confirmed, onOpen }) {
  const thumb = mediaThumb(item);
  const video = isVideoItem(item);
  const type = String(item.media_type || 'post').toUpperCase();
  return (
    <button
      type="button"
      onClick={() => onOpen?.(item)}
      className={`client-social-feed-tile ${confirmed ? 'is-confirmed' : ''}`}
      title="Ver insights do post"
    >
      {thumb ? <img src={thumb} alt="" loading="lazy" /> : (
        <div className="client-social-feed-fallback">{type}</div>
      )}
      {confirmed ? <span className="client-social-feed-badge is-ok">Ok</span> : null}
      {!confirmed && type === 'CAROUSEL_ALBUM' ? (
        <span className="client-social-feed-badge">Álbum</span>
      ) : null}
      {video ? (
        <div className="client-social-feed-play" aria-hidden>
          <span><Play className="h-4 w-4 fill-current" /></span>
        </div>
      ) : null}
      <div className="client-social-feed-hover">
        {(item.caption || item.message || '').slice(0, 90) || 'Ver insights'}
      </div>
    </button>
  );
}

const ClientSocialProfile = ({
  clientId,
  clientName,
  publications = [],
  onOpenPublicationTask,
  liveMeta = true,
}) => {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [accounts, setAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [profile, setProfile] = useState(null);
  const [feed, setFeed] = useState([]);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [syncedAt, setSyncedAt] = useState(null);
  const [showPublisher, setShowPublisher] = useState(false);
  const [insightPost, setInsightPost] = useState(null);
  const [bioExpanded, setBioExpanded] = useState(false);

  const patchSearch = useCallback((mutator) => {
    const next = new URLSearchParams(searchParams);
    mutator(next);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const platformParam = searchParams.get('platform');
  const platform = platformParam === 'facebook' || platformParam === 'facebook_page'
    ? 'facebook_page'
    : 'instagram';

  const viewTab = VIEW_TAB_IDS.has(searchParams.get('view'))
    ? searchParams.get('view')
    : 'posts';

  const feedFilter = FEED_FILTER_IDS.has(searchParams.get('feed'))
    ? searchParams.get('feed')
    : 'all';

  const selectedId = searchParams.get('account') || '';

  const date = useMemo(() => {
    const from = parseDateParam(searchParams.get('from')) || subDays(new Date(), 30);
    const to = parseDateParam(searchParams.get('to')) || new Date();
    return { from, to };
  }, [searchParams]);

  const postIdFromUrl = searchParams.get('post') || '';

  const { pages, instagram } = useMemo(() => accountsByPlatform(accounts), [accounts]);

  const setPlatform = useCallback((nextPlatform) => {
    patchSearch((next) => {
      if (nextPlatform === 'facebook_page') next.set('platform', 'facebook');
      else next.delete('platform');
      next.delete('account');
      next.delete('post');
      next.delete('feed');
    });
  }, [patchSearch]);

  const setViewTab = useCallback((tabId) => {
    patchSearch((next) => {
      if (!tabId || tabId === 'posts') next.delete('view');
      else next.set('view', tabId);
      if (tabId !== 'posts') next.delete('feed');
      if (tabId !== 'posts' && tabId !== 'review') next.delete('post');
    });
  }, [patchSearch]);

  const setFeedFilter = useCallback((filterId) => {
    patchSearch((next) => {
      if (!filterId || filterId === 'all') next.delete('feed');
      else next.set('feed', filterId);
    });
  }, [patchSearch]);

  const setSelectedId = useCallback((metaId) => {
    patchSearch((next) => {
      if (metaId) next.set('account', metaId);
      else next.delete('account');
      next.delete('post');
    });
  }, [patchSearch]);

  const setDate = useCallback((range) => {
    patchSearch((next) => {
      if (range?.from && isValid(range.from)) next.set('from', format(range.from, 'yyyy-MM-dd'));
      else next.delete('from');
      if (range?.to && isValid(range.to)) next.set('to', format(range.to, 'yyyy-MM-dd'));
      else next.delete('to');
    });
  }, [patchSearch]);

  const openInsightPost = useCallback((item) => {
    setInsightPost(item || null);
    patchSearch((next) => {
      if (item?.id) next.set('post', item.id);
      else next.delete('post');
    });
  }, [patchSearch]);

  const closeInsightPost = useCallback(() => {
    setInsightPost(null);
    patchSearch((next) => {
      next.delete('post');
    });
  }, [patchSearch]);

  const loadAccounts = useCallback(async () => {
    if (!clientId) {
      setAccounts([]);
      setLoadingAccounts(false);
      return;
    }
    setLoadingAccounts(true);
    try {
      const rows = await fetchClienteSocialAccounts(supabase, clientId);
      setAccounts(rows);
      const by = accountsByPlatform(rows);
      const wantsFacebook = platformParam === 'facebook' || platformParam === 'facebook_page';
      const urlAccount = searchParams.get('account');

      let nextPlatform = 'instagram';
      let nextAccount = '';
      if (wantsFacebook && by.pages.length) {
        nextPlatform = 'facebook_page';
        nextAccount = urlAccount && by.pages.some((row) => row.meta_id === urlAccount)
          ? urlAccount
          : by.pages[0].meta_id;
      } else if (!wantsFacebook && by.instagram.length) {
        nextPlatform = 'instagram';
        nextAccount = urlAccount && by.instagram.some((row) => row.meta_id === urlAccount)
          ? urlAccount
          : by.instagram[0].meta_id;
      } else if (by.instagram.length) {
        nextPlatform = 'instagram';
        nextAccount = by.instagram[0].meta_id;
      } else if (by.pages.length) {
        nextPlatform = 'facebook_page';
        nextAccount = by.pages[0].meta_id;
      }

      patchSearch((next) => {
        if (nextPlatform === 'facebook_page') next.set('platform', 'facebook');
        else next.delete('platform');
        if (nextAccount) next.set('account', nextAccount);
        else next.delete('account');
      });
    } catch (err) {
      toast({
        title: 'Erro ao carregar vínculos',
        description: err.message || 'Não foi possível ler as redes do cliente.',
        variant: 'destructive',
      });
      setAccounts([]);
    } finally {
      setLoadingAccounts(false);
    }
  }, [clientId, toast, platformParam, searchParams, patchSearch]);

  useEffect(() => {
    void loadAccounts();
    // Só relê vínculos ao trocar cliente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const catalogForSelect = platform === 'instagram' ? instagram : pages;

  useEffect(() => {
    if (!catalogForSelect.length) {
      if (selectedId) {
        patchSearch((next) => {
          next.delete('account');
        });
      }
      return;
    }
    if (!selectedId || !catalogForSelect.some((row) => row.meta_id === selectedId)) {
      patchSearch((next) => {
        next.set('account', catalogForSelect[0].meta_id);
      });
    }
  }, [catalogForSelect, selectedId, patchSearch]);

  const loadProfileAndFeed = useCallback(async (force = false) => {
    if (!selectedId || !date?.from || !date?.to || !isValid(date.from) || !isValid(date.to)) {
      return;
    }
    const since = format(date.from, 'yyyy-MM-dd');
    const until = format(date.to, 'yyyy-MM-dd');
    const key = cacheKey(['feed', platform, selectedId, since, until]);
    const entry = readSnapshotEntry(key);
    const cached = entry?.data;
    if (cached && cached.profile) {
      setProfile(cached.profile);
      setFeed(cached.feed || []);
      setSyncedAt(cached.syncedAt || (entry.timestamp ? new Date(entry.timestamp).toISOString() : null));
      if (!liveMeta) return;
      if (!force && isSnapshotFresh(entry.timestamp)) return;
    } else if (!liveMeta) {
      return;
    }

    setLoadingFeed(!cached?.profile);
    let nextProfile = null;
    let nextFeed = [];
    const errors = [];
    try {
      if (platform === 'instagram') {
        const [profileRes, mediaRes] = await Promise.all([
          supabase.functions.invoke('meta-ads-api', {
            body: { action: 'get-instagram-profile', instagram_account_id: selectedId },
          }),
          supabase.functions.invoke('meta-ads-api', {
            body: {
              action: 'get-instagram-media',
              instagram_account_id: selectedId,
              time_range: { since, until },
            },
          }),
        ]);
        if (profileRes.error || profileRes.data?.error) {
          errors.push(profileRes.data?.error?.message || profileRes.error?.message || 'Perfil Instagram');
        } else {
          nextProfile = profileRes.data?.profile || null;
        }
        if (mediaRes.error || mediaRes.data?.error) {
          errors.push(mediaRes.data?.error?.message || mediaRes.error?.message || 'Feed Instagram');
        } else {
          nextFeed = (mediaRes.data?.media || [])
            .map((item) => normalizeFeedItem(item, 'instagram'))
            .filter(Boolean);
        }
      } else {
        const [profileRes, postsRes] = await Promise.all([
          supabase.functions.invoke('meta-ads-api', {
            body: { action: 'get-page-profile', page_id: selectedId },
          }),
          supabase.functions.invoke('meta-ads-api', {
            body: {
              action: 'get-page-posts',
              page_id: selectedId,
              time_range: { since, until },
            },
          }),
        ]);
        if (profileRes.error || profileRes.data?.error) {
          errors.push(profileRes.data?.error?.message || profileRes.error?.message || 'Perfil Facebook');
        } else {
          nextProfile = profileRes.data?.profile || null;
        }
        if (postsRes.error || postsRes.data?.error) {
          errors.push(postsRes.data?.error?.message || postsRes.error?.message || 'Feed Facebook');
        } else {
          nextFeed = (postsRes.data?.posts || [])
            .map((item) => normalizeFeedItem(item, 'facebook_page'))
            .filter(Boolean);
        }
      }

      const nowIso = new Date().toISOString();
      if (nextProfile || nextFeed.length) {
        setProfile(nextProfile || cached?.profile || null);
        setFeed(nextFeed.length ? nextFeed : (cached?.feed || []));
        setSyncedAt(nowIso);
        writeCache(key, {
          profile: nextProfile || cached?.profile || null,
          feed: nextFeed.length ? nextFeed : (cached?.feed || []),
          syncedAt: nowIso,
        });
      } else if (cached?.profile) {
        setProfile(cached.profile);
        setFeed(cached.feed || []);
        setSyncedAt(cached.syncedAt || (entry.timestamp ? new Date(entry.timestamp).toISOString() : null));
      } else {
        setProfile(nextProfile);
        setFeed(nextFeed);
        setSyncedAt(nowIso);
      }
      if (errors.length && !(nextFeed.length || nextProfile || cached?.profile)) {
        toast({
          title: 'Erro ao carregar feed',
          description: errors.join(' · '),
          variant: 'destructive',
        });
      }
    } catch (err) {
      if (cached?.profile) {
        setProfile(cached.profile);
        setFeed(cached.feed || []);
        setSyncedAt(cached.syncedAt || (entry.timestamp ? new Date(entry.timestamp).toISOString() : null));
      } else {
        toast({
          title: 'Erro ao carregar feed',
          description: err.message || 'Falha na Graph API',
          variant: 'destructive',
        });
      }
    } finally {
      setLoadingFeed(false);
    }
  }, [selectedId, platform, date, toast, liveMeta]);

  useEffect(() => {
    void loadProfileAndFeed(false);
  }, [loadProfileAndFeed]);

  useEffect(() => {
    setBioExpanded(false);
  }, [selectedId, platform]);

  useEffect(() => {
    if (!postIdFromUrl || !feed.length) return;
    const found = feed.find((item) => String(item.id) === String(postIdFromUrl));
    if (found) setInsightPost(found);
  }, [postIdFromUrl, feed]);

  const clientPublications = useMemo(() => {
    const channel = platform === 'instagram' ? 'Instagram' : 'Facebook';
    return (publications || []).filter((pub) => {
      if (String(pub.channel || '') !== channel) return false;
      const taskClient = pub.task?.client_id || pub.client_id;
      return !clientId || taskClient === clientId;
    });
  }, [publications, platform, clientId]);

  const review = useMemo(
    () => buildSocialFeedReview(clientPublications, feed),
    [clientPublications, feed]
  );

  const filteredFeed = useMemo(
    () => feed.filter((item) => matchesFeedFilter(item, feedFilter)),
    [feed, feedFilter]
  );

  const selectedAccount = catalogForSelect.find((row) => row.meta_id === selectedId);
  const handleLabel = platform === 'instagram'
    ? `@${String(profile?.username || selectedAccount?.username || '').replace(/^@/, '') || 'instagram'}`
    : (profile?.name || displaySocialAccount(selectedAccount) || 'Página');
  const avatarUrl = profile?.profile_picture_url
    || selectedAccount?.profile_picture_url
    || '/brand/simbolo.png';
  const syncLabel = formatSnapshotUpdatedAt(syncedAt ? Date.parse(syncedAt) : 0)
    || (profile || feed.length ? 'Atualizado agora' : 'Ainda sem atualização');

  if (!clientId) {
    return (
      <div className="client-social-empty">
        Selecione um cliente para ver o perfil, o feed e conferir se o planejado foi postado.
      </div>
    );
  }

  if (loadingAccounts) {
    return (
      <div className="client-social-loading">
        <Loader2 className="h-5 w-5 animate-spin" />
        Carregando redes do cliente…
      </div>
    );
  }

  if (!instagram.length && !pages.length) {
    return (
      <div className="client-social-empty">
        Este cliente ainda não tem página ou Instagram ligados.
        <p style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>
          Abra o cadastro do cliente e ligue os destinos em Página e Instagram.
        </p>
      </div>
    );
  }

  return (
    <div className="client-social">
      <div className="client-social-platform">
        <button
          type="button"
          className={`client-social-btn ${platform === 'instagram' ? 'is-active' : 'is-ghost'}`}
          disabled={!instagram.length}
          onClick={() => setPlatform('instagram')}
        >
          <Instagram className="h-4 w-4" />
          Instagram
        </button>
        <button
          type="button"
          className={`client-social-btn ${platform === 'facebook_page' ? 'is-active' : 'is-ghost'}`}
          disabled={!pages.length}
          onClick={() => setPlatform('facebook_page')}
        >
          <Facebook className="h-4 w-4" />
          Facebook
        </button>
        {catalogForSelect.length > 1 ? (
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger className="client-social-select h-9 rounded-full">
              <SelectValue placeholder="Destino" />
            </SelectTrigger>
            <SelectContent>
              {catalogForSelect.map((row) => (
                <SelectItem key={row.id} value={row.meta_id}>
                  {displaySocialAccount(row)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      <div className="client-social-shell">
        <header className="client-social-hero">
          <img src={avatarUrl} alt="" className="client-social-hero-avatar" />
          <div className="client-social-hero-main">
            <div className="client-social-hero-kicker">
              <LayoutGrid className="h-3.5 w-3.5" />
              {clientName || 'Cliente'}
            </div>
            <h3 className="client-social-hero-title">{handleLabel}</h3>
            <div className="client-social-hero-meta">
              <span>
                <strong>{formatCompact(profile?.followers_count ?? profile?.fan_count)}</strong>
                {' '}seguidores
              </span>
              <span className="client-social-hero-dot" />
              <span>
                <strong>{formatCompact(profile?.media_count ?? feed.length)}</strong>
                {' '}posts
              </span>
              <span className="client-social-hero-dot" />
              <span>{syncLabel}</span>
            </div>
            {(profile?.biography || profile?.about) ? (
              <div className="client-social-hero-bio-wrap">
                <p className={`client-social-hero-bio${bioExpanded ? ' is-expanded' : ''}`}>
                  {linkifyBio(profile.biography || profile.about)}
                </p>
                {String(profile.biography || profile.about || '').length > 90 ? (
                  <button
                    type="button"
                    className="client-social-bio-toggle"
                    onClick={() => setBioExpanded((v) => !v)}
                  >
                    {bioExpanded ? 'Recolher bio' : 'Ver bio completa'}
                  </button>
                ) : null}
              </div>
            ) : null}
            {platform === 'instagram' ? (
              <div className="client-social-hero-links">
                {profile?.website ? (
                  <a
                    href={/^https?:\/\//i.test(profile.website) ? profile.website : `https://${profile.website}`}
                    target="_blank"
                    rel="noreferrer"
                    className="client-social-website"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>{profile.website.replace(/^https?:\/\//i, '')}</span>
                  </a>
                ) : (
                  <span className="client-social-website-empty">
                    Sem link de site na Meta (campo website vazio nesta conta)
                  </span>
                )}
              </div>
            ) : null}
            {platform === 'instagram' && Array.isArray(profile?.stories) && profile.stories.length > 0 ? (
              <div className="client-social-stories">
                <div className="client-social-stories-label">Stories agora</div>
                <div className="client-social-stories-row">
                  {profile.stories.map((story) => {
                    const thumb = story.thumbnail_url || story.media_url;
                    return (
                      <a
                        key={story.id}
                        className="client-social-story"
                        href={story.permalink || '#'}
                        target="_blank"
                        rel="noreferrer"
                        title="Story ativo (24h)"
                      >
                        {thumb ? (
                          <img src={thumb} alt="" />
                        ) : (
                          <span className="client-social-story-fallback">Story</span>
                        )}
                      </a>
                    );
                  })}
                </div>
              </div>
            ) : platform === 'instagram' ? (
              <p className="client-social-highlights-note">
                Destaques do perfil não vêm pela API oficial da Meta. Stories ativos (24h) aparecem aqui quando existirem.
              </p>
            ) : null}
          </div>
          <div className="client-social-hero-actions">
            <button
              type="button"
              className="client-social-btn"
              onClick={() => setViewTab('insights')}
            >
              <BarChart3 className="h-4 w-4" />
              Insights
            </button>
            <button
              type="button"
              className="client-social-btn"
              disabled={loadingFeed}
              onClick={() => void loadProfileAndFeed(true)}
            >
              {loadingFeed ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Sync
            </button>
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className="client-social-btn">
                  {date?.from && date?.to
                    ? `${format(date.from, 'dd/MM', { locale: ptBR })}–${format(date.to, 'dd/MM', { locale: ptBR })}`
                    : 'Período'}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="range"
                  numberOfMonths={2}
                  selected={date}
                  onSelect={(range) => {
                    if (range?.from) setDate({ from: range.from, to: range.to || range.from });
                  }}
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
            <Dialog open={showPublisher} onOpenChange={setShowPublisher}>
              <DialogTrigger asChild>
                <button type="button" className="client-social-btn is-primary">
                  <Plus className="h-4 w-4" />
                  Post avulso
                </button>
              </DialogTrigger>
              <DialogContent className="meta-composer-dialog max-h-[94vh] max-w-6xl overflow-hidden p-0 sm:p-0">
                <DialogHeader className="px-5 pt-5 pb-2 sm:px-6 shrink-0">
                  <DialogTitle>Publicar</DialogTitle>
                </DialogHeader>
                <div className="px-5 pb-5 sm:px-6 sm:pb-6 overflow-y-auto max-h-[calc(94vh-3.5rem)]">
                  <ContentPublisher
                    type={platform === 'instagram' ? 'instagram' : 'pages'}
                    pages={pages}
                    instagramAccounts={instagram}
                    selectedPage={platform === 'facebook_page' ? selectedId : ''}
                    selectedInstagram={platform === 'instagram' ? selectedId : ''}
                    clientId={clientId}
                    clientName={clientName}
                    profilePictureUrl={avatarUrl}
                    onClose={() => setShowPublisher(false)}
                    onSuccess={() => {
                      setShowPublisher(false);
                      void loadProfileAndFeed(true);
                    }}
                  />
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </header>

        <div className="client-social-toolbar">
          <div className="client-social-tabs" role="tablist">
            {VIEW_TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={viewTab === tab.id}
                  className={`client-social-tab ${viewTab === tab.id ? 'is-active' : ''}`}
                  onClick={() => setViewTab(tab.id)}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
          <div className="client-social-stats">
            <span className="client-social-stat is-ok">
              <strong>{review.counts.confirmed}</strong> confirmados
            </span>
            <span className="client-social-stat is-warn">
              <strong>{review.counts.plannedMissing}</strong> sem post
            </span>
            <span className="client-social-stat is-organic">
              <strong>{review.counts.organic}</strong> só na Meta
            </span>
          </div>
        </div>

        {loadingFeed && !profile && !feed.length ? (
          <div className="client-social-loading">
            <Loader2 className="h-5 w-5 animate-spin" />
            Carregando perfil e feed…
          </div>
        ) : (
          <>
            {viewTab === 'posts' ? (
              <div style={{ marginTop: '0.9rem' }}>
                <div className="client-social-chips" style={{ marginBottom: '0.85rem' }}>
                  {(platform === 'instagram'
                    ? FEED_FILTERS
                    : FEED_FILTERS.map((chip) => (chip.id === 'REELS' ? { ...chip, label: 'Vídeos' } : chip))
                  ).map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      className={`client-social-chip ${feedFilter === chip.id ? 'is-active' : ''}`}
                      onClick={() => setFeedFilter(chip.id)}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
                {filteredFeed.length === 0 ? (
                  <div className="client-social-empty">
                    {feed.length
                      ? `Nenhum ${FEED_FILTERS.find((chip) => chip.id === feedFilter)?.label?.toLowerCase() || 'item'} neste filtro. Há ${feed.length} posts — volte em Todos.`
                      : 'Nenhuma mídia no período selecionado.'}
                  </div>
                ) : (
                  <div className="client-social-feed-grid">
                    {filteredFeed.map((item) => (
                      <FeedTile
                        key={item.id}
                        item={item}
                        confirmed={review.confirmed.some((row) => row.feedItem?.id === item.id)}
                        onOpen={openInsightPost}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {viewTab === 'review' ? (
              <div className="client-social-panel" style={{ marginTop: '0.9rem' }}>
                <h4>Conferência planejado × Meta</h4>
                {review.plannedMissing.length === 0 && review.organic.length === 0 ? (
                  <p style={{ margin: 0, color: 'var(--cs-muted)', fontSize: '0.875rem' }}>
                    Nada a conferir neste período. Os posts do Planeje batem com o feed, ou ainda não há publicações.
                  </p>
                ) : null}
                {review.plannedMissing.length > 0 ? (
                  <div style={{ marginBottom: '1rem' }}>
                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', fontWeight: 650, color: '#b45309' }}>
                      Planejado no Planeje e ainda sem correspondente no feed
                    </p>
                    {review.plannedMissing.map(({ publication }) => (
                      <button
                        key={publication.id}
                        type="button"
                        className="client-social-missing"
                        onClick={() => onOpenPublicationTask?.(publication)}
                      >
                        <span>
                          <strong>{publication.destination || publication.channel}</strong>
                          <span>
                            {publication.caption || 'Sem legenda'} · {publication.scheduled_for || '—'}
                          </span>
                        </span>
                        <Badge variant="outline">{publication.status}</Badge>
                      </button>
                    ))}
                  </div>
                ) : null}
                {review.organic.length > 0 ? (
                  <div>
                    <p style={{ margin: '0 0 0.65rem', fontSize: '0.8rem', fontWeight: 650, color: 'var(--cs-accent)' }}>
                      No feed da Meta sem registro no Planeje
                    </p>
                    <div className="client-social-feed-grid">
                      {review.organic.slice(0, 15).map(({ feedItem }) => (
                        <FeedTile
                          key={feedItem.id}
                          item={feedItem}
                          confirmed={false}
                          onOpen={openInsightPost}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {viewTab === 'insights' && selectedId && date?.from && date?.to ? (
              <div style={{ marginTop: '0.9rem' }}>
                {platform === 'instagram' ? (
                  <InstagramInsightsView
                    clientId={clientId}
                    instagramId={selectedId}
                    instagramName={displaySocialAccount(selectedAccount)}
                    dateRange={date}
                    followersFallback={profile?.followers_count ?? null}
                    cacheKey={cacheKey(['insights', 'ig', selectedId, format(date.from, 'yyyy-MM-dd'), format(date.to, 'yyyy-MM-dd')])}
                    getCachedData={readCache}
                    setCachedData={writeCache}
                    onOpenMedia={openInsightPost}
                    liveMeta={liveMeta}
                  />
                ) : (
                  <PageInsightsView
                    pageId={selectedId}
                    pageName={displaySocialAccount(selectedAccount)}
                    dateRange={date}
                    cacheKey={cacheKey(['insights', 'page', selectedId, format(date.from, 'yyyy-MM-dd'), format(date.to, 'yyyy-MM-dd')])}
                    getCachedData={readCache}
                    setCachedData={writeCache}
                    onOpenMedia={openInsightPost}
                    followersFallback={profile?.followers_count ?? profile?.fan_count ?? null}
                    clientId={clientId}
                    showPaid
                    liveMeta={liveMeta}
                  />
                )}
              </div>
            ) : null}
          </>
        )}
      </div>

      <PostMediaInsightsDialog
        open={Boolean(insightPost)}
        onOpenChange={(next) => {
          if (!next) closeInsightPost();
        }}
        item={insightPost}
        platform={platform === 'instagram' ? 'instagram' : 'facebook_page'}
        pageId={platform === 'facebook_page' ? selectedId : ''}
      />
    </div>
  );
};

export default ClientSocialProfile;
