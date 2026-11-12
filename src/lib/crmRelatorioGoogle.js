import { isMetaAdsContactForStats, isMetaAdsLeadForStats } from './contactFromWebhookPayload.js';
import { isGoogleAdsContactForStats, recordedOriginSource } from './rastreamentoTrackableLink.js';
import { getPhoneVariations } from './leadUtils.js';
import { resolveComercialState, isVendaComercial, vendaValorComercial } from './leadComercial.js';
import { timestampInSaoPauloRange } from './rastreamentoPeriod.js';
import { bumpAnalysisCounts } from './rastreamentoAnalysisLabels.js';
import { googleAdsAccountsForPicker } from './googleAdsLinkedAccounts.js';

const text = (...values) => values.find((v) => typeof v === 'string' && v.trim())?.trim() || '';
const phone = (row) => row.phone || row.whatsapp || String(row.from_jid || '').split('@')[0];
function google(row, lead = false) {
  const origin = recordedOriginSource(row, lead);
  if (origin === 'google_ads') return true;
  if (origin === 'meta_ads' || origin === 'site') return false;
  if (lead ? isMetaAdsLeadForStats(row) : isMetaAdsContactForStats(row)) return false;
  return isGoogleAdsContactForStats(row);
}
const inPeriod = (at, { since, until }) => timestampInSaoPauloRange(Date.parse(at || ''), since, until);

/** Commercial state may come from the linked lead; attribution stays with the original row. */
function buildTrackingReportRows(contacts, leads, period, matchesOrigin) {
  const leadPhones = new Map();
  for (const lead of leads) for (const key of getPhoneVariations(phone(lead))) {
    const matches = leadPhones.get(key) || new Set(); matches.add(lead); leadPhones.set(key, matches);
  }
  const allPhones = new Set(contacts.flatMap((row) => getPhoneVariations(phone(row))));
  const normalize = (row, lead, isContact) => ({
    ...row, ...resolveComercialState({ contact: isContact ? row : null, lead }),
    key: `${isContact ? 'contact' : 'lead'}:${row.id}`,
    name: text(row.mini_crm?.contato_nome, row.tracking_data?.lead_name, row.sender_name, row.nome, lead?.nome) || phone(row),
    phone: phone(row), _contactRow: isContact ? row : null, _leadRef: lead,
    firstAt: isContact ? row.first_seen_at : row.data_entrada ? `${String(row.data_entrada).slice(0, 10)}T00:00:00-03:00` : row.created_at,
    lastAt: isContact ? row.last_message_at : row.ultima_interacao || row.updated_at || row.created_at,
  });
  const normalized = contacts.filter((row) => matchesOrigin(row, false)).map((row) => {
    const matches = new Set(getPhoneVariations(phone(row)).flatMap((key) => [...(leadPhones.get(key) || [])]));
    return normalize(row, matches.size === 1 ? [...matches][0] : null, true);
  });
  for (const lead of leads) {
    if (matchesOrigin(lead, true) && !getPhoneVariations(phone(lead)).some((key) => allPhones.has(key))) normalized.push(normalize(lead, lead, false));
  }
  return {
    rows: normalized.filter((row) => inPeriod(row.lastAt, period)),
    trackingRows: normalized.filter((row) => row._contactRow && inPeriod(row.firstAt, period)),
  };
}

export function buildGoogleReportRows(contacts = [], leads = [], period) {
  return buildTrackingReportRows(contacts, leads, period, google);
}

export function buildSiteReportRows(contacts = [], leads = [], period) {
  return buildTrackingReportRows(contacts, leads, period, (row, lead) => recordedOriginSource(row, lead) === 'site');
}

export const reportUtmSource = (row) => text(row.utm_source, row.tracking_data?.utm_source);
const sourceKey = (row) => `source:${reportUtmSource(row)}`;

export function summarizeSiteReport(data, selectedSource = '__all__') {
  const sources = new Map();
  for (const row of [...data.rows, ...data.trackingRows]) {
    const key = sourceKey(row);
    if (!sources.has(key)) sources.set(key, { key, name: reportUtmSource(row) || 'Sem source informado', leads: 0 });
  }
  for (const row of data.rows) sources.get(sourceKey(row)).leads += 1;
  const matches = (row) => selectedSource === '__all__' || sourceKey(row) === selectedSource;
  const rows = data.rows.filter(matches), trackingRows = data.trackingRows.filter(matches);
  const summary = { leads: rows.length, realConversations: trackingRows.length,
    qualificados: trackingRows.filter((row) => row.qualificado === true).length,
    vendas: 0, valorTotal: 0, naoResponde: 0, desqualificado: 0 };
  for (const row of rows) {
    if (isVendaComercial(row)) { summary.vendas += 1; summary.valorTotal += vendaValorComercial(row); }
    bumpAnalysisCounts(summary, row);
  }
  return { summary, rows, sources: [...sources.values()].sort((a, b) => b.leads - a.leads || a.name.localeCompare(b.name, 'pt-BR')) };
}

function campaignFor(row, campaigns) {
  const td = row.tracking_data || {};
  const token = text(row.utm_campaign, td.utm_campaign, td.google_campaign_name, td.campaign_name);
  const id = text(td.google_campaign_id, td.campaign_id) || (/^\d+$/.test(token) ? token : '');
  const accountId = text(td.google_customer_id).replace(/-/g, '');
  const matches = campaigns.filter((campaign) => (!accountId || campaign.accountId === accountId)
    && (id ? campaign.id === id : token && campaign.name === token));
  return matches.length === 1 ? { key: `${matches[0].accountId}:${matches[0].id}`, name: matches[0].name }
    : { key: `utm:${accountId}:${id || token}`.replace(/^utm::/, 'utm:'), name: token || (id ? `Campanha ${id}` : 'Sem campanha identificada') };
}

export function summarizeGoogleReport(data, spending, campaignKey = '__all__') {
  const groups = new Map();
  const empty = (key, name, spend = null) => ({ key, name, leads: 0, realConversations: 0, qualificados: 0, vendas: 0, valorTotal: 0, naoResponde: 0, desqualificado: 0, spend });
  for (const campaign of spending.campaigns) {
    const key = `${campaign.accountId}:${campaign.id}`;
    groups.set(key, empty(key, campaign.name, spending.available ? campaign.spend : null));
  }
  const groupOf = (row) => {
    const identity = campaignFor(row, spending.campaigns);
    if (!groups.has(identity.key)) groups.set(identity.key, empty(identity.key, identity.name));
    return groups.get(identity.key);
  };
  for (const row of data.rows) {
    const group = groupOf(row); group.leads += 1;
    if (isVendaComercial(row)) { group.vendas += 1; group.valorTotal += vendaValorComercial(row); }
    bumpAnalysisCounts(group, row);
  }
  for (const row of data.trackingRows) { const group = groupOf(row); group.realConversations += 1; if (row.qualificado === true) group.qualificados += 1; }
  const options = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const selected = campaignKey === '__all__' ? options : options.filter((row) => row.key === campaignKey);
  const summary = empty('all', 'Total');
  for (const row of selected) for (const key of ['leads', 'realConversations', 'qualificados', 'vendas', 'valorTotal', 'naoResponde', 'desqualificado']) summary[key] += row[key];
  summary.spend = spending.available && (campaignKey === '__all__' || (selected.length > 0 && selected.every((row) => row.spend != null)))
    ? (campaignKey === '__all__' ? spending.campaigns.reduce((sum, row) => sum + row.spend, 0) : selected.reduce((sum, row) => sum + row.spend, 0)) : null;
  const rates = (row) => ({ ...row, cpl: row.spend != null && row.leads > 0 ? row.spend / row.leads : null,
    roas: spending.currency === 'BRL' && row.spend > 0 ? row.valorTotal / row.spend : null });
  return { summary: rates(summary), campaigns: selected.map(rates), options,
    rows: data.rows.filter((row) => campaignKey === '__all__' || campaignFor(row, spending.campaigns).key === campaignKey) };
}

const CONTACT_FIELDS = 'id,cliente_id,from_jid,phone,sender_name,mini_crm,origin_source,utm_source,utm_campaign,utm_medium,utm_content,utm_term,first_seen_at,last_message_at,tracking_data,qualificado,comprou,valor_venda,instance_name';
const LEAD_FIELDS = 'id,cliente_id,nome,whatsapp,origem,utm_source,utm_campaign,utm_medium,utm_content,utm_term,created_at,updated_at,ultima_interacao,data_entrada,tracking_data,qualificado,comprou,valor,status,etiquetas';

async function readAll(client, table, fields, clienteId) {
  const rows = [], seen = new Set(); let count = null, offset = 0;
  do {
    const response = await client.from(table).select(fields, { count: 'exact' }).eq('cliente_id', clienteId)
      .order('id', { ascending: true }).range(offset, offset + 499);
    if (response.error) throw response.error;
    if (!Number.isInteger(response.count) || response.count < 0) throw new Error('Não foi possível confirmar o total do relatório.');
    if (count == null) count = response.count;
    else if (count !== response.count) throw new Error('Os dados mudaram durante a leitura. Atualize o relatório.');
    const page = response.data || [];
    if ((!page.length && rows.length < count) || page.some((row) => seen.has(row.id))) throw new Error('Leitura incompleta. Atualize o relatório.');
    page.forEach((row) => seen.add(row.id)); rows.push(...page); offset += page.length;
    if (rows.length > 200000) throw new Error('O relatório excedeu o limite de leitura completa.');
  } while (rows.length < count);
  return rows;
}

async function readSpending(client, clienteId, period) {
  const unavailable = (message, campaigns = []) => ({ available: false, currency: null, message, campaigns });
  try {
    const linked = await client.from('cliente_google_ads_accounts').select('cliente_id,google_customer_id,google_customer_name')
      .eq('cliente_id', clienteId).eq('is_active', true);
    if (linked.error) throw linked.error;
    const accounts = googleAdsAccountsForPicker(linked.data, clienteId);
    if (!accounts.length) return unavailable('Nenhuma conta Google Ads ativa vinculada. Os leads continuam disponíveis.');
    const results = await Promise.allSettled(accounts.map(async (account) => {
      if (!/^\d+$/.test(account.id)) throw new Error('Conta Google inválida.');
      const { data, error } = await client.functions.invoke('google-ads-api', {
        body: { action: 'get-campaigns', customerId: account.id, time_range: period },
      });
      if (error || data?.error) throw error || new Error(data.error.message || 'Falha na conta Google.');
      if (!Array.isArray(data?.campaigns) || !/^[A-Z]{3}$/.test(data.currency || '')) throw new Error('Resposta de gasto incompleta.');
      const seen = new Set();
      const campaigns = data.campaigns.map((row) => {
        if (!/^\d+$/.test(String(row.id || '')) || row.spend == null || row.spend === '' || !Number.isFinite(Number(row.spend)) || Number(row.spend) < 0 || seen.has(String(row.id))) throw new Error('Gasto de campanha indisponível.');
        seen.add(String(row.id));
        return { id: String(row.id), name: String(row.name || `Campanha ${row.id}`), accountId: account.id, spend: Number(row.spend), currency: data.currency };
      });
      return { campaigns, currency: data.currency };
    }));
    const campaigns = results.flatMap((result) => result.status === 'fulfilled' ? result.value.campaigns : []);
    if (results.some((result) => result.status === 'rejected')) return unavailable('Não foi possível carregar todas as contas Google. Gasto e custos indisponíveis.', campaigns);
    const currencies = new Set(results.map((result) => result.value.currency));
    if (currencies.size !== 1) return unavailable('As contas usam moedas diferentes. Não somamos valores sem conversão.', campaigns);
    return { available: true, currency: [...currencies][0], campaigns, message: '' };
  } catch { return unavailable('Não foi possível carregar o gasto do Google Ads. Os leads continuam disponíveis.'); }
}

function validatePeriod({ clienteId, since, until }) {
  if (!clienteId || !/^\d{4}-\d{2}-\d{2}$/.test(since) || !/^\d{4}-\d{2}-\d{2}$/.test(until) || since > until) throw new Error('Selecione cliente e período válidos.');
  return { since, until };
}

export async function fetchGoogleTrackingReport(client, { clienteId, since, until }) {
  const period = validatePeriod({ clienteId, since, until });
  const [contacts, leads, spending] = await Promise.all([
    readAll(client, 'cliente_whatsapp_contact', CONTACT_FIELDS, clienteId),
    readAll(client, 'leads', LEAD_FIELDS, clienteId), readSpending(client, clienteId, period),
  ]);
  return { ...buildGoogleReportRows(contacts, leads, period), spending };
}

export async function fetchSiteTrackingReport(client, { clienteId, since, until }) {
  const period = validatePeriod({ clienteId, since, until });
  const [contacts, leads] = await Promise.all([
    readAll(client, 'cliente_whatsapp_contact', CONTACT_FIELDS, clienteId),
    readAll(client, 'leads', LEAD_FIELDS, clienteId),
  ]);
  return buildSiteReportRows(contacts, leads, period);
}
