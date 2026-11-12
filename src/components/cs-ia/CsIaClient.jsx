import React, { lazy, Suspense, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Pencil, Sparkles } from 'lucide-react';
import GestorIaDrawer from '@/components/gestor-ia/GestorIaDrawer';
import { ATLAS_DEMANDS_ENABLED } from '@/lib/atlasDemands';
import { buildClientCrmUrl, buildClientEditUrl, buildClientHubUrl, buildClientProjectsUrl } from '@/lib/clientHubRoutes';
import { CsHealth, linkedGroupUrl } from './CsIaViews';
import { CsIaChurnEditor } from './CsIaChurn';
import CsIaConversationReading from './CsIaConversationReading';
import CsIaGroupMembers from './CsIaGroupMembers';
import CsIaGroupBinding from './CsIaGroupBinding';
import CsIaTasks from './CsIaTasks';
import CsIaClientSources from './CsIaClientSources';
import { clientTimeline, conversationSignals, dateTime, groupLabel, groupStatus, HEALTH, historyWindow, ownerLabel, primaryCsSignal, READING_TONE, SIGNAL } from './csIaPresentation';

const CsIaGoals = lazy(() => import('./CsIaGoals'));

const sections = [
  ['resumo', 'Visão geral'], ['conversas', 'Conversas'], ['crm', 'CRM'],
  ['historico', 'Histórico'], ['arquivos', 'Arquivos'], ['metas', 'Metas'],
  ['tarefas', 'Tarefas'],
];
const assessmentStatuses = Object.entries(HEALTH).filter(([key]) => key !== 'sem_leitura');
const timelineSources = { '': 'Todos', saude: 'Saúde', whatsapp: 'WhatsApp', cadastro: 'Cadastro' };

function AssessmentEditor({ status, onSave, onClose }) {
  const [draft, setDraft] = useState(status || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(event) {
    event.preventDefault();
    if (busy) return;
    if (draft && !assessmentStatuses.some(([key]) => key === draft)) {
      setError('Escolha uma faixa de saúde válida.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSave(draft || null);
      onClose();
    } catch {
      setError('Não foi possível salvar a avaliação. Tente novamente.');
      setBusy(false);
    }
  }

  return <GestorIaDrawer label="CS IA · Avaliação" title="Editar status manual" close={onClose} busy={busy}>
    <form className="gia-stack" onSubmit={save}>
      <p>O status manual entra como um dos fatores da saúde deste cliente.</p>
      <label className="cs-filter"><span>Status manual</span>
        <select value={draft} onChange={(event) => setDraft(event.target.value)} disabled={busy}>
          <option value="">Sem status</option>
          {assessmentStatuses.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>
      {error && <p className="gia-notice" role="alert">{error}</p>}
      <div className="cs-actions">
        <button type="button" className="gia-action-link" onClick={onClose} disabled={busy}>Cancelar</button>
        <button type="submit" className="gia-action-link gia-primary-action" disabled={busy || draft === (status || '')}>{busy ? 'Salvando…' : 'Salvar avaliação'}</button>
      </div>
    </form>
  </GestorIaDrawer>;
}

function Timeline({ row, history, loading, error, onReload, completeHref }) {
  const [source, setSource] = useState('');
  const entries = loading || error ? [] : clientTimeline(row, history, source);
  return <section className="gia-panel gia-stack" aria-labelledby="cs-timeline-title">
    <div className="gia-section-heading">
      <h2 id="cs-timeline-title">Linha do tempo</h2>
      {completeHref && <Link className="gia-action-link" to={completeHref}>Ver histórico completo <ArrowUpRight aria-hidden="true" /></Link>}
    </div>
    <div className="gia-segments" role="group" aria-label="Filtrar acontecimentos por fonte">
      {Object.entries(timelineSources).map(([key, label]) => <button key={key} type="button" aria-pressed={key === source} onClick={() => setSource(key)}>{label}</button>)}
    </div>
    {loading && <p role="status">Carregando histórico…</p>}
    {error && <div className="cs-actions"><p className="gia-notice" role="alert">Não foi possível consultar o histórico deste cliente.</p>
      <button type="button" className="gia-action-link" onClick={onReload}>Tentar novamente</button>
    </div>}
    {!loading && !error && !entries.length && <p className="gia-empty" role="status">Nenhum acontecimento disponível neste recorte.</p>}
    {entries.length > 0 && <ol className="cs-summary cs-timeline">
      {(completeHref ? entries.slice(0, 5) : entries).map(({ id, source: origin, at, title, entry }) => <li key={id}>
        <div><h3>{timelineSources[origin]} · {title}</h3>
          {entry && <p className="gia-caption">{entry.score == null ? 'Sem nota' : `${entry.score} / 100`} · {HEALTH[entry.health] || 'Sem leitura'} · {SIGNAL[entry.signal] || 'Sem sinal'}</p>}
        </div>
        <time dateTime={at}>{dateTime(at)}</time>
      </li>)}
    </ol>}
  </section>;
}

function ConversationEvidence({ reading }) {
  if (!reading) return null;
  const signals = conversationSignals(reading).map(key => SIGNAL[key]);
  return <p className="gia-caption cs-reading-evidence">
    Janela até <time dateTime={reading.source_at}>{dateTime(reading.source_at)}</time> · Tom {READING_TONE[reading.tone]?.toLowerCase() || 'indeterminado'}
    {signals.length > 0 && ` · ${signals.join(' · ')}`}
  </p>;
}

function History({ rows, loading, error }) {
  const [period, setPeriod] = useState(30);
  const visible = historyWindow(rows, period);
  return <details className="gia-panel cs-diary">
    <summary>Consultar diário de saúde por período</summary>
    <div className="gia-segments" role="group" aria-label="Período do diário">
      {[7, 30, 90].map((days) => <button key={days} type="button" aria-pressed={days === period} onClick={() => setPeriod(days)}>{days} dias</button>)}
    </div>
    {loading && <p role="status">Carregando avaliações…</p>}
    {error && <p className="gia-caption">Avaliações indisponíveis.</p>}
    {!loading && !error && !visible.length && <p className="gia-empty" role="status">Nenhuma avaliação diária registrada neste período.</p>}
    {visible.length > 0 && <ul className="cs-summary cs-history">
      {visible.map((entry) => {
        const conversation = Array.isArray(entry.factors) && entry.factors.find(part => part.key === 'conversas');
        return <li key={entry.operational_date}>
          <time dateTime={entry.captured_at}>{dateTime(entry.captured_at)}</time>
          <CsHealth health={entry.health} /><strong>{entry.score ?? '—'}</strong><span className="gia-caption">{SIGNAL[entry.signal] || '—'}</span>
          {conversation && <div className="cs-reading-evidence">
            <strong>Conversas · {conversation.score} / 100 · {conversation.weight}% da nota</strong>
            <ConversationEvidence reading={conversation.reading} />
          </div>}
        </li>;
      })}
    </ul>}
  </details>;
}

function Overview({ row, signal, canOpenAtlas, onOpenAtlas, modules }) {
  const [question, setQuestion] = useState('');
  const factors = Array.isArray(row.factors) ? row.factors : [];

  return <div className="cs-detail-grid">
    <section className="gia-panel gia-stack" aria-labelledby="cs-current-signal">
      <div>
        <p className="gia-eyebrow">Sinal atual</p><h2 id="cs-current-signal">{signal}</h2>
        <p className="gia-caption">{row.group_status === 'linked' && row.channel_following !== false
          ? row.awaiting_since ? `Cliente aguarda a equipe desde ${dateTime(row.awaiting_since)}.` : `Última atividade no grupo · ${dateTime(row.last_activity_at)}.`
          : groupStatus(row)}</p>
      </div>
      <div className="cs-actions">
        {canOpenAtlas && <button type="button" className="gia-action-link" onClick={() => onOpenAtlas('analysis')}><Sparkles aria-hidden="true" /> Analisar com Atlas</button>}
        {modules.tasks === true && <Link className="gia-action-link" to="?aba=tarefas">Ver tarefas <ArrowUpRight aria-hidden="true" /></Link>}
      </div>
      {canOpenAtlas && <>
        <div className="cs-actions">
          <button type="button" className="gia-action-link" onClick={() => onOpenAtlas('approach')}>Preparar abordagem</button>
          <button type="button" className="gia-action-link" onClick={() => onOpenAtlas('meeting')}>Preparar reunião</button>
        </div>
        <form className="cs-actions cs-question" onSubmit={(event) => {
          event.preventDefault();
          if (question.trim()) onOpenAtlas('question', question.trim());
        }}>
          <label className="cs-filter"><span>Pergunta para o Atlas</span><input value={question} maxLength={1000} onChange={(event) => setQuestion(event.target.value)} /></label>
          <button type="submit" className="gia-action-link" disabled={!question.trim()}>Abrir rascunho</button>
        </form>
        <p className="gia-caption">Revise o rascunho no Atlas antes de enviar.</p>
      </>}
    </section>
    <section className="gia-panel" aria-labelledby="cs-score-factors">
      <div className="gia-section-heading"><h2 id="cs-score-factors">Fatores da saúde</h2><CsHealth health={row.health} /></div>
      <p className="gia-caption">A nota considera os fatores com dados disponíveis.</p>
      {factors.length ? <ul className="cs-summary cs-factors">{factors.map(({ key, label, score, weight, reading }) => <li key={key}>
        <div><strong>{label}</strong><span className="gia-caption">{weight}% do cálculo</span></div>
        <meter min={0} max={100} value={score} aria-label={label}>{score}</meter><strong>{score}</strong>
        <ConversationEvidence reading={reading} />
      </li>)}</ul> : <p className="gia-empty">Ainda não há dados suficientes para calcular a nota.</p>}
    </section>
  </div>;
}

function Conversation({ row, canManage, onTeamChange, onGroupChange }) {
  const group = linkedGroupUrl(row);
  return <section className="gia-panel gia-stack">
    <h2>Conversas e atendimento</h2>
    <p>{groupLabel(row)}</p>
    {group && <dl className="cs-facts">
      <div><dt>Última atividade</dt><dd>{dateTime(row.last_activity_at)}</dd></div>
      {row.group_departure_at && <div><dt>Última saída de participante</dt><dd>{dateTime(row.group_departure_at)}</dd></div>}
      <div><dt>Cliente aguarda a equipe desde</dt><dd>{dateTime(row.awaiting_since)}</dd></div>
      <div><dt>Espera no expediente</dt><dd>{row.wait_minutes == null ? 'Sem espera registrada' : `${row.wait_minutes} min`}</dd></div>
    </dl>}
    {!group && <p className="gia-caption">{row.group_status === 'unavailable' ? 'A conversa vinculada está indisponível para esta sessão.' : 'Vincule um grupo para acompanhar a atividade.'}</p>}
    <div className="cs-actions">
      <CsIaGroupMembers key={JSON.stringify([row.conversation_id, row.wa_client_id, row.channel_id, row.group_jid])}
        row={row} canManage={canManage} onTeamChange={onTeamChange} />
      {group && <Link className="gia-action-link" to={group}>Abrir grupo no Atendimento <ArrowUpRight aria-hidden="true" /></Link>}
      {canManage && <CsIaGroupBinding row={row} onSaved={onGroupChange} />}
    </div>
  </section>;
}

export default function CsIaClient({ row, history, historyLoading, historyError, onReloadHistory, canManage, modules, canOpenAtlas, onSaveStatus, onOpenAtlas, onChurn, conversationReading, tasks, onGroupChange, source }) {
  const [params] = useSearchParams();
  const { state } = useLocation();
  const portfolioSearch = typeof state?.csPortfolioSearch === 'string' ? state.csPortfolioSearch : '';
  const tabState = state?.csClientAction ? { ...state, csClientAction: undefined } : state;
  const [editing, setEditing] = useState(canManage && state?.csClientAction === 'assessment');
  const [closing, setClosing] = useState(canManage && state?.csClientAction === 'close');
  const [saved, setSaved] = useState(false);
  const assessmentTrigger = useRef(null);
  const churnTrigger = useRef(null);
  const tab = sections.find(([key]) => key === params.get('aba'))?.[0] || 'resumo';
  const client = row.client_id;
  const signal = SIGNAL[primaryCsSignal(row)] || 'Sem leitura';
  const lastActivity = row.group_status === 'linked' ? row.last_activity_at : null;
  const files = ATLAS_DEMANDS_ENABLED ? `${buildClientHubUrl(client)}?aba=arquivos`
    : modules.projects === true ? buildClientProjectsUrl(client) : null;
  function tabLocation(key) {
    const next = new URLSearchParams(params);
    if (key === 'resumo') next.delete('aba');
    else next.set('aba', key);
    return { search: next.toString() };
  }

  return <div className="gia-stack cs-section cs-client">
    <Link to={{ pathname: '/cs-ia/carteira', search: portfolioSearch }} className="gia-action-link cs-back"><ArrowLeft aria-hidden="true" /> Carteira</Link>
    <header className="gia-header cs-header">
      <div><p className="gia-eyebrow">CS IA · Ficha do cliente</p><h1>{row.client_name}</h1><p className="cs-subtitle">{ownerLabel(row)} · {groupLabel(row)}</p></div>
      <div className="cs-actions">
        <Link to={buildClientHubUrl(client)} className="gia-action-link">Abrir ficha no Planeje <ArrowUpRight aria-hidden="true" /></Link>
        {canManage && <button ref={assessmentTrigger} type="button" className="gia-action-link" onClick={() => { setEditing(true); setSaved(false); }}><Pencil aria-hidden="true" /> Editar avaliação</button>}
        {canManage && <button ref={churnTrigger} type="button" className="gia-action-link cs-close-action" onClick={() => setClosing(true)}>Encerrar acompanhamento</button>}
      </div>
    </header>
    <div className="gia-kpis cs-kpis">
      <article><span>Saúde</span><strong>{row.score == null ? 'Sem leitura' : `${row.score} / 100`}</strong><CsHealth health={row.health} /></article>
      <article><span>Última atividade</span><strong>{dateTime(lastActivity)}</strong><small>{groupStatus(row)}</small>
        {lastActivity && tab !== 'conversas' && <Link className="gia-action-link cs-back" to={tabLocation('conversas')}>Ver atividade do grupo</Link>}
      </article>
      <article><span>Sinal atual</span><strong>{signal}</strong><small>{row.manual_status ? `Status manual · ${HEALTH[row.manual_status]}` : 'Sem status manual'}</small></article>
    </div>
    <nav className="gia-client-tabs" aria-label="Seções da ficha de CS">
      {sections.filter(([key]) => key !== 'tarefas' || modules.tasks === true).map(([key, label]) =>
        <Link key={key} to={tabLocation(key)} state={tabState} aria-current={key === tab ? 'page' : undefined}>{label}</Link>)}
    </nav>
    {saved && <p className="cs-success" role="status">Avaliação salva.</p>}
    {tab === 'resumo' && <Overview row={row} signal={signal} canOpenAtlas={canOpenAtlas} onOpenAtlas={onOpenAtlas} modules={modules} />}
    {(tab === 'resumo' || tab === 'historico') && <Timeline row={row} history={history} loading={historyLoading} error={historyError}
      onReload={onReloadHistory} completeHref={tab === 'resumo' ? tabLocation('historico') : null} />}
    {tab === 'conversas' && <>
      <Conversation row={row} canManage={canManage} onTeamChange={conversationReading?.onReload} onGroupChange={onGroupChange} />
      {conversationReading && <CsIaConversationReading key={row.conversation_id || 'unlinked'} linked={row.group_status === 'linked'} {...conversationReading} />}
    </>}
    {tab === 'crm' && (modules.crm === true ? <CsIaClientSources crm href={buildClientCrmUrl(client)} source={source} />
      : <section className="gia-panel gia-stack"><h2>CRM do cliente</h2><p className="gia-caption">O CRM está indisponível para esta sessão.</p></section>)}
    {tab === 'historico' && <History rows={history?.daily || []} loading={historyLoading} error={historyError} />}
    {tab === 'arquivos' && (ATLAS_DEMANDS_ENABLED ? <CsIaClientSources href={files} source={source} />
      : <section className="gia-panel gia-stack"><h2>Arquivos do cliente</h2>
        {files ? <Link className="gia-action-link cs-back" to={files}>Ver arquivos dos projetos <ArrowUpRight aria-hidden="true" /></Link> : <p className="gia-caption">A consulta de arquivos está indisponível para esta sessão.</p>}
      </section>)}
    {tab === 'metas' && (modules.paid_traffic === true
      ? <Suspense fallback={<p className="gia-caption" role="status">Carregando metas…</p>}><CsIaGoals clientId={client} modules={modules} /></Suspense>
      : <section className="gia-panel gia-stack"><h2>Metas do cliente</h2>
        {canManage && modules.clients === true ? <Link className="gia-action-link cs-back" to={`${buildClientEditUrl(client)}?secao=metas`}>Abrir metas de tráfego na ficha <ArrowUpRight aria-hidden="true" /></Link>
          : <p className="gia-caption">A configuração de metas está indisponível para esta sessão.</p>}
      </section>)}
    {tab === 'tarefas' && (modules.tasks === true ? <CsIaTasks row={row} {...tasks} />
      : <p className="gia-notice" role="alert">Tarefas está indisponível para esta sessão.</p>)}
    {canManage && editing && <AssessmentEditor status={row.manual_status} onClose={() => {
      setEditing(false);
      requestAnimationFrame(() => assessmentTrigger.current?.focus());
    }} onSave={async (value) => {
      await onSaveStatus(value);
      setSaved(true);
    }} />}
    {canManage && closing && <CsIaChurnEditor clientName={row.client_name} onSave={onChurn} onClose={() => {
      setClosing(false);
      requestAnimationFrame(() => churnTrigger.current?.focus());
    }} />}
  </div>;
}
