import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { User, KeyRound, Save, Trash2, Users, Edit, PlusCircle, Send, Link as LinkIcon, Copy, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const Settings = () => {
  const [apiKey, setApiKey] = useState('');
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [isValidatingKey, setIsValidatingKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState(null); // 'saved' | 'valid' | 'invalid' | null
  const [savedKeyPreview, setSavedKeyPreview] = useState(''); // Preview da chave salva
  const [users, setUsers] = useState([]);
  const [inviteLinks, setInviteLinks] = useState([]);
  const [isInviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [isEditDialogOpen, setEditDialogOpen] = useState(false);
  const [isLinkDialogOpen, setLinkDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('colaborador');
  const [linkRole, setLinkRole] = useState('colaborador');
  const [editRole, setEditRole] = useState('');
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  
  const { toast } = useToast();
  const { user, profile, refreshProfile } = useAuth();

  const fetchUsers = useCallback(async () => {
    const { data, error } = await supabase.from('profiles').select('*');
    if (error) {
      toast({ title: "Erro ao buscar usuários", description: error.message, variant: "destructive" });
    } else {
      setUsers(data);
    }
  }, [toast]);
  
  const fetchInviteLinks = useCallback(async () => {
    const { data, error } = await supabase.from('invites').select('*');
    if (error) {
      toast({ title: "Erro ao buscar links de convite", description: error.message, variant: "destructive" });
    } else {
      setInviteLinks(data);
    }
  }, [toast]);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setAvatarUrl(profile.avatar_url || null);
    }
    if (profile?.role === 'superadmin') {
      fetchUsers();
      fetchInviteLinks();
    }
  }, [profile, fetchUsers, fetchInviteLinks]);

  const validateKey = useCallback(async (keyToValidate = null) => {
    setIsValidatingKey(true);
    const key = keyToValidate || apiKey;
    
    if (!key) {
      setIsValidatingKey(false);
      return;
    }

    try {
      // Faz uma chamada simples para validar a chave
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        setKeyStatus('valid');
        if (keyToValidate) {
          toast({ 
            title: "Chave API válida!", 
            description: "A chave está salva e funcionando corretamente.",
            duration: 3000
          });
        }
      } else if (response.status === 401 || response.status === 403) {
        setKeyStatus('invalid');
        if (keyToValidate) {
          toast({ 
            title: "Chave API inválida", 
            description: "A chave salva não está funcionando. Por favor, atualize-a.",
            variant: "destructive",
            duration: 5000
          });
        }
      } else {
        setKeyStatus('saved');
      }
    } catch (error) {
      console.error('Error validating key:', error);
      setKeyStatus('saved'); // Assume que está salva mas não conseguiu validar
    } finally {
      setIsValidatingKey(false);
    }
  }, [apiKey, toast]);

  const checkSavedKey = useCallback(async () => {
    if (profile?.role !== 'superadmin') return;
    
    try {
      const { data, error } = await supabase.rpc('get_encrypted_secret', {
        p_secret_name: 'OPENAI_API_KEY'
      });

      if (error) {
        setKeyStatus(null);
        setSavedKeyPreview('');
        return;
      }

      if (data) {
        // Mostra preview da chave (primeiros e últimos caracteres)
        const preview = data.length > 20 
          ? `${data.substring(0, 4)}...${data.substring(data.length - 4)}`
          : '****';
        setSavedKeyPreview(preview);
        setKeyStatus('saved');
        
        // Valida se a chave funciona
        await validateKey(data);
      } else {
        setKeyStatus(null);
        setSavedKeyPreview('');
      }
    } catch (error) {
      console.error('Error checking saved key:', error);
      setKeyStatus(null);
      setSavedKeyPreview('');
    }
  }, [profile?.role, validateKey]);

  // Carrega a chave salva quando o perfil é carregado
  useEffect(() => {
    if (profile?.role === 'superadmin') {
      checkSavedKey();
    }
  }, [profile?.role, checkSavedKey]);

  const handleUpdateProfile = async () => {
    if (!fullName) {
      toast({ title: "Nome inválido", description: "O nome não pode ficar em branco.", variant: "destructive" });
      return;
    }
    setUploading(true);
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName })
      .eq('id', user.id);

    if (error) {
      toast({ title: "Erro ao atualizar perfil", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Perfil atualizado com sucesso!" });
      refreshProfile();
    }
    setUploading(false);
  };

  const uploadAvatar = async (event) => {
    try {
      setUploading(true);

      if (!event.target.files || event.target.files.length === 0) {
        throw new Error('Você deve selecionar uma imagem para fazer upload.');
      }

      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      let { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file);

      if (uploadError) {
        throw uploadError;
      }
      
      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const publicUrl = data.publicUrl;
      
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;
      
      setAvatarUrl(publicUrl);
      refreshProfile();
      toast({ title: "Foto de perfil atualizada!" });

    } catch (error) {
      toast({ title: 'Erro ao fazer upload do avatar', description: error.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleSaveKey = async () => {
    if (!apiKey) {
      toast({ title: "Chave inválida", description: "Por favor, insira uma chave de API válida.", variant: "destructive" });
      return;
    }

    // Verifica se é superadmin antes de tentar salvar
    if (profile?.role !== 'superadmin') {
      toast({ title: "Acesso negado", description: "Apenas superadmins podem salvar a chave de API.", variant: "destructive" });
      return;
    }

    setIsSavingKey(true);
    const { error } = await supabase.rpc('set_encrypted_secret', {
      p_secret_name: 'OPENAI_API_KEY',
      p_secret_value: apiKey,
    });
    setIsSavingKey(false);
    if (error) {
      // Mensagem de erro mais específica
      let errorMessage = error.message || "Erro desconhecido ao salvar a chave.";
      
      if (error.message?.includes('Could not find the function') || error.message?.includes('function') && error.message?.includes('does not exist')) {
        errorMessage = "A função de banco de dados não foi encontrada. Por favor, execute o script SQL 'supabase_functions_simple.sql' no Supabase Dashboard primeiro.";
      } else if (error.message?.includes('permission') || error.message?.includes('denied')) {
        errorMessage = "Você não tem permissão para salvar. Verifique se seu perfil tem role 'superadmin'.";
      }
      
      toast({ 
        title: "Erro ao salvar a chave", 
        description: errorMessage, 
        variant: "destructive",
        duration: 8000
      });
    } else {
      toast({ title: "Chave de API salva com segurança!", description: "A integração com a OpenAI está ativa no servidor." });
      
      // Busca e valida a chave salva
      await checkSavedKey();
      await validateKey(apiKey);
      
      // Limpa o campo de input mas mantém o preview
      setApiKey('');
    }
  };

  const handleInviteUser = async () => {
    if (!inviteEmail) {
      toast({ title: "E-mail inválido", description: "Por favor, insira um e-mail para convidar.", variant: "destructive" });
      return;
    }

    const { error } = await supabase.auth.inviteUserByEmail(inviteEmail, { data: { role: inviteRole, full_name: 'Novo Usuário' } });

    if (error) {
      toast({ title: "Erro ao convidar usuário", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Convite enviado!", description: `Um convite foi enviado para ${inviteEmail}.` });
      setInviteEmail('');
      setInviteRole('colaborador');
      setInviteDialogOpen(false);
      fetchUsers();
    }
  };

  const handleGenerateInviteLink = async () => {
    setIsGeneratingLink(true);
    const token = crypto.randomUUID();
    const { data, error } = await supabase
      .from('invites')
      .insert({ token, role: linkRole, created_by: user.id })
      .select();

    if (error) {
      toast({ title: 'Erro ao gerar link', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Link de convite gerado!', description: 'O link foi adicionado à lista.' });
      setInviteLinks(prev => [...prev, ...data]);
      setLinkDialogOpen(false);
    }
    setIsGeneratingLink(false);
  };
  
  const handleDeleteInviteLink = async (id) => {
    const { error } = await supabase.from('invites').delete().eq('id', id);
    if (error) {
      toast({ title: 'Erro ao revogar link', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Link revogado!', description: 'O link de convite foi removido.' });
      setInviteLinks(prev => prev.filter(link => link.id !== id));
    }
  };

  const copyToClipboard = (token) => {
    const url = `${window.location.origin}/#/signup?invite_token=${token}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copiado!", description: "O link de convite foi copiado para sua área de transferência." });
  };

  const handleOpenEditDialog = (user) => {
    setSelectedUser(user);
    setEditRole(user.role);
    setEditDialogOpen(true);
  };

  const handleUpdateUserRole = async () => {
    if (!selectedUser || !editRole) return;
    const { error } = await supabase.from('profiles').update({ role: editRole }).eq('id', selectedUser.id);
    if (error) {
      toast({ title: "Erro ao atualizar permissão", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Permissão atualizada!", description: `A permissão de ${selectedUser.full_name} foi atualizada.` });
      setEditDialogOpen(false);
      setSelectedUser(null);
      fetchUsers();
    }
  };

  const handleDeleteUser = async (userId) => {
    toast({
      title: "Funcionalidade em desenvolvimento",
      description: "A exclusão de usuários requer configuração adicional de segurança e estará disponível em breve.",
      variant: "default",
    });
  };

  const isSuperAdmin = profile?.role === 'superadmin';

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-7xl mx-auto space-y-8"
    >
      <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Configurações</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        <div className="lg:col-span-1 space-y-8">
            <Card className="dark:bg-gray-800 dark:border-gray-700">
                <CardHeader>
                    <div className="flex items-center gap-4">
                        <User className="h-8 w-8 text-green-600" />
                        <div>
                            <CardTitle className="text-xl dark:text-white">Meu Perfil</CardTitle>
                            <CardDescription className="dark:text-gray-400">Atualize suas informações pessoais.</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-col items-center space-y-4">
                        <div className="relative group">
                            <Avatar className="h-24 w-24">
                                <AvatarImage src={avatarUrl} key={avatarUrl} alt={profile?.full_name} />
                                <AvatarFallback className="text-3xl bg-gray-200 dark:bg-gray-700 dark:text-white">
                                    {profile?.full_name ? profile.full_name.charAt(0).toUpperCase() : '?'}
                                </AvatarFallback>
                            </Avatar>
                            <Label htmlFor="avatar-upload" className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-full cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">
                                <Upload className="h-6 w-6 text-white" />
                            </Label>
                        </div>
                        <Input id="avatar-upload" type="file" className="hidden" onChange={uploadAvatar} accept="image/*" disabled={uploading} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="full_name" className="dark:text-white">Nome Completo</Label>
                        <Input id="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="dark:bg-gray-700 dark:text-white dark:border-gray-600" />
                    </div>
                </CardContent>
                <CardFooter>
                    <Button onClick={handleUpdateProfile} disabled={uploading} className="w-full">
                        {uploading ? <Loader2 className="animate-spin mr-2" /> : <Save className="mr-2 h-4 w-4" />}
                        {uploading ? 'Salvando...' : 'Salvar Perfil'}
                    </Button>
                </CardFooter>
            </Card>

            {isSuperAdmin && (
              <Card className="dark:bg-gray-800 dark:border-gray-700">
                <CardHeader>
                  <div className="flex items-center gap-4">
                    <KeyRound className="h-8 w-8 text-purple-600" />
                    <div>
                      <CardTitle className="text-xl dark:text-white">Integração com OpenAI</CardTitle>
                      <CardDescription className="dark:text-gray-400">Adicione sua chave de API da OpenAI.</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="api-key" className="dark:text-white">Chave de API da OpenAI</Label>
                    
                    {/* Mostra preview da chave salva se existir */}
                    {savedKeyPreview && keyStatus && (
                      <div className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700 rounded-md">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Chave salva:</span>
                        <code className="text-sm font-mono text-gray-800 dark:text-gray-200">{savedKeyPreview}</code>
                        {keyStatus === 'valid' && (
                          <span className="ml-auto text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                            <span className="h-2 w-2 bg-green-500 rounded-full"></span>
                            Válida
                          </span>
                        )}
                        {keyStatus === 'invalid' && (
                          <span className="ml-auto text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                            <span className="h-2 w-2 bg-red-500 rounded-full"></span>
                            Inválida
                          </span>
                        )}
                        {keyStatus === 'saved' && isValidatingKey && (
                          <span className="ml-auto text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Validando...
                          </span>
                        )}
                        {keyStatus === 'saved' && !isValidatingKey && (
                          <span className="ml-auto text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1">
                            <span className="h-2 w-2 bg-gray-400 rounded-full"></span>
                            Salva
                          </span>
                        )}
                      </div>
                    )}
                    
                    <Input 
                      id="api-key" 
                      type="password" 
                      value={apiKey} 
                      onChange={(e) => setApiKey(e.target.value)} 
                      placeholder={savedKeyPreview ? "Digite uma nova chave para substituir" : "sk-************************************************"} 
                      className="dark:bg-gray-700 dark:text-white dark:border-gray-600" 
                    />
                    
                    {/* Botões de ação */}
                    <div className="flex items-center gap-2">
                      <Button 
                        onClick={handleSaveKey} 
                        disabled={isSavingKey || !apiKey.trim()}
                        className="flex-1"
                      >
                        {isSavingKey ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        {savedKeyPreview ? 'Atualizar Chave' : 'Salvar Chave'}
                      </Button>
                      
                      {savedKeyPreview && (
                        <Button 
                          onClick={async () => {
                            // Busca a chave salva e valida
                            const { data } = await supabase.rpc('get_encrypted_secret', {
                              p_secret_name: 'OPENAI_API_KEY'
                            });
                            if (data) {
                              await validateKey(data);
                            }
                          }}
                          disabled={isValidatingKey}
                          variant="outline"
                          size="sm"
                        >
                          {isValidatingKey ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <KeyRound className="h-4 w-4 mr-2" />
                              Validar
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {savedKeyPreview 
                        ? "Sua chave está salva com segurança no Supabase. Você pode atualizá-la a qualquer momento."
                        : "Sua chave será armazenada de forma segura no Supabase Vault."
                      }
                    </p>
                    {keyStatus === 'invalid' && (
                      <p className="text-xs text-red-600 dark:text-red-400">
                        ⚠️ A chave salva não está funcionando. Por favor, atualize-a.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
        </div>

        {isSuperAdmin && (
            <Card className="lg:col-span-2 dark:bg-gray-800 dark:border-gray-700">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Users className="h-8 w-8 text-blue-600" />
                    <div>
                      <CardTitle className="text-xl dark:text-white">Gerenciamento de Usuários</CardTitle>
                      <CardDescription className="dark:text-gray-400">Adicione e gerencie os usuários do sistema.</CardDescription>
                    </div>
                  </div>
                  <div className="flex gap-2">
                        <Dialog open={isLinkDialogOpen} onOpenChange={setLinkDialogOpen}>
                            <DialogTrigger asChild>
                                <Button variant="outline" className="dark:bg-gray-700 dark:text-white dark:border-gray-600 dark:hover:bg-gray-600"><LinkIcon className="mr-2 h-4 w-4" />Gerar Link</Button>
                            </DialogTrigger>
                            <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
                                <DialogHeader>
                                    <DialogTitle className="dark:text-white">Gerar Link de Convite</DialogTitle>
                                    <DialogDescription className="dark:text-gray-400">Crie um link compartilhável para novos usuários se cadastrarem com uma permissão específica.</DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="link-role" className="dark:text-white">Permissão para o Link</Label>
                                        <Select value={linkRole} onValueChange={setLinkRole}>
                                            <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600"><SelectValue placeholder="Selecione a permissão" /></SelectTrigger>
                                            <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                                                <SelectItem value="admin" className="dark:text-white dark:hover:bg-gray-600">Admin</SelectItem>
                                                <SelectItem value="colaborador" className="dark:text-white dark:hover:bg-gray-600">Colaborador</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="ghost" onClick={() => setLinkDialogOpen(false)} className="dark:text-white dark:border-gray-600 dark:hover:bg-gray-700">Cancelar</Button>
                                    <Button onClick={handleGenerateInviteLink} disabled={isGeneratingLink}>
                                        {isGeneratingLink ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                                        Gerar Link
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>

                        <Dialog open={isInviteDialogOpen} onOpenChange={setInviteDialogOpen}>
                            <DialogTrigger asChild>
                                <Button><PlusCircle className="mr-2 h-4 w-4" />Convidar por E-mail</Button>
                            </DialogTrigger>
                            <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
                                <DialogHeader>
                                    <DialogTitle className="dark:text-white">Convidar Novo Usuário</DialogTitle>
                                    <DialogDescription className="dark:text-gray-400">Envie um convite por e-mail para um novo membro da equipe.</DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                    <div className="space-y-2">
                                    <Label htmlFor="invite-email" className="dark:text-white">E-mail do Usuário</Label>
                                    <Input id="invite-email" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="nome@exemplo.com" className="dark:bg-gray-700 dark:text-white dark:border-gray-600" />
                                    </div>
                                    <div className="space-y-2">
                                    <Label htmlFor="invite-role" className="dark:text-white">Permissão</Label>
                                    <Select value={inviteRole} onValueChange={setInviteRole}>
                                        <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600"><SelectValue placeholder="Selecione a permissão" /></SelectTrigger>
                                        <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                                        <SelectItem value="admin" className="dark:text-white dark:hover:bg-gray-600">Admin</SelectItem>
                                        <SelectItem value="colaborador" className="dark:text-white dark:hover:bg-gray-600">Colaborador</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="ghost" onClick={() => setInviteDialogOpen(false)} className="dark:text-white dark:border-gray-600 dark:hover:bg-gray-700">Cancelar</Button>
                                    <Button onClick={handleInviteUser}><Send className="mr-2 h-4 w-4" />Enviar Convite</Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <Label className="dark:text-white">Usuários Ativos</Label>
                <div className="border rounded-md max-h-60 overflow-y-auto dark:border-gray-700">
                  {users.length > 0 ? (
                    users.map(u => (
                      <div key={u.id} className="flex items-center justify-between p-3 border-b last:border-b-0 dark:border-gray-700">
                        <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                                <AvatarImage src={u.avatar_url} />
                                <AvatarFallback className="dark:bg-gray-700 dark:text-white">{u.full_name ? u.full_name.charAt(0).toUpperCase() : '?'}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium dark:text-white">{u.full_name || 'Novo Usuário'}</p>
                              <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">{u.role}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handleOpenEditDialog(u)} disabled={u.id === user.id} className="dark:text-gray-300 dark:hover:bg-gray-700">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteUser(u.id)} disabled={u.id === user.id} className="dark:text-red-400 dark:hover:bg-gray-700">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="p-4 text-sm text-gray-500 dark:text-gray-400">Nenhum usuário encontrado.</p>
                  )}
                </div>
                
                <>
                    <Label className="dark:text-white">Links de Convite Ativos</Label>
                    <div className="border rounded-md max-h-48 overflow-y-auto dark:border-gray-700">
                    {inviteLinks.length > 0 ? (
                        inviteLinks.map(link => (
                        <div key={link.id} className="flex items-center justify-between p-3 border-b last:border-b-0 dark:border-gray-700">
                            <div>
                            <p className="font-medium text-sm dark:text-white">
                                Link para <span className="font-bold capitalize">{link.role}</span>
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs md:max-w-sm">
                                Token: {link.token}
                            </p>
                            </div>
                            <div className="flex items-center gap-2">
                            <Button variant="ghost" size="icon" onClick={() => copyToClipboard(link.token)} className="dark:text-gray-300 dark:hover:bg-gray-700">
                                <Copy className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteInviteLink(link.id)} className="dark:text-red-400 dark:hover:bg-gray-700">
                                <Trash2 className="h-4 w-4" />
                            </Button>
                            </div>
                        </div>
                        ))
                    ) : (
                        <p className="p-4 text-sm text-gray-500 dark:text-gray-400">Nenhum link de convite ativo.</p>
                    )}
                    </div>
                </>

              </CardContent>
            </Card>
        )}
      </div>

      {isSuperAdmin && (
          <Dialog open={isEditDialogOpen} onOpenChange={setEditDialogOpen}>
            <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
              <DialogHeader>
                <DialogTitle className="dark:text-white">Editar Permissão</DialogTitle>
                <DialogDescription className="dark:text-gray-400">Altere a permissão de {selectedUser?.full_name}.</DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Label htmlFor="edit-role" className="dark:text-white">Permissão</Label>
                <Select value={editRole} onValueChange={setEditRole}>
                  <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600"><SelectValue placeholder="Selecione a permissão" /></SelectTrigger>
                  <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                    <SelectItem value="superadmin" className="dark:text-white dark:hover:bg-gray-600">Super Admin</SelectItem>
                    <SelectItem value="admin" className="dark:text-white dark:hover:bg-gray-600">Admin</SelectItem>
                    <SelectItem value="colaborador" className="dark:text-white dark:hover:bg-gray-600">Colaborador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setEditDialogOpen(false)} className="dark:text-white dark:border-gray-600 dark:hover:bg-gray-700">Cancelar</Button>
                <Button onClick={handleUpdateUserRole}><Save className="mr-2 h-4 w-4" />Salvar Alterações</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
      )}
    </motion.div>
  );
};

export default Settings;