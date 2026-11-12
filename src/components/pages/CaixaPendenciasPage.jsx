import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock3,
  Archive,
  ListTodo,
  Loader2,
  MessageCircle,
  RefreshCw,
  Sparkles,
  UserMinus,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import AtlasInbox from '@/components/atlas/AtlasInbox';
import AtlasDemandCentral from '@/components/atlas/AtlasDemandCentral';
import { ATLAS_DEMANDS_ENABLED } from '@/lib/atlasDemands';
import useAtlasInbox from '@/components/atlas/useAtlasInbox';
import CaixaDotPanel from '@/components/caixa/CaixaDotPanel';
import { useCaixaPendencias } from '@/hooks/useCaixaPendencias';
import { useCaixaDotBadge } from '@/hooks/useCaixaDot';
import {
  CAIXA_ACOES,
  CAIXA_FILAS,
  hrefDaPendencia,
} from '@/lib/caixaPendencias';
import WorkspacePageHeader from '@/components/layout/WorkspacePageHeader';

const FILAS = [
  {
    key: CAIXA_FILAS.PEDIDOS_INTERNOS,
    title: 'Pedidos internos',
    description: 'Cobranças do Gestor nas suas tarefas.',
    icon: ListTodo,
    tone: 'amber',
  },
  {
    key: CAIXA_FILAS.CLIENTE_SEM_RESPOSTA,
    title: 'Cliente sem resposta',
    description: 'Grupos sem resposta e conversas atribuídas a você.',
    icon: MessageCircle,
    tone: 'rose',
  },
  {
    key: CAIXA_FILAS.RESPONDIDO_HOJE,
    title: 'Respondido hoje',
    description: 'Pendências concluídas no dia. Não entram no badge.',
    icon: CheckCircle2,
    tone: 'emerald',
  },
];

const TONE_CLASSES = {
  amber: {
    icon: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    count: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200',
  },
  rose: {
    icon: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
    count: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200',
  },
  emerald: {
    icon: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    count: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200',
  },
};

function relativeTime(raw) {
  if (!raw) return 'agora';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return 'agora';
  return formatDistanceToNow(date, { addSuffix: true, locale: ptBR });
}

function PendenciaCard({ item, acting, onAction }) {
  const isConversation = item.origem === 'conversa';
  const isResolved = item.fila === CAIXA_FILAS.RESPONDIDO_HOJE;
  const title = isConversation
    ? item.conversation_name || 'Conversa sem nome'
    : item.task_title || 'Tarefa';
  const preview = isConversation ? item.last_message_preview : item.comment_content;
  const href = hrefDaPendencia(item);

  return (
    <Card className="overflow-hidden border-border/80 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
            {isConversation ? (
              <MessageCircle className="h-[18px] w-[18px] text-primary" />
            ) : (
              <ListTodo className="h-[18px] w-[18px] text-primary" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
                  {title}
                </h3>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {item.empresa || (isConversation && item.is_group ? 'Grupo' : 'Tarefa')}
                </p>
              </div>
              <Badge
                variant="outline"
                className={
                  isResolved
                    ? 'shrink-0 border-emerald-200 text-emerald-700 dark:border-emerald-500/30 dark:text-emerald-300'
                    : item.estado === 'em_atendimento'
                      ? 'shrink-0 border-blue-200 text-blue-700 dark:border-blue-500/30 dark:text-blue-300'
                      : 'shrink-0'
                }
              >
                {isResolved ? 'Feito' : item.estado === 'em_atendimento' ? 'Em atendimento' : 'Aberto'}
              </Badge>
            </div>

            {preview ? (
              <div className="mt-3 rounded-lg border border-border/60 bg-muted/45 px-3 py-2.5">
                {!isConversation && item.comment_author_name ? (
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {item.comment_author_name}
                  </p>
                ) : null}
                <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
                  {preview}
                </p>
              </div>
            ) : null}

            <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Clock3 className="h-3.5 w-3.5" />
                {relativeTime(item.resolved_at || item.last_activity_at || item.created_at)}
              </span>
              <Button variant="ghost" size="sm" asChild className="h-8 px-2 text-xs">
                <Link to={href}>
                  Abrir {isConversation ? 'conversa' : 'tarefa'}
                  <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>

            {!isResolved && !item.aviso_grupo ? (
              <div className="mt-3 grid grid-cols-2 gap-1.5 border-t pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 px-2 text-xs"
                  disabled={acting || item.estado === 'em_atendimento'}
                  onClick={() => onAction(item.id, CAIXA_ACOES.ESTOU_NISSO)}
                >
                  {acting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Clock3 className="mr-1 h-3.5 w-3.5" />}
                  Estou nisso
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-9 px-2 text-xs"
                  disabled={acting}
                  onClick={() => onAction(item.id, CAIXA_ACOES.FEITO)}
                >
                  {acting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}
                  Feito
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 px-2 text-xs text-muted-foreground"
                  disabled={acting}
                  onClick={() => onAction(item.id, CAIXA_ACOES.NAO_E_COMIGO)}
                >
                  <UserMinus className="mr-1 h-3.5 w-3.5" />
                  Não é comigo
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 px-2 text-xs text-muted-foreground"
                  disabled={acting}
                  onClick={() => onAction(item.id, CAIXA_ACOES.ARQUIVAR)}
                >
                  <Archive className="mr-1 h-3.5 w-3.5" />
                  Arquivar
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function QueueColumn({ config, items, actingId, onAction }) {
  const Icon = config.icon;
  const tone = TONE_CLASSES[config.tone];

  return (
    <section className="min-w-0 rounded-2xl border border-border/70 bg-muted/20 p-3">
      <header className="mb-3 flex items-start gap-3 px-1 py-1">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone.icon}`}>
          <Icon className="h-[18px] w-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold text-foreground">{config.title}</h2>
            <Badge variant="outline" className={tone.count}>{items.length}</Badge>
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{config.description}</p>
        </div>
      </header>

      <div className="space-y-3">
        {items.length ? (
          items.map((item) => (
            <PendenciaCard
              key={item.id}
              item={item}
              acting={actingId === item.id}
              onAction={onAction}
            />
          ))
        ) : (
          <div className="flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed bg-background/50 px-4 py-8 text-center">
            <CheckCircle2 className="mb-2 h-6 w-6 text-muted-foreground/50" />
            <p className="text-sm font-medium text-muted-foreground">Nada por aqui</p>
          </div>
        )}
      </div>
    </section>
  );
}

export default function CaixaPendenciasPage() {
  const { toast } = useToast();
  const [aba, setAba] = useState(ATLAS_DEMANDS_ENABLED ? 'atlas' : 'dot');
  const {
    itens,
    badge_total: badgeTotal,
    loading,
    error,
    actingId,
    reload,
    agir,
  } = useCaixaPendencias();
  const { badgeTotal: dotUnread } = useCaixaDotBadge();
  const atlasInbox=useAtlasInbox();

  const byQueue = useMemo(() => {
    const result = Object.fromEntries(FILAS.map((fila) => [fila.key, []]));
    for (const item of itens || []) {
      if (result[item.fila]) result[item.fila].push(item);
    }
    return result;
  }, [itens]);

  const handleAction = async (id, action) => {
    try {
      await agir(id, action);
      toast({
        title:
          action === CAIXA_ACOES.ESTOU_NISSO
            ? 'Marcado como em atendimento'
            : action === CAIXA_ACOES.FEITO
              ? 'Pendência concluída'
              : action === CAIXA_ACOES.ARQUIVAR
                ? 'Item saiu da fila aberta'
                : 'Item desatribuído',
      });
    } catch (actionError) {
      toast({
        title: 'Não foi possível atualizar a pendência',
        description: actionError?.message || String(actionError),
        variant: 'destructive',
      });
    }
  };

  const totalLabel = (Number(badgeTotal) || 0) + (Number(dotUnread) || 0) + atlasInbox.unread;

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-5 pb-20 md:pb-6">
      <WorkspacePageHeader
        title="Minha caixa"
        label={totalLabel > 0 ? `${totalLabel} avisos` : 'Tudo em dia'}
        help="Atlas: pedidos dos grupos, conversas do robô e avisos do escritório. O número de avisos não representa tarefas para aprovar. Use Precisa de você para identificar suas respostas. Dot: demandas internas. Operação: pedidos nas tarefas e conversas."
        actions={
          aba === 'operacao' ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-xl"
              aria-label="Atualizar caixa"
              onClick={() => reload()}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          ) : null
        }
      />

      <Tabs value={aba} onValueChange={setAba} className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start gap-1 rounded-2xl bg-muted/70 p-1">
          {(ATLAS_DEMANDS_ENABLED || atlasInbox.visible) && <TabsTrigger value="atlas" className="rounded-xl px-3 py-2"><Sparkles className="mr-1.5 h-3.5 w-3.5"/>Atlas{atlasInbox.unread>0&&<Badge variant="secondary" className="ml-1.5">{atlasInbox.unread} avisos</Badge>}</TabsTrigger>}
          <TabsTrigger value="dot" className="rounded-xl px-3 py-2">
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            Dot
            {dotUnread > 0 ? (
              <Badge variant="secondary" className="ml-1.5 h-5 min-w-5 px-1.5">
                {dotUnread}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="operacao" className="rounded-xl px-3 py-2">
            <ListTodo className="mr-1.5 h-3.5 w-3.5" />
            Operação
            {badgeTotal > 0 ? (
              <Badge variant="secondary" className="ml-1.5 h-5 min-w-5 px-1.5">
                {badgeTotal}
              </Badge>
            ) : null}
          </TabsTrigger>
        </TabsList>

        {(ATLAS_DEMANDS_ENABLED || atlasInbox.visible)&&<TabsContent value="atlas">{ATLAS_DEMANDS_ENABLED ? <><AtlasDemandCentral />{atlasInbox.visible && <details className="mt-5"><summary className="cursor-pointer text-sm text-muted-foreground">Avisos e decisões do escritório{atlasInbox.unread > 0 ? ` · ${atlasInbox.unread} novos` : ''}</summary><div className="mt-3"><AtlasInbox data={atlasInbox}/></div></details>}</> : <AtlasInbox data={atlasInbox}/>}</TabsContent>}
        <TabsContent value="dot" className="mt-0">
          <CaixaDotPanel />
        </TabsContent>

        <TabsContent value="operacao" className="mt-0">
          {error ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
              <p className="font-semibold text-destructive">A Operação ainda não está disponível</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {error?.message || 'Não foi possível carregar as pendências.'}
              </p>
            </div>
          ) : loading ? (
            <div className="grid gap-4 lg:grid-cols-3">
              {FILAS.map((fila) => (
                <div key={fila.key} className="h-64 animate-pulse rounded-2xl border bg-muted/40" />
              ))}
            </div>
          ) : (
            <div className="grid items-start gap-4 lg:grid-cols-3">
              {FILAS.map((fila) => (
                <QueueColumn
                  key={fila.key}
                  config={fila}
                  items={byQueue[fila.key] || []}
                  actingId={actingId}
                  onAction={handleAction}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
