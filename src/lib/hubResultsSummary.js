/**
 * Resumo da Visão geral: leads/vendas pelos contatos WhatsApp (30 dias)
 * e gasto pelas contas Meta ligadas — sem exigir funil publicado.
 */
import { parseMetaConnection } from './rastreamentoMetaManual.js';

export function emptyHubLeads() {
  return { unique: 0, qualificados: 0, vendas: 0, valorTotal: 0 };
}

export function emptyHubSpend() {
  return { meta: 0, google: 0, total: 0 };
}

/** Meia-noite local do dia → ISO (timestamptz). */
export function periodBoundsIso(sinceYmd, untilYmd) {
  const parse = (iso, endOfDay) => {
    const [y, m, d] = String(iso || '').split('-').map(Number);
    if (!y || !m || !d) return null;
    return endOfDay
      ? new Date(y, m - 1, d, 23, 59, 59, 999)
      : new Date(y, m - 1, d, 0, 0, 0, 0);
  };
  const start = parse(sinceYmd, false);
  const end = parse(untilYmd, true);
  if (!start || !end) return { sinceIso: '', untilIso: '' };
  return { sinceIso: start.toISOString(), untilIso: end.toISOString() };
}

export function collectAdAccountIds(raw) {
  const parsed = parseMetaConnection(raw);
  const ids = new Set();
  const push = (value) => {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits) ids.add(`act_${digits}`);
  };
  (parsed.adAccountIds || []).forEach(push);
  (parsed.adAccounts || []).forEach((row) => push(row?.id));
  return [...ids];
}

export function sumInsightSpend(rows) {
  if (!Array.isArray(rows)) return 0;
  return rows.reduce((sum, row) => sum + (Number(row?.spend) || 0), 0);
}

export function mergeHubResults({
  functionResult = null,
  contactSummary = null,
  accountSpend = 0,
} = {}) {
  const leads = contactSummary && typeof contactSummary.unique === 'number'
    ? {
        unique: contactSummary.unique || 0,
        qualificados: contactSummary.qualificados || 0,
        vendas: contactSummary.vendas || 0,
        valorTotal: contactSummary.valorTotal || 0,
      }
    : {
        ...emptyHubLeads(),
        ...(functionResult?.leads || {}),
      };

  const fnSpend = functionResult?.spend || emptyHubSpend();
  const metaFromFn = Number(fnSpend.meta) || 0;
  const google = Number(fnSpend.google) || 0;
  const account = Number(accountSpend) || 0;
  const meta = metaFromFn > 0 ? metaFromFn : account;
  const spend = {
    meta,
    google,
    total: meta + google,
  };

  const unique = Number(leads.unique) || 0;
  const valorTotal = Number(leads.valorTotal) || 0;
  return {
    spend,
    leads,
    cpl: unique > 0 ? spend.total / unique : 0,
    roas: spend.total > 0 ? valorTotal / spend.total : 0,
  };
}

export async function fetchHubContactSummary(client, { clienteId, sinceIso, untilIso }) {
  const scoped = (query) =>
    query
      .eq('cliente_id', clienteId)
      .gte('last_message_at', sinceIso)
      .lte('last_message_at', untilIso);

  const [uniqueRes, qualRes, salesRes] = await Promise.all([
    scoped(
      client.from('cliente_whatsapp_contact').select('id', { count: 'exact', head: true }),
    ),
    scoped(
      client
        .from('cliente_whatsapp_contact')
        .select('id', { count: 'exact', head: true })
        .eq('qualificado', true),
    ),
    scoped(
      client
        .from('cliente_whatsapp_contact')
        .select('valor_venda', { count: 'exact' })
        .eq('comprou', true),
    ),
  ]);

  const valorTotal = (salesRes.data || []).reduce(
    (sum, row) => sum + (parseFloat(String(row?.valor_venda ?? 0)) || 0),
    0,
  );

  return {
    unique: uniqueRes.count || 0,
    qualificados: qualRes.count || 0,
    vendas: salesRes.count || 0,
    valorTotal,
    error: uniqueRes.error?.message || qualRes.error?.message || salesRes.error?.message || null,
  };
}

export async function fetchHubAccountSpend(invokeFn, { clienteId, adAccountIds, since, until }) {
  const ids = Array.isArray(adAccountIds) ? adAccountIds : [];
  if (!ids.length) return { total: 0, errors: [] };

  const results = await Promise.all(
    ids.map(async (adAccountId) => {
      const { data, error } = await invokeFn('meta-ads-api', {
        body: {
          action: 'get-campaign-insights',
          cliente_id: clienteId,
          ad_account_id: adAccountId,
          time_range: { since, until },
          metrics: ['spend'],
        },
      });
      if (error) return { spend: 0, error: error.message || 'insights' };
      if (data?.error?.message) return { spend: 0, error: data.error.message };
      return { spend: sumInsightSpend(data?.campaigns), error: null };
    }),
  );

  return {
    total: results.reduce((sum, row) => sum + (row.spend || 0), 0),
    errors: results.map((row) => row.error).filter(Boolean),
  };
}
