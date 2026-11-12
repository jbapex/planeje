/**
 * Regras espelham atendimento_user_can_access_conversation (migration atendimento).
 * - superadmin: todas as mensagens do cliente
 * - admin / colaborador sem vínculos no cliente: todas do cliente
 * - admin / colaborador com vínculos: ver por fila e/ou canal; enviar só com permissão no canal
 */

export function isAtendimentoScopedStaffRole(role) {
  return role === 'colaborador' || role === 'admin';
}

export function getScopedAccessRowsForCliente(userAccess = [], clienteId) {
  if (!clienteId) return [];
  return (userAccess || []).filter((row) => row.cliente_id === clienteId);
}

export function hasAtendimentoScopeRestrictions(role, userAccess = [], clienteId) {
  if (role === 'superadmin' || !clienteId) return false;
  if (!isAtendimentoScopedStaffRole(role)) return false;
  return getScopedAccessRowsForCliente(userAccess, clienteId).length > 0;
}

/**
 * Canais visíveis nos filtros / nova conversa (espelha regras de atendimento_usuario_acesso).
 */
export function filterAtendimentoChannelsForUser({
  role,
  userAccess = [],
  clienteId,
  channels = [],
  filaCanaisByConfigId = new Map(),
}) {
  if (!clienteId) return [];
  if (role === 'superadmin') return channels;

  const scoped = getScopedAccessRowsForCliente(userAccess, clienteId);
  if (!isAtendimentoScopedStaffRole(role) || scoped.length === 0) return channels;

  const allowedFilaIds = new Set(scoped.map((r) => r.fila_id).filter(Boolean));
  const allowedConfigIds = new Set(scoped.map((r) => r.whatsapp_config_id).filter(Boolean));

  return channels.filter((ch) => {
    if (allowedConfigIds.has(ch.id)) return true;
    const filaId = filaCanaisByConfigId.get(ch.id);
    return Boolean(filaId && allowedFilaIds.has(filaId));
  });
}

/**
 * Filas visíveis nos filtros (derivadas dos vínculos de acesso do usuário).
 */
export function filterAtendimentoFilasForUser({
  role,
  userAccess = [],
  clienteId,
  filas = [],
  filaCanaisByConfigId = new Map(),
}) {
  if (!clienteId) return [];
  if (role === 'superadmin') return filas;

  const scoped = getScopedAccessRowsForCliente(userAccess, clienteId);
  if (!isAtendimentoScopedStaffRole(role) || scoped.length === 0) return filas;

  const allowedFilaIds = new Set(scoped.map((r) => r.fila_id).filter(Boolean));
  const allowedConfigIds = new Set(scoped.map((r) => r.whatsapp_config_id).filter(Boolean));

  const filaIdsFromChannels = new Set();
  filaCanaisByConfigId.forEach((filaId, configId) => {
    if (filaId && allowedConfigIds.has(configId)) filaIdsFromChannels.add(filaId);
  });

  return filas.filter((f) => allowedFilaIds.has(f.id) || filaIdsFromChannels.has(f.id));
}

export function canAccessAtendimentoConversation({
  role,
  userAccess = [],
  clienteId,
  conversation,
  filaCanaisByConfigId = new Map(),
}) {
  if (!conversation) return false;
  const convClienteId = conversation.cliente_id || clienteId;
  if (!convClienteId) return false;
  if (role === 'superadmin') return true;
  if (!isAtendimentoScopedStaffRole(role)) return false;

  const scoped = getScopedAccessRowsForCliente(userAccess, convClienteId);
  if (scoped.length === 0) return true;

  const whatsappConfigId = conversation.whatsapp_config_id ?? null;
  const resolvedFilaId =
    conversation.fila_id ??
    (whatsappConfigId ? filaCanaisByConfigId.get(whatsappConfigId) : null) ??
    null;

  return scoped.some((row) => {
    if (row.fila_id && resolvedFilaId && row.fila_id === resolvedFilaId) return true;
    if (row.whatsapp_config_id && whatsappConfigId && row.whatsapp_config_id === whatsappConfigId) {
      return true;
    }
    return false;
  });
}

/**
 * Envio exige permissão direta no canal (número). Acesso só por fila = leitura.
 */
export function canSendAtendimentoOnConversation({
  role,
  userAccess = [],
  clienteId,
  conversation,
}) {
  if (!conversation) return false;
  const convClienteId = conversation.cliente_id || clienteId;
  if (!convClienteId) return false;
  if (role === 'superadmin') return true;
  if (!isAtendimentoScopedStaffRole(role)) return false;

  const whatsappConfigId = conversation.whatsapp_config_id ?? null;
  if (!whatsappConfigId) return false;

  const scoped = getScopedAccessRowsForCliente(userAccess, convClienteId);
  if (scoped.length === 0) return true;

  return scoped.some(
    (row) => row.whatsapp_config_id && row.whatsapp_config_id === whatsappConfigId,
  );
}

/**
 * Canais nos quais o usuário pode iniciar conversa / enviar mensagens.
 */
export function filterAtendimentoChannelsForSend({
  role,
  userAccess = [],
  clienteId,
  channels = [],
}) {
  if (!clienteId) return [];
  if (role === 'superadmin') return channels;

  const scoped = getScopedAccessRowsForCliente(userAccess, clienteId);
  if (!isAtendimentoScopedStaffRole(role) || scoped.length === 0) return channels;

  const allowedConfigIds = new Set(scoped.map((r) => r.whatsapp_config_id).filter(Boolean));
  return channels.filter((ch) => allowedConfigIds.has(ch.id));
}

export function filterAtendimentoConversationsForUser({
  role,
  userAccess = [],
  clienteId,
  conversations = [],
  filaCanaisByConfigId = new Map(),
}) {
  if (!conversations.length) return [];
  return conversations.filter((conversation) =>
    canAccessAtendimentoConversation({
      role,
      userAccess,
      clienteId,
      conversation,
      filaCanaisByConfigId,
    }),
  );
}

export function canNotifyAtendimentoMessage({
  role,
  userAccess = [],
  clienteId,
  filaId = null,
  whatsappConfigId = null,
  filaCanaisByConfigId = new Map(),
}) {
  return canAccessAtendimentoConversation({
    role,
    userAccess,
    clienteId,
    conversation: {
      cliente_id: clienteId,
      fila_id: filaId,
      whatsapp_config_id: whatsappConfigId,
    },
    filaCanaisByConfigId,
  });
}

export function resolveAtendimentoFilaId({ filaId, whatsappConfigId, filaCanaisByConfigId }) {
  if (filaId) return filaId;
  if (!whatsappConfigId || !filaCanaisByConfigId) return null;
  return filaCanaisByConfigId.get(whatsappConfigId) || null;
}

export function clienteIdsForAtendimentoAlerts({
  role,
  userAccess = [],
  effectiveClienteId,
  conversasClienteId,
  profileClienteId,
  clientesForAdmin = [],
  isAdminWithoutCliente,
}) {
  if (isAtendimentoScopedStaffRole(role)) {
    const fromAccess = [...new Set((userAccess || []).map((r) => r.cliente_id).filter(Boolean))];
    if (fromAccess.length) return fromAccess;
    if (conversasClienteId) return [conversasClienteId];
    if (profileClienteId) return [profileClienteId];
    return [];
  }

  if (effectiveClienteId) return [effectiveClienteId];
  if (isAdminWithoutCliente && clientesForAdmin?.length) {
    return clientesForAdmin.map((c) => c.id).filter(Boolean);
  }
  if (profileClienteId) return [profileClienteId];
  return [];
}
