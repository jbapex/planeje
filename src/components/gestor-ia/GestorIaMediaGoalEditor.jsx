import React, { useId, useMemo, useRef, useState } from 'react';
import { Layers3, TrendingUp } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import GestorIaDrawer from './GestorIaDrawer';
import { date, number } from './GestorIaContext';
import { formatMetric, metricValue, normalizeInsight } from './gestorIaMetricModel';
import { MEDIA_GOAL_OBJECTIVES, mediaGoalAdjustment, mediaGoalCoverageImpact, mediaGoalStats, parseMediaGoalDraft, suggestedGoalVolume, usesSuggestedGoalVolume } from './gestorIaMediaGoalModel';

const asAmount = (value) => value == null ? '' : (value / 100).toFixed(2);
const coverageChanges = { added: 'Entra', retained: 'Continua', removed: 'Sai' };

function GoalCoveragePreview({ impact, loading, active }) {
  const rows = impact?.rows || [];
  const covered = rows.filter(({ change }) => change !== 'removed');
  const overlaps = covered.filter(({ otherGoals }) => otherGoals.length).length;
  const uncovered = rows.filter(({ change, otherGoals, pending }) => change === 'removed' && !otherGoals.length && !pending).length;
  return <div className="gia-media-scope-preview">
    <div className="gia-media-scope-heading"><Layers3 aria-hidden="true" /><strong>Cobertura após salvar</strong></div>
    <div className="gia-media-scope-stats" role="status">
      {impact ? <>
        <span>{active ? `${covered.length} ${covered.length === 1 ? 'campanha nesta meta' : 'campanhas nesta meta'}` : 'Meta inativa'}</span>
        {overlaps > 0 && <span data-warning>{overlaps} {overlaps === 1 ? 'também em outra meta' : 'também em outras metas'}</span>}
        {uncovered > 0 && <span data-warning>{uncovered} {uncovered === 1 ? 'fica sem meta' : 'ficam sem meta'}</span>}
        {impact.partial && <span>Leitura parcial</span>}
        {impact.withoutReading > 0 && <span>{impact.withoutReading} sem leitura no mês</span>}
      </> : <span>{loading ? 'Consultando campanhas salvas…' : 'Sem leitura de campanhas para este mês.'}</span>}
    </div>
    {rows.length > 0 && <details>
      <summary>Ver impacto por campanha</summary>
      <ul tabIndex={0} aria-label="Impacto nas campanhas">{rows.map(({ id, name, change, otherGoals, replacedGoals, pending }) => <li key={id}>
        <span><strong>{name || `Campanha ${id}`}</strong>
          {otherGoals.length > 0 && <small>{change === 'removed' ? 'Fica em' : 'Também em'} {otherGoals.join(' · ')}</small>}
          {replacedGoals.length > 0 && <small>Antes em {replacedGoals.join(' · ')}</small>}
          {change === 'removed' && !otherGoals.length && <small>{pending ? 'Cobertura a conferir' : 'Fica sem meta'}</small>}
        </span>
        <span className="gia-badge" data-change={change}>{coverageChanges[change]}</span>
      </li>)}</ul>
    </details>}
  </div>;
}

export default function GestorIaMediaGoalEditor({ goal, client, accountName, accountId, accounts, selectAccount, campaigns, reading, period, otherGoals, budgetSuggestion, save, close }) {
  const baseId = useId();
  const form = useRef(null);
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const planning = budgetSuggestion != null;
  const [plan, setPlan] = useState('budget');
  const [scenarioValue, setScenarioValue] = useState(null);
  const [manualVolume, setManualVolume] = useState(() => !usesSuggestedGoalVolume(goal));
  const [draft, setDraft] = useState(() => ({ name: goal.name || '',
    objective: Object.hasOwn(MEDIA_GOAL_OBJECTIVES, goal.objective) ? goal.objective
      : Object.hasOwn(MEDIA_GOAL_OBJECTIVES, client.objetivo_meta) ? client.objetivo_meta : 'leads',
    scope: goal.scope || 'objective', campaign_ids: goal.campaign_ids || [], cost: asAmount(goal.cost_cents), budget: asAmount(goal.budget_cents),
    volume: goal.result_target == null ? '' : String(goal.result_target), is_active: goal.is_active ?? true, is_primary: goal.is_primary ?? false }));
  const patch = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const objective = MEDIA_GOAL_OBJECTIVES[draft.objective];
  const { objective: objectiveId, scope, campaign_ids: campaignIds, is_active: active } = draft;
  const impact = useMemo(() => planning ? null : mediaGoalCoverageImpact(reading, period, otherGoals, goal,
    { objective: objectiveId, scope, campaign_ids: campaignIds, is_active: active }),
  [planning, reading, period, otherGoals, goal, objectiveId, scope, campaignIds, active]);
  const suggested = suggestedGoalVolume(draft.cost, draft.budget, draft.objective);
  const current = planning ? mediaGoalStats(goal, reading, period, otherGoals) : null;
  const adjustment = planning ? mediaGoalAdjustment(goal, current) : null;
  const budget = planning && plan === 'budget' ? scenarioValue ?? asAmount(adjustment?.budgetCents ?? budgetSuggestion) : draft.budget;
  const volume = planning ? (plan === 'volume' ? scenarioValue ?? String(adjustment?.volume ?? '') : draft.volume)
    : manualVolume ? draft.volume : suggested == null ? '' : String(suggested);
  const values = { ...draft, budget, volume };
  const options = new Map(campaigns.filter((item) => typeof item?.id === 'string' && /^\d{1,32}$/.test(item.id))
    .map(({ id, name, insights }) => [id, { name: String(name || `Campanha ${id}`), spend: metricValue(normalizeInsight(insights?.data?.[0]), 'spend') }]));
  for (const id of draft.campaign_ids) if (!options.has(id)) options.set(id, { name: `Campanha ${id}`, spend: null });
  const needle = search.trim().toLocaleLowerCase('pt-BR');
  const matches = [...options].filter(([id, { name }]) => id.includes(needle) || name.toLocaleLowerCase('pt-BR').includes(needle))
    .sort(([, a], [, b]) => (b.spend ?? -1) - (a.spend ?? -1) || a.name.localeCompare(b.name, 'pt-BR'));
  const money = (value) => formatMetric(Number(value), { unit: 'money' }, 'BRL');
  let parsed;
  let invalid = '';
  try { parsed = parseMediaGoalDraft(values); } catch (e) { invalid = e.message; }
  if (planning) {
    if (!adjustment) invalid = 'A leitura salva não permite planejar este ajuste.';
    else if (plan === 'budget' && !budget) invalid = 'Informe uma verba para simular.';
    else if (plan === 'volume' && (!adjustment.volume || !volume || Number(volume) < current.results)) {
      invalid = 'Informe um volume pelo menos igual ao realizado.';
    }
  }
  if (reading.accessDenied) invalid = 'Leitura indisponível para esta conta.';
  const estimate = parsed ? mediaGoalStats(parsed, reading, period, otherGoals) : null;
  const volumeLabel = objective.volume.toLocaleLowerCase('pt-BR');
  const overCapacity = planning && estimate?.resultsWithinBudget != null && parsed.result_target > estimate.resultsWithinBudget;

  function dismiss() {
    const dialog = form.current?.closest('dialog');
    if (dialog?.open) dialog.close();
    else close();
  }

  async function submit(event) {
    event.preventDefault();
    if (locked.current || invalid || error?.conflict) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      await save(values, planning ? plan : null);
      dismiss();
    } catch (e) { setError(e); }
    finally { locked.current = false; setBusy(false); }
  }

  const budgetInput = <label className="gia-media-label">{planning ? 'Nova verba do mês' : 'Verba do mês'}<span className="gia-media-money-field">
    <span>R$</span><input type="number" required={planning} inputMode="decimal" min="0.01" step="0.01" value={budget}
      onChange={(e) => planning ? setScenarioValue(e.target.value) : patch('budget', e.target.value)} />
  </span></label>;

  return <GestorIaDrawer title={planning ? 'Planejar ajuste' : goal.id ? 'Editar meta' : 'Nova meta'} label={client.empresa} close={close} busy={busy} closeLabel="Fechar meta">
    <form className="gia-goal-form gia-media-form" ref={form} onSubmit={submit}>
      <div className="gia-media-fields">
        {planning ? <fieldset className="gia-media-plan" disabled={busy}>
          <legend>{goal.name}</legend>
          <p className="gia-caption">{accountName}{current.valid && ` · Dados até ${date(reading.period.until).slice(0, 5)}`}</p>
          <dl className="gia-media-scenario">
            <div><dt>Meta atual</dt><dd>{number(goal.result_target)} {volumeLabel}</dd></div>
            <div><dt>Verba atual</dt><dd>{goal.budget_cents != null ? money(goal.budget_cents / 100) : '—'}</dd></div>
          </dl>
          {adjustment && <>
            <p className="gia-media-plan-label">Cenários ao custo observado de <strong>{money(current.cost)}</strong> por resultado</p>
            <div className="gia-media-choices" role="radiogroup" aria-label="Cenário de ajuste">
              <label><input type="radio" name={`${baseId}-plan`} checked={plan === 'budget'} onChange={() => { setPlan('budget'); setScenarioValue(null); }} />
                <span>Manter o volume<strong>{money(adjustment.budgetCents / 100)}</strong><small>Verba estimada</small></span></label>
              {adjustment.volume != null && <label><input type="radio" name={`${baseId}-plan`} checked={plan === 'volume'} onChange={() => { setPlan('volume'); setScenarioValue(null); }} />
                <span>Manter a verba<strong>{number(adjustment.volume)} {volumeLabel}</strong><small>Volume estimado</small></span></label>}
            </div>
            {plan === 'budget' ? budgetInput : <label className="gia-media-label">Novo volume do mês
              <input type="number" required inputMode="numeric" min={Math.max(1, Math.ceil(current.results))} step="1" value={volume} onChange={(e) => setScenarioValue(e.target.value)} />
            </label>}
            {!invalid && estimate?.resultsWithinBudget != null && <div className="gia-media-estimate" role="status">
              <TrendingUp aria-hidden="true" /><div><strong>Com essa verba, até {number(estimate.resultsWithinBudget)} {volumeLabel} no mês</strong>
                <small>{overCapacity && estimate.requiredCost > 0
                  ? `Para chegar a ${number(parsed.result_target)}, custo de até ${money(estimate.requiredCost)} por resultado restante.`
                  : `${number(current.results)} já realizados${estimate.budgetRemaining > 0 ? ` · Restam ${money(estimate.budgetRemaining)}` : ' · Verba consumida'}.`}</small></div>
            </div>}
          </>}
        </fieldset> : <>
        <fieldset disabled={busy}>
          <legend><span>1</span> O que conta como resultado</legend>
          <label className="gia-media-label gia-media-name">Nome<input required value={draft.name} maxLength={80} placeholder="Ex.: Provas da coleção" onChange={(e) => patch('name', e.target.value)} /></label>
          <div className="gia-media-objectives" role="group" aria-label="Objetivo da meta">
            {Object.entries(MEDIA_GOAL_OBJECTIVES).map(([id, item]) => <button key={id} type="button" className="gia-action-link" aria-pressed={draft.objective === id} onClick={() => patch('objective', id)}>{item.label}</button>)}
          </div>
        </fieldset>
        <fieldset disabled={busy}>
          <legend><span>2</span> Onde a meta vale</legend>
          {accounts.length > 0 ? <label className="gia-media-label">Conta Meta
            <select value={accountId} onChange={(event) => { selectAccount(event.target.value); setSearch(''); patch('campaign_ids', []); }}>
              {accounts.map(({ meta_account_id, meta_account_name }) => <option key={meta_account_id} value={meta_account_id}>{meta_account_name || meta_account_id}</option>)}
            </select>
          </label> : <p className="gia-caption">{accountName}</p>}
          <div className="gia-media-scopes" role="radiogroup" aria-label="Onde a meta vale">
            {[['objective', objective.measuredScope ? `Campanhas com ${objective.measuredScope}` : `Campanhas de ${objective.label.toLocaleLowerCase('pt-BR')}`,
              objective.measuredScope ? 'A campanha entra quando essa entrega aparece na Meta.' : 'Inclui novas campanhas com o mesmo objetivo.'],
              ['account', 'Todas as campanhas da conta', 'Cobre as campanhas sem uma meta mais específica.'],
              ['campaigns', 'Só as campanhas que eu escolher', 'Você escolhe o que entra na meta.']].map(([id, title, hint]) => <label key={id}>
              <input type="radio" name={`${baseId}-scope`} value={id} checked={draft.scope === id} onChange={() => patch('scope', id)} />
              <span>{title}<small>{hint}</small></span>
            </label>)}
          </div>
          {draft.scope === 'campaigns' && <div className="gia-media-picker">
            {options.size > 0 ? <><input type="search" aria-label="Buscar campanha" placeholder="Buscar por nome ou ID" value={search} onChange={(e) => setSearch(e.target.value)} />
              <div className="gia-media-campaign-options">{matches.map(([id, { name, spend }]) => <label key={id}>
                <input type="checkbox" checked={draft.campaign_ids.includes(id)} onChange={(e) => {
                  const checked = e.target.checked;
                  setDraft((current) => ({ ...current, campaign_ids: checked ? [...current.campaign_ids, id] : current.campaign_ids.filter((item) => item !== id) }));
                }} />
                <span>{name}</span>{spend !== null && <small>{formatMetric(spend, { unit: 'money' }, reading.account?.currency)} no mês</small>}
              </label>)}</div>
              {!matches.length && <small>Nenhuma campanha encontrada.</small>}
              <small>{draft.campaign_ids.length} de {options.size} selecionadas</small></> : <p>Esta conta ainda não tem campanhas salvas.</p>}
          </div>}
          {!reading.accessDenied && <GoalCoveragePreview impact={impact} loading={reading.loading} active={active} />}
        </fieldset>
        <fieldset disabled={busy}>
          <legend><span>3</span> Custo, verba e volume</legend>
          <div className="gia-media-amounts">
            <label className="gia-media-label">{objective.cost} alvo<span className="gia-media-money-field"><span>R$</span>
              <input required type="number" inputMode="decimal" min="0.01" step="0.01" value={draft.cost} onChange={(e) => patch('cost', e.target.value)} />
            </span></label>
            {budgetInput}
            <label className="gia-media-label">{objective.volume} no mês<input type="number" inputMode="numeric" min="1" step="1" value={volume} onChange={(e) => { setManualVolume(true); patch('volume', e.target.value); }} /></label>
          </div>
          {draft.objective === 'alcance' && <p className="gia-caption">O CPM mede mil impressões. Defina separadamente quantas pessoas quer alcançar.</p>}
          {suggested != null && <div className="gia-media-suggestion"><small>{money(draft.budget)} ÷ {money(draft.cost)} = <strong>{number(suggested)} {volumeLabel}</strong></small>
            {!manualVolume && <small className="gia-badge">Sugerido</small>}
            {manualVolume && Number(volume) !== suggested && <button type="button" className="gia-action-link" onClick={() => setManualVolume(false)}>Usar sugestão</button>}
          </div>}
          {estimate?.resultProjection != null && <div className="gia-media-estimate" role="status">
            <TrendingUp aria-hidden="true" /><div><strong>Simulação com os dados até {date(reading.period.until).slice(0, 5)}</strong>
              <small>Projeção de {number(estimate.resultProjection)} {volumeLabel}{parsed.result_target != null ? ` para uma meta de ${number(parsed.result_target)}` : ''}.
                {estimate.requiredCost !== null && ` ${estimate.budgetRemaining === 0 ? 'Verba consumida.' : estimate.requiredCost > 0 ? `Custo necessário de até ${money(estimate.requiredCost)}.` : 'Custo necessário abaixo de R$ 0,01.'}`}</small></div>
          </div>}
          <div className="gia-media-flags">
            <div className="gia-media-flag">
              <div><label htmlFor={`${baseId}-primary`}>Meta principal</label><small id={`${baseId}-primary-hint`}>Quando ativa, aparece na Carteira e no resumo do cliente.</small></div>
              <Switch id={`${baseId}-primary`} aria-describedby={`${baseId}-primary-hint`} checked={draft.is_primary} disabled={busy} onCheckedChange={(value) => patch('is_primary', value)} />
            </div>
            <div className="gia-media-flag">
              <label htmlFor={`${baseId}-active`}>Meta ativa</label>
              <Switch id={`${baseId}-active`} checked={draft.is_active} disabled={busy} onCheckedChange={(value) => patch('is_active', value)} />
            </div>
          </div>
        </fieldset></>}
      </div>
      <footer className="gia-media-save">
        {error && <p className="gia-notice" role="alert">{error.message || 'Não foi possível salvar a meta.'}</p>}
        {!error && <small className="gia-caption">{invalid || (planning ? 'O ajuste vale para a meta recorrente do Gestor IA.' : `${objective.cost} alvo ${money(draft.cost)} · ${draft.is_active ? 'Ativa' : 'Inativa'}`)}</small>}
        <div className="gia-goal-actions">
          <button type="button" className="gia-action-link" onClick={dismiss} disabled={busy}>Cancelar</button>
          <button type="submit" className="gia-action-link gia-primary-action" disabled={busy || Boolean(invalid) || Boolean(error?.conflict)}>{busy ? 'Salvando…' : planning ? (plan === 'budget' ? 'Salvar verba' : 'Salvar volume') : goal.id ? 'Salvar' : 'Criar meta'}</button>
        </div>
      </footer>
    </form>
  </GestorIaDrawer>;
}
