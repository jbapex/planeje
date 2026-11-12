export function campaignObjectiveKey(objective) {
  const o = String(objective || '').toUpperCase();
  if (!o) return 'outros';
  if (o.includes('MESSAGE') || o.includes('CONVERSATION')) return 'mensagens';
  if (o.includes('LEAD')) return 'leads';
  if (o.includes('SALE') || o.includes('PURCHASE') || o.includes('CATALOG')) return 'compras';
  if (o.includes('CONVERSION')) return 'compras';
  if (o.includes('TRAFFIC') || o.includes('LINK_CLICK')) return 'trafego';
  if (o.includes('ENGAGE') || o.includes('POST') || o.includes('PAGE_LIKE') || o.includes('EVENT')) return 'engajamento';
  if (o.includes('AWARENESS') || o.includes('REACH') || o.includes('VIDEO') || o.includes('BRAND')) return 'alcance';
  if (o.includes('APP')) return 'app';
  return 'outros';
}
