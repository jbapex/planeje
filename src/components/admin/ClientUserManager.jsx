import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Plus, Mail, Lock, User, X, Check, Copy, RefreshCw, Settings, LayoutDashboard, MessageSquare, FileText, Activity, ClipboardList } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

// Definição das páginas disponíveis na área do cliente
const CLIENT_PAGES = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'trafego', label: 'Cadastro Diário', icon: FileText },
  { key: 'campaigns-status', label: 'Status das Campanhas', icon: ClipboardList },
  { key: 'apexia', label: 'ApexIA', icon: MessageSquare },
  { key: 'pgm-panel', label: 'Painel PGM', icon: Activity },
  { key: 'crm', label: 'CRM', icon: Activity },
];

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
  const [editingUser, setEditingUser] = useState(null);
  const [userPagePermissions, setUserPagePermissions] = useState({});
  const [funnelStep2Name, setFunnelStep2Name] = useState('Visita Agendada');
  const [funnelStep3Name, setFunnelStep3Name] = useState('Visita Realizada');
  const [savingFunnel, setSavingFunnel] = useState(false);
  const { toast } = useToast();
  const { signUp } = useAuth();

  // Buscar usuários vinculados ao cliente
  const fetchUsers = async () => {
    if (!clientId) return;
    
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, cliente_id, allowed_pages')
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
      setUsers(data || []);
      // Inicializar permissões de páginas para cada usuário
      const permissions = {};
      (data || []).forEach(user => {
        permissions[user.id] = user.allowed_pages || null; // null = todas as páginas
      });
      setUserPagePermissions(permissions);
      console.log('Usuários encontrados:', data?.length || 0, data);
    }
  };

  // Buscar dados do cliente (nomes das etapas do funil)
  const fetchClientData = async () => {
    if (!clientId) return;

    const { data, error } = await supabase
      .from('clientes')
      .select('funnel_step_2_name, funnel_step_3_name')
      .eq('id', clientId)
      .single();

    if (error) {
      console.error('Erro ao buscar dados do cliente:', error);
    } else if (data) {
      setFunnelStep2Name(data.funnel_step_2_name || 'Visita Agendada');
      setFunnelStep3Name(data.funnel_step_3_name || 'Visita Realizada');
    }
  };

  const handleSaveFunnelSteps = async () => {
    setSavingFunnel(true);
    try {
      const { error } = await supabase
        .from('clientes')
        .update({
          funnel_step_2_name: funnelStep2Name,
          funnel_step_3_name: funnelStep3Name
        })
        .eq('id', clientId);

      if (error) throw error;

      toast({
        title: 'Configurações salvas!',
        description: 'Os nomes das etapas do funil foram atualizados com sucesso.',
      });
    } catch (error) {
      toast({
        title: 'Erro ao salvar',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setSavingFunnel(false);
    }
  };

  useEffect(() => {
    if (open && clientId) {
      fetchUsers();
      fetchClientData();
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

  const handleOpenPagePermissions = (user) => {
    setEditingUser(user);
    // Inicializar permissões: se null, todas as páginas estão permitidas (checkbox marcado)
    // Se for array, apenas as páginas no array estão permitidas
    const currentPermissions = userPagePermissions[user.id];
    if (currentPermissions === null || currentPermissions === undefined) {
      // Todas as páginas permitidas por padrão
      setUserPagePermissions(prev => ({
        ...prev,
        [user.id]: CLIENT_PAGES.map(p => p.key)
      }));
    }
  };

  const handleTogglePagePermission = (userId, pageKey) => {
    setUserPagePermissions(prev => {
      const current = prev[userId] || [];
      const isAllowed = Array.isArray(current) && current.includes(pageKey);
      
      if (isAllowed) {
        // Remover página
        const newPermissions = current.filter(p => p !== pageKey);
        // Se não sobrou nenhuma página, retornar array vazio (nenhuma página permitida)
        return { ...prev, [userId]: newPermissions };
      } else {
        // Adicionar página
        return { ...prev, [userId]: [...current, pageKey] };
      }
    });
  };

  const handleSavePagePermissions = async (userId) => {
    const permissions = userPagePermissions[userId];
    
    // Se todas as páginas estão selecionadas, salvar como null (acesso total)
    const allPagesSelected = permissions && permissions.length === CLIENT_PAGES.length;
    const valueToSave = allPagesSelected ? null : permissions;

    const { error } = await supabase
      .from('profiles')
      .update({ allowed_pages: valueToSave })
      .eq('id', userId);

    if (error) {
      toast({
        title: 'Erro ao salvar permissões',
        description: error.message,
        variant: 'destructive'
      });
    } else {
      toast({
        title: 'Permissões salvas!',
        description: 'As páginas permitidas foram atualizadas com sucesso.',
      });
      setEditingUser(null);
      fetchUsers(); // Recarregar para atualizar a lista
    }
  };

  const getPageLabel = (pageKey) => {
    const page = CLIENT_PAGES.find(p => p.key === pageKey);
    return page ? page.label : pageKey;
  };

  const getUserAllowedPagesDisplay = (user) => {
    const permissions = userPagePermissions[user.id];
    if (permissions === null || permissions === undefined || (Array.isArray(permissions) && permissions.length === CLIENT_PAGES.length)) {
      return 'Todas as páginas';
    }
    if (Array.isArray(permissions) && permissions.length === 0) {
      return 'Nenhuma página';
    }
    if (Array.isArray(permissions)) {
      return permissions.map(getPageLabel).join(', ');
    }
    return 'Todas as páginas';
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

        <Tabs defaultValue="users" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="users">Usuários</TabsTrigger>
            <TabsTrigger value="funnel">Configurações do Funil</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-4">
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
                      className="border rounded-lg p-3 space-y-2 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="font-medium">{user.full_name || 'Sem nome'}</p>
                          <p className="text-sm text-gray-500">ID: {user.id.substring(0, 8)}...</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Páginas: {getUserAllowedPagesDisplay(user)}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenPagePermissions(user)}
                        >
                          <Settings className="h-4 w-4 mr-2" />
                          Permissões
                        </Button>
                      </div>

                      {/* Dialog de edição de permissões */}
                      {editingUser?.id === user.id && (
                        <div className="border-t pt-3 mt-3 space-y-3">
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold">Páginas Permitidas:</Label>
                            <div className="space-y-2 pl-2">
                              {CLIENT_PAGES.map((page) => {
                                const permissions = userPagePermissions[user.id] || [];
                                const isChecked = Array.isArray(permissions) && permissions.includes(page.key);
                                const PageIcon = page.icon;
                                
                                return (
                                  <div key={page.key} className="flex items-center space-x-2">
                                    <Checkbox
                                      id={`${user.id}-${page.key}`}
                                      checked={isChecked}
                                      onCheckedChange={() => handleTogglePagePermission(user.id, page.key)}
                                    />
                                    <Label
                                      htmlFor={`${user.id}-${page.key}`}
                                      className="text-sm font-normal cursor-pointer flex items-center gap-2"
                                    >
                                      <PageIcon className="h-4 w-4" />
                                      {page.label}
                                    </Label>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          <div className="flex gap-2 pt-2">
                            <Button
                              size="sm"
                              onClick={() => handleSavePagePermissions(user.id)}
                              className="flex-1"
                            >
                              Salvar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingUser(null)}
                            >
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="funnel" className="space-y-6 py-2">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="step2" className="text-sm font-medium">
                  Nome da Etapa 2 (Venda/Agendamento)
                </Label>
                <Input
                  id="step2"
                  value={funnelStep2Name}
                  onChange={(e) => setFunnelStep2Name(e.target.value)}
                  placeholder="Ex: Visita Agendada"
                />
                <p className="text-xs text-muted-foreground">
                  Label exibida nos formulários e painéis para a segunda etapa do funil.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="step3" className="text-sm font-medium">
                  Nome da Etapa 3 (Conversão/Realizada)
                </Label>
                <Input
                  id="step3"
                  value={funnelStep3Name}
                  onChange={(e) => setFunnelStep3Name(e.target.value)}
                  placeholder="Ex: Visita Realizada"
                />
                <p className="text-xs text-muted-foreground">
                  Label exibida nos formulários e painéis para a terceira etapa do funil.
                </p>
              </div>

              <Button 
                onClick={handleSaveFunnelSteps} 
                disabled={savingFunnel}
                className="w-full"
              >
                {savingFunnel ? 'Salvando...' : 'Salvar Nomes das Etapas'}
              </Button>
            </div>
          </TabsContent>
        </Tabs>

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
