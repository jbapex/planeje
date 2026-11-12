import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileCheck2, Paperclip, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import {
  DELAY_REASON_LABELS,
  DELAY_REASON_OPTIONS,
  hasDeliveryProof,
  isProductionLate,
  isStageLate,
  needsStageDelayJustification,
  needsProductionDelayJustification,
  productionDelayDays,
  stageDelayDays,
} from '@/lib/taskDeliveryAccountability';

const formatDateTime = (value) => value
  ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  : '';

export default function TaskDeliveryAccountability({
  task,
  attachmentCount = 0,
  onOpenAttachments,
  onJustificationsChange,
}) {
  const [rows, setRows] = useState([]);
  const [reasonCode, setReasonCode] = useState('');
  const [details, setDetails] = useState('');
  const [saving, setSaving] = useState(false);
  const [showJustification, setShowJustification] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    if (!task?.id) return;
    const { data, error } = await supabase
      .from('task_delay_justifications')
      .select('id,deadline_kind,due_on,reason_code,details,created_at,created_by,profiles:profiles!task_delay_justifications_created_by_fkey(full_name)')
      .eq('task_id', task.id)
      .order('created_at', { ascending: false });
    if (error) {
      if (error.code !== '42P01' && error.code !== 'PGRST205') {
        toast({ title: 'Não foi possível carregar as justificativas', description: error.message, variant: 'destructive' });
      }
      return;
    }
    setRows(data || []);
    onJustificationsChange?.(data || []);
  }, [onJustificationsChange, task?.id, toast]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setShowJustification(false); }, [task?.id]);

  const late = isProductionLate(task);
  const currentStageLate = isStageLate(task);
  const needsProductionJustification = needsProductionDelayJustification(task, rows);
  const needsStageJustification = needsStageDelayJustification(task, rows);
  const justificationKind = needsProductionJustification ? 'production' : needsStageJustification ? 'stage' : null;
  const needsJustification = Boolean(justificationKind);
  const proof = hasDeliveryProof(task, attachmentCount);
  const productionRows = useMemo(() => rows.filter((item) => item.deadline_kind === 'production'), [rows]);
  const stageRows = useMemo(() => rows.filter((item) => item.deadline_kind === 'stage'), [rows]);
  const deliveryStateText = task.production_delivered_at
    ? currentStageLate
      ? `${stageDelayDays(task)} dia(s) de atraso na etapa`
      : task.stage_due_at
        ? 'Etapa dentro do prazo'
        : `Entregue em ${formatDateTime(task.production_delivered_at)}`
    : late
      ? `${productionDelayDays(task)} dia(s) de atraso na produção`
      : 'Produção dentro do prazo';

  const save = async () => {
    if (!reasonCode || details.trim().length < 10) {
      toast({ title: 'Explique o motivo do atraso', description: 'Escolha uma causa e escreva pelo menos 10 caracteres.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('task_delay_justifications').insert({
      task_id: task.id,
      deadline_kind: justificationKind,
      due_on: justificationKind === 'stage' ? String(task.stage_due_at).slice(0, 10) : task.due_date,
      workflow_stage_key: task.workflow_stage_key || null,
      reason_code: reasonCode,
      details: details.trim(),
    });
    setSaving(false);
    if (error) {
      toast({ title: 'Não foi possível registrar a justificativa', description: error.message, variant: 'destructive' });
      return;
    }
    setReasonCode('');
    setDetails('');
    setShowJustification(false);
    toast({ title: 'Justificativa registrada no histórico' });
    await load();
  };

  if (!task?.id || !task?.due_date) return null;

  return (
    <section className="border-b bg-background px-3 py-1.5 sm:px-5" aria-label="Comprovação e justificativa da entrega">
      <div className={`flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-1.5 ${(task.production_delivered_at ? currentStageLate : late) ? 'border-amber-300 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/15' : 'bg-muted/20'}`}>
        <span className={`rounded-md p-1.5 ${task.production_delivered_at ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300'}`}>
          {task.production_delivered_at ? <ShieldCheck className="h-4 w-4" /> : proof ? <FileCheck2 className="h-4 w-4" /> : <Paperclip className="h-4 w-4" />}
        </span>
        <div className="flex min-w-[200px] flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
          <p className="text-xs font-semibold">
            {task.production_delivered_at ? 'Produção entregue' : proof ? 'Conteúdo anexado' : 'Comprovante pendente'}
          </p>
          <span className="text-muted-foreground">·</span>
          <p className={`text-xs font-medium ${(task.production_delivered_at ? currentStageLate : late) ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`}>
            {deliveryStateText}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!proof && !task.production_delivered_at && (
            <Button type="button" size="sm" variant="outline" className="h-8" onClick={onOpenAttachments}>
              <Paperclip className="mr-2 h-3.5 w-3.5" />Adicionar conteúdo
            </Button>
          )}
          {needsJustification && (
            <Button type="button" size="sm" variant="outline" className="h-8 border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-200" onClick={() => setShowJustification((value) => !value)}>
              <AlertTriangle className="mr-2 h-3.5 w-3.5" />{showJustification ? 'Fechar' : 'Justificar atraso'}
            </Button>
          )}
          {!needsJustification && (productionRows.length > 0 || stageRows.length > 0) && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" />Justificado</span>
          )}
        </div>
      </div>

      {needsJustification && showJustification && (
        <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50/40 p-3 dark:border-amber-900 dark:bg-amber-950/10">
          <p className="mb-3 text-sm font-semibold">{justificationKind === 'stage' ? 'Justificar atraso da etapa' : 'Justificar atraso da produção'}</p>
          <div className="grid gap-3 sm:grid-cols-[220px_1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label>Motivo principal</Label>
              <Select value={reasonCode} onValueChange={setReasonCode}>
                <SelectTrigger><SelectValue placeholder="Escolha o motivo" /></SelectTrigger>
                <SelectContent>{DELAY_REASON_OPTIONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>O que aconteceu?</Label>
              <Textarea rows={2} value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Explique o fato para análise posterior." />
            </div>
            <Button type="button" disabled={saving} onClick={() => void save()}>{saving ? 'Registrando…' : 'Registrar'}</Button>
          </div>
        </div>
      )}

      {productionRows.length > 0 && (
        <details className="mt-3 rounded-lg border bg-muted/10 px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">Histórico de justificativas ({productionRows.length})</summary>
          <div className="mt-2 space-y-2">
            {productionRows.map((item) => (
              <div key={item.id} className="rounded-md bg-background p-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{DELAY_REASON_LABELS[item.reason_code] || item.reason_code}</strong>
                  <span className="text-xs text-muted-foreground">{item.profiles?.full_name || 'Usuário'} · {formatDateTime(item.created_at)}</span>
                </div>
                <p className="mt-1 text-muted-foreground">{item.details}</p>
              </div>
            ))}
          </div>
        </details>
      )}
      {stageRows.length > 0 && (
        <details className="mt-3 rounded-lg border bg-muted/10 px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">Justificativas das etapas ({stageRows.length})</summary>
          <div className="mt-2 space-y-2">
            {stageRows.map((item) => (
              <div key={item.id} className="rounded-md bg-background p-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{DELAY_REASON_LABELS[item.reason_code] || item.reason_code}</strong>
                  <span className="text-xs text-muted-foreground">{item.profiles?.full_name || 'Usuário'} · {formatDateTime(item.created_at)}</span>
                </div>
                <p className="mt-1 text-muted-foreground">{item.details}</p>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
