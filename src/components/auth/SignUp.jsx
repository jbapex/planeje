import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { requestTeamInvite } from '@/lib/teamInviteClient';
import AuthLoginShell from '@/components/auth/AuthLoginShell';

export default function SignUp() {
  const location = useLocation();
  const token = new URLSearchParams(location.search).get('invite_token');
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  useEffect(() => {
    let cancelled = false;
    setInvite(null); setDone(false); setError(''); setLoading(true);
    if (!token) {
      setError('O cadastro é feito somente pelo link de convite enviado por Josias.');
      setLoading(false);
      return undefined;
    }
    requestTeamInvite({ action: 'inspect', token })
      .then(data => { if (!cancelled) setInvite(data); })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);
  const accept = async event => {
    event.preventDefault();
    if (!invite || saving) return;
    setSaving(true); setError('');
    try {
      await requestTeamInvite({ action: 'accept', token, full_name: fullName, password });
      setDone(true); setPassword('');
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };
  return <AuthLoginShell title={done ? 'Seu acesso está pronto' : 'Concluir convite'}
    subtitle="Acesso somente para pessoas convidadas por Josias."
    footer={<p className="auth-login-footer-text"><Link to="/login">Ir para o login</Link></p>}>
    {loading && <p>Conferindo convite…</p>}
    {error && <div role="alert" className="auth-login-alert auth-login-alert--error">{error}</div>}
    {done ? <p>Entre com o e-mail do convite e a senha que você definiu.</p> : invite && <form onSubmit={accept}>
      <div className="auth-login-field"><label htmlFor="signup-email">E-mail do convite</label>
        <input id="signup-email" type="email" value={invite.recipient_email} readOnly autoComplete="email" /></div>
      <div className="auth-login-field"><label htmlFor="signup-name">Nome completo</label>
        <input id="signup-name" value={fullName} onChange={e => setFullName(e.target.value)} required maxLength={160} autoComplete="name" /></div>
      <div className="auth-login-field"><label htmlFor="signup-password">Defina sua senha</label>
        <input id="signup-password" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} maxLength={128} autoComplete="new-password" /></div>
      <button type="submit" disabled={saving} className="auth-login-submit jb-gradient-bg">{saving ? 'Concluindo…' : 'Concluir meu acesso'}</button>
    </form>}
  </AuthLoginShell>;
}
