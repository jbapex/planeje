/**
 * Superadmin: remove usuário interno (admin/colaborador) do sistema.
 * POST { user_id: string }
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function authErrorMessage(err: { message?: unknown } | null | undefined) {
  if (!err) return 'Falha ao remover login.';
  if (typeof err.message === 'string' && err.message.trim()) return err.message;
  try {
    const serialized = JSON.stringify(err.message ?? err);
    if (serialized && serialized !== '{}' && serialized !== 'null') return serialized;
  } catch {
    // ignore
  }
  return 'Dados removidos, mas falha ao remover login. Contate o suporte.';
}

const OWNER_NULLIFY_TABLES = [
  'client_documents',
  'client_checklists',
  'cliente_briefings',
  'clientes',
  'projetos',
  'tarefas',
  'solicitacoes',
  'task_solicitations',
  'paid_campaigns',
  'task_statuses',
];

async function nullifyOwnerReferences(admin: ReturnType<typeof createClient>, userId: string) {
  for (const table of OWNER_NULLIFY_TABLES) {
    const { error } = await admin.from(table).update({ owner_id: null }).eq('owner_id', userId);
    if (error && !error.message?.includes('does not exist') && error.code !== '42P01') {
      throw error;
    }
  }
}

async function cleanupTeamUserData(admin: ReturnType<typeof createClient>, userId: string) {
  const { error: rpcError } = await admin.rpc('admin_cleanup_team_user', {
    p_target_id: userId,
  });

  if (!rpcError) return;

  const rpcMissing =
    rpcError.message?.includes('admin_cleanup_team_user') &&
    (rpcError.message?.includes('does not exist') || rpcError.code === '42883');

  if (!rpcMissing) {
    throw new Error(rpcError.message || 'Erro ao limpar dados do usuário');
  }

  // Fallback se a migration ainda não foi aplicada
  const { data: tasks, error: assigneeError } = await admin
    .from('tarefas')
    .select('id, assignee_ids')
    .filter('assignee_ids', 'cs', `{${userId}}`);

  if (assigneeError) throw assigneeError;

  for (const task of tasks || []) {
    const current = Array.isArray(task.assignee_ids) ? task.assignee_ids : [];
    const next = current.filter((id: string) => id !== userId);
    if (next.length === current.length) continue;
    const { error: updateError } = await admin.from('tarefas').update({ assignee_ids: next }).eq('id', task.id);
    if (updateError) throw updateError;
  }

  await admin.from('user_module_permissions').delete().eq('user_id', userId);
  await admin.from('user_module_access').delete().eq('user_id', userId);
  await nullifyOwnerReferences(admin, userId);

  const { error: profileDeleteError } = await admin.from('profiles').delete().eq('id', userId);
  if (profileDeleteError) {
    throw new Error(profileDeleteError.message || 'Erro ao remover perfil');
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return json({ error: 'Configuração do servidor incompleta' }, 500);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'Não autenticado' }, 401);
  }

  let body: { user_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'JSON inválido' }, 400);
  }

  const targetUserId = String(body.user_id || '').trim();
  if (!targetUserId) {
    return json({ error: 'user_id é obrigatório' }, 400);
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerData?.user) {
    return json({ error: 'Sessão inválida' }, 401);
  }

  const callerId = callerData.user.id;
  if (targetUserId === callerId) {
    return json({ error: 'Você não pode excluir sua própria conta por aqui' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', callerId)
    .maybeSingle();

  if (callerProfile?.role !== 'superadmin') {
    return json({ error: 'Apenas superadmin pode excluir usuários da equipe' }, 403);
  }

  const { data: targetProfile, error: targetError } = await admin
    .from('profiles')
    .select('id, role, full_name, cliente_id')
    .eq('id', targetUserId)
    .maybeSingle();

  if (targetError) {
    return json({ error: targetError.message || 'Erro ao buscar usuário' }, 400);
  }
  if (!targetProfile) {
    return json({ error: 'Usuário não encontrado' }, 404);
  }

  const targetRole = String(targetProfile.role || '');
  if (targetRole === 'superadmin') {
    return json({ error: 'Não é permitido excluir outro superadmin' }, 403);
  }
  if (targetRole === 'cliente' || targetProfile.cliente_id) {
    return json({
      error: 'Usuários de cliente são gerenciados em Super Admin → Usuários de Cliente',
    }, 403);
  }
  if (!['admin', 'colaborador'].includes(targetRole)) {
    return json({ error: `Não é possível excluir usuário com papel "${targetRole}"` }, 403);
  }

  try {
    await cleanupTeamUserData(admin, targetUserId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message || 'Erro ao limpar dados do usuário' }, 400);
  }

  const { error: authDeleteError } = await admin.auth.admin.deleteUser(targetUserId);
  if (authDeleteError) {
    const { data: stillHasProfile } = await admin
      .from('profiles')
      .select('id')
      .eq('id', targetUserId)
      .maybeSingle();

    return json({
      error: authErrorMessage(authDeleteError),
      partial: true,
      profile_removed: !stillHasProfile?.id,
    }, 400);
  }

  return json({
    ok: true,
    user_id: targetUserId,
    full_name: targetProfile.full_name,
    role: targetRole,
  });
});
