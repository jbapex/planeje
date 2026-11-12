import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronRight, Loader2, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { formatMoney } from '@/lib/trafegoFila';
import { formatOperationalUpdatedAt } from '@/lib/centralTrafego';
import { paidTrafficPaths } from '@/lib/paidTrafficRoutes';
import {
  CHECKUP_OUTCOMES,
  briefingLook,
  checkupOutcomeLabel,
  formatCheckupTime,
  unreviewedCheckupRows,
  validateCheckupConfirm,
} from '@/lib/centralTrafegoCheckup';
import { confirmTrafficCheckup } from '@/lib/centralTrafegoApi';
import CentralTrafegoCheckupSettingsDialog from '@/components/traffic/CentralTrafegoCheckupSettingsDialog';

function moneyOrUnavailable(metric) {
  if (!metric?.available) return 'Dados indisponíveis';
  return formatMoney(metric.value);
}

function Metric({ label, children, alert }) {
  return (
    <div className={`central-checkup-metric${alert ? ' is-alert' : ''}`}>
      <span>{label}</span>
      <strong>{children}</strong>
    </div>
  );
}

function CheckupCard({ row, team, actorId, canAssignOthers, onConfirmed, onConfigure }) {
  const { toast } = useToast();
  const [result, setResult] = useState(row.run?.result || '');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState('');
  const [assigneeId, setAssigneeId] = useState(row.gestor_id || actorId || '');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const confirmed = Boolean(row.run?.result);
  const indicators = row.indicators || {};
  const show = (key) => indicators[key] !== false;
  const problems = row.problems || [];
  const attention = result === 'needs_attention';

  const save = async () => {
    const parsed = validateCheckupConfirm({
      clientId: row.client_id,
      result,
      note,
      attentionProblem: problem,
      attentionAssigneeId: assigneeId,
      attentionDueDate: dueDate,
    });
    if (!parsed.ok) {
      toast({ title: parsed.errors[0], variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await confirmTrafficCheckup({
        clientId: row.client_id,
        result,
        note,
        attentionProblem: attention ? problem : null,
        attentionAssigneeId: attention ? assigneeId : null,
        attentionDueDate: attention ? dueDate : null,
      });
      if (error) throw error;
      toast({
        title: data?.created === false ? 'Check-up já registrado hoje' : 'Check-up confirmado',
        description: data?.run?.task_id ? 'Tarefa de atenção criada na Central.' : undefined,
      });
      onConfirmed?.();
    } catch (e) {
      toast({ title: 'Não foi possível confirmar', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className={`central-checkup-card${problems.length && !confirmed ? ' is-exception' : ''}${confirmed ? ' is-done' : ''}`}>
      <header className="central-checkup-card-head">
        <div>
          <p className="central-trafego-kicker">
            {row.gestor_name || 'Sem gestor'}
            {row.late ? ' · atrasado' : ''}
          </p>
          <h3>{row.empresa}</h3>
        </div>
        <div className="central-sit-badges">
          {confirmed ? (
            <span className={`central-sit-pill central-sit-pill--${row.run.result === 'ok' ? 'active' : row.run.result === 'needs_attention' ? 'danger' : 'warn'}`}>
              {checkupOutcomeLabel(row.run.result)}
            </span>
          ) : problems.length ? (
            <span className="central-sit-pill central-sit-pill--danger">{problems.length} problema{problems.length === 1 ? '' : 's'}</span>
          ) : (
            <span className="central-sit-pill central-sit-pill--muted">A revisar</span>
          )}
          <Button size="sm" variant="ghost" onClick={() => onConfigure(row)} aria-label="Configurar check-up">
            <Settings2 className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="central-checkup-metrics">
        {show('gestor') ? <Metric label="Gestor">{row.gestor_name || 'Dados indisponíveis'}</Metric> : null}
        {show('last_update') ? (
          <Metric label="Última atualização">{formatOperationalUpdatedAt(row.updated_at)}</Metric>
        ) : null}
        {show('active_campaigns') ? (
          <Metric label="Campanhas ativas" alert={problems.some((p) => p.code === 'missing_active_campaign')}>
            {row.require_active_campaign === false && Number(row.active_campaigns || 0) === 0
              ? 'Não esperada'
              : row.active_campaigns ?? 'Dados indisponíveis'}
          </Metric>
        ) : null}
        {show('spend_day') ? <Metric label="Investimento do dia">{moneyOrUnavailable(row.spend_day)}</Metric> : null}
        {show('spend_month') ? <Metric label="Investimento do mês">{moneyOrUnavailable(row.spend_month)}</Metric> : null}
        {show('budget') ? (
          <Metric label="Orçamento / saldo">
            {row.budget?.available
              ? `${formatMoney(row.budget.value)}${row.budget.remaining != null ? ` · saldo ${formatMoney(row.budget.remaining)}` : ''}`
              : 'Dados indisponíveis'}
          </Metric>
        ) : null}
        {show('pace') ? <Metric label="Ritmo da verba">{row.pace?.label || 'Dados indisponíveis'}</Metric> : null}
        {show('next_action') ? (
          <Metric label="Próxima ação" alert={row.next_action_overdue}>
            {row.next_action?.title
              ? `${row.next_action.title}${row.next_action.due_date ? ` · ${row.next_action.due_date}` : ''}`
              : 'Nenhuma'}
          </Metric>
        ) : null}
      </div>

      {show('problems') && problems.length ? (
        <ul className="central-checkup-problems">
          {problems.map((p) => (
            <li key={p.code}>{p.label}</li>
          ))}
        </ul>
      ) : null}

      {confirmed ? (
        <p className="central-checkup-confirmed">
          Confirmado às {formatCheckupTime(row.run.confirmed_at)} por {row.run.actor_name || 'gestor'}
          {row.run.attention_problem ? ` · ${row.run.attention_problem}` : ''}
          {row.run.task_title ? ` · tarefa ${row.run.task_title}` : ''}
        </p>
      ) : (
        <div className="central-checkup-form">
          <label>
            Resultado
            <select className="central-sit-select" value={result} onChange={(e) => setResult(e.target.value)}>
              <option value="">Escolher…</option>
              {CHECKUP_OUTCOMES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Observação
            <textarea
              className="central-checkup-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Opcional, salvo com a confirmação"
            />
          </label>
          {attention ? (
            <>
              <label>
                Problema
                <textarea
                  className="central-checkup-note"
                  rows={2}
                  value={problem}
                  onChange={(e) => setProblem(e.target.value)}
                  placeholder="O que precisa de atenção"
                />
              </label>
              <label>
                Responsável
                <select
                  className="central-sit-select"
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                >
                  <option value="">Escolher…</option>
                  {(canAssignOthers ? team : team.filter((p) => p.id === actorId)).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name || p.id}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Prazo
                <input
                  className="central-sit-input"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </label>
            </>
          ) : null}
          <Button size="sm" onClick={save} disabled={saving || !result}>
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
            Confirmar
          </Button>
        </div>
      )}
    </article>
  );
}

function BriefingCard({ row, brief, metaLoading, weekLoading, team, actorId, canAssignOthers, canConfigure, onConfirmed, onConfigure }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState('');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState('');
  const [assigneeId, setAssigneeId] = useState(row.gestor_id || actorId || '');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const look = briefingLook(row, brief, { metaLoading, weekLoading });
  const canQuickOk = look.ready && look.tone !== 'alert';
  const attention = result === 'needs_attention';

  const save = async (chosen) => {
    const next = chosen || result;
    const parsed = validateCheckupConfirm({
      clientId: row.client_id,
      result: next,
      note,
      attentionProblem: problem,
      attentionAssigneeId: assigneeId,
      attentionDueDate: dueDate,
    });
    if (!parsed.ok) {
      toast({ title: parsed.errors[0], variant: 'destructive' });
      setOpen(true);
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await confirmTrafficCheckup({
        clientId: row.client_id,
        result: next,
        note,
        attentionProblem: next === 'needs_attention' ? problem : null,
        attentionAssigneeId: next === 'needs_attention' ? assigneeId : null,
        attentionDueDate: next === 'needs_attention' ? dueDate : null,
      });
      if (error) throw error;
      toast({
        title: data?.created === false ? 'Check-up já registrado hoje' : 'Visto do dia registrado',
        description: data?.run?.task_id ? 'Tarefa de atenção criada na Central.' : undefined,
      });
      onConfirmed?.();
    } catch (e) {
      toast({ title: 'Não foi possível confirmar', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className={`checkup-brief-card${look.tone === 'alert' ? ' is-alert' : ''}${open ? ' is-open' : ''}`}>
      <header className="checkup-brief-head">
        <button type="button" className="checkup-brief-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <ChevronRight className={`hoje-meta-chevron${open ? ' is-open' : ''}`} />
          <span className="hoje-meta-toggle-copy">
            <span className="hoje-meta-name">{row.empresa}</span>
            <span>{look.reasons.join(' · ')}</span>
          </span>
        </button>
        <div className="hoje-meta-head-side">
          {look.tone === 'alert' ? <span className="checkup-brief-flag">Alerta</span> : null}
          {look.tone === 'wait' ? <span className="checkup-brief-flag">Lendo</span> : null}
          {canQuickOk ? (
            <Button
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={(e) => {
                e.stopPropagation();
                save('ok');
              }}
            >
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
              Está OK
            </Button>
          ) : null}
        </div>
      </header>
      {open ? (
        <div className="checkup-brief-body">
          <div className="checkup-brief-actions">
            <Link className="hoje-meta-painel" to={`${paidTrafficPaths.fila()}?client_id=${row.client_id}`}>
              Abrir Painel
            </Link>
            {canConfigure ? (
              <Button size="sm" variant="ghost" onClick={() => onConfigure(row)} aria-label="Configurar check-up">
                <Settings2 className="h-4 w-4 mr-1" />
                Configurar
              </Button>
            ) : null}
          </div>
          <div className="central-checkup-form">
            <label>
              Outro resultado
              <select className="central-sit-select" value={result} onChange={(e) => setResult(e.target.value)}>
                <option value="">Escolher…</option>
                {CHECKUP_OUTCOMES.filter((o) => o.value !== 'ok').map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Observação
              <textarea
                className="central-checkup-note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Opcional"
              />
            </label>
            {attention ? (
              <>
                <label>
                  Problema
                  <textarea
                    className="central-checkup-note"
                    rows={2}
                    value={problem}
                    onChange={(e) => setProblem(e.target.value)}
                    placeholder="O que precisa de atenção"
                  />
                </label>
                <label>
                  Responsável
                  <select className="central-sit-select" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                    <option value="">Escolher…</option>
                    {(canAssignOthers ? team : team.filter((p) => p.id === actorId)).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name || p.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Prazo
                  <input className="central-sit-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </label>
              </>
            ) : null}
            <Button size="sm" onClick={() => save()} disabled={saving || !result}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
              Confirmar
            </Button>
          </div>
        </div>
      ) : (
        <button type="button" className="hoje-meta-expand" onClick={() => setOpen(true)}>
          {look.tone === 'alert' ? 'Registrar resultado' : look.ready ? 'Outro resultado' : 'Aguarde a Meta'}
        </button>
      )}
    </article>
  );
}

function Group({ title, rows, emptyHidden = true, children }) {
  if (emptyHidden && (!rows || rows.length === 0)) return null;
  return (
    <section className="central-trafego-bucket">
      <div className="central-trafego-bucket-head">
        <h3>
          {title} <span>{rows.length}</span>
        </h3>
      </div>
      <div className="central-checkup-list">{children}</div>
    </section>
  );
}

export default function CentralTrafegoCheckup({
  loading,
  error,
  summary,
  groups,
  team,
  reload,
  onReloadRelated,
  mode = 'full',
  metaBriefs = [],
  metaLoading = false,
  weekLoading = false,
}) {
  const { user, profile } = useAuth();
  const [settingsRow, setSettingsRow] = useState(null);
  const isAdmin = profile?.role === 'superadmin' || profile?.role === 'admin';
  const refresh = () => {
    reload?.();
    onReloadRelated?.();
  };

  const briefing = mode === 'briefing';
  const compactOk = useMemo(
    () => (groups.ok || []).map((row) => row.empresa).filter(Boolean),
    [groups.ok]
  );
  const briefingRows = useMemo(() => {
    if (!briefing) return [];
    const briefs = Object.fromEntries((metaBriefs || []).map((brief) => [brief.client?.id, brief]));
    return unreviewedCheckupRows(groups)
      .map((row) => {
        const brief = briefs[row.client_id];
        return { row, brief, look: briefingLook(row, brief, { metaLoading, weekLoading }) };
      })
      .sort((a, b) => {
        if (a.look.tone !== b.look.tone) return a.look.tone === 'alert' ? -1 : 1;
        return String(a.row.empresa || '').localeCompare(String(b.row.empresa || ''), 'pt-BR');
      });
  }, [briefing, groups, metaBriefs, metaLoading, weekLoading]);
  const briefingAlerts = briefingRows.filter((item) => item.look.tone === 'alert');

  if (loading) {
    return (
      <section className={`central-checkup${briefing ? ' is-briefing' : ''}`}>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando check-up do dia…
        </div>
      </section>
    );
  }

  if (briefing) {
    return (
      <section className="central-checkup is-briefing">
        <div className="hoje-block-head">
          <div>
            <p className="central-trafego-kicker">Visto do dia</p>
            <h2>
              {summary.unreviewed
                ? `${summary.unreviewed} conta${summary.unreviewed === 1 ? '' : 's'} sem visto`
                : summary.total
                  ? 'Check-up em dia'
                  : 'Fora da escala de hoje'}
            </h2>
            <p>
              {briefingAlerts.length
                ? `${briefingAlerts.length} com alerta na Meta — registre o resultado, sem Está OK de um clique.`
                : metaLoading || weekLoading
                  ? 'Esperando a Meta de cada conta antes de liberar o visto.'
                  : 'Confirme Está OK só depois de ver a conta, ou abra outro resultado.'}
            </p>
          </div>
        </div>
        {error ? <p className="central-trafego-error">{error}</p> : null}
        {!summary.unreviewed ? (
          <div className="central-trafego-empty">
            <h3>{summary.total ? 'Nenhuma conta pendente' : 'Fora da escala de hoje'}</h3>
            <p>
              {summary.total
                ? 'As contas da escala de hoje já têm visto.'
                : 'Nenhuma conta está na escala de hoje — não é que já tenham sido vistas.'}
            </p>
          </div>
        ) : (
          <div className="hoje-meta-list">
            {briefingRows.map(({ row, brief }) => (
              <BriefingCard
                key={row.client_id}
                row={row}
                brief={brief}
                metaLoading={metaLoading}
                weekLoading={weekLoading}
                team={team}
                actorId={user?.id}
                canAssignOthers={isAdmin}
                canConfigure={isAdmin}
                onConfirmed={refresh}
                onConfigure={setSettingsRow}
              />
            ))}
          </div>
        )}
        <CentralTrafegoCheckupSettingsDialog
          open={Boolean(settingsRow)}
          onOpenChange={(v) => !v && setSettingsRow(null)}
          client={settingsRow}
          team={team}
          onSaved={refresh}
        />
      </section>
    );
  }

  return (
    <section className="central-checkup">
      <div className="central-checkup-head">
        <div>
          <p className="central-trafego-kicker">Rotina do gestor</p>
          <h2>Check-up diário</h2>
          <p>
            {`${summary.reviewed}/${summary.total} revisados${summary.unreviewed ? ` · ${summary.unreviewed} ainda não` : ''}`}
          </p>
        </div>
      </div>

      <div className="central-trafego-stats">
        <div className={`central-trafego-stat${summary.unreviewed ? ' is-warn' : ' is-ok'}`}>
          <span>Revisados</span>
          <strong>
            {summary.reviewed}/{summary.total}
          </strong>
        </div>
        <div className="central-trafego-stat is-ok">
          <span>OK</span>
          <strong>{summary.ok}</strong>
        </div>
        <div className={`central-trafego-stat${summary.attention ? ' is-danger' : ''}`}>
          <span>Atenção</span>
          <strong>{summary.attention}</strong>
        </div>
        <div className={`central-trafego-stat${summary.waiting_client ? ' is-warn' : ''}`}>
          <span>Aguardando cliente</span>
          <strong>{summary.waiting_client}</strong>
        </div>
        <div className={`central-trafego-stat${summary.unreviewed ? ' is-warn' : ''}`}>
          <span>Não revisados</span>
          <strong>{summary.unreviewed}</strong>
        </div>
      </div>

      {error ? <p className="central-trafego-error">{error}</p> : null}

      <Group title="Com problema detectado" rows={groups.withProblems}>
        {groups.withProblems.map((row) => (
          <CheckupCard
            key={row.client_id}
            row={row}
            team={team}
            actorId={user?.id}
            canAssignOthers={isAdmin}
            onConfirmed={refresh}
            onConfigure={setSettingsRow}
          />
        ))}
      </Group>
      <Group title="A revisar" rows={groups.pending}>
        {groups.pending.map((row) => (
          <CheckupCard
            key={row.client_id}
            row={row}
            team={team}
            actorId={user?.id}
            canAssignOthers={isAdmin}
            onConfirmed={refresh}
            onConfigure={setSettingsRow}
          />
        ))}
      </Group>
      <Group title="Precisa de atenção" rows={groups.attention}>
        {groups.attention.map((row) => (
          <CheckupCard
            key={row.client_id}
            row={row}
            team={team}
            actorId={user?.id}
            canAssignOthers={isAdmin}
            onConfirmed={refresh}
            onConfigure={setSettingsRow}
          />
        ))}
      </Group>
      <Group title="Aguardando cliente" rows={groups.waiting}>
        {groups.waiting.map((row) => (
          <CheckupCard
            key={row.client_id}
            row={row}
            team={team}
            actorId={user?.id}
            canAssignOthers={isAdmin}
            onConfirmed={refresh}
            onConfigure={setSettingsRow}
          />
        ))}
      </Group>
      <Group title="Pausa planejada" rows={groups.paused}>
        {groups.paused.map((row) => (
          <CheckupCard
            key={row.client_id}
            row={row}
            team={team}
            actorId={user?.id}
            canAssignOthers={isAdmin}
            onConfirmed={refresh}
            onConfigure={setSettingsRow}
          />
        ))}
      </Group>
      <Group title="Dados indisponíveis" rows={groups.unavailable}>
        {groups.unavailable.map((row) => (
          <CheckupCard
            key={row.client_id}
            row={row}
            team={team}
            actorId={user?.id}
            canAssignOthers={isAdmin}
            onConfirmed={refresh}
            onConfigure={setSettingsRow}
          />
        ))}
      </Group>
      {compactOk.length ? (
        <section className="central-trafego-bucket">
          <div className="central-trafego-bucket-head">
            <h3>
              Está OK <span>{compactOk.length}</span>
            </h3>
          </div>
          <p className="central-checkup-ok-summary">{compactOk.join(' · ')}</p>
        </section>
      ) : null}

      {summary.total > 0 || error ? null : (
        <div className="central-trafego-empty">
          <h3>Nenhum cliente no check-up de hoje</h3>
          <p>Fora da escala de hoje, inativos ou sem operação de tráfego não entram nesta lista.</p>
        </div>
      )}

      <CentralTrafegoCheckupSettingsDialog
        open={Boolean(settingsRow)}
        onOpenChange={(v) => !v && setSettingsRow(null)}
        client={settingsRow}
        team={team}
        onSaved={refresh}
      />
    </section>
  );
}
