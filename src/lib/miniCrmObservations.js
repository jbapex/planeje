export async function fetchMiniCrmObservations(client, { clienteId, contactId, offset = 0, pageSize = 20 }) {
  const { data, error } = await client.from('mini_crm_observation_history')
    .select('id,body,kind,author_name,created_at')
    .eq('cliente_id', clienteId).eq('contact_id', contactId)
    .order('created_at', { ascending: false, nullsFirst: false }).order('id', { ascending: false })
    .range(offset, offset + pageSize);
  if (error) throw error;
  return { rows: (data || []).slice(0, pageSize), hasMore: (data || []).length > pageSize };
}

export async function saveMiniCrmObservation(client, { clienteId, contactId, body, requestId }) {
  const { data, error } = await client.rpc('mini_crm_save_observation', {
    p_cliente_id: clienteId, p_contact_id: contactId, p_body: body, p_request_id: requestId,
  });
  if (error) throw error;
  if (!data?.id) throw new Error('Não foi possível confirmar a observação. Tente novamente.');
  return data;
}
