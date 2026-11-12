import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building, MapPin } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatClientLocalidade } from '@/lib/brasilUfs';
import { formatCompactMoney } from '@/lib/carteiraClientes';
import BrasilClientesMap from '@/components/clients/BrasilClientesMap';
import {
  buildGeoBreakdown,
  buildMonthlySeries,
  buildOwnerBreakdown,
  buildPriorityAccounts,
  buildRiskBreakdown,
} from '@/lib/carteiraOverview';
import { buildClientHubUrl } from '@/lib/clientHubRoutes';
import { cn } from '@/lib/utils';
import '@/components/clients/ClientesVisaoGeral.css';

const MONTH_NAMES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function monthTitle(key) {
  const [year, month] = String(key || '').split('-').map(Number);
  if (!year || !month) return key || '';
  return `${MONTH_NAMES[month - 1]} de ${year}`;
}

function MiniAreaChart({ series, valueKey, color, labels, unit }) {
  const svgRef = useRef(null);
  const wrapRef = useRef(null);
  const [hover, setHover] = useState(null);
  const width = 320;
  const height = 118;
  const padX = 8;
  const padY = 12;
  const values = series.map((item) => Number(item[valueKey]) || 0);
  const max = Math.max(...values, 1);
  const coords = series.map((item, index) => {
    const x = padX + (index / Math.max(series.length - 1, 1)) * (width - padX * 2);
    const y = height - padY - (values[index] / max) * (height - padY * 2);
    return { x, y, label: item.label, value: values[index] };
  });
  const line = coords.map((point) => `${point.x},${point.y}`).join(' ');
  const area = `M ${padX},${height - padY} L ${line.replace(/ /g, ' L ')} L ${width - padX},${height - padY} Z`;

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

  const active = hover ? coords[hover.index] : null;
  const activeItem = hover ? series[hover.index] : null;
  const tipLeft = hover ? Math.min(Math.max(hover.left, 64), hover.width - 64) : 0;

  return (
    <div ref={wrapRef} className="planeje-overview-chart-wrap" onPointerMove={handleMove} onPointerLeave={() => setHover(null)}>
      <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} className="planeje-overview-chart" role="img" aria-hidden>
        <defs>
          <linearGradient id={`fill-${valueKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#fill-${valueKey})`} />
        <polyline fill="none" stroke={color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" points={line} />
        {coords.map((point, index) => (
          <circle key={`${valueKey}-${index}`} cx={point.x} cy={point.y} r="2.4" fill={color} />
        ))}
        {labels && coords.map((point, index) => (
          (index % 2 === 0 || index === coords.length - 1) ? (
            <text key={`lbl-${index}`} x={point.x} y={height - 1} textAnchor="middle" className="planeje-overview-chart-label">
              {point.label}
            </text>
          ) : null
        ))}
        {active && (
          <>
            <line x1={active.x} x2={active.x} y1={padY / 2} y2={height - padY} className="planeje-overview-chart-guide" />
            <circle cx={active.x} cy={active.y} r="4.5" fill="#fff" stroke={color} strokeWidth="2.4" />
          </>
        )}
      </svg>
      {active && (
        <div className={cn('planeje-overview-chart-tip', hover.top < 56 && 'is-below')} style={{ left: tipLeft, top: hover.top }}>
          <span>{monthTitle(activeItem?.key)}</span>
          <strong style={{ color }}>
            {active.value} {active.value === 1 ? unit?.[0] : unit?.[1]}
          </strong>
        </div>
      )}
    </div>
  );
}

function RankList({ items, empty, onPick }) {
  if (!items.length) {
    return <p className="planeje-overview-empty">{empty}</p>;
  }
  const max = items[0]?.count || 1;
  return (
    <ul className="planeje-overview-rank">
      {items.map((item) => (
        <li key={item.key}>
          <button type="button" className="planeje-overview-rank-btn" onClick={() => onPick?.(item.query)}>
            <span className="planeje-overview-rank-name">{item.label}</span>
            <span className="planeje-overview-rank-count">{item.count}</span>
          </button>
          <span className="planeje-overview-rank-bar" style={{ width: `${Math.max(8, (item.count / max) * 100)}%` }} />
        </li>
      ))}
    </ul>
  );
}

export default function ClientesVisaoGeral({
  clients,
  users,
  pulse,
  canViewField,
  onOpenClient,
  onFilterSearch,
}) {
  const monthly = useMemo(() => buildMonthlySeries(clients), [clients]);
  const geo = useMemo(() => buildGeoBreakdown(clients), [clients]);
  const risk = useMemo(() => buildRiskBreakdown(pulse?.accounts), [pulse?.accounts]);
  const owners = useMemo(() => buildOwnerBreakdown(clients, users), [clients, users]);
  const priority = useMemo(() => buildPriorityAccounts(pulse?.accounts, 6), [pulse?.accounts]);
  const countByUf = useMemo(
    () => Object.fromEntries(geo.ufs.map((item) => [item.uf, item.count])),
    [geo.ufs],
  );

  const lastEstoque = monthly[monthly.length - 1]?.estoque || 0;
  const lastNovos = monthly[monthly.length - 1]?.novos || 0;
  const lastChurn = monthly[monthly.length - 1]?.churn || 0;
  const ownerMax = owners[0]?.count || 1;

  return (
    <div className="planeje-overview">
      <div className="planeje-overview-charts">
        <article className="planeje-overview-card">
          <header className="planeje-overview-card-head">
            <div>
              <p className="planeje-overview-kicker">Carteira</p>
              <h3>Clientes no mês</h3>
            </div>
            <strong>{lastEstoque}</strong>
          </header>
          <MiniAreaChart series={monthly} valueKey="estoque" color="#7c3aed" labels unit={['cliente', 'clientes']} />
        </article>
        <article className="planeje-overview-card">
          <header className="planeje-overview-card-head">
            <div>
              <p className="planeje-overview-kicker">Entrada</p>
              <h3>Novos clientes</h3>
            </div>
            <strong>{lastNovos}</strong>
          </header>
          <MiniAreaChart series={monthly} valueKey="novos" color="#0ea5e9" labels unit={['novo cliente', 'novos clientes']} />
        </article>
        <article className="planeje-overview-card">
          <header className="planeje-overview-card-head">
            <div>
              <p className="planeje-overview-kicker">Saída</p>
              <h3>Churn (perdidos)</h3>
            </div>
            <strong>{lastChurn}</strong>
          </header>
          <MiniAreaChart series={monthly} valueKey="churn" color="#ef4444" labels unit={['perdido', 'perdidos']} />
          <p className="planeje-overview-hint">Conta como churn o mês em que a etapa virou Perdido.</p>
        </article>
      </div>

      <div className="planeje-overview-mid">
        <article className="planeje-overview-card planeje-overview-card--map">
          <header className="planeje-overview-card-head">
            <div>
              <p className="planeje-overview-kicker">Origem</p>
              <h3>Onde estão os clientes</h3>
            </div>
            <span className="planeje-overview-meta">{geo.withGeo} com cidade/UF</span>
          </header>
          <div className="planeje-overview-map-wrap">
            <BrasilClientesMap
              countByUf={countByUf}
              maxUf={geo.maxUf}
              onSelectUf={(uf) => onFilterSearch?.(uf)}
            />
            <div className="planeje-overview-geo-lists">
              <div>
                <h4>Top estados</h4>
                <RankList
                  items={geo.ufs.slice(0, 5).map((item) => ({
                    key: item.uf,
                    label: `${item.uf} · ${item.nome}`,
                    count: item.count,
                    query: item.uf,
                  }))}
                  empty="Cadastre o estado no cliente para ver o ranking."
                  onPick={onFilterSearch}
                />
              </div>
              <div>
                <h4>Top cidades</h4>
                <RankList
                  items={geo.cidades.slice(0, 5).map((item) => ({
                    key: `${item.cidade}-${item.uf}`,
                    label: item.uf ? `${item.cidade} · ${item.uf}` : item.cidade,
                    count: item.count,
                    query: item.cidade,
                  }))}
                  empty="Cadastre a cidade no cliente para ver o ranking."
                  onPick={onFilterSearch}
                />
              </div>
            </div>
          </div>
          {geo.withoutGeo > 0 && (
            <p className="planeje-overview-hint">
              {geo.withoutGeo} conta{geo.withoutGeo > 1 ? 's' : ''} ainda sem cidade/UF — complete o cadastro para o mapa ficar fiel.
            </p>
          )}
        </article>

        <article className="planeje-overview-card">
          <header className="planeje-overview-card-head">
            <div>
              <p className="planeje-overview-kicker">Saúde</p>
              <h3>Distribuição de risco</h3>
            </div>
          </header>
          {risk.total === 0 ? (
            <p className="planeje-overview-empty">{pulse?.loading ? 'Calculando saúde das contas…' : 'Sem contas ativas no pulso.'}</p>
          ) : (
            <>
              <div className="planeje-overview-risk-bar" aria-hidden>
                <span style={{ width: `${(risk.ok / risk.total) * 100}%` }} className="is-ok" />
                <span style={{ width: `${(risk.warn / risk.total) * 100}%` }} className="is-warn" />
                <span style={{ width: `${(risk.danger / risk.total) * 100}%` }} className="is-danger" />
              </div>
              <ul className="planeje-overview-risk-legend">
                <li><i className="is-ok" /> Saudável · {risk.ok}</li>
                <li><i className="is-warn" /> Atenção · {risk.warn}</li>
                <li><i className="is-danger" /> Risco · {risk.danger}</li>
              </ul>
            </>
          )}

          <h4 className="planeje-overview-sub">Contas por responsável</h4>
          {owners.length === 0 ? (
            <p className="planeje-overview-empty">Nenhuma conta ativa.</p>
          ) : (
            <ul className="planeje-overview-owners">
              {owners.slice(0, 8).map((owner) => (
                <li key={owner.id}>
                  <div className="planeje-overview-owner-row">
                    <span className="planeje-overview-rank-name">{owner.name}</span>
                    <span className="planeje-overview-rank-count">
                      {owner.count}
                      {canViewField?.('valor') ? ` · ${formatCompactMoney(owner.mrr)}` : ''}
                    </span>
                  </div>
                  <span className="planeje-overview-rank-bar" style={{ width: `${Math.max(8, (owner.count / ownerMax) * 100)}%` }} />
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>

      <article className="planeje-overview-card">
        <header className="planeje-overview-card-head">
          <div>
            <p className="planeje-overview-kicker">Prioridade</p>
            <h3>Contas que pedem atenção</h3>
          </div>
        </header>
        {priority.length === 0 ? (
          <p className="planeje-overview-empty">Nenhuma conta no pulso agora.</p>
        ) : (
          <ul className="planeje-overview-priority">
            {priority.map((account) => {
              const client = (clients || []).find((item) => item.id === account.id);
              const localidade = formatClientLocalidade(client);
              return (
                <li key={account.id}>
                  <Link
                    to={buildClientHubUrl(account.id)}
                    className="planeje-overview-priority-row"
                    onClick={() => onOpenClient?.(client || { id: account.id })}
                  >
                    <Avatar className="h-8 w-8 rounded-lg shrink-0">
                      <AvatarImage src={account.logo} alt="" className="object-cover" />
                      <AvatarFallback className="rounded-lg bg-slate-100 dark:bg-slate-700">
                        <Building className="w-3.5 h-3.5 text-slate-400" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="planeje-overview-priority-name">{account.empresa}</p>
                      <p className="planeje-overview-priority-meta">
                        {account.mood?.label}
                        {localidade ? ` · ${localidade}` : ''}
                      </p>
                    </div>
                    {localidade && <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 hidden sm:block" />}
                    <span className={cn('planeje-clients-health', `is-${account.mood?.tone || 'ok'}`)}>{account.score}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </article>
    </div>
  );
}
