import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Users, FolderKanban, ListTodo, MessageSquare as MessageSquareWarning, ChevronDown, Rocket, Globe, BarChart2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const MODULES_CONFIG = [
  { name: 'clients', label: 'Clientes', icon: Users, description: 'Gerencie clientes e prospects.' },
  { name: 'projects', label: 'Projetos/Campanhas', icon: FolderKanban, description: 'Organize e acompanhe projetos e campanhas.' },
  { name: 'tasks', label: 'Tarefas', icon: ListTodo, description: 'Crie e delegue tarefas, acompanhe o progresso.' },
  { name: 'requests', label: 'Solicitações', icon: MessageSquareWarning, description: 'Receba e gerencie solicitações de clientes.' },
  { name: 'social_media', label: 'Redes Sociais', icon: Globe, description: 'Gerencie o conteúdo de redes sociais.' },
  { name: 'paid_traffic', label: 'Tráfego Pago', icon: Rocket, description: 'Gerencie campanhas de tráfego pago.' },
  { name: 'reports', label: 'Relatórios', icon: BarChart2, description: 'Analise o desempenho da equipe.' },
];

const ModuleManagement = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userPermissions, setUserPermissions] = useState({});
  const [userAccessLevels, setUserAccessLevels] = useState({});
  const [globalSettings, setGlobalSettings] = useState({});
  const [loading, setLoading] = useState(true);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    
    // Não incluir usuários de cliente no gerenciamento de módulos (apenas usuários internos)
    const { data: usersData, error: usersError } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .neq('role', 'cliente');
    if (usersError) {
      toast({ title: "Erro ao buscar usuários", variant: "destructive" });
    } else {
      setUsers(usersData);
    }
    
    const { data: globalData, error: globalError } = await supabase.from('module_settings').select('*');
     if (globalError) {
      toast({ title: "Erro ao buscar configurações globais", variant: "destructive" });
    } else {
      const settingsMap = globalData.reduce((acc, setting) => {
        acc[setting.module_name] = setting.is_enabled;
        return acc;
      }, {});
      setGlobalSettings(settingsMap);
    }

    setLoading(false);
  }, [toast]);
  
  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const fetchUserData = useCallback(async (userId) => {
    const { data: permsData, error: permsError } = await supabase.from('user_module_permissions').select('*').eq('user_id', userId);
    if (permsError) {
      toast({ title: "Erro ao buscar permissões do usuário", variant: "destructive" });
      return [{}, {}];
    }
    const permissionsMap = permsData.reduce((acc, perm) => {
      acc[perm.module_name] = perm.is_enabled;
      return acc;
    }, {});

    const { data: accessData, error: accessError } = await supabase.from('user_module_access').select('*').eq('user_id', userId);
    if (accessError) {
        toast({ title: "Erro ao buscar níveis de acesso do usuário", variant: "destructive" });
        return [permissionsMap, {}];
    }
    const accessMap = accessData.reduce((acc, access) => {
      acc[access.module_name] = access.access_level;
      return acc;
    }, {});
    
    return [permissionsMap, accessMap];
  }, [toast]);

  const handleUserSelect = async (user) => {
    setSelectedUser(user);
    setLoading(true);
    const [permissions, accessLevels] = await fetchUserData(user.id);
    setUserPermissions(permissions);
    setUserAccessLevels(accessLevels);
    setLoading(false);
  };

  const handleToggle = async (moduleName, isEnabled) => {
    if (!selectedUser) return;
    
    const currentPermissions = { ...userPermissions };
    setUserPermissions(prev => ({...prev, [moduleName]: isEnabled}));

    const { error } = await supabase
      .from('user_module_permissions')
      .upsert({ user_id: selectedUser.id, module_name: moduleName, is_enabled: isEnabled }, { onConflict: 'user_id,module_name' });

    if (error) {
      toast({ title: 'Erro ao atualizar permissão', description: error.message, variant: 'destructive' });
      setUserPermissions(currentPermissions);
    } else {
      toast({ title: `Visibilidade do módulo atualizada para ${selectedUser.full_name}!` });
    }
  };

  const handleAccessLevelChange = async (moduleName, accessLevel) => {
    if (!selectedUser) return;

    const currentAccessLevels = { ...userAccessLevels };
    setUserAccessLevels(prev => ({ ...prev, [moduleName]: accessLevel }));

    const { error } = await supabase
        .from('user_module_access')
        .upsert({ user_id: selectedUser.id, module_name: moduleName, access_level: accessLevel }, { onConflict: 'user_id,module_name' });

    if (error) {
        toast({ title: 'Erro ao atualizar nível de acesso', description: error.message, variant: 'destructive' });
        setUserAccessLevels(currentAccessLevels);
    } else {
        toast({ title: `Nível de acesso atualizado para ${selectedUser.full_name}!` });
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/super-admin')}>
          <ArrowLeft className="text-gray-700 dark:text-gray-300" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Gerenciamento de Módulos</h1>
          <p className="text-gray-500 dark:text-gray-400">Ative ou desative funcionalidades e defina o nível de acesso por usuário.</p>
        </div>
      </div>

      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
           <CardTitle className="dark:text-white">Selecione um Usuário</CardTitle>
           <CardDescription className="dark:text-gray-400">Escolha um usuário para gerenciar suas permissões de módulo.</CardDescription>
        </CardHeader>
        <CardContent>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full justify-between dark:bg-gray-700 dark:text-white dark:border-gray-600 dark:hover:bg-gray-600">
                <span>{selectedUser ? `${selectedUser.full_name} (${selectedUser.role})` : "Selecione..."}</span>
                <ChevronDown className="h-4 w-4 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] dark:bg-gray-700 dark:border-gray-600">
              {users.map(user => (
                <DropdownMenuItem key={user.id} onClick={() => handleUserSelect(user)} className="dark:text-white dark:hover:bg-gray-600">
                  {user.full_name} ({user.role})
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </CardContent>
      </Card>
      
      {selectedUser && (
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="dark:text-white">Módulos para {selectedUser.full_name}</CardTitle>
            <CardDescription className="dark:text-gray-400">
              Controle o acesso aos recursos. Se nenhuma opção for marcada, o padrão global será aplicado.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {loading ? <p className="dark:text-gray-300">Carregando...</p> : MODULES_CONFIG.map((module) => {
              if (module.name === 'requests' && selectedUser.role === 'colaborador') return null;

              const Icon = module.icon;
              const isUserSettingDefined = userPermissions[module.name] !== undefined;
              const effectiveSetting = isUserSettingDefined ? userPermissions[module.name] : globalSettings[module.name];
              const accessLevel = userAccessLevels[module.name] || (module.name === 'reports' ? 'all' : 'responsible');

              return (
                <motion.div
                  key={module.name}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border rounded-lg gap-4 dark:border-gray-700"
                >
                  <div className="flex items-center gap-4">
                    <Icon className={`w-8 h-8 ${effectiveSetting ? 'text-purple-600' : 'text-gray-400'}`} />
                    <div>
                      <Label htmlFor={`${module.name}-${selectedUser.id}`} className="text-lg font-medium dark:text-white">{module.label}</Label>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{module.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 self-end sm:self-center">
                    {module.name === 'reports' && ['admin', 'colaborador'].includes(selectedUser.role) && (
                      <Select value={accessLevel} onValueChange={(value) => handleAccessLevelChange(module.name, value)} disabled={!effectiveSetting}>
                          <SelectTrigger className="w-[180px] dark:bg-gray-700 dark:text-white dark:border-gray-600">
                              <SelectValue placeholder="Nível de Acesso" />
                          </SelectTrigger>
                          <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                              <SelectItem value="all" className="dark:text-white dark:hover:bg-gray-600">Ver Todos</SelectItem>
                              <SelectItem value="self" className="dark:text-white dark:hover:bg-gray-600">Ver Apenas Próprio</SelectItem>
                          </SelectContent>
                      </Select>
                    )}
                    {selectedUser.role === 'colaborador' && module.name !== 'reports' && (
                      <Select value={accessLevel} onValueChange={(value) => handleAccessLevelChange(module.name, value)} disabled={!effectiveSetting}>
                          <SelectTrigger className="w-[180px] dark:bg-gray-700 dark:text-white dark:border-gray-600">
                              <SelectValue placeholder="Nível de Acesso" />
                          </SelectTrigger>
                          <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                              <SelectItem value="all" className="dark:text-white dark:hover:bg-gray-600">Ver Tudo</SelectItem>
                              <SelectItem value="responsible" className="dark:text-white dark:hover:bg-gray-600">Apenas Responsável</SelectItem>
                          </SelectContent>
                      </Select>
                    )}
                    <Switch
                      id={`${module.name}-${selectedUser.id}`}
                      checked={effectiveSetting || false}
                      onCheckedChange={(checked) => handleToggle(module.name, checked)}
                    />
                  </div>
                </motion.div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ModuleManagement;