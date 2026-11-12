import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { META_AD_IDENTITY_FIELDS, mergeMetaAdEnrichment, metaAccountId, metaAdIdentity, metaAdIds } from '../../supabase/functions/_shared/metaAdEnrichment.js';
import { periodBoundsSaoPaulo } from '../../src/lib/rastreamentoPeriod.js';

const usage = 'Use --cliente UUID --since YYYY-MM-DD --until YYYY-MM-DD [--limit 1..500] [--apply]. Padrão: dry-run, 100 contatos; período máximo de 93 dias.';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const day = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

function validateOptions(options) {
  if (!options || !uuid.test(options.clientId || '') || !day(options.since) || !day(options.until)
    || Date.parse(options.until) < Date.parse(options.since) || Date.parse(options.until) - Date.parse(options.since) > 92 * 86400000
    || !Number.isInteger(options.limit) || options.limit < 1 || options.limit > 500 || typeof options.apply !== 'boolean') throw new Error(usage);
  return options;
}

export function parseBackfillArgs(argv) {
  const values = {}, keys = { '--cliente': 'clientId', '--since': 'since', '--until': 'until', '--limit': 'limit' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i], key = Object.hasOwn(keys, arg) ? keys[arg] : arg === '--apply' ? 'apply' : '';
    if (!key || Object.hasOwn(values, key)) throw new Error(usage);
    if (key === 'apply') values.apply = true;
    else {
      const value = argv[++i];
      if (!value || value.startsWith('--') || key === 'limit' && !/^\d+$/.test(value)) throw new Error(usage);
      values[key] = key === 'limit' ? Number(value) : value;
    }
  }
  return validateOptions({ limit: 100, apply: false, ...values });
}

async function readMetaToken(db) {
  const token = process.env.META_SYSTEM_USER_ACCESS_TOKEN?.trim();
  if (token) return token;
  const { data, error } = await db.rpc('get_encrypted_secret', { p_secret_name: 'META_SYSTEM_USER_ACCESS_TOKEN' });
  if (error || typeof data !== 'string' || !data.trim()) throw new Error('Credencial Meta indisponível.');
  return data.trim();
}

export async function runBackfillMetaAttribution({ db, options, fetchGraph = fetch, readToken = () => readMetaToken(db) }) {
  validateOptions(options);
  const report = { scanned: 0, eligible: 0, updated: 0, complete: 0, missingAd: 0, conflicts: 0, unlinked: 0, failed: 0, rateLimited: 0, concurrent: 0, queried: 0, truncated: 0 };
  const bounds = periodBoundsSaoPaulo(options.since, options.until);
  const { data: rows, error } = await db.from('cliente_whatsapp_contact').select('id,tracking_data,updated_at')
    .eq('cliente_id', options.clientId).gte('first_seen_at', bounds.sinceIso).lte('first_seen_at', bounds.untilIso)
    .order('first_seen_at').order('id').limit(options.limit + 1);
  if (error || !Array.isArray(rows)) throw new Error('Não foi possível consultar o lote de contatos.');
  report.truncated = Number(rows.length > options.limit);
  const found = new Map();
  let token;
  for (const row of rows.slice(0, options.limit)) {
    report.scanned++;
    const ids = metaAdIds(row.tracking_data);
    if (!ids.length) { report.missingAd++; continue; }
    if (ids.length !== 1 || typeof ids[0] !== 'string' || !/^\d{1,32}$/.test(ids[0])) { report.conflicts++; continue; }
    const saved = mergeMetaAdEnrichment(row.tracking_data, row.tracking_data?.meta_ad_details);
    if (saved.status === 'conflict') { report.conflicts++; continue; }
    if (saved.status === 'unchanged') { report.complete++; continue; }
    const adId = ids[0];
    if (!found.has(adId)) {
      report.queried++;
      try {
        token ||= await readToken();
        if (typeof token !== 'string' || !token.trim()) throw new Error('Credencial indisponível.');
        const params = new URLSearchParams({ fields: META_AD_IDENTITY_FIELDS });
        const response = await fetchGraph(`https://graph.facebook.com/v24.0/${adId}?${params}`, {
          method: 'GET', headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(15000),
        });
        if (response.status === 429) { report.rateLimited++; break; }
        const data = await response.json();
        if ([4, 17, 32, 613, 80004].includes(Number(data?.error?.code))) {
          report.rateLimited++; break;
        }
        found.set(adId, response.ok && !data?.error && data?.id === adId ? { ad: data } : null);
      } catch { found.set(adId, null); }
    }
    const details = found.get(adId);
    if (!details) { report.failed++; continue; }
    const next = mergeMetaAdEnrichment(row.tracking_data, details, new Date().toISOString());
    if (next.status === 'conflict') { report.conflicts++; continue; }
    if (next.status === 'invalid') { report.failed++; continue; }
    if (next.status === 'unchanged') { report.complete++; continue; }
    const account = metaAccountId(metaAdIdentity(details.ad).account_id);
    const { data: links, error: linkError } = await db.from('cliente_meta_accounts').select('meta_account_id')
      .eq('cliente_id', options.clientId).eq('is_active', true).in('meta_account_id', [account, `act_${account}`]).limit(1);
    if (linkError) { report.failed++; continue; }
    if (!links?.length) { report.unlinked++; continue; }
    report.eligible++;
    if (!options.apply) continue;
    if (!row.updated_at) { report.concurrent++; continue; }
    const { data: updated, error: saveError } = await db.from('cliente_whatsapp_contact')
      .update({ tracking_data: next.tracking, updated_at: new Date().toISOString() }).eq('cliente_id', options.clientId)
      .eq('id', row.id).eq('updated_at', row.updated_at).select('id').maybeSingle();
    if (saveError) report.failed++;
    else if (!updated) report.concurrent++;
    else report.updated++;
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length === 3 && process.argv[2] === '--help') console.log(usage);
    else {
      const options = parseBackfillArgs(process.argv.slice(2));
      const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) throw new Error('Credenciais do destino indisponíveis.');
      const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      console.log(JSON.stringify(await runBackfillMetaAttribution({ db, options })));
    }
  } catch {
    console.error(`Backfill não concluído. Confira acesso e credenciais no ambiente. ${usage}`);
    process.exitCode = 1;
  }
}
