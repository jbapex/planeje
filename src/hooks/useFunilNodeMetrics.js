import { useState, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import {
  buildMetricsPayload,
  buildAttributionPayload,
  defaultMetricsDateRange,
} from '@/lib/funilMetrics';

/**
 * Refresh ads metrics + contact attribution counts for funil nodes.
 */
export function useFunilNodeMetrics(clienteId) {
  const [dateRange, setDateRange] = useState(() => defaultMetricsDateRange());
  const [metricsByNodeId, setMetricsByNodeId] = useState({});
  const [contactCountsByNodeId, setContactCountsByNodeId] = useState({});
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [loadingAttribution, setLoadingAttribution] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState(null);
  const [metricsError, setMetricsError] = useState(null);

  const refreshMetrics = useCallback(
    async (nodes, edges = [], { forceDateRange } = {}) => {
      if (!clienteId || !nodes?.length) return;
      const payload = buildMetricsPayload(nodes, edges);
      if (payload.length === 0) {
        setMetricsByNodeId({});
        return;
      }

      const tr = forceDateRange || dateRange;
      setLoadingMetrics(true);
      setMetricsError(null);
      try {
        const { data, error } = await supabase.functions.invoke('funil-metrics-api', {
          body: {
            action: 'refresh-node-metrics',
            time_range: { since: tr.since, until: tr.until },
            nodes: payload,
          },
        });
        if (error) throw error;
        if (data?.error?.message) throw new Error(data.error.message);

        const next = {};
        const results = data?.results || {};
        for (const [nodeId, row] of Object.entries(results)) {
          if (row.error) next[nodeId] = { error: row.error };
          else if (row.metrics) next[nodeId] = row.metrics;
        }
        setMetricsByNodeId(next);
        setLastFetchedAt(data?.fetchedAt || new Date().toISOString());
      } catch (err) {
        setMetricsError(err.message || 'Erro ao atualizar métricas');
      } finally {
        setLoadingMetrics(false);
      }
    },
    [clienteId, dateRange]
  );

  const refreshAttribution = useCallback(
    async (nodes, edges = [], { forceDateRange } = {}) => {
      if (!clienteId || !nodes?.length) return;
      const tr = forceDateRange || dateRange;
      setLoadingAttribution(true);
      try {
        const { data, error } = await supabase.functions.invoke('funil-metrics-api', {
          body: {
            action: 'count-contacts-attribution',
            cliente_id: clienteId,
            time_range: { since: tr.since, until: tr.until },
            nodes: buildAttributionPayload(nodes, edges),
          },
        });
        if (error) throw error;
        setContactCountsByNodeId(data?.counts || {});
      } catch (err) {
        console.error('[useFunilNodeMetrics] attribution', err);
        setContactCountsByNodeId({});
      } finally {
        setLoadingAttribution(false);
      }
    },
    [clienteId, dateRange]
  );

  const refreshAll = useCallback(
    async (nodes, edges = []) => {
      await Promise.all([refreshMetrics(nodes, edges), refreshAttribution(nodes, edges)]);
    },
    [refreshMetrics, refreshAttribution]
  );

  const applyMetricsToNodes = useCallback((nodes, metricsMap, contactCounts) => {
    return nodes.map((n) => {
      const m = metricsMap?.[n.id];
      const contactCount = contactCounts?.[n.id];
      const nextData = { ...n.data };
      if (m && !m.error) {
        nextData.metrics = m;
      } else if (m?.error) {
        nextData.metricsError = m.error;
      }
      if (contactCount !== undefined && contactCount !== null) {
        nextData.contactCount = contactCount;
      }
      return { ...n, data: nextData };
    });
  }, []);

  return {
    dateRange,
    setDateRange,
    metricsByNodeId,
    contactCountsByNodeId,
    loadingMetrics,
    loadingAttribution,
    lastFetchedAt,
    metricsError,
    refreshMetrics,
    refreshAttribution,
    refreshAll,
    applyMetricsToNodes,
  };
}
