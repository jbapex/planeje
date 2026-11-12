import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, History, Loader2, RefreshCw, Settings2 } from 'lucide-react';
import { supabase, supabaseAnonKey, supabaseUrl } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { buildRoutineSheetUrl, campaignComparison, currency, displayDate, displayDay, displayStamp, displayWeek, groupRoutineClients, lastClosedWeek, REVIEW_AUTOSAVE_MS, reviewAutosaveLabel, reviewAutosavePlan, reviewDraft, reviewDraftSignature, reviewChangeLabels, reviewFillView, reviewMetrics, reviewPayload, reviewState, routineRows, shiftDate, WEEKDAYS, automaticRoutineDrafts, automaticRoutineError } from '@/lib/trafficWeeklyReview';
import { rewritePublicStorageUrl } from '@/lib/publicStorageUrl';
import { nextMonday, nextReportDue } from '@/lib/trafegoRotina';
import { invalidateCentralHojeCache } from '@/lib/trafegoHojeCache';
import TrafficCampaignMetrics from './TrafficCampaignMetrics';
import { padSheetRows, sheetInitialRows } from '@/lib/trafficSheetGrid';
import { normalizeRoutineWeek } from '@/lib/gestorIaRoutine';
import { inferSheetMetrics, matchResultKpiPreset, normalizeSheetMetrics, RESULT_KPI_PRESETS, sheetMetricOptions } from '@/lib/trafficSheetLayout';
import './TrafficWeeklyRoutine.css';

async function rpc(name, params, signal) {
  const query = supabase.rpc(name, params);
  let onAbort;
  try {
    const response = signal ? Promise.race([
      query.abortSignal(signal),
      new Promise((_, reject) => {
        onAbort = () => reject(new Error('A gravação demorou demais. Não foi possível confirmar; tente novamente ou reabra a semana.'));
        if (signal.aborted) onAbort();
        else signal.addEventListener('abort', onAbort, { once: true });
      }),
    ]) : query;
    const { data, error } = await response;
    if (error) throw error;
    return data;
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort);
  }
}
function draftKeepalive(reviewId, revision, payload, token) {
  const body = JSON.stringify({ p_review: reviewId, p_revision: revision, p_data: payload, p_finalize: false });
  if (!reviewId || !token || body.length > 60000) return null;
  return fetch(`${supabaseUrl}/rest/v1/rpc/save_traffic_weekly_review`, {
    method: 'POST',
    keepalive: true,
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body,
  });
}
function State({ review, today }) { const state = reviewState(review, today); return <span className={`tw-state tw-state--${state.tone}`}>{state.label}</span>; }

function clientInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return `${parts[0][0] || ''}${last}`.toUpperCase();
}

function AgendaLine({ clientId, today, agenda }) {
  const report = (agenda.tasks || []).find((row) => row.tarefas?.client_id === clientId && String(row.generation_key || '').startsWith('report_15d:'));
  const group = (agenda.tasks || []).find((row) => row.tarefas?.client_id === clientId && String(row.generation_key || '').startsWith('group_week:'));
  const reportDay = report?.tarefas?.due_date || nextReportDue(today);
  const groupDay = group?.tarefas?.due_date || (agenda.groups?.[clientId] ? nextMonday(today) : '');
  return (
    <>
      <AgendaChip tag="Relatório" title={report ? 'Para fazer' : 'No dia'} day={reportDay} taskId={report?.tarefas?.id} />
      {groupDay ? <AgendaChip tag="Grupo" title={group ? 'Para enviar' : 'Segunda'} day={groupDay} taskId={group?.tarefas?.id} /> : null}
    </>
  );
}

function AgendaChip({ tag, title, day, taskId }) {
  const body = (
    <>
      <span className="tw-cadence-tag">{tag}</span>
      <span className="tw-cadence-title">{title}</span>
      <span className="tw-cadence-detail">{displayDay(day)}</span>
    </>
  );
  if (!taskId) return <span className="tw-cadence is-row is-scheduled">{body}</span>;
  return <Link className="tw-cadence is-row is-scheduled" to={`/tasks/list/${taskId}`}>{body}</Link>;
}

function ClientMark({ name, src }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  if (!src || failed) return <span className="tw-client-mark" aria-hidden="true">{clientInitials(name)}</span>;
  return (
    <span className="tw-client-mark" aria-hidden="true">
      <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    </span>
  );
}

function CadenceChip({ look, onOpen }) {
  if (!look) return null;
  const extra = look.extra ? ` · +${look.extra}` : '';
  const opt = look.tag === 'Otimização' ? ' tw-opt' : '';
  const when = String(look.detail || '').split('·')[0].trim();
  const className = `tw-cadence is-row is-${look.tone}${opt}`;
  const body = (
    <>
      <span className="tw-cadence-tag">{look.tag}</span>
      <span className="tw-cadence-title">{look.title}{extra}</span>
      <span className="tw-cadence-detail">{when}</span>
    </>
  );
  if (look.review && onOpen) {
    return (
      <button type="button" className={className} onClick={() => onOpen(look.review)}>
        {body}
      </button>
    );
  }
  return <span className={className}>{body}</span>;
}

function SettingsDialog({ client, board, onClose, onSaved }) {
  const { toast } = useToast();
  const [draft, setDraft] = useState(() => ({ enabled: client.settings?.enabled ?? true, weekday: client.settings?.review_weekday || 1,
    starts_on: client.settings?.starts_on || board.today, result_label: client.settings?.result_label || 'Agendamentos', assignee: client.manager_id || '', optimization_enabled: client.settings?.optimization_enabled ?? false, optimization_weekday: client.settings?.optimization_weekday || 3, sheet_metrics: client.settings?.sheet_metrics || [] }));
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }));
  const save = async () => {
    setBusy(true);
    try {
      await rpc('save_traffic_routine_settings', { p_client: client.id, p_enabled: draft.enabled, p_weekday: Number(draft.weekday),
        p_starts_on: draft.starts_on, p_result_label: draft.result_label, p_assignee: draft.assignee || null, p_optimization_enabled: draft.optimization_enabled, p_optimization_weekday: Number(draft.optimization_weekday) });
      await rpc('save_traffic_sheet_metrics', { p_client: client.id, p_sheet_metrics: Array.isArray(draft.sheet_metrics) ? draft.sheet_metrics : [] });
      toast({ title: 'Rotina configurada', description: 'Revisões já criadas mantêm seus responsáveis e prazos.' });
      onClose(); onSaved();
    } catch (error) { toast({ title: 'Confira a configuração', description: error.message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="tw-settings-dialog">
        <DialogHeader className="tw-settings-head">
          <DialogTitle>Rotina de {client.empresa}</DialogTitle>
          <DialogDescription>Análise olha a semana que passou. Otimização olha o que está no ar.</DialogDescription>
        </DialogHeader>
        <div className="tw-form tw-settings-body">
          <section className="tw-settings-block">
            <h3>Quando</h3>
            <div className="tw-settings-line">
              <label className="tw-switch"><input type="checkbox" checked={draft.enabled} onChange={(e) => set('enabled', e.target.checked)} /> Análise semanal</label>
              {draft.enabled ? (
                <label className="tw-settings-day">toda
                  <select aria-label="Dia da análise" value={draft.weekday} onChange={(e) => set('weekday', e.target.value)}>{WEEKDAYS.map((day, i) => <option key={day} value={i + 1}>{day}</option>)}</select>
                </label>
              ) : null}
            </div>
            <div className="tw-settings-line">
              <label className="tw-switch"><input type="checkbox" checked={draft.optimization_enabled} onChange={(e) => set('optimization_enabled', e.target.checked)} /> Otimização semanal</label>
              {draft.optimization_enabled ? (
                <label className="tw-settings-day">toda
                  <select aria-label="Dia da otimização" value={draft.optimization_weekday} onChange={(e) => set('optimization_weekday', e.target.value)}>{WEEKDAYS.map((day, i) => <option key={day} value={i + 1}>{day}</option>)}</select>
                </label>
              ) : null}
            </div>
            <label>Gestor<select value={draft.assignee} onChange={(e) => set('assignee', e.target.value)}><option value="">Escolher responsável</option>{board.team.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></label>
            {!client.settings ? <label>Começar em<input type="date" min={board.today} value={draft.starts_on} onChange={(e) => set('starts_on', e.target.value)} /></label> : null}
          </section>
          <section className="tw-settings-block">
            <h3>Resultado</h3>
            <div className="tw-kpi-picks" role="group" aria-label="Tipo de resultado">
              {RESULT_KPI_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={matchResultKpiPreset(draft.result_label) === preset.id ? 'is-on' : ''}
                  onClick={() => {
                    setDraft((prev) => ({ ...prev, result_label: preset.label, sheet_metrics: inferSheetMetrics(preset.label) }));
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <input aria-label="Nome do resultado" value={draft.result_label} maxLength={60} onChange={(e) => set('result_label', e.target.value)} placeholder="Ou escreva o nome do resultado" />
            <small>Este nome vira a coluna principal. Loja de carro: Simulações, CPF bom e Compras. Material: Orçamentos e Lead qualificado.</small>
          </section>
          <fieldset className="tw-sheet-columns">
            <legend>Colunas da planilha</legend>
            {sheetMetricOptions(draft.result_label).map((option) => (
              <label key={option.id} className="tw-switch">
                <input type="checkbox" checked={normalizeSheetMetrics(draft.sheet_metrics, draft.result_label).includes(option.id)} disabled={option.always} onChange={() => {
                  const current = normalizeSheetMetrics(draft.sheet_metrics, draft.result_label);
                  const next = current.includes(option.id) ? current.filter((id) => id !== option.id) : [...current, option.id];
                  set('sheet_metrics', next);
                }} />
                {option.label}
              </label>
            ))}
          </fieldset>
          <p className="tw-hint">Desligar guarda as tarefas e o histórico. Religar continua a partir de hoje.</p>
        </div>
        <DialogFooter className="tw-settings-foot">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button onClick={save} disabled={busy}>{busy ? 'Salvando…' : 'Salvar rotina'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EnableAutomaticDialog({ board, clients, onClose, onSaved }) {
  const { toast } = useToast();
  const eligible = (clients || []).filter((client) => client.eligible !== false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [reviewEnabled, setReviewEnabled] = useState(true);
  const [optimizationEnabled, setOptimizationEnabled] = useState(true);
  const [reviewWeekday, setReviewWeekday] = useState(1);
  const [optimizationWeekday, setOptimizationWeekday] = useState(3);
  const [fallbackAssignee, setFallbackAssignee] = useState('');
  const [busy, setBusy] = useState(false);
  const toggle = (id) => setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  const save = async () => {
    const drafts = automaticRoutineDrafts({
      clients: eligible,
      selectedIds,
      reviewEnabled,
      reviewWeekday,
      optimizationEnabled,
      optimizationWeekday,
      today: board.today,
      fallbackAssignee: fallbackAssignee || null,
    });
    const invalid = automaticRoutineError(drafts, { reviewEnabled, optimizationEnabled });
    if (invalid) { toast({ title: invalid, variant: 'destructive' }); return; }
    setBusy(true);
    try {
      for (const item of drafts) {
        await rpc('save_traffic_routine_settings', {
          p_client: item.clientId,
          p_enabled: item.enabled,
          p_weekday: item.weekday,
          p_starts_on: item.starts_on,
          p_result_label: item.result_label,
          p_assignee: item.assignee,
          p_optimization_enabled: item.optimization_enabled,
          p_optimization_weekday: item.optimization_weekday,
        });
      }
      toast({ title: 'Rotina ligada', description: `${drafts.length} cliente${drafts.length === 1 ? '' : 's'}. No dia escolhido a tarefa aparece no Hoje.` });
      onClose();
      onSaved();
    } catch (error) {
      toast({ title: 'Confira a configuração', description: error.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="tw-settings-dialog">
        <DialogHeader className="tw-settings-head">
          <DialogTitle>Ligar análise e otimização</DialogTitle>
          <DialogDescription>Vira tarefa real de Tarefas no dia escolhido. Marque só quem deve entrar.</DialogDescription>
        </DialogHeader>
        <div className="tw-form tw-settings-body">
          <label className="tw-switch"><input type="checkbox" checked={reviewEnabled} onChange={(e) => setReviewEnabled(e.target.checked)} /> Análise da semana</label>
          {reviewEnabled && <label>Analisar toda<select value={reviewWeekday} onChange={(e) => setReviewWeekday(Number(e.target.value))}>{WEEKDAYS.map((day, i) => <option key={day} value={i + 1}>{day}</option>)}</select></label>}
          <label className="tw-switch"><input type="checkbox" checked={optimizationEnabled} onChange={(e) => setOptimizationEnabled(e.target.checked)} /> Otimização semanal</label>
          {optimizationEnabled && <label>Otimizar toda<select value={optimizationWeekday} onChange={(e) => setOptimizationWeekday(Number(e.target.value))}>{WEEKDAYS.map((day, i) => <option key={day} value={i + 1}>{day}</option>)}</select></label>}
          <label>Responsável se o cliente não tiver gestor<select value={fallbackAssignee} onChange={(e) => setFallbackAssignee(e.target.value)}><option value="">Usar o gestor da conta</option>{board.team.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></label>
          <fieldset className="tw-client-checks">
            <legend>Clientes</legend>
            <div className="tw-check-actions">
              <button type="button" onClick={() => setSelectedIds(eligible.map((c) => c.id))}>Marcar visíveis</button>
              <button type="button" onClick={() => setSelectedIds([])}>Limpar</button>
            </div>
            {eligible.map((client) => (
              <label key={client.id} className="tw-switch">
                <input type="checkbox" checked={selectedIds.includes(client.id)} onChange={() => toggle(client.id)} />
                <span>{client.empresa}<small>{client.manager_name || 'Sem gestor na conta'}{client.settings?.enabled ? ' · análise ligada' : ''}{client.settings?.optimization_enabled ? ' · otimização ligada' : ''}</small></span>
              </label>
            ))}
          </fieldset>
        </div>
        <DialogFooter className="tw-settings-foot">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button onClick={save} disabled={busy}>{busy ? 'Salvando…' : 'Ligar nos escolhidos'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TrafficWeeklyReviewEditor({ review, previous, board, clients = [], onNavigate, onHistory, onSettings, navigationBusy, onClose, onSaved, sheetView }) {
  const { user } = useAuth(); const { toast } = useToast();
  const initialDraft = () => {
    const d = reviewDraft(review, true);
    const client = board.clients.find((c) => c.id === review.client_id);
    const a = client?.accounts?.length === 1 ? client.accounts[0] : null;
    d.result_label = review.result_label || client?.settings?.result_label || '';
    d.sheet_metrics = client?.settings?.sheet_metrics || [];
    if (review.can_edit && d.metric_mode === 'campaign' && !(review.campaign_metrics || []).length) {
      d.campaign_metrics = sheetInitialRows(review, previous, a ? {platform:a.platform,account_link_id:a.id,account_id:a.account_id,account_name:a.account_name || a.account_id,conversion_label:d.result_label} : {conversion_label:d.result_label});
    }
    if (sheetView && d.metric_mode === 'campaign' && review.can_edit) d.campaign_metrics = padSheetRows(d.campaign_metrics);
    return d;
  };
  const initial = useRef(null); if (!initial.current) initial.current = initialDraft();
  const [draft, setDraft] = useState(initial.current);
  const recordId = useRef(review.id || null);
  const [version, setVersion] = useState(review.revision);
  const [savedDraft, setSavedDraft] = useState(() => reviewDraftSignature(initial.current));
  const [busy, setBusy] = useState(false); const [discard, setDiscard] = useState(false);
  const [auto, setAuto] = useState({ state: 'idle', detail: '' });
  const [liveFill, setLiveFill] = useState(null);
  const [finalizedAt, setFinalizedAt] = useState(review.finalized_at || null);
  const finalizedRef = useRef(finalizedAt);
  const alive = useRef(true);
  const draftRef = useRef(draft);
  const savedRef = useRef(savedDraft);
  const versionRef = useRef(version);
  const readonlyRef = useRef(false);
  const tokenRef = useRef('');
  const queueRef = useRef(Promise.resolve());
  const savingRef = useRef(false);
  const manualSaves = useRef(0);
  const discarded = useRef(false);
  const handedOff = useRef(false);
  const persistRef = useRef(async () => ({ ok: true, skipped: true }));
  draftRef.current = draft;
  savedRef.current = savedDraft;
  versionRef.current = version;
  const [tasks, setTasks] = useState([]); const [taskError, setTaskError] = useState('');
  const [audit, setAudit] = useState(null); const [auditMore, setAuditMore] = useState(false); const [auditBusy, setAuditBusy] = useState(false); const [auditError, setAuditError] = useState('');
  const optimization = review.kind === 'optimization';
  const aiReview = review.fill_origin === 'ia';
  const showReviewControls = !sheetView || aiReview;
  const client = board.clients.find((c) => c.id === review.client_id);
  const readonly = !review.can_edit;
  readonlyRef.current = readonly;
  const set = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }));
  const setAction = (key, value) => setDraft((prev) => ({ ...prev, action_draft: { ...prev.action_draft, [key]: value } }));
  useEffect(() => {
    const rows = (draft.campaign_metrics || [])
      .filter((row) => String(row.campaign_name || row.adset_name || '').trim())
      .map((row) => ({ campaign: row.campaign_name || '', adset: row.adset_name || '', spend: row.spend ?? '' }));
    window.dispatchEvent(new CustomEvent('planeje-routine-sheet', {
      detail: { clientId: review.client_id, weekStart: review.week_start, rows },
    }));
  }, [draft.campaign_metrics, review.client_id, review.week_start]);
  useEffect(() => {
    const onApply = (event) => {
      const detail = event.detail || {};
      if (detail.clientId !== review.client_id || detail.weekStart !== review.week_start) return;
      if (readonlyRef.current) {
        toast({ title: 'Esta semana está só para leitura', variant: 'destructive' });
        return;
      }
      setDraft((prev) => ({
        ...prev,
        results: detail.results ?? prev.results,
        contacts: detail.contacts ?? prev.contacts,
      }));
      toast({ title: 'Números colocados na Rotina', description: 'Eles gravam sozinhos. Confira antes de concluir.' });
    };
    window.addEventListener('planeje-routine-apply-results', onApply);
    return () => window.removeEventListener('planeje-routine-apply-results', onApply);
  }, [review.client_id, review.week_start, toast]);
  const resultLabel = draft.result_label || review.result_label || client?.settings?.result_label || '';
  const saveSheetMetrics = async (next) => {
    set('sheet_metrics', next);
    if (!board.can_manage || !client?.settings) return;
    try { await rpc('save_traffic_sheet_metrics', { p_client: review.client_id, p_sheet_metrics: next }); }
    catch (error) { toast({ title: 'Não foi possível guardar as colunas', description: error.message, variant: 'destructive' }); }
  };
  const sheetProps = { resultLabel, sheetMetrics: draft.sheet_metrics, canConfigure: board.can_manage && !readonly, onSheetMetricsChange: saveSheetMetrics,
    source: sheetView?.source, onInspectLeads: sheetView?.onInspectLeads };
  const requestClose = () => { if (busy) return; void leaveAfterSave(onClose); };
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let stop = false;
    supabase.auth.getSession().then(({ data }) => { if (!stop) tokenRef.current = data.session?.access_token || ''; });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => { tokenRef.current = session?.access_token || ''; });
    return () => { stop = true; sub.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (draft.action_mode !== 'link' || readonly || !showReviewControls) return;
    let cancelled = false;
    (async () => {
      const found = []; let from = 0;
      while (true) {
        const { data, error } = await supabase.from('tarefas').select('id,title,status,due_date').eq('client_id', review.client_id)
          .order('created_at', { ascending: false }).range(from, from + 199);

        if (error) throw error;
        found.push(...data.filter((t) => t.id !== review.task_id)); if (data.length < 200) break; from += 200;
      }
      if (!cancelled) { setTasks(found); setTaskError(''); }
    })().catch((e) => !cancelled && setTaskError(e.message));
    return () => { cancelled = true; };
  }, [draft.action_mode, readonly, review.client_id, review.task_id, showReviewControls]);
  const persistNow = async ({ silent = false, finalize = false } = {}) => {
    if (discarded.current) return { ok: true, skipped: true };
    const started = Date.now();
    while (handedOff.current && Date.now() - started < 4000) await new Promise((resolve) => setTimeout(resolve, 40));
    const snapshot = draftRef.current;
    const plan = reviewAutosavePlan({ draft: snapshot, savedSignature: savedRef.current, readonly: readonlyRef.current, finalize });
    if (plan.action === 'skip') {
      if (!silent && alive.current && plan.reason === 'clean') setAuto({ state: 'saved', detail: '' });
      return { ok: true, skipped: true };
    }
    if (plan.action === 'wait') {
      if (alive.current) setAuto({ state: 'wait', detail: plan.reason });
      if (!silent) toast({ title: plan.reason, variant: 'destructive' });
      return { ok: false, invalid: plan.reason };
    }
    if (handedOff.current) {
      if (alive.current) setAuto({ state: 'error', detail: 'A gravação ao sair ainda está em andamento. Aguarde antes de tentar novamente.' });
      return { ok: false };
    }
    savingRef.current = true;
    if (alive.current) setAuto({ state: 'saving', detail: '' });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const saveRpc = (name, params) => rpc(name, params, controller.signal);
    let revision = versionRef.current;
    try {
      if (!recordId.current) {
        const id = await saveRpc('start_traffic_week_record', { p_client: review.client_id, p_week: review.week_start, p_kind: review.kind || 'review' });
        const records = await saveRpc('traffic_routine_client_history', { p_client: review.client_id, p_kind: review.kind || 'review', p_before: shiftDate(review.week_start, 7), p_limit: 1 });
        const existing = records.find((r) => r.id === id);
        if (!existing || existing.revision > 0) throw new Error('Esta semana já foi alterada. Seu texto foi mantido nesta tela; reabra para conferir a versão atual.');
        recordId.current = id;
      }
      // A RPC ignora p_finalize numa ficha já concluída; grave a edição antes de concluir outra vez.
      if (finalize && finalizedRef.current && plan.signature !== savedRef.current) {
        await saveRpc('save_traffic_weekly_review', { p_review: recordId.current, p_revision: revision, p_data: reviewPayload(snapshot), p_finalize: false });
        revision += 1;
        versionRef.current = revision;
        savedRef.current = plan.signature;
        finalizedRef.current = null;
        if (alive.current) { setVersion(revision); setSavedDraft(plan.signature); setFinalizedAt(null); }
        invalidateCentralHojeCache(user.id);
        if (alive.current) onSaved?.(recordId.current, { finalize: false, silent: true, clientId: review.client_id, weekStart: review.week_start, kind: review.kind || 'review' });
      }
      await saveRpc('save_traffic_weekly_review', { p_review: recordId.current, p_revision: revision, p_data: reviewPayload(snapshot), p_finalize: finalize });
      savedRef.current = plan.signature;
      versionRef.current = revision + (finalize && finalizedRef.current ? 0 : 1);
      finalizedRef.current = finalize ? (finalizedRef.current || new Date().toISOString()) : null;
      if (alive.current) {
        setSavedDraft(plan.signature);
        setVersion(versionRef.current);
        setFinalizedAt(finalizedRef.current);
        setAuto({ state: 'saved', detail: '' });
        setDiscard(false);
        setLiveFill({ at: new Date().toISOString(), name: board.team?.find((person) => person.id === user.id)?.full_name || '' });
      }
      invalidateCentralHojeCache(user.id);
      if (alive.current) onSaved?.(recordId.current, { finalize, silent, clientId: review.client_id, weekStart: review.week_start, kind: review.kind || 'review' });
      if (!silent) {
        toast({ title: finalize ? (optimization ? 'Otimização registrada' : 'Semana revisada') : 'Rascunho salvo', description: finalize && snapshot.action_mode !== 'none' ? 'A próxima ação continua sendo acompanhada em Tarefas.' : undefined });
        if (alive.current) { setAudit(null); setAuditMore(false); }
      }
      if (finalize && alive.current) onClose();
      return { ok: true };
    } catch (error) {
      if (alive.current) setAuto({ state: 'error', detail: error.message });
      if (!silent) toast({ title: 'Não foi possível salvar', description: error.message, variant: 'destructive' });
      return { ok: false, error };
    } finally {
      clearTimeout(timeout);
      savingRef.current = false;
    }
  };
  const enqueueSave = (options = {}) => {
    if (!options.silent) { manualSaves.current += 1; if (alive.current) setBusy(true); }
    const run = queueRef.current.then(() => persistNow(options)).finally(() => {
      if (!options.silent) { manualSaves.current -= 1; if (alive.current) setBusy(manualSaves.current > 0); }
    });
    queueRef.current = run.then(() => undefined, () => undefined);
    return run;
  };
  persistRef.current = enqueueSave;
  useEffect(() => {
    if (readonly) return undefined;
    const plan = reviewAutosavePlan({ draft, savedSignature: savedRef.current, readonly: false });
    if (plan.action === 'skip') return undefined;
    if (plan.action === 'wait') {
      const timer = setTimeout(() => { if (alive.current) setAuto({ state: 'wait', detail: plan.reason }); }, REVIEW_AUTOSAVE_MS);
      return () => clearTimeout(timer);
    }
    setAuto((prev) => (prev.state === 'saving' || prev.state === 'pending' ? prev : { state: 'pending', detail: '' }));
    const timer = setTimeout(() => { if (!manualSaves.current) void persistRef.current({ silent: true }); }, REVIEW_AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [draft, readonly]);
  useEffect(() => () => {
    const plan = reviewAutosavePlan({ draft: draftRef.current, savedSignature: savedRef.current, readonly: readonlyRef.current });
    if (plan.action === 'save' && !handedOff.current && !discarded.current) void persistRef.current({ silent: true });
  }, []);
  useEffect(() => {
    const sendKeepalive = () => {
      const plan = reviewAutosavePlan({ draft: draftRef.current, savedSignature: savedRef.current, readonly: readonlyRef.current });
      if (plan.action !== 'save' || savingRef.current || handedOff.current) return false;
      const revision = versionRef.current;
      const request = draftKeepalive(recordId.current, revision, reviewPayload(draftRef.current), tokenRef.current);
      if (!request) return false;
      handedOff.current = true;
      savingRef.current = true;
      request.then(async (response) => {
        if (!response.ok) {
          handedOff.current = false;
          const text = await response.text();
          if (alive.current) setAuto({ state: 'error', detail: text.slice(0, 180) || 'Não gravou ao sair.' });
          return;
        }
        savedRef.current = plan.signature;
        versionRef.current = revision + 1;
        finalizedRef.current = null;
        handedOff.current = false;
        invalidateCentralHojeCache(user.id);
        if (alive.current) {
          setSavedDraft(plan.signature);
          setVersion(revision + 1);
          setFinalizedAt(null);
          setAuto({ state: 'saved', detail: '' });
        }
      }).catch(() => {
        handedOff.current = false;
        if (alive.current) setAuto({ state: 'error', detail: 'Não gravou ao sair.' });
      }).finally(() => { savingRef.current = false; });
      return true;
    };
    const onHide = () => { if (document.visibilityState === 'hidden') void persistRef.current({ silent: true }); };
    const onUnload = (event) => {
      const plan = reviewAutosavePlan({ draft: draftRef.current, savedSignature: savedRef.current, readonly: readonlyRef.current });
      if (plan.action !== 'save' && plan.action !== 'wait') return;
      const started = plan.action === 'save' && (savingRef.current || handedOff.current || sendKeepalive());
      if (event.type === 'beforeunload' && !started) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onUnload);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onUnload);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [user.id]);
  const loadAudit = async (nextPage = false) => {
    if (!recordId.current || auditBusy || (audit && !nextPage)) return;
    setAuditBusy(true);
    const base = () => supabase.from('traffic_weekly_history').select('id,event,occurred_at,actor_id,actor_type,snapshot,actor:profiles!actor_id(full_name)').eq('review_id', recordId.current);
    try {
      if (!nextPage) {
        const [latest, earliest] = await Promise.all([
          base().order('id', { ascending: false }).limit(30),
          base().order('id', { ascending: true }).limit(12),
        ]);
        if (latest.error) throw latest.error;
        if (earliest.error) throw earliest.error;
        const merged = [...earliest.data, ...latest.data]
          .filter((event, index, list) => list.findIndex((item) => item.id === event.id) === index)
          .sort((a, b) => Number(b.id) - Number(a.id));
        setAudit(merged); setAuditMore(latest.data.length === 30); setAuditError('');
      } else {
        const cursor = audit?.length ? audit[audit.length - 1].id : null;
        const { data, error } = await base().order('id', { ascending: false }).lt('id', cursor).limit(30);
        if (error) throw error;
        setAudit((prev) => [...prev, ...data].filter((event, index, list) => list.findIndex((item) => item.id === event.id) === index));
        setAuditMore(data.length === 30); setAuditError('');
      }
    } catch (error) { setAuditError(error.message); }
    finally { setAuditBusy(false); }
  };
  useEffect(() => { if (recordId.current) loadAudit(); }, [review.id]);
  const metrics = reviewMetrics(readonly ? review : reviewPayload(draft));
  const leaveAfterSave = async (go) => {
    const plan = reviewAutosavePlan({ draft: draftRef.current, savedSignature: savedRef.current, readonly: readonlyRef.current });
    if (plan.action === 'save') {
      const result = await enqueueSave({ silent: false });
      if (!result?.ok) { setDiscard(true); return; }
    } else if (plan.action === 'wait') {
      setAuto({ state: 'wait', detail: plan.reason });
      setDiscard(true);
      return;
    }
    go();
  };
  const changeSheet = (clientId, week, kind) => {
    void leaveAfterSave(() => { if (kind === 'history') onHistory(); else onNavigate(clientId, week, kind); });
  };
  const autoLabel = reviewAutosaveLabel(auto.state, auto.detail);
  const fillView = reviewFillView(audit || [], {
    review, live: liveFill, names: Object.fromEntries((board.team || []).map((person) => [person.id, person.full_name])),
  });
  const comparablePrevious = previous?.metric_mode !== 'campaign' && previous?.result_label === review.result_label ? previous : null;
  return <div className="tw-workspace">
    <header className="tw-sheet-header">
      <select aria-label="Cliente da tabela" value={review.client_id} disabled={busy || navigationBusy} onChange={(e) => changeSheet(e.target.value,review.week_start,review.kind || 'review')}><option value={review.client_id}>{review.empresa}</option>{clients.filter((c) => c.id !== review.client_id).map((c) => <option key={c.id} value={c.id}>{c.empresa}</option>)}</select>
      <div className="tw-week"><Button size="icon" variant="ghost" aria-label="Semana anterior" disabled={busy || navigationBusy} onClick={() => changeSheet(review.client_id,shiftDate(review.week_start,-7),review.kind || 'review')}><ChevronLeft size={16}/></Button><strong>{displayWeek(review.week_start)}</strong><Button size="icon" variant="ghost" aria-label="Próxima semana" disabled={busy || navigationBusy || review.week_start >= shiftDate(lastClosedWeek(board.today),7)} onClick={() => changeSheet(review.client_id,shiftDate(review.week_start,7),review.kind || 'review')}><ChevronRight size={16}/></Button></div>
      {sheetView ? <label className="tw-sheet-date">Semana de<input type="date" aria-label="Escolher data da semana" value={review.week_start} max={board.today} disabled={busy || navigationBusy} onChange={(event) => { const week = normalizeRoutineWeek(event.target.value); if (week) changeSheet(review.client_id, week, 'review'); }} /></label> : <>
        <div className="tw-choices">{[['review','Resultados'],['optimization','Otimização']].map(([kind,label]) => <button key={kind} disabled={busy || navigationBusy} className={(review.kind || 'review') === kind ? 'is-active' : ''} onClick={() => changeSheet(review.client_id,review.week_start,kind)}>{label}</button>)}</div>
        <Button variant="ghost" size="sm" onClick={() => changeSheet(null,null,'history')} disabled={busy}>Histórico</Button>
        {board.can_manage && <Button variant="ghost" size="icon" aria-label="Configurar rotina" onClick={onSettings}><Settings2 size={16}/></Button>}
      </>}
    </header>
    <div className="tw-dialog-body tw-form">
      {readonly && <p className="tw-hint">Somente leitura</p>}
      {aiReview && !finalizedAt && <p className="gia-routine-ai-badge" role="status">Preenchido pela IA, aguardando validação</p>}
      {review.ai_suggestion && <div className="tw-box"><strong>Sugestão da IA</strong><p>{review.ai_suggestion}</p></div>}
      {!readonly && finalizedAt && <p className="tw-hint">Concluída · {displayDate(finalizedAt)}. Pode editar — ao digitar grava e reabre até concluir de novo.</p>}
      {optimization ? <><details className="tw-box"><summary>Campanhas conferidas</summary><div className="mt-3"><TrafficCampaignMetrics contextOnly rows={draft.campaign_metrics} accounts={client?.accounts || []} readonly={readonly || busy} onChange={(rows) => set('campaign_metrics', rows)} weekStart={review.week_start} {...sheetProps} /></div></details></> : <>

        {draft.metric_mode === 'campaign' ? <TrafficCampaignMetrics rows={draft.campaign_metrics} accounts={client?.accounts || []} readonly={readonly || busy} onChange={(rows) => set('campaign_metrics', rows)} weekStart={review.week_start} {...sheetProps} /> : <>
      <div className="tw-grid tw-grid--three">
        <label>Investimento em mídia (R$)<input inputMode="decimal" placeholder="Não informado" disabled={readonly || busy} value={draft.investment} onChange={(e) => set('investment', e.target.value)} /><small>{comparablePrevious ? `Anterior: ${currency(comparablePrevious.investment)}` : 'Meta e Google no período'}</small></label>
        <label>Contatos gerados pela mídia<input inputMode="numeric" placeholder="Não informado" disabled={readonly || busy} value={draft.contacts} onChange={(e) => set('contacts', e.target.value)} /><small>{comparablePrevious ? `Anterior: ${comparablePrevious.contacts ?? 'não informado'}` : 'Contatos únicos da semana'}</small></label>
        <label>{review.result_label}<input inputMode="numeric" placeholder="Não informado" disabled={readonly || busy} value={draft.results} onChange={(e) => set('results', e.target.value)} /><small>{comparablePrevious ? `Anterior: ${comparablePrevious.results ?? 'não informado'}` : 'Contatos que atingiram o objetivo'}</small></label>
      </div>
      <p className="tw-hint">Custo por resultado: <strong>{currency(metrics.costPerResult)}</strong> · Conversão desses contatos: <strong>{metrics.conversionRate == null ? 'Não informada' : `${metrics.conversionRate.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}</strong></p>
        </>}
      </>}
      {showReviewControls && <><label className="tw-box">{optimization ? 'Ajustes feitos' : 'Análise'}<textarea aria-label="Análise da revisão" rows={2} maxLength={10000} disabled={readonly || busy} value={draft.analysis} onChange={(e) => set('analysis', e.target.value)} placeholder="O que mudou e o que fazer agora?" /></label>
      <div className="tw-when" aria-label="Datas do preenchimento">
        <p>{fillView.headline}</p>
        {fillView.lines.length > 1 ? <details><summary>Alterações</summary><ul>{fillView.lines.map((line) => <li key={line.id}>{line.text}</li>)}</ul></details> : null}
      </div>
      <div className="tw-next tw-box">
        <strong>Próximo passo</strong>
        {readonly ? (
          review.action_task_id
            ? <p><Link to={`/tasks/list/${review.action_task_id}`}>{review.action_title || 'Abrir tarefa'}</Link> · {review.action_completed ? 'Concluída' : `Pendente · ${displayDate(review.action_due_date)}`}</p>
            : <p>{draft.analysis || review.analysis ? 'Manter estratégia e acompanhar na próxima revisão.' : 'Ainda sem próximo passo.'}</p>
        ) : (
          <>
            <div className="tw-choices">{[['none','Acompanhar'],['create','Criar tarefa'],['link','Tarefa existente']].map(([value, label]) => <button type="button" key={value} disabled={busy} aria-pressed={draft.action_mode === value} className={draft.action_mode === value ? 'is-active' : ''} onClick={() => set('action_mode', value)}>{label}</button>)}</div>
            {draft.action_mode === 'create' && <div className="tw-form"><label>O que precisa ser feito?<input disabled={busy} value={draft.action_draft.title} onChange={(e) => setAction('title', e.target.value)} placeholder="Ex.: solicitar um novo criativo para a campanha" /></label><div className="tw-grid"><label>Responsável<select disabled={busy} value={draft.action_draft.assignee_id} onChange={(e) => setAction('assignee_id', e.target.value)}><option value="">Escolher</option>{board.team.map((person) => <option key={person.id} value={person.id}>{person.full_name}{person.id === user.id ? ' (você)' : ''}</option>)}</select></label><label>Prazo<input type="date" disabled={busy} value={draft.action_draft.due_date} onChange={(e) => setAction('due_date', e.target.value)} /></label></div></div>}
            {draft.action_mode === 'link' && <label>Tarefa do cliente<select disabled={busy} value={draft.action_task_id} onChange={(e) => set('action_task_id', e.target.value)}><option value="">Escolher uma tarefa existente</option>{tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select>{taskError && <small role="alert">{taskError}</small>}</label>}
          </>
        )}
      </div>
      <details className="tw-box"><summary>Observações</summary><label className="mt-2"><textarea rows={2} maxLength={2000} disabled={readonly || busy} value={draft.data_note} onChange={(e) => set('data_note', e.target.value)} placeholder="Ex.: investimento e contatos do Meta/Google; agendamentos conferidos no CRM." /></label></details></>}
      <details className="tw-box" onToggle={(e) => e.currentTarget.open && loadAudit()}>
        <summary>Histórico deste registro</summary>
        {auditError && <p role="alert">{auditError}</p>}
        {audit?.map((event) => {
          const after = event.snapshot?.after;
          const actorName = event.actor?.full_name || board.team.find((person) => person.id === event.actor_id)?.full_name;
          const actorLabel = event.actor_type === 'ia' ? `IA (Neuro)${actorName ? ` · em nome de ${actorName}` : ''}` : actorName || (event.actor_id ? 'Integrante da equipe' : 'Rotina automática');
          const changes = reviewChangeLabels(event.snapshot?.before, after);
          const title = event.snapshot?.change_type === 'suggestion' ? 'Sugestão da IA salva' : ({ created: 'Revisão criada', draft: 'Rascunho salvo', finalized: 'Análise finalizada' })[event.event];
          return <div className="tw-audit" key={event.id}>
            <strong>{title}</strong><span>{actorLabel} · {displayStamp(event.occurred_at)}</span>
            {changes.length > 0 && <p>Alterações: {changes.join(', ')}</p>}
            {after && <details><summary>Ver conteúdo registrado</summary>
              <p className="tw-text">{after.analysis || 'Análise ainda não preenchida.'}</p>
              {after.ai_suggestion && <p className="tw-text">Sugestão da IA: {after.ai_suggestion}</p>}
              <p>Investimento: {currency(after.investment)} · Contatos: {after.contacts ?? 'não informado'} · {review.result_label}: {after.results ?? 'não informado'}</p>
            </details>}
          </div>;
        })}
        {auditMore && <Button variant="ghost" size="sm" disabled={auditBusy} onClick={() => loadAudit(true)}>Ver alterações anteriores</Button>}
      </details>
    </div>
    {discard ? <footer><span className={`tw-autosave is-${auto.state}`} role="status">{autoLabel || 'Há alterações que ainda não gravaram.'}</span><Button variant="ghost" onClick={() => setDiscard(false)}>Continuar editando</Button><Button variant="destructive" onClick={() => { discarded.current = true; onClose(); }}>Descartar alterações</Button></footer> : <footer>
      <span className={`tw-autosave is-${auto.state}`} role="status">{autoLabel}</span>
      <Button variant="ghost" onClick={requestClose} disabled={busy}>{sheetView ? 'Voltar aos clientes' : readonly ? 'Fechar' : 'Cancelar'}</Button>{!readonly && <><Button onClick={() => enqueueSave({ silent: false, finalize: false })} disabled={busy}>Salvar</Button>{showReviewControls && <Button variant="ghost" onClick={() => enqueueSave({ silent: false, finalize: true })} disabled={busy || (!optimization && review.week_start > lastClosedWeek(board.today))} title={!optimization && review.week_start > lastClosedWeek(board.today) ? 'Disponível após encerrar a semana' : undefined}>{busy ? 'Salvando…' : sheetView && aiReview ? 'Validar' : optimization ? 'Concluir otimização' : 'Concluir revisão'}</Button>}</>}
    </footer>}
  </div>;
}

export default function TrafficWeeklyRoutine() {
  const { user, profile } = useAuth(); const { toast } = useToast(); const location = useLocation(); const navigate = useNavigate();
  const [board, setBoard] = useState(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [view, setView] = useState('routine'); const [mine, setMine] = useState(!['admin','superadmin'].includes(profile?.role)); const [search, setSearch] = useState('');
  const [locate, setLocate] = useState('all');
  const [logos, setLogos] = useState({});
  const [agenda, setAgenda] = useState({ tasks: [], groups: {} });
  const [settings, setSettings] = useState(null); const [selected, setSelected] = useState(null);
  const [enableOpen, setEnableOpen] = useState(false);
  const [sheetPrevious, setSheetPrevious] = useState(null);
  const [focusClient, setFocusClient] = useState("");
  const [historyKind, setHistoryKind] = useState('review');
  const [week, setWeek] = useState(''); const [historyClient, setHistoryClient] = useState(''); const [history, setHistory] = useState([]); const [more, setMore] = useState(false); const [loadingHistory, setLoadingHistory] = useState(false);
  const alive = useRef(true);
  const load = useCallback(async () => {
    setBusy(true);
    try { const data = await rpc('traffic_weekly_board'); if (alive.current) { setBoard(data); setError(''); setWeek((prev) => prev || lastClosedWeek(data.today)); } }
    catch (e) { if (alive.current) setError(e.message); }
    finally { if (alive.current) setBusy(false); }
  }, []);
  useEffect(() => { alive.current = true; load(); return () => { alive.current = false; }; }, [load]);
  useEffect(() => {
    const ids = (board?.clients || []).map((client) => client.id).filter(Boolean);
    if (!ids.length) return undefined;
    let cancelled = false;
    supabase.from('clientes').select('id, logo_urls').in('id', ids).then(({ data, error: logoError }) => {
      if (cancelled || logoError) return;
      const next = {};
      for (const row of data || []) {
        const url = rewritePublicStorageUrl(Array.isArray(row.logo_urls) ? row.logo_urls[0] : '') || '';
        if (url) next[row.id] = url;
      }
      setLogos(next);
    });
    return () => { cancelled = true; };
  }, [board]);
  useEffect(() => {
    const ids = (board?.clients || []).map((client) => client.id).filter(Boolean);
    if (!ids.length) return undefined;
    let cancelled = false;
    (async () => {
      try { await supabase.rpc('central_trafego_ensure_routine_demands'); } catch { /* a lista segue sem criar demanda */ }
      const since = shiftDate(board.today, -21);
      const [{ data: taskRows }, { data: clientRows }] = await Promise.all([
        supabase.from('traffic_task_details').select('generation_key, tarefas!inner(id, client_id, due_date, status, title)').or('generation_key.like.report_15d:%,generation_key.like.group_week:%').gte('tarefas.due_date', since).limit(400),
        supabase.from('clientes').select('id, entregaveis').in('id', ids),
      ]);
      if (cancelled) return;
      const open = (taskRows || []).filter((row) => {
        const task = row.tarefas;
        return task && ids.includes(task.client_id) && task.status !== 'completed' && task.status !== 'published';
      });
      const groups = {};
      for (const row of clientRows || []) {
        groups[row.id] = Boolean(row.entregaveis?.whatsapp_grupo?.chat_jid);
      }
      setAgenda({ tasks: open, groups });
    })();
    return () => { cancelled = true; };
  }, [board]);
  const refresh = async () => {
    setBusy(true);
    try { const result = await rpc('refresh_traffic_weekly_routine'); if (result.errors) toast({ title: 'Há configurações para conferir', description: 'Veja o aviso junto ao cliente.', variant: 'destructive' }); await load(); }
    catch (e) { toast({ title: 'Não foi possível atualizar', description: e.message, variant: 'destructive' }); setBusy(false); }
  };
  const sheetParams = useMemo(() => {
    const q = new URLSearchParams(location.search);
    return {
      review: q.get('review') || '',
      cliente: q.get('cliente') || '',
      semana: q.get('semana') || '',
      tipo: q.get('tipo') === 'optimization' ? 'optimization' : 'review',
    };
  }, [location.search]);
  const syncSheetUrl = useCallback((clientId, weekStart, kind, reviewId) => {
    const assistant = new URLSearchParams(location.search).get('assistant') || undefined;
    const next = buildRoutineSheetUrl({
      clientId,
      weekStart,
      kind: kind || 'review',
      reviewId: reviewId || undefined,
      assistant,
    });
    const current = `${location.pathname}${location.search}`;
    if (current === next) return;
    navigate(next, { replace: true });
  }, [location.pathname, location.search, navigate]);
  const openRecordRef = useRef(async () => {});
  const selectedRef = useRef(null);
  selectedRef.current = selected;
  useEffect(() => {
    if (!board) return undefined;
    let cancelled = false;
    if (sheetParams.review) {
      const existing = board.reviews.find((r) => r.id === sheetParams.review);
      if (existing) {
        setSelected((prev) => prev?.id === existing.id ? prev : existing);
        setFocusClient(existing.client_id);
        setWeek(existing.week_start);
        syncSheetUrl(existing.client_id, existing.week_start, existing.kind || 'review', existing.id);
        return undefined;
      }
      (async () => {
        const { data, error: e } = await supabase.from('traffic_weekly_reviews').select('client_id,week_start,kind').eq('id', sheetParams.review).maybeSingle();
        if (e) throw e; if (!data) throw new Error('Revisão indisponível para este usuário.');
        if (cancelled) return;
        await openRecordRef.current?.(data.kind || 'review', data.client_id, data.week_start);
      })().catch((e) => !cancelled && toast({ title: 'Não foi possível abrir', description: e.message, variant: 'destructive' }));
      return () => { cancelled = true; };
    }
    if (sheetParams.cliente && sheetParams.semana) {
      const cur = selectedRef.current;
      const already = cur?.client_id === sheetParams.cliente
        && cur?.week_start === sheetParams.semana
        && (cur?.kind || 'review') === sheetParams.tipo;
      if (!already) void openRecordRef.current?.(sheetParams.tipo, sheetParams.cliente, sheetParams.semana);
    }
    return undefined;
  }, [sheetParams.review, sheetParams.cliente, sheetParams.semana, sheetParams.tipo, board, toast, syncSheetUrl]);
  useEffect(() => {
    let cancelled = false; setHistory([]); setMore(false);
    if (!historyClient) return;
    setLoadingHistory(true);
    rpc('traffic_routine_client_history', { p_client: historyClient, p_kind: historyKind, p_limit: 30 }).then((records) => { if (!cancelled) { setHistory(records); setMore(records.length === 30); } })
      .catch((e) => !cancelled && toast({ title: 'Não foi possível carregar histórico', description: e.message, variant: 'destructive' }))
      .finally(() => !cancelled && setLoadingHistory(false));
    return () => { cancelled = true; };
  }, [historyClient, historyKind, toast, board]);
  const loadMore = async () => {
    setLoadingHistory(true);
    try { const records = await rpc('traffic_routine_client_history', { p_client: historyClient, p_kind: historyKind, p_before: history[history.length - 1].week_start, p_limit: 30 }); setHistory((prev) => [...prev, ...records]); setMore(records.length === 30); }
    catch (e) { toast({ title: 'Não foi possível carregar histórico', description: e.message, variant: 'destructive' }); }
    finally { setLoadingHistory(false); }
  };
  const rows = useMemo(() => board ? routineRows(board, { userId: user.id, mine, search, includeHistory: view === 'history' }) : [], [board, user.id, mine, search, view]);
  const catalog = useMemo(() => groupRoutineClients(rows, board?.today, 'all'), [rows, board]);
  const grouped = useMemo(() => (locate === 'all' ? catalog : groupRoutineClients(rows, board?.today, locate)), [catalog, rows, board, locate]);
  const visibleIds = new Set(rows.map((r) => r.id));
  const shownReviews = (historyClient ? history : (board?.reviews || []).filter((r) => r.week_start === (historyKind === 'optimization' ? shiftDate(week, 7) : week) && (r.kind || 'review') === historyKind)).filter((r) => visibleIds.has(r.client_id));
  const comparison = campaignComparison(shownReviews);
  const closeReview = () => {
    setSelected(null);
    setFocusClient('');
    void load();
    if (sheetParams.review || sheetParams.cliente) navigate('/paid-traffic/rotina', { replace: true });
  };
  const openRecord = useCallback(async (kind = 'review', clientId = focusClient, targetWeek = week) => {
    if (!board) return;
    const client = board.clients.find((c) => c.id === clientId);
    if (!client || busy) return;
    setBusy(true);
    try {
      const records = await rpc('traffic_routine_client_history', { p_client: clientId, p_kind: kind, p_before: shiftDate(targetWeek, 7), p_limit: 30 });
      const record = records.find((r) => r.week_start === targetWeek);
      const previous = records.find((r) => r.week_start < targetWeek && r.finalized_at && r.metric_mode === 'campaign');
      setHistory(records); setFocusClient(clientId); setHistoryClient(clientId); setHistoryKind(kind); setWeek(targetWeek);
      const next = record || {
        id: null, client_id: clientId, empresa: client.empresa, week_start: targetWeek, kind, revision: 0, metric_mode: 'campaign',
        can_edit: client.eligible !== false && (board.can_manage || client.manager_id === user.id),
        result_label: client.settings?.result_label || 'Agendamentos',
      };
      setSelected(next);
      setSheetPrevious(previous || null);
      syncSheetUrl(clientId, targetWeek, kind, next.id || undefined);
    } catch (e) { toast({ title: 'Não foi possível carregar a semana', description: e.message, variant: 'destructive' }); }
    finally { setBusy(false); }
  }, [board, busy, focusClient, week, user.id, toast, syncSheetUrl]);
  openRecordRef.current = openRecord;
  const handleSaved = useCallback(async (reviewId, meta = {}) => {
    if (reviewId && meta.clientId && meta.weekStart) {
      syncSheetUrl(meta.clientId, meta.weekStart, meta.kind || 'review', reviewId);
      setSelected((prev) => (prev && prev.client_id === meta.clientId && prev.week_start === meta.weekStart
        ? { ...prev, id: reviewId, finalized_at: meta.finalize ? (prev.finalized_at || new Date().toISOString()) : null }
        : prev));
    }
    if (!meta.silent && !meta.finalize) void load();
  }, [syncSheetUrl, load]);
  if (!board) return <div className="tw-panel">{error ? <p role="alert">{error} <Button variant="outline" onClick={load}>Tentar novamente</Button></p> : <p><Loader2 className="inline h-4 w-4 animate-spin" /> Carregando a rotina…</p>}</div>;
  if (selected) return <section className="tw-panel"><TrafficWeeklyReviewEditor key={`${selected.client_id}:${selected.week_start}:${selected.kind}`} review={selected} previous={(sheetPrevious?.client_id === selected.client_id && (sheetPrevious.kind || 'review') === (selected.kind || 'review') ? sheetPrevious : null) || [...history, ...board.reviews].find((r) => r.client_id === selected.client_id && (r.kind || 'review') === (selected.kind || 'review') && r.week_start === shiftDate(selected.week_start,-7) && r.finalized_at)} board={board} clients={rows} navigationBusy={busy} onNavigate={(c,w,k) => { openRecord(k,c,w); }} onSettings={() => setSettings(board.clients.find((c) => c.id === selected.client_id))} onHistory={() => { closeReview(); setView('history'); setHistoryClient(selected.client_id); setHistoryKind(selected.kind || 'review'); }} onClose={closeReview} onSaved={handleSaved}/>{settings && <SettingsDialog key={settings.id} client={settings} board={board} onClose={() => setSettings(null)} onSaved={refresh}/>}</section>;
  const openHistory = (client) => { setView('history'); setHistoryClient(client.id); };
  return (
    <section className={`tw-panel${view === 'routine' ? ' is-list' : ''}`}>
      <div className="tw-toolbar">
        <div className="tw-choices">
          <button className={view === 'routine' ? 'is-active' : ''} aria-pressed={view === 'routine'} onClick={() => setView('routine')}>
            <CalendarDays size={15} /> Rotina
          </button>
          <button className={view === 'history' ? 'is-active' : ''} aria-pressed={view === 'history'} onClick={() => setView('history')}>
            <History size={15} /> Histórico
          </button>
        </div>
        <input aria-label="Buscar cliente" className="tw-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente" />
        <label className="tw-switch">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Comigo
        </label>
        <Button variant="ghost" size="sm" onClick={board.can_manage ? refresh : load} disabled={busy}>
          <RefreshCw size={15} className={busy ? 'animate-spin' : ''} /> Atualizar
        </Button>
      </div>
      {error && <p role="alert" className="tw-error">Não foi possível atualizar: {error}. Os dados exibidos são da última leitura.</p>}
      {view === 'routine' ? (
        <div className="tw-board">
          <div className="tw-command">
            <div className="tw-locate" role="group" aria-label="Onde procurar">
              {[
                ['all', 'Todas', grouped.counts.all],
                ['late', 'Atrasadas', grouped.counts.late],
                ['review', 'Análise', grouped.counts.review],
                ['optimization', 'Otimização', grouped.counts.optimization],
              ].map(([id, label, count]) => (
                <button key={id} type="button" className={locate === id ? 'is-active' : ''} aria-pressed={locate === id} onClick={() => setLocate(id)}>
                  {label} <strong>{count}</strong>
                </button>
              ))}
            </div>
            <div className="tw-command-side">
              <select
                aria-label="Abrir cliente para análise"
                className="tw-open-week"
                value={focusClient}
                disabled={busy}
                onChange={(e) => openRecord('review', e.target.value, week)}
              >
                <option value="">Abrir a semana de…</option>
                {catalog.shelves.map((shelf) => (
                  <optgroup key={shelf.id} label={`${shelf.title} · ${shelf.items.length}`}>
                    {shelf.items.map((item) => (
                      <option key={item.client.id} value={item.client.id}>{item.client.empresa}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {board.can_manage ? (
                <Button size="sm" onClick={() => setEnableOpen(true)}>Ligar análise e otimização</Button>
              ) : null}
            </div>
          </div>
          {grouped.shelves.map((shelf) => (
            <section key={shelf.id} className={`tw-shelf is-${shelf.id}`}>
              <header className="tw-shelf-head">
                <h3>{shelf.title}</h3>
                <span>{shelf.items.length}</span>
                <small>{shelf.hint}</small>
              </header>
              <ul className="tw-client-list">
                {shelf.items.map(({ client, analysis, optimization }) => {
                  const action = client.actions[0];
                  const tone = analysis?.tone === 'late' || optimization?.tone === 'late'
                    ? 'late'
                    : analysis?.tone === 'open'
                      ? 'analysis'
                      : optimization?.tone === 'open'
                        ? 'optimize'
                        : analysis
                          ? 'analysis'
                          : optimization
                            ? 'optimize'
                            : '';
                  return (
                    <li key={client.id} className={`tw-client-card${tone ? ` is-${tone}` : ''}`}>
                      <ClientMark name={client.empresa} src={logos[client.id]} />
                      <div className="tw-client-main">
                        <button type="button" className="tw-client-name" onClick={() => openRecord('review', client.id, week)}>
                          {client.empresa}
                        </button>
                        <p className="tw-client-manager">{client.manager_name || 'Sem gestor'}</p>
                        {client.issues?.length ? client.issues.map((issue) => (
                          <p className="tw-error" key={`${issue.kind}:${issue.due_on}`}>{issue.message}</p>
                        )) : null}
                        <div className="tw-cadences">
                          {analysis || optimization ? (
                            <>
                              <CadenceChip look={analysis} onOpen={(r) => openRecord(r.kind || 'review', r.client_id, r.week_start)} />
                              <CadenceChip look={optimization} onOpen={(r) => openRecord(r.kind || 'review', r.client_id, r.week_start)} />
                            </>
                          ) : (
                            <span className="tw-cadence is-row is-off"><span className="tw-cadence-title">Rotina off</span></span>
                          )}
                          <AgendaLine clientId={client.id} today={board.today} agenda={agenda} />
                          {action ? (
                            <Link className="tw-cadence is-row is-action" to={`/tasks/list/${action.action_task_id}`}>
                              <span className="tw-cadence-tag">Ação</span>
                              <span className="tw-cadence-title">{action.action_title}</span>
                              <span className="tw-cadence-detail">{displayDay(action.action_due_date)}{client.actions.length > 1 ? ` · +${client.actions.length - 1}` : ''}</span>
                            </Link>
                          ) : null}
                        </div>
                      </div>
                      <div className="tw-client-actions">
                        <button type="button" className="tw-client-go" onClick={() => openRecord('review', client.id, week)}>Abrir</button>
                        <button type="button" className="tw-client-go" onClick={() => openHistory(client)}>Histórico</button>
                        {board.can_manage && client.eligible !== false ? (
                          <Button size="icon" variant="ghost" aria-label={`Configurar rotina de ${client.empresa}`} onClick={() => setSettings(client)}>
                            <Settings2 size={16} />
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {!grouped.shelves.length ? <p className="tw-empty">Nenhum cliente nesta seleção.</p> : null}
        </div>
      ) : (
        <>
      <div className="tw-choices mb-3">{[['review', 'Revisões'], ['optimization', 'Otimizações']].map(([value, label]) => <button key={value} className={historyKind === value ? 'is-active' : ''} aria-pressed={historyKind === value} onClick={() => setHistoryKind(value)}>{label}</button>)}</div>
      <div className="tw-history-controls"><select aria-label="Histórico do cliente" value={historyClient} onChange={(e) => setHistoryClient(e.target.value)}><option value="">Todos nesta semana</option>{rows.map((c) => <option key={c.id} value={c.id}>{c.empresa}</option>)}</select>{!historyClient && <div className="tw-week"><Button size="icon" variant="ghost" aria-label="Semana anterior" onClick={() => setWeek(shiftDate(week, -7))}><ChevronLeft size={16} /></Button><span>{displayWeek(historyKind === 'optimization' ? shiftDate(week, 7) : week)}</span><Button size="icon" variant="ghost" aria-label="Próxima semana" disabled={week >= lastClosedWeek(board.today)} onClick={() => setWeek(shiftDate(week, 7))}><ChevronRight size={16} /></Button></div>}</div>
      {historyClient && comparison.weeks.length > 0 && <div className="tw-table-wrap tw-comparison"><table className="tw-table"><caption>Comparação por campanha · últimas {comparison.weeks.length} revisões desta seleção</caption><thead><tr><th>Campanha / conta</th>{comparison.weeks.map((r) => <th key={r.id}>{displayDate(r.week_start)} a {displayDate(shiftDate(r.week_start, 6))}</th>)}</tr></thead><tbody>{comparison.rows.map((row) => <tr key={row.key}><td><strong>{row.campaign_name}</strong>{row.adset_name && <small>Conjunto: {row.adset_name}</small>}<small>{row.account_name}</small>{row.conversion_label && <small>{row.conversion_label}</small>}</td>{comparison.weeks.map((r) => { const metric = row.weeks[r.id]; const bits = metric ? [metric.messages != null && `${metric.messages} msg.`, metric.appointments != null && `${metric.appointments} agend.`, metric.conversions != null && `${metric.conversions} ${row.conversion_label || 'resultados'}`, metric.calls != null && `${metric.calls} lig.`].filter(Boolean) : []; return <td key={r.id}>{metric ? <><strong>{currency(metric.spend)}</strong>{bits.length ? <small>{bits.join(' · ')}</small> : null}</> : '—'}</td>; })}</tr>)}</tbody></table></div>}
      {!historyClient && week < shiftDate(lastClosedWeek(board.today), -49) && <p className="tw-hint">Para consultar semanas mais antigas, escolha um cliente. O histórico completo tem navegação por páginas.</p>}
      {loadingHistory && !history.length ? <p className="tw-empty">Carregando histórico…</p> : <div className="tw-history-list">{shownReviews.map((r) => <button key={r.id} className="tw-history-row" onClick={() => openRecord(r.kind || 'review', r.client_id, r.week_start)}><div><strong>{r.empresa}</strong><small>{displayWeek(r.week_start)} · {r.revision > 0 && r.updated_at ? `Gravada ${displayStamp(r.updated_at)}` : 'Ainda não preenchida'}{r.finalized_at ? ` · concluída ${displayStamp(r.finalized_at)}${r.reviewer_name ? ` por ${r.reviewer_name}` : ''}` : ''}</small></div><div>{r.kind === 'optimization' ? <strong>{r.analysis || 'Conferência ainda não registrada'}</strong> : <><strong>{currency(r.investment)}</strong><small>{r.metric_mode === 'campaign' ? `${r.campaign_metrics.length} campanha(s)` : `${r.contacts ?? '—'} contatos · ${r.results ?? '—'} ${r.result_label.toLocaleLowerCase('pt-BR')}`}</small></>}</div><State review={r} today={board.today} /><ChevronRight size={16} /></button>)}{!shownReviews.length && <p className="tw-empty">Nenhuma revisão registrada neste período.</p>}</div>}
      {historyClient && more && <Button className="mt-3" variant="outline" onClick={loadMore} disabled={loadingHistory}>Carregar semanas anteriores</Button>}
      {board.reviews.filter((r) => visibleIds.has(r.client_id) && r.action_task_id && !r.action_completed && (!historyClient || r.client_id === historyClient)).length > 0 && <details className="mt-4"><summary>Próximas ações ainda abertas</summary>{board.reviews.filter((r) => visibleIds.has(r.client_id) && r.action_task_id && !r.action_completed && (!historyClient || r.client_id === historyClient)).map((r) => <p className="tw-text" key={r.id}><Link to={`/tasks/list/${r.action_task_id}`}>{r.empresa} · {r.action_title}</Link> · {displayDate(r.action_due_date)}</p>)}</details>}
        </>
      )}
      {settings && <SettingsDialog key={settings.id} client={settings} board={board} onClose={() => setSettings(null)} onSaved={refresh} />}
      {enableOpen && <EnableAutomaticDialog board={board} clients={rows} onClose={() => setEnableOpen(false)} onSaved={refresh} />}
    </section>
  );
}
