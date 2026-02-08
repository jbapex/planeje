import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';

/**
 * Hook para config WhatsApp (uazapi) por cliente.
 * Suporta múltiplos canais (várias APIs) por cliente.
 * - configs: lista de configs (canais)
 * - config: primeiro canal (retrocompatibilidade)
 * - saveConfig(subdomain, token, { configId?, name? }), addConfig(subdomain, token, name?), deleteConfig(configId)
 */
export function useClienteWhatsAppConfig() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedClienteId, setSelectedClienteId] = useState(null);
  const [clientesForAdmin, setClientesForAdmin] = useState([]);

  const isAdminWithoutCliente =
    profile?.role && ['superadmin', 'admin', 'colaborador'].includes(profile.role) && !profile?.cliente_id;

  const effectiveClienteId = isAdminWithoutCliente ? selectedClienteId : profile?.cliente_id;

  /** Primeiro config (retrocompatibilidade para páginas que usam um só) */
  const config = configs?.[0] ?? null;

  const fetchClientesForAdmin = useCallback(async () => {
    if (!isAdminWithoutCliente) return;
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('cliente_id')
      .eq('role', 'cliente')
      .not('cliente_id', 'is', null);
    const ids = [...new Set((profilesData || []).map((p) => p.cliente_id).filter(Boolean))];
    if (ids.length === 0) {
      setClientesForAdmin([]);
      return;
    }
    const { data: clientes } = await supabase.from('clientes').select('id, empresa').in('id', ids).order('empresa');
    setClientesForAdmin(clientes || []);
    if (clientes?.length && !selectedClienteId) setSelectedClienteId(clientes[0].id);
  }, [isAdminWithoutCliente, selectedClienteId]);

  useEffect(() => {
    fetchClientesForAdmin();
  }, [fetchClientesForAdmin]);

  const fetchConfig = useCallback(async () => {
    if (!effectiveClienteId) {
      setConfigs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('cliente_whatsapp_config')
      .select('*')
      .eq('cliente_id', effectiveClienteId)
      .order('created_at', { ascending: true });
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao carregar canais', description: error.message });
      setConfigs([]);
    } else {
      setConfigs(data || []);
    }
    setLoading(false);
  }, [effectiveClienteId, toast]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  /** Salva/atualiza um canal. configId: atualiza esse; sem configId e com configs: atualiza o primeiro; sem configId e sem configs: insere. */
  const saveConfig = useCallback(
    async (subdomain, token, options = {}) => {
      if (!effectiveClienteId) {
        toast({ variant: 'destructive', title: 'Selecione um cliente' });
        return { success: false };
      }
      const sub = (subdomain || '').trim();
      const tok = (token || '').trim();
      if (!sub || !tok) {
        toast({ variant: 'destructive', title: 'Subdomínio e token são obrigatórios' });
        return { success: false };
      }
      setSaving(true);
      const { configId, name } = options;
      let error;
      if (configId) {
        const res = await supabase
          .from('cliente_whatsapp_config')
          .update({
            subdomain: sub,
            token: tok,
            name: (name || '').trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', configId)
          .eq('cliente_id', effectiveClienteId);
        error = res.error;
      } else if (configs.length > 0) {
        const res = await supabase
          .from('cliente_whatsapp_config')
          .update({
            subdomain: sub,
            token: tok,
            name: (name || '').trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', configs[0].id);
        error = res.error;
      } else {
        const res = await supabase.from('cliente_whatsapp_config').insert({
          cliente_id: effectiveClienteId,
          provider: 'uazapi',
          subdomain: sub,
          token: tok,
          name: (name || '').trim() || null,
        });
        error = res.error;
      }
      setSaving(false);
      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao salvar', description: error.message });
        return { success: false };
      }
      toast({ title: 'Configuração salva' });
      await fetchConfig();
      return { success: true };
    },
    [effectiveClienteId, configs, fetchConfig, toast]
  );

  /** Adiciona um novo canal (nova API). */
  const addConfig = useCallback(
    async (subdomain, token, name) => {
      if (!effectiveClienteId) {
        toast({ variant: 'destructive', title: 'Selecione um cliente' });
        return { success: false, id: null };
      }
      const sub = (subdomain || '').trim();
      const tok = (token || '').trim();
      if (!sub || !tok) {
        toast({ variant: 'destructive', title: 'Subdomínio e token são obrigatórios' });
        return { success: false, id: null };
      }
      setSaving(true);
      const { data, error } = await supabase
        .from('cliente_whatsapp_config')
        .insert({
          cliente_id: effectiveClienteId,
          provider: 'uazapi',
          subdomain: sub,
          token: tok,
          name: (name || '').trim() || null,
        })
        .select('id')
        .single();
      setSaving(false);
      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao adicionar canal', description: error.message });
        return { success: false, id: null };
      }
      toast({ title: 'Canal adicionado' });
      await fetchConfig();
      return { success: true, id: data?.id };
    },
    [effectiveClienteId, fetchConfig, toast]
  );

  /** Remove um canal. */
  const deleteConfig = useCallback(
    async (configId) => {
      if (!effectiveClienteId || !configId) return false;
      const { error } = await supabase
        .from('cliente_whatsapp_config')
        .delete()
        .eq('id', configId)
        .eq('cliente_id', effectiveClienteId);
      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao remover canal', description: error.message });
        return false;
      }
      toast({ title: 'Canal removido' });
      await fetchConfig();
      return true;
    },
    [effectiveClienteId, fetchConfig, toast]
  );

  const updateInstanceStatus = useCallback(
    async (status, configId) => {
      if (!effectiveClienteId) return;
      const id = configId ?? configs?.[0]?.id;
      if (!id) return;
      await supabase
        .from('cliente_whatsapp_config')
        .update({ instance_status: status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('cliente_id', effectiveClienteId);
      setConfigs((prev) =>
        prev.map((c) => (c.id === id ? { ...c, instance_status: status } : c))
      );
    },
    [effectiveClienteId, configs]
  );

  const generateWebhookSecret = useCallback(
    async (configId) => {
      if (!effectiveClienteId) {
        toast({ variant: 'destructive', title: 'Selecione um cliente' });
        return null;
      }
      const id = configId ?? configs?.[0]?.id;
      if (!id) {
        toast({ variant: 'destructive', title: 'Adicione um canal primeiro' });
        return null;
      }
      const secret = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 15)}`;
      const { error } = await supabase
        .from('cliente_whatsapp_config')
        .update({ webhook_secret: secret, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('cliente_id', effectiveClienteId);
      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao gerar secret', description: error.message });
        return null;
      }
      await fetchConfig();
      return secret;
    },
    [effectiveClienteId, configs, fetchConfig, toast]
  );

  const setUseSse = useCallback(
    async (useSse, configId) => {
      if (!effectiveClienteId) return;
      const id = configId ?? configs?.[0]?.id;
      if (!id) return;
      const { error } = await supabase
        .from('cliente_whatsapp_config')
        .update({ use_sse: !!useSse, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('cliente_id', effectiveClienteId);
      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao salvar', description: error.message });
        return;
      }
      setConfigs((prev) => prev.map((c) => (c.id === id ? { ...c, use_sse: !!useSse } : c)));
    },
    [effectiveClienteId, configs, toast]
  );

  const updateApicebotApi = useCallback(
    async (apiUrl, token, configId) => {
      if (!effectiveClienteId) {
        toast({ variant: 'destructive', title: 'Selecione um cliente' });
        return false;
      }
      const id = configId ?? configs?.[0]?.id;
      if (!id) {
        toast({ variant: 'destructive', title: 'Adicione um canal primeiro' });
        return false;
      }
      setSaving(true);
      const apiUrlVal = (apiUrl || '').trim() || null;
      const tokenVal = (token || '').trim() || null;
      const { error } = await supabase
        .from('cliente_whatsapp_config')
        .update({ apicebot_api_url: apiUrlVal, apicebot_token: tokenVal, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('cliente_id', effectiveClienteId);
      setSaving(false);
      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao salvar API Apicebot', description: error.message });
        return false;
      }
      await fetchConfig();
      toast({ title: 'API Apicebot salva' });
      return true;
    },
    [effectiveClienteId, configs, fetchConfig, toast]
  );

  return {
    effectiveClienteId,
    config,
    configs,
    loading,
    saving,
    saveConfig,
    addConfig,
    deleteConfig,
    fetchConfig,
    updateInstanceStatus,
    generateWebhookSecret,
    setUseSse,
    updateApicebotApi,
    isAdminWithoutCliente,
    selectedClienteId,
    setSelectedClienteId,
    clientesForAdmin,
  };
}
