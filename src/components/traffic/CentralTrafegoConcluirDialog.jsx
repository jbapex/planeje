import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import TaskAttachmentsTab from '@/components/tasks/details/TaskAttachmentsTab';
import { completeTrafficDemand, fetchTaskAttachments } from '@/lib/centralTrafegoApi';
import {
  MANUAL_DEMAND_TYPES,
  TRAFFIC_PRIORITIES,
  autoCreatesReviews,
  evidenceRulesForDemand,
  minCommentChars,
  validateCompletionInput,
} from '@/lib/centralTrafego';
import { isRoutineDemandRow } from '@/lib/trafegoRotina';

export default function CentralTrafegoConcluirDialog({ open, onOpenChange, task, campaigns, team, onSaved }) {
  const navigate = useNavigate();
  const [weeklyReview, setWeeklyReview] = useState(null);
  const [checkingWeekly, setCheckingWeekly] = useState(false);
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === 'superadmin' || profile?.role === 'admin';
  const [summary, setSummary] = useState('');
  const [comment, setComment] = useState('');
  const [nextNone, setNextNone] = useState(true);
  const [showNext, setShowNext] = useState(false);
  const [showExtra, setShowExtra] = useState(false);
  const [successor, setSuccessor] = useState('');
  const [successorType, setSuccessorType] = useState('ajuste');
  const [successorDue, setSuccessorDue] = useState('');
  const [successorPriority, setSuccessorPriority] = useState('medium');
  const [successorAssignee, setSuccessorAssignee] = useState(user?.id || '');
  const [attachmentIds, setAttachmentIds] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [campaignIds, setCampaignIds] = useState([]);
  const [saving, setSaving] = useState(false);

  const demandType = task?.details?.demand_type || task?.demand_type || 'outro';
  const isRoutine = isRoutineDemandRow(task);
  const rules = evidenceRulesForDemand(demandType);
  const autoReviews = autoCreatesReviews(demandType);

  useEffect(() => {
    let cancelled = false; setWeeklyReview(null);
    if (!open || !task?.id) return;
    setCheckingWeekly(true);
    supabase.from('traffic_weekly_reviews').select('id,kind').eq('task_id', task.id).maybeSingle()
      .then(({ data }) => { if (!cancelled) { setWeeklyReview(data); setCheckingWeekly(false); } })
      .catch(() => { if (!cancelled) setCheckingWeekly(false); });
    return () => { cancelled = true; };
  }, [open, task?.id]);

  const reloadAttachments = async () => {
    if (!task?.id) return;
    const { data } = await fetchTaskAttachments(task.id);
    setAttachments(data || []);
  };

  useEffect(() => {
    if (open && task?.id) {
      setSummary('');
      setComment('');
      setNextNone(true);
      setShowNext(false);
      setShowExtra(false);
      setSuccessor('');
      setSuccessorType('ajuste');
      setSuccessorDue('');
      setSuccessorPriority(task?.priority || 'medium');
      setSuccessorAssignee(user?.id || (task?.assignee_ids || [])[0] || '');
      setAttachmentIds([]);
      setCampaignIds([]);
      reloadAttachments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id]);

  const toggleAtt = (id) => {
    setAttachmentIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const save = async () => {
    const note = summary.trim();
    const typedComment = comment.trim();
    const commentContent = typedComment || (note.length >= minCommentChars(demandType) ? note : '');
    const parsed = validateCompletionInput({
      demandType,
      summary,
      nextActionNone: autoReviews ? false : nextNone,
      successorTitle: autoReviews ? '' : successor,
      successorDueDate: autoReviews ? null : successorDue,
      successorAssigneeIds: autoReviews ? [] : successorAssignee ? [successorAssignee] : [],
      commentContent,
      attachmentIds,
      evidenceCampaignIds: campaignIds,
    });
    if (!parsed.ok) {
      toast({ title: parsed.errors[0], variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { error } = await completeTrafficDemand({
        taskId: task.id,
        summary: summary.trim(),
        nextActionNone: autoReviews ? false : nextNone,
        successorTitle: autoReviews || nextNone ? null : successor.trim(),
        successorDemandType: autoReviews || nextNone ? null : successorType,
        successorDueDate: autoReviews || nextNone ? null : successorDue,
        successorPriority: autoReviews || nextNone ? null : successorPriority,
        successorAssigneeIds: autoReviews || nextNone ? null : [successorAssignee],
        commentContent: (comment.trim() || (summary.trim().length >= minCommentChars(demandType) ? summary.trim() : '')) || null,
        attachmentIds,
        evidenceCampaignIds: campaignIds,
      });
      if (error) throw error;
      toast({ title: 'Demanda concluída' });
      onOpenChange(false);
      onSaved?.();
    } catch (e) {
      toast({ title: 'Não foi possível concluir', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const sameClientCampaigns = (campaigns || []).filter(
    (c) => !task?.client_id || c.client_id === task.client_id || (task.campaigns || []).some((x) => x.id === c.id)
  );

  if (weeklyReview) return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-lg"><DialogHeader>
    <DialogTitle>{weeklyReview.kind === 'optimization' ? 'Registrar a otimização' : 'Revisar a semana'}</DialogTitle><DialogDescription>{weeklyReview.kind === 'optimization' ? 'Registre o que conferiu e ajustou nas campanhas, ou por que nenhuma alteração foi necessária.' : 'Esta tarefa acompanha os números, a análise e a próxima ação do cliente.'} Finalize o registro na rotina semanal.</DialogDescription>
  </DialogHeader><DialogFooter><Button onClick={() => { onOpenChange(false); navigate(`/paid-traffic/rotina?review=${weeklyReview.id}`); }}>{weeklyReview.kind === 'optimization' ? 'Registrar otimização' : 'Abrir revisão semanal'}</Button></DialogFooter></DialogContent></Dialog>;

  const minNote = minCommentChars(demandType);
  const noteHint = autoReviews
    ? 'Ao concluir, o sistema cria a revisão de 24h e a de 72h.'
    : isRoutine
      ? 'O próximo ciclo entra sozinho no calendário.'
      : rules.needComment
        ? `Escreva o que fez, com pelo menos ${minNote} letras.`
        : `Uma frase com pelo menos ${minNote} letras já encerra.`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Concluir</DialogTitle>
          <DialogDescription>{task?.title || 'Esta demanda sai do Hoje.'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>O que você conferiu</Label>
            <textarea
              className="mt-1 w-full min-h-[88px] rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="Ex.: Pixel e evento de compra conferidos, está certo."
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">{noteHint}</p>
          </div>

          {!autoReviews && !isRoutine ? (
            <div className="space-y-2">
              <button
                type="button"
                className="text-sm text-primary underline-offset-2 hover:underline"
                onClick={() => {
                  const next = !showNext;
                  setShowNext(next);
                  setNextNone(!next);
                }}
              >
                {showNext ? 'Sem próxima ação' : 'Criar uma próxima ação'}
              </button>
              {showNext ? (
                <>
                  <div>
                    <Label>Próxima ação</Label>
                    <Input className="mt-1" value={successor} onChange={(e) => setSuccessor(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Prazo</Label>
                      <Input className="mt-1" type="date" value={successorDue} onChange={(e) => setSuccessorDue(e.target.value)} />
                    </div>
                    <div>
                      <Label>Prioridade</Label>
                      <select
                        className="mt-1 w-full h-10 rounded-md border bg-background px-3 text-sm"
                        value={successorPriority}
                        onChange={(e) => setSuccessorPriority(e.target.value)}
                      >
                        {TRAFFIC_PRIORITIES.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <Label>Tipo</Label>
                    <select
                      className="mt-1 w-full h-10 rounded-md border bg-background px-3 text-sm"
                      value={successorType}
                      onChange={(e) => setSuccessorType(e.target.value)}
                    >
                      {MANUAL_DEMAND_TYPES.map((d) => (
                        <option key={d.value} value={d.value}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {isAdmin ? (
                    <div>
                      <Label>Responsável</Label>
                      <select
                        className="mt-1 w-full h-10 rounded-md border bg-background px-3 text-sm"
                        value={successorAssignee}
                        onChange={(e) => setSuccessorAssignee(e.target.value)}
                      >
                        {(team || []).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.full_name || p.id}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2">
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => setShowExtra((v) => !v)}
            >
              {showExtra ? 'Ocultar anexo e campanha' : 'Anexo ou campanha, se precisar'}
            </button>
            {showExtra ? (
              <>
                <div>
                  <Label>Link ou observação extra</Label>
                  <textarea
                    className="mt-1 w-full min-h-[64px] rounded-md border bg-background px-3 py-2 text-sm"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                </div>
                <div className="rounded-md border p-3 space-y-2">
                  <TaskAttachmentsTab taskId={task?.id} clienteId={task?.client_id} />
                  <Button type="button" size="sm" variant="secondary" onClick={reloadAttachments}>
                    Atualizar anexos
                  </Button>
                  <div className="max-h-28 overflow-y-auto space-y-1">
                    {attachments.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Nenhum anexo nesta tarefa.</p>
                    ) : (
                      attachments.map((a) => (
                        <label key={a.id} className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={attachmentIds.includes(a.id)} onChange={() => toggleAtt(a.id)} />
                          {a.name || a.id}
                          {a.provider === 'google_drive' ? ' · Drive' : ''}
                        </label>
                      ))
                    )}
                  </div>
                </div>
                {sameClientCampaigns.length ? (
                  <div>
                    <Label>Campanha desta execução</Label>
                    <div className="mt-1 max-h-28 overflow-y-auto rounded-md border p-2 space-y-1">
                      {sameClientCampaigns.map((c) => (
                        <label key={c.id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={campaignIds.includes(c.id)}
                            onChange={() =>
                              setCampaignIds((prev) => (prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id]))
                            }
                          />
                          {c.name || c.id}
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={save} disabled={saving || checkingWeekly}>
            {saving ? 'Concluindo…' : 'Concluir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
