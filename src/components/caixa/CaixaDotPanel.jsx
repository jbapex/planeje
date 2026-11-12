import React, { useEffect, useMemo, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Archive,
  Check,
  Inbox,
  Loader2,
  MessageSquarePlus,
  RefreshCw,
  Send,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { useCaixaDot } from '@/hooks/useCaixaDot';
import { CAIXA_DOT_STATUS, isOpenDotStatus } from '@/lib/caixaDot';
import { cn } from '@/lib/utils';

function relativeTime(raw) {
  if (!raw) return 'agora';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return 'agora';
  return formatDistanceToNow(date, { addSuffix: true, locale: ptBR });
}

function kindLabel(kind) {
  if (kind === 'demanda') return 'Demanda';
  if (kind === 'aviso') return 'Aviso';
  return 'Conversa';
}

function statusLabel(status) {
  if (status === 'feita') return 'Feita';
  if (status === 'arquivada') return 'Arquivada';
  if (status === 'respondido') return 'Respondido';
  if (status === 'aguardando_dot') return 'Aguardando Dot';
  if (status === 'erro') return 'Erro do Dot';
  return 'Aberta';
}

function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm',
          isUser && 'bg-primary text-primary-foreground',
          isSystem && 'border border-border/70 bg-muted/60 text-foreground',
          !isUser && !isSystem && 'border border-border/70 bg-background text-foreground'
        )}
      >
        {!isUser ? (
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {isSystem ? 'Sistema' : 'Dot'}
          </p>
        ) : null}
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
        <p
          className={cn(
            'mt-1.5 text-[10px]',
            isUser ? 'text-primary-foreground/75' : 'text-muted-foreground'
          )}
        >
          {relativeTime(message.created_at)}
        </p>
      </div>
    </div>
  );
}

export default function CaixaDotPanel() {
  const { toast } = useToast();
  const {
    threads,
    equipe,
    messages,
    selectedId,
    unreadTotal,
    loading,
    loadingMessages,
    error,
    sending,
    dotThinking,
    isAdmin,
    reload,
    openThread,
    createThread,
    sendMessage,
    retryDot,
    setStatus,
  } = useCaixaDot();

  const [view, setView] = useState('meus');
  const [draft, setDraft] = useState('');
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const bottomRef = useRef(null);

  const selected = useMemo(
    () => threads.find((t) => t.id === selectedId) || null,
    [selectedId, threads]
  );

  const openThreads = useMemo(
    () => threads.filter((t) => isOpenDotStatus(t.status) || t.status === CAIXA_DOT_STATUS.FEITA),
    [threads]
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, selectedId]);

  const handleCreate = async () => {
    try {
      await createThread({ title: newTitle, body: newBody });
      setCreating(false);
      setNewTitle('');
      setNewBody('');
      toast({ title: 'Tópico criado' });
    } catch (err) {
      toast({
        title: 'Não foi possível criar o tópico',
        description: err?.message || String(err),
        variant: 'destructive',
      });
    }
  };

  const handleSend = async () => {
    try {
      await sendMessage(draft);
      setDraft('');
    } catch (err) {
      toast({
        title: 'Não foi possível enviar',
        description: err?.message || String(err),
        variant: 'destructive',
      });
    }
  };

  const handleRetryDot = async () => {
    try {
      await retryDot();
      toast({ title: 'Dot respondeu' });
    } catch (err) {
      toast({
        title: 'Dot não respondeu',
        description: err?.message || String(err),
        variant: 'destructive',
      });
    }
  };

  const handleStatus = async (status) => {
    if (!selectedId) return;
    try {
      await setStatus(selectedId, status);
      toast({
        title: status === 'feita' ? 'Tópico marcado como feito' : 'Tópico arquivado',
      });
    } catch (err) {
      toast({
        title: 'Não foi possível atualizar',
        description: err?.message || String(err),
        variant: 'destructive',
      });
    }
  };

  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="font-semibold text-destructive">Dot ainda não disponível</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {error?.message || 'Não foi possível carregar os tópicos.'}
        </p>
        <Button type="button" variant="outline" className="mt-3" onClick={() => reload()}>
          Tentar de novo
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={view === 'meus' ? 'default' : 'outline'}
            className="rounded-xl"
            onClick={() => setView('meus')}
          >
            <Inbox className="mr-1.5 h-3.5 w-3.5" />
            Meus tópicos
            {unreadTotal > 0 ? (
              <Badge variant="secondary" className="ml-1.5 h-5 min-w-5 px-1.5">
                {unreadTotal}
              </Badge>
            ) : null}
          </Button>
          {isAdmin ? (
            <Button
              type="button"
              size="sm"
              variant={view === 'equipe' ? 'default' : 'outline'}
              className="rounded-xl"
              onClick={() => setView('equipe')}
            >
              <Users className="mr-1.5 h-3.5 w-3.5" />
              Equipe
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-xl"
            onClick={() => setCreating((v) => !v)}
          >
            <MessageSquarePlus className="mr-1.5 h-3.5 w-3.5" />
            Novo tópico
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-9 w-9 rounded-xl"
            aria-label="Atualizar Dot"
            onClick={() => reload()}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {creating ? (
        <div className="rounded-2xl border bg-background p-4 space-y-3">
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Título do tópico"
            maxLength={200}
          />
          <Textarea
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            placeholder="Primeira mensagem (opcional)"
            rows={3}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleCreate} disabled={sending || !newTitle.trim()}>
              {sending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Criar
            </Button>
          </div>
        </div>
      ) : null}

      {view === 'equipe' && isAdmin ? (
        <div className="rounded-2xl border bg-background overflow-hidden">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Carregando equipe…
            </div>
          ) : equipe.length === 0 ? (
            <div className="flex min-h-40 flex-col items-center justify-center px-4 py-8 text-center">
              <Users className="mb-2 h-6 w-6 text-muted-foreground/50" />
              <p className="text-sm font-medium text-muted-foreground">Nenhuma demanda aberta</p>
            </div>
          ) : (
            <div className="divide-y">
              {equipe.map((row) => (
                <div key={row.owner_id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{row.full_name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.last_title || 'Sem título'} · {relativeTime(row.last_message_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="outline">{row.abertas} aberta{row.abertas === 1 ? '' : 's'}</Badge>
                    {row.nao_lidas > 0 ? (
                      <Badge>{row.nao_lidas} nova{row.nao_lidas === 1 ? '' : 's'}</Badge>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="grid min-h-[28rem] overflow-hidden rounded-2xl border bg-background lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="border-b lg:border-b-0 lg:border-r">
            <div className="max-h-[40vh] overflow-y-auto lg:max-h-[min(70vh,40rem)]">
              {loading ? (
                <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Carregando…
                </div>
              ) : openThreads.length === 0 ? (
                <div className="flex min-h-40 flex-col items-center justify-center px-4 py-8 text-center">
                  <Inbox className="mb-2 h-6 w-6 text-muted-foreground/50" />
                  <p className="text-sm font-medium text-muted-foreground">Nenhum tópico ainda</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Crie um ou espere uma demanda do MCP.
                  </p>
                </div>
              ) : (
                openThreads.map((thread) => (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => openThread(thread.id)}
                    className={cn(
                      'flex w-full flex-col gap-1 border-b px-3.5 py-3 text-left transition hover:bg-muted/50',
                      selectedId === thread.id && 'bg-muted/70'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-1 text-sm font-semibold">{thread.title}</p>
                      {thread.unread_for_owner ? (
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      ) : null}
                    </div>
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {thread.last_message_preview || 'Sem mensagens'}
                    </p>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span>{kindLabel(thread.kind)}</span>
                      <span>·</span>
                      <span>{statusLabel(thread.status)}</span>
                      <span>·</span>
                      <span>{relativeTime(thread.last_message_at)}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </aside>

          <section className="flex min-h-[22rem] flex-col">
            {!selected ? (
              <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 text-center">
                <Inbox className="mb-2 h-7 w-7 text-muted-foreground/45" />
                <p className="text-sm font-medium text-muted-foreground">Escolha um tópico</p>
                <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                  Envie uma mensagem e o Dot responde aqui no Planeje. Sem WhatsApp.
                </p>
              </div>
            ) : (
              <>
                <header className="flex items-start justify-between gap-3 border-b px-4 py-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold">{selected.title}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {kindLabel(selected.kind)} · {statusLabel(selected.status)}
                      {selected.origin === 'mcp' ? ' · veio do MCP' : null}
                    </p>
                    {selected.href ? (
                      <a
                        href={selected.href}
                        className="mt-1 inline-block text-xs font-medium text-primary hover:underline"
                      >
                        Abrir link
                      </a>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-xl"
                      onClick={() => handleStatus('feita')}
                      disabled={dotThinking}
                    >
                      <Check className="mr-1 h-3.5 w-3.5" />
                      Feito
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 rounded-xl"
                      aria-label="Arquivar"
                      onClick={() => handleStatus('arquivada')}
                      disabled={dotThinking}
                    >
                      <Archive className="h-4 w-4" />
                    </Button>
                  </div>
                </header>

                <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                  {loadingMessages ? (
                    <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Carregando mensagens…
                    </div>
                  ) : (
                    messages.map((message) => (
                      <MessageBubble key={message.id} message={message} />
                    ))
                  )}
                  {dotThinking || selected.status === 'aguardando_dot' ? (
                    <div className="flex items-center gap-2 rounded-2xl border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Dot está pensando…
                    </div>
                  ) : null}
                  {selected.status === 'erro' ? (
                    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm">
                      <p className="font-medium text-destructive">O Dot não conseguiu responder</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {selected.last_error || 'Tente de novo.'}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mt-2 rounded-xl"
                        onClick={handleRetryDot}
                        disabled={dotThinking}
                      >
                        {dotThinking ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : null}
                        Tentar de novo
                      </Button>
                    </div>
                  ) : null}
                  <div ref={bottomRef} />
                </div>

                <footer className="border-t p-3">
                  <div className="flex items-end gap-2">
                    <Textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Escreva uma mensagem…"
                      rows={2}
                      className="min-h-[2.75rem] resize-none"
                      disabled={sending || dotThinking}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          if (draft.trim() && !sending && !dotThinking) handleSend();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      size="icon"
                      className="h-10 w-10 shrink-0 rounded-full"
                      disabled={!draft.trim() || sending || dotThinking}
                      onClick={handleSend}
                      aria-label="Enviar"
                    >
                      {sending || dotThinking ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    Enter envia · Shift+Enter quebra linha · Dot responde no Planeje
                  </p>
                </footer>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
