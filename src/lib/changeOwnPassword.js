import { createClient } from '@supabase/supabase-js';

export async function changeOwnPassword({ supabase, email, currentPassword, newPassword, confirmPassword, createVerifier = createClient }) {
  if (!email) throw new Error('Não foi possível identificar o e-mail da sua conta.');
  if (!currentPassword) throw new Error('Informe sua senha atual.');
  if (!newPassword || newPassword.length < 8) throw new Error('A nova senha deve ter pelo menos 8 caracteres.');
  if (newPassword !== confirmPassword) throw new Error('A confirmação não corresponde à nova senha.');
  if (newPassword === currentPassword) throw new Error('Escolha uma senha diferente da atual.');

  // Verifica a senha sem substituir a sessão ativa no navegador.
  const verifier = createVerifier(supabase.supabaseUrl, supabase.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  let verified = false;
  try {
    const { error } = await verifier.auth.signInWithPassword({ email, password: currentPassword });
    if (error) {
      if (error.status === 400 || error.code === 'invalid_credentials') {
        throw new Error('A senha atual está incorreta.');
      }
      throw new Error('Não foi possível confirmar a senha atual. Tente novamente.');
    }
    verified = true;
  } finally {
    if (verified) await verifier.auth.signOut({ scope: 'local' });
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message || 'Não foi possível atualizar a senha.');
}
