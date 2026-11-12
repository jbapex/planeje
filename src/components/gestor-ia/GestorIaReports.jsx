import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, FileText, LineChart, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useModuleSettings } from '@/contexts/ModuleSettingsContext';
import { buildGestorAtlasDraft, GESTOR_ATLAS_CONVERSATION } from '@/lib/gestorIaAtlasDraft';
import { canUseGestorReportArchive } from '@/lib/gestorIaReportArchive';
import { date, number, periodLabel } from './GestorIaContext';
import GestorIaDrawer from './GestorIaDrawer';
import GestorIaReportModels, { ClientReportModel, useClientReportModel } from './GestorIaReportModels';
import GestorIaSavedReports from './GestorIaSavedReports';
import { reportEditor } from './gestorIaClientModel';
import { useGestorAtlasContext } from './useGestorAtlas';

function useReportArchiveAccess() {
  const { profile, canViewField } = useAuth();
  const { moduleSettings, loading } = useModuleSettings();
  return !loading && canUseGestorReportArchive(profile, moduleSettings, canViewField);
}

function ReportSections({ section, onChange, allowModels }) {
  return <div className="gia-list-toolbar"><div className="gia-segments" aria-label="Seções do relatório">
    {[['pdfs', 'Arquivo de PDFs'], ['rotina', 'Análises da rotina'], ...(allowModels ? [['modelos', 'Modelos']] : [])].map(([key, label]) => <button type="button" key={key}
      aria-pressed={section === key} onClick={() => onChange(key)}>{label}</button>)}
  </div></div>;
}

export function RecordedEvolution({ state }) {
  const rows = state.reviews || [];
  const measured = rows.filter((r) => r.investment != null && Number.isFinite(Number(r.investment)));
  const max = Math.max(...measured.map((r) => Number(r.investment)), 1);
  return <section className="gia-panel"><div className="gia-section-heading"><h2>Investimento por semana</h2><span className="gia-caption">Rotina do Planeje</span></div>
    {state.loading ? <p role="status">Consultando análises…</p> : state.error ? <p role="alert">{state.error}</p> : !measured.length ? <p className="gia-empty">Nenhuma evolução registrada para as semanas deste período.</p> : <ul className="gia-chart" aria-label="Investimento registrado por semana">{measured.map((r) => <li key={r.id}><span>{date(r.week_start)}</span><div className="gia-bar-track" aria-hidden="true"><i style={{ width: `${Math.max(0, Number(r.investment)) / max * 100}%` }} /></div><strong>{number(r.investment, 2)}</strong></li>)}</ul>}
  </section>;
}

export function GestorIaReportActions({ client, period, reviews, readStore }) {
  const { canViewField } = useAuth();
  const canArchive = useReportArchiveAccess();
  const scope = useGestorAtlasContext(client.id, readStore);
  const template = useClientReportModel(readStore, client.id, canArchive);
  const { model, models, binding, pending } = template;
  const canDraft = !canArchive || !(pending || models.error || binding.error);
  const needsRoutine = model?.include_routine !== false;
  const draft = scope && canDraft && (!needsRoutine || !reviews.loading && !reviews.error) ? buildGestorAtlasDraft({ ...scope, purpose: 'report', period,
    reviews: reviews.reviews || [], reportModel: model, canSeeSpend: canViewField?.('valor') === true }) : null;
  return <>
    {canArchive && !pending && <ClientReportModel key={client.id} client={client} model={model} models={models} binding={binding} />}
    {draft && <Link className="gia-action-link" to={GESTOR_ATLAS_CONVERSATION} state={draft}><Sparkles aria-hidden="true" />Redigir com Atlas</Link>}
    <Link className="gia-action-link gia-primary-action" to={reportEditor(client.id, period)}><FileText aria-hidden="true" />Montar relatório</Link>
  </>;
}

export function ClientReportArchive({ client, reviews, validPeriod, period, filters, readStore }) {
  const canArchive = useReportArchiveAccess();
  const [section, setSection] = useState('pdfs');
  const showPdfs = canArchive && section === 'pdfs';
  const [status, setStatus] = useState('all');
  const [showEvolution, setShowEvolution] = useState(false);
  const [openedId, setOpenedId] = useState(null);
  const rows = validPeriod && !reviews.loading && !reviews.error ? reviews.reviews || [] : [];
  const visible = rows.filter((review) => status === 'all' || Boolean(review.finalized_at) === (status === 'final'));
  const selected = visible.find((review) => review.id === openedId);
  return <section className="gia-panel gia-report-archive">
    <div className="gia-section-heading">
      <div><h2>Relatório</h2>{!showPdfs && <p className="gia-caption">Análises registradas na rotina de tráfego deste cliente.</p>}</div>
      <div className="gia-header-actions">
        {!showPdfs && <button className="gia-action-link" type="button" aria-pressed={showEvolution} onClick={() => setShowEvolution((open) => !open)}><LineChart aria-hidden="true" />Evolução semanal</button>}
        {validPeriod && <GestorIaReportActions client={client} period={period} reviews={reviews} readStore={readStore} />}
      </div>
    </div>
    {filters}
    {canArchive && <ReportSections section={section} onChange={setSection} />}
    {showPdfs ? validPeriod && <GestorIaSavedReports client={client} period={period} /> : showEvolution ? validPeriod && <RecordedEvolution state={reviews} /> : <>
      <div className="gia-pills" aria-label="Estado das análises">
        {[['all', 'Tudo'], ['final', 'Finalizadas'], ['draft', 'Rascunhos']].map(([key, label]) => <button key={key} type="button" aria-pressed={status === key} onClick={() => { setStatus(key); setOpenedId(null); }}>{label}</button>)}
      </div>
      {validPeriod && (reviews.loading ? <p role="status" className="gia-empty">Carregando análises…</p>
        : reviews.error ? <p className="gia-notice" role="alert">{reviews.error}</p>
          : <div className="gia-stack gia-report-cards">
            <p className="gia-report-window"><span>Período</span><strong>{periodLabel(period)}</strong><span>{visible.length} {visible.length === 1 ? 'análise' : 'análises'}</span></p>
            {visible.slice().reverse().map((review) => <article className="gia-panel gia-report-card" key={review.id}>
              <div className="gia-section-heading">
                <div className="gia-inline-icon"><span className="gia-report-icon"><FileText aria-hidden="true" /></span><div><h3>{client.empresa}</h3><small className="gia-caption">Semana de {date(review.week_start)}</small></div></div>
                <span className={`gia-delivery${review.finalized_at ? ' is-active' : ''}`}>{review.finalized_at ? 'Finalizada' : 'Rascunho'}</span>
              </div>
              <p className="gia-report-excerpt">{review.analysis || 'Nenhuma análise preenchida.'}</p>
              <div className="gia-report-card-footer"><button className="gia-action-link" type="button" aria-haspopup="dialog" onClick={() => setOpenedId(review.id)}>Abrir análise</button>
                <span className="gia-caption">{number(review.investment, 2)} investido · {number(review.results)} {review.result_label || 'resultados'}</span></div>
            </article>)}
            {!visible.length && <div className="gia-empty"><h3>Nenhuma análise aqui</h3><p>Ajuste o período ou o estado para ver outras análises.</p></div>}
          </div>)}
    </>}
    {selected && !showPdfs && !showEvolution && <GestorIaDrawer label="Rotina de tráfego" title={`Análise de ${date(selected.week_start)}`} close={() => setOpenedId(null)}>
      <p className="gia-caption">{client.empresa} · {selected.finalized_at ? 'Finalizada' : 'Rascunho'}</p>
      <dl className="gia-context-grid">
        <div><dt>Investimento informado</dt><dd>{number(selected.investment, 2)}</dd></div>
        <div><dt>Contatos</dt><dd>{number(selected.contacts)}</dd></div>
        <div><dt>{selected.result_label || 'Resultados'}</dt><dd>{number(selected.results)}</dd></div>
      </dl>
      <p className="gia-prose">{selected.analysis || 'Nenhuma análise preenchida.'}</p>
      {selected.data_note && <section><h3>Observações</h3><p className="gia-prose">{selected.data_note}</p></section>}
    </GestorIaDrawer>}
  </section>;
}

export default function GestorIaReports({ client, hasClients, period, reviews, validPeriod, readStore }) {
  const canArchive = useReportArchiveAccess();
  const [section, setSection] = useState('pdfs');
  const [open, setOpen] = useState(null);
  const [view, setView] = useState('list');
  const sections = canArchive && <ReportSections section={section} onChange={setSection} allowModels />;
  if (canArchive && section === 'modelos') return <div className="gia-stack">{sections}<GestorIaReportModels readStore={readStore} /></div>;
  if (!client) return <>{sections}<div className="gia-empty"><h2>{hasClients ? 'Cliente indisponível' : 'Nenhum cliente na carteira de tráfego'}</h2></div></>;
  if (!validPeriod) return sections;
  if (canArchive && section === 'pdfs') return <div className="gia-stack">{sections}<GestorIaSavedReports client={client} period={period} /></div>;
  if (reviews.loading) return <>{sections}<p className="gia-status" role="status">Carregando análises…</p></>;
  if (reviews.error) return <>{sections}<p className="gia-notice" role="alert">{reviews.error}</p></>;
  const rows = reviews.reviews || [];
  const selected = rows.find((review) => review.id === open);
  return <div className="gia-stack">
    {sections}
    <div className="gia-list-toolbar">
      <div className="gia-segments" aria-label="Visualização dos relatórios">
        <button type="button" aria-label="Análises" aria-pressed={view === 'list'} onClick={() => setView('list')}>Análises<span>{rows.length}</span></button>
        <button type="button" aria-pressed={view === 'trend'} onClick={() => setView('trend')}>Evolução semanal</button>
      </div>
    </div>
    {view === 'trend' ? <RecordedEvolution state={reviews} /> : <>
    <div className="gia-table-wrap gia-report-table gia-table-frame"><table>
      <caption className="sr-only">Análises registradas na rotina semanal do Planeje</caption>
      <thead><tr><th scope="col">Semana</th><th scope="col">Investimento</th><th scope="col">Contatos</th><th scope="col">Resultados</th><th scope="col">Estado</th></tr></thead>
      <tbody>{rows.map((review) => <tr key={review.id}>
        <td><button type="button" className="gia-report-row gia-entity-name" aria-label={`${open === review.id ? 'Fechar' : 'Abrir'} análise de ${date(review.week_start)}`} aria-expanded={open === review.id} onClick={() => setOpen(open === review.id ? null : review.id)}><ChevronRight aria-hidden="true" />{date(review.week_start)}</button></td>
        <td>{number(review.investment, 2)}</td><td>{number(review.contacts)}</td>
        <td>{number(review.results)} {review.result_label}</td>
        <td><span className={`gia-delivery${review.finalized_at ? ' is-active' : ''}`}>{review.finalized_at ? 'Finalizada' : 'Rascunho'}</span></td>
      </tr>)}{!rows.length && <tr><td colSpan={5} className="gia-empty">Nenhuma análise neste período.</td></tr>}</tbody>
    </table></div>
    {selected && <article className="gia-panel">
      <div className="gia-section-heading"><h2>Análise de {date(selected.week_start)}</h2><span className="gia-caption">Rotina do Planeje</span></div>
      <p className="gia-prose">{selected.analysis || 'Nenhuma análise preenchida.'}</p>
      {selected.data_note && <p className="gia-prose">{selected.data_note}</p>}
      {selected.updated_at && <p className="gia-caption">Atualizada em {date(selected.updated_at)}</p>}
    </article>}
    </>}
  </div>;
}
