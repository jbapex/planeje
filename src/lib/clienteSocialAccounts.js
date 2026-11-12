import { rewritePublicStorageUrl } from './publicStorageUrl.js';

/** Plataformas de vínculo orgânico (não confundir com contas de anúncio). */
export const SOCIAL_PLATFORMS = {
  facebook_page: {
    id: 'facebook_page',
    label: 'Página Facebook',
    channel: 'Facebook',
  },
  instagram: {
    id: 'instagram',
    label: 'Instagram',
    channel: 'Instagram',
  },
};

export function platformLabel(platform) {
  return SOCIAL_PLATFORMS[platform]?.label || platform || 'Destino';
}

export function channelForPlatform(platform) {
  return SOCIAL_PLATFORMS[platform]?.channel || '';
}

export function platformForChannel(channel) {
  const key = String(channel || '').trim().toLowerCase();
  if (key === 'instagram') return 'instagram';
  if (key === 'facebook') return 'facebook_page';
  return null;
}

export function displaySocialAccount(row) {
  if (!row) return '';
  if (row.platform === 'instagram') {
    const handle = row.username ? `@${String(row.username).replace(/^@/, '')}` : '';
    return handle || row.display_name || row.meta_id;
  }
  return row.display_name || row.username || row.meta_id;
}

export async function fetchClienteSocialAccounts(client, clienteId, { activeOnly = true } = {}) {
  if (!clienteId) return [];
  let query = client
    .from('cliente_social_accounts')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('platform', { ascending: true })
    .order('display_name', { ascending: true });
  if (activeOnly) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export const SOCIAL_ACCOUNT_IN_CHUNK = 80;

export function chunkIds(ids = [], size = SOCIAL_ACCOUNT_IN_CHUNK) {
  const list = [...ids];
  const chunks = [];
  const step = Math.max(1, Number(size) || SOCIAL_ACCOUNT_IN_CHUNK);
  for (let index = 0; index < list.length; index += step) {
    chunks.push(list.slice(index, index + step));
  }
  return chunks;
}

export async function fetchClientsSocialAccountsMap(client, clienteIds = []) {
  const ids = [...new Set((clienteIds || []).filter(Boolean))];
  if (!ids.length) return new Map();
  const map = new Map();
  for (const slice of chunkIds(ids)) {
    const { data, error } = await client
      .from('cliente_social_accounts')
      .select('*')
      .in('cliente_id', slice)
      .eq('is_active', true);
    if (error) throw error;
    for (const row of data || []) {
      const list = map.get(row.cliente_id) || [];
      list.push(row);
      map.set(row.cliente_id, list);
    }
  }
  return map;
}

export function accountsByPlatform(accounts = []) {
  const pages = [];
  const instagram = [];
  for (const row of accounts) {
    if (row.platform === 'facebook_page') pages.push(row);
    else if (row.platform === 'instagram') instagram.push(row);
  }
  return { pages, instagram };
}

/** Clientes com Instagram ou página Facebook ativos — só estes publicam na Meta. */
export function clientsWithMetaAccounts(clients = [], accountsMap = new Map()) {
  return (clients || [])
    .filter((client) => (accountsMap.get(client.id) || []).length > 0)
    .sort((a, b) => String(a.empresa || '').localeCompare(String(b.empresa || ''), 'pt-BR'));
}

export function clientBoardPhotoUrls(client, accounts = []) {
  const { pages, instagram } = accountsByPlatform(accounts);
  const seen = new Set();
  const urls = [];
  for (const url of [
    instagram[0]?.profile_picture_url,
    pages[0]?.profile_picture_url,
    ...(Array.isArray(client?.logo_urls) ? client.logo_urls : []),
  ]) {
    const value = rewritePublicStorageUrl(String(url || '').trim());
    if (!value || seen.has(value)) continue;
    seen.add(value);
    urls.push(value);
  }
  return urls;
}

/** Opções disponíveis da Graph menos as já vinculadas ativas. */
export function filterAvailableToLink(catalog = [], linked = [], platform) {
  const taken = new Set(
    (linked || [])
      .filter((row) => row.platform === platform && row.is_active !== false)
      .map((row) => String(row.meta_id))
  );
  return (catalog || []).filter((item) => !taken.has(String(item.id || item.meta_id)));
}
