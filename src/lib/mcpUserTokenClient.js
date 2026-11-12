import { supabase } from '@/lib/customSupabaseClient';

export const MCP_PUBLIC_ENDPOINT = 'https://mcp.planeje.jbapex.com.br/mcp';

export async function listMcpUserTokens(userId = null) {
  const { data, error } = await supabase.rpc('list_mcp_user_tokens', {
    p_user_id: userId,
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

/** Gera token — o valor completo só vem nesta resposta. */
export async function generateMcpUserToken({ label = 'default', userId = null } = {}) {
  const { data, error } = await supabase.rpc('generate_mcp_user_token', {
    p_label: label,
    p_user_id: userId,
  });
  if (error) throw error;
  return data;
}

export async function revokeMcpUserToken(tokenId) {
  const { data, error } = await supabase.rpc('revoke_mcp_user_token', {
    p_token_id: tokenId,
  });
  if (error) throw error;
  return Boolean(data);
}

export function buildMcpClientConfig(token) {
  return {
    mcpServers: {
      planeje: {
        type: 'streamable-http',
        url: MCP_PUBLIC_ENDPOINT,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    },
  };
}
