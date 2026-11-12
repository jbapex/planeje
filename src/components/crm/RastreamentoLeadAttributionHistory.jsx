import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/customSupabaseClient';
import { appendAttributionHistory, fetchLeadAttributionHistory } from '@/lib/rastreamentoLeadAttributionHistory';
import { siteOriginLabel } from '@/lib/rastreamentoTrackableLink';

const fields = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'fbclid', 'ctwa_clid', 'ad_id', 'source_id', 'planeje_click_id'];
const origins = { google_ads: 'Google Ads', meta_ads: 'Meta Ads', site: 'Site' };
const formatDate = (value) => new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });

export default function RastreamentoLeadAttributionHistory({ clienteId, contact }) {
  const [rows, setRows] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const busy = useRef(false);
  const mounted = useRef(false);
  const fromJid = contact.from_jid;
  const contactId = contact.id;
  const load = useCallback(async (nextCursor = null) => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setError(null);
    const result = await fetchLeadAttributionHistory(supabase, { clienteId, fromJid, contactId, cursor: nextCursor });
    if (mounted.current) {
      setError(result.error);
      if (!result.error) {
        setRows((current) => nextCursor ? appendAttributionHistory(current, result.rows) : result.rows);
        setCursor(result.nextCursor);
      }
      setLoading(false);
    }
    busy.current = false;
  }, [clienteId, fromJid, contactId]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; };
  }, [load]);

  return <section className="rt-lead-ficha__attr" aria-label="Histórico de origens" aria-busy={loading}>
    <div className="flex items-center justify-between gap-2">
      <h3>Histórico de origens</h3>
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Atualizar histórico de origens" disabled={loading} onClick={() => void load()}>
        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
      </Button>
    </div>
    <p className="mb-3 text-xs text-muted-foreground">A primeira origem permanece principal. Novas entradas ficam guardadas com suas datas.</p>
    {error ? <p role="alert" className="mb-2 text-sm text-destructive">{error} Use atualizar para tentar novamente.</p> : null}
    {loading && rows.length === 0 ? <p role="status" className="text-sm text-muted-foreground">Carregando origens…</p> : null}
    {!loading && !error && rows.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma entrada registrada no histórico.</p> : null}
    <ol className="space-y-2">
      {rows.map((row) => {
        const attribution = row.attribution || {};
        const timeLabel = row.clicked_at ? 'Clique' : row.message_at ? 'Mensagem' : 'Horário de recebimento';
        return <li key={row.id}>
          <details className="min-w-0 rounded-xl border p-3 text-sm">
            <summary className="cursor-pointer break-words rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <strong>{row.origin_source === 'site' ? siteOriginLabel(attribution.utm_source) : origins[row.origin_source] || 'Origem registrada'}</strong>
              <span className="mt-1 block text-xs text-muted-foreground">{timeLabel} · <time dateTime={row.event_at}>{formatDate(row.event_at)}</time></span>
              {attribution.utm_campaign || attribution.campaign_name ? <span className="mt-1 block">{attribution.utm_campaign || attribution.campaign_name}</span> : null}
            </summary>
            <dl className="mt-3 space-y-2 [overflow-wrap:anywhere]">
              {fields.filter((field) => attribution[field]).map((field) => <div key={field}>
                <dt className="text-xs text-muted-foreground">{field}</dt><dd>{attribution[field]}</dd>
              </div>)}
            </dl>
            {attribution.method === 'initial_message' ? <p className="mt-2 text-xs text-muted-foreground">Origem identificada pela mensagem do link; clique individual não identificado.</p> : null}
            {!row.clicked_at && !row.message_at ? <p className="mt-2 text-xs text-muted-foreground">Horário original indisponível; exibido o recebimento no Planeje.</p> : null}
          </details>
        </li>;
      })}
    </ol>
    {cursor ? <Button type="button" variant="outline" size="sm" className="mt-3 w-full" disabled={loading} onClick={() => void load(cursor)}>{loading ? 'Carregando…' : 'Carregar mais origens'}</Button> : null}
  </section>;
}
