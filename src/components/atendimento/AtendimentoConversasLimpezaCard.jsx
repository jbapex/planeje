import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ATENDIMENTO_STATUS } from '@/hooks/useAtendimentoConversations';
import { countConversationsForPurge, purgeAtendimentoConversations } from '@/lib/atendimentoConversaAdmin';

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todas (qualquer aba)' },
  { value: ATENDIMENTO_STATUS.AGUARDANDO, label: 'Aguardando' },
  { value: ATENDIMENTO_STATUS.EM_ATENDIMENTO, label: 'Em atendimento' },
  { value: ATENDIMENTO_STATUS.RESOLVIDO, label: 'Resolvidas' },
];

export default function AtendimentoConversasLimpezaCard({ clienteId, channels = [], onPurged }) {
  const [channelId, setChannelId] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [count, setCount] = useState(null);
  const [countLoading, setCountLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [purging, setPurging] = useState(false);
  const [error, setError] = useState('');

  const refreshCount = useCallback(async () => {
    if (!clienteId || !channelId) {
      setCount(null);
      return;
    }
    setCountLoading(true);
    setError('');
    const { count: n, error: err } = await countConversationsForPurge({
      clienteId,
      whatsappConfigId: channelId,
      status: statusFilter,
    });
    setCountLoading(false);
    if (err) {
      setError(err.message);
      setCount(null);
    } else {
      setCount(n);
    }
  }, [clienteId, channelId, statusFilter]);

  useEffect(() => {
    refreshCount();
  }, [refreshCount]);

  const handlePurge = async () => {
    setPurging(true);
    setError('');
    const { error: purgeError } = await purgeAtendimentoConversations({
      clienteId,
      whatsappConfigId: channelId,
      status: statusFilter,
    });
    setPurging(false);
    setConfirmOpen(false);
    if (purgeError) {
      setError(purgeError.message);
      return;
    }
    setCount(0);
    onPurged?.();
  };

  const channelLabel = channels.find((c) => c.id === channelId)?.name || channels.find((c) => c.id === channelId)?.subdomain || 'canal';

  return (
    <Card className="mb-4 border-red-200 dark:border-red-900/50">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2 text-red-700 dark:text-red-400">
          <Trash2 className="h-4 w-4" />
          Limpar conversas (superadmin)
        </CardTitle>
        <CardDescription>
          Remove conversas da lista do módulo Conversas para um canal. Use para descartar testes (ex.: número pessoal).
          O histórico bruto no banco pode permanecer; novas mensagens podem reabrir conversas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Canal WhatsApp</Label>
            <Select value={channelId} onValueChange={setChannelId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o canal" />
              </SelectTrigger>
              <SelectContent>
                {channels.map((ch) => (
                  <SelectItem key={ch.id} value={ch.id}>
                    {ch.name || ch.subdomain || ch.id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {channelId && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            {countLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <span className="font-medium text-foreground">{count ?? 0}</span>
                conversa(s) serão excluídas.
              </>
            )}
          </p>
        )}

        {error && (
          <p className="text-sm text-destructive flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        <Button
          type="button"
          variant="destructive"
          disabled={!clienteId || !channelId || countLoading || !count || purging}
          onClick={() => setConfirmOpen(true)}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Excluir conversas do canal
        </Button>

        <AlertDialog open={confirmOpen} onOpenChange={(open) => !purging && setConfirmOpen(open)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir {count} conversa(s)?</AlertDialogTitle>
              <AlertDialogDescription>
                Canal: <strong>{channelLabel}</strong>. Esta ação não pode ser desfeita. Lembretes ligados a essas
                conversas também serão removidos.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={purging}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                disabled={purging}
                onClick={(e) => {
                  e.preventDefault();
                  handlePurge();
                }}
              >
                {purging ? 'Excluindo…' : 'Sim, excluir tudo'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
