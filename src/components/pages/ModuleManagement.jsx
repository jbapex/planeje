import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, Copy, DollarSign } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import SuperAdminPageHeader from '@/components/superadmin/SuperAdminPageHeader';
import {
  MODULES_CONFIG,
  buildGlobalSettingsMap,
  effectiveModuleEnabled,
  modulesForUserRole,
} from '@/lib/moduleManagementConfig';
import {
  CLIENT_VALOR_FIELD,
  roleCanViewField,
  rolePermissionMap,
  userCanViewClientValor,
  usersWhoCanViewValor,
  valorRoleSummary,
} from '@/lib/clientFieldAccess';

function ModuleToggleRow({
  module,
  checked,
  onCheckedChange,
  disabled,
  accessLevel,
  onAccessLevelChange,
  showAccessLevel,
  accessOptions,
  hint,
}) {
  const Icon = module.icon;
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border rounded-lg gap-4 dark:border-gray-700">
      <div className="flex items-center gap-4 min-w-0">
        <Icon className={`w-8 h-8 shrink-0 ${checked ? 'text-purple-600' : 'text-gray-400'}`} />
        <div className="min-w-0">
          <Label className="text-base font-medium dark:text-white">{module.label}</Label>
          <p className="text-sm text-gray-500 dark:text-gray-400">{module.description}</p>
          {hint ? <p className="text-xs text-muted-foreground mt-0.5">{hint}</p> : null}
        </div>
      </div>
      <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
        {showAccessLevel && onAccessLevelChange && (
          <Select value={accessLevel} onValueChange={onAccessLevelChange} disabled={disabled || !checked}>
            <SelectTrigger className="w-[180px] dark:bg-gray-700 dark:text-white dark:border-gray-600">
              <SelectValue placeholder="Nível de acesso" />
            </SelectTrigger>
            <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
              {accessOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="dark:text-white dark:hover:bg-gray-600">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
      </div>
    </div>
  );
}

const ModuleManagement = () => {
  const { toast } = useToast();
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userPermissions, setUserPermissions] = useState({});
  const [userAccessLevels, setUserAccessLevels] = useState({});
  const [globalSettings, setGlobalSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);
  const [savingGlobal, setSavingGlobal] = useState({});
  const [valorRolePermissions, setValorRolePermissions] = useState({});
  const [valorOverrides, setValorOverrides] = useState({});

  const fetchAllData = useCallback(async () => {
    setLoading(true);

    const { data: usersData, error: usersError } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .neq('role', 'cliente')
      .order('full_name');
    if (usersError) {
      toast({ title: 'Erro ao buscar usuários', variant: 'destructive' });
    } else {
      setUsers(usersData || []);
    }

    const { data: globalData, error: globalError } = await supabase.from('module_settings').select('*');
    if (globalError) {
      toast({ title: 'Erro ao buscar configurações globais', variant: 'destructive' });
    } else {
      setGlobalSettings(buildGlobalSettingsMap(globalData));
    }

    const { data: fieldRows, error: fieldError } = await supabase.from('client_field_permissions').select('role, field_name, can_view');
    if (fieldError) {
      toast({ title: 'Erro ao buscar o padrão do valor', variant: 'destructive' });
    } else {
      setValorRolePermissions(rolePermissionMap(fieldRows));
    }

    const { data: overrideRows, error: overrideError } = await supabase
      .from('user_client_field_permissions')
      .select('user_id, field_name, can_view')
      .eq('field_name', CLIENT_VALOR_FIELD);
    if (overrideError) {
      toast({ title: 'Erro ao buscar quem vê o valor', variant: 'destructive' });
    } else {
      const map = {};
      (overrideRows || []).forEach((row) => {
        map[row.user_id] = row.can_view === true;
      });
      setValorOverrides(map);
    }

    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const fetchUserData = useCallback(
    async (userId) => {
      const { data: permsData, error: permsError } = await supabase
        .from('user_module_permissions')
        .select('*')
        .eq('user_id', userId);
      if (permsError) {
        toast({ title: 'Erro ao buscar permissões do usuário', variant: 'destructive' });
        return [{}, {}];
      }
      const permissionsMap = (permsData || []).reduce((acc, perm) => {
        acc[perm.module_name] = perm.is_enabled;
        return acc;
      }, {});

      const { data: accessData, error: accessError } = await supabase
        .from('user_module_access')
        .select('*')
        .eq('user_id', userId);
      if (accessError) {
        toast({ title: 'Erro ao buscar níveis de acesso do usuário', variant: 'destructive' });
        return [permissionsMap, {}];
      }
      const accessMap = (accessData || []).reduce((acc, access) => {
        acc[access.module_name] = access.access_level;
        return acc;
      }, {});

      return [permissionsMap, accessMap];
    },
    [toast]
  );

  const handleUserSelect = async (user) => {
    setSelectedUser(user);
    setLoading(true);
    const [permissions, accessLevels] = await fetchUserData(user.id);
    setUserPermissions(permissions);
    setUserAccessLevels(accessLevels);
    setLoading(false);
  };

  const handleGlobalToggle = async (moduleName, isEnabled) => {
    const previous = { ...globalSettings };
    setGlobalSettings((prev) => ({ ...prev, [moduleName]: isEnabled }));
    setSavingGlobal((prev) => ({ ...prev, [moduleName]: true }));

    const { error } = await supabase
      .from('module_settings')
      .upsert({ module_name: moduleName, is_enabled: isEnabled }, { onConflict: 'module_name' });

    setSavingGlobal((prev) => ({ ...prev, [moduleName]: false }));

    if (error) {
      setGlobalSettings(previous);
      toast({ title: 'Erro ao atualizar padrão global', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Padrão global atualizado', description: `${moduleName}: ${isEnabled ? 'ativo' : 'inativo'}` });
    }
  };

  const seesValor = (user) =>
    userCanViewClientValor({
      role: user?.role,
      roleCanView: roleCanViewField(valorRolePermissions, user?.role, CLIENT_VALOR_FIELD),
      override: valorOverrides[user?.id],
    });

  const handleValorToggle = async (canView) => {
    if (!selectedUser || selectedUser.role === 'superadmin') return;
    const previous = valorOverrides[selectedUser.id];
    setValorOverrides((prev) => ({ ...prev, [selectedUser.id]: canView }));

    const { error } = await supabase.from('user_client_field_permissions').upsert(
      { user_id: selectedUser.id, field_name: CLIENT_VALOR_FIELD, can_view: canView },
      { onConflict: 'user_id,field_name' }
    );

    if (error) {
      setValorOverrides((prev) => {
        const next = { ...prev };
        if (previous === undefined) delete next[selectedUser.id];
        else next[selectedUser.id] = previous;
        return next;
      });
      toast({ title: 'Erro ao gravar o valor', description: error.message, variant: 'destructive' });
    } else {
      toast({
        title: canView ? `${selectedUser.full_name} vê o valor` : `${selectedUser.full_name} não vê o valor`,
      });
    }
  };

  const handleValorReset = async () => {
    if (!selectedUser || valorOverrides[selectedUser.id] === undefined) return;
    const previous = valorOverrides[selectedUser.id];
    setValorOverrides((prev) => {
      const next = { ...prev };
      delete next[selectedUser.id];
      return next;
    });

    const { error } = await supabase
      .from('user_client_field_permissions')
      .delete()
      .eq('user_id', selectedUser.id)
      .eq('field_name', CLIENT_VALOR_FIELD);

    if (error) {
      setValorOverrides((prev) => ({ ...prev, [selectedUser.id]: previous }));
      toast({ title: 'Erro ao voltar ao padrão', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `${selectedUser.full_name} voltou ao padrão do papel` });
    }
  };

  const handleToggle = async (moduleName, isEnabled) => {
    if (!selectedUser) return;

    const currentPermissions = { ...userPermissions };
    setUserPermissions((prev) => ({ ...prev, [moduleName]: isEnabled }));

    const { error } = await supabase
      .from('user_module_permissions')
      .upsert(
        { user_id: selectedUser.id, module_name: moduleName, is_enabled: isEnabled },
        { onConflict: 'user_id,module_name' }
      );

    if (error) {
      toast({ title: 'Erro ao atualizar permissão', description: error.message, variant: 'destructive' });
      setUserPermissions(currentPermissions);
    } else {
      toast({ title: `Módulo atualizado para ${selectedUser.full_name}` });
    }
  };

  const handleAccessLevelChange = async (moduleName, accessLevel) => {
    if (!selectedUser) return;

    const currentAccessLevels = { ...userAccessLevels };
    setUserAccessLevels((prev) => ({ ...prev, [moduleName]: accessLevel }));

    const { error } = await supabase.from('user_module_access').upsert(
      { user_id: selectedUser.id, module_name: moduleName, access_level: accessLevel },
      { onConflict: 'user_id,module_name' }
    );

    if (error) {
      toast({ title: 'Erro ao atualizar nível de acesso', description: error.message, variant: 'destructive' });
      setUserAccessLevels(currentAccessLevels);
    }
  };

  const handleCopyFromUser = async (sourceUser) => {
    if (!selectedUser || !sourceUser?.id || sourceUser.id === selectedUser.id) return;

    setCopying(true);
    try {
      const [sourcePerms, sourceAccess] = await fetchUserData(sourceUser.id);

      const { error: delPermError } = await supabase
        .from('user_module_permissions')
        .delete()
        .eq('user_id', selectedUser.id);
      if (delPermError) throw delPermError;

      const { error: delAccessError } = await supabase
        .from('user_module_access')
        .delete()
        .eq('user_id', selectedUser.id);
      if (delAccessError) throw delAccessError;

      const permRows = Object.entries(sourcePerms).map(([module_name, is_enabled]) => ({
        user_id: selectedUser.id,
        module_name,
        is_enabled,
      }));
      if (permRows.length) {
        const { error } = await supabase.from('user_module_permissions').insert(permRows);
        if (error) throw error;
      }

      const accessRows = Object.entries(sourceAccess).map(([module_name, access_level]) => ({
        user_id: selectedUser.id,
        module_name,
        access_level,
      }));
      if (accessRows.length) {
        const { error } = await supabase.from('user_module_access').insert(accessRows);
        if (error) throw error;
      }

      setUserPermissions(sourcePerms);
      setUserAccessLevels(sourceAccess);
      toast({
        title: 'Permissões copiadas',
        description: `Configuração de ${sourceUser.full_name} aplicada em ${selectedUser.full_name}.`,
      });
    } catch (err) {
      toast({
        title: 'Erro ao copiar permissões',
        description: err?.message || 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setCopying(false);
    }
  };

  const getAccessOptions = (module, role) => {
    if (module.name === 'reports') {
      return [
        { value: 'all', label: 'Ver todos' },
        { value: 'self', label: 'Ver apenas próprio' },
      ];
    }
    if (role === 'colaborador') {
      return [
        { value: 'all', label: 'Ver tudo' },
        { value: 'responsible', label: 'Apenas responsável' },
      ];
    }
    return [];
  };

  return (
    <div className="planeje-super-admin-page space-y-6">
      <SuperAdminPageHeader
        sectionLabel="Equipe & acesso"
        title="Gerenciamento de módulos"
        description="Defina o padrão da equipe, o Atendimento de cada loja e as exceções por usuário."
      />

      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="dark:text-white">Padrão global da equipe</CardTitle>
          <CardDescription className="dark:text-gray-400">
            Vale para todos os usuários internos que não tiverem configuração individual. Desligar aqui oculta o
            módulo na sidebar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : (
            <div className="planeje-super-admin-module-summary">
              {MODULES_CONFIG.map((module) => {
                const on = globalSettings[module.name] !== false;
                return (
                  <button
                    key={module.name}
                    type="button"
                    className={`planeje-super-admin-module-chip text-left ${on ? 'is-on' : 'is-off'}`}
                    onClick={() => handleGlobalToggle(module.name, !on)}
                    disabled={savingGlobal[module.name]}
                  >
                    {module.label}
                    {on ? ' · ativo' : ' · inativo'}
                  </button>
                );
              })}
            </div>
          )}
          <div className="mt-4 space-y-3">
            {MODULES_CONFIG.map((module) => (
              <ModuleToggleRow
                key={`global-${module.name}`}
                module={module}
                checked={globalSettings[module.name] !== false}
                onCheckedChange={(checked) => handleGlobalToggle(module.name, checked)}
                disabled={!!savingGlobal[module.name]}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,22rem)_1fr] gap-6 items-start">
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="dark:text-white">Personalizar por usuário</CardTitle>
            <CardDescription className="dark:text-gray-400">
              Escolha um membro da equipe para aplicar exceções ao padrão global.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border p-3 space-y-2 dark:border-gray-700">
              <p className="text-sm font-medium dark:text-white">Valor mensal em Clientes</p>
              <p className="text-xs text-muted-foreground">{valorRoleSummary(valorRolePermissions)}</p>
              <p className="text-xs text-muted-foreground">
                {usersWhoCanViewValor(users, valorRolePermissions, valorOverrides).length
                  ? `Veem o valor: ${usersWhoCanViewValor(users, valorRolePermissions, valorOverrides)
                      .map((user) => user.full_name)
                      .join(', ')}`
                  : 'Ninguém da equipe vê o valor mensal.'}
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between dark:bg-gray-700 dark:text-white dark:border-gray-600 dark:hover:bg-gray-600"
                >
                  <span className="truncate">
                    {selectedUser ? `${selectedUser.full_name} (${selectedUser.role})` : 'Selecione...'}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] dark:bg-gray-700 dark:border-gray-600 max-h-64 overflow-y-auto">
                {users.map((user) => (
                  <DropdownMenuItem
                    key={user.id}
                    onClick={() => handleUserSelect(user)}
                    className="dark:text-white dark:hover:bg-gray-600"
                  >
                    {user.full_name} ({user.role}){seesValor(user) ? ' · vê valor' : ''}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {selectedUser && (
              <div className="space-y-2 pt-2 border-t dark:border-gray-700">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Copiar de outro usuário
                </p>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="secondary" className="w-full justify-between" disabled={copying}>
                      <span className="flex items-center gap-2 truncate">
                        <Copy className="h-4 w-4 shrink-0" />
                        {copying ? 'Copiando...' : 'Escolher origem...'}
                      </span>
                      <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] max-h-64 overflow-y-auto">
                    {users
                      .filter((u) => u.id !== selectedUser.id)
                      .map((user) => (
                        <DropdownMenuItem key={user.id} onClick={() => handleCopyFromUser(user)}>
                          {user.full_name} ({user.role})
                        </DropdownMenuItem>
                      ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <p className="text-xs text-muted-foreground">
                  Substitui todas as exceções de {selectedUser.full_name} pelas do usuário escolhido.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="min-w-0">
          {!selectedUser ? (
            <Card className="dark:bg-gray-800 dark:border-gray-700 border-dashed">
              <CardContent className="py-12 text-center text-muted-foreground">
                <p className="text-sm max-w-md mx-auto">
                  Selecione um usuário para definir exceções individuais. Sem exceção, vale o padrão global acima.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="dark:text-white">Exceções para {selectedUser.full_name}</CardTitle>
                <CardDescription className="dark:text-gray-400">
                  Switches aqui gravam override só para este usuário.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border rounded-lg gap-4 dark:border-gray-700">
                  <div className="flex items-center gap-4 min-w-0">
                    <DollarSign className={`w-8 h-8 shrink-0 ${seesValor(selectedUser) ? 'text-purple-600' : 'text-gray-400'}`} />
                    <div className="min-w-0">
                      <Label className="text-base font-medium dark:text-white">Ver valor mensal</Label>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Na lista, no quadro e na ficha de clientes.
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {selectedUser.role === 'superadmin'
                          ? 'Super admin sempre vê o valor.'
                          : valorOverrides[selectedUser.id] === undefined
                            ? `Padrão do papel: ${roleCanViewField(valorRolePermissions, selectedUser.role) ? 'vê' : 'oculto'}`
                            : 'Exceção individual ativa'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                    {selectedUser.role !== 'superadmin' && valorOverrides[selectedUser.id] !== undefined && (
                      <Button type="button" variant="ghost" size="sm" onClick={handleValorReset}>
                        Padrão do papel
                      </Button>
                    )}
                    <Switch
                      checked={seesValor(selectedUser)}
                      onCheckedChange={handleValorToggle}
                      disabled={selectedUser.role === 'superadmin'}
                      aria-label="Ver valor mensal"
                    />
                  </div>
                </div>
                {loading ? (
                  <p className="dark:text-gray-300">Carregando...</p>
                ) : (
                  modulesForUserRole(selectedUser.role).map((module) => {
                    const isUserSettingDefined = userPermissions[module.name] !== undefined;
                    const effectiveSetting = effectiveModuleEnabled(
                      globalSettings,
                      userPermissions,
                      module.name
                    );
                    const accessLevel =
                      userAccessLevels[module.name] ||
                      module.defaultAccessLevel ||
                      (module.name === 'reports' ? 'all' : 'responsible');
                    const accessOptions = getAccessOptions(module, selectedUser.role);
                    const showAccess =
                      accessOptions.length > 0 &&
                      (module.name === 'reports'
                        ? ['admin', 'colaborador'].includes(selectedUser.role)
                        : selectedUser.role === 'colaborador');

                    return (
                      <motion.div
                        key={module.name}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <ModuleToggleRow
                          module={module}
                          checked={effectiveSetting}
                          onCheckedChange={(checked) => handleToggle(module.name, checked)}
                          accessLevel={accessLevel}
                          onAccessLevelChange={(value) => handleAccessLevelChange(module.name, value)}
                          showAccessLevel={showAccess}
                          accessOptions={accessOptions}
                          hint={
                            isUserSettingDefined
                              ? 'Override individual ativo'
                              : `Padrão global: ${globalSettings[module.name] !== false ? 'ativo' : 'inativo'}`
                          }
                        />
                      </motion.div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default ModuleManagement;
