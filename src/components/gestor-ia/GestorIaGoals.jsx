import React, { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Plus } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { formatMonthLabel, shiftMonth } from '@/lib/collaboratorIndicators';
import { clearDataCacheByPrefix } from '@/hooks/useDataCache';
import GestorIaDrawer from './GestorIaDrawer';
import GestorIaMediaGoals from './GestorIaMediaGoals';
import { number, objectiveLabel, periodLabel } from './GestorIaContext';
import { CHART_METRICS, comparisonDelta, defaultMetricsPeriod, formatMetric, metricValue, objectiveMetricKeys } from './gestorIaMetricModel';
import { useGestorRead } from './gestorIaReads';
import { editableTrafficGoalFields, loadGestorMonthlyGoals, saveGestorMonthlyGoals, saveGestorTrafficGoals, TRAFFIC_GOAL_LABELS, TRAFFIC_GOAL_OBJECTIVES, validGoalMonth, VOLUME_GOAL_LABELS } from './gestorIaGoalData';

function GoalEditor({ title, label, fields, values, monthly, save, close }) {
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  const form = useRef(null);
  const labels = monthly ? VOLUME_GOAL_LABELS : TRAFFIC_GOAL_LABELS;
  const originalObjective = values.objetivo_meta;
  const hasChanges = fields.some((key) => Object.hasOwn(draft, key) && draft[key] !== String(values[key] ?? ''));

  function dismiss() {
    const dialog = form.current?.closest('dialog');
    if (dialog?.open) dialog.close();
    else close();
  }

  async function submit(event) {
    event.preventDefault();
    if (!hasChanges || locked.current) return;
    locked.current = true;
    setSaving(true);
    setError('');
    try {
      await save(draft);
      dismiss();
    } catch (failure) {
      setError(failure.message || 'Não foi possível salvar as metas.');
    } finally {
      locked.current = false;
      setSaving(false);
    }
  }

  return <GestorIaDrawer title={title} label={label} close={close} busy={saving} closeLabel="Fechar meta">
    <form className="gia-goal-form" ref={form} onSubmit={submit}>
      <fieldset className="gia-goal-fields" disabled={saving}>
        {fields.map((key) => {
          const value = draft[key] ?? String(values[key] ?? '');
          const change = (event) => {
            const next = event.target.value;
            setDraft((current) => ({ ...current, [key]: next }));
          };
          return <label key={key}>{labels[key]}
            {key === 'objetivo_meta' ? <select value={value} onChange={change}>
              <option value="">Não definido</option>
              {originalObjective && !Object.hasOwn(TRAFFIC_GOAL_OBJECTIVES, originalObjective) && <option value={originalObjective}>{objectiveLabel(originalObjective) || originalObjective}</option>}
              {Object.entries(TRAFFIC_GOAL_OBJECTIVES).map(([id, text]) => <option key={id} value={id}>{text}</option>)}
            </select> : <input type="number" inputMode={monthly ? 'numeric' : 'decimal'} min="0" step={monthly ? '1' : 'any'} value={value} onChange={change} />}
          </label>;
        })}
      </fieldset>
      {error && <p className="gia-notice" role="alert">{error}</p>}
      <div className="gia-goal-actions">
        <button className="gia-action-link" type="button" onClick={dismiss} disabled={saving}>Cancelar</button>
        <button className="gia-action-link gia-primary-action" type="submit" disabled={saving || !hasChanges}>{saving ? 'Salvando…' : 'Salvar meta'}</button>
      </div>
    </form>
  </GestorIaDrawer>;
}

export default function GestorIaGoals({ client, goals, target, limit, snapshot, objectiveVisible, canManageClients, canEditMonthlyGoals, query, readStore, reloadPortfolio,
  canReadMeta, period, reading, accountId, accountFilter, accountSelect, selectMonth, accountsTo, atlasScope, beforeSave }) {
  const { canViewField } = useAuth();
  const [editor, setEditor] = useState(null);
  const [notice, setNotice] = useState('');
  const month = period.since;
  const scope = { ...query, client, month };
  const monthRead = useGestorRead(readStore, `metas:${client.id}:${month}`, canEditMonthlyGoals, () => loadGestorMonthlyGoals(supabase, scope));
  const trafficFields = canManageClients ? editableTrafficGoalFields(client, canViewField) : [];
  const objective = objectiveVisible ? client.objetivo_meta : '';
  const { resultKey, costKey } = objectiveMetricKeys(objective);
  const reference = target || goals[0];
  const cost = target && snapshot?.currency === 'BRL' ? metricValue(snapshot, costKey) : null;
  const hasResultMetric = ['mensagens', 'leads', 'compras'].includes(objective);
  const result = hasResultMetric ? metricValue(snapshot, resultKey) : null;
  const spend = metricValue(snapshot, 'spend');
  const currency = snapshot?.currency;
  const delta = target ? comparisonDelta(cost, target.amount) : null;
  const usage = limit > 0 && spend !== null && currency === 'BRL' ? spend / limit * 100 : null;
  const progress = (value, tone) => <div className={`gia-goal-rail ${tone}`} aria-hidden="true"><i style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>;

  const hasGoals = goals.length > 0 || limit > 0;
  const canUseMediaGoals = canManageClients && canReadMeta && canViewField?.('valor') === true;
  const hasMediaAccount = canUseMediaGoals && client.metaAccounts?.length > 0;
  const showAccountSelect = hasMediaAccount && (client.metaAccounts.length > 1 || (accountFilter && client.metaAccounts[0].meta_account_id !== accountFilter));
  const trafficTitle = hasMediaAccount ? 'Editar cadastro' : hasGoals ? 'Editar meta' : 'Nova meta';
  const monthLabel = formatMonthLabel(month);
  const monthKey = month.slice(0, 7);
  const currentMonth = defaultMetricsPeriod().since.slice(0, 7);
  const chooseMonth = (value) => {
    if (validGoalMonth(`${value}-01`) && value <= currentMonth) { selectMonth(value); setNotice(''); }
  };
  const monthControl = <div className="gia-media-month" role="group" aria-label="Navegar entre meses das metas">
    <button className="gia-icon-button" type="button" aria-label="Mês anterior" onClick={() => chooseMonth(shiftMonth(month, -1).slice(0, 7))}><ChevronLeft aria-hidden="true" /></button>
    <input type="month" aria-label="Mês de referência" value={monthKey} max={currentMonth} onChange={(event) => chooseMonth(event.target.value)} />
    <button className="gia-icon-button" type="button" aria-label="Próximo mês" disabled={monthKey === currentMonth}
      onClick={() => chooseMonth(shiftMonth(month, 1).slice(0, 7))}><ChevronRight aria-hidden="true" /></button>
  </div>;
  const open = (kind) => { setNotice(''); setEditor(kind); };
  const close = () => setEditor(null);

  return <div className="gia-stack">
    {canUseMediaGoals && <GestorIaMediaGoals key={`${accountFilter}:${month}`} client={client} query={query} accountId={accountId} accountFilter={accountFilter} period={period} reading={reading} readStore={readStore}
      accountSelect={showAccountSelect ? accountSelect : null} monthControl={monthControl} accountsTo={accountsTo} reloadPortfolio={reloadPortfolio} atlasScope={atlasScope} beforeSave={beforeSave} />}
    <details className="gia-media-legacy" open={!hasMediaAccount}>
    <summary>{canEditMonthlyGoals ? 'Cadastro e Indicadores' : 'Metas do cadastro'}</summary>
    <div className="gia-stack">
    <div className="gia-section-heading gia-goal-heading">
      <h2>Meta de tráfego</h2>
      <div className="gia-header-actions">
        {trafficFields.length > 0 && <button className="gia-action-link gia-primary-action" type="button" aria-haspopup="dialog" onClick={() => open('traffic')}>
          {hasGoals ? <Pencil aria-hidden="true" /> : <Plus aria-hidden="true" />}{trafficTitle}
        </button>}
      </div>
    </div>
    {notice && <p className="gia-notice" role="status">{notice}</p>}
    {!hasGoals ? <section className="gia-panel gia-empty"><p>Nenhuma meta de tráfego cadastrada.</p></section> : <section className="gia-panel gia-goal-card">
      <header className="gia-inline-icon"><strong>{objectiveLabel(objective) || 'Meta Ads'}</strong><span className="gia-badge">Cadastro do cliente</span></header>
      <dl className="gia-goal-grid">
        <div>
          <dt>{reference?.label || 'Custo por resultado'}</dt>
          <dd><strong>{cost !== null ? formatMetric(cost, { unit: 'money' }, currency) : reference?.value || '—'}</strong>{cost !== null && <small>alvo {target.value}</small>}</dd>
          {delta !== null ? <>{progress(100 + delta, delta > 0 ? 'is-warning' : '')}<small>{Math.abs(delta) < 1 ? 'No alvo' : `${number(Math.abs(delta))}% ${delta > 0 ? 'acima' : 'abaixo'} do alvo`}</small></> : <small>{reference ? 'Meta cadastrada' : 'Sem meta de custo'}</small>}
        </div>
        <div>
          <dt>{hasResultMetric ? CHART_METRICS.find((metric) => metric.key === resultKey).label : 'Resultados'}</dt>
          <dd><strong>{number(result)}</strong></dd>
          <small>{snapshot?.period ? 'Resultado no resumo salvo' : 'Sem resumo disponível'}</small>
        </div>
        <div>
          <dt>Limite Meta cadastrado</dt>
          <dd><strong>{usage === null ? formatMetric(limit, { unit: 'money' }, 'BRL') : formatMetric(spend, { unit: 'money' }, currency)}</strong>{usage !== null && <small>de {formatMetric(limit, { unit: 'money' }, 'BRL')}</small>}</dd>
          {usage !== null && <>{progress(usage, usage > 100 ? 'is-warning' : '')}<small>{number(usage)}% do limite no recorte salvo</small></>}
        </div>
      </dl>
      <footer className="gia-goal-foot">{snapshot?.period ? `Resumo salvo · ${periodLabel(snapshot.period)}` : 'Metas de referência do Planeje'}</footer>
    </section>}
    {goals.some((goal) => goal !== reference) && <section className="gia-panel">
      <h3>Outras metas cadastradas</h3>
      <dl className="gia-context-grid">{goals.filter((goal) => goal !== reference).map((goal) => <div key={goal.field}><dt>{goal.label}</dt><dd>{goal.value}</dd></div>)}</dl>
    </section>}
    {canEditMonthlyGoals && <section className="gia-panel gia-goal-card" aria-label="Metas do mês">
      <header className="gia-section-heading gia-month-goals">
        <div className="gia-inline-icon"><h2>Metas do mês</h2><span className="gia-badge">Indicadores</span></div>
        <div className="gia-header-actions">
          {canUseMediaGoals ? <small className="gia-caption">{monthLabel}</small> : monthControl}
          <button type="button" className="gia-action-link" aria-haspopup="dialog" disabled={!monthRead.data || Boolean(monthRead.error)} onClick={() => open('month')}>
            <Pencil aria-hidden="true" />Editar metas do mês
          </button>
        </div>
      </header>
      {monthRead.error ? <div className="gia-goal-foot"><p role="alert">Não foi possível consultar as metas do mês.</p><button className="gia-action-link" type="button" onClick={() => monthRead.reload()}>Tentar novamente</button></div>
        : !monthRead.data ? <p className="gia-goal-foot" role="status">Carregando metas do mês…</p>
          : <dl className="gia-goal-grid">{Object.entries(VOLUME_GOAL_LABELS).map(([key, label]) => <div key={key}><dt>{label}</dt><dd><strong>{number(monthRead.data[key])}</strong></dd></div>)}</dl>}
    </section>}
    </div>
    </details>
    {editor === 'traffic' && trafficFields.length > 0 && <GoalEditor title={trafficTitle} label={client.empresa} fields={trafficFields} values={client} close={close} save={async (draft) => {
      if (beforeSave) await beforeSave();
      await saveGestorTrafficGoals(supabase, { ...scope, canViewField, draft });
      clearDataCacheByPrefix('clients_');
      await reloadPortfolio();
      setNotice('Meta de tráfego salva.');
    }} />}
    {editor === 'month' && canEditMonthlyGoals && monthRead.data && <GoalEditor title="Editar metas do mês" label={`${client.empresa} · ${monthLabel}`} fields={Object.keys(VOLUME_GOAL_LABELS)} values={monthRead.data} monthly close={close} save={async (draft) => {
      if (beforeSave) await beforeSave();
      const saved = await saveGestorMonthlyGoals(supabase, { ...scope, draft, previous: monthRead.data });
      await monthRead.reload(() => saved);
      setNotice('Metas do mês salvas.');
    }} />}
  </div>;
}
