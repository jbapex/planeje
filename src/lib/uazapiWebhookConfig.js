const consultError = 'Não foi possível consultar os webhooks na Uazapi. Confira a instância antes de reconfigurar.';
const verifyError = 'Não foi possível confirmar a configuração na Uazapi. Confira a instância antes de tentar novamente.';

function parseUrl(value) {
  try { return new URL(value); } catch { return null; }
}

function canonicalUrl(url) {
  const canonical = new URL(url);
  canonical.searchParams.sort();
  return canonical.href;
}

function isStringList(value) {
  return Array.isArray(value) && value.every(item => typeof item === 'string' && item.trim());
}

function findInbox(webhooks, target) {
  const candidates = webhooks.filter(row => {
    const url = parseUrl(row?.url);
    if (!url) throw new Error(consultError);
    return url.origin === target.origin && url.pathname.replace(/\/$/, '') === target.pathname;
  });
  if (candidates.length > 1 || (candidates[0] && canonicalUrl(candidates[0].url) !== canonicalUrl(target))) {
    throw new Error('O endereço do webhook do Planeje está divergente ou duplicado nesta instância. Confira os destinos na Uazapi.');
  }
  const row = candidates[0];
  if (!row) return null;
  if (typeof row.id !== 'string' || !row.id.trim() || webhooks.some(other => other !== row && other.id === row.id) ||
    typeof row.enabled !== 'boolean' || !isStringList(row.events) ||
    (row.excludeMessages !== undefined && !isStringList(row.excludeMessages)) ||
    [row.addUrlEvents, row.addUrlTypesMessages].some(value => value !== undefined && typeof value !== 'boolean')) {
    throw new Error(consultError);
  }
  return { id: row.id, url: row.url, enabled: row.enabled, events: row.events, excludeMessages: row.excludeMessages ?? [],
    addUrlEvents: row.addUrlEvents ?? false, addUrlTypesMessages: row.addUrlTypesMessages ?? false };
}

function sameItems(a, b) {
  return a.every(value => b.includes(value)) && b.every(value => a.includes(value));
}

export async function configureUazapiWebhook(fetchRequest, { baseUrl, token, webhookUrl, groups = false }) {
  const base = parseUrl(baseUrl);
  const target = parseUrl(webhookUrl);
  if (!base || base.protocol !== 'https:' || !/^[a-z0-9-]+\.uazapi\.com$/.test(base.hostname) ||
    base.port || base.username || base.password || base.pathname !== '/' || base.search || base.hash ||
    !target || target.protocol !== 'https:' || !target.searchParams.get('cliente_id') || !target.searchParams.get('secret') || !token) {
    throw new Error('O canal ou o endereço do webhook está incompleto. Confira a configuração do canal.');
  }
  const endpoint = new URL('/webhook', base).href;
  const request = (method, payload) => fetchRequest(endpoint, { method, redirect: 'error', signal: AbortSignal.timeout(10000),
    headers: { 'Content-Type': 'application/json', token }, ...(payload && { body: JSON.stringify(payload) }) });

  async function read() {
    let rows;
    try {
      const response = await request('GET');
      if (response.ok) rows = await response.json();
    } catch { throw new Error(consultError); }
    if (!Array.isArray(rows)) throw new Error(consultError);
    return findInbox(rows, target);
  }

  const current = await read();
  if (groups && !current?.enabled) throw new Error('Ative primeiro o recebimento no webhook deste canal.');
  const event = groups ? 'groups' : 'messages';
  const hasEvent = current && (!current.events.length || current.events.includes('All') || current.events.includes(event));
  if (current?.enabled && hasEvent) return false;
  const next = current ? { ...current, enabled: true, events: hasEvent ? current.events : [...current.events, event] }
    : { url: target.href, enabled: true, events: [event], excludeMessages: ['wasSentByApi'], addUrlEvents: false, addUrlTypesMessages: false };

  // Uma resposta perdida pode ter confirmado a escrita no provedor.
  await request('POST', { action: current ? 'update' : 'add', ...next }).catch(() => null);
  const confirmed = await read().catch(() => null);
  if (!confirmed?.enabled || (current && confirmed.id !== current.id) || !sameItems(confirmed.events, next.events) ||
    !sameItems(confirmed.excludeMessages, next.excludeMessages) || confirmed.addUrlEvents !== next.addUrlEvents ||
    confirmed.addUrlTypesMessages !== next.addUrlTypesMessages) throw new Error(verifyError);
  return true;
}
