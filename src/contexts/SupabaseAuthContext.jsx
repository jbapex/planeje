import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';

import { supabase } from '@/lib/customSupabaseClient';
import { toast } from '@/components/ui/use-toast';
import { clientHasPageAccess } from '@/lib/clientAllowedPages';
import { createAuthSessionLoader, initialAuthState } from '@/lib/authSessionLoader';

const AuthContext = createContext(undefined);

export const AuthProvider = ({ children }) => {
  const [authState, setAuthState] = useState(initialAuthState);
  const { user, session, profile, fieldPermissions, userFieldOverrides, loading, authError } = authState;
  const loader = useRef(null);
  useEffect(() => {
    const current = createAuthSessionLoader(supabase, setAuthState);
    loader.current = current;
    current.start();
    return () => { current.dispose(); if (loader.current === current) loader.current = null; };
  }, []);
  const refreshProfile = useCallback(() => loader.current?.refresh(), []);

  const canViewField = useCallback((fieldName) => {
    // Superadmin sempre pode ver todos os campos
    if (profile?.role === 'superadmin') {
      return true;
    }

    // Se não houver profile ou role, retorna true por padrão
    if (!profile?.role) {
      return true;
    }

    // Exceção gravada para esta pessoa vence o padrão do papel
    if (Object.prototype.hasOwnProperty.call(userFieldOverrides, fieldName)) {
      return userFieldOverrides[fieldName] === true;
    }

    // Verifica as permissões na tabela
    const rolePermissions = fieldPermissions[profile.role];
    if (rolePermissions && fieldName in rolePermissions) {
      return rolePermissions[fieldName] === true;
    }

    // Se não houver permissão definida, retorna true por padrão
    return true;
  }, [profile?.role, fieldPermissions, userFieldOverrides]);

  const hasPageAccess = useCallback((pageKey) => clientHasPageAccess(profile, pageKey), [profile]);

  const signUp = useCallback(async () => ({
    error: { message: 'Cadastro público fechado. Use o link de convite enviado por Josias.' },
  }), []);

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
  }, []);

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
  }, []);

  const getOpenAIKey = useCallback(async () => {
    const ls = () => localStorage.getItem('jb_apex_openai_key')?.trim() || null;
    try {
      const { data, error } = await supabase.rpc('get_encrypted_secret', {
        p_secret_name: 'OPENAI_API_KEY'
      });

      if (error) {
        console.error('Error fetching OpenAI key from vault:', error);
        return ls();
      }

      const fromDb = typeof data === 'string' ? data.trim() : '';
      if (fromDb) return fromDb;
      return ls();
    } catch (error) {
      console.error('Error in getOpenAIKey:', error);
      return ls();
    }
  }, []);

  const value = useMemo(() => ({
    user,
    session,
    profile,
    loading,
    authError,
    retryAuth: refreshProfile,
    signUp,
    signIn,
    signOut,
    refreshProfile,
    canViewField,
    hasPageAccess,
    getOpenAIKey,
  }), [user, session, profile, loading, authError, signUp, signIn, signOut, refreshProfile, canViewField, hasPageAccess, getOpenAIKey]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    // Em vez de lançar erro, retorna valores padrão para evitar quebra da aplicação
    // Isso pode acontecer durante re-renderizações ou em casos edge
    console.warn('useAuth called outside AuthProvider, returning default values');
    return {
      user: null,
      profile: null,
      loading: true,
      signOut: async () => {},
      signIn: async () => {},
      signUp: async () => {},
      hasPageAccess: () => false,
      getOpenAIKey: () => null,
    };
  }
  return context;
};