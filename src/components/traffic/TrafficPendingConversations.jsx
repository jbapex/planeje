import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useTrafficPendingConversations } from '@/hooks/useTrafficPendingConversations';
import { buildConversasUrl } from '@/lib/conversasRoutes';
import { formatWaitDuration } from '@/lib/atendimentoWaitTime';

export default function TrafficPendingConversations() {
  const [open, setOpen] = useState(false);
  const { conversations, pending_analysis: pendingAnalysis, available, loading, error, refresh } = useTrafficPendingConversations();
  const count = conversations.length;
  const label = loading ? 'Conversas de tráfego · carregando'
    : error ? 'Conversas de tráfego · indisponível'
    : !available ? 'Conversas de tráfego · sem cobertura'
    : !count && pendingAnalysis > 0 ? 'Conversas de tráfego · análise pendente'
    : `${count} conversa${count === 1 ? '' : 's'} de tráfego sem resposta`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-auto min-h-9 whitespace-normal text-left">
          <MessageCircle className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
          <span aria-live="polite">{label}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] w-[calc(100vw-2rem)] overflow-y-auto">
        <DialogHeader className="pr-5">
          <DialogTitle>Conversas de tráfego sem resposta</DialogTitle>
          <DialogDescription>
            Assuntos identificados pelo Atlas na carteira autorizada. A resposta do gestor retira o alerta após a análise. Tarefas continuam com sua própria conclusão.
          </DialogDescription>
        </DialogHeader>
        {loading ? <p role="status">Carregando conversas…</p>
          : error ? <div role="alert" className="space-y-3 text-sm">
            <p>Não foi possível consultar as conversas. A quantidade está indisponível.</p>
            <Button variant="outline" onClick={refresh}>Tentar novamente</Button>
          </div>
          : !available ? <p className="text-sm text-muted-foreground">Nenhum grupo vinculado com gestor ativo e análise do Atlas disponível nesta carteira.</p>
          : <>
            {pendingAnalysis > 0 && <p role="status" className="text-sm text-muted-foreground">
              {pendingAnalysis} conversa{pendingAnalysis === 1 ? '' : 's'} com análise pendente. A lista pode mudar após a atualização do Atlas.
            </p>}
            {!count ? <p className="text-sm">Nenhum retorno de tráfego pendente entre os assuntos já identificados.</p>
              : <ul className="divide-y">
                {conversations.map(row => <li key={row.conversation_id} className="space-y-2 py-3">
                  <div className="min-w-0 break-words">
                    <p className="font-medium">{row.empresa || row.display_name || 'Cliente'}</p>
                    {row.display_name && row.display_name !== row.empresa && <p className="text-sm text-muted-foreground">{row.display_name}</p>}
                    <p className="text-sm text-muted-foreground">
                      Há {formatWaitDuration(Math.max(0, Date.now() - Date.parse(row.since)))} · {row.gestor_name || 'Gestor responsável'}
                    </p>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link to={buildConversasUrl({ statusTab: row.status, chatJid: row.chat_jid, clienteId: row.cliente_id })} onClick={() => setOpen(false)}>
                      Abrir conversa<span className="sr-only"> de {row.empresa || row.display_name || 'cliente'}</span>
                    </Link>
                  </Button>
                </li>)}
              </ul>}
          </>}
      </DialogContent>
    </Dialog>
  );
}
