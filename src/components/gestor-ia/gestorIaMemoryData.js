import { dateRange } from '@/lib/trafficPerformanceReport';
import { decisionMemoryExcerpt, isMemoryReferenceId, memoryFitsDecisionAccount } from '../../../supabase/functions/gestor-ia-decisions/memory.js';
import { DECISION_OUTCOME_METRICS, decisionActionValue, decisionAmount, decisionDayAt } from './gestorIaDecisionOutcomeModel';
import { goalAccountId } from './gestorIaMediaGoalData';

export const GESTOR_ATLAS_MEMORY_LIMIT = 50;

async function canReadClient(db, clientId) {
  if (!clientId) return false;
  const { data, error } = await db.rpc('central_trafego_can_access_client', { p_cliente_id: clientId });
  if (error || typeof data !== 'boolean') throw new Error('Acesso ao cliente indisponível.');
  return data;
}

export async function canUseGestorAtlasMemory(db, clientId) {
  const { data, error } = await db.rpc('atlas_is_owner');
  if (error || typeof data !== 'boolean') throw new Error('Acesso ao Atlas indisponível.');
  return data && canReadClient(db, clientId);
}

export async function canStartGestorAtlas(db, { clientId, ownerId }) {
  if (!ownerId || !await canUseGestorAtlasMemory(db, clientId)) return false;
  const { data, error } = await db.from('atlas_settings').select('enabled').eq('owner_id', ownerId).maybeSingle();
  if (error) throw new Error('Acesso ao Atlas indisponível.');
  return data?.enabled === true;
}

export async function loadGestorAtlasMemories(db, { clientId, ownerId }) {
  if (!ownerId || !await canUseGestorAtlasMemory(db, clientId)) return null;
  // shortcut: lista as anotações recentes; paginar quando for necessário consultar o arquivo completo aqui.
  const { data, error } = await db.from('atlas_memories')
    .select('id,content,source,state,created_at,confirmed_at,learning_kind,team_shared,version,replaces_id')
    .eq('owner_id', ownerId).eq('client_id', clientId).eq('state', 'active')
    .order('created_at', { ascending: false }).order('id').limit(GESTOR_ATLAS_MEMORY_LIMIT);
  if (error || !Array.isArray(data)) throw new Error('Anotações indisponíveis.');
  return data;
}

export async function loadPreviousGestorAtlasMemory(db, { clientId, ownerId, note }) {
  if (!ownerId || !note?.replaces_id || !Number.isSafeInteger(note.version) || note.version <= 1 || !await canUseGestorAtlasMemory(db, clientId)) return null;
  const version = note.version - 1;
  const { data, error } = await db.from('atlas_memories').select('id,owner_id,client_id,state,version,replaces_id,content,created_at')
    .eq('id', note.replaces_id).eq('owner_id', ownerId).eq('client_id', clientId).eq('state', 'replaced').eq('version', version).maybeSingle();
  if (error || !data || data.id !== note.replaces_id || data.owner_id !== ownerId || data.client_id !== clientId || data.state !== 'replaced' ||
    data.version !== version || typeof data.content !== 'string') return null;
  return data;
}

export async function loadGestorMemorySources(db, clientId, versions) {
  if (!versions.length) return {};
  const { data, error } = await db.rpc('gestor_ia_fontes_memoria', { p_client_id: clientId, p_versions: versions });
  if (error || !data || typeof data !== 'object' || Array.isArray(data) || Object.entries(data).some(([id, source]) =>
    !versions.includes(id) || typeof source?.decisionId !== 'string' || typeof source.title !== 'string' || typeof source.current !== 'boolean')) {
    throw new Error('Origem dos aprendizados indisponível.');
  }
  return data;
}

export async function loadGestorMemoryReference(db, { clientId, ownerId, memoryId }) {
  if (!ownerId || !isMemoryReferenceId(memoryId) || !await canUseGestorAtlasMemory(db, clientId)) return null;
  const { data, error } = await db.from('atlas_memories').select('id,owner_id,client_id,state,version,content,created_at')
    .eq('id', memoryId).eq('owner_id', ownerId).eq('client_id', clientId).maybeSingle();
  if (error) throw new Error('Não foi possível consultar a versão citada.');
  return data?.id === memoryId && data.owner_id === ownerId && data.client_id === clientId &&
    typeof data.content === 'string' && ['active', 'replaced', 'revoked'].includes(data.state) ? data : null;
}

export async function agendaMemoryPermissions(db, clientId, versions, allow = null) {
  if (!versions.length) return {};
  const { data, error } = await db.rpc('gestor_ia_memorias_da_agenda', { p_client_id: clientId, p_versions: versions, p_allow: allow });
  if (error || !data || typeof data !== 'object' || Array.isArray(data) || Object.entries(data).some(([id, value]) => !versions.includes(id) || typeof value !== 'boolean') ||
    (allow !== null && data[versions[0]] !== allow)) {
    const message = error?.code === '40001' ? 'A versão do aprendizado mudou. Confira a anotação atual.' : 'Autorização da agenda indisponível.';
    throw Object.assign(new Error(message), { decisionLearning: true });
  }
  return data;
}

export async function loadDecisionMemoryChoices(db, { clientId, ownerId, accountId }) {
  if (!ownerId || !await canUseGestorAtlasMemory(db, clientId)) return [];
  const { data, error } = await db.from('atlas_memories').select('id,content,source,state,confirmed_at')
    .eq('owner_id', ownerId).eq('client_id', clientId).eq('source', 'user_confirmation').eq('state', 'active')
    .order('confirmed_at', { ascending: false }).order('id').limit(GESTOR_ATLAS_MEMORY_LIMIT);
  if (error || !Array.isArray(data)) throw new Error('Anotações indisponíveis.');
  const sources = await loadGestorMemorySources(db, clientId, data.map(({ id }) => id));
  const account = accountId ? goalAccountId(accountId) : undefined;
  return data.flatMap((note) => {
    const excerpt = decisionMemoryExcerpt(note);
    const source = sources[note.id];
    return excerpt && memoryFitsDecisionAccount(source, account) ? [{ id: note.id, confirmedAt: note.confirmed_at, excerpt, source }] : [];
  }).sort((a, b) => Number(Boolean(b.source?.accountId)) - Number(Boolean(a.source?.accountId)));
}

export async function saveGestorDecisionLearning(db, { decisionId, revision, content, confirmed }) {
  const { data, error } = await db.rpc('gestor_ia_salvar_aprendizado', {
    p_decision_id: decisionId, p_revision: revision, p_content: content, p_confirmed: confirmed,
  });
  if (error || !data?.id) {
    const message = /^(O veredito mudou\.|O veredito já tem|O aprendizado deste veredito foi retirado)/.test(error?.message || '')
      ? error.message : 'Não foi possível salvar o aprendizado da decisão. Confira a Memória antes de repetir.';
    throw Object.assign(new Error(message), { decisionLearning: true });
  }
  return data;
}

export async function loadAgendaLearning(db, decisionId) {
  const { data, error } = await db.rpc('gestor_ia_aprendizado_do_aviso', { p_decision_id: decisionId });
  if (error || (data && (typeof data.content !== 'string' || typeof data.title !== 'string' ||
      !Number.isSafeInteger(data.version) || !Number.isFinite(Date.parse(data.verdictAt))))) {
    throw new Error('Aprendizado anterior indisponível nesta consulta.');
  }
  return data || null;
}

export async function countGestorCrmMetaContacts(db, { clientId, period }) {
  const range = dateRange(period?.since, period?.until);
  if (!range || !await canReadClient(db, clientId)) return null;
  const { count, error } = await db.from('cliente_whatsapp_contact')
    .select('id', { count: 'exact', head: true }).eq('cliente_id', clientId).eq('origin_source', 'meta_ads')
    .gte('first_seen_at', `${range.since}T00:00:00-03:00`).lte('first_seen_at', `${range.until}T23:59:59.999999-03:00`);
  if (error || !Number.isSafeInteger(count) || count < 0) throw new Error('Rastreamento indisponível.');
  return count;
}

export function trackedCrmScope(accountId, metrics, requested) {
  const history = metrics?.history;
  const reading = dateRange(metrics?.period?.since, metrics?.period?.until);
  const covered = dateRange(history?.period?.since, history?.period?.until);
  if (!accountId || !reading || !covered || !requested || !Number.isFinite(Date.parse(history.fetchedAt))) return null;
  const captured = decisionDayAt(history.fetchedAt, history.timezone);
  if (!captured) return null;
  const lastClosed = new Date(Date.parse(captured) - 86400000).toISOString().slice(0, 10);
  const since = [reading.since, covered.since, requested.since].sort().at(-1);
  const until = [reading.until, covered.until, requested.until, lastClosed].sort()[0];
  const days = (Date.parse(until) - Date.parse(since)) / 86400000 + 1;
  if (!Number.isInteger(days) || days < 1 || days > 92) return null;
  const rows = Array.isArray(history.accountDays) ? history.accountDays.filter((row) =>
    row?.date_start >= since && row.date_start <= until && dateRange(row.date_start, row.date_start)) : [];
  const currency = rows[0]?.account_currency;
  const hasAllDays = rows.length === days && new Set(rows.map(({ date_start }) => date_start)).size === days;
  const hasSpend = hasAllDays &&
    /^[A-Z]{3}$/.test(currency || '') && rows.every((row) => row.account_currency === currency && decisionAmount(row.spend) !== null);
  const spend = hasSpend ? rows.reduce((total, row) => total + decisionAmount(row.spend), 0) : null;
  const action = hasAllDays && DECISION_OUTCOME_METRICS.mensagens.actions.find((key) => rows.every((row) =>
    Array.isArray(row.actions) && row.actions.every((entry) => typeof entry?.action_type === 'string') && decisionActionValue(row, key) !== null));
  const messages = action ? rows.reduce((total, row) => total + decisionActionValue(row, action), 0) : null;
  return { accountId, period: { since, until }, historyAt: history.fetchedAt, spend, messages, currency };
}

export async function loadTrackedCrmOutcome(db, { clientId, accountId, since, until, historyAt }) {
  const { data, error } = await db.rpc('gestor_ia_resultado_rastreado', { p_client_id: clientId, p_account_id: accountId,
    p_since: since, p_until: until, p_history_at: historyAt });
  if (error?.code === 'PGRST202') return null;
  if (error || (data !== null && (!Number.isSafeInteger(data?.total) || !Number.isSafeInteger(data.matched) || data.matched < 0 ||
    data.matched > data.total || typeof data.partial !== 'boolean'))) throw new Error('Cruzamento do Rastreamento indisponível.');
  return data;
}
