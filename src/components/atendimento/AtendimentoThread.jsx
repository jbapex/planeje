import { AtlasGroupTranscripts, AtlasAudioTranscript } from './AtlasGroupTranscripts';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, memo } from 'react';
import {
  CornerUpLeft,
  FileText,
  Forward,
  ImageIcon,
  ListTodo,
  Loader2,
  Play,
  RefreshCw,
  Smile,
  StickyNote,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import WaMessageAck from '@/components/atendimento/WaMessageAck';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatBubbleTime, messagesWithDateSeparators, ATENDIMENTO_REACTION_EMOJIS, canReactToThreadMessage, resolveEffectiveMediaKind, applyGroupSenderAvatars } from '@/lib/atendimentoMessageUtils';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import WaAudioPlayer from '@/components/atendimento/WaAudioPlayer';
import WaMediaImage from '@/components/atendimento/WaImageLightbox';
import { fetchAtendimentoMediaUrl, messageNeedsMediaDownload, triggerMediaFileDownload } from '@/lib/atendimentoMediaDownload';
import { ATENDIMENTO_MEDIA_RETENTION_DAYS } from '@/lib/atendimentoMediaRetention';
import { formatFileSize, formatUploadRemaining } from '@/lib/atendimentoMediaSend';

function MediaExpiredPlaceholder({ kind, fileName }) {
  const labels = {
    image: 'Imagem',
    sticker: 'Imagem',
    video: 'Vídeo',
    audio: 'Áudio',
    document: 'Documento',
    file: 'Arquivo',
  };
  const label = labels[kind] || 'Arquivo';
  return (
    <div className="wa-media-expired">
      <p className="wa-media-expired-title">[{label}] removida do sistema</p>
      {fileName && <p className="wa-text-caption truncate">{fileName}</p>}
      <p className="wa-text-caption text-muted-foreground">
        Mídias com mais de {ATENDIMENTO_MEDIA_RETENTION_DAYS} dias ficam apenas no celular.
      </p>
    </div>
  );
}

function MediaLazyPreview({ kind, previewUrl, fileName, loading, onActivate }) {
  const labels = {
    image: 'Ver imagem',
    sticker: 'Ver imagem',
    video: 'Reproduzir vídeo',
    audio: 'Ouvir áudio',
    document: 'Baixar arquivo',
    file: 'Baixar arquivo',
  };
  const actionLabel = labels[kind] || 'Carregar';

  const Icon =
    kind === 'video' ? Play : kind === 'audio' ? Volume2 : kind === 'document' || kind === 'file' ? FileText : ImageIcon;

  return (
    <button
      type="button"
      className="wa-media-lazy"
      onClick={onActivate}
      disabled={loading}
      aria-busy={loading}
      aria-label={actionLabel}
    >
      {previewUrl ? (
        <img src={previewUrl} alt="" className="wa-media-lazy-thumb" loading="lazy" />
      ) : (
        <div className="wa-media-lazy-fallback">
          <Icon className="h-8 w-8 text-muted-foreground" />
          {fileName && <span className="wa-media-lazy-filename truncate">{fileName}</span>}
        </div>
      )}
      <div className="wa-media-lazy-overlay">
        {loading ? (
          <>
            <Loader2 className="h-6 w-6 animate-spin" />
            <span>Carregando…</span>
          </>
        ) : (
          <>
            <Icon className="h-5 w-5" />
            <span>{actionLabel}</span>
          </>
        )}
      </div>
    </button>
  );
}

function MediaContent({ media, kind, msg, clienteId, fallbackWhatsappConfigId, isGroup }) {
  const playbackKind = resolveEffectiveMediaKind(kind, media, msg);

  if (msg.mediaPurged && playbackKind !== 'text') {
    return <MediaExpiredPlaceholder kind={playbackKind} fileName={media?.fileName} />;
  }

  const needsFetch = messageNeedsMediaDownload({ ...msg, kind: playbackKind, media });
  const autoLoadAudio = playbackKind === 'audio' && needsFetch;
  const autoLoadImage = isGroup && (playbackKind === 'image' || playbackKind === 'sticker') && needsFetch;
  const autoLoadMedia = autoLoadAudio || autoLoadImage;
  const previewUrl = media?.isThumbnail && media?.url ? media.url : null;
  const hasStableUrl = Boolean(media?.url && !needsFetch);

  const [loadRequested, setLoadRequested] = useState(false);
  const [displayUrl, setDisplayUrl] = useState(hasStableUrl ? media.url : null);
  const [mediaMeta, setMediaMeta] = useState({
    fileName: media?.fileName || null,
    mimetype: media?.mimetype || null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const fetchGen = useRef(0);

  const whatsappConfigId = msg.whatsappConfigId || fallbackWhatsappConfigId;
  const hasDownloadIds = Boolean(msg.uazapiMessageId) || (msg.downloadMessageIds?.length > 0);

  const applyMediaResult = (result) => {
    const url = typeof result === 'string' ? result : result?.url;
    if (!url) return false;
    setDisplayUrl(url);
    if (result && typeof result === 'object') {
      setMediaMeta({
        fileName: result.fileName || media?.fileName || null,
        mimetype: result.mimetype || media?.mimetype || null,
      });
    }
    setError(false);
    return true;
  };

  const runFetch = async () => {
    if (!hasDownloadIds || !clienteId) {
      setLoading(false);
      setError(true);
      setErrorMessage('ID da mensagem indisponível para download.');
      return;
    }
    const gen = ++fetchGen.current;
    setLoading(true);
    setError(false);
    setErrorMessage('');
    try {
      const result = await fetchAtendimentoMediaUrl({
        uazapiMessageId: msg.uazapiMessageId,
        messageIds: msg.downloadMessageIds,
        clienteId,
        whatsappConfigId,
        fileName: media?.fileName || undefined,
        mediaKind: playbackKind,
      });
      if (gen !== fetchGen.current) return;
      if (!applyMediaResult(result)) {
        setError(true);
        setErrorMessage('Mídia indisponível.');
      }
    } catch (err) {
      if (gen !== fetchGen.current) return;
      setError(true);
      setErrorMessage(err?.message || 'Não foi possível baixar a mídia.');
    } finally {
      if (gen === fetchGen.current) setLoading(false);
    }
  };

  const requestLoad = () => {
    if (!needsFetch || loading) return;
    setLoadRequested(true);
    runFetch();
  };

  useEffect(() => {
    fetchGen.current += 1;
    setLoadRequested(false);
    setError(false);
    setErrorMessage('');
    setLoading(false);

    if (hasStableUrl) {
      setDisplayUrl(media.url);
      setMediaMeta({ fileName: media?.fileName || null, mimetype: media?.mimetype || null });
      return;
    }

    setDisplayUrl(null);
    setMediaMeta({ fileName: media?.fileName || null, mimetype: media?.mimetype || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when message identity changes
  }, [msg.id, msg.uazapiMessageId, media?.url, media?.isThumbnail, clienteId, whatsappConfigId, hasStableUrl]);

  /** Áudio e imagens em grupo: baixa automaticamente ao exibir (estilo WhatsApp). */
  useEffect(() => {
    if (!autoLoadMedia || hasStableUrl || displayUrl) return;
    if (!hasDownloadIds || !clienteId) return;
    setLoadRequested(true);
    runFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch on message / media identity
  }, [autoLoadMedia, hasStableUrl, displayUrl, hasDownloadIds, clienteId, msg.id, msg.uazapiMessageId]);

  if (needsFetch && !displayUrl) {
    if (error && !loading) {
      const label =
        playbackKind === 'image' ? 'Imagem' : playbackKind === 'video' ? 'Vídeo' : playbackKind === 'audio' ? 'Áudio' : 'Arquivo';
      return (
        <div className="wa-media-error">
          <p className="italic">[{label}]</p>
          {errorMessage && <p className="wa-text-caption text-muted-foreground mt-1">{errorMessage}</p>}
          {hasDownloadIds && (
            <Button type="button" variant="ghost" size="sm" className="h-7 wa-text-caption gap-1" onClick={requestLoad}>
              <RefreshCw className="h-3 w-3" />
              Tentar baixar
            </Button>
          )}
        </div>
      );
    }

    if (autoLoadMedia) {
      const loadingLabel =
        playbackKind === 'audio'
          ? 'Carregando áudio…'
          : playbackKind === 'image' || playbackKind === 'sticker'
            ? 'Carregando imagem…'
            : 'Carregando mídia…';
      return (
        <div className="wa-media-loading wa-audio-autoload" aria-busy="true">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span>{loadingLabel}</span>
        </div>
      );
    }

    return (
      <MediaLazyPreview
        kind={playbackKind}
        previewUrl={previewUrl}
        fileName={media?.fileName}
        loading={loading}
        onActivate={requestLoad}
      />
    );
  }

  if (loading && !displayUrl) {
    return (
      <div className="wa-media-loading" aria-busy="true">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span>Carregando mídia…</span>
      </div>
    );
  }

  if (error && !displayUrl) {
    const label =
      playbackKind === 'image' ? 'Imagem' : playbackKind === 'video' ? 'Vídeo' : playbackKind === 'audio' ? 'Áudio' : 'Arquivo';
    return (
      <div className="wa-media-error">
        <p className="italic">[{label}]</p>
        {errorMessage && <p className="wa-text-caption text-muted-foreground mt-1">{errorMessage}</p>}
        {hasDownloadIds && (
          <Button type="button" variant="ghost" size="sm" className="h-7 wa-text-caption gap-1" onClick={requestLoad}>
            <RefreshCw className="h-3 w-3" />
            Tentar baixar
          </Button>
        )}
      </div>
    );
  }

  if (!displayUrl) {
    if (playbackKind === 'image') return <p className="wa-text-caption italic">[Imagem]</p>;
    if (playbackKind === 'video') return <p className="wa-text-caption italic">[Vídeo]</p>;
    if (playbackKind === 'audio') return <p className="wa-text-caption italic">[Áudio]</p>;
    if (playbackKind === 'document') return <p className="wa-text-caption italic">[Documento]</p>;
    return null;
  }

  const handleMediaLoadError = () => {
    if (hasDownloadIds && clienteId) {
      setLoadRequested(true);
      runFetch();
    }
  };

  if (playbackKind === 'image' || playbackKind === 'sticker') {
    return (
      <WaMediaImage
        src={displayUrl}
        alt={media?.caption || media?.fileName || 'Imagem'}
        fileName={mediaMeta.fileName || media?.fileName}
        mimetype={mediaMeta.mimetype || media?.mimetype || 'image/jpeg'}
        onError={handleMediaLoadError}
      />
    );
  }

  if (playbackKind === 'video') {
    return <video src={displayUrl} controls className="wa-media-video" preload="metadata" onError={handleMediaLoadError} />;
  }

  if (playbackKind === 'audio') {
    return (
      <WaAudioPlayer
        src={displayUrl}
        mimetype={mediaMeta.mimetype || media?.mimetype}
        isOutgoing={msg.direction === 'out'}
        onError={handleMediaLoadError}
      />
    );
  }

  const label = mediaMeta.fileName || media?.fileName || (playbackKind === 'document' ? 'Documento.pdf' : 'Baixar arquivo');

  const handleDocumentDownload = (e) => {
    e.preventDefault();
    triggerMediaFileDownload({
      url: displayUrl,
      fileName: mediaMeta.fileName || media?.fileName,
      mimetype: mediaMeta.mimetype || media?.mimetype,
    });
  };

  return (
    <button type="button" onClick={handleDocumentDownload} className="wa-media-file text-left w-full">
      <FileText className="h-8 w-8 shrink-0 text-[var(--wa-green-dark)]" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function BubbleQuote({ quote, onJump }) {
  if (!quote) return null;
  return (
    <button type="button" className="wa-bubble-quote w-full text-left" onClick={() => onJump?.(quote.messageId)}>
      {quote.author && <p className="wa-bubble-quote-author">{quote.author}</p>}
      <p className="wa-bubble-quote-text">{quote.text || 'Mensagem'}</p>
    </button>
  );
}

function BubbleReactions({ reactions, onReact }) {
  if (!reactions?.length) return null;
  return (
    <div className="wa-bubble-reactions">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          className="wa-bubble-reaction"
          onClick={() => onReact?.(r.emoji)}
          title="Reagir"
        >
          <span>{r.emoji}</span>
          {r.count > 1 && <span>{r.count}</span>}
        </button>
      ))}
    </div>
  );
}

function BubbleMeta({ at, isOut, ack, optimistic }) {
  return (
    <span className="wa-bubble-meta">
      <span className="wa-bubble-time">{formatBubbleTime(at)}</span>
      {isOut && <WaMessageAck ack={ack || (optimistic ? 'pending' : 'sent')} />}
    </span>
  );
}

function senderInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return '?';
}

function GroupSenderAvatar({ url, name, show }) {
  if (!show) {
    return <div className="wa-group-avatar-spacer" aria-hidden />;
  }
  return (
    <Avatar className="wa-group-avatar">
      <AvatarImage src={url || undefined} alt="" />
      <AvatarFallback className="wa-group-avatar-fallback text-[10px]">
        {senderInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

function MessageActions({ onReply, onForward, onReact, onDelete, onCreateTask, disabled, canReact, canDelete, showCreateTask }) {
  const [reactOpen, setReactOpen] = useState(false);

  if (disabled) return null;

  return (
    <div className="wa-bubble-actions">
      <div className="wa-bubble-actions-inner">
        {canReact && (
          <Popover open={reactOpen} onOpenChange={setReactOpen}>
            <PopoverTrigger asChild>
              <button type="button" className="wa-bubble-action-btn" aria-label="Reagir" title="Reagir">
                <Smile className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="center" side="top" className="w-auto p-1">
              <div className="wa-reaction-picker">
                {ATENDIMENTO_REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="text-xl leading-none p-1.5 rounded hover:bg-muted"
                    onClick={() => {
                      onReact?.(emoji);
                      setReactOpen(false);
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}
        <button type="button" className="wa-bubble-action-btn" aria-label="Responder" title="Responder" onClick={onReply}>
          <CornerUpLeft className="h-4 w-4" />
        </button>
        <button type="button" className="wa-bubble-action-btn" aria-label="Encaminhar" title="Encaminhar" onClick={onForward}>
          <Forward className="h-4 w-4" />
        </button>
        {showCreateTask && (
          <button
            type="button"
            className="wa-bubble-action-btn"
            aria-label="Criar tarefa"
            title="Criar tarefa desta mensagem"
            onClick={onCreateTask}
          >
            <ListTodo className="h-4 w-4" />
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            className="wa-bubble-action-btn text-red-600 hover:text-red-700"
            aria-label="Apagar para todos"
            title="Apagar para todos"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function UploadInThread({ upload, onCancel }) {
  const percent = Math.max(0, Math.min(100, Number(upload?.percent) || 0));
  const handingOff = upload?.phase === 'whatsapp';
  return (
    <div className="wa-upload-card" role="status">
      <div className="wa-upload-card-icon">
        <FileText className="h-5 w-5" aria-hidden />
        {upload?.cancellable ? (
          <button
            type="button"
            className="wa-upload-cancel"
            aria-label="Interromper envio"
            title="Interromper envio"
            onClick={onCancel}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="wa-upload-name truncate">{upload?.fileName || 'Arquivo'}</p>
        <p className="wa-upload-meta">
          {formatFileSize(upload?.fileSize)}
          {handingOff ? ' · O WhatsApp está recebendo' : ` · ${percent}%`}
          {handingOff ? '' : ` · ${formatUploadRemaining(upload?.remainingMs) || 'calculando o tempo'}`}
        </p>
        <p className="wa-upload-private">Só você vê este carregamento</p>
        <div className="wa-upload-bar" aria-hidden>
          <span style={{ width: `${handingOff ? 100 : percent}%` }} />
        </div>
      </div>
    </div>
  );
}

const MessageBubble = memo(function MessageBubble({
  msg,
  isGroup,
  clienteId,
  fallbackWhatsappConfigId,
  onReply,
  onReact,
  onForward,
  onDelete,
  onCreateTask,
  onJumpToMessage,
  onCancelUpload,
  actionsEnabled,
}) {
  const isOut = msg.direction === 'out';
  const hasText = Boolean(msg.body && String(msg.body).trim());
  const uploading = Boolean(msg.upload);
  const showMedia = msg.kind && msg.kind !== 'text' && !msg.deleted && !uploading;
  const canAct = actionsEnabled && Boolean(msg.id || msg.uazapiMessageId) && !msg.deleted && !uploading;
  const canReact = canReactToThreadMessage(msg) && !msg.deleted;
  const canDelete = isOut && !msg.deleted;
  const showCreateTask = Boolean(onCreateTask) && isGroup && !isOut && hasText;

  return (
    <div
      className={cn(
        'wa-row',
        isOut ? 'out' : 'in',
        !isOut && msg.groupContinuesFromPrev && 'wa-row--group-continue',
        !isOut && msg.groupContinuesToNext && 'wa-row--group-tail',
      )}
    >
      {isGroup && !isOut && (
        <GroupSenderAvatar
          url={msg.senderAvatarUrl}
          name={msg.senderName}
          show={msg.showSenderAvatar}
        />
      )}
      <div className="wa-bubble-wrap">
        <MessageActions
          onReply={() => onReply?.(msg)}
          onForward={() => onForward?.(msg)}
          onReact={(emoji) => onReact?.(msg, emoji)}
          onDelete={() => onDelete?.(msg)}
          onCreateTask={() => onCreateTask?.(msg)}
          disabled={!canAct}
          canReact={canReact}
          canDelete={canDelete}
          showCreateTask={showCreateTask}
        />
        <div
          className={cn(
            'wa-bubble',
            isOut ? 'out' : 'in',
            msg.deleted && 'wa-bubble--deleted',
            !isOut && msg.groupContinuesFromPrev && 'wa-bubble--group-continue',
          )}
        >
          {msg.isForwarded && !msg.deleted && (
            <p className="wa-bubble-forwarded">
              <Forward className="h-3 w-3" />
              Encaminhada
            </p>
          )}
          {isGroup && !isOut && msg.showSenderHeader && (
            <div className="wa-bubble-sender-wrap">
              <p
                className="wa-bubble-sender"
                style={msg.senderAccent ? { color: msg.senderAccent } : undefined}
              >
                {msg.senderName || msg.senderSubtitle || 'Participante'}
              </p>
              {msg.senderSubtitle && msg.senderName && msg.senderName !== msg.senderSubtitle && (
                <p className="wa-bubble-sender-phone">{msg.senderSubtitle}</p>
              )}
            </div>
          )}
          <BubbleQuote quote={msg.quote} onJump={onJumpToMessage} />
          {uploading && (
            <UploadInThread upload={msg.upload} onCancel={() => onCancelUpload?.(msg)} />
          )}
          {showMedia && (
            <MediaContent
              media={msg.media}
              kind={msg.kind}
              msg={msg}
              clienteId={clienteId}
              fallbackWhatsappConfigId={fallbackWhatsappConfigId}
              isGroup={isGroup}
            />
          )}
          {isGroup && !isOut && !msg.deleted && msg.kind === 'audio' && <AtlasAudioTranscript messageId={msg.id} />}
          {msg.deleted ? (
            <p className="wa-bubble-text wa-bubble-text--deleted">Esta mensagem foi apagada</p>
          ) : (hasText || !showMedia) && !(uploading && !hasText) ? (
            <div className="wa-bubble-copyable">
              <span className="wa-bubble-text">
                {hasText ? msg.body : '(mensagem)'}
              </span>
              <BubbleMeta
                at={msg.at}
                isOut={isOut}
                ack={msg.ack}
                optimistic={msg.optimistic}
              />
            </div>
          ) : (
            <div className="wa-bubble-meta-footer">
              <BubbleMeta
                at={msg.at}
                isOut={isOut}
                ack={msg.ack}
                optimistic={msg.optimistic}
              />
            </div>
          )}
        {!msg.deleted && (
          <BubbleReactions
            reactions={msg.reactions}
            onReact={canReact ? (emoji) => onReact?.(msg, emoji) : undefined}
          />
        )}
        </div>
      </div>
    </div>
  );
}, (prev, next) => (
  prev.msg === next.msg
  && prev.isGroup === next.isGroup
  && prev.clienteId === next.clienteId
  && prev.fallbackWhatsappConfigId === next.fallbackWhatsappConfigId
  && prev.actionsEnabled === next.actionsEnabled
));

function threadMessagesEqual(a, b) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const am = a[i];
    const bm = b[i];
    if (am === bm) continue;
    if (!am || !bm || am.id !== bm.id) return false;
    if (am.ack !== bm.ack) return false;
    if (am.body !== bm.body) return false;
    if (am.deleted !== bm.deleted) return false;
    if (am.optimistic !== bm.optimistic) return false;
    if (am.showSenderAvatar !== bm.showSenderAvatar) return false;
    if (am.upload?.percent !== bm.upload?.percent) return false;
    if (am.upload?.phase !== bm.upload?.phase) return false;
    if (am.upload?.remainingMs !== bm.upload?.remainingMs) return false;
    if (Boolean(am.upload) !== Boolean(bm.upload)) return false;
    if (JSON.stringify(am.reactions) !== JSON.stringify(bm.reactions)) return false;
  }
  return true;
}

function AtendimentoThread({
  messages,
  loading,
  loadingOlder = false,
  hasOlder = false,
  onLoadOlder,
  unreadAnchorId = null,
  entryToken = '',
  conversationKey = '',
  isGroup,
  clienteId,
  whatsappConfigId,
  onReply,
  onReact,
  onForward,
  onDelete,
  onCreateTask,
  onCancelUpload,
  actionsEnabled = true,
}) {
  const endRef = useRef(null);
  const threadRef = useRef(null);
  const contentRef = useRef(null);
  const pinEndRef = useRef(true);
  const pinningRef = useRef(false);
  const restoreRef = useRef(null);
  const lastIdRef = useRef(null);
  const entrySeenRef = useRef('');
  const convSeenRef = useRef('');
  const userScrollRef = useRef(false);
  const loadingOlderRef = useRef(loadingOlder);
  const hasOlderRef = useRef(hasOlder);
  const onLoadOlderRef = useRef(onLoadOlder);
  const unreadAnchorRef = useRef(unreadAnchorId);
  loadingOlderRef.current = loadingOlder;
  unreadAnchorRef.current = unreadAnchorId;
  hasOlderRef.current = hasOlder;
  onLoadOlderRef.current = onLoadOlder;

  const holdPin = (root, apply) => {
    if (!root) return;
    pinningRef.current = true;
    apply();
    requestAnimationFrame(() => {
      apply();
      requestAnimationFrame(() => {
        pinningRef.current = false;
      });
    });
  };

  const stickToEnd = (root) => {
    holdPin(root, () => {
      root.scrollTop = root.scrollHeight;
    });
  };

  const scrollToEntry = (root) => {
    if (unreadAnchorId) {
      const target = root.querySelector(`[data-message-id="${unreadAnchorId}"]`);
      if (target) {
        holdPin(root, () => {
          target.scrollIntoView({ block: 'start' });
        });
        pinEndRef.current = root.scrollHeight - root.scrollTop - root.clientHeight < 120;
        return;
      }
    }
    stickToEnd(root);
    pinEndRef.current = true;
  };

  useLayoutEffect(() => {
    const root = threadRef.current;
    if (!root) return;

    if (convSeenRef.current !== conversationKey) {
      convSeenRef.current = conversationKey;
      pinEndRef.current = true;
      userScrollRef.current = false;
      lastIdRef.current = null;
      entrySeenRef.current = '';
      restoreRef.current = null;
    }

    const last = messages[messages.length - 1];
    const lastId = last?.id ?? null;
    const newTail = Boolean(lastId) && lastId !== lastIdRef.current;
    lastIdRef.current = lastId;
    if (newTail && !restoreRef.current && (last?.optimistic || last?.direction === 'out')) {
      pinEndRef.current = true;
    }

    if (entryToken && entrySeenRef.current !== entryToken && messages.length) {
      entrySeenRef.current = entryToken;
      restoreRef.current = null;
      scrollToEntry(root);
      return;
    }

    if (restoreRef.current) {
      const saved = restoreRef.current;
      restoreRef.current = null;
      pinningRef.current = true;
      root.scrollTop = root.scrollHeight - saved.height + saved.top;
      pinningRef.current = false;
      return;
    }

    if (pinEndRef.current && messages.length) stickToEnd(root);
  }, [messages, conversationKey, entryToken, unreadAnchorId]);

  useEffect(() => {
    const root = threadRef.current;
    if (!root) return undefined;
    const timer = window.setInterval(() => {
      if (userScrollRef.current || unreadAnchorRef.current) return;
      const gap = root.scrollHeight - root.scrollTop - root.clientHeight;
      if (gap > 4) root.scrollTop = root.scrollHeight;
    }, 120);
    return () => window.clearInterval(timer);
  }, [conversationKey, messages.length]);

  useEffect(() => {
    const root = threadRef.current;
    const content = contentRef.current;
    if (!root || !content || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      if (!pinEndRef.current || restoreRef.current) return;
      const el = threadRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [conversationKey, messages.length]);

  useEffect(() => {
    const root = threadRef.current;
    if (!root || !hasOlder || loadingOlder || !messages.length) return;
    if (root.scrollHeight > root.clientHeight + 8) return;
    onLoadOlderRef.current?.();
  }, [messages, hasOlder, loadingOlder, conversationKey]);

  useEffect(() => {
    const root = threadRef.current;
    if (!root) return undefined;
    const mark = () => {
      userScrollRef.current = true;
    };
    root.addEventListener('wheel', mark, { passive: true });
    root.addEventListener('touchmove', mark, { passive: true });
    return () => {
      root.removeEventListener('wheel', mark);
      root.removeEventListener('touchmove', mark);
    };
  }, [conversationKey, messages.length]);

  const handleScroll = () => {
    const root = threadRef.current;
    if (!root || pinningRef.current) return;
    if (!userScrollRef.current) {
      if (pinEndRef.current) root.scrollTop = root.scrollHeight;
      return;
    }
    const gap = root.scrollHeight - root.scrollTop - root.clientHeight;
    pinEndRef.current = gap < 120;
    if (
      root.scrollTop < 72
      && root.scrollHeight > root.clientHeight + 8
      && hasOlderRef.current
      && !loadingOlderRef.current
    ) {
      restoreRef.current = { height: root.scrollHeight, top: root.scrollTop };
      onLoadOlderRef.current?.();
    }
  };

  const handleJumpToMessage = (messageId) => {
    if (!messageId || !threadRef.current) return;
    const el = threadRef.current.querySelector(`[data-uazapi-id="${messageId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const items = useMemo(() => {
    const chat = (messages || []).filter((m) => m.kind !== 'note');
    const notes = (messages || []).filter((m) => m.kind === 'note');
    const withAvatars = isGroup ? applyGroupSenderAvatars(chat) : chat;
    const merged = [...withAvatars, ...notes].sort(
      (a, b) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime(),
    );
    return messagesWithDateSeparators(merged);
  }, [messages, isGroup]);

  if (loading && messages.length === 0) {
    return (
      <div className="wa-thread flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="wa-thread flex items-center justify-center wa-text-sub">
        Nenhuma mensagem ainda.
      </div>
    );
  }

  return (
    <AtlasGroupTranscripts messages={messages} isGroup={isGroup}><div className="wa-thread" ref={threadRef} onScroll={handleScroll}>
      <div ref={contentRef}>
      {loadingOlder && (
        <div className="wa-thread-older">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          <span>Carregando anteriores…</span>
        </div>
      )}
      {items.map((item) => {
        if (item.type === 'date') {
          return (
            <div key={item.id} className="wa-date-pill">
              <span>{item.label}</span>
            </div>
          );
        }
        const unreadDivider = unreadAnchorId && item.id === unreadAnchorId ? (
          <div className="wa-unread-pill" key={`unread-${item.id}`}>
            <span>Não lidas</span>
          </div>
        ) : null;
        if (item.kind === 'note') {
          return (
            <div key={item.id}>
              {unreadDivider}
            <div className="atl-note-row">
              <div className="atl-note">
                <header>
                  <StickyNote className="h-3.5 w-3.5" aria-hidden />
                  <strong>Nota interna · {item.autor || 'Equipe'}</strong>
                  <time>{formatBubbleTime(item.at)}</time>
                </header>
                <p>{item.body}</p>
              </div>
            </div>
            </div>
          );
        }
        return (
          <div key={item.id} data-message-id={item.id} data-uazapi-id={item.uazapiMessageId || undefined}>
            {unreadDivider}
            <MessageBubble
              msg={item}
              isGroup={isGroup}
              clienteId={clienteId}
              fallbackWhatsappConfigId={whatsappConfigId}
              onReply={onReply}
              onReact={onReact}
              onForward={onForward}
              onDelete={onDelete}
              onCreateTask={onCreateTask}
              onCancelUpload={onCancelUpload}
              onJumpToMessage={handleJumpToMessage}
              actionsEnabled={actionsEnabled}
            />
          </div>
        );
      })}
      <div ref={endRef} />
      </div>
    </div></AtlasGroupTranscripts>
  );
}

export default memo(AtendimentoThread, (prev, next) => {
  if (prev.loading !== next.loading) return false;
  if (prev.loadingOlder !== next.loadingOlder) return false;
  if (prev.hasOlder !== next.hasOlder) return false;
  if (prev.unreadAnchorId !== next.unreadAnchorId) return false;
  if (prev.entryToken !== next.entryToken) return false;
  if (prev.conversationKey !== next.conversationKey) return false;
  if (prev.isGroup !== next.isGroup) return false;
  if (prev.clienteId !== next.clienteId) return false;
  if (prev.whatsappConfigId !== next.whatsappConfigId) return false;
  if (prev.actionsEnabled !== next.actionsEnabled) return false;
  if (!threadMessagesEqual(prev.messages, next.messages)) return false;
  return true;
});
