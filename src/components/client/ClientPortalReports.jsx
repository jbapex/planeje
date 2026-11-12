import React, { useEffect, useRef, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/customSupabaseClient';
import { GESTOR_PDF_LABELS, GESTOR_PDF_PAGE_SIZE, listGestorPortalPdfs, readGestorReportPdf } from '@/lib/gestorIaReportArchive';
import { reportPdfFileName } from '@/lib/trafficPerformanceReportPdf';

const day = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' });
const publicationDay = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' });
const periodLabel = (row) => `${day.format(new Date(row.period_since))} a ${day.format(new Date(row.period_until))}`;

export default function ClientPortalReports({ clientId }) {
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [reading, setReading] = useState(null);
  const [downloading, setDownloading] = useState(null);
  const [downloadError, setDownloadError] = useState('');
  const attempt = useRef(null);
  const key = JSON.stringify([clientId, offset, revision]);
  const result = reading?.key === key ? reading : null;
  const rows = result?.rows || [];

  useEffect(() => {
    let active = true;
    listGestorPortalPdfs(supabase, clientId, offset).then((items) => {
      if (active) setReading({ key, rows: items });
    }).catch(() => { if (active) setReading({ key, error: true }); });
    return () => { active = false; };
  }, [clientId, offset, key]);

  useEffect(() => () => attempt.current?.abort(), []);

  const reload = () => { setOffset(0); setRevision((value) => value + 1); };

  async function download(row) {
    if (attempt.current) return;
    const request = new AbortController();
    attempt.current = request;
    setDownloading(row.id);
    setDownloadError('');
    try {
      const file = await readGestorReportPdf(supabase, row.path, request.signal);
      if (request.signal.aborted) return;
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = reportPdfFileName('Desempenho', `${row.period_since}_${row.period_until}`);
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      if (!request.signal.aborted) {
        setDownloadError('PDF indisponível.');
        reload();
      }
    } finally {
      attempt.current = null;
      if (!request.signal.aborted) setDownloading(null);
    }
  }

  if (offset === 0 && !rows.length && !result?.error && !downloadError) return null;

  return <Card role="region" aria-label="Relatórios de desempenho">
    <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4" aria-hidden="true" />Relatórios de desempenho</CardTitle></CardHeader>
    <CardContent className="space-y-2">
      {downloadError && <p role="alert" className="text-sm text-muted-foreground">{downloadError}</p>}
      {!result ? <p className="text-sm text-muted-foreground" role="status">Carregando relatórios…</p> : result.error ?
        <div className="flex flex-wrap items-center gap-2"><p role="alert" className="text-sm">Não foi possível consultar os relatórios.</p>
          <Button type="button" variant="outline" size="sm" onClick={reload}>Tentar novamente</Button></div> : rows.length ?
          <ul className="divide-y">{rows.slice(0, GESTOR_PDF_PAGE_SIZE).map((row) => <li key={row.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
            <div><p className="text-sm font-medium">{GESTOR_PDF_LABELS[row.source]} · {periodLabel(row)}</p>
              <p className="text-xs text-muted-foreground">Publicado em {publicationDay.format(new Date(row.published_at))}</p></div>
            <Button type="button" variant="outline" size="sm" disabled={Boolean(downloading)} onClick={() => download(row)} aria-label={`Baixar PDF · ${GESTOR_PDF_LABELS[row.source]} · ${periodLabel(row)}`}>
              <Download className="mr-1 h-4 w-4" aria-hidden="true" />{downloading === row.id ? 'Preparando…' : 'Baixar PDF'}
            </Button>
          </li>)}</ul> : <p className="text-sm text-muted-foreground">Nenhum relatório nesta página.</p>}
      {(offset > 0 || rows.length > GESTOR_PDF_PAGE_SIZE) && <div className="flex justify-end gap-2" aria-label="Paginação dos relatórios">
        <Button type="button" variant="outline" size="sm" disabled={!offset || !result || Boolean(downloading)} onClick={() => setOffset(offset - GESTOR_PDF_PAGE_SIZE)}>Anterior</Button>
        <Button type="button" variant="outline" size="sm" disabled={rows.length <= GESTOR_PDF_PAGE_SIZE || Boolean(downloading)} onClick={() => setOffset(offset + GESTOR_PDF_PAGE_SIZE)}>Próxima</Button>
      </div>}
    </CardContent>
  </Card>;
}
