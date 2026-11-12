import React, { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { GESTOR_PDF_LABELS, GESTOR_PDF_PAGE_SIZE, listGestorReportPdfs, readGestorReportPdf, reviewGestorReportPdf, setGestorReportPublication } from '@/lib/gestorIaReportArchive';
import { reportPdfFileName } from '@/lib/trafficPerformanceReportPdf';
import { periodLabel, readingTime } from './GestorIaContext';
import GestorIaDrawer from './GestorIaDrawer';

function ReportPdfDetail({ client, row, close, onUpdate, reload }) {
  const [file, setFile] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [refreshRequired, setRefreshRequired] = useState(false);
  const reviewedAt = row.reviewed_at;
  const period = { since: row.period_since, until: row.period_until };

  useEffect(() => {
    let active = true;
    let url;
    readGestorReportPdf(supabase, row.path).then((blob) => {
      if (!active) return;
      url = URL.createObjectURL(blob);
      setFile({ url });
    }).catch((failure) => { if (active) setFile({ error: failure.message }); });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [row.path]);

  const review = async () => {
    if (!file?.url || reviewedAt || pending) return;
    setPending(true);
    setError('');
    try {
      onUpdate({ reviewed_at: await reviewGestorReportPdf(supabase, row) });
    } catch (failure) {
      setError(failure.message);
    } finally {
      setPending(false);
    }
  };

  const publish = async (visible) => {
    if (!reviewedAt || pending || refreshRequired || (visible && !file?.url)) return;
    setPending(true);
    setError('');
    try {
      onUpdate(await setGestorReportPublication(supabase, row, visible));
      setConfirm(false);
    } catch (failure) {
      setError(failure.message);
      setRefreshRequired(true);
    } finally {
      setPending(false);
    }
  };

  return <GestorIaDrawer label="PDF do Gestor IA" title={client.empresa} close={close} busy={pending}>
    <p>{GESTOR_PDF_LABELS[row.source]} · {periodLabel(period)}</p>
    <p className="gia-caption">Gerado em {readingTime(row.generated_at)}</p>
    {file?.url ? <div className="gia-header-actions">
      <a className="gia-action-link gia-primary-action" href={file.url} target="_blank" rel="noopener noreferrer">Abrir PDF</a>
      <a className="gia-action-link" href={file.url} download={reportPdfFileName(client.empresa, `${period.since}_${period.until}`)}>Baixar PDF</a>
    </div> : file?.error ? <p className="gia-notice" role="alert">{file.error}</p> : <p role="status">Preparando PDF…</p>}
    {reviewedAt ? <p role="status">Revisado em {readingTime(reviewedAt)}</p> : <button type="button" className="gia-action-link" disabled={!file?.url || pending} onClick={review}>
      {pending ? 'Registrando revisão…' : 'Marcar como revisado'}
    </button>}
    {Number.isSafeInteger(row.publication_revision) && <section className="gia-stack border-t border-[var(--gia-line)] pt-3" aria-label="Portal do cliente">
      <div className="gia-section-heading"><h3>Portal do cliente</h3>
        <span role="status" className={`gia-delivery${row.published_at ? ' is-active' : ''}`}>{row.published_at ? 'Publicado' : 'Interno'}</span></div>
      {row.published_at ? <>
        <p className="gia-caption">Disponível no Dashboard desde {readingTime(row.published_at)}.</p>
        <div><button className="gia-action-link" type="button" disabled={pending || refreshRequired} onClick={() => publish(false)}>Retirar do portal</button></div>
      </> : !reviewedAt ? <p className="gia-caption">Marque o PDF como revisado para publicar.</p> : confirm ? <>
        <p>Este PDF ficará visível no Dashboard dos logins de {client.empresa} com acesso à página.</p>
        <div className="gia-header-actions">
          <button className="gia-action-link" type="button" disabled={pending} onClick={() => setConfirm(false)}>Cancelar</button>
          <button className="gia-action-link gia-primary-action" type="button" disabled={pending || refreshRequired} onClick={() => publish(true)}>{pending ? 'Publicando…' : 'Confirmar publicação'}</button>
        </div>
      </> : <div><button className="gia-action-link" type="button" disabled={!file?.url || pending || refreshRequired} onClick={() => setConfirm(true)}>Publicar no portal</button></div>}
    </section>}
    {error && <p className="gia-notice" role="alert">{error}</p>}
    {refreshRequired && <button className="gia-action-link" type="button" onClick={() => { close(); reload(); }}>Atualizar arquivo</button>}
  </GestorIaDrawer>;
}

export default function GestorIaSavedReports({ client, period }) {
  const [reviewed, setReviewed] = useState(null);
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [reading, setReading] = useState(null);
  const [opened, setOpened] = useState(null);
  const { id: clientId } = client;
  const { since, until } = period;
  const key = JSON.stringify([clientId, since, until, reviewed, offset, revision]);
  const entry = reading?.key === key ? reading : null;

  useEffect(() => {
    let active = true;
    listGestorReportPdfs(supabase, clientId, { since, until }, reviewed, offset).then((rows) => {
      if (active) setReading({ key, rows });
    }).catch((error) => { if (active) setReading({ key, error: error.message }); });
    return () => { active = false; };
  }, [clientId, key, offset, reviewed, since, until]);

  const rows = entry?.rows || [];
  const reload = () => setRevision((value) => value + 1);
  return <div className="gia-stack" aria-label="Arquivo de PDFs">
    <div className="gia-pills" aria-label="Estado dos PDFs">
      {[[null, 'Todos'], [false, 'Para revisar'], [true, 'Revisados']].map(([value, label]) => <button key={label} type="button" aria-pressed={reviewed === value}
        onClick={() => { setReviewed(value); setOffset(0); }}>{label}</button>)}
    </div>
    {!entry ? <p className="gia-status" role="status">Carregando PDFs…</p>
      : entry.error ? <div className="gia-notice" role="alert">{entry.error} <button className="gia-action-link" type="button" onClick={() => setRevision((value) => value + 1)}>Tentar de novo</button></div>
        : rows.length ? <div className="gia-table-wrap gia-report-table gia-table-frame"><table>
          <caption className="sr-only">PDFs gerados para {client.empresa}</caption>
          <thead><tr><th scope="col">Período</th><th scope="col">Fonte</th><th scope="col">Gerado em</th><th scope="col">Revisão</th><th scope="col">Portal</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
          <tbody>{rows.slice(0, GESTOR_PDF_PAGE_SIZE).map((row) => <tr key={row.id}>
            <td>{periodLabel({ since: row.period_since, until: row.period_until })}</td><td>{GESTOR_PDF_LABELS[row.source]}</td>
            <td>{readingTime(row.generated_at)}</td><td><span className={`gia-delivery${row.reviewed_at ? ' is-active' : ''}`}>{row.reviewed_at ? 'Revisado' : 'Gerado'}</span></td>
            <td><span className={`gia-delivery${row.published_at ? ' is-active' : ''}`}>{row.published_at ? 'Publicado' : 'Interno'}</span></td>
            <td><button type="button" className="gia-action-link" aria-haspopup="dialog" onClick={() => setOpened(row)}><FileText aria-hidden="true" />Ver arquivo</button></td>
          </tr>)}</tbody>
        </table></div> : <div className="gia-empty"><FileText aria-hidden="true" /><h3>Nenhum PDF neste recorte</h3><p>Monte um relatório e use Salvar no Gestor.</p></div>}
    {(offset > 0 || rows.length > GESTOR_PDF_PAGE_SIZE) && <div className="gia-header-actions" aria-label="Paginação dos PDFs">
      <button type="button" className="gia-action-link" disabled={offset === 0 || !entry} onClick={() => setOffset((value) => value - GESTOR_PDF_PAGE_SIZE)}>Anterior</button>
      <span className="gia-caption">Página {Math.floor(offset / GESTOR_PDF_PAGE_SIZE) + 1}</span>
      <button type="button" className="gia-action-link" disabled={rows.length <= GESTOR_PDF_PAGE_SIZE} onClick={() => setOffset((value) => value + GESTOR_PDF_PAGE_SIZE)}>Próxima</button>
    </div>}
    {opened && <ReportPdfDetail key={opened.id} client={client} row={opened} close={() => setOpened(null)} reload={reload}
      onUpdate={(changes) => { setOpened((row) => row ? { ...row, ...changes } : row); reload(); }} />}
  </div>;
}
