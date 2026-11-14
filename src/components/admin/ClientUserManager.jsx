import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { createOrLinkClientUser } from '@/lib/adminClientUser';
import { Plus, Mail, Lock, User, X, Check, Copy, RefreshCw, Settings, LayoutDashboard, MessageSquare, Activity, ClipboardList, BarChart2, Headphones } from 'lucide-react';
import ClienteMetaCtwaAdminPanel from '@/components/crm/ClienteMetaCtwaAdminPanel';
import MiniCrmConfigCopy from '@/components/admin/MiniCrmConfigCopy';
import { ATENDIMENTO_NIVEL_LABEL } from '@/lib/atendimentoLojaAcesso';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  CLIENT_PAGES as CLIENT_PAGE_DEFS,
  allowedPagesValueToSave,
  describeAllowedPages,
  editorKeysFromAllowedPages,
} from '@/lib/clientAllowedPages';

const PAGE_ICONS = {
  dashboard: LayoutDashboard,
  'campaigns-status': ClipboardList,
  apexia: MessageSquare,
  'pgm-panel': Activity,
  crm: Activity,
  atendimento: Headphones,
};

const CLIENT_PAGES = CLIENT_PAGE_DEFS.map((page) => ({
  ...page,
  icon: PAGE_ICONS[page.key] || LayoutDashboard,
}));

const ClientUserManager = ({ clientId, clientName, onClose }) => {
  const { profile } = useAuth();
  const isSuperAdmin = profile?.role === 'superadmin';
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
  const [showUntracked, setShowUntracked] = useState(false);
  const [savingMiniCrm, setSavingMiniCrm] = useState(false);
  const [crmAccess, setCrmAccess] = useState(null);
  const [crmError, setCrmError] = useState('');
  const [savingCrm, setSavingCrm] = useState(false);
  const [crmLevels, setCrmLevels] = useState({});
  const { toast } = useToast();

  useEffect(() => {
    let active = true;
    setCrmAccess(null); setCrmError(''); setCrmLevels({});
    if (!isSuperAdmin || !clientId) return undefined;
    supabase.rpc('crm_ia_access_admin', { p_action: 'status', p_client_id: clientId }).then(({ data, error }) => {
      if (!active) return;
      if (error || data?.client?.id !== clientId) setCrmError(error?.message || 'Não foi possível conferir a liberação do CRM IA.');
      else { setCrmAccess(data); setCrmLevels(Object.fromEntries(data.members.map(member => [member.user_id, member.nivel || '']))); }
    }).catch(() => { if (active) setCrmError('Não foi possível conferir a liberação do CRM IA.'); });
    return () => { active = false; };
  }, [isSuperAdmin, clientId]);

  const handleCrmEnabled = async enabled => {
    if (savingCrm || crmAccess?.client?.id !== clientId) return;
    setSavingCrm(true); setCrmError('');
    try {
      const { data, error } = await supabase.rpc('crm_ia_access_admin', { p_action: 'set_enabled', p_client_id: clientId,
        p_payload: { enabled, expected_updated_at: crmAccess.updated_at } });
      if (error) throw error;
      setCrmAccess(data);
      toast({ title: enabled ? 'CRM IA liberado para esta conta' : 'CRM IA desativado',
        description: enabled ? 'Escolha abaixo os logins que poderão operar. A autonomia continua desligada.' : 'Novos envios foram bloqueados e as pendências canceladas. O histórico foi preservado.' });
    } catch (error) { setCrmError(`${error.message || 'Não foi possível alterar o acesso.'} Feche e abra a gestão para conferir o estado atual antes de tentar novamente.`); }
    finally { setSavingCrm(false); }
  };

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
        permissions[user.id] = editorKeysFromAllowedPages(user.allowed_pages, clientId);
      });
      setUserPagePermissions(permissions);
      console.log('Usuários encontrados:', data?.length || 0, data);
    }
  };

  // Buscar dados do cliente (nomes das etapas do funil + Mini CRM)
  const fetchClientData = async () => {
    if (!clientId) return;

    const { data, error } = await supabase
      .from('clientes')
      .select('funnel_step_2_name, funnel_step_3_name, mini_crm_show_untracked')
      .eq('id', clientId)
      .single();

    if (error) {
      console.error('Erro ao buscar dados do cliente:', error);
    } else if (data) {
      setFunnelStep2Name(data.funnel_step_2_name || 'Visita Agendada');
      setFunnelStep3Name(data.funnel_step_3_name || 'Visita Realizada');
      setShowUntracked(Boolean(data.mini_crm_show_untracked));
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

  const handleSaveMiniCrmFlag = async (next) => {
    if (!isSuperAdmin || !clientId) return;
    setSavingMiniCrm(true);
    const previous = showUntracked;
    setShowUntracked(next);
    try {
      const { error } = await supabase
        .from('clientes')
        .update({ mini_crm_show_untracked: next })
        .eq('id', clientId);
      if (error) throw error;
      toast({
        title: next ? 'Leads não rastreados liberados' : 'Leads não rastreados ocultos',
        description: 'Só o login da loja muda. A equipe continua vendo todos.',
      });
    } catch (error) {
      setShowUntracked(previous);
      toast({
        title: 'Não salvou a liberação',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSavingMiniCrm(false);
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
      const result = await createOrLinkClientUser({
        email: formData.email,
        password: formData.password,
        fullName: formData.full_name.trim() || clientName,
        clienteId: clientId,
      });

      const title = result.linked_existing
        ? result.already_linked
          ? 'Login já vinculado'
          : 'Login vinculado'
        : 'Login criado com sucesso!';

      const description = result.linked_existing
        ? result.already_linked
          ? `O e-mail ${formData.email} já estava vinculado ao cliente ${clientName}. A senha foi atualizada.`
          : `O e-mail ${formData.email} já existia e foi vinculado ao cliente ${clientName}.`
        : `Usuário ${formData.email} criado e vinculado ao cliente ${clientName}.`;

      toast({ title, description });

      setFormData({ email: '', password: '', full_name: '' });
      setShowCreateForm(false);
      await fetchUsers();
    } catch (error) {
      toast({
        title: 'Erro ao criar usuário',
        description: error.message || 'Erro ao criar login',
        variant: 'destructive',
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
    setUserPagePermissions(prev => ({
      ...prev,
      [user.id]: editorKeysFromAllowedPages(user.allowed_pages, clientId),
    }));
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
    const valueToSave = allowedPagesValueToSave(permissions);

    const crmSelected = permissions?.includes('crm-ia');
    const crmPreviouslySelected = users.find(user => user.id === userId)?.allowed_pages?.includes('crm-ia');
    let error;
    if (crmSelected || crmPreviouslySelected) {
      const member = crmAccess?.members?.find(row => row.user_id === userId);
      if (!isSuperAdmin || crmAccess?.client?.id !== clientId || !member) error = { message: 'Confira a liberação do CRM IA antes de salvar estas permissões.' };
      else {
        setSavingCrm(true);
        try {
          const result = await supabase.rpc('crm_ia_access_admin', { p_action: 'save_member', p_client_id: clientId,
            p_payload: { user_id: userId, allowed_pages: valueToSave, nivel: crmLevels[userId] || null, expected_revision: member.revision } });
          error = result.error;
          if (!error) setCrmAccess(result.data);
        } catch (failure) { error = failure; } finally { setSavingCrm(false); }
      }
    } else {
      ({ error } = await supabase.from('profiles').update({ allowed_pages: valueToSave }).eq('id', userId));
    }

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

  const getUserAllowedPagesDisplay = (user) => {
    return describeAllowedPages(user.allowed_pages, clientId);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerenciar Login de Cliente</DialogTitle>
          <DialogDescription>
            Cliente: <strong>{clientName}</strong>
            <br />
            Gerencie os logins de usuários vinculados a este cliente.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="users" className="w-full">
          <TabsList className={`grid w-full mb-4 ${isSuperAdmin ? 'grid-cols-4' : 'grid-cols-3'}`}>
            <TabsTrigger value="users">Usuários</TabsTrigger>
            <TabsTrigger value="meta-whatsapp" className="gap-1">
              <BarChart2 className="h-3.5 w-3.5 shrink-0" />
              Meta WhatsApp
            </TabsTrigger>
            <TabsTrigger value="funnel">Funil</TabsTrigger>
            {isSuperAdmin ? <TabsTrigger value="mini-crm">Mini CRM</TabsTrigger> : null}
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
                                      disabled={savingCrm || (page.key === 'crm-ia' && (!isSuperAdmin || (!crmAccess?.enabled && !isChecked)))}
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
                            {userPagePermissions[user.id]?.includes('crm-ia') && <div className="space-y-2 rounded-md border p-3">
                              <Label htmlFor={`crm-nivel-${user.id}`}>Nível no CRM IA</Label>
                              <select id={`crm-nivel-${user.id}`} className="w-full rounded-md border bg-background p-2 text-sm" value={crmLevels[user.id] || ''} disabled={!isSuperAdmin || savingCrm} onChange={event => setCrmLevels(old => ({ ...old, [user.id]: event.target.value }))}>
                                <option value="">Escolha o nível</option>{Object.entries(ATENDIMENTO_NIVEL_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                              </select>
                              <p className="text-xs text-muted-foreground">O nível também vale no Atendimento da loja. No CRM IA, a agência mantém a configuração dos agentes. Salvar libera este login existente; não altera sua senha.</p>
                            </div>}
                            {isSuperAdmin && !crmAccess?.enabled && <p className="text-xs text-muted-foreground">Libere o CRM IA na aba Mini CRM antes de autorizar um login.</p>}
                            {crmError && <p className="text-sm text-destructive" role="alert">{crmError}</p>}
                          </div>
                          <div className="flex gap-2 pt-2">
                            <Button
                              size="sm"
                              onClick={() => handleSavePagePermissions(user.id)}
                              disabled={savingCrm}
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

          <TabsContent value="meta-whatsapp" className="space-y-4 py-1">
            <ClienteMetaCtwaAdminPanel clienteId={clientId} compact />
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

          {isSuperAdmin ? (
            <TabsContent value="mini-crm" className="space-y-4 py-2">
              <section className="rounded-lg border p-4 space-y-3" aria-label="Liberação do CRM IA">
                <div className="flex items-start justify-between gap-4"><div className="space-y-1"><Label htmlFor="crm-ia-enabled">CRM IA para este cliente</Label>
                  <p className="text-xs text-muted-foreground">Somente as contas que você habilitar aparecem no CRM IA. A preparação usa os canais WhatsApp do Mini CRM e habilita o Atendimento da loja, sem mudar a situação comercial do cliente.</p></div>
                  <Switch id="crm-ia-enabled" checked={crmAccess?.client?.id === clientId && crmAccess.enabled === true} disabled={!crmAccess || savingCrm || Boolean(crmError)} onCheckedChange={handleCrmEnabled} />
                </div>
                {!crmAccess && !crmError && <p role="status" className="text-xs text-muted-foreground">Conferindo liberação…</p>}
                <p className="text-xs text-muted-foreground">Em Usuários → Permissões, marque CRM IA e escolha o nível de cada pessoa. Desativar cancela mensagens pendentes; histórico e recibos são mantidos. Reativar conserva a autonomia desligada.</p>
                {crmError && <p className="text-sm text-destructive" role="alert">{crmError}</p>}
              </section>
              <MiniCrmConfigCopy key={clientId} clientId={clientId} clientName={clientName} />
              <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
                <div className="space-y-1">
                  <Label htmlFor="mini-crm-show-untracked" className="text-sm font-medium">
                    Mostrar leads não rastreados no Mini CRM
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Libera para o login da loja. Sem isso, a loja só vê Meta Ads e outras origens.
                    A equipe do Planeje continua vendo os não rastreados.
                  </p>
                </div>
                <Switch
                  id="mini-crm-show-untracked"
                  checked={showUntracked}
                  disabled={savingMiniCrm}
                  onCheckedChange={handleSaveMiniCrmFlag}
                />
              </div>
            </TabsContent>
          ) : null}
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
