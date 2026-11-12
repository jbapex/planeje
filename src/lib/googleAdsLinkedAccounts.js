export function googleAdsAccountsForPicker(links = [], clientId = 'all') {
  const rows = Array.isArray(links) ? links : [];
  const filtered = clientId && clientId !== 'all' ? rows.filter((row) => row.cliente_id === clientId) : rows;
  const seen = new Set();
  const accounts = [];
  for (const row of filtered) {
    const id = String(row.google_customer_id || '').replace(/-/g, '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    accounts.push({ id, name: row.google_customer_name || id });
  }
  return accounts;
}

export function googleAdsLinkedClientIds(links = []) {
  return [...new Set((Array.isArray(links) ? links : []).map((row) => row.cliente_id).filter(Boolean))];
}

export function groupGoogleAdsLinksByClient(links = []) {
  const map = {};
  for (const row of Array.isArray(links) ? links : []) {
    const clientId = row.cliente_id;
    const id = String(row.google_customer_id || '').replace(/-/g, '').trim();
    if (!clientId || !id) continue;
    if (!map[clientId]) map[clientId] = [];
    if (map[clientId].some((account) => account.id === id)) continue;
    map[clientId].push({ id, name: row.google_customer_name || id });
  }
  return map;
}
