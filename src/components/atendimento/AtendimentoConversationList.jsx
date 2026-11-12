import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Loader2, MessageSquare, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatAtendimentoTime } from '@/hooks/useAtendimentoConversations';
import { audienceListTag } from '@/lib/atendimentoAudienceFilter';
import AtendimentoWaitTimeBadge from '@/components/atendimento/AtendimentoWaitTimeBadge';
import { grupoResponsavelLinha } from '@/lib/atendimentoGrupoResponsavel';

export default function AtendimentoConversationList({
  conversations,
  loading,
  selectedId,
  onSelect,
  isOverdue,
  emptyLabel,
  contextByConvId = {},
  assigneeNames = {},
}) {
  if (loading && conversations.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Carregando…
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="wa-list-empty flex-1">
        <div className="wa-list-empty-icon">
          <MessageSquare className="h-6 w-6 opacity-50" />
        </div>
        <p className="wa-text-sub font-medium">Nenhuma conversa</p>
        <p className="wa-text-caption mt-1 max-w-[220px]">{emptyLabel || 'Nenhuma conversa nesta aba.'}</p>
      </div>
    );
  }

  return (
    <ul className="flex-1 overflow-y-auto min-h-0">
      {conversations.map((conv) => {
        const overdue = isOverdue?.(conv);
        const label = conv.display_name || conv.chat_jid?.replace(/@.*$/, '') || 'Sem nome';
        const active = selectedId === conv.id;
        const ctx = contextByConvId[conv.id];
        const responsavel = grupoResponsavelLinha(conv, assigneeNames);
        const audienceTag = audienceListTag(ctx, conv);
        const extraTags = [
          ctx?.statusLabel && { key: 'status', label: ctx.statusLabel, style: ctx.statusColor ? { backgroundColor: ctx.statusColor, color: '#fff' } : undefined },
          ctx?.productName && { key: 'product', label: ctx.productName, className: 'wa-list-tag--muted truncate max-w-[120px]' },
          ctx?.hasProximaAcao && { key: 'task', label: '1 tarefa', className: 'wa-list-tag--task' },
          ctx?.agentName && { key: 'agent', label: ctx.agentName, className: 'wa-list-tag--agent truncate max-w-[90px]' },
        ].filter(Boolean);
        const allTags = [
          audienceTag && { key: 'audience', label: audienceTag.label, className: audienceTag.className },
          ...extraTags,
        ].filter(Boolean);
        const visibleTags = allTags.slice(0, 2);
        const hiddenCount = allTags.length - visibleTags.length;
        return (
          <li key={conv.id}>
            <button
              type="button"
              onClick={() => onSelect(conv)}
              className={cn('wa-list-item w-full flex items-start gap-3 p-3 text-left', active && 'is-active')}
            >
              <span className="wa-list-avatar">
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarImage src={conv.profile_pic_url || undefined} alt="" />
                  <AvatarFallback className="wa-list-avatar-fallback">
                    {conv.is_group ? <Users className="h-4 w-4" /> : label.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="wa-list-wa" aria-hidden title="WhatsApp">
                  <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor">
                    <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.95 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.87 1.22 3.07c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35z" />
                    <path d="M12.04 2C6.58 2 2.15 6.43 2.15 11.89c0 1.76.46 3.48 1.34 5L2 22l5.26-1.38a9.86 9.86 0 0 0 4.78 1.22h.01c5.46 0 9.89-4.43 9.89-9.89C21.94 6.43 17.5 2 12.04 2zm0 18.07h-.01a8.17 8.17 0 0 1-4.16-1.14l-.3-.18-3.12.82.83-3.04-.2-.31a8.18 8.18 0 0 1-1.26-4.37c0-4.52 3.68-8.2 8.21-8.2 4.52 0 8.2 3.68 8.2 8.2 0 4.53-3.68 8.22-8.19 8.22z" />
                  </svg>
                </span>
              </span>
              <div className="min-w-0 flex-1 py-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="wa-list-name truncate flex items-center gap-1">
                    {conv.is_group && <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                    {label}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="wa-list-time shrink-0">
                      {formatAtendimentoTime(conv.last_message_at)}
                    </span>
                    <AtendimentoWaitTimeBadge conversation={conv} />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <p className="wa-list-preview truncate flex-1">
                    {conv.last_message_preview || '—'}
                  </p>
                  <div className="flex items-center gap-1 shrink-0">
                    {overdue && (
                      <Badge variant="destructive" className="wa-badge-sm px-1.5 py-0 h-5">
                        SLA
                      </Badge>
                    )}
                    {conv.unread_count > 0 && (
                      <span className="wa-unread-badge inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[var(--wa-green)] text-white">
                        {conv.unread_count > 99 ? '99+' : conv.unread_count}
                      </span>
                    )}
                  </div>
                </div>
                {responsavel ? (
                  <p className={cn('wa-text-caption mt-1 truncate', responsavel.missing && 'wa-grupo-sem-responsavel')}>
                    {responsavel.text}
                  </p>
                ) : conv.assigned_to && !ctx?.agentName ? (
                  <p className="wa-text-caption mt-1 truncate">Atendente atribuído</p>
                ) : null}
                {(visibleTags.length > 0 || hiddenCount > 0) && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {visibleTags.map((tag) => (
                      <span
                        key={tag.key || tag.label}
                        className={cn('wa-list-tag', tag.className)}
                        style={tag.style}
                      >
                        {tag.label}
                      </span>
                    ))}
                    {hiddenCount > 0 && (
                      <span className="wa-list-tag wa-list-tag--muted">+{hiddenCount}</span>
                    )}
                  </div>
                )}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
