import React, { useId, useState } from 'react';
import { ArrowRight, Bot, CalendarDays, MessageCircle, RefreshCw, Sparkles, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CrmIaField, CrmIaState, useCrmRead } from './CrmIaPrimitives';
import { AGENT_TYPES, count, dateRange, dateTime, money } from './crmIaPresentation';
import './CrmIaOverview.css';

const measured = value => Number.isFinite(value) && value >= 0;
const shortDate = value => dateTime(value).slice(0, 5);

function DailyChart({ rows }) {
  const id = useId();
  if (!Array.isArray(rows)) return <p className="crm-ia-overview-empty" role="status">Dados diários indisponíveis para este período.</p>;
  if (!rows.length) return <p className="crm-ia-overview-empty">Sem entradas registradas neste período.</p>;
  const maximum = Math.max(1, ...rows.map(row => measured(row.count) ? row.count : 0));
  const x = index => rows.length === 1 ? 128 : index / (rows.length - 1) * 256;
  const y = value => 132 - value / maximum * 132;
  const line = rows.map((row, index) => measured(row.count) ? `${index && measured(rows[index - 1].count) ? 'L' : 'M'}${x(index).toFixed(1)},${y(row.count).toFixed(1)}` : '').join(' ');
  const complete = rows.every(row => measured(row.count));
  const peak = rows.reduce((best, row) => measured(row.count) && (!best || row.count > best.count) ? row : best, null);
  const ticks = maximum === 1 ? [0, 1] : [0, Math.ceil(maximum / 2), maximum];
  const days = [...new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1])];
  return <div className="crm-ia-overview-daily">
    <p className="crm-ia-overview-caption">{!complete ? 'Há dias sem dados nesta leitura.' : peak?.count ? `Pico em ${shortDate(peak.day)}, com ${count(peak.count)} leads.` : 'Nenhuma entrada registrada no período.'}</p>
    <div className="crm-ia-overview-plot"><div className="crm-ia-overview-chart-y" aria-hidden="true">{ticks.map(value => <span key={value} style={{ bottom: `${(5 + value / maximum * 132) / 142 * 100}%` }}>{count(value)}</span>)}</div>
    <svg className="crm-ia-overview-chart" viewBox="-5 -5 266 142" preserveAspectRatio="none" role="img" aria-labelledby={`${id}-title ${id}-description`}>
      <title id={`${id}-title`}>Leads por dia</title>
      <desc id={`${id}-description`}>{rows.map(row => `${dateTime(row.day)}: ${count(row.count)}${measured(row.count) ? ' leads' : ''}`).join('; ')}</desc>
      <g aria-hidden="true">{ticks.map(value => <line key={value} x1="0" x2="256" y1={y(value)} y2={y(value)} />)}
        {complete && peak?.count > 0 && rows.length > 1 && <path className="crm-ia-overview-chart-area" d={`${line} L256,132 L0,132 Z`} />}
        <path className="crm-ia-overview-chart-line" d={line} />
        {rows.length <= 31 && rows.map((row, index) => measured(row.count) ? <circle key={row.day} cx={x(index)} cy={y(row.count)} r="3.5" /> : null)}
      </g>
    </svg><div className="crm-ia-overview-chart-x" aria-hidden="true">{days.map(index => <span key={rows[index].day}>{shortDate(rows[index].day)}</span>)}</div></div>
    <details className="crm-ia-overview-chart-values"><summary>Ver valores por dia</summary><div><table><caption>Entradas de leads no período</caption><thead><tr><th scope="col">Dia</th><th scope="col">Leads</th></tr></thead><tbody>{rows.map(row => <tr key={row.day}><th scope="row">{dateTime(row.day)}</th><td>{count(row.count)}</td></tr>)}</tbody></table></div></details>
  </div>;
}

export default function CrmIaOverview({ api, client, workspace, revision, onAnalyze }) {
  const [period, setPeriod] = useState(() => dateRange(30));
  const [selectedPeriod, setSelectedPeriod] = useState('30');
  const [reload, setReload] = useState(0);
  const [usageReload, setUsageReload] = useState(0);
  const valid = Boolean(period.since && period.until && period.since <= period.until);
  const read = useCrmRead(api, 'overview', period, `${revision}:${reload}`, valid);
  const usage = useCrmRead(api, 'usage', period, `${revision}:${reload}:${usageReload}`, valid);
  const data = read.data || {};
  const path = (section, extra = {}) => `/crm-ia/${section}?${new URLSearchParams({ cliente: client.id, ...period, ...extra })}`;
  const indicators = [['leads', 'Leads recebidos', 'leads', 'Entradas no período'], ['qualified', 'Qualificados', 'leads', 'Qualificação registrada'], ['conversations', 'Conversas abertas', 'conversas'], ['appointments', 'Próximos compromissos', 'agenda', 'Agendados no período']];
  const stages = Array.isArray(data.stages) ? data.stages : null;
  const origins = Array.isArray(data.origins) ? data.origins : null;
  const stageMaximum = Math.max(1, ...(stages || []).map(stage => measured(stage.count) ? stage.count : 0));
  const originTotal = origins?.every(origin => measured(origin.count)) ? origins.reduce((sum, origin) => sum + origin.count, 0) : null;
  const conversationsAvailable = data.coverage?.conversations !== 'unavailable';
  const waiting = conversationsAvailable && Array.isArray(data.waiting) ? [...data.waiting].sort((a, b) => { const first = Date.parse(a.since), second = Date.parse(b.since); return (Number.isFinite(first) ? first : Infinity) - (Number.isFinite(second) ? second : Infinity); }) : null;
  const agents = Array.isArray(workspace?.agents) ? workspace.agents : null;
  function preset(value) {
    const next = dateRange(value === 'month' ? 1 : Number(value));
    setPeriod(value === 'month' ? { since: next.until.slice(0, 7) + '-01', until: next.until } : next);
    setSelectedPeriod(value);
  }
  function customDate(key, value) { setPeriod(old => ({ ...old, [key]: value })); setSelectedPeriod('custom'); }
  return <div className="crm-ia-stack crm-ia-overview">
    <div className="crm-ia-overview-toolbar">
      <div className="crm-ia-overview-period-controls"><div className="crm-ia-segments" role="group" aria-label="Período">{['7', '30', 'month'].map(value => <button key={value} type="button" aria-pressed={selectedPeriod === value} onClick={() => preset(value)}>{value === 'month' ? 'Este mês' : `${value} dias`}</button>)}</div>
        <details className="crm-ia-overview-period"><summary aria-label={`Personalizar período de ${dateTime(period.since)} a ${dateTime(period.until)}`}><CalendarDays size={14} aria-hidden="true" /><span>{dateTime(period.since)} – {dateTime(period.until)}</span></summary><div className="crm-ia-overview-date-fields"><CrmIaField label="Data inicial" type="date" value={period.since} onChange={value => customDate('since', value)} /><CrmIaField label="Data final" type="date" value={period.until} onChange={value => customDate('until', value)} /></div></details>
      </div>
      <div className="crm-ia-overview-actions"><button type="button" className="crm-ia-overview-refresh" aria-label="Atualizar painel" title="Atualizar painel" disabled={!valid} onClick={() => setReload(value => value + 1)}><RefreshCw size={15} aria-hidden="true" /></button>{onAnalyze && <button type="button" className="crm-ia-primary" disabled={!valid} onClick={() => onAnalyze({ question: `Analise a operação comercial de ${period.since} a ${period.until}. Separe dados registrados de hipóteses e indique o próximo passo.` })}><Sparkles size={15} aria-hidden="true" />Analisar com Atlas</button>}</div>
    </div>
    {!valid && <p className="crm-ia-error" role="alert">Confira as datas do período.</p>}
    {valid && <CrmIaState read={read} retry={() => setReload(value => value + 1)}>
      <nav className="crm-ia-overview-kpis" aria-label="Indicadores do período">{indicators.map(([key, label, section, caption]) => <Link key={key} to={path(section, key === 'qualified' ? { qualified: 'true' } : {})}><span>{label}</span><strong>{count(data.totals?.[key])}</strong><small>{key === 'conversations' ? `IA: ${count(data.totals?.ai_conversations)} · Humano: ${count(data.totals?.human_conversations)}` : caption}</small></Link>)}</nav>
      <div className="crm-ia-overview-panels">
        <section className="crm-ia-card crm-ia-overview-panel"><header><h2>Esperando você</h2><span className="crm-ia-overview-waiting-count">{measured(data.totals?.waiting) ? `${count(data.totals.waiting)} conversas` : 'Sem dados'}</span></header>
          <p className="crm-ia-overview-caption">Mais antigas primeiro</p>
          {waiting?.length ? <ul className="crm-ia-overview-waiting">{waiting.map(item => <li key={`${item.contact_id}:${item.channel_id}`}><Link to={path('conversas', { contact_id: item.contact_id, channel_id: item.channel_id })} aria-label={`Abrir conversa com ${item.nome || 'Contato sem nome'}`}><span className="crm-ia-overview-avatar" aria-hidden="true">{(item.nome || 'Contato').trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join('').toUpperCase()}</span><span className="crm-ia-overview-contact"><strong>{item.nome || 'Contato sem nome'}</strong><small>Desde <time dateTime={item.since}>{dateTime(item.since)}</time></small></span><ArrowRight size={14} aria-hidden="true" /></Link></li>)}</ul> : <p className="crm-ia-overview-empty" role="status">{waiting ? 'Nenhum contato na fila humana deste recorte.' : data.coverage?.message || 'Fila humana indisponível neste recorte.'}</p>}
          <Link className="crm-ia-overview-footer-link" to={path('conversas', { attendance: 'waiting' })}>Abrir fila humana<ArrowRight size={13} aria-hidden="true" /></Link>
        </section>
        <section className="crm-ia-card crm-ia-overview-panel"><header><h2>Quando os leads chegaram</h2></header><DailyChart rows={data.daily} /></section>
        <section className="crm-ia-card crm-ia-overview-panel"><header><h2>Onde as oportunidades estão</h2></header>
          {stages?.length ? <ul className="crm-ia-overview-distribution">{stages.map(stage => <li key={stage.id}><Link to={path('leads', { stage_id: stage.id })}><span className="crm-ia-overview-distribution-label"><span>{stage.nome}</span><strong>{count(stage.count)}</strong></span><span className="crm-ia-overview-bar" aria-hidden="true">{measured(stage.count) && <i className="crm-ia-overview-bar-fill" style={{ width: `${stage.count / stageMaximum * 100}%`, background: stage.color || undefined }} />}</span><small>{money(stage.value)}</small></Link></li>)}</ul> : <p className="crm-ia-overview-empty" role="status">{stages ? 'Sem etapas com dados.' : 'Etapas indisponíveis neste período.'}</p>}
          <Link className="crm-ia-overview-footer-link" to={path('funil')}>Abrir funil<ArrowRight size={13} aria-hidden="true" /></Link>
        </section>
        <section className="crm-ia-card crm-ia-overview-panel"><header><h2>De onde a demanda veio</h2></header>
          {origins?.length ? <ul className="crm-ia-overview-origins">{origins.map(origin => <li key={origin.name}><Link to={path('leads', { origin: origin.name })}><span className="crm-ia-overview-origin-icon" aria-hidden="true"><MessageCircle size={14} /></span><span className="crm-ia-overview-origin-name">{origin.name || 'Origem não informada'}</span><strong>{count(origin.count)}</strong><small aria-label={originTotal === null ? 'Participação indisponível' : undefined}>{originTotal === null ? '—' : `${originTotal ? Math.round(origin.count / originTotal * 100) : 0}%`}</small><span className="crm-ia-overview-bar" aria-hidden="true">{originTotal !== null && <i className="crm-ia-overview-bar-fill" style={{ width: `${originTotal ? origin.count / originTotal * 100 : 0}%` }} />}</span></Link></li>)}</ul> : <p className="crm-ia-overview-empty" role="status">{origins ? 'Sem origem registrada neste período.' : 'Origens indisponíveis neste período.'}</p>}
          <p className="crm-ia-overview-panel-note">Participação nas origens registradas no período.</p><Link className="crm-ia-overview-footer-link" to={path('rastreabilidade')}>Ver rastreabilidade<ArrowRight size={13} aria-hidden="true" /></Link>
        </section>
      </div>
      <div className="crm-ia-overview-summaries">
        <section className="crm-ia-card crm-ia-overview-summary"><header><span className="crm-ia-overview-summary-icon is-ai"><Bot size={18} aria-hidden="true" /></span><div><h2>Resposta da IA</h2><p>{usage.data?.coverage?.since && usage.data?.coverage?.until ? `${dateTime(usage.data.coverage.since)} – ${dateTime(usage.data.coverage.until)}` : 'Cobertura não informada'}</p></div></header>
          <CrmIaState read={usage} retry={() => setUsageReload(value => value + 1)}><dl><div><dt>Gerações registradas</dt><dd>{count(usage.data?.responses)}</dd></div><div><dt>Tokens registrados</dt><dd>{count(usage.data?.tokens)}</dd></div></dl><p className="crm-ia-overview-summary-note">{usage.data?.coverage?.complete === false ? usage.data.coverage.message || 'Uso parcial: há registros sem atribuição segura ao recorte.' : 'Inclui testes e sugestões; não comprova envio ao contato.'}</p></CrmIaState>
        </section>
        <section className="crm-ia-card crm-ia-overview-summary"><header><span className="crm-ia-overview-summary-icon is-human"><Users size={18} aria-hidden="true" /></span><div><h2>Atendimento humano</h2><p>Conversas no período</p></div><Link className="crm-ia-overview-summary-link" aria-label="Abrir atendimento humano" to={path('conversas', { attendance: 'human' })}><ArrowRight size={15} aria-hidden="true" /></Link></header>
          <dl><div><dt>Conversas humanas</dt><dd>{count(data.totals?.human_conversations)}</dd></div><div><dt>Aguardando pessoa</dt><dd>{count(data.totals?.waiting)}</dd></div></dl><p className="crm-ia-overview-summary-note">{conversationsAvailable ? 'Conversas com última mensagem no período.' : data.coverage?.message || 'Atendimento indisponível nesta leitura.'}</p>
        </section>
        <section className="crm-ia-card crm-ia-overview-summary"><header><span className="crm-ia-overview-summary-icon is-agents"><Sparkles size={18} aria-hidden="true" /></span><div><h2>Agentes da conta</h2><p>Configuração atual</p></div><Link className="crm-ia-overview-summary-link" aria-label="Abrir agentes da conta" to={path('agentes')}><ArrowRight size={15} aria-hidden="true" /></Link></header>
          <dl>{AGENT_TYPES.map(([type, title]) => <div key={type}><dt>{title}</dt><dd>{count(agents?.filter(agent => agent.funil?.crm_ia?.tipo === type).length)}</dd></div>)}</dl><p className="crm-ia-overview-summary-note">{!agents ? 'Configuração de agentes indisponível.' : !agents.length ? 'Nenhum agente configurado.' : `${count(agents.length)} agentes configurados na conta.`}</p>
        </section>
      </div>
    </CrmIaState>}
  </div>;
}
