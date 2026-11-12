import type { SupabaseClient } from '@supabase/supabase-js';
import { loadApprovedTeamUser } from './accountAccess.js';

export type McpActorLike =
  | { type: 'user'; user_id: string; role: string }
  | { type: 'admin_key' }
  | { type: 'anon' };

export type ModuleAccess = {
  modules: Record<string, boolean>;
  access_levels: Record<string, 'self' | 'all'>;
  role: string | null;
  user_id: string | null;
  is_admin: boolean;
  is_team: boolean;
};

const TEAM_ROLES = new Set(['superadmin', 'admin', 'colaborador']);
const MODULES = new Set(['clients', 'financeiro', 'projects', 'tasks', 'atendimento', 'mini_crm',
  'crm', 'rastreamento', 'requests', 'social_media', 'paid_traffic', 'reports', 'onboarding',
  'automacoes', 'assistant', 'client_area', 'pgm', 'caixa', 'dashboard', 'settings']);
const ADMIN_MODULES = new Set(['financeiro', 'requests', 'automacoes']);

export function isTeamActor(actor?: McpActorLike): boolean {
  if (!actor) return false;
  if (actor.type === 'admin_key') return true;
  if (actor.type === 'user') return TEAM_ROLES.has(actor.role);
  return false;
}

export function actorRole(actor?: McpActorLike): string | null {
  if (!actor) return null;
  if (actor.type === 'admin_key') return 'superadmin';
  if (actor.type === 'user') return actor.role;
  return null;
}

export function actorUserId(actor?: McpActorLike): string | null {
  return actor?.type === 'user' ? actor.user_id : null;
}

export async function loadModuleAccess(
  supabase: SupabaseClient,
  actor?: McpActorLike
): Promise<ModuleAccess> {
  const role = actorRole(actor);
  const userId = actorUserId(actor);
  const isAdmin = role === 'superadmin' || role === 'admin' || actor?.type === 'admin_key';
  const isTeam = isTeamActor(actor);

  const access: ModuleAccess = { modules: {}, access_levels: {}, role, user_id: userId, is_admin: isAdmin, is_team: isTeam };
  if (!isTeam || actor?.type === 'admin_key') return access;
  if (actor?.type === 'user') {
    const current = await loadApprovedTeamUser(supabase, actor.user_id);
    if (!current || current.role !== actor.role) throw new Error('Conta inativa, sessão revogada ou papel alterado. Reconecte.');
  }
  if (role === 'superadmin') return access;

  const modules = access.modules;
  const { data: globalRows, error: globalError } = await supabase
    .from('module_settings')
    .select('module_name, is_enabled');
  if (globalError || !Array.isArray(globalRows)) throw new Error('Não foi possível validar as permissões globais.');
  for (const row of globalRows ?? []) {
    const rec = row as { module_name?: string; is_enabled?: boolean };
    if (rec.module_name) modules[rec.module_name] = rec.is_enabled === true;
  }

  if (userId) {
    const { data: userRows, error: userError } = await supabase
      .from('user_module_permissions')
      .select('module_name, is_enabled')
      .eq('user_id', userId);
    if (userError || !Array.isArray(userRows)) throw new Error('Não foi possível validar as permissões do usuário.');
    for (const row of userRows ?? []) {
      const rec = row as { module_name?: string; is_enabled?: boolean };
      if (rec.module_name) modules[rec.module_name] = rec.is_enabled === true;
    }
    const { data: accessRows, error: accessError } = await supabase
      .from('user_module_access')
      .select('module_name, access_level')
      .eq('user_id', userId);
    if (accessError || !Array.isArray(accessRows)) throw new Error('Não foi possível validar o escopo das permissões.');
    for (const row of accessRows) {
      const rec = row as { module_name?: string; access_level?: string };
      if (rec.module_name) access.access_levels[rec.module_name] = rec.access_level === 'all' ? 'all' : 'self';
    }
  }

  return access;
}

export function moduleEnabled(access: ModuleAccess, moduleName: string): boolean {
  if (!access.is_team) return false;
  if (access.role === 'superadmin') return true;
  if (moduleName === 'cobertura') return moduleEnabled(access, 'tasks') && moduleEnabled(access, 'projects');
  if (!access.user_id || !MODULES.has(moduleName)) return false;
  if (ADMIN_MODULES.has(moduleName) && !access.is_admin) return false;
  if (moduleName === 'caixa' || moduleName === 'dashboard' || moduleName === 'settings') return true;
  if (access.modules[moduleName] === undefined) return true;
  return access.modules[moduleName] === true;
}

export function reportsAccess(access: ModuleAccess): 'self' | 'all' {
  return access.role === 'superadmin' || access.access_levels.reports === 'all' ? 'all' : 'self';
}

export function denyModule(access: ModuleAccess, moduleName: string): string | null {
  if (!access.is_team) return 'Esta sessão não é da equipe interna.';
  if (!moduleEnabled(access, moduleName)) {
    return `O módulo ${moduleName} não está habilitado para este usuário.`;
  }
  return null;
}
