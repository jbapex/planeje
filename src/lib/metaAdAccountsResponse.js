/**
 * Resposta da Edge meta-ads-api com action get-ad-accounts quando não há contas
 * visíveis para o token (HTTP 200 + error informativo + lista vazia).
 */
export function getMetaAdAccountsErrorMessage(data) {
  if (!data?.error) return '';
  if (typeof data.error === 'string') return data.error;
  return data.error?.message || JSON.stringify(data.error);
}

export function isMetaNoAdAccountsResponse(data) {
  const msg = getMetaAdAccountsErrorMessage(data);
  if (!msg) return false;
  const accounts = data?.adAccounts;
  const listEmpty = !Array.isArray(accounts) || accounts.length === 0;
  const isNoAccountsMsg =
    msg.includes('Nenhuma conta de anúncio encontrada') ||
    /no ad account|nenhuma conta de anúncio/i.test(msg);
  return listEmpty && isNoAccountsMsg;
}

export function isMetaNoAdAccountsError(err) {
  const msg = err?.message || err?.error?.message || '';
  return (
    msg.includes('Nenhuma conta de anúncio encontrada') ||
    /no ad account|nenhuma conta de anúncio/i.test(msg)
  );
}

/** Resposta JSON da Edge (HTTP 200) com erro do Graph — throttling / cota. */
export function isMetaGraphRateLimited(data) {
  const err = data?.error;
  if (!err) return false;
  const msg = typeof err === 'string' ? err : err.message || '';
  const code = typeof err === 'object' ? err.code : null;
  if (code === 4 || code === 17 || code === 32) return true;
  return /rate limit|request limit|too many calls|user request limit|temporariamente indisponível/i.test(
    String(msg)
  );
}

export function isMetaGraphRateLimitMessage(message) {
  if (!message) return false;
  return isMetaGraphRateLimited({ error: { message: String(message) } });
}

/** Texto para toast quando o utilizador esbarra no limite do Meta. */
export function getMetaGraphRateLimitHint() {
  return 'O Meta limitou pedidos agora. Espere 1–2 minutos ou evite trocar campanha/conjunto muito rápido.';
}
