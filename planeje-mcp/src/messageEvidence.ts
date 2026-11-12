import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeMessageRow, type MessageRow, type NormalMessage } from './messageNormalize.js';

export const MESSAGE_SOURCES = ['cliente_whatsapp_inbox', 'cliente_whatsapp_sent', 'cliente_whatsapp_webhook_log'] as const;
export type MessageSource = typeof MESSAGE_SOURCES[number];
export type Position = { at: string; id: string; offset?: number };
export const quoteFilter = (value: string) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
export function timestampKey(value: string) {
  return new Date(value).toISOString().slice(0, 19) + '.' + (value.match(/\.(\d+)/)?.[1] || '').padEnd(6, '0');
}
export function compareRows(a: { source: string; row: MessageRow }, b: { source: string; row: MessageRow }) {
  return timestampKey(a.row.created_at).localeCompare(timestampKey(b.row.created_at))
    || a.source.localeCompare(b.source) || a.row.id.localeCompare(b.row.id);
}
export function messageFields(source: MessageSource, extras: string[] = []) {
  const fields = source === 'cliente_whatsapp_webhook_log' ? 'id,created_at,source,from_jid,raw_payload'
    : source === 'cliente_whatsapp_inbox'
      ? 'id,body,type,phone,sender_name,from_jid,chat_jid,conversation_id,message_id,msg_timestamp,created_at,is_group,raw_payload,media_purged_at,whatsapp_config_id'
      : 'id,body,chat_jid,to_jid,conversation_id,message_id,created_at,sent_by,sender_kind';
  return [fields, ...extras].join(',');
}
/** Keep UUID lists below gateway request-line limits; database page caps may be smaller still. */
async function rowsByIds(db: SupabaseClient, client: string, snapshot: string, source: MessageSource, ids: string[], fields: string) {
  const result: MessageRow[] = [];
  for (let offset = 0; offset < ids.length; offset += 25) {
    const batch = ids.slice(offset, offset + 25);
    let position: Position | undefined;
    let read = 0;
    for (;;) {
      let query = db.from(source).select(fields).eq('cliente_id', client).lte('created_at', snapshot).in('id', batch);
      if (position) query = query.or(`created_at.gt.${quoteFilter(position.at)},and(created_at.eq.${quoteFilter(position.at)},id.gt.${quoteFilter(position.id)})`);
      const { data, error } = await query.order('created_at').order('id').limit(25);
      if (error) throw new Error(`Não foi possível ler ${source}; histórico incompleto. Repita com o mesmo cursor.`);
      const rows = (data ?? []) as unknown as MessageRow[];
      if (!rows.length) break;
      result.push(...rows);
      read += rows.length;
      if (read >= batch.length) break;
      const last = rows[rows.length - 1]!;
      position = { at: last.created_at, id: last.id };
    }
  }
  return result.sort((a, b) => timestampKey(a.created_at).localeCompare(timestampKey(b.created_at)) || a.id.localeCompare(b.id));
}
export async function messagePage(db: SupabaseClient, client: string, snapshot: string, source: MessageSource,
  limit: number, position?: Position, filter?: string, fields = messageFields(source), period?: { start?: string; end?: string }) {
  if (period) {
    let refs = db.from('mcp_message_research_dates').select('row_id,created_at')
      .eq('cliente_id', client).eq('source', source).lte('created_at', snapshot);
    refs = refs.overlaps('event_window', `[${period.start ?? ''},${period.end ?? ''})`);
    if (position) refs = refs.or(`created_at.gt.${quoteFilter(position.at)},and(created_at.eq.${quoteFilter(position.at)},row_id.${position.offset ? 'gte' : 'gt'}.${quoteFilter(position.id)})`);
    const { data, error } = await refs.order('created_at').order('row_id').limit(limit);
    if (error) throw new Error('Não foi possível ler o índice de datas; histórico incompleto.');
    const ids = (data ?? []).map(r => String(r.row_id));
    if (!ids.length) return [];
    return rowsByIds(db, client, snapshot, source, ids, fields);
  }
  let query = db.from(source).select(fields).eq('cliente_id', client).lte('created_at', snapshot);
  if (filter) query = query.or(filter);
  if (position) query = query.or(`created_at.gt.${quoteFilter(position.at)},and(created_at.eq.${quoteFilter(position.at)},id.${position.offset ? 'gte' : 'gt'}.${quoteFilter(position.id)})`);
  const { data, error } = await query.order('created_at', { ascending: true }).order('id', { ascending: true }).limit(limit);
  if (error) throw new Error(`Não foi possível ler ${source}; histórico incompleto. Repita com o mesmo cursor.`);
  return (data ?? []) as unknown as MessageRow[];
}
async function* lookup(db: SupabaseClient, client: string, snapshot: string, source: MessageSource, filter: string) {
  let position: Position | undefined;
  for (;;) {
    const rows = await messagePage(db, client, snapshot, source, 100, position, filter);
    if (!rows.length) return;
    yield* rows;
    const last = rows[rows.length - 1]!;
    position = { at: last.created_at, id: last.id };
  }
}
type WebhookMessageIdRow = { webhook_log_id: string; created_at: string };

/** The projection is indexed because searching IDs inside 1.6 GiB of webhook JSON times out. */
async function* indexedWebhookLogs(db: SupabaseClient, client: string, snapshot: string, ids: string[]) {
  let position: Position | undefined;
  for (;;) {
    let query = db.from('cliente_whatsapp_webhook_message_ids')
      .select('webhook_log_id,created_at').eq('cliente_id', client).lte('created_at', snapshot)
      .overlaps('message_ids', ids);
    if (position) query = query.or(`created_at.gt.${quoteFilter(position.at)},and(created_at.eq.${quoteFilter(position.at)},webhook_log_id.gt.${quoteFilter(position.id)})`);
    const { data: refs, error: refError } = await query.order('created_at', { ascending: true })
      .order('webhook_log_id', { ascending: true }).limit(100);
    if (refError) throw new Error('Não foi possível localizar evidências do webhook; histórico incompleto. Repita com o mesmo cursor.');
    const rows = (refs ?? []) as unknown as WebhookMessageIdRow[];
    if (!rows.length) return;
    const idsInPage = rows.map(row => row.webhook_log_id);
    const logRows = await rowsByIds(db, client, snapshot, 'cliente_whatsapp_webhook_log', idsInPage, messageFields('cliente_whatsapp_webhook_log'));
    const logsById = new Map(logRows.map(row => [String(row.id), row]));
    for (const ref of rows) {
      const row = logsById.get(ref.webhook_log_id);
      if (row) yield row;
    }
    const last = rows[rows.length - 1]!;
    position = { at: last.created_at, id: last.webhook_log_id };
  }
}

/** IDs find candidate evidence only; contact, direction and channel must still agree. */
export async function relatedMessages(db: SupabaseClient, client: string, snapshot: string, messages: NormalMessage[]) {
  const ids = [...new Set(messages.flatMap(m => [m.message_id, m.message_id_armazenado]).filter((id): id is string => !!id))];
  const found = new Map<string, NormalMessage>();
  for (let offset = 0; offset < ids.length; offset += 8) {
    const batch = ids.slice(offset, offset + 8);
    await Promise.all([
      ...MESSAGE_SOURCES.filter(source => source !== 'cliente_whatsapp_webhook_log').map(async source => {
        const filter = `message_id.in.(${batch.map(quoteFilter).join(',')})`;
        for await (const row of lookup(db, client, snapshot, source, filter)) {
          for (const m of normalizeMessageRow(source, row, client)) {
            if ((m.message_id && batch.includes(m.message_id)) || (m.message_id_armazenado && batch.includes(m.message_id_armazenado))) found.set(`${source}:${m.id}:${m.evento_indice}`, m);
          }
        }
      }),
      (async () => {
        for await (const row of indexedWebhookLogs(db, client, snapshot, batch)) {
          for (const m of normalizeMessageRow('cliente_whatsapp_webhook_log', row, client)) {
            if ((m.message_id && batch.includes(m.message_id)) || (m.message_id_armazenado && batch.includes(m.message_id_armazenado))) found.set(`cliente_whatsapp_webhook_log:${m.id}:${m.evento_indice}`, m);
          }
        }
      })(),
    ]);
  }
  return [...found.values()];
}

const phoneKey = (phone: string | null) => phone?.replace(/^55(?=\d{10,11}$)/, '') || '';
export function sameMessage(a: NormalMessage, b: NormalMessage) {
  if (!a.message_id || a.message_id !== b.message_id || a.lado !== b.lado) return false;
  if (a.canal && b.canal && a.canal !== b.canal) return false;
  if (a.is_group !== b.is_group || (a.is_group && a.chat_jid !== b.chat_jid)) return false;
  if (a.chatvolt_organization_id && b.chatvolt_organization_id && a.chatvolt_organization_id !== b.chatvolt_organization_id) return false;
  if (a.telefone && b.telefone) return phoneKey(a.telefone) === phoneKey(b.telefone);
  return !!a.conversation_id && a.conversation_id === b.conversation_id
    && a.chatvolt_organization_id === b.chatvolt_organization_id;
}
function ownerOrder(a: NormalMessage, b: NormalMessage) {
  const priority = (m: NormalMessage) => m.fonte === 'cliente_whatsapp_webhook_log' ? 1 : 0;
  return priority(a) - priority(b) || timestampKey(a.registrada_em).localeCompare(timestampKey(b.registrada_em))
    || a.fonte.localeCompare(b.fonte) || a.id.localeCompare(b.id) || a.evento_indice - b.evento_indice;
}
export function reconcileMessage(message: NormalMessage, related: NormalMessage[], eligible: (m: NormalMessage) => boolean = () => true) {
  if (message.lado === 'equipe' && message.autoria.tipo === 'nao_identificado' && message.texto.trim() === '#ai-disabled'
    && related.some(m => m.contexto_chatvolt?.resposta_controle === '#ai-disabled' && sameMessage({ ...message, lado: 'lead' }, m))) return null;
  const candidates = related.filter(m => sameMessage(message, m));
  const channels = new Set(related.filter(m => m.message_id === message.message_id && m.lado === message.lado
    && phoneKey(m.telefone) === phoneKey(message.telefone)).map(m => m.canal).filter(Boolean));
  const matches = candidates.filter(m => channels.size <= 1 || (m.canal && m.canal === message.canal));
  if (!matches.some(m => m.fonte === message.fonte && m.id === message.id && m.evento_indice === message.evento_indice)) matches.push(message);
  const owner = matches.filter(eligible).sort(ownerOrder)[0] ?? matches.sort(ownerOrder)[0]!;
  if (owner.fonte !== message.fonte || owner.id !== message.id || owner.evento_indice !== message.evento_indice) return null;
  const full = matches.filter(m => m.texto.startsWith(message.texto)).sort((a, b) => b.texto.length - a.texto.length)[0] ?? message;
  const original = matches.find(m => m.horario_origem === 'provedor') ?? message;
  const purged = matches.some(m => m.midia_expurgada || m.media_purged_at);
  const media = matches.find(m => m.anexos.length > 0) ?? message;
  const authorTypes = new Set(matches.map(m => m.autoria.tipo).filter(t => t === 'humano' || t === 'automacao'));
  const autoria = authorTypes.size > 1 || matches.some(m => m.autoria.evidencia === 'evidencias_conflitantes')
    ? { tipo: 'nao_identificado' as const, evidencia: 'evidencias_conflitantes' }
    : matches.find(m => m.autoria.tipo === 'humano' || m.autoria.tipo === 'automacao')?.autoria ?? message.autoria;
  const contexts = new Map(matches.flatMap(m => m.contexto_chatvolt ? [[JSON.stringify(m.contexto_chatvolt), m.contexto_chatvolt] as const] : []));
  const context = contexts.size === 1 ? [...contexts.values()][0]! : null;
  return { ...message, autoria, contexto_chatvolt: context ? { ...context, anexos_nao_atribuidos: purged ? [] : context.anexos_nao_atribuidos } : null,
    contexto_chatvolt_ambiguo: contexts.size > 1, texto: full.texto, em: original.em, horario_origem: original.horario_origem,
    midia_expurgada: purged, anexos: purged ? [] : media.anexos, canal: message.canal ?? (channels.size === 1 ? [...channels][0]! : null),
    evidencias: matches.map(m => ({ fonte: m.fonte, id: m.id, evento_indice: m.evento_indice })),
    vinculo_canal_ambiguo: channels.size > 1 && !message.canal,
    versoes_texto: matches.filter(m => m.texto && !full.texto.startsWith(m.texto))
      .map(m => ({ fonte: m.fonte, id: m.id, texto: m.texto })),
    texto_divergente: matches.some(m => m.texto && !full.texto.startsWith(m.texto)) };
}

/** A conversation without a phone is linked only when same-client evidence is unique. */
export async function resolveConversation(db: SupabaseClient, client: string, snapshot: string, message: NormalMessage) {
  if (message.telefone || !message.conversation_id || message.provedor !== 'chatvolt') return message;
  const filter = `raw_payload->>conversationId.eq.${quoteFilter(message.conversation_id)}`;
  const links = new Map<string, NormalMessage>();
  for await (const row of lookup(db, client, snapshot, 'cliente_whatsapp_inbox', filter)) {
    for (const candidate of normalizeMessageRow('cliente_whatsapp_inbox', row, client)) {
      if (candidate.telefone && (!message.chatvolt_organization_id || message.chatvolt_organization_id === candidate.chatvolt_organization_id)) {
        links.set(phoneKey(candidate.telefone), candidate);
      }
    }
  }
  if (links.size !== 1) return message;
  const linked = [...links.values()][0]!;
  return { ...message, telefone: linked.telefone, chat_jid: linked.chat_jid };
}
