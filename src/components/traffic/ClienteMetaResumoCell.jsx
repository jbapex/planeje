import {
  snapshotListSummary,
  snapshotRunningLabel,
  snapshotSoldLabel,
  snapshotObjectiveLines,
  snapshotSyncedLabel,
} from '@/lib/clienteMetaSnapshot';

export default function ClienteMetaResumoCell({ snapshot, compact = false }) {
  if (!snapshot) {
    return <span className="trafego-resumo-empty">Ainda não sincronizou a Meta</span>;
  }
  const { running, lines, sold } = snapshotListSummary(snapshot);
  const names = (snapshot.running || []).slice(0, compact ? 1 : 2).map((c) => c.name);
  return (
    <div className={`trafego-resumo ${compact ? 'is-compact' : ''}`}>
      <p className="trafego-resumo-running">{running}</p>
      {names.length ? (
        <p className="trafego-resumo-names" title={snapshot.running.map((c) => c.name).join(' · ')}>
          {names.join(' · ')}
          {snapshot.running.length > names.length ? ` +${snapshot.running.length - names.length}` : ''}
        </p>
      ) : null}
      {lines.map((item) => (
        <p key={item.key} className="trafego-resumo-obj">
          <span>{item.label}</span>
          {item.active ? <em>{item.active} no ar</em> : null}
          <strong>{item.line}</strong>
        </p>
      ))}
      <p className={`trafego-resumo-sold is-${sold.tone}`}>{sold.text}</p>
      {!compact && snapshotSyncedLabel(snapshot) ? (
        <p className="trafego-resumo-sync">{snapshotSyncedLabel(snapshot)}</p>
      ) : null}
    </div>
  );
}

export function ClienteMetaResumoInline({ snapshot }) {
  if (!snapshot) return <span className="text-xs text-muted-foreground">Tráfego: sem snapshot</span>;
  const running = snapshotRunningLabel(snapshot);
  const sold = snapshotSoldLabel(snapshot);
  const top = snapshotObjectiveLines(snapshot)[0];
  return (
    <p className="planeje-clients-meta-inline">
      {running}
      {top ? ` · ${top.label}: ${top.line}` : ''}
      {` · ${sold.text}`}
    </p>
  );
}
