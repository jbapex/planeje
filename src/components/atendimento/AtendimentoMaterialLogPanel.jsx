import React from 'react';
import {
  FileText,
  Image,
  Link2,
  Loader2,
  MessageSquare,
  Music,
  Send,
  Video,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMaterialLogTime, sendKindLabel } from '@/lib/atendimentoMaterialLog';
import { useAtendimentoMaterialLog } from '@/hooks/useAtendimentoMaterialLog';

function KindIcon({ kind, className }) {
  const props = { className: cn('h-4 w-4 shrink-0', className) };
  if (kind === 'image') return <Image {...props} />;
  if (kind === 'document') return <FileText {...props} />;
  if (kind === 'audio') return <Music {...props} />;
  if (kind === 'video') return <Video {...props} />;
  if (kind === 'link') return <Link2 {...props} />;
  return <MessageSquare {...props} />;
}

export default function AtendimentoMaterialLogPanel({
  clienteId,
  conversation,
  csGroup,
  compact = false,
  className,
}) {
  const { entries, loading, stats } = useAtendimentoMaterialLog({
    clienteId,
    conversation,
    csGroup,
    limit: compact ? 8 : 25,
  });

  if (!conversation) return null;

  const summaryParts = [];
  if (stats.image) summaryParts.push(`${stats.image} img`);
  if (stats.document) summaryParts.push(`${stats.document} arq`);
  if (stats.link) summaryParts.push(`${stats.link} link`);
  if (stats.audio) summaryParts.push(`${stats.audio} áud`);
  if (stats.text) summaryParts.push(`${stats.text} txt`);

  return (
    <div className={cn('wa-material-log', compact && 'wa-material-log--compact', className)}>
      <div className="wa-material-log-header">
        <div className="flex items-center gap-2">
          <Send className="h-4 w-4 text-[#667781]" />
          <h3>Materiais enviados</h3>
        </div>
        {stats.total > 0 && (
          <p className="wa-material-log-summary">
            {stats.total} envio{stats.total !== 1 ? 's' : ''}
            {summaryParts.length > 0 ? ` · ${summaryParts.join(' · ')}` : ''}
          </p>
        )}
      </div>

      {loading && entries.length === 0 ? (
        <div className="flex items-center justify-center py-6 text-[#667781]">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          <span className="wa-text-caption">Carregando…</span>
        </div>
      ) : entries.length === 0 ? (
        <p className="wa-text-caption py-4 px-1">
          Nenhum envio registrado nesta conversa ainda.
        </p>
      ) : (
        <ul className="wa-material-log-list">
          {entries.map((entry) => (
            <li key={`${entry.source}-${entry.id}`} className="wa-material-log-item">
              <div className="wa-material-log-icon">
                <KindIcon kind={entry.sendKind} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="wa-material-log-item-title truncate" title={entry.label}>
                  {entry.fileName || entry.label}
                </p>
                <p className="wa-material-log-item-meta flex flex-wrap gap-x-1.5">
                  <span>{sendKindLabel(entry.sendKind)}</span>
                  <span>·</span>
                  <span>{formatMaterialLogTime(entry.at)}</span>
                  {entry.agentName && (
                    <>
                      <span>·</span>
                      <span className="truncate max-w-[100px]">{entry.agentName}</span>
                    </>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
