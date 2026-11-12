let pending = null;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function captureCrmIaCalendarCallback(location = window.location, history = window.history, now = Date.now()) {
  const [path, query = ''] = location.hash.slice(1).split('?');
  if (path !== '/crm-ia/configuracoes') return;
  const params = new URLSearchParams(query);
  if (!['google_calendar', 'calendar_code', 'calendar_state', 'calendar_error'].some(key => params.has(key))) return;
  const clientId = params.get('cliente'), state = params.get('calendar_state'), code = params.get('calendar_code');
  pending = params.get('google_calendar') === 'finalize' && UUID.test(clientId || '') && /^crmcal1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(state || '')
    && code && code.length <= 4096 && !/[\r\n]/.test(code) ? { clientId, state, code, capturedAt: now } : null;
  for (const key of ['google_calendar', 'calendar_code', 'calendar_state', 'calendar_error']) params.delete(key);
  history.replaceState(history.state, '', `${location.pathname}${location.search}#${path}${params.size ? `?${params}` : ''}`);
}

export function takeCrmIaCalendarCallback(clientId, now = Date.now()) {
  if (pending && now - pending.capturedAt > 300000) pending = null;
  if (!pending || pending.clientId !== clientId) return null;
  const { state, code } = pending; pending = null;
  return { state, code };
}
