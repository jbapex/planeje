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

  const handleSession = useCallback(async (session, isInitialLoad = false) => {
    setSession(session);
    const currentUser = session?.user ?? null;
    setUser(currentUser);
    
    // Só seta loading como true na primeira carga
    if (isInitialLoad && !hasInitializedRef.current) {
      setLoading(true);
    }
    
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
  
  // Atualiza ref sempre que handleSession mudar
  handleSessionRef.current = handleSession;

  useEffect(() => {
    const getSession = async () => {
      if (!hasInitializedRef.current) {
        setLoading(true);
      }
      
      // Timeout de segurança: força o loading como false após 10 segundos
      const timeoutId = setTimeout(() => {
        if (!hasInitializedRef.current) {
          console.warn('Timeout na inicialização da autenticação - forçando loading como false');
          setLoading(false);
          hasInitializedRef.current = true;
        }
      }, 10000);
      
      try {
        const { data: { session } } = await supabase.auth.getSession();
        clearTimeout(timeoutId);
        
        if (handleSessionRef.current) {
          await handleSessionRef.current(session, true); // Primeira carga
        }
      } catch (error) {
        console.error('Erro ao obter sessão:', error);
        clearTimeout(timeoutId);
        setLoading(false);
        hasInitializedRef.current = true;
      }
    };

    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // Só atualiza se realmente mudou (login/logout), não ao mudar de aba
        // Ignora eventos como INITIAL_SESSION que podem disparar ao mudar de aba
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !hasInitializedRef.current)) {
          if (handleSessionRef.current) {
            try {
              await handleSessionRef.current(session, false);
            } catch (error) {
              console.error('Erro ao processar mudança de autenticação:', error);
            }
          }
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []); // Array vazio - só executa uma vez na montagem

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