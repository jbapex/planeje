import React from 'react';
import { CHART_METRICS, comparisonDelta, formatMetric, metricValue } from './gestorIaMetricModel';
import { number } from './GestorIaContext';
import { GestorIaSparkline } from './GestorIaCharts';

const deltaFormat = new Intl.NumberFormat('pt-BR', {
  style: 'percent', signDisplay: 'exceptZero', minimumFractionDigits: 1, maximumFractionDigits: 1,
});

export default function GestorIaMetricCards({ cards, snapshot, previous, currency, rows, live, label, resultKey, costKey, target, derived, definitions = CHART_METRICS }) {
  const targetDelta = target && currency === 'BRL' ? comparisonDelta(metricValue(snapshot, costKey), target.amount) : null;
  return <div className={`gia-kpis${live ? ' gia-kpis-live' : ''}${target ? ' gia-kpis-with-target' : ''}`} aria-label={label}>
    {cards.map((key) => {
      const metric = definitions.find((item) => item.key === key);
      const value = metricValue(snapshot, key), prior = metricValue(previous, key);
      const delta = comparisonDelta(value, prior);
      const visibleDelta = Math.abs(delta ?? 0) >= 0.05 ? delta : 0;
      const cost = key === 'cpm' || key === costKey && metric.unit === 'money';
      const direction = cost ? -visibleDelta : key === resultKey || key === 'ctr' || key === 'clicks' ? visibleDelta : 0;
      return <article key={key}><span>{metric.label}</span><div className="gia-kpi-value"><strong>{formatMetric(value, metric, currency)}</strong>
        {previous && <small className="gia-kpi-comparison" data-trend={direction > 0 ? 'upside' : direction < 0 ? 'downside' : undefined}
          title={`Anterior: ${formatMetric(prior, metric, currency)}`}>{delta === null ? '—' : deltaFormat.format(delta / 100)}</small>}</div>
        {key === 'spend' && snapshot && !currency && <small>{value === null ? 'Moeda sem total comum' : 'Moeda não informada'}</small>}
        {key === 'frequency' && snapshot && <small title={derived ? 'Alcance e frequência não podem ser somados.' : undefined}>Alcance: {number(snapshot.reach)}</small>}
        {rows.length > 0 && key !== 'frequency' && <GestorIaSparkline rows={rows} metric={key} />}
      </article>;
    })}
    {target && <article><span>Meta · {target.label}</span><strong>{target.value}</strong><small data-trend={targetDelta >= 1 ? 'downside' : targetDelta <= -1 ? 'upside' : undefined}>
      {targetDelta === null ? 'Meta cadastrada' : Math.abs(targetDelta) < 1 ? 'No alvo' : `${number(Math.abs(targetDelta))}% ${targetDelta > 0 ? 'acima' : 'abaixo'} da meta`}</small></article>}
  </div>;
}
