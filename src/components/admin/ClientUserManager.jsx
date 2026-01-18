import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Plus, Mail, Lock, User, X, Check, Copy, RefreshCw } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

const ClientUserManager = ({ clientId, clientName, onClose }) => {
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    full_name: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();
  const { signUp } = useAuth();

  // Buscar usuários vinculados ao cliente
  const fetchUsers = async () => {
    if (!clientId) return;
    
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, cliente_id')
      .eq('cliente_id', clientId)
      .eq('role', 'cliente')
      .order('id', { ascending: false });

    if (error) {
      toast({
        title: 'Erro ao buscar usuários',
        description: error.message,
        variant: 'destructive'
      });
      setUsers([]);
    } else {
      // Por enquanto, vamos usar os dados do profile
      // O email será mostrado depois (pode buscar via Admin API ou RPC function)
      setUsers(data || []);
      console.log('Usuários encontrados:', data?.length || 0, data);
    }
  };

  useEffect(() => {
    if (open && clientId) {
      fetchUsers();
    }
  }, [open, clientId]);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    
    if (!formData.email || !formData.password) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Email e senha são obrigatórios',
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);
    
    try {
      // 1. Criar usuário no Supabase Auth via signUp
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        options: {
          data: {
            role: 'cliente',
            full_name: formData.full_name.trim() || clientName
          }
        }
      });

      if (signUpError) {
        toast({
          title: 'Erro ao criar usuário',
          description: signUpError.message,
          variant: 'destructive'
        });
        setLoading(false);
        return;
      }

      if (!signUpData.user) {
        toast({
          title: 'Erro ao criar usuário',
          description: 'Usuário não foi criado',
          variant: 'destructive'
        });
        setLoading(false);
        return;
      }

      console.log('✅ Usuário criado no auth.users:', signUpData.user.id);
      
      // 2. Aguardar um pouco para o profile ser criado automaticamente pelo Supabase
      // O Supabase cria o profile automaticamente via trigger, mas pode demorar um pouco
      let profileExists = false;
      let attempts = 0;
      const maxAttempts = 10;
      
      while (!profileExists && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Verificar se o profile já existe
        const { data: existingProfile, error: checkError } = await supabase
          .from('profiles')
          .select('id, role, cliente_id')
          .eq('id', signUpData.user.id)
          .single();
        
        if (existingProfile) {
          profileExists = true;
          console.log('✅ Profile encontrado:', existingProfile);
        } else if (checkError && checkError.code !== 'PGRST116') {
          // PGRST116 = não encontrado (esperado se ainda não criou)
          console.warn('⚠️ Erro ao verificar profile:', checkError);
        }
        attempts++;
      }
      
      if (!profileExists) {
        console.log('⚠️ Profile não foi criado automaticamente, vamos criar manualmente');
      }

      // 3. Criar ou atualizar profile para vincular ao cliente
      // Se o profile não existir, criamos; se existir, atualizamos
      const profileData = {
        id: signUpData.user.id,
        role: 'cliente',
        cliente_id: clientId,
        full_name: formData.full_name.trim() || clientName
      };

      // Tentar upsert (criar ou atualizar)
      const { data: profileDataResult, error: profileError } = await supabase
        .from('profiles')
        .upsert(profileData, {
          onConflict: 'id'
        })
        .select();

      if (profileError) {
        console.error('Erro ao vincular cliente (upsert):', profileError);
        
        // Se upsert falhou, tentar inserir diretamente
        const { error: insertError } = await supabase
          .from('profiles')
          .insert(profileData);

        if (insertError) {
          console.error('Erro ao inserir profile:', insertError);
          toast({
            title: 'Erro ao vincular cliente',
            description: insertError.message || profileError.message,
            variant: 'destructive'
          });
          setLoading(false);
          return;
        }
      } else {
        console.log('Profile criado/atualizado com sucesso:', profileDataResult);
      }
      
      // 4. Aguardar um pouco mais para garantir que o update foi processado
      await new Promise(resolve => setTimeout(resolve, 1000));

      toast({
        title: 'Login criado com sucesso!',
        description: `Usuário ${formData.email} criado e vinculado ao cliente ${clientName}.`,
      });

      // Limpar formulário
      setFormData({ email: '', password: '', full_name: '' });
      setShowCreateForm(false);
      
      // Recarregar lista de usuários - aguardar um pouco antes
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log('🔄 Recarregando lista de usuários...');
      await fetchUsers();
      
    } catch (error) {
      toast({
        title: 'Erro inesperado',
        description: error.message || 'Erro ao criar login',
        variant: 'destructive'
      });
    }
    
    setLoading(false);
  };

  const handleCopyCredentials = (email, password) => {
    const text = `Email: ${email}\nSenha: ${password}`;
    navigator.clipboard.writeText(text);
    toast({
      title: 'Credenciais copiadas!',
      description: 'Email e senha copiados para área de transferência',
    });
  };

  const handleClose = () => {
    setOpen(false);
    if (onClose) onClose();
  };

  const generatePassword = () => {
    const length = 12;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*';
    let password = '';
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    setFormData({ ...formData, password });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerenciar Login de Cliente</DialogTitle>
          <DialogDescription>
            Cliente: <strong>{clientName}</strong>
            <br />
            Gerencie os logins de usuários vinculados a este cliente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Botão criar novo login */}
          {!showCreateForm && (
            <Button
              onClick={() => setShowCreateForm(true)}
              className="w-full"
              variant="default"
            >
              <Plus className="mr-2 h-4 w-4" />
              Criar Novo Login
            </Button>
          )}

          {/* Formulário de criação */}
          {showCreateForm && (
            <div className="border rounded-lg p-4 space-y-4 bg-gray-50 dark:bg-gray-800">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold">Novo Login</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowCreateForm(false);
                    setFormData({ email: '', password: '', full_name: '' });
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <form onSubmit={handleCreateUser} className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Email *</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="cliente@email.com"
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium mb-1 block">Senha *</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder="••••••••"
                      className="pl-10 pr-20"
                      required
                      minLength={6}
                    />
                    <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={generatePassword}
                        title="Gerar senha aleatória"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Mínimo 6 caracteres. Use o botão de gerar para criar uma senha segura.
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium mb-1 block">Nome Completo (opcional)</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                    <Input
                      type="text"
                      value={formData.full_name}
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                      placeholder={clientName || "Nome do cliente"}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button type="submit" disabled={loading} className="flex-1">
                    {loading ? 'Criando...' : 'Criar Login'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowCreateForm(false);
                      setFormData({ email: '', password: '', full_name: '' });
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* Lista de usuários */}
          <div>
            <h3 className="font-semibold mb-2">Usuários Vinculados</h3>
            {loading && users.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">Carregando...</p>
            ) : users.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                Nenhum login criado para este cliente ainda.
              </p>
            ) : (
              <div className="space-y-2">
                {users.map((user) => (
                  <div
                    key={user.id}
                    className="border rounded-lg p-3 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <div className="flex-1">
                      <p className="font-medium">{user.full_name || 'Sem nome'}</p>
                      <p className="text-sm text-gray-500">ID: {user.id.substring(0, 8)}...</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={handleClose}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ClientUserManager;
