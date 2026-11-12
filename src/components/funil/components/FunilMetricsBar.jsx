import React from 'react';
import { RefreshCw } from 'lucide-react';

export default function FunilMetricsBar({
  compact = false,
  dateRange,
  onDateRangeChange,
  onRefreshMetrics,
  loadingMetrics,
  lastFetchedAt,
  metricsError,
}) {
  if (!onRefreshMetrics && !dateRange) return null;

  return (
    <div className={`funil-metrics-bar ${compact ? 'funil-metrics-bar--compact' : ''}`}>
      {dateRange && onDateRangeChange && (
        <div className="funil-metrics-bar__dates">
          <label>De</label>
          <input
            type="date"
            value={dateRange.since}
            onChange={(e) => onDateRangeChange({ ...dateRange, since: e.target.value })}
          />
          <label>Até</label>
          <input
            type="date"
            value={dateRange.until}
            onChange={(e) => onDateRangeChange({ ...dateRange, until: e.target.value })}
          />
        </div>
      )}
      {onRefreshMetrics && (
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onRefreshMetrics}
          disabled={loadingMetrics}
        >
          <RefreshCw className={`h-3 w-3 mr-1 inline ${loadingMetrics ? 'animate-spin' : ''}`} />
          {loadingMetrics ? 'Atualizando…' : 'Atualizar métricas'}
        </button>
      )}
      {metricsError && (
        <span className="text-destructive text-xs">{metricsError}</span>
      )}
      {lastFetchedAt && (
        <span className="funil-metrics-bar__sync">
          Última sync: {new Date(lastFetchedAt).toLocaleString('pt-BR')}
        </span>
      )}
    </div>
  );
}
