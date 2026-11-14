import { fail, inputFor, isObject, pick, sanitize, uuid } from './atlasExecutorCrmValidation.js';

const READS = {
  send_context: ['contact_id', 'channel_id'],
  slots: ['owner_id', 'date', 'lead_id', 'appointment_id'],
  calendar_status: [], calendars: ['pageToken'],
  calendar_busy: ['owner_id', 'since', 'until', 'lead_id', 'appointment_id'],
  message_queue: ['contact_id', 'channel_id', 'limit', 'offset'],
};
const DESCRIPTIONS = {
  send_context: 'Confira destinatário, canal, bloqueio e controles atuais antes de preparar send_message. Exige contact_id e channel_id; nunca envia.',
  slots: 'Horários livres oficiais por owner_id e date YYYY-MM-DD. Confere Google Agenda antes dos slots nativos; calendário externo desatualizado impede sugerir horários. lead_id/appointment_id restringem o contexto autorizado.',
  calendar_status: 'Estado da conexão Google Agenda do usuário autenticado; não aceita outro owner_id e não altera OAuth.',
  calendars: 'Agendas Google autorizadas do usuário autenticado, somente leitura. pageToken continua uma página; next_page_token indica cobertura incompleta.',
  calendar_busy: 'Ocupação oficial Google do responsável autorizado entre since/until ISO com fuso. Exige owner_id; lead_id/appointment_id restringem o contexto.',
  message_queue: 'Fila nativa de mensagens: pending não significa sent. Reler após a aprovação para conferir entrega, falha ou resultado incerto. Paginação limit/offset até 200.',
};
export const EXECUTOR_CRM_DELIVERY_CATALOG = Object.freeze([
  ...Object.entries(READS).map(([name, fields]) => ({ app: 'crm', mode: 'read', name, title: `Consultar ${name}`, fields, description: DESCRIPTIONS[name], required: name === 'send_context' ? ['contact_id', 'channel_id'] : name === 'slots' ? ['owner_id', 'date'] : name === 'calendar_busy' ? ['owner_id', 'since', 'until'] : [] })),
  { app: 'crm', mode: 'write', name: 'send_message', title: 'Enfileirar mensagem', fields: ['contact_id', 'channel_id', 'body'], required: ['contact_id', 'channel_id', 'body'],
    description: 'Preparar revisão de mensagem WhatsApp de texto (1 a 4.000 caracteres), destinatário e canal exatos. Aprovação explícita enfileira no CRM nativo e pausa a IA dessa conversa; não comprova envio. Sessão, ACL, bloqueio, canal e versão são revalidados. Não aceita request_id, transporte, anexos ou automação.' },
]);
const links = (clientId, input = {}, page = 'conversas') => [{ label: 'Abrir no CRM IA', href: `/crm-ia/${page}?${new URLSearchParams({ cliente: clientId, ...pick(input, ['contact_id', 'channel_id']) })}` }];

async function rpc(caller, name, args, signal) {
  signal?.throwIfAborted();
  const query = caller.rpc(name, args);
  const response = await (signal && query.abortSignal ? query.abortSignal(signal) : query);
  signal?.throwIfAborted();
  if (response.error || !isObject(response.data) || response.data.error) fail('A fonte oficial do CRM IA está indisponível.', response.error?.code === '42501' ? 'CRM_FORBIDDEN' : 'CONTEXT_UNAVAILABLE', response.error?.code === '42501' ? 403 : 502);
  return response.data;
}
// Opaque pagination data for this fixed, caller-owned Calendar endpoint; never an OAuth credential.
const isCalendarCursor = value => typeof value === 'string' && value.length > 0 && value.length <= 2048 && !/[\s\u0000-\u001f\u007f]/u.test(value);

async function calendar(caller, clientId, action, input, signal) {
  signal?.throwIfAborted();
  const { data, error } = await caller.functions.invoke('crm-ia-calendar', { body: { action, client_id: clientId, ...input }, ...(signal && { signal }) });
  signal?.throwIfAborted();
  if (error || !isObject(data) || data.error) fail('Não foi possível conferir o Google Agenda.', 'CONTEXT_UNAVAILABLE', 502);
  if (action === 'busy' && (typeof data.required !== 'boolean' || data.required && (data.fresh !== true || !Array.isArray(data.busy)))
    || action === 'status' && (typeof data.connected !== 'boolean' || typeof data.status !== 'string')
    || action === 'calendars' && (!Array.isArray(data.rows) || data.next_page_token != null && !isCalendarCursor(data.next_page_token))) fail('O contexto do Google Agenda está incompleto ou desatualizado.', 'CONTEXT_UNAVAILABLE', 502);
  if (action === 'busy') validateBusyCoverage(data,clientId,input);
  if (action === 'calendars') {
    if (['client_id', 'cliente_id'].some(key => Object.hasOwn(data, key) && data[key] !== clientId)) fail('A página do calendário pertence a outro contexto.', 'CONTEXT_UNAVAILABLE', 502);
    return { ...pick(data, ['rows', 'revision']), next_page_token: data.next_page_token ?? null };
  }
  return data;
}
function validateBusyCoverage(data,clientId,input) {
  const identities = { client_id:clientId,cliente_id:clientId,owner_id:input.owner_id,appointment_id:input.appointment_id ?? null,lead_id:input.lead_id ?? null };
  if (Object.entries(identities).some(([key,value]) => Object.hasOwn(data,key) && data[key] !== value)) fail('A ocupação pertence a outro contexto.', 'CONTEXT_UNAVAILABLE', 502);
  if (typeof data.required !== 'boolean' || data.required && (data.fresh !== true || !Array.isArray(data.busy)
    || ![data.since,data.until,input.since,input.until].every(value => typeof value === 'string' && Number.isFinite(Date.parse(value)))
    || Date.parse(data.since) > Date.parse(input.since) || Date.parse(data.until) < Date.parse(input.until))) fail('A ocupação não cobre o período solicitado.', 'CONTEXT_UNAVAILABLE', 502);
}
function readInput(view, input) {
  let payload;
  if (view === 'calendars' && isObject(input) && Object.hasOwn(input, 'pageToken')) {
    if (!isCalendarCursor(input.pageToken)) fail('Página do calendário inválida.');
    const { pageToken, ...rest } = input;
    payload = { ...inputFor(rest, READS[view]), pageToken };
  } else payload = inputFor(input, READS[view]);
  for (const key of ['contact_id', 'channel_id', 'owner_id', 'lead_id', 'appointment_id']) if (payload[key] !== undefined) payload[key] = uuid(payload[key], key, true);
  if (view === 'send_context') { uuid(payload.contact_id, 'contact_id', true); uuid(payload.channel_id, 'channel_id', true); }
  if (['slots', 'calendar_busy'].includes(view)) uuid(payload.owner_id, 'owner_id', true);
  if (view === 'slots') {
    const day = new Date(`${payload.date}T00:00:00Z`);
    if (typeof payload.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(payload.date) || !Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== payload.date) fail('Escolha uma data válida para consultar horários.');
  }
  if (view === 'calendar_busy') {
    if (!['since', 'until'].every(key => typeof payload[key] === 'string' && /T.+(?:Z|[+-]\d{2}:\d{2})$/i.test(payload[key]) && Number.isFinite(new Date(payload[key]).getTime()))
      || new Date(payload.until) <= new Date(payload.since) || new Date(payload.until) - new Date(payload.since) > 31 * 86400000) fail('Período do calendário inválido.');
  }
  if (payload.limit !== undefined && (!Number.isInteger(payload.limit) || payload.limit < 1 || payload.limit > 200) || payload.offset !== undefined && (!Number.isInteger(payload.offset) || payload.offset < 0 || payload.offset > 100000)) fail('Página da fila inválida.');
  return payload;
}
function scopedContext(data, clientId, input) {
  if (data.client_id !== clientId || data.contact_id !== input.contact_id || data.channel_id !== input.channel_id || !isObject(data.snapshot) || !isObject(data.recipient) || !isObject(data.channel)) fail('Destinatário indisponível neste escopo.', 'CRM_FORBIDDEN', 403);
  return data;
}

export async function readExecutorCrmDelivery(caller, { clientId, view, input = {}, signal }) {
  clientId = uuid(clientId, 'client_id', true);
  const envelope = { app: 'crm', view, client_id: clientId, queried_at: new Date().toISOString(), available: false, data: null, links: links(clientId) };
  if (!Object.hasOwn(READS, view)) return { ...envelope, reason: 'Esta leitura não está disponível no CRM IA.' };
  const payload = readInput(view, input);
  try {
    let data;
    if (view === 'send_context') data = scopedContext(await rpc(caller, 'atlas_executor_crm_delivery_context', { p_client: clientId, p_contact: payload.contact_id, p_channel: payload.channel_id }, signal), clientId, payload);
    else if (view === 'slots') {
      const day = new Date(`${payload.date}T00:00:00Z`).getTime();
      const busyInput = { owner_id: payload.owner_id, since: new Date(day - 86400000).toISOString(), until: new Date(day + 2 * 86400000).toISOString(), ...pick(payload, ['lead_id', 'appointment_id']) };
      const busy = await calendar(caller, clientId, 'busy', busyInput, signal);
      if (typeof busy.required !== 'boolean' || busy.required && busy.fresh !== true) fail('A agenda externa precisa ser atualizada antes de oferecer horários.', 'CONTEXT_UNAVAILABLE', 502);
      data = await rpc(caller, 'crm_ia_workspace', { p_action: 'slots', p_client_id: clientId, p_payload: payload }, signal);
      if (!Array.isArray(data.rows) || !Number.isSafeInteger(data.total) || data.total !== data.rows.length) fail('Os horários oficiais estão incompletos.', 'CONTEXT_UNAVAILABLE', 502);
      const after = await rpc(caller,'crm_ia_calendar_workspace',{ p_action:'busy',p_payload:{ client_id:clientId,...pick(payload,['owner_id','lead_id','appointment_id']) } },signal);
      validateBusyCoverage(after,clientId,busyInput);
      if (busy.required !== after.required || busy.required && JSON.stringify(pick(busy,['since','until','checked_at','connection_revision','busy'])) !== JSON.stringify(pick(after,['since','until','checked_at','connection_revision','busy']))) fail('A ocupação mudou durante a consulta de horários.', 'CONTEXT_UNAVAILABLE', 502);
      data = { ...data, calendar: { required: busy.required, fresh: busy.fresh === true } };
    } else if (view === 'message_queue') {
      data = await rpc(caller, 'crm_ia_workspace', { p_action: 'queue', p_client_id: clientId, p_payload: payload }, signal);
      if (!Array.isArray(data.rows) || !Number.isSafeInteger(data.total) || data.total < data.rows.length) fail('A fila oficial está incompleta.', 'CONTEXT_UNAVAILABLE', 502);
    } else data = await calendar(caller, clientId, { calendar_status: 'status', calendars: 'calendars', calendar_busy: 'busy' }[view], payload, signal);
    const nextPageToken = view === 'calendars' ? data.next_page_token : null;
    const state = { truncated: false }, safe = sanitize(data, state), offset = payload.offset || 0;
    // Restore only the typed root cursor from the authorized Calendar response, after redacting rows.
    if (view === 'calendars') safe.next_page_token = nextPageToken;
    return { ...envelope, available: true, data: safe, coverage: { complete: !state.truncated && !nextPageToken && (data.total === undefined || offset === 0 && data.rows.length === data.total), truncated: state.truncated,
      ...(nextPageToken && { next_page_token: nextPageToken }), ...(data.total !== undefined && { offset, limit: payload.limit || 50, total: data.total, next_offset: offset + data.rows.length < data.total ? offset + data.rows.length : null }) },
    links: links(clientId, payload, ['slots', 'calendar_status', 'calendars', 'calendar_busy'].includes(view) ? 'agenda' : 'conversas') };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { ...envelope, reason: error.code === 'CRM_FORBIDDEN' ? 'Acesso ao destinatário ou canal não autorizado.' : 'A fonte oficial está indisponível; não trate essa resposta como ausência de dados.', code: error.code || 'CONTEXT_UNAVAILABLE' };
  }
}

export async function prepareExecutorCrmDelivery(caller, { clientId, action, input = {}, signal }) {
  clientId = uuid(clientId, 'client_id', true);
  if (action !== 'send_message') fail('Esta ação de envio não está disponível.', 'TOOL_DENIED', 403);
  const payload = inputFor(input, ['contact_id', 'channel_id', 'body']);
  uuid(payload.contact_id, 'contact_id', true); uuid(payload.channel_id, 'channel_id', true);
  if (typeof payload.body !== 'string' || payload.body.length > 4000 || !payload.body.trim()) fail('Escreva uma mensagem de até 4.000 caracteres.');
  payload.body = payload.body.trim();
  const context = scopedContext(await rpc(caller, 'atlas_executor_crm_delivery_context', { p_client: clientId, p_contact: payload.contact_id, p_channel: payload.channel_id }, signal), clientId, payload);
  if (context.can_send !== true || context.blocked === true) fail('O destinatário ou canal não permite envio no estado atual.', 'CRM_FORBIDDEN', 403);
  const state = { truncated: false }, before = sanitize({ recipient: context.recipient, channel: context.channel, conversation: context.conversation }, state);
  return { app: 'crm', action, client_id: clientId, title: 'Revisar mensagem WhatsApp',
    payload: { ...payload, expected: structuredClone(context.snapshot) }, before,
    effect: { type: 'message', external: true, enables_autonomy: false },
    preview: { before, after: { recipient: before.recipient, channel: before.channel, body: payload.body, attendance: 'Humano (IA pausada)', delivery: 'Enfileirar na fila nativa. A entrega será confirmada separadamente.' } }, links: links(clientId, payload) };
}
