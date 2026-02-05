import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';

/**
 * Hook para config WhatsApp (uazapi) por cliente.
 * - effectiveClienteId: profile.cliente_id ou selectedClienteId (admin sem cliente)
 * - config: { subdomain, token, instance_status, ... }
 * - saveConfig(subdomain, token), fetchConfig(), listClientesForAdmin
 */
export function useClienteWhatsAppConfig() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedClienteId, setSelectedClienteId] = useState(null);
  const [clientesForAdmin, setClientesForAdmin] = useState([]);

  const isAdminWithoutCliente =
    profile?.role && ['superadmin', 'admin', 'colaborador'].includes(profile.role) && !profile?.cliente_id;

  const effectiveClienteId = isAdminWithoutCliente ? selectedClienteId : profile?.cliente_id;

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
      setConfig(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('cliente_whatsapp_config')
      .select('*')
      .eq('cliente_id', effectiveClienteId)
      .maybeSingle();
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao carregar config', description: error.message });
      setConfig(null);
    } else {
      setConfig(data || null);
    }
    setLoading(false);
  }, [effectiveClienteId, toast]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const saveConfig = useCallback(
    async (subdomain, token) => {
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
      const { error } = await supabase.from('cliente_whatsapp_config').upsert(
        {
          cliente_id: effectiveClienteId,
          provider: 'uazapi',
          subdomain: sub,
          token: tok,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'cliente_id' }
      );
      setSaving(false);
      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao salvar', description: error.message });
        return { success: false };
      }
      toast({ title: 'Configuração salva' });
      await fetchConfig();
      return { success: true };
    },
    [effectiveClienteId, fetchConfig, toast]
  );

  const updateInstanceStatus = useCallback(
    async (status) => {
      if (!effectiveClienteId) return;
      await supabase
        .from('cliente_whatsapp_config')
        .update({ instance_status: status, updated_at: new Date().toISOString() })
        .eq('cliente_id', effectiveClienteId);
      setConfig((prev) => (prev ? { ...prev, instance_status: status } : null));
    },
    [effectiveClienteId]
  );

  const generateWebhookSecret = useCallback(async () => {
    if (!effectiveClienteId) {
      toast({ variant: 'destructive', title: 'Selecione um cliente' });
      return null;
    }
    const secret = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 15)}`;
    const { error } = await supabase
      .from('cliente_whatsapp_config')
      .upsert(
        {
          cliente_id: effectiveClienteId,
          provider: 'uazapi',
          webhook_secret: secret,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'cliente_id' }
      );
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao gerar secret', description: error.message });
      return null;
    }
    await fetchConfig();
    return secret;
  }, [effectiveClienteId, fetchConfig, toast]);

  const setUseSse = useCallback(
    async (useSse) => {
      if (!effectiveClienteId) return;
      const { error } = await supabase
        .from('cliente_whatsapp_config')
        .update({ use_sse: !!useSse, updated_at: new Date().toISOString() })
        .eq('cliente_id', effectiveClienteId);
      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao salvar', description: error.message });
        return;
      }
      setConfig((prev) => (prev ? { ...prev, use_sse: !!useSse } : null));
    },
    [effectiveClienteId, toast]
  );

  return {
    effectiveClienteId,
    config,
    loading,
    saving,
    saveConfig,
    fetchConfig,
    updateInstanceStatus,
    generateWebhookSecret,
    setUseSse,
    isAdminWithoutCliente,
    selectedClienteId,
    setSelectedClienteId,
    clientesForAdmin,
  };
}
