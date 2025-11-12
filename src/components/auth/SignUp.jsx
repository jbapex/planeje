import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Lock, Mail, User, ShieldAlert, BadgeCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';

const SignUp = () => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [inviteRole, setInviteRole] = useState(null);
  const [invalidToken, setInvalidToken] = useState(false);

  const { signUp } = useAuth();
  const { toast } = useToast();
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get('invite_token');

    if (token) {
      const validateToken = async () => {
        const { data, error } = await supabase
          .from('invites')
          .select('role')
          .eq('token', token)
          .single();

        if (error || !data) {
          setInvalidToken(true);
          setInviteRole(null);
          toast({
            title: 'Link de convite inválido',
            description: 'Este link de convite não é válido ou expirou.',
            variant: 'destructive',
          });
        } else {
          setInviteRole(data.role);
          setInvalidToken(false);
        }
      };
      validateToken();
    }
  }, [location, toast]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (invalidToken) {
        toast({ title: 'Não é possível cadastrar', description: 'O link de convite utilizado é inválido.', variant: 'destructive'});
        return;
    }

    // Validação e limpeza do email
    let cleanedEmail = email.trim().toLowerCase();
    
    // Remove espaços e caracteres invisíveis
    cleanedEmail = cleanedEmail.replace(/\s+/g, '').replace(/[\u200B-\u200D\uFEFF]/g, '');
    
    // Remove caracteres de controle e não-ASCII problemáticos
    cleanedEmail = cleanedEmail.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
    
    // Validação básica de email (mais permissiva)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!cleanedEmail || !emailRegex.test(cleanedEmail)) {
      toast({
        title: 'Email inválido',
        description: 'Por favor, insira um email válido no formato exemplo@dominio.com',
        variant: 'destructive'
      });
      return;
    }
    
    // Debug: verificar o email antes de enviar
    console.log('Email validado no componente:', {
      original: email,
      cleaned: cleanedEmail,
      isValid: emailRegex.test(cleanedEmail),
      emailBytes: new TextEncoder().encode(cleanedEmail)
    });
    
    // Validação de senha mínima
    if (!password || password.length < 6) {
      toast({
        title: 'Senha inválida',
        description: 'A senha deve ter pelo menos 6 caracteres.',
        variant: 'destructive'
      });
      return;
    }

    setIsLoading(true);
    const roleToSignUp = inviteRole || 'colaborador';
    
    // Log para debug (remover em produção se necessário)
    console.log('Tentando cadastrar:', { 
      email: cleanedEmail, 
      role: roleToSignUp, 
      fullName: fullName.trim(),
      emailLength: cleanedEmail.length 
    });
    
    // Nota: Outros emails do mesmo domínio (@jbapex.com.br) já foram cadastrados com sucesso
    // Isso indica que o problema não é o domínio, mas algo específico com este email ou payload
    
    try {
      const { error } = await signUp(cleanedEmail, password, {
        data: {
          role: roleToSignUp,
          full_name: fullName.trim()
        }
      });
      
      if (error) {
        // Mensagens de erro mais específicas
        let errorMessage = "Ocorreu um erro ao tentar criar sua conta. Verifique os dados e tente novamente.";
        
        if (error.code === 'email_address_invalid' || error.message?.includes('email_address_invalid')) {
          errorMessage = `O email "${cleanedEmail}" foi rejeitado pelo Supabase. 

Possíveis causas:
• O domínio pode estar bloqueado nas configurações do Supabase
• É necessário configurar SMTP personalizado no painel do Supabase
• O formato do email não é aceito pelo sistema

Solução: Acesse o painel do Supabase > Authentication > Settings e verifique as configurações de email.`;
        } else if (error.message?.includes('already registered') || error.code === 'user_already_registered') {
          errorMessage = "Este email já está cadastrado. Tente fazer login ou use outro email.";
        } else if (error.message) {
          errorMessage = error.message;
        }
        
        console.error('Erro detalhado do signUp:', {
          error,
          email: cleanedEmail,
          code: error.code,
          message: error.message
        });
        
        toast({
          title: "Erro ao criar conta",
          description: errorMessage,
          variant: "destructive",
          duration: 10000,
        });
      } else {
        // Limpar o formulário após sucesso
        setEmail('');
        setPassword('');
        setFullName('');
        
        toast({
          title: "Cadastro realizado com sucesso!",
          description: "Um email de confirmação foi enviado para seu endereço. Verifique sua caixa de entrada e clique no link para confirmar sua conta.",
          duration: 6000,
        });
        
        // Opcional: redirecionar para login após alguns segundos
        setTimeout(() => {
          window.location.href = '/#/login';
        }, 3000);
      }
    } catch (err) {
      console.error('Erro ao fazer cadastro:', err);
      toast({
        title: "Erro inesperado",
        description: "Ocorreu um erro inesperado. Tente novamente mais tarde.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="bg-white rounded-2xl p-8 shadow-lg">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-purple-600 rounded-xl flex items-center justify-center mx-auto mb-4">
              <span className="text-white font-bold text-3xl">J</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Crie sua Conta</h1>
            <p className="text-gray-500">Comece a otimizar sua gestão hoje mesmo.</p>
          </div>
          
          {inviteRole && !invalidToken && (
            <div className="mb-4 p-3 bg-green-100 border border-green-200 rounded-lg flex items-center gap-2">
                <BadgeCheck className="h-5 w-5 text-green-600" />
                <p className="text-sm text-green-800">Você está se cadastrando como <span className="font-bold capitalize">{inviteRole}</span>.</p>
            </div>
          )}

          {invalidToken && (
             <div className="mb-4 p-3 bg-red-100 border border-red-200 rounded-lg flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-red-600" />
                <p className="text-sm text-red-800">Link de convite inválido ou expirado.</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Nome Completo</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <Input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Seu nome completo"
                  className="pl-10 bg-gray-100 border-gray-200 text-gray-800 placeholder-gray-400"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="pl-10 bg-gray-100 border-gray-200 text-gray-800 placeholder-gray-400"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Crie uma senha forte"
                  className="pl-10 pr-10 bg-gray-100 border-gray-200 text-gray-800 placeholder-gray-400"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={isLoading || invalidToken}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 rounded-lg transition-all duration-200"
            >
              {isLoading ? 'Criando conta...' : 'Criar Conta'}
            </Button>
          </form>

          <div className="text-center mt-6">
            <p className="text-sm text-gray-500">
              Já tem uma conta?{' '}
              <Link to="/login" className="font-medium text-purple-600 hover:text-purple-500">
                Faça login
              </Link>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default SignUp;