import React from 'react';
import { Link } from 'react-router-dom';
import PlanejeLogo from '@/components/brand/PlanejeLogo';
import '@/components/auth/auth-login.css';

function AuthLoginBackground() {
  return (
    <div className="auth-login-bg-decor" aria-hidden>
      <svg viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg">
        <path d="M-50 120 Q 200 280 400 180 T 850 80" />
        <path d="M-80 380 Q 180 520 420 400 T 880 320" />
        <path d="M100 650 Q 350 480 580 620 T 900 720" />
        <path d="M200 -40 Q 450 120 620 20 T 950 -60" opacity="0.6" />
      </svg>
    </div>
  );
}

export default function AuthLoginShell({
  variant = 'staff',
  title = 'Entre na sua conta',
  subtitle,
  children,
  footer,
  forgotPassword,
  legal = true,
}) {
  const isClient = variant === 'client';

  return (
    <div className={`auth-login-page${isClient ? ' auth-login-page--client' : ''}`}>
      <AuthLoginBackground />

      <div className="auth-login-page-wrap">
        <div className="auth-login-card">
          <div className="auth-login-brand">
            <PlanejeLogo variant="horizontal" size="auth" className="auth-login-brand-logo" />
          </div>

          <h1 className="auth-login-card-title">{title}</h1>
          {subtitle && <p className="auth-login-card-subtitle">{subtitle}</p>}

          {children}

          {forgotPassword && (
            <div className="auth-login-forgot-wrap">{forgotPassword}</div>
          )}

          {footer}
        </div>

        {legal && (
          <div className="auth-login-legal space-x-3">
            <Link to="/terms-of-service">Termos</Link>
            <span>·</span>
            <Link to="/privacy-policy">Privacidade</Link>
          </div>
        )}
      </div>
    </div>
  );
}
