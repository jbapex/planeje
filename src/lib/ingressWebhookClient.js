import { supabase, supabaseUrl } from '@/lib/customSupabaseClient';

export function buildIngressWebhookUrl({ clienteId, secret, channelId }) {
  if (!clienteId || !secret) return '';
  const q = new URLSearchParams({ cliente_id: clienteId, secret });
  if (channelId) q.set('channel_id', channelId);
  return `${supabaseUrl}/functions/v1/crm-ingress-webhook?${q.toString()}`;
}

export async function ensureClienteIngressWebhookSecret(clienteId) {
  const { data, error } = await supabase.rpc('ensure_cliente_ingress_webhook_secret', {
    p_cliente_id: clienteId,
  });
  if (error) throw error;
  return String(data || '');
}

export async function regenerateClienteIngressWebhookSecret(clienteId) {
  const { data, error } = await supabase.rpc('regenerate_cliente_ingress_webhook_secret', {
    p_cliente_id: clienteId,
  });
  if (error) throw error;
  return String(data || '');
}

export const INGRESS_CANONICAL_EXAMPLE = {
  planeje_ingress: true,
  phone: '556581488050',
  name: 'Nome do lead',
  owner_phone: '554132535236',
  ctwa_clid: 'AfhEjFiPGCa1udy4EeMCZv8dRdyC9EByrpPR4w19rg0a79Hw8WokEsQzpCPvmK4-...',
  message: 'Mensagem do lead',
  channel_key: 'Sandy',
  tracking: {
    source_id: '6993993934408',
    sourceApp: 'facebook',
  },
};
