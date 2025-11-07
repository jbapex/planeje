import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const ModuleSettingsContext = createContext();

export const useModuleSettings = () => useContext(ModuleSettingsContext);

export const ModuleSettingsProvider = ({ children }) => {
  const [moduleSettings, setModuleSettings] = useState({});
  const [moduleAccess, setModuleAccess] = useState({});
  const [loading, setLoading] = useState(true);
  const { session, profile } = useAuth();
  const hasFetchedRef = useRef(false);
  const lastProfileIdRef = useRef(null);

  const fetchModuleSettings = useCallback(async () => {
    if (!profile?.id) {
        setLoading(false);
        setModuleSettings({});
        setModuleAccess({});
        return;
    }

    // Se já fez fetch para este profile, não seta loading como true
    if (hasFetchedRef.current && lastProfileIdRef.current === profile.id) {
      return; // Não recarrega se já tem dados
    }

    // Só seta loading como true na primeira vez
    if (!hasFetchedRef.current) {
      setLoading(true);
    }

    const { data: globalSettings, error: globalError } = await supabase
      .from('module_settings')
      .select('module_name, is_enabled');

    if (globalError) {
      console.error('Error fetching global module settings:', globalError);
    }
    
    const globalSettingsMap = globalSettings?.reduce((acc, setting) => {
        acc[setting.module_name] = setting.is_enabled;
        return acc;
    }, {}) || {};

    const { data: userPermissions, error: userError } = await supabase
      .from('user_module_permissions')
      .select('module_name, is_enabled')
      .eq('user_id', profile.id);

    if (userError) {
        console.error('Error fetching user module permissions:', userError);
    }
    
    const userPermissionsMap = userPermissions?.reduce((acc, perm) => {
        acc[perm.module_name] = perm.is_enabled;
        return acc;
    }, {}) || {};
    
    const combinedSettings = { ...globalSettingsMap, ...userPermissionsMap };
    setModuleSettings(combinedSettings);

    const { data: accessData, error: accessError } = await supabase
      .from('user_module_access')
      .select('module_name, access_level')
      .eq('user_id', profile.id);

    if (accessError) {
      console.error('Error fetching module access levels:', accessError);
    }

    const accessMap = accessData?.reduce((acc, access) => {
        acc[access.module_name] = access.access_level;
        return acc;
    }, {}) || {};
    setModuleAccess(accessMap);

    setLoading(false);
    hasFetchedRef.current = true;
    lastProfileIdRef.current = profile.id;
  }, [profile?.id]);

  useEffect(() => {
    if (session && profile?.id) {
      // Só faz fetch se mudou o profile ou é a primeira vez
      if (!hasFetchedRef.current || lastProfileIdRef.current !== profile.id) {
        fetchModuleSettings();
      }
    } else {
      // Se não tem session, só seta loading como false na primeira vez
      if (loading) {
        setLoading(false);
        setModuleSettings({});
        setModuleAccess({});
      }
      hasFetchedRef.current = false;
      lastProfileIdRef.current = null;
    }
  }, [session, profile?.id]); // Removido fetchModuleSettings das dependências

  const value = {
    moduleSettings,
    moduleAccess,
    loading,
    fetchModuleSettings,
  };

  return (
    <ModuleSettingsContext.Provider value={value}>
      {children}
    </ModuleSettingsContext.Provider>
  );
};