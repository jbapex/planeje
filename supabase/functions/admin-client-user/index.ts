/**
 * Superadmin: cria login de cliente ou vincula e-mail já cadastrado.
 * POST { email, password, full_name, cliente_id }
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.30.0';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function normalizeEmail(email: string) {
  return String(email || '').trim().toLowerCase();
}

async function findAuthUserByEmail(admin: ReturnType<typeof createClient>, email: string) {
  const adminAuth = admin.auth.admin as {
    getUserByEmail?: (email: string) => Promise<{ data: { user: { id: string; email?: string } | null }; error: unknown }>;
    listUsers: (params: { page?: number; perPage?: number }) => Promise<{
      data: { users: Array<{ id: string; email?: string | null }> } | null;
      error: unknown;
    }>;
  };

  if (typeof adminAuth.getUserByEmail === 'function') {
    const { data, error } = await adminAuth.getUserByEmail(email);
    if (!error && data?.user) return data.user;
  }

  let page = 1;
  const perPage = 200;
  while (page <= 10) {
    const { data, error } = await adminAuth.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users || [];
    const found = users.find((u) => normalizeEmail(u.email || '') === email);
    if (found) return found;
    if (users.length < perPage) break;
    page += 1;
  }
  return null;
}

function isAlreadyRegisteredError(message: string) {
  const m = String(message || '').toLowerCase();
  return m.includes('already registered') || m.includes('already been registered') || m.includes('user already exists');
}

const LOJA_NIVEIS = ['admin', 'supervisor', 'atendente'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Administrador da loja (cliente_atend_membros.nivel = admin) cria usuários da própria loja
 * ou troca a senha de um usuário que a loja criou. Nunca vincula e-mail já cadastrado.
 */
async function handleLoja(
  admin: ReturnType<typeof createClient>,
  callerId: string,
  body: { acao?: string; nivel?: string; setor_ids?: string[]; user_id?: string },
  ctx: { email: string; password: string; fullName: string; clienteId: string },
) {
  const { email, password, fullName, clienteId } = ctx;
  if (!UUID_RE.test(clienteId)) return json({ error: 'cliente_id inválido' }, 400);

  const { data: callerNivel, error: nivelError } = await admin.rpc('cliente_atend_nivel_de', {
    p_user_id: callerId,
    p_cliente_id: clienteId,
  });
  if (nivelError) return json({ error: 'Não foi possível conferir o seu nível na loja' }, 500);
  if (callerNivel !== 'admin') {
    return json({ error: 'Só o administrador da loja gerencia usuários' }, 403);
  }

  if (!password || password.length < 8) {
    return json({ error: 'A senha precisa de pelo menos 8 caracteres' }, 400);
  }

  if (body.acao === 'loja_senha') {
    const targetId = String(body.user_id || '').trim();
    if (!UUID_RE.test(targetId)) return json({ error: 'user_id inválido' }, 400);
    const { data: membro } = await admin
      .from('cliente_atend_membros')
      .select('id, created_by')
      .eq('cliente_id', clienteId)
      .eq('user_id', targetId)
      .maybeSingle();
    if (!membro) return json({ error: 'Usuário não é desta loja' }, 404);
    if (!membro.created_by) {
      return json({ error: 'Este login foi criado pela agência; a senha é trocada por ela' }, 403);
    }
    const { error: pwdError } = await admin.auth.admin.updateUserById(targetId, { password });
    if (pwdError) return json({ error: pwdError.message || 'Não trocou a senha' }, 400);
    return json({ ok: true, user_id: targetId });
  }

  const nivel = String(body.nivel || 'atendente');
  if (!LOJA_NIVEIS.includes(nivel)) return json({ error: 'Nível inválido' }, 400);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Informe um e-mail válido' }, 400);
  }
  if (!fullName) return json({ error: 'Informe o nome do usuário' }, 400);

  const askedSetores = Array.isArray(body.setor_ids)
    ? [...new Set(body.setor_ids.map((s) => String(s || '').trim()).filter((s) => UUID_RE.test(s)))]
    : [];
  let setorIds: string[] = [];
  if (askedSetores.length) {
    const { data: setores } = await admin
      .from('cliente_atend_setores')
      .select('id')
      .eq('cliente_id', clienteId)
      .in('id', askedSetores);
    setorIds = (setores || []).map((s: { id: string }) => s.id);
  }

  const existing = await findAuthUserByEmail(admin, email);
  if (existing?.id) {
    return json({ error: 'Este e-mail já tem login no Planeje. Use outro e-mail.' }, 409);
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { planeje_provisioning_role: 'cliente' },
    user_metadata: { role: 'cliente', full_name: fullName },
  });
  if (createError || !created?.user?.id) {
    if (createError && isAlreadyRegisteredError(createError.message)) {
      return json({ error: 'Este e-mail já tem login no Planeje. Use outro e-mail.' }, 409);
    }
    return json({ error: createError?.message || 'Erro ao criar usuário' }, 400);
  }
  const userId = created.user.id;

  const rollback = async () => {
    await admin.from('cliente_atend_membros').delete().eq('user_id', userId).eq('cliente_id', clienteId);
    await admin.from('profiles').delete().eq('id', userId);
    await admin.auth.admin.deleteUser(userId);
  };

  const { error: profileError } = await admin.from('profiles').upsert(
    {
      id: userId,
      role: 'cliente',
      cliente_id: clienteId,
      full_name: fullName,
      allowed_pages: nivel === 'admin' ? null : ['atendimento', 'mini-crm', 'calendario'],
    },
    { onConflict: 'id' },
  );
  if (profileError) {
    await rollback();
    return json({ error: profileError.message || 'Erro ao vincular perfil à loja' }, 400);
  }

  const { data: membro, error: membroError } = await admin
    .from('cliente_atend_membros')
    .insert({
      cliente_id: clienteId,
      user_id: userId,
      nivel,
      ativo: true,
      setor_ids: setorIds,
      nome: fullName,
      email,
      created_by: callerId,
    })
    .select('id, user_id, nivel, ativo, setor_ids, nome, email, created_by')
    .single();
  if (membroError) {
    await rollback();
    return json({ error: membroError.message || 'Erro ao cadastrar o usuário na loja' }, 400);
  }

  return json({ ok: true, user_id: userId, email, cliente_id: clienteId, membro });
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

  let body: {
    email?: string;
    password?: string;
    full_name?: string;
    cliente_id?: string;
    acao?: string;
    nivel?: string;
    setor_ids?: string[];
    user_id?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'JSON inválido' }, 400);
  }

  const email = normalizeEmail(body.email || '');
  const password = String(body.password || '');
  const fullName = String(body.full_name || '').trim();
  const clienteId = String(body.cliente_id || '').trim();

  if (!clienteId) {
    return json({ error: 'cliente_id é obrigatório' }, 400);
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser(authHeader.slice(7));
  if (callerError || !callerData?.user) {
    return json({ error: 'Sessão inválida' }, 401);
  }

  const { data: accountAccess, error: accessError } = await callerClient.rpc('planeje_current_account_access');
  if (accessError || accountAccess !== true) {
    return json({ error: 'Conta ou sessão sem acesso ativo' }, 403);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (body.acao === 'loja_criar' || body.acao === 'loja_senha') {
    return handleLoja(admin, callerData.user.id, body, { email, password, fullName, clienteId });
  }

  if (!UUID_RE.test(clienteId)) return json({ error: 'cliente_id inválido' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length < 6) {
    return json({ error: 'E-mail e senha (mín. 6 caracteres) são obrigatórios' }, 400);
  }

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', callerData.user.id)
    .maybeSingle();

  if (callerProfile?.role !== 'superadmin') {
    return json({ error: 'Apenas superadmin pode gerenciar logins de cliente' }, 403);
  }

  const { data: clienteRow } = await admin.from('clientes').select('id, empresa').eq('id', clienteId).maybeSingle();
  if (!clienteRow) {
    return json({ error: 'Cliente não encontrado' }, 404);
  }

  let userId: string | null = null;
  let linkedExisting = false;
  let createdHere = false;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { planeje_provisioning_role: 'cliente' },
    user_metadata: {
      role: 'cliente',
      full_name: fullName || clienteRow.empresa || 'Cliente',
    },
  });

  if (!createError && created?.user?.id) {
    userId = created.user.id;
    createdHere = true;
  } else if (createError && isAlreadyRegisteredError(createError.message)) {
    const existing = await findAuthUserByEmail(admin, email);
    if (!existing?.id) {
      return json({
        error: 'Este e-mail já está cadastrado, mas não foi possível localizar o usuário. Tente vincular manualmente.',
      }, 409);
    }
    userId = existing.id;
    linkedExisting = true;

  } else if (createError) {
    return json({ error: createError.message || 'Erro ao criar usuário' }, 400);
  }

  if (!userId) {
    return json({ error: 'Usuário não foi criado' }, 500);
  }

  // Only this request's newly created Auth account can be rolled back. Existing
  // accounts (including incomplete historical attempts) are never deleted here.
  const fail = async (error: string, status = 400) => {
    if (createdHere) {
      const { error: cleanupError } = await admin.auth.admin.deleteUser(userId!);
      if (cleanupError) return json({ error: 'Não foi possível concluir o cadastro. Contate o administrador para conferir o login pendente.' }, 500);
    }
    return json({ error }, status);
  };

  const { data: existingProfile, error: profileReadError } = await admin
    .from('profiles')
    .select('id, role, status, cliente_id, full_name')
    .eq('id', userId)
    .maybeSingle();
  if (profileReadError) return fail('Não foi possível conferir o perfil do usuário', 500);

  if (
    existingProfile?.cliente_id &&
    existingProfile.cliente_id !== clienteId &&
    existingProfile.role === 'cliente'
  ) {
    return fail('Este e-mail já está vinculado a outro cliente. Remova o vínculo antes de reatribuir.', 409);
  }

  // GoTrue 2.189 inserts auth.users before applying app_metadata. The INSERT
  // trigger therefore creates a pending collaborator even for admin.createUser.
  // Accept that initial profile ONLY for the Auth ID created in this request,
  // with the server-only marker returned by Auth; never convert existing staff.
  const initialClientProfile = createdHere &&
    created?.user?.app_metadata?.planeje_provisioning_role === 'cliente' &&
    existingProfile?.role === 'colaborador' && existingProfile?.status === 'pending' &&
    !existingProfile?.cliente_id;
  if (existingProfile?.role && existingProfile.role !== 'cliente' && !initialClientProfile) {
    return fail(`Este e-mail pertence a um usuário interno (${existingProfile.role}). Use outro e-mail.`, 409);
  }
  if (!createdHere && !existingProfile) {
    return fail('Este e-mail já tem conta, mas está sem perfil. Solicite a revisão do cadastro ao administrador.', 409);
  }

  // Validate ownership and role before changing an existing account's password.
  if (linkedExisting) {
    const { error: pwdError } = await admin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
      user_metadata: { role: 'cliente', full_name: fullName || clienteRow.empresa || 'Cliente' },
    });
    if (pwdError) return fail(pwdError.message || 'Falha ao atualizar senha do usuário existente');
  }

  const profilePayload = {
    id: userId,
    role: 'cliente',
    cliente_id: clienteId,
    full_name: fullName || existingProfile?.full_name || clienteRow.empresa || 'Cliente',
  };

  const { error: profileError } = await admin.from('profiles').upsert(profilePayload, { onConflict: 'id' });
  if (profileError) {
    return fail(profileError.message || 'Erro ao vincular perfil ao cliente');
  }

  return json({
    ok: true,
    user_id: userId,
    linked_existing: linkedExisting,
    already_linked: Boolean(existingProfile?.cliente_id === clienteId),
    email,
    cliente_id: clienteId,
  });
});
