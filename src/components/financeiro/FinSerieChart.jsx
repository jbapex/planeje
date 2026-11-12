import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { formatMoneyBr } from '@/lib/agenciaFinanceiro';
import { formatCompactMoney } from '@/lib/carteiraClientes';

const MONTH_NAMES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function monthTitle(key) {
  const [year, month] = String(key || '').split('-').map(Number);
  if (!year || !month) return key || '';
  return `${MONTH_NAMES[month - 1]} de ${year}`;
}

function formatTip(value, kind, unit) {
  if (kind === 'money') return formatMoneyBr(value);
  if (unit) return `${value} ${value === 1 ? unit[0] : unit[1]}`;
  return String(value);
}

export function FinSerieArea({ series, valueKey, color, kind = 'money', unit, height = 118 }) {
  const svgRef = useRef(null);
  const wrapRef = useRef(null);
  const [hover, setHover] = useState(null);
  const width = 320;
  const padX = 8;
  const padY = 12;
  const values = (series || []).map((item) => Number(item[valueKey]) || 0);
  const max = Math.max(...values, kind === 'money' ? 1 : 1);
  const coords = (series || []).map((item, index) => {
    const x = padX + (index / Math.max(series.length - 1, 1)) * (width - padX * 2);
    const y = height - padY - (values[index] / max) * (height - padY * 2);
    return { x, y, label: item.label, value: values[index], key: item.key };
  });
  const line = coords.map((point) => `${point.x},${point.y}`).join(' ');
  const area = coords.length
    ? `M ${padX},${height - padY} L ${line.replace(/ /g, ' L ')} L ${width - padX},${height - padY} Z`
    : '';

  const handleMove = (event) => {
    const svg = svgRef.current;
    const wrap = wrapRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !wrap || !ctm || !coords.length) return;
    const svgX = (event.clientX - ctm.e) / ctm.a;
    let index = 0;
    coords.forEach((point, i) => {
      if (Math.abs(point.x - svgX) < Math.abs(coords[index].x - svgX)) index = i;
    });
    const rect = wrap.getBoundingClientRect();
    const point = coords[index];
    setHover({
      index,
      left: ctm.a * point.x + ctm.e - rect.left,
      top: ctm.d * point.y + ctm.f - rect.top,
      width: rect.width,
    });
  };

  const active = hover != null ? coords[hover.index] : null;
  const activeItem = hover != null ? series[hover.index] : null;
  const tipLeft = hover ? Math.min(Math.max(hover.left, 72), hover.width - 72) : 0;
  const gradId = `fin-area-${valueKey}`;

  return (
    <div
      ref={wrapRef}
      className="relative w-full"
      onPointerMove={handleMove}
      onPointerLeave={() => setHover(null)}
    >
      <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} className="block w-full" style={{ height }} role="img" aria-hidden>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {area ? <path d={area} fill={`url(#${gradId})`} /> : null}
        {line ? (
          <polyline fill="none" stroke={color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" points={line} />
        ) : null}
        {coords.map((point, index) => (
          <circle key={`${valueKey}-${index}`} cx={point.x} cy={point.y} r="2.4" fill={color} />
        ))}
        {coords.map((point, index) => (
          (index % 2 === 0 || index === coords.length - 1) ? (
            <text key={`lbl-${index}`} x={point.x} y={height - 1} textAnchor="middle" className="fill-slate-400 text-[9px]">
              {point.label}
            </text>
          ) : null
        ))}
        {active && (
          <>
            <line x1={active.x} x2={active.x} y1={padY / 2} y2={height - padY} stroke="rgba(148,163,184,0.45)" strokeDasharray="3 3" />
            <circle cx={active.x} cy={active.y} r="4.5" fill="#fff" stroke={color} strokeWidth="2.4" />
          </>
        )}
      </svg>
      {active && (
        <div
          className={cn(
            'pointer-events-none absolute z-10 -translate-x-1/2 rounded-xl border border-slate-200/80 bg-white px-2.5 py-1.5 text-center shadow-lg dark:border-white/10 dark:bg-slate-900',
            hover.top < 56 && 'translate-y-2',
          )}
          style={{ left: tipLeft, top: hover.top - 8 }}
        >
          <p className="text-[10px] text-slate-500">{monthTitle(activeItem?.key)}</p>
          <p className="text-[13px] font-semibold tabular-nums" style={{ color }}>
            {formatTip(active.value, kind, unit)}
          </p>
        </div>
      )}
    </div>
  );
}

export function FinSerieBarras({ series, valueKey, color, kind = 'money', unit, height = 118 }) {
  const svgRef = useRef(null);
  const wrapRef = useRef(null);
  const [hover, setHover] = useState(null);
  const width = 320;
  const padX = 10;
  const padY = 14;
  const items = series || [];
  const values = items.map((item) => Number(item[valueKey]) || 0);
  const max = Math.max(...values, 1);
  const barGap = 4;
  const innerW = width - padX * 2;
  const barW = items.length ? (innerW - barGap * (items.length - 1)) / items.length : 0;

  const bars = items.map((item, index) => {
    const value = values[index];
    const h = (value / max) * (height - padY - 16);
    const x = padX + index * (barW + barGap);
    const y = height - padY - h;
    return { x, y, w: barW, h, value, label: item.label, key: item.key };
  });

  const handleMove = (event) => {
    const svg = svgRef.current;
    const wrap = wrapRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !wrap || !ctm || !bars.length) return;
    const svgX = (event.clientX - ctm.e) / ctm.a;
    let index = 0;
    bars.forEach((bar, i) => {
      const cx = bar.x + bar.w / 2;
      if (Math.abs(cx - svgX) < Math.abs(bars[index].x + bars[index].w / 2 - svgX)) index = i;
    });
    const rect = wrap.getBoundingClientRect();
    const bar = bars[index];
    setHover({
      index,
      left: ctm.a * (bar.x + bar.w / 2) + ctm.e - rect.left,
      top: ctm.d * bar.y + ctm.f - rect.top,
      width: rect.width,
    });
  };

  const active = hover != null ? bars[hover.index] : null;
  const activeItem = hover != null ? items[hover.index] : null;
  const tipLeft = hover ? Math.min(Math.max(hover.left, 72), hover.width - 72) : 0;

  return (
    <div ref={wrapRef} className="relative w-full" onPointerMove={handleMove} onPointerLeave={() => setHover(null)}>
      <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} className="block w-full" style={{ height }} role="img" aria-hidden>
        {bars.map((bar, index) => (
          <rect
            key={bar.key || index}
            x={bar.x}
            y={bar.y}
            width={bar.w}
            height={Math.max(bar.h, values[index] > 0 ? 2 : 0)}
            rx="3"
            fill={hover?.index === index ? color : color}
            opacity={hover?.index === index ? 1 : 0.82}
          />
        ))}
        {bars.map((bar, index) => (
          (index % 2 === 0 || index === bars.length - 1) ? (
            <text key={`lbl-b-${index}`} x={bar.x + bar.w / 2} y={height - 2} textAnchor="middle" className="fill-slate-400 text-[9px]">
              {bar.label}
            </text>
          ) : null
        ))}
      </svg>
      {active && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-xl border border-slate-200/80 bg-white px-2.5 py-1.5 text-center shadow-lg dark:border-white/10 dark:bg-slate-900"
          style={{ left: tipLeft, top: active.y - 36 }}
        >
          <p className="text-[10px] text-slate-500">{monthTitle(activeItem?.key)}</p>
          <p className="text-[13px] font-semibold tabular-nums" style={{ color }}>
            {formatTip(active.value, kind, unit)}
          </p>
        </div>
      )}
    </div>
  );
}

export function FinGraficoCard({ title, subtitle, totalCaption, totalDisplay, children, accent = '#0f172a', titleAddon, className }) {
  return (
    <article
      className={cn(
        'rounded-2xl border border-slate-200/70 bg-slate-50/50 p-3.5 pb-3 dark:border-white/10 dark:bg-white/[0.03]',
        className,
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          {subtitle ? <p className="text-[12px] font-medium text-slate-500">{subtitle}</p> : null}
          <h3 className="flex items-center gap-0.5 text-[15px] font-semibold tracking-[-0.02em] text-slate-950 dark:text-white">
            {title}
            {titleAddon}
          </h3>
        </div>
        {totalDisplay ? (
          <div className="text-right">
            <p className="text-[10px] font-medium text-slate-400">{totalCaption || 'No ano'}</p>
            <p className="text-[15px] font-semibold tabular-nums tracking-[-0.02em]" style={{ color: accent }}>
              {totalDisplay}
            </p>
          </div>
        ) : null}
      </div>
      {children}
    </article>
  );
}

export { formatCompactMoney };
