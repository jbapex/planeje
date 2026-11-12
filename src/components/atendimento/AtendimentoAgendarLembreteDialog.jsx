import React, { useEffect, useState } from 'react';
import { Bell, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/customSupabaseClient';
import { PLANEJAMENTO_KIND, createConversationPlanejamento } from '@/lib/atendimentoConversaPlanejamento';

function defaultDateTimeLocal() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AtendimentoAgendarLembreteDialog({
  open,
  onOpenChange,
  conversation,
  clienteId,
  userId,
  messagePreview,
  onCreated,
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [agents, setAgents] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      setTitle('');
      setBody('');
      setScheduledAt('');
      setAssigneeId('');
      setError('');
      return;
    }
    setScheduledAt(defaultDateTimeLocal());
    setAssigneeId(userId || '');
    setTitle(conversation?.is_group ? 'Lembrete do grupo' : 'Lembrete da conversa');
    if (messagePreview) setBody(messagePreview);
    supabase
      .from('profiles')
      .select('id, full_name')
      .in('role', ['superadmin', 'admin', 'colaborador'])
      .order('full_name')
      .then(({ data }) => setAgents(data || []));
  }, [open, conversation, messagePreview, userId]);

  const handleSubmit = async () => {
    if (!conversation || !clienteId || !userId) {
      setError('Dados da conversa incompletos.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const row = await createConversationPlanejamento({
        conversation,
        clienteId,
        userId,
        kind: PLANEJAMENTO_KIND.LEMBRETE_INTERNO,
        title,
        body: body || title,
        scheduledAt,
        assigneeId,
        sourceMessagePreview: messagePreview,
      });
      onCreated?.(row);
      onOpenChange(false);
    } catch (err) {
      setError(err?.message || 'Não foi possível criar o lembrete.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Novo lembrete
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground -mt-2">
          Só para você e a equipe — não envia mensagem no WhatsApp. Aparece em Meus lembretes e avisa quando o prazo chegar.
        </p>

        <div className="space-y-3 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="conv-rem-title">Título</Label>
            <Input id="conv-rem-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="conv-rem-body">O que fazer</Label>
            <Textarea
              id="conv-rem-body"
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Ex.: Enviar arte aprovada, cobrar retorno do cliente..."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="conv-rem-when">Prazo</Label>
            <Input
              id="conv-rem-when"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="conv-rem-assignee">Quem será avisado</Label>
            <Select value={assigneeId} onValueChange={setAssigneeId}>
              <SelectTrigger id="conv-rem-assignee">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.full_name || a.id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Bell className="h-4 w-4 mr-2" />}
            Salvar lembrete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
