import { ensureSystemColumns, presetForNicho, resolveMiniCrmSetup } from './miniCrm.js';

const SELECT = 'cliente_id, statuses, columns, sellers, cadence, updated_at';
const clone = (value) => JSON.parse(JSON.stringify(value));

function orderedMerge(source, destination, preserveKind = false) {
  const destinationByKey = new Map(destination.map((item) => [item.key, item]));
  const labelKey = (item) => String(item.label || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
  const used = new Set();
  let keptTypes = 0;
  const items = [];
  source.forEach((item) => {
    const current = destinationByKey.get(item.key)
      || destination.find((candidate) => labelKey(candidate) === labelKey(item));
    const key = current?.key || item.key;
    if (used.has(key)) return;
    used.add(key);
    const next = { ...item, key };
    if (preserveKind && current && current.kind !== item.kind) { next.kind = current.kind; keptTypes += 1; }
    items.push(next);
  });
  const kept = destination.filter((item) => !used.has(item.key));
  return { items: [...items, ...kept], kept: kept.length, keptTypes };
}

export function planMiniCrmConfigCopy({ source, destination, statuses = true, columns = true }) {
  if (!source?.client?.id || !destination?.client?.id || source.client.id === destination.client.id) throw new Error('Escolha outro cliente como origem.');
  if (!statuses && !columns) throw new Error('Selecione status, colunas ou ambos.');
  const from = resolveMiniCrmSetup(presetForNicho(source.client.nicho), source.config, []);
  const to = resolveMiniCrmSetup(presetForNicho(destination.client.nicho), destination.config, []);
  const changes = {};
  const statusMerge = statuses ? orderedMerge(from.statuses, to.statuses) : null;
  const columnMerge = columns ? orderedMerge(from.columns, to.columns, true) : null;
  if (statuses) changes.statuses = statusMerge.items;
  if (columns) changes.columns = ensureSystemColumns(columnMerge.items);
  return {
    source: clone(source), destination: clone(destination),
    options: { statuses, columns }, changes: clone(changes),
    insert: { cliente_id: destination.client.id, statuses: to.statuses, columns: to.columns, sellers: to.sellers, cadence: to.cadence, ...clone(changes) },
    sourceCounts: { statuses: from.statuses.length, columns: from.columns.length },
    keptStatuses: statusMerge?.kept || 0,
    keptColumns: columnMerge?.kept || 0,
    keptColumnTypes: columnMerge?.keptTypes || 0,
  };
}

export async function readMiniCrmConfigSnapshot(db, clientId) {
  const [clientResult, configResult] = await Promise.all([
    db.from('clientes').select('id, empresa, nicho').eq('id', clientId).single(),
    db.from('mini_crm_config').select(SELECT).eq('cliente_id', clientId).maybeSingle(),
  ]);
  if (clientResult.error) throw clientResult.error;
  if (configResult.error) throw configResult.error;
  if (!clientResult.data) throw new Error('Cliente não encontrado ou sem acesso.');
  return { client: clientResult.data, config: configResult.data || null };
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

export async function applyMiniCrmConfigCopy(db, profile, plan) {
  if (profile?.role !== 'superadmin' || profile?.status !== 'active') throw new Error('Somente o Super Admin ativo pode copiar configurações.');
  const rebuilt = planMiniCrmConfigCopy({ source: plan.source, destination: plan.destination, ...plan.options });
  const [source, destination] = await Promise.all([
    readMiniCrmConfigSnapshot(db, plan.source.client.id),
    readMiniCrmConfigSnapshot(db, plan.destination.client.id),
  ]);
  const signature = (snapshot) => JSON.stringify(canonical(snapshot));
  if (signature(source) !== signature(plan.source) || signature(destination) !== signature(plan.destination)) {
    throw new Error('Uma configuração mudou. Gere a prévia novamente antes de copiar.');
  }
  const updated_at = new Date().toISOString();
  let result;
  if (destination.config) {
    let query = db.from('mini_crm_config').update({ ...rebuilt.changes, updated_at }).eq('cliente_id', destination.client.id);
    query = destination.config.updated_at == null ? query.is('updated_at', null) : query.eq('updated_at', destination.config.updated_at);
    result = await query.select('cliente_id').maybeSingle();
  } else {
    result = await db.from('mini_crm_config').insert({ ...rebuilt.insert, updated_at }).select('cliente_id').single();
  }
  if (result.error) {
    if (result.error.code === '23505') throw new Error('O destino ganhou uma configuração. Gere a prévia novamente.');
    throw result.error;
  }
  if (result.data?.cliente_id !== destination.client.id) throw new Error('A configuração mudou ou não pôde ser salva. Gere a prévia novamente.');
  return result.data;
}
