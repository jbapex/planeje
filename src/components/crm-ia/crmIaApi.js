export function canUseCrmIa(profile, modules) {
  return profile?.status === 'active' && ['admin', 'superadmin', 'colaborador'].includes(profile?.role) && modules?.crm === true;
}

const CALENDAR_ACTIONS = { calendar_status: 'status', calendar_connect: 'connect-start', calendar_finalize: 'finalize', calendar_list: 'calendars', calendar_select: 'select-calendar', calendar_disconnect: 'disconnect', calendar_busy: 'busy' };

export async function crmIaRequest(db, action, clientId, payload = {}) {
  let response;
  if (action === 'slots' && payload.owner_id && payload.date) {
    const day = new Date(`${payload.date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.date) || !Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== payload.date) throw new Error('Escolha uma data válida.');
    const busy = await crmIaRequest(db, 'calendar_busy', clientId, { owner_id: payload.owner_id,
      since: new Date(day.getTime() - 86400000).toISOString(), until: new Date(day.getTime() + 2 * 86400000).toISOString(),
      ...(payload.lead_id && { lead_id: payload.lead_id }), ...(payload.appointment_id && { appointment_id: payload.appointment_id }) });
    if (busy?.required && busy.fresh !== true) throw new Error('Não foi possível conferir o Google Agenda. Atualize a conexão antes de escolher um horário.');
  }
  if (CALENDAR_ACTIONS[action]) {
    response = await db.functions.invoke('crm-ia-calendar', { body: { ...payload, client_id: clientId, action: CALENDAR_ACTIONS[action] } });
  } else if (['send_message', 'send_media', 'load_media', 'capabilities'].includes(action)) {
    response = await db.functions.invoke('crm-ia', { body: { ...payload, cliente_id: clientId,
      ...(action === 'send_media' && { mode: 'media' }), ...(action === 'load_media' && { mode: 'media_get' }), ...(action === 'capabilities' && { mode: 'capabilities' }) } });
  } else if (action === 'test_agent' || action === 'suggest_message') {
    response = await db.functions.invoke('atendimento-ia', { body: {
      acao: action === 'test_agent' ? 'testar' : 'sugerir', cliente_id: clientId, agente_id: payload.agent_id,
      mensagens: payload.messages, contact_id: payload.contact_id, whatsapp_config_id: payload.channel_id,
    } });
  } else {
    response = await db.rpc('crm_ia_workspace', { p_action: action, p_client_id: clientId || null, p_payload: payload });
  }
  if (response.error || response.data?.error) {
    let failure = response.error || response.data;
    if (response.error?.context?.json) {
      const body = await response.error.context.json().catch(() => null);
      if (body?.error) failure = { ...failure, message: body.error };
    }
    const message = failure.message || failure.error || 'Não foi possível concluir a ação no CRM IA.';
    const error = new Error(CALENDAR_ACTIONS[action] && /^calendar_/.test(message)
      ? 'Não foi possível concluir a conexão com o Google Agenda. Atualize a conexão e tente novamente.' : message);
    error.code = failure.code;
    throw error;
  }
  if (action === 'workspace' && response.data) return {
    ...response.data,
    channels: (response.data.channels || []).map(channel => ({ ...channel, nome: channel.instance_name || channel.phone || 'Canal sem nome' })),
  };
  return response.data;
}
