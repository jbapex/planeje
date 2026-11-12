import { historicoParaMensagens, mensagensDeTeste } from './atendimentoIaPrompt.js';
import { buildCrmIaPrompt, crmIaCadenceDue, crmIaDeterministicAction, crmIaRequestedDay, crmIaRules, parseCrmIaModelResult, selectCrmIaAgent, validateCrmIaAction } from './crmIaAgent.js';
import { processCrmIaAudioInput } from './crmIaVoice.js';
import { refreshCalendarBusy } from './crmIaCalendar.js';
import { loadCalendarConfig } from './crmIaCalendarHandler.js';

type RuntimeArgs = { db: any; clientId: string; mode: string; contactId?: string; channelId?: string; agentId?: string; messageId?: string; userId?: string | null; previewMessages?: unknown[]; callModel: (model: string, messages: any[]) => Promise<{ resposta: string; tokens?: number | null }>; processAudioInput?: (args: any) => Promise<any>; refreshCalendar?: (args: any) => Promise<any>; now?: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const audioType = (type: unknown) => ['audio', 'ptt', 'myaudio', 'voice', 'voicenote', 'voicemessage', 'voice_message', 'audiomessage'].includes(String(type || '').toLowerCase());
const messageJid = (item: any, outgoing = false) => item?.chat_jid || (outgoing ? item?.to_jid : item?.from_jid);
async function read(query: any) { const { data, error } = await query; if (error) throw new Error('crm_ia_context_unavailable'); return data; }
const skipped = (reason: string) => ({ handled: true, typed: true, ok: true, skipped: reason, resposta: '', action: null });
async function refreshRuntimeCalendar(args: any) {
  const env = (name: string) => (globalThis as any).Deno?.env?.get(name);
  const config = await loadCalendarConfig(args.db, { env, supabaseUrl: env('SUPABASE_URL') });
  return refreshCalendarBusy({ ...args, config });
}

export async function runCrmIaAgent({ db, clientId, mode, contactId, channelId, agentId, messageId, userId, previewMessages = [], callModel, processAudioInput = processCrmIaAudioInput, refreshCalendar = refreshRuntimeCalendar, now = new Date().toISOString() }: RuntimeArgs) {
  const agents = await read(db.from('cliente_atend_ia_agentes').select('*').eq('cliente_id', clientId).order('created_at'));
  const typed = (agents || []).filter((agent: any) => crmIaRules(agent));
  const requested = typed.find((agent: any) => agent.id === agentId);
  if (!typed.length || (mode === 'testar' && agentId && !requested)) return { handled: false };
  const automatic = mode === 'responder' || mode === 'followup';
  let config = await read(db.from('crm_ia_config').select('*').eq('cliente_id', clientId).maybeSingle());
  let lead: any = null, conversation: any = {}, contact: any = null, actorId: string | null = userId || null;
  let messages = mode === 'testar' ? mensagensDeTeste(previewMessages) : [];
  let audioFallback = false;
  let source: any = null;
  if (mode !== 'testar') {
    if (!UUID.test(contactId || '') || !UUID.test(channelId || '')) return skipped('exact_channel_required');
    if (automatic) {
      if (!messageId || messageId.length > 300) return skipped('message_id_required');
      const sourceContact = await read(db.from('cliente_whatsapp_contact').select('from_jid').eq('cliente_id', clientId).eq('id', contactId).maybeSingle());
      if (!sourceContact || !/^[0-9]+@(s\.whatsapp\.net|c\.us|lid)$/.test(sourceContact.from_jid || '')) return skipped('contact_unavailable');
      const latest = await read(db.from('cliente_whatsapp_inbox').select('id,body,type,message_id,from_jid,chat_jid').eq('cliente_id', clientId).eq('whatsapp_config_id', channelId).eq('is_group', false)
        .or(`chat_jid.eq.${sourceContact.from_jid},from_jid.eq.${sourceContact.from_jid}`).order('created_at', { ascending: false }).limit(1));
      if (latest?.[0] && messageJid(latest[0]) !== sourceContact.from_jid) return skipped('source_jid_changed');
      let entryText = latest?.[0]?.body || '';
      if (mode === 'responder' && latest?.[0]?.message_id !== messageId) return skipped('source_message_changed');
      if (mode === 'responder' && audioType(latest?.[0]?.type)) {
        if (latest[0].message_id !== messageId) return skipped('audio_message_changed');
        const input = await processAudioInput({ db, clientId, channelId, contactId, messageId });
        if (input.skipped) return skipped(input.skipped);
        audioFallback = input.ok !== true;
        entryText = input.transcript || '';
      }
      const prepared = await read(db.rpc('crm_ia_agent_intake', { p_client: clientId, p_channel: channelId, p_contact: contactId, p_text: entryText }));
      if (!prepared?.lead) return skipped(prepared?.skipped || 'entry_disabled');
      ({ lead, conversation, contact } = prepared); config = prepared.config; actorId = prepared.actor_id;
    } else {
      contact = await read(db.from('cliente_whatsapp_contact').select('*').eq('cliente_id', clientId).eq('id', contactId).maybeSingle());
      const leads = await read(db.from('leads').select('*').eq('cliente_id', clientId).eq('crm_ia_contact_id', contactId).is('crm_ia_archived_at', null).limit(2));
      if (leads?.length !== 1) return skipped('lead_unavailable');
      lead = leads[0];
      conversation = await read(db.from('cliente_atend_conversas').select('*').eq('cliente_id', clientId).eq('contact_id', contactId).maybeSingle()) || {};
    }
    const channel = await read(db.from('cliente_whatsapp_config').select('id').eq('id', channelId).eq('cliente_id', clientId).eq('provider', 'uazapi').is('archived_at', null).maybeSingle());
    if (!channel || !contact || !/^[0-9]+@(s\.whatsapp\.net|c\.us|lid)$/.test(contact.from_jid || '')) return skipped('channel_unavailable');
    const [incomingRows, outgoingRows] = await Promise.all([
      read(db.from('cliente_whatsapp_inbox').select('id,message_id,body,type,msg_timestamp,created_at,from_jid,chat_jid').eq('cliente_id', clientId).eq('whatsapp_config_id', channelId).eq('is_group', false)
        .or(`chat_jid.eq.${contact.from_jid},from_jid.eq.${contact.from_jid}`).order('created_at', { ascending: false }).limit(40)),
      read(db.from('cliente_whatsapp_sent').select('id,body,created_at,to_jid,chat_jid').eq('cliente_id', clientId).eq('whatsapp_config_id', channelId)
        .or(`chat_jid.eq.${contact.from_jid},to_jid.eq.${contact.from_jid}`).order('created_at', { ascending: false }).limit(40)),
    ]);
    const incoming = (incomingRows || []).filter((item: any) => messageJid(item) === contact.from_jid);
    const outgoing = (outgoingRows || []).filter((item: any) => messageJid(item, true) === contact.from_jid);
    const transcripts = incoming?.some((item: any) => audioType(item.type))
      ? await read(db.rpc('crm_ia_audio_context', { p_client: clientId, p_channel: channelId, p_contact: contactId })) : [];
    const sourceRows = (incoming || []).map((item: any) => {
      if (!audioType(item.type)) return item;
      const text = transcripts?.find((entry: any) => entry.inbox_id === item.id)?.transcript;
      return { ...item, body: text ? `[Transcrição automática de áudio recebido; conteúdo não verificado] ${text.slice(0, 6000)}` : '[Áudio recebido sem transcrição. Não presumir o conteúdo.]' };
    });
    messages = historicoParaMensagens({ inboxRows: sourceRows, sentRows: outgoing || [] });
    source = mode === 'followup'
      ? incoming?.find((item: any) => item.id === conversation.crm_ia_runtime?.source_inbox_id && item.message_id === conversation.crm_ia_runtime?.source_message_id && item.type === conversation.crm_ia_runtime?.source_message_type)
      : incoming?.find((item: any) => item.message_id === messageId);
    if (!messages.length && !(mode === 'followup' && conversation.crm_ia_runtime?.no_show?.state === 'pending')) return skipped('empty_context');
  } else {
    if (!requested) throw new Error('crm_ia_agent_unavailable');
    const rules = crmIaRules(requested);
    lead = { pipeline_id: rules.pipeline_id, stage_id: rules.stage_ids?.[0], crm_ia_fields: {} };
    if (!messages.length || messages[messages.length - 1].role !== 'user') throw new Error('crm_ia_test_message_required');
  }
  const data = config?.data || {};
  const noShow = mode === 'followup' && conversation.crm_ia_runtime?.no_show?.state === 'pending' ? conversation.crm_ia_runtime.no_show : null;
  if (noShow) actorId = noShow.actor_id;
  const selection = selectCrmIaAgent({ agents: typed, lead, conversation, config: data, now, mode, agentId });
  if (!selection.agent) {
    if (mode === 'followup') await read(db.from('cliente_atend_conversas')
      .update({ ia_followup_due_at: selection.reason === 'outside_hours' ? new Date(new Date(now).getTime() + 60000).toISOString() : null,
        ia_followup_delivery_state: selection.reason === 'outside_hours' ? 'pending' : 'cancelled' })
      .eq('cliente_id', clientId).eq('contact_id', contactId).eq('updated_at', conversation.updated_at));
    return skipped(selection.reason);
  }
  const agent = selection.agent, rules = crmIaRules(agent), lastText = [...messages].reverse().find((message: any) => message.role === 'user')?.content || '';
  const appointmentTools = !noShow && data.concierge?.enabled === true && (selection.concierge || data.concierge?.mode === 'always');
  const assignment = data.knowledge?.assignments?.find((item: any) => item.pipeline_id === lead.pipeline_id);
  const baseIds = selection.concierge || appointmentTools ? [data.concierge?.base_id || data.knowledge?.concierge_base_id].filter(Boolean) : assignment?.base_id ? [assignment.base_id] : agent.base_ids || [];
  const [company, bases, products, services] = await Promise.all([
    read(db.from('clientes').select('empresa').eq('id', clientId).maybeSingle()),
    baseIds.length ? read(db.from('cliente_atend_ia_bases').select('id,nome,conteudo').eq('cliente_id', clientId).in('id', baseIds)) : [],
    read(db.from('crm_produtos').select('*').eq('cliente_id', clientId).limit(50)),
    read(db.from('crm_servicos').select('*').eq('cliente_id', clientId).limit(50)),
  ]);
  if (baseIds.length && bases.length !== new Set(baseIds).size) throw new Error('crm_ia_base_unavailable');
  let slots: any[] = [];
  let appointments: any[] = [], proposal: any = null, slotAppointment: string | null = null;
  let calendarUnavailable = false;
  const calendarHandoff = { text: 'Não consegui conferir o horário na agenda. A equipe vai verificar e retornar.', action: { type: 'handoff', reason: 'calendar_unavailable' } };
  async function loadSlots(day: string, appointmentId: string | null = null) {
    const existing = appointments.find((item: any) => item.id === appointmentId);
    if (appointmentId && !existing) throw new Error('crm_ia_appointment_unavailable');
    slotAppointment = appointmentId;
    try {
      const busy = await refreshCalendar({ db, clientId, ownerId: existing?.owner_id || rules.agendamento?.owner_id || lead.responsavel_id, leadId: lead.id, date: day });
      if (!busy || (busy.required && busy.fresh !== true)) throw new Error('calendar_busy_unconfirmed');
    } catch { calendarUnavailable = true; return []; }
    return (await read(db.rpc(appointmentId ? 'crm_ia_appointment_slots' : 'crm_ia_agent_slots', appointmentId
      ? { p_client: clientId, p_channel: channelId, p_contact: contactId, p_lead: lead.id, p_agent: agent.id, p_actor: actorId, p_appointment: appointmentId, p_expected: existing.updated_at, p_date: day }
      : { p_client: clientId, p_agent: agent.id, p_lead: lead.id, p_date: day })))?.rows || [];
  }
  const date = crmIaRequestedDay(lastText, now, data.availability?.timezone)
    || [...messages].reverse().filter((message: any) => /\b20\d{2}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}(?:\/20\d{2})?\b/.test(message.content))
      .map((message: any) => crmIaRequestedDay(message.content, now, data.availability?.timezone)).find(Boolean);
  let job: any = null;
  if (automatic) {
    job = await read(db.rpc('crm_ia_agent_begin', { p_client: clientId, p_channel: channelId, p_contact: contactId, p_lead: lead.id, p_agent: agent.id, p_mode: mode, p_message: messageId,
      p_expected: { actor_id: actorId, config_revision: config.revision, lead_updated_at: lead.updated_at, conversation_updated_at: conversation.updated_at, agent_updated_at: agent.updated_at, concierge: selection.concierge || appointmentTools, last_text: lastText,
        source_inbox_id: UUID.test(source?.id || '') ? source.id : null, source_message_id: source?.message_id || null, source_message_type: source?.type || null,
        ...(noShow ? { purpose: 'no_show' } : {}) } }));
    if (!job?.claimed) return job?.result ? { handled: true, typed: true, ...job.result, ok: true } : skipped(job?.skipped || 'already_processing');
  }
  try {
  if (noShow) return { handled: true, typed: true, ...(await read(db.rpc('crm_ia_apply_agent_action', { p_run: job.id, p_action: { type: 'no_show_recover' }, p_reply: '', p_followup: {} }))), ok: true };
  if (appointmentTools && lead.id) {
    const context = await read(db.rpc('crm_ia_appointment_context', { p_client: clientId, p_channel: channelId, p_contact: contactId, p_lead: lead.id, p_actor: actorId }));
    appointments = context?.rows || []; proposal = context?.proposal || null;
  }
  if (date && lead.id && (rules.tipo === 'agendamento' || appointmentTools)) {
    const existing = proposal?.operation === 'reschedule' ? proposal.appointment_id
      : /remarc|reagend/i.test(lastText) && appointments.length === 1 ? appointments[0].id : null;
    if (rules.tipo === 'agendamento' || existing) slots = await loadSlots(date, existing);
  }
  const deterministic = crmIaDeterministicAction({ rules, text: lastText, concierge: selection.concierge ? data.concierge : null });
  const system = buildCrmIaPrompt({ agent, lead, company: company?.empresa, bases, products: [...products, ...services], config: appointmentTools ? data : { ...data, concierge: { ...data.concierge, enabled: false } }, slots, concierge: selection.concierge || appointmentTools, followup: mode === 'followup',
    appointments: appointments.map(({ owner_id: _owner, ...item }: any) => item), proposal });
  let generated;
  try { generated = calendarUnavailable ? { resposta: JSON.stringify(calendarHandoff), tokens: null } : audioFallback ? { resposta: JSON.stringify({ text: 'Não consegui entender este áudio. Pode escrever sua mensagem ou pedir ajuda à equipe?', action: { type: 'answer' } }), tokens: null }
    : deterministic ? { resposta: JSON.stringify({ text: '', action: deterministic }), tokens: null } : await callModel(agent.modelo, [{ role: 'system', content: system }, ...messages]); }
  catch { throw new Error('crm_ia_model_unavailable'); }
  let parsed = parseCrmIaModelResult(generated.resposta);
  if (parsed.action.type === 'slots' && (rules.tipo === 'agendamento' || appointmentTools) && lead.id && /^20\d{2}-\d{2}-\d{2}$/.test(parsed.action.date || '')) {
    slots = await loadSlots(parsed.action.date, parsed.action.appointment_id || null);
    parsed = calendarUnavailable ? calendarHandoff : { text: slots.length ? `Encontrei estes horários disponíveis: ${slots.slice(0, 5).map(slot => new Date(slot.start_at).toLocaleString('pt-BR', { timeZone: data.availability?.timezone || 'America/Sao_Paulo' })).join('; ')}. Qual prefere?` : 'Não há horário disponível nessa data. Podemos conferir outro dia?', action: { type: 'answer' } };
  }
  if (parsed.action.type === 'appointment_propose') {
    const chosen = appointments.find((item: any) => item.id === parsed.action.appointment_id);
    if (chosen && appointments.some((item: any) => item.id !== chosen.id && item.title === chosen.title && item.start_at === chosen.start_at)) {
      parsed = { text: 'Encontrei compromissos com o mesmo título e horário. A equipe precisa identificar o registro antes da alteração.', action: { type: 'handoff', reason: 'appointment_ambiguous' } };
    } else if (parsed.action.operation === 'reschedule' && chosen && (slotAppointment !== chosen.id || !slots.some(slot => slot.start_at === parsed.action.start_at && slot.end_at === parsed.action.end_at))) {
      const civilDate = new Intl.DateTimeFormat('en-CA', { timeZone: data.availability?.timezone || 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(parsed.action.start_at));
      slots = await loadSlots(civilDate, chosen.id);
      if (calendarUnavailable) parsed = calendarHandoff;
    }
  }
  validateCrmIaAction({ action: parsed.action, rules, slots, text: lastText, appointments, proposal, config: appointmentTools ? data : {} });
  if (selection.concierge && !['answer', 'handoff', 'close', 'appointment_propose', 'appointment_apply'].includes(parsed.action.type)) throw new Error('crm_ia_concierge_action_unavailable');
  await read(db.from('cliente_atend_ia_log').insert({ cliente_id: clientId, agente_id: agent.id, contact_id: contactId || null, user_id: actorId, acao: automatic ? 'responder' : mode, modelo: agent.modelo, tokens: generated.tokens || null, whatsapp_config_id: channelId || null }));
  if (!automatic) return { handled: true, typed: true, ok: true, resposta: parsed.text, action: parsed.action, preview: true, agente: { id: agent.id, nome: agent.nome } };
  const anchor = mode === 'followup' ? conversation.crm_ia_runtime?.silence_started_at || now : now;
  const nextStage = ['qualify', 'book'].includes(parsed.action.type) ? rules.destino?.stage_id || lead.stage_id : lead.stage_id;
  const followup = typed.find((item: any) => item.ativo && item.auto_responder && crmIaRules(item).tipo === 'followup'
    && crmIaRules(item).pipeline_id === lead.pipeline_id && crmIaRules(item).stage_ids?.includes(nextStage));
  const step = mode === 'followup' ? Number(conversation.ia_followup_passo || 0) + 1 : 0;
  const due = followup ? crmIaCadenceDue(crmIaRules(followup), step, anchor) : null;
  return { handled: true, typed: true, ...(await read(db.rpc('crm_ia_apply_agent_action', { p_run: job.id, p_action: parsed.action, p_reply: parsed.text, p_followup: due ? { due_at: due, passo: step, anchor, agent_id: followup.id, agent_updated_at: followup.updated_at } : {} }))), ok: true };
  } catch (failure) {
    if (job?.id) await db.rpc('crm_ia_agent_fail', { p_run: job.id });
    throw failure;
  }
}
