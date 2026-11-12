import { supabase } from '@/lib/customSupabaseClient';

/** Actions que usam token do BM do cliente (não MADS). */
export const META_CTWA_CLIENT_ACTIONS = [
  'list-whatsapp-business-accounts',
  'get-waba-dataset',
  'send-ctwa-conversion',
];

export function metaCtwaSecretNameForCliente(clienteId) {
  return `META_CTWA_CLIENT_${String(clienteId || '').replace(/-/g, '_')}`;
}

export async function fetchClienteMetaCtwaSettings(clienteId) {
  if (!clienteId) return { businessId: '', hasToken: false, updatedAt: null, connection: null };
  const [clienteRes, tokenRes] = await Promise.all([
    supabase
      .from('clientes')
      .select('meta_ctwa_business_id, meta_ctwa_token_updated_at, meta_rastreamento')
      .eq('id', clienteId)
      .maybeSingle(),
    supabase.rpc('cliente_has_meta_ctwa_token', { p_cliente_id: clienteId }),
  ]);
  return {
    businessId: clienteRes.data?.meta_ctwa_business_id?.trim() || '',
    hasToken: !!tokenRes.data,
    updatedAt: clienteRes.data?.meta_ctwa_token_updated_at || null,
    connection: clienteRes.data?.meta_rastreamento || null,
  };
}

function unwrapMetaManual(result) {
  if (result.error) {
    const nested = result.data?.error?.message || result.data?.message || result.error.message;
    const err = new Error(nested || 'Falha ao falar com o backend Meta');
    err.cause = result;
    throw err;
  }
  const data = result.data || {};
  if (data.ok === false || data.error) {
    throw new Error(data.error?.message || data.message || 'A Meta recusou a configuração');
  }
  return data;
}

export async function validateClienteMetaToken(clienteId, { accessToken, credentialLabel, businessId } = {}) {
  return unwrapMetaManual(
    await invokeMetaAdsForCliente(clienteId, {
      action: 'validate-cliente-meta-token',
      accessToken,
      credentialLabel,
      businessId,
    }),
  );
}

export async function discoverClienteMetaAssets(clienteId, businessId, adAccountIds = []) {
  return unwrapMetaManual(
    await invokeMetaAdsForCliente(clienteId, {
      action: 'discover-cliente-meta-assets',
      businessId,
      adAccountIds,
    }),
  );
}

export async function activateClienteMetaConnection(clienteId, payload) {
  return unwrapMetaManual(
    await invokeMetaAdsForCliente(clienteId, {
      action: 'activate-cliente-meta-connection',
      ...payload,
    }),
  );
}

export async function testClienteMetaConnection(clienteId, payload = {}) {
  return unwrapMetaManual(
    await invokeMetaAdsForCliente(clienteId, {
      action: 'test-cliente-meta-connection',
      ...payload,
    }),
  );
}

export async function listClienteMetaTokenSources(clienteId) {
  return unwrapMetaManual(
    await invokeMetaAdsForCliente(clienteId, {
      action: 'list-cliente-meta-token-sources',
    }),
  );
}

export async function reuseClienteMetaToken(clienteId, sourceClienteId) {
  return unwrapMetaManual(
    await invokeMetaAdsForCliente(clienteId, {
      action: 'reuse-cliente-meta-token',
      sourceClienteId,
    }),
  );
}

export async function saveClienteMetaCtwaToken(clienteId, { token, businessId }) {
  const trimmed = token?.trim() || '';
  const { error } = await supabase.rpc('set_cliente_meta_ctwa_token', {
    p_cliente_id: clienteId,
    p_token: trimmed || null,
    p_business_id: businessId?.trim() || null,
    p_update_token: !!trimmed,
  });
  if (error) throw error;
}

/** Deploy manual só CTWA: crie `meta-ctwa-api` e defina VITE_META_CTWA_FUNCTION=meta-ctwa-api */
const CTWA_FUNCTION_NAME = import.meta.env?.VITE_META_CTWA_FUNCTION || 'meta-ads-api';

export async function invokeMetaAdsForCliente(clienteId, body) {
  return supabase.functions.invoke(CTWA_FUNCTION_NAME, {
    body: { ...body, clienteId },
  });
}
