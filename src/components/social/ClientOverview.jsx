import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Building2,
  Eye,
  Facebook,
  Heart,
  Instagram,
  Loader2,
  Search,
  Users,
} from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { rewritePublicStorageUrl } from '@/lib/publicStorageUrl';
import {
  accountsByPlatform,
  displaySocialAccount,
  fetchClientsSocialAccountsMap,
} from '@/lib/clienteSocialAccounts';
import InstagramInsightsView from './InstagramInsightsView';
import PageInsightsView from './PageInsightsView';
import PaidTrafficPanel from './PaidTrafficPanel';
import { overviewMetaBanner } from '@/lib/metaConnectionStatus';
import {
  formatSnapshotUpdatedAt,
  mergeSnapshot,
  planOverviewRefresh,
  readSnapshotData,
  shouldReplaceSnapshot,
  SOCIAL_SNAPSHOT_PREFIX,
  writeSnapshotEntry,
} from '@/lib/socialSnapshotCache';

const SNAPSHOT_CACHE = SOCIAL_SNAPSHOT_PREFIX;

function formatCompact(value) {
  const num = typeof value === 'number' ? value : parseFloat(value);
  if (!Number.isFinite(num)) return '—';
  if (num >= 1000) {
    return new Intl.NumberFormat('pt-BR', {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(num).toLowerCase();
  }
  return new Intl.NumberFormat('pt-BR').format(num);
}

function insightValue(row) {
  if (row?.total_value && typeof row.total_value === 'object' && row.total_value.value != null) {
    return Number(row.total_value.value) || 0;
  }
  if (Array.isArray(row?.values) && row.values.length) {
    return row.values.reduce((sum, entry) => sum + (Number(entry?.value) || 0), 0);
  }
  return Number(row?.value) || 0;
}

function readSnapshot(key) {
  return readSnapshotData(key);
}

function writeSnapshot(key, data) {
  writeSnapshotEntry(key, data);
}

function clientLogo(client) {
  return rewritePublicStorageUrl(client?.logo_urls?.[0] || '');
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'C';
  return ((parts[0][0] || '') + (parts[1]?.[0] || '')).toUpperCase();
}

async function loadInstagramChannel(ig, timeRange) {
  const channel = {
    platform: 'instagram',
    handle: displaySocialAccount(ig),
    photo: ig.profile_picture_url || '',
    followers: null,
    reach: null,
    engagement: null,
  };
  const [profileRes, insightsRes] = await Promise.all([
    supabase.functions.invoke('meta-ads-api', {
      body: { action: 'get-instagram-profile', instagram_account_id: ig.meta_id },
    }),
    supabase.functions.invoke('meta-ads-api', {
      body: {
        action: 'get-instagram-insights',
        instagram_account_id: ig.meta_id,
        time_range: timeRange,
        metrics: ['reach', 'profile_views', 'total_interactions', 'accounts_engaged'],
      },
    }),
  ]);
  if ((profileRes.error || profileRes.data?.error) && (insightsRes.error || insightsRes.data?.error)) {
    throw new Error(profileRes.data?.error?.message || insightsRes.data?.error?.message || 'Meta indisponível');
  }
  const profile = profileRes.data?.profile;
  if (profile) {
    channel.photo = profile.profile_picture_url || channel.photo;
    channel.followers = Number(profile.followers_count) || channel.followers;
    channel.handle = profile.username
      ? `@${String(profile.username).replace(/^@/, '')}`
      : channel.handle;
  }
  for (const insight of insightsRes.data?.insights || []) {
    const value = insightValue(insight);
    if (insight.name === 'reach') channel.reach = value;
    if (insight.name === 'total_interactions') channel.engagement = value;
    if (insight.name === 'followers_current' && value) channel.followers = value;
  }
  return channel;
}

async function loadFacebookChannel(page, timeRange) {
  const channel = {
    platform: 'facebook_page',
    handle: displaySocialAccount(page),
    photo: page.profile_picture_url || '',
    followers: null,
    reach: null,
    engagement: null,
  };
  const [profileRes, insightsRes] = await Promise.all([
    supabase.functions.invoke('meta-ads-api', {
      body: { action: 'get-page-profile', page_id: page.meta_id },
    }),
    supabase.functions.invoke('meta-ads-api', {
      body: { action: 'get-page-insights', page_id: page.meta_id, time_range: timeRange },
    }),
  ]);
  if ((profileRes.error || profileRes.data?.error) && (insightsRes.error || insightsRes.data?.error)) {
    throw new Error(profileRes.data?.error?.message || insightsRes.data?.error?.message || 'Meta indisponível');
  }
  const profile = profileRes.data?.profile;
  if (profile) {
    channel.photo = profile.profile_picture_url || profile.picture || channel.photo;
    channel.followers = Number(profile.followers_count || profile.fan_count) || channel.followers;
    channel.handle = profile.name || channel.handle;
  }
  for (const insight of insightsRes.data?.insights || []) {
    const value = insightValue(insight);
    if (insight.name === 'page_total_media_view_unique' || insight.name === 'page_reach') {
      channel.reach = value;
    }
    if (insight.name === 'page_post_engagements') channel.engagement = value;
    if (insight.name === 'page_follows' && value) channel.followers = value;
  }
  return channel;
}

async function loadClientSnapshot(client, accounts) {
  const { instagram, pages } = accountsByPlatform(accounts);
  const until = format(new Date(), 'yyyy-MM-dd');
  const since = format(subDays(new Date(), 30), 'yyyy-MM-dd');
  const timeRange = { since, until };
  const jobs = [];
  if (instagram[0]) jobs.push(loadInstagramChannel(instagram[0], timeRange));
  if (pages[0]) jobs.push(loadFacebookChannel(pages[0], timeRange));
  const settled = await Promise.allSettled(jobs);
  const channels = settled.filter((row) => row.status === 'fulfilled').map((row) => row.value).filter(Boolean);
  if (!channels.length && jobs.length) {
    const firstError = settled.find((row) => row.status === 'rejected');
    throw firstError?.reason || new Error('Meta indisponível');
  }
  const primary = channels[0] || {};
  return {
    handle: primary.handle || '',
    photo: primary.photo || '',
    followers: primary.followers ?? null,
    reach: primary.reach ?? null,
    engagement: primary.engagement ?? null,
    platform: primary.platform || (instagram[0] ? 'instagram' : 'facebook_page'),
    channels,
  };
}

const ClientOverview = ({
  selectedClientId,
  clients = [],
  publications = [],
  metaConnected = false,
  metaConnectionStatus = 'disconnected',
  onSelectClient,
  onOpenProfileFeed,
}) => {
  const [accountsMap, setAccountsMap] = useState(new Map());
  const [snapshots, setSnapshots] = useState({});
  const [query, setQuery] = useState('');
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);
  const [reportChannel, setReportChannel] = useState('all');
  const [accountsError, setAccountsError] = useState(false);
  const snapshotsRef = useRef(snapshots);
  snapshotsRef.current = snapshots;

  const linkedClients = useMemo(() => {
    return (clients || [])
      .filter((client) => (accountsMap.get(client.id) || []).length > 0)
      .sort((a, b) => String(a.empresa || '').localeCompare(String(b.empresa || ''), 'pt-BR'));
  }, [clients, accountsMap]);

  const selectedClient = useMemo(
    () => (selectedClientId === 'all' ? null : (clients || []).find((c) => c.id === selectedClientId) || null),
    [clients, selectedClientId]
  );

  const selectedAccounts = selectedClient ? accountsMap.get(selectedClient.id) || [] : [];
  const selectedByPlatform = accountsByPlatform(selectedAccounts);
  const reportIg = selectedByPlatform.instagram[0] || null;
  const reportPage = selectedByPlatform.pages[0] || null;
  const hasBothChannels = Boolean(reportIg && reportPage);
  const showIgReport = Boolean(reportIg && (reportChannel === 'all' || reportChannel === 'instagram'));
  const showPageReport = Boolean(reportPage && (reportChannel === 'all' || reportChannel === 'facebook'));

  const dateRange = useMemo(() => {
    const to = new Date();
    to.setHours(23, 59, 59, 999);
    const from = subDays(to, 30);
    from.setHours(0, 0, 0, 0);
    return { from, to };
  }, []);

  const periodLabel = `${format(dateRange.from, 'dd/MM', { locale: ptBR })}–${format(dateRange.to, 'dd/MM', { locale: ptBR })}`;

  const filteredLinked = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return linkedClients;
    return linkedClients.filter((client) => {
      const accounts = accountsMap.get(client.id) || [];
      const hay = [
        client.empresa,
        ...accounts.map((row) => `${row.username || ''} ${row.display_name || ''}`),
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [linkedClients, accountsMap, query]);

  const latestUpdatedAt = useMemo(() => {
    const rows = selectedClient ? [snapshots[selectedClient.id]] : filteredLinked.map((client) => snapshots[client.id]);
    return rows.reduce((max, row) => Math.max(max, Number(row?.updatedAt) || 0), 0);
  }, [filteredLinked, selectedClient, snapshots]);
  const updatedLabel = formatSnapshotUpdatedAt(latestUpdatedAt);

  useEffect(() => {
    setReportChannel('all');
  }, [selectedClient?.id]);

  const pendingForClient = useMemo(() => {
    if (!selectedClient) return 0;
    return (publications || []).filter((pub) => {
      if (pub.task?.client_id !== selectedClient.id) return false;
      const status = String(pub.status || '').toLowerCase();
      return ['pending', 'failed', 'scheduled'].includes(status);
    }).length;
  }, [publications, selectedClient]);

  const clientIdsKey = (clients || []).map((client) => client.id).join(',');

  useEffect(() => {
    const ids = clientIdsKey ? clientIdsKey.split(',') : [];
    if (!ids.length) {
      setAccountsMap(new Map());
      setLoadingAccounts(false);
      setAccountsError(false);
      return undefined;
    }
    let active = true;
    setLoadingAccounts(true);
    setAccountsError(false);
    fetchClientsSocialAccountsMap(supabase, ids)
      .then((map) => {
        if (active) setAccountsMap(map);
      })
      .catch(() => {
        if (active) {
          setAccountsMap(new Map());
          setAccountsError(true);
        }
      })
      .finally(() => {
        if (active) setLoadingAccounts(false);
      });
    return () => { active = false; };
  }, [clientIdsKey]);

  const loadSnapshots = useCallback(async (force = false) => {
    const ids = linkedClients.map((client) => client.id);
    const plan = planOverviewRefresh({
      clientIds: ids,
      current: snapshotsRef.current,
      liveMeta: metaConnected,
      force,
    });
    setSnapshots((prev) => (
      Object.keys(plan.snapshots).length ? plan.snapshots : prev
    ));
    if (!plan.toFetch.length) return;
    setLoadingSnapshots(true);
    const queue = plan.toFetch
      .slice(0, 8)
      .map((id) => linkedClients.find((client) => client.id === id))
      .filter(Boolean);
    const workers = 3;
    let cursor = 0;
    const runWorker = async () => {
      while (cursor < queue.length) {
        const index = cursor;
        cursor += 1;
        const client = queue[index];
        try {
          const incoming = await loadClientSnapshot(client, accountsMap.get(client.id) || []);
          const previous = snapshotsRef.current[client.id];
          const merged = mergeSnapshot(previous, incoming, Date.now());
          if (!shouldReplaceSnapshot(previous, merged)) continue;
          writeSnapshotEntry(`${SNAPSHOT_CACHE}${client.id}`, merged);
          setSnapshots((prev) => ({ ...prev, [client.id]: merged }));
        } catch {
          // Conserva a última verificação.
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(workers, queue.length) }, () => runWorker()));
    setLoadingSnapshots(false);
  }, [accountsMap, linkedClients, metaConnected]);

  useEffect(() => {
    if (loadingAccounts) return;
    void loadSnapshots(false);
  }, [loadingAccounts, loadSnapshots]);

  const openClient = (clientId) => {
    onSelectClient?.(clientId);
  };

  const metaBanner = overviewMetaBanner(metaConnectionStatus);

  if (loadingAccounts) {
    return (
      <div className="social-ws-shell social-ov-loading">
        <Loader2 className="h-5 w-5 animate-spin" />
        Carregando contas vinculadas…
      </div>
    );
  }

  if (selectedClient && selectedAccounts.length) {
    const snapshot = snapshots[selectedClient.id];
    const photo = snapshot?.photo || reportIg?.profile_picture_url || reportPage?.profile_picture_url || clientLogo(selectedClient);
    const handle = showPageReport && !showIgReport
      ? displaySocialAccount(reportPage)
      : showIgReport && !showPageReport
        ? displaySocialAccount(reportIg)
        : [
            reportIg ? displaySocialAccount(reportIg) : null,
            reportPage ? displaySocialAccount(reportPage) : null,
          ].filter(Boolean).join(' · ') || snapshot?.handle;
    return (
      <div className="social-ws-shell social-ov-report">
        <header className="social-ov-report-head">
          <button type="button" className="social-ov-back" onClick={() => onSelectClient?.('all')}>
            Todas as contas
          </button>
          <div className="social-ov-report-brand">
            <span className="social-ov-avatar is-lg">
              {photo ? <img src={photo} alt="" /> : <em>{initials(selectedClient.empresa)}</em>}
            </span>
            <div>
              <p className="social-ov-kicker">Conta vinculada · {periodLabel}</p>
              <h2>{selectedClient.empresa}</h2>
              <p>{handle || 'Instagram / Facebook ligados'}</p>
              {updatedLabel ? <p className="social-ov-updated">{updatedLabel}</p> : null}
            </div>
          </div>
          <button
            type="button"
            className="social-ov-btn is-accent"
            onClick={() => onOpenProfileFeed?.(selectedClient.id, reportChannel === 'facebook' ? 'facebook' : 'instagram')}
          >
            <Building2 className="h-4 w-4" />
            Ver perfil e feed
          </button>
        </header>

        {hasBothChannels ? (
          <div className="social-ov-filter" role="tablist" aria-label="Canal">
            <button
              type="button"
              role="tab"
              aria-selected={reportChannel === 'all'}
              className={`social-ov-filter-btn ${reportChannel === 'all' ? 'is-active' : ''}`}
              onClick={() => setReportChannel('all')}
            >
              Todos
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={reportChannel === 'instagram'}
              className={`social-ov-filter-btn ${reportChannel === 'instagram' ? 'is-active' : ''}`}
              onClick={() => setReportChannel('instagram')}
            >
              <Instagram className="h-4 w-4" />
              Instagram
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={reportChannel === 'facebook'}
              className={`social-ov-filter-btn ${reportChannel === 'facebook' ? 'is-active' : ''}`}
              onClick={() => setReportChannel('facebook')}
            >
              <Facebook className="h-4 w-4" />
              Facebook
            </button>
          </div>
        ) : null}

        {showIgReport ? (
          <section className="social-ov-channel">
            <h3 className="social-ov-channel-head">
              <Instagram className="h-4 w-4" />
              Instagram
              <span>{displaySocialAccount(reportIg)}</span>
            </h3>
            <InstagramInsightsView
              clientId={selectedClient.id}
              instagramId={reportIg.meta_id}
              instagramName={displaySocialAccount(reportIg)}
              dateRange={dateRange}
              cacheKey={`planner_${selectedClient.id}_${reportIg.meta_id}_${periodLabel}`}
              getCachedData={readSnapshot}
              setCachedData={writeSnapshot}
              followersFallback={snapshot?.channels?.find((row) => row.platform === 'instagram')?.followers ?? snapshot?.followers}
              showPaid={false}
              liveMeta={metaConnected}
            />
          </section>
        ) : null}

        {showPageReport ? (
          <section className="social-ov-channel">
            <h3 className="social-ov-channel-head">
              <Facebook className="h-4 w-4" />
              Facebook
              <span>{displaySocialAccount(reportPage)}</span>
            </h3>
            <PageInsightsView
              pageId={reportPage.meta_id}
              pageName={displaySocialAccount(reportPage)}
              dateRange={dateRange}
              cacheKey={`planner_page_${selectedClient.id}_${reportPage.meta_id}_${periodLabel}`}
              getCachedData={readSnapshot}
              setCachedData={writeSnapshot}
              followersFallback={snapshot?.channels?.find((row) => row.platform === 'facebook_page')?.followers}
              clientId={selectedClient.id}
              showPaid={false}
              liveMeta={metaConnected}
            />
          </section>
        ) : null}

        {!reportIg && !reportPage ? (
          <p className="social-ws-empty">Esta conta ainda não tem Instagram ou página para relatório.</p>
        ) : typeof PaidTrafficPanel === 'function' ? (
          <PaidTrafficPanel clientId={selectedClient.id} dateRange={dateRange} />
        ) : null}

        {pendingForClient > 0 ? (
          <p className="social-ov-foot">Há publicações deste cliente nas filas A publicar / Agendados.</p>
        ) : null}
      </div>
    );
  }

  if (selectedClient && !selectedAccounts.length) {
    return (
      <div className="social-ws-shell">
        <p className="social-ws-empty">
          {selectedClient.empresa} ainda não tem Instagram ou página vinculados.
          <button type="button" className="social-ov-link" style={{ marginLeft: '0.6rem' }} onClick={() => onSelectClient?.('all')}>
            Ver contas ligadas
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="social-ws-shell">
      <header className="social-ov-intro">
        {updatedLabel ? <p className="social-ov-updated">{updatedLabel}</p> : <span />}
        {loadingSnapshots ? (
          <span className="social-ov-btn is-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Atualizando números
          </span>
        ) : (
          <button type="button" className="social-ov-btn" onClick={() => void loadSnapshots(true)}>
            Atualizar métricas
          </button>
        )}
      </header>

      <label className="social-ov-search">
        <Search className="h-4 w-4" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar cliente ou @conta"
        />
      </label>

      {metaBanner ? (
        <p className="social-ws-empty" style={{ marginBottom: '0.85rem' }}>
          {metaBanner}
        </p>
      ) : null}

      {filteredLinked.length ? (
        <div className="social-ov-cards">
          {filteredLinked.map((client) => {
            const accounts = accountsMap.get(client.id) || [];
            const { instagram, pages } = accountsByPlatform(accounts);
            const snapshot = snapshots[client.id] || {};
            const photo = snapshot.photo || instagram[0]?.profile_picture_url || pages[0]?.profile_picture_url || clientLogo(client);
            const channels = snapshot.channels?.length
              ? snapshot.channels
              : [
                  instagram[0] && { platform: 'instagram', handle: displaySocialAccount(instagram[0]), followers: snapshot.platform !== 'facebook_page' ? snapshot.followers : null, reach: snapshot.platform !== 'facebook_page' ? snapshot.reach : null, engagement: snapshot.platform !== 'facebook_page' ? snapshot.engagement : null },
                  pages[0] && { platform: 'facebook_page', handle: displaySocialAccount(pages[0]), followers: snapshot.platform === 'facebook_page' ? snapshot.followers : null, reach: snapshot.platform === 'facebook_page' ? snapshot.reach : null, engagement: snapshot.platform === 'facebook_page' ? snapshot.engagement : null },
                ].filter(Boolean);
            return (
              <article key={client.id} className="social-ov-card">
                <div className="social-ov-card-top">
                  <span className="social-ov-avatar">
                    {photo ? <img src={photo} alt="" /> : <em>{initials(client.empresa)}</em>}
                  </span>
                  <div>
                    <h3>{client.empresa}</h3>
                    {formatSnapshotUpdatedAt(snapshot.updatedAt) ? (
                      <p className="social-ov-card-updated">{formatSnapshotUpdatedAt(snapshot.updatedAt)}</p>
                    ) : null}
                    <div className="social-ov-flags">
                      {instagram.length ? <span><Instagram className="h-3 w-3" /> IG</span> : null}
                      {pages.length ? <span><Facebook className="h-3 w-3" /> FB</span> : null}
                    </div>
                  </div>
                </div>
                <div className="social-ov-card-channels">
                  {channels.map((channel) => (
                    <div key={channel.platform} className="social-ov-card-channel">
                      <p>
                        {channel.platform === 'instagram' ? <Instagram className="h-3 w-3" /> : <Facebook className="h-3 w-3" />}
                        {channel.handle || (channel.platform === 'instagram' ? 'Instagram' : 'Facebook')}
                      </p>
                      <dl className="social-ov-metrics">
                        <div>
                          <dt><Users className="h-3 w-3" /> Seguidores</dt>
                          <dd>{formatCompact(channel.followers)}</dd>
                        </div>
                        <div>
                          <dt><Eye className="h-3 w-3" /> {channel.platform === 'facebook_page' ? 'Visualizadores' : 'Alcance'}</dt>
                          <dd>{formatCompact(channel.reach)}</dd>
                        </div>
                        <div>
                          <dt><Heart className="h-3 w-3" /> Engajamento</dt>
                          <dd>{formatCompact(channel.engagement)}</dd>
                        </div>
                      </dl>
                    </div>
                  ))}
                </div>
                <div className="social-ov-card-actions">
                  <button type="button" className="social-ov-btn is-accent" onClick={() => openClient(client.id)}>
                    Ver relatório
                  </button>
                  <button
                    type="button"
                    className="social-ov-btn"
                    onClick={() => onOpenProfileFeed?.(client.id)}
                  >
                    Ver perfil
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="social-ws-empty">
          {query
            ? 'Nenhuma conta vinculada combina com a busca.'
            : accountsError
              ? 'Não foi possível listar as contas ligadas. Recarregue a Visão Geral.'
              : 'Nenhum cliente tem Instagram ou página ligados ainda. Ligue no cadastro do cliente.'}
        </p>
      )}
    </div>
  );
};

export default ClientOverview;
