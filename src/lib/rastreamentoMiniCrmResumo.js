import { appointmentTimeKey, formatDayBr, formatMoneyBr, isAppointmentDateColumn, normalizeAppointmentTime,
  presetForNicho, resolveMiniCrmSetup, rowFromContact, statusLabel } from './miniCrm.js';

export function buildMiniCrmSummary({ contact, config, niche }) {
  if (!contact) return [];
  const setup = resolveMiniCrmSetup(presetForNicho(niche || ''), config, []);
  const row = rowFromContact(contact);
  const fields = [{ key: 'status', label: 'Status', kind: 'status' }, ...setup.columns];
  if (!fields.some((field) => field.key === 'proxima_em')) fields.push({ key: 'proxima_em', label: 'Data do follow-up', kind: 'day' });
  return fields.filter((field, index) => !field.locked && !['qualificado', 'valor'].includes(field.key)
    && fields.findIndex((other) => other.key === field.key) === index).map((field) => {
    const raw = row[field.key];
    let value = typeof raw === 'string' || typeof raw === 'number' ? String(raw) : '';
    if (field.kind === 'status') value = statusLabel(setup.statuses, value);
    if (field.kind === 'money') value = formatMoneyBr(raw);
    if (field.kind === 'day') {
      value = formatDayBr(raw);
      const time = isAppointmentDateColumn(field) && normalizeAppointmentTime(row[appointmentTimeKey(field)]);
      if (value && time) value += ` · ${time}`;
    }
    const color = field.kind === 'status' ? setup.statuses.find((status) => status.key === raw)?.color : undefined;
    return { key: field.key, label: field.label, value: value.trim() || 'Não informado', color };
  });
}

export async function fetchMiniCrmSummary(client, { clienteId, contactId }) {
  if (!clienteId || !contactId) return [];
  const [contact, config, customer] = await Promise.all([
    client.from('cliente_whatsapp_contact').select('id,mini_crm,qualificado,comprou,valor_venda')
      .eq('cliente_id', clienteId).eq('id', contactId).maybeSingle(),
    client.from('mini_crm_config').select('statuses,columns').eq('cliente_id', clienteId).maybeSingle(),
    client.from('clientes').select('nicho').eq('id', clienteId).maybeSingle(),
  ]);
  if (contact.error || config.error || customer.error) throw new Error('Não foi possível carregar o Mini CRM.');
  return buildMiniCrmSummary({ contact: contact.data, config: config.data, niche: customer.data?.nicho });
}
