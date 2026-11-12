import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Bell,
  CalendarClock,
  Check,
  ExternalLink,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import {
  CONVERSAS_DEFAULT_PATH,
  buildConversasUrl,
} from '@/lib/conversasRoutes';
import {
  cancelConversationPlanejamento,
  completeConversationPlanejamento,
  fetchMyLembretes,
  formatPlanejamentoWhen,
  lembreteDueState,
  lembreteDueStateLabel,
} from '@/lib/atendimentoConversaPlanejamento';
import { ATENDIMENTO_STATUS } from '@/hooks/useAtendimentoConversations';
import { cn } from '@/lib/utils';
import '@/components/atendimento/Atendimento.css';

function LembreteCard({ item, onComplete, onCancel }) {
  const state = lembreteDueState(item.scheduled_at);
  const convName = item.atendimento_conversas?.display_name || item.chat_jid?.replace(/@.*$/, '') || 'Chat';
  const isGroup = item.atendimento_conversas?.is_group;

  return (
    <li
      className={cn(
        'wa-lembrete-card rounded-xl border p-4 bg-white dark:bg-card',
        state === 'overdue' && 'border-red-400 bg-red-50/40 dark:bg-red-950/20',
        state === 'due_soon' && 'border-amber-400 bg-amber-50/40 dark:bg-amber-950/15'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <p className="font-semibold truncate">{item.title}</p>
            <Badge
              variant={state === 'overdue' ? 'destructive' : state === 'due_soon' ? 'default' : 'secondary'}
              className="wa-badge-sm"
            >
              {lembreteDueStateLabel(state)}
            </Badge>
            {isGroup && (
              <Badge variant="outline" className="wa-badge-sm">
                Grupo
              </Badge>
            )}
          </div>
          <p className="text-sm text-[#667781] flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5 shrink-0" />
            {formatPlanejamentoWhen(item.scheduled_at)}
          </p>
          <p className="text-sm text-muted-foreground mt-1">{convName}</p>
          {item.body && <p className="text-sm mt-2 whitespace-pre-wrap">{item.body}</p>}
          {item.source_message_preview && (
            <p className="text-xs text-muted-foreground mt-2 border-l-2 pl-2">
              Do chat: {item.source_message_preview}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <Button type="button" size="sm" variant="outline" asChild>
            <Link
              to={buildConversasUrl({
                statusTab: ATENDIMENTO_STATUS.EM_ATENDIMENTO,
                chatJid: item.chat_jid,
              })}
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1" />
              Chat
            </Link>
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" title="Concluir" onClick={() => onComplete(item.id)}>
            <Check className="h-4 w-4" />
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" title="Cancelar" onClick={() => onCancel(item.id)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </li>
  );
}

export default function ConversasLembretesPage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState('pendentes');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile?.id) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchMyLembretes(profile.id, {
        status: tab === 'pendentes' ? 'pendente' : 'done',
      });
      setRows(data);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro ao carregar lembretes', description: err.message });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [profile?.id, tab, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!profile?.id) return undefined;
    const ch = supabase
      .channel(`lembretes-page:${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'atendimento_conversa_planejamento',
          filter: `assignee_id=eq.${profile.id}`,
        },
        () => load()
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [profile?.id, load]);

  const stats = useMemo(() => {
    let overdue = 0;
    let soon = 0;
    rows.forEach((r) => {
      if (tab !== 'pendentes') return;
      const s = lembreteDueState(r.scheduled_at);
      if (s === 'overdue') overdue += 1;
      if (s === 'due_soon') soon += 1;
    });
    return { overdue, soon };
  }, [rows, tab]);

  const handleComplete = async (id) => {
    try {
      await completeConversationPlanejamento(id);
      toast({ title: 'Lembrete concluído' });
      load();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro', description: err.message });
    }
  };

  const handleCancel = async (id) => {
    try {
      await cancelConversationPlanejamento(id);
      toast({ title: 'Lembrete cancelado' });
      load();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro', description: err.message });
    }
  };

  return (
    <div className="wa-atendimento flex flex-col flex-1 min-h-0 h-full max-w-3xl mx-auto w-full p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <Button variant="ghost" size="sm" className="mb-2 -ml-2 h-8" asChild>
            <Link to={CONVERSAS_DEFAULT_PATH}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Voltar para Conversas
            </Link>
          </Button>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Bell className="h-5 w-5 text-[var(--wa-brand)]" />
            Meus lembretes
          </h1>
          <p className="text-sm text-[#667781] mt-1">
            Acompanhe prazos das conversas. Você recebe aviso a cada 10 min quando estiver chegando ou vencido.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
          Atualizar
        </Button>
      </div>

      {tab === 'pendentes' && (stats.overdue > 0 || stats.soon > 0) && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {stats.overdue > 0 && (
            <Badge variant="destructive">{stats.overdue} vencido{stats.overdue !== 1 ? 's' : ''}</Badge>
          )}
          {stats.soon > 0 && (
            <Badge className="bg-amber-500 hover:bg-amber-500">{stats.soon} chegando</Badge>
          )}
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pendentes">Pendentes</TabsTrigger>
          <TabsTrigger value="concluidos">Concluídos / cancelados</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-4">
          {loading ? (
            <div className="flex justify-center py-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              {tab === 'pendentes'
                ? 'Nenhum lembrete pendente. Crie um a partir de um chat em Conversas → Planejar.'
                : 'Nenhum lembrete concluído ainda.'}
            </div>
          ) : (
            <ul className="space-y-3">
              {rows.map((item) => (
                <LembreteCard key={item.id} item={item} onComplete={handleComplete} onCancel={handleCancel} />
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
