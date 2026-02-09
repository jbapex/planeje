import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';

const ClienteCrmSettingsContext = createContext();

export const useClienteCrmSettings = () => useContext(ClienteCrmSettingsContext);

const defaultSettings = {
  name: 'Configuração CRM',
  statuses: [
    { name: 'agendado', color: '#3b82f6' },
    { name: 'compareceu', color: '#f97316' },
    { name: 'vendeu', color: '#22c55e' },
    { name: 'nao_compareceu', color: '#ef4444' },
  ],
  origins: ['instagram', 'facebook', 'whatsapp', 'indicacao', 'site'],
  sub_origins: {
    instagram: ['feed', 'stories', 'reels'],
    facebook: ['feed', 'stories'],
    whatsapp: [],
    indicacao: [],
    site: [],
  },
  sellers: ['Vendedor 1', 'Vendedor 2'],
  noshow_status: 'nao_compareceu',
  custom_fields_settings: {
    date_field: { is_active: true, label: 'Data de Venda' },
  },
  tags: [],
};

export const getStatusText = (status) => {
  return status ? status.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()) : 'N/A';
};

export const ClienteCrmSettingsProvider = ({ children, clienteIdOverride = null }) => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const effectiveClienteId = clienteIdOverride ?? profile?.cliente_id;

  const fetchSettings = useCallback(async () => {
    if (!effectiveClienteId) {
      setSettings(defaultSettings);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('cliente_crm_settings')
        .select('*')
        .eq('cliente_id', effectiveClienteId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const statuses = Array.isArray(data.statuses) ? data.statuses : defaultSettings.statuses;
        const origins = Array.isArray(data.origins) ? data.origins : defaultSettings.origins;
        const sub_origins = data.sub_origins && typeof data.sub_origins === 'object' ? data.sub_origins : defaultSettings.sub_origins;
        const sellers = Array.isArray(data.sellers) ? data.sellers : defaultSettings.sellers;
        const custom_fields_settings = data.custom_fields_settings && typeof data.custom_fields_settings === 'object'
          ? data.custom_fields_settings
          : defaultSettings.custom_fields_settings;
        const tags = Array.isArray(data.tags) ? data.tags : defaultSettings.tags;
        setSettings({
          ...defaultSettings,
          ...data,
          statuses,
          origins,
          sub_origins,
          sellers,
          custom_fields_settings: { ...defaultSettings.custom_fields_settings, ...custom_fields_settings },
          tags,
        });
      } else {
        setSettings({ ...defaultSettings });
      }
    } catch (err) {
      console.error('Erro ao carregar configurações CRM:', err);
      toast({ title: 'Erro ao carregar configurações', description: err.message, variant: 'destructive' });
      setSettings({ ...defaultSettings });
    } finally {
      setLoading(false);
    }
  }, [effectiveClienteId, toast]);

  useEffect(() => {
    if (profile !== undefined) {
      fetchSettings();
    } else {
      setLoading(false);
      setSettings(defaultSettings);
    }
  }, [profile, fetchSettings]);

  const updateSettings = useCallback(async (newSettings, showToast = true) => {
    if (!effectiveClienteId) {
      setSettings((prev) => ({ ...prev, ...newSettings }));
      return true;
    }
    setSaving(true);
    try {
      const toSave = { ...newSettings };
      delete toSave.id;
      delete toSave.cliente_id;
      delete toSave.created_at;
      delete toSave.updated_at;

      const { error } = await supabase
        .from('cliente_crm_settings')
        .upsert(
          {
            cliente_id: effectiveClienteId,
            ...toSave,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'cliente_id' }
        );

      if (error) throw error;
      setSettings((prev) => ({ ...prev, ...newSettings }));
      if (showToast) toast({ title: 'Configurações salvas', description: 'As configurações do CRM foram atualizadas.' });
      return true;
    } catch (err) {
      if (showToast) toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
      return false;
    } finally {
      setSaving(false);
    }
  }, [effectiveClienteId, toast]);

  const value = {
    settings: settings ?? defaultSettings,
    loading,
    saving,
    fetchSettings,
    updateSettings,
    getStatusText,
    effectiveClienteId,
  };

  return (
    <ClienteCrmSettingsContext.Provider value={value}>
      {children}
    </ClienteCrmSettingsContext.Provider>
  );
};
