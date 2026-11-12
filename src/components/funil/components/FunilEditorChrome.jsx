import React from 'react';
import FunilHubSummary from '@/components/funil/components/FunilHubSummary';
import FunilMetricsBar from '@/components/funil/components/FunilMetricsBar';
import FunilMetaStatusBar from '@/components/funil/components/FunilMetaStatusBar';
import FunilGoogleStatusBar from '@/components/funil/components/FunilGoogleStatusBar';

/**
 * Faixa única abaixo da toolbar: resumo publicado + métricas + contas Meta/Google.
 */
export default function FunilEditorChrome({
  clienteId,
  dateRange,
  onDateRangeChange,
  onRefreshMetrics,
  loadingMetrics,
  lastFetchedAt,
  metricsError,
  connectedMetaNodesCount,
  connectedGoogleNodesCount,
  metaAccountsDialogOpen,
  onMetaAccountsDialogOpenChange,
  googleAccountsDialogOpen,
  onGoogleAccountsDialogOpenChange,
  clienteName,
  validationIssues,
}) {
  return (
    <div className="funil-chrome">
      <FunilHubSummary clienteId={clienteId} embedded />

      {validationIssues?.length > 0 && (
        <div className="funil-chrome__validation" title={validationIssues.map((i) => i.message).join('\n')}>
          <strong>Checklist ({validationIssues.length})</strong>
          <span className="funil-chrome__validation-msg">
            {validationIssues[0]?.message}
            {validationIssues.length > 1 ? ` (+${validationIssues.length - 1})` : ''}
          </span>
        </div>
      )}

      <div className="funil-chrome__row">
        <FunilMetricsBar
          compact
          dateRange={dateRange}
          onDateRangeChange={onDateRangeChange}
          onRefreshMetrics={onRefreshMetrics}
          loadingMetrics={loadingMetrics}
          lastFetchedAt={lastFetchedAt}
          metricsError={metricsError}
        />
        <div className="funil-chrome__channels">
          <FunilMetaStatusBar
            compact
            clienteId={clienteId}
            clienteName={clienteName}
            connectedNodesCount={connectedMetaNodesCount}
            dialogOpen={metaAccountsDialogOpen}
            onDialogOpenChange={onMetaAccountsDialogOpenChange}
          />
          <FunilGoogleStatusBar
            compact
            clienteId={clienteId}
            clienteName={clienteName}
            connectedNodesCount={connectedGoogleNodesCount}
            dialogOpen={googleAccountsDialogOpen}
            onDialogOpenChange={onGoogleAccountsDialogOpenChange}
          />
        </div>
      </div>
    </div>
  );
}
