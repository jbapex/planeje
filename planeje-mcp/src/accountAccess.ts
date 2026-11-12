import type { SupabaseClient } from '@supabase/supabase-js';

const TEAM_ROLES = new Set(['superadmin', 'admin', 'colaborador']);

/** Recheck opaque MCP credentials against the current account before every request. */
export async function loadApprovedTeamUser(supabase: SupabaseClient, userId: string) {
  try {
    const [profileResult, userResult] = await Promise.all([
      supabase.from('profiles').select('id, full_name, role, status').eq('id', userId).maybeSingle(),
      supabase.auth.admin.getUserById(userId),
    ]);
    const profile = profileResult.data;
    const user = userResult.data?.user;
    if (profileResult.error || userResult.error || !profile || !user || user.id !== userId ||
        profile.status !== 'active' || !TEAM_ROLES.has(profile.role)) return null;
    const bannedUntil = (user as typeof user & { banned_until?: string | null }).banned_until;
    if (bannedUntil && (!Number.isFinite(Date.parse(bannedUntil)) || Date.parse(bannedUntil) > Date.now())) return null;
    return { user_id: profile.id as string, full_name: profile.full_name as string | null,
      role: profile.role as string, email: user.email ?? '' };
  } catch {
    return null;
  }
}

export function sameMcpActor(a: { type: string; user_id?: string; role?: string },
                             b: { type: string; user_id?: string; role?: string }) {
  return a.type === b.type && (a.type !== 'user' || (a.user_id === b.user_id && a.role === b.role));
}
