import { supabaseAnonKey } from '@/lib/customSupabaseClient';
import { invokeEdgeFunction } from '@/lib/supabaseFunctions';

export async function requestTeamInvite(body) {
  const { data, error } = await invokeEdgeFunction('team-invite', body, supabaseAnonKey);
  if (error) throw new Error(error.message);
  return data;
}
