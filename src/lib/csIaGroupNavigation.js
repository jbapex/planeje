const idPattern = /^[a-z0-9-]{1,64}$/i;
const groupPattern = /^[a-z0-9-]{1,196}@g\.us$/i;

function validScope(scope) {
  return [scope.clientId, scope.conversationId, scope.waClientId, scope.channelId]
    .every((id) => typeof id === 'string' && idPattern.test(id));
}

export function csGroupScope(row) {
  if (row?.group_status !== 'linked' || typeof row.group_jid !== 'string' || !groupPattern.test(row.group_jid)) return false;
  const scope = { clientId: row.client_id, conversationId: row.conversation_id, waClientId: row.wa_client_id,
    channelId: row.channel_id };
  return validScope(scope) && scope;
}

export function readCsGroupScope(params) {
  if (!['cs_cliente', 'grupo_conversa', 'grupo_canal'].some((key) => params.has(key))) return null;
  const scope = { clientId: params.get('cs_cliente'), conversationId: params.get('grupo_conversa'), waClientId: params.get('cliente_id'),
    channelId: params.get('grupo_canal') };
  return validScope(scope) && scope;
}

export async function loadCsGroupConversation(db, scope) {
  const { data: current, error: accessError } = await db.rpc('cs_ia_radar')
    .select('client_id,group_status,conversation_id,wa_client_id,channel_id,group_jid').eq('client_id', scope.clientId).maybeSingle();
  const live = csGroupScope(current);
  if (accessError || !live || Object.keys(live).some((key) => live[key] !== scope[key])) return null;
  const groupJid = current.group_jid;
  const { data, error } = await db.from('atendimento_conversas').select('*').eq('id', scope.conversationId)
    .eq('cliente_id', scope.waClientId).eq('whatsapp_config_id', scope.channelId).eq('chat_jid', groupJid)
    .eq('is_group', true).eq('bloqueada', false).is('archived_at', null).maybeSingle();
  return !error && data?.id === scope.conversationId && data.cliente_id === scope.waClientId &&
    data.whatsapp_config_id === scope.channelId && data.chat_jid === groupJid &&
    data.is_group === true && data.bloqueada === false && !data.archived_at ? data : null;
}

export function isCsGroupMessage(row, scope) {
  return row?.cliente_id === scope.waClientId && row.whatsapp_config_id === scope.channelId &&
    (row.conversation_id == null || row.conversation_id === scope.conversationId) &&
    (row.chat_jid ?? row.from_jid ?? row.to_jid) === scope.groupJid;
}

export function scopeCsGroupMessages(query, scope, address) {
  const jid = `"${scope.groupJid}"`;
  const addressFilter = address ? `or(chat_jid.eq.${jid},and(chat_jid.is.null,${address}.eq.${jid}))` : `chat_jid.eq.${jid}`;
  return query.eq('cliente_id', scope.waClientId).eq('whatsapp_config_id', scope.channelId)
    .or(`and(or(conversation_id.eq.${scope.conversationId},conversation_id.is.null),${addressFilter})`);
}
