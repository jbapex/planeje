import { useMemo, useState } from 'react';
import { BRASIL_UF_BY_CODE } from '@/lib/brasilUfs';
import mapData from '@/lib/data/brasil-uf-paths.json';
import { cn } from '@/lib/utils';

function fillFor(count, max) {
  if (!count) return null;
  const t = Math.max(0.22, count / Math.max(max, 1));
  return `rgba(109, 40, 217, ${0.28 + t * 0.62})`;
}

export default function BrasilClientesMap({ countByUf, maxUf, onSelectUf }) {
  const [hover, setHover] = useState(null);
  const entries = useMemo(() => Object.entries(mapData.ufs), []);

  return (
    <div className="planeje-overview-map-frame">
      <svg
        viewBox={mapData.viewBox}
        className="planeje-overview-map"
        role="img"
        aria-label="Mapa do Brasil com clientes por estado"
      >
        {entries.map(([uf, shape]) => {
          const count = countByUf[uf] || 0;
          const meta = BRASIL_UF_BY_CODE[uf];
          const hot = count > 0;
          return (
            <g
              key={uf}
              className={cn('planeje-overview-uf', hot && 'is-hot')}
              onMouseEnter={() => setHover({ uf, nome: meta?.nome || uf, count })}
              onMouseLeave={() => setHover(null)}
              onClick={() => hot && onSelectUf?.(uf)}
            >
              <path
                d={shape.d}
                fill={fillFor(count, maxUf) || undefined}
                className="planeje-overview-map-state"
              />
              <text
                x={shape.lx}
                y={shape.ly}
                textAnchor="middle"
                dominantBaseline="middle"
                className={cn('planeje-overview-uf-label', hot && count / Math.max(maxUf, 1) > 0.55 && 'is-on-hot')}
              >
                {uf}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="planeje-overview-map-legend">
        <span>Sem cadastro</span>
        <i className="is-empty" />
        <i className="is-mid" />
        <i className="is-hot" />
        <span>Mais contas</span>
      </div>
      {hover && (
        <div className="planeje-overview-map-tip" role="status">
          <strong>{hover.nome}</strong>
          <span>
            {hover.count
              ? `${hover.count} cliente${hover.count > 1 ? 's' : ''}`
              : 'Nenhum cliente cadastrado'}
          </span>
        </div>
      )}
    </div>
  );
}
