function sanitizeGoogleAdsErrorMessage(msg) {
  if (!msg || typeof msg !== 'string') return '';
  if (/<!DOCTYPE html>/i.test(msg) || /<title>Error 404/i.test(msg)) {
    return 'Google Ads API retornou 404. Verifique Developer Token, versão da API e se a função google-ads-api está atualizada.';
  }
  if (msg.length > 280) return `${msg.slice(0, 280)}…`;
  return msg;
}

export function getGoogleAdAccountsErrorMessage(data) {
  if (!data?.error) return '';
  if (typeof data.error === 'string') return sanitizeGoogleAdsErrorMessage(data.error);
  return sanitizeGoogleAdsErrorMessage(data.error?.message) || JSON.stringify(data.error);
}

export function isGoogleNoCustomersResponse(data) {
  const msg = getGoogleAdAccountsErrorMessage(data);
  const list = data?.customers;
  const listEmpty = !Array.isArray(list) || list.length === 0;
  return listEmpty && /nenhuma conta|no customer|not found/i.test(msg);
}
