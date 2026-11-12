import React from 'react';
import { ExternalLink, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  formatFunilSpend,
  formatFunilCompactNumber,
} from '@/lib/funilMetrics';
import { hasMetaLink } from '@/lib/funilMetaLink';
import { hasGoogleLink } from '@/lib/funilGoogleLink';

export default function FunilNodeMetricsSection({
  nodeData,
  dateRange,
  onViewContacts,
}) {
  const metrics = nodeData?.metrics;
  const metricsError = nodeData?.metricsError;
  const contactCount = nodeData?.contactCount;
  const hasLink = hasMetaLink(nodeData?.metaLink) || hasGoogleLink(nodeData?.googleLink);
  const utm = nodeData?.metaLink?.utmCampaign || nodeData?.googleLink?.utmCampaign;

  if (!hasLink && contactCount == null) return null;

  return (
    <div className="funil-node-metrics">
      <div className="funil-node-metrics__head">Performance</div>

      {metricsError && (
        <p className="funil-node-metrics__error">
          <AlertTriangle className="h-3 w-3 inline mr-1" />
          {metricsError}
        </p>
      )}

      {metrics && !metricsError && (
        <table className="funil-node-metrics__table">
          <tbody>
            <tr>
              <td>Gasto</td>
              <td>{formatFunilSpend(metrics.spend)}</td>
            </tr>
            <tr>
              <td>Cliques</td>
              <td>{formatFunilCompactNumber(metrics.clicks)}</td>
            </tr>
            <tr>
              <td>Impressões</td>
              <td>{formatFunilCompactNumber(metrics.impressions)}</td>
            </tr>
            <tr>
              <td>Conversões</td>
              <td>{formatFunilCompactNumber(metrics.conversions)}</td>
            </tr>
            {metrics.ctr > 0 && (
              <tr>
                <td>CTR</td>
                <td>{metrics.ctr.toFixed(2)}%</td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {!metrics && !metricsError && hasLink && (
        <p className="text-xs text-muted-foreground py-1">
          Clique em &quot;Atualizar métricas&quot; na barra do funil.
        </p>
      )}

      {dateRange && (
        <p className="funil-node-metrics__period text-xs text-muted-foreground">
          Período: {dateRange.since} → {dateRange.until}
        </p>
      )}

      {contactCount != null && contactCount > 0 && (
        <div className="funil-node-metrics__leads">
          <span className="funil-node-metrics__leads-count">{contactCount}</span>
          <span className="text-xs">leads atribuídos (UTM)</span>
          {onViewContacts && utm && (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => onViewContacts(utm)}
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              Ver em Contatos
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
