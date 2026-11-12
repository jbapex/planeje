const pageSize = 20;
const columns = 'id,event_key,source,message_id,origin_source,clicked_at,message_at,received_at,event_at,attribution';
const readError = 'Não foi possível carregar o histórico de origens.';

export async function fetchLeadAttributionHistory(client, { clienteId, fromJid, contactId, cursor } = {}) {
  const empty = { rows: [], nextCursor: null, error: null };
  if (!clienteId || (!fromJid && !contactId)) return empty;
  if (cursor && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(cursor.at)
    || !Number.isFinite(Date.parse(cursor.at))
    || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(cursor.id))) {
    return { ...empty, error: readError };
  }
  try {
    let contactJid = fromJid;
    if (!contactJid) {
      const { data, error } = await client.from('cliente_whatsapp_contact').select('from_jid')
        .eq('cliente_id', clienteId).eq('id', contactId).maybeSingle();
      if (error) return { ...empty, error: readError };
      if (!data?.from_jid) return empty;
      contactJid = data.from_jid;
    }
    let query = client.from('contact_attribution_history').select(columns)
      .eq('cliente_id', clienteId).eq('from_jid', contactJid)
      .order('event_at', { ascending: false }).order('id', { ascending: false })
      .limit(pageSize + 1);
    // Preserve database microseconds so equal-time entries never skip a page.
    if (cursor) query = query.or(`event_at.lt.${cursor.at},and(event_at.eq.${cursor.at},id.lt.${cursor.id})`);
    const { data, error } = await query;
    if (error) return { ...empty, error: readError };
    const rows = (data || []).slice(0, pageSize);
    const last = rows.at(-1);
    return { rows, nextCursor: data?.length > pageSize ? { at: last.event_at, id: last.id } : null, error: null };
  } catch {
    return { ...empty, error: readError };
  }
}

export function appendAttributionHistory(rows, page) {
  return [...new Map([...rows, ...page].map((row) => [row.id, row])).values()];
}
