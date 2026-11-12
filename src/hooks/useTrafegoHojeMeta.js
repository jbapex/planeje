import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import {
  fetchAdsetsForCampaigns,
  fetchCampaignsForAccounts,
} from '@/lib/clienteMetaSnapshot';
import { keepCarteiraDoGestor, opsByClientMap } from '@/lib/carteiraGestor';
import { buildHojeAccountBrief, hojePeriods, sortHojeBriefs } from '@/lib/trafegoHoje';
import {
  HOJE_AUTO_REFRESH_MS,
  HOJE_META_TTL_MS,
  getHojeMetaInflight,
  hojeMetaCacheHasRows,
  isHojeCacheFresh,
  readHojeMetaCache,
  setHojeMetaInflight,
  shouldKeepPreviousMeta,
  shouldReuseHojeMetaCache,
  writeHojeMetaCache,
} from '@/lib/trafegoHojeCache';

async function mapPool(items, limit, fn) {
  const ret = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      ret[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, Math.max(items.length, 1)) }, worker));
  return ret;
}

function briefsByClient(rows) {
  const map = {};
  for (const row of rows || []) {
    const id = row?.client?.id;
    if (id) map[id] = row;
  }
  return map;
}

async function loadEntries({ profile, userId } = {}) {
  const [clientsRes, accountsRes, opsRes] = await Promise.all([
    supabase
      .from('clientes')
      .select('id, empresa, limite_meta, objetivo_meta, meta_custo_mensagem, meta_custo_compra, roas_alvo, responsavel, meta_resumo')
      .eq('etapa', 'closed')
      .order('empresa'),
    supabase
      .from('cliente_meta_accounts')
      .select('cliente_id, meta_account_id, meta_account_name, is_active'),
    supabase.from('traffic_client_ops').select('client_id, primary_assignee_id'),
  ]);
  let clientes = clientsRes.data;
  let cErr = clientsRes.error;
  if (cErr && /meta_resumo/i.test(String(cErr.message || ''))) {
    const retry = await supabase
      .from('clientes')
      .select('id, empresa, limite_meta, objetivo_meta, meta_custo_mensagem, meta_custo_compra, roas_alvo, responsavel, entregaveis')
      .eq('etapa', 'closed')
      .order('empresa');
    clientes = retry.data;
    cErr = retry.error;
  }
  if (cErr) throw cErr;
  if (accountsRes.error) throw accountsRes.error;
  if (opsRes.error) throw opsRes.error;
  const accMap = {};
  const anyAcc = new Set();
  for (const row of accountsRes.data || []) {
    anyAcc.add(row.cliente_id);
    if (!row.is_active) continue;
    if (!accMap[row.cliente_id]) accMap[row.cliente_id] = [];
    accMap[row.cliente_id].push(row);
  }
  const opsByClient = opsByClientMap(opsRes.data);
  const scoped = keepCarteiraDoGestor(clientes || [], {
    profile,
    userId,
    opsByClient,
  });
  return scoped
    .map((client) => ({ client, accounts: accMap[client.id] || [] }))
    .filter((entry) => entry.accounts.length || anyAcc.has(entry.client.id) || opsByClient[entry.client.id]);
}

async function briefEntry(entry, period, previous) {
  if (!entry.accounts.length) {
    return {
      brief: buildHojeAccountBrief({
        client: entry.client,
        errorMessage: 'Dados da Meta indisponíveis',
      }),
      kept: false,
    };
  }
  const fetched = await fetchCampaignsForAccounts(entry.accounts, period);
  if (shouldKeepPreviousMeta(fetched, previous)) {
    return { brief: previous, kept: true };
  }
  const adsets = await fetchAdsetsForCampaigns(fetched.campaigns || [], period, entry.accounts);
  return {
    brief: buildHojeAccountBrief({
      client: entry.client,
      campaigns: fetched.campaigns || [],
      adsets,
      errorMessage: fetched.permError ? fetched.errorMessage : null,
    }),
    kept: false,
  };
}

function applyCachedRows(box, setDayRows, setWeekRows, setFetchedAt) {
  if (!box) return;
  if (Array.isArray(box.dayRows)) setDayRows(box.dayRows);
  if (Array.isArray(box.weekRows)) setWeekRows(box.weekRows);
  if (box.fetchedAt) setFetchedAt(box.fetchedAt);
}

export function useTrafegoHojeMeta() {
  const { user, profile } = useAuth();
  const periods = useMemo(() => hojePeriods(), []);
  const profileId = profile?.id;
  const profileRole = profile?.role;
  const initialCache = useMemo(
    () => (user?.id ? readHojeMetaCache(user.id, periods.todayYmd) : null),
    [user?.id, periods.todayYmd]
  );
  const [dayRows, setDayRows] = useState(() => initialCache?.dayRows || []);
  const [weekRows, setWeekRows] = useState(() => initialCache?.weekRows || []);
  const [loading, setLoading] = useState(() => !hojeMetaCacheHasRows(initialCache));
  const [weekLoading, setWeekLoading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [limitWarning, setLimitWarning] = useState('');
  const [fetchedAt, setFetchedAt] = useState(() => initialCache?.fetchedAt || 0);
  const dayRowsRef = useRef(dayRows);
  const weekRowsRef = useRef(weekRows);

  useEffect(() => {
    dayRowsRef.current = dayRows;
  }, [dayRows]);

  useEffect(() => {
    weekRowsRef.current = weekRows;
  }, [weekRows]);

  const reload = useCallback(
    async ({ force = false } = {}) => {
      if (!user?.id) return;
      const cached = readHojeMetaCache(user.id, periods.todayYmd);
      if (hojeMetaCacheHasRows(cached)) {
        applyCachedRows(cached, setDayRows, setWeekRows, setFetchedAt);
        setLoading(false);
        if (!force) setWeekLoading(false);
      }
      if (shouldReuseHojeMetaCache(cached, { force, ttlMs: HOJE_META_TTL_MS })) {
        setLimitWarning('');
        return;
      }

      const inflight = getHojeMetaInflight(user.id, periods.todayYmd);
      if (inflight && !force) {
        try {
          await inflight;
          applyCachedRows(readHojeMetaCache(user.id, periods.todayYmd), setDayRows, setWeekRows, setFetchedAt);
        } catch {
          /* o job já registrou o erro no chamador original */
        }
        setLoading(false);
        setWeekLoading(false);
        return;
      }

      const hadRows = hojeMetaCacheHasRows(cached) || dayRowsRef.current.length > 0;
      if (!hadRows) {
        setLoading(true);
        setWeekLoading(Boolean(periods.week));
      }

      const job = (async () => {
        setError(null);
        const entries = await loadEntries({
          profile: { id: profileId, role: profileRole },
          userId: user.id,
        });
        if (!entries.length) {
          setDayRows([]);
          setWeekRows([]);
          const ts = Date.now();
          setFetchedAt(ts);
          writeHojeMetaCache(user.id, periods.todayYmd, {
            dayRows: [],
            weekRows: [],
            complete: true,
            clientCount: 0,
            fetchedAt: ts,
          });
          return;
        }
        if (!hadRows) setProgress({ done: 0, total: entries.length });

        const prevDay = briefsByClient(dayRowsRef.current.length ? dayRowsRef.current : cached?.dayRows);
        const prevWeek = briefsByClient(weekRowsRef.current.length ? weekRowsRef.current : cached?.weekRows);
        let keptFromLimit = 0;

        const mergeBrief = (setter, ref, brief) => {
          const map = briefsByClient(ref.current);
          if (brief?.client?.id) map[brief.client.id] = brief;
          const next = sortHojeBriefs(Object.values(map));
          ref.current = next;
          setter(next);
        };

        const runPeriod = async (period, previousMap, setter, ref, onEach) => {
          await mapPool(entries, 2, async (entry) => {
            const prev = previousMap[entry.client.id] || null;
            const { brief, kept } = await briefEntry(entry, period, prev);
            if (kept) keptFromLimit += 1;
            mergeBrief(setter, ref, brief);
            onEach?.();
          });
        };

        if (Object.keys(prevDay).length) {
          const seed = sortHojeBriefs(Object.values(prevDay));
          dayRowsRef.current = seed;
          setDayRows(seed);
          setLoading(false);
        }

        let firstDay = !hadRows;
        await runPeriod(periods.today, prevDay, setDayRows, dayRowsRef, () => {
          if (firstDay) {
            firstDay = false;
            setLoading(false);
          }
          if (!hadRows) {
            setProgress({ done: dayRowsRef.current.length, total: entries.length });
          }
        });
        setLoading(false);
        writeHojeMetaCache(user.id, periods.todayYmd, {
          dayRows: dayRowsRef.current || [],
          weekRows: weekRowsRef.current || [],
          complete: false,
          clientCount: entries.length,
        });

        if (periods.week) {
          const weekCacheFresh =
            !force && cached?.weekRows?.length && isHojeCacheFresh(cached.fetchedAt, HOJE_META_TTL_MS);
          if (weekCacheFresh) {
            weekRowsRef.current = cached.weekRows;
            setWeekRows(cached.weekRows);
          } else {
            if (!Object.keys(prevWeek).length) setWeekLoading(true);
            else {
              const seed = sortHojeBriefs(Object.values(prevWeek));
              weekRowsRef.current = seed;
              setWeekRows(seed);
            }
            await runPeriod(periods.week, prevWeek, setWeekRows, weekRowsRef);
          }
        } else {
          weekRowsRef.current = [];
          setWeekRows([]);
        }
        setWeekLoading(false);

        const ts = Date.now();
        setFetchedAt(ts);
        setLimitWarning(
          keptFromLimit
            ? 'A Meta limitou as chamadas. Mostrando a última análise nas contas que não atualizaram.'
            : ''
        );
        writeHojeMetaCache(user.id, periods.todayYmd, {
          dayRows: dayRowsRef.current || [],
          weekRows: weekRowsRef.current || [],
          complete: true,
          clientCount: entries.length,
          fetchedAt: ts,
        });
      })();

      setHojeMetaInflight(user.id, periods.todayYmd, job);
      try {
        await job;
      } catch (e) {
        setError(e?.message || String(e));
      } finally {
        if (getHojeMetaInflight(user.id, periods.todayYmd) === job) {
          setHojeMetaInflight(user.id, periods.todayYmd, null);
        }
        setLoading(false);
        setWeekLoading(false);
        setProgress(null);
      }
    },
    [periods, profileId, profileRole, user?.id]
  );

  useEffect(() => {
    if (!user?.id) return;
    reload({ force: false });
  }, [reload, user?.id]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      reload({ force: false });
    };
    const id = window.setInterval(tick, HOJE_AUTO_REFRESH_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [reload]);

  return {
    periods,
    dayRows,
    weekRows,
    loading,
    weekLoading,
    progress,
    error,
    limitWarning,
    fetchedAt,
    reload: () => reload({ force: true }),
  };
}
