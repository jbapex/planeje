export async function loadCsGroupInventory(db, status) {
  const rows = [];
  let cursor = null;
  for (;;) {
    const { data, error } = await db.rpc('cs_ia_group_inventory', { p_status: status, p_after: cursor });
    if (error || !Array.isArray(data)) throw new Error('Não foi possível consultar os grupos do Atendimento.');
    if (!data.length) return rows;
    const next = data.at(-1)?.id;
    if (!next || (cursor && next <= cursor)) throw new Error('Não foi possível concluir a consulta dos grupos.');
    rows.push(...data);
    cursor = next;
  }
}

export async function setCsGroupArchive(db, group, archive) {
  const { data, error } = await db.rpc('cs_ia_set_group_archive', {
    p_conversation_id: group.id, p_wa_client_id: group.wa_cliente_id, p_channel_id: group.whatsapp_config_id,
    p_version: group.archive_version, p_archive: archive,
  });
  if (error?.code === '40001') throw new Error('O arquivamento mudou. Atualize os grupos.');
  if (error?.code === '55000') throw new Error('O grupo está vinculado. Atualize os grupos.');
  if (error || data !== true) throw new Error('Não foi possível alterar o arquivamento neste canal.');
}

function labelScope(group) {
  return { p_conversation_id: group.id, p_wa_client_id: group.wa_cliente_id,
    p_channel_id: group.whatsapp_config_id, p_group_jid: group.chat_jid };
}

export async function loadCsGroupLabel(db, group) {
  const { data, error } = await db.rpc('cs_ia_group_label', labelScope(group));
  if (error || typeof data?.officialName !== 'string' || (data.name !== null && typeof data.name !== 'string') ||
      (data.version !== null && typeof data.version !== 'string')) throw new Error('Nome do grupo indisponível neste canal.');
  return data;
}

export async function saveCsGroupLabel(db, group, version, value) {
  const name = typeof value === 'string' ? value.trim() : value;
  if (name !== null && (typeof name !== 'string' || !name || name.length > 120)) {
    throw new Error('Informe um nome com 1 a 120 caracteres.');
  }
  const { data, error } = await db.rpc('cs_ia_set_group_label', { ...labelScope(group), p_version: version, p_name: name });
  if (error?.code === '40001') throw new Error('O nome mudou. Atualize antes de salvar.');
  if (error || data !== true) throw new Error('Não foi possível alterar o nome neste canal.');
}

export function normalizeCsGroupId(value) {
  const jid = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return /^[a-z0-9-]{1,196}@g\.us$/.test(jid) ? jid : '';
}

export async function loadCsGroupRegistrationChannels(db) {
  const rows = [];
  let cursor;
  for (;;) {
    let query = db.rpc('cs_ia_group_registration_channels').order('id').limit(100);
    if (cursor) query = query.gt('id', cursor);
    const { data, error } = await query;
    if (error || !Array.isArray(data)) throw new Error('Não foi possível consultar os canais autorizados.');
    if (!data.length) return rows;
    const next = data.at(-1)?.id;
    if (!next || (cursor && next <= cursor)) throw new Error('Não foi possível concluir a consulta dos canais.');
    rows.push(...data);
    cursor = next;
  }
}

export async function registerCsGroup(db, invoke, { channelId, groupId, name }) {
  const jid = normalizeCsGroupId(groupId);
  const label = typeof name === 'string' ? name.trim() : '';
  if (!channelId || !jid || !label || label.length > 120) throw new Error('Confira o canal, o ID e o nome do grupo.');
  const { data: { session } } = await db.auth.getSession();
  if (!session?.access_token) throw new Error('Sessão expirada. Faça login novamente.');
  const { data, error } = await invoke('uazapi-group-info', {
    cs_action: 'register', channel_id: channelId, group_jid: jid, name: label,
  }, session.access_token);
  if (error || typeof data?.id !== 'string' || typeof data.created !== 'boolean') {
    throw new Error(error?.message || 'Não foi possível confirmar o cadastro do grupo.');
  }
  return data;
}
