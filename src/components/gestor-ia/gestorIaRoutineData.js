import { canUseGestorIa } from './gestorIaAccess';
import { normalizeRoutineWeek, routineLeadSummary, selectRoutineLeads } from '@/lib/gestorIaRoutine';
import { shiftDate } from '@/lib/trafficWeeklyReview';

function requireAccess(profile, modules) {
  if (!canUseGestorIa(profile, modules)) throw new Error('Acesso à rotina indisponível.');
}

export async function loadRoutineBoard(db, { profile, modules, clients }) {
  requireAccess(profile, modules);
  const { data, error } = await db.rpc('traffic_weekly_board');
  if (error || !Array.isArray(data?.clients) || !Array.isArray(data?.reviews)) throw new Error('Não foi possível carregar a rotina semanal.');
  const allowed = new Set(clients.map((client) => client.id));
  return { ...data, reviews: data.reviews.filter((review) => allowed.has(review.client_id)), clients: clients.map((client) => {
    const existing = data.clients.find((item) => item.id === client.id);
    return { ...client, manager_id: client.operation?.primary_assignee_id, eligible: client.etapa === 'closed', ...existing,
      accounts: existing?.accounts || [
        ...(client.metaAccounts || []).map((account) => ({ id: account.id || `meta:${account.meta_account_id}`, platform: 'meta', account_id: account.meta_account_id, account_name: account.meta_account_name })),
        ...(client.googleAccounts || []).map((account) => ({ id: account.id || `google:${account.google_customer_id}`, platform: 'google', account_id: account.google_customer_id, account_name: account.google_customer_name })),
      ] };
  }) };
}

export async function loadRoutineWeek(db, { board, profile, modules, clientId, weekStart, signal }) {
  requireAccess(profile, modules);
  const client = board.clients.find((item) => item.id === clientId);
  if (!client || normalizeRoutineWeek(weekStart) !== weekStart || weekStart > board.today) throw new Error('Cliente ou semana indisponível.');
  const { data, error } = await db.rpc('traffic_routine_client_history', {
    p_client: clientId, p_kind: 'review', p_before: shiftDate(weekStart, 7), p_limit: 30,
  }).abortSignal(signal);
  if (error || !Array.isArray(data)) throw new Error('Não foi possível abrir a semana. Tente novamente.');
  const records = data.filter((record) => record.client_id === clientId && (record.kind || 'review') === 'review');
  return { review: records.find((record) => record.week_start === weekStart) || {
    id: null, client_id: clientId, empresa: client.empresa, week_start: weekStart, kind: 'review', revision: 0, metric_mode: 'campaign',
    can_edit: client.eligible !== false && (board.can_manage || client.manager_id === profile.id),
    result_label: client.settings?.result_label || 'Agendamentos',
  }, previous: records.find((record) => record.week_start < weekStart && record.finalized_at && record.metric_mode === 'campaign') || null };
}

export async function loadRoutineSummary(db, { profile, modules, clientIds, weekStart }) {
  requireAccess(profile, modules);
  if (normalizeRoutineWeek(weekStart) !== weekStart) throw new Error('Escolha uma semana válida.');
  const records = [];
  for (let start = 0; start < clientIds.length; start += 100) {
    let offset = 0;
    for (;;) {
      const { data, error } = await db.from('traffic_weekly_reviews')
        .select('id,client_id,week_start,kind,metric_mode,campaign_metrics,investment,contacts,results,revision,finalized_at,updated_at,fill_origin,validation_state')
        .in('client_id', clientIds.slice(start, start + 100)).eq('week_start', weekStart).eq('kind', 'review')
        .order('id').range(offset, offset + 499);
      if (error || !Array.isArray(data)) throw new Error('Não foi possível consultar o preenchimento desta semana.');
      if (!data.length) break;
      records.push(...data);
      offset += data.length;
    }
  }
  return records;
}

const CONTACT_FIELDS = 'id,cliente_id,from_jid,phone,sender_name,profile_pic_url,instance_name,whatsapp_config_id,first_seen_at,last_message_at,origin_source,utm_source,utm_medium,utm_campaign,utm_content,utm_term,tracking_data,mini_crm,qualificado,comprou,valor_venda';

export async function loadRoutineLeads(db, { profile, modules, clientId, weekStart, rows, allRows = rows, niche, mode = 'entrada', appointmentsOnly, signal }) {
  requireAccess(profile, modules);
  if (modules.rastreamento !== true) throw new Error('Acesso ao Rastreamento necessário para consultar os leads.');
  if (!clientId || normalizeRoutineWeek(weekStart) !== weekStart || !['entrada', 'agendados_na_semana'].includes(mode)) throw new Error('Escolha cliente e semana válidos.');
  const authorize = async () => {
    const { data, error } = await db.rpc('central_trafego_can_access_client', { p_cliente_id: clientId }).abortSignal(signal);
    if (error || data !== true) throw new Error('Acesso aos leads deste cliente indisponível.');
  };
  await authorize();
  const { data, error } = await db.rpc('gestor_ia_routine_leads_data', { p_client: clientId, p_week: weekStart, p_actor: null, p_mode: mode }).abortSignal(signal);
  if (error || !Array.isArray(data?.contacts) || !Array.isArray(data?.messages)
    || (mode === 'agendados_na_semana' && !Array.isArray(data?.appointment_events))
    || (data?.origin_catalog != null && !Array.isArray(data.origin_catalog))) throw new Error('Não foi possível consultar os leads e as evidências de agendamento. Tente novamente.');
  await authorize();
  const selected = selectRoutineLeads(data.contacts, { clientId, weekStart, rows, allRows, mode, appointmentEvents: data.appointment_events || [], originCatalog: data.origin_catalog || [], niche: data.niche || niche, config: data.config, appointmentsOnly, messages: data.messages });
  return { ...selected, mode, summary: routineLeadSummary(selected, rows) };
}

/** O contato completo só é consultado quando a pessoa abre a ficha. */
export async function loadRoutineLeadContact(db, { profile, modules, clientId, contactId, signal }) {
  requireAccess(profile, modules);
  if (modules.rastreamento !== true || !clientId || !contactId) throw new Error('Acesso ao contato indisponível.');
  const authorize = async () => {
    const { data, error } = await db.rpc('central_trafego_can_access_client', { p_cliente_id: clientId }).abortSignal(signal);
    if (error || data !== true) throw new Error('Acesso ao contato indisponível.');
  };
  await authorize();
  const { data, error } = await db.from('cliente_whatsapp_contact').select(CONTACT_FIELDS).eq('cliente_id', clientId).eq('id', contactId).maybeSingle().abortSignal(signal);
  if (error || !data || data.cliente_id !== clientId || data.id !== contactId) throw new Error('Não foi possível abrir este contato.');
  await authorize();
  return data;
}
