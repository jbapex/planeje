import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FileText, ImageIcon, Loader2, MessageSquare, Mic, Paperclip, Send, Smile, Square, StickyNote, X } from 'lucide-react';
import {
  ATENDIMENTO_AGENCIA_DOC_MAX_BYTES,
  ATENDIMENTO_EMOJIS,
  ATENDIMENTO_MEDIA_MAX_BYTES,
  formatFileSize,
  insertTextAtCursor,
  validateAtendimentoMediaFile,
} from '@/lib/atendimentoMediaSend';

function pickRecorderMime() {
  if (typeof window === 'undefined' || typeof window.MediaRecorder === 'undefined') return '';
  const options = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm'];
  return options.find((type) => window.MediaRecorder.isTypeSupported?.(type)) || '';
}

function PendingMediaIcon({ mediaType }) {
  if (mediaType === 'image') return <ImageIcon className="h-5 w-5" />;
  if (mediaType === 'audio' || mediaType === 'ptt') return <Mic className="h-5 w-5" />;
  return <FileText className="h-5 w-5" />;
}

export default function AtendimentoComposer({
  value,
  onChange,
  onSend,
  onSendMedia,
  onSaveNote,
  sending,
  sendStatus = '',
  disabled,
  replyTarget,
  onCancelReply,
  conversationId,
  hideNotes = false,
  messageLabel = 'Mensagem',
  maxLength,
  maxMediaBytes = ATENDIMENTO_AGENCIA_DOC_MAX_BYTES,
}) {
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const prevSendingRef = useRef(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [pendingMedia, setPendingMedia] = useState(null);
  const [mode, setMode] = useState('message');
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [recording, setRecording] = useState(null);
  const recordingRef = useRef(null);
  const noteMode = mode === 'note';

  const stopRecording = useCallback((cancel) => {
    const state = recordingRef.current;
    if (!state) return;
    state.cancel = Boolean(cancel);
    try {
      if (state.recorder.state !== 'inactive') state.recorder.stop();
      else {
        state.stream.getTracks().forEach((track) => track.stop());
        recordingRef.current = null;
        setRecording(null);
      }
    } catch {
      state.stream.getTracks().forEach((track) => track.stop());
      recordingRef.current = null;
      setRecording(null);
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (recordingRef.current || sending || disabled || noteMode) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof window.MediaRecorder === 'undefined') {
      onSendMedia?.(null, null, null, 'Este navegador não grava áudio.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickRecorderMime();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      const chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunks.push(event.data);
      };
      const state = {
        recorder,
        stream,
        startedAt: Date.now(),
        mimeType: recorder.mimeType || mimeType,
        cancel: false,
        tick: 0,
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        recordingRef.current = null;
        setRecording(null);
        if (state.cancel || !chunks.length) return;
        const type = state.mimeType || 'audio/webm';
        const ext = type.includes('ogg') ? 'ogg' : 'webm';
        const file = new File(chunks, `audio-${Date.now()}.${ext}`, { type: type.split(';')[0] });
        if (file.size > ATENDIMENTO_MEDIA_MAX_BYTES) {
          onSendMedia?.(null, null, null, 'Áudio muito longo. Máximo 4 MB.');
          return;
        }
        const previewUrl = URL.createObjectURL(file);
        setPendingMedia((prev) => {
          if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
          return { file, mediaType: 'ptt', previewUrl, voice: true };
        });
      };
      recordingRef.current = state;
      recorder.start(250);
      setRecording(state);
    } catch {
      onSendMedia?.(null, null, null, 'Microfone não liberado neste navegador.');
    }
  }, [sending, disabled, noteMode, onSendMedia]);

  useEffect(() => {
    setMode('message');
    setNoteText('');
    stopRecording(true);
  }, [conversationId, stopRecording]);

  useEffect(() => {
    if (noteMode) stopRecording(true);
  }, [noteMode, stopRecording]);

  useEffect(() => {
    if (!recording) return undefined;
    const timer = window.setInterval(() => {
      setRecording((prev) => (prev ? { ...prev, tick: (prev.tick || 0) + 1 } : prev));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [recording?.startedAt]);

  useEffect(() => () => {
    const state = recordingRef.current;
    if (!state) return;
    state.cancel = true;
    try {
      state.recorder.stop();
    } catch {
      state.stream.getTracks().forEach((track) => track.stop());
    }
  }, []);

  const focusComposer = useCallback(() => {
    if (disabled || sending || emojiOpen) return;
    const el = textareaRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      try {
        el.focus({ preventScroll: false });
      } catch {
        el.focus();
      }
      const len = el.value?.length ?? 0;
      try {
        el.setSelectionRange(len, len);
      } catch {
        /* ignore */
      }
    });
  }, [disabled, sending, emojiOpen]);

  useEffect(() => {
    if (!conversationId || disabled) return;
    focusComposer();
  }, [conversationId, disabled, focusComposer]);

  useEffect(() => {
    if (prevSendingRef.current && !sending) {
      focusComposer();
    }
    prevSendingRef.current = sending;
  }, [sending, focusComposer]);

  const clearPendingMedia = () => {
    setPendingMedia((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  };

  useEffect(() => {
    setPendingMedia((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  }, [conversationId]);

  useEffect(
    () => () => {
      if (pendingMedia?.previewUrl) URL.revokeObjectURL(pendingMedia.previewUrl);
    },
    [pendingMedia?.previewUrl]
  );

  const handleInput = (e) => {
    onChange(e.target.value);
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
  };

  const handleEmojiPick = (emoji) => {
    insertTextAtCursor(textareaRef.current, value, emoji, onChange);
    setEmojiOpen(false);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const check = validateAtendimentoMediaFile(file, {
      maxBytes: maxMediaBytes,
      allowAnyDocument: true,
    });
    if (!check.ok) {
      onSendMedia?.(null, null, null, check.message);
      return;
    }

    clearPendingMedia();
    const previewUrl = check.mediaType === 'image' ? URL.createObjectURL(file) : null;
    setPendingMedia({
      file,
      mediaType: check.mediaType,
      previewUrl,
      viaUrl: Boolean(check.viaUrl),
    });
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const handleSendClick = async () => {
    if (sending || disabled) return;

    if (pendingMedia && onSendMedia) {
      const caption = pendingMedia.voice ? '' : (value || '').trim();
      const { file, mediaType } = pendingMedia;
      const sent = await onSendMedia(file, mediaType, caption);
      if (sent) {
        clearPendingMedia();
        if (!pendingMedia.voice) onChange('');
        const el = textareaRef.current;
        if (el) el.style.height = 'auto';
        focusComposer();
      }
      return;
    }

    if ((value || '').trim()) {
      await onSend?.();
      focusComposer();
    }
  };

  const canSend =
    Boolean(pendingMedia || (value || '').trim()) && !sending && !disabled;

  const handleSaveNote = async () => {
    const clean = noteText.trim();
    if (!clean || savingNote || !onSaveNote) return;
    setSavingNote(true);
    try {
      const ok = await onSaveNote(clean);
      if (ok !== false) setNoteText('');
    } finally {
      setSavingNote(false);
    }
  };

  const inputPlaceholder = pendingMedia ? 'Adicione uma legenda…' : 'Digite sua mensagem…';

  return (
    <div className="wa-composer">
      {replyTarget && (
        <div className="wa-reply-bar">
          <div className="wa-reply-bar-accent" />
          <div className="wa-reply-bar-body">
            <p className="wa-reply-bar-label">Respondendo {replyTarget.senderName}</p>
            <p className="wa-reply-bar-text">{replyTarget.preview}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={onCancelReply}
            aria-label="Cancelar resposta"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {pendingMedia && (
        <div className={`wa-attachment-preview${pendingMedia.voice ? ' is-voice' : ''}`}>
          <div className="wa-attachment-preview-thumb">
            {pendingMedia.previewUrl && !pendingMedia.voice ? (
              <img src={pendingMedia.previewUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <PendingMediaIcon mediaType={pendingMedia.mediaType} />
            )}
          </div>
          <div className="wa-attachment-preview-body min-w-0">
            <p className="wa-attachment-preview-label">
              {pendingMedia.voice
                ? 'Áudio gravado'
                : pendingMedia.mediaType === 'image'
                  ? 'Imagem'
                  : pendingMedia.mediaType === 'audio' || pendingMedia.mediaType === 'ptt'
                    ? 'Áudio'
                    : 'Documento'}
            </p>
            {pendingMedia.voice && pendingMedia.previewUrl ? (
              <>
                <audio className="wa-voice-preview" controls src={pendingMedia.previewUrl} />
                <p className="wa-attachment-preview-name">Ainda não foi enviado. Confirme no botão de enviar.</p>
              </>
            ) : (
              <p className="wa-attachment-preview-name truncate">
                {pendingMedia.viaUrl
                  ? `${pendingMedia.file.name} · ${formatFileSize(pendingMedia.file.size)} · documento, até 1 GB`
                  : pendingMedia.file.name}
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={clearPendingMedia}
            disabled={sending}
            aria-label="Remover anexo"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {sending && sendStatus ? (
        <p className="wa-upload-status" role="status">{sendStatus}</p>
      ) : null}
      <div className={`wa-composer-box${noteMode ? ' is-note-mode' : ''}`}>
        {!hideNotes && <div className="wa-composer-top">
          <div className="wa-composer-pills" role="tablist" aria-label="Tipo de envio">
            <button
              type="button"
              role="tab"
              aria-selected={!noteMode}
              className={!noteMode ? 'is-on' : undefined}
              onClick={() => setMode('message')}
            >
              <MessageSquare className="h-3.5 w-3.5" aria-hidden />
              Mensagem
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={noteMode}
              className={noteMode ? 'is-on' : undefined}
              onClick={() => setMode('note')}
            >
              <FileText className="h-3.5 w-3.5" aria-hidden />
              Notas
            </button>
          </div>
        </div>}
        <input
          ref={fileInputRef}
          type="file"
          className="sr-only"
          aria-hidden
          onChange={handleFileChange}
          disabled={sending || disabled || noteMode || Boolean(recording)}
        />
        {recording && !noteMode ? (
          <div className="wa-recording" role="status">
            <span className="wa-recording-dot" aria-hidden />
            Gravando {String(Math.floor((recording.tick || 0) / 60))}:{String((recording.tick || 0) % 60).padStart(2, '0')}
            <button type="button" className="wa-recording-cancel" onClick={() => stopRecording(true)}>
              Cancelar
            </button>
            <button type="button" className="wa-recording-stop" onClick={() => stopRecording(false)}>
              <Square className="h-3 w-3" /> Parar
            </button>
          </div>
        ) : noteMode ? (
          <div className="wa-composer-field is-note">
            <textarea
              className="wa-composer-input"
              placeholder="Nota interna: fica gravada para a equipe e não vai ao contato."
              rows={2}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSaveNote();
                }
              }}
              disabled={savingNote}
              aria-label="Nota interna"
            />
          </div>
        ) : (
          <div className="wa-composer-field">
            <textarea
              ref={textareaRef}
              className="wa-composer-input"
              placeholder={inputPlaceholder}
              rows={2}
              value={value}
              aria-label={messageLabel}
              maxLength={maxLength}
              onChange={handleInput}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (canSend) handleSendClick();
                }
              }}
              disabled={sending || disabled}
            />
          </div>
        )}
        <div className="wa-composer-tools">
          <div className="wa-composer-tools-left">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="wa-composer-icon shrink-0"
              disabled={sending || disabled || noteMode || Boolean(recording)}
              onClick={() => fileInputRef.current?.click()}
              aria-label={`Anexar arquivo até ${formatFileSize(maxMediaBytes)}`}
              title={`Anexar arquivo até ${formatFileSize(maxMediaBytes)}`}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="wa-composer-icon shrink-0"
                  disabled={sending || disabled || noteMode || Boolean(recording)}
                  aria-label="Emoji"
                >
                  <Smile className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" side="top" className="w-[280px] p-2">
                <div className="grid grid-cols-8 gap-0.5 max-h-[200px] overflow-y-auto">
                  {ATENDIMENTO_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className="text-xl leading-none p-1.5 rounded hover:bg-muted transition-colors"
                      onClick={() => handleEmojiPick(emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          {noteMode ? (
            <Button
              type="button"
              size="icon"
              className="wa-send-btn is-note-send shrink-0"
              onClick={handleSaveNote}
              disabled={savingNote || !noteText.trim()}
              aria-label="Gravar nota"
              title="Gravar nota interna"
            >
              {savingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <StickyNote className="h-4 w-4" />}
            </Button>
          ) : (
            <div className="wa-composer-tools-right">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={`wa-composer-icon wa-mic-btn shrink-0${recording ? ' is-recording' : ''}`}
                onClick={() => (recording ? stopRecording(false) : startRecording())}
                disabled={sending || disabled}
                aria-label={recording ? 'Parar gravação' : 'Gravar áudio'}
                title={recording ? 'Parar, sem enviar' : 'Gravar áudio'}
              >
                <Mic className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                className="wa-send-btn shrink-0"
                onClick={handleSendClick}
                disabled={!canSend || Boolean(recording)}
                aria-label={pendingMedia?.voice ? 'Enviar áudio' : 'Enviar'}
                title={pendingMedia?.voice ? 'Enviar áudio' : 'Enviar'}
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
