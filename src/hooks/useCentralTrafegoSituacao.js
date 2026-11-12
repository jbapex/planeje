import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { metaAvailability } from '@/lib/centralTrafegoMeta';
import { fetchCentralTrafegoSituacao } from '@/lib/centralTrafegoApi';
import { refreshClientsMetaResumo } from '@/lib/clienteMetaSnapshot';
import { fetchIdsClientesAtivosCarteira, keepClientesAtivos } from '@/lib/clientesAtivosCarteira';
import { keepCarteiraDoGestor } from '@/lib/carteiraGestor';

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

function withSnapshot(row, snapshot) {
  return {
    ...row,
    snapshot,
    client: { ...row.client, meta_resumo: snapshot },
    meta: metaAvailability(snapshot),
  };
}

export function useCentralTrafegoSituacao() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [metaSyncing, setMetaSyncing] = useState(false);
  const [metaProgress, setMetaProgress] = useState(null);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);
  const [team, setTeam] = useState([]);
  const [checkupSummary, setCheckupSummary] = useState(null);

  const reload = useCallback(async ({ force = false } = {}) => {
    setError(null);
    setLoading(true);
    try {
      const { data, error: err } = await fetchCentralTrafegoSituacao();
      if (err) throw err;
      const ativoIds = await fetchIdsClientesAtivosCarteira();
      const scoped = keepCarteiraDoGestor(
        keepClientesAtivos(data?.rows || [], ativoIds, (row) => row.client_id),
        {
          profile,
          userId: user?.id,
          getId: (row) => row.client_id,
          getResponsavel: (row) => row.gestor_id,
        }
      );
      const decorated = scoped.map((row) => {
        const snapshot = row.meta_resumo || null;
        const meta = metaAvailability(snapshot);
        return {
          ...row,
          client: { id: row.client_id, empresa: row.empresa, meta_resumo: snapshot },
          ops: {
            primary_assignee_id: row.gestor_id,
            situation: row.situation,
            situation_reason: row.situation_reason,
            resume_at: row.resume_at,
            updated_at: row.updated_at,
          },
          gestor: row.gestor_id ? { id: row.gestor_id, full_name: row.gestor_name } : null,
          routine: row.routine || {
            report_enabled: true,
            report_cadence: 15,
            crm_weekly_enabled: false,
            group_weekly_enabled: true,
          },
          pendingGestor: Boolean(row.pending_gestor),
          pendingReason: row.pending_gestor ? 'Sem gestor oficial' : null,
          snapshot,
          meta,
        };
      });
      setRows(decorated);
      setTeam(data?.team || []);
      setCheckupSummary({
        total: decorated.filter((row) => row.checkup_due).length,
        reviewed: decorated.filter((row) => row.checkup_due && row.checkup_result).length,
        ok: decorated.filter((row) => row.checkup_due && row.checkup_result === 'ok').length,
        attention: decorated.filter((row) => row.checkup_due && row.checkup_result === 'needs_attention').length,
        waiting_client: decorated.filter((row) => row.checkup_due && row.checkup_result === 'waiting_client').length,
        planned_pause: decorated.filter((row) => row.checkup_due && row.checkup_result === 'planned_pause').length,
        data_unavailable: decorated.filter((row) => row.checkup_due && row.checkup_result === 'data_unavailable').length,
        unreviewed: decorated.filter((row) => row.checkup_unreviewed).length,
      });
      setLoading(false);

      const ids = decorated.map((row) => row.client_id).filter(Boolean);
      if (!ids.length) return;

      const { data: accounts, error: accErr } = await supabase
        .from('cliente_meta_accounts')
        .select('cliente_id, meta_account_id, meta_account_name, is_active')
        .eq('is_active', true)
        .in('cliente_id', ids);
      if (accErr) throw accErr;
      const accMap = groupAccounts(accounts);
      const entries = decorated
        .map((row) => ({
          client: row.client,
          accounts: accMap[row.client_id] || [],
        }))
        .filter((entry) => entry.accounts.length);
      if (!entries.length) return;

      setMetaSyncing(true);
      setMetaProgress({ done: 0, total: entries.length });
      await refreshClientsMetaResumo(entries, {
        force,
        onEach: ({ clientId, snapshot, done, total }) => {
          setRows((prev) =>
            prev.map((row) => (row.client_id === clientId ? withSnapshot(row, snapshot) : row))
          );
          setMetaProgress({ done, total });
        },
      });
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setMetaSyncing(false);
      setMetaProgress(null);
      setLoading(false);
    }
  }, [profile, user?.id]);

  useEffect(() => {
    reload({ force: false });
  }, [reload]);

  const pendingGestor = useMemo(() => rows.filter((r) => r.pendingGestor), [rows]);

  const unreviewed = useMemo(() => rows.filter((r) => r.checkup_unreviewed), [rows]);

  return { loading, metaSyncing, metaProgress, error, rows, pendingGestor, unreviewed, checkupSummary, team, reload };
}
