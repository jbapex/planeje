import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import AuthLoginShell from '@/components/auth/AuthLoginShell';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { signIn } = useAuth();
  const { toast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    await signIn(email, password);
    setIsLoading(false);
  };

  const handleForgotPassword = () => {
    toast({
      title: 'Recuperação de senha',
      description: 'Entre em contato com o administrador da JB APEX para resetar sua senha.',
    });
  };

  return (
    <AuthLoginShell
      subtitle="Use o e-mail e a senha cadastrados pela equipe."
      forgotPassword={
        <button type="button" className="auth-login-forgot" onClick={handleForgotPassword}>
          Esqueceu sua senha?
        </button>
      }
      footer={
        <p className="auth-login-footer-text">
          Acesso somente com convite. Use o link enviado por Josias.
        </p>
      }
    >
      <form onSubmit={handleSubmit}>
        <div className="auth-login-field">
          <label htmlFor="login-email" className="sr-only">
            E-mail
          </label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-mail"
            required
            autoComplete="email"
          />
        </div>

        <div className="auth-login-field">
          <label htmlFor="login-password" className="sr-only">
            Senha
          </label>
          <div className="auth-login-field-wrap">
            <input
              id="login-password"
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

        <button type="submit" disabled={isLoading} className="auth-login-submit jb-gradient-bg">
          {isLoading ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </AuthLoginShell>
  );
};

export default Login;
