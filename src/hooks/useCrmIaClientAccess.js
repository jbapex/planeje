import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { clientHasPageAccess } from '@/lib/clientAllowedPages';

export function useCrmIaClientAccess() {
  const { profile } = useAuth();
  const [revision, setRevision] = useState(0);
  const [read, setRead] = useState(null);
  const scope = JSON.stringify([profile?.id, profile?.cliente_id, profile?.status, profile?.allowed_pages]);
  const eligible = profile?.role === 'cliente' && profile.status === 'active' && Boolean(profile.cliente_id) && clientHasPageAccess(profile, 'crm-ia');
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    let active = true;
    if (!eligible) return undefined;
    setRead(previous => previous?.scope === scope ? previous : null);
    supabase.rpc('crm_ia_client_access').then(({ data, error }) => {
      if (!active) return;
      if (error) setRead(previous => ({ ...previous, scope, enabled: previous?.scope === scope && previous.enabled === true, error: 'Não foi possível atualizar a conferência do acesso.' }));
      else setRead({ scope, enabled: data?.enabled === true && data.client_id === profile.cliente_id, nivel: data?.nivel, revision: data?.revision, error: '' });
    }).catch(() => { if (active) setRead(previous => ({ ...previous, scope, enabled: previous?.scope === scope && previous.enabled === true, error: 'Não foi possível atualizar a conferência do acesso.' })); });
    return () => { active = false; };
  }, [scope, eligible, revision, profile?.cliente_id]);
  useEffect(() => {
    if (!eligible) return undefined;
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', visible);
    const timer = setInterval(visible, 30000);
    return () => { document.removeEventListener('visibilitychange', visible); clearInterval(timer); };
  }, [eligible, refresh]);
  const current = eligible && read?.scope === scope ? read : null;
  return { enabled: current?.enabled === true, loading: eligible && !current, error: current?.error || '', nivel: current?.nivel,
    revision: current?.revision, clientId: profile?.cliente_id, refresh };
}
