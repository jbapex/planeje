import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';

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
  const hasInitializedRef = useRef(false);
  const handleSessionRef = useRef(null);

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

  const hasPageAccess = useCallback((pageKey) => {
    // Se não for cliente, permite acesso a todas as páginas
    if (profile?.role !== 'cliente' || !profile?.cliente_id) {
      return true;
    }

    // Se allowed_pages é null ou undefined, permite acesso a todas as páginas
    const allowedPages = profile?.allowed_pages;
    if (allowedPages === null || allowedPages === undefined) {
      return true;
    }

    // Se for array, verifica se a página está no array
    if (Array.isArray(allowedPages)) {
      return allowedPages.includes(pageKey);
    }

    // Por padrão, permite acesso
    return true;
  }, [profile]);

  const handleSession = useCallback(async (session, isInitialLoad = false) => {
    setSession(session);
    const currentUser = session?.user ?? null;
    setUser(currentUser);

    try {
      if (currentUser?.id) {
        await fetchProfile(currentUser.id);
        await fetchFieldPermissions();
      } else {
        setProfile(null);
        setFieldPermissions({});
      }
    } catch (error) {
      console.error('Erro ao processar sessão:', error);
      // Mesmo com erro, continua o fluxo para não travar
      setProfile(null);
      setFieldPermissions({});
    } finally {
      // Só seta loading como false na primeira carga
      if (isInitialLoad) {
        setLoading(false);
        hasInitializedRef.current = true;
      }
    }
  }, [fetchProfile, fetchFieldPermissions]);

  useEffect(() => {
    let isMounted = true;
    let subscription = null;
    
    const initializeAuth = async () => {
      // Garante que loading está true no início
      if (!hasInitializedRef.current) {
        setLoading(true);
      }
      
      // Timeout de segurança: força o loading como false após 5 segundos
      const timeoutId = setTimeout(() => {
        if (isMounted && !hasInitializedRef.current) {
          console.warn('Timeout na inicialização da autenticação - forçando loading como false');
          setLoading(false);
          hasInitializedRef.current = true;
        }
      }, 5000);
      
      try {
        // Primeiro, obtém a sessão atual
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('Erro ao obter sessão:', sessionError);
          if (isMounted) {
            setLoading(false);
            hasInitializedRef.current = true;
          }
          clearTimeout(timeoutId);
          return;
        }
        
        // Processa a sessão inicial
        if (isMounted) {
          await handleSession(session, true); // Primeira carga
        }
        
        clearTimeout(timeoutId);
        
        // Só configura o listener de mudanças de autenticação DEPOIS da inicialização
        // Isso evita race conditions onde o listener dispara antes da inicialização completar
        if (isMounted) {
          const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange(
            async (event, newSession) => {
              // Ignora eventos durante a inicialização
              if (!hasInitializedRef.current) {
                return;
              }
              
              // Só atualiza se realmente mudou (login/logout)
              // Ignora INITIAL_SESSION e outros eventos que podem causar loops
              if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
                if (isMounted) {
                  try {
                    await handleSession(newSession, false);
                  } catch (error) {
                    console.error('Erro ao processar mudança de autenticação:', error);
                  }
                }
              }
            }
          );
          subscription = authSubscription;
        }
      } catch (error) {
        console.error('Erro ao inicializar autenticação:', error);
        if (isMounted) {
          setLoading(false);
          hasInitializedRef.current = true;
        }
        clearTimeout(timeoutId);
      }
    };

    initializeAuth();

    return () => {
      isMounted = false;
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, [handleSession]); // Inclui handleSession nas dependências

  const signUp = useCallback(async (email, password, options) => {
    // Garantir que o email está limpo e válido
    const cleanEmail = email?.trim().toLowerCase() || '';
    
    if (!cleanEmail || !cleanEmail.includes('@')) {
      const error = { message: 'Email inválido' };
      toast({
        variant: "destructive",
        title: "Sign up Failed",
        description: "Por favor, insira um email válido.",
      });
      return { error };
    }

    try {
      // Debug: verificar o email antes de enviar
      console.log('Email antes do signUp:', {
        original: email,
        cleaned: cleanEmail,
        length: cleanEmail.length,
        charCodes: cleanEmail.split('').map(c => c.charCodeAt(0)),
        isValidFormat: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)
      });
      
      // Estrutura correta conforme documentação do Supabase:
      // signUp({ email, password, options: { data, emailRedirectTo, ... } })
      const signUpPayload = {
        email: cleanEmail,
        password: password?.trim() || '',
        options: {
          emailRedirectTo: `${window.location.origin}/#/login`,
        }
      };
      
      // Adiciona data dentro de options (conforme documentação)
      if (options?.data) {
        signUpPayload.options.data = options.data;
      }
      
      // Mescla outras opções se existirem
      if (options && typeof options === 'object') {
        Object.keys(options).forEach(key => {
          if (key !== 'data' && options[key]) {
            signUpPayload.options[key] = options[key];
          }
        });
      }
      
      console.log('Payload do signUp (estrutura final):', {
        email: signUpPayload.email,
        hasPassword: !!signUpPayload.password,
        hasOptions: !!signUpPayload.options,
        optionsContent: signUpPayload.options
      });
      
      // Chama o signUp com a estrutura correta
      const { data, error } = await supabase.auth.signUp(signUpPayload);

      if (error) {
        console.error('Supabase signUp error completo:', {
          error,
          code: error.code,
          message: error.message,
          status: error.status
        });
        
        let errorMessage = error.message || "Algo deu errado ao criar sua conta.";
        
        // Mensagens mais específicas para erros comuns
        if (error.code === 'email_address_invalid' || error.message?.includes('email_address_invalid')) {
          errorMessage = `O email "${cleanEmail}" foi rejeitado pelo Supabase. Isso pode ocorrer se:
          - O domínio está bloqueado nas configurações do Supabase
          - O formato do email não é aceito
          - É necessário configurar SMTP personalizado
          
          Verifique as configurações de autenticação no painel do Supabase.`;
        }
        
        toast({
          variant: "destructive",
          title: "Erro ao criar conta",
          description: errorMessage,
          duration: 8000,
        });
      } else if (data?.user) {
        // Se o cadastro foi bem-sucedido, o Supabase envia automaticamente o email de confirmação
        console.log('Usuário criado com sucesso. Email de confirmação será enviado.', data);
      }

      return { data, error };
    } catch (err) {
      console.error('Erro ao fazer signUp:', err);
      const error = { message: err.message || 'Erro inesperado ao criar conta' };
      toast({
        variant: "destructive",
        title: "Erro inesperado",
        description: error.message,
      });
      return { error };
    }
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
    hasPageAccess,
    getOpenAIKey,
  }), [user, session, profile, loading, signUp, signIn, signOut, refreshProfile, canViewField, getOpenAIKey]);

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