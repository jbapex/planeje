import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, RefreshCw, Settings2, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useCentralTrafegoSituacao } from '@/hooks/useCentralTrafegoSituacao';
import { TRAFFIC_SITUATIONS, formatOperationalUpdatedAt, situationLabel } from '@/lib/centralTrafego';
import { checkupOutcomeLabel, formatCheckupTime } from '@/lib/centralTrafegoCheckup';
import { upsertTrafficClientOps } from '@/lib/centralTrafegoApi';
import { formatMoney } from '@/lib/trafegoFila';
import { formatMetaSyncedAgo } from '@/lib/clienteMetaSnapshot';
import { nextActionForAccount } from '@/lib/trafegoProximaAcao';
import { painelHref } from '@/lib/trafegoPainelHref';
import CentralTrafegoCheckupSettingsDialog from '@/components/traffic/CentralTrafegoCheckupSettingsDialog';
import CentralTrafegoRoutineSettingsDialog from '@/components/traffic/CentralTrafegoRoutineSettingsDialog';
import './CentralTrafego.css';

function situationTone(value) {
  if (TRAFFIC_SITUATIONS.some((s) => s.value === value)) return value;
  return 'muted';
}

function MetaBlock({ meta, snapshot, bloqueioLabel }) {
  const ago = formatMetaSyncedAgo(snapshot?.syncedAt);
  if (meta.kind === 'unavailable') {
    return (
      <div>
        <strong className="central-trafego-meta-off">Meta indisponível</strong>
        <small>{meta.detail}</small>
      </div>
    );
  }
  if (meta.kind === 'zero') {
    return (
      <div>
        <strong>Nada no ar</strong>
        <small>{ago ? `Meta ${ago}` : meta.detail}</small>
        {snapshot?.deliveryAlert ? <small>{snapshot.deliveryAlert}</small> : null}
        {bloqueioLabel ? <small>Motivo: {bloqueioLabel}</small> : null}
      </div>
    );
  }
  return (
    <div>
      <strong>{snapshot?.activeCount || 0} no ar</strong>
      <small>
        {formatMoney(snapshot?.spend || 0)} no período
        {ago ? ` · ${ago}` : ''}
      </small>
      {snapshot?.deliveryAlert ? <small>{snapshot.deliveryAlert}</small> : null}
      {bloqueioLabel ? <small>Motivo: {bloqueioLabel}</small> : null}
    </div>
  );
}

function NextBlock({ label, item, overdue, computed, clientId }) {
  // Ação da Meta não é tapada pela next_action gravada no banco.
  if (computed && label === 'Próxima ação') {
    return (
      <div className="central-sit-next-item">
        <small>{label}</small>
        <p>{computed.title}</p>
        <small>{computed.detail || computed.action}</small>
        {clientId ? (
          <Link className="central-sit-next-go" to={painelHref(clientId, { actionCode: computed.code })}>
            Painel
          </Link>
        ) : null}
        {item ? (
          <small>
            Interna: {item.title}
            {item.due_date ? ` · ${item.due_date}` : ''}
            {overdue ? ' · vencida' : ''}
          </small>
        ) : null}
      </div>
    );
  }
  if (!item && computed) {
    return (
      <div className="central-sit-next-item">
        <small>{label}</small>
        <p>{computed.title}</p>
        <small>{computed.detail || computed.action}</small>
        {clientId ? (
          <Link className="central-sit-next-go" to={painelHref(clientId, { actionCode: computed.code })}>
            Painel
          </Link>
        ) : null}
      </div>
    );
  }
  return (
    <div className={`central-sit-next-item${overdue ? ' is-overdue' : ''}`}>
      <small>{label}</small>
      {item ? (
        <>
          <p>{item.title}</p>
          <small>{item.due_date || 'sem prazo'}{overdue ? ' · vencida' : ''}</small>
        </>
      ) : (
        <p>Nenhuma</p>
      )}
    </div>
  );
}

export default function CentralTrafegoSituacao() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const { loading, metaSyncing, metaProgress, error, rows, pendingGestor, unreviewed, checkupSummary, team, reload } = useCentralTrafegoSituacao();
  const [savingId, setSavingId] = useState(null);
  const [settingsRow, setSettingsRow] = useState(null);
  const [routineRow, setRoutineRow] = useState(null);
  const isAdmin = profile?.role === 'superadmin' || profile?.role === 'admin';

  const saveOps = async (row, patch) => {
    setSavingId(row.client_id);
    try {
      const { error: err } = await upsertTrafficClientOps({
        clientId: row.client_id,
        primaryAssigneeId: patch.primary_assignee_id,
        situation: patch.situation,
        situationReason: patch.situation_reason,
        resumeAt: patch.resume_at,
      });
      if (err) throw err;
      toast({ title: 'Situação atualizada' });
      reload();
    } catch (e) {
      toast({ title: 'Não foi possível gravar', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[240px] gap-2 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p>Carregando situação dos clientes…</p>
      </div>
    );
  }

  return (
    <div className="central-trafego">
      <div className="central-trafego-toolbar">
        <p className="central-trafego-toolbar-copy">
          {rows.length} {rows.length === 1 ? 'conta' : 'contas'} com operação de tráfego
          {pendingGestor.length ? ` · ${pendingGestor.length} sem gestor oficial` : ''}
        </p>
        <div className="central-trafego-toolbar-actions">
          <Button size="sm" variant="secondary" onClick={() => reload({ force: true })} disabled={metaSyncing}>
            {metaSyncing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Atualizar
          </Button>
        </div>
      </div>

      {error ? <p className="central-trafego-error">{error}</p> : null}
      {metaSyncing ? (
        <p className="central-trafego-alert">
          Buscando a Meta
          {metaProgress?.total ? ` (${metaProgress.done}/${metaProgress.total})` : ''} — veiculação real, conta a conta.
        </p>
      ) : null}
      {checkupSummary ? (
        <div className="central-trafego-stats">
          <div className={`central-trafego-stat${checkupSummary.unreviewed ? ' is-warn' : ' is-ok'}`}>
            <span>Check-up hoje</span>
            <strong>
              {checkupSummary.reviewed}/{checkupSummary.total}
            </strong>
          </div>
          <div className="central-trafego-stat is-ok">
            <span>OK</span>
            <strong>{checkupSummary.ok || 0}</strong>
          </div>
          <div className={`central-trafego-stat${checkupSummary.attention ? ' is-danger' : ''}`}>
            <span>Atenção</span>
            <strong>{checkupSummary.attention || 0}</strong>
          </div>
          <div className={`central-trafego-stat${checkupSummary.waiting_client ? ' is-warn' : ''}`}>
            <span>Aguardando cliente</span>
            <strong>{checkupSummary.waiting_client || 0}</strong>
          </div>
          <div className={`central-trafego-stat${checkupSummary.unreviewed ? ' is-warn' : ''}`}>
            <span>Não revisados</span>
            <strong>{checkupSummary.unreviewed || 0}</strong>
          </div>
        </div>
      ) : null}
      {pendingGestor.length > 0 ? (
        <p className="central-trafego-alert">{pendingGestor.length} cliente(s) sem gestor oficial — defina o responsável antes de operar.</p>
      ) : null}
      {unreviewed.length > 0 ? (
        <p className="central-trafego-alert">
          {unreviewed.length} cliente(s) ainda sem check-up hoje: {unreviewed.slice(0, 6).map((r) => r.empresa).join(', ')}
          {unreviewed.length > 6 ? ` e mais ${unreviewed.length - 6}` : ''}.
        </p>
      ) : null}

      {rows.length === 0 && !error ? (
        <div className="central-trafego-empty">
          <h3>Nenhuma conta operacional ainda</h3>
          <p>Entram aqui clientes com conta Meta, campanha, demanda de tráfego ou ficha operacional.</p>
        </div>
      ) : (
        <div className="central-trafego-grid">
          {rows.map((row) => {
            const locked = savingId === row.client_id || (!isAdmin && !row.gestor_id);
            const orphans = row.campaigns_without_demand || [];
            const computedAction = nextActionForAccount({
              snapshot: row.snapshot,
              brief: row.meta?.kind === 'unavailable'
                ? { alert: row.meta.detail }
                : row.snapshot?.deliveryAlert
                  ? {
                      alert: row.snapshot.deliveryAlert,
                      issueLabels: row.snapshot.issueLabels || [],
                    }
                  : null,
            });
            return (
              <article key={row.client_id} className={`central-sit-card${row.pendingGestor ? ' is-pending' : ''}`}>
                <header className="central-sit-head">
                  <div>
                    <h3>{row.empresa}</h3>
                  </div>
                  <div className="central-sit-badges">
                    <span className={`central-sit-pill central-sit-pill--${situationTone(row.situation)}`}>
                      {situationLabel(row.situation)}
                    </span>
                    {row.pendingGestor ? <span className="central-sit-pill central-sit-pill--warn">Gestor não definido</span> : null}
                    {row.next_action_overdue && !computedAction ? (
                      <span className="central-sit-pill central-sit-pill--danger">Ação vencida</span>
                    ) : null}
                    {computedAction ? (
                      <Link
                        className={`central-sit-pill ${computedAction.tone === 'issue' ? 'central-sit-pill--danger' : 'central-sit-pill--warn'}`}
                        to={painelHref(row.client_id, { actionCode: computedAction.code })}
                      >
                        {computedAction.title}
                      </Link>
                    ) : null}
                    {row.checkup_due && row.checkup_result ? (
                      <span className={`central-sit-pill central-sit-pill--${row.checkup_result === 'ok' ? 'active' : row.checkup_result === 'needs_attention' ? 'danger' : 'warn'}`}>
                        {checkupOutcomeLabel(row.checkup_result)}
                      </span>
                    ) : null}
                    {row.checkup_unreviewed ? <span className="central-sit-pill central-sit-pill--warn">Check-up pendente</span> : null}
                    {row.routine?.report_enabled !== false ? (
                      <span className="central-sit-pill central-sit-pill--muted">Rel. 1º/15</span>
                    ) : null}
                    {row.routine?.group_weekly_enabled !== false ? (
                      <span className="central-sit-pill central-sit-pill--muted">Grupo seg</span>
                    ) : null}
                    {row.routine?.crm_weekly_enabled ? (
                      <span className="central-sit-pill central-sit-pill--muted">CRM seg</span>
                    ) : null}
                    {isAdmin ? (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setRoutineRow(row)} aria-label="Configurar rotina">
                          <CalendarDays className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setSettingsRow(row)} aria-label="Configurar check-up">
                          <Settings2 className="h-4 w-4" />
                        </Button>
                      </>
                    ) : null}
                  </div>
                </header>

                <div className="central-sit-fields">
                  <div className="central-sit-field">
                    <label>Gestor oficial</label>
                    {isAdmin ? (
                      <select
                        className="central-sit-select"
                        value={row.gestor_id || ''}
                        disabled={savingId === row.client_id}
                        onChange={(e) =>
                          saveOps(row, {
                            primary_assignee_id: e.target.value || null,
                            situation: row.situation || 'onboarding',
                            situation_reason: row.situation_reason || null,
                            resume_at: row.resume_at || null,
                          })
                        }
                      >
                        <option value="">Sem gestor</option>
                        {team.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.full_name || p.id}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-sm font-medium">{row.gestor_name || '—'}</p>
                    )}
                  </div>
                  <div className="central-sit-field">
                    <label>Situação</label>
                    {isAdmin ? (
                      <select
                        className="central-sit-select"
                        value={row.situation || ''}
                        disabled={locked}
                        onChange={(e) =>
                          saveOps(row, {
                            primary_assignee_id: row.gestor_id || null,
                            situation: e.target.value,
                            situation_reason: row.situation_reason || null,
                            resume_at: row.resume_at || null,
                          })
                        }
                      >
                        <option value="">Definir…</option>
                        {TRAFFIC_SITUATIONS.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-sm font-medium">{situationLabel(row.situation) || '—'}</p>
                    )}
                  </div>
                  <div className="central-sit-field">
                    <label>Motivo</label>
                    {isAdmin ? (
                      <input
                        className="central-sit-input"
                        placeholder="Por que está assim"
                        defaultValue={row.situation_reason || ''}
                        disabled={locked}
                        onBlur={(e) => {
                          if ((e.target.value || '') === (row.situation_reason || '')) return;
                          saveOps(row, {
                            primary_assignee_id: row.gestor_id || null,
                            situation: row.situation || 'active',
                            situation_reason: e.target.value,
                            resume_at: row.resume_at || null,
                          });
                        }}
                      />
                    ) : (
                      <p className="text-sm font-medium">{row.situation_reason || '—'}</p>
                    )}
                  </div>
                  <div className="central-sit-field">
                    <label>Retomada</label>
                    {isAdmin ? (
                      <input
                        className="central-sit-input"
                        type="date"
                        defaultValue={row.resume_at || ''}
                        disabled={locked}
                        onBlur={(e) => {
                          if ((e.target.value || '') === (row.resume_at || '')) return;
                          saveOps(row, {
                            primary_assignee_id: row.gestor_id || null,
                            situation: row.situation || 'active',
                            situation_reason: row.situation_reason || null,
                            resume_at: e.target.value || null,
                          });
                        }}
                      />
                    ) : (
                      <p className="text-sm font-medium">{row.resume_at || '—'}</p>
                    )}
                  </div>
                </div>

                <div className="central-sit-checkup">
                  <small>Check-up de hoje</small>
                  {row.checkup_due ? (
                    row.checkup_result ? (
                      <>
                        <p>{checkupOutcomeLabel(row.checkup_result)}</p>
                        <small>
                          {formatCheckupTime(row.checkup_confirmed_at)}
                          {row.checkup_actor_name ? ` · ${row.checkup_actor_name}` : ''}
                        </small>
                        {row.checkup_problem ? <p className="central-sit-checkup-issue">{row.checkup_problem}</p> : null}
                        {row.checkup_task_title ? <small>Tarefa: {row.checkup_task_title}</small> : null}
                      </>
                    ) : (
                      <p>Ainda não revisado</p>
                    )
                  ) : (
                    <p>Fora da escala de hoje</p>
                  )}
                </div>

                <div className="central-sit-next">
                  <NextBlock
                    label="Próxima ação"
                    item={row.next_action}
                    overdue={row.next_action_overdue}
                    computed={computedAction}
                    clientId={row.client_id}
                  />
                  <NextBlock label="Próxima revisão" item={row.next_review} />
                </div>

                <div className="central-sit-metrics">
                  <span className="central-sit-metric">{row.snapshot?.activeCount || 0} no ar</span>
                  <span className="central-sit-metric">{row.open_tasks || 0} demandas abertas</span>
                  <span className="central-sit-metric">{row.overdue_tasks || 0} atrasadas</span>
                  <span className="central-sit-metric">{row.client_pending || 0} pend. cliente</span>
                </div>

                <div className="central-sit-foot">
                  <MetaBlock
                    meta={row.meta}
                    snapshot={row.snapshot}
                    bloqueioLabel={
                      row.situation === 'temporarily_paused' || row.situation === 'waiting_client'
                        ? row.situation_reason || situationLabel(row.situation)
                        : row.situation_reason || null
                    }
                  />
                  <small>Atualização operacional · {formatOperationalUpdatedAt(row.updated_at)}</small>
                </div>

                {isAdmin && row.situation !== 'no_campaign_expected' && orphans.length ? (
                  <ul className="central-sit-orphans">
                    {orphans.slice(0, 4).map((c) => (
                      <li key={c.id}>{c.name || 'Solicitação'} · sem demanda</li>
                    ))}
                    {orphans.length > 4 ? <li>+{orphans.length - 4}</li> : null}
                  </ul>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
      <CentralTrafegoCheckupSettingsDialog
        open={Boolean(settingsRow)}
        onOpenChange={(v) => !v && setSettingsRow(null)}
        client={
          settingsRow
            ? {
                client_id: settingsRow.client_id,
                empresa: settingsRow.empresa,
                gestor_id: settingsRow.gestor_id,
                situation: settingsRow.situation,
                require_active_campaign: settingsRow.situation !== 'no_campaign_expected',
              }
            : null
        }
        team={team}
        onSaved={reload}
      />
      <CentralTrafegoRoutineSettingsDialog
        open={Boolean(routineRow)}
        onOpenChange={(v) => !v && setRoutineRow(null)}
        client={routineRow}
        onSaved={reload}
      />
    </div>
  );
}
