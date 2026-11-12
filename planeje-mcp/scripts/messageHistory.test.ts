import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { consultMensagens } from '../src/liveConsult.js';
import { registerHubTools } from '../src/hubTools.js';
import { registerAtendimentoTools } from '../src/atendimentoTools.js';
import { normalizeMessageRow } from '../src/messageNormalize.js';

const CLIENT = '10000000-0000-4000-8000-000000000001';
const OTHER = '10000000-0000-4000-8000-000000000002';
const PHONE = '5511999990000';
const actor = { type: 'user' as const, user_id: OTHER, role: 'superadmin' };
type Row = Record<string, any>;
function split(value: string) {
  let depth = 0, start = 0, quoted = false, escaped = false;
  const parts: string[] = [];
  for (let i = 0; i < value.length; i++) {
    if (escaped) { escaped = false; continue; }
    if (quoted && value[i] === '\\') { escaped = true; continue; }
    if (value[i] === '"') { quoted = !quoted; continue; }
    if (quoted) continue;
    if (value[i] === '(') depth++;
    if (value[i] === ')') depth--;
    if (value[i] === ',' && depth === 0) { parts.push(value.slice(start, i)); start = i + 1; }
  }
  return [...parts, value.slice(start)];
}
const unquote = (value: string): string => value.startsWith('"') ? JSON.parse(value) : value;
function contains(actual: any, expected: any): boolean {
  if (Array.isArray(expected)) return Array.isArray(actual) && expected.every(e => actual.some(a => contains(a, e)));
  if (expected && typeof expected === 'object') return !!actual && Object.entries(expected).every(([key, value]) => contains(actual[key], value));
  return actual === expected;
}
const timestamps = new Map<string, string>();
function normalize(value: string): string {
  if (!/^\d{4}-\d\d-\d\dT/.test(value)) return value;
  if (!timestamps.has(value)) timestamps.set(value, new Date(value).toISOString().slice(0, 19)
    + '.' + (value.match(/\.(\d+)/)?.[1] || '').padEnd(6, '0'));
  return timestamps.get(value)!;
}
function predicate(filter: string): (row: Row) => boolean {
  const group = filter.match(/^(and|or)\((.*)\)$/);
  if (group) {
    const predicates = split(group[2]!).map(predicate);
    return (row) => group[1] === 'and' ? predicates.every((test) => test(row)) : predicates.some((test) => test(row));
  }
  const match = filter.match(/^([\w>\-]+)\.(eq|gt|gte|lt|lte|is|in|ilike|cs|ov)\.(.*)$/);
  assert.ok(match, `Unsupported fixture filter: ${filter}`);
  const [, column, op, raw] = match;
  const values = ['in', 'ov'].includes(op!) ? split(raw!.slice(1, -1)).map(unquote) : [];
  const b = normalize(unquote(raw!));
  return (row) => {
    const value = column!.split(/->>?/).reduce((value: any, key) => value?.[key], row);
    if (op === 'cs') return contains(value, JSON.parse(unquote(raw!)));
    if (op === 'is') return raw === 'null' ? value == null : value === (raw === 'true');
    if (op === 'in') return values.includes(String(value));
    if (op === 'ov' && column === 'event_window') return (!values[0] || Date.parse(value[1]) >= Date.parse(values[0]))
      && (!values[1] || Date.parse(value[0]) < Date.parse(values[1]));
    if (op === 'ov') return Array.isArray(value) && values.some(item => value.includes(item));
    if (value == null) return false;
    if (op === 'ilike') return String(value).toLowerCase().includes(raw!.replace(/%/g, '').toLowerCase());
    const a = normalize(String(value));
    return op === 'eq' ? a === b : op === 'gt' ? a > b : op === 'gte' ? a >= b : op === 'lt' ? a < b : a <= b;
  };
}
function webhookMessageIds(value: unknown, key = ''): string[] {
  if (Array.isArray(value)) return value.flatMap(item => webhookMessageIds(item));
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([name, item]) => [
    ...(name === 'messageId' || name === 'messageid' || name === 'message_id' || name === 'id')
      && typeof item === 'string' && item.length > 0 && item.length <= 512 ? [item] : [],
    ...webhookMessageIds(item, name),
  ]);
}
function fixture(tables: Record<string, Row[]>, cap = Infinity, failTable = '', maxUrl = Infinity, rejectRawLogLookup = false, idCap = cap, failIdRequest = Infinity) {
  const projected = tables.cliente_whatsapp_webhook_message_ids ?? (tables.cliente_whatsapp_webhook_log ?? []).flatMap(log => {
    const message_ids = [...new Set(webhookMessageIds(log.raw_payload))];
    return message_ids.length ? [{ webhook_log_id: log.id, cliente_id: log.cliente_id, created_at: log.created_at, message_ids }] : [];
  });
  const dates = tables.mcp_message_research_dates ?? ['cliente_whatsapp_inbox', 'cliente_whatsapp_sent', 'cliente_whatsapp_webhook_log'].flatMap(source =>
    (tables[source] ?? []).map(r => {
      const times = [r.created_at, ...normalizeMessageRow(source, r as any, r.cliente_id).map(m => m.em)].sort();
      return { source, row_id: r.id, cliente_id: r.cliente_id, created_at: r.created_at, event_window: [times[0],times.at(-1)] };
    }));
  const sourceTables = { ...tables, cliente_whatsapp_webhook_message_ids: projected, mcp_message_research_dates: dates };
  const requests: URL[] = [];
  let idRequests = 0;
  const db = createClient('https://fixture.invalid', 'fixture-only', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      assert.equal(url.host, 'fixture.invalid');
      assert.equal(init?.method ?? 'GET', 'GET');
      if (url.pathname.startsWith('/auth/v1/admin/users/')) return new Response(JSON.stringify({ id: actor.user_id }));
      requests.push(url);
      if (url.href.length > maxUrl) return new Response('Request URI too large', { status: 414 });
      const table = url.pathname.split('/').at(-1)!;
      if (url.searchParams.get('id')?.startsWith('in.') && ++idRequests === failIdRequest) {
        return new Response(JSON.stringify({ message: 'fixture sub-batch failed' }), { status: 502 });
      }
      if (table === failTable) return new Response(JSON.stringify({ message: 'fixture unavailable' }), { status: 400 });
      if (rejectRawLogLookup && table === 'cliente_whatsapp_webhook_log'
        && url.searchParams.getAll('or').some(value => value.includes('raw_payload'))) {
        return new Response(JSON.stringify({ message: 'raw log scan forbidden' }), { status: 500 });
      }
      let rows = [...(sourceTables[table] || (table === 'profiles' ? [{ id: actor.user_id, role: actor.role, status: 'active' }]
        : table === 'mcp_message_research_state' ? [{ id: 'messages-v1', ready: true }] : []))];
      for (const [key, value] of url.searchParams) {
        if (key === 'or') rows = rows.filter(predicate('or' + value));
        else if (!['select', 'limit', 'order', 'offset'].includes(key)) rows = rows.filter(predicate(key + '.' + value));
      }
      const order = url.searchParams.get('order');
      const orders = order?.split(',').map((part) => part.split('.'));
      if (orders) rows.sort((a, b) => {
        for (const [col, dir] of orders) {
          const cmp = normalize(String(a[col!])).localeCompare(normalize(String(b[col!])));
          if (cmp) return cmp * (dir === 'desc' ? -1 : 1);
        }
        return 0;
      });
      const limit = Math.min(Number(url.searchParams.get('limit') || Infinity), url.searchParams.get('id')?.startsWith('in.') ? idCap : cap);
      const select = url.searchParams.get('select');
      if (select && /^[\w, ]+$/.test(select)) rows = rows.map(r => Object.fromEntries(select.split(',').map(c => [c.trim(), r[c.trim()]])));
      return new Response(JSON.stringify(new Headers(init?.headers).get('accept')?.includes('application/vnd.pgrst.object+json') ? rows[0] ?? null : rows.slice(0, limit)), { headers: { 'Content-Type': 'application/json' } });
    } },
  });
  return { db, requests };
}
function row(i: number, extra: Row = {}): Row {
  return { id: `20000000-0000-4000-8000-${String(i).padStart(12, '0')}`, cliente_id: CLIENT,
    body: `message ${i}`, phone: PHONE, from_jid: `${PHONE}@s.whatsapp.net`, chat_jid: `${PHONE}@s.whatsapp.net`,
    to_jid: `${PHONE}@s.whatsapp.net`, is_group: false, type: 'text',
    created_at: '2026-01-01T12:00:00.000000Z', msg_timestamp: '2026-01-01T12:00:00.000000Z', ...extra };
}
async function readAll(db: any, opts: Row = {}) {
  let cursor: string | undefined;
  const messages: Row[] = [];
  do {
    const page: any = await consultMensagens(db, { clienteId: CLIENT, limite: 200, ...opts, cursor });
    assert.ok(page.paginacao, 'history must expose continuation instead of silently cutting');
    assert.ok(page.mensagens.length <= (opts.limite ?? 200), 'batch expansion must honor the page size');
    messages.push(...page.mensagens);
    assert.equal(page.paginacao.total_lidos, messages.length);
    cursor = page.paginacao.proximo_cursor ?? undefined;
    assert.equal(page.paginacao.concluido, !cursor);
    assert.ok(messages.length <= 60_000, 'fixture must not repeat pages');
  } while (cursor);
  return messages;
}

test('traverses 50,000 incoming/outgoing messages without a total ceiling or duplicates', async () => {
  const incoming = Array.from({ length: 25_000 }, (_, i) => row(i + 1));
  const sent = Array.from({ length: 25_000 }, (_, i) => row(i + 25_001));
  const { db } = fixture({ cliente_whatsapp_inbox: incoming.reverse(), cliente_whatsapp_sent: sent.reverse() });
  const messages = await readAll(db);
  assert.equal(messages.length, 50_000);
  assert.equal(new Set(messages.map((m) => `${m.fonte}:${m.id}`)).size, 50_000);
});

test('resolves long provider IDs through the indexed webhook evidence without scanning raw logs', async () => {
  const ids = Array.from({ length: 8 }, (_, i) => `wamid.${'A'.repeat(80)}${i}`);
  const sent = ids.map((id, i) => row(i + 1, { message_id: id, body: 'Short' }));
  const logs = ids.map((id, i) => row(i + 20, { raw_payload: { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'smb_message_echoes', value: {
    messaging_product: 'whatsapp', message_echoes: [{ id, to: PHONE, type: 'text', text: { body: 'Short complete text' } }],
  } }] }] } }));
  const index = logs.map((log, i) => ({ webhook_log_id: log.id, cliente_id: CLIENT, created_at: log.created_at,
    message_ids: [ids[i]!] }));
  const { db, requests } = fixture({ cliente_whatsapp_sent: sent, cliente_whatsapp_webhook_log: logs,
    cliente_whatsapp_webhook_message_ids: index }, Infinity, '', 8000, true);
  const messages = await readAll(db, { limite: 8 });
  assert.equal(messages.length, 8);
  assert.ok(messages.every(message => message.texto === 'Short complete text'));
  assert.ok(requests.every(url => url.href.length < 8000));
  assert.ok(requests.some(url => url.pathname.endsWith('cliente_whatsapp_webhook_message_ids')));
  assert.ok(!requests.some(url => url.pathname.endsWith('cliente_whatsapp_webhook_log')
    && url.searchParams.getAll('or').some(value => value.includes('raw_payload'))));
});

test('120 and 500 temporal pages keep short ID requests and preserve all rows under a smaller source cap', async () => {
  const tables = { cliente_whatsapp_inbox: Array.from({ length: 520 }, (_, i) => row(i + 1, { body: 'full '.repeat(200) })) };
  for (const limite of [120, 500]) {
    const { db, requests } = fixture(tables, Infinity, '', 3500, false, 7);
    const messages = await readAll(db, { limite, inicio: '2026-01-01', fim: '2026-01-01' });
    assert.equal(messages.length, 520);
    assert.equal(new Set(messages.map(m => m.id)).size, 520);
    assert.ok(messages.every(m => m.texto === 'full '.repeat(200)));
    assert.ok(requests.every(u => u.href.length <= 3500));
  }
});

test('large webhook evidence pages retain every retry without one large UUID request', async () => {
  const payload = { eventType: 'USER_MESSAGE_RECEIVED', userPhoneNumber: PHONE, userMessage: 'hi', messageId: 'shared' };
  const { db, requests } = fixture({ cliente_whatsapp_inbox: [row(900, { body: 'hi', message_id: 'shared' })],
    cliente_whatsapp_webhook_log: Array.from({ length: 121 }, (_, i) => row(i + 1, { raw_payload: payload })) }, Infinity, '', 3500, false, 7);
  const messages = await readAll(db, { limite: 120, inicio: '2026-01-01', fim: '2026-01-01' });
  assert.equal(messages.length, 1);
  assert.equal(messages[0]!.evidencias.length, 122);
  assert.ok(requests.every(u => u.href.length <= 3500));
});

test('an intermediate UUID sub-batch failure cannot return a successful partial audit', async () => {
  const { db } = fixture({ cliente_whatsapp_inbox: Array.from({ length: 60 }, (_, i) => row(i + 1)) },
    Infinity, '', 3500, false, 7, 2);
  await assert.rejects(() => consultMensagens(db, { clienteId: CLIENT, limite: 120, inicio: '2026-01-01' }), /histórico incompleto/);
});

test('Chatvolt control evidence suppresses an unproven stored reply and preserves the incoming audio and context', async () => {
  const payload = { eventType: 'AGENT_USER_MESSAGE', channel: 'zapperapi', userPhoneNumber: PHONE, messageId: 'control',
    userMessage: 'incoming', agentResponse: '#ai-disabled', isAiEnabled: false, assignee: 'assigned-user', assigneeName: 'Person',
    attachments: [{ mimeType: 'audio/ogg', url: 'https://cdn.example.invalid/voice.ogg' }] };
  const { db } = fixture({
    cliente_whatsapp_inbox: [row(1, { body: 'incoming', message_id: 'control', raw_payload: payload })],
    cliente_whatsapp_sent: [row(2, { body: '#ai-disabled', message_id: 'control' })],
    cliente_whatsapp_webhook_log: [row(3, { raw_payload: payload })],
  });
  const messages = await readAll(db);
  assert.equal(messages.length, 1);
  assert.equal(messages[0]!.lado, 'lead');
  assert.equal(messages[0]!.tipo, 'audio');
  assert.equal(messages[0]!.contexto_chatvolt.responsavel_atribuido.id, 'assigned-user');
});

test('canonical team replies recover Chatvolt AI evidence and context from their matching webhook', async () => {
  const payload = { eventType: 'AGENT_USER_MESSAGE', channel: 'whatsapp', userPhoneNumber: PHONE, messageId: 'reply',
    agentResponse: 'reply', isAiEnabled: true, agentId: 'ai-agent', agentName: 'Assistant' };
  const { db } = fixture({ cliente_whatsapp_sent: [row(1, { body: 'reply', message_id: 'reply' })],
    cliente_whatsapp_webhook_log: [row(2, { raw_payload: payload })] });
  const messages = await readAll(db);
  assert.equal(messages.length, 1);
  assert.equal(messages[0]!.autoria.tipo, 'automacao');
  assert.equal(messages[0]!.contexto_chatvolt.agente.id, 'ai-agent');
});

test('conflicting persisted authorship is not overwritten by Chatvolt automation metadata', async () => {
  const { db } = fixture({ cliente_whatsapp_sent: [row(1, { body: 'reply', message_id: 'conflict', sent_by: 'human', sender_kind: 'automation' })],
    cliente_whatsapp_webhook_log: [row(2, { raw_payload: { eventType: 'AGENT_USER_MESSAGE', channel: 'whatsapp',
      userPhoneNumber: PHONE, messageId: 'conflict', agentResponse: 'reply', isAiEnabled: true } })] });
  const messages = await readAll(db);
  assert.equal(messages.length, 1);
  assert.equal(messages[0]!.autoria.tipo, 'nao_identificado');
});

test('preserves complete bodies, IDs and phone; remains complete under a smaller database page cap', async () => {
  const body = '  complete\n' + 'x'.repeat(4000) + '\n  end  ';
  const { db, requests } = fixture({ cliente_whatsapp_inbox: Array.from({ length: 13 }, (_, i) => row(i + 1, { body })),
    cliente_whatsapp_sent: [row(20)] }, 3);
  const messages = await readAll(db, { telefone: PHONE });
  assert.equal(messages.length, 14);
  assert.equal(messages[0]!.texto, body);
  assert.equal(messages.at(-1)!.telefone, PHONE);
  assert.equal(messages.at(-1)!.id, row(20).id, 'a shorter source page must not emit later messages too soon');
  assert.ok(requests.every((url) => url.searchParams.get('cliente_id') === `eq.${CLIENT}`));
  assert.ok(requests.every((url) => url.searchParams.get('order') === 'created_at.asc,id.asc'));
});

test('rejects altered or cross-client/filter/actor cursors and invalid phone before reading', async () => {
  const { db, requests } = fixture({ cliente_whatsapp_inbox: [row(1), row(2)] });
  const page: any = await consultMensagens(db, { clienteId: CLIENT, limite: 1, telefone: PHONE, actor });
  const cursor = page.paginacao?.proximo_cursor;
  assert.ok(cursor);
  const count = requests.length;
  for (const opts of [{ clienteId: OTHER }, { telefone: '5511888880000' }, { inicio: '2020-01-01' },
    { actor: { ...actor, user_id: CLIENT } }, { cursor: cursor + 'x' }]) {
    await assert.rejects(consultMensagens(db, { clienteId: CLIENT, limite: 1, telefone: PHONE, actor, cursor, ...opts }));
  }
  await assert.rejects(consultMensagens(db, { clienteId: CLIENT, telefone: 'invalid' }));
  assert.equal(requests.length, count);
});

test('a failed source cannot produce a successful or complete audit', async () => {
  const { db } = fixture({ cliente_whatsapp_inbox: [row(1)] }, Infinity, 'cliente_whatsapp_sent');
  await assert.rejects(consultMensagens(db, { clienteId: CLIENT }));
});

test('generic Atendimento summary respects requested client', async () => {
  const { db } = fixture({ atendimento_conversas: [row(1, { archived_at: null }), row(2, { cliente_id: OTHER, archived_at: null })] });
  const handlers = new Map<string, any>();
  registerHubTools({ registerTool: (name: string, _schema: any, handler: any) => handlers.set(name, handler) } as any, db, actor);
  const result = await handlers.get('ler_aba')({ modulo: 'atendimento', aba: 'conversas', cliente_id: CLIENT });
  assert.notEqual(result.isError, true);
  const response = JSON.parse(result.content[0].text);
  assert.equal(response.dados.conversas.length, 1);
  assert.equal(response.dados.conversas[0].cliente_id, CLIENT);
});

test('period selects indexed candidates instead of paging through unrelated old records', async () => {
  const { db, requests } = fixture({ cliente_whatsapp_inbox: [
    ...Array.from({ length: 300 }, (_, i) => row(i)),
    row(999, { created_at: '2026-10-01T12:00:00Z', msg_timestamp: '2026-10-01T12:00:00Z' }),
  ] });
  const data = await consultMensagens(db, { clienteId: CLIENT, inicio: '2026-10-01', fim: '2026-10-01', limite: 10, actor });
  assert.equal(data.total, 1);
  assert.equal(data.paginacao.registros_examinados, 1);
  assert.ok(requests.some(u => u.pathname.endsWith('mcp_message_research_dates')));
});

test('date index retains delayed imports and recovers canonical evidence outside its own date window', async () => {
  const { db } = fixture({
    cliente_whatsapp_sent: [row(910, { message_id: 'delayed', created_at: '2026-10-29T12:00:00Z', sent_by: 'human' })],
    cliente_whatsapp_webhook_log: [row(911, { source: 'chatvolt', created_at: '2026-10-29T12:00:00Z',
      raw_payload: { eventType: 'AGENT_MESSAGE_SENDED', messageId: 'delayed', agentResponse: 'message 910 extended',
        userPhoneNumber: PHONE, channel: 'whatsapp', createdAt: '2020-01-01T12:00:00Z' } })],
  }, 1);
  const messages = [];
  let cursor: string | undefined;
  for (let i = 0; i < 10; i++) {
    const data = await consultMensagens(db, { clienteId: CLIENT, inicio: '2020-01-01', fim: '2020-01-01', limite: 1, actor, cursor });
    messages.push(...data.mensagens);
    if (data.paginacao.concluido) break;
    cursor = data.paginacao.proximo_cursor!;
  }
  assert.equal(messages.length, 1);
  assert.equal(messages[0]!.texto, 'message 910 extended');
  assert.equal(messages[0]!.autoria.tipo, 'humano');
});

test('indexed period respects historical São Paulo DST and stops on index source failure', async () => {
  const input = { cliente_whatsapp_inbox: [row(912, { created_at: '2018-12-01T02:30:00Z', msg_timestamp: '2018-12-01T02:30:00Z' })] };
  const { db } = fixture(input);
  const data = await consultMensagens(db, { clienteId: CLIENT, inicio: '2018-12-01', fim: '2018-12-01', actor });
  assert.equal(data.total, 1);
  const broken = fixture(input, Infinity, 'mcp_message_research_dates');
  await assert.rejects(() => consultMensagens(broken.db, { clienteId: CLIENT, inicio: '2018-12-01', actor }), /índice de datas/);
  const unready = fixture({ ...input, mcp_message_research_state: [{ id: 'messages-v1', ready: false }] });
  await assert.rejects(() => consultMensagens(unready.db, { clienteId: CLIENT, inicio: '2018-12-01', actor }), /ainda não está pronto/);
  assert.ok(!unready.requests.some(u => u.pathname.endsWith('mcp_message_research_dates')));
});

test('existing transcripts preserve owner, current conversation, source client and purge boundaries', async () => {
  const conversation = '30000000-0000-4000-8000-000000000001';
  const audio = row(990, { is_group: true, chat_jid: '123@g.us', conversation_id: conversation, type: 'audio' });
  const tables = {
    cliente_whatsapp_inbox: [audio],
    atlas_settings: [{ id: 'atlas', enabled: true, owner_id: actor.user_id }],
    atendimento_conversas: [{ id: conversation, cliente_id: CLIENT, is_group: true, bloqueada: false, archived_at: null }],
    atlas_audio_transcripts: [{ inbox_id: audio.id, owner_id: actor.user_id, conversation_id: conversation,
      status: 'completed', transcript: 'original '.repeat(1000), finished_at: '2026-10-01T12:00:00Z' }],
  };
  const run = async (overrides = {}, who = actor) => {
    const { db, requests } = fixture({ ...tables, ...overrides });
    const result = await consultMensagens(db, { clienteId: CLIENT, chatJid: '123@g.us', actor: who });
    return { result, requests };
  };
  const { result } = await run();
  assert.equal(result.mensagens[0]!.transcricao.texto, 'original '.repeat(1000));
  assert.equal(result.mensagens[0]!.transcricao.automatica, true);
  for (const overrides of [
    { atendimento_conversas: [{ ...tables.atendimento_conversas[0], bloqueada: true }] },
    { cliente_whatsapp_inbox: [{ ...audio, media_purged_at: '2026-10-01T12:00:00Z' }] },
    { atlas_audio_transcripts: [{ ...tables.atlas_audio_transcripts[0], owner_id: CLIENT }] },
    { atendimento_conversas: [{ ...tables.atendimento_conversas[0], cliente_id: OTHER }] },
    { atlas_settings: [{ id: 'atlas', enabled: false, owner_id: actor.user_id }] },
  ]) assert.notEqual((await run(overrides)).result.mensagens[0]?.transcricao?.status, 'completed');
  const foreign = await run({}, { ...actor, user_id: CLIENT });
  assert.ok(!foreign.requests.some(u => u.pathname.endsWith('atlas_audio_transcripts')));
  const failure = fixture(tables, Infinity, 'atlas_audio_transcripts');
  await assert.rejects(() => consultMensagens(failure.db, { clienteId: CLIENT, chatJid: '123@g.us', actor }), /análise de áudio incompleta/);
});

test('period uses São Paulo days, original message time and creation fallback without a year ceiling', async () => {
  const { db } = fixture({ cliente_whatsapp_inbox: [
    row(1, { msg_timestamp: '2026-01-01T02:59:59Z' }),
    row(2, { msg_timestamp: '2026-01-01T03:00:00Z' }),
    row(3, { msg_timestamp: '2026-01-02T02:59:59Z' }),
    row(4, { msg_timestamp: '2026-01-02T03:00:00Z' }),
    row(5, { msg_timestamp: null }),
    row(6, { cliente_id: OTHER }),
  ] });
  const messages = await readAll(db, { inicio: '2026-01-01', fim: '2026-01-01' });
  assert.deepEqual(messages.map((m) => m.id), [row(2).id, row(3).id, row(5).id]);
  assert.equal((await readAll(db, { inicio: '2020-01-01', fim: '2026-12-31' })).length, 5);
  await assert.rejects(consultMensagens(db, { clienteId: CLIENT, inicio: '2026-02-30' }));
  await assert.rejects(consultMensagens(db, { clienteId: CLIENT, inicio: '2026-01-02', fim: '2026-01-01' }));
});

test('microsecond order, deletion of a consumed row and new arrivals preserve the continuation', async () => {
  const rows = [row(2, { created_at: '2026-01-01T12:00:00.000001Z' }),
    row(1, { created_at: '2026-01-01T12:00:00.000002Z' })];
  const { db } = fixture({ cliente_whatsapp_inbox: rows });
  const first: any = await consultMensagens(db, { clienteId: CLIENT, limite: 1 });
  assert.equal(first.mensagens[0].id, row(2).id);
  rows.shift();
  rows.push(row(3, { created_at: new Date(Date.now() + 60_000).toISOString() }));
  const second: any = await consultMensagens(db, { clienteId: CLIENT, limite: 1, cursor: first.paginacao.proximo_cursor });
  assert.equal(second.mensagens[0].id, row(1).id);
  const last: any = await consultMensagens(db, { clienteId: CLIENT, cursor: second.paginacao.proximo_cursor });
  assert.equal(last.paginacao.concluido, true);
  assert.equal(last.paginacao.total_lidos, 2);
  assert.equal(last.continuacao, null);
});

test('interleaved sources stay ordered across pages with equal timestamps and a small database cap', async () => {
  const time = (i: number) => `2026-01-01T12:00:0${i}.000000Z`;
  const { db } = fixture({
    cliente_whatsapp_inbox: [row(1, { created_at: time(0) }), row(3, { created_at: time(2) }), row(5, { created_at: time(4) })],
    cliente_whatsapp_sent: [row(2, { created_at: time(1) }), row(4, { created_at: time(2) }), row(6, { created_at: time(5) })],
  }, 1);
  const messages = await readAll(db);
  assert.deepEqual(messages.map((m) => m.id), [1, 2, 3, 4, 5, 6].map((i) => row(i).id));
});

test('generic lead read continues through the direct tool with the same scope and intact body', async () => {
  const { db } = fixture({ cliente_whatsapp_inbox: [row(1), row(2)] });
  const handlers = new Map<string, any>();
  registerHubTools({ registerTool: (name: string, _schema: any, handler: any) => handlers.set(name, handler) } as any, db, actor);
  const result = await handlers.get('ler_aba')({ modulo: 'rastreamento', aba: 'leads', cliente_id: CLIENT, telefone: PHONE, limite: 1 });
  assert.notEqual(result.isError, true, result.content[0].text);
  const first = JSON.parse(result.content[0].text).dados.mensagens;
  assert.equal(first.mensagens[0].id, row(1).id);
  const next = first.continuacao;
  assert.equal(next.argumentos.cursor, first.paginacao.proximo_cursor);
  const secondResult = await handlers.get(next.ferramenta)(next.argumentos);
  assert.notEqual(secondResult.isError, true, secondResult.content[0].text);
  const second = JSON.parse(secondResult.content[0].text);
  assert.equal(second.mensagens[0].id, row(2).id);
  assert.equal(second.paginacao.total_lidos, 2);
  assert.deepEqual(second.cobertura.fontes_nao_consultadas, []);
});

test('conversation reader includes groups only by exact client/conversation and denies non-team sessions', async () => {
  const { db, requests } = fixture({ cliente_whatsapp_inbox: [
    row(1, { conversation_id: OTHER, is_group: true, sender_name: 'Fixture', sender_jid: 'fixture@s.whatsapp.net' }),
    row(2, { conversation_id: OTHER, cliente_id: OTHER, is_group: true }),
    row(3, { conversation_id: CLIENT, is_group: true }),
  ], cliente_whatsapp_sent: [row(4, { conversation_id: OTHER, sent_by: actor.user_id, ack_status: 'read' })] });
  const handlers = new Map<string, any>();
  const server = { registerTool: (name: string, _schema: any, handler: any) => handlers.set(name, handler) } as any;
  registerAtendimentoTools(server, db, { cliente_whatsapp_inbox: ['sender_jid'], cliente_whatsapp_sent: ['sent_by', 'ack_status'] }, actor);
  const result = await handlers.get('ver_mensagens_conversa')({ cliente_id: CLIENT, conversation_id: OTHER });
  assert.notEqual(result.isError, true);
  const first = JSON.parse(result.content[0].text);
  assert.equal(first.mensagens.length, 1);
  assert.equal(first.mensagens[0].body, 'message 1');
  assert.equal(first.mensagens[0].direcao, 'recebida');
  assert.equal(first.mensagens[0].sender_name, 'Fixture');
  assert.equal(first.mensagens[0].sender_jid, 'fixture@s.whatsapp.net');
  assert.equal(first.mensagens[0].is_group, true);
  assert.equal(first.mensagens[0].type, 'text');
  assert.equal(first.mensagens[0].msg_timestamp, row(1).msg_timestamp);
  assert.ok(requests.find((r) => r.pathname.endsWith('cliente_whatsapp_sent'))!.searchParams.get('select')!.includes('sent_by,ack_status'));
  const second = JSON.parse((await handlers.get(first.continuacao.ferramenta)(first.continuacao.argumentos)).content[0].text);
  assert.equal(second.mensagens[0].sent_by, actor.user_id);
  assert.equal(second.mensagens[0].ack_status, 'read');
  const end = JSON.parse((await handlers.get(second.continuacao.ferramenta)(second.continuacao.argumentos)).content[0].text);
  assert.equal(end.paginacao.concluido, true);
  registerAtendimentoTools(server, db, {}, { type: 'anon' });
  const count = requests.filter((r) => r.pathname.includes('cliente_whatsapp_')).length;
  const denied = await handlers.get('ver_mensagens_conversa')({ cliente_id: CLIENT, conversation_id: OTHER });
  assert.equal(denied.isError, true);
  assert.equal(requests.filter((r) => r.pathname.includes('cliente_whatsapp_')).length, count);
});

test('tracking group JID keeps exact client scope, rejects cursor changes and continues with the same tool', async () => {
  const group = '120363000000000000@g.us';
  const { db, requests } = fixture({ cliente_whatsapp_inbox: [
    row(1, { chat_jid: group, is_group: true }),
    row(2, { chat_jid: group, cliente_id: OTHER, is_group: true }),
    row(3, { chat_jid: '120363000000000001@g.us', is_group: true }),
    row(4, { chat_jid: group, is_group: true }),
  ] });
  const handlers = new Map<string, any>();
  registerHubTools({ registerTool: (name: string, config: any, handler: any) =>
    handlers.set(name, (args: any) => handler(config.inputSchema.parse(args))) } as any, db, actor);
  const invoke = handlers.get('ver_mensagens_rastreamento');
  assert.throws(() => invoke({ cliente_id: CLIENT, chat_jid: 'group@evil.invalid' }));
  const result = await invoke({ cliente_id: CLIENT, chat_jid: group, limite: 1 });
  assert.notEqual(result.isError, true, result.content[0].text);
  const first = JSON.parse(result.content[0].text);
  assert.equal(first.mensagens[0].id, row(1).id);
  assert.equal(first.continuacao.ferramenta, 'ver_mensagens_rastreamento');
  assert.equal(first.continuacao.argumentos.chat_jid, group);
  const before = requests.filter(url => url.pathname.includes('cliente_whatsapp_')).length;
  for (const changed of [{ cliente_id: OTHER }, { chat_jid: '120363000000000001@g.us' }]) {
    assert.equal((await invoke({ ...first.continuacao.argumentos, ...changed })).isError, true);
  }
  assert.equal(requests.filter(url => url.pathname.includes('cliente_whatsapp_')).length, before);
  const messages = [...first.mensagens];
  let page = first;
  while (page.continuacao) {
    const next = await handlers.get(page.continuacao.ferramenta)(page.continuacao.argumentos);
    assert.notEqual(next.isError, true, next.content[0].text);
    page = JSON.parse(next.content[0].text);
    messages.push(...page.mensagens);
  }
  assert.deepEqual(messages.map(message => message.id), [row(1).id, row(4).id]);
  assert.equal(page.paginacao.concluido, true);
});

test('all clients include webhook-only replies, deduplicate retries and recover full sent text', async () => {
  const long = 'Reply ' + 'x'.repeat(1600);
  const log = (i: number, extra: Row = {}) => row(i, { source: 'chatvolt',
    raw_payload: { eventType: 'AGENT_MESSAGE_SENDED', userPhoneNumber: PHONE, messageId: 'reply-1',
      agentResponse: long, channel: 'whatsapp', createdAt: '2026-01-01T12:00:00Z' }, ...extra });
  const { db } = fixture({
    cliente_whatsapp_inbox: [row(1)],
    cliente_whatsapp_sent: [row(2, { message_id: 'reply-1', body: long.slice(0, 500) })],
    cliente_whatsapp_webhook_log: [log(10), log(11), log(12, { raw_payload: { eventType: 'AGENT_MESSAGE_NOTED' } }),
      log(13, { raw_payload: { eventType: 'AGENT_MESSAGE_SENDED', userPhoneNumber: PHONE,
        messageId: 'reply-2', agentResponse: 'Webhook only', channel: 'whatsapp' } }),
      log(14, { cliente_id: OTHER, raw_payload: { eventType: 'AGENT_MESSAGE_SENDED', userPhoneNumber: PHONE,
        messageId: 'reply-2', agentResponse: 'Other client', channel: 'whatsapp' } })],
  }, 1);
  const messages = await readAll(db, { telefone: PHONE, limite: 1 });
  assert.deepEqual(messages.map(m => m.texto), ['message 1', long, 'Webhook only']);
  const other = await readAll(db, { clienteId: OTHER, telefone: PHONE, limite: 1 });
  assert.deepEqual(other.map(m => m.texto), ['Other client']);
  assert.ok(messages.every(m => !('raw_payload' in m)));
});

test('legacy Meta batches paginate inside the row and period filters use event time', async () => {
  const echoes = Array.from({ length: 5 }, (_, i) => ({ id: `wamid-${i}`, to: PHONE,
    timestamp: String(Date.parse('2025-06-01T12:00:00Z') / 1000 + i), type: 'text', text: { body: `Meta ${i}` } }));
  const { db } = fixture({ cliente_whatsapp_webhook_log: [row(10, { source: 'ingress',
    raw_payload: { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'smb_message_echoes', value: { messaging_product: 'whatsapp', message_echoes: echoes } }] }] } })] }, 1);
  const messages = await readAll(db, { limite: 1, inicio: '2025-06-01', fim: '2025-06-01' });
  assert.equal(messages.length, 5);
  assert.deepEqual(messages.map(m => m.texto), echoes.map(m => m.text.body));
  assert.equal(new Set(messages.map(m => m.message_id)).size, 5);
});

test('empty event pages advance, unknown links stay unassigned, and ID punctuation is literal', async () => {
  const id = 'source:(id,"quoted")';
  const event = (i: number, payload: Row) => row(i, { from_jid: null, phone: null, source: 'chatvolt', raw_payload: payload });
  const raw = { eventType: 'AGENT_MESSAGE_SENDED', conversationId: 'external', organizationId: 'org',
    userPhoneNumber: PHONE, messageId: id, agentResponse: 'A real reply', channel: 'whatsapp' };
  const { db } = fixture({ cliente_whatsapp_webhook_log: [
    event(1, { eventType: 'AGENT_MESSAGE_NOTED', agentResponse: 'Internal note, not speech' }),
    event(2, { eventType: 'AGENT_MESSAGE_BLOCKED', agentResponse: 'Blocked, not speech' }),
    event(3, raw), event(4, raw),
  ] }, 1);
  const first = await consultMensagens(db, { clienteId: CLIENT, telefone: PHONE, limite: 1 });
  assert.equal(first.total, 0);
  assert.equal(first.paginacao.concluido, false);
  assert.ok(first.paginacao.proximo_cursor);
  const messages = await readAll(db, { telefone: PHONE, limite: 1 });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].message_id, id);
});

test('conversation-only Chatvolt links require unique same-client evidence and never another client', async () => {
  const raw = { eventType: 'AGENT_MESSAGE_SENDED', conversationId: 'external-conversation', organizationId: 'org',
    messageId: 'reply-no-phone', agentResponse: 'Resolved reply', channel: 'whatsapp' };
  const inboxRaw = { eventType: 'USER_MESSAGE_RECEIVED', conversationId: 'external-conversation', organizationId: 'org',
    messageId: 'incoming-id', userPhoneNumber: PHONE, userMessage: 'Incoming', channel: 'whatsapp' };
  const incoming = row(1, { message_id: 'incoming-id', raw_payload: inboxRaw });
  const logs = [row(10, { phone: null, from_jid: null, raw_payload: raw })];
  const tables = { cliente_whatsapp_inbox: [incoming], cliente_whatsapp_webhook_log: logs };
  assert.equal((await readAll(fixture(tables, 1).db, { telefone: PHONE, limite: 1 })).length, 2);
  tables.cliente_whatsapp_inbox.push(row(2, { message_id: 'second-id', phone: '5511888880000', from_jid: '5511888880000@s.whatsapp.net',
    raw_payload: { ...inboxRaw, messageId: 'second-id', userPhoneNumber: '5511888880000' } }));
  assert.equal((await readAll(fixture(tables, 1).db, { telefone: PHONE, limite: 1 })).length, 1, 'ambiguous link must not be assigned');
  tables.cliente_whatsapp_inbox = [row(1, { ...incoming, cliente_id: OTHER })];
  assert.equal((await readAll(fixture(tables).db, { telefone: PHONE })).length, 0);
});

test('channel and direction collisions remain distinct, text filters bind continuation and source failures stop', async () => {
  const payload = (channel: string) => ({ eventType: 'AGENT_USER_MESSAGE', userPhoneNumber: PHONE,
    messageId: 'same-id', channel, userMessage: 'Question', agentResponse: 'Answer searchable' });
  const tables = { cliente_whatsapp_webhook_log: [row(1, { raw_payload: payload('whatsapp') }), row(2, { raw_payload: payload('instagram') })] };
  assert.equal((await readAll(fixture(tables, 1).db, { limite: 1 })).length, 4);
  const messages = await readAll(fixture(tables, 1).db, { limite: 1, canal: 'instagram', direcao: 'equipe', busca: 'SEARCHABLE' });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].canal, 'instagram');
  const db = fixture(tables).db;
  const first = await consultMensagens(db, { clienteId: CLIENT, limite: 1, canal: 'instagram' });
  await assert.rejects(consultMensagens(db, { clienteId: CLIENT, cursor: first.paginacao.proximo_cursor!, canal: 'whatsapp' }));
  await assert.rejects(consultMensagens(fixture(tables, 1, 'cliente_whatsapp_webhook_log').db, { clienteId: CLIENT }));
});

test('equal sent/log text still recovers the channel before applying filters', async () => {
  const { db } = fixture({ cliente_whatsapp_sent: [row(1, { message_id: 'channel-id', body: 'Same text' })],
    cliente_whatsapp_webhook_log: [row(2, { raw_payload: { eventType: 'AGENT_MESSAGE_SENDED',
      messageId: 'channel-id', userPhoneNumber: PHONE, channel: 'whatsapp', agentResponse: 'Same text' } })] });
  const messages = await readAll(db, { canal: 'whatsapp', limite: 1 });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].canal, 'whatsapp');
  assert.equal(messages[0].fonte, 'cliente_whatsapp_sent');
});

test('legacy Uazapi stanza IDs reconcile only when the canonical raw proves the full ID', async () => {
  const raw = { event: 'messages', id: 'instance:3EB0ID', message: { chatid: `${PHONE}@s.whatsapp.net`,
    text: 'Legacy message', type: 'text', fromMe: false }, timestamp: 1767268800 };
  const { db } = fixture({ cliente_whatsapp_inbox: [row(1, { message_id: '3EB0ID', body: 'Legacy message', raw_payload: raw })],
    cliente_whatsapp_webhook_log: [row(2, { source: 'uazapi', raw_payload: raw })] }, 1);
  const messages = await readAll(db, { telefone: PHONE, canal: 'whatsapp', limite: 1 });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].message_id, 'instance:3EB0ID');
  assert.equal(messages[0].message_id_armazenado, '3EB0ID');
  assert.ok(messages[0].evidencias.some((e: Row) => e.fonte === 'cliente_whatsapp_webhook_log'));
});

test('purged canonical media is selected and never rehydrated from an unpurged log', async () => {
  const payload = { eventType: 'USER_MESSAGE_RECEIVED', userPhoneNumber: PHONE, messageId: 'media-id',
    userMessage: 'File', channel: 'whatsapp', attachments: [{ url: 'https://fixture.invalid/private-file.jpg', mimeType: 'image/jpeg' }] };
  const { db, requests } = fixture({ cliente_whatsapp_inbox: [row(1, { message_id: 'media-id', type: 'image', body: 'File',
    media_purged_at: '2026-01-02T00:00:00Z', raw_payload: { _mediaPurged: true } })],
    cliente_whatsapp_webhook_log: [row(2, { raw_payload: payload })] });
  const messages = await readAll(db, { telefone: PHONE, limite: 1 });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].midia_expurgada, true);
  assert.deepEqual(messages[0].anexos, []);
  assert.ok(!JSON.stringify(messages).includes('private-file.jpg'));
  assert.ok(requests.filter(r => r.pathname.endsWith('cliente_whatsapp_inbox')).every(r => r.searchParams.get('select')!.split(',').includes('media_purged_at')));
});

test('Meta batch items without recipient remain unassigned despite the envelope phone', async () => {
  const { db } = fixture({ cliente_whatsapp_webhook_log: [row(1, { source: 'ingress',
    raw_payload: { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { messages: [
      { id: 'one', from: PHONE, type: 'text', text: { body: 'Known' } },
      { id: 'two', type: 'text', text: { body: 'Unknown' } },
    ] } }] }] } })] });
  const filtered = await readAll(db, { telefone: PHONE, limite: 1 });
  assert.deepEqual(filtered.map(m => m.texto), ['Known']);
  const all = await readAll(db, { limite: 1 });
  assert.equal(all.length, 2);
  assert.equal(all[1].telefone, null);
  assert.equal(all[1].chat_jid, null);
});
