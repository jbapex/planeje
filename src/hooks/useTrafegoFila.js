import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { keepCarteiraDoGestor, opsByClientMap } from '@/lib/carteiraGestor';
import {
  assignRodizioSlot,
  clientHealth,
  daysSince,
  isRodizioToday,
  parseTrafegoDiario,
  weekMonday,
  weekdaySlot,
  BLOQUEIO_LABEL,
  DIARY_START,
} from '@/lib/trafegoFila';
import { loadClienteGrupos } from '@/lib/clienteWhatsappGrupo';
import {
  isMetaSnapshotStale,
  metricsFromSnapshot,
  readClienteMetaResumo,
  syncClienteMetaResumo,
} from '@/lib/clienteMetaSnapshot';
import {
  FILA_PORTFOLIO_TTL_MS,
  isTabCacheFresh,
  readFilaPortfolioCache,
  writeFilaPortfolioCache,
} from '@/lib/trafegoTabCache';
import { clientVisibleInPainel } from '@/lib/trafegoPainelHref';

const INSIGHTS_CONCURRENCY = 2;

async function mapPool(items, limit, fn) {
  const ret = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      ret[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return ret;
}

export function useTrafegoFila({ skipMetrics = false } = {}) {
  const { user, profile } = useAuth();
  const initialCache = readFilaPortfolioCache(user?.id);
  const [loading, setLoading] = useState(() => !(initialCache?.clients?.length > 0));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [clients, setClients] = useState(() => initialCache?.clients || []);
  const [accountsByClient, setAccountsByClient] = useState(() => initialCache?.accountsByClient || {});
  const [diariesByClient, setDiariesByClient] = useState(() => initialCache?.diariesByClient || {});
  const [metricsByClient, setMetricsByClient] = useState(() => initialCache?.metricsByClient || {});
  const [snapshotsByClient, setSnapshotsByClient] = useState(() => initialCache?.snapshotsByClient || {});
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [openTasks, setOpenTasks] = useState(() => initialCache?.openTasks || []);
  const [gruposByClient, setGruposByClient] = useState(() => initialCache?.gruposByClient || {});

  const loadCore = useCallback(async () => {
    setError(null);
    const [
      clientesRes,
      { data: contas, error: aErr },
      { data: obs, error: oErr },
      { data: tasks, error: tErr },
      { data: opsRows, error: opsErr },
    ] = await Promise.all([
      supabase
        .from('clientes')
        .select('id, empresa, etapa, objetivo_meta, meta_custo_mensagem, meta_custo_compra, roas_alvo, limite_meta, meta_resumo, responsavel')
        .eq('etapa', 'closed')
        .order('empresa', { ascending: true }),
      supabase
        .from('cliente_meta_accounts')
        .select('cliente_id, meta_account_id, meta_account_name, is_active'),
      supabase
        .from('cliente_meta_observations')
        .select('id, cliente_id, user_id, observation, created_at, profiles(full_name)')
        .like('observation', `%${DIARY_START}%`)
        .order('created_at', { ascending: false })
        .limit(400),
      supabase.from('tarefas').select('id, title, status, client_id, type, due_date, assignee_ids').eq('type', 'paid_traffic'),
      supabase.from('traffic_client_ops').select('client_id, primary_assignee_id'),
    ]);

    let clientes = clientesRes.data;
    let cErr = clientesRes.error;
    if (cErr && /meta_resumo/i.test(String(cErr.message || ''))) {
      const retry = await supabase
        .from('clientes')
        .select('id, empresa, etapa, objetivo_meta, meta_custo_mensagem, meta_custo_compra, roas_alvo, limite_meta, entregaveis, responsavel')
        .eq('etapa', 'closed')
        .order('empresa', { ascending: true });
      clientes = retry.data;
      cErr = retry.error;
    }

    if (cErr) throw cErr;
    if (aErr) throw aErr;
    if (opsErr) throw opsErr;

    const accMap = {};
    const anyCount = {};
    for (const row of contas || []) {
      anyCount[row.cliente_id] = (anyCount[row.cliente_id] || 0) + 1;
      if (!row.is_active) continue;
      if (!accMap[row.cliente_id]) accMap[row.cliente_id] = [];
      accMap[row.cliente_id].push(row);
    }

    const opsMap = opsByClientMap(opsRows);
    const scoped = keepCarteiraDoGestor(clientes || [], {
      profile,
      userId: user?.id,
      opsByClient: opsMap,
    });
    const filteredTasks = (tasks || []).filter((t) => {
      const s = String(t.status || '').toLowerCase();
      return s !== 'published' && s !== 'done' && s !== 'concluida' && s !== 'completed';
    });
    const taskClientIds = new Set(filteredTasks.map((t) => t.client_id).filter(Boolean));
    const withAccount = scoped.filter((c) =>
      clientVisibleInPainel({
        activeCount: (accMap[c.id] || []).length,
        anyCount: anyCount[c.id] || 0,
        hasOps: Boolean(opsMap[c.id]),
      }) || taskClientIds.has(c.id)
    );

    const snaps = {};
    const mets = {};
    for (const client of withAccount) {
      const snap = readClienteMetaResumo(client);
      if (snap) {
        snaps[client.id] = snap;
        mets[client.id] = metricsFromSnapshot(snap);
      }
    }
    setSnapshotsByClient(snaps);
    setMetricsByClient(mets);

    const diaryMap = {};
    for (const row of obs || []) {
      if (diaryMap[row.cliente_id]) continue;
      const parsed = parseTrafegoDiario(row.observation, row.created_at, row.profiles?.full_name);
      if (parsed.kind !== 'diario') continue;
      diaryMap[row.cliente_id] = parsed;
    }

    setClients(withAccount);
    setAccountsByClient(accMap);
    setDiariesByClient(diaryMap);
    setOpenTasks(filteredTasks);
    let grupos = {};
    try {
      grupos = await loadClienteGrupos(withAccount.map((c) => c.id));
      setGruposByClient(grupos);
    } catch (e) {
      console.warn('grupos WhatsApp', e);
      setGruposByClient({});
    }
    writeFilaPortfolioCache(user?.id, {
      clients: withAccount,
      accountsByClient: accMap,
      diariesByClient: diaryMap,
      metricsByClient: mets,
      snapshotsByClient: snaps,
      openTasks: filteredTasks,
      gruposByClient: grupos,
    });
    if (oErr) console.warn('observações', oErr);
    if (tErr) console.warn('tarefas', tErr);
    return { withAccount, accMap };
  }, [profile, user?.id]);

  const loadMetrics = useCallback(async (withAccount, accMap, { force = false } = {}) => {
    setMetricsLoading(true);
    try {
      const nextSnaps = {};
      const nextMets = {};
      await mapPool(withAccount, INSIGHTS_CONCURRENCY, async (client) => {
        const accounts = accMap[client.id] || [];
        if (!accounts.length) {
          const cached = readClienteMetaResumo(client) || {
            permError: true,
            errorMessage: 'Dados da Meta indisponíveis',
            spend: 0,
            activeCount: 0,
          };
          nextSnaps[client.id] = cached;
          nextMets[client.id] = metricsFromSnapshot(cached);
          return;
        }
        const cached = readClienteMetaResumo(client);
        if (!force && cached && !isMetaSnapshotStale(cached)) {
          nextSnaps[client.id] = cached;
          nextMets[client.id] = metricsFromSnapshot(cached);
          return;
        }
        const snapshot = await syncClienteMetaResumo(client.id, accMap[client.id] || [], { previous: cached });
        nextSnaps[client.id] = snapshot;
        nextMets[client.id] = metricsFromSnapshot(snapshot);
        setSnapshotsByClient((prev) => ({ ...prev, [client.id]: snapshot }));
        setMetricsByClient((prev) => ({ ...prev, [client.id]: metricsFromSnapshot(snapshot) }));
      });
      setSnapshotsByClient((prev) => ({ ...prev, ...nextSnaps }));
      setMetricsByClient((prev) => ({ ...prev, ...nextMets }));
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  const reload = useCallback(async () => {
    setRefreshing(true);
    try {
      const core = await loadCore();
      if (!skipMetrics) {
        await loadMetrics(core.withAccount, core.accMap, { force: true });
      }
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setRefreshing(false);
    }
  }, [loadCore, loadMetrics, skipMetrics]);

  useEffect(() => {
    let cancelled = false;
    const cached = readFilaPortfolioCache(user?.id);
    if (cached?.clients?.length && isTabCacheFresh(cached.fetchedAt, FILA_PORTFOLIO_TTL_MS)) {
      setLoading(false);
      return undefined;
    }
    (async () => {
      if (!cached?.clients?.length) setLoading(true);
      try {
        const core = await loadCore();
        if (cancelled) return;
        setLoading(false);
        if (!skipMetrics) {
          await loadMetrics(core.withAccount, core.accMap);
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || String(e));
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadCore, loadMetrics, skipMetrics, user?.id]);

  const sortedIds = useMemo(() => clients.map((c) => c.id), [clients]);
  const now = useMemo(() => new Date(), [clients, diariesByClient]);
  const monday = useMemo(() => weekMonday(now), [now]);
  const slot = weekdaySlot(now);

  const rows = useMemo(() => {
    return clients.map((client) => {
      const diary = diariesByClient[client.id] || null;
      const metrics = metricsByClient[client.id];
      const health = clientHealth(client, metrics);
      const lastAt = diary?.createdAt || null;
      const days = daysSince(lastAt, now);
      const bloqueio = diary?.bloqueio || '';
      const clientTasks = (openTasks || []).filter((t) => t.client_id === client.id);
      const taskStuck = clientTasks.length > 0;
      const isBlocked = Boolean(bloqueio) || taskStuck;
      const missedWeek = !lastAt || new Date(lastAt) < monday;
      const rodizio = isRodizioToday(sortedIds, client.id, now);
      const metricsReady = metrics !== undefined;
      const stale = days != null && days >= 7;
      const urgente = (metricsReady && health.status === 'critico') || stale;
      const semGrupo = !gruposByClient[client.id];
      const reasons = [];
      if (urgente && health.status === 'critico') reasons.push('Resultado fora do combinado');
      if (stale) reasons.push(days >= 7 ? `Ninguém registrou visita há ${days} dias` : 'Sem visita registrada');
      if (isBlocked) reasons.push(bloqueio ? BLOQUEIO_LABEL[bloqueio] || 'Parado' : 'Tem tarefa aberta');
      if (rodizio && !urgente && !isBlocked) reasons.push('Cabe olhar hoje');

      const feitoHoje = days === 0;
      const naFilaHoje = !feitoHoje && (urgente || isBlocked || rodizio || (slot === 'friday' && missedWeek));
      const why = reasons[0] || (feitoHoje ? 'Visita já registrada hoje' : 'Cabe olhar quando der');

      return {
        client,
        accounts: accountsByClient[client.id] || [],
        metaDisconnected: !(accountsByClient[client.id] || []).length,
        grupo: gruposByClient[client.id] || null,
        diary,
        metrics,
        snapshot: snapshotsByClient[client.id] || readClienteMetaResumo(client),
        health,
        days,
        lastAt,
        bloqueio,
        isBlocked,
        urgente,
        rodizio,
        missedWeek,
        taskStuck,
        tasks: clientTasks,
        semGrupo,
        reasons,
        why,
        feitoHoje,
        naFilaHoje,
        rodizioSlot: assignRodizioSlot(sortedIds, client.id),
      };
    });
  }, [accountsByClient, clients, diariesByClient, gruposByClient, metricsByClient, snapshotsByClient, monday, now, openTasks, slot, sortedIds]);

  const portfolio = useMemo(() => {
    const rank = (r) => {
      if (r.health?.status === 'critico' || r.metrics === null) return 0;
      if (r.health?.status === 'atencao' || r.tasks.length) return 1;
      if (r.semGrupo) return 2;
      return 3;
    };
    return [...rows].sort(
      (a, b) => rank(a) - rank(b) || String(a.client.empresa).localeCompare(b.client.empresa, 'pt-BR')
    );
  }, [rows]);

  const semGrupoRows = useMemo(() => rows.filter((r) => r.semGrupo), [rows]);
  const semGrupoCount = semGrupoRows.length;

  const dashStats = useMemo(() => {
    const spend = rows.reduce((s, r) => s + Number(r.metrics?.spend || 0), 0);
    const fora = rows.filter((r) => r.health?.status === 'critico').length;
    const tarefas = rows.reduce((s, r) => s + r.tasks.length, 0);
    const semPerm = rows.filter((r) => r.metrics === null).length;
    return {
      total: rows.length,
      spend,
      fora,
      tarefas,
      semGrupo: semGrupoCount,
      semPerm,
    };
  }, [rows, semGrupoCount]);

  return {
    loading,
    refreshing,
    error,
    metricsLoading,
    rows,
    portfolio,
    dashStats,
    openTasks,
    semGrupoRows,
    slot,
    reload,
  };
}
