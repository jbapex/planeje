import React, { useEffect, useState } from 'react';
import { Loader2, ListTodo } from 'lucide-react';
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
import { createTaskFromConversation } from '@/lib/atendimentoConversaPlanejamento';

const TASK_TYPES = [
  { value: 'arte', label: 'Arte' },
  { value: 'video', label: 'Vídeo' },
  { value: '', label: 'Outro' },
];

export default function AtendimentoCriarTarefaDialog({
  open,
  onOpenChange,
  conversation,
  clienteId,
  userId,
  messagePreview,
  onCreated,
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('arte');
  const [dueDate, setDueDate] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [agents, setAgents] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      setTitle('');
      setDescription('');
      setType('arte');
      setDueDate('');
      setAssigneeId('');
      setError('');
      return;
    }
    const groupName = conversation?.display_name || 'Grupo';
    setTitle(messagePreview ? `[Grupo] ${groupName}` : `[Grupo] ${groupName}`);
    if (messagePreview) setDescription(messagePreview);
    setAssigneeId(userId || '');
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
      const task = await createTaskFromConversation({
        conversation,
        clienteId,
        userId,
        title,
        description,
        messagePreview,
        type: type || null,
        dueDate,
        assigneeIds: assigneeId ? [assigneeId] : [userId],
      });
      onCreated?.(task);
      onOpenChange(false);
    } catch (err) {
      setError(err?.message || 'Não foi possível criar a tarefa.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListTodo className="h-5 w-5" />
            Criar tarefa do grupo
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="conv-task-title">Título</Label>
            <Input id="conv-task-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="conv-task-type">Tipo</Label>
            <Select value={type || 'outro'} onValueChange={(v) => setType(v === 'outro' ? '' : v)}>
              <SelectTrigger id="conv-task-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_TYPES.map((t) => (
                  <SelectItem key={t.value || 'outro'} value={t.value || 'outro'}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="conv-task-due">Data de entrega</Label>
            <Input id="conv-task-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="conv-task-assignee">Responsável</Label>
            <Select value={assigneeId} onValueChange={setAssigneeId}>
              <SelectTrigger id="conv-task-assignee">
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
          <div className="space-y-1.5">
            <Label htmlFor="conv-task-desc">Detalhes</Label>
            <Textarea
              id="conv-task-desc"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="O que o cliente pediu, referências, formato..."
            />
          </div>
          {messagePreview && (
            <p className="text-xs text-muted-foreground border rounded-md p-2 bg-muted/40">
              Mensagem: {messagePreview}
            </p>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Criar tarefa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
