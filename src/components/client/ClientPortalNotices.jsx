import React, { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/customSupabaseClient';
import { listPortalNotices, PORTAL_NOTICE_PAGE_SIZE } from '@/lib/gestorIaPortalNotices';

const publishedDate = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short' });

export function usePortalNoticePages(managerClientId) {
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [reading, setReading] = useState(null);
  const key = JSON.stringify([managerClientId, offset, revision]);
  const page = reading?.key === key ? reading : null;
  useEffect(() => {
    let active = true;
    listPortalNotices(supabase, offset, managerClientId).then((rows) => { if (active) setReading({ key, rows }); })
      .catch((error) => { if (active) setReading({ key, error: error.message }); });
    return () => { active = false; };
  }, [key, managerClientId, offset]);
  return { page, offset, setOffset, reload: () => setRevision((value) => value + 1) };
}

export function PortalNoticeList({ pages, action }) {
  const { page, offset, setOffset, reload } = pages;
  const rows = page?.rows || [];
  return <>
    {!page ? <p role="status" className="text-sm text-muted-foreground">Consultando avisos…</p> : page.error ?
      <div className="flex flex-wrap items-center gap-2"><p role="alert" className="text-sm">{page.error}</p>
        <Button variant="outline" size="sm" type="button" onClick={reload}>Tentar novamente</Button></div>
      : rows.length ? <ul className="divide-y">{rows.slice(0, PORTAL_NOTICE_PAGE_SIZE).map((row) => <li key={row.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
        <details className="min-w-0 flex-1">
          <summary className="cursor-pointer text-sm font-medium [overflow-wrap:anywhere]">{row.title}</summary>
          <p className="mt-2 whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{row.message}</p>
        </details>
        <time className="shrink-0 text-xs text-muted-foreground" dateTime={row.published_at}>{publishedDate.format(new Date(row.published_at))}</time>
        {action?.(row)}
      </li>)}</ul> : <p className="text-sm text-muted-foreground">Nenhum aviso publicado.</p>}
    {(offset > 0 || rows.length > PORTAL_NOTICE_PAGE_SIZE) && <div className="mt-2 flex justify-end gap-2" aria-label="Paginação dos avisos">
      <Button variant="outline" size="sm" type="button" disabled={!offset || !page} onClick={() => setOffset(offset - PORTAL_NOTICE_PAGE_SIZE)}>Anterior</Button>
      <Button variant="outline" size="sm" type="button" disabled={rows.length <= PORTAL_NOTICE_PAGE_SIZE} onClick={() => setOffset(offset + PORTAL_NOTICE_PAGE_SIZE)}>Próxima</Button>
    </div>}
  </>;
}

export default function ClientPortalNotices() {
  const pages = usePortalNoticePages();
  if (!pages.offset && !pages.page?.rows?.length && !pages.page?.error) return null;
  return <Card role="region" aria-label="Avisos do Gestor">
    <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Bell className="h-4 w-4" aria-hidden="true" />Avisos do Gestor</CardTitle></CardHeader>
    <CardContent><PortalNoticeList pages={pages} /></CardContent>
  </Card>;
}
