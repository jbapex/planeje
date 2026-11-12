/** Carteira do gestor oficial (traffic_client_ops.primary_assignee_id). */

export function isTrafficAdmin(profile) {
  const role = profile?.role;
  return role === 'superadmin' || role === 'admin';
}

export function shouldScopeCarteiraToGestor(profile) {
  return Boolean(profile?.id) && !isTrafficAdmin(profile);
}

export function opsByClientMap(rows = []) {
  return Object.fromEntries((rows || []).map((row) => [row.client_id, row]));
}

export function clientInGestorCarteira(clientId, { userId, opsByClient = {}, accessIds = null, clientResponsavel = null } = {}) {
  if (!userId || !clientId) return false;
  const ops = opsByClient[clientId];
  if (ops?.primary_assignee_id === userId) return true;
  if (clientResponsavel && clientResponsavel === userId) return true;
  if (accessIds?.has?.(clientId) || accessIds?.has?.(String(clientId))) return true;
  return false;
}

export function keepCarteiraDoGestor(items, { profile, userId, opsByClient = {}, accessIds = null, getId, getResponsavel } = {}) {
  if (!shouldScopeCarteiraToGestor(profile)) return items || [];
  const pick = getId || ((item) => item?.client_id || item?.client?.id || item?.id);
  const responsavel = getResponsavel || ((item) => item?.responsavel || item?.client?.responsavel || null);
  return (items || []).filter((item) =>
    clientInGestorCarteira(pick(item), {
      userId,
      opsByClient,
      accessIds,
      clientResponsavel: responsavel(item),
    })
  );
}

export function paidTrafficHomePath({ showCentral, profile } = {}) {
  if (showCentral && profile?.role === 'colaborador') return '/paid-traffic/hoje';
  return '/paid-traffic/dashboard';
}

export function paidTrafficNavPath(profile) {
  return profile?.role === 'colaborador' ? '/paid-traffic/hoje' : '/paid-traffic/dashboard';
}

export function canSeeGoogleAdsTab(profile) {
  const role = profile?.role;
  return role === 'superadmin' || role === 'admin' || role === 'colaborador';
}
