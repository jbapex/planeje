import React, { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';
import AuthLoginShell from '@/components/auth/AuthLoginShell';

const ClientLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { signIn, profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (profile?.role === 'cliente' && profile?.cliente_id) {
      navigate('/cliente/support', { replace: true });
    }
  }, [profile, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    const { error } = await signIn(email, password);

    if (error) {
      setIsLoading(false);
      return;
    }

    navigate('/cliente/support', { replace: true });
    setIsLoading(false);
  };

  const handleForgotPassword = () => {
    toast({
      title: 'Recuperação de senha',
      description: 'Entre em contato com o administrador da JB APEX para resetar sua senha.',
    });
  };

  return (
    <div className="planeje-cliente-app">
      <AuthLoginShell
        variant="client"
        title="Área do cliente"
        subtitle="E-mail e senha fornecidos pela JB APEX."
        forgotPassword={
          <button type="button" className="auth-login-forgot" onClick={handleForgotPassword}>
            Esqueceu sua senha?
          </button>
        }
      >
        <form onSubmit={handleSubmit}>
          <div className="auth-login-field">
            <label htmlFor="client-login-email" className="sr-only">
              E-mail
            </label>
            <input
              id="client-login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-mail"
              required
              autoComplete="email"
            />
          </div>

          <div className="auth-login-field">
            <label htmlFor="client-login-password" className="sr-only">
              Senha
            </label>
            <div className="auth-login-field-wrap">
              <input
                id="client-login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Senha"
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                className="auth-login-toggle-pw"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button type="submit" disabled={isLoading} className="auth-login-submit">
            {isLoading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </AuthLoginShell>
    </div>
  );
};

export default ClientLogin;
