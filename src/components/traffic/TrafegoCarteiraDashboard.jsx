import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Building, Loader2, RefreshCw, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { clientInGestorCarteira, shouldScopeCarteiraToGestor } from '@/lib/carteiraGestor';
import { buildClientTrafficUrl } from '@/lib/clientHubRoutes';
import { formatMoney } from '@/lib/trafegoFila';
import { formatCompactMoney } from '@/lib/carteiraClientes';
import {
  formatMetaSyncedAgo,
  META_RESUMO_STALE_MS,
  refreshClientsMetaResumo,
} from '@/lib/clienteMetaSnapshot';
import {
  DASHBOARD_TAB_TTL_MS,
  isTabCacheFresh,
  readDashboardTabCache,
  writeDashboardTabCache,
} from '@/lib/trafegoTabCache';
import {
  clientHasTrafficSignal,
  computeTrafegoDashboardKpis,
  decorateTrafficAccount,
  rowMatchesTrafegoFocus,
  sortTrafegoDashboardRows,
  spendBarLook,
} from '@/lib/trafegoDashboard';
import { groupGoogleAdsLinksByClient } from '@/lib/googleAdsLinkedAccounts';
import {
  googleAdsMonthRange,
  loadGoogleDashboardForClient,
  mapPool,
  mergeGoogleDashboard,
} from '@/lib/googleAdsDashboard';
import '@/components/clients/Clients.css';
import './CentralTrafego.css';
import './TrafegoHub.css';

function matchesSearch(row, term) {
  if (!term) return true;
  const query = term.toLowerCase();
  const haystack = [row.client.empresa, row.gestorName].join(' ').toLowerCase();
  return haystack.includes(query);
}

const META_LOGO = '/logos/meta%20ads.webp';
const GOOGLE_LOGO = '/logos/google%20ads.png';

function SpendBar({ spend, limite, compact = false, metaKind = 'ok' }) {
  if ((metaKind === 'limited' || metaKind === 'unavailable') && !(Number(spend) > 0)) {
    return (
      <p className="trafego-spend-bar-copy">
        {metaKind === 'limited' ? 'Última leitura limitada pela Meta' : 'Sem leitura da Meta'}
      </p>
    );
  }
  const bar = spendBarLook(spend, limite);
  if (!bar) {
    if (!compact || !spend) return null;
    return <p className="trafego-spend-bar-copy trafego-spend-bar-copy--solo">{formatMoney(spend)}</p>;
  }
  return (
    <div className={`trafego-spend-bar is-${bar.tone}${compact ? ' is-compact' : ''}`}>
      <div
        className="trafego-spend-bar-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={bar.limit}
        aria-valuenow={bar.used}
        aria-label={`Gasto ${formatMoney(bar.used)} de ${formatMoney(bar.limit)}`}
      >
        <span className="trafego-spend-bar-fill" style={{ width: `${bar.fill * 100}%` }} />
      </div>
      <p className="trafego-spend-bar-copy">
        {formatMoney(bar.used)} / {formatMoney(bar.limit)}
        <span> · {bar.pct}%</span>
      </p>
    </div>
  );
}

function GoogleSpendBar({ google }) {
  if (!google) return null;
  if (google.error && !(Number(google.spend) > 0)) {
    return <p className="trafego-spend-bar-copy">Sem leitura do Google</p>;
  }
  if (!Number.isFinite(Number(google.spend))) {
    return <p className="trafego-spend-bar-copy">Google…</p>;
  }
  if (google.unlimited) {
    return (
      <p className="trafego-spend-bar-copy">
        {formatMoney(google.spend || 0)}
        <span> · Ilimitado</span>
      </p>
    );
  }
  return <SpendBar spend={google.spend} limite={google.limite} />;
}

function PlatformSpend({ src, alt, children }) {
  return (
    <div className="trafego-spend-platform">
      <img src={src} alt={alt} title={alt} />
      <div className="trafego-spend-platform-bar">{children}</div>
    </div>
  );
}

function AccountSpend({ row }) {
  const metaBar = <SpendBar spend={row.spend} limite={row.limite} metaKind={row.metaKind} />;
  if (!row.hasGoogle) return metaBar;
  return (
    <div className="trafego-spend-stack">
      <PlatformSpend src={META_LOGO} alt="Meta Ads">
        {metaBar}
      </PlatformSpend>
      <PlatformSpend src={GOOGLE_LOGO} alt="Google Ads">
        <GoogleSpendBar google={row.google} />
      </PlatformSpend>
    </div>
  );
}

function dueChipClass(tone) {
  if (tone === 'overdue') return 'is-overdue';
  if (tone === 'due') return 'is-due';
  if (tone === 'empty') return 'is-empty';
  return 'is-ok';
}

function idSet(rows, key = 'cliente_id') {
  return new Set((rows || []).map((row) => String(row[key] || row.client_id || '')).filter(Boolean));
}

async function safeSelect(promise) {
  const { data, error } = await promise;
  if (error) {
    console.warn('dashboard tráfego', error.message || error);
    return [];
  }
  return data || [];
}

function groupAccounts(accounts) {
  const map = {};
  for (const row of accounts || []) {
    const id = String(row.cliente_id || '');
    if (!id) continue;
    if (!map[id]) map[id] = [];
    map[id].push(row);
  }
  return map;
}

function oldestSyncedAt(rows) {
  let min = null;
  for (const row of rows || []) {
    const t = new Date(row.snapshot?.syncedAt || 0).getTime();
    if (!t) continue;
    if (min == null || t < min) min = t;
  }
  return min ? new Date(min).toISOString() : null;
}

export default function TrafegoCarteiraDashboard() {
  const { user, profile } = useAuth();
  const initialCache = useMemo(() => readDashboardTabCache(user?.id), [user?.id]);
  const [loading, setLoading] = useState(() => !(initialCache?.rows?.length > 0));
  const [metaSyncing, setMetaSyncing] = useState(false);
  const [metaProgress, setMetaProgress] = useState(null);
  const [googleSyncing, setGoogleSyncing] = useState(false);
  const [googleProgress, setGoogleProgress] = useState(null);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState(() => initialCache?.rows || []);
  const [focus, setFocus] = useState('all');
  const [search, setSearch] = useState('');
  const [nowTick, setNowTick] = useState(Date.now());
  const decorateRef = useRef({ tasks: [], opsByClient: {}, usersById: {} });
  const busyRef = useRef(false);
  const rowsRef = useRef(rows);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const applySnapshot = useCallback((clientId, snapshot) => {
    const ctx = decorateRef.current;
    setRows((prev) =>
      prev.map((row) =>
        row.client.id === clientId
          ? decorateTrafficAccount(
              { ...row.client, meta_resumo: snapshot },
              {
                tasks: ctx.tasks,
                ops: ctx.opsByClient[clientId] || null,
                usersById: ctx.usersById,
                google: row.google,
              }
            )
          : row
      )
    );
  }, []);

  const applyGoogle = useCallback((clientId, google) => {
    const ctx = decorateRef.current;
    setRows((prev) =>
      prev.map((row) =>
        row.client.id === clientId
          ? decorateTrafficAccount(row.client, {
              tasks: ctx.tasks,
              ops: ctx.opsByClient[clientId] || null,
              usersById: ctx.usersById,
              google: mergeGoogleDashboard(row.google, google),
            })
          : row
      )
    );
  }, []);

  const load = useCallback(
    async ({ silent = false, force = false } = {}) => {
      if (!user) return;
      if (busyRef.current) return;
      busyRef.current = true;
      setError(null);
      const hasRows = rowsRef.current.length > 0;
      if (!silent || !hasRows) setLoading(true);
      try {
        const clientsQuery = supabase
          .from('clientes')
          .select(
            'id, empresa, logo_urls, etapa, limite_meta, objetivo_meta, meta_custo_mensagem, meta_custo_compra, roas_alvo, meta_resumo, entregaveis, responsavel'
          )
          .eq('etapa', 'closed')
          .order('empresa', { ascending: true });

        const [clients, accounts, campaigns, opsRows, tasks, profiles, googleLinks] = await Promise.all([
          safeSelect(clientsQuery),
          safeSelect(
            supabase
              .from('cliente_meta_accounts')
              .select('cliente_id, meta_account_id, meta_account_name, is_active')
              .eq('is_active', true)
          ),
          safeSelect(supabase.from('paid_campaigns').select('client_id')),
          safeSelect(supabase.from('traffic_client_ops').select('client_id, primary_assignee_id, situation')),
          safeSelect(
            supabase.from('tarefas').select('id, title, status, client_id, due_date, type').eq('type', 'paid_traffic')
          ),
          safeSelect(supabase.from('profiles').select('id, full_name').neq('role', 'cliente')),
          safeSelect(
            supabase
              .from('cliente_google_ads_accounts')
              .select('cliente_id, google_customer_id, google_customer_name')
              .eq('is_active', true)
          ),
        ]);

        const usersById = Object.fromEntries((profiles || []).map((p) => [p.id, p.full_name || '']));
        const opsByClient = Object.fromEntries((opsRows || []).map((row) => [row.client_id, row]));
        const accMap = groupAccounts(accounts);
        const googleMap = groupGoogleAdsLinksByClient(googleLinks);
        decorateRef.current = { tasks, opsByClient, usersById };
        const signals = {
          accountIds: idSet(accounts, 'cliente_id'),
          campaignIds: idSet(campaigns, 'client_id'),
          opsIds: idSet(opsRows, 'client_id'),
          taskClientIds: idSet(tasks, 'client_id'),
          googleIds: new Set(Object.keys(googleMap)),
        };

        const decorated = (clients || [])
          .filter((client) => clientHasTrafficSignal(client.id, signals))
          .filter((client) => {
            if (!shouldScopeCarteiraToGestor(profile)) return true;
            return clientInGestorCarteira(client.id, {
              userId: user.id,
              opsByClient,
              clientResponsavel: client.responsavel,
            });
          })
          .map((client) => {
            const previous = rowsRef.current.find((row) => row.client.id === client.id)?.google || null;
            const linked = Boolean(googleMap[client.id]?.length);
            return decorateTrafficAccount(client, {
              tasks,
              ops: opsByClient[client.id] || null,
              usersById,
              google: linked ? previous || { linked: true } : null,
            });
          });

        setRows(decorated);
        if (!silent || !hasRows) setLoading(false);

        const entries = decorated
          .map((row) => ({
            client: row.client,
            accounts: accMap[row.client.id] || [],
          }))
          .filter((entry) => entry.accounts.length);

        const googleEntries = decorated
          .filter((row) => googleMap[row.client.id]?.length)
          .map((row) => ({
            clientId: row.client.id,
            accounts: googleMap[row.client.id],
          }));

        const jobs = [];
        if (entries.length) {
          setMetaSyncing(true);
          setMetaProgress({ done: 0, total: entries.length });
          jobs.push(
            refreshClientsMetaResumo(entries, {
              force,
              onEach: ({ clientId, snapshot, done, total }) => {
                applySnapshot(clientId, snapshot);
                setMetaProgress({ done, total });
              },
            })
          );
        } else {
          setMetaSyncing(false);
          setMetaProgress(null);
        }

        if (googleEntries.length) {
          setGoogleSyncing(true);
          setGoogleProgress({ done: 0, total: googleEntries.length });
          const range = googleAdsMonthRange();
          jobs.push(
            mapPool(googleEntries, 2, async (entry) => {
              try {
                const next = await loadGoogleDashboardForClient(entry.accounts, range, async (customerId) => {
                  const { data, error: fnError } = await supabase.functions.invoke('google-ads-api', {
                    body: {
                      action: 'get-campaigns',
                      customerId,
                      time_range: { since: range.since, until: range.until },
                    },
                  });
                  if (fnError) throw fnError;
                  if (data?.error?.message) throw new Error(data.error.message);
                  return data;
                });
                applyGoogle(entry.clientId, next);
              } catch (e) {
                applyGoogle(entry.clientId, { linked: true, error: e?.message || String(e) });
              }
              setGoogleProgress((prev) => ({
                done: Math.min((prev?.done || 0) + 1, googleEntries.length),
                total: googleEntries.length,
              }));
            })
          );
        } else {
          setGoogleSyncing(false);
          setGoogleProgress(null);
        }

        if (jobs.length) await Promise.all(jobs);
        setRows((prev) => {
          writeDashboardTabCache(user.id, prev);
          return prev;
        });
      } catch (e) {
        setError(e?.message || String(e));
      } finally {
        busyRef.current = false;
        setMetaSyncing(false);
        setMetaProgress(null);
        setGoogleSyncing(false);
        setGoogleProgress(null);
        setLoading(false);
      }
    },
    [user, profile, applySnapshot, applyGoogle]
  );

  useEffect(() => {
    if (!user?.id) return;
    const cached = readDashboardTabCache(user.id);
    if (cached?.rows?.length && isTabCacheFresh(cached.fetchedAt, DASHBOARD_TAB_TTL_MS)) {
      setRows(cached.rows);
      setLoading(false);
      const googlePending = cached.rows.some(
        (row) => row.hasGoogle && !Number.isFinite(Number(row.google?.spend)) && !row.google?.error
      );
      if (!googlePending) return;
    }
    load({ force: false, silent: Boolean(cached?.rows?.length) });
  }, [load, user?.id]);

  useEffect(() => {
    const tick = setInterval(() => setNowTick(Date.now()), 30000);
    const refresh = () => {
      if (document.visibilityState !== 'visible' || !user?.id) return;
      const cached = readDashboardTabCache(user.id);
      if (cached && isTabCacheFresh(cached.fetchedAt, DASHBOARD_TAB_TTL_MS)) return;
      load({ silent: true, force: false });
    };
    const interval = setInterval(refresh, META_RESUMO_STALE_MS);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(tick);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [load, user?.id]);

  const kpis = useMemo(() => computeTrafegoDashboardKpis(rows), [rows]);
  const syncedLabel = formatMetaSyncedAgo(oldestSyncedAt(rows), nowTick);

  const visible = useMemo(() => {
    const filtered = rows.filter((row) => matchesSearch(row, search.trim()) && rowMatchesTrafegoFocus(row, focus));
    return sortTrafegoDashboardRows(filtered);
  }, [rows, search, focus]);

  const vencendoNomes = useMemo(
    () =>
      sortTrafegoDashboardRows(rows.filter((row) => rowMatchesTrafegoFocus(row, 'vencendo')))
        .map((row) => row.client.empresa)
        .filter(Boolean),
    [rows]
  );

  const toggleFocus = (next) => {
    setFocus((prev) => (prev === next ? 'all' : next));
  };

  if (loading && !rows.length) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[240px] gap-2 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p>Carregando o dashboard de tráfego…</p>
      </div>
    );
  }

  const focusLabel =
    focus === 'noAr'
      ? ' · no ar'
      : focus === 'teto'
        ? ' · acima do teto'
        : focus === 'fora'
          ? ' · fora da meta'
          : focus === 'vencendo'
            ? ' · prazos de tráfego'
            : focus === 'atrasadas'
              ? ' · demandas atrasadas'
              : '';

  return (
    <div className="trafego-carteira">
      <div className="planeje-clients-stats trafego-carteira-stats">
        <div
          className="planeje-clients-stat planeje-clients-stat--spend trafego-carteira-stat-readonly"
          title="Soma de investimento do mês (Meta). Google, se houver, fica na barrinha da conta."
        >
          <p className="planeje-clients-stat-label">Gasto do mês</p>
          <p className="planeje-clients-stat-value trafego-carteira-stat-money">
            {kpis.spend >= 10000 ? formatCompactMoney(kpis.spend) : formatMoney(kpis.spend)}
          </p>
        </div>
        <button
          type="button"
          className={`planeje-clients-stat planeje-clients-stat--active${focus === 'all' ? ' is-active' : ''}`}
          title="Clientes fechados com tráfego"
          onClick={() => setFocus('all')}
        >
          <p className="planeje-clients-stat-label">Contas</p>
          <p className="planeje-clients-stat-value">{kpis.contas}</p>
        </button>
        <button
          type="button"
          className={`planeje-clients-stat planeje-clients-stat--value${focus === 'noAr' ? ' is-active' : ''}`}
          title="Contas veiculando agora"
          onClick={() => toggleFocus('noAr')}
        >
          <p className="planeje-clients-stat-label">No ar</p>
          <p className="planeje-clients-stat-value">{kpis.noAr}</p>
        </button>
        <button
          type="button"
          className={`planeje-clients-stat planeje-clients-stat--due${focus === 'teto' ? ' is-active' : ''}`}
          title="Gasto do mês acima do limite da conta"
          onClick={() => toggleFocus('teto')}
        >
          <p className="planeje-clients-stat-label">Acima do teto</p>
          <p className="planeje-clients-stat-value">{kpis.teto}</p>
        </button>
        <button
          type="button"
          className={`planeje-clients-stat planeje-clients-stat--risk${focus === 'fora' ? ' is-active' : ''}`}
          title="Resultado fora da meta combinada"
          onClick={() => toggleFocus('fora')}
        >
          <p className="planeje-clients-stat-label">Fora da meta</p>
          <p className="planeje-clients-stat-value">{kpis.fora}</p>
        </button>
        <button
          type="button"
          className={`planeje-clients-stat planeje-clients-stat--due${focus === 'vencendo' ? ' is-active' : ''}`}
          title="Demandas nos próximos 7 dias"
          onClick={() => toggleFocus('vencendo')}
        >
          <p className="planeje-clients-stat-label">Vencendo</p>
          <p className="planeje-clients-stat-value">{kpis.vencendo}</p>
        </button>
        <button
          type="button"
          className={`planeje-clients-stat planeje-clients-stat--overdue${focus === 'atrasadas' ? ' is-active' : ''}`}
          title="Demandas de tráfego vencidas"
          onClick={() => toggleFocus('atrasadas')}
        >
          <p className="planeje-clients-stat-label">Atrasadas</p>
          <p className="planeje-clients-stat-value">{kpis.atrasadas}</p>
        </button>
      </div>

      {error ? <p className="central-trafego-error">{error}</p> : null}

      {metaSyncing || googleSyncing ? (
        <p className="central-trafego-alert central-trafego-alert--compact">
          {[
            metaSyncing ? `Meta ${metaProgress?.total ? `${metaProgress.done}/${metaProgress.total}` : '…'}` : '',
            googleSyncing ? `Google ${googleProgress?.total ? `${googleProgress.done}/${googleProgress.total}` : '…'}` : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      ) : null}

      {focus === 'all' && vencendoNomes.length > 0 ? (
        <p className="central-trafego-alert central-trafego-alert--compact">
          {vencendoNomes.length} prazo{vencendoNomes.length === 1 ? '' : 's'} perto:{' '}
          {vencendoNomes.slice(0, 4).join(', ')}
          {vencendoNomes.length > 4 ? ` +${vencendoNomes.length - 4}` : ''}
        </p>
      ) : null}

      <div className="trafego-carteira-toolbar">
        <p className="trafego-carteira-copy">
          {visible.length} {visible.length === 1 ? 'conta de tráfego' : 'contas de tráfego'}
          {focusLabel}
          {syncedLabel && !metaSyncing && !googleSyncing ? ` · Meta ${syncedLabel}` : ''}
        </p>
        <div className="trafego-carteira-toolbar-actions">
          <div className="trafego-carteira-search">
            <Search className="h-4 w-4" />
            <input
              type="search"
              placeholder="Buscar conta…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button size="sm" variant="secondary" onClick={() => load({ silent: true, force: true })} disabled={metaSyncing || googleSyncing}>
            {metaSyncing || googleSyncing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Atualizar
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="central-trafego-empty">
          <h3>{search.trim() || focus !== 'all' ? 'Nenhuma conta neste recorte' : 'Nenhuma conta de tráfego fechada'}</h3>
          <p>Entram clientes fechados com conta Meta, Google Ads vinculado, campanha paga, demanda ou ficha operacional de tráfego.</p>
        </div>
      ) : (
        <ul className="trafego-carteira-list">
          {visible.map((row) => {
            const logo = row.client.logo_urls?.[0] || null;
            const ago = formatMetaSyncedAgo(row.snapshot?.syncedAt, nowTick);
            return (
              <li key={row.client.id}>
                <Link className={`trafego-carteira-row tone-${row.tone}`} to={buildClientTrafficUrl(row.client.id)}>
                  <Avatar className="h-10 w-10 rounded-xl flex-shrink-0">
                    <AvatarImage src={logo} alt="" className="object-cover" />
                    <AvatarFallback className="rounded-xl bg-slate-100 text-slate-500">
                      <Building size={16} />
                    </AvatarFallback>
                  </Avatar>
                  <div className="trafego-carteira-row-main">
                    <p className="trafego-carteira-name">{row.client.empresa || 'Sem nome'}</p>
                    {row.gestorName ? <p className="trafego-carteira-gestor">{row.gestorName}</p> : null}
                    <AccountSpend row={row} />
                  </div>
                  <div className="trafego-carteira-due">
                    <span
                      className={`trafego-carteira-chip ${dueChipClass(row.tone)}`}
                      title={
                        row.openTasks.length
                          ? `${row.openTasks.length} demanda${row.openTasks.length === 1 ? '' : 's'} aberta${row.openTasks.length === 1 ? '' : 's'}`
                          : row.noAr
                            ? `${row.activeCount} campanha${row.activeCount === 1 ? '' : 's'} veiculando`
                            : ago
                              ? `Nada veiculando · Meta ${ago}`
                              : 'Nada veiculando'
                      }
                    >
                      {row.chip}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
