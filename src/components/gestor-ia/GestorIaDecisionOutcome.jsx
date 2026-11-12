import React, { useId, useState } from 'react';
import { BarChart3, ChevronDown } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useModuleSettings } from '@/contexts/ModuleSettingsContext';
import { supabase } from '@/lib/customSupabaseClient';
import { date, number, periodLabel, readingTime } from './GestorIaContext';
import { useGestorIaMetrics } from './GestorIaMetrics';
import { loadGestorAccountsOverview } from './gestorIaData';
import { decisionPayload } from './gestorIaDecisionLog';
import { compareDecisionOutcome, DECISION_OUTCOME_METRICS, DECISION_REVIEW_DAYS, decisionReviewWindows, decisionTaskCompletedAt, readDecisionTask } from './gestorIaDecisionOutcomeModel';
import { comparisonDelta, formatMetric } from './gestorIaMetricModel';
import { overviewKey, useGestorRead } from './gestorIaReads';

const changeFormat = new Intl.NumberFormat('pt-BR', { style: 'percent', signDisplay: 'exceptZero', maximumFractionDigits: 1 });
const shortRange = ({ since, until }) => `${date(since).slice(0, 5)}–${date(until).slice(0, 5)}`;
const emptyPeriod = { since: '', until: '' };

function OutcomeNumbers({ report, windows, accountName, objective, busy, note, onUse }) {
  const { rows, currency, fetchedAt, campaignName, adName } = report;
  const scope = adName ? `Anúncio ${adName} · ${accountName}` : campaignName ? `Campanha ${campaignName} · ${accountName}` : `Conta ${accountName}`;
  const display = (row, side) => row.unit === 'times' ? `${number(row[side], 2)}×` : formatMetric(row[side], row.unit && { unit: row.unit }, currency);
  const noteLine = (side, label) => `${label} (${periodLabel(windows[side])}) · ${rows.map((row) => `${row.label} ${display(row, side)}`).join(' · ')}`;
  const evidence = [`Meta Ads · ${scope.slice(0, 150)}`, noteLine('before', 'Antes'), noteLine('after', 'Depois')].join('\n');
  const included = note.includes(evidence);
  const combined = [evidence, note.trim()].filter(Boolean).join('\n\n');
  return <>
    <p className="gia-outcome-scope">{scope}</p>
    <div className="gia-table-wrap gia-outcome-table" tabIndex={0} role="region" aria-label="Comparação antes e depois">
      <table><thead><tr><th scope="col">Indicador</th><th scope="col">Antes <small>{shortRange(windows.before)}</small></th>
        <th scope="col">Depois <small>{shortRange(windows.after)}</small></th><th scope="col">Variação</th></tr></thead>
        <tbody>{rows.map((row) => {
          const delta = comparisonDelta(row.after, row.before);
          const direction = row.key === 'spend' || row.key === 'frequency' ? 0 : (row.key === 'cost' ? -1 : 1) * (delta || 0);
          return <tr key={row.key}><th scope="row">{row.label}</th><td>{display(row, 'before')}</td><td>{display(row, 'after')}</td>
            <td data-trend={direction > 0 ? 'upside' : direction < 0 ? 'downside' : undefined}>{delta === null ? '—' : changeFormat.format(delta / 100)}</td></tr>;
        })}</tbody>
      </table>
    </div>
    <p className="gia-caption">Leitura salva em {readingTime(fetchedAt)}. O dia da conclusão fica fora das duas janelas.</p>
    {objective && !adName && !rows.some(({ key }) => key === 'result') && <p className="gia-caption">O resultado escolhido não tem medição comparável nos dois períodos.</p>}
    {onUse && <div>
      <button className="gia-action-link" type="button" disabled={busy || included || combined.length > 800} onClick={() => onUse(combined)}>
        {included ? 'Números incluídos' : 'Incluir números no veredito'}</button>
      {!included && combined.length > 800 && <p className="gia-caption">Reduza a observação para incluir a comparação.</p>}
    </div>}
  </>;
}

export default function GestorIaDecisionOutcome({ item, taskOptions, readStore, note, onUse, busy, planDays }) {
  const { client, task, record } = item;
  const { profile, canViewField } = useAuth();
  const { moduleSettings } = useModuleSettings();
  const { days, measurement } = decisionPayload(record.payload);
  const accounts = measurement.accountId ? client.metaAccounts.filter(({ meta_account_id }) =>
    meta_account_id.replace(/^act_/, '') === measurement.accountId.slice(4)) : client.metaAccounts;
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(accounts.length === 1 ? accounts[0].meta_account_id : '');
  const [chosenDays, setChosenDays] = useState(null);
  const daysEach = chosenDays || planDays || days || 7;
  const [objective, setObjective] = useState(() => {
    const suggested = measurement.objective || (canViewField?.('objetivo_meta') === true ? client.objetivo_meta : null);
    return Object.hasOwn(DECISION_OUTCOME_METRICS, suggested) ? suggested : '';
  });
  const account = accounts.find(({ meta_account_id }) => meta_account_id === accountId);
  const accountName = account?.meta_account_name || accountId;
  const query = { profile, modules: moduleSettings, clientId: client.id };
  const taskRead = useGestorRead(readStore, JSON.stringify(['veredito:tarefa', client.id, task.id, task.status, record.id, record.revision]), open,
    () => readDecisionTask(supabase, client.id, task.id));
  const overview = useGestorRead(readStore, overviewKey(client.id), open && Boolean(account), () => loadGestorAccountsOverview(supabase, query));
  const history = Array.isArray(record.history) ? record.history : [];
  const earliest = [...history].reverse().find(({ event }) => event === 'approved')?.at || record.created_at;
  const completedAt = decisionTaskCompletedAt(taskRead.data, taskOptions, earliest);
  const normalizedId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
  const timeZone = overview.data?.accounts.find(({ id }) => id === normalizedId)?.timezone;
  const zoneLabel = timeZone === 'America/Sao_Paulo' ? 'horário de Brasília' : timeZone;
  const windows = decisionReviewWindows(completedAt, daysEach, timeZone);
  const period = windows?.ready ? { since: windows.before.since, until: windows.after.until } : emptyPeriod;
  const reading = useGestorIaMetrics({ client, query: { ...query, period }, readStore, accountId, canReadMeta: true,
    validPeriod: Boolean(windows?.ready) }, open && Boolean(account)).current;
  const report = open && windows?.ready && !reading.accessDenied ? compareDecisionOutcome(reading.history, windows, { ...measurement, objective }) : null;

  const status = !accounts.length ? 'A conta da decisão está indisponível.' : !account ? 'Escolha a conta da comparação.' : taskRead.error ? taskRead.error.message
    : taskRead.data === undefined || (!overview.data && !overview.error) || reading.loading ? 'Consultando leituras salvas…'
      : !completedAt ? 'A tarefa não tem uma conclusão registrada para esta decisão.'
        : !windows ? overview.error?.message || 'O fuso da conta está indisponível na leitura salva.'
          : !windows.ready ? `A janela de depois fecha em ${date(windows.readyOn)}.`
            : reading.error || (measurement.adId ? 'Ainda faltam leituras completas do mesmo anúncio nas duas janelas.'
              : measurement.campaignId ? 'Esta conta ainda não tem dados completos da campanha nas duas janelas.' : 'O histórico salvo ainda não cobre as duas janelas.');

  return <section className="gia-panel gia-outcome" aria-label="Antes e depois">
    <header>
      <div><h3>Antes e depois</h3><p className="gia-caption">Histórico salvo da Meta</p></div>
      <button className="gia-action-link" type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
        <BarChart3 aria-hidden="true" />{open ? 'Recolher' : 'Comparar resultados'}<ChevronDown aria-hidden="true" />
      </button>
    </header>
    <div id={panelId} hidden={!open}>
      {open && <div className="gia-outcome-body">
        <div className="gia-decision-form gia-outcome-filters">
          {accounts.length > 1 && <label>Conta Meta<select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
            <option value="">Escolha uma conta</option>{accounts.map(({ meta_account_id, meta_account_name }) => <option key={meta_account_id} value={meta_account_id}>{meta_account_name || meta_account_id}</option>)}
          </select></label>}
          <label>Dias por janela<select value={daysEach} onChange={(event) => setChosenDays(Number(event.target.value))}>
            {DECISION_REVIEW_DAYS.map((count) => <option key={count} value={count}>{count} dias</option>)}
          </select></label>
          {!measurement.adId && <label>Resultado da Meta<select value={objective} onChange={(event) => setObjective(event.target.value)}>
            <option value="">Investimento e CTR</option>{Object.entries(DECISION_OUTCOME_METRICS).map(([id, metric]) => <option key={id} value={id}>{metric.label}</option>)}
          </select></label>}
        </div>
        {windows && <p className="gia-caption">Tarefa concluída em {date(windows.day)} · {zoneLabel}.</p>}
        {report ? <OutcomeNumbers report={report} windows={windows} accountName={accountName} objective={objective} busy={busy} note={note} onUse={onUse} />
          : <p className="gia-caption" role="status">{status}</p>}
      </div>}
    </div>
  </section>;
}
