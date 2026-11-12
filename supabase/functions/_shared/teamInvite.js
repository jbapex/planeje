export function normalizeInviteEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function validateInviteInput(body) {
  const token = String(body?.token || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    throw new Error('Convite inválido ou expirado.');
  }
  if (body.action === 'accept') {
    if (String(body.password || '').length < 8 || String(body.password).length > 128) {
      throw new Error('A senha precisa ter entre 8 e 128 caracteres.');
    }
    if (!String(body.full_name || '').trim() || String(body.full_name).length > 160) {
      throw new Error('Informe seu nome completo.');
    }
  } else if (body.action !== 'inspect') {
    throw new Error('Ação inválida.');
  }
  return token;
}

export function usableTeamInvite(invite, owner, now = Date.now()) {
  return !!invite && !!normalizeInviteEmail(invite.recipient_email)
    && ['admin', 'colaborador'].includes(invite.role)
    && !invite.consumed_at && !invite.used_by
    && new Date(invite.expires_at).getTime() > now
    && owner?.id === '07d65b46-dd33-4ce6-a98f-8940374c534c'
    && owner.role === 'superadmin' && owner.status === 'active';
}

export async function acceptTeamInvite(admin, body) {
  const token = validateInviteInput(body);
  const { data: invite, error: claimError } = await admin.rpc('planeje_claim_team_invite', { p_token: token });
  if (claimError || !invite?.id) throw new Error('Convite inválido, expirado ou já utilizado.');
  let createdId = null;
  try {
    const { data, error } = await admin.auth.admin.createUser({
      email: invite.recipient_email,
      password: body.password,
      email_confirm: true,
      user_metadata: { full_name: String(body.full_name).trim() },
    });
    if (error || !data?.user?.id) throw new Error('Não foi possível criar este acesso. Contate o administrador.');
    createdId = data.user.id;
    const { error: completeError } = await admin.rpc('planeje_complete_team_invite', {
      p_invite_id: invite.id, p_user_id: createdId,
    });
    if (completeError) throw new Error('Não foi possível concluir o convite. Contate o administrador.');
    return { ok: true };
  } catch (error) {
    let canRelease = !createdId;
    if (createdId) {
      const { error: deleteError } = await admin.auth.admin.deleteUser(createdId);
      canRelease = !deleteError;
    }
    if (canRelease) {
      await admin.from('invites').update({ consumed_at: null }).eq('id', invite.id).is('used_by', null);
    }
    throw error;
  }
}
