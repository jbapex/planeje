import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { RefreshCw, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ContatosMessagePeriodPicker from '@/components/crm/ContatosMessagePeriodPicker';
import RastreamentoLeadFicha from '@/components/crm/RastreamentoLeadFicha';
import { RastreamentoSectionTitle } from '@/components/crm/RastreamentoUi';
import { supabase } from '@/lib/customSupabaseClient';
import { fetchGoogleTrackingReport, summarizeGoogleReport, fetchSiteTrackingReport, summarizeSiteReport, reportUtmSource } from '@/lib/crmRelatorioGoogle';
import { displayEventosPhone, formatEventosWhen } from '@/lib/rastreamentoEventosMeta';
import { siteOriginLabel } from '@/lib/rastreamentoTrackableLink';

const money = (value, currency = 'BRL') => value == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currency || 'BRL' }).format(value);
const surface = 'rounded-2xl border border-slate-200/70 bg-white shadow-[0_2px_4px_rgba(15,23,42,0.04),0_6px_16px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-card';
const th = 'p-3 text-left font-medium text-muted-foreground whitespace-nowrap';
const td = 'p-3 tabular-nums';

export default function CrmRelatorioGoogle({ clienteId, dateRange, onDateRangeChange, platform = 'google' }) {
  const site = platform === 'site';
  const label = site ? 'Site' : 'Google';
  const since = dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : '';
  const until = dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : since;
  const scope = `${platform}:${clienteId}:${since}:${until}`;
  const [result, setResult] = useState(null);
  const [revision, setRevision] = useState(0);
  const [filter, setFilter] = useState('__all__');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const changed = useRef(false);

  useEffect(() => {
    let active = true;
    setResult(null); setFilter('__all__'); setPage(1); setSelected(null); changed.current = false;
    const fetchReport = site ? fetchSiteTrackingReport : fetchGoogleTrackingReport;
    fetchReport(supabase, { clienteId, since, until }).then(
      (data) => { if (active) setResult({ scope, data }); },
      () => { if (active) setResult({ scope, error: `Não foi possível carregar o relatório ${label}. Tente atualizar.` }); },
    );
    return () => { active = false; };
  }, [clienteId, since, until, scope, revision, site, label]);

  const current = result?.scope === scope ? result : null;
  const report = useMemo(() => current?.data ? (site ? summarizeSiteReport(current.data, filter) : summarizeGoogleReport(current.data, current.data.spending, filter)) : null, [current, filter, site]);
  const loading = !current;
  const currency = current?.data?.spending?.currency;
  const metrics = report?.summary;
  const pages = Math.max(1, Math.ceil((report?.rows.length || 0) / 25));
  const rows = report?.rows.slice((page - 1) * 25, page * 25) || [];
  const values = metrics ? [
    [`Total de leads (${label})`, metrics.leads], ['Conversas reais', metrics.realConversations],
    ...(!site ? [['Gasto (Google Ads)', money(metrics.spend, currency)]] : []), ['Qualificados', metrics.qualificados],
    ['Não responde', metrics.naoResponde], ['Desqualificado', metrics.desqualificado],
    ['Vendas', metrics.vendas], ['Valor total', money(metrics.valorTotal)],
    ...(!site ? [['CPL', money(metrics.cpl, currency)], ['ROAS', metrics.roas == null ? '—' : `${metrics.roas.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}x`]] : []),
  ] : [];
  return <div className="flex min-w-0 flex-col gap-4 px-4 py-4 sm:px-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <RastreamentoSectionTitle title={`Relatórios ${label}`} help={site
          ? 'Contatos com primeira origem Site registrada. Clique numa fonte para filtrar por utm_source. Sem source informado significa origem Site sem esse parâmetro. Leads, vendas e etiquetas usam a última atividade; conversas reais e qualificados usam a primeira mensagem. Google e Meta ficam nas suas próprias abas.'
          : 'Somente origem Google. Leads, vendas e etiquetas usam a última atividade no período. Conversas reais e qualificados usam a primeira mensagem recebida no WhatsApp, como na Meta. Gasto vem das contas Google vinculadas. Campanha sem identificação ou vínculo inequívoco fica sem custo associado. ROAS compara valores em reais.'} />
        <p className="mt-1 text-sm text-muted-foreground">{since && until ? `${since.split('-').reverse().join('/')} – ${until.split('-').reverse().join('/')}` : 'Selecione um período'}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ContatosMessagePeriodPicker fromIso={since} toIso={until} onChangePeriod={({ from, to }) => onDateRangeChange(from && to ? { from: new Date(`${from}T12:00:00`), to: new Date(`${to}T12:00:00`) } : undefined)} />
        <Button variant="secondary" disabled={loading} onClick={() => setRevision((value) => value + 1)}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Atualizar relatório {label}
        </Button>
      </div>
    </div>
    {loading ? <div role="status" className="flex items-center justify-center gap-2 py-16 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" />Carregando relatório {label}…</div>
      : current.error ? <p role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive">{current.error}</p>
        : <>
          {current.data.spending?.message ? <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">{current.data.spending.message}</p> : null}
          {!site && <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-muted/20 px-3 py-2.5">
            <label htmlFor="google-report-campaign" className="text-sm font-medium">Campanha Google</label>
            <Select value={filter} onValueChange={(value) => { setFilter(value); setPage(1); }}>
              <SelectTrigger id="google-report-campaign" className="w-full sm:w-80"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="__all__">Todas as campanhas</SelectItem>{report.options.map((row) => <SelectItem key={row.key} value={row.key}>{row.name}{row.key.startsWith('utm:') ? '' : ` · ${row.key.split(':')[0]}`}</SelectItem>)}</SelectContent>
            </Select>
          </div>}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3 lg:grid-cols-5">{values.map(([label, value]) => <Card key={label} className={`${surface} min-w-0`}><CardContent className="p-3.5"><p className="text-sm font-medium text-muted-foreground">{label}</p><p className="mt-1 break-words text-xl font-bold leading-tight tabular-nums">{value}</p></CardContent></Card>)}</div>
          {site ? <section className="min-w-0 space-y-3" aria-label="Leads por origem (utm_source)">
            <h3 className="text-lg font-semibold">Leads por origem <span className="text-sm font-normal text-muted-foreground">(utm_source)</span></h3>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-3">
              {[{ key: '__all__', name: 'Todas as fontes', leads: current.data.rows.length }, ...report.sources].map((source) => <button
                key={source.key} type="button" aria-pressed={filter === source.key} onClick={() => { setFilter(source.key); setPage(1); }}
                className={`${surface} flex min-h-16 min-w-0 items-center justify-between gap-3 px-3.5 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:border-violet-300 aria-pressed:border-violet-300 aria-pressed:bg-violet-50/60 aria-pressed:ring-1 aria-pressed:ring-violet-500 dark:aria-pressed:bg-violet-950/20`}>
                <span className="min-w-0 break-all text-sm font-medium">{source.name}</span><span className="shrink-0 text-xl font-bold tabular-nums">{source.leads}</span>
              </button>)}
            </div>
          </section> : <section className="min-w-0 space-y-3" aria-label="Campanhas Google">
            <h3 className="text-lg font-semibold">Por campanha</h3>
            <div className={`${surface} overflow-x-auto`}>
              <table className="w-full text-sm"><thead><tr className="border-b bg-muted/40">{['Campanha', 'Leads', 'Conversas reais', 'Qualificados', 'Vendas', 'Valor', 'Gasto', 'CPL', 'ROAS'].map((label) => <th key={label} className={th}>{label}</th>)}</tr></thead>
                <tbody>{report.campaigns.length ? report.campaigns.map((row) => <tr key={row.key} className="border-b last:border-0">
                  <td className={`${td} min-w-[190px]`}><span className="font-medium">{row.name}</span><small className="block text-muted-foreground">{row.key.startsWith('utm:') ? 'UTM sem vínculo com campanha da conta' : `Conta ${row.key.split(':')[0]}`}</small></td>
                  {[row.leads, row.realConversations, row.qualificados, row.vendas, money(row.valorTotal), money(row.spend, currency), money(row.cpl, currency), row.roas == null ? '—' : `${row.roas.toFixed(2)}x`].map((value, index) => <td key={index} className={`${td} whitespace-nowrap`}>{value}</td>)}
                </tr>) : <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Nenhuma campanha Google no período.</td></tr>}</tbody>
              </table>
            </div>
          </section>}
          <section className="min-w-0 space-y-3" aria-label={`Leads ${label}`}>
            <h3 className="text-lg font-semibold">Leads {label} <span className="text-sm font-normal text-muted-foreground">({report.rows.length})</span></h3>
            <div className={`${surface} overflow-x-auto`}><table className="w-full text-sm"><thead><tr className="border-b bg-muted/40">{['Contato', 'Telefone', ...(site ? ['Origem (source)'] : []), 'Campanha / UTM', 'Última mensagem', 'Qualificado', 'Comprou'].map((label) => <th key={label} className={th}>{label}</th>)}</tr></thead>
              <tbody>{rows.length ? rows.map((row) => <tr key={row.key} className="border-b last:border-0">
                <td className={td}><button type="button" className="text-left font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setSelected({ scope, row })}>{row.name || 'Contato sem nome'}</button></td>
                <td className={`${td} whitespace-nowrap`}>{displayEventosPhone(row.phone)}</td>{site && <td className={td}>{reportUtmSource(row) || 'Sem source informado'}</td>}<td className={td}>{row.utm_campaign || row.tracking_data?.utm_campaign || (site ? '—' : 'Sem campanha identificada')}</td><td className={`${td} whitespace-nowrap`}>{formatEventosWhen(row.lastAt)}</td>
                <td className={td}>{row.qualificado === true ? 'Sim' : row.qualificado === false ? 'Não' : 'Pendente'}</td><td className={td}>{row.comprou === true ? 'Sim' : row.comprou === false ? 'Não' : 'Pendente'}</td>
              </tr>) : <tr><td colSpan={site ? 7 : 6} className="p-6 text-center text-muted-foreground">Nenhum lead {label} com os filtros atuais.</td></tr>}</tbody>
            </table></div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground"><span>Página {page} de {pages}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</Button><Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Próxima</Button></div></div>
          </section>
        </>}
    <RastreamentoLeadFicha open={Boolean(selected && selected.scope === scope)} onOpenChange={(open) => {
      if (!open) { setSelected(null); if (changed.current) setRevision((value) => value + 1); }
    }} clienteId={clienteId} originLabel={site ? siteOriginLabel(selected?.row.utm_source, selected?.row.tracking_data?.utm_source) : 'Google Ads'} contact={selected?.scope === scope ? selected.row._contactRow : null} lead={selected?.scope === scope ? selected.row._leadRef : null}
      onComercialSaved={() => { changed.current = true; }} onAnalysisLabelsSaved={() => { changed.current = true; }} />
  </div>;
}
