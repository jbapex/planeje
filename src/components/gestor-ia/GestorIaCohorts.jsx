import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { currency, displayDate, displayWeek } from '@/lib/trafficWeeklyReview';
import { canUseGestorIa } from './gestorIaAccess';
import { loadRoutineCohorts } from './gestorIaCohortData';
import './GestorIaCohorts.css';

const spendStatus = { conhecido: '', ausente: 'Sem gasto salvo para esta origem', incompleto: 'Gasto incompleto', ambiguo: 'Gasto ambíguo na revisão', sem_vinculo: 'Origem sem vínculo' };
const percent = (value) => value == null ? '—' : `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value)}%`;

export default function GestorIaCohorts({ clientId, weekStart, profile, modules }) {
  const [reading, setReading] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState('');
  const scope = `${profile?.id}:${profile?.role}:${profile?.status}:${clientId}:${weekStart}`;
  const allowed = canUseGestorIa(profile, modules) && modules.rastreamento === true;
  useEffect(() => {
    if (!allowed) { setReading(null); return undefined; }
    const controller = new AbortController();
    let current = true;
    const timeout = setTimeout(() => controller.abort(), 25000);
    setReading(previous => ({ scope, data: previous?.scope === scope ? previous.data : null, loading: true }));
    loadRoutineCohorts(supabase, { profile, modules, clientId, weekStart, signal: controller.signal }).then(
      data => { if (current) setReading({ scope, data, loading: false }); },
      error => { if (current) setReading(previous => ({ scope, data: error.accessDenied ? null : previous?.scope === scope ? previous.data : null,
        error: error.accessDenied ? error.message : 'Não foi possível atualizar a leitura. Tente novamente.', loading: false })); },
    ).finally(() => clearTimeout(timeout));
    return () => { current = false; controller.abort(); clearTimeout(timeout); };
  }, [allowed, scope, clientId, weekStart, profile, modules, attempt]);
  if (!allowed) return <p className="gia-notice" role="alert">A consulta das coortes requer acesso ao Rastreamento e ao Tráfego pago.</p>;
  const current = reading?.scope === scope ? reading : null;
  const data = current?.data;
  const cohort = data?.cohorts.find(item => item.key === selected) || data?.cohorts[0];
  const summary = data?.weekly_summary;
  return <section className="gia-cohorts" aria-label="Coorte da rotina semanal">
    <header className="gia-cohort-head"><div><h2>Coorte</h2><p className="gia-caption">Gasto da semana de entrada · somente leitura</p></div>
      <button className="gia-action-link" type="button" disabled={current?.loading} onClick={() => setAttempt(value => value + 1)}><RefreshCw size={15} aria-hidden="true" />Atualizar leitura</button>
    </header>
    {current?.error && <p className="gia-notice" role="alert">{data ? current.error : current.error.startsWith('Acesso') ? current.error : 'Não foi possível consultar as coortes. Tente novamente.'}</p>}
    {!data ? !current?.error && <p className="gia-status" role="status">Consultando as coortes…</p> : <>
      <div className="gia-cohort-summary" aria-label="Conferência com os agendados na semana"><div><span>Agendados na semana</span><strong>{summary.total}</strong><small>{displayWeek(weekStart)}</small></div>
        <div><span>Leads novos</span><strong>{summary.novos}</strong></div><div><span>Leads antigos</span><strong>{summary.antigos}</strong></div>
        <div><span>Origem identificada</span><strong>{summary.atribuidos.total}</strong></div><div><span>Sem vínculo Meta</span><strong>{summary.semVinculo.total}</strong></div>
      </div>
      <div className="gia-routine-clients gia-cohort-table" role="region" aria-label="Coortes por semana e origem" tabIndex={0}><table><thead><tr>
        <th scope="col">Entrada</th><th scope="col">Origem</th><th scope="col">Entradas</th><th scope="col">Gasto da entrada</th><th scope="col">Custo por entrada</th>
        <th scope="col">Agendados acumulados</th><th scope="col">CPA da coorte</th><th scope="col">Semana 0</th><th scope="col">Semana 1</th><th scope="col">Semana 2</th><th scope="col">Semana 3+</th><th scope="col">Sem histórico</th>
      </tr></thead><tbody>{data.cohorts.map(item => <tr key={item.key} className={cohort?.key === item.key ? 'is-active' : ''}>
        <td>{displayDate(item.week_start)}</td><th scope="row"><button type="button" onClick={() => setSelected(item.key)} aria-pressed={cohort?.key === item.key} aria-label={`Ver janelas de ${item.origin.label}, ${displayDate(item.week_start)}`}>
          <strong>{item.origin.label}</strong>{item.origin.campaign_name && <small>{item.origin.campaign_name}</small>}</button></th>
        <td>{item.entries}</td><td><span>{currency(item.spend)}</span>{item.spend_status !== 'conhecido' && <small>{spendStatus[item.spend_status]}</small>}</td>
        <td>{currency(item.cost_per_entry)}</td><td>{item.appointments}</td><td>{currency(item.cpa)}</td>
        <td>{item.buckets.week0}</td><td>{item.buckets.week1}</td><td>{item.buckets.week2}</td><td>{item.buckets.week3plus}</td><td>{item.without_history || '—'}</td>
      </tr>)}</tbody></table>{!data.cohorts.length && <p className="gia-empty">Nenhuma entrada encontrada nas coortes deste período.</p>}</div>
      {cohort && <section className="gia-cohort-windows" aria-label="Janelas de agendamento"><header><div><h3>Janelas de agendamento</h3><p className="gia-caption">{cohort.origin.label} · entrada em {displayDate(cohort.week_start)}</p></div>
        <span className="gia-caption">Primeira marcação registrada</span></header>
        <div className="gia-cohort-window-grid">{cohort.windows.map(window => <div key={window.days}>
          <span>Até {window.days} dias</span><strong>{window.count} <small>de {cohort.entries}</small></strong><b>{window.partial_history ? '≥ ' : ''}{percent(window.percent)} <small>observado</small></b>
          {window.incomplete && <span className="gia-cohort-badge">Janela incompleta</span>}{window.partial_history && <small className="gia-cohort-history">Histórico parcial</small>}
        </div>)}</div>
        {cohort.without_history > 0 && <p className="gia-cohort-history" role="status">Sem histórico: {cohort.without_history} agendado(s) sem primeira data comprovada. Fora das faixas e janelas.</p>}
      </section>}
      <section className="gia-cohort-diagnostics" aria-label="Diagnóstico dos sem vínculo"><header><h3>Sem vínculo na revisão</h3><span>{data.diagnostics.total} agendados</span></header>
        {data.diagnostics.groups.map(group => <div key={group.code}><div><strong>{group.label}</strong><p>{group.correction}</p></div><span><b>{group.count}</b><small>{group.novos} novos · {group.antigos} antigos</small></span></div>)}
        {!data.diagnostics.total && <p className="gia-caption">Todos os agendados desta semana têm origem identificada.</p>}
      </section>
      <p className="gia-caption gia-cohort-note">Coortes incluem a entrada selecionada e as entradas antigas dos agendados da semana. Faixas usam a primeira marcação; o resumo semanal inclui remarcações. Histórico desde {displayDate(data.ledger_started_at.slice(0, 10))} · nenhum dado foi alterado.</p>
    </>}
  </section>;
}
