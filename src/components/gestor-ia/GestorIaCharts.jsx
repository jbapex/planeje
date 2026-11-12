import React, { useState } from 'react';
import { CHART_METRICS, formatMetric, metricValue } from './gestorIaMetricModel';
import { date, periodLabel } from './GestorIaContext';

const compactNumber = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 2 });
const shortMonthDay = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dayLabel = (value) => date(value).slice(0, 5);

function axisValue(value, metric) {
  return `${compactNumber.format(value)}${metric.unit === 'percent' ? '%' : ''}`;
}

function seriesPath(series, x, y, baseline) {
  let result = '', start = null, last = null;
  const close = () => baseline != null && start !== null ? `L${last},${baseline}L${start},${baseline}Z` : '';
  series.forEach((value, index) => {
    if (value === null) { result += close(); start = null; return; }
    last = x(index);
    result += `${start === null ? 'M' : 'L'}${last},${y(value)}`;
    if (start === null) start = last;
  });
  return result + close();
}

export function GestorIaSparkline({ rows, metric }) {
  const values = rows.map((row) => metricValue(row.current, metric));
  const measured = values.filter((value) => value !== null);
  if (measured.length < 2) return null;
  const low = Math.min(...measured), high = Math.max(...measured);
  const x = (index) => 3 + index / (values.length - 1) * 80;
  const y = (value) => high === low ? 12 : 20 - (value - low) / (high - low) * 16;
  return <svg className="gia-sparkline" viewBox="0 0 86 24" aria-hidden="true">
    <path d={seriesPath(values, x, y)} />
    {values.map((value, index) => value !== null && (values[index + 1] == null || values[index - 1] == null) ? <circle key={rows[index].date} cx={x(index)} cy={y(value)} r="2.4" /> : null)}
  </svg>;
}

function PlotLabel({ x, y, width, children }) {
  return <g className="gia-plot-label" transform={`translate(${x},${y})`}>
    <rect width={width} height={20} rx={4} />
    <text x={width / 2} y={14} textAnchor="middle">{children}</text>
  </g>;
}

export function LineChart({ id, rows, metric, currency, compare, spacious, referenceLabel = 'Anterior' }) {
  const [active, setActive] = useState(null);
  const [showData, setShowData] = useState(false);
  const current = rows.map((row) => metricValue(row.current, metric.key));
  const previous = rows.map((row) => compare ? metricValue(row.previous, metric.key) : null);
  const values = [...current, ...previous].filter((v) => v !== null);
  const low = Math.min(0, ...values);
  const extent = Math.max(1, ...values) - low;
  const unit = 10 ** Math.floor(Math.log10(extent / 5));
  const step = ([1, 2, 2.5, 5, 10].find((factor) => factor * unit >= extent / 5) || 10) * unit;
  const ticks = Math.ceil(extent / step);
  const high = low + step * ticks;
  const height = spacious ? 276 : 220;
  const left = 48, right = 592, top = 15, bottom = height - 30;
  const spacing = (right - left) / Math.max(1, rows.length);
  const x = (index) => left + (index + 0.5) * spacing;
  const y = (value) => bottom - (value - low) / (high - low) * (bottom - top);
  const choosePoint = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const svgX = (event.clientX - bounds.left) / bounds.width * 600;
    const svgY = (event.clientY - bounds.top) / bounds.height * height;
    if (svgX < left || svgX > right || svgY < top || svgY > bottom) setActive(null);
    else setActive(Math.min(rows.length - 1, Math.floor((svgX - left) / spacing)));
  };
  const selected = active === null ? null : rows[active];
  const selectedValue = selected ? current[active] ?? previous[active] : null;
  const pointX = selected ? x(active) : left;
  const pointY = selectedValue === null ? (top + bottom) / 2 : y(selectedValue);
  const valueLabel = selectedValue === null ? '' : axisValue(selectedValue, metric);
  const valueWidth = Math.max(35, valueLabel.length * 7 + 10);
  return <>
    {!values.length ? <p className="gia-empty">Não há dados desta métrica para desenhar o gráfico.</p> : <div className="gia-plot">
      <svg viewBox={`0 0 600 ${height}`} role="group" tabIndex={0} aria-label={`${metric.label} por dia. Use as setas para explorar os valores.`}
        onPointerMove={choosePoint} onPointerDown={choosePoint} onPointerLeave={() => setActive(null)}
        onPointerCancel={() => setActive(null)} onBlur={() => setActive(null)}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Escape'].includes(event.key)) return;
          event.preventDefault();
          if (event.key === 'Escape') setActive(null);
          else setActive((value) => Math.max(0, Math.min(rows.length - 1, value === null ? 0 : value + (event.key === 'ArrowRight' ? 1 : -1))));
        }}>
        {Array.from({ length: ticks + 1 }, (_, tick) => {
          const value = low + step * tick;
          return <g key={tick}><line x1={left} x2={right} y1={y(value)} y2={y(value)} className="gia-grid-line" /><text x={left - 9} y={y(value) + 3} textAnchor="end">{axisValue(value, metric)}</text></g>;
        })}
        <path d={seriesPath(current, x, y, bottom)} className="gia-chart-fill" />
        {compare && <path d={seriesPath(previous, x, y)} className="gia-line gia-line-previous" />}
        {previous.map((value, index) => value !== null && previous[index - 1] == null && previous[index + 1] == null ? <circle key={rows[index].date} cx={x(index)} cy={y(value)} r="3" className="gia-plot-dot gia-plot-dot-previous" /> : null)}
        <path d={seriesPath(current, x, y)} className="gia-line" />
        {current.map((value, index) => value === null ? null : <circle key={rows[index].date} cx={x(index)} cy={y(value)} r={rows.length > 35 ? 2 : 3} className="gia-plot-dot" />)}
        {(rows.length <= 7 ? rows.map((_, index) => index) : [0, Math.floor((rows.length - 1) / 2), rows.length - 1]).map((index) => <text key={index} x={x(index)} y={height - 7} textAnchor="middle">{dayLabel(rows[index].date)}</text>)}
        {selected && <g aria-hidden="true">
          <line x1={pointX} x2={pointX} y1={top} y2={bottom} className="gia-crosshair" />
          {selectedValue !== null && <line x1={left} x2={right} y1={pointY} y2={pointY} className="gia-crosshair" />}
          {previous[active] !== null && <circle cx={pointX} cy={y(previous[active])} r="5" className="gia-plot-dot gia-plot-dot-previous" />}
          {current[active] !== null && <circle cx={pointX} cy={y(current[active])} r="5" className="gia-plot-dot" />}
          <PlotLabel x={Math.min(pointX - 23, 554)} y={bottom + 4} width={46}>{dayLabel(selected.date)}</PlotLabel>
          {selectedValue !== null && <PlotLabel x={Math.max(0, left - valueWidth - 4)} y={pointY - 10} width={valueWidth}>{valueLabel}</PlotLabel>}
        </g>}
      </svg>
      {selected && <div className="gia-chart-tooltip" role="status" data-side={pointX > 300 ? 'left' : 'right'}
        style={{ '--gia-point-x': `${pointX / 6}%`, '--gia-point-y': `${pointY / height * 100}%` }}>
        <div className="gia-tooltip-date">{dayLabel(selected.date)}</div>
        <div className="gia-tooltip-row"><span>{metric.label}</span><strong>{formatMetric(current[active], metric, currency)}</strong></div>
        {compare && <div className="gia-tooltip-row is-previous"><span>{referenceLabel}{selected.previousDate && ` · ${dayLabel(selected.previousDate)}`}</span><strong>{formatMetric(previous[active], metric, currency)}</strong></div>}
      </div>}
    </div>}
    <button type="button" className="gia-text-button" aria-label={showData ? `Ocultar dados do gráfico ${id}` : `Ver dados do gráfico ${id}`} onClick={() => setShowData((value) => !value)} aria-expanded={showData}>{showData ? 'Ocultar dados' : 'Ver dados'}</button>
    {showData && <div className="gia-table-wrap gia-chart-data"><table><caption className="sr-only">Dados de {metric.label}</caption><thead><tr><th>{referenceLabel === 'Anterior' ? 'Dia atual' : 'Dia'}</th><th>{metric.label}</th>{compare && <>{rows[0]?.previousDate && <th>Dia anterior</th>}<th>{referenceLabel === 'Anterior' ? `${metric.label} anterior` : referenceLabel}</th></>}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.date}><td>{date(row.date)}</td><td>{formatMetric(current[index], metric, currency)}</td>{compare && <>{row.previousDate && <td>{date(row.previousDate)}</td>}<td>{formatMetric(previous[index], metric, currency)}</td></>}</tr>)}</tbody></table></div>}
  </>;
}

export default function GestorIaCharts({ state, rows, compare, resultKey, costKey, definitions = CHART_METRICS, partialText, spacious = false }) {
  const [primary, setPrimary] = useState('spend');
  const [secondary, setSecondary] = useState(costKey || (resultKey === 'purchases' ? 'costPurchase' : resultKey === 'leads' ? 'cpl' : 'costMessage'));
  const previousRange = state.comparison?.period;
  const previousLabel = previousRange?.since && previousRange.until
    ? `${shortMonthDay.format(new Date(previousRange.since))}–${shortMonthDay.format(new Date(previousRange.until))}` : 'Período anterior';
  return <section className="gia-panel gia-evolution"><div className="gia-section-heading"><h2>Evolução</h2></div>
    <div className="gia-charts-grid">{[[1, primary, setPrimary], [2, secondary, setSecondary]].map(([id, key, setMetric]) => {
      const metric = definitions.find((m) => m.key === key);
      return <div key={id} data-gia-chart={true} className="gia-chart-card"><label className="sr-only" htmlFor={id === 1 ? 'gia-chart-primary' : 'gia-chart-secondary'}>Métrica do gráfico {id}</label><select id={id === 1 ? 'gia-chart-primary' : 'gia-chart-secondary'} value={key} onChange={(e) => setMetric(e.target.value)}>{definitions.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select>
        {compare && <div className="gia-chart-legend"><span>{metric.label}</span><span title={previousRange ? `Período anterior · ${periodLabel(previousRange)}` : 'Período anterior'}>{previousLabel}</span></div>}
        {state.loading ? <p className="gia-empty" role="status">Consultando evolução…</p> : state.dailyError ? <p className="gia-empty" role="alert">{state.dailyError}</p> : <LineChart key={`${id}-${key}`} id={id} rows={rows} metric={metric} currency={state.account?.currency || ''} compare={compare} spacious={spacious} />}
      </div>;
    })}</div>
    {state.dailyPartial || (compare && state.comparison?.partial) || rows.length === 500 ? <p className="gia-notice">{partialText || 'A fonte limitou a série retornada. O gráfico cobre até 500 dias e pode estar incompleto.'}</p> : null}
    {compare && state.comparison?.dailyError && <p className="gia-notice">{state.comparison.dailyError}</p>}
  </section>;
}
