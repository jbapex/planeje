import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';

const ClientLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { signIn, profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Redirecionar se já estiver logado como cliente
  useEffect(() => {
    if (profile?.role === 'cliente' && profile?.cliente_id) {
      console.log('✅ ClientLogin: Cliente já logado, redirecionando para /cliente/support');
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
    
    // Redirecionar imediatamente para /cliente/support após login bem-sucedido
    // A Home do Cliente vai permitir acesso confortável ao ApexIA e demais recursos
    // Isso evita o delay do carregamento do perfil no context
    console.log('✅ ClientLogin: Login bem-sucedido, redirecionando para /cliente/support');
    navigate('/cliente/support', { replace: true });
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-xl">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4">
              <span className="text-white font-bold text-3xl">A</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2">
              Área do Cliente
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              Acesse seu ApexIA personalizado
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="pl-10 bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200 placeholder-gray-400"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-10 pr-10 bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200 placeholder-gray-400"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-medium py-3 rounded-lg transition-all duration-200"
            >
              {isLoading ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Esqueceu sua senha?{' '}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  // TODO: Implementar recuperação de senha via Supabase
                  toast({
                    title: 'Recuperação de senha',
                    description: 'Entre em contato com o administrador para resetar sua senha.',
                  });
                }}
                className="font-medium text-purple-600 hover:text-purple-500 dark:text-purple-400"
              >
                Recuperar senha
              </a>
            </p>
          </div>
        </div>

        <div className="text-center mt-4 text-xs text-gray-500 dark:text-gray-400 space-x-4">
          <Link to="/terms-of-service" className="hover:underline">
            Termos de Serviço
          </Link>
          <span>•</span>
          <Link to="/privacy-policy" className="hover:underline">
            Política de Privacidade
          </Link>
        </div>
      </motion.div>
    </div>
  );
};

export default ClientLogin;
