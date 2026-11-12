import { useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import {
  countBy,
  countByWeek,
  gridColumns,
  presetForNicho,
  resolveMiniCrmSetup,
  rowFromContact,
  statusLabel,
  summarizeMiniCrm,
} from '@/lib/miniCrm';

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function percent(value) {
  return (Number(value) || 0).toLocaleString('pt-BR', { style: 'percent', maximumFractionDigits: 1 });
}

function weekLabel(iso) {
  const [year, month, day] = String(iso || '').split('-');
  if (!day) return iso;
  return `${day}/${month}/${year.slice(2)}`;
}

function Breakdown({ title, items }) {
  const max = Math.max(...items.map((item) => item.leads), 1);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li key={item.label}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium text-slate-800">{item.label}</span>
              <span className="shrink-0 text-xs text-slate-500">
                {item.leads} leads
                {item.vendas ? ` · ${item.vendas} vendas` : ''}
                {item.valor ? ` · ${money(item.valor)}` : ''}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-1.5 rounded-full bg-slate-800"
                style={{ width: `${Math.max(6, Math.round((item.leads / max) * 100))}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MiniCrmBoard({ summary, rows, statuses, detailsOnly = false }) {
  if (!summary) return null;
  const cards = [
    { label: 'Leads', value: summary.leads },
    summary.qualificados != null && { label: 'Qualificados', value: summary.qualificados },
    summary.noShow != null && { label: 'Não compareceu', value: summary.noShow },
    { label: 'Agendamentos', value: summary.agendamentos },
    { label: 'Vendas', value: summary.vendas },
    summary.valor != null && { label: 'Valor vendido', value: money(summary.valor) },
    { label: 'Conversão', value: percent(summary.conversao) },
    { label: 'Ticket médio', value: money(summary.ticket || 0) },
  ].filter(Boolean);
  const byStatus = countBy(rows, 'status').map((item) => ({
    ...item,
    label: item.label === '—' ? 'Sem status' : (statusLabel(statuses, item.label) || item.label),
  }));
  const bySeller = countBy(rows, 'vendedor').map((item) => ({
    ...item,
    label: item.label === '—' ? 'Sem vendedor' : item.label,
  }));
  const byWeek = countByWeek(rows);

  return (
    <div className="space-y-4">
      {detailsOnly ? null : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cards.map((card) => (
            <article key={card.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
              <p className="text-xs font-medium text-slate-500">{card.label}</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{card.value}</p>
            </article>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {byStatus.length > 0 ? <Breakdown title="Por status" items={byStatus} /> : null}
        {bySeller.length > 0 ? <Breakdown title="Por vendedor" items={bySeller} /> : null}
      </div>
      {byWeek.length > 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-sm font-semibold text-slate-800">Por semana</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {byWeek.map((item) => (
              <div key={item.label}>
                <p className="text-xs text-slate-500">{weekLabel(item.label)}</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{item.leads}</p>
                <p className="text-xs text-slate-500">{item.vendas ? `${item.vendas} vendas` : 'leads'}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function useMiniCrmSummary(clienteId, from, to) {
  const [state, setState] = useState({ ready: !clienteId, summary: null, rows: [], statuses: [] });

  useEffect(() => {
    if (!clienteId || !from || !to) {
      setState({ ready: true, summary: null, rows: [], statuses: [] });
      return undefined;
    }
    let cancelled = false;
    setState((current) => ({ ...current, ready: false }));
    (async () => {
      const [{ data: client }, { data: config }, { data: contacts, error }] = await Promise.all([
        supabase.from('clientes').select('nicho').eq('id', clienteId).maybeSingle(),
        supabase.from('mini_crm_config').select('statuses, columns, sellers').eq('cliente_id', clienteId).maybeSingle(),
        supabase
          .from('cliente_whatsapp_contact')
          .select('id, sender_name, phone, from_jid, origin_source, utm_source, tracking_data, first_seen_at, mini_crm')
          .eq('cliente_id', clienteId)
          .gte('first_seen_at', from.toISOString())
          .lte('first_seen_at', to.toISOString())
          .limit(5000),
      ]);
      if (cancelled) return;
      if (error || !contacts?.length) {
        setState({ ready: true, summary: null, rows: [], statuses: [] });
        return;
      }
      const preset = presetForNicho(client?.nicho || '');
      const setup = resolveMiniCrmSetup(preset, config, []);
      const columns = gridColumns(preset, setup.columns);
      const rows = contacts.map(rowFromContact);
      setState({
        ready: true,
        summary: summarizeMiniCrm(rows, columns),
        rows,
        statuses: setup.statuses || [],
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [clienteId, from, to]);

  return state;
}
