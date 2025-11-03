import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Link } from 'react-router-dom';
const Login = ({
  onSwitchToSignUp
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const {
    signIn
  } = useAuth();
  const handleSubmit = async e => {
    e.preventDefault();
    setIsLoading(true);
    await signIn(email, password);
    setIsLoading(false);
  };
  return <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <motion.div initial={{
      opacity: 0,
      y: 20
    }} animate={{
      opacity: 1,
      y: 0
    }} className="w-full max-w-md">
        <div className="bg-white rounded-2xl p-8 shadow-lg">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-purple-600 rounded-xl flex items-center justify-center mx-auto mb-4">
              <span className="text-white font-bold text-3xl">J</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Bem-vindo!</h1>
            <p className="text-gray-500">Faça login para continuar no JB APEX.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" className="pl-10 bg-gray-100 border-gray-200 text-gray-800 placeholder-gray-400" required />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <Input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className="pl-10 pr-10 bg-gray-100 border-gray-200 text-gray-800 placeholder-gray-400" required />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <Button type="submit" disabled={isLoading} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 rounded-lg transition-all duration-200">
              {isLoading ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>
          
          <div className="text-center mt-6">
            <p className="text-sm text-gray-500">
              Não tem uma conta?{' '}
              <button onClick={onSwitchToSignUp} className="font-medium text-purple-600 hover:text-purple-500">
                Cadastre-se
              </button>
            </p>
          </div>
        </div>
        <div className="text-center mt-4 text-xs text-gray-500 space-x-4">
            <Link to="/terms-of-service" className="hover:underline">Termos de Serviço</Link>
            <span>•</span>
            <Link to="/privacy-policy" className="hover:underline">Política de Privacidade</Link>
        </div>
      </motion.div>
    </div>;
};
export default Login;