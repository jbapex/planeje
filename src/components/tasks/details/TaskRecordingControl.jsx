import React, { useEffect, useState } from 'react';
import { Clapperboard, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import TaskFieldHelp from '@/components/tasks/TaskFieldHelp';
import { REWORK_REASONS, formatDay, spDay } from '@/lib/collaboratorIndicators';

export const RECORDING_TASK_TYPES = ['video', 'reels'];

export default function TaskRecordingControl({ formData, setFormData }) {
  const { toast } = useToast();
  const { profile } = useAuth();
  const [events, setEvents] = useState([]);
  const [reason, setReason] = useState('falha_captacao');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const taskId = formData.id;
  const isAdmin = ['superadmin', 'admin'].includes(profile?.role);

  useEffect(() => {
    let cancelled = false;
    supabase.from('task_rework_events').select('id, reason, notes, created_at').eq('task_id', taskId).order('created_at')
      .then(({ data }) => { if (!cancelled) setEvents(data || []); });
    return () => { cancelled = true; };
  }, [taskId]);

  const saveSchedule = async (value) => {
    const next = value || null;
    const previous = formData.recording_scheduled_on || null;
    setFormData((current) => ({ ...current, recording_scheduled_on: next }));
    const { error } = await supabase.from('tarefas').update({ recording_scheduled_on: next }).eq('id', taskId);
    if (error) {
      setFormData((current) => ({ ...current, recording_scheduled_on: previous }));
      toast({ title: 'Não foi possível salvar a data da gravação', description: error.message, variant: 'destructive' });
    }
  };

  const register = async () => {
    setBusy(true);
    const { data, error } = await supabase.from('task_rework_events')
      .insert({ task_id: taskId, kind: 'regravacao', reason, notes: notes.trim() || null, created_by: profile?.id })
      .select('id, reason, notes, created_at').single();
    setBusy(false);
    if (error) {
      toast({ title: 'Não foi possível registrar a regravação', description: error.message, variant: 'destructive' });
      return;
    }
    setEvents((current) => [...current, data]);
    setNotes('');
  };

  const remove = async (id) => {
    const { error } = await supabase.from('task_rework_events').delete().eq('id', id);
    if (error) toast({ title: 'Não foi possível apagar', description: error.message, variant: 'destructive' });
    else setEvents((current) => current.filter((row) => row.id !== id));
  };

  return (
    <div className="space-y-3 rounded-xl border bg-muted/20 p-3">
      <div className="flex items-center gap-2 font-semibold">
        <Clapperboard className="h-4 w-4 text-violet-600" />
        Gravação
        <TaskFieldHelp label="Ajuda sobre gravação">
          A data agendada é comparada com o dia em que a tarefa sai da etapa Gravação e com o bruto até 13h. Reagendar antes da data vale; depois que a data passou, não muda o indicador. Registre aqui quando precisar regravar e o motivo.
        </TaskFieldHelp>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Gravação agendada para</Label>
          <Input type="date" value={formData.recording_scheduled_on || ''} onChange={(event) => saveSchedule(event.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Registrar regravação</Label>
          <div className="flex gap-2">
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(REWORK_REASONS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" disabled={busy} onClick={register}>Registrar</Button>
          </div>
          <Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="O que aconteceu (opcional)" />
        </div>
      </div>
      {events.length > 0 && (
        <ul className="space-y-1 text-sm">
          {events.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-2 rounded bg-background px-2 py-1">
              <span>{formatDay(spDay(row.created_at))} · {REWORK_REASONS[row.reason] || row.reason}{row.notes ? ` · ${row.notes}` : ''}</span>
              {isAdmin && <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(row.id)} aria-label="Apagar registro"><Trash2 className="h-3.5 w-3.5" /></Button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
