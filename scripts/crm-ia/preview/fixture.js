import { agendaCivilDate } from '../../../src/components/crm-ia/crmIaAgendaLayout.js';
import { normalizeCrmIaAudio } from '../../../supabase/functions/_shared/crmIaVoice.js';

export const PREVIEW_IDS = Object.freeze({
  clientA: '11111111-1111-4111-8111-111111111111', clientB: '22222222-2222-4222-8222-222222222222',
  person: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', otherPerson: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  pipelineA: '31111111-1111-4111-8111-111111111111', pipelineB: '32222222-2222-4222-8222-222222222222',
  stageA: '41111111-1111-4111-8111-111111111111', progressA: '42111111-1111-4111-8111-111111111111', wonA: '43111111-1111-4111-8111-111111111111',
  stageB: '42222222-2222-4222-8222-222222222222', leadA: '51111111-1111-4111-8111-111111111111', leadB: '52222222-2222-4222-8222-222222222222',
  contactA: '61111111-1111-4111-8111-111111111111', contactB: '62222222-2222-4222-8222-222222222222',
  channelA: '71111111-1111-4111-8111-111111111111', channelA2: '72111111-1111-4111-8111-111111111111', channelB: '72222222-2222-4222-8222-222222222222',
});

export const rejectPreviewNetwork = async () => { throw new Error('Rede bloqueada na prévia isolada do CRM IA.'); };
const copy = value => structuredClone(value);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const READS = new Set(['overview', 'leads', 'lead', 'conversations', 'conversation_context', 'notifications', 'messages', 'agenda', 'slots', 'queue', 'usage', 'agent_draft']);
const PERSONAL = new Set(['mark_notifications_read', 'flag_ai_message']);
const FLAG_CATEGORIES = new Set(['off_topic', 'missing_information', 'inappropriate_tone', 'too_long', 'incorrect_information', 'wrong_tool', 'other']);
const ADMIN = new Set(['save_config', 'save_pipeline', 'save_stage', 'reorder_stages', 'delete_pipeline', 'delete_stage', 'save_agent', 'save_base', 'save_product', 'save_template', 'apply_template', 'provision', 'agent_draft', 'save_agent_draft', 'publish_agent_draft', 'discard_agent_draft']);
const normalize = value => String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const phone = value => String(value || '').replace(/\D/g, '');
const notificationOff = () => ({ enabled: false, recipient: { type: 'lead_owner', person_id: null, phone: null } });
function fail(message, code = '22023') { throw Object.assign(new Error(message), { code }); }
function tagList(value) {
  if (!Array.isArray(value) || value.length>50 || value.some(item => typeof item!=='string' || !item.trim() || item.trim().length>100)) fail('Informe até 50 etiquetas de texto, com até 100 caracteres cada.');
  return [...new Set(value.map(item => item.trim()))];
}

function zonedTime(day, time, timezone) {
  const target = Date.parse(`${day}T${time}:00Z`);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(target)).map(part => [part.type, part.value]));
  const visible = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return new Date(target + target - visible).toISOString();
}

export function createCrmPreview({ state = 'ready', now = new Date().toISOString(), role = state === 'consulta' ? 'colaborador' : 'superadmin' } = {}) {
  const clock = Date.parse(now);
  let serial = 1000;
  const id = () => `00000000-0000-4000-8000-${(++serial).toString(16).padStart(12, '0')}`;
  const stamp = () => new Date(clock + ++serial).toISOString();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(clock));
  const ago = minutes => new Date(clock - minutes * 60000).toISOString();
  const dayAgo = days => new Date(Date.parse(today + 'T12:00:00Z') - days * 86400000).toISOString().slice(0, 10);
  const people = [{ id: PREVIEW_IDS.person, full_name: 'Luana de demonstração' }, { id: PREVIEW_IDS.otherPerson, full_name: 'Caio de demonstração' }];
  const profile = { id: PREVIEW_IDS.person, full_name: 'Luana de demonstração', role, status: 'active' };
  const requests = [];
  const errorsSeen = new Set();
  const importReceipts = new Map();
  const agentDrafts = new Map();
  const feedSnapshots = new Map();
  const feedReads = new Map();
  const messageFlags = new Map();
  const accounts = new Map();

  function seed(clientId, second) {
    const pipelineId = second ? PREVIEW_IDS.pipelineB : PREVIEW_IDS.pipelineA;
    const stageId = second ? PREVIEW_IDS.stageB : PREVIEW_IDS.stageA;
    const ownerId = second ? PREVIEW_IDS.otherPerson : PREVIEW_IDS.person;
    const channelId = second ? PREVIEW_IDS.channelB : PREVIEW_IDS.channelA;
    const contactId = second ? PREVIEW_IDS.contactB : PREVIEW_IDS.contactA;
    const leadId = second ? PREVIEW_IDS.leadB : PREVIEW_IDS.leadA;
    const client = { id: clientId, empresa: second ? 'Ateliê fictício Horizonte' : 'Escritório de demonstração' };
    const pipelines = [{ id: pipelineId, cliente_id: clientId, nome: second ? 'Relacionamento da conta B' : 'Comercial principal', is_default: true, crm_ia_default: true, created_at: ago(3000), updated_at: ago(100) }];
    const stages = [{ id: stageId, pipeline_id: pipelineId, nome: 'Entrada', ordem: 0, tipo: 'intermediaria', color: '#74a1df', etapas_permitidas: [], acoes_obrigatorias: [], updated_at: ago(100) }, { id: second ? id() : PREVIEW_IDS.progressA, pipeline_id: pipelineId, nome: 'Em conversa', ordem: 1, tipo: 'intermediaria', color: '#bca2de', etapas_permitidas: [], acoes_obrigatorias: [], updated_at: ago(100) }, { id: second ? id() : PREVIEW_IDS.wonA, pipeline_id: pipelineId, nome: 'Ganho', ordem: 2, tipo: 'ganho', color: '#73a58a', etapas_permitidas: [], acoes_obrigatorias: [], updated_at: ago(100) }];
    const channels = [{ id: channelId, instance_name: second ? 'Canal da conta B' : 'Recepção de demonstração', is_active: true, phone: second ? '5511000000002' : '5511000000001', can_send: true }];
    if (!second) channels.push({ id: PREVIEW_IDS.channelA2, instance_name: 'Segundo canal de demonstração', is_active: true, phone: '5511000000003', can_send: true });
    const contacts = [{ id: contactId, cliente_id: clientId, from_jid: second ? '5511000000022@s.whatsapp.net' : '5511000000011@s.whatsapp.net', phone: second ? '5511000000022' : '5511000000011', sender_name: second ? 'Pessoa fictícia Beta' : 'Pessoa fictícia Alfa', nome: second ? 'Pessoa fictícia Beta' : 'Pessoa fictícia Alfa', updated_at: ago(20) }];
    const leads = [{ id: leadId, cliente_id: clientId, nome: contacts[0].nome, whatsapp: contacts[0].phone, email: second ? 'beta@fixture.invalid' : 'alfa@fixture.invalid', valor: second ? 320 : 180, pipeline_id: pipelineId, stage_id: stageId, responsavel_id: ownerId, origem: 'Site', observacoes: 'Registro totalmente sintético para conferir edição e navegação.', etiquetas: ['Demonstração'], qualificado: false, data_entrada: dayAgo(1), created_at: ago(1500), updated_at: ago(20), contact_id: contactId, crm_ia_contact_id: contactId, archived_at: null, crm_ia_archived_at: null, crm_ia_fields: { interesse: 'Serviço de exemplo' } }];
    if (!second && !['vazio', 'empty'].includes(state)) {
      for (const [name, stage, value, age] of [['Pessoa fictícia Gama', stages[1].id, 250, 2], ['Pessoa fictícia Delta', stages[2].id, 540, 3]]) leads.push({ ...leads[0], id: id(), nome: name, whatsapp: `5511000000${leads.length + 20}`, valor: value, stage_id: stage, data_entrada: dayAgo(age), created_at: ago(age * 1440), contact_id: null, crm_ia_contact_id: null, qualificado: true });
    }
    const messages = [{ id: id(), contact_id: contactId, channel_id: channelId, body: 'Olá! Gostaria de conhecer o serviço de demonstração.', created_at: ago(85), from_me: false, media_url: null, media_type: 'text' }, { id: id(), contact_id: contactId, channel_id: channelId, body: 'Podemos conversar sobre a sua necessidade. Qual período funciona melhor?', created_at: ago(70), from_me: true, media_url: null, media_type: 'text' }];
    if (!second) messages.push({ id: id(), contact_id: contactId, channel_id: PREVIEW_IDS.channelA2, body: 'Mensagem sintética exclusiva do segundo canal.', created_at: ago(40), from_me: false, media_url: null, media_type: 'text' });
    const base = { id: id(), cliente_id: clientId, nome: 'Conhecimento de demonstração', conteudo: 'Empresa fictícia. Atendimento de segunda a sexta, das 9h às 18h.\nFAQ: esta prévia não consulta provedores ou clientes reais.', created_at: ago(500), updated_at: ago(100) };
    const agents = [['qualificacao', 'Qualificação'], ['followup', 'Follow-up'], ['agendamento', 'Agendamentos']].map(([type, title], index) => ({ id: id(), cliente_id: clientId, nome: `${title} de demonstração`, objetivo: `Organizar ${title.toLowerCase()} com registros sintéticos.`, instrucoes: 'Use somente o conhecimento autorizado da conta. Dados fictícios de QA.', tom: 'cordial', modelo: 'openai/gpt-4o-mini', ativo: true, auto_responder: false, base_ids: [base.id], setor_ids: [], created_at: ago(500), updated_at: ago(100), funil: { perguntas: [], criterio: '', destino_tipo: 'proximo', crm_ia: { tipo: type, pipeline_id: pipelineId, stage_ids: [stages[Math.min(index, 1)].id], idiomas: ['pt'], audio: 'nunca', variaveis: type === 'qualificacao' ? [{ nome: 'Interesse', pergunta: 'Qual serviço você procura?' }] : [], gatilhos: ['Quero falar com uma pessoa'], janelas: [{ dias: [1, 2, 3, 4, 5], inicio: '09:00', fim: '18:00' }], cadencia: type === 'followup' ? [{ valor: 1, unidade: 'horas' }, { valor: 1, unidade: 'dias' }] : [], destino: { tipo: 'humano' }, agendamento: { duration_minutes: 30, interval_minutes: 30, owner_id: ownerId } } } }));
    agents[0].funil.crm_ia.profiles=[{id:id(),nome:'Busca orientação',cor:'#74a1df',descricao:'Pessoa de demonstração procura orientação sobre um serviço.',pistas:['Quero entender o serviço'],actions:{owner_id:null,tags:['Interesse']}}];
    agents.forEach(agent => { agent.funil.crm_ia.notification = notificationOff(); agent.funil.crm_ia.agendamento.notify_owner = false; });
    const config = { revision: id(), data: { attendance: { auto_send: false, pause_on_human: true, show_attendant_name: false, restart_triage: false, quick_replies: [{ shortcut: 'ola', text: 'Olá! Como podemos ajudar? Este é um texto sintético revisável.' }] }, knowledge: { assignments: [{ pipeline_id: pipelineId, base_id: base.id }], concierge_base_id: base.id }, availability: { timezone: 'America/Sao_Paulo', duration_minutes: 30, interval_minutes: 30, buffer_before: 0, buffer_after: 0, min_notice_hours: 1, horizon_days: 60, max_per_day: 8, windows: [{ owner_id: ownerId, days: [0, 1, 2, 3, 4, 5, 6], start: '09:00', end: '18:00' }], exceptions: [] }, distribution: { enabled: false, strategy: 'round_robin', sources: [], people: [], include_unassigned: false, fallback_owner_id: null }, entry: { enabled: false, channels: [] }, custom_fields: { fields: [{ key: 'interesse', name: 'Interesse', type: 'text', active: true, folder: 'Qualificação' }] }, test_mode: { enabled: false, phones: [] }, concierge: { enabled: false, base_id: base.id, mode: 'outside_hours', human_wait_minutes: 10 } } };
    const appointments = [{ id: id(), cliente_id: clientId, lead_id: leadId, contact_id: contactId, owner_id: ownerId, start_at: `${today}T15:00:00.000Z`, end_at: `${today}T15:30:00.000Z`, busy_start_at: `${today}T15:00:00.000Z`, busy_end_at: `${today}T15:30:00.000Z`, title: 'Conversa de demonstração', notes: 'Compromisso fictício, sem Google Agenda.', status: 'scheduled', request_id: id(), created_by: profile.id, created_at: ago(100), updated_at: ago(100) }];
    const queue = [{ id: id(), contact_id: contactId, whatsapp_config_id: channelId, body: 'Retorno agendado de demonstração. Não será enviado automaticamente.', scheduled_at: new Date(clock + 3600000).toISOString(), status: 'pending', kind: 'manual', created_at: ago(30), error_code: null, sent_at: null, request_id: id(), created_by: profile.id }];
    if (['controles-conversa', 'origem-ia-adulterada', 'origem-ia-duplicada'].includes(state) || state === 'autoria-mensagens' && !second) {
      const answer = messages[1];
      Object.assign(answer, { sender_kind: 'automation', message_id: id() });
      queue.push({ id: id(), contact_id: contactId, whatsapp_config_id: channelId, body: answer.body, kind: 'reply', status: 'sent', provider_message_id: answer.message_id, agent_run_id: id(), scheduled_at: answer.created_at, created_at: answer.created_at, sent_at: answer.created_at, request_id: id(), created_by: profile.id });
      queue.push({ id: id(), contact_id: contactId, whatsapp_config_id: channelId, body: 'Resumo fictício da qualificação. Sem transporte externo.', kind: 'notification', status: 'pending', scheduled_at: new Date(clock + 7200000).toISOString(), created_at: ago(20), request_id: id(), created_by: profile.id, recipient_label: 'Caio de demonstração', recipient_phone: '5511000000099', source_lead: { id: leadId, nome: leads[0].nome, whatsapp: leads[0].whatsapp }, contact: { id: contactId, nome: contacts[0].nome }, channel_name: channels[0].instance_name });
      if (state === 'origem-ia-adulterada') answer.body = 'Texto sintético alterado sem corresponder à outbox.';
      if (state === 'origem-ia-duplicada') messages.push({ ...answer, id: id() });
    }
    if (state === 'autoria-mensagens' && !second) {
      contacts[0].profile_pic_url = new URL('../../../src/assets/crm-ia/crm-ia-avatar-v1.png', import.meta.url).href;
      people[0].avatar_url = new URL('../../../src/assets/cs-ia/cs-ia-avatar-v1.png', import.meta.url).href;
      const outgoing = (messageId, providerId, body, age, kind = 'human') => ({ id: messageId, cliente_id: clientId, contact_id: contactId, channel_id: channelId, whatsapp_config_id: channelId, to_jid: contacts[0].from_jid, body, created_at: ago(age), from_me: true, media_url: null, media_type: 'text', message_id: providerId, sent_by: ownerId, sender_kind: kind });
      const human = outgoing('81111111-1111-4111-8111-111111111111', 'preview-human-delivery-a', 'Conferi sua solicitação e preparei os próximos passos.', 24);
      const legacy = outgoing('82111111-1111-4111-8111-111111111111', 'preview-legacy-unverified-a', 'Mensagem legada: a origem deste envio não foi confirmada.', 18);
      const automation = outgoing('83111111-1111-4111-8111-111111111111', 'preview-automation-a', 'Aviso automático sintético, sem prova de resposta de IA.', 14, 'automation');
      const mismatchedBody = outgoing('84111111-1111-4111-8111-111111111111', 'preview-body-mismatch-a', 'Mensagem sem autoria comprovada: o texto diverge do recibo.', 11);
      const mismatchedChannel = outgoing('85111111-1111-4111-8111-111111111111', 'preview-channel-mismatch-a', 'Mensagem sem autoria comprovada: o recibo pertence a outro canal.', 8);
      for (const [message, overrides] of [[human, {}], [mismatchedBody, { body: 'Recibo de um texto diferente.' }], [mismatchedChannel, { whatsapp_config_id: PREVIEW_IDS.channelA2 }]]) queue.push({ id: id(), cliente_id: clientId, contact_id: contactId, whatsapp_config_id: channelId, body: message.body, kind: 'manual', status: 'sent', agent_run_id: null, provider_message_id: message.message_id, created_by: ownerId, scheduled_at: message.created_at, created_at: message.created_at, sent_at: message.created_at, request_id: id(), ...overrides });
      messages.push(...Array.from({ length: 56 }, (_, index) => ({ id: id(), contact_id: contactId, channel_id: channelId, body: `Histórico sintético ${index + 1}: informação anterior do contato para conferir a paginação.`, created_at: ago(120 + index), from_me: false, media_url: null, media_type: 'text' })), human, legacy, automation, mismatchedBody, mismatchedChannel,
        { id: '86111111-1111-4111-8111-111111111111', contact_id: contactId, channel_id: channelId, body: 'Recebi as orientações. Obrigada pelo atendimento de demonstração!', created_at: ago(4), from_me: false, media_url: null, media_type: 'text' });
    }
    const empty = ['vazio', 'empty'].includes(state);
    return { client, pipelines, stages, agents, bases: [base], products: [{ id: id(), cliente_id: clientId, name: 'Serviço de demonstração', code: 'QA-01', item_tipo: 'servico', crm_ia_details: { description: 'Item sintético, sem venda ou cobrança.', price: 180, url: '', active: true, media: [] }, created_at: ago(100), updated_at: ago(100) }], config, channels, contacts: empty ? [] : contacts, leads: empty ? [] : leads, messages: empty ? [] : messages, appointments: empty ? [] : appointments, queue: empty ? [] : queue, states: { [contactId]: { attendance: 'human', assigned_to: ownerId, awaiting_since: ago(55), updated_at: ago(20) } }, events: [{ id: id(), lead_id: leadId, stage_anterior_id: null, stage_nova_id: stageId, user_id: ownerId, realizado_em: ago(1500), motivo_ganho_perdido: null, metadados: { source: 'crm-ia' } }], usage: empty ? [] : agents.map(agent => ({ id: agent.id, nome: agent.nome, responses: 1, tokens: 120 })), provisioned: state !== 'nao-provisionado' || second };
  }
  accounts.set(PREVIEW_IDS.clientA, seed(PREVIEW_IDS.clientA, false));
  accounts.set(PREVIEW_IDS.clientB, seed(PREVIEW_IDS.clientB, true));
  const templates = [{ id: id(), owner_id: profile.id, nome: 'Funil de demonstração', tipo: 'pipeline', nicho: 'Serviços fictícios', data: { nome: 'Funil copiado', stages: [{ nome: 'Primeiro contato', color: '#74a1df', tipo: 'intermediaria', ordem: 0 }, { nome: 'Concluído', color: '#73a58a', tipo: 'ganho', ordem: 1 }] }, revision: id(), created_at: ago(100), updated_at: ago(100) }];
  const manage = role !== 'colaborador';
  const version = (item, expected) => { if (!item || item.updated_at !== expected) fail('O registro mudou de versão. Atualize antes de salvar.', '40001'); };
  const contact = (account, key) => { const item = account.contacts.find(row => row.id === key); if (!item) fail('Sem acesso a este contato.', '42501'); return item; };
  const channel = (account, key) => { const item = account.channels.find(row => row.id === key); if (!item) fail('Sem acesso a este canal.', '42501'); return item; };
  const lead = (account, key) => { const item = account.leads.find(row => row.id === key); if (!item) fail('Lead indisponível ou sem acesso.', '42501'); return item; };
  function notificationConfig(rules) {
    const value = rules.notification === undefined ? {} : rules.notification;
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['enabled', 'recipient'].includes(key)) || Object.hasOwn(value, 'enabled') && typeof value.enabled !== 'boolean') fail('Configuração do destinatário inválida.');
    const recipient = value.recipient === undefined ? {} : value.recipient;
    if (!recipient || typeof recipient !== 'object' || Array.isArray(recipient) || Object.keys(recipient).some(key => !['type', 'person_id', 'phone'].includes(key)) || ['person_id', 'phone'].some(key => recipient[key] != null && typeof recipient[key] !== 'string')) fail('Destinatário inválido.');
    const type = recipient.type ?? 'lead_owner', enabled = value.enabled ?? false;
    if (!['lead_owner', 'person', 'phone'].includes(type) || enabled && rules.tipo !== 'qualificacao') fail('Tipo de destinatário indisponível.');
    let person_id = null, recipientPhone = null;
    if (type === 'person') {
      person_id = recipient.person_id || null;
      if (person_id && !uuidPattern.test(person_id)) fail('Pessoa destinatária inválida.');
      if (enabled && !people.some(item => item.id === person_id)) fail('Pessoa destinatária indisponível nesta conta.', '42501');
    } else if (type === 'phone') {
      let digits = /^[+0-9 ().-]+$/.test(recipient.phone || '') ? phone(recipient.phone) : '';
      if ([10, 11].includes(digits.length)) digits = `55${digits}`;
      recipientPhone = /^55[1-9][0-9]{9,10}$/.test(digits) ? digits : null;
      if (enabled && !recipientPhone) fail('Informe um telefone brasileiro com DDD para o destinatário.');
    }
    if (Object.hasOwn(rules.agendamento || {}, 'notify_owner') && typeof rules.agendamento.notify_owner !== 'boolean' || rules.agendamento?.notify_owner && rules.tipo !== 'agendamento') fail('Aviso ao titular do agendamento inválido.');
    return { enabled, recipient: { type, person_id, phone: recipientPhone } };
  }
  const page = (rows, p) => ({ rows: copy(rows.slice(Math.max(0, Number(p.offset) || 0), Math.max(0, Number(p.offset) || 0) + Math.min(200, Number(p.limit) || 50))), total: rows.length });
  const inPeriod = (value, p) => (!p.since || String(value).slice(0, 10) >= p.since) && (!p.until || String(value).slice(0, 10) <= p.until);
  function listLeads(account, p) {
    if (Boolean(p.profile_id)!==Boolean(p.profile_agent_id)) fail('Escolha um perfil válido.');
    const rows = account.leads.filter(row => Boolean(row.archived_at) === (p.archived === true || p.archived === 'true') && (!p.search || normalize(`${row.nome} ${row.whatsapp} ${row.email}`).includes(normalize(p.search))) && (!p.pipeline_id || row.pipeline_id === p.pipeline_id) && (!p.stage_id || row.stage_id === p.stage_id) && (!p.owner_id || row.responsavel_id === p.owner_id) && (!p.origin || row.origem === p.origin) && inPeriod(row.data_entrada, p));
    return rows.filter(row => (!p.tag || row.etiquetas?.includes(p.tag)) && (!p.profile_id || row.crm_ia_profile?.id===p.profile_id && row.crm_ia_profile?.agent_id===p.profile_agent_id) && (!p.qualified || row.qualificado===(p.qualified==='true')))
      .sort((a, b) => p.sort === 'name' ? a.nome.localeCompare(b.nome, 'pt-BR') : p.sort === 'value' ? Number(b.valor) - Number(a.valor) : (p.sort === 'oldest' ? 1 : -1) * String(a.created_at).localeCompare(String(b.created_at)));
  }
  function profileCatalog(account) {
    const items = new Map();
    for (const agent of account.agents) if (agent.funil?.crm_ia?.tipo==='qualificacao') for (const row of agent.funil.crm_ia.profiles||[]) items.set(`${agent.id}:${row.id}`,{agent_id:agent.id,pipeline_id:agent.funil.crm_ia.pipeline_id,id:row.id,nome:row.nome,cor:row.cor,agent_updated_at:agent.updated_at});
    for (const row of account.leads) if (row.crm_ia_profile) {const key=`${row.crm_ia_profile.agent_id}:${row.crm_ia_profile.id}`;if (!items.has(key)) items.set(key,{...row.crm_ia_profile,pipeline_id:row.pipeline_id,agent_updated_at:null,historical:true});}
    return copy([...items.values()]);
  }
  function resolveProfile(account, selected, pipelineId) {
    const agent=account.agents.find(row => row.id===selected?.agent_id && row.funil?.crm_ia?.tipo==='qualificacao' && row.funil.crm_ia.pipeline_id===pipelineId);
    const item=agent?.funil.crm_ia.profiles?.find(row => row.id===selected.id);
    if (!item || selected.agent_updated_at!==agent.updated_at) fail('Perfil indisponível ou alterado. Atualize a ficha.','40001');
    return {item,snapshot:{agent_id:agent.id,id:item.id,nome:item.nome,cor:item.cor,agent_updated_at:agent.updated_at}};
  }
  function checkedSelection(account, p, maximum) {
    if (!Array.isArray(p.items) || !p.items.length || p.items.length>maximum || new Set(p.items.map(item => item.id)).size!==p.items.length) fail('Seleção e versões dos leads são obrigatórias.');
    if (p.ids && (p.ids.length!==p.items.length || p.ids.some(key => !p.items.some(item => item.id===key)))) fail('Confira a seleção dos leads.');
    return p.items.map(item => {const row=lead(account,item.id);version(row,item.expected_updated_at);if (row.archived_at) fail('Lead arquivado.');return row;});
  }
  function conversationContext(account, contactId) {
    const person = contact(account, contactId);
    const available = account.leads.filter(row => !row.archived_at);
    const explicit = available.filter(row => row.crm_ia_contact_id === contactId);
    const samePhone = account.contacts.filter(row => phone(row.phone) === phone(person.phone));
    const candidates = explicit.length ? explicit : samePhone.length === 1 ? available.filter(row => !row.crm_ia_contact_id && phone(row.whatsapp) === phone(person.phone)) : [];
    if (candidates.length > 1) return { status: 'ambiguous', lead: null };
    return { status: candidates.length ? 'linked' : 'unlinked', lead: candidates[0] ? copy(candidates[0]) : null };
  }
  function flagSource(account, scope, message) {
    return message?.from_me === true && message.sender_kind === 'automation'
      && account.messages.filter(row => row.from_me && row.channel_id === scope.channel_id && row.message_id === message.message_id).length === 1
      && account.queue.some(row =>
      row.status === 'sent' && ['reply', 'followup'].includes(row.kind) && row.agent_run_id && row.provider_message_id === message.message_id
      && row.body === message.body && row.contact_id === scope.contact_id && row.whatsapp_config_id === scope.channel_id);
  }
  function messageSender(account, scope, message, canFlag) {
    const person = contact(account, scope.contact_id);
    if (!message.from_me) return { sender_kind: 'contact', sender_name: person.nome || person.sender_name || 'Contato sem nome', avatar_url: person.profile_pic_url || null };
    if (canFlag) return { sender_kind: 'ai', sender_name: 'IA', avatar_url: null };
    const receipts = account.queue.filter(row => row.cliente_id === account.client.id && row.contact_id === scope.contact_id && row.whatsapp_config_id === scope.channel_id && row.kind === 'manual' && row.agent_run_id == null && row.status === 'sent' && row.provider_message_id && row.provider_message_id === message.message_id);
    const uniqueSource = account.messages.filter(row => row.from_me && row.cliente_id === account.client.id && row.whatsapp_config_id === scope.channel_id && row.message_id === message.message_id).length === 1;
    if (message.cliente_id === account.client.id && message.whatsapp_config_id === scope.channel_id && [message.to_jid, message.chat_jid].includes(person.from_jid) && message.sent_by && uniqueSource && receipts.length === 1 && receipts[0].created_by === message.sent_by && receipts[0].body === message.body) {
      const author = people.find(row => row.id === message.sent_by);
      return { sender_kind: 'human', sender_name: author?.full_name?.trim() || 'Equipe', avatar_url: author?.avatar_url || null };
    }
    return { sender_kind: message.sender_kind === 'automation' ? 'automation' : 'unknown', sender_name: message.sender_kind === 'automation' ? 'Automação' : null, avatar_url: null };
  }
  const flagKey = (account, messageId) => `${profile.id}:${account.client.id}:${messageId}`;
  const feedKey = account => `${profile.id}:${account.client.id}`;
  const feedRows = account => account.leads.filter(row => row.created_at).slice().sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  const feedSignature = rows => JSON.stringify(rows.map(row => [row.id, row.created_at]).sort((a, b) => a[0].localeCompare(b[0])));
  function conversations(account, p) {
    if (p.contact_id) contact(account, p.contact_id); if (p.channel_id) channel(account, p.channel_id);
    const rows = [];
    for (const person of account.contacts) for (const source of account.channels) {
      const latest = account.messages.filter(message => message.contact_id === person.id && message.channel_id === source.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      if (!latest) continue;
      const status = account.states[person.id] || { attendance: 'human', updated_at: person.updated_at };
      const linked = conversationContext(account, person.id).lead;
      const row = { contact_id: person.id, channel_id: source.id, nome: person.nome, profile_pic_url: person.profile_pic_url || null, last_message: latest.body, last_message_at: latest.created_at, attendance: status.attendance, awaiting_since: status.awaiting_since || null, lead_id: linked?.id || null, assigned_to: status.assigned_to || null, ia_ativa: status.attendance === 'ai', resolvida: status.attendance === 'resolved', updated_at: status.updated_at };
      if ((!p.contact_id || row.contact_id === p.contact_id) && (!p.channel_id || row.channel_id === p.channel_id) && (!p.owner_id || row.assigned_to === p.owner_id) && (!p.search || normalize(`${row.nome} ${person.phone}`).includes(normalize(p.search))) && (!p.attendance || p.attendance === 'all' || row.attendance === p.attendance || p.attendance === 'waiting' && row.awaiting_since || p.attendance === 'followup' && status.followup_due_at) && inPeriod(row.last_message_at, p)) rows.push(row);
    }
    return rows.sort((a, b) => b.last_message_at.localeCompare(a.last_message_at));
  }
  function slots(account, p) {
    if (!people.some(person => person.id === p.owner_id)) fail('Selecione o atendente.');
    const settings = account.config.data.availability; const timezone = settings.timezone || 'America/Sao_Paulo';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date || '')) fail('Escolha uma data válida.');
    const day = new Date(p.date + 'T12:00:00Z').getUTCDay();
    const exception = (settings.exceptions || []).find(item => item.owner_id === p.owner_id && item.date === p.date);
    if (exception?.blocked || p.date > dayAgo(-(settings.horizon_days || 60))) return { rows: [], total: 0 };
    const windows = exception ? [{ ...exception, days: [day] }] : settings.windows.filter(item => item.owner_id === p.owner_id && item.days.includes(day));
    const existing = [...accounts.values()].flatMap(item => item.appointments).filter(item => item.owner_id === p.owner_id && item.id !== p.appointment_id && ['scheduled', 'confirmed'].includes(item.status));
    if (existing.filter(item => item.start_at.slice(0, 10) === p.date).length >= settings.max_per_day) return { rows: [], total: 0 };
    const rows = [];
    for (const window of windows) {
      const end = Date.parse(zonedTime(p.date, window.end, timezone));
      for (let start = Date.parse(zonedTime(p.date, window.start, timezone)); start + settings.duration_minutes * 60000 <= end; start += settings.interval_minutes * 60000) {
        const finish = start + settings.duration_minutes * 60000;
        if (start < clock + settings.min_notice_hours * 3600000 || existing.some(item => start - settings.buffer_before * 60000 < Date.parse(item.busy_end_at || item.end_at) && finish + settings.buffer_after * 60000 > Date.parse(item.busy_start_at || item.start_at))) continue;
        rows.push({ start_at: new Date(start).toISOString(), end_at: new Date(finish).toISOString(), owner_id: p.owner_id });
      }
    }
    return { rows, total: rows.length };
  }
  function saveLead(account, p) {
    const current = p.id ? lead(account, p.id) : null; if (current) version(current, p.expected_updated_at);
    if ('crm_ia_profile' in p) fail('Atribua o perfil pelo campo autorizado.');
    const next = { ...(current || {}), ...p };
    if (!next.nome?.trim() || !/^[0-9]{10,15}$/.test(phone(next.whatsapp))) fail('Revise nome e telefone do lead.');
    if (next.pipeline_id && !account.pipelines.some(item => item.id === next.pipeline_id)) fail('Funil indisponível.');
    if (next.stage_id && !account.stages.some(item => item.id === next.stage_id && item.pipeline_id === next.pipeline_id)) fail('Etapa indisponível.');
    if (next.responsavel_id && !people.some(item => item.id === next.responsavel_id)) fail('Responsável indisponível.');
    const target = account.stages.find(item => item.id === next.stage_id);
    if (target && ['ganho', 'perdido'].includes(target.tipo) && current?.stage_id !== next.stage_id && !p.reason?.trim()) fail('Informe o motivo de ganho ou perda.');
    if ('etiquetas' in p) next.etiquetas=tagList(p.etiquetas);
    const previous=current?.crm_ia_profile||null;
    if ('profile' in p) {
      const resolved=p.profile===null?null:resolveProfile(account,p.profile,next.pipeline_id);
      next.crm_ia_profile=resolved?.snapshot||null;
      const same=previous?.id===resolved?.snapshot.id && previous?.agent_id===resolved?.snapshot.agent_id;
      if (resolved && !same) {
        next.etiquetas=tagList([...(next.etiquetas||[]),...(resolved.item.actions?.tags||[])]);
        const owner=resolved.item.actions?.owner_id;
        if (owner && !people.some(person => person.id===owner)) fail('Responsável do perfil indisponível.');
        if (owner) next.responsavel_id=owner;
      }
    }
    delete next.expected_updated_at; delete next.reason; delete next.motivo_ganho_perdido; delete next.profile;
    Object.assign(next, { id: current?.id || id(), cliente_id: account.client.id, whatsapp: phone(next.whatsapp), updated_at: stamp(), created_at: current?.created_at || stamp(), data_entrada: next.data_entrada || today, archived_at: next.archived_at || null, crm_ia_fields: next.crm_ia_fields || {} });
    if (current) Object.assign(current, next); else account.leads.push(next);
    if (JSON.stringify(previous)!==JSON.stringify(next.crm_ia_profile||null)) (account.profileHistory||=[]).push({id:id(),lead_id:next.id,from_profile:copy(previous),to_profile:copy(next.crm_ia_profile||null),actor_id:profile.id,created_at:stamp(),source:'manual'});
    return copy(next);
  }
  function upsert(account, collection, p) {
    const current = p.id ? account[collection].find(item => item.id === p.id) : null;
    if (p.id) version(current, p.expected_updated_at);
    const next = { ...current, ...p, id: current?.id || id(), cliente_id: account.client.id, created_at: current?.created_at || stamp(), updated_at: stamp() };
    delete next.expected_updated_at;
    if (current) Object.assign(current, next); else account[collection].push(next);
    return copy(next);
  }
  async function request(action, clientId = null, payload = {}) {
    const p = copy(payload); requests.push({ action, clientId, payload: p });
    if (['forbidden', 'negado'].includes(state) || profile.status !== 'active') fail('Acesso ao CRM IA indisponível.', '42501');
    if (action === 'bootstrap') return { clients: [...accounts.values()].map(account => copy(account.client)), permissions: { manage } };
    const account = accounts.get(clientId); if (!account) fail('Sem acesso a esta conta.', '42501');
    if (state === 'conta-revogada') fail('Sem acesso a esta conta.', '42501');
    if (['loading', 'carregando'].includes(state) && action === 'workspace') return new Promise(() => {});
    if (state === 'leitura-lenta' && action === 'leads') await new Promise(resolve => setTimeout(resolve, p.search ? 40 : 900));
    if ((state === 'erro-permanente' || state === 'erro' && !errorsSeen.has(action)) && READS.has(action)) { errorsSeen.add(action); fail('Falha de leitura simulada. Use Tentar novamente.', '503'); }
    if (state === 'conflito' && !READS.has(action) && action !== 'workspace' && !errorsSeen.has(action)) { errorsSeen.add(action); fail('Conflito de versão simulado. Atualize antes de salvar.', '40001'); }
    if (ADMIN.has(action) && !manage || state === 'consulta' && !READS.has(action) && !PERSONAL.has(action) && action !== 'workspace') fail('Somente a gestão configura o CRM IA.', '42501');
    if (action === 'workspace') return { client: copy(account.client), pipelines: copy(account.pipelines), stages: copy(account.stages), agents: manage ? copy(account.agents) : [], lead_profiles: profileCatalog(account), bases: manage ? copy(account.bases) : [], products: copy(account.products), people: copy(people), channels: copy(account.channels), config: copy(account.config), templates: copy(templates), provisioned: account.provisioned, permissions: { manage, provision: role === 'superadmin', conversations: true, tracking: true } };
    if (action === 'leads') {
      const entries=listLeads(account,p),totals=new Map();
      for (const row of entries) {const key=row.stage_id||null,previous=totals.get(key)||{stage_id:key,count:0,value:0};previous.count++;previous.value+=Number(row.valor||0);totals.set(key,previous);}
      const visible=entries.map(row => ({...row,attendance:account.states[row.contact_id]?.attendance||null,awaiting_since:account.states[row.contact_id]?.awaiting_since||null}));
      return {...page(visible,p),summary:{value:entries.reduce((sum,row)=>sum+Number(row.valor||0),0),ai:visible.filter(row=>row.attendance==='ai').length,waiting:visible.filter(row=>row.awaiting_since).length},stage_totals:copy([...totals.values()]),coverage:{conversations:'available'}};
    }
    if (action === 'conversations') return page(conversations(account, p), p);
    if (action === 'lead') {
      const item = lead(account, p.id); const linked = account.contacts.find(row => row.id === item.contact_id);
      const { crm_ia_contact_id: _contactId, ...visibleLead } = item;
      const selectedChat=linked?conversations(account,{contact_id:linked.id,...(p.channel_id&&{channel_id:p.channel_id})})[0]:null;
      visibleLead.attendance=selectedChat?.attendance||null;visibleLead.awaiting_since=selectedChat?.awaiting_since||null;
      return { lead: copy(visibleLead), contact: linked ? copy(linked) : null, conversation: linked ? conversations(account, { contact_id: linked.id, ...(p.channel_id && { channel_id: p.channel_id }) })[0] || null : null, conversations: linked ? conversations(account,{contact_id:linked.id}) : [], profile_history: copy((account.profileHistory||[]).filter(event=>event.lead_id===item.id)), events: copy(account.events.filter(event => event.lead_id === item.id)), appointments: copy(account.appointments.filter(event => event.lead_id === item.id)) };
    }
    if (action === 'notifications') {
      const rows = feedRows(account), key = feedKey(account), signature = feedSignature(rows), reads = feedReads.get(key) || new Set();
      const history = feedSnapshots.get(key) || [];
      let snapshot = history.find(item => item.signature === signature);
      if (!snapshot) { snapshot = { id: id(), watermark: rows[0] ? { created_at: rows[0].created_at, lead_id: rows[0].id } : null, signature }; feedSnapshots.set(key, [snapshot, ...history].slice(0, 4)); }
      return { ...page(rows.map(row => ({ id: `lead_created:${row.id}`, type: 'lead_created', lead_id: row.id, created_at: row.created_at, read: reads.has(row.id) })), p), unread_count: rows.filter(row => !reads.has(row.id)).length, snapshot: { id: snapshot.id, watermark: copy(snapshot.watermark) } };
    }
    if (action === 'mark_notifications_read') {
      const key = feedKey(account), snapshot = feedSnapshots.get(key)?.find(item => item.id === p.snapshot_id);
      if (!snapshot) fail('Snapshot de leitura indisponível. Atualize as notificações.', '40001');
      const rows = feedRows(account).filter(row => snapshot.watermark && (row.created_at < snapshot.watermark.created_at || row.created_at === snapshot.watermark.created_at && row.id <= snapshot.watermark.lead_id));
      if (feedSignature(rows) !== snapshot.signature) fail('O snapshot de leitura mudou. Atualize as notificações.', '40001');
      const reads = feedReads.get(key) || new Set(); let marked = 0;
      for (const row of rows) if (!reads.has(row.id)) { reads.add(row.id); marked++; }
      feedReads.set(key, reads); return { marked, snapshot_id: snapshot.id };
    }
    if (action === 'conversation_context') { channel(account, p.channel_id); return conversationContext(account, p.contact_id); }
    if (action === 'flag_ai_message') {
      contact(account, p.contact_id); channel(account, p.channel_id);
      if (Object.keys(p).some(key => !['contact_id', 'channel_id', 'sent_id', 'category', 'note', 'expected_updated_at'].includes(key))) fail('Campo de autor ou dados não permitido.');
      if (!FLAG_CATEGORIES.has(p.category) || p.note != null && (typeof p.note !== 'string' || p.note.length > 1000)) fail('Revise a categoria e a observação.');
      const message = account.messages.find(row => row.id === p.sent_id && row.contact_id === p.contact_id && row.channel_id === p.channel_id);
      if (!flagSource(account, p, message)) fail('Resposta IA indisponível para sinalização.', '42501');
      const key = flagKey(account, message.id), current = messageFlags.get(key), note = (p.note || '').trim();
      if (current?.category === p.category && current.note === note) return copy(current);
      if (current) version(current, p.expected_updated_at);
      const record = { id: current?.id || id(), category: p.category, note, created_at: current?.created_at || stamp(), updated_at: stamp() };
      messageFlags.set(key, record); return copy(record);
    }
    if (action === 'messages') {
      const person = contact(account, p.contact_id); channel(account, p.channel_id);
      const messages = account.messages.filter(item => item.contact_id === p.contact_id && item.channel_id === p.channel_id).sort((a, b) => b.created_at.localeCompare(a.created_at));
      const result = page(messages, p);
      result.rows = result.rows.reverse().map(source => {
        const { contact_id: _contact, channel_id: _channel, cliente_id: _client, whatsapp_config_id: _whatsapp, sent_by: _sender, to_jid: _to, chat_jid: _chat, ...message } = source;
        const can_flag = flagSource(account, p, source);
        return { ...message, ...messageSender(account, p, source, can_flag), can_flag, my_flag: can_flag ? copy(messageFlags.get(flagKey(account, message.id)) || null) : null };
      });
      result.state = conversations(account, p)[0] || { ...copy(account.states[p.contact_id] || {}), contact_id: p.contact_id, channel_id: p.channel_id, nome: person.nome, profile_pic_url: person.profile_pic_url || null };
      return result;
    }
    if (action === 'queue') { if (p.contact_id) contact(account, p.contact_id); if (p.channel_id) channel(account, p.channel_id); return page(account.queue.filter(item => (!p.contact_id || item.contact_id === p.contact_id) && (!p.channel_id || item.whatsapp_config_id === p.channel_id)).sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at)).map(({ request_id: _request, created_by: _creator, ...item }) => item), p); }
    if (action === 'agenda') {
      const rows = account.appointments.filter(item => (!p.owner_id || item.owner_id === p.owner_id) && inPeriod(agendaCivilDate(item.start_at, account.config.data.availability.timezone), p)).sort((a, b) => a.start_at.localeCompare(b.start_at));
      return { ...page(rows, p), timezone: account.config.data.availability.timezone, summary: Object.fromEntries(['scheduled','confirmed','cancelled','no_show'].map(status => [status, rows.filter(row => row.status === status).length])) };
    }
    if (action === 'slots') return copy(slots(account, p));
    if (action === 'usage') return { responses: account.usage.reduce((sum, item) => sum + item.responses, 0), tokens: account.usage.reduce((sum, item) => sum + item.tokens, 0), by_agent: copy(account.usage), limits: null, coverage: { since: p.since || dayAgo(6), until: p.until || today, complete: true, reason: null, message: 'Gerações de IA registradas no período; testes e sugestões não comprovam envio ao contato.' } };
    if (action === 'overview') {
      const entries = listLeads(account, p), chats = conversations(account, p), booked = account.appointments.filter(item => ['scheduled', 'confirmed'].includes(item.status) && inPeriod(item.start_at, p));
      const since = p.since || dayAgo(6), until = p.until || today, daily = [];
      if (Date.parse(until) - Date.parse(since) > 366 * 86400000 || until < since) fail('Período inválido.');
      for (let day = Date.parse(since + 'T12:00:00Z'); day <= Date.parse(until + 'T12:00:00Z'); day += 86400000) { const key = new Date(day).toISOString().slice(0, 10); daily.push({ day: key, count: entries.filter(item => item.data_entrada === key).length }); }
      const origins = new Map(); entries.forEach(item => origins.set(item.origem || '', (origins.get(item.origem || '') || 0) + 1));
      return { totals: { leads: entries.length, qualified: entries.filter(item => item.qualificado === true).length, conversations: chats.filter(item => !item.resolvida).length, ai_conversations: chats.filter(item => item.attendance === 'ai').length, human_conversations: chats.filter(item => item.attendance === 'human').length, appointments: booked.length, waiting: chats.filter(item => item.awaiting_since && !item.resolvida).length }, daily, stages: account.stages.map(stage => ({ id: stage.id, nome: stage.nome, color: stage.color, count: entries.filter(item => item.stage_id === stage.id).length, value: entries.filter(item => item.stage_id === stage.id).reduce((sum, item) => sum + Number(item.valor || 0), 0) })), origins: [...origins].map(([name, count]) => ({ name, count })), waiting: chats.filter(item => item.awaiting_since && !item.resolvida).map(item => ({ contact_id: item.contact_id, nome: item.nome, since: item.awaiting_since, channel_id: item.channel_id })), coverage: { since, until, conversations: 'available', message: null } };
    }
    if (action === 'save_lead') return saveLead(account, p);
    if (action === 'open_conversation') {
      const item = lead(account, p.id); channel(account, p.channel_id);
      const digits = phone(item.whatsapp); const normalized = [10, 11].includes(digits.length) ? `55${digits}` : digits;
      if (p.chat_jid !== `${normalized}@s.whatsapp.net`) fail('Confira o telefone do lead.');
      let person = account.contacts.find(row => row.id === item.contact_id || row.from_jid === p.chat_jid);
      if (!person) { person = { id: id(), cliente_id: clientId, from_jid: p.chat_jid, phone: normalized, nome: item.nome, sender_name: item.nome, whatsapp_config_id: p.channel_id, updated_at: stamp() }; account.contacts.push(person); }
      item.contact_id = item.crm_ia_contact_id = person.id; item.updated_at = stamp();
      account.states[person.id] ||= { attendance: 'human', assigned_to: profile.id, updated_at: stamp() };
      return { contact_id: person.id, channel_id: p.channel_id };
    }
    if (action === 'move_lead') {
      const current = lead(account, p.id); version(current, p.expected_updated_at); const target = account.stages.find(item => item.id === p.stage_id); if (!target) fail('Etapa indisponível.');
      const reason = p.reason || p.motivo_ganho_perdido; if (['ganho', 'perdido'].includes(target.tipo) && !reason?.trim()) fail('Informe o motivo de ganho ou perda.');
      const source = current.stage_id; const result = saveLead(account, { ...p, reason, pipeline_id: target.pipeline_id }); account.events.push({ id: id(), lead_id: current.id, stage_anterior_id: source, stage_nova_id: target.id, user_id: profile.id, realizado_em: stamp(), motivo_ganho_perdido: reason || null, metadados: { source: 'crm-ia' } }); return result;
    }
    if (action === 'archive_lead' || action === 'restore_lead') { const item = lead(account, p.id); if (action === 'archive_lead') version(item, p.expected_updated_at); item.archived_at = action === 'archive_lead' ? stamp() : null; item.crm_ia_archived_at = item.archived_at; item.updated_at = stamp(); return copy(item); }
    if (action === 'bulk_assign' || action === 'bulk_archive') {
      const entries=checkedSelection(account,p,action==='bulk_archive'?100:200);
      if (action==='bulk_assign' && !people.some(item=>item.id===p.owner_id)) fail('Responsável indisponível.');
      entries.forEach(item=>{if(action==='bulk_assign')item.responsavel_id=p.owner_id;else item.archived_at=item.crm_ia_archived_at=stamp();item.updated_at=stamp();});
      return {ok:true,updated:entries.length};
    }
    if (action === 'save_config') { if (p.revision !== account.config.revision) fail('A configuração foi alterada. Atualize a versão.', '40001'); account.config.data[p.section] = copy(p.data); account.config.revision = id(); return copy(account.config); }
    if (['agent_draft', 'save_agent_draft', 'publish_agent_draft', 'discard_agent_draft'].includes(action)) {
      const published = p.agent_id ? account.agents.find(row => row.id === p.agent_id) : null;
      if (p.agent_id ? !published : !['qualificacao','followup','agendamento'].includes(p.tipo) || !account.pipelines.some(row => row.id === p.pipeline_id)) fail('Agente ou funil indisponível.', '42501');
      const key = `${clientId}:${profile.id}:${p.agent_id || `${p.tipo}:${p.pipeline_id}`}`;
      let draft = agentDrafts.get(key);
      if (action === 'agent_draft') {
        if (!draft || draft.status !== 'draft') { draft = { revision: id(), payload: null, source_updated_at: published?.updated_at || null, status: 'draft' }; agentDrafts.set(key, draft); }
        return { revision: draft.revision, draft: draft.payload ? { payload: copy(draft.payload), revision: draft.revision } : null, published: copy(published), source_updated_at: draft.source_updated_at, source_conflict: Boolean(draft.payload && draft.source_updated_at !== (published?.updated_at || null)) };
      }
      if (!draft || draft.status !== 'draft' || draft.revision !== p.revision) fail('O rascunho mudou de versão. Atualize antes de salvar.', '40001');
      if (action === 'save_agent_draft') {
        if (!p.data || Array.isArray(p.data) || typeof p.data !== 'object' || JSON.stringify(p.data).length > 50000) fail('Rascunho inválido.');
        draft.payload = copy(p.data); draft.revision = id(); return { revision: draft.revision };
      }
      if (action === 'publish_agent_draft') {
        if (!draft.payload) fail('Salve o rascunho antes de publicar.');
        if (draft.source_updated_at !== (published?.updated_at || null)) fail('A versão publicada foi alterada. Revise o rascunho.', '40001');
        const agent = await request('save_agent', clientId, { ...draft.payload, ...(published && { id: published.id, expected_updated_at: draft.source_updated_at }) });
        draft.status = 'published'; draft.payload = null; draft.revision = id(); return { published: true, agent, revision: draft.revision };
      }
      draft.status = 'discarded'; draft.payload = null; draft.revision = id(); return { discarded: true, revision: draft.revision };
    }
    if (action === 'save_pipeline') { if (!p.nome?.trim()) fail('Informe o nome do funil.'); const saved = upsert(account, 'pipelines', p); if (p.is_default) account.pipelines.forEach(item => { item.is_default = item.id === saved.id; item.crm_ia_default = item.is_default; }); return saved; }
    if (action === 'save_stage') { if (!account.pipelines.some(item => item.id === p.pipeline_id)) fail('Funil indisponível.'); return upsert(account, 'stages', p); }
    if (action === 'reorder_stages') { const target = account.pipelines.find(item => item.id === p.pipeline_id); version(target, p.expected_updated_at); if (p.stage_ids.some(key => !account.stages.some(item => item.id === key && item.pipeline_id === target.id))) fail('Etapa indisponível.'); p.stage_ids.forEach((key, ordem) => { const stage = account.stages.find(item => item.id === key); stage.ordem = ordem; stage.updated_at = stamp(); }); target.updated_at = stamp(); return { ok: true }; }
    if (action === 'delete_stage' || action === 'delete_pipeline') { const collection = action === 'delete_stage' ? 'stages' : 'pipelines'; const target = account[collection].find(item => item.id === p.id); version(target, p.expected_updated_at); if (account.leads.some(item => (collection === 'stages' ? item.stage_id : item.pipeline_id) === p.id)) fail('Não é possível excluir uma etapa ou funil ocupado.'); account[collection] = account[collection].filter(item => item.id !== p.id); if (collection === 'pipelines') account.stages = account.stages.filter(item => item.pipeline_id !== p.id); return { ok: true }; }
    if (action === 'save_base' || action === 'save_agent' || action === 'save_product') {
      if (!account.provisioned && action !== 'save_product') fail('Prepare o CRM IA desta conta.');
      if (action === 'save_agent') {
        if (!p.funil?.crm_ia?.tipo || !p.nome?.trim()) fail('Revise o agente.');
      }
      const agentFunil = action === 'save_agent' ? { ...p.funil, crm_ia: { ...p.funil.crm_ia, notification: notificationConfig(p.funil.crm_ia) } } : null;
      const collection = action === 'save_base' ? 'bases' : action === 'save_agent' ? 'agents' : 'products';
      const old = account[collection].find(item => item.id === p.id);
      const result = upsert(account, collection, { ...p, ...(action === 'save_agent' && { funil: agentFunil, auto_responder: p.auto_responder === true }), ...(action === 'save_product' && { crm_ia_details: { ...old?.crm_ia_details, ...p.crm_ia_details } }) });
      account.config.revision = id(); return result;
    }
    if (action === 'save_template') {
      const old = p.id && templates.find(item => item.id === p.id);
      if (p.id && (!old || old.revision !== p.revision)) fail('O modelo foi alterado. Atualize a versão.', '40001');
      const data = copy(p.data);
      if (p.tipo === 'agent' && data.funil?.crm_ia) { data.funil.crm_ia.notification = notificationOff(); data.funil.crm_ia.agendamento = { ...data.funil.crm_ia.agendamento, notify_owner: false }; }
      const next = { ...old, ...p, data, id: old?.id || id(), owner_id: profile.id, revision: id(), created_at: old?.created_at || stamp(), updated_at: stamp() };
      if (old) Object.assign(old, next); else templates.push(next); return copy(next);
    }
    if (action === 'apply_template') { const template = templates.find(item => item.id === p.id); if (!template || template.revision !== p.revision) fail('Modelo indisponível ou alterado.', '40001'); const target = accounts.get(p.target_client_id || clientId); if (!target) fail('Sem acesso à conta de destino.', '42501'); if (template.tipo === 'pipeline') { const result = upsert(target, 'pipelines', { nome: template.data.nome || template.nome, is_default: false }); (template.data.stages || []).forEach((item, index) => upsert(target, 'stages', { nome: item.nome, color: item.color, tipo: item.tipo, ordem: index, pipeline_id: result.id, etapas_permitidas: [], acoes_obrigatorias: [] })); } else if (template.tipo === 'base') upsert(target, 'bases', { nome: template.data.nome || template.nome, conteudo: template.data.conteudo || '' }); else { const rules = template.data.funil?.crm_ia || {}; const { pipeline_id: _pipeline, stage_ids: _stages, destino: _destination, agendamento: schedule, profiles: sourceProfiles, ...safeRules } = rules;
      const scheduleKeys=['duration_minutes','interval_minutes','buffer_before','buffer_after','min_notice_hours','max_future_days','daily_limit','reminders','title','instructions','location_type','location'];
      safeRules.agendamento={...Object.fromEntries(Object.entries(schedule||{}).filter(([key])=>scheduleKeys.includes(key))),notify_owner:false};
      safeRules.notification=notificationOff();
      safeRules.audio={...normalizeCrmIaAudio(rules.audio),enabled:false,input_enabled:false};
      if(sourceProfiles)safeRules.profiles=sourceProfiles.map(row=>({...copy(row),id:id(),actions:{owner_id:null,tags:tagList(row.actions?.tags||[])}})); upsert(target, 'agents', { nome: template.data.nome || template.nome, objetivo: template.data.objetivo || '', instrucoes: template.data.instrucoes || '', tom: template.data.tom || 'cordial', modelo: template.data.modelo || 'openai/gpt-4o-mini', ativo: false, auto_responder: false, base_ids: [], setor_ids: [], funil: { crm_ia: { ...safeRules, stage_ids: [], destino: { tipo: 'humano' } } } }); } return { ok: true }; }
    if (action === 'provision') { if (role !== 'superadmin') fail('Somente o Super Admin habilita o módulo por cliente.', '42501'); account.provisioned = true; return { ok: true }; }
    if (action === 'save_conversation') { contact(account, p.contact_id); channel(account, p.channel_id); const current = account.states[p.contact_id]; if (current) version(current, p.expected_updated_at); if (p.attendance === 'ai' && !account.config.data.attendance.auto_send) fail('Ative a autonomia geral e configure um agente antes de devolver à IA.'); account.states[p.contact_id] = { ...current, attendance: p.attendance, assigned_to: p.assigned_to || current?.assigned_to || null, awaiting_since: null, updated_at: stamp() }; return { id: p.contact_id, cliente_id: clientId, contact_id: p.contact_id, status: p.attendance === 'resolved' ? 'finalizado' : 'entrada', ia_pausada: p.attendance !== 'ai', assigned_to: account.states[p.contact_id].assigned_to, updated_at: account.states[p.contact_id].updated_at }; }
    if (action === 'schedule_message') {
      contact(account, p.contact_id); channel(account, p.channel_id);
      if (!uuidPattern.test(p.request_id || '') || !p.body?.trim() || p.body.trim().length > 4000) fail('Identificador e texto de até 4.000 caracteres obrigatórios.');
      const scheduled = Object.hasOwn(p, 'scheduled_at') ? Date.parse(p.scheduled_at) : clock;
      const previous = account.queue.find(item => item.request_id === p.request_id);
      if (previous) {
        const legacyImmediate = scheduled >= clock - 120000 && scheduled <= clock && Date.parse(previous.scheduled_at) <= clock;
        if (previous.body !== p.body.trim() || previous.contact_id !== p.contact_id || previous.whatsapp_config_id !== p.channel_id
          || Object.hasOwn(p, 'scheduled_at') && Date.parse(previous.scheduled_at) !== scheduled && !legacyImmediate) fail('Identificador já usado em outro envio ou horário.', '40001');
        return copy(previous);
      }
      if (!Number.isFinite(scheduled) || scheduled < clock - 120000 || scheduled > clock + 366 * 86400000) fail('Data de envio inválida.');
      const item = { id: id(), contact_id: p.contact_id, whatsapp_config_id: p.channel_id, body: p.body.trim(), scheduled_at: p.scheduled_at || stamp(), status: 'pending', kind: 'manual', created_at: stamp(), error_code: null, sent_at: null, request_id: p.request_id, created_by: profile.id };
      account.queue.push(item); return copy(item);
    }
    if (action === 'cancel_message') { const item = account.queue.find(row => row.id === p.id); if (!item || item.status !== 'pending') fail('O envio já saiu da fila pendente. Confira o resultado antes de agir.'); item.status = 'cancelled'; return { ok: true }; }
    if (action === 'save_appointment') { if (!uuidPattern.test(p.request_id || '')) fail('Identificador de agendamento obrigatório.'); if (p.lead_id) lead(account, p.lead_id); if (p.contact_id) contact(account, p.contact_id); const previous = account.appointments.find(item => item.request_id === p.request_id); if (previous && !p.id) return copy(previous); const current = p.id ? account.appointments.find(item => item.id === p.id) : null; if (p.id) version(current, p.expected_updated_at); const found = slots(account, { owner_id: p.owner_id, date: p.start_at.slice(0, 10), appointment_id: current?.id }).rows.find(item => item.start_at === new Date(p.start_at).toISOString() && item.end_at === new Date(p.end_at).toISOString()); if (!found) fail('Horário indisponível. Atualize a agenda.', '40001'); return upsert(account, 'appointments', { ...p, status: current?.status || 'scheduled', busy_start_at: p.start_at, busy_end_at: p.end_at, created_by: profile.id }); }
    if (action === 'cancel_appointment') { const item = account.appointments.find(row => row.id === p.id); version(item, p.expected_updated_at); item.status = 'cancelled'; item.updated_at = stamp(); return { ok: true }; }
    if (action === 'mark_appointment_no_show') {
      const item = account.appointments.find(row => row.id === p.id); version(item, p.expected_updated_at);
      if (item.status === 'no_show') return { ...copy(item), recovery: { armed: false, reason: 'already_marked' } };
      if (!['scheduled', 'confirmed'].includes(item.status) || Date.parse(item.end_at) > clock) fail('O compromisso precisa ter terminado para registrar ausência.');
      if (p.channel_id) channel(account, p.channel_id);
      item.status = 'no_show'; item.updated_at = stamp();
      return { ...copy(item), recovery: { armed: false, reason: account.config.data.concierge.no_show_recovery === true ? 'human_paused' : 'disabled' } };
    }
    if (action === 'import_leads') { if (!uuidPattern.test(p.request_id || '') || !Array.isArray(p.rows) || !p.rows.length || p.rows.length > 1000) fail('Identificador e lote de importação inválidos.'); const key = `${clientId}:${p.request_id}`; const receipt = importReceipts.get(key); if (receipt) { if (receipt.payload !== JSON.stringify(p.rows)) fail('Identificador usado em outra importação.'); return copy(receipt.result); } const original = copy(account.leads), history = copy(account.profileHistory||[]); let created = 0; try { for (const row of p.rows) { if (account.leads.some(item => phone(item.whatsapp) === phone(row.whatsapp))) continue; saveLead(account, row); created += 1; } } catch (error) { account.leads = original; account.profileHistory=history; throw error; } const result = { created, preserved: p.rows.length - created, ok: true }; importReceipts.set(key, { payload: JSON.stringify(p.rows), result }); return copy(result); }
    fail(`Ação não suportada pela prévia: ${action}.`);
  }
  async function invoke(name, { body = {} } = {}) {
    const account = accounts.get(body.cliente_id || body.client_id); if (!account) fail('Sem acesso a esta conta.', '42501');
    if (name === 'atendimento-ia') { if (!manage && body.acao === 'testar') fail('Somente a gestão testa os agentes.', '42501'); const agent = account.agents.find(item => item.id === body.agente_id); if (!agent) fail('Agente indisponível.'); const measured = account.usage.find(item => item.id === agent.id); if (measured) { measured.responses += 1; measured.tokens += 80; } return { resposta: 'Resposta sintética: entendi o pedido de demonstração. Posso organizar o próximo passo para revisão humana.', action: 'responder', agente: agent.nome, modelo: agent.modelo }; }
    if (name === 'crm-ia-calendar') { if (body.action === 'busy') return { required: false, fresh: false, status: 'disconnected' }; if (body.action === 'status') return { connected: false, configured: false, status: 'disconnected' }; fail('Google Agenda não usa transporte externo nesta prévia.'); }
    if (name === 'crm-ia' && body.mode === 'capabilities') return { audio: { available: true, input_available: true, model: 'gpt-4o-mini-tts' } };
    if (name === 'crm-ia') { const sent = await request('schedule_message', body.cliente_id, body); const item = account.queue.find(row => row.id === sent.id); if (item.status === 'pending') { item.status = 'sent'; item.sent_at = stamp(); account.messages.push({ id: id(), contact_id: body.contact_id, channel_id: body.channel_id, body: body.body, from_me: true, created_at: item.sent_at, media_url: null, media_type: 'text' }); } return { id: item.id, status: item.status }; }
    fail('Função indisponível na prévia.');
  }
  return { request, invoke, profile, ids: PREVIEW_IDS, requests, snapshot: () => copy({ accounts: [...accounts.values()], templates }) };
}
