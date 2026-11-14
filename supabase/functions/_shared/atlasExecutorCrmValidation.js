import { AtlasError, optionalUuid } from './atlasCore.js';
import { normalizeCrmIaAudio } from './crmIaVoice.js';

const SENSITIVE_KEY = /^(?:.*(?:secret|password|senha|authorization|(?:access|api)[_-]?key|service[_-]?role).*|.*token|raw_payload|__proto__|constructor|prototype)$/i;
const SECRET_TEXT = /\b(?:sk-[a-z0-9_-]{12,}|eyJ[a-z0-9_.-]{30,}|Bearer\s+\S+)|\b(?:senha|password|api.?key|token)\s*[:=]\s*\S+/gi;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const pick = (row, fields) => Object.fromEntries(fields.filter(key => Object.hasOwn(row || {}, key)).map(key => [key, row[key]]));
const fail = (message, code = 'INVALID_INPUT', status = 400) => { throw new AtlasError(code, message, status); };
function uuid(value, field, required = false) {
  const result = optionalUuid(value, field);
  if (required && !result) fail(`Informe ${field}.`);
  return result;
}
function checkContent(value, depth = 0) {
  if (depth > 12) fail('Conteúdo CRM muito profundo.');
  if (typeof value === 'string') {
    if (value.replace(SECRET_TEXT, '[segredo removido]') !== value) fail('Não inclua credenciais no pedido do CRM.');
  } else if (Array.isArray(value)) {
    for (const item of value) checkContent(item, depth + 1);
  } else if (isObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(key) || /^(?:p_action|p_payload|p_client_id|client_id|cliente_id|clientId|rpc|table|sql)$/i.test(key)) fail('Campo de escopo ou credencial não permitido no CRM.');
      checkContent(item, depth + 1);
    }
  } else if (value !== null && !['boolean', 'number', 'undefined'].includes(typeof value)) fail('Conteúdo CRM inválido.');
  if (typeof value === 'number' && !Number.isFinite(value)) fail('Número CRM inválido.');
}
function inputFor(input, fields) {
  if (!isObject(input) || JSON.stringify(input).length > 60000) fail('Dados do CRM inválidos.');
  checkContent(input);
  if (Object.keys(input).some(key => !fields.includes(key))) fail('Campo não permitido nesta operação do CRM.');
  return structuredClone(input);
}
function merge(current, changes) {
  const result = structuredClone(current || {});
  for (const [key, value] of Object.entries(changes)) result[key] = isObject(value) && isObject(result[key]) ? merge(result[key], value) : structuredClone(value);
  return result;
}
function sanitize(value, state, depth = 0) {
  if (depth > 12) { state.truncated = true; return '[conteúdo limitado]'; }
  if (typeof value === 'string') {
    if (value.length > 30000) state.truncated = true;
    return value.slice(0, 30000).replace(SECRET_TEXT, '[segredo removido]');
  }
  if (Array.isArray(value)) {
    if (value.length > 200) state.truncated = true;
    return value.slice(0, 200).map(item => sanitize(item, state, depth + 1));
  }
  if (isObject(value)) return Object.fromEntries(Object.entries(value).filter(([key]) => !SENSITIVE_KEY.test(key)).map(([key, item]) => [key, sanitize(item, state, depth + 1)]));
  return value;
}
function existing(rows, id, label) {
  const row = rows.find(item => item.id === id);
  if (!row) fail(`${label} indisponível nesta conta.`, 'CRM_FORBIDDEN', 403);
  return row;
}
function version(row) {
  if (!row?.updated_at || !Number.isFinite(new Date(row.updated_at).getTime())) fail('A fonte não contém a versão atual do registro.', 'CONTEXT_UNAVAILABLE', 502);
  return row.updated_at;
}
function text(value, label, max, required = false) {
  if ((value == null && required) || value != null && (typeof value !== 'string' || value.length > max || required && !value.trim())) fail(`Revise ${label}.`);
}
function booleans(value, fields) {
  if (fields.some(key => Object.hasOwn(value, key) && typeof value[key] !== 'boolean')) fail('Controles do CRM devem usar valores booleanos.');
}
function list(value, max = 200) {
  if (!Array.isArray(value) || value.length > max) fail('Lista CRM inválida ou acima do limite.');
  return value;
}
function numeric(value, key, min, max, integer = true) {
  if (value[key] != null && (typeof value[key] !== 'number' || !Number.isFinite(value[key]) || value[key] < min || value[key] > max || integer && !Number.isInteger(value[key]))) fail(`Revise ${key}.`);
}
function availability(value, workspace) {
  if (value.timezone != null) {
    try { new Intl.DateTimeFormat('pt-BR', { timeZone: value.timezone }).format(); } catch { fail('Fuso da disponibilidade inválido.'); }
  }
  for (const key of ['duration_minutes', 'interval_minutes']) numeric(value, key, 5, 720);
  for (const key of ['buffer_before', 'buffer_after']) numeric(value, key, 0, 240);
  numeric(value, 'min_notice_hours', 0, 720, false); numeric(value, 'horizon_days', 1, 366); numeric(value, 'max_per_day', 1, 200);
  for (const window of list(value.windows || [])) {
    existing(workspace.people, uuid(window.owner_id, 'owner_id', true), 'Responsável');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(window.start || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(window.end || '') || window.start >= window.end
      || !list(window.days, 7).length || window.days.some(day => !Number.isInteger(day) || day < 0 || day > 6)) fail('Janela de disponibilidade inválida.');
  }
}
function validateConfig(payload, workspace) {
  const data = payload.data;
  booleans(data, ['enabled', 'auto_send', 'pause_on_human', 'show_attendant_name', 'restart_triage', 'include_unassigned', 'appointment_confirm', 'appointment_reschedule', 'appointment_cancel', 'no_show_recovery']);
  if (payload.section === 'availability') availability(data, workspace);
  if (payload.section === 'knowledge') {
    for (const assignment of list(data.assignments || [])) { existing(workspace.pipelines, uuid(assignment.pipeline_id, 'pipeline_id', true), 'Funil'); existing(workspace.bases, uuid(assignment.base_id, 'base_id', true), 'Base'); }
    if (data.concierge_base_id) existing(workspace.bases, uuid(data.concierge_base_id, 'base_id', true), 'Base do Concierge');
  }
  if (payload.section === 'entry') for (const channel of list(data.channels || [])) {
    const current = existing(workspace.channels, uuid(channel.channel_id, 'channel_id', true), 'Canal');
    if (current.can_send !== true) fail('Canal de entrada indisponível para envio.', 'CRM_FORBIDDEN', 403);
    booleans(channel, ['enabled']);
    if (channel.mode != null && !['all', 'phrase'].includes(channel.mode) || channel.enabled && channel.mode === 'phrase' && !channel.phrase?.trim()) fail('Modo ou frase de entrada inválido.');
    if (channel.enabled) {
      existing(workspace.pipelines, uuid(channel.pipeline_id, 'pipeline_id', true), 'Funil');
      if (existing(workspace.stages, uuid(channel.stage_id, 'stage_id', true), 'Etapa').pipeline_id !== channel.pipeline_id) fail('Etapa de entrada fora do funil.');
    }
  }
  if (payload.section === 'distribution') {
    if (data.strategy != null && !['round_robin', 'least_loaded'].includes(data.strategy) || list(data.sources || []).some(source => !['whatsapp', 'meta', 'site'].includes(source))) fail('Distribuição inválida.');
    for (const person of list(data.people || [])) { existing(workspace.people, uuid(person.owner_id, 'owner_id', true), 'Responsável'); numeric(person, 'weight', 1, 5); numeric(person, 'limit', 0, 1000000); }
    if (data.fallback_owner_id) existing(workspace.people, uuid(data.fallback_owner_id, 'owner_id', true), 'Responsável');
  }
  if (payload.section === 'test_mode' && (list(data.phones || [], 200).some(phone => typeof phone !== 'string' || !/^\d{10,15}$/.test(phone.replace(/\D/g, ''))) || data.enabled && !data.phones?.length)) fail('Informe os telefones autorizados para teste.');
}
function validatePayload(action, payload, workspace, before) {
  for (const key of ['id', 'pipeline_id', 'stage_id', 'owner_id', 'contact_id', 'responsavel_id', 'assigned_to', 'request_id']) if (payload[key] != null) uuid(payload[key], key);
  if (payload.pipeline_id) existing(workspace.pipelines, payload.pipeline_id, 'Funil');
  if (payload.stage_id) {
    const stage = existing(workspace.stages, payload.stage_id, 'Etapa');
    if (payload.pipeline_id && stage.pipeline_id !== payload.pipeline_id) fail('A etapa não pertence ao funil selecionado.');
  }
  if (['save_pipeline', 'save_stage'].includes(action)) text(payload.nome, 'o nome', 100, true);
  if (action === 'save_pipeline') booleans(payload, ['is_default']);
  if (action === 'save_stage') {
    uuid(payload.pipeline_id, 'pipeline_id', true);
    if (!/^#[0-9a-f]{6}$/i.test(payload.color || '#6366f1') || !['intermediaria', 'ganho', 'perdido'].includes(payload.tipo || 'intermediaria') || payload.ordem != null && !Number.isInteger(payload.ordem)) fail('Revise a etapa.');
  }
  if (action === 'save_base') { text(payload.nome, 'o nome da base', 80, true); text(payload.conteudo, 'o conteúdo da base', 30000); }
  if (action === 'save_product') {
    text(payload.name, 'o produto', 200, true);
    const details = payload.crm_ia_details || {};
    if (!isObject(details) || details.price != null && (typeof details.price !== 'number' || !Number.isFinite(details.price) || details.price < 0) || details.url && !/^https:\/\//.test(details.url)) fail('Revise preço e link HTTPS do produto.');
    text(details.description, 'a descrição do produto', 5000);
    if (!['produto', 'servico'].includes(payload.item_tipo)) fail('Tipo de produto inválido.');
  }
  if (action === 'save_agent') {
    text(payload.nome, 'o nome do agente', 60, true); text(payload.objetivo, 'o objetivo', 500); text(payload.instrucoes, 'as instruções', 8000);
    if (!['openai/gpt-4o-mini', 'openai/gpt-4o'].includes(payload.modelo) || !['cordial', 'formal', 'descontraido', 'direto', 'entusiasmado'].includes(payload.tom)) fail('Modelo ou tom do agente indisponível.');
    if (!Array.isArray(payload.base_ids) || !Array.isArray(payload.setor_ids) || typeof payload.ativo !== 'boolean' || typeof payload.auto_responder !== 'boolean') fail('Revise os vínculos e controles do agente.');
    payload.base_ids.forEach(id => existing(workspace.bases, uuid(id, 'base_id', true), 'Base'));
    const rules = payload.funil?.crm_ia;
    if (!isObject(rules) || !['qualificacao', 'followup', 'agendamento'].includes(rules.tipo)) fail('Tipo do agente inválido.');
    existing(workspace.pipelines, uuid(rules.pipeline_id, 'pipeline_id', true), 'Funil');
    if (!Array.isArray(rules.stage_ids) || rules.stage_ids.some(id => existing(workspace.stages, uuid(id, 'stage_id', true), 'Etapa').pipeline_id !== rules.pipeline_id)) fail('Etapas do agente inválidas.');
    normalizeCrmIaAudio(rules.audio);
  }
  if (action === 'save_config') validateConfig(payload, workspace);
  if (action === 'save_lead') {
    text(payload.nome, 'o nome do lead', 200, true); text(payload.observacoes, 'as observações', 10000); text(payload.email, 'o e-mail', 254);
    if (typeof payload.whatsapp !== 'string' || !/^\d{10,15}$/.test(payload.whatsapp.replace(/\D/g, '')) || payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) || payload.valor != null && (typeof payload.valor !== 'number' || !Number.isFinite(payload.valor) || payload.valor < 0)) fail('Revise telefone, e-mail e valor do lead.');
    if (!isObject(payload.crm_ia_fields) || !Array.isArray(payload.etiquetas) || payload.etiquetas.length > 50 || payload.etiquetas.some(tag => typeof tag !== 'string' || !tag.trim() || tag.trim().length > 100)) fail('Campos ou etiquetas do lead inválidos.');
  }
  if ((action === 'move_lead' || action === 'save_lead' && before) && payload.stage_id !== before?.stage_id) {
    uuid(payload.stage_id, 'stage_id', true);
    const stage = existing(workspace.stages, payload.stage_id, 'Etapa');
    if (['ganho', 'perdido'].includes(stage.tipo)) text(payload.reason, 'o motivo de ganho ou perda', 4000, true);
  }
  if (action === 'save_appointment') {
    uuid(payload.owner_id, 'owner_id', true); uuid(payload.request_id, 'request_id', true); text(payload.title, 'o título do compromisso', 200, true); text(payload.notes, 'as notas do compromisso', 4000);
    const start = new Date(payload.start_at).getTime(), end = new Date(payload.end_at).getTime();
    if (![payload.start_at, payload.end_at].every(value => typeof value === 'string' && /T.+(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 12 * 3600000 || !['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'].includes(payload.status || 'scheduled')) fail('Horário, fuso ou estado do compromisso inválido.');
  }
  if (action === 'save_conversation') {
    uuid(payload.contact_id, 'contact_id', true); uuid(payload.channel_id, 'channel_id', true);
    if (!['ai', 'human', 'resolved'].includes(payload.attendance)) fail('Situação do atendimento inválida.');
    if (payload.attendance === 'ai' && workspace.config.data.attendance?.auto_send !== true) fail('A autonomia geral precisa estar habilitada antes de devolver a conversa à IA.');
  }
  checkContent(payload);
}


export { isObject, pick, fail, uuid, inputFor, merge, sanitize, existing, version, validatePayload };
