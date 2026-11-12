import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { User, KeyRound, Save, Trash2, Users, Edit, PlusCircle, Send, Link as LinkIcon, Copy, Loader2, Upload, MessageSquare, Sparkles, Bell, Settings as SettingsIcon, Puzzle, Share2, HardDrive, Megaphone, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import Help from '@/components/tasks/automations/AutomationHelp';
import { TEAM_PROFILE_STATUSES, teamProfileStatusLabel, saveTeamProfileEdit } from '@/lib/teamProfileEditor';
import { supabase } from '@/lib/customSupabaseClient';
import { rewritePublicStorageUrl } from '@/lib/publicStorageUrl';
import { changeOwnPassword } from '@/lib/changeOwnPassword';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { fetchOpenRouterModels } from '@/lib/openrouterModels';
import SettingsAlertsPanel from '@/components/settings/SettingsAlertsPanel';
import McpUserTokenCard from '@/components/settings/McpUserTokenCard';
import { deleteTeamUser } from '@/lib/adminDeleteTeamUser';
import { cn } from '@/lib/utils';
import '@/components/settings/Settings.css';
import WorkspacePageHeader from '@/components/layout/WorkspacePageHeader';

const ROLE_LABELS = {
  superadmin: 'Super Admin',
  admin: 'Admin',
  colaborador: 'Colaborador',
};

const OPENAI_FALLBACK_MODELS = [
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'openai/gpt-4.1-mini',
  'openai/gpt-3.5-turbo',
];

const Settings = () => {
  const [apiKey, setApiKey] = useState('');
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [isValidatingKey, setIsValidatingKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState(null); // 'saved' | 'valid' | 'invalid' | null
  const [savedKeyPreview, setSavedKeyPreview] = useState(''); // Preview da chave salva
  const [users, setUsers] = useState([]);
  const [inviteLinks, setInviteLinks] = useState([]);
  const [isEditDialogOpen, setEditDialogOpen] = useState(false);
  const [isLinkDialogOpen, setLinkDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [linkRole, setLinkRole] = useState('colaborador');
  const [linkEmail, setLinkEmail] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editStatus, setEditStatus] = useState(undefined);
  const [isSavingTeamProfile, setIsSavingTeamProfile] = useState(false);
  const [teamProfileError, setTeamProfileError] = useState('');
  const savingTeamProfileRef = useRef(false);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [projectsAiProvider, setProjectsAiProvider] = useState('openai');
  const [projectsOpenRouterModel, setProjectsOpenRouterModel] = useState('openai/gpt-4o-mini');
  const [openrouterCustomModel, setOpenrouterCustomModel] = useState('');
  const [projectsAllowedModelsText, setProjectsAllowedModelsText] = useState('openai/gpt-4o-mini');
  const [projectsDefaultModel, setProjectsDefaultModel] = useState('openai/gpt-4o-mini');
  const [openrouterKeyInput, setOpenrouterKeyInput] = useState('');
  const [savedOpenRouterPreview, setSavedOpenRouterPreview] = useState('');
  const [openRouterKeyStatus, setOpenRouterKeyStatus] = useState(null);
  const [isSavingOpenRouterKey, setIsSavingOpenRouterKey] = useState(false);
  const [isSavingProjectsAi, setIsSavingProjectsAi] = useState(false);
  const [apiModelsLoading, setApiModelsLoading] = useState(false);
  const [apiModelsDetected, setApiModelsDetected] = useState([]);
  const [apiModelSelected, setApiModelSelected] = useState('');
  const [userToDelete, setUserToDelete] = useState(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const [isPasswordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  
  const { toast } = useToast();
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const parsedAllowedModels = String(projectsAllowedModelsText || '')
    .split(/[\n,;]/)
    .map((x) => x.trim())
    .filter(Boolean);
  const openrouterModelOptions = Array.from(
    new Set(
      parsedAllowedModels
        .filter((m) => m.includes('/'))
        .concat(projectsOpenRouterModel ? [projectsOpenRouterModel] : [])
    )
  );
  const openrouterSelectValue = openrouterModelOptions.includes(projectsOpenRouterModel)
    ? projectsOpenRouterModel
    : '__custom__';
  const providerTokenPreview = projectsAiProvider === 'openrouter' ? savedOpenRouterPreview : savedKeyPreview;
  const visibleProviderModels = projectsAiProvider === 'openrouter'
    ? parsedAllowedModels
    : parsedAllowedModels.filter((m) => m.startsWith('openai/'));
  const effectiveProviderModels =
    visibleProviderModels.length > 0 ? visibleProviderModels : projectsAiProvider === 'openai' ? OPENAI_FALLBACK_MODELS : [];
  const removeAllowedModel = useCallback((modelId) => {
    const clean = String(modelId || '').trim();
    if (!clean) return;
    const next = parsedAllowedModels.filter((m) => m !== clean);
    const safeNext = next.length > 0 ? next : ['openai/gpt-4o-mini'];
    setProjectsAllowedModelsText(safeNext.join('\n'));
    if (!safeNext.includes(projectsDefaultModel)) {
      setProjectsDefaultModel(safeNext[0]);
    }
    if (projectsOpenRouterModel === clean) {
      setProjectsOpenRouterModel(safeNext.find((m) => m.includes('/')) || 'openai/gpt-4o-mini');
    }
  }, [parsedAllowedModels, projectsDefaultModel, projectsOpenRouterModel]);

  const keepOnlyProviderCompatibleModels = useCallback(() => {
    const filtered =
      projectsAiProvider === 'openai'
        ? parsedAllowedModels.filter((m) => m.startsWith('openai/'))
        : parsedAllowedModels.filter((m) => m.includes('/'));
    const safeNext = filtered.length > 0 ? filtered : projectsAiProvider === 'openai' ? [...OPENAI_FALLBACK_MODELS] : ['openai/gpt-4o-mini'];
    setProjectsAllowedModelsText(Array.from(new Set(safeNext)).join('\n'));
    if (!safeNext.includes(projectsDefaultModel)) {
      setProjectsDefaultModel(safeNext[0]);
    }
  }, [parsedAllowedModels, projectsAiProvider, projectsDefaultModel]);

  const mergeModelIntoAllowed = useCallback((modelId) => {
    const clean = String(modelId || '').trim();
    if (!clean) return;
    const merged = Array.from(new Set([...parsedAllowedModels, clean]));
    setProjectsAllowedModelsText(merged.join('\n'));
    if (!projectsDefaultModel) setProjectsDefaultModel(clean);
  }, [parsedAllowedModels, projectsDefaultModel]);

  const handleLoadApiModels = useCallback(async () => {
    setApiModelsLoading(true);
    setApiModelsDetected([]);
    setApiModelSelected('');
    try {
      if (projectsAiProvider === 'openrouter') {
        const models = await fetchOpenRouterModels();
        const ids = models.map((m) => m.id).filter(Boolean);
        setApiModelsDetected(ids);
        if (ids.length > 0) setApiModelSelected(ids[0]);
        return;
      }

      let keyToUse = apiKey?.trim();
      if (!keyToUse) {
        const { data: savedKey } = await supabase.rpc('get_encrypted_secret', { p_secret_name: 'OPENAI_API_KEY' });
        keyToUse = String(savedKey || '').trim();
      }
      if (!keyToUse) {
        toast({
          title: 'Chave OpenAI ausente',
          description: 'Salve a chave da OpenAI acima para buscar os modelos da API.',
          variant: 'destructive',
        });
        return;
      }

      const resp = await fetch('https://api.openai.com/v1/models', {
        headers: {
          Authorization: `Bearer ${keyToUse}`,
          'Content-Type': 'application/json',
        },
      });
      const payload = await resp.json();
      if (!resp.ok) {
        throw new Error(payload?.error?.message || `Falha ao listar modelos (${resp.status})`);
      }
      const rawIds = Array.isArray(payload?.data) ? payload.data.map((x) => x?.id).filter(Boolean) : [];
      const ids = rawIds
        .filter((id) => /(^gpt-|^o[1-4]|^chatgpt|^text-embedding)/i.test(id))
        .map((id) => (id.startsWith('openai/') ? id : `openai/${id}`))
        .sort((a, b) => a.localeCompare(b));
      setApiModelsDetected(ids);
      if (ids.length > 0) setApiModelSelected(ids[0]);
    } catch (err) {
      toast({
        title: 'Erro ao carregar modelos da API',
        description: err.message || 'Não foi possível buscar modelos.',
        variant: 'destructive',
      });
    } finally {
      setApiModelsLoading(false);
    }
  }, [projectsAiProvider, apiKey, toast]);

  const fetchUsers = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .in('role', ['superadmin', 'admin', 'colaborador'])
      .order('full_name');
    if (error) {
      toast({ title: "Erro ao buscar usuários", description: error.message, variant: "destructive" });
    } else {
      setUsers(data || []);
    }
  }, [toast]);
  
  const fetchInviteLinks = useCallback(async () => {
    const { data, error } = await supabase.from('invites').select('id,token,role,recipient_email,expires_at').is('consumed_at', null).not('recipient_email', 'is', null).gt('expires_at', new Date().toISOString());
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

  const loadProjectsAiSettings = useCallback(async () => {
    if (profile?.role !== 'superadmin') return;
    const { data: p } = await supabase.rpc('get_encrypted_secret', { p_secret_name: 'PROJECTS_AI_PROVIDER' });
    setProjectsAiProvider(p === 'openrouter' ? 'openrouter' : 'openai');
    const { data: m } = await supabase.rpc('get_encrypted_secret', { p_secret_name: 'PROJECTS_OPENROUTER_MODEL' });
      const fallbackModel = m?.trim() || 'openai/gpt-4o-mini';
    setProjectsOpenRouterModel(fallbackModel);
      setOpenrouterCustomModel('');
    const { data: ork } = await supabase.rpc('get_encrypted_secret', { p_secret_name: 'OPENROUTER_API_KEY' });
    const openRouterSaved = String(ork || '').trim();
    if (openRouterSaved.startsWith('sk-') && openRouterSaved.length > 12) {
      setSavedOpenRouterPreview(`${openRouterSaved.substring(0, 4)}...${openRouterSaved.substring(openRouterSaved.length - 4)}`);
      setOpenRouterKeyStatus('saved');
    } else {
      setSavedOpenRouterPreview('');
      setOpenRouterKeyStatus(openRouterSaved ? 'invalid' : null);
    }
    const { data: cfg } = await supabase
      .from('public_config')
      .select('value')
      .eq('key', 'assistant_project_model_config')
      .maybeSingle();
    let models = [fallbackModel];
    let defaultModel = fallbackModel;
    if (cfg?.value) {
      try {
        const parsed = JSON.parse(cfg.value);
        if (Array.isArray(parsed?.models) && parsed.models.length > 0) {
          models = parsed.models.map((x) => String(x || '').trim()).filter(Boolean);
          defaultModel = parsed.defaultModel && models.includes(parsed.defaultModel) ? parsed.defaultModel : models[0];
        }
      } catch (err) {
        console.warn('assistant_project_model_config inválido:', err);
      }
    }
    setProjectsAllowedModelsText(models.join('\n'));
    setProjectsDefaultModel(defaultModel);
  }, [profile?.role]);

  // Carrega a chave salva quando o perfil é carregado
  useEffect(() => {
    if (profile?.role === 'superadmin') {
      checkSavedKey();
      loadProjectsAiSettings();
    }
  }, [profile?.role, checkSavedKey, loadProjectsAiSettings]);

  const handleSaveProjectsAiSettings = async () => {
    if (profile?.role !== 'superadmin') {
      toast({ title: 'Acesso negado', variant: 'destructive' });
      return;
    }
    setIsSavingProjectsAi(true);
    try {
      const allowedModels = String(projectsAllowedModelsText || '')
        .split(/[\n,;]/)
        .map((x) => x.trim())
        .filter(Boolean);
      const normalizedModels = allowedModels.length > 0 ? Array.from(new Set(allowedModels)) : [(projectsOpenRouterModel || 'openai/gpt-4o-mini').trim()];
      const normalizedDefault = normalizedModels.includes(projectsDefaultModel)
        ? projectsDefaultModel
        : normalizedModels[0];

      const { error: e1 } = await supabase.rpc('set_encrypted_secret', {
        p_secret_name: 'PROJECTS_AI_PROVIDER',
        p_secret_value: projectsAiProvider,
      });
      if (e1) throw e1;
      const { error: e2 } = await supabase.rpc('set_encrypted_secret', {
        p_secret_name: 'PROJECTS_OPENROUTER_MODEL',
        p_secret_value: (projectsOpenRouterModel || 'openai/gpt-4o-mini').trim(),
      });
      if (e2) throw e2;
      const { error: eCfg } = await supabase
        .from('public_config')
        .upsert(
          {
            key: 'assistant_project_model_config',
            value: JSON.stringify({
              models: normalizedModels,
              defaultModel: normalizedDefault,
            }),
          },
          { onConflict: 'key' }
        );
      if (eCfg) throw eCfg;
      if (openrouterKeyInput.trim()) {
        const nextKey = openrouterKeyInput.trim();
        if (!nextKey.startsWith('sk-')) {
          toast({ title: 'Chave do OpenRouter inválida', description: 'Cole a chave que começa com sk-or-.', variant: 'destructive' });
          setIsSavingProjectsAi(false);
          return;
        }
        const { error: e3 } = await supabase.rpc('set_encrypted_secret', {
          p_secret_name: 'OPENROUTER_API_KEY',
          p_secret_value: nextKey,
        });
        if (e3) throw e3;
        setOpenrouterKeyInput('');
      }
      toast({
        title: 'IA em campanhas atualizada',
        description: `${normalizedModels.length} modelo(s) na lista. O Assistente de Tráfego mostra essa mesma lista ao abrir.`,
      });
      await loadProjectsAiSettings();
    } catch (err) {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    } finally {
      setIsSavingProjectsAi(false);
    }
  };

  const handleSaveOpenRouterKey = async () => {
    if (profile?.role !== 'superadmin') {
      toast({ title: 'Acesso negado', variant: 'destructive' });
      return;
    }
    const nextKey = openrouterKeyInput.trim();
    if (!nextKey.startsWith('sk-')) {
      toast({ title: 'Chave inválida', description: 'Cole a chave do OpenRouter que começa com sk-or-.', variant: 'destructive' });
      return;
    }
    setIsSavingOpenRouterKey(true);
    try {
      const { error } = await supabase.rpc('set_encrypted_secret', {
        p_secret_name: 'OPENROUTER_API_KEY',
        p_secret_value: nextKey,
      });
      if (error) throw error;
      setOpenrouterKeyInput('');
      toast({ title: 'Chave do OpenRouter salva', description: 'O Assistente de Tráfego passa a usar esta chave.' });
      await loadProjectsAiSettings();
    } catch (err) {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    } finally {
      setIsSavingOpenRouterKey(false);
    }
  };

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

  const resetPasswordForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
  };

  const handleChangePassword = async (event) => {
    event.preventDefault();
    if (isChangingPassword) return;
    setPasswordError('');
    setIsChangingPassword(true);
    try {
      await changeOwnPassword({
        supabase,
        email: user?.email,
        currentPassword,
        newPassword,
        confirmPassword,
      });
      resetPasswordForm();
      setPasswordDialogOpen(false);
      toast({ title: 'Senha alterada com sucesso', description: 'Use a nova senha no próximo acesso.' });
    } catch (error) {
      setPasswordError(error?.message || 'Não foi possível alterar a senha. Tente novamente.');
    } finally {
      setIsChangingPassword(false);
    }
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
      const publicUrl = rewritePublicStorageUrl(data.publicUrl);
      
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

  const handleGenerateInviteLink = async () => {
    const recipientEmail = linkEmail.trim().toLowerCase();
    if (isGeneratingLink || profile?.role !== 'superadmin') return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      toast({ title: 'Informe o e-mail da pessoa convidada', variant: 'destructive' });
      return;
    }
    setIsGeneratingLink(true);
    const token = crypto.randomUUID();
    const { data, error } = await supabase
      .from('invites')
      .insert({ token, role: linkRole, created_by: user.id, recipient_email: recipientEmail })
      .select();

    if (error) {
      toast({ title: 'Erro ao gerar link', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Link de convite gerado!', description: 'O link foi adicionado à lista.' });
      setInviteLinks(prev => [...prev, ...data]);
      setLinkDialogOpen(false);
      setLinkEmail('');
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

  const handleOpenEditDialog = (targetUser) => {
    if (profile?.role !== 'superadmin' || savingTeamProfileRef.current || targetUser.id === user?.id) return;
    setSelectedUser(targetUser);
    setEditRole(targetUser.role);
    setEditStatus(targetUser.status);
    setTeamProfileError('');
    setEditDialogOpen(true);
  };

  const handleEditDialogOpenChange = (open) => {
    if (savingTeamProfileRef.current) return;
    setEditDialogOpen(open);
    if (!open) {
      setSelectedUser(null);
      setTeamProfileError('');
    }
  };

  const handleUpdateTeamProfile = async () => {
    if (savingTeamProfileRef.current || !selectedUser || profile?.role !== 'superadmin' || selectedUser.id === user?.id) return;
    savingTeamProfileRef.current = true;
    setIsSavingTeamProfile(true);
    setTeamProfileError('');
    try {
      const result = await saveTeamProfileEdit(selectedUser, { role: editRole, status: editStatus }, (id, patch) =>
        supabase.from('profiles').update(patch).eq('id', id).select('id,role,status').single());
      if (result.changed) {
        setUsers(current => current.map(person => person.id === result.profile.id ? { ...person, ...result.profile } : person));
        toast({ title: 'Cadastro atualizado!', description: `As alterações de ${selectedUser.full_name || 'usuário'} foram salvas.` });
      } else {
        toast({ title: 'Nenhuma alteração', description: 'O cadastro foi mantido como estava.' });
      }
      setEditDialogOpen(false);
      setSelectedUser(null);
    } catch (error) {
      const message = error?.message || 'Não foi possível confirmar o salvamento. Confira o cadastro antes de tentar novamente.';
      setTeamProfileError(message);
      toast({ title: 'Não foi possível atualizar o cadastro', description: message, variant: 'destructive' });
    } finally {
      savingTeamProfileRef.current = false;
      setIsSavingTeamProfile(false);
    }
  };

  const handleDeleteUser = (targetUser) => {
    if (!targetUser?.id) return;
    setUserToDelete(targetUser);
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete?.id) return;
    setIsDeletingUser(true);
    try {
      await deleteTeamUser(userToDelete.id);
      toast({
        title: 'Usuário excluído',
        description: `${userToDelete.full_name || 'Usuário'} foi removido do sistema.`,
      });
      setUserToDelete(null);
      fetchUsers();
    } catch (err) {
      toast({
        title: 'Erro ao excluir usuário',
        description: err?.message || 'Não foi possível remover o usuário.',
        variant: 'destructive',
      });
    } finally {
      setIsDeletingUser(false);
    }
  };

  const canDeleteUser = (targetUser) => {
    if (!targetUser?.id || targetUser.id === user?.id) return false;
    if (targetUser.role === 'superadmin') return false;
    return ['admin', 'colaborador'].includes(targetUser.role);
  };

  const isSuperAdmin = profile?.role === 'superadmin';
  // Equipe interna por role — não exigir cliente_id null (alguns superadmins têm cliente vinculado)
  const isTeamUser = ['superadmin', 'admin', 'colaborador'].includes(profile?.role);
  const activeTab = searchParams.get('tab') || 'conta';

  const settingsTabs = useMemo(() => {
    const tabs = [
      { id: 'conta', label: 'Conta', icon: User },
      { id: 'alertas', label: 'Alertas', icon: Bell },
      { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
    ];
    if (isSuperAdmin) {
      tabs.push({ id: 'integracoes', label: 'Integrações', icon: KeyRound });
      tabs.push({ id: 'equipe', label: 'Equipe', icon: Users });
    }
    return tabs;
  }, [isSuperAdmin]);

  const setSettingsTab = useCallback(
    (tabId) => {
      if (!tabId || tabId === 'conta') {
        setSearchParams({}, { replace: true });
      } else {
        setSearchParams({ tab: tabId }, { replace: true });
      }
    },
    [setSearchParams]
  );

  useEffect(() => {
    if (!isSuperAdmin && (activeTab === 'integracoes' || activeTab === 'equipe')) {
      setSearchParams({}, { replace: true });
    }
  }, [activeTab, isSuperAdmin, setSearchParams]);

  const teamStats = useMemo(() => ({
    total: users.length,
    admins: users.filter((u) => u.role === 'admin').length,
    colaboradores: users.filter((u) => u.role === 'colaborador').length,
    superadmins: users.filter((u) => u.role === 'superadmin').length,
  }), [users]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="planeje-settings w-full"
    >
      <WorkspacePageHeader
        title="Configurações"
        label="Sistema"
        help={`Gerencie perfil, alertas no aplicativo, WhatsApp${isSuperAdmin ? ', integrações e equipe' : ''}. Use as abas para abrir somente a configuração necessária.`}
        actions={<nav className="flex flex-wrap items-center gap-0.5 rounded-xl bg-slate-100 p-0.5 dark:bg-white/[0.05]" aria-label="Seções de configurações">
            {settingsTabs.map((tab) => {
              const TabIcon = tab.icon;
              return (
                <Button
                  key={tab.id}
                  type="button"
                  variant={activeTab === tab.id ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-8 rounded-lg px-2.5 text-xs"
                  onClick={() => setSettingsTab(tab.id)}
                >
                  <TabIcon className="mr-1 h-3.5 w-3.5" />
                  {tab.label}
                </Button>
              );
            })}
          </nav>}
      />

      <div className="planeje-settings-panel">
        {activeTab === 'conta' && (
          <div className="planeje-settings-grid-2 planeje-settings-grid-2--conta">
            <article className="planeje-settings-card">
              <div className="planeje-settings-card-header">
                <div className="planeje-settings-card-icon planeje-settings-card-icon--user">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="planeje-settings-card-title">Meu perfil</h2>
                  <p className="planeje-settings-card-desc">Atualize foto e nome exibidos no Planeje.</p>
                </div>
              </div>
              <div className="planeje-settings-card-body space-y-4">
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
                        <Label htmlFor="full_name">Nome completo</Label>
                        <Input id="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                    </div>
              </div>
              <div className="planeje-settings-card-footer">
                    <Button onClick={handleUpdateProfile} disabled={uploading} className="w-full">
                        {uploading ? <Loader2 className="animate-spin mr-2" /> : <Save className="mr-2 h-4 w-4" />}
                        {uploading ? 'Salvando...' : 'Salvar perfil'}
                    </Button>
              </div>
            </article>

            <article className="planeje-settings-card">
              <div className="planeje-settings-card-header">
                <div className="planeje-settings-card-icon planeje-settings-card-icon--bell">
                  <Bell className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="planeje-settings-card-title">Resumo da conta</h2>
                  <p className="planeje-settings-card-desc">Dados de acesso e atalhos rápidos.</p>
                </div>
              </div>
              <div className="planeje-settings-card-body">
                <div className="planeje-settings-info-row">
                  <span className="planeje-settings-info-label">E-mail</span>
                  <span className="planeje-settings-info-value">{user?.email || '—'}</span>
                </div>
                <div className="planeje-settings-info-row">
                  <span className="planeje-settings-info-label">Papel</span>
                  <span className="planeje-settings-info-value">
                    <span className="planeje-settings-role-badge">
                      {ROLE_LABELS[profile?.role] || profile?.role || '—'}
                    </span>
                  </span>
                </div>
              </div>
              <div className="planeje-settings-card-footer space-y-2">
                <Button type="button" className="w-full" onClick={() => setPasswordDialogOpen(true)}>
                  <KeyRound className="mr-2 h-4 w-4" />
                  Alterar senha
                </Button>
                <Button type="button" variant="outline" className="w-full" onClick={() => setSettingsTab('alertas')}>
                  <Bell className="mr-2 h-4 w-4" />
                  Configurar alertas no app
                </Button>
              </div>
            </article>

            <Dialog open={isPasswordDialogOpen} onOpenChange={(open) => {
              if (isChangingPassword) return;
              setPasswordDialogOpen(open);
              if (!open) resetPasswordForm();
            }}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Alterar senha</DialogTitle>
                  <DialogDescription>
                    Confirme sua senha atual e escolha a nova senha para esta conta.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="settings-current-password">Senha atual</Label>
                    <Input id="settings-current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required disabled={isChangingPassword} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="settings-new-password">Nova senha</Label>
                    <Input id="settings-new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} required disabled={isChangingPassword} />
                    <p className="text-xs text-muted-foreground">Use pelo menos 8 caracteres.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="settings-confirm-password">Confirmar nova senha</Label>
                    <Input id="settings-confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required disabled={isChangingPassword} />
                  </div>
                  {passwordError && <p role="alert" className="text-sm text-destructive">{passwordError}</p>}
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => { setPasswordDialogOpen(false); resetPasswordForm(); }} disabled={isChangingPassword}>Cancelar</Button>
                    <Button type="submit" disabled={isChangingPassword}>
                      {isChangingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Salvar nova senha
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            <article className="planeje-settings-card">
              <div className="planeje-settings-card-header">
                <div className="planeje-settings-card-icon planeje-settings-card-icon--key">
                  <SettingsIcon className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="planeje-settings-card-title">Atalhos</h2>
                  <p className="planeje-settings-card-desc">Acesso rápido às demais seções.</p>
                </div>
              </div>
              <div className="planeje-settings-card-body">
                <div className="planeje-settings-quick-links">
                  <button type="button" className="planeje-settings-quick-link" onClick={() => setSettingsTab('alertas')}>
                    <span>Alertas no app</span>
                    <Bell className="h-4 w-4 shrink-0 opacity-60" />
                  </button>
                  <button type="button" className="planeje-settings-quick-link" onClick={() => setSettingsTab('whatsapp')}>
                    <span>Notificações WhatsApp</span>
                    <MessageSquare className="h-4 w-4 shrink-0 opacity-60" />
                  </button>
                  {isSuperAdmin && (
                    <>
                      <button type="button" className="planeje-settings-quick-link" onClick={() => setSettingsTab('integracoes')}>
                        <span>Integrações (IA)</span>
                        <KeyRound className="h-4 w-4 shrink-0 opacity-60" />
                      </button>
                      <button type="button" className="planeje-settings-quick-link" onClick={() => navigate('/settings/meta')}>
                        <span>Meta da agência</span>
                        <Share2 className="h-4 w-4 shrink-0 opacity-60" />
                      </button>
                      <button type="button" className="planeje-settings-quick-link" onClick={() => navigate('/settings/google-drive')}>
                        <span>Google Drive da agência</span>
                        <HardDrive className="h-4 w-4 shrink-0 opacity-60" />
                      </button>
                      <button type="button" className="planeje-settings-quick-link" onClick={() => navigate('/settings/google-ads')}>
                        <span>Google Ads da agência</span>
                        <Megaphone className="h-4 w-4 shrink-0 opacity-60" />
                      </button>
                      <button type="button" className="planeje-settings-quick-link" onClick={() => navigate('/settings/google-dados')}>
                        <span>Google dados da agência</span>
                        <BarChart3 className="h-4 w-4 shrink-0 opacity-60" />
                      </button>
                      <button type="button" className="planeje-settings-quick-link" onClick={() => setSettingsTab('equipe')}>
                        <span>Gerenciar equipe</span>
                        <Users className="h-4 w-4 shrink-0 opacity-60" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </article>

            {isTeamUser && <McpUserTokenCard enabled={isTeamUser} />}
          </div>
        )}

        {activeTab === 'alertas' && (
          <div className="planeje-settings-grid-wide">
          <article className="planeje-settings-card">
            <div className="planeje-settings-card-header">
              <div className="planeje-settings-card-icon planeje-settings-card-icon--bell">
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <h2 className="planeje-settings-card-title">Alertas no app</h2>
                <p className="planeje-settings-card-desc">
                  Sons de Conversas e Tarefas, além de notificações do navegador com a aba em segundo plano.
                </p>
              </div>
            </div>
            <div className="planeje-settings-card-body">
              <SettingsAlertsPanel showWhatsAppLink={false} />
            </div>
            <div className="planeje-settings-card-footer">
              <Button type="button" variant="outline" className="w-full" onClick={() => setSettingsTab('whatsapp')}>
                <MessageSquare className="mr-2 h-4 w-4" />
                Ir para notificações WhatsApp
              </Button>
            </div>
          </article>
          <article className="planeje-settings-card planeje-settings-card--aside">
            <div className="planeje-settings-card-header">
              <div className="planeje-settings-card-icon planeje-settings-card-icon--bell">
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <h2 className="planeje-settings-card-title">Como funcionam</h2>
                <p className="planeje-settings-card-desc">Resumo dos alertas no Planeje.</p>
              </div>
            </div>
            <div className="planeje-settings-card-body">
              <ul className="planeje-settings-tip-list">
                <li>Conversas: som e popup quando chega mensagem (com outra aba aberta).</li>
                <li>Tarefas: aviso quando alguém move card no Kanban e você é responsável.</li>
                <li>Navegador: permissão libera balão do sistema no Windows/macOS.</li>
              </ul>
            </div>
          </article>
          </div>
        )}

        {activeTab === 'whatsapp' && (
          <div className="planeje-settings-grid-wide">
          <article className="planeje-settings-card">
            <div className="planeje-settings-card-header">
              <div className="planeje-settings-card-icon planeje-settings-card-icon--whatsapp">
                <MessageSquare className="h-5 w-5" />
              </div>
              <div>
                <h2 className="planeje-settings-card-title">Notificações WhatsApp</h2>
                <p className="planeje-settings-card-desc">
                  Alertas automáticos quando tarefas mudam de status, novas atribuições e outros eventos.
                </p>
              </div>
            </div>
            <div className="planeje-settings-card-body space-y-3">
              <p className="text-sm text-muted-foreground leading-relaxed">
                Escolha quais eventos disparam mensagem no seu WhatsApp e teste o envio antes de ativar para a equipe.
              </p>
            </div>
            <div className="planeje-settings-card-footer">
              <Button onClick={() => navigate('/settings/whatsapp')} className="w-full">
                <MessageSquare className="mr-2 h-4 w-4" />
                Abrir configurações WhatsApp
              </Button>
            </div>
          </article>
          <article className="planeje-settings-card">
            <div className="planeje-settings-card-header">
              <div className="planeje-settings-card-icon planeje-settings-card-icon--whatsapp">
                <Puzzle className="h-5 w-5" />
              </div>
              <div>
                <h2 className="planeje-settings-card-title">Extensão no Chrome</h2>
                <p className="planeje-settings-card-desc">
                  Ícone arrastável em qualquer página do Chrome: demandas do dia e criação rápida de tarefa ou solicitação.
                </p>
              </div>
            </div>
            <div className="planeje-settings-card-footer">
              <Button onClick={() => navigate('/extensao-whatsapp')} className="w-full" variant="outline">
                <Puzzle className="mr-2 h-4 w-4" />
                Baixar extensão
              </Button>
            </div>
          </article>
          <article className="planeje-settings-card planeje-settings-card--aside">
            <div className="planeje-settings-card-header">
              <div className="planeje-settings-card-icon planeje-settings-card-icon--whatsapp">
                <MessageSquare className="h-5 w-5" />
              </div>
              <div>
                <h2 className="planeje-settings-card-title">O que configurar</h2>
                <p className="planeje-settings-card-desc">Na tela completa de WhatsApp.</p>
              </div>
            </div>
            <div className="planeje-settings-card-body">
              <ul className="planeje-settings-tip-list">
                <li>Mudança de status de tarefas no Kanban.</li>
                <li>Novas tarefas atribuídas a você.</li>
                <li>Teste de envio antes de ativar para a equipe.</li>
              </ul>
            </div>
          </article>
          </div>
        )}

        {activeTab === 'integracoes' && isSuperAdmin && (
          <div className="planeje-settings-integracoes-grid">
              <Card className="dark:bg-gray-800 dark:border-gray-700">
                <CardHeader>
                  <div className="flex items-center gap-4">
                    <Share2 className="h-8 w-8 text-blue-600" />
                    <div>
                      <CardTitle className="text-xl dark:text-white">Meta da agência</CardTitle>
                      <CardDescription className="dark:text-gray-400">
                        Token do System User para Tráfego, páginas e, depois, Instagram/Facebook.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Cole e teste o token nesta tela. Não use o token do cliente em Rastreamento.
                  </p>
                  <Button onClick={() => navigate('/settings/meta')}>
                    <Share2 className="mr-2 h-4 w-4" />
                    Configurar e validar
                  </Button>
                </CardContent>
              </Card>
              <Card className="dark:bg-gray-800 dark:border-gray-700">
                <CardHeader>
                  <div className="flex items-center gap-4">
                    <HardDrive className="h-8 w-8 text-sky-600" />
                    <div>
                      <CardTitle className="text-xl dark:text-white">Google Drive da agência</CardTitle>
                      <CardDescription className="dark:text-gray-400">
                        Client ID e Secret para anexar arquivos do Drive nas tarefas.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Cole os IDs do aplicativo Google aqui. Depois cada empresa conecta a própria conta em Canais.
                  </p>
                  <Button onClick={() => navigate('/settings/google-drive')}>
                    <HardDrive className="mr-2 h-4 w-4" />
                    Configurar OAuth
                  </Button>
                </CardContent>
              </Card>
              <Card className="dark:bg-gray-800 dark:border-gray-700">
                <CardHeader>
                  <div className="flex items-center gap-4">
                    <Megaphone className="h-8 w-8 text-emerald-600" />
                    <div>
                      <CardTitle className="text-xl dark:text-white">Google Ads da agência</CardTitle>
                      <CardDescription className="dark:text-gray-400">
                        Developer Token, OAuth e MCC para listar contas e devolver conversões.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Configure uma vez na agência. Depois vincule a conta na ficha do cliente e mapeie ações em Rastreamento.
                  </p>
                  <Button onClick={() => navigate('/settings/google-ads')}>
                    <Megaphone className="mr-2 h-4 w-4" />
                    Configurar e testar
                  </Button>
                </CardContent>
              </Card>
              <Card className="dark:bg-gray-800 dark:border-gray-700">
                <CardHeader>
                  <div className="flex items-center gap-4">
                    <BarChart3 className="h-8 w-8 text-amber-600" />
                    <div>
                      <CardTitle className="text-xl dark:text-white">Google dados da agência</CardTitle>
                      <CardDescription className="dark:text-gray-400">
                        Analytics, Meu Negócio e Tag Manager com um login da agência.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Autorize uma vez. Depois vincule propriedade, ficha e contêiner na ficha do cliente. Não mistura com a Meta.
                  </p>
                  <Button onClick={() => navigate('/settings/google-dados')}>
                    <BarChart3 className="mr-2 h-4 w-4" />
                    Autorizar e testar
                  </Button>
                </CardContent>
              </Card>
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
                      placeholder={savedKeyPreview ? "Cole uma nova chave para substituir a atual" : "Cole aqui a chave completa (ex.: sk-...)"} 
                      autoComplete="off"
                      className="dark:bg-gray-700 dark:text-white dark:border-gray-600" 
                    />
                    <p className="text-xs text-muted-foreground dark:text-gray-500">
                      {savedKeyPreview
                        ? 'Para trocar a chave, cole a nova no campo acima e clique em Atualizar Chave.'
                        : 'Cole ou digite a chave completa da OpenAI. O placeholder cinza não é valor: o campo começa vazio até você colar.'}
                    </p>
                    
                    {/* Botões de ação */}
                    <div className="flex items-center gap-2">
                      <Button 
                        onClick={handleSaveKey} 
                        disabled={isSavingKey}
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

              <Card className="dark:bg-gray-800 dark:border-gray-700">
                <CardHeader>
                  <div className="flex items-center gap-4">
                    <Sparkles className="h-8 w-8 text-amber-500" />
                    <div>
                      <CardTitle className="text-xl dark:text-white">Chave do OpenRouter</CardTitle>
                      <CardDescription className="dark:text-gray-400">
                        É esta chave que libera Claude e os outros modelos no Assistente de Tráfego.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {openRouterKeyStatus === 'saved' && savedOpenRouterPreview ? (
                    <div className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700 rounded-md">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Chave salva:</span>
                      <code className="text-sm font-mono text-gray-800 dark:text-gray-200">{savedOpenRouterPreview}</code>
                      <span className="ml-auto text-xs text-green-600 dark:text-green-400">Válida no formato</span>
                    </div>
                  ) : null}
                  {openRouterKeyStatus === 'invalid' ? (
                    <p className="text-xs text-red-600 dark:text-red-400">
                      O que está salvo não é uma chave. O Assistente fica no GPT-4o mini até você colar uma chave que comece com sk-or-.
                    </p>
                  ) : null}
                  <Input
                    id="or-key-main"
                    type="password"
                    autoComplete="off"
                    value={openrouterKeyInput}
                    onChange={(e) => setOpenrouterKeyInput(e.target.value)}
                    placeholder="sk-or-..."
                    className="dark:bg-gray-700 dark:text-white dark:border-gray-600"
                  />
                  <p className="text-xs text-muted-foreground dark:text-gray-500">
                    Cole aqui. Não precisa colocar no servidor nem publicar função de novo.
                  </p>
                  <Button type="button" className="w-full" onClick={handleSaveOpenRouterKey} disabled={isSavingOpenRouterKey}>
                    {isSavingOpenRouterKey ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {openRouterKeyStatus === 'saved' ? 'Atualizar chave do OpenRouter' : 'Salvar chave do OpenRouter'}
                  </Button>
                </CardContent>
              </Card>

              <Card className="dark:bg-gray-800 dark:border-gray-700 planeje-settings-integracoes-span-2">
                <CardHeader>
                  <div className="flex items-center gap-4">
                    <Sparkles className="h-8 w-8 text-amber-500" />
                    <div>
                      <CardTitle className="text-xl dark:text-white">IA em campanhas e tarefas</CardTitle>
                      <CardDescription className="dark:text-gray-400">
                        Plano de campanha, funil e copy em tarefas chamam o servidor (openai-chat ou openrouter-chat). A chave OpenAI acima é lida no servidor; use OpenRouter se preferir.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="dark:text-white">Provedor</Label>
                    <Select value={projectsAiProvider} onValueChange={setProjectsAiProvider}>
                      <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                        <SelectItem value="openai" className="dark:text-white dark:hover:bg-gray-600">OpenAI (chave salva acima)</SelectItem>
                        <SelectItem value="openrouter" className="dark:text-white dark:hover:bg-gray-600">OpenRouter</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="rounded-md border border-gray-200 bg-gray-50 p-2 text-xs dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-200">
                      <p>
                        <span className="font-semibold">Token salvo:</span>{' '}
                        {providerTokenPreview ? <code className="font-mono">{providerTokenPreview}</code> : 'nenhum token encontrado para este provedor'}
                      </p>
                      <p className="mt-1 text-gray-600 dark:text-gray-400">
                        Provedor ativo para campanhas: <span className="font-semibold">{projectsAiProvider === 'openrouter' ? 'OpenRouter' : 'OpenAI'}</span>
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="projects-models" className="dark:text-white">Modelos disponíveis no Projeto</Label>
                    <textarea
                      id="projects-models"
                      value={projectsAllowedModelsText}
                      onChange={(e) => setProjectsAllowedModelsText(e.target.value)}
                      rows={4}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-gray-700 dark:text-white dark:border-gray-600"
                      placeholder={'openai/gpt-4o-mini\nanthropic/claude-3.5-sonnet'}
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Um por linha (ou separados por vírgula). Esses modelos aparecem para escolha do usuário no Plano de Campanha.
                    </p>
                    <div className="rounded-md border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-900/40 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleLoadApiModels}
                          disabled={apiModelsLoading}
                        >
                          {apiModelsLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Buscar modelos da API
                        </Button>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          {projectsAiProvider === 'openrouter'
                            ? 'Busca do catálogo OpenRouter'
                            : 'Busca dos modelos liberados na sua chave OpenAI'}
                        </p>
                      </div>
                      {apiModelsDetected.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2">
                          <Select value={apiModelSelected} onValueChange={setApiModelSelected}>
                            <SelectTrigger className="min-w-[280px] dark:bg-gray-700 dark:text-white dark:border-gray-600">
                              <SelectValue placeholder="Selecione um modelo retornado pela API" />
                            </SelectTrigger>
                            <SelectContent className="dark:bg-gray-700 dark:border-gray-600 max-h-80">
                              {apiModelsDetected.map((modelId) => (
                                <SelectItem key={modelId} value={modelId} className="dark:text-white dark:hover:bg-gray-600">
                                  {modelId}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => mergeModelIntoAllowed(apiModelSelected)}
                            disabled={!apiModelSelected}
                          >
                            Adicionar à lista
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="dark:text-white">Modelo padrão para o Projeto</Label>
                    <Select value={projectsDefaultModel} onValueChange={setProjectsDefaultModel}>
                      <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600">
                        <SelectValue placeholder="Selecione o modelo padrão" />
                      </SelectTrigger>
                      <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                        {String(projectsAllowedModelsText || '')
                          .split(/[\n,;]/)
                          .map((x) => x.trim())
                          .filter(Boolean)
                          .map((modelId) => (
                            <SelectItem key={modelId} value={modelId} className="dark:text-white dark:hover:bg-gray-600">
                              {modelId}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <div className="rounded-md border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-900/40">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                          Modelos disponíveis para o provedor selecionado
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[11px]"
                          onClick={keepOnlyProviderCompatibleModels}
                        >
                          Manter só compatíveis
                        </Button>
                      </div>
                      {effectiveProviderModels.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {effectiveProviderModels.map((modelId) => (
                            <button
                              type="button"
                              key={modelId}
                              onClick={() => removeAllowedModel(modelId)}
                              title="Remover modelo da lista permitida"
                              className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-2 py-0.5 text-[11px] transition-colors hover:border-red-300 hover:bg-red-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-red-700 dark:hover:bg-red-950/40"
                            >
                              {modelId}
                              <span className="font-bold text-red-600 dark:text-red-400">×</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          Nenhum modelo compatível com o provedor atual. Ajuste a lista acima e salve.
                        </p>
                      )}
                    </div>
                  </div>
                  {projectsAiProvider === 'openrouter' && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="or-model" className="dark:text-white">Modelo OpenRouter</Label>
                        <Select
                          value={openrouterSelectValue}
                          onValueChange={(value) => {
                            if (value === '__custom__') {
                              const fallback = openrouterCustomModel || '';
                              setProjectsOpenRouterModel(fallback);
                              return;
                            }
                            setProjectsOpenRouterModel(value);
                            setOpenrouterCustomModel('');
                          }}
                        >
                          <SelectTrigger id="or-model" className="dark:bg-gray-700 dark:text-white dark:border-gray-600">
                            <SelectValue placeholder="Selecione um modelo OpenRouter" />
                          </SelectTrigger>
                          <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                            {openrouterModelOptions.map((modelId) => (
                              <SelectItem key={modelId} value={modelId} className="dark:text-white dark:hover:bg-gray-600">
                                {modelId}
                              </SelectItem>
                            ))}
                            <SelectItem value="__custom__" className="dark:text-white dark:hover:bg-gray-600">
                              Personalizado (digitar)
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        {openrouterSelectValue === '__custom__' && (
                          <Input
                            value={openrouterCustomModel}
                            onChange={(e) => {
                              const v = e.target.value;
                              setOpenrouterCustomModel(v);
                              setProjectsOpenRouterModel(v.trim());
                            }}
                            placeholder="openai/gpt-4o-mini"
                            className="dark:bg-gray-700 dark:text-white dark:border-gray-600"
                          />
                        )}
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Selecione um modelo da lista liberada para Projeto. Use "Personalizado" para digitar um ID específico.
                        </p>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        A chave do OpenRouter fica no cartão acima. Salvar esta configuração não troca a chave.
                      </p>
                    </>
                  )}
                  <Button
                    type="button"
                    className="w-full"
                    onClick={handleSaveProjectsAiSettings}
                    disabled={isSavingProjectsAi}
                  >
                    {isSavingProjectsAi ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Salvar configuração de IA (campanhas)
                  </Button>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    A chave salva no cartão OpenRouter já vale para o Assistente. Não cole a chave em arquivo do servidor.
                  </p>
                </CardContent>
              </Card>
          </div>
        )}

        {activeTab === 'equipe' && isSuperAdmin && (
            <Card className="planeje-settings-equipe-card dark:bg-gray-800 dark:border-gray-700 flex flex-col">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Users className="h-8 w-8 text-blue-600" />
                    <div>
                      <CardTitle className="text-xl dark:text-white">Gerenciamento de Usuários</CardTitle>
                      <CardDescription className="dark:text-gray-400">Adicione e gerencie os usuários internos do sistema.</CardDescription>
                      <div className="planeje-settings-equipe-stats">
                        <span className="planeje-settings-equipe-stat">{teamStats.total} na equipe</span>
                        <span className="planeje-settings-equipe-stat">{teamStats.admins} admin</span>
                        <span className="planeje-settings-equipe-stat">{teamStats.colaboradores} colaboradores</span>
                      </div>
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
                                    <DialogDescription className="dark:text-gray-400">Convide uma pessoa pelo e-mail. O link vale por 7 dias e só pode ser usado uma vez.</DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="link-email">E-mail da pessoa convidada</Label>
                                        <Input id="link-email" type="email" value={linkEmail} onChange={e => setLinkEmail(e.target.value)} autoComplete="email" />
                                    </div>
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


                    </div>
                </div>
              </CardHeader>
              <CardContent className="planeje-settings-equipe-grid flex-1">
                <section className="planeje-settings-equipe-section">
                <Label className="dark:text-white">Usuários internos</Label>
                <div className="planeje-settings-equipe-list">
                  {users.length > 0 ? (
                    users.map(u => (
                      <div key={u.id} className="planeje-settings-equipe-row">
                        <div className="planeje-settings-equipe-row-main">
                            <Avatar className="h-9 w-9">
                                <AvatarImage src={u.avatar_url} />
                                <AvatarFallback className="dark:bg-gray-700 dark:text-white">{u.full_name ? u.full_name.charAt(0).toUpperCase() : '?'}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium dark:text-white truncate">{u.full_name || 'Novo Usuário'}</p>
                                <Badge variant="outline" className={cn('shrink-0', u.status === 'active' ? 'bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200' : u.status === 'pending' ? 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200' : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200')}>{teamProfileStatusLabel(u.status)}</Badge>
                              </div>
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                {ROLE_LABELS[u.role] || u.role}
                              </p>
                            </div>
                        </div>
                        <div className="planeje-settings-equipe-row-actions">
                          <Button type="button" variant="ghost" size="icon" aria-label={`Editar cadastro de ${u.full_name || 'Novo Usuário'}`} title="Editar cadastro" onClick={() => handleOpenEditDialog(u)} disabled={u.id === user.id} className="dark:text-gray-300 dark:hover:bg-gray-700">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteUser(u)}
                            disabled={!canDeleteUser(u)}
                            title={
                              u.id === user?.id
                                ? 'Você não pode excluir a si mesmo'
                                : u.role === 'superadmin'
                                  ? 'Superadmin não pode ser excluído aqui'
                                  : 'Excluir usuário'
                            }
                            className="dark:text-red-400 dark:hover:bg-gray-700 disabled:opacity-30"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="p-4 text-sm text-gray-500 dark:text-gray-400">Nenhum usuário encontrado.</p>
                  )}
                </div>
                </section>

                <section className="planeje-settings-equipe-section">
                    <Label className="dark:text-white">Links de convite ativos</Label>
                    <div className="planeje-settings-equipe-list">
                    {inviteLinks.length > 0 ? (
                        inviteLinks.map(link => (
                        <div key={link.id} className="planeje-settings-equipe-row">
                            <div className="min-w-0">
                            <p className="font-medium text-sm dark:text-white">
                                {link.recipient_email} · <span className="font-bold">{ROLE_LABELS[link.role] || link.role}</span>
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                Válido até {new Date(link.expires_at).toLocaleDateString('pt-BR')}
                            </p>
                            </div>
                            <div className="planeje-settings-equipe-row-actions">
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
                </section>

              </CardContent>
            </Card>
        )}
      </div>

      {isSuperAdmin && (
          <Dialog open={isEditDialogOpen} onOpenChange={handleEditDialogOpenChange}>
            <DialogContent
              className="dark:bg-gray-800 dark:border-gray-700"
              onInteractOutside={event => { if (savingTeamProfileRef.current) event.preventDefault(); }}
              onEscapeKeyDown={event => { if (savingTeamProfileRef.current) event.preventDefault(); }}
            >
              <DialogHeader>
                <DialogTitle className="dark:text-white">Editar cadastro</DialogTitle>
                <DialogDescription className="dark:text-gray-400">Cadastro de {selectedUser?.full_name || 'usuário'}.</DialogDescription>
              </DialogHeader>
              <div className="py-4 space-y-4">
                <div>
                  <Label htmlFor="edit-role" className="dark:text-white">Permissão</Label>
                  <Select value={editRole} onValueChange={setEditRole} disabled={isSavingTeamProfile}>
                    <SelectTrigger id="edit-role" className="dark:bg-gray-700 dark:text-white dark:border-gray-600"><SelectValue placeholder="Selecione a permissão" /></SelectTrigger>
                    <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                      <SelectItem value="superadmin" className="dark:text-white dark:hover:bg-gray-600">Super Admin</SelectItem>
                      <SelectItem value="admin" className="dark:text-white dark:hover:bg-gray-600">Admin</SelectItem>
                      <SelectItem value="colaborador" className="dark:text-white dark:hover:bg-gray-600">Colaborador</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    <Label htmlFor="edit-profile-status" className="dark:text-white">Situação do cadastro</Label>
                    <Help label="Ajuda sobre a situação do cadastro">Ativo habilita o perfil nas atribuições por função e nas regras que exigem responsável ativo. Esta situação não bloqueia o login nem redistribui tarefas existentes.</Help>
                  </div>
                  <Select
                    value={TEAM_PROFILE_STATUSES.some(option => option.value === editStatus) ? editStatus : '__unchanged_status__'}
                    onValueChange={value => setEditStatus(value === '__unchanged_status__' ? selectedUser?.status : value)}
                    disabled={isSavingTeamProfile}
                  >
                    <SelectTrigger id="edit-profile-status" className="dark:bg-gray-700 dark:text-white dark:border-gray-600"><SelectValue placeholder="Não definido" /></SelectTrigger>
                    <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                      {!TEAM_PROFILE_STATUSES.some(option => option.value === selectedUser?.status) && <SelectItem value="__unchanged_status__">Não definido</SelectItem>}
                      {TEAM_PROFILE_STATUSES.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {teamProfileError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{teamProfileError}</p>}
              <DialogFooter>
                <Button type="button" variant="ghost" disabled={isSavingTeamProfile} onClick={() => handleEditDialogOpenChange(false)} className="dark:text-white dark:border-gray-600 dark:hover:bg-gray-700">Cancelar</Button>
                <Button type="button" onClick={handleUpdateTeamProfile} disabled={isSavingTeamProfile}><Save className="mr-2 h-4 w-4" />{isSavingTeamProfile ? 'Salvando…' : 'Salvar alterações'}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
      )}

      <AlertDialog open={Boolean(userToDelete)} onOpenChange={(open) => !open && !isDeletingUser && setUserToDelete(null)}>
        <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white">Excluir usuário da equipe?</AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400">
              {userToDelete
                ? `“${userToDelete.full_name || 'Usuário'}” (${ROLE_LABELS[userToDelete.role] || userToDelete.role}) perderá o acesso ao Planeje. Esta ação não pode ser desfeita.`
                : 'O usuário será removido permanentemente.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingUser} className="dark:text-white dark:border-gray-600">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeletingUser}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
              onClick={(e) => {
                e.preventDefault();
                void confirmDeleteUser();
              }}
            >
              {isDeletingUser ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              {isDeletingUser ? 'Excluindo...' : 'Excluir usuário'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
};

export default Settings;
