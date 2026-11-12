import React from 'react';
import { Link } from 'react-router-dom';
import AuthLoginShell from '@/components/auth/AuthLoginShell';

export default function SignUpSuperAdmin() {
  return <AuthLoginShell title="Acesso restrito" subtitle="O cadastro público de administradores está fechado."
    footer={<p className="auth-login-footer-text"><Link to="/login">Ir para o login</Link></p>}>
    <p>Use o link de convite enviado por Josias.</p>
  </AuthLoginShell>;
}
