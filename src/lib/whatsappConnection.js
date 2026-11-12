import { supabase, supabaseUrl, supabaseAnonKey } from '@/lib/customSupabaseClient';
export { normalizePairingPhone, whatsappConnectionUrl, CONNECTION_TOKEN_PATTERN, isWhatsappConnectionPath, canManageWhatsappConnection } from '../../supabase/functions/_shared/whatsappConnection.js';

export async function manageWhatsappConnectionLink(action, clienteId, configId) {
  const { data, error } = await supabase.functions.invoke('whatsapp-connection', {
    body: { action, cliente_id: clienteId, config_id: configId },
  });
  if (error) {
    let detail;
    try { detail = await error.context?.clone().json(); } catch { /* safe fallback */ }
    throw new Error(detail?.error || 'Não foi possível gerenciar o link. Tente novamente.');
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function publicWhatsappConnectionRequest(action, token, values = {}, signal) {
  const response = await fetch(`${supabaseUrl}/functions/v1/whatsapp-connection`, {
    method: 'POST', cache: 'no-store', credentials: 'omit', signal,
    headers: { 'Content-Type': 'application/json', apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` },
    body: JSON.stringify({ action, token, ...values }),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data?.error || 'Não foi possível consultar a conexão.');
    error.invalidLink = data?.code === 'invalid_link';
    error.retryAfter = Number(data?.retry_after) || 0;
    throw error;
  }
  return data;
}
