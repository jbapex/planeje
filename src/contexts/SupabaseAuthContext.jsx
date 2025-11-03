import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';

import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';

const AuthContext = createContext(undefined);

export const AuthProvider = ({ children }) => {
  const { toast } = useToast();

  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [fieldPermissions, setFieldPermissions] = useState({});
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching profile:', error);
        setProfile(null);
      } else {
        setProfile(data);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      setProfile(null);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      await fetchProfile(user.id);
    }
  }, [user?.id, fetchProfile]);

  const fetchFieldPermissions = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('client_field_permissions')
        .select('*');

      if (error) {
        console.error('Error fetching field permissions:', error);
        setFieldPermissions({});
      } else {
        // Organiza as permissões por role e field_name
        const permissionsMap = {};
        if (data) {
          data.forEach(perm => {
            if (!permissionsMap[perm.role]) {
              permissionsMap[perm.role] = {};
            }
            permissionsMap[perm.role][perm.field_name] = perm.can_view;
          });
        }
        setFieldPermissions(permissionsMap);
      }
    } catch (error) {
      console.error('Error fetching field permissions:', error);
      setFieldPermissions({});
    }
  }, []);

  const canViewField = useCallback((fieldName) => {
    // Superadmin sempre pode ver todos os campos
    if (profile?.role === 'superadmin') {
      return true;
    }

    // Se não houver profile ou role, retorna true por padrão
    if (!profile?.role) {
      return true;
    }

    // Verifica as permissões na tabela
    const rolePermissions = fieldPermissions[profile.role];
    if (rolePermissions && fieldName in rolePermissions) {
      return rolePermissions[fieldName] === true;
    }

    // Se não houver permissão definida, retorna true por padrão
    return true;
  }, [profile?.role, fieldPermissions]);

  const handleSession = useCallback(async (session) => {
    setSession(session);
    const currentUser = session?.user ?? null;
    setUser(currentUser);
    
    if (currentUser?.id) {
      await fetchProfile(currentUser.id);
      await fetchFieldPermissions();
    } else {
      setProfile(null);
      setFieldPermissions({});
    }
    
    setLoading(false);
  }, [fetchProfile, fetchFieldPermissions]);

  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      handleSession(session);
    };

    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        handleSession(session);
      }
    );

    return () => subscription.unsubscribe();
  }, [handleSession]);

  const signUp = useCallback(async (email, password, options) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options,
    });

    if (error) {
      toast({
        variant: "destructive",
        title: "Sign up Failed",
        description: error.message || "Something went wrong",
      });
    }

    return { error };
  }, [toast]);

  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      toast({
        variant: "destructive",
        title: "Sign in Failed",
        description: error.message || "Something went wrong",
      });
    }

    return { error };
  }, [toast]);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      toast({
        variant: "destructive",
        title: "Sign out Failed",
        description: error.message || "Something went wrong",
      });
    }

    return { error };
  }, [toast]);

  const getOpenAIKey = useCallback(async () => {
    try {
      // Tenta buscar do Supabase Vault via RPC
      const { data, error } = await supabase.rpc('get_encrypted_secret', {
        p_secret_name: 'OPENAI_API_KEY'
      });

      if (error) {
        console.error('Error fetching OpenAI key from vault:', error);
        // Fallback para localStorage (para compatibilidade durante migração)
        return localStorage.getItem('jb_apex_openai_key');
      }

      return data || null;
    } catch (error) {
      console.error('Error in getOpenAIKey:', error);
      // Fallback para localStorage (para compatibilidade durante migração)
      return localStorage.getItem('jb_apex_openai_key');
    }
  }, []);

  const value = useMemo(() => ({
    user,
    session,
    profile,
    loading,
    signUp,
    signIn,
    signOut,
    refreshProfile,
    canViewField,
    getOpenAIKey,
  }), [user, session, profile, loading, signUp, signIn, signOut, refreshProfile, canViewField, getOpenAIKey]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};