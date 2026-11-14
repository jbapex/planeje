const operations = ['appointment_confirm', 'appointment_reschedule', 'appointment_cancel'];
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const validWindow = row => timePattern.test(row.start || '') && timePattern.test(row.end || '') && row.start < row.end;

export function crmIaConciergeRules(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const flag = (key, fallback = false) => Object.hasOwn(source, key) ? source[key] === true : fallback;
  const wait = Object.hasOwn(source, 'human_wait_minutes') ? source.human_wait_minutes : 10;
  return {
    enabled: flag('enabled'), faq_enabled: flag('faq_enabled', true), handoff_enabled: flag('handoff_enabled', true),
    ...Object.fromEntries(operations.map(key => [key, flag(key)])), no_show_recovery: flag('no_show_recovery'),
    calendar: operations.some(key => flag(key)),
    mode: source.mode === undefined ? 'outside_hours' : ['always', 'outside_hours'].includes(source.mode) ? source.mode : null,
    human_wait_minutes: Number.isInteger(wait) && wait >= 0 && wait <= 10080 ? wait : null,
  };
}

export function crmIaConciergeAvailable({ config = {}, lead = {}, conversation = {}, now }) {
  const rules = crmIaConciergeRules(config.concierge), instant = new Date(now).getTime();
  if (!rules.enabled || !rules.mode || rules.human_wait_minutes === null || !Number.isFinite(instant)
    || conversation.ia_pausada || conversation.status === 'finalizado') return false;
  const human = conversation.crm_ia_runtime?.last_human_at;
  if (human !== undefined && human !== null && human !== '') {
    if (typeof human !== 'string') return false;
    const last = new Date(human).getTime();
    if (!Number.isFinite(last) || instant - last < rules.human_wait_minutes * 60000) return false;
  }
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: config.availability?.timezone ?? 'America/Sao_Paulo',
      year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(now)).map(part => [part.type, part.value]));
    if (rules.mode === 'always') return true;
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
    const date = `${parts.year}-${parts.month}-${parts.day}`, time = `${parts.hour}:${parts.minute}`;
    const windows = config.availability?.windows || [], exceptions = config.availability?.exceptions || [];
    if (!Array.isArray(windows) || !Array.isArray(exceptions) || day < 0) return false;
    const owners = lead.responsavel_id ? [lead.responsavel_id]
      : [...new Set([...windows, ...exceptions.filter(row => row.date === date)].map(row => row.owner_id).filter(Boolean))];
    let known = false;
    for (const owner of owners) {
      const exception = exceptions.find(row => row.owner_id === owner && row.date === date);
      const weekly = windows.filter(row => row.owner_id === owner);
      if (exception) {
        known = true;
        if (exception.blocked === true) continue;
        if (!validWindow(exception)) return false;
        if (exception.start <= time && time < exception.end) return false;
      } else if (weekly.length) {
        known = true;
        if (weekly.some(row => !validWindow(row) || !Array.isArray(row.days) || !row.days.length || row.days.some(value => !Number.isInteger(value) || value < 0 || value > 6))) return false;
        if (weekly.some(row => row.days.includes(day) && row.start <= time && time < row.end)) return false;
      }
    }
    return known;
  } catch { return false; }
}

export function assertCrmIaConciergeAction(action, { settings = {}, faqReady = false, systemHandoff = false, serverAnswer = false } = {}) {
  const rules = crmIaConciergeRules(settings);
  if ((Object.hasOwn(action, 'system_handoff') && !systemHandoff) || (Object.hasOwn(action, 'server_answer') && !serverAnswer) || ['values', 'profile_id', 'summary'].some(key => Object.hasOwn(action, key))
    || !['answer', 'handoff', 'close', 'slots', 'appointment_propose', 'appointment_apply', 'appointment_question'].includes(action.type)) throw new Error('crm_ia_concierge_action_unavailable');
  if (action.type === 'answer' && !faqReady && !serverAnswer) throw new Error('crm_ia_concierge_faq_disabled');
  if (action.type === 'handoff' && !rules.handoff_enabled && !systemHandoff) throw new Error('crm_ia_concierge_handoff_disabled');
  if ((action.type === 'slots' && !rules.appointment_reschedule)
    || (action.type === 'appointment_propose' && (!['confirm', 'reschedule', 'cancel'].includes(action.operation) || !rules[`appointment_${action.operation}`]))
    || (['appointment_apply', 'appointment_question'].includes(action.type) && !rules.calendar)) throw new Error('crm_ia_appointment_unavailable');
  if (action.type === 'appointment_question' && (!['choose_appointment', 'choose_operation', 'date'].includes(action.question)
    || (action.question === 'date' && !rules.appointment_reschedule))) throw new Error('crm_ia_concierge_question_unavailable');
}

export function crmIaConciergeQuestion(action, { appointments = [], settings = {}, timezone = 'America/Sao_Paulo' } = {}) {
  assertCrmIaConciergeAction(action, { settings });
  const answer = text => ({ text, action: { type: 'answer', server_answer: 'appointment_question' } });
  if (!appointments.length) return answer('Não encontrei compromissos neste atendimento.');
  const format = new Intl.DateTimeFormat('pt-BR', { timeZone: timezone, dateStyle: 'short', timeStyle: 'short' });
  const options = appointments.slice(0, 20).map(item => ({ title: String(item.title || 'Compromisso').slice(0, 150), at: format.format(new Date(item.start_at)) }));
  const keys = options.map(item => `${item.title}\n${item.at}`);
  if (new Set(keys).size !== keys.length) return { text: 'A equipe precisa identificar os compromissos antes de continuar.', action: { type: 'handoff', reason: 'appointment_ambiguous', system_handoff: true }, systemHandoff: true };
  if (action.question === 'choose_appointment' || (action.question === 'date' && appointments.length > 1)) return answer(`Qual destes compromissos você deseja alterar?\n${options.map(item => `• ${item.title} — ${item.at}`).join('\n')}`);
  if (action.question === 'date') return answer(`Para que data você deseja remarcar ${options[0].title}?`);
  const rules = crmIaConciergeRules(settings);
  const allowed = [['appointment_confirm', 'confirmar presença'], ['appointment_reschedule', 'remarcar'], ['appointment_cancel', 'cancelar']].filter(([key]) => rules[key]).map(([, label]) => label);
  return answer(`Você deseja ${allowed.join(' ou ')} o compromisso?`);
}
